/**
 * 窄屏地图章 map-dock（PRD `/home/box/web-layout/prd-map-controls-single-row.md` §4／§10）的几何口径。
 *
 * CSS（`global.css` compact 块）、客户端与源码／运行闸门共用这一组常数，于是
 * 「390 触点 44」「320 触点 36」「dock ≤48」「share ≥0.48」「320 侧 2–4px」
 * 不是四处各写一遍的魔数。
 *
 * 只做算术：不量 DOM、不读视口、不碰时钟。像素与真机惯性仍要 GUI／真机复验，
 * 这里不是布局 PASS 的证据。
 */

/** 浮在地图底缘内侧：左右 / 底的内距（§4.1「390 左右 8–12、底 8–10」）。 */
export const DOCK_INSET_X_PX = 8;
export const DOCK_INSET_Y_PX = 9;
/** 320 壳：评审 P2-1 要求 2–4px（既不是贴齐、也不是 999 全宽气球）。 */
export const DOCK_INSET_X_NARROW_PX = 3;
export const DOCK_INSET_Y_NARROW_PX = 8;

/**
 * 触点档（§4.4）：390 目标 44；360–389 为中档 40（§10 P2-2 为消 overflowX 允许）；
 * 320 为 36。地板：非 320 档不得低于 40，320 档不得低于 36，且永不用横滑换取。
 */
export const DOCK_TOUCH_PX = 44;
export const DOCK_TOUCH_MID_PX = 40;
export const DOCK_TOUCH_NARROW_PX = 36;
export const DOCK_TOUCH_MIN_PX = 40;
export const DOCK_TOUCH_MIN_NARROW_PX = 36;

/** dock 自身高度上限（§4.5）与它不许用采买文字的 share 地板（§4.6）。 */
export const DOCK_MAX_H_PX = 48;
export const DOCK_MAP_MIN_SHARE = 0.48;
/** dock 态介绍带 5.6em → 10em（§4.5：对 A ≥+40px、对 B 持平）。 */
export const DOCK_BLURB_MAX_EM = 10;
/** raised 阴影上限（§4.2）：再重就是 FAIL。 */
export const DOCK_SHADOW_Y_PX = 2;
export const DOCK_SHADOW_BLUR_PX = 8;
/**
 * 按下芯片的中性边：`--text` 混进 `--line` 的比例。
 * 15%（旧 `--dock-border`）在纸底上只有约 1.7:1；45% 在 `--bg #f3f0e8` 上约 3.34:1。
 */
export const DOCK_CHIP_BORDER_TEXT_MIX = 0.45;
/** 320 dock 四角半径。高 38 的近胶囊，不是 999 气球。 */
export const DOCK_RADIUS_NARROW_PX = 14;
/** dock 的 1px 描边（§4.2）：算宽时要扣，别把「刚好」算成「装得下」。 */
export const DOCK_BORDER_PX = 1;
/** dock 侧面内距：为了让 7 枚键装进 390／375，一律不占（P2-2 的降压顺序第一步）。 */
export const DOCK_PADDING_X_PX = 0;
export const DOCK_PADDING_X_NARROW_PX = 0;

/** 档位边界：≤359 narrow、360–389 mid、≥390 wide（与 CSS 的 359／360 两处同一号）。 */
export const DOCK_NARROW_MAX_PX = 359;
export const DOCK_MID_MIN_PX = 360;
export const DOCK_MID_MAX_PX = 389;
/** 一行 nowrap 的组间 gap 阶梯（P2-2：先收 gap，最后才收触点）。 */
export const DOCK_GAP_PX = 8;
export const DOCK_GAP_MIN_PX = 4;

export type DockTier = 'narrow' | 'mid' | 'wide';

/** 视口（或壳）宽落到哪一档。 */
export function dockTier(paneWidthPx: number): DockTier {
	if (!(paneWidthPx > DOCK_NARROW_MAX_PX)) return 'narrow';
	return paneWidthPx <= DOCK_MID_MAX_PX ? 'mid' : 'wide';
}

