/**
 * Catalog data validator tests.
 *
 * Every fixture is built in an isolated temp directory. Nothing here reads or
 * writes `records/`, `public/`, `src/data/` of the checkout: the fixture repo
 * gets its own copy of the shared modules, its own export roots, its own layout
 * and its own `public/` raster files (written with the installed encoder).
 *
 * Run: node --experimental-strip-types --test scripts/catalog-data-validator.test.ts
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, describe, it } from 'node:test';
import sharp from 'sharp';

import { inventory } from './catalog-data-validator/inventory.ts';
import { collectRecord, type SourceContext } from './catalog-data-validator/source.ts';
import { loadEntities, classifyTime, catalogViewFor } from './catalog-data-validator/trajectory.ts';
import { loadModel } from './catalog-data-validator/model.ts';
import { compareBuild, enumerateDiscRoutes, readPage, sourceFreshness } from './catalog-data-validator/build.ts';
import {
	buildReceipt,
	inputFingerprint,
	outputFingerprint,
	verifyReceipt,
	type BuildReceipt,
} from './catalog-data-validator/receipt.ts';
import {
	assignFindingKeys,
	evaluateExit,
	emptySummary,
	fingerprintParagraphs,
	isOverbroadBaseline,
	findingValueSha,
	renderMarkdown,
	sortFindings,
	type CatalogReport,
	type Finding,
	type DisplayImageMap,
	type RecordExpectation,
} from './catalog-data-validator/report.ts';
import { detectImageFormat, inspectAsset, loadImageDecoder, resolveInsideReal } from './catalog-data-validator/images.ts';
import { main } from './catalog-data-validator.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');

after(() => {
	// Keep the temp dirs for debugging only when the run failed.
	if (process.exitCode && process.exitCode !== 0) return;
	for (const dir of roots) {
		try {
			rmSync(dir, { recursive: true, force: true });
		} catch {
			// best effort
		}
	}
});

const roots: string[] = [];

function tempRoot(label: string): string {
	const dir = mkdtempSync(join(tmpdir(), `cdv-${label}-`));
	roots.push(dir);
	return dir;
}

let siteTemplate: string | null = null;

/** A throwaway repo root with the shared modules copied in (never modified). */
function siteTemplateDir(): string {
	if (siteTemplate) return siteTemplate;
	const dir = tempRoot('template');
	cpSync(join(REPO, 'src/data'), join(dir, 'src/data'), { recursive: true });
	cpSync(join(REPO, 'scripts/record-sha.mjs'), join(dir, 'scripts/record-sha.mjs'));
	siteTemplate = dir;
	return dir;
}

type FixtureRecord = {
	id: string;
	story?: string;
	overrides?: Record<string, unknown>;
	images?: Array<{ file: string; kind: string; caption?: string }>;
	details?: Array<{ file: string; caption: string; text: string }>;
	links?: Array<{ title: string; href: string; site: string }>;
	trajectory?: unknown;
	/** Skip writing story.md entirely. */
	omitStory?: boolean;
	/** Skip writing record.json entirely. */
	omitRecord?: boolean;
	extraFiles?: Record<string, string>;
	/** Layout details for this record. `null` keeps the record out of the layout. */
	layout?: null | {
		image?: { src: string; width: number; height: number };
		detailsNote?: string;
		sources?: string[];
	};
};

type SiteOptions = {
	records: FixtureRecord[];
	legacy?: FixtureRecord[];
	/** Extra index entries without directories. */
	indexEntriesWithoutDir?: string[];
	/** Duplicate the first index entry. */
	duplicateIndexEntry?: boolean;
	/** Directory without an index entry. */
	dirWithoutIndex?: string;
	omitLegacyIndex?: boolean;
	omitV1Index?: boolean;
	/** Bypass the template layout entirely. */
	omitLayout?: boolean;
};

function defaultImages(): Array<{ file: string; kind: string; caption: string }> {
	return [
		{ file: 'images/cover-front.jpg', kind: 'cover-front', caption: '封套正面' },
		{ file: 'details/label-d1-s1.webp', kind: 'detail', caption: '标签细节' },
	];
}

function defaultDetails(): Array<{ file: string; caption: string; text: string }> {
	return [{ file: 'details/label-d1-s1.webp', caption: '标签细节', text: '① 标签说明' }];
}

const W = 40;
const H = 30;
const CROP = { x: 2, y: 2, w: 20, h: 20 };
const PLATE_W = 20;
const PLATE_H = 20;

async function tinyJpeg(width = 4, height = 3): Promise<Buffer> {
	return sharp({ create: { width, height, channels: 3, background: { r: 200, g: 30, b: 30 } } }).jpeg().toBuffer();
}

async function tinyWebp(width: number, height: number): Promise<Buffer> {
	return sharp({ create: { width, height, channels: 3, background: { r: 10, g: 90, b: 140 } } }).webp().toBuffer();
}

type BuiltSite = { root: string; ids: string[] };

async function buildSite(label: string, options: SiteOptions): Promise<BuiltSite> {
	const root = tempRoot(label);
	cpSync(join(siteTemplateDir(), 'src'), join(root, 'src'), { recursive: true });
	cpSync(join(siteTemplateDir(), 'scripts'), join(root, 'scripts'), { recursive: true });
	// The copied shared modules import zod; link the checkout's installed deps
	// (read-only) so the fixture runs the real schema instead of a stub.
	symlinkSync(join(REPO, 'node_modules'), join(root, 'node_modules'), 'dir');

	const modes: Array<{ dir: string; records: FixtureRecord[]; legacy: boolean }> = [
		{ dir: join(root, 'records'), records: options.records, legacy: false },
		{ dir: join(root, 'records-legacy'), records: options.legacy ?? [], legacy: true },
	];

	const layout: unknown[] = [];
	const ids: string[] = [];

	for (const mode of modes) {
		if (mode.legacy && mode.records.length === 0) {
			// An absent legacy side is legal: no directory, no index.
			continue;
		}
		mkdirSync(join(mode.dir, 'records'), { recursive: true });
		const entries: Array<{ id: string; updatedAt: string; sha256: string }> = [];
		for (const record of mode.records) {
			ids.push(record.id);
			const dir = join(mode.dir, 'records', record.id);
			mkdirSync(join(dir, 'images'), { recursive: true });
			mkdirSync(join(dir, 'details'), { recursive: true });
			const images = record.images ?? defaultImages();
			const details = record.details ?? defaultDetails();
			if (!record.omitRecord) {
				const body: Record<string, unknown> = {
					id: record.id,
					composer: '作曲家甲',
					work: '作品甲',
					performers: '演奏者甲',
					label: '厂牌甲',
					catalogNumber: 'CAT 1',
					category: '古典',
					pressing: '压片说明',
					matrix: 'A 面刻字',
					recording: '录音说明',
					eq: 'RIAA',
					condition: '品相说明',
					year: '1960',
					verificationStatus: 'verified',
					statusLabel: '已核',
					notes: '著录说明',
					links: record.links ?? [{ title: '来源', href: 'https://example.org/a', site: 'example.org' }],
					images,
					details,
					...(record.trajectory ? { trajectory: record.trajectory } : {}),
					...(record.overrides ?? {}),
				};
				writeFileSync(join(dir, 'record.json'), JSON.stringify(body, null, 2));
			}
			if (!record.omitStory) {
				writeFileSync(
					join(dir, 'story.md'),
					record.story ?? `# ${record.id}\n\n这是第一段真实述语。\n\n这是第二段真实述语。\n`,
				);
			}
			for (const image of images) {
				const file = join(dir, image.file);
				mkdirSync(dirname(file), { recursive: true });
				writeFileSync(file, image.file.endsWith('.webp') ? await tinyWebp(30, 20) : await tinyJpeg());
			}
			for (const [rel, content] of Object.entries(record.extraFiles ?? {})) {
				const file = join(dir, rel);
				mkdirSync(dirname(file), { recursive: true });
				writeFileSync(file, content);
			}
			const { directorySha256 } = await import(join(root, 'scripts/record-sha.mjs'));
			entries.push({ id: record.id, updatedAt: '2026-01-02T00:00:00.000Z', sha256: directorySha256(dir) });

			const layoutOption = record.layout === undefined ? {} : record.layout;
			if (layoutOption !== null) {
				const sources = layoutOption?.sources ?? [images[0]!.file];
				layout.push({
					id: record.id,
					image: layoutOption?.image ?? { src: `/records/${record.id}/hero.webp`, width: 10, height: 10 },
					detailsNote: layoutOption?.detailsNote ?? '版式说明',
					details: sources.map((source, index) => ({
						part: index === 0 ? 'cover' : `plate${index}`,
						source,
						alt: '版式图',
						plate: { src: `/records/${record.id}/${index === 0 ? 'cover' : `plate${index}`}.webp`, width: PLATE_W, height: PLATE_H },
						upright: { src: `/records/${record.id}/${index === 0 ? 'cover' : `plate${index}`}-upright.webp`, width: W, height: H },
						transform: { cropSpace: 'upright', angleDeg: 0, crop: CROP, exportWidth: PLATE_W },
						marks: [],
					})),
				});
				mkdirSync(join(root, 'public', 'records', record.id), { recursive: true });
				writeFileSync(join(root, 'public', 'records', record.id, 'hero.webp'), await tinyWebp(10, 10));
				for (const [index] of sources.entries()) {
					const part = index === 0 ? 'cover' : `plate${index}`;
					writeFileSync(join(root, 'public', 'records', record.id, `${part}.webp`), await tinyWebp(PLATE_W, PLATE_H));
					writeFileSync(join(root, 'public', 'records', record.id, `${part}-upright.webp`), await tinyWebp(W, H));
				}
			}
		}
		if (options.duplicateIndexEntry && entries.length > 0) entries.push(entries[0]!);
		for (const id of options.indexEntriesWithoutDir ?? []) {
			if (mode.dir.includes('legacy')) continue;
			entries.push({ id, updatedAt: '2026-01-02T00:00:00.000Z', sha256: 'b'.repeat(64) });
		}
		if (options.dirWithoutIndex && !mode.dir.includes('legacy')) {
			mkdirSync(join(mode.dir, 'records', options.dirWithoutIndex), { recursive: true });
			writeFileSync(join(mode.dir, 'records', options.dirWithoutIndex, 'record.json'), '{}');
		}
		if (mode.legacy) {
			if (options.omitLegacyIndex) continue;
		} else if (options.omitV1Index) {
			continue;
		}
		writeFileSync(
			join(mode.dir, 'index.json'),
			JSON.stringify({ schemaVersion: 1, generatedAt: '2026-01-02T00:00:00.000Z', records: entries }, null, 2),
		);
	}

	if (!options.omitLayout) {
		writeFileSync(join(root, 'src/data/records-layout.json'), JSON.stringify(layout, null, 2));
	} else {
		rmSync(join(root, 'src/data/records-layout.json'), { force: true });
	}
	return { root, ids };
}

async function sourceContext(root: string): Promise<SourceContext> {
	const decoder = await loadImageDecoder();
	return {
		repoRoot: root,
		decoder,
		decoderAvailable: Boolean(decoder),
		entities: loadEntities(join(root, 'records')),
		model: await loadModel(root),
		fieldPolicy: [],
		rolePolicy: [],
	};
}

function findingCodes(findings: Finding[]): string[] {
	return findings.map((finding) => finding.code).sort();
}

describe('Task 0 contract surfaces', () => {
	it('exports every frozen name and keeps the report version', async () => {
		const report = await import('./catalog-data-validator/report.ts');
		const inventoryModule = await import('./catalog-data-validator/inventory.ts');
		const sourceModule = await import('./catalog-data-validator/source.ts');
		const buildModule = await import('./catalog-data-validator/build.ts');
		assert.equal(typeof report.renderMarkdown, 'function');
		assert.equal(typeof report.exitCodeFor, 'function');
		assert.equal(typeof report.evaluateExit, 'function');
		assert.equal(typeof inventoryModule.inventory, 'function');
		assert.equal(typeof sourceModule.collectRecord, 'function');
		assert.equal(typeof buildModule.compareBuild, 'function');
		assert.equal(report.REPORT_VERSION, 1);
		assert.equal(typeof report.fingerprintParagraphs, 'function');
	});
});

describe('inventory', () => {
	it('unions both roots dynamically and reports the roots', async () => {
		const site = await buildSite('union', {
			records: [{ id: 'alpha01' }, { id: 'beta02' }],
			legacy: [{ id: 'legacy03' }],
		});
		const result = inventory({ exportRoot: join(site.root, 'records'), legacyRoot: join(site.root, 'records-legacy') });
		assert.deepEqual(result.expectedIds, ['alpha01', 'beta02', 'legacy03']);
		assert.equal(result.complete, true);
		assert.equal(result.rows.filter((row) => row.legacy).length, 1);
		assert.equal(result.findings.length, 0);
	});

	it('changes with the data instead of a fixed 26/22 constant', async () => {
		const three = await buildSite('dynamic3', { records: [{ id: 'a1' }, { id: 'b2' }, { id: 'c3' }] });
		const four = await buildSite('dynamic4', { records: [{ id: 'a1' }, { id: 'b2' }, { id: 'c3' }, { id: 'd4' }] });
		const first = inventory({ exportRoot: join(three.root, 'records'), legacyRoot: join(three.root, 'records-legacy') });
		const second = inventory({ exportRoot: join(four.root, 'records'), legacyRoot: join(four.root, 'records-legacy') });
		assert.equal(first.rows.length, 3);
		assert.equal(second.rows.length, 4);
		assert.deepEqual(second.expectedIds, ['a1', 'b2', 'c3', 'd4']);
	});

	it('reports a duplicate index id instead of silently deduping', async () => {
		const site = await buildSite('dupidx', { records: [{ id: 'a1' }], duplicateIndexEntry: true });
		const result = inventory({ exportRoot: join(site.root, 'records'), legacyRoot: join(site.root, 'records-legacy') });
		assert.ok(result.findings.some((finding) => finding.code === 'INVENTORY_INDEX_DUPLICATE_ID'));
		assert.equal(result.rows.length, 2);
		assert.ok(result.rows.every((row) => row.blockReason !== null));
		assert.equal(result.complete, false);
	});

	it('reports a cross-root duplicate id', async () => {
		const site = await buildSite('crosroot', {
			records: [{ id: 'same01' }],
			legacy: [{ id: 'same01' }],
		});
		const result = inventory({ exportRoot: join(site.root, 'records'), legacyRoot: join(site.root, 'records-legacy') });
		assert.ok(result.findings.some((finding) => finding.code === 'INVENTORY_DUPLICATE_ID_CROSS_ROOT' || finding.code === 'INVENTORY_DUPLICATE_ID'));
		assert.equal(result.complete, false);
	});

	it('treats a legacy directory without index as an incomplete full set', async () => {
		const site = await buildSite('legacyidx', {
			records: [{ id: 'a1' }],
			legacy: [{ id: 'legacy02' }],
			omitLegacyIndex: true,
		});
		const result = inventory({ exportRoot: join(site.root, 'records'), legacyRoot: join(site.root, 'records-legacy') });
		assert.ok(result.findings.some((finding) => finding.code === 'INVENTORY_INDEX_MISSING'));
		assert.equal(result.complete, false);
		assert.deepEqual(result.observedIds, ['a1']);
	});

	it('reports index entries without a directory and directories without an index', async () => {
		const site = await buildSite('mismatch', {
			records: [{ id: 'a1' }],
			indexEntriesWithoutDir: ['ghost9'],
			dirWithoutIndex: 'orphan7',
		});
		const result = inventory({ exportRoot: join(site.root, 'records'), legacyRoot: join(site.root, 'records-legacy') });
		const codes = findingCodes(result.findings);
		assert.ok(codes.includes('INVENTORY_INDEX_NO_DIR'));
		assert.ok(codes.includes('INVENTORY_DIR_UNINDEXED'));
		assert.equal(result.complete, false);
		assert.deepEqual(result.missingIds, ['orphan7']);
	});

	it('shows a same-count id replacement as a real set diff', async () => {
		// Index says ghost9, the directory is orphan7: same count, different ids.
		const site = await buildSite('samesize', {
			records: [{ id: 'a1' }, { id: 'b2' }],
			indexEntriesWithoutDir: ['ghost9'],
			dirWithoutIndex: 'orphan7',
		});
		const result = inventory({ exportRoot: join(site.root, 'records'), legacyRoot: join(site.root, 'records-legacy') });
		assert.deepEqual(result.observedIds, ['a1', 'b2', 'ghost9']);
		assert.deepEqual(result.missingIds, ['orphan7']);
		assert.ok(result.extraIds.includes('ghost9'));
		assert.equal(result.complete, false);
	});

	it('reports a record.json id that does not match the directory name', async () => {
		const site = await buildSite('idmismatch', {
			records: [{ id: 'a1', overrides: { id: 'zz9' }, layout: null }],
		});
		const result = inventory({ exportRoot: join(site.root, 'records'), legacyRoot: join(site.root, 'records-legacy') });
		assert.ok(result.findings.some((finding) => finding.code === 'INVENTORY_ID_MISMATCH'));
		assert.equal(result.complete, false);
	});
});

