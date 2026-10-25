import type { LeaderPoint } from './detail-display.ts';

export type PlateRect = {
	left: number;
	right: number;
	top: number;
	bottom: number;
};

export type SplitMark = { x: number; y: number; w: number; h: number };

export type SplitLeaderInput = {
	index: number;
	mark: SplitMark;
	side: 'left' | 'right';
	note: PlateRect;
	omitLeader: boolean;
	kind?: 'side' | 'letterbox' | 'scrim' | 'overflow';
};

export type SplitLeaderResult = {
	index: number;
	points: LeaderPoint[] | null;
};

const EPS = 1e-9;

/** Matches `.mark-leader { stroke-dasharray: 6 5 }` in plate user units. */
export const LEADER_DASH_SOLID = 6;
export const LEADER_DASH_GAP = 5;
export const LEADER_DASH_PERIOD = LEADER_DASH_SOLID + LEADER_DASH_GAP;

export function leaderPathLength(points: readonly LeaderPoint[]): number {
	let length = 0;
	for (let index = 0; index < points.length - 1; index += 1) {
		const a = points[index];
		const b = points[index + 1];
		if (!a || !b) continue;
		length += Math.hypot(b.x - a.x, b.y - a.y);
	}
	return length;
}

/**
 * CSS/SVG dashoffset so a `6 5` stroke ends just inside the solid at `pathLength`.
 * Mid-solid (target 3) left only ~2 CSS px of ink at phone plate scale ~0.67; the
 * preceding gap read as a ~6px cream hollow before the note (mhjl329 cover ④ 「盤」).
 * Targeting near the solid end keeps nearly a full dash of ink meeting the edge.
 */
export function leaderTerminusDashOffset(pathLength: number): number {
	const target = LEADER_DASH_SOLID - 0.5;
	const phase = ((pathLength % LEADER_DASH_PERIOD) + LEADER_DASH_PERIOD) % LEADER_DASH_PERIOD;
	return (phase - target + LEADER_DASH_PERIOD) % LEADER_DASH_PERIOD;
}


