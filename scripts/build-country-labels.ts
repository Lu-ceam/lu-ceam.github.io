/**
 * One-shot anchors for the country labels.
 * Run from the repo root:
 *   node --experimental-strip-types scripts/build-country-labels.ts
 *
 * Reads public/maps/countries-50m.json, keeps ids in the Chinese table,
 * and writes public/maps/country-labels.json. The anchor is the polylabel
 * of the largest polygon so France, the United States, and Norway do not
 * sit in the sea. 344 / 446 / 158 are never written.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { feature } from 'topojson-client';
import type { GeometryCollection, Topology } from 'topojson-specification';
import { countryNameZh } from '../src/data/country-labels.ts';

type Ring = [number, number][];
type Polygon = Ring[];

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourcePath = resolve(root, 'public/maps/countries-50m.json');
const destPath = resolve(root, 'public/maps/country-labels.json');
const PRECISION = 0.05;

function signedArea(ring: Ring): number {
	let sum = 0;
	for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
		const a = ring[j]!;
		const b = ring[i]!;
		sum += a[0] * b[1] - b[0] * a[1];
	}
	return sum / 2;
}

function polygonArea(rings: Polygon): number {
	const outer = rings[0];
	if (!outer) return 0;
	let area = Math.abs(signedArea(outer));
	for (let i = 1; i < rings.length; i++) area -= Math.abs(signedArea(rings[i]!));
	return area;
}

/** Keep each step on the short side of the antimeridian so the bbox is the land, not the pacific. */
function unwrapRing(ring: Ring): Ring {
	const first = ring[0];
	if (!first) return [];
	const out: Ring = [[first[0], first[1]]];
	for (let i = 1; i < ring.length; i++) {
		const prev = out[i - 1]![0];
		let x = ring[i]![0];
		const y = ring[i]![1];
		while (x - prev > 180) x -= 360;
		while (prev - x > 180) x += 360;
		out.push([x, y]);
	}
	return out;
}

function polygonsOf(geometry: GeoJSON.Geometry | null): Polygon[] {
	if (!geometry) return [];
	if (geometry.type === 'Polygon') return [geometry.coordinates.map((ring) => unwrapRing(ring as Ring))];
	if (geometry.type === 'MultiPolygon') {
		return geometry.coordinates.map((polygon) => polygon.map((ring) => unwrapRing(ring as Ring)));
	}
	return [];
}

