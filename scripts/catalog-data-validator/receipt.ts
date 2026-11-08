/**
 * Build receipt: the artifact that proves a `dist/` came from one specific
 * successful build of this exact source tree (PRD §7B/§12, acceptance F5).
 *
 * The validator never builds. A separate script
 * (`scripts/catalog-data-validator-build.mjs`) runs the existing `npm run build`
 * once, fingerprints the inputs *before* the build and the outputs *after* it,
 * and writes this JSON. The validator then refuses to claim a build layer
 * without a receipt that still verifies, so `touch`ing or re-copying an old
 * `dist/` can never be turned into a passing provenance claim.
 *
 * Nothing here writes into the production tree.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { readPage } from './build.ts';
import { sha256Hex } from './report.ts';

export const RECEIPT_VERSION = 1;
export const RECEIPT_KIND = 'catalog-data-validator-build-receipt';

export type ReceiptPart = { name: string; sha256: string | null };

export type BuildReceipt = {
	schemaVersion: number;
	kind: string;
	command: string;
	build: { ok: boolean; exitCode: number; startedAt: string; finishedAt: string };
	source: { head: string | null; dirty: boolean | null };
	input: { sha256: string; parts: ReceiptPart[] };
	output: {
		sha256: string;
		pages: Array<{ id: string; pageSha256: string; payloadSha256: string | null }>;
		assets: Array<{ path: string; sha256: string }>;
	};
	/** Absolute path at build time, informational only (verified by content). */
	distRoot: string;
};

export type ReceiptCheck =
	| { status: 'ok'; receipt: BuildReceipt }
	| {
			status: 'unverified' | 'mismatch';
			code:
				| 'BUILD_PROVENANCE_MISSING'
				| 'BUILD_PROVENANCE_UNREADABLE'
				| 'BUILD_PROVENANCE_FAILED_BUILD'
				| 'BUILD_PROVENANCE_FOREIGN'
				| 'BUILD_PROVENANCE_INPUT_MISMATCH'
				| 'BUILD_PROVENANCE_OUTPUT_MISMATCH';
			reason: string;
	  };

/** Files whose content determines the rendered disc pages. */
const RENDER_SOURCES = [
	'src/pages/records/[id].astro',
	'src/pages/records/map.astro',
	'src/pages/records/index.astro',
	'src/components/TrajectoryMap.astro',
	'src/components/trajectory-map-client.ts',
	'src/components/Header.astro',
	'src/layouts/Base.astro',
	'src/data/records.ts',
	'src/data/records-export.ts',
	'src/data/records-entities.ts',
	'src/data/disc-chapters.ts',
	'src/data/detail-display.ts',
	'src/data/split-leaders.ts',
	'src/data/trajectory-camera.ts',
	'src/data/trajectory-chrono.ts',
	'src/data/records-layout.json',
	'astro.config.mjs',
	'package.json',
	'package-lock.json',
	'.nvmrc',
];

/** The comparison tool itself: a comparator change invalidates old receipts. */
const TOOL_SOURCES = [
	'scripts/catalog-data-validator.ts',
	'scripts/catalog-data-validator/build.ts',
	'scripts/catalog-data-validator/report.ts',
	'scripts/catalog-data-validator/source.ts',
	'scripts/catalog-data-validator/model.ts',
	'scripts/catalog-data-validator/trajectory.ts',
	'scripts/catalog-data-validator/images.ts',
	'scripts/catalog-data-validator/inventory.ts',
	'scripts/catalog-data-validator/receipt.ts',
];

function fileSha(path: string): string | null {
	try {
		if (!existsSync(path) || !statSync(path).isFile()) return null;
		return sha256Hex(readFileSync(path));
	} catch {
		return null;
	}
}

function walkFiles(root: string, out: string[] = []): string[] {
	if (!existsSync(root)) return out;
	for (const entry of readdirSync(root, { withFileTypes: true })) {
		const path = join(root, entry.name);
		if (entry.isDirectory()) walkFiles(path, out);
		else if (entry.isFile()) out.push(path);
	}
	return out;
}

