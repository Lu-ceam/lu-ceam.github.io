/**
 * 唱片章内的竖滑 runway：滚动进度 → 一面的揭示相位（upright → crop 窗 → plate → settled 肘线）。
 *
 * 纯几何／相位都在这里，供章内阅读器（`disc-chapter-reader.ts`）一帧一帧地落样式：
 * 几何 `openingBox` → `plateBox` → `zoomImageBox` / `cropWindow`（`detail-display.ts`），
 * 相位／曲线 `placeOnRunway` / `stageVisual`（`split-stage.ts`，与桌面 `.camera-runway` 同一套）。
 * 不另立 `scale()` 冒充，也不按时间自动播——手指拖到哪，`cropT` 就在哪；可反刮。
 */

import {
	cropWindow,
	layerTransform,
	openingBox,
	plateBox,
	zoomImageBox,
	type Crop,
	type FrameBox,
	type PxSize,
} from './detail-display.ts';
import {
	JOINT_SVH,
	PASS_SVH,
	placeOnRunway,
	stageVisual,
	type RunwayPlace,
	type StageVisual,
} from './split-stage.ts';

/** 一面揭示的滚动行程：与桌面 runway 同一套 pass／joint 单位。 */
export const COVER_PASS_SVH = PASS_SVH;
export const COVER_JOINT_SVH = JOINT_SVH;

/** 一面揭示大约滚过多少屏：只定 runway 的总高，不改相位边界。 */
export const COVER_PASS_SCREENS = 1.15;

export function clamp01(value: number): number {
	if (!Number.isFinite(value)) return 0;
	return Math.min(1, Math.max(0, value));
}

/** runway 的总行程（pass ＋ joint 单位）；一面没有 joint。 */
export function coverRunwayUnits(passCount: number): number {
	if (!(passCount > 0)) return 0;
	return passCount * PASS_SVH + Math.max(0, passCount - 1) * JOINT_SVH;
}

/** runway 的像素高：sticky 舞台高 ＋ 行程（一面≈`COVER_PASS_SCREENS` 屏）。 */
export function coverRunwayHeightPx(stagePx: number, passCount: number): number {
	const stage = stagePx > 0 ? stagePx : 0;
	if (!(passCount > 0)) return stage;
	return stage * (1 + (COVER_PASS_SCREENS * coverRunwayUnits(passCount)) / PASS_SVH);
}

/** 舞台钉住之后还能滚多远：进度 0..1 就映射在这段上。 */
export function coverRunwayTravelPx(stagePx: number, passCount: number): number {
	const stage = stagePx > 0 ? stagePx : 0;
	return Math.max(0, coverRunwayHeightPx(stage, passCount) - stage);
}

/**
 * 章内 progress：runway 顶滚到滚动口顶上时 0，行程走完时 1。
 * 不掺章内其它内容的高度，滑到哪就是哪（可反刮）。
 */
export function coverRunwayProgress(args: {
	scrollTop: number;
	/** runway 顶相对滚动口内容顶的偏移。 */
	runwayTop: number;
	travelPx: number;
}): number {
	if (!(args.travelPx > 0)) return 0;
	return clamp01((args.scrollTop - args.runwayTop) / args.travelPx);
}

/** 进度 → 第几面 / 面内相位（与桌面 `placeOnRunway` 同一套边界）。 */
export function coverPlace(progress: number, passCount: number): RunwayPlace {
	return placeOnRunway(progress, passCount);
}

export type CoverPaint = {
	/** 0 = 整幅 upright，1 = crop 落定。 */
	cropT: number;
	outerOpacity: number;
	windowOpacity: number;
	plateOpacity: number;
	boxesOpacity: number;
	leadersOpacity: number;
	notesOpacity: number;
	/** 框／虚线肘／注文三者一起的最小值：settled 才亮，反刮会退回去。 */
	calloutOpacity: number;
	/** settled：plate＋框选肘线都在位。 */
	settled: boolean;
};

/**
 * 一面在 `local` 处的画法（0..1，来自 `stageVisual`）。
 *
 * `settle` 给 `prefers-reduced-motion` 用：这一面直接落在 settled，但**换面仍靠竖滑**
 * （进度照旧驱动 `coverPlace`），不偷偷按时间播。
 */
