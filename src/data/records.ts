import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { attachMarkNotesFromText, detailMode, expectedPlateHeight } from './detail-display.ts';
import layoutJson from './records-layout.json' with { type: 'json' };
import { resolveRecordsExport } from './records-entities.ts';
import {
	assertExportValue,
	type ResolvedTrajectory,
	type SiteExportRecord,
} from './records-export.ts';

/**
 * Vinyl collection.
 *
 * Public text comes from the curator export (`records/`, plus `records-legacy/`
 * for the rows that are not in that export yet). Marks, crops and the upright
 * frames come from `records-layout.json`, the site-side layout layer: the
 * export carries the photos and the numbered notes, the layout layer says which
 * crop of an exported photo a page shows and where the numbers sit on it.
 *
 * Unknown keys are rejected on both files so price or valuation fields cannot
 * slip into the build, and forbidden keys fail the build anywhere in the tree
 * (see `records-export.ts`). Pressing and matrix stay in the export, and are
 * omitted from the public page until the status is 已核 or 大体已核.
 */

/** Legacy `{part}.webp` or face `{part}-d{disc}-s{side}.webp`. */
const plateSrc = /^\/records\/[a-z0-9]+\/[a-z0-9]+(?:-d[1-9]\d*-s[1-9]\d*)?\.webp$/;
const uprightSrc = /^\/records\/[a-z0-9]+\/[a-z0-9]+(?:-d[1-9]\d*-s[1-9]\d*)?-upright\.webp$/;

const plateImageSchema = z.strictObject({
	src: z.string().regex(plateSrc),
	width: z.number().int().positive(),
	height: z.number().int().positive(),
});

const uprightImageSchema = z.strictObject({
	src: z.string().regex(uprightSrc),
	width: z.number().int().positive(),
	height: z.number().int().positive(),
});

const cropSchema = z.strictObject({
	x: z.number().int().nonnegative(),
	y: z.number().int().nonnegative(),
	w: z.number().int().positive(),
	h: z.number().int().positive(),
});

const transformSchema = z.strictObject({
	cropSpace: z.literal('upright'),
	/** Degrees already baked into `upright`. Finite number. Never the string "auto". Playback ignores it. */
	angleDeg: z.number(),
	crop: cropSchema,
	exportWidth: z.number().int().positive(),
});

const markSchema = z.strictObject({
	id: z.string().regex(/^[a-z0-9-]+$/),
	/** Corner of the box the number sits on. Not the leader direction. */
	badge: z.enum(['tl', 'tr']),
	/** Leader direction. Independent of `badge`. */
	side: z.enum(['auto', 'left', 'right']),
	x: z.number().int().nonnegative(),
	y: z.number().int().nonnegative(),
	w: z.number().int().positive(),
	h: z.number().int().positive(),
	/** Short public heading. Omitted until an editor sets it. */
	label: z.string().min(1).optional(),
	/** Public sentence. Omitted until the editorial align. Never filled from YAML `note`. */
	note: z.string().min(1).optional(),
});

const layoutDetailSchema = z.strictObject({
	part: z.string().regex(/^[a-z0-9]+$/),
	/**
	 * Optional disc index (1-based), aligned with export filenames `…-dN-…`.
	 * No A/B letter fields — use numbers. Omitted on single-slot faces.
	 */
	disc: z.number().int().positive().optional(),
	/**
	 * Optional side index (1-based), aligned with export filenames `…-sN`.
	 * Independent of `marks[].side` (leader L/R/auto).
	 */
	side: z.number().int().positive().optional(),
	/** Which exported photo this crop comes from: a `file` in the record.json images or details. */
	source: z.string().regex(/^(?:images|details)\/[a-z0-9][a-z0-9.-]*\.(?:jpe?g|png|webp)$/),
	alt: z.string().min(1),
	plate: plateImageSchema,
	upright: uprightImageSchema.optional(),
	transform: transformSchema.optional(),
	marks: z.array(markSchema),
});

const layoutRecordSchema = z.strictObject({
	id: z.string().regex(/^[a-z0-9]+$/),
	image: plateImageSchema,
	detailsNote: z.string().min(1),
	details: z.array(layoutDetailSchema).min(1),
});


export type DetailFace = {
	disc: number;
	side: number;
};

/** Basename face from export/layout `source`, e.g. `label-d1-s2.webp` → { disc: 1, side: 2 }. */
export function parseFaceFromSource(source: string): DetailFace | undefined {
	const base = source.split('/').pop() ?? source;
	const match = /-d([1-9]\d*)-s([1-9]\d*)(?:[-.]|$)/.exec(base);
	if (!match) return undefined;
	return { disc: Number(match[1]), side: Number(match[2]) };
}

