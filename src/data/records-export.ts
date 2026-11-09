import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { z } from 'zod';
import forbiddenFields from './forbidden-fields.json' with { type: 'json' };
import { isKnownTime, isUnknownTime, type TrajectoryTime } from './trajectory-time.ts';

/**
 * Curator export, schemaVersion 1. See docs/records-contract.md.
 *
 * `records/` is the export the curator writes. `records-legacy/` holds the rows
 * that are not in that export yet and uses the same file shape.
 *
 * Forbidden keys — evidence, 补拍 lists, prices, purchase sources, valuations —
 * are rejected anywhere in the tree. `showsPrice` is a photo flag, not a price.
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

/** Disc-local stop slug, and the museum slug for Person / Work / Event ids. */
export const slugId = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const PLACE_ROLES = [
	'birth',
	'composition',
	'premiere',
	'recording',
	'pressing',
	'release',
	'performance',
	'residence',
	'other',
	'founded',
] as const;

/** recording / pressing / release belong to one disc. Other roles are shared unless `other` sets recordId. */
export const DISC_EVENT_ROLES = ['recording', 'pressing', 'release'] as const;

/**
 * Shared museum facts. They must not carry `recordId`.
 * `founded` also requires `organizationIds`. The others require a person or a work.
 */
export const SHARED_ROLES = [
	'birth',
	'residence',
	'composition',
	'premiere',
	'performance',
	'founded',
] as const;

export type PlaceRole = (typeof PLACE_ROLES)[number];

/** Keys a pointer station must not carry. The Event owns them; blurb is the only disc override. */
export const POINTER_LOCKED_KEYS = [
	'year',
	'yearLabel',
	'timeStatus',
	'timeNote',
	'cityZh',
	'city',
	'role',
	'lon',
	'lat',
	'zoom',
	'personId',
	'workId',
	'lifeRole',
] as const;

/**
 * 旧未核哨兵（`yearLabel: "—"` 及同族）。扫描只产候选，**不**由 label 推断状态。
 * `REJECT_SENTINEL_TIME` 是发布单元开关：它必须与经审计的精准迁移同一次发布，
 * 在那之前保持 false——单独合入会挡现存全馆 build（合同 §8）。
 */
export const SENTINEL_TIME_LABELS: readonly string[] = ['—', '–', '-', '?', '待定', '待核', '未核'];
export const REJECT_SENTINEL_TIME = true;

/** 时间分支的原始输入：旧导出没有 discriminator，新导出显式声明。 */
export const rawTimeFields = {
	timeStatus: z.enum(['known', 'unknown']).optional(),
	year: z.number().int().min(1500).max(2100).nullable().optional(),
	yearLabel: z.string().min(1).max(32).optional(),
	timeNote: z.string().min(1).max(120).optional(),
};

export type RawTime = z.infer<z.ZodObject<typeof rawTimeFields>>;

export type TimeIssue = { message: string; path: string[] };

/**
 * 一个规范化边界：任何写得出的时间输入都在这里收敛成 canonical union。
 * 冲突一律 fail closed，不猜、不静默吞年号、不把缺 year 当成 unknown。
 */
