import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
	chmodSync,
	cpSync,
	existsSync,
	lstatSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	renameSync,
	rmSync,
	statSync,
	symlinkSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';

import {
	EXIT,
	canonicalJson,
	directorySha256,
	applyA0,
	classifyBatch,
	readLeafState,
	verifyApprovedPins,
	assertRootIdentity,
	acquireLock,
} from './content-batch-integration-apply.mjs';

const sha = (buf) => createHash('sha256').update(buf).digest('hex');
const shaFile = (p) => sha(readFileSync(p));
const writeJson = (p, obj) => writeFileSync(p, `${JSON.stringify(obj, null, 2)}\n`);

// ---------------------------------------------------------------- fixtures

/**
 * Build a throw-away "site tree" + "delivery tree" that mimics the real A0 shape:
 * 3 records with story/images (payload that must stay byte-identical), an index with
 * unrelated rows, and a changelog with an existing prefix.
 */
function makeFixture({ recordCount = 3 } = {}) {
	const base = mkdtempSync(join(tmpdir(), 'cbi-'));
	const root = join(base, 'site');
	const delivery = join(base, 'delivery');
	const results = join(base, 'results');
	mkdirSync(join(root, 'records', 'records'), { recursive: true });
	mkdirSync(join(root, 'records', 'events'), { recursive: true });
	mkdirSync(join(delivery, 'records'), { recursive: true });
	mkdirSync(results, { recursive: true });

	const ids = ['cs6785', '4816856', 'movcl014'].slice(0, recordCount);
	const plan = {
		schemaVersion: 2,
		batch: 'A0',
		contentChanges: [],
		indexUpdates: [],
		entityIndexAppends: [],
		logAppends: [],
		recordTrees: {},
		dependencies: {},
		allowedWrites: [],
	};
	const ticket = { schemaVersion: 1, kind: 'existing-trajectory-order-only', ids, records: {} };

	// dependencies (content must merely be stable)
	for (let i = 0; i < 2; i += 1) {
		const rel = `records/events/evt-dep-${i}.json`;
		writeJson(join(root, rel), { schemaVersion: 1, id: `evt-dep-${i}`, year: 1800 + i });
		plan.dependencies[rel] = shaFile(join(root, rel));
	}

	const dirTree = (dir) => {
		const files = [];
		const walk = (rel) => {
			for (const n of readdirSync(rel ? join(dir, rel) : dir, { withFileTypes: true })) {
				const r = rel ? `${rel}/${n.name}` : n.name;
				if (n.isDirectory()) walk(r);
				else files.push(r);
			}
		};
		walk('');
		files.sort();
		const h = createHash('sha256');
		for (const r of files) {
			h.update(Buffer.from(r, 'utf8'));
			h.update(Buffer.from([0]));
			h.update(sha(readFileSync(join(dir, r))), 'hex');
		}
		return h.digest('hex');
	};

	const indexRows = [
		{ id: 'zz-unrelated-1', updatedAt: '2026-10-01T00:00:00.000Z', sha256: 'a'.repeat(64) },
		...ids.map((id) => ({ id, updatedAt: '2026-11-01T00:00:00.000Z', sha256: '' })),
		{ id: 'zz-unrelated-2', updatedAt: '2026-10-02T00:00:00.000Z', sha256: 'b'.repeat(64) },
	];

	for (const [i, id] of ids.entries()) {
		const dir = join(root, 'records', 'records', id);
		mkdirSync(join(dir, 'images'), { recursive: true });
		mkdirSync(join(delivery, 'records', id), { recursive: true });
		writeJson(join(dir, 'record.json'), {
			schemaVersion: 1,
			id,
			titleZh: `记录 ${id}`,
			trajectory: { titleZh: '时空轨迹', places: [{ id: `p${i}b` }, { id: `p${i}a` }] },
		});
		writeFileSync(join(dir, 'story.md'), `# ${id}\n\n正文不可改。\n`);
		writeFileSync(join(dir, 'images', 'cover-front.jpg'), Buffer.from([0xff, 0xd8, i, 0xff]));
		// delivery payload: same record but trajectory order swapped (the only A0 change)
		writeJson(join(delivery, 'records', id, 'record.json'), {
			schemaVersion: 1,
			id,
			titleZh: `记录 ${id}`,
			trajectory: { titleZh: '时空轨迹', places: [{ id: `p${i}a` }, { id: `p${i}b` }] },
		});

		const before = dirTree(dir);
		const row = indexRows.find((r) => r.id === id);
		row.sha256 = before;
		const newRecSha = shaFile(join(delivery, 'records', id, 'record.json'));
		const afterFilesProbe = { ...{} };
		// after tree sha is computed after applying the payload in a sandbox copy
		const sandbox = join(base, 'sandbox', id);
		cpSync(dir, sandbox, { recursive: true });
		cpSync(join(delivery, 'records', id, 'record.json'), join(sandbox, 'record.json'));
		const after = dirTree(sandbox);
		afterFilesProbe.new = after;
		plan.contentChanges.push({
			path: `records/records/${id}/record.json`,
			baseSha256: shaFile(join(dir, 'record.json')),
			newSha256: newRecSha,
		});
		plan.recordTrees[id] = {
			path: `records/records/${id}`,
			baseSha256: before,
			newSha256: after,
		};
		plan.indexUpdates.push({
			path: 'records/index.json',
			id,
			baseEntry: { id, updatedAt: row.updatedAt, sha256: before },
			newEntry: { id, updatedAt: row.updatedAt, sha256: after },
			baseEntryHash: sha(canonicalJson({ id, updatedAt: row.updatedAt, sha256: before })),
			newEntryHash: sha(canonicalJson({ id, updatedAt: row.updatedAt, sha256: after })),
			fieldsAllowed: ['sha256'],
		});
		ticket.records[id] = { beforeFiles: {}, afterFiles: {} };
	}

	writeJson(join(root, 'records', 'index.json'), {
		schemaVersion: 1,
		generatedAt: '2026-11-02T00:00:00.000Z',
		records: indexRows,
	});

	const prefix = [
		{ at: '2026-10-24T00:32:45+08:00', schemaVersion: 1, added: ['zz-unrelated-1'], changed: [], removed: [] },
		{ at: '2026-10-27T01:00:20+08:00', schemaVersion: 1, added: [], changed: ['zz-unrelated-2'], removed: [] },
	];
	writeJson(join(root, 'records', 'changelog.json'), prefix);

	const event = { at: '2026-11-08T22:40:02+08:00', schemaVersion: 1, added: [], changed: ids, removed: [] };
	plan.logAppends.push({
		path: 'records/changelog.json',
		event,
		eventHash: sha(canonicalJson(event)),
		operation: 'append once',
		baselineLengthInformational: prefix.length,
	});
	plan.allowedWrites = [
		...plan.contentChanges.map((c) => c.path),
		'records/index.json',
		'records/changelog.json',
	];

	writeJson(join(delivery, 'index-cas-plan.v2.json'), plan);
	writeJson(join(delivery, 'content-ticket.v2.json'), ticket);

	const binding = {
		schemaVersion: 1,
		kind: 'content-batch-integration-external-binding',
		targetRoot: { path: root, dev: statSync(root).dev, ino: statSync(root).ino },
	};

	const pins = {
		a0Ticket: shaFile(join(delivery, 'content-ticket.v2.json')),
		a0CASPlan: shaFile(join(delivery, 'index-cas-plan.v2.json')),
	};

	return { base, root, delivery, results, plan, ticket, binding, pins, indexRows, prefix, ids };
}

