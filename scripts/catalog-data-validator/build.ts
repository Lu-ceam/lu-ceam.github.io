/**
 * Build layer: compare an explicitly supplied successful `dist/` with the same
 * source expectation. Never builds, never fixes.
 *
 * Real HTML parsing (parse5) rather than regex: the payload is an HTML
 * attribute holding escaped JSON, so the attribute must be decoded before
 * JSON.parse. One map root / chapter container per page is counted once.
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { parse, type DefaultTreeAdapterMap } from 'parse5';
import type { BuildRecordReport, Finding, NotChecked, RecordExpectation } from './report.ts';
import { normalizeText, sha256Hex } from './report.ts';

type Node = DefaultTreeAdapterMap['node'];
type Element = DefaultTreeAdapterMap['element'];

function isElement(node: Node): node is Element {
	return 'tagName' in node;
}

function attr(node: Element, name: string): string | undefined {
	return node.attrs.find((entry) => entry.name === name)?.value;
}

function hasAttr(node: Element, name: string): boolean {
	return node.attrs.some((entry) => entry.name === name);
}

function walk(node: Node, visit: (element: Element) => void): void {
	if (isElement(node)) visit(node);
	const children = 'childNodes' in node ? node.childNodes : [];
	for (const child of children) walk(child as Node, visit);
}

function textOf(node: Node): string {
	let out = '';
	const collect = (current: Node): void => {
		if ('value' in current && typeof (current as { value?: unknown }).value === 'string') {
			out += (current as { value: string }).value;
		}
		const children = 'childNodes' in current ? current.childNodes : [];
		for (const child of children) collect(child as Node);
	};
	collect(node);
	return out;
}

export type PageFacts = {
	chapters: Array<{ key: string; mode: string }>;
	navLabels: string[];
	storyParagraphs: string[];
	notes: Array<{ term: string; value: string }>;
	payload: {
		mode: string | null;
		discs: Array<{ id: string; places: Array<{ id: string; year: number | null }> }>;
	} | null;
	payloadSha256: string | null;
	hasChapterShell: boolean;
	mapRoots: number;
	chapterShells: number;
};

/** Read the production page facts from a disc page. */
export function readPage(html: string): PageFacts {
	const document = parse(html);
	const chapters: Array<{ key: string; mode: string }> = [];
	const navLabels: string[] = [];
	const storyParagraphs: string[] = [];
	const notes: Array<{ term: string; value: string }> = [];
	let shell: Element | null = null;
	let mapRoot: Element | null = null;
	let chapterShells = 0;
	let mapRoots = 0;

	walk(document, (element) => {
		if (hasAttr(element, 'data-disc-chapters')) {
			chapterShells += 1;
			if (!shell) shell = element;
		}
		if (hasAttr(element, 'data-traj-root')) {
			mapRoots += 1;
			if (!mapRoot) mapRoot = element;
		}
	});
	if (shell) {
		const container: Element = shell;
		walk(container, (element) => {
			if (hasAttr(element, 'data-chapter-kind')) {
				chapters.push({ key: attr(element, 'data-chapter-kind') ?? '', mode: attr(element, 'data-chapter-mode') ?? '' });
			}
			if (hasAttr(element, 'data-chapter-goto')) navLabels.push(normalizeText(textOf(element)));
			if (element.tagName === 'p' && (attr(element, 'class') ?? '').split(/\s+/).includes('disc-chapter-text')) {
				storyParagraphs.push(normalizeText(textOf(element)));
			}
			if (element.tagName === 'dt') notes.push({ term: normalizeText(textOf(element)), value: '' });
			if (element.tagName === 'dd') {
				const last = notes.at(-1);
				if (last && last.value === '') last.value = normalizeText(textOf(element));
			}
		});
	}

	let payload: PageFacts['payload'] = null;
	let payloadSha256: string | null = null;
	if (mapRoot) {
		const raw = attr(mapRoot, 'data-payload');
		if (raw === undefined) {
			payload = null;
		} else {
			payloadSha256 = sha256Hex(raw);
			try {
				const parsed = JSON.parse(raw) as { mode?: unknown; discs?: unknown };
				const discs = Array.isArray(parsed.discs)
					? parsed.discs.map((disc) => {
							const entry = disc as { id?: unknown; places?: unknown };
							const places = Array.isArray(entry.places)
								? entry.places.map((place) => {
										const station = place as { id?: unknown; year?: unknown };
										return {
											id: typeof station.id === 'string' ? station.id : '',
											year: typeof station.year === 'number' ? station.year : null,
										};
									})
								: [];
							return { id: typeof entry.id === 'string' ? entry.id : '', places };
						})
					: [];
				payload = { mode: typeof parsed.mode === 'string' ? parsed.mode : null, discs };
			} catch {
				payload = null;
			}
		}
	}

	return {
		chapters,
		navLabels,
		storyParagraphs,
		notes: notes.filter((entry) => entry.value !== '' || entry.term !== ''),
		payload,
		payloadSha256,
		hasChapterShell: chapterShells > 0,
		mapRoots,
		chapterShells,
	};
}

