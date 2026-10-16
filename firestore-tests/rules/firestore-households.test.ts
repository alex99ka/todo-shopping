import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  assertFails,
  assertSucceeds,
  type RulesTestContext,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
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

type Firestore = ReturnType<RulesTestContext['firestore']>;

const OWNER = 'owner-uid';
// In the household, but not in the list's own memberUids.
const HOUSEMATE = 'housemate-uid';
const STRANGER = 'stranger-uid';
const T0 = Timestamp.fromMillis(1000);
const T1 = Timestamp.fromMillis(2000);

// TodoListService.setHousehold's payload, filing under 'home' (createdAt T0) or nowhere.
const HOME = { householdId: 'home', householdCreatedAt: T0 };
const NONE = { householdId: null, householdCreatedAt: null };

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
    await setDoc(doc(db, 'households/home'), {
      ownerUid: OWNER,
      name: 'Home',
      date: 1000,
      createdAt: T0,
      memberUids: [OWNER, HOUSEMATE],
      joinedAt: { [OWNER]: T0, [HOUSEMATE]: T1 },
    });
    await setDoc(doc(db, 'households/elsewhere'), {
      ownerUid: STRANGER,
      name: 'Elsewhere',
      date: 1000,
      createdAt: T0,
      memberUids: [STRANGER],
      joinedAt: { [STRANGER]: T0 },
    });
    await setDoc(doc(db, 'lists/list-1'), {
      ownerUid: OWNER,
      name: 'Shopping',
      date: 1000,
      createdAt: T0,
      memberUids: [OWNER],
      joinedAt: { [OWNER]: T0 },
      ...HOME,
    });
    await setDoc(doc(db, 'lists/list-1/items/item-1'), ITEM);
  });
}

function newGroup(uid: string) {
  return {
    ownerUid: uid,
    name: 'Home',
    date: 1000,
    createdAt: serverTimestamp(),
    memberUids: [uid],
    joinedAt: { [uid]: serverTimestamp() },
  };
}

// The exact query TodoListService.lists$ runs per household.
function householdLists(db: Firestore, hid: string, createdAt: Timestamp) {
  return getDocs(
    query(
      collection(db, 'lists'),
      where('householdId', '==', hid),
      where('householdCreatedAt', '==', createdAt),
    ),
  );
}

test('a housemate runs the household lists query and reads the list', async () => {
  await withTestEnv(async (env) => {
    await seed(env);
    const db = env.authenticatedContext(HOUSEMATE).firestore();
    await assertSucceeds(householdLists(db, 'home', T0));
    await assertSucceeds(getDoc(doc(db, 'lists/list-1')));
  });
});

test('the household lists query without the householdCreatedAt filter is denied', async () => {
  await withTestEnv(async (env) => {
    await seed(env);
    const db = env.authenticatedContext(HOUSEMATE).firestore();
    await assertFails(getDocs(query(collection(db, 'lists'), where('householdId', '==', 'home'))));
  });
});

test('a list whose householdCreatedAt does not match is invisible to household members', async () => {
  await withTestEnv(async (env) => {
    await seed(env);
    await env.withSecurityRulesDisabled(async (ctx) => {
      const base = {
        ownerUid: OWNER,
        name: 'Old',
        date: 1000,
        createdAt: T0,
        memberUids: [OWNER],
        joinedAt: { [OWNER]: T0 },
        householdId: 'home',
      };
      await setDoc(doc(ctx.firestore(), 'lists/stale'), { ...base, householdCreatedAt: T1 });
      // Filed before lists carried householdCreatedAt.
      await setDoc(doc(ctx.firestore(), 'lists/legacy'), base);
    });
    const db = env.authenticatedContext(HOUSEMATE).firestore();
    await assertFails(getDoc(doc(db, 'lists/stale')));
    await assertFails(getDoc(doc(db, 'lists/legacy')));
    await assertFails(householdLists(db, 'home', T1));
    const visible = await householdLists(db, 'home', T0);
    assert.deepEqual(visible.docs.map((d) => d.id), ['list-1']);
  });
});

test('a stranger cannot query or read the household lists', async () => {
  await withTestEnv(async (env) => {
    await seed(env);
    const db = env.authenticatedContext(STRANGER).firestore();
    await assertFails(householdLists(db, 'home', T0));
    await assertFails(getDoc(doc(db, 'lists/list-1')));
  });
});

