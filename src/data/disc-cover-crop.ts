/**
 * 唱片章内的 fill→crop：博物馆展柜那套「整幅 upright → 对准 crop 的裁剪窗 → plate＋肘线」。
 *
 * 纯几何／曲线都在这里，供章内阅读器（`disc-chapter-reader.ts`）一帧一帧地落样式：
 * `openingBox` → `plateBox` → `zoomImageBox` / `cropWindow` / `fillCropPaint`（`detail-display.ts`）。
 * 与先盘 reveal 同一套 helper，不另立一套 `scale()` 冒充。
 *
 * 触发：进唱片章／切面后自动播一次（`COVER_CROP_MS`）；`prefers-reduced-motion` 由阅读器
 * 直接落到 settled（`cropT = 1`），这里不碰媒体查询。
 */

import {
	cropWindow,
	fillCropPaint,
	layerTransform,
	openingBox,
	plateBox,
	zoomImageBox,
	type Crop,
	type FrameBox,
	type PxSize,
} from './detail-display.ts';

/** 章内一镜到底的时长：开场 upright → 裁剪窗对准 → plate 落定。 */
export const COVER_CROP_MS = 1500;

/** `cropT` 到这里以后框选与注文才淡入（plate 已落定）。 */
export const COVER_CALLOUT_START = 0.82;

/** plate 完全落定（也是裁剪窗与 plate 重合的那一帧）。 */
export const COVER_SETTLED_T = 1;

export function clamp01(value: number): number {
	if (!Number.isFinite(value)) return 0;
	return Math.min(1, Math.max(0, value));
}

/** 两端斜率为 0 的缓动：开场／落定都不「顿」一下。 */
export function easeInOutCubic(t: number): number {
	const u = clamp01(t);
	return u < 0.5 ? 4 * u * u * u : 1 - (-2 * u + 2) ** 3 / 2;
}

/** 自动播放的时间进度：毫秒 → 0..1（已缓动）。 */
export function coverCropProgress(elapsedMs: number, durationMs = COVER_CROP_MS): number {
	if (!(durationMs > 0)) return 1;
	return easeInOutCubic(clamp01(elapsedMs / durationMs));
}

/** 框选／肘线／注文的淡入：plate 落定后才起。 */
export function coverCalloutFade(cropT: number): number {
	const t = clamp01(cropT);
	if (t <= COVER_CALLOUT_START) return 0;
	return easeInOutCubic((t - COVER_CALLOUT_START) / (1 - COVER_CALLOUT_START));
}

export type CoverCropInput = {
	/** 章内舞台（`[data-cover-frame]`）的现量尺寸。 */
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
	imageTransform: string;
	windowTransform: string;
	outerOpacity: number;
	windowOpacity: number;
	plateOpacity: 0 | 1;
	calloutOpacity: number;
};

/**
 * 一帧的几何：外层 upright 用 settled 图框 + `layerTransform(box, live)` 回放，
 * 裁剪窗同理；`cropT = 1` 时窗口直接钉到 plate 框（与先盘 `matchPlateFrame` 同义）。
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
	const paint = fillCropPaint({ cropT, local: cropT, plateEnd: COVER_SETTLED_T });
	const settled = cropT >= COVER_SETTLED_T;
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
		imageTransform: settled ? 'none' : layerTransform(image, live),
		windowTransform: settled ? 'none' : layerTransform(windowBox, liveWindow),
		outerOpacity: paint.outerOpacity,
		windowOpacity: paint.windowOpacity,
		plateOpacity: paint.plateOpacity,
		calloutOpacity: coverCalloutFade(cropT),
	};
}
