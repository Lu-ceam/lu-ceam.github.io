import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { COUNTRY_LABEL_FADE_MS, COUNTRY_LABEL_ZOOM_MAX } from './country-labels.ts';
import { PATH_STROKE, BASEMAP_PAINT, VECTOR_BASEMAP } from './map-tiles.ts';
import { resolveRecordsExport } from './records-entities.ts';
import {
	DWELL_MAX_MS,
	DWELL_MS,
	DWELL_RECORDING_MS,
	FLY_MID_MS,
	FLY_OCEAN_MS,
	FLY_SHORT_MS,
	SETTLE_MS,
	SETTLE_ZOOM_DELTA,
	groupOverviewPins,
	haversineKm,
} from './trajectory-camera.ts';
import {
	GLYPH_MIN_ZOOM,
	LOCAL_NEAR_KM,
	LOCAL_NEAR_PADDING_PX,
	LOCAL_NEAR_ZOOM,
	OPENING_OVERVIEW_MS,
	PIN_DENSITY,
	PIN_DENSITY_DENSE_N,
	PIN_DENSITY_DENSE_PX,
	PIN_DENSITY_MEDIUM_N,
	PIN_DENSITY_MEDIUM_PX,
	PIN_DENSITY_PAIR_LIMIT,
	PIN_DENSITY_SPARSE_N,
	PIN_DENSITY_SPARSE_PX,
	PIN_DENSITY_THROTTLE_MS,
	PIN_GLYPH_SVG,
	isLocalNearHop,
	isStationSwipe,
	localNearFrame,
	localNearHops,
	localNearStops,
	medianPairPx,
	narrationBlurb,
	oceanLegPhrase,
	oceanPhraseVisible,
	openingFrame,
	openingOverviewMs,
	pinDensityTier,
	pinGlyphKind,
	playsOpeningOverview,
	stageStepsStation,
	viewportPlayAction,
	type LocalNearStop,
	type PinDensityTier,
	type PinGlyphKind,
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

	it('keeps the tightened cruise times and folds the settle in', () => {
		assert.equal(FLY_SHORT_MS, 2400);
		assert.equal(FLY_MID_MS, 3400);
		assert.equal(FLY_OCEAN_MS, 5000);
		assert.equal(DWELL_MS, 3500);
		assert.equal(DWELL_RECORDING_MS, 4500);
		assert.equal(DWELL_MAX_MS, 8000);
		// Plan A: the cruise closes the settle step, so there is no settle phase.
		assert.equal(SETTLE_MS, 0);
		assert.equal(SETTLE_ZOOM_DELTA, 0.22);
		assert.equal(COUNTRY_LABEL_FADE_MS, 150);
		assert.equal(COUNTRY_LABEL_ZOOM_MAX, 6);
		assert.equal(VECTOR_BASEMAP.maxZoom, 12);
	});
});

const EARTH_KM = 6371;

function northOf(origin: { lon: number; lat: number }, km: number): { lon: number; lat: number } {
	return { lon: origin.lon, lat: origin.lat + (km / EARTH_KM) * (180 / Math.PI) };
}

function stop(
	partial: { lon: number; lat: number; cityZh?: string; zoom?: number },
): LocalNearStop {
	return { cityZh: partial.cityZh ?? '城', ...partial };
}

