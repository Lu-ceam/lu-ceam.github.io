export type Crop = { x: number; y: number; w: number; h: number };

export type Side = 'auto' | 'left' | 'right';

export type MarkLike = {
	side: Side;
	x: number;
	y: number;
	w: number;
	h: number;
	badge?: 'tl' | 'tr';
	label?: string;
	note?: string;
};

export type DetailLike = {
	marks: readonly MarkLike[];
	text: string;
	upright?: { width: number; height: number };
	transform?: { crop: Crop };
};

export type StackItem = {
	index: number;
	anchor: number;
	height: number;
};

export type LeaderArgs = {
	mark: { x: number; y: number; w: number; h: number };
	side: 'left' | 'right';
	plateRect: { left: number; top: number; width: number; height: number };
	plateWidth: number;
	plateHeight: number;
	noteRect: { left: number; right: number; top: number; height: number };
	shortPx: number;
};

const CIRCLED_PREFIX = /^[①-⑳]\s*/u;
const CIRCLED_LINE = /^[①-⑳]/u;

export function roundHalfAwayFromZero(value: number): number {
	if (value >= 0) return Math.round(value);
	return -Math.round(-value);
}

export function expectedPlateHeight(exportWidth: number, crop: { w: number; h: number }): number {
	return roundHalfAwayFromZero((exportWidth * crop.h) / crop.w);
}

export function plateHeightMatches(
	plateHeight: number,
	exportWidth: number,
	crop: { w: number; h: number },
): boolean {
	return Math.abs(plateHeight - expectedPlateHeight(exportWidth, crop)) <= 1;
}

/** At least a 2px inset on one edge. A full-frame upright is not a crop. */
export function cropIsProperSubRectangle(
	crop: Crop,
	upright: { width: number; height: number },
): boolean {
	return (
		crop.x >= 2 ||
		crop.y >= 2 ||
		crop.w <= upright.width - 2 ||
		crop.h <= upright.height - 2
	);
}

export function detailMode(detail: DetailLike): 'reveal' | 'callout' | 'legacy' {
	if (detail.marks.length === 0) return 'legacy';
	if (
		detail.upright &&
		detail.transform &&
		cropIsProperSubRectangle(detail.transform.crop, detail.upright)
	) {
		return 'reveal';
	}
	return 'callout';
}

export function notesAligned(detail: { marks: readonly MarkLike[] }): boolean {
	return detail.marks.length >= 1 && detail.marks.every((mark) => Boolean(mark.note));
}

export function stripCircledIndex(line: string): string {
	return line.replace(CIRCLED_PREFIX, '');
}

export function visibleDetailLines(detail: DetailLike): string[] {
	const lines = detail.text.split('\n');
	if (!notesAligned(detail)) return lines;
	const notes = new Set(
		detail.marks.map((mark) => mark.note).filter((note): note is string => Boolean(note)),
	);
	return lines.filter((line) => !notes.has(stripCircledIndex(line)));
}

export function visibleDetailText(detail: DetailLike): string {
	return visibleDetailLines(detail).join('\n');
}

export function showsCircledLine(text: string): boolean {
	return text.split('\n').some((line) => CIRCLED_LINE.test(line));
}

export function showDetailsNote(record: { details: readonly DetailLike[] }): boolean {
	return record.details.some((detail) => showsCircledLine(visibleDetailText(detail)));
}

export function showMarkLabel(mark: { label?: string; note?: string }): boolean {
	if (!mark.label || !mark.note) return false;
	if (mark.label === mark.note) return false;
	if (mark.note.startsWith(mark.label)) return false;
	return true;
}

/** First paint and no-JS. `auto` stays on the right until the script measures. */
export function paintSide(side: Side): 'left' | 'right' {
	return side === 'left' ? 'left' : 'right';
}

/** Tie within 1px goes right. An explicit side is never flipped. */
export function resolvedSide(
	mark: { side: Side; x: number; w: number },
	plateWidth: number,
): 'left' | 'right' {
	if (mark.side === 'left' || mark.side === 'right') return mark.side;
	const leftSpace = mark.x;
	const rightSpace = plateWidth - (mark.x + mark.w);
	if (Math.abs(leftSpace - rightSpace) <= 1) return 'right';
	return leftSpace > rightSpace ? 'left' : 'right';
}

