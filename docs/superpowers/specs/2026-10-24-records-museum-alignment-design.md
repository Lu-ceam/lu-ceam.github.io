# Design: light museum alignment for /records/

Date: 2026-10-24  
Site: https://lu-ceam.github.io (Astro)  
Status: Approach A locked in chat 2026-10-24. Spec only. Implementation follows this document; this change does not edit CSS or markup behavior.

## 排版细节决定观感

Spacing, alignment, weight, color, and edges below are locked numbers. A range from the brief is closed in the delta table. An implementer does not pick a nearby value.

Checked against `src/styles/global.css`, `src/pages/records.astro`, `src/pages/records/[id].astro`, and `src/data/records.ts` after the typography-polish pass (记述 at `1rem` / `1.5` / `0.1px`, tombstone meta `margin-bottom: 1rem`, `.props` `row-gap: 0.14rem`).

## Direction

Approach A, from Albertina and contemporary museum object pages (Tate, M+, MoMA, Whitney):

1. 著录 is a museum tombstone: muted labels, text-color values, hairline folds.
2. 记述 is its own wall plane: air and a hairline between the tombstone and the story.

List rows are cover left, text right. The Albertina exhibitions index is full-bleed overlay bands. `/records/` uses the row described in section 4.

| Locked | Value |
|---|---|
| Paper | `--bg: #f3f0e8` (light). Do not edit the token |
| Wine | `--link` and `--accent: #7c2d22` (light). Do not edit the token |
| Elevated wash | `--bg-elevated: #faf8f4` (light), hover on list rows only |
| Line | `var(--line)` (`#ddd4c6` light, `#3c362f` dark). Rules reference the variable |
| Face | The `body` CJK sans already in `global.css`. `font-family` on these blocks stays `inherit` |
| Detail skeleton | ≥ `48rem`: sticky `.record-object` left, `.record-text` right. Below: one column, images then text |
| 记述 body | `1rem` / weight `400` / line-height `1.5` / `letter-spacing: 0.1px` |
| 记述 lead | `.record-story-lead` weight `600` only, same size, line-height, and tracking |
| List | Navigate-only. The whole `a.catalog-item` is the link |
| Prose | `story` strings and `storyParagraphs()` stay as they are |
| Catalog rulers | Flat hairlines. Thrill Jockey / Ninja Tune / Erstwhile |

Dark theme keeps the existing dark token block. Measurements are the same in both themes.

## What the earlier specs still own

[Detail page](2026-10-24-records-detail-page-design.md) still owns navigate-only URLs, skeleton B, reading order, sticky plates, and the ban on a 「记述」 label, a drop cap, a second face, and a left rail.

[Typography polish](2026-10-24-records-typography-polish-design.md) still owns 记述 size, lead, `p + p` gap, CJK microtype, blank-line splits, and the list type sizes repeated below. This document replaces three of its surfaces: the open gap under the tombstone (now a plane separator), the visible 「著录」 heading and the `.props` row rhythm, and the list row structure (cover plus text, including above `64rem`).

## Delta

