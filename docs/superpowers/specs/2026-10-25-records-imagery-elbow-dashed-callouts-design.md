# Design: elbow-dashed callout leaders and a visible mobile plate

Date: 2026-10-25  
Site: https://lu-ceam.github.io/records/  
Status: Locked by Rolf 2026-10-25. Spec only. Implementation follows after review and a writing-plans pass. This PR does not edit CSS, Astro, TypeScript, JSON, or image files.

Amends the leader in [imagery reveal and manual](2026-10-24-records-imagery-reveal-manual-design.md) and the narrow stage in [Approach A camera runway](2026-10-24-records-imagery-approach-a-runway-design.md). `cameraBox`, the runway, and `stageVisual`’s beat boundaries stay where those specs left them.

Checked against `src/pages/records/[id].astro`, `src/data/detail-display.ts`, `src/data/detail-display.test.ts`, `src/styles/global.css`, `src/data/split-stage.ts`, and MHJL 329 in `src/data/records.json`, at `81e9602`. The mobile failure is the attached Mobile Safari capture of https://lu-ceam.github.io/records/mhjl329/ (09:30, cover notes on screen, 品相 directly underneath).

## Why

On the cover of `/records/mhjl329/` the phone shows burgundy boxes, numbered discs, and solid diagonal leaders on the cream ground. The 腰封 photograph is gone. The outside notes (1234 大江千里, the 腰封 price sentence, 完全生産限定盤, Clear Vinyl, MHJL 329, and 40th Anniversary Senri Oe) sit in that same cream field, so they read as part of the 著录 column rather than as labels beside a picture.

Rolf locked the leader on 2026-10-25: from each mark box, a **dashed** leader goes **horizontal first** for a short stub, then **one corner**, and then on to the outside note. Desktop and mobile use that same stroke. The plate has to stay visible while those notes stay readable.

## Sentences this spec replaces

| Earlier sentence | Where | Replacement |
|---|---|---|
| Leader is a straight segment from the box-edge midpoint to `0.35rem` short of the note | Reveal + manual, §8 Leader row | Section “Elbow” below. The endpoints stay. The path between them changes |
| Leaders draw on with `stroke-dasharray` / `pathLength` | The inline script in `[id].astro` (`applyFrame`) | Section “Dashes and the draw-in”. The beat stays. The dash pattern is no longer the animation |
| Below `48rem` the gutter stage is the desktop stage, with no separate mobile callout layout | Reveal + manual, §9, as inherited by Approach A’s narrow stack | Section “Mobile stage”. Approach A’s image-above / text-below split stays. The inside of the image stage changes |
| `.mark-slot` is a fixed `9.5rem` column on both sides | `src/styles/global.css` | Section “Mobile stage”. Desktop keeps the fixed slots |

Approach A still owns the left sticky camera, the invisible runway, the right reading column, pin-or-pace, `cameraBox`, and “no itinerary rows.” Reveal + manual still owns upright / plate / marks, burgundy boxes, badge versus side, and “no loupe.”

## Locked decisions

| Topic | Choice |
|---|---|
| Leader path | One elbow. Horizontal stub, one sharp corner, then a straight segment to the note |
| Extra bends | None. Leaders may cross. They do not route around boxes or each other |
| Dash | Real dashes on the stroke (`6 5` in plate units). The draw-in does not use that dasharray |
| Where it applies | Every `.mark-leader`: split frames, legacy `.record-split` figures, and non-reveal figures in the split reading column. Same path on desktop and mobile |
| Endpoints | Unchanged. Box-edge midpoint on the note’s side, and `0.35rem` short of the note’s inner edge at the note’s vertical center. No arrow |
| Mobile plate | The webp is painted whenever `plateOpacity` is 1. The upright clip cannot sit on top of it then |
| Mobile notes | Beside the plate, inside the imagery band, on one gutter when two gutters would crush the plate. They stay out of `.split-read` |
| Copy and marks | Unchanged. No new boxes. No ①–⑥ list put back into the reading column |

## What the page does today

`leaderEndpoints` in `src/data/detail-display.ts` returns two plate-space points. `(x1, y1)` is the midpoint of the box edge that faces `side`. `(x2, y2)` is `shortPx` (`0.35rem`) short of the note’s inner edge, at the note’s vertical center. The markup is an SVG `<line class="mark-leader">` in three places in `src/pages/records/[id].astro`: the legacy detail figure, the `.split-frame`, and the non-reveal figure inside the split reading column. The server line runs horizontally from the box edge to `x = 0` or `x = plate.width`. `position()` then writes `x1 y1 x2 y2`.

