# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
A MAJOR version changes native code and needs a new Android APK; MINOR and PATCH
versions reach installed apps as an in-app update.

## [Unreleased]

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

[unreleased]: https://github.com/alex99ka/todo-shopping/compare/1.1.1...HEAD
[1.1.1]: https://github.com/alex99ka/todo-shopping/compare/1.1.0...1.1.1
[1.1.0]: https://github.com/alex99ka/todo-shopping/compare/1.0.0...1.1.0
[1.0.0]: https://github.com/alex99ka/todo-shopping/releases/tag/1.0.0
