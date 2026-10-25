# Design: mobile margin-first callouts — letterbox, then tap

Date: 2026-10-25  
Site: https://lu-ceam.github.io/records/  
Status: Locked by Rolf 2026-10-25 ~19:58 Asia/Shanghai as approach A. Spec only. Implementation follows after review and a writing-plans pass. This PR does not edit CSS, Astro, TypeScript, JSON, or image files.

Amends the narrow note path in [callout polish](2026-10-25-records-callout-polish-design.md). Composite A stays: 框无号，说明前有号 on a visible note; elbow-dashed leaders with a terminal stub; omit a leader that would cross. Contain-fill stays: `U` then `S`, φ on desktop, and `cameraBox` / `openingBox` / `plateBox` / `stageVisual` untouched. Desktop placement stays side, then letterbox, then scrim.

Checked against `src/pages/records/[id].astro`, `src/styles/global.css`, `src/data/detail-display.ts`, `src/data/callout-notes.ts`, `src/data/settled-pane.ts`, and MHJL 329 in `src/data/records.json`, at `95b8919` (`#51`–`#53`). The live failure is https://lu-ceam.github.io/records/mhjl329/ below `48rem`, notes beat, label frame. The side strip is about 2.75rem. `placeNotes({ narrow: true })` skips the letterbox and paints every note as an opaque paper scrim on the plate. `collapseToContent` then shrinks the pane to that plate, so the scrims are the whole frame. The disc does not read as a label.

## Goal

On reveal records (`.record-page--split`), below `48rem`, after the notes beat:

1. The plate stays the picture. A note prefers the empty margin around `S`. It does not prefer a paper panel on the disc.
2. The side strip is still first when it is at least `6.5rem`. Otherwise the note takes the letterbox above or below `S`.
3. A note that fits neither the strip nor the letterbox is a mark box only. Its sentence is hidden until the visitor taps that box. One tap shows one note. Tap the box again, or tap empty imagery, and the sentence goes away.
4. The default frame has no paper scrim on the plate. An opaque `var(--bg)` panel exists only for that one expanded note, and only when the leftover letterbox cannot hold it.
5. The pane still shrinks to the plate plus the notes that are actually on screen, plus pad. A letterbox note counts. A collapsed overflow note does not. 记述 follows that shorter band.

Desktop is unchanged. The φ split stays. `S` stays the pre-collapse plate.

## Locked requirements (approach A)

These sentences are the lock. The sections below give them numbers. They do not add a second choice.

- **Plate first.** Below `48rem`, the settled frame shows the disc. Opaque paper does not cover it by default.
- **Margin, then letterbox.** On the narrow path, a note takes the side strip when the strip is at least `MIN_NOTE_REM` (`6.5rem`). Otherwise it takes the letterbox. The narrow path does not skip the letterbox.
- **Tap is the leftover.** A note that does not fit the strip or the letterbox is `kind: 'overflow'`: the mark box, no sentence, no leader. Tap that box to show the sentence. At most one sentence is open.
- **Scrim is the expanded state only.** `.is-scrim` and an opaque `var(--bg)` panel are not the default narrow placement. They are allowed on the one expanded note when the leftover letterbox cannot hold the text. More than half of `S` stays free of that panel.
- **Visible notes keep Composite A.** A side note, a letterbox note, and the expanded sentence show the index prefix on the text. The box has no numbered disc. A leader is the elbow dash with a terminal stub, or it is omitted when it would cross.
- **Collapse counts visible notes.** `contentH` is the union of the plate and the notes that are drawn, plus `0.75rem` pad on each end. Letterbox notes count. Collapsed overflow notes do not. `S` is not recomputed.
- **Desktop stays shipped.** At `min-width: 48rem`, `placeNotes` is still side, then letterbox, then scrim. φ tracks stay `1.618fr` / `1fr`. Imagery height stays `100svh`.

The mark box is the existing `.mark-box` stroke, `var(--accent)` (`#7c2d22` in the light theme). The camera crop is not a badge and is not restyled.

## Sentences this spec replaces

