import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
	DWELL_MAX_MS,
	DWELL_MS,
	DWELL_READ_BASE_MS,
	DWELL_READ_PER_CHAR_MS,
	DWELL_RECORDING_MS,
	FLY_MID_MS,
	FLY_OCEAN_MS,
	FLY_SHORT_MS,
	SETTLE_MS,
	arcVertexCount,
	cruiseZoom,
	dwellMs,
	easeInOut,
	FREEZE_ZOOM_BAND,
	haversineKm,
	isOceanLeg,
	LAND_REDRAW_STRETCH,
	landSheetNeedsRedraw,
	legFlyMs,
	legZoom,
	illustrativeBlurbWarnings,
	roleLabel,
	settleMs,
	sheetCruiseAction,
	sheetSnapshotFrame,
	sheetStretch,
	shouldShowFrozenSheet,
	shouldThawFrozenSheet,
	slerpLngLat,
	weakSegments,
	yearText,
} from './trajectory-camera.ts';
import { arrivalZoom } from './map-tiles.ts';

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

	it('holds a long blurb up to 12s and leaves reduced motion short', () => {
		const chars = 50;
		const read = DWELL_READ_BASE_MS + DWELL_READ_PER_CHAR_MS * chars;
		assert.ok(read > DWELL_MS && read < DWELL_MAX_MS);
		assert.equal(dwellMs('birth', false, '字'.repeat(chars)), read);
		assert.equal(dwellMs('recording', false, '字'.repeat(chars)), read);
		assert.equal(dwellMs('birth', false, '短'), DWELL_MS);
		assert.equal(dwellMs('birth', false, '字'.repeat(400)), DWELL_MAX_MS);
		assert.equal(dwellMs('recording', true, '字'.repeat(400)), dwellMs('recording', true));
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

	it('eases every cruise frame with legZoom, land and ocean, with no 10 Hz hold', () => {
		assert.equal(cruiseZoom({ t: 0, zoomFrom: 5.5, zoomTo: 6, ocean: false }), 5.5);
		const hopped = cruiseZoom({ t: 1, zoomFrom: 5.5, zoomTo: 6, ocean: false });
		assert.equal(hopped, legZoom(1, 5.5, 6, false));
		assert.ok(hopped < 6);
		assert.notEqual(hopped, 5.5);

		let prev = cruiseZoom({ t: 0, zoomFrom: 6, zoomTo: 5.5, ocean: true });
		let changes = 0;
		const duration = 6500;
		for (let ms = 16; ms <= duration; ms += 16) {
			const zoom = cruiseZoom({
				t: ms / duration,
				zoomFrom: 6,
				zoomTo: 5.5,
				ocean: true,
			});
			if (zoom !== prev) changes += 1;
			prev = zoom;
		}
		assert.ok(changes > duration / 100, `ocean zoom changes ${changes}`);
		assert.equal(
			cruiseZoom({ t: 1, zoomFrom: 6, zoomTo: 5.5, ocean: true }),
			legZoom(1, 6, 5.5, true),
		);
	});

	it('slices a precomputed arc from the start vertex to the end', () => {
		assert.equal(arcVertexCount(49, 0), 1);
		assert.equal(arcVertexCount(49, 1), 49);
		assert.equal(arcVertexCount(49, 0.5), 25);
		assert.equal(arcVertexCount(0, 1), 0);
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

	it('frames a freeze at mid-leg zoom and keeps takeoff on the vectors', () => {
		const zoomFrom = arrivalZoom(8);
		const zoomTo = arrivalZoom(7);
		assert.equal(zoomFrom, 6.2);
		assert.equal(zoomTo, 5.5);
		const frame = sheetSnapshotFrame({
			from: leipzig,
			to: toronto,
			zoomFrom,
			zoomTo,
			ocean: true,
		});
		assert.equal(frame.zoom, legZoom(0.5, zoomFrom, zoomTo, true));
		assert.deepEqual(frame.center, slerpLngLat(leipzig, toronto, 0.5));
		assert.ok(frame.zoom > 3 && frame.zoom < 4);
		assert.ok(sheetStretch(zoomFrom, frame.zoom) > 4);
		assert.equal(
			shouldShowFrozenSheet({
				snapshotZoom: frame.zoom,
				viewZoom: zoomFrom,
				canvasCoversViewport: true,
			}),
			false,
		);
		assert.equal(
			shouldShowFrozenSheet({
				snapshotZoom: frame.zoom,
				viewZoom: frame.zoom,
				canvasCoversViewport: true,
			}),
			true,
		);
		assert.equal(
			shouldShowFrozenSheet({
				snapshotZoom: frame.zoom,
				viewZoom: frame.zoom + FREEZE_ZOOM_BAND,
				canvasCoversViewport: true,
			}),
			true,
		);
		assert.ok(sheetStretch(frame.zoom, frame.zoom + FREEZE_ZOOM_BAND) <= 2);
		assert.equal(
			shouldShowFrozenSheet({
				snapshotZoom: frame.zoom,
				viewZoom: zoomFrom,
				canvasCoversViewport: false,
			}),
			true,
		);
	});

	it('thaws a frozen sheet only once zoom climbs back above the snapshot', () => {
		const snapshotZoom = legZoom(0.5, 6.2, 5.5, true);
		assert.equal(
			shouldThawFrozenSheet({ snapshotZoom, viewZoom: 5.5, previousZoom: 6.2 }),
			false,
		);
		assert.equal(
			shouldThawFrozenSheet({
				snapshotZoom,
				viewZoom: snapshotZoom + FREEZE_ZOOM_BAND,
				previousZoom: snapshotZoom,
			}),
			false,
		);
		assert.equal(
			shouldThawFrozenSheet({
				snapshotZoom,
				viewZoom: snapshotZoom + FREEZE_ZOOM_BAND + 0.05,
				previousZoom: snapshotZoom + FREEZE_ZOOM_BAND,
			}),
			true,
		);
	});

	it('redraws a land cruise before the sheet stretches past about 1.4×', () => {
		const holland = arrivalZoom(6);
		const utrecht = arrivalZoom(9);
		assert.equal(holland, 4.5);
		assert.equal(utrecht, 6.2);
		const hopped = cruiseZoom({ t: 1, zoomFrom: holland, zoomTo: utrecht, ocean: false });
		assert.ok(sheetStretch(holland, hopped) > 2.4);
		assert.equal(landSheetNeedsRedraw(holland, hopped), true);

		let drawn = holland;
		let max = 1;
		for (let i = 0; i <= 200; i++) {
			const zoom = cruiseZoom({ t: i / 200, zoomFrom: holland, zoomTo: utrecht, ocean: false });
			max = Math.max(max, sheetStretch(drawn, zoom));
			if (landSheetNeedsRedraw(drawn, zoom)) drawn = zoom;
		}
		assert.ok(max <= LAND_REDRAW_STRETCH + 0.05, `land stretch ${max}`);

		const eisenachZoom = arrivalZoom(7);
		const leipzigZoom = arrivalZoom(8);
		const shortEnd = cruiseZoom({
			t: 1,
			zoomFrom: eisenachZoom,
			zoomTo: leipzigZoom,
			ocean: false,
		});
		assert.equal(landSheetNeedsRedraw(eisenachZoom, shortEnd), false);
	});

	it('keeps an ocean takeoff on vectors and a land hop off the bitmap', () => {
		const zoomFrom = arrivalZoom(8);
		const frame = sheetSnapshotFrame({
			from: leipzig,
			to: toronto,
			zoomFrom,
			zoomTo: arrivalZoom(7),
			ocean: true,
		});
		const base = {
			ocean: true,
			hasSnapshot: true,
			snapshotZoom: frame.zoom,
			previousZoom: zoomFrom,
			bitmapShown: false,
			drawnZoom: zoomFrom,
		};
		assert.equal(
			sheetCruiseAction({
				...base,
				viewZoom: zoomFrom,
				canvasCoversViewport: true,
			}),
			'hold',
		);
		assert.equal(
			sheetCruiseAction({
				...base,
				viewZoom: zoomFrom - 0.5,
				previousZoom: zoomFrom,
				canvasCoversViewport: false,
			}),
			'show',
		);
		assert.equal(
			sheetCruiseAction({
				...base,
				viewZoom: frame.zoom,
				previousZoom: frame.zoom + 0.2,
				canvasCoversViewport: true,
			}),
			'show',
		);
		assert.equal(
			sheetCruiseAction({
				...base,
				bitmapShown: true,
				viewZoom: frame.zoom + FREEZE_ZOOM_BAND + 0.05,
				previousZoom: frame.zoom + FREEZE_ZOOM_BAND,
				canvasCoversViewport: false,
			}),
			'thaw',
		);
		assert.equal(
			sheetCruiseAction({
				...base,
				bitmapShown: true,
				viewZoom: 5.4,
				previousZoom: 5.8,
				canvasCoversViewport: false,
			}),
			'hold',
		);
		assert.equal(
			sheetCruiseAction({
				ocean: false,
				hasSnapshot: false,
				snapshotZoom: 0,
				viewZoom: 5.8,
				previousZoom: 5.5,
				bitmapShown: false,
				canvasCoversViewport: true,
				drawnZoom: arrivalZoom(7),
			}),
			'hold',
		);
		assert.equal(
			sheetCruiseAction({
				ocean: false,
				hasSnapshot: false,
				snapshotZoom: 0,
				viewZoom: arrivalZoom(6) + 1.3,
				previousZoom: arrivalZoom(6),
				bitmapShown: false,
				canvasCoversViewport: true,
				drawnZoom: arrivalZoom(6),
			}),
			'redraw',
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

	it('warns on flyover and year-field jargon without failing a clean blurb', () => {
		const lines = illustrativeBlurbWarnings([
			{
				id: 'd37779',
				trajectory: {
					places: [
						{ id: 'utrecht', blurb: 'year 暂与压片年同，仅保飞镜顺序。' },
						{ id: 'mass', blurb: '飞镜以全曲定稿为代表。' },
						{ id: 'ok', blurb: '封底贴有店家旧标，可证流通经乌得勒支。' },
					],
				},
			},
			{ id: 'silent' },
		]);
		assert.deepEqual(lines, [
			'd37779/utrecht: 旁注含实现用语（飞镜、year 暂与），不宜公开',
			'd37779/mass: 旁注含实现用语（飞镜、year 暂与），不宜公开',
		]);
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