| Item | Current | Locked |
|---|---|---|
| `.record-tombstone-meta` `margin-bottom`, ≥ `48rem` | `1rem` | `1rem` |
| `.record-tombstone-meta` `margin-bottom`, `max-width: 47.99rem` | `0.7rem` | `0.7rem` |
| `.record-story` `padding-top`, ≥ `48rem` | `0` | `1rem` |
| `.record-story` `padding-top`, `max-width: 47.99rem` | `0` | `0.7rem` |
| `.record-story` `border-top` | none | `1px solid var(--line)` |
| `.record-story` `margin` | `0 0 1.6rem` | `0 0 1.6rem` |
| `.record-story` fill / shadow / radius / left border | none | `background: transparent`; `box-shadow: none`; `border-radius: 0`; `border-left-width: 0` |
| `h2.record-props-label` | visible text 著录 | element removed |
| `.props` `margin` | `0.08rem 0 0` | `0` |
| `.props` `row-gap` | `0.14rem` | `0.32rem` |
| `.props` `column-gap` | `0.75rem` | `0.75rem` |
| `.props` columns | `5.5em 1fr` | `5.5em 1fr` |
| `.props` `align-items` | `stretch` (initial) | `baseline` |
| `.props dt` | `0.75rem` / `400` / `1.4` / `var(--muted)` | same, plus `text-align: start`, `letter-spacing: 0`, `text-transform: none`, `white-space: nowrap` |
| `.props dd` | `0.82rem` inherited / `400` / `1.45` / inherited `--text` | `0.82rem` / `400` / `1.45` / `color: var(--text)` |
| `.record-text .fold summary` | `0.84rem` / `500` / `1.4` / inherited `--text`, `display: flex` | `0.78rem` / `500` / `1.4` / `var(--muted)`, `display` unset, `padding-block: 0.68rem` |
| List row, width > `64rem` | four text columns | cover `6rem` + text |
| List row, `max-width: 40rem` | text stack, no image | cover `4.75rem` + text |
| Catalog order | `records.json` file order | earliest → latest, section 5 |

`1rem` of `padding-top` is the top of the brief’s `0.85–1rem` band. The space above the rule is already `1rem`, so the hairline sits in a `1rem` / `1rem` band. Below `48rem` the existing margin is `0.7rem`; `padding-top` is `0.7rem` there so the hairline stays centered and the mobile spacer from the typography spec stays `0.7rem` on each side of the rule.

`margin-bottom: 1.6rem` is the current value and the floor of the `1.6–1.75rem` band. It stays.

`row-gap: 0.14rem` sits outside `0.28–0.35rem`. The locked gap is `0.32rem`.

`dt` at `0.75rem` / `400` / `1.4` already sits inside `0.72–0.75rem` and weight `400–500`. Those three stay.

Summary at `0.84rem` sits outside `0.75–0.78rem`. The locked size is `0.78rem`.

At `font-size: 112.5%` and a `16px` initial size, `1rem` = `18px`. Summary line box = `0.78 × 1.4 × 18px` = `19.656px`. `padding-block: 0.68rem` adds `2 × 0.68 × 18px` = `24.48px`. Sum = `44.136px`, so `min-height: 44px` does not add a second gap under the line.

Label column: longest `dt` is 内圈刻字 (4 characters). `5.5em` on `.props` is `5.5 × 0.82rem` = `4.51rem`. Four characters at `0.75rem` are `3rem`. `3rem < 4.51rem`, so the column stays `5.5em`.

## 1. Detail — 记述 plane

Markup stays `header.record-tombstone` then `div.record-story`. The hairline is `border-top` on `.record-story`. On viewports at or above the `48rem` breakpoint the rule is `34em` wide (the story’s `max-width`). Below that breakpoint the story is `max-width: none` and the rule is the full `.record-text` column.

There is no element, heading, or visually hidden text 「记述」. There is no `p:first-child` size or weight rule. The first sentence stays `strong.record-story-lead` from `storyParagraphs()`.

### Locked `.record-story`

Replace the current `.record-story` block with:

```css
.record-story {
	max-width: 34em;
	margin: 0 0 1.6rem;
	padding: 1rem 0 0;
	border: 0;
	border-top: 1px solid var(--line);
	border-radius: 0;
	background: transparent;
	box-shadow: none;
	color: var(--text);
	font-size: 1rem;
	font-weight: 400;
	line-height: 1.5;
	letter-spacing: 0.1px;
	text-autospace: normal;
	text-spacing-trim: normal;
	line-break: strict;
	text-wrap: pretty;
}
```

Inside the existing `@media (max-width: 47.99rem)` block, keep `max-width: none` and add `padding-top: 0.7rem`. Keep `.record-tombstone-meta { margin-bottom: 0.7rem }` in that block. Base `.record-tombstone-meta` stays `margin: 0 0 1rem`.

`margin-top: 0` is required so the space above the rule is only the tombstone meta’s `margin-bottom`.

