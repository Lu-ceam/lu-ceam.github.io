# Design: imagery split-stage for /records/

Date: 2026-10-24  
Site: https://lu-ceam.github.io/records/  
Status: Draft for review. Spec only. Implementation follows after review. This change does not edit CSS, Astro, TypeScript, JSON, or image files in this PR.

Supersedes the fullscreen sticky-runway interaction in [scroll-scrub design](2026-10-24-records-imagery-scroll-scrub-design.md) and open impl PR #26. Asset protocol and visual rules from [imagery reveal and manual](2026-10-24-records-imagery-reveal-manual-design.md) remain in force unless contradicted here.

## Why

Fullscreen sequential runways + soft-snap keyframes read as a generic sticky-scroll demo: continuous enough mechanically, but not **说明式** (museum / pressing-manual didactic). Rolf asked for something less ordinary; tasteskill direction **`split-stage`** (half the screen never moves; the other half is the reading column) was chosen and adapted to the locked warm-paper / burgundy / CJK catalog.

## Relationship to earlier specs

| Spec | Still owns |
|---|---|
| Museum alignment | Approach A, warm-paper tokens, list image\|text, chrono sort, 记述 hairline, untitled 著录, folds |
| Type + cover polish | list cover = `record.image`, 记述 / 著录 type sizes |
| Reveal + manual | upright / plate / marks protocol; burgundy boxes; manual callouts (box + leader + outside note); no loupe this round |
| Scroll-scrub (2026-10-24) | **Interaction model only — superseded.** Do not implement sequential fullscreen runways. Keep the goal of reversible scroll-linked progress through upright → crop → plate → 框选. |

## Goal

On reveal records, replace fullscreen sticky chapters with a **split stage**: one sticky imagery column driven by a scrolling **说明栏** that carries an itinerary-style stage list and then 记述 / 著录. Explanation and picture stay on screen together.

## Locked decisions

| Topic | Choice |
|---|---|
| Direction | `split-stage` (structure only; not the dealt olive/Imbue skin) |
| Palette / type | Existing warm paper + burgundy + CJK sans (redraw of sheet palette/type) |
| Desktop | ~50/50 or 45/55; imagery sticky full viewport height; reading column ~42–46ch |
| Imagery side | Right on desktop (default); fills edge to edge; no chrome text on the photo |
| Reading column | 题铭 → itinerary stages → 记述 → 著录 → folds |
| Progress driver | Scroll through itinerary rows maps to upright → crop → plate → boxes → notes |
| Soft settle | On scroll idle, ease to nearest **stage row**, not abstract `{0,0.55,0.75,1}` alone |
| Multi-detail | One continuous scroll; section headings in the reading column; slow crossfade (~1.6s) swaps the sticky image (label → 腰封); each detail reuses the same stage pipeline |
| Manual callouts | Box + leader + outside note when public note text exists; empty burgundy boxes if notes missing (do not invent copy) |
| Reduced motion | Sticky column shows final plate + boxes (+ notes if any); no scrub; reading column normal flow |
| Legacy | Unchanged left-image / right-text split |
| Out of scope | Loupe, list crop, tombstone, YAML / `export_site_marks.py` protocol changes, merging PR #26 as-is |

## Idea

On this page, **the label photograph being deskewed and cropped into its plate** becomes the fixed half of a pressing-identification manual; the other half is the calm scrolling column of stages and facts.

**One live thing:** scrolling the reading column drives the sticky plate through the identification pipeline and reveals callouts; scrolling back reverses it.

## Page structure (reveal records only)

### Desktop

1. **Sticky imagery column** (~50% width): `position: sticky; top: 0; height: 100svh`; current detail’s upright/plate fills the panel (`object-fit` / clip as today’s reveal math). Marks drawn on the plate layer.
2. **Scrolling reading column** (~50%): paper ground, max measure ~42–46ch, comfortable horizontal padding. Vertical edge meets the photograph cleanly (no hairline chrome required; tone step is enough).

Top → bottom in the reading column:

1. **题铭** (existing title block; not sticky).
2. **Itinerary slip** — one block per reveal detail (e.g. 「标签」, then 「腰封」), each with four stage rows (see Motion).
3. **记述 → 著录 → folded sections** — existing content, unchanged copy rules.

### Narrow

