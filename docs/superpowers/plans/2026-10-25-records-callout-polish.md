# Callout polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On `.record-page--split`, the mark box alone marks the region, each note shows its mark-order index, a split-frame leader meets that note on a horizontal stub or is omitted, a narrow side strip takes plate overlay, and the settled mobile imagery pane shrinks to the plate plus those notes.

**Architecture:** Task 0 freezes the shared names on one commit: note prefix and callout mode, the split-frame leader API, `settledImageryHeight`, the fixture objects, the existing `.split-frame` size container, and `--imagery-h`. Lanes A, B, and C are cut from that commit and do not share a write path. Lane A places notes, prefixes them, and drops split-frame discs. Lane B builds the stub path and drops crossings. Lane C computes `contentH`. Serial waits until Lane A and Lane C are on the integration branch, then writes the settled pane into `src/pages/records/[id].astro` without calling `plateBox` again. Integration is the one live check.

**Tech Stack:** Astro static pages, vanilla TypeScript in the page `<script>`, CSS custom properties, pure helpers tested with `node:test`. No scroll library. This package has no `npm test` script. The records check is `node --experimental-strip-types --test`, then `npm run check`, then `npm run build`. Node `>=22.23.4`. `1rem` = 18px when the initial font is 16px (`html` is `font-size: 112.5%`).

**Spec:** [`docs/superpowers/specs/2026-10-25-records-callout-polish-design.md`](../specs/2026-10-25-records-callout-polish-design.md)

**Checked against:** `main` at `8fb591e` (spec squash `#46`). Code reality is the shipped contain-fill page: `src/pages/records/[id].astro`, `src/styles/global.css`, `src/data/detail-display.ts`, `src/data/detail-display.test.ts`, `src/data/split-stage.ts`. Do not edit `src/data/split-stage.ts`, `src/data/split-stage.test.ts`, `src/data/records.json`, `src/data/records.ts`, or `public/records/**`.

**Contracts:** Task 0, on one screen.

- Exports: `noteIndexPrefix(index: number): string`, `splitCalloutMode(args: SplitCalloutArgs): CalloutMode | null`, `CALLOUT_ATTR`, `leaderEntersNoteInterior`, `polylinesProperlyCross`, `splitLeaderPath`, `selectSplitLeaders`, `settledImageryHeight`. `placeNotes` gains optional `narrow?: boolean` and does not read it yet.
- DOM hooks: existing `.split-frame` (script writes `data-callout` later), existing `.mark-box`, existing `.mark-index`, existing `.mark-leader` / `.mark-leader-mask`. Server HTML does not gain `data-callout`.
- CSS: `.record-page--split` owns `--imagery-h` (initial `58svh`; `42svh` in the existing short-height query). `.record-page--split .split-frame` owns the size container (`container-type: size`). No second container. No renamed variable.
- Fixtures: `phoneMhjl329`, `deskMhjl329`, `workedLeader`, `legacyRecordId`.

**Lanes:** each cut from the Task 0 commit. A sibling review does not gate another lane.

- Lane A — overlay, index, discs. Writes `src/data/callout-notes.ts`, `src/data/callout-notes.test.ts`, `src/data/detail-display.ts`, `src/data/detail-display.test.ts`, `src/pages/records/[id].astro`, `src/styles/global.css`.
- Lane B — split-frame stub and crossing omit. Writes `src/data/split-leaders.ts`, `src/data/split-leaders.test.ts`.
- Lane C — `contentH` math. Writes `src/data/settled-pane.ts`, `src/data/settled-pane.test.ts`.

**Serial:** one owner, after Lane A and Lane C have merged onto the integration branch. Writes `src/pages/records/[id].astro` and `src/data/callout-settle.source.test.ts`. Does not edit `src/styles/global.css`. Lane B may merge before or with them; Serial does not edit Lane B's files. Then one Integration checkpoint: `/records/mhjl329/` at 390×844 and 1440×900, `/records/ml4001/` unchanged, `npm run check`, `npm run build`.

**Branch:** cut the implementation branch from `main` after this plan is on `main`. Do not implement these tasks on the docs branch. `spec-ok-merge-plan-ship` is already granted. When this plan is on `main`, start Task 0, and when that commit is on the implementation branch start Lanes A, B, and C in the same turn. Do not ask which execution mode to use. Do not brainstorm the spec again.

Do not number Lane A, Lane B, and Lane C as Task 1, Task 2, and Task 3. Inside a lane the order is A1 then A2 then A3, B1 then B2, and C1. Serial starts only after Lane A and Lane C are merged. Integration starts only after Serial.

## Global Constraints

Copied verbatim from the locked spec. Every task includes this section.

- **No numbered badges on mark boxes** by default. The red crop/mark box alone marks the region.
- **Index lives on the note text** (prefix ①②… or equivalent before each note).
- **Leaders own box→note**: elbow dashed leaders must clearly terminus into the note’s inner edge (short horizontal stub into the note). If a leader would cross another or cannot meet its note cleanly, **omit** that leader rather than draw a confusing path.
- **Mobile**: prefer **plate overlay** (paper-scrim notes on/over the plate, overlay-no-gutter) when side strips are too narrow — do **not** prefer letterbox scatter. Desktop keeps margin/letterbox-first notes as today (φ split unchanged).
- **Collapse imagery pane height** on mobile after settle to roughly plate + overlaid notes so the blank gap before 记述 disappears. Do not force a tall empty `--imagery-h` / 100svh band once notes are placed.
- Desktop φ imagery:reading and contain-fill → smaller centered plate camera motion are **out of scope** (already shipped).
- Split frames do not paint `.mark-disc` or `.mark-num`.
- The visible index is the note prefix from mark order. `records.json` has no new index field. `marks[].note` bytes stay.
- A split-frame leader ends at `T` on a horizontal stub, or it is omitted. It is not left `0.35rem` short, and it is not given an extra corner to avoid a cross.
- Below `48rem`, a strip under `6.5rem` uses overlay-no-gutter. Those notes are not in the letterbox.
- At `min-width: 48rem`, margin then letterbox then scrim stays. Tracks stay `1.618fr` / `1fr`.
- Settled mobile `--imagery-h` is `contentH`. It is not `58svh`, `42svh`, or `100svh` after notes are placed. `contentH` does not exceed the stylesheet pane.
- `S` after the collapse equals `S` from the tall pane. `cameraBox`, `openingBox`, `plateBox`, and `stageVisual` are not edited.
- The reading column does not repeat the prefixed notes.
- Palette stays the current tokens. Scrim background is `var(--bg)`. Box and leader stroke stay `var(--accent)`.
- Legacy `.record-split`, including ml4001, keeps its discs, its `9.5rem` slots, and the shipped elbow.

Locked numbers from the same spec, copied as written there:

- Index `1`–`20` uses `①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳`. Index `21` and above uses a parenthesized decimal, `(21)`.
- Prefix, one space, then `marks.note`. Type stays `0.78rem` / line-height `1.45` / `var(--text)`.
- `MIN_NOTE_REM` stays `6.5`. `MIN_BAND_REM` stays `2.6`. `NOTE_CAP_REM` stays `9.5`. `NOTE_GAP_REM` stays `0.35`. `SCRIM_INSET_REM` stays `0.55`.
- Dash stays `stroke-dasharray: 6 5`. `stroke-width: 1`. Butt caps. Miter join. Miter limit `2`.
- Stub in plate pixels: `gap >= 32` → `16`; `4 <= gap < 32` → `gap / 2`; `gap < 4` → no stub. `gap` is signed toward the note.
- Worked points: `(100, 40)`, `(116, 40)`, `(184, 70)`, `(200, 70)`.
- `pad = 0.75rem`. Worked 390×844 settled heights: label `282px`, cover `185px`, from frozen plates `255×255` and `255×158`. A `2px` difference still passes.
- `UPRIGHT_END`, `ZOOM_END`, `PLATE_END`, `BOXES_END`, `LEADERS_END`, `PASS_SVH`, `JOINT_SVH`, and `DETAIL_CROSSFADE_MS` stay. `plateBox` factors stay `0.72` / `1.25` / `0.92`.
- Legacy elbow still ends `0.35rem` short and may still cross. `leaderEndpoints` stays.

## File map

| Path | Owner | Responsibility |
|------|--------|----------------|
| `src/data/callout-polish-fixtures.ts` | Task 0 | Spec rows. Later tasks read this file and do not edit it. |
| `src/data/callout-notes.ts` | Task 0 stub, Lane A body | `noteIndexPrefix`, `splitCalloutMode`, `CALLOUT_ATTR`. |
| `src/data/split-leaders.ts` | Task 0 stub, Lane B body | Stub path, interior test, proper cross, index-order omit. |
| `src/data/settled-pane.ts` | Task 0 stub, Lane C body | `settledImageryHeight`. |
| `src/data/callout-polish.contract.test.ts` | Task 0 | Exports, fixture field types, size-container selector, `--imagery-h` owner. No formula results. |
| `src/data/detail-display.ts` | Task 0 adds `narrow?`, Lane A reads it | `placeNotes` skips the letterbox when `narrow` is true and stops dodging discs. `leaderEndpoints` stays. |
| `src/data/detail-display.test.ts` | Lane A | Narrow overlay cases beside the existing desktop letterbox cases. |
| `src/data/callout-notes.test.ts` | Lane A | Prefix and `splitCalloutMode`. |
| `src/data/split-leaders.test.ts` | Lane B | Worked four-point path and the omit rules. |
| `src/data/settled-pane.test.ts` | Lane C | `282` and `185`, and the cap at the pane. |
| `src/pages/records/[id].astro` | Lane A, then Serial | Lane A: split-frame markup, `data-callout`, `writeSplitLeaders`. Serial: clear-before-measure, `collapseToContent`, notes-beat write. |
| `src/styles/global.css` | Lane A | Unclip `.mark-index` inside `.split-frame .mark-note` only. |
| `src/data/callout-settle.source.test.ts` | Serial | Source lock: no second `plateBox` inside the collapse, clear before `layoutSplit`. |

---

### Task 0: Contract surfaces

**Files:**
- Create: `src/data/callout-polish-fixtures.ts`
- Create: `src/data/callout-notes.ts`
- Create: `src/data/split-leaders.ts`
- Create: `src/data/settled-pane.ts`
- Create: `src/data/callout-polish.contract.test.ts`
- Modify: `src/data/detail-display.ts` (the `placeNotes` args type only)
- Test: `src/data/callout-polish.contract.test.ts`

**Interfaces:**
- Consumes: `placeNotes` as it exists on `main` at `8fb591e`, `LeaderPoint` from `src/data/detail-display.ts`, `MIN_NOTE_REM`, the existing `.record-page--split { --imagery-h: 58svh; }` rule, and `.record-page--split .split-frame { container-type: size; }`.
- Produces: the four surfaces below. Lane implementers copy the signature block they consume. Do not rename these exports.

```ts
export const CALLOUT_ATTR = 'data-callout';
export const IMAGERY_VAR = '--imagery-h';
export const SIZE_CONTAINER_SELECTOR = '.record-page--split .split-frame';

export type CalloutMode = 'margin' | 'overlay-no-gutter';

export type SplitCalloutArgs = {
	narrow: boolean;
	stripPx: number;
	rem: number;
	placements: readonly { kind: 'side' | 'letterbox' | 'scrim' }[];
};

export function noteIndexPrefix(index: number): string {
	void index;
	throw new Error('Not implemented: noteIndexPrefix');
}

export function splitCalloutMode(args: SplitCalloutArgs): CalloutMode | null {
	void args;
	throw new Error('Not implemented: splitCalloutMode');
}

export type PlateRect = {
	left: number;
	right: number;
	top: number;
	bottom: number;
};

export type SplitMark = { x: number; y: number; w: number; h: number };

export type SplitLeaderInput = {
	index: number;
	mark: SplitMark;
	side: 'left' | 'right';
	note: PlateRect;
	omitLeader: boolean;
};

export type SplitLeaderResult = {
	index: number;
	points: LeaderPoint[] | null;
};

export function leaderEntersNoteInterior(
	points: readonly LeaderPoint[],
	note: PlateRect,
): boolean {
	void points;
	void note;
	throw new Error('Not implemented: leaderEntersNoteInterior');
}

export function polylinesProperlyCross(
	left: readonly LeaderPoint[],
	right: readonly LeaderPoint[],
): boolean {
	void left;
	void right;
	throw new Error('Not implemented: polylinesProperlyCross');
}

export function splitLeaderPath(args: {
	mark: SplitMark;
	side: 'left' | 'right';
	note: PlateRect;
}): LeaderPoint[] | null {
	void args;
	throw new Error('Not implemented: splitLeaderPath');
}

export function selectSplitLeaders(items: readonly SplitLeaderInput[]): SplitLeaderResult[] {
	void items;
	throw new Error('Not implemented: selectSplitLeaders');
}

export function settledImageryHeight(args: {
	paneHeight: number;
	plate: { top: number; bottom: number };
	notes: readonly { top: number; bottom: number }[];
	padPx: number;
}): number {
	void args;
	throw new Error('Not implemented: settledImageryHeight');
}

function placeNotes(args: {
	pane: PxSize;
	plate: FrameBox;
	plateSize: PxSize;
	rem: number;
	notes: readonly NoteDraft[];
	narrow?: boolean;
}): NotePlacement[] {
	const { pane, plate, plateSize, rem, notes } = args;
	// The rest of the current body stays. Task 0 does not read `narrow`.
}
```

