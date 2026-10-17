# משימות וקניות (Flutter): context

Shared shopping and task lists, on the `make-an-app` core (copied from
`app-shell` on 2026-10-16). It replaces the Ionic app (3.x) under the same id
and key; the plan and its phases are in `docs/standard-plan.md`, the open
steps in `TASKS.md`.

- **Backend: Firestore + its rules** (`firestore.rules`), shared with the
  installed 3.x apps until everyone is on 4.x. Never change the shape of a
  synced document without keeping 3.x working, and deploy rules before the
  release that needs them (with Alex's OK).
- The recipe book (`C:\claude projects\recipe-book`) uses this Firebase
  project for sign-in only, and sends `/import#{json}` links here. Changes to
  it happen in its own session.
- `lib/lists/` is this app: `logic.dart` (ported line for line from 3.x, with
  its tests in `test/logic_test.dart`), `repo.dart` (every Firestore read and
  write, in the rules' shapes), `links.dart`. `lib/ui/` the screens.
- Where `lib/core` differs from the starter, on purpose: `notifications.dart`
  (tokens in `users/{uid}/tokens/{token}`, the 3.x shape the notifier reads),
  `auth.dart` (also writes the 3.x profile fields), `export.dart` (lists and
  items), `diagnostics.dart` (the nightly backup's time), `share_in.dart`
  (text only), `tour.dart` (this app's steps), `home_widgets.dart`.
- The Pi side is `notifier/` (pushes, Home Assistant sync, reports, backup).
- Keep green: `flutter analyze`, `flutter test`, the rules tests, the
  notifier selftests. CI runs all of them.
- Colours only in `lib/ui/theme.dart` (a test enforces it): the recipe book's
  palette since 4.0.0 (brown primary for tasks and chrome, cream background,
  terracotta for shopping). The icon is drawn by `tool/make_icon.py`.
