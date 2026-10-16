// The app's own Firestore code against the real rules, on the emulators.
// From the repo root (Windows):
//   firebase.cmd emulators:exec --only auth,firestore --project alex-todo-shopping
//     "flutter test integration_test -d windows"
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:todo_shopping/core/app_info.dart';
import 'package:todo_shopping/core/report.dart';
import 'package:todo_shopping/core/settings_store.dart';
import 'package:todo_shopping/firebase_options.dart';
import 'package:todo_shopping/lists/repo.dart';
import 'package:todo_shopping/main.dart';
import 'package:todo_shopping/ui/gates.dart';

Future<void> signIn(String email) async {
  final auth = FirebaseAuth.instance;
  await auth.signOut();
  try {
    await auth.createUserWithEmailAndPassword(email: email, password: 'secret123');
  } on FirebaseAuthException {
    await auth.signInWithEmailAndPassword(email: email, password: 'secret123');
  }
}

Future<List<Item>> items(TodoList l) async => [
      for (final d in (await FirebaseFirestore.instance
              .collection('lists/${l.id}/items')
              .where('listCreatedAt', isEqualTo: l.createdAt)
              .get())
          .docs)
        Item(d.id, d.data()),
    ];

Future<TodoList> list(String id) async =>
    TodoList(id, (await FirebaseFirestore.instance.doc('lists/$id').get()).data()!);

