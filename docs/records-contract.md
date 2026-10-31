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

## 时空轨迹（可选）

`schemaVersion` 仍是 `1`。`trajectory` 是 `record.json` 的可选顶层键，和 `story.md` 一样属于公开正文。没有这个键的旧导出仍然合法。

没有 `trajectory` 时，单碟页不渲染「时空轨迹」，`/records/map/` 也不收录该碟。写了 `trajectory` 但 `places` 是空数组：构建失败。删掉整个键，不要留空壳。

`records-legacy/` 可以按同一形状加算，不必先迁成 v1。旁注若还没经馆员终核，必须在 `blurb` 里写明是示意，页面不当成定论。

底图不在导出里，也不进版式层。本地矢量底图的路径、缩放和署名集中在 `src/data/map-tiles.ts`。页面用 Natural Earth 1:50m 陆地与国界（`public/maps/` 里的 world-atlas TopoJSON，运行时获取，不内联进 HTML），不请求远程栅格瓦片，也没有远程瓦片兜底。地图角标写 Made with Natural Earth。几何数据为公有领域；TopoJSON 再分发见 `public/maps/LICENSE`。

脚本镜头把条目里的 `zoom` 回退 1.5 级，并且不超过 6.2，好让这张 1:50m 图上还看得到海岸和国界。探索缩放上限仍是 12，停在城市级，不到街道。

停站的年份、角色、中文地名、拉丁地名和旁注写在地图下方的旁白条里，镜头落定后淡入。不在地图上盖说明卡片。导播卡上的旁注是全文，自然换行，不截断；站点列表也是同一句全文。跨洋的一段在飞行中段可以把旁白换成很短的海域名（如「大西洋」），仍写在地图下方；镜头落定后恢复该站旁注全文。旁注较长时停站在原有停留上延长，便于读完，最长 12 秒。宽屏（约 900px 起）地图在左，旁白列粘在右侧。单碟嵌入和 `/records/map/` 用同一套版式。

单碟从第一站开播时，先把这一张碟的整条路径收入视野，停约 1.5 秒，再飞第一站。系统开了减少动态效果时跳过这下停留，直接落在第一站，旁白保持可读。站与站之间短距约 3.2 秒，中距约 4.5 秒，跨洋约 6.5 秒；落定仍约 0.7 秒。巡航连续收到目标缩放前约 0.4 级，落定只推这最后一步，并且是在矢量底图上推。短距和中距不冻底图。只有跨洋，或走廊明显超出当前已绘范围时，巡航才换成走廊的一张静止图；先回到矢量，再落定，不对着静图推 zoom。

`/records/map/` 上没选中的碟用海岸色铅笔虚线，选中的碟用砖色 `#a8432b` 实线。不另加强调色，也不做人物筛选。嵌在唱片页里的地图进视口才开始播，离开视口就暂停。探索中的按钮写「回到导播」，点一下回到原来的导播锁定，不另开一层控件。

### 形状

```json
{
  "trajectory": {
    "titleZh": "时空轨迹",
    "places": [
      {
        "id": "leipzig",
        "year": 1723,
        "yearLabel": "1723–50",
        "cityZh": "莱比锡",
        "city": "Leipzig",
        "role": "composition",
        "lon": 12.373,
        "lat": 51.34,
        "zoom": 8,
        "blurb": "可选一句旁注"
      }
    ]
  }
}
```

| 字段 | 必填 | 类型 | 说明 |
| --- | --- | --- | --- |
| `places` | 是 | `Place[]` | 至少 1 个。空数组构建失败 |
| `titleZh` | 否 | string | 节标题。缺省时页面用「时空轨迹」 |

未知键构建失败。

`places[]` 的顺序就是叙事和飞镜顺序。不要另造 `order`。`year` 只用于排序和需要整数年的场合；同一年再按数组下标。`yearLabel` 不参与排序。

