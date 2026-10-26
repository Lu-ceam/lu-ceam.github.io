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

藏品写在 `src/data/records.json`，照片放在 `public/records/<id>/`。构建时会用 zod 校验。不要写入价格或估值字段，也不要在正文里写金额；未知字段会导致构建失败。数组为空时，页面显示「藏品整理中」。

`status` 保留原始中文状态。以「已核」开头算已复核，以「大体已核」「待复核」「待核」开头算尚未完成。页面上的「内圈刻字」和「压片」只在「已核」或「大体已核」时展示，数据里可以先存着。`year` 只在能够确定一个公历年份时填写；否则页面使用 `decade`，不要编造年份。

```json
{
  "id": "example1",
  "artist": "演奏者",
  "composer": "作曲家",
  "work": "作品",
  "label": "厂牌",
  "catalogNumber": "目录号",
  "matrix": null,
  "pressing": null,
  "decade": "1960s",
  "recording": "录音",
  "condition": "品相",
  "eq": "均衡",
  "story": "记述。",
  "links": [{ "title": "出处", "href": "https://example.com", "site": "example.com" }],
  "status": "待核",
  "photo": "照片里能看见什么。",
  "image": { "src": "/records/example1/hero.webp", "width": 640, "height": 480 },
  "detailsNote": "细节图编号说明。",
  "details": [
    {
      "part": "label",
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
      ],
      "caption": "标签",
      "alt": "标签细节",
      "text": "① 目录号"
    }
  ],
  "evidence": "证据核对。",
  "needLead": "升到已核还差",
  "need": "待补拍。"
}
```

细节图用 `plate`，不用 `image`。`upright` 和 `transform` 要么一起写，要么一起省。没有真实的矫正前图时不要放大 plate 冒充 upright，并且 `marks` 用空数组：页面就还是现在的图、说明和全文，不叠题铭。公开笔画用站点的 `--accent`，不要写 `#FFD400`。`export_site_marks.py` 在黑胶目录的 skill 工具链里，不在这个网站仓库。

### 展示模板与上架流程

所有碟共用 `src/pages/records/[id].astro` 这一套 reveal：相机跑道、letterbox 说明、肘线、fill→crop。布局和肘线类问题改一次，所有 reveal 细节一起受益。

每张盘单独做的是**数据 + 烘焙资产**，不是另起一份前端：原图与 vinyl 标注 YAML → `export_site_marks.py`（黑胶目录 skill 工具链）→ `public/records/<id>/` 的 upright/plate，以及 `records.json` 里该条 `details[]` 的 `upright` / `transform` / `marks`（外加 caption、alt、公开说明 `text`）。有成对的 `upright`+`transform` 就是 reveal；两者都省略且 `marks` 为空则保持原来的 plate + 全文。

加一张或把 legacy 升到 reveal 的常见顺序：

1. 原图不清时先问唱片管理员，不要猜裁切或标注。
2. 在黑胶目录完成标注，再跑 `export_site_marks.py`。
3. 把导出图放进 `public/records/<id>/`，把字段并进 `src/data/records.json`（`details[]` 顺序即 overhead 缩放顺序；cover 默认靠前）。
4. 本地 `npm run check` / CI，合并 `main` 等 Pages；手机约 390 宽抽检肘线是否进字。

设计取舍见 `docs/superpowers/specs/` 与 `docs/superpowers/plans/`。已上线的阶段节点记在 `docs/site-ledger.md`，不在 README 里逐条追 PR。

