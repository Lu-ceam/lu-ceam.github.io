# Records museum alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align `/records/` and `/records/<id>/` to Approach A: chronological cover-and-text rows, a tombstone 著录 list with no visible heading, hairline native folds, and a 记述 plane separated by a 1px rule.

**Architecture:** `src/data/records.ts` sorts the catalog (year, otherwise the decade’s first year, then `id`) and exports that array as `records`. Neither page sorts. `src/styles/global.css` locks the plane, the props grid, the disclosure summary, and the cover|text row. Markup changes are only the removed 著录 heading, `aria-label` on the `dl`, and the list cover plus `.c-text` wrapper.

**Tech Stack:** Astro 7 (`astro` ^7.4.2), TypeScript, Zod 4 (`zod` ^4.6.7), one global stylesheet `src/styles/global.css`, Node >= 22.23.4. `npm run check` is `astro check`. `npm run build` is `astro build && pagefind --site dist --force-language zh`.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-10-24-records-museum-alignment-design.md`. Implement that document. Do not renegotiate a locked number.
- This repo has no unit-test runner (no Vitest, Playwright, or `npm test`). Do not add one. Verification is the inline `node --experimental-strip-types` script, the Python source checkers, `npm run check`, `npm run build`, and the §7 browser script. Do not commit those scripts.
- Paper `--bg: #f3f0e8` (light). Do not edit the token.
- Wine `--link` and `--accent: #7c2d22` (light). Do not edit the token.
- Elevated wash `--bg-elevated: #faf8f4` (light), hover on list rows only.
- Line is `var(--line)` (`#ddd4c6` light, `#3c362f` dark). Rules reference the variable.
- Face stays the `body` CJK sans already in `global.css`. Do not set `font-family` on these blocks (`inherit` by omission).
- 记述 body stays `1rem` / weight `400` / line-height `1.5` / `letter-spacing: 0.1px`. Do not make it smaller.
- 记述 lead stays `.record-story-lead` weight `600` only, same size, line-height, and tracking. Do not add a `p:first-child` size or weight rule.
- 著录 `dt` stays `0.75rem` / `400` / `1.4`. 著录 `dd` stays `0.82rem` / `400` / `1.45`. Do not make either smaller.
- The only type-size change is `.record-text .fold summary` from `0.84rem` to `0.78rem`. The only `.props` row-gap change is `0.14rem` to `0.32rem`.
- `.c-work` stays `1rem` / `600`. `.c-artist` stays `0.84rem` / `400` / `1.4` (inherited from `.c-meta`). `.fold-body` stays `0.84rem`. `.detail-text` stays `0.78rem`. Status badge stays `0.75rem` / `500` / `1.35`.
- List rows are navigate-only. The whole `a.catalog-item` is the link. `href` stays `/records/${record.id}/`.
- `story` strings and `storyParagraphs()` stay as they are. Do not edit `src/data/records.json` order or prose.
- Dark theme keeps the existing dark token block. Measurements are the same in both themes. Do not add theme-specific copies of these rules.
- `html { font-size: 112.5% }` stays, so at a `16px` initial size `1rem` = `18px`. Do not change it.
- At `font-size: 112.5%` and a `16px` initial size, summary line box = `0.78 × 1.4 × 18px` = `19.656px`. `padding-block: 0.68rem` adds `2 × 0.68 × 18px` = `24.48px`. Sum = `44.136px`, so `min-height: 44px` does not add a second gap. Keep `min-height: 44px`.
- Longest `dt` is 内圈刻字 (4 characters). `5.5em` on `.props` is `5.5 × 0.82rem` = `4.51rem`. Four characters at `0.75rem` are `3rem`. `3rem < 4.51rem`, so the column stays `5.5em`.
- Out of scope: rewriting `story` or `storyParagraphs()`; reordering `records.json`; sorting filter dropdowns; moving 著录 into the left column; a second typeface; an elevated panel, shadow, or radius on `.record-story`; a left wine rail; card-lift hover (`transform` other than `none`, shadow other than `none`); rendering `record.pressing` on the list; previous/next, related pressings, per-record OG images; editing `--bg`, `--accent`, or `--link`.

---

## File structure

| File | Responsibility |
|---|---|
| `src/data/records.ts` | Decade regex, cover-file assert inside `parseRecords`, `catalogTime`, `sortRecords`, sorted `records` export. `uniqueValues` stays `localeCompare` `zh-CN`. |
| `src/data/records.json` | No edit. Editorial order stays the file order. |
| `src/pages/records/[id].astro` | Remove the 著录 `h2`. Add `aria-label="著录"` on `dl.props`. Do not sort. Do not change story or fold markup. |
| `src/pages/records.astro` | Cover image and `.c-text` wrapper. Time token `record.year ?? record.decade`. No `.sort(`. Inline filter script stays `item.hidden` only. |
| `src/styles/global.css` | Plane, props, fold summary, cover|text grid. Tokens, `.detail-text`, link cards, and badge colors stay. |
| `src/pages/records/[id].astro` `getStaticPaths` | Already maps `records`. Do not sort again. |

Line numbers below are from `main` at `f759eaf` before this plan’s edits. Match the quoted source, not a drifted line number.

---

### Task 1: Chronological catalog order

**Files:**
- Modify: `src/data/records.ts:53` (decade schema)
- Modify: `src/data/records.ts:158-170` (`parseRecords` cover assert)
- Modify: `src/data/records.ts:307-308` (replace the sort comment and `records` export)
- Test: ephemeral `/tmp/check-catalog-order.mjs` (do not commit)

**Interfaces:**
- Consumes: `VinylRecord`, `parseRecords`, `assertPublicFile`, `recordsJson`. `year` is optional `number`. `decade` is required. `id` matches `^[a-z0-9]+$`.
- Produces: `export function catalogTime(record: VinylRecord): number`. `export function sortRecords(list: readonly VinylRecord[]): VinylRecord[]` (new array; input not mutated). `export const records` is `sortRecords(parseRecords(recordsJson))`. Later tasks import `records` and do not sort.

- [ ] **Step 1: Install dependencies if `zod` is missing**

Run: `test -d node_modules/zod || npm install`  
Expected: exit code 0, and `node_modules/zod` exists.

- [ ] **Step 2: Write the failing order script and run it**

Save this file exactly. It is not part of the repo.