| 字段 | 必填 | 类型 | 说明 |
| --- | --- | --- | --- |
| `id` | 是 | string | 碟内唯一。`^[a-z0-9]+(?:-[a-z0-9]+)*$`。给深链当锚点，不要求跨碟唯一 |
| `year` | 是 | int | 公历年，`1500…2100`。区间取起点（`1723–50` → `1723`，`1981-05` → `1981`） |
| `yearLabel` | 否 | string | 页面上显示的时间，如 `1723–50`、`1981-05`。非空，最长 32。缺省时页面显示 `String(year)` |
| `cityZh` | 是 | string | 中文地名，界面主文案 |
| `city` | 是 | string | 拉丁或通用地名。无障碍、检索，以及总览跨碟聚类用它 |
| `role` | 是 | enum | 见下表。每点一个主角色 |
| `lon` | 是 | number | WGS84 经度，`-180…180` |
| `lat` | 是 | number | WGS84 纬度，`-90…90` |
| `zoom` | 否 | int | `3…12`。缺省由页面按镜头自定 |
| `blurb` | 否 | string | 一句公开旁注。禁止估价、购入渠道和隐私 |

### 角色

只能填下列值。不够用时先改本契约，不接受自由字符串。页面上的中文短标签由站点对照，不写进 JSON。

| 值 | 中文 |
| --- | --- |
| `birth` | 出生 |
| `composition` | 创作 |
| `premiere` | 首演 |
| `recording` | 录音 |
| `pressing` | 压片 |
| `release` | 发行 |
| `performance` | 演出 |
| `residence` | 居住 |
| `other` | 其它 |

`role` 为 `other` 时 `blurb` 必填。同一城市若有两层意思，选一个主角色，另一层写进 `blurb`。不要为了双重语义拆成两个同坐标点，除非确实要停两镜。

### 校验

1. 有 `trajectory` 就必须是对象，且 `places` 非空。
2. `id` 在该碟内唯一。`lon` / `lat` 是有限数字，并落在上面的范围里。
3. `year` 超出 `1500…2100` 时构建失败。
4. 「永不导出」的禁令覆盖 `trajectory` 整棵子树。
5. `src/data/records-layout.json` 里任一键名为 `trajectory`、`places`、`lon` 或 `lat`（大小写不敏感，含嵌套）时构建失败。坐标只放在导出里。

### 页面

- `/records/<id>/`：只有 `places` 非空才在文末嵌入地图，画本地底图和这一碟的路径。链到 `/records/map/`。停站文案在旁白条，不盖在地图上。
- `/records/map/`：汇总所有带轨迹的碟，版式与单碟嵌入相同。跨碟弱连只出现在总览：拉丁 `city` 在忽略大小写和首尾空白后相同，或经纬度各自四舍五入到两位小数后相同，即视为同一处；只连接不同的唱片。
- 没有轨迹的碟不出现这一节，也不加载地图脚本。地图脚本不进入全站布局。
- 时间文案用 `yearLabel`，否则用 `year`。
- 压片在核到城市之前只标国家，不标厂址，也不要用街景坐标冒充厂址。

构建末尾运行 `scripts/warn-trajectory-blurbs.mjs`。若某条 `places[].blurb` 含「示意」或「待馆员核定」，或含实现用语（「飞镜」、`year 暂`），向 stderr 打警告，**退出码仍是 0**。没有 `trajectory` 的唱片不产生这条警告，也不因此不能进票。

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

`src/data/records-layout.json` 是数组，每条是 `{ id, image, detailsNote, details[] }`。轨迹字段不能写在这里，见「时空轨迹」。

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

## 同步（推荐：ship-request）

默认一键路径读馆员票，**append-only**，不看正文／不评框：

```bash
node scripts/ship-records.mjs --request /workspace/records-export/ship-request.json
```

### `ship-request.json`（schemaVersion 1）

放在导出旁（常用 `/workspace/records-export/ship-request.json`）。例：

