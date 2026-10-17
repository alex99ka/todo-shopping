import { test } from 'node:test';
import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { addDoc, collection, deleteDoc, doc, getDoc, getDocs, serverTimestamp, setDoc, Timestamp } from 'firebase/firestore';
import { withTestEnv } from '../helpers/emulator.ts';

const ME = 'me-uid';

async function seed(env: Parameters<Parameters<typeof withTestEnv>[0]>[0]) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'config/app'), { minVersion: '0.0.0', message: '' });
    await setDoc(doc(db, 'config/access'), { earlyUsers: ['me@example.com'] });
    await setDoc(doc(db, 'notifier/backup'), { last: Timestamp.now(), file: 'x', docs: 1 });
    await setDoc(doc(db, 'notifier/state'), { lastRun: 1 });
  });
}

test('the kill switch reads before sign-in; access and backup need a sign-in', async () => {
  await withTestEnv(async (env) => {
    await seed(env);
    const anon = env.unauthenticatedContext().firestore();
    await assertSucceeds(getDoc(doc(anon, 'config/app')));
    await assertFails(getDoc(doc(anon, 'config/access')));
    await assertFails(getDoc(doc(anon, 'notifier/backup')));
    const db = env.authenticatedContext(ME).firestore();
    await assertSucceeds(getDoc(doc(db, 'config/access')));
    await assertSucceeds(getDoc(doc(db, 'notifier/backup')));
    // The rest of the notifier's state stays closed.
    await assertFails(getDoc(doc(db, 'notifier/state')));
  });
});

test('nobody writes config or the backup record from an app', async () => {
  await withTestEnv(async (env) => {
    await seed(env);
    const db = env.authenticatedContext(ME).firestore();
    await assertFails(setDoc(doc(db, 'config/app'), { minVersion: '0.0.0' }));
    await assertFails(setDoc(doc(db, 'config/access'), { earlyUsers: [] }));
    await assertFails(deleteDoc(doc(db, 'config/app')));
    await assertFails(setDoc(doc(db, 'notifier/backup'), { last: 1 }));
    await assertFails(getDocs(collection(db, 'config')));
  });
});

// lib/core/report.dart's payload.
const report = () => ({
  text: 'לא נטען',
  email: 'me@example.com',
  version: '4.0.0',
  platform: 'android',
  errors: ['x'],
  diagnostics: ['גרסה: 4.0.0'],
  uid: ME,
  at: serverTimestamp(),
});

test('a problem report is create-only, as yourself, with the server time', async () => {
  await withTestEnv(async (env) => {
    const db = env.authenticatedContext(ME).firestore();
    const ref = await assertSucceeds(addDoc(collection(db, 'reports'), report()));
    await assertFails(getDoc(ref));
    await assertFails(getDocs(collection(db, 'reports')));
    await assertFails(setDoc(ref, report()));
    await assertFails(deleteDoc(ref));
    await assertFails(addDoc(collection(db, 'reports'), { ...report(), uid: 'someone-else' }));
    await assertFails(addDoc(collection(db, 'reports'), { ...report(), at: Timestamp.now() }));
    await assertFails(addDoc(collection(db, 'reports'), { ...report(), extra: 1 }));
    await assertFails(addDoc(collection(db, 'reports'), { ...report(), text: 'x'.repeat(4001) }));
    await assertFails(addDoc(collection(env.unauthenticatedContext().firestore(), 'reports'), report()));
  });
});
