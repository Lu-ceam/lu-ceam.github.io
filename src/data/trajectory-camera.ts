/**
 * Documentary camera timing and overview clustering for trajectory maps.
 * Pure functions: the Leaflet driver lives in the map component.
 *
 * Short hop ≤800 km ~3.2s, mid ≤3000 km ~4.5s, ocean >3000 km ~6.5s.
 * Ocean legs pull the zoom back at mid-flight. Every arrival then eases
 * in over ~0.7s. Recording stops dwell ~6s; other roles ~5s.
 */

export const KM_SHORT = 800;
export const KM_OCEAN = 3000;
export const FLY_SHORT_MS = 3200;
export const FLY_MID_MS = 4500;
export const FLY_OCEAN_MS = 6500;
export const DWELL_MS = 5000;
export const DWELL_RECORDING_MS = 6000;
export const SETTLE_MS = 700;
/** How far below the place zoom a leg stops, before the settle push-in. */
export const SETTLE_ZOOM_DELTA = 0.4;
/** Ocean mid-flight zoom, levels below the wider of the two endpoints. */
export const OCEAN_PULLBACK = 2.2;
/** Ocean cruise may change zoom at most this often. Short hops do not zoom until settle. */
export const OCEAN_ZOOM_HZ = 10;
export const REDUCE_DWELL_MS = 900;
export const DEFAULT_ZOOM = 7;

const EARTH_KM = 6371;

export type LngLat = { lon: number; lat: number };

export type ClusterPoint = LngLat & {
	recordId: string;
	placeId: string;
	city: string;
};