| Earlier sentence | Where | Replacement |
|---|---|---|
| Below `48rem`, a side strip that is too narrow takes plate overlay (paper-scrim notes on the plate, overlay-no-gutter). It does not take the letterbox | Callout polish, Goal 4; Locked requirements, “Mobile”; “Where notes sit”, “Mobile: overlay-no-gutter” | Section “Where notes sit”. The narrow path takes the letterbox. Overflow is a box until tap. `data-callout` is `margin` or `margin-first` |
| Strip under `6.5rem` → overlay-no-gutter. Letterbox is not the narrow fallback | Callout polish, Locked decisions, “Mobile notes”; Constraints | Section “Where notes sit”. Strip under `6.5rem` → letterbox, then overflow. Scrim is not that fallback |
| At 390×844, `data-callout="overlay-no-gutter"` and every note is a scrim inside `S` | Callout polish, Acceptance 3 | Section “Acceptance”. `data-callout="margin-first"`. Notes that fit sit outside `S`. The plate is not a stack of scrims |
| Once notes are placed, the pane shrinks to the plate plus those notes. Overlay notes inside `S` make the union equal `S` | Callout polish, “Settled mobile pane” | Section “Settled mobile pane”. The union is the plate plus visible notes. A letterbox note lengthens it. A collapsed overflow note does not |
| `placeNotes` skips the letterbox when `narrow` is true, and `splitCalloutMode` returns `overlay-no-gutter` whenever the strip is under `6.5rem` | Live `detail-display.ts` and `callout-notes.ts` at `95b8919`; the test “skips the letterbox when the narrow strip is under 6.5rem” | Sections “Where notes sit” and “Callout mode”. That test is rewritten |

Approach A still owns the sticky camera, the runway, pin-or-pace, and the reading order. Contain-fill still owns `U`, `S`, the 0.72 / 1.25 / 0.92 factors, φ:1, and desktop margin-first notes. Callout polish still owns the index prefix, the stub leader, the crossing omission, the disc removal, and the `contentH` cap. The elbow spec still owns `6 5`, the mask draw-in, `is-plate`, and eager split images. This document changes only the narrow fallback and the tap that replaces it.

## Locked decisions

| Topic | Choice |
|---|---|
| Scope | Narrow callouts on `.record-page--split` after notes are placed. Camera, φ, and `S` stay |
| Breakpoint | The narrow path is `max-width: 47.99rem`, the same query as `isNarrow()` |
| Narrow order | Side strip when it is at least `6.5rem`. Otherwise letterbox, packed against `S`. Then overflow |
| Narrow scrim | `placeNotes` does not return `kind: 'scrim'` when `narrow` is true |
| Overflow | Box only. Full text height is measured first, then the sentence is hidden. Tap reveals one note |
| Expanded panel | Leftover letterbox on that note’s side first, with no scrim. Otherwise one scrim panel on that side |
| Plate cover | The expanded scrim stays under half of `S` by width, so more than half of `S` stays bare |
| Leaders | Composite A for every visible sentence. A collapsed overflow note has no leader |
| Discs | No `.mark-disc` and no `.mark-num` on `.split-frame`, including overflow boxes and omitted leaders |
| Index | Prefix on visible note text. The overflow control’s accessible name uses the same prefix. Nothing paints it on the box |
| Mode | Narrow, every note `side` → `data-callout="margin"`. Any other narrow placement → `data-callout="margin-first"`. Never `overlay-no-gutter` |
| Pane | `contentH` from the plate and visible notes only, capped at the stylesheet pane. `S` stays frozen |
| Desktop | `narrow` false: side, then letterbox from the pane edge, then scrim. No tap layer |
| Legacy | `.record-split` / ml4001 keeps discs, slots, and the current elbow |
| Copy | `records.json`, mark coordinates, and 记述 stay |

## What the page does today

Desktop (`.record-page--split` at `min-width: 48rem`) is unchanged from callout polish. `placeNotes` without `narrow` (the flag defaults false):

1. Side strip `(P.width - S.width) / 2` at least `6.5rem`: notes stack in that strip. A note past `pane.height` goes to scrim, not the letterbox.
2. Else, letterbox band `(P.height - S.height) / 2` at least `2.6rem`: notes stack from `y = 0` in the top band, then from the plate’s bottom edge in the bottom band.
3. Else, paper scrim on the plate, inset `0.55rem`, opaque `var(--bg)`.

