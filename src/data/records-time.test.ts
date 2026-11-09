import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { resolveRecordsExport } from './records-entities.ts';
import { auditSentinelTimes, parseRecord, REJECT_SENTINEL_TIME } from './records-export.ts';

function baseRecord(extra: Record<string, unknown> = {}) {
	return {
		id: 'demo01',
		composer: '巴赫',
		work: '作品',
		performers: '某人',
		label: '厂牌',
		catalogNumber: 'X 1',
		category: '古典',
		pressing: '不详',
		matrix: '不详',
		recording: '不详',
		eq: 'RIAA',
		condition: '未定',
		verificationStatus: 'pending',
		statusLabel: '待复核',
		notes: '一句公开说明。',
		links: [],
		images: [{ file: 'images/cover-front.webp', kind: 'cover-front', caption: '封面' }],
		details: [],
		...extra,
	};
}

const basePlace = {
	id: 'leipzig',
	cityZh: '莱比锡',
	city: 'Leipzig',
	role: 'composition',
	lon: 12.373,
	lat: 51.34,
};

function place(extra: Record<string, unknown> = {}) {
	return { ...basePlace, ...extra };
}

function parsePlaces(places: unknown[]) {
	return parseRecord(baseRecord({ trajectory: { places } }));
}

/** 取首站的 canonical 形状（测试读的是 parser 出口，不是磁盘形状）。 */
function firstPlace(parsed: ReturnType<typeof parsePlaces>) {
	const stop = parsed.trajectory?.places[0];
	assert.ok(stop && !('eventId' in stop), '期望一条内联地点');
	return stop;
}

describe('Lane A：旧导出兼容读为 canonical known', () => {
	it('reads a legacy integer-year inline place as explicit known', () => {
		const parsed = parsePlaces([place({ year: 1723, yearLabel: '1723–50' })]);
		const stop = firstPlace(parsed);
		assert.equal(stop.timeStatus, 'known');
		assert.equal(stop.year, 1723);
		assert.equal(stop.yearLabel, '1723–50');
	});

	it('reads a legacy integer-year Event the same way', () => {
		const records = resolveRecordsExport();
		const place0 = records.flatMap((record) => record.trajectory?.places ?? [])[0];
		assert.ok(place0);
		assert.equal(place0.timeStatus, 'known');
		assert.equal(typeof place0.year, 'number');
	});

	it('keeps the year range: 1500 and 2100 accepted, 1499/2101/float/string rejected', () => {
		assert.equal(firstPlace(parsePlaces([place({ year: 1500 })])).year, 1500);
		assert.equal(firstPlace(parsePlaces([place({ year: 2100 })])).year, 2100);
		for (const bad of [1499, 2101, 1982.5, '1982']) {
			assert.throws(() => parsePlaces([place({ year: bad })]), /校验失败/, String(bad));
		}
	});
});

describe('Lane A：显式 unknown 分支', () => {
	it('accepts unknown + year null + a non-empty timeNote', () => {
		const parsed = parsePlaces([place({ timeStatus: 'unknown', year: null, timeNote: '店标贴附年份未核。' })]);
		const stop = firstPlace(parsed);
		assert.equal(stop.timeStatus, 'unknown');
		assert.equal(stop.year, null);
		assert.equal((stop as { timeNote?: string }).timeNote, '店标贴附年份未核。');
		assert.equal(stop.yearLabel, undefined);
	});

	it('round-trips through JSON as null with the discriminator intact', () => {
		const parsed = parsePlaces([place({ timeStatus: 'unknown', year: null, timeNote: '压片年份未核。' })]);
		const round = JSON.parse(JSON.stringify(parsed)) as typeof parsed;
		const stop = firstPlace(round);
		assert.equal(stop.timeStatus, 'unknown');
		assert.equal(stop.year, null);
	});

	it('normalises the narrow tolerated shape unknown + null + 「—」 by removing the label', () => {
		const parsed = parsePlaces([place({ timeStatus: 'unknown', year: null, yearLabel: '—', timeNote: '年份未核。' })]);
		const stop = firstPlace(parsed);
		assert.equal(stop.timeStatus, 'unknown');
		assert.equal(stop.yearLabel, undefined);
	});

	it('rejects unknown + a numeric year (even with 「—」)', () => {
		assert.throws(
			() => parsePlaces([place({ timeStatus: 'unknown', year: 1982, yearLabel: '—', timeNote: '未核。' })]),
			/unknown/,
		);
		assert.throws(
			() => parsePlaces([place({ timeStatus: 'unknown', year: 0, timeNote: '未核。' })]),
			/校验失败/,
		);
	});

	it('rejects unknown without a note, or with an empty note', () => {
		assert.throws(() => parsePlaces([place({ timeStatus: 'unknown', year: null })]), /timeNote/);
		assert.throws(
			() => parsePlaces([place({ timeStatus: 'unknown', year: null, timeNote: '   ' })]),
			/校验失败|timeNote/,
		);
	});

	it('rejects unknown carrying a real year label', () => {
		assert.throws(
			() => parsePlaces([place({ timeStatus: 'unknown', year: null, yearLabel: '1982', timeNote: '未核。' })]),
			/yearLabel/,
		);
	});

	it('rejects a second truth flag next to timeStatus', () => {
		assert.throws(
			() => parsePlaces([place({ timeStatus: 'unknown', year: null, timeNote: '未核。', dateUnknown: true })]),
			/校验失败/,
		);
	});
});

