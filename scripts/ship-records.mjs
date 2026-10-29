/**
 * Validate a curator export, copy it into records/, fill any plate that
 * cannot reveal, then open a pull request. Merge when CI is green and the
 * diff is only records data, layout, and public images.
 *
 * Usage: node scripts/ship-records.mjs <export-dir>
 *
 * `<export-dir>` is a full v1 export (index.json, changelog.json,
 * records/<id>/), the same tree `import-records.mjs` copies. Schema or
 * forbidden-field failures exit non-zero and do not commit.
 *
 * Re-encoding a plate that is not already WebP needs sharp:
 * npm install --no-save sharp
 */
import { readdir, readFile, stat } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { assertExportValue, loadRecordsExport } from '../src/data/records-export.ts';
import { importRecords } from './import-records.mjs';
import { ensureRevealAssets } from './reveal-layout.mjs';

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
	loadRecordsExport({
		exportRoot: exportDir,
		legacyRoot: join(exportDir, '.ship-no-legacy'),
	});
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

async function ship(exportDir) {
	const abs = resolve(exportDir);
	try {
		await validateExportDir(abs);
	} catch (error) {
		fail(error instanceof Error ? error.message : String(error));
	}

	const dirty = git(['status', '--porcelain'], true);
	if (dirty.trim()) fail('工作区不干净，先提交或还原后再 ship。');

	git(['fetch', 'origin', 'main']);
	const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15);
	const branch = `records/ship-${stamp}`;
	git(['checkout', '-b', branch, 'origin/main']);

	const imported = await importRecords(abs, resolve('records'));
	const revealed = await ensureRevealAssets();
	git(['add', '--', 'records', 'src/data/records-layout.json', 'public/records']);
	const staged = git(['diff', '--cached', '--name-only'], true)
		.split('\n')
		.map((line) => line.trim())
		.filter(Boolean);
	if (staged.length === 0) {
		console.log(`无变更（${abs}）。未开 PR。`);
		git(['checkout', 'main']);
		git(['branch', '-D', branch]);
		return;
	}
	const foreign = staged.filter((file) => !isDataOnlyPath(file));
	if (foreign.length > 0) {
		fail(`暂存了非数据文件，已停止且未提交：\n${foreign.join('\n')}`);
	}

	const ids = idsFromPaths(staged);
	const subject =
		ids.length > 0 && ids.length <= 4
			? `data(records): ship ${ids.join(', ')}`
			: 'data(records): ship curator export';
	const recompressed = imported.changed.length > 0 ? imported.changed.join(', ') : '无';
	const filled = revealed.changed.length > 0 ? revealed.changed.join(', ') : '无';
	git([
		'commit',
		'-m',
		`${subject}\n\n校验 schemaVersion 1 与禁止字段后导入。重压：${recompressed}。补 reveal 版式：${filled}。`,
	]);
	git(['push', '-u', 'origin', branch]);

	const body = [
		'馆员导出已校验（schemaVersion 1，禁止字段会直接失败），导入 `records/`，并为还不能 reveal 的 plate 补了 upright 与至少 2px 内缩的 crop。题铭未改。',
		'',
		`- 重压图片：${recompressed}`,
		`- 补 reveal 版式：${filled}`,
		'',
		'合并条件：diff 只有 `records/`、`public/records/`、`src/data/records-layout.json`，且 CI 的 `npm run check` 与 `npm run build` 通过。',
		'',
	].join('\n');
	const url = execFileSync(
		'gh',
		['pr', 'create', '--base', 'main', '--title', subject, '--body', body],
		{ encoding: 'utf8' },
	).trim();
	console.log(url);

	const names = git(['diff', '--name-only', 'origin/main...HEAD'], true)
		.split('\n')
		.map((line) => line.trim())
		.filter(Boolean);
	const outside = names.filter((file) => !isDataOnlyPath(file));
	if (outside.length > 0) {
		console.log(`待合：diff 含非数据文件，不自动合并。\n${outside.join('\n')}\n${url}`);
		return;
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
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
	const exportDir = process.argv[2];
	if (!exportDir) fail('用法: node scripts/ship-records.mjs <export-dir>');
	await ship(exportDir);
}
