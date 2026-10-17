import 'dart:async';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../core/tour.dart';
import '../lists/logic.dart';
import '../lists/repo.dart';
import 'common.dart';
import 'home_screen.dart';
import 'item_sheet.dart';
import 'people_sheet.dart';
import 'skeleton.dart';
import 'theme.dart';

/// One list. Shopping: what's left in aisle order, the basket folded away,
/// the whole row ticks (the pencil edits). Tasks: by deadline, a tap edits.
class ListScreen extends StatefulWidget {
  const ListScreen(
      {super.key, required this.listId, this.focusAdd = false, this.closeAfterAdd = false});
  final String listId;
  final bool focusAdd;

  /// Opened by the home widget's +: one item, then back to the home screen.
  final bool closeAfterAdd;

  @override
  State<ListScreen> createState() => _ListScreenState();
}

typedef _Group = ({String key, String title, List<Item> items});

class _ListScreenState extends State<ListScreen> {
  final _add = TextEditingController();
  final _addFocus = FocusNode();
  Stream<Map<String, MemberCard>>? _membersStream;
  Stream<List<HistoryEntry>>? _historyStream;
  Map<String, MemberCard> _members = {};
  List<HistoryEntry> _history = [];
  StreamSubscription<Object?>? _membersSub, _historySub;
  bool _basketOpen = false;
  bool _mineOnly = false;
  bool _cardSaved = false;
  Set<String> _declined = {};

  TodoList? get _list => Lists.instance.byId(widget.listId);
  bool get _shopping => _list?.shopping ?? false;
  bool get _shared => _members.length > 1;

  @override
  void initState() {
    super.initState();
    Lists.instance.addListener(_listChanged);
    _addFocus.addListener(() => setState(() {}));
    _add.addListener(() => setState(() {}));
    _watch();
    SharedPreferences.getInstance().then((p) {
      if (mounted) setState(() => _declined = {...?p.getStringList(_declinedKey)});
    });
    if (widget.focusAdd) {
      WidgetsBinding.instance.addPostFrameCallback((_) => _addFocus.requestFocus());
    }
  }

  /// Members and history follow the list's createdAt (a list made offline gets
  /// it once synced); your own member card is written once.
  void _listChanged() {
    _watch();
    if (mounted) setState(() {});
  }

  void _watch() {
    final l = _list;
    if (l?.createdAt != null && _membersStream == null) {
      _membersStream = members(l!);
      _historyStream = history(l);
      _membersSub = _membersStream!.listen((m) {
        if (!mounted) return;
        setState(() => _members = m);
        if (!_cardSaved) {
          _cardSaved = true;
          final me = m[uid];
          final u = authUser();
          if (me == null || me.name != u.$1 || me.photo != u.$2) {
            saveMemberCard(l).catchError((_) {});
          }
        }
      });
      _historySub = _historyStream!.listen((h) {
        if (mounted) setState(() => _history = h);
      });
    }
  }

  @override
  void dispose() {
    Lists.instance.removeListener(_listChanged);
    _membersSub?.cancel();
    _historySub?.cancel();
    _add.dispose();
    _addFocus.dispose();
    super.dispose();
  }

  List<Item> get _items => Lists.instance.itemsOf(widget.listId) ?? const [];

  // ---- adding ----

  /// Type and press Enter: several at once split on commas or lines (a list
  /// pasted from a chat), "2 חלב" keeps the amount.
  void _quickAdd() {
    final l = _list;
    final entries = splitEntries(_add.text).map(parseEntry).where((e) => e.name.isNotEmpty).toList();
    if (l?.createdAt == null || entries.isEmpty) return;
    final aisles = <String>{};
    for (final e in entries) {
      final c = addQuick(l!, e.name, e.quantity, past: _history);
      if (c != null) aisles.add(categoryLabels[c] ?? c);
    }
    _add.clear();
    if (widget.closeAfterAdd) {
      // Saved on the device at once; give it a moment to reach the server, then close.
      FirebaseFirestore.instance
          .waitForPendingWrites()
          .timeout(const Duration(seconds: 4), onTimeout: () {})
          .whenComplete(SystemNavigator.pop);
      return;
    }
    _addFocus.requestFocus();
    if (entries.length > 1) {
      toast('נוספו ${entries.length} פריטים', duration: const Duration(milliseconds: 1500));
    } else if (aisles.isNotEmpty) {
      toast('נוסף ל"${aisles.first}"', duration: const Duration(milliseconds: 1500));
    }
  }