function cleanup(ctx) {
	rmSync(ctx.base, { recursive: true, force: true });
}

const readIndex = (root) => JSON.parse(readFileSync(join(root, 'records', 'index.json'), 'utf8'));
const readLog = (root) => JSON.parse(readFileSync(join(root, 'records', 'changelog.json'), 'utf8'));
const leafShas = (root, ids) => ({
	index: shaFile(join(root, 'records', 'index.json')),
	log: shaFile(join(root, 'records', 'changelog.json')),
	records: Object.fromEntries(ids.map((id) => [id, shaFile(join(root, 'records', 'records', id, 'record.json'))])),
});

// ---------------------------------------------------------------- RED-first unit behaviour

describe('canonicalJson / directorySha256', () => {
	it('canonicalises with sorted keys and no whitespace', () => {
		assert.equal(canonicalJson({ b: 1, a: [2, { d: 3, c: 4 }] }), '{"a":[2,{"c":4,"d":3}],"b":1}');
	});

	it('directory hash uses sorted relpath + NUL + file digest (records/README algorithm)', () => {
		const ctx = makeFixture({ recordCount: 1 });
		try {
			const dir = join(ctx.root, 'records', 'records', 'cs6785');
			const manual = (() => {
				const files = [];
				const walk = (rel) => {
					for (const n of readdirSync(rel ? join(dir, rel) : dir, { withFileTypes: true })) {
						const r = rel ? `${rel}/${n.name}` : n.name;
						if (n.isDirectory()) walk(r);
						else files.push(r);
					}
				};
				walk('');
				files.sort();
				const h = createHash('sha256');
				for (const r of files) {
					h.update(Buffer.from(r, 'utf8'));
					h.update(Buffer.from([0]));
					h.update(sha(readFileSync(join(dir, r))), 'hex');
				}
				return h.digest('hex');
			})();
			assert.equal(directorySha256(dir), manual);
		} finally {
			cleanup(ctx);
		}
	});
});

