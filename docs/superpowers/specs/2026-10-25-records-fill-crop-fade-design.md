# Design: fill→crop fade — live crop window, outer fade to paper

Date: 2026-10-25  
Site: https://lu-ceam.github.io/records/  
Status: Locked by Rolf 2026-10-25 as Approach A. Spec only. Implementation follows after Rolf reviews this document and a writing-plans pass. This PR does not edit CSS, Astro, TypeScript, JSON, or image files. Do not merge it, and do not write the implementation plan, until that review.

Amends the photograph’s opacity during the zoom and the plate beat in [contain-fill, φ split, and margin-first notes](2026-10-25-records-imagery-contain-fill-phi-overlay-design.md). The camera path stays `zoomImageBox`: geometric scale and a straight crop-center travel from the contain-maximized opening `U` to the centered plate `S`. `cameraBox` stays the single-view formula and is not the page’s pose. Callout polish, elbow leaders, and mobile margin-first stay on their own track.

Checked against `src/pages/records/[id].astro`, `src/styles/global.css`, `src/data/split-stage.ts`, `src/data/detail-display.ts`, and MHJL 329 in `src/data/records.json`, at `2224fad`. The live failure is the ZOOM→PLATE beat on https://lu-ceam.github.io/records/mhjl329/: the crop in the middle goes gray, then snaps solid.

## Goal

On reveal records (`.record-page--split`), during fill→crop:

1. Pixels inside the live crop window stay fully opaque for the whole pass, while that frame is the active frame.
2. The photograph outside that window fades to the imagery pane’s paper, the blank that already reserves the margin for 旁注.
3. The solid region is the crop window under the current camera pose. It translates and scales with `zoomImageBox` on every frame.
4. When the plate beat settles, the window shows the plate file and the outer is already paper. Boxes, elbow leaders, and notes stay on their own later beats.

Desktop φ, the plate box, and callout placement stay.

## Locked requirements (Approach A)

These sentences are the lock. The sections below give them numbers. They do not add a second choice.

- **Window stays opaque.** While the frame is the active frame, the crop window’s composited opacity is 1 from the upright hold through the notes beat. The page does not paint that window with `stageVisual`’s `uprightOpacity` or `plateOpacity`. The joint between details may still fade the whole `.split-frame`.
- **The window is the live crop.** Its rect is the on-screen `transform.crop` under the current `zoomImageBox` pose. The same geometric scale and the same straight crop-center travel already used for the upright. Every frame. The cover crop starts off center, so the window travels. A rectangle fixed on the pane center is the wrong window.
- **Outer fades to paper.** A second copy of that same pose fades from opacity 1 to opacity 0 as `cropT` runs from 0 to 1. At `cropT = 1` the outer paints nothing. What remains outside the window is `.split-imagery`’s paper, `var(--bg)`.
- **Swap inside the window.** At `local >= PLATE_END` the visible photograph inside the window becomes the plate file at opacity 1, in one step. The plate beat does not crossfade the photograph.
- **Callouts keep their detents.** Boxes, elbow leaders, and notes still follow `stageVisual`. They are not retimed onto the fill→crop fade. Their clip is not the window clip.
- **Reduced motion jumps.** `prefers-reduced-motion: reduce` shows the end state: the settled window, paper around it, callouts placed. No scrub and no opacity ramp.

The paper is the existing token. Light theme `#f3f0e8`. Dark theme `#131211`. No new color.

## Sentences this spec replaces

