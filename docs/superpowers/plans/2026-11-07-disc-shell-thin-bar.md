# Plan · 碟页窄屏同壳瘦条（settled 88/100 → 44）

- PRD：`/home/box/web-layout/prd-disc-shell-thin-bar.md`
- Demo（PASS）：`/workspace/disc-shell-thin-bar-demo/`（qa/browser-metrics.json：barH=44；h1 20／meta 18；返回／信息／关闭／年轨 ≥44）
- 坏例：`/workspace/hourly-audit/20261107-0011/falp381-390-*.png`（barH 88／长题 100）
- 基线：origin/main `07029be`（#177）
- 分支／worktree：`disc-shell-thin-bar`
- 单 lane（串行；壳高度＋题槽＋dialog 耦合，不拆并行）

## 非目标
不藏 meta；不地图章特判；不 inline 展开顶栏；不改 #177 裁窗／outerFade／badge／notes／marks／`detail-display.ts`；不回退 #174–#177；不重做首次 hero/gate；不全站换肤；不另票拆 P2。

## Task 0 · 契约面（先落，后续不得改签名）

### 常量／函数（`src/data/split-stage.ts`）
- [x] `DISC_SETTLED_H_PX = 44`（替 88；与 `--disc-settled-h` 同步）
- [x] `DISC_SETTLED_PAD_Y_PX = 3`（替 8；题槽上下各 3）
- [x] `DISC_SETTLED_COVER_MIN_PX = 28`、`DISC_SETTLED_COVER_MAX_PX = 28`（固定 28×28 mini；不再 56–112 可增长槽）
- [x] `settledBarHeightPx(contentH, coverH?, padY?)`：**普通窄屏壳固定返回 `DISC_SETTLED_H_PX`**（长内容／旧 mini 自然高不得拉高）。签名保留，入参可忽略。大字／text-only zoom 可访问例外另用导出 `settledBarHeightPxLargeText(...)` 或同函数可选 `{largeText:true}`，四章同一规则、禁止 chapter-kind 特判；默认路径测必须证明长内容仍＝44。
- [x] `settledCoverSlotPx(viewportW)`：普通壳返回 `{w:28,h:28}`（或等价固定），不再随 vw 拉宽。

### CSS token／归属（仅 `src/styles/global.css`）
- [x] `--disc-settled-h: 44px`；`--disc-settled-title: 14px`；`--disc-settled-meta: 12px`；`--disc-settled-cover-w: 28px`；`--disc-settled-pad-y: 3px`（或与 demo 一致的 px／rem 等价）；`--disc-settled-gap` 对应封面尾距 8px。
- [x] 窄屏 reading 题槽：h1＝`white-space:nowrap; overflow:hidden; text-overflow:ellipsis`；`font:600 14px/20px`；**删** `-webkit-line-clamp:2`／`line-clamp:2`。meta 同理单行 ellipsis，`font:400 12px/18px`，次墨，有内容必显。
- [x] 返回实际可点盒 ≥44×44；信息热区＝题槽＋下展同一按钮，高 44；下展图形 Lucide chevron-down 16px（视觉槽，非独立 Tab）。
- [x] 信息层：原生 `<dialog>` 或等价；同纸、无 radius／shadow 卡片感；`max-height: calc(100svh - 32px)`（支持时 `100dvh`）；关闭 44×44。
- [x] P2-A：≥48rem `.record-object { max-height: calc(100svh - 2rem); }`（禁裸 `100vh` 于该规则）。
- [x] P2-B：地图年轨真实 `button` 盒宽高 ≥44；轨道列同步 ≥44（`TrajectoryMap.astro`／相关 CSS）。

### DOM hooks（`src/pages/records/[id].astro`）
- [x] 窄屏 settled 条结构对齐 demo：`[返回 hit]` `[mini 28]` `[tombstone: h1+meta]` `[下展视觉]`；题槽＋下展共用一个 `button`（`aria-haspopup="dialog"`／`aria-controls`／中文可访问名）。
- [x] `<dialog class="…identity…">`（或站点等价）含全题／演职／厂牌／目录号／年份／状态；SSR 兜底；Esc／关闭／外侧关闭；焦点移入、围住、关闭恢复原按钮；不改 scrollTop／章索引／#177 local progress。
- [x] `applySettledHeight`／所有 inset 消费方：以固定 44 契约为起点；**禁止**再用 tombstone `scrollHeight` 把壳顶回 88/100。

