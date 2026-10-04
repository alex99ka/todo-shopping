import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import {
  addDoc,
  arrayRemove,
  collection,
  deleteDoc,
  deleteField,
  doc,
  FieldPath,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { withTestEnv } from '../helpers/emulator.ts';

const OWNER = 'owner-uid';

test('the TodoListService payloads and queries are allowed end to end', async () => {
  await withTestEnv(async (env) => {
    const db = env.authenticatedContext(OWNER).firestore();

    const created = await addDoc(collection(db, 'lists'), {
      ownerUid: OWNER,
      name: 'Groceries',
      date: Date.now(),
      createdAt: serverTimestamp(),
      memberUids: [OWNER],
      joinedAt: { [OWNER]: serverTimestamp() },
      householdId: null,
      householdCreatedAt: null,
    });

    const mine = await getDocs(
      query(collection(db, 'lists'), where('memberUids', 'array-contains', OWNER)),
    );
    assert.equal(mine.size, 1);

    const createdAt = (await getDoc(doc(db, 'lists', created.id))).get('createdAt');
    assert.ok(createdAt instanceof Timestamp);

    const itemId = doc(collection(db, 'lists', created.id, 'items')).id;
    const itemDate = Date.now();
    await setDoc(doc(db, 'lists', created.id, 'items', itemId), {
      name: 'Milk',
      state: false,
      description: '',
      date: itemDate,
      listCreatedAt: createdAt,
      category: 'Other',
      by: OWNER,
    });

    const items = await getDocs(
      query(
        collection(db, 'lists', created.id, 'items'),
        where('listCreatedAt', '==', createdAt),
      ),
    );
    assert.equal(items.size, 1);

    await updateDoc(doc(db, 'lists', created.id), { name: 'Fruit' });
    await updateDoc(doc(db, 'lists', created.id), { householdId: null, householdCreatedAt: null });
    await updateDoc(doc(db, 'lists', created.id, 'items', itemId), {
      name: 'Oat milk',
      state: true,
      description: '',
      date: itemDate, // edits keep the creation date (the rules require it)
    });
    await deleteDoc(doc(db, 'lists', created.id, 'items', itemId));
    await deleteDoc(doc(db, 'lists', created.id));
  });
});

test('household lists: createList, the per-household query and setHousehold are allowed', async () => {
  await withTestEnv(async (env) => {
    const db = env.authenticatedContext(OWNER).firestore();
    // HouseholdService.create's payload.
    const created = await addDoc(collection(db, 'households'), {
      ownerUid: OWNER,
      name: 'Home',
      date: Date.now(),
      createdAt: serverTimestamp(),
      memberUids: [OWNER],
      joinedAt: { [OWNER]: serverTimestamp() },
    });
    const h = { id: created.id, createdAt: (await getDoc(created)).get('createdAt') };

    const list = await addDoc(collection(db, 'lists'), {
      ownerUid: OWNER,
      name: 'Groceries',
      date: Date.now(),
      createdAt: serverTimestamp(),
      memberUids: [OWNER],
      joinedAt: { [OWNER]: serverTimestamp() },
      householdId: h.id,
      householdCreatedAt: h.createdAt,
    });
    const filed = () =>
      getDocs(
        query(
          collection(db, 'lists'),
          where('householdId', '==', h.id),
          where('householdCreatedAt', '==', h.createdAt),
        ),
      );
    assert.equal((await filed()).size, 1);

    await updateDoc(list, { householdId: null, householdCreatedAt: null });
    assert.equal((await filed()).size, 0);
    await updateDoc(list, { householdId: h.id, householdCreatedAt: h.createdAt });
    assert.equal((await filed()).size, 1);
    await updateDoc(list, { name: 'Fruit' });
  });
});

test('editing an item deleted elsewhere fails instead of recreating it', async () => {
  await withTestEnv(async (env) => {
    const db = env.authenticatedContext(OWNER).firestore();
    const created = await addDoc(collection(db, 'lists'), {
      ownerUid: OWNER,
      name: 'n',
      date: 1,
      createdAt: serverTimestamp(),
      memberUids: [OWNER],
      joinedAt: { [OWNER]: serverTimestamp() },
    });
    const createdAt = (await getDoc(doc(db, 'lists', created.id))).get('createdAt');
    const itemRef = doc(db, 'lists', created.id, 'items', 'gone');
    await setDoc(itemRef, {
      name: 'x',
      state: false,
      description: '',
      date: 1,
      listCreatedAt: createdAt,
      by: OWNER,
    });
    await deleteDoc(itemRef);

    await assert.rejects(
      updateDoc(itemRef, { name: 'stale edit', state: false, description: '', date: 2 }),
    );
    await env.withSecurityRulesDisabled(async (ctx) => {
      const snapshot = await getDoc(doc(ctx.firestore(), 'lists', created.id, 'items', 'gone'));
      assert.equal(snapshot.exists(), false);
    });
  });
});

test('a member whose uid contains dots can leave through a FieldPath', async () => {
  await withTestEnv(async (env) => {
    const dotted = 'member.with.dots';
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'lists/L'), {
        ownerUid: OWNER,
        name: 'n',
        date: 1,
        createdAt: Timestamp.fromMillis(1000),
        memberUids: [OWNER, dotted],
        joinedAt: { [OWNER]: Timestamp.fromMillis(1000), [dotted]: Timestamp.fromMillis(2000) },
      });
    });
    const db = env.authenticatedContext(dotted).firestore();

    await assertFails(
      updateDoc(doc(db, 'lists/L'), {
        memberUids: arrayRemove(dotted),
        [`joinedAt.${dotted}`]: deleteField(),
      }),
    );
    await assertSucceeds(
      updateDoc(
        doc(db, 'lists/L'),
        'memberUids',
        arrayRemove(dotted),
        new FieldPath('joinedAt', dotted),
        deleteField(),
      ),
    );
  });
});
