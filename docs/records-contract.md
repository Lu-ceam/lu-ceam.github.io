# 唱片数据契约

站点只渲染馆员导出的公开字段。构建读仓库里的导出，不手改条目正文。

数据和版式分两层：本文件管导出（正文、编号说明的唯一来源），`src/data/records-layout.json` 管版式（裁切、upright、题铭）。两层在构建时合并，任一层出现禁止字段都会让构建失败。

## 位置

共享机器上的导出目录是 `/workspace/records-export/`。仓库里的对应位置是根目录 `records/`。`records-legacy/` 只放还没进入这份导出的旧条目（目前是 `d37779`、`lpbr6083`），等馆员补上 v1 导出后再删。

`src/data/records-layout.json` 是站点侧的版式层，不随导出重建：导出里的每条记录都要在这里有一段，反过来这里多出的 id 也会让构建失败。

## 每条目录

```
records/
  index.json          # schemaVersion、id、updatedAt、sha256
  changelog.json
  README.md           # 馆员导出说明，随导出复制
  records/<id>/
    record.json
    story.md          # 公开长文
    images/           # 原图
    details/          # 带编号框的细节图
```

`index.json` 是提交标记。`schemaVersion` 目前只接受 `1`。未知版本、缺少 `schemaVersion`，构建失败。

`sha256` 按馆员 README：把该条目录里的文件按相对路径字典序排列，依次纳入 `路径 UTF-8 + 0x00 + 该文件 SHA-256 原始摘要`，再取总哈希。图片字节没有被导入脚本改写时，仓库保留馆员给出的 `index.json`（含 sha）。脚本若重新压缩了图片，会按同一算法改写该条 `sha256` 和 `updatedAt`。

## 图片命名

- `cover-front`、`cover-back`
- `label-d<碟>-s<面>`（A 面 = 1，B 面 = 2；多碟面号连续。同一面第二张可加后缀，如 `label-d1-s2-disc`）
- `runout-d<碟>-s<面>`
- `obi`
- `insert-<n>`
- `details/` 下同名，扩展名 `.webp`

死蜡图（`kind: runout`）必须在导出里存在，但页面不渲染，也不复制进 `dist/`。

## 三档状态

`statusLabel` 用原文，不改写成「待复核」。

| `statusLabel` 前缀 | `verificationStatus` | 压片、内圈刻字 |
| --- | --- | --- |
| 大体已核 | `partial` | 显示 |
| 已核 | `verified` | 显示 |
| 其余（待复核、待核、待核（仅口述）等） | `pending` | 不显示 |

`verificationStatus` 与上表不一致时构建失败。

`records-legacy/` 沿用同一文件形状。这两条的旧状态若不是以「已核」开头，页面一律不显示压片和内圈刻字（「大体已核」不算「已核」）。

品相（`condition`，含 Goldmine 分级）始终显示。`story.md` 去掉开头的一级标题后，作为记述。

## 永不导出

下面这些字段出现在任一 JSON 键上（大小写不敏感，含嵌套）都会让构建失败。`showsPrice` 只表示画面里能看见标价，不在此列。

- 证据台账：`evidence`
- 补拍清单：`need`、`needLead`（以及 `need_lead`、`need-lead`）
- 价格：`price`、`purchasePrice`、`purchase_price`
- 购买来源：`purchase`、`purchaseSource`、`purchase_source`、`purchaseChannel`、`purchaseDate`、`sourceOfPurchase`、`source-of-purchase`、`source_of_purchase`
- 估值：`valuation`、`estimatedValue`、`marketValue`

完整列表在 `src/data/forbidden-fields.json`。

引用的图片文件不存在，构建失败。

## 版式层

`src/data/records-layout.json` 是数组，每条是 `{ id, image, detailsNote, details[] }`。

| 字段 | 说明 |
|---|---|
| `image` | 目录封面与页面主图：`/records/<id>/hero.webp` 及其像素 |
| `detailsNote` | 编号对照的一句公开说明 |
| `details[].part` | 站点自己的名字（`label`、`cover`、`back`、`insert`、`obi`），参与 plate / upright 文件名 |
| `details[].disc` / `details[].side` | 可选。正整数碟号／面号，对齐导出文件名 `…-dN-…`／`…-sN`；**不要**造 A/B 字母字段。`marks[].side` 仍是引线左右，与此无关 |
| `details[].source` | 必填。该条导出 `record.json` 里 `images[]` 或 `details[]` 的一个 `file`；版式层只能裁导出的照片 |
| `details[].alt` | 图片替代文本 |
| `details[].plate` / `upright` / `transform` | 裁切资产与矫正参数，规则同下 |
| `details[].marks` | 题铭：编号框与小注，坐标以 plate 像素为单位 |

