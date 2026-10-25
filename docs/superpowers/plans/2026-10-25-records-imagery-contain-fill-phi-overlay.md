# Contain-maximized opening, φ split, and margin-first notes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On reveal records, contain-maximize the upright in the imagery pane, settle a smaller centered plate so the move reads as a zoom-in, split the desktop columns φ:1, and park callout notes in the paper margin with a paper-scrim fallback on the plate.

**Architecture:** Pure geometry stays in `src/data/detail-display.ts`: opening box `U`, settled plate `S`, the two-scale zoom path, and the side / letterbox / scrim decision. `cameraBox` in `src/data/split-stage.ts` is not edited. The page measures the imagery pane, places the upright on that path, and sizes the plate frame to `S`. Split frames stop reserving `.mark-slot`. Legacy `.record-split` keeps its slots and `stackTops`.

**Tech Stack:** Astro static pages, vanilla TypeScript in the page `<script>`, CSS custom properties and container query units, pure helpers in `src/data/detail-display.ts` tested with `node:test`. No scroll library. This package has no `npm test` script. The records check is `node --experimental-strip-types --test`, then `npm run check` and `npm run build`. Node `>=22.23.4`.

**Spec:** [`docs/superpowers/specs/2026-10-25-records-imagery-contain-fill-phi-overlay-design.md`](../specs/2026-10-25-records-imagery-contain-fill-phi-overlay-design.md)

**Checked against:** `main` at `76f9ae5` (spec squash `#41`). Code reality is the shipped elbow-callout page at that commit: `src/pages/records/[id].astro`, `src/styles/global.css`, `src/data/detail-display.ts`, `src/data/detail-display.test.ts`, `src/data/split-stage.ts`, `src/data/split-stage.test.ts`, MHJL 329 in `src/data/records.json`.

**Branch:** cut the implementation branch from `main` after this plan is on `main`. Do not implement these tasks on the docs branch.

## Global Constraints

- Opening scale is uniform. `s0 = min(P.width / naturalW, P.height / naturalH)`. The upright file is fully inside `U`. At least one axis of `U` is flush with the pane. `object-fit: cover` is not the opening. The script may keep `upright.style.objectFit = 'fill'` because it assigns the bitmap’s pixel box; it must not assign `'cover'`.
- `S` is centered in the pane `P` (`.split-frame`’s content box, which fills `.split-imagery`). Its aspect is `plate.width / plate.height`. Notes, leaders, and the reading column do not resize it. It does not change between the end of the zoom and the settled notes.
- Plate fit factors, copied from the spec: first fit is the plate aspect contain-fit inside `U` scaled by `0.72` about its center. Keep that fit when `s1 >= 1.25 × s0`. Otherwise grow uniformly until `s1` is `1.25 × s0` or a side would pass `0.92` of the matching side of `U`, whichever comes first. `s0 = U.width / naturalW`. `s1 = min(S.width / crop.w, S.height / crop.h)`.
- `cameraBox` and `stageVisual` are not edited. `UPRIGHT_END` `0.08`, `ZOOM_END` `0.40`, `PLATE_END` `0.52`, `BOXES_END` `0.76`, `LEADERS_END` `0.88`, `PASS_SVH` `140`, `JOINT_SVH` `28`, and `DETAIL_CROSSFADE_MS` `1600` stay. Do not edit `src/data/split-stage.ts`. Do not edit `src/data/split-stage.test.ts` except the one `cameraBox(` source match in Task 4.
- The path from `U` to `S` is geometric in scale: `s = s0 * (s1 / s0) ** cropT`. The crop center moves in a straight line from its center inside `U` to the center of `S`. It is not `lerpBox`. It is not one `cameraBox` call of a single view for every `cropT`. `angleDeg` is not read.
- Desktop tracks at `min-width: 48rem`: `grid-template-columns: minmax(0, 1.618fr) minmax(0, 1fr)`. `1.618` is φ to three decimals. Imagery is the first track. `column-gap` stays `0`. Imagery stays `height: 100svh`, sticky, `overflow: hidden`. Reading stays `grid-column: 2`, `height: 100svh`, `max-width: 46ch`, `padding: 0 0 0 1.25rem`. The `46ch` cap does not give width back to the imagery track. The breakpoint stays `48rem`. Do not rewrite it as `768px`.
- `html` stays `font-size: 112.5%`. Acceptance uses a 16px initial font, so `1rem` is 18px. `.layout-wide .column` stays `min(72rem, calc(100% - 2rem))`.
- Below `48rem`, one column. `--imagery-h` stays `58svh`, and `42svh` when `max-width: 47.99rem` and `max-height: 32rem`. Do not raise it. Do not write an inline `--imagery-h` to make a gutter. The reading column’s `top`, `height`, and `margin-top` keep using `var(--imagery-h)`.
- Note placement constants: `MIN_NOTE_W` = `6.5rem` (117px), `MIN_BAND_H` = `2.6rem` (46.8px), note width at most `9.5rem` (171px), stack gap `0.35rem`, scrim inset `0.55rem`, scrim padding `0.35rem 0.45rem`. Note type stays `0.78rem` / line-height `1.45`. `resolvedSide` is unchanged. `badge` does not choose the side. JSON `side` is unchanged.
- Scrim background is `var(--bg)`, opaque, behind that note’s glyphs only. Margin notes and letterbox notes get no extra background. No new color and no new font. Box and leader stroke stay `var(--accent)`.
- Elbow polyline, stub thresholds (`32` / `4`, stub `16`), `stroke-dasharray: 6 5`, caps, join, mask draw-in, and `LEADERS_END` stay. Do not edit `leaderEndpoints`. The end stays `0.35rem` short of the note’s inner edge. After placement, omit a leader whose centerline intersects that note’s border box. Omit the leader the scrim fallback already marked. Do not add a second corner.
- Split frames (`.record-page--split .split-frame`) do not render `.mark-slot` and do not use slots to size the plate. Legacy `.record-split` still renders its slots and still uses `.mark-slot { flex: 0 0 9.5rem }`, including ml4001.
- The reading column does not gain a ①–⑥ list, a `marks.note` list, or a second copy of notes. `visibleDetailText` and `showDetailsNote` stay the filter.
- Copy stays. Do not edit `src/data/records.json`, 记述, captions, alts, `detailsNote`, or `marks[].note`. Do not add marks, records, a loupe, or itinerary rows.
- `*` already sets `box-sizing: border-box` in `src/styles/global.css`. Scrim padding is inside the placed width. Do not switch notes to `content-box`.
- Primary URL: `/records/mhjl329/` (label, then cover). Legacy check: `/records/ml4001/`.

Worked panes from the spec, used by the tests below. `1rem` = 18px. Desktop column at 1440×900 with no scrollbar: `min(72 × 18, 1440 − 36) = 1296`. Imagery = `1296 × 1.618 / 2.618` = 800.9656…, which rounds to the spec’s 801×900 pane. Tests of `U` and `S` pass that 801×900 pane and the spec’s 354×489.5 phone pane directly.

| Detail | File | 801×900 | 354×489.5 |
|---|---|---|---|
| Label `U` | 1050×1400, crop 514×514 | 675×900, left 63, top 0 | 354×472, left 0, top 8.75 |
| Label `S` | plate 400×400 | 486×486, left 157.5, top 207 | 254.88×254.88, rounds to 255×255 |
| Cover `U` | 1400×1400, crop 379×235 | 801×801, left 0, top 49.5 | 354×354, left 0, top 67.75 |
| Cover `S` | plate 400×248 | 576.72×357.5664, rounds to 577×358 | 254.88×158.0256, rounds to 255×158 |

Label magnification is `0.72 × 1050 / 514` = 1.4708…. Cover `s1` is a hair height-limited because crop `379/235` is slightly narrower than plate `400/248`; `s1 / s0` is still 2.66 to two decimals. Do not force the cover test to equal `0.72 × 1400 / 379`.

## File map

| Path | Responsibility |
|------|----------------|
| `src/data/detail-display.ts` | `openingBox`, `plateBox`, `zoomImageBox`, `placeNotes`, `leaderHitsNote`. Constants `0.72` / `1.25` / `0.92` and the note-band thresholds. `leaderEndpoints`, `stackTops`, `resolvedSide`, and `visibleDetailText` stay. The narrow-gutter helpers stay exported for their existing tests; the split page stops calling them. |
| `src/data/detail-display.test.ts` | Worked `U` / `S` numbers, the grow and 92% cap, the two-view zoom, margin / letterbox / scrim decisions, leader omission, and the CSS / Astro source reads this layout replaces. |
| `src/data/split-stage.test.ts` | One retarget in Task 4: the page matches `zoomImageBox(` with `visual.cropT`, and no longer matches `cameraBox(`. Every other test stays. |
| `src/pages/records/[id].astro` | Split frames drop `.mark-slot`. The upright clip is a child of `.split-frame`, so the hold and the zoom clip to the pane. `layoutSplit` writes `S`. `applyFrame` places the upright with `zoomImageBox`. `positionSplit` places notes and sets `is-scrim`. `writeLeaders` drops a leader that meets its note. Legacy `.record-split` and `.detail-figure` keep slots and `stackTops`. |
| `src/styles/global.css` | Desktop `1.618fr 1fr`. Split stage fills the pane. Plate frame centers and, before the script writes pixels, caps at 72% of the pane. Scrim background. No split-frame slot sizing. `--imagery-h` values stay. |
| `docs/superpowers/plans/2026-10-25-records-imagery-contain-fill-phi-overlay.md` | This plan. |

Do **not** touch `src/data/split-stage.ts`, `src/data/records.json`, `src/data/records.ts`, `src/pages/records.astro`, or `public/records/**`.

Existing tests to leave green:

- `src/data/detail-display.test.ts` — `describe('geometry')`, `describe('leader stroke')`, `describe('mhjl329 published callouts')`, `describe('plate hold')`, and the narrow-gutter unit tests (`plateFloorPx`, `laidOutSides`, `imageryHeightPx`, and the rest of `describe('narrow stage')` except the source-read `it` this plan rewrites).
- `src/data/split-stage.test.ts` — `describe('cameraBox')`, `describe('stageVisual')`, and `describe('runway css')` stay byte-for-byte. `describe('runway css')` still expects `.split-read` at `grid-column: 2` and `max-width: 46ch`.
- `src/data/split-stage.test.ts` — `describe('itinerary scroll helpers')` keeps `1 - visual.leadersOpacity`, `lerpBox` absent, and `angleDeg` absent. Task 4 changes only the `cameraBox(` match.

