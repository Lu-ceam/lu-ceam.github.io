# Imagery split-stage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On reveal records, replace autoplay `runTimeline` with a desktop split stage: a sticky imagery column on the right driven by a scrolling 说明栏 on the left, one continuous scroll for every reveal detail.

**Architecture:** Records with at least one `detailMode === 'reveal'` detail leave `.record-split` and render `.record-page--split`. The reading column holds 题铭, then one itinerary section per reveal detail (caption heading + four stage rows + the existing `visibleDetailText`), then 记述 / 著录 / folds. The right column is one sticky 100svh panel with a stacked frame per detail. Scroll between the four row labels maps to upright → crop → plate → boxes → notes. Idle eases the window until the nearest row label sits on the activation line. Crossing the next detail’s heading crossfades the sticky frame in 1.6s and that detail’s rows run the same pipeline from upright. Legacy records keep today’s left-image / right-text split. Crop geometry is the `contain` / `cropped` math already in `runTimeline` on `main`. Do not port the fullscreen runway from PR #26.

**Tech Stack:** Astro static pages, vanilla TypeScript in the page `<script>`, CSS sticky + custom properties, pure helpers in `src/data/split-stage.ts` tested with `node:test`. No scroll libraries. Web Animations are not used for this pipeline; opacity is inline style, and the detail change is a CSS opacity transition whose duration comes from `DETAIL_CROSSFADE_MS`.

**Spec:** [`docs/superpowers/specs/2026-10-24-records-imagery-split-stage-design.md`](../specs/2026-10-24-records-imagery-split-stage-design.md)  
**Supersedes:** [`docs/superpowers/specs/2026-10-24-records-imagery-scroll-scrub-design.md`](../specs/2026-10-24-records-imagery-scroll-scrub-design.md) and open impl [PR #26](https://github.com/Lu-ceam/lu-ceam.github.io/pull/26) (`cursor/records-scroll-scrub-5fbb`). Do not merge, rebase, or continue that branch.  
**Still in force:** [`docs/superpowers/specs/2026-10-24-records-imagery-reveal-manual-design.md`](../specs/2026-10-24-records-imagery-reveal-manual-design.md) for upright / plate / marks, burgundy boxes, and when leaders exist.

**Branch:** cut the implementation branch from current `main`. Do not branch from `cursor/records-scroll-scrub-5fbb`. Do not create `src/data/scrub.ts`. Do not add `.reveal-runway`, `SCRUB_KEYS`, or `clamp(250vh, 2.75 * 100vh, 300vh)`.

## Global Constraints

- No GSAP, Lenis, ScrollTrigger, or any other scroll library.
- Do not edit `src/data/records.json`, `src/data/records.ts` schema, list pages, `src/pages/records.astro`, tombstone markup, loupe, or list crop.
- Do not change Vinyl YAML or `export_site_marks.py` (that script is not in this repo). Do not change the shape of `details[]` (`upright`, `plate`, `transform`, `marks`, `cropSpace`, `angleDeg`).
- Playback ignores `angleDeg`. The upright file is already deskewed. Do not rotate.
- Do not rewrite 记述. `storyParagraphs(record.story)` stays as it is.
- Do not invent `marks.note`, `marks.label`, or per-box sentences. `records.json` on `main` has no `note` fields. MHJL 329 therefore draws burgundy boxes and badges only. Leaders and outside notes render only when `notesAligned(detail)` is already true.
- `details[].text` stays in the reading column via `visibleDetailText(detail)`. Do not split ① lines onto boxes.
- Itinerary copy is only these four rows: 原片扶正 / 全幅, 裁进板心 / 板心, 标出要点 / 框选, 读注 / 旁注. Section headings are the existing `detail.caption` strings (`A 面标签 · ①–⑥`, `腰封 · ①–⑥` on MHJL 329).
- Palette and type stay the current warm paper + burgundy + CJK stack: `var(--bg)`, `var(--text)`, `var(--muted)`, `var(--accent)`, `var(--line)`, and the body `font-family` already on `html` / `body`. Do not add olive, Imbue, a new font, or a new color token.
- Soft-settle targets are the four stage-row labels. Do not snap to `{0, 0.55, 0.75, 1}`.
- `prefers-reduced-motion: reduce` / `data-motion !== 'ok'`: no scrub, no 1.6s fade, no tall rows. Sticky column shows the final plate + boxes (+ notes if `notesAligned`). Reading column is normal flow.
- Soft-settle only after scroll idle, and only while the activation line is within the active detail’s row span. Never fight `pointerdown`.
- Primary acceptance URL: `/records/mhjl329/` (parts `label`, then `cover`). Legacy check: `/records/ml4001/`.
- Implement from `main`. Task 6 closes PR #26 without merging it.

## File map

| Path | Responsibility |
|------|----------------|
| `src/data/split-stage.ts` | Pure row copy, crop boxes, `stageVisual`, anchor progress, settle math. No DOM, no JSON. |
| `src/data/split-stage.test.ts` | `node:test` for those helpers |
| `src/pages/records/[id].astro` | `hasReveal` branch: split shell vs existing `.record-split`. Page script maps itinerary scroll to frames and deletes autoplay. |
| `src/styles/global.css` | `.record-page--split` desktop 50/50, narrow 58svh, reduced-motion. Scoped so `.record-split` rules stay put. |
| `docs/superpowers/plans/2026-10-24-records-imagery-split-stage.md` | This plan |

Do **not** touch `src/pages/records.astro`, `src/data/records.ts`, `src/data/records.json`, or `public/records/**`.

---

### Task 1: Pure split-stage helpers

**Files:**
- Create: `src/data/split-stage.ts`
- Create: `src/data/split-stage.test.ts`

**Interfaces:**
- Consumes: nothing from later tasks. Crop formulas match `runTimeline` in `src/pages/records/[id].astro` (`containScale`, `cropScale = viewW / crop.w`, linear blend). `viewH` is used only for the contain box.
- Produces:

```ts
export const STAGE_ROWS: readonly [
  { readonly id: 'upright'; readonly label: '原片扶正'; readonly status: '全幅' },
  { readonly id: 'crop'; readonly label: '裁进板心'; readonly status: '板心' },
  { readonly id: 'boxes'; readonly label: '标出要点'; readonly status: '框选' },
  { readonly id: 'notes'; readonly label: '读注'; readonly status: '旁注' },
];

export const CROP_BLEND_AT = 0.9;
export const DETAIL_CROSSFADE_MS = 1600;
export const SETTLE_IDLE_MS = 180;
export const SETTLE_EPSILON_PX = 6;
export const SETTLE_SLACK_PX = 24;
export const SETTLE_LOCK_MS = 800;

export type Box = { left: number; top: number; width: number; height: number };

export type StageVisual = {
  cropT: number;
  uprightOpacity: number;
  plateOpacity: number;
  boxesOpacity: number;
  notesOpacity: number;
};

export function containBox(viewW: number, viewH: number, naturalW: number, naturalH: number): Box;
export function croppedBox(
  viewW: number,
  naturalW: number,
  naturalH: number,
  crop: { x: number; y: number; w: number; h: number },
): Box;
export function lerpBox(from: Box, to: Box, t: number): Box;
export function stageVisual(p: number, notesOn: boolean): StageVisual;
export function progressFromAnchors(anchors: readonly number[], activationY: number): number;
export function nearestRowIndex(anchors: readonly number[], activationY: number): number;
export function activeDetailIndex(headingTops: readonly number[], activationY: number): number;
export function activationLineY(viewportHeight: number, desktop: boolean): number;
export function scrollTopForAnchor(currentScrollY: number, anchorViewportY: number, lineY: number): number;
export function shouldSettle(
  anchors: readonly number[],
  lastRowBottom: number,
  activationY: number,
  slackPx: number,
): boolean;
```

`notesOn` is the boolean `notesAligned(detail)` already computed by the page. This module does not import `detail-display.ts`.

Settle visuals when that row’s label sits on the activation line (`p` is `index / 3`):

| Row on the line | `p` | Sticky column |
|---|---|---|
| 原片扶正 | `0` | Full upright, contain box |
| 裁进板心 | `1/3` | Crop finished, plate on, boxes off |
| 标出要点 | `2/3` | Plate, boxes + badges on, notes off |
| 读注 | `1` | Plate + boxes, and leaders/notes only when `notesOn` |

Travel is continuous and reversible because it is a pure function of `p`:

- `0 → 1/3`: `cropT` goes `0 → 1` over the first `CROP_BLEND_AT` of the gap (the 760ms crop in `runTimeline`), then upright opacity falls and plate opacity rises over the last `0.1` (the 80ms blend). `CROP_BLEND_AT` is `760 / (760 + 80)` rounded to `0.9`. It is not a settle stop.
- `1/3 → 2/3`: `boxesOpacity` goes `0 → 1`.
- `2/3 → 1`: `notesOpacity` goes `0 → 1` when `notesOn`, otherwise stays `0`.

- [ ] **Step 1: Write the failing test**

Create `src/data/split-stage.test.ts`:

```ts
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
	CROP_BLEND_AT,
	DETAIL_CROSSFADE_MS,
	SETTLE_EPSILON_PX,
	SETTLE_IDLE_MS,
	SETTLE_LOCK_MS,
	SETTLE_SLACK_PX,
	STAGE_ROWS,
	activationLineY,
	activeDetailIndex,
	containBox,
	croppedBox,
	lerpBox,
	nearestRowIndex,
	progressFromAnchors,
	scrollTopForAnchor,
	shouldSettle,
	stageVisual,
} from './split-stage.ts';

function near(actual: number, expected: number): void {
	assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} ~= ${expected}`);
}

