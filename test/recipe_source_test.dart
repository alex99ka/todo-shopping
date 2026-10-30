import 'package:flutter_test/flutter_test.dart';
import 'package:todo_shopping/lists/repo.dart';

void main() {
  test('joined lines name the latest recipe that has one', () {
    Item i(int date, [String? recipe]) => Item('$date', {'date': date, 'recipe': ?recipe});
    expect(newestRecipe([i(1, '×ž×¨×§'), i(3, '×¤×©×˜×™×“×”'), i(2, '×¡×œ×˜')]), '×¤×©×˜×™×“×”');
    expect(newestRecipe([i(1, '×ž×¨×§'), i(3)]), '×ž×¨×§', reason: 'a line typed by hand has none');
    expect(newestRecipe([i(1), i(2)]), '');
  });
}
