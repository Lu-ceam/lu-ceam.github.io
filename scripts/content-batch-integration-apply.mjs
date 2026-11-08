/**
 * Controlled, record-granular content-batch integration applier (A0 first).
 *
 * Contract: docs/superpowers/plans/2026-11-09-content-batch-integration.md (Task 0).
 * – Pin gate: live hashes are COMPARED with parent-approved values, never re-sampled as approval.
 * – Root gate: every ancestor lstat-ed, no symlink, dev/ino must equal the external binding.
 * – Leaf gate: regular file, nlink=1, no symlink component, sha re-checked immediately before writing.
 * – Lock: exclusive file outside the tree; a live owner is a hard STOP, a dead owner is reported and taken over.
 * – Journal: per-leaf pre/post sha + owned identity, flushed before the write it describes.
 * – Writes: same-directory tmp + fsync + rename + directory fsync; index.json is written last.
 * – Rollback is OWNED: only bytes this run wrote are restored; a foreign leaf makes rollback STOP.
 * – Explicitly NOT an atomic multi-file transaction; readers can still see the intermediate window.
 */
import { createHash } from 'node:crypto';
import {
	closeSync,
	copyFileSync,
	existsSync,
	fsyncSync,
	lstatSync,
	mkdirSync,
	openSync,
	readdirSync,
	readFileSync,
	renameSync,
	statSync,
	unlinkSync,
	writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';

export const EXIT = {
	OK: 0,
	PIN_DRIFT: 2,
	ROOT_MISMATCH: 3,
	LEAF_IDENTITY: 4,
	SCOPE: 5,
	INDEX_CAS: 6,
	CONTENT_CAS: 7,
	DEPENDENCY_CAS: 8,
	PAYLOAD_MISMATCH: 9,
	PARTIAL: 10,
	LOCKED: 11,
	EXTERNAL_CHANGE: 12,
	ROLLBACK_CONFLICT: 13,
	ROLLBACK_FAILED: 14,
	INJECTED: 15,
	CRASH_SIMULATED: 16,
	TREE_CAS: 17,
	FORMAT: 18,
};

/** The only paths this applier may ever write (A0). */
export const A0_DATA_WHITELIST = [
	'records/records/cs6785/record.json',
	'records/records/4816856/record.json',
	'records/records/movcl014/record.json',
	'records/index.json',
	'records/changelog.json',
];

const TMP_SUFFIX = 'cbi-tmp';
const sha = (buf) => createHash('sha256').update(buf).digest('hex');
const shaFile = (p) => sha(readFileSync(p));

/** Canonical JSON: recursively sorted keys, compact separators (entry/event hashes). */
export function canonicalJson(value) {
	const walk = (v) => {
		if (Array.isArray(v)) return v.map(walk);
		if (v && typeof v === 'object')
			return Object.fromEntries(
				Object.keys(v)
					.sort()
					.map((k) => [k, walk(v[k])]),
			);
		return v;
	};
	return JSON.stringify(walk(value));
}

/** records/README.md §index.json: sorted relpath + NUL + raw sha256 digest of each file. */
export function directorySha256(dir) {
	const files = [];
	const walk = (rel) => {
		for (const entry of readdirSync(rel ? join(dir, rel) : dir, { withFileTypes: true })) {
			const r = rel ? `${rel}/${entry.name}` : entry.name;
			if (entry.isDirectory()) walk(r);
			else files.push(r);
		}
	};
	walk('');
	files.sort();
	const h = createHash('sha256');
	for (const r of files) {
		h.update(Buffer.from(r, 'utf8'));
		h.update(Buffer.from([0]));
		h.update(createHash('sha256').update(readFileSync(join(dir, r))).digest());
	}
	return h.digest('hex');
}

// ------------------------------------------------------------------ gates

export function verifyApprovedPins({ approved, paths }) {
	const drifts = [];
	for (const [key, expected] of Object.entries(approved)) {
		const p = paths?.[key];
		if (!p) {
			drifts.push(`${key}: no path supplied`);
			continue;
		}
		if (!existsSync(p)) {
			drifts.push(`${key}: missing ${p}`);
			continue;
		}
		const live = shaFile(p);
		if (live !== expected) drifts.push(`${key}: approved ${expected} != live ${live} (${p})`);
	}
	if (drifts.length)
		return {
			ok: false,
			code: EXIT.PIN_DRIFT,
			reason: `pin drift, NOT re-sampling: ${drifts.join('; ')}. A live hash is a verification signal, never an approval; the parent must issue a new amendment.`,
		};
	return { ok: true, code: EXIT.OK };
}

export function assertRootIdentity({ root, binding }) {
	const target = resolve(root);
	const parts = target.split('/').filter(Boolean);
	let cur = '/';
	for (const seg of parts) {
		cur = join(cur, seg);
		let st;
		try {
			st = lstatSync(cur);
		} catch {
			return { ok: false, code: EXIT.ROOT_MISMATCH, reason: `root ancestor missing: ${cur}` };
		}
		if (st.isSymbolicLink()) return { ok: false, code: EXIT.ROOT_MISMATCH, reason: `root ancestor is a symlink: ${cur}` };
	}
	const st = statSync(target);
	const want = binding?.targetRoot;
	if (!want) return { ok: false, code: EXIT.ROOT_MISMATCH, reason: 'binding has no targetRoot' };
	if (resolve(want.path) !== target)
		return { ok: false, code: EXIT.ROOT_MISMATCH, reason: `root path ${target} != bound ${want.path}` };
	if (st.dev !== want.dev || st.ino !== want.ino)
		return { ok: false, code: EXIT.ROOT_MISMATCH, reason: `root identity ${st.dev}/${st.ino} != bound ${want.dev}/${want.ino}` };
	return { ok: true, code: EXIT.OK, dev: st.dev, ino: st.ino };
}

export function readLeafState(root, rel) {
	const parts = rel.split('/').filter(Boolean);
	if (!parts.length) return { ok: false, code: EXIT.LEAF_IDENTITY, path: rel, reason: 'empty path' };
	let acc = resolve(root);
	for (let i = 0; i < parts.length; i += 1) {
		acc = join(acc, parts[i]);
		let st;
		try {
			st = lstatSync(acc);
		} catch {
			return { ok: false, code: EXIT.LEAF_IDENTITY, path: rel, reason: `missing component ${parts.slice(0, i + 1).join('/')}` };
		}
		if (st.isSymbolicLink())
			return { ok: false, code: EXIT.LEAF_IDENTITY, path: rel, reason: `symlink component ${parts.slice(0, i + 1).join('/')}` };
		const last = i === parts.length - 1;
		if (last) {
			if (!st.isFile()) return { ok: false, code: EXIT.LEAF_IDENTITY, path: rel, reason: 'leaf is not a regular file' };
			if (st.nlink !== 1) return { ok: false, code: EXIT.LEAF_IDENTITY, path: rel, reason: `leaf nlink=${st.nlink} (shared inode)` };
			return { ok: true, path: rel, dev: st.dev, ino: st.ino, nlink: st.nlink, size: st.size, sha256: shaFile(acc) };
		}
		if (!st.isDirectory())
			return { ok: false, code: EXIT.LEAF_IDENTITY, path: rel, reason: `ancestor not a directory: ${parts.slice(0, i + 1).join('/')}` };
	}
	return { ok: false, code: EXIT.LEAF_IDENTITY, path: rel, reason: 'unreachable' };
}

// ------------------------------------------------------------------ classification

const textFile = (obj) => `${JSON.stringify(obj, null, 2)}\n`;

/**
 * Whole-batch state. Never per-leaf: 'applied' needs records + index rows + log event + untouched
 * leaves to agree simultaneously; anything in between is 'partial' and is a STOP.
 */
export function classifyBatch({ root, plan }) {
	const recordLeaves = plan.contentChanges.map((c) => {
		const s = existsSync(join(root, c.path)) ? shaFile(join(root, c.path)) : null;
		const state = s === c.newSha256 ? 'new' : s === c.baseSha256 ? 'base' : 'drift';
		return { path: c.path, sha256: s, state };
	});

	const index = JSON.parse(readFileSync(join(root, 'records/index.json'), 'utf8'));
	const indexStates = (plan.indexUpdates ?? []).map((u) => {
		const row = index.records.find((r) => r.id === u.id);
		const h = row ? sha(canonicalJson(row)) : null;
		const state = h === u.newEntryHash ? 'new' : h === u.baseEntryHash ? 'base' : 'drift';
		return { id: u.id, state, currentEntryHash: h };
	});

	const logPath = plan.logAppends?.[0]?.path ?? 'records/changelog.json';
	const log = JSON.parse(readFileSync(join(root, logPath), 'utf8'));
	const eventCounts = (plan.logAppends ?? []).map((la) => ({
		path: la.path,
		count: log.filter((e) => sha(canonicalJson(e)) === la.eventHash).length,
	}));

	const allRecordsNew = recordLeaves.length > 0 && recordLeaves.every((l) => l.state === 'new');
	const allRecordsBase = recordLeaves.every((l) => l.state === 'base');
	const allIndexNew = indexStates.length > 0 && indexStates.every((i) => i.state === 'new');
	const allIndexBase = indexStates.every((i) => i.state === 'base');
	const noDrift = recordLeaves.every((l) => l.state !== 'drift') && indexStates.every((i) => i.state !== 'drift');
	const eventSeenOnce = eventCounts.every((e) => e.count === 1);
	const eventAbsent = eventCounts.every((e) => e.count === 0);

	let state = 'partial';
	if (noDrift && allRecordsBase && allIndexBase && eventAbsent) state = 'base';
	else if (noDrift && allRecordsNew && allIndexNew && eventSeenOnce) state = 'applied';

	return {
		state,
		newLeaves: recordLeaves.filter((l) => l.state === 'new').map((l) => l.path),
		recordLeaves,
		indexStates,
		eventCounts,
	};
}

// ------------------------------------------------------------------ lock

export function isPidAlive(pid) {
	if (!Number.isInteger(pid) || pid <= 0) return false;
	try {
		process.kill(pid, 0);
		return true;
	} catch (err) {
		return err.code === 'EPERM';
	}
}

/**
 * Exclusive lock outside the tree. Live owner → hard STOP (EXIT.LOCKED), even if this process
 * could clobber it. Dead owner → reported via *returned* `stale` info and taken over by renaming
 * the old file aside (never a silent delete).
 */
export function acquireLock({ results, dev, ino, runId }) {
	const dir = join(results, 'lock');
	mkdirSync(dir, { recursive: true });
	const path = join(dir, `${dev}-${ino}.lock`);
	const body = JSON.stringify({ pid: process.pid, runId, startedAt: new Date().toISOString(), dev, ino }, null, 2) + '\n';

	try {
		const fd = openSync(path, 'wx');
		writeFileSync(fd, body);
		closeSync(fd);
		let released = false;
		return {
			ok: true,
			code: EXIT.OK,
			path,
			release() {
				if (released) return;
				released = true;
				try {
					unlinkSync(path);
				} catch {
					/* already gone */
				}
			},
		};
	} catch (err) {
		if (err.code !== 'EEXIST') throw err;
	}

	let held = null;
	try {
		held = JSON.parse(readFileSync(path, 'utf8'));
	} catch {
		held = null;
	}
	if (held && isPidAlive(held.pid))
		return {
			ok: false,
			code: EXIT.LOCKED,
			path,
			reason: `integration lock held by live pid ${held.pid} (run ${held.runId ?? '?'}) at ${path}; refusing to write`,
		};

	const stalePath = `${path}.stale-${Date.now()}`;
	renameSync(path, stalePath);
	const fd = openSync(path, 'wx');
	writeFileSync(fd, body);
	closeSync(fd);
	let released = false;
	return {
		ok: true,
		code: EXIT.OK,
		path,
		stalePath,
		reason: `took over a stale lock (owner pid ${held?.pid ?? 'unknown'} is not alive); old lock kept at ${stalePath}`,
		release() {
			if (released) return;
			released = true;
			try {
				unlinkSync(path);
			} catch {
				/* already gone */
			}
		},
	};
}

// ------------------------------------------------------------------ low-level IO

function writeFileDurable(path, bytes) {
	const fd = openSync(path, 'w');
	try {
		writeFileSync(fd, bytes);
		fsyncSync(fd);
	} finally {
		closeSync(fd);
	}
}

function fsyncDir(dir) {
	const fd = openSync(dir, 'r');
	try {
		fsyncSync(fd);
	} finally {
		closeSync(fd);
	}
}

/** Replace a leaf via same-directory tmp + fsync + rename + directory fsync. */
function replaceLeaf(root, rel, bytes, runId) {
	const abs = join(root, rel);
	const dir = dirname(abs);
	const tmp = join(dir, `.${rel.split('/').pop()}.${TMP_SUFFIX}-${runId}`);
	writeFileDurable(tmp, bytes);
	renameSync(tmp, abs);
	fsyncDir(dir);
}

function writeJournal(path, journal) {
	const tmp = `${path}.tmp`;
	writeFileDurable(tmp, JSON.stringify(journal, null, 2) + '\n');
	renameSync(tmp, path);
	fsyncDir(dirname(path));
}

// ------------------------------------------------------------------ planned bytes

const STAGE = {
	PREPARING: 'preparing',
	WRITING: 'writing',
	WRITTEN: 'written',
	COMPLETE: 'complete',
	ROLLED_BACK: 'rolled-back',
	ROLLBACK_CONFLICT: 'rollback-conflict',
	ROLLBACK_FAILED: 'rollback-failed',
};

/**
 * Build every new leaf in memory from CURRENT + the delivery payloads.
 * Order matters: records → changelog → index (index last = commit marker).
 */
function buildPlan({ root, plan, delivery, expectedState, allowDrift = false }) {
	const state = classifyBatch({ root, plan });
	if (!allowDrift && expectedState === 'base' && state.state !== 'base')
		return { code: EXIT.PARTIAL, reason: `expected a clean BASE tree but found '${state.state}'` };
	if (expectedState === 'applied' && state.state !== 'applied')
		return { code: EXIT.PARTIAL, reason: `expected an applied tree but found '${state.state}'` };

	const leaves = [];

	// (a) record.json payloads from the delivery package
	for (const change of plan.contentChanges) {
		const cur = readLeafState(root, change.path);
		if (!cur.ok) return { code: cur.code, reason: `record ${change.path}: ${cur.reason}` };
		if (!allowDrift && cur.sha256 !== change.baseSha256)
			return {
				code: EXIT.CONTENT_CAS,
				reason: `record content drift ${change.path}: expected BASE ${change.baseSha256}, found ${cur.sha256}`,
			};
		const id = change.path.split('/')[2];
		const payloadPath = join(delivery, 'records', id, 'record.json');
		if (!existsSync(payloadPath)) return { code: EXIT.PAYLOAD_MISMATCH, reason: `missing delivery payload ${payloadPath}` };
		const bytes = readFileSync(payloadPath);
		const got = sha(bytes);
		if (got !== change.newSha256)
			return {
				code: EXIT.PAYLOAD_MISMATCH,
				reason: `payload NEW sha mismatch ${payloadPath}: planned ${change.newSha256}, got ${got}`,
			};
		leaves.push({ rel: change.path, bytes, preSha256: change.baseSha256, postSha256: change.newSha256, ...cur });
	}

	// (b) changelog — CURRENT array + exactly one append, byte prefix preserved
	const logPath = checkSingleLogPath(plan);
	if (!logPath) return { code: EXIT.SCOPE, reason: 'A0 plans exactly one log append to records/changelog.json' };
	const logAbs = join(root, logPath);
	const logRaw = readFileSync(logAbs, 'utf8');
	const log = JSON.parse(logRaw);
	if (logRaw !== textFile(log))
		return { code: EXIT.FORMAT, reason: `${logPath} is not 2-space JSON + trailing newline; refusing to reformat` };
	for (const la of plan.logAppends) {
		if (log.some((e) => sha(canonicalJson(e)) === la.eventHash)) {
			if (allowDrift) continue;
			return { code: EXIT.PARTIAL, reason: `${logPath} already contains the planned event (duplicate append would occur)` };
		}
		if (sha(canonicalJson(la.event)) !== la.eventHash)
			return { code: EXIT.FORMAT, reason: `planned log eventHash does not match its own event object` };
	}
	const pendingEvents = plan.logAppends
		.map((la) => la.event)
		.filter((ev) => !(allowDrift && log.some((e) => sha(canonicalJson(e)) === sha(canonicalJson(ev)))));
	const newLog = [...log, ...pendingEvents];
	const logState = readLeafState(root, logPath);
	if (!logState.ok) return { code: logState.code, reason: `changelog: ${logState.reason}` };
	leaves.push({
		rel: logPath,
		bytes: Buffer.from(textFile(newLog), 'utf8'),
		preSha256: shaFile(logAbs),
		postSha256: sha(textFile(newLog)),
		...logState,
	});

	// (c) index.json — only the named rows' sha256; everything else preserved
	const idxPath = 'records/index.json';
	const idxAbs = join(root, idxPath);
	const idxRaw = readFileSync(idxAbs, 'utf8');
	const idx = JSON.parse(idxRaw);
	if (idxRaw !== textFile(idx))
		return { code: EXIT.FORMAT, reason: `${idxPath} is not 2-space JSON + trailing newline; refusing to reformat` };
	const idOrderBefore = idx.records.map((r) => r.id);

	for (const u of plan.indexUpdates) {
		const row = idx.records.find((r) => r.id === u.id);
		if (!row) return { code: EXIT.INDEX_CAS, reason: `index row ${u.id} missing` };
		const h = sha(canonicalJson(row));
		if (allowDrift && h === u.newEntryHash) continue; // already advanced by the interrupted run
		if (h !== u.baseEntryHash)
			return {
				code: EXIT.INDEX_CAS,
				reason: `index entry drift ${u.id}: expected baseEntryHash ${u.baseEntryHash}, found ${h} (row ${JSON.stringify(row)})`,
			};
		if (row.updatedAt !== u.baseEntry.updatedAt)
			return { code: EXIT.INDEX_CAS, reason: `index row ${u.id} updatedAt changed: ${row.updatedAt} != ${u.baseEntry.updatedAt}` };
		const newRow = { ...row, sha256: u.newEntry.sha256 };
		const allowed = new Set(['sha256']);
		for (const k of new Set([...Object.keys(row), ...Object.keys(u.newEntry)])) {
			if (allowed.has(k)) continue;
			if (JSON.stringify(row[k]) !== JSON.stringify(u.newEntry[k]))
				return { code: EXIT.INDEX_CAS, reason: `index row ${u.id} field ${k} would change but is not allowed` };
		}
		if (sha(canonicalJson(newRow)) !== u.newEntryHash)
			return { code: EXIT.FORMAT, reason: `planned newEntryHash for ${u.id} does not match the computed row` };
		Object.assign(row, newRow);
	}
	const newIdx = textFile(idx);
	if (idx.records.map((r) => r.id).join('\u0000') !== idOrderBefore.join('\u0000'))
		return { code: EXIT.INDEX_CAS, reason: 'index row order changed' };
	const idxState = readLeafState(root, idxPath);
	if (!idxState.ok) return { code: idxState.code, reason: `index: ${idxState.reason}` };
	leaves.push({ rel: idxPath, bytes: Buffer.from(newIdx, 'utf8'), preSha256: shaFile(idxAbs), postSha256: sha(newIdx), ...idxState });

	// (d) dependencies must still match the plan
	for (const [rel, expected] of Object.entries(plan.dependencies ?? {})) {
		const p = join(root, rel);
		if (!existsSync(p)) return { code: EXIT.DEPENDENCY_CAS, reason: `dependency missing: ${rel}` };
		const got = shaFile(p);
		if (got !== expected) return { code: EXIT.DEPENDENCY_CAS, reason: `dependency drift ${rel}: expected ${expected}, found ${got}` };
	}

	// (e) record directory tree sha must be BASE now (proves payload beside record.json is untouched)
	if (!allowDrift)
		for (const [id, t] of Object.entries(plan.recordTrees ?? {})) {
			const got = directorySha256(join(root, t.path));
			if (got !== t.baseSha256)
				return { code: EXIT.TREE_CAS, reason: `record tree ${id}: expected BASE tree ${t.baseSha256}, found ${got}` };
		}

	return { ok: true, leaves, stateBefore: state };
}

function checkSingleLogPath(plan) {
	const paths = new Set((plan.logAppends ?? []).map((la) => la.path));
	if (paths.size !== 1) return null;
	const [only] = [...paths];
	return only === 'records/changelog.json' ? only : null;
}

/** Post-write verification: hashes, index invariants, changelog prefix, record tree shas. */
function verifyApplied({ root, plan, under }) {
	for (const leaf of under.leaves) {
		const now = readLeafState(root, leaf.rel);
		if (!now.ok) return { ok: false, reason: `post ${leaf.rel}: ${now.reason}` };
		if (now.sha256 !== leaf.postSha256)
			return { ok: false, reason: `post ${leaf.rel}: expected ${leaf.postSha256}, found ${now.sha256}` };
	}

	for (const [id, t] of Object.entries(plan.recordTrees ?? {})) {
		const got = directorySha256(join(root, t.path));
		if (got !== t.newSha256) return { ok: false, reason: `post record tree ${id}: expected NEW ${t.newSha256}, found ${got}` };
	}

	const idx = JSON.parse(readFileSync(join(root, 'records/index.json'), 'utf8'));
	for (const u of plan.indexUpdates) {
		const row = idx.records.find((r) => r.id === u.id);
		if (!row) return { ok: false, reason: `post index row ${u.id} missing` };
		if (row.updatedAt !== u.baseEntry.updatedAt) return { ok: false, reason: `post index row ${u.id} updatedAt changed` };
		if (sha(canonicalJson(row)) !== u.newEntryHash) return { ok: false, reason: `post index row ${u.id} hash != planned newEntryHash` };
	}

	const log = JSON.parse(readFileSync(join(root, plan.logAppends[0].path), 'utf8'));
	for (const la of plan.logAppends) {
		const hits = log.filter((e) => sha(canonicalJson(e)) === la.eventHash);
		if (hits.length !== 1) return { ok: false, reason: `post log event appears ${hits.length} times (must be exactly 1)` };
	}

	return { ok: true };
}

// ------------------------------------------------------------------ rollback

/**
 * OWNED rollback: a leaf is restored only when its CURRENT bytes are exactly what THIS run wrote.
 * A leaf that is back at its pre-image is treated as already rolled back. Anything else is a
 * conflict: no restore, no mtime chase, no merge — the journal and lock are kept for a human.
 */
function rollback({ root, journal, written, backup, runId, inject }) {
	if (inject === 'rollback-fail') return { ok: false, code: EXIT.ROLLBACK_FAILED, stage: STAGE.ROLLBACK_FAILED };

	const conflicts = [];
	const order = [...written].reverse();
	for (const rel of order) {
		const leaf = journal.leaves.find((l) => l.path === rel);
		const now = readLeafState(root, rel);
		if (!now.ok) {
			conflicts.push({ path: rel, reason: now.reason });
			continue;
		}
		if (now.sha256 === leaf.preSha256 && now.dev === leaf.dev) continue; // already rolled back
		if (now.sha256 !== leaf.postSha256) {
			conflicts.push({ path: rel, expectedPost: leaf.postSha256, observed: now.sha256, reason: 'external modification' });
			continue;
		}
		const src = backup[rel];
		if (!src || !existsSync(src)) {
			conflicts.push({ path: rel, reason: 'backup missing' });
			continue;
		}
		const bytes = readFileSync(src);
		if (sha(bytes) !== leaf.preSha256) {
			conflicts.push({ path: rel, reason: 'backup sha mismatch' });
			continue;
		}
		replaceLeaf(root, rel, bytes, `${runId}-rb`);
		const after = readLeafState(root, rel);
		if (!after.ok || after.sha256 !== leaf.preSha256) conflicts.push({ path: rel, reason: 'restore verification failed' });
	}

	if (conflicts.length) {
		if (conflicts.some((c) => c.reason === 'external modification'))
			return { ok: false, code: EXIT.ROLLBACK_CONFLICT, stage: STAGE.ROLLBACK_CONFLICT, conflicts };
		return { ok: false, code: EXIT.ROLLBACK_FAILED, stage: STAGE.ROLLBACK_FAILED, conflicts };
	}
	return { ok: true, code: EXIT.OK };
}

// ------------------------------------------------------------------ recovery

/**
 * Journal-driven recovery. Every leaf must be either its recorded pre-image or its recorded
 * post-image; a third value is an external modification → STOP. Recovery writes forward from
 * the delivery payload, verifying each regenerated byte's sha against the journal first.
 */
async function recoverJournal({ root, results, plan, delivery, journalPath, dev, ino, runId, approvedPins }) {
	if (!existsSync(journalPath))
		return { code: EXIT.OK, recovered: false, reason: 'no journal; nothing to recover' };

	const journal = JSON.parse(readFileSync(journalPath, 'utf8'));
	if (journal.dev !== dev || journal.ino !== ino)
		return { code: EXIT.ROOT_MISMATCH, reason: 'journal belongs to a different root identity' };

	const lock = acquireLock({ results, dev, ino, runId });
	if (!lock.ok) return { code: lock.code, reason: lock.reason };

	try {
		// 1) journal is authoritative: every leaf must be its recorded pre- or post-image FIRST.
		const needsWrite = [];
		for (const leaf of journal.leaves) {
			const cur = readLeafState(root, leaf.path);
			if (!cur.ok) return { code: cur.code, reason: `recover ${leaf.path}: ${cur.reason}` };
			if (cur.sha256 === leaf.postSha256) continue;
			if (cur.sha256 !== leaf.preSha256)
				return {
					code: EXIT.EXTERNAL_CHANGE,
					reason: `recover ${leaf.path}: sha ${cur.sha256} is neither pre ${leaf.preSha256} nor post ${leaf.postSha256}; refusing to finish or overwrite`,
				};
			needsWrite.push(leaf.path);
		}

		// 2) only now regenerate the missing bytes from the delivery payload (allowDrift: the tree is mid-batch)
		const regenerated = buildPlan({ root, plan, delivery, expectedState: null, allowDrift: true });
		if (!regenerated.ok) return { code: regenerated.code, reason: `recover: ${regenerated.reason}` };
		const bytesByPath = new Map(regenerated.leaves.map((l) => [l.rel, l]));

		const postBytes = new Map();
		for (const rel of needsWrite) {
			const leaf = journal.leaves.find((l) => l.path === rel);
			const replanned = bytesByPath.get(rel);
			if (!replanned || sha(replanned.bytes) !== leaf.postSha256)
				return { code: EXIT.PAYLOAD_MISMATCH, reason: `recover ${rel}: regenerated payload sha does not match the journal post-image` };
			postBytes.set(rel, replanned.bytes);
		}

		for (const [rel, bytes] of postBytes) replaceLeaf(root, rel, bytes, `${runId}-rec`);

		journal.stage = STAGE.COMPLETE;
		journal.recoveredAt = new Date().toISOString();
		journal.recoveredByRunId = runId;
		writeJournal(journalPath, journal);
		return { code: EXIT.OK, recovered: true, recoveredLeaves: [...postBytes.keys()], journalPath, lockPath: lock.path };
	} finally {
		lock.release();
	}
}

// ------------------------------------------------------------------ main

/**
 * Apply / dry-run / recover one batch.
 * @returns {Promise<{code:number, reason?:string, applied?:boolean, noop?:boolean, writeOrder?:string[], journalPath?:string, lockPath?:string}>}
 */
export async function applyA0(opts) {
	const {
		root,
		delivery,
		results,
		binding,
		approvedPins,
		runId = `run-${process.pid}`,
		dryRun = false,
		recover = false,
		inject = null,
		injectPath = null,
		injectBytes = null,
	} = opts;

	const pinPaths = opts.pinPaths ?? {
		a0Ticket: join(delivery, 'content-ticket.v2.json'),
		a0CASPlan: join(delivery, 'index-cas-plan.v2.json'),
	};

	const pins = verifyApprovedPins({ approved: approvedPins, paths: pinPaths });
	if (!pins.ok) return { code: pins.code, reason: pins.reason };

	const rootId = assertRootIdentity({ root, binding });
	if (!rootId.ok) return { code: rootId.code, reason: rootId.reason };
	const { dev, ino } = rootId;

	const planRaw = readFileSync(join(delivery, 'index-cas-plan.v2.json'));
	const plan = JSON.parse(planRaw.toString('utf8'));
	const journalPath = join(results, 'journal', `${dev}-${ino}.json`);

	// scope gate
	const planned = [...plan.contentChanges.map((c) => c.path), 'records/changelog.json', 'records/index.json'];
	const scopeBad = planned.filter((p) => !A0_DATA_WHITELIST.includes(p) || (plan.allowedWrites?.length && !plan.allowedWrites.includes(p)));
	if (scopeBad.length) return { code: EXIT.SCOPE, reason: `scope violation - planned path(s) outside the A0 allowlist: ${scopeBad.join(', ')}` };
	if (!checkSingleLogPath(plan)) return { code: EXIT.SCOPE, reason: 'log appends must be exactly records/changelog.json' };

	if (recover) return recoverJournal({ root, results, plan, delivery, journalPath, dev, ino, runId, approvedPins });

	const before = classifyBatch({ root, plan });
	if (before.state === 'partial') {
		// A drifted leaf is a STOP too, but name the actual owner of the CAS that failed.
		const recordDrift = before.recordLeaves.filter((l) => l.state === 'drift');
		if (recordDrift.length)
			return {
				code: EXIT.CONTENT_CAS,
				reason: `record content drift (neither BASE nor planned NEW): ${recordDrift
					.map((l) => `${l.path}=${l.sha256}`)
					.join(', ')}; refusing to write`,
			};
		const indexDrift = before.indexStates.filter((i) => i.state === 'drift');
		if (indexDrift.length)
			return {
				code: EXIT.INDEX_CAS,
				reason: `index entry drift (neither baseEntryHash nor newEntryHash): ${indexDrift
					.map((i) => `${i.id}=${i.currentEntryHash}`)
					.join(', ')}; refusing to write`,
			};
		return {
			code: EXIT.PARTIAL,
			reason: `partial/duplicate batch state ${JSON.stringify({ newLeaves: before.newLeaves, index: before.indexStates, events: before.eventCounts })}; per-leaf NEW never implies success`,
		};
	}

	if (before.state === 'applied') {
		if (dryRun) return { code: EXIT.OK, dryRun: true, applied: false, noop: true, planned, writeOrder: [], reason: 'already applied (whole batch consistent)' };
		const lock = acquireLock({ results, dev, ino, runId });
		if (!lock.ok) return { code: lock.code, reason: lock.reason };
		lock.release();
		return { code: EXIT.OK, applied: false, noop: true, dryRun: false, planned, writeOrder: [], reason: 'already applied (whole batch consistent) — nothing rewritten' };
	}

	const plan1 = buildPlan({ root, plan, delivery, expectedState: 'base' });
	if (!plan1.ok) return { code: plan1.code, reason: plan1.reason };

	if (dryRun)
		return {
			code: EXIT.OK,
			dryRun: true,
			applied: false,
			planned,
			writeOrder: plan1.leaves.map((l) => l.rel),
			plannedHashes: plan1.leaves.map((l) => ({ path: l.rel, pre: l.preSha256, post: l.postSha256 })),
		};

	const lock = acquireLock({ results, dev, ino, runId });
	if (!lock.ok) return { code: lock.code, reason: lock.reason };

	const written = [];
	let journal = null;
	const stopKeepingLock = (code, reason, extra = {}) => ({ code, reason, journalPath, lockPath: lock.path, ...extra });

	try {
		// re-read + re-verify under the lock (closes the TOCTOU window)
		const under = buildPlan({ root, plan, delivery, expectedState: 'base' });
		if (!under.ok) {
			lock.release();
			return { code: under.code, reason: `under the lock: ${under.reason}` };
		}

		const backupDir = join(results, 'backup', runId);
		mkdirSync(backupDir, { recursive: true });
		const backup = {};
		for (const leaf of under.leaves) {
			const dst = join(backupDir, leaf.rel.replaceAll('/', '__'));
			copyFileSync(join(root, leaf.rel), dst);
			if (shaFile(dst) !== leaf.preSha256) {
				lock.release();
				return { code: EXIT.EXTERNAL_CHANGE, reason: `backup of ${leaf.rel} does not match the recorded pre-image` };
			}
			backup[leaf.rel] = dst;
		}

		journal = {
			schemaVersion: 1,
			batch: 'A0',
			runId,
			root,
			dev,
			ino,
			pid: process.pid,
			startedAt: new Date().toISOString(),
			stage: STAGE.PREPARING,
			planSha256: sha(planRaw),
			leaves: under.leaves.map((l) => ({
				path: l.rel,
				preSha256: l.preSha256,
				postSha256: l.postSha256,
				dev: l.dev,
				ino: l.ino,
				nlink: l.nlink,
			})),
			backup,
			writeOrder: [],
		};
		mkdirSync(dirname(journalPath), { recursive: true });
		writeJournal(journalPath, journal);

		if (inject === 'external-touch-before-write') {
			const rel = injectPath ?? under.leaves[0].rel;
			writeFileSync(join(root, rel), injectBytes ?? 'foreign\n');
		}

		journal.stage = STAGE.WRITING;
		writeJournal(journalPath, journal);

		for (const [index, leaf] of under.leaves.entries()) {
			const now = readLeafState(root, leaf.rel);
			if (!now.ok) return stopKeepingLock(now.code, `pre-write ${leaf.rel}: ${now.reason}`, { journalPath, lockPath: lock.path });
			if (now.sha256 !== leaf.preSha256 || now.dev !== leaf.dev || now.ino !== leaf.ino || now.nlink !== leaf.nlink) {
				journal.conflict = { path: leaf.rel, expected: leaf.preSha256, observed: now.sha256 };
				writeJournal(journalPath, journal);
				return stopKeepingLock(
					EXIT.EXTERNAL_CHANGE,
					`${leaf.rel} changed outside this run before writing (expected pre ${leaf.preSha256}, observed ${now.sha256}); STOP without writing`,
				);
			}

			const crashAt = inject?.startsWith('crash-after-') ? Number(inject.slice('crash-after-'.length)) : null;
			if (crashAt === index) {
				journal.crashAfter = index;
				writeJournal(journalPath, journal);
				writeFileSync(lock.path, JSON.stringify({ pid: 999999, runId, startedAt: journal.startedAt }, null, 2) + '\n');
				return { code: EXIT.CRASH_SIMULATED, reason: `simulated crash after ${index} write(s); journal + stale lock kept`, journalPath, lockPath: lock.path, writeOrder: [...written] };
			}

			replaceLeaf(root, leaf.rel, leaf.bytes, runId);
			written.push(leaf.rel);
			journal.writeOrder = [...written];
			writeJournal(journalPath, journal);

			if (inject === `mid-write-after-${index + 1}`) throw new Error(`injected failure after ${index + 1} write(s)`);
			if (inject === 'rollback-conflict' && index === 0) {
				writeFileSync(join(root, leaf.rel), injectBytes ?? 'foreign-rollback\n');
				throw new Error('injected failure after external modification');
			}
			if (inject === 'rollback-fail' && index === 0) throw new Error('injected failure before rollback');
		}

		journal.stage = STAGE.WRITTEN;
		writeJournal(journalPath, journal);

		if (inject === 'post-write-verify') throw new Error('injected post-write verification failure');

		const post = verifyApplied({ root, plan, under });
		if (!post.ok) throw new Error(post.reason);

		journal.stage = STAGE.COMPLETE;
		journal.completedAt = new Date().toISOString();
		writeJournal(journalPath, journal);
		lock.release();
		return { code: EXIT.OK, applied: true, noop: false, dryRun: false, planned, writeOrder: [...written], journalPath, lockPath: lock.path };
	} catch (err) {
		const rb = journal ? rollback({ root, journal, written, backup: journal.backup, runId, inject }) : { ok: true, code: EXIT.OK };
		if (!rb.ok) {
			journal.stage = rb.stage;
			if (rb.conflicts) journal.conflicts = rb.conflicts;
			journal.error = err.message;
			writeJournal(journalPath, journal);
			return stopKeepingLock(
				rb.code,
				`${err.message}; rollback ${rb.code === EXIT.ROLLBACK_CONFLICT ? 'CONFLICT — external modification kept, backup NOT restored' : 'failed'}`,
				{ rolledBack: false, conflicts: rb.conflicts ?? [] },
			);
		}
		journal.stage = STAGE.ROLLED_BACK;
		journal.error = err.message;
		writeJournal(journalPath, journal);
		lock.release();
		return {
			code: inject ? EXIT.INJECTED : rb.code,
			reason: `${err.message}; rolled back to pre-image`,
			rolledBack: true,
			journalPath,
			lockPath: lock.path,
			writeOrder: [...written],
		};
	}
}

// ------------------------------------------------------------------ CLI

/**
 * node scripts/content-batch-integration-apply.mjs \
 *   --root <siteRoot> --delivery <A0/v2> --results <externalResults> \
 *   --binding <binding.json> --amendment <amendment-v1.json> [--run-id X] \
 *   [--dry-run] [--recover] [--inject NAME]
 *
 * Approved pins come from the parent-approved amendment; a live hash is only ever compared to them.
 */
const isMain = process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname);

