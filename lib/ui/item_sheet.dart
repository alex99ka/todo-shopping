import 'package:flutter/material.dart';

import '../lists/logic.dart';
import '../lists/repo.dart';
import 'common.dart';
import 'theme.dart';

enum ItemSheetResult { saved, delete, copy }

/// The full editor ("+" or the pencil). Shopping: name, aisle, amount.
/// Tasks: deadline, repeat, priority, who's in charge, a reminder push.
Future<ItemSheetResult?> showItemSheet(
        BuildContext context, TodoList list, Item? item, List<MemberCard> members) =>
    showModalBottomSheet<ItemSheetResult>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      showDragHandle: true,
      builder: (_) => _ItemSheet(list: list, item: item, members: members),
    );

class _ItemSheet extends StatefulWidget {
  const _ItemSheet({required this.list, required this.item, required this.members});
  final TodoList list;
  final Item? item;
  final List<MemberCard> members;

  @override
  State<_ItemSheet> createState() => _ItemSheetState();
}

class _ItemSheetState extends State<_ItemSheet> {
  late final Item? i = widget.item;
  late final _name = TextEditingController(text: i?.name ?? '');
  late final _notes = TextEditingController(text: i?.description ?? '');
  late String _category = i?.category ?? 'Other';
  late bool _done = i?.done ?? false;
  late DateTime? _due = i?.dueAt == null ? null : DateTime.fromMillisecondsSinceEpoch(i!.dueAt!);
  late String _repeat = i?.repeat ?? '';
  late String _priority = i?.priority ?? 'normal';
  late String _assignee = i?.assignee ?? '';
  late DateTime? _remind = i?.remindAt == null ? null : DateTime.fromMillisecondsSinceEpoch(i!.remindAt!);

  bool get _shopping => widget.list.shopping;

  @override
  void initState() {
    super.initState();
    _name.addListener(() => setState(() {}));
  }

  @override
  void dispose() {
    _name.dispose();
    _notes.dispose();
    super.dispose();
  }

  Future<void> _pickDue() async {
    final now = DateTime.now();
    final d = await showDatePicker(
      context: context,
      initialDate: _due ?? now,
      firstDate: DateTime(now.year - 1),
      lastDate: DateTime(now.year + 5),
    );
    if (d != null) setState(() => _due = DateTime(d.year, d.month, d.day));
  }

  Future<void> _pickRemind() async {
    final now = DateTime.now();
    final start = _remind ?? _due?.add(const Duration(hours: 9)) ?? now.add(const Duration(hours: 1));
    final d = await showDatePicker(
      context: context,
      initialDate: start,
      firstDate: DateTime(now.year - 1),
      lastDate: DateTime(now.year + 5),
    );
    if (d == null || !mounted) return;
    final t = await showTimePicker(context: context, initialTime: TimeOfDay.fromDateTime(start));
    if (t != null) setState(() => _remind = DateTime(d.year, d.month, d.day, t.hour, t.minute));
  }