Leave these rules as they are:

```css
.record-story p {
	margin: 0;
}

.record-story p + p {
	margin-top: 1em;
}

.record-story-lead {
	font-weight: 600;
}

@supports not (text-spacing-trim: normal) {
	.record-story {
		font-feature-settings: "halt" 1;
	}
}
```

`lang="zh-Hans"` stays on `.record-story`. `1em` on `p + p` is the paragraph’s own em (`1rem`). The lead inherits `1rem` / `1.5` / `0.1px`.

### Kept beside the plane

| Selector | Keep |
|---|---|
| `.record-split` gap | `1.5rem 2rem` |
| ≥ `48rem` columns | `minmax(0, 0.95fr) minmax(0, 1.15fr)`, `align-items: start` |
| `.record-object` sticky | `top: 1rem`, `max-height: calc(100vh - 2rem)`, `overflow-y: auto` |
| `.record-tombstone h1` | `margin: 0 0 0.22rem`, `1.2rem` / `600` / `1.28`, `letter-spacing: -0.01em` |
| `.record-tombstone-meta` | `0.84rem` / `400` / `1.4`, `color: var(--muted)`, flex wrap, `gap: 0.2rem 0.15rem` |

## 2. Detail — 著录

Remove `<h2 class="record-props-label">著录</h2>` from `src/pages/records/[id].astro`. Delete the `.record-props-label` rule. Do not add a visually hidden heading.

The entry into the field list is the story’s `margin-bottom: 1.6rem`. `.props` `margin` is `0`, so nothing adds to that `1.6rem` (collapsed margin with `margin-top: 0` is `1.6rem`).

Set `aria-label="著录"` on `<dl class="props">`. The definition list keeps a name. The word is not painted.

`dt` / `dd` pairs, conditionals (`showMatrix`, `showPressing`, `year`), and the Chinese labels stay: 艺人, 作曲家, 作品, 厂牌, 目录号, 内圈刻字, 压片, 录音, 品相, 均衡, 状态, 年份.

### Locked `.props`

```css
.props {
	display: grid;
	grid-template-columns: 5.5em 1fr;
	column-gap: 0.75rem;
	row-gap: 0.32rem;
	align-items: baseline;
	margin: 0;
	font-size: 0.82rem;
	font-weight: 400;
	line-height: 1.45;
}

.props dt {
	margin: 0;
	color: var(--muted);
	font-size: 0.75rem;
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
	font-size: 0.82rem;
	font-weight: 400;
	line-height: 1.45;
	overflow-wrap: break-word;
}
```

Labels stay left-aligned. Latin small-caps tracking (`letter-spacing` above `0`, `text-transform: uppercase`) is not used. A wrapping `dd` aligns its first baseline with the `dt`.

## 3. Detail — folds

Three `<details class="fold">` elements, in this order: 出处, 证据核对, 待补拍. None has an `open` attribute.

Keep on `.record-text .fold`:

| Property | Value |
|---|---|
| `margin-top` | `0.35rem` |
| `border` | `0` |
| `border-top` | `1px solid var(--line)` |
| `background` | `transparent` |
| `border-radius` | `0` |
| `box-shadow` | `none` |
| last child `border-bottom` | `1px solid var(--line)` |
| `[open] summary` `border-bottom` | `0` |

Summary. Delete `display: flex` and `align-items: center` from `.record-text .fold summary`. Do not set `display` (the UA `list-item` marker stays). Do not set `list-style: none`. Do not hide `summary::-webkit-details-marker` or `summary::marker`.

```css
.record-text .fold summary {
	cursor: pointer;
	min-height: 44px;
	padding: 0.68rem 0;
	list-style-position: inside;
	color: var(--muted);
	font-weight: 500;
	font-size: 0.78rem;
	line-height: 1.4;
	overflow-wrap: break-word;
}
```

`.fold-lead` stays `color: var(--muted)`, `font-weight: 400`, and inherits `0.78rem`.

Fold body and plate text stay quieter than 记述 (`1rem`):

