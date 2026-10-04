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
  arrayUnion,
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
// In the household, not in the list's own memberUids.
const HOUSEMATE = 'housemate-uid';
const STRANGER = 'stranger-uid';
const EVE = 'eve-uid';
const T0 = Timestamp.fromMillis(1000);
const DAY = 24 * 60 * 60 * 1000;

async function seed(env: RulesTestEnvironment): Promise<void> {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    const now = Timestamp.now();
    await setDoc(doc(db, 'households/home'), {
      ownerUid: OWNER,
      name: 'Home',
      date: 1000,
      createdAt: T0,
      memberUids: [OWNER, HOUSEMATE],
      joinedAt: { [OWNER]: T0, [HOUSEMATE]: T0 },
    });
    for (const id of ['list-1', 'list-2']) {
      await setDoc(doc(db, 'lists', id), {
        ownerUid: OWNER,
        name: 'Shopping',
        date: 1000,
        createdAt: T0,
        memberUids: [OWNER],
        joinedAt: { [OWNER]: T0 },
        householdId: 'home',
        householdCreatedAt: T0,
      });
    }
    const invite = (kind: string, targetId: string, createdAt = now) => ({
      kind,
      targetId,
      targetName: 'Shopping',
      createdBy: OWNER,
      createdAt,
    });
    await setDoc(doc(db, 'invites/list-inv'), invite('list', 'list-1'));
    await setDoc(doc(db, 'invites/list2-inv'), invite('list', 'list-2'));
    await setDoc(doc(db, 'invites/home-inv'), invite('household', 'home'));
    await setDoc(
      doc(db, 'invites/old-inv'),
      invite('list', 'list-1', Timestamp.fromMillis(now.toMillis() - 8 * DAY)),
    );
  });
}

// InviteService.share's payload.
function newInvite(uid: string, kind: string, targetId: string) {
  return { kind, targetId, targetName: 'Shopping', createdBy: uid, createdAt: serverTimestamp() };
}

// InviteService.join's exact write.
function join(db: Firestore, path: string, uid: string, inviteId: string) {
  return updateDoc(
    doc(db, path),
    'memberUids',
    arrayUnion(uid),
    new FieldPath('joinedAt', uid),
    serverTimestamp(),
    new FieldPath('invites', uid),
    inviteId,
  );
}

function leave(db: Firestore, path: string, uid: string) {
  return updateDoc(
    doc(db, path),
    'memberUids',
    arrayRemove(uid),
    new FieldPath('joinedAt', uid),
    deleteField(),
  );
}

test('a list member, a housemate and a household member create invites', async () => {
  await withTestEnv(async (env) => {
    await seed(env);
    const owner = env.authenticatedContext(OWNER).firestore();
    await assertSucceeds(addDoc(collection(owner, 'invites'), newInvite(OWNER, 'list', 'list-1')));
    const housemate = env.authenticatedContext(HOUSEMATE).firestore();
    await assertSucceeds(
      addDoc(collection(housemate, 'invites'), newInvite(HOUSEMATE, 'list', 'list-1')),
    );
    await assertSucceeds(
      addDoc(collection(housemate, 'invites'), newInvite(HOUSEMATE, 'household', 'home')),
    );
  });
});

test('a stranger cannot create an invite to a list or household', async () => {
  await withTestEnv(async (env) => {
    await seed(env);
    const db = env.authenticatedContext(STRANGER).firestore();
    await assertFails(addDoc(collection(db, 'invites'), newInvite(STRANGER, 'list', 'list-1')));
    await assertFails(addDoc(collection(db, 'invites'), newInvite(STRANGER, 'household', 'home')));
    await assertFails(addDoc(collection(db, 'invites'), newInvite(STRANGER, 'list', 'missing')));
  });
});

