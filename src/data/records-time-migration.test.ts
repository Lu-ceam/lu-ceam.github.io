/**
 * Lane E：严格拒绝旧哨兵 ＋ `d37779/utrecht` 的经审计迁移，**同一个发布单元**。
 *
 * 这两件事必须同批：单独合入"拒绝现存数据的 parser"会挡掉全馆 build（合同 §8）。
 * 所以本文件同时钉：
 * 1. 开关真的开了（`REJECT_SENTINEL_TIME === true`）；
 * 2. 磁盘上的哨兵真的迁走了（`d37779/utrecht` 是 unknown）；
 * 3. 迁移是 id 键控的精准改写：除时间分支外**逐字节不变**，且幂等；
 * 4. 负向对照：把哨兵塞回去，解析器必须失败（闸门真能抓）。
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

import {
	REJECT_SENTINEL_TIME,
	SENTINEL_TIME_LABELS,
	auditSentinelTimes,
	normaliseTime,
} from './records-export.ts';
import { records } from './records.ts';
import { applyMigration, UNKNOWN_TIME_MIGRATIONS } from '../../scripts/migrate-unknown-time.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '../..');
const recordFile = join(root, 'records-legacy/records/d37779/record.json');
const originalText = readFileSync(recordFile, 'utf8');
const original = JSON.parse(originalText) as DiskRecord;

/** 磁盘 JSON 的宽松形状：本测试只读身份与时间字段，不做拼写补全。 */
type DiskPlace = Record<string, unknown> & {
	id: string;
	timeStatus?: string;
	year?: number | null;
	yearLabel?: string;
	timeNote?: string;
	blurb?: string;
	eventId?: string;
};
type DiskRecord = { trajectory: { places: DiskPlace[] } };

const utrechtOf = (record: DiskRecord): DiskPlace | undefined =>
	record.trajectory.places.find((place) => place.id === 'utrecht');

describe('E1：开关已开，且这一版的审计清单只有一条', () => {
	it('turns the strict sentinel gate on', () => {
		assert.equal(REJECT_SENTINEL_TIME, true, '严格拒绝旧哨兵必须与迁移同批开启');
	});

	it('keeps exactly the audited entry', () => {
		assert.deepEqual(
			UNKNOWN_TIME_MIGRATIONS.map((entry) => `${entry.recordId}/${entry.placeId}`),
			['d37779/utrecht'],
			'审计清单被悄悄改动（新增条目要重新审计）',
		);
	});

	it('leaves no sentinel station in the loaded catalog', () => {
		const candidates = auditSentinelTimes(records);
		assert.deepEqual(candidates, [], `还有站带着旧哨兵：${JSON.stringify(candidates)}`);
	});
});

describe('E2：utrecht 已精准迁移成 unknown', () => {
	it('writes the canonical three-field branch', () => {
		const place = utrechtOf(original) as DiskPlace;
		assert.equal(place.timeStatus, 'unknown');
		assert.equal(place.year, null);
		assert.equal(place.timeNote, '店标贴附年份未核。');
		assert.equal('yearLabel' in place, false, '迁移后不许留 yearLabel');
	});

	it('keeps identity, coordinates, copy and array order byte-identical', () => {
		const before = original.trajectory.places.map((place: DiskPlace) => place.id);
		assert.deepEqual(before, ['eisenach', 'leipzig', 'toronto', 'ny-30th', 'holland', 'utrecht']);
		const place = utrechtOf(original) as DiskPlace;
		assert.equal(place.cityZh, '乌得勒支');
		assert.equal(place.city, 'Utrecht');
		assert.equal(place.role, 'other');
		assert.equal(place.lon, 5.122);
		assert.equal(place.lat, 52.091);
		assert.equal(place.zoom, 9);
		assert.match(String(place.blurb), /M\. Staffhorst/);
	});

	it('leaves every other station of the record untouched', () => {
		const others = original.trajectory.places.filter((place: DiskPlace) => place.id !== 'utrecht');
		assert.equal(others.length, 5);
		// 磁盘上这些站是「无 discriminator 的整数年」：边界 parser 读成 known，
		// 迁移不该顺手给它们补 timeStatus（那才是范围外的改写）。
		for (const place of others) {
			assert.equal(place.timeStatus, undefined, `${place.id} 被补了 timeStatus`);
			// 指针站（eisenach）在磁盘上没有时间字段：年份来自 Event，迁移不碰它。
			if (place.eventId) {
				assert.equal('year' in place, false, `${place.id} 指针站被写了 year`);
				assert.equal('yearLabel' in place, false, `${place.id} 指针站被写了 yearLabel`);
			} else {
				assert.equal(typeof place.year, 'number');
			}
		}
		const leipzig = others.find((place: DiskPlace) => place.id === 'leipzig');
		assert.ok(leipzig, '缺 leipzig');
		assert.equal(leipzig.yearLabel, '1723–50', '范围年号仍是 known 的显示，不迁');
		assert.equal(leipzig.year, 1723);
	});

	it('ends up as unknown in the resolved trajectory the pages read', () => {
		const record = records.find((entry) => entry.id === 'd37779');
		assert.ok(record?.trajectory);
		const place = record.trajectory.places.find((entry) => entry.id === 'utrecht');
		assert.ok(place);
		assert.equal(place.timeStatus, 'unknown');
		assert.equal(place.year, null);
	});
});