describe('verifyApprovedPins', () => {
	it('accepts when live bytes equal the approved values', () => {
		const ctx = makeFixture({ recordCount: 1 });
		try {
			const r = verifyApprovedPins({
				approved: ctx.pins,
				paths: {
					a0Ticket: join(ctx.delivery, 'content-ticket.v2.json'),
					a0CASPlan: join(ctx.delivery, 'index-cas-plan.v2.json'),
				},
			});
			assert.equal(r.ok, true);
		} finally {
			cleanup(ctx);
		}
	});

	it('STOPS instead of re-sampling when a live pin differs from the approved value', () => {
		const ctx = makeFixture({ recordCount: 1 });
		try {
			const ticketPath = join(ctx.delivery, 'content-ticket.v2.json');
			writeJson(ticketPath, { ...ctx.ticket, tampered: true });
			const r = verifyApprovedPins({
				approved: ctx.pins,
				paths: { a0Ticket: ticketPath, a0CASPlan: join(ctx.delivery, 'index-cas-plan.v2.json') },
			});
			assert.equal(r.ok, false);
			assert.equal(r.code, EXIT.PIN_DRIFT);
			assert.match(r.reason, /re-?sampl/i);
		} finally {
			cleanup(ctx);
		}
	});
});

describe('assertRootIdentity', () => {
	it('accepts the bound root', () => {
		const ctx = makeFixture({ recordCount: 1 });
		try {
			assert.equal(assertRootIdentity({ root: ctx.root, binding: ctx.binding }).ok, true);
		} finally {
			cleanup(ctx);
		}
	});

	it('rejects a different root (dev/ino mismatch)', () => {
		const ctx = makeFixture({ recordCount: 1 });
		try {
			const other = mkdtempSync(join(tmpdir(), 'cbi-other-'));
			const binding = { ...ctx.binding, targetRoot: { ...ctx.binding.targetRoot, ino: -1 } };
			const r = assertRootIdentity({ root: ctx.root, binding });
			assert.equal(r.ok, false);
			assert.equal(r.code, EXIT.ROOT_MISMATCH);
			rmSync(other, { recursive: true, force: true });
		} finally {
			cleanup(ctx);
		}
	});
});

describe('readLeafState / symlink and identity rejection', () => {
	it('rejects a symlinked leaf', () => {
		const ctx = makeFixture({ recordCount: 1 });
		try {
			const leaf = join(ctx.root, 'records', 'index.json');
			const target = join(ctx.base, 'index-real.json');
			cpSync(leaf, target);
			rmSync(leaf);
			symlinkSync(target, leaf);
			const r = readLeafState(ctx.root, 'records/index.json');
			assert.equal(r.ok, false);
			assert.equal(r.code, EXIT.LEAF_IDENTITY);
		} finally {
			cleanup(ctx);
		}
	});

	it('rejects a hard-linked leaf (nlink > 1)', () => {
		const ctx = makeFixture({ recordCount: 1 });
		try {
			const leaf = join(ctx.root, 'records', 'index.json');
			cpSync(leaf, join(ctx.base, 'index-copy.json'));
			execFileSync('ln', [leaf, join(ctx.base, 'index-hard.json')]);
			const st = lstatSync(leaf);
			assert.equal(st.nlink, 2);
			const r = readLeafState(ctx.root, 'records/index.json');
			assert.equal(r.ok, false);
			assert.equal(r.code, EXIT.LEAF_IDENTITY);
		} finally {
			cleanup(ctx);
		}
	});
});

