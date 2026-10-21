import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Per-device choices that change how the app looks.
class SettingsStore extends ChangeNotifier {
  SettingsStore._();
  static final instance = SettingsStore._();

  ThemeMode themeMode = ThemeMode.system;

  /// Early users only: install prereleases. On until they turn it off.
  bool beta = true;

  Future<void> load() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final v = prefs.getString('theme');
      themeMode = ThemeMode.values.firstWhere((m) => m.name == v,
          orElse: () => ThemeMode.system);
      beta = prefs.getBool('beta') ?? true;
    } catch (_) {}
  }

  Future<void> setBeta(bool on) async {
    beta = on;
    notifyListeners();
    try {
      await (await SharedPreferences.getInstance()).setBool('beta', on);
    } catch (_) {}
  }

  Future<void> setThemeMode(ThemeMode m) async {
    themeMode = m;
    notifyListeners();
    try {
      await (await SharedPreferences.getInstance()).setString('theme', m.name);
    } catch (_) {}
  }
}
