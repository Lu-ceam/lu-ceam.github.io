/**
 * 窄屏地图章 map-dock：**契约闸门**（PRD `/home/box/web-layout/prd-map-controls-single-row.md` §4／§10）。
 *
 * 这一份只钉两件事：
 * 1. 纯算术口径（契约模块 `map-dock.ts` 与 CSS 的常量同源，320／390 的宽度预算不靠手算）；
 * 2. 源码面的归属（标记里只有一个 `.traj-controls`、dock 规则只出现在 compact 块、
 *    禁用的玻璃／紫渐变／全宽气球不在里面）。
 *
 * 真实像素（dockOnMap、share、blurb 高度、overflowX）由 `scripts/map-dock.runtime.test.mjs`
 * 在 `dist` 上量。本文件不是布局 PASS 的证据。
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import {
	DOCK_BLURB_MAX_EM,
	DOCK_GAP_MIN_PX,
	DOCK_GAP_PX,
	DOCK_INSET_X_NARROW_PX,
	DOCK_INSET_X_PX,
	DOCK_INSET_Y_NARROW_PX,
	DOCK_INSET_Y_PX,
	DOCK_MAP_MIN_SHARE,
	DOCK_MAX_H_PX,
	DOCK_MID_MAX_PX,
	DOCK_MID_MIN_PX,
	DOCK_NARROW_MAX_PX,
	DOCK_SHADOW_BLUR_PX,
	DOCK_SHADOW_Y_PX,
	DOCK_TOUCH_MIN_NARROW_PX,
	DOCK_TOUCH_MIN_PX,
	DOCK_TOUCH_NARROW_PX,
	DOCK_TOUCH_PX,
	type DockFixture,
	dockAvailablePx,
	dockBlurbGain,
	dockInsets,
	dockMapShare,
	dockRowFits,
	dockRowPlan,
	dockRowWidth,
	dockTier,
	dockTouchSize,
	midWidthDock,
	narrowDock,
	primaryDock,
	shortDock,
} from './map-dock.ts';

const here = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(join(here, '../styles/global.css'), 'utf8');
const view = readFileSync(join(here, '../components/TrajectoryMap.astro'), 'utf8');
const client = readFileSync(join(here, '../components/trajectory-map-client.ts'), 'utf8');
const reader = readFileSync(join(here, './disc-chapter-reader.ts'), 'utf8');

/** compact 段：从薄题那条规则到窄屏块结束（dock 规则必须全在里面）。 */
const compactStart = css.indexOf(
	".disc-chapter-map .traj[data-map-chrome='compact'] > .traj-title {",
);
const narrowEnd = css.indexOf('@media (min-width: 48rem) {\n\t.disc-chapters', compactStart);
const compactCss = css.slice(compactStart, narrowEnd > 0 ? narrowEnd : undefined);

/** 年轴列宽：单一业主写在 `:root` 与 Astro 窄屏块；这里只读 `:root` 的那个。 */
const RAIL_PX = Number.parseFloat((css.match(/--disc-year-rail-w:\s*([\d.]+)px/) ?? [])[1] ?? 'NaN');

/** 一条规则的声明体。 */
function rule(source: string, selector: string): string {
	const at = source.indexOf(selector);
	if (at < 0) return '';
	const open = source.indexOf('{', at);
	const close = source.indexOf('}', open);
	if (open < 0 || close < 0) return '';
	return source.slice(open + 1, close);
}

const DOCK_RULE = "[data-traj-dock] {";

