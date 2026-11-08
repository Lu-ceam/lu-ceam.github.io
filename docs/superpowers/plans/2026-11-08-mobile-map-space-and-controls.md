# Mobile map space and controls
> Worker: executing-plans, test-driven-development, systematic-debugging, verification-before-completion. Single serial owner. Plan+implementation on one isolated branch; do not merge.

**Goal:** on narrow map chapter compact chrome, map fills remaining chapter height; station blurb scrolls natively inside a fixed narr band; mode/transport controls are intentional two nowrap rows.
**Architecture:** CSS stage ownership + markup row hooks + blurb scroller joins existing #183 release-arm bridge (no second arm).
**Tech Stack:** TypeScript, Astro, CSS, node:test, Leaflet.
**Branch:** mobile-map-space-and-controls from origin/main `59f446917a9ebb14a180359b929b02fe28193f4a`.

## Five questions
- Known: compact map floors at ~132px with empty cream under controls; blurb line-clamp:3 truncates; flex-wrap orphans ›.
- Benefit: map share ≥48% of chapter; full blurb readable via native overflow; tidy two-row controls.
- Cost/non-goals: no desktop traj, full-site map page, 44px title slot, crop/marks/scrub, multi Leaflet, new visual system, demo SVG map/test panel into prod, bare html/body 100vh, real-device gate.
- Worth: yes — PRD+demo PASS from 网页设计; layout PASS then squash.
- Simpler: CSS+markup+existing arm ownership; no new gesture FSM.

## Global Constraints
Authoritative: `/home/box/web-layout/prd-mobile-map-space-and-controls.md` FULL TEXT (esp. §3–8, §11–12, P2). Demo only at `/workspace/mobile-map-space-demo/` and `http://127.0.0.1:4430/?v=r2final`; GUI frames `/workspace/demo-review-4430-r3/`. Do **not** copy demo SVG map, test panel, or metric badges into production. Inherit #183 boundary (48px confirm, ≤2px jitter, settled+end, endpoint release-then-new). No Shell browser/Playwright/CDP claims of layout PASS. No CloudAgent/Mac/peer/deploy/merge. Parent opens PR after green gates.

## Scope (serial — shared CSS/Astro/client)
Paths: `src/styles/global.css` (compact map block ~2894–3033), `src/components/TrajectoryMap.astro` (controls structure + optional icons), `src/components/trajectory-map-client.ts` (blurb owner + invalidateSize reuse), existing #183 tests + new geometry/nowrap/blurb overflow tests. Do not edit other paths without decision. No parallel second writer.

## Task 0 — Freeze contract surfaces
- [x] Read full PRD + demo QA notes; inspect compact CSS, TrajectoryMap controls, blurb wiring, existing invalidateSize/show paths, #183 arm bridge.
- [x] Freeze hooks below in this plan before consumer behavior; contract tests first (stubs/hooks → green) then Task1+.

### DOM / data hooks
| Hook | Writer | Reader |
|---|---|---|
| `.traj-controls` + new `.traj-controls-modes` (guide/chrono/explore) + `.traj-controls-transport` (play/replay + `.traj-nav-pair`) | `TrajectoryMap.astro` | CSS compact rules; a11y |
| keep `[data-traj-guide\|chrono\|explore\|play\|replay\|prev\|next]` | Astro | client (unchanged selectors) |
| `[data-traj-blurb].traj-blurb` | Astro + client text | CSS overflow; client gesture owner |
| optional `data-blurb-short` / class `is-short` on blurb when `scrollHeight<=clientHeight` | client | CSS hide meaningless scrollbar only — **never** remove max-height |
| `data-map-chrome='compact'` + existing `data-traj-view` | existing | CSS |
| year labels `.traj-year-y` | Astro | CSS — full year or intentional abbrev (`'66`); never clipped mid-digit |

