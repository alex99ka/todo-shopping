import 'dart:async';

import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../config.dart';
import '../core/app_info.dart';
import '../core/errors.dart';
import '../core/home_widgets.dart';
import '../core/lock.dart';
import '../core/notifications.dart';
import '../core/share_in.dart';
import '../core/tour.dart';
import '../core/update.dart';
import '../core/web_update.dart';
import '../lists/links.dart';
import '../lists/repo.dart';
import '../lists/widget.dart';
import 'common.dart';
import 'households_screen.dart';
import 'import_screen.dart';
import 'join_screen.dart';
import 'list_screen.dart';
import 'settings_page.dart';
import 'share_screen.dart';
import 'skeleton.dart';
import 'theme.dart';
import 'update_banner.dart';

/// "הרשימות שלי": personal lists, lists shared with you, then one section
/// per household. Each row says what is waiting, not when it was made.
class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  late final AppLifecycleListener _lifecycle;
  StreamSubscription<Uri?>? _widgetTaps;
  final _search = TextEditingController();
  bool _searching = false;

  @override
  void initState() {
    super.initState();
    Lists.instance.start();
    reportWriteError = fail;
    createStarterLists();
    // Updates: at launch, and on coming back to the app.
    _checkUpdates();
    _lifecycle = AppLifecycleListener(onResume: _checkUpdates);
    WidgetsBinding.instance.addPostFrameCallback((_) => _afterFirstFrame());
    _widgetTaps = listenWidgetTaps(_widgetAction);
    pendingLink.addListener(_openPending);
    shareArrived.addListener(_takeShare);
    Lists.instance.addListener(_updateWidgets);
  }

  void _checkUpdates() {
    AppUpdater.instance?.checkIfDue();
    WebUpdate.instance.check();
  }

  Future<void> _afterFirstFrame() async {
    if (!mounted) return;
    final messenger = ScaffoldMessenger.of(context);
    setUpNotifications(messenger, onOpen: (data) {
      final path = data['path'];
      // Only the app's own paths: a push can't send it anywhere else.
      if (path is String && path.startsWith('/') && !path.startsWith('//')) {
        pendingLink.value = AppLink.parse(path);
      }
    }).ignore();
    _openPending();
    _takeShare();
    // The whole tour on a new device; after an update, what it brought.
    final steps = await tourForThisLaunch(AppInfo.version);
    if (steps != null && steps.isNotEmpty) {
      runningTour.value = steps;
    } else if (steps != null && AppConfig.releaseNotes.isNotEmpty) {
      messenger.showSnackBar(SnackBar(
        duration: const Duration(seconds: 8),
        content: Text('מה חדש בגרסה ${AppInfo.version}: ${AppConfig.releaseNotes}'),
      ));
    }
    if (steps == null && await shouldOfferFingerprint() && mounted) {
      _offerFingerprint(messenger);
    }
  }

  Future<void> _offerFingerprint(ScaffoldMessengerState messenger) async {
    final yes = await showDialog<bool>(
      context: context,
      builder: (c) => AlertDialog(
        icon: const Icon(Icons.fingerprint),
        title: const Text('להיכנס בטביעת אצבע?'),
        content: const Text('בפעם הבאה שתפתחו את האפליקציה, טביעת אצבע במקום '
            'Google. אפשר לשנות בהגדרות.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('לא עכשיו')),
          FilledButton(onPressed: () => Navigator.pop(c, true), child: const Text('כן')),
        ],
      ),
    );
    if (yes != true) return;
    final r = await enableFingerprint();
    messenger.showSnackBar(SnackBar(
      content: Text(switch (r) {
        FingerprintResult.enabled => 'טביעת האצבע פעילה',
        FingerprintResult.cancelled => 'לא הופעל. אפשר להפעיל בהגדרות',
        FingerprintResult.unsupported => errorText(Errors.noBiometrics),
      }),
    ));
  }

  void _openPending() {
    final link = pendingLink.value;
    if (link == null || !mounted) return;
    pendingLink.value = null;
    final nav = Navigator.of(context);
    nav.popUntil((r) => r.isFirst);
    final Widget screen = switch (link) {
      OpenList(:final listId) => ListScreen(listId: listId),
      JoinLink(:final inviteId) => JoinScreen(inviteId: inviteId),
      ImportLink(:final json) => ImportScreen(json: json),
      OpenHouseholds() => const HouseholdsScreen(),
      OpenSettings() => const SettingsPage(),
    };
    nav.push(MaterialPageRoute<void>(builder: (_) => screen));
  }

  Future<void> _takeShare() async {
    final text = await takeShared();
    if (text == null || !mounted) return;
    Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => ShareScreen(text: text)));
  }

  /// The home widget's + opens its list ready for one item (the app closes
  /// after it); its title opens the list.
  void _widgetAction(Uri uri) {
    final id = uri.queryParameters['list'] ?? mainShoppingList()?.id;
    if (id == null || !mounted) return;
    Navigator.of(context).popUntil((r) => r.isFirst);
    final add = uri.host == 'add';
    Navigator.of(context).push(MaterialPageRoute<void>(
        builder: (_) => ListScreen(listId: id, focusAdd: add, closeAfterAdd: add)));
  }

  void _updateWidgets() {
    final store = Lists.instance;
    pushWidgetData(widgetJson(store.all, store.itemsOf, store.mainListId));
  }

  @override
  void dispose() {
    _lifecycle.dispose();
    _widgetTaps?.cancel();
    pendingLink.removeListener(_openPending);
    shareArrived.removeListener(_takeShare);
    Lists.instance.removeListener(_updateWidgets);
    _search.dispose();
    super.dispose();
  }

  Future<void> _openRecipeBook() async {
    if (await openAndroidApp('com.alex99ka.recipes')) return;
    await launchUrl(Uri.parse('https://alex-recipe-book.web.app'),
        mode: LaunchMode.externalApplication);
  }

  Future<void> _addList() async {
    final kind = await choose<String>(context, title: 'איזו רשימה?', const [
      Choice('shopping', 'רשימת קניות',
          subtitle: 'לפי מחלקות בסופר', icon: Icons.shopping_basket_outlined),
      Choice('todo', 'רשימת משימות',
          subtitle: 'עם תאריכי יעד ותזכורות', icon: Icons.check_box_outlined),
    ]);
    if (kind == null || !mounted) return;
    final shopping = kind == 'shopping';
    final name = await askText(context, shopping ? 'רשימת קניות חדשה' : 'רשימת משימות חדשה',
        initial: shopping ? shoppingListName : '',
        hint: shopping ? '' : 'למשל: סידורים לסופ״ש',
        yes: 'המשך');
    if (name == null || !mounted) return;
    final house = await pickHousehold(context);
    if (house == false || !mounted) return;
    try {
      final id = await createList(name, kind, house is Household ? house : null);
      if (!mounted) return;
      Navigator.push(context, MaterialPageRoute<void>(builder: (_) => ListScreen(listId: id)));
    } catch (e) {
      fail(e, 'יצירת הרשימה נכשלה');
    }
  }

  Future<void> _listMenu(TodoList l) async {
    final action = await choose<String>(context, title: l.name, [
      const Choice('invite', 'הזמנת אנשים', icon: Icons.person_add_alt),
      if (l.mine) ...const [
        Choice('rename', 'שינוי שם', icon: Icons.edit_outlined),
        Choice('delete', 'מחיקת הרשימה', icon: Icons.delete_outline, danger: true),
      ] else if (l.memberUids.contains(uid))
        const Choice('leave', 'עזיבת הרשימה', icon: Icons.logout, danger: true),
    ]);
    if (!mounted) return;
    switch (action) {
      case 'invite':
        await shareInvite('list', l.id, l.name);
      case 'rename':
        final name = await askText(context, 'שינוי שם', initial: l.name);
        if (name != null) renameList(l.id, name).catchError((Object e) => fail(e, 'שינוי השם נכשל'));
      case 'delete':
        if (await confirm(context, 'למחוק את הרשימה?',
            '"${l.name}" וכל מה שבה יימחקו אצל כולם.', 'מחיקה')) {
          deleteList(l.id).catchError((Object e) => fail(e, 'המחיקה נכשלה'));
        }
      case 'leave':
        if (await confirm(context, 'לעזוב את הרשימה?', 'לא תראו יותר את "${l.name}".', 'עזיבה')) {
          leave('lists', l.id).catchError(
              (Object e) => fail(e, 'אפשר לעזוב רק רשימה שהצטרפת אליה ישירות'));
        }
    }
  }

  List<Widget> _sections(BuildContext context) {
    final store = Lists.instance;
    final term = _search.text.trim().toLowerCase();
    final lists = store.all.where((l) => l.name.toLowerCase().contains(term)).toList()
      ..sort((a, b) =>
          a.shopping != b.shopping ? (a.shopping ? -1 : 1) : a.name.compareTo(b.name));
    final known = {for (final h in store.households) h.id};
    final sections = [
      ('אישי', Icons.lock_outline, lists.where((l) => l.householdId == null).toList()),
      (
        'שותפו איתך',
        Icons.people_outline,
        lists.where((l) => l.householdId != null && !known.contains(l.householdId)).toList()
      ),
      for (final h in store.households)
        (h.name, Icons.home_outlined, lists.where((l) => l.householdId == h.id).toList()),
    ].where((s) => s.$3.isNotEmpty).toList();
    if (sections.isEmpty) {
      return [
        store.all.isEmpty
            ? const EmptyState(Icons.checklist, 'אין עדיין רשימות',
                'לחצו + ליצירת רשימת קניות או רשימת משימות.')
            : EmptyState(Icons.search_off, 'לא נמצא', 'אין רשימה בשם "$term".'),
      ];
    }
    final t = Theme.of(context);
    final firstList = sections.first.$3.first;
    return [
      for (final (title, icon, ls) in sections) ...[
        _SectionHeader(title, icon),
        Card(
          margin: const EdgeInsets.symmetric(horizontal: 12),
          clipBehavior: Clip.antiAlias,
          child: Column(children: [
            for (final l in ls)
              if (l == firstList)
                TourTarget('home.first', child: _ListRow(l, onMenu: () => _listMenu(l)))
              else
                _ListRow(l, onMenu: () => _listMenu(l)),
          ]),
        ),
      ],
      Padding(
        padding: const EdgeInsets.all(20),
        child: Text('לחיצה ארוכה על רשימה: הזמנה, שינוי שם, מחיקה.',
            textAlign: TextAlign.center,
            style: t.textTheme.bodySmall?.copyWith(color: t.colorScheme.onSurfaceVariant)),
      ),
    ];
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: _searching
            ? TextField(
                controller: _search,
                autofocus: true,
                decoration:
                    const InputDecoration(hintText: 'חיפוש רשימה', border: InputBorder.none),
                onChanged: (_) => setState(() {}),
              )
            : const Text('הרשימות שלי'),
        actions: [
          IconButton(
            tooltip: _searching ? 'סגירת החיפוש' : 'חיפוש',
            icon: Icon(_searching ? Icons.close : Icons.search),
            onPressed: () => setState(() {
              _searching = !_searching;
              _search.clear();
            }),
          ),
          TourTarget(
            'home.households',
            child: IconButton(
              tooltip: 'משקי בית',
              icon: const Icon(Icons.home_outlined),
              onPressed: () => Navigator.push(
                  context, MaterialPageRoute<void>(builder: (_) => const HouseholdsScreen())),
            ),
          ),
          TourTarget(
            'home.recipes',
            child: IconButton(
              tooltip: 'ספר מתכונים',
              icon: const Icon(Icons.menu_book_outlined),
              onPressed: _openRecipeBook,
            ),
          ),
          TourTarget(
            'settings',
            child: IconButton(
              tooltip: 'הגדרות',
              icon: const Icon(Icons.settings_outlined),
              onPressed: () => Navigator.push(
                  context, MaterialPageRoute<void>(builder: (_) => const SettingsPage())),
            ),
          ),
        ],
      ),
      floatingActionButton: TourTarget(
        'home.add',
        child: FloatingActionButton(
          tooltip: 'רשימה חדשה',
          onPressed: _addList,
          child: const Icon(Icons.add),
        ),
      ),
      body: Column(children: [
        const UpdateBanner(),
        Expanded(
          child: ListenableBuilder(
            listenable: Lists.instance,
            builder: (context, _) {
              final store = Lists.instance;
              if (!store.loaded) return const SkeletonList();
              if (store.error != null && store.all.isEmpty) {
                return EmptyState(Icons.cloud_off, 'הרשימות לא נטענו', errorText(store.error!));
              }
              return RefreshIndicator(
                // Live already; a pull checks for updates, so it's never dead.
                onRefresh: () async => _checkUpdates(),
                child: ListView(
                  padding: const EdgeInsets.only(bottom: 96),
                  children: _sections(context),
                ),
              );
            },
          ),
        ),
      ]),
    );
  }
}

