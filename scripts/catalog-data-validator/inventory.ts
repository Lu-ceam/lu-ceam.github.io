/**
 * Raw inventory: enumerate both export roots before parsing anything.
 *
 * The shared loader is fail-fast and treats a missing legacy index as "no
 * legacy side". The validator must not inherit that: a legacy `records/`
 * directory with no index means the whole set is unknown. So this module
 * records every row first, then reports conflicts, and only then lets the
 * caller parse per record with the real strict schema.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { directorySha256 } from '../record-sha.mjs';
import { parseIndex } from '../../src/data/records-export.ts';
import type { Finding, InventoryResult, InventoryRow, NotChecked } from './report.ts';

function finding(partial: Omit<Finding, 'key' | 'baselineId'>): Finding {
	return { key: '', baselineId: null, ...partial };
}

function readJsonFile(file: string): { ok: true; value: unknown } | { ok: false; reason: string } {
	try {
		return { ok: true, value: JSON.parse(readFileSync(file, 'utf8')) as unknown };
	} catch (error) {
		return { ok: false, reason: error instanceof Error ? error.message : String(error) };
	}
}

type RootScan = {
	root: string;
	label: string;
	legacy: boolean;
	indexFile: string;
	indexPresent: boolean;
	dirIds: string[];
	indexEntries: Array<{ id: string; sha256: string }>;
	indexValid: boolean;
};

function scanRoot(root: string, label: string, legacy: boolean, findings: Finding[], notChecked: NotChecked[]): RootScan {
	const indexFile = join(root, 'index.json');
	const recordsDir = join(root, 'records');
	const indexPresent = existsSync(indexFile);
	const dirPresent = existsSync(recordsDir);
	const dirIds = dirPresent
		? readdirSync(recordsDir)
				.filter((name) => statSync(join(recordsDir, name)).isDirectory())
				.sort()
		: [];
	const scan: RootScan = {
		root,
		label,
		legacy,
		indexFile,
		indexPresent,
		dirIds,
		indexEntries: [],
		indexValid: false,
	};
	if (!indexPresent) {
		if (dirPresent && dirIds.length > 0) {
			findings.push(
				finding({
					code: 'INVENTORY_INDEX_MISSING',
					severity: 'error',
					layer: 'source',
					status: 'active',
					recordId: null,
					fieldPath: 'index.json',
					stationId: null,
					expected: { indexPresent: true },
					actual: { indexPresent: false, directoryCount: dirIds.length },
					reason: `${label} 有 records/ 目录却没有 index.json，全集无法确认`,
					recommendation: '补齐该根的 index.json，或把该目录移出权威范围后再跑审计',
					evidence: [indexFile],
				}),
			);
		}
		return scan;
	}
	const parsed = readJsonFile(indexFile);
	if (!parsed.ok) {
		findings.push(
			finding({
				code: 'INVENTORY_INDEX_UNREADABLE',
				severity: 'error',
				layer: 'source',
				status: 'active',
				recordId: null,
				fieldPath: 'index.json',
				stationId: null,
				expected: { readable: true },
				actual: { readable: false },
				reason: `${label} index.json 无法解析：${parsed.reason}`,
				recommendation: '修复 JSON 语法或重新导出索引',
				evidence: [indexFile],
			}),
		);
		return scan;
	}
	try {
		const index = parseIndex(parsed.value, indexFile);
		scan.indexValid = true;
		scan.indexEntries = index.records.map((entry) => ({ id: entry.id, sha256: entry.sha256 }));
	} catch (error) {
		findings.push(
			finding({
				code: 'INVENTORY_INDEX_INVALID',
				severity: 'error',
				layer: 'source',
				status: 'active',
				recordId: null,
				fieldPath: 'index.json',
				stationId: null,
				expected: { schemaVersion: 1 },
				actual: { valid: false },
				reason: `${label} index.json 不符合现有 indexSchema：${error instanceof Error ? error.message : String(error)}`,
				recommendation: '按 docs/records-contract.md 修复索引；校验器不改写索引',
				evidence: [indexFile],
			}),
		);
	}
	if (!dirPresent) {
		notChecked.push({
			code: 'INVENTORY_DIR_MISSING',
			layer: 'source',
			recordId: null,
			fieldPath: 'records/',
			reason: `${label} 没有 records/ 目录`,
			dependency: null,
		});
	}
	return scan;
}

export function inventory(input: { exportRoot: string; legacyRoot: string; repoRoot?: string }): InventoryResult {
	const exportRoot = resolve(input.exportRoot);
	const legacyRoot = resolve(input.legacyRoot);
	const findings: Finding[] = [];
	const notChecked: NotChecked[] = [];
	// A full audit must not silently drop a legacy side that the repo does keep.
	const defaultLegacy = input.repoRoot ? resolve(input.repoRoot, 'records-legacy') : null;
	if (
		defaultLegacy !== null &&
		defaultLegacy !== legacyRoot &&
		existsSync(join(defaultLegacy, 'records')) &&
		readdirSync(join(defaultLegacy, 'records')).length > 0
	) {
		findings.push(
			finding({
				code: 'INVENTORY_LEGACY_ROOT_OMITTED',
				severity: 'error',
				layer: 'source',
				status: 'active',
				recordId: null,
				fieldPath: 'records-legacy',
				stationId: null,
				expected: { legacyRoot: defaultLegacy },
				actual: { legacyRoot },
				reason: '仓库里仍有 legacy 记录，但本次全馆命令没有把该根纳入；不能据此宣布全馆结论',
				recommendation: '用默认 legacy 根重跑（或显式传入含 legacy 的根），或先完成迁移再删该目录',
				evidence: [defaultLegacy],
			}),
		);
	}
	if (!existsSync(legacyRoot)) {
		notChecked.push({
			code: 'INVENTORY_LEGACY_ROOT_ABSENT',
			layer: 'source',
			recordId: null,
			fieldPath: 'records-legacy',
			reason: `legacy 根不存在（${legacyRoot}），本次按“无 legacy 盘”处理；若该仓仍有 legacy 目录，请显式传入`,
			dependency: null,
		});
	}
	const scans = [
		scanRoot(exportRoot, 'records', false, findings, notChecked),
		scanRoot(legacyRoot, 'records-legacy', true, findings, notChecked),
	];

	const rows: InventoryRow[] = [];
	const byId = new Map<string, InventoryRow[]>();
	const seenInRoot = new Map<string, Set<string>>();

	for (const scan of scans) {
		const seen = seenInRoot.get(scan.root) ?? new Set<string>();
		seenInRoot.set(scan.root, seen);
		scan.indexEntries.forEach((entry, ordinal) => {
			const recordPath = join(scan.root, 'records', entry.id, 'record.json');
			const storyPath = join(scan.root, 'records', entry.id, 'story.md');
			const dirPresent = scan.dirIds.includes(entry.id);
			let blockReason: string | null = null;
			if (seen.has(entry.id)) {
				findings.push(
					finding({
						code: 'INVENTORY_INDEX_DUPLICATE_ID',
						severity: 'error',
						layer: 'source',
						status: 'active',
						recordId: entry.id,
						fieldPath: `index.json.records[${ordinal}].id`,
						stationId: null,
						expected: { unique: true },
						actual: { duplicateAtOrdinal: ordinal },
						reason: `${scan.label} index.json 重复列出 ${entry.id}；不静默去重`,
						recommendation: '删除重复索引项后重跑；冲突盘保持 blocked，不任选其一',
						evidence: [scan.indexFile],
					}),
				);
				blockReason = 'duplicate-index-id';
			}
			seen.add(entry.id);
			if (!dirPresent) {
				findings.push(
					finding({
						code: 'INVENTORY_INDEX_NO_DIR',
						severity: 'error',
						layer: 'source',
						status: 'active',
						recordId: entry.id,
						fieldPath: `index.json.records[${ordinal}].id`,
						stationId: null,
						expected: { directory: true },
						actual: { directory: false },
						reason: `${scan.label} index.json 列出 ${entry.id}，但 records/${entry.id}/ 不存在`,
						recommendation: '恢复目录或从索引里删掉该条',
						evidence: [scan.indexFile, join(scan.root, 'records', entry.id)],
					}),
				);
				blockReason = blockReason ?? 'index-entry-without-directory';
			}
			const row: InventoryRow = {
				id: entry.id,
				root: scan.root,
				legacy: scan.legacy,
				indexOrdinal: ordinal,
				recordPath,
				storyPath,
				indexSha256: entry.sha256,
				computedSha256: null,
				blockReason,
			};
			rows.push(row);
			const list = byId.get(entry.id) ?? [];
			list.push(row);
			byId.set(entry.id, list);
		});
		for (const id of scan.dirIds) {
			if (seen.has(id)) continue;
			findings.push(
				finding({
					code: 'INVENTORY_DIR_UNINDEXED',
					severity: 'error',
					layer: 'source',
					status: 'active',
					recordId: id,
					fieldPath: 'index.json',
					stationId: null,
					expected: { indexed: true },
					actual: { indexed: false },
					reason: `${scan.label} 的 records/${id}/ 目录不在 index.json 里`,
					recommendation: '把该条加入索引（同时更新 sha256），或确认后移除目录',
					evidence: [join(scan.root, 'records', id)],
				}),
			);
		}
	}

	for (const [id, list] of byId) {
		if (list.length > 1) {
			const roots = [...new Set(list.map((row) => row.root))];
			findings.push(
				finding({
					code: roots.length > 1 ? 'INVENTORY_DUPLICATE_ID_CROSS_ROOT' : 'INVENTORY_DUPLICATE_ID',
					severity: 'error',
					layer: 'source',
					status: 'active',
					recordId: id,
					fieldPath: 'id',
					stationId: null,
					expected: { uniqueRecordId: true },
					actual: { occurrences: list.length, roots },
					reason: `id ${id} 在权威集合里出现 ${list.length} 次（${roots.join(', ')}）`,
					recommendation: '只保留一处权威来源；冲突未解决前全馆集合不完整',
					evidence: list.map((row) => row.recordPath),
				}),
			);
			for (const row of list) row.blockReason = row.blockReason ?? 'duplicate-id';
		}
	}

	// Directory-level identity and per-record metadata.
	for (const row of rows) {
		if (row.blockReason === 'duplicate-index-id' || row.blockReason === 'index-entry-without-directory') continue;
		if (!existsSync(row.recordPath)) {
			row.blockReason = 'record-json-missing';
			continue;
		}
		const parsed = readJsonFile(row.recordPath);
		if (!parsed.ok) {
			row.blockReason = 'record-json-unreadable';
			continue;
		}
		const value = parsed.value;
		if (value && typeof value === 'object' && 'id' in value && (value as { id?: unknown }).id !== row.id) {
			findings.push(
				finding({
					code: 'INVENTORY_ID_MISMATCH',
					severity: 'error',
					layer: 'source',
					status: 'active',
					recordId: row.id,
					fieldPath: 'id',
					stationId: null,
					expected: { id: row.id },
					actual: { id: (value as { id?: unknown }).id },
					reason: `${row.recordPath} 的 id 与目录名/索引 ${row.id} 不一致`,
					recommendation: '统一目录名、索引 id 与 record.json id 后再审计',
					evidence: [row.recordPath],
				}),
			);
			row.blockReason = 'record-id-mismatch';
		}
		try {
			row.computedSha256 = directorySha256(join(row.root, 'records', row.id));
		} catch (error) {
			row.computedSha256 = null;
			notChecked.push({
				code: 'INDEX_SHA_UNCOMPUTABLE',
				layer: 'source',
				recordId: row.id,
				fieldPath: 'index.json.records[].sha256',
				reason: error instanceof Error ? error.message : String(error),
				dependency: null,
			});
		}
		if (row.computedSha256 && row.indexSha256 && row.computedSha256 !== row.indexSha256) {
			findings.push(
				finding({
					code: 'INDEX_SHA_MISMATCH',
					severity: 'warning',
					layer: 'source',
					status: 'active',
					recordId: row.id,
					fieldPath: 'index.json.records[].sha256',
					stationId: null,
					expected: { sha256: row.indexSha256 },
					actual: { sha256: row.computedSha256 },
					reason: '索引 sha256 与按现有 record-sha 算法重算的目录摘要不一致（现有 loader 尚未核验该字段，故先记 warning）',
					recommendation: '重新导出该条以刷新 sha256；校验器只报告，不改索引',
					evidence: [row.recordPath],
				}),
			);
		}
	}

	const ordered = rows.sort((a, b) => {
		if (a.root !== b.root) return a.root < b.root ? -1 : 1;
		return (a.indexOrdinal ?? 0) - (b.indexOrdinal ?? 0);
	});
	const indexedIds = [...new Set(ordered.map((row) => row.id))];
	const observedIds = [...new Set(ordered.map((row) => row.id))].sort();
	const expectedIds = [...indexedIds].sort();
	const dirIds = [...new Set(scans.flatMap((scan) => scan.dirIds))].sort();
	const missingIds = dirIds.filter((id) => !observedIds.includes(id));
	const extraIds = observedIds.filter((id) => !dirIds.includes(id));
	const identityFinding = findings.some((item) =>
		[
			'INVENTORY_INDEX_MISSING',
			'INVENTORY_INDEX_UNREADABLE',
			'INVENTORY_INDEX_INVALID',
			'INVENTORY_INDEX_DUPLICATE_ID',
			'INVENTORY_DUPLICATE_ID',
			'INVENTORY_DUPLICATE_ID_CROSS_ROOT',
			'INVENTORY_INDEX_NO_DIR',
			'INVENTORY_DIR_UNINDEXED',
			'INVENTORY_ID_MISMATCH',
			'INVENTORY_LEGACY_ROOT_OMITTED',
		].includes(item.code),
	);
	const complete = !identityFinding && missingIds.length === 0 && extraIds.length === 0 && ordered.length > 0;
	const roots: Record<string, number> = {};
	for (const row of ordered) roots[row.root] = (roots[row.root] ?? 0) + 1;

	return { rows: ordered, findings, notChecked, expectedIds, observedIds, missingIds, extraIds, complete, roots };
}