The draw-in lives only on that line:

```js
line.setAttribute('pathLength', '1');
line.setAttribute('stroke-dasharray', '1');
line.setAttribute('stroke-dashoffset', String(1 - visual.leadersOpacity));
```

`pathLength="1"` and `stroke-dasharray="1"` are one long dash the length of the stroke. At `leadersOpacity === 1` the offset is 0 and the stroke is solid. That dasharray cannot also be a dotted pattern. `.mark-leader` in CSS is only `fill: none` and `stroke: var(--accent)`.

`stageVisual` (`src/data/split-stage.ts`) does not hide the plate while leaders are out. `plateOpacity` is 1 for the whole of the plate, boxes, leaders, and notes beats (`u > PLATE_END`, and the crossfade before that already raises it). `LEADERS_END` stays `0.88`. This spec does not move those constants.

## Elbow

Replace the two-point segment with a polyline of two or three points in plate user units. `leaderEndpoints` returns `LeaderPoint[]` (`{ x, y }`) in order from the box to the note. Callers stop reading `x1 y1 x2 y2`.

The first point and the last point are today’s endpoints. `side` is the side the note was actually given (`data-side` after `resolvedSide`), which is the leader direction. `badge` stays the disc corner and does not aim the leader.

Let `gap = |x2 - x1|` in plate pixels. The direction of the stub is the sign of `x2 - x1` (toward the note).

| `gap` | Points |
|---|---|
| `gap >= 32` | Three. Corner at `(x1 + sign * 16, y1)`. Stub is 16 plate pixels, horizontal |
| `4 <= gap < 32` | Three. Corner at `(x1 + (x2 - x1) / 2, y1)`. The corner stays on the open span, so a short gap does not end in a kink against the note |
| `gap < 4` | Two. The straight segment from `(x1, y1)` to `(x2, y2)`, still dashed. A corner would not read |

The second segment, when there is a corner, is the straight line from the corner to `(x2, y2)`. It is diagonal when `y2 !== y1`. The corner is one vertex. `stroke-linejoin: miter`, `stroke-miterlimit: 2`, `stroke-linecap: butt`. An acute join bevels instead of throwing a spike. There is no radius, no quadratic, and no arrowhead.

Worked example, the fixture already in `detail-display.test.ts` (“stops the leader 0.35rem short of the note inner edge”):

| Point | Value |
|---|---|
| Start | `(50, 25)` — today’s `(x1, y1)` |
| Corner | `(66, 25)` — gap is 416 plate pixels, so the stub is 16 |
| End | `(466, 40)` — today’s `(x2, y2)` |

The implementation updates that test. The last point still has to match today’s short-of-the-note math. Add cases for the 16-pixel stub, the half-gap stub, and the two-point degenerate.

If the measured plate width or height is 0, `position()` does not write points and the leader stays hidden. A zero box must not aim a line.

Server HTML renders a `<polyline class="mark-leader">` with the dashed stroke. Before the script measures notes, the points are the current horizontal stand-in: box-edge midpoint to the plate edge at the same `y`. After `position()`, the points are the elbow above. No-JS keeps that horizontal dashed stand-in. It already cannot see measured note tops.

Desktop and mobile call the same helper. A narrow stage may change which side a note sits on (next section). It does not change the elbow rule.

## Dashes and the draw-in

The visible stroke is dashed at rest and while it is drawing.

| Property | Value |
|---|---|
| `stroke` | `var(--accent)`. `forced-colors: active` keeps `CanvasText` |
| `stroke-width` | `1` plate pixel, same user space as the box stroke |
| `stroke-dasharray` | `6 5` in plate user units |
| `fill` | `none` |
| Caps and join | `butt`, `miter`, miter limit `2` |

Put the dash pattern in CSS on `.mark-leader`, so a presentation attribute cannot swap it back to a solid draw-in. At a 198 CSS px plate (400-wide viewBox) a dash of 6 plate pixels is about 3 CSS pixels. That is the intended weight.

The scrub script must not set `stroke-dasharray`, `strokeDasharray`, or `pathLength` on `.mark-leader`. `settle()` must not clear the pattern by writing `stroke-dashoffset: 0` onto that element as a substitute for dashes.

Draw-in stays on the existing leaders beat (`leadersOpacity` from `BOXES_END` to `LEADERS_END`). Reveal the dashed stroke from the box toward the note with a mask:

- The mask stroke is a second polyline with the same points, class `mark-leader-mask` (not `mark-leader`, so it does not inherit the `6 5` pattern), `fill: none`, a solid stroke 3 plate pixels wide, and `stroke-linecap: butt`.
- `position()` writes the same `points` to the visible polyline and to that mask stroke.
- The mask stroke uses `pathLength` and `stroke-dashoffset` to open from the box end toward the note as `leadersOpacity` goes from 0 to 1.
- The visible `.mark-leader` keeps `stroke-dasharray: 6 5` for the whole beat. `is-plate` (below) does not force leader opacity. Boxes, leaders, and notes still follow `stageVisual` inline, so the boxes beat can fade in while the plate is already fully shown.

At `leadersOpacity === 0` the leaders group stays at opacity 0, as it does now. At `1` the mask is fully open and the stroke on screen is the `6 5` pattern, including after resize and after `clearScrubStyles`.

Reduced motion shows that full dashed elbow and does not tween. Today `showSettled` returns before `position()`, so a reduced-motion split frame keeps the server’s horizontal stand-in and unstacked notes. The implementation calls `position()` from that path, and it does not leave `mark-leader-mask` closed: omit the mask, or set it fully open, whenever `data-motion` is not `ok`. No-JS cannot measure notes, so it keeps the server’s dashed horizontal stand-in. An unset `data-motion` does the same. Neither tweens.

`position()` and `applyFrame` query the polyline (the element is not an `SVGLineElement`). There are three markup copies; all three change together.

## Mobile plate, diagnosed

The capture is the cover notes beat. Discs 1, 6, and 4 match cover marks `1` (the wide title box), `6` (40th Anniversary, the only cover mark whose `resolvedSide` is right), and `4`. Notes are on both sides. Leaders are solid diagonals, which is today’s `<line>` once `leadersOpacity` is 1. The 腰封 pixels are absent and `--bg` (`#f3f0e8`) shows through.

`stageVisual` would have `plateOpacity === 1` for that beat, and `applyFrame` writes it to `img.plate`. So a stylesheet `opacity: 0` is not, by itself, the notes-beat frame while the script is running. Three mechanisms in the current CSS and markup still produce this picture. The implementation confirms which one is active on Mobile Safari, and the acceptance checks below have to pass whichever it was.

### 1. The bitmap never paints, while the SVG does

`.split-frame .plate-frame` sets `background: transparent`. `.split-imagery` paints `background: var(--bg)`. An `<img class="plate">` with a box and no decoded pixels is a cream rectangle. The overlay SVG is a later sibling, so boxes, discs, and leaders paint on top of that cream. Disc fill is also `var(--bg)`, which reads as a hole.

Two ways the pixels go missing:

- The cover is the second frame. Its plate and upright are `loading="lazy"`. Only `index === 0` is `loading="eager"`. The inactive frame is `opacity: 0`, stacked on `grid-area: 1 / 1`, inside `.split-imagery` (`position: sticky; overflow: hidden; height: 58svh`). Safari often skips a lazy image in that box. The element still has `width` and `height`, so the callout layer keeps its size.
- Every unsettled split plate starts at `opacity: 0` under `html[data-motion='ok'] .record-page--split .split-frame:not(.is-settled) .plate`. The split path never adds `is-settled`. Inline opacity is the only thing that brings the plate back. On iOS, an image that spends the upright and zoom beats at opacity 0 inside a sticky `overflow: hidden` box can fail to composite when the inline opacity returns to 1. The SVG is a different layer and still draws. That hits the eager label as well as the lazy cover.

### 2. The upright clip is a cream veil between the photo and the SVG

DOM order inside `.plate-frame` is plate image, `.upright-clip`, `.plate-overlay`, `.mark-list`. The clip is `position: absolute; inset: 0; background: var(--bg)`. For every unsettled split frame with `data-motion="ok"`, CSS sets the clip to `opacity: 1; visibility: visible`. `applyFrame` writes `clip.style.opacity` from `uprightOpacity` and never writes `visibility`. On the notes beat `uprightOpacity` is 0, so a healthy inline style hides the veil. If that inline opacity is dropped, or the clip’s background layer stays up, the veil covers the photograph and the SVG stays above it. That sandwich is the screenshot.