function digestParts(parts: ReceiptPart[]): string {
	const hash = createHash('sha256');
	for (const part of [...parts].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) {
		hash.update(part.name);
		hash.update('\u0000');
		hash.update(part.sha256 ?? 'missing');
		hash.update('\n');
	}
	return hash.digest('hex');
}

/**
 * Everything the disc pages are computed from: both indexes, every record's
 * `record.json`/`story.md`, the entity indexes, the layout, the render/model
 * source chain, the referenced `public/records` rasters, the package state and
 * the comparison tool.
 */
export function inputFingerprint(repoRoot: string): { sha256: string; parts: ReceiptPart[] } {
	const root = resolve(repoRoot);
	const parts: ReceiptPart[] = [];
	const addFile = (name: string, absolute: string): void => {
		parts.push({ name, sha256: fileSha(absolute) });
	};

	for (const name of RENDER_SOURCES) addFile(name, join(root, name));
	for (const name of TOOL_SOURCES) addFile(name, join(root, name));

	for (const indexName of [
		'records/index.json',
		'records-legacy/index.json',
		'records/events/index.json',
		'records/people/index.json',
		'records/works/index.json',
		'records/organizations/index.json',
	]) {
		addFile(indexName, join(root, indexName));
	}

	for (const exportRoot of ['records', 'records-legacy']) {
		const recordsDir = join(root, exportRoot, 'records');
		if (!existsSync(recordsDir)) continue;
		for (const entry of readdirSync(recordsDir, { withFileTypes: true })) {
			if (!entry.isDirectory()) continue;
			for (const file of ['record.json', 'story.md']) {
				const absolute = join(recordsDir, entry.name, file);
				if (existsSync(absolute)) addFile(`${exportRoot}/records/${entry.name}/${file}`, absolute);
			}
		}
	}

	for (const absolute of walkFiles(join(root, 'public/records'))) {
		addFile(relative(root, absolute).split(sep).join('/'), absolute);
	}

	return { sha256: digestParts(parts), parts };
}

/** Every produced disc page/payload and every produced record asset. */
export function outputFingerprint(distRoot: string): {
	sha256: string;
	pages: Array<{ id: string; pageSha256: string; payloadSha256: string | null }>;
	assets: Array<{ path: string; sha256: string }>;
} {
	const root = resolve(distRoot);
	const pages: Array<{ id: string; pageSha256: string; payloadSha256: string | null }> = [];
	const assets: Array<{ path: string; sha256: string }> = [];
	const recordsDir = join(root, 'records');
	if (existsSync(recordsDir)) {
		for (const entry of readdirSync(recordsDir, { withFileTypes: true })) {
			if (!entry.isDirectory()) continue;
			const routeDir = join(recordsDir, entry.name);
			const pagePath = join(routeDir, 'index.html');
			if (existsSync(pagePath)) {
				const html = readFileSync(pagePath, 'utf8');
				pages.push({
					id: entry.name,
					pageSha256: sha256Hex(html),
					payloadSha256: readPage(html).payloadSha256,
				});
			}
			for (const file of walkFiles(routeDir)) {
				if (file === pagePath) continue;
				assets.push({
					path: `records/${entry.name}/${relative(routeDir, file).split(sep).join('/')}`,
					sha256: sha256Hex(readFileSync(file)),
				});
			}
		}
	}
	assets.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
	pages.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
	const hash = createHash('sha256');
	for (const page of pages) {
		hash.update(`page:${page.id}\u0000${page.pageSha256}\u0000${page.payloadSha256 ?? 'none'}\n`);
	}
	for (const asset of assets) hash.update(`asset:${asset.path}\u0000${asset.sha256}\n`);
	return { sha256: hash.digest('hex'), pages, assets };
}

