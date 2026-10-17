import 'dart:convert';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:file_selector/file_selector.dart';
import 'package:flutter/foundation.dart';
import 'package:share_plus/share_plus.dart';

import '../lists/logic.dart';
import '../lists/repo.dart';

/// Settings › "ייצוא נתונים": every list you can see with its items, as one
/// JSON plus a CSV of all items for a spreadsheet. Android and the web: the
/// share sheet (the web downloads). Windows: a save dialog per file.
Future<int> exportData() async {
  final store = Lists.instance;
  final all = {
    'households': [for (final h in store.households) {'id': h.id, ...h.d}],
    'lists': [
      for (final l in store.all)
        {
          'id': l.id,
          ...l.d,
          'items': [for (final i in store.itemsOf(l.id) ?? <Item>[]) {'id': i.id, ...i.d}],
        },
    ],
  };
  String date(int? ms) =>
      ms == null ? '' : DateTime.fromMillisecondsSinceEpoch(ms).toIso8601String().substring(0, 16);
  final rows = [
    for (final l in store.all)
      for (final i in store.itemsOf(l.id) ?? <Item>[])
        {
          'רשימה': l.name,
          'פריט': i.name,
          'כמות / הערות': i.description,
          'בוצע': i.done ? 'כן' : '',
          'מחלקה': l.shopping ? categoryLabels[i.aisle] : '',
          'תאריך יעד': date(i.dueAt),
          'תזכורת': date(i.remindAt),
        },
  ];
  final stamp = DateTime.now().toIso8601String().substring(0, 10);
  final files = <XFile>[
    _file('todo-shopping-$stamp.json',
        JsonEncoder.withIndent('  ', _plain).convert(all), 'application/json'),
    _file('items-$stamp.csv', toCsv(rows), 'text/csv'),
  ];
  if (!kIsWeb && defaultTargetPlatform == TargetPlatform.windows) {
    for (final f in files) {
      final where = await getSaveLocation(suggestedName: f.name);
      if (where == null) continue;
      await f.saveTo(where.path);
    }
  } else {
    await SharePlus.instance.share(ShareParams(files: files, title: 'ייצוא נתונים'));
  }
  return rows.length;
}

Object? _plain(Object? v) => v is Timestamp ? v.toDate().toIso8601String() : '$v';

XFile _file(String name, String text, String mime) =>
    // BOM so Excel reads Hebrew CSV as UTF-8.
    XFile.fromData(Uint8List.fromList(utf8.encode('﻿$text')),
        name: name, mimeType: mime);

/// Rows → CSV with every key seen as a column. Timestamps become ISO dates.
String toCsv(List<Map<String, dynamic>> rows) {
  final keys = <String>{for (final r in rows) ...r.keys}.toList();
  String cell(Object? v) {
    final s = switch (v) {
      null => '',
      Timestamp() => v.toDate().toIso8601String(),
      _ => '$v',
    };
    return RegExp(r'[",\n\r]').hasMatch(s) ? '"${s.replaceAll('"', '""')}"' : s;
  }

  return [
    keys.map(cell).join(','),
    for (final r in rows) keys.map((k) => cell(r[k])).join(','),
  ].join('\r\n');
}
