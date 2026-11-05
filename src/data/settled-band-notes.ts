/**
 * 窄屏唱片章 settled：注文停 pane 的奶油侧带，框＋肘留在 plate。
 *
 * 口径与 PC letterbox 同一份（`detail-display`）：`LETTERBOX_BAND_RESERVE_REM` 给
 * plate 留纸边，`NOTE_CAP_REM` 封注文宽，`NOTE_GAP_REM` 管错开与 stub 呼吸。
 * 与 PC 的差别只在落点：窄屏 plate 边上就是侧带，注文按 seat 的 y 贴左右纸边排，
 * **不与 plate 矩形相交**（plate 内外由 `bandReservePx`／本模块一起保证）。
 */

import {
	type FrameBox,
	LETTERBOX_BAND_RESERVE_REM,
	NOTE_CAP_REM,
	NOTE_GAP_REM,
	type PxSize,
} from './detail-display.ts';

/** plate 两侧须留的纸边：不足时 `plateBox` 会缩 plate，而不是把注文塞回图上。 */
export function bandReservePx(rem: number): number {
	if (!(rem > 0)) return 0;
	return LETTERBOX_BAND_RESERVE_REM * rem;
}

/** 注文与 plate 边、注文与注文之间的距离。 */
export function bandNoteGapPx(rem: number): number {
	if (!(rem > 0)) return 0;
	return NOTE_GAP_REM * rem;
}

/** 注文能占的最大宽（`NOTE_CAP_REM` 与纸带宽取小）。 */
export function bandNoteWidthPx(args: { pane: PxSize; plate: FrameBox; rem: number }): number {
	const gap = bandNoteGapPx(args.rem);
	const strip = Math.max(0, (args.pane.width - args.plate.width) / 2);
	return Math.min(NOTE_CAP_REM * args.rem, Math.max(0, strip - gap));
}

/** 一条注文贴在哪边、锚在注文的哪条 y（plate 用户坐标）。 */
export type BandSeat = { side: 'left' | 'right'; center: number };

export type BandNotePlacement = {
	side: 'left' | 'right';
	/** 注文框（帧／pane 坐标，px）。 */
	left: number;
	top: number;
	width: number;
	height: number;
	/** 注文朝 plate 的 stub 边（px）：肘线终点落在这里。 */
	stubX: number;
};

const NO_PLACEMENT: Omit<BandNotePlacement, 'side'> = {
	left: 0,
	top: 0,
	width: 0,
	height: 0,
	stubX: 0,
};

/**
 * 把注文排进 pane 的左右侧带：同侧按 seat 的 y 从上到下错开 `NOTE_GAP_REM`，
 * 越出 pane 就压回来（宁可贴底，也不越框）。注文宽＝`bandNoteWidthPx`。
 */
export function placeBandNotes(args: {
	pane: PxSize;
	plate: FrameBox;
	plateSize: PxSize;
	rem: number;
	seats: readonly BandSeat[];
	heights: readonly number[];
}): BandNotePlacement[] {
	const { pane, plate, plateSize, seats, heights } = args;
	const gap = bandNoteGapPx(args.rem);
	const width = bandNoteWidthPx(args);
	const fallback = (index: number): BandNotePlacement => ({
		...NO_PLACEMENT,
		side: seats[index]?.side ?? 'right',
	});
	if (width <= 0 || plate.width <= 0 || plate.height <= 0) {
		return seats.map((_, index) => fallback(index));
	}
	const scaleY = plateSize.height > 0 ? plate.height / plateSize.height : 0;
	const placed: (BandNotePlacement | null)[] = seats.map(() => null);

	for (const side of ['left', 'right'] as const) {
		const column = seats
			.map((seat, index) => ({ seat, index }))
			.filter((entry) => entry.seat.side === side)
			.sort((a, b) => a.seat.center - b.seat.center || a.index - b.index);
		let previous = Number.NEGATIVE_INFINITY;
		for (const { seat, index } of column) {
			const height = Math.max(0, heights[index] ?? 0);
			let top = plate.top + seat.center * scaleY - height / 2;
			if (top < previous + gap) top = previous + gap;
			const ceiling = Math.max(0, pane.height - height);
			if (top > ceiling) top = ceiling;
			if (top < 0) top = 0;
			const stubX = side === 'left' ? plate.left - gap : plate.left + plate.width + gap;
			placed[index] = {
				side,
				left: side === 'left' ? stubX - width : stubX,
				top,
				width,
				height,
				stubX,
			};
			previous = top + height;
		}
	}

	return placed.map((place, index) => place ?? fallback(index));
}

/**
 * 肘线：从框的侧边引出，拐一次落到注文锚的 y，再伸出 plate 边 `stubUser`
 * （plate 用户坐标，图上已 `overflow: visible`）——终点正是注文 stub 边，
 * 所以侧带里总有一段可见行程，不会贴框成零长。
 */
export function bandLeaderPoints(args: {
	mark: { x: number; y: number; w: number; h: number };
	seat: BandSeat;
	plateWidth: number;
	stubUser?: number;
}): string {
	const stub = Math.max(0, args.stubUser ?? 0);
	const x1 = args.seat.side === 'left' ? args.mark.x : args.mark.x + args.mark.w;
	const y1 = args.mark.y + args.mark.h / 2;
	const x2 = args.seat.side === 'left' ? -stub : args.plateWidth + stub;
	const y2 = args.seat.center;
	if (Math.abs(y2 - y1) < 0.5) return `${x1},${y1} ${x2},${y2}`;
	const kneeX = x1 + (x2 - x1) / 2;
	return `${x1},${y1} ${kneeX},${y1} ${kneeX},${y2} ${x2},${y2}`;
}

/** 注文 stub 在 plate 用户坐标里伸出去多少（px → 用户坐标）。 */
export function bandStubUser(stubPx: number, plateWidthPx: number, plateWidthUser: number): number {
	if (!(stubPx > 0) || !(plateWidthPx > 0) || !(plateWidthUser > 0)) return 0;
	return (stubPx / plateWidthPx) * plateWidthUser;
}