`1rem` = 18px at the acceptance font. At 390×844 the column is 354px wide and the stylesheet `--imagery-h` is `58svh` (489.5px). `plateBox` gives a label `S` of 254.88×254.88 at `(49.56, 117.31)` and a cover `S` of 254.88×158.03 at `(49.56, 165.74)`. Both strips are 49.56px (2.75rem), under 6.5rem. The label band is 117.31px (6.52rem). The cover band is 165.74px (9.21rem). Both bands are over 2.6rem.

The page passes `narrow: isNarrow()`. Below `48rem` that flag is true. The letterbox step is gated with `if (!narrow && band + 1e-6 >= MIN_BAND_REM * rem)`, so the phone skips it. Every note falls through to the scrim loop. `splitCalloutMode` returns `overlay-no-gutter` as soon as the strip is under `6.5rem`, before it reads the kinds. Both MHJL 329 frames set `data-callout="overlay-no-gutter"`. Each `<li>` gets `is-scrim`. The panel is opaque `var(--bg)`, padding `0.35rem 0.45rem`, width at most `min(9.5rem, S.width / 2 - 0.55rem)`.

`collapseToContent` unions the plate with every `<li>`. Scrim notes sit inside `S`, so the union is `S`. `settledImageryHeight` returns about 282px (label) and 185px (cover), which is `S` plus `0.75rem` pad on each end. The stylesheet pane is thrown away. The six cream panels are what remains of the label frame. That is the buried plate.

`positionSplit` clears the inline `--imagery-h` before it measures, places in that tall pane, then the notes beat writes `contentH`. `S` is the tall-pane box and is not passed through `plateBox` again. That freeze stays.

Split frames still have no `.mark-disc` and no `.mark-num`. Visible notes that do get drawn use the ① prefix from `noteIndexPrefix`. Leaders still end on a horizontal stub or are omitted. `visibleDetailText` still drops a circled line whose text is a published `marks.note`. The reading column does not repeat ①–⑥. Those stay.

There is no tap handler. `.plate-overlay` is `pointer-events: none` and `aria-hidden="true"`. A note cannot be opened or dismissed.

## Where notes sit

`resolvedSide`, `MIN_NOTE_REM` (`6.5`), `MIN_BAND_REM` (`2.6`), `NOTE_CAP_REM` (`9.5`), `NOTE_GAP_REM` (`0.35`), `SCRIM_INSET_REM` (`0.55`), and the 4px scrim nudge stay. `S` is still computed before notes, from the pre-collapse pane. Notes do not resize `S`. `badge` does not choose the side.

`placeNotes` still takes one `height` per note. That height is the `<li>`’s border-box height with the full sentence shown, including a `.mark-label` when `showMarkLabel` shows one, and with no scrim padding. The page measures it at the width of the first band it will try: the side-strip width when the strip is at least `6.5rem`, otherwise the letterbox width below. It measures once, then places once. It does not measure again after an overflow sentence is hidden. A hidden sentence has no height, and that zero must not reclassify the note as a fit.

### Desktop

`narrow` is false, including a phone-sized pane in a unit test that omits the flag. `placeNotes` keeps the shipped order in “What the page does today”. Top-band letterbox notes still start at `y = 0`. A side-strip leftover still goes to scrim and does not move into the letterbox. `MIN_BAND_REM` is still the gate between letterbox and scrim. No note is `overflow`. No hit button is rendered.

At the worked 1440×900 pane the label strip is 8.75rem, so label notes stay in the side paper. The cover strip is 6.2rem and the letterbox is about 15rem, so cover notes stay in the letterbox unless a wrapped note exhausts the band. φ columns, `100svh` imagery, and the `46ch` reading cap stay.

### Narrow: margin, then letterbox, then overflow

`narrow` is true. `MIN_BAND_REM` is not a gate. A short band does not send the group to scrim. Each note fits a band or it is overflow.