describe('same-disc local pair', () => {
	it('frames stops under 5 km and leaves a lone pin alone', () => {
		const origin = { lon: 11.58, lat: 49.96 };
		const close = northOf(origin, 4.9);
		const far = northOf(origin, 5.05);
		assert.ok(Math.abs(haversineKm(origin, close) - 4.9) < 0.02);
		assert.ok(haversineKm(origin, far) > LOCAL_NEAR_KM);
		const pair = [stop(origin), stop({ ...close, cityZh: '别处', zoom: 4 })];
		assert.deepEqual(
			localNearStops(pair, 0)?.map((place) => place.lat),
			pair.map((place) => place.lat),
		);
		assert.equal(localNearStops([stop(origin), stop({ ...far, cityZh: '别处', zoom: 4 })], 0), null);
		assert.equal(localNearStops([stop({ ...origin, zoom: 12 })], 0), null);
		assert.equal(localNearFrame([stop({ ...origin, zoom: 12 })], 0), null);
		assert.equal(localNearStops(pair, -1), null);
		assert.equal(isLocalNearHop(origin, close), true);
		assert.equal(isLocalNearHop(origin, far), false);
		assert.equal(isLocalNearHop(origin, origin), false);
	});

	it('joins the same cityZh only when the targeted stop asks for zoom 9 or tighter', () => {
		const origin = { lon: 11.58, lat: 49.96 };
		const other = northOf(origin, 18);
		assert.ok(haversineKm(origin, other) > LOCAL_NEAR_KM);
		const low = [
			stop({ ...origin, cityZh: '拜罗伊特', zoom: 7 }),
			stop({ ...other, cityZh: ' 拜罗伊特 ', zoom: 12 }),
		];
		assert.equal(localNearStops(low, 0), null);
		const tight = [
			stop({ ...origin, cityZh: '拜罗伊特', zoom: LOCAL_NEAR_ZOOM }),
			stop({ ...other, cityZh: '拜罗伊特', zoom: 4 }),
		];
		assert.deepEqual(
			localNearStops(tight, 0)?.map((place) => place.zoom),
			[LOCAL_NEAR_ZOOM, 4],
		);
		assert.equal(localNearStops(tight, 1), null);
		const blank = [
			stop({ ...origin, cityZh: ' ', zoom: 10 }),
			stop({ ...other, cityZh: ' ', zoom: 10 }),
		];
		assert.equal(localNearStops(blank, 0), null);
	});

	it('keeps a chain of short hops in one frame and refuses a date-line city name', () => {
		const origin = { lon: 11.58, lat: 49.96 };
		const mid = northOf(origin, 3);
		const far = northOf(origin, 6);
		assert.ok(haversineKm(origin, far) > LOCAL_NEAR_KM);
		assert.ok(haversineKm(mid, far) < LOCAL_NEAR_KM);
		const chain = [stop(origin), stop(mid), stop({ ...far, cityZh: '别处' })];
		assert.equal(localNearStops(chain, 0)?.length, 3);
		assert.equal(localNearStops(chain, 2)?.length, 3);
		const dated = [
			stop({ lon: 170, lat: 10, cityZh: '同名', zoom: 10 }),
			stop({ lon: -170, lat: 12, cityZh: '同名', zoom: 4 }),
		];
		assert.equal(localNearStops(dated, 0)?.length, 2);
		assert.equal(localNearFrame(dated, 0), null);
	});

	it('frames falp381 Bayreuth as two pins and keeps the landmark in the blurb', () => {
		const disc = resolveRecordsExport().find((record) => record.id === 'falp381');
		assert.ok(disc?.trajectory);
		const places = disc.trajectory.places;
		const founded = places.findIndex((place) => place.id === 'bayreuth-festival-founded');
		const recording = places.findIndex((place) => place.id === 'bayreuth-1951');
		assert.ok(founded >= 0 && recording >= 0);
		const festival = places[founded];
		const session = places[recording];
		assert.ok(festival && session);
		const km = haversineKm(festival, session);
		assert.ok(km > 1 && km < LOCAL_NEAR_KM, `bayreuth km ${km}`);
		assert.equal(festival.cityZh, '拜罗伊特');
		assert.equal(session.cityZh, '拜罗伊特');
		assert.notEqual(festival.blurb, session.blurb);
		assert.match(festival.blurb ?? '', /Festspielhaus|音乐节/);
		assert.match(session.blurb ?? '', /节日剧院/);
		for (const index of [founded, recording]) {
			assert.deepEqual(
				localNearStops(places, index)?.map((place) => place.id),
				['bayreuth-festival-founded', 'bayreuth-1951'],
			);
		}
		const frame = localNearFrame(places, recording);
		assert.ok(frame);
		assert.ok(frame.east - frame.west < 1);
		assert.ok(frame.north >= session.lat && frame.south <= festival.lat);
		const berlin = places.findIndex((place) => place.id === 'berlin-furt');
		assert.equal(localNearStops(places, berlin), null);
		assert.deepEqual(
			localNearHops(places).map(([from, to]) => [from.id, to.id]),
			[['bayreuth-festival-founded', 'bayreuth-1951']],
		);
		const groups = groupOverviewPins(places).filter((group) =>
			group.members.some((place) => place.cityZh === '拜罗伊特'),
		);
		assert.equal(groups.length, 2);
		assert.equal(LOCAL_NEAR_PADDING_PX >= 48 && LOCAL_NEAR_PADDING_PX <= 80, true);
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
	it('never starts or resumes an embedded map on entry, and pauses it off-screen', () => {
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
			'ignore',
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
			'ignore',
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

	it('buckets roles into person, org, record, and no glyph', () => {
		assert.equal(pinGlyphKind('birth'), 'person');
		assert.equal(pinGlyphKind('death'), 'person');
		assert.equal(pinGlyphKind('composition'), 'person');
		assert.equal(pinGlyphKind('founded'), 'org');
		assert.equal(pinGlyphKind('recording'), 'record');
		assert.equal(pinGlyphKind('pressing'), 'record');
		assert.equal(pinGlyphKind('release'), 'record');
		assert.equal(pinGlyphKind('other'), null);
		assert.equal(pinGlyphKind('premiere'), null);
		assert.equal(pinGlyphKind('nonsense'), null);
		const kinds: PinGlyphKind[] = ['person', 'org', 'record'];
		for (const kind of kinds) {
			const svg = PIN_GLYPH_SVG[kind];
			assert.match(svg, /^<svg viewBox="0 0 12 12"/);
			assert.doesNotMatch(svg, /\p{Extended_Pictographic}/u);
			assert.doesNotMatch(svg, /#[0-9a-f]{3,6}/i);
		}
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
		assert.ok(cruiseAt >= 0 && thawAt > cruiseAt);
		// One landing: the cruise ends on the target zoom, with no second push-in.
		assert.equal(fly.indexOf('await animate', thawAt), -1);
		assert.doesNotMatch(fly.slice(cruiseAt, thawAt), /setView|panTo|fitBounds/);
		assert.doesNotMatch(fly.slice(cruiseAt), /arriveZoom/);
		assert.doesNotMatch(fly.slice(thawAt), /setView|panTo/);
		assert.match(fly, /framed\?\.zoom \?\? arrivalZoom\(place\.zoom\)/);
		assert.match(fly.slice(thawAt), /fitLocalNear\(index\)/);
		assert.match(fly, /thawSheet\(null\)/);
		assert.equal(FLY_OCEAN_MS, 5000);
		assert.match(client, /localNearHops\(places\)/);
		assert.match(client, /PATH_STROKE\.nearWeight/);
		assert.match(client, /PATH_STROKE\.selected/);
		// The near fit lands inside the arrival safe frame, not a symmetric pad.
		assert.match(
			client,
			/paddingTopLeft: L\.point\(pad\.topLeft\.x, pad\.topLeft\.y\),\s*paddingBottomRight: L\.point\(pad\.bottomRight\.x, pad\.bottomRight\.y\),\s*animate: false,\s*maxZoom: nearFitMaxZoom\(\)/,
		);
		assert.match(client, /magnetFitPadding\(magnetInsets\(window\.innerWidth\)\)/);
		const focus = client.slice(
			client.indexOf('async function focusPlace'),
			client.indexOf('function placeFromHash'),
		);
		assert.match(focus, /if \(viewMode === 'chrono'\)/);
		assert.doesNotMatch(focus.slice(0, focus.indexOf("if (viewMode === 'explore')")), /fitLocalNear/);
		assert.match(focus, /fitLocalNear\(index\)/);
		assert.doesNotMatch(client, /tileLayer|openstreetmap/i);
		assert.ok(PATH_STROKE.nearWeight > 1.8 && PATH_STROKE.nearWeight <= 3);
		assert.equal(PATH_STROKE.nearOpacity, 1);
	});

	it('keeps autoplay off the observer and steps stations from the narration column', () => {
		const client = read('src/components/trajectory-map-client.ts');
		const observer = client.slice(
			client.indexOf('new IntersectionObserver'),
			client.indexOf('observer.observe'),
		);
		assert.ok(observer.length > 0);
		assert.doesNotMatch(observer, /playFrom/);
		assert.match(observer, /invalidateSize/);
		assert.match(observer, /fitOverviewOnce/);
		assert.match(client, /root\.querySelector<HTMLElement>\('\.traj-stage'\)/);
		assert.doesNotMatch(client, /document\.addEventListener/);
		assert.match(client, /'wheel',[\s\S]*?\{ passive: false, capture: true \}/);
		assert.match(client, /seekChronoIndex\(chronoIndex \+ dir, false\)/);
		assert.match(client, /if \(mode === 'play'\) hold\(\)/);
		assert.match(client, /rolePinGlyph\(dot\.place\.role\)/);
		// The glyph rides the density tier above a soft zoom floor, not the near gate.
		assert.match(client, /map\.getZoom\(\) < GLYPH_MIN_ZOOM/);
		assert.doesNotMatch(client, /map\.getZoom\(\) < LOCAL_NEAR_ZOOM/);
		assert.match(client, /map\.on\('zoomend', repaintMarkers\)/);
		const view = read('src/components/TrajectoryMap.astro');
		assert.match(view, /<details class="traj-stops-fold" open>/);
		assert.match(view, /站表 · \{disc\.places\.length\} 站/);
		assert.match(view, /\.traj-stops-fold > summary \{[^}]*min-height: 44px/);
		assert.match(view, /\.traj \.traj-pin-mark/);
	});

	it('shoots a full-resolution mid-leg sheet and does not freeze every land hop', () => {
		const client = read('src/components/trajectory-map-client.ts');
		assert.match(client, /copy\.width = source\.width/);
		assert.match(client, /copy\.height = source\.height/);
		assert.match(client, /drawImage\(source, 0, 0\)/);
		assert.doesNotMatch(client, /toDataURL|image\/jpeg|source\.width \* 0\.5/);
		assert.match(client, /sheetSnapshotFrame/);
		assert.match(client, /sheetCruiseAction/);
		assert.match(client, /ocean \|\| sheetMissesCorridor/);
		assert.match(client, /traj-freeze/);
		const capture = client.slice(
			client.indexOf('function captureSheet'),
			client.indexOf('function showFrozenSheet'),
		);
		assert.ok(capture.length > 0);
		assert.doesNotMatch(capture, /fitBounds/);
		assert.match(capture, /setView/);
		assert.doesNotMatch(client, /tileLayer|openstreetmap/i);
	});
});

describe('stage gesture and disc frame', () => {
	it('steps from guide, chrono, and a running tour, and leaves explore to the map', () => {
		assert.equal(stageStepsStation({ viewMode: 'guide', mode: 'idle' }), true);
		assert.equal(stageStepsStation({ viewMode: 'guide', mode: 'paused' }), true);
		assert.equal(stageStepsStation({ viewMode: 'guide', mode: 'play' }), true);
		assert.equal(stageStepsStation({ viewMode: 'chrono', mode: 'paused' }), true);
		assert.equal(stageStepsStation({ viewMode: 'explore', mode: 'idle' }), false);
		assert.equal(stageStepsStation({ viewMode: 'explore', mode: 'paused' }), false);
		assert.equal(stageStepsStation({ viewMode: 'explore', mode: 'play' }), true);
	});

	it('keeps a sideways drag off the station step', () => {
		assert.equal(isStationSwipe({ dx: 2, dy: -40 }), true);
		assert.equal(isStationSwipe({ dx: 40, dy: -2 }), false);
		assert.equal(isStationSwipe({ dx: 30, dy: 30 }), false);
		assert.equal(isStationSwipe({ dx: 0, dy: 0 }), false);
	});

	it('moves the wheel and touch step off the narration column onto the stage', () => {
		const client = read('src/components/trajectory-map-client.ts');
		assert.match(client, /root\.querySelector<HTMLElement>\('\.traj-stage'\)/);
		assert.doesNotMatch(client, /\.traj-narr/);
		const stage = client.slice(
			client.indexOf('stageEl = root.querySelector'),
			client.indexOf('const foldQuery'),
		);
		assert.ok(stage.length > 0);
		assert.match(stage, /stageStepsStation\(\{ viewMode, mode \}\)/);
		assert.match(stage, /isStationSwipe\(\{ dx: event\.deltaX, dy: event\.deltaY \}\)/);
		assert.match(stage, /'wheel',[\s\S]*?\{ passive: false, capture: true \}/);
		assert.match(stage, /'touchmove',[\s\S]*?\{ passive: false \}/);
		assert.match(stage, /'touchend',/);
		// An end of the disc hands the wheel back to the page: `canStep` decides
		// before anything is prevented.
		const wheel = stage.slice(stage.indexOf("'wheel',"), stage.indexOf('let touchFrom'));
		assert.ok(wheel.indexOf('!canStep(dir)') >= 0);
		assert.ok(wheel.indexOf('!canStep(dir)') < wheel.indexOf('preventDefault()'));
	});

	it('never lets a click or a wheel on the map fall into explore', () => {
		const client = read('src/components/trajectory-map-client.ts');
		assert.doesNotMatch(client, /mapEl\.addEventListener\(\s*'pointerdown'/);
		assert.doesNotMatch(client, /mapEl\.addEventListener\(\s*'wheel'/);
		const explore = client.slice(
			client.indexOf('exploreBtn?.addEventListener'),
			client.indexOf('function activatePlace'),
		);
		assert.ok(explore.length > 0);
		assert.match(explore, /setInteractions\(true\)/);
		assert.doesNotMatch(explore, /pointerdown|wheel/);
	});
});

describe('guide stage lock', () => {
	it('locks the stage in guide and play and hands it back in explore', () => {
		const client = read('src/components/trajectory-map-client.ts');
		assert.match(
			client,
			/stageEl\?\.classList\.toggle\('is-guide-lock', stageStepsStation\(\{ viewMode, mode \}\)\)/,
		);
		const buttons = client.slice(
			client.indexOf('function updateButtons'),
			client.indexOf('function setInteractions'),
		);
		assert.ok(buttons.indexOf('is-guide-lock') >= 0);
		// Still one listener on the stage, never on document or body.
		assert.doesNotMatch(client, /document\.addEventListener/);
		const view = read('src/components/TrajectoryMap.astro');
		assert.match(view, /\.traj-stage\.is-guide-lock \{\s*touch-action: none;\s*overscroll-behavior-y: contain;/);
		// The open stop list keeps its own vertical scroll.
		assert.match(
			view,
			/\.traj-stage\.is-guide-lock \.traj-stops,\s*\.traj-stage\.is-guide-lock \.traj-stops-fold > summary \{\s*touch-action: pan-y;/,
		);
	});

	it('keeps the phone sheet about four tenths of the screen and the card compact', () => {
		const view = read('src/components/TrajectoryMap.astro');
		const phone = view.slice(
			view.indexOf('@media (max-width: 640px)'),
			view.indexOf('@media (min-width: 900px)'),
		);
		assert.ok(phone.length > 0);
		assert.match(phone, /\.traj-map \{\s*height: min\(42vh, 320px\);\s*min-height: 220px;/);
		assert.match(phone, /\.traj-narr \{\s*padding: 10px 2px 4px;/);
		assert.match(phone, /\.traj-card \{\s*min-height: 112px;/);
		// Wider screens keep the taller sheet.
		assert.match(view, /height: min\(58vh, 520px\)/);
		assert.match(view, /min-height: 148px/);
	});

	it('takes the wheel at once for a step and leaves the list and the ends alone', () => {
		const client = read('src/components/trajectory-map-client.ts');
		const wheel = client.slice(
			client.indexOf("'wheel',"),
			client.indexOf('let touchFrom'),
		);
		assert.ok(wheel.length > 0);
		// The stop list and its summary own their gesture: no step, no prevent.
		assert.match(wheel, /if \(listOwnsGesture\(event\.target\)\) return;/);
		assert.ok(
			wheel.indexOf('listOwnsGesture(event.target)') < wheel.indexOf('preventDefault()'),
		);
		// An end of the disc hands the wheel back before anything is prevented.
		assert.ok(wheel.indexOf('!canStep(dir)') < wheel.indexOf('preventDefault()'));
		// A step prevents first and only then fills the 80px accumulator.
		assert.ok(wheel.indexOf('event.preventDefault()') < wheel.indexOf('wheelAcc += event.deltaY'));
		assert.match(wheel, /WHEEL_STEP_PX/);
		assert.match(client, /const WHEEL_STEP_PX = 80;/);
		assert.match(client, /const GESTURE_LOCK_MS = 560;/);
		assert.match(client, /const TOUCH_STEP_PX = 56;/);
		assert.match(client, /const PAGE_SCROLL_COOLDOWN_MS = 240;/);
		assert.match(client, /const STATION_FLIGHT_LOCK_MS = 420;/);
		// The cooldown, the flight and the lock only swallow the step: they are read
		// after the prevent, so a page scroll can never let the wheel through.
		assert.ok(wheel.indexOf('event.preventDefault()') < wheel.indexOf('pageScrollCooldown()'));
		assert.ok(wheel.indexOf('event.preventDefault()') < wheel.indexOf('stationInFlight()'));
		assert.ok(wheel.indexOf('event.preventDefault()') < wheel.indexOf('now < lockUntil'));
		assert.match(
			wheel,
			/if \(pageScrollCooldown\(\) \|\| stationInFlight\(\)\) \{\s*wheelAcc = 0;\s*return;\s*\}/,
		);
		// Only the stage reads the page scroll: passive, and it never steps.
		assert.match(
			client,
			/window\.addEventListener\(\s*'scroll',\s*\(\) => \{\s*lastPageScrollAt = performance\.now\(\);\s*\},\s*\{ passive: true \},/,
		);
		const touch = client.slice(
			client.indexOf("'touchmove',"),
			client.indexOf("'touchend',"),
		);
		assert.match(touch, /listOwnsGesture\(event\.target\)/);
		assert.match(touch, /event\.preventDefault\(\);\s*touchHeld = true;/);
	});

	it('keeps the page still across a station step, wheel or finger', () => {
		const client = read('src/components/trajectory-map-client.ts');
		// Nothing in the client scrolls the reader back to the narration, the city,
		// the card or the map while the stage holds the gesture.
		assert.equal(client.match(/scrollIntoView/g)?.length, 1);
		assert.doesNotMatch(client, /traj-city'\)?\.?scrollIntoView|\.traj-narr'\)?\.?scrollIntoView/);
		const pick = client.slice(
			client.indexOf('function activatePlace'),
			client.indexOf('.traj-stops [data-traj-place]'),
		);
		assert.ok(pick.length > 0);
		// The map only comes along when the pick hands the stage back to the reader.
		assert.match(pick, /const pageLocked = stageStepsStation\(\{ viewMode, mode \}\);/);
		assert.ok(pick.indexOf('pageLocked') < pick.indexOf('mapEl.scrollIntoView'));
		assert.match(pick, /if \(pageLocked\) return;/);

		// A gesture that starts at an end scrolls the page; the rest of a gesture
		// that already took the stage never does, even once it lands on the end.
		assert.match(client, /const WHEEL_GESTURE_IDLE_MS = 200;/);
		const wheel = client.slice(client.indexOf("'wheel',"), client.indexOf('let touchFrom'));
		assert.match(wheel, /if \(now >= wheelGestureUntil\) wheelHeld = false;/);
		assert.match(wheel, /wheelGestureUntil = now \+ WHEEL_GESTURE_IDLE_MS;/);
		assert.match(
			wheel,
			/if \(!canStep\(dir\)\) \{\s*if \(!wheelHeld\) \{\s*wheelAcc = 0;\s*return;\s*\}\s*event\.preventDefault\(\);/,
		);
		assert.match(wheel, /event\.preventDefault\(\);\s*wheelHeld = true;/);
		// One step per gesture: the accumulator empties and the 560ms lock arms.
		assert.match(
			wheel,
			/wheelAcc = 0;\s*lockDir = dir;\s*lockUntil = performance\.now\(\) \+ GESTURE_LOCK_MS;\s*stepStation\(dir\);/,
		);

		// A step rewrites the card; the page is not anchored to it, so keep the
		// stage free of scroll-controlling CSS beyond the gesture lock itself.
		const view = read('src/components/TrajectoryMap.astro');
		assert.doesNotMatch(view, /overflow-anchor/);
		assert.doesNotMatch(view, /scroll-snap-type|scroll-behavior: smooth/);
	});
});

describe('opening disc frame', () => {
	it('opens on the whole disc instead of the first stop arrival zoom', () => {
		const client = read('src/components/trajectory-map-client.ts');
		const seed = client.slice(
			client.indexOf('function seedOpeningView'),
			client.indexOf('seedOpeningView();'),
		);
		assert.ok(seed.length > 0);
		assert.match(seed, /openingFrame\(activePlaces\(\)\)/);
		assert.match(seed, /map\.fitBounds/);
		assert.match(seed, /maxZoom: VECTOR_BASEMAP\.frameMaxZoom/);
		// The lone-pin arrival zoom stays a fallback, never the first branch.
		assert.ok(seed.indexOf('map.fitBounds') < seed.indexOf('arrivalZoom('));
		assert.match(client, /function frameDiscOnce\(\): boolean/);
		assert.match(client, /fittedDisc === selectedDiscId/);
		assert.match(client, /frameDiscOnce\(\);/);
		assert.doesNotMatch(client, /if \(\s*playsOpeningOverview/);
	});

	it('sizes the teardrop head by density and keeps the point as the anchor', () => {
		assert.equal(PIN_DENSITY.sparse.restR * 2, 28);
		assert.equal(PIN_DENSITY.sparse.activeR * 2, 40);
		assert.equal(PIN_DENSITY.medium.restR * 2, 18);
		assert.equal(PIN_DENSITY.medium.activeR * 2, 24);
		assert.ok(PIN_DENSITY.medium.restMarkPx < PIN_DENSITY.medium.activeMarkPx);
		// Dense keeps the shell and drops the mark.
		assert.equal(PIN_DENSITY.dense.restR * 2, 12);
		assert.equal(PIN_DENSITY.dense.activeR * 2, 16);
		assert.equal(PIN_DENSITY.dense.activeMarkPx, 0);
		// Ultra is the smallest pin, still a pin.
		assert.equal(PIN_DENSITY.ultra.restR, 3.5);
		assert.equal(PIN_DENSITY.ultra.activeR, 5.5);
		// Sparse is the ceiling and the only tier that shows the largest mark.
		assert.equal(
			Math.max(...Object.values(PIN_DENSITY).map((style) => style.activeR)),
			PIN_DENSITY.sparse.activeR,
		);
		const client = read('src/components/trajectory-map-client.ts');
		const icon = client.slice(
			client.indexOf('function pinIcon'),
			client.indexOf('function paintPin'),
		);
		assert.ok(icon.length > 0);
		assert.match(icon, /className: 'traj-pin'/);
		assert.match(icon, /pinBodyHtml\(kind, mark\)/);
		assert.match(icon, /iconSize: \[size\.width, size\.height\]/);
		// The anchor is the point, never the head centre.
		assert.match(icon, /iconAnchor: \[size\.anchorX, size\.anchorY\]/);
		assert.doesNotMatch(client, /iconAnchor: \[box \/ 2, box \/ 2\]/);
		assert.match(client, /pinShellSize\(head\)/);
		// The head keeps the old rest / active diameter, so the tail is extra.
		const markers = client.slice(
			client.indexOf('function paintMarkers'),
			client.indexOf('function repaintMarkers'),
		);
		assert.ok(markers.length > 0);
		assert.match(markers, /const restHead = style\.restR \* 2;/);
		assert.match(markers, /const activeHead = style\.activeR \* 2;/);
		assert.match(client, /PIN_DENSITY\[tier\]/);
		assert.match(client, /map\.getZoom\(\) < GLYPH_MIN_ZOOM/);
		assert.doesNotMatch(client, /map\.getZoom\(\) < LOCAL_NEAR_ZOOM/);
		assert.equal(GLYPH_MIN_ZOOM, 4);
		// `LOCAL_NEAR_ZOOM` keeps only its near-cluster meaning.
		assert.equal(LOCAL_NEAR_ZOOM, 9);
		const view = read('src/components/TrajectoryMap.astro');
		assert.match(view, /\.traj \.traj-pin-mark/);
		// Guide and play take the vertical gesture on the canvas side too.
		assert.match(view, /\.traj-map:not\(\.is-explore\) \{\s*touch-action: pan-x !important;/);
		assert.match(view, /\.traj-map\.is-explore \{\s*touch-action: none;/);
	});

	it('picks the tier by count or by median pixel gap, sparse first', () => {
		const cases: Array<[number, number, PinDensityTier]> = [
			[0, 0, 'sparse'],
			[1, 0, 'sparse'],
			[PIN_DENSITY_SPARSE_N, 10, 'sparse'],
			[12, PIN_DENSITY_SPARSE_PX, 'sparse'],
			[PIN_DENSITY_SPARSE_N + 1, 80, 'medium'],
			[PIN_DENSITY_MEDIUM_N, 20, 'medium'],
			[20, PIN_DENSITY_MEDIUM_PX, 'medium'],
			[PIN_DENSITY_MEDIUM_N + 1, 40, 'dense'],
			[PIN_DENSITY_DENSE_N, 10, 'dense'],
			[25, PIN_DENSITY_DENSE_PX, 'dense'],
			[PIN_DENSITY_DENSE_N + 1, 10, 'ultra'],
			[40, 0, 'ultra'],
		];
		for (const [n, d, tier] of cases) {
			assert.equal(pinDensityTier(n, d), tier, `n=${n} d=${d}`);
		}
	});

	it('measures the median pairwise gap and lands the tier on one disc frame', () => {
		assert.equal(medianPairPx([]), 0);
		assert.equal(medianPairPx([{ x: 0, y: 0 }]), 0);
		assert.equal(medianPairPx([{ x: 0, y: 0 }, { x: 10, y: 0 }]), 10);
		// Three stops in a row: 10, 20, 10 -> the median of the three gaps.
		assert.equal(
			medianPairPx([
				{ x: 0, y: 0 },
				{ x: 10, y: 0 },
				{ x: 20, y: 0 },
			]),
			10,
		);
		// Four stops in a square: four edges of 10 against two diagonals of 10√2,
		// so the median gap is still the near edge.
		const square = medianPairPx([
			{ x: 0, y: 0 },
			{ x: 10, y: 0 },
			{ x: 0, y: 10 },
			{ x: 10, y: 10 },
		]);
		assert.equal(square, 10);
		assert.equal(pinDensityTier(4, square), 'medium');

		const client = read('src/components/trajectory-map-client.ts');
		assert.match(client, /function weakPinTier/);
		assert.match(client, /map\.getBounds\(\)/);
		assert.match(client, /bounds\.contains\(latLng\)/);
		assert.match(client, /PIN_DENSITY_PAIR_LIMIT/);
		assert.match(client, /medianPairPx\(points\)/);
		assert.match(client, /pinDensityTier\(count, median\)/);
		// Throttled re-measure on map events only: a drag mid-flight costs nothing.
		const schedule = client.slice(
			client.indexOf('function schedulePinDensity'),
			client.indexOf('function declutter'),
		);
		assert.ok(schedule.length > 0);
		assert.match(schedule, /PIN_DENSITY_THROTTLE_MS/);
		assert.match(schedule, /if \(weakPinTier\(\) === pinTier\) return;/);
		assert.ok(PIN_DENSITY_THROTTLE_MS >= 100);
		assert.match(client, /map\.on\('zoomend moveend resize', schedulePinDensity\)/);
		assert.doesNotMatch(client, /map\.on\('mousemove'/);
		assert.doesNotMatch(client, /requestAnimationFrame\([\s\S]{0,80}weakPinTier/);
		assert.ok(PIN_DENSITY_PAIR_LIMIT >= PIN_DENSITY_DENSE_N);
	});
});

describe('arrival fit zoom cap', () => {
	const client = read('src/components/trajectory-map-client.ts');
	const nearFit = client.slice(
		client.indexOf('function nearFitMaxZoom'),
		client.indexOf('function fitLocalNear'),
	);

	it('keeps guide and playback arrivals under the frame cap', () => {
		assert.ok(nearFit.length > 0);
		assert.match(nearFit, /viewMode === 'explore' \|\| interactions/);
		assert.match(nearFit, /\? VECTOR_BASEMAP\.maxZoom/);
		assert.match(nearFit, /: VECTOR_BASEMAP\.frameMaxZoom/);
		assert.equal(VECTOR_BASEMAP.frameMaxZoom, 5.6);
		assert.ok(
			VECTOR_BASEMAP.frameMaxZoom >= GLYPH_MIN_ZOOM,
			'the settle frame stays above the glyph soft floor',
		);
		// The near fit lands inside the arrival safe frame, not a symmetric pad.
		assert.match(
			client,
			/paddingTopLeft: L\.point\(pad\.topLeft\.x, pad\.topLeft\.y\),\s*paddingBottomRight: L\.point\(pad\.bottomRight\.x, pad\.bottomRight\.y\),\s*animate: false,\s*maxZoom: nearFitMaxZoom\(\)/,
		);
		assert.match(client, /magnetFitPadding\(magnetInsets\(window\.innerWidth\)\)/);
		assert.match(
			client,
			/const capped = Math\.min\(nearFitMaxZoom\(\), Math\.max\(VECTOR_BASEMAP\.minZoom, zoom\)\)/,
		);
	});

	it('leaves the camera alone when the arrival fit already landed', () => {
		const fit = client.slice(
			client.indexOf('function fitLocalNear'),
			client.indexOf('function localNearCamera'),
		);
		assert.ok(fit.length > 0);
		assert.match(fit, /FIT_EPS_ZOOM/);
		assert.match(fit, /FIT_EPS_PX/);
		assert.match(client, /const FIT_EPS_ZOOM = 0\.05/);
		assert.match(client, /const FIT_EPS_PX = 2/);
		const guardAt = fit.indexOf('FIT_EPS_ZOOM');
		const fitAt = fit.indexOf('map.fitBounds');
		assert.ok(fitAt > 0 && guardAt < fitAt, 'epsilon guard precedes fitBounds');
		assert.match(fit.slice(0, fitAt), /if \(landed\) return true/);
	});

	it('still lets explore pinch to the city cap and keeps the soft glyph floor', () => {
		assert.equal(VECTOR_BASEMAP.maxZoom, 12);
		assert.equal(GLYPH_MIN_ZOOM, 4);
		assert.match(client, /maxZoom: VECTOR_BASEMAP\.maxZoom,\n\t\tzoomSnap: 0/);
		assert.match(client, /map\.getZoom\(\) < GLYPH_MIN_ZOOM/);
		// No settle path still asks for the explore cap outright.
		assert.doesNotMatch(client, /zoom: Math\.min\(VECTOR_BASEMAP\.maxZoom/);
	});
});
