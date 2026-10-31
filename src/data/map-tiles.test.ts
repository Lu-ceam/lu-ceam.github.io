import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { feature, mesh } from 'topojson-client';
import type { GeometryCollection, Topology } from 'topojson-specification';
import { arrivalZoom, VECTOR_BASEMAP } from './map-tiles.ts';

function read(path: string): string {
	return readFileSync(path, 'utf8');
}

describe('local natural earth basemap', () => {
	it('points at static files and keeps the city-scale explore cap', () => {
		assert.equal(VECTOR_BASEMAP.landUrl, '/maps/land-50m.json');
		assert.equal(VECTOR_BASEMAP.countriesUrl, '/maps/countries-50m.json');
		assert.equal(VECTOR_BASEMAP.minZoom, 2);
		assert.equal(VECTOR_BASEMAP.maxZoom, 12);
		assert.equal(VECTOR_BASEMAP.attribution, 'Made with Natural Earth');
		assert.equal(arrivalZoom(12), 6.2);
		assert.equal(arrivalZoom(10), 6.2);
		assert.equal(arrivalZoom(7), 5.5);
		assert.equal(arrivalZoom(3), 2);
		assert.equal(arrivalZoom(undefined), 5.5);
		const source = read('src/data/map-tiles.ts');
		assert.doesNotMatch(source, /openstreetmap|tileLayer|\{z\}/i);
	});

	it('reads land and country edges from the public TopoJSON', () => {
		const land = JSON.parse(read('public/maps/land-50m.json')) as Topology<{
			land: GeometryCollection;
		}>;
		const countries = JSON.parse(read('public/maps/countries-50m.json')) as Topology<{
			countries: GeometryCollection;
		}>;
		const landFeatures = feature(land, land.objects.land);
		const borders = mesh(countries, countries.objects.countries, (a, b) => a !== b);
		const coast = mesh(countries, countries.objects.countries, (a, b) => a === b);
		assert.ok(landFeatures.features.length > 0);
		assert.ok(borders.coordinates.length > 10);
		assert.ok(coast.coordinates.length > 10);
		const first = coast.coordinates[0]?.[0];
		assert.ok(first);
		assert.ok(first[0]! >= -180 && first[0]! <= 180);
		assert.ok(first[1]! >= -90 && first[1]! <= 90);
	});

	it('keeps stop copy off the map and does not request raster tiles', () => {
		const client = read('src/components/trajectory-map-client.ts');
		const view = read('src/components/TrajectoryMap.astro');
		assert.match(client, /VECTOR_BASEMAP/);
		assert.match(client, /fetch\(/);
		assert.doesNotMatch(client, /tileLayer|openstreetmap|traj-caption|data-traj-cap-/i);
		assert.match(view, /data-traj-card/);
		assert.match(view, /traj-narr/);
		assert.doesNotMatch(view, /traj-caption|data-traj-cap-|openstreetmap|tileLayer/i);
	});
});