---

### Task 1: Opening box `U` and settled plate `S`

**Files:**
- Modify: `src/data/detail-display.ts` (append the helpers; do not edit `leaderEndpoints` or `stackTops`)
- Modify: `src/data/detail-display.test.ts` (import list, new `describe('contain and plate box')`)
- Test: `src/data/detail-display.test.ts`

**Interfaces:**
- Consumes: `Crop` already exported from `src/data/detail-display.ts`.
- Produces:

```ts
export const OPEN_INSET = 0.72;
export const ZOOM_GAIN = 1.25;
export const PLATE_CAP = 0.92;

export type FrameBox = { left: number; top: number; width: number; height: number };
export type PxSize = { width: number; height: number };

export function openingBox(pane: PxSize, natural: PxSize): FrameBox;

export function plateBox(
	pane: PxSize,
	opening: FrameBox,
	plate: PxSize,
	natural: PxSize,
	crop: Crop,
): FrameBox;
```

`openingBox` contain-fits `natural` in `pane` and centers it. `plateBox` returns `S` centered in `pane`. A non-positive pane, opening, or plate returns `{ left: 0, top: 0, width: 0, height: 0 }`. A non-positive crop skips the grow check and keeps the 0.72 fit.

- [ ] **Step 1: Write the failing test**

Add these names to the import from `./detail-display.ts`:

```ts
	OPEN_INSET,
	PLATE_CAP,
	ZOOM_GAIN,
	openingBox,
	plateBox,
	type FrameBox,
	type PxSize,
```

Append this describe. Leave every existing describe as it is.

```ts
describe('contain and plate box', () => {
	const labelNatural: PxSize = { width: 1050, height: 1400 };
	const coverNatural: PxSize = { width: 1400, height: 1400 };
	const labelPlate: PxSize = { width: 400, height: 400 };
	const coverPlate: PxSize = { width: 400, height: 248 };
	const labelCrop = { x: 274, y: 403, w: 514, h: 514 };
	const coverCrop = { x: 219, y: 210, w: 379, h: 235 };
	const desk: PxSize = { width: 801, height: 900 };
	const phone: PxSize = { width: 354, height: 489.5 };

	function near(actual: number, expected: number, tol = 1e-6): void {
		assert.ok(
			Math.abs(actual - expected) <= tol,
			`${actual} not within ${tol} of ${expected}`,
		);
	}

	it('contain-maximizes the upright in the pane', () => {
		assert.equal(OPEN_INSET, 0.72);
		assert.equal(ZOOM_GAIN, 1.25);
		assert.equal(PLATE_CAP, 0.92);

		const label = openingBox(desk, labelNatural);
		assert.equal(label.width, 675);
		near(label.height, 900);
		assert.equal(label.left, 63);
		near(label.top, 0);

		const cover = openingBox(desk, coverNatural);
		assert.equal(cover.width, 801);
		assert.equal(cover.height, 801);
		assert.equal(cover.left, 0);
		assert.equal(cover.top, 49.5);

		const phoneLabel = openingBox(phone, labelNatural);
		assert.equal(phoneLabel.width, 354);
		assert.equal(phoneLabel.height, 472);
		assert.equal(phoneLabel.left, 0);
		assert.equal(phoneLabel.top, 8.75);

		const phoneCover = openingBox(phone, coverNatural);
		near(phoneCover.width, 354);
		near(phoneCover.height, 354);
		near(phoneCover.left, 0);
		near(phoneCover.top, 67.75);

		assert.deepEqual(openingBox({ width: 0, height: 900 }, labelNatural), {
			left: 0,
			top: 0,
			width: 0,
			height: 0,
		});
	});

	it('fits MHJL 329 plates inside 72% of the opening and keeps the zoom gain', () => {
		const labelU = openingBox(desk, labelNatural);
		const labelS = plateBox(desk, labelU, labelPlate, labelNatural, labelCrop);
		assert.equal(labelS.width, 486);
		assert.equal(labelS.height, 486);
		assert.equal(labelS.left, 157.5);
		assert.equal(labelS.top, 207);
		assert.ok(labelS.width < labelU.width);
		assert.ok(labelS.height < labelU.height);
		const labelMag = 486 / 514 / (675 / 1050);
		near(labelMag, 0.72 * (1050 / 514));
		near(labelMag, 1.47, 0.005);

		const coverU = openingBox(desk, coverNatural);
		const coverS = plateBox(desk, coverU, coverPlate, coverNatural, coverCrop);
		const coverFitW = 801 * 0.72;
		const coverFitH = coverFitW * (248 / 400);
		near(coverS.width, coverFitW);
		near(coverS.height, coverFitH);
		assert.equal(Math.round(coverS.width), 577);
		assert.equal(Math.round(coverS.height), 358);
		assert.equal(coverS.left, (801 - coverS.width) / 2);
		assert.equal(coverS.top, (900 - coverS.height) / 2);
		assert.ok(coverS.width < coverU.width && coverS.height < coverU.height);
		const coverS1 = Math.min(coverS.width / 379, coverS.height / 235);
		const coverS0 = coverU.width / 1400;
		assert.ok(coverS1 >= 1.25 * coverS0);
		near(coverS1 / coverS0, 2.66, 0.01);

		const phoneLabelS = plateBox(
			phone,
			openingBox(phone, labelNatural),
			labelPlate,
			labelNatural,
			labelCrop,
		);
		assert.equal(Math.round(phoneLabelS.width), 255);
		assert.equal(Math.round(phoneLabelS.height), 255);
		const phoneCoverS = plateBox(
			phone,
			openingBox(phone, coverNatural),
			coverPlate,
			coverNatural,
			coverCrop,
		);
		assert.equal(Math.round(phoneCoverS.width), 255);
		assert.equal(Math.round(phoneCoverS.height), 158);

		const before = { ...labelS };
		plateBox(desk, labelU, labelPlate, labelNatural, labelCrop);
		assert.deepEqual(labelS, before);
	});

	it('grows a weak zoom up to 1.25 and stops at 92% of the opening', () => {
		const pane: PxSize = { width: 1000, height: 1000 };
		const natural: PxSize = { width: 1000, height: 1000 };
		const plate: PxSize = { width: 400, height: 400 };
		const opening = openingBox(pane, natural);
		const grown = plateBox(pane, opening, plate, natural, { x: 0, y: 0, w: 720, h: 720 });
		assert.equal(grown.width, 900);
		assert.equal(grown.height, 900);
		assert.ok(grown.width < opening.width);
		const capped = plateBox(pane, opening, plate, natural, { x: 0, y: 0, w: 900, h: 900 });
		near(capped.width, 920);
		near(capped.height, 920);
		near(capped.width / 900, 0.92 * (1000 / 900));
		assert.deepEqual(plateBox(pane, opening, { width: 0, height: 400 }, natural, labelCrop), {
			left: 0,
			top: 0,
			width: 0,
			height: 0,
		});
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types --test --test-name-pattern "contain-maximizes the upright" src/data/detail-display.test.ts`

Expected: FAIL while the module loads. The message names `openingBox` as a missing export.

- [ ] **Step 3: Write minimal implementation**

Append to `src/data/detail-display.ts`:

```ts
export const OPEN_INSET = 0.72;
export const ZOOM_GAIN = 1.25;
export const PLATE_CAP = 0.92;

export type FrameBox = { left: number; top: number; width: number; height: number };
export type PxSize = { width: number; height: number };

const ZERO_BOX: FrameBox = { left: 0, top: 0, width: 0, height: 0 };

export function openingBox(pane: PxSize, natural: PxSize): FrameBox {
	if (pane.width <= 0 || pane.height <= 0 || natural.width <= 0 || natural.height <= 0) {
		return { ...ZERO_BOX };
	}
	const scale = Math.min(pane.width / natural.width, pane.height / natural.height);
	const width = natural.width * scale;
	const height = natural.height * scale;
	return {
		left: (pane.width - width) / 2,
		top: (pane.height - height) / 2,
		width,
		height,
	};
}

export function plateBox(
	pane: PxSize,
	opening: FrameBox,
	plate: PxSize,
	natural: PxSize,
	crop: Crop,
): FrameBox {
	if (
		pane.width <= 0 ||
		pane.height <= 0 ||
		opening.width <= 0 ||
		opening.height <= 0 ||
		plate.width <= 0 ||
		plate.height <= 0
	) {
		return { ...ZERO_BOX };
	}
	const insetW = opening.width * OPEN_INSET;
	const insetH = opening.height * OPEN_INSET;
	const aspect = plate.width / plate.height;
	let fitW = insetW;
	let fitH = insetW / aspect;
	if (fitH > insetH) {
		fitH = insetH;
		fitW = insetH * aspect;
	}
	let width = fitW;
	let height = fitH;
	const s0 = natural.width > 0 ? opening.width / natural.width : 0;
	const cropOk = crop.w > 0 && crop.h > 0;
	const s1 = cropOk ? Math.min(fitW / crop.w, fitH / crop.h) : Number.POSITIVE_INFINITY;
	const target = ZOOM_GAIN * s0;
	if (s0 > 0 && cropOk && s1 < target) {
		const cap = Math.min((PLATE_CAP * opening.width) / fitW, (PLATE_CAP * opening.height) / fitH);
		const gain = Math.min(target / s1, cap);
		width = fitW * gain;
		height = fitH * gain;
	}
	return {
		left: (pane.width - width) / 2,
		top: (pane.height - height) / 2,
		width,
		height,
	};
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --experimental-strip-types --test src/data/detail-display.test.ts`

Expected: PASS, including the previous describes.

- [ ] **Step 5: Commit**

```bash
git add src/data/detail-display.ts src/data/detail-display.test.ts
git commit -m "feat(records): contain the upright and fit a smaller plate"
```

---

### Task 2: Zoom path between `U` and `S`