| Selector | Size | Weight | Line-height | Color |
|---|---|---|---|---|
| `.fold-body` | `0.84rem` | `400` | `1.5` | `var(--muted)` |
| `.detail-text` | `0.78rem` | `400` | `1.45` | `var(--muted)` |

`.fold-body` keeps `margin: 0`, `padding: 0 0 0.6rem`, `white-space: pre-line`.

Link cards inside the fold stay:

| Selector | Keep |
|---|---|
| `.record-text .fold > .link-cards` | `margin: 0`, `padding-bottom: 0.7rem`, `gap: 0.5rem` (from `.link-cards`) |
| `.link-cards a` | `min-height: 44px`, `padding: 0.45rem 0.7rem`, `border: 1px solid var(--line)`, `background: var(--bg-elevated)`, `color: inherit`, `text-decoration: none` |
| `.link-cards a:hover` | `border-color: var(--accent)` |
| `.link-site` | `0.8rem`, `color: var(--muted)` |

## 4. List — image | text rows

Each `a.catalog-item` is one row: cover left, text right, at every width including above `64rem`. The row does not stack the cover above the text. The anchor stays the only link. `href` stays `/records/${record.id}/`. `data-record` and the other `data-*` hooks stay on the anchor.

Filters (`.filters-catalog`), `.progress-track`, `.progress-stats`, `.catalog-note`, `.lede`, the page `h1`, the `目录` heading, and `.hint` stay in their current order and with their current rules.

`.catalog-head` stays in the DOM because the filter script sets `head.hidden`. Its used `display` is `none` at every width, so the four column labels are not painted. The `.catalog` block below replaces the current `.catalog { overflow-x: auto; }`. Delete the shared `.catalog-head, a.catalog-item` four-column grid. Delete the unscoped `grid-column` on `.c-work` (now `3`) and `.c-meta` (now `4`); inside `.c-text` those values would open implicit columns. Delete the whole `@media (max-width: 64rem)` block (it only contains catalog rules). Replace the `@media (max-width: 40rem)` block with the one below.

### Markup

`img.c-cover` is the first child. The text spans move into `span.c-text`. Classes `.c-cat`, `.c-status`, `.c-work`, `.c-meta`, `.c-artist`, `.c-sub`, `.c-label`, `.c-decade` stay.

```html
<a class="catalog-item" href={`/records/${record.id}/`} …>
  <img
    class="c-cover"
    src={`/records/${record.id}/cover.webp`}
    width="96"
    height="96"
    alt=""
    decoding="async"
    loading="lazy"
  />
  <span class="c-text">
    <span class="c-cat">{record.catalogNumber}</span>
    <span class="c-status"><span class={badgeClass(record.status)}>{record.status}</span></span>
    <span class="c-work">{record.work}</span>
    <span class="c-meta">
      <span class="c-artist">{record.artist}</span>
      <span class="c-sub">
        <span class="c-label">{record.label}</span>
        <span class="c-decade">{record.year ?? record.decade}</span>
      </span>
    </span>
  </span>
</a>
```

The image file is `public/records/<id>/cover.webp`. That path is not `record.image.src` (`hero.webp` on the current records). `width` and `height` are both `96` so the pre-CSS ratio is `1:1`. CSS sets the used size. `alt=""` because the link name is the text in `.c-text`. Do not set `fetchpriority`.

`parseRecords` calls `assertPublicFile(`/records/${record.id}/cover.webp`)` for every record. A missing cover fails the build.

`.c-decade` text is `String(record.year)` when `year` is set, and `record.decade` otherwise. The same expression is already `when` on the detail page. `record.pressing` is not rendered on the list. The secondary cluster is 厂牌 and that time token. The middot is the existing `::after` on `.c-label`.

Artist is one block under the title (`.c-artist`, `0.84rem` / `400` / `1.4`, `var(--muted)`). It wraps (`overflow-wrap: break-word`). It is not clamped and not ellipsized. Current artists include strings longer than a row (Milstein, Furtwängler, Casals).

