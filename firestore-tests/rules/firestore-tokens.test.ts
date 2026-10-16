import { test } from 'node:test';
import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import {
  collection,
  collectionGroup,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  Timestamp,
} from 'firebase/firestore';
import { withTestEnv } from '../helpers/emulator.ts';

const ME = 'me-uid';
const OTHER = 'other-uid';

// PushService.register's payload.
const TOKEN = { platform: 'web', updatedAt: serverTimestamp() };

test('a user saves, refreshes, reads and deletes their own push token', async () => {
  await withTestEnv(async (env) => {
    const db = env.authenticatedContext(ME).firestore();
    const ref = doc(db, 'users', ME, 'tokens', 'fcm-token-1');
    await assertSucceeds(setDoc(ref, TOKEN));
    await assertSucceeds(setDoc(ref, { ...TOKEN, platform: 'android' }));
    await assertSucceeds(getDocs(collection(db, 'users', ME, 'tokens')));
    await assertSucceeds(deleteDoc(ref));
  });
});

test('a token doc holds only a known platform and the server time', async () => {
  await withTestEnv(async (env) => {
    const db = env.authenticatedContext(ME).firestore();
    const ref = doc(db, 'users', ME, 'tokens', 'fcm-token-1');
    await assertFails(setDoc(ref, { ...TOKEN, uid: ME }));
    await assertFails(setDoc(ref, { ...TOKEN, platform: 'desktop' }));
    await assertFails(setDoc(ref, { ...TOKEN, updatedAt: Timestamp.now() }));
    await assertFails(setDoc(ref, { platform: 'web' }));
  });
});

test('nobody reads, writes or enumerates another user tokens', async () => {
  await withTestEnv(async (env) => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'users', OTHER, 'tokens', 'their-token'), {
        platform: 'web',
        updatedAt: Timestamp.now(),
      });
    });
    const db = env.authenticatedContext(ME).firestore();
    await assertFails(getDoc(doc(db, 'users', OTHER, 'tokens', 'their-token')));
    await assertFails(getDocs(collection(db, 'users', OTHER, 'tokens')));
    await assertFails(getDocs(collectionGroup(db, 'tokens')));
    await assertFails(setDoc(doc(db, 'users', OTHER, 'tokens', 'mine'), TOKEN));
    await assertFails(setDoc(doc(db, 'users', OTHER, 'tokens', 'their-token'), TOKEN));
    await assertFails(deleteDoc(doc(db, 'users', OTHER, 'tokens', 'their-token')));
  });
});

test('clients cannot touch the notifier state', async () => {
  await withTestEnv(async (env) => {
    const db = env.authenticatedContext(ME).firestore();
    await assertFails(getDoc(doc(db, 'notifier/state')));
    await assertFails(setDoc(doc(db, 'notifier/state'), { lastRun: 1 }));
  });
});

test('collection group queries over items and invites are denied', async () => {
  await withTestEnv(async (env) => {
    const db = env.authenticatedContext(ME).firestore();
    await assertFails(getDocs(collectionGroup(db, 'items')));
    await assertFails(getDocs(collectionGroup(db, 'invites')));
  });
});