`placeNotes` is already exported. Task 0 only adds `narrow?: boolean` to that args type. The destructure stays `const { pane, plate, plateSize, rem, notes } = args` so the new field is not read.

DOM and data hooks, already in the page, which Task 0 does not re-create:

- `.split-frame` is the measured frame and the element Lane A writes `data-callout` onto. Server HTML does not include the attribute. Desktop and no-JS do not need it.
- `.mark-box` stays the region. `.mark-disc` and `.mark-num` stay in the legacy `.record-split` tree and in the non-reveal figures inside `.split-read`. Lane A removes them only from the `.split-stage` copy.
- `.mark-index` is the prefix hook. Lane A moves it into `.mark-note` on split frames and unclips that copy. The global clipped rule stays for legacy.
- `.mark-leader` and `.mark-leader-mask` stay the stroke and the mask. Lane A’s split path writes `points` from `selectSplitLeaders` or removes `points`.

CSS variables and the size container, already shipped, which Task 0 does not retune:

- `.record-page--split` writes the initial `--imagery-h: 58svh`. The existing `@media (max-width: 47.99rem) and (max-height: 32rem)` rule writes `42svh`. Serial writes the inline pixel value on that same element on the notes beat, and on each `.split-frame` when reduced motion shows every frame.
- Readers of `var(--imagery-h)`: `.split-imagery` (height), `.split-frame` (height), `.split-read` (`top`, `margin-top`, `height`) below `48rem`.
- `.record-page--split .split-frame` is the only size container for that pane (`container-type: size`). A lane must not add `container-type` to `.split-imagery` or to `.plate-frame`.
- At `min-width: 48rem` the imagery and the frame stay `height: 100svh`. That desktop block must not start reading `var(--imagery-h)`. The existing test asserts this.

Fixtures, copied from the spec rows. Task 0 does not assert a formula. Lane C and Lane B assert the geometry against these objects.

```ts
export type PhoneCalloutFixture = {
	id: 'mhjl329';
	viewport: { width: 390; height: 844 };
	rem: 18;
	pane: { width: 354; height: 489.5 };
	stripRem: 2.75;
	padRem: 0.75;
	padPx: 13.5;
	label: { plate: { width: 255; height: 255 }; settledImageryH: 282 };
	cover: { plate: { width: 255; height: 158 }; settledImageryH: 185 };
};

export type DeskCalloutFixture = {
	id: 'mhjl329';
	viewport: { width: 1440; height: 900 };
	rem: 18;
	phi: { min: 1.6; max: 1.64 };
	imageryHeight: '100svh';
	labelStripRem: 8.75;
	coverStripRem: 6.2;
};

export type WorkedLeaderFixture = {
	gap: 100;
	dash: '6 5';
	points: [
		{ x: 100; y: 40 },
		{ x: 116; y: 40 },
		{ x: 184; y: 70 },
		{ x: 200; y: 70 },
	];
};

export const phoneMhjl329: PhoneCalloutFixture = {
	id: 'mhjl329',
	viewport: { width: 390, height: 844 },
	rem: 18,
	pane: { width: 354, height: 489.5 },
	stripRem: 2.75,
	padRem: 0.75,
	padPx: 13.5,
	label: { plate: { width: 255, height: 255 }, settledImageryH: 282 },
	cover: { plate: { width: 255, height: 158 }, settledImageryH: 185 },
};

export const deskMhjl329: DeskCalloutFixture = {
	id: 'mhjl329',
	viewport: { width: 1440, height: 900 },
	rem: 18,
	phi: { min: 1.6, max: 1.64 },
	imageryHeight: '100svh',
	labelStripRem: 8.75,
	coverStripRem: 6.2,
};

export const workedLeader: WorkedLeaderFixture = {
	gap: 100,
	dash: '6 5',
	points: [
		{ x: 100, y: 40 },
		{ x: 116, y: 40 },
		{ x: 184, y: 70 },
		{ x: 200, y: 70 },
	],
};

export const legacyRecordId = 'ml4001' as const;
```

- [ ] **Step 1: Write the failing contract test**

Create `src/data/callout-polish.contract.test.ts`:

```ts
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import { CALLOUT_ATTR, IMAGERY_VAR, SIZE_CONTAINER_SELECTOR } from './callout-notes.ts';
import { noteIndexPrefix, splitCalloutMode } from './callout-notes.ts';
import {
	leaderEntersNoteInterior,
	polylinesProperlyCross,
	selectSplitLeaders,
	splitLeaderPath,
} from './split-leaders.ts';
import { settledImageryHeight } from './settled-pane.ts';
import {
	deskMhjl329,
	legacyRecordId,
	phoneMhjl329,
	workedLeader,
} from './callout-polish-fixtures.ts';

const here = dirname(fileURLToPath(import.meta.url));

describe('callout polish contract', () => {
	it('exports the stub names and the fixture field types', () => {
		assert.equal(typeof noteIndexPrefix, 'function');
		assert.equal(typeof splitCalloutMode, 'function');
		assert.equal(typeof leaderEntersNoteInterior, 'function');
		assert.equal(typeof polylinesProperlyCross, 'function');
		assert.equal(typeof splitLeaderPath, 'function');
		assert.equal(typeof selectSplitLeaders, 'function');
		assert.equal(typeof settledImageryHeight, 'function');
		assert.equal(CALLOUT_ATTR, 'data-callout');
		assert.equal(IMAGERY_VAR, '--imagery-h');
		assert.equal(SIZE_CONTAINER_SELECTOR, '.record-page--split .split-frame');

		assert.equal(phoneMhjl329.id, 'mhjl329');
		assert.equal(deskMhjl329.id, 'mhjl329');
		assert.equal(legacyRecordId, 'ml4001');
		assert.equal(typeof phoneMhjl329.viewport.width, 'number');
		assert.equal(typeof phoneMhjl329.viewport.height, 'number');
		assert.equal(typeof phoneMhjl329.pane.width, 'number');
		assert.equal(typeof phoneMhjl329.pane.height, 'number');
		assert.equal(typeof phoneMhjl329.rem, 'number');
		assert.equal(typeof phoneMhjl329.padPx, 'number');
		assert.equal(typeof phoneMhjl329.label.plate.width, 'number');
		assert.equal(typeof phoneMhjl329.label.plate.height, 'number');
		assert.equal(typeof phoneMhjl329.label.settledImageryH, 'number');
		assert.equal(typeof phoneMhjl329.cover.plate.width, 'number');
		assert.equal(typeof phoneMhjl329.cover.plate.height, 'number');
		assert.equal(typeof phoneMhjl329.cover.settledImageryH, 'number');
		assert.equal(typeof deskMhjl329.phi.min, 'number');
		assert.equal(typeof deskMhjl329.phi.max, 'number');
		assert.equal(deskMhjl329.imageryHeight, '100svh');
		assert.equal(workedLeader.points.length, 4);
		assert.equal(typeof workedLeader.points[0].x, 'number');
		assert.equal(typeof workedLeader.points[0].y, 'number');
		assert.equal(typeof workedLeader.gap, 'number');
		assert.equal(workedLeader.dash, '6 5');
	});

	it('keeps the size container and the imagery variable where they already live', () => {
		const css = readFileSync(join(here, '../styles/global.css'), 'utf8');
		const astro = readFileSync(join(here, '../pages/records/[id].astro'), 'utf8');
		const source = readFileSync(join(here, 'detail-display.ts'), 'utf8');
		assert.match(css, /\.record-page--split \{\s*--imagery-h: 58svh;\s*\}/);
		assert.match(
			css,
			/\.record-page--split \.split-frame\s*\{[^}]*container-type:\s*size/s,
		);
		const imageryAt = css.indexOf('.record-page--split .split-imagery {');
		assert.ok(imageryAt >= 0);
		const imageryBody = css.slice(imageryAt, css.indexOf('}', imageryAt));
		assert.equal(imageryBody.includes('container-type'), false);
		assert.match(astro, /class:list=\{\['split-frame'/);
		assert.match(source, /narrow\?: boolean/);
		assert.doesNotMatch(astro, /data-callout=/);
	});
});
```

The second test’s `split-imagery` check: the selector `.record-page--split .split-imagery {` exists and that rule’s body, up to its closing brace, does not contain `container-type`. The size container stays on `.split-frame`.

- [ ] **Step 2: Run the contract test and see it fail**

Run: `node --experimental-strip-types --test src/data/callout-polish.contract.test.ts`

Expected: FAIL. Node reports it cannot find `./callout-notes.ts` (`ERR_MODULE_NOT_FOUND`).

- [ ] **Step 3: Add the stubs, the fixture objects, and the `narrow` field**

Create `src/data/callout-polish-fixtures.ts` with the fixture types and the four exports in the Interfaces block (`phoneMhjl329`, `deskMhjl329`, `workedLeader`, `legacyRecordId`). No functions.

Create `src/data/callout-notes.ts`:

```ts
export const CALLOUT_ATTR = 'data-callout';
export const IMAGERY_VAR = '--imagery-h';
export const SIZE_CONTAINER_SELECTOR = '.record-page--split .split-frame';

export type CalloutMode = 'margin' | 'overlay-no-gutter';

export type SplitCalloutArgs = {
	narrow: boolean;
	stripPx: number;
	rem: number;
	placements: readonly { kind: 'side' | 'letterbox' | 'scrim' }[];
};

export function noteIndexPrefix(index: number): string {
	void index;
	throw new Error('Not implemented: noteIndexPrefix');
}

export function splitCalloutMode(args: SplitCalloutArgs): CalloutMode | null {
	void args;
	throw new Error('Not implemented: splitCalloutMode');
}
```

Create `src/data/split-leaders.ts`:

```ts
import type { LeaderPoint } from './detail-display.ts';

export type PlateRect = {
	left: number;
	right: number;
	top: number;
	bottom: number;
};

export type SplitMark = { x: number; y: number; w: number; h: number };

export type SplitLeaderInput = {
	index: number;
	mark: SplitMark;
	side: 'left' | 'right';
	note: PlateRect;
	omitLeader: boolean;
};

export type SplitLeaderResult = {
	index: number;
	points: LeaderPoint[] | null;
};

export function leaderEntersNoteInterior(
	points: readonly LeaderPoint[],
	note: PlateRect,
): boolean {
	void points;
	void note;
	throw new Error('Not implemented: leaderEntersNoteInterior');
}

export function polylinesProperlyCross(
	left: readonly LeaderPoint[],
	right: readonly LeaderPoint[],
): boolean {
	void left;
	void right;
	throw new Error('Not implemented: polylinesProperlyCross');
}

export function splitLeaderPath(args: {
	mark: SplitMark;
	side: 'left' | 'right';
	note: PlateRect;
}): LeaderPoint[] | null {
	void args;
	throw new Error('Not implemented: splitLeaderPath');
}

export function selectSplitLeaders(items: readonly SplitLeaderInput[]): SplitLeaderResult[] {
	void items;
	throw new Error('Not implemented: selectSplitLeaders');
}
```

Create `src/data/settled-pane.ts`:

```ts
export function settledImageryHeight(args: {
	paneHeight: number;
	plate: { top: number; bottom: number };
	notes: readonly { top: number; bottom: number }[];
	padPx: number;
}): number {
	void args;
	throw new Error('Not implemented: settledImageryHeight');
}
```

In `src/data/detail-display.ts`, add one field to the `placeNotes` args type:

```ts
function placeNotes(args: {
	pane: PxSize;
	plate: FrameBox;
	plateSize: PxSize;
	rem: number;
	notes: readonly NoteDraft[];
	narrow?: boolean;
}): NotePlacement[] {
```

Leave the destructure and the body as they are. Do not import the new modules from `detail-display.ts`.

Do not edit `[id].astro` or `global.css` in this task. The hooks and the variable are already there.

- [ ] **Step 4: Run the contract test and see it pass**

Run: `node --experimental-strip-types --test src/data/callout-polish.contract.test.ts`

Expected: PASS. Both tests pass. The test does not call the stubs, so the `Not implemented` throws do not fire.

Also run: `node --experimental-strip-types --test src/data/detail-display.test.ts src/data/split-stage.test.ts`

Expected: PASS. The optional field does not change `placeNotes` results. `leaderEndpoints` is untouched.

- [ ] **Step 5: Commit onto the shared base**

```bash
git add src/data/callout-polish-fixtures.ts src/data/callout-notes.ts src/data/split-leaders.ts src/data/settled-pane.ts src/data/callout-polish.contract.test.ts src/data/detail-display.ts
git commit -m "feat: publish callout polish contract surfaces"
```

Every lane branch is cut from this commit. Do not start a lane on a tree that lacks it.

---
### Lane A — overlay, index, and discs

**Base:** the Task 0 commit. Lane B and Lane C use that same commit.
**Writes:** `src/data/callout-notes.ts`, `src/data/callout-notes.test.ts`, `src/data/detail-display.ts`, `src/data/detail-display.test.ts`, `src/pages/records/[id].astro`, `src/styles/global.css`.
**Reads:** `noteIndexPrefix`, `splitCalloutMode`, `CALLOUT_ATTR`, `placeNotes` with `narrow?: boolean`, `selectSplitLeaders`, `phoneMhjl329`, `legacyRecordId`.
**Done when:** Lane A tests pass on a tree that contains Task 0 and does not contain Lane B’s or Lane C’s bodies. `selectSplitLeaders` may still throw. Lane A’s tests never call it. They only assert the call site is present.

Do not edit `src/data/split-leaders.ts`, `src/data/settled-pane.ts`, `src/data/callout-polish-fixtures.ts`, or `src/data/split-stage.ts`.

Existing source assertions that must stay green after A3:

- `(astro.match(/class="mark-leader"/g) ?? []).length === 3`
- `(astro.match(/class="mark-leader-mask"/g) ?? []).length === 3`
- `(astro.match(/standInLeaderPoints\(mark, detail\.plate\.width\)/g) ?? []).length === 6`
- The file still contains `formatLeaderPoints(points)`, `leader.removeAttribute('points')`, `is-scrim`, `data-omit-leader`, and `position(frame)` inside `const showSettled`.
- The `.split-stage` slice still has no `mark-slot`. The `.record-split` slice still has both slot classes.
- `.mark-leader` in CSS still has `stroke-dasharray: 6 5`. The desktop `min-width: 48rem` block still sets `.split-frame` to `height: 100svh` and still does not contain `var(--imagery-h)`.
- `html[data-motion='reduce']` and `prefers-reduced-motion` still do not set `.split-frame` to `height: auto`, and still set `.split-imagery` to `height: auto`.
- The split-read slice between `class="split-read"` and `nonRevealDetails.length` still has no `class="mark-list"` and still calls `visibleDetailText(detail)`.

### A1: Note index prefix

**Files:**
- Modify: `src/data/callout-notes.ts` (replace `noteIndexPrefix` only)
- Create: `src/data/callout-notes.test.ts`
- Test: `src/data/callout-notes.test.ts`

**Interfaces:**
- Consumes:

```ts
export function noteIndexPrefix(index: number): string
```

- Produces: that same function, implemented. `1`–`20` return the circled numeral. `21` returns `(21)`.

- [ ] **Step 1: Write the failing test**

Create `src/data/callout-notes.test.ts`:

```ts
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { noteIndexPrefix } from './callout-notes.ts';

describe('note index prefix', () => {
	it('uses the circled numeral for 1 through 20 and parentheses after that', () => {
		assert.equal(noteIndexPrefix(1), '①');
		assert.equal(noteIndexPrefix(6), '⑥');
		assert.equal(noteIndexPrefix(20), '⑳');
		assert.equal(noteIndexPrefix(21), '(21)');
		assert.equal(
			'①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳',
			Array.from({ length: 20 }, (_, index) => noteIndexPrefix(index + 1)).join(''),
		);
	});
});
```

- [ ] **Step 2: Run the test and see it fail**

Run: `node --experimental-strip-types --test src/data/callout-notes.test.ts`

Expected: FAIL. The thrown message is `Not implemented: noteIndexPrefix`.

- [ ] **Step 3: Implement the prefix**

Replace `noteIndexPrefix` in `src/data/callout-notes.ts` with:

```ts
const CIRCLED_NUMERALS = '①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳';

export function noteIndexPrefix(index: number): string {
	if (Number.isInteger(index) && index >= 1 && index <= CIRCLED_NUMERALS.length) {
		return CIRCLED_NUMERALS[index - 1] ?? `(${index})`;
	}
	return `(${index})`;
}
```

Leave `splitCalloutMode` throwing. Leave `CALLOUT_ATTR` as it is. Do not add a field to `records.json`. Do not change `stripCircledIndex` or `visibleDetailText`.

- [ ] **Step 4: Run the test and see it pass**

Run: `node --experimental-strip-types --test src/data/callout-notes.test.ts src/data/callout-polish.contract.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/data/callout-notes.ts src/data/callout-notes.test.ts
git commit -m "feat: prefix callout notes with the mark index"
```

### A2: Narrow placeNotes skips the letterbox

**Files:**
- Modify: `src/data/detail-display.ts` (`placeNotes`, and delete `type Disc` and `rectHitsDisc`)
- Modify: `src/data/callout-notes.ts` (replace `splitCalloutMode`)
- Modify: `src/data/callout-notes.test.ts`
- Modify: `src/data/detail-display.test.ts` (add one `it` inside `describe('margin-first notes')`)
- Test: `src/data/detail-display.test.ts`, `src/data/callout-notes.test.ts`

**Interfaces:**
- Consumes:

```ts
export function placeNotes(args: {
	pane: PxSize;
	plate: FrameBox;
	plateSize: PxSize;
	rem: number;
	notes: readonly NoteDraft[];
	narrow?: boolean;
}): NotePlacement[]

export function splitCalloutMode(args: SplitCalloutArgs): CalloutMode | null
```

`narrow` omitted or `false` keeps today’s order: side strip, then letterbox, then scrim. `narrow: true` keeps the side strip and then sends every remaining note to the scrim. It does not read the letterbox band.

`splitCalloutMode` returns `null` when `narrow` is false. It returns `'overlay-no-gutter'` when `narrow` is true and `stripPx + 1e-6 < MIN_NOTE_REM * rem`. It returns `'margin'` when `narrow` is true, the strip is at least `6.5rem`, and every placement has `kind === 'side'`. Any other narrow mix returns `null`.

- Produces: those two functions, implemented. `NotePlacement` is unchanged. `leaderEndpoints` is unchanged. `badgeCenter` stays exported for the legacy markup.

- [ ] **Step 1: Write the failing tests**

Append this `it` inside `describe('margin-first notes')` in `src/data/detail-display.test.ts`. Add `splitCalloutMode` to the import from `./callout-notes.ts` in that file, or import it beside the existing `./detail-display.ts` import:

```ts
import { splitCalloutMode } from './callout-notes.ts';
```

```ts
	it('skips the letterbox when the narrow strip is under 6.5rem', () => {
		const phoneLabel = plateBox(
			phone,
			openingBox(phone, labelNatural),
			labelPlate,
			labelNatural,
			labelCrop,
		);
		const phoneCover = plateBox(
			phone,
			openingBox(phone, coverNatural),
			coverPlate,
			coverNatural,
			coverCrop,
		);
		const labelStrip = (phone.width - phoneLabel.width) / 2;
		const coverStrip = (phone.width - phoneCover.width) / 2;
		assert.ok(labelStrip / rem < MIN_NOTE_REM);
		assert.ok(coverStrip / rem < MIN_NOTE_REM);
		assert.ok(Math.abs(phoneLabel.width - 255) <= 2);
		assert.ok(Math.abs(phoneLabel.height - 255) <= 2);
		assert.ok(Math.abs(phoneCover.width - 255) <= 2);
		assert.ok(Math.abs(phoneCover.height - 158) <= 2);

		const labelNotes = placeNotes({
			pane: phone,
			plate: phoneLabel,
			plateSize: labelPlate,
			rem,
			narrow: true,
			notes: [draft(0, 'right', 24), draft(1, 'left', 24)],
		});
		assert.deepEqual(
			labelNotes.map((note) => note.kind),
			['scrim', 'scrim'],
		);
		assert.equal(labelNotes.some((note) => note.kind === 'letterbox'), false);
		for (const note of labelNotes) {
			assert.ok(note.top >= phoneLabel.top - 1e-6);
			assert.ok(note.top + note.height <= phoneLabel.top + phoneLabel.height + 1e-6);
		}
		assert.equal(
			splitCalloutMode({
				narrow: true,
				stripPx: labelStrip,
				rem,
				placements: labelNotes,
			}),
			'overlay-no-gutter',
		);

		const coverNotes = placeNotes({
			pane: phone,
			plate: phoneCover,
			plateSize: coverPlate,
			rem,
			narrow: true,
			notes: [draft(0, 'left', 24)],
		});
		assert.equal(coverNotes[0].kind, 'scrim');
		assert.equal(coverNotes[0].kind === 'letterbox', false);
		assert.equal(
			splitCalloutMode({
				narrow: true,
				stripPx: coverStrip,
				rem,
				placements: coverNotes,
			}),
			'overlay-no-gutter',
		);

		const deskLabel = plateBox(desk, openingBox(desk, labelNatural), labelPlate, labelNatural, labelCrop);
		const marginNotes = placeNotes({
			pane: desk,
			plate: deskLabel,
			plateSize: labelPlate,
			rem,
			narrow: true,
			notes: [draft(0, 'left'), draft(1, 'right')],
		});
		assert.deepEqual(
			marginNotes.map((note) => note.kind),
			['side', 'side'],
		);
		assert.equal(
			splitCalloutMode({
				narrow: true,
				stripPx: (desk.width - deskLabel.width) / 2,
				rem,
				placements: marginNotes,
			}),
			'margin',
		);
		assert.equal(
			splitCalloutMode({
				narrow: false,
				stripPx: labelStrip,
				rem,
				placements: labelNotes,
			}),
			null,
		);
		assert.equal(
			splitCalloutMode({
				narrow: true,
				stripPx: 6.5 * rem,
				rem,
				placements: [{ kind: 'side' }, { kind: 'scrim' }],
			}),
			null,
		);

		const frozen = { ...phoneLabel };
		placeNotes({
			pane: phone,
			plate: phoneLabel,
			plateSize: labelPlate,
			rem,
			narrow: true,
			notes: [draft(0, 'right', 24)],
		});
		assert.deepEqual(phoneLabel, frozen);
	});
```

The existing `it` named `uses the side strip, then the letterbox, then the scrim` stays. It calls `placeNotes` without `narrow`, and the phone case in that test still expects `letterbox`. That is the desktop order. Do not change it.

- [ ] **Step 2: Run the test and see it fail**

Run: `node --experimental-strip-types --test --test-name-pattern 'skips the letterbox when the narrow strip is under 6.5rem' src/data/detail-display.test.ts`

Expected: FAIL. The phone notes are still `letterbox`, or `splitCalloutMode` throws `Not implemented: splitCalloutMode`.

- [ ] **Step 3: Skip the letterbox and stop dodging discs**

In `src/data/detail-display.ts`, delete `type Disc` and `function rectHitsDisc` entirely. Nothing else calls them once the obstacle map below replaces the disc.

