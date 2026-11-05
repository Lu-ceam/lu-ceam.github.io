# Plan · disc-mobile-shell-chrome-p1（奶油空 ≤80／‹› 成对）

基线：origin/main `bf10c06`。  
对照：`/home/box/web-layout/prd-disc-mobile-shell-chrome-p1.md`；评帧 `/workspace/shell-chrome-169-soft/`。  
Session／branch：`disc-mobile-shell-chrome-p1`。开 PR，**不合入**；PASS＋CI 后编码Bot squash。

## Task0 — 契约面（本 commit）

- 可改：`src/styles/global.css`（`--disc-map-stage-min`／控件区空白／traj 头距；compact `‹ ›` 成对 wrap）；必要时 `src/components/TrajectoryMap.astro`（把 prev/next 包进一组容器以便 `flex-wrap: nowrap` 于对内）。
- 勿改：顶栏 `--disc-settled-h` 88→44；#167 fill→crop；章节跟翻；桌面 ≥48rem 主路径大改；加黑条交差。
- 验收：PRD PASS 1–3。

## Task1 — 测／源闸（红）

- [ ] 源测：窄屏 compact 下 `‹ ›` 同组（同父／同 nowrap 容器，或 CSS 断言禁止孤立 next 换行策略）。
- [ ] 源测／注释契约：`--disc-map-stage-min` 抬高或等价手段，目标导览折叠后奶油空 ≤80（可用 CSS 变量下限断言）。

## Task2 — 奶油空 ≤80（P1-1）

- [ ] 导览＋站表折叠：抬 `min-height`／减控件下空白／压 traj 头距；390 高 Tab 上奶油空 ≤80px。
- [ ] 勿加黑条。

## Task3 — ‹ › 成对（P1-2）

- [ ] compact：`‹` 与 `›` 同排；若 wrap，整对一起下；禁单 `›` 第二行。
- [ ] 可包 `.traj-nav-pair` 或 `flex-wrap`+`flex-basis` 收紧模式／播放行。

## Task4 — 验

- [ ] 源测绿；相关既有测绿；`astro check` 0 errors。
- [ ] 对照评帧意图声明；桌面无回归声明。

## Task5 — 开 PR

- [ ] push＋`gh pr create`（base main）；报告 URL＋head；**不要 merge**。
