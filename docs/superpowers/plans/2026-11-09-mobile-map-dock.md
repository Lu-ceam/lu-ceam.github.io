# Mobile map-dock（地图底缘悬浮控件）
> Worker: writing-plans, test-driven-development, systematic-debugging, verification-before-completion. Single serial owner.
> **This round is docs only**: Task 0 contract surfaces are frozen here + Task 1+ are cut into checkboxes. **No `src/` product file is touched**, no PR is opened, no layout PASS is claimed.
> Branch `mobile-map-dock`, **plan base** `origin/main` `434de183022e370a6221a580f395cbabd7fe6344` (#184 compact chrome + soft Keep). This is the base the *plan* was cut from; the implementation base is whatever tip this branch is rebased onto when the implementation gate opens (see Implementation gate / D17).

**Goal:** on the narrow map chapter, 导览／游线／探索 + 播放／重播／‹› become **one paper-colored single row floating inside the map's bottom edge** (`map-dock`); the chrome column carries **no controls at all**; the bottom bar keeps **chapters only**; the station blurb (and therefore the reading) wins back the vertical height the two control rows (`≈99px`) used to hold.

**Architecture:** the *same* seven buttons, the *same* `data-traj-*` hooks, and one DOM node move — the single `.traj-controls` block is relocated at runtime from `.traj-narr` (chrome column) into `.traj-map-wrap` (map column) **only while the compact map chapter owns it**, and put back on `releaseMap`/`parkMap` (the same lifecycle the reader already uses for the map root itself). No second control instance, no portal framework, no new gesture owner, no new Leaflet map, no second bottom bar. Geometry numbers live in one contract module so CSS, Astro and the source/runtime gates cannot drift.

The template keeps `.traj-controls` where it is today (inside `.traj-narr`) so the **default and desktop** order (map → narration → controls) is untouched. A permanent move would reorder desktop to map → controls → narration — that is exactly the D15 regression this plan forbids.

**Tech Stack:** Astro, TypeScript, CSS, Leaflet 1.9, `node:test` via `node --experimental-strip-types --test`, CDP runtime gate (`scripts/lib/cdp-browser.mjs`), `astro check`, `astro build`. Node 22.23.4.

**Contracts:** Task 0 below (export names, DOM hooks, CSS variables, fixture shape) — frozen in this document now, materialised as `src/data/map-dock.ts` + `src/data/map-dock.test.ts` when the implementation gate opens.
**Lanes:** one serial lane (write sets are not disjoint: markup, CSS and client all live in the same three files).
**Serial:** dock pixel locks (§10 P2 items first), then one integration checkpoint.
**Branch:** `mobile-map-dock` (plan base `434de18`). Do **not** share a tree or a PR with `shared-real-time-axis` (#187). The implementation base is the rebased tip at gate time, **not** `434de18` — with #187 merged this branch carries the 58px year column and `年份未核`, and that tip is the baseline every comparison (D15/D17, and the `--disc-year-rail-w` arithmetic behind S5/T4.3) refers to.

---

## Five questions
- **Known problem:** after #184 the compact chrome is intentionally two rows × 44 (`≈99px`) inside the chapter chrome column, so the station blurb is capped at `5.6em` while the map gets the rest. The earlier single-row-inside-chrome proposal (B) put a second, equally-weighted tool band on top of the chapter bottom bar; the site owner called it ugly (t356u).
- **Benefit now:** the blurb gains `≥+40px` against A and `≥ B`; the map keeps `share ≥ 0.48`; the bottom bar is unambiguously one thing (chapters); the map's bottom edge stops being dead cream.
- **Cost / non-goals:** no desktop (`≥48rem`) change, no chapter-rail redesign, no title slot (`--disc-settled-h: 44px`), no year-axis anatomy, no unknown-time branch, no new gesture FSM, no feature removal into an overflow menu, no real-device gate.
- **Worth it:** yes — the control band is not a second navigation surface, it is map chrome; putting it on the map removes the double-bottom-bar read entirely.
- **Simpler option chosen:** move the existing node and re-skin it in the compact block. No duplicate markup, no portal, no JS layout engine.

## Global Constraints (verbatim from PRD §4–§7)

Authoritative spec: `/home/box/web-layout/prd-map-controls-single-row.md` **full text** (§10 P2 是应修项，不挡方向).
Demo (reference only — **never** a product PASS, never copied into production): `/workspace/map-controls-single-row-demo/`, `http://127.0.0.1:4480/` (default C), self-check `node qa/measure-geometry.mjs` → `qa/geometry.json` `passAll=true`.

PRD §4 (C 规格):
1. **位置**：绝对贴 `#map-wrap` 底内侧；390 左右 ≥8–12px、底 ≈8–10px；不压年轴触点（dock 只在 map 列）。320 列宽≈252＝7×36，左右贴齐靠描边分界（见 §10 P2-1）。
   > 实现注记（本票）：`252` 是 demo 的 44px 年轴假设；#187 合入后年轴 58px，320 地图列只有 **262**，扣掉 dock 自身侧距/内距后 `7×36` 会溢 4px。算宽必须用 rebase 后的 `--disc-year-rail-w`，降压顺序见 T4.3（先 padding/gap/竖隔，触点不低于 36）。
2. **形态**：单行 nowrap；纸色底＋1px 淡边；raised ≤ `0 2px 8px`／ink 8%；禁毛玻璃、大阴影、气球堆。
3. **分组**：左模式三段（seg 一体）｜右运输（播／重播／‹›）；中 1px 竖隔或 gap；勿七枚均分成「又一条底栏」。320 去掉 seg 外框／竖隔以免溢出。
4. **触点**：390 目标 ≥44（为过 §10 P2-2 的 overflowX 可降至 ≥40，非 320 档不得低于 40）；320 ＝36＋完整 `aria-label`+`title`；禁折行；禁主路径横滑。
5. **高度**：dock 自身 ≤48；**不计入** narr chrome —— blurb 相对 A ≥＋40px；相对 B ≥ 或持平。
6. **地图 share**：`mapH/paneH ≥ 0.48` 不倒退；几何用 map 容器外框（dock 叠上不偷 pane 外高）。
7. **探索**：dock 可淡化，仍可点退出；勿挡 pinch/drag 主区（底缘条带可接受）。
8. **短文**：`is-short` 无空滚；长文原生 overflow；手势契约本票不改。
9. **题槽／底栏章节／桌面 ≥48rem／年轴 unknown**：不动；不与 `shared-real-time-axis` 同 PR。

PRD §7 (禁止): 为单行砍掉播放／重播或塞进溢流出菜单当唯一入口；用减小地图地板＜180 或 share＜0.48 换文字；玻璃／紫渐变／emoji 图标；与年轴 unknown／精准 sentinel 迁移混进同一发布单元；改生产仓／开 PR／声称产品 PASS（Demo 过 ≠ 产品 PASS）。

Additional hard constraints for this ticket:
- **禁改 `src/`** in this round (plan + docs only).
- **禁与 #187／`shared-real-time-axis` 同 PR／同工作树**：that branch already rewrites `src/components/TrajectoryMap.astro`, `src/components/trajectory-map-client.ts`, `src/styles/global.css`, `src/data/disc-chapters.ts`.
- **禁双底栏回潮**（map-dock 之外不得再有一条同权工具带）、玻璃／紫渐变、砍功能进 overflow 菜单当唯一入口。
- **禁合 main、禁声称布局 PASS、禁真机门禁**（真机／`visualViewport`／Leaflet 扩高闪帧按 PRD §6 属非门禁的「明确未验」）。

### Demo reference numbers (C column) — measurement reference, NOT acceptance
| 壳 | layout | controlsH | blurbClientH | share | dockOnMap | btnMin | overflowX |
|---|---|---|---|---|---|---|---|
| 390×844 | A 两行 | 103 | 84 | 0.537 | false | 44 | false |
| 390×844 | B 弃 | 48 | 128 | 0.557 | false | 44 | false |
| 390×844 | **C** | 48 | **150** | 0.604 | true | 44 | **true（P2-2，实现须修）** |
| 320×568 | A 两行 | 99 | 78 | 0.568 | false | 44 | false |
| 320×568 | B 弃 | 44 | 119 | 0.568 | false | 36 | false |
| 320×568 | **C** | 42 | **140** | 0.568 | true | 36 | false |

---

## Scope self-check

| Path | Owner | Forbidden here |
|---|---|---|
| `src/components/TrajectoryMap.astro` | this ticket (markup + compact row block) | **shared with #187 — implementation gated** (see Implementation gate) |
| `src/components/trajectory-map-client.ts` | this ticket (compact/dock state only) | **shared with #187 — implementation gated** |
| `src/styles/global.css` | this ticket (compact map-chapter block only) | **shared with #187 — implementation gated** |
| `src/data/map-dock.ts` (new), `src/data/map-dock.test.ts` (new) | this ticket | — (no #187 overlap; #187 adds `trajectory-time/axis*.ts` only) |
| `scripts/map-dock.runtime.test.mjs` (new) | this ticket | existing `map-compact.runtime.test.mjs` assertions stay (they describe A); new dock gates go in the new file |
| `src/pages/records/[id].astro`, `src/data/disc-chapter-reader.ts` | **nobody this ticket** | chapter rail, pane/transition owner, `data-map-chrome` handoff stay as-is |
| `src/data/map-compact-chrome.ts` | **nobody this ticket** | the two-row contract values stay published (A/B remain the comparison baseline); the dock publishes its own module |
| `docs/superpowers/plans/2026-11-09-shared-real-time-axis.md`, year-axis/unknown data paths | **#187** | untouched |

No second writer. One branch, one owner, serial.

### 禁改边界（硬边界，越界即本票 FAIL）

| 面 | 具体 | 依据 |
|---|---|---|
| 年轴 | `.traj-year-rail`、`.traj-year-axis/-pins/-dot/-y`、`--disc-year-rail-w`、`--rail-*`、`yearRailPins/yearRailOffset`；含 #187 的 58px 两车道与点车道命中 | PRD §4.9 |
| unknown 时间 | `timeStatus`／`timeNote`／`年份未核` 入口、sentinel 拒绝、domain／chrono 收窄 | PRD §4.9／§7 |
| 题槽 | `--disc-settled-h: 44px`、`.traj-title` 薄单行、`data-disc-*` 题槽动画 | PRD §4.9 |
| 底栏章节 | `.disc-chapter-rail`、`data-chapter-goto`、`aria-current`、翻章手势／`#183` arm 桥 | PRD §4.9／§5 |
| 桌面 ≥48rem | 桌面 `.traj-controls` 单行排版、`.traj-map` 高度带、`display: contents` 包裹层 | PRD §4.9／§6.6 |
| 地图地板／share | `COMPACT_MAP_MIN_PX=180`、`COMPACT_MAP_MIN_SHARE=0.48`、`grid-template-rows` 单一业主 | PRD §7 |
| 手势契约 | `blurbGestureOwner`、`INTERACTIVE_SELECTOR`、48px 确认／2px 抖动、一次手势一站 | PRD §4.8 |
| 章节壳 | `.disc-chapters` 行分配、`handoffMap/releaseMap/parkMap`、200ms 转场、`traj:show`／`traj:stage-layout` | PRD §4.9 |
| 依赖边界 | 不与 `shared-real-time-axis`（#187）同 PR／同工作树／同 commit | 本票 brief |

---

## Implementation gate（实现启动条件）

Every `src/` task below is **blocked** until **one** of these is true:

- **G1** `shared-real-time-axis` (#187) merges into `main`, **and** this branch is `git rebase`d onto that merge commit; or
- **G2** #187 explicitly yields `src/components/TrajectoryMap.astro`, `src/components/trajectory-map-client.ts`, `src/styles/global.css` (written hand-off, in the PR thread), and this branch rebases onto the resulting `main`; or
- **G3** this branch's author rebases onto a `main` that already contains the #187 change and re-runs Task 0's contract test — the three files must show no unresolved `trajectory-axis` / `data-traj-year-label-lane` / `timeStatus` expectations.

Until then: this plan file and this ticket's own docs are the only writable paths. Do **not** open a PR that touches those three files from this worktree.

---

## Task 0 — Frozen contract surfaces

> Frozen **in this document** this round. The code half (module + contract test) is Task 0a and needs the gate above; it is listed here so the seams are already decided and no lane re-invents them.

### 0.1 DOM ownership and hooks

| Hook | Element / class | Writer | Reader | Note |
|---|---|---|---|---|
| `.traj-controls` | existing block (`<div class="traj-controls">`) — **one node, moved at runtime** | template: `TrajectoryMap.astro` (stays inside `.traj-narr`); runtime: client appends it to `.traj-map-wrap` only while compact | CSS, client | never duplicated; never two instances; restored on release/park |
| `[data-traj-dock]` (new attribute on the same node) | `.traj-controls[data-traj-dock]` | client, only while docked | CSS (dock skin), tests, source gate | **presence** is the switch (no value needed); absent ⇒ A layout (chrome column, two rows) |
| `#map-wrap` → `.traj-map-wrap` | map column wrapper | `TrajectoryMap.astro` | CSS (`position: relative` in dock mode) | existing class, no rename |
| `[data-traj-controls-home]` (new, `chrome` \| `map`) | `.traj-controls` | client | tests / a11y audit | makes "which column holds it" assertable without reading DOM order |
| `.traj-narr` | chrome column | unchanged | CSS | in dock mode it must **not** contain `.traj-controls` |
| `[data-traj-guide\|chrono\|explore\|play\|replay\|prev\|next]` | buttons | unchanged | client (unchanged selectors) | **all seven hooks keep working verbatim** |
| `.traj-controls-label` | inner label span | unchanged | client (`playLabel`/`exploreLabel`) | 320 icon-only path still hides these, aria stays |
| `.traj-controls-modes` / `.traj-controls-transport` / `.traj-controls-seg` / `.traj-nav-pair` / `.traj-controls-sp` | structure | unchanged | CSS | dock reuses them; `display: contents` desktop path stays |
| `.disc-chapter-rail` (`data-chapter-goto`) | chapter bottom bar | `src/pages/records/[id].astro` | reader/CSS | **not touched**; chapters only, exactly as today |
| `.traj-year-rail[data-traj-year-rail]` | year column (grid col 1) | `TrajectoryMap.astro` | client/CSS | **not touched**; dock lives in grid col 2 only |
| `.leaflet-control-attribution` | Leaflet bottom-right | Leaflet | CSS | dock must not cover it (see 0.4 assertion D7) |
| `.leaflet-control-zoom` | Leaflet top-left (explore only) | Leaflet | CSS | out of the dock band |
| `.traj-blurb` + `is-short`/`is-long` | blurb | client | CSS | dock mode raises the cap only (0.3) |

**Where the move happens:** `src/components/trajectory-map-client.ts`, in the existing compact-chapter path (`traj:show` / `data-map-chrome='compact'`), *never* in the chapter reader. The reader keeps owning `data-map-chrome` and the chapter transition; the trajectory root keeps owning where its own chrome sits. Desktop (`≥48rem`) and non-chapter pages never see `[data-traj-dock]`.

### 0.2 Exported names (frozen signatures)

```ts
// src/data/map-dock.ts — new module; pure arithmetic, no DOM, no clock, no viewport reads.

/** 390-class shell: floating dock inside the map's bottom edge. */
export const DOCK_INSET_X_PX = 10;          // §4.1 「左右 ≥8–12」
export const DOCK_INSET_Y_PX = 9;           // §4.1 「底 ≈8–10」
/** 320-class shell: §10 P2-1 — 2–4px side inset (not flush, not a 999 balloon). */
export const DOCK_INSET_X_NARROW_PX = 3;
export const DOCK_INSET_Y_NARROW_PX = 8;
/**
 * Touch tiers. 390 **target** 44; where 44 breaks D11 (no H scroll), §10 P2-2 lets the
 * non-320 tier step down to `DOCK_TOUCH_MIN_PX` = 40 — never below, never by horizontal
 * scrolling. 320 = 36–38 (36 preferred) and is the only tier allowed under 40.
 */
export const DOCK_TOUCH_PX = 44;
export const DOCK_TOUCH_NARROW_PX = 36;
export const DOCK_TOUCH_MIN_PX = 40;
export const DOCK_TOUCH_MIN_NARROW_PX = 36;
/** Dock's own height budget (§4.5) and the map-share floor it may not buy text with (§4.6). */
export const DOCK_MAX_H_PX = 48;
export const DOCK_MAP_MIN_SHARE = 0.48;
/** Blurb cap in dock mode (§4.5: ≥A+40px, ≥B). 10em ≈ 150px @390, 140px @320. */
export const DOCK_BLURB_MAX_EM = 10;
/** Raised shadow ceiling (§4.2) — anything stronger is a fail. */
export const DOCK_SHADOW_BLUR_PX = 8;
export const DOCK_SHADOW_Y_PX = 2;
/** Narrow breakpoint mirrors `@media (max-width: 359px)`; gap ladder for §10 P2-2. */
export const DOCK_NARROW_MAX_PX = 359;
export const DOCK_GAP_PX = 8;
export const DOCK_GAP_MIN_PX = 4;

export type DockTier = 'wide' | 'narrow';

/** One nowrap row's total width: button widths + gaps. */
export function dockRowWidth(buttons: readonly number[], gap?: number): number;

/** Which tier a pane width lands in: narrow < 360, wide ≥ 360 (390-class). */
export function dockTier(paneWidthPx: number): DockTier;
/** Button edge for a tier (§4.4). */
export function dockTouchSize(tier: DockTier): number;
/** Side/bottom insets for a tier (§4.1 + §10 P2-1). */
export function dockInsets(tier: DockTier): { x: number; y: number };
/**
 * 7 buttons + 6 gaps inside the available column width, nowrap (§4.3/§4.4).
 * `availablePx` = map column width − 2 × inset. Returns the arithmetic result only.
 */
export function dockRowFits(input: {
  tier: DockTier;
  availablePx: number;
  buttons: readonly number[];
  gap?: number;
}): boolean;
/** Shrinks the gap (then the mid-tier touch, down to DOCK_TOUCH_MIN_PX) until it fits; null when even the floor overflows. */
export function dockRowPlan(input: {
  tier: DockTier;
  availablePx: number;
  labels: readonly number[];
  gap?: number;
}): { gap: number; touch: number; width: number } | null;
/** Map share from the map container box (§4.6): dock overlays inside, so the box is not reduced. */
export function dockMapShare(input: { paneHeightPx: number; mapHeightPx: number }): number;
/** Blurb gain vs the two-row baseline A and vs the chrome single row B (§4.5). */
export function dockBlurbGain(input: { dockPx: number; aPx: number; bPx: number }): {
  vsA: number;
  vsB: number;
  passA: boolean;
  passB: boolean;
};
```

`src/data/map-compact-chrome.ts` is **not** amended: `COMPACT_CONTROL_ROWS = 2` etc. stay as the A/B baseline the dock is measured against.

### 0.3 CSS variable and size-container ownership

```css
/* global.css — inside the existing `@media (max-width: 47.99rem)` compact map-chapter block */
.disc-chapter-map .traj[data-map-chrome='compact'] .traj-map-wrap {
  position: relative;              /* the dock's containing block; the *only* owner */
}

/*
 * Dock-scope variables live on the traj root (a common ancestor of both the map column
 * and the narration column), NOT on `.traj-controls`. The blurb is a *sibling* of the
 * controls: a custom property declared on the controls can never reach it.
 */
.disc-chapter-map .traj[data-map-chrome='compact']:has(.traj-controls[data-traj-dock]) {
  --dock-inset-x: 10px;
  --dock-inset-y: 9px;
  --dock-touch: 44px;
  --dock-blurb-max: 10em;
  --dock-h: 48px;
}

.disc-chapter-map .traj[data-map-chrome='compact'] .traj-controls[data-traj-dock] {
  position: absolute;
  inset-inline: var(--dock-inset-x);
  bottom: var(--dock-inset-y);
  max-height: var(--dock-h);
  z-index: 3;                      /* above the map canvas, below the chapter rail */
}

/* Reader: the blurb reads the variable from the traj root it inherits from. */
.disc-chapter-map .traj[data-map-chrome='compact']:has(.traj-controls[data-traj-dock]) .traj-blurb {
  max-height: var(--dock-blurb-max);
}
```

| Variable | Writer (element) | Reader |
|---|---|---|
| `--dock-inset-x`, `--dock-inset-y` | `.traj[data-map-chrome='compact']:has(…[data-traj-dock])` — the **traj root**, common ancestor | `.traj-controls[data-traj-dock]`; `@media (max-width: 359px)` overrides on the same root element (3px/8px) |
| `--dock-touch` | same traj root | `.traj-controls[data-traj-dock] button` (`min-width`/`min-height`); `@media (max-width: 359px)` writes 36px; mid tier (360–389) writes 40px when 44 breaks D11 |
| `--dock-blurb-max` | same traj root | `.traj-blurb` in dock mode (`max-height`) — **must** be declared on an ancestor of the blurb, never on `.traj-controls` |
| `--dock-h` | same traj root (`48px` = `DOCK_MAX_H_PX`) | `.traj-controls[data-traj-dock]` `max-height`; Leaflet attribution offset for D7 |

**Size container:** none is introduced. The measured box is already the map column's grid cell; the dock is `position: absolute` inside it, so it **must not** add `container-type` and must not republish a width. `--disc-year-rail-w` keeps its single owner.

Row allocation is **not** touched: `.traj[data-map-chrome='compact'] .traj-stage { grid-template-rows: minmax(180px, 1fr) auto; }` (owned by `TrajectoryMap.astro`'s narrow block) stays exactly as #184 left it. In dock mode the narration row simply lost `≈99px`, so the map row (`1fr`) **grows** — that is the whole point, and it means the map container box genuinely changes size on the dock transition (see D16: the `invalidateSize` decision follows the measured box, not an assumption). No new `grid-template-rows` write, no second owner.

### 0.4 Frozen acceptance assertions (what Task 1+ must prove)

Layout (all measured on `dist`, real Leaflet, headless CDP — same harness as `scripts/map-compact.runtime.test.mjs`):

- **D1** exactly one Y row for the seven buttons at 390 and at 320 (`new Set(buttonRects.map(b => b.top)).size === 1`).
- **D2** `dockOnMap === true`: `.traj-controls` is a descendant of `.traj-map-wrap`.
- **D3** `controlsInChrome === false`: no `.traj-controls` inside `.traj-narr`, and `.traj-narr` height no longer includes a control row.
- **D4** chrome column has **zero** `.traj-controls` nodes; the bottom rail still has exactly the chapter buttons (`data-chapter-goto` count unchanged, labels unchanged).
- **D5** touch: 390 **target** every button `44×44`; when 44 cannot fit without horizontal scroll (D11), the 360–389 tier may step down to **≥40** (`DOCK_TOUCH_MIN_PX`) per PRD §10 P2-2 — and the PR must state which tier shipped 44 and which shipped 40. 320 every button `36–38` (36 preferred) **and** each has `aria-label` + `title` (icon-only path). Floor: **never <40** outside the 320 tier, **never <36** at 320, and never traded for `overflow-x: auto`.
- **D6** insets: `mapRect.bottom - dockRect.bottom ∈ [8, 12]`; `dockRect.left - mapRect.left ≥ 8` and `mapRect.right - dockRect.right ≥ 8` at ≥360; at 320 both sides `∈ [2, 4]` (§10 P2-1).
- **D7** dock does not cover Leaflet chrome. Note the stacking context: `.traj-map { z-index: 0 }` already makes the whole Leaflet canvas a stacking context, so the dock (`z-index: 3` inside `.traj-map-wrap`) sits above **every** Leaflet control regardless of Leaflet's internal `z-index: 1000`. Therefore the attribution must be moved by us: `.leaflet-bottom { bottom: calc(var(--dock-h, 48px) + var(--dock-inset-y) + 4px) }` in the compact dock rule (or the attribution is reparented visually to the map's top-right). Assertion: `elementFromPoint` at the centre of `.leaflet-control-attribution` returns the attribution or a descendant, **and** its rect does not intersect the dock rect; `.leaflet-control-zoom` (explore only) is inside the map and outside the dock rect. Hiding the attribution is **not** acceptable (licence obligation).
- **D8** `dockH ≤ 48`.
- **D9** `mapShare ≥ 0.48` measured as `mapH / paneH` on the map **container** box (dock overlaying inside must not shrink it) at 390 and 320, long-station and short-station.
- **D10** long station: `blurbClientH_C ≥ blurbClientH_A + 40` and `≥ blurbClientH_B` (same viewport, same station).
- **D11** no horizontal scroll on the main path: `dock.scrollWidth - dock.clientWidth ≤ 1`, `documentElement.scrollWidth - innerWidth ≤ 1`, and specifically **§10 P2-2**: 390/375 must report `controlsOverflowX === false` (the demo's `true` is the P2 item this ticket must not ship).
- **D12** short station: `is-short` present, `scrollHeight === clientHeight`, no scrollbar chrome; long station: `overflow-y: auto` and native inner scroll still works (**no** `-webkit-line-clamp`).
- **D13** gesture ownership unchanged: a touch starting on a dock button never steps a station and never commits a chapter (`ownsInteractiveGesture` → `.traj-controls` still in `INTERACTIVE_SELECTOR`, `.traj-controls` still inside `.traj-stage` so `listOwnsGesture` short-circuits); `traj:gesture` for a dock-origin touch is absent.
- **D14** explore mode: dock dimmed (`opacity ≤ 0.8`) and still clickable; a pinch/drag that starts in the map's main area is not intercepted by the dock band.
- **D15** desktop `≥48rem` unchanged: no `[data-traj-dock]`, `data-map-chrome` never set (the chapter shell does not mount there), `.traj-controls` still inside `.traj-narr` and still one row, map height in the pre-ticket band, `--disc-settled-h: 44px` untouched, no scrollbar.
- **D16** `invalidateSize` follows the **real** map-container box, not an assumption. Moving the controls out of `.traj-narr` gives the `1fr` map row the freed height, so the map container **does** change size on the dock transition — the correct contract is: measure the map box before and after the dock move; if (and only if) either dimension changed, exactly one extra `invalidateSize` must fire for that transition, and `traj:show` / `traj:stage-layout` keep their existing single calls. Assert the count **as a function of the measured box delta** (e.g. via a `ResizeObserver` on `.traj-map`, cross-checked against the `invalidateSize` probe): `boxChanged ⇒ invalidatesOnTransition === 1`, `boxUnchanged ⇒ invalidatesOnTransition === 0`. Writing a flat "no third call" rule is forbidden — the map box is expected to grow.
- **D17** year axis and unknown branch untouched: `.traj-year-rail` width, `--disc-year-rail-w`, label texts (incl. `年份未核` when #187 has landed) identical to the **implementation-start tip** (i.e. the rebased base once the implementation gate opens — with #187 merged that base has the 58px column and `年份未核`, and those are the expected values). The `434de18` snapshot is a *pre-#187* reference only and must not be re-asserted as the truth.

Source gates (`src/data/map-dock.test.ts`, `node --experimental-strip-types --test`):
- **S1** `global.css` compact block contains the dock rule and **no** second `grid-template-rows` write for the map chapter.
- **S2** `TrajectoryMap.astro` holds exactly **one** `.traj-controls` element (count of `class="traj-controls"` === 1) and all seven `data-traj-*` hooks.
- **S3** no `controls` node inside any `.traj-narr` in dock mode — asserted at runtime (D3), not by regex, because the node is relocated.
- **S4** forbidden tokens absent from the dock rule: `backdrop-filter`, `blur(`, any `linear-gradient` with purple/violet hue, `border-radius: 999px` **with** `inset-inline: 0` (the 320 full-width balloon §10 P2-1 forbids).
- **S5** the row plan's arithmetic passes on the **product's** map column, and that column is **not** a hard-coded `pane − 44`. The rail width is whatever `--disc-year-rail-w` resolves to on the *rebased implementation tip*: `44px` on a pre-#187 base (`346`@390 / `276`@320, #184's measured column), **`58px` once #187 lands** (`332`@390 / **`262`@320**) — and `#187`'s Task 4 may widen it further. So S5 is written as: read the live `.traj-year-rail` width `rail` from the DOM (or `getComputedStyle(...).getPropertyValue('--disc-year-rail-w')`), compute `available = paneW − rail − 2 × inset − 2 × 1px border − 2 × side padding` (borders and padding count — omitting them is how a "fits" test ships an overflow), then assert `dockRowPlan()` is non-null at 390, 375 **and** 320. Known tight cases from 0.4/T4.3: 320 with the 58px rail leaves only **2px** slack at t36; 375 with the 58px rail needs t40 plus padding/gap reduction (P2-2). Hard-coding 252 or 276 is forbidden — a green test on the wrong column width is worse than a red one.

### 0.5 Fixture shape

```ts
// src/data/map-dock.test.ts (Task 0a)
export type DockFixture = {
  id: 'cs6785' | 'falp381' | 'mhjl329';
  viewport: { w: 320 | 375 | 390; h: 568 | 812 | 844 };
  station: { place: string; index: string; long: boolean };
  expect: {
    dockOnMap: true;
    rows: 1;
    /** 390 target 44; 40 allowed by §10 P2-2 when 44 breaks D11. 320 = 36–38. */
    touchMin: 36 | 40 | 44;
    touchTarget: 36 | 44;
    dockMaxH: 48;
    mapShareMin: 0.48;
    blurbGainVsA: number;
    overflowX: false;
  };
};

export const primaryDock: DockFixture;   // cs6785 / london-kingsway-1966 / 04 of 05 @390×844, long
export const narrowDock: DockFixture;    // cs6785 same station @320×568, long
export const shortDock: DockFixture;     // falp381 / bonn @320×568, short (no empty scroll)
export const midWidthDock: DockFixture;  // cs6785 @375×812 — the §10 P2-2 overflow case
```

Task 0a asserts field types and `primaryDock.id`; the geometry numbers belong to Task 4/5, not to the contract test.

### Task 0 steps (docs half — this round)

- [x] Read PRD full text (§4–§10), the demo `index.html` dock rules and `qa/geometry.json`, #184's compact block, `map-compact-chrome.ts`, `disc-chapter-reader.ts` handoff, the gesture allow-list (`INTERACTIVE_SELECTOR`) and the existing CDP runtime gate.
- [x] Freeze 0.1 hooks, 0.2 signatures, 0.3 CSS variables + "no new size container / no new row-allocation owner", 0.4 D1–D17 + S1–S5, 0.5 fixtures **in this document**.
- [x] Record the implementation gate (G1/G2/G3) and the §10 P2 items as required, not optional.
- [x] Cut Task 1+ into test → change → verify → PR → layout hand-off.

Nothing else is decided here. Any later contract change is an amendment to **this** Task 0 on the shared base (keep the names, add fields beside them, rebase every open worktree).

### Task 0a steps (code half — blocked by the Implementation gate)

- [ ] Create `src/data/map-dock.test.ts` with the failing contract test (exports exist, constants equal 0.2, fixture field types, `primaryDock.id`).
- [ ] Run it and see it fail (`ERR_MODULE_NOT_FOUND` for `./map-dock.ts`).
- [ ] Create `src/data/map-dock.ts`: constants + typed stubs throwing `Not implemented: <name>`.
- [ ] Run the contract test and see it pass.
- [ ] Commit `feat(traj): publish mobile map-dock contract surfaces` on the shared base (one commit, before any lane work).

---

## Serial lane (single owner — write sets overlap, so no sibling lanes)

### Task 1 — Failing gates first

**Writes:** `scripts/map-dock.runtime.test.mjs` (new) and/or additive subtests in `scripts/map-compact.runtime.test.mjs`; `src/data/map-dock.test.ts`.
**Reads:** Task 0 names.
- [ ] T1.1 Write runtime assertions D1–D14 + D16 against `dist` (reuse `scripts/lib/cdp-browser.mjs`: `startStaticServer`, `launchBrowser`, `Input.dispatchTouchEvent`). Reuse the existing `openMapChapter`/`measure` helpers by importing them if they are extracted; otherwise duplicate the two helpers into the new file — do **not** refactor the #184 gate file.
- [ ] T1.2 Write D15 (desktop no-regression) and D17 (year-axis unchanged) as **diff-shaped** assertions against the **implementation-start tip** — i.e. the commit this branch is rebased onto when the gate opens (with #187 merged, that tip carries the 58px column and `年份未核`, so those are the expected values). `434de18` may be used only as a *pre-#187* snapshot for the map-height band and other #184-era values; do **not** hard-code its 44px rail width or its year-label texts as the truth.
- [ ] T1.3 Add source gates S1–S5 to `src/data/map-dock.test.ts`, with S5 reading the live rail width / `--disc-year-rail-w` instead of a literal `44`/`252`/`276`.
- [ ] T1.4 Run: `npm run build` then `node --experimental-strip-types --test src/data/map-dock.test.ts scripts/map-dock.runtime.test.mjs` → record the **red** output (expect D1–D14 failing; the map-dock node does not exist yet).
- [ ] T1.5 The **production compact contract changes from A (two rows in chrome) to C (dock on map, zero controls in chrome)**, and this ticket must not hide that behind "A stays green":
  - The old "production must be two rows" assertions in `src/data/map-compact-chrome.test.ts`, `disc-shell-chrome.source.test.ts`, `disc-chapters.source.test.ts` are **superseded for the production path**. Either (a) relax them to reference-only fixtures that assert the A *comparison* shape, or (b) migrate the A assertions into a dedicated comparison fixture and add a **new production assertion** (`dockOnMap === true`, `controlsInChrome === false`, one row) to the same files.
  - Whichever option is chosen, the ticket is not done while any test still claims "the product compact chrome is two rows". Record in `## Outcome` the exact list of superseded assertions and where the C replacement lives.
  - `COMPACT_CONTROL_ROWS = 2` survives only as the **A/B measurement baseline** used by D10 — it is not a statement about the shipped layout.

### Task 2 — Runtime relocation + dock attribute (compact only)

**Writes:** `src/components/TrajectoryMap.astro` (only if a hook/comment is needed), `src/components/trajectory-map-client.ts`.
- [ ] T2.1 Record the node's original position at mount (`const chromeHome = controls.parentElement`, `const chromeNext = controls.nextElementSibling`) so the restore is exact — same idiom as the reader's `trajHome`.
- [ ] T2.2 On the compact handoff (`traj:show` while `root.dataset.mapChrome === 'compact'`, i.e. after the reader has stamped it), do once per entry: `mapWrap.append(controls)` (last child, after `.traj-rail`), then `controls.dataset.trajDock = ''`, `controls.dataset.trajControlsHome = 'map'`. Keep class names, the two row wrappers, `traj-controls-seg`, `traj-nav-pair`, `traj-controls-sp`, and all seven `data-traj-*` hooks byte-identical — the move must not touch a single attribute the client reads.
- [ ] T2.3 On `releaseMap`/`parkMap` (surface it as the existing `traj:pause`/`traj:show` pair — the reader already dispatches both; add a `traj:release` only if `traj:pause` proves ambiguous) and on any non-compact `traj:show`, restore: `chromeNext ? chromeHome.insertBefore(controls, chromeNext) : chromeHome.append(controls)`, then `delete controls.dataset.trajDock; delete controls.dataset.trajControlsHome`. Restore must be idempotent and must not run when already home.
- [ ] T2.4 Because the node now lives in the map column while docked, confirm the **default/desktop** path is untouched (D15): the template still renders it inside `.traj-narr`, so desktop order stays map → narration → controls; only the compact map chapter sees it in the map column.
- [ ] T2.5 Run T1's gates; expect D2/D3/D4 green in structure, dock skin still failing (no CSS yet). Note that D13 (gesture ownership) must already be green here — `.traj-map-wrap` is inside `.traj-stage`, so `listOwnsGesture`/`ownsInteractiveGesture` still short-circuit on `.traj-controls`.

### Task 3 — Dock skin + blurb height (§4.2–§4.5, §10 P2-2/P2-3)

**Writes:** `src/styles/global.css` (compact map-chapter block only).
- [ ] T3.1 `.traj-map-wrap { position: relative; }` in the compact block only.
- [ ] T3.2 Dock rule `.traj-controls[data-traj-dock]`: `position: absolute; inset-inline: var(--dock-inset-x); bottom: var(--dock-inset-y); flex-direction: row; flex-wrap: nowrap; align-items: center; justify-content: space-between; gap: 8px; padding: 2px 4px; max-height: var(--dock-h); background: var(--bg-elevated); border: 1px solid color-mix(in srgb, var(--line) 85%, var(--text)); border-radius: 999px; box-shadow: 0 2px 8px color-mix(in srgb, var(--text) 8%, transparent); z-index: 3;`. The dock variables themselves are declared on the traj root (0.3), not here.
- [ ] T3.3 Grouping per §4.3: left `modes` seg (one `seg`, pressed = ink fill / paper text), right `transport` (play/replay + `‹ ›` pair), one 1px vertical divider or `gap`. **§10 P2-3**: drop the mode seg's own outer border — keep only the pressed fill, so the dock does not read as two nested rounded boxes.
- [ ] T3.4 Labels: hide `.traj-controls-label` text in the dock only when `--dock-touch` is at the icon tier (320); at 390 keep short visible labels if they fit D11 — if they do not fit, they hide and `aria-label`/`title` carry the name. Never clip a label (no `text-overflow` on a button label).
- [ ] T3.5 **§10 P2-2**: 390/375 must not overflow. Order of levers, in this order: (1) gap 8 → 4 → 0, (2) mode seg border/gap 6 → 0, (3) mid-tier touch 44 → 40 (never below `DOCK_TOUCH_MIN_PX`; the 320 tier is not part of this lever — its floor is 36 and its padding/inset levers come first, see T4.3). **Never** `overflow-x: auto` on the main path. Add `overflow-x: hidden` on the dock as a belt (content must already fit — D11 is the gate).
- [ ] T3.6 Blurb: in dock mode `max-height: var(--dock-blurb-max)` (`10em`), with the variable declared on the **traj root** (see 0.3 — a property on `.traj-controls` cannot reach its sibling `.traj-blurb`), keeping `overflow-y: auto; overscroll-behavior-y: contain; scrollbar-gutter: stable;` and the `is-short`/`is-long` behaviour exactly as #184 wrote it (`is-short` hides scrollbar chrome only, `never` clears max-height). The row cap `fit-content(47%)` for `.is-long` stays; re-measure D10 at 320 — if the cap now clips the gain, raise the cap **only** for dock mode and record the new number in `map-dock.ts` (contract amendment), never by shrinking the map below D9.
- [ ] T3.7 Attribution (D7): `.traj-map { z-index: 0 }` puts the whole Leaflet stacking context *below* the dock, so Leaflet's own `z-index: 1000` cannot save the attribution — raise it explicitly in the compact dock rule (`.leaflet-bottom { bottom: calc(var(--dock-h, 48px) + var(--dock-inset-y) + 4px) }`) while `[data-traj-dock]` is present, or move the attribution to the map's top-right. Do **not** hide it (licence obligation).
- [ ] T3.8 Explore (D14): `[data-traj-dock]` `opacity: 0.72` while `root.dataset.trajView === 'explore'`, back to 1 on `:focus-within`/`:hover`; verify `touch-action` on the dock does not swallow map pan outside its own rect.

### Task 4 — 320 tier and P2 hard cases

**Writes:** `src/styles/global.css` (the existing `@media (max-width: 359px)` block + the dock rule), `src/data/map-dock.ts` if a number is amended.
- [ ] T4.1 **§10 P2-1**: 320 dock gets `--dock-inset-x: 3px` (2–4px) **or** a small bottom-corner radius (`0 0 6px 6px`), still separated by the 1px border. Explicitly **not** `inset-inline: 0` + `border-radius: 999px` (full-width balloon) and **not** a fallback to two rows.
- [ ] T4.2 320 touch `36px` on every button floor (`min-width`/`min-height`), labels hidden, `aria-label` + `title` on all seven (`guide`/`chrono`/`explore` too, not only `‹ ›`).
- [ ] T4.3 320 must not scroll horizontally (D11), and the width budget is **not** `320 − 44`. Two cases, both real:
  - **pre-#187 base:** map column `276 = 320 − 44`; dock border-box `270 = 276 − 2×3`; content `268 = 270 − 2×1px border` (padding 0); `7×36 = 252` → `+16` slack.
  - **#187 merged (58px rail):** map column **`262 = 320 − 58`**; dock border-box `256 = 262 − 2×3`; content `254 = 256 − 2×1px border` (padding 0 at this tier); `7×36 = 252` fits with only **2px** slack — so any wide-tier padding (4px) or full 10px inset leaking into the 320 tier turns it into a ~20px overflow. The 320 rule must therefore zero side padding and the group gap, which Appendix B already does.
  Lever order when it overflows (stop as soon as it fits), in this sequence: **(1)** dock side padding `4px → 0` (`+8`), **(2)** inter-group gap / vertical divider `8px → 0` (`+8`), **(3)** `--dock-inset-x 3px → 2px` (`+2`, still inside P2-1's 2–4px). Only after those do you touch size — and at 320 the floor is `DOCK_TOUCH_NARROW_PX = 36`, never lower, never `overflow-x: auto`. If it still does not fit (e.g. the rail widens past 58), **stop and amend Task 0**.
  **Box arithmetic including borders and padding** (this is the number that decides, not `pane − rail`). The figures below are *nominal* — they assume no shell/chapter horizontal padding and a `58px` rail; the real map column must be **measured** at the implementation tip (if the chapter shell adds padding, the column is smaller than `pane − rail`, e.g. ≈`256` content rather than `262`):

  | case | map column | dock border-box (`−2×inset`) | content (`−2×1px border −2×side padding`) | needed | slack |
  |---|---|---|---|---|---|
  | 320, rail 44, inset 3, padding 0, gap 0 | `276` | `270` | `268` | `252` (t36) | **+16** ok |
  | 320, rail **58**, inset 3, padding 0, gap 0 | **`262`** | **`256`** | **`254`** | `252` (t36) | **+2** ok (razor thin) |
  | 320, rail **58**, inset **10** (wide rule leaked) | `262` | `242` | `232` | `252` | **−20** overflow |
  | 390, rail **58**, inset 10, padding 4, gap 8 | `332` | `312` | `302` | `308` (t44) | **−6** overflow → lever (1)/(2) |
  | 375, rail **58**, inset 10, padding 4, gap 8 | `317` | `297` | `287` | `308` (t44) | **−21** overflow → padding+gap then t40 (`280`) |

  So: at 320 the 58px rail leaves only **2px** slack (any leaked wide-tier padding/inset breaks it); at 390 the `302 < 308` gap is closed by **lever (1)** alone (padding 4→0 recovers 8px), so 390 **keeps `t44`**; at 375 even padding+gap leaves `303 < 308`, so `t40` is genuinely required — that is exactly the case §10 P2-2 authorises. D5's "which tier shipped 44 / which shipped 40" record is therefore mandatory, not optional. Assert the outcome with `dockRowPlan()` **and** the runtime measurement, and record which lever fired per viewport.
- [ ] T4.4 Re-run D1–D17 at 320×568 (long + short station) and 375×812 (the P2-2 width) and 390×844.

### Task 5 — Verify

- [ ] T5.1 `node --experimental-strip-types --test` (whole suite; note the pre-existing `map-compact.runtime` "cs6785 @320 长站文" landing flake documented on #187's plan — reproduce it on the base before blaming this ticket).
- [ ] T5.2 `npm run build` then `node --experimental-strip-types --test scripts/map-dock.runtime.test.mjs`.
- [ ] T5.3 `npm run check` (0 errors) — record exit code.
- [ ] T5.4 Record every command **with cwd + real exit code** in a `## Outcome` section of this plan. Separate "verified" from "inferred"; name what stays unverified (real device inertia, `visualViewport`, Leaflet repaint frame, iOS scrollbar thinness, screen reader order after the relocation).
- [ ] T5.5 Negative control: temporarily restore the dock node into `.traj-narr` (A shape) and prove D1–D3 go red; then revert. (This is the #184-F2 lesson: a gate that cannot fail is not a gate.)

### Task 6 — PR and layout hand-off

- [ ] T6.1 Push `mobile-map-dock`, open **one** PR. Title: `fix(mobile map): map-dock 悬浮地图底缘（单行、chrome 无控件、站文吃回高度）`. Body must cite: PRD `/home/box/web-layout/prd-map-controls-single-row.md` §4–§10, **both** the plan base `434de18` **and** the rebased implementation base (naming whether #187 was in it), the A/B/C demo as *reference only*, the gate that was satisfied (G1/G2/G3), §10 P2-1/P2-2/P2-3 as **fixed**, the superseded A assertions from T1.5, and the unverified list from T5.4.
- [ ] T6.2 PR body states explicitly: **not** a layout PASS; layout PASS is 网页设计's call; real-device gate excluded by brief.
- [ ] T6.3 Do **not** merge, squash, or deploy. Do not touch #187.
- [ ] T6.4 Hand-off note for 网页设计 with the exact matrix: `cs6785` 伦敦 `04/05` (long) and `falp381` 波恩 (short) at 320×568, 375×812, 390×844; plus one desktop 1280 spot check. Include the demo's table (A/B/C) as the *expected trend*, not as acceptance.

---

## Serial — dock pixel locks (spec order, one owner)

1. **Position/insets** (§4.1 + P2-1): 10/9 at 390, 3/8 at 320, never flush with `999` radius.
2. **Form** (§4.2): paper + 1px line + `0 2px 8px`/8% raised; no glass, no big shadow, no balloon stack.
3. **Grouping** (§4.3 + P2-3): left seg / right transport, one divider; no seven-equal-buttons second bottom bar; no nested double radius at 390.
4. **Touch** (§4.4): target 44 at 390 (may step to ≥40 mid-tier per P2-2 only when D11 would otherwise fail), 36 at 320, `aria-label`+`title` whenever the label is hidden.
5. **Height & blurb** (§4.5): dock ≤48, blurb `10em`, gain vs A ≥40px and vs B ≥0.
6. **Map share** (§4.6): ≥0.48 from the container box; never buy text with the 180 floor or the share.
7. **Explore** (§4.7): dimmed, still clickable, main area free.
8. **Short text** (§4.8): no empty scrollbar; long text native overflow; gesture contract unchanged.

Each lock lands with its own gate run; the next lock starts after the previous one's D-assertions are green.

## Integration

- [ ] One checkpoint after Task 4: full suite + `npm run build` + the dock runtime gate + `npm run check`, all exit codes recorded in `## Outcome`.
- [ ] `npm run preview` and live-verify `/records/cs6785/` (long station) and `/records/falp381/` (short station) at 320×568 / 375×812 / 390×844, plus `/records/mhjl329/` at 1280 desktop.
- [ ] Whole-branch diff review: only `src/data/map-dock.ts`, `src/data/map-dock.test.ts`, `src/components/TrajectoryMap.astro`, `src/components/trajectory-map-client.ts`, `src/styles/global.css`, `scripts/map-dock.runtime.test.mjs`, this plan.
- [ ] Explicitly re-check the 禁改 list: year axis / unknown branch / title slot / chapter rail / desktop ≥48rem / map floor 180 / gesture FSM.
- [ ] Layout PASS stays with 网页设计; post-merge soft review references `/home/box/design-critique/post-merge-review-coverage.md` one line (per PRD §8/§11).

## §10 评审 P2（应修，不挡方向）

| # | 项 | 本票处置 | 验收断言 |
|---|---|---|---|
| P2-1 | 320 贴齐 + `radius: 0` 读成「底边贴条」 | 320 用 **3px**（2–4px）左右 inset，或底角微圆；仍靠描边分界；**禁止** 999 全宽气球／回退双底栏 | D6（320 两侧 inset ∈ [2,4]）、S4（禁 `999` + `inset-inline: 0`） |
| P2-2 | 390 自核曾报 `controlsOverflowX=true` | 按序收 gap（8→4）→ seg 边/gap（6→0）→ 中档触点 44→40（≥40 兜底）；**禁止**主路径横滑 | D11（390/375 `controlsOverflowX === false`、`scrollWidth-clientWidth ≤ 1`）、S5 |
| P2-3 | 390 双圆角（mode seg 外框 + dock 外框） | 去掉 seg 外框，只留 pressed 填充（320 已如此）；可选但本票按应修落 | S4 + 目视帧（布局复核） |

## Appendix A — full code for Task 0a (`src/data/map-dock.ts`)

Pure arithmetic; no DOM, no clock, no viewport read. Written in full so Task 0a has no decisions left.

```ts
/**
 * 窄屏地图章 map-dock（PRD /home/box/web-layout/prd-map-controls-single-row.md §4）几何口径。
 *
 * CSS（global.css compact 块）、客户端与源码/运行闸门共用这一组常量，于是
 * 「390 目标 44（可退到 ≥40）」「320 触点 36」「dock ≤48」「share ≥0.48」「320 侧 2–4px」不是四处各写一遍的魔数。
 *
 * 只做算术：不量 DOM、不读视口、不碰时钟。像素与真机惯性仍要 GUI／真机复验，这里不是布局 PASS。
 */

/** 390 级壳：浮在地图底缘内侧。 */
export const DOCK_INSET_X_PX = 10;
export const DOCK_INSET_Y_PX = 9;
/** 320 级壳：评审 P2-1——2–4px 侧内距（不贴齐、也不是 999 全宽气球）。 */
export const DOCK_INSET_X_NARROW_PX = 3;
export const DOCK_INSET_Y_NARROW_PX = 8;
/** 触点档：390 目标 44（为过 D11 可退到 40，P2-2，绝不再低）；320 ＝36。 */
export const DOCK_TOUCH_PX = 44;
export const DOCK_TOUCH_NARROW_PX = 36;
export const DOCK_TOUCH_MIN_PX = 40;
export const DOCK_TOUCH_MIN_NARROW_PX = 36;
/** dock 自身高度上限（§4.5）与它不许用采买文字的 share 地板（§4.6）。 */
export const DOCK_MAX_H_PX = 48;
export const DOCK_MAP_MIN_SHARE = 0.48;
/** dock 态的 5.6em → 10em（§4.5：对 A ≥+40px、对 B ≥ 持平）。 */
export const DOCK_BLURB_MAX_EM = 10;
/** raised 阴影上限（§4.2）：再重就是 FAIL。 */
export const DOCK_SHADOW_BLUR_PX = 8;
export const DOCK_SHADOW_Y_PX = 2;
/** 窄壳断点：≤359px（与 global.css 的 `@media (max-width: 359px)` 同一号）。 */
export const DOCK_NARROW_MAX_PX = 359;
export const DOCK_GAP_PX = 8;
export const DOCK_GAP_MIN_PX = 4;

export type DockTier = 'wide' | 'narrow';

/** 视口（或地图列）宽落到哪一档。 */
export function dockTier(paneWidthPx: number): DockTier {
	return paneWidthPx <= DOCK_NARROW_MAX_PX ? 'narrow' : 'wide';
}

/** 一档的按钮边（§4.4）。 */
export function dockTouchSize(tier: DockTier): number {
	return tier === 'narrow' ? DOCK_TOUCH_NARROW_PX : DOCK_TOUCH_PX;
}

/** 一档的侧／底内距（§4.1 + §10 P2-1）。 */
export function dockInsets(tier: DockTier): { x: number; y: number } {
	return tier === 'narrow'
		? { x: DOCK_INSET_X_NARROW_PX, y: DOCK_INSET_Y_NARROW_PX }
		: { x: DOCK_INSET_X_PX, y: DOCK_INSET_Y_PX };
}

/** 一行 nowrap 的总宽：按钮宽之和 ＋ 间隙。 */
export function dockRowWidth(buttons: readonly number[], gap: number = DOCK_GAP_PX): number {
	if (buttons.length === 0) return 0;
	return buttons.reduce((sum, width) => sum + width, 0) + gap * (buttons.length - 1);
}

/** 这一行在可用宽里装得下（nowrap 的算术闸门）。 */
export function dockRowFits(input: {
	tier: DockTier;
	availablePx: number;
	buttons: readonly number[];
	gap?: number;
}): boolean {
	return dockRowWidth(input.buttons, input.gap ?? DOCK_GAP_PX) <= input.availablePx;
}

/**
 * 按 P2-2 的降压顺序收：先 gap 8→4→0，再非 320 档触点 44→40（不破 40；320 档不参与这级）。
 * `labels` 是每枚按钮的**标签宽**（不含触点下限），`touch` 是这一档的触点。
 * 装不下就返回 null——调用方必须把 null 当失败（不许 `overflow-x: auto`）。
 */
export function dockRowPlan(input: {
	tier: DockTier;
	availablePx: number;
	labels: readonly number[];
}): { gap: number; touch: number; width: number } | null {
	const baseTouch = dockTouchSize(input.tier);
	const floor = input.tier === 'narrow' ? DOCK_TOUCH_MIN_NARROW_PX : DOCK_TOUCH_MIN_PX;
	const buttons = (touch: number) => input.labels.map((label) => Math.max(label, touch));
	for (const gap of [DOCK_GAP_PX, DOCK_GAP_MIN_PX, 0]) {
		const touch = baseTouch;
		const width = dockRowWidth(buttons(touch), gap);
		if (width <= input.availablePx) return { gap, touch, width };
	}
	for (let touch = baseTouch - 2; touch >= floor; touch -= 2) {
		const width = dockRowWidth(buttons(touch), 0);
		if (width <= input.availablePx) return { gap: 0, touch, width };
	}
	return null;
}

/** 地图占章盒内容高（§4.6）：dock 叠在容器**内部**，不缩容器外框。 */
export function dockMapShare(input: { paneHeightPx: number; mapHeightPx: number }): number {
	if (!(input.paneHeightPx > 0)) return 0;
	return input.mapHeightPx / input.paneHeightPx;
}

/** 站文增高：对 A（两行 chrome）与 B（chrome 单行）各多少（§4.5）。 */
export function dockBlurbGain(input: { dockPx: number; aPx: number; bPx: number }): {
	vsA: number;
	vsB: number;
	passA: boolean;
	passB: boolean;
} {
	const vsA = input.dockPx - input.aPx;
	const vsB = input.dockPx - input.bPx;
	return { vsA, vsB, passA: vsA >= 40, passB: vsB >= 0 };
}
```

## Appendix B — full code for Task 3 (dock skin block)

Goes **inside** the existing `@media (max-width: 47.99rem)` compact map-chapter block in `src/styles/global.css`, after the current `.traj-controls` rules. Nothing outside that block changes.

```css
/* map-dock（PRD map-controls-single-row §4）：浮在地图底缘内侧的单行纸色条。 */
.disc-chapter-map .traj[data-map-chrome='compact'] .traj-map-wrap {
	position: relative;
}

/*
 * dock 作用域变量写在 traj 根（地图列与旁白列的**共同祖先**），不写在 .traj-controls 上：
 * 介绍带 .traj-blurb 是控件的**兄弟**，写在控件上的自定义属性永远传不到它。
 */
.disc-chapter-map .traj[data-map-chrome='compact']:has(.traj-controls[data-traj-dock]) {
	--dock-inset-x: 10px; /* 320 档写 3px */
	--dock-inset-y: 9px;
	--dock-touch: 44px; /* 360–389 为过 D11 可写 40px，不得更低 */
	--dock-blurb-max: 10em;
	--dock-h: 48px;
}

.disc-chapter-map .traj[data-map-chrome='compact'] .traj-controls[data-traj-dock] {
	position: absolute;
	inset-inline: var(--dock-inset-x);
	bottom: var(--dock-inset-y);
	display: flex;
	flex-direction: row;
	flex-wrap: nowrap;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
	padding: 2px 4px;
	margin: 0;
	max-height: var(--dock-h);
	background: var(--bg-elevated);
	border: 1px solid color-mix(in srgb, var(--line) 85%, var(--text));
	border-radius: 999px;
	box-shadow: 0 2px 8px color-mix(in srgb, var(--text) 8%, transparent);
	overflow-x: hidden; /* 皮带：内容本该已装下（D11 才是闸门），不许当主路径横滑用 */
	z-index: 3;
}

/* P2-3：390 不叠双圆角——模式 seg 去外框，只留 pressed 填充。 */
.disc-chapter-map .traj[data-map-chrome='compact'] .traj-controls[data-traj-dock] .traj-controls-modes .traj-controls-seg {
	border: 0;
	background: transparent;
	gap: 4px;
}

.disc-chapter-map .traj[data-map-chrome='compact'] .traj-controls[data-traj-dock] .traj-controls-row {
	display: flex;
	flex-wrap: nowrap;
	align-items: center;
	gap: 8px;
	min-height: 0;
}

.disc-chapter-map .traj[data-map-chrome='compact'] .traj-controls[data-traj-dock] .traj-controls-transport {
	padding-left: 8px;
	border-left: 1px solid var(--line);
}

.disc-chapter-map .traj[data-map-chrome='compact'] .traj-controls[data-traj-dock] button {
	min-width: var(--dock-touch);
	min-height: var(--dock-touch);
	padding: 0;
	border-radius: 999px;
}

.disc-chapter-map .traj[data-map-chrome='compact'] .traj-controls[data-traj-dock] button[aria-pressed='true'] {
	background: var(--text);
	color: var(--bg-elevated);
	border-color: var(--text);
}

/* 探索：淡化但仍可点退出（§4.7）。 */
.disc-chapter-map .traj[data-map-chrome='compact'][data-traj-view='explore'] .traj-controls[data-traj-dock] {
	opacity: 0.72;
}

.disc-chapter-map .traj[data-map-chrome='compact'][data-traj-view='explore'] .traj-controls[data-traj-dock]:focus-within,
.disc-chapter-map .traj[data-map-chrome='compact'][data-traj-view='explore'] .traj-controls[data-traj-dock]:hover {
	opacity: 1;
}

/* dock 挡住的 Leaflet 归属行往上抬（D7）：`.traj-map{z-index:0}` 让整个 Leaflet 栈在 dock 下面。 */
.disc-chapter-map .traj[data-map-chrome='compact'] .traj-map-wrap:has(.traj-controls[data-traj-dock]) .leaflet-bottom {
	bottom: calc(var(--dock-h) + var(--dock-inset-y) + 4px);
}

/* 站文吃回控件高（§4.5）：封顶 5.6em → 10em；变量从 traj 根继承（见上）。 */
.disc-chapter-map .traj[data-map-chrome='compact']:has(.traj-controls[data-traj-dock]) .traj-blurb {
	max-height: var(--dock-blurb-max);
}

/* 320（P2-1 + §4.4）：侧 3px、触点 36、去 seg 外框与竖隔，靠 1px 描边分界。 */
@media (max-width: 359px) {
	.disc-chapter-map .traj[data-map-chrome='compact']:has(.traj-controls[data-traj-dock]) {
		--dock-inset-x: 3px;
		--dock-inset-y: 8px;
		--dock-touch: 36px;
	}

	.disc-chapter-map .traj[data-map-chrome='compact'] .traj-controls[data-traj-dock] {
		/* 320 地图列：pre-#187 276；#187（58px 轴）后 **262**，dock 盒 256、内宽 248，`7×36=252` 溢 4px。
		   降压顺序（T4.3）：侧 padding 4→0、组间 gap／竖隔→0、inset 3→2（不突破 P2-1 的 2px 下限）；触点不得低于 36。 */
		gap: 0;
		padding: 2px 0;
		border-radius: 0 0 6px 6px;
	}

	.disc-chapter-map .traj[data-map-chrome='compact'] .traj-controls[data-traj-dock] .traj-controls-label {
		display: none;
	}

	.disc-chapter-map .traj[data-map-chrome='compact'] .traj-controls[data-traj-dock] .traj-controls-transport {
		padding-left: 0;
		border-left: 0;
		gap: 0;
	}

	.disc-chapter-map .traj[data-map-chrome='compact'] .traj-controls[data-traj-dock] .traj-controls-modes .traj-controls-seg {
		gap: 0;
	}
}
```

Note the `:has()` uses: they key off the dock attribute so the A path (no dock) keeps `5.6em`, keeps the untouched attribution and keeps the un-docked controls — that is what makes the A/B comparison in Task 1 meaningful. Both the dock variables and the blurb/attribution offsets hang off `:has(.traj-controls[data-traj-dock])` on the **traj root**, so the blurb (a sibling of the controls) actually inherits `--dock-blurb-max`. `:has()` is already used by #184 (`.traj-stage:has(.traj-blurb.is-long)`), so no new support surface is introduced.

## Appendix C — Task 2 relocation code (client)

```ts
/** dock 只在 compact 地图章里挂：节点真搬进地图列，离开时按原位放回。 */
const mapWrapEl = root.querySelector<HTMLElement>('.traj-map-wrap');
const chromeHome = controlsEl?.parentElement ?? null;
const chromeNext = controlsEl?.nextElementSibling ?? null;

function dockControls(): void {
	if (!controlsEl || !mapWrapEl) return;
	if (controlsEl.parentElement === mapWrapEl) return;
	mapWrapEl.append(controlsEl);
	controlsEl.dataset.trajDock = '';
	controlsEl.dataset.trajControlsHome = 'map';
}

function undockControls(): void {
	if (!controlsEl) return;
	delete controlsEl.dataset.trajDock;
	delete controlsEl.dataset.trajControlsHome;
	// 无 chromeHome 就无处可放；有 chromeHome 时，**没有 next 兄弟也照样还原**（append）。
	// 现站 `.traj-controls` 通常是 `.traj-narr` 的末子，`chromeNext === null` 才是常态。
	if (!chromeHome) return;
	if (controlsEl.parentElement === chromeHome) return;
	if (chromeNext && chromeNext.parentElement === chromeHome) {
		chromeHome.insertBefore(controlsEl, chromeNext);
	} else {
		chromeHome.append(controlsEl);
	}
}
```

`undockControls()` 与 T2.3 同语义：`chromeHome` 是唯一前置条件，`chromeNext` 只决定「插在谁前面」；`chromeNext === null`（或它已不在 `chromeHome` 里）时落到 `append`，也就是现在的末子位置。

`dockControls()` runs from the existing `traj:show` handler (`if (root.dataset.mapChrome === 'compact') dockControls(); else undockControls();`), and `undockControls()` also runs from the `traj:pause` handler next to `bridge.reset()`. Note `controlsEl` is the existing `.traj-controls` query — the current code queries buttons individually, so this adds one `root.querySelector('.traj-controls')`; no other selector changes.

## Risks / explicitly not covered

- **Attribution overlap** is not in the PRD; D7 is added here because the dock floats exactly over `.leaflet-control-attribution`. If D7 cannot be satisfied without moving the attribution, that is a design decision for 网页设计, not a silent hide.
- **Relocation vs. a11y reading order:** moving the node out of `.traj-narr` changes the DOM order; the chapter rail is a separate `<nav>` so this does not merge navigation surfaces, but screen-reader order is **not verified** this round (no real-device/AT gate).
- **`#187` merge order:** with #187's 58px two-lane column the 320 map column drops to **262** (`dock box 256`, inner 248) — 4px short of `7×36 = 252` once padding and a divider are counted. Lever order is padding → gap/divider → inset 3→2 (T4.3); the touch floor is not the first lever. All `pane − rail` arithmetic must be re-derived from the merged `--disc-year-rail-w` at the implementation tip, never from a literal 44/252/276 — this is why the implementation gate exists.
- **Old A contract tests are superseded, not "kept green":** `map-compact-chrome.test.ts` / `disc-shell-chrome.source.test.ts` / `disc-chapters.source.test.ts` currently assert *production* two rows. After this ticket the production claim is C (dock on map, zero controls in chrome); A survives only as the D10 comparison fixture. T1.5 names the two allowed dispositions and requires the superseded list in `## Outcome`. Leaving them green without a C replacement would let a test suite claim the product is still A.
- **`invalidateSize`:** the dock move grows the `1fr` map row, so the map container **does** change size; D16 asserts a call exactly when the measured box changes, not a blanket "no extra call".
- **Demo ≠ product:** every number in the demo table above is reference; the acceptance numbers are D1–D17 measured on `dist`.