**Files:**
- Modify: `src/data/detail-display.ts` (append `zoomImageBox` only)
- Modify: `src/data/detail-display.test.ts`
- Test: `src/data/detail-display.test.ts`
- Do not modify: `src/data/split-stage.ts`, `src/data/split-stage.test.ts`

**Interfaces:**
- Consumes: `FrameBox`, `PxSize`, `Crop`, `openingBox`, `plateBox` from Task 1. `cameraBox` from `src/data/split-stage.ts` is imported by the test only, to prove this path is a different curve.
- Produces:

```ts
export function zoomImageBox(args: {
	opening: FrameBox;
	plate: FrameBox;
	natural: PxSize;
	crop: Crop;
	cropT: number;
}): FrameBox;
```

`cropT` clamps to `[0, 1]`. `cropT = 0` returns `opening`. `cropT = 1` places the crop’s contain-rect at `plate`’s center. Scale is `s0 * (s1 / s0) ** cropT` with `s0 = opening.width / natural.width` and `s1 = min(plate.width / crop.w, plate.height / crop.h)`. The crop center travels in a straight line from its center inside `opening` to the center of `plate`.

- [ ] **Step 1: Write the failing test**

Add `zoomImageBox` to the import from `./detail-display.ts`.

Add this import beside it:

```ts
import { cameraBox } from './split-stage.ts';
```

Append:

```ts
describe('zoom path', () => {
	const desk = { width: 801, height: 900 };
	const natural = { width: 1050, height: 1400 };
	const crop = { x: 274, y: 403, w: 514, h: 514 };
	const opening = openingBox(desk, natural);
	const plate = plateBox(desk, opening, { width: 400, height: 400 }, natural, crop);

	function near(actual: number, expected: number, tol = 1e-6): void {
		assert.ok(Math.abs(actual - expected) <= tol, `${actual} vs ${expected}`);
	}

	it('starts on U, ends with the crop on S, and scales geometrically', () => {
		const start = zoomImageBox({ opening, plate, natural, crop, cropT: 0 });
		assert.equal(start.left, opening.left);
		assert.equal(start.top, opening.top);
		assert.equal(start.width, opening.width);
		assert.equal(start.height, opening.height);

		const end = zoomImageBox({ opening, plate, natural, crop, cropT: 1 });
		const s1 = Math.min(plate.width / crop.w, plate.height / crop.h);
		near(end.left + crop.x * s1, plate.left);
		near(end.top + crop.y * s1, plate.top);
		near(crop.w * s1, plate.width);
		near(crop.h * s1, plate.height);

		const mid = zoomImageBox({ opening, plate, natural, crop, cropT: 0.5 });
		const s0 = opening.width / natural.width;
		near(mid.width / natural.width, s0 * Math.sqrt(s1 / s0));
		const focusX = crop.x + crop.w / 2;
		const focusY = crop.y + crop.h / 2;
		const cx0 = opening.left + focusX * s0;
		const cy0 = opening.top + focusY * s0;
		const cx1 = plate.left + plate.width / 2;
		const cy1 = plate.top + plate.height / 2;
		near(mid.left + focusX * (mid.width / natural.width), (cx0 + cx1) / 2);
		near(mid.top + focusY * (mid.height / natural.height), (cy0 + cy1) / 2);

		const below = zoomImageBox({ opening, plate, natural, crop, cropT: -1 });
		assert.equal(below.width, opening.width);
		const above = zoomImageBox({ opening, plate, natural, crop, cropT: 2 });
		near(above.width, end.width);
	});

	it('is not one cameraBox view for the whole zoom', () => {
		const end = zoomImageBox({ opening, plate, natural, crop, cropT: 1 });
		const paneEnd = cameraBox(801, 900, 1050, 1400, crop, 1);
		const plateStart = cameraBox(plate.width, plate.height, 1050, 1400, crop, 0);
		assert.ok(Math.abs(end.width - paneEnd.width) > 50);
		assert.ok(Math.abs(opening.width - plateStart.width) > 50);

		const here = dirname(fileURLToPath(import.meta.url));
		const source = readFileSync(join(here, 'split-stage.ts'), 'utf8');
		const body = source.slice(
			source.indexOf('export function cameraBox('),
			source.indexOf('export function stageVisual('),
		);
		assert.match(body, /const s0 = Math\.min\(viewW \/ naturalW, viewH \/ naturalH\);/);
		assert.match(body, /const s1 = Math\.min\(viewW \/ crop\.w, viewH \/ crop\.h\);/);
		assert.match(
			body,
			/const s = s0 === s1 \|\| s0 <= 0 \|\| s1 <= 0 \? s0 : s0 \* \(s1 \/ s0\) \*\* u;/,
		);
		assert.match(body, /const cx = cx0 \+ \(viewW \/ 2 - cx0\) \* u;/);
		assert.match(body, /const cy = cy0 \+ \(viewH \/ 2 - cy0\) \* u;/);
		assert.equal(body.includes('0.72'), false);
		assert.equal(body.includes('1.618'), false);
		assert.equal(body.includes('zoomImageBox'), false);
		assert.equal(source.includes('lerpBox'), false);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types --test --test-name-pattern "starts on U" src/data/detail-display.test.ts`

Expected: FAIL while the module loads. The message names `zoomImageBox` as a missing export.

- [ ] **Step 3: Write minimal implementation**

Append to `src/data/detail-display.ts`. Do not import `cameraBox`. Do not edit `src/data/split-stage.ts`.

```ts
export function zoomImageBox(args: {
	opening: FrameBox;
	plate: FrameBox;
	natural: PxSize;
	crop: Crop;
	cropT: number;
}): FrameBox {
	const u = Math.min(1, Math.max(0, args.cropT));
	const s0 = args.natural.width > 0 ? args.opening.width / args.natural.width : 0;
	const s1 =
		args.crop.w > 0 && args.crop.h > 0
			? Math.min(args.plate.width / args.crop.w, args.plate.height / args.crop.h)
			: s0;
	const s = s0 === s1 || s0 <= 0 || s1 <= 0 ? s0 : s0 * (s1 / s0) ** u;
	const focusX = args.crop.x + args.crop.w / 2;
	const focusY = args.crop.y + args.crop.h / 2;
	const cx0 = args.opening.left + focusX * s0;
	const cy0 = args.opening.top + focusY * s0;
	const cx1 = args.plate.left + args.plate.width / 2;
	const cy1 = args.plate.top + args.plate.height / 2;
	const cx = cx0 + (cx1 - cx0) * u;
	const cy = cy0 + (cy1 - cy0) * u;
	return {
		left: cx - focusX * s,
		top: cy - focusY * s,
		width: args.natural.width * s,
		height: args.natural.height * s,
	};
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --experimental-strip-types --test src/data/detail-display.test.ts src/data/split-stage.test.ts`

Expected: PASS. `src/data/split-stage.test.ts` is unchanged.

- [ ] **Step 5: Commit**

```bash
git add src/data/detail-display.ts src/data/detail-display.test.ts
git commit -m "feat(records): zoom from the pane opening to the smaller plate"
```

---

### Task 3: φ columns, pane-sized stage, no-JS 72% cap

**Files:**
- Modify: `src/styles/global.css` (`.record-page--split` rules only)
- Modify: `src/data/detail-display.test.ts` (the `it` named `sizes the narrow imagery band from --imagery-h and leaves the desktop pane at 100svh`)
- Test: `src/data/detail-display.test.ts`
- Do not modify: `src/pages/records/[id].astro` in this task

**Interfaces:**
- Consumes: nothing from Tasks 1–2. The script still measures the old plate frame until Task 4.
- Produces: desktop tracks `minmax(0, 1.618fr) minmax(0, 1fr)`. `.split-imagery` is a size container. A split plate frame is centered and, until the script sets pixel `S`, each side is at most 72% of that container. Split-frame `.mark-slot` is `display: none`. The narrow `7.5rem` slot rule and `min(11rem, 58%)` plate floor are gone. `--imagery-h: 58svh` and the `42svh` short-height override stay. Legacy `.mark-slot { flex: 0 0 9.5rem }` stays.

- [ ] **Step 1: Write the failing test**

Replace the whole `it` named `sizes the narrow imagery band from --imagery-h and leaves the desktop pane at 100svh` with:

```ts
	it('sizes the narrow imagery band from --imagery-h and leaves the desktop pane at 100svh', () => {
		const here = dirname(fileURLToPath(import.meta.url));
		const css = readFileSync(join(here, '../styles/global.css'), 'utf8');
		assert.match(css, /\.mark-slot \{\s*flex:\s*0 0 9\.5rem/);
		const splitCss = css.slice(css.indexOf('.record-page--split'));
		assert.match(splitCss, /\.record-page--split \{\s*--imagery-h:\s*58svh;\s*\}/);
		assert.match(splitCss, /\.split-imagery\s*\{[^}]*height:\s*var\(--imagery-h\)/s);
		assert.match(splitCss, /\.split-imagery\s*\{[^}]*container-type:\s*size/s);
		assert.match(splitCss, /\.split-read\s*\{[^}]*top:\s*var\(--imagery-h\)/s);
		assert.match(splitCss, /margin-top:\s*var\(--imagery-h\)/);
		assert.match(splitCss, /height:\s*calc\(100svh - var\(--imagery-h\)\)/);
		assert.match(
			splitCss,
			/\.record-page--split \.split-frame \.detail-stage \{\s*position:\s*relative;\s*width:\s*100%;\s*height:\s*100%;\s*max-height:\s*100%;\s*\}/,
		);
		assert.match(
			splitCss,
			/\.record-page--split \.split-frame \.plate-frame \{[^}]*left:\s*50%;[^}]*top:\s*50%;[^}]*transform:\s*translate\(-50%,\s*-50%\)/s,
		);
		assert.match(
			splitCss,
			/\.record-page--split \.split-frame \.plate \{[^}]*max-width:\s*72cqw;[^}]*max-height:\s*72cqh/s,
		);
		assert.match(splitCss, /\.split-frame \.mark-slot \{\s*display:\s*none;\s*\}/);
		assert.equal(splitCss.includes('flex: 1 1 7.5rem'), false);
		assert.equal(splitCss.includes('min(11rem, 58%)'), false);
		assert.equal(splitCss.includes('object-fit: cover'), false);
		assert.equal(
			splitCss.includes('calc(var(--imagery-h) * var(--plate-w) / var(--plate-h))'),
			false,
		);
		assert.equal(splitCss.includes('calc(100svh * var(--plate-w) / var(--plate-h))'), false);
		const desktopStart = splitCss.indexOf('@media (min-width: 48rem)');
		const after = splitCss.slice(desktopStart + 10);
		const desktopBody = splitCss.slice(desktopStart, desktopStart + 10 + after.indexOf('@media'));
		assert.match(
			desktopBody,
			/grid-template-columns:\s*minmax\(0,\s*1\.618fr\)\s*minmax\(0,\s*1fr\)/,
		);
		assert.match(desktopBody, /column-gap:\s*0/);
		assert.match(desktopBody, /\.split-imagery\s*\{[^}]*height:\s*100svh/s);
		assert.match(desktopBody, /\.split-read\s*\{[^}]*height:\s*100svh/s);
		assert.match(desktopBody, /\.split-read\s*\{[^}]*max-width:\s*46ch/s);
		assert.match(desktopBody, /\.split-read\s*\{[^}]*grid-column:\s*2/s);
		assert.doesNotMatch(desktopBody, /var\(--imagery-h\)/);
		const column = Math.min(72 * 18, 1440 - 2 * 18);
		const imagery = (column * 1.618) / (1.618 + 1);
		const reading = column - imagery;
		assert.ok(Math.abs(imagery - 801) <= 1);
		assert.ok(Math.abs(reading - 495) <= 1);
		assert.ok(imagery / reading > 1.6 && imagery / reading < 1.64);
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
		assert.match(
			astro,
			/if \(narrow && document\.documentElement\.dataset\.motion === 'ok' && stage && frame && figure\.classList\.contains\('is-active'\)\)/,
		);
		assert.match(astro, /inImagery && document\.documentElement\.dataset\.motion !== 'ok'/);
		assert.match(astro, /settledPlaced/);
		assert.match(astro, /svhCache/);
	});
```

