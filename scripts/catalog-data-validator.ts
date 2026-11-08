#!/usr/bin/env node
/**
 * Catalog data validator CLI.
 *
 * Read-only over the catalog export and an explicit build output. It never
 * builds, never rewrites data, and never touches the network. Reports go to the
 * `--out` directory (outside the production content tree).
 *
 * Exit codes (PRD §12):
 *   0  requested layers complete, no error
 *   1  errors (audit), or errors not covered by an approved baseline (ratchet)
 *   2  execution / coverage incomplete, or an unusable baseline
 */
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { inventory } from './catalog-data-validator/inventory.ts';
import { collectRecord, type FieldPolicyEntry, type RolePolicyEntry, type SourceResult } from './catalog-data-validator/source.ts';
import { loadImageDecoder, imageDecoderError } from './catalog-data-validator/images.ts';
import { loadEntities, checkEntityGraph } from './catalog-data-validator/trajectory.ts';
import { dedupedStationCount } from '../src/data/trajectory-chrono.ts';
import { loadModel } from './catalog-data-validator/model.ts';
import { compareBuild, sourceFreshness } from './catalog-data-validator/build.ts';
import {
	assignFindingKeys,
	sha256Hex,
	emptySummary,
	evaluateExit,
	isOverbroadBaseline,
	renderMarkdown,
	sortFindings,
	sortNotChecked,
	type BaselineFile,
	type BaselineProblem,
	type CatalogReport,
	type BuildRecordReport,
	type Finding,
	type Layer,
	type NotChecked,
	type RecordReport,
	type RequiredCheck,
	type ExitEvaluation,
} from './catalog-data-validator/report.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const DEFAULT_REPO_ROOT = resolve(HERE, '..');

const HELP = `catalog-data-validator — read-only catalog and delivery audit

Usage:
  node --experimental-strip-types scripts/catalog-data-validator.ts [audit|ratchet] [options]

Modes:
  audit     (default) full strict audit. Approved baseline errors still show as
            errors and still exit 1.
  ratchet   only for an explicit, approved, unexpired, exact-hash baseline.
            New/worse/expired/stale entries still fail; no auto-baseline.

Options:
  --repo-root <dir>     repository root (default: this checkout)
  --export-root <dir>   v1 export root (default: <repo>/records)
  --legacy-root <dir>   legacy export root (default: <repo>/records-legacy)
  --layout <file>       layout layer (default: <repo>/src/data/records-layout.json)
  --dist <dir>          explicit successful build output to compare (build layer).
                        Omitting it keeps the build layer not-requested; the
                        validator never builds.
  --ids <a,b>           selected record ids (report marked selected, never full)
  --out <dir>           report directory (default: /workspace/catalog-data-validator-results/<stamp>)
  --baseline <file>     approved baseline JSON (ratchet)
  --policy <file>       field/role policy JSON (precise per-record approvals only)
  --source-head <rev>   override the recorded source commit
  --quiet               only print the report paths and exit code
  --help                this text

Exit: 0 pass, 1 issues, 2 execution/coverage incomplete or unusable baseline.
The live layer is not implemented in this shipment and is always
not-requested; no network request is made.
`;

type Args = {
	mode: 'audit' | 'ratchet';
	repoRoot: string;
	exportRoot: string;
	legacyRoot: string;
	layout: string;
	dist: string | null;
	ids: string[] | null;
	out: string;
	baseline: string | null;
	policy: string | null;
	sourceHead: string | null;
	quiet: boolean;
	help: boolean;
};

