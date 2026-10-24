import { z } from 'zod';
import forbiddenFields from './forbidden-fields.json' with { type: 'json' };

/**
 * Curator export, schemaVersion 1.
 * Forbidden keys are rejected anywhere in the JSON tree. `showsPrice` is a
 * photo flag and is not in this list.
 */
export const FORBIDDEN_FIELDS: readonly string[] = forbiddenFields;

const forbiddenLower = new Set(FORBIDDEN_FIELDS.map((field) => field.toLowerCase()));

const httpUrl = z.string().refine(
	(value) => {
		try {
			const url = new URL(value);
			return url.protocol === 'http:' || url.protocol === 'https:';
		} catch {
			return false;
		}
	},
	{ message: '链接须为 http(s) URL' },
);

const imageFile = /^(?:images|details)\/[a-z0-9][a-z0-9.-]*\.(?:jpe?g|png|webp)$/;

const imageSchema = z.strictObject({
	file: z.string().regex(imageFile, '图片路径须为 images/ 或 details/ 下的 jpg、png、webp'),
	kind: z.enum(['cover-front', 'cover-back', 'label', 'runout', 'obi', 'insert', 'detail']),
	caption: z.string().min(1),
	hasHandwriting: z.literal(true).optional(),
	showsPrice: z.literal(true).optional(),
	showsStoreSticker: z.literal(true).optional(),
	showsHomeEnvironment: z.literal(true).optional(),
});

const detailSchema = z.strictObject({
	file: z.string().regex(imageFile, '细节图路径须为 images/ 或 details/ 下的 jpg、png、webp'),
	caption: z.string().min(1),
	text: z.string().min(1),
});

const linkSchema = z.strictObject({
	title: z.string().min(1),
	href: httpUrl,
	site: z.string().min(1),
});

export const recordSchema = z
	.strictObject({
		id: z.string().regex(/^[a-z0-9]+$/),
		composer: z.string().min(1),
		work: z.string().min(1),
		performers: z.string().min(1),
		label: z.string().min(1),
		catalogNumber: z.string().min(1),
		category: z.string().min(1),
		pressing: z.string().min(1),
		matrix: z.string().min(1),
		recording: z.string().min(1),
		eq: z.string().min(1),
		condition: z.string().min(1),
		year: z.string().min(1).optional(),
		verificationStatus: z.enum(['verified', 'partial', 'pending']),
		statusLabel: z.string().min(1),
		notes: z.string().min(1),
		links: z.array(linkSchema),
		images: z.array(imageSchema).min(1),
		details: z.array(detailSchema),
	})
	.superRefine((record, ctx) => {
		if (!record.images.some((image) => image.kind === 'cover-front')) {
			ctx.addIssue({
				code: 'custom',
				message: '至少要有一张 kind 为 cover-front 的图片',
				path: ['images'],
			});
		}
		const expected = expectedVerification(record.statusLabel);
		if (record.verificationStatus !== expected) {
			ctx.addIssue({
				code: 'custom',
				message: `verificationStatus 应为 ${expected}（由 statusLabel「${record.statusLabel}」决定）`,
				path: ['verificationStatus'],
			});
		}
	});

export const indexSchema = z.strictObject({
	schemaVersion: z.literal(1),
	generatedAt: z.string().min(1),
	records: z
		.array(
			z.strictObject({
				id: z.string().regex(/^[a-z0-9]+$/),
				updatedAt: z.string().min(1),
				sha256: z.string().regex(/^[a-f0-9]{64}$/),
			}),
		)
		.min(1),
});

export const changelogSchema = z.array(
	z.strictObject({
		at: z.string().min(1),
		schemaVersion: z.literal(1),
		added: z.array(z.string()),
		changed: z.array(z.string()),
		removed: z.array(z.string()),
	}),
);

export type RecordFile = z.infer<typeof recordSchema>;
export type IndexFile = z.infer<typeof indexSchema>;

export type StatusBucket = 'verified' | 'partial' | 'review' | 'unchecked';

export type PlateImage = {
	src: string;
	fullSrc: string;
	width: number;
	height: number;
};

export type RecordMark = {
	id: string;
	badge: 'tl' | 'tr';
	side: 'auto' | 'left' | 'right';
	x: number;
	y: number;
	w: number;
	h: number;
	label?: string;
	note?: string;
};