Replace `placeNotes` with this function. `anchorCss`, `rectsOverlap`, `clearTop`’s nudge of 4 CSS pixels, the scrim inset, and the overflow `omitLeader: true` path stay. The letterbox block runs only when `narrow` is not true.

```ts
function placeNotes(args: {
	pane: PxSize;
	plate: FrameBox;
	plateSize: PxSize;
	rem: number;
	notes: readonly NoteDraft[];
	narrow?: boolean;
}): NotePlacement[] {
	const { pane, plate, plateSize, rem, notes, narrow = false } = args;
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
					height: note.height,
					omitLeader: false,
				});
				prevBottom = top + note.height;
			}
			continue;
		}
		if (!narrow && band + 1e-6 >= MIN_BAND_REM * rem) {
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
						height: note.height,
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
						height: note.height,
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
		return { box };
	});
	const area = { left: 0, right: 0 };
	for (const note of notes) area[note.side] += note.mark.w * note.mark.h;
	const inset = SCRIM_INSET_REM * rem;
	const scrimWidth = Math.min(NOTE_CAP_REM * rem, Math.max(0, plate.width / 2 - inset));
	const scrimLeft = (side: 'left' | 'right') =>
		side === 'left' ? plate.left + inset : plate.left + plate.width - inset - scrimWidth;

	const scrimObstacles: { left: CssRect[]; right: CssRect[] } = { left: [], right: [] };
	const prevBottom = { left: Number.NEGATIVE_INFINITY, right: Number.NEGATIVE_INFINITY };

	function clearTop(left: number, height: number, start: number, side: 'left' | 'right'): number | null {
		const minTop = plate.top;
		const maxTop = plate.top + plate.height - height;
		if (maxTop < minTop - 1e-6 || scrimWidth <= 0) return null;
		let origin = start;
		if (origin < minTop) origin = minTop;
		if (origin > maxTop) origin = maxTop;
		const limit = Math.ceil(Math.max(0, maxTop - minTop) / NUDGE_STEP_PX) + 1;
		for (let step = 0; step <= limit; step += 1) {
			const candidates =
				step === 0 ? [origin] : [origin + step * NUDGE_STEP_PX, origin - step * NUDGE_STEP_PX];
			for (const top of candidates) {
				if (top < minTop - 1e-6 || top > maxTop + 1e-6) continue;
				const rect = { left, top, right: left + scrimWidth, bottom: top + height };
				const hit =
					obstacles.some((obstacle) => rectsOverlap(rect, obstacle.box)) ||
					scrimObstacles[side].some((box) => rectsOverlap(rect, box));
				if (!hit) return top;
			}
		}
		return null;
	}

	for (const side of ['left', 'right'] as const) {
		const group = pending.filter((note) => note.side === side).sort(byAnchor);
		for (const note of group) {
			const anchorTop = anchorCss(note, plate, plateSize) - note.height / 2;
			let start = anchorTop;
			if (start < prevBottom[side] + gap) start = prevBottom[side] + gap;
			const found = clearTop(scrimLeft(side), note.height, start, side);
			if (found !== null) {
				const left = scrimLeft(side);
				scrimObstacles[side].push({
					left,
					top: found,
					right: left + scrimWidth,
					bottom: found + note.height,
				});
				prevBottom[side] = Math.max(prevBottom[side], found + note.height);
				placed.set(note.index, {
					index: note.index,
					kind: 'scrim',
					side,
					left,
					top: found,
					width: scrimWidth,
					height: note.height,
					omitLeader: false,
				});
				continue;
			}
			const other = side === 'left' ? 'right' : 'left';
			const home = area[side] <= area[other] ? side : other;
			const minTop = plate.top;
			const maxTop = Math.max(minTop, plate.top + plate.height - note.height);
			let top = anchorTop;
			if (top < minTop) top = minTop;
			if (top > maxTop) top = maxTop;
			const left = scrimLeft(home);
			scrimObstacles[home].push({
				left,
				top,
				right: left + scrimWidth,
				bottom: top + note.height,
			});
			prevBottom[home] = Math.max(prevBottom[home], top + note.height);
			placed.set(note.index, {
				index: note.index,
				kind: 'scrim',
				side: home,
				left,
				top,
				width: scrimWidth,
				height: note.height,
				omitLeader: true,
			});
		}
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
			height: note.height,
			omitLeader: true,
		};
	});
}
```

Replace `splitCalloutMode` in `src/data/callout-notes.ts` with:

```ts
import { MIN_NOTE_REM } from './detail-display.ts';

export function splitCalloutMode(args: SplitCalloutArgs): CalloutMode | null {
	if (!args.narrow) return null;
	if (args.stripPx + 1e-6 < MIN_NOTE_REM * args.rem) return 'overlay-no-gutter';
	if (args.placements.length > 0 && args.placements.every((note) => note.kind === 'side')) {
		return 'margin';
	}
	return null;
}
```

Put that import at the top of `callout-notes.ts`. `detail-display.ts` must not import `callout-notes.ts`.

- [ ] **Step 4: Run the tests and see them pass**

Run: `node --experimental-strip-types --test src/data/detail-display.test.ts src/data/callout-notes.test.ts src/data/callout-polish.contract.test.ts src/data/split-stage.test.ts`

Expected: PASS. The old phone assertion without `narrow` is still `letterbox`. The new assertion with `narrow: true` is `scrim`. Desktop label notes are still `side`. Desktop cover notes are still `letterbox`.

- [ ] **Step 5: Commit**

```bash
git add src/data/detail-display.ts src/data/detail-display.test.ts src/data/callout-notes.ts src/data/callout-notes.test.ts
git commit -m "feat: overlay narrow callout notes instead of the letterbox"
```

### A3: Split-frame markup, callout attribute, and leader call site

**Files:**
- Modify: `src/pages/records/[id].astro`
- Modify: `src/styles/global.css`
- Modify: `src/data/detail-display.test.ts` (one source `it`)
- Test: `src/data/detail-display.test.ts`

**Interfaces:**
- Consumes:

```ts
export function noteIndexPrefix(index: number): string

export function splitCalloutMode(args: SplitCalloutArgs): CalloutMode | null

export function placeNotes(args: {
	pane: PxSize;
	plate: FrameBox;
	plateSize: PxSize;
	rem: number;
	notes: readonly NoteDraft[];
	narrow?: boolean;
}): NotePlacement[]

export function selectSplitLeaders(items: readonly SplitLeaderInput[]): SplitLeaderResult[]
```

- Produces: the `.split-stage` tree has a `.mark-box` per mark and no `.mark-disc` or `.mark-num`. Each split-frame note line is the prefix, one space, then `marks.note`. `.mark-label` stays above that line with no second index. `positionSplit` passes `narrow` and writes `data-callout` on the `.split-frame` element. `writeLeaders` keeps the legacy `leaderEndpoints` body for every figure that is not `.split-frame`, and calls `selectSplitLeaders` for `.split-frame`.

The `.record-split` tree and the `nonRevealDetails` tree keep `badgeCenter`, `.mark-disc`, `.mark-num`, and the clipped decimal `.mark-index`. Do not edit those two copies.

- [ ] **Step 1: Write the failing source test**

Append this `describe` to `src/data/detail-display.test.ts`:

```ts
describe('split-frame callout chrome', () => {
	it('drops discs on the split frame, prefixes the note, and leaves ml4001 discs in place', () => {
		const here = dirname(fileURLToPath(import.meta.url));
		const astro = readFileSync(join(here, '../pages/records/[id].astro'), 'utf8');
		const css = readFileSync(join(here, '../styles/global.css'), 'utf8');
		const split = astro.slice(astro.indexOf('class="split-stage"'), astro.indexOf('class="split-read"'));
		const legacy = astro.slice(astro.indexOf('class="record-split"'), astro.indexOf('class="split-stage"'));
		assert.equal(split.includes('mark-disc'), false);
		assert.equal(split.includes('mark-num'), false);
		assert.equal(split.includes('badgeCenter'), false);
		assert.match(split, /class="mark-box"/);
		assert.match(split, /noteIndexPrefix\(markIndex \+ 1\)/);
		assert.match(split, /<p class="mark-note"><span class="mark-index">\{noteIndexPrefix\(markIndex \+ 1\)\}<\/span> \{mark\.note\}<\/p>/);
		assert.match(legacy, /class="mark-disc"/);
		assert.match(legacy, /class="mark-num"/);
		assert.equal(legacy.includes('noteIndexPrefix'), false);
		assert.match(astro, /selectSplitLeaders\(/);
		assert.match(astro, /leaderEndpoints\(/);
		assert.match(astro, /const shortPx = 0\.35 \* remPx\(\)/);
		assert.match(astro, /narrow: isNarrow\(\)/);
		assert.match(astro, /setAttribute\('data-callout', mode\)/);
		assert.match(astro, /splitCalloutMode\(/);
		assert.match(
			css,
			/\.record-page--split \.split-frame \.mark-note \.mark-index\s*\{[^}]*position:\s*static/s,
		);
		const clipped = css.slice(css.indexOf('.mark-index {'), css.indexOf('.mark-label'));
		assert.match(clipped, /width:\s*1px/);
		assert.match(clipped, /clip:\s*rect\(0,\s*0,\s*0,\s*0\)/);
	});
});
```

- [ ] **Step 2: Run the test and see it fail**

Run: `node --experimental-strip-types --test --test-name-pattern 'drops discs on the split frame' src/data/detail-display.test.ts`

Expected: FAIL. The split-stage slice still contains `mark-disc`.

- [ ] **Step 3: Wire the split frame**

In the frontmatter import list of `src/pages/records/[id].astro`, keep `badgeCenter`. Add:

```ts
import { noteIndexPrefix } from '../../data/callout-notes';
```

`badgeCenter` is still required by the `.record-split` copy and the `nonRevealDetails` copy.

In the `<script>` import from `../../data/detail-display`, keep `leaderEndpoints`, `leaderHitsNote`, and `placeNotes`. Add:

```ts
import { splitCalloutMode } from '../../data/callout-notes';
import { selectSplitLeaders } from '../../data/split-leaders';
```

Replace only the `.split-stage` `<g class="mark-graphics">` block (the one before `class="split-read"`, not the `.record-split` copy and not the `nonRevealDetails` copy) with:

```astro
													<g class="mark-graphics">
														{detail.marks.map((mark) => (
															<g class="mark-callout" data-mark-id={mark.id}>
																<rect
																	class="mark-box"
																	x={mark.x}
																	y={mark.y}
																	width={mark.w}
																	height={mark.h}
																	stroke-width="2"
																/>
															</g>
														))}
													</g>
```

Replace only that same tree’s `<ol class="mark-list">` items with:

```astro
												<ol class="mark-list" aria-label="题铭">
													{detail.marks.map((mark, markIndex) => (
														<li
															id={`${record.id}-${detail.part}-mark-${mark.id}`}
															data-mark-id={mark.id}
															data-index={markIndex}
															data-side={paintSide(mark.side)}
															data-side-pref={mark.side}
															data-badge={mark.badge}
															data-x={mark.x}
															data-y={mark.y}
															data-w={mark.w}
															data-h={mark.h}
														>
															{showMarkLabel(mark) && <p class="mark-label">{mark.label}</p>}
															<p class="mark-note"><span class="mark-index">{noteIndexPrefix(markIndex + 1)}</span> {mark.note}</p>
														</li>
													))}
												</ol>
```

There is one space between the closing `</span>` and `{mark.note}`. The `<ol>` stays `class="mark-list"` and the global rule stays `list-style: none`. Do not put the prefix on `.mark-label`.

After `.record-page--split .mark-list li.is-scrim` in `src/styles/global.css`, add:

```css
.record-page--split .split-frame .mark-note .mark-index {
	position: static;
	width: auto;
	height: auto;
	margin: 0;
	padding: 0;
	overflow: visible;
	clip: auto;
	white-space: normal;
	border: 0;
	color: inherit;
	font-size: inherit;
	font-weight: inherit;
	line-height: inherit;
}
```

Do not change the global `.mark-index` clip. Do not change `.mark-note` (`0.78rem`, line-height `1.45`, `var(--text)`). Do not change `.mark-leader` or the `1.618fr` / `1fr` tracks. Do not change `--imagery-h`.

In the page script, add `isNarrow` next to `remPx`:

