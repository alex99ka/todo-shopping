# Prompt for the recipe-book session

Paste this into a Claude Code session opened in `C:\Users\User\Downloads\cld`.

```text
Build two features in this recipe-book repo (FastAPI server in server/):

1. An "add to shopping list" button on the recipe page (label: הוספה לרשימת הקניות). It posts the ingredient lines as currently displayed, so ×2/×3 scaling carries over, to POST /shop/{slug}. The server asks Claude Haiku (structured output) to turn them into categorized grocery items, then 303-redirects to TODO_APP_URL + /import#<percent-encoded JSON>. My todo app (a separate project) writes them to the household shopping list. No Firebase credentials in this repo.
2. Ingredient prices: a ₪ price per ingredient line, entered on the edit page. Show the total cost and the cost per serving on the recipe page, following the ×N multiplier. Prices must survive re-translation (flag a line that changed). Mark lines without a price and leave them out of the total, with a note.

The full spec, with reference diffs checked against this repo on 2026-10-04, is at:
C:\claude projects\to do\docs\recipe-book-integration.md
Read all of it first. It also corrects stale README/db.py facts: the database is the local Postgres container, not Supabase. That file belongs to another project, so read it but don't edit it.

Constraints:
- Match the existing code and comment style. Hebrew RTL UI. Reuse existing CSS (.secondary, .infobar).
- Don't add dependencies.
- Check the reference diffs against the code as it is now. There may be uncommitted work in the tree: don't overwrite it. Adapt the diffs; don't paste them blind.
- Run server/test_pricing.py and server/test_scale.py. test_scale needs the server on :8000 and Playwright's Chromium: docker exec recipe-server python test_scale.py
- Set TODO_APP_URL=https://alex-todo-shopping.web.app in server/.env and server/.env.example, and on the Pi in deploy/recipe-server/.env.
- Ask me before restarting the container on the Pi.
- Commit only when I ask.
- When you're done, walk me through the end-to-end check in section 3 of the spec.
```
