import 'dart:async';
import 'dart:convert';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../core/server.dart';
import 'logic.dart';

/// Firestore, in the shapes the rules (firestore.rules) and the 3.x app use.
/// Writes are not awaited by the screens: offline they resolve only once
/// synced, and the local cache shows them at once.
FirebaseFirestore get _db => FirebaseFirestore.instance;
String get uid => FirebaseAuth.instance.currentUser?.uid ?? '';
int get _now => DateTime.now().millisecondsSinceEpoch;

class TodoList {
  TodoList(this.id, this.d);
  final String id;
  final Map<String, dynamic> d;

  String get name => '${d['name'] ?? ''}';
  String get ownerUid => '${d['ownerUid'] ?? ''}';
  bool get mine => ownerUid == uid;

  /// Lists from before `kind` existed were shopping lists only when named "Shopping".
  bool get shopping => d['kind'] != null ? d['kind'] == 'shopping' : name == 'Shopping';

  /// Null until a list made offline reaches the server.
  Timestamp? get createdAt => d['createdAt'] as Timestamp?;
  List<String> get memberUids => [...?(d['memberUids'] as List?)?.cast<String>()];
  String? get householdId => d['householdId'] as String?;
  Timestamp? get householdCreatedAt => d['householdCreatedAt'] as Timestamp?;
}

class Household {
  Household(this.id, this.d);
  final String id;
  final Map<String, dynamic> d;

  String get name => '${d['name'] ?? ''}';
  String get ownerUid => '${d['ownerUid'] ?? ''}';
  Timestamp? get createdAt => d['createdAt'] as Timestamp?;
  List<String> get memberUids => [...?(d['memberUids'] as List?)?.cast<String>()];
}

class Item {
  Item(this.id, this.d);
  final String id;
  final Map<String, dynamic> d;

  String get name => '${d['name'] ?? ''}';
  bool get done => d['state'] == true;
  String get description => '${d['description'] ?? ''}';
  int get date => (d['date'] as num?)?.toInt() ?? 0;
  String? get category => d['category'] as String?;
  int? get dueAt => _ms(d['dueAt']);
  int? get remindAt => _ms(d['remindAt']);
  String get priority => '${d['priority'] ?? 'normal'}';
  String? get repeat => d['repeat'] as String?;
  String? get by => d['by'] as String?;
  String? get doneBy => d['doneBy'] as String?;
  String? get assignee => d['assignee'] as String?;

  static int? _ms(Object? v) {
    final n = (v as num?)?.toInt();
    return n == null || n == 0 ? null : n;
  }

  /// The aisle it's shown under: its own, else what its name suggests
  /// (items from Home Assistant come without one).
  String get aisle => categories.contains(category) ? category! : aisleFor(name);
}

class MemberCard {
  MemberCard(this.uid, this.name, this.photo);
  final String uid;
  final String name;
  final String photo;
}

class HistoryEntry {
  HistoryEntry(this.id, this.name, this.category, this.count);
  final String id;
  final String name;
  final String? category;
  final int count;
}

typedef Summary = ({int total, int open, int overdue, int today});

Summary summarize(List<Item> items) {
  final open = items.where((i) => !i.done).toList();
  return (
    total: items.length,
    open: open.length,
    overdue: open.where((i) => i.dueAt != null && isBeforeToday(i.dueAt!)).length,
    today: open.where((i) => i.dueAt != null && isToday(i.dueAt!)).length,
  );
}

/// Everything the signed-in user can see, live: their households, their lists
/// (direct and through a household), each list's items, and the main shopping
/// list. One listener per list serves both the home rows and the list screen.
class Lists extends ChangeNotifier {
  Lists._();
  static final instance = Lists._();

  List<Household> households = [];
  final _direct = <String, TodoList>{};
  final _viaHouse = <String, Map<String, TodoList>>{};
  final _items = <String, List<Item>>{};
  bool loaded = false;
  String? mainListId;
  Object? error;

  final _subs = <StreamSubscription<Object?>>[];
  final _houseSubs = <String, StreamSubscription<Object?>>{};
  final _itemSubs = <String, (Timestamp, StreamSubscription<Object?>)>{};
  String? _for;

  List<TodoList> get all {
    final m = <String, TodoList>{
      for (final g in _viaHouse.values) ...g,
      ..._direct,
    };
    return m.values.toList();
  }

