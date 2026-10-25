# Fill→crop fade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On `.record-page--split`, keep the live crop window fully opaque through fill→crop and fade the upright outside that window to the imagery pane’s paper.

**Architecture:** The solid region is the on-screen `transform.crop` under the current `zoomImageBox` pose. It travels with that pose. It is not a rectangle fixed on the pane center. `cropWindow` is that rect. `fillCropPaint` is the photograph’s opacity: outer `1 - cropT`, window `1`, plate file `0` or `1` at `PLATE_END`. Two sibling layers under `.split-frame` paint it. `.upright-outer` is the full pose and fades. `.crop-window` clips to the rect and stays opaque. `stageVisual` still returns the old upright/plate ramp. The split photograph stops reading that ramp. Upright→plate is a hard cut inside the window. Callouts, φ, `placeNotes`, and elbow leaders stay on their track.

Task 0 is the contract commit. It publishes the exports, the DOM hooks, the base hide, and `mhjl329FillCrop`. It does not paint the fade.

Write-set lanes, artifact lanes, and sequence:

- **Parallel write-set lanes:** none. The write set collapses. `cropWindow` is the rect `applyFrame` writes, and the spec puts the worked rows in `src/data/detail-display.test.ts`. That file already source-locks `applyFrame` and the `is-plate` / `.upright-clip` rules this change rewrites, so a geometry lane and a paint lane would share it. `[id].astro` and `global.css` are one composite (the layer stack and the inline rect). Splitting them would be a selector-string lane beside the script that paints the same elements. `src/data/split-stage.ts` is not in the write set.
- **Artifact lanes:** none. A test-only lane for `detail-display.test.ts` would share that path with the composite. The contract test is Task 0, not a lane.
- **Sequential:** Task 0, then A1, then A2, on one implementation branch and one PR. A1 fills the two function bodies. A2 consumes those bodies and then rewrites the photograph. A2 also edits `detail-display.test.ts`, so it waits for A1. Do not cut a second branch.

Steps that start on the contract alone, before the bodies exist:

- A1 Step 1 imports `cropWindow`, `fillCropPaint`, and `mhjl329FillCrop` and asserts the spec rows. The Task 0 stubs throw, so the test fails with `Not implemented: cropWindow`.
- A2 Step 1 reads `[id].astro` and `global.css` for the hooks and asserts the ramp is gone. It does not call `cropWindow`. It fails on Task 0 because `applyFrame` still assigns `visual.uprightOpacity`. The same owner writes it after A1 so `detail-display.test.ts` has one writer. It is not an artifact lane.
- No docs task. No verify-prep task. Integration does not start until A2 has landed.

**Live-verify:** one checkpoint, after A2, on `/records/mhjl329/`. Through fill→crop the center stays opaque and the outer margin goes to paper blank (`var(--bg)`). The rest of the acceptance list is that same pass.

**Tech Stack:** Astro static pages, vanilla TypeScript in the page `<script>`, CSS custom properties, pure helpers in `src/data/detail-display.ts` tested with `node:test`. No scroll library. This package has no `npm test` script. The records check is `node --experimental-strip-types --test`, then `npm run check`, then `npm run build`. Node `>=22.23.4`. `1rem` = 18px when the initial font is 16px (`html` is `font-size: 112.5%`).

