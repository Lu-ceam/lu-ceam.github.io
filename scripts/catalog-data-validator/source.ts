/**
 * Per-record source collector.
 *
 * Reads each record with the real strict schema (`parseRecord`, `storyBody`),
 * the real chapter model (`parseStorySections`, `buildDiscChapters`,
 * `discNotesFields`) and the photo inspector. One record failing never removes
 * the following records from the report.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
	buildDiscChapters,
	chapterPresent,
	discNotesFields,
	parseStorySections,
	type DiscChapter,
	type DiscChapterField,
} from '../../src/data/disc-chapters.ts';
import {
	expectedVerification,
	parseRecord,
	storyBody,
	type ExportRecord,
} from '../../src/data/records-export.ts';
import { expectedPublicAssets, type ModelRecord, type ModelState } from './model.ts';
import { inspectAsset, listAssetFiles, type AssetInspection, type SharpModule } from './images.ts';
import type {
	FieldReport,
	Finding,
	InventoryRow,
	NotChecked,
	PhotoReport,
	RecordExpectation,
	StoryReport,
} from './report.ts';
import { fingerprintParagraphs, sha256Hex } from './report.ts';
import { inspectTrajectory, type EntityCatalogState, type TrajectoryInspection } from './trajectory.ts';

/**
 * Whole-value placeholder tokens (versioned). Whole-value match only: prose that
 * contains 待补拍 / 年份未核 is not a placeholder. Legitimate status labels such
 * as 待复核 / 待核 are deliberately NOT in this list — they are a real status,
 * reported through `verificationState`, not rewritten as a placeholder.
 */
export const PLACEHOLDER_TOKENS_V1: readonly string[] = ['—', '–', '-', '待补', 'TODO', 'TBD', 'N/A', 'n/a', '?', '？'];

export const PLACEHOLDER_TOKEN_VERSION = 'placeholder-tokens-v1';

export function isWholePlaceholder(value: string): boolean {
	return PLACEHOLDER_TOKENS_V1.includes(value.trim());
}

const REQUIRED_STRING_FIELDS = [
	'composer',
	'work',
	'performers',
	'label',
	'catalogNumber',
	'category',
	'pressing',
	'matrix',
	'recording',
	'eq',
	'condition',
	'statusLabel',
	'notes',
] as const;

const REQUIRED_OTHER_FIELDS = ['id', 'verificationStatus', 'links', 'images', 'details'] as const;

export type FieldPolicyEntry = {
	recordId: string;
	field: string;
	state: 'unverified' | 'not-applicable' | 'accepted-gap';
	reason: string;
	approvedBy: string;
	approvedAt: string;
	reviewBy?: string;
	/** Only for accepted-gap: the exact image role or face. */
	role?: string;
};

export type BaselineLike = unknown;

export type SourceContext = {
	repoRoot: string;
	decoder: SharpModule | null;
	decoderAvailable: boolean;
	entities: EntityCatalogState;
	model: ModelState;
	fieldPolicy: FieldPolicyEntry[];
	rolePolicy: RolePolicyEntry[];
};

export type RolePolicyEntry = {
	recordId: string;
	role?: string;
	part?: string;
	disc?: number;
	side?: number;
	state: 'required' | 'accepted-gap' | 'not-applicable';
	reason: string;
	approvedBy: string;
	approvedAt: string;
	reviewBy?: string;
};

export type SourceResult = {
	id: string;
	root: string;
	legacy: boolean;
	status: 'collected' | 'blocked';
	blockReason: string | null;
	record: ExportRecord | null;
	schema: 'valid' | 'invalid';
	statusLabel: string | null;
	verificationStatus: string | null;
	photos: PhotoReport | null;
	story: StoryReport | null;
	trajectory: TrajectoryInspection | null;
	fields: FieldReport[];
	roleRequirements: 'not-checked' | 'checked';
	expect: RecordExpectation | null;
	findings: Finding[];
	notChecked: NotChecked[];
	recordSha256: string | null;
	storySha256: string | null;
	/** Layout entry fingerprint comes from the oracle model, when available. */
	layoutSha256: string | null;
};