  TodoList? byId(String id) => _direct[id] ?? {for (final g in _viaHouse.values) ...g}[id];
  List<Item>? itemsOf(String listId) => _items[listId];

  /// Once per signed-in account; signing out (or in as someone else) resets.
  void start() {
    if (_for == uid) return;
    stop();
    _for = uid;
    final me = uid;
    _subs.add(_db
        .collection('lists')
        .where('memberUids', arrayContains: me)
        .snapshots()
        .listen((s) {
      _direct
        ..clear()
        ..addEntries(s.docs.map((d) => MapEntry(d.id, TodoList(d.id, d.data()))));
      loaded = true;
      _sync();
    }, onError: _failed));
    _subs.add(_db
        .collection('households')
        .where('memberUids', arrayContains: me)
        .snapshots()
        .listen((s) {
      households = [for (final d in s.docs) Household(d.id, d.data())]
        ..sort((a, b) => a.name.compareTo(b.name));
      _watchHouseholds();
      _sync();
    }, onError: _failed));
    _subs.add(_db.doc('users/$me').snapshots().listen((s) {
      mainListId = s.data()?['recipeListId'] as String?;
      notifyListeners();
    }, onError: (_) {}));
  }

  void stop() {
    for (final s in [..._subs, ..._houseSubs.values, ..._itemSubs.values.map((e) => e.$2)]) {
      s.cancel();
    }
    _subs.clear();
    _houseSubs.clear();
    _itemSubs.clear();
    _direct.clear();
    _viaHouse.clear();
    _items.clear();
    households = [];
    loaded = false;
    mainListId = null;
    _for = null;
  }

  void _failed(Object e) {
    error = e;
    loaded = true;
    notifyListeners();
  }

  // Both filters are needed: the rules only let housemates read lists whose
  // householdCreatedAt matches the household's (rules are not filters).
  void _watchHouseholds() {
    final ids = {for (final h in households) h.id};
    for (final gone in _houseSubs.keys.where((k) => !ids.contains(k)).toList()) {
      _houseSubs.remove(gone)?.cancel();
      _viaHouse.remove(gone);
    }
    for (final h in households) {
      if (_houseSubs.containsKey(h.id) || h.createdAt == null) continue;
      _houseSubs[h.id] = _db
          .collection('lists')
          .where('householdId', isEqualTo: h.id)
          .where('householdCreatedAt', isEqualTo: h.createdAt)
          .snapshots()
          .listen((s) {
        _viaHouse[h.id] = {for (final d in s.docs) d.id: TodoList(d.id, d.data())};
        _sync();
      }, onError: (_) {
        // One failing household (just left it) must not blank the rest.
        _viaHouse.remove(h.id);
        _sync();
      });
    }
  }

  // Items are bound to their list's createdAt; the query must say so too.
  void _sync() {
    final lists = {for (final l in all) l.id: l};
    for (final id in _itemSubs.keys.toList()) {
      final l = lists[id];
      if (l == null || l.createdAt != _itemSubs[id]!.$1) {
        _itemSubs.remove(id)!.$2.cancel();
        _items.remove(id);
      }
    }
    for (final l in lists.values) {
      final created = l.createdAt;
      if (created == null || _itemSubs.containsKey(l.id)) continue;
      _itemSubs[l.id] = (
        created,
        _db
            .collection('lists/${l.id}/items')
            .where('listCreatedAt', isEqualTo: created)
            .snapshots()
            .listen((s) {
          _items[l.id] = [for (final d in s.docs) Item(d.id, d.data())];
          notifyListeners();
        }, onError: (_) {})
      );
    }
    notifyListeners();
  }
}

// ---- lists ----

Future<String> createList(String name, String kind, [Household? household]) async {
  final ref = _db.collection('lists').doc();
  final write = ref.set({
    'ownerUid': uid,
    'name': name,
    'kind': kind,
    'date': _now,
    'createdAt': FieldValue.serverTimestamp(),
    'memberUids': [uid],
    'joinedAt': {uid: FieldValue.serverTimestamp()},
    'householdId': household?.id,
    'householdCreatedAt': household?.createdAt,
  });
  // Online, wait for the server (opening the list before it exists there is
  // denied); offline the write resolves only once synced, so don't wait long.
  await write.timeout(const Duration(seconds: 8), onTimeout: () {});
  return ref.id;
}

