# Plan · /notes/ 软着陆替换 404

- PRD：`/home/box/web-layout/prd-notes-soft-landing.md`
- Demo（PASS）：`/workspace/notes-soft-landing-demo/`（qa passAll）
- 坏例：`/workspace/hourly-audit/20261107-0507/06-notes.png`（404「页面不存在」）
- 基线：origin/main `59de0ec`（#180）
- 分支／worktree：`notes-soft-landing`
- 单 lane（仅新建一页）

## 非目标
不改 Header／links／404／about／config／global.css／碟页／门面文案；禁导航挂「笔记」；禁假列表／CMS。

## Task 0 · 契约面
- [ ] 新建 `src/pages/notes.astro`（非 `notes/index.astro`）
- [ ] Base：`title="笔记"`／`description="笔记区还在规划。"`／`robots="noindex"`
- [ ] 正文一字不差：h1「笔记」；两段锁定句；三链 `返回首页`→`/`、`关于`→`/about/`、`文章`→`/blog/`
- [ ] 禁：本页含「页面不存在」「没有找到这个地址。」；Header 无「笔记」链
- [ ] 源测 `src/data/notes-soft-landing.source.test.ts`：读 notes.astro＋Header.astro 断言上列

## Task 1 · RED 源测 → Task 2 · GREEN 建页 → Task 3 · 验 → Task 4 · 开 PR（不合入）

## 落地记录
（填写）

## 落地记录
- 新建 `src/pages/notes.astro`（PRD 骨架原样；robots=noindex；无 searchable）
- 源测 `notes-soft-landing.source.test.ts` 4/4；全量 `src/data/*.test.ts` 445/445 exit 0
- 未改 Header／404／about／config／global.css／碟页
