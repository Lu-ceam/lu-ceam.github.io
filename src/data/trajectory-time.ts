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
};

/** 未知时间：显式分支，`year` 必须为 null，`timeNote` 必填，且不带 `yearLabel`。 */
export type UnknownTime = {
	timeStatus: 'unknown';
	year: null;
	timeNote: string;
};

export type TrajectoryTime = KnownTime | UnknownTime;

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
	void value;
	throw new Error('Not implemented: isKnownTime');
}

export function isUnknownTime<T extends { timeStatus?: unknown; year?: unknown }>(
	value: T,
): value is T & UnknownTime {
	void value;
	throw new Error('Not implemented: isUnknownTime');
}

/** 统一格式器：known → `yearLabel ?? String(year)`；unknown → `年份未核`。 */
export function timeText(place: TrajectoryTime): string {
	void place;
	throw new Error('Not implemented: timeText');
}

/** 数字 consumer 的入口：known 返回整数年，unknown 返回 null（**不是** 0）。 */
export function knownYear(place: TrajectoryTime): number | null {
	void place;
	throw new Error('Not implemented: knownYear');
}

export function precisionOf(place: TrajectoryTime): TimePrecision {
	void place;
	throw new Error('Not implemented: precisionOf');
}

/** 全馆域：只取 known；插入假设的 unknown 不改变 `y0`。 */
export function catalogDomain(
	stations: readonly { discId: string; place: TrajectoryTime }[],
	nowYear: number,
): CatalogDomain {
	void stations;
	void nowYear;
	throw new Error('Not implemented: catalogDomain');
}

/** `t = (year − y0) / span`，夹到 [0,1]；域无 y0 或年份非整数时返回 null。 */
export function axisT(year: number | null, domain: CatalogDomain): number | null {
	void year;
	void domain;
	throw new Error('Not implemented: axisT');
}

/** 年轴视觉序：只含 known；`index` 永远是原 `places[]` 下标。 */
export function timelineOrder<T extends TrajectoryTime>(
	places: readonly T[],
): TimelineRow<T>[] {
	void places;
	throw new Error('Not implemented: timelineOrder');
}

/** 轴外「年份未核」列表：原数组序，`index` 是原 `places[]` 下标。 */
export function unknownStations<T extends TrajectoryTime>(
	places: readonly T[],
): TimelineRow<T>[] {
	void places;
	throw new Error('Not implemented: unknownStations');
}