Future<void> renameList(String id, String name) =>
    _db.doc('lists/$id').update({'name': name});

Future<void> deleteList(String id) => _db.doc('lists/$id').delete();

Future<void> setHousehold(String listId, Household? h) => _db
    .doc('lists/$listId')
    .update({'householdId': h?.id, 'householdCreatedAt': h?.createdAt});

/// Drop only yourself from memberUids/joinedAt. A FieldPath keeps a uid with
/// dots one key.
Future<void> leave(String collection, String id) => _db.doc('$collection/$id').update({
      'memberUids': FieldValue.arrayRemove([uid]),
      FieldPath(['joinedAt', uid]): FieldValue.delete(),
    });

Future<void> setMainList(String listId) =>
    _db.doc('users/$uid').set({'recipeListId': listId}, SetOptions(merge: true));

/// Moves another list of yours into [target] in one batch: its items are
/// copied, whoever could see it joins [target], and it is deleted. The rules
/// allow the new members only because of that delete (isMerge).
Future<void> mergeList(TodoList target, TodoList source) async {
  final items = await _db
      .collection('lists/${source.id}/items')
      .where('listCreatedAt', isEqualTo: source.createdAt)
      .get();
  final house = Lists.instance.households.where((h) =>
      h.id == source.householdId && h.createdAt == source.householdCreatedAt).firstOrNull;
  // A personal list joins the source's household; one in another household gets its people.
  final adopt = house != null && target.householdId == null;
  final viewers = {
    ...source.memberUids,
    if (house != null && !adopt && house.id != target.householdId) ...house.memberUids,
  };
  final added = viewers.where((u) => !target.memberUids.contains(u)).toList();
  final batch = _db.batch();
  batch.update(_db.doc('lists/${target.id}'), {
    'mergedFrom': source.id,
    if (added.isNotEmpty) 'memberUids': FieldValue.arrayUnion(added),
    if (adopt) ...{'householdId': house.id, 'householdCreatedAt': house.createdAt},
    for (final u in added) FieldPath(['joinedAt', u]): FieldValue.serverTimestamp(),
  });
  // Same ids in the new list: they are random, so they can't clash.
  for (final d in items.docs) {
    final item = d.data();
    batch.set(_db.doc('lists/${target.id}/items/${d.id}'), {
      ...item,
      // doneBy may only name yourself.
      'doneBy': item['doneBy'] == uid ? uid : null,
      'listCreatedAt': target.createdAt,
      'by': uid,
    });
  }
  batch.delete(_db.doc('lists/${source.id}'));
  // shortcut: a batch caps at 500 writes, so a list of ~495 items fails; split if lists get that long.
  await batch.commit();
}

/// A new account starts with a shopping list and a task list instead of an
/// empty screen: only when the server (not a new device's empty cache) has
/// none and there's no household, and once per device.
Future<void> createStarterLists() async {
  const key = 'starter-lists-created';
  try {
    final prefs = await SharedPreferences.getInstance();
    if (prefs.getBool(key) == true) return;
    final mine = await _db
        .collection('lists')
        .where('memberUids', arrayContains: uid)
        .limit(1)
        .get(const GetOptions(source: Source.server))
        .timeout(const Duration(seconds: 10));
    final houses = await _db
        .collection('households')
        .where('memberUids', arrayContains: uid)
        .limit(1)
        .get(const GetOptions(source: Source.server))
        .timeout(const Duration(seconds: 10));
    await prefs.setBool(key, true);
    if (mine.docs.isEmpty && houses.docs.isEmpty) {
      await createList(shoppingListName, 'shopping');
      await createList('משימות', 'todo');
    }
  } catch (_) {
    // Offline: try again next launch.
  }
}

const shoppingListName = 'קניות';

/// "קניות · משפחה" or "קניות · אישית": tells apart lists with the same name.
String listLabel(TodoList l) {
  final where = l.householdId == null
      ? 'אישית'
      : Lists.instance.households.where((h) => h.id == l.householdId).firstOrNull?.name ??
          'משותפת';
  return '${l.name} · $where';
}

// ---- items ----

DocumentReference<Map<String, dynamic>> _item(String listId, String id) =>
    _db.doc('lists/$listId/items/$id');

String newItemId(String listId) => _db.collection('lists/$listId/items').doc().id;

