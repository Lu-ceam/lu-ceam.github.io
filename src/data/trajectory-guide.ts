/**
 * Guided-tour decisions that sit beside the camera clock.
 * Pure: the Leaflet driver applies them. Fly durations stay in trajectory-camera.
 */
import {
	haversineKm,
	isOceanLeg,
	slerpLngLat,
	type LngLat,
} from './trajectory-camera.ts';

/** Full-disc hold before the first stop. Inside the 1–2s the tour asked for. */
export const OPENING_OVERVIEW_MS = 1500;

/**
 * Same-disc stops closer than this share one city-scale frame.
 * About the Bayreuth festival / recording gap, and not a street zoom.
 */
export const LOCAL_NEAR_KM = 5;
/**
 * Same `cityZh` also shares that frame when the stop being arrived at
 * asks for this zoom or tighter. A lone pin never uses this as a zoom target.
 */
export const LOCAL_NEAR_ZOOM = 9;
/** Inset so both pins sit inside the sheet, clear of the frame edge. */
export const LOCAL_NEAR_PADDING_PX = 64;

/** Mid-cruise window (linear time) for a short ocean phrase. */
export const OCEAN_PHRASE_IN = 0.34;
export const OCEAN_PHRASE_OUT = 0.66;

export type GuideMode = 'idle' | 'play' | 'paused' | 'done';

/** Guide is the default; explore hands the map over; chrono walks the year rail. */
export type ViewMode = 'guide' | 'explore' | 'chrono';

export type ViewportPlay = 'start' | 'resume' | 'pause' | 'ignore';

export type LonLatBounds = {
	west: number;
	south: number;
	east: number;
	north: number;
};

export function openingOverviewMs(reduceMotion: boolean): number {
	return reduceMotion ? 0 : OPENING_OVERVIEW_MS;
}

/**
 * A guided start from the first stop frames the whole disc, then flies in.
 * Reduced motion skips that hold and lands on the first stop.
 * One stop has no path to frame. Resuming mid-tour does not re-frame.
 */
export function playsOpeningOverview(input: {
	startIndex: number;
	placeCount: number;
	reduceMotion: boolean;
}): boolean {
	return input.startIndex === 0 && input.placeCount >= 2 && !input.reduceMotion;
}

/**
 * Axis-aligned frame of one disc. Null when a date-line span would
 * stretch the box the long way around the world; the driver then skips it.
 */
export function openingFrame(places: readonly LngLat[]): LonLatBounds | null {
	if (places.length < 2) return null;
	let west = Infinity;
	let east = -Infinity;
	let south = Infinity;
	let north = -Infinity;
	for (const place of places) {
		west = Math.min(west, place.lon);
		east = Math.max(east, place.lon);
		south = Math.min(south, place.lat);
		north = Math.max(north, place.lat);
	}
	if (!Number.isFinite(west) || east - west > 180) return null;
	return { west, south, east, north };
}

export type LocalNearStop = LngLat & {
	cityZh: string;
	zoom?: number;
};

function sameCityZh(a: string, b: string): boolean {
	const left = a.trim();
	const right = b.trim();
	return left.length > 0 && left === right;
}

/**
 * Same-disc stops that share a frame with `index`.
 * Distance under `LOCAL_NEAR_KM` links stops, and those links are transitive.
 * The same cityZh joins too, but only when the stop being arrived at asks for
 * zoom ≥ `LOCAL_NEAR_ZOOM`. A lone stop returns null: the caller keeps the
 * single-pin arrival zoom and does not push the city cap for one pin.
 * Order follows the disc.
 */