export function badgeCenter(
	mark: { x: number; y: number; w: number; h: number; badge: 'tl' | 'tr' },
	plateWidth: number,
): { cx: number; cy: number; r: number; fontSize: number } {
	const diameter = (22 * plateWidth) / 400;
	const r = diameter / 2;
	const pad = 3;
	const fontSize = (11 * plateWidth) / 400;
	if (mark.w < diameter + pad || mark.h < diameter + pad) {
		return { cx: mark.x + mark.w / 2, cy: mark.y + mark.h / 2, r, fontSize };
	}
	const cy = mark.y + pad + r;
	const cx = mark.badge === 'tl' ? mark.x + pad + r : mark.x + mark.w - pad - r;
	return { cx, cy, r, fontSize };
}

/**
 * Ideal top centers the note on the anchor. Overlap pushes down until the gap
 * is `gapPx`. Nothing is placed above the plate top. Notes may hang below.
 * Returned tops follow the input order.
 */
export function stackTops(
	items: readonly StackItem[],
	plateHeightPx: number,
	plateCssHeight: number,
	gapPx: number,
): number[] {
	const scale = plateHeightPx === 0 ? 0 : plateCssHeight / plateHeightPx;
	const order = items
		.map((item, listIndex) => ({ item, listIndex }))
		.sort((a, b) => {
			if (a.item.anchor !== b.item.anchor) return a.item.anchor - b.item.anchor;
			return a.item.index - b.item.index;
		});
	const tops = new Array<number>(items.length);
	let prevBottom = Number.NEGATIVE_INFINITY;
	for (const entry of order) {
		const anchorCss = entry.item.anchor * scale;
		let top = anchorCss - entry.item.height / 2;
		if (top < 0) top = 0;
		if (top < prevBottom + gapPx) top = prevBottom + gapPx;
		tops[entry.listIndex] = top;
		prevBottom = top + entry.item.height;
	}
	return tops;
}

export type LeaderPoint = { x: number; y: number };

export function leaderEndpoints(args: LeaderArgs): LeaderPoint[] {
	if (
		args.plateWidth === 0 ||
		args.plateHeight === 0 ||
		args.plateRect.width === 0 ||
		args.plateRect.height === 0
	) {
		return [];
	}
	const scaleX = args.plateRect.width / args.plateWidth;
	const scaleY = args.plateRect.height / args.plateHeight;
	const y1 = args.mark.y + args.mark.h / 2;
	const x1 = args.side === 'left' ? args.mark.x : args.mark.x + args.mark.w;
	const noteCenterCss = args.noteRect.top + args.noteRect.height / 2;
	const y2 = (noteCenterCss - args.plateRect.top) / scaleY;
	const innerCss = args.side === 'right' ? args.noteRect.left : args.noteRect.right;
	const endCss = args.side === 'right' ? innerCss - args.shortPx : innerCss + args.shortPx;
	const x2 = (endCss - args.plateRect.left) / scaleX;
	const start = { x: x1, y: y1 };
	const end = { x: x2, y: y2 };
	const gap = Math.abs(x2 - x1);
	if (gap < 4) return [start, end];
	const cornerX = gap >= 32 ? x1 + Math.sign(x2 - x1) * 16 : x1 + (x2 - x1) / 2;
	return [start, { x: cornerX, y: y1 }, end];
}

export const NARROW_FLOOR_REM = 11;
export const NARROW_FLOOR_OF_STAGE = 0.58;
export const NARROW_GAP_REM = 0.55;
export const NARROW_PAIR_MIN_REM = 7.5;
export const NARROW_SLOT_CAP_REM = 9.5;

export function plateFloorPx(stageWidth: number, rem: number): number {
	return Math.min(NARROW_FLOOR_REM * rem, NARROW_FLOOR_OF_STAGE * stageWidth);
}

export function pairGuttersFit(stageWidth: number, rem: number): boolean {
	const floor = plateFloorPx(stageWidth, rem);
	return stageWidth >= floor + 2 * NARROW_PAIR_MIN_REM * rem + 2 * NARROW_GAP_REM * rem;
}

/** More notes wins. An equal count goes right. No notes returns null. */
export function singleGutterSide(leftCount: number, rightCount: number): 'left' | 'right' | null {
	if (leftCount + rightCount === 0) return null;
	if (leftCount > rightCount) return 'left';
	return 'right';
}

