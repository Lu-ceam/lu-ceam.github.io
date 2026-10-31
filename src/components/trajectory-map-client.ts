/**
 * Leaflet driver for the shared trajectory map.
 * Loaded only from the map component, never from the site layout.
 */
import L from 'leaflet';
import { MAP_TILES, mapTileAttributionHtml } from '../data/map-tiles';
import {
	dwellMs,
	easeInOut,
	haversineKm,
	isOceanLeg,
	legFlyMs,
	legZoom,
	resolvedZoom,
	roleLabel,
	settleMs,
	slerpLngLat,
	weakSegments,
	yearText,
	type LngLat,
} from '../data/trajectory-camera';

const PATH = '#7c2d22';

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

function reduceMotion(): boolean {
	return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
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
	const exploreBtn = root.querySelector<HTMLButtonElement>('[data-traj-explore]');
	const statusEl = root.querySelector<HTMLElement>('[data-traj-status]');
	const capMeta = root.querySelector<HTMLElement>('[data-traj-cap-meta]');
	const capCity = root.querySelector<HTMLElement>('[data-traj-cap-city]');
	const capEn = root.querySelector<HTMLElement>('[data-traj-cap-en]');
	const capBlurb = root.querySelector<HTMLElement>('[data-traj-cap-blurb]');

	const discs = new Map(payload.discs.map((disc) => [disc.id, disc]));
	let activeId = payload.discs[0]!.id;
	let currentIndex = 0;
	let mode: Mode = 'idle';
	let playToken = 0;
	let userTookOver = false;
	let started = false;
	let interactions = false;

	const activePlaces = () => discs.get(activeId)?.places ?? [];

	const map = L.map(mapEl, {
		minZoom: MAP_TILES.minZoom,
		maxZoom: MAP_TILES.maxZoom,
		// Half-step zoom keeps the pull-back visible without asking the
		// tile server for a new grid on every fractional frame.
		zoomSnap: 0.5,
		zoomDelta: 0.5,
		zoomAnimation: false,
		fadeAnimation: false,
		markerZoomAnimation: false,
		inertia: false,
		zoomControl: false,
		attributionControl: true,
		dragging: false,
		touchZoom: false,
		scrollWheelZoom: false,
		doubleClickZoom: false,
		boxZoom: false,
		keyboard: false,
	});
	L.control.zoom({ position: 'topright' }).addTo(map);
	L.tileLayer(MAP_TILES.url, {
		...(MAP_TILES.subdomains ? { subdomains: MAP_TILES.subdomains } : {}),
		attribution: mapTileAttributionHtml(),
		minZoom: MAP_TILES.minZoom,
		maxZoom: MAP_TILES.maxZoom,
		detectRetina: MAP_TILES.detectRetina,
	}).addTo(map);

	const l5 = L.layerGroup().addTo(map);
	const dimGroup = L.layerGroup().addTo(map);
	const ghost = L.polyline([], {
		color: PATH,
		weight: 2,
		opacity: 0.28,
		interactive: false,
	}).addTo(map);
	const progress = L.polyline([], {
		color: PATH,
		weight: 3,
		opacity: 1,
		lineCap: 'round',
		lineJoin: 'round',
		interactive: false,
	}).addTo(map);

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
			L.polyline(
				[
					[a.lat, a.lon],
					[b.lat, b.lon],
				],
				{
					color: PATH,
					weight: 1.5,
					opacity: 0.55,
					dashArray: '1 8',
					interactive: false,
				},
			).addTo(l5);
		}
	}

	const markers: { discId: string; index: number; marker: L.Marker }[] = [];
	for (const disc of payload.discs) {
		disc.places.forEach((place, index) => {
			const marker = L.marker([place.lat, place.lon], {
				icon: L.divIcon({
					className: 'traj-marker',
					html: '<span class="traj-dot"></span>',
					iconSize: [44, 44],
					iconAnchor: [22, 22],
				}),
				keyboard: false,
				title: `${place.cityZh}，${yearText(place)}`,
			});
			marker.on('click', () => {
				void focusPlace(disc.id, index);
			});
			marker.addTo(map);
			markers.push({ discId: disc.id, index, marker });
		});
	}

	function redrawGhost(): void {
		ghost.setLatLngs(activePlaces().map((place) => [place.lat, place.lon]));
		dimGroup.clearLayers();
		for (const disc of payload.discs) {
			if (disc.id === activeId) continue;
			L.polyline(
				disc.places.map((place) => [place.lat, place.lon] as [number, number]),
				{ color: PATH, weight: 2, opacity: 0.4, interactive: false },
			).addTo(dimGroup);
		}
	}

	function setProgress(index: number, tip: LngLat): void {
		const places = activePlaces();
		const coords: [number, number][] = places.slice(0, index).map((place) => [place.lat, place.lon]);
		coords.push([tip.lat, tip.lon]);
		progress.setLatLngs(coords);
	}

	function showPanel(): void {
		root.querySelectorAll<HTMLElement>('[data-traj-disc-panel]').forEach((panel) => {
			panel.hidden = panel.dataset.trajDiscPanel !== activeId;
		});
	}

	function paintMarkers(): void {
		for (const entry of markers) {
			const el = entry.marker.getElement();
			if (!el) continue;
			el.classList.toggle('is-active', entry.discId === activeId && entry.index === currentIndex);
			el.classList.toggle('is-dim', entry.discId !== activeId);
			el.classList.toggle(
				'is-done',
				entry.discId === activeId && entry.index < currentIndex && mode !== 'idle',
			);
		}
	}

	function applyChrome(place: Place, index: number): void {
		currentIndex = index;
		if (capMeta) capMeta.textContent = `${yearText(place)} · ${roleLabel(place.role)}`;
		if (capCity) capCity.textContent = place.cityZh;
		if (capEn) capEn.textContent = place.city;
		if (capBlurb) {
			capBlurb.textContent = place.blurb ?? '';
			capBlurb.hidden = !place.blurb;
		}
		root.querySelectorAll<HTMLButtonElement>('[data-traj-place]').forEach((button) => {
			const on = button.dataset.disc === activeId && button.dataset.trajPlace === place.id;
			button.classList.toggle('is-active', on);
			if (on) {
				button.setAttribute('aria-current', 'step');
				const list = button.closest('.traj-nodes');
				if (list instanceof HTMLElement) {
					const listRect = list.getBoundingClientRect();
					const buttonRect = button.getBoundingClientRect();
					if (buttonRect.top < listRect.top) list.scrollTop -= listRect.top - buttonRect.top;
					else if (buttonRect.bottom > listRect.bottom) {
						list.scrollTop += buttonRect.bottom - listRect.bottom;
					}
				}
			} else button.removeAttribute('aria-current');
		});
		paintMarkers();
	}

	function updateButtons(): void {
		if (playBtn) {
			playBtn.textContent =
				mode === 'play' ? '暂停' : mode === 'paused' ? '继续' : mode === 'done' ? '重播' : '自动播放';
		}
		if (exploreBtn) exploreBtn.setAttribute('aria-pressed', interactions ? 'true' : 'false');
		if (statusEl) {
			statusEl.textContent = interactions
				? '探索中'
				: mode === 'play'
					? '播放中'
					: mode === 'paused'
						? '已暂停'
						: mode === 'done'
							? '已播完'
							: '就绪';
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
		const zoomTo = resolvedZoom(place.zoom);
		const center = map.getCenter();
		const from = { lon: center.lng, lat: center.lat };
		const zoomFrom = map.getZoom();
		const km = haversineKm(from, to);
		if (km < 1 && Math.abs(zoomFrom - zoomTo) < 0.3) {
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
			applyChrome(place, i);
			const ok = await flyTo(place, i, token);
			if (!ok || token !== playToken) return;
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
		activeId = discId;
		showPanel();
		redrawGhost();
		mode = 'paused';
		setInteractions(true);
		const place = activePlaces()[index];
		if (!place) return;
		applyChrome(place, index);
		await flyTo(place, index, token);
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

	playBtn?.addEventListener('click', () => {
		if (mode === 'play') {
			playToken++;
			mode = 'paused';
			updateButtons();
			return;
		}
		userTookOver = true;
		void playFrom(mode === 'paused' ? currentIndex : 0);
	});
	replayBtn?.addEventListener('click', () => {
		userTookOver = true;
		void playFrom(0);
	});
	exploreBtn?.addEventListener('click', () => {
		playToken++;
		userTookOver = true;
		if (mode === 'play') mode = 'paused';
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
			if (index >= 0) void focusPlace(discId, index);
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
		if (mode === 'play') {
			playToken++;
			mode = 'paused';
		}
		userTookOver = true;
		setInteractions(true);
	});
	mapEl.addEventListener(
		'wheel',
		() => {
			if (mode !== 'play') return;
			playToken++;
			userTookOver = true;
			mode = 'paused';
			updateButtons();
		},
		{ passive: true },
	);

	redrawGhost();
	const deep = placeFromHash();
	const opening = deep ?? { discId: activeId, index: 0 };
	activeId = opening.discId;
	showPanel();
	redrawGhost();
	const openingPlace = activePlaces()[opening.index] ?? activePlaces()[0];
	if (openingPlace) {
		currentIndex = opening.index;
		applyChrome(openingPlace, opening.index);
		map.setView([openingPlace.lat, openingPlace.lon], resolvedZoom(openingPlace.zoom), { animate: false });
		setProgress(opening.index, { lon: openingPlace.lon, lat: openingPlace.lat });
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
				map.setView([place.lat, place.lon], resolvedZoom(place.zoom), { animate: false });
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