export function localNearStops<T extends LocalNearStop>(
	places: readonly T[],
	index: number,
): T[] | null {
	const target = places[index];
	if (!target || places.length < 2) return null;
	const parent = places.map((_, placeIndex) => placeIndex);
	const find = (placeIndex: number): number => {
		let cursor = placeIndex;
		while (parent[cursor] !== cursor) cursor = parent[cursor]!;
		let compress = placeIndex;
		while (parent[compress] !== cursor) {
			const next = parent[compress]!;
			parent[compress] = cursor;
			compress = next;
		}
		return cursor;
	};
	const union = (a: number, b: number) => {
		const ra = find(a);
		const rb = find(b);
		if (ra !== rb) parent[rb] = ra;
	};
	for (let i = 0; i < places.length; i++) {
		for (let j = i + 1; j < places.length; j++) {
			const left = places[i];
			const right = places[j];
			if (!left || !right) continue;
			if (haversineKm(left, right) < LOCAL_NEAR_KM) union(i, j);
		}
	}
	const tight = target.zoom !== undefined && target.zoom >= LOCAL_NEAR_ZOOM;
	if (tight) {
		for (let i = 0; i < places.length; i++) {
			if (i === index) continue;
			const other = places[i];
			if (!other) continue;
			if (sameCityZh(target.cityZh, other.cityZh)) union(index, i);
		}
	}
	const root = find(index);
	const members = places.filter((_, placeIndex) => find(placeIndex) === root);
	return members.length >= 2 ? members : null;
}

/**
 * Box for `fitBounds` around that subset. Null for a lone stop, and when the
 * same city name would stretch the long way across the date line.
 */
export function localNearFrame(
	places: readonly LocalNearStop[],
	index: number,
): LonLatBounds | null {
	const group = localNearStops(places, index);
	if (!group) return null;
	return openingFrame(group);
}

/** A drawn same-disc hop short enough to thicken. Zero-length pins are not a segment. */
export function isLocalNearHop(a: LngLat, b: LngLat): boolean {
	const km = haversineKm(a, b);
	return km > 0 && km < LOCAL_NEAR_KM;
}

/**
 * Every same-disc pair under `LOCAL_NEAR_KM`, including a pair the chronology
 * does not visit back-to-back. The route polyline stays as authored; this is
 * the short gap that would otherwise vanish between two pins.
 */
export function localNearHops<T extends LngLat>(places: readonly T[]): Array<[T, T]> {
	const hops: Array<[T, T]> = [];
	for (let i = 0; i < places.length; i++) {
		for (let j = i + 1; j < places.length; j++) {
			const from = places[i];
			const to = places[j];
			if (!from || !to || !isLocalNearHop(from, to)) continue;
			hops.push([from, to]);
		}
	}
	return hops;
}

/** Guide card copy. The full blurb, with no line cap. The stop list uses the same string. */
export function narrationBlurb(full: string | undefined): { text: string } {
	return { text: full ?? '' };
}

export function oceanPhraseVisible(t: number): boolean {
	return t >= OCEAN_PHRASE_IN && t <= OCEAN_PHRASE_OUT;
}

function wrapLon(lon: number): number {
	let x = lon;
	while (x > 180) x -= 360;
	while (x < -180) x += 360;
	return x;
}

/**
 * Water boxes, deliberately tight so a long land hop (Moscow–Vladivostok)
 * does not pick up a sea it never crosses. Midpoint of the great circle.
 */
function basinAt(point: LngLat): string | null {
	const lon = wrapLon(point.lon);
	const lat = point.lat;
	if (lat >= 5 && lat <= 68 && lon >= -65 && lon <= -5) return '大西洋';
	if (lat >= -55 && lat < 5 && lon >= -40 && lon <= 15) return '大西洋';
	if (lat >= -68 && lat <= 60 && (lon <= -130 || lon >= 155)) return '太平洋';
	if (lat >= -55 && lat <= 15 && lon >= 40 && lon <= 110) return '印度洋';
	return null;
}

/**
 * Short under-map phrase for a stop-to-stop ocean crossing.
 * Null on a short hop, and on a long leg whose midpoint is not over a named basin.
 * Callers show it only mid-flight, under the map, and restore the stop on settle.
 */
