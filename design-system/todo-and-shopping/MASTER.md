# Design System Master File

> **LOGIC:** When building a specific page, first check `design-system/pages/[page-name].md`.
> If that file exists, its rules **override** this Master file.
> If not, strictly follow the rules below.

---

**Project:** Todo and Shopping
**Generated:** 2026-10-04 00:28:35
**Category:** Grocery & Shopping List
**Design Dials:** Motion 3/10 (Subtle) | Density 5/10 (Standard)

---

## Global Rules

### Color Palette

| Role | Hex | CSS Variable |
|------|-----|--------------|
| Primary | `#059669` | `--color-primary` |
| On Primary | `#000000` | `--color-on-primary` |
| Secondary | `#10B981` | `--color-secondary` |
| On Secondary | `#000000` | `--color-on-secondary` |
| Accent/CTA | `#D97706` | `--color-accent` |
| On Accent/CTA | `#000000` | `--color-on-accent` |
| Background | `#ECFDF5` | `--color-background` |
| Foreground | `#0F172A` | `--color-foreground` |
| Card | `#FFFFFF` | `--color-card` |
| Card Foreground | `#0F172A` | `--color-card-foreground` |
| Muted | `#F0F8F6` | `--color-muted` |
| Muted Foreground | `#475569` | `--color-muted-foreground` |
| Border | `#E1F2ED` | `--color-border` |
| Destructive | `#DC2626` | `--color-destructive` |
| On Destructive | `#FFFFFF` | `--color-on-destructive` |
| Ring | `#059669` | `--color-ring` |

**Color Notes:** Fresh green + food amber

### Typography

