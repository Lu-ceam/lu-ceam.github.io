/**
 * Validate a curator export (or ship-request ticket), copy into records/,
 * apply site marks when the ticket says ready, fill minimal reveal otherwise,
 * then open a pull request. Merge when CI is green and the diff is only
 * records data, layout, and public images.
 *
 * Usage:
 *   node scripts/ship-records.mjs --request /path/to/ship-request.json
 *   node scripts/ship-records.mjs <export-dir>          # full replace; fails if site has ids missing from export
 *   node scripts/ship-records.mjs <export-dir> --force-full
 *
 * Re-encoding a plate that is not already WebP needs sharp:
 * npm install --no-save sharp
 */
import { readdir, readFile, stat } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { assertTrajectoryPointers, loadEntityCatalog, resolveRecordsExport } from '../src/data/records-entities.ts';
import { assertExportValue, parseRecord } from '../src/data/records-export.ts';
import { appendRecords } from './append-records.mjs';
import { applySiteMarks } from './apply-site-marks.mjs';
import { importRecords } from './import-records.mjs';
import { ensureRevealAssets } from './reveal-layout.mjs';
import { assertTrajectoryCheckState, assertTrajectoryTicket, loadShipRequest } from './ship-request.mjs';

const DATA_PREFIXES = ['records/', 'public/records/'];
const DATA_FILES = new Set(['src/data/records-layout.json']);

export function isDataOnlyPath(file) {
	if (DATA_FILES.has(file)) return true;
	return DATA_PREFIXES.some((prefix) => file.startsWith(prefix));
}

async function walkJson(dir, visit) {
	let names;
	try {
		names = await readdir(dir);
	} catch {
		throw new Error(`找不到导出目录 ${dir}`);
	}
	for (const name of names) {
		if (name === '.DS_Store') continue;
		const abs = join(dir, name);
		const info = await stat(abs);
		if (info.isDirectory()) {
			await walkJson(abs, visit);
			continue;
		}
		if (!name.endsWith('.json')) continue;
		let data;
		try {
			data = JSON.parse(await readFile(abs, 'utf8'));
		} catch {
			throw new Error(`无法解析 JSON：${abs}`);
		}
		visit(data, abs);
	}
}

/** Schema, forbidden fields, image paths. Throws; does not write. */
export async function validateExportDir(exportDir) {
	await walkJson(exportDir, (data, file) => {
		assertExportValue(data, file);
	});
	resolveRecordsExport({
		exportRoot: exportDir,
		legacyRoot: join(exportDir, '.ship-no-legacy'),
	});
}

/** Validate only selected record trees + index entry presence. */
export async function validateExportIds(exportDir, ids) {
	const index = JSON.parse(await readFile(join(exportDir, 'index.json'), 'utf8'));
	if (index.schemaVersion !== 1) {
		throw new Error(`未知的 schemaVersion：${index.schemaVersion}`);
	}
	const byId = new Map(index.records.map((e) => [e.id, e]));
	for (const id of ids) {
		if (!byId.has(id)) throw new Error(`导出 index 缺少 ${id}`);
		const root = join(exportDir, 'records', id);
		await walkJson(root, (data, file) => {
			assertExportValue(data, file);
		});
		// loadRecordsExport expects a full export root; validate single record.json via assert only.
		const record = JSON.parse(await readFile(join(root, 'record.json'), 'utf8'));
		assertExportValue(record, join(root, 'record.json'));
	}
	return byId;
}

function git(args, capture = false) {
	return execFileSync('git', args, {
		encoding: 'utf8',
		stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
	});
}

