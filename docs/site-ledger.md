# 站点台账

| 日期 | PR | 改动 | 验证结果 |
| --- | --- | --- | --- |
| 2026-10-24 | TBD | 初始化静态站点骨架：文章、标签、唱片页、搜索、RSS、sitemap，以及 GitHub Pages 部署与 CI | 构建与 Pagefind 成功；`astro check` 0 错误；lychee 0 个坏链；Lighthouse 移动端首页与排版测试页 Performance / Accessibility / SEO 均为 100 |
| 2026-10-24 | #32 | 唱片改读馆员 schemaVersion 1 导出。构建用 zod 校验版本、缺图和禁止字段（证据台账、补拍清单、价格、购买来源、估值）。已核与大体已核显示压片和内圈刻字，其余状态按原文显示且不显示这两项。`d37779`、`lpbr6083` 暂留 `records-legacy/`，等馆员 v1 导出 | `astro build` 成功；`astro check` 0 错误；lychee 347 条里 0 个坏链；`dist/` 内部字段检查通过，注入 `"evidence":` 时退出码 1；Lighthouse 移动端 `/records/` 与 `/records/ml4001/` 的 Performance / Accessibility / SEO 均为 100 |
