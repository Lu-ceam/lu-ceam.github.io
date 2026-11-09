import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
	KNOWN_YEAR_MAX,
	KNOWN_YEAR_MIN,
	UNKNOWN_YEAR_TEXT,
	axisT,
	catalogDomain,
	isKnownTime,
	isUnknownTime,
	knownYear,
	museumDomainStations,
	precisionOf,
	resolveCatalogDomain,
	timelineOrder,
	timeText,
	unknownStations,
	type TrajectoryTime,
} from './trajectory-time.ts';

const known = (year: number, yearLabel?: string): TrajectoryTime =>
	yearLabel === undefined ? { timeStatus: 'known', year } : { timeStatus: 'known', year, yearLabel };
const unknown = (timeNote = '店标贴附年份未核。'): TrajectoryTime => ({
	timeStatus: 'unknown',
	year: null,
	timeNote,
});

describe('isKnownTime：唯一数字守卫', () => {
	it('accepts an explicit known with an in-range integer', () => {
		assert.equal(isKnownTime(known(1685)), true);
		assert.equal(isKnownTime(known(KNOWN_YEAR_MIN)), true);
		assert.equal(isKnownTime(known(KNOWN_YEAR_MAX)), true);
	});

	it('rejects unknown, missing status, missing year, and out-of-range integers', () => {
		assert.equal(isKnownTime(unknown()), false);
		assert.equal(isKnownTime({ year: 1982 }), false, '缺 discriminator 不能靠 label/整数猜');
		assert.equal(isKnownTime({ timeStatus: 'known' }), false);
		assert.equal(isKnownTime({ timeStatus: 'known', year: 1499 }), false);
		assert.equal(isKnownTime({ timeStatus: 'known', year: 2101 }), false);
		assert.equal(isKnownTime({ timeStatus: 'known', year: 1982.5 }), false);
		assert.equal(isKnownTime({ timeStatus: 'known', year: null }), false);
		assert.equal(isKnownTime({ timeStatus: 'unknown', year: 1982 }), false, 'unknown 不得带整数年');
	});

	it('never reads null/0 as a year', () => {
		assert.equal(knownYear(unknown()), null);
		assert.equal(knownYear(known(1982)), 1982);
		assert.notEqual(knownYear(unknown()), 0);
	});

	it('recognises the unknown branch only with year null and a non-empty note', () => {
		assert.equal(isUnknownTime(unknown()), true);
		assert.equal(isUnknownTime({ timeStatus: 'unknown', year: null, timeNote: '  ' }), false);
		assert.equal(isUnknownTime({ timeStatus: 'unknown', year: null }), false);
		assert.equal(isUnknownTime(known(1982)), false);
	});
});

describe('timeText：单一格式器', () => {
	it('prints the label when there is one, the year otherwise', () => {
		assert.equal(timeText(known(1723, '1723–50')), '1723–50');
		assert.equal(timeText(known(1685)), '1685');
		assert.equal(timeText(known(1963, '1963 年后')), '1963 年后');
	});

	it('prints 年份未核 for unknown — never null, undefined, 0 or 1982', () => {
		assert.equal(timeText(unknown()), UNKNOWN_YEAR_TEXT);
		assert.equal(UNKNOWN_YEAR_TEXT, '年份未核');
		const text = timeText(unknown());
		assert.ok(!/null|undefined|^0$|1982/.test(text));
	});
});

describe('precisionOf：只读 yearLabel，不制造位置', () => {
	it('classifies the catalog shapes', () => {
		assert.equal(precisionOf(known(1685, '1685-03-21')), 'day');
		assert.equal(precisionOf(known(1981, '1981-05')), 'month');
		assert.equal(precisionOf(known(1974, '1974-08/09')), 'month');
		assert.equal(precisionOf(known(1970, '1970')), 'year');
		assert.equal(precisionOf(known(1988)), 'year');
		assert.equal(precisionOf(known(1720, '约 1717–23')), 'approx');
		assert.equal(precisionOf(known(1963, '约 1963–67')), 'approx');
		assert.equal(precisionOf(known(1723, '1723–50')), 'range');
		assert.equal(precisionOf(known(1966, '1966-01～05')), 'range');
		assert.equal(precisionOf(known(1948, '1948 年后')), 'bound');
		assert.equal(precisionOf(known(1975, '1975.1')), 'other');
		assert.equal(precisionOf(unknown()), 'unknown');
	});
});

