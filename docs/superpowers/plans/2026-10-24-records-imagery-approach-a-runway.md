# Imagery Approach A camera runway Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On reveal records, play one left-column camera pass from an invisible runway, and hold 题铭 / 记述 / 著录 in a right column that pins when short and paces on the same progress when long.

**Architecture:** Records with at least one `detailMode === 'reveal'` detail keep `.record-page--split` and leave `.record-split` alone. Desktop is a two-column grid: `.camera-runway` (sticky imagery) in column 1, `.split-read` in column 2. The runway’s extra height is the only scroll driver. Total progress `p` in `[0, 1]` covers every reveal detail in order. Inside a detail, local progress holds the upright, zooms with `cameraBox`, then fades the plate, the boxes, the leaders, and the on-image note text. A joint between details holds the outgoing frame at its end pose and the incoming frame at upright while `.split-frame` opacity crossfades for `DETAIL_CROSSFADE_MS`. The reading column does not have stage rows. When its track is taller than the pane, the track’s `translateY` is linear in that same `p`. Idle eases scroll to the nearest camera keypoint. `prefers-reduced-motion: reduce` drops the extra runway height and shows every detail’s finished plate.

**Tech Stack:** Astro static pages, vanilla TypeScript in the page `<script>`, CSS sticky + custom properties, pure helpers in `src/data/split-stage.ts` tested with `node:test`. No scroll libraries. The detail crossfade is a CSS opacity transition whose duration is `DETAIL_CROSSFADE_MS`. Note entrance is opacity. `cameraBox` stays the crop math.

**Spec:** [`docs/superpowers/specs/2026-10-24-records-imagery-approach-a-runway-design.md`](../specs/2026-10-24-records-imagery-approach-a-runway-design.md)  
**Checked against:** `main` at `de480c0` (spec squash `#34`). Code reality is the shipped split-stage plus `cameraBox` (`src/pages/records/[id].astro`, `src/styles/global.css`, `src/data/split-stage.ts`, `src/data/detail-display.ts`, MHJL 329 in `src/data/records.json`).  
**Supersedes as the scroll driver:** itinerary rows, stage labels, tall row `min-height`, imagery-on-the-right, and soft-settle onto `.itinerary-row`, from [`docs/superpowers/plans/2026-10-24-records-imagery-split-stage.md`](2026-10-24-records-imagery-split-stage.md). Legacy `.record-split`, the reversible pipeline, and `DETAIL_CROSSFADE_MS` stay.

**Branch:** cut the implementation branch from `main` after this plan is on `main`. Do not implement these tasks on the docs branch. Do not revive `.reveal-runway`, `SCRUB_KEYS`, or `clamp(250vh, 2.75 * 100vh, 300vh)`.

## Global Constraints

- No GSAP, Lenis, ScrollTrigger, or any other scroll library.
- Do not edit `src/data/records.json`, `src/data/records.ts`, list pages, `src/pages/records.astro`, tombstone markup, loupe, or list crop.
- Do not edit `src/data/detail-display.ts`. It stays the callout helper (`leaderEndpoints`, `resolvedSide`, `visibleDetailText`, `notesAligned`). Do not invent `marks.note`, `marks.label`, or a per-box sentence.
- Do not change Vinyl YAML or the export protocol (`cropSpace: "upright"`, resolved marks, baked upright / plate). `angleDeg` is not read. The upright file is already deskewed. Do not rotate. Do not add a CSS `transform` of `rotate`, `scale`, or `translate` on `.upright`.
- Do not rewrite 记述. `storyParagraphs(record.story)` stays as it is. Do not retune `.record-story` or `.props` type sizes. The reading measure stays `max-width: 46ch`.
- Do not change the `cameraBox` formula or the `describe('cameraBox')` and `describe('mhjl329 crop geometry')` blocks in `src/data/split-stage.test.ts`. Do not call `croppedBox` or reintroduce `lerpBox` on the playback path. Plate opacity stays `0` until `cropT` is `1`. No second easing curve on `cameraBox`’s `t`.
- `DETAIL_CROSSFADE_MS` stays `1600`. `SETTLE_IDLE_MS` stays `180`, `SETTLE_EPSILON_PX` stays `6`, `SETTLE_SLACK_PX` stays `24`, `SETTLE_LOCK_MS` stays `800`.
- Palette stays the current warm paper + burgundy + CJK stack: `var(--bg)`, `var(--text)`, `var(--muted)`, `var(--accent)`, `var(--line)`. Do not add a color token or a font. Public box stroke stays `var(--accent)`.
- The split breakpoint stays `48rem`. Do not rewrite it as `768px`. `html` is `font-size: 112.5%`.
- Do not rename `src/data/split-stage.ts`.
- Published `marks.note` strings render on the image only. A `details[].text` remainder from `visibleDetailText` may stay in the reading column as ordinary prose. It gets no tall `min-height` and it does not drive `p`.
- `prefers-reduced-motion: reduce` / `data-motion !== 'ok'`: no scrub, no extra runway height, no 1.6s fade. Show the cropped plate + boxes (+ notes if `notesAligned`). The reading column is normal flow.
- Soft-settle only after scroll idle, only while the runway is engaged, and never while `pointerdown` is true. The target is a camera keypoint. Skip the notes keypoint when that detail’s `data-notes` is not `aligned`.
- Primary acceptance URL: `/records/mhjl329/` (`label`, then `cover`). Legacy check: `/records/ml4001/`. MHJL 329 has no `marks.note`, so leaders and `.mark-list` stay out of the DOM. The ① lines stay in the reading column.
- Locked runway numbers (the spec says “sized to the camera beat” and does not give a pixel value; these are the values every task uses): `PASS_SVH = 140`, `JOINT_SVH = 28`, phase ends `UPRIGHT_END = 0.08`, `ZOOM_END = 0.40`, `PLATE_END = 0.52`, `BOXES_END = 0.76`, `LEADERS_END = 0.88`, notes end at `1`. The runway element’s height is `100svh` plus that travel on every breakpoint, because scroll travel is `offsetHeight - innerHeight`. The sticky image is `58svh` / `42svh` / `100svh`; that image height is not the runway’s base.

## File map

| Path | Responsibility |
|------|----------------|
| `src/data/split-stage.ts` | `cameraBox` (unchanged), camera-phase `stageVisual`, runway placement, keypoint settle, pin-or-pace offset. No DOM, no JSON. |
| `src/data/split-stage.test.ts` | `node:test` for those helpers. `cameraBox` describes stay byte-for-byte. |
| `src/pages/records/[id].astro` | Reveal branch only: runway shell, reading track, scroll script. Legacy `.record-split` stays. |
| `src/styles/global.css` | Replace the `.record-page--split` rules. Do not edit `.record-split`, `.record-object`, `.upright`, or the warm-paper tokens. |
| `docs/superpowers/plans/2026-10-24-records-imagery-approach-a-runway.md` | This plan |

Do **not** touch `src/pages/records.astro`, `src/data/records.ts`, `src/data/records.json`, `src/data/detail-display.ts`, or `public/records/**`.

---

### Task 1: Camera phases and runway math

**Files:**
- Modify: `src/data/split-stage.ts`
- Modify: `src/data/split-stage.test.ts`
- Test: `src/data/split-stage.test.ts`

**Interfaces:**
- Consumes: existing `cameraBox`, `containBox`, `croppedBox`, `DETAIL_CROSSFADE_MS`, `SETTLE_IDLE_MS`, `SETTLE_EPSILON_PX`, `SETTLE_SLACK_PX`, `SETTLE_LOCK_MS`. The page still imports `STAGE_ROWS` and the itinerary scroll helpers until later tasks, so this task does not delete those exports.
- Produces:

```ts
export const PASS_SVH = 140;
export const JOINT_SVH = 28;
export const UPRIGHT_END = 0.08;
export const ZOOM_END = 0.40;
export const PLATE_END = 0.52;
export const BOXES_END = 0.76;
export const LEADERS_END = 0.88;

export type StageVisual = {
	cropT: number;
	uprightOpacity: number;
	plateOpacity: number;
	boxesOpacity: number;
	leadersOpacity: number;
	notesOpacity: number;
};

export type CameraKeyId = 'upright' | 'zoom' | 'plate' | 'boxes' | 'notes';
export type CameraKeypoint = { id: CameraKeyId; at: number };
export type RunwayPlace = { index: number; local: number; joint: number; outgoing: number };

export function stageVisual(p: number, notesOn: boolean): StageVisual;
export function cameraKeypoints(notesOn: boolean): readonly CameraKeypoint[];
export function nearestKeypoint(local: number, notesOn: boolean): CameraKeypoint;
export function runwayTravelSvh(detailCount: number): number;
export function placeOnRunway(p: number, detailCount: number): RunwayPlace;
export function nearestSettlePlace(
	p: number,
	detailCount: number,
	notesOn: readonly boolean[],
): { index: number; local: number };
export function runwayScrollY(
	runwayPageTop: number,
	travelPx: number,
	detailCount: number,
	index: number,
	local: number,
): number;
export function readTrackOffset(p: number, contentHeight: number, viewHeight: number): number;
export function shouldSettleRunway(
	runwayTop: number,
	runwayBottom: number,
	viewportHeight: number,
	slackPx: number,
): boolean;
```

`notesOpacity` is the outside-note text. `leadersOpacity` is the leader draw and finishes at `LEADERS_END`, before the note text moves. `placeOnRunway`’s `outgoing` is `-1` outside a joint. During a joint, `index` is the incoming detail, `local` is `0`, and `joint` runs `(0, 1]`.