export function normaliseTime(raw: RawTime): { time: TrajectoryTime; yearLabel?: string } | TimeIssue[] {
	const label = raw.yearLabel;
	const note = raw.timeNote;
	const noteOk = typeof note === 'string' && note.trim().length > 0;

	if (raw.timeStatus === 'unknown') {
		const issues: TimeIssue[] = [];
		if (raw.year !== null) {
			issues.push({ message: 'unknown 站必须 year:null——整数年与 unknown 不能并存（时间分支冲突）', path: ['year'] });
		}
		if (!noteOk) {
			issues.push({ message: 'unknown 站必须填写非空 timeNote（说明哪个时间未知）', path: ['timeNote'] });
		}
		if (label !== undefined && !SENTINEL_TIME_LABELS.includes(label.trim())) {
			issues.push({ message: 'unknown 站不能带 yearLabel——年号不是 unknown 的显示来源', path: ['yearLabel'] });
		}
		if (issues.length > 0) return issues;
		// 窄兼容：输入写、unknown + null + 「—」时归一化移除横线；其他 label 已在上面拒绝。
		return { time: { timeStatus: 'unknown', year: null, timeNote: (note as string).trim() } };
	}

	if (raw.timeStatus === 'known') {
		const issues: TimeIssue[] = [];
		if (raw.year === null || raw.year === undefined) {
			issues.push({ message: 'known 站必须有整数 year（时间锚点缺失）', path: ['year'] });
		}
		if (note !== undefined) {
			issues.push({ message: 'known 站不能带 timeNote（时间字段冲突）', path: ['timeNote'] });
		}
		// 旧哨兵的拒绝与经审计的迁移同属一个发布单元（合同 §8）：开关未开时只产候选，
		// 不单独合入会挡现存全馆 build 的硬闸。
		if (REJECT_SENTINEL_TIME && label !== undefined && SENTINEL_TIME_LABELS.includes(label.trim())) {
			issues.push({ message: 'known 站不能带占位时间标签（待审计的时间哨兵）', path: ['yearLabel'] });
		}
		if (issues.length > 0) return issues;
		return {
			time: { timeStatus: 'known', year: raw.year as number },
			...(label === undefined ? {} : { yearLabel: label }),
		};
	}

	// 旧输入：没有 discriminator。有效整数年读为 known；缺 year 不猜 unknown。
	if (raw.year === null || raw.year === undefined) {
		return [
			{
				message: '轨迹站必须有整数 year，或显式写 timeStatus:"unknown" + year:null + timeNote；缺省时间不作为未知',
				path: ['year'],
			},
		];
	}
	if (label !== undefined && SENTINEL_TIME_LABELS.includes(label.trim())) {
		if (REJECT_SENTINEL_TIME) {
			return [
				{
					message: `占位时间标签「${label}」不是年份：先经审计迁移成 timeStatus:"unknown"（不允许由 label 推断状态）`,
					path: ['yearLabel'],
				},
			];
		}
	}
	return {
		time: { timeStatus: 'known', year: raw.year },
		...(label === undefined ? {} : { yearLabel: label }),
	};
}

const placeSchema = z
	.strictObject({
		id: z.string().regex(slugId, 'id 须为小写 slug（碟内唯一）'),
		...rawTimeFields,
		cityZh: z.string().min(1),
		city: z.string().min(1),
		role: z.enum(PLACE_ROLES),
		lon: z.number().min(-180).max(180),
		lat: z.number().min(-90).max(90),
		zoom: z.number().int().min(3).max(12).optional(),
		blurb: z.string().min(1).optional(),
	})
	.superRefine((place, ctx) => {
		if (place.role === 'other' && place.blurb === undefined) {
			ctx.addIssue({ code: 'custom', message: 'role 为 other 时必须填写 blurb', path: ['blurb'] });
		}
	});

/** 规范化后的一条内联地点：原字段 + canonical 时间分支。 */
export type PlaceContext = Omit<
	z.infer<typeof placeSchema>,
	'timeStatus' | 'year' | 'yearLabel' | 'timeNote'
>;
export type CanonicalInlinePlace = PlaceContext & TrajectoryTime;

/**
 * 边界 parser 的唯一出口：把原始地点收敛成 canonical 内联地点（时间分支由
 * `normaliseTime` 决定）。冲突时抛可读错误，不静默吞字段。
 */
export function canonicalInlinePlace(place: RawTime & Record<string, unknown>): CanonicalInlinePlace {
	const normalised = normaliseTime(place);
	if (Array.isArray(normalised)) {
		throw new Error(`轨迹站 ${String(place.id)} 的时间字段冲突：${normalised[0]!.message}`);
	}
	const { timeStatus: _s, year: _y, yearLabel: _l, timeNote: _n, ...rest } = place;
	void _s;
	void _y;
	void _l;
	void _n;
	return {
		...(rest as PlaceContext),
		...(normalised.yearLabel === undefined ? {} : { yearLabel: normalised.yearLabel }),
		...normalised.time,
	} as CanonicalInlinePlace;
}

