# Plan · disc-shell-title-slot（窄屏四章同壳题槽，禁地图异体制）

基线：origin/main `9ec5f64`（#174）。**派工前须 rebase 到 `disc-text-overlap-p1` tip 或其合入后的 main**（共享 `src/styles/global.css`）。
对照：`/home/box/web-layout/prd-disc-shell-title-slot.md`；证据 `/workspace/shell-chrome-171-soft/01-map-guide.png` vs `03-record-tab.png`。
Session／branch：`disc-shell-title-slot`。开 PR，**不合入**；布局 PASS＋CI 后编码Bot squash；合后 soft＝设计评审抓地图＋邻章顶栏（G0-6）。

## Task0 — 契约面

- 可改：`src/styles/global.css`（仅删 `[data-chapter-kind='map'] .split-settled-bar .record-tombstone h1` nowrap／ellipsis／line-clamp:none 与 `.record-tombstone-meta { display:none }` 特判，≈2421–2436 连注释；必要时确认默认 tombstone 用 `--disc-settled-title`／`--disc-settled-meta`＋line-clamp:2）；`src/data/disc-shell-chrome.source.test.ts`。
- 勿改：字∩字（注文列宽／letterbox、年轨避让）；顶栏 88→44 瘦条；`--disc-settled-h`／`settledBarHeightPx`；#172 scrub／#173 overlay／#174 letterbox；不新发明第二套顶栏。
- 验收：四章（唱片／述语／地图／资料）顶栏同为 小图｜h1 两行 clamp｜meta 两行 clamp；源测禁异体制；CI 绿；桌面 ≥48rem 无回归。

## Task1 — 源测（红）

- [x] 改 `disc-shell-chrome.source.test.ts`：删「地图题一行截断、只有 meta 收起」断言。
- [x] 新断言：global.css 不存在 `[data-chapter-kind='map']` 作用于 `.record-tombstone h1`／`.record-tombstone-meta` 的选择器（或 nowrap／display:none 等价）。
- [x] 新断言：默认 tombstone `h1` line-clamp:2＋`--disc-settled-title`；meta line-clamp:2＋`--disc-settled-meta`。
- [x] 跑测确认 RED。

## Task2 — 删 CSS 特判

- [x] 删 global.css 地图 h1／meta 特判块及其注释。
- [x] 确认默认规则覆盖四章，无其它 kind 特判残留（`rg "chapter-kind='map'.*tombstone"`）。

## Task3 — 验

- [x] `node --test src/data/disc-shell-chrome.source.test.ts` 绿；相关壳／章测绿。
- [x] `npx astro check` 0 errors（或仓内既有 check）。
- [x] 390 窄屏四章顶栏截图自查（地图 h1 可两行＋meta 可见）；桌面无回归声明。

## Task4 — 开 PR

- [ ] push `disc-shell-title-slot`，开 PR（标题：窄屏四章同壳题槽·删地图异体制），正文附 PRD 路径／证据／验收。**不合入**。
