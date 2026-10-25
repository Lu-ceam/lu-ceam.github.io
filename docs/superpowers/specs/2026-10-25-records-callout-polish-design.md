# Design: callout polish — note index, plate overlay, shorter mobile pane

Date: 2026-10-25  
Site: https://lu-ceam.github.io/records/  
Status: Locked by Rolf 2026-10-25 as composite A. Spec only. Implementation follows after review and a writing-plans pass. This PR does not edit CSS, Astro, TypeScript, JSON, or image files.

Amends note placement, the mark disc, and the settled mobile pane height in [contain-fill, φ split, and margin-first notes](2026-10-25-records-imagery-contain-fill-phi-overlay-design.md). The elbow stroke from [elbow-dashed callouts](2026-10-25-records-imagery-elbow-dashed-callouts-design.md) stays dashed `6 5`. On split frames the path gains a terminal horizontal stub and drops a leader that would cross. Numbered discs on the plate, from [imagery reveal and manual](2026-10-24-records-imagery-reveal-manual-design.md), come off `.split-frame` callouts. The index moves onto the note.

`cameraBox`, `stageVisual`, the φ tracks, the contain-maximized opening, and the smaller centered plate `S` stay as shipped in `#43` / `#44`. This document does not retune that camera.

Checked against `src/pages/records/[id].astro`, `src/styles/global.css`, `src/data/detail-display.ts`, `src/data/split-stage.ts`, and MHJL 329 in `src/data/records.json`, at `00315bf`. The mobile failure is the settled callout on https://lu-ceam.github.io/records/mhjl329/: the waistband (cover) frame and the Side A label frame. Notes sit in the letterbox above and below a small plate. Dashed leaders cross and stop short of the sentences. Numbered discs sit in the middle of the short mark boxes. A tall cream band remains between that imagery and 记述 / 品相.

## Goal

On reveal records (`.record-page--split`), after the notes beat:

1. The mark box alone marks the region. Split frames do not paint a numbered disc on the box.
2. Each note shows its index as a prefix on the note text.
3. A leader runs from its own box to its own note and meets that note on a short horizontal stub. A leader that would cross another, or that cannot meet its note, is omitted.
4. Below `48rem`, a side strip that is too narrow takes plate overlay (paper-scrim notes on the plate, overlay-no-gutter). It does not take the letterbox.
5. Below `48rem`, once notes are placed, the imagery pane shrinks to the plate plus those notes, and 记述 follows. The pane does not keep a tall empty band.

Desktop keeps today’s margin, then letterbox, then scrim. The φ split stays.

## Locked requirements (composite A)

These sentences are the lock. The sections below give them numbers. They do not add a second choice.

- **No numbered badges on mark boxes** by default. The red crop/mark box alone marks the region.
- **Index lives on the note text** (prefix ①②… or equivalent before each note).
- **Leaders own box→note**: elbow dashed leaders must clearly terminus into the note’s inner edge (short horizontal stub into the note). If a leader would cross another or cannot meet its note cleanly, **omit** that leader rather than draw a confusing path.
- **Mobile**: prefer **plate overlay** (paper-scrim notes on/over the plate, overlay-no-gutter) when side strips are too narrow — do **not** prefer letterbox scatter. Desktop keeps margin/letterbox-first notes as today (φ split unchanged).
- **Collapse imagery pane height** on mobile after settle to roughly plate + overlaid notes so the blank gap before 记述 disappears. Do not force a tall empty `--imagery-h` / 100svh band once notes are placed.
- Desktop φ imagery:reading and contain-fill → smaller centered plate camera motion are **out of scope** (already shipped).

The mark box is the existing `.mark-box` stroke, `var(--accent)` (`#7c2d22` in the light theme). “Red crop/mark box” in the lock is that box. The camera crop is not a badge and is not restyled.

## Sentences this spec replaces