  List<HistoryEntry> get _suggestions {
    final typed = _add.text.trim().toLowerCase();
    if (typed.isEmpty && !_addFocus.hasFocus) return const [];
    final open = {for (final i in _items.where((i) => !i.done)) historyKey(i.name)};
    return _history
        .where((h) => !open.contains(h.id) && (typed.isEmpty || h.name.toLowerCase().contains(typed)))
        .where((h) => h.name.toLowerCase() != typed)
        .take(8)
        .toList();
  }

  // ---- ticking, deleting, merging ----

  void _toggle(Item i) {
    final l = _list!;
    final changes = tickChanges(i.d, !i.done, uid);
    updateItem(l.id, i.id, changes).catchError((Object e) => fail(e, 'משהו השתבש'));
    HapticFeedback.selectionClick();
    final due = changes['dueAt'];
    if (due is int) {
      toast('"${i.name}" הועבר ל${shortDate(DateTime.fromMillisecondsSinceEpoch(due))}');
    }
  }

  /// Deletes at once and offers undo instead of asking first.
  void _remove(List<Item> items, String message) {
    if (items.isEmpty) return;
    final id = widget.listId;
    deleteItems(id, items).catchError((Object e) => fail(e, 'המחיקה נכשלה'));
    undoable(message, () => restoreItems(id, items).catchError((Object e) => fail(e, 'השחזור נכשל')));
  }

  /// Shopping lines for the same thing, each with what joining would make of
  /// the amounts, until declined.
  List<({List<Item> items, String key, String from, String to})> get _joins {
    if (!_shopping) return const [];
    return [
      for (final g in duplicateGroups(_items, name: (i) => i.name, done: (i) => i.done, date: (i) => i.date))
        () {
          final parts = g.map((i) => i.description.trim()).where((s) => s.isNotEmpty).toList();
          final key = (g.map((i) => i.id).toList()..sort()).join(',');
          return (
            items: g,
            key: key,
            from: parts.length > 1 ? parts.join(' + ') : '',
            to: joinAmounts(parts),
          );
        }(),
    ].where((j) => !_declined.contains(j.key)).toList();
  }

  void _joinAll() {
    final groups = [
      for (final j in _joins)
        (keep: j.items.first, name: null, description: j.to, drop: j.items.sublist(1)),
    ];
    joinItems(widget.listId, groups).catchError((Object e) => fail(e, 'האיחוד נכשל'));
    toast(groups.length == 1 ? '"${groups.first.keep.name}" אוחד' : '${groups.length} פריטים אוחדו');
  }

  Future<void> _declineJoins() async {
    final keys = [..._declined, ..._joins.map((j) => j.key)];
    setState(() => _declined = keys.toSet());
    final p = await SharedPreferences.getInstance();
    await p.setStringList(_declinedKey, keys.length > 50 ? keys.sublist(keys.length - 50) : keys);
  }

  /// One line dragged onto another. Same name and amounts that add up: at
  /// once, with undo. Anything less clear: ask.
  Future<void> _dropOn(Item drop, Item keep) async {
    final added = addAmounts([keep.description, drop.description]);
    final same = historyKey(keep.name) == historyKey(drop.name);
    var name = keep.name;
    var amount = added ?? joinAmounts([keep.description, drop.description]);
    if (!same || added == null) {
      final r = await showDialog<(String, String)>(
        context: context,
        builder: (_) => _MergeDialog(keep: keep, drop: drop, sameName: same, added: added != null),
      );
      if (r == null) return;
      (name, amount) = r;
    }
    final id = widget.listId;
    joinItems(id, [(keep: keep, name: name, description: amount, drop: [drop])])
        .catchError((Object e) => fail(e, 'האיחוד נכשל'));
    undoable('"${drop.name}" אוחד עם "$name"', () {
      Future.wait([
        updateItem(id, keep.id, {'name': keep.name, 'description': keep.description}),
        restoreItems(id, [drop]),
      ]).catchError((Object e) {
        fail(e, 'השחזור נכשל');
        return <void>[];
      });
    });
  }