class _SectionHeader extends StatelessWidget {
  const _SectionHeader(this.title, this.icon);
  final String title;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 20, 20, 8),
      child: Row(children: [
        Icon(icon, size: 18, color: t.colorScheme.onSurfaceVariant),
        const SizedBox(width: 8),
        Text(title,
            style: t.textTheme.titleSmall?.copyWith(color: t.colorScheme.onSurfaceVariant)),
      ]),
    );
  }
}

class _ListRow extends StatelessWidget {
  const _ListRow(this.l, {required this.onMenu});
  final TodoList l;
  final VoidCallback onMenu;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    final (text, late) = _status(Lists.instance.itemsOf(l.id));
    final color = kindColor(context, l.shopping);
    return ListTile(
      minTileHeight: 64,
      leading: CircleAvatar(
        backgroundColor: color.withValues(alpha: 0.14),
        foregroundColor: color,
        child: Icon(l.shopping ? Icons.shopping_basket_outlined : Icons.check_box_outlined),
      ),
      title: Row(children: [
        Flexible(child: Text(l.name, overflow: TextOverflow.ellipsis)),
        if (l.id == Lists.instance.mainListId) ...[
          const SizedBox(width: 8),
          Tag('ראשית', accentInk(context), accentSoft(context)),
        ],
      ]),
      subtitle: Text(text,
          style: TextStyle(color: late ? t.colorScheme.error : t.colorScheme.onSurfaceVariant)),
      trailing: const Icon(Icons.chevron_left),
      onTap: () => Navigator.push(
          context, MaterialPageRoute<void>(builder: (_) => ListScreen(listId: l.id))),
      onLongPress: onMenu,
    );
  }

  (String, bool) _status(List<Item>? items) {
    if (items == null) return (l.shopping ? 'קניות' : 'משימות', false);
    final s = summarize(items);
    if (s.total == 0) return ('ריקה', false);
    if (l.shopping) return (s.open > 0 ? '${s.open} לקנות' : 'הכול בסל', false);
    final parts = [
      if (s.overdue > 0) '${s.overdue} באיחור',
      if (s.today > 0) '${s.today} היום',
    ];
    if (parts.isNotEmpty) return (parts.join(' · '), s.overdue > 0);
    return (s.open > 0 ? '${s.open} פתוחות' : 'הכול בוצע', false);
  }
}