| Earlier sentence | Where | Replacement |
|---|---|---|
| Below `48rem`, notes skip the side strip when it is under `6.5rem` and stack in the letterbox when the band is at least `2.6rem`. Scrim is the leftover | Contain-fill, “Notes”, steps 1–3, including the worked 390×844 rule | Section “Where notes sit”. Narrow strips skip the letterbox and use overlay-no-gutter. Desktop keeps the three steps |
| Leaders may still cross each other and may still cross other boxes. Hide a leader whose centerline meets its note. The end is `0.35rem` short of the note | Contain-fill, “Leaders”; elbow spec, “Extra bends: None” and the unchanged `0.35rem` endpoint | Section “Leaders”. Split frames meet the inner edge on a horizontal stub. A crossing leader is omitted. Legacy `.record-split` keeps the short gap and may still cross |
| `--imagery-h` stays `58svh` (`42svh` in the short-height query). `positionSplit` clears an inline `--imagery-h` | Contain-fill, “Narrow”; live `positionSplit` | Section “Settled mobile pane”. After notes are placed, the inline value is the content height. Desktop stays `100svh` |
| A numbered disc sits on the box corner, or in the box center when the box is smaller than the disc | Reveal + manual, badge row; live `badgeCenter` and `.mark-disc` / `.mark-num` on every `.split-frame` | Section “Index on the note”. Split frames do not paint the disc. The index is a prefix on the note |

Approach A still owns the sticky camera, the runway, pin-or-pace, and the reading order. Contain-fill still owns `U`, `S`, the 0.72 / 1.25 / 0.92 factors, φ:1, and desktop margin-first notes. The elbow spec still owns `6 5`, the mask draw-in, `is-plate`, and eager split images. Reveal + manual still owns `badge` versus `side` on legacy figures.

## Locked decisions

| Topic | Choice |
|---|---|
| Scope | Callouts on `.record-page--split` after the notes are placed. Camera, φ, and `S` stay |
| Discs | No `.mark-disc` and no `.mark-num` on `.split-frame`. The box is the region |
| Index | 1-based mark order, rendered as a ①–⑳ prefix on the note. No new JSON field |
| Leaders | Own box to own note. Last segment is a horizontal stub that meets the note’s inner edge. Dash stays `6 5` |
| Crossing | Omit the leader. Do not add a bend to route around another leader |
| Mobile notes | Strip under `6.5rem` → overlay-no-gutter (paper scrim on the plate). Letterbox is not the narrow fallback |
| Desktop notes | Side margin, then letterbox, then scrim, as shipped. φ tracks stay `1.618fr` / `1fr` |
| Pane | Below `48rem`, after notes are placed, `--imagery-h` becomes plate + notes + pad. It does not stay `58svh`, `42svh`, or `100svh` |
| Plate size | `S` is the box computed in the pre-collapse pane. Shrinking the pane does not recompute `S` |
| Legacy | `.record-split` / ml4001 keeps discs, slots, and the current elbow |
| Copy | `records.json`, mark coordinates, and 记述 stay |

## What the page does today

Desktop (`.record-page--split` at `min-width: 48rem`) is `grid-template-columns: minmax(0, 1.618fr) minmax(0, 1fr)`. Imagery is `height: 100svh`. `placeNotes` runs after `S` is known.

1. Side strip `(P.width - S.width) / 2` at least `MIN_NOTE_REM` (`6.5rem`): notes stack in that strip.
2. Else, letterbox band `(P.height - S.height) / 2` at least `MIN_BAND_REM` (`2.6rem`): notes stack in the top band, then the bottom band, split left/right by resolved side.
3. Else, paper scrim on the plate, inset `0.55rem`, opaque `var(--bg)`.

`1rem` = 18px at the acceptance font. At 390×844 the column is 354px wide and `--imagery-h` is `58svh` (489.5px). Contain-fill’s worked `S` is 255×255 (label) and 255×158 (cover). Both side strips are 2.75rem, under 6.5rem. Both letterbox bands are over 2.6rem (about 6.5rem and 9.2rem). Every note takes step 2. That is the letterbox scatter in the two mobile frames: sentences in the cream above and below the plate, long dashed leaders between them.

`positionSplit` calls `removeProperty('--imagery-h')` on every pass. The stylesheet value stays `58svh`, or `42svh` when `max-width: 47.99rem` and `max-height: 32rem`. The plate is centered in that band. Notes do not fill it. `.split-read` uses `top` / `margin-top: var(--imagery-h)`, so 记述 and the 品相 row start after the whole band. The unused cream inside the band is the blank gap.

