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

## Fix round 1 (PR #184 layout FAIL on b765bc2)

布局复验 FAIL：MHJL329 @390 map 346×180 / chapter≈748 → share 0.24；@320 map 276×180 / chapter≈472 → 0.38；FALP@320 同 180。报告：`/workspace/layout-review-pr184-b765bc2.md`。

### F0 — 在真实构建上定位高度链（不看 regex、不做纯算术）
- [x] `npx astro build` → 静态服务 dist → headless chromium（`~/.cache/ms-playwright/chromium-1248`）→ 点章节底栏进「地图」章。
- [x] 打印 map / map-wrap / stage / traj / chapter / shell 的 bbox ＋ computed `grid-template-rows`、`flex`、`min-height`、`margin`，并用 CDP `CSS.getMatchedStylesForNode` 列出真正命中的规则与顺序。
- 定位结果（两条同是 `(0,4,0)`，Astro scoped 后注入 → 赢）：
  1. `.traj .traj-stage` 的窄屏 `grid-template-rows: auto minmax(0, 1fr)` 盖掉 global 的 compact `minmax(180px,1fr) auto`，地图行退回 `auto` 并被 `min-height: 180px` 卡住；
  2. `.traj[data-astro-cid-…] { margin-top: 2.5rem }` 盖掉 `.disc-chapter-map .traj { margin-top: 0 }`，章顶多出 45px 空带。

### F1 — 修生产高度（只动 compact 范围）
- [x] 按 F0 的命中规则把**行分配与章顶 margin 的业主搬进 `TrajectoryMap.astro` 自己的窄屏块**（与默认 `auto minmax(0,1fr)` 同一块、同一媒体查询），`global.css` 只留 `flex: 1; min-height: 0`；桌面／其它章、44 题槽、58px 年轴票都没动。
- [x] 源码闸门同步改成「行分配单一业主」：global.css 不许再写 `grid-template-rows`，TrajectoryMap 必须写 `minmax(180px, 1fr) auto`（`disc-shell-chrome.source.test.ts`、`map-compact-chrome.test.ts`）。

### F2 — 真实 DOM/runtime 测试（防高度回归）
- [x] `scripts/map-compact.runtime.test.mjs`＋`scripts/lib/cdp-browser.mjs`：自起静态服务 + headless chromium + CDP（零新依赖，Node 22 自带 `WebSocket`/`fetch`），跑 dist。
- [x] 断言：MHJL/CS @390、@320 与 FALP@320 的 map/chapter/narr/controls bbox，share ≥0.48 且 map >180（并钉「舞台首行＝地图高」，防止行分配再被盖）。
- [x] 断言：CS 伦敦站站简介（非述语章）原生滚到末；带内滚的整次手势不换站；松手后新同向手势走 #183 共用 arm（`dataset.chapterEdge`）。
- [x] 断言：`traj:show` 与转场 end 都真实触发一次 `invalidateSize`，并记录时序。
- [x] 断言：320 年号整字（无裁切）＋图标／文字按钮有 `aria-label`/`title`；1280 桌面无回归。
- [x] 断言：`.leaflet-zoom-animated` 层比地图框高一倍（390 上 952px vs 476px），必须被 `.traj-map{overflow:hidden}` 裁掉——地图下方 8px 处 `elementFromPoint` 不再命中 Leaflet，地图内 8px 处仍命中。
- [x] 反证：把行分配临时放回 global.css（原回归形状）→ `npx astro build` 后 runtime 测试 5 个几何用例 + invalidateSize 用例全红（`not ok 1–5, 8`），确认这套闸门真能抓住 b765bc2 的错法，再改回。
