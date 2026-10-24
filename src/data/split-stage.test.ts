import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
	CROP_BLEND_AT,
	DETAIL_CROSSFADE_MS,
	SETTLE_EPSILON_PX,
	SETTLE_IDLE_MS,
	SETTLE_LOCK_MS,
	SETTLE_SLACK_PX,
	STAGE_ROWS,
	activationLineY,
	activeDetailIndex,
	containBox,
	croppedBox,
	lerpBox,
	nearestRowIndex,
	progressFromAnchors,
	scrollTopForAnchor,
	shouldSettle,
	stageVisual,
} from './split-stage.ts';

function near(actual: number, expected: number): void {
	assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} ~= ${expected}`);
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
		assert.equal(CROP_BLEND_AT, 0.9);
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
		assert.deepEqual(lerpBox(contain, cropped, 0), contain);
		assert.deepEqual(lerpBox(contain, cropped, 1), cropped);
		assert.deepEqual(lerpBox(contain, cropped, -1), contain);
		assert.deepEqual(lerpBox(contain, cropped, 2), cropped);
		const mid = lerpBox(contain, cropped, 0.5);
		assert.deepEqual(mid, { left: 5, top: -40, width: 250, height: 250 });
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

describe('stageVisual', () => {
	it('holds upright on the first row and the finished plate on the second', () => {
		const upright = stageVisual(0, false);
		assert.equal(upright.cropT, 0);
		assert.equal(upright.uprightOpacity, 1);
		assert.equal(upright.plateOpacity, 0);
		assert.equal(upright.boxesOpacity, 0);
		assert.equal(upright.notesOpacity, 0);

		const midCrop = stageVisual(0.15, false);
		near(midCrop.cropT, 0.5);
		assert.equal(midCrop.uprightOpacity, 1);
		assert.equal(midCrop.plateOpacity, 0);

		const blending = stageVisual(0.95 / 3, false);
		assert.equal(blending.cropT, 1);
		near(blending.plateOpacity, 0.5);
		near(blending.uprightOpacity, 0.5);
		assert.equal(blending.boxesOpacity, 0);

		const plate = stageVisual(1 / 3, false);
		assert.equal(plate.cropT, 1);
		assert.equal(plate.uprightOpacity, 0);
		assert.equal(plate.plateOpacity, 1);
		assert.equal(plate.boxesOpacity, 0);
		assert.equal(plate.notesOpacity, 0);
	});

	it('fades boxes between row 2 and row 3, and notes only when notesOn', () => {
		const boxesOn = stageVisual(2 / 3, true);
		assert.equal(boxesOn.boxesOpacity, 1);
		assert.equal(boxesOn.notesOpacity, 0);
		assert.equal(boxesOn.plateOpacity, 1);

		const notesMid = stageVisual(5 / 6, true);
		near(notesMid.notesOpacity, 0.5);
		assert.equal(notesMid.boxesOpacity, 1);

		const done = stageVisual(1, true);
		assert.equal(done.notesOpacity, 1);
		assert.equal(done.boxesOpacity, 1);

		const noNotes = stageVisual(1, false);
		assert.equal(noNotes.plateOpacity, 1);
		assert.equal(noNotes.boxesOpacity, 1);
		assert.equal(noNotes.notesOpacity, 0);
		assert.equal(noNotes.uprightOpacity, 0);
	});

	it('does not treat 0.55 or 0.75 as dwell points', () => {
		const legacyCropEnd = stageVisual(0.55, false);
		assert.ok(legacyCropEnd.boxesOpacity > 0 && legacyCropEnd.boxesOpacity < 1);
		const legacyBoxes = stageVisual(0.75, true);
		assert.ok(legacyBoxes.notesOpacity > 0 && legacyBoxes.notesOpacity < 1);
	});

	it('clamps progress outside 0..1', () => {
		assert.equal(stageVisual(-0.2, false).uprightOpacity, 1);
		assert.equal(stageVisual(2, false).notesOpacity, 0);
		assert.equal(stageVisual(2, true).notesOpacity, 1);
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