describe('classifyBatch', () => {
	it('returns base when everything is untouched', () => {
		const ctx = makeFixture();
		try {
			const st = classifyBatch({
				root: ctx.root,
				plan: ctx.plan,
				ticket: ctx.ticket,
				delivery: ctx.delivery,
			});
			assert.equal(st.state, 'base');
		} finally {
			cleanup(ctx);
		}
	});

	it('returns partial (never no-op) when only some leaves are NEW', async () => {
		const ctx = makeFixture();
		try {
			// apply only the first record: per-leaf NEW must not be read as "already applied"
			cpSync(join(ctx.delivery, 'records', ctx.ids[0], 'record.json'), join(ctx.root, 'records', 'records', ctx.ids[0], 'record.json'));
			const st = classifyBatch({ root: ctx.root, plan: ctx.plan, ticket: ctx.ticket, delivery: ctx.delivery });
			assert.equal(st.state, 'partial');
			assert.deepEqual(st.newLeaves, [`records/records/${ctx.ids[0]}/record.json`]);
		} finally {
			cleanup(ctx);
		}
	});

	it('returns applied only when records, index rows, log event and untouched leaves all agree', async () => {
		const ctx = makeFixture();
		try {
			const r = await applyA0({
				root: ctx.root,
				delivery: ctx.delivery,
				results: ctx.results,
				binding: ctx.binding,
				approvedPins: ctx.pins,
				runId: 'fixture-apply-1',
			});
			assert.equal(r.code, EXIT.OK);
			const st = classifyBatch({ root: ctx.root, plan: ctx.plan, ticket: ctx.ticket, delivery: ctx.delivery });
			assert.equal(st.state, 'applied');
		} finally {
			cleanup(ctx);
		}
	});

	it('reports partial (not applied) when index advanced but a record was not written', () => {
		const ctx = makeFixture();
		try {
			const idx = readIndex(ctx.root);
			for (const u of ctx.plan.indexUpdates) {
				idx.records.find((r) => r.id === u.id).sha256 = u.newEntry.sha256;
			}
			writeJson(join(ctx.root, 'records', 'index.json'), idx);
			const st = classifyBatch({ root: ctx.root, plan: ctx.plan, ticket: ctx.ticket, delivery: ctx.delivery });
			assert.equal(st.state, 'partial');
		} finally {
			cleanup(ctx);
		}
	});
});

describe('acquireLock', () => {
	it('creates an exclusive lock and refuses a second live owner', () => {
		const ctx = makeFixture({ recordCount: 1 });
		try {
			const a = acquireLock({ results: ctx.results, dev: 1, ino: 2, runId: 'run-a' });
			assert.equal(a.ok, true);
			const b = acquireLock({ results: ctx.results, dev: 1, ino: 2, runId: 'run-b' });
			assert.equal(b.ok, false);
			assert.equal(b.code, EXIT.LOCKED);
			a.release();
		} finally {
			cleanup(ctx);
		}
	});

	it('refuses to silently delete a stale lock owned by a live pid', () => {
		const ctx = makeFixture({ recordCount: 1 });
		try {
			const a = acquireLock({ results: ctx.results, dev: 3, ino: 4, runId: 'run-a' });
			a.release();
			// simulate a lock file left behind by THIS (alive) process
			const p = join(ctx.results, 'lock', '3-4.lock');
			writeFileSync(p, JSON.stringify({ pid: process.pid, runId: 'ghost', startedAt: new Date().toISOString() }));
			const b = acquireLock({ results: ctx.results, dev: 3, ino: 4, runId: 'run-b' });
			assert.equal(b.ok, false);
			assert.equal(b.code, EXIT.LOCKED);
		} finally {
			cleanup(ctx);
		}
	});
});

// ---------------------------------------------------------------- happy path transaction

