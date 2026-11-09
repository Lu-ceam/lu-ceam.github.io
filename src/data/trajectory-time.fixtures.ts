/**
 * 共享年轴／unknown 的测试夹具（Task 0）。
 *
 * 数据取自本树真实导出（2026-11-09，基线 `434de18`）：
 * - `d37779`：六站，`utrecht` 是唯一的旧哨兵站（`year 1982 / yearLabel "—"`），
 *   在夹具里已经是 canonical unknown；其余五站 known。
 * - `p1357e`：七站，1970–75 一段在真实比例下压成密簇（demo 实测最大簇 6 站）。
 * - `mg50370`：含 `约 1717–23` 与 `1963 年后`——两者都仍是 known，不得算 unknown，
 *   也不得用 label 造月日位置（PRD §4 疑点保留）。
 * - `allUnknown`：合成的全 unknown 单盘，用来钉「暂无已核年份」的空域。
 *
 * 夹具是数据；期望像素与公式结果属于实现公式的那条 lane。
 */
import type { TrajectoryTime } from './trajectory-time.ts';

export type AxisFixture = {
	id: string;
	viewport: { w: 320 | 390; h: number };
	places: readonly TrajectoryTime[];
	ids: readonly string[];
	nowYear: number;
	expect: {
		domainY0: number | null;
		knownCount: number;
		unknownCount: number;
		/** 手机壳里地图占章盒内容高的下限（PRD §13，不得以腾年列压回 180）。 */
		minMapShare: number;
	};
};

export const primaryAxis: AxisFixture = {
	id: 'd37779',
	viewport: { w: 390, h: 844 },
	places: [
		{ timeStatus: 'known', year: 1685, yearLabel: '1685-03-21' },
		{ timeStatus: 'known', year: 1723, yearLabel: '1723–50' },
		{ timeStatus: 'known', year: 1932 },
		{ timeStatus: 'known', year: 1981, yearLabel: '1981-05' },
		{ timeStatus: 'known', year: 1982 },
		{ timeStatus: 'unknown', year: null, timeNote: '店标贴附年份未核。' },
	],
	ids: ['eisenach', 'leipzig', 'toronto', 'ny-30th', 'holland', 'utrecht'],
	nowYear: 2026,
	expect: { domainY0: 1685, knownCount: 5, unknownCount: 1, minMapShare: 0.48 },
};

export const denseAxis: AxisFixture = {
	id: 'p1357e',
	viewport: { w: 320, h: 568 },
	places: [
		{ timeStatus: 'known', year: 1946, yearLabel: '1946-09-05' },
		{ timeStatus: 'known', year: 1970, yearLabel: '1970' },
		{ timeStatus: 'known', year: 1970, yearLabel: '1970-11' },
		{ timeStatus: 'known', year: 1974, yearLabel: '1974-07' },
		{ timeStatus: 'known', year: 1974, yearLabel: '1974-08/09' },
		{ timeStatus: 'known', year: 1974, yearLabel: '1974-10-11' },
		{ timeStatus: 'known', year: 1975, yearLabel: '1975.1' },
	],
	ids: [
		'stone-town',
		'london-queen-founded',
		'tokyo-warner-pioneer-founded',
		'rockfield-1974',
		'london-1974',
		'london-release-1974',
		'tokyo-press-1975',
	],
	nowYear: 2026,
	expect: { domainY0: 1946, knownCount: 7, unknownCount: 0, minMapShare: 0.48 },
};

export const allUnknownAxis: AxisFixture = {
	id: 'all-unknown',
	viewport: { w: 390, h: 844 },
	places: [
		{ timeStatus: 'unknown', year: null, timeNote: '店标贴附年份未核。' },
		{ timeStatus: 'unknown', year: null, timeNote: '压片年份未核。' },
	],
	ids: ['shop-label', 'pressing'],
	nowYear: 2026,
	expect: { domainY0: null, knownCount: 0, unknownCount: 2, minMapShare: 0.48 },
};

export const approxAxis: AxisFixture = {
	id: 'mg50370',
	viewport: { w: 390, h: 844 },
	places: [
		{ timeStatus: 'known', year: 1685, yearLabel: '1685-03-21' },
		{ timeStatus: 'known', year: 1720, yearLabel: '约 1717–23' },
		{ timeStatus: 'known', year: 1924 },
		{ timeStatus: 'known', year: 1945, yearLabel: '1945' },
		{ timeStatus: 'known', year: 1963, yearLabel: '1963-04' },
		{ timeStatus: 'known', year: 1963, yearLabel: '1963 年后' },
	],
	ids: ['eisenach', 'koethen-suites', 'budapest-starker', 'chicago-mercury-founded', 'new-york-1963', 'canada-press'],
	nowYear: 2026,
	expect: { domainY0: 1685, knownCount: 6, unknownCount: 0, minMapShare: 0.48 },
};
