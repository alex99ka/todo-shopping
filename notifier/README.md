# Push notifier

Firebase's free Spark plan has no Cloud Functions, so this small Python service sends the app's pushes instead. It runs in Docker on the Raspberry Pi and polls Firestore every `POLL_SECONDS`:

- **New items**: one push per list (and per person who added items) to everyone who can see the list, except the person who added them. The title is the list name and the body reads like `Alex added "Milk"` or `Alex added 12 items`.
- **Reminders**: items whose `remindAt` has passed get a `Reminder` push to every member, unless the item is already done. Then `reminded` is set to true.
- **New release**: about once an hour it checks GitHub's latest release. When the tag changes, it pushes `Update available` to every device. The first run only records the current tag.

Tapping a push opens the list (or Settings, for an update). Tokens that FCM reports as dead are deleted.

The service account `notifier@alex-todo-shopping.iam.gserviceaccount.com` has only `roles/datastore.user` and `roles/firebasecloudmessaging.admin`.

## Deploy on the Pi

This is its own compose project. It sits next to the recipe server's stack, not inside it, and exposes no ports.

```sh
# from this PC (repo root). The key is kept outside the repo, in ~/.keystores.
ssh -i ~/.ssh/pi5 alex99ka@pi5-home-server.local mkdir -p todo-notifier
scp -i ~/.ssh/pi5 notifier/notify.py notifier/requirements.txt notifier/Dockerfile \
    notifier/docker-compose.yml notifier/.dockerignore alex99ka@pi5-home-server.local:todo-notifier/
scp -i ~/.ssh/pi5 ~/.keystores/notifier-service-account.json \
    alex99ka@pi5-home-server.local:todo-notifier/service-account.json

# on the Pi
cd ~/todo-notifier
chmod 600 service-account.json
docker compose up -d --build
docker compose logs -f        # expect "started: project alex-todo-shopping, poll 30s"
```

The container runs as uid 1000, the Pi's first user (`alex99ka`). If `id -u` on the Pi prints something else, change the `useradd --uid` line in the Dockerfile, or the key will not be readable.

To ship a new `notify.py`, copy it over and run `docker compose up -d --build` again. Settings live in `docker-compose.yml`: `APP_URL`, `GITHUB_REPO`, `POLL_SECONDS`, and `GOOGLE_APPLICATION_CREDENTIALS`.

On a restart, the service skips items added while it was down. It never replays history.
It re-checks the last 10 minutes on every poll, so an item saved offline (no signal in the
shop) still announces itself when it syncs, and nothing is announced twice.

## Run locally

```sh
python -m venv notifier/.venv
notifier/.venv/Scripts/pip install -r notifier/requirements.txt   # bin/ instead of Scripts/ on Linux
notifier/.venv/Scripts/python notifier/notify.py --selftest       # pure logic, no network
GOOGLE_APPLICATION_CREDENTIALS=~/.keystores/notifier-service-account.json notifier/.venv/Scripts/python notifier/notify.py --once
```

`--once` runs one live cycle against the real project. It sends real pushes if anything is due.

## What it costs

Nothing. FCM is free, and the Firestore usage stays well inside the Spark quota (50k reads and 20k writes per day):

| What | Reads/day |
|---|---|
| 2 queries per poll, each costing 1 read even when empty: 2 × 2,880 polls at 30 s | 5,760 |
| Release check, which reads `notifier/state` once an hour | 24 |
| Per new-items push or reminder: the list, its household, the adder's profile, and 1 per member's token query (at least 1 each) | ~5–10 each |

That comes to about 12% of the read quota at idle. Writes happen only for reminders (one `reminded` flag each), dead-token deletes, and a new release. At `POLL_SECONDS=10`, idle cost triples to about 17k reads/day, which is still under the quota. Don't go lower than that.

GitHub's unauthenticated API allows 60 calls an hour. This service makes 1. While the repo has no releases, or if it is private, GitHub answers 404 and release pushes are simply skipped.

## Rotate the key

1. Google Cloud console → IAM & Admin → Service accounts → `notifier@…` → Keys → Add key → JSON. You can also run `gcloud iam service-accounts keys create service-account.json --iam-account=notifier@alex-todo-shopping.iam.gserviceaccount.com`.
2. Save it as `~/.keystores/notifier-service-account.json` on this PC, copy it over
   `~/todo-notifier/service-account.json` on the Pi and `chmod 600` it.
3. Run `docker compose up -d --force-recreate`. A plain `restart` is not enough: a single-file bind mount keeps pointing at the old file once it has been replaced.
4. Check `docker compose logs` for the `started` line, then delete the old key in the console.

The key never goes into git or the image. It is listed in `.gitignore` and `.dockerignore`, and the container mounts it read-only.