Phase spans, as fractions of one detail pass, sum to 1: hold `0.08`, zoom `0.32`, plate `0.12`, boxes `0.24`, leaders `0.12`, notes `0.12`. `cropT` is linear in the zoom span. Plate opacity stays `0` through `ZOOM_END`.

- [ ] **Step 1: Write the failing test**

In `src/data/split-stage.test.ts`:

- Keep `describe('crop boxes')`, `describe('cameraBox')`, and `describe('mhjl329 crop geometry')` byte-for-byte, including their helpers (`near`, `close`, `closeBox`, `screenCropCenter`, `cropCorners`, `boxClampedByImgMaxWidth`, `uprightRuleBody`, `uprightClampCleared`).
- Remove `CROP_BLEND_AT` from the import and delete the line `assert.equal(CROP_BLEND_AT, 0.9);` inside `describe('stage rows')`. Leave the `STAGE_ROWS` assertion and the `DETAIL_CROSSFADE_MS` / `SETTLE_*` assertions in that describe. Leave `describe('scroll geometry')` in place until Task 4.
- Replace `describe('stageVisual')` and add the runway describes below. Extend the import with the new names (`PASS_SVH`, `JOINT_SVH`, `UPRIGHT_END`, `ZOOM_END`, `PLATE_END`, `BOXES_END`, `LEADERS_END`, `cameraKeypoints`, `nearestKeypoint`, `runwayTravelSvh`, `placeOnRunway`, `nearestSettlePlace`, `runwayScrollY`, `readTrackOffset`, `shouldSettleRunway`). Keep the existing `stageVisual` import.

```ts
describe('stageVisual', () => {
	it('locks the camera phases and drops the itinerary row clock', () => {
		assert.equal(PASS_SVH, 140);
		assert.equal(JOINT_SVH, 28);
		assert.equal(UPRIGHT_END, 0.08);
		assert.equal(ZOOM_END, 0.4);
		assert.equal(PLATE_END, 0.52);
		assert.equal(BOXES_END, 0.76);
		assert.equal(LEADERS_END, 0.88);
		assert.equal(
			UPRIGHT_END +
				(ZOOM_END - UPRIGHT_END) +
				(PLATE_END - ZOOM_END) +
				(BOXES_END - PLATE_END) +
				(LEADERS_END - BOXES_END) +
				(1 - LEADERS_END),
			1,
		);
		const source = readFileSync(new URL('./split-stage.ts', import.meta.url), 'utf8');
		assert.equal(source.includes('CROP_BLEND_AT'), false);
		assert.equal(source.includes('function lerpBox'), false);
	});

	it('holds the upright, then zooms with the plate still hidden', () => {
		const held = stageVisual(0, false);
		assert.equal(held.cropT, 0);
		assert.equal(held.uprightOpacity, 1);
		assert.equal(held.plateOpacity, 0);
		assert.equal(held.boxesOpacity, 0);
		assert.equal(held.leadersOpacity, 0);
		assert.equal(held.notesOpacity, 0);
		assert.deepEqual(stageVisual(UPRIGHT_END, true), held);
		assert.deepEqual(stageVisual(-0.2, false), held);

		const quarter = stageVisual(0.16, false);
		near(quarter.cropT, 0.25);
		assert.equal(quarter.plateOpacity, 0);
		assert.equal(quarter.uprightOpacity, 1);

		const midZoom = stageVisual(0.24, false);
		near(midZoom.cropT, 0.5);
		assert.equal(midZoom.plateOpacity, 0);

		const threeQuarter = stageVisual(0.32, false);
		near(threeQuarter.cropT, 0.75);
		assert.equal(threeQuarter.plateOpacity, 0);

		const zoomDone = stageVisual(ZOOM_END, false);
		assert.equal(zoomDone.cropT, 1);
		assert.equal(zoomDone.uprightOpacity, 1);
		assert.equal(zoomDone.plateOpacity, 0);
		assert.equal(zoomDone.boxesOpacity, 0);
	});

	it('does not treat the old one-third row stop as the plate', () => {
		const legacyRow = stageVisual(1 / 3, false);
		assert.equal(legacyRow.plateOpacity, 0);
		assert.ok(legacyRow.cropT < 1);
		assert.equal(legacyRow.boxesOpacity, 0);
		assert.equal(legacyRow.notesOpacity, 0);
	});

	it('fades the plate, then the boxes, then draws leaders before the note text', () => {
		const plateMid = stageVisual(0.46, true);
		assert.equal(plateMid.cropT, 1);
		near(plateMid.uprightOpacity, 0.5);
		near(plateMid.plateOpacity, 0.5);
		assert.equal(plateMid.boxesOpacity, 0);
		assert.equal(plateMid.leadersOpacity, 0);
		assert.equal(plateMid.notesOpacity, 0);

		const plate = stageVisual(PLATE_END, true);
		assert.equal(plate.uprightOpacity, 0);
		assert.equal(plate.plateOpacity, 1);
		assert.equal(plate.boxesOpacity, 0);

		const boxesMid = stageVisual(0.64, true);
		near(boxesMid.boxesOpacity, 0.5);
		assert.equal(boxesMid.leadersOpacity, 0);
		assert.equal(boxesMid.notesOpacity, 0);

		const boxes = stageVisual(BOXES_END, true);
		assert.equal(boxes.boxesOpacity, 1);
		assert.equal(boxes.leadersOpacity, 0);
		assert.equal(boxes.notesOpacity, 0);

		const leadersMid = stageVisual(0.82, true);
		assert.equal(leadersMid.boxesOpacity, 1);
		near(leadersMid.leadersOpacity, 0.5);
		assert.equal(leadersMid.notesOpacity, 0);

		const leaders = stageVisual(LEADERS_END, true);
		assert.equal(leaders.leadersOpacity, 1);
		assert.equal(leaders.notesOpacity, 0);

		const notesMid = stageVisual(0.94, true);
		assert.equal(notesMid.leadersOpacity, 1);
		near(notesMid.notesOpacity, 0.5);

		const done = stageVisual(1, true);
		assert.equal(done.cropT, 1);
		assert.equal(done.uprightOpacity, 0);
		assert.equal(done.plateOpacity, 1);
		assert.equal(done.boxesOpacity, 1);
		assert.equal(done.leadersOpacity, 1);
		assert.equal(done.notesOpacity, 1);
		assert.deepEqual(stageVisual(2, true), done);
	});

	it('keeps leaders and note text off when the detail has no public note', () => {
		const tail = stageVisual(0.9, false);
		assert.equal(tail.plateOpacity, 1);
		assert.equal(tail.boxesOpacity, 1);
		assert.equal(tail.leadersOpacity, 0);
		assert.equal(tail.notesOpacity, 0);
		assert.equal(tail.uprightOpacity, 0);
		const done = stageVisual(1, false);
		assert.equal(done.notesOpacity, 0);
		assert.equal(done.leadersOpacity, 0);
		assert.equal(done.boxesOpacity, 1);
	});
});

describe('camera keypoints', () => {
	it('omits the notes keypoint when there is no public note', () => {
		assert.deepEqual(
			cameraKeypoints(false).map((key) => [key.id, key.at]),
			[
				['upright', 0],
				['zoom', ZOOM_END],
				['plate', PLATE_END],
				['boxes', BOXES_END],
			],
		);
		assert.deepEqual(
			cameraKeypoints(true).map((key) => key.id),
			['upright', 'zoom', 'plate', 'boxes', 'notes'],
		);
		assert.equal(cameraKeypoints(true)[4]?.at, 1);
	});

	it('keeps the earlier keypoint on a tie, and treats the no-note tail as already settled', () => {
		assert.equal(nearestKeypoint(0, false).id, 'upright');
		assert.equal(nearestKeypoint(0.2, true).id, 'upright');
		assert.equal(nearestKeypoint(0.2, true).at, 0);
		assert.equal(nearestKeypoint(0.24, false).id, 'zoom');
		assert.equal(nearestKeypoint(0.46, true).id, 'zoom');
		assert.equal(nearestKeypoint(PLATE_END, true).id, 'plate');
		assert.equal(nearestKeypoint(BOXES_END, true).id, 'boxes');
		assert.equal(nearestKeypoint(0.82, true).id, 'boxes');
		assert.equal(nearestKeypoint(0.9, true).id, 'notes');
		assert.equal(nearestKeypoint(0.9, true).at, 1);
		assert.equal(nearestKeypoint(1, true).id, 'notes');
		const tail = nearestKeypoint(0.9, false);
		assert.equal(tail.id, 'boxes');
		assert.equal(tail.at, 0.9);
		assert.equal(nearestKeypoint(1, false).at, 1);
	});
});

describe('runway placement', () => {
	it('sizes travel as one pass per detail plus a joint between details', () => {
		assert.equal(runwayTravelSvh(0), 0);
		assert.equal(runwayTravelSvh(1), 140);
		assert.equal(runwayTravelSvh(2), 308);
		assert.equal(runwayTravelSvh(3), 476);
	});

	it('maps one detail with no joint', () => {
		assert.deepEqual(placeOnRunway(0, 1), { index: 0, local: 0, joint: 0, outgoing: -1 });
		const mid = placeOnRunway(0.5, 1);
		assert.equal(mid.index, 0);
		near(mid.local, 0.5);
		assert.equal(mid.joint, 0);
		assert.equal(mid.outgoing, -1);
		const end = placeOnRunway(1, 1);
		assert.equal(end.index, 0);
		near(end.local, 1);
		assert.equal(end.joint, 0);
		assert.deepEqual(placeOnRunway(-1, 1), placeOnRunway(0, 1));
		assert.deepEqual(placeOnRunway(2, 1), placeOnRunway(1, 1));
		assert.deepEqual(placeOnRunway(0.5, 0), { index: 0, local: 1, joint: 0, outgoing: -1 });
	});

	it('holds the next detail at upright for the whole joint', () => {
		const total = 308;
		const passEnd = placeOnRunway(140 / total, 2);
		assert.equal(passEnd.index, 0);
		near(passEnd.local, 1);
		assert.equal(passEnd.joint, 0);
		assert.equal(passEnd.outgoing, -1);

		const jointMid = placeOnRunway(154 / total, 2);
		assert.equal(jointMid.index, 1);
		assert.equal(jointMid.local, 0);
		near(jointMid.joint, 0.5);
		assert.equal(jointMid.outgoing, 0);

		const jointEnd = placeOnRunway(168 / total, 2);
		assert.equal(jointEnd.index, 1);
		assert.equal(jointEnd.local, 0);
		near(jointEnd.joint, 1);
		assert.equal(jointEnd.outgoing, 0);

		const second = placeOnRunway(238 / total, 2);
		assert.equal(second.index, 1);
		near(second.local, 0.5);
		assert.equal(second.joint, 0);
		assert.equal(second.outgoing, -1);

		const done = placeOnRunway(1, 2);
		assert.equal(done.index, 1);
		near(done.local, 1);
		assert.equal(done.joint, 0);
		assert.equal(done.outgoing, -1);
	});
});

describe('settle and pace', () => {
	it('settles inside a pass to the nearest keypoint and across a joint at the midpoint', () => {
		assert.deepEqual(nearestSettlePlace(0, 2, [false, false]), { index: 0, local: 0 });
		const zoomTravel = nearestSettlePlace(0.24 * (140 / 308), 2, [true, true]);
		assert.deepEqual(zoomTravel, { index: 0, local: ZOOM_END });
		const noNoteTail = nearestSettlePlace((0.9 * 140) / 308, 2, [false, true]);
		assert.equal(noNoteTail.index, 0);
		near(noNoteTail.local, 0.9);

		assert.deepEqual(nearestSettlePlace(154 / 308, 2, [false, false]), { index: 0, local: 1 });
		assert.deepEqual(nearestSettlePlace(154 / 308, 2, [true, false]), { index: 0, local: 1 });
		const intoNext = nearestSettlePlace((140 + 14.1) / 308, 2, [true, true]);
		assert.deepEqual(intoNext, { index: 1, local: 0 });
		assert.deepEqual(nearestSettlePlace(1, 2, [true, true]), { index: 1, local: 1 });
		assert.deepEqual(nearestSettlePlace(1, 2, [true, false]), { index: 1, local: 1 });
	});

	it('turns a keypoint into a document scroll offset along the same travel', () => {
		assert.equal(runwayScrollY(80, 3080, 2, 0, 0), 80);
		assert.equal(runwayScrollY(80, 3080, 2, 0, 1), 1480);
		assert.equal(runwayScrollY(80, 3080, 2, 1, 0), 1760);
		assert.equal(runwayScrollY(80, 3080, 2, 1, 0.5), 2460);
		assert.equal(runwayScrollY(80, 3080, 2, 1, 1), 3160);
		assert.equal(runwayScrollY(80, 0, 2, 1, 1), 80);
		assert.equal(runwayScrollY(0, 1400, 1, 0, 1), 1400);
	});

	it('pins when the column fits and paces the overflow linearly with p', () => {
		assert.equal(readTrackOffset(0, 100, 200), 0);
		assert.equal(readTrackOffset(1, 100, 200), 0);
		assert.equal(readTrackOffset(0.5, 200, 200), 0);
		assert.equal(readTrackOffset(1, 201, 200), 0);
		assert.equal(readTrackOffset(0, 500, 200), 0);
		assert.equal(readTrackOffset(0.5, 500, 200), 150);
		assert.equal(readTrackOffset(1, 500, 200), 300);
		assert.equal(readTrackOffset(0.25, 400, 100), 75);
		assert.equal(readTrackOffset(-1, 500, 200), 0);
		assert.equal(readTrackOffset(2, 500, 200), 300);
		assert.equal(readTrackOffset(1, 500, 0), 0);
	});

	it('settles only after the runway top has reached the viewport and the runway still fills it', () => {
		assert.equal(shouldSettleRunway(40, 5000, 800, 24), false);
		assert.equal(shouldSettleRunway(25, 5000, 800, 24), false);
		assert.equal(shouldSettleRunway(24, 5000, 800, 24), true);
		assert.equal(shouldSettleRunway(0, 5000, 800, 24), true);
		assert.equal(shouldSettleRunway(-200, 5000, 800, 24), true);
		assert.equal(shouldSettleRunway(-4000, 776, 800, 24), true);
		assert.equal(shouldSettleRunway(-4000, 775, 800, 24), false);
		assert.equal(shouldSettleRunway(0, 0, 800, 24), false);
	});
});
```

