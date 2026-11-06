# Plan · 站点顶栏 ≥48rem nowrap 收口

- PRD：`/home/box/web-layout/prd-site-header-desktop-nowrap.md`
- Demo（PASS）：`/workspace/site-header-desktop-nowrap-demo/`（qa passAll；cssWrap after=nowrap）
- 父：#179 soft Keep 余票 P2「≥48rem 仍 inherit wrap」
- 基线：origin/main `2020b5c`（#181）
- 分支／worktree：`site-header-desktop-nowrap`
- 单 lane（仅 `global.css` 顶栏块；不拆并行）

## 非目标
不改窄屏 `@media (max-width: 47.99rem)` #179 块；不改 Header DOM；不碰碟页／`--disc-*`／notes／门面文案；不另造 640／641；不汉堡／mega-menu；默认不启桌面横滑／淡边（仅当 @800 短链真溢出再加，并写进 PR）。

## Task 0 · 契约面

### CSS（仅 `src/styles/global.css` 顶栏区，`.site-header`…`main {` 之间）
- [x] 新建（或并入既有）`@media (min-width: 48rem)` 专块：
  - `.header-inner { flex-wrap: nowrap; }`
  - `.nav { flex-wrap: nowrap; }`（或 `.nav-scroll .nav`；须让 `@800/@1280` 计算值为 nowrap）
  - `.brand`／`.theme-toggle { flex: 0 0 auto; }`（或等价 shrink-0）
  - `.nav-scroll` 保持既有 `min-width: 0`（基线已有，勿删）
- [x] **默认不加** `overflow-x: auto`／桌面 `.nav-fade { display:… }`；仅当验收发现 @800 短链 `scrollWidth` 溢出才加，并在 PR 说明。
- [x] 窄屏 `@media (max-width: 47.99rem)` 块：**一字不动**。

### DOM
- [x] 保持 #179：`brand`｜`.nav-scroll`＞`nav`×6｜`#theme-toggle`（配色在 nav 外）。不改 `Header.astro`。

### 源测形状
- [x] 新测 `src/data/site-header-desktop-nowrap.source.test.ts`：
  - 顶栏区内存在 `@media (min-width: 48rem)`，且其内对 `.header-inner`／`.nav`（或 `.nav-scroll .nav`）声明 `flex-wrap:\s*nowrap`
  - 同块内 `.brand`／`.theme-toggle` 含 `flex:\s*0\s+0\s+auto` 或 `flex-shrink:\s*0`
  - 窄屏 `#179` 块仍在且含 `flex-wrap:\s*nowrap`／`overflow-x:\s*auto`（回归）
  - 断点无 `640px`／`641px` 新媒体查询挂在顶栏区
  - 不读／不改 `--disc-*`／`notes.astro`／碟页规则

## Task 1 · RED：先写源测
- [x] 落地源测；`node --test src/data/site-header-desktop-nowrap.source.test.ts` 确认 RED（记退出码）。

## Task 2 · GREEN：桌面 nowrap CSS
- [x] 在顶栏区加 `@media (min-width: 48rem)` 块（概念 CSS 见 PRD）；不动窄屏块、不动 Header。
- [x] 源测转 GREEN。

## Task 3 · 验
- [x] 源测 exit 0；全量 `src/data/*.test.ts` 不回归。
- [x] `npm run check`／`npm run build` → exit 0（Node 不足记环境已知交 CI）。
- [x] 真渲染（dist 预览）：800×800 DPR1 深／浅；1280×800 DPR1 深；抽 390 回归。断言 P1-1…7：
  - P1-1 `getComputedStyle(.header-inner|.nav).flexWrap === 'nowrap'` @800／@1280
  - P1-2 视觉一行；P1-3 theme 不在 nav 内且热区≥44；P1-4 无整页横溢；P1-5 主题翻转；P1-6 @390 headerH 44–52 且 nowrap；P1-7 diff 不含碟页／notes
- [x] 截图＋metrics → `/workspace/site-header-desktop-nowrap-pr-qa/`。若 @800 短链已整页横溢，启用横滑兜底（仍 nowrap）并记入 PR。

## Task 4 · 开 PR（不合入）
- [x] commit＋push；`gh pr create --repo Lu-ceam/lu-ceam.github.io --base main --head site-header-desktop-nowrap`；正文写 PRD／demo、改动摘要、测退出码、真渲染数、是否启用横滑兜底。**不合入、不 force-push main、不 FYI 建站工。**

## 落地记录

- 2026-11-07 · Task0–4 完成（未合入）。
- 改动：`src/styles/global.css` 顶栏区（窄屏块之后、`main {` 之前）新增 `@media (min-width: 48rem)` 22 行：`.header-inner`／`.nav` `flex-wrap: nowrap`，`.brand`／`.theme-toggle` `flex: 0 0 auto`。窄屏 `@media (max-width: 47.99rem)` 块一字未动；`Header.astro` 未改。
- 新测：`src/data/site-header-desktop-nowrap.source.test.ts`（7 用例）。RED → `node --test …` exit 1（4 fail）；加 CSS 后 GREEN → exit 0（7 pass）。
- 全量 `node --test src/data/*.test.ts` → exit 0（452 pass / 0 fail）。
- `npm run check` → exit 0（0 errors / 0 warnings / 4 hints；需 Node ≥22.23.4，本机用 `/tmp/node-v22.23.4-linux-x64/bin/node`，系统默认 22.21.0 会被 Astro 拒绝）。
- `npm run build` → exit 0（pagefind＋internal-field check 通过）。
- 真渲染（dist `npx serve` :4407，Chromium headless DPR1）：@800／@1280 深／浅 + `/blog/` @800：`flexWrap` inner/nav = `nowrap`；视觉一行（六链 top 差 0px）；无整页横溢（scrollW == clientW）；theme 在 nav 外、h=46.2；淡边 `display:none`；主题翻转后 nowrap／headerH 59.8 不变。@390 回归：headerH 51.2、inner/nav nowrap、`.nav-scroll` 在、nav 横滑 auto、无根横溢。
- 边界扫描 390/640/767/768/800/900/1024/1280/1440：≥48rem 一律 nowrap、无折行、无横溢。
- **未启用横滑兜底**（@800 短链 `nav.scrollWidth 359 == clientWidth 359`，无溢出证据）。
- 压力扫描（临时加长六链，仅 QA 脚本注入、未入库）：768／800／1280 仍 nowrap 单行、无根横溢（牌／配色 shrink-0，nav 收窄）。
- 证据：`/workspace/site-header-desktop-nowrap-pr-qa/`（`run-qa.py`／`bp.py`／`stress.py`／`metrics.json`／`boundary-metrics.json`／`stress-metrics.json`＋截图）。