  /// A copy (name, amount, aisle) on other lists too; each its own line.
  Future<void> _copyToLists(Item i) async {
    final others = Lists.instance.all.where((l) => l.id != widget.listId && l.createdAt != null).toList()
      ..sort((a, b) => a.shopping != b.shopping ? (a.shopping ? -1 : 1) : a.name.compareTo(b.name));
    if (others.isEmpty) return toast('אין לך עוד רשימות');
    final picked = await showDialog<List<TodoList>>(
      context: context,
      builder: (_) => _PickLists(title: 'להוסיף את "${i.name}" גם ל…', lists: others),
    );
    if (picked == null || picked.isEmpty) return;
    for (final l in picked) {
      createItem(l, {'name': i.name, 'description': i.description, 'category': ?i.category})
          .catchError((Object e) => fail(e, 'ההוספה נכשלה'));
      recordHistory(l, i.name, i.category).catchError((_) {});
    }
    toast(picked.length == 1 ? 'נוסף גם ל"${picked.first.name}"' : 'נוסף לעוד ${picked.length} רשימות');
  }

  Future<void> _edit([Item? i]) async {
    final l = _list;
    if (l == null) return;
    if (l.createdAt == null) return toast('הרשימה עוד לא סונכרנה. נסו שוב כשיש חיבור.');
    final r = await showItemSheet(context, l, i, [..._members.values]);
    if (i == null) return;
    if (r == ItemSheetResult.delete) _remove([i], '"${i.name}" נמחק');
    if (r == ItemSheetResult.copy) _copyToLists(i);
  }

  Future<void> _itemMenu(Item i) async {
    final a = await choose<String>(context, title: i.name, [
      const Choice('edit', 'עריכה', icon: Icons.edit_outlined),
      const Choice('copy', 'גם ברשימות אחרות…', icon: Icons.copy_outlined),
      const Choice('delete', 'מחיקה', icon: Icons.delete_outline, danger: true),
    ]);
    switch (a) {
      case 'edit':
        _edit(i);
      case 'copy':
        _copyToLists(i);
      case 'delete':
        _remove([i], '"${i.name}" נמחק');
    }
  }

  /// The ⋯ on a section heading: tick off, put back or empty the whole section.
  Future<void> _groupMenu(_Group g) async {
    final n = g.items.length;
    final done = g.key == 'done';
    final a = await choose<String>(context, title: '${g.title} · $n', [
      done
          ? const Choice('uncheck', 'החזרת הכול לרשימה', icon: Icons.undo)
          : Choice('check', _shopping ? 'סימון הכול כנקנה' : 'סימון הכול כבוצע',
              icon: Icons.done_all),
      Choice('empty', n == 1 ? 'מחיקת הפריט' : 'ריקון: מחיקת $n הפריטים',
          icon: Icons.delete_sweep_outlined, danger: true),
    ]);
    if (a == 'check' || a == 'uncheck') {
      setDone(widget.listId, g.items, a == 'check').catchError((Object e) => fail(e, 'משהו השתבש'));
    } else if (a == 'empty') {
      _remove(g.items, '"${g.title}" רוקנה');
    }
  }

  // ---- the list's ⋮ menu ----

  Future<void> _menu() async {
    final l = _list;
    if (l == null) return;
    final all = _items;
    final done = all.where((i) => i.done).toList();
    final isMain = Lists.instance.mainListId == l.id;
    final a = await choose<String>(context, title: l.name, [
      const Choice('invite', 'הזמנת אנשים לרשימה', icon: Icons.person_add_alt),
      if (l.shopping && !isMain)
        const Choice('main', 'הגדרה כרשימת הקניות הראשית', icon: Icons.star_outline),
      if (l.mine) ...const [
        Choice('rename', 'שינוי שם', icon: Icons.edit_outlined),
        Choice('move', 'העברה למשק בית…', icon: Icons.home_outlined),
        Choice('merge', 'מיזוג רשימה אחרת לכאן…', icon: Icons.merge),
      ],
      if (done.isNotEmpty)
        Choice('clear', 'ניקוי ${done.length} שסומנו', icon: Icons.cleaning_services_outlined),
      if (all.isNotEmpty)
        const Choice('empty', 'ריקון הרשימה', icon: Icons.delete_sweep_outlined, danger: true),
      if (!l.mine && l.memberUids.contains(uid))
        const Choice('leave', 'עזיבת הרשימה', icon: Icons.logout, danger: true),
      if (l.mine) const Choice('delete', 'מחיקת הרשימה', icon: Icons.delete_outline, danger: true),
    ]);
    if (!mounted || a == null) return;
    try {
      switch (a) {
        case 'invite':
          await addPeople(context, l);
        case 'main':
          await _makeMain(l);
        case 'rename':
          final name = await askText(context, 'שינוי שם', initial: l.name);
          if (name != null) await renameList(l.id, name);
        case 'move':
          final h = await pickHousehold(context, personal: 'רק אני ומי שהוזמן');
          if (h != false && (h as Household?)?.id != l.householdId) {
            await setHousehold(l.id, h);
            toast('הרשימה הועברה');
          }
        case 'merge':
          await _mergeInto(l);
        case 'clear':
          _remove(done, '${done.length} נוקו');
        case 'empty':
          _remove(all, 'הרשימה רוקנה');
        case 'leave':
          await leave('lists', l.id);
          if (mounted) Navigator.pop(context);
        case 'delete':
          if (await confirm(context, 'למחוק את הרשימה?',
              '"${l.name}" וכל מה שבה יימחקו אצל כולם.', 'מחיקה')) {
            deleteList(l.id).catchError((Object e) => fail(e, 'המחיקה נכשלה'));
            if (mounted) Navigator.pop(context);
          }
      }
    } catch (e) {
      fail(e, 'משהו השתבש');
    }
  }