/**
 * Explicit `disc`+`side` win. Otherwise parse from `source` basename.
 * A lone explicit field does not merge with the parsed face — both must be set, or neither (then parse).
 */
export function resolveDetailFace(detail: {
	disc?: number;
	side?: number;
	source: string;
}): DetailFace | undefined {
	const hasDisc = detail.disc !== undefined;
	const hasSide = detail.side !== undefined;
	if (hasDisc || hasSide) {
		if (hasDisc && hasSide) return { disc: detail.disc!, side: detail.side! };
		return undefined;
	}
	return parseFaceFromSource(detail.source);
}

/** Short chrome label `d1-s2`. Empty string when no complete face. */
export function formatDetailFace(face: DetailFace | undefined): string {
	if (!face) return '';
	return `d${face.disc}-s${face.side}`;
}

/** Long chrome label `Disc 1 · side 2`. Empty string when no complete face. */
export function formatDetailFaceLong(face: DetailFace | undefined): string {
	if (!face) return '';
	return `Disc ${face.disc} · side ${face.side}`;
}

/**
 * Uniqueness key `(part, disc ?? 0, side ?? 0)` from **explicit** layout fields.
 * Parsing from `source` does not participate — existing single-slot rows stay unique on `part` alone.
 */
export function layoutDetailFaceKey(detail: { part: string; disc?: number; side?: number }): string {
	return `${detail.part}\0${detail.disc ?? 0}\0${detail.side ?? 0}`;
}

/**
 * Public plate path. Explicit disc+side → `{part}-d{disc}-s{side}.webp`; else legacy `{part}.webp`.
 * Parsed-from-source faces do not rename assets (curator migration is a follow-up).
 */
export function detailPlatePath(
	recordId: string,
	detail: { part: string; disc?: number; side?: number },
): string {
	if (detail.disc !== undefined && detail.side !== undefined) {
		return `/records/${recordId}/${detail.part}-d${detail.disc}-s${detail.side}.webp`;
	}
	return `/records/${recordId}/${detail.part}.webp`;
}

export function detailUprightPath(
	recordId: string,
	detail: { part: string; disc?: number; side?: number },
): string {
	if (detail.disc !== undefined && detail.side !== undefined) {
		return `/records/${recordId}/${detail.part}-d${detail.disc}-s${detail.side}-upright.webp`;
	}
	return `/records/${recordId}/${detail.part}-upright.webp`;
}

/** DOM / SVG id stem: `label` or `label-d1-s2` from explicit fields only (stable before asset rename). */
export function detailDomKey(detail: { part: string; disc?: number; side?: number }): string {
	if (detail.disc !== undefined && detail.side !== undefined) {
		return `${detail.part}-d${detail.disc}-s${detail.side}`;
	}
	return detail.part;
}

