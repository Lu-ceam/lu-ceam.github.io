import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
	COVER_JOINT_SVH,
	COVER_PASS_SVH,
	clamp01,
	coverCropGeometry,
	coverPassPaint,
	coverPlace,
	coverRunwayHeightPx,
	coverRunwayProgress,
	coverRunwayTravelPx,
	coverRunwayUnits,
} from './disc-cover-crop.ts';
import {
	cropWindow,
	layerTransform,
	openingBox,
	OUTER_MID_MIN,
	OUTER_SETTLED_FLOOR,
	plateBox,
	zoomImageBox,
} from './detail-display.ts';
import { DWELL_START, PASS_SVH, UPRIGHT_END, ZOOM_END } from './split-stage.ts';

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
		assert.equal(open.settled, false);
		// 落定：plate 与裁剪窗同一框，外层不再有 transform。
		assert.ok(settled.plate.width > 0 && settled.plate.height > 0);
		assert.ok(Math.abs(settled.window.left - settled.plate.left) < 1e-6);
		assert.ok(Math.abs(settled.window.width - settled.plate.width) < 1e-6);
		assert.ok(Math.abs(settled.window.height - settled.plate.height) < 1e-6);
		assert.ok(Math.abs(settled.windowLive.left - settled.plate.left) < 1e-6);
		assert.equal(settled.imageTransform, 'none');
		assert.equal(settled.windowTransform, 'none');
		assert.equal(settled.settled, true);
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
		// 中段是「窗」而不是整幅：窗比整幅小、且一路长到 settled plate 那么大。
		assert.ok(geo.windowLive.width < opening.width);
		assert.ok(geo.windowLive.width < geo.plate.width);
		assert.ok(
			geo.windowLive.width >
				coverCropGeometry({ pane, natural, plate, crop, cropT: 0 }).windowLive.width,
		);
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
		// 留白让 plate 不出窗：给注文的纸边真的收小了 plate。
		const withoutBands = coverCropGeometry({ pane, natural, plate, crop, cropT: 1 });
		assert.ok(narrow.plate.width <= withoutBands.plate.width + 1e-6);
	});

	it('never falls back to a whole-layer pose scale', () => {
		const source = readFileSync(join(here, './disc-cover-crop.ts'), 'utf8');
		assert.equal(source.includes('translate3d('), false);
		assert.equal(/style\.transform\s*=/.test(source), false);
	});
});

describe('唱片章相位＝桌面 runway 同一套边界', () => {
	it('shares the pass grammar with split-stage', () => {
		assert.equal(COVER_PASS_SVH, PASS_SVH);
		assert.equal(COVER_JOINT_SVH > 0, true);
		assert.equal(coverRunwayUnits(1), PASS_SVH);
		assert.equal(coverRunwayUnits(2), 2 * PASS_SVH + COVER_JOINT_SVH);
		assert.equal(coverRunwayUnits(0), 0);
	});

	it('holds the upright until UPRIGHT_END and finishes cropT at ZOOM_END', () => {
		const start = coverPassPaint({ local: 0, hasNotes: true });
		assert.equal(start.cropT, 0);
		assert.equal(start.outerOpacity, 1);
		assert.equal(start.plateOpacity, 0);
		assert.equal(start.calloutOpacity, 0);
		assert.equal(start.settled, false);

		const held = coverPassPaint({ local: UPRIGHT_END, hasNotes: true });
		assert.equal(held.cropT, 0);
		assert.equal(held.outerOpacity, 1);

		const zooming = coverPassPaint({ local: (UPRIGHT_END + ZOOM_END) / 2, hasNotes: true });
		assert.ok(zooming.cropT > 0 && zooming.cropT < 1, '中段必须在 cropT 0..1 之间');
		assert.equal(zooming.calloutOpacity, 0, '中段不许提前出肘线');

		const zoomed = coverPassPaint({ local: ZOOM_END, hasNotes: true });
		assert.equal(zoomed.cropT, 1);
		// settled 不卸 upright：留淡衬地板（1) 不是 0，否则 letterbox 成纯奶油空纸。
		assert.equal(zoomed.outerOpacity, OUTER_SETTLED_FLOOR);
		assert.ok(zoomed.outerOpacity > 0);
	});

	it('rises the plate, then the elbow callouts, and parks them at DWLL', () => {
		const plateMid = coverPassPaint({ local: (ZOOM_END + 0.46) / 2, hasNotes: true });
		assert.ok(plateMid.plateOpacity > 0 && plateMid.plateOpacity < 1);
		assert.equal(plateMid.calloutOpacity, 0);

		const settling = coverPassPaint({ local: (0.52 + DWELL_START) / 2, hasNotes: true });
		assert.equal(settling.plateOpacity, 1);
		assert.ok(settling.calloutOpacity > 0 && settling.calloutOpacity < 1);

		const parked = coverPassPaint({ local: DWELL_START, hasNotes: true });
		assert.equal(parked.plateOpacity, 1);
		assert.equal(parked.calloutOpacity, 1);
		assert.equal(parked.settled, true);
		assert.equal(parked.boxesOpacity, 1);
	});

	it('keeps a face without marks to the big picture — no fake boxes', () => {
		const bare = coverPassPaint({ local: 1, hasNotes: false });
		assert.equal(bare.calloutOpacity, 0);
		assert.equal(bare.boxesOpacity, 0);
		assert.equal(bare.leadersOpacity, 0);
		assert.equal(bare.notesOpacity, 0);
		assert.equal(bare.plateOpacity, 1);
		// 没有注文就不算 settled 的肘线态（只是大图落定）。
		assert.equal(bare.settled, false);
	});

	it('scans back up when the finger drags back (nothing latched)', () => {
		const forward = [0, 0.2, 0.45, 0.7, 1].map((local) => coverPassPaint({ local, hasNotes: true }));
		const backward = [1, 0.7, 0.45, 0.2, 0].map((local) =>
			coverPassPaint({ local, hasNotes: true }),
		);
		assert.deepEqual(backward, [...forward].reverse());
		assert.ok(forward[0].cropT < forward[1].cropT);
		assert.ok(forward[1].cropT < forward[2].cropT);
		assert.equal(forward[0].calloutOpacity, 0, '反刮回开场时肘线要收掉');
	});

	it('lands straight on the settled plate when motion is reduced — still per face', () => {
		const reduced = coverPassPaint({ local: 0, hasNotes: true, settle: true });
		assert.equal(reduced.cropT, 1);
		assert.equal(reduced.plateOpacity, 1);
		assert.equal(reduced.calloutOpacity, 1);
		assert.equal(reduced.settled, true);
		// 没有注文：落定也只给大图，不编框。
		const bare = coverPassPaint({ local: 0, hasNotes: false, settle: true });
		assert.equal(bare.plateOpacity, 1);
		assert.equal(bare.calloutOpacity, 0);
	});
});

