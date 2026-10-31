import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { PATH_STROKE, BASEMAP_PAINT } from './map-tiles.ts';
import { FLY_MID_MS, FLY_OCEAN_MS, FLY_SHORT_MS, SETTLE_MS } from './trajectory-camera.ts';
import {
	OPENING_OVERVIEW_MS,
	narrationBlurb,
	oceanLegPhrase,
	oceanPhraseVisible,
	openingFrame,
	openingOverviewMs,
	playsOpeningOverview,
	viewportPlayAction,
} from './trajectory-guide.ts';

const eisenach = { lon: 10.319, lat: 50.975 };
const leipzig = { lon: 12.373, lat: 51.34 };
const toronto = { lon: -79.383, lat: 43.653 };
const ny = { lon: -73.978, lat: 40.744 };
const holland = { lon: 5.291, lat: 52.132 };
const moscow = { lon: 37.62, lat: 55.75 };
const vladivostok = { lon: 131.89, lat: 43.12 };
const tokyo = { lon: 139.69, lat: 35.68 };
const sanFrancisco = { lon: -122.42, lat: 37.77 };

function read(path: string): string {
	return readFileSync(path, 'utf8');
}

describe('opening overview', () => {
	it('holds the full disc for 1–2s and skips that hold under reduced motion', () => {
		assert.equal(openingOverviewMs(false), OPENING_OVERVIEW_MS);
		assert.ok(OPENING_OVERVIEW_MS >= 1000 && OPENING_OVERVIEW_MS <= 2000);
		assert.equal(openingOverviewMs(true), 0);
		assert.equal(playsOpeningOverview({ startIndex: 0, placeCount: 6, reduceMotion: false }), true);
		assert.equal(playsOpeningOverview({ startIndex: 0, placeCount: 6, reduceMotion: true }), false);
		assert.equal(playsOpeningOverview({ startIndex: 2, placeCount: 6, reduceMotion: false }), false);
		assert.equal(playsOpeningOverview({ startIndex: 0, placeCount: 1, reduceMotion: false }), false);
	});

	it('frames every stop of a disc and refuses a date-line span', () => {
		const frame = openingFrame([eisenach, leipzig, toronto, ny, holland]);
		assert.ok(frame);
		assert.ok(frame.west <= toronto.lon && frame.east >= leipzig.lon);
		assert.ok(frame.south <= ny.lat && frame.north >= holland.lat);
		assert.equal(openingFrame([eisenach]), null);
		assert.equal(openingFrame([
			{ lon: 170, lat: 10 },
			{ lon: -170, lat: 12 },
		]), null);
	});

	it('keeps the owner cruise times and the original settle', () => {
		assert.equal(FLY_SHORT_MS, 3200);
		assert.equal(FLY_MID_MS, 4500);
		assert.equal(FLY_OCEAN_MS, 6500);
		assert.equal(SETTLE_MS, 700);
	});
});

describe('narration and ocean phrase', () => {
	it('keeps the full blurb with no line cap', () => {
		const long = '莱比锡时期的一句说明'.repeat(20);
		assert.equal(narrationBlurb(long).text, long);
		assert.equal(narrationBlurb(undefined).text, '');
		assert.equal('lines' in narrationBlurb(long), false);
	});

	it('names the basin only around mid-flight, and not for a land crossing', () => {
		assert.equal(oceanLegPhrase(leipzig, toronto), '大西洋');
		assert.equal(oceanLegPhrase(ny, holland), '大西洋');
		assert.equal(oceanLegPhrase(eisenach, leipzig), null);
		assert.equal(oceanLegPhrase(moscow, vladivostok), null);
		assert.equal(oceanLegPhrase(tokyo, sanFrancisco), '太平洋');
		assert.equal(oceanPhraseVisible(0), false);
		assert.equal(oceanPhraseVisible(0.2), false);
		assert.equal(oceanPhraseVisible(0.34), true);
		assert.equal(oceanPhraseVisible(0.5), true);
		assert.equal(oceanPhraseVisible(0.66), true);
		assert.equal(oceanPhraseVisible(1), false);
	});
});

