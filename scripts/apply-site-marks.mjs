/**
 * Apply a curator site-marks draft (plate / upright / marks) into
 * records-layout.json and public/records/<id>/. Does not invent marks.
 *
 * Usage:
 *   node scripts/apply-site-marks.mjs --id <id> --draft <draft.json> --plates <dir>
 *     [--details-note "..."] [--records-root records] [--layout src/data/records-layout.json]
 *     [--public public] [--state <image-check-state.json>]
 */
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { existsSync } from 'node:fs';
import {
	isRevealDetail,
	readWebpSize,
	replaceLayoutRecord,
} from './reveal-layout.mjs';

function fail(message) {
	console.error(message);
	process.exit(1);
}

function absPublic(publicRoot, src) {
	if (!src.startsWith('/') || src.includes('..')) throw new Error(`图片路径不合法：${src}`);
	return join(publicRoot, src.slice(1));
}

function assertMark(mark, where) {
	for (const key of ['id', 'x', 'y', 'w', 'h']) {
		if (mark[key] === undefined || mark[key] === null) {
			throw new Error(`${where} marks 缺 ${key}`);
		}
	}
	if (typeof mark.w !== 'number' || typeof mark.h !== 'number' || mark.w < 1 || mark.h < 1) {
		throw new Error(`${where} marks 尺寸不合法`);
	}
}

function sourceForDetail(record, detail) {
	const details = record.details ?? [];
	if (detail.part === 'cover') {
		const hit =
			details.find((d) => typeof d.file === 'string' && d.file.includes('cover-front')) ??
			details.find(
				(d) =>
					typeof d.file === 'string' &&
					d.file.includes('cover') &&
					!d.file.includes('cover-back') &&
					!/(^|\/)back\./.test(d.file),
			);
		if (hit) return { source: hit.file, alt: hit.caption || hit.file };
	}
	if (detail.part === 'back') {
		const hit =
			details.find((d) => typeof d.file === 'string' && d.file.includes('cover-back')) ??
			details.find((d) => typeof d.file === 'string' && /(^|\/)back\./.test(d.file)) ??
			details.find((d) => typeof d.file === 'string' && d.file.includes('back'));
		if (hit) return { source: hit.file, alt: hit.caption || hit.file };
	}
	if (detail.disc != null && detail.side != null) {
		const needle = `-d${detail.disc}-s${detail.side}`;
		const hit = details.find((d) => typeof d.file === 'string' && d.file.includes(needle));
		if (hit) return { source: hit.file, alt: hit.caption || hit.file };
	}
	const images = record.images ?? [];
	if (detail.part === 'cover') {
		const cover = images.find((i) => i.kind === 'cover-front');
		if (cover) return { source: cover.file, alt: cover.caption || cover.file };
	}
	if (detail.part === 'back') {
		const back = images.find((i) => i.kind === 'cover-back');
		if (back) return { source: back.file, alt: back.caption || back.file };
	}
	if (detail.part === 'label') {
		const label = images.find((i) => i.kind === 'label');
		if (label) return { source: label.file, alt: label.caption || label.file };
	}
	throw new Error(
		`${record.id}/${detail.part} 无法在导出 details/images 里匹配 source（disc=${detail.disc ?? '-'} side=${detail.side ?? '-'}）`,
	);
}

function defaultDetailsNote(record) {
	const caps = (record.details ?? []).map((d) => d.caption).filter(Boolean);
	if (caps.length) return caps.join('；');
	return '编号框见 details 文案。';
}

/**
 * @param {{
 *   id: string,
 *   draftPath: string,
 *   platesDir: string,
 *   recordsRoot?: string,
 *   layoutPath?: string,
 *   publicRoot?: string,
 *   detailsNote?: string,
 *   statePath?: string,
 * }} options
 */
