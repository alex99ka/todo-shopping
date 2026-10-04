[![CI](https://github.com/alex99ka/todo-shopping/actions/workflows/ci.yml/badge.svg)](https://github.com/alex99ka/todo-shopping/actions/workflows/ci.yml)
[![Release](https://github.com/alex99ka/todo-shopping/actions/workflows/release.yml/badge.svg)](https://github.com/alex99ka/todo-shopping/actions/workflows/release.yml)
[![GitHub release](https://img.shields.io/github/release/alex99ka/todo-shopping.svg)](https://github.com/alex99ka/todo-shopping/releases/latest)

# Todo and Shopping

Shared todo and shopping lists for a household, built with Ionic 9, Angular 22 and
Capacitor 8 on Firebase. It runs on the web as an installable app (also on iPhone) and
as an Android app.

**Live at [alex-todo-shopping.web.app](https://alex-todo-shopping.web.app).
Android APK on the [releases page](https://github.com/alex99ka/todo-shopping/releases/latest).**

Forked from [hamzahamidi/todo-list](https://github.com/hamzahamidi/todo-list) by Hamza
Hamidi, MIT licensed. See [CHANGELOG.md](CHANGELOG.md) for what changed.

## Features

- Google sign-in.
- Todo lists and shopping lists. Shopping items are grouped by grocery category and
  checked off with one tap.
- Households: every list in a household is shared with all its members.
- Invite links for a list or a household, valid for 7 days.
- Task reminders, and push notifications for new items on shared lists, due reminders and new versions.
- Import from the recipe book: its "add to shopping list" link adds the ingredients.
- Settings page with the version and an update check. Updates download in the
  background and are offered with a prompt.

Photo attachments are hidden: Cloud Storage needs the paid Blaze plan.

## Architecture

```
Clients       Browser / iPhone home screen          Android app (Capacitor)
                         |                                   |
                         v                                   v
Firebase      Auth (Google) . Firestore (firestore.rules) . Hosting . Cloud Messaging
(Spark)                          ^                                         |
                                 | Admin SDK                               v pushes
Raspberry Pi  notifier/ (Docker): polls Firestore and GitHub, sends through FCM
                                                    ^
                                                    | releases/latest
GitHub        Actions: ci.yml, release.yml --> Releases (APK, www.zip, SHA256SUMS)
                          |                          |
                          +--> deploys Hosting       +--> Android in-app updates

Recipe book   "add to shopping list" --> https://alex-todo-shopping.web.app/import#<json>
```

- No server of our own: the clients talk to Firestore directly, and the security rules
  are the backend.
- The Spark plan has no Cloud Functions, so the [notifier](notifier/README.md) runs on
  a Raspberry Pi. It polls Firestore with the Admin SDK and sends pushes through
  Firebase Cloud Messaging: new items in a list, due reminders and new releases.
- Updates: the web app updates through the Angular service worker. The Android app
  downloads `www.zip` from the latest GitHub release, checks it against GitHub's
  SHA-256 digest and applies it on the next start (`@capgo/capacitor-updater` without
  Capgo's cloud). When the MAJOR version differs it offers the new APK instead.
- The recipe book integration is described in
  [docs/recipe-book-integration.md](docs/recipe-book-integration.md).

## Cost

Everything runs on free tiers. The limits that matter:

| Service | Free limit | What uses it |
|---|---|---|
| Firestore | 50,000 reads, 20,000 writes, 20,000 deletes a day; 1 GiB stored | The apps, and the notifier's polling. A query costs at least one read even when nothing changed, so `POLL_SECONDS` (30 s, 2,880 polls a day) sets the floor. |
| Hosting | 10 GB stored, 360 MB transfer a day | Each deploy is kept as a release; cap the retained releases in the Hosting console if storage grows. |
| Auth, Cloud Messaging | Free | Google sign-in, pushes. |
| GitHub Actions and Releases | Free for a public repository | CI, release builds, APK and `www.zip` downloads. |
| GitHub API | 60 unauthenticated requests an hour per IP | The Android app's update check, at start and at most every 6 hours. |
| Raspberry Pi | Electricity | The notifier. |

Over a Spark limit, Firebase stops serving that product until the quota resets; the
Spark plan never bills.

## Security

- **Firestore rules** (`firestore.rules`) are the access boundary. A list and its
  items are visible to the list's members and to the members of its household; they
  edit the items, and only the owner renames or deletes the list. A user joins only
  through an unexpired invite for that exact list or household, adds only
  themselves, and records that invite under their own uid — so knowing a list or
  household id is never enough. Lists are bound to their household's `createdAt`,
  so a household deleted and recreated under the same id does not inherit them. `notifier/state` and anything else not matched is denied. `npm run
  test:rules` checks every allow and deny path in the emulator, and `npm run
  test:services` replays the services' real queries and writes under those rules.
- **Invites**: the random invite id is the secret. It can be read by id but invites
  cannot be listed, and the rules reject a join more than 7 days after the invite was
  created.
- **Service accounts** each get one job and the least privilege for it: the notifier's
  account on the Pi (see [notifier/README.md](notifier/README.md)) and the Hosting
  deploy account in GitHub (Firebase Hosting Admin only). Their JSON keys never enter
  the repository: they are kept in `~/.keystores` on the maintainer's PC (and the
  notifier's copy on the Pi), and `notifier/.gitignore` blocks `service-account.json`
  as a backstop.
- **Release signing**: the Android keystore is a GitHub secret for CI, with the offline
  copy and its password in `~/.keystores` (back these up: a lost key means users must
  uninstall to update). It is
  decoded in a separate job that runs no npm or Gradle code, and deleted after use.
  Every workflow job gets only the `GITHUB_TOKEN` permissions it needs.
- **Updates**: Android applies a `www.zip` only if it matches the SHA-256 digest
  GitHub reports for the release asset, and native code only changes through an APK
  signed with the release key.
- **No secrets in the repository.** The Firebase web config in `src/environments/` and
  `google-services.json` identify the project and are public by design.
- **Profiles are private**: `users/{uid}` is readable only by that user; the notifier
  reads names through the Admin SDK. An item's `date` cannot change after creation, so
  a member cannot make the notifier re-announce someone else's item. An invite only
  works while its creator can still use the target, and leaving a household un-files
  your own lists from it.

Known limits, accepted for a family app:

- The owner cannot remove a member from a list or household; members leave
  themselves, or the owner deletes and recreates it.
- An invite is not bound to its target's incarnation: if a list or household is
  deleted and someone recreates the same id within 7 days, a pending invite joins the
  new one.
- The Android web bundle is checked against GitHub's SHA-256 digest, not a key of our
  own, so anyone able to publish releases on the GitHub repo can ship an update. Keep
  the GitHub account behind 2FA.
- The rules cannot rate-limit: any Google account can sign in and use quota.

## Local development

Requires Node.js 24. The tests also need Java 21 for the Firebase emulators.

```
npm install
npm start
```

Open `http://localhost:4200/`. `npm run build` writes the production build to `www/`,
and `npm run lint` checks the sources.

## Tests

```
npm run test:rules
npm run test:services
```

Both run against the Firestore emulator. CI ([`ci.yml`](.github/workflows/ci.yml))
runs lint, build and both test suites on every push to `master` and every pull request.

## Versioning

[Semantic Versioning](https://semver.org). `package.json` holds the version, the app
shows it in Settings, and the release tag must equal it.

- **MAJOR**: native change, such as a Capacitor plugin added or upgraded, or an
  Android setting or permission. Android users must install the new APK; the app
  prompts them to download it.
- **MINOR**: new features in the web layer.
- **PATCH**: fixes in the web layer.

MINOR and PATCH releases reach installed Android apps as `www.zip`, so they must not
need native code that the installed APK lacks. The Android `versionCode` is
`MAJOR * 1000000 + MINOR * 1000 + PATCH`.

## Releasing

Move the `Unreleased` notes in [CHANGELOG.md](CHANGELOG.md) under the new version,
commit, then:

```
npm version minor        # or patch, or major
git push --atomic --follow-tags origin master
```

`.npmrc` makes `npm version` create bare tags such as `1.1.0`. The tag runs
[`release.yml`](.github/workflows/release.yml):

1. Checks that the tag equals the `package.json` version.
2. Builds and signs the APK, and builds the web bundle into `www.zip`.
3. Publishes a GitHub release with `todo-shopping-<version>.apk`, `www.zip` and
   `SHA256SUMS`. Installed apps pick it up from here.
4. Deploys the same bundle to Firebase Hosting, unless a newer release exists.

Firestore rules and indexes are not part of the release. If a release needs new rules,
deploy them first (see below).

The workflow needs these repository settings:

| Name | Kind | Value |
|---|---|---|
| `ANDROID_KEYSTORE_BASE64` | secret | The release keystore (PKCS12), base64 encoded |
| `ANDROID_KEYSTORE_PASSWORD` | secret | Its password |
| `ANDROID_KEY_ALIAS` | variable | The key alias |
| `FIREBASE_SERVICE_ACCOUNT` | secret | JSON key of the Hosting deploy service account |

Every release must be signed with the same key, or installed copies cannot update.
To rebuild a release without moving its tag, run
`gh workflow run release.yml --ref 1.1.0 -f publish=true`. A run from a branch builds
the files as workflow artifacts and publishes nothing.

## Installing on Android

1. On the phone, open the
   [latest release](https://github.com/alex99ka/todo-shopping/releases/latest) and
   download `todo-shopping-<version>.apk`.
2. Open it. Android asks to allow your browser to install unknown apps; allow it
   (Settings > Apps > Special app access > Install unknown apps).
3. Install, sign in, and allow notifications when asked.

Later versions arrive inside the app. A MAJOR version asks you to download the new APK,
which installs over the old one.

On an iPhone, open the live site in Safari and use Share > Add to Home Screen.

## First-time Firebase setup

1. In the Firebase console for `alex-todo-shopping`, enable the **Google** provider
   under Authentication > Sign-in method.
2. Deploy the rules and indexes:
   ```
   npx firebase deploy --only firestore
   ```
3. Register the Android app `com.alex99ka.todoshop`, add the release key's SHA-1 and
   SHA-256 fingerprints (and your debug key's SHA-1 for local native builds), and save
   its `google-services.json` at the repository root.
4. Create the Hosting deploy service account with the Firebase Hosting Admin role and
   store its JSON key as the `FIREBASE_SERVICE_ACCOUNT` secret.
5. Set up the notifier: [notifier/README.md](notifier/README.md).

## Native build

`android/` is generated and not checked in. `scripts/native/configure-android.sh`
applies the native settings to a fresh project: the version numbers, the Google
sign-in flag, `google-services.json` (checked against `.firebaserc` and the app id in
`capacitor.config.ts`), and the icons and splash screens from `resources/`.

Android needs JDK 21, the Android SDK and jq:

```
npm ci
npx cap add android
VERSION=1.0.0 VERSION_CODE=1000000 scripts/native/configure-android.sh
npm run build
npx cap sync android
npx cap open android
```

## License

[MIT](LICENSE.md). Original work copyright (c) 2018 Hamza Hamidi.