Per side, notes sorted by `anchor`, then `index`, the same `byAnchor` as today:

1. **Side margin**, when `strip + 1e-6 >= 6.5rem`. Same stack as desktop: width `min(9.5rem, strip)`, left edge on the plate’s side edge, anchor-centered, gap `0.35rem`, clamp a negative top to `0`. A note whose box would extend past `pane.height` leaves the strip. It does not become a scrim. It joins the letterbox queue for that side.
2. **Letterbox**, for every note that did not take the strip. This includes the whole side when the strip is under `6.5rem`. Width is `min(9.5rem, pane.width / 2)`. Left notes use `left: 0`. Right notes use `left: pane.width - width`. Pack against the plate, not against the pane edge:
   - Top band. The first note’s bottom edge is `plate.top`. The next note sits above it, gap `0.35rem`, and so on. A note fits when its top is `>= plate.top - band - 1e-6` and `>= -1e-6`. `band` is `(pane.height - plate.height) / 2`.
   - Bottom band, if the top band did not take it. The first note’s top edge is `plate.bottom`. The next note sits below it, gap `0.35rem`. A note fits when its bottom is `<= pane.height + 1e-6`.
3. **Overflow**, when the note fits neither band. `kind: 'overflow'`. `omitLeader: true`. The placement rect is the mark’s CSS box inside `S` (the same scale the scrim obstacles use today). The sentence is not in that rect.

A shared edge with `S` is a fit. `rectsOverlap` already treats a shared edge as clear (`a.bottom > b.top` is false when the edges are equal). A positive-area overlap with `S`, or with a note already placed on either side, is not a fit. The note tries the other band, then overflow. It is not nudged by 4px in the letterbox.

Letterbox width is at most half the pane, so a left note and a right note meet at an edge and do not overlap. The overlap test is still the definition of “does not fit”.

A leader that would be omitted does not demote a fitted note to overflow. Crossing is a leader rule. It is not a placement failure.

`placeNotes` on this path does not push a note into the scrim loop. `kind: 'scrim'` is a desktop result. The narrow return kinds are `side`, `letterbox`, and `overflow`.

Worked 390×844 label, `rem` = 18, `S` at `(49.56, 117.31)` size `254.88`, band `117.31`, letterbox width `171`, gap `6.3`. One right-side note:

| Height | Result |
|---|---|
| 24 | `letterbox`, side `right`, left `183`, top `93.31`, bottom on `plate.top`. `omitLeader` false |
| 130 | Top would start at `-12.69`. Bottom would end at `502.19`, past `489.5`. `overflow`, `omitLeader` true, rect is the mark box |

Five right-side notes of height 40, in anchor order. The first two are letterbox in the top band, tops `77.31` and `31.01`. The next two are letterbox in the bottom band, tops `372.19` and `418.49`. The fifth does not fit the top band (its top would be `-15.29`) and does not fit the bottom band (its bottom would be `504.79`, past `489.5`). It is `overflow`.

The plate object is not mutated.

### Callout mode

`CalloutMode` is `'margin' | 'margin-first'`. `splitCalloutMode` does not return `'overlay-no-gutter'`.

| Args | Result |
|---|---|
| `narrow` false | `null`. The frame removes `data-callout` |
| `narrow` true, `placements.length === 0` | `null` |
| `narrow` true, every placement `kind: 'side'` | `'margin'` |
| `narrow` true, any other mix, including all letterbox, any overflow, or a desktop-shaped scrim fixture | `'margin-first'` |

The strip width is not a branch. A frame whose notes all sat in the side strip records `margin`. Every other narrow frame records `margin-first`, including a frame whose notes all fit the letterbox. An open tap panel does not change the attribute.

Server HTML does not include `data-callout`. The script writes it, as today.

## Tap to reveal

Only `kind: 'overflow'` notes toggle. A side note and a letterbox note draw their sentence for the whole notes beat, with the ① prefix, and they are not buttons.

### Collapsed

The overflow `<li>` carries `data-kind="overflow"`. Its `.mark-note` and `.mark-label` are not displayed. The `<li>`’s border box is the mark’s CSS box, so it lies inside `S` and does not carry the sentence height.