if (isMain) {
	const argv = process.argv.slice(2);
	const arg = (name, fallback = null) => {
		const i = argv.indexOf(`--${name}`);
		return i >= 0 ? argv[i + 1] : fallback;
	};
	const flag = (name) => argv.includes(`--${name}`);

	const root = arg('root');
	const delivery = arg('delivery');
	const results = arg('results');
	const bindingPath = arg('binding');
	const amendmentPath = arg('amendment');

	for (const [k, v] of Object.entries({ root, delivery, results, bindingPath, amendmentPath })) {
		if (!v) {
			console.error(`missing --${k}`);
			process.exit(EXIT.FORMAT);
		}
	}

	const amendment = JSON.parse(readFileSync(amendmentPath, 'utf8'));
	if (amendment.effective !== true || amendment.status !== 'parent-approved-effective') {
		console.error(`STOP: amendment is not parent-approved-effective (status=${amendment.status}, effective=${amendment.effective})`);
		process.exit(EXIT.PIN_DRIFT);
	}
	const approvedPins = Object.fromEntries(
		Object.entries(amendment.pinClassification.executablePins).map(([k, v]) => [k, v.expected]),
	);
	const pinPaths = Object.fromEntries(
		Object.entries(amendment.pinClassification.executablePins).map(([k, v]) => [k, v.path]),
	);

	applyA0({
		root,
		delivery,
		results,
		binding: JSON.parse(readFileSync(bindingPath, 'utf8')),
		approvedPins,
		pinPaths,
		runId: arg('run-id', `run-${process.pid}`),
		dryRun: flag('dry-run'),
		recover: flag('recover'),
		inject: arg('inject'),
		injectPath: arg('inject-path'),
		injectBytes: arg('inject-bytes'),
	})
		.then((r) => {
			console.log(JSON.stringify(r, null, 2));
			process.exit(r.code);
		})
		.catch((err) => {
			console.error(err);
			process.exit(EXIT.FORMAT);
		});
}
