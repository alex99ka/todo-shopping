/// The list logic, ported line for line from the Ionic app
/// (src/app/models/item-logic.ts and aisle-guess.ts) so both write the same
/// data while 3.x is still installed somewhere. test/logic_test.dart holds the
/// old tests.
library;

DateTime _startOfDay(DateTime d) => DateTime(d.year, d.month, d.day);

int startOfDayMs(int ms) =>
    _startOfDay(DateTime.fromMillisecondsSinceEpoch(ms)).millisecondsSinceEpoch;

DateTime _addMonth(DateTime d) {
  // 31 Jan + 1 month is 28/29 Feb, not 3 Mar.
  final last = DateTime(d.year, d.month + 2, 0).day;
  return DateTime(d.year, d.month + 1, d.day > last ? last : d.day, d.hour,
      d.minute, d.second, d.millisecond);
}

/// The next deadline of a repeating task, rolled past today if it was done late.
int nextDue(int dueAt, String repeat, [int? now]) {
  final today = _startOfDay(
      DateTime.fromMillisecondsSinceEpoch(now ?? DateTime.now().millisecondsSinceEpoch));
  var next = DateTime.fromMillisecondsSinceEpoch(dueAt);
  do {
    // Weekly is 7 calendar days: local midnight stays midnight across DST.
    next = repeat == 'weekly'
        ? DateTime(next.year, next.month, next.day + 7, next.hour, next.minute)
        : _addMonth(next);
  } while (next.isBefore(today));
  return next.millisecondsSinceEpoch;
}

/// What ticking (done) or unticking an item writes. A repeating task is not
/// finished: its deadline (and reminder, by the same step) moves on.
Map<String, Object?> tickChanges(Map<String, dynamic> item, bool done, String? uid,
    [int? now]) {
  final repeat = item['repeat'] as String?;
  final dueAt = (item['dueAt'] as num?)?.toInt();
  if (done && repeat != null && dueAt != null && dueAt != 0) {
    final next = nextDue(dueAt, repeat, now);
    final remindAt = (item['remindAt'] as num?)?.toInt();
    return {
      'dueAt': next,
      if (remindAt != null && remindAt != 0) ...{
        'remindAt': remindAt + (next - dueAt),
        'reminded': false,
      },
    };
  }
  return {'state': done, 'doneBy': done ? uid : null};
}

const _units =
    'ק"ג|ק״ג|קג|קילו|גרם|גר\'|ג\'|ליטר|ל\'|מ"ל|מ״ל|יח\'|יחידות|חבילות|חבילה|שקיות|בקבוקים|קופסאות';
const _num = r'\d+(?:[.,]\d+)?';
final _leading = RegExp('^($_num)\\s*(?:($_units)|[x×])?\\s+(.+)\$');
final _trailing = RegExp('^(.+?)\\s+(?:[x×]\\s*)?($_num)\\s*($_units)?\$');
final _times = RegExp('^(.+?)\\s*[x×]\\s*($_num)\$');

/// "2 חלב", "חלב x2", "1 ק״ג עגבניות" -> name plus quantity; else just a name.
({String name, String quantity}) parseEntry(String text) {
  final t = text.trim().replaceAll(RegExp(r'\s+'), ' ');
  var m = _leading.firstMatch(t);
  if (m != null) {
    return (
      name: m[3]!,
      quantity: [m[1], m[2]].whereType<String>().where((s) => s.isNotEmpty).join(' ')
    );
  }
  m = _times.firstMatch(t);
  if (m != null) return (name: m[1]!, quantity: m[2]!);
  m = _trailing.firstMatch(t);
  if (m != null) {
    return (
      name: m[1]!,
      quantity: [m[2], m[3]].whereType<String>().where((s) => s.isNotEmpty).join(' ')
    );
  }
  return (name: t, quantity: '');
}

