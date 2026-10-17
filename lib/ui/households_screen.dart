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

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    return Scaffold(
      appBar: AppBar(title: const Text('משקי בית')),
      floatingActionButton: FloatingActionButton(
        tooltip: 'משק בית חדש',
        onPressed: () => _create(context),
        child: const Icon(Icons.add),
      ),
      body: ListenableBuilder(
        listenable: Lists.instance,
        builder: (context, _) {
          final houses = Lists.instance.households;
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
          ]);
        },
      ),
    );
  }
}