function baseFinding(partial: Omit<Finding, 'key' | 'baselineId'>): Finding {
	return { key: '', baselineId: null, ...partial };
}

type FieldKind = 'string' | 'array' | 'object' | 'enum';

const FIELD_KINDS: Record<string, FieldKind> = {
	links: 'array',
	images: 'array',
	details: 'array',
	trajectory: 'object',
	verificationStatus: 'enum',
};

function examineField(raw: unknown, key: string, required: boolean): FieldReport {
	const holder = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
	if (!Object.hasOwn(holder, key)) {
		return {
			key,
			required,
			present: false,
			valueState: required ? 'missing' : 'optional-absent',
			verificationState: 'unknown',
			reason: required ? 'key absent' : 'optional key absent',
		};
	}
	const value = holder[key];
	const kind = FIELD_KINDS[key] ?? 'string';
	if (kind === 'array' || kind === 'object') {
		const shapeOk = kind === 'array' ? Array.isArray(value) : Boolean(value) && typeof value === 'object' && !Array.isArray(value);
		return {
			key,
			required,
			present: true,
			valueState: shapeOk ? 'valid' : 'invalid',
			verificationState: 'unknown',
			reason: shapeOk ? null : `expected ${kind}`,
		};
	}
	if (typeof value !== 'string') {
		return { key, required, present: true, valueState: 'invalid', verificationState: 'unknown', reason: `expected string, got ${value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value}` };
	}
	if (value.trim() === '') {
		return { key, required, present: true, valueState: 'whitespace', verificationState: 'unknown', reason: 'string is empty or whitespace only' };
	}
	if (isWholePlaceholder(value)) {
		return {
			key,
			required,
			present: true,
			valueState: 'placeholder',
			verificationState: 'unknown',
			reason: `whole value is a placeholder token (${PLACEHOLDER_TOKEN_VERSION}); the string alone is not evidence`,
		};
	}
	return { key, required, present: true, valueState: 'valid', verificationState: 'unknown', reason: null };
}

function collectFields(raw: unknown, parsed: ExportRecord | null): FieldReport[] {
	const reports: FieldReport[] = [];
	const keys = [...REQUIRED_STRING_FIELDS, ...REQUIRED_OTHER_FIELDS, 'year', 'trajectory'];
	for (const key of keys) {
		const required =
			(REQUIRED_STRING_FIELDS as readonly string[]).includes(key) ||
			(REQUIRED_OTHER_FIELDS as readonly string[]).includes(key);
		reports.push(examineField(raw, key, required));
	}
	if (parsed) {
		// Per PRD §12.3 a field's verification state does NOT inherit the whole
		// record's pending/verified status. Without field-level evidence it stays
		// `unknown`; only an explicit per-field policy may say unverified/N-A.
		// The schema already enforced the label↔status rule; record its value.
		const expected = expectedVerification(parsed.statusLabel);
		if (expected !== parsed.verificationStatus) {
			reports.push({
				key: 'verificationStatus',
				required: true,
				present: true,
				valueState: 'invalid',
				verificationState: 'unknown',
				reason: `verificationStatus should be ${expected} for statusLabel「${parsed.statusLabel}」`,
			});
		}
	}
	return reports;
}

function applyFieldPolicy(fields: FieldReport[], policies: readonly FieldPolicyEntry[], recordId: string, todayIso: string, findings: Finding[]): void {
	for (const policy of policies) {
		if (policy.recordId !== recordId) continue;
		const field = fields.find((entry) => entry.key === policy.field);
		if (!field) continue;
		if (policy.state === 'accepted-gap') {
			findings.push(
				baseFinding({
					code: 'FIELD_ACCEPTED_GAP',
					severity: 'error',
					layer: 'source',
					status: 'accepted-gap',
					recordId,
					fieldPath: policy.field,
					stationId: null,
					expected: { present: true, valid: true },
					actual: { state: field.valueState },
					reason: `${policy.reason}（批准：${policy.approvedBy} ${policy.approvedAt}）`,
					recommendation: '维持缺件状态并到期复审；accepted-gap 不等于已补齐',
					evidence: policy.reviewBy ? [`reviewBy ${policy.reviewBy}`] : [],
				}),
			);
			continue;
		}
		field.verificationState = policy.state === 'unverified' ? 'declared-unverified' : 'not-applicable';
		field.reason = `${policy.reason}（批准：${policy.approvedBy} ${policy.approvedAt}${policy.reviewBy ? `，复审 ${policy.reviewBy}` : ''}）`;
		if (policy.reviewBy && policy.reviewBy.slice(0, 10) < todayIso.slice(0, 10)) {
			findings.push(
				baseFinding({
					code: 'FIELD_POLICY_EXPIRED',
					severity: 'error',
					layer: 'source',
					status: 'active',
					recordId,
					fieldPath: policy.field,
					stationId: null,
					expected: { reviewBy: `>= ${todayIso.slice(0, 10)}` },
					actual: { reviewBy: policy.reviewBy },
					reason: '字段级未核/不适用说明已过期，须重新批准',
					recommendation: '更新批准记录或补齐字段证据',
					evidence: [],
				}),
			);
		}
	}
}