`clearScrubStyles` assigns `style.opacity = ''` on the plate, the clip, the graphics, the leaders, and the notes together. It runs when leaving motion, not during a normal scrub. After a clear, the unsettled-frame rule hides the plate again because the frame is never `is-settled`. Any future path that clears the plate’s inline opacity without also hiding the callouts returns to boxes-on-cream. The stylesheet fix below closes that.

### 3. Two fixed gutters can shrink the plate to nothing

`.layout-wide .column` is `min(72rem, calc(100% - 2rem))`. The acceptance font is a 16px initial size, so `1rem` is 18px and `2rem` is 36px. A 390px-wide phone gives the column `354px`.

`.mark-slot` is `flex: 0 0 9.5rem` (171px) and does not shrink. Cover notes resolve to both sides (marks 1–5 left, mark 6 right). Label notes do too (mark 4 left, the other five right). `ensureSlots` inserts both gutters. Two slots plus two `0.55rem` gaps are `361.8px`, wider than the 354px column. `.plate-frame` is the only shrinkable item (`flex: 0 1 auto; min-width: 0`), so its used width goes to about 0.

A zero-width plate is a blank stage. This capture’s boxes are still large, so this phone did not end on a zero box. The defect is real on a 390px column anyway, and it is why the notes occupy a text measure of their own next to 品相. `.mark-list` is `position: absolute; inset: 0` on the plate frame. Each note is `max-width: 9.5rem`, placed with `left` or `right: calc(100% + 0.55rem)`. They are not children of `.split-read`. They look like 著录 because the photo between them and the `.props` hairline is missing, and because a 9.5rem gutter is a reading measure.

`.split-imagery` is `height: 58svh; overflow: hidden` (`42svh` when `max-width: 47.99rem` and `max-height: 32rem`). `.split-read` is sticky at `top: 58svh` with `margin-top: 58svh` and `z-index: 1` under the imagery. Notes that hang below the plate are clipped at 58svh rather than reflowed, and the reading column starts immediately under that clip. Callout text must stay inside the imagery band.

## Mobile stage

Approach A’s narrow page stays one column: sticky imagery, then the reading column (题铭, 记述, 著录, folds). The runway still drives the camera. No itinerary rows. Desktop (`min-width: 48rem`) keeps two columns, both `9.5rem` slots when that side has notes, and a `100svh` imagery pane. This section is the inside of the imagery pane below `48rem`.

### Plate pixels

- Every `.plate` and every `.upright` inside `.split-frame` is `loading="eager"`. `fetchpriority="high"` stays on the first plate only. The cover request has to start on first paint of the record page, including while its frame is `opacity: 0`.
- Keep today’s first-paint rules for an unsettled split frame when `data-motion="ok"`: `.plate` at opacity 0, `.upright-clip` at opacity 1 and `visibility: visible`. The head script sets `data-motion` before paint, so the upright hold is what shows up before `applyFrame`.
- Add `is-plate` on the frame while `plateOpacity === 1`, and remove it whenever `plateOpacity < 1`. Rules for `.is-plate` come later in the file and override the hold: `img.plate` opacity 1, and `.upright-clip` opacity 0 with `visibility: hidden`. They do not set box, leader, or note opacity. Those keep following `stageVisual`, so the boxes beat can still fade in after the plate is fully shown. If a later path clears inline opacity during the notes beat, the photograph stays and the veil stays off.
- When `uprightOpacity === 0`, including the crossfade before `is-plate` is on, `applyFrame` sets the clip’s inline opacity to `0` and its `visibility` to `hidden`. When `uprightOpacity > 0`, visibility is `visible` and opacity follows the number. A hidden clip does not paint `background: var(--bg)` over the plate.
- Plate inline opacity and the callout opacities are written in the same `applyFrame` pass. `clearScrubStyles` may clear that set together when leaving motion. It must not clear the plate and leave the callouts showing while `data-motion="ok"`.

### One gutter when two will not fit

Below `48rem`, `position()` measures the stage content width `W` (CSS pixels) and the root font.

| Name | Value |
|---|---|
| Plate floor `F` | `min(11rem, 58% of W)` |
| Gap `G` | `0.55rem`, the existing stage gap |
| Pair minimum `M` | `7.5rem`. A gutter narrower than this is not a readable note column |

If `W >= F + 2M + 2G`, keep a gutter per side that has notes. Each slot is `flex: 1 1 7.5rem; min-width: 0; max-width: 9.5rem; width: auto`. Notes stay on `resolvedSide`. The plate is `flex: 1 1 auto; min-width: F` and may grow into leftover space.

