# Commands

Run from the repo root unless noted. Flutter: `/c/src/flutter/bin/flutter` (not on PATH).

| Command | What it does |
|---|---|
| `flutter run -d windows` | Runs the app with hot reload (`r`, `R`, `q`). |
| `flutter analyze && flutter test` | Static checks and the unit tests. Must be clean. |
| `cd firestore-tests && npm ci && npm test` | Every allow/deny of the rules in the emulator. Needs Node 24 (it runs `.ts`); on this PC Node is 22, so: `firebase.cmd emulators:exec --only firestore --project demo-todo-shopping --config ../firebase.json "npx -y node@24 --test --test-concurrency=1 rules/*.test.ts"`. Then kill the java process left on :8080. |
| `notifier/.venv/Scripts/python notifier/notify.py --selftest` | The notifier's logic, no network (also `backup.py --selftest`). |
| `dart run flutter_launcher_icons` / `dart run flutter_native_splash:create` | Regenerate the icons / splash from `assets/`. |
| `firebase.cmd deploy --only firestore:rules --project alex-todo-shopping` | Deploys the rules. Before the release that needs them, with Alex's OK. |
| `git tag X.Y.Z && git push --atomic origin <branch> X.Y.Z` | Releases (a prerelease: only `config/access.earlyUsers` get it). |
| `gh workflow run promote.yml -f version=X.Y.Z` | Makes a release everyone's, web included. |
| `powershell -File docs/setup/install-release.ps1 X.Y.Z` | Installs a release on the phone (adb) and this PC. |

Pi (`ssh -i ~/.ssh/pi5 alex99ka@pi5-home-server.local`, in `~/todo-notifier`):

| Command | What it does |
|---|---|
| `docker compose up -d --build` | Runs the notifier after copying new files (see `notifier/README.md`). |
| `docker compose run --rm notifier python backup.py --verify` | Restore test of the newest backup. |
| `docker compose logs --tail 50` | What it did lately. |

## Don't

| | Why |
|---|---|
| Change `applicationId` (`com.alex99ka.todoshop`) or the signing key (`todoshop`) | Installed apps, 3.x included, can no longer update; users reinstall. |
| Add a field to a synced document without its rule | `hasOnly()` rejects every write, on 3.x too. |
| Query items, history or members without `listCreatedAt == list.createdAt` | The rules deny the whole query. |
| Edit `installer/app.iss` with a tool that drops the BOM | Inno Setup then garbles the Hebrew. |
| Pass an empty `--dart-define=GOOGLE_WEB_CLIENT_ID=` | It overrides the built-in public value with nothing. |
