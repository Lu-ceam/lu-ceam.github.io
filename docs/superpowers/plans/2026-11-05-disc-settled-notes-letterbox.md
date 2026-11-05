# Plan · disc-settled-notes-letterbox（注文 letterbox 外引）

基线：origin/main `7bbe1a8`（#173）。  
PRD：`/home/box/web-layout/prd-disc-record-settled-notes-letterbox.md`。  
坏例：`/workspace/runway-173-soft/03-settled-elbow.png`。  
Session／branch：`disc-settled-notes-letterbox`。开 PR，**不合入**；PASS＋CI 后编码Bot squash。

## Task0 — 契约面

- 可改：`src/data/disc-chapter-reader.ts`（settled 注文放置／containing block）；相关 CSS（`.disc-record-marks` 勿再 `inset:0` 钉 plate）；必要时薄抽／复用 `detail-display` 的 `placeNotes`／`NOTE_CAP_REM`／`LETTERBOX_BAND_RESERVE_REM`／`LETTERBOX_BREATH_REM`／`NOTE_GAP_REM`；相关源测。
- 根因：窄屏 `.disc-record-marks` 相对 plate `inset:0`＋`max-width:46%` → 注文叠图。
- 钉死：框＋halo 留 plate；注文在 pane 奶油 letterbox／侧带；**注文∩plate＝∅**；虚线肘有可见行程，终点＝注文 stub。
- 勿改：marks／export 字段名；#172 scrub／多 pass；#173 overlay 抬层；桌面 ≥48rem 先盘 letterbox；纸墨壳；merge／force-push／密钥。
- 禁：只缩 `max-width` 仍留 plate 内「少挡一点」。

## Task1 — 测／源闸（红）

- [ ] 源测：settled 路径断言使用 `NOTE_CAP_REM`／`LETTERBOX_BAND_RESERVE_REM`（或等价 import／常量），非硬编码 46% 盖图。
- [ ] 源测：`.disc-record-marks` 不再以 plate 为唯一 containing block 的 `inset:0` 钉死（或等价：placeNotes／bandReserve 接线存在）。
- [ ] 既有 fill-crop／overlay／chapters／detail-display letterbox 测不回归。

## Task2 — 改

- [ ] settled：`plateBox(…, bandReservePx)`，`bandReservePx ≥ LETTERBOX_BAND_RESERVE_REM * rem`。
- [ ] 注文放到 pane letterbox／side（复用 `placeNotes` 语义或抽薄）；多条 `NOTE_GAP_REM` 错开。
- [ ] SVG 框／肘仍在 plate；leader 终点对齐注文 stub（`data-leader-edge` 思路）；禁零长肘。
- [ ] 非 settled／开场／中段仍压 overlay＝0。

## Task3 — 验＋开 PR

- [ ] `node --test src/data/*.test.ts` 绿；能跑则 check。
- [ ] 开 PR 到 main，不合入；回报 URL＋head。
