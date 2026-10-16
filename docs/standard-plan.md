# Bringing todo-shopping up to the app standard

Written 2026-10-16 against version 3.1.0. The standard is the `make-an-app` skill
(Defaults + `references/checklist.md`); the starter is `C:\claude projects\app-shell`.

**Status 2026-10-17.** Approved 0–5 (16.10). Phase 0 done and live on the Pi. Phases 1–5
were built together, at Alex's ask, into one prerelease, 4.0.0, on the `flutter` branch
(`C:\claude projects\todo-flutter`); he tests it, then "promote". Where it differs from
the text below:
- Push switches live in `users/{uid}.notify` (the starter's shape; the owner already
  writes that doc), not a new `prefs` collection.
- Two home widgets (main shopping list, quick add to it), not three.
- Photos and voice dictation are dropped: no Storage on Spark (3.x had no photo
  buttons either), and the keyboard's microphone dictates.
- Instead of a `hasOnly` key test, `integration_test/lists_test.dart` runs the app's own
  writes (every repo function, both accounts of an invite) against the real rules on
  the emulator. `backup.py --verify` compares the newest backup with the live database;
  a full restore was tested once on the emulator.
- The web keeps a CSP, which has to allow inline scripts for Flutter's Firebase loader.

## Path: migrate to Flutter

The app is Ionic 9 / Angular 22 / Capacitor 8, so it moves to Flutter on the starter
repo. Firebase project `alex-todo-shopping`, Firestore data, rules, the Pi notifier,
HA sync and the recipe-book contract all stay, so nobody loses lists, households or
accounts. The Flutter app ships as **4.0.0** under the **same application id
(`com.alex99ka.todoshop`) and the same key (`~/.keystores/todo-shopping-release.p12`,
alias `todoshop`)**, so it installs over 3.x in place. versionCode 4000000 > 3001000.

Why this works without a reinstall: 3.x already treats a new MAJOR (or a release with no
`www.zip`) as "needs APK" and installs it from inside the app. 3.x reads only
`releases/latest`, which skips prereleases, so a 4.0.0 prerelease reaches only Alex
until it is promoted.

## Copied from the recipe book

The recipe book went through this same migration on 2026-10-15/16 (`C:\claude projects\recipe-book`,
plan in its `docs/standard-plan.md`; backup in `cld/deploy/backup`). It shares this
Firebase project and this signing key, so a lot is already in place or already decided:

- **Same path, proven**: Ionic 4.x → Flutter 5.x under the same id and key installed in
  place; one extra Google sign-in; Angular's `safety-worker.js` at `ngsw-worker.js`
  retired the old PWA. Same here with 3.x → 4.0.0.
- **Backup**: `backup.py` + `drive_token.py` (encrypted, 30 kept, `--verify` restore,
  Telegram on failure). The Drive API and a Desktop OAuth client already exist in
  `alex-todo-shopping`, consent screen in production. This app reuses the client, the
  refresh token, the passphrase and the Telegram lines from `~/docker/recipe-backup/.env`.
- **Telegram**: the shared bot (AlexPiMonitor_bot) is already wired; no new bot.
- **Windows sign-in**: the same Desktop OAuth client, as GitHub settings
  `GOOGLE_DESKTOP_CLIENT_ID` (variable) / `GOOGLE_DESKTOP_CLIENT_SECRET` (secret).
- **Decisions taken there, followed here**: light + dark (the recipe book dropped
  light-only too); "allowlist" = membership by household + invite, any Google account
  may sign in but sees nothing it isn't invited to (↔, recorded); fingerprint only to
  sign back in; no "new version" push when updates are silent.
- **Different here**: the recipe book moved to a new repo because the old one held only
  the Ionic app. This repo also holds the rules, their tests and the Pi notifier, already
  has the release secrets, and is where 3.x looks for updates. So the Flutter app is
  built on a `flutter` branch of this repo and replaces `src/` on `master` at promotion:
  3.x apps then find 4.0.0 by themselves and install it from inside the app (no bridge
  release, nothing to install by hand). Min version and early users come from Firestore
  `config/app` (no server API here), which needs a rules change deployed first.