test('an invite with a forged or malformed field is rejected', async () => {
  await withTestEnv(async (env) => {
    await seed(env);
    const db = env.authenticatedContext(OWNER).firestore();
    const invites = collection(db, 'invites');
    const ok = newInvite(OWNER, 'list', 'list-1');
    await assertFails(addDoc(invites, { ...ok, createdAt: Timestamp.now() }));
    await assertFails(addDoc(invites, { ...ok, createdBy: HOUSEMATE }));
    await assertFails(addDoc(invites, { ...ok, uses: 0 }));
    await assertFails(addDoc(invites, { ...ok, targetName: 'x'.repeat(101) }));
    await assertFails(addDoc(invites, { ...ok, kind: 'admin' }));
    // A household invite whose target is really a list id.
    await assertFails(addDoc(invites, { ...ok, kind: 'household' }));
  });
});

test('anyone signed in gets an invite by id, but nobody lists them', async () => {
  await withTestEnv(async (env) => {
    await seed(env);
    const db = env.authenticatedContext(STRANGER).firestore();
    await assertSucceeds(getDoc(doc(db, 'invites/list-inv')));
    await assertFails(getDocs(collection(db, 'invites')));
    await assertFails(getDocs(query(collection(db, 'invites'), where('targetId', '==', 'list-1'))));
    await assertFails(getDocs(query(collection(db, 'invites'), where('createdBy', '==', STRANGER))));
    const anon = env.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(anon, 'invites/list-inv')));
  });
});

test('an invite cannot be edited, and only its creator deletes it', async () => {
  await withTestEnv(async (env) => {
    await seed(env);
    const housemate = env.authenticatedContext(HOUSEMATE).firestore();
    await assertFails(deleteDoc(doc(housemate, 'invites/list-inv')));
    const owner = env.authenticatedContext(OWNER).firestore();
    await assertFails(updateDoc(doc(owner, 'invites/old-inv'), { createdAt: serverTimestamp() }));
    await assertSucceeds(deleteDoc(doc(owner, 'invites/list-inv')));
  });
});

test('a valid list invite joins the list and opens it and its items', async () => {
  await withTestEnv(async (env) => {
    await seed(env);
    const db = env.authenticatedContext(STRANGER).firestore();
    await assertSucceeds(join(db, 'lists/list-1', STRANGER, 'list-inv'));
    await assertSucceeds(getDoc(doc(db, 'lists/list-1')));
    await assertSucceeds(
      getDocs(query(collection(db, 'lists/list-1/items'), where('listCreatedAt', '==', T0))),
    );
    // A list invite is not a household invite.
    await assertFails(getDoc(doc(db, 'households/home')));
    await assertFails(getDoc(doc(db, 'lists/list-2')));
  });
});

test('a valid household invite joins the household and opens its lists', async () => {
  await withTestEnv(async (env) => {
    await seed(env);
    const db = env.authenticatedContext(STRANGER).firestore();
    await assertSucceeds(join(db, 'households/home', STRANGER, 'home-inv'));
    await assertSucceeds(
      getDocs(
        query(
          collection(db, 'lists'),
          where('householdId', '==', 'home'),
          where('householdCreatedAt', '==', T0),
        ),
      ),
    );
    await assertSucceeds(getDoc(doc(db, 'lists/list-2')));
  });
});

test('two people join through the same invite link', async () => {
  await withTestEnv(async (env) => {
    await seed(env);
    const stranger = env.authenticatedContext(STRANGER).firestore();
    await assertSucceeds(join(stranger, 'households/home', STRANGER, 'home-inv'));
    const eve = env.authenticatedContext(EVE).firestore();
    await assertSucceeds(join(eve, 'households/home', EVE, 'home-inv'));
  });
});

test('an invite older than 7 days is refused', async () => {
  await withTestEnv(async (env) => {
    await seed(env);
    const db = env.authenticatedContext(STRANGER).firestore();
    await assertFails(join(db, 'lists/list-1', STRANGER, 'old-inv'));
  });
});

test('an invite for another target or kind is refused', async () => {
  await withTestEnv(async (env) => {
    await seed(env);
    const db = env.authenticatedContext(STRANGER).firestore();
    await assertFails(join(db, 'lists/list-1', STRANGER, 'list2-inv'));
    await assertFails(join(db, 'lists/list-1', STRANGER, 'home-inv'));
    await assertFails(join(db, 'households/home', STRANGER, 'list-inv'));
    await assertFails(join(db, 'lists/list-1', STRANGER, 'no-such-invite'));
  });
});