export function coverPassPaint(args: {
	local: number;
	hasNotes: boolean;
	settle?: boolean;
}): CoverPaint {
	const visual: StageVisual = stageVisual(args.settle ? 1 : args.local, args.hasNotes);
	const cropT = visual.cropT;
	const calloutOpacity = args.hasNotes
		? Math.min(visual.boxesOpacity, visual.leadersOpacity, visual.notesOpacity)
		: 0;
	return {
		cropT,
		// 外层整幅在裁剪窗聚焦时平方淡出（与 reveal 同一支 `outerFade`）。
		outerOpacity: (1 - cropT) * (1 - cropT) * visual.uprightOpacity,
		// plate 还没接上时窗必须可见（窗缘就是「在看哪一块」）。
		windowOpacity: visual.plateOpacity >= 0.98 ? 0 : 1,
		plateOpacity: visual.plateOpacity,
		// 没有 marks 就一个框都不画（不编假框）。
		boxesOpacity: args.hasNotes ? visual.boxesOpacity : 0,
		leadersOpacity: visual.leadersOpacity,
		notesOpacity: visual.notesOpacity,
		calloutOpacity,
		settled: cropT >= 1 && visual.plateOpacity >= 1 && calloutOpacity >= 1,
	};
}

export type CoverCropInput = {
	/** 章内舞台（`[data-cover-stage]`）的现量尺寸。 */
	pane: PxSize;
	/** upright 照片的原始像素。 */
	natural: PxSize;
	/** 导出的 plate（裁剪结果）像素。 */
	plate: PxSize;
	crop: Crop;
	/** 0 = 整幅 upright，1 = plate 落定。 */
	cropT: number;
	/** 窄屏给注文留的纸边（letterbox），与先盘 reveal 同口径。 */
	bandReservePx?: number;
	/** 上下纸边（stack 注文带）。不传＝同 `bandReservePx`。 */
	bandReservePxY?: number;
};

export type CoverCropGeometry = {
	cropT: number;
	opening: FrameBox;
	/** plate 落定的位置（也是这一镜的终点）。 */
	plate: FrameBox;
	/** upright 图层的基准框（settled 尺寸，动画靠 transform 回到开场）。 */
	image: FrameBox;
	/** 裁剪窗的基准框（settled 位置；cropT=1 时与 plate 重合）。 */
	window: FrameBox;
	/** 这一帧外层 upright **实际**落在哪（基准 + transform 之后）。 */
	imageLive: FrameBox;
	/** 这一帧裁剪窗实际落在哪（窗缘就在这个框上）。 */
	windowLive: FrameBox;
	imageTransform: string;
	windowTransform: string;
	settled: boolean;
};

/**
 * 一帧的几何：外层 upright 用 settled 图框 + `layerTransform(box, live)` 回放，
 * 裁剪窗同理；`cropT = 1` 时窗口直接钉到 plate 框（与先盘 `matchPlateFrame` 同义）。
 * 透明度不在这里（`coverPassPaint`），几何只有一个来源。
 */
export function coverCropGeometry(input: CoverCropInput): CoverCropGeometry {
	const cropT = clamp01(input.cropT);
	const pane = input.pane;
	const opening = openingBox(pane, input.natural);
	const plate = plateBox(
		pane,
		opening,
		input.plate,
		input.natural,
		input.crop,
		input.bandReservePx ?? 0,
		input.bandReservePxY ?? input.bandReservePx ?? 0,
	);
	const image = zoomImageBox({
		opening,
		plate,
		natural: input.natural,
		crop: input.crop,
		cropT: 1,
	});
	const live = zoomImageBox({
		opening,
		plate,
		natural: input.natural,
		crop: input.crop,
		cropT,
	});
	const settled = cropT >= 1;
	const windowBox = settled
		? { ...plate }
		: cropWindow({ image, naturalWidth: input.natural.width, crop: input.crop });
	const liveWindow = cropWindow({
		image: live,
		naturalWidth: input.natural.width,
		crop: input.crop,
	});
	return {
		cropT,
		opening,
		plate,
		image,
		window: windowBox,
		imageLive: live,
		// settled 那一帧窗口直接钉到 plate 框（与先盘 `matchPlateFrame` 同义）。
		windowLive: settled ? { ...plate } : liveWindow,
		imageTransform: settled ? 'none' : layerTransform(image, live),
		windowTransform: settled ? 'none' : layerTransform(windowBox, liveWindow),
		settled,
	};
}
