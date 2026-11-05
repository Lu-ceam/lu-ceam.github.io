# Plan · 窄屏唱片章 fused crop（同图融合裁窗＋settled 淡衬＋号标避框＋注文真高减载）

- PRD：`/home/box/web-layout/prd-disc-record-fused-crop.md`
- Demo（PASS）：`/workspace/disc-record-fused-crop-demo/`（`OUTER_MID=0.82`／`OUTER_SETTLED=0.14`／`badgeAnchorAvoidInk`；qa/NOTES.md）
- FAIL：`/workspace/runway-175-rerun/`（02-mid-scrub／03-settled-edge／edge-settled-bot）
- 基线：origin/main `26f2a4e`（#176）
- 分支／worktree：`disc-record-fused-crop`
- 单 lane（串行；文件少、耦合紧，不拆并行）

## 非目标
不改 marks／YAML 字段名；不重做切面圆点／自动播；不碰桌面 split 视觉；不 pinch／scale；不回退 #174/#175/#176。

## Task 0 · 契约面（先落，后续不得改签名）
- [ ] `src/data/detail-display.ts`
  - `export const OUTER_MID_MIN = 0.75`、`export const OUTER_SETTLED_FLOOR = 0.14`（命名常量，测引用）
  - `outerFade(cropT)`：单调不增；`cropT=0→1`；`cropT=0.5→≈0.82（≥0.75）`；`cropT=1→OUTER_SETTLED_FLOOR(>0)`。导出供测试。
  - `fillCropPaint` 字段名不变（outerOpacity/windowOpacity/plateOpacity）。
  - `badgeCenter(mark, plateWidth, marks?: readonly MarkBox[])` 返回形状不变 `{cx,cy,r,fontSize}`；新增可选第三参＝同 plate 全部 mark-box；薄框不再退回框心。
  - 新导出 `circleIntersectsBox(c:{cx,cy,r}, box:{x,y,w,h}): boolean`（测与实现共用）。
- [ ] `src/data/settled-band-notes.ts`
  - `BandNotePlacement` 加 `shed?: boolean`（挤不下被减载的条）。`placeBandNotes` 入参可选 `priorities?: readonly number[]`（缺省＝阅读序，越小越优先保留）。
- [ ] CSS 归属：窄屏 `.disc-record-cover-frame > .crop-window` 只在 `src/styles/global.css` 一处定义；不新增 CSS 变量。
- [ ] DOM hook：被减载 `li[data-shed="1"]`（隐藏，并 `aria-hidden`）；容器 `data-notes-shed="<n>"` 明示。

## Task 1 · RED：源测／单测先写
- [ ] `detail-display.test.ts`：mid 下界 `fillCropPaint({cropT:0.5}).outerOpacity >= 0.75`；settled 地板 `cropT:1 → > 0` 且 ≈0.14；单调不增；替换旧「≤0.25／≤0.05」断言（那是被否的旧口径）。
- [ ] badge：薄条 mark（h < 直径）→ 号标圆与**所有** mark-box 不相交；FALP381 实际 marks（Grand Prix 行）fixture 断言 ②∩任一 box＝∅；宽框旧 tl/tr 行为保持。
- [ ] 源测（global.css）：窄屏 `.disc-record-cover-frame > .crop-window` 规则不含 `0.45rem`、不含 `var(--bg)`、无 blur>2px 的 drop shadow；描边 ≤2px；`background: transparent`。`.disc-record-cover-img` 无 `0 10px 30px` 卡影（窄屏 settled plate 无白垫／卡影）。
- [ ] settled-band-notes：真高输入下注∩注＝∅、注∩plate＝∅；pane 装不下时按 priority 减载（`shed`），不 clamp 叠压。
- [ ] 源测：reader 用 `getBoundingClientRect`／`offsetHeight` 量高（禁魔法估高 [48,56]）；settled 不 `visibility:hidden`／opacity 0 外层 upright。
- [ ] 跑 `node --test src/data/*.test.ts` 确认新测 RED（记录退出码）。

## Task 2 · P0 改：halo／outer 曲线／settled 地板
- [ ] global.css 删 halo＋drop，仅 `0 0 0 1.5px` 砖描边；cover-img 卡影去掉（窄屏）。
- [ ] `outerFade` 改为 demo 曲线（mid≈0.82，settled 0.14），更新注释说明为何修订 `(1-t)²`。
- [ ] `disc-cover-crop.ts`／reader：settled 不卸 upright；letterbox 纸带不遮死 upright（纸带若有实底改为半透／透明让淡衬透出）。

## Task 3 · P1 改：号标避框＋注文真高减载
- [ ] `badgeCenter` 薄框：缩半径（≥ ~0.7×）锚 mark AABB 外空白（下→上→左 gutter→右 gutter 依次试），与所有 box 不相交且留在 plate 内；`[id].astro` 三处调用传全部 marks。
- [ ] `placeStackNotes`/side 路径：顺序放置时若越 pane 或会与已放条相交 → 按 priority 低者 `shed`；reader 写 `data-shed`；放置后再用 `getBoundingClientRect` 实测相交兜底（相交则减载最低优先级重排一次）。

## Task 4 · 验
- [ ] `node --test src/data/*.test.ts` exit 0
- [ ] `npm run check` exit 0（Node 版本不满足则记环境已知，交 CI）
- [ ] ego-browser 390×844：FALP381 mid（cropT≈0.5）／settled 截图存 `/workspace/fused-crop-pr-qa/`，对照 demo qa 与 runway-175-rerun

## Task 5 · 开 PR（不合入）
- [ ] commit＋push `disc-record-fused-crop`；`gh pr create --base main`；正文写 PRD／demo／FAIL 路径、P0/P1 对照、测退出码。
