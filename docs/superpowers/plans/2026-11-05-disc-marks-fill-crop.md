# Disc record chapter fill→crop + chrome Implementation Plan

> **For agentic workers:** Use `executing-plans`. `[id].astro` shared → **one serial writer**. Do **not** follow voided plan `2026-11-04-disc-marks-zoom-chrome.md` (pinch).

**Goal:** Move museum **fill→crop** (upright → crop-window → plate + elbows) into the narrow record chapter; remove labeled side tabs + cover title; keep marks-only (no independent pre-disc runway). Open PR from `5bf04c7`. Coding lead squash after layout PASS + CI. **Do not merge.**

**Handoff:** `/home/box/web-layout/handoff-records-disc-marks-zoom-chrome.md` (rewritten 2026-11-05 fill→crop)  
**Acceptance:** `/home/box/web-layout/acceptance-disc-marks-zoom-chrome.md`  
**Demo:** `/workspace/disc-record-marks-demo/` (qa 01-opening / 02-mid-crop / 03-settled)

**Architecture:** Reuse `detail-display.ts` geometry (`openingBox` / `plateBox` / `zoomImageBox` / `cropWindow` / `fillCropPaint`; `OPEN_INSET`/`ZOOM_GAIN`/`PLATE_CAP`). Chapter DOM gains upright-outer + crop-window (or chapter-scoped equivalents with `data-fill-crop`). Auto-play once on enter/side-change (~1–2s); `prefers-reduced-motion` → settled. Pinch/±/dblclick are **not** PASS criteria.

**Tech Stack:** Astro, vanilla TS, CSS, `node:test`.

**Checked against:** `origin/main` `5bf04c7` (#164).

## Contracts (Task 0)

### DOM hooks (record chapter only)

| Hook | Notes |
|------|--------|
| `.upright-outer` + `data-fill-crop="outer"` | upright layer; fades with cropT² via `fillCropPaint` |
| `.crop-window` + `data-fill-crop="window"` | crop clip; stays opaque |
| plate + mark elbows (existing marks-only) | visible at settled (cropT→1) |
| `[data-cover-side]` on **dot** buttons only | no visible text; `aria-label` short face name |
| **No** `.disc-record-cover-title` | remove |
| **No** labeled `.disc-record-sides` text buttons | replace with dots |
| Soft scrub / replay control | thin, corner; no「双击放大」copy; optional |

### Behavior

- Enter record chapter / change side → play fill→crop once (or reduced-motion jump to settled).
- Geometry must call / mirror `zoomImageBox` + `cropWindow` + `fillCropPaint` — **not** `pose.style.transform = scale(...)`.
- `[data-cover-side]` outside record chapter = 0.
- `recordChapterRendersProse` stays false; no camera-runway entry on narrow.
- Desktop ≥48rem zero regression (existing split-stage fill-crop untouched unless shared helper extract is safer).

### P1

- Opening (cropT≈0): crop-window edge still readable (not “only big image”).
- Brick accent from site tokens (`--accent` deep `#7c2d22` / light `#f2c9a6`), not demo `#b85c38`.
- Dot hit ≥24; `:focus-visible` ≥2px ring.

### Tests

- Source: no cover-title; no labeled side chrome; fill-crop hooks present in record chapter.
- Unit: geometry helpers still green; chapter fill-crop path source-asserted.
- marks-only gates still green.

## Lane (serial)

| Lane | files | Does |
|------|-------|------|
| fill-crop-chrome | `[id].astro`, `disc-chapter-reader.ts` (and/or page script), `global.css` (chapter fill-crop + dots), tests, this plan | A+B+P1 |

## Global Constraints

- Forbidden: pinch/± demo as substitute for fill→crop; restore independent runway; text side tabs; marks field renames.
- Worker opens PR; **does not merge**.

## Acceptance / Report

1. Acceptance table A–F.
2. Tests + CI as feasible.
3. PR URL + head sha.