Future<void> settle() => Future<void>.delayed(const Duration(seconds: 1));

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  setUpAll(() async {
    await Firebase.initializeApp(options: DefaultFirebaseOptions.currentPlatform);
    FirebaseFirestore.instance.useFirestoreEmulator('127.0.0.1', 8080);
    await FirebaseAuth.instance.useAuthEmulator('127.0.0.1', 9099);
    await AppInfo.load();
    await SettingsStore.instance.load();
  });

  testWidgets('every write the app makes passes the rules', (tester) async {
    await signIn('alex@example.com');
    final alex = uid;
    final shopId = await createList('קניות', 'shopping');
    var shop = await list(shopId);
    expect(shop.createdAt, isNotNull);

    // Quick add: aisle from the name, history counted.
    expect(addQuick(shop, 'חלב', '2'), 'Dairy & Eggs');
    addQuick(shop, 'חלב', '1');
    addQuick(shop, 'לחם', '');
    await settle();
    var all = await items(shop);
    expect(all.map((i) => i.name), containsAll(['חלב', 'לחם']));
    final hist = await history(shop).first;
    expect(hist.firstWhere((h) => h.name == 'חלב').count, 2);

    // Tick, untick, delete with undo, join duplicates.
    final bread = all.firstWhere((i) => i.name == 'לחם');
    await setDone(shop.id, [bread], true);
    await setDone(shop.id, [bread], false);
    await deleteItems(shop.id, [bread]);
    await restoreItems(shop.id, [bread]);
    final milk = all.where((i) => i.name == 'חלב').toList();
    await joinItems(shop.id, [(keep: milk[0], name: null, description: '3', drop: [milk[1]])]);
    all = await items(shop);
    expect(all.where((i) => i.name == 'חלב').length, 1);

    // The full editor's fields for a task, and a repeating tick.
    final todoId = await createList('משימות', 'todo');
    final todo = await list(todoId);
    await createItem(todo, {
      'name': 'ארנונה',
      'state': false,
      'description': '',
      'date': DateTime.now().millisecondsSinceEpoch,
      'dueAt': DateTime(2026, 10, 1).millisecondsSinceEpoch,
      'priority': 'high',
      'repeat': 'monthly',
      'assignee': null,
      'remindAt': DateTime(2026, 9, 30, 18).millisecondsSinceEpoch,
      'reminded': false,
    });
    final task = (await items(todo)).single;
    await setDone(todo.id, [task], true);
    final moved = (await items(todo)).single;
    expect(moved.done, isFalse);
    expect(moved.dueAt, greaterThan(task.dueAt!));
    await updateItem(todo.id, task.id, {
      'name': 'ארנונה לעירייה',
      'state': true,
      'doneBy': alex,
      'description': 'הוראת קבע',
      'date': task.date,
      'dueAt': null,
      'priority': 'normal',
      'repeat': null,
      'assignee': alex,
      'remindAt': null,
      'reminded': false,
    });

    // Member card, main list, push token, profile switches, problem report.
    await saveMemberCard(shop);
    await setMainList(shop.id);
    await FirebaseFirestore.instance
        .collection('users/$alex/tokens')
        .doc('tok')
        .set({'platform': 'android', 'updatedAt': FieldValue.serverTimestamp()});
    await FirebaseFirestore.instance
        .doc('users/$alex')
        .set({'notify': {'morning': false}}, SetOptions(merge: true));
    await sendProblemReport('בדיקה');

    // A household; the list filed under it; an invite for a second account.
    final houseId = await createHousehold('הבית');
    final house =
        Household(houseId, (await FirebaseFirestore.instance.doc('households/$houseId').get()).data()!);
    await setHousehold(shop.id, house);
    final link = await createInvite('household', house.id, house.name);
    final inviteId = link.split('/').last;

    // Merge: another shopping list of mine into this one.
    final otherId = await createList('קניות 2', 'shopping');
    final other = await list(otherId);
    addQuick(other, 'ביצים', '12');
    await settle();
    shop = await list(shop.id);
    await mergeList(shop, other);
    expect((await items(shop)).map((i) => i.name), contains('ביצים'));

    // Dana joins the household and sees the list through it.
    await signIn('dana@example.com');
    final inv = await getInvite(inviteId);
    expect(inv?.kind, 'household');
    await joinInvite(inviteId, inv!);
    final seen = await FirebaseFirestore.instance
        .collection('lists')
        .where('householdId', isEqualTo: house.id)
        .where('householdCreatedAt', isEqualTo: house.createdAt)
        .get();
    expect(seen.docs.map((d) => d.id), contains(shop.id));
    await createItem(shop, {'name': 'עגבניות', 'description': '1 ק״ג', 'category': 'Fruits & Vegetables'});
    await saveMemberCard(shop);
    await leave('households', house.id);

    // Alex renames and deletes what's his.
    await signIn('alex@example.com');
    await renameList(todo.id, 'סידורים');
    await deleteList(todo.id);
  });

  testWidgets('the app opens on the lists and adds from quick add', (tester) async {
    await signIn('ui@example.com');
    // A new device starts the walkthrough over everything; this test is past it.
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('tour_version', AppInfo.version);
    await prefs.remove('starter-lists-created'); // per device, kept from an earlier run

    await tester.pumpWidget(const App(home: Gates()));
    for (var i = 0; i < 60 && find.text('קניות').evaluate().isEmpty; i++) {
      await tester.pump(const Duration(milliseconds: 250));
    }
    // A new account starts with a shopping list and a task list.
    expect(find.text('קניות'), findsWidgets);
    expect(find.text('משימות'), findsWidgets);
    await tester.tap(find.text('קניות').first);
    for (var i = 0; i < 12; i++) {
      await tester.pump(const Duration(milliseconds: 250));
    }
    await tester.enterText(find.byType(TextField).first, 'חלב, ביצים');
    await tester.testTextInput.receiveAction(TextInputAction.send);
    for (var i = 0; i < 20 && find.text('ביצים').evaluate().isEmpty; i++) {
      await tester.pump(const Duration(milliseconds: 250));
    }
    expect(find.text('ביצים'), findsOneWidget);
    expect(find.text('חלב וביצים'), findsOneWidget); // the aisle heading
    await tester.tap(find.text('ביצים'));
    for (var i = 0; i < 8; i++) {
      await tester.pump(const Duration(milliseconds: 250));
    }
    expect(find.text('נשארו 1 פריטים לקנות'), findsOneWidget);
  });
}
