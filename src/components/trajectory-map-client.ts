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
	sheetCruiseAction,
	sheetSnapshotFrame,
	slerpLngLat,
	weakSegments,
	yearText,
	type LngLat,
} from '../data/trajectory-camera';
import {
	CHRONO_ACTIVE_MS,
	CHRONO_ACTIVE_SCALE,
	CHRONO_BEAD_PX,
	CHRONO_EDGE_OVERLAP_MS,
	CHRONO_HALO_MS,
	CHRONO_VISITED_OPACITY,
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
	GLYPH_MIN_ZOOM,
	PIN_DENSITY,
	PIN_DENSITY_PAIR_LIMIT,
	PIN_DENSITY_THROTTLE_MS,
	isStationSwipe,
	medianPairPx,
	pinDensityTier,
	localNearFrame,
	localNearHops,
	localNearStops,
	oceanLegPhrase,
	oceanPhraseVisible,
	openingFrame,
	openingOverviewMs,
	playsOpeningOverview,
	stageStepsStation,
	viewportPlayAction,
	type LonLatBounds,
	type PinDensityTier,
	type ViewMode,
} from '../data/trajectory-guide';
import { mapSteppingStations } from '../data/disc-chapters';
import { type TrapGestureDetail, type TrapSettledDetail } from '../data/disc-chapter-boundary';
import {
	createStationBridge,
	hasLiveSelection,
	isStationTarget,
	ownsInteractiveGesture,
	stationTargetIndex,
	type StationAction,
	type StationSettle,
	type StationTarget,
} from '../data/disc-chapter-gestures';
import {
	magnetFitPadding,
	magnetInsets,
	magnetOffset,
	magnetRectOffset,
	magnetSkips,
	magnetSettleMs,
	magnetZoomPadding,
} from '../data/trajectory-magnet';
import {
	pinBodyHtml,
	pinShellSize,
	rolePinGlyph,
	type PinRoleGlyph,
} from '../data/trajectory-pins';
import {
	RAIL_MIN_PX_PER_YEAR,
	RAIL_MIN_SPAN_YEARS,
	railLayout,
	type RailLayout,
} from '../data/trajectory-rail';

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

type StopRef = { discId: string; index: number };

type Dot = {
	stops: StopRef[];
	place: Place;
	/** Teardrop DivIcon marker: the anchor is the point, not the head centre. */
	marker: L.Marker;
	pulse: L.Marker;
	/** Cache of the shell currently mounted, so a repaint does not rebuild it. */
	pinKey?: string;
};

/** A pin that is off the toured disc still reads, a little softer. */
const PIN_PENDING_OPACITY = 0.45;

/** Card fade before the next narration. A layout beat, not the camera's settle. */
const CARD_FADE_MS = 175;

/**
 * Arrival ε. The cruise lands on the near fit's own frame, so a camera this
 * close to it is already there — fitting again is the arrival tremble.
 */