If `W < F + 2M + 2G`, use one gutter. Count notes per `resolvedSide`. The side with more notes wins. An equal count goes right. Write that side onto every note’s `data-side` for this layout pass. JSON `side` is unchanged. `ensureSlots` inserts only that slot. Leaders follow the rendered side, so every elbow leaves toward the one note column. The plate keeps `min-width: F`. The single slot takes the remaining width, still `max-width: 9.5rem` and `min-width: 0`. Its used width is `min(9.5rem, W - G - F)`, and the plate’s used width is `W - G - gutter`. Flex growth must not put the plate under `F` or the gutter under that remainder. In the two-gutter case each gutter is at least `M` and at most `9.5rem`, and the plate takes what remains, still at least `F`.

The note `li` is absolutely positioned against the plate frame, so a percentage `max-width` resolves against the plate, not the slot. Below `48rem`, `position()` sets each note’s `max-width` to the rendered gutter’s used width, capped at `9.5rem`, so a narrow gutter cannot spill back across the photograph.

On a 390px phone the column, and the stage inside it, is 354px (`58svh` times the plate aspect is wider than the column, so the stage width is `100%`). `F` is `min(198px, 58% of 354px)` = `min(198, 205)` = 198px. Two gutters at `M` need `198 + 135 + 135 + 19.8` = 488px, so the phone takes one gutter. Cover notes are five left and one right, so the gutter is the left and 40th Anniversary joins that stack. The plate is 198px wide (123px tall at 400×248) and the gutter is `354 - 198 - 9.9` = 146px. Label notes are five right and one left, so that plate’s gutter is the right.

`11rem` on a 400-wide viewBox is half a plate. That is the floor, not the usual desktop size. `58%` keeps a 320px viewport (column `320 - 36` = 284px) from spending the whole row on an 11rem floor: `F` is `min(198, 165)` = 165px and the gutter is about 109px.

Desktop slots stay `flex: 0 0 9.5rem`. This override is only below `48rem`.

### Notes inside the imagery band

Notes stay outside the plate rectangle and inside `.split-imagery`. They are not moved into `.split-read`, and they are not repeated there. `stackTops` is unchanged: order by anchor, `0.35rem` gap, no top above the plate, hang below the plate when the stack needs it.

`.split-imagery` keeps `overflow: hidden` so the camera cannot spill. Note glyphs must not be what gets clipped, and they must not paint over 品相. Fit them in this order:

1. Give the gutter the width the rules above already give it, and let notes wrap at that width. Type stays `0.78rem` / line-height `1.45`.
2. If the stack is taller than the imagery band, reduce the plate’s used width down to `F` and give the freed width to the gutter or gutters. Not below `F`. On a 390px phone the plate is already at `F`, so this step changes nothing there.
3. If glyphs would still clip, raise `--imagery-h` on `.record-page--split` from `position()`, and only while the viewport is below `48rem`. Imagery height, and the reading column’s `top`, `height`, and `margin-top`, use `var(--imagery-h)` below `48rem`. The initial value is `58svh`, and `42svh` in the existing short-height query. The cap is `70svh`. The two regions still tile. There is no inner scroller. Desktop rules keep a literal `100svh` and do not read `--imagery-h`.

No-JS does not run `position()`, so it keeps the initial `--imagery-h` and the server’s single right-hand slot (`paintSide` sends `auto` right). It also never adds `is-plate`. With `data-motion="ok"` the existing unsettled rule still hides the plate. That is the current no-JS split page, and this spec leaves it. The capture is a scripted notes beat: the leaders meet the notes, rather than the server’s horizontal stand-in. The plate file is still requested.

## Desktop

Unchanged shell: sticky imagery at `100svh` on the left, reading column on the right, runway scroll, pin-or-pace. Both gutters when both sides have notes. The elbow, the `6 5` dash, the mask draw-in, eager split images, and the `is-plate` / clip-visibility rules apply here too. A desktop plate is not squeezed by two 9.5rem slots; the floor rule is the narrow one.

## Files a later implementation touches

This pull request adds only this document.

