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
import { BASEMAP_PAINT, VECTOR_BASEMAP, arrivalZoom } from '../data/map-tiles';
import {
	SETTLE_MS,
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
				color: BASEMAP_PAINT.route,
				weight: 1.25,
				opacity: 0.4,
				dashArray: '2 6',
				interactive: false,
			}).addTo(map);
			link.bringToBack();
		}
	}

	const dimGroup = L.layerGroup().addTo(map);
	const ghost = L.polyline([], {
		renderer: drawRenderer,
		color: BASEMAP_PAINT.route,
		weight: 1,
		opacity: 0.28,
		dashArray: '3 4',
		interactive: false,
	}).addTo(map);
	const progress = L.polyline([], {
		renderer: drawRenderer,
		color: BASEMAP_PAINT.route,
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
				color: BASEMAP_PAINT.route,
				weight: 1.4,
				opacity: 0.35,
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

	function paintNarration(place: Place, index: number): void {
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
			exploreBtn.textContent = interactions ? '完成探索' : '探索';
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
		const place = activePlaces()[currentIndex];
		if (place && card?.classList.contains('is-out')) {
			narrGen++;
			paintNarration(place, currentIndex);
			card.classList.remove('is-out');
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

	async function flyTo(place: Place, index: number, token: number): Promise<boolean> {
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
		const ok = await animate(legFlyMs(km, false), token, (t) => {
			const p = slerpLngLat(from, to, easeInOut(t));
			map.setView([p.lat, p.lon], legZoom(t, zoomFrom, zoomTo, ocean), { animate: false });
			setProgress(index, p);
		});
		if (!ok) return false;
		const arrive = legZoom(1, zoomFrom, zoomTo, ocean);
		return animate(settleMs(false), token, (t) => {
			map.setView([to.lat, to.lon], arrive + (zoomTo - arrive) * easeInOut(t), { animate: false });
		});
	}

	async function playFrom(start: number): Promise<void> {
		const token = ++playToken;
		mode = 'play';
		setInteractions(false);
		const list = activePlaces();
		for (let i = start; i < list.length; i++) {
			if (token !== playToken) return;
			const place = list[i];
			if (!place) return;
			currentIndex = i;
			if (shownKey !== `${activeId}:${place.id}`) fadeOut();
			const flew = await flyTo(place, i, token);
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
		const discChanged = activeId !== discId;
		activeId = discId;
		mode = 'paused';
		showPanel();
		if (discChanged) redrawGhost();
		updateButtons();
		const place = activePlaces()[index];
		if (!place) return;
		currentIndex = index;
		if (shownKey !== `${activeId}:${place.id}`) fadeOut();
		const flew = await flyTo(place, index, token);
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
			L.geoJSON(graticule(), {
				...base,
				style: { color: BASEMAP_PAINT.graticule, weight: 0.6 },
			}).addTo(map);
			L.geoJSON(feature(landTopo, landObject), {
				...base,
				style: { stroke: false, fillColor: BASEMAP_PAINT.land, fillOpacity: 1 },
			}).addTo(map);
			L.geoJSON(mesh(countryTopo, countriesObject, (a, b) => a !== b), {
				...base,
				style: { color: BASEMAP_PAINT.border, weight: 0.7, dashArray: '2 2' },
			}).addTo(map);
			L.geoJSON(mesh(countryTopo, countriesObject, (a, b) => a === b), {
				...base,
				style: { color: BASEMAP_PAINT.coast, weight: 0.8 },
			}).addTo(map);
		} catch {
			// The ocean ground and the route still read if the sheet fails to parse.
		}
	}

	playBtn?.addEventListener('click', () => {
		if (mode === 'play') {
			hold();
			return;
		}
		userTookOver = true;
		void playFrom(mode === 'paused' ? currentIndex : 0);
	});
	replayBtn?.addEventListener('click', () => {
		userTookOver = true;
		void playFrom(0);
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
		}
	}
	if (deep) {
		userTookOver = true;
		mode = 'paused';
	}
	updateButtons();

	const observer = new IntersectionObserver(
		(entries) => {
			if (!entries.some((entry) => entry.isIntersecting)) return;
			map.invalidateSize();
			if (started || userTookOver) return;
			started = true;
			const place = activePlaces()[currentIndex];
			if (place) {
				map.setView([place.lat, place.lon], arrivalZoom(place.zoom), { animate: false });
				setProgress(currentIndex, { lon: place.lon, lat: place.lat });
			}
			void playFrom(currentIndex);
		},
		{ threshold: 0.4 },
	);
	observer.observe(mapEl);
	window.addEventListener('resize', () => map.invalidateSize());
}

export function mountTrajectoryMaps(scope: ParentNode = document): void {
	scope.querySelectorAll<HTMLElement>('[data-traj-root]').forEach((root) => mount(root));
}