test('a housemate queries, reads, adds, edits and deletes household list items', async () => {
  await withTestEnv(async (env) => {
    await seed(env);
    const db = env.authenticatedContext(HOUSEMATE).firestore();
    const items = collection(db, 'lists/list-1/items');
    await assertSucceeds(getDocs(query(items, where('listCreatedAt', '==', T0))));
    await assertSucceeds(getDoc(doc(items, 'item-1')));
    await assertSucceeds(setDoc(doc(items, 'item-2'), { ...ITEM, name: 'Eggs', by: HOUSEMATE }));
    await assertSucceeds(updateDoc(doc(items, 'item-1'), { state: true }));
    await assertSucceeds(deleteDoc(doc(items, 'item-1')));
  });
});

test('a stranger cannot touch household list items', async () => {
  await withTestEnv(async (env) => {
    await seed(env);
    const db = env.authenticatedContext(STRANGER).firestore();
    const items = collection(db, 'lists/list-1/items');
    await assertFails(getDocs(query(items, where('listCreatedAt', '==', T0))));
    await assertFails(getDoc(doc(items, 'item-1')));
    await assertFails(setDoc(doc(items, 'item-2'), { ...ITEM, by: STRANGER }));
    await assertFails(updateDoc(doc(items, 'item-1'), { state: true }));
    await assertFails(deleteDoc(doc(items, 'item-1')));
  });
});

test('a housemate cannot rename, move or delete the list', async () => {
  await withTestEnv(async (env) => {
    await seed(env);
    const db = env.authenticatedContext(HOUSEMATE).firestore();
    await assertFails(updateDoc(doc(db, 'lists/list-1'), { name: 'Mine' }));
    await assertFails(updateDoc(doc(db, 'lists/list-1'), NONE));
    await assertFails(deleteDoc(doc(db, 'lists/list-1')));
  });
});

test('a housemate cannot add themselves to the list members directly', async () => {
  await withTestEnv(async (env) => {
    await seed(env);
    const db = env.authenticatedContext(HOUSEMATE).firestore();
    await assertFails(
      updateDoc(
        doc(db, 'lists/list-1'),
        'memberUids',
        [OWNER, HOUSEMATE],
        new FieldPath('joinedAt', HOUSEMATE),
        serverTimestamp(),
      ),
    );
  });
});

test('a housemate who leaves the household loses the list', async () => {
  await withTestEnv(async (env) => {
    await seed(env);
    const db = env.authenticatedContext(HOUSEMATE).firestore();
    await assertSucceeds(
      updateDoc(
        doc(db, 'households/home'),
        'memberUids',
        arrayRemove(HOUSEMATE),
        new FieldPath('joinedAt', HOUSEMATE),
        deleteField(),
      ),
    );
    await assertFails(getDoc(doc(db, 'lists/list-1')));
    await assertFails(householdLists(db, 'home', T0));
  });
});

test('a list moved out of the household is hidden from housemates', async () => {
  await withTestEnv(async (env) => {
    await seed(env);
    const owner = env.authenticatedContext(OWNER).firestore();
    await assertSucceeds(updateDoc(doc(owner, 'lists/list-1'), NONE));
    const db = env.authenticatedContext(HOUSEMATE).firestore();
    await assertFails(getDoc(doc(db, 'lists/list-1')));
  });
});

test('the owner moves a list only into a household they belong to', async () => {
  await withTestEnv(async (env) => {
    await seed(env);
    const db = env.authenticatedContext(OWNER).firestore();
    const list = doc(db, 'lists/list-1');
    await assertFails(updateDoc(list, { householdId: 'elsewhere', householdCreatedAt: T0 }));
    await assertFails(updateDoc(list, { householdId: 'missing', householdCreatedAt: T0 }));
    await assertSucceeds(updateDoc(list, NONE));
    await assertSucceeds(updateDoc(list, HOME));
    // The household's createdAt must ride along, and match.
    await assertFails(updateDoc(list, { householdId: 'home', householdCreatedAt: T1 }));
    await assertFails(updateDoc(list, { householdId: 'home', householdCreatedAt: null }));
    await assertFails(updateDoc(list, { householdCreatedAt: deleteField() }));
    // Out of a household, householdCreatedAt is null or absent.
    await assertFails(updateDoc(list, { householdId: null }));
    await assertSucceeds(
      updateDoc(list, { householdId: deleteField(), householdCreatedAt: deleteField() }),
    );
    await assertSucceeds(updateDoc(list, { name: 'Food', ...HOME }));
  });
});