The tap target is a `<button type="button" class="mark-hit">` in that `<li>`, covering the mark box. The SVG `.plate-overlay` stays `aria-hidden="true"` and `pointer-events: none`. The button is the control, so the name is not trapped in the hidden graphic. Its accessible name is the same prefix `noteIndexPrefix` would paint, one space, then `marks.note`. The button has `aria-expanded="false"` and `aria-controls` pointing at the note paragraph. The box stroke is unchanged. There is no disc and no painted numeral.

Overflow buttons are in mark order in the tab sequence. Enter or Space activates the focused button. Side notes and letterbox notes are not tab stops.

### Expanded

At most one overflow note in the document is expanded. The page keeps that index and reapplies it at the end of `positionSplit`. Activating a second overflow button closes the first and opens the second in the same gesture. Activating the open button closes it. A pointer event on the imagery pane that hits neither an overflow button nor the open panel closes it. Escape closes it. A pointer event on a side note or a letterbox note is not an empty tap and does not close the panel.

The open `<li>` has `data-expanded="true"` and the button has `aria-expanded="true"`. Focus stays on the button. The panel is not an `aria-live` region. The note paragraph is in the accessibility tree only while it is shown.

The panel is placed by `placeExpandedPanel` in the pre-collapse pane, against the frozen `S`. Existing side and letterbox notes are occupied. They are not moved.

1. Measure the sentence at letterbox width, no scrim padding. Try the narrow letterbox pack on the note’s resolved side, in the space those occupied notes left. Top band, then bottom band. A fit returns `kind: 'letterbox'` geometry. The paragraph has no `is-scrim`.
2. Otherwise measure the sentence at scrim width with padding `0.35rem 0.45rem`. Scrim width is the shipped one: `min(9.5rem, max(0, S.width / 2 - 0.55rem))`. That width is under half of `S`. Run the shipped `clearTop` nudge, 4px, vertical first, missing every mark box. A fit returns `kind: 'scrim'` on the resolved side. The `<li>` gains `is-scrim`.
3. Otherwise use the shipped blocked-scrim fallback: the side with less mark area, top clamped inside `S`, `omitLeader: true`, `is-scrim`. One panel, one side.

The hit button stays on the mark box in both states. The paragraph is the panel. Its `left` and `top` are relative to the plate frame, the same way a side or letterbox `<li>` is written: `place.left - S.left` and `place.top - S.top`. The button does not take that offset. A letterbox panel sits outside `S`. A scrim panel intersects `S` on one side only, misses the mark boxes when step 2 finds a slot, and covers less than half of `S` because its width is under half of `S`. The opposite half of the disc stays bare.

The leader pass from callout polish then runs against visible sentences only. A letterbox or side note keeps its stub, or loses the leader when the stub rules say omit. The expanded panel is a visible sentence: the same stub rules apply, and a cross or a `gap < 4` omits that leader. The box and the sentence still paint. A collapsed overflow note stays `data-omit-leader="1"` and has no `points`.

Resize, and leaving the notes beat, clear the expanded index before the next placement. A note that fits after the resize is a letterbox or side note with its sentence shown. It does not stay a panel. The tap show and hide are instant in both motion settings. They are not a new tween.

## Settled mobile pane

Below `48rem`, `U` and `S` are still computed in the stylesheet pane: `--imagery-h` at `58svh`, or `42svh` in the existing short-height query. The camera zoom plays in that pane. `plateBox`’s factors stay 0.72 / 1.25 / 0.92. This section does not change `S`.

Every placement pass uses that pre-collapse pane and the frozen `S`. `collapseToContent` runs after placement. Its height is not fed back into `placeNotes`. Classifying notes against the collapsed pane would turn letterbox notes into overflow. `positionSplit` still clears the inline `--imagery-h` before it measures, as it does today.

`settledImageryHeight` keeps its formula. The notes it receives are the visible panels only:

- A side `<li>` and a letterbox `<li>` count.
- An expanded overflow panel counts. Its box is the paragraph’s border box.
- A collapsed overflow `<li>` does not count. Its hit button is inside `S` and is not a sentence.

