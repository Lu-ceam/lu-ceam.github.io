# Design: detail imagery reveal and manual 题铭 for /records/

Date: 2026-10-24  
Site: https://lu-ceam.github.io (Astro)  
Status: Locked 2026-10-24, including the vinyl catalog librarian’s corrections to the YAML pipeline. Spec only. Implementation follows this document; this change does not edit CSS, Astro, Zod, `records.json`, or image files.

## Relationship to earlier specs

[Museum alignment](2026-10-24-records-museum-alignment-design.md) still owns Approach A, the warm-paper tokens, list image|text rows, chronological sort, the 记述 hairline, untitled 著录 (`aria-label` only), and fold chrome.

[Type + cover polish](2026-10-24-records-type-cover-polish-design.md) still owns list cover = `record.image` (first 纸壳), 记述 at `0.9375rem`, and 著录 type. List thumbs do not gain this reveal.

[Typography polish](2026-10-24-records-typography-polish-design.md) and [detail page](2026-10-24-records-detail-page-design.md) still own navigate-only URLs, skeleton B, 记述 lead markup, and the ban on a 「记述」 label, a drop cap, and a second face.

This document adds one surface: the detail figures in the left column of `/records/<id>/`. It does not retune the hero, the tombstone, 记述, 著录, or the folds.

