# Handoff to the recipe-book session: one set of friends for both apps

Paste this into the recipe book's session (`C:\claude projects\cld`, the server).
The to-do side is done: the commit after `94e0c13` on `alex99ka/todo-shopping`.

## The goal (Alex, 17.10.2026)

> Friends in the recipe app should be the same friends as in the to-do app.
> Adding someone to a list happens either through WhatsApp, which also makes
> them a friend, or by picking a friend I already have. Everyone in my
> household is automatically my friend.

## The contract between the two apps

Firestore `friends/{uid}` in the project `alex-todo-shopping`. Only servers
write it (Admin SDK); its owner can only read it.

```
friends/{uid} = {
  people: { <friendUid>: { name: "<name or email>" }, ... },   // the recipe server writes this
  mates:  { <uid>:       { name: "<displayName>" },   ... },   // the to-do notifier writes this
}
```

- `people` holds the recipe book's friendships (Postgres `friendships`), in
  both directions. Write it with `set({'people': {...}}, merge=['people'])`,
  which replaces the whole field and leaves `mates` alone.
- `mates` is everyone sharing a household with uid. The to-do notifier keeps
  it current from `households`. Don't write it.
- The to-do app reads the doc to offer "add to a list". Its rules let a
  list member add anyone in `people` or `mates` (`firestore.rules`
  `isFriendAdd`).

## What the recipe server needs

1. **Mirror every change to `friends/{uid}.people`.** Do it for both people
   after `accept_invite`, after `unfriend`, and after the new endpoint in
   step 2. On startup, backfill it once for every user who has a friendship.
   A helper such as `books.mirror_friends(uid)` that rewrites one user's
   `people` from `friends_of(uid)` covers all four. Use the Firestore client
   `accounts.households_for` already uses. A failed mirror logs and retries
   on the next change. It must never fail the request: Postgres is the
   source of truth.

2. **`POST /friends/from-invite` `{"inviteId": "..."}`.** The to-do app calls
   it right after someone joins a list through a link
   (`lib/lists/repo.dart` `befriendInviter`).
   - **Auth:** like `accept_invite`, open to any verified token
     (`_verified`), with the `invite` rate limit and `touch_user`.
   - **Find the inviter:** read `invites/{inviteId}` with the Admin SDK. It
     must have `kind == 'list'`. Its `createdBy` is the inviter.
   - **Check the caller joined:** the caller must be in
     `lists/{targetId}.memberUids`. Otherwise return 404 `invite_invalid`.
     This proves they really joined through the link.
   - **No-ops:** if the inviter is the caller, or the two share a household,
     return 200 and do nothing (housemates are friends already, through
     `mates`).
   - **Inviter's account:** the inviter may never have opened the recipe
     book. If so, create their `app_users` row from Firebase Auth
     (`auth.get_user`: display name, email) before inserting the friendship.
   - **The friendship:** insert it (`ON CONFLICT DO NOTHING`). Set the
     caller's `invited_by` if it is null, so they can open the recipe book
     too. Then mirror both people.
   - **Response:** `{"uid": inviter, "name": ...}`.

3. **CORS for the to-do web app.** Add `https://alex-todo-shopping.web.app`
   and `https://alex-todo-shopping.firebaseapp.com`. Add the preview
   channels too: `https://alex-todo-shopping--[a-z0-9-]+\.web\.app`. The
   to-do app calls `POST /friends/from-invite` and `DELETE /friends/{uid}`.
   Android and Windows don't need CORS.

4. **`DELETE /friends/{uid}` stays as it is, plus the mirror.** The to-do
   app's Households & friends screen calls it to remove a friend from both
   apps. Check that someone who came in only through step 2 passes
   `current`'s gate: `invited_by` is set, so they should.

5. **Housemates in the recipe book's friends screen.** This is so both apps
   show the same people. `GET /friends` could also return household mates
   with `"mate": true`. The app then shows them labelled "from the
   household" and without a remove button. Sending recipes to them stays
   off, since they already share the book.

6. **Tests:**
   - `from-invite`: happy path, not a member, the inviter is the caller,
     housemates, an unknown invite, a kind that isn't `list`.
   - The mirror is written on accept, unfriend and from-invite, and a
     Firestore failure doesn't fail the request.

## Order of going live

1. To-do Firestore rules: `firebase deploy --only firestore:rules` (Alex's OK).
2. The to-do notifier on the Pi. From then on, `mates` is filled.
3. The to-do app release. Adding housemates works at once. "People" stays
   empty, and the join call fails quietly, until step 4.
4. The recipe server with the changes above, plus the backfill. Recipe
   friends then show up in the to-do app.