/** 一档的目标触点边（§4.4）。 */
export function dockTouchSize(tier: DockTier): number {
	if (tier === 'narrow') return DOCK_TOUCH_NARROW_PX;
	return tier === 'mid' ? DOCK_TOUCH_MID_PX : DOCK_TOUCH_PX;
}

/** 一档的触点地板：降档可以，破地板不可以。 */
export function dockTouchFloor(tier: DockTier): number {
	return tier === 'narrow' ? DOCK_TOUCH_MIN_NARROW_PX : DOCK_TOUCH_MIN_PX;
}

/** 一档的侧／底内距（§4.1 + §10 P2-1）。 */
export function dockInsets(tier: DockTier): { x: number; y: number } {
	if (tier === 'narrow') return { x: DOCK_INSET_X_NARROW_PX, y: DOCK_INSET_Y_NARROW_PX };
	return { x: DOCK_INSET_X_PX, y: DOCK_INSET_Y_PX };
}

/** 一档的侧面内距（T4.3：320 归零，宽档 2px）。 */
export function dockPaddingX(tier: DockTier): number {
	return tier === 'narrow' ? DOCK_PADDING_X_NARROW_PX : DOCK_PADDING_X_PX;
}

/**
 * 一行 nowrap 真正能用的内容宽。
 *
 * `paneW`（壳宽）− 年轴列（`--disc-year-rail-w`，本票只读不写）− 2×侧内距
 * − 2×1px 描边 − 2×侧面内距。负数一律归零：算不出就返回 0，让调用方失败。
 */
export function dockAvailablePx(input: {
	paneW: number;
	railW: number;
	insetX: number;
	paddingX?: number;
	borderPx?: number;
}): number {
	const paddingX = input.paddingX ?? DOCK_PADDING_X_PX;
	const borderPx = input.borderPx ?? DOCK_BORDER_PX;
	const raw = input.paneW - input.railW - 2 * input.insetX - 2 * borderPx - 2 * paddingX;
	return raw > 0 ? raw : 0;
}

/** 一行 nowrap 的总宽：按钮宽之和 ＋ 间隙。 */
export function dockRowWidth(buttons: readonly number[], gap: number = DOCK_GAP_PX): number {
	if (buttons.length === 0) return 0;
	return buttons.reduce((sum, width) => sum + width, 0) + gap * (buttons.length - 1);
}

/** 这一行在可用宽里装得下（nowrap 的算术闸门）。 */
export function dockRowFits(input: {
	tier: DockTier;
	availablePx: number;
	buttons: readonly number[];
	gap?: number;
}): boolean {
	return dockRowWidth(input.buttons, input.gap ?? DOCK_GAP_PX) <= input.availablePx;
}

/**
 * 按 P2-2 的降压顺序收：先 gap 8→4→0，gap 到底之后才收触点（每级 −2，不破档位地板）。
 * `labels` 是每枚按钮的标签宽；触点下限会把它们抬到 `touch`。
 * 装不下返回 null——调用方必须把 null 当失败（不许 `overflow-x: auto`）。
 */
export function dockRowPlan(input: {
	tier: DockTier;
	availablePx: number;
	labels: readonly number[];
}): { gap: number; touch: number; width: number } | null {
	const baseTouch = dockTouchSize(input.tier);
	const floor = dockTouchFloor(input.tier);
	const buttons = (touch: number) => input.labels.map((label) => Math.max(label, touch));
	for (const gap of [DOCK_GAP_PX, DOCK_GAP_MIN_PX, 0]) {
		const width = dockRowWidth(buttons(baseTouch), gap);
		if (width <= input.availablePx) return { gap, touch: baseTouch, width };
	}
	for (let touch = baseTouch - 2; touch >= floor; touch -= 2) {
		const width = dockRowWidth(buttons(touch), 0);
		if (width <= input.availablePx) return { gap: 0, touch, width };
	}
	return null;
}

/** 地图占章盒内容高（§4.6）：dock 叠在容器**内部**，不缩容器外框。 */
export function dockMapShare(input: { paneHeightPx: number; mapHeightPx: number }): number {
	if (!(input.paneHeightPx > 0)) return 0;
	return input.mapHeightPx / input.paneHeightPx;
}

