# Plan · 站点顶栏窄屏 running head（折行 148 → ≤52）

- PRD：`/home/box/web-layout/prd-site-header-compact.md`
- Demo（PASS）：`/workspace/site-header-compact-demo/`（qa：after headerH=51.2 wraps=false；desktop 59.8；passAll=true）
- 坏例：`/workspace/hourly-audit/20261107-0202/01-home-390.png`（headerH 148／wraps=true）
- 基线：origin/main `1547293`（#178）
- 分支／worktree：`site-header-compact`
- 单 lane（串行；Header DOM＋global.css 耦合，不拆并行）

## 非目标
不汉堡／抽屉／底部 Tab；不玻璃／胶囊／靛蓝；不发明自我介绍；不碰碟页壳／`--disc-*`／fill→crop／settled-bar／#177／#178；不新建 `/notes/`；不另造 640／641 断点；不改内容 md／路由。

## Task 0 · 契约面（先落，后续不得改签名）

### DOM hooks（`src/components/Header.astro`）
- [x] `header.site-header > .column.header-inner` 三槽：
  1. `p.brand > a`（flex:0 0 auto）
  2. `.nav-scroll`（flex:1 1 auto; min-width:0）内含可选 `.nav-fade--start`／`nav.nav[aria-label=站点]`（6 链）／`.nav-fade--end`
  3. `button#theme-toggle.theme-toggle`（**不在** `nav` 内；flex:0 0 auto）
- [x] 6 链标签不变：首页／文章／标签／唱片／搜索／关于；`aria-current`／`.active`／`inSection` 逻辑保持。
- [x] `#theme-toggle` id 保持（`Base.astro` 主题脚本不改选择器）。

### CSS 归属（仅 `src/styles/global.css` `.site-header` 块）
- [x] 窄屏（`<48rem`／`max-width: 47.999rem` 或等价 nested）：
  - `.header-inner { flex-wrap:nowrap; padding-block:2px; gap 收口；min-height:44px }` → 真渲染 **44≤headerH≤52**（目标≈51）
  - `.nav-scroll` 包住 nav；`.nav { flex-wrap:nowrap; overflow-x:auto; margin-left:0; scrollbar thin／可滑 }`
  - `#theme-toggle` 钉右、不随横滑滚走；`.nav a, .theme-toggle { min-height:44px }`；链可 `min-width:44px` 或保现有水平 padding 但垂直热区 ≥44
  - 可选淡边：`.nav-fade--*` `linear-gradient(var(--bg)→transparent)` 宽 ~18px；`prefers-reduced-motion` 取消 transition
- [x] ≥48rem：`.header-inner`／`.nav` 一行；`.nav { margin-left:auto }`；**不**强制 overflow-x；视觉基本保持现一行（h 允 ≈60）；**勿另造 641px 断点**。
- [x] 禁改：任何 `--disc-*`、`.split-*`、`.record-*` crop／settled／年轨规则。

### 可选轻脚本（同 `Header.astro` inline 或极短片段；主题仍在 Base）
- [x] 淡边：读 `nav.scrollLeft`／`scrollWidth` 写 `.nav-scroll[data-fade-start|end]`（与 demo `updateFades` 同形）；无 JS 时链仍是真 `<a>`。

### 测试 fixture／源测形状
- [x] 新源测 `src/data/site-header-compact.source.test.ts`（或等价）：读 `Header.astro`＋`global.css`
  - theme-toggle **不在** `<nav>` 内；存在 `.nav-scroll`；6 链标签齐全；无汉堡／drawer／notes 入口
  - 窄屏规则含 `flex-wrap:\s*nowrap`、`overflow-x:\s*auto`、`padding-block:\s*2px`（或等价使 ≤52）
  - 断点仅 `48rem`（断言无 `640px`／`641px` 新媒体查询挂在 site-header）
  - 禁碰：源测文件本身不读／不改 `detail-display`／`--disc-settled-h`／crop

## Task 1 · RED：先写源测
- [x] 落地 Task0 源测文件；跑 `node --test src/data/site-header-compact.source.test.ts` 确认 RED（记退出码）。