describe('map-dock 常量：PRD §4 的尺码只有一份', () => {
	it('freezes insets, touch tiers, height and share', () => {
		// §4.1 「390 左右 8–12、底 8–10」；§10 P2-1 「320 侧 2–4」。
		assert.equal(DOCK_INSET_X_PX, 8);
		assert.equal(DOCK_INSET_Y_PX, 9);
		assert.equal(DOCK_INSET_X_NARROW_PX, 3);
		assert.equal(DOCK_INSET_Y_NARROW_PX, 8);
		// §4.4 触点：390 目标 44 / 中档 40 / 320 36（P2-2 允许 44→40，不许更低）。
		assert.equal(DOCK_TOUCH_PX, 44);
		assert.equal(DOCK_TOUCH_MIN_PX, 40);
		assert.equal(DOCK_TOUCH_NARROW_PX, 36);
		assert.equal(DOCK_TOUCH_MIN_NARROW_PX, 36);
		// §4.5 自身高度 ≤48；§4.6 share ≥0.48。
		assert.equal(DOCK_MAX_H_PX, 48);
		assert.equal(DOCK_MAP_MIN_SHARE, 0.48);
		assert.equal(DOCK_BLURB_MAX_EM, 10);
		// §4.2 raised 上限 0 2px 8px。
		assert.equal(DOCK_SHADOW_Y_PX, 2);
		assert.equal(DOCK_SHADOW_BLUR_PX, 8);
		// 档位边界：≤359 narrow、360–389 mid、≥390 wide；gap 阶梯顶格 8、兜底 4。
		assert.equal(DOCK_NARROW_MAX_PX, 359);
		assert.equal(DOCK_MID_MIN_PX, 360);
		assert.equal(DOCK_MID_MAX_PX, 389);
		assert.equal(DOCK_GAP_PX, 8);
		assert.equal(DOCK_GAP_MIN_PX, 4);
	});

	it('maps a pane width to a tier and to its touch size', () => {
		assert.equal(dockTier(320), 'narrow');
		assert.equal(dockTier(359), 'narrow');
		assert.equal(dockTier(360), 'mid');
		assert.equal(dockTier(375), 'mid');
		assert.equal(dockTier(389), 'mid');
		assert.equal(dockTier(390), 'wide');
		assert.equal(dockTouchSize('narrow'), 36);
		assert.equal(dockTouchSize('mid'), 40);
		assert.equal(dockTouchSize('wide'), 44);
		assert.deepEqual(dockInsets('narrow'), { x: 3, y: 8 });
		assert.deepEqual(dockInsets('mid'), { x: 8, y: 9 });
		assert.deepEqual(dockInsets('wide'), { x: 8, y: 9 });
	});

	it('keeps the style numbers the CSS actually writes', () => {
		assert.ok(RAIL_PX > 0, '`--disc-year-rail-w` 读不到');
		// 年轴列宽是本票的**输入**，不是本票的产物：只要求它存在且被 dock 的算术读到。
		assert.match(css, /--disc-year-rail-w:\s*58px;/);
		const dockVars = rule(css, ":has(.traj-controls[data-traj-dock]) {");
		assert.match(dockVars, /--dock-inset-x:\s*8px;/);
		assert.match(dockVars, /--dock-inset-y:\s*9px;/);
		assert.match(dockVars, /--dock-touch:\s*44px;/);
		assert.match(dockVars, /--dock-h:\s*48px;/);
		assert.match(dockVars, /--dock-chip-border:\s*color-mix\(in srgb, var\(--text\) 45%, var\(--line\)\)/);
		assert.doesNotMatch(dockVars, /--dock-blurb-max/);
	});
});

describe('map-dock 一行 nowrap：320／375／390 都装得下（P2-2 的算术）', () => {
	/** 每档的量法是「视口 − 年轴 − 2×inset − 2×1px 边 − 2×侧内距」。 */
	const CASE = [
		{ w: 320, tier: 'narrow' as const, touch: 36, padX: 0, inset: 3 },
		{ w: 375, tier: 'mid' as const, touch: 40, padX: 0, inset: 8 },
		{ w: 390, tier: 'wide' as const, touch: 44, padX: 0, inset: 8 },
	];

	it('computes the content box the same way the CSS lays it out', () => {
		// 侧内距为 0（P2-2 降压第一步）：视口 − 年轴 58 − 2×inset − 2×1px 边。
		assert.equal(dockAvailablePx({ paneW: 390, railW: 58, insetX: 8 }), 314);
		assert.equal(dockAvailablePx({ paneW: 375, railW: 58, insetX: 8 }), 299);
		assert.equal(dockAvailablePx({ paneW: 320, railW: 58, insetX: 3 }), 254);
		// inset 与边一起扣，不是只扣年轴。
		assert.equal(dockAvailablePx({ paneW: 320, railW: 58, insetX: 0, borderPx: 0 }), 262);
		// 显式给 border／padding 才扣它们（默认值就是 0 内距 + 1px 边）。
		assert.equal(dockAvailablePx({ paneW: 390, railW: 58, insetX: 8, paddingX: 4 }), 306);
		// 视口比年轴还窄：不返回负数。
		assert.equal(dockAvailablePx({ paneW: 40, railW: 58, insetX: 8 }), 0);
	});

	for (const item of CASE) {
		it(`fits seven single-row buttons at ${item.w}`, () => {
			const available = dockAvailablePx({
				paneW: item.w,
				railW: RAIL_PX,
				insetX: item.inset,
				paddingX: item.padX,
			});
			const labels = Array.from({ length: 7 }, () => item.touch);
			const plan = dockRowPlan({ tier: item.tier, availablePx: available, labels });
			assert.ok(plan, `${item.w}: 一行装不下（available=${available}）`);
			assert.equal(plan.touch, item.touch, `${item.w}: 触点档被改了`);
			// 装得下才是装得下：算出来的总宽不许超过可用宽。
			assert.equal(dockRowFits({ tier: item.tier, availablePx: available, buttons: labels, gap: plan.gap }), true);
			assert.ok(dockRowWidth(labels, plan.gap) <= available);
		});
	}

	it('never buys a fit by shrinking below the tier floor', () => {
		// 390 装不下 7×44 的极端窄列：不许降到 40 以下（非 320 档）。
		assert.equal(dockRowPlan({ tier: 'wide', availablePx: 200, labels: Array(7).fill(44) }), null);
		// 320 地板 36：再窄也不许 34。
		assert.equal(dockRowPlan({ tier: 'narrow', availablePx: 200, labels: Array(7).fill(36) }), null);
		// 325 的可用宽刚好能被 7×36 吃掉。
		assert.equal(
			dockRowFits({ tier: 'narrow', availablePx: 252, buttons: Array(7).fill(36), gap: 0 }),
			true,
		);
	});

	it('steps the gap down before it touches the touch size', () => {
		// 标签宽 20（两个字 @12px）：触点地板才是每条按钮真正的最小宽。
		const labels = Array(7).fill(20);
		// gap 8 需要 308+48=356；gap 4 需要 332；给 340 就只收 gap，触点仍是 44。
		assert.deepEqual(dockRowPlan({ tier: 'wide', availablePx: 340, labels }), {
			gap: DOCK_GAP_MIN_PX,
			touch: 44,
			width: 332,
		});
		// 312 只容得下 gap 0。
		assert.deepEqual(dockRowPlan({ tier: 'wide', availablePx: 312, labels }), {
			gap: 0,
			touch: 44,
			width: 308,
		});
		// 300：gap 已到底，才开始收触点（44 → 42）。
		assert.deepEqual(dockRowPlan({ tier: 'wide', availablePx: 300, labels }), {
			gap: 0,
			touch: 42,
			width: 294,
		});
	});
});

