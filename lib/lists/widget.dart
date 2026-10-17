import 'dart:convert';
import 'dart:ui';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_core/firebase_core.dart';

import '../core/home_widgets.dart';
import '../firebase_options.dart';
import 'logic.dart';
import 'repo.dart';

/// The home screen widget's data: every list (the main shopping list first,
/// then shopping, then tasks), each with its open items in the app's order.
/// HomeWidgets.kt shows one list at a time and flips between them.
String widgetJson(List<TodoList> lists, List<Item>? Function(String id) itemsOf, String? mainId) {
  final known = lists.where((l) => itemsOf(l.id) != null).toList()
    ..sort((a, b) {
      if (a.id == mainId) return -1;
      if (b.id == mainId) return 1;
      if (a.shopping != b.shopping) return a.shopping ? -1 : 1;
      return a.name.compareTo(b.name);
    });
  return jsonEncode({
    'lists': [
      for (final l in known)
        {
          'id': l.id,
          'name': l.name,
          'shopping': l.shopping,
          'items': [
            for (final i in openInOrder(l, itemsOf(l.id)!).take(30))
              {'id': i.id, 'name': i.name, 'note': i.description.split('\n').first},
          ],
        },
    ],
  });
}

/// Open items as the list screen orders them: shopping by aisle then name,
/// tasks by deadline, then priority, then age.
List<Item> openInOrder(TodoList l, List<Item> items) {
  final open = items.where((i) => !i.done).toList();
  if (l.shopping) {
    return open
      ..sort((a, b) {
        final c = categories.indexOf(a.aisle).compareTo(categories.indexOf(b.aisle));
        return c != 0 ? c : a.name.compareTo(b.name);
      });
  }
  const rank = {'high': 0, 'normal': 1, 'low': 2};
  int due(Item i) => i.dueAt ?? 1 << 62;
  return open
    ..sort((a, b) {
      final d = due(a).compareTo(due(b));
      if (d != 0) return d;
      final r = (rank[a.priority] ?? 1).compareTo(rank[b.priority] ?? 1);
      return r != 0 ? r : a.date.compareTo(b.date);
    });
}

/// A tap on the widget, run in the background with the app closed:
/// `check?list=…&item=…` crosses an item off; every tap then re-reads the
/// lists so the widget shows what others changed meanwhile.
@pragma('vm:entry-point')
Future<void> widgetBackground(Uri? uri) async {
  DartPluginRegistrant.ensureInitialized();
  if (Firebase.apps.isEmpty) {
    await Firebase.initializeApp(options: DefaultFirebaseOptions.currentPlatform);
  }
  if (FirebaseAuth.instance.currentUser == null) return;
  final db = FirebaseFirestore.instance;
  if (uri?.host == 'check') {
    final list = uri!.queryParameters['list'];
    final item = uri.queryParameters['item'];
    if (list != null && item != null) {
      final ref = db.doc('lists/$list/items/$item');
      final d = (await ref.get()).data();
      // A repeating task moves to its next deadline instead of finishing.
      if (d != null && d['state'] != true) await ref.update(tickChanges(d, true, uid));
    }
  }
  await refreshWidgetFromServer();
}

/// Everything the widget shows, read straight from Firestore (the app's live
/// store isn't running in the background).
Future<void> refreshWidgetFromServer() async {
  final db = FirebaseFirestore.instance;
  final me = uid;
  final lists = <String, TodoList>{};
  for (final d in (await db.collection('lists').where('memberUids', arrayContains: me).get()).docs) {
    lists[d.id] = TodoList(d.id, d.data());
  }
  final houses = await db.collection('households').where('memberUids', arrayContains: me).get();
  for (final h in houses.docs) {
    try {
      final filed = await db
          .collection('lists')
          .where('householdId', isEqualTo: h.id)
          .where('householdCreatedAt', isEqualTo: h.data()['createdAt'])
          .get();
      for (final d in filed.docs) {
        lists[d.id] = TodoList(d.id, d.data());
      }
    } catch (_) {} // one household failing must not blank the rest
  }
  final items = <String, List<Item>>{};
  for (final l in lists.values.where((l) => l.createdAt != null)) {
    final s = await db
        .collection('lists/${l.id}/items')
        .where('listCreatedAt', isEqualTo: l.createdAt)
        .where('state', isEqualTo: false)
        .get();
    items[l.id] = [for (final d in s.docs) Item(d.id, d.data())];
  }
  final main = (await db.doc('users/$me').get()).data()?['recipeListId'] as String?;
  await pushWidgetData(widgetJson(lists.values.toList(), (id) => items[id], main));
}