```
pad = 0.75rem
unionTop = min(S.top, each visible note’s top)
unionBottom = max(S.bottom, each visible note’s bottom)
contentH = (unionBottom - unionTop) + 2 * pad
```

`contentH` is capped at the stylesheet pane height. It only shrinks relative to that pane. It may grow relative to a plate-only band when an expanded letterbox panel sits outside `S`, and it shrinks again when that panel closes. The page calls `collapseToContent` after expand and after dismiss.

Narrow letterbox notes are packed against `S`, so the union’s internal gap is the `0.35rem` stack gap. The unused outer band is outside the union and is cropped. The existing shift stays: `delta = unionTop - pad`, and the plate frame’s top becomes `plateTop - delta`. Notes are positioned relative to the plate, so they move with it. After the shift, one pad sits above the union and one pad sits below it. The plate’s used width and height stay the pre-collapse `S`. The implementation does not call `plateBox` with the collapsed pane.

Worked shift, the height-24 letterbox note: `delta` is `79.81`. The plate top becomes `37.5`. The note’s absolute top becomes `13.5`.

Worked 390×844 label, `pad` = 13.5px, frozen `S` height 254.88:

| Visible notes | `contentH` |
|---|---|
| None (every note overflow and collapsed) | 281.88, within 2px of the shipped 282 |
| The height-24 letterbox note above `S` | 305.88 |
| Stylesheet pane | 489.5, and `contentH` stays under it |

Cover with no visible notes stays within 2px of the shipped 185. A 2px difference from subpixel rounding still passes. Re-fitting `S` inside the short pane still fails acceptance.

`.split-read` still keys off `var(--imagery-h)` below `48rem`. The shorter value brings 记述 and 品相 up under the pad. Before the notes beat, the inline property is cleared. Scrubbing back above the notes beat clears it and clears the expanded index. At `min-width: 48rem`, clear the inline property and keep `height: 100svh`. A resize across `48rem` clears or writes to match the breakpoint. The height change is not a new tween.

## No-JS

No-JS does not measure, does not call `placeNotes`, does not bind taps, does not write `contentH`, and does not set `data-callout` or `data-callouts`.

Below `48rem`, a `.split-frame` that lacks `data-callouts="placed"` shows one note list in normal flow under the plate image:

- The list is the server `<ol class="mark-list">`. Each item shows its prefix and `marks.note`. There is no second list.
- `<li>` is `position: static`, width auto, no side offset, no `is-scrim`.
- The plate image is not under that list. `.mark-leader` is not drawn. `.mark-box` still strokes the region. No disc.
- `.split-imagery` does not clip the list (`overflow: visible`, height auto on that unplaced narrow frame). `.split-read` follows the imagery in normal flow so a `58svh` offset does not cover the list.

The script sets `data-callouts="placed"` on the frame in the same turn as the first successful placement. Absolute letterbox positions, leaders, and `contentH` apply from then on. A script that never places leaves the flow list. That is the fallback.

At `min-width: 48rem`, the unplaced list stays the shipped absolute list. This section does not restyle desktop no-JS.

## Motion

Beats stay on the shipped `stageVisual` thresholds. `UPRIGHT_END`, `ZOOM_END`, `PLATE_END`, `BOXES_END`, `LEADERS_END`, `PASS_SVH`, `JOINT_SVH`, and `DETAIL_CROSSFADE_MS` stay.

1. **Upright hold and zoom.** Tall pane. Plate hidden. No discs, no notes, no leaders, no expanded panel.
2. **Plate and boxes.** The plate fades in at frozen `S`. Boxes fade in. No discs.
3. **Leaders.** Dashed elbows draw toward visible sentences. An omitted leader, including every collapsed overflow leader, stays out.
4. **Notes.** Side and letterbox sentences fade in with their index prefix. Overflow sentences stay hidden. The pane takes `contentH`. `S` does not resize.

A tap after that beat shows or hides its panel in one frame, then `contentH` is rewritten. Scrolling up reverses the sequence, closes any open panel, and restores the tall pane above the notes beat. Reduced motion skips the scrub, runs the same placement, shows `S`, the boxes, and the visible sentences, and uses `contentH` below `48rem`. The tap is instant there too.

