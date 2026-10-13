import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  completion,
  duplicateGroups,
  historyKey,
  joinAmounts,
  nextDue,
  parseAmount,
  parseEntry,
  splitEntries,
} from '../../src/app/models/item-logic.ts';

const at = (s: string) => new Date(s).getTime();

test('repeating deadlines roll forward, past today when done late', () => {
  const now = at('2026-10-05T09:00');
  assert.equal(nextDue(at('2026-10-05T00:00'), 'weekly', now), at('2026-10-12T00:00'));
  assert.equal(nextDue(at('2026-09-20T00:00'), 'weekly', now), at('2026-10-11T00:00'));
  assert.equal(nextDue(at('2026-01-31T00:00'), 'monthly', at('2026-01-31T09:00')), at('2026-02-28T00:00'));
});

test('ticking a repeating task moves it instead of finishing it', () => {
  const now = at('2026-10-05T09:00');
  const task = { id: 'a', name: 'ארנונה', state: false, description: '', date: 1, listCreatedAt: null as never };
  assert.deepEqual(completion({ ...task }, true, 'u1', now), { state: true, doneBy: 'u1' });
  assert.deepEqual(completion({ ...task }, false, 'u1', now), { state: false, doneBy: null });
  const repeating = { ...task, repeat: 'monthly' as const, dueAt: at('2026-10-05T00:00'), remindAt: at('2026-10-04T18:00') };
  assert.deepEqual(completion(repeating, true, 'u1', now), {
    dueAt: at('2026-11-05T00:00'),
    remindAt: at('2026-11-04T18:00'),
    reminded: false,
  });
});

test('quick entries split and carry a quantity', () => {
  assert.deepEqual(splitEntries('חלב, ביצים\n- לחם\n\n2) גבינה'), ['חלב', 'ביצים', 'לחם', 'גבינה']);
  assert.deepEqual(parseEntry('2 חלב'), { name: 'חלב', quantity: '2' });
  assert.deepEqual(parseEntry('חלב x2'), { name: 'חלב', quantity: '2' });
  assert.deepEqual(parseEntry('חלב 3'), { name: 'חלב', quantity: '3' });
  assert.deepEqual(parseEntry('1 ק״ג עגבניות'), { name: 'עגבניות', quantity: '1 ק״ג' });
  assert.deepEqual(parseEntry('עגבניות 1.5 ק"ג'), { name: 'עגבניות', quantity: '1.5 ק"ג' });
  assert.deepEqual(parseEntry('לחם מלא'), { name: 'לחם מלא', quantity: '' });
  assert.equal(historyKey('  Oat  Milk '), historyKey('oat milk'));
  assert.ok(!historyKey('a/b').includes('/'));
});

test('amounts parse into grams, kilos, litres or units', () => {
  assert.deepEqual(parseAmount('400 גרם'), { value: 400, unit: 'g' });
  assert.deepEqual(parseAmount('1,5 ק"ג'), { value: 1.5, unit: 'kg' });
  assert.deepEqual(parseAmount('1/2 ק״ג'), { value: 0.5, unit: 'kg' });
  assert.deepEqual(parseAmount('200 מ״ל'), { value: 0.2, unit: 'l' });
  assert.deepEqual(parseAmount('2'), { value: 2, unit: 'unit' });
  assert.deepEqual(parseAmount("3 יח'"), { value: 3, unit: 'unit' });
  assert.deepEqual(parseAmount('1,000 גרם'), { value: 1000, unit: 'g' });
  assert.equal(parseAmount('2 כפות'), null);
  assert.equal(parseAmount('קצת'), null);
});

test('joining lines adds up what can be added', () => {
  assert.equal(joinAmounts(['400 גרם', '700 גרם']), '1.1 ק״ג');
  assert.equal(joinAmounts(['400 גרם', '0.5 ק״ג']), '900 גרם');
  assert.equal(joinAmounts(['1 ליטר', '500 מ"ל']), '1.5 ליטר');
  assert.equal(joinAmounts(['2', "3 יח'"]), '5 יח׳');
  assert.equal(joinAmounts(['', '700 גרם']), '700 גרם');
  assert.equal(joinAmounts(['', '']), '');
  assert.equal(joinAmounts(['400 גרם', '2 יח׳']), '400 גרם + 2 יח׳');
  assert.equal(joinAmounts(['2 כפות', '1 כף']), '2 כפות + 1 כף');
});

test('duplicates are open items with the same name, oldest first', () => {
  const item = (name: string, date: number, state = false) => ({ name, date, state });
  const groups = duplicateGroups([
    item('בשר טחון', 2),
    item('חלב', 1),
    item(' בשר  טחון', 1),
    item('חלב', 3, true),
  ]);
  assert.deepEqual(groups, [[item(' בשר  טחון', 1), item('בשר טחון', 2)]]);
});