- **Heading Font:** Rubik
- **Body Font:** Nunito Sans
- **Mood:** ecommerce, clean, shopping, product, retail, conversion
- **Google Fonts:** [Rubik + Nunito Sans](https://fonts.googleapis.com/css2?family=Nunito+Sans:wght@300;400;500;600;700&family=Rubik:wght@300;400;500;600;700&display=swap)

**CSS Import:**
```css
@import url('https://fonts.googleapis.com/css2?family=Nunito+Sans:wght@300;400;500;600;700&family=Rubik:wght@300;400;500;600;700&display=swap');
```

### Spacing Variables

*Density: 5/10 — Standard*

| Token | Value | Usage |
|-------|-------|-------|
| `--space-xs` | `4px` / `0.25rem` | Tight gaps |
| `--space-sm` | `8px` / `0.5rem` | Icon gaps, inline spacing |
| `--space-md` | `16px` / `1rem` | Standard padding |
| `--space-lg` | `24px` / `1.5rem` | Section padding |
| `--space-xl` | `32px` / `2rem` | Large gaps |
| `--space-2xl` | `48px` / `3rem` | Section margins |
| `--space-3xl` | `64px` / `4rem` | Hero padding |

### Shadow Depths

| Level | Value | Usage |
|-------|-------|-------|
| `--shadow-sm` | `0 1px 2px rgba(0,0,0,0.05)` | Subtle lift |
| `--shadow-md` | `0 4px 6px rgba(0,0,0,0.1)` | Cards, buttons |
| `--shadow-lg` | `0 10px 15px rgba(0,0,0,0.1)` | Modals, dropdowns |
| `--shadow-xl` | `0 20px 25px rgba(0,0,0,0.15)` | Hero images, featured cards |

---

## Component Specs

### Buttons

```css
/* Primary Button */
.btn-primary {
  background: #D97706;
  color: white;
  padding: 12px 24px;
  border-radius: 8px;
  font-weight: 600;
  transition: all 200ms ease;
  cursor: pointer;
}

.btn-primary:hover {
  opacity: 0.9;
  transform: translateY(-1px);
}

/* Secondary Button */
.btn-secondary {
  background: transparent;
  color: #059669;
  border: 2px solid #059669;
  padding: 12px 24px;
  border-radius: 8px;
  font-weight: 600;
  transition: all 200ms ease;
  cursor: pointer;
}
```

### Cards

```css
.card {
  background: #ECFDF5;
  border-radius: 12px;
  padding: 24px;
  box-shadow: var(--shadow-md);
  transition: all 200ms ease;
  cursor: pointer;
}

.card:hover {
  box-shadow: var(--shadow-lg);
  transform: translateY(-2px);
}
```

### Inputs

```css
.input {
  padding: 12px 16px;
  border: 1px solid #E2E8F0;
  border-radius: 8px;
  font-size: 16px;
  transition: border-color 200ms ease;
}

.input:focus {
  border-color: #059669;
  outline: none;
  box-shadow: 0 0 0 3px #05966920;
}
```

### Modals

```css
.modal-overlay {
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(4px);
}

.modal {
  background: white;
  border-radius: 16px;
  padding: 32px;
  box-shadow: var(--shadow-xl);
  max-width: 500px;
  width: 90%;
}
```

---

## Style Guidelines

**Style:** Flat Design

**Keywords:** 2D, minimalist, bold colors, no shadows, clean lines, simple shapes, typography-focused, modern, icon-heavy

**Best For:** Web apps, mobile apps, cross-platform, startup MVPs, user-friendly, SaaS, dashboards, corporate

**Key Effects:** No gradients/shadows, simple hover (color/opacity shift), fast loading, clean transitions (150-200ms ease), minimal icons

### Page Pattern

**Pattern Name:** Product Demo + Features

- **Conversion Strategy:** Use an interactive demo only when it explains value better than static media. Provide captions, transcript, visible play/pause controls, and a non-video fallback; do not autoplay under reduced motion. Pause media when offscreen or hidden and keep the final product state available as static content.
- **CTA Placement:** Video center + CTA right/bottom
- **Section Order:** Hero > Product video/mockup (center) > Feature breakdown per section > Comparison (optional) > CTA

---

## Motion

**Stagger List** (Subtle) — Trigger: load or scroll | Duration: 250-350ms | Easing: `power1.out`

```js
gsap.from('.list-item', { opacity: 0, y: 8, duration: 0.3, stagger: 0.03 });
```

**Framework notes:** Select items with a stable class/data-attribute (not array index) so re-renders in React don't break targeting; Use matchMedia('(prefers-reduced-motion: reduce)') to skip non-essential motion and render the final state immediately

- ✅ Keep per-item stagger delay small (0.02-0.04s) for lists longer than 10 items
- ❌ Don't stagger by more than 0.1s per item on long lists; total reveal time becomes sluggish
- ⚡ For virtualized lists, only animate items currently mounted in the DOM

---

## Anti-Patterns (Do NOT Use)

- ❌ Complex shadows
- ❌ 3D effects
- ❌ Muted colors
- ❌ Low energy

### Additional Forbidden Patterns

- ❌ **Emojis as icons** — Use SVG icons (Heroicons, Lucide, Simple Icons)
- ❌ **Missing cursor:pointer** — All clickable elements must have cursor:pointer
- ❌ **Layout-shifting hovers** — Avoid scale transforms that shift layout
- ❌ **Low contrast text** — Maintain 4.5:1 minimum contrast ratio
- ❌ **Instant state changes** — Always use transitions (150-300ms)
- ❌ **Invisible focus states** — Focus states must be visible for a11y

---

## Pre-Delivery Checklist

Before delivering any UI code, verify:

- [ ] No emojis used as icons (use SVG instead)
- [ ] All icons from consistent icon set (Heroicons/Lucide)
- [ ] `cursor-pointer` on all clickable elements
- [ ] Hover states with smooth transitions (150-300ms)
- [ ] Light mode: text contrast 4.5:1 minimum
- [ ] Focus states visible for keyboard navigation
- [ ] `prefers-reduced-motion` respected
- [ ] Responsive: 375px, 768px, 1024px, 1440px
- [ ] No content hidden behind fixed navbars
- [ ] No horizontal scroll on mobile

---

## Project decisions (override the generated values above)

- **Primary is `#047857` (emerald-700), not `#059669`.** White button text on `#059669` is 3.8:1 and fails WCAG AA; on `#047857` it is 5.5:1.
- **Light only (user's choice, 2026-10-05).** No dark mode. Background `#f6faf8`, white cards, white top bars with dark text and a hairline border (no shadow), green icons in the bars, light-mint drawer header on a white drawer. Status bar white with dark icons; `theme-color` white.
- **Amber is an accent only** (`--app-accent-soft` / `--app-accent-ink`, `tertiary` for fills). Never as a text color on white below `#92400e`.
- **List types have their own identity.** Shopping = amber: basket icon, aisle headings, count pills, checkboxes, progress bar, add button. Tasks = green: checkbox icon, primary everything. A rounded badge before the title carries the type (amber basket / green checkbox).
- **RTL.** `<html dir="rtl" lang="he">`; use logical properties only (`margin-inline`, `padding-inline`), never left/right. User text gets `dir="auto"`.
- **Deadline chips:** pill with icon and words; late = `--app-danger-soft`/`--app-danger-ink` plus the word "באיחור", today/reminder = accent, later = neutral. Colour is never the only signal.
- **Every swipe action has a tap alternative** (WCAG 2.2 dragging): item delete in the editor, list rename/delete in the list's ⋮ menu.
- **One font, Rubik, self-hosted** via `@fontsource-variable/rubik`. The UI is Hebrew and Nunito Sans has no Hebrew glyphs, so it was dropped (the generated pairing above is superseded). Self-hosted because the Android app must work offline and the CSP allows no third-party font hosts.
- **Tokens live in `src/theme/variables.scss`**; components use `var(--ion-color-*)` / `var(--app-*)`, never raw hex.
- **Lists are checklists, not cards:** `ion-list inset`, 56px rows, a checkbox with a 44px hit area at the start, tap the text to edit, swipe left for destructive actions, a FAB for "add".
- **Buttons are sentence case**; icon-only buttons always carry `aria-label`, decorative icons `aria-hidden="true"`.
- **Motion:** 150–200ms opacity/colour transitions only; everything collapses under `prefers-reduced-motion`.
- **Icon:** white basket with a green check on `#047857` (`resources/icon.png`, `src/assets/imgs/logo.png`, maskable variant `icon-maskable.png`).
- **Fluent over modal.** Each list has a quick-add field under the title: type, Enter, keep typing. Shopping items take the aisle the same name had before, else a Hebrew keyword guess (`models/aisle-guess.ts`), and a short toast names the aisle. The + button opens the full editor.
- **Section actions.** Every section heading has a ⋯ (44px) with: tick off / put back the whole section, and empty it. The list's ⋮ menu has "empty list" and "clear checked".
- **Undo, not confirm, for item deletes.** Single, section, checked or whole-list deletes happen at once in one batch and show a 5s toast with "ביטול" that restores them. Confirm dialogs stay only for deleting a list or household, which undo cannot restore.
- **Toast actions** use `#6ee7b7` on the dark toast (primary green there is under 3:1).
- **Store mode (shopping).** The whole row ticks; a pencil (44px) opens the editor. Row taps call `stopPropagation`, because `ion-item` also forwards any tap to its checkbox. The basket section folds (closed by default).
- **Home rows say what is waiting**, not when the list was made: "5 לקנות", "2 באיחור · 1 היום" (late in danger ink), "ריקה", "הכול בוצע".
- **People appear only on shared lists** (more than one member card): a 28px avatar at the row end, and one quiet line: "נקנה ע״י", "בוצע ע״י", "באחריות", "נוסף ע״י".
- **Suggestions** are 36px pill buttons under quick add, scrolling sideways; shown while typing (matches) or on focus (most frequent).