describe('images', () => {
	it('detects real formats from bytes', async () => {
		const root = tempRoot('fmt');
		const jpeg = await tinyJpeg();
		const webp = await tinyWebp(4, 4);
		assert.equal(detectImageFormat(jpeg), 'jpeg');
		assert.equal(detectImageFormat(webp), 'webp');
		assert.equal(detectImageFormat(Buffer.from('not an image')), null);
		mkdirSync(root, { recursive: true });
	});

	it('decodes a good JPEG/PNG/WebP and rejects a truncated one', async () => {
		const decoder = await loadImageDecoder();
		assert.ok(decoder, 'sharp must be installed (astro optional dependency)');
		const dir = tempRoot('decode');
		const jpeg = await tinyJpeg(6, 5);
		const webp = await tinyWebp(7, 4);
		const png = await sharp({ create: { width: 5, height: 9, channels: 3, background: { r: 1, g: 2, b: 3 } } }).png().toBuffer();
		mkdirSync(join(dir, 'images'), { recursive: true });
		writeFileSync(join(dir, 'images/good.jpg'), jpeg);
		writeFileSync(join(dir, 'images/good.webp'), webp);
		writeFileSync(join(dir, 'images/good.png'), png);
		writeFileSync(join(dir, 'images/truncated.jpg'), jpeg.subarray(0, Math.floor(jpeg.length / 2)));
		writeFileSync(join(dir, 'images/fake.png'), 'not a png at all');

		const goodJpg = await inspectAsset({ recordDir: dir, rel: 'images/good.jpg', decoder });
		const goodWebp = await inspectAsset({ recordDir: dir, rel: 'images/good.webp', decoder });
		const goodPng = await inspectAsset({ recordDir: dir, rel: 'images/good.png', decoder });
		const truncated = await inspectAsset({ recordDir: dir, rel: 'images/truncated.jpg', decoder });
		const fake = await inspectAsset({ recordDir: dir, rel: 'images/fake.png', decoder });
		assert.equal(goodJpg.status, 'valid');
		assert.deepEqual([goodJpg.width, goodJpg.height], [6, 5]);
		assert.equal(goodWebp.status, 'valid');
		assert.deepEqual([goodWebp.width, goodWebp.height], [7, 4]);
		assert.equal(goodPng.status, 'valid');
		assert.deepEqual([goodPng.width, goodPng.height], [5, 9]);
		assert.equal(truncated.status, 'decode-failed');
		assert.equal(fake.status, 'format-mismatch');
	});

	it('blocks decode when the decoder is missing instead of passing on existence', async () => {
		const dir = tempRoot('nodecoder');
		mkdirSync(join(dir, 'images'), { recursive: true });
		writeFileSync(join(dir, 'images/a.jpg'), await tinyJpeg());
		const result = await inspectAsset({ recordDir: dir, rel: 'images/a.jpg', decoder: null });
		assert.equal(result.status, 'decoder-unavailable');
	});

	it('rejects escapes, symlink escapes, directories and zero-byte files', async () => {
		const decoder = await loadImageDecoder();
		const dir = tempRoot('escape');
		mkdirSync(join(dir, 'images'), { recursive: true });
		mkdirSync(join(dir, 'images/sub'), { recursive: true });
		writeFileSync(join(dir, 'images/empty.jpg'), Buffer.alloc(0));
		const outside = tempRoot('outside');
		writeFileSync(join(outside, 'secret.jpg'), await tinyJpeg());
		symlinkSync(join(outside, 'secret.jpg'), join(dir, 'images/link.jpg'));

		const escaped = await inspectAsset({ recordDir: dir, rel: '../outside/secret.jpg', decoder });
		const linked = await inspectAsset({ recordDir: dir, rel: 'images/link.jpg', decoder });
		const notFile = await inspectAsset({ recordDir: dir, rel: 'images/sub', decoder });
		const empty = await inspectAsset({ recordDir: dir, rel: 'images/empty.jpg', decoder });
		const missing = await inspectAsset({ recordDir: dir, rel: 'images/nope.jpg', decoder });
		assert.equal(escaped.status, 'escape');
		assert.equal(linked.status, 'escape');
		assert.equal(notFile.status, 'not-file');
		assert.equal(empty.status, 'empty');
		assert.equal(missing.status, 'missing');
		assert.equal(resolveInsideReal(dir, 'images/../images/empty.jpg').ok, true);
	});
});

describe('source collector', () => {
	it('separates sourceBodyPresent from storyChapterPresent', async () => {
		const site = await buildSite('storysplit', {
			records: [
				{ id: 'bodyonly', story: '# only title\n\n## 唱片\n\n盘面说明一段。\n' },
				{ id: 'noh2', story: '# only title\n\n无二级标题的短述语也只有一句。\n' },
				{ id: 'aliasstory', story: '# t\n\n## 来龙去脉\n\n旧别名段落。\n' },
				{ id: 'notesstory', story: '# t\n\n## 资料\n\n资料叙事也归述语。\n' },
			],
		});
		const ctx = await sourceContext(site.root);
		const inv = inventory({ exportRoot: join(site.root, 'records'), legacyRoot: join(site.root, 'records-legacy') });
		const results = new Map<string, Awaited<ReturnType<typeof collectRecord>>>();
		for (const row of inv.rows) results.set(row.id, await collectRecord(row, ctx));

		const bodyOnly = results.get('bodyonly')!;
		assert.equal(bodyOnly.story?.sourceBodyPresent, true);
		assert.equal(bodyOnly.story?.storyChapterPresent, false);
		assert.ok(bodyOnly.findings.some((finding) => finding.code === 'STORY_CHAPTER_MISSING_IN_SOURCE'));

		assert.equal(results.get('noh2')!.story?.storyChapterPresent, true);
		assert.equal(results.get('aliasstory')!.story?.storyChapterPresent, true);
		assert.equal(results.get('notesstory')!.story?.storyChapterPresent, true);
	});

	it('rejects empty, whitespace, H2-only and placeholder-only stories', async () => {
		const site = await buildSite('storyempty', {
			records: [
				{ id: 'empty01', story: '# only a title\n' },
				{ id: 'h2only1', story: '# t\n\n## 述语\n\n' },
				{ id: 'places1', story: '# t\n\n待补\n' },
				{ id: 'todo0001', story: '# t\n\nTODO\n' },
			],
		});
		const ctx = await sourceContext(site.root);
		const inv = inventory({ exportRoot: join(site.root, 'records'), legacyRoot: join(site.root, 'records-legacy') });
		for (const row of inv.rows) {
			const result = await collectRecord(row, ctx);
			const codes = findingCodes(result.findings);
			assert.ok(
				codes.includes('STORY_SOURCE_EMPTY') || codes.includes('STORY_SOURCE_PLACEHOLDER'),
				`${row.id} should fail the story check, got ${codes.join(',')}`,
			);
		}
	});

	it('does not treat 待补拍 or 年份未核 inside a sentence as a placeholder', async () => {
		const site = await buildSite('storysubstr', {
			records: [{ id: 'sentence', story: '# t\n\nB 面刻字与厂址年份未核，待补拍后可继续。\n' }],
		});
		const ctx = await sourceContext(site.root);
		const inv = inventory({ exportRoot: join(site.root, 'records'), legacyRoot: join(site.root, 'records-legacy') });
		const result = await collectRecord(inv.rows[0]!, ctx);
		assert.equal(result.story?.placeholderOnly, false);
		assert.ok(!result.findings.some((finding) => finding.code === 'STORY_SOURCE_PLACEHOLDER'));
	});

	it('keeps later records after an unreadable first record', async () => {
		const site = await buildSite('failfirst', {
			records: [{ id: 'broken1', omitRecord: true }, { id: 'good02' }, { id: 'good03' }],
		});
		const ctx = await sourceContext(site.root);
		const inv = inventory({ exportRoot: join(site.root, 'records'), legacyRoot: join(site.root, 'records-legacy') });
		const results: string[] = [];
		for (const row of inv.rows) {
			const result = await collectRecord(row, ctx);
			results.push(`${row.id}:${result.status}`);
		}
		assert.ok(results.includes('good02:collected'));
		assert.ok(results.includes('good03:collected'));
		assert.ok(results.some((entry) => entry.startsWith('broken1:')));
	});

	it('classifies empty strings, whitespace and placeholders per field', async () => {
		const site = await buildSite('fields', {
			records: [
				{
					id: 'field01',
					overrides: { matrix: '   ', pressing: '—', eq: '真实均衡说明' },
				},
			],
		});
		const ctx = await sourceContext(site.root);
		const inv = inventory({ exportRoot: join(site.root, 'records'), legacyRoot: join(site.root, 'records-legacy') });
		const result = await collectRecord(inv.rows[0]!, ctx);
		const field = (key: string) => result.fields.find((entry) => entry.key === key)!;
		assert.equal(field('matrix').valueState, 'whitespace');
		assert.equal(field('pressing').valueState, 'placeholder');
		assert.equal(field('eq').valueState, 'valid');
		assert.equal(field('eq').verificationState, 'unknown');
	});

	it('keeps 待复核/待核 as a real status, not a placeholder, and does not inherit it per field', async () => {
		const site = await buildSite('statusfield', {
			records: [
				{
					id: 'state001',
					overrides: { statusLabel: '待复核', verificationStatus: 'pending' },
				},
			],
		});
		const ctx = await sourceContext(site.root);
		const inv = inventory({ exportRoot: join(site.root, 'records'), legacyRoot: join(site.root, 'records-legacy') });
		const result = await collectRecord(inv.rows[0]!, ctx);
		const status = result.fields.find((entry) => entry.key === 'statusLabel')!;
		const eq = result.fields.find((entry) => entry.key === 'eq')!;
		assert.equal(status.valueState, 'valid');
		assert.equal(eq.verificationState, 'unknown', 'record-level pending must not be copied onto every field');
		assert.equal(result.verificationStatus, 'pending');
	});

	it('marks an optional key as optional-absent, distinct from a required miss', async () => {
		// `year` is optional in recordSchema; dropping the key must read as absent,
		// not as a required-field miss.
		const site = await buildSite('optionalkey', { records: [{ id: 'opt00001', overrides: { year: undefined } }] });
		const ctx = await sourceContext(site.root);
		const inv = inventory({ exportRoot: join(site.root, 'records'), legacyRoot: join(site.root, 'records-legacy') });
		const result = await collectRecord(inv.rows[0]!, ctx);
		const year = result.fields.find((entry) => entry.key === 'year')!;
		const matrix = result.fields.find((entry) => entry.key === 'matrix')!;
		assert.equal(year.valueState, 'optional-absent');
		assert.equal(year.required, false);
		assert.equal(matrix.valueState, 'valid');
	});

	it('reports duplicate image references and cross-array reuse without double counting', async () => {
		const site = await buildSite('dupimg', {
			records: [
				{
					id: 'dup0001',
					images: [
						{ file: 'images/cover-front.jpg', kind: 'cover-front', caption: 'a' },
						{ file: 'images/cover-front.jpg', kind: 'cover-front', caption: 'b' },
						{ file: 'details/label-d1-s1.webp', kind: 'detail', caption: 'c' },
					],
					details: [
						{ file: 'details/label-d1-s1.webp', caption: 'd', text: '① x' },
					],
				},
			],
		});
		const ctx = await sourceContext(site.root);
		const inv = inventory({ exportRoot: join(site.root, 'records'), legacyRoot: join(site.root, 'records-legacy') });
		const result = await collectRecord(inv.rows[0]!, ctx);
		assert.ok(result.findings.some((finding) => finding.code === 'IMAGE_DUPLICATE_REFERENCE'));
		assert.equal(result.photos?.totalRefs, 4);
		assert.equal(result.photos?.uniqueReferencedAssets, 2);
	});

	it('warns on byte-identical files under different paths and on unreferenced files', async () => {
		const jpeg = await tinyJpeg();
		const site = await buildSite('bytecopy', {
			records: [
				{
					id: 'bytes001',
					images: [
						{ file: 'images/cover-front.jpg', kind: 'cover-front', caption: 'a' },
						{ file: 'images/cover-front-copy.jpg', kind: 'cover-front', caption: 'b' },
						{ file: 'details/label-d1-s1.webp', kind: 'detail', caption: 'c' },
					],
				},
			],
		});
		// Write real bytes (the helper above writes text via extraFiles).
		writeFileSync(join(site.root, 'records/records/bytes001/images/cover-front.jpg'), jpeg);
		writeFileSync(join(site.root, 'records/records/bytes001/images/cover-front-copy.jpg'), jpeg);
		writeFileSync(join(site.root, 'records/records/bytes001/images/orphan.jpg'), await tinyJpeg(3, 3));
		const ctx = await sourceContext(site.root);
		const inv = inventory({ exportRoot: join(site.root, 'records'), legacyRoot: join(site.root, 'records-legacy') });
		const result = await collectRecord(inv.rows[0]!, ctx);
		assert.ok(!result.findings.some((finding) => finding.code === 'IMAGE_INVALID' || finding.code === 'IMAGE_MISSING'));
		assert.ok(result.findings.some((finding) => finding.code === 'IMAGE_BYTE_DUPLICATE'));
		assert.ok(result.findings.some((finding) => finding.code === 'IMAGE_UNREFERENCED_FILE'));
		assert.deepEqual(result.photos?.unreferencedFiles, ['images/orphan.jpg']);
	});

	it('fails hard when cover-front is missing, even with a valid trajectory', async () => {
		const site = await buildSite('nocover', {
			records: [
				{
					id: 'nocover1',
					images: [{ file: 'images/back.jpg', kind: 'cover-back', caption: 'b' }],
					layout: { sources: ['images/back.jpg'] },
				},
			],
		});
		const ctx = await sourceContext(site.root);
		const inv = inventory({ exportRoot: join(site.root, 'records'), legacyRoot: join(site.root, 'records-legacy') });
		const result = await collectRecord(inv.rows[0]!, ctx);
		assert.equal(result.schema, 'invalid');
		const schemaError = result.findings.find((finding) => finding.code === 'RECORD_SCHEMA_INVALID');
		assert.ok(schemaError);
		assert.match(schemaError!.reason, /cover-front/);
		// Approved gaps cannot bypass the schema: the record stays invalid.
		assert.equal(result.expect, null);
	});

	it('reports a missing and a corrupt image as errors, not as zero photos', async () => {
		const site = await buildSite('badimg', {
			records: [
				{
					id: 'badimg01',
					images: [
						{ file: 'images/cover-front.jpg', kind: 'cover-front', caption: 'a' },
						{ file: 'images/missing.jpg', kind: 'detail', caption: 'b' },
					],
				},
			],
		});
		writeFileSync(join(site.root, 'records/records/badimg01/images/missing.jpg'), Buffer.from('ffff', 'hex'));
		const ctx = await sourceContext(site.root);
		const inv = inventory({ exportRoot: join(site.root, 'records'), legacyRoot: join(site.root, 'records-legacy') });
		const result = await collectRecord(inv.rows[0]!, ctx);
		assert.ok(result.findings.some((finding) => finding.code === 'IMAGE_INVALID'));
		assert.equal(result.photos?.invalidFiles, 1);
	});

	it('marks version role completeness explicitly not-checked without a contract', async () => {
		const site = await buildSite('roles', { records: [{ id: 'roles001' }] });
		const ctx = await sourceContext(site.root);
		const inv = inventory({ exportRoot: join(site.root, 'records'), legacyRoot: join(site.root, 'records-legacy') });
		const result = await collectRecord(inv.rows[0]!, ctx);
		assert.equal(result.roleRequirements, 'not-checked');
		assert.ok(result.notChecked.some((entry) => entry.code === 'VERSION_ROLE_REQUIREMENTS_UNCHECKED'));
	});

	it('honours a precise role policy: required missing errors, accepted gap stays listed', async () => {
		const site = await buildSite('rolepolicy', { records: [{ id: 'role0001' }, { id: 'role0002' }] });
		const base = await sourceContext(site.root);
		const inv = inventory({ exportRoot: join(site.root, 'records'), legacyRoot: join(site.root, 'records-legacy') });
		const rows = new Map(inv.rows.map((row) => [row.id, row]));
		const ctx: SourceContext = {
			...base,
			rolePolicy: [
				{ recordId: 'role0001', role: 'obi', state: 'required', reason: '该版本确有腰封', approvedBy: 'curator', approvedAt: '2026-01-01' },
				{ recordId: 'role0002', role: 'obi', state: 'accepted-gap', reason: '未拍到腰封，据店家记录确认存在', approvedBy: 'curator', approvedAt: '2026-01-01', reviewBy: '2099-01-01' },
			],
		};
		const required = await collectRecord(rows.get('role0001')!, ctx);
		const gap = await collectRecord(rows.get('role0002')!, ctx);
		assert.ok(required.findings.some((finding) => finding.code === 'IMAGE_ROLE_REQUIRED_MISSING' && finding.status === 'active'));
		assert.ok(gap.findings.some((finding) => finding.code === 'IMAGE_ROLE_ACCEPTED_GAP' && finding.status === 'accepted-gap'));
	});
});