### Locked row

```css
.catalog {
	overflow-x: visible;
	border-top: 1px solid var(--line);
}

.catalog-head {
	display: none;
}

.catalog-item[hidden] {
	display: none;
}

a.catalog-item {
	display: grid;
	grid-template-columns: 6rem minmax(0, 1fr);
	column-gap: 0.85rem;
	row-gap: 0;
	align-items: start;
	min-height: 44px;
	padding: 0.7rem 0;
	border-top: 0;
	border-bottom: 1px solid var(--line);
	border-radius: 0;
	background: transparent;
	box-shadow: none;
	color: inherit;
	line-height: 1.4;
	text-decoration: none;
}

a.catalog-item:hover {
	background: var(--bg-elevated);
	box-shadow: none;
	transform: none;
	text-decoration: none;
}

a.catalog-item .c-cover {
	grid-column: 1;
	grid-row: 1;
	display: block;
	width: 6rem;
	height: 6rem;
	object-fit: cover;
	object-position: center;
	border: 0;
	border-radius: 0;
	box-shadow: none;
	background: transparent;
}

a.catalog-item .c-text {
	grid-column: 2;
	grid-row: 1;
	display: grid;
	grid-template-columns: minmax(0, 1fr) auto;
	column-gap: 0.65rem;
	row-gap: 0;
	align-items: start;
	min-width: 0;
	margin: 0;
	padding: 0;
}

a.catalog-item .c-cat {
	grid-column: 1;
	grid-row: 1;
	justify-self: start;
	color: var(--muted);
	font-size: 0.78rem;
	font-weight: 400;
	line-height: 1.35;
	font-variant-numeric: tabular-nums;
}

a.catalog-item .c-status {
	grid-column: 2;
	grid-row: 1;
	justify-self: end;
	align-self: start;
}

a.catalog-item .c-work {
	grid-column: 1 / -1;
	grid-row: 2;
	margin-top: 0.14rem;
	color: var(--text);
	font-size: 1rem;
	font-weight: 600;
	line-height: 1.32;
}

a.catalog-item .c-meta {
	grid-column: 1 / -1;
	grid-row: 3;
	display: flex;
	flex-direction: column;
	align-items: flex-start;
	gap: 0.04rem;
	margin-top: 0.02rem;
	min-width: 0;
	color: var(--muted);
	font-size: 0.84rem;
	font-weight: 400;
	line-height: 1.4;
}

a.catalog-item .c-artist {
	display: block;
	min-width: 0;
	max-width: 100%;
	overflow-wrap: break-word;
}

a.catalog-item .c-sub {
	display: flex;
	flex-wrap: wrap;
	align-items: baseline;
	column-gap: 0.35rem;
	max-width: 100%;
	font-size: 0.78rem;
	font-weight: 400;
	line-height: 1.35;
}

a.catalog-item .c-label::before,
a.catalog-item .c-decade::before {
	content: none;
	margin: 0;
}

a.catalog-item .c-sub .c-label::after {
	content: "·";
	margin-left: 0.35rem;
	color: var(--line);
}

@media (max-width: 40rem) {
	a.catalog-item {
		grid-template-columns: 4.75rem minmax(0, 1fr);
		column-gap: 0.7rem;
	}

	a.catalog-item .c-cover {
		width: 4.75rem;
		height: 4.75rem;
	}

	a.catalog-item .c-text {
		grid-template-columns: minmax(0, 1fr);
	}

	a.catalog-item .c-status {
		grid-column: 1;
		grid-row: 2;
		justify-self: start;
		margin-top: 0.08rem;
	}

	a.catalog-item .c-work {
		grid-row: 3;
		margin-top: 0.28rem;
	}

	a.catalog-item .c-meta {
		grid-row: 4;
	}
}
```

`align-items: start` on the row lines the cover’s top edge up with the top of `.c-text` (the catalog-number line). The cover is not vertically centered on the row and not aligned to `.c-work`.

