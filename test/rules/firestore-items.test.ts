import { test } from 'node:test';
import {
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  collection,
  deleteDoc,
  deleteField,
  doc,
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
const MEMBER = 'member-uid';
const STRANGER = 'stranger-uid';
const T0 = Timestamp.fromMillis(1000);
const T1 = Timestamp.fromMillis(2000);

const ITEM = {
  name: 'Milk',
  state: false,
  description: '',
  date: 1000,
  listCreatedAt: T0,
  by: OWNER,
};

async function seed(env: RulesTestEnvironment): Promise<void> {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'lists/list-1'), {
      ownerUid: OWNER,
      name: 'Groceries',
      date: 1000,
      createdAt: T0,
      memberUids: [OWNER, MEMBER],
      joinedAt: { [OWNER]: T0, [MEMBER]: T1 },
    });
    await setDoc(doc(db, 'lists/list-1/items/item-1'), ITEM);
  });
}

test('a member reads an item', async () => {
  await withTestEnv(async (env) => {
    await seed(env);
    const db = env.authenticatedContext(MEMBER).firestore();
    await assertSucceeds(getDoc(doc(db, 'lists/list-1/items/item-1')));
  });
});

test('a member queries items filtered to the current list incarnation', async () => {
  await withTestEnv(async (env) => {
    await seed(env);
    const db = env.authenticatedContext(MEMBER).firestore();
    await assertSucceeds(
      getDocs(query(collection(db, 'lists/list-1/items'), where('listCreatedAt', '==', T0))),
    );
  });
});

test('an unfiltered items query is rejected, because rules are not filters', async () => {
  await withTestEnv(async (env) => {
    await seed(env);
    const db = env.authenticatedContext(MEMBER).firestore();
    await assertFails(getDocs(collection(db, 'lists/list-1/items')));
  });
});

test('a stranger cannot read an item', async () => {
  await withTestEnv(async (env) => {
    await seed(env);
    const db = env.authenticatedContext(STRANGER).firestore();
    await assertFails(getDoc(doc(db, 'lists/list-1/items/item-1')));
  });
});

test('the owner writes an item', async () => {
  await withTestEnv(async (env) => {
    await seed(env);
    const db = env.authenticatedContext(OWNER).firestore();
    await assertSucceeds(
      setDoc(doc(db, 'lists/list-1/items/item-2'), { ...ITEM, name: 'Eggs' }),
    );
  });
});

test('an item bound to another list incarnation cannot be written', async () => {
  await withTestEnv(async (env) => {
    await seed(env);
    const db = env.authenticatedContext(OWNER).firestore();
    await assertFails(
      setDoc(doc(db, 'lists/list-1/items/item-5'), { ...ITEM, listCreatedAt: T1 }),
    );
  });
});

test('a member writes, edits and deletes an item', async () => {
  await withTestEnv(async (env) => {
    await seed(env);
    const db = env.authenticatedContext(MEMBER).firestore();
    const ref = doc(db, 'lists/list-1/items/item-3');
    await assertSucceeds(setDoc(ref, { ...ITEM, name: 'Bread', by: MEMBER }));
    await assertSucceeds(updateDoc(doc(db, 'lists/list-1/items/item-1'), { state: true }));
    await assertSucceeds(deleteDoc(ref));
  });
});

test('a stranger cannot write an item', async () => {
  await withTestEnv(async (env) => {
    await seed(env);
    const db = env.authenticatedContext(STRANGER).firestore();
    await assertFails(
      setDoc(doc(db, 'lists/list-1/items/item-3'), { ...ITEM, by: STRANGER }),
    );
    await assertFails(updateDoc(doc(db, 'lists/list-1/items/item-1'), { state: true }));
    await assertFails(deleteDoc(doc(db, 'lists/list-1/items/item-1')));
  });
});

test('an item with every optional field is accepted', async () => {
  await withTestEnv(async (env) => {
    await seed(env);
    const db = env.authenticatedContext(OWNER).firestore();
    await assertSucceeds(
      setDoc(doc(db, 'lists/list-1/items/item-6'), {
        ...ITEM,
        photoPath: 'lists/list-1/1_0/item-6/photo.jpg',
        category: 'Dairy & Eggs',
        remindAt: 5000,
        reminded: false,
      }),
    );
    await assertSucceeds(
      updateDoc(doc(db, 'lists/list-1/items/item-6'), { remindAt: null, reminded: false }),
    );
  });
});

const BAD_ITEMS: Record<string, Record<string, unknown>> = {
  'an unknown field': { admin: true },
  'a numeric name': { name: 1 },
  'a 501 character name': { name: 'x'.repeat(501) },
  'a 5001 character description': { description: 'x'.repeat(5001) },
  'a string state': { state: 'done' },
  'a string date': { date: 'today' },
  'a numeric category': { category: 3 },
  'a 51 character category': { category: 'x'.repeat(51) },
  'a numeric photoPath': { photoPath: 3 },
  'a 301 character photoPath': { photoPath: 'x'.repeat(301) },
  'a string remindAt': { remindAt: 'soon' },
  'a string reminded': { reminded: 'no' },
};

