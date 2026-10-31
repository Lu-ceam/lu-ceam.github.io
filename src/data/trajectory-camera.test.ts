import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
	DWELL_MS,
	DWELL_RECORDING_MS,
	FLY_MID_MS,
	FLY_OCEAN_MS,
	FLY_SHORT_MS,
	SETTLE_MS,
	dwellMs,
	easeInOut,
	haversineKm,
	isOceanLeg,
	legFlyMs,
	legZoom,
	illustrativeBlurbWarnings,
	roleLabel,
	settleMs,
	slerpLngLat,
	weakSegments,
	yearText,
} from './trajectory-camera.ts';

const eisenach = { lon: 10.319, lat: 50.975 };
const leipzig = { lon: 12.373, lat: 51.34 };
const toronto = { lon: -79.383, lat: 43.653 };
const ny = { lon: -73.978, lat: 40.744 };
const holland = { lon: 5.291, lat: 52.132 };
const utrecht = { lon: 5.122, lat: 52.09 };

describe('documentary timing', () => {
	it('bins hops at 800 km and 3000 km', () => {
		assert.equal(legFlyMs(0, false), FLY_SHORT_MS);
		assert.equal(legFlyMs(800, false), FLY_SHORT_MS);
		assert.equal(legFlyMs(800.01, false), FLY_MID_MS);
		assert.equal(legFlyMs(3000, false), FLY_MID_MS);
		assert.equal(legFlyMs(3000.01, false), FLY_OCEAN_MS);
		assert.equal(legFlyMs(9000, true), 0);
	});

	it('dwells longer on a recording and always settles for 0.7s', () => {
		assert.equal(dwellMs('recording', false), DWELL_RECORDING_MS);
		assert.equal(dwellMs('birth', false), DWELL_MS);
		assert.equal(dwellMs('recording', true) < DWELL_MS, true);
		assert.equal(settleMs(false), SETTLE_MS);
		assert.equal(settleMs(true), 0);
	});

	it('keeps the six d37779 stations inside the slow tour, opening frame included as a dwell', () => {
		const stops = [
			{ at: eisenach, next: leipzig, role: 'birth' },
			{ at: leipzig, next: toronto, role: 'composition' },
			{ at: toronto, next: ny, role: 'birth' },
			{ at: ny, next: holland, role: 'recording' },
			{ at: holland, next: utrecht, role: 'pressing' },
			{ at: utrecht, next: null, role: 'other' },
		];
		let total = 0;
		for (const [index, stop] of stops.entries()) {
			total += dwellMs(stop.role, false);
			if (!stop.next) continue;
			const km = haversineKm(stop.at, stop.next);
			if (index === 0) assert.equal(isOceanLeg(km), false);
			if (index === 1 || index === 3) assert.equal(isOceanLeg(km), true);
			total += legFlyMs(km, false);
			total += settleMs(false);
		}
		assert.ok(total >= 50_000 && total <= 70_000, `tour ${total}ms`);
	});
});

describe('camera path', () => {
	it('eases in and out without moving the endpoints', () => {
		assert.equal(easeInOut(0), 0);
		assert.equal(easeInOut(1), 1);
		assert.equal(easeInOut(0.5), 0.5);
		assert.ok(easeInOut(0.25) < 0.25);
		assert.ok(easeInOut(0.75) > 0.75);
	});

	it('pulls an ocean leg back at mid-flight, then stops short of the target', () => {
		const mid = legZoom(0.5, 10, 6, true);
		assert.ok(mid < Math.min(10, 6) - 1.5);
		assert.equal(legZoom(0, 10, 6, true), 10);
		assert.ok(legZoom(1, 10, 6, true) < 6);
		const hopped = [0, 0.25, 0.5, 0.75, 1].map((t) => legZoom(t, 7, 8, false));
		assert.deepEqual(
			hopped,
			[...hopped].sort((a, b) => a - b),
		);
	});

	it('follows the great circle and keeps the endpoints', () => {
		assert.deepEqual(slerpLngLat(ny, holland, 0), ny);
		assert.deepEqual(slerpLngLat(ny, holland, 1), holland);
		const mid = slerpLngLat(ny, holland, 0.5);
		const linearLat = (ny.lat + holland.lat) / 2;
		assert.ok(mid.lat > linearLat);
	});
});

describe('labels and weak links', () => {
	it('shows yearLabel when present', () => {
		assert.equal(yearText({ year: 1723, yearLabel: '1723–50' }), '1723–50');
		assert.equal(yearText({ year: 1685 }), '1685');
		assert.equal(roleLabel('recording'), '录音');
	});

	it('warns on illustrative blurbs and stays quiet without a trajectory', () => {
		const lines = illustrativeBlurbWarnings([
			{
				id: 'd37779',
				trajectory: { places: [{ id: 'holland', blurb: '【示意，待馆员核定】国家级' }] },
			},
			{ id: 'lpbr6083' },
			{ id: 'plain', trajectory: { places: [{ id: 'a', blurb: '已核的一句' }] } },
		]);
		assert.deepEqual(lines, ['d37779/holland: 旁注含「示意」或「待馆员核定」，不当定论']);
	});

	it('links different records that share a city or a rounded coordinate', () => {
		const alone = weakSegments([
			{ recordId: 'a', placeId: '1', city: 'Leipzig', lon: 12.37, lat: 51.34 },
			{ recordId: 'a', placeId: '2', city: 'Leipzig', lon: 12.4, lat: 51.4 },
		]);
		assert.equal(alone.length, 0);

		const byCity = weakSegments([
			{ recordId: 'a', placeId: '1', city: 'Leipzig', lon: 12.37, lat: 51.34 },
			{ recordId: 'b', placeId: '9', city: ' leipzig ', lon: 12.5, lat: 51.5 },
		]);
		assert.equal(byCity.length, 1);
		assert.equal(byCity[0]?.[0].recordId, 'a');
		assert.equal(byCity[0]?.[1].recordId, 'b');

		const byCoord = weakSegments([
			{ recordId: 'a', placeId: '1', city: 'Utrecht', lon: 5.122, lat: 52.09 },
			{ recordId: 'b', placeId: '2', city: 'Other', lon: 5.124, lat: 52.091 },
		]);
		assert.equal(byCoord.length, 1);

		const none = weakSegments([
			{ recordId: 'a', placeId: '1', city: 'Leipzig', lon: 12.37, lat: 51.34 },
			{ recordId: 'b', placeId: '2', city: 'Toronto', lon: -79.38, lat: 43.65 },
		]);
		assert.equal(none.length, 0);
	});
});