describe('stage rows', () => {
	it('uses the four public labels and no runway keyframes', () => {
		assert.deepEqual(
			STAGE_ROWS.map((row) => [row.id, row.label, row.status]),
			[
				['upright', '原片扶正', '全幅'],
				['crop', '裁进板心', '板心'],
				['boxes', '标出要点', '框选'],
				['notes', '读注', '旁注'],
			],
		);
		assert.equal(CROP_BLEND_AT, 0.9);
		assert.equal(DETAIL_CROSSFADE_MS, 1600);
		assert.equal(SETTLE_IDLE_MS, 180);
		assert.equal(SETTLE_EPSILON_PX, 6);
		assert.equal(SETTLE_SLACK_PX, 24);
		assert.equal(SETTLE_LOCK_MS, 800);
		assert.notDeepEqual([0, 1 / 3, 2 / 3, 1], [0, 0.55, 0.75, 1]);
	});
});

describe('crop boxes', () => {
	it('matches runTimeline contain and crop for a simple view', () => {
		const contain = containBox(200, 100, 100, 100);
		assert.deepEqual(contain, { left: 50, top: 0, width: 100, height: 100 });
		const cropped = croppedBox(200, 100, 100, { x: 10, y: 20, w: 50, h: 40 });
		assert.deepEqual(cropped, { left: -40, top: -80, width: 400, height: 400 });
		assert.deepEqual(lerpBox(contain, cropped, 0), contain);
		assert.deepEqual(lerpBox(contain, cropped, 1), cropped);
		assert.deepEqual(lerpBox(contain, cropped, -1), contain);
		assert.deepEqual(lerpBox(contain, cropped, 2), cropped);
		const mid = lerpBox(contain, cropped, 0.5);
		assert.deepEqual(mid, { left: 5, top: -40, width: 250, height: 250 });
	});

	it('matches the mhjl329 label crop without fitting the crop to viewH', () => {
		const contain = containBox(400, 400, 1050, 1400);
		assert.deepEqual(contain, { left: 50, top: 0, width: 300, height: 400 });
		const cropped = croppedBox(400, 1050, 1400, { x: 274, y: 403, w: 514, h: 514 });
		near(cropped.left, -213.2295719844358);
		near(cropped.top, -313.61867704280155);
		near(cropped.width, 817.1206225680934);
		near(cropped.height, 1089.4941634241245);
		assert.ok(cropped.height > 400);
	});
});

describe('stageVisual', () => {
	it('holds upright on the first row and the finished plate on the second', () => {
		const upright = stageVisual(0, false);
		assert.equal(upright.cropT, 0);
		assert.equal(upright.uprightOpacity, 1);
		assert.equal(upright.plateOpacity, 0);
		assert.equal(upright.boxesOpacity, 0);
		assert.equal(upright.notesOpacity, 0);

		const midCrop = stageVisual(0.15, false);
		near(midCrop.cropT, 0.5);
		assert.equal(midCrop.uprightOpacity, 1);
		assert.equal(midCrop.plateOpacity, 0);

		const blending = stageVisual(0.95 / 3, false);
		assert.equal(blending.cropT, 1);
		near(blending.plateOpacity, 0.5);
		near(blending.uprightOpacity, 0.5);
		assert.equal(blending.boxesOpacity, 0);

		const plate = stageVisual(1 / 3, false);
		assert.equal(plate.cropT, 1);
		assert.equal(plate.uprightOpacity, 0);
		assert.equal(plate.plateOpacity, 1);
		assert.equal(plate.boxesOpacity, 0);
		assert.equal(plate.notesOpacity, 0);
	});

	it('fades boxes between row 2 and row 3, and notes only when notesOn', () => {
		const boxesOn = stageVisual(2 / 3, true);
		assert.equal(boxesOn.boxesOpacity, 1);
		assert.equal(boxesOn.notesOpacity, 0);
		assert.equal(boxesOn.plateOpacity, 1);

		const notesMid = stageVisual(5 / 6, true);
		near(notesMid.notesOpacity, 0.5);
		assert.equal(notesMid.boxesOpacity, 1);

		const done = stageVisual(1, true);
		assert.equal(done.notesOpacity, 1);
		assert.equal(done.boxesOpacity, 1);

		const noNotes = stageVisual(1, false);
		assert.equal(noNotes.plateOpacity, 1);
		assert.equal(noNotes.boxesOpacity, 1);
		assert.equal(noNotes.notesOpacity, 0);
		assert.equal(noNotes.uprightOpacity, 0);
	});

	it('does not treat 0.55 or 0.75 as dwell points', () => {
		const legacyCropEnd = stageVisual(0.55, false);
		assert.ok(legacyCropEnd.boxesOpacity > 0 && legacyCropEnd.boxesOpacity < 1);
		const legacyBoxes = stageVisual(0.75, true);
		assert.ok(legacyBoxes.notesOpacity > 0 && legacyBoxes.notesOpacity < 1);
	});

	it('clamps progress outside 0..1', () => {
		assert.equal(stageVisual(-0.2, false).uprightOpacity, 1);
		assert.equal(stageVisual(2, false).notesOpacity, 0);
		assert.equal(stageVisual(2, true).notesOpacity, 1);
	});
});

