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

export function splitLeaderPath(args: {
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

export function selectSplitLeaders(items: readonly SplitLeaderInput[]): SplitLeaderResult[] {
	void items;
	throw new Error('Not implemented: selectSplitLeaders');
}
