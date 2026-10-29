"""Two-way sync between app lists and Home Assistant to-do entities.

HA_SYNC="<listId>=todo.shopping_list,<listId2>=todo.tasks" pairs an app list with an
HA to-do entity (the built-in Shopping list, Local To-do, ...). Every poll both
sides are compared with the last synced state, kept in Firestore at
notifier/ha-<listId>, so each side's adds, renames, ticks and deletes reach the
other. When both sides changed the same item, the app wins. Only the name and the
done state cross over; the app keeps aisles, deadlines and the rest to itself.

Uses HA's REST API with a long-lived access token (HA_URL, HA_TOKEN).

The app side is a Firestore listener, not a read per poll: polling every item
every 30 s used the whole free read quota once the list grew past ~17 items.
A poll now costs no Firestore reads; each change costs one.
"""

import json
import logging
import os
import threading
import time
import urllib.request

from google.cloud.firestore_v1.base_query import FieldFilter

log = logging.getLogger('notifier.ha')

HA_URL = os.environ.get('HA_URL', 'http://127.0.0.1:8123').rstrip('/')
HA_TOKEN = os.environ.get('HA_TOKEN', '')
BY = 'home-assistant'


def pairs_from_env(value=None):
    """'L1=todo.a, L2=todo.b' -> {'L1': 'todo.a', 'L2': 'todo.b'}"""
    out = {}
    for part in (value if value is not None else os.environ.get('HA_SYNC', '')).split(','):
        if '=' in part:
            list_id, entity = (s.strip() for s in part.split('=', 1))
            if list_id and entity.startswith('todo.'):
                out[list_id] = entity
    return out


def norm(name):
    return ' '.join((name or '').split()).lower()


# The app's thingKey (lib/lists/logic.dart): "בצל" and "בצלים" are one thing.
_FINALS = str.maketrans('ךםןףץ', 'כמנפצ')


def _stem(w):
    p = w.lower().translate(_FINALS).replace('יי', 'י')
    for s in ('ימ', 'ות', 'ה', 'י'):
        if len(p) >= 4 and p.endswith(s) and len(p) - len(s) >= 2:
            return p[:-len(s)]
    return p


def thing_key(name):
    return ' '.join(_stem(w) for w in (name or '').split())


def twin_of(item, other):
    """The app's twinOf: other goes along when item is ticked, unticked or deleted."""
    if thing_key(other.get('name')) != thing_key(item.get('name')):
        return False
    if item.get('state') is not True:
        return other.get('state') is not True
    return other.get('state') is True and other.get('doneAt') is not None and other.get('doneAt') == item.get('doneAt')


def is_shopping(lst):
    return lst.get('kind') == 'shopping' if lst.get('kind') is not None else lst.get('name') == 'Shopping'


# --- pure logic (covered by the notifier's --selftest) ---

def plan(app, ha, pairs):
    """Decide what to change. app: {item_id: (name, done)}, ha: {uid: (name, done)},
    pairs: {item_id: {'uid', 'name', 'done'}} from the last sync.

    Returns (ops, pairs). ops are tuples:
      ('ha_update', uid, name, done)  ('ha_remove', uid)  ('ha_add', item_id, name, done)
      ('app_update', item_id, name, done)  ('app_delete', item_id)  ('app_add', uid, name, done)
    New pairs for ha_add are made by the caller once HA has given the item a uid.
    """
    ops, kept = [], {}
    for item_id, p in pairs.items():
        a, h = app.get(item_id), ha.get(p['uid'])
        last = (p['name'], p['done'])
        if a is None and h is None:
            continue
        if a is None:
            ops.append(('ha_remove', p['uid']))
            continue
        if h is None:
            ops.append(('app_delete', item_id))
            continue
        if a != last:
            if a != h:
                ops.append(('ha_update', p['uid'], *a))
            final = a
        elif h != last:
            ops.append(('app_update', item_id, *h))
            final = h
        else:
            final = a
        kept[item_id] = {'uid': p['uid'], 'name': final[0], 'done': final[1]}

    # Unpaired on both sides: same name means same thing (first sync, or a pairing
    # lost along the way), so pair them instead of duplicating.
    free_ha = {uid: v for uid, v in ha.items() if uid not in {p['uid'] for p in kept.values()}
               and uid not in {p['uid'] for p in pairs.values()}}
    for item_id, a in app.items():
        if item_id in kept or item_id in pairs:
            continue
        match = next((uid for uid, h in free_ha.items() if norm(h[0]) == norm(a[0])), None)
        if match:
            h = free_ha.pop(match)
            if h[1] != a[1]:
                ops.append(('ha_update', match, *a))
            kept[item_id] = {'uid': match, 'name': a[0], 'done': a[1]}
        else:
            ops.append(('ha_add', item_id, *a))
    for uid, h in free_ha.items():
        ops.append(('app_add', uid, *h))
    return ops, kept


# --- Home Assistant ---