```ts
		function isNarrow(): boolean {
			return window.matchMedia('(max-width: 47.99rem)').matches;
		}
```

Replace `writeLeaders` with the legacy body guarded by the split branch, and add `writeSplitLeaders` immediately above it. The legacy loop is the current function body, including `shortPx = 0.35 * remPx()` and `leaderHitsNote`.

```ts
		function writeSplitLeaders(
			figure: HTMLElement,
			items: readonly HTMLLIElement[],
			plate: HTMLImageElement,
			plateWidth: number,
			plateHeight: number,
		): void {
			const plateRect = plate.getBoundingClientRect();
			const scaleX = plateWidth === 0 ? 0 : plateRect.width / plateWidth;
			const scaleY = plateHeight === 0 ? 0 : plateRect.height / plateHeight;
			const inputs =
				scaleX <= 0 || scaleY <= 0
					? []
					: items.map((li) => {
							const noteRect = li.getBoundingClientRect();
							const pref = li.dataset.side === 'left' ? 'left' : 'right';
							return {
								index: Number(li.dataset.index),
								mark: {
									x: Number(li.dataset.x),
									y: Number(li.dataset.y),
									w: Number(li.dataset.w),
									h: Number(li.dataset.h),
								},
								side: pref,
								note: {
									left: (noteRect.left - plateRect.left) / scaleX,
									right: (noteRect.right - plateRect.left) / scaleX,
									top: (noteRect.top - plateRect.top) / scaleY,
									bottom: (noteRect.bottom - plateRect.top) / scaleY,
								},
								omitLeader: li.dataset.omitLeader === '1',
							} as const;
						});
			const chosen = scaleX <= 0 || scaleY <= 0 ? [] : selectSplitLeaders(inputs);
			for (const li of items) {
				const id = li.dataset.markId ?? '';
				const leader = figure.querySelector<SVGPolylineElement>(
					`.mark-leader[data-mark-id="${CSS.escape(id)}"]`,
				);
				const mask = figure.querySelector<SVGPolylineElement>(
					`.mark-leader-mask[data-mark-id="${CSS.escape(id)}"]`,
				);
				if (!leader) continue;
				const row = chosen.find((entry) => entry.index === Number(li.dataset.index));
				const points = row?.points ?? null;
				if (!points || points.length < 2) {
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

		function writeLeaders(
			figure: HTMLElement,
			items: readonly HTMLLIElement[],
			plate: HTMLImageElement,
			plateWidth: number,
			plateHeight: number,
		): void {
			if (figure.classList.contains('split-frame')) {
				writeSplitLeaders(figure, items, plate, plateWidth, plateHeight);
				return;
			}
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

Replace `positionSplit` with this function. It still clears `--imagery-h` after `layoutSplit`, which is what the page does today. Serial moves that clear. Do not call `settledImageryHeight` here.

```ts
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
			const narrow = isNarrow();
			let placed = placeNotes({
				pane: { width: figure.clientWidth, height: figure.clientHeight },
				plate: pose.plate,
				plateSize: { width: plateWidth, height: plateHeight },
				rem: root,
				narrow,
				notes: [],
			});
			for (let pass = 0; pass < 2; pass += 1) {
				placed = placeNotes({
					pane: { width: figure.clientWidth, height: figure.clientHeight },
					plate: pose.plate,
					plateSize: { width: plateWidth, height: plateHeight },
					rem: root,
					narrow,
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
							},
						};
					}),
				});
				for (const li of items) {
					const place = placed.find((note) => note.index === Number(li.dataset.index));
					if (!place) continue;
					li.dataset.side = place.side;
					li.setAttribute('data-omit-leader', place.omitLeader ? '1' : '0');
					li.classList.toggle('is-scrim', place.kind === 'scrim');
					li.style.left = `${place.left - pose.plate.left}px`;
					li.style.right = 'auto';
					li.style.top = `${place.top - pose.plate.top}px`;
					li.style.bottom = 'auto';
					li.style.width = `${place.width}px`;
					li.style.maxWidth = 'none';
				}
			}
			const strip = (figure.clientWidth - pose.plate.width) / 2;
			const mode = splitCalloutMode({
				narrow,
				stripPx: strip,
				rem: root,
				placements: placed,
			});
			if (mode === null) figure.removeAttribute('data-callout');
			else figure.setAttribute('data-callout', mode);
			writeLeaders(figure, items, plate, plateWidth, plateHeight);
		}
```

The note draft no longer passes `badge`. `placeNotes` does not read it. `data-badge` stays on the `<li>` for legacy figures. `resolvedSide` still chooses the side. `badge` does not.

Do not change `applyFrame`, `showSettled`, `stageVisual`, or the beat constants.

- [ ] **Step 4: Run the tests and see them pass**

Run: `node --experimental-strip-types --test src/data/detail-display.test.ts src/data/callout-notes.test.ts src/data/callout-polish.contract.test.ts src/data/split-stage.test.ts`

Expected: PASS. The contract test still sees no server-rendered `data-callout=`. The new source test sees `setAttribute('data-callout', mode)`.

- [ ] **Step 5: Commit**

```bash
git add src/pages/records/[id].astro src/styles/global.css src/data/detail-display.test.ts
git commit -m "feat: drop split-frame discs and prefix the note line"
```

Lane A is done when this commit’s tests pass without Lane B’s implementation. A browser pass waits for Integration. Calling `selectSplitLeaders` on a split page still throws until Lane B replaces the stub. That is expected on this branch alone.

---
### Lane B — split-frame leader stub and crossing omit

**Base:** the Task 0 commit. Not Lane A’s commit.
**Writes:** `src/data/split-leaders.ts`, `src/data/split-leaders.test.ts`.
**Reads:** `LeaderPoint`, `splitLeaderPath`, `leaderEntersNoteInterior`, `polylinesProperlyCross`, `selectSplitLeaders`, `workedLeader`.
**Done when:** `src/data/split-leaders.test.ts` passes on Task 0 alone. `leaderEndpoints` and `leaderHitsNote` are not edited. Legacy callers keep the `0.35rem` gap and may still cross.

`badge` is not a parameter. The file must not mention `badge`, `leaderEndpoints`, or `0.35`.

Plate user units. `P0` is the midpoint of the box edge that faces `side`: `(mark.x, midY)` on the left, `(mark.x + mark.w, midY)` on the right. `T` is the note’s inner edge at the note’s vertical center: `note.left` when `side` is `'right'`, `note.right` when `side` is `'left'`. `gap` is `T.x - P0.x` when `side` is `'right'`, and `P0.x - T.x` when `side` is `'left'`.

### B1: Stub path

**Files:**
- Modify: `src/data/split-leaders.ts`
- Create: `src/data/split-leaders.test.ts`
- Test: `src/data/split-leaders.test.ts`

**Interfaces:**
- Consumes:

```ts
export function splitLeaderPath(args: {
	mark: SplitMark;
	side: 'left' | 'right';
	note: PlateRect;
}): LeaderPoint[] | null

export function leaderEntersNoteInterior(
	points: readonly LeaderPoint[],
	note: PlateRect,
): boolean

export function polylinesProperlyCross(
	left: readonly LeaderPoint[],
	right: readonly LeaderPoint[],
): boolean
```

- Produces: those three functions, implemented. `selectSplitLeaders` still throws until B2.

`splitLeaderPath` returns `null` when `gap < 0`, and when `gap < 4` and `P0.y !== T.y`. When `P0.y === T.y` and `gap >= 0`, it returns `[P0, T]`, including `gap < 4`. When `gap >= 4` and the y values differ, it returns four points: `P0`, the box stub, the outer end of the terminal stub, and `T`. Stub length is `16` when `gap >= 32`, otherwise `gap / 2`. The last segment is horizontal and ends at `T`. There is no third corner.

`leaderEntersNoteInterior` is true only when some open span of a segment lies strictly inside the note. A segment that ends on the border, including at `T`, is not an entry. `polylinesProperlyCross` is true only for a strict interior crossing. A shared endpoint is not a cross. A collinear overlap is not a cross.

- [ ] **Step 1: Write the failing test**

Create `src/data/split-leaders.test.ts`:

```ts
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import { workedLeader } from './callout-polish-fixtures.ts';
import {
	leaderEntersNoteInterior,
	polylinesProperlyCross,
	splitLeaderPath,
} from './split-leaders.ts';

const here = dirname(fileURLToPath(import.meta.url));

describe('split-frame leader path', () => {
	it('lands the worked stub on the inner edge and mirrors it to the left', () => {
		assert.deepEqual(
			splitLeaderPath({
				mark: { x: 80, y: 20, w: 20, h: 40 },
				side: 'right',
				note: { left: 200, right: 280, top: 50, bottom: 90 },
			}),
			workedLeader.points,
		);
		assert.equal(workedLeader.gap, 100);
		assert.equal(workedLeader.dash, '6 5');
		assert.deepEqual(
			splitLeaderPath({
				mark: { x: 200, y: 20, w: 20, h: 40 },
				side: 'left',
				note: { left: 40, right: 100, top: 50, bottom: 90 },
			}),
			[
				{ x: 200, y: 40 },
				{ x: 184, y: 40 },
				{ x: 116, y: 70 },
				{ x: 100, y: 70 },
			],
		);
	});

	it('uses a 16px stub at gap 32 and half the gap below that', () => {
		assert.deepEqual(
			splitLeaderPath({
				mark: { x: 0, y: 0, w: 10, h: 10 },
				side: 'right',
				note: { left: 42, right: 80, top: 0, bottom: 20 },
			}),
			[
				{ x: 10, y: 5 },
				{ x: 26, y: 5 },
				{ x: 26, y: 10 },
				{ x: 42, y: 10 },
			],
		);
		assert.deepEqual(
			splitLeaderPath({
				mark: { x: 0, y: 0, w: 10, h: 10 },
				side: 'right',
				note: { left: 41, right: 80, top: 0, bottom: 20 },
			}),
			[
				{ x: 10, y: 5 },
				{ x: 25.5, y: 5 },
				{ x: 25.5, y: 10 },
				{ x: 41, y: 10 },
			],
		);
		assert.deepEqual(
			splitLeaderPath({
				mark: { x: 0, y: 0, w: 10, h: 10 },
				side: 'right',
				note: { left: 30, right: 80, top: 0, bottom: 20 },
			}),
			[
				{ x: 10, y: 5 },
				{ x: 20, y: 5 },
				{ x: 20, y: 10 },
				{ x: 30, y: 10 },
			],
		);
	});

	it('omits a short or backward gap unless the run is already horizontal', () => {
		assert.equal(
			splitLeaderPath({
				mark: { x: 0, y: 0, w: 10, h: 10 },
				side: 'right',
				note: { left: 13, right: 40, top: 0, bottom: 20 },
			}),
			null,
		);
		assert.equal(
			splitLeaderPath({
				mark: { x: 0, y: 0, w: 40, h: 10 },
				side: 'right',
				note: { left: 4, right: 30, top: 0, bottom: 20 },
			}),
			null,
		);
		assert.deepEqual(
			splitLeaderPath({
				mark: { x: 0, y: 0, w: 10, h: 20 },
				side: 'right',
				note: { left: 12, right: 40, top: 0, bottom: 20 },
			}),
			[
				{ x: 10, y: 10 },
				{ x: 12, y: 10 },
			],
		);
		assert.deepEqual(
			splitLeaderPath({
				mark: { x: 0, y: 0, w: 10, h: 20 },
				side: 'right',
				note: { left: 100, right: 140, top: 0, bottom: 20 },
			}),
			[
				{ x: 10, y: 10 },
				{ x: 100, y: 10 },
			],
		);
	});

	it('treats own-note contact at the border as success and a strict cross as a cross', () => {
		const note = { left: 20, right: 40, top: 0, bottom: 20 };
		assert.equal(
			leaderEntersNoteInterior(
				[
					{ x: 0, y: 10 },
					{ x: 20, y: 10 },
				],
				note,
			),
			false,
		);
		assert.equal(
			leaderEntersNoteInterior(
				[
					{ x: 0, y: 10 },
					{ x: 50, y: 10 },
				],
				note,
			),
			true,
		);
		assert.equal(
			polylinesProperlyCross(
				[
					{ x: 0, y: 0 },
					{ x: 10, y: 10 },
				],
				[
					{ x: 0, y: 10 },
					{ x: 10, y: 0 },
				],
			),
			true,
		);
		assert.equal(
			polylinesProperlyCross(
				[
					{ x: 0, y: 0 },
					{ x: 10, y: 0 },
				],
				[
					{ x: 10, y: 0 },
					{ x: 10, y: 10 },
				],
			),
			false,
		);
		assert.equal(
			polylinesProperlyCross(
				[
					{ x: 0, y: 0 },
					{ x: 10, y: 0 },
				],
				[
					{ x: 5, y: 0 },
					{ x: 15, y: 0 },
				],
			),
			false,
		);
		const source = readFileSync(join(here, 'split-leaders.ts'), 'utf8');
		assert.equal(source.includes('badge'), false);
		assert.equal(source.includes('leaderEndpoints'), false);
		assert.equal(source.includes('0.35'), false);
	});
});
```

- [ ] **Step 2: Run the test and see it fail**

Run: `node --experimental-strip-types --test src/data/split-leaders.test.ts`

Expected: FAIL. The thrown message is `Not implemented: splitLeaderPath`.

- [ ] **Step 3: Implement the path and the two predicates**

Replace the bodies of `leaderEntersNoteInterior`, `polylinesProperlyCross`, and `splitLeaderPath` in `src/data/split-leaders.ts`. Leave `selectSplitLeaders` throwing. Add the private helpers in the same file.

```ts
import type { LeaderPoint } from './detail-display.ts';

