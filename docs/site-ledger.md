# 站点台账

| 日期 | PR | 改动 | 验证结果 |
| --- | --- | --- | --- |
| 2026-11-03 | [#162](https://github.com/Lu-ceam/lu-ceam.github.io/pull/162) | 窄屏章节 v3：四格唱片｜述语｜地图｜资料 | 布局 PASS；CI verify 绿；squash → `1db2e83`；真帧 soft 另补 |
| 2026-11-03 | [#161](https://github.com/Lu-ceam/lu-ceam.github.io/pull/161) | 窄屏章节 v2：封面并进唱片／来龙去脉自由长滚／资料短拍／地图腾空（compact chrome） | 布局 PASS；CI verify 绿；squash → `92cfa40`；真帧 soft 非阻塞 |
| 2026-11-02 | [#160](https://github.com/Lu-ceam/lu-ceam.github.io/pull/160) | 窄屏碟页章节壳：底栏翻章／竖滑换拍／左纵年轴／探索框内拖捏；桌面 ≥48rem 零回归；marks／契约未动 | 布局 PASS；CI verify 绿；squash → `e2fedde`；设计评审真帧 soft 非阻塞 |
| 2026-11-02 | [#159](https://github.com/Lu-ceam/lu-ceam.github.io/pull/159) | falp381 story 补 ## 唱片／来龙去脉／资料（馆长样例；marks waived；轨迹未改） | data-only；CI verify 绿；squash 合入 |
| 2026-11-02 | [#158](https://github.com/Lu-ceam/lu-ceam.github.io/pull/158) | 收妥后紧钉首屏：`SETTLED_PIN_SLACK_PX=48`、守卫 2.4s 可续（MAX 6s）、`ensureSettledPin` 可重入；条布局半票未动 | 布局 PASS；CI verify 绿；squash → `1618539`；Pages 200；待设计评审 wheel 穿阈复验 |
| 2026-11-02 | [#157](https://github.com/Lu-ceam/lu-ceam.github.io/pull/157) | 收妥瞬间掐 tall-runway smooth＋重钉；settled 条自适应／禁叠／纵居中（cover-w／真两栏／barH 同源） | 布局 r3 PASS；CI 绿；squash → `c70dfb2`；条半票设计评审 PASS；钉死半票真帧 FAIL → #158 |
| 2026-10-31 | #107 | 时空轨迹：契约 `trajectory.places[]`、Leaflet `/records/map/` + 单碟内嵌、ship-request `trajectory: ready|none` 闸门；d37779 馆员终核轨迹 | CI verify 绿；squash 合入 |
| 2026-10-31 | #108 | 四张轨迹 append：falp381／ll912／79307／dg10049（marks=none，trajectory=ready） | CI verify 绿；data-only squash 合入 |
| 2026-10-31 | #110 | 公开轨迹旁注去编目话术：d37779 + falp381／ll912／79307／dg10049 | CI verify 绿；data-only squash 合入 |
| 2026-10-23 | #1 | 初始化静态站点骨架：文章、标签、唱片页、搜索、RSS、sitemap，以及 GitHub Pages 部署与 CI | 构建与 Pagefind 成功；`astro check` 0 错误；lychee 0 个坏链；Lighthouse 移动端首页与排版测试页 Performance / Accessibility / SEO 均为 100 |
| 2026-10-24 | #22 / #23 | /records/ 细节 imagery reveal + 手动题铭（mhjl329 试点路径） | mhjl329 live reveal；设计锁在 specs，实现随 #23 |
| 2026-10-24–25 | #29–#37 | split-stage、相机 zoom、Approach A runway、说明文上线 | 分步合入；细节见对应 specs/plans |
| 2026-10-25 | #38–#44 | 虚线肘线 callout、contain-fill + φ 分栏、边距说明 | 手机盘面可见 + 桌面边注基线 |
| 2026-10-25 | #46–#52、#54–#60 | callout polish composite A；mobile margin-first letterbox | 正交肘线、侧边 terminus；手机 letterbox 可画线 |
| 2026-10-25 | #63–#66 | fill→crop Approach A：不透明 live crop 窗 + 外缘淡到纸底 | design→plan→ship；窗几何跟 zoomImageBox |
| 2026-10-25–26 | #67–#81 | 手机滚动/跳动、肘线贴边、park/penetrate、falp381 insert packing | #81 后 mhjl329 + falp381 insert 390 肘线进字 |
| 2026-10-25–26 | #72 / #74 | falp381 试点 full reveal（cover→label→insert）+ cover 优先顺序 | 试点 live；insert 同数组 reveal |
| 2026-10-25 | #75 | mark-box 纸底 understroke，去掉黄框内黑线 | 共用 accent 框观感 |
| 2026-10-26 | #82 | d37779 + lpbr6083 full reveal | Pages 绿 |
| 2026-10-26 | #83 | ml4001 + mg50370 + ll912 full reveal | batch five 五张齐全，目录条目均为 reveal |
| 2026-10-26 | #85 | 排查：`/records/` 桌面动效“失效”——非 runway/sticky；桌面 wheel/触控板不置 `pointerDown`，`SETTLE_IDLE_MS`(180)+`nearestKeypoint` 在 `ZOOM_END`→`DWELL_START` 吸到定焦，跳过 zoom/plate；手机 touch 整段手势内不 settle。另先排除 `prefers-reduced-motion`。修复未本轮落地。 | docs-only；settle 代码未改；先查 reduce-motion |
| 2026-10-27 | TBD | 手机先盘后文 Approach A：窄屏 100svh reveal → 收束到顶栏封面拇指 → 记述自然滚；桌面 φ 双栏不动 |
| 2026-10-26 | #86 | 修：`nearestKeypoint` 禁止一次 settle 跨 `ZOOM_END`→`DWELL_START`；`ZOOM_END≤local<PLATE_END` 先停 `PLATE_END`，其后空闲再吸 dwell。回指 #85。未改 `SETTLE_IDLE_MS` / pointer / reduce-motion。 | split-stage 单测绿；桌面滚轮应走过 zoom→plate |
| 2026-10-26 | 本分支 | 唱片数据改读馆员 v1 导出（`records/` + `records-legacy/`），版式层独立为 `src/data/records-layout.json`；删掉「证据核对」「补拍清单」两栏；禁止字段在构建（zod + 全树键名扫描）和 `dist/` 检查两处拦截 | `astro check` 0 错误；`npm run build` 与 dist 检查通过；lychee 内部链接 0 坏链 |
| 2026-10-30 | 本分支 | 加入 EMI Electrola / HMV 西德压 `2901461`（馆员 v1 导出；details 为空，封套整幅、无题铭） | `node --test` 167 通过；`astro check` 0 错误；build 与 dist 禁止字段扫描通过 |
| 2026-10-29 | 本分支 | 空题铭也走 reveal / split-stage。`2901461` 用 cover 原样复制的 upright 加 2px 内缩 crop。`node scripts/ship-records.mjs <export-dir>` 校验后开数据 PR，CI 绿且 diff 仅为数据时合并 | `node --test src/data/*.test.ts scripts/reveal-layout.test.mjs` 177 通过；`astro check` 0 错误；`npm run build` 与 dist 禁止字段扫描通过。构建页均有 `record-page--split`，无 `entry-hero` / `data-mode="legacy"` |

设计/计划原文仍在 `docs/superpowers/specs/` 与 `docs/superpowers/plans/`；本表只记已合入里程碑，不逐条记肘线微调。

**排查笔记（2026-10-26）**：`/records/` 桌面动效“失效”：非 runway/sticky 塌缩。手机 touch 会置 `pointerDown` 整段手势内不 settle；桌面 wheel/触控板不置位，`SETTLE_IDLE_MS`(180) + `nearestKeypoint` 曾在 `ZOOM_END`→`DWELL_START` 一次吸到定焦，跳过 zoom/plate（#85）。另先排除 PC 开了 `prefers-reduced-motion`。修复见 #86：settle 先停 `PLATE_END`。