export type SourceFreshness = {
	/** Newest mtime among the source inputs that the page is built from. */
	newestSourceMs: number;
	files: string[];
};

export type BuildContext = {
	distRoot: string;
	repoRoot: string;
	freshness: Map<string, SourceFreshness>;
	layoutPath: string;
};

export type BuildResult = {
	/** id → build report */
	byId: Map<string, BuildRecordReport>;
	findings: Finding[];
	notChecked: NotChecked[];
	overview: { expectedIds: string[]; actualIds: string[]; present: boolean };
	distIndex: { present: boolean; detail: string };
};

function buildFinding(partial: Omit<Finding, 'key' | 'baselineId'>): Finding {
	return { key: '', baselineId: null, ...partial };
}

/**
 * Provenance: the page must be at least as new as every source input, otherwise
 * it is a stale dist and the comparison is an input problem (exit 2), not a
 * content-missing conclusion.
 */
export function pageProvenance(freshness: SourceFreshness | undefined, pagePath: string): 'ok' | 'stale' | 'unknown' {
	if (!freshness) return 'unknown';
	if (!existsSync(pagePath)) return 'unknown';
	const pageMs = statSync(pagePath).mtimeMs;
	return pageMs >= freshness.newestSourceMs ? 'ok' : 'stale';
}

