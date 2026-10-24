import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
	BOXES_END,
	DETAIL_CROSSFADE_MS,
	JOINT_SVH,
	LEADERS_END,
	PASS_SVH,
	PLATE_END,
	SETTLE_EPSILON_PX,
	SETTLE_IDLE_MS,
	SETTLE_LOCK_MS,
	SETTLE_SLACK_PX,
	STAGE_ROWS,
	UPRIGHT_END,
	ZOOM_END,
	activationLineY,
	activeDetailIndex,
	cameraBox,
	cameraKeypoints,
	containBox,
	croppedBox,
	nearestKeypoint,
	nearestRowIndex,
	nearestSettlePlace,
	placeOnRunway,
	progressFromAnchors,
	readTrackOffset,
	runwayScrollY,
	runwayTravelSvh,
	scrollTopForAnchor,
	shouldSettle,
	shouldSettleRunway,
	stageVisual,
} from './split-stage.ts';

function near(actual: number, expected: number): void {
	assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} ~= ${expected}`);
}

/** Camera fixtures in the spec are absolute error under 1e-6. */
function close(actual: number, expected: number): void {
	assert.ok(Math.abs(actual - expected) < 1e-6, `${actual} ~= ${expected}`);
}

type Crop = { x: number; y: number; w: number; h: number };

function closeBox(
	actual: { left: number; top: number; width: number; height: number },
	expected: { left: number; top: number; width: number; height: number },
): void {
	close(actual.left, expected.left);
	close(actual.top, expected.top);
	close(actual.width, expected.width);
	close(actual.height, expected.height);
}

function screenCropCenter(
	box: { left: number; top: number; width: number; height: number },
	naturalW: number,
	naturalH: number,
	crop: Crop,
): { x: number; y: number } {
	const scaleX = box.width / naturalW;
	const scaleY = box.height / naturalH;
	return {
		x: box.left + (crop.x + crop.w / 2) * scaleX,
		y: box.top + (crop.y + crop.h / 2) * scaleY,
	};
}

describe('stage rows', () => {
	it('uses the four public labels and no runway keyframes', () => {
		assert.deepEqual(
			STAGE_ROWS.map((row) => [row.id, row.label, row.status]),
			[
				['upright', '原片扶正', '全幅'],
				['crop', '裁进板心', '板心'],
				['boxes', '标出要点', '框选'],
				['notes', '读注', '旁注'],
			],
		);
		assert.equal(DETAIL_CROSSFADE_MS, 1600);
		assert.equal(SETTLE_IDLE_MS, 180);
		assert.equal(SETTLE_EPSILON_PX, 6);
		assert.equal(SETTLE_SLACK_PX, 24);
		assert.equal(SETTLE_LOCK_MS, 800);
		assert.notDeepEqual([0, 1 / 3, 2 / 3, 1], [0, 0.55, 0.75, 1]);
	});
});

describe('crop boxes', () => {
	it('matches runTimeline contain and crop for a simple view', () => {
		const contain = containBox(200, 100, 100, 100);
		assert.deepEqual(contain, { left: 50, top: 0, width: 100, height: 100 });
		const cropped = croppedBox(200, 100, 100, { x: 10, y: 20, w: 50, h: 40 });
		assert.deepEqual(cropped, { left: -40, top: -80, width: 400, height: 400 });
	});

	it('matches the mhjl329 label crop without fitting the crop to viewH', () => {
		const contain = containBox(400, 400, 1050, 1400);
		assert.deepEqual(contain, { left: 50, top: 0, width: 300, height: 400 });
		const cropped = croppedBox(400, 1050, 1400, { x: 274, y: 403, w: 514, h: 514 });
		near(cropped.left, -213.2295719844358);
		near(cropped.top, -313.61867704280155);
		near(cropped.width, 817.1206225680934);
		near(cropped.height, 1089.4941634241245);
		assert.ok(cropped.height > 400);
	});
});

describe('cameraBox', () => {
	const labelCrop: Crop = { x: 274, y: 403, w: 514, h: 514 };
	const letterCrop: Crop = { x: 10, y: 20, w: 50, h: 40 };
	const coverCrop: Crop = { x: 219, y: 210, w: 379, h: 235 };

	it('zooms the mhjl329 label on a geometric scale into a flush square', () => {
		const start = cameraBox(400, 400, 1050, 1400, labelCrop, 0);
		closeBox(start, { left: 50, top: 0, width: 300, height: 400 });
		assert.deepEqual(start, containBox(400, 400, 1050, 1400));
		const startCenter = screenCropCenter(start, 1050, 1400, labelCrop);
		close(startCenter.x, 201.714285714286);
		close(startCenter.y, 188.571428571429);

		const mid = cameraBox(400, 400, 1050, 1400, labelCrop, 0.5);
		closeBox(mid, {
			left: -49.528218834867,
			top: -116.927729625259,
			width: 495.112297131093,
			height: 660.149729508124,
		});
		const midCenter = screenCropCenter(mid, 1050, 1400, labelCrop);
		close(midCenter.x, 200.857142857143);
		close(midCenter.y, 194.285714285714);
		close(mid.width / 1050, 0.471536);

		const forbidden = { left: -81.614786, top: -156.809339, width: 558.560311, height: 744.747082 };
		assert.ok(
			Math.abs(mid.left - forbidden.left) > 1 ||
				Math.abs(mid.top - forbidden.top) > 1 ||
				Math.abs(mid.width - forbidden.width) > 1 ||
				Math.abs(mid.height - forbidden.height) > 1,
			'geometric midpoint must not match the lerpBox midpoint',
		);

		const end = cameraBox(400, 400, 1050, 1400, labelCrop, 1);
		closeBox(end, {
			left: -213.229571984436,
			top: -313.618677042802,
			width: 817.120622568093,
			height: 1089.494163424125,
		});
		const cropped = croppedBox(400, 1050, 1400, labelCrop);
		closeBox(end, cropped);
		const endCenter = screenCropCenter(end, 1050, 1400, labelCrop);
		close(endCenter.x, 200);
		close(endCenter.y, 200);
		const endScale = end.width / 1050;
		close(end.left + labelCrop.x * endScale, 0);
		close(end.top + labelCrop.y * endScale, 0);
		close(labelCrop.w * endScale, 400);
		close(labelCrop.h * endScale, 400);

		const scales = [0, 0.25, 0.5, 0.75, 1].map(
			(t) => cameraBox(400, 400, 1050, 1400, labelCrop, t).width / 1050,
		);
		close(scales[0] ?? 0, 0.285714);
		close(scales[1] ?? 0, 0.367048);
		close(scales[2] ?? 0, 0.471536);
		close(scales[3] ?? 0, 0.605767);
		close(scales[4] ?? 0, 0.778210);
		for (let i = 1; i < scales.length; i++) {
			const prev = scales[i - 1];
			const next = scales[i];
			assert.ok(prev !== undefined && next !== undefined && next > prev);
		}
		for (const t of [0, 0.25, 0.5, 0.75, 1]) {
			const box = cameraBox(400, 400, 1050, 1400, labelCrop, t);
			close(box.width / box.height, 1050 / 1400);
		}
	});

	it('letterboxes a crop whose aspect is not the frame, and rejects the width-fit end pose', () => {
		const start = cameraBox(200, 100, 100, 100, letterCrop, 0);
		closeBox(start, { left: 50, top: 0, width: 100, height: 100 });
		const startCrop = {
			left: start.left + letterCrop.x * (start.width / 100),
			top: start.top + letterCrop.y * (start.height / 100),
			width: letterCrop.w * (start.width / 100),
			height: letterCrop.h * (start.height / 100),
		};
		closeBox(startCrop, { left: 60, top: 20, width: 50, height: 40 });

		const mid = cameraBox(200, 100, 100, 100, letterCrop, 0.5);
		closeBox(mid, { left: 37.160141, top: -18.245553, width: 158.113883, height: 158.113883 });
		close(mid.width / 100, 1.581139);
		const midCenter = screenCropCenter(mid, 100, 100, letterCrop);
		close(midCenter.x, 92.5);
		close(midCenter.y, 45);

		const end = cameraBox(200, 100, 100, 100, letterCrop, 1);
		closeBox(end, { left: 12.5, top: -50, width: 250, height: 250 });
		const endScale = end.width / 100;
		closeBox(
			{
				left: end.left + letterCrop.x * endScale,
				top: end.top + letterCrop.y * endScale,
				width: letterCrop.w * endScale,
				height: letterCrop.h * endScale,
			},
			{ left: 37.5, top: 0, width: 125, height: 100 },
		);
		const widthFit = croppedBox(200, 100, 100, letterCrop);
		assert.deepEqual(widthFit, { left: -40, top: -80, width: 400, height: 400 });
		assert.notDeepEqual(end, widthFit);
		close(end.width / end.height, 1);
	});

	it('zooms the mhjl329 cover into the waistband crop without a rotation term', () => {
		const start = cameraBox(400, 248, 1400, 1400, coverCrop, 0);
		closeBox(start, { left: 76, top: 0, width: 248, height: 248 });
		const startCenter = screenCropCenter(start, 1400, 1400, coverCrop);
		close(startCenter.x, 148.362857);
		close(startCenter.y, 58.014286);

		const mid = cameraBox(400, 248, 1400, 1400, coverCrop, 0.5);
		closeBox(mid, { left: -2.440976, top: -50.593438, width: 605.315462, height: 605.315462 });
		close(mid.width / 1400, 0.432368);
		const midCenter = screenCropCenter(mid, 1400, 1400, coverCrop);
		close(midCenter.x, 174.181429);
		close(midCenter.y, 91.007143);
		close(mid.width / mid.height, 1);

		const end = cameraBox(400, 248, 1400, 1400, coverCrop, 1);
		const endCenter = screenCropCenter(end, 1400, 1400, coverCrop);
		close(endCenter.x, 200);
		close(endCenter.y, 124);
		const endScale = end.width / 1400;
		const cropLeft = end.left + coverCrop.x * endScale;
		const cropTop = end.top + coverCrop.y * endScale;
		const cropWidth = coverCrop.w * endScale;
		const cropHeight = coverCrop.h * endScale;
		close(cropTop, 0);
		close(cropHeight, 248);
		close(cropLeft, 0.017021);
		close(400 - (cropLeft + cropWidth), 0.017021);
		assert.ok(Math.abs(end.width - end.height) < 1e-6);
	});

	it('keeps the crop center on the straight path and clamps t', () => {
		const start = cameraBox(400, 400, 1050, 1400, labelCrop, 0);
		const mid = cameraBox(400, 400, 1050, 1400, labelCrop, 0.5);
		const end = cameraBox(400, 400, 1050, 1400, labelCrop, 1);
		const startCenter = screenCropCenter(start, 1050, 1400, labelCrop);
		const midCenter = screenCropCenter(mid, 1050, 1400, labelCrop);
		const endCenter = screenCropCenter(end, 1050, 1400, labelCrop);
		const ux = (midCenter.x - startCenter.x) / (endCenter.x - startCenter.x);
		const uy = (midCenter.y - startCenter.y) / (endCenter.y - startCenter.y);
		close(ux, 0.5);
		close(uy, 0.5);
		const startDist = Math.hypot(startCenter.x - 200, startCenter.y - 200);
		const midDist = Math.hypot(midCenter.x - 200, midCenter.y - 200);
		assert.ok(midDist < startDist);

		assert.deepEqual(cameraBox(200, 100, 100, 100, letterCrop, -1), cameraBox(200, 100, 100, 100, letterCrop, 0));
		assert.deepEqual(cameraBox(200, 100, 100, 100, letterCrop, 2), cameraBox(200, 100, 100, 100, letterCrop, 1));
	});

	it('still translates when the crop scale already equals the contain scale', () => {
		const crop: Crop = { x: 10, y: 0, w: 40, h: 200 };
		const start = cameraBox(100, 100, 100, 200, crop, 0);
		const mid = cameraBox(100, 100, 100, 200, crop, 0.5);
		const end = cameraBox(100, 100, 100, 200, crop, 1);
		closeBox(start, { left: 25, top: 0, width: 50, height: 100 });
		closeBox(mid, { left: 30, top: 0, width: 50, height: 100 });
		closeBox(end, { left: 35, top: 0, width: 50, height: 100 });
		close(screenCropCenter(start, 100, 200, crop).x, 40);
		close(screenCropCenter(mid, 100, 200, crop).x, 45);
		close(screenCropCenter(end, 100, 200, crop).x, 50);
	});
});

type Point = { x: number; y: number };

type CropCorners = { tl: Point; tr: Point; bl: Point; br: Point };

/** Crop rectangle mapped through the upright box. Non-uniform sx/sy means the bitmap is stretched. */
function cropCorners(
	box: { left: number; top: number; width: number; height: number },
	naturalW: number,
	naturalH: number,
	crop: Crop,
): CropCorners {
	const sx = box.width / naturalW;
	const sy = box.height / naturalH;
	const at = (x: number, y: number): Point => ({ x: box.left + x * sx, y: box.top + y * sy });
	return {
		tl: at(crop.x, crop.y),
		tr: at(crop.x + crop.w, crop.y),
		bl: at(crop.x, crop.y + crop.h),
		br: at(crop.x + crop.w, crop.y + crop.h),
	};
}

/**
 * Used box when `img { max-width: 100% }` clamps the upright and the definite
 * height from applyFrame is kept. Width falls to the clip; height does not.
 * The left edge stays, so the lost width is a gap on the right of the clip.
 */
function boxClampedByImgMaxWidth(
	box: { left: number; top: number; width: number; height: number },
	clipW: number,
): { left: number; top: number; width: number; height: number } {
	return {
		left: box.left,
		top: box.top,
		width: Math.min(box.width, clipW),
		height: box.height,
	};
}

function uprightRuleBody(source: string): string {
	const stripped = source.replace(/\/\*[\s\S]*?\*\//g, '');
	const match = stripped.match(/(?:^|[^\w-])\.upright\s*\{([^}]*)\}/);
	return match?.[1] ?? '';
}

/**
 * The clamp is off when `.upright` sets max-width/max-height to none
 * (that beats `img`), or when applyFrame sets the same inline.
 */
function uprightClampCleared(): boolean {
	const here = dirname(fileURLToPath(import.meta.url));
	const css = readFileSync(join(here, '../styles/global.css'), 'utf8');
	const body = uprightRuleBody(css);
	const cssClears = /max-width:\s*none\s*;/.test(body) && /max-height:\s*none\s*;/.test(body);
	const astro = readFileSync(join(here, '../pages/records/[id].astro'), 'utf8');
	const inlineClears =
		/upright\.style\.maxWidth\s*=\s*['"]none['"]/.test(astro) &&
		/upright\.style\.maxHeight\s*=\s*['"]none['"]/.test(astro);
	return cssClears || inlineClears;
}

describe('mhjl329 crop geometry', () => {
	const labelCrop: Crop = { x: 274, y: 403, w: 514, h: 514 };
	const coverCrop: Crop = { x: 219, y: 210, w: 379, h: 235 };
	const samples = [0, 0.25, 0.5, 0.75, 1];
	const fixtures = [
		{
			name: 'label',
			viewW: 400,
			viewH: 400,
			naturalW: 1050,
			naturalH: 1400,
			crop: labelCrop,
		},
		{
			name: 'cover',
			viewW: 400,
			viewH: 248,
			naturalW: 1400,
			naturalH: 1400,
			crop: coverCrop,
		},
	];

	it('keeps natural aspect, a straight crop center, and axis-aligned crop corners', () => {
		for (const fixture of fixtures) {
			const { viewW, viewH, naturalW, naturalH, crop } = fixture;
			const start = cameraBox(viewW, viewH, naturalW, naturalH, crop, 0);
			const startCenter = screenCropCenter(start, naturalW, naturalH, crop);
			for (const t of samples) {
				const box = cameraBox(viewW, viewH, naturalW, naturalH, crop, t);
				close(box.width / box.height, naturalW / naturalH);
				close(box.width / naturalW, box.height / naturalH);
				const corners = cropCorners(box, naturalW, naturalH, crop);
				close(corners.tr.y, corners.tl.y);
				close(corners.bl.x, corners.tl.x);
				close(corners.br.x, corners.tr.x);
				close(corners.br.y, corners.bl.y);
				const rectW = corners.tr.x - corners.tl.x;
				const rectH = corners.bl.y - corners.tl.y;
				close(rectW / rectH, crop.w / crop.h);
				close(rectW, crop.w * (box.width / naturalW));
				close(rectH, crop.h * (box.height / naturalH));
				const center = {
					x: (corners.tl.x + corners.br.x) / 2,
					y: (corners.tl.y + corners.br.y) / 2,
				};
				close(center.x, startCenter.x + t * (viewW / 2 - startCenter.x));
				close(center.y, startCenter.y + t * (viewH / 2 - startCenter.y));
				if (t === 1) {
					close(center.x, viewW / 2);
					close(center.y, viewH / 2);
				}
			}
		}
	});

	it('models img max-width 100% as a horizontal squash once the camera box exceeds the clip', () => {
		// Live page, plate 648px, computed max-width 100%, object-fit fill:
		// label near t=0.5 used 648×1068 (aspect 0.607, natural 0.75), left −80;
		// cover near t=0.5 used 648×980 (aspect 0.662, natural 1), left −4.
		// Height stayed on the inline camera height. right/bottom were auto.
		for (const fixture of fixtures) {
			const { name, viewW, viewH, naturalW, naturalH, crop } = fixture;
			for (const t of samples) {
				const box = cameraBox(viewW, viewH, naturalW, naturalH, crop, t);
				const used = boxClampedByImgMaxWidth(box, viewW);
				const natural = naturalW / naturalH;
				if (box.width <= viewW) {
					close(used.width / used.height, natural);
					assert.ok(t < 0.5, `${name} t=${t} should still be inside the clip`);
					continue;
				}
				assert.ok(t >= 0.5, `${name} t=${t} should be the squash range`);
				close(used.width, viewW);
				close(used.height, box.height);
				close(used.left, box.left);
				const usedAspect = used.width / used.height;
				assert.ok(
					usedAspect < natural - 1e-3,
					`${name} t=${t} usedAspect ${usedAspect} should fall below ${natural}`,
				);
				const corners = cropCorners(used, naturalW, naturalH, crop);
				const rectW = corners.tr.x - corners.tl.x;
				const rectH = corners.bl.y - corners.tl.y;
				assert.ok(rectW / rectH < crop.w / crop.h - 1e-3);
				assert.ok(box.left < 0, `${name} t=${t} left ${box.left} should hang off the clip`);
				const rightGap = viewW - (used.left + used.width);
				close(rightGap, -box.left);
			}
		}

		const specLabel = cameraBox(400, 400, 1050, 1400, labelCrop, 0.5);
		const liveLabel = cameraBox(648, 648, 1050, 1400, labelCrop, 0.5);
		const liveUsed = boxClampedByImgMaxWidth(liveLabel, 648);
		close(liveUsed.width, 648);
		close(liveUsed.height, liveLabel.height);
		close(liveUsed.width / liveUsed.height, 400 / specLabel.height);
		const specCover = cameraBox(400, 248, 1400, 1400, coverCrop, 0.5);
		const coverScale = 648 / 400;
		const liveCover = cameraBox(400 * coverScale, 248 * coverScale, 1400, 1400, coverCrop, 0.5);
		const liveCoverUsed = boxClampedByImgMaxWidth(liveCover, 400 * coverScale);
		close(liveCoverUsed.width, 400 * coverScale);
		close(liveCoverUsed.width / liveCoverUsed.height, 400 / specCover.height);
	});

	it('clears max-width and max-height on .upright so the used box keeps the camera aspect', () => {
		assert.equal(
			uprightClampCleared(),
			true,
			'.upright must set max-width/max-height to none (or applyFrame must), or img max-width:100% squashes the zoom',
		);
		const astro = readFileSync(
			join(dirname(fileURLToPath(import.meta.url)), '../pages/records/[id].astro'),
			'utf8',
		);
		assert.match(astro, /upright\.style\.right\s*=\s*['"]auto['"]/);
		assert.match(astro, /upright\.style\.bottom\s*=\s*['"]auto['"]/);
		for (const fixture of fixtures) {
			const { viewW, viewH, naturalW, naturalH, crop } = fixture;
			for (const t of samples) {
				const box = cameraBox(viewW, viewH, naturalW, naturalH, crop, t);
				const used = uprightClampCleared() ? box : boxClampedByImgMaxWidth(box, viewW);
				close(used.width / used.height, naturalW / naturalH);
				const corners = cropCorners(used, naturalW, naturalH, crop);
				close((corners.tr.x - corners.tl.x) / (corners.bl.y - corners.tl.y), crop.w / crop.h);
			}
		}
	});
});

describe('stageVisual', () => {
	it('locks the camera phases and drops the itinerary row clock', () => {
		assert.equal(PASS_SVH, 140);
		assert.equal(JOINT_SVH, 28);
		assert.equal(UPRIGHT_END, 0.08);
		assert.equal(ZOOM_END, 0.4);
		assert.equal(PLATE_END, 0.52);
		assert.equal(BOXES_END, 0.76);
		assert.equal(LEADERS_END, 0.88);
		assert.equal(
			UPRIGHT_END +
				(ZOOM_END - UPRIGHT_END) +
				(PLATE_END - ZOOM_END) +
				(BOXES_END - PLATE_END) +
				(LEADERS_END - BOXES_END) +
				(1 - LEADERS_END),
			1,
		);
		const source = readFileSync(new URL('./split-stage.ts', import.meta.url), 'utf8');
		assert.equal(source.includes('CROP_BLEND_AT'), false);
		assert.equal(source.includes('function lerpBox'), false);
	});

	it('holds the upright, then zooms with the plate still hidden', () => {
		const held = stageVisual(0, false);
		assert.equal(held.cropT, 0);
		assert.equal(held.uprightOpacity, 1);
		assert.equal(held.plateOpacity, 0);
		assert.equal(held.boxesOpacity, 0);
		assert.equal(held.leadersOpacity, 0);
		assert.equal(held.notesOpacity, 0);
		assert.deepEqual(stageVisual(UPRIGHT_END, true), held);
		assert.deepEqual(stageVisual(-0.2, false), held);

		const quarter = stageVisual(0.16, false);
		near(quarter.cropT, 0.25);
		assert.equal(quarter.plateOpacity, 0);
		assert.equal(quarter.uprightOpacity, 1);

		const midZoom = stageVisual(0.24, false);
		near(midZoom.cropT, 0.5);
		assert.equal(midZoom.plateOpacity, 0);

		const threeQuarter = stageVisual(0.32, false);
		near(threeQuarter.cropT, 0.75);
		assert.equal(threeQuarter.plateOpacity, 0);

		const zoomDone = stageVisual(ZOOM_END, false);
		assert.equal(zoomDone.cropT, 1);
		assert.equal(zoomDone.uprightOpacity, 1);
		assert.equal(zoomDone.plateOpacity, 0);
		assert.equal(zoomDone.boxesOpacity, 0);
	});

	it('does not treat the old one-third row stop as the plate', () => {
		const legacyRow = stageVisual(1 / 3, false);
		assert.equal(legacyRow.plateOpacity, 0);
		assert.ok(legacyRow.cropT < 1);
		assert.equal(legacyRow.boxesOpacity, 0);
		assert.equal(legacyRow.notesOpacity, 0);
	});

	it('fades the plate, then the boxes, then draws leaders before the note text', () => {
		const plateMid = stageVisual(0.46, true);
		assert.equal(plateMid.cropT, 1);
		near(plateMid.uprightOpacity, 0.5);
		near(plateMid.plateOpacity, 0.5);
		assert.equal(plateMid.boxesOpacity, 0);
		assert.equal(plateMid.leadersOpacity, 0);
		assert.equal(plateMid.notesOpacity, 0);

		const plate = stageVisual(PLATE_END, true);
		assert.equal(plate.uprightOpacity, 0);
		assert.equal(plate.plateOpacity, 1);
		assert.equal(plate.boxesOpacity, 0);

		const boxesMid = stageVisual(0.64, true);
		near(boxesMid.boxesOpacity, 0.5);
		assert.equal(boxesMid.leadersOpacity, 0);
		assert.equal(boxesMid.notesOpacity, 0);

		const boxes = stageVisual(BOXES_END, true);
		assert.equal(boxes.boxesOpacity, 1);
		assert.equal(boxes.leadersOpacity, 0);
		assert.equal(boxes.notesOpacity, 0);

		const leadersMid = stageVisual(0.82, true);
		assert.equal(leadersMid.boxesOpacity, 1);
		near(leadersMid.leadersOpacity, 0.5);
		assert.equal(leadersMid.notesOpacity, 0);

		const leaders = stageVisual(LEADERS_END, true);
		assert.equal(leaders.leadersOpacity, 1);
		assert.equal(leaders.notesOpacity, 0);

		const notesMid = stageVisual(0.94, true);
		assert.equal(notesMid.leadersOpacity, 1);
		near(notesMid.notesOpacity, 0.5);

		const done = stageVisual(1, true);
		assert.equal(done.cropT, 1);
		assert.equal(done.uprightOpacity, 0);
		assert.equal(done.plateOpacity, 1);
		assert.equal(done.boxesOpacity, 1);
		assert.equal(done.leadersOpacity, 1);
		assert.equal(done.notesOpacity, 1);
		assert.deepEqual(stageVisual(2, true), done);
	});

	it('keeps leaders and note text off when the detail has no public note', () => {
		const tail = stageVisual(0.9, false);
		assert.equal(tail.plateOpacity, 1);
		assert.equal(tail.boxesOpacity, 1);
		assert.equal(tail.leadersOpacity, 0);
		assert.equal(tail.notesOpacity, 0);
		assert.equal(tail.uprightOpacity, 0);
		const done = stageVisual(1, false);
		assert.equal(done.notesOpacity, 0);
		assert.equal(done.leadersOpacity, 0);
		assert.equal(done.boxesOpacity, 1);
	});
});

describe('camera keypoints', () => {
	it('omits the notes keypoint when there is no public note', () => {
		assert.deepEqual(
			cameraKeypoints(false).map((key) => [key.id, key.at]),
			[
				['upright', 0],
				['zoom', ZOOM_END],
				['plate', PLATE_END],
				['boxes', BOXES_END],
			],
		);
		assert.deepEqual(
			cameraKeypoints(true).map((key) => key.id),
			['upright', 'zoom', 'plate', 'boxes', 'notes'],
		);
		assert.equal(cameraKeypoints(true)[4]?.at, 1);
	});

	it('keeps the earlier keypoint on a tie, and treats the no-note tail as already settled', () => {
		assert.equal(nearestKeypoint(0, false).id, 'upright');
		assert.equal(nearestKeypoint(0.2, true).id, 'upright');
		assert.equal(nearestKeypoint(0.2, true).at, 0);
		assert.equal(nearestKeypoint(0.24, false).id, 'zoom');
		assert.equal(nearestKeypoint(0.46, true).id, 'zoom');
		assert.equal(nearestKeypoint(PLATE_END, true).id, 'plate');
		assert.equal(nearestKeypoint(BOXES_END, true).id, 'boxes');
		assert.equal(nearestKeypoint(0.82, true).id, 'boxes');
		assert.equal(nearestKeypoint(0.9, true).id, 'notes');
		assert.equal(nearestKeypoint(0.9, true).at, 1);
		assert.equal(nearestKeypoint(1, true).id, 'notes');
		const tail = nearestKeypoint(0.9, false);
		assert.equal(tail.id, 'boxes');
		assert.equal(tail.at, 0.9);
		assert.equal(nearestKeypoint(1, false).at, 1);
	});
});

describe('runway placement', () => {
	it('sizes travel as one pass per detail plus a joint between details', () => {
		assert.equal(runwayTravelSvh(0), 0);
		assert.equal(runwayTravelSvh(1), 140);
		assert.equal(runwayTravelSvh(2), 308);
		assert.equal(runwayTravelSvh(3), 476);
	});

	it('maps one detail with no joint', () => {
		assert.deepEqual(placeOnRunway(0, 1), { index: 0, local: 0, joint: 0, outgoing: -1 });
		const mid = placeOnRunway(0.5, 1);
		assert.equal(mid.index, 0);
		near(mid.local, 0.5);
		assert.equal(mid.joint, 0);
		assert.equal(mid.outgoing, -1);
		const end = placeOnRunway(1, 1);
		assert.equal(end.index, 0);
		near(end.local, 1);
		assert.equal(end.joint, 0);
		assert.deepEqual(placeOnRunway(-1, 1), placeOnRunway(0, 1));
		assert.deepEqual(placeOnRunway(2, 1), placeOnRunway(1, 1));
		assert.deepEqual(placeOnRunway(0.5, 0), { index: 0, local: 1, joint: 0, outgoing: -1 });
	});

	it('holds the next detail at upright for the whole joint', () => {
		const total = 308;
		const passEnd = placeOnRunway(140 / total, 2);
		assert.equal(passEnd.index, 0);
		near(passEnd.local, 1);
		assert.equal(passEnd.joint, 0);
		assert.equal(passEnd.outgoing, -1);

		const jointMid = placeOnRunway(154 / total, 2);
		assert.equal(jointMid.index, 1);
		assert.equal(jointMid.local, 0);
		near(jointMid.joint, 0.5);
		assert.equal(jointMid.outgoing, 0);

		const jointEnd = placeOnRunway(168 / total, 2);
		assert.equal(jointEnd.index, 1);
		assert.equal(jointEnd.local, 0);
		near(jointEnd.joint, 1);
		assert.equal(jointEnd.outgoing, 0);

		const second = placeOnRunway(238 / total, 2);
		assert.equal(second.index, 1);
		near(second.local, 0.5);
		assert.equal(second.joint, 0);
		assert.equal(second.outgoing, -1);

		const done = placeOnRunway(1, 2);
		assert.equal(done.index, 1);
		near(done.local, 1);
		assert.equal(done.joint, 0);
		assert.equal(done.outgoing, -1);
	});
});

describe('settle and pace', () => {
	it('settles inside a pass to the nearest keypoint and across a joint at the midpoint', () => {
		assert.deepEqual(nearestSettlePlace(0, 2, [false, false]), { index: 0, local: 0 });
		const zoomTravel = nearestSettlePlace(0.24 * (140 / 308), 2, [true, true]);
		assert.deepEqual(zoomTravel, { index: 0, local: ZOOM_END });
		const noNoteTail = nearestSettlePlace((0.9 * 140) / 308, 2, [false, true]);
		assert.equal(noNoteTail.index, 0);
		near(noNoteTail.local, 0.9);

		assert.deepEqual(nearestSettlePlace(154 / 308, 2, [false, false]), { index: 0, local: 1 });
		assert.deepEqual(nearestSettlePlace(154 / 308, 2, [true, false]), { index: 0, local: 1 });
		const intoNext = nearestSettlePlace((140 + 14.1) / 308, 2, [true, true]);
		assert.deepEqual(intoNext, { index: 1, local: 0 });
		assert.deepEqual(nearestSettlePlace(1, 2, [true, true]), { index: 1, local: 1 });
		assert.deepEqual(nearestSettlePlace(1, 2, [true, false]), { index: 1, local: 1 });
	});

	it('turns a keypoint into a document scroll offset along the same travel', () => {
		assert.equal(runwayScrollY(80, 3080, 2, 0, 0), 80);
		assert.equal(runwayScrollY(80, 3080, 2, 0, 1), 1480);
		assert.equal(runwayScrollY(80, 3080, 2, 1, 0), 1760);
		assert.equal(runwayScrollY(80, 3080, 2, 1, 0.5), 2460);
		assert.equal(runwayScrollY(80, 3080, 2, 1, 1), 3160);
		assert.equal(runwayScrollY(80, 0, 2, 1, 1), 80);
		assert.equal(runwayScrollY(0, 1400, 1, 0, 1), 1400);
	});

	it('pins when the column fits and paces the overflow linearly with p', () => {
		assert.equal(readTrackOffset(0, 100, 200), 0);
		assert.equal(readTrackOffset(1, 100, 200), 0);
		assert.equal(readTrackOffset(0.5, 200, 200), 0);
		assert.equal(readTrackOffset(1, 201, 200), 0);
		assert.equal(readTrackOffset(0, 500, 200), 0);
		assert.equal(readTrackOffset(0.5, 500, 200), 150);
		assert.equal(readTrackOffset(1, 500, 200), 300);
		assert.equal(readTrackOffset(0.25, 400, 100), 75);
		assert.equal(readTrackOffset(-1, 500, 200), 0);
		assert.equal(readTrackOffset(2, 500, 200), 300);
		assert.equal(readTrackOffset(1, 500, 0), 0);
	});

	it('settles only after the runway top has reached the viewport and the runway still fills it', () => {
		assert.equal(shouldSettleRunway(40, 5000, 800, 24), false);
		assert.equal(shouldSettleRunway(25, 5000, 800, 24), false);
		assert.equal(shouldSettleRunway(24, 5000, 800, 24), true);
		assert.equal(shouldSettleRunway(0, 5000, 800, 24), true);
		assert.equal(shouldSettleRunway(-200, 5000, 800, 24), true);
		assert.equal(shouldSettleRunway(-4000, 776, 800, 24), true);
		assert.equal(shouldSettleRunway(-4000, 775, 800, 24), false);
		assert.equal(shouldSettleRunway(0, 0, 800, 24), false);
	});
});

describe('scroll geometry', () => {
	const anchors = [100, 200, 300, 400];

	it('maps the activation line through row anchors', () => {
		assert.equal(progressFromAnchors(anchors, 100), 0);
		near(progressFromAnchors(anchors, 200), 1 / 3);
		near(progressFromAnchors(anchors, 300), 2 / 3);
		assert.equal(progressFromAnchors(anchors, 400), 1);
		assert.equal(progressFromAnchors(anchors, 40), 0);
		assert.equal(progressFromAnchors(anchors, 900), 1);
		assert.equal(progressFromAnchors([], 10), 1);
		assert.equal(progressFromAnchors([80], 80), 1);
		assert.equal(progressFromAnchors([80], 10), 0);
	});

	it('picks the nearer row and keeps the earlier row on a tie', () => {
		assert.equal(nearestRowIndex(anchors, 200), 1);
		assert.equal(nearestRowIndex(anchors, 140), 0);
		assert.equal(nearestRowIndex(anchors, 150), 0);
		assert.equal(nearestRowIndex([], 0), 0);
	});

	it('activates the last heading that has reached the line', () => {
		assert.equal(activeDetailIndex([100, 500, 900], 50), 0);
		assert.equal(activeDetailIndex([100, 500, 900], 100), 0);
		assert.equal(activeDetailIndex([100, 500, 900], 499), 0);
		assert.equal(activeDetailIndex([100, 500, 900], 500), 1);
		assert.equal(activeDetailIndex([100, 500, 900], 1200), 2);
		assert.equal(activeDetailIndex([], 10), 0);
	});

	it('places the reading line in the paper column', () => {
		assert.equal(activationLineY(1000, true), 420);
		assert.equal(activationLineY(1000, false), 720);
	});

	it('scrolls so the chosen anchor meets the line', () => {
		assert.equal(scrollTopForAnchor(1000, 500, 400), 1100);
		assert.equal(scrollTopForAnchor(1000, 300, 400), 900);
	});

	it('settles only from the first label through the bottom of the last row', () => {
		const lastRowBottom = 520;
		assert.equal(shouldSettle(anchors, lastRowBottom, 250, 24), true);
		assert.equal(shouldSettle(anchors, lastRowBottom, 100, 24), true);
		assert.equal(shouldSettle(anchors, lastRowBottom, 500, 24), true);
		assert.equal(shouldSettle(anchors, lastRowBottom, 76, 24), true);
		assert.equal(shouldSettle(anchors, lastRowBottom, 70, 24), false);
		assert.equal(shouldSettle(anchors, lastRowBottom, 544, 24), true);
		assert.equal(shouldSettle(anchors, lastRowBottom, 550, 24), false);
		assert.equal(shouldSettle([], lastRowBottom, 0, 24), false);
	});
});
