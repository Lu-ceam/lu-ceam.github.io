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
/**
 * 旧的 5.6em 内容封顶。固定分割之后介绍窗不再用它定高（行是定长的），
 * 常量留着，避免把「三到四行」的旧口径写成一个新的魔数。
 */
export const COMPACT_BLURB_MAX_EM = 5.6;
/**
 * 矮屏兜底：旁白行不超过舞台的 46%。不是 320 与 390 共用的比例
 * （那会差出一行多）；320×568 上 46% 大于定长，不触发。
 */
export const COMPACT_NARR_CAP_PERCENT = 46;
/**
 * 无 timeNote 时介绍窗的可见行数。320 取 4.4（带 timeNote 仍 ≥3.45，高于三行底线）；
 * 390 的可见行是实测 4.46，不写成 4。
 */
export const COMPACT_BLURB_LINES_NARROW = 4.4;
export const COMPACT_BLURB_LINES_WIDE = 4.46;
/** 三行是介绍窗的下限，不是行高分配的开关。 */
export const COMPACT_BLURB_MIN_LINES = 3;
/** 矮屏兜底（px）：舞台高 × 46%。定长行更矮时不生效。 */
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

/**
 * 舞台行模板：地图行吃剩余高（地板 180），旁白行定长。
 * 长短站、飞行中、timeNote 都不换这一套；46% 只兜矮屏。
 */
export const COMPACT_STAGE_ROWS = `minmax(${COMPACT_MAP_MIN_PX}px, 1fr) min(var(--traj-narr-h), ${COMPACT_NARR_CAP_PERCENT}%)`;
/**
 * ≤359 的旁白定长：题头 ≈54px ＋ 4.4 行介绍窗（13px / 1.65）。
 * 360–389 沿用同一档。≥390 的定长按分界实测另写，不套这个公式。
 */
export const COMPACT_NARR_H_NARROW = 'calc(54px + 4.4 * 1.65 * 13px)';

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