const EPS = 1e-9;

function orient(a: LeaderPoint, b: LeaderPoint, c: LeaderPoint): number {
	return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function overlapT(
	a: LeaderPoint,
	b: LeaderPoint,
	rect: PlateRect,
): { t0: number; t1: number } | null {
	let t0 = 0;
	let t1 = 1;
	const dx = b.x - a.x;
	const dy = b.y - a.y;
	const p = [-dx, dx, -dy, dy];
	const q = [a.x - rect.left, rect.right - a.x, a.y - rect.top, rect.bottom - a.y];
	for (let i = 0; i < 4; i += 1) {
		const pi = p[i] ?? 0;
		const qi = q[i] ?? 0;
		if (Math.abs(pi) <= EPS) {
			if (qi < -EPS) return null;
		} else {
			const t = qi / pi;
			if (pi < 0) {
				if (t > t1) return null;
				if (t > t0) t0 = t;
			} else {
				if (t < t0) return null;
				if (t < t1) t1 = t;
			}
		}
	}
	if (t0 > t1 + EPS) return null;
	return { t0, t1 };
}

export function leaderEntersNoteInterior(points: readonly LeaderPoint[], note: PlateRect): boolean {
	for (let index = 0; index < points.length - 1; index += 1) {
		const start = points[index];
		const end = points[index + 1];
		if (!start || !end) continue;
		const hit = overlapT(start, end, note);
		if (!hit || hit.t1 - hit.t0 <= 1e-8) continue;
		const mid = (hit.t0 + hit.t1) / 2;
		const x = start.x + mid * (end.x - start.x);
		const y = start.y + mid * (end.y - start.y);
		if (x > note.left + EPS && x < note.right - EPS && y > note.top + EPS && y < note.bottom - EPS) {
			return true;
		}
	}
	return false;
}

export function polylinesProperlyCross(
	left: readonly LeaderPoint[],
	right: readonly LeaderPoint[],
): boolean {
	const strict = (p: number, q: number) => (p > EPS && q < -EPS) || (p < -EPS && q > EPS);
	for (let i = 0; i < left.length - 1; i += 1) {
		const a = left[i];
		const b = left[i + 1];
		if (!a || !b) continue;
		for (let j = 0; j < right.length - 1; j += 1) {
			const c = right[j];
			const d = right[j + 1];
			if (!c || !d) continue;
			const o1 = orient(a, b, c);
			const o2 = orient(a, b, d);
			const o3 = orient(c, d, a);
			const o4 = orient(c, d, b);
			if (strict(o1, o2) && strict(o3, o4)) return true;
		}
	}
	return false;
}

export function splitLeaderPath(args: {
	mark: SplitMark;
	side: 'left' | 'right';
	note: PlateRect;
}): LeaderPoint[] | null {
	const { mark, side, note } = args;
	const start = {
		x: side === 'left' ? mark.x : mark.x + mark.w,
		y: mark.y + mark.h / 2,
	};
	const end = {
		x: side === 'right' ? note.left : note.right,
		y: (note.top + note.bottom) / 2,
	};
	const gap = side === 'right' ? end.x - start.x : start.x - end.x;
	if (gap < 0) return null;
	if (start.y === end.y) return [start, end];
	if (gap < 4) return null;
	const stub = gap >= 32 ? 16 : gap / 2;
	const sign = side === 'right' ? 1 : -1;
	return [
		start,
		{ x: start.x + sign * stub, y: start.y },
		{ x: end.x - sign * stub, y: end.y },
		end,
	];
}
```

Keep the Task 0 types and the throwing `selectSplitLeaders` in the same file. Do not add a bend to route around a cross. The `import type { LeaderPoint }` line is already at the top of the file from Task 0. Do not insert a second import. Paste `EPS`, `orient`, `overlapT`, and the three function bodies only.

- [ ] **Step 4: Run the test and see it pass**

Run: `node --experimental-strip-types --test src/data/split-leaders.test.ts src/data/detail-display.test.ts src/data/callout-polish.contract.test.ts`

Expected: PASS. The existing `leaderEndpoints` tests still expect the `0.35rem` gap. This lane does not change them.

- [ ] **Step 5: Commit**

```bash
git add src/data/split-leaders.ts src/data/split-leaders.test.ts
git commit -m "feat: end split-frame leaders on a horizontal stub"
```

### B2: Omit a leader that cannot meet or that crosses

**Files:**
- Modify: `src/data/split-leaders.ts` (`selectSplitLeaders` and the three private helpers)
- Modify: `src/data/split-leaders.test.ts`
- Test: `src/data/split-leaders.test.ts`

**Interfaces:**
- Consumes: the B1 functions, plus

```ts
export function selectSplitLeaders(items: readonly SplitLeaderInput[]): SplitLeaderResult[]
```

- Produces: that function. Candidates run in ascending `index`, not input order. `omitLeader: true` drops the leader before the path is tested. Otherwise omit when the path is `null`, the polyline enters its own note’s interior, it hits another note’s closed rectangle, it hits another mark’s closed rectangle, it re-enters its own box past `P0`, or a segment properly crosses an already accepted leader. The earlier index keeps its points. The later index gets `points: null`. Do not insert a corner.

Touching the own box only at the departure (`overlap` ends at `t1 <= 1e-8`) is not a re-entry.

- [ ] **Step 1: Write the failing test**

Append this `describe` to `src/data/split-leaders.test.ts` and import `selectSplitLeaders`:

```ts
describe('split-frame leader omit', () => {
	const kept = {
		index: 0,
		mark: { x: -20, y: -10, w: 20, h: 20 },
		side: 'right' as const,
		note: { left: 100, right: 140, top: 60, bottom: 100 },
		omitLeader: false,
	};
	const crossing = {
		index: 1,
		mark: { x: -20, y: 70, w: 20, h: 20 },
		side: 'right' as const,
		note: { left: 100, right: 140, top: -20, bottom: 20 },
		omitLeader: false,
	};

	it('keeps the earlier index and omits the leader that crosses it', () => {
		const forward = selectSplitLeaders([kept, crossing]);
		const backward = selectSplitLeaders([crossing, kept]);
		assert.deepEqual(
			forward.map((row) => row.index),
			[0, 1],
		);
		assert.deepEqual(forward[0]?.points, [
			{ x: 0, y: 0 },
			{ x: 16, y: 0 },
			{ x: 84, y: 80 },
			{ x: 100, y: 80 },
		]);
		assert.equal(forward[1]?.points, null);
		assert.deepEqual(backward, forward);
	});

	it('omits a leader that hits another mark or another note, and honors omitLeader', () => {
		const blocked = selectSplitLeaders([
			{
				index: 0,
				mark: { x: 80, y: 20, w: 20, h: 40 },
				side: 'right',
				note: { left: 200, right: 280, top: 50, bottom: 90 },
				omitLeader: false,
			},
			{
				index: 1,
				mark: { x: 140, y: 50, w: 20, h: 20 },
				side: 'right',
				note: { left: 400, right: 440, top: 0, bottom: 10 },
				omitLeader: true,
			},
		]);
		assert.equal(blocked[0]?.points, null);
		assert.equal(blocked[1]?.points, null);

		const throughNote = selectSplitLeaders([
			{
				index: 0,
				mark: { x: 80, y: 20, w: 20, h: 40 },
				side: 'right',
				note: { left: 200, right: 280, top: 50, bottom: 90 },
				omitLeader: false,
			},
			{
				index: 1,
				mark: { x: 300, y: 300, w: 10, h: 10 },
				side: 'right',
				note: { left: 140, right: 160, top: 50, bottom: 70 },
				omitLeader: true,
			},
		]);
		assert.equal(throughNote[0]?.points, null);
	});

	it('keeps the worked path when the only contact is its own T', () => {
		const rows = selectSplitLeaders([
			{
				index: 0,
				mark: { x: 80, y: 20, w: 20, h: 40 },
				side: 'right',
				note: { left: 200, right: 280, top: 50, bottom: 90 },
				omitLeader: false,
			},
		]);
		assert.deepEqual(rows[0]?.points, workedLeader.points);
	});
});
```

- [ ] **Step 2: Run the test and see it fail**

Run: `node --experimental-strip-types --test --test-name-pattern 'split-frame leader omit' src/data/split-leaders.test.ts`

Expected: FAIL. The thrown message is `Not implemented: selectSplitLeaders`.

- [ ] **Step 3: Accept or omit in index order**

Add these helpers next to `overlapT`, and replace `selectSplitLeaders` with the function below.

```ts
function hitsClosedRect(points: readonly LeaderPoint[], rect: PlateRect): boolean {
	for (let index = 0; index < points.length - 1; index += 1) {
		const start = points[index];
		const end = points[index + 1];
		if (!start || !end) continue;
		const hit = overlapT(start, end, rect);
		if (hit && hit.t1 >= -EPS && hit.t0 <= 1 + EPS) return true;
	}
	return false;
}

function markRect(mark: SplitMark): PlateRect {
	return {
		left: mark.x,
		right: mark.x + mark.w,
		top: mark.y,
		bottom: mark.y + mark.h,
	};
}

function reentersOwnBox(points: readonly LeaderPoint[], mark: SplitMark): boolean {
	const rect = markRect(mark);
	for (let index = 0; index < points.length - 1; index += 1) {
		const start = points[index];
		const end = points[index + 1];
		if (!start || !end) continue;
		const hit = overlapT(start, end, rect);
		if (hit && hit.t1 > 1e-8) return true;
	}
	return false;
}

export function selectSplitLeaders(items: readonly SplitLeaderInput[]): SplitLeaderResult[] {
	const ordered = [...items].sort((a, b) => a.index - b.index);
	const accepted: { index: number; points: LeaderPoint[] }[] = [];
	const results: SplitLeaderResult[] = [];
	for (const item of ordered) {
		if (item.omitLeader) {
			results.push({ index: item.index, points: null });
			continue;
		}
		const points = splitLeaderPath({ mark: item.mark, side: item.side, note: item.note });
		if (!points || points.length < 2) {
			results.push({ index: item.index, points: null });
			continue;
		}
		const reject =
			leaderEntersNoteInterior(points, item.note) ||
			ordered.some((other) => other.index !== item.index && hitsClosedRect(points, other.note)) ||
			ordered.some(
				(other) => other.index !== item.index && hitsClosedRect(points, markRect(other.mark)),
			) ||
			reentersOwnBox(points, item.mark) ||
			accepted.some((prev) => polylinesProperlyCross(points, prev.points));
		if (reject) {
			results.push({ index: item.index, points: null });
			continue;
		}
		accepted.push({ index: item.index, points });
		results.push({ index: item.index, points });
	}
	return results;
}
```

- [ ] **Step 4: Run the test and see it pass**

Run: `node --experimental-strip-types --test src/data/split-leaders.test.ts src/data/detail-display.test.ts src/data/callout-polish.contract.test.ts`

Expected: PASS. Index `0` of the crossing pair keeps four points. Index `1` is `null` even when it is listed first. The worked single leader equals `workedLeader.points`.

- [ ] **Step 5: Commit**

```bash
git add src/data/split-leaders.ts src/data/split-leaders.test.ts
git commit -m "feat: omit split-frame leaders that cross or miss"
```

---

### Lane C — settled imagery height

**Base:** the Task 0 commit.
**Writes:** `src/data/settled-pane.ts`, `src/data/settled-pane.test.ts`.
**Reads:** `settledImageryHeight`, `phoneMhjl329`, `plateBox`, `openingBox`. Lane C calls `plateBox` from the test only. It does not edit `plateBox`.
**Done when:** the height tests pass on Task 0 alone. This lane does not edit `[id].astro`.

### C1: contentH

**Files:**
- Modify: `src/data/settled-pane.ts`
- Create: `src/data/settled-pane.test.ts`
- Test: `src/data/settled-pane.test.ts`

**Interfaces:**
- Consumes:

```ts
export function settledImageryHeight(args: {
	paneHeight: number;
	plate: { top: number; bottom: number };
	notes: readonly { top: number; bottom: number }[];
	padPx: number;
}): number
```

- Produces: that function. `unionTop` is the minimum of `plate.top` and every note top. `unionBottom` is the maximum of `plate.bottom` and every note bottom. The result is `min(paneHeight, unionBottom - unionTop + 2 * padPx)`. An empty note list uses the plate alone. The function does not call `plateBox`, `openingBox`, `cameraBox`, or `stageVisual`.

- [ ] **Step 1: Write the failing test**

Create `src/data/settled-pane.test.ts`:

```ts
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import { openingBox, plateBox } from './detail-display.ts';
import { phoneMhjl329 } from './callout-polish-fixtures.ts';
import { settledImageryHeight } from './settled-pane.ts';

const here = dirname(fileURLToPath(import.meta.url));

describe('settled imagery height', () => {
	it('adds one pad above and below the plate union and never grows the pane', () => {
		assert.equal(phoneMhjl329.label.settledImageryH, 282);
		assert.equal(phoneMhjl329.cover.settledImageryH, 185);
		assert.equal(phoneMhjl329.padPx, 13.5);
		assert.equal(
			settledImageryHeight({
				paneHeight: 489.5,
				plate: { top: 0, bottom: 255 },
				notes: [],
				padPx: 13.5,
			}),
			282,
		);
		assert.equal(
			settledImageryHeight({
				paneHeight: 489.5,
				plate: { top: 0, bottom: 158 },
				notes: [],
				padPx: 13.5,
			}),
			185,
		);
		assert.equal(
			settledImageryHeight({
				paneHeight: 100,
				plate: { top: 0, bottom: 255 },
				notes: [],
				padPx: 13.5,
			}),
			100,
		);
		assert.equal(
			settledImageryHeight({
				paneHeight: 500,
				plate: { top: 100, bottom: 200 },
				notes: [{ top: 80, bottom: 220 }],
				padPx: 10,
			}),
			160,
		);
		const source = readFileSync(join(here, 'settled-pane.ts'), 'utf8');
		assert.equal(source.includes('plateBox'), false);
		assert.equal(source.includes('cameraBox'), false);
		assert.equal(source.includes('stageVisual'), false);
	});

	it('matches the frozen MHJL plates within 2px and does not refit them', () => {
		const phone = { width: phoneMhjl329.pane.width, height: phoneMhjl329.pane.height };
		const labelNatural = { width: 1050, height: 1400 };
		const coverNatural = { width: 1400, height: 1400 };
		const label = plateBox(
			phone,
			openingBox(phone, labelNatural),
			{ width: 400, height: 400 },
			labelNatural,
			{ x: 274, y: 403, w: 514, h: 514 },
		);
		const cover = plateBox(
			phone,
			openingBox(phone, coverNatural),
			{ width: 400, height: 248 },
			coverNatural,
			{ x: 219, y: 210, w: 379, h: 235 },
		);
		const labelH = settledImageryHeight({
			paneHeight: phone.height,
			plate: { top: label.top, bottom: label.top + label.height },
			notes: [{ top: label.top + 10, bottom: label.top + 30 }],
			padPx: phoneMhjl329.padPx,
		});
		const coverH = settledImageryHeight({
			paneHeight: phone.height,
			plate: { top: cover.top, bottom: cover.top + cover.height },
			notes: [{ top: cover.top + 4, bottom: cover.top + 20 }],
			padPx: phoneMhjl329.padPx,
		});
		assert.equal(labelH, label.height + phoneMhjl329.padPx * 2);
		assert.equal(coverH, cover.height + phoneMhjl329.padPx * 2);
		assert.ok(Math.abs(labelH - 282) <= 2);
		assert.ok(Math.abs(coverH - 185) <= 2);
		assert.ok(labelH < phone.height);
		assert.ok(coverH < phone.height);
		assert.ok(Math.abs(label.width - 255) <= 2);
		assert.ok(Math.abs(label.height - 255) <= 2);
		assert.ok(Math.abs(cover.height - 158) <= 2);
		const frozen = { ...label };
		settledImageryHeight({
			paneHeight: phone.height,
			plate: { top: label.top, bottom: label.top + label.height },
			notes: [],
			padPx: phoneMhjl329.padPx,
		});
		assert.deepEqual(label, frozen);
	});
});
```

- [ ] **Step 2: Run the test and see it fail**

Run: `node --experimental-strip-types --test src/data/settled-pane.test.ts`

Expected: FAIL. The thrown message is `Not implemented: settledImageryHeight`.

- [ ] **Step 3: Implement the union**

Replace the body of `settledImageryHeight`:

```ts
export function settledImageryHeight(args: {
	paneHeight: number;
	plate: { top: number; bottom: number };
	notes: readonly { top: number; bottom: number }[];
	padPx: number;
}): number {
	let unionTop = args.plate.top;
	let unionBottom = args.plate.bottom;
	for (const note of args.notes) {
		unionTop = Math.min(unionTop, note.top);
		unionBottom = Math.max(unionBottom, note.bottom);
	}
	const contentH = unionBottom - unionTop + 2 * args.padPx;
	return Math.min(args.paneHeight, contentH);
}
```

- [ ] **Step 4: Run the test and see it pass**

Run: `node --experimental-strip-types --test src/data/settled-pane.test.ts src/data/callout-polish.contract.test.ts src/data/split-stage.test.ts`

Expected: PASS. Label content height is the frozen plate height plus `27` and within `2` of `282`. Cover is within `2` of `185`. Both are below `489.5`. The `plateBox` result object is unchanged.

- [ ] **Step 5: Commit**

```bash
git add src/data/settled-pane.ts src/data/settled-pane.test.ts
git commit -m "feat: compute the settled mobile imagery height"
```

---

### Serial 1: Write contentH without refitting S

**Base:** the integration branch after Lane A and Lane C have merged. Lane B may already be merged. Do not cut this branch from Task 0. Do not edit `src/data/settled-pane.ts`, `src/data/callout-notes.ts`, `src/data/split-leaders.ts`, or `src/styles/global.css`.
**Writes:** `src/pages/records/[id].astro`, `src/data/callout-settle.source.test.ts`.
**Reads:** Lane A’s `positionSplit`, `isNarrow`, `writeLeaders`, and `selectSplitLeaders` call site. Lane C’s `settledImageryHeight`. `stageVisual` as already imported in the page script. `LEADERS_END` stays `0.88`. Notes are shown when `stageVisual(local, notesOn).notesOpacity > 0`, which is `local > 0.88`.

This is the user lock for the settled pane. It overlaps `[id].astro` with Lane A, so it is not a fourth parallel lane.

What the page must do on each pass:

1. Clear the inline `--imagery-h` on `.record-page--split` and on the frame, and clear `data-pane-settle`, before `layoutSplit`. Force a reflow. `plateBox` then sees the stylesheet pane (`58svh`, or `42svh` in the short-height query, or `100svh` at `min-width: 48rem` because that query sets `height` directly).
2. Place notes and write leaders in that tall pane. Do not call `plateBox` again after this.
3. On the notes beat, below `48rem`, shift the plate frame so the union starts at `pad` (`0.75rem`). Keep the plate frame’s width and height. Set `--imagery-h` to `settledImageryHeight(...)`. The height change is a property write, not a tween.
4. Above the notes beat, and at `min-width: 48rem`, leave the inline property cleared.
5. Reduced motion collapses every aligned frame (`mode: 'frame'`), so the label can be about `282px` while the cover is about `185px`. Motion collapses only the active frame onto the page variable (`mode: 'page'`), and that frame does not keep a private variable.
6. `layoutSplit` returns the cached tall pose without writing styles when `data-pane-settle="1"`. `positionSplit` clears that flag before it measures, so the cache is not the measurement path.

`applyAll` order stays: `position`, then `applyFrame`, then `collapseToContent` for the active frame. Do not collapse before `applyFrame`. `applyFrame` would otherwise be the call that refits `S`.

- [ ] **Step 1: Write the failing source test**

Create `src/data/callout-settle.source.test.ts`:

```ts
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const here = dirname(fileURLToPath(import.meta.url));

describe('settled pane wiring', () => {
	it('measures S in the tall pane and collapses without a second plateBox', () => {
		const astro = readFileSync(join(here, '../pages/records/[id].astro'), 'utf8');
		const css = readFileSync(join(here, '../styles/global.css'), 'utf8');
		const positionSplit = astro.slice(
			astro.indexOf('function positionSplit'),
			astro.indexOf('function settle'),
		);
		assert.ok(positionSplit.indexOf("removeProperty('--imagery-h')") >= 0);
		assert.ok(
			positionSplit.indexOf("removeProperty('--imagery-h')") <
				positionSplit.indexOf('layoutSplit(figure)'),
		);
		assert.match(positionSplit, /delete figure\.dataset\.paneSettle/);
		assert.equal(positionSplit.includes('plateBox('), false);
		assert.equal(positionSplit.includes('settledImageryHeight'), false);
		assert.match(positionSplit, /narrow: isNarrow\(\)/);
		assert.match(astro, /selectSplitLeaders\(/);
		assert.match(astro, /const shortPx = 0\.35 \* remPx\(\)/);

		const layout = astro.slice(
			astro.indexOf('function layoutSplit'),
			astro.indexOf('function collapseToContent'),
		);
		assert.ok(layout.indexOf('paneSettle') < layout.indexOf('plateBox('));
		assert.match(layout, /tallPose\.set\(figure/);

		const collapse = astro.slice(
			astro.indexOf('function collapseToContent'),
			astro.indexOf('function applyFrame'),
		);
		assert.equal(collapse.includes('plateBox'), false);
		assert.equal(collapse.includes('openingBox'), false);
		assert.equal(collapse.includes('cameraBox'), false);
		assert.match(collapse, /settledImageryHeight\(/);
		assert.match(collapse, /0\.75 \* remPx\(\)/);

		assert.match(
			astro,
			/stageVisual\(activeLocal, active\.dataset\.notes === 'aligned'\)\.notesOpacity > 0/,
		);
		assert.match(astro, /collapseToContent\(active, 'page'\)/);
		assert.match(astro, /collapseToContent\(frame, 'frame'\)/);
		const showSettled = astro.slice(astro.indexOf('const showSettled'), astro.indexOf('const armFade'));
		assert.match(showSettled, /position\(frame\)/);
		assert.ok(showSettled.indexOf('position(frame)') < showSettled.indexOf("collapseToContent(frame, 'frame')"));

		const splitCss = css.slice(css.indexOf('.record-page--split'));
		const desktopStart = splitCss.indexOf('@media (min-width: 48rem)');
		const after = splitCss.slice(desktopStart + 10);
		const desktopBody = splitCss.slice(desktopStart, desktopStart + 10 + after.indexOf('@media'));
		assert.match(desktopBody, /\.split-frame\s*\{[^}]*height:\s*100svh/s);
		assert.doesNotMatch(desktopBody, /var\(--imagery-h\)/);
		assert.match(css, /grid-template-columns:\s*minmax\(0,\s*1\.618fr\)\s*minmax\(0,\s*1fr\)/);
	});
});
```

`selectSplitLeaders(` is required on the file, not inside `positionSplit`. Lane A calls it from `writeLeaders`.

- [ ] **Step 2: Run the test and see it fail**

Run: `node --experimental-strip-types --test src/data/callout-settle.source.test.ts`

Expected: FAIL. `function collapseToContent` is missing, so the layout slice does not find it, or `removeProperty` is still after `layoutSplit`.

- [ ] **Step 3: Clear, measure, then collapse**

Add this import beside the other script imports:

```ts
		import { settledImageryHeight } from '../../data/settled-pane';
```

`stageVisual` is already imported from `../../data/split-stage`. Do not edit that module.

Above `function layoutSplit`, add:

```ts
		type SplitPose = {
			opening: { left: number; top: number; width: number; height: number };
			plate: { left: number; top: number; width: number; height: number };
			natural: { width: number; height: number };
			crop: { x: number; y: number; w: number; h: number };
		};

		const tallPose = new WeakMap<HTMLElement, SplitPose>();
```

Change `layoutSplit`’s return type to `SplitPose | null`. At the top of the function, before the upright query:

```ts
			if (figure.dataset.paneSettle === '1') {
				return tallPose.get(figure) ?? null;
			}
```

Immediately before the existing `return { opening, plate, natural, crop }`:

```ts
			const pose: SplitPose = { opening, plate, natural, crop };
			tallPose.set(figure, pose);
			return pose;
```

Delete the old `return { opening, plate, natural, crop };` so the function returns once. The plate-frame style writes above that return stay. They still assign `plate.left`, `plate.top`, `plate.width`, and `plate.height` from this tall measurement.

Replace Lane A’s `positionSplit` with:

```ts
		function positionSplit(figure: HTMLElement): void {
			const plate = figure.querySelector<HTMLImageElement>('.plate');
			const list = figure.querySelector<HTMLOListElement>('.mark-list');
			const stage = figure.querySelector<HTMLElement>('.detail-stage');
			if (!plate || !list) return;
			const page = figure.closest<HTMLElement>('.record-page--split');
			page?.style.removeProperty('--imagery-h');
			figure.style.removeProperty('--imagery-h');
			delete figure.dataset.paneSettle;
			void figure.offsetHeight;
			const pose = layoutSplit(figure);
			if (!pose) return;
			if (stage) stage.style.paddingBottom = '';
			const plateWidth = Number(figure.dataset.plateWidth);
			const plateHeight = Number(figure.dataset.plateHeight);
			const items = [...list.querySelectorAll<HTMLLIElement>('li')];
			const root = remPx();
			const narrow = isNarrow();
			let placed = placeNotes({
				pane: { width: figure.clientWidth, height: figure.clientHeight },
				plate: pose.plate,
				plateSize: { width: plateWidth, height: plateHeight },
				rem: root,
				narrow,
				notes: [],
			});
			for (let pass = 0; pass < 2; pass += 1) {
				placed = placeNotes({
					pane: { width: figure.clientWidth, height: figure.clientHeight },
					plate: pose.plate,
					plateSize: { width: plateWidth, height: plateHeight },
					rem: root,
					narrow,
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
							},
						};
					}),
				});
				for (const li of items) {
					const place = placed.find((note) => note.index === Number(li.dataset.index));
					if (!place) continue;
					li.dataset.side = place.side;
					li.setAttribute('data-omit-leader', place.omitLeader ? '1' : '0');
					li.classList.toggle('is-scrim', place.kind === 'scrim');
					li.style.left = `${place.left - pose.plate.left}px`;
					li.style.right = 'auto';
					li.style.top = `${place.top - pose.plate.top}px`;
					li.style.bottom = 'auto';
					li.style.width = `${place.width}px`;
					li.style.maxWidth = 'none';
				}
			}
			const strip = (figure.clientWidth - pose.plate.width) / 2;
			const mode = splitCalloutMode({
				narrow,
				stripPx: strip,
				rem: root,
				placements: placed,
			});
			if (mode === null) figure.removeAttribute('data-callout');
			else figure.setAttribute('data-callout', mode);
			writeLeaders(figure, items, plate, plateWidth, plateHeight);
		}
```

Insert `collapseToContent` immediately above `function applyFrame`:

```ts
		function collapseToContent(figure: HTMLElement, mode: 'page' | 'frame'): void {
			if (!isNarrow()) return;
			const page = figure.closest<HTMLElement>('.record-page--split');
			const plateFrame = figure.querySelector<HTMLElement>('.plate-frame');
			const list = figure.querySelector<HTMLOListElement>('.mark-list');
			if (!page || !plateFrame || !list) return;
			const pad = 0.75 * remPx();
			const plateTop = Number.parseFloat(plateFrame.style.top);
			const plateHeight = Number.parseFloat(plateFrame.style.height);
			if (!Number.isFinite(plateTop) || !Number.isFinite(plateHeight)) return;
			const paneHeight = figure.clientHeight;
			const notes: { top: number; bottom: number }[] = [];
			for (const li of list.querySelectorAll<HTMLLIElement>('li')) {
				const rel = Number.parseFloat(li.style.top);
				if (!Number.isFinite(rel)) continue;
				const top = plateTop + rel;
				notes.push({ top, bottom: top + li.offsetHeight });
			}
			const contentH = settledImageryHeight({
				paneHeight,
				plate: { top: plateTop, bottom: plateTop + plateHeight },
				notes,
				padPx: pad,
			});
			let unionTop = plateTop;
			for (const note of notes) unionTop = Math.min(unionTop, note.top);
			const delta = unionTop - pad;
			plateFrame.style.top = `${plateTop - delta}px`;
			const px = `${contentH}px`;
			if (mode === 'page') {
				page.style.setProperty('--imagery-h', px);
				figure.style.removeProperty('--imagery-h');
			} else {
				figure.style.setProperty('--imagery-h', px);
				page.style.setProperty('--imagery-h', px);
			}
			figure.dataset.paneSettle = '1';
		}
```

Do not assign `plateFrame.style.width` or `plateFrame.style.height` in this function.

In `bindSplit`, replace the plate `load` listener:

```ts
			for (const frame of frames) {
				frame.querySelector('img.plate')?.addEventListener('load', () => {
					try {
						const settle = frame.dataset.paneSettle === '1';
						position(frame);
						if (settle && isNarrow()) {
							collapseToContent(
								frame,
								document.documentElement.dataset.motion === 'ok' ? 'page' : 'frame',
							);
						}
					} catch {
						/* keep the last placement */
					}
				});
			}
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
					if (frame.dataset.notes === 'aligned' && place) {
						try {
							position(frame);
							if (isNarrow()) collapseToContent(frame, 'frame');
						} catch {
							/* the settled plate is already on screen */
						}
					}
				}
				if (place) settledPlaced = true;
			};