function pointSegDist(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
	const dx = bx - ax;
	const dy = by - ay;
	const len2 = dx * dx + dy * dy;
	if (len2 === 0) return Math.hypot(px - ax, py - ay);
	const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
	return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** Signed distance: positive inside the outer ring and outside holes. */
function pointToPolygonDist(x: number, y: number, rings: Polygon): number {
	let inside = false;
	let min = Infinity;
	for (const ring of rings) {
		for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
			const a = ring[i]!;
			const b = ring[j]!;
			const dist = pointSegDist(x, y, a[0], a[1], b[0], b[1]);
			if (dist < min) min = dist;
			if (a[1] > y !== b[1] > y && x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside;
		}
	}
	return (inside ? 1 : -1) * min;
}

type Cell = { x: number; y: number; h: number; d: number; max: number };

function makeCell(x: number, y: number, h: number, rings: Polygon): Cell {
	const d = pointToPolygonDist(x, y, rings);
	return { x, y, h, d, max: d + h * Math.SQRT2 };
}

class Heap {
	private data: Cell[] = [];

	get size(): number {
		return this.data.length;
	}

	push(cell: Cell): void {
		this.data.push(cell);
		this.up(this.data.length - 1);
	}

	pop(): Cell | undefined {
		const top = this.data[0];
		const last = this.data.pop();
		if (this.data.length > 0 && last) {
			this.data[0] = last;
			this.down(0);
		}
		return top;
	}

	private up(index: number): void {
		const cell = this.data[index]!;
		while (index > 0) {
			const parent = (index - 1) >> 1;
			const other = this.data[parent]!;
			if (other.max >= cell.max) break;
			this.data[index] = other;
			index = parent;
		}
		this.data[index] = cell;
	}

	private down(index: number): void {
		const cell = this.data[index]!;
		const n = this.data.length;
		for (;;) {
			const left = index * 2 + 1;
			if (left >= n) break;
			const right = left + 1;
			let best = left;
			if (right < n && this.data[right]!.max > this.data[left]!.max) best = right;
			if (this.data[best]!.max <= cell.max) break;
			this.data[index] = this.data[best]!;
			index = best;
		}
		this.data[index] = cell;
	}
}

function bounds(rings: Polygon): { minX: number; minY: number; maxX: number; maxY: number } | null {
	let minX = Infinity;
	let minY = Infinity;
	let maxX = -Infinity;
	let maxY = -Infinity;
	for (const ring of rings) {
		for (const point of ring) {
			if (point[0] < minX) minX = point[0];
			if (point[1] < minY) minY = point[1];
			if (point[0] > maxX) maxX = point[0];
			if (point[1] > maxY) maxY = point[1];
		}
	}
	if (!Number.isFinite(minX)) return null;
	return { minX, minY, maxX, maxY };
}

/** Pole of inaccessibility. Coordinates are degrees, x = longitude. */
function polylabel(rings: Polygon, precision: number): { x: number; y: number } | null {
	const box = bounds(rings);
	if (!box) return null;
	const width = box.maxX - box.minX;
	const height = box.maxY - box.minY;
	if (width <= 0 || height <= 0) return null;
	const cellSize = Math.min(width, height);
	const h = cellSize / 2;
	const heap = new Heap();
	let best = makeCell((box.minX + box.maxX) / 2, (box.minY + box.maxY) / 2, 0, rings);
	for (let x = box.minX; x < box.maxX; x += cellSize) {
		for (let y = box.minY; y < box.maxY; y += cellSize) {
			const cell = makeCell(x + h, y + h, h, rings);
			heap.push(cell);
			if (cell.d > best.d) best = cell;
		}
	}
	let guard = 0;
	while (heap.size > 0 && guard < 200_000) {
		guard += 1;
		const cell = heap.pop();
		if (!cell) break;
		if (cell.d > best.d) best = cell;
		if (cell.max - best.d <= precision) continue;
		const half = cell.h / 2;
		for (const dx of [-half, half]) {
			for (const dy of [-half, half]) {
				const next = makeCell(cell.x + dx, cell.y + dy, half, rings);
				heap.push(next);
			}
		}
	}
	if (best.d <= 0) return null;
	return { x: best.x, y: best.y };
}

function wrapLng(lng: number): number {
	let x = lng;
	while (x > 180) x -= 360;
	while (x < -180) x += 360;
	return x;
}

function round(value: number, digits: number): number {
	const scale = 10 ** digits;
	return Math.round(value * scale) / scale;
}

const topo = JSON.parse(readFileSync(sourcePath, 'utf8')) as Topology<{ countries: GeometryCollection }>;
const countries = feature(topo, topo.objects.countries);
const byId = new Map<number, { id: number; zh: string; lng: number; lat: number; area: number; ew: number }>();

for (const country of countries.features) {
	const id = Number(country.id);
	const zh = countryNameZh(id);
	if (!zh || !country.geometry) continue;
	let bestRings: Polygon | null = null;
	let bestArea = 0;
	for (const rings of polygonsOf(country.geometry)) {
		const area = polygonArea(rings);
		if (area > bestArea) {
			bestArea = area;
			bestRings = rings;
		}
	}
	if (!bestRings) continue;
	const box = bounds(bestRings);
	const anchor = polylabel(bestRings, PRECISION);
	if (!box || !anchor) {
		console.warn(`skip ${id} ${zh}: no interior anchor`);
		continue;
	}
	// Natural Earth reuses 036 for Ashmore and Cartier. Keep the larger landmass.
	const prev = byId.get(id);
	if (prev && prev.area >= bestArea) continue;
	byId.set(id, {
		id,
		zh,
		lng: round(wrapLng(anchor.x), 4),
		lat: round(anchor.y, 4),
		area: round(bestArea, 4),
		ew: round(box.maxX - box.minX, 4),
	});
}

const labels = [...byId.values()];

labels.sort((a, b) => a.id - b.id);
writeFileSync(destPath, `${JSON.stringify(labels, null, '\t')}\n`);
console.log(`wrote ${labels.length} labels to ${destPath}`);
for (const id of [156, 250, 276, 578, 826, 840]) {
	const row = labels.find((label) => label.id === id);
	console.log(id, row ? `${row.zh} ${row.lng},${row.lat} area=${row.area} ew=${row.ew}` : 'MISSING');
}
