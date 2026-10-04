import type { Timestamp } from 'firebase/firestore';

export interface Item {
  id: string;
  name: string;
  state: boolean;
  description: string;
  date: number;
  listCreatedAt: Timestamp;
  photoPath?: string;
  category?: string;
  /** Epoch ms; the notifier on the Pi pushes a reminder then and sets `reminded`. */
  remindAt?: number | null;
  reminded?: boolean;
  /** Uid of whoever added the item, so the notifier does not ping them about it. */
  by?: string;
}

export interface TodoList {
  id: string;
  ownerUid: string;
  name: string;
  date: number;
  createdAt: Timestamp;
  memberUids: string[];
  joinedAt: Record<string, Timestamp>;
  householdId?: string | null;
  /**
   * The household's createdAt, copied when the list is filed. A household
   * deleted and recreated under the same id gets a new createdAt, so it does
   * not inherit the old one's lists (same idea as Item.listCreatedAt).
   */
  householdCreatedAt?: Timestamp | null;
  /** Which invite each member joined with; the rules check it on join. */
  invites?: Record<string, string>;
}

export interface Household {
  id: string;
  ownerUid: string;
  name: string;
  date: number;
  createdAt: Timestamp;
  memberUids: string[];
  joinedAt: Record<string, Timestamp>;
  invites?: Record<string, string>;
}

export interface Invite {
  kind: 'list' | 'household';
  targetId: string;
  targetName: string;
  createdBy: string;
  createdAt: Timestamp;
}

export type ItemChanges = Pick<Item, 'name' | 'state' | 'description' | 'date'> &
  Partial<Pick<Item, 'photoPath' | 'category' | 'remindAt' | 'reminded'>>;

/** The list recipe ingredients land in. Its items are grouped by category. */
export const SHOPPING_LIST = 'Shopping';

// Aisle order. The recipe server's ai.py returns exactly these strings.
export const CATEGORIES = [
  'Fruits & Vegetables',
  'Meat & Fish',
  'Dairy & Eggs',
  'Bakery',
  'Pantry',
  'Spices & Sauces',
  'Frozen',
  'Drinks',
  'Household',
  'Other',
] as const;

export function newItem(): Omit<Item, 'id' | 'listCreatedAt'> {
  return { name: '', state: false, description: '', date: Date.now() };
}
