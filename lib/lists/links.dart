import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';

/// A link into the app: `/details/<listId>`, `/join/<inviteId>`,
/// `/import#{"recipe":…,"items":[…]}` (the recipe book's contract),
/// `/households`, `/settings`. They arrive as an Android App Link (cold start
/// or while running), the web page's own address, or a tapped push.
sealed class AppLink {
  const AppLink();

  static AppLink? parse(String? location) {
    if (location == null || location.isEmpty || location == '/') return null;
    // By hand, not Uri.parse: Android hands over the fragment already decoded,
    // and a recipe's "5%" in it would make Uri.parse throw.
    var rest = location.replaceFirst(RegExp(r'^https?://[^/#?]*'), '');
    final hash = rest.indexOf('#');
    final fragment = hash < 0 ? '' : rest.substring(hash + 1);
    if (hash >= 0) rest = rest.substring(0, hash);
    final query = rest.indexOf('?');
    if (query >= 0) rest = rest.substring(0, query);
    final parts = rest.split('/').where((s) => s.isNotEmpty).toList();
    if (parts.isEmpty) return null;
    return switch (parts) {
      ['details', final id] => OpenList(id),
      ['join', final id] => JoinLink(id),
      ['import'] => ImportLink(_decoded(fragment)),
      ['households'] => const OpenHouseholds(),
      ['settings'] => const OpenSettings(),
      _ => null,
    };
  }
}

String _decoded(String s) {
  try {
    return Uri.decodeComponent(s);
  } catch (_) {
    return s; // already decoded (Android), with a lone % in it
  }
}

class OpenList extends AppLink {
  const OpenList(this.listId);
  final String listId;
}

class JoinLink extends AppLink {
  const JoinLink(this.inviteId);
  final String inviteId;
}

class ImportLink extends AppLink {
  const ImportLink(this.json);
  final String json;
}

class OpenHouseholds extends AppLink {
  const OpenHouseholds();
}

class OpenSettings extends AppLink {
  const OpenSettings();
}

/// The link waiting for the home screen (sign-in may come first).
final pendingLink = ValueNotifier<AppLink?>(null);

/// Called once from main(): the link the app was opened with, and links that
/// arrive while it runs.
void listenForLinks() {
  final first = kIsWeb ? _webLocation() : PlatformDispatcher.instance.defaultRouteName;
  pendingLink.value = AppLink.parse(first);
  WidgetsBinding.instance.addObserver(_LinkObserver());
}

String _webLocation() {
  final b = Uri.base;
  return b.path + (b.hasFragment ? '#${b.fragment}' : '');
}

class _LinkObserver with WidgetsBindingObserver {
  // Before MaterialApp's own observer: it would push the path as a named route.
  @override
  Future<bool> didPushRouteInformation(RouteInformation info) async {
    final link = AppLink.parse(info.uri.toString());
    if (link == null) return false;
    pendingLink.value = link;
    return true;
  }
}