| Path | Later change |
|---|---|
| `src/data/detail-display.ts` | `leaderEndpoints` returns the polyline points in “Elbow” |
| `src/data/detail-display.test.ts` | Endpoints still match the short-of-note fixture. New cases for 16px, half-gap, and `gap < 4` |
| `src/pages/records/[id].astro` | Three `<line>` sites become dashed `<polyline>`s plus `mark-leader-mask` strokes. `position()` writes both `points` lists and the narrow note `max-width`. `showSettled` calls `position()`. `applyFrame` masks the draw-in, toggles `is-plate`, and sets clip `visibility`. Split plates and uprights are `loading="eager"`. Narrow stage uses one gutter when the pair does not fit, and may set `--imagery-h` below `48rem` |
| `src/styles/global.css` | `.mark-leader` dash, join, and caps. `.is-plate` shows the plate and hides the clip, after the existing unsettled hold rules. Below `48rem`, shrinking slots, plate `min-width`, and `--imagery-h` in place of the hardcoded `58svh` / `42svh` imagery and reading-column offsets. Desktop slot rule and `100svh` stay |

Do not change `src/data/split-stage.ts` beat constants, `cameraBox`, `records.json`, 记述, or the YAML export.

## Acceptance

Viewport checks use a 16px initial font (`1rem` = 18px) and the light theme (`--accent` `#7c2d22`, `--bg` `#f3f0e8`).

1. On `/records/mhjl329/` at the notes keypoint, desktop and a 390×844 CSS px viewport, every leader is a dashed elbow: horizontal stub, one corner, then a straight run that stops `0.35rem` short of the note. No arrow. No third corner. The stroke is the `6 5` pattern at rest, not a solid line. `badge` does not choose the side.
2. With motion allowed, the leaders beat still sits between boxes and notes (`LEADERS_END` 0.88). During the beat the visible stroke is dashed, revealed from the box toward the note. At the end of the beat the pattern is `6 5`, including after a resize. Reduced motion shows that same dashed elbow, with `position()` run from the settled path, and does not tween. No-JS shows the dashed horizontal stand-in and does not tween. The scrub script does not set `stroke-dasharray` or `pathLength` on `.mark-leader`.
3. The existing endpoint fixture’s first point is `(50, 25)`, its corner is `(66, 25)`, and its last point is `(466, 40)`. A gap under 4 plate pixels returns two points. A measured plate of 0×0 does not publish leader points.
4. At 390×844, on both the label and the cover, at the notes keypoint: the plate `<img>` has `naturalWidth` equal to the file width, computed opacity `1`, and the 腰封 or label artwork is visible inside the boxes. `.upright-clip` computed visibility is `hidden`. The cream ground does not replace the photograph.
5. At that same 390×844 notes keypoint the cover uses one left gutter and the label uses one right gutter. The plate’s used width is at least `F`. No note rectangle intersects the plate rectangle. No note glyph intersects `.split-read`. 品相, 均衡, and 状态 stay in the reading column, under the imagery.
6. At `min-width: 48rem` both gutters remain when both sides have notes. Imagery stays `100svh`. The reading column is still 题铭, 记述, 著录, and the folds. There is no itinerary row.
7. Scrubbing back from notes to the upright hold hides the plate again and shows the upright. `cameraBox` and the beat constants are unchanged. 记述 copy and `marks[].note` strings are unchanged. `npm run check` and `npm run build` pass.

## Out of scope

- Bringing back itinerary rows, stage labels, or tall scrub chrome in the reading column
- A loupe or any magnifier
- New records, new marks, or new detail parts
- Editing 记述, captions, alts, `detailsNote`, or `marks[].note`
- Putting the numbered ①–⑥ lines back into the reading column
- Changing `cameraBox`, `stageVisual` boundaries, `DETAIL_CROSSFADE_MS`, or the runway’s svh lengths
- A second leader style for mobile, a curved leader, or an arrowhead
- Routing leaders around each other
- Dark-mode callout art beyond the existing `--accent` token
- Legacy `.record-split` column structure, other than the shared elbow and dash on its leaders

## Rejected

- A two-corner orthogonal elbow (horizontal, vertical, horizontal). That is a second bend, and the stub is no longer the short one.
- Keeping `pathLength="1"` and `stroke-dasharray="1"` on `.mark-leader` and calling the draw-in “dashed.” At rest that stroke is solid.
- Leaving both `9.5rem` slots `flex: 0 0` on a 390px column. They sum past the column, and the plate is the item that shrinks.
- Moving the outside notes into `.split-read` so they become body copy. They are callouts. The photograph has to be there so they read as callouts.
- Treating the missing plate as only an opacity keyframe. On the notes beat the keyframe is already 1. The image request, the clip veil, and the gutter floor have to change with it.