export function oceanLegPhrase(from: LngLat, to: LngLat): string | null {
	if (!isOceanLeg(haversineKm(from, to))) return null;
	return basinAt(slerpLngLat(from, to, 0.5));
}

/**
 * Embedded section: entering the viewport never starts or resumes the tour —
 * the reader starts it with ▶. Leaving only pauses a tour already running.
 * The overview page still asks for a start on entry; its caller ignores it.
 */
export function viewportPlayAction(input: {
	embed: boolean;
	inView: boolean;
	started: boolean;
	userTookOver: boolean;
	mode: GuideMode;
	pausedByViewport: boolean;
}): ViewportPlay {
	if (!input.inView) {
		if (input.embed && input.mode === 'play') return 'pause';
		return 'ignore';
	}
	if (input.embed) return 'ignore';
	if (!input.started && !input.userTookOver && input.mode !== 'play' && input.mode !== 'done') {
		return 'start';
	}
	return 'ignore';
}

/** Three entity buckets for the near-zoom pin glyph. Not one icon per role. */
export type PinGlyphKind = 'person' | 'org' | 'record';

/**
 * Near-zoom ring, one step larger than the first cut: rest Ø14, active Ø18.
 * The DivIcon box stays 28 square for both states, and the monoline mark inside
 * is inset so it never spills past the ring it sits in.
 */
export const PIN_GLYPH_REST_R = 7;
export const PIN_GLYPH_ACTIVE_R = 9;
export const PIN_GLYPH_BOX_PX = 28;
export const PIN_GLYPH_REST_MARK_PX = 11;
export const PIN_GLYPH_ACTIVE_MARK_PX = 14;

const PIN_GLYPH_BY_ROLE: Record<string, PinGlyphKind> = {
	birth: 'person',
	death: 'person',
	residence: 'person',
	performance: 'person',
	composition: 'person',
	founded: 'org',
	recording: 'record',
	pressing: 'record',
	release: 'record',
};

/**
 * `null` for `other` and for a role the map has no bucket for: the pin stays a
 * plain brick dot. The narration line keeps the fine-grained role.
 */
export function pinGlyphKind(role: string): PinGlyphKind | null {
	return PIN_GLYPH_BY_ROLE[role] ?? null;
}

/**
 * Monoline brick glyphs for the pin ring, in the page's `currentColor`.
 * Geometry only: no emoji, no second accent, no per-role icon.
 */
export const PIN_GLYPH_SVG: Record<PinGlyphKind, string> = {
	person:
		'<svg viewBox="0 0 12 12" aria-hidden="true"><circle cx="6" cy="3.9" r="1.9"/><path d="M2.4 10.4c0-1.9 1.6-3 3.6-3s3.6 1.1 3.6 3"/></svg>',
	org: '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M3.2 10.2V3.6h5.6v6.6"/><path d="M1.9 10.2h8.2"/><path d="M5.2 10.2V7.5h1.6v2.7"/></svg>',
	record:
		'<svg viewBox="0 0 12 12" aria-hidden="true"><circle cx="6" cy="6" r="4"/><circle cx="6" cy="6" r="0.9" fill="currentColor" stroke="none"/></svg>',
};

/**
 * Who owns a gesture on the stage. Guide and chrono step the stations; a
 * running tour steps and holds; explore leaves the wheel and the drag to the map.
 */
export function stageStepsStation(input: { viewMode: ViewMode; mode: GuideMode }): boolean {
	if (input.viewMode === 'guide' || input.viewMode === 'chrono') return true;
	return input.mode === 'play';
}

/**
 * A clearly sideways drag belongs to the map or the page, not the station step:
 * no step, and no `preventDefault`.
 */
export function isStationSwipe(input: { dx: number; dy: number }): boolean {
	return Math.abs(input.dy) > Math.abs(input.dx);
}