/** 轨迹里的一条站：指针站原样保留，内联地点走同一个规范化边界（幂等）。 */
export function canonicalStation(station: RawTrajectoryStation): TrajectoryStation {
	if (isEventPointer(station)) return station;
	// 规范化是幂等的：对已经 canonical 的形状再跑一遍不会改变结果，也不会重复报错。
	return canonicalInlinePlace(station as RawTime & Record<string, unknown>);
}

const eventPointerSchema = z.strictObject({
	id: z.string().regex(slugId, 'id 须为小写 slug（碟内唯一）'),
	eventId: z.string().regex(slugId, 'eventId 须为馆级小写 slug'),
	blurb: z.string().min(1).optional(),
});

const trajectoryStationSchema = z.union([eventPointerSchema, placeSchema]);

export const trajectorySchema = z
	.strictObject({
		places: z.array(trajectoryStationSchema),
		titleZh: z.string().min(1).optional(),
	})
	.superRefine((trajectory, ctx) => {
		if (trajectory.places.length === 0) {
			ctx.addIssue({
				code: 'custom',
				message: 'places 不能为空。没有地点时删掉整个 trajectory，不要留空壳。',
				path: ['places'],
			});
		}
		const seen = new Set<string>();
		const seenEvents = new Set<string>();
		trajectory.places.forEach((place, index) => {
			if (seen.has(place.id)) {
				ctx.addIssue({
					code: 'custom',
					message: `重复的 place id：${place.id}`,
					path: ['places', index, 'id'],
				});
			}
			seen.add(place.id);
			if (isEventPointer(place)) {
				if (seenEvents.has(place.eventId)) {
					ctx.addIssue({
						code: 'custom',
						message: `同碟重复的 eventId：${place.eventId}`,
						path: ['places', index, 'eventId'],
					});
				}
				seenEvents.add(place.eventId);
				return;
			}
			if (place.role === 'other' && place.blurb === undefined) {
				ctx.addIssue({
					code: 'custom',
					message: 'role 为 other 时必须填写 blurb',
					path: ['places', index, 'blurb'],
				});
			}
		});
	});

/** 原始内联地点（磁盘形状）：时间字段可能还没有 discriminator。 */
export type RawInlinePlace = z.infer<typeof placeSchema>;
export type EventPointer = z.infer<typeof eventPointerSchema>;
/** 磁盘上的轨迹站：指针，或还没归一化的内联地点。 */
export type RawTrajectoryStation = RawInlinePlace | EventPointer;
/** canonical 内联地点：所有 consumer 读到的形状，时间分支已收敛。 */
export type InlinePlace = CanonicalInlinePlace;
/** parser 出口的一条轨迹站。 */
export type TrajectoryStation = InlinePlace | EventPointer;

/** On-disk trajectory: pointers and, during transition, inline places. */
export type Trajectory = z.infer<typeof trajectorySchema>;

/** One map station after a pointer has been expanded. Optional eventId is the overview dedupe key. */
export type TrajectoryPlace = (PlaceContext & TrajectoryTime) & { eventId?: string };

export type ResolvedTrajectory = {
	titleZh?: string;
	places: TrajectoryPlace[];
};

export function isEventPointer(station: { eventId?: unknown } | object): station is EventPointer {
	return 'eventId' in station && Boolean((station as { eventId?: unknown }).eventId);
}

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
		trajectory: trajectorySchema.optional(),
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

/** 磁盘上的 record.json：轨迹站还是原始形状。 */
export type RawRecordFile = z.infer<typeof recordSchema>;
export type IndexFile = z.infer<typeof indexSchema>;

