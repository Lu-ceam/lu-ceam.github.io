/**
 * Fill plates that cannot reveal: copy a missing upright from the plate and
 * write a crop with at least a 2px inset. Marks are left untouched.
 *
 * Used by scripts/ship-records.mjs. Safe to run on a catalog that is already
 * reveal — those rows are not rewritten.
 */
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { cropIsProperSubRectangle, expectedPlateHeight } from '../src/data/detail-display.ts';

export function readWebpSize(file) {
	const buf = typeof file === 'string' ? readFileSync(file) : file;
	if (buf.length < 30 || buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WEBP') {
		throw new Error(`不是 WebP：${typeof file === 'string' ? file : 'buffer'}`);
	}
	const tag = buf.toString('ascii', 12, 16);
	if (tag === 'VP8 ') {
		return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
	}
	if (tag === 'VP8L') {
		const bits = buf.readUInt32LE(21);
		return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
	}
	if (tag === 'VP8X') {
		return {
			width: 1 + (buf[24] | (buf[25] << 8) | (buf[26] << 16)),
			height: 1 + (buf[27] | (buf[28] << 8) | (buf[29] << 16)),
		};
	}
	throw new Error(`无法读取 WebP 尺寸：${typeof file === 'string' ? file : 'buffer'}`);
}

export function assetPaths(recordId, detail) {
	const face =
		detail.disc !== undefined && detail.side !== undefined
			? `-d${detail.disc}-s${detail.side}`
			: '';
	return {
		plate: `/records/${recordId}/${detail.part}${face}.webp`,
		upright: `/records/${recordId}/${detail.part}${face}-upright.webp`,
	};
}

export function isRevealDetail(detail) {
	if (!detail?.upright || !detail?.transform?.crop || !detail?.plate) return false;
	const crop = detail.transform.crop;
	const upright = detail.upright;
	if (detail.transform.cropSpace !== 'upright') return false;
	if (detail.transform.exportWidth !== detail.plate.width) return false;
	if (crop.x + crop.w > upright.width || crop.y + crop.h > upright.height) return false;
	if (!cropIsProperSubRectangle(crop, upright)) return false;
	const expected = expectedPlateHeight(detail.transform.exportWidth, crop);
	return Math.abs(detail.plate.height - expected) <= 1;
}

function proper(crop, width, height) {
	return crop.x >= 2 || crop.y >= 2 || crop.w <= width - 2 || crop.h <= height - 2;
}

/**
 * Largest crop inside the upright whose ratio matches the plate, with at
 * least a 2px inset on one edge. `expectedPlateHeight(plateWidth, crop)`
 * stays within 1px of `plateHeight`.
 */
export function minimalRevealCrop(uprightWidth, uprightHeight, plateWidth, plateHeight) {
	if (plateWidth < 1 || plateHeight < 1) {
		throw new Error(`plate 尺寸不合法：${plateWidth}×${plateHeight}`);
	}
	const maxW = uprightWidth - 2;
	if (maxW < 1 || uprightHeight < 1) {
		throw new Error(`upright 太小，无法做 2px 内缩：${uprightWidth}×${uprightHeight}`);
	}
	for (let cw = Math.min(uprightWidth, maxW); cw >= 1; cw -= 1) {
		const ideal = (plateHeight * cw) / plateWidth;
		const candidates = [Math.round(ideal), Math.floor(ideal), Math.ceil(ideal)];
		const seen = new Set();
		for (const ch of candidates) {
			if (seen.has(ch) || ch < 1 || ch > uprightHeight) continue;
			seen.add(ch);
			const expected = expectedPlateHeight(plateWidth, { w: cw, h: ch });
			if (Math.abs(plateHeight - expected) > 1) continue;
			const x = uprightWidth - cw >= 2 ? Math.min(2, uprightWidth - cw) : 0;
			const y = uprightHeight - ch >= 2 ? Math.min(2, uprightHeight - ch) : 0;
			const crop = { x, y, w: cw, h: ch };
			if (crop.x + crop.w > uprightWidth || crop.y + crop.h > uprightHeight) continue;
			if (!proper(crop, uprightWidth, uprightHeight)) continue;
			return crop;
		}
	}
	throw new Error(
		`找不到 reveal crop：upright ${uprightWidth}×${uprightHeight}，plate ${plateWidth}×${plateHeight}`,
	);
}

