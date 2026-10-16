# TASKS

Plan: [docs/standard-plan.md](docs/standard-plan.md). Same process as the recipe book.
Scripts in `docs/setup/`. In a PowerShell window paste the line without the `!`; in the Claude chat box keep the `!`.

## עליך

### Now (any order, before I start)
1. Windows sign-in: GitHub secret + variables, copied from the Pi (prints no secret).
   `-AlsoRecipe` fixes item 2 in the recipe book's TASKS too (needs a recipe release to apply):
   ```
   ! powershell -NoProfile -ExecutionPolicy Bypass -File "C:\claude projects\to do\docs\setup\github-secrets.ps1" -AlsoRecipe
   ```
2. Firestore `config/app` + `config/access`:
   ```
   ! powershell -NoProfile -ExecutionPolicy Bypass -File "C:\claude projects\to do\docs\setup\firestore-config.ps1"
   ```
3. The `next` preview channel + its Auth domain:
   ```
   ! powershell -NoProfile -ExecutionPolicy Bypass -File "C:\claude projects\to do\docs\setup\next-channel.ps1"
   ```
4. 2-Step Verification on (no command): alex98ka@gmail.com, your wife's account, and the
   GitHub account alex99ka (it can publish updates). https://myaccount.google.com/signinoptions/twosv ·
   https://github.com/settings/security

### Later, one word each when I ask
5. "deploy rules" (Phase 1, before the tag).
6. "release 4.0.0".
7. Install on the phone (wireless adb on) and on this PC:
   ```
   ! powershell -NoProfile -ExecutionPolicy Bypass -File "C:\claude projects\to do\docs\setup\install-release.ps1" 4.0.0
   ```
   Open the app, sign in with Google once, check your lists. Try the `next` link on the iPad.
8. Tell me 4.0.1 arrived by itself.
9. After a few days: "promote". Your wife's 3.x app then offers it: Update → Scan app →
   Install → sign in once.
10. Phases 2–5: run step 7 with the new version (or wait for it to arrive), then "promote".

## אצל Claude

- [ ] Phase 0: `notifier/backup.py` (port of `cld/deploy/backup`), notifier pytest in CI,
  CLAUDE.md, COMMANDS.md; deploy to the Pi (approved), first backup + `--verify`, cron 03:45
- [ ] Phase 1: Flutter 4.0.0 at parity on the `flutter` branch, `config/*` + `reports` rules with tests
- [ ] Phases 2–5

## Closed

- 2026-10-16: audit against the standard, plan written; aligned with the recipe book's migration.
- 2026-10-16: phases 0–5 approved; 2FA yes; keystore on Drive; Drive/Telegram lines in
  the Pi's `todo-notifier/.env` (6, checked); notifier deploy approved.
