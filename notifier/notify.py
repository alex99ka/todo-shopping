"""Push notifier for Todo and Shopping.

Firebase's free plan has no Cloud Functions, so this polls Firestore and sends
the pushes itself: new items in a list, due reminders, and new releases.

  python notify.py             run forever
  python notify.py --once      one live cycle
  python notify.py --selftest  check the pure logic, no network
"""

import json
import logging
import os
import sys
import time
import urllib.error
import urllib.request
import warnings

import firebase_admin
from firebase_admin import exceptions, firestore, messaging
from google.api_core.exceptions import FailedPrecondition
from google.cloud.firestore_v1.base_query import FieldFilter

APP_URL = os.environ.get('APP_URL', 'https://alex-todo-shopping.web.app').rstrip('/')
GITHUB_REPO = os.environ.get('GITHUB_REPO', 'alex99ka/todo-shopping')
POLL_SECONDS = int(os.environ.get('POLL_SECONDS', '30'))
RELEASE_EVERY_S = 3600
# Items are re-scanned this far behind the cursor: `date` is the client's clock
# and a write made offline (no signal in the shop) arrives late with an old date.
LOOKBACK_MS = 10 * 60 * 1000
# FCM's answers that mean the token will never work again.
DEAD_TOKEN = (messaging.UnregisteredError, messaging.SenderIdMismatchError, exceptions.InvalidArgumentError)

log = logging.getLogger('notifier')
# The app stores FCM registration tokens (getToken), not the installation IDs that 'fid' wants.
warnings.filterwarnings('ignore', 'Message.token is deprecated')


def now_ms():
    return int(time.time() * 1000)


# --- pure logic (covered by --selftest) ---

def recipients(lst, household, exclude=None):
    """Everyone who sees the list: its members plus its household's members.

    Mirrors inHousehold() in firestore.rules: a household only counts when the
    list was filed under this incarnation of it (same createdAt), so whoever
    recreates a deleted household's id gets none of its old lists' pushes.
    Stricter than the rules: only while the list's owner is still in the
    household, so a list left behind by an owner who moved out stays quiet.
    """
    uids = set(lst.get('memberUids') or [])
    bound = lst.get('householdCreatedAt')
    hm = set((household or {}).get('memberUids') or [])
    if household and bound is not None and bound == household.get('createdAt') and lst.get('ownerUid') in hm:
        uids |= hm
    uids.discard(exclude)
    return uids


def same_epoch(item, lst):
    """Mirrors sameEpoch() in the rules: items left behind by a deleted list
    do not belong to a list later recreated under the same id."""
    return lst is not None and item.get('listCreatedAt') == lst.get('createdAt')


def display_name(user):
    # users/{uid} is written by its owner with no size limit; an oversized body
    # makes FCM answer INVALID_ARGUMENT, which would read as a dead token.
    return str((user or {}).get('displayName') or 'Someone')[:60]


def group_new_items(items):
    """(list_id, item) pairs in date order -> {(list_id, by): [items]}."""
    groups = {}
    for list_id, item in items:
        groups.setdefault((list_id, item.get('by')), []).append(item)
    return groups


def unseen(found, seen, floor):
    """Drop (item_id, list_id, item) already pushed, remember the rest, and
    forget ids older than the look-back floor so `seen` stays small."""
    fresh = [(list_id, item) for item_id, list_id, item in found if item_id not in seen]
    for item_id, _, item in found:
        seen[item_id] = item.get('date') or 0
    for item_id in [k for k, d in seen.items() if d <= floor]:
        del seen[item_id]
    return fresh


def added_text(who, names):
    return f'{who} added "{names[0]}"' if len(names) == 1 else f'{who} added {len(names)} items'


def build_message(token, title, body, path):
    return messaging.Message(
        token=token,
        notification=messaging.Notification(title=title, body=body),
        data={'path': path},
        webpush=messaging.WebpushConfig(fcm_options=messaging.WebpushFCMOptions(link=APP_URL + path)),
        android=messaging.AndroidConfig(priority='high'),
    )