Checked against `src/styles/global.css`, `src/pages/records/[id].astro`, `src/layouts/Base.astro`, `src/data/records.ts`, and `src/data/records.json` at `30b7f16` (PR #21).

## Direction

A detail figure should feel like a museum display case. The visitor sees the upright photograph, watches the same crop the catalog already used, and lands on a clean plate with instruction-manual 题铭: an axis-aligned box, a numbered badge, a leader, and a sentence outside the photograph.

The upright file is already deskewed and rectified. The browser plays a crop. It does not repair the photograph.

| Locked | Value |
|---|---|
| Feel | Display-case crop, then manual 题铭 |
| Public pictures | Baked `upright` (no boxes) + clean `plate` (no boxes) |
| Playback | `upright` → crop window → `plate` → boxes → leaders → outside sentences |
| Client geometry | Read resolved numbers only |
| Public stroke | `var(--accent)` (light `#7c2d22`, dark `#f2c9a6`) |
| Editor bake | Yellow `#FFD400` may remain in the skill toolchain |
| Public sentences | Today’s `details[].text`, after an editorial align into `marks[].note` |
| Right column | 记述 / 著录 / folds unchanged |
| This round’s schema names | `upright`, not a raw `source`. `transform.cropSpace` is `"upright"` |

## Rejected

These were draft mistakes. Implementations must not reintroduce them.

- Shipping the raw skewed scan as the opening image, or rotating it in the browser.
- Treating YAML `crop` as source-image pixels. `crop` is in **upright** pixels, after deskew and rectify.
- Writing `deskew: auto`, `crop.fit`, `match`, or OCR into `records.json`, or resolving any of those in the client.
- Replaying deskew on the client because `angleDeg` is stored. `angleDeg` is a resolved number from the bake. Playback does not apply it.
- Blind-copying YAML `note` into the public sentence. That field is often internal.
- Using badge corner (`tl` / `tr`) as the leader direction. `badge` and `side` are different fields.
- Assuming every export is 400px wide, or that a `base_image` part can play a rotate-and-crop reveal.
- Painting public 题铭 in `#FFD400`.

## 1. What the site has today

`detailSchema` in `src/data/records.ts` is `image` + `alt` + `caption` + `text`. `image.src` must match `/^\/records\/[a-z0-9]+\/[a-z0-9]+\.webp$/`. There are no box coordinates. `[id].astro` renders each detail as an `<img>`, a one-line `<figcaption>`, and `<p class="detail-text">` (`white-space: pre-line`, `0.78rem`, muted). The left column also prints `detailsNote` in `.record-object > .meta`.

The hero (`record.image`, class `entry-hero`) stays that way. MHJL 329’s hero is `/records/mhjl329/hero.webp` at 400×400.

Skill YAML at `annotations/{id}_{part}.yaml` is the geometry authority. It is not in this repo. This repo’s `records.json` is the public projection. `export_detail_pack.py` only emits the editor’s marked bake and a data URL. It is not the site exporter. Marked bakes may keep yellow `#FFD400`. They are not public assets.

`30b7f16` replaced `public/records/lpbr6083/{label,cover,back}.webp` with yellow-boxed bakes (commit `daf560b`). Other detail webps may also have painted marks. A public plate must be a clean export before runtime marks are drawn on it.

## 2. Assets

Two public rasters, both WebP, neither with painted boxes:

| Asset | What it is | Path |
|---|---|---|
| `plate` | The clean export crop. Same pixel size as that part’s actual export, not a resample to 400 | `/records/{id}/{part}.webp` (keep today’s names) |
| `upright` | The pre-crop frame **after** deskew and rectify, long edge 1000–1400 when the master allows, no boxes | `/records/{id}/{part}-upright.webp` |

`part` is the current filename stem: `label`, `cover`, `insert`, `back`.

Upright bake rules:

- The bitmap is already upright. A non-zero `angleDeg` was applied while baking. The file itself is not skewed.
- If the master long edge is greater than 1400, downscale so the long edge is 1400 and scale `crop` into that file’s pixels before writing JSON.
- If the master long edge is already between 1000 and 1400, ship that size.
- If the only frame is already the crop (including a YAML `base_image` at crop size), do not upscale it and do not invent an upright. Omit `upright`.
- Do not paint boxes on either file. Editor `*.marked.webp` files stay in the skill toolchain.

The image regex has to grow, only for the upright suffix. Plate and hero keep today’s pattern.

```ts
const plateSrc = /^\/records\/[a-z0-9]+\/[a-z0-9]+\.webp$/;
const uprightSrc = /^\/records\/[a-z0-9]+\/[a-z0-9]+-upright\.webp$/;
```

Hero `record.image` stays on `plateSrc`. No `-upright` hero.

`parseRecords` asserts that a plate file exists, and that an upright file exists when the key is present. Both paths must start with `/records/${id}/`.

## 3. Schema

`details[].image` is renamed to `plate`. The old key is not accepted. `text` stays required. Public callout sentences, once an editor has aligned them, live on `marks[].note`. YAML `note` is not that field.

`upright` and `transform` are present together or not at all. `rectifyH` is a possible later number for a perspective bake. This round does not add it to the strict object, and the exporter does not write it. Zod would reject it.

```ts
const cropSchema = z.strictObject({
  x: z.number().int().nonnegative(),
  y: z.number().int().nonnegative(),
  w: z.number().int().positive(),
  h: z.number().int().positive(),
});

const transformSchema = z.strictObject({
  cropSpace: z.literal('upright'),
  /** Degrees already baked into `upright`. Finite number. Never the string "auto". Playback ignores it. */
  angleDeg: z.number().finite(),
  crop: cropSchema,
  exportWidth: z.number().int().positive(),
});

const markSchema = z.strictObject({
  id: z.string().regex(/^[a-z0-9-]+$/),
  /** Corner of the box the number sits on. Not the leader direction. */
  badge: z.enum(['tl', 'tr']),
  /** Leader direction. Independent of `badge`. */
  side: z.enum(['auto', 'left', 'right']),
  x: z.number().int().nonnegative(),
  y: z.number().int().nonnegative(),
  w: z.number().int().positive(),
  h: z.number().int().positive(),
  /** Short public heading. Omitted until an editor sets it. The exporter copies neither YAML `label` nor YAML `note`. */
  label: z.string().min(1).optional(),
  /** Public sentence. Omitted until the editorial align. Never filled from YAML `note`. */
  note: z.string().min(1).optional(),
});

const detailSchema = z.strictObject({
  part: z.string().regex(/^[a-z0-9]+$/),
  plate: plateImageSchema,
  upright: uprightImageSchema.optional(),
  transform: transformSchema.optional(),
  marks: z.array(markSchema),
  caption: z.string().min(1),
  alt: z.string().min(1),
  text: z.string().min(1),
});
```

Refinements:

- `plate.src` is `/records/${id}/${part}.webp`. `upright.src`, when present, is `/records/${id}/${part}-upright.webp`.
- `upright` and `transform` are both set or both absent.
- `transform.exportWidth === plate.width`.
- `plate.height` is the exported file’s pixel height. Exports on the current seven records are 380, 390, 400, or 480 wide. Do not normalize them to 400.
- When `transform` is set: `crop.x + crop.w <= upright.width` and `crop.y + crop.h <= upright.height`.
- When `transform` is set: `plate.height` is within 1px of `exportWidth * crop.h / crop.w` after rounding half away from zero.
- Each mark lies inside the plate: `x + w <= plate.width` and `y + h <= plate.height`.
- Mark `id`s are unique within the detail.
- `angleDeg` is a JSON number. The string `"auto"` fails the build.
- Keys that must not appear: `source`, `match`, `fit`, `ocr`, `rectifyH`, `image`.
- The existing price walk still applies, including to `label` and `note`.

`recordSearchText` keeps indexing `caption`, `alt`, and `text`, and also indexes `marks[].label` and `marks[].note` when those strings exist.

## 4. Geometry the client is allowed to know

| Value | Space | Who resolves it |
|---|---|---|
| `transform.crop` | Pixels of the **shipped upright** file, origin top-left, +x right, +y down | Exporter. YAML `crop` is already in upright pixels. A `crop.fit` token is resolved to `x,y,w,h` before JSON |
| `angleDeg` | Degrees baked into that upright. Sign is whatever the bake applied; the client does not reapply it | Exporter. `auto` is resolved or that part does not get an upright |
| `marks[].x,y,w,h` | Pixels of the **plate** (`coords_space: export`) | Exporter. Every `match:` box is resolved. Unresolved `match` fails that box |
| `badge` | `tl` or `tr`: which corner of the box holds the number | YAML, copied through |
| `side` | `auto`, `left`, or `right`: which way the leader leaves the box | Exporter writes `auto` unless this `id` already has a `side` in `records.json` |

`badge` does not imply `side`. A `tr` badge may still leader to the left.

Round exported geometry to integers, halves away from zero, after any upright downscale. The client trusts those integers.

Playback ignores `angleDeg`. A future `rectifyH` would be the same kind of bake input. It is not a second client effect this round.

## 5. `export_site_marks.py`

New script in the vinyl-pressing-catalog toolchain, or an extension of the pack that **does not** replace the editor bake. `export_detail_pack.py` stays the marked-bake + data URL tool. Yellow stays legal there. Its output is not copied into `public/records/`.

`export_site_marks.py` reads `annotations/{id}_{part}.yaml` and merges into `src/data/records.json`. It does not add records or parts. A YAML whose `{id}_{part}` does not match an existing detail fails that file and changes nothing else. This round’s parts are the 17 stems already in `records.json` (section 6). Do not commit the YAML files, raw scans, or `*.marked.webp` to this repo.

For each part the script:

1. Resolves deskew. A numeric deskew is `angleDeg`. The token `auto` is resolved to a number during the upright bake, or the upright bake is skipped. The JSON value is a number either way when `transform` is written.
2. Resolves `crop` / `crop.fit` to upright-pixel `x,y,w,h` on the **shipped** upright grid.
3. Resolves every box, including `match:`, to plate-pixel `x,y,w,h`. Drops `match`. Does not write OCR.
4. Writes a clean `plate` WebP at the actual export size (today’s band is 380–480 wide; height is the export’s height). `exportWidth` is that width.
5. Writes `upright` only when a real pre-crop upright can be baked (section 2).
6. Preserves `caption`, `alt`, and `text` byte for byte.
7. Does not write `marks[].note` from YAML `note`, and does not write YAML `note` into `label` or `text`.
8. Writes geometry only onto each mark: slug `id`, `badge`, `side`, `x`, `y`, `w`, `h`. A new mark has `side: "auto"` and no `label` or `note`. YAML `label` and YAML `note` are both editorial inputs, not public copy, so the script copies neither. On a mark `id` that already has `note`, `label`, or `side` in `records.json`, those three keys are preserved. Geometry (`x,y,w,h`, `badge`) is updated from the YAML.

Mark `id` is the YAML `id` lowercased, with every run of characters outside `[a-z0-9]` replaced by a single `-`, then trimmed of leading and trailing `-`. If that slug is empty, or the YAML has no `id`, the exporter uses `m1`, `m2`, … in box order. Slugs must be unique inside the detail after this step.

`base_image` parts whose frame is already the crop and whose resolved angle is 0 do not get an upright. They can still get a clean plate and resolved marks. The page settles on the plate.

Missing local scans are expected. The script may restore a master from backups. It may reuse a current site WebP as the **clean plate** only when that file has no painted boxes. It must not upscale a plate into a fake upright, and it must not treat a yellow-baked WebP as a clean plate. When an upright cannot be baked, omit `upright` and `transform` (plate-only, no reveal). When a clean plate cannot be written, leave the existing WebP in place, write `marks: []`, and do not overlay runtime marks on painted yellow.

A non-empty `marks` array is the exporter’s promise that the plate file it just wrote has no painted boxes.

## 6. Migration of the seven records

17 details. Plate sizes are the current files. The exporter keeps those sizes unless the skill’s actual export for that part differs, in which case `plate.width` / `plate.height` become the new file’s pixels and marks are in that space.

| Record | Part | Current plate | Public `text` shape |
|---|---|---|---|
| `ml4001` | `label` | 400×424 | ①–⑤ |
| `ml4001` | `cover` | 480×234 | ⑥–⑦ |
| `mg50370` | `label` | 390×390 | ①–④ |
| `mg50370` | `cover` | 400×137 | ⑤–⑥ |
| `falp381` | `label` | 380×319 | ①–⑥, plus an 内圈刻字 transcription line |
| `falp381` | `cover` | 400×124 | ②–③ (does not start at ①) |
| `falp381` | `insert` | 400×391 | ④–⑧ |
| `mhjl329` | `label` | 400×400 | ①–⑥ reference |
| `mhjl329` | `cover` | 400×248 | ①–⑥ 腰封 reference |
| `ll912` | `label` | 400×400 | ①–⑥, plus an 内圈刻字 transcription line |
| `ll912` | `cover` | 380×380 | ①–⑥ |
| `d37779` | `label` | 380×198 | ①–⑦ |
| `d37779` | `cover` | 400×143 | one unnumbered sentence |
| `d37779` | `back` | 380×245 | one unnumbered sentence |
| `lpbr6083` | `label` | 400×416 | ①–⑥, yellow bake in `daf560b` |
| `lpbr6083` | `cover` | 400×400 | ①–⑥, yellow bake |
| `lpbr6083` | `back` | 400×400 | ①–⑤, yellow bake |

FALP 381’s cover starts at ②. Badge order is YAML `boxes` order, not “line *n* is box *n*”. The script must not zip `text` lines onto boxes.

### Three display states

| State | Data | What the page does |
|---|---|---|
| Reveal | clean plate, `upright`, `transform`, `marks.length >= 1`, and the crop is a proper sub-rectangle of the upright | Play upright → crop → plate, then 题铭 |
| Plate callouts | clean plate, `marks.length >= 1`, no upright. Includes `base_image` at crop size with `angleDeg` 0, and any part whose upright could not be baked | No animation. Plate and 题铭 are the first paint |
| Legacy | `marks: []`, existing WebP, `text` unchanged | Today’s figure: image, caption, full `text`. No overlay. LPBR 6083 stays here until a clean plate exists |

A crop is a proper sub-rectangle when at least one of these holds: `crop.x >= 2`, `crop.y >= 2`, `crop.w <= upright.width - 2`, `crop.h <= upright.height - 2`. Anything else is the whole upright frame (a higher-resolution plate, not a crop). Settle on the plate. An upright file that is only a larger copy of the plate does not play a zoom.

`marks.length === 0` is Legacy even though “every mark has a note” would be vacuously true. The note-complete rules below require `marks.length >= 1` and a `note` on each mark.

### MHJL 329 reference

The reference figures are the two details on `/records/mhjl329/`, not the hero.

Label plate `/records/mhjl329/label.webp` is 400×400. Caption `A 面标签 · ①–⑥`. Alt `标签细节`. The public copy deck, which an editor aligns onto marks, is:

1. GREAT TRACKS 标
2. MHJL 329
3. STEREO / JASRAC
4. ℗1988 Sony Music Labels Inc.
5. 外圈 MADE IN JAPAN
6. SIDE A

腰封 plate `/records/mhjl329/cover.webp` is 400×248. Caption `腰封 · ①–⑥`. Alt `腰封细节`. Copy deck:

1. 1234 大江千里
2. MHJL 329
3. 腰封标价与日期「24.11.21」（推测为时限再贩期限，不是发行日）
4. 完全生産限定盤
5. Clear Vinyl
6. 40th Anniversary Senri Oe

Those strings are `text` today. They become `marks[].note` only when an editor assigns a box to a line. YAML `note` does not replace them. This spec does not invent the upright crop or the box pixels; those come from that part’s YAML at export.

### Editorial align

Public copy this round is `details[].text`. YAML `note` is catalog-internal. The exporter never copies it into `note`, `label`, or `text`.

An editor may then set `marks[].note` to the public sentence for that box, taken from the `text` deck (a ① line’s body, or the whole unnumbered string on D 37779’s cover and back). They may set `marks[].label` to a short heading. They may set `side` to `left` or `right`. Re-export preserves those keys per mark `id`.

While `marks.length === 0`, or any mark lacks a `note`, the figure shows the full `text` under the caption and draws no leaders. Boxes and badges render only when `marks.length >= 1`.

When `marks.length >= 1` and every mark has a `note`:

- Leaders and outside sentences render.
- A `text` line is hidden when its body equals a `note`. Strip one leading circled index `①`–`⑳` and the following spaces before comparing. The raw `text` string in JSON stays.
- A line that equals no `note` stays visible. That is the 内圈刻字 transcription on `falp381` label and `ll912` label. It is not a fake box.
- `detailsNote` stays in JSON unchanged. Render `.record-object > .meta` only while at least one detail on the page is still showing a circled `text` line. When none are, omit the meta element. Do not rewrite the string.

`falp381` label’s transcription begins `内圈刻字（转录）：`. `ll912` label’s transcription begins `内圈刻字（转录）：第 1 面 ARL 1854-1A`. Neither is a ① line.

## 7. Opening animation

Play only in the Reveal state. Plate callouts and Legacy are already settled. Each reveal figure plays once per page load, the first time any pixel of the figure intersects the viewport (`IntersectionObserver`, default root, `threshold: 0`). The sticky column’s `overflow-y: auto` is part of that intersection. Do not persist a “already played” flag across loads. Do not replay on resize.

The layout box is the plate’s box from the first paint (`width` / `height` attributes, CSS `height: auto`). The upright is drawn inside that box. The column does not grow or shrink when the crop settles.

| Beat | Start | Duration | What changes |
|---|---|---|---|
| Hold | 0 | 160ms | Full upright contained in the plate box (`object-fit: contain`). Bars use `var(--bg)` |
| Crop | 160ms | 760ms | The upright crop window moves to `transform.crop` and fills the plate box |
| Crossfade | 840ms | 80ms, overlapping the end of the crop | Upright opacity to 0, plate opacity to 1. Settled pixels are the plate file |
| Boxes | 920ms | 160ms | Box strokes and badges fade in |
| Leaders | 1080ms | 220ms | Only when `marks.length >= 1` and every mark has a `note`. Stroke draws from the box edge to the note |
| Notes | 1300ms | 180ms | Outside sentences fade in |

Full reveal with sentences: 1480ms, inside the 1.2–1.8s brief. A reveal whose notes are not aligned yet stops after the boxes, at 1080ms: there are no sentences to place, so it does not pad out to 1.2s. Plate callouts, Legacy, a crop that is not a proper sub-rectangle, and `prefers-reduced-motion: reduce`: 0ms, settled plate.

Crop easing is `cubic-bezier(0.22, 1, 0.36, 1)`. Opacity and the leader draw are linear. There is no rotate beat.

Skip: click or tap on the figure, or Enter / Space while it is focused, cancels the animation and applies the settled state. After that, remove `tabindex` so the figure is not a tab stop. A settled figure does not restart.

If the upright image errors, or `IntersectionObserver` is missing, or the figure’s script throws, add the settled class and show the plate. Do not stay on the upright.

`angleDeg` is not read by this timeline.

### First paint

Extend the existing `is:inline` script in `Base.astro`’s `<head>` so that, before first paint, `document.documentElement.dataset.motion` is `reduce` or `ok` from `matchMedia('(prefers-reduced-motion: reduce)')`. If that throws, leave the attribute unset.

Unset or `reduce`: CSS shows the settled plate, boxes, badges, and (when notes exist) leaders and sentences.

`data-motion="ok"` and a reveal figure that is not yet settled: the upright is visible, the plate is `opacity: 0` but still in flow, and 题铭 graphics are `opacity: 0`. Gutter space for notes is reserved whenever notes exist, so the settle does not reflow the column. Notes stay in the accessibility tree the whole time (`opacity` only; not `visibility: hidden`, not `display: none`).

No-JS never sets `data-motion`, so it gets the settled plate. The animation is an enhancement. The enhancement never deskews.

A live change to `prefers-reduced-motion` during a reveal jumps to the settled state.

## 8. Settled 题铭

Runtime SVG/CSS on the clean plate. No second painted WebP.

The plate and the SVG share a wrapper. The `1px solid var(--line)` border moves from the detail `<img>` to that wrapper, with no padding, so the SVG viewBox (`0 0 plate.width plate.height`) maps onto image pixels. Hero `entry-hero img` keeps its border. Detail `<img>` inside the wrapper has `border: 0`.

| Token | Locked value |
|---|---|
| Box | Axis-aligned, no fill, no radius. Stroke `var(--accent)`, width `2` plate pixels |
| Badge | Circle, diameter `22 * plate.width / 400` plate pixels (22 CSS px when the plate is displayed 400 CSS px wide). Stroke `2` plate pixels, `var(--accent)`. Fill `var(--bg)`. Numeral is the 1-based index in `marks`, Arabic, weight 600, size `11 * plate.width / 400` plate pixels, fill `var(--accent)`, centered |
| Badge corner | `tl` or `tr`. Inner padding `3` plate pixels between the circle’s edge and that corner, when the box can contain the circle. Otherwise center the circle on the box. Diameter does not shrink |
| Leader | Straight segment, no arrow. Stroke `var(--accent)`, width `1` plate pixel. From the midpoint of the box edge that faces `side`, to `0.35rem` short of the note’s inner edge |
| `side: left` / `right` | That edge, that gutter |
| `side: auto` | Whichever side of the box has more plate pixels (`x` vs `plate.width - (x + w)`). Tie (within 1px) goes right. No-JS and first paint use right for `auto`; the inline script may move them before the note beat |
| Label | `0.75rem`, weight 500, `var(--muted)`, line-height 1.35. Shown only with a `note`, and only when `label` is present and is not equal to `note` and is not a prefix of `note` |
| Note body | `0.78rem`, weight 400, `var(--text)`, line-height 1.45 |
| Face | Inherit the body CJK sans. No second family |
| Gutter | The side that has notes. Empty side is not rendered. Note block `max-width: 9.5rem`. Gap from plate to gutter text `0.55rem` |
| Stack | Within a side, order by anchor `y + h/2`, then by `marks` index. Ideal top centers the note on the anchor. If the gap to the previous note would be under `0.35rem`, push down until the gap is `0.35rem`. Do not push above the plate top. Notes may hang below the plate; the leader then slants. The plan may pick the data structure; this placement is the behavior |
| Yellow | `#FFD400` is not a public color, in CSS or in a plate the exporter writes |

Dark theme uses the existing dark `--accent` (`#f2c9a6`). No separate callout art. In `forced-colors: active`, box, badge stroke, badge text, and leader use `CanvasText`; badge fill uses `Canvas`.

Boxes and badges are server-rendered from the integers. They show without JS. Leaders and the collision stack run in the record-page inline script, including for reduced motion (that script positions, it does not tween). Recompute on `resize` and `document.fonts.ready`. Recomputing must not replay the reveal.

Class names for the circle and the gutter must not be `badge`. That class is the status pill (`.badge`, `.badge-verified`, and the rules in `.c-status` / `.record-tombstone-meta`).

## 9. Layout

Desktop (`min-width: 48rem`) keeps the sticky left column: `.record-object` is `position: sticky`, `top: 1rem`, `max-height: calc(100vh - 2rem)`, `overflow-y: auto`. The right column’s tombstone, 记述, `dl.props`, and folds are unchanged.

Inside the left column:

- Hero figure stays first, `fit-content`, no marks, no reveal.
- Detail figures are in document order, always expanded. They are not wrapped in `<details>`.
- `.detail-grid` becomes one column (`minmax(0, 1fr)`). Gap stays `1.2rem 1.15rem`. A second column would crush the gutters.
- Each detail figure is `width: 100%` of the object column. The stage is a row: optional left gutter, plate, optional right gutter.
- Caption stays one line under the stage: the existing `<figcaption>` string, unchanged, at today’s `0.75rem` / 500 / muted.
- The long ① list is not painted under the figure once section 6 has hidden those lines. Transcription lines that remain use today’s `.detail-text` (`0.78rem`, muted, `pre-line`).

Below `48rem` the page is still one column, images then text. The same gutter stage is used. It does not gain a separate mobile callout layout.

## 10. Markup and accessibility

Settled reveal / plate-callout figure, in reading order:

- `<figure class="detail-figure">` with `data-part`. Add `is-reveal` only in the Reveal state. The script adds `is-settled` when the timeline finishes, when the user skips, or when the figure cannot play.
- Stage: plate `<img>` (`alt` unchanged, `width` and `height` from `plate`, `decoding="async"`, `loading="lazy"`), overlay SVG `aria-hidden="true"`, upright `<img>` only in the Reveal state (`alt=""`, `aria-hidden="true"`, same loading hints).
- `<ol>` of marks. Each `<li id="{id}-{part}-mark-{mark.id}">` contains a visually clipped index (`1`, `2`, …), the label when section 8 shows it, and the note. `list-style: none`. The `<ol>` has `aria-label="题铭"`.
- `<figcaption>` caption.
- `.detail-text` only for the unconsumed remainder of `text`.

The SVG does not repeat the sentences. The plate `alt` stays the short existing alt (MHJL label remains `标签细节`). Sentences are not copied into `alt`.

The index is clipped, not removed from the accessibility tree. There is no site-wide screen-reader class today; this one belongs to the mark index only:

```css
.mark-index {
	position: absolute;
	width: 1px;
	height: 1px;
	padding: 0;
	margin: -1px;
	overflow: hidden;
	clip: rect(0, 0, 0, 0);
	white-space: nowrap;
	border: 0;
}
```

The `<li>` is `position: relative`, so the clipped index does not escape the note.

While a reveal is running and `data-motion="ok"`, the figure is focusable (`tabindex="0"`) so Enter / Space can skip. Focus uses the existing `:focus-visible` outline (`--focus`). Settled and non-reveal figures are not given a tab stop.

There is no visible 「题铭」 heading. The word is the accessible name of the list, the same way 著录 is only an `aria-label`.

## 11. Files a later implementation touches

This pull request adds only this spec.

| Path | Later change |
|---|---|
| Skill toolchain `export_site_marks.py` | New exporter in section 5. Not an Astro module |
| `export_detail_pack.py` | Unchanged role: editor marked bake + data URL |
| `src/data/records.ts` | Schema in section 3, file asserts, search text |
| `src/data/records.json` | 17 details projected from YAML. `text` preserved |
| `public/records/{id}/{part}.webp` | Clean plate when the exporter can write one |
| `public/records/{id}/{part}-upright.webp` | Only for Reveal parts |
| `src/pages/records/[id].astro` | Figure markup and the inline reveal script |
| `src/styles/global.css` | Plate stage, 题铭, one-column detail grid |
| `src/layouts/Base.astro` | `data-motion` in the existing head script |
| `README.md` | Sample `details[]` object matches section 3 |

No change to `src/pages/records.astro`.

## 12. Acceptance

Viewport checks use a `16px` initial font (`1rem` = `18px` on this site).

1. A reveal figure’s first animated frame is the upright WebP contained in the plate box. The page never requests a raw scan path, never rotates by `angleDeg`, and never reads `auto`, `fit`, `match`, or OCR.
2. `transform.cropSpace` is the string `upright`. `angleDeg` is a finite JSON number. `crop` is inside the shipped upright. `exportWidth === plate.width`. Plate height matches the file. Current exports stay in the 380–480 width band unless a part’s real export differs, in which case the JSON matches the file.
3. Every mark in JSON has integer `x,y,w,h` inside the plate. No mark has `match`. MHJL 329 label and 腰封 are the two figures used to check this by eye.
4. `text` on all 17 details is unchanged by the exporter. YAML `note` does not appear as `marks[].note` unless an editor typed that same sentence on purpose. Re-export keeps an editor’s `note`, `label`, and `side` on the same mark `id`.
5. With notes missing, the full `text` list is still under the caption, boxes may show, leaders do not. With every note set, circled lines whose body equals a note are gone from the visual list, the transcription lines on `falp381` and `ll912` labels remain, and `detailsNote` is omitted only when no circled line remains visible on that page.
6. A part with no upright (missing master, or `base_image` already at crop size with angle 0) shows the plate immediately, with no crop tween. LPBR 6083 does not get runtime marks on top of the yellow bake from `daf560b`. After a clean plate exists, those three figures use `--accent` marks and the pixels of `#FFD400` are gone.
7. Timing on a reveal that has notes: hold 160, crop 760, crossfade overlapping the last 80, boxes 160, leaders 220, notes 180 (1480ms total). Click, tap, Enter, and Space reach the settled plate with 题铭 visible. `prefers-reduced-motion: reduce` and no-JS show that settled state with no tween.
8. At a 400 CSS px plate, the badge diameter is 22px and the box stroke is 2px, color computed `--accent` (`#7c2d22` in light). Label type is `0.75rem` muted; note body is `0.78rem` ink. Leaders do not use the badge corner as their direction.
9. Hero, 记述, 著录, folds, and the list page’s `record.image` covers are unchanged. `.detail-grid` is one column. Caption strings are unchanged. `npm run check` and `npm run build` pass.

## 13. Out of scope

- A circular loupe or any magnifier lens
- List square-crop, list cover choice, or tombstone type
- Dark-mode callout art beyond the existing `--accent` token
- Rewriting `story`, captions, alts, or `detailsNote`
- Discogs, new records, or new detail parts
- Deleting `text` from the schema
- Client OCR, client deskew, or a `rectifyH` animation
- Copying editor yellow bakes into `public/records/` as the plate
- Committing skill YAML or raw scans to this repo