| Earlier sentence | Where | Replacement |
|---|---|---|
| The upright fades out and the plate fades in on `S` | Contain-fill, Motion step 3 | Section “Timeline”. The outer fades to paper during the zoom. At `PLATE_END` the window cuts to the plate. The center does not fade |
| Upright pixels outside the crop stay painted across the pane until `uprightOpacity` fades the whole upright out | Contain-fill, “What the camera computes” | Section “Layers”. Those pixels are the outer layer. They fade with `cropT` during the zoom. The crop window does not take that fade |
| From `ZOOM_END` to `PLATE_END`, `uprightOpacity` runs `1 → 0` and `plateOpacity` runs `0 → 1`, and `applyFrame` writes both onto the upright clip and the plate | `stageVisual` in `split-stage.ts`; `applyFrame` in `[id].astro` | Section “What the page does today” and “Timeline”. The fields stay. The split photograph stops reading them |
| The plate crossfade starts only after the zoom has finished | Camera-crop zoom, locked order | The plate file still appears only once `cropT` has been 1. The appearance is the cut at `PLATE_END`, not a whole-layer opacity blend |

Approach A runway still owns the sticky camera, the runway, pin-or-pace, and the reading order. Contain-fill still owns `U`, `S`, the 0.72 / 1.25 / 0.92 factors, φ:1, and `zoomImageBox`. Camera-crop zoom still owns geometric scale, straight crop-center travel, “no `lerpBox`,” and “`angleDeg` is not read.” Callout polish, the elbow spec, and mobile margin-first still own notes, leaders, numbering, and the settled pane. This document changes only how the split photograph composites during fill→crop.

## Locked decisions

| Topic | Choice |
|---|---|
| Scope | The split-frame photograph on `.record-page--split`. One frame’s fill→crop |
| Window | Axis-aligned screen rect of `transform.crop` under `zoomImageBox`. Opacity 1 while the frame is active |
| Pose | The page’s existing `zoomImageBox` call. Not `cameraBox` of the pane. Not `cameraBox` of `S` |
| Rotation | None. `angleDeg` stays unread. No CSS rotate. The rect is the crop rect, because the pose has no rotated quad |
| Travel | The window center is the interpolated crop center. On MHJL 329 the window grows into `S` as it travels |
| Outer | Same `zoomImageBox` pose, full image, opacity `1 - cropT`. End state paints nothing |
| Paper | Pane ground `var(--bg)` on `.split-imagery`. The letterbox and side margin 旁注 already use |
| Swap | One step at `local >= PLATE_END`. Plate file fills the settled window at opacity 1. No fractional plate opacity |
| Beats | `UPRIGHT_END`, `ZOOM_END`, `PLATE_END`, `BOXES_END`, `LEADERS_END`, `PASS_SVH`, `JOINT_SVH`, `DETAIL_CROSSFADE_MS` stay |
| `stageVisual` | Return values stay, including the unused photo ramp. The split photograph does not assign them |
| Callouts | Placement, elbow, Composite A index, φ columns, and `placeNotes` stay |
| Reduced motion | End state in one paint. Window at `S`, paper around it, callouts placed |
| Legacy | `.record-split` / ml4001 unchanged |
| Copy | `records.json` unchanged |

## What the page does today

`stageVisual` holds the upright at opacity 1 through the zoom (`local` from `UPRIGHT_END` 0.08 to `ZOOM_END` 0.40) while `cropT` runs 0 → 1. `applyFrame` places the upright with `zoomImageBox` and writes `upright.style.opacity` and `.upright-clip` opacity from `uprightOpacity`. The clip is `inset: 0` on the frame, `overflow: hidden`, `background: var(--bg)`.

From `ZOOM_END` to `PLATE_END` (0.40 to 0.52) `cropT` stays 1 and the two opacities trade:

```
t = (local - ZOOM_END) / (PLATE_END - ZOOM_END)
uprightOpacity = 1 - t
plateOpacity = t
```

At local 0.46, `t` is 0.5. `applyFrame` sets the upright, the clip, and `img.plate` to 0.5. Both photographs composite independently against the pane paper, including the pixels inside the crop. The middle goes gray. At `PLATE_END`, `plateOpacity` is 1 and `is-plate` shows the plate and hides the clip. The center snaps solid.

