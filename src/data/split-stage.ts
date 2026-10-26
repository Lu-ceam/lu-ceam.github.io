export const DETAIL_CROSSFADE_MS = 1600;
export const SETTLE_IDLE_MS = 180;
export const SETTLE_EPSILON_PX = 6;
export const SETTLE_SLACK_PX = 24;
export const SETTLE_LOCK_MS = 800;

/** Scroll travel of one detail pass, in svh. The reading column does not use this as min-height. */
export const PASS_SVH = 140;

/** Scroll travel of the crossfade joint between two details, in svh. */
export const JOINT_SVH = 28;

/** Local progress inside one pass. The spans sum to 1. */
export const UPRIGHT_END = 0.08;
export const ZOOM_END = 0.40;
export const PLATE_END = 0.52;
export const BOXES_END = 0.76;
export const LEADERS_END = 0.88;

/**
 * After the plate crossfade, boxes and notes rise together until here.
 * Scrub past this point is the 定焦 dwell: the camera and callouts stay parked.
 */
export const DWELL_START = 0.64;

/** Zero slope at both ends, strictly increasing in between. No flat spot on (0, 1). */
export function smootherstep(t: number): number {
	const u = Math.min(1, Math.max(0, t));
	return u * u * u * (u * (u * 6 - 15) + 10);
}

export type Box = { left: number; top: number; width: number; height: number };

export type CameraKeyId = 'upright' | 'zoom' | 'plate' | 'boxes' | 'notes';

export type CameraKeypoint = { id: CameraKeyId; at: number };

export type RunwayPlace = {
	index: number;
	local: number;
	joint: number;
	outgoing: number;
};

