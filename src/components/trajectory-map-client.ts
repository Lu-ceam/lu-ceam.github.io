/**
 * Leaflet driver for the shared trajectory map.
 * Loaded only from the map component, never from the site layout.
 *
 * Timing (dwell, settle, ocean legs, reduced motion) stays in trajectory-camera.
 * The sheet under the route is local Natural Earth, fetched from public/maps.
 */
import L from 'leaflet';
import { feature, mesh } from 'topojson-client';
import type { GeometryObject, Topology } from 'topojson-specification';
import { BASEMAP_PAINT, PATH_STROKE, VECTOR_BASEMAP, arrivalZoom } from '../data/map-tiles';
import {
	SETTLE_MS,
	arcVertexCount,
	cruiseZoom,
	dwellMs,
	easeInOut,
	haversineKm,
	isOceanLeg,
	legFlyMs,
	legZoom,
	roleLabel,
	settleMs,
	slerpLngLat,
	weakSegments,
	yearText,
	type LngLat,
} from '../data/trajectory-camera';
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

type Dot = {
	discId: string;
	index: number;
	place: Place;
	marker: L.CircleMarker;
	pulse: L.Marker;
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
	let activeId = payload.discs[0]!.id;
	let currentIndex = 0;
	let mode: Mode = 'idle';
	let playToken = 0;
	let narrGen = 0;
	let shownKey = '';
	let userTookOver = false;
	let started = false;
	let interactions = false;
	let pausedByViewport = false;
	let flying = false;
	let sheetLayers: L.Layer[] = [];

	const activePlaces = () => discs.get(activeId)?.places ?? [];

	// Leaflet clips canvas paths when the map gains its first view. Lines added
	// before that, then sent to the back, throw. Frame the opening stop first.
	const deep = placeFromHash();
	const opening = deep ?? { discId: activeId, index: 0 };
	activeId = opening.discId;
	const openingPlace = activePlaces()[opening.index] ?? activePlaces()[0];
	if (openingPlace) currentIndex = opening.index;

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
	}

	const basemapPane = map.createPane('basemap');
	basemapPane.style.zIndex = '350';
	const baseRenderer = L.canvas({ pane: 'basemap', padding: 0.6 });
	const drawRenderer = L.canvas({ padding: 0.5 });

	void loadBasemap();

	if (payload.mode === 'overview') {
		const points = payload.discs.flatMap((disc) =>
			disc.places.map((place) => ({
				recordId: disc.id,
				placeId: place.id,
				city: place.city,
				lon: place.lon,
				lat: place.lat,
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

	const dots: Dot[] = [];
	for (const disc of payload.discs) {
		disc.places.forEach((place, index) => {
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
				void focusPlace(disc.id, index);
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
			dots.push({ discId: disc.id, index, place, marker, pulse });
		});
	}

	function redrawGhost(): void {
		ghost.setLatLngs(routeLatLngs(activePlaces()));
		dimGroup.clearLayers();
		if (payload.mode !== 'overview') return;
		for (const disc of payload.discs) {
			if (disc.id === activeId || disc.places.length < 2) continue;
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
			panel.hidden = panel.dataset.trajDiscPanel !== activeId;
		});
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

	function paintMarkers(index: number): void {
		for (const dot of dots) {
			const onDisc = dot.discId === activeId;
			const on = onDisc && dot.index === index;
			const done = onDisc && dot.index <= index;
			dot.marker.setStyle({
				radius: on ? 5.5 : 3.5,
				fillOpacity: !onDisc ? 0.35 : done ? 1 : 0.45,
				weight: on ? 1.6 : 1.2,
			});
			dot.marker.getTooltip()?.getElement()?.classList.toggle('is-on', on);
			dot.pulse.getElement()?.querySelector('.traj-pulse')?.classList.toggle('is-on', on);
		}
	}

	function declutter(): void {
		if (flying) return;
		const active = dots.find((dot) => dot.discId === activeId && dot.index === currentIndex);
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

	function paintNarration(place: Place, index: number): void {
		clearBearing();
		const places = activePlaces();
		const disc = discs.get(activeId);
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
			openEl.href = disc.href;
			openEl.textContent = `打开 ${disc.catalogNumber}`;
		}
		mapEl.setAttribute('aria-label', `${places.length} 个地点的轨迹地图`);
		if (progressEl && progressEl.childElementCount !== places.length) rebuildProgress(places.length);
		progressEl?.querySelectorAll('span').forEach((span, bar) => {
			span.className = bar < index ? 'is-done' : bar === index ? 'is-cur' : '';
		});
		root.querySelectorAll<HTMLButtonElement>('[data-traj-place]').forEach((button) => {
			const on = button.dataset.disc === activeId && button.dataset.trajPlace === place.id;
			button.closest('li')?.classList.toggle('is-on', on);
			if (on) button.setAttribute('aria-current', 'step');
			else button.removeAttribute('aria-current');
		});
		root.querySelectorAll<HTMLButtonElement>('[data-traj-switch]').forEach((button) => {
			button.setAttribute('aria-pressed', button.dataset.trajSwitch === activeId ? 'true' : 'false');
		});
		paintMarkers(index);
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
				shownKey = `${activeId}:${place.id}`;
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
			exploreBtn.setAttribute('aria-pressed', interactions ? 'true' : 'false');
			exploreBtn.textContent = interactions ? '回到导播' : '探索';
		}
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

	/** Stop a fly and, if the card was blanked for the move, show the stop we were on. */
	function hold(): void {
		playToken++;
		if (mode === 'play') mode = 'paused';
		const cardBlank =
			card?.classList.contains('is-out') === true ||
			card?.classList.contains('is-bearing') === true ||
			shownKey === '';
		clearBearing();
		const place = activePlaces()[currentIndex];
		if (place && cardBlank) {
			narrGen++;
			paintNarration(place, currentIndex);
			card?.classList.remove('is-out');
			shownKey = `${activeId}:${place.id}`;
		}
		updateButtons();
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
			absorb(center, ocean ? legZoom(t, zoomFrom, zoomTo, true) : zoomFrom);
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

	/** Paper ocean under the land fill. The basemap canvas itself is transparent at sea. */
	function sheetSnapshot(source: HTMLCanvasElement): string | null {
		if (source.width < 2 || source.height < 2) return null;
		const copy = document.createElement('canvas');
		copy.width = source.width;
		copy.height = source.height;
		const ctx = copy.getContext('2d');
		if (!ctx) return null;
		ctx.fillStyle = BASEMAP_PAINT.ocean;
		ctx.fillRect(0, 0, copy.width, copy.height);
		ctx.drawImage(source, 0, 0);
		return copy.toDataURL('image/jpeg', 0.72);
	}

	type FrozenSheet = { overlay: L.ImageOverlay; restoreAdd?: () => void };

	/**
	 * One raster of the flight corridor, then the vector sheet comes off the map
	 * so later pans do not reproject Natural Earth. Null leaves the vectors up.
	 */
	function freezeSheet(
		from: LngLat,
		to: LngLat,
		zoomFrom: number,
		zoomTo: number,
		ocean: boolean,
	): FrozenSheet | null {
		if (map.getSize().x < 20) return null;
		if (!sheetCanvas() && sheetLayers.length > 0) mountSheet();
		if (!sheetCanvas()) return null;
		const saved = map.getCenter();
		const savedZoom = map.getZoom();
		let moved = false;
		try {
			const corridor = corridorBounds(from, to, zoomFrom, zoomTo, ocean);
			const already = renderedSheetBounds();
			if (!already || !already.contains(corridor)) {
				map.fitBounds(corridor, { animate: false, padding: [8, 8] });
				moved = true;
			}
			const source = sheetCanvas();
			const shot = renderedSheetBounds();
			if (!source || !shot) throw new Error('snapshot');
			const url = sheetSnapshot(source);
			if (!url) throw new Error('snapshot');
			unmountSheet();
			map.setView(saved, savedZoom, { animate: false });
			const overlay = L.imageOverlay(url, shot, {
				pane: 'basemap',
				interactive: false,
				className: 'traj-freeze',
			}).addTo(map);
			// Paths still attached to the sheet renderer will try to put it back
			// on the next moveend. Keep the bitmap up for the rest of the cruise.
			const origAdd = map.addLayer.bind(map);
			map.addLayer = (layer: L.Layer) => {
				if ((layer as { options?: { pane?: string } }).options?.pane === 'basemap') return map;
				return origAdd(layer);
			};
			return {
				overlay,
				restoreAdd: () => {
					map.addLayer = origAdd;
				},
			};
		} catch {
			if (moved) map.setView(saved, savedZoom, { animate: false });
			mountSheet();
			return null;
		}
	}

	function thawSheet(frozen: FrozenSheet | null): void {
		frozen?.restoreAdd?.();
		if (frozen && map.hasLayer(frozen.overlay)) map.removeLayer(frozen.overlay);
		mountSheet();
	}

	async function flyTo(
		place: Place,
		index: number,
		token: number,
		fromPlace?: Place,
	): Promise<boolean> {
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
		let heldZoom = zoomFrom;
		let heldAtMs = 0;
		let phrasePhase: 'idle' | 'shown' | 'done' = 'idle';
		let frozen: FrozenSheet | null = null;
		flying = true;
		try {
			// A short hop that stays inside the already drawn sheet only pans.
			// Zoom changes and long corridors would reproject Natural Earth, so
			// those legs swap the vectors for one bitmap until the camera settles.
			const drawn = renderedSheetBounds();
			const corridor = corridorBounds(from, to, zoomFrom, zoomTo, ocean);
			const arriveZoom = ocean ? legZoom(1, zoomFrom, zoomTo, true) : zoomFrom;
			const zoomsDuringCruise = ocean || Math.abs(arriveZoom - zoomTo) > 0.05;
			if (zoomsDuringCruise || !drawn || !drawn.contains(corridor)) {
				frozen = freezeSheet(from, to, zoomFrom, zoomTo, ocean);
			}
			const ok = await animate(duration, token, (t) => {
				const eased = easeInOut(t);
				const p = slerpLngLat(from, to, eased);
				const nextZoom = cruiseZoom({
					t,
					elapsedMs: t * duration,
					zoomFrom,
					zoomTo,
					ocean,
					heldZoom,
					heldAtMs,
				});
				heldZoom = nextZoom.zoom;
				heldAtMs = nextZoom.heldAtMs;
				if (ocean && Math.abs(map.getZoom() - heldZoom) > 0.001) {
					map.setView([p.lat, p.lon], heldZoom, { animate: false });
				} else {
					map.panTo([p.lat, p.lon], { animate: false });
				}
				if (index === 0) progress.setLatLngs([[p.lat, p.lon]]);
				else paintBaked(prefix, leg, eased);
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
			if (!ok || token !== playToken) return false;
			clearBearing();
			return await animate(settleMs(false), token, (t) => {
				const zoom = arriveZoom + (zoomTo - arriveZoom) * easeInOut(t);
				map.setView([to.lat, to.lon], zoom, { animate: false });
			});
		} finally {
			try {
				thawSheet(frozen);
			} finally {
				flying = false;
				declutter();
			}
		}
	}

	async function playFrom(start: number, opening = false): Promise<void> {
		const token = ++playToken;
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
			if (shownKey !== `${activeId}:${place.id}`) fadeOut();
			const prev = i > 0 ? list[i - 1] : undefined;
			const flew = await flyTo(place, i, token, prev);
			if (!flew || token !== playToken) return;
			const revealed = await showNarration(place, i, token);
			if (!revealed || token !== playToken) return;
			const rested = await sleep(dwellMs(place.role, reduceMotion()), token);
			if (!rested || token !== playToken) return;
		}
		if (token !== playToken) return;
		mode = 'done';
		updateButtons();
	}

	async function focusPlace(discId: string, index: number): Promise<void> {
		const token = ++playToken;
		userTookOver = true;
		pausedByViewport = false;
		const discChanged = activeId !== discId;
		activeId = discId;
		mode = 'paused';
		showPanel();
		if (discChanged) redrawGhost();
		updateButtons();
		const place = activePlaces()[index];
		if (!place) return;
		const fromPlace =
			!discChanged && index === currentIndex + 1 ? activePlaces()[currentIndex] : undefined;
		currentIndex = index;
		if (shownKey !== `${activeId}:${place.id}`) fadeOut();
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

	function mountSheet(): void {
		if (sheetLayers.length === 0) return;
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
		const renderer = basemapRenderer();
		for (const layer of sheetLayers) {
			if (map.hasLayer(layer)) map.removeLayer(layer);
		}
		if (renderer && map.hasLayer(renderer)) map.removeLayer(renderer);
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
		void playFrom(mode === 'paused' ? currentIndex : 0, mode !== 'paused');
	});
	replayBtn?.addEventListener('click', () => {
		userTookOver = true;
		started = true;
		pausedByViewport = false;
		void playFrom(0, true);
	});
	prevBtn?.addEventListener('click', () => {
		userTookOver = true;
		void focusPlace(activeId, Math.max(0, currentIndex - 1));
	});
	nextBtn?.addEventListener('click', () => {
		userTookOver = true;
		void focusPlace(activeId, Math.min(activePlaces().length - 1, currentIndex + 1));
	});
	exploreBtn?.addEventListener('click', () => {
		userTookOver = true;
		pausedByViewport = false;
		if (interactions) {
			setInteractions(false);
			return;
		}
		hold();
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
			void focusPlace(discId, 0);
		});
	});

	mapEl.addEventListener('pointerdown', (event) => {
		if (event.pointerType === 'touch') return;
		if (event.button !== 0) return;
		userTookOver = true;
		if (mode === 'play') hold();
		setInteractions(true);
	});
	mapEl.addEventListener(
		'wheel',
		() => {
			if (mode !== 'play') return;
			userTookOver = true;
			hold();
		},
		{ passive: true },
	);

	map.on('zoomend moveend', declutter);

	showPanel();
	redrawGhost();
	if (openingPlace) {
		shownKey = `${activeId}:${openingPlace.id}`;
		setProgress(opening.index, { lon: openingPlace.lon, lat: openingPlace.lat });
		if (deep) paintNarration(openingPlace, opening.index);
		else {
			paintMarkers(opening.index);
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
	}
	if (deep) {
		userTookOver = true;
		mode = 'paused';
	}
	updateButtons();

	const observer = new IntersectionObserver(
		(entries) => {
			const inView = entries[entries.length - 1]?.isIntersecting === true;
			if (inView) map.invalidateSize();
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