`0.24 * (140 / 308)` is local `0.24` on the first pass. Distances: `0.24` is closer to `ZOOM_END` (`0.40`) than to upright (`0`). `(140 + 14.1) / 308` is just past the joint midpoint, so the target is the incoming upright.

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --experimental-strip-types --test src/data/split-stage.test.ts`  
Expected: FAIL. The new imports are missing (`PASS_SVH` / `placeOnRunway` / `cameraKeypoints`, or `stageVisual(...).leadersOpacity` is `undefined`). The `cameraBox` tests have not run yet or, if they have, they pass. Do not edit them to make this step pass.

- [ ] **Step 3: Write the implementation**

In `src/data/split-stage.ts`:

- Delete `CROP_BLEND_AT` and its comment.
- Add `leadersOpacity` to `StageVisual`.
- Add the constants, types, and functions below. Leave `cameraBox`, `containBox`, and `croppedBox` byte-for-byte.
- Leave `STAGE_ROWS`, `progressFromAnchors`, `nearestRowIndex`, `activeDetailIndex`, `activationLineY`, `scrollTopForAnchor`, and `shouldSettle` in the file. Task 2 and Task 4 remove them.
- Replace `stageVisual` with the function below.

```ts
/** Scroll travel of one detail pass, in svh. The reading column does not use this as min-height. */
export const PASS_SVH = 140;

/** Scroll travel of the crossfade joint between two details, in svh. */
export const JOINT_SVH = 28;

/** Local progress inside one pass. The spans sum to 1. */
export const UPRIGHT_END = 0.08;
export const ZOOM_END = 0.40;
export const PLATE_END = 0.52;
export const BOXES_END = 0.76;
export const LEADERS_END = 0.88;

export type CameraKeyId = 'upright' | 'zoom' | 'plate' | 'boxes' | 'notes';

export type CameraKeypoint = { id: CameraKeyId; at: number };

export type RunwayPlace = {
	index: number;
	local: number;
	joint: number;
	outgoing: number;
};

export type StageVisual = {
	cropT: number;
	uprightOpacity: number;
	plateOpacity: number;
	boxesOpacity: number;
	leadersOpacity: number;
	notesOpacity: number;
};
```

Put the `StageVisual` replacement where the old type sits (delete the old type so it is not declared twice). Then replace `stageVisual` and append the new functions after it:

```ts
export function stageVisual(p: number, notesOn: boolean): StageVisual {
	const u = Math.min(1, Math.max(0, p));
	if (u <= UPRIGHT_END) {
		return {
			cropT: 0,
			uprightOpacity: 1,
			plateOpacity: 0,
			boxesOpacity: 0,
			leadersOpacity: 0,
			notesOpacity: 0,
		};
	}
	if (u <= ZOOM_END) {
		return {
			cropT: (u - UPRIGHT_END) / (ZOOM_END - UPRIGHT_END),
			uprightOpacity: 1,
			plateOpacity: 0,
			boxesOpacity: 0,
			leadersOpacity: 0,
			notesOpacity: 0,
		};
	}
	if (u <= PLATE_END) {
		const t = (u - ZOOM_END) / (PLATE_END - ZOOM_END);
		return {
			cropT: 1,
			uprightOpacity: 1 - t,
			plateOpacity: t,
			boxesOpacity: 0,
			leadersOpacity: 0,
			notesOpacity: 0,
		};
	}
	if (u <= BOXES_END) {
		const t = (u - PLATE_END) / (BOXES_END - PLATE_END);
		return {
			cropT: 1,
			uprightOpacity: 0,
			plateOpacity: 1,
			boxesOpacity: t,
			leadersOpacity: 0,
			notesOpacity: 0,
		};
	}
	if (!notesOn) {
		return {
			cropT: 1,
			uprightOpacity: 0,
			plateOpacity: 1,
			boxesOpacity: 1,
			leadersOpacity: 0,
			notesOpacity: 0,
		};
	}
	if (u <= LEADERS_END) {
		const t = (u - BOXES_END) / (LEADERS_END - BOXES_END);
		return {
			cropT: 1,
			uprightOpacity: 0,
			plateOpacity: 1,
			boxesOpacity: 1,
			leadersOpacity: t,
			notesOpacity: 0,
		};
	}
	const t = (u - LEADERS_END) / (1 - LEADERS_END);
	return {
		cropT: 1,
		uprightOpacity: 0,
		plateOpacity: 1,
		boxesOpacity: 1,
		leadersOpacity: 1,
		notesOpacity: t,
	};
}

export function cameraKeypoints(notesOn: boolean): readonly CameraKeypoint[] {
	const keys: CameraKeypoint[] = [
		{ id: 'upright', at: 0 },
		{ id: 'zoom', at: ZOOM_END },
		{ id: 'plate', at: PLATE_END },
		{ id: 'boxes', at: BOXES_END },
	];
	if (notesOn) keys.push({ id: 'notes', at: 1 });
	return keys;
}

