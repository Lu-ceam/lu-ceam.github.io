# Plan: 飞行中航向一行（#189 合后 soft P1）

- 基线：`48215f122dd35e4ae304c9a97cc8e57b7eb74ed7`（#189）
- PRD：`/home/box/web-layout/prd-bearing-heading.md`
- 分支／session：`map-bearing-heading`
- 合入：开 draft PR，**禁止**自己 squash／合 main。布局 PASS＋CI 绿后由网页设计合入。

## 目标

整段飞行（起飞到落稳，陆路和远洋都算）旁白带顶端保持一行深色「航向 → {目的站中文名}」。带高和分界线不动。

## 非目标／禁改

- 分界固定口径、share、dock、底栏、年轴比例
- 回退 #189 已过的簇标签／timeNote／探索退出／320 胶囊
- 把 demo 飞镜状态机搬进生产；不删 `oceanLegPhrase`／`oceanPhraseVisible`（可继续存在，只是不再驱动航向行）
- 用海域名顶替目的地；把箭头写成 `->`
- 飞行未结束用 `is-out`／`opacity:0`／纸色把航向行藏掉

## Task 0 — 契约面（先落再改 client／CSS）

新模块 `src/data/map-bearing.ts` + `src/data/map-bearing.test.ts`：

```ts
/** 航向行文案。箭头必须是 Unicode「→」，禁止 "->"。 */
export function bearingHeading(destCity: string): string;

export type FlightBearingPhase = 'idle' | 'in-flight' | 'settled';

/**
 * 飞行全程（in-flight）必须显示航向行，且不得给卡片加 is-out。
 * 落稳后可清航向、可走既有换站卡淡入（is-out）。
 */
export function shouldShowFlightBearing(phase: FlightBearingPhase): boolean;
export function shouldHoldCardOutDuringFlight(phase: FlightBearingPhase): boolean;
```

行为（本任务就要写成真实现，不要留 `Not implemented`）：

- `bearingHeading('多伦多') === '航向 → 多伦多'`
- `bearingHeading('莱比锡') === '航向 → 莱比锡'`
- 禁止输出含 `->`、禁止输出「大西洋」「太平洋」等海域名（输入已是目的站中文名，函数不做海域替换）
- `shouldShowFlightBearing('in-flight') === true`，`'idle'|'settled' === false`
- `shouldHoldCardOutDuringFlight('in-flight') === false`（飞行中不得加 is-out）

DOM 钩子（已存在，不改名、不搬出旁白卡）：

- `.traj-bearing[data-traj-bearing]` 仍在 `.traj-card` 内
- 飞行中：`card.classList` 含 `is-bearing`、不含 `is-out`；bearing 节点非 hidden、有文案

CSS 变量：不新增分割／share／dock 变量。航向行字色用 `#3a352e`（与 `.traj-blurb` 同墨），`letter-spacing: 0`。

Task 0 单测绿后再开后面任务。

## Task 1 — typography CSS

改 `.traj-bearing`（`TrajectoryMap.astro` 组件样式）：

- `color: #3a352e`（禁止 `var(--traj-muted)`）
- `letter-spacing: 0`（禁止 `0.12em`）
- 默认（含 390 compact）：`15px / 1.75`，与介绍窗同级 serif（已是）
- 在现有 `@media (max-width: 359px)` compact 块（`global.css`，与 `.traj-blurb` 13px／1.65 同断点）为 `.traj-bearing` 设 `13px / 1.65`

源码闸：断言上述色、字距、字阶；断言飞行中 `.traj-card.is-out` 不得把 `.traj-bearing` 透明度打成 0（即：不要为航向行另写 hidden／纸色规则；`.traj-card.is-out { opacity: 0 }` 只允许在落稳换卡时用，client 飞行中不得加该类）。

## Task 2 — `flyTo` 时机与文案

`src/components/trajectory-map-client.ts`：

- 真正进入动画飞行时（非短跳／非 reduceMotion 瞬切），一开始就 `showBearing(bearingHeading(place.city))`，全程保持 `is-bearing`
- **不要**再用 `oceanPhraseVisible` 窗口才显示；**不要**在窗口结束后 `clearBearing()` + `classList.add('is-out')`
- 文案目的站用目的 `place.city`（中文站名，与 `.traj-city` 同源），陆路远洋同一套
- 动画结束后（将落稳／换站卡淡入）再 `clearBearing()`；既有落稳淡入可留
- 取消／中途 abort 仍要清航向，避免脏状态
- `oceanLegPhrase` 可保留进口与地图层既有用法，但不得传入 `showBearing`

改掉 `trajectory-guide.test.ts` 里「client 必须匹配 `oceanPhraseVisible`」这类把旧窗口绑死的断言；改为断言 client 调用 `bearingHeading`、不以 `oceanLegPhrase` 作为 `showBearing` 参数。保留 `oceanLegPhrase`／`oceanPhraseVisible` 函数本身的单测。

## Task 3 — 运行时／源码闸补强

能在现有 `node --experimental-strip-types --test` 里扩的都扩：

- 文案：远洋例「航向 → 多伦多」、陆路例「航向 → 莱比锡」
- 源码：`flyTo` 动画回调内不得在中途 `clearBearing` + `is-out`
- 若已有 compact runtime 测 share／分界：加回归，share 不低于 #189 线上口径（320 0.6397／390 0.7021），分界与同断点落稳 Δ0（≤1px）。不要为航向行改分割写法。

不必在本票重做 Leaflet 飞镜或第二套状态机。真飞行抓帧由布局验收做。

## Task 4 — 验收并开 draft PR

命令（工作树内，记录真实退出码）：

1. `node --experimental-strip-types --test src/data/map-bearing.test.ts`（及相关改动测试）
2. `node --experimental-strip-types --test`（全量或至少本票触及的 test）
3. `npm run check`
4. `npx astro build` 或仓库既有 `npm run build`

然后推分支、开 **draft** PR（base `main`），标题建议：`feat(traj): 飞行中航向一行——全程「航向 → 目的站」`。

PR 正文写清：基线 `48215f1`、改动路径、验收命令+退出码、残余（真机／读屏不在本票）。

**禁止合 main、禁止 force-push、禁止提交密钥。**

## 验收口径（产品，布局会复验）

- 远洋（d37779 莱比锡→多伦多）与陆路（爱森纳赫→莱比锡或同等）飞行中有字，文案含目的站
- 对比 ≥4.5:1（生产纸 `#f5f1e8`，目标 10.78:1），字距实计 0
- 分界与同断点落稳 Δ0（≤1px）；share 不低于 320 0.6397／390 0.7021
- 飞行未结束卡片不得因 `is-out` 把航向行透明掉