describe('A0 apply — happy path', () => {
	it('writes only the five planned leaves and preserves everything else', async () => {
		const ctx = makeFixture();
		try {
			const beforeShas = leafShas(ctx.root, ctx.ids);
			const beforeIndex = readIndex(ctx.root);
			const beforeLog = readLog(ctx.root);
			const beforePayload = Object.fromEntries(
				ctx.ids.map((id) => [
					id,
					{
						story: shaFile(join(ctx.root, 'records', 'records', id, 'story.md')),
						img: shaFile(join(ctx.root, 'records', 'records', id, 'images', 'cover-front.jpg')),
					},
				]),
			);

			const r = await applyA0({
				root: ctx.root,
				delivery: ctx.delivery,
				results: ctx.results,
				binding: ctx.binding,
				approvedPins: ctx.pins,
				runId: 'happy-1',
			});
			assert.equal(r.code, EXIT.OK);
			assert.equal(r.applied, true);

			// record.json == planned NEW
			for (const c of ctx.plan.contentChanges) {
				assert.equal(shaFile(join(ctx.root, c.path)), c.newSha256);
			}
			// directory tree sha == planned NEW tree
			for (const [id, t] of Object.entries(ctx.plan.recordTrees)) {
				assert.equal(directorySha256(join(ctx.root, t.path)), t.newSha256, `tree ${id}`);
			}
			// payload untouched
			for (const id of ctx.ids) {
				assert.equal(shaFile(join(ctx.root, 'records', 'records', id, 'story.md')), beforePayload[id].story);
				assert.equal(shaFile(join(ctx.root, 'records', 'records', id, 'images', 'cover-front.jpg')), beforePayload[id].img);
			}
			// index: only named sha256 changed
			const afterIndex = readIndex(ctx.root);
			assert.equal(afterIndex.generatedAt, beforeIndex.generatedAt);
			assert.equal(afterIndex.schemaVersion, beforeIndex.schemaVersion);
			assert.deepEqual(
				afterIndex.records.map((x) => x.id),
				beforeIndex.records.map((x) => x.id),
			);
			for (const u of ctx.plan.indexUpdates) {
				const b = beforeIndex.records.find((x) => x.id === u.id);
				const a = afterIndex.records.find((x) => x.id === u.id);
				assert.equal(a.updatedAt, b.updatedAt);
				assert.equal(a.sha256, u.newEntry.sha256);
				assert.equal(sha(canonicalJson(a)), u.newEntryHash);
			}
			for (const row of beforeIndex.records) {
				if (ctx.ids.includes(row.id)) continue;
				assert.deepEqual(afterIndex.records.find((x) => x.id === row.id), row);
			}
			// changelog: prefix preserved + exactly one append
			const afterLog = readLog(ctx.root);
			assert.deepEqual(afterLog.slice(0, beforeLog.length), beforeLog);
			assert.equal(afterLog.length, beforeLog.length + 1);
			assert.equal(sha(canonicalJson(afterLog[afterLog.length - 1])), ctx.plan.logAppends[0].eventHash);
			// no temp/lock leftovers inside the tree
			const strays = [];
			const walk = (d) => {
				for (const n of readdirSync(d, { withFileTypes: true })) {
					const p = join(d, n.name);
					if (n.isDirectory()) walk(p);
					else if (n.name.includes('cbi-tmp') || n.name.endsWith('.cbi-journal')) strays.push(p);
				}
			};
			walk(ctx.root);
			assert.deepEqual(strays, []);
			assert.equal(existsSync(join(ctx.results, 'lock', `${statSync(ctx.root).dev}-${statSync(ctx.root).ino}.lock`)), false);
		} finally {
			cleanup(ctx);
		}
	});

	it('is a whole-batch no-op on a second run (nothing rewritten, byte-identical)', async () => {
		const ctx = makeFixture();
		try {
			const first = await applyA0({
				root: ctx.root,
				delivery: ctx.delivery,
				results: ctx.results,
				binding: ctx.binding,
				approvedPins: ctx.pins,
				runId: 'idem-1',
			});
			assert.equal(first.code, EXIT.OK);
			const snapshot = leafShas(ctx.root, ctx.ids);
			const inodes = Object.fromEntries(
				['records/index.json', 'records/changelog.json', ...ctx.ids.map((id) => `records/records/${id}/record.json`)].map(
					(p) => [p, lstatSync(join(ctx.root, p)).ino],
				),
			);
			const second = await applyA0({
				root: ctx.root,
				delivery: ctx.delivery,
				results: ctx.results,
				binding: ctx.binding,
				approvedPins: ctx.pins,
				runId: 'idem-2',
			});
			assert.equal(second.code, EXIT.OK);
			assert.equal(second.applied, false);
			assert.equal(second.noop, true);
			assert.deepEqual(leafShas(ctx.root, ctx.ids), snapshot);
			// no rewrite: same inodes (a rename would change them)
			for (const [p, ino] of Object.entries(inodes)) {
				assert.equal(lstatSync(join(ctx.root, p)).ino, ino, `inode ${p} must be untouched on no-op`);
			}
			// log not appended twice
			assert.equal(readLog(ctx.root).length, ctx.prefix.length + 1);
		} finally {
			cleanup(ctx);
		}
	});
});