```json
{
  "schemaVersion": 1,
  "exportDir": ".",
  "generatedAt": "2026-10-31T10:29:39+08:00",
  "ids": ["dg10049"],
  "records": {
    "dg10049": {
      "recordSha256": "37bb2e45…（与 index.json 该条 sha256 一致）",
      "marks": "ready",
      "detailsDraft": "site-marks/dg10049-details-draft.json",
      "siteMarksDir": "site-marks/dg10049",
      "imageCheckState": "site-marks/image-check-state-dg10049.json",
      "trajectory": "none",
      "detailsNote": "可选；缺省用导出 details[].caption 拼接"
    }
  }
}
```

| `marks` | 含义 |
| --- | --- |
| `ready` | 须有 `detailsDraft` + `siteMarksDir`（plate／upright webp）；可选 `imageCheckState`（若给则 `stage` 须为 `ready`）。脚本写入 layout `marks[]` 与 `public/records/<id>/`。 |
| `none` | 无题铭；`ensureRevealAssets` 补最小 reveal（空 marks）。**不算题铭完成**。 |
| `waived` | 同 `none`，但必须非空 `waiverReason`。 |

| `trajectory` | 含义 |
| --- | --- |
| `ready` | 该条导出 `record.json` 必须有非空 `trajectory.places[]`，并满足上文「时空轨迹」的全部校验。可选 `trajectoryCheckState`（旁路 JSON 路径）；若给了，其中 `stage` 必须为 `ready`。 |
| `none` | 导出 **不能** 有 `trajectory` 键。页面不渲染地图。 |

票上每条 id 都必须写 `trajectory`。缺这个字段时 ship 失败，**不会**默认为 `none`。`none` 但导出里仍有 `trajectory` 键，失败。`ready` 但没有非空 `places`，失败。页面行为不变：导出里没有 `trajectory` 的唱片仍然不渲染地图。

题铭旁路目录（与导出同树，避免站仓外路径）：

```
records-export/
  ship-request.json
  index.json
  records/<id>/…
  site-marks/
    <id>-details-draft.json
    <id>/*.webp
    image-check-state-<id>.json   # 可选
```

脚本步骤：

1. 校验票面与导出条目 sha；校验选中 id 的 JSON（禁止字段／schema）；对照票面 `trajectory` 与导出 `record.json`。失败则退出码非 0，不提交。
2. `append-records`：只合并票里的 id 进 `records/records/<id>/`，更新 `index.json`／`changelog.json`，**保留**站上其它 id。
3. `marks=ready` → `apply-site-marks`；否则留给下一步最小 reveal。
4. `ensureRevealAssets`：补缺 upright／crop／hero；**不发明 marks**。
5. 只暂存 `records/`、`src/data/records-layout.json`、`public/records/`，开 PR；CI（`npm run check`、`npm run build`）绿且 diff 仍只是这些文件时 squash 合并。

工作区不干净时拒绝运行。重压图片需要 `npm install --no-save sharp`（不写入 `package.json`）。

### 整包导入（少用）

```bash
node scripts/ship-records.mjs /workspace/records-export
```

若站上有导出缺失的 id，脚本**默认失败**（防 wipe）。确认要整树替换时才加 `--force-full`。

只拷导出、不开 PR：

```bash
node scripts/append-records.mjs /workspace/records-export --ids id1,id2
node scripts/import-records.mjs /workspace/records-export   # 整包，同样有 wipe 风险
```

## 工作流

1. 馆员更新 `/workspace/records-export/`，写好 `ship-request.json`（及需要的 `site-marks/`），通知变更 id + 条目 sha + 票路径。
2. 建站工（或定时）跑 `ship-records.mjs --request …`。数据-only 且 CI 绿时脚本自行合并；**不经人工读正文／看图**。
3. 改展示代码或本契约／脚本的 PR 由站长合并。
