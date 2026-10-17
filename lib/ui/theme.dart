import 'package:flutter/material.dart';

/// The only place colours are written. Screens use Theme.of(context) or
/// [AppTokens]; test/theme_test.dart fails on any colour not listed here.
/// A new app replaces these values with its approved palette.
abstract final class AppTokens {
  /// The recipe book's palette (its brown, cream and chestnut), so the two
  /// household apps look like one family.
  static const seed = Color(0xFFB08463);

  /// Light-mode buttons: the softest brown that keeps white text at 4.5:1.
  static const lightPrimary = Color(0xFF8F6A48);

  static const lightBg = Color(0xFFFAF6F1);
  static const lightCard = Color(0xFFFFFFFF);
  static const lightInk = Color(0xFF2B231C);
  static const lightMuted = Color(0xFF6E6157);

  static const darkBg = Color(0xFF17130F);
  static const darkCard = Color(0xFF221C17);
  static const darkInk = Color(0xFFF1EAE2);
  static const darkMuted = Color(0xFFB3A698);

  static const danger = Color(0xFFB42318);
  static const dangerDark = Color(0xFFF97066);

  /// Skeleton placeholders.
  static const skeletonLight = Color(0xFFEEE5DA);
  static const skeletonDark = Color(0xFF2E2620);

  /// Shopping lists are terracotta (the icon's chestnut), tasks the brown
  /// primary. Text in the shopping colour uses [accentInk].
  static const accent = Color(0xFFB4532A);
  static const accentInk = Color(0xFF8A3A1C);
  static const accentSoft = Color(0xFFFBE7DC);
  static const accentDark = Color(0xFFE08A5F);
  static const accentInkDark = Color(0xFFF4B793);
  static const accentSoftDark = Color(0xFF3A2219);
  static const dangerSoft = Color(0xFFFEE4E2);
  static const dangerSoftDark = Color(0xFF3B1A17);

  static const all = <Color>[
    seed, lightPrimary, lightBg, lightCard, lightInk, lightMuted, darkBg, darkCard, darkInk,
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
    primary: dark ? null : AppTokens.lightPrimary,
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