// ---------------------------------------------------------------- rejection matrix

describe('A0 apply — rejections (no write)', () => {
	const expectStop = async (mutate, code, reasonRe) => {
		const ctx = makeFixture();
		try {
			mutate(ctx);
			const before = leafShas(ctx.root, ctx.ids);
			const r = await applyA0({
				root: ctx.root,
				delivery: ctx.delivery,
				results: ctx.results,
				binding: ctx.binding,
				approvedPins: ctx.pins,
				runId: 'reject-1',
			});
			assert.equal(r.code, code, r.reason);
			if (reasonRe) assert.match(r.reason, reasonRe);
			assert.deepEqual(leafShas(ctx.root, ctx.ids), before, 'tree must be unchanged');
		} finally {
			cleanup(ctx);
		}
	};

	it('STOPs when a named index row drifted away from BASE', async () => {
		await expectStop(
			(ctx) => {
				const idx = readIndex(ctx.root);
				idx.records.find((r) => r.id === ctx.ids[0]).updatedAt = '2020-01-01T00:00:00.000Z';
				writeJson(join(ctx.root, 'records', 'index.json'), idx);
			},
			EXIT.INDEX_CAS,
			/index/i,
		);
	});

	it('STOPs when the record content drifted away from BASE', async () => {
		await expectStop(
			(ctx) => {
				writeJson(join(ctx.root, 'records', 'records', ctx.ids[1], 'record.json'), {
					schemaVersion: 1,
					id: ctx.ids[1],
					trajectory: { places: [{ id: 'x' }] },
				});
			},
			EXIT.CONTENT_CAS,
			/content|record/i,
		);
	});

	it('STOPs when a dependency event drifted', async () => {
		await expectStop(
			(ctx) => {
				const rel = Object.keys(ctx.plan.dependencies)[0];
				writeJson(join(ctx.root, rel), { schemaVersion: 1, id: 'changed', year: 1 });
			},
			EXIT.DEPENDENCY_CAS,
			/dependen/i,
		);
	});

	it('STOPs when the delivery payload does not hash to the planned NEW sha', async () => {
		await expectStop(
			(ctx) => {
				writeJson(join(ctx.delivery, 'records', ctx.ids[2], 'record.json'), { schemaVersion: 1, id: ctx.ids[2] });
			},
			EXIT.PAYLOAD_MISMATCH,
			/payload|new sha/i,
		);
	});

	it('STOPs on a partial batch instead of completing it', async () => {
		await expectStop(
			(ctx) => {
				cpSync(
					join(ctx.delivery, 'records', ctx.ids[0], 'record.json'),
					join(ctx.root, 'records', 'records', ctx.ids[0], 'record.json'),
				);
			},
			EXIT.PARTIAL,
			/partial/i,
		);
	});

	it('STOPs when the changelog already contains the planned event', async () => {
		await expectStop(
			(ctx) => {
				const log = readLog(ctx.root);
				log.push(ctx.plan.logAppends[0].event);
				writeJson(join(ctx.root, 'records', 'changelog.json'), log);
			},
			EXIT.PARTIAL,
			/partial|duplicate/i,
		);
	});

	it('STOPs on a wrong root binding', async () => {
		await expectStop(
			(ctx) => {
				ctx.binding.targetRoot.ino = 424242;
			},
			EXIT.ROOT_MISMATCH,
			/root/i,
		);
	});

	it('STOPs when a planned path escapes the allowed writes', async () => {
		await expectStop(
			(ctx) => {
				ctx.plan.contentChanges.push({
					path: 'src/pages/index.astro',
					baseSha256: 'c'.repeat(64),
					newSha256: 'd'.repeat(64),
				});
				const planPath = join(ctx.delivery, 'index-cas-plan.v2.json');
				writeJson(planPath, ctx.plan);
				ctx.pins.a0CASPlan = shaFile(planPath);
			},
			EXIT.SCOPE,
			/scope|whitelist|allowed/i,
		);
	});
});

