/**
 * Arrival magnet for the trajectory map.
 * Pure: the Leaflet driver pans by the offset this module returns.
 *
 * After the settle the current pin's point is drawn into a safe frame inside
 * the map window — never flush with the edge, never under the year rail. The
 * frame is the map window minus a breakpoint inset; the single-pin target is
 * the frame's optical centre (centre x, 42% down) because the teardrop's head
 * reads above its point. Pan only: the settle zoom is already decided.
 */

export type MagnetInset = {
	top: number;
	right: number;
	bottom: number;
	left: number;
};

/** ≤640: phone, narration sits under the map. */
export const MAGNET_INSET_MOBILE: MagnetInset = { top: 36, right: 28, bottom: 44, left: 28 };
/** 641–899: one column, narration still under the map. */
export const MAGNET_INSET_MID: MagnetInset = { top: 36, right: 32, bottom: 44, left: 32 };
/** ≥900: map | narration two columns. */
export const MAGNET_INSET_DESKTOP: MagnetInset = { top: 40, right: 40, bottom: 48, left: 40 };

export const MAGNET_MOBILE_MAX = 640;
export const MAGNET_MID_MAX = 899;

/** 0 = top, 1 = bottom. The point sits slightly above the frame's middle. */
export const MAGNET_OPTICAL_Y = 0.42;
/** Already inside the frame by this much: no nudge, no jitter. */
export const MAGNET_EDGE_SLACK_PX = 8;
/** Short ease for the correcting pan. */
export const MAGNET_SNAP_MS = 220;

/** Breakpoint inset. All three steps are live: phone, mid, desktop. */
export function magnetInsets(width: number): MagnetInset {
	if (width <= MAGNET_MOBILE_MAX) return MAGNET_INSET_MOBILE;
	if (width <= MAGNET_MID_MAX) return MAGNET_INSET_MID;
	return MAGNET_INSET_DESKTOP;
}

export type MagnetFrame = {
	left: number;
	top: number;
	right: number;
	bottom: number;
	width: number;
	height: number;
};

/** The map window minus the inset. A window too small for the inset keeps a box. */
export function magnetFrame(size: { x: number; y: number }, insets: MagnetInset): MagnetFrame {
	const left = insets.left;
	const top = insets.top;
	const right = Math.max(left + 1, size.x - insets.right);
	const bottom = Math.max(top + 1, size.y - insets.bottom);
	return { left, top, right, bottom, width: right - left, height: bottom - top };
}

/** Where a single pin's point should sit: centre x, `MAGNET_OPTICAL_Y` down. */
export function magnetOpticalTarget(
	size: { x: number; y: number },
	insets: MagnetInset,
): { x: number; y: number } {
	const frame = magnetFrame(size, insets);
	return {
		x: frame.left + frame.width / 2,
		y: frame.top + frame.height * MAGNET_OPTICAL_Y,
	};
}

function inside(
	x: number,
	y: number,
	frame: MagnetFrame,
	slack: number,
): boolean {
	return (
		x >= frame.left - slack &&
		x <= frame.right + slack &&
		y >= frame.top - slack &&
		y <= frame.bottom + slack
	);
}

function rounded(offset: { x: number; y: number }): { x: number; y: number } | null {
	const x = Math.round(offset.x);
	const y = Math.round(offset.y);
	if (x === 0 && y === 0) return null;
	return { x, y };
}

/**
 * Pan vector for one point, or `null` when it already reads inside the frame.
 * The point is the teardrop's tip, so this is the whole pin's placement.
 */
export function magnetOffset(input: {
	point: { x: number; y: number };
	size: { x: number; y: number };
	insets: MagnetInset;
	slack?: number;
}): { x: number; y: number } | null {
	const slack = input.slack ?? MAGNET_EDGE_SLACK_PX;
	const frame = magnetFrame(input.size, input.insets);
	if (inside(input.point.x, input.point.y, frame, slack)) return null;
	const target = magnetOpticalTarget(input.size, input.insets);
	return rounded({ x: target.x - input.point.x, y: target.y - input.point.y });
}

export type MagnetRect = { x: number; y: number; width: number; height: number };

/**
 * Pan vector for a near cluster: the shortest shift that puts its box inside
 * the frame. `null` when the box already fits (plus slack). No second zoom.
 */
export function magnetRectOffset(input: {
	rect: MagnetRect;
	size: { x: number; y: number };
	insets: MagnetInset;
	slack?: number;
}): { x: number; y: number } | null {
	const slack = input.slack ?? MAGNET_EDGE_SLACK_PX;
	const frame = magnetFrame(input.size, input.insets);
	const { rect } = input;
	const fits =
		rect.x >= frame.left - slack &&
		rect.y >= frame.top - slack &&
		rect.x + rect.width <= frame.right + slack &&
		rect.y + rect.height <= frame.bottom + slack;
	if (fits) return null;
	let x = 0;
	let y = 0;
	if (rect.x < frame.left) x = frame.left - rect.x;
	else if (rect.x + rect.width > frame.right) x = frame.right - (rect.x + rect.width);
	if (rect.y < frame.top) y = frame.top - rect.y;
	else if (rect.y + rect.height > frame.bottom) y = frame.bottom - (rect.y + rect.height);
	return rounded({ x, y });
}

/**
 * `fitBounds` padding for a near cluster: the same frame, read as an inset.
 * Asymmetric on purpose — the bottom inset stays the larger one, so a pin
 * never hugs the frame's lower edge. The zoom cap is unchanged.
 */
export function magnetFitPadding(insets: MagnetInset): {
	topLeft: { x: number; y: number };
	bottomRight: { x: number; y: number };
} {
	return {
		topLeft: { x: insets.left, y: insets.top },
		bottomRight: { x: insets.right, y: insets.bottom },
	};
}

/** Sum of the insets on each axis: the frame's size, for `getBoundsZoom`. */
export function magnetZoomPadding(insets: MagnetInset): { x: number; y: number } {
	return { x: insets.left + insets.right, y: insets.top + insets.bottom };
}

/**
 * Who owns the map right now. Explore is the reader's; a cruise is still
 * moving; the opening overview hold is not a landing.
 */
export function magnetSkips(input: {
	viewMode: 'guide' | 'explore' | 'chrono';
	flying: boolean;
}): boolean {
	if (input.viewMode === 'explore') return true;
	if (input.viewMode === 'chrono') return true;
	return input.flying;
}

/** Reduced motion jumps to the frame: no 220ms slide. */
export function magnetSettleMs(reduceMotion: boolean): number {
	return reduceMotion ? 0 : MAGNET_SNAP_MS;
}
