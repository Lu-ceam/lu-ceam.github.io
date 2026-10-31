/**
 * Year-ordered tour line for the trajectory map.
 * Pure: the Leaflet driver paints the halo, the bead, and the narration.
 * The camera does not fly in this mode.
 */
import { PATH_STROKE } from './map-tiles.ts';
import {
	KM_OCEAN,
	KM_SHORT,
	easeInOut,
	slerpLngLat,
	type LngLat,
} from './trajectory-camera.ts';

/** Edge crawl. Shorter than a documentary leg: the camera stays put. */
export const CHRONO_SHORT_MS = 1600;
export const CHRONO_MID_MS = 2400;
export const CHRONO_OCEAN_MS = 3600;
/** Single ease-out halo. It does not loop. */
export const CHRONO_HALO_MS = 900;
/** How long the active station keeps the narration before the next edge. */
export const CHRONO_ACTIVE_MS = 2800;
/** The next station's halo may begin this long before the bead arrives. */
export const CHRONO_EDGE_OVERLAP_MS = 200;
export const CHRONO_DOT_RADIUS = 3.5;
export const CHRONO_ACTIVE_SCALE = 1.15;
/** Halo radius, in multiples of the active dot's diameter. */
export const CHRONO_HALO_FROM = 1.2;
export const CHRONO_HALO_TO = 3.2;
export const CHRONO_HALO_OPACITY = 0.28;
/** Bead diameter in pixels. */
export const CHRONO_BEAD_PX = 6;
export const CHRONO_VISITED_OPACITY = 0.7;
export const CHRONO_PENDING_OPACITY = 0.45;

export type ChronoStation<T> = {
	discId: string;
	index: number;
	place: T;
};

export type ChronoMarkerPhase = 'pending' | 'active' | 'visited';

/**
 * Stations in year order.
 * The same year keeps that disc's places-array order.
 * Across discs, the same year breaks ties by disc id.
 * `null` walks the whole catalog. A disc id walks only that disc.
 */
export function chronoStations<T extends { year: number }>(
	discs: readonly { id: string; places: readonly T[] }[],
	selectedDiscId: string | null,
): ChronoStation<T>[] {
	const source =
		selectedDiscId === null ? discs : discs.filter((disc) => disc.id === selectedDiscId);
	const rows: ChronoStation<T>[] = [];
	for (const disc of source) {
		disc.places.forEach((place, index) => {
			rows.push({ discId: disc.id, index, place });
		});
	}
	rows.sort((a, b) => {
		if (a.place.year !== b.place.year) return a.place.year - b.place.year;
		if (a.discId !== b.discId) return a.discId < b.discId ? -1 : 1;
		return a.index - b.index;
	});
	return rows;
}

export function chronoSegmentMs(km: number, reduceMotion: boolean): number {
	if (reduceMotion) return 0;
	if (km <= KM_SHORT) return CHRONO_SHORT_MS;
	if (km <= KM_OCEAN) return CHRONO_MID_MS;
	return CHRONO_OCEAN_MS;
}

/** Quadratic ease-out. The halo plays once. */
export function easeOut(t: number): number {
	const x = Math.min(1, Math.max(0, t));
	return 1 - (1 - x) ** 2;
}

/**
 * One halo frame. Radius grows from 1.2× to 3.2× the active dot diameter.
 * Opacity falls from the route tone at 0.28 to 0. `t` is linear time.
 */
export function chronoHaloFrame(
	t: number,
	dotRadius = CHRONO_DOT_RADIUS,
): { radius: number; opacity: number } {
	const eased = easeOut(t);
	const diameter = dotRadius * CHRONO_ACTIVE_SCALE * 2;
	const radius = diameter * (CHRONO_HALO_FROM + (CHRONO_HALO_TO - CHRONO_HALO_FROM) * eased);
	return { radius, opacity: CHRONO_HALO_OPACITY * (1 - eased) };
}

/** Bead position. `u` is linear progress; the point eases in and out. */
export function chronoEdgePoint(from: LngLat, to: LngLat, u: number): LngLat {
	return slerpLngLat(from, to, easeInOut(u));
}

export function chronoMarkerPhase(index: number, active: number): ChronoMarkerPhase {
	if (index === active) return 'active';
	if (index < active) return 'visited';
	return 'pending';
}

export function chronoMarkerStyle(phase: ChronoMarkerPhase): {
	radius: number;
	fillOpacity: number;
	fill: 'brick' | 'pencil';
} {
	if (phase === 'active') {
		return {
			radius: CHRONO_DOT_RADIUS * CHRONO_ACTIVE_SCALE,
			fillOpacity: 1,
			fill: 'brick',
		};
	}
	if (phase === 'visited') {
		return { radius: CHRONO_DOT_RADIUS, fillOpacity: CHRONO_VISITED_OPACITY, fill: 'brick' };
	}
	return { radius: CHRONO_DOT_RADIUS, fillOpacity: CHRONO_PENDING_OPACITY, fill: 'pencil' };
}

/**
 * Brick for the crawled part. A cross-disc jump is the same hue, dashed and fainter.
 * Same-disc remainder stays on the pencil path already on the sheet.
 */
export function chronoEdgeStyle(
	crossDisc: boolean,
	traveled: boolean,
): { opacity: number; dash: string | null; weight: number } {
	if (!traveled && crossDisc) return { opacity: 0.32, dash: '2 6', weight: 1.15 };
	if (!traveled) {
		return {
			opacity: PATH_STROKE.faintOpacity,
			dash: PATH_STROKE.faintDash,
			weight: PATH_STROKE.faintWeight,
		};
	}
	if (crossDisc) return { opacity: 0.55, dash: null, weight: 1.45 };
	return { opacity: 0.9, dash: null, weight: 1.8 };
}

function cityKey(city: string): string {
	return city.trim().toLocaleLowerCase('en');
}

function coordKey(point: LngLat): string {
	return `${point.lon.toFixed(2)},${point.lat.toFixed(2)}`;
}

/**
 * Places that share a Latin city, or round to the same 2-decimal coordinate,
 * count once. That is the catalog blurb's station total.
 */
export function dedupedStationCount(
	places: readonly (LngLat & { city: string })[],
): number {
	const parent = places.map((_, index) => index);
	const find = (index: number): number => {
		let cursor = index;
		while (parent[cursor] !== cursor) cursor = parent[cursor]!;
		return cursor;
	};
	const union = (a: number, b: number) => {
		const ra = find(a);
		const rb = find(b);
		if (ra !== rb) parent[rb] = ra;
	};
	const byCity = new Map<string, number>();
	const byCoord = new Map<string, number>();
	places.forEach((place, index) => {
		const city = cityKey(place.city);
		if (city) {
			const prev = byCity.get(city);
			if (prev === undefined) byCity.set(city, index);
			else union(prev, index);
		}
		const coord = coordKey(place);
		const prevCoord = byCoord.get(coord);
		if (prevCoord === undefined) byCoord.set(coord, index);
		else union(prevCoord, index);
	});
	const roots = new Set<number>();
	for (let index = 0; index < places.length; index++) roots.add(find(index));
	return roots.size;
}
