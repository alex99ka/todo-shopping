import { Injectable, inject } from '@angular/core';
import {
  FieldPath,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDocsFromServer,
  increment,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { collectionData, docData } from 'rxfire/firestore';
import { Observable, catchError, combineLatest, firstValueFrom, map, of, retry, switchMap } from 'rxjs';
import {
  HistoryEntry,
  Household,
  Item,
  ItemChanges,
  ListKind,
  MemberCard,
  TodoList,
  User,
  completion,
  historyKey,
} from '../models';
import { AuthService } from './auth.service';
import { HouseholdService, leave } from './household.service';
import { FIRESTORE } from './firebase.providers';

@Injectable({ providedIn: 'root' })
export class TodoListService {
  private readonly db = inject(FIRESTORE);
  private readonly auth = inject(AuthService);
  private readonly households = inject(HouseholdService);

  /** Lists you are a member of, plus every list filed under one of your households. */
  lists$(): Observable<TodoList[]> {
    const uid = this.auth.uid;
    if (!uid) {
      return of([]);
    }
    const lists = collection(this.db, 'lists');
    const direct = collectionData(query(lists, where('memberUids', 'array-contains', uid)), {
      idField: 'id',
    }) as Observable<TodoList[]>;
    const viaHouseholds = this.households.households$().pipe(
      switchMap((households) =>
        households.length
          ? combineLatest(
              households.map(
                (h) =>
                  // One failing household (e.g. you just left it) must not blank the rest.
                  // Both filters are needed: the rules only let housemates read lists
                  // whose householdCreatedAt matches the household's.
                  (
                    collectionData(
                      query(
                        lists,
                        where('householdId', '==', h.id),
                        where('householdCreatedAt', '==', h.createdAt),
                      ),
                      { idField: 'id' },
                    ) as Observable<TodoList[]>
                  ).pipe(catchError(() => of<TodoList[]>([]))),
              ),
            )
          : of<TodoList[][]>([]),
      ),
      map((groups) => groups.flat()),
    );
    return combineLatest([direct, viaHouseholds]).pipe(
      map(([a, b]) => [...new Map([...a, ...b].map((l) => [l.id, l])).values()]),
    );
  }

  /** Asks the server, not the cache: a new device's empty cache proves nothing. */
  async hasNoListsOnServer(): Promise<boolean> {
    const uid = this.auth.uid;
    if (!uid) return false;
    const snap = await getDocsFromServer(
      query(collection(this.db, 'lists'), where('memberUids', 'array-contains', uid), limit(1)),
    );
    return snap.empty;
  }

  list$(listId: string): Observable<TodoList | null> {
    return docData(doc(this.db, 'lists', listId), { idField: 'id' }).pipe(
      map((list) => (list ? (list as TodoList) : null)),
      // Denied: a list created offline that the server has not got yet (retry), or
      // one deleted or left meanwhile (give up and show nothing).
      retry({ count: 3, delay: 2000 }),
      catchError(() => of(null)),
    );
  }

  // Rules are not filters: the items rule reads listCreatedAt, so the query must too.
  items$(listId: string, listCreatedAt: Timestamp): Observable<Item[]> {
    return collectionData(
      query(
        collection(this.db, 'lists', listId, 'items'),
        where('listCreatedAt', '==', listCreatedAt),
      ),
      { idField: 'id' },
    ) as Observable<Item[]>;
  }

  async createList(name: string, kind: ListKind, household: Household | null = null): Promise<string> {
    const uid = this.auth.uid;
    if (!uid) {
      throw new Error('No signed-in user');
    }
    const created = doc(collection(this.db, 'lists'));
    const write = setDoc(created, {
      ownerUid: uid,
      name,
      kind,
      date: Date.now(),
      createdAt: serverTimestamp(),
      memberUids: [uid],
      joinedAt: { [uid]: serverTimestamp() },
      householdId: household?.id ?? null,
      householdCreatedAt: household?.createdAt ?? null,
    });
    // Online, wait for the server: opening the list before it exists there gets the
    // read denied. Offline, a write only resolves once synced, and the local cache
    // already has the list.
    // ponytail: navigator.onLine is true on a connected-but-dead network; then this waits until it recovers.
    if (navigator.onLine) {
      await write;
    } else {
      write.catch(() => undefined);
    }
    return created.id;
  }

  /** The shopping list recipes are added to; kept in your private profile, so every device agrees. */
  recipeListId$(): Observable<string | null> {
    const uid = this.auth.uid;
    if (!uid) return of(null);
    return docData(doc(this.db, 'users', uid)).pipe(
      map((user) => (user?.['recipeListId'] as string | undefined) ?? null),
      catchError(() => of(null)),
    );
  }

  setRecipeList(listId: string): Promise<void> {
    return setDoc(doc(this.db, 'users', this.auth.uid ?? ''), { recipeListId: listId }, { merge: true });
  }

  /**
   * Moves another list of yours into this one, in one batch: its items are copied,
   * whoever could see it (members and its household) joins this list, and it is
   * deleted. The rules allow the new members only because of that delete.
   */
  async mergeList(target: TodoList, source: TodoList): Promise<void> {
    const [items, households] = await Promise.all([
      firstValueFrom(this.items$(source.id, source.createdAt)),
      firstValueFrom(this.households.households$()),
    ]);
    const house = households.find(
      (h) => h.id === source.householdId && !!source.householdCreatedAt?.isEqual(h.createdAt),
    );
    // A personal list joins the source's household; one in another household gets its people instead.
    const adopt = house && !target.householdId;
    const viewers = [...source.memberUids, ...(house && !adopt && house.id !== target.householdId ? house.memberUids : [])];
    const added = [...new Set(viewers)].filter((uid) => !target.memberUids.includes(uid));
    const batch = writeBatch(this.db);
    batch.update(
      doc(this.db, 'lists', target.id),
      'mergedFrom',
      source.id,
      ...(added.length ? ['memberUids', arrayUnion(...added)] : []),
      ...(adopt ? ['householdId', house.id, 'householdCreatedAt', house.createdAt] : []),
      // A FieldPath keeps a uid with dots one key (see leave()).
      ...added.flatMap((uid) => [new FieldPath('joinedAt', uid), serverTimestamp()]),
    );
    // Same ids in the new list: they are random, so they cannot clash.
    for (const { id, ...item } of items) {
      // doneBy may only name yourself (as in restoreItems).
      const doneBy = item.doneBy === this.auth.uid ? item.doneBy : null;
      batch.set(this.itemRef(target.id, id), {
        ...item,
        doneBy,
        listCreatedAt: target.createdAt,
        by: this.auth.uid,
      });
    }
    batch.delete(doc(this.db, 'lists', source.id));
    // shortcut: a batch caps at 500 writes, so a list of ~495 items fails; split the batch if lists get that long.
    return batch.commit();
  }

  setHousehold(listId: string, household: Household | null): Promise<void> {
    return updateDoc(doc(this.db, 'lists', listId), {
      householdId: household?.id ?? null,
      householdCreatedAt: household?.createdAt ?? null,
    });
  }

  leaveList(listId: string): Promise<void> {
    return leave(this.db, this.auth.uid, 'lists', listId);
  }

  renameList(listId: string, name: string): Promise<void> {
    return updateDoc(doc(this.db, 'lists', listId), { name });
  }

  deleteList(listId: string): Promise<void> {
    return deleteDoc(doc(this.db, 'lists', listId));
  }

  newItemId(listId: string): string {
    return doc(collection(this.db, 'lists', listId, 'items')).id;
  }

  createItem(listId: string, itemId: string, item: Omit<Item, 'id' | 'by'>): Promise<void> {
    return setDoc(doc(this.db, 'lists', listId, 'items', itemId), {
      ...item,
      by: this.auth.uid,
    });
  }

  // updateDoc, not setDoc: an edit to an item deleted elsewhere must fail.
  updateItem(listId: string, itemId: string, changes: ItemChanges): Promise<void> {
    return updateDoc(doc(this.db, 'lists', listId, 'items', itemId), { ...changes });
  }

  // Bulk edits are one batch: atomic, one round trip, and a single queued write offline.
  // ponytail: a batch caps at 500 writes; no list gets near that.

  deleteItems(listId: string, items: Item[]): Promise<void> {
    const batch = writeBatch(this.db);
    items.forEach((i) => batch.delete(this.itemRef(listId, i.id)));
    return batch.commit();
  }

  /** Undo of deleteItems: the same ids come back, added by whoever pressed undo. */
  restoreItems(listId: string, items: Item[]): Promise<void> {
    const batch = writeBatch(this.db);
    for (const { id, ...item } of items) {
      // doneBy may only name yourself, so someone else's tick comes back unattributed.
      const doneBy = item.doneBy === this.auth.uid ? item.doneBy : null;
      batch.set(this.itemRef(listId, id), { ...item, doneBy, by: this.auth.uid });
    }
    return batch.commit();
  }

  /** Each group becomes its kept item, carrying the joined amount (and a new name if given); the others are deleted. */
  joinItems(listId: string, groups: { keep: Item; name?: string; description: string; drop: Item[] }[]): Promise<void> {
    const batch = writeBatch(this.db);
    for (const { keep, name, description, drop } of groups) {
      batch.update(this.itemRef(listId, keep.id), {
        description: description.slice(0, 5000),
        ...(name && { name: name.slice(0, 500) }),
      });
      drop.forEach((i) => batch.delete(this.itemRef(listId, i.id)));
    }
    return batch.commit();
  }

  /** Tick or untick in one batch; repeating tasks move to their next deadline instead. */
  setItemsState(listId: string, items: Item[], done: boolean): Promise<void> {
    const batch = writeBatch(this.db);
    items.forEach((i) => batch.update(this.itemRef(listId, i.id), completion(i, done, this.auth.uid)));
    return batch.commit();
  }

  members$(listId: string, listCreatedAt: Timestamp): Observable<Record<string, MemberCard>> {
    return (
      collectionData(
        query(collection(this.db, 'lists', listId, 'members'), where('listCreatedAt', '==', listCreatedAt)),
        { idField: 'uid' },
      ) as Observable<MemberCard[]>
    ).pipe(
      map((cards) => Object.fromEntries(cards.map((c) => [c.uid, c]))),
      catchError(() => of({})),
    );
  }

  /** Your name and photo on this list, so housemates see who did what. */
  saveMemberCard(listId: string, listCreatedAt: Timestamp, user: User): Promise<void> {
    return setDoc(doc(this.db, 'lists', listId, 'members', user.uid), {
      name: (user.displayName || user.email.split('@')[0]).slice(0, 60),
      photo: (user.photoURL ?? '').slice(0, 500),
      listCreatedAt,
    });
  }

  // ponytail: the top 100 by count; a household's real vocabulary is far smaller.
  history$(listId: string, listCreatedAt: Timestamp): Observable<HistoryEntry[]> {
    return (
      collectionData(
        query(
          collection(this.db, 'lists', listId, 'history'),
          where('listCreatedAt', '==', listCreatedAt),
          orderBy('count', 'desc'),
          limit(100),
        ),
        { idField: 'id' },
      ) as Observable<HistoryEntry[]>
    ).pipe(catchError(() => of<HistoryEntry[]>([])));
  }

  /** Counts a name in the list's history. Not awaited by callers, so it works offline. */
  recordHistory(listId: string, listCreatedAt: Timestamp, name: string, category?: string): Promise<void> {
    return setDoc(
      doc(this.db, 'lists', listId, 'history', historyKey(name)),
      {
        name: name.trim(),
        ...(category && { category }),
        count: increment(1),
        last: Date.now(),
        listCreatedAt,
      },
      { merge: true },
    );
  }

  private itemRef(listId: string, itemId: string) {
    return doc(this.db, 'lists', listId, 'items', itemId);
  }
}