describe('scroll geometry', () => {
	const anchors = [100, 200, 300, 400];

	it('maps the activation line through row anchors', () => {
		assert.equal(progressFromAnchors(anchors, 100), 0);
		near(progressFromAnchors(anchors, 200), 1 / 3);
		near(progressFromAnchors(anchors, 300), 2 / 3);
		assert.equal(progressFromAnchors(anchors, 400), 1);
		assert.equal(progressFromAnchors(anchors, 40), 0);
		assert.equal(progressFromAnchors(anchors, 900), 1);
		assert.equal(progressFromAnchors([], 10), 1);
		assert.equal(progressFromAnchors([80], 80), 1);
		assert.equal(progressFromAnchors([80], 10), 0);
	});

	it('picks the nearer row and keeps the earlier row on a tie', () => {
		assert.equal(nearestRowIndex(anchors, 200), 1);
		assert.equal(nearestRowIndex(anchors, 140), 0);
		assert.equal(nearestRowIndex(anchors, 150), 0);
		assert.equal(nearestRowIndex([], 0), 0);
	});

	it('activates the last heading that has reached the line', () => {
		assert.equal(activeDetailIndex([100, 500, 900], 50), 0);
		assert.equal(activeDetailIndex([100, 500, 900], 100), 0);
		assert.equal(activeDetailIndex([100, 500, 900], 499), 0);
		assert.equal(activeDetailIndex([100, 500, 900], 500), 1);
		assert.equal(activeDetailIndex([100, 500, 900], 1200), 2);
		assert.equal(activeDetailIndex([], 10), 0);
	});

	it('places the reading line in the paper column', () => {
		assert.equal(activationLineY(1000, true), 420);
		assert.equal(activationLineY(1000, false), 720);
	});

	it('scrolls so the chosen anchor meets the line', () => {
		assert.equal(scrollTopForAnchor(1000, 500, 400), 1100);
		assert.equal(scrollTopForAnchor(1000, 300, 400), 900);
	});

	it('settles only from the first label through the bottom of the last row', () => {
		const lastRowBottom = 520;
		assert.equal(shouldSettle(anchors, lastRowBottom, 250, 24), true);
		assert.equal(shouldSettle(anchors, lastRowBottom, 100, 24), true);
		assert.equal(shouldSettle(anchors, lastRowBottom, 500, 24), true);
		assert.equal(shouldSettle(anchors, lastRowBottom, 76, 24), true);
		assert.equal(shouldSettle(anchors, lastRowBottom, 70, 24), false);
		assert.equal(shouldSettle(anchors, lastRowBottom, 544, 24), true);
		assert.equal(shouldSettle(anchors, lastRowBottom, 550, 24), false);
		assert.equal(shouldSettle([], lastRowBottom, 0, 24), false);
	});
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --experimental-strip-types --test src/data/split-stage.test.ts`  
Expected: FAIL. Node cannot find `./split-stage.ts` (`ERR_MODULE_NOT_FOUND`).

- [ ] **Step 3: Write the implementation**

Create `src/data/split-stage.ts`:

```ts
export const STAGE_ROWS = [
	{ id: 'upright', label: '原片扶正', status: '全幅' },
	{ id: 'crop', label: '裁进板心', status: '板心' },
	{ id: 'boxes', label: '标出要点', status: '框选' },
	{ id: 'notes', label: '读注', status: '旁注' },
] as const;

/** 760 / (760 + 80) from runTimeline. Blend inside the first travel gap, not a settle stop. */
export const CROP_BLEND_AT = 0.9;

export const DETAIL_CROSSFADE_MS = 1600;
export const SETTLE_IDLE_MS = 180;
export const SETTLE_EPSILON_PX = 6;
export const SETTLE_SLACK_PX = 24;
export const SETTLE_LOCK_MS = 800;

export type Box = { left: number; top: number; width: number; height: number };

export type StageVisual = {
	cropT: number;
	uprightOpacity: number;
	plateOpacity: number;
	boxesOpacity: number;
	notesOpacity: number;
};

export function containBox(viewW: number, viewH: number, naturalW: number, naturalH: number): Box {
	const containScale = Math.min(viewW / naturalW, viewH / naturalH);
	return {
		left: (viewW - naturalW * containScale) / 2,
		top: (viewH - naturalH * containScale) / 2,
		width: naturalW * containScale,
		height: naturalH * containScale,
	};
}

export function croppedBox(
	viewW: number,
	naturalW: number,
	naturalH: number,
	crop: { x: number; y: number; w: number; h: number },
): Box {
	const cropScale = viewW / crop.w;
	return {
		left: -crop.x * cropScale,
		top: -crop.y * cropScale,
		width: naturalW * cropScale,
		height: naturalH * cropScale,
	};
}

export function lerpBox(from: Box, to: Box, t: number): Box {
	const u = Math.min(1, Math.max(0, t));
	return {
		left: from.left + (to.left - from.left) * u,
		top: from.top + (to.top - from.top) * u,
		width: from.width + (to.width - from.width) * u,
		height: from.height + (to.height - from.height) * u,
	};
}

export function stageVisual(p: number, notesOn: boolean): StageVisual {
	const clamped = Math.min(1, Math.max(0, p));
	if (clamped >= 1) {
		return {
			cropT: 1,
			uprightOpacity: 0,
			plateOpacity: 1,
			boxesOpacity: 1,
			notesOpacity: notesOn ? 1 : 0,
		};
	}
	const scaled = clamped * 3;
	const interval = Math.min(2, Math.floor(scaled));
	const local = scaled - interval;
	if (interval === 0) {
		if (local < CROP_BLEND_AT) {
			return {
				cropT: local / CROP_BLEND_AT,
				uprightOpacity: 1,
				plateOpacity: 0,
				boxesOpacity: 0,
				notesOpacity: 0,
			};
		}
		const fade = (local - CROP_BLEND_AT) / (1 - CROP_BLEND_AT);
		return {
			cropT: 1,
			uprightOpacity: 1 - fade,
			plateOpacity: fade,
			boxesOpacity: 0,
			notesOpacity: 0,
		};
	}
	if (interval === 1) {
		return {
			cropT: 1,
			uprightOpacity: 0,
			plateOpacity: 1,
			boxesOpacity: local,
			notesOpacity: 0,
		};
	}
	return {
		cropT: 1,
		uprightOpacity: 0,
		plateOpacity: 1,
		boxesOpacity: 1,
		notesOpacity: notesOn ? local : 0,
	};
}

/** `anchors` are viewport Y of row labels, top to bottom (increasing Y). */
export function progressFromAnchors(anchors: readonly number[], activationY: number): number {
	if (anchors.length === 0) return 1;
	const first = anchors[0];
	const last = anchors[anchors.length - 1];
	if (first === undefined || last === undefined) return 1;
	if (anchors.length === 1 || first === last) return activationY >= first ? 1 : 0;
	const t = (activationY - first) / (last - first);
	return Math.min(1, Math.max(0, t));
}

/** Strict `<` so an equal distance keeps the earlier row. */
export function nearestRowIndex(anchors: readonly number[], activationY: number): number {
	let best = 0;
	let bestDist = Number.POSITIVE_INFINITY;
	for (let i = 0; i < anchors.length; i++) {
		const y = anchors[i];
		if (y === undefined) continue;
		const dist = Math.abs(y - activationY);
		if (dist < bestDist) {
			bestDist = dist;
			best = i;
		}
	}
	return best;
}

/** Last heading whose top has reached the line. Empty input stays on 0. */
export function activeDetailIndex(headingTops: readonly number[], activationY: number): number {
	let index = 0;
	for (let i = 0; i < headingTops.length; i++) {
		const top = headingTops[i];
		if (top !== undefined && top <= activationY) index = i;
	}
	return index;
}

/**
 * Desktop line sits in the left column (0.42 of the viewport).
 * Narrow line sits in the paper band under the 58svh image (0.72).
 */
export function activationLineY(viewportHeight: number, desktop: boolean): number {
	return viewportHeight * (desktop ? 0.42 : 0.72);
}

export function scrollTopForAnchor(
	currentScrollY: number,
	anchorViewportY: number,
	lineY: number,
): number {
	return currentScrollY + (anchorViewportY - lineY);
}

/** True while the line is inside the itinerary rows, including the tall body of the last row. */
export function shouldSettle(
	anchors: readonly number[],
	lastRowBottom: number,
	activationY: number,
	slackPx: number,
): boolean {
	if (anchors.length === 0) return false;
	const first = anchors[0];
	if (first === undefined) return false;
	return activationY >= first - slackPx && activationY <= lastRowBottom + slackPx;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --experimental-strip-types --test src/data/split-stage.test.ts`  
Expected: `# fail 0` and exit code 0.

- [ ] **Step 5: Typecheck**

Run: `npm run check`  
Expected: PASS. If `astro check` rejects the `./split-stage.ts` import in the test file only, add `src/data/split-stage.test.ts` to the `exclude` array in `tsconfig.json` and leave the test import as `./split-stage.ts`. Do not exclude `src/data/split-stage.ts`. Then rerun `npm run check` and expect PASS.

- [ ] **Step 6: Commit**

```bash
git add src/data/split-stage.ts src/data/split-stage.test.ts tsconfig.json
git commit -m "test(records): add split-stage progress and crop helpers"
```

`tsconfig.json` is only in the commit if Step 5 edited it.

---

### Task 2: Split-stage markup, legacy path untouched

**Files:**
- Modify: `src/pages/records/[id].astro` (frontmatter and the `<article>` body; leave the `<script>` for Task 4)

**Interfaces:**
- Consumes: `detailMode`, `notesAligned`, `visibleDetailText`, `showDetailsNote`, `paintSide`, `badgeCenter`, `showMarkLabel` from `src/data/detail-display.ts` (already imported). `STAGE_ROWS` from Task 1. `VinylRecord` fields already on the page: `work`, `artist`, `label`, `catalogNumber`, `year`, `decade`, `status`, `story`, `details`, `detailsNote`, `links`, `evidence`, `needLead`, `need`, and the existing `showMatrix` / `showPressing` / `badgeClass` / `storyParagraphs` helpers.
- Produces: when `hasReveal` is true, `<article class="record-page record-page--split">` containing `.split-stage` > `.split-imagery` + `.split-read`. Each reveal detail produces one `.itinerary-section[data-part]` and one `.split-frame[data-part]`. The first frame has `is-active` and is not `inert`. Frames expose `data-plate-width`, `data-plate-height`, `data-notes` (`aligned` or `open`), and inline `--plate-w` / `--plate-h`. Upright images keep `data-crop-x`, `data-crop-y`, `data-crop-w`, `data-crop-h`. When `hasReveal` is false, the current `.record-split` tree is unchanged.

- [ ] **Step 1: Add the branch flag and the row import**

In the frontmatter, extend the existing `detail-display` import with nothing new (those names are already imported). Add:

```ts
import { STAGE_ROWS } from '../../data/split-stage';
```

After `const when = record.year ?? record.decade;`:

```ts
const revealDetails = record.details.filter((d) => detailMode(d) === 'reveal');
const nonRevealDetails = record.details.filter((d) => detailMode(d) !== 'reveal');
const hasReveal = revealDetails.length > 0;
```

- [ ] **Step 2: Mark the article**

Replace the opening article tag with:

```astro
<article
  class:list={['record-page', hasReveal && 'record-page--split']}
  data-record-id={record.id}
>
```

Keep the back link that follows it (`<p class="record-back">`) outside both layouts.

- [ ] **Step 3: Keep the legacy tree behind `!hasReveal`**

Wrap the current `<div class="record-split">` … `</div>` (the block that contains `.record-object` and `.record-text`) in `{!hasReveal && ( … )}`. Do not edit anything inside that tree: `.entry-hero`, the detail grid, the tombstone, `.record-story`, `dl.props`, and the three folds stay byte-for-byte.

- [ ] **Step 4: Add the split shell**

Immediately after that wrapped legacy tree, still inside `<article>`, add the reveal layout. DOM order inside `.split-stage` is `.split-imagery` then `.split-read`. Desktop CSS places `.split-read` in column 1 and `.split-imagery` in column 2, so the photograph is on the right. Narrow CSS leaves that DOM order, so the photograph is on top. Reading order inside `.split-read` is 题铭, the existing `detailsNote` line when `showDetailsNote(record)`, one section per reveal detail, any non-reveal figures, then 记述 / 著录 / folds inside a `.record-text` wrapper. The sample below is that tree. The legacy `.record-split` stays intact.

```astro
{
  hasReveal && (
    <div class="split-stage">
      <div class="split-imagery">
        {revealDetails.map((detail, index) => {
          const aligned = notesAligned(detail);
          const sides = new Set(detail.marks.map((mark) => paintSide(mark.side)));
          return (
            <div
              class:list={['split-frame', index === 0 && 'is-active']}
              data-part={detail.part}
              data-plate-width={detail.plate.width}
              data-plate-height={detail.plate.height}
              data-notes={aligned ? 'aligned' : 'open'}
              inert={index !== 0}
              style={`--plate-w: ${detail.plate.width}; --plate-h: ${detail.plate.height};`}
            >
              <div class="detail-stage">
                {aligned && sides.has('left') && <div class="mark-slot mark-slot-left" />}
                <div class="plate-frame">
                  <img
                    class="plate"
                    src={detail.plate.src}
                    width={detail.plate.width}
                    height={detail.plate.height}
                    alt={detail.alt}
                    decoding="async"
                    fetchpriority={index === 0 ? 'high' : 'auto'}
                    loading={index === 0 ? 'eager' : 'lazy'}
                  />
                  {detail.upright && detail.transform && (
                    <div class="upright-clip">
                      <img
                        class="upright"
                        src={detail.upright.src}
                        width={detail.upright.width}
                        height={detail.upright.height}
                        alt=""
                        aria-hidden="true"
                        decoding="async"
                        loading={index === 0 ? 'eager' : 'lazy'}
                        data-crop-x={detail.transform.crop.x}
                        data-crop-y={detail.transform.crop.y}
                        data-crop-w={detail.transform.crop.w}
                        data-crop-h={detail.transform.crop.h}
                      />
                    </div>
                  )}
                  {detail.marks.length > 0 && (
                    <svg
                      class="plate-overlay"
                      viewBox={`0 0 ${detail.plate.width} ${detail.plate.height}`}
                      overflow="visible"
                      aria-hidden="true"
                    >
                      <g class="mark-graphics">
                        {detail.marks.map((mark, markIndex) => {
                          const badge = badgeCenter(mark, detail.plate.width);
                          return (
                            <g class="mark-callout" data-mark-id={mark.id}>
                              <rect
                                class="mark-box"
                                x={mark.x}
                                y={mark.y}
                                width={mark.w}
                                height={mark.h}
                                stroke-width="2"
                              />
                              <circle
                                class="mark-disc"
                                cx={badge.cx}
                                cy={badge.cy}
                                r={badge.r}
                                stroke-width="2"
                              />
                              <text
                                class="mark-num"
                                x={badge.cx}
                                y={badge.cy}
                                font-size={badge.fontSize}
                              >
                                {markIndex + 1}
                              </text>
                            </g>
                          );
                        })}
                      </g>
                      {aligned && (
                        <g class="mark-leaders">
                          {detail.marks.map((mark) => {
                            const side = paintSide(mark.side);
                            const x1 = side === 'left' ? mark.x : mark.x + mark.w;
                            const y1 = mark.y + mark.h / 2;
                            const x2 = side === 'left' ? 0 : detail.plate.width;
                            return (
                              <line
                                class="mark-leader"
                                data-mark-id={mark.id}
                                x1={x1}
                                y1={y1}
                                x2={x2}
                                y2={y1}
                                stroke-width="1"
                              />
                            );
                          })}
                        </g>
                      )}
                    </svg>
                  )}
                  {aligned && (
                    <ol class="mark-list" aria-label="题铭">
                      {detail.marks.map((mark, markIndex) => (
                        <li
                          id={`${record.id}-${detail.part}-mark-${mark.id}`}
                          data-mark-id={mark.id}
                          data-index={markIndex}
                          data-side={paintSide(mark.side)}
                          data-side-pref={mark.side}
                          data-x={mark.x}
                          data-y={mark.y}
                          data-w={mark.w}
                          data-h={mark.h}
                        >
                          <span class="mark-index">{markIndex + 1}</span>
                          {showMarkLabel(mark) && <p class="mark-label">{mark.label}</p>}
                          <p class="mark-note">{mark.note}</p>
                        </li>
                      ))}
                    </ol>
                  )}
                </div>
                {aligned && sides.has('right') && <div class="mark-slot mark-slot-right" />}
              </div>
            </div>
          );
        })}
      </div>
      <div class="split-read">
        <header class="record-tombstone">
          <h1>{record.work}</h1>
          <p class="record-tombstone-meta">
            <span>{record.artist}</span>
            <span aria-hidden="true"> · </span>
            <span>{record.label}</span>
            <span aria-hidden="true"> · </span>
            <span>{record.catalogNumber}</span>
            <span aria-hidden="true"> · </span>
            <span>{when}</span>
            <span class={badgeClass(record.status)}>{record.status}</span>
          </p>
        </header>
        {showDetailsNote(record) && <p class="meta">{record.detailsNote}</p>}
        {revealDetails.map((detail) => {
          const remainder = visibleDetailText(detail);
          return (
            <section class="itinerary-section" data-part={detail.part}>
              <h2 id={`${record.id}-${detail.part}-heading`} class="itinerary-heading">
                {detail.caption}
              </h2>
              <ol class="itinerary-rows">
                {STAGE_ROWS.map((row) => (
                  <li class="itinerary-row" data-stage={row.id}>
                    <span class="itinerary-label">{row.label}</span>
                    <span class="itinerary-dots" aria-hidden="true"></span>
                    <span class="itinerary-status">{row.status}</span>
                  </li>
                ))}
              </ol>
              {remainder && <p class="detail-text">{remainder}</p>}
            </section>
          );
        })}
        {nonRevealDetails.length > 0 && (
          <div class="detail-grid">
            {nonRevealDetails.map((detail) => {
              const mode = detailMode(detail);
              const aligned = notesAligned(detail);
              const remainder = visibleDetailText(detail);
              const sides = new Set(detail.marks.map((mark) => paintSide(mark.side)));
              return (
                <figure
                  class:list={[
                    'detail-figure',
                    mode === 'reveal' && 'is-reveal',
                    mode !== 'legacy' && 'has-stage',
                  ]}
                  data-part={detail.part}
                  data-mode={mode}
                  data-plate-width={detail.plate.width}
                  data-plate-height={detail.plate.height}
                  data-notes={aligned ? 'aligned' : 'open'}
                >
                  {mode === 'legacy' ? (
                    <img
                      src={detail.plate.src}
                      width={detail.plate.width}
                      height={detail.plate.height}
                      alt={detail.alt}
                      decoding="async"
                      loading="lazy"
                    />
                  ) : (
                    <div class="detail-stage">
                      {aligned && sides.has('left') && <div class="mark-slot mark-slot-left" />}
                      <div class="plate-frame">
                        <img
                          class="plate"
                          src={detail.plate.src}
                          width={detail.plate.width}
                          height={detail.plate.height}
                          alt={detail.alt}
                          decoding="async"
                          loading="lazy"
                        />
                        {mode === 'reveal' && detail.upright && detail.transform && (
                          <div class="upright-clip">
                            <img
                              class="upright"
                              src={detail.upright.src}
                              width={detail.upright.width}
                              height={detail.upright.height}
                              alt=""
                              aria-hidden="true"
                              decoding="async"
                              loading="lazy"
                              data-crop-x={detail.transform.crop.x}
                              data-crop-y={detail.transform.crop.y}
                              data-crop-w={detail.transform.crop.w}
                              data-crop-h={detail.transform.crop.h}
                            />
                          </div>
                        )}
                        {detail.marks.length > 0 && (
                          <svg
                            class="plate-overlay"
                            viewBox={`0 0 ${detail.plate.width} ${detail.plate.height}`}
                            overflow="visible"
                            aria-hidden="true"
                          >
                            <g class="mark-graphics">
                              {detail.marks.map((mark, index) => {
                                const badge = badgeCenter(mark, detail.plate.width);
                                return (
                                  <g class="mark-callout" data-mark-id={mark.id}>
                                    <rect
                                      class="mark-box"
                                      x={mark.x}
                                      y={mark.y}
                                      width={mark.w}
                                      height={mark.h}
                                      stroke-width="2"
                                    />
                                    <circle
                                      class="mark-disc"
                                      cx={badge.cx}
                                      cy={badge.cy}
                                      r={badge.r}
                                      stroke-width="2"
                                    />
                                    <text
                                      class="mark-num"
                                      x={badge.cx}
                                      y={badge.cy}
                                      font-size={badge.fontSize}
                                    >
                                      {index + 1}
                                    </text>
                                  </g>
                                );
                              })}
                            </g>
                            {aligned && (
                              <g class="mark-leaders">
                                {detail.marks.map((mark) => {
                                  const side = paintSide(mark.side);
                                  const x1 = side === 'left' ? mark.x : mark.x + mark.w;
                                  const y1 = mark.y + mark.h / 2;
                                  const x2 = side === 'left' ? 0 : detail.plate.width;
                                  return (
                                    <line
                                      class="mark-leader"
                                      data-mark-id={mark.id}
                                      x1={x1}
                                      y1={y1}
                                      x2={x2}
                                      y2={y1}
                                      stroke-width="1"
                                    />
                                  );
                                })}
                              </g>
                            )}
                          </svg>
                        )}
                        {aligned && (
                          <ol class="mark-list" aria-label="题铭">
                            {detail.marks.map((mark, index) => (
                              <li
                                id={`${record.id}-${detail.part}-mark-${mark.id}`}
                                data-mark-id={mark.id}
                                data-index={index}
                                data-side={paintSide(mark.side)}
                                data-side-pref={mark.side}
                                data-x={mark.x}
                                data-y={mark.y}
                                data-w={mark.w}
                                data-h={mark.h}
                              >
                                <span class="mark-index">{index + 1}</span>
                                {showMarkLabel(mark) && <p class="mark-label">{mark.label}</p>}
                                <p class="mark-note">{mark.note}</p>
                              </li>
                            ))}
                          </ol>
                        )}
                      </div>
                      {aligned && sides.has('right') && <div class="mark-slot mark-slot-right" />}
                    </div>
                  )}
                  <figcaption>{detail.caption}</figcaption>
                  {remainder && <p class="detail-text">{remainder}</p>}
                </figure>
              );
            })}
          </div>
        )}
        <div class="record-text">
          <div class="record-story" lang="zh-Hans">
            {storyParagraphs(record.story).map((paragraph) => (
              <p>
                {paragraph.lead !== null && (
                  <strong class="record-story-lead">{paragraph.lead}</strong>
                )}{paragraph.body}
              </p>
            ))}
          </div>
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
            {showMatrix(record) && record.matrix && (
              <>
                <dt>内圈刻字</dt>
                <dd>{record.matrix}</dd>
              </>
            )}
            {showPressing(record) && record.pressing && (
              <>
                <dt>压片</dt>
                <dd>{record.pressing}</dd>
              </>
            )}
            <dt>录音</dt>
            <dd>{record.recording}</dd>
            <dt>品相</dt>
            <dd>{record.condition}</dd>
            <dt>均衡</dt>
            <dd>{record.eq}</dd>
            <dt>状态</dt>
            <dd>{record.status}</dd>
            {record.year !== undefined && (
              <>
                <dt>年份</dt>
                <dd>{record.year}</dd>
              </>
            )}
          </dl>
          <details class="fold">
            <summary>出处</summary>
            <ul class="link-cards">
              {record.links.map((link) => (
                <li>
                  <a href={link.href} target="_blank" rel="noopener noreferrer">
                    <span class="link-title">{link.title}</span>
                    <span class="link-site">{link.site}</span>
                  </a>
                </li>
              ))}
            </ul>
          </details>
          <details class="fold">
            <summary>证据核对</summary>
            <div class="fold-body">{record.evidence}</div>
          </details>
          <details class="fold">
            <summary>
              待补拍<span class="fold-lead"> · {record.needLead}</span>
            </summary>
            <div class="fold-body">{record.need}</div>
          </details>
        </div>
      </div>
    </div>
  )
}
```

MHJL 329 has no `nonRevealDetails` (`label` and `cover` are both reveal). The grid is still rendered for a later mixed record so a callout or legacy figure is not dropped. The inner `.record-text` keeps the existing `.record-text .fold` selectors working. Do not change 记述 paragraphs, `dt` labels, or fold summaries.

Do not render `.entry-hero`, `record.image`, or `record.photo` inside `.record-page--split`. The sticky panel is the live upright/plate only. No `<figcaption>` inside `.split-imagery`.

Do not put `class="detail-figure"` or `data-mode="reveal"` on `.split-frame`. The existing script keys autoplay off `.detail-figure`.

- [ ] **Step 5: Build check**

Run: `npm run check && npm run build`  
Expected: PASS. Split pages will look unstyled until Task 3. Legacy pages must still build.

Confirm the built MHJL page has the shell and the legacy page does not:

```bash
grep -c 'record-page--split' dist/records/mhjl329/index.html
grep -c 'itinerary-heading' dist/records/mhjl329/index.html
grep -c 'entry-hero' dist/records/mhjl329/index.html
grep -c 'record-page--split' dist/records/ml4001/index.html
grep -c 'record-split' dist/records/ml4001/index.html
```

Expected, in order: `1`, `2`, `0`, `0`, `1`.

- [ ] **Step 6: Commit**

```bash
git add 'src/pages/records/[id].astro'
git commit -m "feat(records): split-stage shell for reveal records"
```

---

### Task 3: Desktop, narrow, and reduced-motion CSS

**Files:**
- Modify: `src/styles/global.css` (append; do not edit `.record-split` / `.record-object`)

**Interfaces:**
- Consumes: `.record-page--split`, `.split-stage`, `.split-read`, `.split-imagery`, `.split-frame`, `.split-frame.is-active`, `.itinerary-section`, `.itinerary-heading`, `.itinerary-rows`, `.itinerary-row`, `.itinerary-label`, `.itinerary-dots`, `.itinerary-status`, `.itinerary-row.is-current` from Task 2. Inner plate classes already exist: `.detail-stage`, `.plate-frame`, `.plate`, `.upright-clip`, `.upright`, `.mark-graphics`, `.mark-leaders`, `.mark-list`.
- Produces: desktop sticky imagery at `100svh` in the right half; reading measure `max-width: 46ch`; narrow imagery `58svh` sticky; row min-heights for scrub; reduced-motion collapses those heights and shows the settled plate. No new color or font tokens.

The breakpoint stays `48rem`, the same query as `.record-split`. `html` is `font-size: 112.5%`, so do not rewrite it as `768px`.

- [ ] **Step 1: Append the split-stage rules**

Append to `src/styles/global.css`:

```css
.record-page--split .split-stage {
	display: block;
}

.record-page--split .split-imagery {
	position: sticky;
	top: 0;
	z-index: 2;
	display: grid;
	grid-template-rows: minmax(0, 1fr);
	grid-template-columns: minmax(0, 1fr);
	height: 58svh;
	background: var(--bg);
	overflow: hidden;
}

.record-page--split .split-read {
	position: relative;
	z-index: 1;
	margin-top: -8svh;
	padding-top: 8svh;
	background: var(--bg);
}

.record-page--split .split-read > .meta {
	margin: 0.4rem 0 0;
	font-size: 0.78rem;
	line-height: 1.4;
}

.record-page--split .itinerary-heading {
	margin: 1.35rem 0 0.35rem;
	font-size: 1.02rem;
	font-weight: 600;
	line-height: 1.35;
	letter-spacing: -0.01em;
}

.record-page--split .itinerary-rows {
	list-style: none;
	margin: 0.2rem 0 0;
	padding: 0;
}

.record-page--split .itinerary-row {
	display: grid;
	grid-template-columns: auto 1fr auto;
	column-gap: 0.55rem;
	align-items: baseline;
	min-height: 34svh;
	margin: 0;
	padding: 0.15rem 0 0;
	color: var(--muted);
	font-size: 0.84rem;
	line-height: 1.4;
}

.record-page--split .itinerary-dots {
	border-bottom: 1px dotted var(--line);
	transform: translateY(-0.28em);
}

.record-page--split .itinerary-row.is-current {
	color: var(--text);
}

.record-page--split .split-frame {
	display: grid;
	grid-area: 1 / 1;
	place-items: center;
	min-width: 0;
	min-height: 0;
	opacity: 0;
}

.record-page--split .split-frame.is-active {
	opacity: 1;
}

.record-page--split .split-frame .detail-stage {
	width: min(100%, calc(58svh * var(--plate-w) / var(--plate-h)));
	max-height: 100%;
}

.record-page--split .split-frame .plate-frame {
	width: 100%;
	border: 0;
	background: transparent;
}

.record-page--split .split-frame .plate {
	width: 100%;
	max-width: 100%;
	height: auto;
}

.record-page--split .split-read .detail-text {
	margin-top: 0.8rem;
}

@media (min-width: 48rem) {
	.record-page--split .split-stage {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
		align-items: start;
		column-gap: 0;
	}

	.record-page--split .split-read {
		grid-column: 1;
		grid-row: 1;
		max-width: 46ch;
		margin-top: 0;
		padding: 0 1.25rem 0 0;
		background: transparent;
	}

	.record-page--split .split-imagery {
		grid-column: 2;
		grid-row: 1;
		height: 100svh;
		align-self: start;
	}

	.record-page--split .itinerary-row {
		min-height: 42svh;
	}

	.record-page--split .split-frame .detail-stage {
		width: min(100%, calc(100svh * var(--plate-w) / var(--plate-h)));
	}
}

@media (max-width: 47.99rem) and (max-height: 32rem) {
	.record-page--split .split-imagery {
		height: 42svh;
	}

	.record-page--split .split-frame .detail-stage {
		width: min(100%, calc(42svh * var(--plate-w) / var(--plate-h)));
	}

	.record-page--split .itinerary-row {
		min-height: 28svh;
	}
}

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

html[data-motion='reduce'] .record-page--split .itinerary-row {
	min-height: 2.6rem;
}

@media (prefers-reduced-motion: reduce) {
	.record-page--split .itinerary-row {
		min-height: 2.6rem;
	}

	.record-page--split .split-frame {
		transition: none;
	}
}
```

`.split-imagery` is a one-cell grid (`minmax(0, 1fr)` by `minmax(0, 1fr)`), and every `.split-frame` occupies `1 / 1`, so the detail frames stack. Narrow imagery is `58svh` (inside the spec’s 55–60svh) and `z-index: 2`, so the plate stays in the top band while the paper (`z-index: 1`, pulled up `8svh`) slides under the photo’s lower edge. Desktop is a 50/50 grid, imagery on the right, `100svh` sticky, reading column capped at `46ch`. The plate frame’s border is removed on the split only; `.plate-frame` elsewhere keeps `1px solid var(--line)`.

Before JS, `data-motion="ok"` shows the upright and hides the plate and marks. `data-motion="reduce"` (and an unset `data-motion`) keeps the existing `.upright-clip { opacity: 0 }` and a visible plate, with `.mark-graphics` at its default opacity, so the settled plate + boxes show with no script. Leaders and `.mark-list` are simply absent from the DOM when `data-notes="open"`.

The `max-height: 32rem` query keeps the pin, but shortens it to `42svh`, so a short phone still shows the plate through the stage rows and still has a text band under it. The pin lets go when `.split-stage` scrolls out.

- [ ] **Step 2: Confirm legacy rules were not edited**

Run:

```bash
git diff -U0 -- src/styles/global.css | grep -E '^[+-].*record-split|^[+-].*record-object' || true
```

Expected: no added or removed lines (the `|| true` keeps the shell from failing when grep finds nothing). The diff for this task should only add `.record-page--split` rules at the end of the file.

- [ ] **Step 3: Commit**

```bash
git add src/styles/global.css
git commit -m "style(records): sticky split-stage columns and quiet itinerary rows"
```

---

### Task 4: Scroll drives the pipeline; remove autoplay

**Files:**
- Modify: `src/pages/records/[id].astro` `<script>`

**Interfaces:**
- Consumes: Task 1 `activationLineY`, `activeDetailIndex`, `containBox`, `croppedBox`, `lerpBox`, `nearestRowIndex`, `progressFromAnchors`, `stageVisual`. Task 2 DOM. Existing `position(figure)` in this script (it already queries `.plate`, `.mark-list`, and `data-plate-width` / `data-plate-height` on its root element, so a `.split-frame` can be passed through).
- Produces: inside the page script, `applyFrame(frame: HTMLElement, p: number): void` and `bindSplit(): void`. `bindSplit` sets `.is-active`, `inert`, and `aria-hidden` on the frame whose section heading has reached the activation line, and, when `data-motion === 'ok'`, writes crop geometry and opacities from `stageVisual`. When motion is not ok, it only swaps the active frame; CSS keeps the settled plate. `runTimeline` / `playReveal` / `drawLeaders` are gone.

- [ ] **Step 1: Delete the autoplay player**

In the `<script>`, delete the `Play` type, the `plays` WeakMap, `playOf`, `drawLeaders`, `runTimeline`, and `playReveal`.

Replace `settle` with this shorter function (no animation bookkeeping):

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
  figure.querySelectorAll<SVGLineElement>('.mark-leader').forEach((line) => {
    line.setAttribute('stroke-dashoffset', '0');
  });
  try {
    position(figure);
  } catch {
    /* the settled plate is already on screen */
  }
}
```

Replace `bind` with:

```ts
function bind(figure: HTMLElement): void {
  position(figure);
  if (figure.dataset.mode !== 'reveal') return;
  settle(figure);
}
```

Leave `position`, `ensureSlots`, `remPx`, `init`, the resize listener, `document.fonts.ready`, and the `prefers-reduced-motion` listener in place. The listener may still call `settle` on `.detail-figure[data-mode=reveal]`; split frames are not those elements. Callout figures still only get `position()`.

- [ ] **Step 2: Import the helpers and apply one frame**

Add to the script’s import (keep the existing `detail-display` import):

```ts
import {
  activationLineY,
  activeDetailIndex,
  containBox,
  croppedBox,
  lerpBox,
  nearestRowIndex,
  progressFromAnchors,
  stageVisual,
} from '../../data/split-stage';
```

Add `applyFrame` and `bindSplit` after `settle`:

```ts
function applyFrame(frame: HTMLElement, p: number): void {
  const upright = frame.querySelector<HTMLImageElement>('.upright');
  const clip = frame.querySelector<HTMLElement>('.upright-clip');
  const plate = frame.querySelector<HTMLImageElement>('.plate');
  const graphics = frame.querySelector<SVGGElement>('.mark-graphics');
  const leaders = frame.querySelector<SVGGElement>('.mark-leaders');
  const notes = frame.querySelector<HTMLOListElement>('.mark-list');
  const notesOn = frame.dataset.notes === 'aligned';
  const visual = stageVisual(p, notesOn);
  if (clip) clip.style.opacity = String(visual.uprightOpacity);
  if (upright && plate && upright.naturalWidth > 0 && plate.clientWidth > 0) {
    const crop = {
      x: Number(upright.dataset.cropX),
      y: Number(upright.dataset.cropY),
      w: Number(upright.dataset.cropW),
      h: Number(upright.dataset.cropH),
    };
    const contain = containBox(
      plate.clientWidth,
      plate.clientHeight,
      upright.naturalWidth,
      upright.naturalHeight,
    );
    const cropped = croppedBox(plate.clientWidth, upright.naturalWidth, upright.naturalHeight, crop);
    const box = lerpBox(contain, cropped, visual.cropT);
    upright.style.objectFit = 'fill';
    upright.style.right = 'auto';
    upright.style.bottom = 'auto';
    upright.style.left = `${box.left}px`;
    upright.style.top = `${box.top}px`;
    upright.style.width = `${box.width}px`;
    upright.style.height = `${box.height}px`;
    upright.style.opacity = String(visual.uprightOpacity);
  }
  if (plate) plate.style.opacity = String(visual.plateOpacity);
  if (graphics) graphics.style.opacity = String(visual.boxesOpacity);
  if (leaders) {
    leaders.style.opacity = String(visual.notesOpacity);
    frame.querySelectorAll<SVGLineElement>('.mark-leader').forEach((line) => {
      line.setAttribute('pathLength', '1');
      line.setAttribute('stroke-dasharray', '1');
      line.setAttribute('stroke-dashoffset', '0');
    });
  }
  if (notes) notes.style.opacity = String(visual.notesOpacity);
}

function bindSplit(): void {
  const page = document.querySelector<HTMLElement>('.record-page--split');
  if (!page) return;
  const frames = [...page.querySelectorAll<HTMLElement>('.split-frame')];
  const sections = [...page.querySelectorAll<HTMLElement>('.itinerary-section')];
  if (frames.length === 0 || sections.length === 0) return;

  const desktopQuery = window.matchMedia('(min-width: 48rem)');
  const motionOk = () => document.documentElement.dataset.motion === 'ok';
  let ticking = false;

  const frameFor = (section: HTMLElement) =>
    frames.find((frame) => frame.dataset.part === section.dataset.part);

  const lineY = () => activationLineY(window.innerHeight, desktopQuery.matches);

  const headingTops = () =>
    sections.map((section) => {
      const heading = section.querySelector<HTMLElement>('.itinerary-heading');
      return (heading ?? section).getBoundingClientRect().top;
    });

  const anchorsFor = (section: HTMLElement) =>
    [...section.querySelectorAll<HTMLElement>('.itinerary-row')].map(
      (row) => row.getBoundingClientRect().top,
    );

  const setActive = (index: number) => {
    frames.forEach((frame, frameIndex) => {
      const on = frameIndex === index;
      frame.classList.toggle('is-active', on);
      frame.inert = !on;
      if (on) frame.removeAttribute('aria-hidden');
      else frame.setAttribute('aria-hidden', 'true');
    });
  };

  const paintRows = (section: HTMLElement, index: number) => {
    const rows = [...section.querySelectorAll<HTMLElement>('.itinerary-row')];
    rows.forEach((row, rowIndex) => {
      const on = rowIndex === index;
      row.classList.toggle('is-current', on);
      if (on) row.setAttribute('aria-current', 'step');
      else row.removeAttribute('aria-current');
    });
  };

  const applyAll = () => {
    const y = lineY();
    setActive(activeDetailIndex(headingTops(), y));
    if (!motionOk()) return;
    for (const section of sections) {
      const frame = frameFor(section);
      if (!frame) continue;
      const anchors = anchorsFor(section);
      const p = progressFromAnchors(anchors, y);
      if (frame.dataset.notes === 'aligned') {
        try {
          position(frame);
        } catch {
          /* keep the last leader placement */
        }
      }
      applyFrame(frame, p);
      paintRows(section, nearestRowIndex(anchors, y));
    }
  };

  const onScroll = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      ticking = false;
      applyAll();
    });
  };

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', applyAll);
  desktopQuery.addEventListener('change', applyAll);
  applyAll();
}
```

Call `bindSplit()` at the end of `init()`, after the existing figure loop and listeners.

`.upright-clip` is `background: var(--bg)` and sits on top of `.plate`. The motion CSS leaves that clip at opacity 1 for the whole scrub. `applyFrame` therefore writes the clip’s opacity from `uprightOpacity`; otherwise the paper-colored clip covers the plate after the blend. `clearScrubStyles` in Task 5 clears that inline opacity so reduced motion falls back to the clip’s default `opacity: 0`.

Do not set a CSS transition in this task. Changing `.is-active` is instant until Task 5. Do not read `angleDeg`. Do not call `Element.animate`.

- [ ] **Step 3: Checks**

Run: `npm run check && npm run build`  
Expected: PASS.

```bash
grep -c 'runTimeline' 'src/pages/records/[id].astro'
grep -c 'mark-leader' dist/records/mhjl329/index.html
grep -c '原片扶正' dist/records/mhjl329/index.html
grep -c 'GREAT TRACKS 标' dist/records/mhjl329/index.html
grep -c '1988 年夏天，大江千里二十八岁' dist/records/mhjl329/index.html
```

Expected, in order: `0`, `0`, `2`, at least `1`, `1`. `mark-leader` is 0 because MHJL 329 marks have no `note`, so `notesAligned` is false and the leader group is not rendered. The ① line and the 记述 opening stay.

- [ ] **Step 4: Manual scroll check**

Run: `npm run dev -- --host 127.0.0.1 --port 4321`  
Open `http://127.0.0.1:4321/records/mhjl329/` at a desktop width (1280×800, at least `48rem`).

