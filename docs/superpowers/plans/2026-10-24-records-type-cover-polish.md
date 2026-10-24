# Records type + cover polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** List covers use the first 纸壳 (`record.image.src`); 记述 and 著录 type step down; `dl.props` gets a top hairline and matching padding.

**Architecture:** Three surgical edits on main after museum alignment (`1370b9e`) and the locked design spec (`docs/superpowers/specs/2026-10-24-records-type-cover-polish-design.md`, merged via PR #20). No new components. No story prose changes.

**Tech Stack:** Astro, Zod (`src/data/records.ts`), plain CSS in `src/styles/global.css`.

## Global Constraints

- Exact numbers from the design spec; do not pick nearby values.
- Do not delete `public/records/*/cover.webp` files.
- Do not restore a visible 「著录」 heading; keep `aria-label="著录"` on `dl.props`.
- Do not change sort, filters, list grid geometry, story top hairline, fold chrome, or tokens (`--bg`, `--accent`, `--link`).
- Keep `assertPublicFile` for `record.image` and detail images; only remove the `cover.webp` assert.
- `npm run check` and `npm run build` must pass.

## File map

| File | Responsibility |
|---|---|
| `src/pages/records.astro` | List row cover `src` |
| `src/data/records.ts` | Drop `cover.webp` assert inside `parseRecords` |
| `src/styles/global.css` | `.record-story` size; `.props` sizes + top rule + spacing |

---

### Task 1: List cover → `record.image.src`

**Files:**
- Modify: `src/pages/records.astro` (the `img.c-cover` inside `a.catalog-item`)
- Modify: `src/data/records.ts` (`parseRecords` loop)

**Interfaces:**
- Consumes: `VinylRecord.image.src` (already asserted)
- Produces: list `img.c-cover` whose `src` equals `record.image.src`

- [ ] **Step 1: Change the cover `src`**

In `src/pages/records.astro`, replace:

```astro
src={`/records/${record.id}/cover.webp`}
```

with:

```astro
src={record.image.src}
```

Leave `class`, `width="96"`, `height="96"`, `alt=""`, `decoding="async"`, and `loading="lazy"` unchanged.

- [ ] **Step 2: Remove the `cover.webp` assert**

In `src/data/records.ts`, inside `parseRecords`, the loop currently is:

```ts
for (const record of parsed.data) {
	assertPublicFile(record.image.src);
	for (const detail of record.details) assertPublicFile(detail.image.src);
	assertPublicFile(`/records/${record.id}/cover.webp`);
}
```

Delete only the `cover.webp` line so it becomes:

```ts
for (const record of parsed.data) {
	assertPublicFile(record.image.src);
	for (const detail of record.details) assertPublicFile(detail.image.src);
}
```

Keep the `assertPublicFile` function itself (still used for hero and details).

- [ ] **Step 3: Verify**

Run: `npm run check`

Expected: exit 0. No error mentioning `cover.webp`.

- [ ] **Step 4: Commit**

```bash
git add src/pages/records.astro src/data/records.ts
git commit -m "fix(records): list cover uses first paper-shell image"
```

---

### Task 2: Smaller 记述 + 著录, props hairline

**Files:**
- Modify: `src/styles/global.css` (`.record-story`, `.props`, `.props dt`, `.props dd`, and the existing `@media (max-width: 47.99rem)` block)

**Interfaces:**
- Consumes: museum-alignment `.record-story` / `.props` blocks already on main
- Produces: locked sizes and props top separator from the design spec

- [ ] **Step 1: Shrink `.record-story` font-size**

In `.record-story`, change only:

```css
font-size: 1rem;
```

to:

```css
font-size: 0.9375rem;
```

Do not touch padding, border-top, margin, weight, line-height, tracking, or microtype.

- [ ] **Step 2: Replace the `.props` block**

Replace the current `.props` / `.props dt` / `.props dd` rules with:

```css
.props {
	display: grid;
	grid-template-columns: 5.5em 1fr;
	column-gap: 0.75rem;
	row-gap: 0.32rem;
	align-items: baseline;
	margin: 0.35rem 0 0;
	padding: 1rem 0 0;
	border: 0;
	border-top: 1px solid var(--line);
	font-size: 0.78rem;
	font-weight: 400;
	line-height: 1.45;
}

.props dt {
	margin: 0;
	color: var(--muted);
	font-size: 0.72rem;
	font-weight: 400;
	line-height: 1.4;
	letter-spacing: 0;
	text-align: start;
	text-transform: none;
	white-space: nowrap;
}

.props dd {
	margin: 0;
	min-width: 0;
	color: var(--text);
	font-size: 0.78rem;
	font-weight: 400;
	line-height: 1.45;
	overflow-wrap: break-word;
}
```

- [ ] **Step 3: Narrow padding for `.props`**

Inside the existing `@media (max-width: 47.99rem)` block (the one that already sets `.record-story { max-width: none; padding-top: 0.7rem; }` and `.record-tombstone-meta { margin-bottom: 0.7rem; }`), add:

```css
.props {
	padding-top: 0.7rem;
}
```

Do not change `.record-story` or `.record-tombstone-meta` rules in that block.

- [ ] **Step 4: Verify**

Run: `npm run check && npm run build`

Expected: both exit 0.

Spot-check in built CSS or source:

- `.record-story` contains `font-size: 0.9375rem`
- `.props` contains `border-top: 1px solid var(--line)`, `padding: 1rem 0 0`, `margin: 0.35rem 0 0`, `font-size: 0.78rem`
- `.props dt` contains `font-size: 0.72rem`
- `.props dd` contains `font-size: 0.78rem`
- Narrow media contains `.props { padding-top: 0.7rem; }`

- [ ] **Step 5: Commit**

```bash
git add src/styles/global.css
git commit -m "style(records): shrink 记述/著录 type and add props separator"
```

---

### Task 3: Acceptance gate

- [ ] **Step 1: Grep guards**

```bash
rg -n 'cover\.webp' src/pages/records.astro src/data/records.ts
rg -n 'font-size: 0\.9375rem' src/styles/global.css
rg -n 'border-top: 1px solid var\(--line\)' src/styles/global.css
```

Expected:

- First command: no matches in those two files (cover.webp may still exist under `public/` — ignore).
- Second: at least one hit on `.record-story`.
- Third: hits include `.record-story` and `.props` (and folds; that is fine).

- [ ] **Step 2: Full verify**

Run: `npm run check && npm run build`

Expected: exit 0.

- [ ] **Step 3: Open PR**

Title: `feat(records): type + cover polish`

Body must mention: list cover = `record.image`; 记述 `0.9375rem`; 著录 dt/dd `0.72`/`0.78`; props top hairline; implements `docs/superpowers/specs/2026-10-24-records-type-cover-polish-design.md`.

---

## Spec coverage checklist

| Spec surface | Task |
|---|---|
| List `src={record.image.src}` | Task 1 |
| Remove `cover.webp` assert | Task 1 |
| Leave cover.webp files on disk | Task 1 (no delete) |
| 记述 `0.9375rem` | Task 2 |
| Lead weight 600 only | unchanged (Task 2 does not touch) |
| props dt `0.72` / dd `0.78` / base `0.78` | Task 2 |
| props top hairline + padding/margin | Task 2 |
| Narrow `padding-top: 0.7rem` | Task 2 |
| Acceptance / build | Task 3 |
