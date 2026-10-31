/**
 * Leaflet driver for the shared trajectory map.
 * Loaded only from the map component, never from the site layout.
 *
 * Timing (dwell, settle, ocean legs, reduced motion) stays in trajectory-camera.
 * The sheet under the route is local Natural Earth, fetched from public/maps.
 * Faint Chinese country names sit on their own canvas, above that sheet and
 * below the route. They are not baked into the ocean freeze bitmap.
 */
import L from 'leaflet';
import { feature, mesh } from 'topojson-client';
import type { GeometryObject, Topology } from 'topojson-specification';
import {
	COUNTRY_LABEL_FADE_MS,
	COUNTRY_LABEL_FONT_STACK,
	COUNTRY_LABEL_HALO_PX,
	COUNTRY_LABEL_MOBILE_QUERY,
	COUNTRY_LABEL_TRACKING,
	COUNTRY_LABEL_WEIGHT,
	countryLabelAnchor,
	countryLabelFontSize,
	countryLabelZoomVisible,
	projectedCountrySize,
	selectCountryLabels,
	trackedTextWidth,
	type CountryLabelAnchor,
	type LabelCandidate,
	type ScreenRect,
} from '../data/country-labels';
import { BASEMAP_PAINT, PATH_STROKE, VECTOR_BASEMAP, arrivalZoom } from '../data/map-tiles';
import {
	KM_SHORT,
	SETTLE_MS,
	arcVertexCount,
	cruiseZoom,
	dwellMs,
	easeInOut,
	haversineKm,
	isOceanLeg,
	legFlyMs,
	legZoom,
	groupOverviewPins,
	roleLabel,
	settleMs,
	sheetCruiseAction,
	sheetSnapshotFrame,
	slerpLngLat,
	weakSegments,
	yearText,
	type LngLat,
} from '../data/trajectory-camera';
import {
	CHRONO_ACTIVE_MS,
	CHRONO_BEAD_PX,
	CHRONO_EDGE_OVERLAP_MS,
	CHRONO_HALO_MS,
	chronoEdgeStyle,
	chronoHaloFrame,
	chronoMarkerPhase,
	chronoMarkerStyle,
	chronoSegmentMs,
	chronoStations,
	dedupedStationCount,
	type ChronoStation,
} from '../data/trajectory-chrono';
import {
	oceanLegPhrase,
	oceanPhraseVisible,
	openingFrame,
	openingOverviewMs,
	playsOpeningOverview,
	viewportPlayAction,
} from '../data/trajectory-guide';

type Place = {
	id: string;
	year: number;
	yearLabel?: string;
	cityZh: string;
	city: string;
	role: string;
	lon: number;
	lat: number;
	zoom?: number;
	blurb?: string;
	eventId?: string;
};

type Disc = {
	id: string;
	href: string;
	work: string;
	catalogNumber: string;
	titleZh: string;
	places: Place[];
};

type Payload = {
	mode: 'embed' | 'overview';
	discs: Disc[];
};

type Mode = 'idle' | 'play' | 'paused' | 'done';
type ViewMode = 'guide' | 'explore' | 'chrono';

type StopRef = { discId: string; index: number };

type Dot = {
	stops: StopRef[];
	place: Place;
	marker: L.CircleMarker;
	pulse: L.Marker;
};

/** Leaflet 1.9.4 camera hooks. flyTo drives the map with these, not setView. */
type CameraMap = L.Map & {
	_zoom: number;
	_pixelOrigin: L.Point;
	_lastCenter: L.LatLng | null;
	_moveStart(zoomChanged: boolean, noMoveStart?: boolean): L.Map;
	_move(center: L.LatLng, zoom?: number, data?: { flyTo?: boolean }, supressEvent?: boolean): L.Map;
	_moveEnd(zoomChanged: boolean): L.Map;
	_stop(): L.Map;
	_getNewPixelOrigin(center: L.LatLng, zoom?: number): L.Point;
};

type SheetRenderer = L.Layer & { _redrawRequest?: number | null; _container?: HTMLElement };

type PreparedSheet = {
	canvas: HTMLCanvasElement;
	bounds: L.LatLngBounds;
	zoom: number;
	overlay: L.Layer | null;
};