1. The photograph is on the right, full viewport height, with no caption on it. 题铭 and the first heading `A 面标签 · ①–⑥` are on the left. Both stay on screen while the four rows are in view.
2. At 原片扶正 the sticky image is the full upright label. Scrolling toward 裁进板心 crops it into the plate. Scrolling back restores the upright.
3. At 标出要点 the burgundy boxes and numbered badges are on. There is no leader and no sentence drawn on the photograph. The ① lines (`GREAT TRACKS 标`, `MHJL 329`, …) are in the reading column under the rows.
4. Scroll to `腰封 · ①–⑥`. The sticky image swaps to the cover upright and that section’s rows run upright → plate → boxes again. The page is one scroll; there is no second fullscreen runway and no `reveal-runway` section.
5. Open `http://127.0.0.1:4321/records/ml4001/`. It still shows the hero on the left and the text on the right. It has no itinerary rows.

- [ ] **Step 5: Commit**

```bash
git add 'src/pages/records/[id].astro'
git commit -m "feat(records): itinerary scroll drives upright, crop, plate, and boxes"
```

---

### Task 5: Soft-settle on the row, slow crossfade between details

**Files:**
- Modify: `src/pages/records/[id].astro` `<script>` (`bindSplit` only)

**Interfaces:**
- Consumes: Task 1 `DETAIL_CROSSFADE_MS`, `SETTLE_EPSILON_PX`, `SETTLE_IDLE_MS`, `SETTLE_LOCK_MS`, `SETTLE_SLACK_PX`, `scrollTopForAnchor`, `shouldSettle`, plus `applyAll` / `setActive` / `anchorsFor` / `lineY` / `headingTops` / `sections` / `frames` / `motionOk` from Task 4.
- Produces: idle settle onto the nearest `.itinerary-row` label, and a `1.6s` linear opacity transition on `.split-frame` only when `data-motion === 'ok'`. Reduced motion stays instant and does not settle.