export function findRecordSpan(raw, id) {
	const needle = `\n    "id": ${JSON.stringify(id)}`;
	const idAt = raw.indexOf(needle);
	if (idAt < 0) return null;
	const brace = raw.lastIndexOf('{', idAt);
	if (brace < 0) return null;
	let depth = 0;
	let inString = false;
	let escape = false;
	for (let i = brace; i < raw.length; i += 1) {
		const c = raw[i];
		if (inString) {
			if (escape) {
				escape = false;
				continue;
			}
			if (c === '\\') {
				escape = true;
				continue;
			}
			if (c === '"') inString = false;
			continue;
		}
		if (c === '"') {
			inString = true;
			continue;
		}
		if (c === '{') depth += 1;
		else if (c === '}') {
			depth -= 1;
			if (depth === 0) return { start: brace, end: i + 1 };
		}
	}
	throw new Error(`版式 JSON 里 ${id} 的对象没有闭合`);
}

export function formatRecord(record) {
	const lines = JSON.stringify(record, null, 2).split('\n');
	return lines.map((line, index) => (index === 0 ? line : `  ${line}`)).join('\n');
}

export function replaceLayoutRecord(raw, record) {
	const formatted = formatRecord(record);
	const span = findRecordSpan(raw, record.id);
	if (!span) {
		const block = JSON.stringify(record, null, 2)
			.split('\n')
			.map((line) => `  ${line}`)
			.join('\n');
		const body = raw.endsWith('\n') ? raw.slice(0, -1) : raw;
		const without = body.replace(/\s*]$/, '');
		const sep = JSON.parse(raw).length > 0 ? ',\n' : '\n';
		return `${without}${sep}${block}\n]\n`;
	}
	return `${raw.slice(0, span.start)}${formatted}${raw.slice(span.end)}`;
}

function absPublic(publicRoot, src) {
	if (!src.startsWith('/') || src.includes('..')) throw new Error(`图片路径不合法：${src}`);
	return join(publicRoot, src.slice(1));
}

async function encodeWebp(src, dest) {
	let sharp;
	try {
		sharp = (await import('sharp')).default;
	} catch {
		throw new Error(
			'这条导入需要 sharp 读取或重压图片：先 `npm install --no-save sharp`，或请馆员给出已是 WebP 的 plate。',
		);
	}
	await mkdir(dirname(dest), { recursive: true });
	await sharp(src, { failOn: 'none' })
		.rotate()
		.resize({ width: 2000, height: 2000, fit: 'inside', withoutEnlargement: true })
		.webp({ quality: 90 })
		.toFile(dest);
}

function plateFileMatches(detail, publicRoot) {
	const file = absPublic(publicRoot, detail.plate.src);
	if (!existsSync(file)) return false;
	const size = readWebpSize(file);
	if (size.width !== detail.plate.width || size.height !== detail.plate.height) {
		throw new Error(
			`图片尺寸与文件不符 ${detail.plate.src}：JSON ${detail.plate.width}×${detail.plate.height}，文件 ${size.width}×${size.height}`,
		);
	}
	return true;
}

function uprightFileMatches(detail, publicRoot) {
	if (!detail.upright) return false;
	const file = absPublic(publicRoot, detail.upright.src);
	if (!existsSync(file)) return false;
	const size = readWebpSize(file);
	return size.width === detail.upright.width && size.height === detail.upright.height;
}

async function repairDetail({ id, detail, recordsRoot, publicRoot }) {
	const paths = assetPaths(id, detail);
	if (detail.plate?.src && detail.plate.src !== paths.plate) {
		throw new Error(`${id}/${detail.part} 的 plate.src 必须是 ${paths.plate}`);
	}
	const plateFile = absPublic(publicRoot, paths.plate);
	if (!existsSync(plateFile)) {
		const src = join(recordsRoot, 'records', id, detail.source);
		if (!existsSync(src)) throw new Error(`找不到 ${id}/${detail.source}`);
		await encodeWebp(src, plateFile);
	}
	const plateSize = readWebpSize(plateFile);
	if (detail.plate?.width && detail.plate?.height) {
		if (detail.plate.width !== plateSize.width || detail.plate.height !== plateSize.height) {
			throw new Error(
				`图片尺寸与文件不符 ${paths.plate}：JSON ${detail.plate.width}×${detail.plate.height}，文件 ${plateSize.width}×${plateSize.height}`,
			);
		}
	}
	detail.plate = { src: paths.plate, width: plateSize.width, height: plateSize.height };

	const uprightFile = absPublic(publicRoot, paths.upright);
	if (existsSync(uprightFile)) {
		const existing = readWebpSize(uprightFile);
		if (existing.width !== plateSize.width || existing.height !== plateSize.height) {
			throw new Error(
				`${id}/${detail.part} 已有与 plate 尺寸不同的 upright，但不能 reveal。请补 transform，脚本不会猜裁切。`,
			);
		}
	} else {
		await mkdir(dirname(uprightFile), { recursive: true });
		await copyFile(plateFile, uprightFile);
	}
	const uprightSize = readWebpSize(uprightFile);
	const crop = minimalRevealCrop(uprightSize.width, uprightSize.height, plateSize.width, plateSize.height);
	const angleDeg = typeof detail.transform?.angleDeg === 'number' ? detail.transform.angleDeg : 0;
	detail.upright = { src: paths.upright, width: uprightSize.width, height: uprightSize.height };
	detail.transform = {
		cropSpace: 'upright',
		angleDeg,
		crop,
		exportWidth: plateSize.width,
	};
	if (!isRevealDetail(detail)) {
		throw new Error(`${id}/${detail.part} 补了 crop 仍然不能 reveal`);
	}
	return true;
}

