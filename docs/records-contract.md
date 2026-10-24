# 唱片数据契约

站点只渲染馆员导出的公开字段。构建读仓库里的导出，不手改条目正文。

## 位置

共享机器上的导出目录是 `/workspace/records-export/`。仓库里的对应位置是根目录 `records/`。`records-legacy/` 只放还没进入这份导出的旧条目（目前是 `d37779`、`lpbr6083`），等馆员补上 v1 导出后再删。

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

## 照片

馆员导出的图片已经去掉 EXIF，并缩到网页尺寸。仓库按字节保存，不裁切、不打码；手写、标价、店贴、家里环境按馆员标记公开。

页面里过大的图（长边超过 1200px）会在构建时另存一张只缩小、不裁切的 WebP 供排版，目录封面再备一张长边 384px 的缩略图。点击图片打开的是仓库里的那张原文件。长边不超过 1200px 的细节图直接用原文件。

## 构建后检查

`npm run build` 在 Pagefind 之后运行 `scripts/check-public-records.mjs`，扫描 `dist/` 的文本文件。

会失败的标记：

- 字段名 `needLead` / `need_lead` / `need-lead`
- 旧栏目名 `证据核对`、`补拍清单`
- 旧标题markup：`<summary>` 里紧跟 `待补拍`
- 禁止字段的 JSON 键写法，例如 `"evidence":`、`"price":`、`"source-of-purchase":`

不把「补拍」两个字本身当标记。`ml4001`、`mg50370` 的公开品相里写了「待补拍」（封底还没拍），这是给读者看的句子，不是补拍清单。

## 同步

```bash
node scripts/import-records.mjs /workspace/records-export
```

脚本把导出拷进 `records/`。单张图长边已不超过 2000px、且没有 EXIF / XMP / IPTC 时，按字节复制，并保持 `index.json` 不变。超出 2000px 或仍带元数据的图，用 sharp 按方向转正、缩进 2000px 以内、去掉元数据，然后重写该条 sha256。脚本不碰 `records-legacy/`。

导入前会拒绝未知 `schemaVersion` 和禁止字段。

## 工作流

1. 馆员更新 `/workspace/records-export/` 后，通知变更的 id 和 index 的 sha。
2. 站点维护者运行上面的导入命令，只提交唱片数据，另开一个 PR。
3. 这类 PR 在 schema、缺图、禁止字段和 `dist/` 检查都通过之后，可以由站点维护者合并。
4. 改版式或改代码的 PR 由站长合并。
