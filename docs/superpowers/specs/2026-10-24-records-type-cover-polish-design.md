# Design: type + cover polish for /records/

Date: 2026-10-24  
Site: https://lu-ceam.github.io (Astro)  
Status: Locked in chat 2026-10-24 («字都小些，加分隔»; cover = first 纸壳). Spec only. Implementation follows this document; this change does not edit CSS or markup until a plan is approved.

## Relationship to earlier specs

[Museum alignment](2026-10-24-records-museum-alignment-design.md) still owns Approach A, list image|text rows, chronological sort, 记述 hairline plane under the tombstone, untitled 著录 (`aria-label` only), fold summary size, and the out-of-scope list. This document **replaces** three of its locked surfaces:

1. List cover source (`cover.webp` → `record.image.src` / first 纸壳).
2. 记述 body size (`1rem` → `0.9375rem`).
3. The gap into 著录: add a hairline on `dl.props`, and shrink `dt` / `dd` type.

[Typography polish](2026-10-24-records-typography-polish-design.md) and [detail page](2026-10-24-records-detail-page-design.md) still own navigate-only URLs, skeleton B, lead markup, CJK microtype, and the ban on a 「记述」 label / drop cap / second face. Where they contradict this document on the three surfaces above, this document wins.

Checked against `src/styles/global.css`, `src/pages/records.astro`, `src/pages/records/[id].astro`, and `src/data/records.ts` after museum-alignment merge `1370b9e` (PR #19).

## Direction

Three moves, one pass:

1. **Cover** — list thumbnails show the first paper-shell front (`hero.webp` via `record.image`), not the waistband / back-detail strip that `cover.webp` often is.
2. **Type** — both 记述 and 著录 step down one notch so the jump between prose and fields is smaller.
3. **Separator** — a hairline on top of `dl.props` marks the field block the way the story’s top hairline marks the wall plane.

| Locked | Value |
|---|---|
| Paper / wine / line / face | Unchanged tokens from museum alignment |
| Detail skeleton | Unchanged (≥ `48rem` sticky plates left / text right) |
| 记述 lead | `.record-story-lead` weight `600` only, **same size** as body (no size bump) |
| List row structure | Unchanged cover|text grid, navigate-only whole-row links |
| Prose | `story` strings and `storyParagraphs()` stay as they are |
| 「著录」 visible title | Still absent; `aria-label="著录"` stays on `dl.props` |

## Delta

| Item | After museum alignment (`1370b9e`) | Locked here |
|---|---|---|
| List `img.c-cover` `src` | `/records/<id>/cover.webp` | `record.image.src` (today `/records/<id>/hero.webp`) |
| `assertPublicFile(…/cover.webp)` | required in `parseRecords` | **removed** |
| Existing `public/records/<id>/cover.webp` files | present | leave on disk; unused by list |
| `.record-story` `font-size` | `1rem` | `0.9375rem` |
| `.record-story` weight / line-height / tracking | `400` / `1.5` / `0.1px` | unchanged |
| `.record-story-lead` | weight `600`, inherits size | unchanged rule (inherits new `0.9375rem`) |
| `.props dt` `font-size` | `0.75rem` | `0.72rem` |
| `.props dd` `font-size` | `0.82rem` | `0.78rem` |
| `.props` base `font-size` | `0.82rem` | `0.78rem` (keeps `5.5em` label column in ems of the dd size) |
| `.props` `row-gap` / columns / align | `0.32rem` / `5.5em 1fr` / `baseline` | unchanged |
| `.props` top rule | none | `border-top: 1px solid var(--line)` |
| `.props` top spacing, ≥ `48rem` | `margin: 0` | `margin-top: 0.35rem`; `padding-top: 1rem` |
| `.props` top spacing, `max-width: 47.99rem` | `margin: 0` | `margin-top: 0.35rem`; `padding-top: 0.7rem` |
| Fold summary | `0.78rem` | unchanged (now matches new `dd`) |
| Story top hairline / tombstone margins | as museum alignment | unchanged |

`0.9375rem` is `15/16` of `1rem` (one half-step down). At `font-size: 112.5%` and a `16px` initial size, root `1rem` = `18px`, so story used size = `16.875px`.

Label column check: longest `dt` is 内圈刻字 (4 characters). `5.5em` on `.props` is `5.5 × 0.78rem` = `4.29rem`. Four characters at `0.72rem` are `2.88rem`. `2.88rem < 4.29rem`, so the column stays `5.5em`.

## 1. List cover — first 纸壳

In `src/pages/records.astro`, the cover image uses the record’s primary image (same source the detail hero uses):

```html
<img
  class="c-cover"
  src={record.image.src}
  width="96"
  height="96"
  alt=""
  decoding="async"
  loading="lazy"
/>
```

Do **not** hard-code `/records/${record.id}/cover.webp`. Do **not** hard-code `hero.webp` by string if `record.image.src` already resolves it.

In `src/data/records.ts`, remove `assertPublicFile(\`/records/${record.id}/cover.webp\`)` (and any helper that exists only for that assert). Keep whatever assert already guards `record.image` / `hero.webp` if one exists; do not add a new cover assert.

Existing `public/records/<id>/cover.webp` files may remain. They are out of the list’s render path. Do not delete them in this pass.

CSS for `.c-cover` (sizes, `object-fit: cover`, grid placement) stays exactly as museum alignment.

## 2. Detail — 记述 size

Replace only the `font-size` on `.record-story`. All other properties from museum alignment section 1 stay, including the top hairline, paddings, CJK microtype, and `max-width: 34em`.

```css
.record-story {
	/* …unchanged except: */
	font-size: 0.9375rem;
}
```

`.record-story-lead` stays:

```css
.record-story-lead {
	font-weight: 600;
}
```

No `font-size` on the lead. No `p:first-child` size or weight rule.

`p + p { margin-top: 1em }` stays (`1em` of the paragraph’s own em = `0.9375rem`).

## 3. Detail — 著录 size + separator

`dl.props` keeps `aria-label="著录"`. No visible 「著录」 heading.

### Locked `.props`

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

Inside the existing `@media (max-width: 47.99rem)` block, set:

```css
.props {
	padding-top: 0.7rem;
}
```

(`margin-top: 0.35rem` stays at both widths.)

### Spacing reading

Above the props rule: story `margin-bottom: 1.6rem` (unchanged) plus props `margin-top: 0.35rem`. The hairline then has `padding-top: 1rem` (desktop) / `0.7rem` (narrow) of air below it before the first `dt`/`dd` row — the same top-padding rhythm as `.record-story` relative to its own hairline.

## 4. Files

| File | Change |
|---|---|
| `src/pages/records.astro` | `img.c-cover` `src={record.image.src}` |
| `src/data/records.ts` | Remove `cover.webp` assert |
| `src/styles/global.css` | `.record-story` font-size; `.props` sizes + top hairline/spacing; narrow `padding-top` |

No change to `[id].astro` markup in this pass (aria-label and no h2 already shipped).

## 5. Acceptance

Viewport checks use a `16px` initial font size (`1rem` on this site = `18px`).

1. Every list `img.c-cover` `src` equals that record’s `record.image.src` (for current data, `/records/<id>/hero.webp`). None use `cover.webp`. `alt` is empty. `width`/`height` attributes stay `96`.
2. `parseRecords` does not call `assertPublicFile` for `cover.webp`. A missing `cover.webp` does not fail the build. A missing primary image still fails if an existing image assert covers it.
3. `.record-story` used `font-size` is `0.9375rem` (≈ `16.875px` at this root). Weight `400`, line-height `1.5` × font-size, tracking `0.1px`. Top hairline and paddings match museum alignment. `.record-story-lead` used weight is `600` and used size equals the story’s.
4. `.props` used `border-top` is `1px solid` computed `--line`. Used `margin-top` is `0.35rem`. Used `padding-top` is `1rem` when `max-width: 47.99rem` does not match, and `0.7rem` when it does. Used `row-gap` is `0.32rem`, columns `5.5em 1fr`, `align-items: baseline`.
5. A `dt` used `font-size` is `0.72rem`, weight `400`, line-height `1.4`, color computed `--muted`. A `dd` used `font-size` is `0.78rem`, weight `400`, line-height `1.45`, color computed `--text`. `.props` base `font-size` is `0.78rem`.
6. Fold summary remains `0.78rem` / `500` / muted. No 「著录」 visible heading. `dl.props` `aria-label` is 著录.
7. Light `--bg` is `#f3f0e8` and light `--link` / `--accent` are `#7c2d22`. No new `font-family`. No `story` string changes. List row grid sizes and sort order unchanged. `npm run check` and `npm run build` pass. Visual check at `390px` and desktop on `/records/`, `/records/mhjl329/`, and `/records/falp381/`.

## 6. Out of scope

- Deleting or regenerating `cover.webp` files
- Changing sort, filters, or list grid geometry
- Changing story top hairline, tombstone type, or fold chrome beyond what’s listed
- Rewriting `story` prose or lead-splitting logic
- Restoring a visible 「著录」 title
- Editing `--bg`, `--accent`, or `--link`
- A second typeface or size bump on the lead
