import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import {
	MAGNET_EDGE_SLACK_PX,
	MAGNET_INSET_DESKTOP,
	MAGNET_INSET_MID,
	MAGNET_INSET_MOBILE,
	MAGNET_OPTICAL_Y,
	MAGNET_SNAP_MS,
	magnetFitPadding,
	magnetFrame,
	magnetInsets,
	magnetOffset,
	magnetOpticalTarget,
	magnetRectOffset,
	magnetSettleMs,
	magnetSkips,
	magnetZoomPadding,
} from './trajectory-magnet.ts';

const read = (path: string): string => readFileSync(join(process.cwd(), path), 'utf8');

const SIZE = { x: 900, y: 520 };

describe('arrival magnet safe frame', () => {
	it('reads all three breakpoints, not two', () => {
		assert.deepEqual(magnetInsets(375), { top: 36, right: 28, bottom: 44, left: 28 });
		assert.deepEqual(magnetInsets(640), MAGNET_INSET_MOBILE);
		assert.deepEqual(magnetInsets(641), { top: 36, right: 32, bottom: 44, left: 32 });
		assert.deepEqual(magnetInsets(899), MAGNET_INSET_MID);
		assert.deepEqual(magnetInsets(900), { top: 40, right: 40, bottom: 48, left: 40 });
		assert.deepEqual(magnetInsets(1440), MAGNET_INSET_DESKTOP);
		// The bottom inset stays the larger one: a pin never hugs the lower edge.
		for (const inset of [MAGNET_INSET_MOBILE, MAGNET_INSET_MID, MAGNET_INSET_DESKTOP]) {
			assert.ok(inset.bottom > inset.top);
			assert.ok(inset.bottom >= inset.top + 8);
		}
	});

	it('puts the single-pin target at centre x, 42% down the frame', () => {
		assert.equal(MAGNET_OPTICAL_Y, 0.42);
		const insets = magnetInsets(1440);
		const frame = magnetFrame(SIZE, insets);
		assert.equal(frame.left, 40);
		assert.equal(frame.right, 860);
		assert.equal(frame.top, 40);
		assert.equal(frame.bottom, 472);
		assert.equal(frame.width, 820);
		assert.equal(frame.height, 432);
		const target = magnetOpticalTarget(SIZE, insets);
		assert.equal(target.x, 450);
		assert.equal(target.y, 40 + 432 * 0.42);
		// A window smaller than its inset still gets a box to work with.
		const tiny = magnetFrame({ x: 60, y: 40 }, magnetInsets(375));
		assert.ok(tiny.width >= 1 && tiny.height >= 1);
	});
});

describe('magnet pan vector', () => {
	const insets = magnetInsets(1440);

	it('pulls an out-of-frame point to the optical target', () => {
		// A pin that landed flush against the left / lower edge.
		const offset = magnetOffset({ point: { x: 4, y: 512 }, size: SIZE, insets });
		assert.ok(offset);
		assert.deepEqual(offset, { x: 446, y: -291 });
		// Only a pan: the target is where the point has to read from now on.
		const target = magnetOpticalTarget(SIZE, insets);
		assert.equal(offset.x, Math.round(target.x - 4));
		assert.equal(offset.y, Math.round(target.y - 512));
	});

	it('leaves a point inside the frame alone, even inside the slack', () => {
		const target = magnetOpticalTarget(SIZE, insets);
		assert.equal(magnetOffset({ point: target, size: SIZE, insets }), null);
		const frame = magnetFrame(SIZE, insets);
		assert.equal(magnetOffset({ point: { x: frame.left, y: frame.top }, size: SIZE, insets }), null);
		// Slack: a couple of pixels over the edge does not jitter the map.
		assert.equal(
			magnetOffset({
				point: { x: frame.left - MAGNET_EDGE_SLACK_PX, y: frame.bottom },
				size: SIZE,
				insets,
			}),
			null,
		);
		const past = frame.left - MAGNET_EDGE_SLACK_PX - 1;
		const nudged = magnetOffset({ point: { x: past, y: frame.top }, size: SIZE, insets });
		assert.ok(nudged);
		// Out of frame on one axis still reads to the whole optical target.
		assert.deepEqual(nudged, {
			x: Math.round(target.x - past),
			y: Math.round(40 + 432 * MAGNET_OPTICAL_Y - frame.top),
		});
	});

	it('keeps a near cluster box inside the same inset', () => {
		const inside = magnetRectOffset({
			rect: { x: 100, y: 100, width: 200, height: 120 },
			size: SIZE,
			insets,
		});
		assert.equal(inside, null);
		const low = magnetRectOffset({
			rect: { x: 300, y: 400, width: 200, height: 160 },
			size: SIZE,
			insets,
		});
		assert.ok(low);
		assert.equal(low.x, 0);
		assert.ok(low.y < 0, 'the box is below the frame: the pan lifts it');
		const left = magnetRectOffset({
			rect: { x: 0, y: 200, width: 120, height: 120 },
			size: SIZE,
			insets,
		});
		assert.ok(left);
		assert.ok(left.x > 0);
	});

	it('reads the frame as an asymmetric fit padding and a zoom budget', () => {
		const pad = magnetFitPadding(insets);
		assert.deepEqual(pad.topLeft, { x: 40, y: 40 });
		assert.deepEqual(pad.bottomRight, { x: 40, y: 48 });
		const mid = magnetFitPadding(magnetInsets(700));
		assert.deepEqual(mid.topLeft, { x: 32, y: 36 });
		assert.deepEqual(mid.bottomRight, { x: 32, y: 44 });
		assert.ok(mid.bottomRight.y > mid.topLeft.y);
		assert.deepEqual(magnetZoomPadding(insets), { x: 80, y: 88 });
	});
});