  /// Asks first, naming the list that stops being the main one.
  Future<void> _makeMain(TodoList l) async {
    final current = Lists.instance.byId(Lists.instance.mainListId ?? '');
    final currentName = current == null ? null : (current.name == l.name ? listLabel(current) : current.name);
    if (!await confirm(
        context,
        'להפוך לרשימת הקניות הראשית?',
        'מצרכים מספר המתכונים יתווספו ל"${l.name}".'
            '${currentName == null ? '' : ' "$currentName" כבר לא תהיה הרשימה הראשית.'}',
        'כן, ראשית',
        danger: false)) {
      return;
    }
    setMainList(l.id).catchError((Object e) => fail(e, 'משהו השתבש'));
    toast('"${l.name}" היא עכשיו רשימת הקניות הראשית');
  }

  /// Another list of yours of the same kind: its items and people move here and it goes.
  Future<void> _mergeInto(TodoList l) async {
    final others = Lists.instance.all
        .where((o) => o.id != l.id && o.mine && o.createdAt != null && o.shopping == l.shopping)
        .toList();
    if (others.isEmpty) {
      return toast('אין לך עוד ${l.shopping ? 'רשימת קניות' : 'רשימת משימות'} למיזוג');
    }
    final source = await choose<TodoList>(context,
        title: 'איזו רשימה למזג לתוך "${l.name}"?',
        [for (final o in others) Choice(o, listLabel(o), icon: Icons.list_alt)]);
    if (source == null || !mounted) return;
    if (!await confirm(context, 'למזג את "${source.name}"?',
        'הפריטים שלה ומי שרואה אותה יעברו ל"${l.name}", והיא תימחק.', 'מיזוג',
        danger: false)) {
      return;
    }
    try {
      await mergeList(l, source);
      // Recipes that went to the merged list now come here.
      if (Lists.instance.mainListId == source.id) setMainList(l.id).catchError((_) {});
      toast('הרשימות מוזגו');
    } catch (e) {
      fail(e, 'המיזוג נכשל');
    }
  }

  // ---- building ----

  List<_Group> _groups() {
    final items = _items.where((i) => !_mineOnly || i.assignee == uid).toList();
    final open = items.where((i) => !i.done).toList();
    final done = items.where((i) => i.done).toList();
    int byName(Item a, Item b) => a.name.compareTo(b.name);
    final List<_Group> groups;
    if (_shopping) {
      groups = [
        for (final c in categories)
          (key: c, title: categoryLabels[c]!, items: open.where((i) => i.aisle == c).toList()..sort(byName)),
        (key: 'done', title: 'בסל', items: done..sort(byName)),
      ];
    } else {
      const rank = {'high': 0, 'normal': 1, 'low': 2};
      int due(Item i) => i.dueAt ?? 1 << 62;
      open.sort((a, b) {
        final d = due(a).compareTo(due(b));
        if (d != 0) return d;
        final r = (rank[a.priority] ?? 1).compareTo(rank[b.priority] ?? 1);
        return r != 0 ? r : a.date.compareTo(b.date);
      });
      groups = [
        (key: 'overdue', title: 'באיחור', items: open.where((i) => i.dueAt != null && isBeforeToday(i.dueAt!)).toList()),
        (key: 'today', title: 'היום', items: open.where((i) => i.dueAt != null && isToday(i.dueAt!)).toList()),
        (
          key: 'later',
          title: 'בהמשך',
          items: open.where((i) => i.dueAt != null && !isBeforeToday(i.dueAt!) && !isToday(i.dueAt!)).toList()
        ),
        (key: 'none', title: 'ללא תאריך יעד', items: open.where((i) => i.dueAt == null).toList()),
        (key: 'done', title: 'בוצעו', items: done..sort((a, b) => b.date.compareTo(a.date))),
      ];
    }
    return groups.where((g) => g.items.isNotEmpty).toList();
  }

