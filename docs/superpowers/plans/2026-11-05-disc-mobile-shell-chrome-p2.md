# Plan · disc-mobile-shell-chrome-p2（奶油空再收 ≤80）

基线：origin/main `73fdc0f`（#170）。  
对照：`/home/box/web-layout/prd-disc-mobile-shell-chrome-p2.md`；评帧 `/workspace/shell-chrome-170-soft/`（尤其 `01-annotated-gap`／`01-map-guide`）。  
Session／branch：`disc-mobile-shell-chrome-p2`。开 PR，**不合入**；PASS＋CI 后编码Bot squash。

## Task0 — 契约面

- 可改：`src/styles/global.css`（compact `--disc-map-stage-min` 再抬；控件／年轨下空白压缩，让地图／旁白吃空）；必要时收紧 `src/data/disc-shell-chrome.source.test.ts` 下限断言。
- 勿改：`‹ ›` 成对（已过可关）；顶栏 88→44；唱片章 runway；章跟翻；加黑条／近黑垫块／回夹心；轨迹数据冒充布局。
- 验收：PRD PASS 1–3（年轨末墨→底栏 ≤80；舞台明显吃空；CI／桌面无回归）。

## Task1 — 测／源闸（红）

- [x] 源测：compact `--disc-map-stage-min` 下限高于 #170 的 `min(52vh, 380px)`（至少一端更高，例如 ≥54vh 或 ≥400px——以实际能压到 ≤80 为准，写进断言）。
- [x] 既有 `disc-shell-chrome.source.test.ts` 相关用例不破；‹› nowrap 断言保持绿。

## Task2 — 奶油空 ≤80＋舞台吃空（P0）

- [x] 390 导览态、站表折叠：抬 `--disc-map-stage-min`（或等价）和／或压缩控件下／年轨 `padding-bottom`／traj 头距，使**年轨末墨线 → 底栏顶 ≤80px**。
- [x] 同帧：地图舞台视觉吃到近 Tab；勿只缩数字、舞台仍小洞（对照评帧宏洞）。
- [x] **禁止**加黑条、近黑垫块、改回夹心。

## Task3 — 验

- [x] `node --test src/data/disc-shell-chrome.source.test.ts` 绿；相关壳／章测绿。
- [x] `npx astro check` 0 errors（或仓内既有 check 命令）。
- [x] 对照评帧意图声明；桌面 ≥48rem 无回归声明；‹› 不回退。

## Task4 — 开 PR

- [x] push＋`gh pr create`（base main）；报告 URL＋head SHA；**不要 merge**。
