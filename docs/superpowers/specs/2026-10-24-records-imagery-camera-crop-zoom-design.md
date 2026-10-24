# Design: camera zoom into the crop for split-stage /records/

Date: 2026-10-24  
Site: https://lu-ceam.github.io/records/  
Status: Motion approved 2026-10-24 (camera-into-crop). Spec only. This PR does not edit CSS, Astro, TypeScript, JSON, or image files.

Amends the crop motion in [split-stage design](2026-10-24-records-imagery-split-stage-design.md). That spec still owns the split layout, the itinerary, settle, the 1.6s detail crossfade, and legacy `.record-split`. This document replaces only how `cropT` moves the upright inside the fixed clip. Asset rules from [imagery reveal and manual](2026-10-24-records-imagery-reveal-manual-design.md) stay in force, including: the upright file is already deskewed, `transform.crop` is in upright pixels, and playback does not apply `angleDeg`.

Checked against `src/data/split-stage.ts`, `src/data/split-stage.test.ts`, `applyFrame` in `src/pages/records/[id].astro`, the split-stage plate frame in `src/styles/global.css`, and MHJL 329 in `src/data/records.json`, at `d0efbca` (PR #29).

## Why

On `/records/mhjl329/` the itinerary already scrubs upright → crop → plate → boxes → notes. The crop step is `lerpBox(containBox(...), croppedBox(...), cropT)`: the upright’s left, top, width, and height each move in a straight line. Rolf rejected that path. It reads as a sideways slide, and on the cover as a spin, rather than a top-down zoom into the region that became the plate. He chose **camera-into-crop**. The motion section of that choice was approved 2026-10-24.

The slide is not a CSS rotate. Both endpoint boxes share the upright’s aspect, so the lerp stays axis-aligned. It still feels like a drag because a linear scale makes the image box’s edges the thing being interpolated. Linear scale plus “keep the crop center on a straight line to the stage center” is the same function as `lerpBox` (proof below). A camera zoom has to interpolate scale geometrically.

## Goal

Replace the contain→cropped rectangle lerp with a **top-down camera zoom into the crop rect**: one uniform scale and one translation, so the crop rectangle grows to fill the plate frame inside the sticky stage (letterbox or pillarbox only when the crop’s aspect is not the frame’s). The visitor should see “we cropped this region from the upright,” not a photo sliding into place.

## What stays

| Still owned by the split-stage spec | This round |
|---|---|
| Sticky imagery column + scrolling 说明栏 | Unchanged |
| Itinerary row labels and status (`原片扶正` / `全幅`, `裁进板心` / `板心`, `标出要点` / `框选`, `读注` / `旁注`) | Unchanged |
| `stageVisual` opacities, `CROP_BLEND_AT` (`0.9`), settle (`SETTLE_*`), `DETAIL_CROSSFADE_MS` (`1600`) | Unchanged. Plate opacity stays 0 until `cropT` is 1 |
| `prefers-reduced-motion` | Still jumps to the final plate + boxes. No scrub, no zoom |
| Legacy `.record-split`, 记述 copy, split-stage chrome | Unchanged |
| `transform.crop` in upright space, baked `upright` + `plate` | Read as today. Do not re-export |

## Locked decisions

| Topic | Choice |
|---|---|
| Path | Camera-into-crop. Uniform scale + translation. No rotation term |
| Forbidden path | Independent linear lerp of left / top / width / height (`lerpBox`), including the same curve written as a linear scale |
| `t = 0` | Full upright **contain**-fitted in the plate frame (today’s `containBox`) |
| `t = 1` | Crop rect contained in that same frame, centered. Flush on all four edges when crop aspect equals the frame. Letterbox or pillarbox only when the aspects differ |
| Viewport | The fixed upright clip (the plate frame). Not the sticky column |
| `angleDeg` | Not read. Label `0`, cover `−17.31`. No CSS rotate on the baked upright |
| After the zoom | Existing plate crossfade, then boxes, then notes. No timing change |
| Reduced motion | Unchanged settled plate + boxes |

## Motion

The clip does not move, resize, or rotate. `applyFrame` keeps writing the upright’s `left`, `top`, `width`, and `height` (and `object-fit: fill`) inside `.upright-clip`. Overflow stays hidden. Do not add a CSS `transform` (`rotate`, `scale`, or `translate`) on the upright this round.

`cropT` runs from 0 to 1 over the first `CROP_BLEND_AT` of the gap between `原片扶正` and `裁进板心`, exactly as `stageVisual` does now. `cropT` is the camera parameter. Do not add a second easing curve.

- `cropT = 0`: the whole upright sits in the frame with `contain`. Bars are the clip’s existing background.
- `cropT` in `(0, 1)`: one scale, strictly increasing when the crop is a proper sub-rectangle, and one translation. The crop’s center travels in a straight line toward the stage center. Each crop edge moves toward its `t = 1` edge (the stage edge when the crop is flush, the letterbox edge when it is not). The bitmap’s aspect stays `naturalW / naturalH`.
- `cropT = 1`: the crop rect fills the frame (letterbox or pillarbox only if its aspect is not the frame’s). Then, and only then, the upright fades out and the plate fades in across the rest of that itinerary gap.

`stageVisual` already holds `plateOpacity` at 0 while `cropT < 1`, and starts the crossfade only after `cropT` has reached 1 (`local >= CROP_BLEND_AT`). Keep that order. Do not retune `CROP_BLEND_AT`, the settle constants, or the 1.6s detail crossfade. A detail change still crossfades whole frames; each frame runs this camera on its own crop.

`prefers-reduced-motion: reduce` still skips `applyFrame` and shows the settled plate + boxes. Do not run the camera on that path.

`angleDeg` stays on the record for a future source→deskew path. This round does not spin the baked upright to “correct” the cover. The perceived spin is the slide, and the camera path is the correction.

## Why a linear scale is still `lerpBox`

Let `s` be the uniform scale and let `(cx, cy)` be the crop center’s screen position. Write the image box from the crop center:

```
left = cx - (crop.x + crop.w / 2) * s
top  = cy - (crop.y + crop.h / 2) * s
```

Expanding that with linear `s`, `cx`, and `cy` gives no `t²` term: `left` and `top` are linear in `t`, and so are `width` and `height`. That is `lerpBox` between the contain box and the end box. Endpoints match a zoom; the midpoint does not. The image-space point that stays still on screen is not the crop center, so the region slides sideways while it grows. On MHJL 329’s cover the crop sits up and to the left in the square upright (`angleDeg` is `−17.31` on the record and is not applied), and that diagonal reads as a twist.

The camera path keeps the crop center’s screen motion linear and makes scale geometric. Those two choices diverge at every `t` in `(0, 1)`.

## Math

Implement one function. It returns the upright’s image box in the clip’s coordinate space, the same `Box` shape as `containBox` (`left`, `top`, `width`, `height`).

```
cameraBox(viewW, viewH, naturalW, naturalH, crop, t) -> Box
```

`crop` is `{x, y, w, h}` in upright pixels. `t` outside `[0, 1]` clamps to that interval. Inputs used on the page are positive: the plate’s client size, the upright’s natural size, and a positive crop. `applyFrame` keeps its current guard (`naturalWidth > 0` and the plate’s client width `> 0`) and does not call the function otherwise.

`viewW` and `viewH` are the plate frame (today `plate.clientWidth` and `plate.clientHeight`). That frame is already the box the plate image fills: `.detail-stage` is sized from `--plate-w / --plate-h`, the plate is `width: 100%` / `height: auto`, and `.upright-clip` is `inset: 0`. Do not zoom to fill the sticky column. The column’s centering of the stage stays as it is.

### Poses

`t = 0`, contain the full upright:

```
s0 = min(viewW / naturalW, viewH / naturalH)
left0 = (viewW - naturalW * s0) / 2
top0  = (viewH - naturalH * s0) / 2
```

`t = 1`, contain the crop in the same frame and center it. This is the plate’s rectangle when the aspects match, and a letterbox or pillarbox when they do not:

```
s1 = min(viewW / crop.w, viewH / crop.h)
destLeft = (viewW - crop.w * s1) / 2
destTop  = (viewH - crop.h * s1) / 2
```

The image box at `t = 1` is:

```
left   = destLeft - crop.x * s1
top    = destTop  - crop.y * s1
width  = naturalW * s1
height = naturalH * s1
```

The crop’s screen rect is then `{destLeft, destTop, crop.w * s1, crop.h * s1}`, and its center is the stage center `(viewW / 2, viewH / 2)`.

Today’s `croppedBox` is a different end pose: `s = viewW / crop.w`, crop origin pinned to `(0, 0)`, `viewH` ignored. Use it only as a comparison fixture. It matches `cameraBox(..., 1)` when `crop.w / crop.h = viewW / viewH` (MHJL 329’s label: `514×514` in a `400×400` frame). It does not match when the aspects differ: the width-fit pins the crop to the top and can clip it. The camera end state is the centered contain above, because that is the rectangle the plate actually shows.

MHJL 329’s cover is the near-match. Plate `400×248`, crop `379×235`. `s1 = 248 / 235`. The crop is flush to the top and bottom, and about `0.017px` inset on the left and right. Keep that remainder. Do not switch back to `viewW / crop.w` to erase it. The plate crossfade covers it.

### Path

Let `u = clamp(t, 0, 1)`.

```
s(u) = s0                         when s0 = s1 or s0 ≤ 0 or s1 ≤ 0
s(u) = s0 * (s1 / s0) ^ u         otherwise
```

`s0 = s1` does not skip the translation. The center still travels. A crop that already matches the contain scale on the tight axis can still sit off center.

Focus point, constant in upright pixels: the crop center `(crop.x + crop.w / 2, crop.y + crop.h / 2)`.

Screen position of that point:

```
cx(u) = cx0 + (viewW / 2 - cx0) * u
cy(u) = cy0 + (viewH / 2 - cy0) * u
```

where `(cx0, cy0)` is the crop center under the `t = 0` contain pose. Then:

```
left(u)   = cx(u) - (crop.x + crop.w / 2) * s(u)
top(u)    = cy(u) - (crop.y + crop.h / 2) * s(u)
width(u)  = naturalW * s(u)
height(u) = naturalH * s(u)
```

No rotation term. The map is `X = left + s * x`, `Y = top + s * y`.

Consequences the tests must lock:

- `width / height = naturalW / naturalH` at every `u`.
- `s(u)` is strictly increasing on a proper sub-rectangle. Proper here means the crop lies inside the upright and is strictly smaller on both axes (`crop.w < naturalW` and `crop.h < naturalH`, origin non-negative, far edges at or inside the upright). Then `s1 > s0` for any positive view, because each of `viewW / crop.w` and `viewH / crop.h` is greater than `s0`.
- For `u` in `(0, 1]`, the projected crop center lies on the segment from its `t = 0` position to the stage center, strictly closer to the stage center than at `t = 0` unless it was already there. At `u = 1` it is the stage center. “Near” means that segment, not a pixel epsilon that the cover cannot meet at mid-zoom.
- The `u = 0.5` box is not `lerpBox` of the endpoint boxes. Compare against the numbers below.

`containBox` stays the `t = 0` pose. `cameraBox` replaces `croppedBox` as the motion target. Stop calling `lerpBox` on this path. Remove `lerpBox` if nothing else calls it.

## Unit-test midpoints

Tolerance: absolute error under `1e-6`. Existing `near` in `src/data/split-stage.test.ts` is enough.

### Label, aspects equal (flush end, matches today’s `croppedBox`)

View `400×400`. Upright `1050×1400`. Crop `{x: 274, y: 403, w: 514, h: 514}`.

| `t` | Box `{left, top, width, height}` | Crop center on screen |
|---|---|---|
| 0 | `{50, 0, 300, 400}` | `(201.714285714286, 188.571428571429)` |
| 0.5 | `{-49.528218834867, -116.927729625259, 495.112297131093, 660.149729508124}` | `(200.857142857143, 194.285714285714)` |
| 1 | `{-213.229571984436, -313.618677042802, 817.120622568093, 1089.494163424125}` | `(200, 200)` |

`s(0) = 400 / 1400`, `s(1) = 400 / 514`, `s(0.5) = 400 / sqrt(1400 * 514) ≈ 0.471535521077`. Scales at `0, 0.25, 0.5, 0.75, 1` increase: about `0.285714`, `0.367048`, `0.471536`, `0.605767`, `0.778210`.

The forbidden `lerpBox` midpoint is about `{-81.614786, -156.809339, 558.560311, 744.747082}`. The test fails if `cameraBox(..., 0.5)` matches it.

At `t = 1` the crop’s screen rect is `{0, 0, 400, 400}`.

### Mismatch, letterbox (not a live plate)

View `200×100`. Upright `100×100`. Crop `{x: 10, y: 20, w: 50, h: 40}`.

| `t` | Box | Crop screen rect |
|---|---|---|
| 0 | `{50, 0, 100, 100}` | `{60, 20, 50, 40}` |
| 0.5 | `{37.160141, -18.245553, 158.113883, 158.113883}` | center `(92.5, 45)` |
| 1 | `{12.5, -50, 250, 250}` | `{37.5, 0, 125, 100}` |

`s(0.5) = sqrt(2.5) ≈ 1.581139`. Height is flush with the view; width is pillarboxed and centered. Today’s `croppedBox` at this fixture is `{left: -40, top: -80, width: 400, height: 400}` and must not be the `t = 1` result.

### Cover, off-center crop (the slide Rolf rejected)

View `400×248` (the cover plate). Upright `1400×1400`. Crop `{x: 219, y: 210, w: 379, h: 235}`.

`t = 0` contain is `{left: 76, top: 0, width: 248, height: 248}`. Crop center starts near `(148.362857, 58.014286)` and the stage center is `(200, 124)`. At `t = 0.5` the box is about `{-2.440976, -50.593438, 605.315462, 605.315462}`, the crop center is the midpoint near `(174.181429, 91.007143)`, and `s ≈ 0.432368` (`248 / sqrt(1400 * 235)`). At `t = 1` the crop is flush vertically (`height 248`) with the subpixel side inset described above. No test reads `angleDeg` or expects a rotation.

Also clamp: `cameraBox(..., -1)` equals `t = 0`, and `cameraBox(..., 2)` equals `t = 1`.

## Implementation boundary

This PR adds only this document.

A later implementation, after this spec is accepted, is expected to touch:

- `src/data/split-stage.ts` (add `cameraBox`; stop using `lerpBox` for this path; retire `lerpBox` if it has no caller)
- `src/data/split-stage.test.ts`
- `src/pages/records/[id].astro`, inside `applyFrame` only: replace `lerpBox(containBox(...), croppedBox(...), visual.cropT)` with `cameraBox(...)`

Do not change CSS, the itinerary markup, `records.json`, the asset exporter, or `stageVisual`’s timing.

## Acceptance

On `/records/mhjl329/` with motion allowed:

1. Scrubbing `原片扶正` → `裁进板心` on the label zooms the upright into the square crop until that crop fills the plate frame. The frame does not move. The upright does not rotate.
2. The same scrub on the cover zooms into the waistband crop until it fills the wide plate frame. The upright does not rotate by `−17.31°`.
3. The plate crossfade starts only after that zoom has finished, then boxes, then notes, on the existing itinerary timing. Scrolling back reverses the camera.
4. The label midpoint scale is the geometric mean above, not the `lerpBox` midpoint.
5. Reduced motion still shows the final plate + boxes and does not zoom.
6. Legacy records and `.record-split` are unchanged. 记述 copy and itinerary labels are unchanged.

## Out of scope

- Circular pointer loupe.
- Animating from the raw `source`, or deskewing with `angleDeg`.
- Tombstone, list crop, lightbox.
- Filling `marks.note` or drawing leaders.
- Changing the YAML export protocol (`cropSpace: "upright"`, resolved marks, baked upright / plate).
- Replacing the split-stage layout, chrome, row labels, or 记述.
- Scroll libraries, or a second easing curve on `cropT`.