test('a list invite minted for a list that shares the household id cannot join the household', async () => {
  await withTestEnv(async (env) => {
    await seed(env);
    const db = env.authenticatedContext(STRANGER).firestore();
    await assertSucceeds(
      setDoc(doc(db, 'lists/home'), {
        ownerUid: STRANGER,
        name: 'Bait',
        date: 1,
        createdAt: serverTimestamp(),
        memberUids: [STRANGER],
        joinedAt: { [STRANGER]: serverTimestamp() },
      }),
    );
    await assertSucceeds(setDoc(doc(db, 'invites/bait'), newInvite(STRANGER, 'list', 'home')));
    await assertFails(join(db, 'households/home', STRANGER, 'bait'));
  });
});

test('a join adds only yourself, once, and changes nothing else', async () => {
  await withTestEnv(async (env) => {
    await seed(env);
    const db = env.authenticatedContext(STRANGER).firestore();
    const list = doc(db, 'lists/list-1');
    // Someone else.
    await assertFails(join(db, 'lists/list-1', EVE, 'list-inv'));
    // Yourself plus someone else.
    await assertFails(
      updateDoc(
        list,
        'memberUids',
        arrayUnion(STRANGER, EVE),
        new FieldPath('joinedAt', STRANGER),
        serverTimestamp(),
        new FieldPath('invites', STRANGER),
        'list-inv',
      ),
    );
    // A forged join time.
    await assertFails(
      updateDoc(
        list,
        'memberUids',
        arrayUnion(STRANGER),
        new FieldPath('joinedAt', STRANGER),
        T0,
        new FieldPath('invites', STRANGER),
        'list-inv',
      ),
    );
    // An extra field riding along.
    for (const extra of [
      { name: 'Mine' },
      { ownerUid: STRANGER },
      { householdId: null },
      { householdCreatedAt: null },
    ]) {
      await assertFails(
        updateDoc(
          list,
          'memberUids',
          arrayUnion(STRANGER),
          new FieldPath('joinedAt', STRANGER),
          serverTimestamp(),
          new FieldPath('invites', STRANGER),
          'list-inv',
          ...Object.entries(extra).flat(),
        ),
      );
    }
    // The invite recorded under someone else's uid, or under yours and someone else's.
    await assertFails(
      updateDoc(
        list,
        'memberUids',
        arrayUnion(STRANGER),
        new FieldPath('joinedAt', STRANGER),
        serverTimestamp(),
        new FieldPath('invites', EVE),
        'list-inv',
      ),
    );
    await assertFails(
      updateDoc(
        list,
        'memberUids',
        arrayUnion(STRANGER),
        new FieldPath('joinedAt', STRANGER),
        serverTimestamp(),
        new FieldPath('invites', STRANGER),
        'list-inv',
        new FieldPath('invites', EVE),
        'list-inv',
      ),
    );
    // The old single `invite` field.
    await assertFails(
      updateDoc(
        list,
        'memberUids',
        arrayUnion(STRANGER),
        new FieldPath('joinedAt', STRANGER),
        serverTimestamp(),
        'invite',
        'list-inv',
      ),
    );
    // Without naming an invite.
    await assertFails(
      updateDoc(
        list,
        'memberUids',
        arrayUnion(STRANGER),
        new FieldPath('joinedAt', STRANGER),
        serverTimestamp(),
      ),
    );
  });
});

test('a member cannot join again', async () => {
  await withTestEnv(async (env) => {
    await seed(env);
    const housemate = env.authenticatedContext(HOUSEMATE).firestore();
    await assertFails(join(housemate, 'households/home', HOUSEMATE, 'home-inv'));
    const owner = env.authenticatedContext(OWNER).firestore();
    await assertFails(join(owner, 'lists/list-1', OWNER, 'list-inv'));
  });
});