describe('when the magnet stays off', () => {
	it('never takes explore, the year walk, or a cruise', () => {
		assert.equal(magnetSkips({ viewMode: 'explore', flying: false }), true);
		assert.equal(magnetSkips({ viewMode: 'chrono', flying: false }), true);
		assert.equal(magnetSkips({ viewMode: 'guide', flying: true }), true);
		assert.equal(magnetSkips({ viewMode: 'guide', flying: false }), false);
		assert.equal(magnetSettleMs(true), 0);
		assert.equal(magnetSettleMs(false), MAGNET_SNAP_MS);
		assert.equal(MAGNET_SNAP_MS, 220);
	});
});

describe('magnet wiring', () => {
	it('snaps after the settle and fit, pan only, and leaves explore alone', () => {
		const client = read('src/components/trajectory-map-client.ts');
		const snap = client.slice(
			client.indexOf('function snapActivePin'),
			client.indexOf('async function flyTo'),
		);
		assert.ok(snap.length > 0);
		assert.match(snap, /magnetSkips\(\{ viewMode, flying \}\)/);
		assert.match(snap, /magnetInsets\(window\.innerWidth\)/);
		assert.match(snap, /magnetRectOffset\(/);
		assert.match(snap, /magnetOffset\(/);
		// Pan only: the settle zoom is already fixed.
		assert.match(snap, /map\.panBy\(\[offset\.x, offset\.y\], \{/);
		assert.doesNotMatch(snap, /setView|panTo|fitBounds|setZoom|zoomSnap|scrollIntoView/);
		assert.match(snap, /animate: !reduceMotion\(\)/);
		assert.match(snap, /duration: magnetSettleMs\(reduceMotion\(\)\) \/ 1000/);

		const fly = client.slice(client.indexOf('async function flyTo'), client.indexOf('async function playFrom'));
		const settle = fly.indexOf('await animate', fly.indexOf('thawSheet(mine)'));
		const landing = fly.slice(settle);
		// The landing frame is fit, then magneted, and only after the camera rests.
		assert.ok(landing.indexOf('flying = false') >= 0);
		assert.ok(landing.indexOf('flying = false') < landing.indexOf('fitLocalNear(index)'));
		assert.ok(landing.indexOf('fitLocalNear(index)') < landing.indexOf('snapActivePin(index)'));
		// A reduced-motion arrival jumps straight to the frame.
		const reduced = fly.slice(fly.indexOf('if (reduceMotion())'), fly.indexOf('const ocean = isOceanLeg'));
		assert.match(reduced, /snapActivePin\(index\)/);
		assert.equal(client.match(/scrollIntoView/g)?.length, 1);
		assert.doesNotMatch(client, /ScrollIntoView\([^)]*snap/);
		// The near fit no longer uses a symmetric pad.
		assert.doesNotMatch(client, /padding: \[LOCAL_NEAR_PADDING_PX, LOCAL_NEAR_PADDING_PX\]/);
	});
});
