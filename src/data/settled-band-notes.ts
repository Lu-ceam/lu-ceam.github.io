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

/**
 * 侧带列宽下限：低于即改上下 letterbox 横排。
 * 7rem ≈ 14 个 CJK／一行拉丁单词不碎折（旧侧带在 390 宽屏上只有 ~3.1rem，
 * 于是 `WILHELM`、`Grand…` 被一字一折）。
 */
export const BAND_NOTE_MIN_REM = 7;

/** stack 的一行允许到 28rem；更宽只会让注文离 plate 更远，读起来更散。 */
export const BAND_STACK_CAP_REM = 28;

export type BandLayout = 'side' | 'stack';

export type BandSide = 'left' | 'right' | 'top' | 'bottom';

/** 侧带够宽→'side'；否则→'stack'（plate 上／下奶油带横排）。 */
export function bandLayoutFor(args: {
	pane: PxSize;
	plate: FrameBox;
	rem: number;
}): BandLayout {
	const strip = (args.pane.width - args.plate.width) / 2;
	if (!(args.rem > 0)) return 'stack';
	return strip + 1e-6 >= BAND_NOTE_MIN_REM * args.rem ? 'side' : 'stack';
}

/** stack 时注文的宽：两侧各留 `gap`（右边那条也是避滚动条），上限 `BAND_STACK_CAP_REM`。 */
export function bandStackWidthPx(args: { pane: PxSize; rem: number }): number {
	const gap = bandNoteGapPx(args.rem);
	const cap = BAND_STACK_CAP_REM * (args.rem > 0 ? args.rem : 0);
	return Math.max(0, Math.min(args.pane.width - 2 * gap, cap));
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
	side: BandSide;
	/** 注文框（帧／pane 坐标，px）。 */
	left: number;
	top: number;
	width: number;
	height: number;
	/** 注文朝 plate 的 stub 边（px）：肘线终点落在这里。 */
	stubX: number;
	/** stub 边的 y（px）：top／bottom 时是注文朝 plate 的那条横边。 */
	stubY: number;
	/**
	 * 挤不下被减载（`priorities` 低者先卸）。阅读器据此写 `data-shed="1"`／`aria-hidden`，
	 * 容器写 `data-notes-shed="<n>"`。减载条不上屏、不画肘线。
	 */
	shed?: boolean;
};

const NO_PLACEMENT: Omit<BandNotePlacement, 'side'> = {
	left: 0,
	top: 0,
	width: 0,
	height: 0,
	stubX: 0,
	stubY: 0,
};

/**
 * stack 时上下两带各装哪些注文：按传入顺序（阅读器按 seat 的 y 排过）贪心装进较空的一带，
 * 平局先给上带。`bandStackReservePx` 与 `placeBandNotes` 共用这一份分割，纸边和落位不会打架。
 */
function splitStackBands(heights: readonly number[]): { top: number[]; bottom: number[] } {
	const top: number[] = [];
	const bottom: number[] = [];
	let usedTop = 0;
	let usedBottom = 0;
	heights.forEach((raw, index) => {
		const height = Math.max(0, raw);
		if (usedTop <= usedBottom) {
			top.push(index);
			usedTop += height;
		} else {
			bottom.push(index);
			usedBottom += height;
		}
	});
	return { top, bottom };
}

/**
 * stack 时上下须留的纸边：高的一带全部注文＋行间 gap，再加 `gap` 的 stub 呼吸。
 * 阅读器把它当 `bandReservePx` 交给 `plateBox`，plate 才会缩到注文下面。
 */
export function bandStackReservePx(args: { heights: readonly number[]; rem: number }): number {
	const gap = bandNoteGapPx(args.rem);
	const { top, bottom } = splitStackBands(args.heights);
	const used = (band: readonly number[]): number =>
		band.reduce((sum, index) => sum + Math.max(0, args.heights[index] ?? 0), 0) +
		Math.max(0, band.length - 1) * gap;
	const tallest = Math.max(used(top), used(bottom));
	return tallest > 0 ? tallest + gap : 0;
}

/**
 * 把注文排进 pane：侧带够宽就跑左右列（旧路），不够就改 plate 上下的 letterbox 横排
 * （`BAND_NOTE_MIN_REM`）。
 *
 * 装不下（越出 pane、压上 plate）不再 clamp 叠压：按 `priorities` 低者先减载（`shed: true`），
 * 减完重排，直到这一组放得下。`priorities` 缺省＝阅读序（下标越小越优先保留）。
 */
