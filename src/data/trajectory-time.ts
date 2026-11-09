/**
 * 共享真实年轴 ＋ unknown 时间的契约面（Task 0）。
 *
 * 来源：
 * - `/home/box/web-layout/prd-shared-real-time-axis.md`（r3，§13 为实施 Gate）
 * - `/home/box/web-layout/contract-unknown-trajectory-time.md`（§2 字段、§5 consumer、§8 发布 Gate）
 *
 * 本文件在 Task 0 只发布**类型与签名**：行为（域、排序、格式化）由 Lane B 实现。
 * 唯一数字闸门是 `isKnownTime`——任何数字 consumer 都必须过它，禁止散布
 * `Number(year)`、`year || …` 或从 `yearLabel` 推断状态。
 */

/** unknown 站的统一显示文案。屏幕上不出现 `null`／`undefined`／`0`／1982 冒充年份。 */
export const UNKNOWN_YEAR_TEXT = '年份未核';

/** 已核整数年锚点的取值范围（与 `docs/records-contract.md` 现行契约一致）。 */
export const KNOWN_YEAR_MIN = 1500;
export const KNOWN_YEAR_MAX = 2100;

/** 已知时间：存在有依据的整数年锚点。**不表示**精确日期——约年／范围／上下限仍是 known。 */
export type KnownTime = {
	timeStatus: 'known';
	year: number;
	yearLabel?: string;
	/** known 不带未知理由：这个 `never` 让两条分支的属性都可直接读，同时防止两套 truth 并存。 */
	timeNote?: never;
};

/** 未知时间：显式分支，`year` 必须为 null，`timeNote` 必填，且不带 `yearLabel`。 */
export type UnknownTime = {
	timeStatus: 'unknown';
	year: null;
	timeNote: string;
	/** unknown 的 canonical 形状不带 yearLabel（输入里的「—」在边界归一化时移除）。 */
	yearLabel?: never;
};

export type TrajectoryTime = KnownTime | UnknownTime;

/**
 * 时间分支的**结构形状**：SSR 与客户端拿到的对象（`TrajectoryPlace`、payload 的
 * `Place`）都只有联合的 `timeStatus`／`year`，不能赋给带字面量判别式的联合。
 * 所有 consumer 一律吃这个形状，再由 `isKnownTime`／`isUnknownTime` 收窄——
 * 没有第二条路可以让「缺状态」或「靠 label 猜」混进来。
 */
export type TimeShape = {
	timeStatus?: unknown;
	year?: unknown;
	yearLabel?: string | null;
	timeNote?: string | null;
};

/** `yearLabel` 读出的精度类别。只用于显示（虚线点／旁白 meta），**不制造位置**。 */
export type TimePrecision =
	| 'day'
	| 'month'
	| 'year'
	| 'approx'
	| 'range'
	| 'bound'
	| 'other'
	| 'unknown';

/** 全馆共享域。`y0 === null` 表示全馆暂无已核年份：不拿 0／1500／当前年凑域。 */
export type CatalogDomain = {
	y0: number | null;
	yNow: number;
	span: number;
	/** 贡献 `y0` 的站，`discId#placeId`。 */
	sources: string[];
};

export type TimelineRow<T> = { place: T; index: number };

/**
 * 唯一数字守卫：检查 discriminator 与整数契约。
 *
 * 旧导出未写 `timeStatus` 的站，由边界 parser 归一化成 `known` 后再进来；本函数
 * 不接受「缺状态 + 靠 label 猜」。
 */
export function isKnownTime<T extends { timeStatus?: unknown; year?: unknown }>(
	value: T,
): value is T & KnownTime {
	if (!value || typeof value !== 'object') return false;
	if (value.timeStatus !== 'known') return false;
	const year = value.year;
	return typeof year === 'number' && Number.isInteger(year) && year >= KNOWN_YEAR_MIN && year <= KNOWN_YEAR_MAX;
}

export function isUnknownTime<T extends { timeStatus?: unknown; year?: unknown }>(
	value: T,
): value is T & UnknownTime {
	if (!value || typeof value !== 'object') return false;
	if (value.timeStatus !== 'unknown') return false;
	const note = (value as { timeNote?: unknown }).timeNote;
	return value.year === null && typeof note === 'string' && note.trim().length > 0;
}

/**
 * 统一格式器：known → `yearLabel ?? String(year)`；unknown → 「年份未核」。
 * 结构形状参数：SSR 与客户端 payload 的 `Place` 都能直接进，不必先造字面量。
 */
export function timeText(place: TimeShape): string {
	if (!isKnownTime(place)) return UNKNOWN_YEAR_TEXT;
	return place.yearLabel ?? String(place.year);
}

/**
 * 数字 consumer 的入口：known 返回整数年，unknown 返回 null（**不是** 0）。
 *
 * 参数放宽到结构形状：客户端 payload 里的 `Place` 只有联合的 `timeStatus`，
 * 不能直接赋值给 `TrajectoryTime` 的字面量判别式，但**必须**经过同一个守卫。
 */
export function knownYear(place: { timeStatus?: unknown; year?: unknown }): number | null {
	return isKnownTime(place) ? place.year : null;
}

export function precisionOf(place: TimeShape): TimePrecision {
	if (!isKnownTime(place)) return 'unknown';
	const label = (place.yearLabel ?? '').trim();
	if (!label) return 'year';
	if (/^\d{4}-\d{2}-\d{2}$/.test(label)) return 'day';
	if (/^\d{4}-\d{2}(?:\/\d{2})?$/.test(label)) return 'month';
	if (/^\d{4}$/.test(label)) return 'year';
	if (/约/.test(label)) return 'approx';
	if (/[–—~～]|\d\s*\/\s*\d{4}/.test(label)) return 'range';
	if (/后|前/.test(label)) return 'bound';
	return 'other';
}