function parseArgs(argv: string[]): Args {
	const args: Args = {
		mode: 'audit',
		repoRoot: DEFAULT_REPO_ROOT,
		exportRoot: '',
		legacyRoot: '',
		layout: '',
		dist: null,
		ids: null,
		out: '',
		baseline: null,
		policy: null,
		sourceHead: null,
		quiet: false,
		help: false,
	};
	const rest: string[] = [];
	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index]!;
		const take = (): string => {
			const next = argv[index + 1];
			if (next === undefined) throw new Error(`missing value for ${arg}`);
			index += 1;
			return next;
		};
		switch (arg) {
			case 'audit':
			case 'ratchet':
				args.mode = arg;
				break;
			case '--repo-root':
				args.repoRoot = take();
				break;
			case '--export-root':
				args.exportRoot = take();
				break;
			case '--legacy-root':
				args.legacyRoot = take();
				break;
			case '--layout':
				args.layout = take();
				break;
			case '--dist':
				args.dist = take();
				break;
			case '--ids':
				args.ids = take()
					.split(',')
					.map((id) => id.trim())
					.filter((id) => id !== '');
				break;
			case '--out':
				args.out = take();
				break;
			case '--baseline':
				args.baseline = take();
				break;
			case '--policy':
				args.policy = take();
				break;
			case '--source-head':
				args.sourceHead = take();
				break;
			case '--quiet':
				args.quiet = true;
				break;
			case '--help':
			case '-h':
				args.help = true;
				break;
			default:
				rest.push(arg);
		}
	}
	if (rest.length > 0) throw new Error(`unknown argument: ${rest[0]}`);
	args.repoRoot = resolve(args.repoRoot);
	args.exportRoot = resolve(args.exportRoot || join(args.repoRoot, 'records'));
	args.legacyRoot = resolve(args.legacyRoot || join(args.repoRoot, 'records-legacy'));
	args.layout = resolve(args.layout || join(args.repoRoot, 'src/data/records-layout.json'));
	if (args.dist) args.dist = resolve(args.dist);
	if (args.baseline) args.baseline = resolve(args.baseline);
	if (args.policy) args.policy = resolve(args.policy);
	args.out = resolve(args.out || join('/workspace/catalog-data-validator-results', stamp()));
	return args;
}

function stamp(): string {
	const now = new Date();
	const pad = (value: number, size = 2): string => String(value).padStart(size, '0');
	return `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}T${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}Z`;
}

function sgt(iso: string): string {
	const date = new Date(iso);
	const formatted = new Intl.DateTimeFormat('en-CA', {
		timeZone: 'Asia/Singapore',
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit',
		hour12: false,
	}).format(date);
	return `${formatted} +08:00`;
}

function gitInfo(repoRoot: string, override: string | null): { head: string | null; dirty: boolean | null } {
	if (override) return { head: override, dirty: null };
	const run = (args: string[]): string | null => {
		try {
			return execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
		} catch {
			return null;
		}
	};
	const head = run(['rev-parse', 'HEAD']);
	const status = run(['status', '--porcelain']);
	return { head, dirty: status === null ? null : status !== '' };
}

type PolicyFile = {
	schemaVersion: 1;
	fields?: FieldPolicyEntry[];
	roles?: RolePolicyEntry[];
};

function loadPolicy(path: string | null): { fields: FieldPolicyEntry[]; roles: RolePolicyEntry[] } {
	if (!path) return { fields: [], roles: [] };
	const raw = JSON.parse(readFileSync(path, 'utf8')) as PolicyFile;
	if (raw.schemaVersion !== 1) throw new Error(`policy: unsupported schemaVersion in ${path}`);
	return { fields: raw.fields ?? [], roles: raw.roles ?? [] };
}

function loadBaseline(path: string | null): { baseline: BaselineFile | null; problem: BaselineProblem | null } {
	if (!path) return { baseline: null, problem: null };
	if (!existsSync(path)) {
		return { baseline: null, problem: { kind: 'unreadable', reason: `baseline file not found: ${path}` } };
	}
	let value: unknown;
	try {
		value = JSON.parse(readFileSync(path, 'utf8')) as unknown;
	} catch (error) {
		return {
			baseline: null,
			problem: { kind: 'unreadable', reason: `baseline is not valid JSON: ${error instanceof Error ? error.message : String(error)}` },
		};
	}
	const problem = isOverbroadBaseline(value);
	if (problem) return { baseline: null, problem };
	return { baseline: value as BaselineFile, problem: null };
}