```bash
cat > /tmp/check-catalog-order.mjs << 'ENDSCRIPT'
import { existsSync, readFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const cover = join(root, 'public/records/ml4001/cover.webp');
const parked = join(root, 'public/records/ml4001/cover.webp.bak-plan-check');
if (existsSync(parked) && !existsSync(cover)) renameSync(parked, cover);

const recordsJson = JSON.parse(readFileSync(join(root, 'src/data/records.json'), 'utf8'));
const mod = await import(pathToFileURL(join(root, 'src/data/records.ts')).href);
if (typeof mod.catalogTime !== 'function' || typeof mod.sortRecords !== 'function') {
	console.error('missing export catalogTime');
	process.exit(1);
}
const { catalogTime, parseRecords, records, sortRecords } = mod;

const jsonOrder = ['ml4001', 'mg50370', 'falp381', 'mhjl329', 'll912', 'd37779', 'lpbr6083'];
const catalogOrder = ['ml4001', 'falp381', 'll912', 'lpbr6083', 'mg50370', 'd37779', 'mhjl329'];
let failed = false;

function assert(condition, message) {
	if (!condition) {
		console.error(message);
		failed = true;
	}
}

try {
	assert(recordsJson.map((record) => record.id).join(',') === jsonOrder.join(','), 'records.json order changed');
	console.log(records.map((record) => record.id).join(','));
	assert(records.map((record) => record.id).join(',') === catalogOrder.join(','), 'records export is not earliest → latest');

	const source = readFileSync(join(root, 'src/data/records.ts'), 'utf8');
	const fnStart = source.indexOf('export function sortRecords');
	const fnEnd = source.indexOf('export const records');
	const fn = source.slice(fnStart, fnEnd);
	assert(fn.includes('a.id < b.id') && fn.includes('a.id > b.id'), 'tie-break must use UTF-16 < and >');
	assert(!fn.includes('localeCompare'), 'sortRecords must not call localeCompare');
	assert(source.includes("z.string().regex(/^(?:18|19|20)\\d{2}s$/)"), 'decade regex missing');
	assert(source.includes('assertPublicFile(`/records/${record.id}/cover.webp`)'), 'cover assert missing');

	assert(catalogTime({ id: 'ml4001', decade: '1940s' }) === 1940, '1940s → 1940');
	assert(catalogTime({ id: 'zz', decade: '1950s', year: 1956 }) === 1956, 'year wins');
	try {
		catalogTime({ id: 'x', decade: '1950' });
		assert(false, 'catalogTime should throw');
	} catch (error) {
		assert(error.message === 'decade 无法作为排序年份：x 1950', `throw message: ${error.message}`);
	}

	const parsed = parseRecords(recordsJson);
	const before = parsed.map((record) => record.id).join(',');
	const sorted = sortRecords(parsed);
	assert(sorted !== parsed, 'sortRecords returned the same array');
	assert(parsed.map((record) => record.id).join(',') === before, 'sortRecords mutated parseRecords output');
	assert(before === jsonOrder.join(','), `parseRecords order ${before}`);
	assert(sorted.map((record) => record.id).join(',') === catalogOrder.join(','), 'sortRecords order');

	const crossed = structuredClone(recordsJson);
	crossed[0] = { ...crossed[0], year: 1956 };
	const crossedParsed = parseRecords(crossed);
	assert(catalogTime(crossedParsed[0]) === 1956, 'year outside decade must still parse and sort at year');

	const eighteenth = structuredClone(recordsJson);
	eighteenth[0] = { ...eighteenth[0], decade: '1840s' };
	assert(catalogTime(parseRecords(eighteenth)[0]) === 1840, '1840s should parse');

	for (const decade of ['1950', '50s', '2100s', '1790s', '1890S']) {
		const bad = structuredClone(recordsJson);
		bad[0] = { ...bad[0], decade };
		let threw = false;
		try {
			parseRecords(bad);
		} catch (error) {
			threw = String(error.message).includes('校验失败');
		}
		assert(threw, `decade ${decade} should fail parsing`);
	}

	const aa = { id: 'aa', decade: '1950s' };
	const mid = { id: 'mid', decade: '1950s', year: 1951 };
	const zz = { id: 'zz', decade: '1950s', year: 1956 };
	const letters = sortRecords([
		{ id: 'b', decade: '1950s' },
		{ id: 'a', decade: '1950s' },
	]).map((record) => record.id);
	assert(letters.join(',') === 'a,b', `letter tie-break ${letters.join(',')}`);
	const extra = sortRecords([...records, aa, mid, zz]).map((record) => record.id);
	const at = (id) => extra.indexOf(id);
	assert(at('aa') !== -1 && at('aa') < at('falp381'), `aa before falp381: ${extra.join(',')}`);
	assert(at('ll912') < at('mid') && at('mid') < at('zz') && at('zz') < at('lpbr6083'), `1950 < 1951 < 1956 < 1960: ${extra.join(',')}`);

	renameSync(cover, parked);
	try {
		let missing = false;
		try {
			parseRecords(recordsJson);
		} catch (error) {
			missing = String(error.message).includes('找不到图片 /records/ml4001/cover.webp');
		}
		assert(missing, 'missing cover.webp should fail parseRecords');
	} finally {
		if (existsSync(parked)) renameSync(parked, cover);
	}
} finally {
	if (existsSync(parked) && !existsSync(cover)) renameSync(parked, cover);
}

assert(existsSync(cover) && !existsSync(parked), 'cover.webp was not restored');
if (failed) process.exit(1);
console.log('catalog-order: ok');
ENDSCRIPT
node --experimental-strip-types /tmp/check-catalog-order.mjs
```

Run that from the repository root.

Expected: exit code 1. The message is `missing export catalogTime`. `public/records/ml4001/cover.webp` still exists. `public/records/ml4001/cover.webp.bak-plan-check` does not exist.

- [ ] **Step 3: Tighten `decade` and assert `cover.webp`**

Replace the decade field:

```ts
	decade: z.string().regex(/^(?:18|19|20)\d{2}s$/),
```

Inside `parseRecords`, assert the cover after the existing image asserts. Hero and detail asserts stay first:

```ts
	for (const record of parsed.data) {
		assertPublicFile(record.image.src);
		for (const detail of record.details) assertPublicFile(detail.image.src);
		assertPublicFile(`/records/${record.id}/cover.webp`);
	}
	return parsed.data;
```

Do not point the cover assert at `record.image.src`. That field is `hero.webp`. The cover path is `/records/${record.id}/cover.webp`.

- [ ] **Step 4: Add `catalogTime`, `sortRecords`, and the sorted export**

Replace the comment and the `records` export at the bottom of `src/data/records.ts` with:

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

Locks:

- Primary key is `year` when it is not `undefined`, numeric ascending. `year` wins even when it disagrees with `decade`. A `year` of `1956` with `decade` `1950s` sorts at `1956`. Do not reject that pair.
- Otherwise the four digits of `decade` (`1980s` → `1980`). `1940s` → `1940`. The trailing `s` is ASCII `s`.
- Decade-only records sort at the first year of the decade, before any `year` in `1951`–`1959`.
- Tie-break is `id` ascending with `<` / `>` (UTF-16 code units), not `localeCompare`. Do not sort on `catalogNumber`.
- `sortRecords` returns a new array. Do not sort `parseRecords`’s array in place.
- Do not add `order` in CSS. Do not call `.sort(` in `src/pages/records.astro` or `src/pages/records/[id].astro`. `getStaticPaths` keeps `records.map` with no sort. `uniqueValues` stays `localeCompare` `zh-CN`.
- Do not edit `src/data/records.json`.

Current file order stays `ml4001`, `mg50370`, `falp381`, `mhjl329`, `ll912`, `d37779`, `lpbr6083`. Exported order is `ml4001`, `falp381`, `ll912`, `lpbr6083`, `mg50370`, `d37779`, `mhjl329`.

- [ ] **Step 5: Run the order script again**

Run: `node --experimental-strip-types /tmp/check-catalog-order.mjs`  
Expected: exit code 0, and this exact output:

```text
ml4001,falp381,ll912,lpbr6083,mg50370,d37779,mhjl329
catalog-order: ok
```

`public/records/ml4001/cover.webp` exists. `cover.webp.bak-plan-check` does not.

- [ ] **Step 6: Typecheck and confirm the JSON file is untouched**

Run:

```bash
npm run check
git diff --exit-code -- src/data/records.json
git diff -U0 -G 'function storyParagraphs|function splitLeadSentence' -- src/data/records.ts
```

Expected: `npm run check` exits 0. Both `git diff` commands exit 0 with no output.

- [ ] **Step 7: Commit**

```bash
git add src/data/records.ts
git commit -m "feat(records): sort the catalog from earliest to latest"
```

---

### Task 2: 记述 plane

**Files:**
- Modify: `src/styles/global.css:922-934` (`.record-story`)
- Modify: `src/styles/global.css:1204-1212` (`@media (max-width: 47.99rem)`)
- Test: Python checker below, then `npm run check`

**Interfaces:**
- Consumes: existing `div.record-story` with `lang="zh-Hans"` and `strong.record-story-lead` from `storyParagraphs()`. Do not change that markup in this task.
- Produces: used `padding-top` of `1rem` at `>= 48rem` and `0.7rem` below `48rem`; `border-top: 1px solid var(--line)`; `margin: 0 0 1.6rem`.

- [ ] **Step 1: Run the plane checker and confirm it fails**

```bash
python3 - << 'PY'
import pathlib
import sys

text = pathlib.Path("src/styles/global.css").read_text()
start = text.index(".record-story {")
end = text.index(".record-story p {")
block = text[start:end]
required = [
    "max-width: 34em;",
    "margin: 0 0 1.6rem;",
    "padding: 1rem 0 0;",
    "border: 0;",
    "border-top: 1px solid var(--line);",
    "border-radius: 0;",
    "background: transparent;",
    "box-shadow: none;",
    "color: var(--text);",
    "font-size: 1rem;",
    "font-weight: 400;",
    "line-height: 1.5;",
    "letter-spacing: 0.1px;",
    "text-autospace: normal;",
    "text-spacing-trim: normal;",
    "line-break: strict;",
    "text-wrap: pretty;",
]
missing = [item for item in required if item not in block]
if "margin-top:" in block:
    missing.append("unexpected margin-top (use the margin shorthand)")
if block.find("border: 0;") > block.find("border-top:"):
    missing.append("border: 0 must come before border-top")
media = text[text.index("@media (max-width: 47.99rem)"):]
if "padding-top: 0.7rem;" not in media:
    missing.append("padding-top: 0.7rem")
if missing:
    print("missing:", ", ".join(missing))
    sys.exit(1)
print("record-story: ok")
PY
```

Expected: exit code 1, and the message includes `padding: 1rem 0 0;` and `padding-top: 0.7rem`.

- [ ] **Step 2: Replace the base `.record-story` rule**

Replace the current `.record-story` block with this. `font-size` stays `1rem`. Do not use a smaller size.

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

`margin: 0 0 1.6rem` is `margin-top: 0` and `margin-bottom: 1.6rem`. The space above the rule is only `.record-tombstone-meta`’s `margin-bottom` (`1rem` at `>= 48rem`). Do not add `margin-top`. `border: 0` then `border-top` makes `border-left-width` `0`. No fill, shadow, radius, or left rail.

Leave the next rules byte-for-byte, including the comment:

```css
.record-story p {
	margin: 0;
}

.record-story p + p {
	margin-top: 1em;
}

/* Opening sentence only. Same size and leading as the body. */
.record-story-lead {
	font-weight: 600;
}

@supports not (text-spacing-trim: normal) {
	.record-story {
		font-feature-settings: "halt" 1;
	}
}
```

`1em` on `p + p` is the paragraph’s own em (`1rem`). The lead inherits `1rem` / `1.5` / `0.1px`. Do not add a rule for `.record-story p:first-child`.

- [ ] **Step 3: Add mobile `padding-top` without moving the meta margin**

`.record-tombstone-meta` already has `margin: 0 0 1rem` (desktop `margin-bottom: 1rem`). Leave that declaration. Its used weight stays `400` because the rule does not set a heavier weight. Do not add `font-weight` and do not change `0.84rem` / `1.4` / `gap: 0.2rem 0.15rem`.

Leave these rules byte-for-byte:

```css
.record-split {
	display: grid;
	gap: 1.5rem 2rem;
}

@media (min-width: 48rem) {
	.record-split {
		grid-template-columns: minmax(0, 0.95fr) minmax(0, 1.15fr);
		align-items: start;
	}

	.record-object {
		position: sticky;
		top: 1rem;
		max-height: calc(100vh - 2rem);
		overflow-y: auto;
	}
}

.record-tombstone h1 {
	margin: 0 0 0.22rem;
	font-size: 1.2rem;
	font-weight: 600;
	line-height: 1.28;
	letter-spacing: -0.01em;
}

.record-tombstone-meta {
	margin: 0 0 1rem;
	color: var(--muted);
	font-size: 0.84rem;
	line-height: 1.4;
	display: flex;
	flex-wrap: wrap;
	align-items: baseline;
	gap: 0.2rem 0.15rem;
}
```

Replace the small-screen block with:

```css
@media (max-width: 47.99rem) {
	.record-story {
		max-width: none;
		padding-top: 0.7rem;
	}

	.record-tombstone-meta {
		margin-bottom: 0.7rem;
	}
}
```

Below `48rem` the meta margin is `0.7rem` and `padding-top` is `0.7rem`, so the hairline stays centered. `margin-bottom: 1.6rem` on `.record-story` stays at every width.

- [ ] **Step 4: Re-run the plane checker**

Run the Python command from Step 1.  
Expected: exit code 0 and `record-story: ok`.

- [ ] **Step 5: Confirm the lead rules and the ban on a first-child size**

Run:

```bash
python3 - << 'PY'
import pathlib, sys
text = pathlib.Path("src/styles/global.css").read_text()
for snippet in [
    ".record-story p + p {\n\tmargin-top: 1em;",
    ".record-story-lead {\n\tfont-weight: 600;",
    'font-feature-settings: "halt" 1;',
    "margin: 0 0 1rem;",
    "margin-bottom: 0.7rem;",
]:
    if snippet not in text:
        sys.exit(f"missing {snippet!r}")
if ".record-story p:first-child" in text:
    sys.exit("p:first-child rule is forbidden")
print("story-keep: ok")
PY
npm run check
```

Expected: `story-keep: ok`, then `npm run check` exits 0.

- [ ] **Step 6: Commit**

```bash
git add src/styles/global.css
git commit -m "feat(records): separate 记述 with a hairline plane"
```

---

### Task 3: 著录 without a visible heading

**Files:**
- Modify: `src/pages/records/[id].astro:88-89`
- Modify: `src/styles/global.css:898-920` (`.props`, `.props dt`, `.props dd`)
- Modify: `src/styles/global.css:1196-1202` (delete `.record-props-label`)
- Test: Python checker below, then `npm run check`

**Interfaces:**
- Consumes: the same `dt` / `dd` pairs, `showMatrix`, `showPressing`, and `record.year !== undefined`. Labels stay 艺人, 作曲家, 作品, 厂牌, 目录号, 内圈刻字, 压片, 录音, 品相, 均衡, 状态, 年份.
- Produces: `<dl class="props" aria-label="著录">`. No `.record-props-label`. `.props` `row-gap: 0.32rem`, `align-items: baseline`, `margin: 0`. `dt` `0.75rem`. `dd` `0.82rem` and `color: var(--text)`.

- [ ] **Step 1: Run the 著录 checker and confirm it fails**

```bash
python3 - << 'PY'
import pathlib, sys
css = pathlib.Path("src/styles/global.css").read_text()
page = pathlib.Path("src/pages/records/[id].astro").read_text()
start = css.index(".props {")
end = css.index(".record-story {")
block = css[start:end]
required = [
    "grid-template-columns: 5.5em 1fr;",
    "column-gap: 0.75rem;",
    "row-gap: 0.32rem;",
    "align-items: baseline;",
    "margin: 0;",
    "font-size: 0.82rem;",
    "font-weight: 400;",
    "line-height: 1.45;",
    "font-size: 0.75rem;",
    "line-height: 1.4;",
    "letter-spacing: 0;",
    "text-align: start;",
    "text-transform: none;",
    "white-space: nowrap;",
    "color: var(--text);",
    "min-width: 0;",
    "overflow-wrap: break-word;",
]
missing = [item for item in required if item not in block]
if ".record-props-label" in css:
    missing.append("delete .record-props-label")
if 'aria-label="著录"' not in page:
    missing.append('aria-label="著录"')
if "record-props-label" in page:
    missing.append("h2.record-props-label still in the page")
if missing:
    print("missing:", ", ".join(missing))
    sys.exit(1)
print("props: ok")
PY
```

Expected: exit code 1. The message includes `row-gap: 0.32rem` and `aria-label="著录"`.

- [ ] **Step 2: Remove the heading and name the list**

Delete this line from `src/pages/records/[id].astro`:

```astro
				<h2 class="record-props-label">著录</h2>
```

The `dl` becomes:

```astro
				<dl class="props" aria-label="著录">
					<dt>艺人</dt>
					<dd>{record.artist}</dd>
					<dt>作曲家</dt>
					<dd>{record.composer}</dd>
					<dt>作品</dt>
					<dd>{record.work}</dd>
					<dt>厂牌</dt>
					<dd>{record.label}</dd>
					<dt>目录号</dt>
					<dd>{record.catalogNumber}</dd>
					{
						showMatrix(record) && record.matrix && (
							<>
								<dt>内圈刻字</dt>
								<dd>{record.matrix}</dd>
							</>
						)
					}
					{
						showPressing(record) && record.pressing && (
							<>
								<dt>压片</dt>
								<dd>{record.pressing}</dd>
							</>
						)
					}
					<dt>录音</dt>
					<dd>{record.recording}</dd>
					<dt>品相</dt>
					<dd>{record.condition}</dd>
					<dt>均衡</dt>
					<dd>{record.eq}</dd>
					<dt>状态</dt>
					<dd>{record.status}</dd>
					{
						record.year !== undefined && (
							<>
								<dt>年份</dt>
								<dd>{record.year}</dd>
							</>
						)
					}
				</dl>
```

Do not add a visually hidden heading. Do not paint 著录. Do not change the story `div` above the list. The gap above the `dl` is the story’s `margin-bottom: 1.6rem` because `.props` `margin` is `0`.

- [ ] **Step 3: Replace `.props`, `.props dt`, and `.props dd`**

`dt` stays `0.75rem`. `dd` stays `0.82rem`. Do not pick a smaller size. Replace the three rules with:

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

Labels stay left-aligned. Do not set `letter-spacing` above `0` or `text-transform: uppercase`. A wrapping `dd` aligns its first baseline with the `dt` (`align-items: baseline`).

Delete the whole `.record-props-label` rule:

```css
.record-props-label {
	margin: 0.35rem 0 0.18rem;
	color: var(--muted);
	font-size: 0.72rem;
	font-weight: 500;
	line-height: 1.3;
}
```

- [ ] **Step 4: Re-run the 著录 checker and typecheck**

Run the Python command from Step 1, then `npm run check`.  
Expected: `props: ok`, then `npm run check` exits 0.

- [ ] **Step 5: Commit**

```bash
git add src/pages/records/\[id\].astro src/styles/global.css
git commit -m "feat(records): name 著录 on the definition list"
```

---

### Task 4: Native fold summaries

**Files:**
- Modify: `src/styles/global.css:993-1030` (`.record-text .fold` through `.fold-body`)
- Test: Python checker below, then `npm run check`

**Interfaces:**
- Consumes: three `<details class="fold">` elements in `src/pages/records/[id].astro`, in order 出处, 证据核对, 待补拍. None has `open`. Do not edit that markup.
- Produces: summary `0.78rem` / `500` / `1.4` / `var(--muted)`, `padding: 0.68rem 0`, no `display` declaration, UA `list-item` marker kept. `.fold-body` stays `0.84rem` / `400` / `1.5` / `var(--muted)`.

- [ ] **Step 1: Run the fold checker and confirm it fails**