describe('trajectory and time', () => {
	it('classifies labels conservatively', () => {
		assert.equal(classifyTime(1966, undefined).kind, 'known-year');
		assert.equal(classifyTime(1966, '1966-04').kind, 'known-month');
		assert.equal(classifyTime(1966, '1966-04-03').kind, 'known-date');
		assert.equal(classifyTime(1966, '约 1966').comparable, false);
		assert.equal(classifyTime(1966, '1966–67').comparable, false);
		assert.equal(classifyTime(1966, '1966 年后').comparable, false);
		assert.equal(classifyTime(1982, '—').kind, 'sentinel');
		assert.equal(classifyTime(1966, '某个自然语言').kind, 'unparseable');
	});

	it('reports real guide inversions and keeps later years unknown-safe', async () => {
		const site = await buildSite('order', {
			records: [
				{
					id: 'order001',
					trajectory: {
						places: [
							{ id: 'a', year: 1912, yearLabel: '1912-10-21', cityZh: '甲', city: 'A', role: 'other', lon: 1, lat: 1, blurb: 'x' },
							{ id: 'b', year: 1842, yearLabel: '1842-11-27', cityZh: '乙', city: 'B', role: 'other', lon: 2, lat: 2, blurb: 'y' },
						],
					},
				},
				{
					id: 'order002',
					trajectory: {
						places: [
							{ id: 'a', year: 1997, cityZh: '甲', city: 'A', role: 'other', lon: 1, lat: 1, blurb: 'x' },
							{ id: 'b', year: 1997, yearLabel: '1997-04', cityZh: '乙', city: 'B', role: 'other', lon: 2, lat: 2, blurb: 'y' },
							{ id: 'c', year: 1997, yearLabel: '1997-03-12', cityZh: '丙', city: 'C', role: 'other', lon: 3, lat: 3, blurb: 'z' },
						],
					},
				},
			],
		});
		const ctx = await sourceContext(site.root);
		const inv = inventory({ exportRoot: join(site.root, 'records'), legacyRoot: join(site.root, 'records-legacy') });
		const rows = new Map(inv.rows.map((row) => [row.id, row]));
		const yearInversion = await collectRecord(rows.get('order001')!, ctx);
		const monthInversion = await collectRecord(rows.get('order002')!, ctx);
		assert.ok(yearInversion.findings.some((finding) => finding.code === 'TRAJECTORY_GUIDE_ORDER_INVERSION' && String(finding.actual && JSON.stringify(finding.actual)).includes('year')));
		assert.ok(monthInversion.findings.some((finding) => finding.code === 'TRAJECTORY_GUIDE_ORDER_INVERSION'));
		assert.equal(yearInversion.trajectory?.report.state, 'present-valid');
	});

	it('does not invent an inversion for same-month year-vs-date or overlapping ranges', async () => {
		const site = await buildSite('fuzzyorder', {
			records: [
				{
					id: 'fuzzy001',
					trajectory: {
						places: [
							{ id: 'a', year: 1951, cityZh: '甲', city: 'A', role: 'other', lon: 1, lat: 1, blurb: 'x' },
							{ id: 'b', year: 1951, yearLabel: '1951-07-29', cityZh: '乙', city: 'B', role: 'other', lon: 2, lat: 2, blurb: 'y' },
							{ id: 'c', year: 1951, yearLabel: '约 1951–53', cityZh: '丙', city: 'C', role: 'other', lon: 3, lat: 3, blurb: 'z' },
						],
					},
				},
			],
		});
		const ctx = await sourceContext(site.root);
		const inv = inventory({ exportRoot: join(site.root, 'records'), legacyRoot: join(site.root, 'records-legacy') });
		const result = await collectRecord(inv.rows[0]!, ctx);
		assert.ok(!result.findings.some((finding) => finding.code === 'TRAJECTORY_GUIDE_ORDER_INVERSION'));
		assert.ok(result.notChecked.some((entry) => entry.code === 'TRAJECTORY_SAME_YEAR_ORDER_UNVERIFIED'));
	});

	it('flags the d37779-style sentinel as an active ERROR and leaves a legal 1982 alone', async () => {
		const site = await buildSite('sentinel', {
			records: [
				{
					id: 'sent0001',
					trajectory: {
						places: [
							{ id: 'utrecht', year: 1982, yearLabel: '—', cityZh: '乌得勒支', city: 'Utrecht', role: 'other', lon: 5.1, lat: 52.1, blurb: 'x' },
						],
					},
				},
				{
					id: 'legal001',
					trajectory: {
						places: [
							{ id: 'holland', year: 1982, cityZh: '荷兰', city: 'Netherlands', role: 'pressing', lon: 5.2, lat: 52.1, blurb: 'y' },
						],
					},
				},
			],
		});
		const ctx = await sourceContext(site.root);
		const inv = inventory({ exportRoot: join(site.root, 'records'), legacyRoot: join(site.root, 'records-legacy') });
		const rows = new Map(inv.rows.map((row) => [row.id, row]));
		const sentinel = await collectRecord(rows.get('sent0001')!, ctx);
		const legal = await collectRecord(rows.get('legal001')!, ctx);
		// 合同 §8 的发布单元已落地：占位标签不再是「能力待补」，而是站点解析器会拒绝的写法，
		// 所以校验器报 active error（不再是 pending-contract）。
		const hit = sentinel.findings.find((finding) => finding.code === 'TRAJECTORY_SENTINEL_LABEL_REJECTED');
		assert.ok(hit);
		assert.equal(hit!.severity, 'error');
		assert.equal(hit!.status, 'active');
		assert.ok(!legal.findings.some((finding) => finding.code === 'TRAJECTORY_SENTINEL_LABEL_REJECTED'));
		assert.ok(!sentinel.findings.some((finding) => finding.code === 'TRAJECTORY_PENDING_CONTRACT_SENTINEL'));
	});

	it('treats an explicit unknown station as legal and keeps it out of the order check', async () => {
		const site = await buildSite('unknowntime', {
			records: [
				{
					id: 'unk00001',
					trajectory: {
						places: [
							{ id: 'a', year: 1980, cityZh: '甲', city: 'A', role: 'other', lon: 1, lat: 1, blurb: 'x' },
							{
								id: 'b',
								timeStatus: 'unknown',
								year: null,
								timeNote: '贴标年份未核。',
								cityZh: '乙',
								city: 'B',
								role: 'other',
								lon: 2,
								lat: 2,
								blurb: 'y',
							},
						],
					},
				},
			],
		});
		const ctx = await sourceContext(site.root);
		const inv = inventory({ exportRoot: join(site.root, 'records'), legacyRoot: join(site.root, 'records-legacy') });
		const result = await collectRecord(inv.rows[0]!, ctx);
		// 合法：不是 schema 错，也不是「能力未落地」的 not-checked。
		assert.equal(result.schema, 'valid');
		assert.equal(result.trajectory?.report.state, 'present-valid');
		assert.ok(!result.notChecked.some((entry) => entry.code === 'TRAJECTORY_UNKNOWN_CAPABILITY_UNSUPPORTED'));
		assert.equal(result.trajectory?.report.timeKinds.unknown, 1);
		assert.equal(result.trajectory?.report.stationYears[1], null);
		// 未知站不参与顺序比较：既不加倒序，也不让同年项被误判。
		assert.ok(!result.findings.some((finding) => finding.code === 'TRAJECTORY_GUIDE_ORDER_INVERSION'));
	});

	it('reports absent trajectories as legal and empty places as a schema error', async () => {
		const site = await buildSite('mapless', {
			records: [
				{ id: 'nomap001' },
				{
					id: 'emptymap1',
					trajectory: { places: [] },
				},
			],
		});
		const ctx = await sourceContext(site.root);
		const inv = inventory({ exportRoot: join(site.root, 'records'), legacyRoot: join(site.root, 'records-legacy') });
		const rows = new Map(inv.rows.map((row) => [row.id, row]));
		const absent = await collectRecord(rows.get('nomap001')!, ctx);
		const empty = await collectRecord(rows.get('emptymap1')!, ctx);
		assert.equal(absent.trajectory?.report.state, 'absent');
		assert.ok(!absent.findings.some((finding) => finding.severity === 'error'));
		assert.equal(empty.schema, 'invalid');
	});

	it('keeps expansion blocked with null counts when an entity pointer dangles', async () => {
		const site = await buildSite('dangling', {
			records: [
				{
					id: 'dangle01',
					trajectory: {
						places: [
							{ id: 'a', eventId: 'evt-does-not-exist' },
							{ id: 'b', year: 1900, cityZh: '乙', city: 'B', role: 'other', lon: 2, lat: 2, blurb: 'y' },
						],
					},
				},
			],
		});
		const ctx = await sourceContext(site.root);
		const inv = inventory({ exportRoot: join(site.root, 'records'), legacyRoot: join(site.root, 'records-legacy') });
		const result = await collectRecord(inv.rows[0]!, ctx);
		assert.equal(result.trajectory?.report.state, 'blocked');
		assert.equal(result.trajectory?.report.expandedStations, null);
		assert.ok(result.findings.some((finding) => finding.code === 'TRAJECTORY_POINTER_INVALID'));
		// Photos/story still ran.
		assert.ok(result.photos && result.story);
	});

	it('keeps a bare null year as an incomplete unknown, not as a legal one', async () => {
		const site = await buildSite('nulltime', {
			records: [
				{
					id: 'nulltime1',
					trajectory: {
						places: [
							{ id: 'a', year: null, cityZh: '甲', city: 'A', role: 'other', lon: 1, lat: 1, blurb: 'x' },
						],
					},
				},
			],
		});
		const ctx = await sourceContext(site.root);
		const inv = inventory({ exportRoot: join(site.root, 'records'), legacyRoot: join(site.root, 'records-legacy') });
		const result = await collectRecord(inv.rows[0]!, ctx);
		assert.equal(result.schema, 'invalid');
		const error = result.findings.find((finding) => finding.code === 'RECORD_SCHEMA_INVALID');
		assert.ok(error);
		// unsupported shape is an error; the semantics are not silently "unknown is legal".
		assert.equal(result.verificationStatus, null);
		assert.ok(!result.findings.some((finding) => finding.code === 'TRAJECTORY_SENTINEL_LABEL_REJECTED'));
		// 裸 null 现在不是「能力没落地」而是「未知分支没写全」：仍报 not-checked，
		// 原因指向合同 §2 的三个必填字段。
		const capability = result.notChecked.find((entry) => entry.code === 'TRAJECTORY_UNKNOWN_CAPABILITY_UNSUPPORTED');
		assert.ok(capability);
		assert.equal(capability!.dependency, 'unknown-time-contract');
		assert.match(capability!.reason, /timeStatus/);
		assert.match(capability!.reason, /timeNote/);
	});

	it('filters the catalog view per disc so another disc-owned event cannot fail this one', async () => {
		const entities = loadEntities(join(REPO, 'records'));
		assert.equal(entities.ok, true);
		if (!entities.ok) return;
		const view = catalogViewFor(entities.catalog, '104971');
		assert.ok(!view.events.has('evt-mg50370-pressing-canada'));
		assert.ok(view.events.size < entities.catalog.events.size);
	});
});

