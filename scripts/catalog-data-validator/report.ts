/**
 * Report contract for the catalog data validator (reportVersion 1).
 *
 * This module is pure: types, hashing helpers, ordering, markdown rendering and
 * the exit-code matrix from PRD §12. It never touches the filesystem.
 */
import { createHash } from 'node:crypto';

export const REPORT_VERSION = 1;

export type Layer = 'source' | 'build' | 'live';
export type Severity = 'error' | 'warning';
export type FindingStatus =
	| 'active'
	| 'pending-contract'
	| 'accepted-baseline'
	| 'accepted-gap'
	| 'blocked';

export type Finding = {
	/** Stable within one report: `code|recordId|fieldPath` (+ `#n` for repeats). */
	key: string;
	code: string;
	severity: Severity;
	layer: Layer;
	status: FindingStatus;
	recordId: string | null;
	fieldPath: string | null;
	stationId: string | null;
	expected: unknown;
	actual: unknown;
	reason: string;
	recommendation: string;
	evidence: string[];
	baselineId: string | null;
};

export type NotChecked = {
	code: string;
	layer: Layer;
	recordId: string | null;
	fieldPath: string | null;
	reason: string;
	dependency: string | null;
};

export type TrajectoryState = 'present-valid' | 'absent' | 'blocked' | 'not-checked';
export type FieldState = 'valid' | 'whitespace' | 'placeholder' | 'missing' | 'invalid' | 'unknown' | 'optional-absent';
export type FieldVerification =
	| 'unknown'
	| 'declared-unverified'
	| 'not-applicable'
	| 'declared-status'
	| 'status-pending'
	| 'status-verified';

export type FieldReport = {
	key: string;
	required: boolean;
	present: boolean;
	valueState: FieldState;
	verificationState: FieldVerification;
	reason: string | null;
};

export type PhotoReport = {
	imageRefs: number;
	detailRefs: number;
	totalRefs: number;
	uniqueReferencedAssets: number;
	uniqueByteContents: number | null;
	kindRefs: Record<string, number>;
	kindUniqueAssets: Record<string, number>;
	validFiles: number;
	missingFiles: number;
	invalidFiles: number;
	unreferencedFiles: string[];
	duplicateByteGroups: string[][];
};

export type StoryReport = {
	fileExists: boolean;
	sourceBodyPresent: boolean;
	storyChapterPresent: boolean;
	bodyChars: number;
	chapterParagraphs: number | null;
	paragraphFingerprint: string | null;
	paragraphs: string[];
	chapterKeys: string[];
	chapterLabels: string[];
	placeholderOnly: boolean;
};

export type TrajectoryReport = {
	state: TrajectoryState;
	reason: string | null;
	refStations: number | null;
	expandedStations: number | null;
	inlineStations: number | null;
	pointerStations: number | null;
	uniqueEventIds: number | null;
	roles: Record<string, number>;
	stationIds: string[];
	stationYears: Array<number | null>;
	timeKinds: Record<string, number>;
	stationsFingerprint: string | null;
};

export type RecordExpectation = {
	chapters: Array<{ key: string; label: string }>;
	storyParagraphs: string[];
	notesFields: Array<{ term: string; value: string }>;
	/** showMatrix/showPressing came from the real records model. */
	notesConditionsAvailable: boolean;
	mapStations: Array<{ id: string; year: number | null }>;
	/**
	 * The real expanded `TrajectoryPlace` records (coordinates, role, blurb,
	 * yearLabel, eventId…) so the page must deliver the same semantics, not just
	 * id/year.
	 */
	mapPlaces: Array<Record<string, unknown>>;
	/** False when the trajectory expansion was blocked, so stations cannot be compared. */
	mapStationsAvailable: boolean;
	hasTrajectory: boolean;
	/** The page renders the disc chapter shell only when a reveal image exists. */
	hasChapterShell: boolean;
	/** dist-relative asset paths the page needs; null when the model is blocked. */
	assets: string[] | null;
	/**
	 * Layout-derived display mapping: which raster each detail must actually
	 * render, with its real geometry. `hero` is only on the non-reveal path.
	 */
	images: DisplayImageMap | null;
	/** Declared source links (form only; authority is not a validator question). */
	linksCount: number;
};