### 测试口径替换
- [x] `#176` clamp2 断言 → 单行 nowrap＋ellipsis（四章同一体制）；禁章特判断言保留并加强。
- [x] `disc-hero-collapse.source.test.ts`／`split-stage.test.ts`：`DISC_SETTLED_H_PX===44`；长内容 `settledBarHeightPx(999,120,8)===44`；CSS `--disc-settled-h: 44px`；删「88／clamp2／可增长」旧期望。
- [x] **禁改** `src/data/detail-display.ts` 及 crop／badge／notes 测。

## Task 1 · RED：先写／改测
- [x] 更新 `disc-shell-chrome.source.test.ts`：h1／meta 单行 ellipsis；无 clamp2；禁 map 藏 meta／异体制；token 14／12／44／28。
- [x] 更新 `disc-hero-collapse.source.test.ts`：常量 44／3／28；`settledBarHeightPx` 长内容仍 44；CSS 44px；单行规则。
- [x] 新增／加固高度单测：长题内容高度不得拉高普通壳；无 chapter-kind 分支。
- [x] 源测：年轨 button `min-width/min-height` ≥44；`.record-object` 无裸 `100vh`。
- [x] 跑 `node --test src/data/disc-shell-chrome.source.test.ts src/data/disc-hero-collapse.source.test.ts src/data/split-stage.test.ts` 确认相关断言 RED（记退出码）。

## Task 2 · GREEN：常量＋高度契约
- [x] 改 `split-stage.ts` 常量与 `settledBarHeightPx`／`settledCoverSlotPx` 按 Task0。
- [x] 改 `[id].astro` `applySettledHeight`：固定写 `--disc-settled-h: 44px`（或常量），不再用 scrollHeight 增长；`placeThumbCover` 对齐 28 槽。
- [x] 相关单测转 GREEN。

## Task 3 · GREEN：CSS 题槽＋热区＋P2
- [x] `global.css`：token、单行 ellipsis、封面槽 28、pad、返回／信息热区；P2-A `100svh`。
- [x] `TrajectoryMap.astro`：年轨真实 button／列宽 ≥44（P2-B）；不改站数据／轨迹算法／1951∩1956 避让逻辑。
- [x] chrome／hero 源测 GREEN。

## Task 4 · GREEN：信息 dialog＋返回
- [x] `[id].astro`：settled 条加入返回 hit（链 `/records/`，aria-label 中文）、identity button、dialog 全字段、焦点循环与恢复、SSR noscript／链接兜底。
- [x] 打开／关闭不改 scroll／章／crop progress；prefers-reduced-motion 直接切态。
- [x] 源测锁 dialog／identity／返回 hit 存在且无章特判。

## Task 5 · 验
- [x] `node --test src/data/*.test.ts` → exit 0（至少 chrome／hero-collapse／split-stage／既有相关测；全量更佳）
- [x] `npm run check` → exit 0；Node 版本不足则记「环境已知，交 CI」
- [x] ego-browser 390×844：四章 × opening／settled × 长短题（ll912／falp381）真渲染；断言 barH 44≤≤48；h1／meta 单行在栏内；返回／信息热区 ≥44；无横溢。截图存 `/workspace/thin-bar-pr-qa/`。
- [x] 附抽测 #177：falp381 mid outer≥~0.75、settled outer≈0.14、号标∩框＝∅（**只读断言，不改 detail-display**）。

## Task 6 · 开 PR（不合入）
- [x] commit＋push `disc-shell-thin-bar`；`gh pr create --base main`；正文写 PRD／demo／坏例路径、改动摘要、测退出码、真渲染 barH／热区数、QA 路径。**不合入、不 force-push main。**

## 落地记录（2026-11-07）

- Task0–6 全勾：契约 `44/3/28`、单行 ellipsis、四列条（返回｜小图｜题槽｜下展）、信息 dialog、P2-A `100svh`、P2-B 年轨 44。
- reduced motion 额外收口：`html[data-motion='reduce']` 下收妥壳仍是 fixed 44px（原先会退回 3×44 静态列）。
- 验收：`node --test src/data/*.test.ts` = 423 pass／0 fail（exit 0）；`npm run check`（Node 22.23.4）= 0 errors／0 warnings（exit 0；默认 Node 22.21 被 Astro 版本闸拒绝，交 CI）。
- 真渲染 390×844 DPR2：7 格 barH=44、h1 20／meta 18 单行、返回 44×44、信息热区 309×44、年轨 44×44、横溢 0；320/360/430/640/767 另 15 格同规则。证据 `/workspace/thin-bar-pr-qa/`。
