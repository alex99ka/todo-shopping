# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
From 4.0.0 the entries are in Hebrew, for the people using the app: each one
becomes the release notes and the in-app "מה חדש". Every version installs
itself in the background (Android and Windows); the web reloads.

## [Unreleased]

## [4.2.0] - 2026-10-21

- מחלקות בקניות: האפליקציה מזהה יותר מוצרים, גם עם ו׳ או ה׳ בהתחלה, ברבים, או עם טעות הקלדה אחת. מחלקה שתיקנת למוצר נזכרת בכל הרשימות במכשיר.
- תיקון הקלדה: כשנראה שיש טעות במוצר שהקלדת, מופיע "התכוונת ל…?". לחיצה מתקנת, ושום דבר לא משתנה לבד.

## [4.1.0] - 2026-10-17

- חברים: אותם חברים כמו בספר המתכונים, וכל מי שבמשק בית שלך חבר אוטומטית. "הזמנת אנשים" ברשימה מאפשר לסמן חברים ולהוסיף אותם מיד, או לשלוח קישור בוואטסאפ. מי שמצטרף דרך הקישור נהיה חבר, כאן ובספר המתכונים. רשימת החברים, עם הסרה, נמצאת במסך "משקי בית וחברים".

## [4.0.2] - 2026-10-17

- וידג׳ט אחד למסך הבית במקום שניים: מעבר בין כל הרשימות (קניות ומשימות) בחצים, סימון פריט בלחיצה בלי לפתוח את האפליקציה, ו־+ שמוסיף פריט אחד וחוזר למסך הבית. וידג׳ט קיים מתעדכן לבד; את "הוספה לקניות" הישן מסירים.

## [4.0.1] - 2026-10-17

- מראה חדש: הסמל והצבעים של ספר המתכונים (חום, קרם, ורשימות קניות בטרקוטה).

## [4.0.0] - 2026-10-17

אפליקציה חדשה מבפנים, אותן רשימות. נכנסים עם Google פעם אחת.

- עכשיו גם במחשב (תוכנה ל-Windows), באתר ובאייפד, לצד הטלפון.
- מצב כהה, לפי הטלפון או לבחירה בהגדרות.
- כניסה בטביעת אצבע (בהגדרות).
- עדכונים יורדים ומותקנים לבד ברקע.
- שתי וידג׳טים למסך הבית: רשימת הקניות, והוספה מהירה אליה.
- שיתוף טקסט לאפליקציה (רשימה מצ׳אט) מוסיף את השורות לרשימה שבוחרים.
- בהגדרות: אילו התראות לקבל, דיווח על בעיה, מצב המערכת, ייצוא כל הרשימות לאקסל, וסיור באפליקציה.
- גיבוי מוצפן של כל הרשימות כל לילה.

## [3.1.0] - 2026-10-16

### Changed
- "Add to shopping list" in the recipe book opens this app on the phone, not
  the website in the browser. Needs an APK install (the update screen offers it).

## [3.0.0] - 2026-10-15

Needs the new APK one last time, installed by hand. From this version on,
updates that need an APK install from inside the app.

### Changed
- A new APK downloads inside the app, with its progress shown, and opens
  Android's installer straight away. Through the browser the download sat at
  100% waiting to be opened by hand. The first time, Android asks to allow
  installs from this app.

## [2.0.0] - 2026-10-15

Needs the new APK (Settings offers the download).

### Added
- "ספר מתכונים" in the menu opens the recipe book app, or its web version
  when it isn't installed.

## [1.5.0] - 2026-10-14

### Added

- Main shopping list: mark a shopping list as the main one from its ⋯ menu. The app asks
  first and says which list stops being the main one. The recipe book adds to the main
  list, which wears a "ראשית" tag on the home screen and next to its name.
- An item can go on other lists too: "גם ברשימות אחרות…" in its swipe options or its
  editor puts a copy (name, amount, aisle) on the lists you tick.
- Drag to merge: long-press a shopping item and drag it onto another to make one line.
  Same name and amounts that add up merge at once; otherwise a sheet asks which name
  and what amount. Undo is offered either way.

### Changed

- Picking another list on the recipe import screen applies to that recipe only; the
  main list changes only from the list's own menu.

## [1.4.0] - 2026-10-13

### Added

- Recipe list: choose which shopping list the recipe book adds to, on the import screen
  or from a list's ⋯ menu. The choice is remembered on every device, and the list
  carries a "מתכונים" tag on the home screen.
- The recipe import is editable: change a name, its amount and unit (grams, kilos,
  litres or units), or remove a line before adding.
- Joining duplicates: when a shopping list has the same thing on several lines, a card
  asks whether to join them, adding up the amounts (400 גרם + 700 גרם = 1.1 ק״ג).
- Merge lists: pull another list of yours into this one from the ⋯ menu. Its items
  move over, everyone who could see it can see this one, and it is deleted.

### Changed

- Imported items no longer carry the recipe name in their notes, only the amount.

## [1.3.0] - 2026-10-05

### Added

- The home screen shows what is waiting in each list: "5 לקנות", "2 באיחור · 1 היום".
- Store mode: in a shopping list, tapping anything on a row ticks it (with a short
  vibration where supported); the pencil opens the editor. The basket folds away.