Future<void> createItem(TodoList list, Map<String, Object?> fields, [String? id]) =>
    _item(list.id, id ?? newItemId(list.id)).set({
      'state': false,
      'description': '',
      'date': _now,
      ...fields,
      'listCreatedAt': list.createdAt,
      'by': uid,
    });

// update, not set: an edit to an item deleted elsewhere must fail.
Future<void> updateItem(String listId, String itemId, Map<String, Object?> changes) =>
    _item(listId, itemId).update(changes);

Future<void> setDone(String listId, List<Item> items, bool done) {
  final b = _db.batch();
  for (final i in items) {
    b.update(_item(listId, i.id), tickChanges(i.d, done, uid));
  }
  return b.commit();
}

Future<void> deleteItems(String listId, List<Item> items) {
  final b = _db.batch();
  for (final i in items) {
    b.delete(_item(listId, i.id));
  }
  return b.commit();
}

/// Undo of [deleteItems]: the same ids come back, added by whoever pressed undo.
Future<void> restoreItems(String listId, List<Item> items) {
  final b = _db.batch();
  for (final i in items) {
    b.set(_item(listId, i.id), {
      ...i.d,
      'doneBy': i.doneBy == uid ? uid : null,
      'by': uid,
    });
  }
  return b.commit();
}

/// Each group becomes its kept item with the joined amount (and a new name if
/// given); the others are deleted.
Future<void> joinItems(String listId,
    List<({Item keep, String? name, String description, List<Item> drop})> groups) {
  final b = _db.batch();
  for (final g in groups) {
    b.update(_item(listId, g.keep.id), {
      'description': g.description.length > 5000 ? g.description.substring(0, 5000) : g.description,
      if (g.name != null && g.name!.isNotEmpty)
        'name': g.name!.length > 500 ? g.name!.substring(0, 500) : g.name,
    });
    for (final i in g.drop) {
      b.delete(_item(listId, i.id));
    }
  }
  return b.commit();
}

// ---- members and history ----

Stream<Map<String, MemberCard>> members(TodoList l) => _db
    .collection('lists/${l.id}/members')
    .where('listCreatedAt', isEqualTo: l.createdAt)
    .snapshots()
    .map((s) => {
          for (final d in s.docs)
            d.id: MemberCard(d.id, '${d.data()['name'] ?? ''}', '${d.data()['photo'] ?? ''}'),
        })
    .handleError((_) {});

/// Your name and photo on this list, so housemates see who did what.
Future<void> saveMemberCard(TodoList l) {
  final u = FirebaseAuth.instance.currentUser!;
  final name = myName.value.isNotEmpty
      ? myName.value
      : (u.displayName?.isNotEmpty ?? false) ? u.displayName! : '${u.email}'.split('@').first;
  return _db.doc('lists/${l.id}/members/${u.uid}').set({
    'name': name.length > 60 ? name.substring(0, 60) : name,
    'photo': (u.photoURL ?? '').length > 500 ? '' : (u.photoURL ?? ''),
    'listCreatedAt': l.createdAt,
  });
}

// shortcut: the top 100 by count; a household's real vocabulary is far smaller.
Stream<List<HistoryEntry>> history(TodoList l) => _db
    .collection('lists/${l.id}/history')
    .where('listCreatedAt', isEqualTo: l.createdAt)
    .orderBy('count', descending: true)
    .limit(100)
    .snapshots()
    .map((s) => [
          for (final d in s.docs)
            HistoryEntry(d.id, '${d.data()['name'] ?? ''}', d.data()['category'] as String?,
                (d.data()['count'] as num?)?.toInt() ?? 0),
        ])
    .handleError((_) {});

/// Counts a name in the list's history, for suggestions.
Future<void> recordHistory(TodoList l, String name, [String? category]) {
  learnAisles([(name, category)]);
  return _db.doc('lists/${l.id}/history/${historyKey(name)}').set({
    'name': name.trim(),
    'category': ?category,
    'count': FieldValue.increment(1),
    'last': _now,
    'listCreatedAt': l.createdAt,
  }, SetOptions(merge: true));
}

const _learnedKey = 'learned-aisles';

/// [learnedAisles] as this device left them; once, at start.
Future<void> loadLearnedAisles() async {
  try {
    final s = (await SharedPreferences.getInstance()).getString(_learnedKey);
    if (s == null) return;
    for (final MapEntry(:key, :value) in (jsonDecode(s) as Map).entries) {
      learnedAisles.putIfAbsent('$key', () => '$value');
    }
  } catch (_) {}
}