- [ ] **Step 1: Extend the Task 1 import**

Add these names to the script import from `../../data/split-stage`: `DETAIL_CROSSFADE_MS`, `SETTLE_EPSILON_PX`, `SETTLE_IDLE_MS`, `SETTLE_LOCK_MS`, `SETTLE_SLACK_PX`, `scrollTopForAnchor`, `shouldSettle`.

- [ ] **Step 2: Arm the crossfade and the idle settle inside `bindSplit`**

After `const motionOk = ...` and before `applyAll`, add:

```ts
let pointerDown = false;
let settling = false;
let idleTimer = 0;

const armFade = () => {
  const duration = motionOk() ? `${DETAIL_CROSSFADE_MS}ms` : '0s';
  for (const frame of frames) {
    frame.style.transitionProperty = 'opacity';
    frame.style.transitionDuration = duration;
    frame.style.transitionTimingFunction = 'linear';
  }
};

const clearScrubStyles = () => {
  for (const frame of frames) {
    frame.style.transitionDuration = '0s';
    frame.querySelectorAll<HTMLElement>('.upright-clip, .upright, .plate, .mark-graphics, .mark-leaders, .mark-list').forEach((node) => {
      node.style.opacity = '';
    });
  }
};

const settleToRow = () => {
  if (!motionOk() || pointerDown || settling) return;
  const y = lineY();
  const section = sections[activeDetailIndex(headingTops(), y)];
  if (!section) return;
  const rows = [...section.querySelectorAll<HTMLElement>('.itinerary-row')];
  const anchors = rows.map((row) => row.getBoundingClientRect().top);
  const lastRow = rows[rows.length - 1];
  if (!lastRow) return;
  if (!shouldSettle(anchors, lastRow.getBoundingClientRect().bottom, y, SETTLE_SLACK_PX)) return;
  const anchor = anchors[nearestRowIndex(anchors, y)];
  if (anchor === undefined) return;
  if (Math.abs(anchor - y) <= SETTLE_EPSILON_PX) return;
  settling = true;
  window.scrollTo({ top: scrollTopForAnchor(window.scrollY, anchor, y), behavior: 'smooth' });
  window.setTimeout(() => {
    settling = false;
  }, SETTLE_LOCK_MS);
};
```

