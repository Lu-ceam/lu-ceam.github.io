/**
 * Build layer: compare an explicitly supplied successful `dist/` with the same
 * source expectation. Never builds, never fixes.
 *
 * Real HTML parsing (parse5) rather than regex: the payload is an HTML
 * attribute holding escaped JSON, so the attribute must be decoded before
 * JSON.parse. One map root / chapter container per page is counted once.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
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

/** A delivered station: the real record shape plus a normalized id/year view. */
export type MapPlace = Record<string, unknown> & { id: string; year: number | null };

/** One `<img>` the page actually renders. */
export type PageImage = {
	src: string;
	width: number | null;
	height: number | null;
	crop: { x: number; y: number; w: number; h: number } | null;
	/** Which figure it belongs to, from the enclosing `[data-part]`/`[data-mode]`. */
	part: string | null;
	mode: string | null;
};

export type PageFacts = {
	chapters: Array<{ key: string; mode: string; label: string }>;
	images: PageImage[];
	navLabels: string[];
	/** `data-chapter-goto` values in DOM order; -1 when the value is not an index. */
	navTargets: number[];
	storyParagraphs: string[];
	notes: Array<{ term: string; value: string }>;
	payload: {
		mode: string | null;
		discs: Array<{ id: string; places: MapPlace[] }>;
	} | null;
	payloadSha256: string | null;
	hasChapterShell: boolean;
	mapRoots: number;
	chapterShells: number;
};