The clip is the whole frame. There is no crop-shaped window. The plate frame is already `S` for the whole pass, with the plate image at `plateOpacity`. Fading that image fades `S`, which at `cropT = 1` is the crop.

`zoomImageBox` itself is unchanged by this bug. Scale is `s = s0 * (s1 / s0) ** cropT`. The crop center moves in a straight line from its center inside `U` to the center of `S`. `angleDeg` is stored (label `0`, cover `−17.31`) and is not read. No CSS rotate runs. The cover’s off-center crop is why the travel reads as a twist: the crop center, not the pane center, is what moves.

Boxes, leaders, and notes still fade on their own fields after `PLATE_END`. The joint between details still crossfades `.split-frame` opacity over `DETAIL_CROSSFADE_MS`. That joint is a different fade.

## Layers

Paper, then two copies of the upright, then the existing plate and its callouts. Bottom to top:

1. **Paper.** `.split-imagery` background `var(--bg)`. Already there. This is the fade target.
2. **Outer.** The upright at the current `zoomImageBox` rect, opacity `1 - cropT`. The imagery pane still clips it (`overflow: hidden`). The outer is not clipped to the crop. It is not a still of the opening held while the window moves.
3. **Window.** A clip whose border box is the crop window this frame. `overflow: hidden`. Opacity 1. The clip shows the upright at that same `zoomImageBox` rect, so the crop pixels fill the clip. This upright stays at opacity 1 after the cut as well.
4. **Plate file.** The existing `img.plate` in the plate frame. Hidden until `local >= PLATE_END`, then opacity 1 in that same paint. From `cropT = 1` the plate frame and the window are the same rect, so the plate covers the window upright completely. The plate is not a child of the outer layer or of the window clip. Hiding the outer cannot hide the plate.
5. **Callouts.** Boxes, elbow leaders, and notes in that same plate frame, above both photograph layers. The window’s `overflow: hidden` does not apply to them. A letterbox note and an elbow can sit in the paper. One plate element is visible. The window does not gain a second plate URL.

The window and the outer use one pose per frame. Their crop pixels coincide, so the visible fade starts at the window edge.

The outer’s opacity ancestors do not include the window. The window’s opacity ancestors do not include the outer, and they do not include an element whose opacity is `uprightOpacity`, `plateOpacity`, or `1 - cropT`. Fading the clip that contains the window is the bug this layout removes.

Each detail still requests one upright URL and one plate URL. A second element with the same `src` is allowed. A third URL is not.

Before the script runs, the outer stays hidden the way `.upright-clip` stays hidden today (`opacity: 0`, `visibility: hidden` in the base rule). The script is what shows it during the hold. No-JS does not show an outer upright.

`pointer-events` on both photograph layers stay `none`, matching the upright clip, so an overflow note’s hit target still receives the tap.

## Geometry

`image` is the box `zoomImageBox` already returns for this frame’s `cropT`. `s = image.width / naturalWidth` when `naturalWidth > 0`, otherwise the window is the zero box and the page does not cover the pane with it.

```
window.left   = image.left + crop.x * s
window.top    = image.top + crop.y * s
window.width  = crop.w * s
window.height = crop.h * s
```

That rect is axis-aligned. The pose does not rotate, so there is no second bounds pass. `cameraBox` is not called to build it. `zoomImageBox`, `openingBox`, and `plateBox` stay byte-for-byte.

At `cropT = 0` the window is the crop’s rect inside `U`. At `cropT = 1` the window is the crop’s contain-rect at `S`. On the label that rect is `S`. On the cover it matches `S` within a tenth of a pixel (the contain remainder already locked). The plate frame stays `S` for the whole pass. From `cropT = 1` on, the window and the plate frame occupy the same rect.

The window center is the crop center on screen:

```
s  = s0 * (s1 / s0) ** cropT
center = cropCenterInsideU + (centerOfS - cropCenterInsideU) * cropT
```

`s` increases on MHJL 329, so the window grows into `S` while that center travels. The outer photograph is the part that leaves.