Cover width `6rem` is the lock inside `5.5–6.5rem`. Cover width `4.75rem` is the lock inside `4.5–5rem`, used only in `max-width: 40rem`. `390px` viewports fall inside that query (`rem` in media queries uses the initial `16px`, so `40rem` = `640px`).

Above `40rem`, catalog number and status share the first text line: catalog at the start, status at the end. At `max-width: 40rem`, status moves to the next line at the start edge (`justify-self: start`), then the title, then the meta. That is the existing `40rem` stack, now inside the text column, with the cover still on the left.

Status badge rules stay: `.c-status .badge` is `0.75rem` / `500` / `1.35`, `padding: 0.02rem 0.35rem`. `.badge-verified`, `.badge-partial`, and `.badge-pending` stay.

`.catalog-item` does not set the `order` property.

Text scale, all widths:

| Role | Size | Weight | Line-height | Color |
|---|---|---|---|---|
| `.c-cat` | `0.78rem` | `400` | `1.35` | `var(--muted)` |
| `.c-work` | `1rem` | `600` | `1.32` | `var(--text)` |
| `.c-artist` | `0.84rem` | `400` | `1.4` | `var(--muted)` |
| `.c-sub` | `0.78rem` | `400` | `1.35` | `var(--muted)` |
| status badge | `0.75rem` | `500` | `1.35` | existing badge tokens |

## 5. List sort — earliest → latest

`/records/` shows catalog rows from earliest to latest (从早到近).

The sort lives in `src/data/records.ts`. `export const records` is the sorted array. `src/pages/records.astro` maps `records` and does not sort. `getStaticPaths` in `src/pages/records/[id].astro` uses that same array and does not sort again. `records.json` stays in its current editorial order. Filter `<option>` lists stay on `uniqueValues` (`localeCompare` `zh-CN`) and are not the catalog order.

### Key

`year` is optional `number`, integer, `1800`–`2100` (`recordSchema`). `decade` is required. Current file values are `1940s`, `1950s`, `1960s`, `1980s`, `2020s`. No current record sets `year`.

Tighten `decade` to `z.string().regex(/^(?:18|19|20)\d{2}s$/)`.

```ts
const decadeSort = /^((?:18|19|20)\d{2})s$/;

export function catalogTime(record: VinylRecord): number {
	if (record.year !== undefined) return record.year;
	const match = decadeSort.exec(record.decade);
	if (!match) {
		throw new Error(`decade 无法作为排序年份：${record.id} ${record.decade}`);
	}
	return Number(match[1]);
}

export function sortRecords(list: readonly VinylRecord[]): VinylRecord[] {
	return list.slice().sort((a, b) => {
		const byTime = catalogTime(a) - catalogTime(b);
		if (byTime !== 0) return byTime;
		if (a.id < b.id) return -1;
		if (a.id > b.id) return 1;
		return 0;
	});
}

export const records = sortRecords(parseRecords(recordsJson));
```

| Rule | Lock |
|---|---|
| Primary | `year` when it is not `undefined`, numeric ascending |
| Else | the four digits of `decade` (`1980s` → `1980`), numeric ascending |
| Tie-break | `id` ascending, UTF-16 code-unit order (`<`), the same order as `^[a-z0-9]+$` |
| `year` vs `decade` | `year` wins even when it disagrees with the decade. A `year` of `1956` with `decade` `1950s` sorts at `1956` |
| Decade-only | sorts at the first year of the decade, before any `year` in `1951`–`1959` |
| Cross-check | do not reject a `year` that falls outside `decade` |
| Mutation | `sortRecords` returns a new array. `parseRecords`’s array is not mutated |
| CSS | no `order` on `.catalog-item`. The DOM order is the catalog order |

`id` is the tie-break because the schema requires it to be unique and `^[a-z0-9]+$`. `catalogNumber` is display copy (spaces, slashes, CJK parentheses) and is not unique.

`1940s` → `1940`. The trailing `s` is ASCII `s`.

### Filters

