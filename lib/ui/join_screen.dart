import 'package:flutter/material.dart';

import '../lists/repo.dart';
import 'households_screen.dart';
import 'list_screen.dart';
import 'skeleton.dart';

/// An invite link (`/join/<id>`): asks, then joins.
class JoinScreen extends StatefulWidget {
  const JoinScreen({super.key, required this.inviteId});
  final String inviteId;

  @override
  State<JoinScreen> createState() => _JoinScreenState();
}

class _JoinScreenState extends State<JoinScreen> {
  Invite? _invite;
  String? _error;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    getInvite(widget.inviteId).then(
      (inv) => setState(() => inv == null ? _error = 'ההזמנה הזו לא קיימת.' : _invite = inv),
      onError: (_) => setState(() => _error = 'ההזמנה הזו לא קיימת.'),
    );
  }

  Future<void> _join(Invite inv) async {
    setState(() => _busy = true);
    try {
      final listId = await joinInvite(widget.inviteId, inv);
      if (listId != null) befriendInviter(widget.inviteId);
      if (!mounted) return;
      Navigator.pushReplacement(
        context,
        MaterialPageRoute<void>(
            builder: (_) => listId == null ? const HouseholdsScreen() : ListScreen(listId: listId)),
      );
    } catch (_) {
      // The rules refuse an invite older than 7 days.
      setState(() {
        _busy = false;
        _error = 'פג תוקף ההזמנה. בקשו קישור חדש.';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    final inv = _invite;
    return Scaffold(
      appBar: AppBar(title: const Text('הזמנה')),
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: _error != null
              ? Column(mainAxisSize: MainAxisSize.min, children: [
                  Text(_error!, style: TextStyle(color: t.colorScheme.error), textAlign: TextAlign.center),
                  TextButton(onPressed: () => Navigator.pop(context), child: const Text('לרשימות שלי')),
                ])
              : inv == null
                  ? const SkeletonList(rows: 2)
                  : Column(mainAxisSize: MainAxisSize.min, children: [
                      Text('להצטרף ${inv.kind == 'list' ? 'לרשימה' : 'למשק הבית'} "${inv.targetName}"?',
                          style: t.textTheme.titleLarge, textAlign: TextAlign.center),
                      if (inv.kind == 'household') ...[
                        const SizedBox(height: 8),
                        const Text('תראו את כל הרשימות של משק הבית הזה.'),
                      ],
                      const SizedBox(height: 24),
                      FilledButton(onPressed: _busy ? null : () => _join(inv), child: const Text('הצטרפות')),
                      TextButton(onPressed: () => Navigator.pop(context), child: const Text('לא עכשיו')),
                    ]),
        ),
      ),
    );
  }
}
