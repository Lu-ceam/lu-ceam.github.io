import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import { workedLeader } from './callout-polish-fixtures.ts';
import {
	leaderEntersNoteInterior,
	polylinesProperlyCross,
	selectSplitLeaders,
	splitLeaderPath,
} from './split-leaders.ts';

const here = dirname(fileURLToPath(import.meta.url));

function assertOrthogonalLetterbox(
	points: readonly { x: number; y: number }[] | null | undefined,
): asserts points is { x: number; y: number }[] {
	assert.ok(points && points.length >= 3);
	const start = points[0];
	const turn = points[1];
	const beforeEnd = points.at(-2);
	const end = points.at(-1);
	assert.ok(start && turn && beforeEnd && end);
	assert.equal(start.x, turn.x);
	assert.notEqual(start.y, turn.y);
	assert.equal(beforeEnd.y, end.y);
	assert.notEqual(beforeEnd.x, end.x);
	for (let index = 0; index < points.length - 1; index += 1) {
		const a: { x: number; y: number } | undefined = points[index];
		const b: { x: number; y: number } | undefined = points[index + 1];
		assert.ok(a && b);
		assert.equal(a.x === b.x || a.y === b.y, true);
	}
}

describe('split-frame leader path', () => {
	it('lands the worked stub on the inner edge and mirrors it to the left', () => {
		assert.deepEqual(
			splitLeaderPath({
				mark: { x: 80, y: 20, w: 20, h: 40 },
				side: 'right',
				note: { left: 200, right: 280, top: 50, bottom: 90 },
			}),
			workedLeader.points,
		);
		assert.equal(workedLeader.gap, 100);
		assert.equal(workedLeader.dash, '6 5');
		assert.deepEqual(
			splitLeaderPath({
				mark: { x: 200, y: 20, w: 20, h: 40 },
				side: 'left',
				note: { left: 40, right: 100, top: 50, bottom: 90 },
			}),
			[
				{ x: 200, y: 40 },
				{ x: 184, y: 40 },
				{ x: 116, y: 70 },
				{ x: 100, y: 70 },
			],
		);
	});

	it('uses a 16px stub at gap 32 and half the gap below that', () => {
		assert.deepEqual(
			splitLeaderPath({
				mark: { x: 0, y: 0, w: 10, h: 10 },
				side: 'right',
				note: { left: 42, right: 80, top: 0, bottom: 20 },
			}),
			[
				{ x: 10, y: 5 },
				{ x: 26, y: 5 },
				{ x: 26, y: 10 },
				{ x: 42, y: 10 },
			],
		);
		assert.deepEqual(
			splitLeaderPath({
				mark: { x: 0, y: 0, w: 10, h: 10 },
				side: 'right',
				note: { left: 41, right: 80, top: 0, bottom: 20 },
			}),
			[
				{ x: 10, y: 5 },
				{ x: 25.5, y: 5 },
				{ x: 25.5, y: 10 },
				{ x: 41, y: 10 },
			],
		);
		assert.deepEqual(
			splitLeaderPath({
				mark: { x: 0, y: 0, w: 10, h: 10 },
				side: 'right',
				note: { left: 30, right: 80, top: 0, bottom: 20 },
			}),
			[
				{ x: 10, y: 5 },
				{ x: 20, y: 5 },
				{ x: 20, y: 10 },
				{ x: 30, y: 10 },
			],
		);
	});

	it('omits a short or backward gap unless the run is already horizontal', () => {
		assert.equal(
			splitLeaderPath({
				mark: { x: 0, y: 0, w: 10, h: 10 },
				side: 'right',
				note: { left: 13, right: 40, top: 0, bottom: 20 },
			}),
			null,
		);
		assert.equal(
			splitLeaderPath({
				mark: { x: 0, y: 0, w: 40, h: 10 },
				side: 'right',
				note: { left: 4, right: 30, top: 0, bottom: 20 },
			}),
			null,
		);
		assert.deepEqual(
			splitLeaderPath({
				mark: { x: 0, y: 0, w: 10, h: 20 },
				side: 'right',
				note: { left: 12, right: 40, top: 0, bottom: 20 },
			}),
			[
				{ x: 10, y: 10 },
				{ x: 12, y: 10 },
			],
		);
		assert.deepEqual(
			splitLeaderPath({
				mark: { x: 0, y: 0, w: 10, h: 20 },
				side: 'right',
				note: { left: 100, right: 140, top: 0, bottom: 20 },
			}),
			[
				{ x: 10, y: 10 },
				{ x: 100, y: 10 },
			],
		);
	});

	it('treats own-note contact at the border as success and a strict cross as a cross', () => {
		const note = { left: 20, right: 40, top: 0, bottom: 20 };
		assert.equal(
			leaderEntersNoteInterior(
				[
					{ x: 0, y: 10 },
					{ x: 20, y: 10 },
				],
				note,
			),
			false,
		);
		assert.equal(
			leaderEntersNoteInterior(
				[
					{ x: 0, y: 10 },
					{ x: 50, y: 10 },
				],
				note,
			),
			true,
		);
		assert.equal(
			polylinesProperlyCross(
				[
					{ x: 0, y: 0 },
					{ x: 10, y: 10 },
				],
				[
					{ x: 0, y: 10 },
					{ x: 10, y: 0 },
				],
			),
			true,
		);
		assert.equal(
			polylinesProperlyCross(
				[
					{ x: 0, y: 0 },
					{ x: 10, y: 0 },
				],
				[
					{ x: 10, y: 0 },
					{ x: 10, y: 10 },
				],
			),
			false,
		);
		assert.equal(
			polylinesProperlyCross(
				[
					{ x: 0, y: 0 },
					{ x: 10, y: 0 },
				],
				[
					{ x: 5, y: 0 },
					{ x: 15, y: 0 },
				],
			),
			false,
		);
		const source = readFileSync(join(here, 'split-leaders.ts'), 'utf8');
		assert.equal(source.includes('badge'), false);
		assert.equal(source.includes('leaderEndpoints'), false);
		assert.equal(source.includes('0.35'), false);
	});
});