describe('map-dock 的收益口径', () => {
	it('reports share from the map container box', () => {
		assert.equal(dockMapShare({ paneHeightPx: 667, mapHeightPx: 403 }), 403 / 667);
		assert.equal(dockMapShare({ paneHeightPx: 0, mapHeightPx: 400 }), 0);
		assert.ok(dockMapShare({ paneHeightPx: 667, mapHeightPx: 403 }) >= DOCK_MAP_MIN_SHARE);
	});

	it('wants +40px against A and no loss against B', () => {
		const gain = dockBlurbGain({ dockPx: 150, aPx: 84, bPx: 128 });
		assert.equal(gain.vsA, 66);
		assert.equal(gain.vsB, 22);
		assert.equal(gain.passA, true);
		assert.equal(gain.passB, true);
		// 只多 39 不够（PRD §4.5 的 +40 是硬门）。
		assert.equal(dockBlurbGain({ dockPx: 123, aPx: 84, bPx: 128 }).passA, false);
		// 比 B 少一点都不算「≥ B」。
		assert.equal(dockBlurbGain({ dockPx: 120, aPx: 84, bPx: 128 }).passB, false);
	});
});

describe('map-dock 验收夹具：三条真实站文 × 三个壳', () => {
	it('names the primary long station and the demo-independent numbers', () => {
		const all: DockFixture[] = [primaryDock, narrowDock, shortDock, midWidthDock];
		for (const fixture of all) {
			assert.equal(fixture.expect.dockOnMap, true, fixture.id);
			assert.equal(fixture.expect.rows, 1, fixture.id);
			assert.equal(fixture.expect.overflowX, false, fixture.id);
			assert.ok(fixture.expect.touchMin >= 36, fixture.id);
			assert.ok(fixture.expect.touchMin <= 44, fixture.id);
			assert.equal(fixture.expect.dockMaxH, DOCK_MAX_H_PX, fixture.id);
			assert.ok(fixture.expect.mapShareMin >= DOCK_MAP_MIN_SHARE, fixture.id);
			assert.ok(fixture.expect.blurbGainVsA >= 40, fixture.id);
			// 夹具的触点下限必须和它自己的视口档一致（不许拿宽档尺码量 320）。
			assert.equal(fixture.expect.touchMin, dockTouchSize(dockTier(fixture.viewport.w)), fixture.id);
		}
		assert.equal(primaryDock.id, 'cs6785');
		assert.equal(primaryDock.viewport.w, 390);
		assert.equal(primaryDock.station.long, true);
		assert.equal(narrowDock.viewport.w, 320);
		assert.equal(midWidthDock.viewport.w, 375);
		assert.equal(shortDock.station.long, false);
	});
});

