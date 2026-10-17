import 'package:flutter/material.dart';

import '../lists/repo.dart';
import 'common.dart';
import 'home_screen.dart';

/// A list's "הזמנת אנשים": tick friends and housemates to add them at once,
/// or send a link (WhatsApp…); whoever joins through it becomes a friend.
Future<void> addPeople(BuildContext context, TodoList l) =>
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => _PeopleSheet(l),
    );

class _PeopleSheet extends StatefulWidget {
  const _PeopleSheet(this.list);
  final TodoList list;

  @override
  State<_PeopleSheet> createState() => _PeopleSheetState();
}

class _PeopleSheetState extends State<_PeopleSheet> {
  final _friends = friends();
  final _picked = <String>{};

  void _add() {
    final l = widget.list;
    addToList(l.id, [
      ..._picked,
    ]).catchError((Object e) => fail(e, 'ההוספה נכשלה'));
    toast(
      _picked.length == 1 ? 'נוסף לרשימה' : 'נוספו ${_picked.length} לרשימה',
    );
    Navigator.pop(context);
  }

  void _link() {
    Navigator.pop(context);
    shareInvite('list', widget.list.id, widget.list.name);
  }

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    final l = widget.list;
    final house = Lists.instance.households
        .where((h) => h.id == l.householdId)
        .firstOrNull;
    // Already in: its members and, while it is filed there, its household.
    final inside = {...l.memberUids, ...?house?.memberUids};
    return SafeArea(
      child: StreamBuilder<List<Friend>>(
        stream: _friends,
        builder: (context, snap) {
          final people = [...?snap.data?.where((f) => !inside.contains(f.uid))];
          return ListView(
            shrinkWrap: true,
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
                child: Text(
                  'הוספת אנשים ל"${l.name}"',
                  style: t.textTheme.titleMedium,
                ),
              ),
              if (snap.hasData && people.isEmpty)
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  child: Text(
                    'כל החברים כבר ברשימה, או שעוד אין חברים. מי שמצטרף דרך קישור שלך '
                    'נהיה חבר, כאן ובספר המתכונים.',
                    style: t.textTheme.bodyMedium?.copyWith(
                      color: t.colorScheme.onSurfaceVariant,
                    ),
                  ),
                ),
              for (final f in people)
                CheckboxListTile(
                  value: _picked.contains(f.uid),
                  onChanged: (v) => setState(
                    () =>
                        v == true ? _picked.add(f.uid) : _picked.remove(f.uid),
                  ),
                  title: Text(f.name.isEmpty ? 'ללא שם' : f.name),
                  subtitle: f.mate ? const Text('ממשק הבית') : null,
                  secondary: Icon(
                    f.mate ? Icons.home_outlined : Icons.person_outline,
                  ),
                ),
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
                child: Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    if (people.isNotEmpty)
                      FilledButton.icon(
                        onPressed: _picked.isEmpty ? null : _add,
                        icon: const Icon(Icons.group_add_outlined),
                        label: Text(
                          _picked.isEmpty
                              ? 'הוספה'
                              : 'הוספה (${_picked.length})',
                        ),
                      ),
                    OutlinedButton.icon(
                      onPressed: _link,
                      icon: const Icon(Icons.share_outlined),
                      label: const Text('שליחת קישור (וואטסאפ…)'),
                    ),
                  ],
                ),
              ),
            ],
          );
        },
      ),
    );
  }
}