- Quick add takes several items at once (commas or one per line, as pasted from a
  chat) and keeps amounts: "2 חלב", "חלב x2", "1 ק״ג עגבניות".
- Suggestions under quick add: what this list had before, most frequent first; one
  tap adds it again, in the aisle it had.
- Repeating tasks (weekly or monthly): ticking one moves its deadline on.
- A morning push at 08:00 with each person's tasks for today and overdue ones.
- Shared lists show who added, bought or did each item, and tasks can be put in
  someone's charge, with a "רק שלי" filter.
- New users start with a shopping list and a task list.
- Home Assistant sync (on the Pi notifier): a list stays in two-way sync with an HA
  to-do entity such as the Shopping list, so voice and dashboards work with it.

### Fixed

- Tapping a task's name to open the editor also ticked it, and Cancel left it ticked.

## [1.2.0] - 2026-10-05

### Added

- Quick add: type an item or task in the field under the list name and press Enter.
  Shopping items go to the aisle that name had before, or the one the name suggests.
- Every section has a ⋯ menu: tick off or put back the whole section, or empty it.
- "Empty list" in the list menu.
- Undo for every item delete (one, a section, the checked ones or the whole list).

### Changed

- Light design throughout: white top bars, light background and drawer. Dark mode is
  gone.

## [1.1.2] - 2026-10-04

### Fixed

- The 1.1.1 sign-in fix now also reaches browsers that had the site open before: each
  release changes the service worker file, so browsers reinstall it with the current
  security policy.

## [1.1.1] - 2026-10-04

### Fixed

- Google sign-in on the website did nothing. The offline service worker fetched Google's
  sign-in script, and the security policy did not allow that fetch. Profile photos
  were blocked the same way.
- A failed sign-in now says so instead of silently staying on the sign-in screen.

## [1.1.0] - 2026-10-04

### Added

- Every list is now either a shopping list or a task list, chosen when you create it.
  Lists from 1.0.0 named "Shopping" count as shopping lists.
- Tasks have a deadline and a priority. A task list groups them into overdue, today,
  later, no deadline and done; overdue tasks show in red, high priority with a flag.
- Shopping lists keep the aisle grouping and move checked items to an "in the basket"
  section at the end.
- Each list type has its own look: shopping lists use the amber accent (basket icon,
  aisle headings, checkboxes, add button), task lists the green one.
- Deadline and reminder chips, and a progress bar for what is left.
- Non-swipe ways to do everything a swipe does: delete from the item editor, rename and
  delete a list from its menu.
- Works offline: lists are cached on the device, and items you add, check off or
  delete while offline sync when the connection returns.

### Changed

- The whole interface is in Hebrew and right-to-left, including notifications.
  One typeface, Rubik (it covers Hebrew); Nunito Sans is gone.
  Voice input listens in Hebrew.

### Fixed

- A list deleted or left while open no longer breaks the page.
- An update already downloaded on Android is not downloaded again on the next check.

## [1.0.0] - 2026-10-04

First release of Todo and Shopping, forked from
[hamzahamidi/todo-list](https://github.com/hamzahamidi/todo-list).

### Added

- Shopping lists grouped by grocery category, with one-tap check-off.
- Import from the recipe book: its "add to shopping list" link opens
  `/import#<json>`, previews the ingredients by aisle, and adds them to the
  Shopping list after one confirming tap.
- Households: every list in a household is shared with all its members.
- Invite links for lists and households, valid for 7 days.
- Task reminders.
- Push notifications for new items on shared lists, due reminders and new versions, sent by the
  notifier running on a Raspberry Pi.
- Settings page with the app version and a manual update check.
- In-app updates that download in the background and are offered with a prompt:
  the service worker on the web, and on Android the web bundle (`www.zip`) from the
  latest GitHub release, checked against its SHA-256 digest.
- Signed Android APK on every GitHub release.
- Firebase Hosting deploy from the release workflow.

### Changed

- Runs on the free Firebase Spark plan: Auth, Firestore, Hosting and Cloud Messaging only.

### Removed

- Photo attachments are hidden, because Cloud Storage needs the paid Blaze plan.
- The unfinished list-sharing pages, replaced by invite links.
- The iOS build. iPhones use the installable web app.
- The GitHub Pages deploy.
- The non-working username/password and Facebook sign-in buttons (Google only).
- The upstream site's Google Analytics snippet and the third-party avatar service.

[unreleased]: https://github.com/alex99ka/todo-shopping/compare/1.5.0...HEAD
[1.5.0]: https://github.com/alex99ka/todo-shopping/compare/1.4.0...1.5.0
[1.4.0]: https://github.com/alex99ka/todo-shopping/compare/1.3.0...1.4.0
[1.3.0]: https://github.com/alex99ka/todo-shopping/compare/1.2.0...1.3.0
[1.2.0]: https://github.com/alex99ka/todo-shopping/compare/1.1.2...1.2.0
[1.1.2]: https://github.com/alex99ka/todo-shopping/compare/1.1.1...1.1.2
[1.1.1]: https://github.com/alex99ka/todo-shopping/compare/1.1.0...1.1.1
[1.1.0]: https://github.com/alex99ka/todo-shopping/compare/1.0.0...1.1.0
[1.0.0]: https://github.com/alex99ka/todo-shopping/releases/tag/1.0.0
