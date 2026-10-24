export const STAGE_ROWS = [
	{ id: 'upright', label: '原片扶正', status: '全幅' },
	{ id: 'crop', label: '裁进板心', status: '板心' },
	{ id: 'boxes', label: '标出要点', status: '框选' },
	{ id: 'notes', label: '读注', status: '旁注' },
] as const;

/** 760 / (760 + 80) from runTimeline. Blend inside the first travel gap, not a settle stop. */
export const CROP_BLEND_AT = 0.9;

export const DETAIL_CROSSFADE_MS = 1600;
export const SETTLE_IDLE_MS = 180;
export const SETTLE_EPSILON_PX = 6;
export const SETTLE_SLACK_PX = 24;
export const SETTLE_LOCK_MS = 800;

export type Box = { left: number; top: number; width: number; height: number };

export type StageVisual = {
	cropT: number;
	uprightOpacity: number;
	plateOpacity: number;
	boxesOpacity: number;
	notesOpacity: number;
};

export function containBox(viewW: number, viewH: number, naturalW: number, naturalH: number): Box {
	const containScale = Math.min(viewW / naturalW, viewH / naturalH);
	return {
		left: (viewW - naturalW * containScale) / 2,
		top: (viewH - naturalH * containScale) / 2,
		width: naturalW * containScale,
		height: naturalH * containScale,
	};
}

export function croppedBox(
	viewW: number,
	naturalW: number,
	naturalH: number,
	crop: { x: number; y: number; w: number; h: number },
): Box {
	const cropScale = viewW / crop.w;
	return {
		left: -crop.x * cropScale,
		top: -crop.y * cropScale,
		width: naturalW * cropScale,
		height: naturalH * cropScale,
	};
}

export function lerpBox(from: Box, to: Box, t: number): Box {
	const u = Math.min(1, Math.max(0, t));
	return {
		left: from.left + (to.left - from.left) * u,
		top: from.top + (to.top - from.top) * u,
		width: from.width + (to.width - from.width) * u,
		height: from.height + (to.height - from.height) * u,
	};
}

export function stageVisual(p: number, notesOn: boolean): StageVisual {
	const clamped = Math.min(1, Math.max(0, p));
	if (clamped >= 1) {
		return {
			cropT: 1,
			uprightOpacity: 0,
			plateOpacity: 1,
			boxesOpacity: 1,
			notesOpacity: notesOn ? 1 : 0,
		};
	}
	const scaled = clamped * 3;
	const interval = Math.min(2, Math.floor(scaled));
	const local = scaled - interval;
	if (interval === 0) {
		if (local < CROP_BLEND_AT) {
			return {
				cropT: local / CROP_BLEND_AT,
				uprightOpacity: 1,
				plateOpacity: 0,
				boxesOpacity: 0,
				notesOpacity: 0,
			};
		}
		const fade = (local - CROP_BLEND_AT) / (1 - CROP_BLEND_AT);
		return {
			cropT: 1,
			uprightOpacity: 1 - fade,
			plateOpacity: fade,
			boxesOpacity: 0,
			notesOpacity: 0,
		};
	}
	if (interval === 1) {
		return {
			cropT: 1,
			uprightOpacity: 0,
			plateOpacity: 1,
			boxesOpacity: local,
			notesOpacity: 0,
		};
	}
	return {
		cropT: 1,
		uprightOpacity: 0,
		plateOpacity: 1,
		boxesOpacity: 1,
		notesOpacity: notesOn ? local : 0,
	};
}

/** `anchors` are viewport Y of row labels, top to bottom (increasing Y). */
export function progressFromAnchors(anchors: readonly number[], activationY: number): number {
	if (anchors.length === 0) return 1;
	const first = anchors[0];
	const last = anchors[anchors.length - 1];
	if (first === undefined || last === undefined) return 1;
	if (anchors.length === 1 || first === last) return activationY >= first ? 1 : 0;
	const t = (activationY - first) / (last - first);
	return Math.min(1, Math.max(0, t));
}

/** Strict `<` so an equal distance keeps the earlier row. */
export function nearestRowIndex(anchors: readonly number[], activationY: number): number {
	let best = 0;
	let bestDist = Number.POSITIVE_INFINITY;
	for (let i = 0; i < anchors.length; i++) {
		const y = anchors[i];
		if (y === undefined) continue;
		const dist = Math.abs(y - activationY);
		if (dist < bestDist) {
			bestDist = dist;
			best = i;
		}
	}
	return best;
}

/** Last heading whose top has reached the line. Empty input stays on 0. */
export function activeDetailIndex(headingTops: readonly number[], activationY: number): number {
	let index = 0;
	for (let i = 0; i < headingTops.length; i++) {
		const top = headingTops[i];
		if (top !== undefined && top <= activationY) index = i;
	}
	return index;
}

/**
 * Desktop line sits in the left column (0.42 of the viewport).
 * Narrow line sits in the paper band under the 58svh image (0.72).
 */
export function activationLineY(viewportHeight: number, desktop: boolean): number {
	return viewportHeight * (desktop ? 0.42 : 0.72);
}

export function scrollTopForAnchor(
	currentScrollY: number,
	anchorViewportY: number,
	lineY: number,
): number {
	return currentScrollY + (anchorViewportY - lineY);
}

/** True while the line is inside the itinerary rows, including the tall body of the last row. */
export function shouldSettle(
	anchors: readonly number[],
	lastRowBottom: number,
	activationY: number,
	slackPx: number,
): boolean {
	if (anchors.length === 0) return false;
	const first = anchors[0];
	if (first === undefined) return false;
	return activationY >= first - slackPx && activationY <= lastRowBottom + slackPx;
}
