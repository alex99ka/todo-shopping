import type { CATEGORIES } from './todo-list.model';

type Category = (typeof CATEGORIES)[number];

// Common Hebrew grocery words by aisle, matched as whole words ("דגני" is not "דג").
// ponytail: a keyword list, not a classifier; the editor fixes the rare miss, and the
// same name later reuses whatever aisle it was given.
const PHRASES: [string, Category][] = [
  ['פלפל שחור', 'Spices & Sauces'],
  ['אבקת שום', 'Spices & Sauces'],
  ['אבקת מרק', 'Spices & Sauces'],
  ['אבקת כביסה', 'Household'],
  ['נייר טואלט', 'Household'],
  ['נוזל כלים', 'Household'],
  ['שמן זית', 'Pantry'],
  ['תפוחי אדמה', 'Fruits & Vegetables'],
  ['בשר טחון', 'Meat & Fish'],
];

const WORDS: [Category, string[]][] = [
  ['Household', ['סבון', 'שמפו', 'מרכך', 'אקונומיקה', 'מגבונים', 'מגבות', 'טישו', 'חיתולים',
    'שקיות', 'ניילון', 'אלומיניום', 'ספוג', 'מטליות', 'משחת', 'דאודורנט', 'סקוטש']],
  ['Spices & Sauces', ['מלח', 'פפריקה', 'כמון', 'כורכום', 'אורגנו', 'קינמון', 'תבלין', 'רוטב',
    'קטשופ', 'מיונז', 'חרדל', 'סויה', 'חומץ', 'ציר', 'זעתר', 'הל']],
  ['Frozen', ['קפוא', 'קפואה', 'קפואים', 'גלידה', 'בצק']],
  ['Drinks', ['מים', 'מיץ', 'קולה', 'סודה', 'בירה', 'יין', 'משקה', 'תרכיז', 'פטל']],
  ['Bakery', ['לחם', 'פיתה', 'פיתות', 'חלה', 'חלות', 'לחמניות', 'לחמנייה', 'באגט', 'טורטיות',
    'טורטייה', 'בייגל', 'קרואסון', 'לאפה']],
  ['Pantry', ['אורז', 'פסטה', 'ספגטי', 'קמח', 'סוכר', 'שמן', 'קפה', 'תה', 'דגני', 'שימורי',
    'רסק', 'טחינה', 'חומוס', 'עדשים', 'שעועית', 'דבש', 'ריבה', 'ממרח', 'אטריות', 'פתיתים',
    'קוסקוס', 'בורגול', 'שיבולת', 'אגוזי', 'שקדים', 'טונה', 'עוגיות', 'במבה', 'ביסלי',
    'שוקולד', 'קורנפלקס', 'פירורי', 'שמרים', 'קקאו']],
  ['Dairy & Eggs', ['חלב', 'גבינה', 'גבינת', 'יוגורט', 'ביצים', 'ביצה', 'חמאה', 'שמנת', 'קוטג',
    "קוטג'", 'לבן', 'לבנה', 'מעדן', 'מוצרלה', 'פרמזן', 'צפתית', 'בולגרית', 'מילקי', 'אשל']],
  ['Meat & Fish', ['עוף', 'בשר', 'בקר', 'הודו', 'שניצל', 'קבב', 'נקניק', 'נקניקיות', 'סלמון',
    'דג', 'דגים', 'כבד', 'צלעות', 'פרגית', 'כרעיים', 'חזה', 'כנפיים', 'המבורגר', 'אנטריקוט']],
  ['Fruits & Vegetables', ['עגבניות', 'עגבנייה', 'מלפפון', 'מלפפונים', 'בצל', 'שום', 'תפוח',
    'תפוחים', 'בננה', 'בננות', 'תפוז', 'תפוזים', 'לימון', 'לימונים', 'גזר', 'חסה', 'פלפל',
    'כרוב', 'ברוקולי', 'כרובית', 'קישוא', 'קישואים', 'חציל', 'חצילים', 'אבוקדו', 'ענבים',
    'אבטיח', 'מלון', 'תותים', 'פטרוזיליה', 'כוסברה', 'שמיר', 'נענע', 'בטטה', 'פטריות',
    'דלעת', 'אגס', 'אפרסק', 'שזיף', 'מנגו', 'סלק', 'צנון', 'תירס', 'בצלים', 'ירקות', 'פירות']],
];

/** Best aisle for a typed item name; "Other" when nothing matches. */
export function guessAisle(name: string): Category {
  const text = name.trim().replace(/\s+/g, ' ');
  const phrase = PHRASES.find(([p]) => text.includes(p));
  if (phrase) {
    return phrase[1];
  }
  // The first word names the thing ("קמח לבן" is flour, not dairy), so try it first.
  for (const word of text.split(' ')) {
    const hit = WORDS.find(([, words]) => words.includes(word));
    if (hit) {
      return hit[0];
    }
  }
  return 'Other';
}
