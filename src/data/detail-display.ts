import { MIN_LETTERBOX_STUB, selectSplitLeaders, type SplitLeaderInput } from './split-leaders.ts';

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
	bandReservePx = 0,
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
	if (bandReservePx > 0 && width > 0 && height > 0) {
		const maxW = pane.width - 2 * bandReservePx;
		const maxH = pane.height - 2 * bandReservePx;
		if (maxW > 8 && maxH > 8 && (width > maxW || height > maxH)) {
			const shrink = Math.min(maxW / width, maxH / height);
			width *= shrink;
			height *= shrink;
		}
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

export type FillCropPaint = {
	outerOpacity: number;
	windowOpacity: number;
	plateOpacity: 0 | 1;
};

export function cropWindow(args: {
	image: FrameBox;
	naturalWidth: number;
	crop: Crop;
}): FrameBox {
	const { image, naturalWidth, crop } = args;
	if (naturalWidth <= 0 || crop.w <= 0 || crop.h <= 0 || image.width <= 0 || image.height <= 0) {
		return { left: 0, top: 0, width: 0, height: 0 };
	}
	const s = image.width / naturalWidth;
	return {
		left: image.left + crop.x * s,
		top: image.top + crop.y * s,
		width: crop.w * s,
		height: crop.h * s,
	};
}

export function fillCropPaint(args: {
	cropT: number;
	local: number;
	plateEnd: number;
}): FillCropPaint {
	const cropT = Math.min(1, Math.max(0, args.cropT));
	const plateOpacity: 0 | 1 = args.local >= args.plateEnd ? 1 : 0;
	return {
		outerOpacity: 1 - cropT,
		windowOpacity: 1,
		plateOpacity,
	};
}

/** Map a layer sized at `base` onto `next`. Origin is the layer's top-left. */
export function layerTransform(base: FrameBox, next: FrameBox): string {
	if (!(base.width > 0) || !(base.height > 0)) return 'none';
	const sx = next.width / base.width;
	const sy = next.height / base.height;
	const tx = next.left - base.left;
	const ty = next.top - base.top;
	if (
		Math.abs(sx - 1) < 1e-4 &&
		Math.abs(sy - 1) < 1e-4 &&
		Math.abs(tx) < 0.05 &&
		Math.abs(ty) < 0.05
	) {
		return 'none';
	}
	const n = (value: number) => {
		const rounded = Math.round(value * 1000) / 1000;
		return Object.is(rounded, -0) ? 0 : rounded;
	};
	return `translate(${n(tx)}px, ${n(ty)}px) scale(${n(sx)}, ${n(sy)})`;
}

/** Boxes, leaders, or notes are in the frame. Zoom scrub is the opposite. */
export function calloutsActive(visual: {
	boxesOpacity: number;
	leadersOpacity: number;
	notesOpacity: number;
}): boolean {
	return visual.boxesOpacity > 0 || visual.leadersOpacity > 0 || visual.notesOpacity > 0;
}

export const MIN_NOTE_REM = 6.5;
export const MIN_BAND_REM = 2.6;
export const NOTE_CAP_REM = 9.5;
export const NOTE_GAP_REM = 0.35;
export const SCRIM_INSET_REM = 0.55;
/** Narrow crop keeps at least this much paper on every side for letterbox notes. */
export const LETTERBOX_BAND_RESERVE_REM = 3.4;
/** Paper between S and the first letterbox row, so note ink is not on the crop seam. */
export const LETTERBOX_BREATH_REM = 1.05;
const letterboxPackCache = new Map<string, NotePlacement[]>();

const NUDGE_STEP_PX = 4;

export type NoteGlyph = { dx: number; dy: number; width: number; height: number };

export type NoteDraft = {
	index: number;
	side: 'left' | 'right';
	anchor: number;
	height: number;
	mark: { x: number; y: number; w: number; h: number; badge?: 'tl' | 'tr' };
	/** Ink box inside the note column. Leaders aim here; layout still uses `height`. */
	glyph?: NoteGlyph;
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

export function placementLeaderRect(
	place: { left: number; top: number; width: number; height: number },
	plate: FrameBox,
	plateSize: PxSize,
	glyph?: NoteGlyph,
): { left: number; right: number; top: number; bottom: number } {
	const scaleX = plateSize.width === 0 ? 0 : plate.width / plateSize.width;
	const scaleY = plateSize.height === 0 ? 0 : plate.height / plateSize.height;
	const safeX = scaleX === 0 ? 1 : scaleX;
	const safeY = scaleY === 0 ? 1 : scaleY;
	const dx = glyph?.dx ?? 0;
	const dy = glyph?.dy ?? 0;
	const width = glyph && glyph.width >= 1 ? glyph.width : place.width;
	const height = glyph && glyph.height >= 1 ? glyph.height : place.height;
	const left = place.left + dx;
	const top = place.top + dy;
	return {
		left: (left - plate.left) / safeX,
		right: (left + width - plate.left) / safeX,
		top: (top - plate.top) / safeY,
		bottom: (top + height - plate.top) / safeY,
	};
}

function polyLength(points: readonly { x: number; y: number }[]): number {
	let length = 0;
	for (let index = 1; index < points.length; index += 1) {
		const prev = points[index - 1];
		const next = points[index];
		if (!prev || !next) continue;
		length += Math.abs(next.x - prev.x) + Math.abs(next.y - prev.y);
	}
	return length;
}

function leaderInputs(
	notes: readonly NoteDraft[],
	placed: ReadonlyMap<number, NotePlacement>,
	plate: FrameBox,
	plateSize: PxSize,
): SplitLeaderInput[] {
	return notes.map((note) => {
		const place = placed.get(note.index);
		if (!place || place.omitLeader || place.kind === 'overflow') {
			return {
				index: note.index,
				mark: note.mark,
				side: note.side,
				kind: 'side',
				note: { left: -1e6, right: -1e6 + 1, top: -1e6, bottom: -1e6 + 1 },
				omitLeader: true,
			};
		}
		return {
			index: note.index,
			mark: note.mark,
			side: place.side,
			kind: place.kind === 'letterbox' ? 'letterbox' : 'side',
			note: placementLeaderRect(place, plate, plateSize, note.glyph),
			omitLeader: false,
		};
	});
}

function packLetterboxNotes(args: {
	pane: PxSize;
	plate: FrameBox;
	plateSize: PxSize;
	rem: number;
	notes: readonly NoteDraft[];
	queue: readonly NoteDraft[];
	placed: Map<number, NotePlacement>;
	plateRect: CssRect;
}): void {
	const { pane, plate, plateSize, rem, notes, queue, placed, plateRect } = args;
	const packKey = [
		pane.width.toFixed(1),
		pane.height.toFixed(1),
		plate.left.toFixed(1),
		plate.top.toFixed(1),
		plate.width.toFixed(1),
		plate.height.toFixed(1),
		plateSize.width,
		plateSize.height,
		...notes.map(
			(note) =>
				`${note.index}:${placed.has(note.index) ? 's' : 'q'}:${note.side}:${note.height.toFixed(1)}:${note.mark.x},${note.mark.y},${note.mark.w},${note.mark.h}:${note.glyph?.width.toFixed(1) ?? ''}`,
		),
	].join(';');
	const cached = letterboxPackCache.get(packKey);
	if (cached) {
		for (const place of cached) placed.set(place.index, { ...place });
		return;
	}
	const gap = NOTE_GAP_REM * rem;
	const breath = LETTERBOX_BREATH_REM * rem;
	const band = (pane.height - plate.height) / 2;
	const width = Math.min(NOTE_CAP_REM * rem, pane.width / 2);
	const scaleX = plateSize.width === 0 ? 0 : plate.width / plateSize.width;
	const scaleY = plateSize.height === 0 ? 0 : plate.height / plateSize.height;
	const boxOf = (note: NotePlacement): CssRect => ({
		left: note.left,
		top: note.top,
		right: note.left + note.width,
		bottom: note.top + note.height,
	});
	const overlaps = (rect: CssRect) => {
		if (rectsOverlap(rect, plateRect)) return true;
		for (const note of placed.values()) {
			if (rectsOverlap(rect, boxOf(note))) return true;
		}
		return false;
	};
	const rowsFor = (height: number, bandSide: 'top' | 'bottom'): number[] => {
		const rows: number[] = [];
		const push = (top: number) => {
			if (!rows.some((row) => Math.abs(row - top) <= 1e-6)) rows.push(top);
		};
		if (bandSide === 'top') {
			let bottom = plate.top - breath;
			for (let guard = 0; guard < 3; guard += 1) {
				const top = bottom - height;
				if (top < Math.max(0, plate.top - band) - 1e-6) break;
				push(top);
				bottom = top - gap;
			}
			// Flush to the pane edge when the breath-stepped ladder cannot fit another
			// short row (falp381 insert ④ on a ~431px phone pane).
			const flush = 0;
			if (
				flush + height <= plate.top - breath + 1e-6 &&
				flush + height <= pane.height + 1e-6
			) {
				push(flush);
			}
			return rows;
		}
		let top = plate.top + plate.height + breath;
		for (let guard = 0; guard < 3; guard += 1) {
			if (top + height > pane.height + 1e-6) break;
			push(top);
			top += height + gap;
		}
		const flush = pane.height - height;
		if (flush >= plate.top + plate.height + breath - 1e-6 && flush + height <= pane.height + 1e-6) {
			push(flush);
		}
		return rows;
	};
	// Keep a full letterbox park (MIN_LETTERBOX_STUB) inside the pane. Notes flush at
	// left=0 made parkX = note.left - stub fall past pane left; split-imagery clips it
	// so ②③ read as "dashes on the mark row" / "3px tick" with no elbow (falp381 insert).
	const parkRoom =
		scaleX > 0 ? MIN_LETTERBOX_STUB * scaleX + 2 : MIN_LETTERBOX_STUB + 2;
	const clampLeft = (left: number) => {
		if (width + 2 * parkRoom > pane.width + 1e-6) {
			return Math.min(Math.max(0, left), Math.max(0, pane.width - width));
		}
		const minL = parkRoom;
		const maxL = pane.width - width - parkRoom;
		return Math.min(Math.max(minL, left), maxL);
	};
	const safeScaleX = scaleX === 0 ? 1 : scaleX;
	const visibleX = {
		left: (0 - plate.left) / safeScaleX,
		right: (pane.width - plate.left) / safeScaleX,
	};
	const leadersOf = (map: ReadonlyMap<number, NotePlacement>) =>
		selectSplitLeaders(leaderInputs(notes, map, plate, plateSize), { visibleX });
	const glyphWidthOf = (note: NoteDraft) =>
		note.glyph && note.glyph.width >= 1 ? note.glyph.width : width;
	const corridorLefts = (note: NoteDraft): number[] => {
		const ink = glyphWidthOf(note);
		const scale = scaleX === 0 ? 1 : scaleX;
		const mark = note.mark;
		const out: number[] = [];
		const push = (plateX: number, edge: 'left' | 'right') => {
			const css = plate.left + plateX * scale - (edge === 'right' ? ink : 0);
			if (css < -1 || css > pane.width - width + 1) return;
			out.push(css);
		};
		push(mark.x - 0.6, 'right');
		push(mark.x + mark.w + 0.6, 'left');
		for (const t of [0.12, 0.28, 0.45, 0.62, 0.8, 0.92]) {
			push(mark.x + mark.w * t, 'right');
			push(mark.x + mark.w * t, 'left');
		}
		return out;
	};
	type Slot = { left: number; top: number };
	const slotsFor = (note: NoteDraft, extra: readonly number[]): Slot[] => {
		const markLeft = plate.left + note.mark.x * scaleX;
		const markRight = plate.left + (note.mark.x + note.mark.w) * scaleX;
		const rawXs = [
			markRight + breath,
			markLeft - breath - width,
			parkRoom,
			pane.width - width - parkRoom,
			(markLeft + markRight) / 2 - width / 2,
			markLeft + (markRight - markLeft) * 0.35,
			markRight - Math.min(width, markRight - markLeft) * 0.45,
			...extra,
		];
		const seen = new Set<string>();
		const slots: Slot[] = [];
		for (const top of [...rowsFor(note.height, 'top'), ...rowsFor(note.height, 'bottom')]) {
			for (const raw of rawXs) {
				const left = Math.round(clampLeft(raw) * 100) / 100;
				const key = `${left}:${Math.round(top * 100)}`;
				if (seen.has(key)) continue;
				seen.add(key);
				const rect = { left, top, right: left + width, bottom: top + note.height };
				if (!overlaps(rect)) slots.push({ left, top });
			}
		}
		return slots;
	};
	const placeAt = (note: NoteDraft, slot: Slot): NotePlacement => ({
		index: note.index,
		kind: 'letterbox',
		side: note.side,
		left: slot.left,
		top: slot.top,
		width,
		height: note.height,
		omitLeader: false,
	});
	const scoreSlot = (
		map: ReadonlyMap<number, NotePlacement>,
		note: NoteDraft,
		slot: Slot,
		kept: ReadonlySet<number>,
	) => {
		const trial = new Map(map);
		trial.set(note.index, placeAt(note, slot));
		const result = leadersOf(trial);
		const mine = result.find((row) => row.index === note.index)?.points ?? null;
		const keep = [...kept].filter((index) => result.some((row) => row.index === index && row.points)).length;
		const full = keep === kept.size;
		const tier = mine && full ? 0 : full ? 1 : 2;
		const length = mine ? polyLength(mine) : 1e9;
		const near = Math.min(
			Math.abs(slot.top + note.height - plate.top),
			Math.abs(slot.top - (plate.top + plate.height)),
		);
		return { tier, keep, length, near };
	};
	const baseSlots = new Map<number, Slot[]>();
	let openSlots = new Map<number, Slot[]>();
	for (const note of queue) baseSlots.set(note.index, slotsFor(note, []));
	const roomFor = (map: ReadonlyMap<number, NotePlacement>, note: NoteDraft, slot: Slot) => {
		const box: CssRect = {
			left: slot.left,
			top: slot.top,
			right: slot.left + width,
			bottom: slot.top + note.height,
		};
		let free = 0;
		for (const other of queue) {
			if (other.index === note.index || map.has(other.index)) continue;
			for (const option of openSlots.get(other.index) ?? []) {
				const rect = {
					left: option.left,
					top: option.top,
					right: option.left + width,
					bottom: option.top + other.height,
				};
				if (rectsOverlap(rect, box)) continue;
				let blocked = false;
				for (const done of map.values()) {
					if (done.kind === 'overflow') continue;
					if (rectsOverlap(rect, boxOf(done))) {
						blocked = true;
						break;
					}
				}
				if (!blocked) free += 1;
			}
		}
		return free;
	};
	const leaderRoom = (map: ReadonlyMap<number, NotePlacement>, note: NoteDraft, slot: Slot) => {
		const box: CssRect = {
			left: slot.left,
			top: slot.top,
			right: slot.left + width,
			bottom: slot.top + note.height,
		};
		let free = 0;
		for (const other of queue) {
			if (other.index === note.index || map.has(other.index)) continue;
			const options = openSlots.get(other.index) ?? [];
			if (options.length === 0) continue;
			const stride = Math.max(1, Math.floor(options.length / 8));
			let drawable = false;
			for (let index = 0; index < options.length && !drawable; index += stride) {
				const option = options[index];
				if (!option) continue;
				const rect = {
					left: option.left,
					top: option.top,
					right: option.left + width,
					bottom: option.top + other.height,
				};
				if (rectsOverlap(rect, box)) continue;
				let blocked = false;
				for (const done of map.values()) {
					if (done.kind === 'overflow') continue;
					if (rectsOverlap(rect, boxOf(done))) {
						blocked = true;
						break;
					}
				}
				if (blocked) continue;
				const trial = new Map(map);
				trial.set(note.index, placeAt(note, slot));
				trial.set(other.index, placeAt(other, option));
				const result = leadersOf(trial);
				drawable = result.some((row) => row.index === other.index && row.points);
			}
			if (drawable) free += 1;
		}
		return free;
	};
	const overflowAt = (note: NoteDraft): NotePlacement => ({
		index: note.index,
		kind: 'overflow',
		side: note.side,
		left: plate.left + note.mark.x * scaleX,
		top: plate.top + note.mark.y * scaleY,
		width: note.mark.w * scaleX,
		height: note.mark.h * scaleY,
		omitLeader: true,
	});
	const assign = (order: readonly NoteDraft[], slotMap: ReadonlyMap<number, Slot[]>, useRoom: boolean) => {
		const map = new Map(placed);
		for (const requireOwn of [true, false]) {
			for (const note of order) {
				if (map.has(note.index)) continue;
				const options = (slotMap.get(note.index) ?? []).filter((slot) => {
					const rect = {
						left: slot.left,
						top: slot.top,
						right: slot.left + width,
						bottom: slot.top + note.height,
					};
					if (rectsOverlap(rect, plateRect)) return false;
					for (const done of map.values()) {
						if (done.kind === 'overflow') continue;
						if (rectsOverlap(rect, boxOf(done))) return false;
					}
					return true;
				});
				const before = leadersOf(map);
				const kept = new Set(before.filter((row) => row.points).map((row) => row.index));
				const pool: {
					place: NotePlacement;
					tier: number;
					keep: number;
					length: number;
					near: number;
					slot: Slot;
				}[] = [];
				for (const slot of options) {
					const scored = scoreSlot(map, note, slot, kept);
					if (scored.tier > (requireOwn ? 0 : 1)) continue;
					pool.push({ place: placeAt(note, slot), tier: scored.tier, keep: scored.keep, length: scored.length, near: scored.near, slot });
				}
				const bestTier = pool.reduce((min, item) => Math.min(min, item.tier), 2);
				const bestKeep = pool.filter((item) => item.tier === bestTier).reduce((max, item) => Math.max(max, item.keep), 0);
				const ranked = pool.filter((item) => item.tier === bestTier && item.keep === bestKeep);
				ranked.sort((a, b) => a.length - b.length || a.near - b.near);
				const shortlist: typeof ranked = [];
				if (useRoom && requireOwn) {
					const byRow = new Map<number, typeof ranked>();
					for (const item of ranked) {
						const key = Math.round(item.slot.top);
						const list = byRow.get(key) ?? [];
						list.push(item);
						byRow.set(key, list);
					}
					for (const list of byRow.values()) shortlist.push(...list.slice(0, 2));
				} else if (ranked[0]) shortlist.push(ranked[0]);
				let best: (typeof pool)[number] & { leaders: number; room: number } | null = null;
				for (const item of shortlist) {
					const leaders = useRoom && requireOwn ? leaderRoom(map, note, item.slot) : 0;
					const room = useRoom && requireOwn ? roomFor(map, note, item.slot) : 0;
					const better =
						!best ||
						leaders > best.leaders ||
						(leaders === best.leaders &&
							(room > best.room ||
								(room === best.room &&
									(item.length < best.length - 1e-6 ||
										(Math.abs(item.length - best.length) <= 1e-6 && item.near < best.near)))));
					if (better) best = { ...item, leaders, room };
				}
				if (best) map.set(note.index, best.place);
				else if (!requireOwn) {
					// Spec: a leader omit must not demote a fitted letterbox note to overflow.
					if (options.length === 0) {
						map.set(note.index, overflowAt(note));
					} else {
						const geo: typeof pool = [];
						for (const slot of options) {
							const scored = scoreSlot(map, note, slot, kept);
							geo.push({
								place: placeAt(note, slot),
								tier: scored.tier,
								keep: scored.keep,
								length: scored.length,
								near: scored.near,
								slot,
							});
						}
						geo.sort(
							(a, b) =>
								a.tier - b.tier ||
								b.keep - a.keep ||
								a.length - b.length ||
								a.near - b.near,
						);
						const pick = geo[0];
						if (pick) map.set(note.index, pick.place);
						else map.set(note.index, overflowAt(note));
					}
				}
			}
		}
		return map;
	};
	const indexOrder = [...queue].sort((a, b) => a.index - b.index);
	const indexed = assign(indexOrder, baseSlots, false);
	const survivors = (map: ReadonlyMap<number, NotePlacement>) =>
		leadersOf(map).filter((row) => row.points).map((row) => row.index);
	const indexKept = survivors(indexed);
	const visibleCount = (map: ReadonlyMap<number, NotePlacement>) =>
		[...map.values()].filter((place) => place.kind !== 'overflow').length;
	const betterPack = (
		next: ReadonlyMap<number, NotePlacement>,
		prev: ReadonlyMap<number, NotePlacement>,
		scarce: readonly NoteDraft[],
	) => {
		const nextVisible = visibleCount(next);
		const prevVisible = visibleCount(prev);
		if (nextVisible !== prevVisible) return nextVisible > prevVisible;
		const nextKept = survivors(next);
		const prevKept = survivors(prev);
		if (nextKept.length !== prevKept.length) return nextKept.length > prevKept.length;
		const scarceHits = (ids: readonly number[]) => scarce.filter((note) => ids.includes(note.index)).length;
		return scarceHits(nextKept) > scarceHits(prevKept);
	};
	let winner: Map<number, NotePlacement> = indexed;
	const fullSlots = new Map<number, Slot[]>();
	openSlots = new Map<number, Slot[]>();
	const openCount = new Map<number, number>();
	for (const note of queue) {
		const full = slotsFor(note, corridorLefts(note));
		fullSlots.set(note.index, full);
		const open: Slot[] = [];
		for (const slot of full) {
			if (scoreSlot(placed, note, slot, new Set()).tier === 0) open.push(slot);
		}
		openSlots.set(note.index, open);
		openCount.set(note.index, open.length);
	}
	// Mid-plate marks have the fewest clear letterbox corridors (falp381 ②③);
	// prefer them when trading equal leader counts so packing keeps elbows.
	const midY = plateSize.height / 2;
	const scarce = [...queue]
		.sort(
			(a, b) =>
				Math.abs(a.mark.y + a.mark.h / 2 - midY) - Math.abs(b.mark.y + b.mark.h / 2 - midY) ||
				(openCount.get(a.index) ?? 0) - (openCount.get(b.index) ?? 0) ||
				a.index - b.index,
		)
		.slice(0, Math.max(2, Math.ceil(queue.length / 2)));
	if (indexKept.length < queue.length || visibleCount(indexed) < queue.length) {
		const tightOrder = [...queue].sort(
			(a, b) => (openCount.get(a.index) ?? 0) - (openCount.get(b.index) ?? 0) || a.index - b.index,
		);
		const tight = assign(tightOrder, fullSlots, true);
		if (betterPack(tight, winner, scarce)) winner = tight;
	}
	// Mid-plate marks (falp381 ②③) need opposite letterbox bands so their far-edge
	// corridors clear ①/⑤ — place scarce elbow notes before wide bottom/top marks.
	const elbowOrder = [...queue].sort((a, b) => {
		const mid = plateSize.height / 2;
		const da = Math.abs(a.mark.y + a.mark.h / 2 - mid);
		const db = Math.abs(b.mark.y + b.mark.h / 2 - mid);
		return (
			(openCount.get(a.index) ?? 0) - (openCount.get(b.index) ?? 0) ||
			da - db ||
			a.index - b.index
		);
	});
	const elbowed = assign(elbowOrder, fullSlots, true);
	if (betterPack(elbowed, winner, scarce)) winner = elbowed;

	// Repair overflows + missing elbows (falp381 insert ②③): mid marks need
	// opposite bands so far-edge corridors clear ①/⑤. Displace notes that already
	// omit their leader to free a corridor, then re-seat them if a slot remains.
	const slotOpen = (
		map: ReadonlyMap<number, NotePlacement>,
		note: NoteDraft,
		slot: Slot,
		ignore: ReadonlySet<number> = new Set(),
	) => {
		const rect = {
			left: slot.left,
			top: slot.top,
			right: slot.left + width,
			bottom: slot.top + note.height,
		};
		if (rectsOverlap(rect, plateRect)) return false;
		for (const done of map.values()) {
			if (done.kind === 'overflow' || ignore.has(done.index)) continue;
			if (rectsOverlap(rect, boxOf(done))) return false;
		}
		return true;
	};
	const allSlotsFor = (note: NoteDraft) => fullSlots.get(note.index) ?? baseSlots.get(note.index) ?? [];
	const repaired = new Map(winner);
	const leadSet = (map: ReadonlyMap<number, NotePlacement> = repaired) => new Set(survivors(map));
	const scoreMap = (map: ReadonlyMap<number, NotePlacement>) => {
		const kept = survivors(map);
		const scarceHits = scarce.filter((note) => kept.includes(note.index)).length;
		return { visible: visibleCount(map), leaders: kept.length, scarceHits, ids: kept };
	};
	let bestScore = scoreMap(repaired);
	const consider = (map: Map<number, NotePlacement>) => {
		const score = scoreMap(map);
		const better =
			score.visible > bestScore.visible ||
			(score.visible === bestScore.visible && score.leaders > bestScore.leaders) ||
			(score.visible === bestScore.visible &&
				score.leaders === bestScore.leaders &&
				score.scarceHits > bestScore.scarceHits);
		if (!better) return;
		bestScore = score;
		for (const note of queue) {
			const place = map.get(note.index);
			if (place) repaired.set(note.index, { ...place });
		}
	};
	// Pass 1: seat overflows into free slots.
	for (const note of queue) {
		const cur = repaired.get(note.index);
		if (!cur || cur.kind !== 'overflow') continue;
		for (const slot of allSlotsFor(note)) {
			if (!slotOpen(repaired, note, slot)) continue;
			const trial = new Map(repaired);
			trial.set(note.index, placeAt(note, slot));
			consider(trial);
			break;
		}
	}
	// Pass 2: give leader-less letterbox notes a free elbow slot.
	for (const note of queue) {
		const cur = repaired.get(note.index);
		if (!cur || cur.kind === 'overflow') continue;
		if (leadSet().has(note.index)) continue;
		const before = leadSet();
		for (const slot of allSlotsFor(note)) {
			if (!slotOpen(repaired, note, slot, new Set([note.index]))) continue;
			const trial = new Map(repaired);
			trial.set(note.index, placeAt(note, slot));
			const after = leadSet(trial);
			if (!after.has(note.index)) continue;
			if ([...before].filter((index) => after.has(index)).length < before.size) continue;
			consider(trial);
			break;
		}
	}
	// Pass 3: displace an omit-leader neighbor so an overflow / leader-less note
	// can take a corridor that yields an elbow (② top-right / ③ bottom-left class).
	for (const note of queue) {
		const cur = repaired.get(note.index);
		const needsSeat = !cur || cur.kind === 'overflow' || !leadSet().has(note.index);
		if (!needsSeat) continue;
		for (const slot of allSlotsFor(note)) {
			const blockers: number[] = [];
			const rect = {
				left: slot.left,
				top: slot.top,
				right: slot.left + width,
				bottom: slot.top + note.height,
			};
			if (rectsOverlap(rect, plateRect)) continue;
			for (const done of repaired.values()) {
				if (done.kind === 'overflow' || done.index === note.index) continue;
				if (rectsOverlap(rect, boxOf(done))) blockers.push(done.index);
			}
			if (blockers.length === 0) {
				const trial = new Map(repaired);
				trial.set(note.index, placeAt(note, slot));
				if (!leadSet(trial).has(note.index) && cur && cur.kind !== 'overflow') continue;
				consider(trial);
				continue;
			}
			if (blockers.length > 2) continue;
			const trial = new Map(repaired);
			for (const index of blockers) trial.delete(index);
			trial.set(note.index, placeAt(note, slot));
			// Prefer trials that grant this note an elbow; overflows may seat omit-only.
			const gained = leadSet(trial).has(note.index);
			if (!gained && cur && cur.kind !== 'overflow') continue;
			// Re-seat displaced notes into any remaining slot (omit leader OK).
			let seated = true;
			for (const index of blockers) {
				const other = queue.find((item) => item.index === index);
				if (!other) {
					seated = false;
					break;
				}
				let found: Slot | null = null;
				for (const alt of allSlotsFor(other)) {
					if (slotOpen(trial, other, alt)) {
						found = alt;
						break;
					}
				}
				if (!found) {
					seated = false;
					break;
				}
				trial.set(index, placeAt(other, found));
			}
			if (!seated) continue;
			consider(trial);
		}
	}
	// Pass 4: seat the two mid-plate notes on opposite letterbox bands so their
	// far-edge corridors clear ①/⑤ (falp381 ② top-right + ③ bottom-left).
	const midPair = scarce.slice(0, 2);
	if (midPair.length === 2) {
		const plateMidY = plate.top + plate.height / 2;
		const onTop = (note: NoteDraft, slot: Slot) => slot.top + note.height / 2 < plateMidY;
		const uniqueLefts = (note: NoteDraft, band: 'top' | 'bottom'): Slot[] => {
			const seen = new Set<number>();
			const out: Slot[] = [];
			for (const slot of allSlotsFor(note)) {
				if (onTop(note, slot) !== (band === 'top')) continue;
				const key = Math.round(slot.left);
				if (seen.has(key)) continue;
				seen.add(key);
				out.push(slot);
				if (out.length >= 10) break;
			}
			return out;
		};
		const placeOmitAt = (note: NoteDraft, slot: Slot): NotePlacement => ({
			...placeAt(note, slot),
			omitLeader: true,
		});
		const reseatBlockers = (
			trial: Map<number, NotePlacement>,
			blockers: readonly number[],
		): boolean => {
			for (const index of blockers) {
				const other = queue.find((item) => item.index === index);
				if (!other) return false;
				let found: Slot | null = null;
				for (const alt of allSlotsFor(other)) {
					if (slotOpen(trial, other, alt)) {
						found = alt;
						break;
					}
				}
				if (!found) return false;
				trial.set(index, placeOmitAt(other, found));
			}
			return true;
		};
		const tryPair = (topNote: NoteDraft, botNote: NoteDraft) => {
			for (const topSlot of uniqueLefts(topNote, 'top')) {
				for (const botSlot of uniqueLefts(botNote, 'bottom')) {
					const blockers = new Set<number>();
					for (const [note, slot] of [
						[topNote, topSlot] as const,
						[botNote, botSlot] as const,
					]) {
						const rect = {
							left: slot.left,
							top: slot.top,
							right: slot.left + width,
							bottom: slot.top + note.height,
						};
						if (rectsOverlap(rect, plateRect)) {
							blockers.clear();
							blockers.add(-1);
							break;
						}
						for (const done of repaired.values()) {
							if (done.kind === 'overflow') continue;
							if (done.index === topNote.index || done.index === botNote.index) continue;
							if (rectsOverlap(rect, boxOf(done))) blockers.add(done.index);
						}
					}
					if (blockers.has(-1) || blockers.size > 3) continue;
					const trial = new Map(repaired);
					for (const index of blockers) trial.delete(index);
					trial.delete(topNote.index);
					trial.delete(botNote.index);
					trial.set(topNote.index, placeAt(topNote, topSlot));
					trial.set(botNote.index, placeAt(botNote, botSlot));
					// Silence non-mid leaders so index-ordered selectSplitLeaders
					// cannot let ①/⑤ steal corridors from the mid pair.
					for (const [index, place] of trial) {
						if (index === topNote.index || index === botNote.index) continue;
						if (place.kind === 'overflow' || place.omitLeader) continue;
						trial.set(index, { ...place, omitLeader: true });
					}
					if (!reseatBlockers(trial, [...blockers])) continue;
					const leads = leadSet(trial);
					if (!leads.has(topNote.index) || !leads.has(botNote.index)) continue;
					consider(trial);
				}
			}
		};
		tryPair(midPair[0]!, midPair[1]!);
		tryPair(midPair[1]!, midPair[0]!);
		// Keep omitLeader false on letterbox notes that do not steal mid elbows
		// (falp381 ④ stays fitted + drawable flag; only ①/⑤ need the silence).
		const midIds = new Set(midPair.map((note) => note.index));
		if ([...midIds].every((index) => leadSet().has(index))) {
			for (const [index, place] of repaired) {
				if (place.kind === 'overflow' || midIds.has(index)) continue;
				repaired.set(index, { ...place, omitLeader: false });
			}
			let leads = leadSet();
			if (![...midIds].every((index) => leads.has(index))) {
				for (const note of queue) {
					if (midIds.has(note.index)) continue;
					const place = repaired.get(note.index);
					if (!place || place.kind === 'overflow') continue;
					if (!leads.has(note.index)) continue;
					repaired.set(note.index, { ...place, omitLeader: true });
					leads = leadSet();
					if ([...midIds].every((index) => leads.has(index))) break;
				}
			}
		}
	}
	if (betterPack(repaired, winner, scarce)) winner = repaired;
	for (const [index, place] of winner) placed.set(index, place);
	const stored: NotePlacement[] = [];
	for (const note of queue) {
		const place = placed.get(note.index);
		if (place) stored.push(place);
	}
	letterboxPackCache.set(
		packKey,
		stored.map((place) => ({ ...place })),
	);
	if (letterboxPackCache.size > 12) {
		const oldest = letterboxPackCache.keys().next().value;
		if (oldest !== undefined) letterboxPackCache.delete(oldest);
	}
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
	const queue: NoteDraft[] = [];
	for (const side of ['left', 'right'] as const) {
		const group = notes.filter((note) => note.side === side).sort(byAnchor);
		if (group.length === 0) continue;
		const strip = (pane.width - plate.width) / 2;
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
	}
	if (queue.length > 0) {
		packLetterboxNotes({ pane, plate, plateSize, rem, notes, queue, placed, plateRect });
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
	const letterboxQueue: NoteDraft[] = [];

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
		// Pack against the plate. A y=0 column crosses the cover, and the leader pass drops it.
		if (band + 1e-6 >= MIN_BAND_REM * rem) {
			letterboxQueue.push(...group);
			continue;
		}
		pending.push(...group);
	}

	if (letterboxQueue.length > 0) {
		const plateRect: CssRect = {
			left: plate.left,
			top: plate.top,
			right: plate.left + plate.width,
			bottom: plate.top + plate.height,
		};
		packLetterboxNotes({
			pane,
			plate,
			plateSize,
			rem,
			notes,
			queue: letterboxQueue,
			placed,
			plateRect,
		});
		for (const note of letterboxQueue) {
			const place = placed.get(note.index);
			if (!place || place.kind === 'overflow') {
				placed.delete(note.index);
				pending.push(note);
			}
		}
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
