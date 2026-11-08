/**
 * 手机地图章 compact chrome 的几何口径。
 *
 * CSS（`global.css` 窄屏块）、Astro 标记（`TrajectoryMap.astro`）与源码闸门
 * 共用这一组常量，于是「地图地板 180」「控件两行 44」「介绍带 5.6em」不是三处
 * 各写一遍的魔数。
 *
 * 只做算术：不量 DOM、不读视口、不碰时钟。浏览器像素与真机惯性仍要 GUI／真机
 * 复验（PRD §6「明确未验」），这里不是布局 PASS 的证据。
 */

/** 地图地板：132 → 180（PRD §3）。真高来自舞台的 fr，地板只是下限。 */
export const COMPACT_MAP_MIN_PX = 180;
/** 地图占章盒内容高的下限（PRD §3／§6）。 */
export const COMPACT_MAP_MIN_SHARE = 0.48;
/** 介绍带：约 3–4 行 CJK @15px/1.75。只封顶，短文不高挂空带。 */
export const COMPACT_BLURB_MAX_EM = 5.6;
/**
 * 长文时旁白行相对舞台的封顶（百分比）。
 *
 * 长文把介绍带撑到 5.6em 满格时，320×568 的旁白会占到舞台 49.6%，地图只剩
 * 0.473——PRD §6 的 320×568 也要 ≥0.48。封的是**行**（`fit-content(47%)`），
 * 不是旁白盒的最大高：只封旁白盒时行仍按内容撑高（实测 map 不动）。
 */
export const COMPACT_NARR_CAP_PERCENT = 47;
/**
 * 长文介绍带在行内可缩，但**不低于三行**。
 *
 * 三行及以内的短文本来不滚（客户端给它 `.is-short`）；把带子压到三行以下，
 * 两行／三行的短文就会凭空多出滚动条，还会溢到控件下方。
 */
export const COMPACT_BLURB_MIN_LINES = 3;
/** 旁白行封顶（px）：舞台高 × 47%。 */
export function compactNarrCap(input: { stageHeightPx: number }): number {
	return Math.max(0, input.stageHeightPx) * (COMPACT_NARR_CAP_PERCENT / 100);
}
/** 控件：有意两行，行内 nowrap；行高＝触点 44（PRD §3／§5）。 */
export const COMPACT_CONTROL_ROWS = 2;
export const COMPACT_CONTROL_ROW_PX = 44;
export const COMPACT_CONTROL_GAP_PX = 6;
/** 左纵年轴：44px 宽、年号 tabular——四位年号必须整字可读（评审 P2）。 */
export const COMPACT_YEAR_RAIL_PX = 44;
export const COMPACT_YEAR_FONT_PX = 11;
/** 年轴内距：右 1px 墨线。 */
export const COMPACT_YEAR_RAIL_BORDER_PX = 1;
/** tabular 数字一个约占 0.62em（含字间）。 */
export const COMPACT_YEAR_DIGIT_EM = 0.62;

/** 介绍带是否装不下：+1px 吸收亚像素取整，短文不出现无意义滚动条。 */
export function blurbOverflows(metrics: { scrollHeight: number; clientHeight: number }): boolean {
	return metrics.scrollHeight > metrics.clientHeight + 1;
}

/** 舞台行模板：旁白带按内容（`auto`），地图行吃剩余高、地板 180。 */
export const COMPACT_STAGE_ROWS = `minmax(${COMPACT_MAP_MIN_PX}px, 1fr) auto`;
/** 长文时的舞台行模板：旁白行按内容但封顶 47%，地图行吃剩下的。 */
export const COMPACT_STAGE_ROWS_LONG = `minmax(${COMPACT_MAP_MIN_PX}px, 1fr) fit-content(${COMPACT_NARR_CAP_PERCENT}%)`;

/**
 * 地图行高：舞台剩余高，地板 180 兜底。
 *
 * 旁白带按内容增高（头 ＋ 5.6em 介绍带 ＋ 两行控件），所以短屏也不会把地图
 * 顶回地板：320×568 上旁白约 212px，仍给地图约 258px。
 */
export function compactMapHeight(input: { stageHeightPx: number; narrHeightPx: number }): number {
	const stage = Math.max(0, input.stageHeightPx);
	return Math.max(COMPACT_MAP_MIN_PX, stage - Math.max(0, input.narrHeightPx));
}

/** 地图占章盒内容高。 */
export function compactMapShare(input: { chapterHeightPx: number; mapHeightPx: number }): number {
	if (!(input.chapterHeightPx > 0)) return 0;
	return input.mapHeightPx / input.chapterHeightPx;
}

/** 一行 nowrap 的总宽：按钮宽之和 ＋ 间隙。 */
export function controlRowWidth(
	buttons: readonly number[],
	gap: number = COMPACT_CONTROL_GAP_PX,
): number {
	if (buttons.length === 0) return 0;
	return buttons.reduce((sum, width) => sum + width, 0) + gap * (buttons.length - 1);
}

/** 这一行在可用宽里装得下（nowrap 的算术闸门）。 */
export function controlRowFits(input: {
	availablePx: number;
	buttons: readonly number[];
	gap?: number;
}): boolean {
	return controlRowWidth(input.buttons, input.gap) <= input.availablePx;
}

/** 四位年号在 44px 轨道里整字可读：宁可缩写（`'66`）也不许裁成「约 19」类残字。 */
export function yearLabelFits(input: {
	digits: number;
	fontSizePx?: number;
	railPx?: number;
}): boolean {
	const font = input.fontSizePx ?? COMPACT_YEAR_FONT_PX;
	const rail = input.railPx ?? COMPACT_YEAR_RAIL_PX;
	const inner = rail - COMPACT_YEAR_RAIL_BORDER_PX;
	return input.digits * COMPACT_YEAR_DIGIT_EM * font <= inner;
}

/** 介绍带一次竖滑归谁：带内还没到边就归介绍带（只滚字），否则交回地图常规路径。 */
export type BlurbGestureOwner = 'blurb' | 'stage';

/**
 * 介绍带一次竖滑的归属（PRD §4 优先级 2–4）。
 *
 * - `blurb`：还能朝这一边滚字（或探索态归地图拖捏）——只滚字，清 arm，不换站、不切章；
 * - `stage`：已经到这一边的边（或短文本来就没有内滚）——按既有 #183 路径处理：
 *   一次手势一站、端站 arm、松手后同向再来才确认切邻章。这里不另立状态机，
 *   也不替地图决定换站，只回答「这一下归谁」。
 *
 * 探索态返回 `blurb`：调用方据此既不换站也不 arm，地图拖捏照常。
 */
export function blurbGestureOwner(input: {
	/** 介绍带真的有内滚（`scrollHeight > clientHeight + 1`）。 */
	overflow: boolean;
	atStart: boolean;
	atEnd: boolean;
	/** `1` = 手指上推＝往下读。 */
	dir: 1 | -1;
	explore: boolean;
}): BlurbGestureOwner {
	if (input.explore) return 'blurb';
	if (!input.overflow) return 'stage';
	const canScroll = input.dir > 0 ? !input.atEnd : !input.atStart;
	return canScroll ? 'blurb' : 'stage';
}
