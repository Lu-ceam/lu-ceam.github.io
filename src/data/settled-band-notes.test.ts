import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
	LETTERBOX_BAND_RESERVE_REM,
	NOTE_CAP_REM,
	NOTE_GAP_REM,
} from './detail-display.ts';
import {
	BAND_NOTE_MIN_REM,
	bandLayoutFor,
	bandLeaderPoints,
	bandNoteGapPx,
	bandNoteWidthPx,
	bandReservePx,
	bandStackReservePx,
	bandStackWidthPx,
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
		// 侧带够宽的 pane：走的仍是左右列（窄屏那条改由上面的 stack 测覆盖）。
		const pane = { width: 900, height: 640 };
		const plate = { left: 310, top: 80, width: 280, height: 480 };
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

/** 390×640 的 settled：plate 两侧只剩 ~3.4rem 纸边，侧带列宽远不到 BAND_NOTE_MIN_REM。 */
const NARROW = {
	pane: { width: 390, height: 640 },
	plate: { left: 54.4, top: 80, width: 281.2, height: 480 },
	plateSize: { width: 1000, height: 1700 },
	rem: 16,
};

function overlaps(
	a: { left: number; top: number; width: number; height: number },
	b: { left: number; top: number; width: number; height: number },
): boolean {
	return (
		a.left < b.left + b.width &&
		a.left + a.width > b.left &&
		a.top < b.top + b.height &&
		a.top + a.height > b.top
	);
}

describe('settled-band-notes · 窄侧带改上下 letterbox', () => {
	it('drops to stack when the side strip is under BAND_NOTE_MIN_REM', () => {
		assert.ok(BAND_NOTE_MIN_REM > 0);
		assert.equal(bandLayoutFor(NARROW), 'stack');
		const width = bandStackWidthPx({ pane: NARROW.pane, rem: NARROW.rem });
		assert.ok(width >= BAND_NOTE_MIN_REM * NARROW.rem, `stack width ${width} 太窄`);
		const placed = placeBandNotes({
			...NARROW,
			seats: [
				{ side: 'left', center: 400 },
				{ side: 'right', center: 900 },
			],
			heights: [48, 56],
		});
		assert.equal(placed.length, 2);
		assert.equal(placed[0]?.side, 'top');
		assert.equal(placed[1]?.side, 'bottom');
		for (const note of placed) {
			assert.ok(note.width >= BAND_NOTE_MIN_REM * NARROW.rem, '注文列宽须容得下一行字');
		}
	});

	it('keeps stack notes apart, off the plate, and inside the pane', () => {
		const gap = bandNoteGapPx(NARROW.rem);
		const placed = placeBandNotes({
			...NARROW,
			seats: [
				{ side: 'left', center: 400 },
				{ side: 'right', center: 900 },
			],
			heights: [48, 56],
		});
		for (const note of placed) {
			assert.equal(overlaps(note, NARROW.plate), false, `注文压 plate：${JSON.stringify(note)}`);
			assert.ok(note.left >= gap - 1e-6, '左边距不够');
			assert.ok(note.left + note.width <= NARROW.pane.width - gap + 1e-6, '右边距不够（避滚动条）');
			assert.ok(note.top >= -1e-6, '越出 pane 顶');
			assert.ok(note.top + note.height <= NARROW.pane.height + 1e-6, '越出 pane 底');
		}
		assert.equal(overlaps(placed[0]!, placed[1]!), false, '两条注文互压');
		// top 注文的 stub 边朝下（贴 plate 上沿），bottom 的朝上。
		assert.ok(placed[0]!.stubY <= NARROW.plate.top + 1e-6);
		assert.ok(placed[1]!.stubY >= NARROW.plate.top + NARROW.plate.height - 1e-6);
	});

	it('reserves enough letterbox for the tallest stack band', () => {
		const gap = bandNoteGapPx(NARROW.rem);
		const reserve = bandStackReservePx({ heights: [48, 56], rem: NARROW.rem });
		assert.ok(reserve >= 56 + gap - 1e-6, `reserve ${reserve} 不够放下最高的一带`);
	});

	it('keeps the side layout when the strip is wide enough', () => {
		const wide = {
			pane: { width: 900, height: 640 },
			plate: { left: 310, top: 80, width: 280, height: 480 },
			plateSize: { width: 1000, height: 1700 },
			rem: 16,
		};
		assert.equal(bandLayoutFor(wide), 'side');
		const placed = placeBandNotes({
			...wide,
			seats: [
				{ side: 'left', center: 400 },
				{ side: 'right', center: 900 },
			],
			heights: [48, 56],
		});
		assert.equal(placed[0]?.side, 'left');
		assert.equal(placed[1]?.side, 'right');
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

	it('leaves the plate vertically for top/bottom notes', () => {
		const below = bandLeaderPoints({
			mark: { x: 400, y: 800, w: 100, h: 60 },
			seat: { side: 'bottom', center: 500 },
			plateWidth: 1000,
			plateHeight: 1700,
			stubUser: 20,
		});
		const belowNums = below.split(/[\s,]+/).map(Number);
		const ys = belowNums.filter((_, index) => index % 2 === 1);
		assert.ok(Math.max(...ys) > 1700, 'bottom 肘线须伸出 plate 下沿');
		const above = bandLeaderPoints({
			mark: { x: 400, y: 800, w: 100, h: 60 },
			seat: { side: 'top', center: 500 },
			plateWidth: 1000,
			plateHeight: 1700,
			stubUser: 20,
		});
		const aboveYs = above
			.split(/[\s,]+/)
			.map(Number)
			.filter((_, index) => index % 2 === 1);
		assert.ok(Math.min(...aboveYs) < 0, 'top 肘线须伸出 plate 上沿');
	});

	it('converts stub px into plate user units', () => {
		assert.equal(bandStubUser(10, 200, 1000), 50);
		assert.equal(bandStubUser(0, 200, 1000), 0);
	});
});