**Spec:** [`docs/superpowers/specs/2026-10-25-records-fill-crop-fade-design.md`](../specs/2026-10-25-records-fill-crop-fade-design.md) (merged in #63 as `99d7ef4`).

**Checked against:** `main` at `99d7ef4`. `src/pages/records/[id].astro` (`applyFrame`, `clearScrubStyles`, `showSettled`, the `.split-stage` upright), `src/styles/global.css` (`.upright-clip`, `.split-imagery`, `.split-frame.is-plate`), `src/data/detail-display.ts` (`zoomImageBox`), `src/data/split-stage.ts` (`stageVisual`). Do not edit `src/data/split-stage.ts`, `src/data/split-stage.test.ts`, `src/data/records.json`, or `public/records/**`.

**Contracts:** Task 0, on one screen.

- Exports: `cropWindow(args: { image: FrameBox; naturalWidth: number; crop: Crop }): FrameBox`. `fillCropPaint(args: { cropT: number; local: number; plateEnd: number }): FillCropPaint`. `FillCropPaint` is `{ outerOpacity: number; windowOpacity: number; plateOpacity: 0 | 1 }`.
- DOM hooks: in the `.split-stage` map only, `data-fill-crop="outer"` on `div.upright-outer` and `data-fill-crop="window"` on `div.crop-window`. Both are direct children of `.split-frame`, siblings of each other and of `.detail-stage`. Server HTML gains those two attributes. `.record-split` and the `.detail-figure` upright do not.
- CSS: no new custom property. `.record-page--split` still owns `--imagery-h` (`58svh`, and `42svh` in the existing short-height query). `.record-page--split .split-frame` is still the only size container (`container-type: size`). `.split-imagery` still writes `background: var(--bg)`, the fade target. Task 0 hides `.upright-outer` and `.crop-window` with `opacity: 0` and `visibility: hidden` before script runs.
- Fixtures: `mhjl329FillCrop` in `src/data/fill-crop-fade-fixtures.ts`.

**Lanes:** one sequential composite, not parallel lanes. Base of A1 and A2 is the Task 0 commit. One owner. One implementation PR.

- A1 — crop window and paint values. Writes `src/data/detail-display.ts` (the two bodies) and `src/data/detail-display.test.ts` (a new describe). Does not edit `[id].astro` or `global.css`.
- A2 — outer fade and opaque window. Writes `src/pages/records/[id].astro`, `src/styles/global.css`, and the source locks in `src/data/detail-display.test.ts`.

**Serial:** none. No aesthetic lock sits outside A2. `src/data/split-stage.ts` has no owner. `[id].astro` and `global.css` have one owner after Task 0, so neither is a serial seam.

**Branch:** cut the implementation branch from `main` after this plan is on `main`. Do not implement these tasks on the docs branch. This plan does not grant `spec-ok-merge-plan-ship`. When that grant is in hand, start Task 0 on one implementation branch and continue A1 then A2 on that same branch. Do not open lane branches. Do not ask which execution mode to use. Do not brainstorm the spec again.

## Global Constraints

Copied from the locked spec. Every task includes this section.

- While the frame is the active frame, the crop window’s composited opacity is 1 from the upright hold through the notes beat. The page does not paint that window with `stageVisual`’s `uprightOpacity` or `plateOpacity`. The joint between details may still fade the whole `.split-frame`.
- The window is the on-screen `transform.crop` under the current `zoomImageBox` pose. The same geometric scale and the same straight crop-center travel already used for the upright. Every frame. The cover crop starts off center, so the window travels. A rectangle fixed on the pane center is the wrong window.
- A second copy of that same pose fades from opacity 1 to opacity 0 as `cropT` runs from 0 to 1. At `cropT = 1` the outer paints nothing. What remains outside the window is `.split-imagery`’s paper, `var(--bg)`.
- At `local >= PLATE_END` the visible photograph inside the window becomes the plate file at opacity 1, in one step. The plate beat does not crossfade the photograph.
- Boxes, elbow leaders, and notes still follow `stageVisual`. They are not retimed onto the fill→crop fade. Their clip is not the window clip.
- `prefers-reduced-motion: reduce` and `data-motion="reduce"` show the end state: the settled window, paper around it, callouts placed. No scrub and no opacity ramp.
- The paper is the existing token. Light theme `#f3f0e8`. Dark theme `#131211`. No new color.
- During fill→crop, a sample inside the window is the photograph at full cover. It is not paper showing through a 0.5 layer.
- At `cropT = 1` the outer opacity is 0. The margin matches `var(--bg)`. A half-transparent photograph does not remain outside the window.
- The plate file’s painted opacity is 0 or 1. The step is `local >= PLATE_END`.
- `stageVisual`’s fields and the beat constants stay. `applyFrame` stops writing `uprightOpacity` and `plateOpacity` onto the split photograph.
- `zoomImageBox`, `openingBox`, `plateBox`, and `cameraBox` stay. `angleDeg` stays unread. No CSS rotate on the upright or the plate.
- The window clip does not clip `.mark-box`, `.mark-leader`, `.mark-list`, or a letterbox note.
- `placeNotes`, elbow `6 5`, the terminal stub, Composite A prefixes, φ tracks `1.618fr` / `1fr`, and the settled mobile pane stay.
- The detail joint still uses `DETAIL_CROSSFADE_MS` on `.split-frame`.
- Reduced motion and no-JS do not run the outer fade.
- Legacy `.record-split`, including ml4001, stays.
- `records.json`, 记述, captions, alts, and `marks[].note` stay.
- Palette stays the current tokens. The fade target is `var(--bg)`.

Locked numbers from the same spec, copied as written there:

- Beats stay `UPRIGHT_END` `0.08`, `ZOOM_END` `0.40`, `PLATE_END` `0.52`, `BOXES_END` `0.76`, `LEADERS_END` `0.88`, `PASS_SVH` `140`, `JOINT_SVH` `28`, `DETAIL_CROSSFADE_MS` `1600`. Plate factors stay `0.72` / `1.25` / `0.92`.
- `s = image.width / naturalWidth` when `naturalWidth > 0`. Otherwise the window is the zero box and the page writes no clip from it.

```
window.left   = image.left + crop.x * s
window.top    = image.top + crop.y * s
window.width  = crop.w * s
window.height = crop.h * s
```

- Outer opacity is `1 - cropT` after `cropT` is clamped to `[0, 1]`. Window opacity is `1` on every row. Plate opacity is `0` when `local < plateEnd` and `1` when `local >= plateEnd`.
- At local `0.46`, `stageVisual` still returns `uprightOpacity` `0.5` and `plateOpacity` `0.5`, `cropT` `1`. Those numbers are not the window’s opacity and not the outer’s opacity. The window is `1`. The outer is `0`. The plate file is hidden.
- At local `0.24`, `cropT` is `0.5`. The window opacity is `1`. The outer opacity is `0.5`.
- Desktop pane `801×900`. Phone pane `354×489.5` (390×844, column `390 - 2rem`). Pane center desktop `(400.5, 450)`. Phone pane center `(177, 244.75)`. `1rem` = 18px is not used on these rows.
- Label crop `274,403,514×514`. Natural `1050×1400`. Plate `400×400`. Label `S` is `(157.5, 207, 486, 486)`.
- Cover crop `219,210,379×235`. Natural `1400×1400`. Plate `400×248`. Cover `S` is `(112.140, 271.217, 576.720, 357.566)`.
- Label windows: `cropT` `0` → `(239.143, 259.071, 330.429, 330.429)`, center `(404.357, 424.286)`. `cropT` `0.5` → `(202.061, 236.776, 400.735, 400.735)`, center `(402.429, 437.143)`. `cropT` `1` → `(157.5, 207, 486, 486)` = `S`, center `(400.5, 450)`.
- Cover windows: `cropT` `0` → `(125.299, 169.650, 216.842, 134.454)`, center `(233.720, 236.877)`. `cropT` `0.5` → `(140.301, 233.807, 353.619, 219.263)`, center `(317.110, 343.438)`. `cropT` `1` matches cover `S` within `0.1px`.
- The pane-centered rect with the cover’s `cropT = 0` size is `(292.079, 382.773, 216.842, 134.454)`. The live window is not that rect.
- Phone cover, same crop: `cropT` `0` → `(55.376, 120.850, 95.833, 59.421)`, center `(103.292, 150.561)`. `cropT` `1` matches phone `S` within `0.1px`. Phone `S` is `(49.56, 165.737, 254.88, 158.026)`, center `(177, 244.75)`.
- The geometry table is the unit lock, within `0.01px`. A match to `S` at `cropT = 1` is within `0.1px`. On screen, a `2px` difference from subpixel rounding still passes. Pixel figures assume no scrollbar.

## File map

| Path | Owner | Responsibility |
|------|--------|----------------|
| `src/data/fill-crop-fade-fixtures.ts` | Task 0 | Spec rows. Later tasks read this file and do not edit it. |
| `src/data/fill-crop-fade.contract.test.ts` | Task 0 | Exports, hook presence, fixture field types, one size container, no new variable. No formula results. |
| `src/data/detail-display.ts` | Task 0 stubs, A1 bodies | `cropWindow` and `fillCropPaint` after `zoomImageBox`. `openingBox`, `plateBox`, `zoomImageBox`, `placeNotes`, and `placeExpandedPanel` stay. |
| `src/data/detail-display.test.ts` | A1, then A2 | A1 appends `describe('fill to crop')`. A2 retargets the plate-hold and split-pose source locks. |
| `src/pages/records/[id].astro` | Task 0 hooks, A2 paint | Task 0 adds empty `.upright-outer` and `.crop-window` in the `.split-stage` map only. A2 fills them, removes that map’s `.upright-clip`, and rewrites `applyFrame`, `clearScrubStyles`, and `showSettled`. |
| `src/styles/global.css` | Task 0 hide, A2 layers | Task 0 hides the two hooks. A2 sets the layer stack, `overflow`, and the `is-plate` outer hide. Desktop `100svh` and `1.618fr 1fr` stay. |
| `src/data/split-stage.ts` | nobody | `stageVisual` and the beat constants stay. |
| `src/data/split-stage.test.ts` | nobody | Stays green. A2 keeps `zoomImageBox({ ... cropT: visual.cropT`, `upright.style.right = 'auto'`, `upright.style.bottom = 'auto'`, and `1 - visual.leadersOpacity`. |
| `src/data/records.json` | nobody | Copy stays. |
| Serial seam | none | After Task 0 one owner writes the composite. |

---

### Task 0: Contract surfaces

**Files:**
- Create: `src/data/fill-crop-fade-fixtures.ts`
- Create: `src/data/fill-crop-fade.contract.test.ts`
- Modify: `src/data/detail-display.ts` (stubs after `zoomImageBox`, before `MIN_NOTE_REM`)
- Modify: `src/pages/records/[id].astro` (empty hooks in the `.split-stage` map only)
- Modify: `src/styles/global.css` (base hide beside `.record-page--split .split-frame > .upright-clip`)
- Test: `src/data/fill-crop-fade.contract.test.ts`

**Interfaces:**
- Consumes: `FrameBox`, `Crop`, and `zoomImageBox` as they exist at `99d7ef4`. `zoomImageBox` stays byte-for-byte. `.record-page--split { --imagery-h: 58svh; }` and `.record-page--split .split-frame { container-type: size; }` stay. `.split-imagery` already has `background: var(--bg)`.
- Produces: the four surfaces below. A1 and A2 copy the signature block. Do not rename these exports.

```ts
export type FillCropPaint = {
	outerOpacity: number;
	windowOpacity: number;
	plateOpacity: 0 | 1;
};

export function cropWindow(args: {
	image: FrameBox;
	naturalWidth: number;
	crop: Crop;
}): FrameBox {
	void args;
	throw new Error('Not implemented: cropWindow');
}

export function fillCropPaint(args: {
	cropT: number;
	local: number;
	plateEnd: number;
}): FillCropPaint {
	void args;
	throw new Error('Not implemented: fillCropPaint');
}
```

DOM and data hooks. Task 0 adds the attachment points. A2 puts the images in and removes the split-stage `.upright-clip`. The fragment is not a DOM node. Do not replace it with a wrapper.

```html
<div class="upright-outer" data-fill-crop="outer"></div>
<div class="crop-window" data-fill-crop="window"></div>
```

CSS variables and the size container. Task 0 does not add a custom property and does not add a second `container-type`. The hide is the initial value so the hooks paint nothing before script runs:

```css
.record-page--split .split-frame > .upright-outer,
.record-page--split .split-frame > .crop-window {
	position: absolute;
	pointer-events: none;
	opacity: 0;
	visibility: hidden;
}
```

`.split-imagery` keeps `background: var(--bg)`. A2 reads that token. It does not assign a new color.

Fixtures. Task 0 does not call `cropWindow`. A1 asserts the geometry against this object.

```ts
export type FillCropWindow = {
	cropT: 0 | 0.5 | 1;
	left: number;
	top: number;
	width: number;
	height: number;
	centerX: number;
	centerY: number;
};

export type FillCropRect = { left: number; top: number; width: number; height: number };

export type FillCropDetail = {
	natural: { width: number; height: number };
	plate: { width: number; height: number };
	crop: { x: number; y: number; w: number; h: number };
};

export type FillCropFixture = {
	id: 'mhjl329';
	rem: 18;
	desk: { width: 801; height: 900 };
	phone: { width: 354; height: 489.5 };
	paneCenterDesk: { x: 400.5; y: 450 };
	paneCenterPhone: { x: 177; y: 244.75 };
	label: FillCropDetail & {
		s: FillCropRect;
		windows: { t0: FillCropWindow; t05: FillCropWindow; t1: FillCropWindow };
	};
	cover: FillCropDetail & {
		s: FillCropRect;
		fixedCenter: FillCropRect;
		windows: { t0: FillCropWindow; t05: FillCropWindow };
	};
	phoneCover: { t0: FillCropWindow; s: FillCropRect };
	local: { hold: 0.08; zoomMid: 0.24; wash: 0.46; plateEnd: 0.52 };
	tolerancePx: 0.01;
	settledTolerancePx: 0.1;
};

export const mhjl329FillCrop: FillCropFixture;
```

- [ ] **Step 1: Write the failing contract test**

Create `src/data/fill-crop-fade.contract.test.ts`:

```ts
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import { cropWindow, fillCropPaint } from './detail-display.ts';
import { mhjl329FillCrop } from './fill-crop-fade-fixtures.ts';

const here = dirname(fileURLToPath(import.meta.url));

describe('fill-crop fade contract', () => {
	it('exports the window and paint names and the fixture fields', () => {
		assert.equal(typeof cropWindow, 'function');
		assert.equal(typeof fillCropPaint, 'function');
		assert.equal(mhjl329FillCrop.id, 'mhjl329');
		assert.equal(mhjl329FillCrop.desk.width, 801);
		assert.equal(mhjl329FillCrop.desk.height, 900);
		assert.equal(mhjl329FillCrop.phone.width, 354);
		assert.equal(mhjl329FillCrop.phone.height, 489.5);
		assert.equal(mhjl329FillCrop.local.hold, 0.08);
		assert.equal(mhjl329FillCrop.local.zoomMid, 0.24);
		assert.equal(mhjl329FillCrop.local.wash, 0.46);
		assert.equal(mhjl329FillCrop.local.plateEnd, 0.52);
		assert.equal(mhjl329FillCrop.tolerancePx, 0.01);
		assert.equal(mhjl329FillCrop.settledTolerancePx, 0.1);
		assert.equal(mhjl329FillCrop.label.windows.t0.cropT, 0);
		assert.equal(mhjl329FillCrop.label.windows.t1.cropT, 1);
		assert.equal(mhjl329FillCrop.cover.windows.t05.cropT, 0.5);
		assert.equal(typeof mhjl329FillCrop.label.crop.x, 'number');
		assert.equal(typeof mhjl329FillCrop.label.crop.y, 'number');
		assert.equal(typeof mhjl329FillCrop.label.crop.w, 'number');
		assert.equal(typeof mhjl329FillCrop.label.crop.h, 'number');
		assert.equal(typeof mhjl329FillCrop.label.natural.width, 'number');
		assert.equal(typeof mhjl329FillCrop.label.plate.height, 'number');
		assert.equal(typeof mhjl329FillCrop.label.windows.t0.left, 'number');
		assert.equal(typeof mhjl329FillCrop.label.windows.t0.top, 'number');
		assert.equal(typeof mhjl329FillCrop.label.windows.t0.width, 'number');
		assert.equal(typeof mhjl329FillCrop.label.windows.t0.height, 'number');
		assert.equal(typeof mhjl329FillCrop.label.windows.t0.centerX, 'number');
		assert.equal(typeof mhjl329FillCrop.label.windows.t0.centerY, 'number');
		assert.equal(typeof mhjl329FillCrop.cover.windows.t0.left, 'number');
		assert.equal(typeof mhjl329FillCrop.cover.fixedCenter.left, 'number');
		assert.equal(typeof mhjl329FillCrop.cover.s.width, 'number');
		assert.equal(typeof mhjl329FillCrop.phoneCover.t0.left, 'number');
		assert.equal(typeof mhjl329FillCrop.phoneCover.s.top, 'number');
		assert.equal(typeof mhjl329FillCrop.paneCenterDesk.x, 'number');
		assert.equal(typeof mhjl329FillCrop.paneCenterPhone.y, 'number');
	});

	it('freezes the hooks, the hide, and the single size container', () => {
		const display = readFileSync(join(here, 'detail-display.ts'), 'utf8');
		const css = readFileSync(join(here, '../styles/global.css'), 'utf8');
		const astro = readFileSync(join(here, '../pages/records/[id].astro'), 'utf8');
		const template = astro.slice(0, astro.indexOf('<script>'));
		const split = template.slice(template.indexOf('class="split-stage"'), template.indexOf('class="split-read"'));
		const legacy = template.slice(template.indexOf('class="record-split"'), template.indexOf('class="split-stage"'));
		assert.match(display, /export type FillCropPaint = \{/);
		assert.match(display, /export function cropWindow/);
		assert.match(display, /export function fillCropPaint/);
		assert.match(split, /class="upright-outer"/);
		assert.match(split, /data-fill-crop="outer"/);
		assert.match(split, /class="crop-window"/);
		assert.match(split, /data-fill-crop="window"/);
		assert.ok(split.indexOf('data-fill-crop="outer"') < split.indexOf('data-fill-crop="window"'));
		assert.ok(split.indexOf('data-fill-crop="window"') < split.indexOf('class="detail-stage"'));
		assert.equal(legacy.includes('data-fill-crop'), false);
		assert.match(legacy, /class="upright-clip"/);
		assert.match(
			css,
			/\.record-page--split \.split-frame > \.upright-outer,\s*\.record-page--split \.split-frame > \.crop-window \{\s*position:\s*absolute;\s*pointer-events:\s*none;\s*opacity:\s*0;\s*visibility:\s*hidden;\s*\}/,
		);
		assert.match(css, /\.record-page--split \{\s*--imagery-h: 58svh;\s*\}/);
		assert.match(css, /\.record-page--split \.split-frame\s*\{[^}]*container-type:\s*size/s);
		assert.equal(css.match(/container-type:\s*size/g)?.length, 1);
		assert.equal(css.includes('--fill-crop'), false);
		assert.match(css, /\.record-page--split \.split-imagery \{[^}]*background:\s*var\(--bg\);/s);
	});
});
```

- [ ] **Step 2: Run the contract test and see it fail**

Run: `node --experimental-strip-types --test src/data/fill-crop-fade.contract.test.ts`

Expected: FAIL. `fill-crop-fade-fixtures.ts` is missing, or `cropWindow` is not exported from `./detail-display.ts`.

- [ ] **Step 3: Add the stubs, the hooks, the hide, and the fixture**

In `src/data/detail-display.ts`, immediately after the closing brace of `zoomImageBox` and before `export const MIN_NOTE_REM`, paste the stub block from **Interfaces**. Do not edit `openingBox`, `plateBox`, or `zoomImageBox`.

Create `src/data/fill-crop-fade-fixtures.ts`:

```ts
export type FillCropWindow = {
	cropT: 0 | 0.5 | 1;
	left: number;
	top: number;
	width: number;
	height: number;
	centerX: number;
	centerY: number;
};

export type FillCropRect = { left: number; top: number; width: number; height: number };

export type FillCropDetail = {
	natural: { width: number; height: number };
	plate: { width: number; height: number };
	crop: { x: number; y: number; w: number; h: number };
};

export type FillCropFixture = {
	id: 'mhjl329';
	rem: 18;
	desk: { width: 801; height: 900 };
	phone: { width: 354; height: 489.5 };
	paneCenterDesk: { x: 400.5; y: 450 };
	paneCenterPhone: { x: 177; y: 244.75 };
	label: FillCropDetail & {
		s: FillCropRect;
		windows: { t0: FillCropWindow; t05: FillCropWindow; t1: FillCropWindow };
	};
	cover: FillCropDetail & {
		s: FillCropRect;
		fixedCenter: FillCropRect;
		windows: { t0: FillCropWindow; t05: FillCropWindow };
	};
	phoneCover: { t0: FillCropWindow; s: FillCropRect };
	local: { hold: 0.08; zoomMid: 0.24; wash: 0.46; plateEnd: 0.52 };
	tolerancePx: 0.01;
	settledTolerancePx: 0.1;
};

export const mhjl329FillCrop: FillCropFixture = {
	id: 'mhjl329',
	rem: 18,
	desk: { width: 801, height: 900 },
	phone: { width: 354, height: 489.5 },
	paneCenterDesk: { x: 400.5, y: 450 },
	paneCenterPhone: { x: 177, y: 244.75 },
	label: {
		natural: { width: 1050, height: 1400 },
		plate: { width: 400, height: 400 },
		crop: { x: 274, y: 403, w: 514, h: 514 },
		s: { left: 157.5, top: 207, width: 486, height: 486 },
		windows: {
			t0: {
				cropT: 0,
				left: 239.143,
				top: 259.071,
				width: 330.429,
				height: 330.429,
				centerX: 404.357,
				centerY: 424.286,
			},
			t05: {
				cropT: 0.5,
				left: 202.061,
				top: 236.776,
				width: 400.735,
				height: 400.735,
				centerX: 402.429,
				centerY: 437.143,
			},
			t1: {
				cropT: 1,
				left: 157.5,
				top: 207,
				width: 486,
				height: 486,
				centerX: 400.5,
				centerY: 450,
			},
		},
	},
	cover: {
		natural: { width: 1400, height: 1400 },
		plate: { width: 400, height: 248 },
		crop: { x: 219, y: 210, w: 379, h: 235 },
		s: { left: 112.14, top: 271.217, width: 576.72, height: 357.566 },
		fixedCenter: { left: 292.079, top: 382.773, width: 216.842, height: 134.454 },
		windows: {
			t0: {
				cropT: 0,
				left: 125.299,
				top: 169.65,
				width: 216.842,
				height: 134.454,
				centerX: 233.72,
				centerY: 236.877,
			},
			t05: {
				cropT: 0.5,
				left: 140.301,
				top: 233.807,
				width: 353.619,
				height: 219.263,
				centerX: 317.11,
				centerY: 343.438,
			},
		},
	},
	phoneCover: {
		t0: {
			cropT: 0,
			left: 55.376,
			top: 120.85,
			width: 95.833,
			height: 59.421,
			centerX: 103.292,
			centerY: 150.561,
		},
		s: { left: 49.56, top: 165.737, width: 254.88, height: 158.026 },
	},
	local: { hold: 0.08, zoomMid: 0.24, wash: 0.46, plateEnd: 0.52 },
	tolerancePx: 0.01,
	settledTolerancePx: 0.1,
};
```

The fixture stores the spec’s three-decimal rows as their numeric values (`112.140` is `112.14`). A1’s `deepEqual` uses those same values. Do not recompute a row and then round it.

In `src/pages/records/[id].astro`, change only the upright inside the `.split-stage` map (the `revealDetails.map((detail, index)` block before `class="split-read"`). Leave the `.record-split` upright and the `.detail-figure` upright in `.split-read` on `.upright-clip`.

```astro
{detail.upright && detail.transform && (
	<>
		<div class="upright-outer" data-fill-crop="outer"></div>
		<div class="crop-window" data-fill-crop="window"></div>
		<div class="upright-clip">
			<img
				class="upright"
				src={detail.upright.src}
				width={detail.upright.width}
				height={detail.upright.height}
				alt=""
				aria-hidden="true"
				decoding="async"
				loading="eager"
				data-crop-x={detail.transform.crop.x}
				data-crop-y={detail.transform.crop.y}
				data-crop-w={detail.transform.crop.w}
				data-crop-h={detail.transform.crop.h}
			/>
		</div>
	</>
)}
```

In `src/styles/global.css`, immediately after `.record-page--split .split-frame > .upright-clip { z-index: 1; }`, add the hide rule from **Interfaces**. Do not edit the `is-plate` rules, the `1.618fr` tracks, or `--imagery-h`.

- [ ] **Step 4: Run the contract test and the existing records tests**

Run: `node --experimental-strip-types --test src/data/fill-crop-fade.contract.test.ts src/data/detail-display.test.ts src/data/split-stage.test.ts src/data/callout-settle.source.test.ts`

Expected: PASS. The contract test does not call `cropWindow`. The plate-hold source lock still sees one `.upright-clip` and `visual.uprightOpacity` on the clip. Eager loads in the split map stay at 2.

- [ ] **Step 5: Commit**

```bash
git add src/data/fill-crop-fade-fixtures.ts src/data/fill-crop-fade.contract.test.ts src/data/detail-display.ts src/pages/records/[id].astro src/styles/global.css
git commit -m "feat: publish fill-crop fade contract surfaces"
```

---

### Lane A — fill→crop composite

**Base:** the Task 0 commit. There is no sibling lane.
**Writes:** A1 writes `src/data/detail-display.ts` and `src/data/detail-display.test.ts`. A2 writes `src/pages/records/[id].astro`, `src/styles/global.css`, and `src/data/detail-display.test.ts`.
**Reads:** `cropWindow`, `fillCropPaint`, `mhjl329FillCrop`, `data-fill-crop`, and the Task 0 hide.
**Done when:** A1’s tests pass on Task 0 alone, and A2’s tests pass on Task 0 plus A1. Integration is the only live check.

A1 and A2 are ordered tasks inside this one lane. They are not parallel write-set lanes.

#### Task A1: Crop window and paint values

**Files:**
- Modify: `src/data/detail-display.ts` (replace the two stubs; do not edit `zoomImageBox`)
- Modify: `src/data/detail-display.test.ts` (import list and a new describe at the end)
- Test: `src/data/detail-display.test.ts`

**Interfaces:**
- Consumes:

```ts
export type FillCropPaint = {
	outerOpacity: number;
	windowOpacity: number;
	plateOpacity: 0 | 1;
};

export function cropWindow(args: {
	image: FrameBox;
	naturalWidth: number;
	crop: Crop;
}): FrameBox;

export function fillCropPaint(args: {
	cropT: number;
	local: number;
	plateEnd: number;
}): FillCropPaint;
```

`FrameBox` is `{ left: number; top: number; width: number; height: number }`. `Crop` is `{ x: number; y: number; w: number; h: number }`. `openingBox`, `plateBox`, and `zoomImageBox` stay. `mhjl329FillCrop` is the Task 0 fixture. `stageVisual` and `PLATE_END` stay exported from `src/data/split-stage.ts`.

- Produces: the same two functions with bodies. A2 calls them. `cropWindow` returns `{ left: 0, top: 0, width: 0, height: 0 }` when `naturalWidth <= 0`, `crop.w <= 0`, `crop.h <= 0`, `image.width <= 0`, or `image.height <= 0`. Otherwise `s = image.width / naturalWidth` and the window is `image.left + crop.x * s`, `image.top + crop.y * s`, `crop.w * s`, `crop.h * s`. `fillCropPaint` clamps `cropT` to `[0, 1]`, sets `outerOpacity` to `1 - cropT`, `windowOpacity` to `1`, and `plateOpacity` to `1` when `local >= plateEnd` and `0` otherwise.

- [ ] **Step 1: Write the failing test**

Add `cropWindow` and `fillCropPaint` to the import from `./detail-display.ts`. Add the fixture import. Extend the `split-stage.ts` import:

```ts
import { mhjl329FillCrop } from './fill-crop-fade-fixtures.ts';
import { cameraBox, PLATE_END, stageVisual } from './split-stage.ts';
```

Append this describe. Leave every existing describe as it is, including `describe('plate hold')` and `describe('split pose source')`. A2 edits those.

```ts
describe('fill to crop', () => {
	const fix = mhjl329FillCrop;
	const zero = { left: 0, top: 0, width: 0, height: 0 };

	function near(actual: number, expected: number, tol = fix.tolerancePx): void {
		assert.ok(Math.abs(actual - expected) <= tol, `${actual} not within ${tol} of ${expected}`);
	}

	function expectWindow(
		actual: { left: number; top: number; width: number; height: number },
		row: { left: number; top: number; width: number; height: number; centerX: number; centerY: number },
		tol = fix.tolerancePx,
	): void {
		near(actual.left, row.left, tol);
		near(actual.top, row.top, tol);
		near(actual.width, row.width, tol);
		near(actual.height, row.height, tol);
		near(actual.left + actual.width / 2, row.centerX, tol);
		near(actual.top + actual.height / 2, row.centerY, tol);
	}

	function windowAt(
		detail: {
			natural: { width: number; height: number };
			plate: { width: number; height: number };
			crop: { x: number; y: number; w: number; h: number };
		},
		pane: { width: number; height: number },
		cropT: number,
	) {
		const opening = openingBox(pane, detail.natural);
		const plate = plateBox(pane, opening, detail.plate, detail.natural, detail.crop);
		const image = zoomImageBox({
			opening,
			plate,
			natural: detail.natural,
			crop: detail.crop,
			cropT,
		});
		return cropWindow({ image, naturalWidth: detail.natural.width, crop: detail.crop });
	}

	it('places the live crop window on the MHJL 329 rows', () => {
		assert.deepEqual(fix.label.windows.t0, {
			cropT: 0,
			left: 239.143,
			top: 259.071,
			width: 330.429,
			height: 330.429,
			centerX: 404.357,
			centerY: 424.286,
		});
		assert.deepEqual(fix.label.windows.t05, {
			cropT: 0.5,
			left: 202.061,
			top: 236.776,
			width: 400.735,
			height: 400.735,
			centerX: 402.429,
			centerY: 437.143,
		});
		assert.deepEqual(fix.label.windows.t1, {
			cropT: 1,
			left: 157.5,
			top: 207,
			width: 486,
			height: 486,
			centerX: 400.5,
			centerY: 450,
		});
		assert.deepEqual(fix.label.s, { left: 157.5, top: 207, width: 486, height: 486 });
		expectWindow(windowAt(fix.label, fix.desk, 0), fix.label.windows.t0);
		expectWindow(windowAt(fix.label, fix.desk, 0.5), fix.label.windows.t05);
		expectWindow(windowAt(fix.label, fix.desk, 1), fix.label.windows.t1);

		assert.deepEqual(fix.cover.windows.t0, {
			cropT: 0,
			left: 125.299,
			top: 169.65,
			width: 216.842,
			height: 134.454,
			centerX: 233.72,
			centerY: 236.877,
		});
		assert.deepEqual(fix.cover.windows.t05, {
			cropT: 0.5,
			left: 140.301,
			top: 233.807,
			width: 353.619,
			height: 219.263,
			centerX: 317.11,
			centerY: 343.438,
		});
		assert.deepEqual(fix.cover.s, { left: 112.14, top: 271.217, width: 576.72, height: 357.566 });
		assert.deepEqual(fix.cover.fixedCenter, {
			left: 292.079,
			top: 382.773,
			width: 216.842,
			height: 134.454,
		});
		const coverStart = windowAt(fix.cover, fix.desk, 0);
		expectWindow(coverStart, fix.cover.windows.t0);
		expectWindow(windowAt(fix.cover, fix.desk, 0.5), fix.cover.windows.t05);
		assert.ok(Math.abs(coverStart.left - fix.cover.fixedCenter.left) > 1);
		const coverEnd = windowAt(fix.cover, fix.desk, 1);
		near(coverEnd.left, fix.cover.s.left, fix.settledTolerancePx);
		near(coverEnd.top, fix.cover.s.top, fix.settledTolerancePx);
		near(coverEnd.width, fix.cover.s.width, fix.settledTolerancePx);
		near(coverEnd.height, fix.cover.s.height, fix.settledTolerancePx);

		assert.deepEqual(fix.phoneCover.t0, {
			cropT: 0,
			left: 55.376,
			top: 120.85,
			width: 95.833,
			height: 59.421,
			centerX: 103.292,
			centerY: 150.561,
		});
		assert.deepEqual(fix.phoneCover.s, { left: 49.56, top: 165.737, width: 254.88, height: 158.026 });
		expectWindow(windowAt(fix.cover, fix.phone, 0), fix.phoneCover.t0);
		const phoneEnd = windowAt(fix.cover, fix.phone, 1);
		near(phoneEnd.left, fix.phoneCover.s.left, fix.settledTolerancePx);
		near(phoneEnd.top, fix.phoneCover.s.top, fix.settledTolerancePx);
		near(phoneEnd.width, fix.phoneCover.s.width, fix.settledTolerancePx);
		near(phoneEnd.height, fix.phoneCover.s.height, fix.settledTolerancePx);

		const direct = cropWindow({
			image: { left: 10, top: 20, width: 100, height: 50 },
			naturalWidth: 200,
			crop: { x: 5, y: 6, w: 20, h: 10 },
		});
		assert.deepEqual(direct, { left: 12.5, top: 23, width: 10, height: 5 });
		assert.deepEqual(
			cropWindow({
				image: { left: 1, top: 2, width: 10, height: 10 },
				naturalWidth: 0,
				crop: { x: 0, y: 0, w: 1, h: 1 },
			}),
			zero,
		);
		assert.deepEqual(
			cropWindow({
				image: { left: 1, top: 2, width: 10, height: 10 },
				naturalWidth: 10,
				crop: { x: 0, y: 0, w: 0, h: 1 },
			}),
			zero,
		);
		assert.deepEqual(
			cropWindow({
				image: { left: 0, top: 0, width: 0, height: 10 },
				naturalWidth: 10,
				crop: { x: 0, y: 0, w: 1, h: 1 },
			}),
			zero,
		);
	});

	it('keeps the window opaque while stageVisual still reports the old wash', () => {
		const wash = stageVisual(fix.local.wash, true);
		assert.equal(wash.cropT, 1);
		assert.equal(wash.uprightOpacity, 0.5);
		assert.equal(wash.plateOpacity, 0.5);
		const washed = fillCropPaint({ cropT: wash.cropT, local: fix.local.wash, plateEnd: PLATE_END });
		assert.equal(washed.outerOpacity, 0);
		assert.equal(washed.windowOpacity, 1);
		assert.equal(washed.plateOpacity, 0);
		assert.notEqual(washed.windowOpacity, wash.uprightOpacity);
		assert.notEqual(washed.outerOpacity, wash.uprightOpacity);

		const mid = stageVisual(fix.local.zoomMid, true);
		// (0.24 - 0.08) / (0.40 - 0.08) is one ulp under 0.5. Outer opacity is one ulp over 0.5.
		near(mid.cropT, 0.5);
		const zooming = fillCropPaint({ cropT: mid.cropT, local: fix.local.zoomMid, plateEnd: PLATE_END });
		near(zooming.outerOpacity, 0.5);
		assert.equal(zooming.windowOpacity, 1);
		assert.equal(zooming.plateOpacity, 0);

		const hold = fillCropPaint({ cropT: 0, local: fix.local.hold, plateEnd: PLATE_END });
		assert.equal(hold.outerOpacity, 1);
		assert.equal(hold.windowOpacity, 1);
		assert.equal(hold.plateOpacity, 0);

		const cut = fillCropPaint({ cropT: 1, local: PLATE_END, plateEnd: PLATE_END });
		assert.equal(cut.outerOpacity, 0);
		assert.equal(cut.windowOpacity, 1);
		assert.equal(cut.plateOpacity, 1);
		const below = fillCropPaint({ cropT: 1, local: PLATE_END - 0.001, plateEnd: PLATE_END });
		assert.equal(below.plateOpacity, 0);
		const over = fillCropPaint({ cropT: 2, local: 1, plateEnd: PLATE_END });
		assert.equal(over.outerOpacity, 0);
		assert.equal(over.plateOpacity, 1);
		const under = fillCropPaint({ cropT: -1, local: 0, plateEnd: PLATE_END });
		assert.equal(under.outerOpacity, 1);
		assert.equal(under.plateOpacity, 0);
	});

	it('leaves zoomImageBox on the geometric pose', () => {
		const here = dirname(fileURLToPath(import.meta.url));
		const source = readFileSync(join(here, 'detail-display.ts'), 'utf8');
		const zoom = source.slice(source.indexOf('export function zoomImageBox'), source.indexOf('export function cropWindow'));
		assert.match(zoom, /const s = s0 === s1 \|\| s0 <= 0 \|\| s1 <= 0 \? s0 : s0 \* \(s1 \/ s0\) \*\* u;/);
		assert.equal(zoom.includes('cropWindow'), false);
		assert.equal(zoom.includes('angleDeg'), false);
		const stage = readFileSync(join(here, 'split-stage.ts'), 'utf8');
		const plateSpan = stage.slice(stage.indexOf('if (u <= PLATE_END)'), stage.indexOf('if (u <= BOXES_END)'));
		assert.match(plateSpan, /uprightOpacity: 1 - t/);
		assert.match(plateSpan, /plateOpacity: t/);
	});
});
```

- [ ] **Step 2: Run the new tests and see them fail**

Run: `node --experimental-strip-types --test src/data/detail-display.test.ts`

Expected: FAIL in `describe('fill to crop')` with `Not implemented: cropWindow`. The older describes still pass.

- [ ] **Step 3: Replace the stubs**

Replace the Task 0 bodies. Leave the signatures as published.

```ts
export function cropWindow(args: {
	image: FrameBox;
	naturalWidth: number;
	crop: Crop;
}): FrameBox {
	const { image, naturalWidth, crop } = args;
	if (naturalWidth <= 0 || crop.w <= 0 || crop.h <= 0 || image.width <= 0 || image.height <= 0) {
		return { left: 0, top: 0, width: 0, height: 0 };
	}
	const s = image.width / naturalWidth;
	return {
		left: image.left + crop.x * s,
		top: image.top + crop.y * s,
		width: crop.w * s,
		height: crop.h * s,
	};
}

export function fillCropPaint(args: {
	cropT: number;
	local: number;
	plateEnd: number;
}): FillCropPaint {
	const cropT = Math.min(1, Math.max(0, args.cropT));
	const plateOpacity: 0 | 1 = args.local >= args.plateEnd ? 1 : 0;
	return {
		outerOpacity: 1 - cropT,
		windowOpacity: 1,
		plateOpacity,
	};
}
```

- [ ] **Step 4: Run the tests and see them pass**

Run: `node --experimental-strip-types --test src/data/detail-display.test.ts src/data/fill-crop-fade.contract.test.ts src/data/split-stage.test.ts`

Expected: PASS. `zoomImageBox` is unchanged. `stageVisual(0.46)` still reports `0.5` and `0.5`.

- [ ] **Step 5: Commit**

```bash
git add src/data/detail-display.ts src/data/detail-display.test.ts
git commit -m "feat: crop the fill window from the live pose"
```

#### Task A2: Outer fade and opaque window

**Files:**
- Modify: `src/pages/records/[id].astro` (`.split-stage` markup, script imports, `applyFrame`, `clearScrubStyles`, `showSettled`, the collapse tail in `applyAll`)
- Modify: `src/styles/global.css` (layer stack and `is-plate` outer hide)
- Modify: `src/data/detail-display.test.ts` (`describe('plate hold')` and `describe('split pose source')`, plus one source `it` inside `describe('fill to crop')`)
- Test: `src/data/detail-display.test.ts`

**Interfaces:**
- Consumes:

```ts
export function cropWindow(args: {
	image: FrameBox;
	naturalWidth: number;
	crop: Crop;
}): FrameBox;

export function fillCropPaint(args: {
	cropT: number;
	local: number;
	plateEnd: number;
}): FillCropPaint;
```

`PLATE_END` from `src/data/split-stage.ts`. Hooks `data-fill-crop="outer"` and `data-fill-crop="window"`. The Task 0 hide stays in the stylesheet. `zoomImageBox` is called as `zoomImageBox({ opening, plate, natural, crop, cropT: visual.cropT })`. `stageVisual` is still called. Its `boxesOpacity`, `leadersOpacity`, and `notesOpacity` are still written onto `.mark-graphics`, `.mark-leaders`, and `.mark-list`. `uprightOpacity` and `plateOpacity` are not written onto the photograph.

- Produces: `matchPlateFrame(frame: HTMLElement): void` in the page script. `applyFrame` paints the outer at `paint.outerOpacity`, the window at `paint.windowOpacity` (`1`), and the plate file at `paint.plateOpacity` (`0` or `1`). At `visual.cropT === 1`, and again after `collapseToContent`, `matchPlateFrame` copies `.plate-frame`’s inline rect onto `.crop-window` so the settled window and the plate frame are the same rect, including the mobile content shift. A zero `cropWindow` clears the window rect and does not cover the pane. A zero pane makes `layoutSplit` return null, and `applyFrame` writes no clip in that case. `clearScrubStyles` clears `.crop-window`’s inline rect and `.upright-outer`’s inline opacity and visibility. `showSettled` calls `applyFrame(frame, 1)` after that clear, then `position` before `collapseToContent(frame, 'frame')`, then `matchPlateFrame`.

Do not edit `layoutSplit`, `positionSplit`, `collapseToContent`, `placeNotes`, `openingBox`, `plateBox`, `zoomImageBox`, or `src/data/split-stage.ts`. Do not edit the `.record-split` upright or the `.detail-figure` upright under `.split-read`.

- [ ] **Step 1: Write the failing source test**

In `describe('plate hold')`, replace the body of `it('eager-loads split plates and lets is-plate beat the unsettled veil')` with:

```ts
it('eager-loads split plates and lets is-plate beat the unsettled veil', () => {
	const here = dirname(fileURLToPath(import.meta.url));
	const astro = readFileSync(join(here, '../pages/records/[id].astro'), 'utf8');
	const split = astro.slice(
		astro.indexOf('revealDetails.map((detail, index)'),
		astro.indexOf('class="split-read"'),
	);
	assert.equal(split.includes('loading="lazy"'), false);
	assert.equal(split.includes("loading={index === 0 ? 'eager' : 'lazy'}"), false);
	assert.equal((split.match(/loading="eager"/g) ?? []).length, 3);
	assert.equal((split.match(/fetchpriority=\{index === 0 \? 'high' : 'auto'\}/g) ?? []).length, 1);
	assert.ok(astro.includes('loading="lazy"'));
	assert.match(astro, /classList\.toggle\('is-plate', paint\.plateOpacity === 1\)/);
	assert.equal(astro.includes('visual.uprightOpacity'), false);
	assert.equal(astro.includes('visual.plateOpacity'), false);

	const css = readFileSync(join(here, '../styles/global.css'), 'utf8');
	const splitHold = css.indexOf('.record-page--split .split-frame:not(.is-settled) .plate');
	const plateOn = css.indexOf('.split-frame.is-plate');
	assert.ok(splitHold >= 0 && plateOn > splitHold);
	const reduce = css.indexOf("html[data-motion='reduce']", plateOn);
	const block = css.slice(plateOn, reduce);
	assert.match(block, /img\.plate\s*\{[^}]*opacity:\s*1/s);
	assert.match(block, /\.upright-outer\s*\{[^}]*opacity:\s*0/s);
	assert.match(block, /visibility:\s*hidden/);
	assert.equal(block.includes('.crop-window'), false);
	assert.equal(block.includes('mark-leader'), false);
	assert.equal(block.includes('mark-graphics'), false);
	assert.equal(block.includes('mark-list'), false);
});
```

Replace the whole `it('clips the upright to the pane and zooms toward S')` with:

```ts
it('clips the upright to the pane and zooms toward S', () => {
	const here = dirname(fileURLToPath(import.meta.url));
	const astro = readFileSync(join(here, '../pages/records/[id].astro'), 'utf8');
	const split = astro.slice(astro.indexOf('class="split-stage"'), astro.indexOf('class="split-read"'));
	assert.equal(split.includes('upright-clip'), false);
	assert.equal(split.includes('mark-slot'), false);
	const windowAt = split.indexOf('data-fill-crop="window"');
	const stageAt = split.indexOf('class="detail-stage"');
	const listAt = split.indexOf('class="mark-list"');
	assert.ok(windowAt >= 0 && stageAt > windowAt && listAt > stageAt);
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
	assert.match(legacy, /class="upright-clip"/);
	assert.equal(legacy.includes('data-fill-crop'), false);
	const afterRead = astro.slice(astro.indexOf('class="split-read"'));
	assert.match(afterRead, /class="upright-clip"/);
});
```

Append this `it` inside `describe('fill to crop')`:

```ts
it('paints the outer and the window without the photo ramp', () => {
	const here = dirname(fileURLToPath(import.meta.url));
	const astro = readFileSync(join(here, '../pages/records/[id].astro'), 'utf8');
	const css = readFileSync(join(here, '../styles/global.css'), 'utf8');
	const apply = astro.slice(astro.indexOf('function applyFrame'), astro.indexOf('function bindSplit'));
	assert.match(apply, /fillCropPaint\(\{[\s\S]*cropT: visual\.cropT[\s\S]*local: p[\s\S]*plateEnd: PLATE_END/);
	assert.match(apply, /cropWindow\(\{/);
	assert.match(apply, /box\.left - windowBox\.left/);
	assert.match(apply, /box\.top - windowBox\.top/);
	assert.match(apply, /windowBox\.width <= 0 \|\| windowBox\.height <= 0/);
	assert.match(apply, /outer\.style\.opacity = String\(paint\.outerOpacity\)/);
	assert.match(apply, /windowEl\.style\.opacity = String\(paint\.windowOpacity\)/);
	assert.match(apply, /plate\.style\.opacity = String\(paint\.plateOpacity\)/);
	assert.match(apply, /upright\.style\.opacity = '1'/);
	assert.match(apply, /windowImg\.style\.opacity = '1'/);
	assert.match(apply, /visual\.cropT === 1\) matchPlateFrame\(frame\)/);
	assert.equal(apply.includes('frame.style.opacity'), false);
	assert.equal(apply.includes('visual.uprightOpacity'), false);
	assert.equal(apply.includes('visual.plateOpacity'), false);
	assert.match(apply, /visual\.boxesOpacity/);
	assert.match(apply, /visual\.leadersOpacity/);
	assert.match(apply, /visual\.notesOpacity/);
	assert.match(apply, /zoomImageBox\(\{[\s\S]*cropT: visual\.cropT/);
	assert.match(apply, /upright\.style\.right = 'auto'/);
	assert.match(apply, /upright\.style\.bottom = 'auto'/);
	assert.equal(apply.includes('angleDeg'), false);
	assert.equal(apply.includes('cameraBox('), false);
	assert.equal(apply.includes('rotate'), false);

	const clear = astro.slice(astro.indexOf('const clearScrubStyles'), astro.indexOf('const showSettled'));
	assert.match(clear, /\.upright-outer, \.crop-window, \.upright, \.plate, \.mark-graphics, \.mark-leaders, \.mark-list/);
	assert.match(clear, /node\.style\.visibility = ''/);
	assert.match(clear, /querySelectorAll<HTMLElement>\('\.crop-window'\)/);

	const showSettled = astro.slice(astro.indexOf('const showSettled'), astro.indexOf('const armFade'));
	assert.match(showSettled, /applyFrame\(frame, 1\)/);
	assert.ok(showSettled.indexOf('applyFrame(frame, 1)') < showSettled.indexOf('position(frame)'));
	assert.ok(showSettled.indexOf('position(frame)') < showSettled.indexOf("collapseToContent(frame, 'frame')"));
	assert.ok(showSettled.indexOf("collapseToContent(frame, 'frame')") < showSettled.indexOf('matchPlateFrame(frame)'));
	assert.match(astro, /collapseToContent\(active, 'page'\)/);
	assert.match(astro, /matchPlateFrame\(active\)/);
	assert.match(astro, /DETAIL_CROSSFADE_MS/);
	assert.match(astro, /1 - visual\.leadersOpacity/);

	assert.match(
		css,
		/\.record-page--split \.split-frame > \.crop-window \{\s*z-index:\s*1;\s*overflow:\s*hidden;\s*background:\s*transparent;\s*\}/,
	);
	assert.match(
		css,
		/\.record-page--split \.split-frame > \.upright-outer \{\s*inset:\s*0;\s*z-index:\s*1;\s*overflow:\s*visible;\s*background:\s*transparent;\s*\}/,
	);
	assert.doesNotMatch(
		css,
		/html\[data-motion='ok'\] \.record-page--split \.split-frame:not\(\.is-settled\) \.upright-outer \{[^}]*opacity:\s*1/s,
	);
	assert.match(css, /grid-template-columns:\s*minmax\(0,\s*1\.618fr\)\s*minmax\(0,\s*1fr\)/);
	const splitCss = css.slice(css.indexOf('.record-page--split'));
	const desktopStart = splitCss.indexOf('@media (min-width: 48rem)');
	const desktopBody = splitCss.slice(desktopStart, splitCss.indexOf('@media', desktopStart + 10));
	assert.match(desktopBody, /\.split-frame\s*\{[^}]*height:\s*100svh/s);
});
```

- [ ] **Step 2: Run the source tests and see them fail**

Run: `node --experimental-strip-types --test src/data/detail-display.test.ts`

Expected: FAIL. `describe('plate hold')` does not find `paint.plateOpacity`, and the new `it` does not find `fillCropPaint(`. `describe('fill to crop')` geometry tests still pass.

- [ ] **Step 3: Paint the two layers**

Replace the `.split-stage` upright block with two copies of the same upright URL. Delete `.upright-clip` from that block only.

```astro
{detail.upright && detail.transform && (
	<>
		<div class="upright-outer" data-fill-crop="outer">
			<img
				class="upright"
				src={detail.upright.src}
				width={detail.upright.width}
				height={detail.upright.height}
				alt=""
				aria-hidden="true"
				decoding="async"
				loading="eager"
				data-crop-x={detail.transform.crop.x}
				data-crop-y={detail.transform.crop.y}
				data-crop-w={detail.transform.crop.w}
				data-crop-h={detail.transform.crop.h}
			/>
		</div>
		<div class="crop-window" data-fill-crop="window">
			<img
				class="upright"
				src={detail.upright.src}
				width={detail.upright.width}
				height={detail.upright.height}
				alt=""
				aria-hidden="true"
				decoding="async"
				loading="eager"
				data-crop-x={detail.transform.crop.x}
				data-crop-y={detail.transform.crop.y}
				data-crop-w={detail.transform.crop.w}
				data-crop-h={detail.transform.crop.h}
			/>
		</div>
	</>
)}
```

Add `cropWindow` and `fillCropPaint` to the script import from `../../data/detail-display`, next to `zoomImageBox`. Add `PLATE_END` to the script import from `../../data/split-stage`.

Insert `matchPlateFrame` immediately before `applyFrame`, and replace `applyFrame` with:

```ts
function matchPlateFrame(frame: HTMLElement): void {
	const plateFrame = frame.querySelector<HTMLElement>('.plate-frame');
	const windowEl = frame.querySelector<HTMLElement>('.crop-window');
	if (!plateFrame || !windowEl) return;
	const left = plateFrame.style.left;
	const top = plateFrame.style.top;
	const width = plateFrame.style.width;
	const height = plateFrame.style.height;
	if (left === '' || top === '' || width === '' || height === '') return;
	windowEl.style.left = left;
	windowEl.style.top = top;
	windowEl.style.width = width;
	windowEl.style.height = height;
}

function applyFrame(frame: HTMLElement, p: number): void {
	const outer = frame.querySelector<HTMLElement>('.upright-outer');
	const upright = outer?.querySelector<HTMLImageElement>('.upright') ?? null;
	const windowEl = frame.querySelector<HTMLElement>('.crop-window');
	const windowImg = windowEl?.querySelector<HTMLImageElement>('.upright') ?? null;
	const plate = frame.querySelector<HTMLImageElement>('.plate');
	const graphics = frame.querySelector<SVGGElement>('.mark-graphics');
	const leaders = frame.querySelector<SVGGElement>('.mark-leaders');
	const notes = frame.querySelector<HTMLOListElement>('.mark-list');
	const notesOn = frame.dataset.notes === 'aligned';
	const visual = stageVisual(p, notesOn);
	const pose = layoutSplit(frame);
	const paint = fillCropPaint({
		cropT: visual.cropT,
		local: p,
		plateEnd: PLATE_END,
	});
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
		upright.style.opacity = '1';
		if (outer) {
			outer.style.opacity = String(paint.outerOpacity);
			outer.style.visibility = paint.outerOpacity === 0 ? 'hidden' : 'visible';
		}
		const windowBox = cropWindow({
			image: box,
			naturalWidth: pose.natural.width,
			crop: pose.crop,
		});
		if (windowEl) {
			windowEl.style.opacity = String(paint.windowOpacity);
			windowEl.style.visibility = 'visible';
			if (windowBox.width <= 0 || windowBox.height <= 0) {
				windowEl.style.left = '';
				windowEl.style.top = '';
				windowEl.style.width = '';
				windowEl.style.height = '';
			} else {
				windowEl.style.left = `${windowBox.left}px`;
				windowEl.style.top = `${windowBox.top}px`;
				windowEl.style.width = `${windowBox.width}px`;
				windowEl.style.height = `${windowBox.height}px`;
				if (windowImg) {
					windowImg.style.objectFit = 'fill';
					windowImg.style.maxWidth = 'none';
					windowImg.style.maxHeight = 'none';
					windowImg.style.right = 'auto';
					windowImg.style.bottom = 'auto';
					windowImg.style.left = `${box.left - windowBox.left}px`;
					windowImg.style.top = `${box.top - windowBox.top}px`;
					windowImg.style.width = `${box.width}px`;
					windowImg.style.height = `${box.height}px`;
					windowImg.style.opacity = '1';
				}
			}
		}
		if (visual.cropT === 1) matchPlateFrame(frame);
	}
	frame.classList.toggle('is-plate', paint.plateOpacity === 1);
	if (plate) plate.style.opacity = String(paint.plateOpacity);
	if (graphics) graphics.style.opacity = String(visual.boxesOpacity);
	if (leaders) {
		leaders.style.opacity = visual.leadersOpacity > 0 ? '1' : '0';
		frame.querySelectorAll<SVGPolylineElement>('.mark-leader-mask').forEach((mask) => {
			mask.setAttribute('pathLength', '1');
			mask.setAttribute('stroke-dasharray', '1');
			mask.setAttribute('stroke-dashoffset', String(1 - visual.leadersOpacity));
		});
	}
	if (notes) notes.style.opacity = String(visual.notesOpacity);
}
```

The outer image’s opacity stays `1`. The outer element carries `1 - cropT`. The window element carries `1`. Neither element is an ancestor of the other. `.split-frame` is their opacity ancestor for the detail joint only. Do not set `frame.style.opacity` from the photo ramp.

`collapseToContent` runs after `applyFrame` and shifts `.plate-frame`. The inner upright is positioned against the pre-shift window, so moving the window element moves that upright with the plate. In `applyAll`, keep the `notesOpacity > 0` guard and add `matchPlateFrame(active)` immediately after the `collapseToContent(active, 'page')` try/catch:

```ts
if (
	active &&
	isNarrow() &&
	stageVisual(activeLocal, active.dataset.notes === 'aligned').notesOpacity > 0
) {
	try {
		collapseToContent(active, 'page');
	} catch {
		/* keep the tall pane */
	}
	matchPlateFrame(active);
}
```

In `clearScrubStyles`, replace the opacity wipe and add the window-rect wipe. Keep the existing `.upright` and `.plate-frame` wipes.

```ts
frame
	.querySelectorAll<HTMLElement>('.upright-outer, .crop-window, .upright, .plate, .mark-graphics, .mark-leaders, .mark-list')
	.forEach((node) => {
		node.style.opacity = '';
		node.style.visibility = '';
	});
frame.querySelectorAll<HTMLImageElement>('.upright').forEach((node) => {
	node.style.left = '';
	node.style.top = '';
	node.style.width = '';
	node.style.height = '';
	node.style.right = '';
	node.style.bottom = '';
});
frame.querySelectorAll<HTMLElement>('.crop-window').forEach((node) => {
	node.style.left = '';
	node.style.top = '';
	node.style.width = '';
	node.style.height = '';
});
```

Replace `showSettled` with:

```ts
const showSettled = () => {
	clearScrubStyles();
	if (read) read.setAttribute('data-pace', 'pin');
	const place = !settledPlaced;
	for (const frame of frames) {
		frame.classList.add('is-active');
		frame.inert = false;
		frame.removeAttribute('aria-hidden');
		frame.style.transitionDuration = '0s';
		applyFrame(frame, 1);
		if (frame.dataset.notes === 'aligned' && place) {
			try {
				position(frame);
				if (isNarrow()) collapseToContent(frame, 'frame');
			} catch {
				/* the settled plate is already on screen */
			}
		}
		matchPlateFrame(frame);
	}
	if (place) settledPlaced = true;
};
```

`clearScrubStyles` drops the mid-scrub rect. `applyFrame(frame, 1)` paints the end state: window at `S`, plate file opacity `1`, outer opacity `0`. `matchPlateFrame` after collapse follows the shifted plate. Entering motion again is the existing listener: it does not clear, and `applyAll` scrubs from the runway.

In `src/styles/global.css`, delete `.record-page--split .split-frame > .upright-clip { z-index: 1; }`. Keep the Task 0 hide. Add:

```css
.record-page--split .split-frame > .upright-outer {
	inset: 0;
	z-index: 1;
	overflow: visible;
	background: transparent;
}

.record-page--split .split-frame > .crop-window {
	z-index: 1;
	overflow: hidden;
	background: transparent;
}
```

Delete:

```css
html[data-motion='ok'] .record-page--split .split-frame:not(.is-settled) .upright-clip {
	opacity: 1;
	visibility: visible;
}
```

Do not add a `data-motion='ok'` rule that sets `.upright-outer` opacity to `1`. The script shows the outer. No-JS stays on the Task 0 hide, so the outer upright does not appear and the centered plate cap (`72cqw` / `72cqh`) is unchanged.

Replace the `is-plate` upright rule. Leave the plate rule and the callout rules alone. The `is-plate` block stays above `html[data-motion='reduce']`.

```css
html[data-motion='ok'] .record-page--split .split-frame.is-plate img.plate {
	opacity: 1;
}

html[data-motion='ok'] .record-page--split .split-frame.is-plate .upright-outer {
	opacity: 0;
	visibility: hidden;
}
```

Do not set `.crop-window` opacity in that block. Do not set `.mark-box`, `.mark-leader`, or `.mark-list` opacity there. `.record-page--split .split-frame .detail-stage` stays `z-index: 2`, above both photograph layers. Do not change `grid-template-columns: minmax(0, 1.618fr) minmax(0, 1fr)` or the desktop `.split-frame { height: 100svh; }`.

- [ ] **Step 4: Run the tests and see them pass**

Run: `node --experimental-strip-types --test src/data/*.test.ts`

Expected: PASS. `callout-settle.source.test.ts` still sees `position(frame)` before `collapseToContent(frame, 'frame')`, no second `plateBox` in the collapse, desktop `100svh`, and `1.618fr 1fr`. `split-stage.test.ts` still locks the beat constants, `zoomImageBox` with `visual.cropT`, and `upright.style.right = 'auto'`.

Run: `npm run check`

Expected: `astro check` exits 0.

- [ ] **Step 5: Commit**

```bash
git add src/pages/records/[id].astro src/styles/global.css src/data/detail-display.test.ts
git commit -m "feat: fade the outer upright to paper"
```

---

### Serial

No task. The spec’s locks are inside A1 and A2, or they are files this plan does not edit.

- `stageVisual` still returns the photo ramp. A1 asserts the plate span. A2 does not read `uprightOpacity` or `plateOpacity`.
- `[id].astro` and `global.css` are A2’s write set. There is no second owner to wait for.
- `cameraBox`, `openingBox`, `plateBox`, `zoomImageBox`, `placeNotes`, elbow `6 5`, and `records.json` have no task.

### Integration

**Base:** the implementation branch after Task 0, A1, and A2.
**Writes:** none unless a check fails. A failure gets one fix on this same checkpoint, then the same commands once more.
**Reads:** the whole integrated diff.

One live pass. Do not open a second review cycle. The pass is `/records/mhjl329/` fill→crop: the center stays opaque, and the outer margin goes to paper blank.

- [ ] **Step 1: Run the automated checks**

Run:

```bash
node --experimental-strip-types --test src/data/*.test.ts
npm run check
npm run build
```

Expected: every test PASS, `astro check` exits 0, `astro build` exits 0. `src/data/records.json` and `src/data/split-stage.ts` have no diff. `openingBox`, `plateBox`, `zoomImageBox`, and `stageVisual` have no diff.

- [ ] **Step 2: Live-verify `/records/mhjl329/`**

Start `npm run preview`. Open `/records/mhjl329/`. Use a 16px initial font so `1rem` is 18px, and the light theme. Pixel figures assume no scrollbar. A 2px difference still passes on screen. The geometry table is already locked by A1 within `0.01px`.

With motion allowed, scrub the label and then the cover:

1. **Center stays opaque.** At the upright hold, the visible upright matches `U`. The window does not punch a hole. The plate file is hidden. Paper shows only outside `U`. Through the zoom, the crop inside the moving window stays fully opaque. At the old wash (local about `0.46`, between the zoom keypoint and the plate keypoint) the center is solid upright, not gray paper. The outer is already gone.
2. **Outer ends as paper.** At the zoom keypoint and at the plate keypoint, the letterbox and the side margin match `var(--bg)` (`#f3f0e8` in the light theme). No photograph sits at partial opacity outside the window. On the cover, the window starts up and to the left of the pane center and travels into `S`. It is not a centered rectangle that only scales.
3. **Plate cut.** Below the plate keypoint the plate file is hidden. At the plate keypoint and after, the plate file fills the window at full opacity. There is no frame where that file is half opaque. Scrubbing back across the plate keypoint hides the plate file and shows the upright window at full opacity, with the outer still paper. Scrubbing back through the zoom raises the outer and moves the window back along the same path. The window stays opaque.
4. **Callouts unchanged, same pass.** At the notes keypoint, boxes, elbow leaders, prefixes, and `data-callout` match the shipped page. The window does not slice a note or a leader. A letterbox note can sit in the paper. Imagery / reading at 1440×900 is between 1.60 and 1.64. At 390×844 the settled pane still follows the shipped margin-first track.
5. **Unchanged machinery, same pass.** `/records/ml4001/` still uses `.record-split`. 记述 and the note text match the page you loaded. Desktop tracks stay `1.618fr` / `1fr`. Imagery height at 1440×900 stays `100svh`.

Reduced motion, same URL: no scrub. The plate sits in the settled window on paper, with boxes and notes. The outer upright is hidden. No gray frame.

No-JS, same URL: the first plate, centered and capped, on paper. No outer upright and no fade.

- [ ] **Step 3: Review the integrated diff once**

Read the diff from the Task 0 parent through A2. Confirm `records.json` and `split-stage.ts` are untouched, the two photograph layers are siblings, and `is-plate` does not set `.crop-window` opacity. A failed check gets one fix and one re-run of this same Integration task. A green checkpoint ends the plan.

```bash
git add -A
git commit -m "fix: settle fill-crop fade integration"
```

Skip the commit when Step 1 and Step 2 found nothing to change.

---

## Spec coverage

| Spec lock | Task |
|---|---|
| Window composited opacity is 1 for the whole pass | A1 `fillCropPaint` returns `windowOpacity: 1`; A2 writes it on `.crop-window` and on both upright images |
| Window rect is `zoomImageBox`’s crop, every frame, including the cover’s off-center start | A1 rows; A2 writes the rect from `cropWindow` |
| Not a pane-centered rectangle | A1 asserts the cover `cropT = 0` window is not `fixedCenter` |
| Outer opacity `1 - cropT`, gone at `cropT = 1`, paper is `var(--bg)` | A1 paint values; A2 sets them on `.upright-outer`; `.split-imagery` background stays |
| Hard cut at `local >= PLATE_END`; plate opacity is 0 or 1 | A1 `plateOpacity`; A2 assigns `paint.plateOpacity` and toggles `is-plate` from it |
| `stageVisual` still returns 0.5 / 0.5 at local 0.46, and the photograph does not use those fields | A1 wash test; A2 source test forbids `visual.uprightOpacity` and `visual.plateOpacity` |
| `zoomImageBox`, `openingBox`, `plateBox`, `cameraBox`, `angleDeg` stay | A1 source slice; no task edits `split-stage.ts`; A2 forbids `cameraBox(` and `angleDeg` in `applyFrame` |
| Zero natural size, zero crop, or zero image writes no clip. A zero pane writes no clip | A1 zero box; A2 clears the inline rect, and a null `layoutSplit` skips the write |
| From `cropT = 1`, the window and the plate frame are the same rect, including after the mobile shift | A2 `matchPlateFrame` inside `applyFrame` and after `collapseToContent` |
| Callouts keep their detents and are not clipped by the window | A2 still writes `boxesOpacity`, `leadersOpacity`, `notesOpacity`; markup puts `.mark-list` in `.detail-stage` |
| Detail joint still fades `.split-frame` over `DETAIL_CROSSFADE_MS` | A2 does not set `frame.style.opacity`; `armFade` stays |
| `is-plate` hides the outer and shows the plate, and does not fade the window or the notes | A2 CSS; plate-hold test |
| Reduced motion paints the end state once and clears the scrub rect first | A2 `clearScrubStyles` then `applyFrame(frame, 1)` |
| No-JS shows no outer upright and does not restyle the 72% plate | Task 0 hide; A2 does not reveal `.upright-outer` from CSS |
| Legacy `.record-split` and the `.detail-figure` upright stay | Hooks and markup edits are the `.split-stage` map only |
| `records.json`, φ `1.618fr` / `1fr`, desktop `100svh` stay | No task edits them; A2 source test and Integration check them |
| Live `/records/mhjl329/`: center stays opaque, outer goes to paper | Integration |