- Imagery becomes ~55–60svh sticky at the top; the paper column scrolls up over its lower edge.
- Same reading order below.
- When sticky would feel cramped at short heights, release after the itinerary for that detail (implementation may tune; prefer keeping the plate visible through the stage rows).

### Legacy

No split-stage. Keep current two-column detail layout.

## Itinerary stages (per reveal detail)

Four rows, left label / dotted leader / right status (receipt / slip geometry from the taste sheet’s how-it-works, adapted — no zigzag required; keep quiet catalog tone). Suggested public labels (editable in impl if tone is off; do not invent object-specific facts):

| Row | Left | Right (status) | Visual on sticky column |
|---|---|---|---|
| 1 | 原片扶正 | 全幅 | Full upright |
| 2 | 裁进板心 | 板心 | Continuous upright → crop → plate |
| 3 | 标出要点 | 框选 | Burgundy boxes fade in |
| 4 | 读注 | 旁注 | Leaders + outside notes (if note text exists) |

Scroll progress within a detail’s itinerary maps across these four rows (continuous while scrolling). Reverse on scroll up. Crossing into the next detail’s heading triggers the slow crossfade of the sticky image, then that detail’s rows drive the pipeline again from upright.

## Motion

- **While scrolling:** progress tracks the wheel/finger against the itinerary block for the active detail.
- **On idle:** soft-settle to the nearest stage row (readable dwell on that didactic beat).
- **Detail change:** ~1.6s slow crossfade of the sticky photograph (same framing family: plate-sized views), like light shifting — not a new fullscreen runway.
- **Remove:** autoplay `runTimeline`; sequential fullscreen runways (~2.75vh) from PR #26 / scroll-scrub spec.
- **`prefers-reduced-motion: reduce`:** final plate + boxes (+ notes); no tall scrub regions; itinerary may remain as static legend without driving animation.

## Manual callouts

Unchanged intent from reveal+manual:

- Box anchors from resolved marks `x/y/w/h`.
- Leader line to outside label text.
- `badge` (tl\|tr) ≠ `side` (leader side).
- YAML `note` ≠ public site text; only publish note strings already approved for the site (`details.text` / filled public notes). If none, show boxes only.

Auto-expand: annotated imagery is not buried in collapsed folds; it lives on the sticky stage during the relevant stages.

## Implementation boundary

### Change (after this spec is approved and planned)

- Detail template layout for reveal records: split-stage shell.
- CSS for sticky imagery column + reading column (desktop + narrow).
- Client script: map reading-column itinerary scroll → per-detail progress; soft-settle to rows; crossfade between details; draw marks/callouts on plate.
- Close or abandon PR #26 without merging fullscreen runways; implement on a new branch from `main` (or rebase only the reusable reveal math, not the runway layout).

### Do not change

- Vinyl YAML / `export_site_marks.py` asset protocol.
- Shape of `details[]` (upright, plate, transform, marks, cropSpace, `angleDeg`).
- Legacy layout; list pages; list crop; tombstone; loupe.
- Public 记述 copy; inventing `marks.note` content.

## Acceptance

On `/records/mhjl329/` (and any record with reveal assets):

1. Desktop shows sticky imagery beside a scrolling 说明栏; both visible together through the itinerary.
2. Scrolling itinerary rows reversibly drives upright → crop → plate → boxes → notes (notes only when text exists).
3. A second reveal detail crossfades the sticky image; it does not open a second fullscreen runway.
4. Idle soft-settles to a stage row.
5. Reduced motion shows final plate + boxes without scrub.
6. Legacy records unchanged.
7. Page does not read as an empty sticky demo: every held beat has a line of stage copy in the reading column.

## Out of scope

- Filling missing `marks.note` content (content task for 唱片管理员 / Rolf).
- Loupe, list crop, tombstone.
- Scroll libraries (GSAP ScrollTrigger, Lenis, etc.) unless a later plan explicitly revisits.
- Restyling the whole site to the dealt olive / Imbue sheet.

## Taste / reference note

Direction dealt: **split-stage** (seed recorded in `.taste-skill/records-scrub` locally during brainstorm; not required in-repo). Signature motion on the sheet was slow crossfade; adapted as detail-to-detail image change. Palette/type redrawn to existing catalog tokens.
