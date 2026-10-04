import { Injectable, inject } from '@angular/core';
import {
  addDoc,
  arrayRemove,
  collection,
  deleteDoc,
  deleteField,
  doc,
  FieldPath,
  type Firestore,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { collectionData } from 'rxfire/firestore';
import { Observable, of } from 'rxjs';
import { Household } from '../models';
import { AuthService } from './auth.service';
import { FIRESTORE } from './firebase.providers';

/** A household shares every list filed under it with all of its members. */
@Injectable({ providedIn: 'root' })
export class HouseholdService {
  private readonly db = inject(FIRESTORE);
  private readonly auth = inject(AuthService);

  households$(): Observable<Household[]> {
    const uid = this.auth.uid;
    if (!uid) {
      return of([]);
    }
    return collectionData(
      query(collection(this.db, 'households'), where('memberUids', 'array-contains', uid)),
      { idField: 'id' },
    ) as Observable<Household[]>;
  }

  async create(name: string): Promise<string> {
    const uid = this.auth.uid;
    if (!uid) {
      throw new Error('No signed-in user');
    }
    const created = await addDoc(collection(this.db, 'households'), {
      ownerUid: uid,
      name,
      date: Date.now(),
      createdAt: serverTimestamp(),
      memberUids: [uid],
      joinedAt: { [uid]: serverTimestamp() },
    });
    return created.id;
  }

  rename(id: string, name: string): Promise<void> {
    return updateDoc(doc(this.db, 'households', id), { name });
  }

  // Lists filed under a deleted household stay with their own members.
  delete(id: string): Promise<void> {
    return deleteDoc(doc(this.db, 'households', id));
  }

  // Your own lists filed under the household go with you: otherwise the people
  // you left would keep reading them, and you would see them as private.
  async leave(id: string): Promise<void> {
    const uid = this.auth.uid;
    const mine = await getDocs(
      query(collection(this.db, 'lists'), where('memberUids', 'array-contains', uid)),
    );
    await Promise.all(
      mine.docs
        .filter((d) => d.get('ownerUid') === uid && d.get('householdId') === id)
        .map((d) => updateDoc(d.ref, { householdId: null, householdCreatedAt: null })),
    );
    return leave(this.db, uid, 'households', id);
  }
}

/** Shared by lists and households: drop only yourself from memberUids/joinedAt. */
export function leave(
  db: Firestore,
  uid: string | null,
  collectionName: 'lists' | 'households',
  id: string,
): Promise<void> {
  if (!uid) {
    return Promise.reject(new Error('No signed-in user'));
  }
  // A FieldPath keeps the uid one literal segment; a dotted string would split a
  // uid containing dots into nested fields and the rule would reject the write.
  return updateDoc(
    doc(db, collectionName, id),
    'memberUids',
    arrayRemove(uid),
    new FieldPath('joinedAt', uid),
    deleteField(),
  );
}
