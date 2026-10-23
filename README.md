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
      "image": { "src": "/records/example1/label.webp", "width": 400, "height": 400 },
      "alt": "标签细节",
      "caption": "标签",
      "text": "① 目录号"
    }
  ],
  "evidence": "证据核对。",
  "needLead": "升到已核还差",
  "need": "待补拍。"
}
```
