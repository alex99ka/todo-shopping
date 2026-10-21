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
  ('נייר אפייה', 'Household'),
  ('נייר כסף', 'Household'),
  ('חמוצים', 'Pantry'),
  ('חלב קוקוס', 'Pantry'),
  ('חלב שקדים', 'Drinks'),
  ('חלב סויה', 'Drinks'),
  ('חלב שיבולת', 'Drinks'),
  ('מי פה', 'Household'),
  ('שעועית ירוקה', 'Fruits & Vegetables'),
];

// Common Hebrew grocery words by aisle, matched as whole words, then by stem,
// then with one typo. Order matters: an earlier aisle wins a shared word.
// shortcut: a keyword list, not a classifier; the editor fixes the rare miss,
// and the same name later reuses whatever aisle it was given ([aisleFor]).
const _words = <(String, List<String>)>[
  ('Household', ['סבון', 'שמפו', 'מרכך', 'אקונומיקה', 'מגבונים', 'מגבות', 'טישו', 'חיתולים',
    'שקיות', 'ניילון', 'אלומיניום', 'ספוג', 'מטליות', 'משחת', 'דאודורנט', 'סקוטש',
    'מרסס', 'כביסה', 'מברשת', 'סוללות', 'נורה', 'מפיות', 'צלחות', 'כוסות', 'סכו"ם', 'סכו״ם',
    'פיירי', 'סנו', 'מנקה', 'גילוח', 'תחבושות', 'פלסטרים', 'קיסמים']),
  ('Spices & Sauces', ['מלח', 'פפריקה', 'כמון', 'כורכום', 'אורגנו', 'קינמון', 'תבלין', 'רוטב',
    'קטשופ', 'מיונז', 'חרדל', 'סויה', 'חומץ', 'ציר', 'זעתר', 'הל', 'תבלינים', 'בהרט',
    'סומק', 'ג׳ינג׳ר', "ג'ינג'ר", 'מוסקט', 'ציפורן', 'וניל', 'צ׳ילי', "צ'ילי", 'עמבה',
    'סחוג', 'הריסה', 'פסטו', 'ברביקיו', 'טריאקי']),
  ('Frozen', ['קפוא', 'קפואה', 'קפואים', 'גלידה', 'בצק', 'שלגון', 'ארטיק', 'מלוואח', "ג'חנון",
    'ג׳חנון', 'זיוה', 'בורקס']),
  ('Drinks', ['מים', 'מיץ', 'קולה', 'סודה', 'בירה', 'יין', 'משקה', 'תרכיז', 'פטל', 'ספרייט',
    'פנטה', 'שוופס', 'נביעות', 'סיידר', 'וודקה', 'ויסקי', 'וויסקי', 'ערק', 'לימונדה',
    'אייס', 'פריגת']),
  ('Bakery', ['לחם', 'פיתה', 'פיתות', 'חלה', 'חלות', 'לחמניות', 'לחמנייה', 'באגט', 'טורטיות',
    'טורטייה', 'בייגל', 'קרואסון', 'לאפה', 'עוגה', 'עוגת', 'רוגלך', 'מאפה', 'מאפים',
    'פוקאצ׳ה', 'פרנה', 'ג׳בטה', "ג'בטה"]),
  ('Pantry', ['אורז', 'פסטה', 'ספגטי', 'קמח', 'סוכר', 'שמן', 'קפה', 'תה', 'דגני', 'שימורי',
    'רסק', 'טחינה', 'חומוס', 'עדשים', 'שעועית', 'דבש', 'ריבה', 'ממרח', 'אטריות', 'פתיתים',
    'קוסקוס', 'בורגול', 'שיבולת', 'אגוזי', 'שקדים', 'טונה', 'עוגיות', 'במבה', 'ביסלי',
    'שוקולד', 'קורנפלקס', 'פירורי', 'שמרים', 'קקאו', 'קרקרים', 'פריכיות', 'גרנולה',
    'חטיף', 'חטיפים', 'פופקורן', 'זיתים', 'שימורים', 'סילאן', 'ופלים', 'אבקת', 'פירה',
    'מצות', 'קרמבו', 'חלבה', 'צימוקים', 'תמרים', 'גרעינים', 'בוטנים', 'פיסטוקים', 'מרק', 'נודלס']),
  ('Dairy & Eggs', ['חלב', 'גבינה', 'גבינת', 'יוגורט', 'ביצים', 'ביצה', 'חמאה', 'שמנת', 'קוטג',
    "קוטג'", 'לבן', 'לבנה', 'מעדן', 'מוצרלה', 'פרמזן', 'צפתית', 'בולגרית', 'מילקי', 'אשל',
    'גאודה', 'ריקוטה', 'מסקרפונה', 'צ׳דר', "צ'דר", 'עמק', 'פודינג', 'דנונה', 'יופלה',
    'שוקו', 'מרגרינה', 'קשקבל', 'פטה', 'קממבר', 'חלומי']),
  ('Meat & Fish', ['עוף', 'בשר', 'בקר', 'הודו', 'שניצל', 'קבב', 'נקניק', 'נקניקיות', 'סלמון',
    'דג', 'דגים', 'כבד', 'צלעות', 'פרגית', 'כרעיים', 'חזה', 'כנפיים', 'המבורגר', 'אנטריקוט',
    'פסטרמה', 'סטייק', 'קציצות', 'שוקיים', 'טחון', 'אמנון', 'דניס', 'לברק', 'בורי',
    'נקניקייה', 'פילה', 'שרימפס', 'סלמי', 'כבש', 'פרגיות', 'שווארמה', 'אסאדו', 'צלי']),
  ('Fruits & Vegetables', ['עגבניות', 'עגבנייה', 'מלפפון', 'מלפפונים', 'בצל', 'שום', 'תפוח',
    'תפוחים', 'בננה', 'בננות', 'תפוז', 'תפוזים', 'לימון', 'לימונים', 'גזר', 'חסה', 'פלפל',
    'כרוב', 'ברוקולי', 'כרובית', 'קישוא', 'קישואים', 'חציל', 'חצילים', 'אבוקדו', 'ענבים',
    'אבטיח', 'מלון', 'תותים', 'פטרוזיליה', 'כוסברה', 'שמיר', 'נענע', 'בטטה', 'פטריות',
    'דלעת', 'אגס', 'אפרסק', 'שזיף', 'מנגו', 'סלק', 'צנון', 'תירס', 'בצלים', 'ירקות', 'פירות']),
];

