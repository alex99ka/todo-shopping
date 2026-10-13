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

/** The units a shopping amount is kept in. */
export type Unit = 'g' | 'kg' | 'l' | 'unit';
export const UNIT_LABELS: Record<Unit, string> = { g: 'גרם', kg: 'ק״ג', l: 'ליטר', unit: 'יח׳' };

export interface Amount {
  value: number;
  unit: Unit;
}

// Spellings (quotes and dots stripped) -> unit and the factor into it; millilitres become litres.
const UNIT_WORDS: Record<string, [Unit, number]> = {
  גרם: ['g', 1], גר: ['g', 1], ג: ['g', 1], g: ['g', 1], gr: ['g', 1],
  קג: ['kg', 1], קילו: ['kg', 1], kg: ['kg', 1],
  ליטר: ['l', 1], ל: ['l', 1], l: ['l', 1],
  מל: ['l', 0.001], ml: ['l', 0.001],
  יח: ['unit', 1], יחידה: ['unit', 1], יחידות: ['unit', 1],
};

/** "400 גרם", "1.5 ק״ג", "1/2 ליטר", "2" -> amount; null for anything in other units ("2 כפות"). */
export function parseAmount(text: string): Amount | null {
  const m = text.trim().match(/^(\d+(?:[.,]\d+)?(?:\/\d+)?)\s*(.*)$/);
  const unit = m && (m[2] ? UNIT_WORDS[m[2].replace(/["'״׳.]/g, '').toLowerCase()] : (['unit', 1] as const));
  if (!m || !unit) return null;
  // "1,000" is a thousand, "1,5" one and a half.
  const [a, b] = m[1].replace(/,(\d{3})$/, '$1').replace(',', '.').split('/');
  const value = (b ? Number(a) / Number(b) : Number(a)) * unit[1];
  return Number.isFinite(value) ? { value, unit: unit[0] } : null;
}

export function formatAmount({ value, unit }: Amount): string {
  return `${Math.round(value * 100) / 100} ${UNIT_LABELS[unit]}`;
}

/** The sum of amounts for the same thing ("400 גרם" + "0.7 ק״ג" -> "1.1 ק״ג"); null when they do not add up. */
export function addAmounts(texts: string[]): string | null {
  const parts = texts.map((t) => t.trim()).filter(Boolean);
  if (parts.length < 2) return parts.join('');
  const amounts = parts.map(parseAmount).filter((a) => a !== null);
  const mass = (a: Amount) => a.unit === 'g' || a.unit === 'kg';
  const [first] = amounts;
  if (amounts.length < parts.length || !amounts.every((a) => (mass(a) ? mass(first) : a.unit === first.unit))) {
    return null;
  }
  if (mass(first)) {
    const grams = amounts.reduce((sum, a) => sum + a.value * (a.unit === 'kg' ? 1000 : 1), 0);
    return formatAmount(grams >= 1000 ? { value: grams / 1000, unit: 'kg' } : { value: grams, unit: 'g' });
  }
  return formatAmount({ value: amounts.reduce((sum, a) => sum + a.value, 0), unit: first.unit });
}

/** Like addAmounts, but amounts that do not add up (other units, free text) are kept side by side with "+". */
export function joinAmounts(texts: string[]): string {
  return addAmounts(texts) ?? texts.map((t) => t.trim()).filter(Boolean).join(' + ');
}

/** Open items that share a name (case and spacing aside), oldest first in each group. */
export function duplicateGroups<T extends { name: string; state: boolean; date: number }>(items: T[]): T[][] {
  const byName = new Map<string, T[]>();
  for (const item of items.filter((i) => !i.state)) {
    const key = historyKey(item.name);
    byName.set(key, [...(byName.get(key) ?? []), item]);
  }
  return [...byName.values()].filter((g) => g.length > 1).map((g) => g.sort((a, b) => a.date - b.date));
}