### CSS ownership (compact only, `<48rem` map chapter)
- Stage: `.traj-stage { grid-template-rows: minmax(180px, 1fr) auto; }` (or narrow variant `minmax(180px,1.15fr) / minmax(0,0.95fr)` for 320 share≥0.48).
- Map: `.traj-map { height:100%; min-height:180px; }` — floor 132→180; true height from 1fr.
- Narr/card/controls: `flex:none` so narr does not collapse under map; controls paper-backed under card.
- Blurb: always `max-height: 5.6em; overflow-y:auto; overscroll-behavior-y:contain; scrollbar-gutter:stable;` — drop `-webkit-line-clamp`. Short: `is-short` only hides scrollbar chrome, keeps max-height.
- Controls: two rows, each `flex-wrap:nowrap`; row1 modes; row2 transport+nav; touch ≥44; 320 may icon-only with `aria-label`+`title`.
- Year rail: readable full year or intentional abbrev; do not shrink rail text into «约 19»-style clips to chase share — squeeze map/narr fr first. Narrow rail width tweak OK if years stay complete.
- Forbidden: `html,body{height:100vh}` bare; demo SVG; test panel.

### Client signatures (extend existing; no parallel arm)
```ts
/** Call after compact stage size changes (chapter show / transition end). Reuse existing show paths. */
function invalidateMapAfterStageLayout(map: L.Map): void;

/** Classify blurb overflow; sets is-short when content fits. Never clears max-height. */
function syncBlurbOverflow(el: HTMLElement): void;

/**
 * Blurb native scroll joins #183 owner: mid-scroll clears arm, no station/chapter step.
 * At edge: this gesture only arms; release then new same-dir uses existing confirm.
 * Explore: map pan/pinch wins; blurb-at-edge does NOT step station.
 * Same gestureId must not double-commit with map station path.
 */
```

### Fixture shapes (tests)
```ts
type CompactGeometryFixture = {
  id: 'mhjl329' | 'falp381' | 'cs6785' | 'hzel700';
  viewport: { w: 390 | 320; h: number };
  expect: {
    mapShareMin: 0.48;
    mapMinPx: 140;
    blurbOverflow: boolean; // long true / short false
    controlsRows: 2;
    yearLabelComplete: true;
  };
};
```

## Task 1 — Compact geometry CSS + markup rows
- [x] Failing geometry/source tests: map floor 180, stage rows, no line-clamp, two-row hooks, nowrap.
- [x] Implement Astro two-row structure; compact CSS per §3/§11/§12; P2 year labels complete; 320 icon mode keeps aria-label+title.
- [x] Prefer share via map/narr fr, not year truncation.

## Task 2 — Blurb overflow owner + invalidateSize
- [x] syncBlurbOverflow on station change / resize; short vs long.
- [x] Wire blurb into existing gesture owner with #183 arm (clear mid-scroll; edge→arm only; explore no step).
- [x] invalidateSize on chapter show + transition end (reuse existing); regression #183 boundary tests green.

## Task 3 — Acceptance gates + PR prep
- [x] `node --experimental-strip-types --test` green (incl. #183 suite + new asserts).
- [x] `npm run check` + `npm run build` exit 0.
- [x] Local commits; push branch; open PR (title/body cite PRD + baseline 59f4469 + no-device). Report URL+head. Do not merge/squash (parent after layout PASS+CI).
- [ ] Report ≤800 words: paths, commands/exits, head, risks (real-device inertia/visualViewport NOT VERIFIED — not merge blockers).

## Integration
Parent independently samples tests/diff; 网页设计 layout PASS; CI verify; then squash. Soft post-merge design review uses live frames + real Leaflet — never demo/pr-qa.

## Outcome (2026-11-08, worker)

- Contract module: `src/data/map-compact-chrome.ts` (floor 180 / share 0.48 / blurb 5.6em / two 44 rows / year-label fit / blurb gesture owner).
- Gates: `node --experimental-strip-types --test` 602 pass 0 fail; `npm run check` 0 errors; `npm run build` exit 0 (Node 22.23.4 at `~/.local/node-22.23.4/bin`).
- Stage floor moved from a 58vh shell floor to the map row's `minmax(180px, 1fr)`: the 58vh floor plus a content-sized narration band overflowed a 320×568 chapter box.
- Blurb joins the existing `#183` arm as an *observer* (`traj:blurb-scroll` → `boundary` `'blurb-scroll'`), no second FSM.
- NOT VERIFIED: real-device inertia, `visualViewport`, Leaflet repaint after growth, mobile scrollbar thinness (PRD §6). Layout PASS is 网页设计's call.
