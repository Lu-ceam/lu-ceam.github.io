# Design: contain-maximized opening, φ split, and margin-first notes

Date: 2026-10-25  
Site: https://lu-ceam.github.io/records/  
Status: Locked by Rolf 2026-10-25, including the same-day magnification and margin-first amendment. Spec only. Implementation follows after review and a writing-plans pass. This PR does not edit CSS, Astro, TypeScript, JSON, or image files.

Amends the imagery pane of [Approach A camera runway](2026-10-24-records-imagery-approach-a-runway-design.md) and the split-stage shell it kept. The opening upright is contain-maximized in the imagery pane. The settled plate is a smaller centered crop, so the camera reads as a zoom-in. Desktop columns are a golden-ratio split with the imagery larger. Callout notes fill the paper around that plate; a paper scrim on the bitmap is the fallback when the margin cannot hold them.

`cameraBox` in `src/data/split-stage.ts` stays as written. `stageVisual` beat boundaries stay. The elbow, the `6 5` dash, and the mask draw-in from [elbow-dashed callouts](2026-10-25-records-imagery-elbow-dashed-callouts-design.md) stay. This document changes the view the zoom travels between, the column ratio, the plate box, and where notes sit.

Checked against `src/pages/records/[id].astro`, `src/styles/global.css`, `src/data/split-stage.ts`, `src/data/detail-display.ts`, and MHJL 329 in `src/data/records.json`, at `8861768`. The size complaint is Rolf’s PC screenshot of `/records/mhjl329/`: the label plate is small in the left half, beside a tall 记述 column.

## Goal

On reveal records, keep the dual column (left imagery, right 题铭 → 记述 → 著录). Change only the imagery pane:

1. The opening upright fills the pane on at least one axis, with the whole file visible.
2. The settled plate is centered and smaller than that opening. On MHJL 329 the crop is also larger on screen than it was inside the opening, so the move reads as a zoom-in rather than a same-size swap.
3. On desktop the imagery column is wider than the reading column by φ:1.
4. Settled notes use the paper margin around the plate. A note that cannot sit in that margin uses a paper scrim on the plate.

## Current vs desired

### What the page does today

Desktop (`.record-page--split` at `min-width: 48rem`) is `grid-template-columns: minmax(0, 1fr) minmax(0, 1fr)`. Imagery is the left track, `height: 100svh`. The reading column is the right track, `max-width: 46ch`.

`.split-frame .detail-stage` is sized from the **plate** aspect: `width: min(100%, calc(100svh * var(--plate-w) / var(--plate-h)))`. `.mark-slot` is `flex: 0 0 9.5rem` on each side that has notes. The plate is what remains. On a half-width column those slots are why the plate reads as small next to 记述. `applyFrame` then calls `cameraBox(plate.clientWidth, plate.clientHeight, …)`. The upright hold is contain-fit **inside that plate frame**, and the zoom ends with the crop filling the same frame. Opening and plate share one silhouette, so the crossfade reads as a same-size swap.

Below `48rem` the page is one column. Imagery height is `--imagery-h` (`58svh`, or `42svh` when `max-width: 47.99rem` and `max-height: 32rem`). The elbow spec’s narrow rule collapses to one gutter when two `7.5rem` slots would crush the plate, with floor `min(11rem, 58% of the stage)`. Notes still live in that gutter, beside the plate.

`visibleDetailText` already drops a circled line whose text is a published `marks.note`. MHJL 329’s detail text is only those lines, so the reading column does not repeat ①–⑥. That stays.

### Desired