/// Pasted lists: one item per line or comma, bullets and empty lines dropped.
List<String> splitEntries(String text) => text
    .split(RegExp(r'[\n,;،]+'))
    .map((s) => s.replaceFirst(RegExp(r'^\s*(?:[-*•▪◦]|\d+[.)])\s*'), '').trim())
    .where((s) => s.isNotEmpty)
    .toList();

/// History doc id for a name: case- and space-insensitive, safe as a doc id.
/// Same bytes as JS encodeURIComponent, so 3.x and 4.x share the history.
String historyKey(String name) {
  final k = Uri.encodeComponent(
      name.trim().replaceAll(RegExp(r'\s+'), ' ').toLowerCase());
  return k.length > 400 ? k.substring(0, 400) : k;
}

const unitLabels = {'g': 'גרם', 'kg': 'ק״ג', 'l': 'ליטר', 'unit': 'יח׳'};

typedef Amount = ({double value, String unit});

// Spellings (quotes and dots stripped) -> unit and the factor into it.
const _unitWords = <String, (String, double)>{
  'גרם': ('g', 1), 'גר': ('g', 1), 'ג': ('g', 1), 'g': ('g', 1), 'gr': ('g', 1),
  'קג': ('kg', 1), 'קילו': ('kg', 1), 'kg': ('kg', 1),
  'ליטר': ('l', 1), 'ל': ('l', 1), 'l': ('l', 1),
  'מל': ('l', 0.001), 'ml': ('l', 0.001),
  'יח': ('unit', 1), 'יחידה': ('unit', 1), 'יחידות': ('unit', 1),
};

/// "400 גרם", "1.5 ק״ג", "1/2 ליטר", "2" -> amount; null in other units.
Amount? parseAmount(String text) {
  final m = RegExp(r'^(\d+(?:[.,]\d+)?(?:/\d+)?)\s*(.*)$').firstMatch(text.trim());
  if (m == null) return null;
  final word = m[2]!;
  final unit = word.isEmpty
      ? ('unit', 1.0)
      : _unitWords[word.replaceAll(RegExp('["\'״׳.]'), '').toLowerCase()];
  if (unit == null) return null;
  // "1,000" is a thousand, "1,5" one and a half.
  final parts = m[1]!
      .replaceFirstMapped(RegExp(r',(\d{3})$'), (x) => x[1]!)
      .replaceFirst(',', '.')
      .split('/');
  final a = double.tryParse(parts[0]);
  final b = parts.length > 1 ? double.tryParse(parts[1]) : null;
  if (a == null) return null;
  final value = (b != null ? a / b : a) * unit.$2;
  return value.isFinite ? (value: value, unit: unit.$1) : null;
}

String formatAmount(Amount a) {
  final r = (a.value * 100).round() / 100;
  final n = r == r.roundToDouble() ? r.toInt().toString() : '$r';
  return '$n ${unitLabels[a.unit]}';
}

/// The sum of amounts for the same thing; null when they don't add up.
String? addAmounts(List<String> texts) {
  final parts = texts.map((t) => t.trim()).where((t) => t.isNotEmpty).toList();
  if (parts.length < 2) return parts.join();
  final amounts = parts.map(parseAmount).whereType<Amount>().toList();
  bool mass(Amount a) => a.unit == 'g' || a.unit == 'kg';
  if (amounts.length < parts.length) return null;
  final first = amounts.first;
  if (!amounts.every((a) => mass(a) ? mass(first) : a.unit == first.unit)) return null;
  if (mass(first)) {
    final grams = amounts.fold<double>(
        0, (s, a) => s + a.value * (a.unit == 'kg' ? 1000 : 1));
    return formatAmount(grams >= 1000
        ? (value: grams / 1000, unit: 'kg')
        : (value: grams, unit: 'g'));
  }
  return formatAmount(
      (value: amounts.fold<double>(0, (s, a) => s + a.value), unit: first.unit));
}

/// Like addAmounts, but what doesn't add up is kept side by side with "+".
String joinAmounts(List<String> texts) =>
    addAmounts(texts) ??
    texts.map((t) => t.trim()).where((t) => t.isNotEmpty).join(' + ');