describe('build layer', () => {
	const expectation: RecordExpectation = {
		chapters: [
			{ key: 'record', label: '唱片' },
			{ key: 'story', label: '述语' },
			{ key: 'notes', label: '资料' },
		],
		storyParagraphs: ['第一段。', '第二段。'],
		notesFields: [
			{ term: '艺人', value: '演奏者甲' },
			{ term: '状态', value: '已核' },
		],
		notesConditionsAvailable: true,
		mapStations: [],
		mapPlaces: [],
		mapStationsAvailable: true,
		hasTrajectory: false,
		hasChapterShell: true,
		assets: ['/records/demo/index.webp'],
		images: null,
		linksCount: 1,
	};

	function discHtml(options: {
		id?: string;
		chapters?: Array<{ key: string; mode: string; label: string }>;
		paragraphs?: string[];
		notes?: Array<{ term: string; value: string }>;
		payload?: unknown | null;
		shell?: boolean;
		extraShell?: boolean;
		extraMap?: boolean;
		navLabels?: string[];
	} = {}): string {
		const id = options.id ?? 'demo';
		const chapters =
			options.chapters ??
			[
				{ key: 'record', mode: 'cover-scroll', label: '唱片' },
				{ key: 'story', mode: 'scroll', label: '述语' },
				{ key: 'notes', mode: 'list', label: '资料' },
			];
		const paragraphs = options.paragraphs ?? ['第一段。', '第二段。'];
		const notes = options.notes ?? [
			{ term: '艺人', value: '演奏者甲' },
			{ term: '状态', value: '已核' },
		];
		const nav = options.navLabels ?? chapters.map((chapter) => chapter.label);
		const body = chapters
			.map(
				(chapter) => `<section data-chapter data-chapter-kind="${chapter.key}" data-chapter-mode="${chapter.mode}" aria-label="${chapter.label}">
	${chapter.key === 'notes' ? `<dl data-chapter-list>${notes.map((note) => `<dt>${note.term}</dt><dd>${note.value}</dd>`).join('')}</dl>` : ''}
	${chapter.key === 'story' ? `<div data-chapter-prose>${paragraphs.map((text) => `<p class="disc-chapter-text">${text}</p>`).join('')}</div>` : ''}
</section>`,
			)
			.join('\n');
		const shell = () =>
			`<div data-disc-chapters><div data-chapters-stage>
${body}
</div><nav>${nav.map((label, index) => `<button data-chapter-goto="${index}">${label}</button>`).join('')}</nav></div>`;
		const map = () =>
			options.payload === null
				? ''
				: `<section data-traj-root data-payload="${escapeAttr(JSON.stringify(options.payload ?? { mode: 'embed', discs: [{ id, places: [] }] }))}"></section>`;
		const shells = options.shell === false ? '' : shell() + (options.extraShell ? shell() : '');
		const maps = map() + (options.extraMap ? map() : '');
		return `<html><body>${shells}${maps}</body></html>`;
	}

	function escapeAttr(value: string): string {
		return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
	}

	async function buildFixture(html: string): Promise<{ root: string; dist: string }> {
		const root = tempRoot('build');
		const dist = join(root, 'dist');
		mkdirSync(join(dist, 'records/demo'), { recursive: true });
		mkdirSync(join(dist, 'records/map'), { recursive: true });
		writeFileSync(join(dist, 'records/demo/index.html'), html);
		writeFileSync(join(dist, 'records/demo/index.webp'), Buffer.from('x'));
		writeFileSync(
			join(dist, 'records/map/index.html'),
			`<html><body><section data-traj-root data-payload="${escapeAttr(JSON.stringify({ mode: 'overview', discs: [] }))}"></section></body></html>`,
		);
		return { root, dist };
	}

	function run(dist: string, root: string, expectOverrides: Partial<RecordExpectation> = {}) {
		const freshness = new Map([['demo', { newestSourceMs: 0, files: ['fixture'] }]]);
		return compareBuild(
			[{ id: 'demo', expect: { ...expectation, ...expectOverrides }, findings: [] }],
			{ distRoot: dist, repoRoot: root, freshness, layoutPath: join(root, 'layout.json') },
		);
	}

	it('parses the real production markup shape and decodes the payload attribute', async () => {
		const html = readPage(
			'<div data-disc-chapters><section data-chapter data-chapter-kind="map" data-chapter-mode="map"></section>' +
				'<nav><button data-chapter-goto="0">地图</button></nav></div>' +
				'<section data-traj-root data-payload="{&quot;mode&quot;:&quot;embed&quot;,&quot;discs&quot;:[{&quot;id&quot;:&quot;x&quot;,&quot;places&quot;:[{&quot;id&quot;:&quot;s&quot;,&quot;year&quot;:1982}]}]}"></section>',
		);
		assert.deepEqual(html.chapters, [{ key: 'map', mode: 'map', label: '' }]);
		assert.deepEqual(html.navLabels, ['地图']);
		assert.equal(html.payload?.discs[0]?.places[0]?.year, 1982);
		assert.equal(html.mapRoots, 1);
	});

	it('passes a matching page', async () => {
		const site = await buildFixture(discHtml());
		const result = run(site.dist, site.root);
		assert.equal(result.findings.length, 0, result.findings.map((finding) => finding.code).join(','));
	});

	it('fails a missing route', async () => {
		const site = await buildFixture(discHtml());
		rmSync(join(site.dist, 'records/demo'), { recursive: true, force: true });
		const result = run(site.dist, site.root);
		assert.ok(result.findings.some((finding) => finding.code === 'BUILD_ROUTE_MISSING'));
	});

	it('fails a missing chapter and a wrong nav label', async () => {
		const site = await buildFixture(
			discHtml({
				chapters: [
					{ key: 'record', mode: 'cover-scroll', label: '唱片' },
					{ key: 'notes', mode: 'list', label: '资料' },
				],
				navLabels: ['唱片', '资料'],
			}),
		);
		const result = run(site.dist, site.root);
		assert.ok(result.findings.some((finding) => finding.code === 'BUILD_CHAPTER_SET_MISMATCH'));
	});

	// --- F2: the nav must point AT the chapter, not just carry its label ---
	// --- F5: enumerate every disc route and diff both directions ---
	it('fails a synthetic extra disc route that the source set does not contain', async () => {
		const site = await buildFixture(discHtml());
		mkdirSync(join(site.dist, 'records/synthetic-extra'), { recursive: true });
		writeFileSync(
			join(site.dist, 'records/synthetic-extra/index.html'),
			'<html><body><div data-disc-chapters></div></body></html>',
		);
		const result = run(site.dist, site.root);
		const hit = result.findings.find((finding) => finding.code === 'BUILD_ROUTE_EXTRA');
		assert.ok(hit, 'an extra page under records/ is a delivery difference');
		assert.deepEqual((hit!.actual as { extra: string[] }).extra, ['synthetic-extra']);
	});

	it('does not treat the overview, index page or non-disc neighbours as disc routes', async () => {
		const site = await buildFixture(discHtml());
		// /records/map/ (overview) and /records/ (index) already exist in the fixture.
		writeFileSync(join(site.dist, 'records/index.html'), '<html><body>目录</body></html>');
		const result = run(site.dist, site.root);
		assert.ok(!result.findings.some((finding) => finding.code === 'BUILD_ROUTE_EXTRA'));
	});

	it('fails a same-count route replacement', async () => {
		const site = await buildFixture(discHtml());
		// Two records in source, two disc routes on disk: `demo` + a replacement for
		// `other`. The counts match, so only a two-way diff can see it.
		mkdirSync(join(site.dist, 'records/replacement'), { recursive: true });
		writeFileSync(join(site.dist, 'records/replacement/index.html'), discHtml({ id: 'replacement' }));
		const replaced = compareBuild(
			[
				{ id: 'demo', expect: expectation, findings: [] },
				{ id: 'other', expect: expectation, findings: [] },
			],
			{
				distRoot: site.dist,
				repoRoot: site.root,
				freshness: new Map([
					['demo', { newestSourceMs: 0, files: ['fixture'] }],
					['other', { newestSourceMs: 0, files: ['fixture'] }],
				]),
				layoutPath: join(site.root, 'layout.json'),
			},
		);
		const codes = replaced.findings.map((finding) => finding.code);
		assert.ok(codes.includes('BUILD_ROUTE_MISSING'));
		assert.ok(codes.includes('BUILD_ROUTE_EXTRA'));
	});

	it('fails when every nav target index is out of range', async () => {
		const html = discHtml().replace(/data-chapter-goto="[^"]*"/g, 'data-chapter-goto="99"');
		const site = await buildFixture(html);
		const result = run(site.dist, site.root);
		const hit = result.findings.find((finding) => finding.code === 'BUILD_CHAPTER_NAV_MISMATCH');
		assert.ok(hit, 'labels were untouched, so only the binding check can catch this');
		assert.deepEqual(hit!.actual && (hit!.actual as { targets: number[] }).targets, [99, 99, 99]);
		assert.ok(!result.findings.some((finding) => finding.code === 'BUILD_CHAPTER_SET_MISMATCH'));
	});

	it('fails when nav targets are swapped but labels still match', async () => {
		// 唱片/述语/资料 labels stay in order; the buttons point at 1,0,2.
		const html = discHtml().replace(/data-chapter-goto="(\d+)"/g, (_whole, index) =>
			`data-chapter-goto="${['1', '0', '2'][Number(index)] ?? index}"`,
		);
		const site = await buildFixture(html);
		const result = run(site.dist, site.root);
		const hit = result.findings.find((finding) => finding.code === 'BUILD_CHAPTER_NAV_MISMATCH');
		assert.ok(hit);
		assert.deepEqual((hit!.actual as { targets: number[] }).targets, [1, 0, 2]);
		assert.ok(result.byId.get('demo')!.navTargetsMatch === false);
	});

	it('passes when nav targets are the DOM chapter indexes in order', async () => {
		const site = await buildFixture(discHtml());
		const result = run(site.dist, site.root);
		assert.ok(!result.findings.some((finding) => finding.code === 'BUILD_CHAPTER_NAV_MISMATCH'));
		assert.equal(result.byId.get('demo')!.navTargetsMatch, true);
	});

	it('fails when the nav label points at a chapter with a different label', async () => {
		// Labels and index order are internally consistent, but the pane at index 1
		// is 资料 while the button says 述语: the nav is bound to the wrong chapter.
		const html = discHtml().replace(
			'aria-label="资料">',
			'aria-label="述语">',
		);
		const site = await buildFixture(html);
		const result = run(site.dist, site.root);
		const hit = result.findings.find((finding) => finding.code === 'BUILD_CHAPTER_SET_MISMATCH');
		assert.ok(hit);
		assert.deepEqual((hit!.actual as { labels: string[] }).labels, ['唱片', '述语', '述语']);
	});

	it('fails dropped paragraphs even when the count matches', async () => {
		const site = await buildFixture(discHtml({ paragraphs: ['第一段。', '换掉的第二段。'] }));
		const result = run(site.dist, site.root);
		const hit = result.findings.find((finding) => finding.code === 'BUILD_STORY_PARAGRAPH_MISMATCH');
		assert.ok(hit);
		assert.equal((result.byId.get('demo')?.storyParagraphs.actual ?? 0) > 0, true);
	});

	it('fails a missing or unparseable payload', async () => {
		const site = await buildFixture(discHtml({ payload: null }));
		const result = run(site.dist, site.root, { hasTrajectory: true, mapStations: [{ id: 's', year: 1900 }] });
		assert.ok(result.findings.some((finding) => finding.code === 'BUILD_PAYLOAD_INVALID' || finding.code === 'BUILD_MAP_CHAPTER_MISSING'));
	});

	it('fails dropped map stations and unknown turned into a year', async () => {
		const site = await buildFixture(
			discHtml({ payload: { mode: 'embed', discs: [{ id: 'demo', places: [{ id: 'a', year: 1982 }] }] } }),
		);
		const result = run(site.dist, site.root, {
			hasTrajectory: true,
			mapStations: [
				{ id: 'a', year: 1900 },
				{ id: 'b', year: 1901 },
			],
		});
		assert.ok(result.findings.some((finding) => finding.code === 'BUILD_MAP_STATIONS_MISMATCH'));
	});

	// --- F3: the real expanded place semantics must survive into the page ---
	const place = (overrides: Record<string, unknown> = {}) => ({
		id: 'hamburg',
		year: 1809,
		cityZh: '汉堡',
		city: 'Hamburg',
		role: 'birth',
		lon: 10.001,
		lat: 53.55,
		zoom: 7,
		blurb: '费利克斯·门德尔松 1809 年生于汉堡。',
		...overrides,
	});

	it('fails when map coordinates and blurbs are altered but ids/years still match', async () => {
		const source = [place({ id: 'a' }), place({ id: 'b', year: 1845, yearLabel: '1845-03-13', lon: 12.375, lat: 51.341 })];
		const delivered = source.map((entry) => ({ ...entry, lon: 0, lat: 0, blurb: 'SYNTH corrupted delivery' }));
		const site = await buildFixture(discHtml({ payload: { mode: 'embed', discs: [{ id: 'demo', places: delivered }] } }));
		const result = run(site.dist, site.root, { hasTrajectory: true, mapStations: source, mapPlaces: source });
		const hit = result.findings.find((finding) => finding.code === 'BUILD_MAP_PLACE_FIELD_MISMATCH');
		assert.ok(hit, 'id/year were untouched, so only the field comparison catches this');
		const actual = hit!.actual as { mismatched: Array<{ index: number; fields: string[] }> };
		assert.deepEqual(actual.mismatched[0]!.fields.sort(), ['blurb', 'lat', 'lon']);
		assert.equal(result.byId.get('demo')!.mapStations.match, true);
		assert.equal(result.byId.get('demo')!.mapPlaceFields.mismatch, 2);
	});

	it('fails when a pointer station loses its eventId or its date-precision label', async () => {
		const source = [place({ id: 'a', eventId: 'evt-a', yearLabel: '1889-01-15' })];
		const noEvent = [{ ...source[0]!, eventId: undefined }];
		const site = await buildFixture(discHtml({ payload: { mode: 'embed', discs: [{ id: 'demo', places: noEvent }] } }));
		const result = run(site.dist, site.root, { hasTrajectory: true, mapStations: source, mapPlaces: source });
		const hit = result.findings.find((finding) => finding.code === 'BUILD_MAP_PLACE_FIELD_MISMATCH');
		assert.ok(hit);
		assert.deepEqual((hit!.actual as { mismatched: Array<{ fields: string[] }> }).mismatched[0]!.fields.sort(), ['eventId']);

		// A date label degraded to a bare year is a precision/evidence loss, not a pass.
		const degraded = [{ ...source[0]!, yearLabel: '1889' }];
		const site2 = await buildFixture(discHtml({ payload: { mode: 'embed', discs: [{ id: 'demo', places: degraded }] } }));
		const result2 = run(site2.dist, site2.root, { hasTrajectory: true, mapStations: source, mapPlaces: source });
		const hit2 = result2.findings.find((finding) => finding.code === 'BUILD_MAP_PLACE_FIELD_MISMATCH');
		assert.ok(hit2);
		assert.deepEqual((hit2!.actual as { mismatched: Array<{ fields: string[] }> }).mismatched[0]!.fields, ['yearLabel']);
	});

	it('delivers the pending-contract sentinel as-is instead of pretending it is a real year', async () => {
		// d37779/utrecht shape: year 1982 with yearLabel "—". Source keeps it as a
		// pending-contract ERROR; the build must render the same pair, never 1982 alone.
		const source = [place({ id: 'utrecht-1982', year: 1982, yearLabel: '—' })];
		const dropped = [{ ...source[0]!, yearLabel: undefined }];
		const site = await buildFixture(discHtml({ payload: { mode: 'embed', discs: [{ id: 'demo', places: dropped }] } }));
		const result = run(site.dist, site.root, { hasTrajectory: true, mapStations: source, mapPlaces: source });
		const hit = result.findings.find((finding) => finding.code === 'BUILD_MAP_PLACE_FIELD_MISMATCH');
		assert.ok(hit);
		assert.deepEqual((hit!.actual as { mismatched: Array<{ fields: string[] }> }).mismatched[0]!.fields, ['yearLabel']);

		const faithful = await buildFixture(
			discHtml({ payload: { mode: 'embed', discs: [{ id: 'demo', places: source }] } }),
		);
		const ok = run(faithful.dist, faithful.root, { hasTrajectory: true, mapStations: source, mapPlaces: source });
		assert.ok(!ok.findings.some((finding) => finding.code === 'BUILD_MAP_PLACE_FIELD_MISMATCH'));
	});

	// --- F4: the展示 images must actually be referenced by the page ---
	const imagesExpectation = (
		hero: { src: string; width: number; height: number } | null = null,
	): DisplayImageMap => ({
		// The default fixture renders the chapter shell, so the page has no hero <img>.
		hero,
		details: [
			{
				part: 'cover',
				mode: 'reveal',
				plate: { src: '/records/demo/cover.webp', width: 400, height: 668 },
				upright: {
					src: '/records/demo/cover-upright.webp',
					width: 1400,
					height: 989,
					crop: { x: 17, y: 49, w: 549, h: 918 },
				},
			},
		],
	});

	function imageHtml(): string {
		return discHtml().replace(
			'<html><body>',
			'<html><body>' +
				'<figure data-part="cover" data-mode="reveal" data-plate-width="400" data-plate-height="668">' +
				'<img class="plate" src="/records/demo/cover.webp" width="400" height="668" alt="封套细节">' +
				'<img class="upright" src="/records/demo/cover-upright.webp" width="1400" height="989" ' +
				'data-crop-x="17" data-crop-y="49" data-crop-w="549" data-crop-h="918">' +
				'</figure>',
		);
	}

	it('fails when every image src is removed from the page but the assets stay on disk', async () => {
		const html = imageHtml()
			.replace(/<img\b[^>]*?\ssrc="[^"]*"/g, (whole) => whole.replace(/\ssrc="[^"]*"/, ''))
			.replace(/<img\b[^>]*?\ssrc="[^"]*"/g, (whole) => whole.replace(/\ssrc="[^"]*"/, ''));
		const site = await buildFixture(html);
		const result = run(site.dist, site.root, { images: imagesExpectation() });
		const hit = result.findings.find((finding) => finding.code === 'BUILD_IMAGE_NOT_RENDERED');
		assert.ok(hit, 'assets still exist in dist, so only a page-reference check can catch this');
		assert.deepEqual(
			(hit!.actual as { missing: string[] }).missing.sort(),
			['/records/demo/cover-upright.webp', '/records/demo/cover.webp'],
		);
		assert.equal(result.byId.get('demo')!.images.rendered, 0);
	});

	it('passes when the plate and the layout-derived crop are both rendered', async () => {
		const site = await buildFixture(imageHtml());
		const result = run(site.dist, site.root, { images: imagesExpectation() });
		assert.ok(!result.findings.some((finding) => finding.code === 'BUILD_IMAGE_NOT_RENDERED'));
		assert.equal(result.byId.get('demo')!.images.rendered, 2);
	});

	it('fails when the crop geometry does not match the layout transform', async () => {
		const html = imageHtml().replace('data-crop-w="549"', 'data-crop-w="550"');
		const site = await buildFixture(html);
		const result = run(site.dist, site.root, { images: imagesExpectation() });
		const hit = result.findings.find((finding) => finding.code === 'BUILD_IMAGE_CROP_MISMATCH');
		assert.ok(hit);
		const mismatched = (hit!.actual as { mismatched: Array<{ fields: string[] }> }).mismatched;
		assert.deepEqual(mismatched[0]!.fields.sort(), ['w']);
	});

	it('fails a page that references a replaced image the layout never produced', async () => {
		const html = imageHtml().replace(
			'src="/records/demo/cover.webp"',
			'src="/records/demo/other-cover.webp"',
		);
		const site = await buildFixture(html);
		const result = run(site.dist, site.root, { images: imagesExpectation() });
		assert.ok(result.findings.some((finding) => finding.code === 'BUILD_IMAGE_NOT_RENDERED'));
		const hit = result.findings.find((finding) => finding.code === 'BUILD_IMAGE_UNEXPECTED_SOURCE');
		assert.ok(hit);
		assert.deepEqual((hit!.actual as { sources: string[] }).sources, ['/records/demo/other-cover.webp']);
	});

	it('does not require a hero on the reveal render path and requires it otherwise', async () => {
		// Reveal path: the page renders the chapter shell and no hero <img>.
		const revealSite = await buildFixture(imageHtml());
		const expectation = imagesExpectation();
		const revealRun = run(revealSite.dist, revealSite.root, {
			images: expectation,
			hasChapterShell: true,
		});
		assert.ok(!revealRun.findings.some((finding) => finding.code === 'BUILD_IMAGE_NOT_RENDERED'));

		// Non-reveal path: the hero is the only record visual and must be referenced.
		const plainSite = await buildFixture(discHtml({ shell: false }));
		const plainRun = run(plainSite.dist, plainSite.root, {
			images: imagesExpectation({ src: '/records/demo/hero.webp', width: 640, height: 452 }),
			hasChapterShell: false,
			chapters: [],
			storyParagraphs: [],
			notesFields: [],
			assets: [],
		});
		const hit = plainRun.findings.find((finding) => finding.code === 'BUILD_IMAGE_NOT_RENDERED');
		assert.ok(hit);
		// No chapter shell ⇒ no plate/upright either; the hero is the only visual.
		assert.ok((hit!.actual as { missing: string[] }).missing.includes('/records/demo/hero.webp'));
	});

	it('fails a missing derived asset but ignores the contract-hidden runout', async () => {
		const site = await buildFixture(discHtml());
		const result = run(site.dist, site.root, { assets: ['/records/demo/index.webp', '/records/demo/cover.webp'] });
		const hit = result.findings.find((finding) => finding.code === 'BUILD_ASSET_MISSING');
		assert.ok(hit);
		assert.deepEqual(hit!.actual, { missing: ['records/demo/cover.webp'] });
	});

	it('does not expect a contract-hidden runout asset and does not fail the count mismatch', async () => {
		const site = await buildFixture(discHtml());
		// A runout is exported but never rendered; only plate/upright layouts are expected.
		const result = run(site.dist, site.root, { assets: ['/records/demo/index.webp'] });
		assert.ok(!result.findings.some((finding) => finding.code === 'BUILD_ASSET_MISSING'));
		const report = result.byId.get('demo')!;
		assert.equal(report.assets.missing.length, 0);
	});

	it('treats a stale dist as a build input problem, not missing content', async () => {
		const site = await buildFixture(discHtml());
		const result = compareBuild(
			[{ id: 'demo', expect: expectation, findings: [] }],
			{
				distRoot: site.dist,
				repoRoot: site.root,
				freshness: new Map([['demo', { newestSourceMs: Date.now() + 60_000, files: ['fixture'] }]]),
				layoutPath: join(site.root, 'layout.json'),
			},
		);
		assert.ok(result.findings.some((finding) => finding.code === 'BUILD_STALE'));
	});

	it('flags duplicate chapter shells and map roots', async () => {
		const site = await buildFixture(discHtml({ extraShell: true, extraMap: true }));
		const result = run(site.dist, site.root);
		assert.ok(result.findings.some((finding) => finding.code === 'BUILD_DUPLICATE_CHAPTER_SHELL'));
		assert.ok(result.findings.some((finding) => finding.code === 'BUILD_DUPLICATE_MAP_ROOT'));
	});

	it('does not count a hidden template or Pagefind cache as delivered text', async () => {
		const site = await buildFixture(
			discHtml({ paragraphs: [] }).replace('</body>', '<template><p class="disc-chapter-text">隐藏模板正文</p></template><div data-pagefind-index>搜索缓存</div></body>'),
		);
		const result = run(site.dist, site.root);
		const report = result.byId.get('demo')!;
		assert.equal(report.storyParagraphs.actual, 0);
		assert.ok(result.findings.some((finding) => finding.code === 'BUILD_STORY_PARAGRAPH_MISMATCH'));
	});

	it('accepts a legitimately hidden matrix field as an expected difference', async () => {
		const site = await buildFixture(
			discHtml({
				notes: [
					{ term: '艺人', value: '演奏者甲' },
					{ term: '状态', value: '已核' },
				],
			}),
		);
		// Source expectation without 内圈刻字: the disc status hides it.
		const result = run(site.dist, site.root, {
			notesFields: [
				{ term: '艺人', value: '演奏者甲' },
				{ term: '状态', value: '已核' },
			],
			notesConditionsAvailable: true,
		});
		assert.ok(!result.findings.some((finding) => finding.code === 'BUILD_NOTES_FIELD_MISMATCH'));
	});

	it('fails when a field that should be visible is dropped from the build', async () => {
		const site = await buildFixture(discHtml());
		const result = run(site.dist, site.root, {
			notesFields: [
				{ term: '艺人', value: '演奏者甲' },
				{ term: '内圈刻字', value: 'A 面刻字' },
				{ term: '状态', value: '已核' },
			],
		});
		assert.ok(result.findings.some((finding) => finding.code === 'BUILD_NOTES_FIELD_MISMATCH'));
	});

	it('fails the overview when its disc set is not the dynamic trajectory set', async () => {
		const site = await buildFixture(discHtml());
		const result = run(site.dist, site.root, { hasTrajectory: true, mapStations: [] });
		assert.ok(result.findings.some((finding) => finding.code === 'BUILD_OVERVIEW_DISC_SET_MISMATCH'));
	});

	it('computes source freshness from the real inputs', async () => {
		const site = await buildFixture(discHtml());
		const freshness = sourceFreshness(
			[{ id: 'demo', root: join(site.root, 'records'), recordPath: join(site.root, 'records/records/demo/record.json'), storyPath: join(site.root, 'records/records/demo/story.md') }],
			join(site.root, 'src/data/records-layout.json'),
		);
		assert.ok(freshness.get('demo'));
	});
});

