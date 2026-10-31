import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { PATH_STROKE } from './map-tiles.ts';
import { KM_OCEAN, KM_SHORT } from './trajectory-camera.ts';
import {
	CHRONO_ACTIVE_SCALE,
	CHRONO_BEAD_PX,
	CHRONO_HALO_FROM,
	CHRONO_HALO_MS,
	CHRONO_HALO_OPACITY,
	CHRONO_HALO_TO,
	CHRONO_MID_MS,
	CHRONO_OCEAN_MS,
	CHRONO_SHORT_MS,
	chronoEdgePoint,
	chronoEdgeStyle,
	chronoHaloFrame,
	chronoMarkerPhase,
	chronoMarkerStyle,
	chronoSegmentMs,
	chronoStations,
	dedupedStationCount,
	easeOut,
} from './trajectory-chrono.ts';

const leipzig = { lon: 12.373, lat: 51.34 };
const toronto = { lon: -79.383, lat: 43.653 };

describe('chrono stations', () => {
	const discs = [
		{
			id: 'b',
			places: [
				{ year: 1723, id: 'late' },
				{ year: 1700, id: 'early' },
				{ year: 1723, id: 'same-year' },
			],
		},
		{
			id: 'a',
			places: [
				{ year: 1723, id: 'other' },
				{ year: 1685, id: 'birth' },
			],
		},
	];

	it('orders by year, then disc id, then the places index', () => {
		const rows = chronoStations(discs, null);
		assert.deepEqual(
			rows.map((row) => `${row.discId}:${row.place.id}`),
			['a:birth', 'b:early', 'a:other', 'b:late', 'b:same-year'],
		);
		assert.deepEqual(
			rows.map((row) => row.index),
			[1, 1, 0, 0, 2],
		);
	});

	it('walks one disc when one is selected and never invents a first disc for null', () => {
		const one = chronoStations(discs, 'b');
		assert.deepEqual(
			one.map((row) => row.place.id),
			['early', 'late', 'same-year'],
		);
		assert.equal(chronoStations(discs, 'missing').length, 0);
		assert.equal(chronoStations(discs, null).length, 5);
	});
});

describe('chrono motion', () => {
	it('bins the crawl shorter than a documentary leg and skips it for reduced motion', () => {
		assert.equal(chronoSegmentMs(0, false), CHRONO_SHORT_MS);
		assert.equal(chronoSegmentMs(KM_SHORT, false), CHRONO_SHORT_MS);
		assert.equal(chronoSegmentMs(KM_SHORT + 0.01, false), CHRONO_MID_MS);
		assert.equal(chronoSegmentMs(KM_OCEAN, false), CHRONO_MID_MS);
		assert.equal(chronoSegmentMs(KM_OCEAN + 0.01, false), CHRONO_OCEAN_MS);
		assert.equal(CHRONO_SHORT_MS, 1600);
		assert.equal(CHRONO_MID_MS, 2400);
		assert.equal(CHRONO_OCEAN_MS, 3600);
		assert.equal(chronoSegmentMs(9000, true), 0);
	});

	it('expands one halo and does not loop the opacity back up', () => {
		assert.equal(CHRONO_HALO_MS, 900);
		assert.equal(easeOut(0), 0);
		assert.equal(easeOut(1), 1);
		assert.ok(easeOut(0.5) > 0.5);
		const start = chronoHaloFrame(0);
		const end = chronoHaloFrame(1);
		const diameter = 3.5 * CHRONO_ACTIVE_SCALE * 2;
		assert.equal(start.radius, diameter * CHRONO_HALO_FROM);
		assert.equal(end.radius, diameter * CHRONO_HALO_TO);
		assert.equal(start.opacity, CHRONO_HALO_OPACITY);
		assert.equal(end.opacity, 0);
		assert.ok(end.radius > start.radius);
		const mid = chronoHaloFrame(0.5);
		assert.ok(mid.opacity < start.opacity && mid.opacity > 0);
	});

	it('eases the bead along the great circle', () => {
		assert.deepEqual(chronoEdgePoint(leipzig, toronto, 0), leipzig);
		assert.deepEqual(chronoEdgePoint(leipzig, toronto, 1), toronto);
		const mid = chronoEdgePoint(leipzig, toronto, 0.5);
		assert.ok(mid.lon < leipzig.lon && mid.lon > toronto.lon);
	});

	it('lights one station at a time in a single brick family', () => {
		assert.equal(chronoMarkerPhase(2, 2), 'active');
		assert.equal(chronoMarkerPhase(1, 2), 'visited');
		assert.equal(chronoMarkerPhase(3, 2), 'pending');
		const active = chronoMarkerStyle('active');
		const visited = chronoMarkerStyle('visited');
		const pending = chronoMarkerStyle('pending');
		assert.equal(active.fill, 'brick');
		assert.ok(Math.abs(active.radius / 3.5 - CHRONO_ACTIVE_SCALE) < 1e-9);
		assert.equal(active.fillOpacity, 1);
		assert.equal(visited.fill, 'brick');
		assert.equal(visited.fillOpacity, 0.7);
		assert.equal(pending.fill, 'pencil');
		assert.equal(pending.fillOpacity, 0.45);
		const same = chronoEdgeStyle(false, true);
		const jump = chronoEdgeStyle(true, false);
		assert.equal(same.dash, null);
		assert.equal(same.opacity, 0.9);
		assert.ok(jump.dash);
		assert.ok(jump.opacity < same.opacity);
		assert.equal(PATH_STROKE.selected, '#a8432b');
		assert.equal(CHRONO_BEAD_PX, 6);
	});
});

