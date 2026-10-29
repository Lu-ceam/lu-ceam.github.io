# Lu-ceam

个人静态站点，地址是 <https://lu-ceam.github.io/>。

## 本地运行

需要 Node.js 22.23.4（见 `.nvmrc`）。

```bash
npm install
npm run dev
```

开发服务器默认在 <http://localhost:4321/>。

```bash
npm run check
npm run build
npm run preview
```

`npm run build` 会生成静态文件，并在构建后建立搜索索引。搜索页在索引生成之后才能返回结果。

## 添加文章

在 `src/content/blog/` 新建一个 `.md` 或 `.mdx` 文件。文件名就是地址：`notes.md` 对应 `/blog/notes/`。

```md
---
title: 文章标题
date: 2026-10-24
description: 可选摘要
tags:
  - 笔记
draft: false
---

正文从这里开始。
```

`title` 和 `date` 必填。`tags` 默认为空数组，`draft` 默认为 `false`，`description` 可以不写。

## 草稿

把 `draft` 设为 `true` 后，`npm run dev` 仍然可以预览，页面上会标出「草稿」。生产构建不会包含草稿，RSS、sitemap 和搜索索引里也不会出现。

## 发布

合并到 `main` 会触发 GitHub Actions，把站点部署到 GitHub Pages。也可以在 Actions 里手动运行 Deploy to GitHub Pages。

## 唱片

公开文字只来自馆员的 v1 导出，站点的版式是另一层。构建时两层用 zod 合并成同一个 `records`，任一层出现禁止字段（`evidence`、`need*`、`price`、`purchase*`、`valuation*`）都会让构建失败；`npm run build` 之后还会扫 `dist/`，确认这些栏目没有泄漏到页面。字段与规则见 `docs/records-contract.md`。

| 层 | 位置 | 放什么 |
| --- | --- | --- |
| 馆员导出 | `records/` | `record.json`、`story.md`、`images/`、`details/`，正文与编号说明的唯一来源 |
| 遗留条目 | `records-legacy/` | 还没进导出的旧条目，形状相同 |
| 版式层 | `src/data/records-layout.json` | 裁切、upright、题铭、`detailsNote`；不放正文 |
| 版式资产 | `public/records/<id>/` | `hero.webp`、`<part>.webp`、`<part>-upright.webp` |

不要手改 `records/` 里的 `record.json` 或 `story.md`：那是馆员 Page 的导出，下次导入会覆盖。改文字找馆员改 Page，再按 `docs/records-contract.md` 的「同步」跑 `node scripts/ship-records.mjs <export-dir>`。

### 版式层

```json
{
  "id": "example1",
  "image": { "src": "/records/example1/hero.webp", "width": 640, "height": 480 },
  "detailsNote": "每张细节图的编号与其下方说明对应。",
  "details": [
    {
      "part": "label",
      "source": "details/label-d1-s1.webp",
      "alt": "标签细节",
      "plate": { "src": "/records/example1/label.webp", "width": 400, "height": 400 },
      "upright": { "src": "/records/example1/label-upright.webp", "width": 1200, "height": 1200 },
      "transform": {
        "cropSpace": "upright",
        "angleDeg": 0,
        "crop": { "x": 100, "y": 80, "w": 1000, "h": 1000 },
        "exportWidth": 400
      },
      "marks": [
        {
          "id": "catalog",
          "badge": "tl",
          "side": "auto",
          "x": 40,
          "y": 36,
          "w": 120,
          "h": 48,
          "note": "目录号"
        }
      ]
    }
  ]
}
```

- `part` 是站点自己的名字（`label`、`cover`、`back`、`insert`、`obi`），同时决定 `plate` 与 `upright` 的文件名。同一条里不能重复。
- `source` 必须是该条导出 `record.json` 里 `images[]` 或 `details[]` 的某个 `file`。版式层只能裁导出的照片，不能凭空引用别的图。
- 细节图的 `caption` 和 `text` 来自导出里对应的 `details[]`，版式层不重复写。`alt` 留在版式层。
- `upright` 和 `transform` 成对。`crop` 至少在一边内缩 2px 就是 reveal，题铭可以为空，详情页走 split-stage。构建拒绝 legacy / callout。还没有矫正图时，`node scripts/ship-records.mjs` 把现有 plate 原样复制为 `{part}-upright.webp`（不放大），并写入这个最小 crop，不改题铭。
- `details[]` 的顺序就是 overhead 缩放顺序，cover 默认靠前。
- `plate.height` 必须与 `crop` 的比例一致，`marks` 必须落在 plate 像素内，图片尺寸必须与 `public/` 里的文件一致。都不通过就让构建失败。
- 公开笔画用站点的 `--accent`，不要写 `#FFD400`。`export_site_marks.py` 在黑胶目录的 skill 工具链里，不在这个网站仓库。

### 状态与年份

`statusLabel` 保留原始中文状态。以「已核」开头算已复核，以「大体已核」开头算部分核实，「待复核」「待核」开头算尚未完成；`verificationStatus` 必须与 `statusLabel` 一致，否则构建失败。页面上的「内圈刻字」和「压片」只在「已核」或「大体已核」时展示，数据里可以先存着。`year` 只在导出给出一个四位公历年份时上页面；否则页面使用由导出算出的 `decade`，不要编造年份。

### 展示模板与上架流程

所有碟共用 `src/pages/records/[id].astro` 这一套 reveal：相机跑道、letterbox 说明、肘线、fill→crop。布局和肘线类问题改一次，所有 reveal 细节一起受益。

每张盘单独做的是**数据 + 烘焙资产**，不是另起一份前端：原图与 vinyl 标注 YAML → `export_site_marks.py`（黑胶目录 skill 工具链）→ `public/records/<id>/` 的 upright/plate，以及 `src/data/records-layout.json` 里该条 `details[]` 的 `source` / `upright` / `transform` / `marks`（外加 `alt`）。正文、caption 与编号说明仍只从导出来。

加一张或把 legacy 升到 reveal 的常见顺序：

1. 原图不清时先问唱片管理员，不要猜裁切或标注。
2. 在黑胶目录完成标注，再跑 `export_site_marks.py`。
3. 把导出图放进 `public/records/<id>/`，并在 `src/data/records-layout.json` 加一段（`details[]` 顺序即 overhead 缩放顺序；cover 默认靠前）。
4. 本地 `npm run check` / `npm run build` / CI，合并 `main` 等 Pages；手机约 390 宽抽检肘线是否进字。

设计取舍见 `docs/superpowers/specs/` 与 `docs/superpowers/plans/`。已上线的阶段节点记在 `docs/site-ledger.md`，不在 README 里逐条追 PR。

#### 排查（动效）

1. 先查系统或 DevTools 的 `prefers-reduced-motion` / `html[data-motion]`：reduce 会塌 runway，看起来像卡在定焦。
2. 桌面滚轮/触控板：约 180ms 空闲后 settle 曾从 zoom 段直接吸到 dwell（不置 `pointerDown`），跳过 zoom/plate；#85 诊断，#86 已改为先停 `PLATE_END` 再定焦。手机 touch 仍正常。详见 `docs/site-ledger.md`。

