# 字不得压字（soft 补票 P1）· 实现计划

> 基线 origin/main `9ec5f64`（#174）。分支 `disc-text-overlap-p1`。一 session 串行（注文与年轨无同文件，但都小，串行最省）。
> 用 superpowers：`executing-plans` + `test-driven-development` + `verification-before-completion`。

**目标**：窄屏 settled 注文可读——无拉丁一字一折、不互压、不贴滚动条裁；左纵年轨两串年号不同像素（1951∩1956、1876/1886）。

**证据**：`/workspace/runway-174-soft/03-settled-elbow.png`（侧带列约 2.5rem，WILHELM／Grand… 碎折）；`/workspace/shell-chrome-171-soft/01-map-guide.png`（年轨 1951∩1956 贴压）。

**非目标**：题槽同壳异体制（另票，交网页设计）；PC ≥48rem letterbox 行为；#172 scrub／#173 overlay；marks／export 字段名。

## Task 0 — 契约面（签名＋常量，测只断言导出）

```ts
// src/data/settled-band-notes.ts
/** 侧带列宽下限：低于即改上下 letterbox 横排。 */
export const BAND_NOTE_MIN_REM: number; // 建议 7（≈ 14 个 CJK／一行拉丁单词不碎折）
export type BandLayout = 'side' | 'stack';
/** 侧带够宽→'side'；否则→'stack'（plate 上／下奶油带横排）。 */
export function bandLayoutFor(args: { pane: PxSize; plate: FrameBox; rem: number }): BandLayout;
// BandNotePlacement 增 side: 'left'|'right'|'top'|'bottom'；stubX 之外增 stubY（top/bottom 时肘终点 y）
// placeBandNotes 内部按 bandLayoutFor 分流；stack 时注文宽 = min(pane.width - 2·gap, 28rem)
// bandLeaderPoints 支持 top/bottom：竖向引出、拐一次、终点落注文 stub 边

// src/data/disc-chapters.ts
/** 年轨标签最小间距（0→1 比例）；`yearRailPins` 推开相邻 t，保持年序，首尾仍落 [0,1]。 */
export function yearRailPins(places, opts?: { minGapT?: number }): YearRailPin[];
```

DOM hooks 不变：`.disc-record-marks[data-band]` 增值 `'stack'`（读者写，CSS 读）；`li[data-side]` 增 `top|bottom`。

- [x] T0.1 写导出签名＋`BAND_NOTE_MIN_REM`，Task0 测断言导出存在

## Task 1 — 注文：窄侧带改上下 letterbox 横排（测→改→验）

- [x] T1.1 RED：`settled-band-notes.test.ts` 加 390×640 pane、窄 plate 侧带＜`BAND_NOTE_MIN_REM` 时 `bandLayoutFor==='stack'`，注文 width ≥ `BAND_NOTE_MIN_REM·rem`
- [x] T1.2 RED：stack 时任意两注文矩形不相交、注文∩plate＝∅、全落 pane 内（右边距 ≥ gap，避滚动条）
- [x] T1.3 RED：侧带够宽仍走 'side'（旧测不改语义）
- [x] T1.4 GREEN：实现 `bandLayoutFor`／`placeBandNotes` stack 分支／`bandLeaderPoints` 竖向肘
- [x] T1.5 接线 `disc-chapter-reader.ts`：stack 时 `data-band='stack'`、宽度按 stack 写；`global.css` `.disc-record-marks li` 加 `overflow-wrap: normal; word-break: keep-all` 兜底（禁 break-all）
- [x] T1.6 源测：reader 引用 `bandLayoutFor`；CSS 无 `word-break: break-all`

## Task 2 — 年轨避让（测→改→验）

- [x] T2.1 RED：`disc-chapters.test.ts` 以本盘年份 [1770,1822,1876,1886,1951,1956] 断言相邻 t 差 ≥ minGapT，且保序、t∈[0,1]
- [x] T2.2 GREEN：`yearRailPins` 前推＋尾部回压（同 `railLayout` 的 min-gap 语义），默认 minGapT 按 11rem 轴、标签行高推出（写在注释）
- [x] T2.3 若 rail 实际高度可变：`TrajectoryMap.astro` 不改结构，仅保持 `--pin-t`

## Task 3 — 验收

- [x] T3.1 `node --test src/data/*.test.ts` → 0
- [x] T3.2 `npm run check`（Node＜Astro 要求则记环境已知交 CI）
- [x] T3.3 ego-browser 390×844：settled 注文截图＋地图年轨截图存 `/workspace/disc-text-overlap-p1/`
- [ ] T3.4 commit＋push＋开 PR（不合入），正文写证据／理由（stack vs 加宽、避让 vs 抽稀）
