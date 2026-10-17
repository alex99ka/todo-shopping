# TASKS

Plan: [docs/standard-plan.md](docs/standard-plan.md). Same process as the recipe book.
Scripts in `docs/setup/`. In a PowerShell window paste the line without the `!`; in the Claude chat box keep the `!`.

## עליך

1. Recipe server: its `.env` now has the right Telegram chat id (937317693) but it reads it only
   at start. Restart it when convenient (its problem reports then reach you):
   ```
   ssh -i $HOME\.ssh\pi5 alex99ka@pi5-home-server.local "cd ~/docker/trmnl-recipes/deploy/recipe-server && docker compose up -d"
   ```
2. 4.0.2 is everyone's (promoted 2026-10-17). Your wife's 3.x app offers it: Update → Scan app →
   Install → sign in with Google once. Friends on 4.0.0 update by themselves.

3. Shared friends (built, not live). Say "deploy" for the rules and the notifier, and "release"
   for 4.1.0. Then paste `docs/recipe-friends-handoff.md` into the recipe book's session: until it
   ships, adding housemates works, but recipe friends don't show up yet.

## אצל Claude

- [x] Phase 0: nightly encrypted Drive backup (03:45, restore checked), notifier selftests in CI
- [x] Phases 1–5 built on the `flutter` branch (`C:\claude projects\todo-flutter`), 4.0.0
- [x] 4.0.1 (the recipe book's look) shipped as the in-app update test
- [x] Shared friends, the to-do side: `friends/{uid}` + rule `isFriendAdd` (rules tests 118), the
  notifier writes `mates`, the "add people" sheet, friends on the Households screen; the recipe
  server's part is in `docs/recipe-friends-handoff.md`
- [x] Promoted 4.0.2: `flutter` merged into `master` (the Ionic app is gone from it), live site = Flutter

## Closed

- 2026-10-17: Telegram chat id fixed (937317693); problem reports reach Telegram. 4.0.2: one
  widget (flip lists, cross off, add one).

- 2026-10-17: 4.0.0 installed on Alex's phone and friends' phones; 4.0.1 prerelease out.

- 2026-10-16: audit against the standard, plan written; aligned with the recipe book's migration.
- 2026-10-16: phases 0–5 approved; 2FA on (Google, GitHub); keystore on Drive; GitHub secrets,
  `config/app` + `config/access`, `next` channel and its Auth domain set.
- 2026-10-17: Firestore's free reads ran out (HA sync re-read every item every 30 s); fixed with a
  listener, deployed.
- 2026-10-16: notifier deployed with backup.py (first backup 115 documents, `--verify` matches the
  live database), cron 03:45; then with per-type push switches, reports → Telegram, job alerts.
