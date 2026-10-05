"""Two-way sync between app lists and Home Assistant to-do entities.

HA_SYNC="<listId>=todo.shopping_list,<listId2>=todo.tasks" pairs an app list with an
HA to-do entity (the built-in Shopping list, Local To-do, ...). Every poll both
sides are compared with the last synced state, kept in Firestore at
notifier/ha-<listId>, so each side's adds, renames, ticks and deletes reach the
other. When both sides changed the same item, the app wins. Only the name and the
done state cross over; the app keeps aisles, deadlines and the rest to itself.

Uses HA's REST API with a long-lived access token (HA_URL, HA_TOKEN).
"""

import json
import logging
import os
import time
import urllib.request

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

def sync_list(db, list_id, entity, now_ms):
    lst = db.collection('lists').document(list_id).get().to_dict()
    if lst is None:
        log.warning('HA sync: list %s does not exist', list_id)
        return
    items_ref = db.collection('lists').document(list_id).collection('items')
    app = {s.id: ((d.get('name') or '').strip(), bool(d.get('state')))
           for s in items_ref.stream() for d in [s.to_dict()]
           if d.get('listCreatedAt') == lst.get('createdAt')}
    ha = ha_items(entity)
    state_ref = db.document(f'notifier/ha-{list_id}')
    pairs = (state_ref.get().to_dict() or {}).get('pairs', {})

    ops, pairs = plan(app, ha, pairs)
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
            items_ref.document(item_id).update({'name': name, 'state': done, 'doneBy': BY if done else None})
        elif kind == 'app_delete':
            items_ref.document(op[1]).delete()
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

    state_ref.set({'pairs': pairs, 'entity': entity, 'synced': now_ms()})
    if ops:
        log.info('HA sync %s <-> %s: %d change(s)', list_id, entity, len(ops))


def sync(db, now_ms, st):
    pairs = pairs_from_env()
    if not pairs or not HA_TOKEN:
        return
    for list_id, entity in pairs.items():
        try:
            sync_list(db, list_id, entity, now_ms)
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

    # Nothing changed -> nothing to do.
    assert plan({'a1': ('חלב', False)}, {'h1': ('חלב', False)}, {'a1': p('h1', 'חלב')}) == (
        [], {'a1': p('h1', 'חלב')})