Worked MHJL 329, desktop pane 801×900. Label crop `274,403,514×514`. Cover crop `219,210,379×235`. `1rem` = 18px is not used here; these are CSS pixels of the pane.

| Detail | `cropT` | Window | Center |
|---|---|---|---|
| Label | 0 | `(239.143, 259.071, 330.429, 330.429)` | `(404.357, 424.286)` |
| Label | 0.5 | `(202.061, 236.776, 400.735, 400.735)` | `(402.429, 437.143)` |
| Label | 1 | `(157.5, 207, 486, 486)` = `S` | `(400.5, 450)` |
| Cover | 0 | `(125.299, 169.650, 216.842, 134.454)` | `(233.720, 236.877)` |
| Cover | 0.5 | `(140.301, 233.807, 353.619, 219.263)` | `(317.110, 343.438)` |
| Cover | 1 | `S` within 0.1px. `S` is `(112.140, 271.217, 576.720, 357.566)` | `(400.5, 450)` |

The pane center is `(400.5, 450)`. The cover window at `cropT = 0` sits up and to the left of it. A rect with the cover’s `cropT = 0` size centered on the pane would be `(292.079, 382.773, 216.842, 134.454)`. The live window is `(125.299, 169.650)`.

Phone pane 354×489.5, cover, same crop:

| `cropT` | Window | Center |
|---|---|---|
| 0 | `(55.376, 120.850, 95.833, 59.421)` | `(103.292, 150.561)` |
| 1 | `S` within 0.1px. `S` is `(49.56, 165.737, 254.88, 158.026)` | `(177, 244.75)` |

The phone pane center is `(177, 244.75)`. The `cropT = 0` cover window is left of that center.

A zero natural size, a zero crop, or a zero pane yields the zero window. The page writes no clip from it.

## Timeline

`cropT` and the beat boundaries come from `stageVisual` as they do today. Outer opacity is `1 - cropT`. Window opacity is 1 on every row. The plate file is hidden until the cut.

| Local | Beat | `cropT` | Outer | Visible photograph in the window |
|---|---|---|---|---|
| `≤ 0.08` | Upright hold | 0 | 1 | Upright. Together with the outer, the composite is `U`. Paper only outside `U` |
| `(0.08, 0.40)` | Zoom | `(0, 1)` | `1 - cropT` | Upright, clipped to the moving window |
| `0.40` | Zoom keypoint | 1 | 0 | Upright, clipped to the settled window (`S`) |
| `(0.40, 0.52)` | Plate span | 1 | 0 | Upright, same settled window, opacity 1 |
| `≥ 0.52` | Plate keypoint and after | 1 | 0 | Plate file at opacity 1, covering the window upright |

At local 0.46, `stageVisual` still returns `uprightOpacity` 0.5 and `plateOpacity` 0.5. Those numbers are not the window’s opacity and not the outer’s opacity. The window is 1. The outer is 0. The center is solid upright. The plate file is still hidden.

The cut is the first paint with `local >= PLATE_END`. In that paint the plate element’s opacity is 1 and it covers the settled window. It does not pass through a value in `(0, 1)`. The window upright is already opacity 1 underneath. The previous paint still shows the upright and hides the plate file. No paint leaves that rect uncovered, and no paint leaves it covered only by a fractional layer. Scrolling back across `PLATE_END` reverses that step: the plate file hides, the upright window is still opacity 1, the outer is still 0.

Scrolling back through the zoom raises the outer as `cropT` falls and moves the window back along the same centers. The window opacity stays 1.

After the cut, the existing beats run on top:

- **Boxes.** `boxesOpacity` from `PLATE_END` to `BOXES_END`. The plate is already solid.
- **Leaders.** Elbow draw-in from `BOXES_END` to `LEADERS_END`. Unchanged.
- **Notes.** `notesOpacity` from `LEADERS_END` to 1. They fade onto paper that is already blank. `placeNotes` is unchanged.

