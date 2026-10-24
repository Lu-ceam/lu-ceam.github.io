export const SCRUB_KEYS = [0, 0.55, 0.75, 1] as const;

export type ScrubVisual = {
	cropT: number;
	plateOpacity: number;
	uprightOpacity: number;
	boxesOpacity: number;
};

export type Box = { left: number; top: number; width: number; height: number };

export type Crop = { x: number; y: number; w: number; h: number };

/** Map chapter scroll into [0, 1]. A runway no taller than the viewport is already settled. */
export function chapterProgress(runway: HTMLElement): number {
	const rect = runway.getBoundingClientRect();
	const total = runway.offsetHeight - window.innerHeight;
	if (total <= 0) return 1;
	const scrolled = -rect.top;
	return Math.min(1, Math.max(0, scrolled / total));
}

/** Piecewise visual state from p. Crop runs to 0.55, then the plate and boxes. */
export function scrubVisual(p: number): ScrubVisual {
	if (p <= 0.55) {
		const cropT = p / 0.55;
		return { cropT, plateOpacity: 0, uprightOpacity: 1, boxesOpacity: 0 };
	}
	if (p < 0.75) {
		const t = (p - 0.55) / 0.2;
		return { cropT: 1, plateOpacity: 1, uprightOpacity: 0, boxesOpacity: t };
	}
	return { cropT: 1, plateOpacity: 1, uprightOpacity: 0, boxesOpacity: 1 };
}

/** Earlier key wins an exact tie, so a midpoint does not jump forward. */
export function nearestKeyframe(p: number, keys: readonly number[] = SCRUB_KEYS): number {
	return keys.reduce((best, k) => (Math.abs(k - p) < Math.abs(best - p) ? k : best));
}

/** Nearest keyframe, or null when p is already within `epsilon` of it. */
export function snapTarget(p: number, epsilon = 0.02): number | null {
	const target = nearestKeyframe(p);
	if (Math.abs(target - p) < epsilon) return null;
	return target;
}

/** The chapter covering the most of the viewport. Ties keep the earlier runway. */
export function activeRunway(
	runways: readonly HTMLElement[],
	viewportHeight = window.innerHeight,
): HTMLElement | null {
	let best: HTMLElement | null = null;
	let bestOverlap = 0;
	for (const runway of runways) {
		const rect = runway.getBoundingClientRect();
		const overlap = Math.min(rect.bottom, viewportHeight) - Math.max(rect.top, 0);
		if (overlap > bestOverlap) {
			best = runway;
			bestOverlap = overlap;
		}
	}
	return best;
}

/** Document Y where this runway's progress equals `p`. */
export function scrollYForProgress(runway: HTMLElement, p: number): number {
	const total = runway.offsetHeight - window.innerHeight;
	const top = window.scrollY + runway.getBoundingClientRect().top;
	return top + p * Math.max(0, total);
}

export function containBox(viewW: number, viewH: number, naturalW: number, naturalH: number): Box {
	const containScale = Math.min(viewW / naturalW, viewH / naturalH);
	return {
		left: (viewW - naturalW * containScale) / 2,
		top: (viewH - naturalH * containScale) / 2,
		width: naturalW * containScale,
		height: naturalH * containScale,
	};
}

export function croppedBox(viewW: number, naturalW: number, naturalH: number, crop: Crop): Box {
	const cropScale = viewW / crop.w;
	return {
		left: -crop.x * cropScale,
		top: -crop.y * cropScale,
		width: naturalW * cropScale,
		height: naturalH * cropScale,
	};
}

export function uprightBox(
	viewW: number,
	viewH: number,
	naturalW: number,
	naturalH: number,
	crop: Crop,
	cropT: number,
): Box {
	const from = containBox(viewW, viewH, naturalW, naturalH);
	const to = croppedBox(viewW, naturalW, naturalH, crop);
	const t = Math.min(1, Math.max(0, cropT));
	if (t === 0) return from;
	if (t === 1) return to;
	return {
		left: from.left + (to.left - from.left) * t,
		top: from.top + (to.top - from.top) * t,
		width: from.width + (to.width - from.width) * t,
		height: from.height + (to.height - from.height) * t,
	};
}