export function singleGutterPx(stageWidth: number, rem: number): number {
	const room = stageWidth - NARROW_GAP_REM * rem - plateFloorPx(stageWidth, rem);
	return Math.min(NARROW_SLOT_CAP_REM * rem, Math.max(0, room));
}

export function singlePlatePx(stageWidth: number, rem: number): number {
	const floor = plateFloorPx(stageWidth, rem);
	const gutter = singleGutterPx(stageWidth, rem);
	return Math.max(floor, stageWidth - NARROW_GAP_REM * rem - gutter);
}

/** The stack is too tall: the plate goes to the floor. It does not shrink by only the overflow. */
export function fitPlateToFloor(usedPlatePx: number, floorPx: number, overflows: boolean): number {
	if (!overflows) return usedPlatePx;
	return floorPx;
}

/**
 * Pixel length for the inline `--imagery-h`, or null when the stylesheet height is enough.
 * Cap is 70svh in pixels. Needed is measured by the page, not here.
 */
export function imageryHeightPx(neededPx: number, initialPx: number, capPx: number): number | null {
	const capped = Math.min(capPx, Math.max(0, neededPx));
	if (capped <= initialPx) return null;
	return capped;
}

export type SideLayout = {
	sides: Array<'left' | 'right'>;
	gutters: 'resolved' | 'single';
};

export function laidOutSides(
	notes: readonly { side: Side; x: number; w: number }[],
	plateWidth: number,
	stageWidth: number,
	rem: number,
	narrow: boolean,
): SideLayout {
	const resolved = notes.map((note) => resolvedSide(note, plateWidth));
	if (!narrow || pairGuttersFit(stageWidth, rem)) {
		return { sides: resolved, gutters: 'resolved' };
	}
	const left = resolved.filter((side) => side === 'left').length;
	const gutter = singleGutterSide(left, resolved.length - left);
	if (gutter === null) return { sides: resolved, gutters: 'resolved' };
	return { sides: resolved.map(() => gutter), gutters: 'single' };
}

export const OPEN_INSET = 0.72;
export const ZOOM_GAIN = 1.25;
export const PLATE_CAP = 0.92;

export type FrameBox = { left: number; top: number; width: number; height: number };
export type PxSize = { width: number; height: number };

const ZERO_BOX: FrameBox = { left: 0, top: 0, width: 0, height: 0 };

export function openingBox(pane: PxSize, natural: PxSize): FrameBox {
	if (pane.width <= 0 || pane.height <= 0 || natural.width <= 0 || natural.height <= 0) {
		return { ...ZERO_BOX };
	}
	const scale = Math.min(pane.width / natural.width, pane.height / natural.height);
	const width = natural.width * scale;
	const height = natural.height * scale;
	return {
		left: (pane.width - width) / 2,
		top: (pane.height - height) / 2,
		width,
		height,
	};
}

export function plateBox(
	pane: PxSize,
	opening: FrameBox,
	plate: PxSize,
	natural: PxSize,
	crop: Crop,
): FrameBox {
	if (
		pane.width <= 0 ||
		pane.height <= 0 ||
		opening.width <= 0 ||
		opening.height <= 0 ||
		plate.width <= 0 ||
		plate.height <= 0
	) {
		return { ...ZERO_BOX };
	}
	const insetW = opening.width * OPEN_INSET;
	const insetH = opening.height * OPEN_INSET;
	const aspect = plate.width / plate.height;
	let fitW = insetW;
	let fitH = insetW / aspect;
	if (fitH > insetH) {
		fitH = insetH;
		fitW = insetH * aspect;
	}
	let width = fitW;
	let height = fitH;
	const s0 = natural.width > 0 ? opening.width / natural.width : 0;
	const cropOk = crop.w > 0 && crop.h > 0;
	const s1 = cropOk ? Math.min(fitW / crop.w, fitH / crop.h) : Number.POSITIVE_INFINITY;
	const target = ZOOM_GAIN * s0;
	if (s0 > 0 && cropOk && s1 < target) {
		const cap = Math.min((PLATE_CAP * opening.width) / fitW, (PLATE_CAP * opening.height) / fitH);
		const gain = Math.min(target / s1, cap);
		width = fitW * gain;
		height = fitH * gain;
	}
	return {
		left: (pane.width - width) / 2,
		top: (pane.height - height) / 2,
		width,
		height,
	};
}