function idsFromPaths(paths) {
	const ids = new Set();
	for (const file of paths) {
		const match = file.match(/^(?:public\/records|records\/records)\/([a-z0-9]+)\//);
		if (match) ids.add(match[1]);
	}
	return [...ids];
}

function fail(message) {
	console.error(message);
	process.exit(1);
}

async function assertNoWipe(exportDir) {
	let siteIndex;
	try {
		siteIndex = JSON.parse(await readFile(join(process.cwd(), 'records/index.json'), 'utf8'));
	} catch {
		return;
	}
	const exportIndex = JSON.parse(await readFile(join(exportDir, 'index.json'), 'utf8'));
	const exportIds = new Set(exportIndex.records.map((e) => e.id));
	const missing = siteIndex.records.map((e) => e.id).filter((id) => !exportIds.has(id));
	if (missing.length > 0) {
		fail(
			`整包导入会丢掉站上已有 id：${missing.join(', ')}。请改用 --request ship-request.json（append），或显式 --force-full。`,
		);
	}
}

async function openAndMaybeMerge({ subject, bodyLines }) {
	git(['add', '--', 'records', 'src/data/records-layout.json', 'public/records']);
	const staged = git(['diff', '--cached', '--name-only'], true)
		.split('\n')
		.map((line) => line.trim())
		.filter(Boolean);
	if (staged.length === 0) {
		console.log('无变更。未开 PR。');
		return { merged: false, url: null };
	}
	const foreign = staged.filter((file) => !isDataOnlyPath(file));
	if (foreign.length > 0) {
		fail(`暂存了非数据文件，已停止且未提交：\n${foreign.join('\n')}`);
	}

	git(['commit', '-m', `${subject}\n\n${bodyLines.join('\n')}`]);
	const branch = git(['branch', '--show-current'], true).trim();
	git(['push', '-u', 'origin', branch]);

	const body = [...bodyLines, '', '合并条件：diff 只有 `records/`、`public/records/`、`src/data/records-layout.json`，且 CI 的 `npm run check` 与 `npm run build` 通过。', ''].join(
		'\n',
	);
	const url = execFileSync('gh', ['pr', 'create', '--base', 'main', '--title', subject, '--body', body], {
		encoding: 'utf8',
	}).trim();
	console.log(url);

	const names = git(['diff', '--name-only', 'origin/main...HEAD'], true)
		.split('\n')
		.map((line) => line.trim())
		.filter(Boolean);
	const outside = names.filter((file) => !isDataOnlyPath(file));
	if (outside.length > 0) {
		console.log(`待合：diff 含非数据文件，不自动合并。\n${outside.join('\n')}\n${url}`);
		return { merged: false, url };
	}

	try {
		execFileSync('gh', ['pr', 'checks', '--watch', '--fail-fast'], { stdio: 'inherit' });
	} catch {
		fail(`待合：CI 未通过。${url}`);
	}
	try {
		execFileSync('gh', ['pr', 'merge', '--squash', '--delete-branch'], { stdio: 'inherit' });
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		fail(`待合：CI 已绿，但合并失败。${url}\n${message}`);
	}
	console.log(`已合并 ${url}`);
	return { merged: true, url };
}

async function shipFull(exportDir, { forceFull = false } = {}) {
	const abs = resolve(exportDir);
	try {
		await validateExportDir(abs);
	} catch (error) {
		fail(error instanceof Error ? error.message : String(error));
	}
	if (!forceFull) await assertNoWipe(abs);

	const dirty = git(['status', '--porcelain'], true);
	if (dirty.trim()) fail('工作区不干净，先提交或还原后再 ship。');

	git(['fetch', 'origin', 'main']);
	const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15);
	const branch = `records/ship-${stamp}`;
	git(['checkout', '-b', branch, 'origin/main']);

	const imported = await importRecords(abs, resolve('records'));
	const revealed = await ensureRevealAssets();
	const ids = idsFromPaths(
		git(['status', '--porcelain'], true)
			.split('\n')
			.map((l) => l.trim().slice(3))
			.filter(Boolean),
	);
	const subject =
		ids.length > 0 && ids.length <= 4
			? `data(records): ship ${ids.join(', ')}`
			: 'data(records): ship curator export';
	const recompressed = imported.changed.length > 0 ? imported.changed.join(', ') : '无';
	const filled = revealed.changed.length > 0 ? revealed.changed.join(', ') : '无';
	await openAndMaybeMerge({
		subject,
		bodyLines: [
			'馆员导出已校验（schemaVersion 1，禁止字段会直接失败），整包导入 `records/`，并为还不能 reveal 的 plate 补了 upright 与至少 2px 内缩的 crop。题铭未改。',
			'',
			`- 重压图片：${recompressed}`,
			`- 补 reveal 版式：${filled}`,
		],
	});
}

