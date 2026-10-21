// Names whose saved aisle differs from today's guess: the words guessAisle
// still lacks. Input: the JSON docs/setup/aisle-misses.ps1 writes.
// Run: dart run tool/aisle_misses.dart <file>
import 'dart:convert';
import 'dart:io';

import 'package:todo_shopping/lists/logic.dart';

void main(List<String> args) {
  final rows = (jsonDecode(File(args.single).readAsStringSync()) as List).cast<Map>();
  final seen = <String>{};
  final misses = <String>[];
  for (final r in rows) {
    final name = '${r['name'] ?? ''}'.trim();
    final saved = '${r['category'] ?? ''}';
    if (name.isEmpty || !categories.contains(saved) || !seen.add(historyKey(name))) continue;
    final guess = guessAisle(name);
    if (guess != saved) misses.add('$saved\t<- guess $guess\t$name');
  }
  misses.sort();
  stdout.writeln(misses.join('\n'));
  stderr.writeln('${misses.length} of ${seen.length} names differ');
}
