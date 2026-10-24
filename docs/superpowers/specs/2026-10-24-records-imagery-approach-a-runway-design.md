# Design: camera runway and pinned reading column for /records/

Date: 2026-10-24  
Site: https://lu-ceam.github.io/records/  
Status: Draft for review. Imagery Approach A locked by Rolf 2026-10-24. Spec only. Implementation follows after review and a writing-plans pass. This PR does not edit CSS, Astro, TypeScript, JSON, or image files.

Supersedes the itinerary-driven interaction and the desktop column order in [split-stage design](2026-10-24-records-imagery-split-stage-design.md). That spec’s reversible pipeline (upright → crop → plate → boxes → notes), its ~1.6s detail crossfade, and legacy `.record-split` stay. The crop path stays [camera zoom into the crop](2026-10-24-records-imagery-camera-crop-zoom-design.md): `cameraBox` is geometric scale plus translation, and this document does not restate that formula. Asset rules from [imagery reveal and manual](2026-10-24-records-imagery-reveal-manual-design.md) stay in force, including: the upright file is already deskewed, `transform.crop` is in upright pixels, burgundy boxes, box + leader + outside note when a public note exists, no loupe this round, and playback does not apply `angleDeg`.

Checked against `src/pages/records/[id].astro`, `src/styles/global.css`, `src/data/split-stage.ts`, `src/data/detail-display.ts`, and MHJL 329 in `src/data/records.json`, at `27c64e3`.

## Why

On `/records/mhjl329/` the photograph already runs upright → `cameraBox` crop → plate → boxes → notes. The scroll driver is the reading column. `STAGE_ROWS` (`原片扶正` / `裁进板心` / `标出要点` / `读注`) render as `.itinerary-row`, and each row’s `min-height` (34svh, 42svh from `48rem`) exists so the column can scrub the picture. Desktop puts that column on the left and the sticky photograph on the right (`.split-imagery` is `grid-column: 2`). When 记述 and 著录 are short, the tall rows are empty chrome. Rolf rejected that on 2026-10-24. Itinerary-driven split-stage is chrome-heavy, and the blank runway is ugly for a short reading column. He locked **imagery Approach A**: the identification story is the layout and the left-column camera.

Museum-alignment Approach A (warm paper, list rows, 记述 / 著录) is a different lock and stays.

## Goal

On reveal records, express the identification story with a **left sticky camera stage** and a **right reading column**. Page scroll height comes from an invisible runway sized to the camera beat. Scrolling that segment plays one imagery pass. The reading column holds 题铭, 记述, and 著录. It is not a stage list.

## Relationship to earlier specs

| Spec | Still owns |
|---|---|
| Museum alignment | That spec’s Approach A: warm-paper tokens, list image\|text, chrono sort, 记述 hairline, untitled 著录, folds. Not this imagery layout |
| Type + cover polish | List cover = `record.image`, 记述 / 著录 type sizes |
| Typography polish and detail page | Navigate-only URLs, skeleton B, 记述 lead markup, and the ban on a 「记述」 label, a drop cap, and a second face |
| Reveal + manual | Upright / plate / `transform.crop` / marks; burgundy boxes; box + leader + outside note when a public note exists; no loupe this round; `angleDeg` unused in playback |
| Camera crop zoom | `cameraBox` (uniform geometric scale + translation); plate hidden until `cropT` is 1; no `lerpBox`; no rotation term. That spec owns the crop math and its tests |
| Split-stage | Legacy `.record-split` for non-reveal records; the reversible pipeline; one continuous multi-detail scroll; `DETAIL_CROSSFADE_MS` (`1600`). **Superseded here:** itinerary rows as the scroll driver, reading-column stage labels, tall scrub chrome, imagery-on-the-right, soft-settle onto stage rows, and the rule that every held beat needs a line of stage copy |
| Scroll-scrub | Already superseded. Fullscreen sequential runways stay out |

The camera-crop-zoom spec mapped `cropT` onto the gap between `原片扶正` and `裁进板心`, and it told that round not to edit itinerary markup. That round has shipped (`cameraBox` is in `src/data/split-stage.ts`). This spec is the next layout shell. It removes the itinerary. It still calls `cameraBox` for the zoom, and it still holds the plate until the zoom has finished.

## Locked decisions

