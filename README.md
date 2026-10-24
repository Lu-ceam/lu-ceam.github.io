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

藏品来自馆员的 schemaVersion 1 导出，放在 `records/`。构建时用 zod 校验；未知版本、缺图，或证据台账、补拍清单、价格、购买来源、估值字段，都会让构建失败。页面规则、导入命令和谁来合并，见 [docs/records-contract.md](docs/records-contract.md)。

`records-legacy/` 里的 `d37779` 与 `lpbr6083` 还没有 v1 导出，页面仍会显示，但不会写出已经删掉的内部字段。