describe('catalog station count', () => {
	it('counts a shared city or a shared rounded coordinate once', () => {
		assert.equal(dedupedStationCount([]), 0);
		assert.equal(
			dedupedStationCount([
				{ city: 'Leipzig', lon: 12.37, lat: 51.34 },
				{ city: ' leipzig ', lon: 12.5, lat: 51.5 },
				{ city: 'Toronto', lon: -79.38, lat: 43.65 },
			]),
			2,
		);
		assert.equal(
			dedupedStationCount([
				{ city: 'Utrecht', lon: 5.122, lat: 52.09 },
				{ city: 'Other', lon: 5.124, lat: 52.091 },
			]),
			1,
		);
	});
});

describe('chrono wiring', () => {
	it('keeps the tour line off the camera and the catalog clearable', () => {
		const client = readFileSync('src/components/trajectory-map-client.ts', 'utf8');
		const view = readFileSync('src/components/TrajectoryMap.astro', 'utf8');
		assert.match(client, /selectedDiscId: string \| null/);
		assert.match(client, /!shortHop && \(ocean \|\| sheetMissesCorridor/);
		assert.match(client, /labelHold/);
		assert.match(view, /全馆/);
		assert.match(view, /data-traj-all/);
		assert.match(view, /data-traj-chrono/);
		assert.match(view, /data-traj-guide/);
		assert.match(view, /点选站点或一张唱片/);
		const fly = client.slice(client.indexOf('async function flyTo'), client.indexOf('async function playFrom'));
		const cruiseAt = fly.indexOf('await animate');
		const thawAt = fly.indexOf('thawSheet(mine)', cruiseAt);
		const settleAt = fly.indexOf('await animate', thawAt);
		assert.ok(thawAt > cruiseAt && settleAt > thawAt);
		assert.doesNotMatch(fly.slice(cruiseAt, thawAt), /paintCountryLabels/);
		assert.doesNotMatch(fly.slice(thawAt, settleAt), /paintCountryLabels/);
		assert.match(fly.slice(settleAt), /paintCountryLabels/);
		const chrono = client.slice(
			client.indexOf('async function runChrono'),
			client.indexOf('async function focusPlace'),
		);
		assert.ok(chrono.length > 0);
		assert.doesNotMatch(chrono, /flyTo\(/);
		assert.doesNotMatch(chrono, /paintCountryLabels|scheduleCountryLabels/);
		assert.match(chrono, /prefers-reduced-motion|reduceMotion\(\)/);
	});
});