## Constraints

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

## Acceptance

Viewport checks use a 16px initial font (`1rem` = 18px) and the light theme. Pixel figures assume no scrollbar. A 2px difference from subpixel rounding still passes. `npm run check` and `npm run build` are gates for the implementation that follows this document. They are not run for this spec-only change.

On `/records/mhjl329/` with motion allowed, at the notes keypoint:

1. **Plate first.** At 390×844, on the label and the cover, no `<li>` has `is-scrim` while every overflow note is collapsed. Opaque paper does not cover the disc. The label photograph reads as a label: the center title and the catalog line are not under a cream panel. More than half of `S` is bare bitmap. `data-callout="margin-first"` on both frames. `data-callout` is not `overlay-no-gutter`.
2. **Letterbox, not default scrim.** At 390×844 both strips are under `6.5rem`. Every note whose full-text height fits a band is `letterbox`, with its border box outside `S` (touching `S` at an edge is outside). Its sentence is visible and starts with the ①–⑥ prefix in mark order. Its leader, when drawn, is the callout-polish stub. No fitted note waits for a tap.
3. **Overflow tap.** A note that fits neither band has a visible `.mark-box`, no visible sentence, and no leader. Its `mark-hit` button’s accessible name is the prefix plus `marks.note`. Activating it shows that one sentence, readable, and leaves more than half of `S` uncovered. A second open note does not remain. Activating the same button, pressing Escape, or clicking the imagery outside the button and the panel hides the sentence and restores the plate-first frame. MHJL 329’s own sentences use their measured heights. The height-24 and height-130 rows are unit fixtures, not a claim that a live note is 24px tall.
4. **Short pane.** At 390×844 the label plate’s used box stays about 255×255 and the cover plate’s used box stays about 255×158. With the height-24 letterbox note and no other visible note, inline `--imagery-h` is about 306px on the label, under `58svh`. With every note collapsed overflow, it is about 282px (label) and 185px (cover). 品相 is the next reading block under that band. Scrubbing back to the upright hold clears the inline height, closes any open panel, shows the upright at `U` in the tall pane, and hides the plate.
5. **Desktop unchanged.** At 1440×900, label notes sit in the side paper, outside the plate, with no scrim. Cover notes sit in the letterbox, outside the plate, unless a wrapped note exhausts the band. Imagery / reading is between 1.60 and 1.64. Imagery height is `100svh`. There is no `mark-hit` button and no `data-callout`.
6. **Unchanged machinery.** `cameraBox`, `plateBox` factors 0.72 / 1.25 / 0.92, and the beat constants match `95b8919`. 记述 and `marks[].note` match `records.json`. Split frames have a `.mark-box` per mark and no `.mark-disc` and no `.mark-num`. `/records/ml4001/` still uses `.record-split`, still paints discs, and still uses the `0.35rem` leader gap.

Reduced motion, same URL, below `48rem`: no scrub, discs absent, fitted notes in the letterbox with prefixes, overflow notes hidden until the same tap, pane at `contentH`. The tap does not animate.

No-JS, below `48rem`: no `data-callout`, no `data-callouts="placed"`, no collapse measurement. The six label sentences and the six cover sentences are in document flow under their plate images, prefixes included, and they do not cover the bitmap.

Unit gates for the later implementation:

- The test named “skips the letterbox when the narrow strip is under 6.5rem” is replaced. `narrow: true` and height 24 on the phone label returns `letterbox` at top `93.31`. Height 130 returns `overflow`. `splitCalloutMode` for those placements returns `margin-first`. The plate box is unchanged.
- `narrow: true` on the desktop label strip, with notes that fit the strip, still returns `side` and `margin`.
- `placeNotes` without `narrow` still returns `letterbox` for the phone height-24 fixture and `scrim` for the phone height-130 fixture. Desktop side, letterbox, and scrim cases stay.
- `settledImageryHeight` is 281.88 for the bare label plate and about 305.88 when the height-24 letterbox note is included. A collapsed overflow rect is not an argument.
- `placeExpandedPanel` returns letterbox, with no scrim, for a sentence that fits the unpacked part of its side’s band. A sentence that fits neither band returns one scrim whose width is under half of `S`.