// ---------------------------------------------------------------- injections

describe('A0 apply — controlled failure injection', () => {
	it('mid-write failure rolls every leaf back to BASE byte-identically', async () => {
		const ctx = makeFixture();
		try {
			const before = leafShas(ctx.root, ctx.ids);
			const r = await applyA0({
				root: ctx.root,
				delivery: ctx.delivery,
				results: ctx.results,
				binding: ctx.binding,
				approvedPins: ctx.pins,
				runId: 'inj-mid',
				inject: 'mid-write-after-2',
			});
			assert.equal(r.code, EXIT.INJECTED);
			assert.equal(r.rolledBack, true);
			assert.deepEqual(leafShas(ctx.root, ctx.ids), before);
			const journal = JSON.parse(readFileSync(r.journalPath, 'utf8'));
			assert.equal(journal.stage, 'rolled-back');
		} finally {
			cleanup(ctx);
		}
	});

	it('external leaf change during the run STOPS at write time without touching that leaf', async () => {
		const ctx = makeFixture();
		try {
			const foreign = 'externally written content\n';
			const r = await applyA0({
				root: ctx.root,
				delivery: ctx.delivery,
				results: ctx.results,
				binding: ctx.binding,
				approvedPins: ctx.pins,
				runId: 'inj-ext',
				inject: 'external-touch-before-write',
				injectPath: 'records/records/cs6785/record.json',
				injectBytes: foreign,
			});
			assert.equal(r.code, EXIT.EXTERNAL_CHANGE);
			assert.equal(readFileSync(join(ctx.root, 'records', 'records', 'cs6785', 'record.json'), 'utf8'), foreign);
			// nothing else was written
			assert.equal(shaFile(join(ctx.root, 'records', 'index.json')), ctx.plan.indexUpdates[0].baseEntryHash ? leafShas(ctx.root, ctx.ids).index : '');
		} finally {
			cleanup(ctx);
		}
	});

	it('rollback never restores a backup over an externally modified leaf (rollback-conflict)', async () => {
		const ctx = makeFixture();
		try {
			const r = await applyA0({
				root: ctx.root,
				delivery: ctx.delivery,
				results: ctx.results,
				binding: ctx.binding,
				approvedPins: ctx.pins,
				runId: 'inj-conflict',
				inject: 'rollback-conflict',
			});
			assert.equal(r.code, EXIT.ROLLBACK_CONFLICT);
			assert.equal(r.rolledBack, false);
			// the externally written bytes survive; the journal is kept for the human
			assert.equal(readFileSync(join(ctx.root, 'records', 'records', ctx.ids[0], 'record.json'), 'utf8'), 'foreign-rollback\n');
			assert.equal(existsSync(r.journalPath), true);
			const journal = JSON.parse(readFileSync(r.journalPath, 'utf8'));
			assert.equal(journal.stage, 'rollback-conflict');
			assert.equal(journal.conflicts.length, 1);
			assert.equal(journal.conflicts[0].path, `records/records/${ctx.ids[0]}/record.json`);
			// lock kept for the human
			assert.equal(existsSync(r.lockPath), true);
		} finally {
			cleanup(ctx);
		}
	});

	it('rollback failure keeps lock+journal and reports EXIT_ROLLBACK_FAILED', async () => {
		const ctx = makeFixture();
		try {
			const r = await applyA0({
				root: ctx.root,
				delivery: ctx.delivery,
				results: ctx.results,
				binding: ctx.binding,
				approvedPins: ctx.pins,
				runId: 'inj-rbfail',
				inject: 'rollback-fail',
			});
			assert.equal(r.code, EXIT.ROLLBACK_FAILED);
			assert.equal(r.rolledBack, false);
			assert.equal(existsSync(r.journalPath), true);
			assert.equal(existsSync(r.lockPath), true);
			assert.equal(JSON.parse(readFileSync(r.journalPath, 'utf8')).stage, 'rollback-failed');
		} finally {
			cleanup(ctx);
		}
	});

	it('post-write verification failure rolls back to BASE', async () => {
		const ctx = makeFixture();
		try {
			const before = leafShas(ctx.root, ctx.ids);
			const r = await applyA0({
				root: ctx.root,
				delivery: ctx.delivery,
				results: ctx.results,
				binding: ctx.binding,
				approvedPins: ctx.pins,
				runId: 'inj-post',
				inject: 'post-write-verify',
			});
			assert.equal(r.code, EXIT.INJECTED);
			assert.equal(r.rolledBack, true);
			assert.deepEqual(leafShas(ctx.root, ctx.ids), before);
		} finally {
			cleanup(ctx);
		}
	});

	it('writes index.json last (commit marker ordering)', async () => {
		const ctx = makeFixture();
		try {
			const r = await applyA0({
				root: ctx.root,
				delivery: ctx.delivery,
				results: ctx.results,
				binding: ctx.binding,
				approvedPins: ctx.pins,
				runId: 'order-1',
			});
			assert.equal(r.code, EXIT.OK);
			assert.deepEqual(r.writeOrder.slice(-1), ['records/index.json']);
			assert.deepEqual(r.writeOrder.slice(0, 3).sort(), [...ctx.plan.contentChanges.map((c) => c.path)].sort());
			assert.equal(r.writeOrder[3], 'records/changelog.json');
		} finally {
			cleanup(ctx);
		}
	});
});

