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

/**
 * Mark x strictly outside `edge` on `side`.
 * A mark that only overhangs the edge uses a point one stub out, so the vertical
 * run stays next to that side instead of at the far corner.
 */
function outsideX(mark: SplitMark, edge: number, side: 'left' | 'right'): number | null {
	const left = mark.x;
	const right = mark.x + mark.w;
	const stubFor = (available: number) => (available >= 32 ? 16 : available / 2);
	if (side === 'right') {
		if (right <= edge + EPS) return null;
		if (left > edge + EPS) return left;
		const stub = stubFor(right - edge);
		return stub > EPS ? edge + stub : null;
	}
	if (left >= edge - EPS) return null;
	if (right < edge - EPS) return right;
	const stub = stubFor(edge - left);
	return stub > EPS ? edge - stub : null;
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

function terminalStub(fromX: number, y: number, edge: number): LeaderPoint[] | null {
	const hGap = Math.abs(edge - fromX);
	if (hGap <= EPS) return null;
	const hSign = edge >= fromX ? 1 : -1;
	const hStub = hGap >= 32 ? 16 : hGap / 2;
	return [
		{ x: fromX, y },
		{ x: edge - hSign * hStub, y },
		{ x: edge, y },
	];
}

/**
 * Orthogonal elbow into one vertical side of a letterbox note.
 * Vertical run from the mark edge that sits strictly outside that side, then a
 * horizontal stub that ends at mid-height on `note.left` or `note.right`.
 * No diagonal, and no top or bottom midpoint. A side with no positive outside stub is skipped.
 */
function letterboxSidePath(
	mark: SplitMark,
	note: PlateRect,
	side: 'left' | 'right',
): LeaderPoint[] | null {
	const band = letterboxBand(mark, note);
	if (!band) return null;
	const midY = (note.top + note.bottom) / 2;
	const edge = side === 'left' ? note.left : note.right;
	const px = outsideX(mark, edge, side);
	if (px === null) return null;
	const vGap = Math.abs(midY - band.yMark);
	if (vGap > EPS && vGap < 4) return null;
	const stub = terminalStub(px, midY, edge);
	if (!stub) return null;
	const points = dedupePoints([{ x: px, y: band.yMark }, ...stub]);
	if (points.length < 2) return null;
	const before = points.at(-2);
	const end = points.at(-1);
	if (!before || !end || before.y !== end.y || before.x === end.x) return null;
	if (leaderEntersNoteInterior(points, note)) return null;
	return points;
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
		const path = letterboxSidePath(mark, note, side);
		if (path && path.length >= 2) paths.push(path);
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
		leaderEntersNoteInterior(points, item.note) ||
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

export function selectSplitLeaders(items: readonly SplitLeaderInput[]): SplitLeaderResult[] {
	const ordered = [...items].sort((a, b) => a.index - b.index);
	const accepted: { index: number; points: LeaderPoint[] }[] = [];
	const results: SplitLeaderResult[] = [];
	for (const item of ordered) {
		if (item.omitLeader) {
			results.push({ index: item.index, points: null });
			continue;
		}
		const points = leaderCandidates(item).find((path) => !leaderRejected(path, item, ordered, accepted));
		if (!points) {
			results.push({ index: item.index, points: null });
			continue;
		}
		accepted.push({ index: item.index, points });
		results.push({ index: item.index, points });
	}
	return results;
}