/** Strict `<` so an equal distance keeps the earlier keypoint. */
export function nearestKeypoint(local: number, notesOn: boolean): CameraKeypoint {
	const clamped = Math.min(1, Math.max(0, local));
	if (!notesOn && clamped >= BOXES_END) return { id: 'boxes', at: clamped };
	const keys = cameraKeypoints(notesOn);
	let best = keys[0] ?? { id: 'upright' as const, at: 0 };
	let bestDist = Number.POSITIVE_INFINITY;
	for (const key of keys) {
		const dist = Math.abs(key.at - clamped);
		if (dist < bestDist) {
			bestDist = dist;
			best = key;
		}
	}
	return best;
}

export function runwayTravelSvh(detailCount: number): number {
	if (detailCount <= 0) return 0;
	return detailCount * PASS_SVH + (detailCount - 1) * JOINT_SVH;
}

export function placeOnRunway(p: number, detailCount: number): RunwayPlace {
	if (detailCount <= 0) return { index: 0, local: 1, joint: 0, outgoing: -1 };
	const total = runwayTravelSvh(detailCount);
	let cursor = Math.min(1, Math.max(0, p)) * total;
	for (let i = 0; i < detailCount; i++) {
		if (cursor <= PASS_SVH || i === detailCount - 1) {
			return {
				index: i,
				local: Math.min(1, Math.max(0, cursor / PASS_SVH)),
				joint: 0,
				outgoing: -1,
			};
		}
		cursor -= PASS_SVH;
		if (cursor <= JOINT_SVH) {
			return {
				index: i + 1,
				local: 0,
				joint: cursor / JOINT_SVH,
				outgoing: i,
			};
		}
		cursor -= JOINT_SVH;
	}
	return { index: detailCount - 1, local: 1, joint: 0, outgoing: -1 };
}

export function nearestSettlePlace(
	p: number,
	detailCount: number,
	notesOn: readonly boolean[],
): { index: number; local: number } {
	const place = placeOnRunway(p, detailCount);
	if (place.joint > 0 && place.outgoing >= 0) {
		if (place.joint <= 0.5) return { index: place.outgoing, local: 1 };
		return { index: place.index, local: 0 };
	}
	const key = nearestKeypoint(place.local, notesOn[place.index] ?? false);
	return { index: place.index, local: key.at };
}

export function runwayScrollY(
	runwayPageTop: number,
	travelPx: number,
	detailCount: number,
	index: number,
	local: number,
): number {
	const total = runwayTravelSvh(detailCount);
	if (total <= 0 || travelPx <= 0) return runwayPageTop;
	const units = index * (PASS_SVH + JOINT_SVH) + local * PASS_SVH;
	return runwayPageTop + (units / total) * travelPx;
}

/** `overflow <= 1` pins. A taller column moves by `p * overflow`. */
export function readTrackOffset(p: number, contentHeight: number, viewHeight: number): number {
	if (viewHeight <= 0) return 0;
	const overflow = contentHeight - viewHeight;
	if (overflow <= 1) return 0;
	return Math.min(1, Math.max(0, p)) * overflow;
}

/**
 * True once the runway top is within `slackPx` of the viewport top (or above it)
 * and the runway bottom still reaches the viewport bottom, within `slackPx`.
 */
