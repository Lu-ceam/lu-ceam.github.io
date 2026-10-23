import { z } from 'zod';
import recordsJson from './records.json' with { type: 'json' };

/**
 * Vinyl collection. Unknown keys are rejected so price or valuation fields
 * cannot slip into the build.
 */
export const recordSchema = z.strictObject({
	id: z.string().min(1),
	title: z.string().min(1),
	performers: z.array(z.string().min(1)).min(1),
	label: z.string().min(1),
	catalogNumber: z.string().min(1),
	pressing: z.string().min(1).nullable(),
	verificationStatus: z.enum(['verified', 'pending']),
	composer: z.string().min(1).optional(),
	year: z.number().int().gte(1800).lte(2100).optional(),
	notes: z.string().min(1).optional(),
});

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
	});
});

export type VinylRecord = z.infer<typeof recordSchema>;

function formatIssues(error: z.ZodError): string {
	return error.issues
		.map((issue) => {
			const path = issue.path.length > 0 ? issue.path.join('.') : '(根)';
			return `- ${path}: ${issue.message}`;
		})
		.join('\n');
}

export function parseRecords(data: unknown): VinylRecord[] {
	const parsed = recordsFileSchema.safeParse(data);
	if (!parsed.success) {
		throw new Error(
			`src/data/records.json 校验失败。不要写入价格或估值字段，未知字段也会导致失败：\n${formatIssues(parsed.error)}`,
		);
	}
	return parsed.data;
}

/** Pressing details are public only after the copy has been checked. */
export function showPressing(record: VinylRecord): boolean {
	return record.verificationStatus === 'verified' && record.pressing !== null;
}

export function recordSearchText(record: VinylRecord): string {
	const parts = [
		record.title,
		record.composer ?? '',
		record.performers.join(' '),
		record.label,
		record.catalogNumber,
		record.year?.toString() ?? '',
		record.notes ?? '',
	];
	if (showPressing(record) && record.pressing) parts.push(record.pressing);
	return parts.join(' ').toLocaleLowerCase('zh-CN');
}

export function uniqueValues(values: Array<string | undefined>): string[] {
	const unique = new Set<string>();
	for (const value of values) {
		if (value) unique.add(value);
	}
	return [...unique].sort((a, b) => a.localeCompare(b, 'zh-CN'));
}

export const records = parseRecords(recordsJson);
