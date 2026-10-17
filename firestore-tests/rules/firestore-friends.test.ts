import { test } from 'node:test';
import {
  assertFails,
  assertSucceeds,
  type RulesTestContext,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  arrayRemove,
  arrayUnion,
  deleteField,
  doc,
  FieldPath,
  getDoc,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
} from 'firebase/firestore';
import { withTestEnv } from '../helpers/emulator.ts';

type Firestore = ReturnType<RulesTestContext['firestore']>;

const OWNER = 'owner-uid';
const MEMBER = 'member-uid';
const FRIEND = 'friend-uid';
const MATE = 'mate-uid';
const STRANGER = 'stranger-uid';
const T0 = Timestamp.fromMillis(1000);

async function seed(env: RulesTestEnvironment): Promise<void> {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'lists/list-1'), {
      ownerUid: OWNER,
      name: 'Shopping',
      date: 1000,
      createdAt: T0,
      memberUids: [OWNER, MEMBER],
      joinedAt: { [OWNER]: T0, [MEMBER]: T0 },
    });
    await setDoc(doc(db, 'friends', OWNER), {
      people: { [FRIEND]: { name: 'Friend' } },
      mates: { [MATE]: { name: 'Mate' } },
    });
  });
}

// lib/lists/friends.dart addFriends's exact write.
function add(db: Firestore, uid: string, uids: string[]) {
  const rest: unknown[] = [];
  for (const u of uids) rest.push(new FieldPath('joinedAt', u), serverTimestamp());
  return updateDoc(doc(db, 'lists/list-1'), 'memberUids', arrayUnion(...uids), ...rest);
}

test('friends: only the owner reads their friends doc, nobody writes it', async () => {
  await withTestEnv(async (env) => {
    await seed(env);
    const owner = env.authenticatedContext(OWNER).firestore();
    await assertSucceeds(getDoc(doc(owner, 'friends', OWNER)));
    await assertFails(getDoc(doc(env.authenticatedContext(STRANGER).firestore(), 'friends', OWNER)));
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'friends', OWNER)));
    await assertFails(setDoc(doc(owner, 'friends', OWNER), { people: { [STRANGER]: { name: 'x' } } }));
    await assertFails(setDoc(doc(owner, 'friends', STRANGER), { people: {} }));
  });
});

test('friends: a member adds a friend and a housemate to a list', async () => {
  await withTestEnv(async (env) => {
    await seed(env);
    await assertSucceeds(add(env.authenticatedContext(OWNER).firestore(), OWNER, [FRIEND, MATE]));
  });
});

test('friends: nobody else can be added this way', async () => {
  await withTestEnv(async (env) => {
    await seed(env);
    const owner = env.authenticatedContext(OWNER).firestore();
    // Not a friend.
    await assertFails(add(owner, OWNER, [STRANGER]));
    await assertFails(add(owner, OWNER, [FRIEND, STRANGER]));
    // MEMBER has no friends doc: the owner's friends are not theirs.
    await assertFails(add(env.authenticatedContext(MEMBER).firestore(), MEMBER, [FRIEND]));
    // A friend of the owner can't add themselves to a list they aren't in.
    await assertFails(add(env.authenticatedContext(FRIEND).firestore(), FRIEND, [FRIEND]));
  });
});

test('friends: the add changes nothing else', async () => {
  await withTestEnv(async (env) => {
    await seed(env);
    const owner = env.authenticatedContext(OWNER).firestore();
    const ref = doc(owner, 'lists/list-1');
    // No joinedAt for the new member.
    await assertFails(updateDoc(ref, { memberUids: arrayUnion(FRIEND) }));
    // Removing someone in the same write.
    await assertFails(updateDoc(ref, 'memberUids', [OWNER, FRIEND],
      new FieldPath('joinedAt', FRIEND), serverTimestamp(), new FieldPath('joinedAt', MEMBER), deleteField()));
    await assertFails(updateDoc(ref, 'memberUids', arrayRemove(MEMBER)));
    // Another field along with it.
    await assertFails(updateDoc(ref, 'memberUids', arrayUnion(FRIEND),
      new FieldPath('joinedAt', FRIEND), serverTimestamp(), 'name', 'Other'));
  });
});
