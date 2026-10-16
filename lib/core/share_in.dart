import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';

/// Text shared to the app from another one (Android only).
const _channel = MethodChannel('app/share');

bool get _android => !kIsWeb && defaultTargetPlatform == TargetPlatform.android;

/// Bumps when a share arrives while the app is running.
final shareArrived = ValueNotifier<int>(0);

void listenForShares() {
  if (!_android) return;
  _channel.setMethodCallHandler((call) async {
    if (call.method == 'shared') shareArrived.value++;
  });
}

/// The waiting share, once (MainActivity forgets it after this), or null.
Future<String?> takeShared() async {
  if (!_android) return null;
  final text = (await _channel.invokeMethod<String>('take'))?.trim();
  return text == null || text.isEmpty ? null : text;
}

/// A sister app by its Android package; false when it isn't installed.
Future<bool> openAndroidApp(String package) async {
  if (!_android) return false;
  try {
    return await const MethodChannel('app/system')
            .invokeMethod<bool>('openApp', {'package': package}) ??
        false;
  } catch (_) {
    return false;
  }
}