/// The main shopping list: the one chosen, else the household's, else any.
TodoList? mainShoppingList() {
  final lists = Lists.instance.all.where((l) => l.shopping).toList();
  return lists.where((l) => l.id == Lists.instance.mainListId).firstOrNull ??
      lists.where((l) => l.householdId != null).firstOrNull ??
      lists.firstOrNull;
}

/// Who sees a list: a household (returned), personal (null), or cancelled
/// (false). Skips the question when there's no household.
Future<Object?> pickHousehold(BuildContext context, {String personal = 'רק אני (אישי)'}) async {
  final houses = Lists.instance.households;
  if (houses.isEmpty) return null;
  final v = await choose<Object>(context, title: 'מי יראה את הרשימה?', [
    for (final h in houses) Choice<Object>(h, 'משק הבית: ${h.name}', icon: Icons.home_outlined),
    Choice<Object>('personal', personal, icon: Icons.lock_outline),
  ]);
  if (v == null) return false;
  return v is Household ? v : null;
}

/// An invite link through the share sheet (copied where there's none).
Future<void> shareInvite(String kind, String id, String name) async {
  try {
    final url = await createInvite(kind, id, name);
    await shareLink('הצטרפות ל"$name" (הקישור בתוקף 7 ימים)', url);
  } catch (e) {
    fail(e, 'לא הצלחנו ליצור הזמנה');
  }
}