describe('build receipt provenance (F5)', () => {
	function receiptPage(id: string): string {
		return `<html><body><div data-disc-chapters><section data-chapter data-chapter-kind="record" data-chapter-mode="cover-scroll" aria-label="唱片"></section><nav><button data-chapter-goto="0">唱片</button></nav></div></body></html>`.replaceAll('disc-chapters', `disc-chapters data-record-id="${id}"`);
	}

	function receiptFor(root: string, dist: string, overrides: Partial<BuildReceipt> = {}): BuildReceipt {
		const receipt = buildReceipt({
			repoRoot: root,
			distRoot: dist,
			command: 'npm run build',
			exitCode: 0,
			startedAt: '2026-01-01T00:00:00.000Z',
			finishedAt: '2026-01-01T00:01:00.000Z',
			sourceHead: 'deadbeef',
			sourceDirty: false,
		});
		return { ...receipt, ...overrides };
	}

	it('fingerprints real inputs and outputs, not mtimes', async () => {
		const site = await buildSite('receiptfp', { records: [{ id: 'receipt01' }] });
		const dist = join(site.root, 'dist');
		mkdirSync(join(dist, 'records/receipt01'), { recursive: true });
		writeFileSync(join(dist, 'records/receipt01/index.html'), '<html><body>page</body></html>');
		writeFileSync(join(dist, 'records/receipt01/cover.webp'), Buffer.from('asset'));

		const input = inputFingerprint(site.root);
		assert.ok(input.parts.some((part) => part.name === 'records/index.json'));
		assert.ok(input.parts.some((part) => part.name.endsWith('receipt01/record.json')));
		assert.ok(input.parts.some((part) => part.name.endsWith('receipt01/story.md')));
		assert.ok(input.parts.some((part) => part.name.includes('records-layout.json')));

		const output = outputFingerprint(dist);
		assert.deepEqual(output.pages.map((page) => page.id), ['receipt01']);
		assert.deepEqual(output.assets.map((asset) => asset.path), ['records/receipt01/cover.webp']);

		// Editing a source byte changes the input hash; touching cannot put it back.
		const storyPath = join(site.root, 'records/records/receipt01/story.md');
		const before = inputFingerprint(site.root).sha256;
		writeFileSync(storyPath, `${readFileSync(storyPath, 'utf8')}\n多一行。\n`);
		assert.notEqual(inputFingerprint(site.root).sha256, before);
	});

	it('accepts only a receipt whose input and output still match', async () => {
		const site = await buildSite('receiptok', { records: [{ id: 'receipt02' }] });
		const dist = join(site.root, 'dist');
		mkdirSync(join(dist, 'records/receipt02'), { recursive: true });
		writeFileSync(join(dist, 'records/receipt02/index.html'), '<html><body>page</body></html>');
		const receipt = receiptFor(site.root, dist);
		const ok = verifyReceipt(receipt, { repoRoot: site.root, distRoot: dist, sourceHead: 'deadbeef' });
		assert.equal(ok.status, 'ok');

		// A different commit is foreign.
		const foreign = verifyReceipt(receipt, { repoRoot: site.root, distRoot: dist, sourceHead: 'cafebabe' });
		assert.notEqual(foreign.status, 'ok');
		if (foreign.status !== 'ok') assert.equal(foreign.code, 'BUILD_PROVENANCE_FOREIGN');

		// A changed source byte invalidates it.
		const storyPath = join(site.root, 'records/records/receipt02/story.md');
		writeFileSync(storyPath, '被改过的述语。\n');
		const staleInput = verifyReceipt(receipt, { repoRoot: site.root, distRoot: dist, sourceHead: 'deadbeef' });
		if (staleInput.status === 'ok') assert.fail('a changed source must invalidate the receipt');
		assert.equal(staleInput.code, 'BUILD_PROVENANCE_INPUT_MISMATCH');
	});

	it('rejects a dist that was touched, edited or copied after the build', async () => {
		const site = await buildSite('receiptout', { records: [{ id: 'receipt03' }] });
		const dist = join(site.root, 'dist');
		mkdirSync(join(dist, 'records/receipt03'), { recursive: true });
		const page = join(dist, 'records/receipt03/index.html');
		writeFileSync(page, '<html><body>page</body></html>');
		const receipt = receiptFor(site.root, dist);

		// mtime-only freshness would call this fine; the receipt must not.
		const future = new Date(Date.now() + 3_600_000);
		utimesSync(page, future, future);
		assert.equal(
			verifyReceipt(receipt, { repoRoot: site.root, distRoot: dist, sourceHead: 'deadbeef' }).status,
			'ok',
			'a pure touch does not change content, so the content fingerprint still matches',
		);

		writeFileSync(page, '<html><body>hand-edited after the build</body></html>');
		const edited = verifyReceipt(receipt, { repoRoot: site.root, distRoot: dist, sourceHead: 'deadbeef' });
		if (edited.status === 'ok') assert.fail('an edited page must invalidate the receipt');
		assert.equal(edited.code, 'BUILD_PROVENANCE_OUTPUT_MISMATCH');

		// A copied old dist (new mtimes, same bytes, extra route) is also caught.
		writeFileSync(page, '<html><body>page</body></html>');
		mkdirSync(join(dist, 'records/receipt03b'), { recursive: true });
		writeFileSync(join(dist, 'records/receipt03b/index.html'), '<html><body>old copy</body></html>');
		const copied = verifyReceipt(receipt, { repoRoot: site.root, distRoot: dist, sourceHead: 'deadbeef' });
		if (copied.status === 'ok') assert.fail('an extra route must invalidate the receipt');
		assert.equal(copied.code, 'BUILD_PROVENANCE_OUTPUT_MISMATCH');
	});

	it('rejects a failed build receipt and an unreadable one', async () => {
		const site = await buildSite('receiptbad', { records: [{ id: 'receipt04' }] });
		const dist = join(site.root, 'dist');
		mkdirSync(join(dist, 'records/receipt04'), { recursive: true });
		writeFileSync(join(dist, 'records/receipt04/index.html'), '<html><body>page</body></html>');
		const failed = receiptFor(site.root, dist, {
			build: { ok: false, exitCode: 1, startedAt: '2026-01-01T00:00:00.000Z', finishedAt: '2026-01-01T00:01:00.000Z' },
		});
		const verdict = verifyReceipt(failed, { repoRoot: site.root, distRoot: dist, sourceHead: 'deadbeef' });
		if (verdict.status === 'ok') assert.fail('a failed build cannot prove a working dist');
		assert.equal(verdict.code, 'BUILD_PROVENANCE_FAILED_BUILD');
		assert.equal(verifyReceipt({ nonsense: true }, { repoRoot: site.root, distRoot: dist, sourceHead: null }).status, 'unverified');
	});

	it('enumerates disc routes and ignores the overview by its real payload', async () => {
		const root = tempRoot('routes');
		const dist = join(root, 'dist');
		mkdirSync(join(dist, 'records/demo'), { recursive: true });
		mkdirSync(join(dist, 'records/map'), { recursive: true });
		writeFileSync(join(dist, 'records/demo/index.html'), receiptPage('demo'));
		writeFileSync(
			join(dist, 'records/map/index.html'),
			'<html><body><section data-traj-root data-payload="{&quot;mode&quot;:&quot;overview&quot;,&quot;discs&quot;:[]}"></section></body></html>',
		);
		const enumerated = enumerateDiscRoutes(dist);
		assert.deepEqual(enumerated.ids, ['demo']);
		assert.deepEqual(enumerated.ignored, ['map']);
	});

	it('makes a build-layer audit without a receipt exit 2 instead of claiming provenance', async () => {
		const site = await buildSite('receiptcli', { records: [{ id: 'receipt05' }] });
		const dist = join(site.root, 'dist');
		mkdirSync(join(dist, 'records/map'), { recursive: true });
		writeFileSync(join(dist, 'records/map/index.html'), '<html><body></body></html>');
		const out = join(site.root, 'out');
		const code = await main([
			'audit',
			'--repo-root',
			site.root,
			'--dist',
			dist,
			'--out',
			out,
			'--source-head',
			'fixture',
			'--quiet',
		]);
		assert.equal(code, 2);
		const report = JSON.parse(readFileSync(join(out, 'catalog-report.json'), 'utf8'));
		assert.ok(report.findings.some((finding: Finding) => finding.code === 'BUILD_PROVENANCE_MISSING'));
		assert.equal(report.execution.ok, false);
		assert.equal(report.coverage.complete, false);
	});

	it('rejects a receipt for another commit even when the files look right', async () => {
		const site = await buildSite('receiptforeign', { records: [{ id: 'receipt06' }] });
		const dist = join(site.root, 'dist');
		mkdirSync(join(dist, 'records/receipt06'), { recursive: true });
		writeFileSync(join(dist, 'records/receipt06/index.html'), receiptPage('receipt06'));
		mkdirSync(join(dist, 'records/map'), { recursive: true });
		writeFileSync(join(dist, 'records/map/index.html'), '<html><body></body></html>');
		const receiptPath = join(site.root, 'receipt.json');
		writeFileSync(receiptPath, JSON.stringify(receiptFor(site.root, dist)));
		const out = join(site.root, 'out');
		const code = await main([
			'audit',
			'--repo-root',
			site.root,
			'--dist',
			dist,
			'--receipt',
			receiptPath,
			'--out',
			out,
			'--source-head',
			'0123456789abcdef',
			'--quiet',
		]);
		assert.equal(code, 2);
		const report = JSON.parse(readFileSync(join(out, 'catalog-report.json'), 'utf8'));
		const hit = report.findings.find((finding: Finding) => finding.code === 'BUILD_PROVENANCE_MISMATCH');
		assert.ok(hit);
		assert.match(String(hit.reason), /deadbeef|commit/);
	});

	it('accepts a receipt that verifies for this commit', async () => {
		const site = await buildSite('receiptpass', { records: [{ id: 'receipt07' }] });
		const dist = join(site.root, 'dist');
		mkdirSync(join(dist, 'records/receipt07'), { recursive: true });
		writeFileSync(join(dist, 'records/receipt07/index.html'), receiptPage('receipt07'));
		mkdirSync(join(dist, 'records/map'), { recursive: true });
		writeFileSync(join(dist, 'records/map/index.html'), '<html><body></body></html>');
		const receiptPath = join(site.root, 'receipt.json');
		writeFileSync(receiptPath, JSON.stringify(receiptFor(site.root, dist)));
		const out = join(site.root, 'out');
		await main([
			'audit',
			'--repo-root',
			site.root,
			'--dist',
			dist,
			'--receipt',
			receiptPath,
			'--out',
			out,
			'--source-head',
			'deadbeef',
			'--quiet',
		]);
		const report = JSON.parse(readFileSync(join(out, 'catalog-report.json'), 'utf8'));
		assert.ok(!report.findings.some((finding: Finding) => finding.code.startsWith('BUILD_PROVENANCE')));
		assert.equal(report.records[0].build.provenance, 'ok');
		assert.ok(report.coverage.requiredChecks.some((check: { id: string; status: string }) => check.id === 'build-provenance' && check.status === 'pass'));
	});
});

