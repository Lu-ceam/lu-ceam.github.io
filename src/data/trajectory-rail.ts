/**
 * Year rail under the trajectory map.
 * Pure: pins are linear in `place.year`, with a minimum gap, and scroll
 * when the scale would drop below kMin. `yearLabel` is not read.
 *
 * The same year keeps input order, matching `chronoStations`.
 * Positions in `xs` follow the input array. `order` is left to right.
 */

export const RAIL_MIN_PX_PER_YEAR = 0.8;
export const RAIL_MIN_SPAN_YEARS = 20;

/** Smallest step whose pixel length is at least this gets the hairline ticks. */
export const RAIL_TICK_MIN_PX = 24;
/** Century captions appear only when a century is at least this wide. */
export const RAIL_CENTURY_MIN_PX = 48;
export const RAIL_TICK_STEPS = [10, 25, 50, 100] as const;

export type RailTick = {
	year: number;
	x: number;
	/** Set for century years when `100 * k` is wide enough to read. */
	label?: string;
};

export type RailLayoutOptions = {
	width: number;
	/** Minimum pin gap, px. */
	gap: number;
	/** Inset of the first and last pin, px. */
	pad: number;
	kMin: number;
	/** Spans shorter than this are not stretched to the container. */
	minSpan: number;
};

export type RailLayout = {
	/** Pixels per year after the fit. `kMin` when the axis scrolls. */
	k: number;
	/** Pin x in input order, measured from the left of the rail. */
	xs: number[];
	/** Scrollport content width. Equals `opts.width` when the axis fits. */
	width: number;
	scroll: boolean;
	ticks: RailTick[];
	/** Input indices, left to right. */
	order: number[];
};

export function railLayout(years: readonly number[], opts: RailLayoutOptions): RailLayout {
	const n = years.length;
	const indexed = years.map((year, index) => ({ year, index }));
	indexed.sort((a, b) => a.year - b.year || a.index - b.index);
	const ys = indexed.map((row) => row.year);
	const order = indexed.map((row) => row.index);

	if (n === 0 || !(opts.width > 0)) {
		return { k: 0, xs: [], width: Math.max(0, opts.width), scroll: false, ticks: [], order: [] };
	}

	const { width, gap, pad, kMin, minSpan } = opts;
	const inner = width - 2 * pad;
	const span = ys[n - 1]! - ys[0]!;
	const totalAt = (k: number): number => {
		let sum = 0;
		for (let i = 1; i < n; i++) sum += Math.max(gap, (ys[i]! - ys[i - 1]!) * k);
		return sum;
	};

	// Upper bound fills `max(minSpan, span)` across the padded width.
	// A shorter disc stays at that scale and is centered, instead of
	// stretching a one-year gap across the map.
	let k = inner / Math.max(minSpan, span || 1);
	if (totalAt(k) > inner) {
		let lo = 0;
		let hi = k;
		for (let i = 0; i < 40; i++) {
			const mid = (lo + hi) / 2;
			if (totalAt(mid) <= inner) lo = mid;
			else hi = mid;
		}
		k = lo;
	}

	let scroll = false;
	if (k < kMin) {
		k = kMin;
		scroll = totalAt(k) > inner;
	}

	const sortedXs = [pad];
	for (let i = 1; i < n; i++) {
		const gapPx = Math.max(gap, (ys[i]! - ys[i - 1]!) * k);
		sortedXs.push(sortedXs[i - 1]! + gapPx);
	}
	const used = sortedXs[n - 1]! - pad;
	if (!scroll && used < inner) {
		const offset = (inner - used) / 2;
		for (let i = 0; i < n; i++) sortedXs[i] = sortedXs[i]! + offset;
	}

	const xs = new Array<number>(n);
	for (let i = 0; i < n; i++) xs[order[i]!] = sortedXs[i]!;

	return {
		k,
		xs,
		width: Math.max(width, sortedXs[n - 1]! + pad),
		scroll,
		ticks: railTicks(ys, sortedXs, k),
		order,
	};
}

/** Piecewise through the pins, so a min-gap push moves the ticks with it. */
function railYearX(year: number, ys: readonly number[], xs: readonly number[]): number | null {
	for (let i = 1; i < ys.length; i++) {
		const y0 = ys[i - 1]!;
		const y1 = ys[i]!;
		if (year <= y1 && y1 > y0 && year >= y0) {
			return xs[i - 1]! + ((xs[i]! - xs[i - 1]!) * (year - y0)) / (y1 - y0);
		}
	}
	return null;
}

function railTicks(ys: readonly number[], xs: readonly number[], k: number): RailTick[] {
	if (ys.length === 0) return [];
	const min = ys[0]!;
	const max = ys[ys.length - 1]!;
	const step = RAIL_TICK_STEPS.find((candidate) => candidate * k >= RAIL_TICK_MIN_PX) ?? 100;
	const labelCentury = 100 * k >= RAIL_CENTURY_MIN_PX;
	const ticks: RailTick[] = [];
	const start = Math.ceil(min / step) * step;
	for (let year = start; year <= max; year += step) {
		const x = railYearX(year, ys, xs);
		if (x === null) continue;
		const tick: RailTick = { year, x };
		if (labelCentury && year % 100 === 0) tick.label = String(year);
		ticks.push(tick);
	}
	return ticks;
}