Each mark paints `.mark-box`, `.mark-disc`, and `.mark-num`. `badgeCenter` puts the disc in the `tl` / `tr` corner. When `w` or `h` is under the disc diameter plus 3 plate pixels (25px on a 400-wide plate), the disc is centered. On MHJL 329 that centers the disc on label marks 2–5 and cover marks 2, 3, and 5, over the glyphs those boxes are there to show. The note’s `.mark-index` is clipped to a 1px square. The visible number is only the disc.

`leaderEndpoints` still ends `0.35rem` short of the note’s inner edge, at the note’s vertical center, after one horizontal stub from the box. `writeLeaders` then drops a leader whose polyline meets that note, or whose `data-omit-leader` is `1`. Leaders are allowed to cross each other. On the letterbox frames the diagonals cross, and the short gap leaves the dash in open paper instead of on the sentence.

`visibleDetailText` still drops a circled line whose text is a published `marks.note`. The reading column does not repeat ①–⑥. That stays.

## Index on the note

Split-frame notes show the index. The disc does not.

The index is the mark’s 1-based position in `details[].marks`, the same order `.mark-num` uses today (`index + 1`). It is not a field on the mark. `records.json` does not gain `index`, `label`, or a rewritten `note`.

| Index | Prefix |
|---|---|
| 1–20 | The circled numeral already matched by `CIRCLED_PREFIX` in `src/data/detail-display.ts`: ①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳ |
| 21 and above | Parenthesized decimal: `(21)` |

The prefix is the first text of the note line: prefix, one space, then `marks.note`. Type stays `0.78rem` / line-height `1.45` / `var(--text)`. A `.mark-label` that `showMarkLabel` still shows stays above that line, without a second index. `.mark-index` is this visible prefix. It is not also a clipped duplicate. The `<ol>` stays `list-style: none` and does not add another marker, so the index is announced once.

MHJL 329’s label notes read ① GREAT TRACKS 标 through ⑥ SIDE A. The cover notes read ① 1234 大江千里 through ⑥ 40th Anniversary Senri Oe. Those strings stay out of `.split-read`.

`.split-frame` does not render `.mark-disc` or `.mark-num`. `badgeCenter` is not called for that frame. `badge` remains in JSON for legacy figures and does not aim the leader. The burgundy `.mark-box` is unchanged: `fill: none`, `stroke: var(--accent)`, `stroke-width: 2` plate pixels.

## Where notes sit

`resolvedSide`, `MIN_NOTE_REM` (`6.5`), `MIN_BAND_REM` (`2.6`), `NOTE_CAP_REM` (`9.5`), `NOTE_GAP_REM` (`0.35`), and `SCRIM_INSET_REM` (`0.55`) stay. `S` is still computed before notes, from the pre-collapse pane. Notes do not resize `S`.

### Desktop

At `min-width: 48rem`, `placeNotes` keeps the shipped order.

1. **Side margin**, when the strip is at least `6.5rem`.
2. **Letterbox**, when the strip is narrower and the band is at least `2.6rem`.
3. **Paper scrim**, for a note that fits neither.

At the worked 1440×900 pane the label strip is 8.75rem, so label notes stay in the side paper. The cover strip is 6.2rem and the letterbox is about 15rem, so cover notes stay in the letterbox unless a wrapped note exhausts the band. φ columns, `100svh` imagery, and the `46ch` reading cap stay.

### Mobile: overlay-no-gutter

Below `48rem`:

1. **Side margin**, when the strip is at least `6.5rem`. Same stack as desktop. No scrim on those notes.
2. **Plate overlay**, otherwise. Every remaining note is a paper scrim on the plate. The letterbox bands are empty. Notes are not placed in the cream above or below `S`.

The frame records the fallback as `data-callout="overlay-no-gutter"` when step 2 runs for any note. A frame whose notes all took the side margin records `data-callout="margin"`. Desktop does not need the attribute.

Scrim rules stay. The panel is opaque `var(--bg)`, padding `0.35rem 0.45rem`, inset `0.55rem` from the note’s resolved side of `S`, width at most `9.5rem`. Notes on one side stack by anchor with gap `0.35rem` and stay inside `S`. Nudge by 4 CSS pixels, vertical first, until the border box misses every mark box. There is no disc to dodge. If no free slot exists inside `S`, keep the note on the side with less box area and set that note’s leader to omitted. The panel covers the note, not the plate.