  String _memberName(String? id) {
    if (id == null) return '';
    if (id == uid) return 'אני';
    if (id == 'home-assistant') return 'Home Assistant';
    return _members[id]?.name ?? '';
  }

  /// "Bought by", "for" or "added by", only on lists more than one person uses.
  String _who(Item i) {
    if (!_shared) return '';
    if (i.done && i.doneBy != null) return '${_shopping ? 'נקנה' : 'בוצע'} ע״י ${_memberName(i.doneBy)}';
    if (!i.done && i.assignee != null) return 'באחריות ${_memberName(i.assignee)}';
    if (!i.done && i.by != null && i.by != uid && _memberName(i.by).isNotEmpty) {
      return 'נוסף ע״י ${_memberName(i.by)}';
    }
    return '';
  }

  @override
  Widget build(BuildContext context) {
    final l = _list;
    final t = Theme.of(context);
    if (l == null) {
      return Scaffold(
        appBar: AppBar(),
        body: Lists.instance.loaded
            ? const EmptyState(Icons.search_off, 'הרשימה לא נמצאה',
                'אולי נמחקה, או שעוד לא הצטרפת אליה.')
            : const SkeletonList(),
      );
    }
    final color = kindColor(context, l.shopping);
    final loaded = Lists.instance.itemsOf(l.id) != null;
    final items = _items;
    final remaining = items.where((i) => !i.done).length;
    final groups = _groups();
    final joins = _joins;
    final suggestions = _suggestions;
    return Scaffold(
      appBar: AppBar(
        titleSpacing: 0,
        title: Row(children: [
          Icon(l.shopping ? Icons.shopping_basket_outlined : Icons.check_box_outlined, color: color),
          const SizedBox(width: 8),
          Flexible(child: Text(l.name, overflow: TextOverflow.ellipsis)),
          if (Lists.instance.mainListId == l.id) ...[
            const SizedBox(width: 8),
            Tag('ראשית', accentInk(context), accentSoft(context)),
          ],
        ]),
        actions: [
          TourTarget(
            'list.menu',
            child: IconButton(tooltip: 'אפשרויות הרשימה', icon: const Icon(Icons.more_vert), onPressed: _menu),
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton(
        backgroundColor: color,
        foregroundColor: t.colorScheme.onPrimary,
        tooltip: l.shopping ? 'פריט חדש עם פרטים' : 'משימה חדשה עם פרטים',
        onPressed: () => _edit(),
        child: const Icon(Icons.add),
      ),
      body: Column(children: [
        // Quick add: a field that keeps a pasted list's lines; Enter adds.
        Padding(
          padding: const EdgeInsets.fromLTRB(12, 4, 12, 4),
          child: TourTarget(
            'list.add',
            child: TextField(
              controller: _add,
              focusNode: _addFocus,
              enabled: l.createdAt != null,
              minLines: 1,
              maxLines: 4,
              maxLength: 5000,
              textInputAction: TextInputAction.send,
              onSubmitted: (_) => _quickAdd(),
              decoration: InputDecoration(
                counterText: '',
                hintText: l.createdAt == null
                    ? 'הרשימה עוד לא סונכרנה…'
                    : l.shopping
                        ? 'מה צריך לקנות? (אפשר כמה, בפסיקים)'
                        : 'משימה חדשה…',
                border: const OutlineInputBorder(),
                isDense: true,
                suffixIcon: IconButton(
                  tooltip: 'הוספה',
                  icon: Icon(Icons.send, color: _add.text.trim().isEmpty ? null : color),
                  onPressed: _add.text.trim().isEmpty ? null : _quickAdd,
                ),
              ),
            ),
          ),
        ),
        if (suggestions.isNotEmpty)
          SizedBox(
            height: 44,
            child: ListView(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 12),
              children: [
                for (final s in suggestions)
                  Padding(
                    padding: const EdgeInsetsDirectional.only(end: 6),
                    child: ActionChip(
                      avatar: const Icon(Icons.add, size: 16),
                      label: Text(s.name),
                      onPressed: () {
                        addQuick(l, s.name, '', known: s.category, past: _history);
                        _add.clear();
                      },
                    ),
                  ),
              ],
            ),
          ),
        Expanded(
          child: !loaded
              ? const SkeletonList(rows: 5)
              : ListView(padding: const EdgeInsets.only(bottom: 96), children: [
                  if (items.isNotEmpty)
                    Padding(
                      padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
                      child: Column(children: [
                        Row(children: [
                          Expanded(
                            child: Text(
                              remaining > 0
                                  ? 'נשארו $remaining ${l.shopping ? 'פריטים לקנות' : 'משימות'}'
                                  : l.shopping
                                      ? 'הכול בסל'
                                      : 'הכול בוצע',
                              style: t.textTheme.bodyMedium,
                            ),
                          ),
                          if (!l.shopping && _shared)
                            FilterChip(
                              label: const Text('רק שלי'),
                              selected: _mineOnly,
                              onSelected: (v) => setState(() => _mineOnly = v),
                            ),
                        ]),
                        const SizedBox(height: 6),
                        LinearProgressIndicator(
                          value: items.isEmpty ? 0 : (items.length - remaining) / items.length,
                          color: color,
                          backgroundColor: color.withValues(alpha: 0.15),
                          borderRadius: BorderRadius.circular(4),
                        ),
                      ]),
                    ),
                  if (joins.isNotEmpty) _joinCard(context, joins),
                  for (final g in groups) ..._group(context, l, g),
                  if (groups.isEmpty)
                    l.shopping
                        ? const EmptyState(Icons.shopping_basket_outlined, 'אין מה לקנות',
                            'כתבו פריט בשורה למעלה ולחצו Enter, או שלחו לכאן מתכון מספר המתכונים.')
                        : const EmptyState(Icons.checklist, 'אין משימות', 'כתבו משימה בשורה למעלה ולחצו Enter.'),
                  if (l.shopping && remaining > 1)
                    Padding(
                      padding: const EdgeInsets.all(20),
                      child: Text('אותו מצרך בשני שמות? לחיצה ארוכה עליו וגרירה אל השני מאחדת אותם.',
                          textAlign: TextAlign.center,
                          style: t.textTheme.bodySmall?.copyWith(color: t.colorScheme.onSurfaceVariant)),
                    ),
                ]),
        ),
      ]),
    );
  }

  Widget _joinCard(BuildContext context, List<({List<Item> items, String key, String from, String to})> joins) {
    final t = Theme.of(context);
    return Card(
      margin: const EdgeInsets.fromLTRB(12, 12, 12, 0),
      color: accentSoft(context),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            Icon(Icons.merge, color: accentInk(context)),
            const SizedBox(width: 8),
            Expanded(
              child: Text(
                '${joins.length == 1 ? 'פריט מופיע כמה פעמים' : '${joins.length} פריטים מופיעים כמה פעמים'}. לאחד?',
                style: t.textTheme.titleSmall?.copyWith(color: accentInk(context)),
              ),
            ),
          ]),
          const SizedBox(height: 8),
          for (final j in joins)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 2),
              child: Row(children: [
                Expanded(child: Text(j.items.first.name)),
                Text(
                  '${j.from.isNotEmpty && j.from != j.to ? '${j.from} ← ' : ''}${j.to.isEmpty ? '×${j.items.length}' : j.to}',
                  style: const TextStyle(fontWeight: FontWeight.w600),
                ),
              ]),
            ),
          Row(mainAxisAlignment: MainAxisAlignment.end, children: [
            TextButton(onPressed: _declineJoins, child: const Text('לא')),
            FilledButton(
              style: FilledButton.styleFrom(backgroundColor: kindColor(context, true)),
              onPressed: _joinAll,
              child: const Text('כן, לאחד'),
            ),
          ]),
        ]),
      ),
    );
  }

  List<Widget> _group(BuildContext context, TodoList l, _Group g) {
    final t = Theme.of(context);
    final foldable = g.key == 'done' && l.shopping;
    final late = g.key == 'overdue';
    final header = Padding(
      padding: const EdgeInsets.fromLTRB(20, 16, 8, 4),
      child: Row(children: [
        Expanded(
          child: InkWell(
            onTap: foldable ? () => setState(() => _basketOpen = !_basketOpen) : null,
            child: Row(children: [
              Text(g.title,
                  style: t.textTheme.titleSmall?.copyWith(
                      color: late ? t.colorScheme.error : l.shopping ? accentInk(context) : t.colorScheme.primary)),
              const SizedBox(width: 6),
              Text('${g.items.length}', style: t.textTheme.labelSmall?.copyWith(color: t.colorScheme.onSurfaceVariant)),
              if (foldable) Icon(_basketOpen ? Icons.expand_less : Icons.expand_more, size: 20),
            ]),
          ),
        ),
        IconButton(
          tooltip: 'פעולות על ${g.title}',
          icon: const Icon(Icons.more_horiz),
          onPressed: () => _groupMenu(g),
        ),
      ]),
    );
    if (foldable && !_basketOpen) return [header];
    return [
      header,
      Card(
        margin: const EdgeInsets.symmetric(horizontal: 12),
        clipBehavior: Clip.antiAlias,
        child: Column(children: [for (final i in g.items) _row(context, l, i)]),
      ),
    ];
  }

  Widget _row(BuildContext context, TodoList l, Item i) {
    final t = Theme.of(context);
    final color = kindColor(context, l.shopping);
    final who = _who(i);
    final avatar = _shared ? _members[i.assignee ?? i.by] : null;
    final chips = <Widget>[
      if (i.dueAt != null && !i.done)
        Tag(
          dueText(i.dueAt!),
          isBeforeToday(i.dueAt!) ? t.colorScheme.error : isToday(i.dueAt!) ? accentInk(context) : t.colorScheme.onSurfaceVariant,
          isBeforeToday(i.dueAt!) ? dangerSoft(context) : isToday(i.dueAt!) ? accentSoft(context) : t.colorScheme.surfaceContainerHighest,
          icon: Icons.event,
        ),
      if (i.remindAt != null && !i.done)
        Tag(shortDateTime(DateTime.fromMillisecondsSinceEpoch(i.remindAt!)), accentInk(context), accentSoft(context),
            icon: Icons.alarm),
    ];
    Widget tile = ListTile(
      key: ValueKey(i.id),
      contentPadding: const EdgeInsetsDirectional.only(start: 4, end: 8),
      leading: Checkbox(
        value: i.done,
        activeColor: color,
        onChanged: (_) => _toggle(i),
        semanticLabel: i.name,
      ),
      title: Row(children: [
        if (!l.shopping && i.priority == 'high' && !i.done)
          Padding(
            padding: const EdgeInsetsDirectional.only(end: 4),
            child: Icon(Icons.flag, size: 16, color: t.colorScheme.error, semanticLabel: 'עדיפות גבוהה'),
          ),
        if (i.repeat != null && !i.done)
          Padding(
            padding: const EdgeInsetsDirectional.only(end: 4),
            child: Icon(Icons.repeat, size: 16, color: t.colorScheme.onSurfaceVariant, semanticLabel: 'משימה חוזרת'),
          ),
        Flexible(
          child: Text(i.name,
              style: i.done
                  ? TextStyle(decoration: TextDecoration.lineThrough, color: t.colorScheme.onSurfaceVariant)
                  : null),
        ),
      ]),
      subtitle: i.description.isEmpty && who.isEmpty && chips.isEmpty
          ? null
          : Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              if (i.description.isNotEmpty) Text(i.description),
              if (who.isNotEmpty) Text(who, style: t.textTheme.bodySmall),
              if (chips.isNotEmpty)
                Padding(
                  padding: const EdgeInsets.only(top: 4),
                  child: Wrap(spacing: 6, runSpacing: 4, children: chips),
                ),
            ]),
      trailing: Row(mainAxisSize: MainAxisSize.min, children: [
        if (avatar != null)
          CircleAvatar(
            radius: 14,
            foregroundImage: avatar.photo.isEmpty ? null : NetworkImage(avatar.photo),
            child: Text(avatar.name.isEmpty ? '?' : avatar.name.characters.first, style: const TextStyle(fontSize: 12)),
          ),
        if (l.shopping)
          IconButton(tooltip: 'עריכת ${i.name}', icon: const Icon(Icons.edit_outlined), onPressed: () => _edit(i)),
      ]),
      // Store mode: in a shopping list the whole row ticks; editing is the pencil.
      onTap: () => l.shopping ? _toggle(i) : _edit(i),
      onLongPress: l.shopping && !i.done ? null : () => _itemMenu(i),
    );
    // Swipe away to delete (undo in the message); the menu does the same by tap.
    tile = Dismissible(
      key: ValueKey('swipe-${i.id}'),
      direction: DismissDirection.endToStart,
      background: Container(
        color: t.colorScheme.error,
        alignment: AlignmentDirectional.centerEnd,
        padding: const EdgeInsets.symmetric(horizontal: 20),
        child: Icon(Icons.delete_outline, color: t.colorScheme.onError),
      ),
      onDismissed: (_) => _remove([i], '"${i.name}" נמחק'),
      child: tile,
    );
    if (!l.shopping || i.done) return tile;
    // Long-press a shopping line and drop it on another to make them one.
    return DragTarget<Item>(
      onWillAcceptWithDetails: (d) => d.data.id != i.id,
      onAcceptWithDetails: (d) => _dropOn(d.data, i),
      builder: (context, over, _) => LongPressDraggable<Item>(
        data: i,
        hapticFeedbackOnStart: true,
        feedback: Material(
          elevation: 6,
          borderRadius: BorderRadius.circular(12),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
            child: Text(i.name, style: t.textTheme.titleMedium),
          ),
        ),
        childWhenDragging: Opacity(opacity: 0.4, child: tile),
        child: DecoratedBox(
          decoration: BoxDecoration(
            border: over.isNotEmpty ? Border.all(color: color, width: 2) : null,
            color: over.isNotEmpty ? accentSoft(context) : null,
          ),
          child: tile,
        ),
      ),
    );
  }
}