async function shipRequest(requestPath) {
	const ticket = await loadShipRequest(requestPath);
	const absExport = ticket.exportDir;
	let byId;
	try {
		byId = await validateExportIds(absExport, ticket.ids);
	} catch (error) {
		fail(error instanceof Error ? error.message : String(error));
	}

	let catalog;
	try {
		catalog = loadEntityCatalog(absExport);
	} catch (error) {
		fail(error instanceof Error ? error.message : String(error));
	}
	for (const id of ticket.ids) {
		const want = ticket.records[id].recordSha256;
		const got = byId.get(id).sha256;
		if (want !== got) {
			fail(`id=${id} 票面 recordSha256=${want} 与导出 index 条目 sha256=${got} 不一致`);
		}
		const recordPath = join(absExport, 'records', id, 'record.json');
		let record;
		try {
			record = JSON.parse(await readFile(recordPath, 'utf8'));
			assertTrajectoryTicket(id, ticket.records[id], record);
			assertTrajectoryPointers(parseRecord(record, recordPath), catalog);
			await assertTrajectoryCheckState(id, ticket.records[id].trajectoryCheckState);
		} catch (error) {
			fail(error instanceof Error ? error.message : String(error));
		}
	}

	const dirty = git(['status', '--porcelain'], true);
	if (dirty.trim()) fail('工作区不干净，先提交或还原后再 ship。');

	git(['fetch', 'origin', 'main']);
	const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15);
	const branch = `records/ship-${ticket.ids.join('-').slice(0, 40)}-${stamp}`;
	git(['checkout', '-b', branch, 'origin/main']);

	const appended = await appendRecords(absExport, resolve('records'), ticket.ids);
	const marksNotes = [];
	for (const id of ticket.ids) {
		const entry = ticket.records[id];
		if (entry.marks === 'ready') {
			const applied = await applySiteMarks({
				id,
				draftPath: entry.detailsDraft,
				platesDir: entry.siteMarksDir,
				detailsNote: entry.detailsNote,
				statePath: entry.imageCheckState,
			});
			marksNotes.push(`${id}: ready (${applied.details} details)`);
		} else if (entry.marks === 'waived') {
			marksNotes.push(`${id}: waived (${entry.waiverReason})`);
		} else {
			marksNotes.push(`${id}: none (minimal reveal)`);
		}
	}
	const revealed = await ensureRevealAssets();

	const subject =
		ticket.ids.length <= 4
			? `data(records): append ${ticket.ids.join(', ')}`
			: `data(records): append ${ticket.ids.length} records`;
	await openAndMaybeMerge({
		subject,
		bodyLines: [
			'馆员 ship-request 已校验；append-only 写入，不 wipe 站上独有 id。',
			'',
			`- 请求：\`${ticket.path}\``,
			`- 导出：\`${absExport}\``,
			`- added：${appended.added.join(', ') || '无'}`,
			`- updated：${appended.updated.join(', ') || '无'}`,
			`- 重压：${appended.changed.join(', ') || '无'}`,
			`- marks：${marksNotes.join('；')}`,
			`- trajectory：${ticket.ids.map((id) => `${id}=${ticket.records[id].trajectory}`).join('；')}`,
			`- 补 reveal：${revealed.changed.join(', ') || '无'}`,
		],
	});
}

function parseArgs(argv) {
	const out = { positional: [], forceFull: false, request: null };
	for (let i = 0; i < argv.length; i += 1) {
		const a = argv[i];
		if (a === '--request') out.request = argv[++i];
		else if (a === '--force-full') out.forceFull = true;
		else if (a.startsWith('-')) fail(`未知参数：${a}`);
		else out.positional.push(a);
	}
	return out;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
	const args = parseArgs(process.argv.slice(2));
	if (args.request) {
		await shipRequest(args.request);
	} else if (args.positional[0]) {
		await shipFull(args.positional[0], { forceFull: args.forceFull });
	} else {
		fail(
			'用法:\n  node scripts/ship-records.mjs --request /path/to/ship-request.json\n  node scripts/ship-records.mjs <export-dir> [--force-full]',
		);
	}
}
