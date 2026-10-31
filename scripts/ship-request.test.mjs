import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { assertTrajectoryCheckState, assertTrajectoryTicket, loadShipRequest } from './ship-request.mjs';

describe('loadShipRequest', () => {
	it('resolves relative paths and requires ready assets', async () => {
		const root = await mkdtemp(join(tmpdir(), 'ship-req-'));
		try {
			await mkdir(join(root, 'site-marks', 'x'), { recursive: true });
			await writeFile(join(root, 'site-marks', 'x-details-draft.json'), '{"details":[]}\n');
			await writeFile(
				join(root, 'ship-request.json'),
				JSON.stringify(
					{
						schemaVersion: 1,
						exportDir: '.',
						ids: ['x'],
						records: {
							x: {
								recordSha256: 'abc',
								marks: 'ready',
								trajectory: 'none',
								detailsDraft: 'site-marks/x-details-draft.json',
								siteMarksDir: 'site-marks/x',
							},
						},
					},
					null,
					2,
				),
			);
			const ticket = await loadShipRequest(join(root, 'ship-request.json'));
			assert.equal(ticket.ids[0], 'x');
			assert.equal(ticket.records.x.marks, 'ready');
			assert.equal(ticket.records.x.trajectory, 'none');
			assert.ok(ticket.records.x.detailsDraft.endsWith('x-details-draft.json'));
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	it('rejects waived without reason', async () => {
		const root = await mkdtemp(join(tmpdir(), 'ship-req-'));
		try {
			await writeFile(
				join(root, 'ship-request.json'),
				JSON.stringify({
					schemaVersion: 1,
					ids: ['x'],
					records: { x: { recordSha256: 'abc', marks: 'waived', trajectory: 'none' } },
				}),
			);
			await assert.rejects(() => loadShipRequest(join(root, 'ship-request.json')), /waiverReason/);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	it('rejects a ticket that omits trajectory', async () => {
		const root = await mkdtemp(join(tmpdir(), 'ship-req-'));
		try {
			await writeFile(
				join(root, 'ship-request.json'),
				JSON.stringify({
					schemaVersion: 1,
					ids: ['x'],
					records: { x: { recordSha256: 'abc', marks: 'none' } },
				}),
			);
			await assert.rejects(() => loadShipRequest(join(root, 'ship-request.json')), /trajectory 必填/);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});
});

function bareRecord(extra = {}) {
	return {
		id: 'demo01',
		composer: '巴赫',
		work: '作品',
		performers: '某人',
		label: '厂牌',
		catalogNumber: 'X 1',
		category: '古典',
		pressing: '不详',
		matrix: '不详',
		recording: '不详',
		eq: 'RIAA',
		condition: '未定',
		verificationStatus: 'pending',
		statusLabel: '待复核',
		notes: '一句公开说明。',
		links: [],
		images: [{ file: 'images/cover-front.webp', kind: 'cover-front', caption: '封面' }],
		details: [],
		...extra,
	};
}

describe('assertTrajectoryTicket', () => {
	it('rejects none when the export still has trajectory', () => {
		assert.throws(
			() => assertTrajectoryTicket('demo01', { trajectory: 'none' }, bareRecord({ trajectory: { places: [] } })),
			/含有 trajectory/,
		);
	});

	it('accepts none when the key is absent', () => {
		assert.doesNotThrow(() => assertTrajectoryTicket('demo01', { trajectory: 'none' }, bareRecord()));
	});

	it('rejects ready without a non-empty places array', () => {
		assert.throws(
			() => assertTrajectoryTicket('demo01', { trajectory: 'ready' }, bareRecord()),
			/非空 trajectory\.places/,
		);
		assert.throws(
			() =>
				assertTrajectoryTicket(
					'demo01',
					{ trajectory: 'ready' },
					bareRecord({ trajectory: { places: [] } }),
				),
			/不符合契约|不能为空/,
		);
	});

	it('accepts ready when places satisfy the contract', () => {
		const record = bareRecord({
			trajectory: {
				places: [
					{
						id: 'leipzig',
						year: 1723,
						cityZh: '莱比锡',
						city: 'Leipzig',
						role: 'composition',
						lon: 12.373,
						lat: 51.34,
					},
				],
			},
		});
		assert.doesNotThrow(() => assertTrajectoryTicket('demo01', { trajectory: 'ready' }, record));
	});

	it('rejects a check-state whose stage is not ready', async () => {
		const root = await mkdtemp(join(tmpdir(), 'ship-req-'));
		try {
			const state = join(root, 'state.json');
			await writeFile(state, JSON.stringify({ id: 'demo01', stage: 'draft' }));
			await assert.rejects(() => assertTrajectoryCheckState('demo01', state), /需要 ready/);
			await writeFile(state, JSON.stringify({ id: 'demo01', stage: 'ready' }));
			await assertTrajectoryCheckState('demo01', state);
			await assertTrajectoryCheckState('demo01', undefined);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});
});