The inline script in `records.astro` only sets `item.hidden`. It does not sort the node list, move nodes, or set `element.style.order`. Hiding a row leaves it in place, so the visible sequence stays earliest → latest.

### Order of the current seven records

`records.json` order stays: `ml4001`, `mg50370`, `falp381`, `mhjl329`, `ll912`, `d37779`, `lpbr6083`.

Exported `records` order, all decade-only:

| Order | id | Key | Tie-break |
|---|---|---|---|
| 1 | `ml4001` | `1940` | |
| 2 | `falp381` | `1950` | `falp381` < `ll912` |
| 3 | `ll912` | `1950` | |
| 4 | `lpbr6083` | `1960` | `lpbr6083` < `mg50370` |
| 5 | `mg50370` | `1960` | |
| 6 | `d37779` | `1980` | |
| 7 | `mhjl329` | `2020` | |

Comparator checks beyond the file: `{ id: "aa", decade: "1950s" }` sorts at `1950` and before `falp381`. `{ id: "zz", decade: "1950s", year: 1956 }` sorts after `ll912` and before `lpbr6083`.

## 6. Files

| File | Change |
|---|---|
| `src/styles/global.css` | Sections 1–4 |
| `src/pages/records/[id].astro` | Remove the `h2`. Add `aria-label="著录"` on `dl.props` |
| `src/pages/records.astro` | Cover, `.c-text`, time token. No `.sort()` |
| `src/data/records.ts` | `decade` regex, cover file assert, `catalogTime`, `sortRecords`, sorted `records` export |

## 7. Acceptance

These checks are for the implementation of this spec.

Viewport checks use a `16px` initial font size (`1rem` on this site = `18px`). Media breakpoints stay the `rem` queries already in `global.css`.

