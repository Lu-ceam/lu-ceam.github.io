/**
 * Basemap for the records trajectory map. One object, so the provider can be
 * replaced without touching the component.
 *
 * v1 uses the OpenStreetMap standard raster, which needs no API key.
 * Data is ODbL; the page must keep the OpenStreetMap attribution.
 * The public CARTO raster CDN now answers unauthenticated requests with
 * "API KEY REQUIRED" tiles, so it is not the default.
 *
 * Swap path: change `url` (`{z}` `{x}` `{y}`, and `{s}` / `{r}` when the
 * provider uses them), `subdomains`, `detectRetina`, the zoom range, and
 * `attribution`. A same-shape alternate is OSM France:
 * `https://{s}.tile.openstreetmap.fr/osmfr/{z}/{x}/{y}.png` with subdomains
 * `abc`. Self-hosted raster uses the same fields. Do not point this at a
 * provider that cannot be replaced, or at one that requires a secret in the
 * client.
 *
 * `maxZoom` is also the map's zoom cap (12), so explore stays above
 * street-level false precision. The OSM server itself serves up to 19.
 */
export const MAP_TILES = {
	url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
	subdomains: '',
	detectRetina: false,
	minZoom: 2,
	maxZoom: 12,
	attribution: [
		{
			href: 'https://www.openstreetmap.org/copyright',
			label: 'OpenStreetMap',
		},
	],
} as const;

/** HTML attribution string for Leaflet. Visible text also rendered beside the map. */
export function mapTileAttributionHtml(): string {
	return MAP_TILES.attribution
		.map(
			(link) =>
				`&copy; <a href="${link.href}" target="_blank" rel="noopener noreferrer">${link.label}</a>`,
		)
		.join(' ');
}