describe('split-frame leader omit', () => {
	const kept = {
		index: 0,
		mark: { x: -20, y: -10, w: 20, h: 20 },
		side: 'right' as const,
		note: { left: 100, right: 140, top: 60, bottom: 100 },
		omitLeader: false,
	};
	const crossing = {
		index: 1,
		mark: { x: -20, y: 70, w: 20, h: 20 },
		side: 'right' as const,
		note: { left: 100, right: 140, top: -20, bottom: 20 },
		omitLeader: false,
	};

	it('keeps the earlier index and omits the leader that crosses it', () => {
		const forward = selectSplitLeaders([kept, crossing]);
		const backward = selectSplitLeaders([crossing, kept]);
		assert.deepEqual(
			forward.map((row) => row.index),
			[0, 1],
		);
		assert.deepEqual(forward[0]?.points, [
			{ x: 0, y: 0 },
			{ x: 16, y: 0 },
			{ x: 84, y: 80 },
			{ x: 100, y: 80 },
		]);
		assert.equal(forward[1]?.points, null);
		assert.deepEqual(backward, forward);
	});

	it('omits a leader that hits another mark or another note, and honors omitLeader', () => {
		const blocked = selectSplitLeaders([
			{
				index: 0,
				mark: { x: 80, y: 20, w: 20, h: 40 },
				side: 'right',
				note: { left: 200, right: 280, top: 50, bottom: 90 },
				omitLeader: false,
			},
			{
				index: 1,
				mark: { x: 140, y: 50, w: 20, h: 20 },
				side: 'right',
				note: { left: 400, right: 440, top: 0, bottom: 10 },
				omitLeader: true,
			},
		]);
		assert.equal(blocked[0]?.points, null);
		assert.equal(blocked[1]?.points, null);

		const throughNote = selectSplitLeaders([
			{
				index: 0,
				mark: { x: 80, y: 20, w: 20, h: 40 },
				side: 'right',
				note: { left: 200, right: 280, top: 50, bottom: 90 },
				omitLeader: false,
			},
			{
				index: 1,
				mark: { x: 300, y: 300, w: 10, h: 10 },
				side: 'right',
				note: { left: 140, right: 160, top: 50, bottom: 70 },
				omitLeader: true,
			},
		]);
		assert.equal(throughNote[0]?.points, null);
	});

	it('drops an elbow that only crosses a letterbox column tail', () => {
		const elbow = {
			index: 0,
			mark: { x: 160, y: 40, w: 20, h: 20 },
			side: 'right' as const,
			note: { left: 260, right: 340, top: 0, bottom: 20 },
			omitLeader: false,
		};
		const columnTail = {
			index: 1,
			mark: { x: 20, y: 120, w: 20, h: 20 },
			side: 'left' as const,
			note: { left: 0, right: 210, top: 40, bottom: 70 },
			omitLeader: false,
		};
		const glyph = {
			...columnTail,
			note: { left: 0, right: 150, top: 40, bottom: 70 },
		};
		const wide = selectSplitLeaders([elbow, columnTail]);
		const tight = selectSplitLeaders([elbow, glyph]);
		assert.equal(wide.find((row) => row.index === 0)?.points, null);
		assert.ok(tight.find((row) => row.index === 0)?.points);
	});

	// 390×844 mhjl329 label notes, overflow collapsed: leadersWithPoints ≥ 3,
	// or every letterbox note that does not fail a documented cross or hit omit.
	// Desktop label may stay 3/6 under cross omit. Desktop cover letterbox must gain leaders.
	// Letterbox is only the orthogonal elbow: a vertical run at the mark x nearest the note,
	// then a horizontal terminal stub along note.bottom (top band) or note.top (bottom band)
	// into the edge midpoint. No diagonal middle segment. Side kinds stay on sideElbow.
	it('meets a top letterbox note on an orthogonal elbow when the side gap is negative', () => {
		const mark = { x: 180, y: 40, w: 30, h: 40 };
		const note = { left: -80, right: 200, top: -70, bottom: -20 };
		assert.equal(splitLeaderPath({ mark, side: 'right', note }), null);
		const points = splitLeaderPath({ mark, side: 'right', note, kind: 'letterbox' });
		assertOrthogonalLetterbox(points);
		assert.equal(points?.[0]?.x, mark.x);
		assert.equal(points?.[0]?.y, mark.y);
		assert.equal(points?.at(-1)?.y, note.bottom);
		assert.equal(points?.at(-1)?.x, (note.left + note.right) / 2);
		assert.equal(points?.[1]?.x, mark.x);
		assert.equal(points?.[1]?.y, note.bottom);
	});

	it('keeps the orthogonal letterbox elbow when another note sits on the old diagonal', () => {
		const rows = selectSplitLeaders([
			{
				index: 0,
				kind: 'letterbox',
				mark: { x: 38, y: 29, w: 100, h: 40 },
				side: 'left',
				note: { left: -40, right: -10, top: -80, bottom: -60 },
				omitLeader: false,
			},
			{
				index: 2,
				kind: 'letterbox',
				mark: { x: 200, y: 200, w: 10, h: 10 },
				side: 'left',
				note: { left: -40, right: 30, top: -50, bottom: -30 },
				omitLeader: true,
			},
		]);
		const points = rows.find((row) => row.index === 0)?.points ?? null;
		assertOrthogonalLetterbox(points);
		assert.equal(points?.at(-1)?.x, -25);
		assert.equal(points?.at(-1)?.y, -60);
		assert.equal(points?.[0]?.x, 38);
		assert.equal(points?.[1]?.x, 38);
		assert.equal(points?.[1]?.y, -60);
	});

	it('keeps the worked path when the only contact is its own T', () => {
		const rows = selectSplitLeaders([
			{
				index: 0,
				mark: { x: 80, y: 20, w: 20, h: 40 },
				side: 'right',
				note: { left: 200, right: 280, top: 50, bottom: 90 },
				omitLeader: false,
			},
		]);
		assert.deepEqual(rows[0]?.points, workedLeader.points);
	});
});