export function haversineKm(a: LngLat, b: LngLat): number {
	const toRad = (deg: number) => (deg * Math.PI) / 180;
	const dLat = toRad(b.lat - a.lat);
	const dLon = toRad(b.lon - a.lon);
	const lat1 = toRad(a.lat);
	const lat2 = toRad(b.lat);
	const h =
		Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
	return 2 * EARTH_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Quadratic ease-in-out. 0 and 1 stay put; the midpoint is 0.5. */
export function easeInOut(t: number): number {
	const x = Math.min(1, Math.max(0, t));
	return x < 0.5 ? 2 * x * x : 1 - ((-2 * x + 2) ** 2) / 2;
}

export function legFlyMs(km: number, reduceMotion: boolean): number {
	if (reduceMotion) return 0;
	if (km <= KM_SHORT) return FLY_SHORT_MS;
	if (km <= KM_OCEAN) return FLY_MID_MS;
	return FLY_OCEAN_MS;
}

export function isOceanLeg(km: number): boolean {
	return km > KM_OCEAN;
}

export function dwellMs(role: string, reduceMotion: boolean): number {
	if (reduceMotion) return REDUCE_DWELL_MS;
	return role === 'recording' ? DWELL_RECORDING_MS : DWELL_MS;
}

export function settleMs(reduceMotion: boolean): number {
	return reduceMotion ? 0 : SETTLE_MS;
}

export function resolvedZoom(zoom: number | undefined): number {
	return zoom ?? DEFAULT_ZOOM;
}

/**
 * Zoom along one leg. `t` is linear time in 0..1.
 * Ocean legs dip at the halfway mark so the crossing keeps its bearing,
 * then stop slightly wide of the target. The settle phase closes that gap.
 */
export function legZoom(t: number, fromZoom: number, toZoom: number, ocean: boolean): number {
	const arrive = toZoom - SETTLE_ZOOM_DELTA;
	if (!ocean) return fromZoom + (arrive - fromZoom) * easeInOut(t);
	const mid = Math.max(3, Math.min(fromZoom, toZoom) - OCEAN_PULLBACK);
	if (t <= 0.5) return fromZoom + (mid - fromZoom) * easeInOut(t / 0.5);
	return mid + (arrive - mid) * easeInOut((t - 0.5) / 0.5);
}

/**
 * Zoom while the camera is still cruising, before the settle push.
 * Short and mid legs keep `zoomFrom` so the sheet is only panned.
 * Ocean legs follow `legZoom`, but at most `OCEAN_ZOOM_HZ`, and always
 * take the final sample when `t` reaches 1.
 */
export function cruiseZoom(input: {
	t: number;
	elapsedMs: number;
	zoomFrom: number;
	zoomTo: number;
	ocean: boolean;
	heldZoom: number;
	heldAtMs: number;
}): { zoom: number; heldAtMs: number } {
	if (!input.ocean) return { zoom: input.zoomFrom, heldAtMs: input.heldAtMs };
	const due =
		input.t >= 1 || input.elapsedMs - input.heldAtMs >= 1000 / OCEAN_ZOOM_HZ;
	if (!due) return { zoom: input.heldZoom, heldAtMs: input.heldAtMs };
	return {
		zoom: legZoom(input.t, input.zoomFrom, input.zoomTo, true),
		heldAtMs: input.elapsedMs,
	};
}

/** How many precomputed arc vertices to draw at eased time `t` (0..1). */
export function arcVertexCount(vertexCount: number, t: number): number {
	if (vertexCount <= 0) return 0;
	if (vertexCount === 1) return 1;
	const x = Math.min(1, Math.max(0, t));
	return 1 + Math.round(x * (vertexCount - 1));
}

function toVec(point: LngLat): { x: number; y: number; z: number } {
	const lat = (point.lat * Math.PI) / 180;
	const lon = (point.lon * Math.PI) / 180;
	const cosLat = Math.cos(lat);
	return { x: cosLat * Math.cos(lon), y: cosLat * Math.sin(lon), z: Math.sin(lat) };
}

/** Great-circle point at linear fraction `t`. Endpoints are exact. */
export function slerpLngLat(a: LngLat, b: LngLat, t: number): LngLat {
	const clamped = Math.min(1, Math.max(0, t));
	if (clamped === 0) return { lon: a.lon, lat: a.lat };
	if (clamped === 1) return { lon: b.lon, lat: b.lat };
	const va = toVec(a);
	const vb = toVec(b);
	const dot = Math.min(1, Math.max(-1, va.x * vb.x + va.y * vb.y + va.z * vb.z));
	const omega = Math.acos(dot);
	if (omega < 1e-6) return { lon: a.lon, lat: a.lat };
	const s0 = Math.sin((1 - clamped) * omega) / Math.sin(omega);
	const s1 = Math.sin(clamped * omega) / Math.sin(omega);
	const x = s0 * va.x + s1 * vb.x;
	const y = s0 * va.y + s1 * vb.y;
	const z = s0 * va.z + s1 * vb.z;
	return {
		lat: (Math.atan2(z, Math.hypot(x, y)) * 180) / Math.PI,
		lon: (Math.atan2(y, x) * 180) / Math.PI,
	};
}

export const ROLE_LABELS: Record<string, string> = {
	birth: '出生',
	composition: '创作',
	premiere: '首演',
	recording: '录音',
	pressing: '压片',
	release: '发行',
	performance: '演出',
	residence: '居住',
	other: '其它',
};

export function roleLabel(role: string): string {
	return ROLE_LABELS[role] ?? role;
}

export function yearText(place: { year: number; yearLabel?: string }): string {
	return place.yearLabel ?? String(place.year);
}

const ILLUSTRATIVE_BLURB = /示意|待馆员核定/;
/** Camera and field names that leaked into public place copy. */
const JARGON_BLURB = /飞镜|year\s*暂/i;

/**
 * Places whose public blurb is still a placeholder, or names the flyover
 * and the year field. Callers print these; they must not fail the build
 * or block a record that has no trajectory.
 */
export function illustrativeBlurbWarnings(
	records: readonly {
		id: string;
		trajectory?: { places: readonly { id: string; blurb?: string }[] };
	}[],
): string[] {
	const lines: string[] = [];
	for (const record of records) {
		for (const place of record.trajectory?.places ?? []) {
			if (!place.blurb) continue;
			if (ILLUSTRATIVE_BLURB.test(place.blurb)) {
				lines.push(`${record.id}/${place.id}: 旁注含「示意」或「待馆员核定」，不当定论`);
			}
			if (JARGON_BLURB.test(place.blurb)) {
				lines.push(`${record.id}/${place.id}: 旁注含实现用语（飞镜、year 暂与），不宜公开`);
			}
		}
	}
	return lines;
}

function cityKey(city: string): string {
	return city.trim().toLocaleLowerCase('en');
}

function coordKey(point: LngLat): string {
	return `${point.lon.toFixed(2)},${point.lat.toFixed(2)}`;
}

/**
 * Cross-disc clusters. Two places join when their Latin city matches
 * (case and surrounding space ignored) or their lon/lat round to the same
 * 2 decimal degrees. A cluster is returned only when it holds two record ids.
 * Array order inside a cluster follows the input.
 */
export function weakClusters(points: readonly ClusterPoint[]): ClusterPoint[][] {
	const parent = points.map((_, index) => index);
	const find = (index: number): number => {
		let cursor = index;
		while (parent[cursor] !== cursor) cursor = parent[cursor]!;
		let compress = index;
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

	const byCity = new Map<string, number>();
	const byCoord = new Map<string, number>();
	points.forEach((point, index) => {
		const city = cityKey(point.city);
		if (city) {
			const prev = byCity.get(city);
			if (prev === undefined) byCity.set(city, index);
			else union(prev, index);
		}
		const coord = coordKey(point);
		const prevCoord = byCoord.get(coord);
		if (prevCoord === undefined) byCoord.set(coord, index);
		else union(prevCoord, index);
	});

	const groups = new Map<number, ClusterPoint[]>();
	points.forEach((point, index) => {
		const root = find(index);
		const list = groups.get(root);
		if (list) list.push(point);
		else groups.set(root, [point]);
	});

	const clusters: ClusterPoint[][] = [];
	for (const group of groups.values()) {
		const records = new Set(group.map((point) => point.recordId));
		if (records.size >= 2) clusters.push(group);
	}
	return clusters;
}

/** One segment per pair of records in a weak cluster, using the first place of each. */
export function weakSegments(points: readonly ClusterPoint[]): Array<[ClusterPoint, ClusterPoint]> {
	const segments: Array<[ClusterPoint, ClusterPoint]> = [];
	for (const cluster of weakClusters(points)) {
		const reps: ClusterPoint[] = [];
		const seen = new Set<string>();
		for (const point of cluster) {
			if (seen.has(point.recordId)) continue;
			seen.add(point.recordId);
			reps.push(point);
		}
		for (let i = 0; i < reps.length; i++) {
			for (let j = i + 1; j < reps.length; j++) {
				const a = reps[i];
				const b = reps[j];
				if (a && b) segments.push([a, b]);
			}
		}
	}
	return segments;
}