## Gap table

✅ meets · ⚠️ partial · ❌ missing · ↔ different on purpose

### Defaults

| Topic | State | Note |
|---|---|---|
| Client | ❌ | Ionic/Angular/Capacitor, not Flutter |
| Backend | ✅ | Firebase Spark; rules are the backend |
| Server work | ⚠️ | Pi notifier (Python, Docker) for pushes + HA sync; no HTTP API (`/health`, `/report`) |
| Cost | ✅ | Free tiers only; Cost table in README |
| Language | ✅ | Hebrew RTL |
| Theme | ↔ | Light only, your choice on 2026-10-05. Standard is light + dark (decision D2) |
| Sign-in | ⚠️ | Google ✅; no allowlist (any Google account can sign in, decision D1); no fingerprint |
| Updates | ⚠️ | Web layer silent via `www.zip`; APK needs a tap + Android's installer, not silent; no Wi-Fi-only |
| Release | ⚠️ | Tag → APK + web + Hosting ✅; no Windows installer, not a prerelease |
| Platforms | ⚠️ | Android + web ✅; no Windows, no home widgets |

### Checklist

| # | Item | State | Note |
|---|---|---|---|
| 1 | SemVer, tag = version, bump in shipping commit | ✅ | `package.json`; becomes `pubspec.yaml` |
| 1 | CHANGELOG Keep a Changelog + Unreleased | ⚠️ | Entries are English; standard wants Hebrew for a Hebrew app |
| 1 | Version in Settings / on sign-in screen | ⚠️ | Settings ✅, sign-in ❌ |
| 1 | Release notes compiled into the build | ❌ | Settings links to CHANGELOG on GitHub |
| 1 | versionCode formula | ✅ | |
| 2 | CI: analyze, test, rules, server tests | ⚠️ | Lint/build/unit/rules/services ✅; notifier has no tests |
| 2 | Release: tag check, separate signing job | ✅ | |
| 2 | APK + Windows installer + web | ⚠️ | No Windows |
| 2 | Secret scan of artifacts | ❌ | |
| 2 | Published as prerelease | ❌ | |
| 2 | Hosting deploy, minimal token permissions, secrets in README | ✅ | |
| 3 | Patient zero (`config/app.earlyUsers`, promote) | ❌ | |
| 4 | Check on launch / every 6 h / Settings / before sign-in | ✅ | |
| 4 | SHA-256 verify | ⚠️ | `www.zip` ✅; APK relies on Android's signature check only |
| 4 | Android silent `PackageInstaller`, Wi-Fi only, progress notification | ❌ | Toast + `FileOpener` |
| 4 | Windows silent installer | ❌ | |
| 4 | Web "גרסה חדשה — רענון" | ✅ | Angular service worker toast |
| 5 | `config/app` minVersion / kill switch | ❌ | |
| 6 | Google sign-in | ✅ | |
| 6 | Allowlist + "אין גישה" screen | ❌ | D1 |
| 6 | Stays signed in, sign-out confirms | ✅ | |
| 6 | Switch account, last sign-in in Settings | ❌ | |
| 7 | Fingerprint opt-in | ❌ | |
| 8 | FCM from the Pi, least-privilege SA | ✅ | |
| 8 | New version / shared item / reminders / morning summary | ✅ | |
| 8 | Alert to Alex when a job fails | ❌ | |
| 8 | Local scheduled reminders | ↔ | Reminders are Pi pushes; works for every member, keep |
| 8 | Web push + Settings toggle | ✅ | |
| 8 | Per-type toggles | ❌ | One on/off toggle |
| 9 | Error catalog with letter codes, timeouts | ❌ | Generic toasts |
| 10 | Problem report → Telegram | ❌ | |
| 11 | Diagnostics screen | ❌ | |
| 12 | Interactive walkthrough + what's-new | ❌ | |
| 13 | Standard Settings set | ⚠️ | Has version, updates, push; lacks the rest. Sign-out lives in the menu |
| 14 | RTL, bundled Rubik | ✅ | |
| 14 | Tokens file, no colour literals | ⚠️ | Ionic `variables.scss`, no off-palette test |
| 14 | Skeleton loaders | ❌ | |
| 14 | Empty states, undo toasts | ✅ | |
| 14 | Long-press menu on items | ⚠️ | Long-press is drag-to-merge; edit/delete via swipe + item sheet |
| 14 | Hamburger menu | ✅ | |
| 14 | Home widgets, share target | ❌ | |
| 14 | Splash, adaptive icon | ✅ | `resources/` |
| 15 | Daily Drive backup, restore tested | ❌ | **Biggest risk today**: no backup of the household's lists |
| 15 | Data export CSV/JSON | ❌ | |
| 15 | Offline persistence | ✅ | |
| 15 | Add a collection, never a field; raise minVersion | ⚠️ | Followed by hand; no minVersion to raise |
| 16 | Rules + emulator tests for every path | ✅ | Strong: 5 rules suites + service contract tests |
| 16 | Service accounts, keys outside the repo | ✅ | |
| 16 | Signing key backed up off the PC | ❓ | Only `~/.keystores` is recorded. Losing it = everyone reinstalls (T1) |
| 16 | Public config explained in README | ✅ | |
| 16 | Google 2FA asked once | ✅ | D4: yes |
| 17 | README with Cost, Security, Versioning, Releasing | ✅ | |
| 17 | CLAUDE.md, TASKS.md, COMMANDS.md | ❌ | TASKS.md added with this plan |

