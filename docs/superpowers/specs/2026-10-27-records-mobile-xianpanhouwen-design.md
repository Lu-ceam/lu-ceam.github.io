# Design: mobile 先盘后文 (Approach A)

Date: 2026-10-27  
Site: https://lu-ceam.github.io/records/  
Status: Locked by Rolf (A → 收束经封面全幅 → 记述区 → 桌面边界). Spec + implementation ship together.

Amends the narrow path of [Approach A runway](2026-10-24-records-imagery-approach-a-runway-design.md). Desktop φ dual-column, `cameraBox` / `zoomImageBox`, pass/joint travel, settle/pointerDown, and margin-first callouts stay. This document only changes **narrow** scroll structure after the last dwell.

## Goal

On reveal records below `48rem`, the visitor watches the disc first (near-fullscreen sticky runway), then a short collapse pulls the cover into a top-bar thumb, then 记述 scrolls as ordinary document flow under that sticky thumb. One continuous page scroll. No mode switch, no second large plate in the reading band.

## Locked requirements (Approach A)

These sentences are the lock. Later sections number them. They do not add a second choice.

1. **Narrow only.** `max-width: 47.99rem` / existing `isNarrow()`. At `min-width: 48rem` the page stays the shipped φ dual-column: left runway, right paced reading. No collapse travel, no top-bar thumb, no stacked reading under the plate.
2. **Reveal first.** Sticky imagery is near `100svh`. Passes keep zoom→plate→dwell in `details[]` order. During reveal the reading column is off-screen (document flow after the runway), not sharing the sticky band.
3. **Collapse after the last dwell.** After the last pass’s dwell ends, a short runway segment (`COLLAPSE_SVH`, about 0.4–0.7 screens; shipped value `55`) runs last-plate settled → brief full cover → top-bar thumb (~56–72px, shipped `64px`, left-aligned). Same camera math family (`zoomImageBox` / settled plate geometry). Callouts fade at collapse start. Scroll up reverses the path. Settle and `pointerDown` keep their current semantics (no wheel skip through the segment).
4. **Reading under the thumb.** After collapse, a sticky/fixed cover thumb stays at the top; tombstone → 记述 → existing folds scroll below. Tap the thumb scrolls back to the start of reveal. No second large plate in this band. Deep link into reading shows thumb + story without replaying the whole reveal; plate/detail anchors still enter through reveal.
5. **Resize and reduced motion.** Crossing the breakpoint may hard-cut. `prefers-reduced-motion` / `data-motion=reduce` on narrow skips collapse scrub and shows a static thumb above reading.

## Locked decisions

| Topic | Choice |
|---|---|
| Breakpoint | Existing `47.99rem` / `isNarrow()` |
| Reveal height | Narrow `--imagery-h: 100svh` during reveal (replaces shared `58svh` band for this path) |
| Reading during reveal | After the runway in document flow (`grid-row: 2` on narrow); not pin-or-pace beside the plate |
| Collapse travel | `COLLAPSE_SVH = 55` appended only on the narrow runway height |
| Collapse path | Last plate → cover full (short hold) → thumb; `collapseVisual(t)` owns the mix |
| Thumb | `THUMB_HEIGHT_PX = 64`; left-aligned cover plate in the bar |
| Callouts in collapse | Opacity → 0 from the first collapse beat |
| Desktop runway formula | Unchanged: `100svh + passes×140svh + joints×28svh` |
| Desktop reading | Unchanged pin-or-pace via `readTrackOffset` |
| Mid-reveal pane hug | Narrow 先盘后文 does **not** shrink `--imagery-h` via `collapseToContent` during reveal; full sticky stage stays until the collapse segment |
| Reduced motion | Narrow: static thumb + reading; no collapse scrub |

## Page structure (narrow)

1. **Runway** — height `100svh + (pass-count×140svh) + (joints×28svh) + 55svh`. Sticky imagery inside, full viewport during reveal.
2. **Collapse segment** — last `55svh` of runway progress (`place.collapse` in `(0, 1]`). Active frame morphs toward cover; imagery height eases to the thumb.
3. **Reading** — sibling after the runway. Once `collapse ≥ 1` (or reduced motion), imagery hands off to a fixed/sticky thumb; reading is normal overflow, not `translateY` paced to camera `p`.

Desktop keeps imagery \| read on one grid row with the existing spacer runway.

## Motion helpers

- `runwayTravelSvh(detailCount, collapseSvh?)` — desktop omits collapse (`0`); narrow passes `COLLAPSE_SVH`.
- `placeOnRunway(p, detailCount, collapseSvh?)` — after the last pass, sets `collapse` in `[0, 1]`.
- `collapseVisual(t)` — `coverMix`, `thumbT`, `calloutsOpacity`.
- `nearestSettlePlace` — collapse detents at `0`, cover-hold (`0.45`), and `1`.
- Tap thumb → `scrollTo` reveal start (`runwayScrollY` at index 0, local 0).

## Out of scope

- Desktop visual changes
- New A/B letter fields (disc/side already shipped)
- Curator export / caption migration
- Changing mark geometry or callout placement rules inside a settled plate

## Verification

- Unit tests for `collapseVisual`, narrow travel, and `placeOnRunway` collapse tail
- Existing split-stage / reading-scroll contracts updated for the narrow formula and phase handoff
- `npm run check` clean when feasible; CI build on the PR
- Desktop φ path unchanged in CSS (`min-width: 48rem` rules)
