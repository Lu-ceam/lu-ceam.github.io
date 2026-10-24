import { copyFile, mkdir, readdir, readFile, rm, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import sharp from 'sharp';
import { readImageSize } from './image-size.ts';
import {
	decadeLabel,
	deriveSortYear,
	parseChangelog,
	parseIndex,
	parseRecord,
	sortRecords,
	storyBody,
	type GalleryPhoto,
	type PlateImage,
	type RecordDetail,
	type RecordFile,
	type VinylRecord,
} from './records-schema.ts';

const VIEW_MAX = 1200;
const THUMB_MAX = 384;
const THUMB_SOURCE_MAX = 480;

export type LoadOptions = {
	exportRoot?: string;
	legacyRoot?: string;
	publish?: boolean;
	mediaRoot?: string;
};

type LoadedSide = {
	root: string;
	legacy: boolean;
};

function publicUrl(file: string): string {
	const rel = relative(join(process.cwd(), 'public'), file).split(sep).join('/');
	return `/${rel}`;
}

function resolveInside(root: string, rel: string): string {
	if (rel.includes('\0') || rel.startsWith('/') || rel.includes('\\')) {
		throw new Error(`图片路径不合法：${rel}`);
	}
	const rootAbs = resolve(root);
	const abs = resolve(root, rel);
	if (abs !== rootAbs && !abs.startsWith(rootAbs + sep)) {
		throw new Error(`图片路径越界：${rel}`);
	}
	return abs;
}

async function readJson(file: string): Promise<unknown> {
	let text: string;
	try {
		text = await readFile(file, 'utf8');
	} catch {
		throw new Error(`找不到 ${file}`);
	}
	try {
		return JSON.parse(text) as unknown;
	} catch {
		throw new Error(`无法解析 JSON：${file}`);
	}
}

async function listRecordDirs(root: string): Promise<string[]> {
	const recordsDir = join(root, 'records');
	if (!existsSync(recordsDir)) {
		throw new Error(`找不到记录目录 ${recordsDir}`);
	}
	const names = await readdir(recordsDir);
	const ids: string[] = [];
	for (const name of names) {
		const abs = join(recordsDir, name);
		if ((await stat(abs)).isDirectory()) ids.push(name);
	}
	return ids.sort();
}

type Published = PlateImage;

async function publishOriginal(source: string, dest: string): Promise<void> {
	await mkdir(dirname(dest), { recursive: true });
	await copyFile(source, dest);
}

async function publishScaled(source: string, dest: string, maxEdge: number): Promise<PlateImage> {
	await mkdir(dirname(dest), { recursive: true });
	await sharp(source, { failOn: 'none' })
		.rotate()
		.resize({ width: maxEdge, height: maxEdge, fit: 'inside', withoutEnlargement: true })
		.webp({ quality: 76 })
		.toFile(dest);
	const size = readImageSize(dest);
	const src = publicUrl(dest);
	return { src, fullSrc: src, width: size.width, height: size.height };
}

async function publishImage(
	source: string,
	id: string,
	rel: string,
	mediaRoot: string,
	publish: boolean,
): Promise<Published> {
	const size = readImageSize(source);
	if (!publish) {
		return {
			src: `/records-media/${id}/full/${rel}`,
			fullSrc: `/records-media/${id}/full/${rel}`,
			width: size.width,
			height: size.height,
		};
	}
	const fullAbs = join(mediaRoot, id, 'full', rel);
	await publishOriginal(source, fullAbs);
	const fullSrc = publicUrl(fullAbs);
	const maxEdge = Math.max(size.width, size.height);
	if (maxEdge <= VIEW_MAX) {
		return { src: fullSrc, fullSrc, width: size.width, height: size.height };
	}
	const viewAbs = join(mediaRoot, id, 'view', `${rel}.webp`);
	const view = await publishScaled(source, viewAbs, VIEW_MAX);
	return { src: view.src, fullSrc, width: view.width, height: view.height };
}

async function publishThumb(
	source: string,
	hero: PlateImage,
	id: string,
	mediaRoot: string,
	publish: boolean,
): Promise<{ src: string; width: number; height: number }> {
	const size = readImageSize(source);
	if (Math.max(size.width, size.height) <= THUMB_SOURCE_MAX) {
		return { src: hero.src, width: hero.width, height: hero.height };
	}
	if (!publish) {
		return { src: `/records-media/${id}/thumb.webp`, width: THUMB_MAX, height: THUMB_MAX };
	}
	const thumbAbs = join(mediaRoot, id, 'thumb.webp');
	const thumb = await publishScaled(source, thumbAbs, THUMB_MAX);
	return { src: thumb.src, width: thumb.width, height: thumb.height };
}

function partFromFile(file: string): string {
	return basename(file).replace(/\.[^.]+$/, '');
}

function toRecord(
	file: RecordFile,
	story: string,
	images: Map<string, PlateImage>,
	thumb: { src: string; width: number; height: number },
	legacy: boolean,
): VinylRecord {
	const cover = file.images.find((image) => image.kind === 'cover-front');
	if (!cover) throw new Error(`${file.id} 缺少 cover-front`);
	const hero = images.get(cover.file);
	if (!hero) throw new Error(`${file.id} 缺少封面图 ${cover.file}`);
	const photos: GalleryPhoto[] = [];
	for (const image of file.images) {
		if (image.kind === 'runout' || image.kind === 'detail') continue;
		if (image.file === cover.file) continue;
		const plate = images.get(image.file);
		if (!plate) throw new Error(`${file.id} 缺少图片 ${image.file}`);
		photos.push({ ...plate, caption: image.caption, alt: image.caption, kind: image.kind });
	}
	const details: RecordDetail[] = file.details.map((detail) => {
		const plate = images.get(detail.file);
		if (!plate) throw new Error(`${file.id} 缺少细节图 ${detail.file}`);
		return {
			part: partFromFile(detail.file),
			plate,
			marks: [],
			caption: detail.caption,
			alt: detail.caption,
			text: detail.text,
		};
	});
	const sortYear = deriveSortYear({
		id: file.id,
		year: file.year,
		recording: file.recording,
		pressing: file.pressing,
		story,
	});
	return {
		id: file.id,
		performers: file.performers,
		composer: file.composer,
		work: file.work,
		label: file.label,
		catalogNumber: file.catalogNumber,
		category: file.category,
		pressing: file.pressing,
		matrix: file.matrix,
		recording: file.recording,
		condition: file.condition,
		eq: file.eq,
		decade: decadeLabel(sortYear),
		sortYear,
		year: file.year,
		verificationStatus: file.verificationStatus,
		statusLabel: file.statusLabel,
		notes: file.notes,
		story,
		links: file.links,
		photo: cover.caption,
		image: hero,
		thumb,
		photos,
		details,
		legacy,
	};
}

async function loadSide(side: LoadedSide, mediaRoot: string, publish: boolean): Promise<VinylRecord[]> {
	const index = parseIndex(await readJson(join(side.root, 'index.json')), join(side.root, 'index.json'));
	const changelogFile = join(side.root, 'changelog.json');
	if (existsSync(changelogFile)) {
		parseChangelog(await readJson(changelogFile), changelogFile);
	}
	const onDisk = await listRecordDirs(side.root);
	const indexed = index.records.map((entry) => entry.id);
	const indexedSet = new Set(indexed);
	const diskSet = new Set(onDisk);
	for (const id of indexed) {
		if (!diskSet.has(id)) throw new Error(`${side.root} 的 index.json 列出了不存在的记录 ${id}`);
	}
	for (const id of onDisk) {
		if (!indexedSet.has(id)) throw new Error(`${side.root} 的记录 ${id} 不在 index.json 里`);
	}
	const seen = new Set<string>();
	const records: VinylRecord[] = [];
	for (const entry of index.records) {
		if (seen.has(entry.id)) throw new Error(`重复的 id：${entry.id}`);
		seen.add(entry.id);
		const dir = join(side.root, 'records', entry.id);
		const recordFile = join(dir, 'record.json');
		const record = parseRecord(await readJson(recordFile), recordFile);
		if (record.id !== entry.id) {
			throw new Error(`${recordFile} 的 id「${record.id}」与目录名 ${entry.id} 不一致`);
		}
		const storyFile = join(dir, 'story.md');
		if (!existsSync(storyFile)) throw new Error(`找不到 ${storyFile}`);
		const story = storyBody(await readFile(storyFile, 'utf8'));
		if (!story) throw new Error(`${storyFile} 去掉标题后没有正文`);
		const needed = new Set<string>();
		for (const image of record.images) needed.add(image.file);
		for (const detail of record.details) needed.add(detail.file);
		const resolved = new Map<string, string>();
		for (const rel of needed) {
			const abs = resolveInside(dir, rel);
			if (!existsSync(abs)) throw new Error(`找不到图片 ${entry.id}/${rel}（${abs}）`);
			resolved.set(rel, abs);
		}
		const published = new Map<string, PlateImage>();
		for (const image of record.images) {
			if (image.kind === 'runout') continue;
			const abs = resolved.get(image.file);
			if (!abs) continue;
			published.set(image.file, await publishImage(abs, entry.id, image.file, mediaRoot, publish));
		}
		for (const detail of record.details) {
			if (published.has(detail.file)) continue;
			const abs = resolved.get(detail.file);
			if (!abs) continue;
			published.set(detail.file, await publishImage(abs, entry.id, detail.file, mediaRoot, publish));
		}
		const cover = record.images.find((image) => image.kind === 'cover-front');
		if (!cover) throw new Error(`${entry.id} 缺少 cover-front`);
		const hero = published.get(cover.file);
		if (!hero) throw new Error(`${entry.id} 的封面没有发布`);
		const coverAbs = resolved.get(cover.file);
		if (!coverAbs) throw new Error(`${entry.id} 缺少封面文件`);
		const thumb = await publishThumb(coverAbs, hero, entry.id, mediaRoot, publish);
		records.push(toRecord(record, story, published, thumb, side.legacy));
	}
	return records;
}

export async function loadRecords(options: LoadOptions = {}): Promise<VinylRecord[]> {
	const exportRoot = options.exportRoot ?? join(process.cwd(), 'records');
	const legacyRoot = options.legacyRoot === undefined ? join(process.cwd(), 'records-legacy') : options.legacyRoot;
	const publish = options.publish ?? true;
	const mediaRoot = options.mediaRoot ?? join(process.cwd(), 'public', 'records-media');
	if (publish) {
		await rm(mediaRoot, { recursive: true, force: true });
		await mkdir(mediaRoot, { recursive: true });
	}
	const sides: LoadedSide[] = [{ root: exportRoot, legacy: false }];
	if (legacyRoot && existsSync(join(legacyRoot, 'index.json'))) {
		sides.push({ root: legacyRoot, legacy: true });
	}
	const merged: VinylRecord[] = [];
	const seen = new Set<string>();
	for (const side of sides) {
		const records = await loadSide(side, mediaRoot, publish);
		for (const record of records) {
			if (seen.has(record.id)) {
				throw new Error(`id ${record.id} 同时出现在馆员导出和遗留目录里`);
			}
			seen.add(record.id);
			merged.push(record);
		}
	}
	return sortRecords(merged);
}