/// Keeps the aisles these names were given, so every list on this device
/// reuses them, even ones a list's top-100 history no longer holds.
void learnAisles(Iterable<(String, String?)> named) {
  var changed = false;
  for (final (name, c) in named) {
    final k = historyKey(name);
    if (c == null || c == 'Other' || !categories.contains(c) || learnedAisles[k] == c) continue;
    learnedAisles.remove(k); // re-added last: the newest survive the cap
    learnedAisles[k] = c;
    changed = true;
  }
  if (!changed) return;
  while (learnedAisles.length > 3000) {
    learnedAisles.remove(learnedAisles.keys.first);
  }
  final s = jsonEncode(learnedAisles);
  SharedPreferences.getInstance().then((p) => p.setString(_learnedKey, s)).catchError((_) => false);
}

/// Adds [name] the quick way: a shopping item lands in the aisle that name had
/// before (on this list, else any list here), else the one its name suggests.
/// Returns that aisle.
String? addQuick(TodoList l, String name, String quantity,
    {String? known, List<HistoryEntry> past = const []}) {
  final before = past.where((h) => h.id == historyKey(name)).firstOrNull?.category;
  final category =
      l.shopping ? (known ?? (before == 'Other' ? null : before) ?? aisleFor(name)) : null;
  createItem(l, {
    'name': name,
    'description': quantity,
    'category': ?category,
  }).catchError((Object e) => reportWriteError(e, 'ההוספה נכשלה'));
  recordHistory(l, name, category).catchError((_) {});
  return category;
}

/// Set by the app: shows a failed background write.
void Function(Object error, String what) reportWriteError = (_, _) {};

// ---- households ----

Future<String> createHousehold(String name) async {
  final ref = await _db.collection('households').add({
    'ownerUid': uid,
    'name': name,
    'date': _now,
    'createdAt': FieldValue.serverTimestamp(),
    'memberUids': [uid],
    'joinedAt': {uid: FieldValue.serverTimestamp()},
  });
  return ref.id;
}

Future<void> renameHousehold(String id, String name) =>
    _db.doc('households/$id').update({'name': name});

// Lists filed under a deleted household stay with their own members.
Future<void> deleteHousehold(String id) => _db.doc('households/$id').delete();

/// Your own lists filed under it go with you: otherwise the people you left
/// would keep reading them.
Future<void> leaveHousehold(String id) async {
  for (final l in Lists.instance.all.where((l) => l.mine && l.householdId == id)) {
    await setHousehold(l.id, null);
  }
  await leave('households', id);
}

// ---- invites ----

const appUrl = 'https://alex-todo-shopping.web.app';

/// `/join/<inviteId>`: the random id is the secret; the rules let someone add
/// themselves only while recording an unexpired invite for that target.
Future<String> createInvite(String kind, String targetId, String targetName) async {
  final ref = await _db.collection('invites').add({
    'kind': kind,
    'targetId': targetId,
    'targetName': targetName.length > 100 ? targetName.substring(0, 100) : targetName,
    'createdBy': uid,
    'createdAt': FieldValue.serverTimestamp(),
  }).timeout(const Duration(seconds: 15));
  return '$appUrl/join/${ref.id}';
}

typedef Invite = ({String kind, String targetId, String targetName});

Future<Invite?> getInvite(String id) async {
  final d = (await _db.doc('invites/$id').get()).data();
  if (d == null) return null;
  return (kind: '${d['kind']}', targetId: '${d['targetId']}', targetName: '${d['targetName']}');
}

/// Joins and returns the list id to open (null for a household).
Future<String?> joinInvite(String inviteId, Invite inv) async {
  final target = _db.doc('${inv.kind == 'list' ? 'lists' : 'households'}/${inv.targetId}');
  // Readable already means a member (directly or through a household).
  final already = await target
      .get()
      .then((s) => (s.data()?['memberUids'] as List?)?.contains(uid) ?? false, onError: (_) => false);
  if (!already) {
    await target.update({
      'memberUids': FieldValue.arrayUnion([uid]),
      FieldPath(['joinedAt', uid]): FieldValue.serverTimestamp(),
      FieldPath(['invites', uid]): inviteId,
    });
  }
  return inv.kind == 'list' ? inv.targetId : null;
}

// ---- friends ----