export type RecordDetail = {
	part: string;
	plate: PlateImage;
	upright?: { src: string; width: number; height: number };
	transform?: {
		cropSpace: 'upright';
		angleDeg: number;
		crop: { x: number; y: number; w: number; h: number };
		exportWidth: number;
	};
	marks: RecordMark[];
	caption: string;
	alt: string;
	text: string;
};

export type GalleryPhoto = PlateImage & {
	caption: string;
	alt: string;
	kind: string;
};

export type VinylRecord = {
	id: string;
	performers: string;
	composer: string;
	work: string;
	label: string;
	catalogNumber: string;
	category: string;
	pressing: string;
	matrix: string;
	recording: string;
	condition: string;
	eq: string;
	decade: string;
	sortYear: number;
	year?: string;
	verificationStatus: 'verified' | 'partial' | 'pending';
	statusLabel: string;
	notes: string;
	story: string;
	links: { title: string; href: string; site: string }[];
	photo: string;
	image: PlateImage;
	thumb: { src: string; width: number; height: number };
	photos: GalleryPhoto[];
	details: RecordDetail[];
	legacy: boolean;
};

export function formatIssues(error: z.ZodError): string {
	return error.issues
		.map((issue) => {
			const path = issue.path.length > 0 ? issue.path.join('.') : '(根)';
			return `- ${path}: ${issue.message}`;
		})
		.join('\n');
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/** Walk every JSON key. Reject the deny-list and any schemaVersion other than 1. */
export function assertExportValue(value: unknown, file: string): void {
	const visit = (node: unknown, path: Array<string | number>) => {
		if (Array.isArray(node)) {
			node.forEach((item, index) => visit(item, [...path, index]));
			return;
		}
		if (!isPlainObject(node)) return;
		for (const [key, child] of Object.entries(node)) {
			const folded = key.toLowerCase();
			if (forbiddenLower.has(folded)) {
				const where = [...path, key].join('.');
				throw new Error(
					`禁止字段 ${key}（${file} ${where}）。证据台账、补拍清单、价格、购买来源和估值不能进入站点数据。`,
				);
			}
			if (folded === 'schemaversion' && child !== 1) {
				throw new Error(`未知的 schemaVersion：${String(child)}（${file}）。当前只接受 1。`);
			}
			visit(child, [...path, key]);
		}
	};
	visit(value, []);
}

function parseWith<T>(schema: z.ZodType<T>, data: unknown, file: string): T {
	assertExportValue(data, file);
	if (isPlainObject(data) && !('schemaVersion' in data) && file.endsWith('index.json')) {
		throw new Error(`未知的 schemaVersion：缺少 schemaVersion（${file}）。当前只接受 1。`);
	}
	const parsed = schema.safeParse(data);
	if (!parsed.success) {
		const versionIssue = parsed.error.issues.find(
			(issue) => issue.path[0] === 'schemaVersion' || issue.path.at(-1) === 'schemaVersion',
		);
		if (versionIssue) {
			throw new Error(`未知的 schemaVersion（${file}）：${versionIssue.message}。当前只接受 1。`);
		}
		throw new Error(`${file} 校验失败：\n${formatIssues(parsed.error)}`);
	}
	return parsed.data;
}

export function parseIndex(data: unknown, file = 'index.json'): IndexFile {
	return parseWith(indexSchema, data, file);
}

export function parseChangelog(data: unknown, file = 'changelog.json'): z.infer<typeof changelogSchema> {
	return parseWith(changelogSchema, data, file);
}

export function parseRecord(data: unknown, file = 'record.json'): RecordFile {
	return parseWith(recordSchema, data, file);
}

/** 大体已核 → partial；已核 → verified；其余 → pending. The label text is not rewritten. */
export function expectedVerification(statusLabel: string): 'verified' | 'partial' | 'pending' {
	if (statusLabel.startsWith('大体已核')) return 'partial';
	if (statusLabel.startsWith('已核')) return 'verified';
	return 'pending';
}

/**
 * verified and partial show pressing and matrix.
 * Legacy rows show them only when the old label starts with 已核
 * （大体已核 does not）.
 */
export function showPressingDetails(record: {
	legacy: boolean;
	statusLabel: string;
	verificationStatus: 'verified' | 'partial' | 'pending';
}): boolean {
	if (record.legacy) return record.statusLabel.startsWith('已核');
	return record.verificationStatus === 'verified' || record.verificationStatus === 'partial';
}

export function showPressing(record: VinylRecord): boolean {
	return showPressingDetails(record) && record.pressing.trim().length > 0;
}

export function showMatrix(record: VinylRecord): boolean {
	return showPressingDetails(record) && record.matrix.trim().length > 0;
}

/** Filter buckets. The badge still prints statusLabel unchanged. */
export function statusBucket(statusLabel: string): StatusBucket {
	if (statusLabel.startsWith('大体已核')) return 'partial';
	if (statusLabel.startsWith('已核')) return 'verified';
	if (statusLabel.startsWith('待核')) return 'unchecked';
	if (statusLabel.startsWith('待复核')) return 'review';
	return 'review';
}

export function badgeClass(statusLabel: string): string {
	const bucket = statusBucket(statusLabel);
	if (bucket === 'verified') return 'badge badge-verified';
	if (bucket === 'partial') return 'badge badge-partial';
	return 'badge badge-pending';
}

const YEAR_IN_TEXT = /(?:18|19|20)\d{2}/;

export function deriveSortYear(input: {
	id: string;
	year?: string;
	recording: string;
	pressing: string;
	story: string;
}): number {
	for (const text of [input.year ?? '', input.recording, input.pressing, input.story]) {
		const match = YEAR_IN_TEXT.exec(text);
		if (match) return Number(match[0]);
	}
	throw new Error(`无法得到排序年份：${input.id}`);
}

export function decadeLabel(year: number): string {
	return `${Math.floor(year / 10) * 10}s`;
}

/** Plain four-digit years stay in the catalog cell. Longer year notes use the decade. */
export function catalogWhen(record: { year?: string; decade: string }): string {
	if (record.year && /^\d{4}$/.test(record.year.trim())) return record.year.trim();
	return record.decade;
}

/** Drop a single leading Markdown H1. The tombstone already shows the title. */
export function storyBody(markdown: string): string {
	const text = markdown.replace(/^\uFEFF/, '').trim();
	return text.replace(/^#[ \t]+[^\n]*(?:\n+|$)/, '').trim();
}

export function paragraphs(text: string): string[] {
	return text
		.split(/\n\n+/)
		.map((paragraph) => paragraph.trim())
		.filter((paragraph) => paragraph.length > 0);
}

export type StoryParagraph = {
	lead: string | null;
	body: string;
};

const LATIN_OPENING = /^(?:[\s\u3000"'“”‘’„«»「」『』（()[\]【】]*)[A-Za-z\u00C0-\u024F]/u;

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

export function storyParagraphs(text: string): StoryParagraph[] {
	return paragraphs(text).map((paragraph, index) => {
		if (index > 0) return { lead: null, body: paragraph };
		const { lead, rest } = splitLeadSentence(paragraph);
		return { lead, body: rest };
	});
}

export function heroAlt(record: { catalogNumber: string; work: string; photo: string }): string {
	return `${record.catalogNumber}，${record.work}。${record.photo}`;
}

export function recordSearchText(record: VinylRecord): string {
	const parts = [
		record.work,
		record.composer,
		record.performers,
		record.label,
		record.catalogNumber,
		record.category,
		record.decade,
		record.year ?? '',
		record.statusLabel,
		record.recording,
		record.condition,
		record.eq,
		record.notes,
		record.story,
		record.photo,
		...record.photos.flatMap((photo) => [photo.caption, photo.alt]),
		...record.details.flatMap((detail) => [detail.caption, detail.text, detail.alt]),
		...record.links.map((link) => `${link.title} ${link.site}`),
	];
	if (showMatrix(record)) parts.push(record.matrix);
	if (showPressing(record)) parts.push(record.pressing);
	return parts.join(' ').toLocaleLowerCase('zh-CN');
}

export function uniqueValues(values: string[]): string[] {
	const unique = new Set<string>();
	for (const value of values) {
		if (value) unique.add(value);
	}
	return [...unique].sort((a, b) => a.localeCompare(b, 'zh-CN'));
}

export function sortRecords(list: readonly VinylRecord[]): VinylRecord[] {
	return list.slice().sort((a, b) => {
		const byTime = a.sortYear - b.sortYear;
		if (byTime !== 0) return byTime;
		if (a.id < b.id) return -1;
		if (a.id > b.id) return 1;
		return 0;
	});
}