export type DisplayImageMap = {
	hero: { src: string; width: number; height: number } | null;
	details: Array<{
		part: string;
		mode: 'reveal' | 'callout' | 'legacy';
		plate: { src: string; width: number; height: number };
		upright: {
			src: string;
			width: number;
			height: number;
			crop: { x: number; y: number; w: number; h: number };
		} | null;
	}>;
};

export type BuildRecordReport = {
	route: string;
	present: boolean;
	/**
	 * `ok` only with a verified build receipt for this exact input+output.
	 * `unverified`/`foreign`/`stale` are build-input problems (exit 2), never a
	 * content conclusion; `unknown` means no receipt was supplied to a unit fixture.
	 */
	provenance: 'ok' | 'stale' | 'unknown' | 'unverified' | 'foreign';
	chapters: string[];
	expectedChapters: string[];
	navLabels: string[];
	/** Nav buttons point at the chapter pane at the same DOM index. */
	navTargets: number[];
	navTargetsMatch: boolean | null;
	storyParagraphs: { expected: number; actual: number | null; match: boolean | null };
	notesFields: { expected: number; actual: number | null; match: boolean | null };
	mapStations: { expected: number | null; actual: number | null; match: boolean | null };
	/** Field-level comparison of the delivered map payload. */
	mapPlaceFields: { checked: number; mismatch: number };
	assets: { expected: number; missing: string[] };
	/** Images the page actually references, by layout role. */
	images: { expected: number; rendered: number; missing: string[]; unexpected: string[] };
	pageSha256: string | null;
	payloadSha256: string | null;
};

export type RecordReport = {
	id: string;
	root: string;
	legacy: boolean;
	status: 'collected' | 'blocked';
	blockReason: string | null;
	schema: 'valid' | 'invalid';
	statusLabel: string | null;
	verificationStatus: string | null;
	photos: PhotoReport | null;
	story: StoryReport | null;
	trajectory: TrajectoryReport | null;
	fields: FieldReport[];
	roleRequirements: 'not-checked' | 'checked';
	expect: RecordExpectation | null;
	build: BuildRecordReport | null;
};

export type RequiredCheck = {
	id: string;
	status: 'pass' | 'fail' | 'blocked' | 'not-run';
	reason: string | null;
};

export type InventoryRow = {
	id: string;
	root: string;
	legacy: boolean;
	indexOrdinal: number | null;
	recordPath: string;
	storyPath: string;
	indexSha256: string | null;
	computedSha256: string | null;
	blockReason: string | null;
};

export type InventoryResult = {
	rows: InventoryRow[];
	findings: Finding[];
	notChecked: NotChecked[];
	expectedIds: string[];
	observedIds: string[];
	missingIds: string[];
	extraIds: string[];
	complete: boolean;
	roots: Record<string, number>;
};

export type CatalogReport = {
	reportVersion: number;
	generatedAt: string;
	generatedAtSgt: string;
	mode: 'audit' | 'ratchet';
	requestedLayers: Layer[];
	notRequestedLayers: Layer[];
	repoRoot: string;
	sourceHead: string | null;
	sourceDirty: boolean | null;
	input: {
		exportRoot: string;
		legacyRoot: string;
		layout: string | null;
		dist: string | null;
		scope: 'full' | 'selected';
	};
	fingerprints: Record<string, string | null>;
	/** Dynamic disc-route diff when the build layer ran; null otherwise. */
	routes: {
		expected: string[];
		actual: string[];
		missing: string[];
		extra: string[];
		ignored: string[];
	} | null;
	summary: Summary;
	coverage: {
		complete: boolean;
		requiredChecks: RequiredCheck[];
		expectedIds: string[];
		observedIds: string[];
		missingIds: string[];
		extraIds: string[];
	};
	execution: { ok: boolean; errors: string[] };
	records: RecordReport[];
	findings: Finding[];
	notChecked: NotChecked[];
	conclusion: ExitConclusion;
};