function orient(a: LeaderPoint, b: LeaderPoint, c: LeaderPoint): number {
	return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function overlapT(
	a: LeaderPoint,
	b: LeaderPoint,
	rect: PlateRect,
): { t0: number; t1: number } | null {
	let t0 = 0;
	let t1 = 1;
	const dx = b.x - a.x;
	const dy = b.y - a.y;
	const p = [-dx, dx, -dy, dy];
	const q = [a.x - rect.left, rect.right - a.x, a.y - rect.top, rect.bottom - a.y];
	for (let i = 0; i < 4; i += 1) {
		const pi = p[i] ?? 0;
		const qi = q[i] ?? 0;
		if (Math.abs(pi) <= EPS) {
			if (qi < -EPS) return null;
		} else {
			const t = qi / pi;
			if (pi < 0) {
				if (t > t1) return null;
				if (t > t0) t0 = t;
			} else {
				if (t < t0) return null;
				if (t < t1) t1 = t;
			}
		}
	}
	if (t0 > t1 + EPS) return null;
	return { t0, t1 };
}

function hitsClosedRect(points: readonly LeaderPoint[], rect: PlateRect): boolean {
	for (let index = 0; index < points.length - 1; index += 1) {
		const start = points[index];
		const end = points[index + 1];
		if (!start || !end) continue;
		const hit = overlapT(start, end, rect);
		if (hit && hit.t1 >= -EPS && hit.t0 <= 1 + EPS) return true;
	}
	return false;
}

function markRect(mark: SplitMark): PlateRect {
	return {
		left: mark.x,
		right: mark.x + mark.w,
		top: mark.y,
		bottom: mark.y + mark.h,
	};
}

function reentersOwnBox(points: readonly LeaderPoint[], mark: SplitMark): boolean {
	const rect = markRect(mark);
	for (let index = 0; index < points.length - 1; index += 1) {
		const start = points[index];
		const end = points[index + 1];
		if (!start || !end) continue;
		const hit = overlapT(start, end, rect);
		if (hit && hit.t1 > 1e-8) return true;
	}
	return false;
}

export function leaderEntersNoteInterior(points: readonly LeaderPoint[], note: PlateRect): boolean {
	for (let index = 0; index < points.length - 1; index += 1) {
		const start = points[index];
		const end = points[index + 1];
		if (!start || !end) continue;
		const hit = overlapT(start, end, note);
		if (!hit || hit.t1 - hit.t0 <= 1e-8) continue;
		const mid = (hit.t0 + hit.t1) / 2;
		const x = start.x + mid * (end.x - start.x);
		const y = start.y + mid * (end.y - start.y);
		if (x > note.left + EPS && x < note.right - EPS && y > note.top + EPS && y < note.bottom - EPS) {
			return true;
		}
	}
	return false;
}

export function polylinesProperlyCross(
	left: readonly LeaderPoint[],
	right: readonly LeaderPoint[],
): boolean {
	const strict = (p: number, q: number) => (p > EPS && q < -EPS) || (p < -EPS && q > EPS);
	for (let i = 0; i < left.length - 1; i += 1) {
		const a = left[i];
		const b = left[i + 1];
		if (!a || !b) continue;
		for (let j = 0; j < right.length - 1; j += 1) {
			const c = right[j];
			const d = right[j + 1];
			if (!c || !d) continue;
			const o1 = orient(a, b, c);
			const o2 = orient(a, b, d);
			const o3 = orient(c, d, a);
			const o4 = orient(c, d, b);
			if (strict(o1, o2) && strict(o3, o4)) return true;
		}
	}
	return false;
}

function sideElbow(args: {
	mark: SplitMark;
	side: 'left' | 'right';
	note: PlateRect;
}): LeaderPoint[] | null {
	const { mark, side, note } = args;
	const start = {
		x: side === 'left' ? mark.x : mark.x + mark.w,
		y: mark.y + mark.h / 2,
	};
	const end = {
		x: side === 'right' ? note.left : note.right,
		y: (note.top + note.bottom) / 2,
	};
	const gap = side === 'right' ? end.x - start.x : start.x - end.x;
	if (gap < 0) return null;
	if (start.y === end.y) return [start, end];
	if (gap < 4) return null;
	const stub = gap >= 32 ? 16 : gap / 2;
	const sign = side === 'right' ? 1 : -1;
	return [
		start,
		{ x: start.x + sign * stub, y: start.y },
		{ x: end.x - sign * stub, y: end.y },
		end,
	];
}

function letterboxBand(mark: SplitMark, note: PlateRect): {
	above: boolean;
	yMark: number;
	yEdge: number;
} | null {
	const above = (note.top + note.bottom) / 2 < mark.y + mark.h / 2;
	const yMark = above ? mark.y : mark.y + mark.h;
	const yEdge = above ? note.bottom : note.top;
	const gap = above ? yMark - yEdge : yEdge - yMark;
	if (gap < 0) return null;
	return { above, yMark, yEdge };
}

function edgeDistance(mark: SplitMark, edge: number): number {
	return Math.abs(mark.x + mark.w / 2 - edge);
}

/** Minimum horizontal run into the note edge (≥ one `6 5` dash period). */
export const MIN_LETTERBOX_STUB = 12;
/** Inset from the plate-facing note edge for the side terminus on tall notes. */
const LETTERBOX_NEAR_INSET = 8;

/**
 * Mark x strictly outside `edge` on `side`, at least `MIN_LETTERBOX_STUB` away.
 * Short overhangs still get a full stub (vertical may sit a few units past the
 * mark) so butt-capped dashes can paint a terminus instead of dying mid-gap.
 * Returns null when the mark does not overhang — caller may park beside the note.
 */
function outsideX(mark: SplitMark, edge: number, side: 'left' | 'right'): number | null {
	const left = mark.x;
	const right = mark.x + mark.w;
	if (side === 'right') {
		if (right <= edge + EPS) return null;
		return Math.max(left, edge + MIN_LETTERBOX_STUB);
	}
	if (left >= edge - EPS) return null;
	return Math.min(right, edge - MIN_LETTERBOX_STUB);
}

function parkX(edge: number, side: 'left' | 'right'): number {
	return side === 'right' ? edge + MIN_LETTERBOX_STUB : edge - MIN_LETTERBOX_STUB;
}

/** Side-terminus Y: hug the plate-facing edge so tall notes do not bury the elbow. */
function nearBandY(band: { above: boolean }, note: PlateRect): number {
	const height = note.bottom - note.top;
	const inset = Math.min(LETTERBOX_NEAR_INSET, Math.max(0, height / 2 - EPS));
	return band.above ? note.bottom - inset : note.top + inset;
}

function dedupePoints(points: readonly LeaderPoint[]): LeaderPoint[] {
	const out: LeaderPoint[] = [];
	for (const point of points) {
		const prev = out.at(-1);
		if (prev && Math.abs(prev.x - point.x) <= EPS && Math.abs(prev.y - point.y) <= EPS) continue;
		out.push(point);
	}
	return out;
}

/** How far the terminal stub continues past the note side edge into glyph ink. */
export const LETTERBOX_STUB_PENETRATE = 10;

function terminalStub(fromX: number, y: number, edge: number): LeaderPoint[] | null {
	const hGap = Math.abs(edge - fromX);
	if (hGap <= EPS) return null;
	// Park stays outside; tip continues past the side edge into note ink. Ending ON the
	// edge (penetrateCss=0) left a phone-scale ~8px stub that read as "stops left of ②"
	// / "no horizontal into the text" on falp381 insert after #77–#80.
	const into = fromX < edge - EPS ? 1 : fromX > edge + EPS ? -1 : 0;
	if (into === 0) return null;
	return [
		{ x: fromX, y },
		{ x: edge + into * LETTERBOX_STUB_PENETRATE, y },
	];
}

/**
 * True when a path wrongly cuts through note ink. The terminal horizontal stub may
 * continue up to LETTERBOX_STUB_PENETRATE past a vertical side so the dash paints
 * over glyphs (live falp381 insert ②③); anything deeper or non-terminal is rejected.
 */
export function leaderViolatesNoteInterior(
	points: readonly LeaderPoint[],
	note: PlateRect,
): boolean {
	if (points.length < 2) return false;
	if (points.length >= 3 && leaderEntersNoteInterior(points.slice(0, -1), note)) return true;
	const start = points.at(-2);
	const end = points.at(-1);
	if (!start || !end) return false;
	if (Math.abs(start.y - end.y) > EPS || Math.abs(start.x - end.x) <= EPS) {
		return leaderEntersNoteInterior([start, end], note);
	}
	const y = end.y;
	if (y <= note.top + EPS || y >= note.bottom - EPS) {
		return leaderEntersNoteInterior([start, end], note);
	}
	const fromLeft =
		start.x <= note.left + EPS &&
		end.x >= note.left - EPS &&
		end.x <= note.left + LETTERBOX_STUB_PENETRATE + EPS;
	const fromRight =
		start.x >= note.right - EPS &&
		end.x <= note.right + EPS &&
		end.x >= note.right - LETTERBOX_STUB_PENETRATE - EPS;
	if (fromLeft || fromRight) return false;
	return leaderEntersNoteInterior([start, end], note);
}

/**
 * One letterbox side path at vertical x `px` (near, park, or far mark edge).
 * When `overhang` is null, clear horizontally at the mark band first (parkX).
 */
function letterboxSidePathAt(
	mark: SplitMark,
	note: PlateRect,
	_side: 'left' | 'right',
	band: { above: boolean; yMark: number; yEdge: number },
	yEnd: number,
	edge: number,
	px: number,
	overhang: number | null,
): LeaderPoint[] | null {
	const vGap = Math.abs(yEnd - band.yMark);
	if (vGap > EPS && vGap < 4) return null;
	const stub = terminalStub(px, yEnd, edge);
	if (!stub) return null;
	const head: LeaderPoint[] = [];
	if (overhang === null) {
		// Exit along the band edge from the mark side facing the park — never from the
		// mark interior. Starting at mark mid-x made the first segment re-enter the
		// closed mark box, so selectSplitLeaders dropped the only park candidates
		// (live mhjl329 cover ②: note over mark in x → empty polyline).
		const markLeft = mark.x;
		const markRight = mark.x + mark.w;
		const startX =
			px >= markRight - EPS ? markRight : px <= markLeft + EPS ? markLeft : px > (markLeft + markRight) / 2 ? markRight : markLeft;
		head.push({ x: startX, y: band.yMark });
		if (Math.abs(startX - px) > EPS) head.push({ x: px, y: band.yMark });
	} else {
		head.push({ x: px, y: band.yMark });
	}
	const points = dedupePoints([...head, ...stub]);
	if (points.length < 2) return null;
	const before = points.at(-2);
	const end = points.at(-1);
	if (!before || !end || before.y !== end.y || before.x === end.x) return null;
	if (leaderViolatesNoteInterior(points, note)) return null;
	return points;
}

/**
 * Orthogonal elbow into one vertical side of a letterbox note.
 * Vertical run parked outside that side, then a horizontal stub that crosses
 * `note.left` or `note.right` into glyph ink near the plate-facing edge (not mid-height on tall
 * notes — midY buried elbows under opaque paper). When the mark does not overhang
 * the side, clear horizontally at the mark band first, then park and drop — so a
 * note sitting over the mark in x still gets a leader (omit path only, keep note).
 * Also tries the far mark edge after near/park so a mid-plate blocker
 * (falp381 insert ⑤ under ②, ① above ③) can be cleared.
 */
function letterboxSidePaths(
	mark: SplitMark,
	note: PlateRect,
	side: 'left' | 'right',
): LeaderPoint[][] {
	const band = letterboxBand(mark, note);
	if (!band) return [];
	const yEnd = nearBandY(band, note);
	const edge = side === 'left' ? note.left : note.right;
	const overhang = outsideX(mark, edge, side);
	const paths: LeaderPoint[][] = [];
	const seen = new Set<string>();
	const pushPx = (px: number, oh: number | null) => {
		const key = `${px.toFixed(3)}:${oh === null ? 'p' : 'o'}`;
		if (seen.has(key)) return;
		seen.add(key);
		const path = letterboxSidePathAt(mark, note, side, band, yEnd, edge, px, oh);
		if (path && path.length >= 2) paths.push(path);
	};
	pushPx(overhang ?? parkX(edge, side), overhang);
	if (overhang !== null) {
		const far = side === 'right' ? mark.x + mark.w : mark.x;
		if (Math.abs(far - overhang) > EPS) pushPx(far, overhang);
	}
	return paths;
}

function letterboxCandidates(mark: SplitMark, note: PlateRect): LeaderPoint[][] {
	const sides: Array<'left' | 'right'> = ['left', 'right'];
	sides.sort((a, b) => {
		const da = edgeDistance(mark, a === 'left' ? note.left : note.right);
		const db = edgeDistance(mark, b === 'left' ? note.left : note.right);
		if (Math.abs(da - db) > EPS) return da - db;
		return a === 'left' ? -1 : 1;
	});
	const paths: LeaderPoint[][] = [];
	for (const side of sides) {
		for (const path of letterboxSidePaths(mark, note, side)) paths.push(path);
	}
	return paths;
}

function leaderCandidates(item: SplitLeaderInput): LeaderPoint[][] {
	if (item.kind === 'letterbox') return letterboxCandidates(item.mark, item.note);
	const side = sideElbow(item);
	return side && side.length >= 2 ? [side] : [];
}

function leaderRejected(
	points: readonly LeaderPoint[],
	item: SplitLeaderInput,
	ordered: readonly SplitLeaderInput[],
	accepted: readonly { points: LeaderPoint[] }[],
): boolean {
	return (
		leaderViolatesNoteInterior(points, item.note) ||
		ordered.some((other) => other.index !== item.index && hitsClosedRect(points, other.note)) ||
		ordered.some((other) => other.index !== item.index && hitsClosedRect(points, markRect(other.mark))) ||
		reentersOwnBox(points, item.mark) ||
		accepted.some((prev) => polylinesProperlyCross(points, prev.points))
	);
}

export function splitLeaderPath(args: {
	mark: SplitMark;
	side: 'left' | 'right';
	note: PlateRect;
	kind?: SplitLeaderInput['kind'];
}): LeaderPoint[] | null {
	if (args.kind === 'letterbox') return letterboxCandidates(args.mark, args.note)[0] ?? null;
	return sideElbow(args);
}

export type SplitLeaderOptions = {
	/** Pane left/right in plate user units. Letterbox parks outside a flush note fall
	 *  past this band and are clipped by `.split-imagery { overflow: hidden }` — reject
	 *  those paths so packing/draw prefer an in-pane elbow (falp381 insert ②③). */
	visibleX?: { left: number; right: number };
};

function pathOutsideVisibleX(
	points: readonly LeaderPoint[],
	visibleX: { left: number; right: number } | undefined,
): boolean {
	if (!visibleX) return false;
	for (const point of points) {
		if (point.x < visibleX.left - EPS || point.x > visibleX.right + EPS) return true;
	}
	return false;
}

export function selectSplitLeaders(
	items: readonly SplitLeaderInput[],
	opts?: SplitLeaderOptions,
): SplitLeaderResult[] {
	const ordered = [...items].sort((a, b) => a.index - b.index);
	const accepted: { index: number; points: LeaderPoint[] }[] = [];
	const results: SplitLeaderResult[] = [];
	const visibleX = opts?.visibleX;
	for (const item of ordered) {
		if (item.omitLeader) {
			results.push({ index: item.index, points: null });
			continue;
		}
		const points = leaderCandidates(item).find(
			(path) =>
				!leaderRejected(path, item, ordered, accepted) && !pathOutsideVisibleX(path, visibleX),
		);
		if (!points) {
			results.push({ index: item.index, points: null });
			continue;
		}
		accepted.push({ index: item.index, points });
		results.push({ index: item.index, points });
	}
	return results;
}
