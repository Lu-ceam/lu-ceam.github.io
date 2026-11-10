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
import {
	axisT,
	knownYear,
	precisionOf,
	timelineOrder,
	unknownStations,
	type CatalogDomain,
	type TimePrecision,
	type TimeShape,
} from './trajectory-time.ts';

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
	/** 本碟有 Y0 站时顶帽文字让给该站年号（PRD §5.3）。 */
	topCapText: boolean;
	domain: CatalogDomain;
};

/**
 * 纵轴布局。点先用公式落到 `dotY` 且永不移动；随后才做触点块避让与合并。
 * 全 unknown 或空域返回 `dots: []` 与 `targets: []`（不画假轴、不除零）。
 */
export function layoutYearAxis(input: {
	places: readonly TimeShape[];
	ids: readonly string[];
	domain: CatalogDomain;
	height: number;
}): YearAxisLayout {
	const height = Math.max(0, input.height);
	const { domain } = input;
	const unknown = unknownStations(input.places).map((row) => ({
		id: input.ids[row.index] ?? String(row.index),
		placeIndex: row.index,
	}));
	const reserve = unknown.length > 0 ? AXIS_UNKNOWN_SLOT_PX : 0;
	const axisTop = AXIS_CAP_PX;
	const axisBottom = Math.max(axisTop, height - AXIS_CAP_PX - reserve);

	const rows = timelineOrder(input.places).filter((row) => domain.y0 !== null && knownYear(row.place) !== null);
	const dots: AxisDot[] = rows.map((row) => {
		const year = knownYear(row.place) as number;
		const t = axisT(year, domain) ?? 0;
		return {
			id: input.ids[row.index] ?? String(row.index),
			placeIndex: row.index,
			year,
			t,
			y: axisTop + t * (axisBottom - axisTop),
			precision: precisionOf(row.place),
		};
	});

	const groups: AxisDot[][] = [];
	for (const dot of dots) {
		const last = groups[groups.length - 1];
		const tail = last?.[last.length - 1];
		if (last && tail && dot.y - tail.y < AXIS_DOT_MERGE_PX) last.push(dot);
		else groups.push([dot]);
	}

	const hasY0 = domain.y0 !== null && dots.some((dot) => dot.year === domain.y0);
	// 本碟有 Y0 站时顶帽文字让给该站年号，触点可以贴到轴顶；否则给顶帽留 22px。
	const lo = hasY0 ? 0 : AXIS_CAP_PX;
	const hi = axisBottom;

	// 超距就并：锚点离触点超过 60px 的槽与较近的邻槽并簇，重排到收敛。
	let targets: AxisTarget[] = dodge(groups, lo, hi);
	for (let guard = 0; guard < 128; guard += 1) {
		const bad = targets.findIndex((target) => Math.abs(target.y - target.anchorY) > AXIS_MAX_SHIFT_PX);
		if (bad < 0) break;
		const current = targets[bad]!;
		const previous = targets[bad - 1];
		const next = targets[bad + 1];
		const intoPrevious =
			!next ||
			(previous !== undefined &&
				Math.abs(current.anchorY - previous.anchorY) <= Math.abs(next.anchorY - current.anchorY));
		const neighbour = intoPrevious ? previous : next;
		if (!neighbour) break;
		const a = Math.min(groups.findIndex((group) => group[0]?.id === current.members[0]), groups.findIndex((group) => group[0]?.id === neighbour.members[0]));
		if (a < 0 || a + 1 >= groups.length) break;
		groups.splice(a, 2, [...(groups[a] ?? []), ...(groups[a + 1] ?? [])]);
		targets = dodge(groups, lo, hi);
	}

	const ticks: YearAxisLayout['ticks'] = [];
	if (domain.y0 !== null) {
		for (let year = Math.ceil((domain.y0 + 1) / 100) * 100; year <= domain.yNow; year += 100) {
			const y = axisTop + (axisT(year, domain) ?? 0) * (axisBottom - axisTop);
			const clash = targets.some((target) => y > target.top - 7 && y < target.bottom + 7);
			ticks.push({ year, y, label: !clash });
		}
	}

	return {
		height,
		axisTop,
		axisBottom,
		dots,
		targets,
		unknown,
		unknownSlot: unknown.length > 0 ? { top: height - reserve, bottom: height } : null,
		ticks,
		topCapText: !(hasY0 || targets.some((target) => target.top < AXIS_CAP_PX)),
		domain,
	};
}

type Slot = { group: AxisDot[]; anchor: number };
type Block = { items: Slot[]; start: number };

/**
 * 经典一维块避让：每个单站／簇是一个 44px 槽，槽先在 `[lo, hi]` 内按锚点均值居中，
 * 相邻块重叠就合并再居中。**合并块只改排版，不改簇的身份**：一个槽仍然只属于
 * 它自己那一组点，所以「簇＝点的身份」和「块＝排版的邻居」是两件事。
 */
function dodge(groups: AxisDot[][], lo: number, hi: number): AxisTarget[] {
	const blocks: Block[] = groups
		.filter((group) => group.length > 0)
		.map((group) => ({
			items: [
				{
					group: [...group],
					anchor: ((group[0]?.y ?? 0) + (group[group.length - 1]?.y ?? 0)) / 2,
				},
			],
			start: 0,
		}));
	for (const block of blocks) centre(block, lo, hi);
	let changed = true;
	while (changed) {
		changed = false;
		for (let i = 1; i < blocks.length; i += 1) {
			const previous = blocks[i - 1]!;
			const current = blocks[i]!;
			if (previous.start + previous.items.length * AXIS_TARGET_PX > current.start + 0.01) {
				previous.items.push(...current.items);
				blocks.splice(i, 1);
				centre(previous, lo, hi);
				changed = true;
				break;
			}
		}
	}
	const out: AxisTarget[] = [];
	for (const block of blocks) {
		block.items.forEach((slot, index) => {
			const y = block.start + index * AXIS_TARGET_PX + AXIS_TARGET_PX / 2;
			out.push(toTarget(slot, y));
		});
	}
	return out;
}

