# Mobile margin-first callouts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Below `48rem`, a reveal-record note prefers the empty margin around `S`, then the letterbox packed against the plate, and a note that fits neither is a mark box until one tap shows that one sentence.

**Architecture:** Task 0 freezes the shared names on one commit: `NoteKind` including `overflow`, `placeExpandedPanel`, `CalloutMode` `'margin' | 'margin-first'`, `splitCalloutMode`, the DOM hooks, and the 390×844 height-24 / height-130 fixture. After that commit, three write-set lanes run from the same base and do not share a path: Lane A packs narrow notes and places the expanded panel, Lane B chooses the callout mode, and Lane C wires the tap, the visible-note `contentH` caller, and the no-JS flow list. Tests live in the lane that owns the module, so each lane’s suite passes on Task 0 plus that lane. There is no serial seam. Integration is the one live check, on `/records/mhjl329/` below `48rem`.

**Tech Stack:** Astro static pages, vanilla TypeScript in the page `<script>`, CSS custom properties, pure helpers tested with `node:test`. No scroll library. This package has no `npm test` script. The records check is `node --experimental-strip-types --test`, then `npm run check`, then `npm run build`. Node `>=22.23.4`. `1rem` = 18px when the initial font is 16px (`html` is `font-size: 112.5%`).