export function zoomImageBox(args: {
	opening: FrameBox;
	plate: FrameBox;
	natural: PxSize;
	crop: Crop;
	cropT: number;
}): FrameBox {
	const u = Math.min(1, Math.max(0, args.cropT));
	const s0 = args.natural.width > 0 ? args.opening.width / args.natural.width : 0;
	const s1 =
		args.crop.w > 0 && args.crop.h > 0
			? Math.min(args.plate.width / args.crop.w, args.plate.height / args.crop.h)
			: s0;
	const s = s0 === s1 || s0 <= 0 || s1 <= 0 ? s0 : s0 * (s1 / s0) ** u;
	const focusX = args.crop.x + args.crop.w / 2;
	const focusY = args.crop.y + args.crop.h / 2;
	const cx0 = args.opening.left + focusX * s0;
	const cy0 = args.opening.top + focusY * s0;
	const cx1 = args.plate.left + args.plate.width / 2;
	const cy1 = args.plate.top + args.plate.height / 2;
	const cx = cx0 + (cx1 - cx0) * u;
	const cy = cy0 + (cy1 - cy0) * u;
	return {
		left: cx - focusX * s,
		top: cy - focusY * s,
		width: args.natural.width * s,
		height: args.natural.height * s,
	};
}

export const MIN_NOTE_REM = 6.5;
export const MIN_BAND_REM = 2.6;
export const NOTE_CAP_REM = 9.5;
export const NOTE_GAP_REM = 0.35;
export const SCRIM_INSET_REM = 0.55;

const NUDGE_STEP_PX = 4;

export type NoteDraft = {
	index: number;
	side: 'left' | 'right';
	anchor: number;
	height: number;
	mark: { x: number; y: number; w: number; h: number; badge?: 'tl' | 'tr' };
};

export type NoteKind = 'side' | 'letterbox' | 'scrim' | 'overflow';

export type NotePlacement = {
	index: number;
	kind: NoteKind;
	side: 'left' | 'right';
	left: number;
	top: number;
	width: number;
	height: number;
	omitLeader: boolean;
};

export type ExpandedPanelPlacement = {
	kind: 'letterbox' | 'scrim';
	side: 'left' | 'right';
	left: number;
	top: number;
	width: number;
	height: number;
	omitLeader: boolean;
};

type CssRect = { left: number; top: number; right: number; bottom: number };

function anchorCss(note: NoteDraft, plate: FrameBox, plateSize: PxSize): number {
	const scale = plateSize.height === 0 ? 0 : plate.height / plateSize.height;
	return plate.top + note.anchor * scale;
}

