/**
 * Merge selected curator export ids into records/ without wiping site-only ids.
 *
 * Usage: node scripts/append-records.mjs <export-dir> --ids id1,id2
 *
 * Images already within 2000px and without EXIF/XMP/IPTC are copied byte for
 * byte. Larger or metadata-bearing images are re-encoded (needs sharp).
 */
import { cp, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import forbiddenFields from '../src/data/forbidden-fields.json' with { type: 'json' };
import { directorySha256 } from './record-sha.mjs';

const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp']);
const ENTITY_DIRS = ['people', 'works', 'events'];
const MAX_EDGE = 2000;
const forbiddenLower = new Set(forbiddenFields.map((field) => field.toLowerCase()));

function fail(message) {
	console.error(message);
	process.exit(1);
}

let sharpModule;

async function loadSharp() {
	if (sharpModule) return sharpModule;
	try {
		sharpModule = (await import('sharp')).default;
		return sharpModule;
	} catch {
		fail(
			'这条导入需要 sharp 读取或重压图片：先 `npm install --no-save sharp`，或请馆员给出已转正、无元数据的图。',
		);
	}
}

function assertTree(value, file, path = []) {
	if (Array.isArray(value)) {
		value.forEach((item, index) => assertTree(item, file, [...path, index]));
		return;
	}
	if (!value || typeof value !== 'object') return;
	for (const [key, child] of Object.entries(value)) {
		const folded = key.toLowerCase();
		if (forbiddenLower.has(folded)) {
			fail(`禁止字段 ${key}（${file} ${[...path, key].join('.')}）`);
		}
		if (folded === 'schemaversion' && child !== 1) {
			fail(`未知的 schemaVersion：${String(child)}（${file}）。当前只接受 1。`);
		}
		assertTree(child, file, [...path, key]);
	}
}

async function readJson(file) {
	const data = JSON.parse(await readFile(file, 'utf8'));
	assertTree(data, file);
	return data;
}

async function walkFiles(dir, base = dir) {
	const out = [];
	for (const name of await readdir(dir)) {
		if (name === '.DS_Store') continue;
		const abs = join(dir, name);
		const info = await stat(abs);
		if (info.isDirectory()) out.push(...(await walkFiles(abs, base)));
		else out.push(relative(base, abs));
	}
	return out;
}

async function transformImage(src, dest) {
	const sharp = await loadSharp();
	const meta = await sharp(src, { failOn: 'none' }).metadata();
	const tooBig = (meta.width ?? 0) > MAX_EDGE || (meta.height ?? 0) > MAX_EDGE;
	const hasMeta = Boolean(meta.exif || meta.iptc || meta.xmp || (meta.orientation && meta.orientation !== 1));
	await mkdir(dirname(dest), { recursive: true });
	if (!tooBig && !hasMeta) {
		await cp(src, dest);
		return false;
	}
	let pipeline = sharp(src, { failOn: 'none' }).rotate().resize({
		width: MAX_EDGE,
		height: MAX_EDGE,
		fit: 'inside',
		withoutEnlargement: true,
	});
	const ext = extname(src).toLowerCase();
	if (ext === '.png') pipeline = pipeline.png();
	else if (ext === '.webp') pipeline = pipeline.webp({ quality: 90 });
	else pipeline = pipeline.jpeg({ quality: 90, mozjpeg: true });
	await pipeline.toFile(dest);
	return true;
}

/**
 * @param {string} exportDir
 * @param {string} destDir records/ root in the site repo
 * @param {string[]} ids
 * @returns {Promise<{ changed: string[], added: string[], updated: string[] }>}
 */
export async function appendRecords(exportDir, destDir, ids) {
	if (!Array.isArray(ids) || ids.length === 0) fail('appendRecords 需要至少一个 id');
	const unique = [...new Set(ids)];
	const exportIndex = await readJson(join(exportDir, 'index.json'));
	if (!exportIndex || exportIndex.schemaVersion !== 1) {
		fail(`未知的 schemaVersion：${exportIndex?.schemaVersion ?? '缺少'}（${join(exportDir, 'index.json')}）。当前只接受 1。`);
	}
	const exportById = new Map(exportIndex.records.map((entry) => [entry.id, entry]));
	for (const id of unique) {
		if (!exportById.has(id)) fail(`导出 index 里没有 ${id}`);
		const srcDir = join(exportDir, 'records', id);
		try {
			await stat(srcDir);
		} catch {
			fail(`导出缺少目录 records/${id}`);
		}
	}

	let destIndex;
	try {
		destIndex = await readJson(join(destDir, 'index.json'));
	} catch {
		destIndex = { schemaVersion: 1, generatedAt: exportIndex.generatedAt, records: [] };
	}
	if (destIndex.schemaVersion !== 1) {
		fail(`站点 records/index.json schemaVersion 不是 1：${destIndex.schemaVersion}`);
	}

	const destById = new Map(destIndex.records.map((entry) => [entry.id, entry]));
	const added = [];
	const updated = [];
	const recompressed = new Set();

	for (const id of unique) {
		const srcRoot = join(exportDir, 'records', id);
		const staging = join(dirname(destDir), `.records-append-${process.pid}-${id}`);
		await rm(staging, { recursive: true, force: true });
		await mkdir(staging, { recursive: true });
		try {
			const files = await walkFiles(srcRoot);
			for (const rel of files) {
				const src = join(srcRoot, rel);
				const dest = join(staging, rel);
				await mkdir(dirname(dest), { recursive: true });
				if (rel.endsWith('.json')) {
					await readJson(src);
					await cp(src, dest);
					continue;
				}
				if (IMAGE_EXT.has(extname(rel).toLowerCase())) {
					const did = await transformImage(src, dest);
					if (did) recompressed.add(id);
					continue;
				}
				await cp(src, dest);
			}
			const target = join(destDir, 'records', id);
			await rm(target, { recursive: true, force: true });
			await mkdir(dirname(target), { recursive: true });
			await cp(staging, target, { recursive: true });

			const exportEntry = exportById.get(id);
			let sha = exportEntry.sha256;
			let updatedAt = exportEntry.updatedAt;
			if (recompressed.has(id)) {
				sha = directorySha256(target);
				updatedAt = new Date().toISOString();
			}
			const nextEntry = { id, updatedAt, sha256: sha };
			if (destById.has(id)) {
				updated.push(id);
				destById.set(id, nextEntry);
			} else {
				added.push(id);
				destById.set(id, nextEntry);
			}
		} finally {
			await rm(staging, { recursive: true, force: true });
		}
	}

	const now = new Date().toISOString();
	const nextIndex = {
		schemaVersion: 1,
		generatedAt: now,
		records: [
			...destIndex.records.map((entry) => destById.get(entry.id) ?? entry),
			...added.map((id) => destById.get(id)),
		],
	};
	await writeFile(join(destDir, 'index.json'), `${JSON.stringify(nextIndex, null, 2)}\n`);

	let changelog = [];
	const changelogPath = join(destDir, 'changelog.json');
	try {
		changelog = JSON.parse(await readFile(changelogPath, 'utf8'));
		if (!Array.isArray(changelog)) changelog = [];
	} catch {
		changelog = [];
	}
	changelog.push({
		at: now,
		schemaVersion: 1,
		added,
		changed: updated,
		removed: [],
	});
	await writeFile(changelogPath, `${JSON.stringify(changelog, null, 2)}\n`);

	// Keep README from export when present (non-destructive copy).
	try {
		await cp(join(exportDir, 'README.md'), join(destDir, 'README.md'));
	} catch {
		/* optional */
	}

	await syncEntityCatalog(exportDir, destDir);

	return { changed: [...recompressed], added, updated };
}

/**
 * Copy Person / Work / Event files that travel with the export.
 * Same id is overwritten. Ids that exist only on the site are kept.
 * A kind the export does not include is left untouched.
 *
 * @param {string} exportDir
 * @param {string} destDir
 */
export async function syncEntityCatalog(exportDir, destDir) {
	for (const kind of ENTITY_DIRS) {
		const srcRoot = join(exportDir, kind);
		try {
			await stat(srcRoot);
		} catch {
			continue;
		}
		const indexPath = join(srcRoot, 'index.json');
		const srcIndex = await readJson(indexPath);
		if (!srcIndex || srcIndex.schemaVersion !== 1 || !Array.isArray(srcIndex.ids)) {
			fail(`${indexPath} 须为 schemaVersion 1，且含 ids 数组`);
		}
		const destRoot = join(destDir, kind);
		await mkdir(destRoot, { recursive: true });
		let destIds = [];
		try {
			const destIndex = await readJson(join(destRoot, 'index.json'));
			if (Array.isArray(destIndex.ids)) destIds = destIndex.ids;
		} catch {
			destIds = [];
		}
		const ids = new Set(destIds);
		for (const id of srcIndex.ids) {
			if (typeof id !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) {
				fail(`${indexPath} 的 id 不合法：${id}`);
			}
			const srcFile = join(srcRoot, `${id}.json`);
			try {
				await stat(srcFile);
			} catch {
				fail(`导出缺少 ${kind}/${id}.json`);
			}
			await readJson(srcFile);
			await cp(srcFile, join(destRoot, `${id}.json`));
			ids.add(id);
		}
		const next = { schemaVersion: 1, ids: [...ids].sort() };
		await writeFile(join(destRoot, 'index.json'), `${JSON.stringify(next, null, 2)}\n`);
	}
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
	const exportDir = process.argv[2];
	const idsFlag = process.argv.indexOf('--ids');
	if (!exportDir || idsFlag < 0 || !process.argv[idsFlag + 1]) {
		fail('用法: node scripts/append-records.mjs <export-dir> --ids id1,id2');
	}
	const ids = process.argv[idsFlag + 1]
		.split(',')
		.map((s) => s.trim())
		.filter(Boolean);
	const result = await appendRecords(resolve(exportDir), resolve('records'), ids);
	console.log(
		`append ${ids.join(', ')} → records/; added=${result.added.join(',') || '无'}; updated=${result.updated.join(',') || '无'}; recompressed=${result.changed.join(',') || '无'}`,
	);
}