export function buildReceipt(options: {
	repoRoot: string;
	distRoot: string;
	command: string;
	exitCode: number;
	startedAt: string;
	finishedAt: string;
	sourceHead: string | null;
	sourceDirty: boolean | null;
	input?: { sha256: string; parts: ReceiptPart[] };
	output?: ReturnType<typeof outputFingerprint>;
}): BuildReceipt {
	const input = options.input ?? inputFingerprint(options.repoRoot);
	const output = options.output ?? outputFingerprint(options.distRoot);
	return {
		schemaVersion: RECEIPT_VERSION,
		kind: RECEIPT_KIND,
		command: options.command,
		build: {
			ok: options.exitCode === 0,
			exitCode: options.exitCode,
			startedAt: options.startedAt,
			finishedAt: options.finishedAt,
		},
		source: { head: options.sourceHead, dirty: options.sourceDirty },
		input,
		output,
		distRoot: resolve(options.distRoot),
	};
}

function isReceipt(value: unknown): value is BuildReceipt {
	if (!value || typeof value !== 'object') return false;
	const root = value as Partial<BuildReceipt>;
	return (
		root.schemaVersion === RECEIPT_VERSION &&
		root.kind === RECEIPT_KIND &&
		typeof root.input?.sha256 === 'string' &&
		typeof root.output?.sha256 === 'string' &&
		Array.isArray(root.output?.pages) &&
		Array.isArray(root.output?.assets) &&
		typeof root.build?.ok === 'boolean'
	);
}

/**
 * Verify a receipt against the current tree and output. Content hashes only:
 * timestamps are recorded for humans and never used as proof.
 */
export function verifyReceipt(
	receiptValue: unknown,
	options: { repoRoot: string; distRoot: string; sourceHead: string | null },
): ReceiptCheck {
	if (!isReceipt(receiptValue)) {
		return {
			status: 'unverified',
			code: 'BUILD_PROVENANCE_UNREADABLE',
			reason: `receipt is not a schemaVersion ${RECEIPT_VERSION} ${RECEIPT_KIND}`,
		};
	}
	const receipt = receiptValue;
	if (!receipt.build.ok) {
		return {
			status: 'unverified',
			code: 'BUILD_PROVENANCE_FAILED_BUILD',
			reason: `receipt records a failed build (exit ${receipt.build.exitCode}); a failed build cannot prove a working dist`,
		};
	}
	if (
		receipt.source.head !== null &&
		options.sourceHead !== null &&
		receipt.source.head !== options.sourceHead
	) {
		return {
			status: 'mismatch',
			code: 'BUILD_PROVENANCE_FOREIGN',
			reason: `receipt was produced for commit ${receipt.source.head}, not ${options.sourceHead}`,
		};
	}

	const nowInput = inputFingerprint(options.repoRoot);
	if (nowInput.sha256 !== receipt.input.sha256) {
		const changed = nowInput.parts
			.filter((part) => (receipt.input.parts.find((old) => old.name === part.name)?.sha256 ?? null) !== part.sha256)
			.slice(0, 8)
			.map((part) => part.name);
		return {
			status: 'mismatch',
			code: 'BUILD_PROVENANCE_INPUT_MISMATCH',
			reason: `source/render/asset fingerprints changed since this receipt was written (${changed.join(', ')}${changed.length === 8 ? ', …' : ''}); rebuild instead of reusing the old dist`,
		};
	}

	const nowOutput = outputFingerprint(options.distRoot);
	if (nowOutput.sha256 !== receipt.output.sha256) {
		const pageMismatch = receipt.output.pages
			.filter((page) => nowOutput.pages.find((now) => now.id === page.id)?.pageSha256 !== page.pageSha256)
			.map((page) => page.id);
		const assetMismatch = receipt.output.assets
			.filter((asset) => nowOutput.assets.find((now) => now.path === asset.path)?.sha256 !== asset.sha256)
			.map((asset) => asset.path);
		return {
			status: 'mismatch',
			code: 'BUILD_PROVENANCE_OUTPUT_MISMATCH',
			reason: `dist no longer matches the receipt (pages: ${pageMismatch.slice(0, 6).join(', ') || 'none'}; assets: ${assetMismatch.slice(0, 6).join(', ') || 'none'}); touching or editing an old dist does not make it a current build`,
		};
	}

	return { status: 'ok', receipt };
}

export function readReceipt(path: string): unknown {
	if (!existsSync(path)) {
		return null;
	}
	try {
		return JSON.parse(readFileSync(path, 'utf8')) as unknown;
	} catch {
		return undefined;
	}
}
