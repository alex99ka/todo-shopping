import 'package:flutter_test/flutter_test.dart';
import 'package:todo_shopping/lists/logic.dart';

// The Ionic app's test/unit tests, ported: both versions must write the same data.
int at(String s) => DateTime.parse(s).millisecondsSinceEpoch;

void main() {
  test('repeating deadlines roll forward, past today when done late', () {
    final now = at('2026-10-05T09:00');
    expect(nextDue(at('2026-10-05T00:00'), 'weekly', now), at('2026-10-12T00:00'));
    expect(nextDue(at('2026-09-20T00:00'), 'weekly', now), at('2026-10-11T00:00'));
    expect(nextDue(at('2026-01-31T00:00'), 'monthly', at('2026-01-31T09:00')),
        at('2026-02-28T00:00'));
    // Across the end of summer time, still local midnight.
    expect(nextDue(at('2026-10-22T00:00'), 'weekly', at('2026-10-22T09:00')),
        at('2026-10-29T00:00'));
  });

  test('ticking a repeating task moves it instead of finishing it', () {
    final now = at('2026-10-05T09:00');
    final task = {'name': 'ארנונה', 'state': false, 'description': '', 'date': 1};
    expect(tickChanges(task, true, 'u1', now), {'state': true, 'doneBy': 'u1'});
    expect(tickChanges(task, false, 'u1', now), {'state': false, 'doneBy': null});
    final repeating = {
      ...task,
      'repeat': 'monthly',
      'dueAt': at('2026-10-05T00:00'),
      'remindAt': at('2026-10-04T18:00'),
    };
    expect(tickChanges(repeating, true, 'u1', now), {
      'dueAt': at('2026-11-05T00:00'),
      'remindAt': at('2026-11-04T18:00'),
      'reminded': false,
    });
  });

  test('quick entries split and carry a quantity', () {
    expect(splitEntries('חלב, ביצים\n- לחם\n\n2) גבינה'), ['חלב', 'ביצים', 'לחם', 'גבינה']);
    expect(parseEntry('2 חלב'), (name: 'חלב', quantity: '2'));
    expect(parseEntry('חלב x2'), (name: 'חלב', quantity: '2'));
    expect(parseEntry('חלב 3'), (name: 'חלב', quantity: '3'));
    expect(parseEntry('1 ק״ג עגבניות'), (name: 'עגבניות', quantity: '1 ק״ג'));
    expect(parseEntry('עגבניות 1.5 ק"ג'), (name: 'עגבניות', quantity: '1.5 ק"ג'));
    expect(parseEntry('לחם מלא'), (name: 'לחם מלא', quantity: ''));
    expect(historyKey('  Oat  Milk '), historyKey('oat milk'));
    expect(historyKey('a/b').contains('/'), isFalse);
    // What JS encodeURIComponent gives, so 3.x's history docs are found.
    expect(historyKey('חלב'), '%D7%97%D7%9C%D7%91');
    expect(historyKey("it's (ok)!"), "it's%20(ok)!");
  });

  test('amounts parse into grams, kilos, litres or units', () {
    expect(parseAmount('400 גרם'), (value: 400.0, unit: 'g'));
    expect(parseAmount('1,5 ק"ג'), (value: 1.5, unit: 'kg'));
    expect(parseAmount('1/2 ק״ג'), (value: 0.5, unit: 'kg'));
    expect(parseAmount('200 מ״ל'), (value: 0.2, unit: 'l'));
    expect(parseAmount('2'), (value: 2.0, unit: 'unit'));
    expect(parseAmount("3 יח'"), (value: 3.0, unit: 'unit'));
    expect(parseAmount('1,000 גרם'), (value: 1000.0, unit: 'g'));
    expect(parseAmount('2 כפות'), isNull);
    expect(parseAmount('קצת'), isNull);
  });

  test('joining lines adds up what can be added', () {
    expect(joinAmounts(['400 גרם', '700 גרם']), '1.1 ק״ג');
    expect(joinAmounts(['400 גרם', '0.5 ק״ג']), '900 גרם');
    expect(joinAmounts(['1 ליטר', '500 מ"ל']), '1.5 ליטר');
    expect(joinAmounts(['2', "3 יח'"]), '5 יח׳');
    expect(joinAmounts(['', '700 גרם']), '700 גרם');
    expect(joinAmounts(['', '']), '');
    expect(joinAmounts(['400 גרם', '2 יח׳']), '400 גרם + 2 יח׳');
    expect(joinAmounts(['2 כפות', '1 כף']), '2 כפות + 1 כף');
    expect(addAmounts(['400 גרם', '2 יח׳']), isNull);
    expect(addAmounts(['', '2 יח׳']), '2 יח׳');
  });

  test('duplicates are open items with the same name, oldest first', () {
    final items = [
      ('בשר טחון', 2, false),
      ('חלב', 1, false),
      (' בשר  טחון', 1, false),
      ('חלב', 3, true),
    ];
    final groups = duplicateGroups(items,
        name: (i) => i.$1, done: (i) => i.$3, date: (i) => i.$2);
    expect(groups, [
      [(' בשר  טחון', 1, false), ('בשר טחון', 2, false)]
    ]);
  });

  test('quick-add guesses the aisle from the item name', () {
    expect(guessAisle('חלב'), 'Dairy & Eggs');
    expect(guessAisle('קמח לבן'), 'Pantry');
    expect(guessAisle('פלפל שחור'), 'Spices & Sauces');
    expect(guessAisle('פלפל אדום'), 'Fruits & Vegetables');
    expect(guessAisle('דגני בוקר'), 'Pantry');
    expect(guessAisle('  נייר   טואלט '), 'Household');
    expect(guessAisle('בשר טחון'), 'Meat & Fish');
    expect(guessAisle('משהו אחר'), 'Other');
  });

  test('deadline words', () {
    final now = DateTime(2026, 10, 5, 9);
    expect(dueText(DateTime(2026, 10, 5).millisecondsSinceEpoch, now), 'היום');
    expect(dueText(DateTime(2026, 10, 6).millisecondsSinceEpoch, now), 'מחר');
    expect(dueText(DateTime(2026, 10, 1).millisecondsSinceEpoch, now), startsWith('באיחור'));
  });
}