## Task 2 · GREEN：Header DOM
- [x] 改 `Header.astro`：配色移出 nav；加 `.nav-scroll`＋可选淡边；保留 brand／6 链／`#theme-toggle` id。
- [x] 相关 DOM 断言转 GREEN。

## Task 3 · GREEN：窄屏／桌面 CSS
- [x] 改 `global.css` `.site-header`／`.header-inner`／`.nav`／`.theme-toggle`／`.nav-scroll`／`.nav-fade`；窄屏 nowrap＋横滑＋padding-block:2px；≥48rem 保持一行。
- [x] 源测 CSS 断言 GREEN。不改碟页壳规则。

## Task 4 · 可选淡边脚本
- [x] 若采用淡边：在 Header 或 Base 加极短 scroll 监听（passive）；`prefers-reduced-motion` 无 transition；切主题不丢 `scrollLeft`（主题脚本不动 scroll）。

## Task 5 · 验
- [x] `node --test src/data/site-header-compact.source.test.ts` → exit 0；另跑全量 `src/data/*.test.ts` 确认无回归。
- [x] `npm run check` → exit 0；Node 不足记「环境已知，交 CI」。
- [x] 真渲染：390×844 DPR2 深／浅／scrolled-nav；1280×800 桌面。断言 headerH（减 safeTop）44≤H≤52；wraps=false；链／配色热区高≥44；桌面 wraps=false、无强制横溢；主题翻转文案「浅色」↔「深色」。截图＋metrics → `/workspace/site-header-compact-pr-qa/`。
- [x] 抽读确认 diff **不含** `detail-display`／`--disc-*` 行为改动／`[id].astro` 壳。

## Task 6 · 开 PR（不合入）
- [x] commit＋push `site-header-compact`；`gh pr create --repo Lu-ceam/lu-ceam.github.io --base main --head site-header-compact`；正文写 PRD／demo／坏例、改动摘要、测退出码、真渲染 headerH／wraps／热区、QA 路径。**不合入、不 force-push main。**
- [x] 若 CI lychee 仅因无关外链 bot-challenge（仿 #178）可改 `lychee.toml` exclude；勿改依赖。

## 落地记录

- Task0／1 契约先落：`src/data/site-header-compact.source.test.ts`（8 项：DOM 三槽／6 链／断点只 48rem／热区／reduced-motion／不碰 `--disc-*`）。首跑 RED `# pass 1 # fail 7`（exit 0，node:test 语义）。
- Task2 Header：`.nav-scroll[data-nav-scroll]` 包 nav＋两枚 `.nav-fade`；`#theme-toggle` 移到 `header-inner` 末子（仍在 `header`，`Base.astro` 选择器未改）。
- Task3 CSS：只在 `.site-header` 块内加 `@media (max-width: 47.99rem)`（沿用既有 48rem，无 640／641）；窄屏 `padding-block:2px`＋`min-height:44px`；`.nav` `nowrap`＋`overflow-x:auto`；桌面 `.nav-scroll` 只是 `margin-left:auto` 的包层，`.nav` 原规则不动。
- Task4 淡边：`Header.astro` 内 `<script is:inline>` 极短 passive scroll／resize 写 `data-fade-start|end`；不碰 `data-theme`／`localStorage`（主题仍在 `Base.astro`）。
- Task5 验：`node --test src/data/site-header-compact.source.test.ts` exit 0（8/8）；`node --test src/data/*.test.ts` exit 0（431/431，118 suites）；`npm run check` exit 0（Node 22.23.4，0 errors／4 hints 既有）；`npm run build` exit 0。真渲染（`dist` 预览，playwright chromium 1248，DPR2）：390 深／浅／滚 nav 均 **headerH=51.2、wraps=false**，链 45.9、配色 46.2、牌名 44；桌面 1280 **59.8／wraps=false／无根横溢**；360／430／390 唱片详情＋`/blog/` 同 51.2。截图与 metrics → `/workspace/site-header-compact-pr-qa/`。
- 横滑不裁焦点环：`.nav` `padding:5px; margin:-5px 0`（环 offset 3＋宽 2），焦点 Tab 实测环在 nav 内完整可见。
- 未触碰：`--disc-*`／`detail-display.ts`／`records/[id].astro`／内容 md／路由／依赖；diff 仅 3 文件（Header.astro、global.css、新源测）＋本 plan。