def call(service, data, response=False):
    url = f'{HA_URL}/api/services/todo/{service}' + ('?return_response' if response else '')
    req = urllib.request.Request(
        url, data=json.dumps(data).encode(), method='POST',
        headers={'Authorization': f'Bearer {HA_TOKEN}', 'Content-Type': 'application/json'},
    )
    with urllib.request.urlopen(req, timeout=15) as r:
        body = json.load(r)
    return body.get('service_response', {}) if response else body


def ha_items(entity):
    items = call('get_items', {'entity_id': entity}, response=True)[entity]['items']
    return {i['uid']: (i['summary'], i['status'] == 'completed') for i in items}


def ha_status(done):
    return 'completed' if done else 'needs_action'


# --- sync one pair ---

WATCH_FOR_S = 3600  # the list doc (its createdAt) is re-read and the listener renewed hourly


class Watch:
    """The list's items, kept current by a Firestore listener on another thread."""

    def __init__(self, db, list_id):
        self.lst = db.collection('lists').document(list_id).get().to_dict()
        self.items, self.docs, self.lock, self.ready = {}, {}, threading.Lock(), threading.Event()
        self.until = time.time() + WATCH_FOR_S
        self.watch = None
        if self.lst is not None:
            q = (db.collection('lists').document(list_id).collection('items')
                 .where(filter=FieldFilter('listCreatedAt', '==', self.lst.get('createdAt'))))
            self.watch = q.on_snapshot(self._changed)

    def _changed(self, _docs, changes, _read_time):
        with self.lock:
            for c in changes:
                if c.type.name == 'REMOVED':
                    self.items.pop(c.document.id, None)
                    self.docs.pop(c.document.id, None)
                else:
                    d = c.document.to_dict()
                    self.items[c.document.id] = ((d.get('name') or '').strip(), bool(d.get('state')))
                    self.docs[c.document.id] = d
        self.ready.set()

    def snapshot(self):
        if not self.ready.wait(60):
            raise OSError('Firestore listener not ready')
        with self.lock:
            return dict(self.items), dict(self.docs)

    def close(self):
        if self.watch:
            self.watch.unsubscribe()


def twins(db, list_id, lst, item):
    """item's copies on the other shopping lists of the same household or people."""
    if not is_shopping(lst):
        return []
    lists = db.collection('lists')
    found = {}
    if lst.get('householdId'):
        found.update({d.id: d for d in lists.where(filter=FieldFilter('householdId', '==', lst['householdId'])).stream()})
    members = (lst.get('memberUids') or [])[:30]
    if members:
        found.update({d.id: d for d in lists.where(filter=FieldFilter('memberUids', 'array_contains_any', members)).stream()})
    refs = []
    for other_id, d in found.items():
        o = d.to_dict()
        if other_id == list_id or not is_shopping(o):
            continue
        q = (lists.document(other_id).collection('items')
             .where(filter=FieldFilter('listCreatedAt', '==', o.get('createdAt')))
             .where(filter=FieldFilter('state', '==', item.get('state') is True)))
        refs += [i.reference for i in q.stream() if twin_of(item, i.to_dict())]
    return refs


def sync_list(db, list_id, entity, now_ms, st):
    watches = st.setdefault('ha_watch', {})
    w = watches.get(list_id)
    if w is None or time.time() > w.until:
        if w:
            w.close()
        w = watches[list_id] = Watch(db, list_id)
    if w.lst is None:
        log.warning('HA sync: list %s does not exist', list_id)
        return
    lst = w.lst
    items_ref = db.collection('lists').document(list_id).collection('items')
    app, docs = w.snapshot()
    ha = ha_items(entity)
    state_ref = db.document(f'notifier/ha-{list_id}')
    saved = st.setdefault('ha_pairs', {})
    if list_id not in saved:
        saved[list_id] = (state_ref.get().to_dict() or {}).get('pairs', {})
    before = json.dumps(saved[list_id], sort_keys=True)

    ops, pairs = plan(app, ha, saved[list_id])
    added = {}
    for op in ops:
        kind = op[0]
        if kind == 'ha_update':
            _, uid, name, done = op
            call('update_item', {'entity_id': entity, 'item': uid, 'rename': name, 'status': ha_status(done)})
        elif kind == 'ha_remove':
            call('remove_item', {'entity_id': entity, 'item': [op[1]]})
        elif kind == 'ha_add':
            _, item_id, name, done = op
            call('add_item', {'entity_id': entity, 'item': name})
            added[item_id] = (name, done)
        elif kind == 'app_update':
            _, item_id, name, done = op
            change = {'state': done, 'doneBy': BY if done else None, 'doneAt': now_ms() if done else None}
            if done == app[item_id][1]:
                change = {}
            items_ref.document(item_id).update({'name': name, **change})
            # Ticked in HA: the same thing on the other shopping lists goes with it.
            for ref in twins(db, list_id, lst, docs[item_id]) if change else []:
                ref.update(change)
        elif kind == 'app_delete':
            items_ref.document(op[1]).delete()
            for ref in twins(db, list_id, lst, docs[op[1]]):
                ref.delete()
        elif kind == 'app_add':
            _, uid, name, done = op
            ref = items_ref.document()
            ref.set({'name': name, 'state': done, 'description': '', 'date': now_ms(),
                     'listCreatedAt': lst.get('createdAt'), 'by': BY, 'doneBy': BY if done else None})
            pairs[ref.id] = {'uid': uid, 'name': name, 'done': done}

    if added:
        # HA's add_item does not return the new uid: read the list again and pair by name.
        taken = {p['uid'] for p in pairs.values()}
        fresh = {uid: h for uid, h in ha_items(entity).items() if uid not in taken}
        for item_id, (name, done) in added.items():
            uid = next((u for u, h in fresh.items() if norm(h[0]) == norm(name)), None)
            if uid:
                fresh.pop(uid)
                if done:
                    call('update_item', {'entity_id': entity, 'item': uid, 'status': 'completed'})
                pairs[item_id] = {'uid': uid, 'name': name, 'done': done}

    saved[list_id] = pairs
    # Written only when something changed: a write per poll was 2,880 a day.
    if ops or json.dumps(pairs, sort_keys=True) != before:
        state_ref.set({'pairs': pairs, 'entity': entity, 'synced': now_ms()})
    if ops:
        log.info('HA sync %s <-> %s: %d change(s)', list_id, entity, len(ops))