test('a list is created only in a household you belong to', async () => {
  await withTestEnv(async (env) => {
    await seed(env);
    const housemate = env.authenticatedContext(HOUSEMATE).firestore();
    const create = (id: string, filing: Record<string, unknown>) =>
      setDoc(doc(housemate, 'lists', id), { ...newGroup(HOUSEMATE), ...filing });
    await assertSucceeds(create('list-2', HOME));
    await assertSucceeds(create('list-3', NONE));
    await assertFails(create('list-4', { householdId: 'elsewhere', householdCreatedAt: T0 }));
    await assertFails(create('list-5', { householdId: 'missing', householdCreatedAt: T0 }));
    await assertFails(create('list-6', { householdId: 'home', householdCreatedAt: T1 }));
    await assertFails(create('list-7', { householdId: 'home' }));
    await assertFails(create('list-8', { householdId: null, householdCreatedAt: T0 }));
  });
});

test('household members read it; the membership query works; strangers cannot', async () => {
  await withTestEnv(async (env) => {
    await seed(env);
    const db = env.authenticatedContext(HOUSEMATE).firestore();
    await assertSucceeds(getDoc(doc(db, 'households/home')));
    await assertSucceeds(
      getDocs(
        query(collection(db, 'households'), where('memberUids', 'array-contains', HOUSEMATE)),
      ),
    );
    await assertFails(getDocs(collection(db, 'households')));
    const stranger = env.authenticatedContext(STRANGER).firestore();
    await assertFails(getDoc(doc(stranger, 'households/home')));
  });
});

test('a household is created with only its creator', async () => {
  await withTestEnv(async (env) => {
    const db = env.authenticatedContext(OWNER).firestore();
    await assertSucceeds(addDoc(collection(db, 'households'), newGroup(OWNER)));
    await assertFails(
      setDoc(doc(db, 'households/h2'), { ...newGroup(OWNER), memberUids: [OWNER, STRANGER] }),
    );
    await assertFails(setDoc(doc(db, 'households/h3'), newGroup(STRANGER)));
    await assertFails(setDoc(doc(db, 'households/h4'), { ...newGroup(OWNER), householdId: null }));
    await assertFails(setDoc(doc(db, 'households/h5'), { ...newGroup(OWNER), createdAt: T0 }));
  });
});

test('only the owner renames or deletes the household', async () => {
  await withTestEnv(async (env) => {
    await seed(env);
    const housemate = env.authenticatedContext(HOUSEMATE).firestore();
    await assertFails(updateDoc(doc(housemate, 'households/home'), { name: 'Ours' }));
    await assertFails(updateDoc(doc(housemate, 'households/home'), { ownerUid: HOUSEMATE }));
    await assertFails(deleteDoc(doc(housemate, 'households/home')));
    const owner = env.authenticatedContext(OWNER).firestore();
    await assertFails(updateDoc(doc(owner, 'households/home'), { name: 'x'.repeat(101) }));
    await assertFails(updateDoc(doc(owner, 'households/home'), { ownerUid: HOUSEMATE }));
    await assertSucceeds(updateDoc(doc(owner, 'households/home'), { name: 'Ours' }));
    await assertSucceeds(deleteDoc(doc(owner, 'households/home')));
  });
});

test('the owner cannot leave the household, nor remove a housemate', async () => {
  await withTestEnv(async (env) => {
    await seed(env);
    const owner = env.authenticatedContext(OWNER).firestore();
    for (const uid of [OWNER, HOUSEMATE]) {
      await assertFails(
        updateDoc(
          doc(owner, 'households/home'),
          'memberUids',
          arrayRemove(uid),
          new FieldPath('joinedAt', uid),
          deleteField(),
        ),
      );
    }
  });
});

// After the owner deletes a household its lists keep householdId, and anyone who learned
// that id (any member of one of its lists can read list.householdId) can create a new
// household under it. The lists are bound to the old household's createdAt instead.
test('a recreated household id does not inherit the old household lists', async () => {
  await withTestEnv(async (env) => {
    await seed(env);
    const owner = env.authenticatedContext(OWNER).firestore();
    await assertSucceeds(deleteDoc(doc(owner, 'households/home')));
    const stranger = env.authenticatedContext(STRANGER).firestore();
    await assertSucceeds(setDoc(doc(stranger, 'households/home'), newGroup(STRANGER)));
    await assertFails(getDoc(doc(stranger, 'lists/list-1')));
    await assertFails(getDoc(doc(stranger, 'lists/list-1/items/item-1')));
    await assertFails(householdLists(stranger, 'home', T0));
    const createdAt = (await getDoc(doc(stranger, 'households/home'))).get('createdAt');
    assert.equal((await householdLists(stranger, 'home', createdAt)).size, 0);
  });
});
