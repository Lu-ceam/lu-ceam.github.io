import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { loadShipRequest } from './ship-request.mjs';

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
					records: { x: { recordSha256: 'abc', marks: 'waived' } },
				}),
			);
			await assert.rejects(() => loadShipRequest(join(root, 'ship-request.json')), /waiverReason/);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});
});