export type Summary = {
	authoritativeRecords: number;
	roots: Record<string, number>;
	collected: number;
	blocked: number;
	schemaInvalid: number;
	photoRefs: { images: number; details: number; total: number };
	uniqueSourceAssets: number | null;
	uniqueByteContents: number | null;
	story: { sourceBodyPresent: number; storyChapterPresent: number; placeholder: number };
	trajectory: Record<TrajectoryState, number>;
	/** Catalog station totals. Cumulative reference/expanded counts are not the overview dedupe. */
	stations: {
		referenceStations: number;
		expandedStations: number;
		inlineStations: number;
		pointerStations: number;
		uniqueEventIds: number;
		/** Overview dedupe via the real `dedupedStationCount`; null when blocked. */
		overviewDedupedStations: number | null;
	};
	/** Time label classification across the whole catalog. */
	timeKinds: Record<string, number>;
	links: { recordsWithLinks: number; recordsWithoutLinks: number; total: number };
	fields: {
		valid: number;
		unknown: number;
		missing: number;
		placeholder: number;
		optionalAbsent: number;
	};
	/** Field verification state: structure present is not the same as fact-checked. */
	verification: {
		unknown: number;
		declaredUnverified: number;
		notApplicable: number;
		declaredStatus: number;
	};
	errors: {
		active: number;
		pendingContract: number;
		acceptedBaseline: number;
		acceptedGap: number;
		blocked: number;
	};
	warnings: number;
	notChecked: number;
};

export type BaselineEntry = {
	code: string;
	recordId: string | null;
	fieldPath: string | null;
	valueSha256: string;
	reason: string;
	approvedBy: string;
	approvedAt: string;
	reviewBy: string;
};

export type BaselineFile = {
	schemaVersion: 1;
	entries: BaselineEntry[];
};

export type BaselineProblem = {
	kind: 'unreadable' | 'overbroad';
	reason: string;
};

export type ExitConclusion =
	| 'pass'
	| 'issues'
	| 'accepted-baseline-issues'
	| 'accepted-gap-issues'
	| 'baseline-invalid'
	| 'execution-or-coverage-incomplete';

export type ExitEvaluation = {
	code: 0 | 1 | 2;
	conclusion: ExitConclusion;
	activeErrors: number;
	acceptedBaselineErrors: number;
	staleBaseline: number;
	reason: string | null;
};

export function sha256Hex(input: string | Uint8Array): string {
	return createHash('sha256').update(input).digest('hex');
}

export function jsonSha(value: unknown): string {
	return sha256Hex(JSON.stringify(value) ?? 'undefined');
}

export function normalizeText(text: string): string {
	return text.replace(/[\s\u00a0\u3000]+/gu, ' ').trim();
}

export function fingerprintParagraphs(paragraphs: readonly string[]): string {
	return sha256Hex(paragraphs.map(normalizeText).join('\u0000'));
}

export function fingerprintFiles(parts: ReadonlyArray<readonly [string, string]>): string {
	const hash = createHash('sha256');
	for (const [name, sha] of [...parts].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))) {
		hash.update(name);
		hash.update('\u0000');
		hash.update(sha);
		hash.update('\u0000');
	}
	return hash.digest('hex');
}

export function sortFindings(findings: Finding[]): Finding[] {
	const layerOrder: Record<Layer, number> = { source: 0, build: 1, live: 2 };
	return [...findings].sort((a, b) => {
		if (layerOrder[a.layer] !== layerOrder[b.layer]) return layerOrder[a.layer] - layerOrder[b.layer];
		if (a.code !== b.code) return a.code < b.code ? -1 : 1;
		const ra = a.recordId ?? '';
		const rb = b.recordId ?? '';
		if (ra !== rb) return ra < rb ? -1 : 1;
		const fa = a.fieldPath ?? '';
		const fb = b.fieldPath ?? '';
		if (fa !== fb) return fa < fb ? -1 : 1;
		const sa = a.stationId ?? '';
		const sb = b.stationId ?? '';
		return sa < sb ? -1 : sa > sb ? 1 : 0;
	});
}

export function sortNotChecked(entries: NotChecked[]): NotChecked[] {
	return [...entries].sort((a, b) => {
		if (a.code !== b.code) return a.code < b.code ? -1 : 1;
		const ra = a.recordId ?? '';
		const rb = b.recordId ?? '';
		if (ra !== rb) return ra < rb ? -1 : 1;
		const fa = a.fieldPath ?? '';
		const fb = b.fieldPath ?? '';
		return fa < fb ? -1 : fa > fb ? 1 : 0;
	});
}