describe('catalogDomain：全馆共享域只含已知年', () => {
	const stations = [
		{ discId: 'd37779', placeId: 'eisenach', place: known(1685, '1685-03-21') },
		{ discId: 'd37779', placeId: 'utrecht', place: unknown() },
		{ discId: 'mhjl329', placeId: 'japan-press', place: known(2024, '2024-05-22') },
	];

	it('takes y0 from the earliest known station and now from the reader year', () => {
		const domain = catalogDomain(stations, 2026);
		assert.equal(domain.y0, 1685);
		assert.equal(domain.yNow, 2026);
		assert.equal(domain.span, 341);
		assert.deepEqual(domain.sources, ['d37779#eisenach']);
	});

	it('ignores an inserted hypothetical unknown: it changes neither y0 nor sources', () => {
		const withUnknown = [...stations, { discId: 'x', placeId: 'y', place: unknown() }];
		assert.deepEqual(catalogDomain(withUnknown, 2026), catalogDomain(stations, 2026));
	});

	it('moves y0 when a genuinely earlier known station appears', () => {
		const earlier = [...stations, { discId: 'y', placeId: 'z', place: known(1600) }];
		assert.equal(catalogDomain(earlier, 2026).y0, 1600);
		assert.equal(catalogDomain(earlier, 2026).span, 426);
	});

	it('has no domain at all when every station is unknown — no 0/1500/current-year filler', () => {
		const empty = catalogDomain([{ discId: 'd37779', placeId: 'utrecht', place: unknown() }], 2026);
		assert.equal(empty.y0, null);
		assert.equal(empty.span, 0);
		assert.deepEqual(empty.sources, []);
		assert.equal(catalogDomain([], 2026).y0, null);
	});

	it('lists every station that owns the earliest known year', () => {
		const shared = catalogDomain(
			[
				{ discId: 'a', placeId: 'eisenach', place: known(1685) },
				{ discId: 'b', placeId: 'eisenach', place: known(1685) },
				{ discId: 'c', placeId: 'later', place: known(1900) },
			],
			2026,
		);
		assert.deepEqual(shared.sources, ['a#eisenach', 'b#eisenach']);
	});
});

describe('axisT：真实年份比例', () => {
	const domain = catalogDomain([{ discId: 'd', placeId: 'p', place: known(1685) }], 2026);

	it('matches the PRD check numbers (1900 → .630, 1950 → .777)', () => {
		assert.equal(Math.round(axisT(1900, domain)! * 1000), 630);
		assert.equal(Math.round(axisT(1950, domain)! * 1000), 777);
		assert.equal(Math.round(axisT(1685, domain)! * 1), 0);
		assert.equal(Math.round(axisT(2026, domain)! * 1), 1);
	});

	it('clamps outside the domain and returns null without a domain', () => {
		assert.equal(axisT(1600, domain), 0);
		assert.equal(axisT(2100, domain), 1);
		assert.equal(axisT(null, domain), null);
		const noDomain = catalogDomain([{ discId: 'd', placeId: 'u', place: unknown() }], 2026);
		assert.equal(axisT(1900, noDomain), null);
		// 单年域：span 0 不除零，落在轴顶。
		const single = catalogDomain([{ discId: 'd', placeId: 'p', place: known(1900) }], 1900);
		assert.equal(axisT(1900, single), 0);
		assert.ok(Number.isFinite(axisT(1900, single)!));
	});

	it('rejects a non-integer year', () => {
		assert.equal(axisT(1900.5, domain), null);
	});
});