/** 块居中的落点：均值锚点减半块高，夹在 `[lo, hi - 块高]` 里。 */
function centre(block: Block, lo: number, hi: number): void {
	const count = block.items.length;
	const mean =
		block.items.reduce((sum, slot, index) => sum + slot.anchor - index * AXIS_TARGET_PX, 0) /
		Math.max(1, count);
	const start = Math.min(Math.max(mean - AXIS_TARGET_PX / 2, lo), Math.max(lo, hi - count * AXIS_TARGET_PX));
	block.start = start;
}

function toTarget(slot: Slot, y: number): AxisTarget {
	const group = slot.group;
	return {
		key: group[0]?.id ?? '',
		y,
		top: y - AXIS_TARGET_PX / 2,
		bottom: y + AXIS_TARGET_PX / 2,
		anchorY: slot.anchor,
		members: group.map((dot) => dot.id),
		placeIndexes: group.map((dot) => dot.placeIndex),
		firstYear: group[0]?.year ?? 0,
		lastYear: group[group.length - 1]?.year ?? 0,
		cluster: group.length > 1,
		leader: Math.abs(y - slot.anchor) > 2,
	};
}

export function axisDotHit(
	layout: YearAxisLayout,
	y: number,
	tolerance = AXIS_DOT_HIT_PX,
): AxisTarget | null {
	if (layout.dots.length === 0) return null;
	let closest: AxisDot | null = null;
	let best = Infinity;
	for (const dot of layout.dots) {
		const distance = Math.abs(dot.y - y);
		if (distance < best) {
			best = distance;
			closest = dot;
		}
	}
	if (!closest || best > tolerance) return null;
	// 路由到**拥有该点**的触点：单站即该站，簇即该簇。绝不回落到「最近的标签」。
	return layout.targets.find((entry) => entry.members.includes(closest!.id)) ?? null;
}

/** 触点文字：单站 4 位年；簇「首年＋N站」；簇内有当前站「当前年＋组i/N」。 */
export function axisTargetLabel(
	target: AxisTarget,
	activeId: string | null,
	yearsById: ReadonlyMap<string, number>,
): { main: string; sub: string } {
	if (!target.cluster) return { main: String(target.firstYear), sub: '' };
	const position = activeId === null ? -1 : target.members.indexOf(activeId);
	if (position < 0) return { main: String(target.firstYear), sub: `${target.members.length}站` };
	const year = yearsById.get(activeId!);
	return {
		main: String(year ?? (target as AxisTarget & { firstYear: number }).firstYear),
		// 「组 i/N」是簇内年代序，不是导览步号；导览写「导览 k/n」，两者不能互相冒充。
		sub: `组${position + 1}/${target.members.length}`,
	};
}

/**
 * 簇副字的可见写法。`axisTargetLabel` 仍返回「N站」；≥100 站本馆不会出现，
 * 标签道 40px 放不下三位，渲染时收成「99+站」。组序「组 i/N」原样。
 */
export function formatAxisSub(sub: string): string {
	const count = /^(\d+)站$/.exec(sub);
	if (!count) return sub;
	return Number(count[1]) >= 100 ? '99+站' : sub;
}

/**
 * 簇触点的无障碍名。可见文字是两行「年 / N站」，中间只藏一个「 · 」给 textContent；
 * 读屏走这句，不把「1981」和「2站」粘成「19812站」。
 * 同年只写一个年；城市按成员序，顿号分隔。
 */
export function axisClusterAriaLabel(
	target: Pick<AxisTarget, 'members' | 'firstYear' | 'lastYear'>,
	yearsById: ReadonlyMap<string, number>,
	citiesById: ReadonlyMap<string, string>,
): string {
	const years = target.members
		.map((id) => yearsById.get(id))
		.filter((year): year is number => typeof year === 'number');
	const min = years.length > 0 ? Math.min(...years) : target.firstYear;
	const max = years.length > 0 ? Math.max(...years) : target.lastYear;
	const year = min === max ? `${min} 年` : `${min}–${max} 年`;
	const cities = target.members
		.map((id) => citiesById.get(id))
		.filter((city): city is string => Boolean(city));
	const place = cities.length > 0 ? `${cities.join('、')}。` : '';
	return `${year}，${target.members.length} 站：${place}展开站表`;
}

/**
 * 簇／未知列表的行序：**按轴上的年代序**（点已经排好），不是旁白数组序。
 * 每一行带回原 `places[]` 下标——旁白步号要按它算，列表行号不能冒充导览步号。
 */
export function axisListOrder(target: AxisTarget): { id: string; placeIndex: number }[] {
	return target.members.map((id, position) => ({
		id,
		placeIndex: target.placeIndexes[position] ?? -1,
	}));
}

/** 未知站列表的行序：**原数组序**（轴上没有它们的位置，所以按数据序读）。 */
export function unknownListOrder(
	layout: Pick<YearAxisLayout, 'unknown'>,
): { id: string; placeIndex: number }[] {
	return layout.unknown.map((row) => ({ id: row.id, placeIndex: row.placeIndex }));
}
