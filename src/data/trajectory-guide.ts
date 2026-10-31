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

/** Under-map blurb. The stop list keeps the uncut string. */
export const NARRATION_BLURB_LINES = 2;

/** Mid-cruise window (linear time) for a short ocean phrase. */
export const OCEAN_PHRASE_IN = 0.34;
export const OCEAN_PHRASE_OUT = 0.66;

export type GuideMode = 'idle' | 'play' | 'paused' | 'done';

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

/** Visual clamp for `.traj-blurb`. `text` is the full blurb, never cut here. */
export function narrationBlurb(full: string | undefined): { text: string; lines: number } {
	return { text: full ?? '', lines: NARRATION_BLURB_LINES };
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
 * Embedded section: start once when the map enters, pause when it leaves,
 * resume only if that pause was the viewport (a manual pause stays paused).
 * The overview page still starts when it enters, and does not pause off-screen.
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
	if (input.embed && input.pausedByViewport && !input.userTookOver && input.mode === 'paused') {
		return 'resume';
	}
	if (!input.started && !input.userTookOver && input.mode !== 'play' && input.mode !== 'done') {
		return 'start';
	}
	return 'ignore';
}