/// Aisles names were given before, on any list this device has opened, by
/// [historyKey]. "Other" is never kept, so a better guess still gets a turn.
final learnedAisles = <String, String>{};

/// The aisle a name was given before, else [guessAisle].
String aisleFor(String name) => learnedAisles[historyKey(name)] ?? guessAisle(name);

// Final letters as mid-word ones and "יי" as "י", so spellings compare.
String _plain(String w) => w
    .toLowerCase()
    .replaceAllMapped(RegExp('[ךםןףץ]'), (m) => const {'ך': 'כ', 'ם': 'מ', 'ן': 'נ', 'ף': 'פ', 'ץ': 'צ'}[m[0]]!)
    .replaceAll('יי', 'י');

// One plural or feminine ending off: "עגבניות", "עגבנייה" and "תפוחי" meet their stems.
String _stem(String w) {
  final p = _plain(w);
  for (final s in const ['ימ', 'ות', 'ה', 'י']) {
    if (p.length >= 4 && p.endsWith(s) && p.length - s.length >= 2) return p.substring(0, p.length - s.length);
  }
  return p;
}

// "ו" (and) and "ה" (the) glued to the front: "ועגבניות", "הלחם".
List<String> _bare(String w) => [
      w,
      if (w.startsWith('וה') && w.length >= 5) w.substring(2),
      if ((w.startsWith('ו') || w.startsWith('ה')) && w.length >= 4) w.substring(1),
    ];