```bash
python3 - << 'PY'
import pathlib, sys
text = pathlib.Path("src/styles/global.css").read_text()
start = text.index(".record-text .fold summary {")
end = text.index("}", start)
block = text[start:end]
required = [
    "cursor: pointer;",
    "min-height: 44px;",
    "padding: 0.68rem 0;",
    "list-style-position: inside;",
    "color: var(--muted);",
    "font-weight: 500;",
    "font-size: 0.78rem;",
    "line-height: 1.4;",
    "overflow-wrap: break-word;",
]
missing = [item for item in required if item not in block]
if "display" in block:
    missing.append("summary must not set display")
if "list-style: none" in block:
    missing.append("summary must not set list-style: none")
if "summary::-webkit-details-marker" in text or "summary::marker" in text:
    missing.append("do not hide the marker")
fold = text[text.index(".record-text .fold {"):text.index(".record-text .fold:last-child")]
for item in ["border-radius: 0;", "box-shadow: none;", "margin-top: 0.35rem;", "border-top: 1px solid var(--line);", "background: transparent;"]:
    if item not in fold:
        missing.append(item)
body_at = text.find("padding: 0 0 0.6rem;")
body = text[body_at:body_at + 180] if body_at != -1 else ""
if "font-weight: 400;" not in body or "font-size: 0.84rem;" not in body:
    missing.append("fold-body 0.84rem / 400")
if missing:
    print("missing:", ", ".join(missing))
    sys.exit(1)
print("folds: ok")
PY
```

Expected: exit code 1. The message includes `font-size: 0.78rem` and `summary must not set display` (the current rule sets `display: flex`).

- [ ] **Step 2: Replace the fold block**

Do not edit `.detail-text`. It already matches the lock. Leave it:

```css
.detail-text {
	margin: 0.16rem 0 0;
	color: var(--muted);
	font-size: 0.78rem;
	font-weight: 400;
	line-height: 1.45;
}
```

Leave the shared `white-space: pre-line` rule:

```css
.detail-text,
.fold-body {
	white-space: pre-line;
}
```

Leave the link-card rules. `list-style: none` on `ul.link-cards` stays. That ban applies only to `summary`:

```css
.link-cards {
	list-style: none;
	padding: 0;
	margin: 0.4rem 0 0;
	display: grid;
	gap: 0.5rem;
}

.record-text .fold > .link-cards {
	margin: 0;
	padding-bottom: 0.7rem;
}

.link-cards a {
	display: flex;
	flex-direction: column;
	justify-content: center;
	min-height: 44px;
	padding: 0.45rem 0.7rem;
	border: 1px solid var(--line);
	background: var(--bg-elevated);
	color: inherit;
	text-decoration: none;
}

.link-cards a:hover {
	border-color: var(--accent);
}

.link-site {
	color: var(--muted);
	font-size: 0.8rem;
}
```

Replace `.record-text .fold` through `.fold-body` with:

```css
.record-text .fold {
	margin-top: 0.35rem;
	border: 0;
	border-top: 1px solid var(--line);
	border-radius: 0;
	background: transparent;
	box-shadow: none;
}

.record-text .fold:last-child {
	border-bottom: 1px solid var(--line);
}

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

.record-text .fold[open] summary {
	border-bottom: 0;
}

.fold-lead {
	color: var(--muted);
	font-weight: 400;
}

.fold-body {
	margin: 0;
	padding: 0 0 0.6rem;
	font-size: 0.84rem;
	font-weight: 400;
	line-height: 1.5;
	color: var(--muted);
}
```

`padding: 0.68rem 0` is the delta’s `padding-block: 0.68rem` (inline padding `0`). Delete `display: flex` and `align-items: center`. Do not set `display`. Do not set `list-style: none` on the summary. Do not hide `summary::-webkit-details-marker` or `summary::marker`. The UA `list-item` marker stays, so the disclosure triangle stays visible.

`.fold-lead` stays `color: var(--muted)` and `font-weight: 400`. Do not set `font-size` on it. It inherits `0.78rem` from the summary. `.fold-body` stays `0.84rem`. The new `font-weight: 400` records the lock; it is not a size change.

Do not add `open` to any `<details class="fold">`. Order stays 出处, 证据核对, 待补拍.

- [ ] **Step 3: Re-run the fold checker and typecheck**

Run the Python command from Step 1, then `npm run check`.  
Expected: `folds: ok`, then `npm run check` exits 0.

- [ ] **Step 4: Commit**

```bash
git add src/styles/global.css
git commit -m "feat(records): quiet the fold summary to 0.78rem"
```

---

### Task 5: Cover | text list rows

**Files:**
- Modify: `src/pages/records.astro:169-201` (the `records.map` anchor only)
- Modify: `src/styles/global.css:697-793` (replace through `a.catalog-item:hover`)
- Modify: `src/styles/global.css:1032-1132` (delete both catalog media queries)
- Test: Python checker below, then `npm run check` and `npm run build`

**Interfaces:**
- Consumes: sorted `records` from Task 1. `badgeClass` from `src/data/records.ts`. Existing `data-record`, `data-status`, `data-composer`, `data-artist`, `data-label`, `data-decade`, `data-search`, and `id={record.id}` on the anchor. The inline script’s `item.hidden = !match`.
- Produces: `img.c-cover` then `span.c-text` inside every `a.catalog-item`. CSS grid `6rem minmax(0, 1fr)` at widths above `40rem`, and `4.75rem minmax(0, 1fr)` at `max-width: 40rem`. No four-column grid. No `@media (max-width: 64rem)`.

- [ ] **Step 1: Run the list checker and confirm it fails**

```bash
python3 - << 'PY'
import pathlib, sys
css = pathlib.Path("src/styles/global.css").read_text()
page = pathlib.Path("src/pages/records.astro").read_text()
missing = []
for item in [
    "grid-template-columns: 6rem minmax(0, 1fr);",
    "column-gap: 0.85rem;",
    "width: 6rem;",
    "height: 6rem;",
    "object-fit: cover;",
    "grid-template-columns: 4.75rem minmax(0, 1fr);",
    "column-gap: 0.7rem;",
    "width: 4.75rem;",
    "height: 4.75rem;",
    "padding: 0.7rem 0;",
    "align-items: start;",
    "font-size: 1rem;",
    "font-weight: 600;",
    "line-height: 1.32;",
    "margin-top: 0.14rem;",
    "margin-top: 0.28rem;",
    "margin-top: 0.08rem;",
    "gap: 0.04rem;",
    "margin-top: 0.02rem;",
    "column-gap: 0.65rem;",
    "column-gap: 0.35rem;",
    "font-size: 0.78rem;",
    "font-size: 0.84rem;",
    "overflow-x: visible;",
    "border-top: 1px solid var(--line);",
]:
    if item not in css:
        missing.append(item)
if "@media (max-width: 64rem)" in css:
    missing.append("delete @media (max-width: 64rem)")
if "grid-column: 3;" in css or "grid-column: 4;" in css:
    missing.append("delete unscoped grid-column 3 and 4")
if "minmax(7rem, 0.9fr)" in css:
    missing.append("delete the four-column template")
if css.count("@media (max-width: 40rem)") != 1:
    missing.append("exactly one @media (max-width: 40rem)")
if 'class="c-cover"' not in page or 'class="c-text"' not in page:
    missing.append("cover and c-text markup")
if "record.year ?? record.decade" not in page:
    missing.append("time token")
if ".sort(" in page:
    missing.append("records.astro must not sort")
if "hero.webp" in page or "fetchpriority" in page:
    missing.append("list must not use hero.webp or fetchpriority")
if "record.pressing" in page:
    missing.append("do not render pressing on the list")
if "row-gap: 0;" not in css:
    missing.append("row-gap: 0")
hover_at = css.find("a.catalog-item:hover {")
hover = css[hover_at:css.find("}", hover_at)] if hover_at != -1 else ""
if "background: var(--bg-elevated);" not in hover or "transform: none;" not in hover or "box-shadow: none;" not in hover:
    missing.append("hover lock")
needle = "grid-template-columns: 4.75rem minmax(0, 1fr);"
if needle in css and css.index(needle) > css.index(".c-status .badge"):
    missing.append("40rem query must sit with the catalog rules, above .c-status .badge")
if missing:
    print("missing:", ", ".join(missing))
    sys.exit(1)
print("list: ok")
PY
```

Expected: exit code 1. The message includes `grid-template-columns: 6rem minmax(0, 1fr);` and `cover and c-text markup`.

- [ ] **Step 2: Wrap each row’s text and add the cover**

Replace the `records.map` callback. Keep every existing attribute, including `id={record.id}` (the hash redirect uses `getElementById`). `data-decade` stays `record.decade` so the decade filter still matches. The visible time token is a different expression: `record.year ?? record.decade`. No current record sets `year`, so the visible text stays `1940s`, `1950s`, and so on. Do not print the sort key `1940`.

