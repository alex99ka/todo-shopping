# Recipe book to shopping list: spec for the recipe project

**For:** a Claude Code session working in the recipe-book repo at `C:\Users\User\Downloads\cld` (the FastAPI server is in `server/`). That session owns the recipe repo. The todo app ("Todo and Shopping", this repo) already has its side.

**Written:** 2026-10-04, against recipe-repo `master` at `e0d6cfe` plus the uncommitted battery work in its working tree.

Two features:

1. **Add to shopping list.** A button on the recipe page puts the recipe's ingredients on the household shopping list in the todo app.
2. **Prices.** Each ingredient line gets a price, and the recipe page shows the total cost and the cost per serving.

Each feature comes with a reference implementation, written as unified diffs against the recipe repo. They were applied to a scratch clone and checked (see [section 3](#3-notes-for-the-recipe-session)). Review them against the code as it is when you start. Don't paste them in without reading.

## Facts about the recipe project today

The README and `db.py` are out of date in places. This is what the code does now:

- **Database:** the Postgres 16 container `recipe-db` from `deploy/recipe-server/docker-compose.yml`, on the Pi, reached as `db:5432/recipes`. It is not Supabase, although `db.py`'s docstring, `server/.env.example` and the README still say so. `db.init_db()` runs `SCHEMA` (all `CREATE TABLE IF NOT EXISTS`) on every start, so a new table needs no migration step.
- **Recipes:** they live in Mealie (`mealie_client.py`). A recipe's `slug` changes when it is renamed (`rename_recipe`). Its `id` stays the same.
- **Ingredient lines on the recipe page:** the stored Hebrew translation (`translations.ingredients_he`, one line each) when there is one, otherwise Mealie's `display` lines. The translation is redone whenever Mealie's `updatedAt` changes. Its prompt keeps exactly one output line per input line.
- **Scaling:** on ×2, ×3 or a custom amount, `static/js/scale.js` rewrites each `#ingList li`'s `textContent` in place, so the page displays the scaled text. A line with no number becomes `×N <line>`. The ×1 text is kept in `li.dataset.original`.
- **Hosting:** Docker on `pi5-home-server`, port 8001, LAN only (`http://192.168.1.227:8001`). The container's environment comes from `deploy/recipe-server/.env` (the compose `env_file`). `server/.env` is excluded by `.dockerignore` and only matters for local runs.
- **Claude calls:** all go through `ai.py` with `client.messages.parse(..., output_format=<Pydantic model>)`. A Haiku model is already defined there: `PHOTO_MODEL = "claude-haiku-4-5-20251001"` (the dated id of Haiku 4.5; its alias is `claude-haiku-4-5`).

## 1. "Add to shopping list" button

### Contract

**Recipe page to recipe server.** A form under the ingredient list in `recipe.html` sends `POST /shop/{slug}` with two fields:

- `title`: the title the page shows.
- `lines`: a JSON array of the `#ingList li` texts as displayed when the button is tapped. Whatever ×N scaling is showing is what gets bought.

**Recipe server.** It asks Claude Haiku (`ai.PHOTO_MODEL`, structured output) to turn the lines into items of the form `{name, quantity, category}`:

- `name`: what you would look for in the shop, in the same language as the line, without amounts or preparation words (`בצל` from `2 בצלים קצוצים דק`).
- `quantity`: the amount as written, or `''`.
- `category`: exactly one of these, in this order: `Fruits & Vegetables`, `Meat & Fish`, `Dairy & Eggs`, `Bakery`, `Pantry`, `Spices & Sauces`, `Frozen`, `Drinks`, `Household`, `Other`. It is a `Literal`, so the API's structured output enforces it.
- Duplicate ingredients are merged into one item. Tap water and anything else that isn't bought is left out. A `×N` prefix multiplies the line.

Then the server responds:

- **On success:** `303` to `TODO_APP_URL + '/import#' + quote(json.dumps({"recipe": title, "items": [...]}, ensure_ascii=False), safe='')`.
- **On failure** (`TODO_APP_URL` unset, a Claude error, or no items): `303` to `/?err=<Hebrew message>`, like the rest of `app.py`.
- **Setting:** `TODO_APP_URL=https://alex-todo-shopping.web.app` goes in `server/.env`, `server/.env.example` and, on the Pi, `deploy/recipe-server/.env`.

**Todo app.** The `/import` page is already built in this repo (`src/app/pages/import/import.page.ts`). It does the following:

1. Signs the user in if needed, then returns to the page.
2. Parses the fragment and keeps at most 100 items. Every string is trimmed to 200 characters, and an unknown category becomes `Other`.
3. Shows a preview grouped by aisle with an **Add N items** button. Nothing is written until the user taps it, because anyone can craft an `/import#…` link.
4. Adds the items to the household's shopping list (a list with `kind: 'shopping'`, or a 1.0.0 list named `Shopping`), creating one named `קניות` if it is missing. The list groups items by category.
   - If an unchecked item with the same name (ignoring case) is already on the list, the new quantity and the recipe title are appended to that item's description. No second line is added.
   - New items get the description `<quantity> · <recipe>`.
5. Opens the list.

No Firebase credentials, config or SDK ever go into the recipe project. The write happens in the user's browser, as that user, under the Firestore rules.

**Button behaviour:**

- Label `הוספה לרשימת הקניות`, `class="secondary"`.
- On submit it is disabled and reads `ממיינת לפי מחלקות…`, because the Claude call takes a few seconds.
- A `pageshow` listener enables it again. Without that, coming back from the shopping list (the page is restored from the browser's back-forward cache) leaves the button disabled.

### The reverted prototype, checked against the current code

The prototype (diff 1 below) applies cleanly to both `e0d6cfe` and the current working tree; only line offsets differ. Point by point:

| Check | Finding |
|---|---|
| Does `scale.js` rewrite the `li` text, so the displayed lines are scaled? | Yes (`li.textContent = scaleLine(...)`). But a line with no number becomes `×2 כף מלח`, and the prototype's prompt didn't explain that. **Fixed:** the prompt now explains it. |
| Is there a `.secondary` button style? | Yes, `button.secondary` in `app.css`. `button[disabled]` has a progress style too. |
| Is a Haiku model id defined in `ai.py`? | Yes, `PHOTO_MODEL`. Reused. |
| `quote(payload)` | **Wrong.** The default `safe='/'` leaves every `/` unencoded (`1/2 כוס`). **Fixed:** now `safe=''`, as the contract says. |
| Error messages | The prototype used English and the bare exception text. `app.py`'s messages are Hebrew. **Fixed.** |
| Claude returns no items | The prototype redirected anyway, and the app then reported "no ingredients". **Fixed:** this is now an error on the recipe server. |
| `max_tokens=4096` | Tight for a long Hebrew list, and a truncated reply fails to parse. **Fixed:** raised to 8192. |
| Progress text `ממיין` | The app speaks in the feminine (`שומרת...` in `add.html`). **Fixed:** now `ממיינת`. |
| `.env.example` placeholder | **Fixed:** it now has the real URL and says where the setting goes on the Pi. |

Each diff below is exact (LF line endings). They were checked with `git apply --check` in order: 1, then 2, then 3. Copy a block to a file and `git apply` it, or make the changes by hand.

<details>
<summary>Diff 1: the reverted prototype, verbatim</summary>

````diff
diff --git a/server/.env.example b/server/.env.example
index 5b942fe..8fa3713 100644
--- a/server/.env.example
+++ b/server/.env.example
@@ -18,3 +18,7 @@ MEALIE_DISPLAY_TAG=trmnl
 # Optional. Free key from https://www.pexels.com/api/ — when set, a recipe
 # saved with no photo gets one found automatically. Leave blank to skip this.
 PEXELS_API_KEY=
+
+# The shopping-list app (separate Firebase project) that the recipe page's
+# "add to shopping list" button sends ingredients to, e.g. https://my-todo.web.app
+TODO_APP_URL=
diff --git a/server/ai.py b/server/ai.py
index f15d63a..7c7ddf1 100644
--- a/server/ai.py
+++ b/server/ai.py
@@ -7,7 +7,7 @@ doesn't provide.
 """
 import base64
 import os
-from typing import List
+from typing import List, Literal
 
 import anthropic
 from dotenv import load_dotenv
@@ -277,3 +277,46 @@ def translate_to_hebrew(
         output_format=HebrewTranslation,
     )
     return response.parsed_output
+
+
+# The shopping-list app (separate project, Firebase) groups by exactly these
+# strings, in this order — keep them in step with CATEGORIES there.
+GroceryCategory = Literal[
+    "Fruits & Vegetables", "Meat & Fish", "Dairy & Eggs", "Bakery", "Pantry",
+    "Spices & Sauces", "Frozen", "Drinks", "Household", "Other",
+]
+
+
+class GroceryItem(BaseModel):
+    name: str
+    quantity: str
+    category: GroceryCategory
+
+
+class GroceryList(BaseModel):
+    items: List[GroceryItem]
+
+
+GROCERY_PROMPT = (
+    "You turn a recipe's ingredient lines into a shopping list. For each "
+    "thing to buy return 'name': what you would look for in the shop, in the "
+    "same language as the line, without amounts or preparation words ('בצל' "
+    "from '2 בצלים קצוצים דק', 'flour' from '2 cups sifted flour'); "
+    "'quantity': the amount as written ('2', '500 גרם'), or an empty string "
+    "if there is none; and 'category': the supermarket section it belongs in. "
+    "Merge lines that ask for the same thing. Leave out tap water and "
+    "anything that is not bought (e.g. 'ice water', 'hot water')."
+)
+
+
+def grocery_list(ingredients: list[str]) -> GroceryList:
+    """Ingredient lines -> categorized shopping items. Haiku: sorting
+    groceries into aisles is as simple as naming a dish."""
+    response = client.messages.parse(
+        model=PHOTO_MODEL,
+        max_tokens=4096,
+        system=GROCERY_PROMPT,
+        messages=[{"role": "user", "content": "\n".join(f"- {x}" for x in ingredients)}],
+        output_format=GroceryList,
+    )
+    return response.parsed_output
diff --git a/server/app.py b/server/app.py
index 0ddfb01..7fe1a03 100644
--- a/server/app.py
+++ b/server/app.py
@@ -944,6 +944,32 @@ def recipe_detail(request: Request, slug: str):
     })
 
 
+# The shopping-list web app (Firebase Hosting), e.g. https://my-todo.web.app
+TODO_APP_URL = os.environ.get("TODO_APP_URL", "").rstrip("/")
+
+
+@app.post("/shop/{slug}")
+def send_to_shopping_list(slug: str, title: str = Form(""), lines: str = Form("[]")):
+    """Hand a recipe's ingredients to the shopping-list app.
+
+    The lines come from the page as shown, so a doubled recipe sends doubled
+    amounts. This server sorts them into aisles, then redirects the browser to
+    the app's /import page with the result in the URL fragment; the app writes
+    them as whoever is signed in there, so no Firebase credentials live here.
+    """
+    if not TODO_APP_URL:
+        return RedirectResponse(f"/?err={quote('TODO_APP_URL is not set in .env')}",
+                                status_code=303)
+    try:
+        ingredients = [str(x) for x in json.loads(lines) if str(x).strip()]
+        items = ai.grocery_list(ingredients).items
+    except Exception as e:
+        return RedirectResponse(f"/?err={quote(str(e))}", status_code=303)
+    payload = json.dumps({"recipe": title, "items": [i.model_dump() for i in items]},
+                         ensure_ascii=False)
+    return RedirectResponse(f"{TODO_APP_URL}/import#{quote(payload)}", status_code=303)
+
+
 @app.get("/panel.png")
 def panel_preview():
     """What the kitchen panel is showing right now.
diff --git a/server/templates/recipe.html b/server/templates/recipe.html
index 9ea09e5..58b1ab5 100644
--- a/server/templates/recipe.html
+++ b/server/templates/recipe.html
@@ -119,6 +119,25 @@
       <ul class="ing" id="ingList">
         {% for i in ingredients %}<li>{{ i }}</li>{% endfor %}
       </ul>
+      {# Sends the lines as shown, so a doubled recipe shops for double. #}
+      <form method="post" action="/shop/{{ slug }}" id="shopForm" style="margin-top:14px">
+        <input type="hidden" name="title" value="{{ title }}">
+        <input type="hidden" name="lines" id="shopLines">
+        <button type="submit" class="secondary" id="shopBtn">הוספה לרשימת הקניות</button>
+      </form>
+      <script>
+        document.getElementById('shopForm').addEventListener('submit', function () {
+          document.getElementById('shopLines').value = JSON.stringify(
+            [...document.querySelectorAll('#ingList li')].map(li => li.textContent.trim()));
+          const b = document.getElementById('shopBtn');
+          b.disabled = true; b.textContent = 'ממיין לפי מחלקות…';
+        });
+        // Back from the shopping list restores this page from cache, button still disabled.
+        window.addEventListener('pageshow', function () {
+          const b = document.getElementById('shopBtn');
+          b.disabled = false; b.textContent = 'הוספה לרשימת הקניות';
+        });
+      </script>
     </div>
     <div class="col-steps">
       <div class="sect">אופן ההכנה</div>
````

</details>

<details>
<summary>Diff 2: corrections, applied on top of diff 1</summary>

````diff
diff --git a/server/.env.example b/server/.env.example
index 8fa3713..7b9d848 100644
--- a/server/.env.example
+++ b/server/.env.example
@@ -20,5 +20,6 @@ MEALIE_DISPLAY_TAG=trmnl
 PEXELS_API_KEY=
 
 # The shopping-list app (separate Firebase project) that the recipe page's
-# "add to shopping list" button sends ingredients to, e.g. https://my-todo.web.app
-TODO_APP_URL=
+# "add to shopping list" button sends ingredients to. On the Pi this goes in
+# deploy/recipe-server/.env (compose's env_file); .env is not copied into the image.
+TODO_APP_URL=https://alex-todo-shopping.web.app
diff --git a/server/ai.py b/server/ai.py
index 7c7ddf1..bd7f2cb 100644
--- a/server/ai.py
+++ b/server/ai.py
@@ -280,7 +280,8 @@ def translate_to_hebrew(
 
 
 # The shopping-list app (separate project, Firebase) groups by exactly these
-# strings, in this order — keep them in step with CATEGORIES there.
+# strings, in this order — keep them in step with CATEGORIES in its
+# src/app/models/todo-list.model.ts. It files anything else under "Other".
 GroceryCategory = Literal[
     "Fruits & Vegetables", "Meat & Fish", "Dairy & Eggs", "Bakery", "Pantry",
     "Spices & Sauces", "Frozen", "Drinks", "Household", "Other",
@@ -305,7 +306,10 @@ GROCERY_PROMPT = (
     "'quantity': the amount as written ('2', '500 גרם'), or an empty string "
     "if there is none; and 'category': the supermarket section it belongs in. "
     "Merge lines that ask for the same thing. Leave out tap water and "
-    "anything that is not bought (e.g. 'ice water', 'hot water')."
+    "anything that is not bought (e.g. 'ice water', 'hot water'). A line "
+    "that starts with '×N' (the recipe was multiplied and the line has no "
+    "number of its own) means N times that line: '×2 כף מלח' is quantity "
+    "'2 כפות'."
 )
 
 
@@ -314,7 +318,7 @@ def grocery_list(ingredients: list[str]) -> GroceryList:
     groceries into aisles is as simple as naming a dish."""
     response = client.messages.parse(
         model=PHOTO_MODEL,
-        max_tokens=4096,
+        max_tokens=8192,
         system=GROCERY_PROMPT,
         messages=[{"role": "user", "content": "\n".join(f"- {x}" for x in ingredients)}],
         output_format=GroceryList,
diff --git a/server/app.py b/server/app.py
index a11cb81..5491438 100644
--- a/server/app.py
+++ b/server/app.py
@@ -945,7 +945,7 @@ def recipe_detail(request: Request, slug: str):
     })
 
 
-# The shopping-list web app (Firebase Hosting), e.g. https://my-todo.web.app
+# The shopping-list web app (Firebase Hosting): https://alex-todo-shopping.web.app
 TODO_APP_URL = os.environ.get("TODO_APP_URL", "").rstrip("/")
 
 
@@ -959,16 +959,21 @@ def send_to_shopping_list(slug: str, title: str = Form(""), lines: str = Form("[
     them as whoever is signed in there, so no Firebase credentials live here.
     """
     if not TODO_APP_URL:
-        return RedirectResponse(f"/?err={quote('TODO_APP_URL is not set in .env')}",
+        return RedirectResponse(f"/?err={quote('חסר TODO_APP_URL בקובץ ה-.env')}",
                                 status_code=303)
     try:
         ingredients = [str(x) for x in json.loads(lines) if str(x).strip()]
         items = ai.grocery_list(ingredients).items
     except Exception as e:
-        return RedirectResponse(f"/?err={quote(str(e))}", status_code=303)
+        return RedirectResponse(f"/?err={quote(f'שגיאה בהכנת רשימת הקניות: {e}')}",
+                                status_code=303)
+    if not items:
+        return RedirectResponse(f"/?err={quote('לא נמצאו במתכון מצרכים לקנייה')}",
+                                status_code=303)
     payload = json.dumps({"recipe": title, "items": [i.model_dump() for i in items]},
                          ensure_ascii=False)
-    return RedirectResponse(f"{TODO_APP_URL}/import#{quote(payload)}", status_code=303)
+    return RedirectResponse(f"{TODO_APP_URL}/import#{quote(payload, safe='')}",
+                            status_code=303)
 
 
 @app.get("/panel.png")
diff --git a/server/templates/recipe.html b/server/templates/recipe.html
index cc2b8ae..36fb523 100644
--- a/server/templates/recipe.html
+++ b/server/templates/recipe.html
@@ -120,7 +120,7 @@
           document.getElementById('shopLines').value = JSON.stringify(
             [...document.querySelectorAll('#ingList li')].map(li => li.textContent.trim()));
           const b = document.getElementById('shopBtn');
-          b.disabled = true; b.textContent = 'ממיין לפי מחלקות…';
+          b.disabled = true; b.textContent = 'ממיינת לפי מחלקות…';
         });
         // Back from the shopping list restores this page from cache, button still disabled.
         window.addEventListener('pageshow', function () {
````

</details>

## 2. Ingredient prices and recipe cost

### What the user sees

- **Edit page (`/edit/{slug}`):** a new "מחירים" panel lists every ingredient line as the recipe page shows it, each with a ₪ number field. A price is what that line's amount costs at ×1, not the price of the whole package. A blank field means no price. The panel is its own form, `POST /edit/{slug}/prices`, which returns to the recipe page. It works like the photo form: the main save talks to Mealie and may rename the recipe, and prices aren't Mealie's business.
- **Recipe page:** once at least one line has a price, an infobar under the ingredient list (reusing `.infobar`) shows `עלות משוערת` (the sum of the priced lines) and `למנה (N מנות)`.
  - Each line without a price gets a muted `אין מחיר` mark.
  - A note says `לא כולל N מצרכים בלי מחיר` and links to the edit panel.
  - A recipe with no prices at all shows only a small `הוספת מחירים` link and no marks.
- **×2, ×3, custom:**
  - The total is multiplied by the factor.
  - The servings count in the `למנה` label is multiplied by the factor.
  - The cost per serving stays the same.

**Why the cost per serving does not change.** Doubling a recipe doubles both its cost and its servings. The request said both numbers should scale with the multiplier, but only the total should. Dividing the doubled total by the original servings would double the cost per serving, which is wrong. If the user really wants something else here, ask.

**Servings** come from the same string the page shows (the translation's `servings`, otherwise Mealie's `recipeServings`). The first number in it is used: `4-6` gives 4 (the more expensive per-plate figure), `4.0` gives 4, and no number means no per-serving cost.

### Storage

One new table in the existing Postgres, created by `SCHEMA` at startup:

```sql
CREATE TABLE IF NOT EXISTS prices (
    recipe_id TEXT PRIMARY KEY,     -- Mealie's recipe id: unlike the slug, it survives a rename
    lines TEXT NOT NULL             -- JSON [{"line": text when priced, "price": shekels or null}], by ingredient position
);
```

There is one row per recipe, holding JSON text (the same approach `translations` uses for its lines), so a page view costs one read.

### Keeping each price on the right line

The lines don't belong to this feature. Mealie can edit them, and every re-translation can reword them. So each saved price keeps the line text it was entered against, and `pricing.match` decides, for each current line, in this order:

1. **Same position, same text:** the price is kept.
2. **Same text at another position in the saved list:** the price is kept. This covers lines that moved.
3. **Same number of lines as when priced, but this line reads differently:** the price is kept and counted, and the line is marked `מחיר לבדיקה` on the recipe page. The edit form shows the old text. A re-translation never changes the number of lines, so a reworded translation looks exactly like this. The amount may have changed too, which is why the line is marked. Saving the edit form records the current text and clears the mark.
4. **Anything else** (a Mealie edit added or removed lines, and this text is new): no price, marked `אין מחיר`.

The marks are CSS classes drawn with `::after`, not text inside the `li`. `scale.js` rewrites `li.textContent` and the shopping button sends it, so text marks would get scaled and sent to the shopping list.

### Skipped on purpose

- **Per-line prices on the reading page.** They are on the edit panel. Add them if the user wants, but not inside the `li` text, for the reason above.
- **Cost on the e-ink panel.**
- **Cleanup on delete.** Deleting a recipe leaves its `prices` row behind (marked with a `ponytail:` comment in `db.py`).
- **Price history, units and per-package prices.**

### Reference implementation

Diff 3 applies on top of diffs 1 and 2, because it touches the same part of `recipe.html`. It adds two new files:

- `server/pricing.py`: the matching rules, with no dependencies.
- `server/test_pricing.py`: a plain-`assert` check in the style of `test_scale.py`.

<details>
<summary>Diff 3: prices, applied on top of diffs 1 and 2</summary>

````diff
diff --git a/server/app.py b/server/app.py
index 5491438..661c49b 100644
--- a/server/app.py
+++ b/server/app.py
@@ -34,6 +34,7 @@ import db
 import fonts
 import mealie_client
 import pagecache
+import pricing
 import render
 import stock_photos
 import video
@@ -890,6 +891,14 @@ def set_style(font: str = Form(""), scale: str = Form("")):
                             status_code=303)
 
 
+def _shown_ingredients(r: dict, tr) -> list[str]:
+    """The ingredient lines the recipe page shows — the Hebrew once there is
+    one. Prices are entered against exactly these lines."""
+    if tr:
+        return [x for x in (tr["ingredients_he"] or "").splitlines() if x.strip()]
+    return mealie_client.ingredient_lines(r)
+
+
 @app.get("/recipe/{slug}", response_class=HTMLResponse)
 def recipe_detail(request: Request, slug: str):
     """Read a recipe in the app.
@@ -919,23 +928,23 @@ def recipe_detail(request: Request, slug: str):
     # Split off the source-book tag so the page can show "מתוך הספר: X"
     # distinctly instead of it sitting unremarkably among ordinary tags.
     source_book, tags = mealie_client.split_source_book(tags, SOURCE_BOOKS)
+    ingredients = _shown_ingredients(r, tr)
     if tr:
         title = tr["title_he"]
-        ingredients = [x for x in (tr["ingredients_he"] or "").splitlines() if x.strip()]
         steps = [x for x in (tr["steps_he"] or "").splitlines() if x.strip()]
         servings, total_time = tr["servings"], tr["time_minutes"]
     else:
         title = r.get("name", "")
-        ingredients = mealie_client.ingredient_lines(r)
         steps = mealie_client.instruction_lines(r)
         servings = str(r.get("recipeServings") or "")
         total_time = str(r.get("totalTime") or "")
+    prices = pricing.match(ingredients, db.get_prices(r["id"]))
 
     return templates.TemplateResponse("recipe.html", {
         "request": request, "slug": slug, "title": title,
         "original": r.get("name", ""), "translated": bool(tr),
         "image": mealie_client.image_url(r),
-        "ingredients": ingredients, "steps": steps,
+        "prices": prices, "cost": pricing.summary(prices, servings), "steps": steps,
         "servings": servings, "total_time": total_time,
         "owner": owner, "tags": tags,
         "categories": mealie_client.names_of(r, "recipeCategory"),
@@ -1024,6 +1033,8 @@ def edit_form(request: Request, slug: str, err: str = "", msg: str = ""):
         "all_categories": [c["name"] for c in _safe_organizers("categories")],
         "source": recipe.get("orgURL") or "",
         "all_sources": _known_sources(),
+        "prices": pricing.match(_shown_ingredients(recipe, db.get_translation(slug)),
+                                db.get_prices(recipe["id"])),
         "error": err or None,
         "msg": msg or None,
     })
@@ -1109,6 +1120,23 @@ async def edit_photo(slug: str, photo: UploadFile = File(...)):
     return RedirectResponse(f"/edit/{slug}?msg={quote('התמונה עודכנה')}", status_code=303)
 
 
+@app.post("/edit/{slug}/prices")
+def edit_prices(slug: str, line: list[str] = Form([]), price: list[str] = Form([])):
+    """Save what each ingredient line costs, against the text it has now.
+
+    Its own form, like the photo: the main save talks to Mealie and may rename
+    the recipe, and prices are not Mealie's business.
+    """
+    try:
+        recipe_id = mealie_client.get_recipe(slug)["id"]
+    except requests.RequestException as e:
+        return RedirectResponse(f"/edit/{slug}?err={quote(f'שגיאה בשמירה: {e}')}",
+                                status_code=303)
+    db.set_prices(recipe_id, [{"line": l, "price": pricing.parse_price(p)}
+                              for l, p in zip(line, price)])
+    return RedirectResponse(f"/recipe/{slug}", status_code=303)
+
+
 @app.post("/delete/{slug}")
 def delete_recipe(slug: str):
     try:
diff --git a/server/db.py b/server/db.py
index 458f588..92d36c7 100644
--- a/server/db.py
+++ b/server/db.py
@@ -9,6 +9,7 @@ server talks to Mealie's REST API but to Supabase's Postgres protocol
 directly (Mealie's API is the product's UI/import surface; Supabase here is
 just a database, with no public consumers of its own).
 """
+import json
 import os
 from contextlib import contextmanager
 
@@ -36,6 +37,11 @@ CREATE TABLE IF NOT EXISTS state (
     key TEXT PRIMARY KEY,
     value TEXT
 );
+
+CREATE TABLE IF NOT EXISTS prices (
+    recipe_id TEXT PRIMARY KEY,     -- Mealie's recipe id: unlike the slug, it survives a rename
+    lines TEXT NOT NULL             -- JSON [{"line": text when priced, "price": shekels or null}], by ingredient position
+);
 """
 
 # Opened lazily (on the FastAPI startup hook) so importing this module doesn't
@@ -98,6 +104,26 @@ def delete_translation(slug):
         conn.execute("DELETE FROM translations WHERE mealie_slug = %s", (slug,))
 
 
+def get_prices(recipe_id) -> list[dict]:
+    """Saved ingredient prices for a recipe; see pricing.py for how they are matched."""
+    with get_conn() as conn:
+        row = conn.execute(
+            "SELECT lines FROM prices WHERE recipe_id = %s", (recipe_id,)
+        ).fetchone()
+    return json.loads(row["lines"]) if row else []
+
+
+# ponytail: a deleted recipe's row stays behind (a few hundred bytes); delete it
+# by id in app.delete_recipe if that ever matters.
+def set_prices(recipe_id, lines: list[dict]):
+    with get_conn() as conn:
+        conn.execute(
+            "INSERT INTO prices (recipe_id, lines) VALUES (%s, %s) "
+            "ON CONFLICT (recipe_id) DO UPDATE SET lines = excluded.lines",
+            (recipe_id, json.dumps(lines, ensure_ascii=False)),
+        )
+
+
 def get_state(key, default=None):
     with get_conn() as conn:
         row = conn.execute("SELECT value FROM state WHERE key = %s", (key,)).fetchone()
diff --git a/server/pricing.py b/server/pricing.py
new file mode 100644
index 0000000..bef9845
--- /dev/null
+++ b/server/pricing.py
@@ -0,0 +1,67 @@
+"""Ingredient prices and what a recipe costs.
+
+A price belongs to one ingredient line: what the amount that line uses costs,
+in shekels. It is saved with the text the line had when it was priced, because
+the lines are not ours — Mealie owns them and the translation rewrites them —
+and either can change after a price was entered.
+
+A re-translation rewords lines but never adds or drops one (ai.py's prompt
+insists on one line per source line), so while the number of lines is the same,
+a line's position still says which ingredient it is: its price is kept, but
+marked for a re-check since the wording, and maybe the amount, moved. Once a
+Mealie edit adds or removes a line, positions mean nothing, and only lines whose
+text is unchanged keep their price.
+"""
+import math
+import re
+
+
+def parse_price(text: str):
+    """'12.5', '12,5', '₪12' -> a number of shekels; blank or junk -> None."""
+    text = (text or "").replace("₪", "").replace(",", ".").strip()
+    try:
+        value = float(text)
+    except ValueError:
+        return None
+    return value if math.isfinite(value) and value >= 0 else None
+
+
+def match(lines: list[str], saved: list[dict]) -> list[dict]:
+    """Pair each current line with its saved price.
+
+    Returns {'line', 'price', 'was'} per line. 'was' is the old text when the
+    price was kept by position although the line reads differently now.
+    """
+    by_text = {s["line"]: s["price"] for s in saved if s["price"] is not None}
+    same_shape = len(lines) == len(saved)
+    out = []
+    for i, line in enumerate(lines):
+        old = saved[i] if same_shape else None
+        if old and old["line"] == line:
+            out.append({"line": line, "price": old["price"], "was": None})
+        elif line in by_text:
+            out.append({"line": line, "price": by_text[line], "was": None})
+        elif old and old["price"] is not None:
+            out.append({"line": line, "price": old["price"], "was": old["line"]})
+        else:
+            out.append({"line": line, "price": None, "was": None})
+    return out
+
+
+def summary(matched: list[dict], servings: str):
+    """Cost of the recipe as written, or None when nothing is priced yet, so a
+    recipe nobody has priced shows no cost and no "missing" marks."""
+    prices = [m["price"] for m in matched if m["price"] is not None]
+    if not prices:
+        return None
+    total = sum(prices)
+    # "4", "4-6" (the lower end, i.e. the dearer plate) or Mealie's raw "4.0".
+    n = re.search(r"\d+(?:\.\d+)?", servings or "")
+    n = float(n.group()) if n else 0
+    return {
+        "total": round(total, 2),
+        "servings": n or None,
+        "per_serving": round(total / n, 2) if n else None,
+        "missing": sum(m["price"] is None for m in matched),
+        "stale": sum(m["was"] is not None for m in matched),
+    }
diff --git a/server/static/js/scale.js b/server/static/js/scale.js
index d99608d..b8b10a3 100644
--- a/server/static/js/scale.js
+++ b/server/static/js/scale.js
@@ -97,6 +97,13 @@
       });
       if (badge) badge.hidden = factor === 1;
 
+      // The cost grows with the amounts. Cost per serving does not: the
+      // servings grow by the same factor, so only the count beside it changes.
+      const cost = document.getElementById('costTotal');
+      if (cost) cost.textContent = (Number(cost.dataset.base) * factor).toFixed(2) + ' ₪';
+      const servings = document.getElementById('costServings');
+      if (servings) servings.textContent = pretty(Number(servings.dataset.base) * factor);
+
       // The panel should show what the page shows, so the multiplier travels
       // with "show on screen" and the button says what it will do.
       const field = document.getElementById('scaleField');
diff --git a/server/templates/edit.html b/server/templates/edit.html
index c13a03f..f5d8301 100644
--- a/server/templates/edit.html
+++ b/server/templates/edit.html
@@ -94,6 +94,26 @@
     <button type="submit">שמירה</button>
   </form>
 
+  {% if prices %}
+  <form method="post" action="/edit/{{ slug }}/prices" class="panel" id="prices" style="margin-top:16px">
+    <label>מחירים</label>
+    <div class="hint">כמה עולה הכמות שהשורה משתמשת בה, בשקלים — לא מחיר האריזה כולה. שורה בלי מחיר לא נכללת בעלות.</div>
+    {% for p in prices %}
+    <div style="display:flex; gap:10px; align-items:center; padding:8px 0; border-bottom:1px solid var(--line)">
+      <span style="flex:1">{{ p.line }}
+        {% if p.was %}<span class="small" style="display:block">השורה השתנתה. המחיר נקבע עבור «{{ p.was }}» — לבדוק ולשמור.</span>{% endif %}
+      </span>
+      <input type="hidden" name="line" value="{{ p.line }}">
+      <input type="number" name="price" min="0" step="0.01" inputmode="decimal" dir="ltr"
+             value="{{ p.price if p.price is not none else '' }}" placeholder="₪" aria-label="מחיר: {{ p.line }}"
+             style="width:96px; padding:9px 12px; font-size:16px; text-align:center;
+                    border:1px solid var(--line); border-radius:999px; background:var(--surface)">
+    </div>
+    {% endfor %}
+    <button type="submit" class="secondary" style="margin-top:14px">שמירת המחירים</button>
+  </form>
+  {% endif %}
+
   <form method="post" action="/delete/{{ slug }}"
         onsubmit="return confirm('למחוק את המתכון «{{ name }}»? אי אפשר לבטל.')">
     <button class="del" type="submit">{{ icons.trash() }}מחיקת המתכון</button>
diff --git a/server/templates/recipe.html b/server/templates/recipe.html
index 36fb523..1208515 100644
--- a/server/templates/recipe.html
+++ b/server/templates/recipe.html
@@ -57,6 +57,11 @@
     border-radius: 12px; padding: 8px 12px; margin-bottom: 12px; line-height: 1.45;
   }
   ul.ing li.scaled { font-weight: 600; }
+  ul.ing li.noprice::after, ul.ing li.stale::after {
+    font-size: 12.5px; font-weight: 400; color: var(--muted); margin-inline-start: 8px;
+  }
+  ul.ing li.noprice::after { content: 'אין מחיר'; }
+  ul.ing li.stale::after { content: 'מחיר לבדיקה'; color: var(--accent); }
   .sticky {
     position: sticky; bottom: 0; background: var(--bg);
     padding: 14px 0 6px; margin-top: 30px; border-top: 1px solid var(--line);
@@ -106,9 +111,30 @@
       <div class="scalenote" id="scaleBadge" hidden>
         הכמויות שהוכפלו מסומנות. זמני הבישול לא משתנים בהכפלה.
       </div>
+      {# The marks are classes, not text: the shopping button and scale.js both
+         read and rewrite each line's text. #}
       <ul class="ing" id="ingList">
-        {% for i in ingredients %}<li>{{ i }}</li>{% endfor %}
+        {% for p in prices %}<li{% if cost and p.was %} class="stale"{% elif cost and p.price is none %} class="noprice"{% endif %}>{{ p.line }}</li>{% endfor %}
       </ul>
+      {% if cost %}
+      <div class="infobar">
+        <div class="infobar-item"><span class="infobar-label">עלות משוערת</span>
+          <span class="infobar-value" id="costTotal" data-base="{{ cost.total }}">{{ '%.2f'|format(cost.total) }} ₪</span></div>
+        {% if cost.per_serving is not none %}
+        <div class="infobar-item"><span class="infobar-label">למנה (<span id="costServings" data-base="{{ cost.servings }}">{{ '%g'|format(cost.servings) }}</span> מנות)</span>
+          <span class="infobar-value">{{ '%.2f'|format(cost.per_serving) }} ₪</span></div>
+        {% endif %}
+      </div>
+      {% if cost.missing or cost.stale %}
+      <div class="small">
+        {% if cost.missing %}לא כולל {{ cost.missing }} מצרכים בלי מחיר.{% endif %}
+        {% if cost.stale %}{{ cost.stale }} מחירים לבדיקה — השורה השתנתה מאז שתומחרה.{% endif %}
+        <a href="/edit/{{ slug }}#prices">עדכון מחירים</a>
+      </div>
+      {% endif %}
+      {% else %}
+      <div class="small" style="margin-top:10px"><a href="/edit/{{ slug }}#prices">הוספת מחירים</a></div>
+      {% endif %}
       {# Sends the lines as shown, so a doubled recipe shops for double. #}
       <form method="post" action="/shop/{{ slug }}" id="shopForm" style="margin-top:14px">
         <input type="hidden" name="title" value="{{ title }}">
diff --git a/server/test_pricing.py b/server/test_pricing.py
new file mode 100644
index 0000000..0357d9d
--- /dev/null
+++ b/server/test_pricing.py
@@ -0,0 +1,48 @@
+"""Check which saved price lands on which ingredient line, and the totals.
+
+A wrong match prices the wrong ingredient without anyone noticing, so the
+cases are the ways the lines really change: a re-translation rewording them,
+and a Mealie edit adding one.
+
+    docker exec recipe-server python test_pricing.py
+"""
+from pricing import match, parse_price, summary
+
+SAVED = [
+    {"line": "2 בצלים", "price": 3.0},
+    {"line": "500 גרם בקר טחון", "price": 35.0},
+    {"line": "כף מלח", "price": None},
+]
+
+
+def main():
+    assert [parse_price(x) for x in ["12.5", "12,5", "₪ 7", "", "abc", "-3", "nan"]] == \
+        [12.5, 12.5, 7.0, None, None, None, None]
+
+    # Unchanged lines keep their prices; a blank price stays missing.
+    same = match(["2 בצלים", "500 גרם בקר טחון", "כף מלח"], SAVED)
+    assert [m["price"] for m in same] == [3.0, 35.0, None]
+    assert not any(m["was"] for m in same)
+
+    # Re-translation: same number of lines, one reworded. Its price is kept by
+    # position and flagged with the text it was priced against.
+    reworded = match(["2 בצלים", "חצי קילו בשר בקר טחון", "כף מלח"], SAVED)
+    assert reworded[1] == {"line": "חצי קילו בשר בקר טחון", "price": 35.0,
+                           "was": "500 גרם בקר טחון"}
+
+    # Mealie edit inserts a line: exact text still matches wherever it moved,
+    # the new line is missing, and nothing borrows a neighbour's price.
+    inserted = match(["שמן זית", "2 בצלים", "500 גרם בקר טחון", "כף מלח"], SAVED)
+    assert [m["price"] for m in inserted] == [None, 3.0, 35.0, None]
+    assert not any(m["was"] for m in inserted)
+
+    s = summary(reworded, "4-6")
+    assert s == {"total": 38.0, "servings": 4.0, "per_serving": 9.5,
+                 "missing": 1, "stale": 1}
+    assert summary(match(["מים"], []), "4") is None
+    assert summary(same, "")["per_serving"] is None
+    print("pricing: all checks passed")
+
+
+if __name__ == "__main__":
+    main()
````

</details>

## 3. Notes for the recipe session

### How the reference implementation was checked (2026-10-04)

- `git apply --check` of diffs 1, 2 and 3 in order: clean against both the recipe repo's working tree and a fresh clone of `e0d6cfe`.
- `python test_pricing.py`: passes.
- An end-to-end run in a scratch clone: the real `app.py` ran under uvicorn with Mealie, Postgres and Claude faked, and Playwright drove the pages in Chrome. All of these held:
  - A recipe with no prices shows no cost.
  - Prices save through the edit form.
  - A reworded line is marked and still counted.
  - ×2 still produces all 12 `test_scale.py` cases after the `scale.js` change.
  - At ×2 the total doubles, the cost per serving stays the same, and the servings count goes from 4 to 8.
  - The shopping button sends the scaled lines, without price marks, and lands on `<TODO_APP_URL>/import#…` with a fully percent-encoded JSON fragment.
  - Going back re-enables the button.
  - A Claude failure lands on `/?err=`.
- **Not checked:** a real Claude call, real Mealie and Postgres, and the real todo app. That's for the recipe session; see the end-to-end check below.

### Tests

- `cd server && python test_pricing.py` runs anywhere, with no dependencies.
- `test_scale.py` needs the server listening on `localhost:8000` and Playwright's Chromium. The container has both, so run `docker exec recipe-server python test_scale.py`, and `docker exec recipe-server python test_pricing.py` too once deployed. If the user doesn't want a restart yet, use the existing pattern of copying a scratch directory into the running container and testing there.

### The Pi

- Connect with `ssh -i ~/.ssh/pi5 alex99ka@pi5-home-server.local`. The code is in `~/docker/trmnl-recipes/`. It is copied with `tar` over ssh, excluding `.venv` and `.env`; there is no git remote. Deploy with `cd deploy/recipe-server && docker compose up -d --build`.
- Add `TODO_APP_URL=https://alex-todo-shopping.web.app` to `~/docker/trmnl-recipes/deploy/recipe-server/.env`. Leave the other values alone.
- Restarting the container breaks any panel button press in progress, so **ask the user before restarting.**
- The `prices` table is created on the first start.

### Security

- **LAN only.** `/shop/{slug}` and `/edit/{slug}/prices` have no authentication, like every other route here. Each tap of the button costs one Haiku call. Don't expose port 8001 beyond the LAN or Tailscale.
- **Fixed redirect target.** The redirect always goes to `TODO_APP_URL` (from the environment) plus `/import`. Nothing from the request goes into the `Location` header: no `next=` parameter, no Referer, not even the slug. So there is no open redirect. Keep it that way.
- **Payload in the fragment.** Browsers never send the fragment to a server, so the ingredients don't end up in Firebase Hosting logs or in Referer headers. The payload holds only the recipe title and grocery names, nothing secret, and the todo app treats it as untrusted input.
- **No Firebase credentials** in the recipe project, ever.
- **Escaping.** Jinja's autoescape covers the line text in the new hidden inputs, `aria-label`s and notes. Don't add `|safe` to them.

### End-to-end check

**Before you start:** the todo app with `/import` must be deployed to https://alex-todo-shopping.web.app (that's the todo app's job), and the user must be in a household there.

1. On a phone on the home Wi-Fi, open `http://192.168.1.227:8001/recipe/<slug>` and tap ×2. Tap `הוספה לרשימת הקניות`. The button should grey out and read `ממיינת לפי מחלקות…`.
2. The browser should land on `https://alex-todo-shopping.web.app/import#%7B%22recipe%22…`. If you are signed out, it should ask you to sign in and then return to `/import` with the fragment. If it lands on the home page instead, that's a bug in the todo app: report it to the user and don't work around it here.
3. A preview grouped by aisle should appear; tap **Add N items**. The household's Shopping list should open, with the items under category headings, the quantities doubled, and `quantity · recipe` under each item.
4. Press Back. You should be on the recipe page with the button usable again. Tap it a second time: there should be no duplicates. Unchecked items with the same name get the new amount appended to their description.
5. Error path: run locally with `TODO_APP_URL` blank. Tapping the button should show the red banner on the gallery page.
6. Prices: price some lines on the edit page. On the recipe page, check the infobar, the `אין מחיר` marks and the note. Tap ×2: only the total and the servings count should change.
