/**
 * 时间哨兵的**经审计精准迁移**（合同 §8／PRD §13）。
 *
 * 为什么必须是一次 id 键控的改写、而不是"重跑一次导出"：迁移要可验证——
 * 除了 `year`／`yearLabel`／`timeStatus`／`timeNote` 四个字段，其余**逐字节不变**
 * （坐标、city、role、blurb、数组顺序、缩进、结尾换行都不许动）。
 *
 * 规则：
 * - 按 `recordId#placeId` 精确命中，不做形状猜测，不按 year 值扫。
 * - 迁移前校验旧值（`expectYear`／`expectYearLabel`）；不符就中止这一条，不改文件。
 * - 幂等：已经是 `timeStatus:"unknown"` + `year:null` + 同一 `timeNote` 时原样返回。
 * - 只碰 `trajectory.places` 里的这一个站；Event 文件不在本表范围内（当前清单为空）。
 *
 * 输出 before/after sha256 供审计；本表就是**这一版**的审计清单，新增条目要重新审。
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

/**
 * 审计清单：每条都是"旧值是占位哨兵、真年份未核"的站。
 *
 * `d37779/utrecht`：封底荷兰店家旧标只能证明这张盘在乌得勒支一带流通过，
 * 购入／贴标年份未核；原 `year:1982` 是发行年，不是这个站的时间。
 */
export const UNKNOWN_TIME_MIGRATIONS = [
	{
		recordId: 'd37779',
		file: 'records-legacy/records/d37779/record.json',
		placeId: 'utrecht',
		expectYear: 1982,
		expectYearLabel: '—',
		timeNote: '店标贴附年份未核。',
	},
];

const sha256 = (text) => createHash('sha256').update(text, 'utf8').digest('hex');

/** 磁盘上的 JSON 形状：本仓一律 `JSON.stringify(x, null, 2)` ＋ 结尾换行。 */
export function readRecordText(file) {
	return readFileSync(file, 'utf8');
}

/**
 * 对一个 record 文件应用一条迁移。
 * 返回 `{ changed, text, before, after, reason }`；**不改磁盘**（调用方决定）。
 */
export function applyMigration(text, migration) {
	const before = sha256(text);
	const parsed = JSON.parse(text);
	if (parsed.id !== migration.recordId) {
		return { changed: false, text, before, after: before, reason: `record id 不符：${parsed.id}` };
	}
	const places = parsed.trajectory?.places;
	if (!Array.isArray(places)) {
		return { changed: false, text, before, after: before, reason: 'record 没有 trajectory.places' };
	}
	const index = places.findIndex((place) => place?.id === migration.placeId);
	if (index < 0) {
		// 站没了：不是本表的对象，什么都不做（也不许把清单当"必须存在"的断言）。
		return { changed: false, text, before, after: before, reason: `找不到站 ${migration.placeId}` };
	}
	const place = places[index];

	// 幂等：已经迁移过（同 note、year 为空、有 unknown 状态）就原样返回。
	if (place.timeStatus === 'unknown' && place.year === null && place.timeNote === migration.timeNote) {
		return { changed: false, text, before, after: before, reason: '已是目标形状' };
	}
	if (place.timeStatus !== undefined && place.timeStatus !== 'known') {
		return {
			changed: false,
			text,
			before,
			after: before,
			reason: `站 ${migration.placeId} 的 timeStatus 不是 known／缺省：${place.timeStatus}`,
		};
	}
	if (place.year !== migration.expectYear) {
		return {
			changed: false,
			text,
			before,
			after: before,
			reason: `站 ${migration.placeId} 的 year 不是审计值 ${migration.expectYear}（实际 ${String(place.year)}）`,
		};
	}
	if (place.yearLabel !== migration.expectYearLabel) {
		return {
			changed: false,
			text,
			before,
			after: before,
			reason: `站 ${migration.placeId} 的 yearLabel 不是审计值「${migration.expectYearLabel}」（实际「${String(place.yearLabel)}」）`,
		};
	}

	// 只改时间分支：键序保持「原来的位置放 timeStatus，year 原位改 null，timeNote 顶替 yearLabel」。
	const next = {};
	for (const [key, value] of Object.entries(place)) {
		if (key === 'yearLabel') {
			next.timeNote = migration.timeNote;
			continue;
		}
		if (key === 'year') {
			next.timeStatus = 'unknown';
			next.year = null;
			continue;
		}
		next[key] = value;
	}
	places[index] = next;
	const out = `${JSON.stringify(parsed, null, 2)}\n`;
	return { changed: true, text: out, before, after: sha256(out), reason: 'migrated' };
}

/** 命令行入口：打印 before/after 散列；有任何一条没按预期迁移就以非零退出。 */
export function migrate(files, migrations = UNKNOWN_TIME_MIGRATIONS, { write = true } = {}) {
	const report = [];
	let failed = false;
	for (const migration of migrations) {
		const file = files?.get(migration.file) ?? migration.file;
		let text;
		try {
			text = readRecordText(file);
		} catch (error) {
			report.push({ ...migration, ok: false, reason: `读不到文件：${error.message}` });
			failed = true;
			continue;
		}
		const result = applyMigration(text, migration);
		if (result.changed) {
			if (write) writeFileSync(file, result.text);
			report.push({
				recordId: migration.recordId,
				placeId: migration.placeId,
				ok: true,
				changed: true,
				before: result.before,
				after: result.after,
			});
			continue;
		}
		// 幂等跳过是成功；其他原因（旧值不符／id 不符）是失败，绝不静默改写。
		const ok = result.reason === '已是目标形状';
		if (!ok) failed = true;
		report.push({
			recordId: migration.recordId,
			placeId: migration.placeId,
			ok,
			changed: false,
			before: result.before,
			after: result.after,
			reason: result.reason,
		});
	}
	return { ok: !failed, report };
}

if (process.argv[1] && process.argv[1].endsWith('migrate-unknown-time.mjs')) {
	const dryRun = process.argv.includes('--dry-run');
	const { ok, report } = migrate(null, UNKNOWN_TIME_MIGRATIONS, { write: !dryRun });
	for (const entry of report) {
		const hash = `${entry.before.slice(0, 12)} → ${entry.after.slice(0, 12)}`;
		console.log(
			`${entry.ok ? 'ok  ' : 'FAIL'} ${entry.recordId}/${entry.placeId} ${entry.changed ? hash : `(未改) ${entry.reason ?? ''}`}`,
		);
	}
	process.exit(ok ? 0 : 1);
}
