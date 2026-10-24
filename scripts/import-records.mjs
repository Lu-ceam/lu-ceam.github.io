/**
 * Copy a curator export into records/.
 *
 * Images already within 2000px and without EXIF/XMP/IPTC are copied byte for
 * byte, and index.json is left unchanged. Anything larger, or still carrying
 * metadata, is rotated, resized inside 2000px, and written without EXIF.
 * Those records get a new sha256 (see scripts/record-sha.mjs).
 *
 * Usage: node scripts/import-records.mjs <export-dir>
 */
import { cp, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import sharp from 'sharp';
import forbiddenFields from '../src/data/forbidden-fields.json' with { type: 'json' };
import { directorySha256 } from './record-sha.mjs';

const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp']);
const MAX_EDGE = 2000;
const forbiddenLower = new Set(forbiddenFields.map((field) => field.toLowerCase()));

function fail(message) {
	console.error(message);
	process.exit(1);
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

export async function importRecords(exportDir, destDir) {
	const indexPath = join(exportDir, 'index.json');
	const index = await readJson(indexPath);
	if (!index || index.schemaVersion !== 1) {
		fail(`未知的 schemaVersion：${index?.schemaVersion ?? '缺少'}（${indexPath}）。当前只接受 1。`);
	}
	const staging = join(dirname(destDir), `.records-import-${process.pid}`);
	await rm(staging, { recursive: true, force: true });
	await mkdir(staging, { recursive: true });
	const changed = new Set();
	try {
		const files = await walkFiles(exportDir);
		for (const rel of files) {
			const src = join(exportDir, rel);
			const dest = join(staging, rel);
			await mkdir(dirname(dest), { recursive: true });
			if (rel.endsWith('.json')) {
				await readJson(src);
				await cp(src, dest);
				continue;
			}
			if (IMAGE_EXT.has(extname(rel).toLowerCase())) {
				const did = await transformImage(src, dest);
				if (did) {
					const id = rel.split('/')[1];
					if (rel.startsWith('records/') && id) changed.add(id);
				}
				continue;
			}
			await cp(src, dest);
		}
		if (changed.size > 0) {
			const next = structuredClone(index);
			const now = new Date().toISOString();
			next.generatedAt = now;
			for (const entry of next.records) {
				if (!changed.has(entry.id)) continue;
				entry.sha256 = directorySha256(join(staging, 'records', entry.id));
				entry.updatedAt = now;
			}
			await writeFile(join(staging, 'index.json'), `${JSON.stringify(next, null, 2)}\n`);
		}
		await rm(destDir, { recursive: true, force: true });
		await cp(staging, destDir, { recursive: true });
	} finally {
		await rm(staging, { recursive: true, force: true });
	}
	return { changed: [...changed] };
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
	const exportDir = process.argv[2];
	if (!exportDir) fail('用法: node scripts/import-records.mjs <export-dir>');
	const abs = resolve(exportDir);
	const dest = resolve('records');
	const { changed } = await importRecords(abs, dest);
	if (changed.length === 0) {
		console.log(`imported ${abs} → ${dest} (image bytes unchanged, index.json kept)`);
	} else {
		console.log(`imported ${abs} → ${dest}; recompressed and rehashed: ${changed.join(', ')}`);
	}
}