/** Assign the stable `key` every finding row is linked by in Markdown. */
export function assignFindingKeys(findings: Finding[]): void {
	const counts = new Map<string, number>();
	for (const finding of findings) {
		const base = `${finding.code}|${finding.recordId ?? ''}|${finding.fieldPath ?? ''}`;
		const seen = (counts.get(base) ?? 0) + 1;
		counts.set(base, seen);
		finding.key = seen === 1 ? base : `${base}#${seen}`;
	}
}

/**
 * Only these codes may ever be accepted from a baseline (PRD §9.1). They are the
 * "old semantics" rules that were introduced by this validator; the hash binds
 * the exact approved value.
 *
 * Everything else — image decode/escape, schema, path/security, dangling entity,
 * source↔build delivery, inventory/coverage/execution — is a hard gate: no
 * approval may ever exempt it, and a baseline entry naming one is unusable.
 */
export const BASELINE_ELIGIBLE_CODES: readonly string[] = [
	'TRAJECTORY_GUIDE_ORDER_INVERSION',
	'STORY_SOURCE_PLACEHOLDER',
];

/** Placeholder-token rules are versioned; the version is part of the approval. */
export const BASELINE_RULE_VERSIONS: Readonly<Record<string, string>> = {
	'TRAJECTORY_GUIDE_ORDER_INVERSION': 'guide-order-v1',
	'STORY_SOURCE_PLACEHOLDER': 'placeholder-tokens-v1',
};

export function baselineCodeEligible(code: string): boolean {
	return BASELINE_ELIGIBLE_CODES.includes(code);
}

/**
 * The approval fingerprint. It binds the exact semantic pair/version, not just
 * the current station: the previous anchor lives in `expected`, so changing the
 * previous station (same current year) changes the hash and re-opens the entry.
 */
