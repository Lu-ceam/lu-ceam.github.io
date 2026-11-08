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

## Fix round 2 (PR #184 独立验收 b991341：F1／F2／transition-end)

独立验收报告：`/workspace/mobile-map-space-independent-acceptance/b991341/REPORT.md`（末尾「追加」），证据 `indep/evidence2.json`，探针 `indep/probe2.mjs`。它报了三件事：F1 伦敦站到边后多一滑才换站、F2 末站同一手势既滚字又报 `station=true`、两次都没观测到 `traj:stage-layout`。外加 390×700 的 share .447（PRD 矩阵之外）。

### R0 — 先复现，分清「真双 claim」与「探针时序／stale telemetry」（已做完，结论写在这里）
- [x] 用 CDP 真触摸（`Input.dispatchTouchEvent`）复跑伦敦站与末站，**逐 gid** 记 phases／station／probe／起止时刻／该 gid 区间内的 blurb scroll 次数，并等「站真落地」（idx 变化）而不是固定 sleep。
- 结论一（F1 不是多一滑，是读早了＋坐标过期）：伦敦 04/05 逐次滑动的真实顺序是
  `gid1` 滚字 0→75（cancel・station=false）→ `gid2` 滚到边 97→100（cancel・station=false，这一次只到边）→ `gid3` **换站**（end・station=true・scrollInGid=0），站落地 `idx→05/05` 用了 **2626ms**。
  即「到边那次只滚字／只停，松手后的下一次同向手势换站」，与 PRD §4.4 一致。
  独立验收里「第 2、3 次都没换站」有两个测量原因：①每次滑完只 sleep 1000ms 就读状态，而站要 2.6s 才可见；②探针只在开头量一次 blurb 盒子（53px→换站后 84px），后续滑动落在控件上，连桥消息都没有（探针记录为「无变化」）。
- 结论二（F2 是两个 gid 被读成一个）：同一批复现里没有任何 gid 既改过 blurb `scrollTop` 又报 `station=true`（violations=0）。验收看到的 `station=true` 属于**飞行中落稳窗口里的被作废手势**（`beginTop=100`、`endTop=100`，一像素都没滚），滚动发生在紧邻的另一个 gid 上。
  但它暴露了一个真问题：`station` 一个字段承担了两种含义——「这一 gid 被站动作吃掉」和「这一 gid 因地图未落稳而作废」，所以外部无法从消息本身分辨，才读成双 claim。

### R1 — 让桥的 `station` 字段自证（补可观测字段，不改跨章行为）
- [x] `TrapGestureDetail` 增加 `blocked`：`station` 只表示「这一 gid 真被站动作消费」，`blocked` 表示「因地图还在落稳，整次作废」。两者互斥，且 `blocked` 时 `probe` 必须为 null。
- [x] `mapGestureEvents` 的「不许 arm」条件改成 `station || blocked`：reducer 行为逐字不变，只是消息能自证。

### R2 — 到边语义按 PRD §4.3／§4.4 钉进 runtime
- [x] 介绍带滚到边的那一次：只滚字、不换站、不 arm（`scrollInGid > 0` 且 `station=false`）。
- [x] 到边后的下一次同向手势：换一站（不是两次）——用真触摸＋等真落地证明，不用固定 sleep。
- [x] 末站（05/05）向外再滑：只 arm，松手后同向再滑才切邻章（既有 #183 路径，不新增一滑）。
- [x] 不变量：同一个 gid 不许既改 blurb `scrollTop` 又 `station=true`（或 `blocked=true`）。

### R3 — transition-end：分清两条进入路径，拿合同依据而不是删闸门
- 合同依据（`disc-chapter-reader.ts`）：
  - 点章底栏走 `goTo()` → `batchFrame('handoff')` → rAF 里 `handoffMap()` → `traj:show`；**没有 200ms 过渡**，所以不发 `traj:stage-layout`。`traj:show` 的处理里已经 `syncBlurbOverflow()+invalidateSize()+frameDiscOnce()`，量的是搬完 root 之后的最终尺寸。
  - 竖滑／键盘走 `commitChapter()` → 200ms 过渡 → `finish()` 里先 `batchFrame('handoff')`、再 `requestAnimationFrame(() => traj:stage-layout)`。这一路必须有事件，因为尺寸要到过渡结束才定。
- [x] 实测（390×844，真触摸与点选各一次）：goTo 路径 `inv=346×476 @t744,756`、`ev=[show@756]`（无 stage-layout，符合合同）；竖滑切章路径 `ev=[show@3388, stage-layout@3586]`、`inv` 末尾 `346×476 @t3586`（转场 end 按最终尺寸重测）。
- [x] runtime 测试按路径分别断言，两条闸门都留着。

### R4 — 390×700（及 explore 态）只做鲁棒性排查，不新增设计要求
- [x] 量清原因：explore 态站表折行 `.traj-stops-fold` 重新出现，narr 由 250.7 → 312.7（+62px = 44px summary ＋ 18px margin），map 从 331.5 → 269.5；390×700 guide 是 0.549，问题只在 explore。
- [x] 同一原因在 PRD 矩阵内的 320×568 explore 也成立（map 191 / chapter 471.8 = 0.405）。要补到 0.48 需要砍 34px 或改「地图行地板随章盒走」，都超出本票的窄改范围，**不改**，作为已知项上报。