describe('E2b：迁移是幂等的，且只改时间分支', () => {
	it('applies cleanly once and then reports no change', () => {
		const migration = UNKNOWN_TIME_MIGRATIONS[0];
		// 当前磁盘已是目标形状：再跑一次必须 unchanged，且字节不变。
		const again = applyMigration(originalText, migration);
		assert.equal(again.changed, false);
		assert.equal(again.reason, '已是目标形状');
		assert.equal(again.text, originalText);
	});

	it('rewrites only the four time keys from the audited old shape', () => {
		// 复原迁移前的文本（只把这一个站改回哨兵），再走一遍迁移：
		// 除时间分支外必须逐字节一致——这是"精准"的唯一可验证口径。
		const withSentinel = JSON.parse(originalText) as DiskRecord;
		const index = withSentinel.trajectory.places.findIndex((place: DiskPlace) => place.id === 'utrecht');
		withSentinel.trajectory.places[index] = {
			id: 'utrecht',
			year: 1982,
			yearLabel: '—',
			cityZh: '乌得勒支',
			city: 'Utrecht',
			role: 'other',
			lon: 5.122,
			lat: 52.091,
			zoom: 9,
			blurb: String(utrechtOf(original)?.blurb ?? ''),
		};
		const sentinelText = `${JSON.stringify(withSentinel, null, 2)}\n`;
		const result = applyMigration(sentinelText, UNKNOWN_TIME_MIGRATIONS[0]);
		assert.equal(result.changed, true);
		assert.equal(result.text, originalText, '迁移结果与磁盘上的目标文本不一致');

		// 只比 utrecht 对象**之外**的字节：站之前的前缀与之后的整段必须一字不差。
		// （对象内部的行数会变 3 行——timeStatus/year/timeNote 取代 year/yearLabel——
		// 那正是被审计的那一处改写，不拿总行数当口径。）
		const block = (text: string) => {
			const at = text.indexOf('"id": "utrecht"');
			assert.ok(at > 0);
			const open = text.lastIndexOf('{', at);
			const close = text.indexOf('\n      }', at) + '\n      }'.length;
			return { head: text.slice(0, open), block: text.slice(open, close), tail: text.slice(close) };
		};
		const before = block(sentinelText);
		const after = block(result.text);
		assert.equal(after.head, before.head, 'utrecht 之前的字节被改了');
		assert.equal(after.tail, before.tail, 'utrecht 之后的字节被改了');
		assert.notEqual(after.block, before.block, 'utrecht 对象没被改写');
		assert.match(after.block, /"timeStatus": "unknown"/);
		assert.doesNotMatch(after.block, /1982/, '迁移后的块里不该还留 1982');
	});

	it('refuses to rewrite when the audited old value no longer matches', () => {
		const drifted = JSON.parse(originalText) as DiskRecord;
		const index = drifted.trajectory.places.findIndex((place: DiskPlace) => place.id === 'utrecht');
		drifted.trajectory.places[index] = { ...drifted.trajectory.places[index], timeStatus: 'known', year: 1983 };
		const text = `${JSON.stringify(drifted, null, 2)}\n`;
		const result = applyMigration(text, UNKNOWN_TIME_MIGRATIONS[0]);
		assert.equal(result.changed, false);
		assert.match(result.reason, /不是审计值 1982/);
		assert.equal(result.text, text, '旧值不符时不许改文件');
	});
});

describe('E3：闸门真能抓（负向对照）', () => {
	it('rejects a status-less station carrying a sentinel label', () => {
		const issues = normaliseTime({ year: 1982, yearLabel: '—', timeStatus: undefined });
		assert.ok(Array.isArray(issues), '旧哨兵没有被拒绝');
		assert.match(issues[0].message, /占位时间标签/);
	});

	it('rejects a known station carrying a sentinel label', () => {
		const issues = normaliseTime({ timeStatus: 'known', year: 1982, yearLabel: '—' });
		assert.ok(Array.isArray(issues));
		assert.match(issues[0].message, /占位时间标签/);
	});

	it('still rejects an unknown station carrying a real year label', () => {
		const issues = normaliseTime({
			timeStatus: 'unknown',
			year: null,
			timeNote: '年份未核',
			yearLabel: '1982',
		});
		assert.ok(Array.isArray(issues));
		assert.match(issues[0].message, /不能带 yearLabel/);
	});

	it('still accepts a genuinely unknown station', () => {
		const result = normaliseTime({ timeStatus: 'unknown', year: null, timeNote: '购入年份未核。' });
		assert.ok(!Array.isArray(result));
		assert.deepEqual(result.time, { timeStatus: 'unknown', year: null, timeNote: '购入年份未核。' });
	});

	it('keeps approx/range/bound labels as known (they are not sentinels)', () => {
		for (const label of ['约 1717–23', '1723–50', '1963 年后', '1981-05', '约 1972']) {
			assert.equal(SENTINEL_TIME_LABELS.includes(label), false, `${label} 被误判成哨兵`);
			const result = normaliseTime({ year: 1723, yearLabel: label });
			assert.ok(!Array.isArray(result), `${label} 应仍是 known`);
		}
	});
});
