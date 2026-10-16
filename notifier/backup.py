"""Daily backup of the whole Firestore database to Google Drive.

One encrypted JSON a day in the Drive folder "רשימות גיבוי", the newest 30 kept:
every document of every collection and subcollection (lists with their items,
history and members; households; invites; users; the notifier's state). The
file opens with the same openssl command as the recipe book's backups:

  openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass env:BACKUP_PASSPHRASE -in X.enc -out X.json

Runs from the Pi's cron inside the notifier image (same key, same .env):

  python backup.py              back up now
  python backup.py --verify     download the newest backup, decrypt it, compare with the live database
  python backup.py --restore F  write every document of decrypted backup F back (overwrites; asks first)
  python backup.py --selftest   check encryption and the JSON round trip, no network

Needs DRIVE_CLIENT_ID, DRIVE_CLIENT_SECRET, DRIVE_REFRESH_TOKEN (drive.file
scope: it can touch only the files it made) and BACKUP_PASSPHRASE in the
environment; TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID for failure alerts.
"""

import base64
import calendar
import json
import os
import sys
from datetime import datetime, timezone

import requests

FOLDER = 'רשימות גיבוי'
PREFIX = 'todo-shopping-'
KEEP = 30
DRIVE = 'https://www.googleapis.com/drive/v3/files'
UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files'
ITER = 200_000


# --- encryption: the format of `openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt` ---

def _key_iv(passphrase, salt):
    from cryptography.hazmat.primitives import hashes
    from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
    k = PBKDF2HMAC(hashes.SHA256(), 48, salt, ITER).derive(passphrase.encode())
    return k[:32], k[32:]


def encrypt(data, passphrase):
    from cryptography.hazmat.primitives import padding
    from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
    salt = os.urandom(8)
    key, iv = _key_iv(passphrase, salt)
    p = padding.PKCS7(128).padder()
    e = Cipher(algorithms.AES(key), modes.CBC(iv)).encryptor()
    return b'Salted__' + salt + e.update(p.update(data) + p.finalize()) + e.finalize()


def decrypt(blob, passphrase):
    from cryptography.hazmat.primitives import padding
    from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
    if blob[:8] != b'Salted__':
        raise ValueError('not an openssl-salted file')
    key, iv = _key_iv(passphrase, blob[8:16])
    d = Cipher(algorithms.AES(key), modes.CBC(iv)).decryptor()
    u = padding.PKCS7(128).unpadder()
    return u.update(d.update(blob[16:]) + d.finalize()) + u.finalize()


# --- Firestore <-> JSON, lossless: lists and items are bound by createdAt down to the nanosecond ---

def to_json(v):
    from google.cloud.firestore_v1 import DocumentReference, GeoPoint
    if isinstance(v, datetime):
        nanos = getattr(v, 'nanosecond', 0) or v.microsecond * 1000
        return {'__ts__': [calendar.timegm(v.utctimetuple()), nanos]}
    if isinstance(v, DocumentReference):
        return {'__ref__': v.path}
    if isinstance(v, GeoPoint):
        return {'__geo__': [v.latitude, v.longitude]}
    if isinstance(v, bytes):
        return {'__bytes__': base64.b64encode(v).decode()}
    if isinstance(v, dict):
        return {k: to_json(x) for k, x in v.items()}
    if isinstance(v, list):
        return [to_json(x) for x in v]
    return v


def from_json(v, db=None):
    if isinstance(v, dict):
        if '__ts__' in v:
            from google.api_core.datetime_helpers import DatetimeWithNanoseconds
            s, n = v['__ts__']
            base = datetime.fromtimestamp(s, timezone.utc)
            return DatetimeWithNanoseconds(*base.timetuple()[:6], nanosecond=n, tzinfo=timezone.utc)
        if '__ref__' in v:
            return db.document(v['__ref__'])
        if '__geo__' in v:
            from google.cloud.firestore_v1 import GeoPoint
            return GeoPoint(*v['__geo__'])
        if '__bytes__' in v:
            return base64.b64decode(v['__bytes__'])
        return {k: from_json(x, db) for k, x in v.items()}
    if isinstance(v, list):
        return [from_json(x, db) for x in v]
    return v


def snapshot(db):
    """{document path: fields} for every document, subcollections included."""
    out = {}

    def walk(collection):
        for doc in collection.stream():
            out[doc.reference.path] = to_json(doc.to_dict())
            for sub in doc.reference.collections():
                walk(sub)

    for c in db.collections():
        walk(c)
    return out


def counts(docs):
    """Documents per collection path pattern, e.g. lists/*/items: 412."""
    out = {}
    for path in docs:
        parts = path.split('/')
        key = '/'.join(p if i % 2 == 0 else '*' for i, p in enumerate(parts[:-1]))
        out[key] = out.get(key, 0) + 1
    return out


# --- Drive ---

def drive():
    r = requests.post('https://oauth2.googleapis.com/token', timeout=30, data={
        'client_id': os.environ['DRIVE_CLIENT_ID'], 'client_secret': os.environ['DRIVE_CLIENT_SECRET'],
        'refresh_token': os.environ['DRIVE_REFRESH_TOKEN'], 'grant_type': 'refresh_token'})
    if r.status_code != 200:
        raise RuntimeError(f'Drive sign-in failed ({r.status_code}): {r.text[:200]}')
    s = requests.Session()
    s.headers['Authorization'] = f"Bearer {r.json()['access_token']}"
    return s