| | Current | Desired |
|---|---|---|
| Desktop tracks | 1fr / 1fr | φ fr / 1fr. Imagery ≈ 61.8%, reading ≈ 38.2% |
| Opening | Upright contained in the plate frame | Upright contain-maximized in the imagery pane. At least one axis flush. Whole file visible |
| Settled plate | Fills the plate frame the upright just occupied | Centered box `S`, fitted in 72% of the opening box (never past 92%). On MHJL 329 the crop is larger on screen than at the opening |
| Notes | Fixed side slots (`9.5rem`, or one narrow gutter) | Paper margin around `S` first. Paper scrim on the plate only when the margin cannot hold the note |
| Leaders | Dashed elbow, `6 5`, end `0.35rem` short of the note | Same elbow and dash. The end is still the note’s inner edge, so the run is shorter. Omit the leader when its centerline meets the note |
| Reading column | 题铭, 记述, 著录, folds | Same role, same copy. No ①–⑥ list |

## Sentences this spec replaces

| Earlier sentence | Where | Replacement |
|---|---|---|
| Desktop columns are about 50/50. Imagery sticky at `100svh`, reading column about 42–46ch | Approach A, desktop structure; live CSS `1fr 1fr` | Section “Layout”. The track ratio is φ:1. `100svh` and the `46ch` cap stay |
| `t = 0` contains the upright in the plate frame. `t = 1` contains the crop in that same frame. The camera viewport is the plate frame, not the sticky column | Camera-crop zoom, locked decisions and “Do not zoom to fill the sticky column” | Section “Layout” and “Motion”. The opening view is the pane. The end view is `S`. `cameraBox`’s source is unchanged |
| The clip does not move or resize | Camera-crop zoom, Motion | The upright’s clip during the hold and the zoom is the imagery pane. The plate frame is `S` for the whole pass |
| Below `48rem`, one gutter when two will not fit; plate floor `F`; notes beside the plate; `--imagery-h` may grow to `70svh` | Elbow spec, “Mobile stage” | Section “Notes”. `S` is sized first. The margin is the remainder. A note that does not fit uses a scrim. `--imagery-h` is not grown to make a gutter |
| `.mark-slot` is `9.5rem` on desktop and a shrinking slot below `48rem`, and those slots size the plate | Elbow spec, desktop slots and the narrow floor; live CSS | Section “Notes”. Split frames do not reserve slots. Legacy `.record-split` keeps its slots |

Approach A still owns the left sticky camera, the invisible runway, pin-or-pace, the right-hand reading order, and “no itinerary rows.” Camera-crop zoom still owns the geometric scale, the straight crop-center travel, “no `lerpBox`,” and “plate hidden until `cropT` is 1.” The elbow spec still owns the polyline, the `6 5` dash, the mask draw-in, `is-plate`, and eager split images.

## Locked decisions

| Topic | Choice |
|---|---|
| Scope | Imagery pane of reveal records (`.record-page--split`). Right column role and story copy stay |
| Opening | Contain-maximize the full upright in the pane. Uniform scale. At least one axis flush. The other letterboxes or pillarboxes. Both flush only when the aspects match |
| Settled plate | Centered `S`, smaller than the opening box. See “Plate box” |
| Magnification | On MHJL 329 the crop’s on-screen width at `S` is about 1.47× (label) and 2.66× (cover) its width inside the opening |
| Desktop ratio | Imagery : reading = φ : 1, φ = (1 + √5) / 2. Imagery larger |
| Notes | Margin around `S` first, on the resolved side when that strip is wide enough. Paper scrim on the plate is the fallback |
| Scrim | Opaque `var(--bg)` behind that note’s glyphs only. Solid paper label. The rest of the plate stays bare |
| Leaders | Elbow and `stroke-dasharray: 6 5` stay. Endpoint is the note edge (existing `0.35rem` gap). Hide a leader whose centerline meets its note |
| Duplicates | No ①–⑥ and no `marks.note` list in the reading column |
| Formula | Do not edit `cameraBox` or `stageVisual` |
| Legacy | `.record-split` / ml4001 unchanged |
| Copy | `records.json` and 记述 unchanged |

## Layout

### Desktop columns

