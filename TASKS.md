# TASKS

Plan: [docs/standard-plan.md](docs/standard-plan.md). Same process as the recipe book.
Scripts in `docs/setup/`. In a PowerShell window paste the line without the `!`; in the Claude chat box keep the `!`.

## עליך

1. Telegram for this app's alerts and problem reports. The copied lines were empty (the recipe
   *backup's* file has them empty too); the real ones are in the recipe server's `.env`. One line,
   prints nothing secret, then restarts the notifier:
   ```
   ssh -i $HOME\.ssh\pi5 alex99ka@pi5-home-server.local "cd ~/todo-notifier && sed -i '/^TELEGRAM_\(BOT_TOKEN\|CHAT_ID\)=$/d' .env && grep -E '^TELEGRAM_(BOT_TOKEN|CHAT_ID)=' ~/docker/trmnl-recipes/deploy/recipe-server/.env >> .env && chmod 600 .env && docker compose up -d"
   ```
   A test report ("בדיקה מ-Claude…") is waiting and arrives in Telegram within a minute.
   The recipe backup's own failure alerts have the same empty lines
   (`~/docker/recipe-backup/.env`): same fix there if you want them.
2. Install the 4.0.0 prerelease on the phone (wireless adb on) and this PC, sign in with Google once:
   ```
   ! powershell -NoProfile -ExecutionPolicy Bypass -File "C:\claude projects\to do\docs\setup\install-release.ps1" 4.0.0
   ```
   Try the iPad on https://alex-todo-shopping--next-zjurgkce.web.app
3. Tell me 4.0.1 arrived by itself (I ship it once you're on 4.0.0).
4. When it's good: "promote". Your wife's 3.x app then offers it: Update → Scan app → Install → sign in once.

## אצל Claude

- [x] Phase 0: nightly encrypted Drive backup (03:45, restore checked), notifier selftests in CI
- [x] Phases 1–5 built on the `flutter` branch (`C:\claude projects\todo-flutter`), 4.0.0
- [ ] After 4.0.0 is on the phone: ship 4.0.1 to prove the in-app update
- [ ] At "promote": merge `flutter` into `master`, run promote.yml

## Closed

- 2026-10-16: audit against the standard, plan written; aligned with the recipe book's migration.
- 2026-10-16: phases 0–5 approved; 2FA on (Google, GitHub); keystore on Drive; GitHub secrets,
  `config/app` + `config/access`, `next` channel and its Auth domain set.
- 2026-10-16: notifier deployed with backup.py (first backup 115 documents, `--verify` matches the
  live database), cron 03:45; then with per-type push switches, reports → Telegram, job alerts.