  void _save() {
    final l = widget.list;
    final name = _name.text.trim();
    if (name.isEmpty) return;
    final existing = i;
    final changes = <String, Object?>{
      'name': name.length > 500 ? name.substring(0, 500) : name,
      'state': _done,
      // Ticked here counts as ticked by you; an unchanged tick keeps who did it.
      if (_done != (existing?.done ?? false)) 'doneBy': _done ? uid : null,
      'description': _notes.text.length > 5000 ? _notes.text.substring(0, 5000) : _notes.text,
      // A new item is dated when saved: the notifier finds new items by date.
      'date': existing?.date ?? DateTime.now().millisecondsSinceEpoch,
      if (_shopping) 'category': _category,
    };
    if (!_shopping) {
      changes['dueAt'] = _due?.millisecondsSinceEpoch;
      changes['priority'] = _priority;
      // Repeating needs a deadline to move on from.
      changes['repeat'] = _due != null && _repeat.isNotEmpty ? _repeat : null;
      changes['assignee'] = _assignee.isEmpty ? null : _assignee;
      final at = _remind?.millisecondsSinceEpoch;
      // Only when it changed, so editing an item whose reminder fired doesn't fire it again.
      if (at != existing?.remindAt) {
        changes['remindAt'] = at;
        changes['reminded'] = false;
      }
    }
    if (existing == null) {
      createItem(l, changes).catchError((Object e) => fail(e, 'השמירה נכשלה'));
      recordHistory(l, name, changes['category'] as String?).catchError((_) {});
      toast(_shopping ? 'נוסף' : 'המשימה נוספה');
    } else {
      updateItem(l.id, existing.id, changes).catchError((Object e) => fail(e, 'השמירה נכשלה'));
      toast('נשמר');
    }
    Navigator.pop(context, ItemSheetResult.saved);
  }

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    final color = kindColor(context, _shopping);
    final gap = const SizedBox(height: 12);
    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Text(i != null ? 'עריכה' : _shopping ? 'פריט חדש' : 'משימה חדשה', style: t.textTheme.titleLarge),
          gap,
          TextField(
            controller: _name,
            autofocus: i == null,
            maxLength: 500,
            textInputAction: TextInputAction.next,
            decoration: InputDecoration(
                labelText: _shopping ? 'מה לקנות' : 'משימה', counterText: '', border: const OutlineInputBorder()),
          ),
          gap,
          if (_shopping)
            DropdownButtonFormField<String>(
              initialValue: categories.contains(_category) ? _category : 'Other',
              decoration: const InputDecoration(labelText: 'מחלקה', border: OutlineInputBorder()),
              items: [for (final c in categories) DropdownMenuItem(value: c, child: Text(categoryLabels[c]!))],
              onChanged: (v) => setState(() => _category = v ?? 'Other'),
            )
          else ...[
            _PickerRow(
              icon: Icons.event,
              label: 'תאריך יעד',
              value: _due == null ? null : shortDate(_due!),
              onPick: _pickDue,
              onClear: () => setState(() => _due = null),
            ),
            if (_due != null) ...[
              gap,
              DropdownButtonFormField<String>(
                initialValue: _repeat,
                decoration: const InputDecoration(labelText: 'חזרה', border: OutlineInputBorder()),
                items: [
                  const DropdownMenuItem(value: '', child: Text('לא חוזרת')),
                  for (final e in repeatLabels.entries) DropdownMenuItem(value: e.key, child: Text(e.value)),
                ],
                onChanged: (v) => setState(() => _repeat = v ?? ''),
              ),
            ],
            gap,
            Text('עדיפות', style: t.textTheme.labelLarge),
            const SizedBox(height: 4),
            SegmentedButton<String>(
              segments: [
                for (final e in priorityLabels.entries) ButtonSegment(value: e.key, label: Text(e.value)),
              ],
              selected: {_priority},
              onSelectionChanged: (s) => setState(() => _priority = s.first),
            ),
            if (widget.members.length > 1) ...[
              gap,
              DropdownButtonFormField<String>(
                initialValue: widget.members.any((m) => m.uid == _assignee) ? _assignee : '',
                decoration: const InputDecoration(labelText: 'באחריות', border: OutlineInputBorder()),
                items: [
                  const DropdownMenuItem(value: '', child: Text('כל אחד')),
                  for (final m in widget.members) DropdownMenuItem(value: m.uid, child: Text(nameOf(m.uid, m.name))),
                ],
                onChanged: (v) => setState(() => _assignee = v ?? ''),
              ),
            ],
            gap,
            _PickerRow(
              icon: Icons.alarm,
              label: 'תזכורת',
              help: 'התראה לכל מי שברשימה',
              value: _remind == null ? null : shortDateTime(_remind!),
              onPick: _pickRemind,
              onClear: () => setState(() => _remind = null),
            ),
          ],
          gap,
          TextField(
            controller: _notes,
            minLines: 1,
            maxLines: 6,
            maxLength: 5000,
            decoration: InputDecoration(
                labelText: _shopping ? 'כמות / הערות' : 'הערות', counterText: '', border: const OutlineInputBorder()),
          ),
          CheckboxListTile(
            contentPadding: EdgeInsets.zero,
            controlAffinity: ListTileControlAffinity.leading,
            activeColor: color,
            value: _done,
            title: Text(_shopping ? 'בסל' : 'בוצע'),
            onChanged: (v) => setState(() => _done = v ?? false),
          ),
          if (i != null) ...[
            TextButton.icon(
              onPressed: () => Navigator.pop(context, ItemSheetResult.copy),
              icon: const Icon(Icons.copy_outlined),
              label: const Text('גם ברשימות אחרות…'),
            ),
            TextButton.icon(
              style: TextButton.styleFrom(foregroundColor: t.colorScheme.error),
              onPressed: () => Navigator.pop(context, ItemSheetResult.delete),
              icon: const Icon(Icons.delete_outline),
              label: Text(_shopping ? 'מחיקת הפריט' : 'מחיקת המשימה'),
            ),
          ],
          const SizedBox(height: 8),
          Row(children: [
            Expanded(
              child: OutlinedButton(onPressed: () => Navigator.pop(context), child: const Text('ביטול')),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: FilledButton(
                style: FilledButton.styleFrom(backgroundColor: color),
                onPressed: _name.text.trim().isEmpty ? null : _save,
                child: Text(i != null ? 'שמירה' : 'הוספה'),
              ),
            ),
          ]),
        ]),
      ),
    );
  }
}

class _PickerRow extends StatelessWidget {
  const _PickerRow(
      {required this.icon, required this.label, required this.value, required this.onPick, required this.onClear, this.help});
  final IconData icon;
  final String label;
  final String? value;
  final String? help;
  final VoidCallback onPick;
  final VoidCallback onClear;

  @override
  Widget build(BuildContext context) => InputDecorator(
        decoration: InputDecoration(
          labelText: label,
          helperText: help,
          border: const OutlineInputBorder(),
          contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
        ),
        child: Row(children: [
          Icon(icon, size: 20),
          const SizedBox(width: 8),
          Expanded(
            child: TextButton(
              style: TextButton.styleFrom(alignment: AlignmentDirectional.centerStart),
              onPressed: onPick,
              child: Text(value ?? 'בחירה…'),
            ),
          ),
          if (value != null)
            IconButton(tooltip: 'הסרת $label', icon: const Icon(Icons.close), onPressed: onClear),
        ]),
      );
}