export function shouldSettleRunway(
	runwayTop: number,
	runwayBottom: number,
	viewportHeight: number,
	slackPx: number,
): boolean {
	return runwayTop <= slackPx && runwayBottom >= viewportHeight - slackPx;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --experimental-strip-types --test src/data/split-stage.test.ts`  
Expected: `# fail 0` and exit code 0. The `cameraBox` and `mhjl329 crop geometry` describes pass with the same assertions as before this task.

- [ ] **Step 5: Typecheck**

Run: `npm run check`  
Expected: PASS. The page still imports `STAGE_ROWS` and the itinerary helpers, which this task left exported. `leadersOpacity` is extra on `StageVisual`; the page may ignore it until Task 4.

- [ ] **Step 6: Commit**

```bash
git add src/data/split-stage.ts src/data/split-stage.test.ts
git commit -m "test(records): add camera-runway phases and scroll placement"
```

---

### Task 2: Remove the itinerary and add the runway shell

**Files:**
- Modify: `src/pages/records/[id].astro` (frontmatter import and the `hasReveal` tree only)
- Modify: `src/data/split-stage.ts` (delete `STAGE_ROWS` only)
- Modify: `src/data/split-stage.test.ts`
- Test: `src/data/split-stage.test.ts`

**Interfaces:**
- Consumes: `visibleDetailText`, `showDetailsNote`, `detailMode`, `notesAligned`, `paintSide`, `badgeCenter`, `showMarkLabel` from `src/data/detail-display.ts` (already imported). `PASS_SVH` is not imported by the page; the runway length is the CSS in Task 3, fed by `--pass-count`.
- Produces: when `hasReveal` is true, `<article class="record-page record-page--split">` contains `.split-stage` > `.camera-runway` + `.split-read`. `.camera-runway` carries `style="--pass-count: N"` and wraps the existing `.split-imagery` / `.split-frame` map. `.split-read` wraps one `.split-read-track` whose order is 题铭, the existing `detailsNote` line, one `.detail-text` per reveal remainder, the existing non-reveal `.detail-grid` when present, then `.record-text` (记述, `dl.props`, three `.fold` blocks). There is no `.itinerary-section`, `.itinerary-rows`, `.itinerary-row`, or `STAGE_ROWS`. When `hasReveal` is false, the `.record-split` tree is unchanged.

This task also replaces `bindSplit` with a stub that returns when `.camera-runway` or `.split-frame` is missing. The frames stay on the CSS initial pose until Task 4 fills the stub in. Do not put a dummy itinerary back to keep the old script alive.

- [ ] **Step 1: Write the failing test**

Add this describe to `src/data/split-stage.test.ts`. `readFileSync`, `dirname`, `join`, and `fileURLToPath` are already imported. In the same edit, delete `describe('stage rows')` and drop `STAGE_ROWS` from the import. The new test is the one that fails.

```ts
describe('itinerary removal', () => {
	it('drops stage labels from the module and the reveal page', () => {
		const here = dirname(fileURLToPath(import.meta.url));
		const source = readFileSync(join(here, 'split-stage.ts'), 'utf8');
		assert.equal(source.includes('STAGE_ROWS'), false);
		assert.equal(source.includes('原片扶正'), false);
		assert.equal(source.includes('裁进板心'), false);
		assert.equal(source.includes('标出要点'), false);
		assert.equal(source.includes('读注'), false);
		const astro = readFileSync(join(here, '../pages/records/[id].astro'), 'utf8');
		assert.equal(astro.includes('STAGE_ROWS'), false);
		assert.equal(astro.includes('itinerary-section'), false);
		assert.equal(astro.includes('itinerary-row'), false);
		assert.equal(astro.includes('itinerary-heading'), false);
		assert.match(astro, /class="camera-runway"/);
		assert.match(astro, /class="split-read-track"/);
		assert.match(astro, /--pass-count:/);
		assert.match(astro, /class="record-split"/);
		assert.match(astro, /class="record-story"/);
	});
});
```

The current page and `split-stage.ts` still contain `STAGE_ROWS` and `itinerary-section`, so this test fails. Step 3 removes those strings from the module, the markup, and the script. The stub in Step 3 must not mention `itinerary`. Scroll mapping is Task 4.

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --experimental-strip-types --test src/data/split-stage.test.ts`  
Expected: FAIL in `itinerary removal` (`STAGE_ROWS` or `itinerary-section` still present). `cameraBox` still passes.

- [ ] **Step 3: Write the markup and delete the stage-row export**

Delete the `STAGE_ROWS` constant from `src/data/split-stage.ts`.

In `src/pages/records/[id].astro` frontmatter, delete:

```ts
import { STAGE_ROWS } from '../../data/split-stage';
```

Do not add a replacement import. The `<script>` import stays as it is except for the `bindSplit` stub below.

Leave the `{!hasReveal && ( <div class="record-split"> … )}` tree byte-for-byte, including `.entry-hero`, its detail grid, its tombstone, `.record-story`, `dl.props`, and the three folds.

Replace the `hasReveal && (` tree with the shell below.

- The `revealDetails.map` that returns `.split-frame` is the current map, character for character, including plate, upright, marks, leaders, and `.mark-list`. It still sets `data-part`, `data-plate-width`, `data-plate-height`, `data-notes` (`aligned` or `open`), `inert` on every frame after the first, and `--plate-w` / `--plate-h`. Do not add `class="detail-figure"` or `data-mode="reveal"` to `.split-frame`. Do not render `.entry-hero`, `record.image`, or `record.photo` inside `.record-page--split`. Do not add a `<figcaption>` inside `.split-imagery`. Do not copy `mark.note` into `.split-read`.
- The `{nonRevealDetails.length > 0 && (` detail grid moves inside `.split-read-track` with no edits inside it.
- `.record-text` moves inside `.split-read-track` with no edits inside it: the same `storyParagraphs` loop, the same `dl.props` / `aria-label="著录"`, and the same three `details.fold` blocks (出处, 证据核对, 待补拍).

```astro
{
  hasReveal && (
    <div class="split-stage">
      <div class="camera-runway" style={`--pass-count: ${revealDetails.length};`}>
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
      </div>
      <div class="split-read">
        <div class="split-read-track">
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
            return remainder ? <p class="detail-text">{remainder}</p> : null;
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
    </div>
  )
}
```

The `.split-frame` map and the `nonRevealDetails` grid above are the current trees from `main`. Do not edit them. Do not render `detail.caption` anywhere in the reveal reading column. MHJL 329’s captions (`A 面标签 · ①–⑥`, `腰封 · ①–⑥`) leave the page. The ① lines stay because `notesAligned` is false and `visibleDetailText` returns `details[].text`.

Replace `bindSplit` with this stub so the page no longer mentions the itinerary. Leave `applyFrame`, `position`, `settle`, `bind`, and `init` in place. `init` still calls `bindSplit()`.

```ts
function bindSplit(): void {
  const page = document.querySelector<HTMLElement>('.record-page--split');
  if (!page) return;
  const runway = page.querySelector<HTMLElement>('.camera-runway');
  const frames = [...page.querySelectorAll<HTMLElement>('.split-frame')];
  if (!runway || frames.length === 0) return;
}
```

Remove the now-unused script imports (`DETAIL_CROSSFADE_MS`, `SETTLE_EPSILON_PX`, `SETTLE_IDLE_MS`, `SETTLE_LOCK_MS`, `SETTLE_SLACK_PX`, `activationLineY`, `activeDetailIndex`, `nearestRowIndex`, `progressFromAnchors`, `scrollTopForAnchor`, `shouldSettle`). Keep `cameraBox` and `stageVisual` imported only if `applyFrame` still references them. `applyFrame` still calls both, so keep those two. If the typecheck then reports the itinerary helpers as missing exports, that means the stub still references them; it must not.

- [ ] **Step 4: Run the test and the build**

Run: `node --experimental-strip-types --test src/data/split-stage.test.ts && npm run check && npm run build`  
Expected: `# fail 0`, check PASS, build PASS. The photograph will not scrub until Task 4. Legacy pages must still build.

```bash
test "$(grep -c 'record-page--split' dist/records/mhjl329/index.html)" -eq 1
test "$(grep -c 'camera-runway' dist/records/mhjl329/index.html)" -eq 1
test "$(grep -c 'split-read-track' dist/records/mhjl329/index.html)" -eq 1
test "$(grep -c 'itinerary-' dist/records/mhjl329/index.html)" -eq 0
test "$(grep -c '原片扶正' dist/records/mhjl329/index.html)" -eq 0
test "$(grep -c 'A 面标签 · ' dist/records/mhjl329/index.html)" -eq 0
test "$(grep -c '腰封 · ' dist/records/mhjl329/index.html)" -eq 0
test "$(grep -c 'entry-hero' dist/records/mhjl329/index.html)" -eq 0
test "$(grep -c 'GREAT TRACKS 标' dist/records/mhjl329/index.html)" -ge 1
test "$(grep -c '1988 年夏天，大江千里二十八岁' dist/records/mhjl329/index.html)" -eq 1
test "$(grep -c 'record-page--split' dist/records/ml4001/index.html)" -eq 0
test "$(grep -c 'record-split' dist/records/ml4001/index.html)" -ge 1
test "$(grep -c 'itinerary-' 'src/pages/records/[id].astro')" -eq 0
```

Expected: every `test` exits 0. `grep -c` prints `0` and exits 1 when a pattern is absent; the `test "$(…)" -eq 0` form is the one that must pass.

- [ ] **Step 5: Commit**

```bash
git add src/data/split-stage.ts src/data/split-stage.test.ts 'src/pages/records/[id].astro'
git commit -m "feat(records): drop the itinerary and add the camera-runway shell"
```

---

### Task 3: Left stage, right column, narrow stack, reduced motion

**Files:**
- Modify: `src/styles/global.css` (the `.record-page--split` block only, from `.record-page--split .split-stage` through the reduced-motion `.split-frame` rule)
- Modify: `src/data/split-stage.test.ts`
- Test: `src/data/split-stage.test.ts`

**Interfaces:**
- Consumes: `.record-page--split`, `.split-stage`, `.camera-runway`, `.split-imagery`, `.split-frame`, `.split-frame.is-active`, `.split-read`, `.split-read-track`, `.detail-text` from Task 2. `--pass-count` is the reveal detail count. `PASS_SVH` and `JOINT_SVH` from Task 1. Inner plate classes already exist.
- Produces: desktop imagery sticky at `100svh` in column 1; reading pane sticky at `100svh` in column 2 with `max-width: 46ch`. Narrow imagery sticky at `58svh` (`42svh` when `max-height: 32rem`) with the reading pane in the band underneath. Runway height is `100svh + passes + joints` on every breakpoint that still scrubs. Reduced motion sets that height to `auto`, unstacks the frames, and lets the reading column flow. No new color or font tokens. No `.itinerary-*` rules. No `min-height` in `svh` on a text row.

- [ ] **Step 1: Write the failing test**

Add this describe to `src/data/split-stage.test.ts`. Import `JOINT_SVH` and `PASS_SVH` if Task 1’s import does not already include them.

```ts
describe('runway css', () => {
	it('sizes one left-column runway from the camera constants', () => {
		const here = dirname(fileURLToPath(import.meta.url));
		const css = readFileSync(join(here, '../styles/global.css'), 'utf8');
		const start = css.indexOf('.record-page--split .split-stage');
		assert.ok(start >= 0);
		const slice = css.slice(start);
		const formula = `height: calc(100svh + (var(--pass-count) * ${PASS_SVH}svh) + (max(var(--pass-count) - 1, 0) * ${JOINT_SVH}svh));`;
		const found = slice.match(new RegExp(formula.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'));
		assert.equal(found?.length, 1);
		assert.match(slice, /\.camera-runway\s*\{[^}]*grid-column:\s*1/s);
		assert.match(slice, /\.split-read\s*\{[^}]*grid-column:\s*2/s);
		assert.match(slice, /\.split-read\s*\{[^}]*max-width:\s*46ch/s);
		assert.doesNotMatch(slice, /\.split-imagery\s*\{[^}]*grid-column:\s*2/s);
		assert.doesNotMatch(slice, /itinerary/);
		assert.doesNotMatch(slice, /min-height:\s*\d+svh/);
		assert.match(slice, /prefers-reduced-motion:\s*reduce/);
		assert.match(slice, /\.camera-runway\s*\{[^}]*height:\s*auto/s);
		assert.match(slice, /max-width:\s*47\.99rem\)[\s\S]*grid-row:\s*2/);
	});
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --experimental-strip-types --test src/data/split-stage.test.ts`  
Expected: FAIL in `runway css`. The current sheet puts `.split-imagery` at `grid-column: 2` and sizes `.itinerary-row` with `min-height`.

- [ ] **Step 3: Replace the split-stage rules**

Replace the existing `.record-page--split` block (it starts at `.record-page--split .split-stage` and ends at the `prefers-reduced-motion` rule that sets `.split-frame { transition: none }`). Do not edit `.record-split`, `.record-object`, `.upright`, `.record-story`, or `:root` tokens.

The runway formula appears once. Narrow and short viewports change the image pane and the reading band. They do not change the runway height. Scroll travel is `runway.offsetHeight - window.innerHeight`, so the base is `100svh` even when the photograph is `58svh`.

```css
.record-page--split .split-stage {
	display: grid;
	grid-template-columns: minmax(0, 1fr);
	align-items: start;
}

.record-page--split .camera-runway {
	grid-column: 1;
	grid-row: 1;
	height: calc(100svh + (var(--pass-count) * 140svh) + (max(var(--pass-count) - 1, 0) * 28svh));
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
	grid-column: 1;
	grid-row: 1;
	position: sticky;
	z-index: 1;
	top: 58svh;
	height: calc(100svh - 58svh);
	margin-top: 58svh;
	overflow: hidden;
	background: var(--bg);
	align-self: start;
}

.record-page--split .split-read > .meta,
.record-page--split .split-read-track > .meta {
	margin: 0.4rem 0 0;
	font-size: 0.78rem;
	line-height: 1.4;
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
		grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
		column-gap: 0;
	}

	.record-page--split .split-imagery {
		height: 100svh;
	}

	.record-page--split .split-read {
		grid-column: 2;
		top: 0;
		height: 100svh;
		margin-top: 0;
		max-width: 46ch;
		padding: 0 0 0 1.25rem;
		background: transparent;
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

	.record-page--split .split-read {
		top: 42svh;
		height: calc(100svh - 42svh);
		margin-top: 42svh;
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

html[data-motion='reduce'] .record-page--split .camera-runway {
	height: auto;
}

html[data-motion='reduce'] .record-page--split .split-imagery {
	position: static;
	display: flex;
	flex-direction: column;
	height: auto;
	overflow: visible;
}

html[data-motion='reduce'] .record-page--split .split-frame {
	grid-area: auto;
	opacity: 1;
	position: relative;
}

html[data-motion='reduce'] .record-page--split .split-read {
	position: static;
	top: auto;
	height: auto;
	margin-top: 0;
	overflow: visible;
}

html[data-motion='reduce'] .record-page--split .split-read-track {
	transform: none;
}

@media (max-width: 47.99rem) {
	html[data-motion='reduce'] .record-page--split .split-read {
		grid-row: 2;
	}
}

@media (prefers-reduced-motion: reduce) {
	.record-page--split .camera-runway {
		height: auto;
	}

	.record-page--split .split-imagery {
		position: static;
		display: flex;
		flex-direction: column;
		height: auto;
		overflow: visible;
	}

	.record-page--split .split-frame {
		grid-area: auto;
		opacity: 1;
		position: relative;
		transition: none;
	}

	.record-page--split .split-read {
		position: static;
		top: auto;
		height: auto;
		margin-top: 0;
		overflow: visible;
	}

	.record-page--split .split-read-track {
		transform: none;
	}
}

@media (prefers-reduced-motion: reduce) and (max-width: 47.99rem) {
	.record-page--split .split-read {
		grid-row: 2;
	}
}
```

`.split-imagery` stays a one-cell grid while motion is allowed, and every `.split-frame` occupies `1 / 1`. Reduced motion lays the frames out in a column so both of MHJL 329’s finished plates are on the page without a scrub. On a narrow viewport the reading column moves to `grid-row: 2`, under the plates. From `48rem` up it stays in column 2, row 1, with `height: auto`, so the two columns share a row and the page is only as tall as the text. `.upright` already sets `max-width: none` and `max-height: none`. Do not remove that. The global `img { max-width: 100% }` would squash the zoom. The runway `height: calc(...)` rule stays above the `height: auto` override. The calc appears once.

- [ ] **Step 4: Run the test and confirm legacy rules were not edited**

Run: `node --experimental-strip-types --test src/data/split-stage.test.ts`  
Expected: `# fail 0`.

```bash
git diff -U0 -- src/styles/global.css | grep -E '^[+-].*record-split|^[+-].*record-object|^[+-]\.upright' || true
```

Expected: no added or removed lines. The diff for this task only replaces `.record-page--split` rules.

- [ ] **Step 5: Commit**

```bash
git add src/styles/global.css src/data/split-stage.test.ts
git commit -m "style(records): left sticky camera stage and pinned reading column"
```

---

### Task 4: Runway scroll drives the camera and the reading track

**Files:**
- Modify: `src/pages/records/[id].astro` `<script>` (`applyFrame` and `bindSplit`)
- Modify: `src/data/split-stage.ts` (delete the itinerary scroll helpers)
- Modify: `src/data/split-stage.test.ts`
- Test: `src/data/split-stage.test.ts`

**Interfaces:**
- Consumes: Task 1 `placeOnRunway`, `readTrackOffset`, `stageVisual` (`leadersOpacity` and `notesOpacity`), `cameraBox`, `RunwayPlace`, `DETAIL_CROSSFADE_MS`. Task 2 DOM (`.camera-runway`, `.split-frame`, `.split-read`, `.split-read-track`). Existing `position(figure)`.
- Produces: `applyFrame(frame, local)` writes `cameraBox(..., visual.cropT)` and draws leaders from `visual.leadersOpacity` before the note list fades with `visual.notesOpacity`. `bindSplit` maps runway scroll to `p`, applies each frame’s local progress, sets `data-pace="pin"` or `"pace"`, and flips `.is-active` to `place.index` so the `DETAIL_CROSSFADE_MS` opacity transition runs at the joint. When `data-motion !== 'ok'`, it clears inline scrub styles and shows every frame. `progressFromAnchors`, `nearestRowIndex`, `activeDetailIndex`, `activationLineY`, `scrollTopForAnchor`, and `shouldSettle` are deleted.

`local` for a frame: the active place’s `local`; the outgoing frame during a joint is `1`; an earlier frame is `1`; a later frame is `0`. The incoming frame stays at `0` for the whole joint, so the zoom does not run during the crossfade.

- [ ] **Step 1: Write the failing test**

Delete `describe('scroll geometry')` from `src/data/split-stage.test.ts`. Drop `activationLineY`, `activeDetailIndex`, `nearestRowIndex`, `progressFromAnchors`, `scrollTopForAnchor`, and `shouldSettle` from the import.

Add:

```ts
describe('itinerary scroll helpers', () => {
	it('removes the row-anchor driver from the module and the page', () => {
		const here = dirname(fileURLToPath(import.meta.url));
		const source = readFileSync(join(here, 'split-stage.ts'), 'utf8');
		assert.equal(source.includes('function progressFromAnchors'), false);
		assert.equal(source.includes('function nearestRowIndex'), false);
		assert.equal(source.includes('function activeDetailIndex'), false);
		assert.equal(source.includes('function activationLineY'), false);
		assert.equal(source.includes('function scrollTopForAnchor'), false);
		assert.equal(source.includes('function shouldSettle'), false);
		const astro = readFileSync(join(here, '../pages/records/[id].astro'), 'utf8');
		assert.match(astro, /placeOnRunway\(/);
		assert.match(astro, /readTrackOffset\(/);
		assert.match(astro, /cameraBox\([\s\S]*visual\.cropT/);
		assert.match(astro, /visual\.leadersOpacity/);
		assert.match(astro, /1 - visual\.leadersOpacity/);
		assert.match(astro, /visual\.notesOpacity/);
		assert.match(astro, /DETAIL_CROSSFADE_MS/);
		assert.match(astro, /data-pace/);
		assert.match(astro, /upright\.style\.right\s*=\s*['"]auto['"]/);
		assert.match(astro, /upright\.style\.bottom\s*=\s*['"]auto['"]/);
		assert.doesNotMatch(astro, /progressFromAnchors/);
		assert.doesNotMatch(astro, /lerpBox/);
		assert.doesNotMatch(astro, /angleDeg/);
		assert.doesNotMatch(astro, /itinerary/);
	});
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --experimental-strip-types --test src/data/split-stage.test.ts`  
Expected: FAIL in `itinerary scroll helpers` (`function progressFromAnchors` still in the module, or `placeOnRunway(` missing from the page).

- [ ] **Step 3: Delete the row driver and wire the runway**

Delete these functions from `src/data/split-stage.ts`: `progressFromAnchors`, `nearestRowIndex`, `activeDetailIndex`, `activationLineY`, `scrollTopForAnchor`, `shouldSettle`. Do not delete `shouldSettleRunway`.

Replace `applyFrame` in the page script:

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
    const box = cameraBox(
      plate.clientWidth,
      plate.clientHeight,
      upright.naturalWidth,
      upright.naturalHeight,
      crop,
      visual.cropT,
    );
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
  if (plate) plate.style.opacity = String(visual.plateOpacity);
  if (graphics) graphics.style.opacity = String(visual.boxesOpacity);
  if (leaders) {
    leaders.style.opacity = visual.leadersOpacity > 0 ? '1' : '0';
    frame.querySelectorAll<SVGLineElement>('.mark-leader').forEach((line) => {
      line.setAttribute('pathLength', '1');
      line.setAttribute('stroke-dasharray', '1');
      line.setAttribute('stroke-dashoffset', String(1 - visual.leadersOpacity));
    });
  }
  if (notes) notes.style.opacity = String(visual.notesOpacity);
}
```

`maxWidth` / `maxHeight` of `none` repeat the `.upright` rule so a later `img` rule cannot squash the zoom. Do not read `angleDeg`. Do not call `Element.animate`. Do not set `transform` on the upright. The note entrance is opacity on `.mark-list`. Do not translate `.mark-list` or `.mark-note`; `position()` owns `top`.

Replace the Task 2 `bindSplit` stub. The script import becomes:

```ts
import {
  DETAIL_CROSSFADE_MS,
  cameraBox,
  placeOnRunway,
  readTrackOffset,
  stageVisual,
  type RunwayPlace,
} from '../../data/split-stage';
```

```ts
function bindSplit(): void {
  const page = document.querySelector<HTMLElement>('.record-page--split');
  if (!page) return;
  const runway = page.querySelector<HTMLElement>('.camera-runway');
  const read = page.querySelector<HTMLElement>('.split-read');
  const track = page.querySelector<HTMLElement>('.split-read-track');
  const frames = [...page.querySelectorAll<HTMLElement>('.split-frame')];
  if (!runway || frames.length === 0) return;

  const motionOk = () => document.documentElement.dataset.motion === 'ok';
  let ticking = false;

  const localFor = (frameIndex: number, place: RunwayPlace): number => {
    if (place.joint > 0 && frameIndex === place.outgoing) return 1;
    if (frameIndex === place.index) return place.local;
    if (frameIndex < place.index) return 1;
    return 0;
  };

  const clearScrubStyles = () => {
    if (track) track.style.transform = '';
    for (const frame of frames) {
      frame.style.transitionDuration = '0s';
      frame
        .querySelectorAll<HTMLElement>('.upright-clip, .upright, .plate, .mark-graphics, .mark-leaders, .mark-list')
        .forEach((node) => {
          node.style.opacity = '';
        });
      frame.querySelectorAll<HTMLImageElement>('.upright').forEach((node) => {
        node.style.left = '';
        node.style.top = '';
        node.style.width = '';
        node.style.height = '';
        node.style.right = '';
        node.style.bottom = '';
      });
    }
  };

  const showSettled = () => {
    clearScrubStyles();
    if (read) read.dataset.pace = 'pin';
    for (const frame of frames) {
      frame.classList.add('is-active');
      frame.inert = false;
      frame.removeAttribute('aria-hidden');
      frame.style.transitionDuration = '0s';
    }
  };

  const armFade = () => {
    const duration = motionOk() ? `${DETAIL_CROSSFADE_MS}ms` : '0s';
    for (const frame of frames) {
      frame.style.transitionProperty = 'opacity';
      frame.style.transitionDuration = duration;
      frame.style.transitionTimingFunction = 'linear';
    }
  };

  const geometry = () => {
    const rect = runway.getBoundingClientRect();
    const travel = runway.offsetHeight - window.innerHeight;
    const p = travel <= 0 ? 1 : Math.min(1, Math.max(0, -rect.top / travel));
    return { rect, travel, p };
  };

  const setActive = (index: number) => {
    frames.forEach((frame, frameIndex) => {
      const on = frameIndex === index;
      frame.classList.toggle('is-active', on);
      frame.inert = !on;
      if (on) frame.removeAttribute('aria-hidden');
      else frame.setAttribute('aria-hidden', 'true');
    });
  };

  const applyAll = () => {
    if (!motionOk()) {
      showSettled();
      return;
    }
    const { p } = geometry();
    const place = placeOnRunway(p, frames.length);
    setActive(place.index);
    if (read && track) {
      const offset = readTrackOffset(p, track.scrollHeight, read.clientHeight);
      read.dataset.pace = offset === 0 ? 'pin' : 'pace';
      track.style.transform = offset === 0 ? '' : `translateY(${-offset}px)`;
    }
    frames.forEach((frame, frameIndex) => {
      if (frame.dataset.notes === 'aligned') {
        try {
          position(frame);
        } catch {
          /* keep the last leader placement */
        }
      }
      applyFrame(frame, localFor(frameIndex, place));
    });
  };

  const onScroll = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      ticking = false;
      applyAll();
    });
  };

  const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  motionQuery.addEventListener('change', () => {
    document.documentElement.dataset.motion = motionQuery.matches ? 'reduce' : 'ok';
    if (motionQuery.matches) clearScrubStyles();
    else armFade();
    applyAll();
  });

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', applyAll);
  armFade();
  applyAll();
}
```

Leave `init`’s `prefers-reduced-motion` listener in place. It still writes `dataset.motion` for pages that never call `bindSplit`. Do not remove it.

Do not write frame opacity from `place.joint`. `setActive(place.index)` plus `armFade` is the crossfade. During the joint, `place.index` is the incoming frame and `localFor` holds it at `0`.

- [ ] **Step 4: Run the tests and the build**

Run: `node --experimental-strip-types --test src/data/split-stage.test.ts && npm run check && npm run build`  
Expected: `# fail 0`, check PASS, build PASS.

