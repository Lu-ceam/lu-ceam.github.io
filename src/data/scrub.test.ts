import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import {
	SCRUB_KEYS,
	activeRunway,
	chapterProgress,
	containBox,
	croppedBox,
	nearestKeyframe,
	scrubVisual,
	scrollYForProgress,
	snapTarget,
	uprightBox,
} from './scrub.ts';

describe('scrubVisual', () => {
	it('starts on the full upright', () => {
		assert.deepEqual(scrubVisual(0), {
			cropT: 0,
			plateOpacity: 0,
			uprightOpacity: 1,
			boxesOpacity: 0,
		});
	});

	it('crops through the first segment and holds the upright until 0.55', () => {
		const mid = scrubVisual(0.275);
		assert.equal(mid.cropT, 0.5);
		assert.equal(mid.plateOpacity, 0);
		assert.equal(mid.uprightOpacity, 1);
		assert.equal(mid.boxesOpacity, 0);
		const end = scrubVisual(0.55);
		assert.equal(end.cropT, 1);
		assert.equal(end.plateOpacity, 0);
		assert.equal(end.uprightOpacity, 1);
		assert.equal(end.boxesOpacity, 0);
	});

	it('cuts to the plate and fades boxes from just after 0.55 to 0.75', () => {
		const mid = scrubVisual(0.65);
		assert.equal(mid.cropT, 1);
		assert.equal(mid.plateOpacity, 1);
		assert.equal(mid.uprightOpacity, 0);
		assert.ok(Math.abs(mid.boxesOpacity - 0.5) < 1e-12);
		const done = scrubVisual(0.75);
		assert.equal(done.boxesOpacity, 1);
		assert.equal(done.plateOpacity, 1);
		assert.equal(done.uprightOpacity, 0);
	});

	it('holds the settled plate and boxes through the dwell', () => {
		assert.deepEqual(scrubVisual(0.9), {
			cropT: 1,
			plateOpacity: 1,
			uprightOpacity: 0,
			boxesOpacity: 1,
		});
		assert.deepEqual(scrubVisual(1), {
			cropT: 1,
			plateOpacity: 1,
			uprightOpacity: 0,
			boxesOpacity: 1,
		});
	});
});

describe('nearestKeyframe', () => {
	it('uses the fixed crop and boxes keys', () => {
		assert.deepEqual([...SCRUB_KEYS], [0, 0.55, 0.75, 1]);
	});

	it('picks the nearest key and keeps the earlier key on a tie', () => {
		assert.equal(nearestKeyframe(0.1), 0);
		assert.equal(nearestKeyframe(0.4), 0.55);
		assert.equal(nearestKeyframe(0.275), 0);
		assert.equal(nearestKeyframe(0.65), 0.55);
		assert.equal(nearestKeyframe(0.66), 0.75);
		assert.equal(nearestKeyframe(0.87), 0.75);
		assert.equal(nearestKeyframe(0.875), 0.75);
		assert.equal(nearestKeyframe(0.9), 1);
	});
});

describe('chapterProgress', () => {
	const previousWindow = globalThis.window;
	after(() => {
		globalThis.window = previousWindow;
	});

	it('maps scrolled distance over runway minus viewport into 0..1', () => {
		globalThis.window = { innerHeight: 800 } as Window & typeof globalThis;
		const runway = {
			offsetHeight: 2200,
			getBoundingClientRect: () => ({ top: -700 }),
		} as HTMLElement;
		assert.equal(chapterProgress(runway), 700 / 1400);
		const before = {
			offsetHeight: 2200,
			getBoundingClientRect: () => ({ top: 40 }),
		} as HTMLElement;
		assert.equal(chapterProgress(before), 0);
		const after = {
			offsetHeight: 2200,
			getBoundingClientRect: () => ({ top: -2000 }),
		} as HTMLElement;
		assert.equal(chapterProgress(after), 1);
	});

	it('is settled when the runway is not taller than the viewport', () => {
		globalThis.window = { innerHeight: 800 } as Window & typeof globalThis;
		const runway = {
			offsetHeight: 700,
			getBoundingClientRect: () => ({ top: 0 }),
		} as HTMLElement;
		assert.equal(chapterProgress(runway), 1);
	});

	it('returns the document Y that lands a chapter on p', () => {
		globalThis.window = { innerHeight: 800, scrollY: 1000 } as Window & typeof globalThis;
		const runway = {
			offsetHeight: 2200,
			getBoundingClientRect: () => ({ top: -200 }),
		} as HTMLElement;
		assert.equal(scrollYForProgress(runway, 0), 800);
		assert.equal(scrollYForProgress(runway, 1), 800 + 1400);
		assert.equal(scrollYForProgress(runway, 0.55), 800 + 0.55 * 1400);
	});
});

describe('soft snap', () => {
	it('snaps only when the nearest key is more than a hair away', () => {
		assert.equal(snapTarget(0), null);
		assert.equal(snapTarget(0.55), null);
		assert.equal(snapTarget(0.54), null);
		assert.equal(snapTarget(0.021), 0);
		assert.equal(snapTarget(0.2), 0);
		assert.equal(snapTarget(0.3), 0.55);
		assert.equal(snapTarget(0.7), 0.75);
		assert.equal(snapTarget(0.9), 1);
	});

	it('chooses the runway that covers the most of the viewport', () => {
		const box = (top: number, bottom: number) =>
			({ getBoundingClientRect: () => ({ top, bottom }) }) as HTMLElement;
		const leaving = box(-400, 200);
		const current = box(200, 1000);
		assert.equal(activeRunway([leaving, current], 800), current);
		const entering = box(100, 900);
		const below = box(800, 1600);
		assert.equal(activeRunway([entering, below], 800), entering);
		assert.equal(activeRunway([box(-2000, -100)], 800), null);
	});
});

describe('upright geometry', () => {
	it('interpolates from the contain box to the cropped box', () => {
		const viewW = 400;
		const viewH = 400;
		const naturalW = 1050;
		const naturalH = 1400;
		const crop = { x: 274, y: 403, w: 514, h: 514 };
		const contain = containBox(viewW, viewH, naturalW, naturalH);
		assert.equal(contain.width, naturalW * (viewH / naturalH));
		assert.equal(contain.height, viewH);
		assert.equal(contain.left, (viewW - contain.width) / 2);
		assert.equal(contain.top, 0);
		const cropped = croppedBox(viewW, naturalW, naturalH, crop);
		assert.equal(cropped.left, -crop.x * (viewW / crop.w));
		assert.equal(cropped.width, naturalW * (viewW / crop.w));
		assert.deepEqual(uprightBox(viewW, viewH, naturalW, naturalH, crop, 0), contain);
		assert.deepEqual(uprightBox(viewW, viewH, naturalW, naturalH, crop, 1), cropped);
		const mid = uprightBox(viewW, viewH, naturalW, naturalH, crop, 0.5);
		assert.ok(Math.abs(mid.left - (contain.left + cropped.left) / 2) < 1e-9);
		assert.ok(Math.abs(mid.top - (contain.top + cropped.top) / 2) < 1e-9);
		assert.ok(Math.abs(mid.width - (contain.width + cropped.width) / 2) < 1e-9);
		assert.ok(Math.abs(mid.height - (contain.height + cropped.height) / 2) < 1e-9);
	});
});
