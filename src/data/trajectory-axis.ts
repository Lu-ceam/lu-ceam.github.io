/**
 * 手机纵年轴的几何契约（Task 0）：**58px 双道**。
 *
 * 标签道 44px（x ∈ [0, 44)，只放 44×44 触点）＋ 点道 14px（x ∈ [44, 58)，点画在
 * x = 51）。两道互不重叠：任何真实点的像素下都不是别站的标签按钮。点道整条可点，
 * 按 y 路由到**拥有该点的触点**；点道 `aria-hidden`，键盘走标签。
 *
 * 只做算术：不量 DOM、不读视口、不碰时钟。像素与真机仍要 GUI／真机复验。
 * 行为由 Lane B（布局／命中／标签）实现。
 */
import type { CatalogDomain, TimePrecision, TrajectoryTime } from './trajectory-time.ts';

/** 标签道：只放触点，宽度＝触点宽 44。 */
export const AXIS_LABEL_LANE_PX = 44;
/** 点道：只放真实点，宽 14。 */
export const AXIS_DOT_LANE_PX = 14;
/** 年轴列总宽：44 ＋ 14。取代旧的 34／44 窄壳（PRD §9 明确合流）。 */
export const YEAR_RAIL_WIDTH_PX = AXIS_LABEL_LANE_PX + AXIS_DOT_LANE_PX;
/** 点的 x：点道正中。 */
export const AXIS_DOT_X_PX = AXIS_LABEL_LANE_PX + AXIS_DOT_LANE_PX / 2;
/** 每个单站／簇占一个 44px 触点（竖向）。 */
export const AXIS_TARGET_PX = 44;
/** 相邻点距小于一个点径（8px）就并簇。 */
export const AXIS_DOT_MERGE_PX = 8;
/** 触点离锚点超过 60px 就不再算「它的」标签，与较近的邻触点并簇。 */
export const AXIS_MAX_SHIFT_PX = 60;
/** Y0 顶帽与「现在」底帽各自的文字区。 */
export const AXIS_CAP_PX = 22;
/** 轴外「年份未核」槽：在「现在」之下，不属于时间域。 */
export const AXIS_UNKNOWN_SLOT_PX = 44;
/** 点道点击容差：12px 内找最近的真实点，找不到就不动作。 */
export const AXIS_DOT_HIT_PX = 12;

export type AxisDot = {
	/** `place.id`。 */
	id: string;
	/** 原 `places[]` 下标（不是过滤后数组的下标）。 */
	placeIndex: number;
	year: number;
	/** 域内比例 0 → 1。 */
	t: number;
	/** 像素 y：由公式算出，布局永不移动它。 */
	y: number;
	precision: TimePrecision;
};

export type AxisTarget = {
	key: string;
	y: number;
	top: number;
	bottom: number;
	/** 这一触点「属于」的点（单站即该点，簇取首尾中点）。 */
	anchorY: number;
	members: string[];
	placeIndexes: number[];
	firstYear: number;
	lastYear: number;
	cluster: boolean;
	/** 标签被让位（|y − anchorY| > 2）时需要引线。 */
	leader: boolean;
};

export type YearAxisLayout = {
	height: number;
	axisTop: number;
	axisBottom: number;
	dots: AxisDot[];
	targets: AxisTarget[];
	/** 轴外未知站：原数组序。 */
	unknown: { id: string; placeIndex: number }[];
	unknownSlot: { top: number; bottom: number } | null;
	ticks: { year: number; y: number; label: boolean }[];
	domain: CatalogDomain;
};

/**
 * 纵轴布局。点先用公式落到 `dotY` 且永不移动；随后才做触点块避让与合并。
 * 全 unknown 或空域返回 `dots: []` 与 `targets: []`（不画假轴、不除零）。
 */
export function layoutYearAxis(input: {
	places: readonly TrajectoryTime[];
	ids: readonly string[];
	domain: CatalogDomain;
	height: number;
}): YearAxisLayout {
	void input;
	throw new Error('Not implemented: layoutYearAxis');
}

/**
 * 点道点击 → 拥有该点的触点：单站即该触点，簇即该簇。
 * 容差内没有点返回 null（**不**回落到最近标签）。
 */
export function axisDotHit(
	layout: YearAxisLayout,
	y: number,
	tolerance?: number,
): AxisTarget | null {
	void layout;
	void y;
	void tolerance;
	throw new Error('Not implemented: axisDotHit');
}

/** 触点文字：单站 4 位年；簇「首年＋N站」；簇内有当前站「当前年＋组i/N」。 */
export function axisTargetLabel(
	target: AxisTarget,
	activeId: string | null,
	yearsById: ReadonlyMap<string, number>,
): { main: string; sub: string } {
	void target;
	void activeId;
	void yearsById;
	throw new Error('Not implemented: axisTargetLabel');
}