// A target that kept a single `invite` (the last one used) let the next joiner in with
// only the target id. A direct member of one household list can read list.householdId,
// so that was a way into the whole household. Docs written by the old client still
// carry that field.
test('joining needs the invite id, not just the target id', async () => {
  await withTestEnv(async (env) => {
    await seed(env);
    await env.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), 'households/home'), { invite: 'home-inv' });
    });
    const eve = env.authenticatedContext(EVE).firestore();
    const bare = () =>
      updateDoc(
        doc(eve, 'households/home'),
        'memberUids',
        arrayUnion(EVE),
        new FieldPath('joinedAt', EVE),
        serverTimestamp(),
      );
    await assertFails(bare());
    const stranger = env.authenticatedContext(STRANGER).firestore();
    await assertSucceeds(join(stranger, 'households/home', STRANGER, 'home-inv'));
    await assertFails(bare());
  });
});

test('after a legitimate join, an outsider or a list member still needs their own invite', async () => {
  await withTestEnv(async (env) => {
    await seed(env);
    const stranger = env.authenticatedContext(STRANGER).firestore();
    await assertSucceeds(join(stranger, 'lists/list-1', STRANGER, 'list-inv'));
    // As a list member the stranger reads the list's householdId and invites map,
    // but a list invite does not open the household.
    const list = (await getDoc(doc(stranger, 'lists/list-1'))).data()!;
    assert.deepEqual(list.invites, { [STRANGER]: 'list-inv' });
    await assertFails(join(stranger, `households/${list.householdId}`, STRANGER, 'list-inv'));
    // Eve knows only the list id: leaving the invites alone, or claiming the
    // stranger's entry, is not an invite of her own.
    const eve = env.authenticatedContext(EVE).firestore();
    await assertFails(
      updateDoc(
        doc(eve, 'lists/list-1'),
        'memberUids',
        arrayUnion(EVE),
        new FieldPath('joinedAt', EVE),
        serverTimestamp(),
      ),
    );
    await assertFails(
      updateDoc(
        doc(eve, 'lists/list-1'),
        'memberUids',
        arrayUnion(EVE),
        new FieldPath('joinedAt', EVE),
        serverTimestamp(),
        new FieldPath('invites', STRANGER),
        'list-inv',
      ),
    );
  });
});

test('a member who left rejoins with their own still valid invite', async () => {
  await withTestEnv(async (env) => {
    await seed(env);
    const db = env.authenticatedContext(STRANGER).firestore();
    for (const path of ['lists/list-1', 'households/home']) {
      const inv = path === 'lists/list-1' ? 'list-inv' : 'home-inv';
      await assertSucceeds(join(db, path, STRANGER, inv));
      // Leaving keeps invites.<uid>, so the rejoin leaves the invites map unchanged.
      await assertSucceeds(leave(db, path, STRANGER));
      await assertSucceeds(join(db, path, STRANGER, inv));
    }
    await assertSucceeds(leave(db, 'lists/list-1', STRANGER));
    await assertFails(join(db, 'lists/list-1', STRANGER, 'old-inv'));
  });
});

test("an invite stops working once its creator can no longer use the target", async () => {
  await withTestEnv(async (env) => {
    await seed(env);
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'invites/mate-inv'), {
        kind: 'list',
        targetId: 'list-1',
        targetName: 'Shopping',
        createdBy: HOUSEMATE,
        createdAt: Timestamp.now(),
      });
    });
    // The housemate made the link through the household; the owner then moves the list out.
    await assertSucceeds(
      updateDoc(doc(env.authenticatedContext(OWNER).firestore(), 'lists/list-1'), {
        householdId: null,
        householdCreatedAt: null,
      }),
    );
    const db = env.authenticatedContext(STRANGER).firestore();
    await assertFails(join(db, 'lists/list-1', STRANGER, 'mate-inv'));
    // The owner's own link still works.
    await assertSucceeds(join(db, 'lists/list-1', STRANGER, 'list-inv'));
  });
});