| Topic | Choice |
|---|---|
| Approach | Imagery Approach A — camera runway + pinned right. The identification story is layout and the left-column camera, not itinerary text |
| Desktop columns | Two columns: **left imagery, right text**. The live split puts imagery on the right; this round puts it on the left |
| Left stage | `position: sticky`, near viewport height. The only stage. Cover / upright, crop-into-plate, boxes, and 旁注 all happen inside this block |
| Camera viewport | Still the plate frame inside the stage. `cameraBox` receives that frame’s `viewW` / `viewH`. The zoom fills the plate frame, not the sticky column |
| Itinerary | No stage rows. No `原片扶正` / `裁进板心` / `标出要点` / `读注` (and no `全幅` / `板心` / `框选` / `旁注` status) as a scroll driver. No tall blank runway chrome in the reading column |
| Scroll height | Sized from the left camera beat (an invisible runway). Scrolling that segment watches one full imagery pass |
| Right column | 题铭 (minimal: the existing title block), 记述, 著录, and the existing folded sections. 旁注 do not enter this column |
| Short right text | If it fits in one viewport, pin it (sticky or fixed) while the invisible runway scrolls |
| Long right text | Pace it along the **same** left-camera progress: even displacement with total progress. No second beat timeline |
| Narrow | Image above, text below. The runway still follows the camera. No empty itinerary stack |
| Crop motion | Top-down zoom via `cameraBox`. Uniform scale + translation into the crop rect. Not `lerpBox`. `angleDeg` is not read |
| Callouts | On the image: box + leader + outside short note when `marks.note` exists. A box with no note lights up only. Do not invent a leader or a sentence |
| Note entrance | After boxes and leaders are in place, note text fade-settles (轻量浮出: fade or slide in once, then settle) |
| Soft settle | On idle, ease to the nearest **camera keypoint**, not an itinerary row |
| Multi-detail | One continuous runway. Slow crossfade of the sticky image (~1.6s, `DETAIL_CROSSFADE_MS`). Each detail reuses the same camera pipeline. Calm catalog tone. No second fullscreen chapter |
| Reduced motion | Skip to the end state: cropped plate + boxes + notes if any. No scrub |
| Legacy | `.record-split` and non-reveal records unchanged |
| Copy | 记述 copy unchanged |

## Page structure (reveal records only)

### Desktop

1. **Left imagery column.** Sticky, near `100svh`. It holds the current detail’s plate frame: upright clip, plate, burgundy boxes, leaders, and outside notes. The column is the stage. The camera’s viewport is the plate frame, as the camera-crop-zoom spec defines.
2. **Right reading column.** Paper ground. Measure stays the catalog width already in use (about 42–46ch). Do not retune type. Top to bottom: 题铭, 记述 (`.record-story`), 著录 (`.props`, `aria-label="著录"`), then the existing folds (出处, 证据核对, 待补拍).

The invisible runway is scroll height, not a visible list. It belongs to the camera beat. It is not `min-height` on a text row, and it is not a column of blank slips.

**Pin.** When the right column’s content is no taller than the viewport, it stays pinned for the whole runway. The photograph plays; the text stays put.

**Pace.** When the right column is taller than the viewport, one progress value `p` runs from 0 to 1 across the whole runway, every detail pass included. The column’s offset is linear in `p`: the start is in view at 0, the end is in view at 1. Camera beats do not get a text timeline of their own.

### Narrow

Below the current split breakpoint (`48rem`): one column. The camera stage comes first. The reading column follows. Scroll height still comes from the camera runway. The same pin-or-pace rule uses the same `p`. The image remains the stage.

### Legacy

No camera runway. Keep the current `.record-split` layout.

### What leaves the reading column

Remove the itinerary slip: per-detail scrub headings, `.itinerary-rows`, and the four stage labels. Published `marks.note` strings render on the image only.

A `details[].text` line that is not already a published mark note may remain as ordinary prose in the reading column (today’s `visibleDetailText` remainder). It is catalog text, not a stage row. It does not receive a tall `min-height`, and it does not drive `p`.

## Motion

One runway. Total progress `p` in `[0, 1]` covers every reveal detail on the record, in order. Inside a detail, local progress drives this sequence on the left stage. Scrolling up reverses it.

1. **Upright hold.** The deskewed upright sits in the plate frame at the contain pose (`cameraBox` at `t = 0`) and holds briefly.
2. **Camera zoom.** `t` runs from 0 to 1 through `cameraBox`: one uniform geometric scale and one translation, so the crop rect grows into the plate frame. No second easing curve on `t`. No `lerpBox`. No CSS rotate, and `angleDeg` is not applied. The plate stays hidden until `t` is 1. That order is the one the camera-crop-zoom spec locks.
3. **Plate, then boxes.** The upright gives way to the plate. Boxes then light up.
4. **Notes.** Leaders draw. After the boxes and the leaders are in place, each outside note fade-settles: a short fade or slide, once, then rest. A mark with no `marks.note` never grows a leader or a sentence.

`cropT` is the camera parameter during step 2. It is no longer a fraction of the gap between two itinerary rows. The zoom-then-plate order stays. The row clock does not. Do not keep the four rows in order to give `CROP_BLEND_AT` a gap to measure.