/** 站文增高：相对 A（两行 chrome）与 B（chrome 单行）各多少（§4.5）。 */
export function dockBlurbGain(input: { dockPx: number; aPx: number; bPx: number }): {
	vsA: number;
	vsB: number;
	passA: boolean;
	passB: boolean;
} {
	const vsA = input.dockPx - input.aPx;
	const vsB = input.dockPx - input.bPx;
	return { vsA, vsB, passA: vsA >= 40, passB: vsB >= 0 };
}

/**
 * 验收夹具：同一份壳里对照 A（两行 chrome）与 C（dock）。
 *
 * 数字来自 PRD §4.5／§4.6 与 demo 的 C 列趋势；**不是**产品 PASS 的证据——
 * 真实像素由 `scripts/map-dock.runtime.test.mjs` 在 `dist` 上量。
 */
export type DockFixture = {
	id: 'cs6785' | 'falp381' | 'mhjl329';
	viewport: { w: 320 | 375 | 390; h: 568 | 812 | 844 };
	station: { place: string; index: string; long: boolean };
	expect: {
		dockOnMap: true;
		rows: 1;
		/** 该视口档的目标触点（390=44／375=40／320=36）。 */
		touchMin: number;
		dockMaxH: number;
		mapShareMin: number;
		/** 相对 A（两行 chrome）的介绍带增高，px。 */
		blurbGainVsA: number;
		overflowX: false;
	};
};

/** 主夹具：CS 6785 伦敦 Kingsway 长站文 @390×844。 */
export const primaryDock: DockFixture = {
	id: 'cs6785',
	viewport: { w: 390, h: 844 },
	station: { place: 'london-kingsway-1966', index: '04 / 05', long: true },
	expect: {
		dockOnMap: true,
		rows: 1,
		touchMin: 44,
		dockMaxH: DOCK_MAX_H_PX,
		mapShareMin: DOCK_MAP_MIN_SHARE,
		blurbGainVsA: 66,
		overflowX: false,
	},
};

/** 窄壳：同一站长文 @320×568。 */
export const narrowDock: DockFixture = {
	id: 'cs6785',
	viewport: { w: 320, h: 568 },
	station: { place: 'london-kingsway-1966', index: '04 / 05', long: true },
	expect: {
		dockOnMap: true,
		rows: 1,
		touchMin: 36,
		dockMaxH: DOCK_MAX_H_PX,
		mapShareMin: DOCK_MAP_MIN_SHARE,
		blurbGainVsA: 62,
		overflowX: false,
	},
};

/** 短文站：FALP 381 波恩 @320×568（`.is-short`，不许凭空多出滚动条）。 */
export const shortDock: DockFixture = {
	id: 'falp381',
	viewport: { w: 320, h: 568 },
	station: { place: 'bonn', index: '01 / 06', long: false },
	expect: {
		dockOnMap: true,
		rows: 1,
		touchMin: 36,
		dockMaxH: DOCK_MAX_H_PX,
		mapShareMin: DOCK_MAP_MIN_SHARE,
		blurbGainVsA: 62,
		overflowX: false,
	},
};

/** 中档宽：375×812 —— §10 P2-2 的 overflowX 现场（44 装不下，40 可以）。 */
export const midWidthDock: DockFixture = {
	id: 'cs6785',
	viewport: { w: 375, h: 812 },
	station: { place: 'london-kingsway-1966', index: '04 / 05', long: true },
	expect: {
		dockOnMap: true,
		rows: 1,
		touchMin: 40,
		dockMaxH: DOCK_MAX_H_PX,
		mapShareMin: DOCK_MAP_MIN_SHARE,
		blurbGainVsA: 66,
		overflowX: false,
	},
};

/** 四个夹具一起导出，测试与运行闸门共用。 */
export const DOCK_FIXTURES: readonly DockFixture[] = [
	primaryDock,
	narrowDock,
	shortDock,
	midWidthDock,
];