const FIT_EPS_ZOOM = 0.05;
const FIT_EPS_PX = 2;

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
	/** The gesture owner: map, year rail, narration and controls. Bound once, never `document`. */
	let stageEl: HTMLElement | null = null;
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
	const railEl = root.querySelector<HTMLElement>('[data-traj-rail]');
	/** 窄屏左纵年轴：主进度。触控与横轴同一套 data，只是轴向改竖。 */
	const yearRailEl = root.querySelector<HTMLElement>('[data-traj-year-rail]');
	const SVG_NS = 'http://www.w3.org/2000/svg';
	const RAIL_AXIS_Y = 18.5;
	type RailPinPhase = 'on' | 'done' | 'pending';
	let railXs: number[] = [];
	let railScroll = false;
	let railKey = '';
	let railDone: SVGLineElement | null = null;
	if (railEl) {
		railEl.style.setProperty('--rail-chrono-scale', String(CHRONO_ACTIVE_SCALE));
		railEl.style.setProperty('--rail-chrono-visited-opacity', String(CHRONO_VISITED_OPACITY));
		railEl.style.setProperty('--rail-pencil', BASEMAP_PAINT.coast);
	}
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
	/** Last measured weak-pin tier; an unchanged tier never re-iconizes. */
	let pinTier: PinDensityTier = 'sparse';
	let pinTierTimer = 0;
	let pausedByViewport = false;
	let flying = false;
	let flight = 0;
	/** A station step keeps the gesture swallowed until the fly and its card settle (desktop／独立地图). */
	const STATION_FLIGHT_LOCK_MS = 420;
	/** The page just moved under the reader: the stage leaves the gesture alone. */
	const PAGE_SCROLL_COOLDOWN_MS = 240;
	let stationSettledAt = 0;
	let lastPageScrollAt = 0;
	let cameraOwner = 0;
	let freezeEpoch = 0;
	let labelHold = 0;
	let chronoIndex = 0;
	let chronoU = 0;
	let chronoPhase: 'hold' | 'crawl' = 'hold';
	let haloToken = 0;
	let catalogFitted = false;
	let fittedDisc: string | null = null;
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
	/**
	 * The opening shot is the disc's region, not the first stop's arrival zoom;
	 * the frame in `frameDiscOnce` re-fits once the canvas has a measured size.
	 */
	function seedOpeningView(): void {
		const frame = selectedDiscId ? openingFrame(activePlaces()) : null;
		const size = map.getSize();
		if (frame && size.x >= 20 && size.y >= 20) {
			map.fitBounds(L.latLngBounds([frame.south, frame.west], [frame.north, frame.east]), {
				padding: [72, 40],
				animate: false,
				maxZoom: VECTOR_BASEMAP.frameMaxZoom,
			});
			return;
		}
		if (frame) {
			const lat = (frame.south + frame.north) / 2;
			const lon = (frame.west + frame.east) / 2;
			map.setView([lat, lon], 3, { animate: false });
			return;
		}
		if (openingPlace) {
			map.setView([openingPlace.lat, openingPlace.lon], arrivalZoom(openingPlace.zoom), {
				animate: false,
			});
			return;
		}
		const seed = payload.discs.flatMap((disc) => disc.places)[0];
		if (seed) map.setView([seed.lat, seed.lon], 2, { animate: false });
	}
	seedOpeningView();

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
	const nearHops = L.layerGroup().addTo(map);
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
		// Every pin is a DivIcon teardrop from the first frame: the anchor is the
		// point, so the head never drifts off the lat/lng while a tier is pending.
		const marker = L.marker([place.lat, place.lon], {
			icon: pinIcon(null, PIN_DENSITY.sparse.restR * 2, 0),
			title: place.cityZh,
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
		redrawNearHops(inkSelected() ? activePlaces() : []);
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

	/** Short same-disc gaps stay a stroke, slightly heavier than the route. */
	function redrawNearHops(places: readonly Place[]): void {
		nearHops.clearLayers();
		if (!inkSelected()) return;
		for (const [from, to] of localNearHops(places)) {
			const line = L.polyline(arc(from, to, 16), {
				renderer: drawRenderer,
				color: PATH_STROKE.selected,
				weight: PATH_STROKE.nearWeight,
				opacity: PATH_STROKE.nearOpacity,
				lineCap: 'round',
				lineJoin: 'round',
				interactive: false,
			});
			line.addTo(nearHops);
		}
		// Hops draw into the canvas overlay pane; the teardrop pins sit in the
		// marker pane above it, so they already stack over every hop stroke.
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

	function cssPx(name: string): number {
		const n = parseFloat(getComputedStyle(root).getPropertyValue(name));
		return Number.isFinite(n) ? n : 0;
	}

	function hideRail(): void {
		if (!railEl) return;
		railEl.hidden = true;
		railEl.classList.remove('is-scroll', 'is-chrono');
	}

	/** Year order, same tie-break as chronoStations: keep places order. */
	function renderRailPins(disc: Disc): void {
		const list = railEl?.querySelector('.traj-rail-pins');
		if (!list) return;
		const sorted = disc.places.map((place, index) => ({ place, index }));
		sorted.sort((a, b) => a.place.year - b.place.year || a.index - b.index);
		list.replaceChildren();
		for (let i = 0; i < sorted.length; i++) {
			const row = sorted[i];
			const prev = sorted[i - 1];
			if (!row) continue;
			const showYear = !prev || prev.place.year !== row.place.year;
			const li = document.createElement('li');
			const button = document.createElement('button');
			button.type = 'button';
			button.tabIndex = -1;
			button.dataset.trajPlace = row.place.id;
			button.dataset.disc = disc.id;
			button.dataset.railIndex = String(row.index);
			const dot = document.createElement('span');
			dot.className = 'traj-rail-dot';
			const year = document.createElement('span');
			year.className = 'traj-rail-y';
			year.textContent = showYear ? String(row.place.year) : '';
			button.append(dot, year);
			li.append(button);
			list.append(li);
		}
	}

	function railLine(x1: number, x2: number, className: string): SVGLineElement {
		const line = document.createElementNS(SVG_NS, 'line');
		line.setAttribute('class', className);
		line.setAttribute('x1', String(x1));
		line.setAttribute('x2', String(x2));
		line.setAttribute('y1', String(RAIL_AXIS_Y));
		line.setAttribute('y2', String(RAIL_AXIS_Y));
		return line;
	}

	function drawRailSvg(
		svg: SVGSVGElement,
		sortedXs: readonly number[],
		layout: RailLayout,
		height: number,
	): void {
		const width = Math.max(1, layout.width);
		svg.setAttribute('width', String(width));
		svg.setAttribute('height', String(height));
		svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
		svg.replaceChildren();
		if (sortedXs.length === 0) {
			railDone = null;
			return;
		}
		const x1 = sortedXs[0]!;
		const x2 = sortedXs[sortedXs.length - 1]!;
		svg.append(railLine(x1, x2, 'traj-rail-line'));
		railDone = railLine(x1, x1, 'traj-rail-line-done');
		svg.append(railDone);
		for (const tick of layout.ticks) {
			const mark = document.createElementNS(SVG_NS, 'line');
			mark.setAttribute('class', 'traj-rail-tick');
			mark.setAttribute('x1', String(tick.x));
			mark.setAttribute('x2', String(tick.x));
			mark.setAttribute('y1', '20');
			mark.setAttribute('y2', '24');
			svg.append(mark);
			if (!tick.label) continue;
			const text = document.createElementNS(SVG_NS, 'text');
			text.setAttribute('class', 'traj-rail-century');
			text.setAttribute('x', String(tick.x));
			text.setAttribute('y', '10');
			text.setAttribute('text-anchor', 'middle');
			text.textContent = tick.label;
			svg.append(text);
		}
	}

	function syncRailMask(): void {
		if (!railEl) return;
		const track = railEl.querySelector<HTMLElement>('.traj-rail-track');
		if (!track) return;
		const overflow = railScroll && track.scrollWidth > track.clientWidth + 1;
		const atEnd = track.scrollLeft + track.clientWidth >= track.scrollWidth - 1;
		railEl.classList.toggle('is-scroll', overflow && !atEnd);
	}

	function applyRailGeometry(disc: Disc): void {
		if (!railEl) return;
		const track = railEl.querySelector<HTMLElement>('.traj-rail-track');
		const inner = railEl.querySelector<HTMLElement>('.traj-rail-inner');
		const svg = railEl.querySelector<SVGSVGElement>('.traj-rail-ticks');
		if (!track || !inner || !svg) return;
		const width = track.clientWidth;
		if (width < 2) return;
		const layout = railLayout(
			disc.places.map((place) => place.year),
			{
				width,
				gap: cssPx('--rail-gap'),
				pad: cssPx('--rail-pad'),
				kMin: RAIL_MIN_PX_PER_YEAR,
				minSpan: RAIL_MIN_SPAN_YEARS,
			},
		);
		railXs = layout.xs;
		railScroll = layout.scroll;
		inner.style.width = `${layout.width}px`;
		railEl.classList.add('is-ready');
		const sortedXs = layout.order.map((index) => layout.xs[index] ?? 0);
		railEl.querySelectorAll<HTMLButtonElement>('.traj-rail-pins button').forEach((button, displayIndex) => {
			const inputIndex = layout.order[displayIndex];
			const x = inputIndex === undefined ? undefined : layout.xs[inputIndex];
			if (x === undefined) return;
			button.style.left = `${x}px`;
		});
		drawRailSvg(svg, sortedXs, layout, inner.clientHeight || cssPx('--rail-h') || 56);
		syncRailMask();
	}

	function ensureRail(disc: Disc): void {
		if (!railEl) return;
		railEl.hidden = false;
		const key = `${disc.id}:${disc.places.map((place) => place.id).join('|')}`;
		if (railKey !== key) {
			railKey = key;
			renderRailPins(disc);
		}
		applyRailGeometry(disc);
	}

	function scrollRailPin(placeIndex: number): void {
		if (!railEl || !railScroll) return;
		const track = railEl.querySelector<HTMLElement>('.traj-rail-track');
		const x = railXs[placeIndex];
		if (!track || x === undefined) return;
		const left = track.scrollLeft;
		const view = track.clientWidth;
		if (x < left || x > left + view) {
			track.scrollTo({
				left: Math.max(0, x - view / 2),
				behavior: reduceMotion() ? 'auto' : 'smooth',
			});
		}
	}

	/** Pin classes follow the map: guide on/done, chrono chronoMarkerPhase. */
	function paintRail(activePlaceIndex: number, phaseAt: (placeIndex: number) => RailPinPhase): void {
		if (!railEl || railEl.hidden) return;
		railEl.classList.toggle('is-chrono', viewMode === 'chrono');
		railEl.querySelectorAll<HTMLButtonElement>('.traj-rail-pins button').forEach((button) => {
			const placeIndex = Number(button.dataset.railIndex);
			const phase = phaseAt(placeIndex);
			const li = button.closest('li');
			if (!li) return;
			li.classList.toggle('is-on', phase === 'on');
			li.classList.toggle('is-done', phase === 'on' || phase === 'done');
			li.classList.toggle('is-pending', phase === 'pending');
			if (phase === 'on') button.setAttribute('aria-current', 'step');
			else button.removeAttribute('aria-current');
		});
		const x = railXs[activePlaceIndex];
		if (x !== undefined) railDone?.setAttribute('x2', String(x));
		scrollRailPin(activePlaceIndex);
	}

	/** 纵轴的当前站：年和站是同一份数据，高亮跟着导览走。 */
	function paintYearRail(activePlaceIndex: number): void {
		if (!yearRailEl) return;
		const activeId = activePlaces()[activePlaceIndex]?.id;
		yearRailEl.querySelectorAll<HTMLButtonElement>('button[data-traj-place]').forEach((button) => {
			const on = button.dataset.trajPlace === activeId;
			button.closest('li')?.classList.toggle('is-on', on);
			if (on) button.setAttribute('aria-current', 'step');
			else button.removeAttribute('aria-current');
		});
	}

	function paintGuidePhases(index: number): void {
		paintRail(index, (placeIndex) =>
			placeIndex === index ? 'on' : placeIndex < index ? 'done' : 'pending',
		);
		paintYearRail(index);
	}

	function paintChronoPhases(activeChrono: number, activePlaceIndex: number): void {
		const phaseOf = new Map<number, RailPinPhase>();
		listChrono().forEach((station, index) => {
			if (station.discId !== selectedDiscId) return;
			const phase = chronoMarkerPhase(index, activeChrono);
			phaseOf.set(station.index, phase === 'active' ? 'on' : phase === 'visited' ? 'done' : 'pending');
		});
		paintRail(activePlaceIndex, (placeIndex) => phaseOf.get(placeIndex) ?? 'pending');
		paintYearRail(activePlaceIndex);
	}

	function paintGuideRail(index: number): void {
		if (!selectedDiscId) {
			hideRail();
			return;
		}
		const disc = discs.get(selectedDiscId);
		if (!disc) return;
		ensureRail(disc);
		paintGuidePhases(index);
	}

	function paintChronoRail(activeChrono: number, activePlaceIndex: number): void {
		if (!selectedDiscId) {
			hideRail();
			return;
		}
		const disc = discs.get(selectedDiscId);
		if (!disc) return;
		ensureRail(disc);
		paintChronoPhases(activeChrono, activePlaceIndex);
	}

	/** Bead progress on the year axis. Same eased u as the map bead. */
	function syncRailBead(fromIndex: number, toIndex: number, eased: number): void {
		if (!railEl || railEl.hidden) return;
		const from = railXs[fromIndex];
		const to = railXs[toIndex];
		if (from === undefined || to === undefined) return;
		railDone?.setAttribute('x2', String(from + (to - from) * eased));
	}

	function layoutActiveRail(): void {
		if (!railEl || railEl.hidden || !selectedDiscId) return;
		const disc = discs.get(selectedDiscId);
		if (!disc) return;
		applyRailGeometry(disc);
		if (viewMode === 'chrono') {
			const station = listChrono()[chronoIndex];
			if (station) paintChronoPhases(chronoIndex, station.index);
			return;
		}
		paintGuidePhases(currentIndex);
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
			const on = phase === 'active';
			// Same shell, no role mark: the year walk never grows an icon wall.
			paintPin(dot, null, style.radius * 4, 0, on, phase === 'pending', style.fillOpacity);
			dot.marker.getTooltip()?.getElement()?.classList.toggle('is-on', on);
			dot.pulse.getElement()?.querySelector('.traj-pulse')?.classList.remove('is-on');
		}
	}

	/** Teardrop shell in a DivIcon. The anchor is the point, never the head centre. */
	function pinIcon(kind: PinRoleGlyph | null, head: number, mark: number): L.DivIcon {
		const size = pinShellSize(head);
		return L.divIcon({
			className: 'traj-pin',
			html: pinBodyHtml(kind, mark),
			iconSize: [size.width, size.height],
			iconAnchor: [size.anchorX, size.anchorY],
		});
	}

	/** One pin's shell and state. The point stays put: only fill and mark change. */
	function paintPin(
		dot: Dot,
		kind: PinRoleGlyph | null,
		head: number,
		mark: number,
		active: boolean,
		dim: boolean,
		opacity = 1,
	): void {
		const key = `${kind ?? '-'}:${head}:${mark}`;
		if (dot.pinKey !== key || !dot.marker.getElement()) {
			dot.marker.setIcon(pinIcon(kind, head, mark));
			dot.pinKey = key;
		}
		const el = dot.marker.getElement();
		el?.classList.toggle('is-active', active);
		el?.classList.toggle('is-dim', dim);
		el?.classList.toggle('is-empty', !kind || mark <= 0);
		if (el) el.style.opacity = opacity === 1 ? '' : String(opacity);
		dot.marker.setZIndexOffset(active ? 600 : 0);
	}

	/** The last arrival that played the pop: one shot per station, never a loop. */
	let poppedKey: string | null = null;

	/**
	 * Arrival shot: the pin springs back from -2px and the mark gives one small
	 * wobble, both inside `--traj-pin-pop-ms`. Reduced motion skips it whole.
	 */
	function popPin(dot: Dot): void {
		const el = dot.marker.getElement();
		if (!el || reduceMotion()) return;
		el.classList.remove('is-pin-pop');
		// Read the width so the same element can replay the shot.
		void el.offsetWidth;
		el.classList.add('is-pin-pop');
		el.querySelector('.traj-pin-body')?.addEventListener(
			'animationend',
			() => el.classList.remove('is-pin-pop'),
			{ once: true },
		);
	}

	/**
	 * One dot's role mark. Never for a cross-disc cluster, for the catalog with
	 * no disc picked, or below the `GLYPH_MIN_ZOOM` soft floor: those stay an
	 * empty pin. Above the floor the density tier decides, not the zoom.
	 */
	function pinGlyphOf(dot: Dot): PinRoleGlyph | null {
		if (viewMode === 'chrono' || selectedDiscId === null) return null;
		if (map.getZoom() < GLYPH_MIN_ZOOM) return null;
		const stop = dot.stops[0];
		if (!stop || dot.stops.length !== 1 || stop.discId !== selectedDiscId) return null;
		return rolePinGlyph(dot.place.role);
	}

	/**
	 * Sparse / medium / dense / ultra for the weak pins right now: the count of
	 * mark candidates inside the map viewport and their median pixel gap.
	 * Measured on zoomend, moveend, resize and a disc change — never per frame.
	 */
	function weakPinTier(): PinDensityTier {
		const bounds = map.getBounds();
		const points: Array<{ x: number; y: number }> = [];
		let count = 0;
		for (const dot of dots) {
			if (!pinGlyphOf(dot)) continue;
			const latLng = L.latLng(dot.place.lat, dot.place.lon);
			if (!bounds.contains(latLng)) continue;
			count += 1;
			if (count > PIN_DENSITY_PAIR_LIMIT) continue;
			points.push(map.latLngToContainerPoint(latLng));
		}
		const median = count > PIN_DENSITY_PAIR_LIMIT ? 0 : medianPairPx(points);
		return pinDensityTier(count, median);
	}

	function paintMarkers(index: number): void {
		if (viewMode === 'chrono') {
			paintChronoMarkers(chronoIndex);
			return;
		}
		const catalog = selectedDiscId === null;
		// One measurement per paint: a lone stop grows, a crowded viewport yields.
		const tier = weakPinTier();
		pinTier = tier;
		const style = PIN_DENSITY[tier];
		// The head keeps the old rest / active diameter. Dense tiers drop the mark
		// but stay teardrops: the point is still the anchor.
		const restHead = style.restR * 2;
		const activeHead = style.activeR * 2;
		const nearIds = new Set(
			(localNearStops(activePlaces(), index) ?? []).map((place) => place.id),
		);
		for (const dot of dots) {
			const onDisc = !catalog && dot.stops.some((stop) => stop.discId === selectedDiscId);
			const on = dot.stops.some((stop) => stop.discId === selectedDiscId && stop.index === index);
			const done = dot.stops.some((stop) => stop.discId === selectedDiscId && stop.index <= index);
			const sibling =
				onDisc &&
				!on &&
				dot.stops.some((stop) => {
					if (stop.discId !== selectedDiscId) return false;
					const id = discs.get(stop.discId)?.places[stop.index]?.id;
					return id !== undefined && nearIds.has(id);
				});
			const glyph = pinGlyphOf(dot);
			const pending = !(on || sibling || done);
			const mark = style.activeMarkPx > 0 ? (on ? style.activeMarkPx : style.restMarkPx) : 0;
			// Engraved at rest, relief when active: the CSS tokens cross-fade them.
			paintPin(
				dot,
				glyph,
				on ? activeHead : restHead,
				mark,
				on,
				pending,
				catalog ? 0.55 : !onDisc ? 0.45 : pending ? PIN_PENDING_OPACITY : 1,
			);
			dot.marker.getTooltip()?.getElement()?.classList.toggle('is-on', on);
			dot.pulse.getElement()?.querySelector('.traj-pulse')?.classList.toggle('is-on', on);
			// The shot waits for the settle: a cruise never pops a half-arrived pin.
			if (!on || flying) continue;
			const key = `${dot.place.id}:${index}`;
			if (poppedKey === key) continue;
			poppedKey = key;
			popPin(dot);
		}
	}

	/** Zoom end and selection changes only. A glyph never rides the chrono bead. */
	function repaintMarkers(): void {
		if (viewMode === 'chrono') paintChronoMarkers(chronoIndex);
		else paintMarkers(selectedDiscId === null ? -1 : currentIndex);
	}

	/**
	 * Density is re-measured at most once per `PIN_DENSITY_THROTTLE_MS` on
	 * zoomend / moveend / resize — never on mousemove, never per frame. An
	 * unchanged tier repaints nothing, so no `setIcon` fires on a drag.
	 */
	function schedulePinDensity(): void {
		if (pinTierTimer !== 0) return;
		pinTierTimer = window.setTimeout(() => {
			pinTierTimer = 0;
			if (weakPinTier() === pinTier) return;
			repaintMarkers();
		}, PIN_DENSITY_THROTTLE_MS);
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

	function fitActiveDisc(): boolean {
		const frame = openingFrame(activePlaces());
		if (!frame) return false;
		const size = map.getSize();
		if (size.x < 20 || size.y < 20) return false;
		map.fitBounds(L.latLngBounds([frame.south, frame.west], [frame.north, frame.east]), {
			padding: [72, 40],
			animate: false,
			maxZoom: VECTOR_BASEMAP.frameMaxZoom,
		});
		return true;
	}

	/**
	 * Opening or switching a disc frames its whole region once, before the
	 * first arrival. Coming back to the guide never re-frames: the reader keeps
	 * the camera they left.
	 */
	function frameDiscOnce(): boolean {
		if (!selectedDiscId || fittedDisc === selectedDiscId) return false;
		if (!fitActiveDisc()) return false;
		fittedDisc = selectedDiscId;
		return true;
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
		paintGuideRail(index);
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
		hideRail();
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
		const wait = !reduceMotion() && card?.classList.contains('is-out') ? CARD_FADE_MS : 0;
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
		// Guide and playback hold the vertical gesture on the stage, so the page
		// never moves first. Explore hands it back to the map.
		stageEl?.classList.toggle('is-guide-lock', stageStepsStation({ viewMode, mode }));
		// 章节壳要按当前手势归属决定让不让竖滑：探索态它一个 delta 都不接。
		const viewChanged = root.dataset.trajView !== viewMode;
		root.dataset.trajView = viewMode;
		// 进／出探索：旧 arm 一格都不带走（探索是地图的，回来要重新到边、松手）。
		if (viewChanged) {
			root.dispatchEvent(new CustomEvent('traj:view', { detail: { viewMode } }));
		}
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

	function syncCruiseSheet(zoom: number, previousZoom: number, owner: number): void {
		const sheet = sheetFreeze;
		const action = sheetCruiseAction({
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

	/**
	 * Natural Earth has no streets: a scripted arrival that fits the local
	 * cluster at the explore cap lands inside a land polygon and turns the
	 * sheet into cream. Guide and playback keep the opening fit's ceiling;
	 * explore still reaches the full basemap cap.
	 */
	function nearFitMaxZoom(): number {
		return viewMode === 'explore' || interactions
			? VECTOR_BASEMAP.maxZoom
			: VECTOR_BASEMAP.frameMaxZoom;
	}

	/**
	 * The frame the arrival fit lands on: the box centred in the magnet safe
	 * frame at the same capped zoom `fitBounds` would pick. The cruise aims
	 * here, so the landing *is* the fit and nothing has to fit twice.
	 */
	function localNearTarget(frame: LonLatBounds): { center: LngLat; zoom: number } | null {
		const size = map.getSize();
		if (size.x < 20 || size.y < 20) return null;
		const bounds = L.latLngBounds([frame.south, frame.west], [frame.north, frame.east]);
		const insets = magnetInsets(window.innerWidth);
		// Same safe frame as the landing: the zoom only has to hold it.
		const pad = magnetZoomPadding(insets);
		const zoom = map.getBoundsZoom(bounds, false, L.point(pad.x, pad.y));
		if (!Number.isFinite(zoom)) return null;
		const capped = Math.min(nearFitMaxZoom(), Math.max(VECTOR_BASEMAP.minZoom, zoom));
		// `fitBounds` centres the box in the padded frame, which sits half the
		// inset difference away from the plain box centre.
		const fit = magnetFitPadding(insets);
		const shift = L.point(
			(fit.bottomRight.x - fit.topLeft.x) / 2,
			(fit.bottomRight.y - fit.topLeft.y) / 2,
		);
		const mid = map
			.project(bounds.getSouthWest(), capped)
			.add(map.project(bounds.getNorthEast(), capped))
			.divideBy(2)
			.add(shift);
		const center = map.unproject(mid, capped);
		return { center: { lon: center.lng, lat: center.lat }, zoom: capped };
	}

	/**
	 * Frame every same-disc stop in the local cluster. A lone pin returns false
	 * and keeps `arrivalZoom` — this does not push the city cap for one stop.
	 * The padding is the arrival safe frame, read per breakpoint, so the cluster
	 * lands where a single pin does: never flush with the edge or the year rail.
	 * The cruise lands on this same frame, so a camera already there stays put:
	 * a second fit would be the tremble this removes.
	 */
	function fitLocalNear(index: number): boolean {
		const bounds = localNearFrame(activePlaces(), index);
		if (!bounds) return false;
		const target = localNearTarget(bounds);
		if (!target) return false;
		if (overview && viewMode === 'explore') catalogFitted = true;
		const size = map.getSize();
		const landed =
			Math.abs(map.getZoom() - target.zoom) < FIT_EPS_ZOOM &&
			map
				.latLngToContainerPoint([target.center.lat, target.center.lon])
				.distanceTo(L.point(size.x / 2, size.y / 2)) < FIT_EPS_PX;
		if (landed) return true;
		const pad = magnetFitPadding(magnetInsets(window.innerWidth));
		map.fitBounds(L.latLngBounds([bounds.south, bounds.west], [bounds.north, bounds.east]), {
			paddingTopLeft: L.point(pad.topLeft.x, pad.topLeft.y),
			paddingBottomRight: L.point(pad.bottomRight.x, pad.bottomRight.y),
			animate: false,
			maxZoom: nearFitMaxZoom(),
		});
		return true;
	}

	/** Cruise target for that frame. Null for a lone pin, which stays on arrivalZoom. */
	function localNearCamera(index: number): { center: LngLat; zoom: number } | null {
		const frame = localNearFrame(activePlaces(), index);
		if (!frame) return null;
		return localNearTarget(frame);
	}

	/**
	 * Arrival magnet. After the settle the point is nudged into the safe frame:
	 * a lone pin to the frame's optical centre, a near cluster's box back inside
	 * the same inset. Pan only — the settle zoom is already fixed, and a point
	 * already in frame (plus slack) is left exactly where it landed.
	 */
	function snapActivePin(index: number): void {
		if (magnetSkips({ viewMode, flying }) || interactions) return;
		const places = activePlaces();
		const place = places[index];
		if (!place) return;
		const size = map.getSize();
		if (size.x < 40 || size.y < 40) return;
		const insets = magnetInsets(window.innerWidth);
		const near = localNearFrame(places, index);
		let offset: { x: number; y: number } | null;
		if (near) {
			const nw = map.latLngToContainerPoint([near.north, near.west]);
			const se = map.latLngToContainerPoint([near.south, near.east]);
			offset = magnetRectOffset({
				rect: {
					x: Math.min(nw.x, se.x),
					y: Math.min(nw.y, se.y),
					width: Math.abs(se.x - nw.x),
					height: Math.abs(se.y - nw.y),
				},
				size,
				insets,
			});
		} else {
			offset = magnetOffset({
				point: map.latLngToContainerPoint([place.lat, place.lon]),
				size,
				insets,
			});
		}
		if (!offset) return;
		map.panBy([offset.x, offset.y], {
			animate: !reduceMotion(),
			duration: magnetSettleMs(reduceMotion()) / 1000,
		});
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
		const pin = { lon: place.lon, lat: place.lat };
		const framed = localNearCamera(index);
		const to = framed?.center ?? pin;
		const zoomTo = framed?.zoom ?? arrivalZoom(place.zoom);
		const center = map.getCenter();
		const from = { lon: center.lng, lat: center.lat };
		const zoomFrom = map.getZoom();
		const km = haversineKm(from, to);
		if (km < 1 && Math.abs(zoomFrom - zoomTo) < 0.15) {
			if (!fitLocalNear(index)) map.setView([pin.lat, pin.lon], zoomTo, { animate: false });
			snapActivePin(index);
			setProgress(index, pin);
			return token === playToken;
		}
		if (reduceMotion()) {
			if (!fitLocalNear(index)) map.setView([pin.lat, pin.lon], zoomTo, { animate: false });
			// Reduced motion: the frame is the terminal state, not a slide into it.
			snapActivePin(index);
			setProgress(index, pin);
			return token === playToken;
		}
		const ocean = isOceanLeg(km);
		const phrase = fromPlace ? oceanLegPhrase(fromPlace, pin) : null;
		const routeFrom = index > 0 ? activePlaces()[index - 1] : from;
		const leg = routeFrom ? arc(routeFrom, pin, 48) : arc(from, pin, 48);
		const prefix = prefixLatLngs(index);
		const duration = legFlyMs(km, false);
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
				syncCruiseSheet(zoom, previousZoom, mine);
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
			// One landing: the cruise already ends on the final zoom, so thaw on
			// this camera-end frame and let the fit confirm it. Nothing pushes the
			// zoom afterwards. Names stay hidden through the landing.
			labelHold = mine;
			thawSheet(mine);
			return true;
		} finally {
			if (flight === mine) {
				labelHold = 0;
				thawSheet(mine);
				flying = false;
				if (token === playToken) {
					// Zoom is stable now: confirm the frame, then magnet into it.
					fitLocalNear(index);
					snapActivePin(index);
				}
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
		paintChronoRail(index, station.index);
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
				if (station.discId === selectedDiscId && next.discId === selectedDiscId) {
					syncRailBead(station.index, next.index, easeInOut(u));
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
		if (mode === 'play') hold();
		if (viewMode === 'chrono') {
			// 显式换站顶掉了还在等落稳的那一步：销账，别把忙态永久挂住。
			bridge.abandon();
			stationAction = null;
			seekChronoPlace(discId, index);
			return;
		}
		if (viewMode === 'explore') {
			playToken += 1;
			flight += 1;
			flying = false;
			labelHold = 0;
			thawSheet(null);
			// 探索是地图的：站落稳的账在这里销掉，别让旧 gid 借一次点选复活。
			bridge.abandon();
			stationAction = null;
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
			fitLocalNear(index);
			return;
		}
		// 这一步若是手势发起的站动作，`end` 已冻结它的来源身份：起飞前取走，
		// 之后只有真实飞行＋旁白完成才能拿它去 settle。
		const action = takeStationAction();
		const token = ++playToken;
		// 桌面／独立地图：这一步从起飞到卡片落稳都由 420ms 窗口吞掉手势（基线行为）。
		if (!bridgeOn()) stationSettledAt = performance.now() + STATION_FLIGHT_LOCK_MS;
		// 不是手势发起的换站（点站表／播放／深链）顶掉了还在等落稳的那一步：销账，
		// 不让它永远挂着。手势那一步的账正是 end() 刚记下的，不能在这里销。
		if (!action) bridge.abandon();
		const discChanged = selectedDiscId !== discId;
		selectedDiscId = discId;
		mode = 'paused';
		showPanel();
		if (discChanged) {
			redrawGhost();
			frameDiscOnce();
		}
		updateButtons();
		const place = activePlaces()[index];
		if (!place) {
			// 没有这个站：这一步不会有真实落稳，销账，别把之后的每一次手势都判成不合格。
			settleStation(action, { flew: false, revealed: false, token, currentToken: playToken });
			return;
		}
		const fromPlace =
			!discChanged && index === currentIndex + 1 ? activePlaces()[currentIndex] : undefined;
		currentIndex = index;
		if (shownKey !== `${selectedDiscId}:${place.id}`) fadeOut();
		const flew = await flyTo(place, index, token, fromPlace);
		if (!flew || token !== playToken) {
			// 飞行被取消／被后来的意图顶掉：真实落稳永远不会来，同样销账（不发 ready）。
			settleStation(action, { flew: false, revealed: false, token, currentToken: playToken });
			return;
		}
		const revealed = await showNarration(place, index, token);
		if (!bridgeOn()) stationSettledAt = performance.now() + STATION_FLIGHT_LOCK_MS;
		// 旁白没上卡（被后来的播放／暂停／换站顶掉）：这次落稳不会发生。
		// 销账（不发 ready），否则异步所有权会一直挂着，之后的每个手势都被判不合格。
		if (!revealed) {
			settleStation(action, { flew: false, revealed: false, token, currentToken: playToken });
			return;
		}
		// 真实落稳：飞行完成、旁白真的上了卡、token 还是这一次。三者缺一都不报 ready。
		settleStation(action, { flew, revealed, token, currentToken: playToken });
	}

	/** 本站点合法 hash（站点 DOM id `${disc.id}-${place.id}`）→ 已验证的站目标。 */
	function placeFromHash(
		raw = location.hash,
	): { discId: string; placeId: string; index: number } | null {
		const hash = raw.replace(/^#/, '');
		if (!hash) return null;
		let id = hash;
		try {
			id = decodeURIComponent(hash);
		} catch {
			return null;
		}
		const button = root.querySelector<HTMLButtonElement>(`#${CSS.escape(id)}`);
		if (!button?.dataset.disc || !button.dataset.trajPlace) return null;
		const discId = button.dataset.disc;
		const placeId = button.dataset.trajPlace;
		// 目标只认本站碟真实存在的 place：畸形／别的碟的 hash 不是站目标。
		const index = stationTargetIndex(discs, discId, placeId);
		if (index < 0) return null;
		return { discId, placeId, index };
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
			// The whole teardrop is the obstacle: the head sits above the point.
			const pin = elementBox(dot.marker.getElement());
			if (pin) obstacles.push(pin);
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
		if (mode === 'play') hold();
		if (viewMode === 'chrono') {
			seekChronoIndex(chronoIndex - 1, false);
			return;
		}
		if (!selectedDiscId) {
			bridge.abandon();
			stationAction = null;
			return;
		}
		void focusPlace(selectedDiscId, Math.max(0, currentIndex - 1));
	});
	nextBtn?.addEventListener('click', () => {
		userTookOver = true;
		if (mode === 'play') hold();
		if (viewMode === 'chrono') {
			seekChronoIndex(chronoIndex + 1, false);
			return;
		}
		if (!selectedDiscId) {
			bridge.abandon();
			stationAction = null;
			return;
		}
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

	function activatePlace(discId: string, placeId: string): void {
		const disc = discs.get(discId);
		if (!disc) return;
		const index = disc.places.findIndex((place) => place.id === placeId);
		if (index < 0) return;
		// While the stage holds the gesture (guide, chrono, a running tour) a
		// station step must never drag the page: `scrollY` stays where the reader
		// left it. Only a pick that hands the stage back may bring the map along.
		const pageLocked = stageStepsStation({ viewMode, mode });
		void focusPlace(discId, index);
		if (pageLocked) return;
		mapEl.scrollIntoView({ behavior: reduceMotion() ? 'auto' : 'smooth', block: 'nearest' });
	}

	/**
	 * 碟页章节壳交给地图的两件事：进地图章才挂上（`traj:show`）、离章 pause
	 * （`traj:pause`）；以及壳里「点框外回导览」（`traj:guide`）。壳只看归属，
	 * 站点、播放与探索的语义都不动。
	 */
	root.addEventListener('traj:show', () => {
		map.invalidateSize();
		frameDiscOnce();
		declutter();
		if (!selectedDiscId) return;
		if (viewMode === 'chrono') paintChronoRail(chronoIndex, currentIndex);
		else paintGuideRail(currentIndex);
	});
	// 壳里 arm＝人工停住自动播：只停播放，不动手势资格与站落稳的账。
	root.addEventListener('traj:hold', () => {
		if (mode === 'play') hold();
	});
	root.addEventListener('traj:pause', () => {
		bridgeCancel();
		bridge.reset();
		// 停掉自动播＝底层这次飞行／旁白真的被顶掉：账一起销，不留永久忙态。
		if (mode === 'play') {
			hold();
			bridge.abandon();
			stationAction = null;
		}
	});
	// 合法本站点 hash：壳挂好以后来问一次，认到才回一个已验证的站目标。
	root.addEventListener('traj:query-target', (event) => {
		const hash = (event as CustomEvent<{ hash: string }>).detail?.hash ?? '';
		const target = placeFromHash(hash);
		if (!target) return;
		root.dispatchEvent(new CustomEvent('traj:station-target', { detail: target }));
	});
	// 壳已经把地图章切上来（可见、尺寸量过）：真实选中这一站，不另造一遍换站路线。
	root.addEventListener('traj:station-focus', (event) => {
		const target = (event as CustomEvent<StationTarget>).detail;
		if (!isStationTarget(target)) return;
		if (stationTargetIndex(discs, target.discId, target.placeId) !== target.index) return;
		void focusPlace(target.discId, target.index);
	});
	// 壳那边已作废（blur／hidden）：撤销 ready 资格，但飞行／旁白若还在跑就继续持有所有权。
	root.addEventListener('traj:cancel', () => {
		bridgeCancel();
		bridge.reset();
	});
	root.addEventListener('traj:guide', () => {
		if (viewMode !== 'explore') return;
		viewMode = 'guide';
		setInteractions(false);
	});

	root.querySelectorAll<HTMLButtonElement>('.traj-stops [data-traj-place]').forEach((button) => {
		button.addEventListener('click', () => {
			const discId = button.dataset.disc;
			const placeId = button.dataset.trajPlace;
			if (!discId || !placeId) return;
			activatePlace(discId, placeId);
		});
	});
	// 图下横轴与左纵年轴共用一套钉子：点哪个都跳站（含探索态）。
	root.addEventListener('click', (event) => {
		const target = event.target;
		if (!(target instanceof Element)) return;
		const button = target.closest('button[data-traj-place]');
		if (!(button instanceof HTMLButtonElement)) return;
		const onRail = railEl?.contains(button) === true || yearRailEl?.contains(button) === true;
		if (!onRail) return;
		const discId = button.dataset.disc;
		const placeId = button.dataset.trajPlace;
		if (!discId || !placeId) return;
		activatePlace(discId, placeId);
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

	/**
	 * One station per gesture, on the whole stage — map, year rail, narration and
	 * controls — never on `document` or `body`. The guide steps with `focusPlace`,
	 * the chrono rail with `seekChronoIndex`. Explore keeps the map: no step and
	 * no `preventDefault`, so Leaflet's wheel and drag stay in charge. A catalog
	 * with no disc picked does not step, and an end of the disc hands the gesture
	 * back to the page.
	 */
	const WHEEL_STEP_PX = 80;
	const TOUCH_STEP_PX = 56;
	const GESTURE_LOCK_MS = 560;
	/** Quiet time that ends a wheel gesture: after it, a new gesture starts fresh. */
	const WHEEL_GESTURE_IDLE_MS = 200;
	let wheelAcc = 0;
	let lockDir: 1 | -1 = 1;
	let lockUntil = 0;
	/** This gesture already took the page, so it keeps it until the wheel rests. */
	let wheelHeld = false;
	let wheelGestureUntil = 0;
	let touchHeld = false;

	/**
	 * 窄屏章节壳的地图章桥（`root.dataset.chapterBridge === 'on'` 时才说话）。
	 *
	 * 手势入口仍然只有一个：这里。壳不管换站，地图不管跨章——这里只报
	 * 「这一次 gid 有没有被站动作吃掉」「到了端点且真落稳了没有」和站 probe；
	 * 跨章提交由壳自己的状态机决定。桌面／全馆地图原样不动。
	 *
	 * 身份（gid／主指／方向／发起时 epoch）在 `end` 那一刻冻结，落稳消息只在
	 * **真实飞行＋旁白完成**且 token 仍是当前那一次时才发出——不靠任何 busy 计时器。
	 */
	const bridgeOn = (): boolean => root.dataset.chapterBridge === 'on';
	const bridgeEpoch = (): number => Number(root.dataset.chapterEpoch ?? '0');

	function emitBridge(detail: TrapGestureDetail): void {
		root.dispatchEvent(new CustomEvent('traj:gesture', { detail }));
	}

	const bridge = createStationBridge({
		active: bridgeOn,
		epoch: bridgeEpoch,
		canStep: (dir) => canStep(dir),
		// 上一站的飞行／旁白还没落稳：此刻按下的手指整次不具跨章资格。
		busy: () => flying || bridge.settling(),
	});
	/** `end` 冻结下来的站动作：飞行＋旁白真的完成后才用它去 settle。 */
	let stationAction: StationAction | null = null;

	function bridgeBegin(touch: Touch, touchCount: number): void {
		const detail = bridge.begin(touch, touchCount);
		if (detail) emitBridge(detail);
	}

	function bridgeMove(touch: Touch, touchCount: number, dir: 1 | -1 | 0): void {
		const detail = bridge.move(touch, touchCount, dir);
		if (detail) emitBridge(detail);
	}

	function bridgeEnd(touch: Touch, touchCount: number, dir: 1 | -1 | 0, station: boolean): void {
		const result = bridge.end(touch, touchCount, dir, station);
		if (result.gesture) emitBridge(result.gesture);
		if (result.settled) emitStationSettled(result.settled);
		// 只有真正属于原主指的 end 才能动这笔账：别的手指先抬不能替它落款，
		// 也**不能**把还在跑的异步身份抹掉——那会让忙态永久挂住。
		if (result.action) stationAction = result.action;
	}

	/**
	 * 撤销本次手势与它的 ready 资格。
	 *
	 * **不动 `stationAction`**：飞行／旁白若还在跑，异步完成回来时仍要用它销账，
	 * 否则异步所有权会永远挂着，之后的每个手势都被判不合格。
	 */
	function bridgeCancel(): void {
		const detail = bridge.cancel();
		if (detail) emitBridge(detail);
	}

	function emitStationSettled(settled: TrapSettledDetail): void {
		root.dispatchEvent(new CustomEvent('traj:station-settled', { detail: settled }));
	}

	/**
	 * 站真落稳（飞行＋旁白完成）＋源身份与当前那次一致时，才把「端点可交接」
	 * 报给壳。中间站不报：这一 gid 只换了站，跨章要靠下一次确认。
	 */
	function settleStation(action: StationAction | null, outcome: StationSettle): void {
		if (!action) return;
		if (stationAction === action) stationAction = null;
		const settled = bridge.settle(action, outcome);
		if (settled) emitStationSettled(settled);
	}

	/** 取走本次 `end` 冻结的站动作：只有真正由手势发起的那一步才等落稳。 */
	function takeStationAction(): StationAction | null {
		const action = stationAction;
		stationAction = null;
		return action;
	}

	/**
	 * Mid-flight or mid-settle: a wheel notch is swallowed, never stacked.
	 *
	 * 手机章节壳用真实桥（飞行＋旁白真落稳）；桌面／独立地图保持基线的 420ms 窗口。
	 */
	function stationInFlight(): boolean {
		if (bridgeOn()) return flying || bridge.settling();
		return flying || performance.now() < stationSettledAt;
	}

	/** Read-only: the page is scrolling, so nothing here takes the wheel for a step. */
	function pageScrollCooldown(): boolean {
		return performance.now() - lastPageScrollAt < PAGE_SCROLL_COOLDOWN_MS;
	}

	window.addEventListener(
		'scroll',
		() => {
			lastPageScrollAt = performance.now();
		},
		{ passive: true },
	);

	function canStep(dir: 1 | -1): boolean {
		if (viewMode === 'chrono') {
			const next = chronoIndex + dir;
			return next >= 0 && next < listChrono().length;
		}
		if (!selectedDiscId) return false;
		const next = currentIndex + dir;
		return next >= 0 && next < activePlaces().length;
	}

	function stepStation(dir: 1 | -1): void {
		if (mode === 'play') hold();
		if (viewMode === 'chrono') {
			seekChronoIndex(chronoIndex + dir, false);
			// Chrono lands synchronously when paused; a running chrono settles later
			// and never arms by itself (no auto chapter leave).
			if (mode === 'paused') {
				// Chrono 落站是同步的：只有真的停在端站、且这一 gid 是站动作时才 ready。
				settleStation(takeStationAction(), {
					flew: true,
					revealed: true,
					token: playToken,
					currentToken: playToken,
				});
			}
			return;
		}
		if (!selectedDiscId) {
			// 没有碟就没有这一步：销账，别让异步所有权永久挂着。
			bridge.abandon();
			stationAction = null;
			return;
		}
		void focusPlace(selectedDiscId, currentIndex + dir);
	}

	stageEl = root.querySelector<HTMLElement>('.traj-stage');
	/**
	 * Guide, chrono, and a running tour step. Explore leaves the stage to the map:
	 * 探索里框内只拖捏——竖滑不换站，也不把页面拖走。
	 */
	const stageOwnsGesture = () => mapSteppingStations(viewMode) && stageStepsStation({ viewMode, mode });

	/**
	 * 地图框内的控件、链接、站表与选区自己拥有手势：竖滑在那里既不是一步换站，
	 * 也不是一次跨章确认。
	 */
	function listOwnsGesture(target: EventTarget | null): boolean {
		return ownsInteractiveGesture(target) || hasLiveSelection();
	}

	stageEl?.addEventListener(
		'wheel',
		(event) => {
			if (event.ctrlKey || event.deltaY === 0) return;
			if (!stageOwnsGesture()) return;
			if (listOwnsGesture(event.target)) return;
			if (!isStationSwipe({ dx: event.deltaX, dy: event.deltaY })) return;
			const dir: 1 | -1 = event.deltaY > 0 ? 1 : -1;
			const now = performance.now();
			if (now >= wheelGestureUntil) wheelHeld = false;
			wheelGestureUntil = now + WHEEL_GESTURE_IDLE_MS;
			// A gesture that *begins* at an end of the disc is the page's: nothing is
			// prevented and the wheel scrolls as usual. Once this gesture has taken
			// the stage it keeps it to its end — a step that lands on the last
			// station must not hand the page the rest of the same flick.
			if (!canStep(dir)) {
				if (!wheelHeld) {
					wheelAcc = 0;
					return;
				}
				event.preventDefault();
				wheelAcc = 0;
				return;
			}
			// Captured on the stage with `passive: false`, so a notch over the
			// narration or the city name cannot carry the document along. The step
			// is taken first and the page left alone, whatever the cooldown, the
			// flight or the lock say about the stations.
			event.preventDefault();
			wheelHeld = true;
			// A page scroll, a flight, or the lock only swallows the step: the page
			// stays put, so a step can never look like a failed lock.
			if (pageScrollCooldown() || stationInFlight()) {
				wheelAcc = 0;
				return;
			}
			if (now < lockUntil) {
				if (dir !== lockDir) wheelAcc = 0;
				return;
			}
			if (wheelAcc !== 0 && Math.sign(wheelAcc) !== dir) wheelAcc = 0;
			wheelAcc += event.deltaY;
			if (Math.abs(wheelAcc) < WHEEL_STEP_PX) return;
			wheelAcc = 0;
			lockDir = dir;
			lockUntil = performance.now() + GESTURE_LOCK_MS;
			stepStation(dir);
		},
		{ passive: false, capture: true },
	);

	let touchFrom: { x: number; y: number } | null = null;
	stageEl?.addEventListener(
		'touchstart',
		(event) => {
			// A finger on the stop list scrolls the list, never the stations.
			touchHeld = false;
			if (listOwnsGesture(event.target)) {
				touchFrom = null;
				return;
			}
			const touch = event.touches[0];
			touchFrom = touch ? { x: touch.clientX, y: touch.clientY } : null;
			// Second finger: the shell's bridge voids this gesture, no restart on the leftover.
			if (event.touches.length > 1) {
				bridgeCancel();
				return;
			}
			// Explore stays the map's: no station step, no bridge, no shell chapter move.
			if (touch && stageOwnsGesture()) bridgeBegin(touch, event.touches.length);
		},
		{ passive: true },
	);
	stageEl?.addEventListener(
		'touchmove',
		(event) => {
			const touch = event.touches[0];
			if (!touchFrom || !touch) return;
			if (!stageOwnsGesture()) return;
			if (listOwnsGesture(event.target)) return;
			const dx = touchFrom.x - touch.clientX;
			const dy = touchFrom.y - touch.clientY;
			bridgeMove(touch, event.touches.length, dy > 0 ? 1 : dy < 0 ? -1 : 0);
			if (!isStationSwipe({ dx, dy })) return;
			if (Math.abs(dy) < TOUCH_STEP_PX) return;
			// A finger that starts at an end of the disc still scrolls the page; a
			// finger that has already taken the stage keeps it to its end.
			if (!canStep(dy > 0 ? 1 : -1)) {
				if (!touchHeld) return;
				event.preventDefault();
				return;
			}
			// The page is pinned for the whole swipe; the cooldown only swallows the
			// step, it never lets the document drift under the finger.
			event.preventDefault();
			touchHeld = true;
		},
		{ passive: false },
	);
	stageEl?.addEventListener(
		'touchend',
		(event) => {
			const from = touchFrom;
			touchFrom = null;
			const touch = event.changedTouches[0];
			if (!from || !touch) return;
			if (!stageOwnsGesture()) return;
			const dx = from.x - touch.clientX;
			const dy = from.y - touch.clientY;
			const axisDir: 1 | -1 | 0 = dy > 0 ? 1 : dy < 0 ? -1 : 0;
			const dir: 1 | -1 = axisDir === 0 ? 1 : axisDir;
			const swipe =
				axisDir !== 0 && isStationSwipe({ dx, dy }) && Math.abs(dy) >= TOUCH_STEP_PX;
			// A landed finger is one station: never while a step is still settling,
			// never inside the page-scroll cooldown, and never twice inside the lock.
			const steps =
				swipe &&
				canStep(dir) &&
				!stationInFlight() &&
				!pageScrollCooldown() &&
				performance.now() >= lockUntil;
			bridgeEnd(touch, event.touches.length + 1, axisDir, steps);
			if (!steps) return;
			lockDir = dir;
			lockUntil = performance.now() + GESTURE_LOCK_MS;
			stepStation(dir);
		},
		{ passive: true },
	);
	stageEl?.addEventListener('touchcancel', () => bridgeCancel(), { passive: true });

	/** Stop list: folded under 900px, open above. A real `details`, so it opens by hand. */
	const foldQuery = window.matchMedia('(max-width: 899px)');
	const folds = root.querySelectorAll<HTMLDetailsElement>('.traj-stops-fold');
	const syncFolds = () => {
		folds.forEach((fold) => {
			fold.open = !foldQuery.matches;
		});
	};
	syncFolds();
	foldQuery.addEventListener('change', syncFolds);

	// Guide and play keep the map locked: no click and no wheel on it drops the
	// reader into explore. That hand-over happens on the 「探索」 button only.
	map.on('dragstart', () => {
		catalogFitted = true;
		if (viewMode !== 'chrono' || mode !== 'play') return;
		userTookOver = true;
		hold();
	});

	map.on('zoomend moveend', declutter);
	map.on('zoomend', repaintMarkers);
	map.on('zoomend moveend resize', schedulePinDensity);
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
			paintGuideRail(currentIndex);
			declutter();
			map.invalidateSize();
			frameDiscOnce();
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
	if (deep) fitLocalNear(currentIndex);
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
			// An embedded tour never starts or resumes off the observer: ▶ only.
			if (action !== 'pause') return;
			pausedByViewport = true;
			hold();
		},
		{ threshold: 0.4 },
	);
	observer.observe(mapEl);
	window.addEventListener('resize', () => map.invalidateSize());
	const railTrack = railEl?.querySelector<HTMLElement>('.traj-rail-track');
	if (railTrack) {
		railTrack.addEventListener('scroll', () => syncRailMask(), { passive: true });
		const railObserver = new ResizeObserver(() => layoutActiveRail());
		railObserver.observe(railTrack);
	}
	for (const query of ['(min-width: 641px)', '(min-width: 1280px)']) {
		window.matchMedia(query).addEventListener('change', () => layoutActiveRail());
	}
}

export function mountTrajectoryMaps(scope: ParentNode = document): void {
	scope.querySelectorAll<HTMLElement>('[data-traj-root]').forEach((root) => mount(root));
}
