# Design: imagery scroll-scrub for /records/

Date: 2026-10-24  
Site: https://lu-ceam.github.io/records/  
Status: Draft for review. Spec only. Implementation follows after review. This change does not edit CSS, Astro, TypeScript, JSON, or image files.

Replaces autoplay `runTimeline` on reveal details. Does not replace the asset protocol (upright / plate / marks), Legacy layout, list crop, tombstone, loupe, or leader notes.

## Relationship to earlier specs

Builds on [imagery reveal and manual 题铭](2026-10-24-records-imagery-reveal-manual-design.md) (reveal + manual callouts; autoplay was the first interaction). This document **replaces only the interaction model** (autoplay → scroll scrub). Asset and visual rules from that spec remain in force unless contradicted here.

[Museum alignment](2026-10-24-records-museum-alignment-design.md) still owns Approach A, the warm-paper tokens, list image|text rows, chronological sort, the 记述 hairline, untitled 著录 (`aria-label` only), and fold chrome.

[Type + cover polish](2026-10-24-records-type-cover-polish-design.md) still owns list cover = `record.image` (first 纸壳), 记述 at `0.9375rem`, and 著录 type. List thumbs do not gain this scrub.

[Typography polish](2026-10-24-records-typography-polish-design.md) and [detail page](2026-10-24-records-detail-page-design.md) still own navigate-only URLs, skeleton B, 记述 lead markup, and the ban on a 「记述」 label, a drop cap, and a second face.

## Goal

Replace the current autoplay reveal with **reversible, scroll-linked scrub**: each reveal detail pins full-screen while the user scrolls through upright → crop → plate → 框选. Multiple reveal details play as sequential sticky chapters. Story copy comes after all chapters.

## Locked decisions

| Topic | Choice |
|---|---|
| Pin style | Sticky fullscreen stage (`100vh`) |
| Multi-detail | Sequential chapters (finish one runway before the next) |
| Progress drives | Full pipeline: upright → crop into plate → fade in boxes; reverse on scroll back |
| Story placement | All reveal chapters first, then 记述 / 著录 / folds |
| 题铭 | Top of page, then chapters, then story |
| Scrub feel | Soft-snap at keyframes; continuous while scrolling |
| Implementation | Native sticky runway + scroll→progress (no scroll library) |

## Page structure (reveal records only)

Top → bottom:

1. **题铭** — existing title block; not sticky.
2. **Reveal chapters** — one chapter per `details[]` entry in reveal mode (e.g. label, then 腰封).
   - Outer **runway** ≈ **2.5–3× viewport height**.
   - Inner **stage**: `position: sticky; top: 0; height: 100vh`; imagery fills the viewport.
   - User must scroll through chapter *N* before chapter *N+1* pins.
3. **记述 → 著录 → folded sections** — existing prose / props / folds in normal document flow below all chapters.

**Legacy** records (no reveal assets) keep the current left-image / right-text split. Do not change list pages.

**`prefers-reduced-motion: reduce`:** do not build tall runways; show final plate + boxes immediately, then 记述 below.

## Per-chapter progress and animation

Map runway scroll to `p ∈ [0, 1]` (enter chapter → 0, leave → 1). Reverse mapping when scrolling up.

| Range | Visual |
|---|---|
| `0 → ~0.55` | Full upright → crop into plate (reuse existing clip / transform) |
| `~0.55 → ~0.75` | Plate holds; burgundy 框选 fade in (boxes only until `marks.note` exists) |
| `~0.75 → 1` | Hold final state (readable dwell) |

**Soft-snap:** while actively scrolling, progress tracks the finger/wheel. On release or scroll idle, ease a short distance toward the nearest keyframe among `{0, 0.55, 0.75, 1}`. No hard jumps mid-gesture.

**Remove** autoplay `runTimeline`. Each chapter’s progress is local to its runway; chapters do not fight over a shared timeline.

**Leaders /旁注:** still deferred until `marks.note` is filled; may leave a hook to fade with the box segment later.

## Implementation boundary

### Change

- `src/pages/records/[id].astro` (or equivalent detail template): when the record has reveal details, layout = 题铭 → chapter runways → 记述/著录/folds.
- `global.css` (or detail stylesheet): sticky runway + fullscreen stage styles.
- Client script: replace `runTimeline` with per-chapter scroll → `p` scrub (+ soft-snap). May stay inline on the detail page or move to a small dedicated module; either is fine unless a follow-up prefers extract.

### Do not change

- Vinyl YAML / `export_site_marks.py` asset protocol.
- Shape of `details[]` (upright, plate, transform, marks, cropSpace, resolved `angleDeg`).
- Legacy two-column detail layout.
- List page, list square-crop, tombstone, loupe.
- Public copy in 记述; leader-line callouts with note text (deferred).

## Acceptance

On `/records/mhjl329/` (and any record with reveal assets):

1. Wheel / trackpad scrub is reversible through the label chapter (upright → crop → boxes).
2. If a second reveal detail exists, finishing the first runway advances into the next sticky chapter.
3. Soft-snap lightly settles near crop-complete and boxes-complete when the user stops.
4. With reduced motion, no tall runway; final plate + boxes, then story.
5. Legacy records unchanged; autoplay gone on reveal records.

## Out of scope

- Filling `marks.note` and drawing leader + outside label text.
- Tombstone, list crop, loupe.
- Scroll libraries (GSAP ScrollTrigger, Lenis, etc.).
- Changing export / YAML pipeline.