```bash
test "$(grep -c 'runTimeline' 'src/pages/records/[id].astro')" -eq 0
test "$(grep -c 'mark-leader' dist/records/mhjl329/index.html)" -eq 0
test "$(grep -c '原片扶正' dist/records/mhjl329/index.html)" -eq 0
test "$(grep -c 'GREAT TRACKS 标' dist/records/mhjl329/index.html)" -ge 1
test "$(grep -c '1988 年夏天，大江千里二十八岁' dist/records/mhjl329/index.html)" -eq 1
```

Expected: every `test` exits 0. `mark-leader` is 0 because MHJL 329 has no `marks.note`.

- [ ] **Step 5: Manual scroll check**

Run: `npm run dev -- --host 127.0.0.1 --port 4321`  
Open `http://127.0.0.1:4321/records/mhjl329/` at 1280×800.

1. The photograph is on the left, sticky, about one viewport tall. 题铭, 记述, and 著录 are on the right. There is no 原片扶正 / 裁进板心 / 标出要点 / 读注 row and no tall blank slip.
2. At the start of the runway the sticky image is the upright label in the plate frame. Scrolling zooms it with a top-down move into the label crop. The plate stays hidden until that zoom has finished, then the plate replaces the upright and the burgundy boxes light. There is no leader and no sentence on the photograph. Scrolling back restores the upright.
3. `.split-read` has `data-pace="pace"`. At the start of the runway the tombstone is in view. At the end of the runway the bottom of the reading column (the 待补拍 fold) is in view. The text has moved evenly with the photograph; it does not have its own row stops.
4. The ① lines (`GREAT TRACKS 标`, `MHJL 329`, …, and the 腰封 lines) are in the right column. The headings `A 面标签 · ①–⑥` and `腰封 · ①–⑥` are absent.
5. After the label pass, the sticky photograph crossfades to the cover upright over about 1.6 seconds, then that pass zooms and boxes the waistband. The page is one scroll. There is no second fullscreen runway.
6. Open `http://127.0.0.1:4321/records/ml4001/`. The hero is on the left and the text is on the right. There is no `.camera-runway`.