`is-plate` stays the mark that the plate file is showing: on when `local >= PLATE_END`, off below that. Rules under `is-plate` show the plate and hide the outer upright. They do not set the window box’s opacity. They do not set box, leader, or note opacity. They do not hide a parent that contains the window.

The idle detents stay. The zoom keypoint is the settled upright crop on paper, plate file hidden. The plate keypoint is the plate file on that same paper. Boxes are still hidden at the plate keypoint.

The joint between two details still crossfades `.split-frame` opacity for `DETAIL_CROSSFADE_MS`. The outgoing frame is at local 1 (plate in the window, outer paper). The incoming frame is at local 0 (full upright). That frame-level fade is unchanged.

## Reduced motion

`prefers-reduced-motion: reduce` and `data-motion="reduce"` skip the scrub. The page paints the end state once:

- The window is the settled crop rect, `S` within a pixel.
- The visible photograph is the plate file at opacity 1.
- The outer upright is hidden. The margin is paper.
- Boxes, leaders, and notes are the settled callouts. Placement still runs, including the narrow `contentH` collapse.

No outer fade, no plate ramp, no gray frame. Leaving motion clears the inline window rect and the inline outer opacity, then paints that same end state. Entering motion again scrubs from the runway position.

No-JS does not measure and does not zoom. The first plate stays the centered no-JS plate from contain-fill, capped at 72% of the pane, on paper, with no outer upright and no fade. This section does not restyle that fallback.

## Constraints

- During fill→crop, the window’s composited opacity is 1. A sample inside the window is the photograph at full cover. It is not paper showing through a 0.5 layer.
- At `cropT = 1` the outer opacity is 0. The margin matches `var(--bg)`. A half-transparent photograph does not remain outside the window.
- The window rect follows the “Geometry” formula on every frame, including the cover’s off-center start.
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

## Acceptance

Viewport checks use a 16px initial font (`1rem` = 18px) and the light theme. Pixel figures assume no scrollbar. A 2px difference from subpixel rounding still passes on screen. The geometry table is the unit lock, within 0.01px. `npm run check` and `npm run build` are gates for the implementation that follows this document. They are not run for this spec-only change.

On `/records/mhjl329/` with motion allowed:

1. **Hold is the full upright.** At the upright keypoint, on the label and the cover, at 1440×900 and at 390×844, the visible upright matches `U` from contain-fill. The crop window does not punch a hole. The plate file is hidden. Paper shows only outside `U`.
2. **The window travels.** In the 801×900 pane, the cover window at `cropT = 0` is `(125.299, 169.650, 216.842, 134.454)`, center `(233.720, 236.877)`. At `cropT = 0.5` it is `(140.301, 233.807, 353.619, 219.263)`, center `(317.110, 343.438)`. At `cropT = 1` it matches cover `S` within 0.1px. The label window at `cropT = 1` is `(157.5, 207, 486, 486)`. In the 354×489.5 pane (390×844, column `390 - 2rem`), the cover window at `cropT = 0` is `(55.376, 120.850, 95.833, 59.421)`.
3. **Center stays solid through the old wash.** At local 0.46 the window opacity is 1, the outer opacity is 0, and the visible center is the upright crop, not gray paper. `stageVisual(0.46)` may still report 0.5 and 0.5. Those values are not the photograph’s opacities. At local 0.24 the window opacity is 1 and the outer opacity is 0.5, and the window is the `cropT = 0.5` row above.
4. **Outer ends as paper.** At the zoom keypoint and at the plate keypoint, outside the window, the imagery ground is `var(--bg)` (`#f3f0e8` in the light theme). No photograph is left at partial opacity in the letterbox or the side margin.
5. **Plate cut.** Below `PLATE_END` the plate file is hidden. At `PLATE_END` and after, the plate file fills the window at opacity 1. There is no frame in which the plate file’s opacity is between 0 and 1. Scrubbing back across `PLATE_END` hides the plate file and shows the upright window at opacity 1.
6. **Callouts unchanged.** At the notes keypoint, placement, prefixes, elbow leaders, `data-callout`, and the narrow pane match the shipped callout track at `2224fad`. Imagery / reading at 1440×900 is between 1.60 and 1.64. The window clip does not slice a note or a leader.
7. **Unchanged machinery.** `cameraBox`, `zoomImageBox`, `plateBox` factors 0.72 / 1.25 / 0.92, and the beat constants match `2224fad`. 记述 and `marks[].note` match `records.json`. `/records/ml4001/` still uses `.record-split`.