function photoReport(inspections: AssetInspection[], onDisk: string[], referenced: string[]): PhotoReport {
	const kindRefs: Record<string, number> = {};
	const kindUniqueAssets: Record<string, number> = {};
	return {
		imageRefs: 0,
		detailRefs: 0,
		totalRefs: referenced.length,
		uniqueReferencedAssets: new Set(referenced).size,
		uniqueByteContents: null,
		kindRefs,
		kindUniqueAssets,
		validFiles: inspections.filter((entry) => entry.status === 'valid').length,
		missingFiles: inspections.filter((entry) => entry.status === 'missing').length,
		invalidFiles: inspections.filter((entry) =>
			['escape', 'not-file', 'empty', 'format-mismatch', 'decode-failed', 'decoder-unavailable'].includes(entry.status),
		).length,
		unreferencedFiles: onDisk.filter((file) => !referenced.includes(file)),
		duplicateByteGroups: [],
	};
}

function storyPlaceholderOnly(body: string): boolean {
	const stripped = body
		.split(/\r?\n/)
		.map((line) => line.replace(/^#{1,6}\s+.*$/u, '').replace(/<!--.*?-->/gu, '').trim())
		.filter((line) => line !== '');
	if (stripped.length === 0) return true;
	return stripped.every((line) => isWholePlaceholder(line));
}

export function chaptersFor(
	record: ExportRecord,
	notesFields: DiscChapterField[],
	extraRecordParagraphs: string[],
	hasRecordVisuals: boolean,
): DiscChapter[] {
	return buildDiscChapters({
		story: record.story,
		hasMap: Boolean(record.trajectory),
		notesFields,
		hasRecordVisuals,
		hasNotesLinks: record.links.length > 0,
		extraRecordParagraphs,
	});
}

export function buildExpectation(
	record: ExportRecord,
	model: ModelState,
	notesFields: DiscChapterField[],
	chapters: DiscChapter[],
	hasChapterShell: boolean,
	trajectory: TrajectoryInspection | null,
): RecordExpectation {
	return {
		chapters: chapters.map((chapter) => ({ key: chapter.key, label: chapter.label })),
		storyParagraphs:
			chapters
				.find((chapter) => chapter.key === 'story')
				?.sections.flatMap((section) => section.paragraphs) ?? [],
		notesFields: notesFields.map((field) => ({ term: field.term, value: field.value })),
		notesConditionsAvailable: model.ok,
		mapStations: (trajectory?.places ?? []).map((place) => ({ id: place.id, year: place.year })),
		mapStationsAvailable: trajectory === null || trajectory.report.state === 'present-valid' || trajectory.report.state === 'absent',
		hasTrajectory: Boolean(record.trajectory),
		hasChapterShell,
		assets: null,
		linksCount: record.links.length,
	};
}

export async function collectRecord(row: InventoryRow, ctx: SourceContext): Promise<SourceResult> {
	const findings: Finding[] = [];
	const notChecked: NotChecked[] = [];
	const recordDir = join(row.root, 'records', row.id);
	const empty: SourceResult = {
		id: row.id,
		root: row.root,
		legacy: row.legacy,
		status: 'blocked',
		blockReason: row.blockReason,
		record: null,
		schema: 'invalid',
		statusLabel: null,
		verificationStatus: null,
		photos: null,
		story: null,
		trajectory: null,
		fields: [],
		roleRequirements: 'not-checked',
		expect: null,
		findings,
		notChecked,
		recordSha256: null,
		storySha256: null,
		layoutSha256: null,
	};

	if (row.blockReason) {
		findings.push(
			baseFinding({
				code: 'RECORD_BLOCKED_INVENTORY',
				severity: 'error',
				layer: 'source',
				status: 'blocked',
				recordId: row.id,
				fieldPath: 'inventory',
				stationId: null,
				expected: { inventoryConflict: false },
				actual: { blockReason: row.blockReason },
				reason: `该盘在盘点阶段已冲突/缺件（${row.blockReason}），逐项检查保持 blocked`,
				recommendation: '先修盘点身份冲突；不要用其他盘的通过掩盖',
				evidence: [row.recordPath],
			}),
		);
		return empty;
	}

	let raw: unknown = null;
	try {
		raw = JSON.parse(readFileSync(row.recordPath, 'utf8')) as unknown;
	} catch (error) {
		findings.push(
			baseFinding({
				code: 'RECORD_JSON_UNREADABLE',
				severity: 'error',
				layer: 'source',
				status: 'active',
				recordId: row.id,
				fieldPath: 'record.json',
				stationId: null,
				expected: { readable: true },
				actual: { readable: false },
				reason: error instanceof Error ? error.message : String(error),
				recommendation: '修复 JSON；该盘其余盘不受影响',
				evidence: [row.recordPath],
			}),
		);
		return { ...empty, blockReason: 'record-json-unreadable' };
	}
	empty.fields = collectFields(raw, null);

	if (existsSync(row.recordPath)) {
		empty.recordSha256 = sha256Hex(readFileSync(row.recordPath));
	}

	let parsed: ExportRecord | null = null;
	try {
		const record = parseRecord(raw, row.recordPath);
		let story = '';
		let storyText = '';
		if (existsSync(row.storyPath)) {
			storyText = readFileSync(row.storyPath, 'utf8');
			story = storyBody(storyText);
			empty.storySha256 = sha256Hex(storyText);
		}
		parsed = { ...record, story, legacy: row.legacy };
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		findings.push(
			baseFinding({
				code: 'RECORD_SCHEMA_INVALID',
				severity: 'error',
				layer: 'source',
				status: 'active',
				recordId: row.id,
				fieldPath: 'record.json',
				stationId: null,
				expected: { schema: 1 },
				actual: { valid: false },
				reason: message,
				recommendation: '按 docs/records-contract.md 修复该条；不要放宽解析器或伪造字段',
				evidence: [row.recordPath],
			}),
		);
		empty.fields = collectFields(raw, null);
		if (existsSync(row.storyPath)) empty.storySha256 = sha256Hex(readFileSync(row.storyPath));
		// A null / missing inline year is an unsupported shape today (no unknown
		// time capability yet). Record the semantic gap separately from the schema
		// error; never treat it as a legal unknown and never write null.
		const rawTrajectory = raw && typeof raw === 'object' ? (raw as { trajectory?: unknown }).trajectory : undefined;
		const rawPlaces = rawTrajectory && typeof rawTrajectory === 'object' ? (rawTrajectory as { places?: unknown }).places : undefined;
		if (Array.isArray(rawPlaces)) {
			rawPlaces.forEach((station, index) => {
				if (!station || typeof station !== 'object') return;
				const entry = station as Record<string, unknown>;
				if ('eventId' in entry) return;
				if (entry.year === null || entry.year === undefined) {
					notChecked.push({
						code: 'TRAJECTORY_UNKNOWN_CAPABILITY_UNSUPPORTED',
						layer: 'source',
						recordId: row.id,
						fieldPath: `trajectory.places[${index}].year`,
						reason:
							'该站没有整数年（null/缺省），当前 schema 只接受 1500–2100 整数；unknown 时间能力尚未落地，语义未核，不将 null 当合法 unknown',
						dependency: 'unknown-time-contract',
					});
				}
			});
		}
		return { ...empty, blockReason: 'schema-invalid' };
	}

	// Story / chapters.
	const sectionTitles = parseStorySections(parsed.story).map((section) => section.title);
	const notesFieldsRaw: DiscChapterField[] = [];
	const chapters = buildDiscChapters({ story: parsed.story, hasMap: Boolean(parsed.trajectory), notesFields: notesFieldsRaw });
	const storyChapter = chapters.find((chapter) => chapter.key === 'story') ?? null;
	const storyChapterPresent = Boolean(storyChapter && chapterPresent(storyChapter));
	const bodyPresent = parsed.story.trim() !== '';
	const placeholderOnly = bodyPresent && storyPlaceholderOnly(parsed.story);
	const paragraphs = storyChapter?.sections.flatMap((section) => section.paragraphs) ?? [];
	const story: StoryReport = {
		fileExists: existsSync(row.storyPath),
		sourceBodyPresent: bodyPresent,
		storyChapterPresent,
		bodyChars: parsed.story.length,
		chapterParagraphs: bodyPresent ? paragraphs.length : null,
		paragraphFingerprint: bodyPresent ? fingerprintParagraphs(paragraphs) : null,
		paragraphs,
		chapterKeys: chapters.map((chapter) => chapter.key),
		chapterLabels: chapters.map((chapter) => chapter.label),
		placeholderOnly,
	};
	if (!story.fileExists) {
		findings.push(
			baseFinding({
				code: 'STORY_SOURCE_MISSING',
				severity: 'error',
				layer: 'source',
				status: 'active',
				recordId: row.id,
				fieldPath: 'story.md',
				stationId: null,
				expected: { present: true },
				actual: { present: false },
				reason: 'story.md 不存在；现有 loader 也要求每盘有正文',
				recommendation: '补齐公开长文；校验器不生成占位正文',
				evidence: [row.storyPath],
			}),
		);
	} else if (!bodyPresent) {
		findings.push(
			baseFinding({
				code: 'STORY_SOURCE_EMPTY',
				severity: 'error',
				layer: 'source',
				status: 'active',
				recordId: row.id,
				fieldPath: 'story.md',
				stationId: null,
				expected: { bodyAfterH1: 'non-empty' },
				actual: { bodyAfterH1: 'empty' },
				reason: '去掉一级标题后没有正文',
				recommendation: '补正文；只有标题或空白不算述语',
				evidence: [row.storyPath],
			}),
		);
	} else if (placeholderOnly) {
		findings.push(
			baseFinding({
				code: 'STORY_SOURCE_PLACEHOLDER',
				severity: 'error',
				layer: 'source',
				status: 'active',
				recordId: row.id,
				fieldPath: 'story.md',
				stationId: null,
				expected: { body: 'real prose' },
				actual: { body: 'placeholder only' },
				reason: `整篇都是占位（${PLACEHOLDER_TOKEN_VERSION}），不是述语`,
				recommendation: '写真实正文；句中含「待补拍」「年份未核」不会被判占位',
				evidence: [row.storyPath],
			}),
		);
	} else if (!storyChapterPresent) {
		findings.push(
			baseFinding({
				code: 'STORY_CHAPTER_MISSING_IN_SOURCE',
				severity: 'warning',
				layer: 'source',
				status: 'active',
				recordId: row.id,
				fieldPath: 'story.md',
				stationId: null,
				expected: { storyChapter: true },
				actual: { storyChapter: false, sections: sectionTitles },
				reason: '正文存在，但按现有章节解析没有任何段落归入述语章（例如只有唱片物述）',
				recommendation: '确认这是有意的物述/资料叙事；sourceBodyPresent 与 storyChapterPresent 分开记',
				evidence: [row.storyPath],
			}),
		);
	}

	// Photos.
	const imageRefs = parsed.images.map((image) => ({ rel: image.file, kind: image.kind }));
	const detailRefs = parsed.details.map((detail) => ({ rel: detail.file, kind: 'detail' as string }));
	const referenced = [...imageRefs.map((entry) => entry.rel), ...detailRefs.map((entry) => entry.rel)];
	const inspections: AssetInspection[] = [];
	for (const rel of [...new Set(referenced)]) {
		inspections.push(await inspectAsset({ recordDir, rel, decoder: ctx.decoder }));
	}
	const byRel = new Map(inspections.map((entry) => [entry.rel, entry]));
	const referenceSet = new Set(referenced);
	for (const [index, image] of parsed.images.entries()) {
		const inspection = byRel.get(image.file);
		if (!inspection) {
			notChecked.push({
				code: 'PHOTO_NOT_INSPECTED',
				layer: 'source',
				recordId: row.id,
				fieldPath: `images[${index}].file`,
				reason: 'no inspection record',
				dependency: null,
			});
			continue;
		}
		if (inspection.status === 'valid') continue;
		if (inspection.status === 'decoder-unavailable') {
			notChecked.push({
				code: 'PHOTO_DECODE_BLOCKED',
				layer: 'source',
				recordId: row.id,
				fieldPath: `images[${index}].file`,
				reason: 'image decoder unavailable; existence/signature is not a valid decode',
				dependency: 'sharp',
			});
			continue;
		}
		findings.push(
			baseFinding({
				code: inspection.status === 'escape' ? 'IMAGE_ESCAPE' : inspection.status === 'missing' ? 'IMAGE_MISSING' : 'IMAGE_INVALID',
				severity: 'error',
				layer: 'source',
				status: 'active',
				recordId: row.id,
				fieldPath: `images[${index}].file`,
				stationId: null,
				expected: { decodable: true, insideRecordDir: true },
				actual: { status: inspection.status, reason: inspection.reason },
				reason: inspection.reason ?? inspection.status,
				recommendation: '换用可完整解码的原图，放在该盘 images/ 或 details/ 内；坏图不能只记 0 张',
				evidence: [`${row.id}/${image.file}`],
			}),
		);
	}
	for (const [index, detail] of parsed.details.entries()) {
		const inspection = byRel.get(detail.file);
		if (!inspection || inspection.status === 'valid') continue;
		if (inspection.status === 'decoder-unavailable') {
			notChecked.push({
				code: 'PHOTO_DECODE_BLOCKED',
				layer: 'source',
				recordId: row.id,
				fieldPath: `details[${index}].file`,
				reason: 'image decoder unavailable; existence/signature is not a valid decode',
				dependency: 'sharp',
			});
			continue;
		}
		findings.push(
			baseFinding({
				code: inspection.status === 'escape' ? 'IMAGE_ESCAPE' : inspection.status === 'missing' ? 'IMAGE_MISSING' : 'IMAGE_INVALID',
				severity: 'error',
				layer: 'source',
				status: 'active',
				recordId: row.id,
				fieldPath: `details[${index}].file`,
				stationId: null,
				expected: { decodable: true, insideRecordDir: true },
				actual: { status: inspection.status, reason: inspection.reason },
				reason: inspection.reason ?? inspection.status,
				recommendation: '修复或替换该细节图；不可用只读拾取器代替 JPEG/PNG/WebP 完整解码',
				evidence: [`${row.id}/${detail.file}`],
			}),
		);
	}

	// Photos are required by the current schema; an absent cover-front is a hard error.
	if (!parsed.images.some((image) => image.kind === 'cover-front')) {
		findings.push(
			baseFinding({
				code: 'IMAGE_COVER_FRONT_MISSING',
				severity: 'error',
				layer: 'source',
				status: 'active',
				recordId: row.id,
				fieldPath: 'images',
				stationId: null,
				expected: { kinds: 'cover-front present' },
				actual: { kinds: [...new Set(parsed.images.map((image) => image.kind))] },
				reason: '现 schema 要求至少一张 cover-front；缺件批准不能绕过 schema',
				recommendation: '补封面原图；无地图合法不等于无照片合法',
				evidence: [`${row.id}/record.json images[]`],
			}),
		);
	}

	// Duplicate references (same file + same purpose) are hard errors.
	const seenImageRefs = new Set<string>();
	for (const [index, image] of parsed.images.entries()) {
		const key = `${image.file}\u0000${image.kind}`;
		if (seenImageRefs.has(key)) {
			findings.push(
				baseFinding({
					code: 'IMAGE_DUPLICATE_REFERENCE',
					severity: 'error',
					layer: 'source',
					status: 'active',
					recordId: row.id,
					fieldPath: `images[${index}].file`,
					stationId: null,
					expected: { uniquePair: `${image.file}/${image.kind}` },
					actual: { duplicate: true },
					reason: '同一数组用相同路径和相同用途重复引用，不能凑照片数',
					recommendation: '删掉重复引用；跨 images/details 的合法复用不报此错',
					evidence: [`${row.id}/${image.file}`],
				}),
			);
		}
		seenImageRefs.add(key);
	}
	const seenDetailRefs = new Set<string>();
	for (const [index, detail] of parsed.details.entries()) {
		if (seenDetailRefs.has(detail.file)) {
			findings.push(
				baseFinding({
					code: 'IMAGE_DUPLICATE_REFERENCE',
					severity: 'error',
					layer: 'source',
					status: 'active',
					recordId: row.id,
					fieldPath: `details[${index}].file`,
					stationId: null,
					expected: { uniqueFile: detail.file },
					actual: { duplicate: true },
					reason: 'details 数组重复引用同一文件',
					recommendation: '删掉重复引用',
					evidence: [`${row.id}/${detail.file}`],
				}),
			);
		}
		seenDetailRefs.add(detail.file);
	}

	const onDisk = listAssetFiles(recordDir);
	const photos = photoReport(inspections, onDisk, [...new Set(referenced)]);
	const owner = new Set(referenceSet);
	photos.kindRefs = {};
	photos.kindUniqueAssets = {};
	photos.imageRefs = imageRefs.length;
	photos.detailRefs = detailRefs.length;
	photos.totalRefs = imageRefs.length + detailRefs.length;
	for (const entry of imageRefs) {
		photos.kindRefs[entry.kind] = (photos.kindRefs[entry.kind] ?? 0) + 1;
	}
	for (const kind of Object.keys(photos.kindRefs)) {
		photos.kindUniqueAssets[kind] = new Set(imageRefs.filter((entry) => entry.kind === kind).map((entry) => entry.rel)).size;
	}
	photos.unreferencedFiles = onDisk.filter((file) => !owner.has(file));
	const byteGroups = new Map<string, string[]>();
	for (const inspection of inspections) {
		if (!inspection.sha256) continue;
		const list = byteGroups.get(inspection.sha256) ?? [];
		list.push(inspection.rel);
		byteGroups.set(inspection.sha256, list);
	}
	photos.uniqueByteContents = byteGroups.size;
	photos.duplicateByteGroups = [...byteGroups.values()].filter((group) => new Set(group).size > 1);
	for (const group of photos.duplicateByteGroups) {
		findings.push(
			baseFinding({
				code: 'IMAGE_BYTE_DUPLICATE',
				severity: 'warning',
				layer: 'source',
				status: 'active',
				recordId: row.id,
				fieldPath: 'images',
				stationId: null,
				expected: { independentPhotos: true },
				actual: { identicalFiles: group },
				reason: '不同路径的图片字节完全相同，不能当作独立拍摄证据',
				recommendation: '人工确认是否需要保留两份；校验器不自动删图',
				evidence: group.map((rel) => `${row.id}/${rel}`),
			}),
		);
	}
	for (const file of photos.unreferencedFiles) {
		findings.push(
			baseFinding({
				code: 'IMAGE_UNREFERENCED_FILE',
				severity: 'warning',
				layer: 'source',
				status: 'active',
				recordId: row.id,
				fieldPath: file,
				stationId: null,
				expected: { referenced: true },
				actual: { referenced: false },
				reason: '该盘 images/details 目录里有未被 record.json 引用的文件',
				recommendation: '确认是否漏引用或应删除；未引用文件不计入已提供照片',
				evidence: [`${row.id}/${file}`],
			}),
		);
	}

	// Fields.
	const fields = collectFields(raw, parsed);
	applyFieldPolicy(fields, ctx.fieldPolicy, row.id, new Date().toISOString(), findings);

	// Trajectory.
	const trajectory = inspectTrajectory(parsed, ctx.entities, recordDir);
	findings.push(...trajectory.findings);
	notChecked.push(...trajectory.notChecked);

	// Version role requirements: no machine contract in the repo ⇒ explicitly not checked.
	const rolePolicies = ctx.rolePolicy.filter((policy) => policy.recordId === row.id);
	const roleRequirements: 'not-checked' | 'checked' = rolePolicies.length > 0 ? 'checked' : 'not-checked';
	if (rolePolicies.length === 0) {
		notChecked.push({
			code: 'VERSION_ROLE_REQUIREMENTS_UNCHECKED',
			layer: 'source',
			recordId: row.id,
			fieldPath: 'images',
			reason: '没有机器可读的版本齐套合同（碟/面/封底/腰封需求），角色覆盖已统计但齐套未核',
			dependency: null,
		});
	} else {
		const rolesPresent = new Set(parsed.images.map((image) => image.kind));
		for (const policy of rolePolicies) {
			if (policy.state === 'not-applicable') continue;
			const present = policy.role ? rolesPresent.has(policy.role as never) : true;
			if (present) continue;
			findings.push(
				baseFinding({
					code: policy.state === 'accepted-gap' ? 'IMAGE_ROLE_ACCEPTED_GAP' : 'IMAGE_ROLE_REQUIRED_MISSING',
					severity: 'error',
					layer: 'source',
					status: policy.state === 'accepted-gap' ? 'accepted-gap' : 'active',
					recordId: row.id,
					fieldPath: 'images',
					stationId: null,
					expected: { role: policy.role ?? null, required: true },
					actual: { present: false },
					reason: `${policy.reason}（批准：${policy.approvedBy} ${policy.approvedAt}）`,
					recommendation: '补齐该角色或保留精准缺件批准；不得用全局豁免',
					evidence: [],
				}),
			);
		}
	}

	// Expectations (needs the oracle model for the real notes hide rules).
	let modelRecord: ModelRecord | null = null;
	let notesFields: DiscChapterField[] = [];
	let extraRecordParagraphs: string[] = [];
	let hasChapterShell = false;
	if (ctx.model.ok) {
		modelRecord = ctx.model.records.get(row.id) ?? null;
		if (modelRecord) {
			notesFields = discNotesFields(modelRecord as never, {
				showMatrix: ctx.model.showMatrix(modelRecord),
				showPressing: ctx.model.showPressing(modelRecord),
			});
			const reveal = modelRecord.details.filter((detail) => ctx.model.ok && ctx.model.detailMode(detail) === 'reveal');
			extraRecordParagraphs = reveal
				.map((detail) => (ctx.model.ok ? ctx.model.visibleDetailText(detail) : null))
				.filter((text): text is string => Boolean(text));
			hasChapterShell = reveal.length > 0;
			empty.layoutSha256 = sha256Hex(JSON.stringify(modelRecord));
		} else {
			notChecked.push({
				code: 'BUILD_MODEL_RECORD_MISSING',
				layer: 'source',
				recordId: row.id,
				fieldPath: 'src/data/records-layout.json',
				reason: '生产模型里没有该条（layout/导出对账失败），notes 显示条件与派生资产未计算',
				dependency: 'records.ts',
			});
		}
	} else {
		notChecked.push({
			code: 'BUILD_MODEL_BLOCKED',
			layer: 'source',
			recordId: row.id,
			fieldPath: 'src/data/records.ts',
			reason: ctx.model.reason,
			dependency: 'records.ts',
		});
	}

	const finalChapters = chaptersFor(parsed, notesFields, extraRecordParagraphs, hasChapterShell);
	const expectation = buildExpectation(parsed, ctx.model, notesFields, finalChapters, hasChapterShell, trajectory);
	if (modelRecord && ctx.model.ok) {
		expectation.assets = expectedPublicAssets(modelRecord);
	}

	return {
		...empty,
		status: 'collected',
		blockReason: null,
		record: parsed,
		schema: 'valid',
		statusLabel: parsed.statusLabel,
		verificationStatus: parsed.verificationStatus,
		photos,
		story,
		trajectory,
		fields,
		roleRequirements,
		expect: expectation,
		findings,
		notChecked,
	};
}

