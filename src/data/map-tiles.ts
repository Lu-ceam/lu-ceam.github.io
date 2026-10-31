/**
 * Local Natural Earth 1:50m vector basemap for the records trajectory map.
 * The browser fetches these static files at runtime. Nothing here is a
 * raster tile URL, and the page must not fall back to a remote tile host.
 *
 * `maxZoom` is the explore cap (12), the same city-scale ceiling as before.
 * Natural Earth has no streets, so the scripted arrival uses `framePullback`
 * and `frameMaxZoom` (the sample's zoom − 1.5, never above 6.2) and explore
 * can still go on to 12.
 *
 * Attribution on the map is "Made with Natural Earth". The geometry is
 * public-domain Natural Earth; the TopoJSON copy is world-atlas (ISC),
 * noted in `public/maps/LICENSE`.
 */
import { resolvedZoom } from './trajectory-camera.ts';

export const VECTOR_BASEMAP = {
	landUrl: '/maps/land-50m.json',
	countriesUrl: '/maps/countries-50m.json',
	minZoom: 2,
	maxZoom: 12,
	framePullback: 1.5,
	frameMaxZoom: 6.2,
	attribution: 'Made with Natural Earth',
} as const;

/** Paper sheet. Keep these in step with the `.traj` custom properties. */
export const BASEMAP_PAINT = {
	ocean: '#e9eef0',
	land: '#f7f3ea',
	graticule: '#cfd8db',
	border: '#cbbfa9',
	coast: '#8f8571',
	route: '#a8432b',
} as const;

/**
 * One path accent: solid brick on the disc being guided.
 * Every other disc is a dashed pencil in the coast tone, lighter than the
 * cross-disc weak link so the sheet does not grow a second route color.
 */
export const PATH_STROKE = {
	selected: BASEMAP_PAINT.route,
	faint: BASEMAP_PAINT.coast,
	faintWeight: 1.1,
	faintOpacity: 0.55,
	faintDash: '1 7',
	weakWeight: 1.25,
	weakOpacity: 0.4,
	weakDash: '2 6',
} as const;

/** Scripted arrival zoom on the 1:50m sheet. Explore is not limited to this. */
export function arrivalZoom(zoom: number | undefined): number {
	const framed = resolvedZoom(zoom) - VECTOR_BASEMAP.framePullback;
	return Math.min(VECTOR_BASEMAP.frameMaxZoom, Math.max(VECTOR_BASEMAP.minZoom, framed));
}