/** 全馆域：只取 known；插入假设的 unknown 不改变 `y0`。 */
/** 全馆域的一站：只需要身份与时间分支，不要求完整的 `TrajectoryTime`。 */
export type DomainStation = {
	discId: string;
	placeId: string;
	place: { timeStatus?: unknown; year?: unknown; yearLabel?: string | null };
};

export function catalogDomain(
	stations: readonly DomainStation[],
	nowYear: number,
): CatalogDomain {
	let y0: number | null = null;
	const sources: string[] = [];
	for (const station of stations) {
		const year = knownYear(station.place);
		if (year === null) continue;
		if (y0 === null || year < y0) {
			y0 = year;
			sources.length = 0;
		}
		if (year === y0) sources.push(`${station.discId}#${station.placeId}`);
	}
	const yNow = Number.isInteger(nowYear) ? nowYear : new Date().getFullYear();
	if (y0 === null) return { y0: null, yNow, span: 0, sources: [] };
	return { y0, yNow, span: yNow - y0, sources };
}

/**
 * 全馆域的站清单：每张有轨迹的碟的每一站。碟页 embed 只带着本碟交互，
 * 尺子仍要这条全馆清单，否则 `catalogDomain` 会缩成单碟域。
 */
export function museumDomainStations(
	discs: readonly {
		id: string;
		places?: readonly { id: string; timeStatus?: unknown; year?: unknown; yearLabel?: string | null }[] | null;
	}[],
): DomainStation[] {
	const stations: DomainStation[] = [];
	for (const disc of discs) {
		for (const place of disc.places ?? []) {
			stations.push({ discId: disc.id, placeId: place.id, place });
		}
	}
	return stations;
}

/**
 * 读者时钟重算「现在」之后的域。
 *
 * payload 被裁成单碟时，单碟算出来的 y0 往往更晚。注入的全馆域更早就以它为准
 * （sources 一并留下）；payload 自己更早则信 payload。yNow 永远用算出来的读者年。
 */
export function resolveCatalogDomain(computed: CatalogDomain, injected: CatalogDomain | null): CatalogDomain {
	if (!injected || injected.y0 === null) return computed;
	const yNow = computed.yNow;
	if (computed.y0 === null || injected.y0 < computed.y0) {
		return { y0: injected.y0, yNow, span: yNow - injected.y0, sources: injected.sources };
	}
	if (computed.y0 === injected.y0 && injected.sources.length > computed.sources.length) {
		return { ...computed, yNow, span: yNow - computed.y0, sources: injected.sources };
	}
	return { ...computed, yNow, span: computed.y0 === null ? 0 : yNow - computed.y0 };
}

/** `t = (year − y0) / span`，夹到 [0,1]；域无 y0 或年份非整数时返回 null。 */
export function axisT(year: number | null, domain: CatalogDomain): number | null {
	if (domain.y0 === null) return null;
	if (year === null || !Number.isInteger(year)) return null;
	// span 为 0（单年域）时不做除法：所有已知站落在轴顶，不给 NaN。
	if (domain.span <= 0) return year <= domain.y0 ? 0 : 1;
	return Math.min(1, Math.max(0, (year - domain.y0) / domain.span));
}

/** 年轴视觉序：只含 known；`index` 永远是原 `places[]` 下标。 */
export function timelineOrder<T extends TimeShape>(places: readonly T[]): TimelineRow<T>[] {
	const rows = places
		.map((place, index) => ({ place, index }))
		.filter((row) => isKnownTime(row.place));
	rows.sort((a, b) => (a.place as KnownTime).year - (b.place as KnownTime).year || a.index - b.index);
	// 同年内只有**所有**站都有明确 YYYY-MM(-DD) 起点时才按月(日)排；否则保持原数组序（稳定）。
	let start = 0;
	while (start < rows.length) {
		let end = start + 1;
		while (end < rows.length && yearOf(rows[end]!.place) === yearOf(rows[start]!.place)) end += 1;
		if (end - start > 1) {
			const group = rows.slice(start, end).map((row) => ({ row, start: explicitStart(row.place as KnownTime) }));
			if (group.every((entry) => entry.start !== null)) {
				// 月、日精度混用时只比到月；同年同月保持原数组序（稳定）。
				const monthsOnly = group.every((entry) => entry.start!.d === null);
				const key = (d: number | null) => (monthsOnly || d === null ? 0 : d);
				group.sort(
					(a, b) => a.start!.m - b.start!.m || key(a.start!.d) - key(b.start!.d) || a.row.index - b.row.index,
				);
				rows.splice(start, end - start, ...group.map((entry) => entry.row));
			}
		}
		start = end;
	}
	return rows;
}

function yearOf(place: TimeShape): number {
	return (place as KnownTime).year;
}

/** label 里只有明确的 `YYYY-MM`／`YYYY-MM-DD` 才算「有起点」；「约」「范围」「年后」都不算。 */
function explicitStart(place: KnownTime): { m: number; d: number | null } | null {
	const label = (place.yearLabel ?? '').trim();
	const match = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(label);
	if (!match) return null;
	const month = Number(match[2]);
	const day = match[3] ? Number(match[3]) : null;
	if (month < 1 || month > 12) return null;
	if (day !== null && (day < 1 || day > 31)) return null;
	return { m: month, d: day };
}

/** 轴外「年份未核」列表：原数组序，`index` 是原 `places[]` 下标。 */
export function unknownStations<T extends TimeShape>(places: readonly T[]): TimelineRow<T>[] {
	return places
		.map((place, index) => ({ place, index }))
		.filter((row) => isUnknownTime(row.place));
}