export function placeBandNotes(args: {
	pane: PxSize;
	plate: FrameBox;
	plateSize: PxSize;
	rem: number;
	seats: readonly BandSeat[];
	heights: readonly number[];
	/** 阅读器已量过、决定过就用它；否则按 `bandLayoutFor` 自算。 */
	layout?: BandLayout;
	/** 同序优先级：小的先保留（缺省＝阅读序）。装不下时从大的开始卸。 */
	priorities?: readonly number[];
}): BandNotePlacement[] {
	const { seats } = args;
	const layout = args.layout ?? bandLayoutFor({ pane: args.pane, plate: args.plate, rem: args.rem });
	const priorities = seats.map((_, index) =>
		Number.isFinite(args.priorities?.[index]) ? (args.priorities?.[index] as number) : index,
	);
	const kept = seats.map((_, index) => index);
	let result: (BandNotePlacement | null)[] | null = null;
	while (kept.length > 0) {
		const attempt = layout === 'stack' ? placeStackNotes(args, kept) : placeSideNotes(args, kept);
		if (attempt) {
			result = attempt;
			break;
		}
		// 卸掉保留集里优先级最低的一条（同优先级卸靠后的那条，阅读序稳定）。
		let dropAt = 0;
		for (let i = 1; i < kept.length; i += 1) {
			const a = priorities[kept[i] ?? 0] ?? 0;
			const b = priorities[kept[dropAt] ?? 0] ?? 0;
			if (a > b || (a === b && (kept[i] ?? 0) > (kept[dropAt] ?? 0))) dropAt = i;
		}
		kept.splice(dropAt, 1);
	}
	const fallback = (index: number): BandNotePlacement => ({
		...NO_PLACEMENT,
		side: seats[index]?.side ?? 'bottom',
	});
	return seats.map((_, index) => result?.[index] ?? { ...fallback(index), shed: true });
}

/** 左右列：放得下就回位，越出 pane 就回 null 交给减载。 */
function placeSideNotes(
	args: { pane: PxSize; plate: FrameBox; plateSize: PxSize; rem: number; seats: readonly BandSeat[]; heights: readonly number[] },
	kept: readonly number[],
): (BandNotePlacement | null)[] | null {
	const { pane, plate, plateSize, seats, heights } = args;
	const gap = bandNoteGapPx(args.rem);
	const width = bandNoteWidthPx(args);
	if (width <= 0 || plate.width <= 0 || plate.height <= 0) return null;
	const scaleY = plateSize.height > 0 ? plate.height / plateSize.height : 0;
	const placed: (BandNotePlacement | null)[] = seats.map(() => null);

	for (const side of ['left', 'right'] as const) {
		const column = kept
			.map((index) => ({ seat: seats[index] as BandSeat, index }))
			.filter((entry) => entry.seat.side === side)
			.sort((a, b) => a.seat.center - b.seat.center || a.index - b.index);
		let previous = Number.NEGATIVE_INFINITY;
		for (const { seat, index } of column) {
			const height = Math.max(0, heights[index] ?? 0);
			let top = plate.top + seat.center * scaleY - height / 2;
			if (top < previous + gap) top = previous + gap;
			if (top < 0) top = 0;
			// 越出 pane 底不再往下 clamp（那会叠压）：整组判装不下。
			if (top + height > pane.height + 0.5) return null;
			const stubX = side === 'left' ? plate.left - gap : plate.left + plate.width + gap;
			placed[index] = {
				side,
				left: side === 'left' ? stubX - width : stubX,
				top,
				width,
				height,
				stubX,
				stubY: top + height / 2,
			};
			previous = top + height;
		}
	}

	return placed;
}

/**
 * stack：注文横排在 plate 上（`top`）或下（`bottom`）的奶油带里，宽到能容一行字。
 * 上下两带各自贴 stub 向上／向下排列，一带之内只错 gap，所以不互压；
 * 整体夹在 pane 内，左右各留 gap（右侧那条也避滚动条）。
 *
 * 带分配仍按全体注文（与 `bandStackReservePx` 同一份分割），只是从 `kept` 里取；
 * 放不下（越出 pane／压上 plate／互压）就回 null 交给减载重排。
 */