async function main(argv: string[] = process.argv.slice(2)): Promise<number> {
	let args: Args;
	try {
		args = parseArgs(argv);
	} catch (error) {
		process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n\n${HELP}`);
		return 2;
	}
	if (args.help) {
		process.stdout.write(HELP);
		return 0;
	}

	const requestedLayers: Layer[] = ['source'];
	if (args.dist) requestedLayers.push('build');
	const notRequestedLayers: Layer[] = ['build', 'live'].filter((layer) => !requestedLayers.includes(layer as Layer)) as Layer[];

	const executionErrors: string[] = [];
	const findings: Finding[] = [];
	const notChecked: NotChecked[] = [];
	const generatedAt = new Date().toISOString();

	// --- inventory -----------------------------------------------------------
	const inv = inventory({ exportRoot: args.exportRoot, legacyRoot: args.legacyRoot, repoRoot: args.repoRoot });
	findings.push(...inv.findings);
	notChecked.push(...inv.notChecked);
	if (!inv.complete) {
		executionErrors.push(
			`authoritative inventory is incomplete (${inv.findings.filter((item) => item.severity === 'error').length} identity errors)`,
		);
	}

	const selected = args.ids;
	const selectionKnown = selected === null || selected.every((id) => inv.rows.some((row) => row.id === id));
	if (!selectionKnown) {
		executionErrors.push(`--ids names an id that is not in the authoritative inventory: ${selected?.filter((id) => !inv.rows.some((row) => row.id === id)).join(',')}`);
	}
	const rows = selected === null ? inv.rows : inv.rows.filter((row) => selected.includes(row.id));
	const scope: 'full' | 'selected' = selected === null ? 'full' : 'selected';

	// --- decoders / entities / whole model -----------------------------------
	const decoder = await loadImageDecoder();
	if (!decoder) {
		notChecked.push({
			code: 'PHOTO_DECODE_BLOCKED',
			layer: 'source',
			recordId: null,
			fieldPath: 'images|details',
			reason: imageDecoderError() ?? 'image decoder unavailable; existence checks alone are not a valid photo check',
			dependency: 'sharp',
		});
	}
	const entities = loadEntities(args.exportRoot);
	const model = await loadModel(args.repoRoot);
	if (!model.ok) {
		notChecked.push({
			code: 'BUILD_MODEL_BLOCKED',
			layer: 'source',
			recordId: null,
			fieldPath: 'src/data/records.ts',
			reason: model.reason,
			dependency: 'records.ts',
		});
	}
	const policy = loadPolicy(args.policy);

	// --- per-record source --------------------------------------------------
	const sourceResults: SourceResult[] = [];
	for (const row of rows) {
		try {
			sourceResults.push(
				await collectRecord(row, {
					repoRoot: args.repoRoot,
					decoder,
					decoderAvailable: Boolean(decoder),
					entities,
					model,
					fieldPolicy: policy.fields,
					rolePolicy: policy.roles,
				}),
			);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			executionErrors.push(`record ${row.id} collector crashed: ${message}`);
			findings.push({
				key: '',
				baselineId: null,
				code: 'RECORD_COLLECTOR_CRASH',
				severity: 'error',
				layer: 'source',
				status: 'blocked',
				recordId: row.id,
				fieldPath: 'collector',
				stationId: null,
				expected: { collected: true },
				actual: { collected: false },
				reason: message,
				recommendation: '该盘采集崩溃；其余盘仍继续，报告不截断。修复后重跑',
				evidence: [row.recordPath],
			});
			sourceResults.push({
				id: row.id,
				root: row.root,
				legacy: row.legacy,
				status: 'blocked',
				blockReason: 'collector-crash',
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
				findings: [],
				notChecked: [],
				recordSha256: null,
				storySha256: null,
				layoutSha256: null,
			});
		}
	}
	for (const result of sourceResults) {
		findings.push(...result.findings);
		notChecked.push(...result.notChecked);
	}

	// Whole-graph check over every parsed record (the build-time hard-fail path).
	const parsedRecords = sourceResults.map((result) => result.record).filter((record): record is NonNullable<typeof record> => Boolean(record));
	const graph =
		parsedRecords.length === sourceResults.length
			? checkEntityGraph(parsedRecords, entities)
			: ({ ok: false, reason: 'not every record parsed' } as const);
	if (!graph.ok && entities.ok) {
		findings.push({
			key: '',
			baselineId: null,
			code: 'ENTITY_GRAPH_INVALID',
			severity: 'error',
			layer: 'source',
			status: 'active',
			recordId: null,
			fieldPath: 'records/events',
			stationId: null,
			expected: { entityGraph: 'valid' },
			actual: { entityGraph: 'invalid' },
			reason: graph.reason,
			recommendation: '按实体路径修复 Event 归属/索引；受影响盘的展开检查各自 blocked，其它统计继续',
			evidence: [join(args.exportRoot, 'events', 'index.json')],
		});
	}

	// Catalog-level overview dedupe (cumulative expanded counts are a different number).
	const overviewDeduped =
		sourceResults.every(
			(result) =>
				result.trajectory === null ||
				result.trajectory.report.state === 'absent' ||
				result.trajectory.places !== null,
		)
			? dedupedStationCount(
					sourceResults.flatMap((result) =>
						(result.trajectory?.places ?? []).map((place) => ({
							city: place.city,
							lon: place.lon,
							lat: place.lat,
							...(place.eventId ? { eventId: place.eventId } : {}),
						})),
					),
				)
			: null;
	if (overviewDeduped === null) {
		notChecked.push({
			code: 'OVERVIEW_DEDUPE_BLOCKED',
			layer: 'source',
			recordId: null,
			fieldPath: 'trajectory.places',
			reason: '有盘的轨迹展开被 blocked，总览去重站数不可计算，不以 0 代替',
			dependency: 'trajectory-expansion',
		});
	}

	// --- build layer --------------------------------------------------------
	let buildById = new Map<string, BuildRecordReport>();
	let overview: { expectedIds: string[]; actualIds: string[]; present: boolean } | null = null;
	if (args.dist) {
		if (!existsSync(args.dist) || !statSync(args.dist).isDirectory()) {
			executionErrors.push(`--dist does not point at an existing directory: ${args.dist}`);
			findings.push({
				key: '',
				baselineId: null,
				code: 'BUILD_DIST_MISSING',
				severity: 'error',
				layer: 'build',
				status: 'blocked',
				recordId: null,
				fieldPath: 'dist',
				stationId: null,
				expected: { distPresent: true },
				actual: { distPresent: false },
				reason: '请求了 build 层，但没有可用的成功构建产物',
				recommendation: '传入同一提交成功 build 后的 dist；缺少产物按输入问题处理（exit 2），不自动 build',
				evidence: [args.dist],
			});
		} else {
			const freshness = sourceFreshness(
				inv.rows.map((row) => ({ id: row.id, root: row.root, recordPath: row.recordPath, storyPath: row.storyPath })),
				args.layout,
			);
			const build = compareBuild(
				sourceResults.map((result) => ({ id: result.id, expect: result.expect, findings: result.findings })),
				{ distRoot: args.dist, repoRoot: args.repoRoot, freshness, layoutPath: args.layout },
			);
			findings.push(...build.findings);
			notChecked.push(...build.notChecked);
			buildById = build.byId;
			overview = build.overview;
			const stale = build.findings.filter((item) => item.code === 'BUILD_STALE').length;
			if (stale > 0) executionErrors.push(`${stale} disc pages are older than their source (stale dist)`);
		}
	}

	// --- coverage ----------------------------------------------------------
	const requiredChecks: RequiredCheck[] = [];
	requiredChecks.push({
		id: 'inventory-identity',
		status: inv.complete ? 'pass' : 'fail',
		reason: inv.complete ? null : 'authoritative id set could not be confirmed',
	});
	const pointerRecords = sourceResults.filter(
		(result) => (result.record?.trajectory?.places ?? []).some((station) => 'eventId' in station),
	);
	if (pointerRecords.length > 0) {
		requiredChecks.push({
			id: 'entity-catalog',
			status: entities.ok ? 'pass' : 'blocked',
			reason: entities.ok ? null : entities.reason,
		});
		requiredChecks.push({
			id: 'entity-graph',
			status: graph.ok ? 'pass' : 'fail',
			reason: graph.ok ? null : graph.reason,
		});
	}
	const failedCollections = sourceResults.filter((result) => result.status === 'blocked');
	requiredChecks.push({
		id: 'source-collection',
		// Per-disc schema/JSON failures are content issues (exit 1) as long as the
		// authoritative id set is confirmed and every disc still has a row. Only a
		// missing row or a crashed collector makes this check incomplete.
		status: sourceResults.length !== rows.length ? 'blocked' : failedCollections.length > 0 ? 'fail' : 'pass',
		reason:
			sourceResults.length !== rows.length
				? 'one or more records produced no report row'
				: failedCollections.length > 0
					? `per-record source errors: ${failedCollections.map((result) => `${result.id} (${result.blockReason})`).join(', ')}`
					: null,
	});
	requiredChecks.push({
		id: 'photo-decode',
		status: decoder ? 'pass' : 'blocked',
		reason: decoder ? null : (imageDecoderError() ?? 'image decoder unavailable'),
	});
	// The whole-model oracle feeds the expected manifest (layout merge, reveal
	// detection, public notes conditions) and every build-layer comparison.
	//
	// It is fail-fast over the whole catalog, so a single schema error also makes
	// it throw. PRD §12.1 keeps a per-disc schema/bad-image error at exit 1 when
	// the authoritative ids are complete and every disc is reported, so the oracle
	// cannot be a required check for a source-only run: its failure is recorded as
	// a not-checked dependency chain (never as a pass for those checks). A
	// requested build layer cannot be computed without it, so there it blocks
	// coverage and the run exits 2 — with every raw row kept (PRD §12.2).
	if (requestedLayers.includes('build')) {
		requiredChecks.push({
			id: 'whole-model-oracle',
			status: model.ok ? 'pass' : 'blocked',
			reason: model.ok ? null : model.reason,
		});
	}
	if (requestedLayers.includes('build')) {
		requiredChecks.push({
			id: 'build-dist',
			status: args.dist && existsSync(args.dist) ? 'pass' : 'blocked',
			reason: args.dist && existsSync(args.dist) ? null : 'explicit build output missing',
		});
		if (overview) {
			requiredChecks.push({
				id: 'build-overview',
				status: overview.present ? 'pass' : 'fail',
				reason: overview.present ? null : 'dist/records/map/index.html missing',
			});
		}
	}

	// --- report ------------------------------------------------------------
	const recordReports: RecordReport[] = sourceResults.map((result) => ({
		id: result.id,
		root: result.root,
		legacy: result.legacy,
		status: result.status,
		blockReason: result.blockReason,
		schema: result.schema,
		statusLabel: result.statusLabel,
		verificationStatus: result.verificationStatus,
		photos: result.photos,
		story: result.story,
		trajectory: result.trajectory?.report ?? null,
		fields: result.fields,
		roleRequirements: result.roleRequirements,
		expect: result.expect,
		build: buildById.get(result.id) ?? null,
	}));

	const fingerprints: Record<string, string | null> = {};
	for (const result of sourceResults) {
		fingerprints[`${result.id}:record`] = result.recordSha256;
		fingerprints[`${result.id}:story`] = result.storySha256;
		fingerprints[`${result.id}:layout`] = result.layoutSha256;
		fingerprints[`${result.id}:stations`] = result.trajectory?.fingerprint ?? null;
		fingerprints[`${result.id}:paragraphs`] = result.story?.paragraphFingerprint ?? null;
		fingerprints[`${result.id}:page`] = buildById.get(result.id)?.pageSha256 ?? null;
		fingerprints[`${result.id}:payload`] = buildById.get(result.id)?.payloadSha256 ?? null;
	}
	for (const [name, file] of [
		['source:index-records', join(args.exportRoot, 'index.json')],
		['source:index-legacy', join(args.legacyRoot, 'index.json')],
		['source:events-index', join(args.exportRoot, 'events/index.json')],
		['source:layout', args.layout],
	] as const) {
		fingerprints[name] = existsSync(file) ? sha256Hex(readFileSync(file)) : null;
	}
	fingerprints['source:entity-catalog'] = entities.ok
		? sha256Hex(
				JSON.stringify(
					['people', 'works', 'events', 'organizations'].map((kind) => [
						kind,
						[...entities.catalog[kind as 'people'].keys()].sort(),
					]),
				),
			)
		: null;

	const git = gitInfo(args.repoRoot, args.sourceHead);

	let report: CatalogReport = {
		reportVersion: 1,
		generatedAt,
		generatedAtSgt: sgt(generatedAt),
		mode: args.mode,
		requestedLayers,
		notRequestedLayers,
		repoRoot: args.repoRoot,
		sourceHead: git.head,
		sourceDirty: git.dirty,
		input: {
			exportRoot: args.exportRoot,
			legacyRoot: args.legacyRoot,
			layout: args.layout,
			dist: args.dist,
			scope,
		},
		fingerprints,
		summary: emptySummary(),
		coverage: {
			complete: inv.complete && requestedLayers.every((layer) => layer === 'source' || layer === 'build') && executionErrors.length === 0,
			requiredChecks,
			expectedIds: inv.expectedIds,
			observedIds: inv.observedIds,
			missingIds: inv.missingIds,
			extraIds: inv.extraIds,
		},
		execution: { ok: executionErrors.length === 0, errors: executionErrors },
		records: recordReports,
		findings: [],
		notChecked: [],
		conclusion: 'pass',
	};
	report.findings = sortFindings(findings);
	report.notChecked = sortNotChecked(notChecked);
	assignFindingKeys(report.findings);

	const loaded = loadBaseline(args.baseline);
	const todayIso = new Date().toISOString();
	const evaluation: ExitEvaluation = evaluateExit(report, args.mode, loaded.baseline, loaded.problem, todayIso);
	report.conclusion = evaluation.conclusion;
	report.summary = summarize(report, inv.roots, overview);
	report.summary.stations.overviewDedupedStations = overviewDeduped;

	// Accepted-gap findings stay errors for the audit code but are listed apart.
	const markdown = renderMarkdown(report);

	// --- write -------------------------------------------------------------
	const jsonPath = join(args.out, 'catalog-report.json');
	const mdPath = join(args.out, 'catalog-report.md');
	try {
		mkdirSync(args.out, { recursive: true });
		writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
		writeFileSync(mdPath, markdown);
	} catch (error) {
		process.stderr.write(`failed to write report into ${args.out}: ${error instanceof Error ? error.message : String(error)}\n`);
		return 2;
	}

	if (!args.quiet) {
		process.stdout.write(
			[
				`catalog-data-validator ${args.mode}: ${evaluation.conclusion}`,
				`  records=${report.summary.authoritativeRecords} collected=${report.summary.collected} blocked=${report.summary.blocked}`,
				`  errors active=${evaluation.activeErrors} accepted-baseline=${evaluation.acceptedBaselineErrors} stale-baseline=${evaluation.staleBaseline}`,
				`  warnings=${report.summary.warnings} not-checked=${report.summary.notChecked}`,
				`  layers=${requestedLayers.join(',')} not-requested=${notRequestedLayers.join(',') || '(none)'}`,
				evaluation.reason ? `  reason: ${evaluation.reason}` : '',
				`  json=${jsonPath}`,
				`  markdown=${mdPath}`,
			]
				.filter((line) => line !== '')
				.join('\n') + '\n',
		);
	} else {
		process.stdout.write(`${jsonPath}\n${mdPath}\n`);
	}
	return evaluation.code;
}

function summarize(
	report: CatalogReport,
	roots: Record<string, number>,
	overview: { expectedIds: string[]; actualIds: string[]; present: boolean } | null,
): CatalogReport['summary'] {
	void overview;
	const summary = emptySummary();
	summary.authoritativeRecords = report.coverage.expectedIds.length;
	summary.roots = roots;
	summary.uniqueByteContents = 0;
	let byteContents = 0;
	for (const record of report.records) {
		if (record.status === 'collected') summary.collected += 1;
		else summary.blocked += 1;
		if (record.schema === 'invalid') summary.schemaInvalid += 1;
		if (record.photos) {
			summary.photoRefs.images += record.photos.imageRefs;
			summary.photoRefs.details += record.photos.detailRefs;
			summary.photoRefs.total += record.photos.totalRefs;
			summary.uniqueSourceAssets = (summary.uniqueSourceAssets ?? 0) + record.photos.uniqueReferencedAssets;
			byteContents += record.photos.uniqueByteContents ?? 0;
		}
		if (record.story) {
			if (record.story.sourceBodyPresent) summary.story.sourceBodyPresent += 1;
			if (record.story.storyChapterPresent) summary.story.storyChapterPresent += 1;
			if (record.story.placeholderOnly) summary.story.placeholder += 1;
		}
		if (record.trajectory) {
			summary.trajectory[record.trajectory.state] += 1;
			summary.stations.referenceStations += record.trajectory.refStations ?? 0;
			summary.stations.expandedStations += record.trajectory.expandedStations ?? 0;
			summary.stations.inlineStations += record.trajectory.inlineStations ?? 0;
			summary.stations.pointerStations += record.trajectory.pointerStations ?? 0;
			summary.stations.uniqueEventIds += record.trajectory.uniqueEventIds ?? 0;
			for (const [kind, count] of Object.entries(record.trajectory.timeKinds)) {
				summary.timeKinds[kind] = (summary.timeKinds[kind] ?? 0) + count;
			}
		}
		if (record.expect) {
			const linkCount = record.expect.linksCount;
			summary.links.total += linkCount;
			if (linkCount > 0) summary.links.recordsWithLinks += 1;
			else summary.links.recordsWithoutLinks += 1;
		}
		for (const field of record.fields) {
			if (field.valueState === 'valid') summary.fields.valid += 1;
			else if (field.valueState === 'missing') summary.fields.missing += 1;
			else if (field.valueState === 'placeholder') summary.fields.placeholder += 1;
			else if (field.valueState === 'optional-absent') summary.fields.optionalAbsent += 1;
			else summary.fields.unknown += 1;
			if (field.verificationState === 'declared-unverified') summary.verification.declaredUnverified += 1;
			else if (field.verificationState === 'not-applicable') summary.verification.notApplicable += 1;
			else if (field.verificationState === 'declared-status') summary.verification.declaredStatus += 1;
			else summary.verification.unknown += 1;
		}
	}
	summary.uniqueByteContents = byteContents;
	for (const finding of report.findings) {
		if (finding.severity === 'warning') summary.warnings += 1;
		if (finding.severity !== 'error') continue;
		switch (finding.status) {
			case 'accepted-baseline':
				summary.errors.acceptedBaseline += 1;
				break;
			case 'accepted-gap':
				summary.errors.acceptedGap += 1;
				break;
			case 'pending-contract':
				summary.errors.pendingContract += 1;
				break;
			case 'blocked':
				summary.errors.blocked += 1;
				break;
			default:
				summary.errors.active += 1;
		}
	}
	summary.notChecked = report.notChecked.length;
	return summary;
}

const isMain = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
	main()
		.then((code) => {
			process.exitCode = code;
		})
		.catch((error) => {
			process.stderr.write(`catalog-data-validator crashed: ${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
			process.exitCode = 2;
		});
}

export { main, parseArgs, summarize, type Args };