**Spec:** [`docs/superpowers/specs/2026-10-25-records-mobile-margin-first-design.md`](../specs/2026-10-25-records-mobile-margin-first-design.md) (merged in #54 as `e020468`).

**Checked against:** `main` at `e020468`. `src/` at that commit matches `95b8919`. Read `src/data/detail-display.ts` (`placeNotes`, `NotePlacement`), `src/data/callout-notes.ts`, `src/data/settled-pane.ts`, `src/pages/records/[id].astro` (`positionSplit`, `collapseToContent`, `writeSplitLeaders`), and `src/styles/global.css` (`.mark-list`, `.is-scrim`, `.record-page--split`).

**Contracts:** Task 0, on one screen.

- Exports: `NoteKind` (`'side' | 'letterbox' | 'scrim' | 'overflow'`), `placeExpandedPanel(args): ExpandedPanelPlacement`, `CalloutMode` (`'margin' | 'margin-first'`), `splitCalloutMode(args: SplitCalloutArgs): CalloutMode | null`. `placeNotes` keeps its arguments, including `narrow?: boolean`. Its narrow return kinds are `side`, `letterbox`, and `overflow`. Desktop `narrow: false` still returns `side`, `letterbox`, and `scrim`.
- DOM hooks: script writes `data-kind` on each split-frame `<li>`, `data-callout` (`margin` or `margin-first`) on the narrow `.split-frame`, `data-callouts="placed"` on that frame after the first successful placement, `data-expanded="true"` on the one open overflow `<li>`, and a `<button type="button" class="mark-hit">` inside that `<li>`. Server HTML gains none of these. `.mark-box` stays the region. `.mark-disc` and `.mark-num` stay off `.split-frame`.
- CSS: no new custom property. `.record-page--split` still owns `--imagery-h` (initial `58svh`; `42svh` in the existing short-height query). `.record-page--split .split-frame` is still the only size container (`container-type: size`). Lane C reads `data-kind`, `data-expanded`, `data-callouts`, `.mark-hit`, and `.is-scrim`. It does not declare a second container and it does not rename `--imagery-h`.
- Fixtures: `phoneMarginFirst` in `src/data/margin-first-fixtures.ts`. Height 24 is letterbox at left `183`, top `93.31`. Height 130 is overflow. Label `contentH` is `281.88` with no visible note and `305.88` with the height-24 note.

**Lanes:** each cut from the Task 0 commit. A sibling review does not gate another lane. Do not number them Task 1, Task 2, Task 3.

- Lane A — narrow placement and the expanded panel. Writes `src/data/detail-display.ts`, `src/data/detail-display.test.ts`.
- Lane B — callout mode. Writes `src/data/callout-notes.ts`, `src/data/callout-notes.test.ts`.
- Lane C — tap, visible-note collapse, no-JS flow. Writes `src/pages/records/[id].astro`, `src/styles/global.css`, `src/data/margin-first.source.test.ts`.

Tests are co-located with the module they lock. A separate artifact lane for `detail-display.test.ts` or `callout-notes.test.ts` would share a write path with Lane A or Lane B, so it is not a lane. The failing test that opens each lane is the step that starts from the contract alone: it imports the Task 0 names and asserts the spec rows before that lane’s body exists. `settledImageryHeight` is already shipped; Lane A asserts the new rows against it and does not edit `src/data/settled-pane.ts`. Lane C only changes which rects the page passes.

**Serial:** none. No aesthetic lock remains outside the three lanes. Desktop `narrow: false` stays the current `placeNotes` body inside Lane A, and Lane C’s new CSS sits inside `@media (max-width: 47.99rem)`. `[id].astro` has one owner, so it is not a serial seam. `src/data/settled-pane.ts` is not a seam: the formula stays, and the caller is Lane C.

**Branch:** cut the implementation branch from `main` after this plan is on `main`. Do not implement these tasks on the docs branch. This plan does not grant `spec-ok-merge-plan-ship`. When that grant is in hand, start Task 0, and when that commit is on the implementation branch start Lanes A, B, and C in the same turn, each on its own branch from Task 0. Do not ask which execution mode to use. Do not brainstorm the spec again.

Inside a lane the order is A1 then A2, B1, and C1 then C2. Integration starts only after A, B, and C have merged onto the integration branch.

## Global Constraints

Copied from the locked spec. Every task includes this section.

- Below `48rem`, `placeNotes` tries the side strip, then the letterbox packed against `S`, then `overflow`. It does not return `scrim`.
- A fitted side or letterbox note shows its sentence for the whole notes beat, with the index prefix, and is not a button.
- Only an overflow mark toggles. At most one overflow note is expanded. The collapsed state is the box and a named button. The sentence is hidden.
- The expanded panel uses leftover letterbox first. A scrim panel is one note, width under half of `S`, and more than half of `S` stays free of opaque paper.
- Split frames do not paint `.mark-disc` or `.mark-num`. An omitted leader does not bring a corner badge back. The index is the prefix on visible text and the overflow button’s name.
- A visible split-frame leader ends at `T` on a horizontal stub, or it is omitted, under the callout-polish rules. A collapsed overflow note has no leader.
- `data-callout` on a narrow frame is `margin` or `margin-first`. It is not `overlay-no-gutter`. Desktop removes the attribute.
- Settled mobile `--imagery-h` is `contentH` from the plate and visible notes. It is not `58svh`, `42svh`, or `100svh` after notes are placed. Collapsed overflow notes do not raise it. `contentH` does not exceed the stylesheet pane.
- Placement uses the pre-collapse pane. `S` after the collapse equals `S` from the tall pane. `cameraBox`, `openingBox`, `plateBox`, and `stageVisual` are not edited.
- The reading column does not repeat the prefixed notes.
- Palette stays the current tokens. Scrim background is `var(--bg)`. Box and leader stroke stay `var(--accent)`.
- Below `48rem` with no script, the note list is in flow under the plate and does not cover it.
- Legacy `.record-split`, including ml4001, keeps its discs, its `9.5rem` slots, and the shipped elbow.
- `records.json` note bytes stay. No new index field.

Locked numbers from the same spec, copied as written there:

- The narrow path is `max-width: 47.99rem`, the same query as `isNarrow()`.
- `MIN_NOTE_REM` stays `6.5`. `MIN_BAND_REM` stays `2.6`. `NOTE_CAP_REM` stays `9.5`. `NOTE_GAP_REM` stays `0.35`. `SCRIM_INSET_REM` stays `0.55`. The scrim nudge stays 4px. `MIN_BAND_REM` is not a gate on the narrow path.
- `1rem` = 18px. Viewport 390×844. Column 354px. Stylesheet `--imagery-h` is `58svh` (489.5px).
- Label `S` is 254.88×254.88 at `(49.56, 117.31)`. Strip 49.56px (2.75rem). Band 117.31px (6.52rem).
- Cover `S` is 254.88×158.03 at `(49.56, 165.74)`. Band 165.74px (9.21rem). Both strips are under 6.5rem. Both bands are over 2.6rem.
- Letterbox width is `171`. Gap is `6.3`.
- One right-side note, height 24: `letterbox`, side `right`, left `183`, top `93.31`, bottom on `plate.top`, `omitLeader` false.
- One right-side note, height 130: top would start at `-12.69`, bottom would end at `502.19`. `overflow`, `omitLeader` true, rect is the mark box.
- Five right-side notes of height 40: tops `77.31` and `31.01` in the top band, tops `372.19` and `418.49` in the bottom band, fifth `overflow`.
- `pad` = `0.75rem` = 13.5px. Label `contentH` is `281.88` with every note collapsed, and `305.88` with the height-24 letterbox note. Stylesheet pane is `489.5`. Cover with no visible note stays within 2px of `185`. A 2px difference still passes.
- Worked shift for that height-24 note: `delta` is `79.81`. Plate top becomes `37.5`. Note absolute top becomes `13.5`.
- Scrim width is `min(9.5rem, max(0, S.width / 2 - 0.55rem))`. On the label plate that is under half of `S`. Padding is `0.35rem 0.45rem`.
- Desktop at 1440×900 stays side, then letterbox from the pane edge, then scrim. Tracks stay `1.618fr` / `1fr`. Imagery height stays `100svh`. Label strip 8.75rem. Cover strip 6.2rem. φ stays between 1.60 and 1.64.
- `UPRIGHT_END`, `ZOOM_END`, `PLATE_END`, `BOXES_END`, `LEADERS_END`, `PASS_SVH`, `JOINT_SVH`, and `DETAIL_CROSSFADE_MS` stay. `plateBox` factors stay `0.72` / `1.25` / `0.92`. Dash stays `6 5`.
- `CalloutMode` is `'margin' | 'margin-first'`. `narrow` false returns `null`. Empty placements return `null`. Every narrow `side` returns `'margin'`. Any other narrow mix, including all letterbox, any overflow, or a scrim fixture, returns `'margin-first'`. Strip width is not a branch. An open panel does not change the attribute.

## File map

| Path | Owner | Responsibility |
|------|--------|----------------|
| `src/data/margin-first-fixtures.ts` | Task 0 | Spec rows. Later tasks read this file and do not edit it. |
| `src/data/margin-first.contract.test.ts` | Task 0 | Exports, hook absence in server HTML, fixture field types, one size container. No formula results. |
| `src/data/detail-display.ts` | Task 0 adds `NoteKind`, `placeExpandedPanel` stub; Lane A fills both bodies | `placeNarrowNotes` for `narrow === true`. The current body stays the `narrow === false` path. `leaderEndpoints` stays. |
| `src/data/detail-display.test.ts` | Task 0 drops `splitCalloutMode` calls; Lane A replaces the narrow `it` | Height 24 / 130, the five height-40 notes, `placeExpandedPanel`, visible-note `contentH`. Desktop cases stay. |
| `src/data/callout-notes.ts` | Task 0 changes the types and returns `null`; Lane B fills `splitCalloutMode` | `CalloutMode`, `SplitCalloutArgs`. `noteIndexPrefix` stays. |
| `src/data/callout-notes.test.ts` | Lane B | Mode table. Prefix tests stay. |
| `src/pages/records/[id].astro` | Lane C | Measure once, `data-kind`, `data-callouts`, `mark-hit`, one expanded panel, visible-note `collapseToContent`, leaders aimed at the open sentence. |
| `src/styles/global.css` | Lane C | Hide collapsed overflow text, hit target, scrim paper on the expanded sentence, no-JS flow list. Desktop `100svh` and `1.618fr 1fr` stay. |
| `src/data/margin-first.source.test.ts` | Lane C | Source lock for the hooks and the no-JS rules. |
| `src/data/settled-pane.ts` | nobody | Formula stays. Callers pass visible boxes only. |
| `src/data/split-stage.ts` | nobody | Beats and `cameraBox` stay. |
| `src/data/split-leaders.ts` | nobody | Stub path and crossing omit stay. The page passes a different rect. |
| `src/data/records.json` | nobody | Note bytes stay. |
| Serial seam | none | `[id].astro` is Lane C only. |

---

### Task 0: Contract surfaces

**Files:**
- Create: `src/data/margin-first-fixtures.ts`
- Create: `src/data/margin-first.contract.test.ts`
- Modify: `src/data/detail-display.ts` (the `NotePlacement` kind, plus the `placeExpandedPanel` stub)
- Modify: `src/data/callout-notes.ts` (the mode types; `splitCalloutMode` returns `null`)
- Modify: `src/data/detail-display.test.ts` (stop calling `splitCalloutMode` from the narrow `it`)
- Test: `src/data/margin-first.contract.test.ts`

**Interfaces:**
- Consumes: `placeNotes` as it exists at `e020468`, `NotePlacement`, `NoteDraft`, `FrameBox`, `PxSize`, `splitCalloutMode`, `CALLOUT_ATTR`, `.record-page--split { --imagery-h: 58svh; }`, and `.record-page--split .split-frame { container-type: size; }`.
- Produces: the four surfaces below. Lane implementers copy the signature block they consume. Do not rename these exports.

```ts
export type NoteKind = 'side' | 'letterbox' | 'scrim' | 'overflow';

export type NotePlacement = {
	index: number;
	kind: NoteKind;
	side: 'left' | 'right';
	left: number;
	top: number;
	width: number;
	height: number;
	omitLeader: boolean;
};

export type ExpandedPanelPlacement = {
	kind: 'letterbox' | 'scrim';
	side: 'left' | 'right';
	left: number;
	top: number;
	width: number;
	height: number;
	omitLeader: boolean;
};

export function placeExpandedPanel(args: {
	pane: PxSize;
	plate: FrameBox;
	plateSize: PxSize;
	rem: number;
	note: NoteDraft;
	notes: readonly NoteDraft[];
	letterboxHeight: number;
	scrimHeight: number;
	occupied: readonly {
		side: 'left' | 'right';
		left: number;
		top: number;
		width: number;
		height: number;
	}[];
}): ExpandedPanelPlacement {
	void args;
	throw new Error('Not implemented: placeExpandedPanel');
}

export type CalloutMode = 'margin' | 'margin-first';

export type SplitCalloutArgs = {
	narrow: boolean;
	stripPx: number;
	rem: number;
	placements: readonly { kind: NoteKind }[];
};

export function splitCalloutMode(args: SplitCalloutArgs): CalloutMode | null {
	void args;
	return null;
}
```

`placeNotes` is already exported. Task 0 does not change its body and does not read `narrow` differently. `null` is the zero value of `CalloutMode | null`. `positionSplit` already calls `splitCalloutMode` and removes the attribute when the result is `null`, so the page keeps placing notes until Lane B. `placeExpandedPanel` throws because nothing calls it until Lane C, and Lane A replaces the throw. The contract test checks `typeof` and does not call either function.

DOM and data hooks. Task 0 does not add them to server HTML. Lane C writes them:

- `data-kind` on each `.split-frame .mark-list li`. Values are `NoteKind`. The script sets it. Server HTML does not.
- `data-callout` on `.split-frame`, values `margin` or `margin-first`. Already written by `setAttribute('data-callout', mode)`. Server HTML still has no `data-callout=`. Desktop and `narrow === false` still remove it.
- `data-callouts="placed"` on `.split-frame` in the same turn as the first successful `placeNotes`. Absence means the no-JS flow list.
- `data-expanded="true"` on the one open overflow `<li>`. The button’s `aria-expanded` matches.
- `button.mark-hit` inside that `<li>` only. `type="button"`. `aria-controls` points at the note paragraph. `aria-label` is the paragraph’s text (the prefix, one space, `marks.note`). The button has no visible text.

CSS variables and the size container, already shipped, which Task 0 does not retune:

- `.record-page--split` writes `--imagery-h: 58svh`. The existing `@media (max-width: 47.99rem) and (max-height: 32rem)` rule writes `42svh`.
- Readers of `var(--imagery-h)` stay `.split-imagery`, `.split-frame`, and `.split-read` below `48rem`.
- `.record-page--split .split-frame` is the only `container-type: size` in `src/styles/global.css`. Lane C must leave that count at 1.
- No new custom property. Color, type size, and the φ tracks are not Task 0 work.

Fixtures, copied from the spec rows. Task 0 does not assert `placeNotes`. Lane A asserts the geometry against this object.

```ts
export type MarginFirstFixture = {
	id: 'mhjl329';
	viewport: { width: 390; height: 844 };
	rem: 18;
	pane: { width: 354; height: 489.5 };
	stripPx: 49.56;
	letterboxWidth: 171;
	gapPx: 6.3;
	padPx: 13.5;
	labelPlate: { left: 49.56; top: 117.31; width: 254.88; height: 254.88 };
	height24: {
		kind: 'letterbox';
		side: 'right';
		left: 183;
		top: 93.31;
		height: 24;
		omitLeader: false;
	};
	height130: { kind: 'overflow'; height: 130; omitLeader: true };
	fiveHeight40: {
		height: 40;
		topBandTops: readonly [77.31, 31.01];
		bottomBandTops: readonly [372.19, 418.49];
	};
	contentH: {
		collapsedLabel: 281.88;
		letterbox24: 305.88;
		stylesheetPane: 489.5;
		collapsedCover: 185;
		tolerancePx: 2;
	};
	shift: { delta: 79.81; plateTop: 37.5; noteTop: 13.5 };
};

export const phoneMarginFirst: MarginFirstFixture;
```

- [ ] **Step 1: Write the failing contract test**

Create `src/data/margin-first.contract.test.ts`:

```ts
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import { placeExpandedPanel } from './detail-display.ts';
import { splitCalloutMode } from './callout-notes.ts';
import { phoneMarginFirst } from './margin-first-fixtures.ts';

const here = dirname(fileURLToPath(import.meta.url));

describe('mobile margin-first contract', () => {
	it('exports the placement and mode names and the fixture fields', () => {
		assert.equal(typeof placeExpandedPanel, 'function');
		assert.equal(typeof splitCalloutMode, 'function');
		assert.equal(phoneMarginFirst.id, 'mhjl329');
		assert.equal(phoneMarginFirst.viewport.width, 390);
		assert.equal(phoneMarginFirst.viewport.height, 844);
		assert.equal(typeof phoneMarginFirst.pane.width, 'number');
		assert.equal(typeof phoneMarginFirst.pane.height, 'number');
		assert.equal(typeof phoneMarginFirst.rem, 'number');
		assert.equal(typeof phoneMarginFirst.stripPx, 'number');
		assert.equal(typeof phoneMarginFirst.letterboxWidth, 'number');
		assert.equal(typeof phoneMarginFirst.gapPx, 'number');
		assert.equal(typeof phoneMarginFirst.padPx, 'number');
		assert.equal(typeof phoneMarginFirst.labelPlate.left, 'number');
		assert.equal(typeof phoneMarginFirst.labelPlate.top, 'number');
		assert.equal(typeof phoneMarginFirst.labelPlate.width, 'number');
		assert.equal(typeof phoneMarginFirst.labelPlate.height, 'number');
		assert.equal(phoneMarginFirst.height24.kind, 'letterbox');
		assert.equal(phoneMarginFirst.height24.side, 'right');
		assert.equal(phoneMarginFirst.height24.omitLeader, false);
		assert.equal(typeof phoneMarginFirst.height24.left, 'number');
		assert.equal(typeof phoneMarginFirst.height24.top, 'number');
		assert.equal(typeof phoneMarginFirst.height24.height, 'number');
		assert.equal(phoneMarginFirst.height130.kind, 'overflow');
		assert.equal(phoneMarginFirst.height130.omitLeader, true);
		assert.equal(typeof phoneMarginFirst.height130.height, 'number');
		assert.equal(phoneMarginFirst.fiveHeight40.topBandTops.length, 2);
		assert.equal(phoneMarginFirst.fiveHeight40.bottomBandTops.length, 2);
		assert.equal(typeof phoneMarginFirst.contentH.collapsedLabel, 'number');
		assert.equal(typeof phoneMarginFirst.contentH.letterbox24, 'number');
		assert.equal(typeof phoneMarginFirst.contentH.stylesheetPane, 'number');
		assert.equal(typeof phoneMarginFirst.contentH.collapsedCover, 'number');
		assert.equal(typeof phoneMarginFirst.contentH.tolerancePx, 'number');
		assert.equal(typeof phoneMarginFirst.shift.delta, 'number');
		assert.equal(typeof phoneMarginFirst.shift.plateTop, 'number');
		assert.equal(typeof phoneMarginFirst.shift.noteTop, 'number');
	});

	it('freezes the mode union, the size container, and the server hooks', () => {
		const notes = readFileSync(join(here, 'callout-notes.ts'), 'utf8');
		const display = readFileSync(join(here, 'detail-display.ts'), 'utf8');
		const css = readFileSync(join(here, '../styles/global.css'), 'utf8');
		const astro = readFileSync(join(here, '../pages/records/[id].astro'), 'utf8');
		const template = astro.slice(0, astro.indexOf('<script>'));
		assert.match(notes, /export type CalloutMode = 'margin' \| 'margin-first'/);
		assert.equal(notes.includes('overlay-no-gutter'), false);
		assert.match(notes, /kind: NoteKind/);
		assert.match(display, /export type NoteKind = 'side' \| 'letterbox' \| 'scrim' \| 'overflow'/);
		assert.match(display, /export function placeExpandedPanel/);
		assert.match(css, /\.record-page--split \{\s*--imagery-h: 58svh;\s*\}/);
		assert.match(css, /\.record-page--split \.split-frame\s*\{[^}]*container-type:\s*size/s);
		assert.equal(css.match(/container-type:\s*size/g)?.length, 1);
		assert.equal(template.includes('mark-hit'), false);
		assert.equal(template.includes('data-callouts'), false);
		assert.equal(template.includes('data-expanded'), false);
		assert.equal(template.includes('data-kind'), false);
		assert.equal(template.includes('data-callout'), false);
	});
});
```

- [ ] **Step 2: Run the contract test and see it fail**

Run: `node --experimental-strip-types --test src/data/margin-first.contract.test.ts`

Expected: FAIL. `margin-first-fixtures.ts` is missing, or `placeExpandedPanel` is not exported.

- [ ] **Step 3: Add the fixture, the stubs, and uncouple the old mode assertions**

Create `src/data/margin-first-fixtures.ts` with the numbers from **Global Constraints**:

```ts
export type MarginFirstFixture = {
	id: 'mhjl329';
	viewport: { width: 390; height: 844 };
	rem: 18;
	pane: { width: 354; height: 489.5 };
	stripPx: 49.56;
	letterboxWidth: 171;
	gapPx: 6.3;
	padPx: 13.5;
	labelPlate: { left: 49.56; top: 117.31; width: 254.88; height: 254.88 };
	height24: {
		kind: 'letterbox';
		side: 'right';
		left: 183;
		top: 93.31;
		height: 24;
		omitLeader: false;
	};
	height130: { kind: 'overflow'; height: 130; omitLeader: true };
	fiveHeight40: {
		height: 40;
		topBandTops: readonly [77.31, 31.01];
		bottomBandTops: readonly [372.19, 418.49];
	};
	contentH: {
		collapsedLabel: 281.88;
		letterbox24: 305.88;
		stylesheetPane: 489.5;
		collapsedCover: 185;
		tolerancePx: 2;
	};
	shift: { delta: 79.81; plateTop: 37.5; noteTop: 13.5 };
};

export const phoneMarginFirst: MarginFirstFixture = {
	id: 'mhjl329',
	viewport: { width: 390, height: 844 },
	rem: 18,
	pane: { width: 354, height: 489.5 },
	stripPx: 49.56,
	letterboxWidth: 171,
	gapPx: 6.3,
	padPx: 13.5,
	labelPlate: { left: 49.56, top: 117.31, width: 254.88, height: 254.88 },
	height24: {
		kind: 'letterbox',
		side: 'right',
		left: 183,
		top: 93.31,
		height: 24,
		omitLeader: false,
	},
	height130: { kind: 'overflow', height: 130, omitLeader: true },
	fiveHeight40: {
		height: 40,
		topBandTops: [77.31, 31.01],
		bottomBandTops: [372.19, 418.49],
	},
	contentH: {
		collapsedLabel: 281.88,
		letterbox24: 305.88,
		stylesheetPane: 489.5,
		collapsedCover: 185,
		tolerancePx: 2,
	},
	shift: { delta: 79.81, plateTop: 37.5, noteTop: 13.5 },
};
```

In `src/data/detail-display.ts`, replace the `NotePlacement` kind with `NoteKind` and add the stub above `export { placeNotes }`:

```ts
export type NoteKind = 'side' | 'letterbox' | 'scrim' | 'overflow';

export type NotePlacement = {
	index: number;
	kind: NoteKind;
	side: 'left' | 'right';
	left: number;
	top: number;
	width: number;
	height: number;
	omitLeader: boolean;
};
```

```ts
export function placeExpandedPanel(args: {
	pane: PxSize;
	plate: FrameBox;
	plateSize: PxSize;
	rem: number;
	note: NoteDraft;
	notes: readonly NoteDraft[];
	letterboxHeight: number;
	scrimHeight: number;
	occupied: readonly {
		side: 'left' | 'right';
		left: number;
		top: number;
		width: number;
		height: number;
	}[];
}): ExpandedPanelPlacement {
	void args;
	throw new Error('Not implemented: placeExpandedPanel');
}
```

Add `ExpandedPanelPlacement` next to `NotePlacement`, copied from the signature block. Do not edit the `placeNotes` body in this task.

Replace `src/data/callout-notes.ts` with:

```ts
import type { NoteKind } from './detail-display.ts';

export const CALLOUT_ATTR = 'data-callout';
export const IMAGERY_VAR = '--imagery-h';
export const SIZE_CONTAINER_SELECTOR = '.record-page--split .split-frame';

export type CalloutMode = 'margin' | 'margin-first';

export type SplitCalloutArgs = {
	narrow: boolean;
	stripPx: number;
	rem: number;
	placements: readonly { kind: NoteKind }[];
};

const CIRCLED_NUMERALS = '①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳';

export function noteIndexPrefix(index: number): string {
	if (Number.isInteger(index) && index >= 1 && index <= CIRCLED_NUMERALS.length) {
		return CIRCLED_NUMERALS[index - 1] ?? `(${index})`;
	}
	return `(${index})`;
}

export function splitCalloutMode(args: SplitCalloutArgs): CalloutMode | null {
	void args;
	return null;
}
```

`noteIndexPrefix` stays the current body. Delete the `MIN_NOTE_REM` import. The string `overlay-no-gutter` must not remain in this file.

In `src/data/detail-display.test.ts`, delete `import { splitCalloutMode } from './callout-notes.ts';`. Inside `it('skips the letterbox when the narrow strip is under 6.5rem')`, delete all five `assert.equal(splitCalloutMode(...), ...)` calls: the two `'overlay-no-gutter'` asserts, the `'margin'` assert, the `null` assert for `narrow: false`, and the `null` assert for `kind: 'side'` plus `kind: 'scrim'`. Leave the `placeNotes` asserts in that `it` as they are, including `kind` `'scrim'`. Lane A replaces that `it`. Lane B does not edit this file.

- [ ] **Step 4: Run the contract test and the existing suites**

Run: `node --experimental-strip-types --test src/data/margin-first.contract.test.ts src/data/detail-display.test.ts src/data/callout-notes.test.ts src/data/callout-polish.contract.test.ts src/data/settled-pane.test.ts src/data/callout-settle.source.test.ts src/data/split-stage.test.ts src/data/split-leaders.test.ts`

Expected: PASS. The narrow `it` still expects scrim. `noteIndexPrefix` still returns `①`.

- [ ] **Step 5: Commit**

```bash
git add src/data/margin-first-fixtures.ts src/data/margin-first.contract.test.ts src/data/detail-display.ts src/data/callout-notes.ts src/data/detail-display.test.ts
git commit -m "feat: publish mobile margin-first contract surfaces"
```

---

### Lane A — narrow placement and the expanded panel

**Base:** the Task 0 commit. Every sibling lane uses that same commit.
**Writes:** `src/data/detail-display.ts`, `src/data/detail-display.test.ts`.
**Reads:** `NoteKind`, `NotePlacement`, `ExpandedPanelPlacement`, `placeExpandedPanel`, `placeNotes`, `phoneMarginFirst`, `settledImageryHeight`.
**Done when:** Lane A tests pass on Task 0 alone. `splitCalloutMode` may still return `null`. This lane does not call it.

Do not edit `src/data/callout-notes.ts`, `src/pages/records/[id].astro`, `src/styles/global.css`, `src/data/settled-pane.ts`, `src/data/split-stage.ts`, `src/data/split-leaders.ts`, or `src/data/records.json`.

Desktop path: `placeNotes` returns `placeNarrowNotes` only when `args.narrow === true`. Otherwise the current body runs. The only edit on that body is dropping `narrow` from the destructure and changing `if (!narrow && band + 1e-6 >= MIN_BAND_REM * rem)` to `if (band + 1e-6 >= MIN_BAND_REM * rem)`. Do not edit `it('uses the side strip, then the letterbox, then the scrim')`. Its phone asserts stay `phoneFit[0].kind === 'letterbox'` and `phoneSpill[0].kind === 'scrim'` for calls that omit `narrow`.

#### Task A1: Pack the narrow letterbox, then overflow

**Files:**
- Modify: `src/data/detail-display.ts`
- Modify: `src/data/detail-display.test.ts`
- Test: `src/data/detail-display.test.ts`

**Interfaces:**
- Consumes: `phoneMarginFirst`, `plateBox`, `openingBox`, `settledImageryHeight`, and `placeNotes` as Task 0 left it:

```ts
function placeNotes(args: {
	pane: PxSize;
	plate: FrameBox;
	plateSize: PxSize;
	rem: number;
	notes: readonly NoteDraft[];
	narrow?: boolean;
}): NotePlacement[];
```

- Produces: the same `placeNotes`. When `narrow` is `true`, kinds are `side`, `letterbox`, or `overflow`. When `narrow` is omitted or `false`, kinds stay `side`, `letterbox`, and `scrim`.

- [ ] **Step 1: Write the failing tests**

Replace `it('skips the letterbox when the narrow strip is under 6.5rem')` with the test below. Add `import { settledImageryHeight } from './settled-pane.ts';` and `import { phoneMarginFirst } from './margin-first-fixtures.ts';`. Keep the existing `draft` helper. Add a second helper next to it:

```ts
	function marked(index: number, side: 'left' | 'right', height: number, anchor: number): NoteDraft {
		return {
			index,
			side,
			anchor,
			height,
			mark: { x: 10, y: 10, w: 20, h: 20, badge: 'tl' },
		};
	}
```

```ts
	it('packs a narrow note against S and overflows what does not fit', () => {
		const fixture = phoneMarginFirst;
		const phone = { width: fixture.pane.width, height: fixture.pane.height };
		const labelNatural = { width: 1050, height: 1400 };
		const coverNatural = { width: 1400, height: 1400 };
		const labelPlateSize = { width: 400, height: 400 };
		const coverPlateSize = { width: 400, height: 248 };
		const labelCrop = { x: 274, y: 403, w: 514, h: 514 };
		const coverCrop = { x: 219, y: 210, w: 379, h: 235 };
		const phoneLabel = plateBox(phone, openingBox(phone, labelNatural), labelPlateSize, labelNatural, labelCrop);
		const phoneCover = plateBox(phone, openingBox(phone, coverNatural), coverPlateSize, coverNatural, coverCrop);
		assert.ok(Math.abs(phoneLabel.width - 255) <= 2);
		assert.ok(Math.abs(phoneLabel.height - 255) <= 2);
		assert.ok(Math.abs(phoneCover.width - 255) <= 2);
		assert.ok(Math.abs(phoneCover.height - 158) <= 2);
		assert.ok((phone.width - phoneLabel.width) / 2 / fixture.rem < MIN_NOTE_REM);

		const fit = placeNotes({
			pane: phone,
			plate: phoneLabel,
			plateSize: labelPlateSize,
			rem: fixture.rem,
			narrow: true,
			notes: [marked(0, 'right', 24, 200)],
		});
		assert.equal(fit[0].kind, 'letterbox');
		assert.equal(fit[0].side, 'right');
		assert.equal(fit[0].omitLeader, false);
		assert.equal(fit[0].left, fixture.height24.left);
		assert.ok(Math.abs(fit[0].top - fixture.height24.top) <= 1e-6);
		assert.equal(fit[0].width, fixture.letterboxWidth);
		assert.ok(Math.abs(fit[0].top + fit[0].height - phoneLabel.top) <= 1e-6);
		assert.equal(fit.some((note) => note.kind === 'scrim'), false);

		const spill = placeNotes({
			pane: phone,
			plate: phoneLabel,
			plateSize: labelPlateSize,
			rem: fixture.rem,
			narrow: true,
			notes: [marked(0, 'right', 130, 200)],
		});
		assert.equal(spill[0].kind, 'overflow');
		assert.equal(spill[0].omitLeader, true);
		assert.notEqual(spill[0].height, 130);
		const scaleX = phoneLabel.width / labelPlateSize.width;
		const scaleY = phoneLabel.height / labelPlateSize.height;
		assert.ok(Math.abs(spill[0].left - (phoneLabel.left + 10 * scaleX)) <= 1e-6);
		assert.ok(Math.abs(spill[0].top - (phoneLabel.top + 10 * scaleY)) <= 1e-6);
		assert.ok(Math.abs(spill[0].width - 20 * scaleX) <= 1e-6);
		assert.ok(Math.abs(spill[0].height - 20 * scaleY) <= 1e-6);

		const five = placeNotes({
			pane: phone,
			plate: phoneLabel,
			plateSize: labelPlateSize,
			rem: fixture.rem,
			narrow: true,
			notes: [0, 1, 2, 3, 4].map((index) => marked(index, 'right', 40, index)),
		});
		assert.deepEqual(
			five.map((note) => note.kind),
			['letterbox', 'letterbox', 'letterbox', 'letterbox', 'overflow'],
		);
		const tops = [77.31, 31.01, 372.19, 418.49];
		tops.forEach((top, index) => {
			assert.ok(Math.abs(five[index].top - top) <= 1e-6);
			assert.equal(five[index].omitLeader, false);
		});
		assert.equal(five[4].omitLeader, true);

		const desk = { width: 801, height: 900 };
		const deskLabel = plateBox(desk, openingBox(desk, labelNatural), labelPlateSize, labelNatural, labelCrop);
		const marginNotes = placeNotes({
			pane: desk,
			plate: deskLabel,
			plateSize: labelPlateSize,
			rem: fixture.rem,
			narrow: true,
			notes: [draft(0, 'left'), draft(1, 'right')],
		});
		assert.deepEqual(
			marginNotes.map((note) => note.kind),
			['side', 'side'],
		);
		const dropped = placeNotes({
			pane: desk,
			plate: deskLabel,
			plateSize: labelPlateSize,
			rem: fixture.rem,
			narrow: true,
			notes: [marked(0, 'left', 4000, 200)],
		});
		assert.notEqual(dropped[0].kind, 'scrim');
		assert.notEqual(dropped[0].kind, 'side');

		const bare = settledImageryHeight({
			paneHeight: phone.height,
			plate: { top: phoneLabel.top, bottom: phoneLabel.top + phoneLabel.height },
			notes: [],
			padPx: fixture.padPx,
		});
		const withLetterbox = settledImageryHeight({
			paneHeight: phone.height,
			plate: { top: phoneLabel.top, bottom: phoneLabel.top + phoneLabel.height },
			notes: [{ top: fit[0].top, bottom: fit[0].top + fit[0].height }],
			padPx: fixture.padPx,
		});
		const coverBare = settledImageryHeight({
			paneHeight: phone.height,
			plate: { top: phoneCover.top, bottom: phoneCover.top + phoneCover.height },
			notes: [],
			padPx: fixture.padPx,
		});
		assert.equal(bare, fixture.contentH.collapsedLabel);
		assert.equal(withLetterbox, fixture.contentH.letterbox24);
		assert.ok(bare < fixture.contentH.stylesheetPane);
		assert.ok(Math.abs(coverBare - fixture.contentH.collapsedCover) <= fixture.contentH.tolerancePx);
		assert.equal(fixture.shift.delta, 79.81);
		assert.equal(fixture.shift.plateTop, 37.5);
		assert.equal(fixture.shift.noteTop, 13.5);

		const frozen = { ...phoneLabel };
		placeNotes({
			pane: phone,
			plate: phoneLabel,
			plateSize: labelPlateSize,
			rem: fixture.rem,
			narrow: true,
			notes: [marked(0, 'right', 24, 200)],
		});
		assert.deepEqual(phoneLabel, frozen);
	});
```

The collapsed-overflow case calls `settledImageryHeight` with `notes: []`. Do not pass the overflow rect. That is the unit gate “a collapsed overflow rect is not an argument.”

- [ ] **Step 2: Run the test and see it fail**

Run: `node --experimental-strip-types --test --test-name-pattern 'packs a narrow note against S' src/data/detail-display.test.ts`

Expected: FAIL. The height-24 note is still `scrim`, not `letterbox`.

- [ ] **Step 3: Implement `placeNarrowNotes` and leave the desktop body**

Insert this function above `function placeNotes` in `src/data/detail-display.ts`. It uses the existing `anchorCss` and `rectsOverlap`.

```ts
function placeNarrowNotes(args: {
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
	const plateRect: CssRect = {
		left: plate.left,
		top: plate.top,
		right: plate.left + plate.width,
		bottom: plate.top + plate.height,
	};
	const overlapsPlaced = (rect: CssRect) => {
		if (rectsOverlap(rect, plateRect)) return true;
		for (const note of placed.values()) {
			const box = {
				left: note.left,
				top: note.top,
				right: note.left + note.width,
				bottom: note.top + note.height,
			};
			if (rectsOverlap(rect, box)) return true;
		}
		return false;
	};
	const scaleX = plateSize.width === 0 ? 0 : plate.width / plateSize.width;
	const scaleY = plateSize.height === 0 ? 0 : plate.height / plateSize.height;

	for (const side of ['left', 'right'] as const) {
		const group = notes.filter((note) => note.side === side).sort(byAnchor);
		if (group.length === 0) continue;
		const strip = (pane.width - plate.width) / 2;
		const band = (pane.height - plate.height) / 2;
		const queue: NoteDraft[] = [];
		if (strip + 1e-6 >= MIN_NOTE_REM * rem) {
			const width = Math.min(NOTE_CAP_REM * rem, Math.max(0, strip));
			const left = side === 'left' ? plate.left - width : plate.left + plate.width;
			let prevBottom = Number.NEGATIVE_INFINITY;
			for (const note of group) {
				let top = anchorCss(note, plate, plateSize) - note.height / 2;
				if (top < 0) top = 0;
				if (top < prevBottom + gap) top = prevBottom + gap;
				if (top + note.height > pane.height + 1e-6) {
					queue.push(note);
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
		} else {
			queue.push(...group);
		}
		const width = Math.min(NOTE_CAP_REM * rem, pane.width / 2);
		const left = side === 'left' ? 0 : pane.width - width;
		let nextBottom = plate.top;
		let nextTop = plate.top + plate.height;
		for (const note of queue) {
			const topCandidate = nextBottom - note.height;
			const topRect = { left, top: topCandidate, right: left + width, bottom: nextBottom };
			const topFits =
				topCandidate >= plate.top - band - 1e-6 &&
				topCandidate >= -1e-6 &&
				!overlapsPlaced(topRect);
			if (topFits) {
				placed.set(note.index, {
					index: note.index,
					kind: 'letterbox',
					side,
					left,
					top: topCandidate,
					width,
					height: note.height,
					omitLeader: false,
				});
				nextBottom = topCandidate - gap;
				continue;
			}
			const bottomEdge = nextTop + note.height;
			const bottomRect = { left, top: nextTop, right: left + width, bottom: bottomEdge };
			if (bottomEdge <= pane.height + 1e-6 && !overlapsPlaced(bottomRect)) {
				placed.set(note.index, {
					index: note.index,
					kind: 'letterbox',
					side,
					left,
					top: nextTop,
					width,
					height: note.height,
					omitLeader: false,
				});
				nextTop = bottomEdge + gap;
				continue;
			}
			placed.set(note.index, {
				index: note.index,
				kind: 'overflow',
				side,
				left: plate.left + note.mark.x * scaleX,
				top: plate.top + note.mark.y * scaleY,
				width: note.mark.w * scaleX,
				height: note.mark.h * scaleY,
				omitLeader: true,
			});
		}
	}

	return notes.map((note) => {
		const found = placed.get(note.index);
		if (found) return found;
		return {
			index: note.index,
			kind: 'overflow',
			side: note.side,
			left: 0,
			top: 0,
			width: 0,
			height: 0,
			omitLeader: true,
		};
	});
}
```

At the start of `placeNotes`, return before the current destructure:

```ts
	if (args.narrow === true) return placeNarrowNotes(args);
	const { pane, plate, plateSize, rem, notes } = args;
```

Delete `narrow = false` from that destructure. Change the letterbox gate to:

```ts
		if (band + 1e-6 >= MIN_BAND_REM * rem) {
```

Do not otherwise edit the scrim loop. A shared edge with `S` stays a fit because `rectsOverlap` treats equal edges as clear. Do not nudge a letterbox note by 4px. Do not push a narrow note into the scrim loop.

- [ ] **Step 4: Run the tests and see them pass**

Run: `node --experimental-strip-types --test src/data/detail-display.test.ts src/data/margin-first.contract.test.ts src/data/settled-pane.test.ts`

Expected: PASS. The untouched `it('uses the side strip, then the letterbox, then the scrim')` still reports phone height 24 as `letterbox` and phone height 130 as `scrim` when `narrow` is omitted.

- [ ] **Step 5: Commit**

```bash
git add src/data/detail-display.ts src/data/detail-display.test.ts
git commit -m "feat: pack narrow notes into the letterbox"
```

#### Task A2: Place the one expanded panel

**Files:**
- Modify: `src/data/detail-display.ts` (`placeExpandedPanel` only)
- Modify: `src/data/detail-display.test.ts`
- Test: `src/data/detail-display.test.ts`

**Interfaces:**
- Consumes: the Task 0 `placeExpandedPanel` signature, `NoteDraft`, `phoneMarginFirst`, `plateBox`.
- Produces: the same signature, with a body. Lane C calls this exact name and these exact fields.

- [ ] **Step 1: Write the failing tests**

Append this `it` inside `describe('margin-first notes')`:

```ts
	it('puts an expanded sentence in the leftover letterbox, else one scrim', () => {
		const fixture = phoneMarginFirst;
		const phone = { width: fixture.pane.width, height: fixture.pane.height };
		const labelNatural = { width: 1050, height: 1400 };
		const labelPlateSize = { width: 400, height: 400 };
		const labelCrop = { x: 274, y: 403, w: 514, h: 514 };
		const plate = plateBox(phone, openingBox(phone, labelNatural), labelPlateSize, labelNatural, labelCrop);
		const note = marked(0, 'right', 24, 200);
		const open = placeExpandedPanel({
			pane: phone,
			plate,
			plateSize: labelPlateSize,
			rem: fixture.rem,
			note,
			notes: [note],
			letterboxHeight: 24,
			scrimHeight: 40,
			occupied: [],
		});
		assert.equal(open.kind, 'letterbox');
		assert.equal(open.side, 'right');
		assert.equal(open.omitLeader, false);
		assert.equal(open.left, fixture.height24.left);
		assert.ok(Math.abs(open.top - fixture.height24.top) <= 1e-6);
		assert.equal(open.width, fixture.letterboxWidth);

		const occupiedTop = plate.top - 24;
		const beside = placeExpandedPanel({
			pane: phone,
			plate,
			plateSize: labelPlateSize,
			rem: fixture.rem,
			note,
			notes: [note],
			letterboxHeight: 24,
			scrimHeight: 40,
			occupied: [
				{
					side: 'right',
					left: fixture.height24.left,
					top: occupiedTop,
					width: fixture.letterboxWidth,
					height: 24,
				},
			],
		});
		assert.equal(beside.kind, 'letterbox');
		assert.ok(Math.abs(beside.top - (occupiedTop - fixture.gapPx - 24)) <= 1e-6);
		assert.equal(beside.omitLeader, false);

		const scrim = placeExpandedPanel({
			pane: phone,
			plate,
			plateSize: labelPlateSize,
			rem: fixture.rem,
			note: marked(0, 'right', 130, 200),
			notes: [marked(0, 'right', 130, 200)],
			letterboxHeight: 130,
			scrimHeight: 40,
			occupied: [],
		});
		assert.equal(scrim.kind, 'scrim');
		assert.ok(scrim.width < plate.width / 2);
		assert.ok(scrim.width <= 9.5 * fixture.rem + 1e-6);
		assert.equal(scrim.omitLeader, false);

		const blocked = placeExpandedPanel({
			pane: phone,
			plate,
			plateSize: labelPlateSize,
			rem: fixture.rem,
			note: marked(0, 'right', 130, 200),
			notes: [marked(0, 'right', 130, 200)],
			letterboxHeight: 130,
			scrimHeight: plate.height + 40,
			occupied: [],
		});
		assert.equal(blocked.kind, 'scrim');
		assert.equal(blocked.omitLeader, true);
		assert.ok(blocked.width < plate.width / 2);
	});
```

- [ ] **Step 2: Run the test and see it fail**

Run: `node --experimental-strip-types --test --test-name-pattern 'leftover letterbox' src/data/detail-display.test.ts`

Expected: FAIL. The stub throws `Not implemented: placeExpandedPanel`.

- [ ] **Step 3: Replace the stub**

Replace `placeExpandedPanel` with this body. `anchorCss` and `rectsOverlap` are already in the file. Do not change `placeNotes` or `placeNarrowNotes`.

```ts
export function placeExpandedPanel(args: {
	pane: PxSize;
	plate: FrameBox;
	plateSize: PxSize;
	rem: number;
	note: NoteDraft;
	notes: readonly NoteDraft[];
	letterboxHeight: number;
	scrimHeight: number;
	occupied: readonly {
		side: 'left' | 'right';
		left: number;
		top: number;
		width: number;
		height: number;
	}[];
}): ExpandedPanelPlacement {
	const { pane, plate, plateSize, rem, note, notes, letterboxHeight, scrimHeight, occupied } = args;
	const gap = NOTE_GAP_REM * rem;
	const band = (pane.height - plate.height) / 2;
	const plateBottom = plate.top + plate.height;
	const width = Math.min(NOTE_CAP_REM * rem, pane.width / 2);
	const left = note.side === 'left' ? 0 : pane.width - width;
	const plateRect: CssRect = {
		left: plate.left,
		top: plate.top,
		right: plate.left + plate.width,
		bottom: plateBottom,
	};
	const overlaps = (rect: CssRect) => {
		if (rectsOverlap(rect, plateRect)) return true;
		return occupied.some((box) =>
			rectsOverlap(rect, {
				left: box.left,
				top: box.top,
				right: box.left + box.width,
				bottom: box.top + box.height,
			}),
		);
	};

	let nextBottom = plate.top;
	let nextTop = plateBottom;
	for (const box of occupied) {
		if (box.side !== note.side) continue;
		const bottom = box.top + box.height;
		if (bottom <= plate.top + 1e-6) nextBottom = Math.min(nextBottom, box.top - gap);
		if (box.top >= plateBottom - 1e-6) nextTop = Math.max(nextTop, bottom + gap);
	}
	const topCandidate = nextBottom - letterboxHeight;
	const topRect = { left, top: topCandidate, right: left + width, bottom: nextBottom };
	if (
		topCandidate >= plate.top - band - 1e-6 &&
		topCandidate >= -1e-6 &&
		!overlaps(topRect)
	) {
		return {
			kind: 'letterbox',
			side: note.side,
			left,
			top: topCandidate,
			width,
			height: letterboxHeight,
			omitLeader: false,
		};
	}
	const bottomEdge = nextTop + letterboxHeight;
	const bottomRect = { left, top: nextTop, right: left + width, bottom: bottomEdge };
	if (bottomEdge <= pane.height + 1e-6 && !overlaps(bottomRect)) {
		return {
			kind: 'letterbox',
			side: note.side,
			left,
			top: nextTop,
			width,
			height: letterboxHeight,
			omitLeader: false,
		};
	}

	const scaleX = plateSize.width === 0 ? 0 : plate.width / plateSize.width;
	const scaleY = plateSize.height === 0 ? 0 : plate.height / plateSize.height;
	const obstacles = notes.map((item) => ({
		left: plate.left + item.mark.x * scaleX,
		top: plate.top + item.mark.y * scaleY,
		right: plate.left + (item.mark.x + item.mark.w) * scaleX,
		bottom: plate.top + (item.mark.y + item.mark.h) * scaleY,
	}));
	const inset = SCRIM_INSET_REM * rem;
	const scrimWidth = Math.min(NOTE_CAP_REM * rem, Math.max(0, plate.width / 2 - inset));
	const scrimLeft = (side: 'left' | 'right') =>
		side === 'left' ? plate.left + inset : plate.left + plate.width - inset - scrimWidth;
	const area = { left: 0, right: 0 };
	for (const item of notes) area[item.side] += item.mark.w * item.mark.h;

	const minTop = plate.top;
	const maxTop = plate.top + plate.height - scrimHeight;
	let found: number | null = null;
	if (maxTop >= minTop - 1e-6 && scrimWidth > 0) {
		let origin = anchorCss(note, plate, plateSize) - scrimHeight / 2;
		if (origin < minTop) origin = minTop;
		if (origin > maxTop) origin = maxTop;
		const limit = Math.ceil(Math.max(0, maxTop - minTop) / NUDGE_STEP_PX) + 1;
		for (let step = 0; step <= limit && found === null; step += 1) {
			const candidates =
				step === 0 ? [origin] : [origin + step * NUDGE_STEP_PX, origin - step * NUDGE_STEP_PX];
			for (const top of candidates) {
				if (top < minTop - 1e-6 || top > maxTop + 1e-6) continue;
				const rect = {
					left: scrimLeft(note.side),
					top,
					right: scrimLeft(note.side) + scrimWidth,
					bottom: top + scrimHeight,
				};
				if (!obstacles.some((box) => rectsOverlap(rect, box))) {
					found = top;
					break;
				}
			}
		}
	}
	if (found !== null) {
		return {
			kind: 'scrim',
			side: note.side,
			left: scrimLeft(note.side),
			top: found,
			width: scrimWidth,
			height: scrimHeight,
			omitLeader: false,
		};
	}
	const other = note.side === 'left' ? 'right' : 'left';
	const home = area[note.side] <= area[other] ? note.side : other;
	const fallbackMax = Math.max(minTop, plate.top + plate.height - scrimHeight);
	let top = anchorCss(note, plate, plateSize) - scrimHeight / 2;
	if (top < minTop) top = minTop;
	if (top > fallbackMax) top = fallbackMax;
	return {
		kind: 'scrim',
		side: home,
		left: scrimLeft(home),
		top,
		width: scrimWidth,
		height: scrimHeight,
		omitLeader: true,
	};
}
```

`NUDGE_STEP_PX` is already the module const `4`. A letterbox hit returns no scrim. A scrim hit keeps `omitLeader: false`. The blocked fallback keeps `omitLeader: true` and the same width, which is under half of `S`.

- [ ] **Step 4: Run the tests and see them pass**

Run: `node --experimental-strip-types --test src/data/detail-display.test.ts src/data/margin-first.contract.test.ts`

Expected: PASS. `placeExpandedPanel` no longer throws. The desktop scrim tests in the same file still pass.

- [ ] **Step 5: Commit**

```bash
git add src/data/detail-display.ts src/data/detail-display.test.ts
git commit -m "feat: place the expanded overflow panel"
```

---

### Lane B — callout mode

**Base:** the Task 0 commit. Do not wait for Lane A. Do not rebase onto Lane A.
**Writes:** `src/data/callout-notes.ts`, `src/data/callout-notes.test.ts`.
**Reads:** `CalloutMode`, `SplitCalloutArgs`, `NoteKind`, `splitCalloutMode`.
**Done when:** the mode tests pass on Task 0 alone. This lane does not call `placeNotes`.

Do not edit `src/data/detail-display.ts` or `src/data/detail-display.test.ts`. The page already passes `stripPx` and `rem`. Keep both fields. Do not branch on them.

#### Task B1: Return margin or margin-first

**Files:**
- Modify: `src/data/callout-notes.ts`
- Modify: `src/data/callout-notes.test.ts`
- Test: `src/data/callout-notes.test.ts`

**Interfaces:**
- Consumes: the Task 0 signature, copied here:

```ts
export function splitCalloutMode(args: SplitCalloutArgs): CalloutMode | null;
```

`SplitCalloutArgs` is `{ narrow: boolean; stripPx: number; rem: number; placements: readonly { kind: NoteKind }[] }`. `CalloutMode` is `'margin' | 'margin-first'`. `NoteKind` is `'side' | 'letterbox' | 'scrim' | 'overflow'`.

- Produces: that same function. `narrow === false` and an empty list return `null`. Every `kind: 'side'` returns `'margin'`. Every other non-empty narrow list returns `'margin-first'`.

- [ ] **Step 1: Write the failing test**

Append this describe to `src/data/callout-notes.test.ts`. Add `import { splitCalloutMode } from './callout-notes.ts';` beside the existing `noteIndexPrefix` import. Leave the prefix `describe` as it is.

```ts
describe('split callout mode', () => {
	it('returns margin only when every narrow note is side', () => {
		const rem = 18;
		assert.equal(
			splitCalloutMode({
				narrow: false,
				stripPx: 49.56,
				rem,
				placements: [{ kind: 'letterbox' }],
			}),
			null,
		);
		assert.equal(
			splitCalloutMode({ narrow: true, stripPx: 49.56, rem, placements: [] }),
			null,
		);
		assert.equal(
			splitCalloutMode({
				narrow: true,
				stripPx: 49.56,
				rem,
				placements: [{ kind: 'side' }, { kind: 'side' }],
			}),
			'margin',
		);
		assert.equal(
			splitCalloutMode({
				narrow: true,
				stripPx: 49.56,
				rem,
				placements: [{ kind: 'letterbox' }],
			}),
			'margin-first',
		);
		assert.equal(
			splitCalloutMode({
				narrow: true,
				stripPx: 0,
				rem,
				placements: [{ kind: 'overflow' }],
			}),
			'margin-first',
		);
		assert.equal(
			splitCalloutMode({
				narrow: true,
				stripPx: 6.5 * rem,
				rem,
				placements: [{ kind: 'side' }, { kind: 'scrim' }],
			}),
			'margin-first',
		);
		assert.equal(
			splitCalloutMode({
				narrow: true,
				stripPx: 0,
				rem,
				placements: [{ kind: 'letterbox' }],
			}),
			splitCalloutMode({
				narrow: true,
				stripPx: 999,
				rem,
				placements: [{ kind: 'letterbox' }],
			}),
		);
	});
});
```

- [ ] **Step 2: Run the test and see it fail**

Run: `node --experimental-strip-types --test --test-name-pattern 'every narrow note is side' src/data/callout-notes.test.ts`

Expected: FAIL. Task 0 returns `null` for the letterbox row, not `'margin-first'`.

- [ ] **Step 3: Replace the null body**

```ts
export function splitCalloutMode(args: SplitCalloutArgs): CalloutMode | null {
	void args.stripPx;
	void args.rem;
	if (!args.narrow) return null;
	if (args.placements.length === 0) return null;
	if (args.placements.every((note) => note.kind === 'side')) return 'margin';
	return 'margin-first';
}
```

Keep `CalloutMode` and `SplitCalloutArgs` as Task 0 wrote them. Do not reintroduce `overlay-no-gutter`. Do not import `MIN_NOTE_REM`.

- [ ] **Step 4: Run the tests and see them pass**

Run: `node --experimental-strip-types --test src/data/callout-notes.test.ts src/data/margin-first.contract.test.ts src/data/callout-polish.contract.test.ts`

Expected: PASS. `noteIndexPrefix(1)` is still `①`. The contract test still sees no `overlay-no-gutter`.

- [ ] **Step 5: Commit**

```bash
git add src/data/callout-notes.ts src/data/callout-notes.test.ts
git commit -m "feat: mark narrow callouts margin-first"
```

---

### Lane C — tap, visible notes, and the no-JS list

**Base:** the Task 0 commit. Do not wait for Lane A or Lane B. Do not rebase onto them to start.
**Writes:** `src/pages/records/[id].astro`, `src/styles/global.css`, `src/data/margin-first.source.test.ts`.
**Reads:** `placeNotes`, `placeExpandedPanel`, `splitCalloutMode`, `NoteKind`, `settledImageryHeight`, `selectSplitLeaders`. On Task 0, `placeExpandedPanel` throws and `splitCalloutMode` returns `null`. This lane’s tests read source. They do not call those functions. The live tap needs Lane A’s body and the live attribute needs Lane B’s body; that is the Integration checkpoint, not a reason to serialize this lane.
**Done when:** `margin-first.source.test.ts` and `callout-settle.source.test.ts` pass on Task 0 plus this lane.

`src/data/callout-settle.source.test.ts` is not this lane’s file. Keep these strings true so that test stays green:

- `positionSplit` still calls `removeProperty('--imagery-h')` before `layoutSplit(figure)`, still `delete figure.dataset.paneSettle`, still passes `narrow: isNarrow()`, and still does not call `plateBox(` or `settledImageryHeight`.
- `layoutSplit` still checks `paneSettle` before `plateBox(`.
- `collapseToContent` still calls `settledImageryHeight(` and `0.75 * remPx()`, and still does not call `plateBox`, `openingBox`, or `cameraBox`.
- The file still has `selectSplitLeaders(`, `const shortPx = 0.35 * remPx()`, `notesOpacity > 0`, `collapseToContent(active, 'page')`, and `collapseToContent(frame, 'frame')`.
- `showSettled` still calls `position(frame)` before `collapseToContent(frame, 'frame')`.
- The `@media (min-width: 48rem)` block still sets `.split-frame` to `height: 100svh` and does not read `var(--imagery-h)`. The `1.618fr` / `1fr` tracks stay.

Server HTML for the mark list stays the current `<ol class="mark-list">` with `.mark-label` and `.mark-note`. Do not add a second list, a `mark-hit` button, or `data-kind` in the template. The button is created in the script, and only for `kind === 'overflow'`.

The paragraph’s offset parent is the positioned `<li>`. Lane A’s panel `left` / `top` are plate coordinates. Write the paragraph at `panel.left - place.left` and `panel.top - place.top`, where `place` is the overflow mark rect. That is the plate-frame delta from the spec (`panel.left - S.left`, minus the li’s own `place.left - S.left`). Do not assign the plate-frame numbers to the paragraph directly. Do not move the button off the mark box.

#### Task C1: Measure once, hide overflow text, and flow the unplaced list

**Files:**
- Create: `src/data/margin-first.source.test.ts`
- Modify: `src/pages/records/[id].astro` (`positionSplit` and the detail-display import)
- Modify: `src/styles/global.css`
- Test: `src/data/margin-first.source.test.ts`

**Interfaces:**
- Consumes: `placeNotes` with `narrow`, `splitCalloutMode`, `MIN_NOTE_REM`, `NOTE_CAP_REM`.
- Produces: `data-kind` on each li, `data-callouts="placed"` on the frame, one `placeNotes` call per `positionSplit`, and the no-JS CSS below. C2 consumes `data-kind`.

- [ ] **Step 1: Write the failing source test**

Create `src/data/margin-first.source.test.ts`:

```ts
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const here = dirname(fileURLToPath(import.meta.url));

describe('margin-first page wiring', () => {
	it('measures once and hides a collapsed overflow sentence', () => {
		const astro = readFileSync(join(here, '../pages/records/[id].astro'), 'utf8');
		const css = readFileSync(join(here, '../styles/global.css'), 'utf8');
		const template = astro.slice(0, astro.indexOf('<script>'));
		const positionSplit = astro.slice(astro.indexOf('function positionSplit'), astro.indexOf('function settle'));
		assert.equal(template.includes('mark-hit'), false);
		assert.equal(template.includes('data-callouts'), false);
		assert.equal(positionSplit.includes('for (let pass = 0; pass < 2'), false);
		assert.match(positionSplit, /data-kind/);
		assert.match(positionSplit, /data-callouts', 'placed'/);
		assert.match(positionSplit, /narrow: isNarrow\(\)/);
		assert.equal(positionSplit.includes('plateBox('), false);
		assert.equal(positionSplit.includes('settledImageryHeight'), false);
		assert.match(
			css,
			/\.record-page--split \.split-frame\[data-callouts='placed'\] \.mark-list li\[data-kind='overflow'\]:not\(\[data-expanded='true'\]\) \.mark-note/,
		);
		assert.match(css, /max-width: 47\.99rem/);
		assert.match(css, /split-frame:not\(\[data-callouts='placed'\]\) \.mark-list li/);
		assert.equal(css.match(/container-type:\s*size/g)?.length, 1);
		const desktopStart = css.indexOf('@media (min-width: 48rem)');
		const desktopBody = css.slice(desktopStart, css.indexOf('@media', desktopStart + 10));
		assert.match(desktopBody, /height:\s*100svh/);
		assert.doesNotMatch(desktopBody, /data-kind/);
		assert.doesNotMatch(desktopBody, /mark-hit/);
	});
});
```

- [ ] **Step 2: Run the test and see it fail**

Run: `node --experimental-strip-types --test src/data/margin-first.source.test.ts`

Expected: FAIL. `positionSplit` still contains `for (let pass = 0; pass < 2`, and the overflow CSS rule is missing.

- [ ] **Step 3: Measure at the first band’s width, place once, and add the narrow CSS**

Add `MIN_NOTE_REM` and `NOTE_CAP_REM` to the existing `../../data/detail-display` import in the page script.

Replace `positionSplit` with:

```ts
		function measureNoteWidth(figure: HTMLElement, plateWidthPx: number, rem: number): number {
			const strip = (figure.clientWidth - plateWidthPx) / 2;
			if (strip + 1e-6 >= MIN_NOTE_REM * rem) {
				return Math.min(NOTE_CAP_REM * rem, Math.max(0, strip));
			}
			return Math.min(NOTE_CAP_REM * rem, figure.clientWidth / 2);
		}

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
			const measureWidth = measureNoteWidth(figure, pose.plate.width, root);
			for (const li of items) {
				delete li.dataset.kind;
				li.removeAttribute('data-expanded');
				li.classList.remove('is-scrim');
				const sentence = li.querySelector<HTMLElement>('.mark-note');
				if (sentence) {
					sentence.style.left = '';
					sentence.style.top = '';
					sentence.style.width = '';
					sentence.style.position = '';
					sentence.style.padding = '';
					sentence.style.display = '';
				}
				li.style.width = `${measureWidth}px`;
			}
			void list.offsetHeight;
			const placed = placeNotes({
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
				li.dataset.kind = place.kind;
				li.setAttribute('data-omit-leader', place.omitLeader ? '1' : '0');
				li.classList.toggle('is-scrim', place.kind === 'scrim');
				li.style.left = `${place.left - pose.plate.left}px`;
				li.style.right = 'auto';
				li.style.top = `${place.top - pose.plate.top}px`;
				li.style.bottom = 'auto';
				li.style.width = `${place.width}px`;
				li.style.maxWidth = 'none';
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
			figure.setAttribute('data-callouts', 'placed');
			writeLeaders(figure, items, plate, plateWidth, plateHeight);
		}
```

Delete the old two-pass `positionSplit`. The height read is the `<li>` border box at the first band’s width, taken once, before `data-kind` hides anything. That box includes `.mark-label` when `showMarkLabel` rendered one, and it has no scrim padding because `is-scrim` was removed first. Do not measure again after the overflow sentence is hidden. A later `placeExpandedPanel` measurement is only for the open sentence; it does not call `placeNotes` again.

Append this block at the end of `src/styles/global.css`. Do not put it inside `@media (min-width: 48rem)`. Do not change `.record-page--split .mark-list li.is-scrim`.

```css
@media (max-width: 47.99rem) {
	.record-page--split .split-frame[data-callouts='placed'] .mark-list li[data-kind='overflow']:not([data-expanded='true']) .mark-note,
	.record-page--split .split-frame[data-callouts='placed'] .mark-list li[data-kind='overflow']:not([data-expanded='true']) .mark-label {
		display: none;
	}

	.record-page--split .split-frame:not([data-callouts='placed']) .mark-list {
		position: static;
		inset: auto;
	}

	.record-page--split .split-frame:not([data-callouts='placed']) .mark-list li {
		position: static;
		width: auto;
		max-width: none;
		left: auto;
		right: auto;
		top: auto;
	}

	.record-page--split .split-frame:not([data-callouts='placed']) .mark-leaders {
		display: none;
	}

	.record-page--split .split-stage:not(:has(.split-frame[data-callouts='placed'])) .split-imagery {
		overflow: visible;
		height: auto;
	}

	.record-page--split .split-stage:not(:has(.split-frame[data-callouts='placed'])) .split-read {
		position: static;
		top: auto;
		height: auto;
		margin-top: 0;
		overflow: visible;
	}
}
```

`.split-read` is inside `.split-stage`, not a sibling of `.split-imagery`. The `:has` selector is on `.split-stage`. At `min-width: 48rem` this query does not apply, so desktop no-JS stays the absolute list. `.mark-box` is not hidden.

- [ ] **Step 4: Run the source tests and see them pass**

Run: `node --experimental-strip-types --test src/data/margin-first.source.test.ts src/data/callout-settle.source.test.ts src/data/margin-first.contract.test.ts`

Expected: PASS. The server slice still has no `mark-hit`. `container-type: size` still occurs once.

- [ ] **Step 5: Commit**

```bash
git add src/pages/records/[id].astro src/styles/global.css src/data/margin-first.source.test.ts
git commit -m "feat: place narrow notes once and flow the unplaced list"
```

#### Task C2: Toggle one panel and count only visible notes

**Files:**
- Modify: `src/pages/records/[id].astro`
- Modify: `src/styles/global.css`
- Modify: `src/data/margin-first.source.test.ts`
- Test: `src/data/margin-first.source.test.ts`

**Interfaces:**
- Consumes: C1’s `positionSplit` and `data-kind`. Lane A’s `placeExpandedPanel` signature, copied here:

```ts
export function placeExpandedPanel(args: {
	pane: PxSize;
	plate: FrameBox;
	plateSize: PxSize;
	rem: number;
	note: NoteDraft;
	notes: readonly NoteDraft[];
	letterboxHeight: number;
	scrimHeight: number;
	occupied: readonly {
		side: 'left' | 'right';
		left: number;
		top: number;
		width: number;
		height: number;
	}[];
}): ExpandedPanelPlacement;
```

- Produces: one `openOverflowId` for the document, `mark-hit`, `data-expanded`, `aria-expanded`, and a `collapseToContent` notes list that skips a collapsed overflow `<li>`. An expanded sentence counts as the paragraph’s border box.

- [ ] **Step 1: Extend the source test**

Add this `it` to `describe('margin-first page wiring')`:

```ts
	it('toggles one overflow sentence and skips a collapsed box in contentH', () => {
		const astro = readFileSync(join(here, '../pages/records/[id].astro'), 'utf8');
		const css = readFileSync(join(here, '../styles/global.css'), 'utf8');
		const template = astro.slice(0, astro.indexOf('<script>'));
		assert.equal(template.includes('mark-hit'), false);
		assert.match(astro, /placeExpandedPanel/);
		assert.match(astro, /className = 'mark-hit'/);
		assert.match(astro, /aria-expanded/);
		assert.match(astro, /aria-controls/);
		assert.match(astro, /aria-label/);
		assert.match(astro, /openOverflowId/);
		assert.match(astro, /event\.key !== 'Escape'/);
		assert.match(astro, /data-expanded', 'true'/);
		const collapse = astro.slice(astro.indexOf('function collapseToContent'), astro.indexOf('function applyFrame'));
		assert.match(collapse, /data-kind === 'overflow'/);
		assert.match(collapse, /data-expanded/);
		assert.equal(collapse.includes('plateBox'), false);
		assert.match(css, /\.mark-hit/);
		assert.match(css, /li\[data-kind='overflow'\]\.is-scrim \.mark-note/);
		assert.match(css, /background:\s*var\(--bg\)/);
		const resize = astro.slice(astro.indexOf("addEventListener('resize'"), astro.indexOf('document.fonts'));
		assert.match(resize, /openOverflowId = null/);
	});
```

- [ ] **Step 2: Run the test and see it fail**

Run: `node --experimental-strip-types --test --test-name-pattern 'toggles one overflow' src/data/margin-first.source.test.ts`

Expected: FAIL. `placeExpandedPanel` is not imported in the page, and `collapseToContent` does not mention `data-kind`.

- [ ] **Step 3: Add the hit button, the panel, and the visible-note union**

Add `placeExpandedPanel` and `SCRIM_INSET_REM` to the existing `../../data/detail-display` import. `MIN_NOTE_REM` and `NOTE_CAP_REM` are already added in C1. Do not remove `openingBox`, `placeNotes`, `plateBox`, `resolvedSide`, `stackTops`, `zoomImageBox`, `leaderEndpoints`, or `leaderHitsNote`. The import gains these two names:

```ts
			placeExpandedPanel,
			SCRIM_INSET_REM,
```

Above `measureNoteWidth`, add:

```ts
		let openOverflowId: string | null = null;

		function syncOverflowHit(li: HTMLLIElement, overflow: boolean): void {
			const sentence = li.querySelector<HTMLElement>('.mark-note');
			let button = li.querySelector<HTMLButtonElement>('.mark-hit');
			if (!overflow || !sentence) {
				button?.remove();
				return;
			}
			if (!button) {
				button = document.createElement('button');
				button.type = 'button';
				button.className = 'mark-hit';
				li.appendChild(button);
			}
			if (!sentence.id) sentence.id = `${li.id}-note`;
			button.setAttribute('aria-controls', sentence.id);
			button.setAttribute('aria-label', sentence.textContent?.replace(/\s+/g, ' ').trim() ?? '');
			if (button.getAttribute('aria-expanded') !== 'true') button.setAttribute('aria-expanded', 'false');
		}

		function refreshSplit(): void {
			const page = document.querySelector<HTMLElement>('.record-page--split');
			if (!page) return;
			const mode = document.documentElement.dataset.motion === 'ok' ? 'page' : 'frame';
			for (const frame of page.querySelectorAll<HTMLElement>('.split-frame')) {
				if (frame.dataset.notes !== 'aligned') continue;
				try {
					position(frame);
					if (isNarrow()) collapseToContent(frame, mode);
				} catch {
					/* keep the last placement */
				}
			}
		}

		function bindOverflow(list: HTMLOListElement): void {
			if (list.dataset.overflowBound === '1') return;
			list.dataset.overflowBound = '1';
			list.addEventListener('click', (event) => {
				const target = event.target;
				if (!(target instanceof Element)) return;
				const button = target.closest('.mark-hit');
				if (!(button instanceof HTMLButtonElement)) return;
				const li = button.closest('li');
				if (!li?.id) return;
				openOverflowId = openOverflowId === li.id ? null : li.id;
				refreshSplit();
			});
		}
```

Inside the placement loop in `positionSplit`, after `li.dataset.kind = place.kind`, add:

```ts
				syncOverflowHit(li, place.kind === 'overflow');
```

After the loop, and before `writeLeaders`, call `bindOverflow(list)` and `applyExpanded(...)`. Add this function above `positionSplit`:

```ts
		function applyExpanded(
			figure: HTMLElement,
			items: readonly HTMLLIElement[],
			placed: readonly {
				index: number;
				kind: string;
				side: 'left' | 'right';
				left: number;
				top: number;
				width: number;
				height: number;
				omitLeader: boolean;
			}[],
			pose: { plate: { left: number; top: number; width: number; height: number } },
			plateWidth: number,
			plateHeight: number,
			root: number,
		): void {
			const drafts = items.map((li) => {
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
			});
			for (const li of items) {
				const button = li.querySelector<HTMLButtonElement>('.mark-hit');
				const open = li.id !== '' && li.id === openOverflowId && li.dataset.kind === 'overflow';
				if (!open) {
					li.removeAttribute('data-expanded');
					button?.setAttribute('aria-expanded', 'false');
					continue;
				}
				const place = placed.find((note) => note.index === Number(li.dataset.index));
				const sentence = li.querySelector<HTMLElement>('.mark-note');
				const note = drafts.find((item) => item.index === Number(li.dataset.index));
				if (!place || !sentence || !note || !isNarrow()) {
					openOverflowId = null;
					li.removeAttribute('data-expanded');
					button?.setAttribute('aria-expanded', 'false');
					continue;
				}
				const letterboxWidth = Math.min(NOTE_CAP_REM * root, figure.clientWidth / 2);
				const scrimWidth = Math.min(
					NOTE_CAP_REM * root,
					Math.max(0, pose.plate.width / 2 - SCRIM_INSET_REM * root),
				);
				sentence.style.display = 'block';
				sentence.style.position = 'absolute';
				sentence.style.padding = '0';
				sentence.style.width = `${letterboxWidth}px`;
				const letterboxHeight = sentence.offsetHeight;
				sentence.style.width = `${scrimWidth}px`;
				sentence.style.padding = '0.35rem 0.45rem';
				const scrimHeight = sentence.offsetHeight;
				const panel = placeExpandedPanel({
					pane: { width: figure.clientWidth, height: figure.clientHeight },
					plate: pose.plate,
					plateSize: { width: plateWidth, height: plateHeight },
					rem: root,
					note,
					notes: drafts,
					letterboxHeight,
					scrimHeight,
					occupied: placed
						.filter((item) => item.kind === 'side' || item.kind === 'letterbox')
						.map((item) => ({
							side: item.side,
							left: item.left,
							top: item.top,
							width: item.width,
							height: item.height,
						})),
				});
				li.setAttribute('data-expanded', 'true');
				li.classList.toggle('is-scrim', panel.kind === 'scrim');
				li.setAttribute('data-omit-leader', panel.omitLeader ? '1' : '0');
				sentence.style.left = `${panel.left - place.left}px`;
				sentence.style.top = `${panel.top - place.top}px`;
				sentence.style.width = `${panel.width}px`;
				sentence.style.padding = panel.kind === 'scrim' ? '' : '0';
				sentence.style.display = '';
				button?.setAttribute('aria-expanded', 'true');
			}
		}
```

Call it from `positionSplit` after `bindOverflow(list)` and before `writeLeaders`:

```ts
			bindOverflow(list);
			applyExpanded(figure, items, placed, pose, plateWidth, plateHeight, root);
			writeLeaders(figure, items, plate, plateWidth, plateHeight);
```

In `writeSplitLeaders`, replace `const noteRect = li.getBoundingClientRect();` with:

```ts
							const sentence =
								li.dataset.expanded === 'true' ? li.querySelector<HTMLElement>('.mark-note') : null;
							const noteRect = (sentence ?? li).getBoundingClientRect();
```

A collapsed overflow li still has `data-omit-leader="1"` from placement, so `selectSplitLeaders` drops its points. The open sentence uses the paragraph’s rect and the panel’s `omitLeader`.

Replace the notes loop inside `collapseToContent` with:

```ts
			const notes: { top: number; bottom: number }[] = [];
			for (const li of list.querySelectorAll<HTMLLIElement>('li')) {
				if (li.dataset.kind === 'overflow' && li.dataset.expanded !== 'true') continue;
				if (li.dataset.kind === 'overflow') {
					const sentence = li.querySelector<HTMLElement>('.mark-note');
					const liTop = Number.parseFloat(li.style.top);
					const sentenceTop = sentence ? Number.parseFloat(sentence.style.top) : Number.NaN;
					if (!sentence || !Number.isFinite(liTop) || !Number.isFinite(sentenceTop)) continue;
					const top = plateTop + liTop + sentenceTop;
					notes.push({ top, bottom: top + sentence.offsetHeight });
					continue;
				}
				const rel = Number.parseFloat(li.style.top);
				if (!Number.isFinite(rel)) continue;
				const top = plateTop + rel;
				notes.push({ top, bottom: top + li.offsetHeight });
			}
```

Leave the `delta = unionTop - pad` shift and the `--imagery-h` write as they are. Do not assign `plateFrame.style.width` or `plateFrame.style.height`. Do not call `plateBox`. `refreshSplit` calls `position` before `collapseToContent`, so the cap is the stylesheet pane.

In `applyAll`, after `const place = placeForScroll(p, travel);` and before `frames.forEach`, clear the panel when the notes beat is off:

```ts
				const activeNow = frames[place.index];
				const activeLocalNow = localFor(place.index, place);
				if (
					!activeNow ||
					stageVisual(activeLocalNow, activeNow.dataset.notes === 'aligned').notesOpacity === 0
				) {
					openOverflowId = null;
				}
```

In the resize listener inside `bindSplit`, set the id to null before `applyAll`:

```ts
			window.addEventListener('resize', () => {
				openOverflowId = null;
				settledPlaced = false;
				applyAll();
			});
```

At the end of `bindSplit`, before `armFade()`, bind dismiss once:

```ts
			page.querySelector('.split-imagery')?.addEventListener('pointerdown', (event) => {
				if (openOverflowId === null) return;
				const target = event.target;
				if (!(target instanceof Element)) return;
				if (target.closest('.mark-hit')) return;
				const li = target.closest<HTMLLIElement>('.mark-list li');
				if (li && li.dataset.kind !== 'overflow') return;
				if (li?.dataset.expanded === 'true' && target.closest('.mark-note')) return;
				openOverflowId = null;
				refreshSplit();
			});
			document.addEventListener('keydown', (event) => {
				if (event.key !== 'Escape' || openOverflowId === null) return;
				openOverflowId = null;
				refreshSplit();
			});
```

A side or letterbox click returns before the dismiss. The button’s click toggles because `pointerdown` ignores `.mark-hit`. Enter and Space use the native button. Append each button inside its existing `<li>` so the tab order follows mark order. Side and letterbox items have no button, so they are not tab stops. Do not move focus. Do not add a CSS transition on the panel. The paragraph stays out of the accessibility tree while `display: none` (collapsed overflow) and returns when `data-expanded="true"`. Do not set `aria-live`.

Append inside the same `@media (max-width: 47.99rem)` block from C1:

```css
	.record-page--split .split-frame .mark-hit {
		position: absolute;
		inset: 0;
		z-index: 1;
		margin: 0;
		padding: 0;
		border: 0;
		background: transparent;
		color: transparent;
		font-size: 0;
		cursor: pointer;
	}

	.record-page--split .split-frame .mark-list li[data-expanded='true'] .mark-note {
		position: absolute;
		z-index: 2;
		display: block;
		margin: 0;
		pointer-events: auto;
	}

	.record-page--split .split-frame .mark-list li[data-kind='overflow'].is-scrim {
		background: transparent;
		padding: 0;
	}

	.record-page--split .split-frame .mark-list li[data-kind='overflow'].is-scrim .mark-note {
		background: var(--bg);
		padding: 0.35rem 0.45rem;
	}
```

The desktop `.is-scrim` rule stays on the `<li>`. On the narrow overflow path the `<li>` keeps the class and stays the mark box; the paragraph is the paper. The mark-box stroke stays `var(--accent)`. Do not add `.mark-disc` or `.mark-num`.

- [ ] **Step 4: Run the source tests and see them pass**

Run: `node --experimental-strip-types --test src/data/margin-first.source.test.ts src/data/callout-settle.source.test.ts src/data/detail-display.test.ts src/data/callout-notes.test.ts src/data/split-stage.test.ts`

Expected: PASS on Task 0 plus Lane C. `callout-settle.source.test.ts` still finds no second `plateBox` in the collapse. `split-stage.test.ts` still locks the beat constants.

- [ ] **Step 5: Commit**

```bash
git add src/pages/records/[id].astro src/styles/global.css src/data/margin-first.source.test.ts
git commit -m "feat: open one overflow note on tap"
```

---

### Serial

No task. The spec’s locks are inside Lanes A, B, and C, or they are files this plan does not edit.

- Desktop `narrow: false` is the existing `placeNotes` body. Lane A returns early only when `narrow === true`. The existing desktop `it` stays.
- `[id].astro` is Lane C’s write set. `settled-pane.ts` is not edited, so there is no second owner to wait for.
- `cameraBox`, `openingBox`, `plateBox`, `stageVisual`, `split-leaders.ts`, and `records.json` have no task.

### Integration

**Base:** the integration branch after Lane A, Lane B, and Lane C have merged.
**Writes:** none unless a check fails. A failure gets one fix on this same checkpoint, then the same commands once more.
**Reads:** the whole integrated diff.

One live pass. Do not open a second review cycle per lane. The pass is `/records/mhjl329/` below `48rem`. Desktop and `/records/ml4001/` are checks in that same pass, not a second checkpoint.

- [ ] **Step 1: Run the automated checks**

Run:

```bash
node --experimental-strip-types --test src/data/*.test.ts
npm run check
npm run build
```

Expected: every test PASS, `astro check` exits 0, `astro build` exits 0. `src/data/records.json`, `src/data/split-stage.ts`, `src/data/settled-pane.ts`, and `src/data/split-leaders.ts` have no diff. `cameraBox`, `openingBox`, `plateBox`, and `stageVisual` have no diff.

- [ ] **Step 2: Live-verify `/records/mhjl329/` on a phone width**

Start `npm run preview`. Use a 16px initial font so `1rem` is 18px, and the light theme. Pixel figures assume no scrollbar. A 2px difference still passes. Capture one screenshot of the label notes keypoint and one of a single open overflow sentence at 390×844. Those two shots are the checkpoint record.

`/records/mhjl329/` with motion allowed, at the notes keypoint:

1. **Plate first.** At 390×844, on the label and the cover, no `<li>` has `is-scrim` while every overflow note is collapsed. The label photograph reads as a label. More than half of `S` is bare. `data-callout="margin-first"` on both frames. `data-callout` is not `overlay-no-gutter`.
2. **Letterbox.** Both strips are under `6.5rem`. A note whose full text fits a band is `letterbox`, outside `S` (a shared edge counts as outside), sentence visible, prefix ①–⑥ in mark order. Its leader, when drawn, is the callout-polish stub. It is not a `mark-hit` button.
3. **Overflow tap.** A note that fits neither band shows `.mark-box`, no sentence, and no leader. The `mark-hit` accessible name is the prefix plus `marks.note`. Activating it shows that one sentence and leaves more than half of `S` uncovered. A second open note does not remain. The same button, Escape, or a pointer on the imagery outside the button and the panel hides it. The tap does not animate.
4. **Short pane.** The label plate’s used box stays about 255×255 and the cover plate’s used box stays about 255×158. Inline `--imagery-h` is under `58svh`. A letterbox note lengthens it. A collapsed overflow note does not. 品相 is the next reading block under that band. Scrubbing back to the upright hold clears the inline height, closes any open panel, shows the upright at `U` in the tall pane, and hides the plate.
5. **Desktop, same pass.** At 1440×900, label notes sit in the side paper, outside the plate, with no scrim. Cover notes sit in the letterbox unless a wrapped note exhausts the band. Imagery / reading is between 1.60 and 1.64. Imagery height is `100svh`. There is no `mark-hit` button and no `data-callout`.
6. **Unchanged machinery, same pass.** `cameraBox`, `plateBox` factors 0.72 / 1.25 / 0.92, and the beat constants match `95b8919`. 记述 and `marks[].note` match `records.json`. `.split-read` does not repeat the ①–⑥ notes. Split frames have a `.mark-box` per mark and no `.mark-disc` and no `.mark-num`. `/records/ml4001/` still uses `.record-split`, still paints discs, and still uses the `0.35rem` leader gap.

Reduced motion, same URL, below `48rem`: no scrub, discs absent, fitted notes in the letterbox with prefixes, overflow notes hidden until the same tap, pane at `contentH`. The tap does not animate.

No-JS, below `48rem`: no `data-callout`, no `data-callouts="placed"`, no collapse measurement. The six label sentences and the six cover sentences are in document flow under their plate images, prefixes included, and they do not cover the bitmap. Desktop no-JS stays the absolute list.

The height-24 and height-130 rows are the unit fixtures from Lane A. They are not a claim that a live MHJL sentence is 24px tall.

- [ ] **Step 3: Review the integrated diff once**

Read the diff from the Task 0 parent through Lane C. Confirm the write sets stayed disjoint, `records.json` is untouched, and `split-stage.ts` is untouched. A failed check gets one fix and one re-run of this same Integration task. A green checkpoint ends the plan.

```bash
git add -A
git commit -m "fix: settle mobile margin-first integration"
```

Skip the commit when Step 1 and Step 2 found nothing to change.

---

## Spec coverage

| Spec lock | Task |
|---|---|
| Narrow order: strip, letterbox packed against `S`, overflow. No narrow `scrim` | A1 |
| Height 24 at top `93.31`, height 130 overflow, five height-40 notes | A1 |
| Desktop `narrow` omitted: phone height 24 letterbox, height 130 scrim | existing `it`, left in place by A1 |
| `narrow: true` on a wide strip still returns `side` | A1 |
| Plate object not mutated | A1 |
| `contentH` 281.88 and 305.88; cover within 2px of 185; overflow rect not passed | A1 calls `settledImageryHeight`; C2 chooses the rects |
| Worked shift `79.81` / `37.5` / `13.5` | fixture plus the existing `unionTop - pad` shift, kept in C2 |
| `placeExpandedPanel` letterbox, then one scrim under half of `S` | A2 |
| `CalloutMode` `'margin' \| 'margin-first'`; strip width is not a branch | B1 |
| Measure full text once at the first band’s width; do not remeasure a hidden sentence | C1 |
| `data-kind`, `data-callouts="placed"`, `data-callout` | C1 |
| No-JS flow list under the plate below `48rem`; desktop no-JS unchanged | C1 |
| `mark-hit` name is prefix plus `marks.note`; nothing painted on the box | C2 |
| One open note; button, Escape, and empty imagery dismiss; side and letterbox clicks do not | C2 |
| Expanded paper only, on the paragraph; more than half of `S` stays bare | A2 width plus C2 CSS |
| Collapsed overflow has no leader; the open sentence uses the stub rules | C2 `data-omit-leader` and `writeSplitLeaders` |
| Resize and leaving the notes beat clear the panel | C2 |
| `S` is not refit; beats, `records.json`, ml4001, discs stay | no task edits those files; Integration checks them |
| Live `/records/mhjl329/` at 390×844 | Integration |

## After this plan merges

This pull request is the plan only. Do not implement it on the docs branch. A plan that merged without `spec-ok-merge-plan-ship` stays on `main` until that grant, or an equivalent instruction that accepts the spec, merges the plan, and starts implementation. When the grant is in hand, cut the implementation branch from the plan’s merge commit, start Task 0, and when that commit is on the implementation branch start Lanes A, B, and C in the same turn. Do not ask which execution mode to use. Do not brainstorm this spec again.
