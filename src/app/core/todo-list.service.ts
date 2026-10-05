import { Injectable, inject } from '@angular/core';
import {
  collection,
  deleteDoc,
  doc,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { collectionData, docData } from 'rxfire/firestore';
import { Observable, catchError, combineLatest, map, of, retry, switchMap } from 'rxjs';
import { Household, Item, ItemChanges, ListKind, TodoList } from '../models';
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
      batch.set(this.itemRef(listId, id), { ...item, by: this.auth.uid });
    }
    return batch.commit();
  }

  setItemsState(listId: string, items: Item[], state: boolean): Promise<void> {
    const batch = writeBatch(this.db);
    items.forEach((i) => batch.update(this.itemRef(listId, i.id), { state }));
    return batch.commit();
  }

  private itemRef(listId: string, itemId: string) {
    return doc(this.db, 'lists', listId, 'items', itemId);
  }
}