At `min-width: 48rem`, `.record-page--split .split-stage` becomes:

```css
grid-template-columns: minmax(0, 1.618fr) minmax(0, 1fr);
```

`1.618` is φ to three decimals. Imagery is the first track (~61.8% of the split). Reading is the second (~38.2%). `column-gap` stays 0. Imagery stays `height: 100svh`, sticky, `overflow: hidden`. The reading column stays `grid-column: 2`, `height: 100svh`, `max-width: 46ch`, `padding: 0 0 0 1.25rem`. The `46ch` cap limits the measure inside the track. It does not give width back to the imagery track. Pin-or-pace is unchanged. The breakpoint stays `48rem`.

The page column is still `.layout-wide .column`: `min(72rem, calc(100% - 2rem))`, with `html` at `font-size: 112.5%`. Acceptance uses a 16px initial font, so `1rem` is 18px.

Worked pane at 1440×900, ignoring scrollbars: the column is `min(1296px, 1404px)` = 1296px. Imagery = 1296 × φ / (φ + 1) = 801px. Reading = 495px. Imagery height = 900px. Imagery / reading = 1.618.

### Narrow

Below `48rem`, one column. Imagery on top, reading column under it, as Approach A locks. `--imagery-h` stays `58svh`, and `42svh` in the existing short-height query. This spec does not raise it. The opening contain and `S` use that band as the pane. The reading column’s `top`, `height`, and `margin-top` keep using `var(--imagery-h)`.

Worked pane at 390×844: the column is `390 - 2rem` = 354px wide. Imagery height is `0.58 × 844` = 489.5px.

### Opening box

The pane `P` is `.split-imagery`’s content box.

The opening box `U` is the contain-fit of the upright file in `P`:

```
s0 = min(P.width / naturalW, P.height / naturalH)
U.width  = naturalW * s0
U.height = naturalH * s0
```

`U` is centered in `P`. `s0` is one scale for both axes. The upright’s aspect is the file’s aspect. At least one of `U.width` and `U.height` equals the matching side of `P` (within a pixel). The other side leaves paper when the aspects differ. The whole bitmap is inside `U`. Nothing is cropped off the file.

MHJL 329 at the worked panes:

| Detail | File | 1440×900 pane 801×900 | 390×844 pane 354×489.5 |
|---|---|---|---|
| Label | 1050×1400 | Height flush. `U` = 675×900. Pillarbox | Width flush. `U` = 354×472. Letterbox |
| Cover | 1400×1400 | Width flush. `U` = 801×801. Letterbox | Width flush. `U` = 354×354. Letterbox |

### Plate box

`S` is centered in `P` on both axes. Its aspect is the plate file’s aspect (`plate.width / plate.height`). Notes do not move it, and it does not change between the end of the zoom and the settled notes.

Let `inset` be `U` scaled by 0.72 about its center (each side 72% of `U`). The first fit for `S` is the contain-fit of the plate aspect inside `inset`. Each side of that fit is at most 72% of the matching side of `U`, and one side equals 72% of that side of `U`. The silhouette is smaller than the opening.

Zoom check, after that fit. `s1 = min(S.width / crop.w, S.height / crop.h)`. Both MHJL 329 plates are flush on width (label 400/400 with crop 514/514, cover 400/248 with crop 379/235), so `s1 = S.width / crop.w`.

- If `s1 ≥ 1.25 × s0`, keep this fit.
- If `s1` is below that, grow `S` uniformly, plate aspect held, until `s1` is `1.25 × s0`, or until a side of `S` would pass 92% of the matching side of `U`. Stop at whichever comes first.

The 92% cap is only that fallback. `S` stays inside `U` either way. When the cap is width-limited, magnification is `0.92 × naturalW / crop.w`, which is still above 1 when the crop is narrower than 92% of the upright. MHJL 329 does not use the fallback: the 72% fit is already 1.47× and 2.66×. With the plate limited by width inside `0.72 × U`:

```
magnification = 0.72 × naturalW / crop.w
```

| Detail | `naturalW / crop.w` | On-screen crop vs the opening |
|---|---|---|
| Label | 1050 / 514 | 0.72 × 2.043 = 1.47 |
| Cover | 1400 / 379 | 0.72 × 3.694 = 2.66 |

Worked `S`:

| Detail | 1440×900 | 390×844 |
|---|---|---|
| Label | 486×486. Side paper 8.75rem. Vertical paper 11.5rem | 255×255. Side paper 2.75rem. Vertical paper 6.5rem |
| Cover | 577×358. Side paper 6.2rem. Vertical paper 15.1rem | 255×158. Side paper 2.75rem. Vertical paper 9.2rem |

`1rem` = 18px in these figures. Rounding to a pixel is fine. The relations are the lock: `S` smaller than `U` on both axes, crop larger than it was inside `U`, `S` centered.

### What the camera computes

`cameraBox(viewW, viewH, naturalW, naturalH, crop, t)` stays byte-for-byte. Its tests stay. It still contain-fits the upright in **one** view at `t = 0` and contain-fits the crop in **that same** view at `t = 1`, with geometric scale and a linear crop-center.

The page’s two poses are two different views, so one call cannot be both:

- Opening (`cropT = 0`) equals `cameraBox(P.width, P.height, …, 0)`, which is `U`.
- End (`cropT = 1`) places `cameraBox(S.width, S.height, …, 1)` at `S`’s origin. The crop’s screen rectangle is the crop’s contain-rect inside `S`. On MHJL 329 that rectangle is `S`.

The frames between them use the same curve as the function, with the two endpoint scales:

```
s0 = U.width / naturalW
s1 = min(S.width / crop.w, S.height / crop.h)
s  = s0 * (s1 / s0) ** cropT
```

The crop center moves in a straight line from its center inside `U` to the center of `S`. The image box is the same expression `cameraBox` uses: left and top from that center and `s`, width and height `natural * s`. No `lerpBox`. No second easing on `cropT`. No rotation. `angleDeg` is not read.

`applyFrame` must not pass the pane for the whole zoom. That would set `s1` from the pane and the crop would grow to fill `P`. It must not pass `S` for the whole zoom. That would contain the opening inside `S`. A later plan may add a helper **beside** `cameraBox` that takes these two scales. It does not edit `cameraBox`.

Coordinates for the upright during the hold and the zoom are the pane’s. The plate frame is `S`, centered, for the whole pass, including while its opacity is 0. At `cropT = 1` the crop’s contain-rect inside `S` coincides with the plate frame on MHJL 329, so the crossfade is the same rect. Upright pixels outside that crop stay painted across the pane, clipped by `.split-imagery` and not by the plate frame, until `uprightOpacity` fades the upright out. The plate image fills `S`.

## Notes

The margin is whatever paper `P` still has after `S` is centered. It is a remainder, not a flex slot. Split frames (`.record-page--split .split-frame`) do not render `.mark-slot`. The plate is not the shrink item between two `9.5rem` columns. Legacy `.record-split` still renders its slots and still uses `.mark-slot { flex: 0 0 9.5rem }`.

`resolvedSide` is unchanged. `badge` does not choose the side. JSON `side` is unchanged. Note type stays `0.78rem` / line-height `1.45`. A note’s width is at most `9.5rem`.

`MIN_NOTE_W` = `6.5rem`. `MIN_BAND_H` = `2.6rem`, the shortest letterbox that counts as a note band. `1rem` = 18px at the acceptance font, so those are 117px and 46.8px.

Place notes after `S` is known. Each resolved side is independent.