## Out of scope

- Desktop φ imagery:reading, contain-fill opening, and the zoom from that opening to the smaller centered plate
- Editing `cameraBox`, `openingBox`, `plateBox`, their factors, or `stageVisual`
- Desktop side → letterbox → scrim, including scrim for a desktop note that exhausts its band
- `records.json` content, mark coordinates, captions, alts, `detailsNote`, and `marks[].note`
- A new JSON field for the note index
- Putting ①–⑥ back into the reading column
- Painting a numbered disc or a corner badge on a split-frame box
- Making a fitted side or letterbox note into a tap target
- Opening more than one overflow sentence
- Legacy `.record-split`, including ml4001’s discs, column structure, and `9.5rem` slots
- Full `imagery[]` schema export with 唱片管理员
- Growing `--imagery-h` toward `70svh` or `100svh` to make room for notes
- A new leader color, arrowhead, curve, or a third corner
- Dark-mode callout art beyond the existing tokens
- Retuning `46ch`, the `48rem` breakpoint, `MIN_NOTE_REM`, `MIN_BAND_REM`, or pin-or-pace
- Running `npm run check` or `npm run build` in this spec-only change

## Files a later implementation touches

This pull request adds only this document.

| Path | Later change |
|---|---|
| `src/data/detail-display.ts` | The `narrow === true` branch of `placeNotes` packs the letterbox against `S` and returns `overflow` instead of scrim. Export `placeExpandedPanel`. Desktop `narrow === false` stays. `leaderEndpoints` for legacy callers stays |
| `src/data/callout-notes.ts` | `CalloutMode` becomes `'margin' \| 'margin-first'`. `splitCalloutMode` stops returning `overlay-no-gutter`. Kinds include `overflow` |
| `src/data/settled-pane.ts` | No formula change. Callers pass visible note boxes only. Letterbox notes count. Collapsed overflow notes do not |
| `src/pages/records/[id].astro` | Measure full-text height once, place, hide overflow sentences, write `data-kind` and `data-callouts="placed"`. `mark-hit` buttons toggle one panel. `collapseToContent` runs after placement, expand, and dismiss, and skips collapsed overflow sentences. `writeLeaders` still omits a leader with no sentence |
| `src/styles/global.css` | Collapsed overflow sentences stay hidden. `is-scrim` is the expanded panel only on the narrow path. Unplaced narrow frames show the note list in flow under the plate and do not clip it. Desktop `100svh` and `1.618fr 1fr` stay |
| `src/data/detail-display.test.ts` | Replace “skips the letterbox when the narrow strip is under 6.5rem”. Add the height-24 / height-130 narrow cases, the expanded-panel case, and the visible-note `contentH` case. Desktop letterbox and scrim cases stay |
| `src/data/split-stage.ts` | No change |

## Rejected

- Keeping overlay-no-gutter, and skipping the letterbox, when the narrow strip is under `6.5rem`.
- Sending every narrow note to `kind: 'scrim'` because the strip is short or because `MIN_BAND_REM` is not met.
- Packing narrow letterbox notes at `y = 0`, which leaves the cream hole inside the union and brings the tall empty band back.
- Hiding a fitted side or letterbox sentence behind a tap.
- Showing every overflow sentence at once, or opening two panels together.
- Letting the expanded panel span the disc. One scrim already stays under half of `S` by using the shipped scrim width.
- Painting a numbered disc on the overflow box, including when the leader is omitted. The box is the region. The prefix sits on the visible sentence and in the button’s name.
- Recomputing `S` from the collapsed pane, or classifying notes against `contentH`.
- Holding `58svh` after the notes are placed so the letterbox has room. The pane shrinks to the visible union.
- Growing `--imagery-h` toward `70svh` or `100svh` to avoid overflow.
- Changing the desktop order to match the narrow path, or dropping desktop scrim.
- Putting the tap sentences into `.split-read`.
- A no-JS fallback that leaves the absolute list, and its paper, on top of the phone plate.