for (const [what, extra] of Object.entries(BAD_ITEMS)) {
  test(`an item with ${what} is rejected on create and update`, async () => {
    await withTestEnv(async (env) => {
      await seed(env);
      const db = env.authenticatedContext(OWNER).firestore();
      await assertFails(setDoc(doc(db, 'lists/list-1/items/item-7'), { ...ITEM, ...extra }));
      await assertFails(updateDoc(doc(db, 'lists/list-1/items/item-1'), extra));
    });
  });
}

test('an item missing a required field is rejected', async () => {
  await withTestEnv(async (env) => {
    await seed(env);
    const db = env.authenticatedContext(OWNER).firestore();
    const { name: _name, ...withoutName } = ITEM;
    await assertFails(setDoc(doc(db, 'lists/list-1/items/item-8'), withoutName));
  });
});

test('a new item must name its creator as by', async () => {
  await withTestEnv(async (env) => {
    await seed(env);
    const db = env.authenticatedContext(MEMBER).firestore();
    const { by: _by, ...withoutBy } = ITEM;
    await assertFails(setDoc(doc(db, 'lists/list-1/items/item-9'), withoutBy));
    await assertFails(setDoc(doc(db, 'lists/list-1/items/item-9'), { ...ITEM, by: OWNER }));
    await assertSucceeds(setDoc(doc(db, 'lists/list-1/items/item-9'), { ...ITEM, by: MEMBER }));
  });
});

test('by cannot be changed or removed by an edit', async () => {
  await withTestEnv(async (env) => {
    await seed(env);
    const db = env.authenticatedContext(MEMBER).firestore();
    const ref = doc(db, 'lists/list-1/items/item-1');
    await assertFails(updateDoc(ref, { by: MEMBER }));
    await assertFails(updateDoc(ref, { by: deleteField() }));
    await assertFails(setDoc(ref, { ...ITEM, by: MEMBER }));
    await assertSucceeds(setDoc(ref, { ...ITEM, name: 'Butter' }));
  });
});

test('the owner deletes an item', async () => {
  await withTestEnv(async (env) => {
    await seed(env);
    const db = env.authenticatedContext(OWNER).firestore();
    await assertSucceeds(deleteDoc(doc(db, 'lists/list-1/items/item-1')));
  });
});

test('an item under a missing list is denied', async () => {
  await withTestEnv(async (env) => {
    const db = env.authenticatedContext(OWNER).firestore();
    await assertFails(getDoc(doc(db, 'lists/nope/items/item-1')));
  });
});

async function recreateAsStranger(env: RulesTestEnvironment): Promise<Timestamp> {
  const owner = env.authenticatedContext(OWNER).firestore();
  await assertSucceeds(deleteDoc(doc(owner, 'lists/list-1')));
  const stranger = env.authenticatedContext(STRANGER).firestore();
  await assertSucceeds(
    setDoc(doc(stranger, 'lists/list-1'), {
      ownerUid: STRANGER,
      name: 'mine now',
      date: 3000,
      createdAt: serverTimestamp(),
      memberUids: [STRANGER],
      joinedAt: { [STRANGER]: serverTimestamp() },
    }),
  );
  return (await getDoc(doc(stranger, 'lists/list-1'))).get('createdAt');
}

test('a recreated owner cannot rebind an orphaned item with a partial update', async () => {
  await withTestEnv(async (env) => {
    await seed(env);
    const newEpoch = await recreateAsStranger(env);
    const stranger = env.authenticatedContext(STRANGER).firestore();
    await assertFails(
      updateDoc(doc(stranger, 'lists/list-1/items/item-1'), { listCreatedAt: newEpoch }),
    );
  });
});

test('a recreated owner cannot overwrite an orphaned item', async () => {
  await withTestEnv(async (env) => {
    await seed(env);
    const newEpoch = await recreateAsStranger(env);
    const stranger = env.authenticatedContext(STRANGER).firestore();
    await assertFails(
      setDoc(doc(stranger, 'lists/list-1/items/item-1'), { ...ITEM, listCreatedAt: newEpoch }),
    );
  });
});

test('recreating a deleted list id does not expose its orphaned items', async () => {
  await withTestEnv(async (env) => {
    await seed(env);
    const owner = env.authenticatedContext(OWNER).firestore();
    await assertSucceeds(deleteDoc(doc(owner, 'lists/list-1')));

    const stranger = env.authenticatedContext(STRANGER).firestore();
    await assertSucceeds(
      setDoc(doc(stranger, 'lists/list-1'), {
        ownerUid: STRANGER,
        name: 'mine now',
        date: 3000,
        createdAt: serverTimestamp(),
        memberUids: [STRANGER],
        joinedAt: { [STRANGER]: serverTimestamp() },
      }),
    );
    await assertFails(getDoc(doc(stranger, 'lists/list-1/items/item-1')));
  });
});

test("an edit keeps the item's creation date", async () => {
  await withTestEnv(async (env) => {
    await seed(env);
    const db = env.authenticatedContext(MEMBER).firestore();
    const ref = doc(db, 'lists/list-1/items/item-1');
    await assertSucceeds(updateDoc(ref, { name: 'Oat milk', date: ITEM.date }));
    // A new date would make the notifier announce it again as the creator's new item.
    await assertFails(updateDoc(ref, { name: 'Call me', date: ITEM.date + 1 }));
  });
});