describe('viewport and pencil paths', () => {
	it('starts an embedded map in view, pauses off-screen, and resumes only that pause', () => {
		assert.equal(
			viewportPlayAction({
				embed: true,
				inView: false,
				started: false,
				userTookOver: false,
				mode: 'idle',
				pausedByViewport: false,
			}),
			'ignore',
		);
		assert.equal(
			viewportPlayAction({
				embed: true,
				inView: true,
				started: false,
				userTookOver: false,
				mode: 'idle',
				pausedByViewport: false,
			}),
			'start',
		);
		assert.equal(
			viewportPlayAction({
				embed: true,
				inView: false,
				started: true,
				userTookOver: false,
				mode: 'play',
				pausedByViewport: false,
			}),
			'pause',
		);
		assert.equal(
			viewportPlayAction({
				embed: true,
				inView: true,
				started: true,
				userTookOver: false,
				mode: 'paused',
				pausedByViewport: true,
			}),
			'resume',
		);
		assert.equal(
			viewportPlayAction({
				embed: true,
				inView: true,
				started: true,
				userTookOver: true,
				mode: 'paused',
				pausedByViewport: false,
			}),
			'ignore',
		);
		assert.equal(
			viewportPlayAction({
				embed: false,
				inView: false,
				started: true,
				userTookOver: false,
				mode: 'play',
				pausedByViewport: false,
			}),
			'ignore',
		);
	});

	it('keeps one brick accent and a fainter dashed pencil for other discs', () => {
		assert.equal(PATH_STROKE.selected, '#a8432b');
		assert.equal(PATH_STROKE.selected, BASEMAP_PAINT.route);
		assert.equal(PATH_STROKE.faint, BASEMAP_PAINT.coast);
		assert.notEqual(PATH_STROKE.faint, PATH_STROKE.selected);
		assert.ok(PATH_STROKE.faintWeight < PATH_STROKE.weakWeight);
		assert.match(PATH_STROKE.faintDash, /^\d+ \d+$/);
		assert.ok(PATH_STROKE.faintOpacity <= 0.6);
	});
});

describe('guide markup', () => {
	it('shows the full under-map blurb and leaves the same string in the stop list', () => {
		const view = read('src/components/TrajectoryMap.astro');
		const blurbRule = view.match(/\.traj-blurb\s*\{[^}]*\}/)?.[0] ?? '';
		assert.match(blurbRule, /max-width:\s*36em/);
		assert.doesNotMatch(blurbRule, /line-clamp|webkit-line-clamp|webkit-box|overflow:\s*hidden/);
		assert.doesNotMatch(view, /line-clamp|webkit-line-clamp|webkit-box/);
		assert.match(view, /traj-stop-blurb/);
		assert.match(view, /\{place\.blurb && <span class="traj-stop-blurb">\{place\.blurb\}<\/span>\}/);
		assert.match(view, /data-traj-bearing/);
		assert.match(view, /data-traj-card[\s\S]*data-traj-bearing/);
		assert.doesNotMatch(view, /data-traj-map[\s\S]{0,400}data-traj-bearing/);
		assert.match(view, /\.traj-controls button\s*\{[^}]*min-height:\s*44px/);
		assert.match(view, /\.traj-card\s*\{[^}]*min-height:\s*148px/);
	});

	it('wires the opening hold, the ocean phrase, and the return to the guide', () => {
		const client = read('src/components/trajectory-map-client.ts');
		assert.match(client, /playsOpeningOverview/);
		assert.match(client, /openingOverviewMs/);
		assert.match(client, /oceanLegPhrase/);
		assert.match(client, /oceanPhraseVisible/);
		assert.match(client, /viewportPlayAction/);
		assert.match(client, /回到导播/);
		assert.match(client, /PATH_STROKE\.faintDash/);
		assert.match(client, /PATH_STROKE\.selected/);
		assert.match(client, /if \(flying\) return/);
		assert.match(client, /cruiseZoom/);
		assert.match(client, /arcVertexCount/);
		assert.match(client, /traj-freeze/);
		assert.match(client, /_redrawRequest = null/);
		assert.match(client, /_moveStart\(true, false\)/);
		assert.match(client, /_move\(/);
		assert.match(client, /_moveEnd\(true\)/);
		assert.doesNotMatch(client, /panTo\(|OCEAN_ZOOM_HZ|tileLayer|openstreetmap|traj-caption/i);
		const fly = client.slice(client.indexOf('async function flyTo'), client.indexOf('async function playFrom'));
		const cruiseAt = fly.indexOf('await animate');
		const thawAt = fly.indexOf('thawSheet(mine)', cruiseAt);
		const settleAt = fly.indexOf('await animate', thawAt);
		assert.ok(cruiseAt >= 0 && thawAt > cruiseAt && settleAt > thawAt);
		assert.doesNotMatch(fly.slice(cruiseAt, thawAt), /setView|panTo/);
		assert.doesNotMatch(fly.slice(settleAt), /setView|panTo/);
		assert.match(fly, /thawSheet\(null\)/);
		assert.equal(FLY_OCEAN_MS, 6500);
	});
});
