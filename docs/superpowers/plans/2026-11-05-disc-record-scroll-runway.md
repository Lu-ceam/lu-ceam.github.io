# Plan · disc-record-scroll-runway（竖滑 scrub fill→crop · 禁自动播／圆点）

基线：开工时 **最新 origin/main**（至少含 #167 `abc01d2`＋壳 #169/#170；若 P2 奶油空已合则带上）。  
对照：`/home/box/web-layout/prd-disc-record-scroll-runway.md`；demo `/workspace/disc-record-scroll-runway-demo/`。  
Session／branch：`disc-record-scroll-runway`。开 PR，**不合入**；PASS＋CI 后编码Bot squash。

依赖：与 `disc-mobile-shell-chrome-p2` **串行**（共享 `src/styles/global.css`）。P2 开 PR／合入后再动 CSS；本 plan 可先落。

## Task0 — 契约面

- 可改：`src/data/disc-chapter-reader.ts`（去自动播；竖滑驱动 cropT；多 pass 续滑；reduced-motion 直达 settled 仍可换面）；`src/pages/records/[id].astro`（去可见圆点／pager／字 tab；章内 upright／crop／plate；隐藏 `data-cover-side` 可留）；`src/data/disc-cover-crop.ts`（若需对齐 placeOnRunway／stageVisual）；`src/styles/global.css`（章内 runway／肘线窄屏；**勿回退纸墨壳**）；相关 source／单测。
- 相位：对齐 PC `split-stage.ts` — `UPRIGHT_END=0.08`／`ZOOM_END=0.40`／`PLATE_END=0.52`／`DWELL_START=0.64`；几何 `detail-display`／`OPEN_INSET=0.72`／`ZOOM_GAIN=1.25`／`PLATE_CAP=0.92`。
- 勿改：marks／export 字段；章外幽灵 `camera-runway` 双路径；桌面 ≥48rem 先盘主路径；跟翻锁时（票 C）；pinch／± 作验收主路径；黑条／近黑夹心。
- 验收：PRD PASS 1–6。

## Task1 — 测／源闸（红）

- [ ] 源测：无进章 autoplay；无可见圆点／三点／字 tab；有章内 fill-crop DOM；settled 路径含 `.mark-box`／`.mark-leader`／注文（非纯编号题卡）。
- [ ] 单测：fill-crop 几何不回归；桌面 runway 不坏；marks-only 闸门仍绿。

## Task2 — 竖滑 scrub（去自动播）

- [ ] 窄屏唱片章：竖滑连续驱动 cropT 0→1，可反刮。
- [ ] 禁进章／切面自动播 1–2s。
- [ ] `prefers-reduced-motion`：该 pass 可直达 settled；仍可滑换面；不偷偷 autoplay。

## Task3 — 多 pass＝续滑（去圆点）

- [ ] ≥2 reveal：完成一面后继续下滑进下一 pass（仿 PC `--pass-count`＋joint）。
- [ ] 屏幕无切面 UI；`data-cover-side` 可隐藏保留。

## Task4 — settled＝PC 肘线

- [ ] cropT→1／boxes rise 后：框＋虚线 `.mark-leader`＋`mark.note`；勿编号题卡冒充。
- [ ] 无 marks：仅大图＋scrub。

## Task5 — 验＋开 PR

- [ ] 源测／相关测绿；astro check；纸墨壳不回退；桌面零回归声明。
- [ ] push＋`gh pr create`；报告 URL＋head；**不要 merge**。