function placeStackNotes(
	args: {
		pane: PxSize;
		plate: FrameBox;
		rem: number;
		heights: readonly number[];
	},
	kept: readonly number[],
): (BandNotePlacement | null)[] | null {
	const { pane, plate, heights } = args;
	const gap = bandNoteGapPx(args.rem);
	const width = bandStackWidthPx({ pane, rem: args.rem });
	if (width <= 0 || plate.width <= 0 || plate.height <= 0) return null;
	const left = (pane.width - width) / 2;
	const bands = splitStackBands(heights);
	const keptSet = new Set(kept);
	const top = bands.top.filter((index) => keptSet.has(index));
	const bottom = bands.bottom.filter((index) => keptSet.has(index));
	const placed: (BandNotePlacement | null)[] = heights.map(() => null);
	const fits = (index: number, topPx: number): boolean => {
		const height = Math.max(0, heights[index] ?? 0);
		if (topPx < -0.5) return false;
		if (topPx + height > pane.height + 0.5) return false;
		// 注∩plate＝∅
		return !(
			topPx < plate.top + plate.height &&
			topPx + height > plate.top &&
			left < plate.left + plate.width &&
			left + width > plate.left
		);
	};

	// 上带贴 plate 上沿向上堆：末条的底边正好是 stub 线。
	const topStub = plate.top - gap;
	let cursor = topStub;
	for (const index of top) {
		const height = Math.max(0, heights[index] ?? 0);
		const noteTop = cursor - height;
		if (!fits(index, noteTop)) return null;
		placed[index] = {
			side: 'top',
			left,
			top: noteTop,
			width,
			height,
			stubX: left + width / 2,
			stubY: noteTop + height,
		};
		cursor = noteTop - gap;
	}

	// 下带贴 plate 下沿向下堆：首条的顶边就是 stub 线。
	cursor = plate.top + plate.height + gap;
	for (const index of bottom) {
		const height = Math.max(0, heights[index] ?? 0);
		const noteTop = cursor;
		if (!fits(index, noteTop)) return null;
		placed[index] = {
			side: 'bottom',
			left,
			top: noteTop,
			width,
			height,
			stubX: left + width / 2,
			stubY: noteTop,
		};
		cursor = noteTop + height + gap;
	}

	return placed;
}

/**
 * 肘线：从框的边引出，拐一次落到注文 stub，再伸出 plate 边 `stubUser`
 * （plate 用户坐标，图上已 `overflow: visible`）——终点正是注文 stub 边，
 * 所以纸带里总有一段可见行程，不会贴框成零长。
 *
 * `left`／`right`：从框的竖边横向引出，终点 y＝`seat.center`（注文锚的 y）。
 * `top`／`bottom`：从框的横边竖向引出，终点 x＝`seat.center`（注文 stub 的 x）
 * 并越过 plate 上／下沿 `stubUser`。
 */
export function bandLeaderPoints(args: {
	mark: { x: number; y: number; w: number; h: number };
	seat: { side: BandSide; center: number };
	plateWidth: number;
	/** 竖向引出时要越过的高度；旧调用不传也照旧走左右。 */
	plateHeight?: number;
	stubUser?: number;
}): string {
	const stub = Math.max(0, args.stubUser ?? 0);
	const side = args.seat.side;
	if (side === 'top' || side === 'bottom') {
		const plateHeight = Math.max(0, args.plateHeight ?? 0);
		const x1 = args.mark.x + args.mark.w / 2;
		const y1 = side === 'top' ? args.mark.y : args.mark.y + args.mark.h;
		const y2 = side === 'top' ? -stub : plateHeight + stub;
		const x2 = args.seat.center;
		if (Math.abs(x2 - x1) < 0.5) return `${x1},${y1} ${x2},${y2}`;
		const kneeY = (y1 + y2) / 2;
		return `${x1},${y1} ${x1},${kneeY} ${x2},${kneeY} ${x2},${y2}`;
	}
	const x1 = side === 'left' ? args.mark.x : args.mark.x + args.mark.w;
	const y1 = args.mark.y + args.mark.h / 2;
	const x2 = side === 'left' ? -stub : args.plateWidth + stub;
	const y2 = args.seat.center;
	if (Math.abs(y2 - y1) < 0.5) return `${x1},${y1} ${x2},${y2}`;
	const kneeX = x1 + (x2 - x1) / 2;
	return `${x1},${y1} ${kneeX},${y1} ${kneeX},${y2} ${x2},${y2}`;
}

/** 注文 stub 边在 plate 用户坐标里的朝向点：左右带用 y，上下带用 x。 */
export function bandStubSeat(args: {
	place: Pick<BandNotePlacement, 'side' | 'stubX' | 'stubY' | 'top' | 'height'>;
	plate: FrameBox;
	plateSize: PxSize;
}): { side: BandSide; center: number } {
	const { place, plate, plateSize } = args;
	if (place.side === 'top' || place.side === 'bottom') {
		const scaleX = plateSize.width > 0 ? plate.width / plateSize.width : 1;
		const center = scaleX > 0 ? (place.stubX - plate.left) / scaleX : 0;
		return { side: place.side, center };
	}
	const scaleY = plateSize.height > 0 ? plate.height / plateSize.height : 1;
	const center = scaleY > 0 ? (place.stubY - plate.top) / scaleY : 0;
	return { side: place.side, center };
}

/** 注文 stub 在 plate 用户坐标里伸出去多少（px → 用户坐标）。 */
export function bandStubUser(stubPx: number, plateWidthPx: number, plateWidthUser: number): number {
	if (!(stubPx > 0) || !(plateWidthPx > 0) || !(plateWidthUser > 0)) return 0;
	return (stubPx / plateWidthPx) * plateWidthUser;
}