1. `.record-story` used `border-top-width` is `1px`, `border-top-style` is `solid`, `border-top-color` equals the computed `--line`, `border-left-width` is `0`, `border-radius` is `0`, `background-color` is transparent, `box-shadow` is `none`. Used `padding-top` equals the root font size when `max-width: 47.99rem` does not match, and `0.7` times the root font size when it does. Used `margin-top` is `0`. Used `margin-bottom` is `1.6` times the root font size. Used `font-size` equals the root font size, `font-weight` is `400`, used `line-height` is `1.5` times the font size, `letter-spacing` is `0.1px`. `max-width` is `34em` at ≥ `48rem` and `none` below. `lang` is `zh-Hans`.
2. No rule sets `font-size` or `font-weight` on `.record-story p:first-child`. `.record-story-lead` used `font-weight` is `600` and its used `font-size` equals the story’s. Each `p + p` used `margin-top` is `1em` of that paragraph. Declared `text-autospace`, `text-spacing-trim`, `line-break`, and `text-wrap` match section 1. Where `text-spacing-trim: normal` is unsupported, computed `font-feature-settings` includes `"halt" 1`.
3. The document has no `.record-props-label` and no heading whose text is 著录. `dl.props` `aria-label` is 著录. The `dt` strings listed in section 2 are unchanged. The story’s `margin-bottom` is the gap above the `dl` (`props` used `margin-top` is `0`).
4. `.props` used `row-gap` is `0.32rem`, `column-gap` is `0.75rem`, `grid-template-columns` is `5.5em 1fr`, `align-items` is `baseline`. A `dt` used `font-size` is `0.75rem`, `font-weight` `400`, `line-height` `1.4`, color the computed `--muted`, `text-align` `start`, `letter-spacing` `0`, `text-transform` `none`. A `dd` used `font-size` is `0.82rem`, `font-weight` `400`, `line-height` `1.45`, color the computed `--text`.
5. Each `details.fold` is closed on first paint (no `open` attribute). `border-top` is `1px solid` computed `--line`, `background-color` transparent, `box-shadow` `none`. The last fold’s `border-bottom` is `1px solid` computed `--line`. Summary used `font-size` is `0.78rem`, `font-weight` `500`, `line-height` `1.4`, color computed `--muted`. The summary’s computed `display` is `list-item`. No stylesheet rule sets `list-style: none` on it or `display: none` on its marker. The disclosure triangle is visible. `.fold-body` used size is `0.84rem`, weight `400`, line-height `1.5`, color `--muted`. A link card keeps `padding: 0.45rem 0.7rem`, `min-height: 44px`, `border: 1px solid var(--line)`, `background: var(--bg-elevated)`.
6. At a `1200px` viewport, each `a.catalog-item` template is `6rem` and `minmax(0, 1fr)`, `column-gap` `0.85rem`, `align-items` `start`, `padding` `0.7rem 0`. The cover’s used width and height are `6rem`, `object-fit` is `cover`, `border-width` is `0`, `box-shadow` is `none`. `getBoundingClientRect()` of the cover’s top equals `.c-text`’s top within `1px`, and the cover’s right edge is left of `.c-text`’s left edge. `.c-work` is `1rem` / `600`. The row’s `border-bottom` is `1px solid` computed `--line`. The `:hover` rule sets `background` to `var(--bg-elevated)` and does not set `transform` or `box-shadow`.
7. At a `390px` viewport the row’s `grid-template-columns` is `4.75rem` and `minmax(0, 1fr)` and its `column-gap` is `0.7rem`. The cover’s used width and height are `4.75rem`, the cover’s top equals `.c-text`’s top within `1px`, and the cover’s right is left of `.c-text`’s left (the cover is beside the text). `.c-status`’s left equals `.c-cat`’s left within `1px`, and the status box is below the catalog number. `.c-work` is still `1rem` / `600` and starts at that same left edge.
8. `.catalog-head` computed `display` is `none` at `390px` and at `1200px`. Above the list, the page still shows the `h1`, the lede, the progress section, then the filter form, then the `目录` heading.
9. For the current `records.json`, the `records` export and the DOM order of `a.catalog-item` ids are `ml4001`, `falp381`, `ll912`, `lpbr6083`, `mg50370`, `d37779`, `mhjl329`. The JSON array order is unchanged. `records.astro` has no `.sort(`. No CSS `order` is set on `.catalog-item`.
10. `sortRecords` on the two extra objects in section 5 places `aa` before `falp381`, and places `zz` (`year: 1956`) after `ll912` and before `lpbr6083`. A `decade` that fails `/^(?:18|19|20)\d{2}s$/` fails parsing. `catalogTime` throws when `year` is absent and the decade fails that pattern.
11. With the decade filter showing only `1950s`, the visible ids are `falp381` then `ll912`. `ml4001` remains earlier in the DOM and is `hidden`. The script does not reorder nodes.
12. Every list `img.c-cover` `src` is `/records/<id>/cover.webp`. None use `hero.webp`. `alt` is empty. A record whose `public/records/<id>/cover.webp` is missing fails `parseRecords`.
13. Light `--bg` is `#f3f0e8` and light `--link` / `--accent` are `#7c2d22`. No new `font-family`. No `story` string in `records.json` changes. `npm run check` and `npm run build` pass. Visual check at `390px` and at desktop width on `/records/`, `/records/mhjl329/`, and `/records/falp381/`.

## 8. Out of scope

- Rewriting `story` prose, or changing `storyParagraphs()` / the lead markup
- Reordering `records.json`
- Sorting filter dropdowns chronologically
- A Whitney sticky facts column, or moving 著录 into the left column
- A second typeface, a serif display face, or a display-size tombstone
- An elevated `--bg-elevated` panel, shadow, or radius on `.record-story`
- A left wine rail on `.record-story`
- Albertina ticket chrome, side tabs, and the exhibitions index (full-bleed image bands with type on the image)
- A dark full-bleed gallery field (M+)
- Editing `--bg`, `--accent`, or `--link`
- A 3-column preview grid, a centered white title on the cover, or a brand-red stroke
- A card lift on row hover (`transform`, shadow)
- Rendering `record.pressing` on the list row
- Previous / next record, related pressings, per-record OG images