/// Open items that share a name, oldest first in each group.
List<List<T>> duplicateGroups<T>(List<T> items,
    {required String Function(T) name,
    required bool Function(T) done,
    required int Function(T) date}) {
  final byName = <String, List<T>>{};
  for (final i in items.where((i) => !done(i))) {
    byName.putIfAbsent(historyKey(name(i)), () => []).add(i);
  }
  return [
    for (final g in byName.values)
      if (g.length > 1) g..sort((a, b) => date(a).compareTo(date(b))),
  ];
}

// Aisle order. The recipe server returns exactly these strings, so they stay
// English in the database; [categoryLabels] is what the UI shows.
const categories = [
  'Fruits & Vegetables', 'Meat & Fish', 'Dairy & Eggs', 'Bakery', 'Pantry',
  'Spices & Sauces', 'Frozen', 'Drinks', 'Household', 'Other',
];

const categoryLabels = {
  'Fruits & Vegetables': 'פירות וירקות',
  'Meat & Fish': 'בשר ודגים',
  'Dairy & Eggs': 'חלב וביצים',
  'Bakery': 'מאפים ולחם',
  'Pantry': 'מזווה',
  'Spices & Sauces': 'תבלינים ורטבים',
  'Frozen': 'קפואים',
  'Drinks': 'משקאות',
  'Household': 'ניקיון ובית',
  'Other': 'אחר',
};

const repeatLabels = {'weekly': 'כל שבוע', 'monthly': 'כל חודש'};
const priorityLabels = {'high': 'גבוהה', 'normal': 'רגילה', 'low': 'נמוכה'};

const _phrases = [
  ('פלפל שחור', 'Spices & Sauces'),
  ('אבקת שום', 'Spices & Sauces'),
  ('אבקת מרק', 'Spices & Sauces'),
  ('אבקת כביסה', 'Household'),
  ('נייר טואלט', 'Household'),
  ('נוזל כלים', 'Household'),
  ('שמן זית', 'Pantry'),
  ('תפוחי אדמה', 'Fruits & Vegetables'),
  ('בשר טחון', 'Meat & Fish'),
];

// Common Hebrew grocery words by aisle, matched as whole words.
// shortcut: a keyword list, not a classifier; the editor fixes the rare miss,
// and the same name later reuses whatever aisle it was given.
const _words = <(String, List<String>)>[
  ('Household', ['סבון', 'שמפו', 'מרכך', 'אקונומיקה', 'מגבונים', 'מגבות', 'טישו', 'חיתולים',
    'שקיות', 'ניילון', 'אלומיניום', 'ספוג', 'מטליות', 'משחת', 'דאודורנט', 'סקוטש']),
  ('Spices & Sauces', ['מלח', 'פפריקה', 'כמון', 'כורכום', 'אורגנו', 'קינמון', 'תבלין', 'רוטב',
    'קטשופ', 'מיונז', 'חרדל', 'סויה', 'חומץ', 'ציר', 'זעתר', 'הל']),
  ('Frozen', ['קפוא', 'קפואה', 'קפואים', 'גלידה', 'בצק']),
  ('Drinks', ['מים', 'מיץ', 'קולה', 'סודה', 'בירה', 'יין', 'משקה', 'תרכיז', 'פטל']),
  ('Bakery', ['לחם', 'פיתה', 'פיתות', 'חלה', 'חלות', 'לחמניות', 'לחמנייה', 'באגט', 'טורטיות',
    'טורטייה', 'בייגל', 'קרואסון', 'לאפה']),
  ('Pantry', ['אורז', 'פסטה', 'ספגטי', 'קמח', 'סוכר', 'שמן', 'קפה', 'תה', 'דגני', 'שימורי',
    'רסק', 'טחינה', 'חומוס', 'עדשים', 'שעועית', 'דבש', 'ריבה', 'ממרח', 'אטריות', 'פתיתים',
    'קוסקוס', 'בורגול', 'שיבולת', 'אגוזי', 'שקדים', 'טונה', 'עוגיות', 'במבה', 'ביסלי',
    'שוקולד', 'קורנפלקס', 'פירורי', 'שמרים', 'קקאו']),
  ('Dairy & Eggs', ['חלב', 'גבינה', 'גבינת', 'יוגורט', 'ביצים', 'ביצה', 'חמאה', 'שמנת', 'קוטג',
    "קוטג'", 'לבן', 'לבנה', 'מעדן', 'מוצרלה', 'פרמזן', 'צפתית', 'בולגרית', 'מילקי', 'אשל']),
  ('Meat & Fish', ['עוף', 'בשר', 'בקר', 'הודו', 'שניצל', 'קבב', 'נקניק', 'נקניקיות', 'סלמון',
    'דג', 'דגים', 'כבד', 'צלעות', 'פרגית', 'כרעיים', 'חזה', 'כנפיים', 'המבורגר', 'אנטריקוט']),
  ('Fruits & Vegetables', ['עגבניות', 'עגבנייה', 'מלפפון', 'מלפפונים', 'בצל', 'שום', 'תפוח',
    'תפוחים', 'בננה', 'בננות', 'תפוז', 'תפוזים', 'לימון', 'לימונים', 'גזר', 'חסה', 'פלפל',
    'כרוב', 'ברוקולי', 'כרובית', 'קישוא', 'קישואים', 'חציל', 'חצילים', 'אבוקדו', 'ענבים',
    'אבטיח', 'מלון', 'תותים', 'פטרוזיליה', 'כוסברה', 'שמיר', 'נענע', 'בטטה', 'פטריות',
    'דלעת', 'אגס', 'אפרסק', 'שזיף', 'מנגו', 'סלק', 'צנון', 'תירס', 'בצלים', 'ירקות', 'פירות']),
];

