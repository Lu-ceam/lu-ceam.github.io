# Elbow-dashed callout leaders Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Draw every callout leader as one dashed elbow, keep the MHJL 329 plate painted on the mobile notes beat, and stop two fixed 9.5rem gutters from crushing that plate.

**Architecture:** `leaderEndpoints` keeps today’s box-edge start and the `0.35rem` short-of-the-note end, and returns the polyline between them. The visible SVG stroke is always `stroke-dasharray: 6 5`. The scrub reveal moves to a second polyline, `.mark-leader-mask`, so the script never puts `pathLength` or `stroke-dasharray` on `.mark-leader`. On a split frame, `plateOpacity === 1` adds `is-plate` (plate shown, upright veil hidden) and every split plate and upright is `loading="eager"`. Below `48rem`, only `.split-frame` collapses to one gutter when two readable gutters would push the plate under its floor. `stageVisual`, `cameraBox`, and the runway lengths stay put.

**Tech Stack:** Astro static pages, vanilla TypeScript in the page `<script>`, CSS custom properties, pure helpers in `src/data/detail-display.ts` tested with `node:test`. No scroll library. This package has no `npm test` script. The records check is `node --experimental-strip-types --test`, then `npm run check` and `npm run build`. Node `>=22.23.4`.

**Spec:** [`docs/superpowers/specs/2026-10-25-records-imagery-elbow-dashed-callouts-design.md`](../specs/2026-10-25-records-imagery-elbow-dashed-callouts-design.md)

**Checked against:** `main` at `fb9c3d0` (spec squash `#38`). Code reality is the shipped Approach A page: `src/pages/records/[id].astro`, `src/data/detail-display.ts`, `src/data/detail-display.test.ts`, `src/styles/global.css`, `src/data/split-stage.ts`, MHJL 329 in `src/data/records.json`.

**Branch:** cut the implementation branch from `main` after this plan is on `main`. Do not implement these tasks on the docs branch.

## Global Constraints

- Leader path is one elbow. Horizontal stub, one sharp corner, then a straight segment to the note. No second bend, no radius, no quadratic, no arrowhead. Leaders may cross. They do not route around boxes or each other.
- Stub length, in plate pixels: `gap >= 32` → 16 toward the note; `4 <= gap < 32` → half the gap; `gap < 4` → no corner, two points, still dashed. `gap = |x2 - x1|`. The stub direction is the sign of `x2 - x1`, not `badge`.
- Endpoints stay. `(x1, y1)` is the midpoint of the box edge that faces `side`. `(x2, y2)` is `0.35rem` short of the note’s inner edge, at the note’s vertical center. `side` is the side the note was actually given (`data-side` after `resolvedSide`, then the narrow rewrite below). `badge` does not aim the leader. Do not add `badge` to `LeaderArgs`.
- Visible dash is `6 5` in plate user units, `stroke-width: 1`, `fill: none`, `stroke-linecap: butt`, `stroke-linejoin: miter`, `stroke-miterlimit: 2`, `stroke: var(--accent)`. `forced-colors: active` keeps `CanvasText` on `.mark-leader`. Do not add `.mark-leader-mask` to that forced-colors rule.
- The scrub script must not set `stroke-dasharray`, `strokeDasharray`, or `pathLength` on `.mark-leader`. `settle()` must not write `stroke-dashoffset: 0` on `.mark-leader`. Draw-in uses `.mark-leader-mask` only.
- `LEADERS_END` stays `0.88`. Do not change `UPRIGHT_END`, `ZOOM_END`, `PLATE_END`, `BOXES_END`, `PASS_SVH`, `JOINT_SVH`, `DETAIL_CROSSFADE_MS` (`1600`), `SETTLE_IDLE_MS`, `SETTLE_EPSILON_PX`, `SETTLE_SLACK_PX`, `SETTLE_LOCK_MS`, `cameraBox`, or `stageVisual`. Do not edit `src/data/split-stage.ts` or `src/data/split-stage.test.ts` except to re-run the existing tests.
- `html` stays `font-size: 112.5%`. The acceptance initial font is 16px, so `1rem` is 18px. The split breakpoint stays `48rem`. Do not rewrite it as `768px`.
- Narrow plate floor `F` is `min(11rem, 58% of stage width)`. Gap `G` is `0.55rem`. Pair minimum `M` is `7.5rem`. Slot cap is `9.5rem`. Imagery cap is `70svh`. Initial imagery height stays `58svh`, and `42svh` when `max-width: 47.99rem` and `max-height: 32rem`. Desktop imagery stays a literal `100svh` and does not read `--imagery-h`.
- One gutter only on `.split-frame` below `48rem`, and only when `W < F + 2M + 2G`. The side with more notes wins. An equal count goes right. JSON `side` is not rewritten. Legacy `.record-split` column structure stays; that page gets the elbow and the dash only.
- Copy and marks stay. Do not edit `src/data/records.json`, 记述, captions, alts, `detailsNote`, or `marks[].note`. Do not add boxes, a loupe, itinerary rows, or a ①–⑥ list in the reading column.
- No-JS keeps the server’s horizontal dashed stand-in and does not add `is-plate`. With `data-motion="ok"` the existing unsettled rule still hides that plate. This spec leaves that no-JS split page. The capture this plan fixes is a scripted notes beat.
- `stackTops` stays: order by anchor, `0.35rem` gap, no top above the plate, hang below the plate when the stack needs it. Note type stays `0.78rem` / line-height `1.45`.
- Palette stays `var(--bg)`, `var(--text)`, `var(--muted)`, `var(--accent)`, `var(--line)`. Do not add a color token or a font. Public box stroke stays `var(--accent)`.
- Primary URL: `/records/mhjl329/` (label, then cover). Legacy check: `/records/ml4001/`.

## File map

| Path | Responsibility |
|------|----------------|
| `src/data/detail-display.ts` | `leaderEndpoints` returns `LeaderPoint[]`. Narrow gutter math (`plateFloorPx`, `pairGuttersFit`, `singleGutterSide`, `singleGutterPx`, `singlePlatePx`, `laidOutSides`, `fitPlateToFloor`, `imageryHeightPx`). No DOM. |
| `src/data/detail-display.test.ts` | `node:test` for the elbow, the short-of-note fixture, the MHJL side counts, and the narrow numbers. Source reads for the Astro script and `global.css`. |
| `src/pages/records/[id].astro` | Three leader sites become a dashed `<polyline>` plus a `<mask>`. `position()` writes both point lists, the narrow gutter, and `--imagery-h`. `applyFrame` masks the draw-in, toggles `is-plate`, and sets clip `visibility`. Split plates and uprights are `loading="eager"`. |
| `src/styles/global.css` | `.mark-leader` dash, join, and caps. `.mark-leader-mask` solid white stroke with no dash pattern. `.is-plate` after the unsettled hold. Below `48rem`, split-frame slots and plate floor. `--imagery-h` for the narrow imagery band and the reading-column offsets. |
| `docs/superpowers/plans/2026-10-25-records-imagery-elbow-dashed-callouts.md` | This plan. |

Do **not** touch `src/data/split-stage.ts`, `src/data/split-stage.test.ts`, `src/data/records.json`, `src/data/records.ts`, `src/pages/records.astro`, or `public/records/**`.

Existing tests to leave green:

- `src/data/detail-display.test.ts` — `describe('geometry')` currently asserts `leaderEndpoints(...).x1`. Task 1 replaces that one `it`. The other describes stay.
- `src/data/detail-display.test.ts` — `describe('mhjl329 published callouts')` already loads `records.json`. Task 4 adds side counts beside it. Do not change the note strings.
- `src/data/split-stage.test.ts` — `describe('stageVisual')` locks `LEADERS_END` at `0.88`. `describe('mhjl329 crop geometry')` and `describe('cameraBox')` stay byte-for-byte.
- `src/data/split-stage.test.ts` — `describe('itinerary scroll helpers')` matches the source text `1 - visual.leadersOpacity`. Keep that expression on the mask stroke.
- `src/data/split-stage.test.ts` — `describe('runway css')` still expects one runway `height: calc(100svh + …)` and `prefers-reduced-motion`. Do not retarget those rules.

---

### Task 1: Elbow points from `leaderEndpoints`

**Files:**
- Modify: `src/data/detail-display.ts` (`LeaderArgs` and `leaderEndpoints`, today at lines 29–37 and 184–195)
- Modify: `src/data/detail-display.test.ts` (`describe('geometry')`, the `it` named `stops the leader 0.35rem short of the note inner edge`)
- Modify: `src/pages/records/[id].astro` (frontmatter helper, three `<line class="mark-leader">` sites, the leader loop inside `position()`)
- Test: `src/data/detail-display.test.ts`

**Interfaces:**
- Consumes: today’s `leaderEndpoints` math. `scaleX = plateRect.width / plateWidth`, `scaleY = plateRect.height / plateHeight`. `x1` is `mark.x` on the left and `mark.x + mark.w` on the right. `y1` is `mark.y + mark.h / 2`. `y2` is the note’s vertical center mapped into plate units. `x2` is `shortPx` outside the note’s inner edge (`noteRect.left - shortPx` on the right, `noteRect.right + shortPx` on the left), mapped into plate units.
- Produces:

```ts
export type LeaderPoint = { x: number; y: number };

export type LeaderArgs = {
	mark: { x: number; y: number; w: number; h: number };
	side: 'left' | 'right';
	plateRect: { left: number; top: number; width: number; height: number };
	plateWidth: number;
	plateHeight: number;
	noteRect: { left: number; right: number; top: number; height: number };
	shortPx: number;
};

export function leaderEndpoints(args: LeaderArgs): LeaderPoint[];
```

The array is ordered from the box to the note. Length is 3, or 2 when `gap < 4`. A plate measurement of 0 returns `[]`. Callers stop reading `x1`, `y1`, `x2`, `y2`.

`npm run check` stays red if the signature changes before the Astro caller. Land both in this task before the check.

- [ ] **Step 1: Write the failing test**

In `src/data/detail-display.test.ts`, add:

```ts
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
```

Add `type LeaderArgs` to the import from `./detail-display.ts`.