describe('whole-model oracle failure', () => {
	async function brokenOracleSite(label: string): Promise<string> {
		// The layout is missing a record: the production records.ts merge throws.
		const site = await buildSite(label, { records: [{ id: 'ok000001' }, { id: 'nolayout' }] });
		const layoutPath = join(site.root, 'src/data/records-layout.json');
		const layout = JSON.parse(readFileSync(layoutPath, 'utf8')) as Array<{ id: string }>;
		writeFileSync(layoutPath, JSON.stringify(layout.filter((entry) => entry.id !== 'nolayout'), null, 2));
		return site.root;
	}

	it('keeps every raw row on a source-only run and does not claim build-layer success', async () => {
		const root = await brokenOracleSite('oraclefail');
		const out = join(root, 'out');
		const code = await main(['audit', '--repo-root', root, '--out', out, '--source-head', 'fixture', '--quiet']);
		const report = JSON.parse(readFileSync(join(out, 'catalog-report.json'), 'utf8'));
		assert.equal(report.records.length, 2, 'every raw inventory row must survive the oracle failure');
		assert.ok(
			report.notChecked.some(
				(entry: { code: string; dependency: string | null }) => entry.code === 'BUILD_MODEL_BLOCKED' && entry.dependency === 'records.ts',
			),
		);
		// Source-only does not request the build layer, so the oracle failure is a
		// not-checked dependency (per PRD §12.1 a per-disc schema error is exit 1
		// when every row is reported). It can never be reported as build success.
		assert.equal(
			report.coverage.requiredChecks.some((check: { id: string }) => check.id === 'whole-model-oracle'),
			false,
		);
		assert.ok(code === 0 || code === 1);
		// The dependent checks are explicitly not-checked, not silently passed.
		assert.ok(report.notChecked.some((entry: { code: string }) => entry.code === 'BUILD_MODEL_BLOCKED'));
		assert.equal(report.records[0].expect?.notesConditionsAvailable, false);
	});

	it('blocks the requested build layer and exits 2 when the oracle fails', async () => {
		const root = await brokenOracleSite('oraclebuild');
		const dist = join(root, 'dist');
		mkdirSync(join(dist, 'records'), { recursive: true });
		const out = join(root, 'out');
		const code = await main([
			'audit',
			'--repo-root',
			root,
			'--dist',
			dist,
			'--out',
			out,
			'--source-head',
			'fixture',
			'--quiet',
		]);
		assert.equal(code, 2);
		const report = JSON.parse(readFileSync(join(out, 'catalog-report.json'), 'utf8'));
		assert.equal(report.records.length, 2);
		const blocked = report.coverage.requiredChecks.find((check: { id: string }) => check.id === 'whole-model-oracle');
		assert.equal(blocked.status, 'blocked');
		assert.match(blocked.reason, /records-layout|记录|不存在|layout/);
		assert.equal(report.conclusion, 'execution-or-coverage-incomplete');
	});

	it('does not import the real records.ts as an empty catalog', async () => {
		const site = await buildSite('oracleempty', { records: [{ id: 'ok000002' }] });
		rmSync(join(site.root, 'src/data/records-layout.json'), { force: true });
		const state = await loadModel(site.root);
		assert.equal(state.ok, false);
		if (!state.ok) assert.ok(state.reason.length > 0);
	});
});