The Astro assertions stay true until Task 6. This task only makes the CSS assertions fail.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types --test --test-name-pattern "sizes the narrow imagery band" src/data/detail-display.test.ts`

Expected: FAIL. The desktop block still matches `minmax(0, 1fr) minmax(0, 1fr)`, so the `1.618fr` assertion fails.

- [ ] **Step 3: Write minimal implementation**

In `src/styles/global.css`, inside `.record-page--split .split-imagery`, add `container-type: size;` next to the existing `height: var(--imagery-h);`. Leave `position: sticky`, `overflow: hidden`, and `background: var(--bg)`.

Replace `.record-page--split .split-frame .detail-stage` with:

```css
.record-page--split .split-frame .detail-stage {
	position: relative;
	width: 100%;
	height: 100%;
	max-height: 100%;
}
```

Replace `.record-page--split .split-frame .plate-frame` with:

```css
.record-page--split .split-frame .plate-frame {
	position: absolute;
	left: 50%;
	top: 50%;
	width: auto;
	height: auto;
	max-width: 72cqw;
	max-height: 72cqh;
	transform: translate(-50%, -50%);
	border: 0;
	background: transparent;
}
```

Replace `.record-page--split .split-frame .plate` with:

```css
.record-page--split .split-frame .plate {
	display: block;
	width: auto;
	height: auto;
	max-width: 72cqw;
	max-height: 72cqh;
}
```

`72cqw` and `72cqh` resolve against `.split-imagery`, because that is the only size container. Do not set `container-type` on `.plate-frame`. The imagery rules already give `.split-imagery` a definite height (`var(--imagery-h)` or `100svh`), so `contain: size` from `container-type: size` does not collapse it.

Delete the whole `@media (max-width: 47.99rem)` block that contains `.record-page--split .split-frame .mark-slot` (`flex: 1 1 7.5rem`) and `.record-page--split .split-frame .plate-frame` (`min-width: min(11rem, 58%)`). Do not delete the later `@media (max-width: 47.99rem)` block that sets `html[data-motion='reduce'] .record-page--split .split-read { grid-row: 2 }`.

Add this rule next to the other split-frame rules:

```css
.record-page--split .split-frame .mark-slot {
	display: none;
}
```

In `@media (min-width: 48rem)`, change the split-stage columns to:

```css
	.record-page--split .split-stage {
		grid-template-columns: minmax(0, 1.618fr) minmax(0, 1fr);
		column-gap: 0;
	}
```

Delete the desktop rule `.record-page--split .split-frame .detail-stage { width: min(100%, calc(100svh * var(--plate-w) / var(--plate-h))); }`. Leave the desktop `.split-imagery { height: 100svh; }` and `.split-read` rules, including `grid-column: 2`, `max-width: 46ch`, and `padding: 0 0 0 1.25rem`.

Leave `.mark-slot { flex: 0 0 9.5rem; ... }` and the catalog `minmax(7.5rem, 1fr)` rule. Leave `--imagery-h: 58svh` and the `42svh` short-height query. Leave `.record-page--split .split-frame { display: grid; ... }`. Add `position: relative;` to that rule so the upright clip in Task 4 can use `inset: 0`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --experimental-strip-types --test src/data/detail-display.test.ts src/data/split-stage.test.ts`

Expected: PASS. `describe('runway css')` still sees `grid-column: 2` and `max-width: 46ch`.

- [ ] **Step 5: Commit**

```bash
git add src/styles/global.css src/data/detail-display.test.ts
git commit -m "style(records): split the stage by phi and cap the no-JS plate"
```

---

### Task 4: Pane clip and scripted pose at `S`

**Files:**
- Modify: `src/pages/records/[id].astro` (the `hasReveal` split template, the `<script>` imports, `applyFrame`, `clearScrubStyles`)
- Modify: `src/data/detail-display.test.ts` (new source `it`)
- Modify: `src/data/split-stage.test.ts` (one assertion in `describe('itinerary scroll helpers')`)
- Test: `src/data/detail-display.test.ts`, `src/data/split-stage.test.ts`

**Interfaces:**
- Consumes: `openingBox`, `plateBox`, `zoomImageBox`, `FrameBox`, `PxSize` from Tasks 1–2. `stageVisual` and `visual.cropT` stay.
- Produces: `layoutSplit(figure)` in the page script. It reads the pane from `.split-frame` `clientWidth` / `clientHeight`, the upright file size from the `width` and `height` attributes, and the crop from `data-crop-*`. It writes `S` onto `.plate-frame` as pixel `left`, `top`, `width`, and `height`, with `maxWidth`, `maxHeight`, and `transform` set to `'none'`, and sets the plate image to `width` / `height` `100%` with those maxes cleared. `applyFrame` then sets the upright box from `zoomImageBox({ opening, plate, natural, crop, cropT: visual.cropT })`. The upright clip is the pane, not the plate frame.

- [ ] **Step 1: Write the failing test**

Append to `src/data/detail-display.test.ts`:

```ts
describe('split pose source', () => {
	it('clips the upright to the pane and zooms toward S', () => {
		const here = dirname(fileURLToPath(import.meta.url));
		const astro = readFileSync(join(here, '../pages/records/[id].astro'), 'utf8');
		const split = astro.slice(astro.indexOf('class="split-stage"'), astro.indexOf('class="split-read"'));
		assert.equal(split.includes('mark-slot'), false);
		const clipAt = split.indexOf('class="upright-clip"');
		const stageAt = split.indexOf('class="detail-stage"');
		assert.ok(clipAt >= 0 && stageAt > clipAt);
		assert.match(astro, /function layoutSplit\(figure: HTMLElement\)/);
		assert.match(astro, /openingBox\(/);
		assert.match(astro, /plateBox\(/);
		assert.match(astro, /zoomImageBox\(\{[\s\S]*?cropT:\s*visual\.cropT/);
		assert.equal(astro.includes('cameraBox('), false);
		assert.equal(astro.includes("objectFit = 'cover'"), false);
		assert.match(astro, /upright\.style\.objectFit = 'fill'/);
		assert.match(astro, /function ensureSlots\(figure: HTMLElement\): void \{[\s\S]*?split-frame'\)\) return;/);
		const slots = astro.slice(astro.indexOf('function ensureSlots'), astro.indexOf('function clearStageInline'));
		assert.ok(slots.indexOf('split-frame') < slots.indexOf('querySelector'));
		const legacy = astro.slice(astro.indexOf('class="record-split"'), astro.indexOf('class="split-stage"'));
		assert.match(legacy, /mark-slot mark-slot-left/);
		assert.match(legacy, /mark-slot mark-slot-right/);
	});
});
```

In `src/data/split-stage.test.ts`, inside the `it` named `removes the row-anchor driver from the module and the page`, replace:

```ts
		assert.match(astro, /cameraBox\([\s\S]*visual\.cropT/);
```

with:

```ts
		assert.match(astro, /zoomImageBox\([\s\S]*visual\.cropT/);
		assert.equal(astro.includes('cameraBox('), false);
```

