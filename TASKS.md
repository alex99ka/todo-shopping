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
2. On the phone, open and install over 3.1.0 (Play Protect: "Scan app", Install), sign in once:
   https://github.com/alex99ka/todo-shopping/releases/download/4.0.0/todo-shopping-4.0.0.apk
   PC: https://github.com/alex99ka/todo-shopping/releases/download/4.0.0/todo-shopping-setup-4.0.0.exe
   iPad: https://alex-todo-shopping--next-zjurgkce.web.app
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
- 2026-10-17: Firestore's free reads ran out (HA sync re-read every item every 30 s); fixed with a
  listener, deployed.
- 2026-10-16: notifier deployed with backup.py (first backup 115 documents, `--verify` matches the
  live database), cron 03:45; then with per-type push switches, reports → Telegram, job alerts.
