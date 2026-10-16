[![CI](https://github.com/alex99ka/todo-shopping/actions/workflows/ci.yml/badge.svg)](https://github.com/alex99ka/todo-shopping/actions/workflows/ci.yml)

# משימות וקניות

Shared shopping and task lists for the household: a shopping list that sorts
itself by supermarket aisle, task lists with deadlines, repeats and reminders,
households that share every list filed under them, and the recipe book's
"add to shopping list". One Flutter codebase for **Android, Web (the iPad)
and Windows**, on the `make-an-app` core (`alex99ka/app-shell`).

From 4.0.0 this replaces the Ionic app (3.x) under the **same Android id
`com.alex99ka.todoshop` and signing key**, so it installs over it in place.
The data never moved: same Firestore, same rules. Everyone signs in with
Google once more.

## How it fits together

```
Android / Windows / Web ── Firebase Auth (Google) · Firestore (rules = backend) · FCM
        │  updates                                       ▲
        ▼                                                │ Admin SDK
GitHub Releases ◄── release.yml (tag)          Pi: notifier/ (Docker)
  prerelease → early users                       pushes · reminders · morning summary
  promote.yml → everyone + live web              Home Assistant sync · reports → Telegram
                                                 nightly encrypted backup to Drive
```

- **Data** (`lib/lists/repo.dart`): `lists/{id}` with `items`, `history`
  (quick-add suggestions) and `members` (names on shared lists);
  `households/{id}`; `invites/{id}` (the random id is the secret, 7 days);
  `users/{uid}` (profile, main shopping list `recipeListId`, push switches
  `notify`) with `tokens/{token}`. Items are bound to their list's
  `createdAt`, and every query says so: the rules are not filters.
- **Who sees what**: a list's members, plus its household's members while it's
  filed there. There is no email allowlist: anyone can sign in and sees only
  what they were invited to (decided 2026-10-16, like the recipe book).
- **Links** (`lib/lists/links.dart`): `/details/<list>`, `/join/<invite>`,
  `/import#{json}` (the recipe book's contract, confirmed before anything is
  written), `/households`, `/settings`. Android opens them in the app (App
  Link, `web/.well-known/assetlinks.json`).
- **Kill switch**: raise `config/app.minVersion` and older builds show only
  "צריך לעדכן". **Patient zero**: `config/access.earlyUsers` get prereleases.
- **Updates**: Android and Windows read this repo's releases, check the
  SHA-256, download in the background and install. The web checks
  `version.json`. 3.x apps read only `releases/latest`, so a prerelease never
  reaches them; after promotion they offer 4.x as an APK install.
- **Errors** (`lib/core/errors.dart`): what failed, why, what to do, a letter code.

## Setup (once, done)

1. **GitHub**: secrets `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`
   (`~/.keystores/todo-shopping-release.p12`, alias `todoshop`, shared with
   the recipe book, copy on Drive), `FIREBASE_SERVICE_ACCOUNT` (Hosting Admin),
   `GOOGLE_DESKTOP_CLIENT_SECRET`; variables `ANDROID_KEY_ALIAS`,
   `FIREBASE_PROJECT=alex-todo-shopping`, `GOOGLE_DESKTOP_CLIENT_ID` (the
   Desktop OAuth client the Drive backup uses: `docs/setup/github-secrets.ps1`).
2. **Firestore**: `config/app` and `config/access` (`docs/setup/firestore-config.ps1`).
3. **Web `next` channel** and its Auth domain (`docs/setup/next-channel.ps1`).
4. **Pi**: `notifier/README.md` (service, backup, Telegram).

## Cost

| Service | Free limit | What uses it |
|---|---|---|
| Firestore | 50k reads, 20k writes a day | The apps; the notifier's polls (~13k reads a day idle); the nightly backup reads every document once. |
| Hosting | 10 GB stored, 360 MB a day | The web app and the `next` channel. |
| Auth, FCM | Free | |
| GitHub Actions, Releases | Free for a public repo | CI, builds, update downloads. |
| GitHub API | 60 calls an hour per IP | The update check: at start and at most every 6 hours. |
| Drive | The account's own space | One encrypted JSON a night, 30 kept. |
| Pi | Electricity | The notifier. |

## Security

- **Firestore rules** are the boundary; `firestore-tests/` checks every allow
  and deny in the emulator (114 tests).
- **Secrets are never in the repo**: the keystore in `~/.keystores`, the
  notifier's key and `.env` on the Pi (mode 600). The Firebase config is
  public by design.
- **Signing**: the keystore is decoded only on a runner that runs no project
  code, then deleted.
- **Updates** install only if the SHA-256 matches the release and, on
  Android, the signature matches the installed app.
- **Web headers**: a CSP (it allows inline scripts, which Flutter's Firebase
  loader needs), no framing, no sniffing.

Known limits: anyone who can publish releases here can ship an update (2FA is
on); the Windows installer is unsigned, so SmartScreen warns once; an item's
"added by" isn't proof (undo restores others' items as yours).

## Versioning and releasing

SemVer in `pubspec.yaml`; the tag must equal it; versionCode is
`MAJOR*1000000 + MINOR*1000 + PATCH`. Move `[Unreleased]` in CHANGELOG.md
under the new version, in Hebrew, commit, deploy rules first if they changed,
then `git tag X.Y.Z && git push --atomic origin <branch> X.Y.Z`. When it's
good on your phone: `gh workflow run promote.yml -f version=X.Y.Z`.

## Develop

See COMMANDS.md. Flutter is at `C:\src\flutter\bin` (not on PATH).
