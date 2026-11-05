import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
	LETTERBOX_BAND_RESERVE_REM,
	NOTE_CAP_REM,
	NOTE_GAP_REM,
} from './detail-display.ts';
import {
	bandLeaderPoints,
	bandNoteGapPx,
	bandNoteWidthPx,
	bandReservePx,
	bandStubUser,
	placeBandNotes,
} from './settled-band-notes.ts';

describe('settled-band-notes · letterbox 常量', () => {
	it('reuses NOTE_CAP_REM / LETTERBOX_BAND_RESERVE_REM / NOTE_GAP_REM', () => {
		assert.equal(bandReservePx(16), LETTERBOX_BAND_RESERVE_REM * 16);
		assert.equal(bandNoteGapPx(16), NOTE_GAP_REM * 16);
		assert.equal(bandReservePx(0), 0);
		assert.equal(bandReservePx(-1), 0);
	});

	it('caps note width with NOTE_CAP_REM against the side strip', () => {
		const pane = { width: 390, height: 640 };
		const plate = { left: 54.4, top: 54.4, width: 281.2, height: 531.2 };
		const width = bandNoteWidthPx({ pane, plate, rem: 16 });
		const strip = (pane.width - plate.width) / 2;
		assert.ok(width <= NOTE_CAP_REM * 16 + 1e-6);
		assert.ok(width <= strip - NOTE_GAP_REM * 16 + 1e-6);
		assert.ok(width > 0);
	});
});

describe('settled-band-notes · placeBandNotes', () => {
	it('keeps every note box outside the plate rectangle', () => {
		const pane = { width: 390, height: 640 };
		const plate = { left: 54.4, top: 80, width: 281.2, height: 480 };
		const placed = placeBandNotes({
			pane,
			plate,
			plateSize: { width: 1000, height: 1700 },
			rem: 16,
			seats: [
				{ side: 'left', center: 400 },
				{ side: 'right', center: 900 },
			],
			heights: [48, 56],
		});
		assert.equal(placed.length, 2);
		for (const note of placed) {
			assert.ok(note.width > 0, 'note needs a real width');
			const right = note.left + note.width;
			const bottom = note.top + note.height;
			const overlaps =
				note.left < plate.left + plate.width &&
				right > plate.left &&
				note.top < plate.top + plate.height &&
				bottom > plate.top;
			assert.equal(overlaps, false, `note intersects plate: ${JSON.stringify(note)}`);
		}
		assert.equal(placed[0]?.side, 'left');
		assert.ok((placed[0]?.stubX ?? 0) <= plate.left + 1e-6);
		assert.equal(placed[1]?.side, 'right');
		assert.ok((placed[1]?.stubX ?? 0) >= plate.left + plate.width - 1e-6);
	});
});

describe('settled-band-notes · leaders', () => {
	it('draws a visible stub past the plate edge (no zero-length elbow)', () => {
		const points = bandLeaderPoints({
			mark: { x: 100, y: 200, w: 80, h: 40 },
			seat: { side: 'right', center: 300 },
			plateWidth: 1000,
			stubUser: 20,
		});
		const nums = points.split(/[\s,]+/).map(Number);
		assert.ok(nums.length >= 4);
		const xs = nums.filter((_, index) => index % 2 === 0);
		assert.ok(Math.max(...xs) > 1000, 'elbow must leave the plate');
		const span = Math.hypot(xs[xs.length - 1]! - xs[0]!, nums[nums.length - 1]! - nums[1]!);
		assert.ok(span > 1, 'elbow must have travel');
	});

	it('converts stub px into plate user units', () => {
		assert.equal(bandStubUser(10, 200, 1000), 50);
		assert.equal(bandStubUser(0, 200, 1000), 0);
	});
});
