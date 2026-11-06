# Plan · 站点门面去占位（intro／关于／测试帖 draft）

- PRD：`/home/box/web-layout/prd-site-facade-copy.md`
- Demo（PASS）：`/workspace/site-facade-copy-demo/`（qa metrics passAll=true；文案字节级对齐）
- 坏例：`/workspace/hourly-audit/20261107-0302/`（首页占位 intro＋「排版测试」；about「这一页还是占位」）
- 基线：origin/main `8373287`（#179）
- 分支／worktree：`site-facade-copy`
- 单 lane（三处文案／开关；无并行）

## 非目标
不碰 Header／`.site-header`／碟页壳／`--disc-*`／fill→crop／settled／地图；不删 `typography-test.md`；不改其它 md；不新建 `/notes/`；不改 `description`／`title`／`lang`／`url`；不润色文案。

## Task 0 · 契约面（先落，后续不得改签名）

### 文案契约（一字不差，含中文标点）
- [ ] `siteConfig.intro` **精确** = `写一点读过的、听过的；把藏的黑胶整理上架。`
- [ ] `siteConfig.description`／`title`／`lang`／`url` **保持** 现有值（description=`个人站点，收录文章与唱片收藏。`）
- [ ] `about.astro`：`<h1>关于</h1>` 后恰好三段 `<p>`，顺序固定：
  1. `Lu-ceam 是我的个人站：一边写文章，一边把黑胶藏品编目上架。`
  2. `文章偏读后记与听记；唱片区按压片版本整理封面、物述与轨迹。笔记区还在规划，导航里暂不挂出。`
  3. `站点保持纸色与砖色，少装饰，方便长期往里添东西。`
- [ ] 全仓正文不得残留 `这一页还是占位`／旧 intro 占位句
- [ ] `src/content/blog/typography-test.md` **仍存在**；frontmatter `draft: true`（由 `false` 翻）
- [ ] 空态：`index.astro` 既有 `还没有文章。` 分支保留；勿另造口号／空态组件

### 文件边界
- [ ] 可改仅三文件：`src/config.ts`、`src/pages/about.astro`、`src/content/blog/typography-test.md`
- [ ] 禁改：`Header.astro`、`global.css`、碟页／`--disc-*`、其它 content md、路由、依赖、workflows（除非 lychee 无关 bot-challenge 仿 #178）

### 源测形状
- [ ] 新源测 `src/data/site-facade-copy.source.test.ts`：读三文件断言 intro 精确、about 三段精确、无占位句、typography-test 存在且 `draft: true`、config 元数据四键未变

## Task 1 · RED：先写源测
- [ ] 落地 Task0 源测；`node --test src/data/site-facade-copy.source.test.ts` 记 RED（失败项／退出码）

## Task 2 · GREEN：三处改动
- [ ] `src/config.ts`：仅替换 `intro`
- [ ] `src/pages/about.astro`：`<h1>` 后换成三段 `<p>`（字节级；禁残留占位）
- [ ] `typography-test.md`：`draft: false` → `draft: true`（不删文件、不改正文）
- [ ] 源测转 GREEN

## Task 3 · 验
- [ ] `node --test src/data/site-facade-copy.source.test.ts` → exit 0；全量 `src/data/*.test.ts` 不回归
- [ ] `npm run check` → exit 0（Node 不足记环境已知交 CI）
- [ ] `npm run build` → exit 0；PROD 构建下首页／`/blog/` 无「排版测试（可删除）」；首页 `.intro` 精确；`/about/` 三段全文、无「这一页还是占位」；空 published →「还没有文章。」
- [ ] 真渲染 390 深／浅抽 `/`／`/about/`／`/blog/`（可用 dist 预览）；截图＋metrics → `/workspace/site-facade-copy-pr-qa/`。断言 P1-1…7；顶栏仍 headerH≈51 nowrap（本票不改 chrome，抽查即可）
- [ ] `git diff --stat` 仅上述三文件（+本 plan／源测）

## Task 4 · 开 PR（不合入）
- [ ] commit＋push `site-facade-copy`；`gh pr create --repo Lu-ceam/lu-ceam.github.io --base main --head site-facade-copy`
- [ ] 正文写 PRD／demo／坏例、改动摘要、测退出码、真渲染／P1、QA 路径。**不合入、不 force-push main。**
- [ ] 报告：PR URL、head SHA、变更路径、命令＋退出码、残余风险

## 落地记录
（工人填写）

## CI fix · pagefind 空索引（2026-11-07）
- 根因：`data-pagefind-body` 仅 Post；draft 后无已发布帖 → 全站 `data-pagefind-ignore=all` → pagefind Indexed 0 pages。
- 修：`about.astro` 加 `searchable`＋`<article data-pagefind-body>` 包三段文案（文案字节不变）。
- 干跑：pagefind Indexed 1 language／1 page／exit 0。