/// Best aisle for a typed item name; "Other" when nothing matches.
String guessAisle(String name) {
  final text = name.trim().replaceAll(RegExp(r'\s+'), ' ');
  for (final (p, c) in _phrases) {
    if (text.contains(p)) return c;
  }
  // The first word names the thing ("קמח לבן" is flour, not dairy).
  for (final word in text.split(' ')) {
    for (final (c, words) in _words) {
      if (words.contains(word)) return c;
    }
  }
  return 'Other';
}

/// "היום", "מחר", "באיחור · ג׳ 3 בנוב׳": the deadline chip.
String dueText(int dueAt, [DateTime? now]) {
  final today = _startOfDay(now ?? DateTime.now());
  final day = _startOfDay(DateTime.fromMillisecondsSinceEpoch(dueAt));
  final days = (day.difference(today).inHours / 24).round();
  if (days == 0) return 'היום';
  if (days == 1) return 'מחר';
  if (days == -1) return 'אתמול';
  final d = shortDate(day);
  return days < 0 ? 'באיחור · $d' : d;
}

const _weekdays = ['ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳', 'א׳'];
const _months = ['ינו׳', 'פבר׳', 'מרץ', 'אפר׳', 'מאי', 'יוני', 'יולי', 'אוג׳', 'ספט׳',
  'אוק׳', 'נוב׳', 'דצמ׳'];

/// "יום ג׳, 3 בנוב׳".
String shortDate(DateTime d) =>
    'יום ${_weekdays[d.weekday - 1]}, ${d.day} ב${_months[d.month - 1]}';

String shortDateTime(DateTime d) =>
    '${shortDate(d)}, ${d.hour.toString().padLeft(2, '0')}:${d.minute.toString().padLeft(2, '0')}';

bool isBeforeToday(int ms, [DateTime? now]) =>
    ms < _startOfDay(now ?? DateTime.now()).millisecondsSinceEpoch;

bool isToday(int ms, [DateTime? now]) {
  final start = _startOfDay(now ?? DateTime.now());
  return ms >= start.millisecondsSinceEpoch &&
      ms < DateTime(start.year, start.month, start.day + 1).millisecondsSinceEpoch;
}