Replace the Task 4 `onScroll` with:

```ts
const onScroll = () => {
  if (!ticking) {
    ticking = true;
    requestAnimationFrame(() => {
      ticking = false;
      applyAll();
    });
  }
  if (settling || pointerDown || !motionOk()) return;
  window.clearTimeout(idleTimer);
  idleTimer = window.setTimeout(settleToRow, SETTLE_IDLE_MS);
};
```

After the existing `window.addEventListener('scroll', onScroll, { passive: true })` line, add:

```ts
window.addEventListener('pointerdown', () => {
  pointerDown = true;
  window.clearTimeout(idleTimer);
});
window.addEventListener('pointerup', () => {
  pointerDown = false;
  if (!motionOk()) return;
  window.clearTimeout(idleTimer);
  idleTimer = window.setTimeout(settleToRow, SETTLE_IDLE_MS);
});
window.addEventListener('pointercancel', () => {
  pointerDown = false;
});
desktopQuery.addEventListener('change', () => {
  armFade();
  applyAll();
});
```

Remove the Task 4 `desktopQuery.addEventListener('change', applyAll)` so the listener is not registered twice. Call `armFade()` once before the first `applyAll()`.

Leave the `prefers-reduced-motion` listener inside `init` as it is. It still writes `dataset.motion` and settles stray `.detail-figure` reveal nodes. Add this second listener inside `bindSplit`, after `armFade()` is defined, so a split page clears inline scrub styles when motion changes:

