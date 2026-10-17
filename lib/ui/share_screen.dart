import 'package:flutter/material.dart';

import '../lists/logic.dart';
import '../lists/repo.dart';
import 'common.dart';
import 'home_screen.dart';
import 'list_screen.dart';

/// Text shared from another app (a list from a chat): its lines become items
/// of the list picked here, like a paste into quick add.
class ShareScreen extends StatefulWidget {
  const ShareScreen({super.key, required this.text});
  final String text;

  @override
  State<ShareScreen> createState() => _ShareScreenState();
}

class _ShareScreenState extends State<ShareScreen> {
  late final _entries = splitEntries(widget.text).map(parseEntry).where((e) => e.name.isNotEmpty).take(100).toList();

  void _addTo(TodoList l) {
    for (final e in _entries) {
      addQuick(l, e.name, e.quantity);
    }
    toast(_entries.length == 1 ? 'נוסף ל"${l.name}"' : 'נוספו ${_entries.length} פריטים ל"${l.name}"');
    Navigator.pushReplacement(context, MaterialPageRoute<void>(builder: (_) => ListScreen(listId: l.id)));
  }

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    return Scaffold(
      appBar: AppBar(title: const Text('הוספה מהשיתוף')),
      body: ListenableBuilder(
        listenable: Lists.instance,
        builder: (context, _) {
          final lists = Lists.instance.all.where((l) => l.createdAt != null).toList()
            ..sort((a, b) => a.id == mainShoppingList()?.id
                ? -1
                : b.id == mainShoppingList()?.id
                    ? 1
                    : a.shopping != b.shopping
                        ? (a.shopping ? -1 : 1)
                        : a.name.compareTo(b.name));
          return ListView(children: [
            Padding(
              padding: const EdgeInsets.all(16),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(
                    _entries.length == 1 ? 'פריט אחד:' : '${_entries.length} פריטים:',
                    style: t.textTheme.titleMedium),
                const SizedBox(height: 4),
                Text(_entries.map((e) => e.quantity.isEmpty ? e.name : '${e.name} (${e.quantity})').join(' · '),
                    maxLines: 6, overflow: TextOverflow.ellipsis),
                const SizedBox(height: 16),
                Text('לאיזו רשימה?', style: t.textTheme.titleSmall),
              ]),
            ),
            if (_entries.isEmpty) const EmptyState(Icons.text_snippet_outlined, 'אין כאן פריטים', ''),
            if (_entries.isNotEmpty)
              for (final l in lists)
                ListTile(
                  leading: Icon(l.shopping ? Icons.shopping_basket_outlined : Icons.check_box_outlined),
                  title: Text(listLabel(l)),
                  onTap: () => _addTo(l),
                ),
          ]);
        },
      ),
    );
  }
}