1. **Side margin.** The side strip is `(P.width - S.width) / 2`, full pane height, including the corners beside the letterbox. When the strip is at least `MIN_NOTE_W`, that side’s notes stack there. Order by anchor, gap `0.35rem`, as `stackTops` does. The stack origin is the pane, so a note may sit above or below the plate as long as it stays inside `P` and outside `S`. Legacy figures keep today’s `stackTops` clamp (nothing above the plate). Note width is the strip, capped at `9.5rem`. A note that would start outside `P` does not shrink `S`, does not grow `--imagery-h`, and does not move into the letterbox: the strip already used the full pane height. That note falls through to step 3.
2. **Letterbox.** When the strip is under `MIN_NOTE_W` and a letterbox band `(P.height - S.height) / 2` is at least `MIN_BAND_H`, that side’s notes stack in the letterbox, outside `S`. Left-side notes use the left half of the band. Right-side notes use the right half. Note width is half of `P.width`, capped at `9.5rem`. Fill the top band, then the bottom band. A note that does not fit the remaining band height falls through to step 3.
3. **Paper scrim.** Otherwise the note sits on the plate, on its resolved side, inset `0.55rem` from that edge. Overlay notes on one side stack by anchor and stay inside `S`. The note’s background is `var(--bg)`, opaque, with padding `0.35rem 0.45rem`. That panel covers only the note. It is not a veil over the plate. Nudge the note, vertically first, until its rectangle misses every mark box and disc. If no free slot exists inside `S`, keep the note on the side with less box area and omit that note’s leader.

Margin notes sit on the pane’s existing paper and have no extra background.

At the worked desktop, the label strip is 8.75rem, so label notes take step 1 and have no scrim. The cover strip is 6.2rem, under `6.5rem`, and the letterbox is about 15rem, so cover notes take step 2 and have no scrim unless a wrapped note runs out of band. At 390×844 both strips are 2.75rem, so notes skip step 1. The label letterbox is about 6.5rem and the cover letterbox about 9.2rem. Notes that fit take step 2. The rest take the scrim. That is the mobile rule: leave the margin when the note fits; a scrim on the plate is correct when it does not.

### Leaders

The elbow spec’s polyline stays: horizontal stub, one corner, then a straight run. Stub length stays `16` plate pixels when the gap is at least 32, half the gap from 4 up to 32, and no corner below 4. Dash stays `6 5` in plate user units. Caps, join, mask draw-in, and `LEADERS_END` stay.

The end point stays the note’s inner edge: `0.35rem` short of that edge, on the note’s vertical center, as `leaderEndpoints` already measures. Notes now sit in the margin or on the plate, so the run is shorter than a run across a `9.5rem` slot. The `6 5` pattern does not change. When the shorter gap falls through the existing `32` / `4` thresholds, the stub shortens with it.

After `position()`, if the polyline’s centerline intersects that note’s border box, do not paint that leader (omit the visible stroke and its mask). The mark’s box and the note still paint. Leaders may still cross each other and may still cross other boxes. They do not gain a second corner to route around a note.

### Reading column

`.split-read` does not gain a ①–⑥ list, a `marks.note` list, or `detailsNote` brought back for notes that already appear on the image. `visibleDetailText` and `showDetailsNote` stay the filter. A `details[].text` remainder that is not a published note may stay as catalog prose, as Approach A allows. MHJL 329 has no such remainder.

## Motion

Beats, in order, driven by the existing `stageVisual` thresholds. Do not edit those constants.

1. **Upright hold.** `cropT = 0`. The upright sits at `U`. Plate opacity 0. Boxes, leaders, and notes opacity 0.
2. **Camera zoom.** `cropT` runs 0 → 1. Geometric scale from `s0` to `s1` and linear crop-center travel, as in “What the camera computes.” The plate stays hidden until `cropT` is 1.
3. **Plate crossfade.** The upright fades out and the plate fades in on `S`. On MHJL 329, `S` is already the crop’s rectangle. It stays centered. It does not resize during the crossfade.
4. **Boxes.** Burgundy boxes fade in on the plate.
5. **Short elbows.** The dashed elbow draws from the box toward the note. The mask draw-in is unchanged.
6. **Notes fade-settle.** Notes fade in once, then rest. A margin note fades in on the paper. A scrim note fades in with its paper panel. `S` does not move to make room.