export async function applySiteMarks(options) {
	const id = options.id;
	const recordsRoot = options.recordsRoot ?? join(process.cwd(), 'records');
	const layoutPath = options.layoutPath ?? join(process.cwd(), 'src/data/records-layout.json');
	const publicRoot = options.publicRoot ?? join(process.cwd(), 'public');
	const draft = JSON.parse(await readFile(options.draftPath, 'utf8'));
	const detailsIn = draft.details;
	if (!Array.isArray(detailsIn) || detailsIn.length === 0) {
		throw new Error(`${options.draftPath} 没有 details[]`);
	}

	if (options.statePath) {
		const state = JSON.parse(await readFile(options.statePath, 'utf8'));
		if (state.id && state.id !== id) {
			throw new Error(`image-check-state id=${state.id} 与请求 id=${id} 不一致`);
		}
		if (state.stage !== 'ready' && !state.marks_waived) {
			throw new Error(`image-check-state stage=${state.stage ?? '?'}，需要 ready（或 waived）`);
		}
	}

	const record = JSON.parse(await readFile(join(recordsRoot, 'records', id, 'record.json'), 'utf8'));
	const layoutDetails = [];

	for (const raw of detailsIn) {
		if (raw.record_id && raw.record_id !== id) {
			throw new Error(`draft detail record_id=${raw.record_id} 与 id=${id} 不一致`);
		}
		const marks = raw.marks;
		if (!Array.isArray(marks) || marks.length === 0) {
			throw new Error(`${id}/${raw.part} draft marks 为空；要用最小 reveal 请在 ship-request 标 marks=none`);
		}
		marks.forEach((m, i) => assertMark(m, `${id}/${raw.part}[${i}]`));

		const plateName = basename(raw.plate.src);
		const uprightName = basename(raw.upright.src);
		const plateSrcFile = join(options.platesDir, plateName);
		const uprightSrcFile = join(options.platesDir, uprightName);
		if (!existsSync(plateSrcFile)) throw new Error(`缺少 plate 文件：${plateSrcFile}`);
		if (!existsSync(uprightSrcFile)) throw new Error(`缺少 upright 文件：${uprightSrcFile}`);

		const plateDest = absPublic(publicRoot, raw.plate.src);
		const uprightDest = absPublic(publicRoot, raw.upright.src);
		await mkdir(dirname(plateDest), { recursive: true });
		await copyFile(plateSrcFile, plateDest);
		await copyFile(uprightSrcFile, uprightDest);

		const plateSize = readWebpSize(plateDest);
		const uprightSize = readWebpSize(uprightDest);
		if (plateSize.width !== raw.plate.width || plateSize.height !== raw.plate.height) {
			throw new Error(
				`plate 尺寸不符 ${raw.plate.src}：JSON ${raw.plate.width}×${raw.plate.height}，文件 ${plateSize.width}×${plateSize.height}`,
			);
		}
		if (uprightSize.width !== raw.upright.width || uprightSize.height !== raw.upright.height) {
			throw new Error(
				`upright 尺寸不符 ${raw.upright.src}：JSON ${raw.upright.width}×${raw.upright.height}，文件 ${uprightSize.width}×${uprightSize.height}`,
			);
		}

		const { source, alt } = sourceForDetail(record, raw);
		const detail = {
			part: raw.part,
			...(raw.disc != null ? { disc: raw.disc } : {}),
			...(raw.side != null ? { side: raw.side } : {}),
			source,
			alt,
			plate: { ...raw.plate },
			upright: { ...raw.upright },
			transform: {
				...raw.transform,
				angleDeg: Number(raw.transform.angleDeg) || 0,
			},
			marks: marks.map((m) => ({ ...m })),
		};
		if (!isRevealDetail(detail)) {
			throw new Error(`${id}/${raw.part} 应用后仍不能 reveal（检查 crop / exportWidth / 比例）`);
		}
		layoutDetails.push(detail);
	}

	const coverPlate = layoutDetails.find((d) => d.part === 'cover')?.plate ?? layoutDetails[0].plate;
	const heroSrc = `/records/${id}/hero.webp`;
	const heroFile = absPublic(publicRoot, heroSrc);
	await mkdir(dirname(heroFile), { recursive: true });
	await copyFile(absPublic(publicRoot, coverPlate.src), heroFile);
	const heroSize = readWebpSize(heroFile);

	const layoutRecord = {
		id,
		image: { src: heroSrc, width: heroSize.width, height: heroSize.height },
		detailsNote: options.detailsNote?.trim() || defaultDetailsNote(record),
		details: layoutDetails,
	};

	let raw = await readFile(layoutPath, 'utf8');
	raw = replaceLayoutRecord(raw, layoutRecord);
	await writeFile(layoutPath, raw.endsWith('\n') ? raw : `${raw}\n`);
	return { id, details: layoutDetails.length, note: layoutRecord.detailsNote };
}

function parseArgs(argv) {
	const out = {};
	for (let i = 0; i < argv.length; i += 1) {
		const a = argv[i];
		if (a === '--id') out.id = argv[++i];
		else if (a === '--draft') out.draft = argv[++i];
		else if (a === '--plates') out.plates = argv[++i];
		else if (a === '--details-note') out.detailsNote = argv[++i];
		else if (a === '--records-root') out.recordsRoot = argv[++i];
		else if (a === '--layout') out.layout = argv[++i];
		else if (a === '--public') out.publicRoot = argv[++i];
		else if (a === '--state') out.state = argv[++i];
	}
	return out;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
	const args = parseArgs(process.argv.slice(2));
	if (!args.id || !args.draft || !args.plates) {
		fail(
			'用法: node scripts/apply-site-marks.mjs --id <id> --draft <draft.json> --plates <dir> [--details-note "..."] [--state <state.json>]',
		);
	}
	const result = await applySiteMarks({
		id: args.id,
		draftPath: resolve(args.draft),
		platesDir: resolve(args.plates),
		recordsRoot: args.recordsRoot ? resolve(args.recordsRoot) : undefined,
		layoutPath: args.layout ? resolve(args.layout) : undefined,
		publicRoot: args.publicRoot ? resolve(args.publicRoot) : undefined,
		detailsNote: args.detailsNote,
		statePath: args.state ? resolve(args.state) : undefined,
	});
	console.log(`applied marks for ${result.id}: ${result.details} details; note=${result.note}`);
}