describe('map-dock 源码归属（S1/S2/S4）', () => {
	it('S1: the dock lives in the compact block and adds no second row allocation', () => {
		assert.ok(compactCss.length > 0, 'compact 段定位失败');
		assert.ok(compactCss.includes('[data-traj-dock]'), 'compact 块里没有 dock 规则');
		// 行分配的唯一业主仍是 Astro 的窄屏块（PR #184 的教训）：dock 规则里不许再写。
		const dockRules = compactCss.slice(compactCss.indexOf('.traj-map-wrap:has('));
		assert.ok(dockRules.length > 0);
		assert.doesNotMatch(rule(compactCss, DOCK_RULE), /grid-template-rows/);
		assert.match(
			view,
			/\.traj\[data-map-chrome='compact'\] \.traj-stage \{\s*grid-template-rows:\s*minmax\(180px, 1fr\) min\(var\(--traj-narr-h\), 46%\);/,
		);
		// dock 的容器业主只有一个：compact 地图列（同选择器前一条是 #184 的高度规则，不改）。
		const wrapRules = compactCss.match(/\[data-map-chrome='compact'\] \.traj-map-wrap \{[^}]*\}/g) ?? [];
		assert.ok(wrapRules.length >= 2, `地图列规则只剩一条：${wrapRules.length}`);
		assert.match(wrapRules[wrapRules.length - 1], /position:\s*relative;/, '地图列没成为 dock 的定位容器');
	});

	it('S2: one control node, seven hooks, icons for the icon-only tiers', () => {
		assert.equal((view.match(/class="traj-controls"/g) ?? []).length, 1, '.traj-controls 不止一个节点');
		for (const hook of [
			'data-traj-guide',
			'data-traj-chrono',
			'data-traj-explore',
			'data-traj-play',
			'data-traj-replay',
			'data-traj-prev',
			'data-traj-next',
		]) {
			assert.ok(view.includes(hook), `${hook} 不见了`);
		}
		// 不新增图标：dock 里仍用文字标签（320 收到 36 也放得下两个字），桌面不变。
		assert.equal((view.match(/class="traj-controls-label"/g) ?? []).length, 5);
		// 七个都带 aria-label。不再另写一份相同的 title：读屏会把名字读两遍。
		for (const [hook, label] of [
			['data-traj-guide', '导览'],
			['data-traj-chrono', '游线'],
			['data-traj-explore', '探索'],
			['data-traj-play', '播放'],
			['data-traj-replay', '重播'],
			['data-traj-prev', '上一站'],
			['data-traj-next', '下一站'],
		] as const) {
			const at = view.indexOf(hook);
			const open = view.lastIndexOf('<button', at);
			const close = view.indexOf('>', at);
			const tag = view.slice(open, close);
			const dynamic = hook === 'data-traj-explore';
			assert.match(
				tag,
				dynamic ? /aria-label=\{/ : new RegExp(`aria-label="${label}"`),
				`${hook} 缺 aria-label`,
			);
			assert.doesNotMatch(tag, /\stitle=/, `${hook} 的 title 与 aria-label 重复`);
		}
	});

	it('S4: no glass, no purple gradient, no full-width 999 balloon', () => {
		const dock = rule(compactCss, DOCK_RULE);
		assert.ok(dock.length > 0, 'dock 规则体没找到');
		assert.doesNotMatch(dock, /backdrop-filter/);
		assert.doesNotMatch(dock, /blur\(/);
		assert.doesNotMatch(dock, /linear-gradient|radial-gradient/);
		// 320 贴齐 + 999 圆角就是评审 P2-1 说的「底边贴条」。
		assert.doesNotMatch(dock, /inset-inline:\s*0;/);
		// 纸色／淡边／轻 raised：不许玻璃或大阴影。
		assert.match(dock, /box-shadow:\s*0 2px 8px/);
		assert.match(dock, /border:\s*1px solid/);
		assert.match(dock, /background:\s*var\(--bg-elevated\)/);
		// 主路径不许横滑。
		assert.doesNotMatch(dock, /overflow-x:\s*auto/);
		// 单行：column 会退回两行控件（B 弃案）。
		assert.match(dock, /flex-direction:\s*row;/);
		assert.match(dock, /flex-wrap:\s*nowrap;/);
	});

	it('S3: the relocation lives in the trajectory client, not in the chapter reader', () => {
		assert.match(client, /function dockControls\(|const dockControls = /);
		assert.match(client, /function undockControls\(|const undockControls = /);
		assert.match(client, /dataset\.trajDock/);
		assert.match(client, /dataset\.trajControlsHome/);
		// 章节阅读器只负责 `data-map-chrome`，不搬控件（它是禁改路径）。
		assert.doesNotMatch(reader, /trajDock/);
		assert.doesNotMatch(reader, /trajControlsHome/);
	});
});