# --- Firestore / FCM ---

def send(token_snaps, title, body, path):
    refs = {s.id: s.reference for s in token_snaps}  # doc id == token; dict also dedupes
    tokens = list(refs)
    for i in range(0, len(tokens), 500):
        chunk = tokens[i:i + 500]
        resp = messaging.send_each([build_message(t, title, body, path) for t in chunk])
        for token, r in zip(chunk, resp.responses):
            if isinstance(r.exception, DEAD_TOKEN):
                refs[token].delete()
            elif r.exception:
                log.warning('push failed: %s', r.exception)
        log.info('push %r -> %d/%d delivered', title, resp.success_count, len(chunk))


def tokens_of(db, uids):
    return [s for uid in uids for s in db.collection('users').document(uid).collection('tokens').stream()]


def members(db, list_id, exclude=None):
    """(list doc, recipient uids), or (None, empty) if the list is gone."""
    lst = db.collection('lists').document(list_id).get().to_dict()
    if lst is None:
        return None, set()
    hid = lst.get('householdId')
    household = db.collection('households').document(hid).get().to_dict() if hid else None
    return lst, recipients(lst, household, exclude)


def new_items(db, st):
    # ponytail: date is the client's clock. The look-back window catches late and
    # offline writes up to LOOKBACK_MS old; a phone whose clock is further behind
    # than that is still missed. The upper bound stops a phone running ahead from
    # dragging the cursor into the future. Real fix: a server timestamp on items.
    snaps = (db.collection_group('items')
             .where(filter=FieldFilter('date', '>', st['cursor'] - LOOKBACK_MS))
             .where(filter=FieldFilter('date', '<=', now_ms()))
             .order_by('date')
             .stream())
    found = [(s.id, s.reference.parent.parent.id, s.to_dict()) for s in snaps]
    if found:
        st['cursor'] = max(st['cursor'], max(item['date'] for _, _, item in found))
    # Marked seen before sending: a failed send drops that push instead of repeating it every poll.
    items = unseen(found, st['seen'], st['cursor'] - LOOKBACK_MS)
    for (list_id, by), group in group_new_items(items).items():
        lst, uids = members(db, list_id, exclude=by)
        group = [i for i in group if same_epoch(i, lst)]
        if not uids or not group:
            continue
        user = db.collection('users').document(by).get().to_dict() if by else None
        names = [i.get('name') or '' for i in group]
        send(tokens_of(db, uids), lst.get('name') or 'List', added_text(display_name(user), names),
             f'/details/{list_id}')


def reminders(db, st):
    snaps = (db.collection_group('items')
             .where(filter=FieldFilter('reminded', '==', False))
             .where(filter=FieldFilter('remindAt', '<=', now_ms()))
             .limit(200)
             .stream())
    for s in snaps:
        item = s.to_dict()
        if not item.get('state'):
            list_id = s.reference.parent.parent.id
            lst, uids = members(db, list_id)
            if same_epoch(item, lst):
                send(tokens_of(db, uids), 'Reminder', item.get('name') or '', f'/details/{list_id}')
        s.reference.update({'reminded': True})