export function findingValueSha(finding: Finding): string {
	return jsonSha({
		code: finding.code,
		recordId: finding.recordId,
		fieldPath: finding.fieldPath,
		stationId: finding.stationId,
		expected: finding.expected,
		actual: finding.actual,
	});
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Strict calendar date (`YYYY-MM-DD`), no time part, no lenient rollover. */
export function parseIsoDate(value: string): { year: number; month: number; day: number } | null {
	const match = ISO_DATE.exec(value);
	if (!match) return null;
	const year = Number(match[1]);
	const month = Number(match[2]);
	const day = Number(match[3]);
	if (month < 1 || month > 12 || day < 1) return null;
	const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
	if (day > days) return null;
	return { year, month, day };
}

export function isoDateLess(left: string, right: string): boolean {
	return left < right;
}

/** `reviewBy` must be a real calendar date and still in the future. */
export function baselineEntryLive(entry: BaselineEntry, todayIso: string): boolean {
	if (!parseIsoDate(entry.reviewBy)) return false;
	const today = todayIso.slice(0, 10);
	if (!parseIsoDate(today)) return false;
	return entry.reviewBy >= today;
}

export function matchBaselineEntry(
	entry: BaselineEntry,
	finding: Finding,
	todayIso: string,
): boolean {
	if (!baselineCodeEligible(finding.code)) return false;
	if (entry.code !== finding.code) return false;
	if ((entry.recordId ?? null) !== finding.recordId) return false;
	if ((entry.fieldPath ?? null) !== finding.fieldPath) return false;
	if (entry.valueSha256 !== findingValueSha(finding)) return false;
	return baselineEntryLive(entry, todayIso);
}

/**
 * Baseline shape/authority validation. `todayIso` is required to be able to
 * reject a future approval; without it only shape/authority is checked.
 *
 * `unreadable` means the file cannot be used at all (exit 2); `overbroad` means
 * the file is asking for something the contract forbids (exit 1).
 */
export function isOverbroadBaseline(value: unknown, todayIso?: string): BaselineProblem | null {
	if (!value || typeof value !== 'object') {
		return { kind: 'unreadable', reason: 'baseline must be an object with schemaVersion 1 and entries[]' };
	}
	const root = value as Record<string, unknown>;
	if (root.schemaVersion !== 1) {
		return { kind: 'unreadable', reason: `unsupported baseline schemaVersion ${String(root.schemaVersion)}` };
	}
	if (!Array.isArray(root.entries)) {
		return { kind: 'unreadable', reason: 'baseline entries must be an array' };
	}
	for (const raw of root.entries) {
		if (!raw || typeof raw !== 'object') return { kind: 'unreadable', reason: 'baseline entry must be an object' };
		const entry = raw as Record<string, unknown>;
		for (const key of ['code', 'valueSha256', 'reason', 'approvedBy', 'approvedAt', 'reviewBy']) {
			if (typeof entry[key] !== 'string' || (entry[key] as string).trim() === '') {
				return { kind: 'unreadable', reason: `baseline entry is missing ${key}` };
			}
		}
		const code = entry.code as string;
		const value = entry.valueSha256 as string;
		if (code === '*' || code.endsWith('*') || code.toUpperCase() === 'ALL') {
			return { kind: 'overbroad', reason: `baseline entry code ${code} is a wildcard; per-finding approval only` };
		}
		if (!baselineCodeEligible(code)) {
			return {
				kind: 'overbroad',
				reason: `baseline code ${code} is not an eligible legacy-semantics rule (allowed: ${BASELINE_ELIGIBLE_CODES.join(', ')}); hard gates are never exemptible`,
			};
		}
		if (value === '*' || value.length !== 64 || !/^[a-f0-9]+$/.test(value)) {
			return { kind: 'overbroad', reason: 'baseline valueSha256 must be the exact 64-hex fingerprint of the finding' };
		}
		const approvedAt = entry.approvedAt as string;
		if (!parseIsoDate(approvedAt)) {
			return { kind: 'unreadable', reason: `baseline entry approvedAt must be a real calendar date (YYYY-MM-DD), got ${approvedAt}` };
		}
		const reviewBy = entry.reviewBy as string;
		if (!parseIsoDate(reviewBy)) {
			return { kind: 'unreadable', reason: `baseline entry reviewBy must be a real calendar date (YYYY-MM-DD), got ${reviewBy}` };
		}
		if (isoDateLess(reviewBy, approvedAt)) {
			return { kind: 'unreadable', reason: `baseline entry reviewBy (${reviewBy}) is before approvedAt (${approvedAt})` };
		}
		if (todayIso !== undefined) {
			const today = todayIso.slice(0, 10);
			if (parseIsoDate(today) && isoDateLess(today, approvedAt)) {
				return { kind: 'unreadable', reason: `baseline entry approvedAt (${approvedAt}) is in the future (today ${today}); approvals cannot be pre-dated` };
			}
		}
		for (const key of ['recordId', 'fieldPath']) {
			const raw = entry[key];
			if (raw !== undefined && raw !== null && typeof raw !== 'string') {
				return { kind: 'unreadable', reason: `baseline entry ${key} must be a string or null` };
			}
			if (typeof raw === 'string' && (raw === '*' || raw.toUpperCase() === 'ALL')) {
				return { kind: 'overbroad', reason: `baseline entry ${key} is a wildcard; per-finding approval only` };
			}
		}
	}
	return null;
}

/**
 * Exit matrix (PRD §12.1). Coverage/execution problems win over content issues,
 * and content issues win over a clean pass. Warnings and not-checked evidence
 * never change the code on their own.
 */
export function evaluateExit(
	report: CatalogReport,
	mode: 'audit' | 'ratchet',
	baseline: BaselineFile | null,
	baselineProblem: BaselineProblem | null,
	todayIso: string,
): ExitEvaluation {
	const base = {
		activeErrors: 0,
		acceptedBaselineErrors: 0,
		staleBaseline: 0,
		reason: null as string | null,
	};
	if (!report.execution.ok) {
		return { ...base, code: 2, conclusion: 'execution-or-coverage-incomplete', reason: 'execution failed' };
	}
	const blocked = report.coverage.requiredChecks.filter(
		(check) => check.status === 'blocked' || check.status === 'not-run',
	);
	if (!report.coverage.complete || blocked.length > 0) {
		const reason = blocked.length > 0
			? `required checks not completed: ${blocked.map((check) => `${check.id} (${check.status})`).join(', ')}`
			: 'authoritative inventory is incomplete';
		return { ...base, code: 2, conclusion: 'execution-or-coverage-incomplete', reason };
	}
	if (baselineProblem?.kind === 'unreadable') {
		return {
			...base,
			code: 2,
			conclusion: 'baseline-invalid',
			reason: baselineProblem.reason,
		};
	}
	if (baselineProblem?.kind === 'overbroad') {
		return {
			...base,
			code: 1,
			conclusion: 'baseline-invalid',
			reason: baselineProblem.reason,
		};
	}
	if (mode === 'ratchet' && !baseline) {
		return {
			...base,
			code: 2,
			conclusion: 'baseline-invalid',
			reason: 'ratchet requires an explicit approved baseline (run audit first)',
		};
	}
	// Accepted gaps are precise approvals of a documented missing item. They stay
	// listed as errors in the report but do not gate by themselves; an expired
	// approval is reported as an active error instead.
	const errors = report.findings.filter(
		(finding) => finding.severity === 'error' && finding.status !== 'blocked' && finding.status !== 'accepted-gap',
	);
	const acceptedGaps = report.findings.filter((finding) => finding.status === 'accepted-gap').length;
	let accepted = 0;
	const matchedEntries = new Set<BaselineEntry>();
	for (const finding of errors) {
		let matched: BaselineEntry | null = null;
		if (baseline) {
			matched =
				baseline.entries.find((entry) => matchBaselineEntry(entry, finding, todayIso)) ?? null;
		}
		if (matched) {
			finding.status = 'accepted-baseline';
			finding.baselineId = `${matched.code}|${matched.recordId ?? ''}|${matched.fieldPath ?? ''}`;
			accepted += 1;
			matchedEntries.add(matched);
		} else if (finding.status === 'accepted-baseline') {
			finding.status = 'active';
			finding.baselineId = null;
		}
		if (!matched) base.activeErrors += 1;
	}
	const stale = baseline
		? baseline.entries.filter(
				(entry) => !matchedEntries.has(entry) || !baselineEntryLive(entry, todayIso),
			).length
		: 0;
	base.acceptedBaselineErrors = accepted;
	base.staleBaseline = stale;
	if (mode === 'audit') {
		const totalErrors = base.activeErrors + accepted;
		if (totalErrors === 0) {
			return {
				...base,
				code: 0,
				conclusion: acceptedGaps > 0 ? 'accepted-gap-issues' : 'pass',
			};
		}
		const conclusion: ExitConclusion =
			stale > 0 ? 'baseline-invalid' : accepted > 0 ? 'accepted-baseline-issues' : 'issues';
		return {
			...base,
			code: 1,
			conclusion,
			reason: stale > 0 ? `${stale} baseline entries are stale, expired, or no longer match` : null,
		};
	}
	if (base.activeErrors === 0 && stale === 0) {
		return {
			...base,
			code: 0,
			conclusion: accepted > 0 ? 'accepted-baseline-issues' : acceptedGaps > 0 ? 'accepted-gap-issues' : 'pass',
		};
	}
	return {
		...base,
		code: 1,
		conclusion: stale > 0 ? 'baseline-invalid' : 'issues',
		reason:
			stale > 0
				? `${stale} baseline entries are stale, expired, or no longer match`
				: `${base.activeErrors} errors are not covered by the approved baseline`,
	};
}

export function exitCodeFor(
	report: CatalogReport,
	mode: 'audit' | 'ratchet',
	baseline: BaselineFile | null = null,
	baselineProblem: BaselineProblem | null = null,
	todayIso = new Date().toISOString(),
): number {
	return evaluateExit(report, mode, baseline, baselineProblem, todayIso).code;
}

function tableCell(value: string | number | null): string {
	if (value === null) return '—';
	return String(value).replace(/\|/g, '\\|');
}

export function renderMarkdown(report: CatalogReport): string {
	const lines: string[] = [];
	lines.push('# Catalog data validator report');
	lines.push('');
	lines.push(`- reportVersion: ${report.reportVersion}`);
	lines.push(`- generatedAt (Asia/Singapore): ${report.generatedAtSgt}`);
	lines.push(`- mode: ${report.mode}`);
	lines.push(`- requestedLayers: ${report.requestedLayers.join(', ') || '(none)'}`);
	lines.push(`- notRequestedLayers: ${report.notRequestedLayers.join(', ') || '(none)'}`);
	lines.push(`- scope: ${report.input.scope}`);
	lines.push(`- sourceHead: ${report.sourceHead ?? 'null (unknown)'}`);
	lines.push(`- sourceDirty: ${report.sourceDirty === null ? 'null (unknown)' : String(report.sourceDirty)}`);
	lines.push(`- conclusion: ${report.conclusion}`);
	lines.push(`- coverage.complete: ${report.coverage.complete}`);
	lines.push('');
	lines.push('## Summary');
	lines.push('');
	lines.push('| metric | value |');
	lines.push('| --- | --- |');
	const s = report.summary;
	lines.push(`| authoritative records | ${s.authoritativeRecords} |`);
	for (const [root, count] of Object.entries(s.roots)) lines.push(`| root ${root} | ${count} |`);
	lines.push(`| collected / blocked | ${s.collected} / ${s.blocked} |`);
	lines.push(`| schema invalid | ${s.schemaInvalid} |`);
	lines.push(`| photo refs (images/details/total) | ${s.photoRefs.images} / ${s.photoRefs.details} / ${s.photoRefs.total} |`);
	lines.push(`| unique source assets | ${tableCell(s.uniqueSourceAssets)} |`);
	lines.push(`| unique byte contents | ${tableCell(s.uniqueByteContents)} |`);
	lines.push(`| source body present | ${s.story.sourceBodyPresent} |`);
	lines.push(`| story chapter present (source) | ${s.story.storyChapterPresent} |`);
	lines.push(`| placeholder-only stories | ${s.story.placeholder} |`);
	for (const [state, count] of Object.entries(s.trajectory)) lines.push(`| trajectory ${state} | ${count} |`);
	lines.push(
		`| stations (refs / expanded / inline / pointer / unique events) | ${s.stations.referenceStations} / ${s.stations.expandedStations} / ${s.stations.inlineStations} / ${s.stations.pointerStations} / ${s.stations.uniqueEventIds} |`,
	);
	lines.push(`| overview deduped stations | ${tableCell(s.stations.overviewDedupedStations)} |`);
	for (const [kind, count] of Object.entries(s.timeKinds)) lines.push(`| time ${kind} | ${count} |`);
	lines.push(
		`| records with / without links (link count) | ${s.links.recordsWithLinks} / ${s.links.recordsWithoutLinks} (${s.links.total}) |`,
	);
	lines.push(`| fields valid / unknown / missing / placeholder / optional-absent | ${s.fields.valid} / ${s.fields.unknown} / ${s.fields.missing} / ${s.fields.placeholder} / ${s.fields.optionalAbsent} |`);
	lines.push(`| field verification unknown / declared-unverified / not-applicable / declared-status | ${s.verification.unknown} / ${s.verification.declaredUnverified} / ${s.verification.notApplicable} / ${s.verification.declaredStatus} |`);
	lines.push(`| errors active / pending-contract / accepted-baseline / accepted-gap / blocked | ${s.errors.active} / ${s.errors.pendingContract} / ${s.errors.acceptedBaseline} / ${s.errors.acceptedGap} / ${s.errors.blocked} |`);
	lines.push(`| warnings | ${s.warnings} |`);
	lines.push(`| not-checked | ${s.notChecked} |`);
	lines.push('');
	lines.push('## Required checks');
	lines.push('');
	lines.push('| check | status | reason |');
	lines.push('| --- | --- | --- |');
	for (const check of report.coverage.requiredChecks) {
		lines.push(`| ${tableCell(check.id)} | ${check.status} | ${tableCell(check.reason)} |`);
	}
	lines.push('');
	lines.push('## Records');
	lines.push('');
	lines.push('| id | root | schema | photos (refs/unique/invalid) | story body/chapter/paragraphs | map | notes fields | build |');
	lines.push('| --- | --- | --- | --- | --- | --- | --- | --- |');
	for (const record of report.records) {
		const photos = record.photos
			? `${record.photos.totalRefs}/${record.photos.uniqueReferencedAssets}/${record.photos.invalidFiles + record.photos.missingFiles}`
			: '—';
		const story = record.story
			? `${record.story.sourceBodyPresent ? 'yes' : 'no'}/${record.story.storyChapterPresent ? 'yes' : 'no'}/${tableCell(record.story.chapterParagraphs)}`
			: '—';
		const map = record.trajectory ? record.trajectory.state : '—';
		const notes = record.expect ? String(record.expect.notesFields.length) : '—';
		const build = record.build
			? `${record.build.present ? 'present' : 'missing'} (${record.build.provenance})`
			: report.requestedLayers.includes('build')
				? 'not collected'
				: 'not-requested';
		lines.push(
			`| ${tableCell(record.id)} | ${tableCell(record.root)} | ${record.schema} | ${photos} | ${story} | ${map} | ${notes} | ${build} |`,
		);
	}
	lines.push('');
	const section = (title: string, items: Finding[]) => {
		lines.push(`## ${title}`);
		lines.push('');
		if (items.length === 0) {
			lines.push('_none_');
			lines.push('');
			return;
		}
		for (const finding of items) {
			lines.push(
				`- \`${finding.key}\` **${finding.severity}/${finding.status}** ${finding.code} — ${finding.reason}${finding.recordId ? ` (record ${finding.recordId})` : ''}${finding.fieldPath ? ` · \`${finding.fieldPath}\`` : ''}`,
			);
		}
		lines.push('');
	};
	section('Active errors', report.findings.filter((f) => f.severity === 'error' && f.status === 'active'));
	section(
		'Pending-contract errors (not waived)',
		report.findings.filter((f) => f.status === 'pending-contract'),
	);
	section(
		'Accepted baseline errors (still errors, still to migrate)',
		report.findings.filter((f) => f.status === 'accepted-baseline'),
	);
	section('Accepted gaps (still listed as missing)', report.findings.filter((f) => f.status === 'accepted-gap'));
	section('Blocked', report.findings.filter((f) => f.status === 'blocked'));
	section('Warnings', report.findings.filter((f) => f.severity === 'warning' && f.status !== 'accepted-gap'));
	lines.push('## Not checked');
	lines.push('');
	if (report.notChecked.length === 0) {
		lines.push('_none_');
	} else {
		for (const entry of report.notChecked) {
			lines.push(
				`- ${entry.code} — ${entry.reason}${entry.recordId ? ` (record ${entry.recordId})` : ''}${entry.fieldPath ? ` · \`${entry.fieldPath}\`` : ''}${entry.dependency ? ` · depends on ${entry.dependency}` : ''}`,
			);
		}
	}
	lines.push('');
	lines.push('## Fingerprints');
	lines.push('');
	for (const [name, value] of Object.entries(report.fingerprints)) {
		lines.push(`- ${name}: ${value ?? 'null (unknown)'}`);
	}
	lines.push('');
	return lines.join('\n');
}

export function emptySummary(): Summary {
	return {
		authoritativeRecords: 0,
		roots: {},
		collected: 0,
		blocked: 0,
		schemaInvalid: 0,
		photoRefs: { images: 0, details: 0, total: 0 },
		uniqueSourceAssets: 0,
		uniqueByteContents: null,
		story: { sourceBodyPresent: 0, storyChapterPresent: 0, placeholder: 0 },
		trajectory: { 'present-valid': 0, absent: 0, blocked: 0, 'not-checked': 0 },
		stations: {
			referenceStations: 0,
			expandedStations: 0,
			inlineStations: 0,
			pointerStations: 0,
			uniqueEventIds: 0,
			overviewDedupedStations: null,
		},
		timeKinds: {},
		links: { recordsWithLinks: 0, recordsWithoutLinks: 0, total: 0 },
		fields: { valid: 0, unknown: 0, missing: 0, placeholder: 0, optionalAbsent: 0 },
		verification: { unknown: 0, declaredUnverified: 0, notApplicable: 0, declaredStatus: 0 },
		errors: { active: 0, pendingContract: 0, acceptedBaseline: 0, acceptedGap: 0, blocked: 0 },
		warnings: 0,
		notChecked: 0,
	};
}