```astro
							{
								records.map((record) => (
									<a
										class="catalog-item"
										id={record.id}
										href={`/records/${record.id}/`}
										data-record
										data-status={statusBucket(record.status)}
										data-composer={record.composer}
										data-artist={record.artist}
										data-label={record.label}
										data-decade={record.decade}
										data-search={recordSearchText(record)}
									>
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
											<span class="c-status">
												<span class={badgeClass(record.status)}>{record.status}</span>
											</span>
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
								))
							}
```

`width` and `height` are both `96` so the pre-CSS ratio is `1:1`. CSS sets the used size. `alt=""` because the link name is the text in `.c-text`. Do not set `fetchpriority`. Do not use `record.image.src` or `hero.webp`. Do not render `record.pressing`.

Do not edit the `<script is:inline>` block. It may only set `item.hidden`. It must not sort nodes, move nodes, or set `element.style.order`. Keep `.catalog-head` in the DOM. The filter still does `head.hidden = visible === 0`.

Do not add `.sort(` anywhere in `src/pages/records.astro`.

- [ ] **Step 3: Replace the catalog rules and delete the old breakpoints**

Delete the rules from `.catalog {` through `a.catalog-item:hover` (the block that currently ends just before `.c-status .badge`). That removes the shared four-column grid, the unscoped `.c-work { grid-column: 3; }`, the unscoped `.c-meta { grid-column: 4; }`, `.c-sub { display: contents }`, and the `::before` middots.

Put this block in their place. Do not reintroduce `grid-column: 3` or `grid-column: 4`.

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

`align-items: start` lines the cover’s top edge up with the top of `.c-text`. The cover is not vertically centered and not aligned to `.c-work`. `6rem` is the lock inside `5.5–6.5rem`. `4.75rem` is the lock inside `4.5–5rem`, used only in `max-width: 40rem`. `40rem` = `640px` at the initial `16px`, so a `390px` viewport uses the small cover. Above `40rem`, including above `64rem`, catalog number and status share the first text line. At `max-width: 40rem`, status moves to the next line at the start edge, then the title, then the meta. The cover stays on the left. The row never stacks the cover above the text.

`.c-work` stays `1rem` / `600` at every width, including inside the `40rem` query (that query does not set `font-size`). `.c-artist` does not set `font-size`; it inherits `0.84rem` / `400` / `1.4` / `var(--muted)` from `.c-meta`. Do not clamp, ellipsize, or set `white-space: nowrap` on `.c-artist`.

Do not set the `order` property on `.catalog-item`.

Leave the badge rules byte-for-byte. They are the status-badge lock (`0.75rem` / `500` / `1.35`, `padding: 0.02rem 0.35rem`):

```css
.c-status .badge {
	max-width: 100%;
	padding: 0.02rem 0.35rem;
	font-size: 0.75rem;
	font-weight: 500;
	line-height: 1.35;
	white-space: normal;
}
```

Leave `.badge-verified`, `.badge-partial`, and `.badge-pending` as they are.

Do not edit the global image rule. `a.catalog-item .c-cover` wins on `width` and `height`. `max-width: 100%` does not shrink a `6rem` cover inside the `6rem` column.

```css
img,
svg,
video {
	max-width: 100%;
	height: auto;
}
```

Delete the whole `@media (max-width: 64rem)` block (it only contains catalog rules) and the old `@media (max-width: 40rem)` block that currently sits between `.fold-body` and `.record-page`. The only `40rem` query left is the one in the replacement above. The old block to delete is:

```css
@media (max-width: 64rem) {
	.catalog {
		overflow-x: visible;
	}

	.catalog-head {
		display: none;
	}

	a.catalog-item {
		grid-template-columns: minmax(0, 1fr) auto;
		row-gap: 0.08rem;
		align-items: baseline;
		padding: 0.65rem 0.15rem;
	}

	a.catalog-item .c-cat {
		grid-column: 1;
		grid-row: 1;
		justify-self: start;
		font-size: 0.78rem;
		line-height: 1.35;
		color: var(--muted);
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
		font-size: 0.84rem;
		line-height: 1.4;
	}

	a.catalog-item .c-artist {
		display: block;
	}

	a.catalog-item .c-sub {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		column-gap: 0.35rem;
		max-width: 100%;
		font-size: 0.78rem;
		line-height: 1.35;
	}

	a.catalog-item .c-meta .c-label::before,
	a.catalog-item .c-meta .c-decade::before {
		content: none;
		margin: 0;
	}

	a.catalog-item .c-sub .c-label::after {
		content: '·';
		margin-left: 0.35rem;
		color: var(--line);
	}
}

@media (max-width: 40rem) {
	a.catalog-item {
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

After the delete, `.record-page {` still follows `.fold-body`.

- [ ] **Step 4: Re-run the list checker, typecheck, and build**

Run the Python command from Step 1, then:

```bash
npm run check
npm run build
node --experimental-strip-types /tmp/check-catalog-order.mjs
git diff --exit-code -- src/data/records.json
```

Expected: `list: ok`. `npm run check` exits 0. `npm run build` exits 0. The order script prints the seven ids and `catalog-order: ok`. `git diff` exits 0.

- [ ] **Step 5: Commit**

```bash
git add src/pages/records.astro src/styles/global.css
git commit -m "feat(records): put a cover beside each catalog row"
```

---

### Task 6: Acceptance

**Files:**
- Modify: none unless a check fails. Fix the failure in the task that owns the rule and commit `fix(records): …` there. This task has no commit when every check passes.
- Test: spec §7, items 1–13

**Interfaces:**
- Consumes: Tasks 1–5.
- Produces: a passing check, build, order script, source checker, and browser script at `1200px` and `390px`.

- [ ] **Step 1: Re-run the source gates**

Run:

```bash
python3 - << 'PY'
import pathlib, re, sys
css = pathlib.Path("src/styles/global.css").read_text()
page = pathlib.Path("src/pages/records.astro").read_text()
detail = pathlib.Path("src/pages/records/[id].astro").read_text()
data = pathlib.Path("src/data/records.ts").read_text()
missing = []

def need(cond, label):
    if not cond:
        missing.append(label)

story = css[css.index(".record-story {"):css.index(".record-story p {")]
for item in ["padding: 1rem 0 0;", "border: 0;", "border-top: 1px solid var(--line);", "border-radius: 0;", "background: transparent;", "box-shadow: none;", "font-size: 1rem;", "font-weight: 400;", "line-height: 1.5;", "letter-spacing: 0.1px;", "margin: 0 0 1.6rem;", "text-autospace: normal;", "text-spacing-trim: normal;", "line-break: strict;", "text-wrap: pretty;", "max-width: 34em;"]:
    need(item in story, item)
need("padding-top: 0.7rem;" in css[css.index("@media (max-width: 47.99rem)"):], "mobile padding-top")
need("margin: 0 0 1rem;" in css, "desktop tombstone margin")
need(".record-story p:first-child" not in css, "no p:first-child")
need("font-weight: 600;" in css[css.index(".record-story-lead"):css.index(".record-story-lead")+80], "lead 600")
need('font-feature-settings: "halt" 1;' in css, "halt")
need('aria-label="著录"' in detail, "aria-label")
need("record-props-label" not in detail and ".record-props-label" not in css, "no props label")
for label in ["艺人", "作曲家", "作品", "厂牌", "目录号", "内圈刻字", "压片", "录音", "品相", "均衡", "状态", "年份"]:
    need(f"<dt>{label}</dt>" in detail, label)
props = css[css.index(".props {"):css.index(".record-story {")]
for item in ["row-gap: 0.32rem;", "column-gap: 0.75rem;", "grid-template-columns: 5.5em 1fr;", "align-items: baseline;", "margin: 0;", "font-size: 0.75rem;", "font-size: 0.82rem;", "letter-spacing: 0;", "text-align: start;", "text-transform: none;", "white-space: nowrap;", "color: var(--text);", "color: var(--muted);"]:
    need(item in props, "props " + item)
summary = css[css.index(".record-text .fold summary {"):]
summary = summary[:summary.index("}")]
need("font-size: 0.78rem;" in summary and "display" not in summary, "summary 0.78 and no display")
need("padding: 0.68rem 0;" in summary and "font-weight: 500;" in summary, "summary padding and weight")
need("summary::-webkit-details-marker" not in css and "summary::marker" not in css, "marker")
need(detail.count('<details class="fold">') == 3, "three folds")
need(re.search(r'<details class="fold"[^>]*\bopen\b', detail) is None, "folds have no open attribute")
body_at = css.find("padding: 0 0 0.6rem;")
body = css[body_at:body_at + 180] if body_at != -1 else ""
need("font-size: 0.84rem;" in body and "font-weight: 400;" in body, "fold-body 0.84rem / 400")
need("grid-template-columns: 6rem minmax(0, 1fr);" in css, "6rem row")
need("grid-template-columns: 4.75rem minmax(0, 1fr);" in css, "4.75rem row")
need("@media (max-width: 64rem)" not in css, "no 64rem query")
need("grid-column: 3;" not in css and "grid-column: 4;" not in css, "no old columns")
need(not re.search(r"(?m)^\s*order\s*:", css), "no CSS order")
need('class="c-cover"' in page and 'alt=""' in page and 'width="96"' in page and 'height="96"' in page, "cover img")
need("cover.webp" in page and "hero.webp" not in page and ".sort(" not in page, "list source")
need('class="catalog-head"' in page and "item.hidden = !match" in page, "head and hidden")
need("export function catalogTime" in data and "export function sortRecords" in data, "sort exports")
need("--bg: #f3f0e8;" in css and "--link: #7c2d22;" in css and "--accent: #7c2d22;" in css and "--bg-elevated: #faf8f4;" in css, "tokens")
if missing:
    print("missing:", ", ".join(missing))
    sys.exit(1)
print("acceptance-source: ok")
PY
```

Expected: exit code 0 and `acceptance-source: ok`.

```bash
npm run check
```

Expected: exit code 0.

```bash
npm run build
```

Expected: exit code 0.

```bash
node --experimental-strip-types /tmp/check-catalog-order.mjs
```

Expected: exit code 0, the seven ids, and `catalog-order: ok`.

```bash
git diff --exit-code -- src/data/records.json
```

Expected: exit code 0 and no output.

```bash
git diff -U0 -- src/styles/global.css | python3 -c '
import sys
bad = []
for line in sys.stdin:
    if line[:1] not in "+-":
        continue
    body = line[1:]
    if any(token in body for token in ["--bg:", "--bg-elevated:", "--link:", "--accent:", "--line:"]):
        bad.append(line.rstrip())
if bad:
    raise SystemExit("token diff:\n" + "\n".join(bad))
print("tokens-unchanged: ok")
'
```

Expected: `tokens-unchanged: ok`.

- [ ] **Step 2: Preview at 1200px and at 390px**

Run: `npm run preview -- --host 127.0.0.1 --port 4321`  
Open these URLs. Set the layout viewport to `1200×800` first, then repeat at `390×844`. Zoom is `100%` so the root font size is `18px` (`html` is `112.5%` of a `16px` initial size).

- `http://127.0.0.1:4321/records/`
- `http://127.0.0.1:4321/records/mhjl329/`
- `http://127.0.0.1:4321/records/falp381/`

On each page, at each viewport, paste this script in the console. Expected last line: `qa: ok`. Any `FAIL` line is a failure. Fix it before opening the implementation PR.

```javascript
(() => {
	const rootPx = parseFloat(getComputedStyle(document.documentElement).fontSize);
	const failures = [];
	const check = (condition, message) => {
		if (!condition) failures.push(message);
	};
	const near = (actual, expected, message, slack = 0.6) => {
		check(Math.abs(actual - expected) <= slack, `${message}: ${actual} vs ${expected}`);
	};
	check(Math.abs(rootPx - 18) < 0.2, `root font size is ${rootPx}px; use 16px initial and 100% zoom`);
	document.documentElement.setAttribute('data-theme', 'light');
	const vars = getComputedStyle(document.documentElement);
	check(vars.getPropertyValue('--bg').trim() === '#f3f0e8', '--bg');
	check(vars.getPropertyValue('--link').trim() === '#7c2d22', '--link');
	check(vars.getPropertyValue('--accent').trim() === '#7c2d22', '--accent');
	const probe = document.createElement('div');
	probe.style.cssText = 'border-top:1px solid var(--line);color:var(--muted);background:var(--text)';
	document.body.append(probe);
	const probeStyle = getComputedStyle(probe);
	const line = probeStyle.borderTopColor;
	const muted = probeStyle.color;
	probe.style.color = 'var(--text)';
	const text = getComputedStyle(probe).color;
	probe.style.background = 'var(--bg-elevated)';
	const elevated = getComputedStyle(probe).backgroundColor;
	probe.remove();
	const desktop = window.matchMedia('(min-width: 48rem)').matches && !window.matchMedia('(max-width: 40rem)').matches;
	const mobile = window.matchMedia('(max-width: 47.99rem)').matches && window.matchMedia('(max-width: 40rem)').matches;
	check(desktop || mobile, `viewport ${window.innerWidth} is neither 1200-class nor 390-class`);

	function walk(rules, visit) {
		for (const rule of rules) {
			visit(rule);
			if (rule.cssRules) walk(rule.cssRules, visit);
		}
	}
	function walkAll(visit) {
		for (const sheet of document.styleSheets) {
			let rules;
			try { rules = sheet.cssRules; } catch (error) { continue; }
			if (rules) walk(rules, visit);
		}
	}
	walkAll((rule) => {
		if (rule.selectorText === '.record-story p:first-child') {
			const size = rule.style.getPropertyValue('font-size');
			const weight = rule.style.getPropertyValue('font-weight');
			check(!size && !weight, 'p:first-child sets size or weight');
		}
		if (rule.selectorText === 'summary::-webkit-details-marker' || rule.selectorText === 'summary::marker') {
			check(rule.style.getPropertyValue('display') !== 'none', 'marker hidden');
		}
	});

	const path = location.pathname.replace(/\/$/, '');
	if (path === '/records') {
		const head = document.querySelector('.catalog-head');
		check(head && getComputedStyle(head).display === 'none', 'catalog-head display');
		const page = document.querySelector('.catalog-page');
		const sequence = [...page.children].map((node) => `${node.tagName}.${node.className}`);
		check(sequence[0] === 'H1.', `first child ${sequence[0]}`);
		check(sequence[1] === 'P.lede', `second child ${sequence[1]}`);
		check(page.querySelector('h1 + .lede + section .progress-track') !== null, 'progress section');
		check(page.querySelector('.lede ~ section form.filters') !== null, 'filter form');
		check(document.querySelector('#catalog-heading').textContent.includes('目录'), '目录 heading');
		const items = [...document.querySelectorAll('a.catalog-item')];
		check(items.map((item) => item.id).join(',') === 'ml4001,falp381,ll912,lpbr6083,mg50370,d37779,mhjl329', 'DOM order');
		const expectedCover = desktop ? 6 * rootPx : 4.75 * rootPx;
		const expectedGap = desktop ? 0.85 * rootPx : 0.7 * rootPx;
		for (const item of items) {
			const style = getComputedStyle(item);
			const columns = style.gridTemplateColumns.split(' ').map((part) => parseFloat(part));
			near(columns[0], expectedCover, `${item.id} first track`, 1);
			check(style.alignItems === 'start', `${item.id} align-items`);
			near(parseFloat(style.columnGap), expectedGap, `${item.id} column-gap`, 1);
			check(style.rowGap === '0px', `${item.id} row-gap ${style.rowGap}`);
			near(parseFloat(style.minHeight), 44, `${item.id} min-height`, 0.6);
			near(parseFloat(style.paddingTop), 0.7 * rootPx, `${item.id} padding-top`, 1);
			check(style.paddingLeft === '0px' && style.paddingRight === '0px', `${item.id} padding inline`);
			check(style.borderBottomWidth === '1px' && style.borderBottomStyle === 'solid' && style.borderBottomColor === line, `${item.id} border-bottom`);
			check(style.borderTopWidth === '0px', `${item.id} border-top`);
			check(style.backgroundColor === 'rgba(0, 0, 0, 0)' || style.backgroundColor === 'transparent', `${item.id} background`);
			check(style.boxShadow === 'none' && style.transform === 'none', `${item.id} no lift`);
			const cover = item.querySelector('img.c-cover');
			const text = item.querySelector('.c-text');
			const coverStyle = getComputedStyle(cover);
			near(cover.getBoundingClientRect().width, expectedCover, `${item.id} cover width`, 1);
			near(cover.getBoundingClientRect().height, expectedCover, `${item.id} cover height`, 1);
			check(coverStyle.objectFit === 'cover', `${item.id} object-fit`);
			check(coverStyle.borderTopWidth === '0px' && coverStyle.boxShadow === 'none', `${item.id} cover chrome`);
			check(cover.getAttribute('alt') === '', `${item.id} alt`);
			check(cover.getAttribute('src') === `/records/${item.id}/cover.webp`, `${item.id} src`);
			check(!cover.getAttribute('src').includes('hero.webp'), `${item.id} hero`);
			check(!cover.hasAttribute('fetchpriority'), `${item.id} fetchpriority`);
			const coverBox = cover.getBoundingClientRect();
			const textBox = text.getBoundingClientRect();
			check(Math.abs(coverBox.top - textBox.top) <= 1, `${item.id} tops`);
			check(coverBox.right < textBox.left, `${item.id} cover is left of text`);
			const work = text.querySelector('.c-work');
			const workStyle = getComputedStyle(work);
			near(parseFloat(workStyle.fontSize), rootPx, `${item.id} work size`, 0.6);
			check(workStyle.fontWeight === '600', `${item.id} work weight`);
			near(parseFloat(workStyle.lineHeight) / parseFloat(workStyle.fontSize), 1.32, `${item.id} work line-height`, 0.02);
			const cat = text.querySelector('.c-cat');
			const catStyle = getComputedStyle(cat);
			near(parseFloat(catStyle.fontSize), 0.78 * rootPx, `${item.id} cat size`);
			check(catStyle.fontWeight === '400' && catStyle.color === muted, `${item.id} cat weight`);
			const artistStyle = getComputedStyle(text.querySelector('.c-artist'));
			near(parseFloat(artistStyle.fontSize), 0.84 * rootPx, `${item.id} artist size`);
			check(artistStyle.fontWeight === '400' && artistStyle.color === muted, `${item.id} artist weight`);
			const subStyle = getComputedStyle(text.querySelector('.c-sub'));
			near(parseFloat(subStyle.fontSize), 0.78 * rootPx, `${item.id} sub size`);
			check(subStyle.fontWeight === '400', `${item.id} sub weight`);
			const badgeStyle = getComputedStyle(text.querySelector('.badge'));
			near(parseFloat(badgeStyle.fontSize), 0.75 * rootPx, `${item.id} badge size`);
			check(badgeStyle.fontWeight === '500', `${item.id} badge weight`);
			if (mobile) {
				const status = text.querySelector('.c-status');
				check(Math.abs(status.getBoundingClientRect().left - cat.getBoundingClientRect().left) <= 1, `${item.id} status left`);
				check(status.getBoundingClientRect().top >= cat.getBoundingClientRect().bottom - 1, `${item.id} status below cat`);
				check(Math.abs(work.getBoundingClientRect().left - cat.getBoundingClientRect().left) <= 1, `${item.id} work left`);
			}
		}
		const catalog = document.querySelector('.catalog');
		const catalogStyle = getComputedStyle(catalog);
		check(catalogStyle.borderTopWidth === '1px' && catalogStyle.borderTopColor === line, 'catalog border-top');
		let hoverBackground = '';
		let hoverTransform = '';
		let hoverShadow = '';
		walkAll((rule) => {
			if (rule.selectorText === 'a.catalog-item:hover') {
				hoverBackground = rule.style.getPropertyValue('background');
				hoverTransform = rule.style.getPropertyValue('transform');
				hoverShadow = rule.style.getPropertyValue('box-shadow');
			}
		});
		check(hoverBackground.includes('var(--bg-elevated)'), `hover background ${hoverBackground}`);
		check(hoverTransform === 'none', `hover transform ${hoverTransform}`);
		check(hoverShadow === 'none', `hover shadow ${hoverShadow}`);
		const decade = document.querySelector('#record-decade');
		decade.value = '1950s';
		decade.dispatchEvent(new Event('change', { bubbles: true }));
		const all = [...document.querySelectorAll('a.catalog-item')];
		const visible = all.filter((item) => !item.hidden).map((item) => item.id);
		check(visible.join(',') === 'falp381,ll912', `1950s visible ${visible.join(',')}`);
		check(all[0].id === 'ml4001' && all[0].hidden, 'ml4001 stays first and hidden');
		decade.value = '';
		decade.dispatchEvent(new Event('change', { bubbles: true }));
	} else {
		check(path === '/records/mhjl329' || path === '/records/falp381', path);
		const story = document.querySelector('.record-story');
		const storyStyle = getComputedStyle(story);
		check(storyStyle.borderTopWidth === '1px' && storyStyle.borderTopStyle === 'solid' && storyStyle.borderTopColor === line, 'story border');
		check(storyStyle.borderLeftWidth === '0px', 'story border-left');
		check(storyStyle.borderRadius === '0px' || storyStyle.borderTopLeftRadius === '0px', 'story radius');
		check(storyStyle.backgroundColor === 'rgba(0, 0, 0, 0)' || storyStyle.backgroundColor === 'transparent', 'story background');
		check(storyStyle.boxShadow === 'none', 'story shadow');
		near(parseFloat(storyStyle.paddingTop), (desktop ? 1 : 0.7) * rootPx, 'story padding-top');
		check(storyStyle.marginTop === '0px', 'story margin-top');
		near(parseFloat(storyStyle.marginBottom), 1.6 * rootPx, 'story margin-bottom');
		near(parseFloat(storyStyle.fontSize), rootPx, 'story font-size');
		check(storyStyle.fontWeight === '400', 'story weight');
		near(parseFloat(storyStyle.lineHeight) / parseFloat(storyStyle.fontSize), 1.5, 'story line-height', 0.02);
		near(parseFloat(storyStyle.letterSpacing), 0.1, 'story tracking', 0.05);
		if (desktop) near(parseFloat(storyStyle.maxWidth), 34 * parseFloat(storyStyle.fontSize), 'story max-width', 1);
		else check(storyStyle.maxWidth === 'none', 'story max-width mobile');
		check(story.getAttribute('lang') === 'zh-Hans', 'lang');
		check(getComputedStyle(story).fontFamily === getComputedStyle(document.body).fontFamily, 'story font-family');
		const lead = story.querySelector('.record-story-lead');
		check(getComputedStyle(lead).fontWeight === '600', 'lead weight');
		near(parseFloat(getComputedStyle(lead).fontSize), parseFloat(storyStyle.fontSize), 'lead size');
		const paragraphs = [...story.querySelectorAll('p')];
		check(paragraphs.length >= 2, 'needs two paragraphs');
		near(parseFloat(getComputedStyle(paragraphs[1]).marginTop), parseFloat(getComputedStyle(paragraphs[1]).fontSize), 'p+p margin', 1);
		let declared = {};
		let supportsHalt = false;
		walkAll((rule) => {
			if (rule.selectorText === '.record-story') {
				for (const prop of ['text-autospace', 'text-spacing-trim', 'line-break', 'text-wrap']) {
					const value = rule.style.getPropertyValue(prop);
					if (value) declared[prop] = value;
				}
			}
			if (rule.cssRules && String(rule.conditionText || '').includes('text-spacing-trim')) {
				walk(rule.cssRules, (inner) => {
					if (inner.selectorText === '.record-story' && String(inner.style.getPropertyValue('font-feature-settings')).includes('halt')) {
						supportsHalt = true;
					}
				});
			}
		});
		check(declared['text-autospace'] === 'normal', 'text-autospace');
		check(declared['text-spacing-trim'] === 'normal', 'text-spacing-trim');
		check(declared['line-break'] === 'strict', 'line-break');
		check(declared['text-wrap'] === 'pretty', 'text-wrap');
		check(supportsHalt, '@supports halt');
		check(document.querySelector('.record-props-label') === null, 'props label element');
		check([...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].every((heading) => heading.textContent.trim() !== '著录' && heading.textContent.trim() !== '记述'), 'no 著录 or 记述 heading');
		const dl = document.querySelector('dl.props');
		check(dl.getAttribute('aria-label') === '著录', 'dl name');
		const allowed = ['艺人', '作曲家', '作品', '厂牌', '目录号', '内圈刻字', '压片', '录音', '品相', '均衡', '状态', '年份'];
		const dts = [...dl.querySelectorAll('dt')].map((node) => node.textContent);
		check(dts.every((label) => allowed.includes(label)), `dt ${dts.join(',')}`);
		check(dts[0] === '艺人' && dts[1] === '作曲家' && dts.at(-1) !== '年份', 'dt order and no year on these two records');
		const propsStyle = getComputedStyle(dl);
		near(parseFloat(propsStyle.rowGap), 0.32 * rootPx, 'row-gap', 0.6);
		near(parseFloat(propsStyle.columnGap), 0.75 * rootPx, 'column-gap', 0.6);
		check(propsStyle.alignItems === 'baseline', 'props align');
		check(propsStyle.marginTop === '0px', 'props margin-top');
		near(dl.getBoundingClientRect().top - story.getBoundingClientRect().bottom, 1.6 * rootPx, 'gap above dl', 1);
		const dtStyle = getComputedStyle(dl.querySelector('dt'));
		const ddStyle = getComputedStyle(dl.querySelector('dd'));
		near(parseFloat(dtStyle.fontSize), 0.75 * rootPx, 'dt size');
		check(dtStyle.fontWeight === '400' && dtStyle.color === muted, 'dt weight and color');
		near(parseFloat(dtStyle.lineHeight) / parseFloat(dtStyle.fontSize), 1.4, 'dt line-height', 0.02);
		check(dtStyle.textAlign === 'start' && dtStyle.textTransform === 'none' && dtStyle.whiteSpace === 'nowrap', 'dt alignment');
		near(parseFloat(dtStyle.letterSpacing) || 0, 0, 'dt tracking', 0.05);
		near(parseFloat(ddStyle.fontSize), 0.82 * rootPx, 'dd size');
		check(ddStyle.fontWeight === '400' && ddStyle.color === text, 'dd weight and color');
		near(parseFloat(ddStyle.lineHeight) / parseFloat(ddStyle.fontSize), 1.45, 'dd line-height', 0.02);
		const meta = document.querySelector('.record-tombstone-meta');
		near(parseFloat(getComputedStyle(meta).marginBottom), (desktop ? 1 : 0.7) * rootPx, 'meta margin-bottom');
		const folds = [...document.querySelectorAll('.record-text details.fold')];
		check(folds.length === 3 && folds.every((fold) => !fold.hasAttribute('open')), 'folds closed');
		check(folds[0].querySelector('summary').textContent.trim() === '出处', 'fold 1');
		check(folds[1].querySelector('summary').textContent.trim() === '证据核对', 'fold 2');
		check(folds[2].querySelector('summary').textContent.startsWith('待补拍'), 'fold 3');
		const last = getComputedStyle(folds[2]);
		check(last.borderBottomWidth === '1px' && last.borderBottomColor === line && last.backgroundColor === 'rgba(0, 0, 0, 0)' && last.boxShadow === 'none', 'last fold');
		const summary = folds[0].querySelector('summary');
		const summaryStyle = getComputedStyle(summary);
		near(parseFloat(summaryStyle.fontSize), 0.78 * rootPx, 'summary size');
		check(summaryStyle.fontWeight === '500' && summaryStyle.color === muted, 'summary weight and color');
		near(parseFloat(summaryStyle.lineHeight) / parseFloat(summaryStyle.fontSize), 1.4, 'summary line-height', 0.02);
		check(summaryStyle.display === 'list-item', `summary display ${summaryStyle.display}`);
		const body = folds[1].querySelector('.fold-body');
		const bodyStyle = getComputedStyle(body);
		near(parseFloat(bodyStyle.fontSize), 0.84 * rootPx, 'fold-body size');
		check(bodyStyle.fontWeight === '400' && bodyStyle.color === muted, 'fold-body weight and color');
		const card = folds[0].querySelector('.link-cards a');
		const cardStyle = getComputedStyle(card);
		near(parseFloat(cardStyle.minHeight), 44, 'link min-height', 0.6);
		near(parseFloat(cardStyle.paddingTop), 0.45 * rootPx, 'link padding-top', 0.6);
		near(parseFloat(cardStyle.paddingLeft), 0.7 * rootPx, 'link padding-left', 0.6);
		check(cardStyle.borderTopWidth === '1px' && cardStyle.borderTopColor === line, 'link border');
		check(cardStyle.backgroundColor === elevated, 'link background');
		for (const fold of folds) {
			const foldStyle = getComputedStyle(fold);
			check(foldStyle.borderTopWidth === '1px' && foldStyle.borderTopStyle === 'solid' && foldStyle.borderTopColor === line, 'fold border-top');
			check(foldStyle.backgroundColor === 'rgba(0, 0, 0, 0)' || foldStyle.backgroundColor === 'transparent', 'fold background');
			check(foldStyle.boxShadow === 'none', 'fold shadow');
		}
		const plate = document.querySelector('.detail-text');
		near(parseFloat(getComputedStyle(plate).fontSize), 0.78 * rootPx, 'detail-text size');
		check(getComputedStyle(plate).fontWeight === '400', 'detail-text weight');
		const objectBox = document.querySelector('.record-object').getBoundingClientRect();
		const textBox = document.querySelector('.record-text').getBoundingClientRect();
		if (desktop) {
			check(getComputedStyle(document.querySelector('.record-object')).position === 'sticky', 'sticky');
			check(objectBox.right <= textBox.left + 1, 'object left of text');
		} else {
			check(textBox.top >= objectBox.bottom - 1, 'mobile stacks images then text');
		}
	}
	if (failures.length) {
		console.error(failures.join('\n'));
		return;
	}
	console.log(`qa: ok (${desktop ? 'desktop' : 'mobile'} ${path})`);
})();
```

Spec §7 items this script covers: 1–9 and 11–13 on the three URLs, at both viewports. Item 10 is the order script from Task 1 (`aa` before `falp381`, `zz` after `ll912` and before `lpbr6083`, bad decades fail parsing, `catalogTime` throws). Item 12 is also the cover assert in that script.

Look at a fold summary and confirm the disclosure triangle is visible. `display: list-item` plus the source ban on marker hiding is the mechanical half of that check.

Stop the preview server when the six runs (three URLs × two viewports) have each printed `qa: ok`.

- [ ] **Step 3: Stop if anything failed**

A failed checker, build, order script, or `qa: ok` line means this task is not done. Repair the owning task’s file and commit the fix. Do not commit a green Task 6 by itself.

---

### Task 7: Implementation pull request

**Files:**
- Modify: none
- Test: `git status --short` is empty, and Task 6’s commands already passed on the commit you push

**Interfaces:**
- Consumes: the commits from Tasks 1–5 (and any `fix(records):` commits from Task 6).
- Produces: a pull request into `main` whose diff is the implementation, not this plan file.

- [ ] **Step 1: Confirm the branch is only the implementation**

```bash
git status --short
git log --oneline main..HEAD
```

Expected: `git status` prints nothing. The log lists the Task 1–5 commits and no edit to `docs/superpowers/plans/2026-10-24-records-museum-alignment.md` unless you are fixing the plan itself in a separate docs change.

- [ ] **Step 2: Push and open the pull request**

Branch from latest `main`. Do not commit on `main`.

```bash
git push -u origin HEAD
```

Open a pull request into `main` with this title and body:

Title: `feat(records): light museum alignment for the catalog`

Body:

```markdown
## What

Approach A from `docs/superpowers/specs/2026-10-24-records-museum-alignment-design.md`, implemented from `docs/superpowers/plans/2026-10-24-records-museum-alignment.md`.

- Catalog export is earliest → latest (`year`, otherwise decade start, then `id`). `records.json` order is unchanged.
- 记述 keeps `1rem` and gains a hairline plane (`padding-top` `1rem` / `0.7rem`).
- 著录 heading is removed. `dl.props` is named with `aria-label`. `dt` stays `0.75rem`, `dd` stays `0.82rem`, row-gap becomes `0.32rem`.
- Fold summary becomes `0.78rem` with the native disclosure marker.
- List rows are cover plus text at every width (`6rem`, or `4.75rem` below `40rem`).

## Verification

- `npm run check`
- `npm run build`
- `catalog-order: ok`
- `acceptance-source: ok`
- `qa: ok` at `1200px` and `390px` on `/records/`, `/records/mhjl329/`, and `/records/falp381/`
```

Replace the verification list with the commands you actually ran and their exit lines. Do not claim a viewport you did not open.

---

## Spec coverage

| Spec lock | Task |
|---|---|
| `.record-tombstone-meta` margin-bottom `1rem` / `0.7rem` | Task 2, leave the existing declarations |
| `.record-story` padding-top `1rem` / `0.7rem`, border-top, margin `0 0 1.6rem`, transparent / no shadow / radius `0` / no left border | Task 2 |
| 记述 `1rem` / `400` / `1.5` / `0.1px`; lead `600`; `p + p` `1em`; microtype and `halt` | Task 2 |
| Remove `h2.record-props-label`; `aria-label="著录"`; no hidden heading | Task 3 |
| `.props` margin `0`, row-gap `0.32rem`, column-gap `0.75rem`, `5.5em 1fr`, `align-items: baseline` | Task 3 |
| `dt` `0.75rem` / `400` / `1.4` / muted, `text-align: start`, `letter-spacing: 0`, `text-transform: none`, `white-space: nowrap` | Task 3 |
| `dd` `0.82rem` / `400` / `1.45` / `var(--text)` | Task 3 |
| Summary `0.78rem` / `500` / `1.4` / muted, `display` unset, `padding: 0.68rem 0`, marker kept | Task 4 |
| Fold hairline, last border, `[open]` summary border, `.fold-body` `0.84rem` / `400` / `1.5`, link cards | Task 4 |
| `.detail-text` `0.78rem` / `400` / `1.45` unchanged | Task 4 |
| Cover + `.c-text` markup, `96`/`96`, empty alt, `cover.webp` assert | Tasks 1 and 5 |
| Row `6rem` + text above `40rem`, including above `64rem`; `4.75rem` + text at `max-width: 40rem` | Task 5 |
| `.c-cat` `0.78rem`, `.c-work` `1rem`/`600`, `.c-artist` `0.84rem`, `.c-sub` `0.78rem`, badge `0.75rem`/`500` | Task 5 |
| Hover `var(--bg-elevated)`, `transform: none`, `box-shadow: none` | Task 5 |
| Earliest → latest, tie-break `id`, decade regex, JSON order untouched, filters do not reorder | Task 1 |
| §7 items 1–13 | Task 6 |
| Implementation PR | Task 7 |