```ts
const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
motionQuery.addEventListener('change', () => {
  document.documentElement.dataset.motion = motionQuery.matches ? 'reduce' : 'ok';
  if (motionQuery.matches) {
    clearScrubStyles();
    window.clearTimeout(idleTimer);
    settling = false;
  } else {
    armFade();
  }
  applyAll();
});
```

`init`’s listener also writes `dataset.motion`. Both writers store the same value. Do not remove the `init` listener; callout/legacy pages have no `bindSplit` and still need it.

When motion is reduced, `applyAll` returns before `applyFrame`, so inline crop styles stay cleared and the CSS settled plate remains. `setActive` still runs, so scrolling onto `腰封 · ①–⑥` swaps the final cover plate with no fade and no crop scrub.

- [ ] **Step 3: Checks and manual dwell**

Run: `node --experimental-strip-types --test src/data/split-stage.test.ts && npm run check && npm run build`  
Expected: test `# fail 0`, check PASS, build PASS.

With `npm run dev -- --host 127.0.0.1 --port 4321` and `/records/mhjl329/` at 1280×800:

1. Scroll until the label rows are between 原片扶正 and 裁进板心, then release the pointer. Within a short beat the page eases so one of those two labels sits on the reading line. It does not park on an unlabeled gap. Scrolling with the wheel held down does not stutter.
2. Release in the middle of the ① lines under the label rows, or inside 记述. The page does not jump back to a stage row.
3. Cross from `A 面标签 · ①–⑥` into `腰封 · ①–⑥`. The sticky photograph changes over about 1.6 seconds. The incoming image is the cover upright, then that section’s rows crop and box it. Scroll up: the label plate returns the same way.
4. In devtools, emulate `prefers-reduced-motion: reduce` and reload. Rows are short legend lines, not tall scrub beats. The sticky image is the finished label plate with burgundy boxes, no upright crop. Scrolling does not crop. Reaching the 腰封 heading swaps to the finished cover plate immediately. `/records/ml4001/` is still the old split.