Pin check, without editing source or `records.json`: in the console run `document.querySelector('.split-read-track').style.display = 'none'`, scroll the runway, and confirm `.split-read` is `data-pace="pin"` and the track has no `translateY`. Reload afterward.

Narrow check at 390×844: the photograph is a sticky band about 58svh, and the text occupies the band below it. Scrolling still runs the same camera. At 390×500 the photograph is about 42svh and the text band is the rest of the viewport. The runway still scrubs the camera.

- [ ] **Step 6: Commit**

```bash
git add src/data/split-stage.ts src/data/split-stage.test.ts 'src/pages/records/[id].astro'
git commit -m "feat(records): scrub the camera runway and pace the reading column"
```

---

### Task 5: Soft-settle on camera keypoints

**Files:**
- Modify: `src/pages/records/[id].astro` `<script>` (`bindSplit` only)
- Modify: `src/data/split-stage.test.ts`
- Test: `src/data/split-stage.test.ts`

**Interfaces:**
- Consumes: Task 1 `nearestSettlePlace`, `runwayScrollY`, `shouldSettleRunway`, `SETTLE_EPSILON_PX`, `SETTLE_IDLE_MS`, `SETTLE_LOCK_MS`, `SETTLE_SLACK_PX`. Task 4 `geometry`, `applyAll`, `motionOk`, `runway`, `frames`.
- Produces: on scroll idle, smooth-scroll to the document Y of the nearest camera keypoint. No settle while the pointer is down, while a settle is already running, while motion is reduced, or while `shouldSettleRunway` is false. The page does not query `.itinerary-row`.

- [ ] **Step 1: Write the failing test**

Add to the `itinerary scroll helpers` test in `src/data/split-stage.test.ts`, inside the existing `it(...)` after the `itinerary` assertion:

```ts
assert.match(astro, /nearestSettlePlace\(/);
assert.match(astro, /runwayScrollY\(/);
assert.match(astro, /shouldSettleRunway\(/);
assert.doesNotMatch(astro, /settleToRow/);
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --experimental-strip-types --test src/data/split-stage.test.ts`  
Expected: FAIL because `nearestSettlePlace(` is absent from `[id].astro`.

- [ ] **Step 3: Arm the idle settle inside `bindSplit`**

Extend the script import from `../../data/split-stage` with `SETTLE_EPSILON_PX`, `SETTLE_IDLE_MS`, `SETTLE_LOCK_MS`, `SETTLE_SLACK_PX`, `nearestSettlePlace`, `runwayScrollY`, `shouldSettleRunway`.

Change Task 4’s `geometry` so settle can read the runway’s document top:

```ts
const geometry = () => {
  const rect = runway.getBoundingClientRect();
  const travel = runway.offsetHeight - window.innerHeight;
  const pageTop = rect.top + window.scrollY;
  const p = travel <= 0 ? 1 : Math.min(1, Math.max(0, -rect.top / travel));
  return { rect, travel, pageTop, p };
};
```

`applyAll` keeps using `p` only. `pageTop` is for settle.

After `const motionOk = ...`, add:

```ts
let pointerDown = false;
let settling = false;
let idleTimer = 0;

const settleToKeypoint = () => {
  if (!motionOk() || pointerDown || settling) return;
  const { rect, travel, pageTop, p } = geometry();
  if (!shouldSettleRunway(rect.top, rect.bottom, window.innerHeight, SETTLE_SLACK_PX)) return;
  if (travel <= 0) return;
  const notes = frames.map((frame) => frame.dataset.notes === 'aligned');
  const target = nearestSettlePlace(p, frames.length, notes);
  const top = runwayScrollY(pageTop, travel, frames.length, target.index, target.local);
  if (Math.abs(top - window.scrollY) <= SETTLE_EPSILON_PX) return;
  settling = true;
  window.scrollTo({ top, behavior: 'smooth' });
  window.setTimeout(() => {
    settling = false;
  }, SETTLE_LOCK_MS);
};
```

Replace Task 4’s `onScroll` with:

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
  idleTimer = window.setTimeout(settleToKeypoint, SETTLE_IDLE_MS);
};
```

After `window.addEventListener('scroll', onScroll, { passive: true })`, add:

```ts
window.addEventListener('pointerdown', () => {
  pointerDown = true;
  window.clearTimeout(idleTimer);
});
window.addEventListener('pointerup', () => {
  pointerDown = false;
  if (!motionOk()) return;
  window.clearTimeout(idleTimer);
  idleTimer = window.setTimeout(settleToKeypoint, SETTLE_IDLE_MS);
});
window.addEventListener('pointercancel', () => {
  pointerDown = false;
});
```

In the Task 4 `motionQuery` listener, when `motionQuery.matches` is true, also `window.clearTimeout(idleTimer)` and set `settling = false` before `clearScrubStyles()`.

Do not query `.itinerary-row`. Do not snap to `{0, 0.55, 0.75, 1}`. A detail with `data-notes !== 'aligned'` has no notes keypoint; `nearestSettlePlace` already encodes that.

- [ ] **Step 4: Checks and manual dwell**

Run: `node --experimental-strip-types --test src/data/split-stage.test.ts && npm run check && npm run build`  
Expected: `# fail 0`, check PASS, build PASS.

With `npm run dev -- --host 127.0.0.1 --port 4321` and `/records/mhjl329/` at 1280×800:

1. Scroll into the middle of the label zoom and release the pointer. Within a short beat the page eases to a camera keypoint: upright hold, zoom complete (cropped upright, plate still hidden), plate settled, or boxes lit. It does not park on a blank text gap. A held wheel does not stutter.
2. Release during the joint between the label and the waistband. The page eases either back to the finished label plate or forward to the cover upright. It does not stop halfway through a zoom.
3. Crossing into the waistband still crossfades the sticky photograph over about 1.6 seconds. The incoming image is the cover upright. The cover zoom starts after that hold, not under the fade. Scroll up: the label plate returns the same way.
4. Reload with `prefers-reduced-motion: reduce`. The page is only as tall as the text and the plates. Both finished plates are in the left column (label, then cover), with burgundy boxes and no upright crop. The right column is normal flow (`data-pace="pin"`, no `translateY`). Scrolling does not crop. `/records/ml4001/` is still the old split.

Narrow check at 390×844 and 390×500 still scrubs from the camera, with the text band under the photograph. Reduced motion at 390×844 stacks the finished plates above the text and does not add runway height.

- [ ] **Step 5: Commit**

```bash
git add 'src/pages/records/[id].astro' src/data/split-stage.test.ts
git commit -m "feat(records): settle the camera runway on keypoints"
```

---

### Task 6: Acceptance pass

**Files:** none new. Verify. If a check fails, fix it in the file that check names and commit `fix(records): <what the check caught>` before continuing.

**Interfaces:**
- Consumes: Tasks 1–5.
- Produces: a passing acceptance check against the spec’s seven bullets.

- [ ] **Step 1: Run the automated checks**

```bash
node --experimental-strip-types --test src/data/split-stage.test.ts
npm run check && npm run build
```

Expected: `# fail 0`, check PASS, build PASS.

```bash
test "$(grep -c 'record-page--split' dist/records/mhjl329/index.html)" -eq 1
test "$(grep -c 'camera-runway' dist/records/mhjl329/index.html)" -eq 1
test "$(grep -c 'split-read-track' dist/records/mhjl329/index.html)" -eq 1
test "$(grep -c 'itinerary-' dist/records/mhjl329/index.html)" -eq 0
test "$(grep -c '原片扶正' dist/records/mhjl329/index.html)" -eq 0
test "$(grep -c '裁进板心' dist/records/mhjl329/index.html)" -eq 0
test "$(grep -c '标出要点' dist/records/mhjl329/index.html)" -eq 0
test "$(grep -c '全幅' dist/records/mhjl329/index.html)" -eq 0
test "$(grep -c '板心' dist/records/mhjl329/index.html)" -eq 0
test "$(grep -o '读注' dist/records/mhjl329/index.html | wc -l)" -eq 0
test "$(grep -c 'A 面标签 · ' dist/records/mhjl329/index.html)" -eq 0
test "$(grep -c '腰封 · ' dist/records/mhjl329/index.html)" -eq 0
test "$(grep -c 'reveal-runway' dist/records/mhjl329/index.html)" -eq 0
test "$(grep -c 'entry-hero' dist/records/mhjl329/index.html)" -eq 0
test "$(grep -c 'mark-leader' dist/records/mhjl329/index.html)" -eq 0
test "$(grep -c 'mark-box' dist/records/mhjl329/index.html)" -ge 1
test "$(grep -c 'GREAT TRACKS 标' dist/records/mhjl329/index.html)" -ge 1
test "$(grep -c '40th Anniversary Senri Oe' dist/records/mhjl329/index.html)" -ge 1
test "$(grep -c '1988 年夏天，大江千里二十八岁' dist/records/mhjl329/index.html)" -eq 1
test "$(grep -c 'aria-label="著录"' dist/records/mhjl329/index.html)" -ge 1
test "$(grep -c 'record-page--split' dist/records/ml4001/index.html)" -eq 0
test "$(grep -c 'record-split' dist/records/ml4001/index.html)" -ge 1
test "$(grep -c 'camera-runway' dist/records/ml4001/index.html)" -eq 0
test "$(grep -c 'runTimeline' 'src/pages/records/[id].astro')" -eq 0
test "$(grep -c 'itinerary' 'src/pages/records/[id].astro' src/styles/global.css src/data/split-stage.ts)" -eq 0
test "$(grep -c 'function cameraBox' src/data/split-stage.ts)" -eq 1
test "$(grep -c 'lerpBox' src/data/split-stage.ts 'src/pages/records/[id].astro')" -eq 0
git diff --name-only main -- src/data/detail-display.ts src/data/records.json src/data/records.ts src/pages/records.astro
```

Expected: every `test` exits 0. The `git diff --name-only` prints nothing. `grep -c` on a missing pattern prints `0` and exits 1; wrap those in `test "$(…)" -eq 0` as above. The story still contains the words `腰封` and `A 面标签` inside prose; the forbidden strings are the caption forms with ` · `.

- [ ] **Step 2: Walk the spec acceptance list in the browser**

Dev server: `npm run dev -- --host 127.0.0.1 --port 4321`.

| # | Check | How |
|---|---|---|
| 1 | Desktop sticky imagery on the left, 记述 + 著录 on the right, no itinerary and no tall blank scrub chrome | 1280×800, `/records/mhjl329/`. Left photo and right text are on screen together. Document has no `.itinerary-row`. |
| 2 | Scroll reversibly drives upright → `cameraBox` crop → plate → boxes → on-image notes, notes only when note text exists | Scroll down and back through the label pass. Plate stays hidden until the zoom finishes. Boxes light after the plate. No leaders on this record. Scroll back to the upright. |
| 3 | Short text pins; long text paces on the same `p` | MHJL’s column is `data-pace="pace"` and the tombstone at `p = 0` becomes the 待补拍 end at `p = 1`. The console `display: none` check from Task 4 leaves `data-pace="pin"` and no `translateY`. Reload after that check. |
| 4 | Narrow image above text, no empty itinerary, runway still follows the camera | 390×844 and 390×500. Photo on top, text underneath, same zoom. |
| 5 | Reduced motion is the final plate + boxes (+ notes if any) and does not scrub | Reload with `prefers-reduced-motion: reduce`. No extra runway, no crop, no 1.6s fade. Both plates show their boxes. |
| 6 | Legacy records and 记述 copy are unchanged | `/records/ml4001/` has `.record-split` and no `.record-page--split`. The MHJL story opening is still `1988 年夏天，大江千里二十八岁`. |
| 7 | The page reads as the photograph’s crop and its on-image callouts, with the story and the catalog on the right | Stage labels do not fill the whitespace. The right column is 题铭, the ① lines, 记述, 著录, and the folds. |

Also confirm a joint crossfade of about 1.6s between the label and the waistband, and an idle ease onto a camera keypoint rather than a text row.

- [ ] **Step 3: Open the implementation PR from `main`**

The PR branch must descend from `main`. Title: `feat(records): Approach A camera runway`. Body links this plan and the Approach A spec. State that the asset protocol, `records.json`, 记述, `cameraBox`, and `.record-split` are unchanged, and that no `marks.note` copy was invented.

---

## Spec coverage self-check

| Spec / acceptance item | Task |
|---|---|
| Desktop left sticky imagery, right reading column; remove `grid-column: 2` on `.split-imagery` | 2, 3 |
| Reading order 题铭 → 记述 → 著录 → folds, measure `max-width: 46ch`, type not retuned | 2, 3 |
| `visibleDetailText` remainder stays as prose, no tall `min-height`, does not drive `p` | 2, 4 |
| Remove `STAGE_ROWS`, `.itinerary-section`, `.itinerary-rows`, the four labels, and per-detail scrub headings | 2, 3, 6 |
| Invisible runway sized to the camera (`PASS_SVH` 140, `JOINT_SVH` 28, base `100svh`) | 1, 3, 4 |
| Scroll maps to upright hold → `cameraBox` zoom → plate → boxes → fade-settle notes, reversibly | 1, 4 |
| Plate hidden until `cropT` is 1; no second easing on `t`; no `lerpBox`; no `angleDeg` | 1, 4 |
| `cameraBox` formula and its tests unchanged | 1, 6 |
| Leaders draw, then note text fades; no invented note; notes stay off the right column | 1, 2, 4 |
| Short text pins; long text paces evenly on the same `p` | 1, 4 |
| Narrow: image above text; runway still camera-driven; `58svh` / `42svh` image | 3, 4, 6 |
| Soft-settle to camera keypoints; skip notes when `data-notes` is not `aligned`; `SETTLE_*` reused | 1, 5 |
| One runway; `DETAIL_CROSSFADE_MS` 1600 at the joint; incoming held at upright until the joint ends | 1, 4, 5 |
| Reduced motion: end state, no extra runway height, no scrub, reading column in normal flow | 3, 4, 5 |
| Legacy `.record-split` and `/records/ml4001/` unchanged | 2, 3, 6 |
| 记述, `records.json`, YAML, list, loupe, tombstone unchanged | Global, 2, 6 |
| `detail-display.ts` unchanged | Global, 6 |
| Warm paper tokens unchanged; no scroll library | Global, 3 |
| Acceptance bullets 1–7 | 6 |
| Primary URL `/records/mhjl329/` | 4, 5, 6 |

## Out of scope (do not implement here)

- Filling missing `marks.note` / `marks.label`. Do not invent that copy to make leaders appear on MHJL 329.
- Loupe, list crop, tombstone redesign, list-page layout.
- Editing `src/data/records.json`, `src/data/records.ts`, or `src/data/detail-display.ts`.
- Vinyl YAML and the export protocol.
- Rewriting 记述 or any other public sentence.
- Changing the `cameraBox` formula, or adding a second easing curve on its `t`.
- GSAP, Lenis, ScrollTrigger, or any scroll library.
- Restyling the site onto another palette, or renaming `split-stage.ts`.
- A second fullscreen chapter, a second progress clock for the text, or merging itinerary chrome back in.
- Rendering `record.image` / `.entry-hero` inside the reveal page. The list page still uses the cover.