export const layoutFileSchema = z.array(layoutRecordSchema).superRefine((records, ctx) => {
	const seenIds = new Set<string>();
	records.forEach((record, index) => {
		if (seenIds.has(record.id)) {
			ctx.addIssue({ code: 'custom', message: `重复的 id：${record.id}`, path: [index, 'id'] });
		}
		seenIds.add(record.id);

		const heroPrefix = `/records/${record.id}/`;
		if (!record.image.src.startsWith(heroPrefix)) {
			ctx.addIssue({
				code: 'custom',
				message: `图片必须放在 ${heroPrefix}`,
				path: [index, 'image', 'src'],
			});
		}

		const seenFaces = new Set<string>();
		record.details.forEach((detail, detailIndex) => {
			const base = [index, 'details', detailIndex];
			const faceKey = layoutDetailFaceKey(detail);
			if (seenFaces.has(faceKey)) {
				const label =
					detail.disc !== undefined || detail.side !== undefined
						? `${detail.part} (disc=${detail.disc ?? 0}, side=${detail.side ?? 0})`
						: detail.part;
				ctx.addIssue({
					code: 'custom',
					message: `重复的 part/disc/side：${label}`,
					path: [...base, 'part'],
				});
			}
			seenFaces.add(faceKey);

			const platePath = detailPlatePath(record.id, detail);
			if (detail.plate.src !== platePath) {
				ctx.addIssue({
					code: 'custom',
					message: `plate.src 必须是 ${platePath}`,
					path: [...base, 'plate', 'src'],
				});
			}

			const hasUpright = detail.upright !== undefined;
			const hasTransform = detail.transform !== undefined;
			if (hasUpright !== hasTransform) {
				ctx.addIssue({
					code: 'custom',
					message: 'upright 与 transform 必须同时存在或同时省略',
					path: [...base, hasUpright ? 'upright' : 'transform'],
				});
			}

			if (detail.upright) {
				const uprightPath = detailUprightPath(record.id, detail);
				if (detail.upright.src !== uprightPath) {
					ctx.addIssue({
						code: 'custom',
						message: `upright.src 必须是 ${uprightPath}`,
						path: [...base, 'upright', 'src'],
					});
				}
			}

			if (detail.transform && detail.upright) {
				if (detail.transform.exportWidth !== detail.plate.width) {
					ctx.addIssue({
						code: 'custom',
						message: 'transform.exportWidth 必须等于 plate.width',
						path: [...base, 'transform', 'exportWidth'],
					});
				}
				const { crop } = detail.transform;
				if (crop.x + crop.w > detail.upright.width || crop.y + crop.h > detail.upright.height) {
					ctx.addIssue({
						code: 'custom',
						message: 'crop 必须落在 upright 像素内',
						path: [...base, 'transform', 'crop'],
					});
				}
				const expected = expectedPlateHeight(detail.transform.exportWidth, crop);
				if (Math.abs(detail.plate.height - expected) > 1) {
					ctx.addIssue({
						code: 'custom',
						message: `plate.height 与 crop 比例不符（期望约 ${expected}）`,
						path: [...base, 'plate', 'height'],
					});
				}
			}

			const seenMarks = new Set<string>();
			detail.marks.forEach((mark, markIndex) => {
				if (seenMarks.has(mark.id)) {
					ctx.addIssue({
						code: 'custom',
						message: `重复的 mark id：${mark.id}`,
						path: [...base, 'marks', markIndex, 'id'],
					});
				}
				seenMarks.add(mark.id);
				if (mark.x + mark.w > detail.plate.width || mark.y + mark.h > detail.plate.height) {
					ctx.addIssue({
						code: 'custom',
						message: 'mark 必须落在 plate 像素内',
						path: [...base, 'marks', markIndex],
					});
				}
			});
		});
	});
});

export type LayoutFile = z.infer<typeof layoutFileSchema>;
export type LayoutDetail = LayoutFile[number]['details'][number];

export type Detail = {
	part: string;
	/** Explicit layout disc, when set. Prefer `resolveDetailFace` for display. */
	disc?: number;
	/** Explicit layout side (1-based face), when set. Not `marks[].side`. */
	side?: number;
	/** The exported photo this crop comes from. */
	source: string;
	plate: { src: string; width: number; height: number };
	upright?: { src: string; width: number; height: number };
	transform?: {
		cropSpace: 'upright';
		angleDeg: number;
		crop: { x: number; y: number; w: number; h: number };
		exportWidth: number;
	};
	marks: z.infer<typeof markSchema>[];
	/** Caption and numbered notes come from the export detail, not the layout layer. */
	caption: string;
	alt: string;
	text: string;
};

export type VinylRecord = {
	id: string;
	artist: string;
	composer: string;
	work: string;
	label: string;
	catalogNumber: string;
	category: string;
	matrix: string | null;
	pressing: string | null;
	decade: string;
	/** Only when the export states one clear calendar year. Otherwise the page uses `decade`. */
	year?: number;
	recording: string;
	condition: string;
	eq: string;
	story: string;
	notes: string;
	links: { title: string; href: string; site: string }[];
	/** Original Chinese status label, for example 已核（死蜡未拍） or 待复核. */
	status: string;
	/** Hero caption: the export's cover-front caption. */
	photo: string;
	image: { src: string; width: number; height: number };
	detailsNote: string;
	details: Detail[];
	legacy: boolean;
	/** Present only when the export has a non-empty trajectory. */
	trajectory?: ResolvedTrajectory;
};

export type StatusBucket = 'verified' | 'partial' | 'review' | 'unchecked';