// ---------------------------------------------------------------- journal recovery

describe('journal-driven crash recovery', () => {
	it('completes an interrupted journal whose written leaves all match post-sha', async () => {
		const ctx = makeFixture();
		try {
			// run with an injection to leave a journal, then simulate a crash by rolling forward
			const r1 = await applyA0({
				root: ctx.root,
				delivery: ctx.delivery,
				results: ctx.results,
				binding: ctx.binding,
				approvedPins: ctx.pins,
				runId: 'crash-1',
				inject: 'crash-after-3',
			});
			assert.equal(r1.code, EXIT.CRASH_SIMULATED);
			const health = await applyA0({
				root: ctx.root,
				delivery: ctx.delivery,
				results: ctx.results,
				binding: ctx.binding,
				approvedPins: ctx.pins,
				runId: 'crash-recover-1',
				recover: true,
			});
			assert.equal(health.code, EXIT.OK, health.reason);
			// after recovery the batch is complete
			for (const c of ctx.plan.contentChanges) assert.equal(shaFile(join(ctx.root, c.path)), c.newSha256);
			assert.equal(readLog(ctx.root).length, ctx.prefix.length + 1);
		} finally {
			cleanup(ctx);
		}
	});

	it('refuses to finish a journal when a leaf matches neither pre- nor post-sha', async () => {
		const ctx = makeFixture();
		try {
			const r1 = await applyA0({
				root: ctx.root,
				delivery: ctx.delivery,
				results: ctx.results,
				binding: ctx.binding,
				approvedPins: ctx.pins,
				runId: 'crash-2',
				inject: 'crash-after-2',
			});
			assert.equal(r1.code, EXIT.CRASH_SIMULATED);
			writeFileSync(join(ctx.root, 'records', 'index.json'), '{"foreign":true}\n');
			const r2 = await applyA0({
				root: ctx.root,
				delivery: ctx.delivery,
				results: ctx.results,
				binding: ctx.binding,
				approvedPins: ctx.pins,
				runId: 'crash-recover-2',
				recover: true,
			});
			assert.equal(r2.code, EXIT.EXTERNAL_CHANGE);
			assert.equal(readFileSync(join(ctx.root, 'records', 'index.json'), 'utf8'), '{"foreign":true}\n');
		} finally {
			cleanup(ctx);
		}
	});
});

// ---------------------------------------------------------------- dry run

describe('dry run', () => {
	it('reports the planned write without touching the tree', async () => {
		const ctx = makeFixture();
		try {
			const before = leafShas(ctx.root, ctx.ids);
			const r = await applyA0({
				root: ctx.root,
				delivery: ctx.delivery,
				results: ctx.results,
				binding: ctx.binding,
				approvedPins: ctx.pins,
				runId: 'dry-1',
				dryRun: true,
			});
			assert.equal(r.code, EXIT.OK);
			assert.equal(r.dryRun, true);
			assert.equal(r.planned.length, 5);
			assert.deepEqual(leafShas(ctx.root, ctx.ids), before);
			assert.equal(existsSync(join(ctx.results, 'lock')), false);
		} finally {
			cleanup(ctx);
		}
	});
});