```

In `applyAll`, after the existing `frames.forEach` and still inside `applyAll`, add:

```ts
				const active = frames[place.index];
				const activeLocal = localFor(place.index, place);
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
				}
```

Leave the `forEach` as it is: `position(frame)` then `applyFrame(...)`. Resize already calls `applyAll` and sets `settledPlaced = false`, so a resize across `48rem` clears the inline height on the next `positionSplit` and skips `collapseToContent` when `isNarrow()` is false.

Do not add a CSS transition on height. Do not change `stageVisual`. Do not change the desktop `100svh` rule or the `1.618fr` / `1fr` tracks.

- [ ] **Step 4: Run the tests and see them pass**

Run: `node --experimental-strip-types --test src/data/callout-settle.source.test.ts src/data/detail-display.test.ts src/data/settled-pane.test.ts src/data/split-leaders.test.ts src/data/split-stage.test.ts src/data/callout-polish.contract.test.ts src/data/callout-notes.test.ts`

Expected: PASS. `describe('stageVisual')` still locks `LEADERS_END` at `0.88`. The desktop CSS block still has no `var(--imagery-h)`.

- [ ] **Step 5: Commit**

```bash
git add src/pages/records/[id].astro src/data/callout-settle.source.test.ts
git commit -m "feat: collapse the settled mobile imagery pane"
```

---

### Integration

**Base:** the integration branch after Lane A, Lane B, Lane C, and Serial 1 have merged.
**Writes:** none unless a check fails. A failure gets one fix on this same checkpoint, then the same commands once more.
**Reads:** the whole integrated diff.

One live pass. Do not open a second review cycle per lane.

- [ ] **Step 1: Run the automated checks**

Run:

```bash
node --experimental-strip-types --test src/data/*.test.ts
npm run check
npm run build
```

Expected: every test PASS, `astro check` exits 0, `astro build` exits 0. `src/data/records.json` has no diff. `src/data/split-stage.ts` has no diff. `cameraBox`, `openingBox`, `plateBox`, and `stageVisual` have no diff.

- [ ] **Step 2: Live-verify mhjl329 and ml4001**

Start `npm run preview`. Use a 16px initial font so `1rem` is 18px, and the light theme. Pixel figures assume no scrollbar. A 2px difference still passes.

`/records/mhjl329/` with motion allowed, at the notes keypoint:

1. **No discs.** At 390×844 and at 1440×900, each `.split-frame` has one `.mark-box` per mark and no `.mark-disc` and no `.mark-num`. Label marks 2–5 and cover marks 2, 3, and 5 have no circle over the plate glyphs.
2. **Index on the note.** Each visible note starts with ① through ⑥ in mark order, then the existing `marks.note`. Label runs from `① GREAT TRACKS 标` through `⑥ SIDE A`. Cover runs from `① 1234 大江千里` through `⑥ 40th Anniversary Senri Oe`. `.split-read` has no ①–⑥ list. 记述 is unchanged.
3. **Mobile overlay.** At 390×844, `data-callout="overlay-no-gutter"` on the label and the cover. Every note has the scrim panel (`var(--bg)` behind that note only). No note rectangle sits in the letterbox outside `S`. No note glyph intersects `.split-read`.
4. **Desktop placement.** At 1440×900, label notes sit in the side paper, outside the plate, with no scrim. Cover notes sit in the letterbox, outside the plate, unless a wrapped note exhausts the band. Imagery / reading is between 1.60 and 1.64. Imagery height is `100svh`. The inline `--imagery-h` is absent.
5. **Leaders.** A visible split-frame leader is a `6 5` dash whose last segment is horizontal and ends on the note’s inner edge. No visible leader crosses another visible leader. A mark whose leader was omitted still has its box and its prefixed note.
6. **Short pane.** At 390×844 after notes are placed, the label plate’s used box is 255×255 and the cover plate’s used box is 255×158. Inline `--imagery-h` is about 282px on the label and about 185px on the cover. It is less than `58svh`. 品相 is the next reading block under that band, with the `0.75rem` pad and the existing reading padding between the plate union and the column. Scrubbing back to the upright hold clears the inline height, shows the upright at `U` in the tall pane, and hides the plate.
7. **Unchanged machinery.** `cameraBox`, `plateBox` factors, and the beat constants match `00315bf` (still true at `8fb591e`). 记述 and `marks[].note` match `records.json`.

`/records/ml4001/` still uses `.record-split`, still paints `.mark-disc` and `.mark-num`, still has the `9.5rem` slots, and still ends leaders `0.35rem` short of the note. It does not use `.split-frame` or `data-callout="overlay-no-gutter"`.

Reduced motion, same mhjl329 URL, below `48rem`: no scrub, discs absent, notes overlaid with prefixes, each frame’s used height at that frame’s `contentH`. No-JS: stylesheet `--imagery-h`, no `data-callout`, no overlay measurement, no collapse. The split-frame note prefix is still in the server HTML.

- [ ] **Step 3: Review the integrated diff once**

Read the diff from the Task 0 parent through Serial 1. Confirm the write sets stayed disjoint until Serial, `records.json` is untouched, and `split-stage.ts` is untouched. A failed check gets one fix and one re-run of this same Integration task. A green checkpoint ends the plan.

```bash
git add -A
git commit -m "fix: settle callout polish integration"
```

Skip the commit when Step 1 and Step 2 found nothing to change.

---

## After this plan merges

`spec-ok-merge-plan-ship` is already granted. Merge this docs PR to `main`, then cut the implementation branch from that merge commit. Start Task 0. When that commit is on the implementation branch, start Lane A, Lane B, and Lane C in the same turn, each on its own branch from Task 0. Merge those lanes, then run Serial 1, then run Integration. Do not ask which execution mode to use. Do not brainstorm this spec again.
