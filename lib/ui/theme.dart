import 'package:flutter/material.dart';

/// The only place colours are written. Screens use Theme.of(context) or
/// [AppTokens]; test/theme_test.dart fails on any colour not listed here.
/// A new app replaces these values with its approved palette.
abstract final class AppTokens {
  static const seed = Color(0xFF047857);

  static const lightBg = Color(0xFFF6FAF8);
  static const lightCard = Color(0xFFFFFFFF);
  static const lightInk = Color(0xFF1F2A26);
  static const lightMuted = Color(0xFF5B6B65);

  static const darkBg = Color(0xFF111614);
  static const darkCard = Color(0xFF1B2220);
  static const darkInk = Color(0xFFE7EFEC);
  static const darkMuted = Color(0xFF9AAAA4);

  static const danger = Color(0xFFB42318);
  static const dangerDark = Color(0xFFF97066);

  /// Skeleton placeholders.
  static const skeletonLight = Color(0xFFE4ECE8);
  static const skeletonDark = Color(0xFF26302D);

  /// Shopping lists are amber (fills only; text on white never lighter than
  /// [accentInk]), tasks green: design-system/todo-and-shopping/MASTER.md.
  static const accent = Color(0xFFD97706);
  static const accentInk = Color(0xFF92400E);
  static const accentSoft = Color(0xFFFEF3C7);
  static const accentDark = Color(0xFFF59E0B);
  static const accentInkDark = Color(0xFFFCD34D);
  static const accentSoftDark = Color(0xFF3A2A12);
  static const dangerSoft = Color(0xFFFEE4E2);
  static const dangerSoftDark = Color(0xFF3B1A17);

  static const all = <Color>[
    seed, lightBg, lightCard, lightInk, lightMuted, darkBg, darkCard, darkInk,
    darkMuted, danger, dangerDark, skeletonLight, skeletonDark, accent, accentInk,
    accentSoft, accentDark, accentInkDark, accentSoftDark, dangerSoft, dangerSoftDark,
  ];
}

ThemeData appTheme(Brightness brightness) {
  final dark = brightness == Brightness.dark;
  final scheme = ColorScheme.fromSeed(
    seedColor: AppTokens.seed,
    brightness: brightness,
  ).copyWith(
    surface: dark ? AppTokens.darkCard : AppTokens.lightCard,
    onSurface: dark ? AppTokens.darkInk : AppTokens.lightInk,
    onSurfaceVariant: dark ? AppTokens.darkMuted : AppTokens.lightMuted,
    error: dark ? AppTokens.dangerDark : AppTokens.danger,
  );
  return ThemeData(
    colorScheme: scheme,
    fontFamily: 'Rubik',
    scaffoldBackgroundColor: dark ? AppTokens.darkBg : AppTokens.lightBg,
    appBarTheme: AppBarTheme(
      backgroundColor: dark ? AppTokens.darkBg : AppTokens.lightBg,
      foregroundColor: dark ? AppTokens.darkInk : AppTokens.lightInk,
      elevation: 0,
      scrolledUnderElevation: 0,
    ),
    cardTheme: CardThemeData(
      color: dark ? AppTokens.darkCard : AppTokens.lightCard,
      elevation: 0,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
    ),
    snackBarTheme: const SnackBarThemeData(behavior: SnackBarBehavior.floating),
  );
}

Color skeletonColor(BuildContext context) =>
    Theme.of(context).brightness == Brightness.dark
        ? AppTokens.skeletonDark
        : AppTokens.skeletonLight;

bool _dark(BuildContext c) => Theme.of(c).brightness == Brightness.dark;

/// The colour of a list's kind: amber for shopping, the primary green for tasks.
Color kindColor(BuildContext c, bool shopping) => shopping
    ? (_dark(c) ? AppTokens.accentDark : AppTokens.accent)
    : Theme.of(c).colorScheme.primary;

/// Text in the shopping colour, readable on the card.
Color accentInk(BuildContext c) => _dark(c) ? AppTokens.accentInkDark : AppTokens.accentInk;
Color accentSoft(BuildContext c) => _dark(c) ? AppTokens.accentSoftDark : AppTokens.accentSoft;
Color dangerSoft(BuildContext c) => _dark(c) ? AppTokens.dangerSoftDark : AppTokens.dangerSoft;