async function createCoverRecord({ id, record, recordsRoot, publicRoot }) {
	const image = record.images.find((item) => item.kind === 'cover-front');
	if (!image) throw new Error(`${id} 没有 cover-front，无法生成最小 reveal 版式`);
	const detail = {
		part: 'cover',
		source: image.file,
		alt: image.caption,
		plate: { src: `/records/${id}/cover.webp` },
		marks: [],
	};
	await repairDetail({ id, detail, recordsRoot, publicRoot });
	const heroSrc = `/records/${id}/hero.webp`;
	const heroFile = absPublic(publicRoot, heroSrc);
	if (!existsSync(heroFile)) {
		await mkdir(dirname(heroFile), { recursive: true });
		await copyFile(absPublic(publicRoot, detail.plate.src), heroFile);
	}
	const heroSize = readWebpSize(heroFile);
	return {
		id,
		image: { src: heroSrc, width: heroSize.width, height: heroSize.height },
		detailsNote: '尚无编号题铭。',
		details: [detail],
	};
}

async function ensureHero(layoutRecord, publicRoot) {
	const file = absPublic(publicRoot, layoutRecord.image.src);
	if (existsSync(file)) return false;
	const plate = layoutRecord.details[0]?.plate?.src;
	if (!plate || !existsSync(absPublic(publicRoot, plate))) {
		throw new Error(`${layoutRecord.id} 缺少 ${layoutRecord.image.src}`);
	}
	await mkdir(dirname(file), { recursive: true });
	await copyFile(absPublic(publicRoot, plate), file);
	const size = readWebpSize(file);
	layoutRecord.image = { src: layoutRecord.image.src, width: size.width, height: size.height };
	return true;
}

/**
 * @param {{ recordsRoot?: string, layoutPath?: string, publicRoot?: string }} [options]
 * @returns {Promise<{ changed: string[] }>}
 */
export async function ensureRevealAssets(options = {}) {
	const recordsRoot = options.recordsRoot ?? join(process.cwd(), 'records');
	const layoutPath = options.layoutPath ?? join(process.cwd(), 'src/data/records-layout.json');
	const publicRoot = options.publicRoot ?? join(process.cwd(), 'public');
	const index = JSON.parse(await readFile(join(recordsRoot, 'index.json'), 'utf8'));
	let text = await readFile(layoutPath, 'utf8');
	const changed = [];
	for (const entry of index.records) {
		const id = entry.id;
		const record = JSON.parse(await readFile(join(recordsRoot, 'records', id, 'record.json'), 'utf8'));
		let layout = JSON.parse(text);
		let layoutRecord = layout.find((item) => item.id === id);
		let recordChanged = false;
		if (!layoutRecord) {
			layoutRecord = await createCoverRecord({ id, record, recordsRoot, publicRoot });
			recordChanged = true;
		} else {
			if (await ensureHero(layoutRecord, publicRoot)) recordChanged = true;
			for (const detail of layoutRecord.details) {
				const plateOk = plateFileMatches(detail, publicRoot);
				if (isRevealDetail(detail) && plateOk && uprightFileMatches(detail, publicRoot)) continue;
				await repairDetail({ id, detail, recordsRoot, publicRoot });
				recordChanged = true;
			}
		}
		if (!recordChanged) continue;
		text = replaceLayoutRecord(text, layoutRecord);
		changed.push(id);
	}
	if (changed.length > 0) await writeFile(layoutPath, text.endsWith('\n') ? text : `${text}\n`);
	return { changed };
}