const _declinedKey = 'declined-joins';

/// Merging two lines whose name or amount isn't obvious: pick or type them.
class _MergeDialog extends StatefulWidget {
  const _MergeDialog({required this.keep, required this.drop, required this.sameName, required this.added});
  final Item keep;
  final Item drop;
  final bool sameName;
  final bool added;

  @override
  State<_MergeDialog> createState() => _MergeDialogState();
}

class _MergeDialogState extends State<_MergeDialog> {
  late final _name = TextEditingController(text: widget.keep.name);
  late final _amount = TextEditingController(
      text: joinAmounts([widget.keep.description, widget.drop.description]));

  @override
  Widget build(BuildContext context) => AlertDialog(
        title: const Text('איחוד לשורה אחת'),
        content: SingleChildScrollView(
          child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
            if (!widget.sameName) ...[
              const Text('איך לקרוא לו?'),
              Wrap(spacing: 8, children: [
                for (final n in [widget.keep.name, widget.drop.name])
                  ChoiceChip(
                    label: Text(n),
                    selected: _name.text == n,
                    onSelected: (_) => setState(() => _name.text = n),
                  ),
              ]),
            ],
            TextField(
              controller: _name,
              maxLength: 500,
              decoration: const InputDecoration(labelText: 'שם', counterText: ''),
              onChanged: (_) => setState(() {}),
            ),
            TextField(
              controller: _amount,
              maxLength: 200,
              decoration: const InputDecoration(labelText: 'כמות', hintText: 'למשל 500 גרם', counterText: ''),
            ),
            if (!widget.added) ...[
              const SizedBox(height: 8),
              Text('"${widget.keep.description.isEmpty ? '—' : widget.keep.description}" '
                  'ו"${widget.drop.description.isEmpty ? '—' : widget.drop.description}" '
                  'לא מתחברות לבד. כתבו כמה צריך בסך הכול.'),
            ],
          ]),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context), child: const Text('ביטול')),
          FilledButton(
            onPressed: _name.text.trim().isEmpty
                ? null
                : () => Navigator.pop(context, (_name.text.trim(), _amount.text.trim())),
            child: const Text('איחוד'),
          ),
        ],
      );
}