describe('report and exit matrix', () => {
	function reportWith(findings: Finding[], overrides: Partial<CatalogReport> = {}): CatalogReport {
		const report: CatalogReport = {
			reportVersion: 1,
			generatedAt: '2026-01-01T00:00:00.000Z',
			generatedAtSgt: '2026-01-01 08:00:00 +08:00',
			mode: 'audit',
			requestedLayers: ['source'],
			notRequestedLayers: ['build', 'live'],
			repoRoot: '/repo',
			sourceHead: 'abcdef',
			sourceDirty: false,
			input: { exportRoot: '/repo/records', legacyRoot: '/repo/records-legacy', layout: null, dist: null, scope: 'full' },
			fingerprints: {},
			routes: null,
			summary: emptySummary(),
			coverage: {
				complete: true,
				requiredChecks: [
					{ id: 'inventory-identity', status: 'pass', reason: null },
					{ id: 'photo-decode', status: 'pass', reason: null },
				],
				expectedIds: ['a'],
				observedIds: ['a'],
				missingIds: [],
				extraIds: [],
			},
			execution: { ok: true, errors: [] },
			records: [],
			findings: sortFindings(findings),
			notChecked: [],
			conclusion: 'pass',
			...overrides,
		};
		assignFindingKeys(report.findings);
		return report;
	}

	// F1: only the explicit legacy-semantics codes may ever be baselined, so the
	// exit-matrix tests use one of them instead of an arbitrary fake code.
	function errorFinding(code = 'TRAJECTORY_GUIDE_ORDER_INVERSION', recordId = 'a'): Finding {
		return {
			key: '',
			baselineId: null,
			code,
			severity: 'error',
			layer: 'source',
			status: 'active',
			recordId,
			fieldPath: 'field',
			stationId: null,
			expected: { ok: true },
			actual: { value: 1 },
			reason: 'fixture',
			recommendation: 'fix it',
			evidence: [],
		};
	}

	const today = '2026-06-01T00:00:00.000Z';

	it('audit exits 0 on a clean report and marks warnings/not-checked separately', () => {
		const report = reportWith([]);
		const evaluation = evaluateExit(report, 'audit', null, null, today);
		assert.equal(evaluation.code, 0);
		assert.equal(evaluation.conclusion, 'pass');
	});

	it('audit exits 1 with an active error, even though the report was written', () => {
		const report = reportWith([errorFinding()]);
		assert.equal(evaluateExit(report, 'audit', null, null, today).code, 1);
	});

	it('audit exits 2 when the authoritative set is incomplete', () => {
		const report = reportWith([], { coverage: { complete: false, requiredChecks: [], expectedIds: [], observedIds: [], missingIds: [], extraIds: [] } });
		const evaluation = evaluateExit(report, 'audit', null, null, today);
		assert.equal(evaluation.code, 2);
		assert.equal(evaluation.conclusion, 'execution-or-coverage-incomplete');
	});

	it('audit exits 2 when a required check is blocked', () => {
		const report = reportWith([], {
			coverage: {
				complete: true,
				requiredChecks: [{ id: 'photo-decode', status: 'blocked', reason: 'sharp missing' }],
				expectedIds: ['a'],
				observedIds: ['a'],
				missingIds: [],
				extraIds: [],
			},
		});
		assert.equal(evaluateExit(report, 'audit', null, null, today).code, 2);
	});

	it('audit keeps approved baseline errors at exit 1 and still labels them', () => {
		const finding = errorFinding();
		const baseline = {
			schemaVersion: 1 as const,
			entries: [
				{
					code: finding.code,
					recordId: finding.recordId,
					fieldPath: finding.fieldPath,
					valueSha256: findingValueSha(finding),
					reason: 'approved old semantic error',
					approvedBy: 'curator',
					approvedAt: '2026-01-01',
					reviewBy: '2099-01-01',
				},
			],
		};
		const report = reportWith([errorFinding()]);
		const audit = evaluateExit(report, 'audit', baseline, null, today);
		assert.equal(audit.code, 1);
		assert.equal(audit.conclusion, 'accepted-baseline-issues');
		assert.equal(report.findings[0]!.status, 'accepted-baseline');

		const ratchet = evaluateExit(report, 'ratchet', baseline, null, today);
		assert.equal(ratchet.code, 0);
		assert.equal(ratchet.conclusion, 'accepted-baseline-issues');
	});

	it('ratchet fails a changed hash, an expired exception and a new error', () => {
		const finding = errorFinding();
		const good = findingValueSha(finding);
		const changed = reportWith([{ ...errorFinding(), actual: { value: 2 } }]);
		const baseline = {
			schemaVersion: 1 as const,
			entries: [
				{ code: 'TRAJECTORY_GUIDE_ORDER_INVERSION', recordId: 'a', fieldPath: 'field', valueSha256: good, reason: 'r', approvedBy: 'c', approvedAt: '2026-01-01', reviewBy: '2099-01-01' },
			],
		};
		assert.equal(evaluateExit(changed, 'ratchet', baseline, null, today).code, 1);

		const expired = {
			schemaVersion: 1 as const,
			entries: [{ ...baseline.entries[0]!, reviewBy: '2026-01-01' }],
		};
		assert.equal(evaluateExit(reportWith([errorFinding()]), 'ratchet', expired, null, today).code, 1);

		const unmatched = reportWith([{ ...errorFinding(), stationId: 'other' }]);
		assert.equal(evaluateExit(unmatched, 'ratchet', baseline, null, today).code, 1);
	});

	it('ratchet exits 2 without a baseline or with an unreadable one and 1 for an overbroad one', () => {
		const report = reportWith([errorFinding()]);
		assert.equal(evaluateExit(report, 'ratchet', null, null, today).code, 2);
		assert.equal(evaluateExit(report, 'ratchet', null, { kind: 'unreadable', reason: 'bad json' }, today).code, 2);
		assert.equal(evaluateExit(report, 'ratchet', null, { kind: 'overbroad', reason: 'wildcard' }, today).code, 1);
	});

	it('detects wildcard, ignore-all and malformed baselines', () => {
		assert.equal(isOverbroadBaseline(null)?.kind, 'unreadable');
		assert.equal(isOverbroadBaseline({ schemaVersion: 2, entries: [] })?.kind, 'unreadable');
		assert.equal(
			isOverbroadBaseline({ schemaVersion: 1, entries: [{ code: '*', valueSha256: 'a'.repeat(64), reason: 'r', approvedBy: 'c', approvedAt: 'd', reviewBy: 'e' }] })?.kind,
			'overbroad',
		);
		assert.equal(
			isOverbroadBaseline({ schemaVersion: 1, entries: [{ code: 'X', valueSha256: '*', reason: 'r', approvedBy: 'c', approvedAt: 'd', reviewBy: 'e' }] })?.kind,
			'overbroad',
		);
		assert.equal(
			isOverbroadBaseline({ schemaVersion: 1, entries: [{ code: 'X', valueSha256: 'a'.repeat(64), reason: 'r', approvedBy: 'c', approvedAt: 'd' }] })?.kind,
			'unreadable',
		);
	});

	// --- F1: only an explicit legacy-semantics allowlist may ever be baselined ---
	function inversionFinding(overrides: Partial<Finding> = {}): Finding {
		return {
			key: '',
			baselineId: null,
			code: 'TRAJECTORY_GUIDE_ORDER_INVERSION',
			severity: 'error',
			layer: 'source',
			status: 'active',
			recordId: 'cs6785',
			fieldPath: 'trajectory.places[1].year',
			stationId: 'salzburg-1842',
			expected: { notBefore: 'london-1912', previousYear: 1912 },
			actual: { year: 1842, month: null, day: null, comparedOn: 'year' },
			reason: 'fixture inversion',
			recommendation: 'fix order',
			evidence: [],
			...overrides,
		};
	}

	function baselineFor(finding: Finding, overrides: Record<string, unknown> = {}) {
		return {
			schemaVersion: 1 as const,
			entries: [
				{
					code: finding.code,
					recordId: finding.recordId,
					fieldPath: finding.fieldPath,
					valueSha256: findingValueSha(finding),
					reason: 'known legacy semantic issue',
					approvedBy: 'curator',
					approvedAt: '2026-01-01',
					reviewBy: '2099-01-01',
					...overrides,
				},
			],
		};
	}

	// Hard gates the independent acceptance listed: image decode, schema,
	// safety/path, dangling entity, delivery/build, inventory/coverage.
	const HARD_GATE_CODES = [
		'IMAGE_DECODE_FAILED',
		'IMAGE_ESCAPE',
		'RECORD_SCHEMA_INVALID',
		'ENTITY_CATALOG_INVALID',
		'TRAJECTORY_POINTER_INVALID',
		'BUILD_ROUTE_MISSING',
		'BUILD_ASSET_MISSING',
		'INVENTORY_ID_MISMATCH',
		'INVENTORY_LEGACY_ROOT_OMITTED',
	];

	for (const code of HARD_GATE_CODES) {
		it(`never lets a baseline exempt the hard gate ${code}`, () => {
			const finding = inversionFinding({ code, severity: 'error' as const });
			const problem = isOverbroadBaseline(baselineFor(finding), today);
			assert.ok(problem, `${code} must not be baseline-eligible`);
			assert.equal(problem!.kind, 'overbroad');
			const report = reportWith([finding]);
			const ratchet = evaluateExit(report, 'ratchet', null, problem, today);
			assert.equal(ratchet.code, 1);
			assert.equal(ratchet.acceptedBaselineErrors, 0);
			assert.equal(report.findings[0]!.status, 'active');
			// Even a baseline that is somehow already loaded cannot match it.
			assert.equal(evaluateExit(report, 'ratchet', baselineFor(finding), null, today).code, 1);
		});
	}

	it('rejects non-calendar and future approvals, and keeps expired ones failing', () => {
		const finding = inversionFinding();
		for (const reviewBy of ['zzzz', '2026-02-30', '2026-13-01', '2026-1-1', '2026-06-01T00:00:00Z']) {
			const problem = isOverbroadBaseline(baselineFor(finding, { reviewBy }), today);
			assert.equal(problem?.kind, 'unreadable', `reviewBy ${reviewBy} must be unusable`);
			assert.equal(
				evaluateExit(reportWith([finding]), 'ratchet', null, problem, today).code,
				2,
				`reviewBy ${reviewBy} must exit 2`,
			);
		}
		for (const approvedAt of ['zzzz', '2026-02-30', '2099-01-01']) {
			const problem = isOverbroadBaseline(baselineFor(finding, { approvedAt }), today);
			assert.equal(problem?.kind, 'unreadable', `approvedAt ${approvedAt} must be unusable`);
		}
		// A real expiry is a data-staleness failure (1), not an unreadable file.
		const expired = baselineFor(finding, { reviewBy: '2026-05-31' });
		assert.equal(isOverbroadBaseline(expired, today), null);
		assert.equal(evaluateExit(reportWith([finding]), 'ratchet', expired, null, today).code, 1);
	});

	it('re-opens an inversion approval when the previous station pair changes', () => {
		const finding = inversionFinding();
		const baseline = baselineFor(finding);
		assert.equal(evaluateExit(reportWith([finding]), 'ratchet', baseline, null, today).code, 0);
		// Same record, same current station/year, different previous station:
		// the approved "a → b" pair is not the "c → b" pair.
		const moved = {
			...inversionFinding({
				expected: { notBefore: 'paris-1900', previousYear: 1900 },
			}),
		};
		assert.equal(evaluateExit(reportWith([moved]), 'ratchet', baseline, null, today).code, 1);
		// Same pair but a different current station id is a different finding too.
		const otherStation = inversionFinding({ stationId: 'berlin-1842' });
		assert.equal(evaluateExit(reportWith([otherStation]), 'ratchet', baseline, null, today).code, 1);
	});

	it('keeps a legitimately approved legacy semantic error at audit 1 / ratchet 0', () => {
		const finding = inversionFinding();
		const baseline = baselineFor(finding);
		assert.equal(isOverbroadBaseline(baseline, today), null);
		const report = reportWith([finding]);
		const audit = evaluateExit(report, 'audit', baseline, null, today);
		assert.equal(audit.code, 1);
		assert.equal(report.findings[0]!.severity, 'error');
		assert.equal(report.findings[0]!.status, 'accepted-baseline');
		const ratchet = evaluateExit(report, 'ratchet', baseline, null, today);
		assert.equal(ratchet.code, 0);
		assert.equal(ratchet.conclusion, 'accepted-baseline-issues');
	});

	it('keeps accepted gaps listed but does not gate on them', () => {
		const gap = { ...errorFinding('ACCEPTED_GAP'), status: 'accepted-gap' as const };
		const report = reportWith([gap]);
		const evaluation = evaluateExit(report, 'audit', null, null, today);
		assert.equal(evaluation.code, 0);
		assert.equal(evaluation.conclusion, 'accepted-gap-issues');
	});

	it('reports a stale baseline entry (no longer matching) and fails audit and ratchet', () => {
		const finding = errorFinding();
		const baseline = {
			schemaVersion: 1 as const,
			entries: [
				{
					code: 'TRAJECTORY_GUIDE_ORDER_INVERSION',
					recordId: 'a',
					fieldPath: 'field',
					// A different fingerprint: the approved value is not the current one.
					valueSha256: findingValueSha({ ...finding, actual: { value: 999 } }),
					reason: 'old error that has been fixed',
					approvedBy: 'curator',
					approvedAt: '2026-01-01',
					reviewBy: '2099-01-01',
				},
			],
		};
		const report = reportWith([{ ...finding, actual: { value: 1 } }]);
		const audit = evaluateExit(report, 'audit', baseline, null, today);
		assert.equal(audit.code, 1);
		assert.equal(audit.staleBaseline, 1);
		const ratchet = evaluateExit(report, 'ratchet', baseline, null, today);
		assert.equal(ratchet.code, 1);
		assert.equal(ratchet.conclusion, 'baseline-invalid');
	});

	it('renders markdown with stable keys, per-record rows and separate sections', () => {
		const report = reportWith([errorFinding()]);
		report.records = [
			{
				id: 'a',
				root: '/repo/records',
				legacy: false,
				status: 'collected',
				blockReason: null,
				schema: 'valid',
				statusLabel: '已核',
				verificationStatus: 'verified',
				photos: {
					imageRefs: 1,
					detailRefs: 0,
					totalRefs: 1,
					uniqueReferencedAssets: 1,
					uniqueByteContents: 1,
					kindRefs: { 'cover-front': 1 },
					kindUniqueAssets: { 'cover-front': 1 },
					validFiles: 1,
					missingFiles: 0,
					invalidFiles: 0,
					unreferencedFiles: [],
					duplicateByteGroups: [],
				},
				story: {
					fileExists: true,
					sourceBodyPresent: true,
					storyChapterPresent: true,
					bodyChars: 10,
					chapterParagraphs: 1,
					paragraphFingerprint: 'x',
					paragraphs: ['p'],
					chapterKeys: ['story'],
					chapterLabels: ['述语'],
					placeholderOnly: false,
				},
				trajectory: null,
				fields: [],
				roleRequirements: 'not-checked',
				expect: null,
				build: null,
			},
		];
		const markdown = renderMarkdown(report);
		assert.match(markdown, /Catalog data validator report/);
		assert.match(markdown, /accepted-baseline/);
		assert.match(markdown, /TRAJECTORY_GUIDE_ORDER_INVERSION/);
		assert.match(markdown, /\| a \|/);
		assert.match(markdown, /Not checked/);
	});

	it('fingerprints paragraph sequences order-sensitively', () => {
		assert.notEqual(fingerprintParagraphs(['a', 'b']), fingerprintParagraphs(['b', 'a']));
		assert.equal(fingerprintParagraphs(['a  b']), fingerprintParagraphs(['a b']));
	});
});