Replace the `it` named `stops the leader 0.35rem short of the note inner edge` with the block below. Leave `describe('rounding and plate height')`, `describe('detail mode')`, `describe('notes and text')`, `describe('mhjl329 published callouts')`, and the other `geometry` tests as they are.

```ts
	function leaderFixture(noteLeft: number, side: 'left' | 'right' = 'right'): LeaderArgs {
		return {
			mark: { x: 10, y: 20, w: 40, h: 10 },
			side,
			plateRect: { left: 100, top: 50, width: 200, height: 100 },
			plateWidth: 400,
			plateHeight: 200,
			noteRect: { left: noteLeft, right: side === 'left' ? noteLeft : 400, top: 60, height: 20 },
			shortPx: 7,
		};
	}

	it('stops the leader 0.35rem short of the note and stubs 16px on a long gap', () => {
		const right = leaderEndpoints(leaderFixture(340));
		assert.equal(Array.isArray(right), true);
		assert.equal(right.length, 3);
		assert.deepEqual(right[0], { x: 50, y: 25 });
		assert.deepEqual(right[1], { x: 66, y: 25 });
		assert.deepEqual(right[2], { x: 466, y: 40 });
		assert.equal(right[2].x, (340 - 7 - 100) / (200 / 400));
		assert.equal(right[2].y, (70 - 50) / (100 / 200));
	});

	it('uses a 16px stub once the gap reaches 32, and half the gap below that', () => {
		const forty = leaderEndpoints(leaderFixture(152));
		assert.equal(forty.length, 3);
		assert.deepEqual(forty[0], { x: 50, y: 25 });
		assert.deepEqual(forty[1], { x: 66, y: 25 });
		assert.deepEqual(forty[2], { x: 90, y: 40 });

		const at32 = leaderEndpoints(leaderFixture(148));
		assert.deepEqual(at32[1], { x: 66, y: 25 });
		assert.equal(at32[2].x, 82);

		const under32 = leaderEndpoints(leaderFixture(147.5));
		assert.equal(under32.length, 3);
		assert.deepEqual(under32[1], { x: 65.5, y: 25 });
		assert.equal(under32[2].x, 81);

		const at4 = leaderEndpoints(leaderFixture(134));
		assert.equal(at4.length, 3);
		assert.deepEqual(at4[0], { x: 50, y: 25 });
		assert.deepEqual(at4[1], { x: 52, y: 25 });
		assert.deepEqual(at4[2], { x: 54, y: 40 });
	});

	it('drops the corner when the gap is under 4 plate pixels', () => {
		const tight = leaderEndpoints(leaderFixture(133));
		assert.deepEqual(tight, [
			{ x: 50, y: 25 },
			{ x: 52, y: 40 },
		]);
		const flat = leaderEndpoints(leaderFixture(132));
		assert.deepEqual(flat, [
			{ x: 50, y: 25 },
			{ x: 50, y: 40 },
		]);
	});

	it('points the stub toward the note, including a left note and a note that sits back across the box', () => {
		const left = leaderEndpoints({
			...leaderFixture(0, 'left'),
			noteRect: { left: 0, right: 80, top: 60, height: 20 },
		});
		assert.deepEqual(left, [
			{ x: 10, y: 25 },
			{ x: -6, y: 25 },
			{ x: -26, y: 40 },
		]);
		const back = leaderEndpoints(leaderFixture(112));
		assert.deepEqual(back[0], { x: 50, y: 25 });
		assert.deepEqual(back[1], { x: 34, y: 25 });
		assert.deepEqual(back[2], { x: 10, y: 40 });
	});

	it('publishes no points when the measured plate is 0 on either axis', () => {
		const base = leaderFixture(340);
		assert.deepEqual(leaderEndpoints({ ...base, plateWidth: 0 }), []);
		assert.deepEqual(leaderEndpoints({ ...base, plateHeight: 0 }), []);
		assert.deepEqual(
			leaderEndpoints({ ...base, plateRect: { ...base.plateRect, width: 0 } }),
			[],
		);
		assert.deepEqual(
			leaderEndpoints({ ...base, plateRect: { ...base.plateRect, height: 0 } }),
			[],
		);
	});

	it('renders a polyline leader at all three callout sites', () => {
		const astro = readFileSync(
			join(dirname(fileURLToPath(import.meta.url)), '../pages/records/[id].astro'),
			'utf8',
		);
		assert.equal(astro.includes('<line'), false);
		assert.equal((astro.match(/class="mark-leader"/g) ?? []).length, 3);
		assert.equal((astro.match(/standInLeaderPoints\(mark, detail\.plate\.width\)/g) ?? []).length, 3);
		assert.match(astro, /function formatLeaderPoints/);
		assert.match(astro, /leader\.removeAttribute\('points'\)/);
		assert.match(astro, /formatLeaderPoints\(points\)/);
	});
```

`leaderFixture(340)` is the old right-side fixture: gap 416, so the corner is `(66, 25)`, not the midpoint. `leaderFixture(152)` is gap 40, so a half-gap corner would be `x = 70`. The assertion `x = 66` is what proves the 16px rule. `147.5` is gap 31. `134` is gap 4. `133` is gap 2. `132` is gap 0. The left fixture’s note right edge is 80, so `x2` is `-26` and the corner is `10 - 16`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --experimental-strip-types --test src/data/detail-display.test.ts`

Expected: FAIL. `leaderEndpoints` still returns `{ x1, y1, x2, y2 }`, so `Array.isArray(right)` is false. The source assertion also fails because `[id].astro` still contains `<line`.

- [ ] **Step 3: Return the elbow and point the three leaders at it**

In `src/data/detail-display.ts`, export `LeaderArgs` (`export type LeaderArgs`) and add `LeaderPoint`. Replace `leaderEndpoints` with:

```ts
export type LeaderPoint = { x: number; y: number };

export function leaderEndpoints(args: LeaderArgs): LeaderPoint[] {
	if (
		args.plateWidth === 0 ||
		args.plateHeight === 0 ||
		args.plateRect.width === 0 ||
		args.plateRect.height === 0
	) {
		return [];
	}
	const scaleX = args.plateRect.width / args.plateWidth;
	const scaleY = args.plateRect.height / args.plateHeight;
	const y1 = args.mark.y + args.mark.h / 2;
	const x1 = args.side === 'left' ? args.mark.x : args.mark.x + args.mark.w;
	const noteCenterCss = args.noteRect.top + args.noteRect.height / 2;
	const y2 = (noteCenterCss - args.plateRect.top) / scaleY;
	const innerCss = args.side === 'right' ? args.noteRect.left : args.noteRect.right;
	const endCss = args.side === 'right' ? innerCss - args.shortPx : innerCss + args.shortPx;
	const x2 = (endCss - args.plateRect.left) / scaleX;
	const start = { x: x1, y: y1 };
	const end = { x: x2, y: y2 };
	const gap = Math.abs(x2 - x1);
	if (gap < 4) return [start, end];
	const cornerX = gap >= 32 ? x1 + Math.sign(x2 - x1) * 16 : x1 + (x2 - x1) / 2;
	return [start, { x: cornerX, y: y1 }, end];
}
```

The first point and the last point are the old `(x1, y1)` and `(x2, y2)`. The corner’s `y` is `y1`, so the stub is horizontal. `Math.sign(x2 - x1)` is the direction toward the note. Do not read `badge`. A measured plate of 0 is the “zero box” in the spec: return `[]` so `position()` does not aim a line. A mark with a positive box still gets a leader.

In the frontmatter of `src/pages/records/[id].astro`, after the `hasReveal` const and before the closing `---`, add:

```ts
/** No-JS and first paint. Horizontal stand-in. The elbow is written later by position(). */
function standInLeaderPoints(
	mark: { side: 'auto' | 'left' | 'right'; x: number; y: number; w: number; h: number },
	plateWidth: number,
): string {
	const side = paintSide(mark.side);
	const x1 = side === 'left' ? mark.x : mark.x + mark.w;
	const y1 = mark.y + mark.h / 2;
	const x2 = side === 'left' ? 0 : plateWidth;
	return `${x1},${y1} ${x2},${y1}`;
}
```

Replace each of the three `<line class="mark-leader" … />` elements with this polyline. The three sites are the legacy `record.details.map` figure, the `revealDetails.map` split frame, and the `nonRevealDetails.map` figure inside `.split-read`. Each site already has `mark` and `detail` in scope. Delete the local `side`, `x1`, `y1`, and `x2` consts that only fed the line.

```astro
<polyline
	class="mark-leader"
	data-mark-id={mark.id}
	points={standInLeaderPoints(mark, detail.plate.width)}
	fill="none"
	stroke-width="1"
/>
```

In the page `<script>`, add this helper next to `remPx`:

```ts
function formatLeaderPoints(points: readonly { x: number; y: number }[]): string {
	return points.map((point) => `${point.x},${point.y}`).join(' ');
}
```

Replace the leader loop inside `position()` (the loop that currently queries `SVGLineElement` and sets `x1` `y1` `x2` `y2`) with:

```ts
			const plateRect = plate.getBoundingClientRect();
			const shortPx = 0.35 * remPx();
			for (const li of items) {
				const id = li.dataset.markId ?? '';
				const leader = figure.querySelector<SVGPolylineElement>(
					`.mark-leader[data-mark-id="${CSS.escape(id)}"]`,
				);
				if (!leader) continue;
				const side = li.dataset.side === 'left' ? 'left' : 'right';
				const points = leaderEndpoints({
					mark: {
						x: Number(li.dataset.x),
						y: Number(li.dataset.y),
						w: Number(li.dataset.w),
						h: Number(li.dataset.h),
					},
					side,
					plateRect: {
						left: plateRect.left,
						top: plateRect.top,
						width: plateRect.width,
						height: plateRect.height,
					},
					plateWidth,
					plateHeight,
					noteRect: li.getBoundingClientRect(),
					shortPx,
				});
				if (points.length < 2) {
					leader.removeAttribute('points');
					continue;
				}
				leader.setAttribute('points', formatLeaderPoints(points));
			}