export type StageVisual = {
	cropT: number;
	uprightOpacity: number;
	plateOpacity: number;
	boxesOpacity: number;
	leadersOpacity: number;
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

/**
 * Upright image box for a top-down zoom into `crop`.
 * Scale is geometric; the crop center travels in a straight line to the frame center.
 * `t` clamps to [0, 1]. A linear edge lerp is a different curve and is not used here.
 */
export function cameraBox(
	viewW: number,
	viewH: number,
	naturalW: number,
	naturalH: number,
	crop: { x: number; y: number; w: number; h: number },
	t: number,
): Box {
	const u = Math.min(1, Math.max(0, t));
	const s0 = Math.min(viewW / naturalW, viewH / naturalH);
	const s1 = Math.min(viewW / crop.w, viewH / crop.h);
	const s = s0 === s1 || s0 <= 0 || s1 <= 0 ? s0 : s0 * (s1 / s0) ** u;
	const left0 = (viewW - naturalW * s0) / 2;
	const top0 = (viewH - naturalH * s0) / 2;
	const focusX = crop.x + crop.w / 2;
	const focusY = crop.y + crop.h / 2;
	const cx0 = left0 + focusX * s0;
	const cy0 = top0 + focusY * s0;
	const cx = cx0 + (viewW / 2 - cx0) * u;
	const cy = cy0 + (viewH / 2 - cy0) * u;
	return {
		left: cx - focusX * s,
		top: cy - focusY * s,
		width: naturalW * s,
		height: naturalH * s,
	};
}

export function stageVisual(p: number, notesOn: boolean): StageVisual {
	const u = Math.min(1, Math.max(0, p));
	if (u <= UPRIGHT_END) {
		return {
			cropT: 0,
			uprightOpacity: 1,
			plateOpacity: 0,
			boxesOpacity: 0,
			leadersOpacity: 0,
			notesOpacity: 0,
		};
	}
	if (u <= ZOOM_END) {
		// Phase A: fill ↔ crop. Silky, no plateau, plate still hidden.
		const t = (u - UPRIGHT_END) / (ZOOM_END - UPRIGHT_END);
		return {
			cropT: smootherstep(t),
			uprightOpacity: 1,
			plateOpacity: 0,
			boxesOpacity: 0,
			leadersOpacity: 0,
			notesOpacity: 0,
		};
	}
	if (u <= PLATE_END) {
		const t = (u - ZOOM_END) / (PLATE_END - ZOOM_END);
		return {
			cropT: 1,
			uprightOpacity: 1 - t,
			plateOpacity: t,
			boxesOpacity: 0,
			leadersOpacity: 0,
			notesOpacity: 0,
		};
	}
	if (u <= DWELL_START) {
		// Boxes, leaders, and note text arrive together, then the dwell parks them.
		const t = smootherstep((u - PLATE_END) / (DWELL_START - PLATE_END));
		return {
			cropT: 1,
			uprightOpacity: 0,
			plateOpacity: 1,
			boxesOpacity: t,
			leadersOpacity: notesOn ? t : 0,
			notesOpacity: notesOn ? t : 0,
		};
	}
	return {
		cropT: 1,
		uprightOpacity: 0,
		plateOpacity: 1,
		boxesOpacity: 1,
		leadersOpacity: notesOn ? 1 : 0,
		notesOpacity: notesOn ? 1 : 0,
	};
}

export function cameraKeypoints(notesOn: boolean): readonly CameraKeypoint[] {
	const keys: CameraKeypoint[] = [
		{ id: 'upright', at: 0 },
		{ id: 'zoom', at: ZOOM_END },
		{ id: 'plate', at: PLATE_END },
		{ id: 'boxes', at: DWELL_START },
	];
	if (notesOn) keys.push({ id: 'notes', at: 1 });
	return keys;
}

/** Midpoint of phase A. A release below it returns to the upright hold, above it finishes the zoom. */
export const ZOOM_MID = (UPRIGHT_END + ZOOM_END) / 2;

/** Strict `<` so an equal distance keeps the earlier keypoint. */
export function nearestKeypoint(local: number, notesOn: boolean): CameraKeypoint {
	const clamped = Math.min(1, Math.max(0, local));
	if (clamped <= UPRIGHT_END) return { id: 'upright', at: 0 };
	// Phase A detents at both of its clean ends. A frame pinned mid-zoom keeps the half-faded
	// outer upright behind the sharp crop window — the picture-in-picture the joint also showed.
	if (clamped < ZOOM_END) {
		if (clamped < ZOOM_MID) return { id: 'upright', at: 0 };
		return { id: 'zoom', at: ZOOM_END };
	}
	// Park end of plate crossfade first — settle must not hop ZOOM_END→DWELL_START
	// in one shot (desktop wheel never sets pointerDown; see #85).
	if (clamped < PLATE_END) return { id: 'plate', at: PLATE_END };
	// After plate, arrival pulls onto the dwell. Inside the dwell the frame is parked.
	if (clamped < DWELL_START) return { id: 'boxes', at: DWELL_START };
	if (!notesOn) return { id: 'boxes', at: clamped };
	return { id: 'notes', at: clamped };
}

/**
 * Which part a frame plays in the current place. `leaving` is the outgoing frame inside a
 * detail joint: it still paints its photograph, but not its plate or callouts.
 */
export type FrameRole = 'active' | 'leaving' | 'idle';

export function frameRole(frameIndex: number, place: RunwayPlace): FrameRole {
	if (frameIndex === place.index) return 'active';
	if (place.joint > 0 && frameIndex === place.outgoing) return 'leaving';
	return 'idle';
}

/** Plate, boxes, elbow leaders, and notes follow the active frame, not the frame opacity. */
export function framePaintsContent(frameIndex: number, place: RunwayPlace): boolean {
	return frameRole(frameIndex, place) === 'active';
}

export function runwayTravelSvh(detailCount: number): number {
	if (detailCount <= 0) return 0;
	return detailCount * PASS_SVH + (detailCount - 1) * JOINT_SVH;
}

export function placeOnRunway(p: number, detailCount: number): RunwayPlace {
	if (detailCount <= 0) return { index: 0, local: 1, joint: 0, outgoing: -1 };
	const total = runwayTravelSvh(detailCount);
	let cursor = Math.min(1, Math.max(0, p)) * total;
	for (let i = 0; i < detailCount; i++) {
		if (cursor <= PASS_SVH || i === detailCount - 1) {
			return {
				index: i,
				local: Math.min(1, Math.max(0, cursor / PASS_SVH)),
				joint: 0,
				outgoing: -1,
			};
		}
		cursor -= PASS_SVH;
		if (cursor <= JOINT_SVH) {
			return {
				index: i + 1,
				local: 0,
				joint: cursor / JOINT_SVH,
				outgoing: i,
			};
		}
		cursor -= JOINT_SVH;
	}
	return { index: detailCount - 1, local: 1, joint: 0, outgoing: -1 };
}

export function nearestSettlePlace(
	p: number,
	detailCount: number,
	notesOn: readonly boolean[],
): { index: number; local: number } {
	const place = placeOnRunway(p, detailCount);
	if (place.joint > 0 && place.outgoing >= 0) {
		if (place.joint <= 0.5) return { index: place.outgoing, local: 1 };
		return { index: place.index, local: 0 };
	}
	const key = nearestKeypoint(place.local, notesOn[place.index] ?? false);
	return { index: place.index, local: key.at };
}

export function runwayScrollY(
	runwayPageTop: number,
	travelPx: number,
	detailCount: number,
	index: number,
	local: number,
): number {
	const total = runwayTravelSvh(detailCount);
	if (total <= 0 || travelPx <= 0) return runwayPageTop;
	const units = index * (PASS_SVH + JOINT_SVH) + local * PASS_SVH;
	return runwayPageTop + (units * travelPx) / total;
}

/** `overflow <= 1` pins. A taller column moves by `p * overflow`. */
export function readTrackOffset(p: number, contentHeight: number, viewHeight: number): number {
	if (viewHeight <= 0) return 0;
	const overflow = contentHeight - viewHeight;
	if (overflow <= 1) return 0;
	return Math.min(1, Math.max(0, p)) * overflow;
}

/**
 * True once the runway top is within `slackPx` of the viewport top (or above it)
 * and the runway bottom still reaches the viewport bottom, within `slackPx`.
 */
export function shouldSettleRunway(
	runwayTop: number,
	runwayBottom: number,
	viewportHeight: number,
	slackPx: number,
): boolean {
	return runwayTop <= slackPx && runwayBottom >= viewportHeight - slackPx;
}
