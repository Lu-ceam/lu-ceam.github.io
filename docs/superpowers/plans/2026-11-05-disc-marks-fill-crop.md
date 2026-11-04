# Disc record chapter fill→crop + chrome Implementation Plan

> **For agentic workers:** Use `executing-plans`. Do **one Task at a time**. Mark `[x]` only after that Task's verification passes. `[id].astro` shared → **one serial writer**. Do **not** follow voided plan `2026-11-04-disc-marks-zoom-chrome.md` (pinch).

**Goal:** Move museum **fill→crop** (upright → crop-window → plate + elbows) into the narrow record chapter; remove labeled side tabs + cover title; keep marks-only (no independent pre-disc runway). Open PR from `5bf04c7`. Coding lead squash after layout PASS + CI. **Do not merge.**

**Handoff:** `/home/box/web-layout/handoff-records-disc-marks-zoom-chrome.md` (2026-11-05 fill→crop)  
**Acceptance:** `/home/box/web-layout/acceptance-disc-marks-zoom-chrome.md`  
**Demo:** `/workspace/disc-record-marks-demo/` (qa 01-opening / 02-mid-crop / 03-settled)

**Architecture:** Reuse `detail-display.ts` geometry (`openingBox` / `plateBox` / `zoomImageBox` / `cropWindow` / `fillCropPaint`). Chapter DOM: upright-outer + crop-window (`data-fill-crop`). Auto-play once on enter/side-change; `prefers-reduced-motion` → settled. Pinch/±/dblclick are **not** PASS.

**Baseline:** `origin/main` `5bf04c7` (#164). Main may have moved (#165 pin-pop); **rebase only if needed after PR**—do not expand scope.

---

## Contracts (Task 0) — DONE in `0587095`

### DOM hooks (record chapter only)

| Hook | Notes |
|------|--------|
| `.upright-outer` + `data-fill-crop="outer"` | fades with cropT² via `fillCropPaint` |
| `.crop-window` + `data-fill-crop="window"` | crop clip; stays opaque |
| plate + mark elbows (marks-only) | visible at settled (cropT→1) |
| `[data-cover-side]` on **dot** buttons only | no visible text; short `aria-label` |
| **No** `.disc-record-cover-title` | remove |
| **No** labeled `.disc-record-sides` text buttons | replace with dots |

### Behavior

- Enter record chapter / change side → play fill→crop once (or reduced-motion → settled).
- Geometry via `zoomImageBox` + `cropWindow` + `fillCropPaint` — **not** `pose.style.transform = scale(...)`.
- `recordChapterRendersProse` stays false; no independent camera-runway on narrow.
- Desktop ≥48rem: existing split-stage fill-crop untouched unless extracting a shared helper is safer.

### P1

- Opening (cropT≈0): crop-window edge still readable.
- Brick accent = site tokens (`#7c2d22` / `#f2c9a6`), not demo `#b85c38`.
- Dot hit ≥24px; `:focus-visible` ≥2px ring.

### Global Forbidden

- Pinch/±/dblclick as substitute for fill→crop; restore independent runway; text side tabs; marks field renames; merge to main.

---

## Task 1: Source tests for chrome (TDD red→green later)

**Files:** `src/data/disc-chapters.source.test.ts` and/or `src/data/disc-record-marks.source.test.ts`  
**Do:**
1. Assert record-chapter template / reader path: **no** `.disc-record-cover-title`; **no** labeled side chrome text.
2. Assert fill-crop hooks present: `data-fill-crop="outer"` + `data-fill-crop="window"` (or `.upright-outer` + `.crop-window`) in record chapter.
3. Assert `[data-cover-side]` only as dots (no visible label text requirement).
4. Keep existing marks-only gates green.

**Verify:**
```bash
node --test src/data/disc-chapters.source.test.ts src/data/disc-record-marks.source.test.ts
```
Expect: new asserts **fail** until Task 2–3 land (red OK). Commit tests alone if red is intentional; otherwise commit with Task 2.

**Done when:** new failing asserts exist and old gates still named.

- [x] Task 1

---

## Task 2: Chapter DOM — upright / crop-window / dots / drop title

**Files:** `src/pages/records/[id].astro` (record chapter block only)  
**Do:**
1. Inside each face: wrap imagery as upright-outer → crop-window → plate (+ existing elbows/notes).
2. Remove `.disc-record-cover-title`.
3. Replace labeled `.disc-record-sides` buttons with wordless dots (`data-cover-side` + `aria-label`).
4. Do **not** fake fill→crop with pose `scale(...)`.

**Verify:**
```bash
rg -n 'disc-record-cover-title|data-fill-crop|data-cover-side|upright-outer|crop-window' src/pages/records/\[id\].astro
node --test src/data/disc-chapters.source.test.ts src/data/disc-record-marks.source.test.ts
```

**Done when:** hooks in markup; title gone; dots present; source tests for Task 1 green (or only animation asserts still pending).

- [x] Task 2

---

## Task 3: CSS — chapter fill-crop + dots + P1 tokens

**Files:** `src/styles/global.css` (`.disc-chapter*` / `.disc-record*` only)  
**Do:**
1. Style upright-outer / crop-window so opening window edge is readable (P1).
2. Dot hit ≥24px; focus-visible ring ≥2px.
3. Brick accents use site tokens, not demo orange.
4. overscroll / chapter chrome: no unrelated traj edits.

**Verify:**
```bash
rg -n 'data-fill-crop|upright-outer|crop-window|disc-record-side|7c2d22|f2c9a6' src/styles/global.css | head -40
```

**Done when:** CSS supports Task 2 DOM; P1 tokens present.

- [x] Task 3

---

## Task 4: Play once — enter / side-change / reduced-motion

**Files:** `src/data/disc-chapter-reader.ts` and/or page script in `[id].astro`  
**Do:**
1. On enter record chapter + on side change: drive `cropT` 0→1 once using `fillCropPaint` / `zoomImageBox` / `cropWindow` (reuse `detail-display.ts`).
2. `prefers-reduced-motion` → jump to settled plate + elbows (no pose-scale fake).
3. Soft scrub/replay optional; no「双击放大」copy.

**Verify:**
```bash
rg -n 'fillCropPaint|zoomImageBox|cropWindow|cropT|prefers-reduced-motion|data-fill-crop' src/data/disc-chapter-reader.ts src/pages/records/\[id\].astro | head -50
node --test src/data/disc-chapters.test.ts src/data/disc-chapters.source.test.ts src/data/disc-record-marks.source.test.ts
```

**Done when:** animation path wired; reduced-motion settled; no pinch PASS path.

- [x] Task 4

---

## Task 5: Acceptance sweep + open PR

**Do:**
1. Run acceptance A–F mentally against diff (`acceptance-disc-marks-zoom-chrome.md`).
2. Full related tests green; `npm run check` if cheap.
3. Commit remaining; `gh pr create` from this branch; **do not merge**.
4. Report PR URL + head SHA.

**Verify:**
```bash
node --test src/data/disc-chapters.test.ts src/data/disc-chapters.source.test.ts src/data/disc-record-marks.source.test.ts
gh pr create --base main --head disc-marks-fill-crop --title "feat(records): 唱片章 fill→crop＋无字圆点切面" --body "..."
```

**Done when:** PR open; URL+SHA reported.

- [ ] Task 5

---

## Lane note

All Tasks serial on shared `[id].astro` / reader / CSS. No parallel writers.