**Soft settle.** On scroll idle, ease to the nearest camera keypoint of the active detail: upright hold, zoom complete, plate settled, boxes lit, notes settled. Skip the notes keypoint when that detail has no public note. The settle is the same idle ease as today (`SETTLE_*` may be reused). The target is a keypoint, not a `.itinerary-row`.

**Right column.** It follows `p` only when its text is taller than the viewport, and only as the even displacement above. It has no keypoints of its own.

**Multi-detail.** Passes sit in series on the one runway. At the joint, the sticky image crossfades over about 1.6s (`DETAIL_CROSSFADE_MS`). The next pass starts from that detail’s upright and runs the same pipeline, including its own `cameraBox` crop. The crossfade sits on the joint, not in the middle of a zoom. There is no second fullscreen chapter and no second progress clock.

**`prefers-reduced-motion: reduce`.** Skip the scrub. Show the cropped plate, the boxes, and the notes if any. Do not reserve the runway’s extra scroll height. The reading column is normal flow.

## Manual callouts

Unchanged intent from reveal + manual, drawn on the left stage:

- Box anchors from resolved marks `x/y/w/h`.
- Public stroke stays `var(--accent)`.
- Leader to a short note outside the photograph.
- `badge` (tl\|tr) is the badge corner. `side` is the leader side.
- YAML `note` is not automatically public. Publish only note strings already approved for the site. If a mark has no public note, the box lights and nothing else is drawn for it.
- Those notes do not also appear in the right column.

The entrance is the fade-settle in Motion step 4. The annotated photograph is the stage, not a collapsed fold.

## Implementation boundary

This PR adds only this document.

A later implementation, after this spec is accepted and a writing-plans pass exists, is expected to touch:

- `src/pages/records/[id].astro`, reveal branch only. Remove the itinerary markup (`STAGE_ROWS`, `.itinerary-section`, `.itinerary-rows`). Build the left sticky stage, the invisible runway, and the right pin-or-pace column (题铭, `.record-story`, `.props`, existing `.fold` blocks). Narrow: image above, text below. In the inline client script, map runway scroll to the camera keypoints (upright hold → `cameraBox` crop → plate → boxes → fade-settle notes) instead of `settleToRow` on `.itinerary-row`. Keep the multi-detail crossfade on `DETAIL_CROSSFADE_MS`. Draw on-image callouts.
- `src/styles/global.css`, under `.record-page--split`. Remove itinerary-row `min-height` and the desktop rule that places `.split-imagery` in `grid-column: 2`. Left sticky stage, right reading column, narrow stack. Leave the warm-paper tokens alone.
- `src/data/split-stage.ts`. Keep `cameraBox`. Stop treating `STAGE_ROWS` as the page driver. A later plan may rename the module; this spec does not require that rename. `cameraBox` tests in `src/data/split-stage.test.ts` stay. Update itinerary-driver assertions in that file only as the plan requires.
- `src/data/detail-display.ts` stays the callout helper (`leaderEndpoints`, `resolvedSide`, `visibleDetailText`). Do not invent notes there.

Do not change:

- Vinyl YAML or the export protocol.
- `records.json` content, or 记述 copy.
- List pages, list crop, the tombstone, or the loupe.
- Legacy `.record-split`.
- The `cameraBox` formula.

## Acceptance

On `/records/mhjl329/` with motion allowed:

1. Desktop shows sticky imagery on the left and 记述 + 著录 on the right. There are no itinerary stage rows and no tall blank scrub chrome.
2. Scrolling the page reversibly drives upright → `cameraBox` crop zoom → plate → boxes → on-image notes. Notes appear only when note text exists. Scrolling back reverses the camera.
3. Short right-column text stays pinned. Long right-column text paces with left-camera progress, on that same progress, evenly.
4. Narrow shows the image above the text and does not show an empty itinerary stack. The runway still follows the camera.
5. Reduced motion shows the final plate + boxes (+ notes if any) and does not scrub.
6. Legacy records are unchanged. 记述 copy is unchanged.
7. The page does not read as an empty sticky demo. The didactic content is the photograph’s progressive crop and its on-image callouts, with the story and the catalog on the right. Stage labels do not fill the whitespace.

## Out of scope

- Circular pointer loupe.
- List crop. Tombstone redesign.
- Filling missing `marks.note`.
- Animating from the raw source, or deskewing with `angleDeg`.
- Inventing 记述, or editing story strings.
- Changing the YAML export protocol (`cropSpace: "upright"`, resolved marks, baked upright / plate).
- Scroll libraries (GSAP ScrollTrigger, Lenis, and the like) unless a later plan explicitly revisits.
- A second easing curve on `cameraBox`’s `t`.
- Merging any superseded itinerary chrome back in (stage rows, status labels, tall row `min-height` used as a scrub).
- Restyling the site onto another palette.