def sync(db, now_ms, st):
    pairs = pairs_from_env()
    if not pairs or not HA_TOKEN:
        return
    for list_id, entity in pairs.items():
        try:
            sync_list(db, list_id, entity, now_ms, st)
            st.pop('ha_down', None)
        except OSError as e:
            # HA restarting or the network blipped: say so once, keep polling.
            if not st.get('ha_down'):
                log.warning('HA sync paused, Home Assistant unreachable: %s', e)
            st['ha_down'] = time.time()


def selftest():
    assert pairs_from_env('L1=todo.shopping_list, L2 = todo.tasks,bad,L3=light.x') == {
        'L1': 'todo.shopping_list', 'L2': 'todo.tasks'}
    p = lambda uid, name, done=False: {'uid': uid, 'name': name, 'done': done}  # noqa: E731

    # First sync: same names pair up, the rest is copied across.
    ops, pairs = plan({'a1': ('חלב', False), 'a2': ('לחם', False)},
                      {'h1': ('חלב', False), 'h2': ('Eggs', False)}, {})
    assert pairs == {'a1': p('h1', 'חלב')}
    assert sorted(ops) == [('app_add', 'h2', 'Eggs', False), ('ha_add', 'a2', 'לחם', False)]

    # Ticked in HA -> ticked in the app; ticked in the app -> ticked in HA.
    ops, pairs = plan({'a1': ('חלב', False)}, {'h1': ('חלב', True)}, {'a1': p('h1', 'חלב')})
    assert ops == [('app_update', 'a1', 'חלב', True)] and pairs['a1']['done'] is True
    ops, _ = plan({'a1': ('חלב', True)}, {'h1': ('חלב', False)}, {'a1': p('h1', 'חלב')})
    assert ops == [('ha_update', 'h1', 'חלב', True)]

    # Both changed: the app wins.
    ops, pairs = plan({'a1': ('חלב 3%', False)}, {'h1': ('milk', True)}, {'a1': p('h1', 'חלב')})
    assert ops == [('ha_update', 'h1', 'חלב 3%', False)] and pairs['a1']['name'] == 'חלב 3%'

    # Deleted on one side -> deleted on the other; gone on both -> forgotten.
    assert plan({}, {'h1': ('חלב', False)}, {'a1': p('h1', 'חלב')}) == ([('ha_remove', 'h1')], {})
    assert plan({'a1': ('חלב', False)}, {}, {'a1': p('h1', 'חלב')}) == ([('app_delete', 'a1')], {})
    assert plan({}, {}, {'a1': p('h1', 'חלב')}) == ([], {})

    # The same thing on another shopping list: open with open, ticked by the same tap.
    assert thing_key('בצלים') == thing_key(' בצל ') and thing_key('עגבנייה') == thing_key('עגבניות')
    assert twin_of({'name': 'בצל', 'state': False}, {'name': 'בצלים', 'state': False})
    assert not twin_of({'name': 'בצל', 'state': False}, {'name': 'שום', 'state': False})
    assert twin_of({'name': 'בצל', 'state': True, 'doneAt': 5}, {'name': 'בצל', 'state': True, 'doneAt': 5})
    assert not twin_of({'name': 'בצל', 'state': True, 'doneAt': 5}, {'name': 'בצל', 'state': True, 'doneAt': 4})
    assert is_shopping({'kind': 'shopping'}) and is_shopping({'name': 'Shopping'}) and not is_shopping({'kind': 'todo'})

    # Nothing changed -> nothing to do.
    assert plan({'a1': ('חלב', False)}, {'h1': ('חלב', False)}, {'a1': p('h1', 'חלב')}) == (
        [], {'a1': p('h1', 'חלב')})
