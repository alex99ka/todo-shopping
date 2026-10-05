import type { Item, ItemChanges } from './todo-list.model';

const DAY = 24 * 60 * 60 * 1000;

function startOfDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function addMonth(ms: number): number {
  const d = new Date(ms);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + 1);
  // 31 Jan + 1 month is 28/29 Feb, not 3 Mar.
  d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
  return d.getTime();
}

/** The next deadline of a repeating task, rolled past today if it was done late. */
export function nextDue(dueAt: number, repeat: 'weekly' | 'monthly', now = Date.now()): number {
  const today = startOfDay(now);
  let next = dueAt;
  do {
    next = repeat === 'weekly' ? next + 7 * DAY : addMonth(next);
  } while (next < today);
  return next;
}

/**
 * What ticking (done = true) or unticking an item writes. A repeating task is not
 * finished: its deadline (and reminder, by the same step) moves to the next one.
 */
export function completion(item: Item, done: boolean, uid: string | null, now = Date.now()): Partial<ItemChanges> {
  if (done && item.repeat && item.dueAt) {
    const dueAt = nextDue(item.dueAt, item.repeat, now);
    return {
      dueAt,
      ...(item.remindAt && { remindAt: item.remindAt + (dueAt - item.dueAt), reminded: false }),
    };
  }
  return { state: done, doneBy: done ? uid : null };
}

const UNITS = `ק"ג|ק״ג|קג|קילו|גרם|גר'|ג'|ליטר|ל'|מ"ל|מ״ל|יח'|יחידות|חבילות|חבילה|שקיות|בקבוקים|קופסאות`;
const NUM = String.raw`\d+(?:[.,]\d+)?`;
const LEADING = new RegExp(String.raw`^(${NUM})\s*(?:(${UNITS})|[x×])?\s+(.+)$`);
const TRAILING = new RegExp(String.raw`^(.+?)\s+(?:[x×]\s*)?(${NUM})\s*(${UNITS})?$`);
const TIMES = new RegExp(String.raw`^(.+?)\s*[x×]\s*(${NUM})$`);

/** "2 חלב", "חלב x2", "1 ק״ג עגבניות" -> name plus quantity; anything else is just a name. */
export function parseEntry(text: string): { name: string; quantity: string } {
  const t = text.trim().replace(/\s+/g, ' ');
  let m = t.match(LEADING);
  if (m) return { name: m[3], quantity: [m[1], m[2]].filter(Boolean).join(' ') };
  m = t.match(TIMES);
  if (m) return { name: m[1], quantity: m[2] };
  m = t.match(TRAILING);
  if (m) return { name: m[1], quantity: [m[2], m[3]].filter(Boolean).join(' ') };
  return { name: t, quantity: '' };
}

/** Pasted lists: one item per line or comma, bullets and empty lines dropped. */
export function splitEntries(text: string): string[] {
  return text
    .split(/[\n,;،]+/)
    .map((s) => s.replace(/^\s*(?:[-*•▪◦]|\d+[.)])\s*/, '').trim())
    .filter(Boolean);
}

/** History doc id for a name: case- and space-insensitive, and safe as a Firestore id. */
export function historyKey(name: string): string {
  return encodeURIComponent(name.trim().replace(/\s+/g, ' ').toLowerCase()).slice(0, 400);
}
