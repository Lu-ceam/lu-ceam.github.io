import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import { workedLeader } from './callout-polish-fixtures.ts';
import {
	LETTERBOX_STUB_PENETRATE,
	leaderEntersNoteInterior,
	leaderPathLength,
	leaderTerminusDashOffset,
	leaderViolatesNoteInterior,
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
	const firstVertical = start.x === turn.x && start.y !== turn.y;
	const firstHorizontal = start.y === turn.y && start.x !== turn.x;
	assert.equal(firstVertical || firstHorizontal, true, 'first segment orthogonal');
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

	// Letterbox stays an orthogonal elbow: a vertical run from the mark toward the band,
	// then a horizontal terminal stub into note.left or note.right near the plate-facing edge.
	// It does not end on the note.top / note.bottom midpoint. Side kinds stay on sideElbow.
	// Nearer side is tried first; the farther side is used when it is the one that survives omit.
	function assertSideTerminus(
		points: readonly { x: number; y: number }[] | null | undefined,
		note: { left: number; right: number; top: number; bottom: number },
	): asserts points is { x: number; y: number }[] {
		assertOrthogonalLetterbox(points);
		const end = points.at(-1);
		const before = points.at(-2);
		assert.ok(end && before);
		assert.equal(before.y, end.y);
		assert.notEqual(before.x, end.x);
		const intoLeft =
			before.x <= note.left + 1e-9 &&
			end.x >= note.left - 1e-9 &&
			end.x <= note.left + LETTERBOX_STUB_PENETRATE + 1e-9;
		const intoRight =
			before.x >= note.right - 1e-9 &&
			end.x <= note.right + 1e-9 &&
			end.x >= note.right - LETTERBOX_STUB_PENETRATE - 1e-9;
		assert.equal(intoLeft || intoRight, true, 'terminus crosses a vertical side into note ink');
		assert.notEqual(end.y, note.top);
		assert.notEqual(end.y, note.bottom);
		const height = note.bottom - note.top;
		const inset = Math.min(8, Math.max(0, height / 2 - 1e-6));
		const nearTop = Math.abs(end.y - (note.top + inset)) <= 1e-6;
		const nearBottom = Math.abs(end.y - (note.bottom - inset)) <= 1e-6;
		assert.equal(nearTop || nearBottom, true, 'terminus hugs plate-facing edge');
		const midX = (note.left + note.right) / 2;
		assert.equal(end.x === midX && (end.y === note.top || end.y === note.bottom), false);
		assert.equal(leaderViolatesNoteInterior(points, note), false);
		assert.equal(leaderEntersNoteInterior(points, note), true, 'tip must overlap note ink');
	}

	it('meets a top letterbox note on a horizontal stub into the nearer side', () => {
		const mark = { x: 180, y: 40, w: 40, h: 40 };
		const note = { left: -80, right: 200, top: -70, bottom: -20 };
		assert.equal(splitLeaderPath({ mark, side: 'right', note }), null);
		const points = splitLeaderPath({ mark, side: 'right', note, kind: 'letterbox' });
		assertSideTerminus(points, note);
		assert.deepEqual(points, [
			{ x: 212, y: 40 },
			{ x: 212, y: -28 },
			{ x: 190, y: -28 },
		]);
	});

	it('meets a bottom letterbox note on a horizontal stub into the nearer side', () => {
		const mark = { x: 100, y: 0, w: 30, h: 20 };
		const note = { left: 140, right: 200, top: 40, bottom: 80 };
		const points = splitLeaderPath({ mark, side: 'right', note, kind: 'letterbox' });
		assertSideTerminus(points, note);
		assert.deepEqual(points, [
			{ x: 128, y: 20 },
			{ x: 128, y: 48 },
			{ x: 150, y: 48 },
		]);
	});

	it('keeps the orthogonal letterbox elbow when another note sits on the old diagonal', () => {
		const note = { left: -40, right: -10, top: -80, bottom: -60 };
		const rows = selectSplitLeaders([
			{
				index: 0,
				kind: 'letterbox',
				mark: { x: 38, y: 29, w: 100, h: 40 },
				side: 'left',
				note,
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
		assertSideTerminus(points, note);
		assert.deepEqual(points, [
			{ x: 38, y: 29 },
			{ x: 38, y: -68 },
			{ x: -20, y: -68 },
		]);
	});

	it('tries the nearer letterbox side, then the farther side that survives omit', () => {
		const note = { left: 20, right: 40, top: 0, bottom: 20 };
		const mark = { x: 0, y: 80, w: 100, h: 20 };
		const nearer = selectSplitLeaders([
			{
				index: 0,
				kind: 'letterbox',
				mark,
				side: 'right',
				note,
				omitLeader: false,
			},
		]);
		const nearerEnd = nearer[0]?.points?.at(-1);
		assert.equal(nearerEnd?.x, note.right - LETTERBOX_STUB_PENETRATE);
		assert.equal(nearerEnd?.y, note.bottom - 8);

		const rows = selectSplitLeaders([
			{
				index: 0,
				kind: 'letterbox',
				mark,
				side: 'right',
				note,
				omitLeader: false,
			},
			{
				index: 1,
				kind: 'letterbox',
				mark: { x: 400, y: 400, w: 10, h: 10 },
				side: 'right',
				note: { left: 48, right: 54, top: 5, bottom: 15 },
				omitLeader: true,
			},
		]);
		const points = rows.find((row) => row.index === 0)?.points ?? null;
		assertSideTerminus(points, note);
		assert.equal(points?.at(-1)?.x, note.left + LETTERBOX_STUB_PENETRATE);
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

	it('keeps the letterbox horizontal run at least one 6 5 dash period so the terminus can paint', () => {
		// Live mhjl329 label ①-class: mark clears the note edge, but outsideX used to park the
		// vertical only ~half a dash away. With stroke-dasharray 6 5 and butt caps that stub
		// (and often the elbow corner) falls into a dash gap — the line stops short of the
		// note even though the last point is on the edge.
		const mark = { x: 180, y: 40, w: 40, h: 40 };
		const note = { left: -80, right: 200, top: -70, bottom: -20 };
		const points = splitLeaderPath({ mark, side: 'right', note, kind: 'letterbox' });
		assertSideTerminus(points, note);
		const vertX = points[0].x;
		const end = points[points.length - 1];
		assert.equal(end.x, note.right - LETTERBOX_STUB_PENETRATE);
		const run = Math.abs(vertX - end.x);
		assert.ok(run >= 12, `horizontal run ${run} must be ≥ dash period 6+5`);
	});
	it('meets a tall bottom letterbox note near the plate-facing edge, not mid-height', () => {
		// Live mhjl329 cover ③: midY buried the elbow under opaque note paper so the
		// vertical read as dying at the block top. Terminus Y stays on the side edge
		// but hugs the band-facing edge (plate side) of a tall note.
		const mark = { x: 246, y: 158, w: 59, h: 23 };
		const note = { left: -30, right: 250, top: 400, bottom: 520 };
		const points = splitLeaderPath({ mark, side: 'right', note, kind: 'letterbox' });
		assertOrthogonalLetterbox(points);
		const end = points.at(-1)!;
		assert.equal(end.x, note.right - LETTERBOX_STUB_PENETRATE);
		const midY = (note.top + note.bottom) / 2;
		assert.ok(end.y < midY, `terminus y ${end.y} should sit above mid ${midY}`);
		assert.ok(end.y >= note.top - 1e-9 && end.y <= note.top + 12 + 1e-9);
	});

	it('parks a letterbox vertical beside the note when the mark sits under it in x', () => {
		// Live mhjl329 cover ② / column-wide note: mark x spans inside the note's
		// horizontal range, so outsideX used to return null and points stayed empty
		// while the note remained visible (omit-on-cross = leader only).
		const mark = { x: 315, y: 196, w: 56, h: 20 };
		const note = { left: 200, right: 380, top: -160, bottom: -120 };
		assert.equal(
			splitLeaderPath({ mark, side: 'right', note, kind: 'letterbox' }) === null &&
				splitLeaderPath({ mark, side: 'left', note, kind: 'letterbox' }) === null,
			false,
			'at least one side must draw when mark is under the note in x',
		);
		const points =
			splitLeaderPath({ mark, side: 'right', note, kind: 'letterbox' }) ??
			splitLeaderPath({ mark, side: 'left', note, kind: 'letterbox' });
		assertOrthogonalLetterbox(points);
		const end = points.at(-1)!;
		const before = points.at(-2)!;
		const intoLeft =
			before.x <= note.left + 1e-9 &&
			Math.abs(end.x - (note.left + LETTERBOX_STUB_PENETRATE)) <= 1e-9;
		const intoRight =
			before.x >= note.right - 1e-9 &&
			Math.abs(end.x - (note.right - LETTERBOX_STUB_PENETRATE)) <= 1e-9;
		assert.equal(intoLeft || intoRight, true);
		assert.equal(leaderViolatesNoteInterior(points, note), false);
		assert.equal(leaderEntersNoteInterior(points, note), true);
	});

	it('keeps a park letterbox leader through selectSplitLeaders (no own-box reentry)', () => {
		// Regression for #76 parkX: splitLeaderPath returned a mid-mark start that
		// reentersOwnBox rejected, so cover ② stayed empty after selectSplitLeaders.
		const mark = { x: 315, y: 196, w: 56, h: 20 };
		const note = { left: 220, right: 380, top: -120, bottom: -80 };
		const rows = selectSplitLeaders([
			{
				index: 1,
				kind: 'letterbox',
				mark,
				side: 'right',
				note,
				omitLeader: false,
			},
		]);
		const points = rows[0]?.points ?? null;
		assertOrthogonalLetterbox(points);
		assert.equal(points[0]!.x === mark.x || points[0]!.x === mark.x + mark.w, true);
		assert.notEqual(points[0]!.x, mark.x + mark.w / 2);
		assert.equal(leaderViolatesNoteInterior(points, note), false);
		assert.equal(leaderEntersNoteInterior(points, note), true);
	});


	it('keeps the letterbox terminal stub as one full horizontal segment into the note', () => {
		// terminalStub used to bisect the run (finalSeg = hGap/2). At phone scale ~0.67 a
		// 6uu tip is ~4px and, with dash gaps, vanishes — falp381 insert ②③ looked like
		// "vertical only" / "dashes on the plate row" even though a polyline existed.
		const mark = { x: 180, y: 40, w: 40, h: 40 };
		const note = { left: -80, right: 200, top: -70, bottom: -20 };
		const points = splitLeaderPath({ mark, side: 'right', note, kind: 'letterbox' });
		assertSideTerminus(points, note);
		const before = points.at(-2)!;
		const end = points.at(-1)!;
		assert.equal(before.y, end.y);
		const finalSeg = Math.abs(end.x - before.x);
		assert.ok(finalSeg + 1e-9 >= 12, `final horizontal ${finalSeg} must be the full stub (≥12)`);
		// No bisect: the vertex before the tip is the vertical park, not a mid-stub kink.
		const vert = points.at(-3);
		assert.ok(vert);
		assert.equal(vert.x, before.x);
		assert.notEqual(vert.y, before.y);
	});

	it('paints nearly a full solid dash into the note tip (cover ④ cream-gap class)', () => {
		const mark = { x: 145, y: 175, w: 114, h: 25 };
		const note = { left: -91.5, right: 88.2, top: 276.3, bottom: 306.7 };
		const points = splitLeaderPath({ mark, side: 'right', note, kind: 'letterbox' });
		assertOrthogonalLetterbox(points);
		const end = points.at(-1)!;
		assert.equal(end.x, note.right - LETTERBOX_STUB_PENETRATE);
		const before = points.at(-2)!;
		assert.equal(before.y, end.y);
		const finalSeg = Math.abs(end.x - before.x);
		assert.ok(finalSeg + 1e-9 >= 12, `finalSeg ${finalSeg}`);
		assert.equal(leaderEntersNoteInterior(points, note), true);
		const len = leaderPathLength(points);
		const offset = leaderTerminusDashOffset(len);
		const phase = ((len - offset) % 11 + 11) % 11;
		assert.ok(phase >= 5, `tip phase ${phase} should sit near solid end (≥5)`);
	});

	it('rejects a letterbox park that falls outside the visible pane x band', () => {
		// falp381 insert ② at phone: note.left === paneLeft → parkX = note.left - 12 is
		// clipped by split-imagery overflow. Prefer an in-band side or omit.
		const mark = { x: 81, y: 123, w: 98, h: 104 };
		const note = { left: -91.5, right: 154.5, top: 419.3, bottom: 510.5 };
		const visibleX = { left: -91.5, right: 491.5 };
		const open = selectSplitLeaders(
			[{ index: 1, kind: 'letterbox', mark, side: 'right', note, omitLeader: false }],
		);
		assert.ok(open[0]?.points, 'unclipped selection still finds a path');
		const clipped = selectSplitLeaders(
			[{ index: 1, kind: 'letterbox', mark, side: 'right', note, omitLeader: false }],
			{ visibleX },
		);
		const pts = clipped[0]?.points;
		if (pts) {
			for (const p of pts) {
				assert.ok(p.x >= visibleX.left - 1e-9 && p.x <= visibleX.right + 1e-9, `x ${p.x}`);
			}
		}
	});

	it('draws cover ② park leader past a wide upper mark without emptying the polyline', () => {
		// Live mhjl329 cover at phone: ② note in the top band over the catalog mark while
		// ①'s wide title mark sits above. Park must clear the own box and not die empty.
		const mark0 = { x: 38, y: 29, w: 327, h: 73 };
		const mark1 = { x: 315, y: 196, w: 56, h: 20 };
		const note0 = { left: 200, right: 380, top: -70, bottom: -30 };
		const note1 = { left: 220, right: 380, top: -120, bottom: -80 };
		const rows = selectSplitLeaders([
			{ index: 0, kind: 'letterbox', mark: mark0, side: 'left', note: note0, omitLeader: false },
			{ index: 1, kind: 'letterbox', mark: mark1, side: 'left', note: note1, omitLeader: false },
		]);
		const points = rows.find((row) => row.index === 1)?.points ?? null;
		assertOrthogonalLetterbox(points);
		const end = points.at(-1)!;
		const before = points.at(-2)!;
		const intoLeft =
			before.x <= note1.left + 1e-9 &&
			Math.abs(end.x - (note1.left + LETTERBOX_STUB_PENETRATE)) <= 1e-9;
		const intoRight =
			before.x >= note1.right - 1e-9 &&
			Math.abs(end.x - (note1.right - LETTERBOX_STUB_PENETRATE)) <= 1e-9;
		assert.equal(intoLeft || intoRight, true);
	});

});



describe('leader dash phase at terminus', () => {
	it('places the path end near the end of a 6-unit solid dash', () => {
		// Mid-solid (phase 3) left only ~2 CSS px of ink at phone plate scale ~0.67 —
		// the preceding gap read as a ~6px cream hollow before 「盤」 (mhjl329 cover ④).
		// Target just inside the solid end so nearly a full dash of ink meets the note.
		// stroke-dasharray 6 5 → period 11; solid is phase [0, 6). Target ≈ 5.5.
		const target = 5.5;
		const length = 413.4;
		const offset = leaderTerminusDashOffset(length);
		const phase = ((length - offset) % 11 + 11) % 11;
		assert.ok(Math.abs(phase - target) < 1e-6, `phase ${phase}`);
		assert.equal(leaderTerminusDashOffset(0), (0 - target + 11) % 11);
		assert.equal(leaderTerminusDashOffset(target), 0);
	});

	it('sums orthogonal leader segments for dash offset', () => {
		assert.equal(
			leaderPathLength([
				{ x: 0, y: 0 },
				{ x: 0, y: 10 },
				{ x: 5, y: 10 },
			]),
			15,
		);
	});
});