describe('唱片章：竖滑连续驱动（可反刮）', () => {
	it('maps scroll position to progress only inside the runway travel', () => {
		assert.equal(coverRunwayProgress({ scrollTop: 0, runwayTop: 0, travelPx: 400 }), 0);
		assert.equal(coverRunwayProgress({ scrollTop: 100, runwayTop: 0, travelPx: 400 }), 0.25);
		assert.equal(coverRunwayProgress({ scrollTop: 400, runwayTop: 0, travelPx: 400 }), 1);
		assert.equal(coverRunwayProgress({ scrollTop: 900, runwayTop: 0, travelPx: 400 }), 1);
		// 反刮：同一函数没有方向状态，往回收就是往回走。
		assert.equal(coverRunwayProgress({ scrollTop: 300, runwayTop: 0, travelPx: 400 }), 0.75);
		// runway 顶在章内偏移之后：进跑道前停在开场。
		assert.equal(coverRunwayProgress({ scrollTop: 40, runwayTop: 120, travelPx: 400 }), 0);
		assert.equal(coverRunwayProgress({ scrollTop: 0, runwayTop: 0, travelPx: 0 }), 0);
	});

	it('grows the runway with every face and reserves a joint between them', () => {
		const stage = 480;
		const one = coverRunwayHeightPx(stage, 1);
		const two = coverRunwayHeightPx(stage, 2);
		assert.ok(one > stage);
		assert.ok(two > one);
		assert.ok(coverRunwayTravelPx(stage, 1) > stage * 0.5);
		assert.equal(coverRunwayTravelPx(stage, 0), 0);
		assert.equal(coverRunwayHeightPx(stage, 0), stage);
	});

	it('walks pass after pass on one continuous scroll — no pager', () => {
		const faces = 2;
		const atFirst = coverPlace(0, faces);
		assert.equal(atFirst.index, 0);
		assert.equal(atFirst.local, 0);
		// 第一面走完：仍在面 1 的 settled。
		const firstSettled = coverPlace((PASS_SVH - 1) / coverRunwayUnits(faces), faces);
		assert.equal(firstSettled.index, 0);
		assert.ok(firstSettled.local > DWELL_START);
		// 继续下滑过 joint：进第二面，从 upright 重新开始。
		const joint = coverPlace((PASS_SVH + COVER_JOINT_SVH / 2) / coverRunwayUnits(faces), faces);
		assert.equal(joint.index, 1);
		assert.ok(joint.joint > 0);
		assert.equal(joint.local, 0);
		const second = coverPlace((PASS_SVH + COVER_JOINT_SVH + PASS_SVH * 0.9) / coverRunwayUnits(faces), faces);
		assert.equal(second.index, 1);
		assert.ok(second.local > DWELL_START);
		// 进度连续单调：没有「点一下就到下一面」的跳变。
		let previous = -1;
		for (let step = 0; step <= 40; step += 1) {
			const place = coverPlace(step / 40, faces);
			assert.ok(place.index >= previous);
			previous = place.index;
		}
	});

	it('clamps out-of-range progress instead of extrapolating', () => {
		assert.equal(clamp01(-0.4), 0);
		assert.equal(clamp01(Number.NaN), 0);
		assert.equal(clamp01(1.4), 1);
		assert.equal(coverPlace(-1, 2).index, 0);
		assert.equal(coverPlace(2, 2).index, 1);
	});
});
