/**
 * Parse and validate a curator ship-request.json ticket.
 * Schema v1 — see docs/records-contract.md.
 */
import { readFile, stat } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve } from 'node:path';

const MARKS = new Set(['ready', 'none', 'waived']);

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
		records[id] = {
			recordSha256: entry.recordSha256,
			marks,
			waiverReason: entry.waiverReason,
			detailsDraft: resolveMaybe(baseDir, entry.detailsDraft) ?? undefined,
			siteMarksDir: resolveMaybe(baseDir, entry.siteMarksDir) ?? undefined,
			detailsNote: entry.detailsNote,
			imageCheckState: resolveMaybe(baseDir, entry.imageCheckState) ?? undefined,
		};
		if (records[id].detailsDraft) await stat(records[id].detailsDraft);
		if (records[id].siteMarksDir) await stat(records[id].siteMarksDir);
		if (records[id].imageCheckState) await stat(records[id].imageCheckState);
	}

	return {
		path: abs,
		exportDir,
		ids,
		generatedAt: raw.generatedAt,
		records,
	};
}