Leave the `1 - visual.leadersOpacity`, `lerpBox`, and `angleDeg` assertions in that test.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types --test --test-name-pattern "clips the upright to the pane" src/data/detail-display.test.ts`

Expected: FAIL. The split template still contains `mark-slot`, and `class="detail-stage"` still appears before `class="upright-clip"`.

- [ ] **Step 3: Write minimal implementation**

In the `hasReveal` template only (the `revealDetails.map` inside `.split-imagery`, before `class="split-read"`):

- Delete both `{aligned && sides.has('left') && <div class="mark-slot mark-slot-left" />}` and the matching right slot.
- Delete the `const sides = new Set(...)` line in that map if it is now unused. Leave `paintSide(mark.side)` on each `<li>`.
- Move the `{detail.upright && detail.transform && ( <div class="upright-clip"> ... </div> )}` block out of `.plate-frame` so it is the first child of `.split-frame`, before `.detail-stage`. Do not move the clip in `.record-split` or in the non-reveal figures inside `.split-read`.

`ensureSlots` gains this first line, before it queries `.detail-stage`:

```ts
		function ensureSlots(figure: HTMLElement): void {
			if (figure.classList.contains('split-frame')) return;
```

The rest of `ensureSlots` stays, so legacy figures still grow a slot when `resolvedSide` flips a note.

In the `<script>` import from `../../data/detail-display`, add `openingBox`, `plateBox`, and `zoomImageBox`. In the import from `../../data/split-stage`, remove `cameraBox`. Leave `stageVisual`.

Add this function above `applyFrame`:

```ts
		function layoutSplit(figure: HTMLElement): {
			opening: { left: number; top: number; width: number; height: number };
			plate: { left: number; top: number; width: number; height: number };
			natural: { width: number; height: number };
			crop: { x: number; y: number; w: number; h: number };
		} | null {
			const upright = figure.querySelector<HTMLImageElement>('.upright');
			const plateImg = figure.querySelector<HTMLImageElement>('.plate');
			const plateFrame = figure.querySelector<HTMLElement>('.plate-frame');
			if (!upright || !plateImg || !plateFrame) return null;
			const naturalW = Number(upright.getAttribute('width'));
			const naturalH = Number(upright.getAttribute('height'));
			const paneW = figure.clientWidth;
			const paneH = figure.clientHeight;
			if (naturalW <= 0 || naturalH <= 0 || paneW <= 0 || paneH <= 0) return null;
			const natural = { width: naturalW, height: naturalH };
			const pane = { width: paneW, height: paneH };
			const crop = {
				x: Number(upright.dataset.cropX),
				y: Number(upright.dataset.cropY),
				w: Number(upright.dataset.cropW),
				h: Number(upright.dataset.cropH),
			};
			const opening = openingBox(pane, natural);
			const plate = plateBox(
				pane,
				opening,
				{
					width: Number(figure.dataset.plateWidth),
					height: Number(figure.dataset.plateHeight),
				},
				natural,
				crop,
			);
			if (plate.width <= 0 || plate.height <= 0) return null;
			plateFrame.style.left = `${plate.left}px`;
			plateFrame.style.top = `${plate.top}px`;
			plateFrame.style.right = 'auto';
			plateFrame.style.bottom = 'auto';
			plateFrame.style.width = `${plate.width}px`;
			plateFrame.style.height = `${plate.height}px`;
			plateFrame.style.maxWidth = 'none';
			plateFrame.style.maxHeight = 'none';
			plateFrame.style.transform = 'none';
			plateImg.style.width = '100%';
			plateImg.style.height = '100%';
			plateImg.style.maxWidth = 'none';
			plateImg.style.maxHeight = 'none';
			return { opening, plate, natural, crop };
		}
```

In `applyFrame`, replace the `cameraBox(...)` call and its `if (upright && plate && upright.naturalWidth > 0 && plate.clientWidth > 0)` gate with:

```ts
			const pose = layoutSplit(frame);
			if (upright && pose) {
				const box = zoomImageBox({
					opening: pose.opening,
					plate: pose.plate,
					natural: pose.natural,
					crop: pose.crop,
					cropT: visual.cropT,
				});
				upright.style.objectFit = 'fill';
				upright.style.maxWidth = 'none';
				upright.style.maxHeight = 'none';
				upright.style.right = 'auto';
				upright.style.bottom = 'auto';
				upright.style.left = `${box.left}px`;
				upright.style.top = `${box.top}px`;
				upright.style.width = `${box.width}px`;
				upright.style.height = `${box.height}px`;
				upright.style.opacity = String(visual.uprightOpacity);
			}
```

Leave `is-plate`, the mask `stroke-dashoffset`, and the opacity writes. Do not pass `frame.clientWidth` to `cameraBox`. Do not call `cameraBox` anywhere else.

In `clearScrubStyles`, after the upright inline-style reset, also clear `.plate-frame` `left`, `top`, `width`, `height`, `maxWidth`, `maxHeight`, and `transform`, and clear `.plate` `width`, `height`, `maxWidth`, and `maxHeight`. `showSettled` already calls `position` after `clearScrubStyles`; Task 6’s `positionSplit` calls `layoutSplit` again, and until then `applyFrame` is skipped when motion is off, so a reduced-motion reload before Task 6 uses the CSS 72% cap for one commit. That is expected.

In `src/styles/global.css`, add:

```css
.record-page--split .split-frame > .upright-clip {
	z-index: 1;
}

.record-page--split .split-frame .detail-stage {
	z-index: 2;
}
```

Keep that `z-index` in its own rule so the Task 3 `.detail-stage` block stays `position`, `width`, `height`, `max-height` only. The clip’s existing `position: absolute; inset: 0; overflow: hidden` then covers the pane, because `.split-frame` is `position: relative` and the clip is no longer inside the plate frame.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --experimental-strip-types --test src/data/detail-display.test.ts src/data/split-stage.test.ts`

Expected: PASS.

Run: `npm run check`

Expected: exit 0. Unused `cameraBox` or an unused `sides` binding fails this check.

- [ ] **Step 5: Commit**

```bash
git add src/pages/records/[id].astro src/styles/global.css src/data/detail-display.test.ts src/data/split-stage.test.ts
git commit -m "feat(records): zoom the upright in the pane and park the plate at S"
```

---

### Task 5: Margin, letterbox, then scrim

**Files:**
- Modify: `src/data/detail-display.ts`
- Modify: `src/data/detail-display.test.ts`
- Test: `src/data/detail-display.test.ts`

**Interfaces:**
- Consumes: `FrameBox`, `PxSize`, `plateBox`, `openingBox`, `badgeCenter`. `stackTops` is not used here and is not changed. Legacy callers keep `stackTops` (nothing above the plate). This helper’s side stack may sit above or below the plate, inside the pane.
- Produces:

```ts
export const MIN_NOTE_REM = 6.5;
export const MIN_BAND_REM = 2.6;
export const NOTE_CAP_REM = 9.5;
export const NOTE_GAP_REM = 0.35;
export const SCRIM_INSET_REM = 0.55;

export type NoteDraft = {
	index: number;
	side: 'left' | 'right';
	anchor: number;
	height: number;
	mark: { x: number; y: number; w: number; h: number; badge?: 'tl' | 'tr' };
};

export type NotePlacement = {
	index: number;
	kind: 'side' | 'letterbox' | 'scrim';
	side: 'left' | 'right';
	left: number;
	top: number;
	width: number;
	omitLeader: boolean;
};

export function placeNotes(args: {
	pane: PxSize;
	plate: FrameBox;
	plateSize: PxSize;
	rem: number;
	notes: readonly NoteDraft[];
}): NotePlacement[];
```

Returned placements follow `notes` order. `placeNotes` does not mutate `plate`.

Per resolved side:

1. Side strip `(pane.width - plate.width) / 2` is at least `6.5rem`: stack there. Note width is the strip, capped at `9.5rem`. Right notes start at `plate.left + plate.width`. Left notes end at `plate.left`. Order by `anchor`, then `index`. Ideal top centers on the anchor mapped through `plate`. Clamp a negative top to `0`. Push down to keep `0.35rem`. A note whose box would extend past `pane.height` is omitted from this stack and goes to step 3. It does not move into the letterbox.
2. Strip is shorter and letterbox `(pane.height - plate.height) / 2` is at least `2.6rem`: pack that side in the letterbox, top band then bottom band. Left notes use `left: 0`. Right notes use `left: pane.width - width`. Width is `min(9.5rem, pane.width / 2)`. A note that fits in neither band goes to step 3.
3. Scrim: on the resolved side, inset `0.55rem` from that edge of `S`, width `min(9.5rem, max(0, plate.width / 2 - 0.55rem))`. Stack by anchor inside `S`, then nudge vertically by `4` CSS pixels, positive then negative, until the border box misses every mark rectangle and every badge disc. A clear slot sets `omitLeader` false. No clear slot: place on the side whose marks have the smaller `w * h` sum (a tie stays on the resolved side) at the anchor clamped inside `S`, and set `omitLeader` true.

`anchor` is plate pixels (`mark.y + mark.h / 2`). CSS anchor is `plate.top + anchor * (plate.height / plateSize.height)`. Disc geometry uses `badgeCenter` in plate pixels, then the same scale.

- [ ] **Step 1: Write the failing test**

Add `MIN_BAND_REM`, `MIN_NOTE_REM`, `NOTE_CAP_REM`, `placeNotes`, and `type NoteDraft` to the import from `./detail-display.ts`.

Append:

```ts
describe('margin-first notes', () => {
	const rem = 18;
	const labelNatural = { width: 1050, height: 1400 };
	const coverNatural = { width: 1400, height: 1400 };
	const labelPlate = { width: 400, height: 400 };
	const coverPlate = { width: 400, height: 248 };
	const labelCrop = { x: 274, y: 403, w: 514, h: 514 };
	const coverCrop = { x: 219, y: 210, w: 379, h: 235 };
	const desk = { width: 801, height: 900 };
	const phone = { width: 354, height: 489.5 };

	function draft(index: number, side: 'left' | 'right', height = 24): NoteDraft {
		return {
			index,
			side,
			anchor: 200,
			height,
			mark: { x: 10, y: 10, w: 20, h: 20, badge: 'tl' },
		};
	}

	it('uses the side strip, then the letterbox, then the scrim', () => {
		assert.equal(MIN_NOTE_REM, 6.5);
		assert.equal(MIN_BAND_REM, 2.6);
		assert.equal(NOTE_CAP_REM, 9.5);

		const deskLabel = plateBox(desk, openingBox(desk, labelNatural), labelPlate, labelNatural, labelCrop);
		const labelNotes = placeNotes({
			pane: desk,
			plate: deskLabel,
			plateSize: labelPlate,
			rem,
			notes: [draft(0, 'left'), draft(1, 'right')],
		});
		assert.deepEqual(
			labelNotes.map((note) => note.kind),
			['side', 'side'],
		);
		assert.ok(labelNotes.every((note) => note.omitLeader === false));
		assert.equal(labelNotes[0].width, (801 - 486) / 2);
		assert.equal(labelNotes[0].left, deskLabel.left - labelNotes[0].width);
		assert.equal(labelNotes[1].left, deskLabel.left + deskLabel.width);
		assert.equal(labelNotes[0].width / rem, 8.75);

		const deskCover = plateBox(desk, openingBox(desk, coverNatural), coverPlate, coverNatural, coverCrop);
		const coverNotes = placeNotes({
			pane: desk,
			plate: deskCover,
			plateSize: coverPlate,
			rem,
			notes: [draft(0, 'left'), draft(1, 'right')],
		});
		assert.deepEqual(
			coverNotes.map((note) => note.kind),
			['letterbox', 'letterbox'],
		);
		assert.equal(coverNotes[0].left, 0);
		assert.equal(coverNotes[1].left, desk.width - coverNotes[1].width);
		assert.equal(coverNotes[0].width, 9.5 * rem);
		assert.ok(coverNotes.every((note) => note.top + note.height <= deskCover.top + 1e-6));

		const phoneLabel = plateBox(
			phone,
			openingBox(phone, labelNatural),
			labelPlate,
			labelNatural,
			labelCrop,
		);
		const phoneFit = placeNotes({
			pane: phone,
			plate: phoneLabel,
			plateSize: labelPlate,
			rem,
			notes: [draft(0, 'right', 24)],
		});
		assert.equal(phoneFit[0].kind, 'letterbox');
		const phoneSpill = placeNotes({
			pane: phone,
			plate: phoneLabel,
			plateSize: labelPlate,
			rem,
			notes: [draft(0, 'right', 130)],
		});
		assert.equal(phoneSpill[0].kind, 'scrim');
		assert.equal(phoneSpill[0].omitLeader, false);

		const frozen = { ...deskLabel };
		placeNotes({
			pane: desk,
			plate: deskLabel,
			plateSize: labelPlate,
			rem,
			notes: [draft(0, 'left', 4000)],
		});
		assert.deepEqual(deskLabel, frozen);
	});

	it('sends a side-strip overflow to the scrim and keeps a clear scrim off the marks', () => {
		const plate: FrameBox = { left: 200, top: 100, width: 200, height: 100 };
		const pane = { width: 600, height: 300 };
		const stacked = placeNotes({
			pane,
			plate,
			plateSize: { width: 100, height: 100 },
			rem,
			notes: [
				{
					index: 0,
					side: 'right',
					anchor: 40,
					height: 280,
					mark: { x: 0, y: 0, w: 8, h: 8, badge: 'tl' },
				},
				{
					index: 1,
					side: 'right',
					anchor: 40,
					height: 40,
					mark: { x: 80, y: 0, w: 8, h: 8, badge: 'tr' },
				},
			],
		});
		assert.equal(stacked[0].kind, 'side');
		assert.equal(stacked[1].kind, 'scrim');

		const tight: FrameBox = { left: 20, top: 20, width: 160, height: 160 };
		const clear = placeNotes({
			pane: { width: 200, height: 200 },
			plate: tight,
			plateSize: { width: 100, height: 100 },
			rem,
			notes: [
				{
					index: 0,
					side: 'right',
					anchor: 50,
					height: 16,
					mark: { x: 0, y: 0, w: 10, h: 10, badge: 'tl' },
				},
			],
		});
		assert.equal(clear[0].kind, 'scrim');
		assert.equal(clear[0].side, 'right');
		assert.equal(clear[0].omitLeader, false);
		assert.ok(clear[0].top >= tight.top - 1e-6);
		assert.ok(clear[0].top + 16 <= tight.top + tight.height + 1e-6);
		const scale = tight.width / 100;
		const markRight = tight.left + 10 * scale;
		const markBottom = tight.top + 10 * scale;
		assert.ok(clear[0].left >= markRight || clear[0].top >= markBottom);
	});

	it('moves a blocked scrim note onto the side with less box area and omits its leader', () => {
		const plate: FrameBox = { left: 0, top: 0, width: 200, height: 100 };
		const placed = placeNotes({
			pane: { width: 200, height: 100 },
			plate,
			plateSize: { width: 200, height: 100 },
			rem,
			notes: [
				{
					index: 0,
					side: 'right',
					anchor: 50,
					height: 30,
					mark: { x: 100, y: 0, w: 100, h: 100, badge: 'tr' },
				},
			],
		});
		assert.equal(placed[0].kind, 'scrim');
		assert.equal(placed[0].side, 'left');
		assert.equal(placed[0].omitLeader, true);
		assert.ok(placed[0].left >= 0.55 * rem - 1e-6);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types --test --test-name-pattern "uses the side strip" src/data/detail-display.test.ts`

Expected: FAIL while the module loads. The message names `placeNotes` as a missing export.

- [ ] **Step 3: Write minimal implementation**

Append to `src/data/detail-display.ts`. Keep `stackTops` above this block unchanged.

```ts
export const MIN_NOTE_REM = 6.5;
export const MIN_BAND_REM = 2.6;
export const NOTE_CAP_REM = 9.5;
export const NOTE_GAP_REM = 0.35;
export const SCRIM_INSET_REM = 0.55;

const NUDGE_STEP_PX = 4;

export type NoteDraft = {
	index: number;
	side: 'left' | 'right';
	anchor: number;
	height: number;
	mark: { x: number; y: number; w: number; h: number; badge?: 'tl' | 'tr' };
};

export type NotePlacement = {
	index: number;
	kind: 'side' | 'letterbox' | 'scrim';
	side: 'left' | 'right';
	left: number;
	top: number;
	width: number;
	omitLeader: boolean;
};

type CssRect = { left: number; top: number; right: number; bottom: number };
type Disc = { cx: number; cy: number; r: number };

function anchorCss(note: NoteDraft, plate: FrameBox, plateSize: PxSize): number {
	const scale = plateSize.height === 0 ? 0 : plate.height / plateSize.height;
	return plate.top + note.anchor * scale;
}

function rectsOverlap(a: CssRect, b: CssRect): boolean {
	return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

function rectHitsDisc(rect: CssRect, disc: Disc): boolean {
	const x = Math.max(rect.left, Math.min(disc.cx, rect.right));
	const y = Math.max(rect.top, Math.min(disc.cy, rect.bottom));
	const dx = x - disc.cx;
	const dy = y - disc.cy;
	return dx * dx + dy * dy < disc.r * disc.r;
}

function placeNotes(args: {
	pane: PxSize;
	plate: FrameBox;
	plateSize: PxSize;
	rem: number;
	notes: readonly NoteDraft[];
}): NotePlacement[] {
	const { pane, plate, plateSize, rem, notes } = args;
	const gap = NOTE_GAP_REM * rem;
	const byAnchor = (a: NoteDraft, b: NoteDraft) => a.anchor - b.anchor || a.index - b.index;
	const placed = new Map<number, NotePlacement>();
	const pending: NoteDraft[] = [];

	for (const side of ['left', 'right'] as const) {
		const group = notes.filter((note) => note.side === side).sort(byAnchor);
		if (group.length === 0) continue;
		const strip = (pane.width - plate.width) / 2;
		const band = (pane.height - plate.height) / 2;
		if (strip + 1e-6 >= MIN_NOTE_REM * rem) {
			const width = Math.min(NOTE_CAP_REM * rem, Math.max(0, strip));
			const left = side === 'left' ? plate.left - width : plate.left + plate.width;
			let prevBottom = Number.NEGATIVE_INFINITY;
			for (const note of group) {
				let top = anchorCss(note, plate, plateSize) - note.height / 2;
				if (top < 0) top = 0;
				if (top < prevBottom + gap) top = prevBottom + gap;
				if (top + note.height > pane.height + 1e-6) {
					pending.push(note);
					continue;
				}
				placed.set(note.index, {
					index: note.index,
					kind: 'side',
					side,
					left,
					top,
					width,
					omitLeader: false,
				});
				prevBottom = top + note.height;
			}
			continue;
		}
		if (band + 1e-6 >= MIN_BAND_REM * rem) {
			const width = Math.min(NOTE_CAP_REM * rem, pane.width / 2);
			const left = side === 'left' ? 0 : pane.width - width;
			let topCursor = 0;
			let bottomCursor = plate.top + plate.height;
			for (const note of group) {
				if (topCursor + note.height <= band + 1e-6) {
					placed.set(note.index, {
						index: note.index,
						kind: 'letterbox',
						side,
						left,
						top: topCursor,
						width,
						omitLeader: false,
					});
					topCursor += note.height + gap;
					continue;
				}
				if (bottomCursor + note.height <= pane.height + 1e-6) {
					placed.set(note.index, {
						index: note.index,
						kind: 'letterbox',
						side,
						left,
						top: bottomCursor,
						width,
						omitLeader: false,
					});
					bottomCursor += note.height + gap;
					continue;
				}
				pending.push(note);
			}
			continue;
		}
		pending.push(...group);
	}

	const scaleX = plateSize.width === 0 ? 0 : plate.width / plateSize.width;
	const scaleY = plateSize.height === 0 ? 0 : plate.height / plateSize.height;
	const obstacles = notes.map((note) => {
		const box: CssRect = {
			left: plate.left + note.mark.x * scaleX,
			top: plate.top + note.mark.y * scaleY,
			right: plate.left + (note.mark.x + note.mark.w) * scaleX,
			bottom: plate.top + (note.mark.y + note.mark.h) * scaleY,
		};
		let disc: Disc | null = null;
		if (note.mark.badge === 'tl' || note.mark.badge === 'tr') {
			const badge = badgeCenter(
				{
					x: note.mark.x,
					y: note.mark.y,
					w: note.mark.w,
					h: note.mark.h,
					badge: note.mark.badge,
				},
				plateSize.width,
			);
			disc = {
				cx: plate.left + badge.cx * scaleX,
				cy: plate.top + badge.cy * scaleY,
				r: badge.r * scaleX,
			};
		}
		return { box, disc };
	});
	const area = { left: 0, right: 0 };
	for (const note of notes) area[note.side] += note.mark.w * note.mark.h;
	const inset = SCRIM_INSET_REM * rem;
	const scrimWidth = Math.min(NOTE_CAP_REM * rem, Math.max(0, plate.width / 2 - inset));
	const scrimLeft = (side: 'left' | 'right') =>
		side === 'left' ? plate.left + inset : plate.left + plate.width - inset - scrimWidth;

	function clearTop(left: number, height: number, start: number): number | null {
		const minTop = plate.top;
		const maxTop = plate.top + plate.height - height;
		if (maxTop < minTop - 1e-6 || scrimWidth <= 0) return null;
		const limit = Math.ceil(Math.max(0, maxTop - minTop) / NUDGE_STEP_PX) + 1;
		for (let step = 0; step <= limit; step += 1) {
			const candidates = step === 0 ? [start] : [start + step * NUDGE_STEP_PX, start - step * NUDGE_STEP_PX];
			for (const top of candidates) {
				if (top < minTop - 1e-6 || top > maxTop + 1e-6) continue;
				const rect = { left, top, right: left + scrimWidth, bottom: top + height };
				const hit = obstacles.some(
					(obstacle) =>
						rectsOverlap(rect, obstacle.box) ||
						(obstacle.disc !== null && rectHitsDisc(rect, obstacle.disc)),
				);
				if (!hit) return top;
			}
		}
		return null;
	}

	for (const note of pending) {
		const start = anchorCss(note, plate, plateSize) - note.height / 2;
		const found = clearTop(scrimLeft(note.side), note.height, start);
		if (found !== null) {
			placed.set(note.index, {
				index: note.index,
				kind: 'scrim',
				side: note.side,
				left: scrimLeft(note.side),
				top: found,
				width: scrimWidth,
				omitLeader: false,
			});
			continue;
		}
		const other = note.side === 'left' ? 'right' : 'left';
		const home = area[note.side] <= area[other] ? note.side : other;
		const minTop = plate.top;
		const maxTop = Math.max(minTop, plate.top + plate.height - note.height);
		let top = start;
		if (top < minTop) top = minTop;
		if (top > maxTop) top = maxTop;
		placed.set(note.index, {
			index: note.index,
			kind: 'scrim',
			side: home,
			left: scrimLeft(home),
			top,
			width: scrimWidth,
			omitLeader: true,
		});
	}

	return notes.map((note) => {
		const found = placed.get(note.index);
		if (found) return found;
		return {
			index: note.index,
			kind: 'scrim',
			side: note.side,
			left: 0,
			top: 0,
			width: 0,
			omitLeader: true,
		};
	});
}

export { placeNotes };
```

`placeNotes` is declared as a function and then exported so it can sit below the file-private helpers. Do not also write `export function placeNotes`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --experimental-strip-types --test src/data/detail-display.test.ts`

Expected: PASS. If the blocked-scrim test fails because a 4px nudge found a sliver beside the full-height right mark, the mark in that test already covers `x` 100–200 and the right note column starts at `plate.width / 2` minus the inset, which is inside that mark. Do not shrink the mark to make the test pass. Fix the search so a note that still intersects a box is not treated as clear.

- [ ] **Step 5: Commit**

```bash
git add src/data/detail-display.ts src/data/detail-display.test.ts
git commit -m "feat(records): place notes in the margin before a paper scrim"
```

---

### Task 6: Wire notes, omit crossing leaders, lock acceptance

**Files:**
- Modify: `src/data/detail-display.ts` (append `leaderHitsNote` only; do not edit `leaderEndpoints`)
- Modify: `src/data/detail-display.test.ts`
- Modify: `src/pages/records/[id].astro`
- Modify: `src/styles/global.css` (`.is-scrim` only)
- Test: `src/data/detail-display.test.ts`, `src/data/split-stage.test.ts`

**Interfaces:**
- Consumes: `placeNotes`, `NoteDraft`, `NotePlacement`, `layoutSplit` from Tasks 4–5, `leaderEndpoints` unchanged, `resolvedSide` for legacy figures.
- Produces:

```ts
export function leaderHitsNote(
	points: readonly LeaderPoint[],
	note: { left: number; right: number; top: number; bottom: number },
): boolean;
```

`points` and `note` are both in plate user units. A point on the border counts as a hit. An empty point list does not.

`positionSplit` writes each note’s `left`, `top`, and `width` relative to `.plate-frame` (`place.left - S.left`, `place.top - S.top`), sets `right` and `bottom` to `auto`, sets `maxWidth` to `none`, toggles `is-scrim` when `kind === 'scrim'`, and sets `data-omit-leader` to `'1'` or `'0'`. It also sets `data-side` to the placement side. It runs the placement twice so the second pass measures scrim padding. It calls `layoutSplit` and does not set `--imagery-h`. `writeLeaders` removes `points` from `.mark-leader` and `.mark-leader-mask` when `data-omit-leader` is `'1'` or `leaderHitsNote` is true.

- [ ] **Step 1: Write the failing test**

Add `leaderHitsNote` to the import from `./detail-display.ts`.

Append:

```ts
describe('leader omission', () => {
	it('drops a centerline that meets the note and keeps one that stops short', () => {
		const note = { left: 40, right: 80, top: 0, bottom: 30 };
		assert.equal(
			leaderHitsNote(
				[
					{ x: 0, y: 10 },
					{ x: 20, y: 10 },
					{ x: 30, y: 15 },
				],
				note,
			),
			false,
		);
		assert.equal(
			leaderHitsNote(
				[
					{ x: 0, y: 10 },
					{ x: 50, y: 10 },
				],
				note,
			),
			true,
		);
		assert.equal(
			leaderHitsNote(
				[
					{ x: 50, y: 10 },
					{ x: 60, y: 10 },
				],
				note,
			),
			true,
		);
		assert.equal(
			leaderHitsNote(
				[
					{ x: 0, y: 10 },
					{ x: 40, y: 10 },
				],
				note,
			),
			true,
		);
		assert.equal(leaderHitsNote([], note), false);
	});
});
```

Replace the `it` named `sizes the narrow imagery band from --imagery-h and leaves the desktop pane at 100svh` again. Keep every CSS assertion from Task 3, and replace the Astro block that starts at `const astro = readFileSync` with:

```ts
		const astro = readFileSync(join(here, '../pages/records/[id].astro'), 'utf8');
		assert.match(astro, /placeNotes\(/);
		assert.match(astro, /leaderHitsNote\(/);
		assert.match(astro, /layoutSplit\(/);
		assert.match(astro, /resolvedSide\(/);
		assert.match(astro, /stackTops\(/);
		assert.doesNotMatch(astro, /function stackTops/);
		assert.match(astro, /classList\.contains\('split-frame'\)/);
		assert.match(astro, /classList\.contains\('is-active'\)/);
		assert.match(astro, /settledPlaced/);
		assert.match(astro, /--imagery-h/);
		assert.doesNotMatch(astro, /laidOutSides\(/);
		assert.doesNotMatch(astro, /plateFloorPx\(/);
		assert.doesNotMatch(astro, /singleGutterPx\(/);
		assert.doesNotMatch(astro, /singlePlatePx\(/);
		assert.doesNotMatch(astro, /fitPlateToFloor\(/);
		assert.doesNotMatch(astro, /imageryHeightPx\(/);
		assert.doesNotMatch(astro, /svhCache/);
		assert.doesNotMatch(astro, /measureSvh\(/);
		assert.doesNotMatch(astro, /function noteMaxWidth/);
		assert.match(astro, /is-scrim/);
		assert.match(astro, /data-omit-leader/);
		const read = astro.slice(astro.indexOf('class="split-read"'), astro.indexOf('class="record-text"'));
		assert.equal(read.includes('class="mark-list"'), false);
		assert.match(read, /visibleDetailText\(detail\)/);
		assert.match(read, /showDetailsNote\(record\)/);
		assert.match(
			css,
			/\.record-page--split \.mark-list li\.is-scrim \{\s*background:\s*var\(--bg\);\s*padding:\s*0\.35rem 0\.45rem;\s*\}/,
		);
```

Reuse the `css` binding from the top of this `it`. Do not declare `css` again. Keep the φ, `72cqw`, `58svh`, and `42svh` assertions above this Astro block.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types --test --test-name-pattern "drops a centerline" src/data/detail-display.test.ts`

Expected: FAIL while the module loads. The message names `leaderHitsNote` as a missing export.

- [ ] **Step 3: Write minimal implementation**

Append to `src/data/detail-display.ts`:

```ts
function orient(a: LeaderPoint, b: LeaderPoint, c: LeaderPoint): number {
	return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function onSegment(a: LeaderPoint, b: LeaderPoint, p: LeaderPoint): boolean {
	return (
		Math.min(a.x, b.x) - 1e-9 <= p.x &&
		p.x <= Math.max(a.x, b.x) + 1e-9 &&
		Math.min(a.y, b.y) - 1e-9 <= p.y &&
		p.y <= Math.max(a.y, b.y) + 1e-9
	);
}

function segmentsMeet(a: LeaderPoint, b: LeaderPoint, c: LeaderPoint, d: LeaderPoint): boolean {
	const o1 = orient(a, b, c);
	const o2 = orient(a, b, d);
	const o3 = orient(c, d, a);
	const o4 = orient(c, d, b);
	const cross = (p: number, q: number) => (p > 0 && q < 0) || (p < 0 && q > 0);
	if (cross(o1, o2) && cross(o3, o4)) return true;
	if (Math.abs(o1) <= 1e-9 && onSegment(a, b, c)) return true;
	if (Math.abs(o2) <= 1e-9 && onSegment(a, b, d)) return true;
	if (Math.abs(o3) <= 1e-9 && onSegment(c, d, a)) return true;
	if (Math.abs(o4) <= 1e-9 && onSegment(c, d, b)) return true;
	return false;
}

export function leaderHitsNote(
	points: readonly LeaderPoint[],
	note: { left: number; right: number; top: number; bottom: number },
): boolean {
	if (points.length === 0) return false;
	const inside = (point: LeaderPoint) =>
		point.x >= note.left && point.x <= note.right && point.y >= note.top && point.y <= note.bottom;
	const corners = [
		{ x: note.left, y: note.top },
		{ x: note.right, y: note.top },
		{ x: note.right, y: note.bottom },
		{ x: note.left, y: note.bottom },
	];
	for (let index = 0; index < points.length - 1; index += 1) {
		const start = points[index];
		const end = points[index + 1];
		if (!start || !end) continue;
		if (inside(start) || inside(end)) return true;
		for (let edge = 0; edge < corners.length; edge += 1) {
			const a = corners[edge];
			const b = corners[(edge + 1) % corners.length];
			if (a && b && segmentsMeet(start, end, a, b)) return true;
		}
	}
	const last = points[points.length - 1];
	return last ? inside(last) : false;
}
```

In `src/styles/global.css`, add:

```css
.record-page--split .mark-list li.is-scrim {
	background: var(--bg);
	padding: 0.35rem 0.45rem;
}
```

Do not add a background to `.mark-list li` itself. Margin and letterbox notes stay on the pane’s paper.

In the page `<script>`:

- Import `leaderHitsNote`, `placeNotes`, and `resolvedSide` from `../../data/detail-display`.
- Remove `fitPlateToFloor`, `imageryHeightPx`, `laidOutSides`, `plateFloorPx`, `singleGutterPx`, and `singlePlatePx` from that import.
- Delete `noteMaxWidth`, `svhCache`, and `measureSvh`.
- In `bindSplit`’s resize listener, delete `svhCache.clear();`. Leave `settledPlaced = false` and `applyAll()`.

Replace `position` with a dispatcher. Legacy figures keep slots, `stackTops`, and the hang padding. Split frames take the new path.

```ts
		function position(figure: HTMLElement): void {
			if (figure.classList.contains('split-frame')) {
				positionSplit(figure);
				return;
			}
			const plate = figure.querySelector<HTMLImageElement>('.plate');
			const list = figure.querySelector<HTMLOListElement>('.mark-list');
			if (!plate || !list) return;
			const plateWidth = Number(figure.dataset.plateWidth);
			const plateHeight = Number(figure.dataset.plateHeight);
			const items = [...list.querySelectorAll<HTMLLIElement>('li')];
			const stage = figure.querySelector<HTMLElement>('.detail-stage');
			const frame = figure.querySelector<HTMLElement>('.plate-frame');
			const root = remPx();
			for (const li of items) {
				const pref = li.dataset.sidePref;
				const sidePref = pref === 'left' || pref === 'right' || pref === 'auto' ? pref : 'auto';
				li.dataset.side = resolvedSide(
					{ side: sidePref, x: Number(li.dataset.x), w: Number(li.dataset.w) },
					plateWidth,
				);
			}
			ensureSlots(figure);
			if (stage && frame) clearStageInline(stage, frame, items);
			stackNotes(items, plate, plateHeight, 0.35 * root);
			if (stage) {
				let hang = 0;
				for (const li of items) {
					const bottom = li.offsetTop + li.offsetHeight;
					if (bottom > plate.clientHeight) hang = Math.max(hang, bottom - plate.clientHeight);
				}
				stage.style.paddingBottom = hang > 0 ? `${hang}px` : '';
			}
			writeLeaders(figure, items, plate, plateWidth, plateHeight);
		}

		function positionSplit(figure: HTMLElement): void {
			const plate = figure.querySelector<HTMLImageElement>('.plate');
			const list = figure.querySelector<HTMLOListElement>('.mark-list');
			const stage = figure.querySelector<HTMLElement>('.detail-stage');
			if (!plate || !list) return;
			const pose = layoutSplit(figure);
			if (!pose) return;
			if (stage) stage.style.paddingBottom = '';
			figure.closest<HTMLElement>('.record-page--split')?.style.removeProperty('--imagery-h');
			const plateWidth = Number(figure.dataset.plateWidth);
			const plateHeight = Number(figure.dataset.plateHeight);
			const items = [...list.querySelectorAll<HTMLLIElement>('li')];
			const root = remPx();
			for (let pass = 0; pass < 2; pass += 1) {
				const notes = placeNotes({
					pane: { width: figure.clientWidth, height: figure.clientHeight },
					plate: pose.plate,
					plateSize: { width: plateWidth, height: plateHeight },
					rem: root,
					notes: items.map((li) => {
						const pref = li.dataset.sidePref;
						const sidePref = pref === 'left' || pref === 'right' || pref === 'auto' ? pref : 'auto';
						return {
							index: Number(li.dataset.index),
							side: resolvedSide(
								{ side: sidePref, x: Number(li.dataset.x), w: Number(li.dataset.w) },
								plateWidth,
							),
							anchor: Number(li.dataset.y) + Number(li.dataset.h) / 2,
							height: li.offsetHeight,
							mark: {
								x: Number(li.dataset.x),
								y: Number(li.dataset.y),
								w: Number(li.dataset.w),
								h: Number(li.dataset.h),
								badge: li.dataset.badge === 'tl' || li.dataset.badge === 'tr' ? li.dataset.badge : undefined,
							},
						};
					}),
				});
				for (const li of items) {
					const place = notes.find((note) => note.index === Number(li.dataset.index));
					if (!place) continue;
					li.dataset.side = place.side;
					li.dataset.omitLeader = place.omitLeader ? '1' : '0';
					li.classList.toggle('is-scrim', place.kind === 'scrim');
					li.style.left = `${place.left - pose.plate.left}px`;
					li.style.right = 'auto';
					li.style.top = `${place.top - pose.plate.top}px`;
					li.style.bottom = 'auto';
					li.style.width = `${place.width}px`;
					li.style.maxWidth = 'none';
				}
			}
			writeLeaders(figure, items, plate, plateWidth, plateHeight);
		}
```

`data-badge` is not on the markup today. In both split and legacy `<li>` elements that already carry `data-side-pref`, add `data-badge={mark.badge}` so the scrim disc check sees `tl` / `tr`. `badgeCenter` already runs in the SVG. This attribute does not change the visible numeral.

In `writeLeaders`, after `leaderEndpoints` returns and before `setAttribute('points')`, add:

```ts
				const noteRect = li.getBoundingClientRect();
				const scaleX = plateRect.width / plateWidth;
				const scaleY = plateRect.height / plateHeight;
				const hits =
					li.dataset.omitLeader === '1' ||
					(scaleX > 0 &&
						scaleY > 0 &&
						leaderHitsNote(points, {
							left: (noteRect.left - plateRect.left) / scaleX,
							right: (noteRect.right - plateRect.left) / scaleX,
							top: (noteRect.top - plateRect.top) / scaleY,
							bottom: (noteRect.bottom - plateRect.top) / scaleY,
						}));
				if (points.length < 2 || hits) {
					leader.removeAttribute('points');
					mask?.removeAttribute('points');
					continue;
				}
```

Remove the old `if (points.length < 2)` block so it is not duplicated. Leave `formatLeaderPoints`, `fitLeaderMask`, and `openLeaderMasks` as they are. Do not set `stroke-dasharray` on `.mark-leader`.

- [ ] **Step 4: Run tests, check, and build**

Run: `node --experimental-strip-types --test src/data/detail-display.test.ts src/data/split-stage.test.ts`

Expected: PASS.

Run: `npm run check`

Expected: exit 0.

Run: `npm run build`

Expected: exit 0.

- [ ] **Step 5: Manual acceptance**

Run: `npm run dev` and open the printed local URL. There is no browser harness in this repo. Use a 16px initial font and the light theme. A 2px difference from subpixel rounding still passes.

On `/records/mhjl329/` with motion allowed:

1. **390×844, upright hold.** Label and cover used boxes are centered, match the file aspect, and are flush on width (label about 354×472, cover about 354×354). The whole bitmap is visible. The plate is not filling the band.
2. **1440×900, upright hold.** Label opening about 675×900 inside an 801×900 pane. Cover opening about 801×801.
3. **φ.** Imagery is wider than the reading column, and the ratio is between 1.60 and 1.64 (about 801 / 495). The reading column is still 题铭, 记述, 著录, and the folds. No itinerary row and no ①–⑥ list.
4. **Notes keypoint.** Plate is centered and smaller than the opening on both axes. Label plate about 486px desktop and 255px at 390. Cover plate about 577×358 desktop and 255×158 at 390. The crop is larger on screen than it was inside the opening (about 1.47× label, 2.66× cover).
5. **Notes.** Desktop label notes sit in the side paper, outside the plate, with no scrim. Desktop cover notes sit in the letterbox unless a wrapped note exhausts the band, in which case that note has a `var(--bg)` panel. At 390, notes are not in a reserved side slot. A letterbox note has no scrim. A plate note’s panel covers its own glyphs, not the whole plate. No note’s glyphs intersect `.split-read`.
6. **Leaders.** A visible leader is one dashed elbow (`6 5`) ending at the note. A leader whose centerline meets its note is absent; that mark still has its box and its note.
7. **Unchanged machinery.** Scrubbing back to the upright hold shows `U` and hides the plate. `/records/ml4001/` still uses `.record-split` and its `9.5rem` slots.

Reduced motion, same URLs: the plate is the measured `S`, with boxes and notes, and the page does not scrub. No-JS (scripts disabled, `data-motion` unset): the first plate is centered, neither side exceeds 72% of the pane, there is no split-frame slot, and there is no zoom.

- [ ] **Step 6: Commit**

```bash
git add src/data/detail-display.ts src/data/detail-display.test.ts src/pages/records/[id].astro src/styles/global.css
git commit -m "feat(records): settle margin notes and drop leaders that meet them"
```

---

## Spec coverage

| Spec requirement | Task |
|---|---|
| Desktop `1.618fr` / `1fr`, 801 / 495 at 1440×900, `100svh`, `46ch`, `48rem` | Task 3 |
| Opening contain-maximize, MHJL `U` on both viewports | Task 1, wired in Task 4 |
| `S` at 0.72, grow to 1.25, stop at 0.92, MHJL sizes and magnification | Task 1, frame written in Task 4 |
| Geometric two-scale path, not one `cameraBox` view, not `lerpBox` | Task 2, called in Task 4 |
| `cameraBox` and `stageVisual` byte-for-byte | Task 2 source lock; `split-stage.ts` never edited |
| No split-frame slots; legacy slots stay | Tasks 3 and 4 |
| `--imagery-h` stays 58svh / 42svh and is not grown | Tasks 3 and 6 |
| Margin, then letterbox, then scrim; scrim is `var(--bg)` on the glyphs | Tasks 5 and 6 |
| Elbow `6 5` unchanged; omit a leader that meets its note | Task 6; `leaderEndpoints` not edited |
| No ①–⑥ list in `.split-read` | Task 6 source read; existing `visibleDetailText` tests |
| No-JS 72% cap; scripted and reduced-motion paths use `S` | Tasks 3, 4, and 6 |
| `records.json`, ml4001 `.record-split`, pin-or-pace, beat constants | Global Constraints; no task edits them |

Rejected alternatives in the spec (cover crop, a plate that fills the pane, scrim on every note, a second note list) have no task.
