import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:share_plus/share_plus.dart';

import '../core/errors.dart';

/// Set on the MaterialApp, so links, pushes and background writes can open a
/// screen or show a message from anywhere.
final navKey = GlobalKey<NavigatorState>();
final messengerKey = GlobalKey<ScaffoldMessengerState>();

void toast(String text, {Duration duration = const Duration(seconds: 3)}) {
  messengerKey.currentState
    ?..hideCurrentSnackBar()
    ..showSnackBar(SnackBar(content: Text(text), duration: duration));
}

void fail(Object e, String what) {
  final m = messengerKey.currentState;
  if (m != null) showError(m, e, what);
}

/// Done at once, with 5 seconds to take it back: no confirm for what undo restores.
void undoable(String text, VoidCallback undo) {
  messengerKey.currentState
    ?..hideCurrentSnackBar()
    ..showSnackBar(SnackBar(
      content: Text(text),
      duration: const Duration(seconds: 5),
      persist: false,
      action: SnackBarAction(label: 'ביטול', onPressed: undo),
    ));
}

Future<bool> confirm(BuildContext context, String title, String body, String yes,
    {bool danger = true}) async {
  final ok = await showDialog<bool>(
    context: context,
    builder: (c) => AlertDialog(
      title: Text(title),
      content: Text(body),
      actions: [
        TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('ביטול')),
        FilledButton(
          style: danger
              ? FilledButton.styleFrom(backgroundColor: Theme.of(c).colorScheme.error)
              : null,
          onPressed: () => Navigator.pop(c, true),
          child: Text(yes),
        ),
      ],
    ),
  );
  return ok == true;
}

/// One text field in a dialog; null when cancelled, or left empty unless
/// [allowEmpty] (a name cleared on purpose: '' = back to the default).
Future<String?> askText(BuildContext context, String title,
    {String initial = '', String hint = '', String yes = 'שמירה', bool allowEmpty = false, int maxLength = 100}) async {
  final c = TextEditingController(text: initial);
  final v = await showDialog<String>(
    context: context,
    builder: (ctx) => AlertDialog(
      title: Text(title),
      content: TextField(
        controller: c,
        autofocus: true,
        maxLength: maxLength,
        decoration: InputDecoration(hintText: hint),
        onSubmitted: (v) => Navigator.pop(ctx, v),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('ביטול')),
        FilledButton(onPressed: () => Navigator.pop(ctx, c.text), child: Text(yes)),
      ],
    ),
  );
  final t = v?.trim();
  return t == null || t.isEmpty && !allowEmpty ? null : t;
}

class Choice<T> {
  const Choice(this.value, this.label, {this.icon, this.danger = false, this.subtitle});
  final T value;
  final String label;
  final String? subtitle;
  final IconData? icon;
  final bool danger;
}

/// A bottom sheet of choices (the long-press and ⋮ menus); null when dismissed.
Future<T?> choose<T>(BuildContext context, List<Choice<T>> choices, {String? title}) =>
    showModalBottomSheet<T>(
      context: context,
      isScrollControlled: true,
      builder: (c) {
        final error = Theme.of(c).colorScheme.error;
        return SafeArea(
          child: ConstrainedBox(
            constraints: BoxConstraints(maxHeight: MediaQuery.sizeOf(c).height * 0.8),
            child: ListView(shrinkWrap: true, children: [
              if (title != null)
                Padding(
                  padding: const EdgeInsets.fromLTRB(20, 16, 20, 8),
                  child: Text(title, style: Theme.of(c).textTheme.titleMedium),
                ),
              for (final ch in choices)
                ListTile(
                  leading: ch.icon == null
                      ? null
                      : Icon(ch.icon, color: ch.danger ? error : null),
                  title: Text(ch.label, style: ch.danger ? TextStyle(color: error) : null),
                  subtitle: ch.subtitle == null ? null : Text(ch.subtitle!),
                  onTap: () => Navigator.pop(c, ch.value),
                ),
            ]),
          ),
        );
      },
    );

/// An empty screen that says what to do next.
class EmptyState extends StatelessWidget {
  const EmptyState(this.icon, this.title, this.body, {super.key});
  final IconData icon;
  final String title;
  final String body;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.fromLTRB(32, 64, 32, 32),
      child: Column(mainAxisSize: MainAxisSize.min, children: [
        Icon(icon, size: 56, color: t.colorScheme.primary.withValues(alpha: 0.6)),
        const SizedBox(height: 16),
        Text(title, style: t.textTheme.titleLarge, textAlign: TextAlign.center),
        const SizedBox(height: 8),
        Text(body,
            style: t.textTheme.bodyMedium?.copyWith(color: t.colorScheme.onSurfaceVariant),
            textAlign: TextAlign.center),
      ]),
    );
  }
}

/// A link through the share sheet; on Windows (no sheet) it's copied.
Future<void> shareLink(String text, String url) async {
  if (!kIsWeb && defaultTargetPlatform == TargetPlatform.windows) {
    await Clipboard.setData(ClipboardData(text: url));
    toast('הקישור הועתק. $text');
    return;
  }
  try {
    await SharePlus.instance.share(ShareParams(text: '$text\n$url', subject: text));
  } catch (_) {
    await Clipboard.setData(ClipboardData(text: url));
    toast('הקישור הועתק. $text');
  }
}

/// A small rounded label ("ראשית", a deadline chip).
class Tag extends StatelessWidget {
  const Tag(this.text, this.ink, this.bg, {super.key, this.icon});
  final String text;
  final Color ink;
  final Color bg;
  final IconData? icon;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
        decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(10)),
        child: Row(mainAxisSize: MainAxisSize.min, children: [
          if (icon != null) ...[Icon(icon, size: 14, color: ink), const SizedBox(width: 4)],
          Text(text, style: TextStyle(color: ink, fontSize: 12)),
        ]),
      );
}