Scrolling up reverses the same sequence. Reduced motion skips the scrub and shows `S`, the boxes, and the notes (margin or scrim). It still runs the placement pass so the notes match this section. No-JS does not measure. With scripts off, `data-motion` stays unset, the first plate is shown, and there is no zoom. The stylesheet centers that plate, preserves its aspect, and caps each side at 72% of the pane, with no split-frame slots. That cap is the no-JS plate. It can differ from the measured `S`. The scripted path and the reduced-motion path both correct to `S`.

Detail changes keep `DETAIL_CROSSFADE_MS` (`1600`). Each detail has its own `U` and `S`. The crossfade sits on the joint, not inside a zoom.

## Constraints

- Opening scale is uniform. The upright file is fully inside `U`. `object-fit: cover` is not the opening.
- `S` is computed from `P` and `U` only. Notes, leaders, and the reading column do not resize it.
- `cameraBox` and `stageVisual` are not edited. `UPRIGHT_END`, `ZOOM_END`, `PLATE_END`, `BOXES_END`, `LEADERS_END`, `PASS_SVH`, `JOINT_SVH`, and `DETAIL_CROSSFADE_MS` stay.
- The path from `U` to `S` is geometric in scale. It is not `lerpBox`, and it is not `cameraBox` of a single fixed view for every `cropT`.
- Elbow dash stays `6 5`. The elbow still has one corner. A leader that meets its note is omitted rather than redrawn with another bend.
- Split frames do not use `.mark-slot` to size the plate. `--imagery-h` is not increased to create note columns.
- The reading column does not repeat on-image notes.
- Palette stays the current tokens. Scrim background is `var(--bg)`. Box and leader stroke stay `var(--accent)`. No new color and no new font.
- `records.json`, 记述, captions, alts, `detailsNote`, and `marks[].note` stay. Legacy `.record-split` stays, including ml4001.

## Acceptance

Viewport checks use a 16px initial font (`1rem` = 18px) and the light theme. Pixel figures below assume no scrollbar. A 2px difference from subpixel rounding still passes. Relations are the pass.

On `/records/mhjl329/` with motion allowed:

1. **Opening, 390×844.** At the upright hold, on the label and the cover, the upright’s used box is centered in the imagery band, its aspect matches the file, and one axis equals the band (width, at this viewport). The whole bitmap is visible. The used box is the band’s contain-fit, not a crop and not a stretch. The plate is not the thing filling the band.
2. **Opening, desktop.** At 1440×900 the same contain rule holds. The label opening is 675×900 (height flush) inside an 801×900 pane. The cover opening is 801×801 (width flush).
3. **φ split.** At `min-width: 48rem` the imagery track is wider than the reading track, and imagery / reading is between 1.60 and 1.64. At 1440×900 the tracks are 801px and 495px. The reading column is still 题铭, 记述, 著录, and the folds. There is no itinerary row and no ①–⑥ list.
4. **Smaller plate, still a zoom.** At the notes keypoint the plate box is centered. On both viewports above, each side is smaller than the opening box. The label plate is 486px (desktop) and 255px (390). The cover plate is 577×358 (desktop) and 255×158 (390). The crop’s on-screen width is about 1.47× (label) and 2.66× (cover) its width inside the opening.
5. **Notes.** Desktop label notes sit in the side paper, outside the plate, with no scrim. Desktop cover notes sit in the letterbox, outside the plate, unless a wrapped note exhausts the band, in which case that note has a paper scrim on the plate. At 390×844, notes are not in a reserved side slot. A note in the letterbox has no scrim. A note on the plate has an opaque `var(--bg)` panel behind its own glyphs, and that panel does not cover the whole plate. No note’s glyphs intersect `.split-read`.
6. **Leaders.** A visible leader is still one dashed elbow (`6 5`) ending at the note. A leader whose centerline meets its note is absent; that mark still has its box and its note. `badge` does not choose the side.
7. **Unchanged machinery.** Scrubbing back to the upright hold shows `U` and hides the plate. `cameraBox`’s source and the beat constants match `8861768`. 记述 and `marks[].note` match `records.json`. `/records/ml4001/` still uses `.record-split`. `npm run check` and `npm run build` pass.