```

Keep the `stage` / `paddingBottom` tail that follows the loop. A zero plate makes `leaderEndpoints` return `[]`, the `points` attribute is removed, and the server stand-in does not stay aimed across a collapsed box. The next `position()` that measures a non-zero plate writes the elbow. Do not add a second geometry helper. `applyFrame` still sets `pathLength` on `.mark-leader` until Task 2; leave that loop alone in this task.

Wire a load listener so a first measure of 0×0 does not stick. In `init`, inside the `for (const figure of figures)` loop, after `bind(figure)`:

```ts
				figure.querySelector('img.plate')?.addEventListener('load', () => {
					try {
						position(figure);
					} catch {
						/* keep the last placement */
					}
				});
```

In `bindSplit`, after `const frames = [...]`:

```ts
			for (const frame of frames) {
				frame.querySelector('img.plate')?.addEventListener('load', () => {
					try {
						position(frame);
					} catch {
						/* keep the last placement */
					}
				});
			}
```

- [ ] **Step 4: Run the tests and the type check**

Run: `node --experimental-strip-types --test src/data/detail-display.test.ts && npm run check`

Expected: detail-display `# fail 0`, `astro check` PASS. Do not run `npm run build` yet. The leaders are elbows, and the scrub script still forces `pathLength="1"` on them. Task 2 removes that.

- [ ] **Step 5: Commit**

```bash
git add src/data/detail-display.ts src/data/detail-display.test.ts 'src/pages/records/[id].astro'
git commit -m "feat(records): return an elbow from leaderEndpoints"
```

---

### Task 2: Dashed stroke and a separate draw-in mask

**Files:**
- Modify: `src/styles/global.css` (`.mark-leader` at the rule near line 1067, and the `forced-colors` block near line 1130)
- Modify: `src/pages/records/[id].astro` (three overlay SVGs, `position()`, `settle()`, `applyFrame()`, `showSettled`)
- Modify: `src/data/detail-display.test.ts`
- Test: `src/data/detail-display.test.ts`
- Also run: `src/data/split-stage.test.ts` (do not edit it)

**Interfaces:**
- Consumes: Task 1 `leaderEndpoints(): LeaderPoint[]`, `formatLeaderPoints`, `standInLeaderPoints`. `stageVisual(...).leadersOpacity` still runs from `BOXES_END` to `LEADERS_END`. The leaders group still flips to opacity `1` when `leadersOpacity > 0` and `0` otherwise.
- Produces: each aligned overlay SVG contains `<mask id="{recordId}-{part}-leader-mask-{markId}">` with one `<polyline class="mark-leader-mask">`, and the visible `<polyline class="mark-leader" mask="url(#…)">`. `position()` writes the same `points` to both and opens the mask when `document.documentElement.dataset.motion !== 'ok'`. `applyFrame` sets `pathLength`, `stroke-dasharray`, and `stroke-dashoffset` on `.mark-leader-mask` only, using `1 - visual.leadersOpacity`. `showSettled` calls `position(frame)` for every aligned split frame. `settle()` does not write `stroke-dashoffset` on `.mark-leader`.

- [ ] **Step 1: Write the failing test**

Add this describe to `src/data/detail-display.test.ts`. `readFileSync`, `dirname`, `join`, and `fileURLToPath` are already imported from Task 1.

```ts
describe('leader stroke', () => {
	it('locks the visible dash in CSS and draws the scrub on the mask', () => {
		const here = dirname(fileURLToPath(import.meta.url));
		const css = readFileSync(join(here, '../styles/global.css'), 'utf8');
		assert.match(css, /\.mark-leader\s*\{[^}]*fill:\s*none/s);
		assert.match(css, /\.mark-leader\s*\{[^}]*stroke:\s*var\(--accent\)/s);
		assert.match(css, /\.mark-leader\s*\{[^}]*stroke-width:\s*1/s);
		assert.match(css, /\.mark-leader\s*\{[^}]*stroke-dasharray:\s*6 5/s);
		assert.match(css, /\.mark-leader\s*\{[^}]*stroke-linecap:\s*butt/s);
		assert.match(css, /\.mark-leader\s*\{[^}]*stroke-linejoin:\s*miter/s);
		assert.match(css, /\.mark-leader\s*\{[^}]*stroke-miterlimit:\s*2/s);
		assert.match(css, /\.mark-leader-mask\s*\{[^}]*stroke:\s*#fff/s);
		assert.match(css, /\.mark-leader-mask\s*\{[^}]*stroke-width:\s*3/s);
		assert.match(css, /\.mark-leader-mask\s*\{[^}]*stroke-linecap:\s*butt/s);
		assert.doesNotMatch(css, /\.mark-leader-mask\s*\{[^}]*stroke-dasharray/s);
		const forced = css.slice(css.indexOf('@media (forced-colors: active)'), css.indexOf('@media (forced-colors: active)') + 500);
		assert.match(forced, /stroke:\s*CanvasText/);
		assert.equal(forced.includes('mark-leader-mask'), false);

		const astro = readFileSync(join(here, '../pages/records/[id].astro'), 'utf8');
		assert.equal(astro.includes('SVGLineElement'), false);
		assert.equal(astro.includes("setAttribute('stroke-dashoffset', '0')"), false);
		assert.equal((astro.match(/class="mark-leader-mask"/g) ?? []).length, 3);
		assert.equal((astro.match(/standInLeaderPoints\(mark, detail\.plate\.width\)/g) ?? []).length, 6);
		assert.match(astro, /mark-leader-mask'\)\.forEach/);
		assert.doesNotMatch(astro, /mark-leader'\)\.forEach/);
		assert.match(astro, /1 - visual\.leadersOpacity/);
		const showSettled = astro.slice(astro.indexOf('const showSettled'), astro.indexOf('const armFade'));
		assert.match(showSettled, /position\(frame\)/);
	});
});
```

In the Task 1 test `renders a polyline leader at all three callout sites`, delete this line. This describe counts six calls (three visible polylines and three mask polylines). Leave the `<line`, `class="mark-leader"`, `formatLeaderPoints`, and `leader.removeAttribute('points')` assertions in that Task 1 test.

```ts
		assert.equal((astro.match(/standInLeaderPoints\(mark, detail\.plate\.width\)/g) ?? []).length, 3);
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --experimental-strip-types --test src/data/detail-display.test.ts`

Expected: FAIL in `leader stroke`. `.mark-leader` has no `stroke-dasharray: 6 5`. The page has no `.mark-leader-mask`. `settle()` still writes `stroke-dashoffset` `0`. `showSettled` does not call `position(frame)`.

- [ ] **Step 3: Put the dash in CSS and the draw-in on the mask**

Replace `.mark-leader` in `src/styles/global.css` with:

```css
.mark-leader {
	fill: none;
	stroke: var(--accent);
	stroke-width: 1;
	stroke-dasharray: 6 5;
	stroke-linecap: butt;
	stroke-linejoin: miter;
	stroke-miterlimit: 2;
}

.mark-leader-mask {
	fill: none;
	stroke: #fff;
	stroke-width: 3;
	stroke-linecap: butt;
}
```

Do not set `stroke-dasharray` on `.mark-leader-mask`. The scrub writes that attribute on the mask, and an author `stroke-dasharray` would beat the presentation attribute and freeze the reveal. The visible leader’s dash lives only in CSS, so `setAttribute('stroke-dasharray', …)` on `.mark-leader` cannot turn it solid. Leave the existing `forced-colors` rule that sets `.mark-leader { stroke: CanvasText }`. Do not add `.mark-leader-mask` there. A mask stroke painted as `CanvasText` can go black and hide the leader. White (`#fff`) is the mask luminance, not a page color.

In the Astro frontmatter, next to `standInLeaderPoints`, add:

```ts
function leaderMaskId(recordId: string, part: string, markId: string): string {
	return `${recordId}-${part}-leader-mask-${markId}`;
}
```

At each of the three overlay SVGs, insert this `<defs>` as the first child of `<svg class="plate-overlay">`, still inside the `{detail.marks.length > 0 && (` branch. `aligned` is already in scope at all three sites.

```astro
{aligned && (
	<defs>
		{detail.marks.map((mark) => (
			<mask
				id={leaderMaskId(record.id, detail.part, mark.id)}
				maskUnits="userSpaceOnUse"
				maskContentUnits="userSpaceOnUse"
				x={-4}
				y={-4}
				width={detail.plate.width + 8}
				height={detail.plate.height + 8}
				data-mark-id={mark.id}
			>
				<polyline
					class="mark-leader-mask"
					data-mark-id={mark.id}
					points={standInLeaderPoints(mark, detail.plate.width)}
					fill="none"
					stroke="#fff"
					stroke-width="3"
					stroke-linecap="butt"
				/>
			</mask>
		))}
	</defs>
)}
```

Replace each visible polyline from Task 1 with:

```astro
<polyline
	class="mark-leader"
	data-mark-id={mark.id}
	points={standInLeaderPoints(mark, detail.plate.width)}
	mask={`url(#${leaderMaskId(record.id, detail.part, mark.id)})`}
	fill="none"
	stroke-width="1"
/>
```

The server stand-in is still the horizontal segment at `y1`, from the box-edge midpoint to `x = 0` or `x = plate.width`. It is dashed by CSS. The mask region starts large enough for that segment. `maskUnits="userSpaceOnUse"` is required. The default object bounding box clips a leader that leaves the viewBox. No `pathLength` in the server HTML, so no-JS shows the whole stand-in.

In the page script, add:

```ts
function fitLeaderMask(mask: SVGPolylineElement, points: readonly { x: number; y: number }[]): void {
	const owner = mask.parentElement;
	if (!(owner instanceof SVGMaskElement)) return;
	const xs = points.map((point) => point.x);
	const ys = points.map((point) => point.y);
	const pad = 8;
	const minX = Math.min(...xs) - pad;
	const minY = Math.min(...ys) - pad;
	const maxX = Math.max(...xs) + pad;
	const maxY = Math.max(...ys) + pad;
	owner.setAttribute('x', String(minX));
	owner.setAttribute('y', String(minY));
	owner.setAttribute('width', String(Math.max(0, maxX - minX)));
	owner.setAttribute('height', String(Math.max(0, maxY - minY)));
}

function openLeaderMasks(root: ParentNode): void {
	root.querySelectorAll<SVGPolylineElement>('.mark-leader-mask').forEach((mask) => {
		mask.removeAttribute('pathLength');
		mask.removeAttribute('stroke-dasharray');
		mask.removeAttribute('stroke-dashoffset');
	});
}

function writeLeaders(
	figure: HTMLElement,
	items: readonly HTMLLIElement[],
	plate: HTMLImageElement,
	plateWidth: number,
	plateHeight: number,
): void {
	const plateRect = plate.getBoundingClientRect();
	const shortPx = 0.35 * remPx();
	for (const li of items) {
		const id = li.dataset.markId ?? '';
		const leader = figure.querySelector<SVGPolylineElement>(
			`.mark-leader[data-mark-id="${CSS.escape(id)}"]`,
		);
		const mask = figure.querySelector<SVGPolylineElement>(
			`.mark-leader-mask[data-mark-id="${CSS.escape(id)}"]`,
		);
		if (!leader) continue;
		const side = li.dataset.side === 'left' ? 'left' : 'right';
		const points = leaderEndpoints({
			mark: {
				x: Number(li.dataset.x),
				y: Number(li.dataset.y),
				w: Number(li.dataset.w),
				h: Number(li.dataset.h),
			},
			side,
			plateRect: {
				left: plateRect.left,
				top: plateRect.top,
				width: plateRect.width,
				height: plateRect.height,
			},
			plateWidth,
			plateHeight,
			noteRect: li.getBoundingClientRect(),
			shortPx,
		});
		if (points.length < 2) {
			leader.removeAttribute('points');
			mask?.removeAttribute('points');
			continue;
		}
		const rendered = formatLeaderPoints(points);
		leader.setAttribute('points', rendered);
		if (mask) {
			mask.setAttribute('points', rendered);
			fitLeaderMask(mask, points);
		}
	}
	if (document.documentElement.dataset.motion !== 'ok') openLeaderMasks(figure);
}
```

Replace the Task 1 leader loop in `position()` with:

```ts
			writeLeaders(figure, items, plate, plateWidth, plateHeight);
```

Keep the `paddingBottom` tail after that call.

Replace `settle()` so it no longer touches `.mark-leader`. The settled stroke is the CSS dash. Opening the mask here covers a legacy reveal figure, which never runs `applyFrame`.

```ts
		function settle(figure: HTMLElement): void {
			if (figure.dataset.settled === '1') return;
			figure.dataset.settled = '1';
			figure.classList.add('is-settled');
			figure.removeAttribute('tabindex');
			const upright = figure.querySelector<HTMLImageElement>('.upright');
			if (upright) upright.style.opacity = '';
			const plate = figure.querySelector<HTMLImageElement>('.plate');
			if (plate) plate.style.opacity = '';
			const leaders = figure.querySelector<SVGGElement>('.mark-leaders');
			if (leaders) leaders.style.opacity = '';
			openLeaderMasks(figure);
			try {
				position(figure);
			} catch {
				/* the settled plate is already on screen */
			}
		}
```

In `applyFrame`, replace the `.mark-leader` dash loop with the mask loop. Leave the group opacity line. The visible polyline is not queried here.

```ts
			if (leaders) {
				leaders.style.opacity = visual.leadersOpacity > 0 ? '1' : '0';
				frame.querySelectorAll<SVGPolylineElement>('.mark-leader-mask').forEach((mask) => {
					mask.setAttribute('pathLength', '1');
					mask.setAttribute('stroke-dasharray', '1');
					mask.setAttribute('stroke-dashoffset', String(1 - visual.leadersOpacity));
				});
			}
```

`pathLength="1"` plus `stroke-dasharray="1"` makes one dash the length of the mask stroke. Offset `1` hides it. Offset `0` shows it. Points are ordered from the box to the note, so the white mask stroke opens that way and the CSS `6 5` pattern shows through. At `leadersOpacity === 0` the group is opacity 0. At `1` the mask is fully open and the on-screen stroke is `6 5`.

`applyAll` already calls `position(frame)` before `applyFrame` while motion is ok. `position()` must not strip the mask attributes in that case. It opens them only when `data-motion` is not `'ok'`. An unset `data-motion` is not `'ok'`.

Replace `showSettled` with:

```ts
			const showSettled = () => {
				clearScrubStyles();
				if (read) read.setAttribute('data-pace', 'pin');
				for (const frame of frames) {
					frame.classList.add('is-active');
					frame.inert = false;
					frame.removeAttribute('aria-hidden');
					frame.style.transitionDuration = '0s';
					if (frame.dataset.notes === 'aligned') {
						try {
							position(frame);
						} catch {
							/* the settled plate is already on screen */
						}
					}
				}
			};
```

`clearScrubStyles` still clears inline opacity on `.upright-clip, .upright, .plate, .mark-graphics, .mark-leaders, .mark-list` together. Do not clear the plate and leave the callouts. Do not call `clearScrubStyles` on a path where `data-motion` stays `'ok'`. The existing callers are the reduced-motion change and `showSettled`, which only runs when motion is not ok. Do not add a CSS transition on `.mark-leader` or `.mark-leader-mask`. Reduced motion does not tween. `frame.style.transitionDuration = '0s'` is the crossfade, and this path sets it to zero.

There is no `.mark-leader { stroke-dasharray }` presentation attribute in the markup. Do not add one.

- [ ] **Step 4: Run the tests and the type check**

Run: `node --experimental-strip-types --test src/data/detail-display.test.ts src/data/split-stage.test.ts && npm run check`

Expected: both files `# fail 0`, check PASS. `describe('itinerary scroll helpers')` still sees `1 - visual.leadersOpacity`.

- [ ] **Step 5: Commit**

```bash
git add src/styles/global.css 'src/pages/records/[id].astro' src/data/detail-display.test.ts
git commit -m "feat(records): dash callout leaders and draw them with a mask"
```

---

### Task 3: Keep the plate painted when `plateOpacity` is 1

**Files:**
- Modify: `src/pages/records/[id].astro` (the two `loading` attributes inside `revealDetails.map`, and `applyFrame`)
- Modify: `src/styles/global.css` (insert after the split-frame unsettled hold, today just after the rule that sets `.mark-list` opacity 0 on `.split-frame:not(.is-settled)`)
- Modify: `src/data/detail-display.test.ts`
- Test: `src/data/detail-display.test.ts`

**Interfaces:**
- Consumes: `stageVisual(...).plateOpacity` and `.uprightOpacity`. The hold rules stay:

```css
html[data-motion='ok'] .record-page--split .split-frame:not(.is-settled) .upright-clip {
	opacity: 1;
	visibility: visible;
}

html[data-motion='ok'] .record-page--split .split-frame:not(.is-settled) .plate,
html[data-motion='ok'] .record-page--split .split-frame:not(.is-settled) .mark-graphics,
html[data-motion='ok'] .record-page--split .split-frame:not(.is-settled) .mark-leaders,
html[data-motion='ok'] .record-page--split .split-frame:not(.is-settled) .mark-list {
	opacity: 0;
}
```

The split path never adds `is-settled`. The head script in `src/layouts/Base.astro` sets `data-motion` before paint. Do not edit that script.

- Produces: both the plate and the upright inside `revealDetails.map` are `loading="eager"`. `fetchpriority={index === 0 ? 'high' : 'auto'}` stays on the first plate only. `applyFrame` does `frame.classList.toggle('is-plate', visual.plateOpacity === 1)` and sets the clip’s `visibility` from `uprightOpacity === 0`. CSS for `.is-plate` comes after the hold and forces `img.plate` to opacity 1 and `.upright-clip` to opacity 0 / `visibility: hidden`. Those rules do not set box, leader, or note opacity.

- [ ] **Step 1: Write the failing test**

Add this describe to `src/data/detail-display.test.ts`:

```ts
describe('plate hold', () => {
	it('eager-loads split plates and lets is-plate beat the unsettled veil', () => {
		const here = dirname(fileURLToPath(import.meta.url));
		const astro = readFileSync(join(here, '../pages/records/[id].astro'), 'utf8');
		const split = astro.slice(
			astro.indexOf('revealDetails.map((detail, index)'),
			astro.indexOf('class="split-read"'),
		);
		assert.equal(split.includes('loading="lazy"'), false);
		assert.equal(split.includes("loading={index === 0 ? 'eager' : 'lazy'}"), false);
		assert.equal((split.match(/loading="eager"/g) ?? []).length, 2);
		assert.equal((split.match(/fetchpriority=\{index === 0 \? 'high' : 'auto'\}/g) ?? []).length, 1);
		assert.ok(astro.includes('loading="lazy"'));
		assert.match(astro, /classList\.toggle\('is-plate', visual\.plateOpacity === 1\)/);
		assert.match(
			astro,
			/clip\.style\.visibility = visual\.uprightOpacity === 0 \? 'hidden' : 'visible'/,
		);

		const css = readFileSync(join(here, '../styles/global.css'), 'utf8');
		const splitHold = css.indexOf(
			".record-page--split .split-frame:not(.is-settled) .plate",
		);
		const plateOn = css.indexOf('.split-frame.is-plate');
		assert.ok(splitHold >= 0 && plateOn > splitHold);
		const reduce = css.indexOf("html[data-motion='reduce']", plateOn);
		const block = css.slice(plateOn, reduce);
		assert.match(block, /img\.plate\s*\{[^}]*opacity:\s*1/s);
		assert.match(block, /\.upright-clip\s*\{[^}]*opacity:\s*0/s);
		assert.match(block, /visibility:\s*hidden/);
		assert.equal(block.includes('mark-leader'), false);
		assert.equal(block.includes('mark-graphics'), false);
		assert.equal(block.includes('mark-list'), false);
	});
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --experimental-strip-types --test src/data/detail-display.test.ts`

Expected: FAIL in `plate hold`. The split frame still uses `loading={index === 0 ? 'eager' : 'lazy'}`, and `is-plate` is absent.

- [ ] **Step 3: Eager-load the split bitmaps and add `is-plate`**

In `revealDetails.map` only, change the plate and the upright from `loading={index === 0 ? 'eager' : 'lazy'}` to `loading="eager"`. Leave `fetchpriority={index === 0 ? 'high' : 'auto'}` on the plate. Do not add `fetchpriority` to the upright. Do not change `loading="lazy"` on the legacy figure or the non-reveal figure.

In `applyFrame`, delete the line `if (clip) clip.style.opacity = String(visual.uprightOpacity);`. Write the class and the clip together with the plate opacity, in the same function:

```ts
			frame.classList.toggle('is-plate', visual.plateOpacity === 1);
			if (clip) {
				clip.style.visibility = visual.uprightOpacity === 0 ? 'hidden' : 'visible';
				clip.style.opacity = String(visual.uprightOpacity);
			}
```

Put that block immediately before `if (plate) plate.style.opacity = String(visual.plateOpacity);`. `plateOpacity === 1` is the whole of the plate, boxes, leaders, and notes beats, including the notes keypoint. During the crossfade `plateOpacity` is below 1, so `is-plate` is off, and the clip stays `visible` until `uprightOpacity` hits 0. `is-plate` is not removed by `clearScrubStyles`. `applyFrame` is the only writer. Do not set leader opacity from `is-plate`.

In `src/styles/global.css`, immediately after the split-frame unsettled hold (the rule that hides `.plate, .mark-graphics, .mark-leaders, .mark-list`) and before `html[data-motion='reduce']`, add:

```css
html[data-motion='ok'] .record-page--split .split-frame.is-plate img.plate {
	opacity: 1;
}

html[data-motion='ok'] .record-page--split .split-frame.is-plate .upright-clip {
	opacity: 0;
	visibility: hidden;
}
```

The hold for the plate is `html[data-motion='ok'] .record-page--split .split-frame:not(.is-settled) .plate` (one element, one attribute, four classes). The `img.plate` rule adds an element, so it wins when both match. The clip rules have equal specificity, so this block has to stay later in the file than the hold. Do not move the hold below it. Do not delete the hold. First paint, before `applyFrame`, is still the upright.

A hidden clip does not paint `background: var(--bg)` over the photograph. If a later path clears inline opacity during the notes beat and leaves `is-plate` on, the photograph stays and the veil stays off. Boxes, leaders, and notes still follow their own inline opacities.

- [ ] **Step 4: Run the tests and the type check**

Run: `node --experimental-strip-types --test src/data/detail-display.test.ts src/data/split-stage.test.ts && npm run check`

Expected: `# fail 0`, check PASS.

- [ ] **Step 5: Commit**

```bash
git add 'src/pages/records/[id].astro' src/styles/global.css src/data/detail-display.test.ts
git commit -m "fix(records): keep the split plate painted on the notes beat"
```

---

### Task 4: One narrow gutter, a plate floor, notes inside the band

**Files:**
- Modify: `src/data/detail-display.ts`
- Modify: `src/data/detail-display.test.ts`
- Modify: `src/pages/records/[id].astro` (`position()` and its import)
- Modify: `src/styles/global.css` (the `.record-page--split` imagery block from `.record-page--split .split-stage` through the short-height query, and a new narrow rule for `.split-frame` slots)
- Test: `src/data/detail-display.test.ts`

**Interfaces:**
- Consumes: `resolvedSide`, `stackTops`, `paintSide` (server slots only). `ensureSlots` already inserts or removes `.mark-slot-left` / `.mark-slot-right` from `li.dataset.side`. Task 2 `writeLeaders`. MHJL 329 plates are both 400 wide. Every published mark is `side: "auto"`. `resolvedSide` on that file is cover 5 left / 1 right (mark 6, `40th Anniversary Senri Oe`) and label 1 left / 5 right (mark 4). The acceptance root font makes `1rem = 18`. A 390px viewport gives `.layout-wide .column` `354px` (`100% - 2rem`). The stage width is that column, because `58svh * plate aspect` is wider than the column.
- Produces:

```ts
export const NARROW_FLOOR_REM = 11;
export const NARROW_FLOOR_OF_STAGE = 0.58;
export const NARROW_GAP_REM = 0.55;
export const NARROW_PAIR_MIN_REM = 7.5;
export const NARROW_SLOT_CAP_REM = 9.5;

export function plateFloorPx(stageWidth: number, rem: number): number;
export function pairGuttersFit(stageWidth: number, rem: number): boolean;
export function singleGutterSide(leftCount: number, rightCount: number): 'left' | 'right' | null;
export function singleGutterPx(stageWidth: number, rem: number): number;
export function singlePlatePx(stageWidth: number, rem: number): number;
export function fitPlateToFloor(usedPlatePx: number, floorPx: number, overflows: boolean): number;
export function imageryHeightPx(neededPx: number, initialPx: number, capPx: number): number | null;

export type SideLayout = {
	sides: Array<'left' | 'right'>;
	gutters: 'resolved' | 'single';
};

export function laidOutSides(
	notes: readonly { side: Side; x: number; w: number }[],
	plateWidth: number,
	stageWidth: number,
	rem: number,
	narrow: boolean,
): SideLayout;
```

`imageryHeightPx` returns `null` when the needed band fits in the stylesheet height. The script then removes the inline `--imagery-h`. Otherwise it returns `min(cap, needed)`.

Desktop `.mark-slot` stays `flex: 0 0 9.5rem`. The shrink rule is only `.record-page--split .split-frame` below `48rem`. Legacy `.record-split` does not get it.

- [ ] **Step 1: Write the failing test**

Add the new names to the import in `src/data/detail-display.test.ts`. Extend `PublishedDetail` with `plate: { width: number; height: number }`. `publishedDetails` already returns that JSON.

Add this describe:

```ts
describe('narrow stage', () => {
	it('locks the floor, the pair test, and the single-gutter widths', () => {
		assert.equal(NARROW_FLOOR_REM, 11);
		assert.equal(NARROW_FLOOR_OF_STAGE, 0.58);
		assert.equal(NARROW_GAP_REM, 0.55);
		assert.equal(NARROW_PAIR_MIN_REM, 7.5);
		assert.equal(NARROW_SLOT_CAP_REM, 9.5);
		const rem = 18;
		assert.equal(plateFloorPx(354, rem), 198);
		assert.equal(plateFloorPx(284, rem), 0.58 * 284);
		const threshold = 11 * rem + 2 * 7.5 * rem + 2 * 0.55 * rem;
		assert.equal(pairGuttersFit(threshold, rem), true);
		assert.equal(pairGuttersFit(threshold - 0.01, rem), false);
		assert.equal(pairGuttersFit(354, rem), false);
		assert.equal(pairGuttersFit(284, rem), false);
		assert.equal(pairGuttersFit(827, rem), true);
		assert.equal(singleGutterSide(5, 1), 'left');
		assert.equal(singleGutterSide(1, 5), 'right');
		assert.equal(singleGutterSide(3, 3), 'right');
		assert.equal(singleGutterSide(0, 0), null);
		const floor = plateFloorPx(354, rem);
		const gap = NARROW_GAP_REM * rem;
		const cap = NARROW_SLOT_CAP_REM * rem;
		assert.equal(singleGutterPx(354, rem), Math.min(cap, 354 - gap - floor));
		assert.equal(singlePlatePx(354, rem), Math.max(floor, 354 - gap - singleGutterPx(354, rem)));
		assert.equal(singlePlatePx(354, rem), 198);
		assert.equal(fitPlateToFloor(320, 198, false), 320);
		assert.equal(fitPlateToFloor(320, 198, true), 198);
		assert.equal(imageryHeightPx(100, 200, 300), null);
		assert.equal(imageryHeightPx(250, 200, 300), 250);
		assert.equal(imageryHeightPx(400, 200, 300), 300);
	});

	it('collapses MHJL 329 to the busier side only when two gutters do not fit', () => {
		function notesFor(part: string): { side: 'auto' | 'left' | 'right'; x: number; w: number }[] {
			const detail = publishedDetails('mhjl329').find((item) => item.part === part);
			assert.ok(detail);
			assert.equal(detail.plate.width, 400);
			return detail.marks.map((mark) => ({ side: mark.side, x: mark.x, w: mark.w }));
		}
		const cover = notesFor('cover');
		const label = notesFor('label');
		const coverResolved = laidOutSides(cover, 400, 354, 18, false);
		assert.equal(coverResolved.gutters, 'resolved');
		assert.equal(coverResolved.sides.filter((side) => side === 'left').length, 5);
		assert.equal(coverResolved.sides.filter((side) => side === 'right').length, 1);
		const labelResolved = laidOutSides(label, 400, 354, 18, false);
		assert.equal(labelResolved.sides.filter((side) => side === 'left').length, 1);
		assert.equal(labelResolved.sides.filter((side) => side === 'right').length, 5);

		const coverPhone = laidOutSides(cover, 400, 354, 18, true);
		assert.equal(coverPhone.gutters, 'single');
		assert.deepEqual(coverPhone.sides, ['left', 'left', 'left', 'left', 'left', 'left']);
		const labelPhone = laidOutSides(label, 400, 354, 18, true);
		assert.equal(labelPhone.gutters, 'single');
		assert.deepEqual(labelPhone.sides, ['right', 'right', 'right', 'right', 'right', 'right']);

		const coverWide = laidOutSides(cover, 400, 827, 18, true);
		assert.equal(coverWide.gutters, 'resolved');
		assert.equal(coverWide.sides.filter((side) => side === 'right').length, 1);

		const tied = laidOutSides(
			[
				{ side: 'left', x: 0, w: 1 },
				{ side: 'right', x: 0, w: 1 },
			],
			400,
			354,
			18,
			true,
		);
		assert.equal(tied.gutters, 'single');
		assert.deepEqual(tied.sides, ['right', 'right']);
		assert.deepEqual(laidOutSides([], 400, 354, 18, true), { sides: [], gutters: 'resolved' });
	});

	it('sizes the narrow imagery band from --imagery-h and leaves the desktop pane at 100svh', () => {
		const here = dirname(fileURLToPath(import.meta.url));
		const css = readFileSync(join(here, '../styles/global.css'), 'utf8');
		assert.match(css, /\.mark-slot \{\s*flex:\s*0 0 9\.5rem/);
		assert.match(css, /\.record-page--split \.split-frame \.plate-frame \{\s*width:\s*100%/);
		assert.match(
			css,
			/@media \(max-width: 47\.99rem\) \{[\s\S]*?\.record-page--split \.split-frame \.mark-slot \{[^}]*flex:\s*1 1 7\.5rem/,
		);
		assert.match(
			css,
			/\.record-page--split \.split-frame \.plate-frame \{[^}]*width:\s*auto;[^}]*min-width:\s*min\(11rem,\s*58%\)/s,
		);
		const splitCss = css.slice(css.indexOf('.record-page--split'));
		assert.match(splitCss, /\.record-page--split \{\s*--imagery-h:\s*58svh;\s*\}/);
		assert.match(splitCss, /\.split-imagery\s*\{[^}]*height:\s*var\(--imagery-h\)/s);
		assert.match(splitCss, /\.split-read\s*\{[^}]*top:\s*var\(--imagery-h\)/s);
		assert.match(splitCss, /margin-top:\s*var\(--imagery-h\)/);
		assert.match(splitCss, /height:\s*calc\(100svh - var\(--imagery-h\)\)/);
		assert.match(
			splitCss,
			/width:\s*min\(100%,\s*calc\(var\(--imagery-h\) \* var\(--plate-w\) \/ var\(--plate-h\)\)\)/,
		);
		const desktopStart = splitCss.indexOf('@media (min-width: 48rem)');
		const after = splitCss.slice(desktopStart + 10);
		const desktopBody = splitCss.slice(desktopStart, desktopStart + 10 + after.indexOf('@media'));
		assert.match(desktopBody, /\.split-imagery\s*\{[^}]*height:\s*100svh/s);
		assert.match(desktopBody, /\.split-read\s*\{[^}]*height:\s*100svh/s);
		assert.match(
			desktopBody,
			/width:\s*min\(100%,\s*calc\(100svh \* var\(--plate-w\) \/ var\(--plate-h\)\)\)/,
		);
		assert.doesNotMatch(desktopBody, /var\(--imagery-h\)/);
		const short = splitCss.slice(
			splitCss.indexOf('@media (max-width: 47.99rem) and (max-height: 32rem)'),
		);
		const shortBody = short.slice(0, short.indexOf('@media', 10));
		assert.match(shortBody, /--imagery-h:\s*42svh/);
		assert.doesNotMatch(shortBody, /height:\s*42svh/);
		assert.doesNotMatch(shortBody, /top:\s*42svh/);

		const astro = readFileSync(join(here, '../pages/records/[id].astro'), 'utf8');
		assert.match(astro, /laidOutSides\(/);
		assert.match(astro, /plateFloorPx\(/);
		assert.match(astro, /singleGutterPx\(/);
		assert.match(astro, /singlePlatePx\(/);
		assert.match(astro, /fitPlateToFloor\(/);
		assert.match(astro, /imageryHeightPx\(/);
		assert.match(astro, /--imagery-h/);
		assert.match(astro, /classList\.contains\('split-frame'\)/);
		assert.match(astro, /classList\.contains\('is-active'\)/);
		assert.match(astro, /stackTops\(/);
		assert.doesNotMatch(astro, /function stackTops/);
	});
});
```

The `width: auto` then `min-width: min(11rem, 58%)` assertion allows other declarations between them inside the same rule. Put `width: auto` before `min-width` in that rule.

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --experimental-strip-types --test src/data/detail-display.test.ts`

Expected: FAIL in `narrow stage`. The new exports are not defined. `--imagery-h` is absent. Imagery height is still the literal `58svh`.

- [ ] **Step 3: Add the gutter helpers**

Append these to `src/data/detail-display.ts`. `Side` is already declared in the file.

```ts
export const NARROW_FLOOR_REM = 11;
export const NARROW_FLOOR_OF_STAGE = 0.58;
export const NARROW_GAP_REM = 0.55;
export const NARROW_PAIR_MIN_REM = 7.5;
export const NARROW_SLOT_CAP_REM = 9.5;

export function plateFloorPx(stageWidth: number, rem: number): number {
	return Math.min(NARROW_FLOOR_REM * rem, NARROW_FLOOR_OF_STAGE * stageWidth);
}

export function pairGuttersFit(stageWidth: number, rem: number): boolean {
	const floor = plateFloorPx(stageWidth, rem);
	return stageWidth >= floor + 2 * NARROW_PAIR_MIN_REM * rem + 2 * NARROW_GAP_REM * rem;
}

/** More notes wins. An equal count goes right. No notes returns null. */
export function singleGutterSide(leftCount: number, rightCount: number): 'left' | 'right' | null {
	if (leftCount + rightCount === 0) return null;
	if (leftCount > rightCount) return 'left';
	return 'right';
}

export function singleGutterPx(stageWidth: number, rem: number): number {
	const room = stageWidth - NARROW_GAP_REM * rem - plateFloorPx(stageWidth, rem);
	return Math.min(NARROW_SLOT_CAP_REM * rem, Math.max(0, room));
}

export function singlePlatePx(stageWidth: number, rem: number): number {
	const floor = plateFloorPx(stageWidth, rem);
	const gutter = singleGutterPx(stageWidth, rem);
	return Math.max(floor, stageWidth - NARROW_GAP_REM * rem - gutter);
}

/** The stack is too tall: the plate goes to the floor. It does not shrink by only the overflow. */
export function fitPlateToFloor(usedPlatePx: number, floorPx: number, overflows: boolean): number {
	if (!overflows) return usedPlatePx;
	return floorPx;
}

/**
 * Pixel length for the inline `--imagery-h`, or null when the stylesheet height is enough.
 * Cap is 70svh in pixels. Needed is measured by the page, not here.
 */
export function imageryHeightPx(neededPx: number, initialPx: number, capPx: number): number | null {
	const capped = Math.min(capPx, Math.max(0, neededPx));
	if (capped <= initialPx) return null;
	return capped;
}

export type SideLayout = {
	sides: Array<'left' | 'right'>;
	gutters: 'resolved' | 'single';
};

export function laidOutSides(
	notes: readonly { side: Side; x: number; w: number }[],
	plateWidth: number,
	stageWidth: number,
	rem: number,
	narrow: boolean,
): SideLayout {
	const resolved = notes.map((note) => resolvedSide(note, plateWidth));
	if (!narrow || pairGuttersFit(stageWidth, rem)) {
		return { sides: resolved, gutters: 'resolved' };
	}
	const left = resolved.filter((side) => side === 'left').length;
	const gutter = singleGutterSide(left, resolved.length - left);
	if (gutter === null) return { sides: resolved, gutters: 'resolved' };
	return { sides: resolved.map(() => gutter), gutters: 'single' };
}
```

On a 390px phone, `W = 354`, `rem = 18`, `F = 198`, two gutters need `487.8`, so the phone takes one gutter. Cover notes are five left and one right, so every note goes left and the 40th Anniversary line joins that stack. The gutter is `min(171, 354 - 9.9 - 198)` (146.1) and the plate is 198. Label notes are one left and five right, so that plate’s gutter is the right. A 320px viewport has column `284`, `F = 0.58 * 284` (164.72), gutter about 109. The spec’s “146px” and “165px” are those values rounded. The tests use the formula.

`laidOutSides` does not mutate the note objects and does not write JSON. An explicit `left` or `right` is never flipped by `resolvedSide`. The equal-count tie is the single-gutter choice, after resolution.

- [ ] **Step 4: Run the unit tests**

Run: `node --experimental-strip-types --test src/data/detail-display.test.ts`

Expected: the two pure `narrow stage` tests PASS. The CSS/source `it` still FAIL until Steps 5 and 6. If the runner stops the file on the first failure, that is the CSS `it`. Do not weaken it.

- [ ] **Step 5: Teach `position()` the narrow stage**

Replace the script import with:

```ts
		import {
			fitPlateToFloor,
			imageryHeightPx,
			laidOutSides,
			leaderEndpoints,
			plateFloorPx,
			singleGutterPx,
			singlePlatePx,
			stackTops,
		} from '../../data/detail-display';
```

Drop `resolvedSide` from this import. The frontmatter import list stays.

Replace the whole `position` function with:

```ts
		function clearStageInline(stage: HTMLElement, frame: HTMLElement, items: readonly HTMLElement[]): void {
			frame.style.flex = '';
			frame.style.minWidth = '';
			frame.style.width = '';
			stage.querySelectorAll<HTMLElement>('.mark-slot').forEach((slot) => {
				slot.style.flex = '';
				slot.style.minWidth = '';
				slot.style.maxWidth = '';
				slot.style.width = '';
			});
			for (const li of items) li.style.maxWidth = '';
		}

		function noteMaxWidth(stage: HTMLElement, li: HTMLElement, rem: number): void {
			const cap = 9.5 * rem;
			const side = li.dataset.side === 'left' ? 'left' : 'right';
			const slot = stage.querySelector<HTMLElement>(`.mark-slot-${side}`);
			const used = slot ? slot.getBoundingClientRect().width : cap;
			li.style.maxWidth = `${Math.min(cap, Math.max(0, used))}px`;
		}

		function stackNotes(
			items: readonly HTMLLIElement[],
			plate: HTMLImageElement,
			plateHeight: number,
			gapPx: number,
		): void {
			for (const side of ['left', 'right'] as const) {
				const group = items.filter((li) => li.dataset.side === side);
				const tops = stackTops(
					group.map((li) => ({
						index: Number(li.dataset.index),
						anchor: Number(li.dataset.y) + Number(li.dataset.h) / 2,
						height: li.offsetHeight,
					})),
					plateHeight,
					plate.clientHeight,
					gapPx,
				);
				group.forEach((li, index) => {
					const top = tops[index];
					if (top === undefined) return;
					li.style.top = `${top}px`;
				});
			}
		}

		function measureSvh(value: number): number {
			const probe = document.createElement('div');
			probe.style.position = 'absolute';
			probe.style.visibility = 'hidden';
			probe.style.pointerEvents = 'none';
			probe.style.height = `${value}svh`;
			probe.style.width = '0';
			document.body.append(probe);
			const px = probe.getBoundingClientRect().height;
			probe.remove();
			return px;
		}

		function position(figure: HTMLElement): void {
			const plate = figure.querySelector<HTMLImageElement>('.plate');
			const list = figure.querySelector<HTMLOListElement>('.mark-list');
			if (!plate || !list) return;
			const plateWidth = Number(figure.dataset.plateWidth);
			const plateHeight = Number(figure.dataset.plateHeight);
			const items = [...list.querySelectorAll<HTMLLIElement>('li')];
			const stage = figure.querySelector<HTMLElement>('.detail-stage');
			const frame = figure.querySelector<HTMLElement>('.plate-frame');
			const root = remPx();
			const stageWidth = stage ? stage.clientWidth : 0;
			const inImagery = figure.classList.contains('split-frame');
			const narrow =
				inImagery &&
				stageWidth > 0 &&
				window.matchMedia('(max-width: 47.99rem)').matches;
			const layout = laidOutSides(
				items.map((li) => ({
					side:
						li.dataset.sidePref === 'left' ||
						li.dataset.sidePref === 'right' ||
						li.dataset.sidePref === 'auto'
							? li.dataset.sidePref
							: 'auto',
					x: Number(li.dataset.x),
					w: Number(li.dataset.w),
				})),
				plateWidth,
				stageWidth,
				root,
				narrow,
			);
			items.forEach((li, index) => {
				const side = layout.sides[index];
				if (side) li.dataset.side = side;
			});
			ensureSlots(figure);
			if (stage && frame) {
				if (!narrow) {
					clearStageInline(stage, frame, items);
				} else if (layout.gutters === 'single') {
					const floor = plateFloorPx(stageWidth, root);
					const gutter = singleGutterPx(stageWidth, root);
					const platePx = singlePlatePx(stageWidth, root);
					frame.style.flex = '0 0 auto';
					frame.style.minWidth = `${floor}px`;
					frame.style.width = `${platePx}px`;
					stage.querySelectorAll<HTMLElement>('.mark-slot').forEach((slot) => {
						slot.style.flex = '0 0 auto';
						slot.style.minWidth = '0';
						slot.style.maxWidth = '9.5rem';
						slot.style.width = `${gutter}px`;
					});
				} else {
					const floor = plateFloorPx(stageWidth, root);
					frame.style.flex = '1 1 auto';
					frame.style.minWidth = `${floor}px`;
					frame.style.width = '';
					const slots = [...stage.querySelectorAll<HTMLElement>('.mark-slot')];
					for (const slot of slots) {
						slot.style.flex = '1 1 7.5rem';
						slot.style.minWidth = slots.length >= 2 ? `${7.5 * root}px` : '0';
						slot.style.maxWidth = '9.5rem';
						slot.style.width = 'auto';
					}
				}
				if (narrow) {
					for (const li of items) noteMaxWidth(stage, li, root);
				}
			}
			stackNotes(items, plate, plateHeight, 0.35 * root);
			if (stage) {
				let hang = 0;
				for (const li of items) {
					const bottom = li.offsetTop + li.offsetHeight;
					if (bottom > plate.clientHeight) hang = Math.max(hang, bottom - plate.clientHeight);
				}
				stage.style.paddingBottom = hang > 0 ? `${hang}px` : '';
			}
			if (narrow && stage && frame && figure.classList.contains('is-active')) {
				const page = figure.closest<HTMLElement>('.record-page--split');
				const imagery = page?.querySelector<HTMLElement>('.split-imagery');
				if (page && imagery) {
					const floor = plateFloorPx(stageWidth, root);
					const imageryRect = imagery.getBoundingClientRect();
					let overflow = 0;
					for (const li of items) {
						const rect = li.getBoundingClientRect();
						overflow = Math.max(overflow, rect.bottom - imageryRect.bottom, imageryRect.top - rect.top);
					}
					const usedPlate = frame.getBoundingClientRect().width;
					if (overflow > 0.5 && usedPlate > floor + 0.5) {
						frame.style.flex = '0 0 auto';
						frame.style.width = `${fitPlateToFloor(usedPlate, floor, true)}px`;
						for (const li of items) noteMaxWidth(stage, li, root);
						stackNotes(items, plate, plateHeight, 0.35 * root);
					}
					void stage.offsetHeight;
					const stageRect = stage.getBoundingClientRect();
					let stickOut = 0;
					for (const li of items) {
						const rect = li.getBoundingClientRect();
						stickOut = Math.max(stickOut, rect.bottom - stageRect.bottom, stageRect.top - rect.top);
					}
					const needed = stageRect.height + 2 * stickOut;
					const short = window.matchMedia('(max-width: 47.99rem) and (max-height: 32rem)').matches;
					const next = imageryHeightPx(needed, measureSvh(short ? 42 : 58), measureSvh(70));
					if (next === null) page.style.removeProperty('--imagery-h');
					else page.style.setProperty('--imagery-h', `${next}px`);
				}
			} else if (!narrow && inImagery) {
				figure.closest<HTMLElement>('.record-page--split')?.style.removeProperty('--imagery-h');
			}
			writeLeaders(figure, items, plate, plateWidth, plateHeight);
		}
```

`narrow` is true only for a `.split-frame` below `48rem` with a measured stage. Legacy `.detail-figure` and a non-reveal figure in `.split-read` keep `resolvedSide` and the fixed slots. `data-side` is rewritten only for the one-gutter pass. `ensureSlots` then inserts that one slot. Leaders follow `data-side`, so every elbow leaves toward that column.

The note `li` is `position: absolute` against the plate, so a percentage `max-width` would resolve against the plate. The inline pixel `max-width` is the gutter’s used width, capped at `9.5rem`. Set it before `stackTops` reads `offsetHeight`, so the wrap is in the stack. `stackTops` itself is not edited.

`.split-frame` is `place-items: center`. Extra imagery height is split above and below the stage. Adding the bottom overflow once and then clearing `--imagery-h` whenever the current frame does not clip makes the band oscillate. After `paddingBottom`, the needed height is the stage border box, plus twice any note that still sticks out of that box. `imageryHeightPx` either clears the inline property or sets one pixel length up to `70svh`. Only the `.is-active` frame writes it. `applyAll` calls `setActive` before `position`, so the visible detail owns the band. Inactive frames still lay out their own notes and leaders. `showSettled` marks every frame active; the last frame’s measurement wins, and the reduced-motion rule `height: auto` does not read the variable. Turning motion back on runs `applyAll`, which writes the one active frame’s height.

On a 390px phone the plate is already at `F`, so `fitPlateToFloor` does not move it. Where the pair fits and the stack is taller than the band, the plate goes all the way to `F` and the gutters take the freed width, still capped at `9.5rem`. Then the band is measured again.

Do not move notes into `.split-read`. Do not repeat them there.

- [ ] **Step 6: Point the narrow CSS at `--imagery-h`**

Add this rule immediately before `.record-page--split .split-stage`:

```css
.record-page--split {
	--imagery-h: 58svh;
}
```

In `.record-page--split .split-imagery`, change `height: 58svh` to `height: var(--imagery-h)`. Leave `position: sticky`, `overflow: hidden`, and `background: var(--bg)`.

In `.record-page--split .split-read`, change the offsets to:

```css
	top: var(--imagery-h);
	height: calc(100svh - var(--imagery-h));
	margin-top: var(--imagery-h);
```

In `.record-page--split .split-frame .detail-stage`, change the width to:

```css
	width: min(100%, calc(var(--imagery-h) * var(--plate-w) / var(--plate-h)));
```

Leave the `@media (min-width: 48rem)` split block byte-for-byte. It still says `height: 100svh` on `.split-imagery` and on `.split-read`, `top: 0`, `margin-top: 0`, and `width: min(100%, calc(100svh * var(--plate-w) / var(--plate-h)))`. That block does not read `--imagery-h`.

Replace the whole `@media (max-width: 47.99rem) and (max-height: 32rem)` block with:

```css
@media (max-width: 47.99rem) and (max-height: 32rem) {
	.record-page--split {
		--imagery-h: 42svh;
	}
}
```

The base rules now follow the variable, so this query no longer repeats `height`, `top`, and `margin-top`.

After `.record-page--split .split-frame .plate-frame` (the rule that sets `width: 100%`), add:

```css
@media (max-width: 47.99rem) {
	.record-page--split .split-frame .mark-slot {
		flex: 1 1 7.5rem;
		width: auto;
		min-width: 0;
		max-width: 9.5rem;
	}

	.record-page--split .split-frame .plate-frame {
		flex: 1 1 auto;
		width: auto;
		min-width: min(11rem, 58%);
	}
}
```

`width: 100%` on the split plate would claim the whole stage and leave the gutters in the overflow. Below `48rem` the plate’s width comes from flex, and from the inline width when the script uses one gutter. `min(11rem, 58%)` is `F` against the stage. The base `.mark-slot` rule stays `flex: 0 0 9.5rem` for desktop and for legacy figures. This override is more specific and only matches `.split-frame` below `48rem`.

Leave `.mark-note` at `font-size: 0.78rem` and `line-height: 1.45`. Leave `.detail-stage { gap: 0.55rem }`. Leave the reduced-motion rules that set `.split-imagery { height: auto }`. They are later than the variable and they are what no-scrub pages use. Do not add an inner scroller.

- [ ] **Step 7: Run the tests and the type check**

Run: `node --experimental-strip-types --test src/data/detail-display.test.ts src/data/split-stage.test.ts && npm run check`

Expected: `# fail 0`, check PASS. `describe('runway css')` still passes. `describe('stageVisual')` still has `LEADERS_END === 0.88`.

- [ ] **Step 8: Commit**

```bash
git add src/data/detail-display.ts src/data/detail-display.test.ts 'src/pages/records/[id].astro' src/styles/global.css
git commit -m "fix(records): give the narrow stage one gutter and a plate floor"
```

---

### Task 5: Acceptance pass

**Files:** none new. Verify. If a check fails, fix it in the file that check names and commit `fix(records): <what the check caught>` before continuing.

**Interfaces:**
- Consumes: Tasks 1–4.
- Produces: a passing acceptance check against the spec’s seven bullets. `src/data/split-stage.ts`, `src/data/records.json`, and the 记述 strings are untouched.

- [ ] **Step 1: Run the automated checks**

```bash
node --experimental-strip-types --test src/data/detail-display.test.ts src/data/split-stage.test.ts
npm run check && npm run build
```

Expected: both test files `# fail 0`, check PASS, build PASS.

```bash
test "$(grep -c '<line' 'src/pages/records/[id].astro')" -eq 0
test "$(grep -c 'class="mark-leader"' 'src/pages/records/[id].astro')" -eq 3
test "$(grep -c 'class="mark-leader-mask"' 'src/pages/records/[id].astro')" -eq 3
test "$(grep -c 'SVGLineElement' 'src/pages/records/[id].astro')" -eq 0
test "$(grep -c "setAttribute('pathLength'" 'src/pages/records/[id].astro')" -eq 1
test "$(grep -c 'mark-leader-mask' 'src/pages/records/[id].astro')" -ge 1
test "$(grep -c 'stroke-dasharray: 6 5' src/styles/global.css)" -eq 1
test "$(grep -c 'is-plate' src/styles/global.css)" -ge 1
test "$(grep -c 'LEADERS_END = 0.88' src/data/split-stage.ts)" -eq 1
test "$(grep -c 'function cameraBox' src/data/split-stage.ts)" -eq 1
test "$(grep -o 'class="mark-leader"' dist/records/mhjl329/index.html | wc -l)" -eq 12
test "$(grep -o 'class="mark-leader-mask"' dist/records/mhjl329/index.html | wc -l)" -eq 12
test "$(grep -c '<line' dist/records/mhjl329/index.html)" -eq 0
test "$(grep -c 'pathLength' dist/records/mhjl329/index.html)" -eq 0
test "$(grep -c 'stroke-dasharray="1"' dist/records/mhjl329/index.html)" -eq 0
test "$(grep -c 'loading="eager"' dist/records/mhjl329/index.html)" -eq 4
test "$(grep -c 'loading="lazy"' dist/records/mhjl329/index.html)" -eq 0
test "$(grep -c 'fetchpriority="high"' dist/records/mhjl329/index.html)" -eq 1
test "$(grep -c 'is-plate' dist/records/mhjl329/index.html)" -eq 0
test "$(grep -c '40th Anniversary Senri Oe' dist/records/mhjl329/index.html)" -ge 1
test "$(grep -c '1988 年夏天，大江千里二十八岁' dist/records/mhjl329/index.html)" -eq 1
test "$(grep -c 'itinerary-' dist/records/mhjl329/index.html)" -eq 0
test "$(grep -c 'record-page--split' dist/records/ml4001/index.html)" -eq 0
test "$(grep -c 'record-split' dist/records/ml4001/index.html)" -ge 1
git diff --name-only main -- src/data/split-stage.ts src/data/split-stage.test.ts src/data/records.json src/data/records.ts
```

Expected: every `test` exits 0. `grep -c` on a missing pattern prints `0` and exits 1; the `test "$(…)" -eq 0` form is the one that must pass. `git diff --name-only` prints nothing. MHJL 329 renders two reveal frames and no legacy figure, so the built page has twelve leaders (label and cover, six each) and twelve masks. `is-plate` is added by the script, not by the server HTML. The four eager images are the two plates and the two uprights. `fetchpriority="high"` is the label plate only.

The built CSS is minified under `dist/_astro/`. Confirm the dash survived the build:

```bash
grep -R -l 'stroke-dasharray:6 5' dist/_astro
```

Expected: one stylesheet path. A minifier may drop the space after the colon. If the search misses, run `grep -R '6 5' dist/_astro` and confirm the hit is the leader rule, not a different property.

- [ ] **Step 2: Walk the spec acceptance list in the browser**

Dev server: `npm run dev -- --host 127.0.0.1 --port 4321`.

Viewport checks use a 16px initial font (`1rem` = 18px) and the light theme (`--accent` `#7c2d22`, `--bg` `#f3f0e8`).

| # | Check | How |
|---|---|---|
| 1 | Dashed elbow at the notes keypoint, desktop and 390×844 | `/records/mhjl329/`. Scroll to the end of the label pass, then to the end of the runway so the cover notes are on the photograph. Every leader is a horizontal stub, one corner, then a straight run that stops short of the note. No arrow. No third corner. Computed `stroke-dasharray` on `.mark-leader` is `6, 5`. The stroke is not a solid line. `badge` does not choose the side: cover mark 6 still resolves from its box, then the phone collapses it into the left stack. |
| 2 | Draw-in stays dashed | With motion allowed, scrub the leaders beat between boxes and notes (`LEADERS_END` 0.88). The visible stroke stays dashed and reveals from the box toward the note. At the end of the beat the pattern is `6 5`, including after a resize. In the Elements panel, `.mark-leader` has no `pathLength` and no `stroke-dasharray` attribute. `.mark-leader-mask` has `pathLength="1"` during the beat. Reduced motion (`prefers-reduced-motion: reduce`, reload) shows the same dashed elbow, with notes measured rather than the horizontal stand-in, and does not tween. No-JS shows the dashed horizontal stand-in, does not tween, and does not add `is-plate`. |
| 3 | Geometry fixtures | Already locked by Task 1. Re-run `node --experimental-strip-types --test src/data/detail-display.test.ts` if the browser pass edits any helper. |
| 4 | Plate pixels at 390×844 | On both the label and the cover, at the notes keypoint: the plate `img` has `naturalWidth` equal to its `width` attribute (400), computed opacity `1`, and the label or 腰封 artwork is visible inside the boxes. `.upright-clip` computed visibility is `hidden`. The cream ground does not replace the photograph. |
| 5 | One gutter at 390×844 | Cover uses one left gutter. Label uses one right gutter. The plate’s used width is at least `F` (198px at `1rem = 18`). No note rectangle intersects the plate rectangle. No note glyph intersects `.split-read`. 品相, 均衡, and 状态 stay in the reading column, under the imagery. |
| 6 | Desktop shell | At `min-width: 48rem` (check 1280×800) both gutters remain when both sides have notes. Imagery stays `100svh`. The reading column is still 题铭, 记述, 著录, and the folds. There is no itinerary row. |
| 7 | Scrub back, and the untouched camera | Scroll from the cover notes back to the upright hold. The plate hides and the upright shows. `cameraBox` and the beat constants are unchanged (the Step 1 diff is empty). 记述 still opens `1988 年夏天，大江千里二十八岁`. `npm run check` and `npm run build` already passed in Step 1. |

Also load `/records/ml4001/`. It still uses `.record-split` and has no `.record-page--split`. Any leader on that page is the same dashed elbow, not a second mobile style.

- [ ] **Step 3: Open the implementation PR from `main`**

The PR branch must descend from `main` after this plan is on `main`. Do not open it from the docs branch. Title: `feat(records): dashed elbow callouts and a visible mobile plate`. Body links this plan and the spec. State that `cameraBox`, `stageVisual` boundaries, `records.json`, 记述, and the legacy `.record-split` column structure are unchanged.

---

## Spec coverage self-check

| Spec / acceptance item | Task |
|---|---|
| Elbow polyline, 16px / half-gap / two-point, horizontal stub, one corner | 1 |
| Endpoints unchanged, including the existing `(50, 25)` / `(466, 40)` fixture and corner `(66, 25)` | 1 |
| `gap < 4` returns two points. Plate 0×0 publishes none | 1 |
| Server horizontal stand-in until `position()` measures. No-JS keeps it, dashed, and does not tween | 1, 2 |
| Same helper on desktop and mobile. `badge` is not an input | 1, 4 |
| Visible `6 5` dash, butt, miter, miter limit 2, `var(--accent)`, `CanvasText` in forced-colors | 2 |
| Script does not set `pathLength` or `stroke-dasharray` on `.mark-leader`. `settle()` does not write `stroke-dashoffset: 0` on it | 2 |
| Mask draw-in on the existing leaders beat. Mask stroke 3px, solid, not class `mark-leader`. Fully open when `data-motion` is not `ok` | 2 |
| `showSettled` calls `position()`. Reduced motion does not tween | 2 |
| Three markup copies change together | 1, 2 |
| `loading="eager"` on split plates and uprights. `fetchpriority="high"` only on the first plate | 3 |
| `is-plate` while `plateOpacity === 1`, after the hold, plate shown, veil hidden, callout opacity untouched | 3 |
| Clip `visibility: hidden` when `uprightOpacity === 0` | 3 |
| `clearScrubStyles` still clears plate and callout opacities together, and is not used while `data-motion` stays `ok` | 2, 3 |
| One gutter when `W < F + 2M + 2G`. Busier side wins. Tie goes right. Plate floor `F`. Note `max-width` is the gutter | 4 |
| Cover at 354px goes left. Label at 354px goes right. Pair still fits at 827px | 4 |
| Notes stay in the imagery band. `stackTops` unchanged. `--imagery-h` up to `70svh` below `48rem` only | 4 |
| Desktop slots stay `flex: 0 0 9.5rem`. Desktop imagery stays literal `100svh` | 4 |
| Legacy `.record-split` column structure unchanged, elbow and dash shared | 1, 2, 4, 5 |
| `cameraBox`, beat constants, `records.json`, 记述 unchanged | Global, 5 |
| Acceptance bullets 1–7 | 5 |
| No itinerary, loupe, new marks, or numbered list in the reading column | Global, 5 |

## Out of scope (do not implement here)

- Itinerary rows, stage labels, or tall scrub chrome in the reading column.
- A loupe or any magnifier.
- New records, new marks, or new detail parts.
- Editing 记述, captions, alts, `detailsNote`, or `marks[].note`.
- Putting the numbered ①–⑥ lines back into the reading column.
- Changing `cameraBox`, `stageVisual` boundaries, `DETAIL_CROSSFADE_MS`, or the runway’s svh lengths.
- A second leader style for mobile, a curved leader, or an arrowhead.
- Routing leaders around each other.
- Dark-mode callout art beyond the existing `--accent` token.
- Legacy `.record-split` column structure, other than the shared elbow and dash on its leaders.
- Treating the missing plate as only an opacity keyframe. The image request, the clip veil, and the gutter floor change with it.
