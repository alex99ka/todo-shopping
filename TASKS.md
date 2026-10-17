# TASKS

Plan: [docs/standard-plan.md](docs/standard-plan.md). Same process as the recipe book.
Scripts in `docs/setup/`. In a PowerShell window paste the line without the `!`; in the Claude chat box keep the `!`.

## עליך

1. Telegram: the chat id copied from the recipe server is the bot's own name, so Telegram
   refuses ("the bot can't send messages to the bot"); the recipe server's reports never arrived
   either. In Telegram: press Start on @AlexPiMonitor_bot, then message @userinfobot and send me
   the number it answers (not a secret), or put it in yourself (replace 123456789):
   ```
   ssh -i $HOME\.ssh\pi5 alex99ka@pi5-home-server.local "sed -i 's/^TELEGRAM_CHAT_ID=.*/TELEGRAM_CHAT_ID=123456789/' ~/todo-notifier/.env ~/docker/trmnl-recipes/deploy/recipe-server/.env && cd ~/todo-notifier && docker compose up -d"
   ```
   (The recipe server picks it up at its next restart.)
2. Tell me when 4.0.1 (the new icon and colours) has installed itself on your phone. Settings ›
   עדכונים shows it; it downloads on Wi-Fi and installs a few minutes after you leave the app.
   Friends on 4.0.0 stay there until "promote" (only you get prereleases).
3. When it's good: "promote". Your wife's 3.x app then offers it: Update → Scan app → Install → sign in once.

## אצל Claude

- [x] Phase 0: nightly encrypted Drive backup (03:45, restore checked), notifier selftests in CI
- [x] Phases 1–5 built on the `flutter` branch (`C:\claude projects\todo-flutter`), 4.0.0
- [x] 4.0.1 (the recipe book's look) shipped as the in-app update test
- [ ] At "promote": merge `flutter` into `master`, run promote.yml

## Closed

- 2026-10-17: 4.0.0 installed on Alex's phone and friends' phones; 4.0.1 prerelease out.

- 2026-10-16: audit against the standard, plan written; aligned with the recipe book's migration.
- 2026-10-16: phases 0–5 approved; 2FA on (Google, GitHub); keystore on Drive; GitHub secrets,
  `config/app` + `config/access`, `next` channel and its Auth domain set.
- 2026-10-17: Firestore's free reads ran out (HA sync re-read every item every 30 s); fixed with a
  listener, deployed.
- 2026-10-16: notifier deployed with backup.py (first backup 115 documents, `--verify` matches the
  live database), cron 03:45; then with per-type push switches, reports → Telegram, job alerts.
