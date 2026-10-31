/**
 * Parse and validate a curator ship-request.json ticket.
 * Schema v1 — see docs/records-contract.md.
 */
import { readFile, stat } from 'node:fs/promises';
import { dirname, isAbsolute, resolve } from 'node:path';
import { parseRecord } from '../src/data/records-export.ts';

const MARKS = new Set(['ready', 'none', 'waived']);
const TRAJECTORY = new Set(['ready', 'none']);

export function resolveMaybe(baseDir, value) {
	if (!value) return null;
	return isAbsolute(value) ? value : resolve(baseDir, value);
}

/**
 * @param {string} requestPath
 * @returns {Promise<{
 *   path: string,
 *   exportDir: string,
 *   ids: string[],
 *   generatedAt?: string,
 *   records: Record<string, {
 *     recordSha256: string,
 *     marks: 'ready'|'none'|'waived',
 *     waiverReason?: string,
 *     detailsDraft?: string,
 *     siteMarksDir?: string,
 *     detailsNote?: string,
 *     imageCheckState?: string,
 *     trajectory: 'ready'|'none',
 *     trajectoryCheckState?: string,
 *   }>
 * }>}
 */
export async function loadShipRequest(requestPath) {
	const abs = resolve(requestPath);
	const raw = JSON.parse(await readFile(abs, 'utf8'));
	if (!raw || raw.schemaVersion !== 1) {
		throw new Error(`ship-request schemaVersion 必须为 1（${abs}）`);
	}
	const baseDir = dirname(abs);
	const exportDir = resolveMaybe(baseDir, raw.exportDir ?? '.') ?? baseDir;
	const ids = Array.isArray(raw.ids) ? raw.ids.map(String) : [];
	if (ids.length === 0) throw new Error(`ship-request 缺少 ids[]（${abs}）`);

	const records = {};
	const table = raw.records && typeof raw.records === 'object' ? raw.records : {};
	for (const id of ids) {
		const entry = table[id];
		if (!entry || typeof entry !== 'object') {
			throw new Error(`ship-request.records.${id} 缺失`);
		}
		if (!entry.recordSha256 || typeof entry.recordSha256 !== 'string') {
			throw new Error(`ship-request.records.${id}.recordSha256 必填`);
		}
		const marks = entry.marks;
		if (!MARKS.has(marks)) {
			throw new Error(`ship-request.records.${id}.marks 须为 ready|none|waived，收到 ${marks}`);
		}
		if (marks === 'waived' && !(typeof entry.waiverReason === 'string' && entry.waiverReason.trim())) {
			throw new Error(`ship-request.records.${id} marks=waived 需要非空 waiverReason`);
		}
		if (marks === 'ready') {
			if (!entry.detailsDraft || !entry.siteMarksDir) {
				throw new Error(`ship-request.records.${id} marks=ready 需要 detailsDraft 与 siteMarksDir`);
			}
		}
		const trajectory = entry.trajectory;
		if (!TRAJECTORY.has(trajectory)) {
			throw new Error(
				`ship-request.records.${id}.trajectory 必填，须为 ready|none，不能省略。收到 ${trajectory}`,
			);
		}
		records[id] = {
			recordSha256: entry.recordSha256,
			marks,
			waiverReason: entry.waiverReason,
			detailsDraft: resolveMaybe(baseDir, entry.detailsDraft) ?? undefined,
			siteMarksDir: resolveMaybe(baseDir, entry.siteMarksDir) ?? undefined,
			detailsNote: entry.detailsNote,
			imageCheckState: resolveMaybe(baseDir, entry.imageCheckState) ?? undefined,
			trajectory,
			trajectoryCheckState: resolveMaybe(baseDir, entry.trajectoryCheckState) ?? undefined,
		};
		if (records[id].detailsDraft) await stat(records[id].detailsDraft);
		if (records[id].siteMarksDir) await stat(records[id].siteMarksDir);
		if (records[id].imageCheckState) await stat(records[id].imageCheckState);
		if (records[id].trajectoryCheckState) await stat(records[id].trajectoryCheckState);
	}

	return {
		path: abs,
		exportDir,
		ids,
		generatedAt: raw.generatedAt,
		records,
	};
}

/**
 * Ticket `trajectory` against the export `record.json`.
 * `none` forbids the key. `ready` requires a non-empty places array that
 * already satisfies the export contract. Missing ticket field is rejected
 * earlier by `loadShipRequest` and is not treated as `none`.
 *
 * @param {string} id
 * @param {{ trajectory?: string }} entry
 * @param {unknown} record
 */
export function assertTrajectoryTicket(id, entry, record) {
	const trajectory = entry?.trajectory;
	if (trajectory === 'none') {
		if (record && typeof record === 'object' && Object.hasOwn(record, 'trajectory')) {
			throw new Error(
				`ship-request.records.${id} trajectory=none，但导出 record.json 含有 trajectory。删掉该键，或把票改成 ready。`,
			);
		}
		return;
	}
	if (trajectory !== 'ready') {
		throw new Error(`ship-request.records.${id}.trajectory 必填，须为 ready|none，不能省略。收到 ${trajectory}`);
	}
	let parsed;
	try {
		parsed = parseRecord(record, `${id}/record.json`);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		throw new Error(`ship-request.records.${id} trajectory=ready，导出 record.json 不符合契约：\n${message}`);
	}
	if (!parsed.trajectory || parsed.trajectory.places.length === 0) {
		throw new Error(
			`ship-request.records.${id} trajectory=ready，但导出没有非空 trajectory.places。没有地点时票面写 none，并删掉 trajectory 键。`,
		);
	}
}

/**
 * Optional check-state file. Absent is fine. When the path is set, `stage` must be `ready`.
 *
 * @param {string} id
 * @param {string | undefined} statePath
 */
export async function assertTrajectoryCheckState(id, statePath) {
	if (!statePath) return;
	const state = JSON.parse(await readFile(statePath, 'utf8'));
	if (state.id && state.id !== id) {
		throw new Error(`trajectory-check-state id=${state.id} 与请求 id=${id} 不一致`);
	}
	if (state.stage !== 'ready') {
		throw new Error(
			`ship-request.records.${id} trajectoryCheckState stage=${state.stage ?? '?'}，需要 ready`,
		);
	}
}
