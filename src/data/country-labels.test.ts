import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { COUNTRY_NAMES_ZH } from './country-names-zh.ts';
import {
	COUNTRY_LABEL_CAP_DESKTOP,
	COUNTRY_LABEL_CAP_MOBILE,
	COUNTRY_LABEL_FADE_MS,
	COUNTRY_LABEL_FONT_STACK,
	COUNTRY_LABEL_HALO_PX,
	COUNTRY_LABEL_OMIT_IDS,
	COUNTRY_LABEL_ZOOM_MAX,
	COUNTRY_LABEL_ZOOM_MIN,
	countryLabelAnchor,
	countryLabelZoomVisible,
	countryNameZh,
	projectedCountrySize,
	selectCountryLabels,
	trackedTextWidth,
	type CountryLabelAnchor,
	type LabelCandidate,
} from './country-labels.ts';
import { BASEMAP_PAINT } from './map-tiles.ts';

function read(path: string): string {
	return readFileSync(path, 'utf8');
}

function candidate(id: number, area: number, x: number, extra: Partial<LabelCandidate> = {}): LabelCandidate {
	return {
		id,
		zh: '国',
		x,
		y: 100,
		projectedArea: area,
		projectedWidth: 200,
		textWidth: 20,
		textHeight: 10,
		...extra,
	};
}

const viewport = { x: 0, y: 0, w: 4000, h: 800 };

describe('chinese country names', () => {
	it('maps iso numeric ids to short chinese names and never to english', () => {
		assert.equal(countryNameZh(156), '中国');
		assert.equal(countryNameZh(826), '英国');
		assert.equal(countryNameZh(840), '美国');
		assert.equal(countryNameZh(276), '德国');
		assert.equal(countryNameZh(250), '法国');
		assert.equal(countryNameZh(999), undefined);
		assert.equal(COUNTRY_NAMES_ZH[840], '美国');
		const names = Object.values(COUNTRY_NAMES_ZH);
		assert.ok(names.length >= 55 && names.length <= 65);
		for (const name of names) assert.match(name, /^[\u4e00-\u9fff（）]+$/);
		for (const id of COUNTRY_LABEL_OMIT_IDS) {
			assert.equal(countryNameZh(id), undefined);
			assert.equal(COUNTRY_NAMES_ZH[id], undefined);
		}
	});

	it('rejects a row whose text is not the chinese table entry', () => {
		const placed: CountryLabelAnchor = {
			id: 840,
			zh: '美国',
			lng: -98.15,
			lat: 39.1,
			area: 800,
			ew: 50,
		};
		assert.deepEqual(countryLabelAnchor(placed), placed);
		assert.equal(countryLabelAnchor({ ...placed, zh: 'United States' }), null);
		assert.equal(countryLabelAnchor({ ...placed, zh: 'USA' }), null);
		assert.equal(countryLabelAnchor({ ...placed, id: 344, zh: '香港' }), null);
		assert.equal(countryLabelAnchor({ ...placed, id: 446, zh: '澳门' }), null);
		assert.equal(countryLabelAnchor({ ...placed, id: 158, zh: '台湾' }), null);
	});

	it('keeps generated anchors on the large landmass and omits 344, 446, and 158', () => {
		const labels = JSON.parse(read('public/maps/country-labels.json')) as CountryLabelAnchor[];
		const nameIds = Object.keys(COUNTRY_NAMES_ZH)
			.map(Number)
			.sort((a, b) => a - b);
		assert.deepEqual(
			labels.map((label) => label.id),
			nameIds,
		);
		const seen = new Set<number>();
		for (const label of labels) {
			assert.equal(seen.has(label.id), false);
			seen.add(label.id);
			assert.equal(label.zh, COUNTRY_NAMES_ZH[label.id]);
			assert.ok(label.ew > 0 && label.ew < 200);
			assert.equal(countryLabelAnchor(label)?.zh, label.zh);
		}
		for (const id of [344, 446, 158]) assert.equal(seen.has(id), false);
		const france = labels.find((label) => label.id === 250);
		const unitedStates = labels.find((label) => label.id === 840);
		const norway = labels.find((label) => label.id === 578);
		const china = labels.find((label) => label.id === 156);
		assert.ok(france && france.lng > 0 && france.lng < 6 && france.lat > 44 && france.lat < 49);
		assert.ok(unitedStates && unitedStates.lng < -90 && unitedStates.lng > -110);
		assert.ok(unitedStates.lat > 35 && unitedStates.lat < 45);
		assert.ok(norway && norway.lng > 5 && norway.lng < 20 && norway.lat > 59 && norway.lat < 68);
		assert.ok(china && china.lng > 100 && china.lng < 120 && china.lat > 28 && china.lat < 40);
		const australia = labels.filter((label) => label.id === 36);
		assert.equal(australia.length, 1);
		assert.ok(australia[0]!.ew > 20);
	});
});