/// One letter added, dropped, changed, or two swapped; the longer at least 4.
bool oneSlip(String a, String b) => _slip(_plain(a), _plain(b));

bool _slip(String a, String b) {
  if (a == b || a.length < 4 && b.length < 4 || (a.length - b.length).abs() > 1) return false;
  var i = 0;
  while (i < a.length && i < b.length && a[i] == b[i]) {
    i++;
  }
  var j = 0;
  while (j < a.length - i && j < b.length - i && a[a.length - 1 - j] == b[b.length - 1 - j]) {
    j++;
  }
  final restA = a.length - i - j, restB = b.length - i - j;
  if (restA <= 1 && restB <= 1) return true;
  return restA == 2 && restB == 2 && a[i] == b[i + 1] && a[i + 1] == b[i];
}

// Built in reverse so that, as before, the earlier aisle wins a shared word.
final _exact = {for (final (c, ws) in _words.reversed) for (final w in ws) w: c};
final _stems = {for (final (c, ws) in _words.reversed) for (final w in ws) _stem(w): c};
final _plains = {for (final (c, ws) in _words.reversed) for (final w in ws) _plain(w): c};
final _guessed = <String, String>{};

/// Best aisle for a typed item name; "Other" when nothing matches.
String guessAisle(String name) {
  final text = name.trim().replaceAll(RegExp(r'\s+'), ' ');
  // Items without an aisle are guessed on every build.
  return _guessed[text] ??= _guess(text);
}

String _guess(String text) {
  for (final (p, c) in _phrases) {
    if (text.contains(p)) return c;
  }
  // The first word names the thing ("קמח לבן" is flour, not dairy).
  for (final word in text.split(' ')) {
    final forms = _bare(word);
    for (final f in forms) {
      if (_exact[f] case final c?) return c;
    }
    for (final f in forms) {
      if (_stems[_stem(f)] case final c?) return c;
    }
    for (final f in forms.map(_plain)) {
      for (final MapEntry(key: w, value: c) in _plains.entries) {
        if (_slip(f, w)) return c;
      }
    }
  }
  return 'Other';
}

/// What the typed name probably meant ("חלוב" → "חלב", "חלות"), from the
/// names in [known] and the aisle words; at most 3, none when it looks right.
/// Only offered, never applied: in Hebrew one letter is often another word.
List<String> didYouMean(String typed, Iterable<String> known) {
  final text = typed.trim().replaceAll(RegExp(r'\s+'), ' ');
  final names = known.map((k) => k.trim().replaceAll(RegExp(r'\s+'), ' ')).toList();
  if (text.isEmpty || names.any((n) => _plain(n) == _plain(text))) return const [];
  final whole = names.where((n) => oneSlip(n, text));
  if (whole.isNotEmpty) return whole.take(3).toList();
  // Your own words first, then the aisle words.
  final vocab = {
    for (final n in names) ...n.split(' '),
    for (final (_, ws) in _words) ...ws,
    for (final (p, _) in _phrases) ...p.split(' '),
  };
  final stems = {for (final v in vocab) _stem(v)};
  final words = text.split(' ');
  final fixes = [
    for (final w in words)
      _bare(w).any((f) => stems.contains(_stem(f))) ? const <String>[] : vocab.where((v) => oneSlip(w, v)).toList(),
  ];
  final first = fixes.indexWhere((f) => f.isNotEmpty);
  if (first < 0) return const [];
  // Options for the first wrong word; any later one takes its likeliest fix.
  return [
    for (final option in fixes[first].take(3))
      [
        for (var i = 0; i < words.length; i++)
          i == first ? option : (i > first && fixes[i].isNotEmpty ? fixes[i].first : words[i]),
      ].join(' '),
  ];
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