/** parser 出口的 record.json：轨迹站已归一化，时间分支是 canonical union。 */
export type RecordFile = Omit<RawRecordFile, 'trajectory'> & {
	trajectory?: { titleZh?: string; places: TrajectoryStation[] };
};

/** A record.json plus its story, and whether it came from `records-legacy/`. Trajectory is canonical. */
export type ExportRecord = RecordFile & { story: string; legacy: boolean };

/** Same record after event pointers have been expanded into place-shaped stations. */
export type SiteExportRecord = Omit<ExportRecord, 'trajectory'> & {
	trajectory?: ResolvedTrajectory;
};

/** 大体已核 → partial；已核 → verified；其余 → pending. The label text is not rewritten. */
export function expectedVerification(statusLabel: string): 'verified' | 'partial' | 'pending' {
	if (statusLabel.startsWith('大体已核')) return 'partial';
	if (statusLabel.startsWith('已核')) return 'verified';
	return 'pending';
}

/** Drop a single leading Markdown H1. The tombstone already shows the title. */
export function storyBody(markdown: string): string {
	const text = markdown.replace(/^\uFEFF/, '').trim();
	return text.replace(/^#[ \t]+[^\n]*(?:\n+|$)/, '').trim();
}

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

/**
 * Pointer stations are `{ id, eventId, blurb? }`.
 * They must not carry coordinates, year, city, role, or a `{ personId, lifeRole }` sugar event.
 */
export function assertStationShape(data: unknown, file: string): void {
	if (!isPlainObject(data)) return;
	const trajectory = data.trajectory;
	if (!isPlainObject(trajectory) || !Array.isArray(trajectory.places)) return;
	trajectory.places.forEach((place, index) => {
		if (!isPlainObject(place)) return;
		const sugar =
			'lifeRole' in place || ('personId' in place && !('eventId' in place) && !('year' in place));
		if (sugar) {
			throw new Error(
				`${file} places.${index}: 轨迹站只能是 eventId 指针或过渡期内联地点，不能用 {personId, lifeRole} 合成默认事件。`,
			);
		}
		if (!('eventId' in place)) return;
		for (const key of POINTER_LOCKED_KEYS) {
			if (key in place) {
				throw new Error(`${file} places.${index}.${key}: 指针站只能另写 blurb，不能改写 ${key}。`);
			}
		}
	});
}

/**
 * 旧哨兵的时间候选清单：只列疑点，绝不改写。
 *
 * 命中的是「没有显式 unknown、却用占位标签冒充时间」的站。状态由证据裁定，
 * 不由 label 自动推导（合同 §3.2／§4）；迁移必须按 recordId + placeId 精准命中。
 */
export type SentinelTimeCandidate = {
	recordId: string;
	placeId: string;
	legacy: boolean;
	year: number | null;
	yearLabel: string;
};

export function auditSentinelTimes(
	records: readonly {
		id: string;
		legacy?: boolean;
		trajectory?: { places: readonly { id: string; timeStatus?: string; year?: number | null; yearLabel?: string }[] };
	}[],
): SentinelTimeCandidate[] {
	const out: SentinelTimeCandidate[] = [];
	for (const record of records) {
		for (const place of record.trajectory?.places ?? []) {
			const label = place.yearLabel?.trim();
			if (!label || !SENTINEL_TIME_LABELS.includes(label)) continue;
			if (place.timeStatus === 'unknown') continue;
			out.push({
				recordId: record.id,
				placeId: place.id,
				legacy: record.legacy === true,
				year: typeof place.year === 'number' ? place.year : null,
				yearLabel: label,
			});
		}
	}
	return out;
}

export function parseRecord(data: unknown, file = 'record.json'): RecordFile {
	assertStationShape(data, file);
	const parsed = parseWith(recordSchema, data, file);
	if (!parsed.trajectory) return parsed as unknown as RecordFile;
	const { trajectory, ...rest } = parsed;
	const out = {
		...rest,
		trajectory: {
			...(trajectory.titleZh === undefined ? {} : { titleZh: trajectory.titleZh }),
			places: trajectory.places.map((station) => canonicalStation(station as RawTrajectoryStation)) as TrajectoryStation[],
		},
	};
	return out as RecordFile;
}

function readJson(file: string): unknown {
	let text: string;
	try {
		text = readFileSync(file, 'utf8');
	} catch {
		throw new Error(`找不到 ${file}`);
	}
	try {
		return JSON.parse(text) as unknown;
	} catch {
		throw new Error(`无法解析 JSON：${file}`);
	}
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

function listRecordDirs(root: string): string[] {
	const recordsDir = join(root, 'records');
	if (!existsSync(recordsDir)) {
		throw new Error(`找不到记录目录 ${recordsDir}`);
	}
	const ids = readdirSync(recordsDir).filter((name) => statSync(join(recordsDir, name)).isDirectory());
	return ids.sort();
}

export type ExportOptions = {
	exportRoot?: string;
	legacyRoot?: string;
};

type Side = { root: string; legacy: boolean };

function loadSide(side: Side): ExportRecord[] {
	const indexFile = join(side.root, 'index.json');
	if (!existsSync(indexFile)) {
		throw new Error(`找不到 ${indexFile}`);
	}
	const index = parseIndex(readJson(indexFile), indexFile);
	const changelogFile = join(side.root, 'changelog.json');
	if (existsSync(changelogFile)) {
		parseChangelog(readJson(changelogFile), changelogFile);
	}
	const onDisk = listRecordDirs(side.root);
	const indexed = index.records.map((entry) => entry.id);
	const indexedSet = new Set(indexed);
	const diskSet = new Set(onDisk);
	for (const id of indexed) {
		if (!diskSet.has(id)) throw new Error(`${side.root} 的 index.json 列出了不存在的记录 ${id}`);
	}
	for (const id of onDisk) {
		if (!indexedSet.has(id)) throw new Error(`${side.root} 的记录 ${id} 不在 index.json 里`);
	}
	const out: ExportRecord[] = [];
	for (const entry of index.records) {
		const dir = join(side.root, 'records', entry.id);
		const recordFile = join(dir, 'record.json');
		const record = parseRecord(readJson(recordFile), recordFile);
		if (record.id !== entry.id) {
			throw new Error(`${recordFile} 的 id「${record.id}」与目录名 ${entry.id} 不一致`);
		}
		const storyFile = join(dir, 'story.md');
		if (!existsSync(storyFile)) throw new Error(`找不到 ${storyFile}`);
		const story = storyBody(readFileSync(storyFile, 'utf8'));
		if (!story) throw new Error(`${storyFile} 去掉标题后没有正文`);
		for (const rel of [...record.images.map((image) => image.file), ...record.details.map((detail) => detail.file)]) {
			const abs = resolveInside(dir, rel);
			if (!existsSync(abs)) throw new Error(`找不到图片 ${entry.id}/${rel}（${abs}）`);
		}
		out.push({ ...record, story, legacy: side.legacy });
	}
	return out;
}

/**
 * Read `records/` and, when it exists, `records-legacy/`. Every referenced
 * image must be on disk, and both sides use the same schema.
 */
export function loadRecordsExport(options: ExportOptions = {}): ExportRecord[] {
	const exportRoot = options.exportRoot ?? join(process.cwd(), 'records');
	const legacyRoot = options.legacyRoot ?? join(process.cwd(), 'records-legacy');
	const sides: Side[] = [{ root: exportRoot, legacy: false }];
	if (existsSync(join(legacyRoot, 'index.json'))) sides.push({ root: legacyRoot, legacy: true });
	const merged: ExportRecord[] = [];
	const seen = new Set<string>();
	for (const side of sides) {
		for (const record of loadSide(side)) {
			if (seen.has(record.id)) {
				throw new Error(`id ${record.id} 同时出现在馆员导出和遗留目录里`);
			}
			seen.add(record.id);
			merged.push(record);
		}
	}
	return merged;
}