def folder(s):
    q = f"name = '{FOLDER}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false"
    r = s.get(DRIVE, params={'q': q, 'fields': 'files(id)'}, timeout=30)
    r.raise_for_status()
    if found := r.json()['files']:
        return found[0]['id']
    r = s.post(DRIVE, json={'name': FOLDER, 'mimeType': 'application/vnd.google-apps.folder'}, timeout=30)
    r.raise_for_status()
    return r.json()['id']


def listing(s, parent):
    """Newest first: the names carry the date."""
    r = s.get(DRIVE, timeout=30, params={
        'q': f"'{parent}' in parents and trashed = false and name contains '{PREFIX}'",
        'orderBy': 'name desc', 'fields': 'files(id,name,size)', 'pageSize': 200})
    r.raise_for_status()
    return [f for f in r.json()['files'] if f['name'].startswith(PREFIX)]


def upload(s, parent, name, data):
    r = s.post(UPLOAD, params={'uploadType': 'resumable'}, json={'name': name, 'parents': [parent]}, timeout=30)
    r.raise_for_status()
    r = s.put(r.headers['Location'], data=data, timeout=600, headers={'Content-Type': 'application/octet-stream'})
    r.raise_for_status()


# --- jobs ---

def firestore_db():
    import firebase_admin
    from firebase_admin import firestore
    if not firebase_admin._apps:
        firebase_admin.initialize_app()
    return firestore.client()


def summary(c):
    return ', '.join(f'{k} {v}' for k, v in sorted(c.items()))


def backup():
    db = firestore_db()
    docs = snapshot(db)
    if not any(k.startswith('lists/') for k in docs):
        raise RuntimeError(f'suspicious backup: no lists ({len(docs)} documents)')
    body = json.dumps({'at': datetime.now(timezone.utc).isoformat(), 'docs': docs}, ensure_ascii=False).encode()
    s = drive()
    parent = folder(s)
    name = f"{PREFIX}{datetime.now():%Y-%m-%d}.json.enc"
    upload(s, parent, name, encrypt(body, os.environ['BACKUP_PASSPHRASE']))
    for old in listing(s, parent)[KEEP:]:
        s.delete(f"{DRIVE}/{old['id']}", timeout=30)
    db.document('notifier/backup').set({'last': datetime.now(timezone.utc), 'file': name, 'docs': len(docs)})
    return f'{name}: {len(docs)} documents, {len(body) // 1024} KB'


def verify():
    """Restore test without writing: the newest backup decrypts and parses, and
    holds every collection the live database has, with counts close to it."""
    s = drive()
    newest = listing(s, folder(s))[0]
    r = s.get(f"{DRIVE}/{newest['id']}", params={'alt': 'media'}, timeout=600)
    r.raise_for_status()
    saved = json.loads(decrypt(r.content, os.environ['BACKUP_PASSPHRASE']))['docs']
    for v in saved.values():
        from_json(v)  # every value converts back
    live = counts(snapshot(firestore_db()))
    have = counts(saved)
    missing = [k for k in live if k not in have]
    if missing:
        raise RuntimeError(f'{newest["name"]} lacks {missing}')
    return f'{newest["name"]} restores: {summary(have)} (live now: {summary(live)})'


def restore(path):
    """Writes every document of a decrypted backup back, as it was then."""
    docs = json.loads(open(path, encoding='utf-8').read())['docs']
    print(f'{len(docs)} documents: {summary(counts(docs))}')
    if input('Overwrite them in the live database? Type yes: ').strip() != 'yes':
        return 'cancelled'
    db = firestore_db()
    batch, n = db.batch(), 0
    for p, fields in docs.items():
        batch.set(db.document(p), from_json(fields, db))
        n += 1
        if n % 400 == 0:
            batch.commit()
            batch = db.batch()
    batch.commit()
    return f'restored {n} documents'


def alert(text):
    token, chat = os.environ.get('TELEGRAM_BOT_TOKEN'), os.environ.get('TELEGRAM_CHAT_ID')
    if token and chat:
        requests.post(f'https://api.telegram.org/bot{token}/sendMessage', timeout=20,
                      json={'chat_id': chat, 'text': f'⚠️ משימות וקניות: הגיבוי נכשל\n{text[:3500]}'})


def selftest():
    blob = encrypt(b'{"a": 1}', 'pw')
    assert blob.startswith(b'Salted__') and decrypt(blob, 'pw') == b'{"a": 1}'
    try:
        decrypt(blob, 'wrong')
        raise AssertionError('wrong passphrase decrypted')
    except ValueError:
        pass
    from google.api_core.datetime_helpers import DatetimeWithNanoseconds
    t = DatetimeWithNanoseconds(2026, 10, 16, 12, 0, 1, nanosecond=123456789, tzinfo=timezone.utc)
    back = from_json(json.loads(json.dumps(to_json({'createdAt': t, 'm': {'x': [t]}}))))
    assert back['createdAt'] == t and back['createdAt'].nanosecond == 123456789, back
    assert back['m']['x'][0].nanosecond == 123456789
    assert counts({'lists/a': {}, 'lists/a/items/1': {}, 'lists/b/items/2': {}}) == {'lists': 1, 'lists/*/items': 2}
    print('selftest ok')


def main():
    sys.stdout.reconfigure(encoding='utf-8')
    if '--selftest' in sys.argv:
        return selftest()
    try:
        if '--restore' in sys.argv:
            text = restore(sys.argv[sys.argv.index('--restore') + 1])
        else:
            text = verify() if '--verify' in sys.argv else backup()
    except Exception as e:
        alert(f'{type(e).__name__}: {e}')
        print(f'FAILED: {e}', file=sys.stderr)
        sys.exit(1)
    print(text)


if __name__ == '__main__':
    main()
