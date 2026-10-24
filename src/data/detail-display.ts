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

export function notesAligned(detail: { marks: readonly { note?: string }[] }): boolean {
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

export function leaderEndpoints(args: LeaderArgs): { x1: number; y1: number; x2: number; y2: number } {
	const scaleX = args.plateRect.width / args.plateWidth;
	const scaleY = args.plateRect.height / args.plateHeight;
	const y1 = args.mark.y + args.mark.h / 2;
	const x1 = args.side === 'left' ? args.mark.x : args.mark.x + args.mark.w;
	const noteCenterCss = args.noteRect.top + args.noteRect.height / 2;
	const y2 = (noteCenterCss - args.plateRect.top) / scaleY;
	const innerCss = args.side === 'right' ? args.noteRect.left : args.noteRect.right;
	const endCss = args.side === 'right' ? innerCss - args.shortPx : innerCss + args.shortPx;
	const x2 = (endCss - args.plateRect.left) / scaleX;
	return { x1, y1, x2, y2 };
}