describe('timelineOrder：年轴视觉序，index 永远是原数组下标', () => {
	it('sorts known by year and keeps the original index', () => {
		const places = [known(1975), known(1946), known(1970)];
		const rows = timelineOrder(places);
		assert.deepEqual(
			rows.map((row) => [row.place.year, row.index]),
			[
				[1946, 1],
				[1970, 2],
				[1975, 0],
			],
		);
	});

	it('orders a fully explicit same-year group by month, comparing only to the month when precision mixes', () => {
		const places = [
			known(1997, '1997-05'),
			known(1997, '1997-03-12'),
			known(1997, '1997-04'),
		];
		assert.deepEqual(
			timelineOrder(places).map((row) => row.index),
			[1, 2, 0],
		);
	});

	it('keeps the original order when any same-year station is not explicit', () => {
		const places = [known(1963, '1963-04'), known(1963, '1963 年后'), known(1963)];
		assert.deepEqual(
			timelineOrder(places).map((row) => row.index),
			[0, 1, 2],
		);
		const mixed = [known(1970), known(1970, '1970-11')];
		assert.deepEqual(
			timelineOrder(mixed).map((row) => row.index),
			[0, 1],
		);
	});

	it('never lets an unknown station into the timing order', () => {
		const places = [unknown(), known(1975), known(1946)];
		const rows = timelineOrder(places);
		assert.equal(rows.length, 2);
		assert.deepEqual(
			rows.map((row) => row.index),
			[2, 1],
		);
		assert.equal(timelineOrder([]).length, 0);
	});

	it('is stable under a re-run with the same input', () => {
		const places = [known(1974, '1974-07'), known(1974, '1974-08/09'), known(1974, '1974-10-11')];
		assert.deepEqual(timelineOrder(places), timelineOrder(places));
	});
});

describe('unknownStations：轴外入口，原数组序', () => {
	it('lists unknown stations in places order with their original index', () => {
		const places = [known(1685), unknown('a。'), known(1975), unknown('b。')];
		assert.deepEqual(
			unknownStations(places).map((row) => [row.index, (row.place as { timeNote?: string }).timeNote]),
			[
				[1, 'a。'],
				[3, 'b。'],
			],
		);
	});

	it('returns nothing when every station has a year', () => {
		assert.deepEqual(unknownStations([known(1)]), []);
		assert.deepEqual(unknownStations([]), []);
	});
});

describe('resolveCatalogDomain：单碟 payload 不能盖掉更早的全馆尺', () => {
	const museum = catalogDomain(
		[
			{ discId: 'd37779', placeId: 'eisenach', place: known(1685) },
			{ discId: 'cs6785', placeId: 'london', place: known(1842) },
		],
		2026,
	);
	const oneDisc = catalogDomain([{ discId: 'cs6785', placeId: 'london', place: known(1842) }], 2027);

	it('keeps the earlier injected y0 and its sources, and the reader year', () => {
		const merged = resolveCatalogDomain(oneDisc, museum);
		assert.equal(merged.y0, 1685);
		assert.equal(merged.yNow, 2027);
		assert.equal(merged.span, 342);
		assert.deepEqual(merged.sources, museum.sources);
	});

	it('keeps museum sources when the single disc shares y0 but lists fewer owners', () => {
		const shared = catalogDomain(
			[
				{ discId: 'a', placeId: 'eisenach', place: known(1685) },
				{ discId: 'b', placeId: 'eisenach', place: known(1685) },
			],
			2026,
		);
		const sameYear = catalogDomain([{ discId: 'a', placeId: 'eisenach', place: known(1685) }], 2027);
		const merged = resolveCatalogDomain(sameYear, shared);
		assert.equal(merged.y0, 1685);
		assert.equal(merged.yNow, 2027);
		assert.deepEqual(merged.sources, ['a#eisenach', 'b#eisenach']);
	});

	it('trusts a payload that is earlier than the injected domain', () => {
		const earlier = catalogDomain([{ discId: 'x', placeId: 'y', place: known(1600) }], 2026);
		assert.equal(resolveCatalogDomain(earlier, museum).y0, 1600);
	});
});

describe('museumDomainStations：把每张碟的站收成同一份域输入', () => {
	it('keeps disc identity and skips a disc with no places', () => {
		const stations = museumDomainStations([
			{ id: 'd37779', places: [{ id: 'eisenach', timeStatus: 'known', year: 1685 }, { id: 'utrecht', timeStatus: 'unknown', year: null }] },
			{ id: 'empty', places: [] },
			{ id: 'cs6785', places: [{ id: 'london', timeStatus: 'known', year: 1842 }] },
		]);
		const domain = catalogDomain(stations, 2026);
		const onlyCs = catalogDomain(
			museumDomainStations([{ id: 'cs6785', places: [{ id: 'london', timeStatus: 'known', year: 1842 }] }]),
			2026,
		);
		assert.equal(domain.y0, 1685);
		assert.equal(onlyCs.y0, 1842);
		assert.equal(resolveCatalogDomain(onlyCs, domain).y0, 1685);
		assert.deepEqual(resolveCatalogDomain(onlyCs, domain).sources, domain.sources);
	});
});