Reduced motion, same URLs: the plate is the measured `S`, with boxes and notes, and the page does not scrub. No-JS shows the first plate centered, capped at 72% of the pane, with no split-frame slots and no zoom.

## Out of scope

- Editing `cameraBox`, its tests, or `stageVisual`’s thresholds
- A second easing curve, `lerpBox`, or reading `angleDeg`
- `records.json`, 记述, captions, alts, `detailsNote`, `marks[].note`
- New marks, new records, a loupe, itinerary rows
- Putting ①–⑥ back into the reading column
- Legacy `.record-split`, including ml4001’s column structure and its `9.5rem` slots
- Retuning `--imagery-h`, `100svh`, `46ch`, the `48rem` breakpoint, or pin-or-pace
- Growing the imagery band so notes can form side columns
- A scrim under notes that already sit on the pane’s paper
- A translucent veil, a full-plate wash, or a new color token
- Dark-mode callout art beyond the existing tokens
- Changing the elbow into a curve, an arrowhead, or a two-corner orthogonal path

## Files a later implementation touches

This pull request adds only this document.

| Path | Later change |
|---|---|
| `src/styles/global.css` | Desktop tracks `1.618fr 1fr`. Split-frame plate centered at `S`’s rules. No split-frame `.mark-slot` sizing. Scrim background on overlay notes. No-JS cap at 72% of the pane. Narrow `--imagery-h` values stay |
| `src/pages/records/[id].astro` | Split frames stop reserving slots. The upright clip for the hold and the zoom is the pane. `applyFrame` places the upright on the path in “What the camera computes,” with the plate frame at `S`. `position()` places margin notes, then scrim notes, and drops a leader that meets its note |
| `src/data/detail-display.ts` | Pure helpers for `U`, `S`, the 0.72 / 1.25 / 0.92 factors, and the side-strip / letterbox / scrim decision. `leaderEndpoints` keeps the elbow. The split-page stack uses the pane as its origin. Legacy `stackTops` stays |
| `src/data/detail-display.test.ts` | The new boxes and the MHJL 329 worked numbers. The source reads that lock split-frame `plate-frame { width: 100% }`, the narrow `7.5rem` slot, and `min(11rem, 58%)` move to this layout. `split-stage.test.ts` still expects `.split-read` at `grid-column: 2` and `max-width: 46ch`; those stay |
| `src/data/split-stage.ts` | No change. A new helper, if the plan adds one, lives elsewhere and does not alter `cameraBox` |

## Rejected

- `object-fit: cover` for the opening, or any crop of the upright file during the hold.
- Keeping the upright contained in the plate frame so the opening and the plate share one silhouette.
- A settled plate that fills the pane. That is the same-size swap this round removes.
- Calling `cameraBox` with the pane for every `cropT`, which grows the crop until it fills the pane.
- Calling `cameraBox` with `S` for every `cropT`, which shrinks the opening into the plate.
- Editing the geometric formula inside `cameraBox` to take two views.
- Fixed `9.5rem` or `7.5rem` slots that size the plate, including the elbow spec’s single narrow gutter and its `--imagery-h` growth.
- A paper scrim on every note, including notes that already sit on the pane’s paper.
- Hiding the side and letterbox paper and laying every note on the plate.
- A second copy of the notes in the reading column.