Reduced motion, same URL: no scrub. The plate sits in the settled window on paper, with boxes and notes, and the outer upright is hidden. No-JS: the first plate, no outer upright, no fade.

## Out of scope

- Editing `cameraBox`, `zoomImageBox`, `openingBox`, `plateBox`, their factors, or `stageVisual`’s return values and thresholds
- Applying `angleDeg` or adding a CSS rotate
- A fixed center rectangle that only scales
- Leaving the outer photograph at a partial opacity after `cropT = 1`
- Crossfading the plate file through fractional opacity
- Retiming boxes, leaders, or notes onto the zoom or the plate span
- Callout data protocol, elbow style, Composite A numbering, φ column split, and `placeNotes` / `placeExpandedPanel` (separate track)
- The detail-to-detail `.split-frame` crossfade (`DETAIL_CROSSFADE_MS`)
- Desktop side → letterbox → scrim, and the narrow margin-first / overflow tap path
- `records.json` content, mark coordinates, captions, alts, `detailsNote`, and `marks[].note`
- Legacy `.record-split`, including ml4001
- A new paper color, a purple token, or a translucent veil
- Running `npm run check` or `npm run build` in this spec-only change

## Files a later implementation touches

This pull request adds only this document.

| Path | Later change |
|---|---|
| `src/data/detail-display.ts` | A `cropWindow` helper with the formula in “Geometry”, beside `zoomImageBox`. It does not edit `zoomImageBox`, `openingBox`, or `plateBox` |
| `src/data/detail-display.test.ts` | The worked window rows. Outer opacity `1 - cropT`. Window opacity 1 at local 0.46 while `stageVisual` still reports 0.5 |
| `src/pages/records/[id].astro` | `applyFrame` paints the outer at `1 - cropT` and the window at opacity 1, moves the window rect every frame, and sets the plate file to opacity 0 or 1 at `PLATE_END`. It stops writing the photo ramp onto those layers. `clearScrubStyles` clears the new inline rect and outer opacity |
| `src/styles/global.css` | Window clip and outer layer. Inside an active frame, no ancestor between the window and `.split-frame` takes the photo ramp or the outer opacity. The frame’s joint opacity stays. The base rule hides the outer before script. `is-plate` hides the outer upright and shows the plate, and does not fade the window box. Desktop `100svh` and `1.618fr 1fr` stay |
| `src/data/split-stage.ts` | No change |

## Rejected

- Fading `.upright`, `.upright-clip`, and `img.plate` together from `stageVisual`’s ramp. That is the gray center.
- A crop window whose center stays on the pane center while it scales. The cover crop does not start there.
- Reading `angleDeg` or rotating the clip, then taking the bounds of that quad. The upright is already deskewed. The live motion is the crop-center travel.
- Driving the window from one `cameraBox` call on the pane, or one call on `S`.
- Fading the outer to a second, washed photograph instead of to `var(--bg)`.
- Stopping the outer fade above 0.
- Crossfading the plate file inside the window. The swap is one step at `PLATE_END`.
- Clipping notes and leaders to the window.
- Moving the notes beat or the leaders beat onto the plate span.
- Changing the joint crossfade so the incoming upright cannot fade at the frame level.
- A reduced-motion path that still plays the outer fade.