/// Shared with the recipe book: its server keeps friends/{uid}.people (its
/// friendships) and the notifier .mates (everyone in your households). The
/// rules let you add any of them to a list you can use.
typedef Friend = ({String uid, String name, bool mate});

/// The recipe book's server, which owns the friendships.
const recipeApi = 'https://pi5-home-server-ts.tail4f470e.ts.net/api/v1';

Stream<List<Friend>> friends() => _db.doc('friends/$uid').snapshots().map((s) {
      Map<String, dynamic> of(String key) => (s.data()?[key] as Map?)?.cast<String, dynamic>() ?? {};
      String name(Object? v) => '${(v as Map?)?['name'] ?? ''}';
      final people = of('people'), mates = of('mates');
      return [
        for (final e in mates.entries) (uid: e.key, name: name(e.value), mate: true),
        for (final e in people.entries)
          if (!mates.containsKey(e.key)) (uid: e.key, name: name(e.value), mate: false),
      ]..sort((a, b) => a.name.compareTo(b.name));
    });

Future<void> addToList(String listId, List<String> uids) => _db.doc('lists/$listId').update({
      'memberUids': FieldValue.arrayUnion(uids),
      for (final u in uids) FieldPath(['joinedAt', u]): FieldValue.serverTimestamp(),
    });

/// Joining a list through someone's link also makes you their friend, in both
/// apps. Best effort: the list works without it.
Future<void> befriendInviter(String inviteId) =>
    server('POST', '/friends/from-invite', {'inviteId': inviteId}, recipeApi).then((_) {}, onError: (_) {});

Future<void> unfriend(String friendUid) => server('DELETE', '/friends/$friendUid', null, recipeApi);

// ---- names: the recipe book's, so both apps show the same ----

/// The name you chose for friends to see ('' = your Google name).
final myName = ValueNotifier('');

/// How each friend or housemate shows to you: your alias for them, else the
/// name they chose; and the aliases alone. Kept on the device for offline.
final shownNames = ValueNotifier<Map<String, String>>({});
final aliases = ValueNotifier<Map<String, String>>({});

String get _namesKey => 'names-$uid';

/// [fallback] (a Google name from Firestore) unless the recipe book knows better.
String nameOf(String uid, String fallback) {
  final n = shownNames.value[uid];
  return n == null || n.isEmpty ? fallback : n;
}

/// From the device at once, then from the recipe server. Best effort.
Future<void> loadNames() async {
  _setNames(const {});
  try {
    final s = (await SharedPreferences.getInstance()).getString(_namesKey);
    if (s != null) _setNames(jsonDecode(s) as Map<String, dynamic>);
  } catch (_) {}
  try {
    final me = await server('GET', '/me', null, recipeApi) as Map<String, dynamic>;
    final people = await server('GET', '/friends?mates=1', null, recipeApi) as List;
    final j = {'me': me['displayName'] ?? '', 'people': people};
    _setNames(j);
    (await SharedPreferences.getInstance()).setString(_namesKey, jsonEncode(j)).ignore();
  } catch (_) {}
}

void _setNames(Map<String, dynamic> j) {
  myName.value = '${j['me'] ?? ''}';
  final people = [for (final p in (j['people'] as List? ?? const [])) (p as Map).cast<String, dynamic>()];
  shownNames.value = {for (final p in people) '${p['uid']}': '${p['name'] ?? ''}'};
  _chosen = {for (final p in people) '${p['uid']}': '${p['chosen'] ?? p['name'] ?? ''}'};
  aliases.value = {
    for (final p in people)
      if ('${p['alias'] ?? ''}'.isNotEmpty) '${p['uid']}': '${p['alias']}',
  };
}

var _chosen = <String, String>{};

/// The name [friendUid] chose for themselves, whatever your alias for them.
String chosenName(String friendUid, String fallback) {
  final n = _chosen[friendUid];
  return n == null || n.isEmpty ? fallback : n;
}

/// A name for a friend only you see, in both apps; '' takes it away.
Future<void> setAlias(String friendUid, String alias) async {
  await server('PUT', '/friends/$friendUid/alias', {'alias': alias}, recipeApi);
  await loadNames();
}

/// The name friends see, in both apps; '' goes back to the Google name.
Future<void> setMyName(String name) async {
  await server('PATCH', '/me', {'displayName': name}, recipeApi);
  await loadNames();
}