function assertPublicFile(src: string): void {
	const relative = src.replace(/^\//, '');
	if (relative.includes('..')) {
		throw new Error(`图片路径不合法：${src}`);
	}
	const file = join(process.cwd(), 'public', relative);
	if (!existsSync(file)) {
		throw new Error(`找不到图片 ${src}（public/${relative}）`);
	}
}

function readWebpSize(file: string): { width: number; height: number } {
	const buf = readFileSync(file);
	if (buf.length < 30 || buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WEBP') {
		throw new Error(`不是 WebP：${file}`);
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
			width: 1 + (buf[24]! | (buf[25]! << 8) | (buf[26]! << 16)),
			height: 1 + (buf[27]! | (buf[28]! << 8) | (buf[29]! << 16)),
		};
	}
	throw new Error(`无法读取 WebP 尺寸：${file}`);
}

function assertRaster(src: string, width: number, height: number): void {
	assertPublicFile(src);
	const relative = src.replace(/^\//, '');
	const file = join(process.cwd(), 'public', relative);
	const size = readWebpSize(file);
	if (size.width !== width || size.height !== height) {
		throw new Error(
			`图片尺寸与文件不符 ${src}：JSON ${width}×${height}，文件 ${size.width}×${size.height}`,
		);
	}
}

const LAYOUT_TRAJECTORY_KEYS = new Set([
	'trajectory',
	'places',
	'lon',
	'lat',
	'eventid',
	'personid',
	'personids',
	'workid',
	'workids',
	'liferole',
]);

/**
 * Layout JSON is crops and marks only. Trajectory coordinates live on the
 * export. Reject the keys even when nested, before the strict object schema
 * reports a generic unknown-key error.
 */
export function assertLayoutHasNoTrajectory(value: unknown, file = 'src/data/records-layout.json'): void {
	const visit = (node: unknown, path: Array<string | number>) => {
		if (Array.isArray(node)) {
			node.forEach((item, index) => visit(item, [...path, index]));
			return;
		}
		if (!node || typeof node !== 'object') return;
		for (const [key, child] of Object.entries(node as Record<string, unknown>)) {
			if (LAYOUT_TRAJECTORY_KEYS.has(key.toLowerCase())) {
				const where = [...path, key].join('.');
				throw new Error(
					`版式层不能包含轨迹字段 ${key}（${file} ${where}）。坐标和实体指针只写在导出里（record.json 的轨迹，或 records/people、works、events）。`,
				);
			}
			visit(child, [...path, key]);
		}
	};
	visit(value, []);
}

export function parseLayout(data: unknown): LayoutFile {
	assertExportValue(data, 'src/data/records-layout.json');
	assertLayoutHasNoTrajectory(data);
	const parsed = layoutFileSchema.safeParse(data);
	if (!parsed.success) {
		throw new Error(
			`src/data/records-layout.json 校验失败。未知字段和中文字段名也会导致失败：\n${parsed.error.issues
				.map((issue) => {
					const path = issue.path.length > 0 ? issue.path.join('.') : '(根)';
					return `- ${path}: ${issue.message}`;
				})
				.join('\n')}`,
		);
	}
	for (const layout of parsed.data) {
		assertRaster(layout.image.src, layout.image.width, layout.image.height);
		for (const detail of layout.details) {
			assertRaster(detail.plate.src, detail.plate.width, detail.plate.height);
			if (detail.upright) {
				assertRaster(detail.upright.src, detail.upright.width, detail.upright.height);
			}
		}
	}
	return parsed.data;
}

const YEAR_ONLY = /^\d{4}$/;
const YEAR_IN_TEXT = /(?:18|19|20)\d{2}/;

function exportYear(record: SiteExportRecord): number | undefined {
	const raw = record.year?.trim();
	if (raw && YEAR_ONLY.test(raw)) return Number(raw);
	return undefined;
}

function sortYear(record: SiteExportRecord): number {
	const candidates = [record.year ?? '', record.recording, record.pressing, record.story];
	for (const text of candidates) {
		const match = YEAR_IN_TEXT.exec(text);
		if (match) return Number(match[0]);
	}
	throw new Error(`无法从导出得到年份：${record.id}`);
}

function decadeLabel(year: number): string {
	return `${Math.floor(year / 10) * 10}s`;
}

function sourceFiles(record: SiteExportRecord): Set<string> {
	return new Set([
		...record.images.map((image) => image.file),
		...record.details.map((detail) => detail.file),
	]);
}

function toDetails(record: SiteExportRecord, layout: LayoutFile[number]): Detail[] {
	const files = sourceFiles(record);
	return layout.details.map((detail) => {
		if (!files.has(detail.source)) {
			throw new Error(
				`${record.id}/${detail.part} 的 source「${detail.source}」不在导出的 images/details 里。版式层只能裁导出的照片。`,
			);
		}
		const exported = record.details.find((item) => item.file === detail.source);
		const merged: Detail = {
			part: detail.part,
			...(detail.disc !== undefined ? { disc: detail.disc } : {}),
			...(detail.side !== undefined ? { side: detail.side } : {}),
			source: detail.source,
			plate: detail.plate,
			...(detail.upright ? { upright: detail.upright } : {}),
			...(detail.transform ? { transform: detail.transform } : {}),
			// Caption + numbered notes live in the export. Layout may omit mark.note
			// after scrub (#90); fill display notes from circled export lines at merge.
			marks: attachMarkNotesFromText(detail.marks, exported?.text ?? record.notes),
			caption: exported?.caption ?? coverCaption(record),
			alt: detail.alt,
			text: exported?.text ?? record.notes,
		};
		if (detailMode(merged) !== 'reveal') {
			throw new Error(
				`${record.id}/${detail.part} 必须走 reveal 分镜：需要 upright，且 crop 在 upright 里至少内缩 2px。题铭可以为空。运行 node scripts/ship-records.mjs 可补最小版式。`,
			);
		}
		return merged;
	});
}

function coverCaption(record: SiteExportRecord): string {
	return record.images.find((image) => image.kind === 'cover-front')?.caption ?? record.work;
}

export function mergeRecords(exported: readonly SiteExportRecord[], layout: LayoutFile): VinylRecord[] {
	const byId = new Map(layout.map((entry) => [entry.id, entry]));
	const seen = new Set<string>();
	const merged = exported.map((record) => {
		const entry = byId.get(record.id);
		if (!entry) {
			throw new Error(
				`${record.id} 在导出里，但 src/data/records-layout.json 没有对应的版式。补一段版式，或把该条移出导出。`,
			);
		}
		seen.add(record.id);
		const year = exportYear(record);
		const decade = decadeLabel(sortYear(record));
		return {
			id: record.id,
			artist: record.performers,
			composer: record.composer,
			work: record.work,
			label: record.label,
			catalogNumber: record.catalogNumber,
			category: record.category,
			matrix: record.matrix,
			pressing: record.pressing,
			decade,
			...(year === undefined ? {} : { year }),
			recording: record.recording,
			condition: record.condition,
			eq: record.eq,
			story: record.story,
			notes: record.notes,
			links: record.links,
			status: record.statusLabel,
			photo: coverCaption(record),
			image: entry.image,
			detailsNote: entry.detailsNote,
			details: toDetails(record, entry),
			legacy: record.legacy,
			...(record.trajectory ? { trajectory: record.trajectory } : {}),
		} satisfies VinylRecord;
	});
	for (const entry of layout) {
		if (!seen.has(entry.id)) {
			throw new Error(
				`src/data/records-layout.json 的 ${entry.id} 在馆员导出里不存在。导出去掉某条时，也要删掉它的版式和 public/records/${entry.id}/。`,
			);
		}
	}
	return merged;
}

/**
 * 已核 → verified. 大体已核, 待复核, and 待核 stay unfinished.
 * 大体已核 is its own bucket so the public label is not flattened into 待复核.
 */
export function statusBucket(status: string): StatusBucket {
	if (status.startsWith('大体已核')) return 'partial';
	if (status.startsWith('已核')) return 'verified';
	if (status.startsWith('待复核')) return 'review';
	if (status.startsWith('待核')) return 'unchecked';
	throw new Error(`无法归类的状态：${status}`);
}

/** Binary flag used by filters that only distinguish finished and unfinished. */
export function verificationStatus(record: VinylRecord): 'verified' | 'pending' {
	return statusBucket(record.status) === 'verified' ? 'verified' : 'pending';
}

/**
 * 内圈刻字 and 压片 are public once the copy is 已核 or 大体已核.
 * Legacy rows show them only when the old label starts with 已核
 * (大体已核 does not count).
 */
export function showPressingDetails(record: VinylRecord): boolean {
	if (record.legacy) return record.status.startsWith('已核');
	const bucket = statusBucket(record.status);
	return bucket === 'verified' || bucket === 'partial';
}

export function showPressing(record: VinylRecord): boolean {
	return showPressingDetails(record) && record.pressing !== null;
}

export function showMatrix(record: VinylRecord): boolean {
	return showPressingDetails(record) && record.matrix !== null;
}

export function badgeClass(status: string): string {
	const bucket = statusBucket(status);
	if (bucket === 'verified') return 'badge badge-verified';
	if (bucket === 'partial') return 'badge badge-partial';
	return 'badge badge-pending';
}

export function paragraphs(text: string): string[] {
	return text
		.split(/\n\n+/)
		.map((paragraph) => paragraph.trim())
		.filter((paragraph) => paragraph.length > 0);
}

export type StoryParagraph = {
	/** Opening sentence of the first paragraph, including its stop. Null after that. */
	lead: string | null;
	/** The rest of the paragraph. Empty when the lead is the whole paragraph. */
	body: string;
};

const LATIN_OPENING =
	/^(?:[\s\u3000"'“”‘’„«»「」『』（()[\]【】]*)[A-Za-z\u00C0-\u024F]/u;

/** Index of the first sentence stop, or -1 when the paragraph has none. */
function leadStopIndex(text: string): number {
	if (LATIN_OPENING.test(text)) {
		for (let index = 0; index < text.length; index++) {
			if (text[index] !== '.') continue;
			const previous = text[index - 1] ?? '';
			const next = text[index + 1];
			if (/\d/.test(previous) && next !== undefined && /\d/.test(next)) continue;
			if (next === undefined || /\s/u.test(next)) return index;
		}
		return text.indexOf('。');
	}
	return text.indexOf('。');
}

/**
 * First sentence of a paragraph: through the first `。`, or through the first
 * sentence-ending `.` when the paragraph opens in Latin. No stop → the whole
 * paragraph. Leading and trailing whitespace is dropped; the remainder is kept.
 */
export function splitLeadSentence(paragraph: string): { lead: string; rest: string } {
	const text = paragraph.trim();
	if (!text) return { lead: '', rest: '' };
	const index = leadStopIndex(text);
	if (index === -1) return { lead: text, rest: '' };
	const rest = text.slice(index + 1);
	return {
		lead: text.slice(0, index + 1),
		rest: rest.trim() === '' ? '' : rest,
	};
}

/** Paragraphs for 记述. Only the first paragraph carries a lead sentence. */
export function storyParagraphs(text: string): StoryParagraph[] {
	return paragraphs(text).map((paragraph, index) => {
		if (index > 0) return { lead: null, body: paragraph };
		const { lead, rest } = splitLeadSentence(paragraph);
		return { lead, body: rest };
	});
}

export function heroAlt(record: VinylRecord): string {
	return `${record.catalogNumber}，${record.work}。${record.photo}`;
}

export function recordSearchText(record: VinylRecord): string {
	const parts = [
		record.work,
		record.composer,
		record.artist,
		record.label,
		record.catalogNumber,
		record.category,
		record.decade,
		record.year?.toString() ?? '',
		record.status,
		record.recording,
		record.condition,
		record.eq,
		record.story,
		record.notes,
		record.photo,
		record.detailsNote,
		...record.details.flatMap((detail) => [
			detail.caption,
			detail.text,
			detail.alt,
			...detail.marks.flatMap((mark) =>
				[mark.label, mark.note].filter((value): value is string => Boolean(value)),
			),
		]),
		...record.links.map((link) => `${link.title} ${link.site}`),
	];
	if (record.trajectory) {
		parts.push(record.trajectory.titleZh ?? '时空轨迹');
		for (const place of record.trajectory.places) {
			parts.push(place.cityZh, place.city, place.yearLabel ?? String(place.year), place.blurb ?? '');
		}
	}
	if (showMatrix(record) && record.matrix) parts.push(record.matrix);
	if (showPressing(record) && record.pressing) parts.push(record.pressing);
	return parts.join(' ').toLocaleLowerCase('zh-CN');
}

export function uniqueValues(values: string[]): string[] {
	const unique = new Set<string>();
	for (const value of values) {
		if (value) unique.add(value);
	}
	return [...unique].sort((a, b) => a.localeCompare(b, 'zh-CN'));
}

const decadeSort = /^((?:18|19|20)\d{2})s$/;

export function catalogTime(record: VinylRecord): number {
	if (record.year !== undefined) return record.year;
	const match = decadeSort.exec(record.decade);
	if (!match) {
		throw new Error(`decade 无法作为排序年份：${record.id} ${record.decade}`);
	}
	return Number(match[1]);
}

export function sortRecords(list: readonly VinylRecord[]): VinylRecord[] {
	return list.slice().sort((a, b) => {
		const byTime = catalogTime(a) - catalogTime(b);
		if (byTime !== 0) return byTime;
		if (a.id < b.id) return -1;
		if (a.id > b.id) return 1;
		return 0;
	});
}

export const records = sortRecords(mergeRecords(resolveRecordsExport(), parseLayout(layoutJson)));