function reduceMotion(): boolean {
	return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function arc(a: LngLat, b: LngLat, steps = 48): [number, number][] {
	const line: [number, number][] = [];
	for (let i = 0; i <= steps; i++) {
		const point = slerpLngLat(a, b, i / steps);
		line.push([point.lat, point.lon]);
	}
	return line;
}

function routeLatLngs(places: readonly Place[]): [number, number][] {
	const first = places[0];
	if (!first) return [];
	if (places.length === 1) return [[first.lat, first.lon]];
	const coords: [number, number][] = [];
	for (let i = 1; i < places.length; i++) {
		const from = places[i - 1];
		const to = places[i];
		if (!from || !to) continue;
		const seg = arc(from, to);
		if (coords.length > 0) seg.shift();
		coords.push(...seg);
	}
	return coords;
}

function graticule(): GeoJSON.FeatureCollection {
	const features: GeoJSON.Feature[] = [];
	for (let lon = -180; lon <= 180; lon += 15) {
		const coordinates: [number, number][] = [];
		for (let lat = -80; lat <= 80; lat += 2) coordinates.push([lon, lat]);
		features.push({
			type: 'Feature',
			properties: {},
			geometry: { type: 'LineString', coordinates },
		});
	}
	for (let lat = -75; lat <= 75; lat += 15) {
		const coordinates: [number, number][] = [];
		for (let lon = -180; lon <= 180; lon += 2) coordinates.push([lon, lat]);
		features.push({
			type: 'Feature',
			properties: {},
			geometry: { type: 'LineString', coordinates },
		});
	}
	return { type: 'FeatureCollection', features };
}

function asTopology(value: unknown): Topology | null {
	if (!value || typeof value !== 'object') return null;
	const topo = value as Topology;
	if (topo.type !== 'Topology' || !topo.objects) return null;
	return topo;
}

function mount(root: HTMLElement): void {
	const raw = root.getAttribute('data-payload');
	const mapQuery = root.querySelector<HTMLElement>('[data-traj-map]');
	if (!raw || !mapQuery) return;
	const mapEl: HTMLElement = mapQuery;
	let payload: Payload;
	try {
		payload = JSON.parse(raw) as Payload;
	} catch {
		return;
	}
	if (!payload.discs?.length || !payload.discs[0]?.places?.length) return;

	const fallback = root.querySelector<HTMLElement>('[data-traj-fallback]');
	if (fallback) fallback.hidden = true;

	const playBtn = root.querySelector<HTMLButtonElement>('[data-traj-play]');
	const replayBtn = root.querySelector<HTMLButtonElement>('[data-traj-replay]');
	const prevBtn = root.querySelector<HTMLButtonElement>('[data-traj-prev]');
	const nextBtn = root.querySelector<HTMLButtonElement>('[data-traj-next]');
	const exploreBtn = root.querySelector<HTMLButtonElement>('[data-traj-explore]');
	const guideBtn = root.querySelector<HTMLButtonElement>('[data-traj-guide]');
	const chronoBtn = root.querySelector<HTMLButtonElement>('[data-traj-chrono]');
	const card = root.querySelector<HTMLElement>('[data-traj-card]');
	const progressEl = root.querySelector<HTMLElement>('[data-traj-progress]');
	const idxEl = root.querySelector<HTMLElement>('[data-traj-idx]');
	const metaEl = root.querySelector<HTMLElement>('[data-traj-meta]');
	const cityEl = root.querySelector<HTMLElement>('[data-traj-city]');
	const enEl = root.querySelector<HTMLElement>('[data-traj-en]');
	const blurbEl = root.querySelector<HTMLElement>('[data-traj-blurb]');
	const bearingEl = root.querySelector<HTMLElement>('[data-traj-bearing]');
	const workEl = root.querySelector<HTMLElement>('[data-traj-work]');
	const openEl = root.querySelector<HTMLAnchorElement>('[data-traj-open]');

	const discs = new Map(payload.discs.map((disc) => [disc.id, disc]));
	const overview = payload.mode === 'overview';
	const deep = placeFromHash();
	let selectedDiscId: string | null = overview ? null : payload.discs[0]!.id;
	let currentIndex = 0;
	let viewMode: ViewMode = 'guide';
	if (deep) {
		selectedDiscId = deep.discId;
		currentIndex = deep.index;
		viewMode = 'explore';
	} else if (overview) {
		viewMode = 'explore';
	}
	let mode: Mode = 'idle';
	let playToken = 0;
	let narrGen = 0;
	let shownKey = '';
	let userTookOver = false;
	let started = false;
	let interactions = false;
	let pausedByViewport = false;
	let flying = false;
	let flight = 0;
	let cameraOwner = 0;
	let freezeEpoch = 0;
	let labelHold = 0;
	let chronoIndex = 0;
	let chronoU = 0;
	let chronoPhase: 'hold' | 'crawl' = 'hold';
	let haloToken = 0;
	let catalogFitted = false;
	let sheetFreeze: PreparedSheet | null = null;
	let restoreAddLayer: (() => void) | null = null;
	let sheetSnap: { zoom: number; origin: L.Point; center: L.LatLng } | null = null;
	let sheetLayers: L.Layer[] = [];

	const activePlaces = () => (selectedDiscId ? (discs.get(selectedDiscId)?.places ?? []) : []);
	const catalogPoints = () =>
		payload.discs.flatMap((disc) =>
			disc.places.map((place) => ({
				city: place.city,
				lon: place.lon,
				lat: place.lat,
				...(place.eventId ? { eventId: place.eventId } : {}),
			})),
		);

	// Leaflet clips canvas paths when the map gains its first view. Lines added
	// before that, then sent to the back, throw. Frame the opening stop first.
	const openingPlace = selectedDiscId ? (activePlaces()[currentIndex] ?? activePlaces()[0]) : undefined;

	const map = L.map(mapEl, {
		minZoom: VECTOR_BASEMAP.minZoom,
		maxZoom: VECTOR_BASEMAP.maxZoom,
		zoomSnap: 0,
		zoomDelta: 0.5,
		zoomAnimation: false,
		fadeAnimation: false,
		markerZoomAnimation: false,
		inertia: true,
		zoomControl: false,
		attributionControl: true,
		dragging: false,
		touchZoom: false,
		scrollWheelZoom: false,
		doubleClickZoom: false,
		boxZoom: false,
		keyboard: false,
		worldCopyJump: false,
	});
	L.control.zoom({ position: 'topright' }).addTo(map);
	map.attributionControl?.setPrefix(false);
	map.attributionControl?.addAttribution(VECTOR_BASEMAP.attribution);
	if (openingPlace) {
		map.setView([openingPlace.lat, openingPlace.lon], arrivalZoom(openingPlace.zoom), {
			animate: false,
		});
	} else {
		const seed = payload.discs.flatMap((disc) => disc.places)[0];
		if (seed) map.setView([seed.lat, seed.lon], 2, { animate: false });
	}

	const basemapPane = map.createPane('basemap');
	basemapPane.style.zIndex = '350';
	const labelPane = map.createPane('labelPane');
	labelPane.style.zIndex = '380';
	labelPane.style.pointerEvents = 'none';
	const labelCanvas = document.createElement('canvas');
	labelCanvas.className = 'traj-country-labels';
	labelCanvas.setAttribute('aria-hidden', 'true');
	labelCanvas.style.pointerEvents = 'none';
	labelCanvas.style.opacity = '1';
	labelPane.appendChild(labelCanvas);
	const countryLabels: CountryLabelAnchor[] = [];
	let labelFrame = 0;
	const camera = map as CameraMap;
	const baseRenderer = L.canvas({ pane: 'basemap', padding: 0.6 });
	const drawRenderer = L.canvas({ padding: 0.5 });

	void loadBasemap();
	void loadCountryLabels();

	if (payload.mode === 'overview') {
		const points = payload.discs.flatMap((disc) =>
			disc.places.map((place) => ({
				recordId: disc.id,
				placeId: place.id,
				city: place.city,
				lon: place.lon,
				lat: place.lat,
				...(place.eventId ? { eventId: place.eventId } : {}),
			})),
		);
		for (const [a, b] of weakSegments(points)) {
			if (haversineKm(a, b) < 1) continue;
			const link = L.polyline(arc(a, b), {
				renderer: drawRenderer,
				color: PATH_STROKE.selected,
				weight: PATH_STROKE.weakWeight,
				opacity: PATH_STROKE.weakOpacity,
				dashArray: PATH_STROKE.weakDash,
				interactive: false,
			}).addTo(map);
			link.bringToBack();
		}
	}

	const dimGroup = L.layerGroup().addTo(map);
	const ghost = L.polyline([], {
		renderer: drawRenderer,
		color: PATH_STROKE.selected,
		weight: 1.7,
		opacity: 0.85,
		interactive: false,
	}).addTo(map);
	const progress = L.polyline([], {
		renderer: drawRenderer,
		color: PATH_STROKE.selected,
		weight: 1.8,
		opacity: 0.9,
		lineCap: 'round',
		lineJoin: 'round',
		interactive: false,
	}).addTo(map);
	const chronoPast = L.layerGroup().addTo(map);
	const chronoRemain = L.polyline([], {
		renderer: drawRenderer,
		color: PATH_STROKE.selected,
		weight: 1.15,
		opacity: 0.32,
		dashArray: '2 6',
		interactive: false,
	}).addTo(map);
	const chronoTraveled = L.polyline([], {
		renderer: drawRenderer,
		color: PATH_STROKE.selected,
		weight: 1.8,
		opacity: 0.9,
		interactive: false,
	}).addTo(map);
	const chronoHalo = L.circleMarker([0, 0], {
		renderer: drawRenderer,
		radius: 0,
		stroke: false,
		fillColor: PATH_STROKE.selected,
		fillOpacity: 0,
		interactive: false,
	}).addTo(map);

	const dots: Dot[] = [];
	const flatStops = payload.discs.flatMap((disc) =>
		disc.places.map((place, index) => ({
			discId: disc.id,
			index,
			place,
			eventId: place.eventId,
		})),
	);
	const pinGroups =
		payload.mode === 'overview'
			? groupOverviewPins(flatStops)
			: flatStops.map((stop) => ({ pin: stop, members: [stop] }));
	for (const group of pinGroups) {
		const place = group.pin.place;
		const marker = L.circleMarker([place.lat, place.lon], {
			renderer: drawRenderer,
			radius: 3.5,
			color: '#ffffff',
			weight: 1.2,
			fillColor: BASEMAP_PAINT.route,
			fillOpacity: 0.45,
		});
		marker.bindTooltip(place.cityZh, {
			permanent: true,
			direction: 'right',
			offset: [8, 0],
			className: 'traj-tip',
			opacity: 1,
		});
		marker.on('click', () => {
			const onActive = group.members.find((member) => member.discId === selectedDiscId);
			const target = onActive ?? group.members[0];
			if (!target) return;
			void focusPlace(target.discId, target.index);
		});
		marker.addTo(map);
		const pulse = L.marker([place.lat, place.lon], {
			interactive: false,
			keyboard: false,
			icon: L.divIcon({
				className: 'traj-pulse-icon',
				html: '<div class="traj-pulse"></div>',
				iconSize: [22, 22],
				iconAnchor: [11, 11],
			}),
		}).addTo(map);
		dots.push({
			stops: group.members.map((member) => ({ discId: member.discId, index: member.index })),
			place,
			marker,
			pulse,
		});
	}

	const chronoBead = L.circleMarker([0, 0], {
		renderer: drawRenderer,
		radius: CHRONO_BEAD_PX / 2,
		color: '#ffffff',
		weight: 1,
		fillColor: PATH_STROKE.selected,
		fillOpacity: 0,
		interactive: false,
	}).addTo(map);

	function listChrono(): ChronoStation<Place>[] {
		return chronoStations(payload.discs, selectedDiscId);
	}

	function inkSelected(): boolean {
		return viewMode !== 'chrono' && selectedDiscId !== null;
	}

	function clearChronoDraw(): void {
		haloToken += 1;
		chronoPast.clearLayers();
		chronoTraveled.setLatLngs([]);
		chronoRemain.setLatLngs([]);
		chronoHalo.setRadius(0);
		chronoHalo.setStyle({ fillOpacity: 0 });
		chronoBead.setStyle({ fillOpacity: 0 });
	}

	/** A places-array neighbor is already on the disc's pencil path. */
	function edgeAlreadyPenciled(from: ChronoStation<Place>, to: ChronoStation<Place>): boolean {
		return from.discId === to.discId && Math.abs(from.index - to.index) === 1;
	}

	/** After the bead passes, the edge falls back to pencil. Cross-disc stays a faint dashed cut. */
	function rememberChronoEdge(from: ChronoStation<Place>, to: ChronoStation<Place>): void {
		if (edgeAlreadyPenciled(from, to)) return;
		const cross = from.discId !== to.discId;
		const style = cross ? chronoEdgeStyle(true, false) : chronoEdgeStyle(false, false);
		const line = L.polyline(arc(from.place, to.place, 48), {
			renderer: drawRenderer,
			color: cross ? PATH_STROKE.selected : PATH_STROKE.faint,
			opacity: style.opacity,
			weight: style.weight,
			dashArray: style.dash ?? '',
			interactive: false,
		});
		line.addTo(chronoPast);
	}

	function redrawGhost(): void {
		ghost.setLatLngs(inkSelected() ? routeLatLngs(activePlaces()) : []);
		if (!inkSelected()) progress.setLatLngs([]);
		dimGroup.clearLayers();
		if (!overview && viewMode !== 'chrono') return;
		for (const disc of payload.discs) {
			if (disc.places.length < 2) continue;
			if (inkSelected() && disc.id === selectedDiscId) continue;
			const line = L.polyline(routeLatLngs(disc.places), {
				renderer: drawRenderer,
				color: PATH_STROKE.faint,
				weight: PATH_STROKE.faintWeight,
				opacity: PATH_STROKE.faintOpacity,
				dashArray: PATH_STROKE.faintDash,
				interactive: false,
			}).addTo(dimGroup);
			line.bringToBack();
		}
	}

	function setProgress(index: number, tip: LngLat): void {
		const places = activePlaces();
		const coords: [number, number][] = [];
		for (let i = 1; i < index; i++) {
			const from = places[i - 1];
			const to = places[i];
			if (!from || !to) continue;
			const seg = arc(from, to);
			if (coords.length > 0) seg.shift();
			coords.push(...seg);
		}
		const prev = index > 0 ? places[index - 1] : undefined;
		if (prev) {
			const seg = arc(prev, tip, 24);
			if (coords.length > 0) seg.shift();
			coords.push(...seg);
		} else {
			coords.push([tip.lat, tip.lon]);
		}
		progress.setLatLngs(coords);
	}

	function showPanel(): void {
		root.querySelectorAll<HTMLElement>('[data-traj-disc-panel]').forEach((panel) => {
			panel.hidden = selectedDiscId !== null && panel.dataset.trajDiscPanel !== selectedDiscId;
		});
	}

	function paintDiscChips(): void {
		root.querySelectorAll<HTMLButtonElement>('[data-traj-switch]').forEach((button) => {
			button.setAttribute('aria-pressed', button.dataset.trajSwitch === selectedDiscId ? 'true' : 'false');
		});
		root.querySelector<HTMLButtonElement>('[data-traj-all]')?.setAttribute(
			'aria-pressed',
			selectedDiscId === null ? 'true' : 'false',
		);
	}

	function rebuildProgress(count: number): void {
		if (!progressEl) return;
		progressEl.replaceChildren();
		for (let i = 0; i < count; i++) {
			const span = document.createElement('span');
			span.append(document.createElement('i'));
			progressEl.append(span);
		}
	}

	function paintChronoMarkers(active: number): void {
		const phaseOf = new Map<string, ReturnType<typeof chronoMarkerPhase>>();
		listChrono().forEach((station, index) => {
			phaseOf.set(`${station.discId}:${station.index}`, chronoMarkerPhase(index, active));
		});
		const rank = (phase: ReturnType<typeof chronoMarkerPhase>) =>
			phase === 'active' ? 2 : phase === 'visited' ? 1 : 0;
		for (const dot of dots) {
			let phase: ReturnType<typeof chronoMarkerPhase> = 'pending';
			for (const stop of dot.stops) {
				const next = phaseOf.get(`${stop.discId}:${stop.index}`) ?? 'pending';
				if (rank(next) > rank(phase)) phase = next;
			}
			const style = chronoMarkerStyle(phase);
			dot.marker.setStyle({
				radius: style.radius,
				fillOpacity: style.fillOpacity,
				weight: phase === 'active' ? 1.6 : 1.2,
				fillColor: style.fill === 'brick' ? BASEMAP_PAINT.route : BASEMAP_PAINT.coast,
				color: '#ffffff',
			});
			const on = phase === 'active';
			dot.marker.getTooltip()?.getElement()?.classList.toggle('is-on', on);
			dot.pulse.getElement()?.querySelector('.traj-pulse')?.classList.remove('is-on');
		}
	}

	function paintMarkers(index: number): void {
		if (viewMode === 'chrono') {
			paintChronoMarkers(chronoIndex);
			return;
		}
		const catalog = selectedDiscId === null;
		for (const dot of dots) {
			const onDisc = !catalog && dot.stops.some((stop) => stop.discId === selectedDiscId);
			const on = dot.stops.some((stop) => stop.discId === selectedDiscId && stop.index === index);
			const done = dot.stops.some((stop) => stop.discId === selectedDiscId && stop.index <= index);
			dot.marker.setStyle({
				radius: on ? 5.5 : 3.5,
				fillOpacity: catalog ? 0.55 : !onDisc ? 0.45 : done ? 1 : 0.45,
				weight: on ? 1.6 : 1.2,
				fillColor: BASEMAP_PAINT.route,
			});
			dot.marker.getTooltip()?.getElement()?.classList.toggle('is-on', on);
			dot.pulse.getElement()?.querySelector('.traj-pulse')?.classList.toggle('is-on', on);
		}
	}

	function declutter(): void {
		if (flying) return;
		const chronoStation = viewMode === 'chrono' ? listChrono()[chronoIndex] : undefined;
		const active = chronoStation
			? dots.find((dot) =>
					dot.stops.some((stop) => stop.discId === chronoStation.discId && stop.index === chronoStation.index),
				)
			: dots.find((dot) =>
					dot.stops.some((stop) => stop.discId === selectedDiscId && stop.index === currentIndex),
				);
		const order = active ? [active, ...dots.filter((dot) => dot !== active)] : dots;
		const shown: L.Point[] = [];
		for (const dot of order) {
			const pt = map.latLngToContainerPoint([dot.place.lat, dot.place.lon]);
			const el = dot.marker.getTooltip()?.getElement();
			if (!el) continue;
			const hide = shown.some((kept) => kept.distanceTo(pt) < 44);
			el.classList.toggle('is-hide', hide);
			if (!hide) shown.push(pt);
		}
	}

	function clearBearing(): void {
		if (bearingEl) {
			bearingEl.hidden = true;
			bearingEl.textContent = '';
		}
		card?.classList.remove('is-bearing');
	}

	/** Ocean phrase sits in the narration column, never on the sheet. */
	function showBearing(phrase: string): void {
		if (!bearingEl) return;
		bearingEl.textContent = phrase;
		bearingEl.hidden = false;
		card?.classList.add('is-bearing');
		card?.classList.remove('is-out');
	}

	function fitActiveDisc(): void {
		const frame = openingFrame(activePlaces());
		if (!frame) return;
		const size = map.getSize();
		if (size.x < 20 || size.y < 20) return;
		map.fitBounds(L.latLngBounds([frame.south, frame.west], [frame.north, frame.east]), {
			padding: [72, 40],
			animate: false,
		});
	}

	function fitAllPlaces(): void {
		const places = payload.discs.flatMap((disc) => disc.places);
		const size = map.getSize();
		if (size.x < 20 || size.y < 20 || places.length === 0) return;
		const bounds = L.latLngBounds(places.map((place) => [place.lat, place.lon]));
		map.fitBounds(bounds, { padding: [48, 48], animate: false, maxZoom: 4 });
	}

	function fitOverviewOnce(): void {
		if (!overview || deep || catalogFitted || viewMode !== 'explore') return;
		if (map.getSize().x < 20) return;
		catalogFitted = true;
		if (selectedDiscId) fitActiveDisc();
		else fitAllPlaces();
	}

	function paintPlaceChrome(discId: string, place: Place): void {
		root.querySelectorAll<HTMLButtonElement>('[data-traj-place]').forEach((button) => {
			const on = button.dataset.disc === discId && button.dataset.trajPlace === place.id;
			button.closest('li')?.classList.toggle('is-on', on);
			if (on) button.setAttribute('aria-current', 'step');
			else button.removeAttribute('aria-current');
		});
		paintDiscChips();
	}

	function paintNarration(place: Place, index: number): void {
		clearBearing();
		const places = activePlaces();
		const disc = selectedDiscId ? discs.get(selectedDiscId) : undefined;
		currentIndex = index;
		if (idxEl) {
			idxEl.textContent = `${String(index + 1).padStart(2, '0')} / ${String(places.length).padStart(2, '0')}`;
		}
		if (metaEl) metaEl.textContent = `${yearText(place)} · ${roleLabel(place.role)}`;
		if (cityEl) cityEl.textContent = place.cityZh;
		if (enEl) enEl.textContent = place.city;
		if (blurbEl) {
			blurbEl.textContent = place.blurb ?? '';
			blurbEl.hidden = !place.blurb;
		}
		if (workEl && disc) workEl.textContent = disc.work;
		if (openEl && disc) {
			openEl.hidden = false;
			openEl.href = disc.href;
			openEl.textContent = `打开 ${disc.catalogNumber}`;
		}
		mapEl.setAttribute('aria-label', `${places.length} 个地点的轨迹地图`);
		if (progressEl && progressEl.childElementCount !== places.length) rebuildProgress(places.length);
		progressEl?.querySelectorAll('span').forEach((span, bar) => {
			span.className = bar < index ? 'is-done' : bar === index ? 'is-cur' : '';
		});
		if (selectedDiscId) paintPlaceChrome(selectedDiscId, place);
		paintMarkers(index);
		declutter();
	}

	/** Empty card for a catalog with no disc selected. */
	function paintCatalog(): void {
		clearBearing();
		const n = dedupedStationCount(catalogPoints());
		if (idxEl) idxEl.textContent = '';
		if (metaEl) metaEl.textContent = `全馆 · ${n} 站`;
		if (cityEl) cityEl.textContent = '点选站点或一张唱片';
		if (enEl) enEl.textContent = '';
		if (blurbEl) {
			blurbEl.textContent = '';
			blurbEl.hidden = true;
		}
		if (workEl) workEl.textContent = '全馆';
		if (openEl) openEl.hidden = true;
		mapEl.setAttribute('aria-label', `${n} 个地点的轨迹地图`);
		progressEl?.replaceChildren();
		root.querySelectorAll<HTMLButtonElement>('[data-traj-place]').forEach((button) => {
			button.closest('li')?.classList.remove('is-on');
			button.removeAttribute('aria-current');
		});
		paintDiscChips();
		paintMarkers(-1);
		shownKey = '';
		declutter();
	}

	function fadeOut(): void {
		if (reduceMotion()) return;
		card?.classList.add('is-out');
	}

	function showNarration(place: Place, index: number, token: number): Promise<boolean> {
		const gen = ++narrGen;
		const wait = !reduceMotion() && card?.classList.contains('is-out') ? SETTLE_MS / 2 : 0;
		return new Promise((resolve) => {
			window.setTimeout(() => {
				if (gen !== narrGen || token !== playToken) {
					resolve(false);
					return;
				}
				paintNarration(place, index);
				card?.classList.remove('is-out');
				shownKey = `${selectedDiscId}:${place.id}`;
				resolve(true);
			}, wait);
		});
	}

	function updateButtons(): void {
		if (playBtn) {
			const playing = mode === 'play';
			playBtn.setAttribute('aria-pressed', playing ? 'true' : 'false');
			playBtn.textContent = playing ? '❚❚ 暂停' : '▶ 播放';
		}
		if (exploreBtn) {
			const exploring = viewMode === 'explore' || (interactions && viewMode !== 'chrono');
			exploreBtn.setAttribute('aria-pressed', exploring ? 'true' : 'false');
			exploreBtn.textContent = exploring ? '回到导播' : '探索';
		}
		guideBtn?.setAttribute('aria-pressed', viewMode === 'guide' ? 'true' : 'false');
		chronoBtn?.setAttribute('aria-pressed', viewMode === 'chrono' ? 'true' : 'false');
	}

	function setInteractions(on: boolean): void {
		interactions = on;
		mapEl.classList.toggle('is-explore', on);
		const toggle = (handler: { enable(): void; disable(): void }) => {
			if (on) handler.enable();
			else handler.disable();
		};
		toggle(map.dragging);
		toggle(map.touchZoom);
		toggle(map.scrollWheelZoom);
		toggle(map.doubleClickZoom);
		toggle(map.keyboard);
		updateButtons();
	}

	/** Stop a fly or a tour line. Chrono keeps its station and does not move the camera. */
	function hold(): void {
		playToken++;
		flight += 1;
		flying = false;
		labelHold = 0;
		thawSheet(null);
		if (mode === 'play') mode = 'paused';
		if (viewMode === 'chrono') {
			updateButtons();
			declutter();
			return;
		}
		const cardBlank =
			card?.classList.contains('is-out') === true ||
			card?.classList.contains('is-bearing') === true ||
			shownKey === '';
		clearBearing();
		const place = activePlaces()[currentIndex];
		if (place && cardBlank && selectedDiscId) {
			narrGen++;
			paintNarration(place, currentIndex);
			card?.classList.remove('is-out');
			shownKey = `${selectedDiscId}:${place.id}`;
		}
		updateButtons();
		declutter();
	}

	function sleep(ms: number, token: number): Promise<boolean> {
		return new Promise((resolve) => {
			window.setTimeout(() => resolve(token === playToken), ms);
		});
	}

	function animate(duration: number, token: number, onFrame: (t: number) => void): Promise<boolean> {
		if (duration <= 0) {
			onFrame(1);
			return Promise.resolve(token === playToken);
		}
		return new Promise((resolve) => {
			const t0 = performance.now();
			const step = (now: number) => {
				if (token !== playToken) {
					resolve(false);
					return;
				}
				const t = Math.min(1, (now - t0) / duration);
				onFrame(t);
				if (t < 1) requestAnimationFrame(step);
				else resolve(true);
			};
			requestAnimationFrame(step);
		});
	}

	function prefixLatLngs(index: number): [number, number][] {
		const places = activePlaces();
		const coords: [number, number][] = [];
		for (let i = 1; i < index; i++) {
			const from = places[i - 1];
			const to = places[i];
			if (!from || !to) continue;
			const seg = arc(from, to);
			if (coords.length > 0) seg.shift();
			coords.push(...seg);
		}
		return coords;
	}

	function paintBaked(prefix: [number, number][], leg: [number, number][], eased: number): void {
		const partial = leg.slice(0, arcVertexCount(leg.length, eased));
		progress.setLatLngs(prefix.length > 0 ? prefix.concat(partial) : partial);
	}

	/** Viewport box at an arbitrary zoom, without moving the camera. */
	function viewBoundsAt(center: LngLat, zoom: number): L.LatLngBounds {
		const size = map.getSize();
		const half = L.point(size.x / 2 + 32, size.y / 2 + 32);
		const projected = map.project([center.lat, center.lon], zoom);
		return L.latLngBounds(
			map.unproject(projected.subtract(half), zoom),
			map.unproject(projected.add(half), zoom),
		);
	}

	function corridorBounds(
		from: LngLat,
		to: LngLat,
		zoomFrom: number,
		zoomTo: number,
		ocean: boolean,
	): L.LatLngBounds {
		let bounds: L.LatLngBounds | null = null;
		const absorb = (center: LngLat, zoom: number) => {
			const box = viewBoundsAt(center, zoom);
			bounds = bounds ? bounds.extend(box) : box;
		};
		for (const t of [0, 0.25, 0.5, 0.75, 1]) {
			const center = slerpLngLat(from, to, easeInOut(t));
			absorb(center, legZoom(t, zoomFrom, zoomTo, ocean));
		}
		absorb(to, zoomTo);
		return (bounds ?? viewBoundsAt(to, zoomTo)).pad(0.02);
	}

	function sheetCanvas(): HTMLCanvasElement | null {
		const pane = map.getPane('basemap');
		const canvas = pane?.querySelector('canvas');
		return canvas instanceof HTMLCanvasElement ? canvas : null;
	}

	/** Geographic extent of the basemap canvas, including the renderer's padding. */
	function renderedSheetBounds(): L.LatLngBounds | null {
		const source = sheetCanvas();
		if (!source) return null;
		const mapRect = map.getContainer().getBoundingClientRect();
		const rect = source.getBoundingClientRect();
		if (rect.width < 2 || rect.height < 2) return null;
		const nw = map.containerPointToLatLng([rect.left - mapRect.left, rect.top - mapRect.top]);
		const se = map.containerPointToLatLng([rect.right - mapRect.left, rect.bottom - mapRect.top]);
		return L.latLngBounds(nw, se);
	}

	/**
	 * Full-resolution copy of the paper ocean. The overlay is this canvas.
	 * A synchronous JPEG, especially at half resolution, was a long frame and
	 * then smeared when the cruise stretched it. Country labels are another
	 * pane and are not drawn into this copy.
	 */
	function copySheet(source: HTMLCanvasElement): HTMLCanvasElement | null {
		if (source.width < 2 || source.height < 2) return null;
		const copy = document.createElement('canvas');
		copy.width = source.width;
		copy.height = source.height;
		const ctx = copy.getContext('2d');
		if (!ctx) return null;
		ctx.fillStyle = BASEMAP_PAINT.ocean;
		ctx.fillRect(0, 0, copy.width, copy.height);
		ctx.drawImage(source, 0, 0);
		return copy;
	}

	/** True when the basemap canvas's screen box still covers the map viewport. */
	function canvasCoversViewport(): boolean {
		const source = sheetCanvas();
		if (!source) return false;
		const mapRect = map.getContainer().getBoundingClientRect();
		const rect = source.getBoundingClientRect();
		return (
			rect.left <= mapRect.left + 1 &&
			rect.top <= mapRect.top + 1 &&
			rect.right >= mapRect.right - 1 &&
			rect.bottom >= mapRect.bottom - 1
		);
	}

	/**
	 * Positions a canvas the way ImageOverlay does, without encoding it.
	 * Zoom animation is off, so each zoom event rewrites the layer-point box.
	 */
	function bitmapOverlay(canvas: HTMLCanvasElement, bounds: L.LatLngBounds): L.Layer {
		const Overlay = L.Layer.extend({
			initialize(
				this: { _canvas: HTMLCanvasElement; _bounds: L.LatLngBounds },
				el: HTMLCanvasElement,
				box: L.LatLngBounds,
			) {
				this._canvas = el;
				this._bounds = box;
			},
			onAdd(this: {
				_canvas: HTMLCanvasElement;
				_reset(): void;
				getPane(name?: string): HTMLElement | undefined;
			}) {
				const pane = this.getPane('basemap');
				this._canvas.classList.add('leaflet-image-layer', 'traj-freeze');
				this._canvas.style.position = 'absolute';
				this._canvas.style.left = '0';
				this._canvas.style.top = '0';
				this._canvas.style.maxWidth = 'none';
				this._canvas.style.maxHeight = 'none';
				this._canvas.style.pointerEvents = 'none';
				pane?.appendChild(this._canvas);
				map.on('zoom viewreset', this._reset, this);
				this._reset();
			},
			onRemove(this: { _canvas: HTMLCanvasElement; _reset(): void }) {
				map.off('zoom viewreset', this._reset, this);
				this._canvas.remove();
			},
			_reset(this: { _canvas: HTMLCanvasElement; _bounds: L.LatLngBounds }) {
				const nw = map.latLngToLayerPoint(this._bounds.getNorthWest());
				const se = map.latLngToLayerPoint(this._bounds.getSouthEast());
				const min = L.point(Math.min(nw.x, se.x), Math.min(nw.y, se.y));
				const max = L.point(Math.max(nw.x, se.x), Math.max(nw.y, se.y));
				L.DomUtil.setPosition(this._canvas, min);
				this._canvas.style.width = `${max.x - min.x}px`;
				this._canvas.style.height = `${max.y - min.y}px`;
			},
		});
		return new (Overlay as new (el: HTMLCanvasElement, box: L.LatLngBounds) => L.Layer)(
			canvas,
			bounds,
		);
	}

	/** True when this cruise cannot stay inside the canvas already on screen. */
	function sheetMissesCorridor(drawn: L.LatLngBounds | null, corridor: L.LatLngBounds): boolean {
		if (!drawn) return true;
		return !drawn.contains(corridor);
	}

	/**
	 * Shoot the mid-leg and put the takeoff view back. The bitmap stays off
	 * the map until the cruise is near that zoom. Vectors stay mounted.
	 */
	function captureSheet(
		from: LngLat,
		to: LngLat,
		zoomFrom: number,
		zoomTo: number,
		ocean: boolean,
	): PreparedSheet | null {
		if (map.getSize().x < 20) return null;
		if (!sheetCanvas() && sheetLayers.length > 0) mountSheet();
		if (!sheetCanvas()) return null;
		const savedCenter = map.getCenter();
		const savedZoom = map.getZoom();
		const frame = sheetSnapshotFrame({ from, to, zoomFrom, zoomTo, ocean });
		try {
			map.setView([frame.center.lat, frame.center.lon], frame.zoom, { animate: false });
			const source = sheetCanvas();
			const shot = renderedSheetBounds();
			const canvas = source ? copySheet(source) : null;
			if (!canvas || !shot) throw new Error('snapshot');
			map.setView(savedCenter, savedZoom, { animate: false });
			return { canvas, bounds: shot, zoom: frame.zoom, overlay: null };
		} catch {
			map.setView(savedCenter, savedZoom, { animate: false });
			mountSheet();
			return null;
		}
	}

	function showFrozenSheet(): void {
		const sheet = sheetFreeze;
		if (!sheet || sheet.overlay) return;
		hideCountryLabels();
		unmountSheet();
		const overlay = bitmapOverlay(sheet.canvas, sheet.bounds);
		overlay.addTo(map);
		sheet.overlay = overlay;
		// Paths still attached to the sheet renderer will try to put it back
		// on the next moveend. Keep the bitmap up until this leg thaws.
		const origAdd = map.addLayer.bind(map) as typeof map.addLayer;
		const patched = ((layer: L.Layer) => {
			if ((layer as { options?: { pane?: string } }).options?.pane === 'basemap') return map;
			return origAdd(layer);
		}) as typeof map.addLayer;
		map.addLayer = patched;
		restoreAddLayer = () => {
			if (map.addLayer === patched) map.addLayer = origAdd;
			restoreAddLayer = null;
		};
	}

	/**
	 * Drop a frozen bitmap, clear the addLayer patch, and put the vectors back.
	 * `epoch` null means "whatever a previous leg left up" (interrupt, or the
	 * start of the next fly). A numbered epoch only releases that leg's freeze,
	 * so a newer cruise is not torn down by the one it interrupted.
	 * Ends an open `_move` first, then invalidateSize + setView at the camera
	 * we just committed — the station, once the cruise has arrived.
	 */
	function thawSheet(epoch: number | null): void {
		const ownsCamera = epoch === null || cameraOwner === epoch;
		if (ownsCamera && cameraOwner !== 0) {
			cameraOwner = 0;
			sheetSnap = null;
			camera._moveEnd(true);
		}
		const ownsFreeze = epoch === null || freezeEpoch === epoch;
		if (!ownsFreeze) return;
		const sheet = sheetFreeze;
		sheetFreeze = null;
		restoreAddLayer?.();
		restoreAddLayer = null;
		const overlay = sheet?.overlay ?? null;
		if (overlay && map.hasLayer(overlay)) map.removeLayer(overlay);
		// A sheet that arrived mid-cruise was left unmounted. Put it up even when
		// this leg never froze, then force one view reset so the new canvas paints.
		// A prepared bitmap that never went on screen leaves the vectors in place.
		const canvasMissing = sheetLayers.length > 0 && !sheetCanvas();
		if (!overlay && !canvasMissing) return;
		mountSheet();
		const center = map.getCenter();
		const zoom = map.getZoom();
		map.invalidateSize();
		map.setView([center.lat, center.lng], zoom, { animate: false });
	}

	/** One movestart. Later frames only `_move`, the same split as L.Map.flyTo. */
	function cameraStart(owner: number): void {
		cameraOwner = owner;
		hideCountryLabels();
		camera._stop();
		const center = map.getCenter();
		const zoom = map.getZoom();
		sheetSnap = {
			zoom,
			center,
			origin: camera._getNewPixelOrigin(center, zoom).clone(),
		};
		camera._moveStart(true, false);
	}

	/**
	 * Project into the sheet's last full draw, then let `_move` CSS-transform it.
	 * setLatLngs during a live `_move` would paint into the new origin while the
	 * canvas is still the pre-cruise bitmap.
	 */
	function paintOnSheet(draw: () => void): void {
		if (!sheetSnap) {
			draw();
			return;
		}
		const savedZoom = camera._zoom;
		const savedOrigin = camera._pixelOrigin;
		const savedCenter = camera._lastCenter;
		camera._zoom = sheetSnap.zoom;
		camera._pixelOrigin = sheetSnap.origin;
		camera._lastCenter = sheetSnap.center;
		try {
			draw();
		} finally {
			camera._zoom = savedZoom;
			camera._pixelOrigin = savedOrigin;
			camera._lastCenter = savedCenter;
		}
	}

	/**
	 * Bitmap off once zoom climbs past the snapshot. `_moveEnd` commits the
	 * camera, thaw mounts the vectors and paints them, then `cameraStart`
	 * opens the next stretch of the cruise.
	 */
	function thawFrozenCruise(owner: number): void {
		thawSheet(owner);
		cameraStart(owner);
	}

	/** One redraw: end the CSS stretch, paint vectors, and start from that sheet. */
	function redrawVectorSheet(owner: number): void {
		cameraOwner = 0;
		sheetSnap = null;
		camera._moveEnd(true);
		cameraStart(owner);
	}

	function syncCruiseSheet(zoom: number, previousZoom: number, ocean: boolean, owner: number): void {
		const sheet = sheetFreeze;
		const action = sheetCruiseAction({
			ocean,
			hasSnapshot: sheet != null,
			snapshotZoom: sheet?.zoom ?? zoom,
			viewZoom: zoom,
			previousZoom,
			bitmapShown: sheet?.overlay != null,
			canvasCoversViewport: canvasCoversViewport(),
			drawnZoom: sheetSnap?.zoom ?? null,
		});
		if (action === 'thaw') thawFrozenCruise(owner);
		else if (action === 'show') showFrozenSheet();
		else if (action === 'redraw') redrawVectorSheet(owner);
	}

	function cameraFrame(lat: number, lon: number, zoom: number): void {
		const before = camera._zoom;
		camera._move(L.latLng(lat, lon), zoom, { flyTo: true });
		// `_move` fires `zoom` only when the level changes. The canvas renderer
		// runs `_updateTransform` from that event, so a pure pan still needs it.
		if (camera._zoom === before) map.fire('zoom');
	}

	async function flyTo(
		place: Place,
		index: number,
		token: number,
		fromPlace?: Place,
	): Promise<boolean> {
		const mine = ++flight;
		labelHold = 0;
		thawSheet(null);
		flying = false;
		clearBearing();
		const to = { lon: place.lon, lat: place.lat };
		const zoomTo = arrivalZoom(place.zoom);
		const center = map.getCenter();
		const from = { lon: center.lng, lat: center.lat };
		const zoomFrom = map.getZoom();
		const km = haversineKm(from, to);
		if (km < 1 && Math.abs(zoomFrom - zoomTo) < 0.15) {
			map.setView([to.lat, to.lon], zoomTo, { animate: false });
			setProgress(index, to);
			return token === playToken;
		}
		if (reduceMotion()) {
			map.setView([to.lat, to.lon], zoomTo, { animate: false });
			setProgress(index, to);
			return token === playToken;
		}
		const ocean = isOceanLeg(km);
		const phrase = fromPlace ? oceanLegPhrase(fromPlace, to) : null;
		const routeFrom = index > 0 ? activePlaces()[index - 1] : from;
		const leg = routeFrom ? arc(routeFrom, to, 48) : arc(from, to, 48);
		const prefix = prefixLatLngs(index);
		const duration = legFlyMs(km, false);
		const arriveZoom = legZoom(1, zoomFrom, zoomTo, ocean);
		let phrasePhase: 'idle' | 'shown' | 'done' = 'idle';
		flying = true;
		try {
			// Land hops that already fit the canvas stay vectors. Ocean, and a
			// corridor the canvas cannot hold, prepare a mid-leg bitmap but
			// keep vectors up until the zoom is near that shot. A short hop
			// prefers no freeze at all.
			freezeEpoch = mine;
			const drawn = renderedSheetBounds();
			const corridor = corridorBounds(from, to, zoomFrom, zoomTo, ocean);
			const shortHop = km <= KM_SHORT;
			if (!shortHop && (ocean || sheetMissesCorridor(drawn, corridor))) {
				sheetFreeze = captureSheet(from, to, zoomFrom, zoomTo, ocean);
			}
			cameraStart(mine);
			let previousZoom = zoomFrom;
			const cruised = await animate(duration, token, (t) => {
				const eased = easeInOut(t);
				const p = slerpLngLat(from, to, eased);
				const zoom = cruiseZoom({ t, zoomFrom, zoomTo, ocean });
				paintOnSheet(() => {
					if (index === 0) progress.setLatLngs([[p.lat, p.lon]]);
					else paintBaked(prefix, leg, eased);
				});
				cameraFrame(p.lat, p.lon, zoom);
				syncCruiseSheet(zoom, previousZoom, ocean, mine);
				previousZoom = zoom;
				if (!phrase) return;
				if (phrasePhase === 'idle' && oceanPhraseVisible(t)) {
					phrasePhase = 'shown';
					showBearing(phrase);
				} else if (phrasePhase === 'shown' && !oceanPhraseVisible(t)) {
					phrasePhase = 'done';
					clearBearing();
					card?.classList.add('is-out');
				}
			});
			if (!cruised || token !== playToken) return false;
			clearBearing();
			// Thaw on this camera-end frame, then settle. Names stay hidden
			// through the push. moveend must not paint them until it ends.
			labelHold = mine;
			thawSheet(mine);
			cameraStart(mine);
			return await animate(settleMs(false), token, (t) => {
				const zoom = arriveZoom + (zoomTo - arriveZoom) * easeInOut(t);
				cameraFrame(to.lat, to.lon, zoom);
			});
		} finally {
			if (flight === mine) {
				labelHold = 0;
				thawSheet(mine);
				flying = false;
				declutter();
				paintCountryLabels();
			}
		}
	}

	async function playFrom(start: number, opening = false): Promise<void> {
		const token = ++playToken;
		if (!selectedDiscId) {
			mode = 'paused';
			updateButtons();
			return;
		}
		viewMode = 'guide';
		clearChronoDraw();
		mode = 'play';
		pausedByViewport = false;
		setInteractions(false);
		const list = activePlaces();
		if (
			opening &&
			playsOpeningOverview({
				startIndex: start,
				placeCount: list.length,
				reduceMotion: reduceMotion(),
			})
		) {
			fadeOut();
			shownKey = '';
			fitActiveDisc();
			const held = await sleep(openingOverviewMs(reduceMotion()), token);
			if (!held || token !== playToken) return;
		}
		for (let i = start; i < list.length; i++) {
			if (token !== playToken) return;
			const place = list[i];
			if (!place) return;
			currentIndex = i;
			if (shownKey !== `${selectedDiscId}:${place.id}`) fadeOut();
			const prev = i > 0 ? list[i - 1] : undefined;
			const flew = await flyTo(place, i, token, prev);
			if (!flew || token !== playToken) return;
			const revealed = await showNarration(place, i, token);
			if (!revealed || token !== playToken) return;
			const rested = await sleep(dwellMs(place.role, reduceMotion(), place.blurb), token);
			if (!rested || token !== playToken) return;
		}
		if (token !== playToken) return;
		mode = 'done';
		updateButtons();
	}

	function showChronoStation(station: ChronoStation<Place>, index: number, total: number): void {
		const disc = discs.get(station.discId);
		const place = station.place;
		clearBearing();
		currentIndex = station.index;
		if (idxEl) {
			idxEl.textContent = `${String(index + 1).padStart(2, '0')} / ${String(total).padStart(2, '0')}`;
		}
		if (metaEl) metaEl.textContent = `${yearText(place)} · ${roleLabel(place.role)}`;
		if (cityEl) cityEl.textContent = place.cityZh;
		if (enEl) enEl.textContent = place.city;
		if (blurbEl) {
			blurbEl.textContent = place.blurb ?? '';
			blurbEl.hidden = !place.blurb;
		}
		if (workEl && disc) workEl.textContent = disc.work;
		if (openEl && disc) {
			openEl.hidden = false;
			openEl.href = disc.href;
			openEl.textContent = `打开 ${disc.catalogNumber}`;
		}
		if (progressEl && progressEl.childElementCount !== total) rebuildProgress(total);
		progressEl?.querySelectorAll('span').forEach((span, bar) => {
			span.className = bar < index ? 'is-done' : bar === index ? 'is-cur' : '';
		});
		paintPlaceChrome(station.discId, place);
		paintChronoMarkers(index);
		card?.classList.remove('is-out');
		shownKey = `${station.discId}:${place.id}`;
		declutter();
	}

	function paintChronoEdge(from: ChronoStation<Place>, to: ChronoStation<Place>, linearU: number): void {
		const u = easeInOut(linearU);
		const cross = from.discId !== to.discId;
		const line = arc(from.place, to.place, 48);
		const cut = Math.max(1, arcVertexCount(line.length, u));
		const traveled = chronoEdgeStyle(cross, true);
		chronoTraveled.setStyle({
			color: PATH_STROKE.selected,
			opacity: traveled.opacity,
			weight: traveled.weight,
			dashArray: traveled.dash ?? '',
		});
		chronoTraveled.setLatLngs(line.slice(0, cut));
		if (cross) {
			const rest = chronoEdgeStyle(true, false);
			chronoRemain.setStyle({
				color: PATH_STROKE.selected,
				opacity: rest.opacity,
				weight: rest.weight,
				dashArray: rest.dash ?? '',
			});
			chronoRemain.setLatLngs(line);
		} else {
			chronoRemain.setLatLngs([]);
		}
		const point = slerpLngLat(from.place, to.place, u);
		chronoBead.setLatLng([point.lat, point.lon]);
		chronoBead.setStyle({ fillOpacity: 1, radius: CHRONO_BEAD_PX / 2 });
		chronoBead.bringToFront();
	}

	function clearChronoEdge(): void {
		chronoTraveled.setLatLngs([]);
		chronoRemain.setLatLngs([]);
		chronoBead.setStyle({ fillOpacity: 0 });
	}

	async function runHalo(lat: number, lon: number, token: number): Promise<void> {
		if (reduceMotion()) return;
		const mine = ++haloToken;
		chronoHalo.setLatLng([lat, lon]);
		await animate(CHRONO_HALO_MS, token, (t) => {
			if (mine !== haloToken) return;
			const frame = chronoHaloFrame(t);
			chronoHalo.setRadius(frame.radius);
			chronoHalo.setStyle({ fillOpacity: frame.opacity });
		});
		if (mine !== haloToken) return;
		chronoHalo.setRadius(0);
		chronoHalo.setStyle({ fillOpacity: 0 });
	}

	/** Year order on the sheet. The camera stays where the reader left it. */
	async function runChrono(): Promise<void> {
		const token = ++playToken;
		viewMode = 'chrono';
		mode = 'play';
		pausedByViewport = false;
		setInteractions(true);
		redrawGhost();
		const stations = listChrono();
		if (stations.length === 0) {
			mode = 'done';
			updateButtons();
			return;
		}
		if (chronoIndex >= stations.length) chronoIndex = 0;
		updateButtons();
		let skipHalo = false;
		while (token === playToken && chronoIndex < stations.length) {
			const station = stations[chronoIndex];
			if (!station) return;
			if (chronoPhase !== 'crawl') {
				showChronoStation(station, chronoIndex, stations.length);
				if (!skipHalo && !reduceMotion()) void runHalo(station.place.lat, station.place.lon, token);
				skipHalo = false;
				const held = await sleep(CHRONO_ACTIVE_MS, token);
				if (!held || token !== playToken) return;
			}
			const next = stations[chronoIndex + 1];
			if (!next) break;
			if (reduceMotion()) {
				chronoIndex += 1;
				chronoU = 0;
				chronoPhase = 'hold';
				continue;
			}
			const km = haversineKm(station.place, next.place);
			if (km < 1) {
				chronoIndex += 1;
				chronoU = 0;
				chronoPhase = 'hold';
				continue;
			}
			chronoPhase = 'crawl';
			const duration = chronoSegmentMs(km, false);
			const fromU = Math.min(1, Math.max(0, chronoU));
			const span = Math.max(0, 1 - fromU);
			let overlapped = false;
			const crawled = await animate(duration * span, token, (t) => {
				const u = fromU + span * t;
				chronoU = u;
				paintChronoEdge(station, next, u);
				const msLeft = (1 - u) * duration;
				if (!overlapped && msLeft <= CHRONO_EDGE_OVERLAP_MS) {
					overlapped = true;
					showChronoStation(next, chronoIndex + 1, stations.length);
					void runHalo(next.place.lat, next.place.lon, token);
				}
			});
			if (!crawled || token !== playToken) return;
			rememberChronoEdge(station, next);
			clearChronoEdge();
			chronoIndex += 1;
			chronoU = 0;
			chronoPhase = 'hold';
			skipHalo = overlapped;
		}
		if (token !== playToken) return;
		mode = 'done';
		chronoPhase = 'hold';
		updateButtons();
	}

	function seekChronoIndex(index: number, resume: boolean): void {
		const stations = listChrono();
		if (stations.length === 0) return;
		const at = Math.max(0, Math.min(stations.length - 1, index));
		playToken += 1;
		chronoIndex = at;
		chronoU = 0;
		chronoPhase = 'hold';
		clearChronoDraw();
		viewMode = 'chrono';
		const station = stations[at];
		if (!station) return;
		showChronoStation(station, at, stations.length);
		redrawGhost();
		if (resume) {
			void runChrono();
			return;
		}
		mode = 'paused';
		updateButtons();
	}

	function seekChronoPlace(discId: string, index: number): void {
		const playing = mode === 'play';
		let stations = listChrono();
		let at = stations.findIndex((station) => station.discId === discId && station.index === index);
		if (at < 0 && overview) {
			selectedDiscId = discId;
			showPanel();
			stations = listChrono();
			at = stations.findIndex((station) => station.discId === discId && station.index === index);
		}
		if (at < 0) return;
		seekChronoIndex(at, playing);
	}

	function selectCatalog(): void {
		playToken += 1;
		flight += 1;
		flying = false;
		labelHold = 0;
		thawSheet(null);
		clearChronoDraw();
		if (mode === 'play') mode = 'paused';
		if (viewMode === 'guide') viewMode = 'explore';
		selectedDiscId = null;
		chronoIndex = 0;
		chronoU = 0;
		chronoPhase = 'hold';
		showPanel();
		redrawGhost();
		paintCatalog();
		setInteractions(true);
	}

	function ensureGuideDisc(): void {
		if (selectedDiscId && discs.has(selectedDiscId)) return;
		const first = payload.discs[0];
		if (!first) return;
		selectedDiscId = first.id;
		currentIndex = 0;
		showPanel();
		redrawGhost();
		paintDiscChips();
	}

	function chronoStartIndex(): number {
		if (!selectedDiscId) return 0;
		const at = listChrono().findIndex(
			(station) => station.discId === selectedDiscId && station.index === currentIndex,
		);
		return at >= 0 ? at : 0;
	}

	function beginChrono(from: number): void {
		userTookOver = true;
		started = true;
		pausedByViewport = false;
		viewMode = 'chrono';
		chronoIndex = from;
		chronoU = 0;
		chronoPhase = 'hold';
		clearChronoDraw();
		redrawGhost();
		setInteractions(true);
		void runChrono();
	}

	function beginGuide(start: number, opening: boolean): void {
		userTookOver = true;
		started = true;
		pausedByViewport = false;
		clearChronoDraw();
		ensureGuideDisc();
		viewMode = 'guide';
		setInteractions(false);
		void playFrom(selectedDiscId ? start : 0, opening);
	}

	async function focusPlace(discId: string, index: number): Promise<void> {
		userTookOver = true;
		pausedByViewport = false;
		if (viewMode === 'chrono') {
			seekChronoPlace(discId, index);
			return;
		}
		if (viewMode === 'explore') {
			playToken += 1;
			flight += 1;
			flying = false;
			labelHold = 0;
			thawSheet(null);
			const discChanged = selectedDiscId !== discId;
			selectedDiscId = discId;
			currentIndex = index;
			mode = 'paused';
			showPanel();
			if (discChanged) redrawGhost();
			const place = activePlaces()[index];
			updateButtons();
			if (!place) return;
			paintNarration(place, index);
			card?.classList.remove('is-out');
			shownKey = `${discId}:${place.id}`;
			return;
		}
		const token = ++playToken;
		const discChanged = selectedDiscId !== discId;
		selectedDiscId = discId;
		mode = 'paused';
		showPanel();
		if (discChanged) redrawGhost();
		updateButtons();
		const place = activePlaces()[index];
		if (!place) return;
		const fromPlace =
			!discChanged && index === currentIndex + 1 ? activePlaces()[currentIndex] : undefined;
		currentIndex = index;
		if (shownKey !== `${selectedDiscId}:${place.id}`) fadeOut();
		const flew = await flyTo(place, index, token, fromPlace);
		if (!flew || token !== playToken) return;
		await showNarration(place, index, token);
	}

	function placeFromHash(): { discId: string; index: number } | null {
		const hash = location.hash.replace(/^#/, '');
		if (!hash) return null;
		let id = hash;
		try {
			id = decodeURIComponent(hash);
		} catch {
			return null;
		}
		const button = root.querySelector<HTMLButtonElement>(`#${CSS.escape(id)}`);
		if (!button?.dataset.disc || !button.dataset.trajPlace) return null;
		const disc = discs.get(button.dataset.disc);
		if (!disc) return null;
		const index = disc.places.findIndex((place) => place.id === button.dataset.trajPlace);
		if (index < 0) return null;
		return { discId: disc.id, index };
	}

	function labelsHeld(): boolean {
		return cameraOwner !== 0 || sheetFreeze?.overlay != null || labelHold !== 0;
	}

	/** Cruise and the freeze bitmap hide names. The fade is the landing, not the flight. */
	function hideCountryLabels(): void {
		labelCanvas.style.transition = 'none';
		labelCanvas.style.opacity = '0';
	}

	function scheduleCountryLabels(): void {
		if (labelFrame !== 0) return;
		labelFrame = requestAnimationFrame(() => {
			labelFrame = 0;
			paintCountryLabels();
		});
	}

	function resizeLabelCanvas(): CanvasRenderingContext2D | null {
		const size = map.getSize();
		const dpr = Math.min(window.devicePixelRatio || 1, 2);
		const origin = map.containerPointToLayerPoint(L.point(0, 0));
		L.DomUtil.setPosition(labelCanvas, origin);
		labelCanvas.width = Math.max(1, Math.round(size.x * dpr));
		labelCanvas.height = Math.max(1, Math.round(size.y * dpr));
		labelCanvas.style.width = `${size.x}px`;
		labelCanvas.style.height = `${size.y}px`;
		const ctx = labelCanvas.getContext('2d');
		if (!ctx) return null;
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		return ctx;
	}

	function measureLabel(ctx: CanvasRenderingContext2D, text: string, fontSize: number): number {
		const widths: number[] = [];
		for (const glyph of text) widths.push(ctx.measureText(glyph).width);
		return trackedTextWidth(widths, fontSize);
	}

	function drawLabelText(
		ctx: CanvasRenderingContext2D,
		text: string,
		x: number,
		y: number,
		fontSize: number,
	): void {
		const gap = fontSize * COUNTRY_LABEL_TRACKING;
		const glyphs: { ch: string; w: number }[] = [];
		for (const ch of text) glyphs.push({ ch, w: ctx.measureText(ch).width });
		const total = trackedTextWidth(
			glyphs.map((glyph) => glyph.w),
			fontSize,
		);
		let cursor = x - total / 2;
		ctx.lineWidth = COUNTRY_LABEL_HALO_PX;
		ctx.lineJoin = 'round';
		ctx.lineCap = 'round';
		ctx.strokeStyle = BASEMAP_PAINT.land;
		ctx.fillStyle = BASEMAP_PAINT.label;
		ctx.textAlign = 'left';
		ctx.textBaseline = 'middle';
		for (const glyph of glyphs) {
			ctx.strokeText(glyph.ch, cursor, y);
			ctx.fillText(glyph.ch, cursor, y);
			cursor += glyph.w + gap;
		}
	}

	function elementBox(el: Element | null | undefined): ScreenRect | null {
		if (!el) return null;
		const mapRect = map.getContainer().getBoundingClientRect();
		const box = el.getBoundingClientRect();
		if (box.width < 1 || box.height < 1) return null;
		return { x: box.left - mapRect.left, y: box.top - mapRect.top, w: box.width, h: box.height };
	}

	function labelObstacles(): ScreenRect[] {
		const obstacles: ScreenRect[] = [];
		for (const dot of dots) {
			const point = map.latLngToContainerPoint([dot.place.lat, dot.place.lon]);
			const radius = dot.marker.getRadius();
			obstacles.push({
				x: point.x - radius,
				y: point.y - radius,
				w: radius * 2,
				h: radius * 2,
			});
			const tipEl = dot.marker.getTooltip()?.getElement();
			if (tipEl && !tipEl.classList.contains('is-hide')) {
				const tip = elementBox(tipEl);
				if (tip) obstacles.push(tip);
			}
		}
		const narration = elementBox(card);
		if (narration) obstacles.push(narration);
		return obstacles;
	}

	function activePathScreen(): { x: number; y: number }[] {
		const points: { x: number; y: number }[] = [];
		const walk = (value: unknown): void => {
			if (Array.isArray(value)) {
				for (const item of value) walk(item);
				return;
			}
			if (!value || typeof value !== 'object' || !('lat' in value) || !('lng' in value)) return;
			const latlng = value as L.LatLng;
			const point = map.latLngToContainerPoint(latlng);
			points.push({ x: point.x, y: point.y });
		};
		walk(ghost.getLatLngs());
		return points;
	}

	/** One canvas, placed labels only. Never called from a cruise frame. */
	function drawCountryLabels(): void {
		if (labelsHeld()) return;
		const size = map.getSize();
		const ctx = resizeLabelCanvas();
		if (!ctx) return;
		ctx.clearRect(0, 0, size.x, size.y);
		if (size.x < 2 || size.y < 2) return;
		const zoom = map.getZoom();
		if (!countryLabelZoomVisible(zoom)) return;
		const mobile = window.matchMedia(COUNTRY_LABEL_MOBILE_QUERY).matches;
		const fontSize = countryLabelFontSize(mobile);
		ctx.font = `${COUNTRY_LABEL_WEIGHT} ${fontSize}px ${COUNTRY_LABEL_FONT_STACK}`;
		const candidates: LabelCandidate[] = [];
		for (const label of countryLabels) {
			const projected = projectedCountrySize(label.area, label.ew, label.lat, zoom);
			const point = map.latLngToContainerPoint([label.lat, label.lng]);
			candidates.push({
				id: label.id,
				zh: label.zh,
				x: point.x,
				y: point.y,
				projectedArea: projected.area,
				projectedWidth: projected.width,
				textWidth: measureLabel(ctx, label.zh, fontSize),
				textHeight: fontSize,
			});
		}
		const weight = ghost.options.weight;
		const selected = selectCountryLabels({
			zoom,
			mobile,
			candidates,
			obstacles: labelObstacles(),
			paths: [activePathScreen()],
			viewport: { x: 0, y: 0, w: size.x, h: size.y },
			pathRadius: (typeof weight === 'number' ? weight : 1.8) / 2,
		});
		for (const label of selected) drawLabelText(ctx, label.zh, label.x, label.y, fontSize);
	}

	function paintCountryLabels(): void {
		if (labelsHeld()) {
			hideCountryLabels();
			return;
		}
		const reveal = labelCanvas.style.opacity === '0';
		drawCountryLabels();
		if (!reveal) return;
		labelCanvas.style.transition = `opacity ${COUNTRY_LABEL_FADE_MS}ms linear`;
		labelCanvas.style.opacity = '1';
	}

	async function loadCountryLabels(): Promise<void> {
		try {
			const response = await fetch(VECTOR_BASEMAP.labelsUrl);
			if (!response.ok) return;
			const rows = (await response.json()) as unknown;
			if (!Array.isArray(rows)) return;
			countryLabels.length = 0;
			for (const row of rows) {
				const anchor = countryLabelAnchor(row);
				if (anchor) countryLabels.push(anchor);
			}
			scheduleCountryLabels();
		} catch {
			// The sheet and the route still read if the name file fails.
		}
	}

	function mountSheet(): void {
		if (sheetLayers.length === 0) return;
		const missing = sheetLayers.some((layer) => !map.hasLayer(layer));
		if (!missing && sheetCanvas()) return;
		(baseRenderer as SheetRenderer)._redrawRequest = null;
		for (const layer of sheetLayers) {
			if (!map.hasLayer(layer)) layer.addTo(map);
		}
	}

	function basemapRenderer(): L.Layer | null {
		const canvas = sheetCanvas();
		if (!canvas) return null;
		let found: L.Layer | null = null;
		map.eachLayer((layer) => {
			if ((layer as { _container?: HTMLElement })._container === canvas) found = layer;
		});
		return found;
	}

	function unmountSheet(): void {
		// The canvas renderer stays on the map after its paths are removed, and
		// its moveend handler redraws Natural Earth on every pan. Take it off too.
		const renderer = (basemapRenderer() ?? baseRenderer) as SheetRenderer;
		for (const layer of sheetLayers) {
			if (map.hasLayer(layer)) map.removeLayer(layer);
		}
		if (map.hasLayer(renderer)) map.removeLayer(renderer);
		// Leaflet 1.9.4 cancels this frame in _destroyContainer and leaves the id
		// set, so the next mount paints once and then never schedules another.
		renderer._redrawRequest = null;
		sheetCanvas()?.remove();
	}

	async function loadBasemap(): Promise<void> {
		try {
			const [landRes, countryRes] = await Promise.all([
				fetch(VECTOR_BASEMAP.landUrl),
				fetch(VECTOR_BASEMAP.countriesUrl),
			]);
			if (!landRes.ok || !countryRes.ok) return;
			const landTopo = asTopology(await landRes.json());
			const countryTopo = asTopology(await countryRes.json());
			const landObject = landTopo?.objects.land;
			const countriesObject = countryTopo?.objects.countries as GeometryObject | undefined;
			if (!landTopo || !countryTopo || !landObject || !countriesObject) return;
			const base = { renderer: baseRenderer, interactive: false, pane: 'basemap' };
			sheetLayers = [
				L.geoJSON(graticule(), {
					...base,
					style: { color: BASEMAP_PAINT.graticule, weight: 0.6 },
				}),
				L.geoJSON(feature(landTopo, landObject), {
					...base,
					style: { stroke: false, fillColor: BASEMAP_PAINT.land, fillOpacity: 1 },
				}),
				L.geoJSON(mesh(countryTopo, countriesObject, (a, b) => a !== b), {
					...base,
					style: { color: BASEMAP_PAINT.border, weight: 0.7, dashArray: '2 2' },
				}),
				L.geoJSON(mesh(countryTopo, countriesObject, (a, b) => a === b), {
					...base,
					style: { color: BASEMAP_PAINT.coast, weight: 0.8 },
				}),
			];
			// A cruise in progress keeps the frozen bitmap. The thaw mounts the vectors.
			if (!flying) mountSheet();
		} catch {
			// The ocean ground and the route still read if the sheet fails to parse.
		}
	}

	playBtn?.addEventListener('click', () => {
		if (mode === 'play') {
			pausedByViewport = false;
			hold();
			return;
		}
		userTookOver = true;
		started = true;
		pausedByViewport = false;
		if (viewMode === 'chrono') {
			void runChrono();
			return;
		}
		if (viewMode === 'explore') {
			beginChrono(chronoStartIndex());
			return;
		}
		void playFrom(mode === 'paused' ? currentIndex : 0, mode !== 'paused');
	});
	replayBtn?.addEventListener('click', () => {
		userTookOver = true;
		started = true;
		pausedByViewport = false;
		if (viewMode === 'chrono') {
			beginChrono(0);
			return;
		}
		beginGuide(0, true);
	});
	prevBtn?.addEventListener('click', () => {
		userTookOver = true;
		if (viewMode === 'chrono') {
			seekChronoIndex(chronoIndex - 1, mode === 'play');
			return;
		}
		if (!selectedDiscId) return;
		void focusPlace(selectedDiscId, Math.max(0, currentIndex - 1));
	});
	nextBtn?.addEventListener('click', () => {
		userTookOver = true;
		if (viewMode === 'chrono') {
			seekChronoIndex(chronoIndex + 1, mode === 'play');
			return;
		}
		if (!selectedDiscId) return;
		void focusPlace(selectedDiscId, Math.min(activePlaces().length - 1, currentIndex + 1));
	});
	guideBtn?.addEventListener('click', () => {
		const resume = viewMode === 'guide' && mode === 'paused' && selectedDiscId !== null;
		beginGuide(resume ? currentIndex : 0, !resume);
	});
	chronoBtn?.addEventListener('click', () => {
		if (viewMode === 'chrono' && mode === 'play') {
			pausedByViewport = false;
			hold();
			return;
		}
		beginChrono(viewMode === 'chrono' ? chronoIndex : chronoStartIndex());
	});
	exploreBtn?.addEventListener('click', () => {
		userTookOver = true;
		pausedByViewport = false;
		if (viewMode === 'chrono') {
			hold();
			clearChronoDraw();
			viewMode = 'explore';
			setInteractions(true);
			return;
		}
		if (viewMode === 'explore' || interactions) {
			viewMode = 'guide';
			setInteractions(false);
			return;
		}
		hold();
		viewMode = 'explore';
		setInteractions(true);
	});

	root.querySelectorAll<HTMLButtonElement>('[data-traj-place]').forEach((button) => {
		button.addEventListener('click', () => {
			const discId = button.dataset.disc;
			const placeId = button.dataset.trajPlace;
			if (!discId || !placeId) return;
			const disc = discs.get(discId);
			if (!disc) return;
			const index = disc.places.findIndex((place) => place.id === placeId);
			if (index < 0) return;
			void focusPlace(discId, index);
			mapEl.scrollIntoView({ behavior: reduceMotion() ? 'auto' : 'smooth', block: 'nearest' });
		});
	});
	root.querySelectorAll<HTMLButtonElement>('[data-traj-switch]').forEach((button) => {
		button.addEventListener('click', () => {
			const discId = button.dataset.trajSwitch;
			if (!discId || !discs.has(discId)) return;
			if (overview && discId === selectedDiscId) {
				selectCatalog();
				return;
			}
			if (viewMode === 'chrono') {
				selectedDiscId = discId;
				showPanel();
				redrawGhost();
				paintDiscChips();
				seekChronoIndex(0, mode === 'play');
				return;
			}
			void focusPlace(discId, 0);
		});
	});
	root.querySelector<HTMLButtonElement>('[data-traj-all]')?.addEventListener('click', () => {
		if (!overview) return;
		selectCatalog();
	});

	mapEl.addEventListener('pointerdown', (event) => {
		if (event.pointerType === 'touch') return;
		if (event.button !== 0) return;
		userTookOver = true;
		catalogFitted = true;
		if (viewMode === 'chrono') return;
		if (mode === 'play') hold();
		setInteractions(true);
	});
	mapEl.addEventListener(
		'wheel',
		() => {
			catalogFitted = true;
			if (mode !== 'play' || viewMode === 'chrono') return;
			userTookOver = true;
			hold();
			setInteractions(true);
		},
		{ passive: true },
	);
	map.on('dragstart', () => {
		catalogFitted = true;
		if (viewMode !== 'chrono' || mode !== 'play') return;
		userTookOver = true;
		hold();
	});

	map.on('zoomend moveend', declutter);
	map.on('moveend zoomend viewreset resize', scheduleCountryLabels);
	window.matchMedia(COUNTRY_LABEL_MOBILE_QUERY).addEventListener('change', scheduleCountryLabels);

	showPanel();
	redrawGhost();
	if (openingPlace && selectedDiscId) {
		shownKey = `${selectedDiscId}:${openingPlace.id}`;
		setProgress(currentIndex, { lon: openingPlace.lon, lat: openingPlace.lat });
		if (deep) paintNarration(openingPlace, currentIndex);
		else {
			paintMarkers(currentIndex);
			declutter();
			if (
				playsOpeningOverview({
					startIndex: 0,
					placeCount: activePlaces().length,
					reduceMotion: reduceMotion(),
				})
			) {
				map.invalidateSize();
				fitActiveDisc();
			}
		}
	} else if (selectedDiscId === null) {
		paintCatalog();
	}
	if (deep) {
		userTookOver = true;
		mode = 'paused';
	}
	if (viewMode === 'explore') setInteractions(true);
	else updateButtons();
	map.invalidateSize();
	fitOverviewOnce();

	const observer = new IntersectionObserver(
		(entries) => {
			const inView = entries[entries.length - 1]?.isIntersecting === true;
			if (inView) {
				map.invalidateSize();
				fitOverviewOnce();
			}
			const action = viewportPlayAction({
				embed: payload.mode === 'embed',
				inView,
				started,
				userTookOver,
				mode,
				pausedByViewport,
			});
			if (action === 'pause') {
				pausedByViewport = true;
				hold();
				return;
			}
			if (overview && action === 'start') return;
			if (action !== 'start' && action !== 'resume') return;
			if (action === 'start') started = true;
			pausedByViewport = false;
			if (
				action === 'start' &&
				playsOpeningOverview({
					startIndex: currentIndex,
					placeCount: activePlaces().length,
					reduceMotion: reduceMotion(),
				})
			) {
				fitActiveDisc();
			}
			void playFrom(currentIndex, action === 'start');
		},
		{ threshold: 0.4 },
	);
	observer.observe(mapEl);
	window.addEventListener('resize', () => map.invalidateSize());
}

export function mountTrajectoryMaps(scope: ParentNode = document): void {
	scope.querySelectorAll<HTMLElement>('[data-traj-root]').forEach((root) => mount(root));
}
