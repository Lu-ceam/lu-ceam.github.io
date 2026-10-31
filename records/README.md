# 黑胶藏品导出 · schema v1

数据唯一来源：唱片馆员维护的「黑胶藏品目录」Page。站点只负责渲染，请勿手改本目录；每次更新由 `/workspace/records-export-build.py` 整体重建。

## 目录结构

```
records-export/
  index.json          # 提交标记，最后写入（见「原子更新」）
  changelog.json      # 每次有记录变化追加一条
  README.md
  people/             # 可选。Person：index.json + <personId>.json
  works/              # 可选。Work：index.json + <workId>.json
  events/             # 可选。Event：index.json + <eventId>.json
  records/<id>/
    record.json       # 结构化字段
    story.md          # 公开长文（来龙去脉），Markdown
    images/           # 用户原图，字节原样（ml4001、mg50370 已无损删除 EXIF GPS 块）
    details/          # 带编号框的细节图（WebP，取自 Page），编号与 record.json details[].text 对应
```

Person／Work／Event 与唱片同树导出。轨迹站可写 `{ "id", "eventId", "blurb?" }` 指向 `events/<eventId>.json`，不再把共享史实的坐标抄进每一张碟。字段与校验以站点 `docs/records-contract.md` 为准。条目 `sha256` 仍只覆盖 `records/<id>/`。

## index.json

```json
{ "schemaVersion": 1, "generatedAt": "2026-10-24T00:31:00+08:00",
  "records": [ { "id": "ml4001", "updatedAt": "…+08:00", "sha256": "…" } ] }
```

- `schemaVersion`：字段有破坏性变化时 +1，并会提前通知。
- `updatedAt`：该条内容（sha256）最后一次变化的时间；内容不变则保持原值。
- `sha256`：对记录目录内 `record.json`、`story.md`、`images/*`、`details/*` 计算：把相对路径按字典序排序，依次 `update(相对路径 UTF-8 + 0x00 + 该文件字节的 SHA-256 摘要)`，取最终 hex。可以用这个值判断某条是否变化。
- 若重跑时没有任何记录变化，index.json 与 changelog.json 字节不变。

## changelog.json

数组，每项 `{ at, schemaVersion, added: [id], changed: [id], removed: [id] }`，按时间追加。

## record.json 字段

| 字段 | 说明 |
|---|---|
| `id` | 条目 id，同目录名 |
| `composer` | 作曲者（流行唱片为词曲作者） |
| `work` | 作品 / 专辑名 |
| `performers` | 演奏者 / 指挥 / 乐团 |
| `label` | 厂牌 |
| `catalogNumber` | 目录号 |
| `category` | `古典` / `流行` 等（Page 暂无该字段，由导出按作品类型标注） |
| `pressing` | 压片版本说明 |
| `matrix` | 母版号 / 死蜡刻字的文字转录 |
| `recording` | 录音时间、地点、制作人、录音师 |
| `eq` | 回放均衡曲线 |
| `condition` | 品相（Goldmine 分级，照片估，文字原样） |
| `year` | 压片 / 发行年；未查到则省略；推测值会注明「推测」 |
| `verificationStatus` | `verified` / `partial` / `pending` |
| `statusLabel` | Page 上的原始中文状态，展示时用原文 |
| `notes` | 1–2 句公开简介 |
| `links` | `[{title, href, site}]` 公开出处 |
| `images` | `[{file, kind, caption, …flags}]`，`file` 为相对记录目录的路径 |
| `details` | `[{file, caption, text}]` 编号框细节图及其编号说明（`\n` 分行） |

### images[].kind
`cover-front` · `cover-back` · `label` · `runout` · `obi` · `insert` · `detail`（`details/` 下的编号框细节图）。
封套与标签拍在同一张原图里时（ml4001、mg50370）记为 `cover-front`，caption 里注明。
腰封贴在封套正面一起拍时，原图记为 `cover-front`，腰封细节图记为 `detail`（文件名 `obi.webp`）。

### images[] 标记（仅为 true 时出现，均为人工看图判定）
- `hasHandwriting`：封套 / 贴纸上有手写字迹。用户已同意公开，标记只供展示时说明。
- `showsPrice`：画面里能看到价格（腰封定价、价签等）。
- `showsStoreSticker`：画面里有店铺贴纸。
- `showsHomeEnvironment`：画面里能看到用户家中环境（家具、毯子、桌面），或盘面反光里映出拍摄者或房间。

## 文件命名
- 原图：`cover-front.jpg`、`cover-back.jpg`、`label-d<碟>-s<面>.jpg`、`runout-d<碟>-s<面>.jpg`、`obi.jpg`、`insert-<n>.jpg`。
  - 面号用数字，Side A = 1、Side B = 2；多碟套装的面号连续编，如 FALP 381/382 为碟 1 的第 1、2 面、碟 2 的第 3、4 面。
  - 同一面有两张时加后缀，如 `label-d1-s2-disc.jpg`（整张盘面全景）。
- 细节图：`details/` 下同样按此命名，扩展名 `.webp`。

## 状态映射与展示规则
- `statusLabel` 以「已核」开头 → `verified`（如「已核（死蜡未拍）」）
- 以「大体已核」开头 → `partial`
- 其余（「待复核」「待核」「待核（仅口述）」…）→ `pending`

展示：`verified` 和 `partial` 显示 `pressing`、`matrix`，并带 `statusLabel` 原文；`pending` 不显示 `pressing` 和 `matrix`（数据里仍保留），状态用 `statusLabel` 原文。死蜡照片（`kind: runout`）默认不上站，只展示 `matrix` 文字。品相（`condition`）和带手写字迹的照片可以公开。

## 原子更新
构建脚本先在 `/workspace/.records-export.tmp/` 生成完整的新目录（不含 index.json，只有 `index.json.tmp`），校验以下各项：
- 所有 JSON 能解析；
- 引用的文件都存在，且目录里没有未被引用的文件；
- sha256 重算一致；
- `verificationStatus` 与 `statusLabel` 的映射一致。

校验通过后，用 Linux `renameat2(RENAME_EXCHANGE)` 把新旧目录一次性互换，再把 `index.json.tmp` 改名为 `index.json`，最后删掉旧目录。index.json 是提交标记，所以读取方：
1. 先读 `index.json`；不存在说明正处在那一瞬间的切换中，稍后重试。
2. 再按其中的 sha256 校验各记录。
若这次没有任何变化，导出目录不会被改动。

## 不包含
估价、购买价格、购入渠道、卖家、个人信息、证据表、补拍清单。封套、腰封上印的价格已从文字里去掉；照片上可见的价格用 `showsPrice` 标出。

## 版本
- v1（2026-10-24）：首版，每条一个目录。旧的平铺导出备份在 `/workspace/records-export-v0/`。