Narrow check at 390×844: the photograph is a sticky band about 58svh at the top, and the paper column scrolls in the space below it, overlapping only the photo’s lower edge. The four label rows still drive the same pipeline. At 390×500 the band is shorter (about 42svh) and still sticky while the rows are on screen.

- [ ] **Step 4: Commit**

```bash
git add 'src/pages/records/[id].astro'
git commit -m "feat(records): settle on itinerary rows and crossfade reveal details"
```

---

### Task 6: Acceptance pass and close PR #26

**Files:** none new. Verify, then close the superseded pull request. Do not merge it.

**Interfaces:**
- Consumes: the page and CSS from Tasks 2–5.
- Produces: a passing acceptance check, and PR #26 closed (or, if the token cannot close it, a comment on that PR and the implementation PR stating it must not be merged).

- [ ] **Step 1: Run the automated checks**

```bash
node --experimental-strip-types --test src/data/split-stage.test.ts
npm run check && npm run build
```

Expected: `# fail 0`, check PASS, build PASS.

```bash
test "$(grep -c 'record-page--split' dist/records/mhjl329/index.html)" -eq 1
test "$(grep -c 'itinerary-row' dist/records/mhjl329/index.html)" -eq 8
test "$(grep -c 'reveal-runway' dist/records/mhjl329/index.html)" -eq 0
test "$(grep -c 'entry-hero' dist/records/mhjl329/index.html)" -eq 0
test "$(grep -c 'mark-leader' dist/records/mhjl329/index.html)" -eq 0
test "$(grep -o '原片扶正' dist/records/mhjl329/index.html | wc -l)" -eq 2
test "$(grep -o '裁进板心' dist/records/mhjl329/index.html | wc -l)" -eq 2
test "$(grep -o '标出要点' dist/records/mhjl329/index.html | wc -l)" -eq 2
test "$(grep -o '读注' dist/records/mhjl329/index.html | wc -l)" -eq 2
test "$(grep -c 'A 面标签' dist/records/mhjl329/index.html)" -ge 1
test "$(grep -c '腰封' dist/records/mhjl329/index.html)" -ge 1
test "$(grep -c 'GREAT TRACKS 标' dist/records/mhjl329/index.html)" -ge 1
test "$(grep -c '1988 年夏天，大江千里二十八岁' dist/records/mhjl329/index.html)" -eq 1
test "$(grep -c 'record-page--split' dist/records/ml4001/index.html)" -eq 0
test "$(grep -c 'record-split' dist/records/ml4001/index.html)" -ge 1
test "$(grep -c 'runTimeline' 'src/pages/records/[id].astro')" -eq 0
test "$(grep -c 'reveal-runway' 'src/pages/records/[id].astro')" -eq 0
test "$(grep -c 'reveal-runway' src/styles/global.css)" -eq 0
```

Expected: every `test` exits 0. `grep -c` prints `0` and exits 1 when a pattern is absent; the `test "$(…)" -eq 0` form is the one that must pass, including the `reveal-runway` and `mark-leader` lines.

- [ ] **Step 2: Walk the spec acceptance list in the browser**

Dev server: `npm run dev -- --host 127.0.0.1 --port 4321`.

| # | Check | How |
|---|---|---|
| 1 | Desktop sticky image beside the scrolling 说明栏 through the itinerary | 1280×800, `/records/mhjl329/`. Right photo and left rows visible together from 原片扶正 through 读注. |
| 2 | Rows reversibly drive upright → crop → plate → boxes → notes, notes only when text exists | Scroll down and back on the label rows. Boxes appear at 标出要点. No leaders on this record. |
| 3 | Second detail crossfades; no second runway | Enter `腰封 · ①–⑥`. One sticky frame fades over ~1.6s. Document has no `.reveal-runway`. |
| 4 | Idle soft-settles to a stage row | Release between two label rows. The window eases to one of them. Release in 记述 and it stays. |
| 5 | Reduced motion is the final plate + boxes, no scrub | Reload with `prefers-reduced-motion: reduce`. No crop, no tall rows, no 1.6s fade. |
| 6 | Legacy unchanged | `/records/ml4001/` has `.record-split` and its hero, and no `.record-page--split`. |
| 7 | Every held beat has a line of stage copy | Each of the four labels is visible in the reading column for both 标签 and 腰封. |

Also confirm the narrow path at 390×844 (sticky ~58svh, paper under the lower edge, same four-row pipeline) and at 390×500 (sticky band shortened to ~42svh, plate still visible through the rows).

- [ ] **Step 3: Open the implementation PR from `main`**

The PR branch must be a descendant of `main`, not of `cursor/records-scroll-scrub-5fbb`. Title: `feat(records): split-stage reveal imagery`. Body links this plan and the split-stage spec, and says PR #26 is superseded and must not be merged. Asset protocol unchanged. 记述 unchanged. No new `marks.note` copy.

- [ ] **Step 4: Close PR #26 without merging**

```bash
gh pr comment 26 --body "$(cat <<'EOF'
Superseded by the split-stage implementation (spec `docs/superpowers/specs/2026-10-24-records-imagery-split-stage-design.md`).

Do not merge this PR. The fullscreen sticky runways and `{0, 0.55, 0.75, 1}` snap are withdrawn. Reveal records now use a sticky imagery column driven by the reading-column itinerary, implemented on a new branch from `main`.
EOF
)"
gh pr close 26 --comment "Closing without merge. Split-stage replaces the fullscreen runway."
```

If `gh pr close` is rejected, leave the comment in place and say so on the implementation PR. Do not merge #26 either way.

---

## Spec coverage self-check

| Spec / acceptance item | Task |
|---|---|
| Desktop ~50/50, imagery sticky `100svh` on the right, reading column `42–46ch` (`max-width: 46ch`) | 2, 3 |
| Imagery fills the sticky panel; no caption or other chrome on the photograph | 2, 3 |
| Reading order 题铭 → itinerary → 记述 → 著录 → folds | 2 |
| Four rows per reveal detail: 原片扶正 → 裁进板心 → 标出要点 → 读注 | 1, 2 |
| Scroll maps those rows to upright → crop → plate → boxes → notes, reversibly | 1, 4 |
| Leaders and outside notes only when public per-mark notes already exist (`notesAligned`); MHJL 329 renders empty boxes (stroke + badge, no invented sentence) | 1, 2, 4 |
| Existing `details[].text` stays in the reading column; ① lines are not copied onto marks | 2, 6 |
| Idle soft-settles to the nearest stage row, not `{0, 0.55, 0.75, 1}` | 1, 5 |
| One continuous scroll; caption headings; ~1.6s crossfade; each detail restarts at upright | 2, 4, 5 |
| Narrow ~55–60svh sticky imagery (`58svh`); paper tucks under the photo’s lower edge; short viewports keep a shorter `42svh` pin | 3, 5 |
| Reduced motion: final plate + boxes (+ notes if any), no scrub, itinerary is a static legend | 3, 4, 5 |
| Legacy left-image / right-text layout unchanged (`/records/ml4001/`) | 2, 3, 6 |
| Every held beat has a line of stage copy in the reading column | 2, 6 |
| Remove autoplay `runTimeline`; no fullscreen runway from PR #26 | 4, 6 |
| Reuse `runTimeline` contain/crop math and existing mark SVG / `position()` | 1, 2, 4 |
| Warm paper + burgundy + CJK only; no olive, no Imbue | 3, Global |
| No GSAP / Lenis; no YAML / `export_site_marks.py` / `records.json` edits | Global, File map |
| No loupe, list crop, tombstone, or 记述 rewrite | Global, 2 |
| Close or abandon PR #26; implement from `main` | Header, 6 |
| Primary target `/records/mhjl329/` (`label` then `cover` / 腰封) | 4, 5, 6 |
| Acceptance items 1–7 in the spec | 6 |

## Out of scope (do not implement here)

- Filling missing `marks.note` / `marks.label` (content task for 唱片管理员 / Rolf). Do not invent that copy to make leaders appear on MHJL 329.
- Loupe, list crop, tombstone redesign, list-page layout.
- Editing `src/data/records.json` or the `records.ts` schema.
- Vinyl YAML and `export_site_marks.py`.
- Rewriting 记述 or any other public sentence.
- GSAP, Lenis, ScrollTrigger, or any scroll library.
- Restyling the site onto the dealt olive / Imbue sheet.
- Merging PR #26, or copying `.reveal-runway` / `SCRUB_KEYS` / the 2.75-viewport chapters from `cursor/records-scroll-scrub-5fbb`.
- Rendering `record.image` / `.entry-hero` inside the split-stage page. The list page still uses the cover.