describe('country label placement', () => {
	it('shows names only inside the zoom band', () => {
		const one = [candidate(250, 10, 100)];
		const place = (zoom: number) =>
			selectCountryLabels({ zoom, mobile: false, candidates: one, obstacles: [], paths: [], viewport });
		assert.equal(countryLabelZoomVisible(COUNTRY_LABEL_ZOOM_MIN), true);
		assert.equal(countryLabelZoomVisible(COUNTRY_LABEL_ZOOM_MAX), true);
		assert.equal(countryLabelZoomVisible(2.49), false);
		assert.equal(countryLabelZoomVisible(6.01), false);
		assert.equal(place(2.49).length, 0);
		assert.equal(place(2.5).length, 1);
		assert.equal(place(6).length, 1);
		assert.equal(place(6.01).length, 0);
		assert.equal(place(2).length, 0);
		assert.equal(place(12).length, 0);
	});

	it('caps a desktop viewport at 12, preferring the larger projected area', () => {
		const candidates = Array.from({ length: 15 }, (_, index) => candidate(1000 + index, index + 1, 40 + index * 40));
		const selected = selectCountryLabels({
			zoom: 4,
			mobile: false,
			candidates,
			obstacles: [],
			paths: [],
			viewport,
		});
		assert.equal(COUNTRY_LABEL_CAP_DESKTOP, 12);
		assert.equal(selected.length, 12);
		assert.deepEqual(
			selected.map((label) => label.id),
			[1014, 1013, 1012, 1011, 1010, 1009, 1008, 1007, 1006, 1005, 1004, 1003],
		);
	});

	it('caps a phone viewport at 8', () => {
		const candidates = Array.from({ length: 15 }, (_, index) => candidate(1000 + index, index + 1, 40 + index * 40));
		const selected = selectCountryLabels({
			zoom: 4,
			mobile: true,
			candidates,
			obstacles: [],
			paths: [],
			viewport,
		});
		assert.equal(COUNTRY_LABEL_CAP_MOBILE, 8);
		assert.equal(selected.length, 8);
		assert.equal(selected[0]?.id, 1014);
		assert.equal(selected[7]?.id, 1007);
	});

	it('drops a narrow landmass, a colliding smaller name, padded obstacles, and the omitted ids', () => {
		const narrow = selectCountryLabels({
			zoom: 4,
			mobile: false,
			candidates: [candidate(250, 10, 100, { projectedWidth: 31, textWidth: 20 })],
			obstacles: [],
			paths: [],
			viewport,
		});
		assert.equal(narrow.length, 0);
		const wideEnough = selectCountryLabels({
			zoom: 4,
			mobile: false,
			candidates: [candidate(250, 10, 100, { projectedWidth: 32, textWidth: 20 })],
			obstacles: [],
			paths: [],
			viewport,
		});
		assert.equal(wideEnough.length, 1);

		const overlap = selectCountryLabels({
			zoom: 4,
			mobile: false,
			candidates: [candidate(250, 10, 100), candidate(276, 50, 100)],
			obstacles: [],
			paths: [],
			viewport,
		});
		assert.deepEqual(
			overlap.map((label) => label.id),
			[276],
		);

		const clearOfMarker = selectCountryLabels({
			zoom: 4,
			mobile: false,
			candidates: [candidate(250, 10, 100)],
			obstacles: [{ x: 118, y: 95, w: 10, h: 10 }],
			paths: [],
			viewport,
		});
		assert.equal(clearOfMarker.length, 1);
		const hitsMarker = selectCountryLabels({
			zoom: 4,
			mobile: false,
			candidates: [candidate(250, 10, 100)],
			obstacles: [{ x: 117, y: 95, w: 10, h: 10 }],
			paths: [],
			viewport,
		});
		assert.equal(hitsMarker.length, 0);

		const hitsPath = selectCountryLabels({
			zoom: 4,
			mobile: false,
			candidates: [candidate(250, 10, 100)],
			obstacles: [],
			paths: [[{ x: 0, y: 100 }, { x: 400, y: 100 }]],
			viewport,
		});
		assert.equal(hitsPath.length, 0);

		for (const id of [344, 446, 158]) {
			const omitted = selectCountryLabels({
				zoom: 4,
				mobile: false,
				candidates: [candidate(id, 1_000_000, 100)],
				obstacles: [],
				paths: [],
				viewport,
			});
			assert.deepEqual(omitted, []);
		}
	});

	it('scales projected width with zoom and gives higher latitudes more area', () => {
		const low = projectedCountrySize(100, 10, 0, 2);
		const highZoom = projectedCountrySize(100, 10, 0, 3);
		const north = projectedCountrySize(100, 10, 60, 2);
		assert.ok(Math.abs(highZoom.width / low.width - 2) < 1e-9);
		assert.ok(north.area > low.area);
		assert.equal(trackedTextWidth([13, 13], 13), 26 + 13 * 0.15);
	});
});