同条唯一键是 `(part, disc ?? 0, side ?? 0)`，同一 `part` 可以在不同碟／面各出现一次。手填的 `disc`+`side` 优先；否则可从 `source` 文件名解析 `-dN-sM`（仅用于面号展示，不改资产路径）。

资产路径：显式同时有 `disc` 与 `side` 时为 `/records/<id>/{part}-d{disc}-s{side}.webp`（及 `-upright.webp`）；否则仍用单槽 `/records/<id>/{part}.webp`。现网未写 `disc`／`side` 的条目与既有 `{part}.webp` 继续合法；馆员导出形状与 caption 迁移另 PR。

细节图的 `caption` 与 `text` 不在版式层，取导出里 `details[]` 对应 `file` 的那一条。UI 在解析到完整面号时于 figcaption 旁显示短标签 `d1-s2`（可选长式 `Disc 1 · side 2`）。

构建会检查：`source` 在导出里存在；`(part, disc??0, side??0)` 不重复；`plate.src`／`upright.src` 符合上表；`upright` 与 `transform` 成对；`transform.exportWidth` 等于 `plate.width`；`crop` 落在 upright 像素内且至少一边内缩 2px（空 `marks` 也是 reveal，详情页走 split-stage）；`plate.height` 与 `crop` 比例一致；`marks` 落在 plate 像素内且 id 不重复；图片尺寸与 `public/` 里的文件一致。不能 reveal 的细节会让构建失败。

## 照片

馆员导出的图片已经去掉 EXIF，并缩到网页尺寸。仓库按字节保存，不裁切、不打码；手写、标价、店贴、家里环境按馆员标记公开。

导出的原图是数据和裁切的来源，不复制进 `dist/`。页面用的是版式层声明的 `public/records/<id>/` 资产：由导出照片按 `transform` 矫正、裁出的 WebP。死蜡图（`kind: runout`）页面不渲染。

## 构建后检查

`npm run build` 在 Pagefind 之后运行 `scripts/check-public-records.mjs`，扫描 `dist/` 的文本文件。`dist/` 下的 dot 目录（例如中断构建留下的 `.prerender`）是构建草稿，不在扫描范围；断到一半的构建会把它们留在那里，重跑一次 `npm run build` 即可。

会失败的标记：

- 字段名 `needLead` / `need_lead` / `need-lead`
- 旧栏目名 `证据核对`、`补拍清单`
- 旧标题markup：`<summary>` 里紧跟 `待补拍`
- 禁止字段的 JSON 键写法，例如 `"evidence":`、`"price":`、`"source-of-purchase":`

不把「补拍」两个字本身当标记。`ml4001`、`mg50370` 的公开品相里写了「待补拍」（封底还没拍），这是给读者看的句子，不是补拍清单。

## 同步

```bash
node scripts/ship-records.mjs /workspace/records-export
```

这是一键路径。`<export-dir>` 是完整的 v1 导出（`index.json`、`records/<id>/`），不是单条目录。

1. 校验失败（未知 `schemaVersion`、禁止字段、缺图、正文或 id 对不上）时退出码非 0，不提交。
2. 调用 `scripts/import-records.mjs` 的同一套拷贝：长边不超过 2000px 且没有 EXIF / XMP / IPTC 的图按字节复制，并保持 `index.json` 不变；否则用 sharp 转正、缩进 2000px、去掉元数据，并重写该条 sha256。不碰 `records-legacy/`。
3. 已有版式但缺 upright / 合格 crop 的细节：把现有 plate 原样复制为 `{part}-upright.webp`，写入至少 2px 内缩、且与 plate 比例一致的 crop。不改 `marks`。没有版式条目时，用 `cover-front` 生成一条最小 cover（含 hero）。
4. 只暂存 `records/`、`src/data/records-layout.json`、`public/records/`，开 PR。CI（`npm run check`、`npm run build`）通过且 diff 仍只是这些数据文件时，squash 合并。含其它文件则 PR 保持打开并说明原因。

工作区不干净时脚本拒绝运行。重压图片需要 `npm install --no-save sharp`（不写入 `package.json`）。

只拷导出、不开 PR 时仍可：

```bash
node scripts/import-records.mjs /workspace/records-export
```

## 工作流

1. 馆员更新 `/workspace/records-export/` 后，通知变更的 id 和 index 的 sha。
2. 站点维护者运行上面的 `ship-records.mjs`。数据-only 且 CI 绿时脚本自行合并。
3. 改展示代码的 PR 由站长合并。
