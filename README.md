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

藏品写在 `src/data/records.json`，目前是空数组，页面显示「藏品整理中」。构建时会用 zod 校验。不要写入价格或估值字段，未知字段会导致构建失败。

`verificationStatus` 为 `pending` 时不展示压片版本，并显示「待复核」。只有 `verified` 且 `pressing` 不为 `null` 时才展示压片版本。

```json
{
  "id": "example-1",
  "title": "曲目",
  "performers": ["演奏者"],
  "label": "厂牌",
  "catalogNumber": "目录号",
  "pressing": null,
  "verificationStatus": "pending",
  "composer": "作曲者",
  "year": 1960,
  "notes": "备注"
}
```