describe('country label paint', () => {
	it('uses the coast label token, the body chinese stack, and a fixed size', () => {
		assert.equal(BASEMAP_PAINT.label, 'rgba(143,133,113,.55)');
		assert.equal(BASEMAP_PAINT.coast, '#8f8571');
		assert.equal(COUNTRY_LABEL_HALO_PX, 2);
		assert.equal(COUNTRY_LABEL_FADE_MS, 150);
		const css = read('src/styles/global.css').replace(/\s+/g, ' ');
		assert.match(css, new RegExp(COUNTRY_LABEL_FONT_STACK.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
		const client = read('src/components/trajectory-map-client.ts');
		assert.match(client, /createPane\('labelPane'\)/);
		assert.match(client, /labelPane\.style\.zIndex = '380'/);
		assert.match(client, /pointerEvents = 'none'/);
		assert.match(client, /map\.on\('moveend zoomend viewreset resize', scheduleCountryLabels\)/);
		assert.match(client, /requestAnimationFrame/);
		assert.match(client, /opacity \$\{COUNTRY_LABEL_FADE_MS\}ms linear/);
		assert.match(client, /BASEMAP_PAINT\.label/);
		assert.match(client, /BASEMAP_PAINT\.land/);
		assert.match(client, /lineJoin = 'round'/);
		assert.match(client, /countryLabelFontSize/);
		assert.doesNotMatch(client, /fontSize \* .*zoom|zoom \* .*fontSize/);
		assert.doesNotMatch(client, /tileLayer|openstreetmap/i);
		assert.match(client, /VECTOR_BASEMAP\.countriesUrl/);
		assert.match(client, /VECTOR_BASEMAP\.labelsUrl/);
	});

	it('hides names for the cruise and does not bake them into the freeze copy', () => {
		const client = read('src/components/trajectory-map-client.ts');
		const body = (name: string): string => {
			const start = client.indexOf(`function ${name}(`);
			assert.ok(start >= 0, name);
			const next = client.indexOf('\n\tfunction ', start + 1);
			return client.slice(start, next === -1 ? client.length : next);
		};
		assert.match(body('cameraStart'), /hideCountryLabels\(\)/);
		assert.match(body('showFrozenSheet'), /hideCountryLabels\(\)/);
		const copy = body('copySheet');
		assert.match(copy, /drawImage\(source, 0, 0\)/);
		assert.doesNotMatch(copy, /fillText|labelCanvas|labelPane|strokeText/);
		const draw = body('drawCountryLabels');
		assert.doesNotMatch(draw, /L\.marker|L\.divIcon|L\.circleMarker/);
		assert.match(draw, /if \(labelsHeld\(\)\) return/);
		const fly = client.slice(client.indexOf('async function flyTo'), client.indexOf('async function playFrom'));
		const cruiseAt = fly.indexOf('await animate');
		const thawAt = fly.indexOf('thawSheet(mine)', cruiseAt);
		assert.ok(cruiseAt >= 0 && thawAt > cruiseAt);
		assert.doesNotMatch(fly.slice(cruiseAt, thawAt), /fillText|strokeText|drawCountryLabels|paintCountryLabels/);
	});
});