def latest_release():
    """Latest release tag, or None while the repo has no releases."""
    req = urllib.request.Request(
        f'https://api.github.com/repos/{GITHUB_REPO}/releases/latest',
        headers={'Accept': 'application/vnd.github+json', 'User-Agent': 'todo-shopping-notifier'},
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return json.load(r)['tag_name']
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return None
        raise


def release(db, st):
    if time.time() < st['next_release']:
        return
    # Set before trying, so a failing GitHub is not hit every poll (60 calls/hour limit).
    st['next_release'] = time.time() + RELEASE_EVERY_S
    tag = latest_release()
    if tag is None:
        return
    ref = db.document('notifier/state')
    stored = (ref.get().to_dict() or {}).get('lastRelease')
    if tag == stored:
        return
    if stored is not None:
        version = tag.lstrip('v')
        send(list(db.collection_group('tokens').stream()), 'Update available',
             f'Version {version} is ready — open the app to update', '/settings')
    ref.set({'lastRelease': tag}, merge=True)
    log.info('release %s stored (was %s)', tag, stored)


def cycle(db, st):
    for step in (new_items, reminders, release):
        try:
            step(db, st)
        except FailedPrecondition as e:
            log.error('%s: index missing or still building, retrying next poll: %s', step.__name__, e.message)
        except Exception:
            log.exception('%s failed', step.__name__)


def selftest():
    assert recipients({'memberUids': ['a', 'b']}, None) == {'a', 'b'}
    filed = {'memberUids': ['a', 'b'], 'ownerUid': 'a', 'householdCreatedAt': 'T0'}
    assert recipients(filed, {'memberUids': ['a', 'c'], 'createdAt': 'T0'}, exclude='a') == {'b', 'c'}
    # The owner left the household: its members no longer get this list's pushes.
    assert recipients(filed, {'memberUids': ['c'], 'createdAt': 'T0'}) == {'a', 'b'}
    # A recreated household (new createdAt) or an unbound list adds no household members.
    assert recipients(filed, {'memberUids': ['x'], 'createdAt': 'T1'}) == {'a', 'b'}
    assert recipients({'memberUids': ['a']}, {'memberUids': ['x'], 'createdAt': None}) == {'a'}
    assert recipients({}, None, exclude='x') == set()

    assert same_epoch({'listCreatedAt': 'T0'}, {'createdAt': 'T0'})
    assert not same_epoch({'listCreatedAt': 'T0'}, {'createdAt': 'T1'})
    assert not same_epoch({'listCreatedAt': 'T0'}, None)
    assert display_name({'displayName': 'x' * 5000}) == 'x' * 60
    assert display_name(None) == 'Someone'

    milk, eggs, bread, tea = ({'name': n, 'by': b} for n, b in
                              (('Milk', 'u1'), ('Eggs', 'u1'), ('Bread', 'u1'), ('Tea', 'u2')))
    items = [('L1', milk), ('L2', eggs), ('L1', bread), ('L1', tea)]
    assert group_new_items(items) == {('L1', 'u1'): [milk, bread], ('L2', 'u1'): [eggs], ('L1', 'u2'): [tea]}

    # Look-back: an item already pushed is not pushed again by the next poll;
    # a late item (older date) still is; old ids are forgotten.
    seen = {}
    first = unseen([('i1', 'L1', {'date': 100}), ('i2', 'L1', {'date': 50})], seen, floor=0)
    assert [i['date'] for _, i in first] == [100, 50] and seen == {'i1': 100, 'i2': 50}
    again = unseen([('i1', 'L1', {'date': 100}), ('i3', 'L1', {'date': 90})], seen, floor=60)
    assert [i['date'] for _, i in again] == [90] and seen == {'i1': 100, 'i3': 90}

    assert added_text('Alex', ['Milk']) == 'Alex added "Milk"'
    assert added_text('Alex', ['x'] * 12) == 'Alex added 12 items'

    m = build_message('tok', 'Groceries', 'Alex added "Milk"', '/details/L1')
    assert (m.token, m.data, m.notification.title) == ('tok', {'path': '/details/L1'}, 'Groceries')
    assert m.webpush.fcm_options.link == APP_URL + '/details/L1' and APP_URL.startswith('https://')
    assert m.android.priority == 'high'
    print('selftest ok')


def main():
    logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')
    if '--selftest' in sys.argv:
        return selftest()
    os.environ.setdefault('GOOGLE_APPLICATION_CREDENTIALS', '/app/service-account.json')
    db = firestore.client(firebase_admin.initialize_app())
    # cursor = boot time, so history is never replayed; seen = ids pushed within the look-back window
    st = {'cursor': now_ms(), 'next_release': 0, 'seen': {}}
    log.info('started: project %s, poll %ss', db.project, POLL_SECONDS)
    while True:
        cycle(db, st)
        if '--once' in sys.argv:
            return
        time.sleep(POLL_SECONDS)


if __name__ == '__main__':
    main()
