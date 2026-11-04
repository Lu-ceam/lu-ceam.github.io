import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
	COVER_CALLOUT_START,
	COVER_CROP_MS,
	COVER_SETTLED_T,
	clamp01,
	coverCalloutFade,
	coverCropGeometry,
	coverCropProgress,
	easeInOutCubic,
} from './disc-cover-crop.ts';
import { cropWindow, fillCropPaint, layerTransform, openingBox, plateBox, zoomImageBox } from './detail-display.ts';

const here = dirname(fileURLToPath(import.meta.url));

const pane = { width: 390, height: 420 };
const natural = { width: 1400, height: 1400 };
const plate = { width: 400, height: 248 };
const crop = { x: 219, y: 210, w: 379, h: 235 };

describe('唱片章 fill→crop 几何', () => {
	it('opens on the whole upright and settles on the plate crop', () => {
		const open = coverCropGeometry({ pane, natural, plate, crop, cropT: 0 });
		const settled = coverCropGeometry({ pane, natural, plate, crop, cropT: 1 });
		const opening = openingBox(pane, natural);
		// 开场：外层落成整幅 upright（与 openingBox 同框），窗口压在裁剪那一小片上。
		assert.ok(Math.abs(open.imageLive.width - opening.width) < 1e-6);
		assert.ok(Math.abs(open.imageLive.height - opening.height) < 1e-6);
		assert.ok(open.windowLive.width < open.imageLive.width);
		assert.equal(open.outerOpacity, 1);
		assert.equal(open.plateOpacity, 0);
		// 落定：plate 与裁剪窗同一框，外层的平方淡出到 0。
		assert.ok(settled.plate.width > 0 && settled.plate.height > 0);
		assert.ok(Math.abs(settled.window.left - settled.plate.left) < 1e-6);
		assert.ok(Math.abs(settled.window.width - settled.plate.width) < 1e-6);
		assert.ok(Math.abs(settled.window.height - settled.plate.height) < 1e-6);
		assert.ok(Math.abs(settled.windowLive.left - settled.plate.left) < 1e-6);
		assert.equal(settled.plateOpacity, 1);
		assert.equal(settled.outerOpacity, 0);
		assert.equal(settled.imageTransform, 'none');
		assert.equal(settled.windowTransform, 'none');
	});

	it('drives the image from the same helpers as the runway reveal', () => {
		const t = 0.4;
		const geo = coverCropGeometry({ pane, natural, plate, crop, cropT: t });
		const opening = openingBox(pane, natural);
		const plateFrame = plateBox(pane, opening, plate, natural, crop);
		const box = zoomImageBox({ opening, plate: plateFrame, natural, crop, cropT: 1 });
		const live = zoomImageBox({ opening, plate: plateFrame, natural, crop, cropT: t });
		const win = cropWindow({ image: box, naturalWidth: natural.width, crop });
		const liveWin = cropWindow({ image: live, naturalWidth: natural.width, crop });
		assert.equal(geo.imageTransform, layerTransform(box, live));
		assert.equal(geo.windowTransform, layerTransform(win, liveWin));
		assert.equal(
			geo.outerOpacity,
			fillCropPaint({ cropT: t, local: t, plateEnd: COVER_SETTLED_T }).outerOpacity,
		);
		assert.equal(geo.windowOpacity, 1);
		// 中段是「窗」而不是整幅：窗比整幅小、且一路长到 settled plate 那么大。
		assert.ok(geo.windowLive.width < opening.width);
		assert.ok(geo.windowLive.width < geo.plate.width);
		assert.ok(geo.windowLive.width > coverCropGeometry({ pane, natural, plate, crop, cropT: 0 }).windowLive.width);
	});

	it('keeps the opening window edge visible and leaves note bands on narrow', () => {
		const narrow = coverCropGeometry({
			pane,
			natural,
			plate,
			crop,
			cropT: 0.1,
			bandReservePx: 54,
		});
		// 开场（cropT≈0）窗口仍在屏幕里、有宽高：窗缘看得见（P1）。
		assert.ok(narrow.windowLive.width > 8 && narrow.windowLive.height > 8);
		assert.ok(narrow.windowLive.left >= 0 && narrow.windowLive.top >= 0);
		assert.ok(narrow.calloutOpacity === 0);
		// 留白让 plate 不出窗：给注文的纸边真的收小了 plate。
		const withoutBands = coverCropGeometry({ pane, natural, plate, crop, cropT: 1 });
		assert.ok(narrow.plate.width <= withoutBands.plate.width + 1e-6);
	});

	it('fades the boxes and elbows in only after the plate lands', () => {
		assert.equal(coverCalloutFade(0), 0);
		assert.equal(coverCalloutFade(COVER_CALLOUT_START), 0);
		assert.equal(coverCalloutFade(1), 1);
		assert.ok(coverCalloutFade(0.95) > 0 && coverCalloutFade(0.95) < 1);
		assert.ok(COVER_CALLOUT_START < COVER_SETTLED_T);
	});

	it('eases from 0 to 1 with a zero slope at both ends', () => {
		assert.equal(clamp01(-1), 0);
		assert.equal(clamp01(Number.NaN), 0);
		assert.equal(clamp01(2), 1);
		assert.equal(easeInOutCubic(0), 0);
		assert.equal(easeInOutCubic(1), 1);
		assert.ok(easeInOutCubic(0.5) === 0.5);
		assert.equal(coverCropProgress(0), 0);
		assert.equal(coverCropProgress(COVER_CROP_MS), 1);
		assert.equal(coverCropProgress(COVER_CROP_MS * 2), 1);
		assert.ok(coverCropProgress(COVER_CROP_MS / 2) > 0.4);
	});

	it('never falls back to a whole-layer pose scale', () => {
		const source = readFileSync(join(here, './disc-cover-crop.ts'), 'utf8');
		assert.equal(source.includes('translate3d('), false);
		assert.equal(/style\.transform\\s*=/.test(source), false);
	});
});
