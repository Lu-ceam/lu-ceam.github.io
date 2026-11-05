# Plan · disc-runway-settled-overlay（settled 肘线可见）

基线：origin/main `62948a0`（#172）。  
对照：设计评审 soft `/workspace/runway-172-soft/`（尤其 `03-settled-elbow.png`）。  
Session／branch：`disc-runway-settled-overlay`。开 PR，**不合入**；PASS＋CI 后编码Bot squash。

## Task0 — 契约面

- 可改：`src/styles/global.css`（settled 态勿压死 `.disc-record-overlay`）；`src/data/disc-chapter-reader.ts`（若需把 overlay 与 marks 同步抬 opacity）；相关单测／源闸。
- 根因：`.disc-record-cover-frame:has(> .crop-window) .disc-record-overlay, … .disc-record-marks { opacity: 0 }`；JS settled 只抬 `.disc-record-marks` → 框＋虚线肘在 overlay 内不画，注文孤悬。
- 勿改：marks／export 字段；竖滑 scrub／多 pass 主路径；纸墨壳；桌面 ≥48rem 先盘大改；merge／force-push／密钥。
- 验收：settled 可见框＋虚线 `.mark-leader`＋注文同屏；开场／中段仍可藏 overlay；无自动播／圆点回归。

## Task1 — 测／源闸（红）

- [ ] 源／单测：settled 路径断言 overlay（或框／肘）在 settled 可见；非 settled 可仍为 0。
- [ ] 既有 fill-crop／marks／chapters 测不回归。

## Task2 — 改

- [ ] settled 时 `.disc-record-overlay` 与 marks 同步 opacity→1（CSS `:has(.is-settled)`／`[data-cover-state=settled]` 或 JS 同抬）。
- [ ] 非 settled 仍压死 overlay（fill→crop 中段不露肘）。

## Task3 — 验＋开 PR

- [ ] 相关测绿；astro check；开 PR 不 merge。