/// Checkboxes over lists, for "גם ברשימות אחרות".
class _PickLists extends StatefulWidget {
  const _PickLists({required this.title, required this.lists});
  final String title;
  final List<TodoList> lists;

  @override
  State<_PickLists> createState() => _PickListsState();
}

class _PickListsState extends State<_PickLists> {
  final _picked = <TodoList>{};

  @override
  Widget build(BuildContext context) => AlertDialog(
        title: Text(widget.title),
        contentPadding: const EdgeInsets.only(top: 12),
        content: SizedBox(
          width: 400,
          child: ListView(shrinkWrap: true, children: [
            for (final l in widget.lists)
              CheckboxListTile(
                value: _picked.contains(l),
                title: Text(listLabel(l)),
                onChanged: (v) => setState(() => v == true ? _picked.add(l) : _picked.remove(l)),
              ),
          ]),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context), child: const Text('ביטול')),
          FilledButton(onPressed: () => Navigator.pop(context, _picked.toList()), child: const Text('הוספה')),
        ],
      );
}

/// The signed-in user's name and photo, as the member card holds them.
(String, String) authUser() {
  final u = FirebaseAuth.instance.currentUser;
  final name = (u?.displayName?.isNotEmpty ?? false) ? u!.displayName! : '${u?.email}'.split('@').first;
  return (name.length > 60 ? name.substring(0, 60) : name, u?.photoURL ?? '');
}
