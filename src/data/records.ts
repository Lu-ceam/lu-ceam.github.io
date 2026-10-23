import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import recordsJson from './records.json' with { type: 'json' };

/**
 * Vinyl collection. Unknown keys are rejected so price or valuation fields
 * cannot slip into the build. Currency amounts in the prose are rejected too.
 * Pressing and matrix stay in the file, and are omitted from the public page
 * until the status is 已核 or 大体已核.
 */

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

const imageSchema = z.strictObject({
	src: z.string().regex(/^\/records\/[a-z0-9]+\/[a-z0-9]+\.webp$/),
	width: z.number().int().positive(),
	height: z.number().int().positive(),
});

const linkSchema = z.strictObject({
	title: z.string().min(1),
	href: httpUrl,
	site: z.string().min(1),
});

const detailSchema = z.strictObject({
	image: imageSchema,
	alt: z.string().min(1),
	caption: z.string().min(1),
	text: z.string().min(1),
});

export const recordSchema = z.strictObject({
	id: z.string().regex(/^[a-z0-9]+$/),
	artist: z.string().min(1),
	composer: z.string().min(1),
	work: z.string().min(1),
	label: z.string().min(1),
	catalogNumber: z.string().min(1),
	matrix: z.string().min(1).nullable(),
	pressing: z.string().min(1).nullable(),
	decade: z.string().min(1),
	/** Only when the disc has one clear calendar year. Otherwise the page uses `decade`. */
	year: z.number().int().gte(1800).lte(2100).optional(),
	recording: z.string().min(1),
	condition: z.string().min(1),
	eq: z.string().min(1),
	story: z.string().min(1),
	links: z.array(linkSchema),
	/** Original Chinese status label, for example 已核（死蜡未拍） or 待复核. */
	status: z.string().regex(/^(?:已核|大体已核|待复核|待核)/, '状态须以已核、大体已核、待复核或待核开头'),
	photo: z.string().min(1),
	image: imageSchema,
	detailsNote: z.string().min(1),
	details: z.array(detailSchema).min(1),
	evidence: z.string().min(1),
	needLead: z.string().min(1),
	need: z.string().min(1),
});

/** Amounts only. Words such as 不估价 or a label's letter price-code stay allowed. */
const priceAmount = /[¥￥$€£]\s*\d|\d{1,3}(?:,\d{3})+/;

function findPriceAmount(
	value: unknown,
	path: Array<string | number>,
): { path: Array<string | number>; match: string } | null {
	if (typeof value === 'string') {
		const match = value.match(priceAmount);
		return match ? { path, match: match[0] } : null;
	}
	if (Array.isArray(value)) {
		for (let index = 0; index < value.length; index += 1) {
			const found = findPriceAmount(value[index], [...path, index]);
			if (found) return found;
		}
		return null;
	}
	if (value && typeof value === 'object') {
		for (const [key, child] of Object.entries(value)) {
			const found = findPriceAmount(child, [...path, key]);
			if (found) return found;
		}
	}
	return null;
}

const recordsFileSchema = z.array(recordSchema).superRefine((records, ctx) => {
	const seen = new Set<string>();
	records.forEach((record, index) => {
		if (seen.has(record.id)) {
			ctx.addIssue({
				code: 'custom',
				message: `重复的 id：${record.id}`,
				path: [index, 'id'],
			});
		}
		seen.add(record.id);

		const price = findPriceAmount(record, [index]);
		if (price) {
			ctx.addIssue({
				code: 'custom',
				message: `不要写入价格或金额（发现「${price.match}」）`,
				path: price.path,
			});
		}

		const images = [record.image, ...record.details.map((detail) => detail.image)];
		images.forEach((image, imageIndex) => {
			const prefix = `/records/${record.id}/`;
			if (!image.src.startsWith(prefix)) {
				ctx.addIssue({
					code: 'custom',
					message: `图片必须放在 ${prefix}`,
					path: [index, imageIndex === 0 ? 'image' : 'details', 'src'],
				});
			}
		});
	});
});

export type VinylRecord = z.infer<typeof recordSchema>;

export type StatusBucket = 'verified' | 'partial' | 'review' | 'unchecked';

function formatIssues(error: z.ZodError): string {
	return error.issues
		.map((issue) => {
			const path = issue.path.length > 0 ? issue.path.join('.') : '(根)';
			return `- ${path}: ${issue.message}`;
		})
		.join('\n');
}

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

export function parseRecords(data: unknown): VinylRecord[] {
	const parsed = recordsFileSchema.safeParse(data);
	if (!parsed.success) {
		throw new Error(
			`src/data/records.json 校验失败。不要写入价格或估值字段，未知字段和金额也会导致失败：\n${formatIssues(parsed.error)}`,
		);
	}
	for (const record of parsed.data) {
		assertPublicFile(record.image.src);
		for (const detail of record.details) assertPublicFile(detail.image.src);
	}
	return parsed.data;
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

/** 内圈刻字 and 压片 are public once the copy is 已核 or 大体已核. */
export function showPressingDetails(record: VinylRecord): boolean {
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
		record.decade,
		record.year?.toString() ?? '',
		record.status,
		record.recording,
		record.condition,
		record.eq,
		record.story,
		record.photo,
		record.detailsNote,
		record.evidence,
		record.need,
		record.needLead,
		...record.details.flatMap((detail) => [detail.caption, detail.text, detail.alt]),
		...record.links.map((link) => `${link.title} ${link.site}`),
	];
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

export const records = parseRecords(recordsJson);