## Phases

Each phase is one release. Order follows the standard: safety, then the Flutter app at
parity (which already carries the starter's update/release/errors/settings core), then
the rest.

### Phase 0 — Safety (no app release)

- **What**: off-PC backup of the signing key (T1; it signs the recipe book too).
  `notifier/backup.py`, a port of `cld/deploy/backup/backup.py`: every night at 03:45,
  run in the notifier image (`docker compose run --rm notifier python backup.py`), it
  writes an encrypted dated JSON of `lists` (+ members, items, history), `households`,
  `users`, `invites`, `tokens`, `notifier` to the Drive folder **רשימות גיבוי**, keeps 30,
  and alerts Telegram on failure. `--verify` restores the newest into the emulator and
  compares counts. Notifier gets `pytest` for `plan`, `recipients`, `same_epoch` and the
  backup, run in CI.
- **You notice**: nothing in the app. A Drive folder fills daily.
- **Risks**: none to data (read-only). The notifier SA already has `datastore.user`; no
  new role. The OAuth consent screen is already in production, so the token doesn't expire.
- **Verify**: one backup on Drive, restored into the emulator, list/item counts match.

### Phase 1 — 4.0.0: Flutter app at parity, same data

- **What**: the starter on a `flutter` branch of this repo (`notifier/`,
  `firestore.rules`, `test/rules` stay at their paths; `master` keeps the Angular app
  for 3.1.x fixes until 4.0.0 is promoted). Screens ported one by one:
  sign-in → home (lists, households, main-list tag) → list details (shopping by aisle
  with "in the basket"; tasks by overdue/today/later/none/done; quick-add with amount
  parsing and aisle guess; per-section ⋯; swipe actions with a tap alternative; undo;
  join-duplicates card; long-press drag-to-merge; copy to other lists; voice input)
  → item editor (due, priority, reminder) → households + invites → join → recipe
  `/import#json` → Settings → menu link to the recipe book.
  Logic in `item-logic.ts` / `aisle-guess.ts` ported with their unit tests moved to
  Dart. A Dart test checks every written document's keys against the rules' `hasOnly`
  lists. Deep links: Android App Link on `/import` (same intent filter),
  `/join/<id>`, push taps → list / Settings; web routes keep the same paths.
  The starter core comes with it: tag → APK + Windows installer + web, prerelease +
  promote, silent Android/Windows updates, `config/app` minVersion, error codes,
  diagnostics, Settings set, theme tokens, skeletons, bundled Rubik.
- **Web cut-over**: the old Angular service worker is replaced by Angular's
  `safety-worker.js` at `ngsw-worker.js`, so installed PWAs (iPad, iPhone) drop the
  cached app and load Flutter. `.well-known/assetlinks.json`, the CSP (updated for
  Flutter's CanvasKit) and the no-cache headers move to the new `firebase.json`.
- **You notice**: the same app, rebuilt; Windows installer appears. **Everyone signs in
  with Google once more** (Capacitor's and Flutter's Auth storage differ). Same
  account, same lists.
- **Risks**:
  - Edits made offline in 3.x and not yet synced are lost on the switch. Release notes:
    "open the app online before updating". `minVersion` starts at 4.0.0 only after
    every device is on 4.x, so 3.x keeps working meanwhile.
  - A written field the rules don't allow → silent write rejections. Covered by the
    `hasOnly` key test and the existing rules suites run against Flutter-shaped docs.
  - FCM tokens: Flutter writes the same `tokens/{token}` shape, so the notifier is
    unchanged. Old 3.x tokens die and are cleaned up by the notifier as today.
  - HA sync works on Firestore, untouched. Do not merge the HA-synced list.
  - Recipe book: contract `/import#<json>` unchanged; no change in the recipe repo.
- **Verify**: prerelease installed over 3.1.0 on your phone (data still there), second
  patch prerelease arrives silently; web on the `next` channel on the iPad; Windows
  installer installs and launches; every rules suite green; one week of patient zero,
  then promote. After promotion, `master` becomes the Flutter branch and `src/` is deleted.

### Phase 2 — 4.1.0: sign-in standard

- **What**: fingerprint to sign back in (offer after sign-in, toggle in Settings,
  Windows Hello on desktop), switch account, last sign-in, version on the sign-in
  screen, a revoked session goes to sign-in. No email allowlist (D1).
- **Verify**: fingerprint on your phone; widget tests for the gates.

### Phase 3 — 4.2.0: report, diagnostics, notifications

- **What**: "דיווח על בעיה" → Firestore `reports` (create-only rule) → notifier
  forwards to the shared Telegram bot (token + chat id copied from another app's Pi
  `.env`, never a new bot). Notifier alerts Telegram when a job fails. Per-type push
  toggles (new items, reminders, morning summary, versions) stored in
  `users/{uid}/prefs` (a new collection, not a new field) and honoured by the notifier.
- **Verify**: a report reaches Telegram with version + error codes; turning one type
  off stops only that push.

### Phase 4 — 4.3.0: walkthrough, widgets, share target

- **What**: interactive tour over the real screens (add a list, add an item, tick it,
  invite, set main list), with `since` tags. Home widgets: main shopping list,
  today's tasks, quick add. Android share target: shared text becomes items on the
  chosen list.
- **Verify**: tour test (every target exists); widgets pinned from Settings on your phone.

### Phase 5 — 4.4.0: data and docs

- **What**: export CSV + JSON from Settings; security note; CLAUDE.md and COMMANDS.md;
  CHANGELOG entries in Hebrew from here on.

## Decisions

- D1 allowlist and D2 theme: follow the recipe book (membership by invite, ↔; light +
  dark). Say so if you want otherwise.
- **D3 Approve phases**: 0–5 approved 2026-10-16.
- **D4 Google 2FA**: yes (2026-10-16), on for the household Google accounts and GitHub.

Your exact steps are in [TASKS.md](../TASKS.md).
