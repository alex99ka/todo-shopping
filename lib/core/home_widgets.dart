import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:home_widget/home_widget.dart';

/// The Android home screen widget (android/.../HomeWidgets.kt). This is the
/// plumbing; what it shows and does is lib/lists/widget.dart.
const _package = 'com.alex99ka.todoshop';
const _widget = 'SummaryWidget';

bool get homeWidgetsSupported =>
    !kIsWeb && defaultTargetPlatform == TargetPlatform.android;

String? _last;

/// Hands the widget its data (a JSON string) and redraws it. Cheap to call on
/// every change: writes only when the data changed.
Future<void> pushWidgetData(String data) async {
  if (!homeWidgetsSupported || data == _last) return;
  _last = data;
  try {
    await HomeWidget.saveWidgetData('lists', data);
    await HomeWidget.updateWidget(qualifiedAndroidName: '$_package.$_widget');
  } catch (_) {} // the widget keeps its last data
}

/// Taps on the widget that open the app (`todoshopping://add?list=…`,
/// `…open?list=…`), also when the tap is what launched it.
StreamSubscription<Uri?>? listenWidgetTaps(void Function(Uri uri) onTap) {
  if (!homeWidgetsSupported) return null;
  HomeWidget.initiallyLaunchedFromHomeWidget().then((uri) {
    if (uri != null) onTap(uri);
  });
  return HomeWidget.widgetClicked.listen((uri) {
    if (uri != null) onTap(uri);
  });
}

/// Taps handled without opening the app run [callback] in the background.
Future<void> registerWidgetCallback(FutureOr<void> Function(Uri?) callback) async {
  if (!homeWidgetsSupported) return;
  try {
    await HomeWidget.registerInteractivityCallback(callback);
  } catch (_) {}
}

/// Settings › "הוספת וידג׳ט": the launcher's own pin dialog, or how to add
/// it by hand where the launcher can't.
Future<void> pinHomeWidget(BuildContext context) async {
  final messenger = ScaffoldMessenger.of(context);
  try {
    if (await HomeWidget.isRequestPinWidgetSupported() == true) {
      await HomeWidget.requestPinWidget(qualifiedAndroidName: '$_package.$_widget');
      return;
    }
  } catch (_) {}
  messenger.showSnackBar(const SnackBar(
      content: Text('לחיצה ארוכה על מסך הבית › וידג׳טים › בוחרים את האפליקציה')));
}