describe('Lane A：known 分支的冲突必须失败', () => {
	it('rejects known + null', () => {
		assert.throws(() => parsePlaces([place({ timeStatus: 'known', year: null })]), /时间/);
	});

	it('rejects no discriminator + null / missing year — a missing year is not unknown', () => {
		assert.throws(() => parsePlaces([place({ year: null })]), /时间/);
		assert.throws(() => parsePlaces([place({})]), /year/);
	});

	it('rejects known + timeNote', () => {
		assert.throws(
			() => parsePlaces([place({ timeStatus: 'known', year: 1723, timeNote: '未核。' })]),
			/timeNote/,
		);
	});

	it('rejects an unknown discriminator value', () => {
		assert.throws(() => parsePlaces([place({ year: 1723, timeStatus: 'maybe' })]), /校验失败/);
	});
});

describe('Lane A：指针站不得携带时间字段', () => {
	const pointer = (extra: Record<string, unknown> = {}) => ({
		id: 'eisenach',
		eventId: 'evt-bach-birth-eisenach',
		...extra,
	});

	it('rejects timeStatus, timeNote, and year:null on a pointer', () => {
		for (const extra of [
			{ timeStatus: 'unknown' },
			{ timeNote: '未核。' },
			{ timeStatus: 'known', year: 1685 },
			{ year: null },
		]) {
			assert.throws(
				() => parsePlaces([pointer(extra)]),
				/指针站|校验失败/,
				JSON.stringify(extra),
			);
		}
	});

	it('keeps a legal pointer working and lets blurb stay the only override', () => {
		const parsed = parsePlaces([pointer({ blurb: '碟上另写的一句旁注' })]);
		const stop = parsed.trajectory?.places[0];
		assert.ok(stop && 'eventId' in stop);
		assert.equal(stop.blurb, '碟上另写的一句旁注');
	});
});

describe('Lane A：Event 未知被多盘引用时逐盘展开', () => {
	it('copies the whole time branch, not just the year', () => {
		// 这条用内存 catalog 直接跑 expandStation 的公开路径：指针站借用 Event 的时间分支。
		const records = resolveRecordsExport();
		for (const record of records) {
			for (const place of record.trajectory?.places ?? []) {
				const time = place as { timeStatus: 'known' | 'unknown'; year: number | null; timeNote?: string };
				assert.ok(
					time.timeStatus === 'known' || time.timeStatus === 'unknown',
					`${record.id}/${place.id} 没有 canonical 时间分支`,
				);
				if (time.timeStatus === 'unknown') {
					assert.equal(time.year, null);
					assert.equal(typeof time.timeNote, 'string');
				} else {
					assert.equal(typeof time.year, 'number');
				}
			}
		}
	});
});

describe('Lane A：旧哨兵闸门的分阶段状态', () => {
	it('does not reject the legacy sentinel yet — that ships with the audited migration (Lane E)', () => {
		assert.equal(REJECT_SENTINEL_TIME, false, '迁未就位前不得单独合入会挡现存全馆 build 的硬闸');
		const parsed = parsePlaces([place({ year: 1982, yearLabel: '—' })]);
		assert.equal(firstPlace(parsed).year, 1982);
	});

	it('lists the sentinel candidates in the current catalog — a list, not a rewrite', () => {
		const candidates = auditSentinelTimes(resolveRecordsExport());
		assert.deepEqual(
			candidates.map((entry) => [entry.recordId, entry.placeId]),
			[['d37779', 'utrecht']],
		);
		for (const entry of candidates) {
			assert.equal(entry.yearLabel, '—');
		}
	});
});