describe('CLI end to end (isolated fixture repo)', () => {
	async function runCli(args: string[]): Promise<{ code: number; outDir: string }> {
		const code = await main(args);
		const outIndex = args.indexOf('--out');
		const outDir = outIndex >= 0 ? args[outIndex + 1]! : '';
		return { code, outDir };
	}

	it('audit exits 1 on a real issue and writes both report files', async () => {
		const site = await buildSite('cliaudit', {
			records: [
				{
					id: 'cli00001',
					trajectory: {
						places: [
							{ id: 'a', year: 1912, cityZh: '甲', city: 'A', role: 'other', lon: 1, lat: 1, blurb: 'x' },
							{ id: 'b', year: 1842, cityZh: '乙', city: 'B', role: 'other', lon: 2, lat: 2, blurb: 'y' },
						],
					},
				},
			],
		});
		const out = join(site.root, 'out');
		const { code } = await runCli(['audit', '--repo-root', site.root, '--out', out, '--source-head', 'fixture', '--quiet']);
		assert.equal(code, 1);
		const report = JSON.parse(readFileSync(join(out, 'catalog-report.json'), 'utf8'));
		assert.equal(report.reportVersion, 1);
		assert.equal(report.mode, 'audit');
		assert.deepEqual(report.notRequestedLayers, ['build', 'live']);
		assert.ok(!report.requestedLayers.includes('live'));
		assert.equal(report.requestedLayers.includes('build'), false, 'no --dist means build is not requested');
		assert.ok(existsSync(join(out, 'catalog-report.md')));
		assert.equal(report.sourceHead, 'fixture');
		assert.ok(report.findings.some((finding: Finding) => finding.code === 'TRAJECTORY_GUIDE_ORDER_INVERSION'));
		// The fixture dir is not a git repo: unknown, never guessed clean.
		assert.equal(report.sourceDirty, null);
	});

	it('records the real commit and dirty state of a git fixture repo', async () => {
		const site = await buildSite('cligit', { records: [{ id: 'git00001' }] });
		const git = (args: string[]) => execFileSync('git', args, { cwd: site.root, encoding: 'utf8' });
		git(['init', '-q']);
		git(['add', '-A']);
		git(['-c', 'user.name=t', '-c', 'user.email=t@example.org', 'commit', '-q', '-m', 'fixture']);
		const out = join(site.root, 'out');
		const first = await runCli(['audit', '--repo-root', site.root, '--out', out, '--quiet']);
		assert.equal(first.code, 0);
		let report = JSON.parse(readFileSync(join(out, 'catalog-report.json'), 'utf8'));
		assert.match(report.sourceHead, /^[a-f0-9]{40}$/);
		assert.equal(report.sourceDirty, false);
		writeFileSync(join(site.root, 'untracked.txt'), 'x');
		await runCli(['audit', '--repo-root', site.root, '--out', out, '--quiet']);
		report = JSON.parse(readFileSync(join(out, 'catalog-report.json'), 'utf8'));
		assert.equal(report.sourceDirty, true);
	});

	it('never requests the live layer, with or without --dist', async () => {
		const site = await buildSite('clilive', { records: [{ id: 'live0001' }] });
		const out = join(site.root, 'out');
		await runCli(['audit', '--repo-root', site.root, '--out', out, '--source-head', 'fixture', '--quiet']);
		let report = JSON.parse(readFileSync(join(out, 'catalog-report.json'), 'utf8'));
		assert.ok(!report.requestedLayers.includes('live'));
		assert.ok(report.notRequestedLayers.includes('live'));
		const dist = join(site.root, 'dist');
		mkdirSync(join(dist, 'records/map'), { recursive: true });
		writeFileSync(join(dist, 'records/map/index.html'), '<html></html>');
		await runCli(['audit', '--repo-root', site.root, '--dist', dist, '--out', out, '--source-head', 'fixture', '--quiet']);
		report = JSON.parse(readFileSync(join(out, 'catalog-report.json'), 'utf8'));
		assert.ok(!report.requestedLayers.includes('live'));
		assert.ok(report.requestedLayers.includes('build'));
		assert.deepEqual(report.notRequestedLayers, ['live']);
	});

	it('audit exits 2 with a full row list when the legacy index is missing', async () => {
		const site = await buildSite('clicoverage', {
			records: [{ id: 'cov00001' }, { id: 'cov00002' }],
			legacy: [{ id: 'legacy01' }],
			omitLegacyIndex: true,
		});
		const out = join(site.root, 'out');
		const { code } = await runCli(['audit', '--repo-root', site.root, '--out', out, '--source-head', 'fixture', '--quiet']);
		assert.equal(code, 2);
		const report = JSON.parse(readFileSync(join(out, 'catalog-report.json'), 'utf8'));
		assert.equal(report.conclusion, 'execution-or-coverage-incomplete');
		assert.equal(report.records.length, 2);
		assert.ok(report.findings.some((finding: Finding) => finding.code === 'INVENTORY_INDEX_MISSING'));
	});

	it('exits 1 (not 2) when one disc has a schema error but every row is reported', async () => {
		const site = await buildSite('clischema', {
			records: [
				{ id: 'bad00001', overrides: { images: [] } },
				{ id: 'good0002' },
				{ id: 'good0003' },
			],
		});
		const out = join(site.root, 'out');
		const { code } = await runCli(['audit', '--repo-root', site.root, '--out', out, '--source-head', 'fixture', '--quiet']);
		assert.equal(code, 1);
		const report = JSON.parse(readFileSync(join(out, 'catalog-report.json'), 'utf8'));
		assert.equal(report.records.length, 3);
		assert.equal(report.conclusion, 'issues');
		assert.equal(report.coverage.complete, true);
		const collection = report.coverage.requiredChecks.find((check: { id: string }) => check.id === 'source-collection');
		assert.equal(collection.status, 'fail');
	});

	it('does not claim the build map matched when the source expansion was blocked', async () => {
		const site = await buildSite('blockedbuild', {
			records: [
				{
					id: 'blocked1',
					trajectory: { places: [{ id: 'a', eventId: 'evt-missing' }] },
				},
			],
		});
		const dist = join(site.root, 'dist');
		mkdirSync(join(dist, 'records/blocked1'), { recursive: true });
		mkdirSync(join(dist, 'records/map'), { recursive: true });
		writeFileSync(
			join(dist, 'records/blocked1/index.html'),
			'<html><body><section data-traj-root data-payload="{&quot;mode&quot;:&quot;embed&quot;,&quot;discs&quot;:[{&quot;id&quot;:&quot;blocked1&quot;,&quot;places&quot;:[]}]}"></section></body></html>',
		);
		writeFileSync(join(dist, 'records/map/index.html'), '<html><body></body></html>');
		const out = join(site.root, 'out');
		const { code } = await runCli(['audit', '--repo-root', site.root, '--dist', dist, '--out', out, '--source-head', 'fixture', '--quiet']);
		assert.ok(code === 1 || code === 2);
		const report = JSON.parse(readFileSync(join(out, 'catalog-report.json'), 'utf8'));
		assert.equal(report.records[0].trajectory.expandedStations, null);
		assert.ok(report.notChecked.some((entry: { code: string }) => entry.code === 'BUILD_MAP_EXPECTATION_BLOCKED'));
		assert.ok(!report.records[0].build.mapStations.match);
	});

	it('refuses a "full" conclusion when the repo legacy root is left out', async () => {
		const site = await buildSite('clilegacy', {
			records: [{ id: 'siteonly' }],
			legacy: [{ id: 'legacyonly' }],
		});
		const empty = join(site.root, 'empty-legacy');
		mkdirSync(empty, { recursive: true });
		const out = join(site.root, 'out');
		const { code } = await runCli([
			'audit',
			'--repo-root',
			site.root,
			'--legacy-root',
			empty,
			'--out',
			out,
			'--source-head',
			'fixture',
			'--quiet',
		]);
		assert.equal(code, 2);
		const report = JSON.parse(readFileSync(join(out, 'catalog-report.json'), 'utf8'));
		assert.ok(report.findings.some((finding: Finding) => finding.code === 'INVENTORY_LEGACY_ROOT_OMITTED'));
		assert.equal(report.coverage.complete, false);
	});

	it('audit exits 0 for a clean fixture and keeps build not-requested', async () => {
		const site = await buildSite('cliclean', { records: [{ id: 'clean001' }] });
		const out = join(site.root, 'out');
		const { code } = await runCli(['audit', '--repo-root', site.root, '--out', out, '--source-head', 'fixture', '--quiet']);
		assert.equal(code, 0);
		const report = JSON.parse(readFileSync(join(out, 'catalog-report.json'), 'utf8'));
		assert.equal(report.conclusion, 'pass');
		assert.equal(report.records[0].schema, 'valid');
		assert.equal(report.records[0].build, null);
	});

	it('ratchet passes exactly one approved old error while audit still exits 1', async () => {
		const site = await buildSite('cliratchet', {
			records: [
				{
					id: 'rate0001',
					trajectory: {
						places: [
							{ id: 'a', year: 1912, cityZh: '甲', city: 'A', role: 'other', lon: 1, lat: 1, blurb: 'x' },
							{ id: 'b', year: 1842, cityZh: '乙', city: 'B', role: 'other', lon: 2, lat: 2, blurb: 'y' },
						],
					},
				},
			],
		});
		const out = join(site.root, 'out');
		await runCli(['audit', '--repo-root', site.root, '--out', out, '--source-head', 'fixture', '--quiet']);
		const report = JSON.parse(readFileSync(join(out, 'catalog-report.json'), 'utf8'));
		const finding = report.findings.find((entry: Finding) => entry.code === 'TRAJECTORY_GUIDE_ORDER_INVERSION');
		assert.ok(finding);
		const baseline = {
			schemaVersion: 1,
			entries: [
				{
					code: finding.code,
					recordId: finding.recordId,
					fieldPath: finding.fieldPath,
					valueSha256: findingValueSha(finding),
					reason: '已知的旧导览顺序问题，待迁移',
					approvedBy: 'curator',
					approvedAt: '2026-01-01',
					reviewBy: '2099-01-01',
				},
			],
		};
		const baselinePath = join(site.root, 'baseline.json');
		writeFileSync(baselinePath, JSON.stringify(baseline));
		const ratchet = await runCli([
			'ratchet',
			'--repo-root',
			site.root,
			'--out',
			out,
			'--source-head',
			'fixture',
			'--baseline',
			baselinePath,
			'--quiet',
		]);
		assert.equal(ratchet.code, 0);
		const ratchetReport = JSON.parse(readFileSync(join(out, 'catalog-report.json'), 'utf8'));
		assert.equal(ratchetReport.conclusion, 'accepted-baseline-issues');
		assert.ok(ratchetReport.findings.some((entry: Finding) => entry.status === 'accepted-baseline' && entry.severity === 'error'));

		const auditAgain = await runCli(['audit', '--repo-root', site.root, '--out', out, '--source-head', 'fixture', '--quiet']);
		assert.equal(auditAgain.code, 1);
	});

	it('ratchet exits 2 on an invalid baseline date and 1 when it asks for a hard gate', async () => {
		const site = await buildSite('clibasedate', { records: [{ id: 'basedate1' }] });
		const out = join(site.root, 'out');
		const entry = {
			code: 'TRAJECTORY_GUIDE_ORDER_INVERSION',
			recordId: 'basedate1',
			fieldPath: 'trajectory.places[1].year',
			valueSha256: 'a'.repeat(64),
			reason: 'r',
			approvedBy: 'c',
			approvedAt: '2026-01-01',
			reviewBy: '2026-02-30',
		};
		const badDate = join(site.root, 'bad-date.json');
		writeFileSync(badDate, JSON.stringify({ schemaVersion: 1, entries: [entry] }));
		const invalid = await runCli([
			'ratchet',
			'--repo-root',
			site.root,
			'--out',
			out,
			'--source-head',
			'fixture',
			'--baseline',
			badDate,
			'--quiet',
		]);
		assert.equal(invalid.code, 2);

		const hardGate = join(site.root, 'hard-gate.json');
		writeFileSync(
			hardGate,
			JSON.stringify({ schemaVersion: 1, entries: [{ ...entry, reviewBy: '2099-01-01', code: 'IMAGE_DECODE_FAILED' }] }),
		);
		const overbroad = await runCli([
			'ratchet',
			'--repo-root',
			site.root,
			'--out',
			out,
			'--source-head',
			'fixture',
			'--baseline',
			hardGate,
			'--quiet',
		]);
		assert.equal(overbroad.code, 1);
	});

	it('ratchet exits 2 when no baseline is supplied', async () => {
		const site = await buildSite('clirate2', { records: [{ id: 'clean002' }] });
		const out = join(site.root, 'out');
		const { code } = await runCli(['ratchet', '--repo-root', site.root, '--out', out, '--source-head', 'fixture', '--quiet']);
		assert.equal(code, 2);
	});

	it('exits 2 when the report directory cannot be written', async () => {
		const site = await buildSite('cliout', { records: [{ id: 'clean003' }] });
		const blocked = join(site.root, 'blocked');
		writeFileSync(blocked, 'not a directory');
		const { code } = await runCli(['audit', '--repo-root', site.root, '--out', join(blocked, 'sub'), '--source-head', 'fixture', '--quiet']);
		assert.equal(code, 2);
	});

	it('marks a selected run as selected, never as full', async () => {
		const site = await buildSite('clisel', { records: [{ id: 'sel00001' }, { id: 'sel00002' }] });
		const out = join(site.root, 'out');
		const { code } = await runCli(['audit', '--repo-root', site.root, '--out', out, '--source-head', 'fixture', '--ids', 'sel00001', '--quiet']);
		assert.equal(code, 0);
		const report = JSON.parse(readFileSync(join(out, 'catalog-report.json'), 'utf8'));
		assert.equal(report.input.scope, 'selected');
		assert.equal(report.records.length, 1);
	});
});

describe('current production tree (read-only)', () => {
	it('audits the real catalog without editing it and keeps every row', async () => {
		const before = gitStatus();
		const out = join(tempRoot('prod'), 'report');
		const code = await main(['audit', '--out', out, '--source-head', 'audit-fixture', '--quiet']);
		assert.ok(code === 0 || code === 1 || code === 2);
		const report = JSON.parse(readFileSync(join(out, 'catalog-report.json'), 'utf8'));
		assert.equal(report.reportVersion, 1);
		assert.equal(report.input.scope, 'full');
		assert.ok(report.coverage.expectedIds.length >= 26);
		assert.equal(report.records.length, report.coverage.expectedIds.length);
		// 迁移落地后，真实馆藏里不该再有占位标签站：迁移前的 pending-contract 断言反过来钉住它。
		assert.ok(
			!report.findings.some((finding: Finding) => finding.code === 'TRAJECTORY_PENDING_CONTRACT_SENTINEL'),
			'馆藏里仍有占位时间标签站',
		);
		assert.ok(
			!report.findings.some((finding: Finding) => finding.code === 'TRAJECTORY_SENTINEL_LABEL_REJECTED'),
			'馆藏里仍有被拒绝的占位标签',
		);
		const d37779 = report.records.find((entry: { id: string }) => entry.id === 'd37779');
		assert.equal(d37779?.trajectory?.stationYears.at(-1), null, 'd37779/utrecht 仍是整数年');
		assert.equal(d37779?.trajectory?.timeKinds.unknown, 1, 'd37779/utrecht 没被识别成 unknown');
		assert.ok(report.summary.story.sourceBodyPresent === report.summary.authoritativeRecords);
		const after = gitStatus();
		assert.equal(after, before, 'audit must not modify the working tree');
	});

	it('does not use a fixed 22/26 constant and sees the real root split', async () => {
		const out = join(tempRoot('prod2'), 'report');
		await main(['audit', '--out', out, '--source-head', 'audit-fixture', '--quiet']);
		const report = JSON.parse(readFileSync(join(out, 'catalog-report.json'), 'utf8'));
		assert.equal(report.summary.authoritativeRecords, report.coverage.expectedIds.length);
		assert.ok(Object.keys(report.summary.roots).length >= 2);
		assert.ok(report.summary.trajectory.absent >= 1);
	});
});

function gitStatus(): string {
	try {
		return execFileSync('git', ['status', '--porcelain'], { cwd: REPO, encoding: 'utf8' });
	} catch {
		return 'unavailable';
	}
}
