import { COUNTRY_NAMES_ZH } from './country-names-zh.ts';

/** Natural Earth ids for Hong Kong, Macao, and Taiwan. This version draws no name. */
export const COUNTRY_LABEL_OMIT_IDS: readonly number[] = [344, 446, 158];

export const COUNTRY_LABEL_ZOOM_MIN = 2.5;
export const COUNTRY_LABEL_ZOOM_MAX = 6;
export const COUNTRY_LABEL_CAP_DESKTOP = 12;
export const COUNTRY_LABEL_CAP_MOBILE = 8;
export const COUNTRY_LABEL_OBSTACLE_PAD = 8;
export const COUNTRY_LABEL_WIDTH_RATIO = 1.6;
export const COUNTRY_LABEL_FONT_DESKTOP = 13;
export const COUNTRY_LABEL_FONT_MOBILE = 12;
export const COUNTRY_LABEL_WEIGHT = 400;
export const COUNTRY_LABEL_TRACKING = 0.15;
export const COUNTRY_LABEL_HALO_PX = 2;
export const COUNTRY_LABEL_FADE_MS = 150;
/** Same stack as `body` in `global.css`. */
export const COUNTRY_LABEL_FONT_STACK =
	"'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', 'Noto Sans CJK SC', 'Noto Sans SC', 'Source Han Sans SC', 'WenQuanYi Micro Hei', system-ui, sans-serif";
/** Records pages treat viewports below 48rem as mobile. */
export const COUNTRY_LABEL_MOBILE_QUERY = '(max-width: 47.99rem)';

const OMIT = new Set<number>(COUNTRY_LABEL_OMIT_IDS);

export type CountryLabelAnchor = {
	id: number;
	zh: string;
	lng: number;
	lat: number;
	/** Planar area of the largest polygon, in square degrees. */
	area: number;
	/** Longitude span of that polygon's bounding box, in degrees. */
	ew: number;
};

export type ScreenPoint = { x: number; y: number };

export type ScreenRect = { x: number; y: number; w: number; h: number };

export type LabelCandidate = {
	id: number;
	zh: string;
	x: number;
	y: number;
	projectedArea: number;
	projectedWidth: number;
	textWidth: number;
	textHeight: number;
};

/** Chinese short name, or nothing. Omitted ids and unknown ids never fall back. */
export function countryNameZh(id: number): string | undefined {
	if (OMIT.has(id)) return undefined;
	return COUNTRY_NAMES_ZH[id];
}

export function countryLabelZoomVisible(zoom: number): boolean {
	return zoom >= COUNTRY_LABEL_ZOOM_MIN && zoom <= COUNTRY_LABEL_ZOOM_MAX;
}

export function countryLabelCap(mobile: boolean): number {
	return mobile ? COUNTRY_LABEL_CAP_MOBILE : COUNTRY_LABEL_CAP_DESKTOP;
}

export function countryLabelFontSize(mobile: boolean): number {
	return mobile ? COUNTRY_LABEL_FONT_MOBILE : COUNTRY_LABEL_FONT_DESKTOP;
}

/** CSS letter-spacing of `COUNTRY_LABEL_TRACKING` em, from per-glyph advances. */
export function trackedTextWidth(charWidths: readonly number[], fontSize: number): number {
	if (charWidths.length === 0) return 0;
	let width = 0;
	for (const advance of charWidths) width += advance;
	if (charWidths.length > 1) width += fontSize * COUNTRY_LABEL_TRACKING * (charWidths.length - 1);
	return width;
}

/**
 * Screen size of a precomputed country.
 * Width is the longitude span in Web Mercator pixels.
 * Area is the planar square-degree area scaled by the local mercator factor,
 * so a higher latitude outranks the same shape at the equator.
 */
export function projectedCountrySize(
	area: number,
	ew: number,
	lat: number,
	zoom: number,
): { width: number; area: number } {
	const pxPerDeg = (256 * 2 ** zoom) / 360;
	const clamped = Math.max(-85, Math.min(85, lat));
	const cos = Math.cos((clamped * Math.PI) / 180);
	const pxPerDegLat = pxPerDeg / Math.max(cos, 0.01);
	return {
		width: ew * pxPerDeg,
		area: area * pxPerDeg * pxPerDegLat,
	};
}

/** Accept a generated row only when its name is the Chinese table entry. */
export function countryLabelAnchor(value: unknown): CountryLabelAnchor | null {
	if (!value || typeof value !== 'object') return null;
	const row = value as Record<string, unknown>;
	const id = typeof row.id === 'number' ? row.id : Number(row.id);
	const zh = countryNameZh(id);
	if (!zh || row.zh !== zh) return null;
	const lng = Number(row.lng);
	const lat = Number(row.lat);
	const area = Number(row.area);
	const ew = Number(row.ew);
	if (![lng, lat, area, ew].every(Number.isFinite)) return null;
	if (area <= 0 || ew <= 0) return null;
	if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
	return { id, zh, lng, lat, area, ew };
}

