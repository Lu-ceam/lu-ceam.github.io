# Plan · disc-mobile-shell-chrome（窄屏壳顶底纸＋墨／顶栏碟名）

基线：origin/main `abc01d2`。  
对照：`/home/box/web-layout/prd-disc-mobile-shell-chrome.md`、`design-disc-mobile-shell-chrome.md`；线框 `/workspace/shell-chrome-prd/demo.html`；证据 `/workspace/falp381-shell-recheck/`。  
Session／branch：`disc-mobile-shell-chrome`。开 PR，**不合入**；PASS＋CI 后编码Bot squash。

并行：`disc-chapter-snap` 独占 `disc-chapter-reader.ts`／`disc-chapters*`——**本票禁碰**。

## Task0 — 契约面（本 commit）

- 可改：`src/pages/records/[id].astro`（窄屏 settled 顶栏信息）；`src/styles/global.css`（顶／底 chrome 纸＋墨、rail）；`src/components/TrajectoryMap.astro`（导览藏「站表 · N 站」、控件一行、奶油空布局）。
- 勿改：`disc-chapter-reader.ts`／`disc-chapters*`；#167 fill→crop DOM；轨迹算法／钉标；桌面 ≥48rem 先盘主路径；加高黑顶交差。
- 验收见 PRD PASS 1–5。

## Task1 — 测／源闸（红）

- [x] 源测或契约测：窄屏顶栏 DOM／模板含碟名（非仅 thumb）；地图态顶／底背景走纸色 token（禁近黑 slab 选择器残留于章节壳）。
- [x] 导览态源码无「站表 · N 站」文案（可留 aria／图标）。
- [x] #167 钩：`data-fill-crop`／无字圆点断言仍绿。

## Task2 — 顶栏碟名（P0-A）

- [x] 窄屏顶栏结构：`[thumb 40×28] 碟名 ellipsis`（高 ≤44 + safe-area）；字段与桌面 settled 同源。
- [x] JS 未就绪仍有静态题／骨架；禁止纯黑空条。

## Task3 — 顶底纸＋墨（P0-B）

- [x] 推荐：四章顶＋底一律 `--paper`／墨；分割线 `--rule`；当前章点 `--accent`。
- [x] 地图章去掉近黑 slab；画布内导览药丸可保留墨底浅字。

## Task4 — 导览一行＋奶油空（P1）

- [x] 导览｜游线｜探索＋播放／重播＋‹› 单行优先；探索不孤行。
- [x] 导览态不渲染「站表 · N 站」。
- [x] 站表折叠后地图 `flex:1`／减 margin；390 高 Tab 上奶油空 ≤~80px。

## Task5 — 验＋开 PR

- [x] 测绿；对照 design §5；桌面目视无回归声明。
- [x] push＋`gh pr create`；报告 URL＋head；**不要 merge**。
