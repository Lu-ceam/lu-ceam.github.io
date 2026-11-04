# Plan · disc-chapter-snap（章节跟翻去抖／更敏捷）

基线：origin/main `abc01d2`（PRD `prd-disc-chapter-snap.md` 为准；旧 handoff 仅存档）。  
对照：`/home/box/web-layout/prd-disc-chapter-snap.md`（旧 handoff／acceptance 仅存档）。连行票 chrome 另开，本票不碰 `global.css`／`[id].astro`／`TrajectoryMap*`。  
Session／branch：`disc-chapter-snap`。开 PR，**不合入**；PASS＋CI 后编码Bot squash。

## Task0 — 契约面（本 commit）

- 可改：`src/data/disc-chapter-reader.ts`；必要时 `disc-chapters.ts` 纯函数小改；`disc-chapters.test.ts`／reader 测。
- 本票**不动** `global.css`（overscroll 由 JS `preventDefault` 解决；壳色／chrome 见并行票）、`[id].astro`、`TrajectoryMap*`。
- 勿改：traj 相机／钉 pop；marks／fill→crop／`[id].astro` 唱片章 DOM；四格 IA／文案；桌面 ≥48rem 主路径；「先回弹再确认」或章间 spring／translateY 滑入。
- 验收：`GESTURE_LOCK_MS ∈ [220,260]`（建议 240）；边沿外向 touch 灭橡皮筋后跟翻；一步一章；地图章不拦；桌面零回归；`npm test -- src/data/disc-chapters` 绿；开 PR。

## Task1 — 测（红）

- [x] 锁常量断言改为新区间／240。
- [x] 边沿 `scrollFollowThrough` + 外向 dir → follow 仍一步一章（沿用／补强已有用例）。
- [x] 地图章 `verticalOwner===map`：壳不 `preventDefault`／不 step。
- [x] 跑测确认红点只落在常量／新行为缺口。

## Task2 — 边沿灭橡皮筋＋敏捷 step

- [x] 正文三章：`scrollFollowThrough` 为真且竖向过阈后，在 **`touchmove` 上 `preventDefault`**，勿等橡皮筋。
- [x] 达 `TOUCH_STEP_PX`（可维持 40，或略降至 32）后松手或 move 过阈立刻 `step`；wheel 边沿已有 PD 则核对无「先默认滚再 step」。
- [x] `GESTURE_LOCK_MS`：480 → **240**。

## Task3 — 切章瞬间稳几何

- [x] `step`／`goTo` 前 clamp `scrollTop` 进合法范围，清 overscroll 残差。
- [x] 硬切保留；**禁止**整章 `translateY` 滑入滑出。
- [x] `handoffMap`／`releaseMap` 同一帧 rAF 批完，避免二次 layout 闪。

## Task4 — 验

- [x] `npm test -- src/data/disc-chapters`（及相关）→ 0 fail。
- [x] 源码核对 acceptance 1–4；桌面路径未改。
- [x] 有需要时 `npx astro check`／build。

## Task5 — 开 PR

- [x] commit 分 Task；push；`gh pr create`；报告 URL＋head；**不要 merge**。