function labelRect(candidate: LabelCandidate): ScreenRect {
	return {
		x: candidate.x - candidate.textWidth / 2,
		y: candidate.y - candidate.textHeight / 2,
		w: candidate.textWidth,
		h: candidate.textHeight,
	};
}

function expandRect(rect: ScreenRect, pad: number): ScreenRect {
	return { x: rect.x - pad, y: rect.y - pad, w: rect.w + pad * 2, h: rect.h + pad * 2 };
}

function intersects(a: ScreenRect, b: ScreenRect): boolean {
	return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function pointInRect(point: ScreenPoint, rect: ScreenRect): boolean {
	return point.x >= rect.x && point.x <= rect.x + rect.w && point.y >= rect.y && point.y <= rect.y + rect.h;
}

function orient(a: ScreenPoint, b: ScreenPoint, c: ScreenPoint): number {
	return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function onSegment(a: ScreenPoint, b: ScreenPoint, c: ScreenPoint): boolean {
	return (
		orient(a, b, c) === 0 &&
		Math.min(a.x, b.x) <= c.x &&
		c.x <= Math.max(a.x, b.x) &&
		Math.min(a.y, b.y) <= c.y &&
		c.y <= Math.max(a.y, b.y)
	);
}

function segmentsIntersect(a: ScreenPoint, b: ScreenPoint, c: ScreenPoint, d: ScreenPoint): boolean {
	const o1 = orient(a, b, c);
	const o2 = orient(a, b, d);
	const o3 = orient(c, d, a);
	const o4 = orient(c, d, b);
	if (((o1 > 0 && o2 < 0) || (o1 < 0 && o2 > 0)) && ((o3 > 0 && o4 < 0) || (o3 < 0 && o4 > 0))) return true;
	if (o1 === 0 && onSegment(a, b, c)) return true;
	if (o2 === 0 && onSegment(a, b, d)) return true;
	if (o3 === 0 && onSegment(c, d, a)) return true;
	if (o4 === 0 && onSegment(c, d, b)) return true;
	return false;
}

function segmentHitsRect(a: ScreenPoint, b: ScreenPoint, rect: ScreenRect): boolean {
	if (pointInRect(a, rect) || pointInRect(b, rect)) return true;
	const corners: ScreenPoint[] = [
		{ x: rect.x, y: rect.y },
		{ x: rect.x + rect.w, y: rect.y },
		{ x: rect.x + rect.w, y: rect.y + rect.h },
		{ x: rect.x, y: rect.y + rect.h },
	];
	for (let i = 0; i < 4; i++) {
		const next = corners[(i + 1) % 4]!;
		if (segmentsIntersect(a, b, corners[i]!, next)) return true;
	}
	return false;
}

function pathHits(points: readonly ScreenPoint[], rect: ScreenRect): boolean {
	const first = points[0];
	if (!first) return false;
	if (points.length === 1) return pointInRect(first, rect);
	for (let i = 1; i < points.length; i++) {
		if (segmentHitsRect(points[i - 1]!, points[i]!, rect)) return true;
	}
	return false;
}

/**
 * Labels inside the zoom band, largest projected area first, capped per viewport.
 * A country is dropped when its projected bbox is narrower than the text, when it
 * misses the viewport, or when it hits a padded obstacle or a larger name.
 */
export function selectCountryLabels(input: {
	zoom: number;
	mobile: boolean;
	candidates: readonly LabelCandidate[];
	obstacles: readonly ScreenRect[];
	paths: readonly (readonly ScreenPoint[])[];
	viewport: ScreenRect;
	pathRadius?: number;
}): LabelCandidate[] {
	if (!countryLabelZoomVisible(input.zoom)) return [];
	const cap = countryLabelCap(input.mobile);
	const pathClearance = COUNTRY_LABEL_OBSTACLE_PAD + (input.pathRadius ?? 0);
	const eligible: LabelCandidate[] = [];
	for (const candidate of input.candidates) {
		if (OMIT.has(candidate.id)) continue;
		if (candidate.textWidth <= 0 || candidate.projectedWidth <= 0) continue;
		if (candidate.projectedWidth < candidate.textWidth * COUNTRY_LABEL_WIDTH_RATIO) continue;
		const rect = labelRect(candidate);
		if (!intersects(rect, input.viewport)) continue;
		eligible.push(candidate);
	}
	eligible.sort((a, b) => b.projectedArea - a.projectedArea || a.id - b.id);
	const kept: LabelCandidate[] = [];
	const keptRects: ScreenRect[] = [];
	const blocked = input.obstacles.map((rect) => expandRect(rect, COUNTRY_LABEL_OBSTACLE_PAD));
	for (const candidate of eligible) {
		if (kept.length >= cap) break;
		const rect = labelRect(candidate);
		if (blocked.some((obstacle) => intersects(rect, obstacle))) continue;
		const cleared = expandRect(rect, pathClearance);
		if (input.paths.some((path) => pathHits(path, cleared))) continue;
		if (keptRects.some((other) => intersects(rect, other))) continue;
		kept.push(candidate);
		keptRects.push(rect);
	}
	return kept;
}