/** Read the production page facts from a disc page. */
export function readPage(html: string): PageFacts {
	const document = parse(html);
	const chapters: Array<{ key: string; mode: string; label: string }> = [];
	const navLabels: string[] = [];
	const navTargets: number[] = [];
	const storyParagraphs: string[] = [];
	const notes: Array<{ term: string; value: string }> = [];
	const images: PageImage[] = [];
	let shell: Element | null = null;
	let mapRoot: Element | null = null;
	let chapterShells = 0;
	let mapRoots = 0;

	walk(document, (element) => {
		if (element.tagName === 'img') {
			const src = attr(element, 'src');
			if (src !== undefined && src.trim() !== '') {
				const num = (name: string): number | null => {
					const raw = attr(element, name);
					if (raw === undefined || !/^-?\d+$/.test(raw.trim())) return null;
					return Number(raw);
				};
				const crop = {
					x: num('data-crop-x'),
					y: num('data-crop-y'),
					w: num('data-crop-w'),
					h: num('data-crop-h'),
				};
				images.push({
					src,
					width: num('width'),
					height: num('height'),
					crop: crop.x === null || crop.y === null || crop.w === null || crop.h === null ? null : (crop as { x: number; y: number; w: number; h: number }),
					part: null,
					mode: null,
				});
			}
		}
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
				chapters.push({
					key: attr(element, 'data-chapter-kind') ?? '',
					mode: attr(element, 'data-chapter-mode') ?? '',
					label: normalizeText(attr(element, 'aria-label') ?? ''),
				});
			}
			if (hasAttr(element, 'data-chapter-goto')) {
				navLabels.push(normalizeText(textOf(element)));
				// The real reader treats the value as the pane index; anything that is
				// not a plain integer cannot address a chapter, so it is recorded as -1.
				const raw = (attr(element, 'data-chapter-goto') ?? '').trim();
				navTargets.push(/^\d+$/.test(raw) ? Number(raw) : -1);
			}
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
							const places: MapPlace[] = Array.isArray(entry.places)
								? entry.places.map((place) => {
										const station = (place && typeof place === 'object' ? place : {}) as Record<string, unknown>;
										// Keep every delivered field: the payload is plain JSON, so the
										// real expanded place (coords, blurb, yearLabel, eventId…) is
										// comparable instead of being reduced to id/year.
										return {
											...station,
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
		images,
		navLabels,
		navTargets,
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
	/**
	 * Verdict from the build receipt (see `receipt.ts`). When present it *is* the
	 * provenance: mtimes are never accepted as proof, so a touched/copied old dist
	 * cannot pass. Unit fixtures may omit it and fall back to the mtime hint.
	 */
	provenance?: { status: 'ok' | 'unverified' | 'foreign' | 'stale'; reason: string };
};

export type BuildResult = {
	/** id → build report */
	byId: Map<string, BuildRecordReport>;
	findings: Finding[];
	notChecked: NotChecked[];
	overview: { expectedIds: string[]; actualIds: string[]; present: boolean };
	distIndex: { present: boolean; detail: string };
	/** Dynamic disc-route diff, both directions. */
	routes: { expected: string[]; actual: string[]; missing: string[]; extra: string[]; ignored: string[] };
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
		const provenance = ctx.provenance ? ctx.provenance.status : pageProvenance(ctx.freshness.get(entry.id), pagePath);
		const report: BuildRecordReport = {
			route: `/records/${entry.id}/`,
			present,
			provenance,
			chapters: [],
			expectedChapters: expectation?.chapters.map((chapter) => chapter.key) ?? [],
			navLabels: [],
			navTargets: [],
			navTargetsMatch: null,
			storyParagraphs: { expected: expectation?.storyParagraphs.length ?? 0, actual: null, match: null },
			notesFields: { expected: expectation?.notesFields.length ?? 0, actual: null, match: null },
			mapStations: { expected: expectation?.mapStations.length ?? 0, actual: null, match: null },
			mapPlaceFields: { checked: 0, mismatch: 0 },
			assets: { expected: expectation?.assets?.length ?? 0, missing: [] },
			images: { expected: 0, rendered: 0, missing: [], unexpected: [] },
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
		if (provenance === 'unverified' || provenance === 'foreign') {
			notChecked.push({
				code: 'BUILD_PROVENANCE_UNVERIFIED',
				layer: 'build',
				recordId: entry.id,
				fieldPath: `dist/records/${entry.id}/index.html`,
				reason: ctx.provenance?.reason ?? 'build receipt could not be verified',
				dependency: 'build-receipt',
			});
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
		const expectedChapterLabels = expectation.hasChapterShell
			? expectation.chapters.map((chapter) => normalizeText(chapter.label))
			: [];
		// The kind sequence and the per-pane accessible label both have to match:
		// a chapter section whose aria-label is another chapter's name is the wrong
		// chapter, even when the kind list looks right.
		const actualChapterLabels = page.chapters.map((chapter) => chapter.label);
		const chapterLabelsOk =
			actualChapterLabels.length === expectedChapterLabels.length &&
			actualChapterLabels.every((label, index) => label === '' || label === expectedChapterLabels[index]);
		if (
			JSON.stringify(page.chapters.map((chapter) => chapter.key)) !== JSON.stringify(expectedKeys) ||
			!chapterLabelsOk
		) {
			findings.push(
				buildFinding({
					code: 'BUILD_CHAPTER_SET_MISMATCH',
					severity: 'error',
					layer: 'build',
					status: 'active',
					recordId: entry.id,
					fieldPath: 'data-chapter-kind',
					stationId: null,
					expected: { chapters: expectedKeys, labels: expectedChapterLabels },
					actual: { chapters: page.chapters.map((chapter) => chapter.key), labels: actualChapterLabels },
					reason: '生产页面的章节序列与源期望不一致（缺章/多章/顺序不符）',
					recommendation: '检查 buildDiscChapters 输入与页面章节组装；不要靠 Pagefind/隐藏模板通过',
					evidence: [relative(ctx.repoRoot, pagePath)],
				}),
			);
		}
		const expectedNav = expectation.hasChapterShell
			? expectation.chapters.map((chapter) => chapter.label)
			: [];
		// A nav button is only correct when its label matches AND its
		// `data-chapter-goto` index resolves to the chapter pane in the same DOM
		// position, i.e. `[data-chapter]` #i really is expected chapter #i.
		report.navTargets = page.navTargets;
		const expectedTargets = expectation.hasChapterShell ? expectedKeys.map((_key, index) => index) : [];
		const navTargetsOk =
			page.navTargets.length === expectedTargets.length &&
			page.navTargets.every((target, index) => target === expectedTargets[index]);
		const navLabelsOk = JSON.stringify(page.navLabels) === JSON.stringify(expectedNav);
		report.navTargetsMatch = navTargetsOk && navLabelsOk;
		if (!navLabelsOk || !navTargetsOk) {
			findings.push(
				buildFinding({
					code: 'BUILD_CHAPTER_NAV_MISMATCH',
					severity: 'error',
					layer: 'build',
					status: 'active',
					recordId: entry.id,
					fieldPath: 'data-chapter-goto',
					stationId: null,
					expected: { labels: expectedNav, targets: expectedTargets },
					actual: { labels: page.navLabels, targets: page.navTargets },
					reason: navLabelsOk
						? '章节导航的目标索引没有绑定到对应章（标签对但点了跳到别的章/越界）'
						: '章节导航与真实章节表不一致（导航指错/少一章）',
					recommendation: '让导航直接由章表渲染：第 i 个按钮的 data-chapter-goto 必须指向第 i 个 data-chapter 节',
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
				// Field-level semantics: coordinates, role, city, blurb, yearLabel and
				// eventId must be delivered unchanged. id/year alone can hide a wrong
				// place, a lost caption or a degraded unknown/date label.
				const fieldDiffs = compareMapPlaces(expectation.mapPlaces, actualStations);
				report.mapPlaceFields = { checked: expectation.mapPlaces.length, mismatch: fieldDiffs.length };
				if (fieldDiffs.length > 0 && actualDisc !== undefined) {
					findings.push(
						buildFinding({
							code: 'BUILD_MAP_PLACE_FIELD_MISMATCH',
							severity: 'error',
							layer: 'build',
							status: 'active',
							recordId: entry.id,
							fieldPath: 'data-payload.discs[].places[]',
							stationId: actualStations[fieldDiffs[0]!.index]?.id ?? null,
							expected: { places: expectation.mapPlaces.length, fields: MAP_PLACE_FIELDS },
							actual: { mismatched: fieldDiffs },
							reason:
								'地图站点只送到 id/year 不够：坐标、角色、城市、旁注、yearLabel 或 eventId 与展开后的源记录不一致（含 d37779/utrecht 的占位年标签）',
							recommendation:
								'让 TrajectoryMap 使用展开后的 place 原样序列化；不要把未知/日期标签降成裸年，也不要改写旁注或坐标',
							evidence: [relative(ctx.repoRoot, pagePath)],
						}),
					);
				}
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

		// Display images: the page must reference the layout-derived rasters with
		// their real geometry. A file existing in `dist` is not delivery.
		if (expectation.images) {
			const mapping = expectation.images;
			const bySrc = new Map<string, PageImage[]>();
			for (const image of page.images) {
				const list = bySrc.get(image.src) ?? [];
				list.push(image);
				bySrc.set(image.src, list);
			}
			const missing: string[] = [];
			const cropDiffs: Array<{ src: string; part: string; fields: string[] }> = [];
			let rendered = 0;
			const requireImage = (
				expectedSrc: string,
				part: string,
				width: number,
				height: number,
				crop: { x: number; y: number; w: number; h: number } | null,
			): void => {
				const hits = bySrc.get(expectedSrc) ?? [];
				if (hits.length === 0) {
					missing.push(expectedSrc);
					return;
				}
				rendered += 1;
				if (crop === null) return;
				// A cropped upright must carry the exact crop; other occurrences of the
				// same raster (the un-cropped fill layer) are allowed to omit it.
				const cropped = hits.filter((hit) => hit.crop !== null);
				if (cropped.length === 0) {
					cropDiffs.push({ src: expectedSrc, part, fields: ['crop'] });
					return;
				}
				const ok = cropped.some(
					(hit) =>
						hit.crop!.x === crop.x &&
						hit.crop!.y === crop.y &&
						hit.crop!.w === crop.w &&
						hit.crop!.h === crop.h &&
						(hit.width === null || hit.width === width) &&
						(hit.height === null || hit.height === height),
				);
				if (!ok) {
					const fields: string[] = [];
					if (!cropped.some((hit) => hit.crop!.x === crop.x)) fields.push('x');
					if (!cropped.some((hit) => hit.crop!.y === crop.y)) fields.push('y');
					if (!cropped.some((hit) => hit.crop!.w === crop.w)) fields.push('w');
					if (!cropped.some((hit) => hit.crop!.h === crop.h)) fields.push('h');
					if (fields.length === 0) fields.push('width');
					cropDiffs.push({ src: expectedSrc, part, fields });
				}
			};

			if (mapping.hero) requireImage(mapping.hero.src, 'hero', mapping.hero.width, mapping.hero.height, null);
			for (const detail of mapping.details) {
				requireImage(detail.plate.src, detail.part, detail.plate.width, detail.plate.height, null);
				if (detail.upright) {
					requireImage(
						detail.upright.src,
						detail.part,
						detail.upright.width,
						detail.upright.height,
						detail.upright.crop,
					);
				}
			}

			// Sources the page uses under this record's own route that the layout never
			// produced (e.g. a hand-written replacement) are a delivery difference.
			const known = new Set<string>();
			if (mapping.hero) known.add(mapping.hero.src);
			for (const detail of mapping.details) {
				known.add(detail.plate.src);
				// An upright for a non-reveal detail is exported but never rendered, so it
				// is legal to reference but not required. Do not flag it either way.
			}
			const recordPrefix = `/records/${entry.id}/`;
			const unexpected = [
				...new Set(
					page.images
						.map((image) => image.src)
						.filter((src) => src.startsWith(recordPrefix) && !src.endsWith('.svg') && !known.has(src))
						.filter((src) => !mapping.details.some((detail) => detail.upright?.src === src)),
				),
			].sort();

			report.images = { expected: rendered + missing.length, rendered, missing, unexpected };
			if (missing.length > 0) {
				findings.push(
					buildFinding({
						code: 'BUILD_IMAGE_NOT_RENDERED',
						severity: 'error',
						layer: 'build',
						status: 'active',
						recordId: entry.id,
						fieldPath: 'img[src]',
						stationId: null,
						expected: { rendered: rendered + missing.length },
						actual: { rendered, missing },
						reason: '源/版式要求展示的图片没有真正挂在页面上（资源文件存在不等于送达）',
						recommendation: '按 layout 合并结果渲染 plate/upright/hero；不要手写或删掉 img src',
						evidence: missing.map((src) => `dist${src}`),
					}),
				);
			}
			if (cropDiffs.length > 0) {
				findings.push(
					buildFinding({
						code: 'BUILD_IMAGE_CROP_MISMATCH',
						severity: 'error',
						layer: 'build',
						status: 'active',
						recordId: entry.id,
						fieldPath: 'img[data-crop-*]',
						stationId: null,
						expected: { crops: mapping.details.filter((detail) => detail.upright).map((detail) => detail.upright!.crop) },
						actual: { mismatched: cropDiffs },
						reason: '图注裁剪几何与 layout 的 transform.crop 不一致（错裁/错比例）',
						recommendation: '直接使用 transform.crop 渲染 data-crop-*，不要二次换算',
						evidence: cropDiffs.map((diff) => `dist${diff.src}`),
					}),
				);
			}
			if (unexpected.length > 0) {
				findings.push(
					buildFinding({
						code: 'BUILD_IMAGE_UNEXPECTED_SOURCE',
						severity: 'error',
						layer: 'build',
						status: 'active',
						recordId: entry.id,
						fieldPath: 'img[src]',
						stationId: null,
						expected: { sources: [...known].sort() },
						actual: { sources: unexpected },
						reason: '页面引用了 layout 没有产出的记录图片（可能被替换或手写）',
						recommendation: '只引用 layout 合并出的 plate/upright；派生资产应由同一 build 生成',
						evidence: unexpected.map((src) => `dist${src}`),
					}),
				);
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

	// Disc routes: enumerate what the build actually produced and diff both
	// directions against the dynamic authoritative set. Ids are never constants.
	const expectedRouteIds = source.map((entry) => entry.id).sort();
	const enumerated = enumerateDiscRoutes(ctx.distRoot);
	const missingRoutes = expectedRouteIds.filter((id) => !enumerated.ids.includes(id));
	const extraRoutes = enumerated.ids.filter((id) => !expectedRouteIds.includes(id));
	const routes: BuildResult['routes'] = {
		expected: expectedRouteIds,
		actual: enumerated.ids,
		missing: missingRoutes,
		extra: extraRoutes,
		ignored: enumerated.ignored,
	};
	if (extraRoutes.length > 0) {
		findings.push(
			buildFinding({
				code: 'BUILD_ROUTE_EXTRA',
				severity: 'error',
				layer: 'build',
				status: 'active',
				recordId: null,
				fieldPath: 'dist/records/*/index.html',
				stationId: null,
				expected: { routes: expectedRouteIds },
				actual: { extra: extraRoutes, ignored: enumerated.ignored },
				reason: 'build 产物里有源不存在的碟路由（多盘/同数替换/残留页），不能只看缺盘',
				recommendation: '用同一提交重新 build；非碟路由（目录页、总览）按真实 payload 排除而不是按名字猜',
				evidence: extraRoutes.map((id) => `dist/records/${id}/index.html`),
			}),
		);
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

	return { byId, findings, notChecked, overview, distIndex, routes };
}

/**
 * Fields of a delivered map station that carry real semantics. `id`/`year` are
 * compared by the station-sequence check, the rest here.
 */
export const MAP_PLACE_FIELDS: readonly string[] = [
	'id',
	'year',
	'yearLabel',
	'city',
	'cityZh',
	'role',
	'lon',
	'lat',
	'zoom',
	'blurb',
	'eventId',
];

function samePlaceValue(left: unknown, right: unknown): boolean {
	if (left === undefined || left === null) return right === undefined || right === null;
	if (right === undefined || right === null) return false;
	return JSON.stringify(left) === JSON.stringify(right);
}

/** Ordered, field-level diff between expanded source places and delivered places. */
export function compareMapPlaces(
	expected: ReadonlyArray<Record<string, unknown>>,
	actual: ReadonlyArray<Record<string, unknown>>,
): Array<{ index: number; id: string; fields: string[] }> {
	const out: Array<{ index: number; id: string; fields: string[] }> = [];
	const max = Math.max(expected.length, actual.length);
	for (let index = 0; index < max; index += 1) {
		const want = expected[index] ?? {};
		const got = actual[index] ?? {};
		const fields = MAP_PLACE_FIELDS.filter((field) => !samePlaceValue(want[field], got[field]));
		// Any extra key the page invented is also a delivery difference, never a pass.
		for (const key of Object.keys(got)) {
			if (!MAP_PLACE_FIELDS.includes(key) && !(key in want)) fields.push(key);
		}
		if (fields.length > 0) {
			out.push({ index, id: String(got.id ?? want.id ?? ''), fields });
		}
	}
	return out;
}

/**
 * Every `/records/<id>/index.html` route in the build output, minus the routes
 * that are provably not disc pages (the index page and the overview, which is
 * recognized by its real `mode:"overview"` payload, not by a name guess).
 */
export function enumerateDiscRoutes(distRoot: string): { ids: string[]; ignored: string[] } {
	const recordsDir = join(distRoot, 'records');
	if (!existsSync(recordsDir)) return { ids: [], ignored: [] };
	const ids: string[] = [];
	const ignored: string[] = [];
	for (const entry of readdirSync(recordsDir, { withFileTypes: true })) {
		if (!entry.isDirectory()) continue;
		const pagePath = join(recordsDir, entry.name, 'index.html');
		if (!existsSync(pagePath)) continue;
		const page = readPage(readFileSync(pagePath, 'utf8'));
		if (page.payload?.mode === 'overview') {
			ignored.push(entry.name);
			continue;
		}
		ids.push(entry.name);
	}
	return { ids: ids.sort(), ignored: ignored.sort() };
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