function rectsOverlap(a: CssRect, b: CssRect): boolean {
	return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

function placeNarrowNotes(args: {
	pane: PxSize;
	plate: FrameBox;
	plateSize: PxSize;
	rem: number;
	notes: readonly NoteDraft[];
}): NotePlacement[] {
	const { pane, plate, plateSize, rem, notes } = args;
	const gap = NOTE_GAP_REM * rem;
	const byAnchor = (a: NoteDraft, b: NoteDraft) => a.anchor - b.anchor || a.index - b.index;
	const placed = new Map<number, NotePlacement>();
	const plateRect: CssRect = {
		left: plate.left,
		top: plate.top,
		right: plate.left + plate.width,
		bottom: plate.top + plate.height,
	};
	const overlapsPlaced = (rect: CssRect) => {
		if (rectsOverlap(rect, plateRect)) return true;
		for (const note of placed.values()) {
			const box = {
				left: note.left,
				top: note.top,
				right: note.left + note.width,
				bottom: note.top + note.height,
			};
			if (rectsOverlap(rect, box)) return true;
		}
		return false;
	};
	const scaleX = plateSize.width === 0 ? 0 : plate.width / plateSize.width;
	const scaleY = plateSize.height === 0 ? 0 : plate.height / plateSize.height;

	for (const side of ['left', 'right'] as const) {
		const group = notes.filter((note) => note.side === side).sort(byAnchor);
		if (group.length === 0) continue;
		const strip = (pane.width - plate.width) / 2;
		const band = (pane.height - plate.height) / 2;
		const queue: NoteDraft[] = [];
		if (strip + 1e-6 >= MIN_NOTE_REM * rem) {
			const width = Math.min(NOTE_CAP_REM * rem, Math.max(0, strip));
			const left = side === 'left' ? plate.left - width : plate.left + plate.width;
			let prevBottom = Number.NEGATIVE_INFINITY;
			for (const note of group) {
				let top = anchorCss(note, plate, plateSize) - note.height / 2;
				if (top < 0) top = 0;
				if (top < prevBottom + gap) top = prevBottom + gap;
				if (top + note.height > pane.height + 1e-6) {
					queue.push(note);
					continue;
				}
				placed.set(note.index, {
					index: note.index,
					kind: 'side',
					side,
					left,
					top,
					width,
					height: note.height,
					omitLeader: false,
				});
				prevBottom = top + note.height;
			}
		} else {
			queue.push(...group);
		}
		const width = Math.min(NOTE_CAP_REM * rem, pane.width / 2);
		const left = side === 'left' ? 0 : pane.width - width;
		let nextBottom = plate.top;
		let nextTop = plate.top + plate.height;
		for (const note of queue) {
			const topCandidate = nextBottom - note.height;
			const topRect = { left, top: topCandidate, right: left + width, bottom: nextBottom };
			const topFits =
				topCandidate >= plate.top - band - 1e-6 &&
				topCandidate >= -1e-6 &&
				!overlapsPlaced(topRect);
			if (topFits) {
				placed.set(note.index, {
					index: note.index,
					kind: 'letterbox',
					side,
					left,
					top: topCandidate,
					width,
					height: note.height,
					omitLeader: false,
				});
				nextBottom = topCandidate - gap;
				continue;
			}
			const bottomEdge = nextTop + note.height;
			const bottomRect = { left, top: nextTop, right: left + width, bottom: bottomEdge };
			if (bottomEdge <= pane.height + 1e-6 && !overlapsPlaced(bottomRect)) {
				placed.set(note.index, {
					index: note.index,
					kind: 'letterbox',
					side,
					left,
					top: nextTop,
					width,
					height: note.height,
					omitLeader: false,
				});
				nextTop = bottomEdge + gap;
				continue;
			}
			placed.set(note.index, {
				index: note.index,
				kind: 'overflow',
				side,
				left: plate.left + note.mark.x * scaleX,
				top: plate.top + note.mark.y * scaleY,
				width: note.mark.w * scaleX,
				height: note.mark.h * scaleY,
				omitLeader: true,
			});
		}
	}

	return notes.map((note) => {
		const found = placed.get(note.index);
		if (found) return found;
		return {
			index: note.index,
			kind: 'overflow',
			side: note.side,
			left: 0,
			top: 0,
			width: 0,
			height: 0,
			omitLeader: true,
		};
	});
}

function placeNotes(args: {
	pane: PxSize;
	plate: FrameBox;
	plateSize: PxSize;
	rem: number;
	notes: readonly NoteDraft[];
	narrow?: boolean;
}): NotePlacement[] {
	if (args.narrow === true) return placeNarrowNotes(args);
	const { pane, plate, plateSize, rem, notes } = args;
	const gap = NOTE_GAP_REM * rem;
	const byAnchor = (a: NoteDraft, b: NoteDraft) => a.anchor - b.anchor || a.index - b.index;
	const placed = new Map<number, NotePlacement>();
	const pending: NoteDraft[] = [];

	for (const side of ['left', 'right'] as const) {
		const group = notes.filter((note) => note.side === side).sort(byAnchor);
		if (group.length === 0) continue;
		const strip = (pane.width - plate.width) / 2;
		const band = (pane.height - plate.height) / 2;
		if (strip + 1e-6 >= MIN_NOTE_REM * rem) {
			const width = Math.min(NOTE_CAP_REM * rem, Math.max(0, strip));
			const left = side === 'left' ? plate.left - width : plate.left + plate.width;
			let prevBottom = Number.NEGATIVE_INFINITY;
			for (const note of group) {
				let top = anchorCss(note, plate, plateSize) - note.height / 2;
				if (top < 0) top = 0;
				if (top < prevBottom + gap) top = prevBottom + gap;
				if (top + note.height > pane.height + 1e-6) {
					pending.push(note);
					continue;
				}
				placed.set(note.index, {
					index: note.index,
					kind: 'side',
					side,
					left,
					top,
					width,
					height: note.height,
					omitLeader: false,
				});
				prevBottom = top + note.height;
			}
			continue;
		}
		if (band + 1e-6 >= MIN_BAND_REM * rem) {
			const width = Math.min(NOTE_CAP_REM * rem, pane.width / 2);
			const left = side === 'left' ? 0 : pane.width - width;
			let topCursor = 0;
			let bottomCursor = plate.top + plate.height;
			for (const note of group) {
				if (topCursor + note.height <= band + 1e-6) {
					placed.set(note.index, {
						index: note.index,
						kind: 'letterbox',
						side,
						left,
						top: topCursor,
						width,
						height: note.height,
						omitLeader: false,
					});
					topCursor += note.height + gap;
					continue;
				}
				if (bottomCursor + note.height <= pane.height + 1e-6) {
					placed.set(note.index, {
						index: note.index,
						kind: 'letterbox',
						side,
						left,
						top: bottomCursor,
						width,
						height: note.height,
						omitLeader: false,
					});
					bottomCursor += note.height + gap;
					continue;
				}
				pending.push(note);
			}
			continue;
		}
		pending.push(...group);
	}

	const scaleX = plateSize.width === 0 ? 0 : plate.width / plateSize.width;
	const scaleY = plateSize.height === 0 ? 0 : plate.height / plateSize.height;
	const obstacles = notes.map((note) => {
		const box: CssRect = {
			left: plate.left + note.mark.x * scaleX,
			top: plate.top + note.mark.y * scaleY,
			right: plate.left + (note.mark.x + note.mark.w) * scaleX,
			bottom: plate.top + (note.mark.y + note.mark.h) * scaleY,
		};
		return { box };
	});
	const area = { left: 0, right: 0 };
	for (const note of notes) area[note.side] += note.mark.w * note.mark.h;
	const inset = SCRIM_INSET_REM * rem;
	const scrimWidth = Math.min(NOTE_CAP_REM * rem, Math.max(0, plate.width / 2 - inset));
	const scrimLeft = (side: 'left' | 'right') =>
		side === 'left' ? plate.left + inset : plate.left + plate.width - inset - scrimWidth;

	const scrimObstacles: { left: CssRect[]; right: CssRect[] } = { left: [], right: [] };
	const prevBottom = { left: Number.NEGATIVE_INFINITY, right: Number.NEGATIVE_INFINITY };

	function clearTop(left: number, height: number, start: number, side: 'left' | 'right'): number | null {
		const minTop = plate.top;
		const maxTop = plate.top + plate.height - height;
		if (maxTop < minTop - 1e-6 || scrimWidth <= 0) return null;
		let origin = start;
		if (origin < minTop) origin = minTop;
		if (origin > maxTop) origin = maxTop;
		const limit = Math.ceil(Math.max(0, maxTop - minTop) / NUDGE_STEP_PX) + 1;
		for (let step = 0; step <= limit; step += 1) {
			const candidates =
				step === 0 ? [origin] : [origin + step * NUDGE_STEP_PX, origin - step * NUDGE_STEP_PX];
			for (const top of candidates) {
				if (top < minTop - 1e-6 || top > maxTop + 1e-6) continue;
				const rect = { left, top, right: left + scrimWidth, bottom: top + height };
				const hit =
					obstacles.some((obstacle) => rectsOverlap(rect, obstacle.box)) ||
					scrimObstacles[side].some((box) => rectsOverlap(rect, box));
				if (!hit) return top;
			}
		}
		return null;
	}

	for (const side of ['left', 'right'] as const) {
		const group = pending.filter((note) => note.side === side).sort(byAnchor);
		for (const note of group) {
			const anchorTop = anchorCss(note, plate, plateSize) - note.height / 2;
			let start = anchorTop;
			if (start < prevBottom[side] + gap) start = prevBottom[side] + gap;
			const found = clearTop(scrimLeft(side), note.height, start, side);
			if (found !== null) {
				const left = scrimLeft(side);
				scrimObstacles[side].push({
					left,
					top: found,
					right: left + scrimWidth,
					bottom: found + note.height,
				});
				prevBottom[side] = Math.max(prevBottom[side], found + note.height);
				placed.set(note.index, {
					index: note.index,
					kind: 'scrim',
					side,
					left,
					top: found,
					width: scrimWidth,
					height: note.height,
					omitLeader: false,
				});
				continue;
			}
			const other = side === 'left' ? 'right' : 'left';
			const home = area[side] <= area[other] ? side : other;
			const minTop = plate.top;
			const maxTop = Math.max(minTop, plate.top + plate.height - note.height);
			let top = anchorTop;
			if (top < minTop) top = minTop;
			if (top > maxTop) top = maxTop;
			const left = scrimLeft(home);
			scrimObstacles[home].push({
				left,
				top,
				right: left + scrimWidth,
				bottom: top + note.height,
			});
			prevBottom[home] = Math.max(prevBottom[home], top + note.height);
			placed.set(note.index, {
				index: note.index,
				kind: 'scrim',
				side: home,
				left,
				top,
				width: scrimWidth,
				height: note.height,
				omitLeader: true,
			});
		}
	}

	return notes.map((note) => {
		const found = placed.get(note.index);
		if (found) return found;
		return {
			index: note.index,
			kind: 'scrim',
			side: note.side,
			left: 0,
			top: 0,
			width: 0,
			height: note.height,
			omitLeader: true,
		};
	});
}

export function placeExpandedPanel(args: {
	pane: PxSize;
	plate: FrameBox;
	plateSize: PxSize;
	rem: number;
	note: NoteDraft;
	notes: readonly NoteDraft[];
	letterboxHeight: number;
	scrimHeight: number;
	occupied: readonly {
		side: 'left' | 'right';
		left: number;
		top: number;
		width: number;
		height: number;
	}[];
}): ExpandedPanelPlacement {
	const { pane, plate, plateSize, rem, note, notes, letterboxHeight, scrimHeight, occupied } = args;
	const gap = NOTE_GAP_REM * rem;
	const band = (pane.height - plate.height) / 2;
	const plateBottom = plate.top + plate.height;
	const width = Math.min(NOTE_CAP_REM * rem, pane.width / 2);
	const left = note.side === 'left' ? 0 : pane.width - width;
	const plateRect: CssRect = {
		left: plate.left,
		top: plate.top,
		right: plate.left + plate.width,
		bottom: plateBottom,
	};
	const overlaps = (rect: CssRect) => {
		if (rectsOverlap(rect, plateRect)) return true;
		return occupied.some((box) =>
			rectsOverlap(rect, {
				left: box.left,
				top: box.top,
				right: box.left + box.width,
				bottom: box.top + box.height,
			}),
		);
	};

	let nextBottom = plate.top;
	let nextTop = plateBottom;
	for (const box of occupied) {
		if (box.side !== note.side) continue;
		const bottom = box.top + box.height;
		if (bottom <= plate.top + 1e-6) nextBottom = Math.min(nextBottom, box.top - gap);
		if (box.top >= plateBottom - 1e-6) nextTop = Math.max(nextTop, bottom + gap);
	}
	const topCandidate = nextBottom - letterboxHeight;
	const topRect = { left, top: topCandidate, right: left + width, bottom: nextBottom };
	if (
		topCandidate >= plate.top - band - 1e-6 &&
		topCandidate >= -1e-6 &&
		!overlaps(topRect)
	) {
		return {
			kind: 'letterbox',
			side: note.side,
			left,
			top: topCandidate,
			width,
			height: letterboxHeight,
			omitLeader: false,
		};
	}
	const bottomEdge = nextTop + letterboxHeight;
	const bottomRect = { left, top: nextTop, right: left + width, bottom: bottomEdge };
	if (bottomEdge <= pane.height + 1e-6 && !overlaps(bottomRect)) {
		return {
			kind: 'letterbox',
			side: note.side,
			left,
			top: nextTop,
			width,
			height: letterboxHeight,
			omitLeader: false,
		};
	}

	const scaleX = plateSize.width === 0 ? 0 : plate.width / plateSize.width;
	const scaleY = plateSize.height === 0 ? 0 : plate.height / plateSize.height;
	const obstacles = notes.map((item) => ({
		left: plate.left + item.mark.x * scaleX,
		top: plate.top + item.mark.y * scaleY,
		right: plate.left + (item.mark.x + item.mark.w) * scaleX,
		bottom: plate.top + (item.mark.y + item.mark.h) * scaleY,
	}));
	const inset = SCRIM_INSET_REM * rem;
	const scrimWidth = Math.min(NOTE_CAP_REM * rem, Math.max(0, plate.width / 2 - inset));
	const scrimLeft = (side: 'left' | 'right') =>
		side === 'left' ? plate.left + inset : plate.left + plate.width - inset - scrimWidth;
	const area = { left: 0, right: 0 };
	for (const item of notes) area[item.side] += item.mark.w * item.mark.h;

	const minTop = plate.top;
	const maxTop = plate.top + plate.height - scrimHeight;
	let found: number | null = null;
	if (maxTop >= minTop - 1e-6 && scrimWidth > 0) {
		let origin = anchorCss(note, plate, plateSize) - scrimHeight / 2;
		if (origin < minTop) origin = minTop;
		if (origin > maxTop) origin = maxTop;
		const limit = Math.ceil(Math.max(0, maxTop - minTop) / NUDGE_STEP_PX) + 1;
		for (let step = 0; step <= limit && found === null; step += 1) {
			const candidates =
				step === 0 ? [origin] : [origin + step * NUDGE_STEP_PX, origin - step * NUDGE_STEP_PX];
			for (const top of candidates) {
				if (top < minTop - 1e-6 || top > maxTop + 1e-6) continue;
				const rect = {
					left: scrimLeft(note.side),
					top,
					right: scrimLeft(note.side) + scrimWidth,
					bottom: top + scrimHeight,
				};
				if (!obstacles.some((box) => rectsOverlap(rect, box))) {
					found = top;
					break;
				}
			}
		}
	}
	if (found !== null) {
		return {
			kind: 'scrim',
			side: note.side,
			left: scrimLeft(note.side),
			top: found,
			width: scrimWidth,
			height: scrimHeight,
			omitLeader: false,
		};
	}
	const other = note.side === 'left' ? 'right' : 'left';
	const home = area[note.side] <= area[other] ? note.side : other;
	const fallbackMax = Math.max(minTop, plate.top + plate.height - scrimHeight);
	let top = anchorCss(note, plate, plateSize) - scrimHeight / 2;
	if (top < minTop) top = minTop;
	if (top > fallbackMax) top = fallbackMax;
	return {
		kind: 'scrim',
		side: home,
		left: scrimLeft(home),
		top,
		width: scrimWidth,
		height: scrimHeight,
		omitLeader: true,
	};
}

export { placeNotes };

function orient(a: LeaderPoint, b: LeaderPoint, c: LeaderPoint): number {
	return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function onSegment(a: LeaderPoint, b: LeaderPoint, p: LeaderPoint): boolean {
	return (
		Math.min(a.x, b.x) - 1e-9 <= p.x &&
		p.x <= Math.max(a.x, b.x) + 1e-9 &&
		Math.min(a.y, b.y) - 1e-9 <= p.y &&
		p.y <= Math.max(a.y, b.y) + 1e-9
	);
}

function segmentsMeet(a: LeaderPoint, b: LeaderPoint, c: LeaderPoint, d: LeaderPoint): boolean {
	const o1 = orient(a, b, c);
	const o2 = orient(a, b, d);
	const o3 = orient(c, d, a);
	const o4 = orient(c, d, b);
	const cross = (p: number, q: number) => (p > 0 && q < 0) || (p < 0 && q > 0);
	if (cross(o1, o2) && cross(o3, o4)) return true;
	if (Math.abs(o1) <= 1e-9 && onSegment(a, b, c)) return true;
	if (Math.abs(o2) <= 1e-9 && onSegment(a, b, d)) return true;
	if (Math.abs(o3) <= 1e-9 && onSegment(c, d, a)) return true;
	if (Math.abs(o4) <= 1e-9 && onSegment(c, d, b)) return true;
	return false;
}

export function leaderHitsNote(
	points: readonly LeaderPoint[],
	note: { left: number; right: number; top: number; bottom: number },
): boolean {
	if (points.length === 0) return false;
	const inside = (point: LeaderPoint) =>
		point.x >= note.left && point.x <= note.right && point.y >= note.top && point.y <= note.bottom;
	const corners = [
		{ x: note.left, y: note.top },
		{ x: note.right, y: note.top },
		{ x: note.right, y: note.bottom },
		{ x: note.left, y: note.bottom },
	];
	for (let index = 0; index < points.length - 1; index += 1) {
		const start = points[index];
		const end = points[index + 1];
		if (!start || !end) continue;
		if (inside(start) || inside(end)) return true;
		for (let edge = 0; edge < corners.length; edge += 1) {
			const a = corners[edge];
			const b = corners[(edge + 1) % corners.length];
			if (a && b && segmentsMeet(start, end, a, b)) return true;
		}
	}
	const last = points[points.length - 1];
	return last ? inside(last) : false;
}