At 390×844 both strips are 2.75rem, so the label and the cover both take overlay-no-gutter. All six notes on each plate are scrims. None sit in the letterbox.

## Leaders

Split-frame leaders only. Legacy `.record-split` keeps `leaderEndpoints` as shipped: one corner, end `0.35rem` short, crossings allowed.

The stroke stays the elbow spec: `stroke: var(--accent)`, `stroke-dasharray: 6 5` in plate user units, `stroke-width: 1`, butt caps, miter join, miter limit 2. The mask draw-in stays on the leaders beat. The scrub script still does not set `stroke-dasharray` or `pathLength` on `.mark-leader`.

### Path

Plate user units. `side` is the side `placeNotes` wrote. The inner edge is the note edge that faces the other side: the note’s left edge when `side` is right, the note’s right edge when `side` is left. `T` is that edge at the note’s vertical center. The stroke ends at `T`. It meets the note. The `0.35rem` gap is not used on split frames. The stroke does not continue into the glyphs.

`gap` is the horizontal distance from the box-edge `x` to `T.x`, signed toward the note. `P0` is the midpoint of the box edge that faces `side`, as today: `(mark.x, midY)` on the left, `(mark.x + mark.w, midY)` on the right.

| `gap` | Last segment |
|---|---|
| `gap >= 32` | Horizontal stub of 16 plate pixels ending at `T` |
| `4 <= gap < 32` | Horizontal stub of `gap / 2` ending at `T` |
| `gap < 4` | No stub. See “Omit” |

When `P0.y` equals `T.y`, the path is the single horizontal segment from `P0` to `T`. The stub is the end of that segment.

When `P0.y` differs from `T.y` and `gap >= 4`, the path has four points and two corners:

1. `P0`.
2. The box stub, 16 plate pixels toward the note when `gap >= 32`, otherwise half of `gap`. Same thresholds as the shipped elbow. The corner stays on `P0.y`.
3. The outer end of the terminal stub, on `T.y`.
4. `T`.

The middle segment is the straight run between the two stubs. It is diagonal when both axes change. There is no third corner, no radius, and no arrowhead.

Worked path, box edge `(100, 40)`, note inner edge `x = 200`, note center `y = 70`. `gap` is 100.

| Point | Value |
|---|---|
| `P0` | `(100, 40)` |
| Box stub | `(116, 40)` |
| Stub start | `(184, 70)` |
| `T` | `(200, 70)` |

The last segment is horizontal and ends on the inner edge.

### Omit

Build candidates in ascending mark index. Accept a candidate into the painted set, or omit it. An omitted leader has no `points` on `.mark-leader` or `.mark-leader-mask`. The box and the indexed note still paint.

Omit when any of these is true:

- `gap < 4`, unless `P0.y` equals `T.y` and the straight segment from `P0` to `T` passes the tests below.
- `gap` is negative (the inner edge is on the wrong side of the box edge).
- The polyline enters the note’s interior. Ending at `T` on the inner edge is the success case, not a hit. The shipped `leaderHitsNote` treats any border contact as a hit; split frames treat own-note contact at `T` as success and still omit a path that enters that note’s interior.
- The polyline intersects another note’s border box.
- The polyline intersects another mark box. Touching its own box at `P0` is the departure, not a hit.
- A segment properly intersects an already-accepted leader. Shared endpoints and a mere touch along a collinear overlap are not a cross. A crossing in open paper is.

Do not insert a corner to dodge a cross. The earlier index keeps its leader. The later one is omitted.

`data-omit-leader="1"` from the scrim fallback still omits that leader before this pass.

## Settled mobile pane

Below `48rem`, `U` and `S` are computed in the stylesheet pane: `--imagery-h` at `58svh`, or `42svh` in the existing short-height query. The camera zoom plays in that pane. `plateBox`’s factors stay 0.72 / 1.25 / 0.92. This section does not change `S`.

Once notes are placed and shown (the notes beat, including reduced motion and a fully settled frame), write an inline `--imagery-h` on `.record-page--split`:

```
pad = 0.75rem
unionTop = min(S.top, each placed note’s top)
unionBottom = max(S.bottom, each placed note’s bottom)
contentH = (unionBottom - unionTop) + 2 * pad
```

`contentH` is capped at the stylesheet pane height. It only shrinks. Overlay notes that stayed inside `S` make `union` equal `S`, so `contentH` is the plate height plus `1.5rem`.

The plate’s used width and height stay that pre-collapse `S`. The implementation does not call `plateBox` with the collapsed pane. Inside the short pane the union sits with `pad` above it. The old letterbox is not kept and not redistributed. Side paper may remain beside `S`; the width of the column does not change.

`.split-read` already keys `top`, `margin-top`, and `height` off `var(--imagery-h)` below `48rem`. The shorter value brings 记述 and 品相 up under the pad. There is no second empty band.

Before the notes beat, clear the inline property so the opening and the zoom keep the tall pane. Scrubbing back above the notes beat clears it too. At `min-width: 48rem`, clear it and keep `height: 100svh` on the imagery. A resize across `48rem` clears or writes to match the breakpoint. The height change is not a new tween. Reduced motion does not animate it.

`positionSplit` today removes the inline property on every pass. That clear is what keeps the settled phone on `58svh`. The notes beat replaces the clear with the `contentH` write. Earlier beats still clear.

Worked 390×844, notes inside `S`, `pad` = 13.5px:

| Plate | Pre-collapse pane | Frozen `S` | Settled `--imagery-h` |
|---|---|---|---|
| Label | 354×489.5 | 255×255 | 282px |
| Cover | 354×489.5 | 255×158 | 185px |

A 2px difference from subpixel rounding still passes. The relation is the lock: the settled band is about the plate plus the pad, and it is shorter than `58svh`. Re-fitting `S` inside the short pane would shrink the label plate toward about 152px. That re-fit fails acceptance.

No-JS does not measure, does not place overlay notes, and does not write `contentH`. It keeps the stylesheet `--imagery-h` and the server’s note list. The scripted path, including reduced motion, does the collapse.

## Motion

Beats stay on the shipped `stageVisual` thresholds. `UPRIGHT_END`, `ZOOM_END`, `PLATE_END`, `BOXES_END`, `LEADERS_END`, `PASS_SVH`, `JOINT_SVH`, and `DETAIL_CROSSFADE_MS` stay.

1. **Upright hold and zoom.** Tall pane. Plate hidden. No discs, no notes, no leaders. `S` is the pre-collapse box, already centered, opacity 0.
2. **Plate and boxes.** The plate fades in at frozen `S`. Boxes fade in. No discs.
3. **Leaders.** Dashed elbows draw from the box toward the note, mask unchanged. An omitted leader stays out for the whole beat.
4. **Notes.** Notes fade in with their index prefix. A scrim note fades in with its paper panel. On a narrow viewport the pane then takes `contentH`. `S` does not resize.

Scrolling up reverses the sequence and restores the tall pane above the notes beat. Reduced motion skips the scrub, runs placement, shows `S`, the boxes, and the notes, and uses `contentH` below `48rem`.

## Constraints

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

## Acceptance

Viewport checks use a 16px initial font (`1rem` = 18px) and the light theme. Pixel figures assume no scrollbar. A 2px difference from subpixel rounding still passes.

On `/records/mhjl329/` with motion allowed, at the notes keypoint:

1. **No discs.** On the label and the cover, at 390×844 and at 1440×900, `.split-frame` has a `.mark-box` per mark and no `.mark-disc` and no `.mark-num`. Label marks 2–5 and cover marks 2, 3, and 5 do not have a circle over the plate glyphs.
2. **Index on the note.** Each visible note starts with ① through ⑥ in mark order, then the existing `marks.note`. The reading column has no ①–⑥ list. 记述 is unchanged.
3. **Mobile overlay.** At 390×844, `data-callout="overlay-no-gutter"` on the label and the cover. Every note has the scrim panel (`var(--bg)` behind that note only). No note rectangle sits in the letterbox outside `S`. No note glyph intersects `.split-read`.
4. **Desktop placement.** At 1440×900, label notes sit in the side paper, outside the plate, with no scrim. Cover notes sit in the letterbox, outside the plate, unless a wrapped note exhausts the band. Imagery / reading is between 1.60 and 1.64. Imagery height is `100svh`.
5. **Leaders.** A visible split-frame leader is a `6 5` dash that ends on the note’s inner edge, and its last segment is horizontal. The worked points `(100, 40)`, `(116, 40)`, `(184, 70)`, `(200, 70)` match the stub rule. No visible leader crosses another visible leader. A mark whose leader was omitted still has its box and its prefixed note. `badge` does not choose the side.
6. **Short pane.** At 390×844 after notes are placed, the label plate’s used box is 255×255 and the cover plate’s used box is 255×158. Inline `--imagery-h` is about 282px (label) and 185px (cover). It is less than `58svh`. 品相 is the next reading block under that band, with only the `0.75rem` pad and the existing reading padding between the plate union and the column. Scrubbing back to the upright hold clears the inline height, shows the upright at `U` in the tall pane, and hides the plate.
7. **Unchanged machinery.** `cameraBox`, `plateBox` factors, and the beat constants match `00315bf`. 记述 and `marks[].note` match `records.json`. `/records/ml4001/` still uses `.record-split`, still paints discs, and still uses the `0.35rem` leader gap. `npm run check` and `npm run build` pass.

Reduced motion, same URL, below `48rem`: no scrub, discs absent, notes overlaid with prefixes, pane at `contentH`. No-JS: stylesheet `--imagery-h`, no overlay measurement, no collapse.

## Out of scope

- Desktop φ imagery:reading, contain-fill opening, and the zoom from that opening to the smaller centered plate (shipped in `#43` / `#44`)
- Editing `cameraBox`, `openingBox`, `plateBox`, their factors, or `stageVisual`
- `records.json` content, mark coordinates, captions, alts, `detailsNote`, and `marks[].note`
- A new JSON field for the note index
- Putting ①–⑥ back into the reading column
- Legacy `.record-split`, including ml4001’s discs, column structure, and `9.5rem` slots
- Full `imagery[]` schema export with 唱片管理员
- Growing `--imagery-h` toward `70svh` or `100svh` to make room for notes
- A new leader color, arrowhead, curve, or a third corner
- Dark-mode callout art beyond the existing tokens
- Retuning `46ch`, the `48rem` breakpoint, or pin-or-pace

## Files a later implementation touches

This pull request adds only this document.

| Path | Later change |
|---|---|
| `src/pages/records/[id].astro` | Split-frame markup drops `.mark-disc` and `.mark-num`. The note prefix is the visible index. `positionSplit` uses overlay-no-gutter below `48rem`, writes `data-callout`, and sets `--imagery-h` to `contentH` on the notes beat instead of always clearing it. `writeLeaders` paints the terminal stub and omits crossings |
| `src/data/detail-display.ts` | Narrow `placeNotes` skips the letterbox. A split-frame leader helper returns the stub path in “Leaders”. Own-note contact at `T` is success. Crossing rejection is in index order. `leaderEndpoints` for legacy callers stays |
| `src/data/detail-display.test.ts` | Overlay-no-gutter at the 390×844 strip. Desktop letterbox/margin cases stay. The worked four-point leader. A crossing pair omits the later index. `contentH` for the 255px plates |
| `src/styles/global.css` | No split-frame disc rules required once the nodes are gone. Scrim panel stays. Settled narrow pane reads the inline `--imagery-h`. Desktop `100svh` and `1.618fr 1fr` stay |
| `src/data/split-stage.ts` | No change |

## Rejected

- Leaving the numbered disc on the box, including the center fallback that covers short OCR lines.
- Painting the disc only when the leader is omitted. The box is the region either way. The note carries the index.
- Storing the circled prefix in `marks.note` or adding an index field.
- Keeping letterbox scatter as the mobile fallback when the side strip is under `6.5rem`.
- Preferring overlay on desktop as well, and dropping the margin / letterbox order shipped in `#43`.
- Letting leaders cross, or stopping them `0.35rem` short of the sentence, on split frames.
- Adding bends until a crossing leader finds a clear path.
- Recomputing `S` from the collapsed pane, which shrinks the plate a second time.
- Holding `58svh`, `42svh`, or `100svh` on the phone after the notes are placed.
- Moving callout notes into `.split-read`.
