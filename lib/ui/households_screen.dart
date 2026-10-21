import 'package:flutter/material.dart';

import '../lists/repo.dart';
import 'common.dart';
import 'home_screen.dart';

/// A household shares every list filed under it with all of its members.
class HouseholdsScreen extends StatelessWidget {
  const HouseholdsScreen({super.key});

  Future<void> _create(BuildContext context) async {
    final name = await askText(context, 'משק בית חדש', hint: 'למשל: הבית', yes: 'יצירה');
    if (name == null) return;
    try {
      await createHousehold(name);
      toast('משק הבית נוצר');
    } catch (e) {
      fail(e, 'יצירת משק הבית נכשלה');
    }
  }

  Future<void> _menu(BuildContext context, Household h) async {
    final owner = h.ownerUid == uid;
    final a = await choose<String>(context, title: h.name, [
      const Choice('invite', 'הזמנה למשק הבית', icon: Icons.person_add_alt),
      if (owner) ...const [
        Choice('rename', 'שינוי שם', icon: Icons.edit_outlined),
        Choice('delete', 'מחיקת משק הבית', icon: Icons.delete_outline, danger: true),
      ] else
        const Choice('leave', 'עזיבת משק הבית', icon: Icons.logout, danger: true),
    ]);
    if (!context.mounted) return;
    try {
      switch (a) {
        case 'invite':
          await shareInvite('household', h.id, h.name);
        case 'rename':
          final name = await askText(context, 'שינוי שם', initial: h.name);
          if (name != null) await renameHousehold(h.id, name);
        case 'delete':
          if (await confirm(context, 'למחוק את משק הבית?',
              'הרשימות שלו נשמרות, אבל רק מי שהוזמן אליהן ישירות ימשיך לראות אותן.', 'מחיקה')) {
            await deleteHousehold(h.id);
            toast('משק הבית נמחק');
          }
        case 'leave':
          if (await confirm(context, 'לעזוב את משק הבית?', 'לא תראו יותר את הרשימות של "${h.name}".', 'עזיבה')) {
            await leaveHousehold(h.id);
            toast('עזבת את משק הבית');
          }
      }
    } catch (e) {
      fail(e, 'משהו השתבש');
    }
  }

  /// A name for them only you see ("אמא"), here and in the recipe book;
  /// empty = the name they chose.
  Future<void> _alias(BuildContext context, Friend f) async {
    final old = aliases.value[f.uid] ?? '';
    final alias = await askText(context, 'כינוי ל${chosenName(f.uid, f.name)}',
        initial: old, hint: 'רק אתם רואים אותו. ריק = השם שבחרו', allowEmpty: true, maxLength: 40);
    if (alias == null || alias == old) return;
    try {
      await setAlias(f.uid, alias);
    } catch (e) {
      fail(e, 'הכינוי לא נשמר');
    }
  }

  Future<void> _unfriend(BuildContext context, Friend f) async {
    if (!await confirm(context, 'להסיר את ${nameOf(f.uid, f.name)}?',
        'גם בספר המתכונים. הרשימות המשותפות נשארות, עד שמישהו עוזב אותן.', 'הסרה')) {
      return;
    }
    try {
      await unfriend(f.uid);
      toast('החבר הוסר');
    } catch (e) {
      fail(e, 'ההסרה נכשלה');
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    return Scaffold(
      appBar: AppBar(title: const Text('משקי בית וחברים')),
      floatingActionButton: FloatingActionButton(
        tooltip: 'משק בית חדש',
        onPressed: () => _create(context),
        child: const Icon(Icons.add),
      ),
      body: StreamBuilder<List<Friend>>(
        stream: friends(),
        builder: (context, snap) => ListenableBuilder(
          listenable: Listenable.merge([Lists.instance, shownNames]),
          builder: (context, _) {
          final houses = Lists.instance.households;
          final people = snap.data ?? const <Friend>[];
          return ListView(padding: const EdgeInsets.only(bottom: 96), children: [
            Padding(
              padding: const EdgeInsets.all(16),
              child: Text(
                'כל מי שבמשק הבית רואה את כל הרשימות שמשויכות אליו. רשימה שלא משויכת '
                'למשק בית נשארת פרטית: רק לך ולמי שהזמנת אליה.',
                style: t.textTheme.bodyMedium?.copyWith(color: t.colorScheme.onSurfaceVariant),
              ),
            ),
            if (houses.isEmpty)
              const EmptyState(Icons.home_outlined, 'אין עדיין משק בית', 'צרו אחד והזמינו את מי שגר איתכם.'),
            for (final h in houses)
              Card(
                margin: const EdgeInsets.fromLTRB(12, 0, 12, 8),
                child: ListTile(
                  leading: const Icon(Icons.home_outlined),
                  title: Text(h.name),
                  subtitle: Text('${h.memberUids.length == 1 ? 'חבר אחד' : '${h.memberUids.length} חברים'}'
                      '${h.ownerUid == uid ? ' · בבעלותך' : ''}'),
                  trailing: IconButton(
                    tooltip: 'הזמנה',
                    icon: const Icon(Icons.person_add_alt),
                    onPressed: () => shareInvite('household', h.id, h.name),
                  ),
                  onTap: () => _menu(context, h),
                  onLongPress: () => _menu(context, h),
                ),
              ),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 24, 16, 4),
              child: Text('חברים', style: t.textTheme.titleMedium),
            ),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: Text(
                'אותם חברים כמו בספר המתכונים. כל מי שבמשק בית שלך חבר אוטומטית, ומי שמצטרף '
                'לרשימה דרך קישור שלך נהיה חבר. אפשר להוסיף חברים לרשימה בלי קישור. '
                'לחיצה על חבר נותנת לו כינוי שרק אתם רואים, כאן ובספר המתכונים.',
                style: t.textTheme.bodyMedium?.copyWith(color: t.colorScheme.onSurfaceVariant),
              ),
            ),
            for (final f in people)
              ListTile(
                leading: Icon(f.mate ? Icons.home_outlined : Icons.person_outline),
                title: Text(nameOf(f.uid, f.name).isEmpty ? 'ללא שם' : nameOf(f.uid, f.name)),
                // With an alias, the name they chose too, so it's clear who it is.
                subtitle: f.mate || aliases.value.containsKey(f.uid)
                    ? Text([
                        if (aliases.value.containsKey(f.uid)) chosenName(f.uid, f.name),
                        if (f.mate) 'ממשק הבית',
                      ].join(' · '))
                    : null,
                onTap: () => _alias(context, f),
                trailing: f.mate
                    ? null
                    : IconButton(
                        tooltip: 'הסרת החבר',
                        icon: const Icon(Icons.person_remove_outlined),
                        onPressed: () => _unfriend(context, f),
                      ),
              ),
          ]);
          },
        ),
      ),
    );
  }
}
