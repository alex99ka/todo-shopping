import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';

import '../lists/logic.dart';
import '../lists/repo.dart';
import 'common.dart';
import 'home_screen.dart';
import 'list_screen.dart';
import 'theme.dart';

class _Row {
  _Row(this.name, this.amount, this.unit, this.note, this.category);
  final TextEditingController name;
  final TextEditingController amount;
  String unit;

  /// The recipe's wording when it's in none of the units ("2 כפות"); kept unless an amount is typed.
  final String note;
  final String category;
}

/// The recipe book's "add to shopping list" lands here with
/// `/import#{"recipe": ..., "items": [{name, quantity, category}]}`. Nothing is
/// written until confirmed: anyone can craft such a link.
class ImportScreen extends StatefulWidget {
  const ImportScreen({super.key, required this.json});
  final String json;

  @override
  State<ImportScreen> createState() => _ImportScreenState();
}

class _ImportScreenState extends State<ImportScreen> {
  String _recipe = '';
  final _rows = <_Row>[];
  String? _error;
  String? _picked;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    try {
      final data = jsonDecode(widget.json) as Map<String, dynamic>;
      _recipe = _clip(data['recipe']);
      for (final i in (data['items'] as List? ?? const []).take(100)) {
        if (i is! Map) continue;
        final name = _clip(i['name']);
        if (name.isEmpty) continue;
        final quantity = _clip(i['quantity']);
        final a = parseAmount(quantity);
        _rows.add(_Row(
          TextEditingController(text: name),
          TextEditingController(text: a == null ? '' : _num(a.value)),
          a?.unit ?? '',
          a == null ? quantity : '',
          categories.contains(i['category']) ? i['category'] as String : 'Other',
        ));
      }
    } catch (_) {}
    if (_rows.isEmpty) _error = 'אין מצרכים בקישור הזה.';
  }

  @override
  void dispose() {
    for (final r in _rows) {
      r.name.dispose();
      r.amount.dispose();
    }
    super.dispose();
  }

  static String _num(double v) {
    final r = (v * 100).round() / 100;
    return r == r.roundToDouble() ? '${r.toInt()}' : '$r';
  }

  // From a link anyone could craft: short strings only.
  static String _clip(Object? v) {
    if (v is! String) return '';
    final t = v.trim();
    return t.length > 200 ? t.substring(0, 200) : t;
  }

  List<TodoList> get _shoppingLists => Lists.instance.all.where((l) => l.shopping).toList();

  /// The list picked for this recipe, else the main one, else the household's, else any.
  TodoList? get _target {
    final all = _shoppingLists;
    final id = _picked ?? Lists.instance.mainListId;
    return all.where((l) => l.id == id).firstOrNull ?? mainShoppingList();
  }

  Future<void> _pick() async {
    final current = _target?.id;
    final id = await choose<String>(context,
        title: 'לאיזו רשימה להוסיף הפעם?',
        [
          for (final l in _shoppingLists)
            Choice(l.id, listLabel(l) + (l.id == current ? '  ✓' : ''), icon: Icons.shopping_basket_outlined),
        ]);
    if (id != null) setState(() => _picked = id);
  }

  /// Resolves once the list is known with its server createdAt.
  Future<TodoList> _ready(String id) {
    final done = Completer<TodoList>();
    void check() {
      final l = Lists.instance.byId(id);
      if (l?.createdAt != null && !done.isCompleted) done.complete(l);
    }

    Lists.instance.addListener(check);
    check();
    return done.future
        .timeout(const Duration(seconds: 20))
        .whenComplete(() => Lists.instance.removeListener(check));
  }

  Future<void> _run() async {
    setState(() => _busy = true);
    try {
      var id = _target?.id;
      // No shopping list at all: one in your first household (or a personal one).
      id ??= await createList(
          shoppingListName, 'shopping', Lists.instance.households.firstOrNull);
      // The first recipe's list becomes the main one; after that only the list menu changes it.
      if (Lists.instance.mainListId == null) setMainList(id).catchError((_) {});
      final list = await _ready(id);
      for (final r in _rows) {
        final name = r.name.text.trim();
        if (name.isEmpty) continue;
        final amount = r.amount.text.trim();
        createItem(list, {
          'name': name,
          'description': amount.isEmpty
              ? r.note
              : [amount, if (r.unit.isNotEmpty) unitLabels[r.unit]].join(' '),
          'category': r.category,
        }).catchError((_) {});
        recordHistory(list, name, r.category).catchError((_) {});
      }
      if (!mounted) return;
      Navigator.pushReplacement(context, MaterialPageRoute<void>(builder: (_) => ListScreen(listId: id!)));
    } catch (e) {
      setState(() => _busy = false);
      fail(e, 'לא הצלחנו להוסיף את המצרכים');
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    final count = _rows.where((r) => r.name.text.trim().isNotEmpty).length;
    return Scaffold(
      appBar: AppBar(title: const Text('הוספה לרשימת הקניות')),
      bottomNavigationBar: _error != null
          ? null
          : SafeArea(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: FilledButton(
                  style: FilledButton.styleFrom(backgroundColor: kindColor(context, true)),
                  onPressed: _busy || count == 0 || !Lists.instance.loaded ? null : _run,
                  child: Text(_busy ? 'מוסיף…' : count == 1 ? 'הוספת פריט אחד' : 'הוספת $count פריטים'),
                ),
              ),
            ),
      body: _error != null
          ? EmptyState(Icons.link_off, _error!, 'פותחים את המתכון בספר המתכונים ולוחצים שוב.')
          : ListenableBuilder(
              listenable: Lists.instance,
              builder: (context, _) => ListView(padding: const EdgeInsets.only(bottom: 24), children: [
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text('מהמתכון', style: t.textTheme.labelMedium),
                    Text(_recipe.isEmpty ? 'מתכון' : _recipe, style: t.textTheme.titleLarge),
                    const SizedBox(height: 8),
                    OutlinedButton.icon(
                      onPressed: _shoppingLists.length < 2 ? null : _pick,
                      icon: const Icon(Icons.shopping_basket_outlined),
                      label: Text('אל ${_target?.name ?? '$shoppingListName (חדשה)'}'),
                    ),
                  ]),
                ),
                for (final c in categories)
                  if (_rows.any((r) => r.category == c)) ...[
                    Padding(
                      padding: const EdgeInsets.fromLTRB(20, 16, 20, 4),
                      child: Text(categoryLabels[c]!, style: t.textTheme.titleSmall?.copyWith(color: accentInk(context))),
                    ),
                    Card(
                      margin: const EdgeInsets.symmetric(horizontal: 12),
                      child: Column(children: [
                        for (final r in _rows.where((r) => r.category == c)) _line(context, r),
                      ]),
                    ),
                  ],
                if (_rows.isEmpty) const EmptyState(Icons.remove_shopping_cart, 'הסרת את כל המצרכים', ''),
              ]),
            ),
    );
  }

  Widget _line(BuildContext context, _Row r) => Padding(
        padding: const EdgeInsets.fromLTRB(12, 6, 4, 6),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            Expanded(
              flex: 5,
              child: TextField(
                controller: r.name,
                maxLength: 200,
                decoration: const InputDecoration(isDense: true, counterText: '', labelText: 'מצרך'),
                onChanged: (_) => setState(() {}),
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              flex: 2,
              child: TextField(
                controller: r.amount,
                maxLength: 12,
                keyboardType: const TextInputType.numberWithOptions(decimal: true),
                decoration: const InputDecoration(isDense: true, counterText: '', labelText: 'כמות'),
                onChanged: (_) => setState(() {}),
              ),
            ),
            const SizedBox(width: 8),
            DropdownButton<String>(
              value: r.unit,
              items: [
                const DropdownMenuItem(value: '', child: Text('—')),
                for (final e in unitLabels.entries) DropdownMenuItem(value: e.key, child: Text(e.value)),
              ],
              onChanged: (v) => setState(() => r.unit = v ?? ''),
            ),
            IconButton(
              tooltip: 'הסרת ${r.name.text}',
              icon: const Icon(Icons.close),
              onPressed: () => setState(() => _rows.remove(r)),
            ),
          ]),
          if (r.note.isNotEmpty && r.amount.text.trim().isEmpty)
            Text('במתכון: ${r.note}', style: Theme.of(context).textTheme.bodySmall),
        ]),
      );
}