export function compareBuild(
	source: Array<{ id: string; expect: RecordExpectation | null; findings: Finding[] }>,
	ctx: BuildContext,
): BuildResult {
	const findings: Finding[] = [];
	const notChecked: NotChecked[] = [];
	const byId = new Map<string, BuildRecordReport>();
	const distIndexPath = join(ctx.distRoot, 'records');
	const distIndex = { present: existsSync(distIndexPath), detail: relative(ctx.repoRoot, distIndexPath) };

	for (const entry of source) {
		const routeDir = join(ctx.distRoot, 'records', entry.id);
		const pagePath = join(routeDir, 'index.html');
		const present = existsSync(pagePath);
		const expectation = entry.expect;
		const provenance = pageProvenance(ctx.freshness.get(entry.id), pagePath);
		const report: BuildRecordReport = {
			route: `/records/${entry.id}/`,
			present,
			provenance,
			chapters: [],
			expectedChapters: expectation?.chapters.map((chapter) => chapter.key) ?? [],
			navLabels: [],
			storyParagraphs: { expected: expectation?.storyParagraphs.length ?? 0, actual: null, match: null },
			notesFields: { expected: expectation?.notesFields.length ?? 0, actual: null, match: null },
			mapStations: { expected: expectation?.mapStations.length ?? 0, actual: null, match: null },
			assets: { expected: expectation?.assets?.length ?? 0, missing: [] },
			pageSha256: null,
			payloadSha256: null,
		};
		byId.set(entry.id, report);

		if (!present) {
			findings.push(
				buildFinding({
					code: 'BUILD_ROUTE_MISSING',
					severity: 'error',
					layer: 'build',
					status: 'active',
					recordId: entry.id,
					fieldPath: `dist/records/${entry.id}/index.html`,
					stationId: null,
					expected: { route: report.route, present: true },
					actual: { present: false },
					reason: '源里有该盘，显式 build 产物里没有对应路由',
					recommendation: '用同一提交重新 build；校验器不自动 build、也不把缺盘当跳过',
					evidence: [relative(ctx.repoRoot, pagePath)],
				}),
			);
			continue;
		}
		const html = readFileSync(pagePath, 'utf8');
		report.pageSha256 = sha256Hex(html);
		const page = readPage(html);
		report.chapters = page.chapters.map((chapter) => chapter.key);
		report.navLabels = page.navLabels;
		report.payloadSha256 = page.payloadSha256;
		report.storyParagraphs.actual = page.storyParagraphs.length;
		report.notesFields.actual = page.notes.length;
		report.mapStations.actual = page.payload?.discs?.[0]?.places.length ?? (page.mapRoots > 0 ? 0 : null);

		if (provenance === 'stale') {
			findings.push(
				buildFinding({
					code: 'BUILD_STALE',
					severity: 'error',
					layer: 'build',
					status: 'active',
					recordId: entry.id,
					fieldPath: `dist/records/${entry.id}/index.html`,
					stationId: null,
					expected: { pageNewerThanSource: true },
					actual: { provenance: 'stale', newestSourceMs: ctx.freshness.get(entry.id)?.newestSourceMs ?? null },
					reason: '构建产物早于源文件，属于旧 dist，不能冒充当前 build',
					recommendation: '在同一提交重新 build 后重跑；stale dist 是输入问题（exit 2），不是内容缺失',
					evidence: ctx.freshness.get(entry.id)?.files ?? [],
				}),
			);
			continue;
		}
		if (provenance === 'unknown') {
			notChecked.push({
				code: 'BUILD_PROVENANCE_UNKNOWN',
				layer: 'build',
				recordId: entry.id,
				fieldPath: `dist/records/${entry.id}/index.html`,
				reason: '无法取得源/产物时间或指纹关联',
				dependency: null,
			});
		}

		if (page.chapterShells > 1) {
			findings.push(
				buildFinding({
					code: 'BUILD_DUPLICATE_CHAPTER_SHELL',
					severity: 'error',
					layer: 'build',
					status: 'active',
					recordId: entry.id,
					fieldPath: 'dist HTML [data-disc-chapters]',
					stationId: null,
					expected: { shells: 1 },
					actual: { shells: page.chapterShells },
					reason: '同一页面出现多个章节容器，不能把它当成多份内容',
					recommendation: '检查页面模板重复渲染',
					evidence: [relative(ctx.repoRoot, pagePath)],
				}),
			);
		}
		if (page.mapRoots > 1) {
			findings.push(
				buildFinding({
					code: 'BUILD_DUPLICATE_MAP_ROOT',
					severity: 'error',
					layer: 'build',
					status: 'active',
					recordId: entry.id,
					fieldPath: 'dist HTML [data-traj-root]',
					stationId: null,
					expected: { mapRoots: 1 },
					actual: { mapRoots: page.mapRoots },
					reason: '同一地图 root/章容器被重复计数会虚增站点',
					recommendation: '检查页面模板；同一 root 不是两份站',
					evidence: [relative(ctx.repoRoot, pagePath)],
				}),
			);
		}

		if (!expectation) {
			notChecked.push({
				code: 'BUILD_EXPECTATION_UNAVAILABLE',
				layer: 'build',
				recordId: entry.id,
				fieldPath: 'expectation',
				reason: '源期望未生成（源层 blocked），不能声称 build 层通过',
				dependency: 'source',
			});
			continue;
		}

		// The production page renders the chapter shell only when a reveal image exists.
		if (expectation.hasChapterShell !== page.hasChapterShell) {
			findings.push(
				buildFinding({
					code: expectation.hasChapterShell ? 'BUILD_CHAPTER_SHELL_MISSING' : 'BUILD_CHAPTER_SHELL_UNEXPECTED',
					severity: 'error',
					layer: 'build',
					status: 'active',
					recordId: entry.id,
					fieldPath: 'data-disc-chapters',
					stationId: null,
					expected: { chapterShell: expectation.hasChapterShell },
					actual: { chapterShell: page.hasChapterShell },
					reason: expectation.hasChapterShell
						? '源有可展示的 reveal 图像，产物却没有章节容器'
						: '源没有 reveal 图像，产物却渲染了章节容器',
					recommendation: '按 hasReveal 决定章节容器；无 reveal 的盘不渲染空壳',
					evidence: [relative(ctx.repoRoot, pagePath)],
				}),
			);
		}

		// Chapter kinds and nav.
		const expectedKeys = expectation.hasChapterShell
			? expectation.chapters.map((chapter) => chapter.key)
			: [];
		if (JSON.stringify(page.chapters.map((chapter) => chapter.key)) !== JSON.stringify(expectedKeys)) {
			findings.push(
				buildFinding({
					code: 'BUILD_CHAPTER_SET_MISMATCH',
					severity: 'error',
					layer: 'build',
					status: 'active',
					recordId: entry.id,
					fieldPath: 'data-chapter-kind',
					stationId: null,
					expected: { chapters: expectedKeys },
					actual: { chapters: page.chapters.map((chapter) => chapter.key) },
					reason: '生产页面的章节序列与源期望不一致（缺章/多章/顺序不符）',
					recommendation: '检查 buildDiscChapters 输入与页面章节组装；不要靠 Pagefind/隐藏模板通过',
					evidence: [relative(ctx.repoRoot, pagePath)],
				}),
			);
		}
		const expectedNav = expectation.hasChapterShell
			? expectation.chapters.map((chapter) => chapter.label)
			: [];
		if (JSON.stringify(page.navLabels) !== JSON.stringify(expectedNav)) {
			findings.push(
				buildFinding({
					code: 'BUILD_CHAPTER_NAV_MISMATCH',
					severity: 'error',
					layer: 'build',
					status: 'active',
					recordId: entry.id,
					fieldPath: 'data-chapter-goto',
					stationId: null,
					expected: { labels: expectedNav },
					actual: { labels: page.navLabels },
					reason: '章节导航与真实章节表不一致（导航指错/少一章）',
					recommendation: '让导航直接由章表渲染；不要手写标签',
					evidence: [relative(ctx.repoRoot, pagePath)],
				}),
			);
		}

		// Story paragraphs: order-sensitive, whitespace-normalized sequence.
		const expectedParagraphs = expectation.hasChapterShell ? expectation.storyParagraphs.map(normalizeText) : [];
		report.storyParagraphs.match = JSON.stringify(page.storyParagraphs) === JSON.stringify(expectedParagraphs);
		if (!report.storyParagraphs.match) {
			const firstDiff = firstDifference(expectedParagraphs, page.storyParagraphs);
			findings.push(
				buildFinding({
					code: 'BUILD_STORY_PARAGRAPH_MISMATCH',
					severity: 'error',
					layer: 'build',
					status: 'active',
					recordId: entry.id,
					fieldPath: 'data-chapter-prose p.disc-chapter-text',
					stationId: null,
					expected: { paragraphs: expectedParagraphs.length, fingerprint: sha256Hex(expectedParagraphs.join('\u0000')) },
					actual: { paragraphs: page.storyParagraphs.length, fingerprint: sha256Hex(page.storyParagraphs.join('\u0000')), firstDiff },
					reason: '述语正文没有按源叙事顺序完整送达（截断/丢段/重复渲染）',
					recommendation: '检查章节组装与正文规范化；源有章而产物缺章/丢段是硬失败',
					evidence: [relative(ctx.repoRoot, pagePath)],
				}),
			);
		}

		// Notes fields with real show conditions.
		const expectedNotes = expectation.hasChapterShell
			? expectation.notesFields.map((field) => ({ term: normalizeText(field.term), value: normalizeText(field.value) }))
			: [];
		report.notesFields.match = JSON.stringify(page.notes) === JSON.stringify(expectedNotes);
		if (!report.notesFields.match) {
			findings.push(
				buildFinding({
					code: 'BUILD_NOTES_FIELD_MISMATCH',
					severity: 'error',
					layer: 'build',
					status: 'active',
					recordId: entry.id,
					fieldPath: 'dl[data-chapter-list]',
					stationId: null,
					expected: { fields: expectedNotes },
					actual: { fields: page.notes },
					reason: expectation.notesConditionsAvailable
						? '资料章字段与 discNotesFields + 真实 showMatrix/showPressing 条件不一致'
						: '生产 notes 条件模型不可用，无法确认该页字段集合',
					recommendation: '按 discNotesFields 的条件渲染；条件隐藏记 expected-difference，不把所有 raw 字段塞进 notes',
					evidence: [relative(ctx.repoRoot, pagePath)],
				}),
			);
		}

		// Map chapter and payload stations.
		const hasMapChapter = page.chapters.some((chapter) => chapter.key === 'map');
		if (expectation.hasTrajectory !== hasMapChapter) {
			findings.push(
				buildFinding({
					code: expectation.hasTrajectory ? 'BUILD_MAP_CHAPTER_MISSING' : 'BUILD_MAP_CHAPTER_UNEXPECTED',
					severity: 'error',
					layer: 'build',
					status: 'active',
					recordId: entry.id,
					fieldPath: 'chapters[map]',
					stationId: null,
					expected: { mapChapter: expectation.hasTrajectory },
					actual: { mapChapter: hasMapChapter },
					reason: expectation.hasTrajectory ? '源有轨迹但产物没有地图章' : '源没有轨迹但产物出现地图章',
					recommendation: '让章表按 hasMap 生成；无地图合法，有图缺章不合法',
					evidence: [relative(ctx.repoRoot, pagePath)],
				}),
			);
		}
		if (expectation.hasTrajectory && !expectation.mapStationsAvailable) {
			notChecked.push({
				code: 'BUILD_MAP_EXPECTATION_BLOCKED',
				layer: 'build',
				recordId: entry.id,
				fieldPath: 'data-payload.discs[].places',
				reason: '源轨迹展开被 blocked，无法与 build 站点集合对照；不伪造通过',
				dependency: 'trajectory-expansion',
			});
		}
		if (expectation.hasTrajectory && expectation.mapStationsAvailable) {
			if (!page.payload) {
				findings.push(
					buildFinding({
						code: 'BUILD_PAYLOAD_INVALID',
						severity: 'error',
						layer: 'build',
						status: 'active',
						recordId: entry.id,
						fieldPath: 'data-payload',
						stationId: null,
						expected: { parseablePayload: true },
						actual: { parseable: false },
						reason: '地图 payload 缺失或不是合法 JSON（须先做 HTML 属性解码）',
						recommendation: '检查 TrajectoryMap data-payload 序列化',
						evidence: [relative(ctx.repoRoot, pagePath)],
					}),
				);
			} else {
				const discs = page.payload.discs;
				const expectedStations = expectation.mapStations;
				const actualDisc = discs.find((disc) => disc.id === entry.id);
				const actualStations = actualDisc?.places ?? [];
				report.mapStations.expected = expectedStations.length;
				report.mapStations.actual = actualStations.length;
				const same =
					actualDisc !== undefined &&
					JSON.stringify(actualStations.map((station) => station.id)) ===
						JSON.stringify(expectedStations.map((station) => station.id)) &&
					JSON.stringify(actualStations.map((station) => station.year)) ===
						JSON.stringify(expectedStations.map((station) => station.year));
				report.mapStations.match = same;
				if (!same) {
					findings.push(
						buildFinding({
							code: 'BUILD_MAP_STATIONS_MISMATCH',
							severity: 'error',
							layer: 'build',
							status: 'active',
							recordId: entry.id,
							fieldPath: 'data-payload.discs[].places',
							stationId: null,
							expected: { stations: expectedStations.map((station) => `${station.id}@${station.year ?? 'null'}`) },
							actual: { stations: actualStations.map((station) => `${station.id}@${station.year ?? 'null'}`) },
							reason: 'build 站点集合/顺序/年份与源展开结果不一致（例如丢站或 unknown 变 1982）',
							recommendation: '按展开后的源站点渲染；用站 id 集合对照，不只比数量',
							evidence: [relative(ctx.repoRoot, pagePath)],
						}),
					);
				}
			}
		}

		// Derived assets.
		if (expectation.assets) {
			const missing = expectation.assets
				.map((src) => src.replace(/^\//, ''))
				.filter((rel) => !existsSync(join(ctx.distRoot, rel)));
			report.assets = { expected: expectation.assets.length, missing };
			if (missing.length > 0) {
				findings.push(
					buildFinding({
						code: 'BUILD_ASSET_MISSING',
						severity: 'error',
						layer: 'build',
						status: 'active',
						recordId: entry.id,
						fieldPath: 'dist assets',
						stationId: null,
						expected: { assets: expectation.assets.length },
						actual: { missing },
						reason: '源里有应渲染的派生资产，build 产物里缺失（合同规定不渲染的 runout 不在期望里）',
						recommendation: '按 layout 合并结果产出 plate/upright；不要把源与网页计数不等当失败',
						evidence: missing.map((rel) => `dist/${rel}`),
					}),
				);
			}
		}
	}

	// Overview page: the 22/26 split must be dynamic.
	const overviewPath = join(ctx.distRoot, 'records', 'map', 'index.html');
	const expectedTrajectoryIds = source.filter((entry) => entry.expect?.hasTrajectory).map((entry) => entry.id);
	const overview: BuildResult['overview'] = { expectedIds: expectedTrajectoryIds, actualIds: [], present: existsSync(overviewPath) };
	if (overview.present) {
		const page = readPage(readFileSync(overviewPath, 'utf8'));
		overview.actualIds = page.payload?.discs.map((disc) => disc.id) ?? [];
	} else {
		findings.push(
			buildFinding({
				code: 'BUILD_OVERVIEW_MISSING',
				severity: 'error',
				layer: 'build',
				status: 'active',
				recordId: null,
				fieldPath: 'dist/records/map/index.html',
				stationId: null,
				expected: { present: true },
				actual: { present: false },
				reason: '显式 build 产物里没有 /records/map/ 总览页',
				recommendation: '在同一提交重新 build',
				evidence: [relative(ctx.repoRoot, overviewPath)],
			}),
		);
	}
	const sameOverview =
		JSON.stringify([...overview.actualIds].sort()) === JSON.stringify([...expectedTrajectoryIds].sort());
	if (overview.present && !sameOverview) {
		findings.push(
			buildFinding({
				code: 'BUILD_OVERVIEW_DISC_SET_MISMATCH',
				severity: 'error',
				layer: 'build',
				status: 'active',
				recordId: null,
				fieldPath: 'dist/records/map/index.html data-payload',
				stationId: null,
				expected: { discs: [...expectedTrajectoryIds].sort() },
				actual: { discs: [...overview.actualIds].sort() },
				reason: '总览页收录的唱片集合与源轨迹集合不一致（动态全集，不是固定 22）',
				recommendation: '按 records 的 trajectory 动态生成总览；不要锁死旧数量',
				evidence: [relative(ctx.repoRoot, overviewPath)],
			}),
		);
	}

	return { byId, findings, notChecked, overview, distIndex };
}

function firstDifference(expected: string[], actual: string[]): Record<string, unknown> | null {
	const max = Math.max(expected.length, actual.length);
	for (let index = 0; index < max; index += 1) {
		if (expected[index] !== actual[index]) {
			return {
				index,
				expectedPrefix: expected[index]?.slice(0, 80) ?? null,
				actualPrefix: actual[index]?.slice(0, 80) ?? null,
			};
		}
	}
	return null;
}

/** Newest source mtime per record, including index and layout entry timestamps. */
export function sourceFreshness(
	rows: Array<{ id: string; root: string; recordPath: string; storyPath: string }>,
	layoutPath: string,
): Map<string, SourceFreshness> {
	const layoutMs = existsSync(layoutPath) ? statSync(layoutPath).mtimeMs : 0;
	const out = new Map<string, SourceFreshness>();
	for (const row of rows) {
		const files: string[] = [];
		let newest = layoutMs;
		for (const file of [join(row.root, 'index.json'), row.recordPath, row.storyPath, layoutPath]) {
			if (!existsSync(file)) continue;
			const ms = statSync(file).mtimeMs;
			if (ms > newest) newest = ms;
			files.push(file);
		}
		out.set(row.id, { newestSourceMs: newest, files });
	}
	return out;
}
