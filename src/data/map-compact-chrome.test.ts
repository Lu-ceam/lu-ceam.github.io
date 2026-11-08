/**
 * 手机地图章 compact chrome：几何／分行／介绍内滚的**契约**闸门。
 *
 * 这些断言只钉源码与纯函数口径：真机惯性、`visualViewport`、Leaflet 扩高后的
 * 闪帧都不在这里（PRD §6「明确未验」）。布局 PASS 由 GUI 复核给，不由本文件给。
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import {
	type BoundaryState,
	createBoundaryState,
	reduceBoundary,
} from './disc-chapter-boundary.ts';
import {
	COMPACT_BLURB_MAX_EM,
	COMPACT_CONTROL_GAP_PX,
	COMPACT_CONTROL_ROWS,
	COMPACT_CONTROL_ROW_PX,
	COMPACT_MAP_MIN_PX,
	COMPACT_MAP_MIN_SHARE,
	COMPACT_STAGE_ROWS,
	blurbGestureOwner,
	blurbOverflows,
	compactMapHeight,
	compactMapShare,
	controlRowFits,
	controlRowWidth,
	yearLabelFits,
} from './map-compact-chrome.ts';

const here = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(join(here, '../styles/global.css'), 'utf8');
const view = readFileSync(join(here, '../components/TrajectoryMap.astro'), 'utf8');
const client = readFileSync(join(here, '../components/trajectory-map-client.ts'), 'utf8');
const reader = readFileSync(join(here, './disc-chapter-reader.ts'), 'utf8');

/** compact 段：`data-map-chrome='compact'` 的第一条规则到最后一条 compact 规则。 */
const compactStart = css.indexOf(
	".disc-chapter-map .traj[data-map-chrome='compact'] > .traj-title {",
);
/** 窄屏块结束：compact 规则都在这块里；取块尾作上界。 */
const narrowEnd = css.indexOf('@media (min-width: 48rem) {\n\t.disc-chapters', compactStart);
const compactCss = css.slice(compactStart, narrowEnd > 0 ? narrowEnd : undefined);

/** 一条规则的声明体：选择器串开始到第一个 `}`。 */
function rule(source: string, selector: string): string {
	const at = source.indexOf(selector);
	if (at < 0) return '';
	const open = source.indexOf('{', at);
	const close = source.indexOf('}', open);
	if (open < 0 || close < 0) return '';
	return source.slice(open + 1, close);
}

/** Astro 的 scoped `<style>`（不含 is:global）也照同一口径取规则。 */
function astroRule(selector: string): string {
	return rule(view, selector);
}

describe('compact 几何：地图地板 180、章盒 share ≥48%', () => {
	it('freezes the design numbers in one module', () => {
		assert.equal(COMPACT_MAP_MIN_PX, 180);
		assert.equal(COMPACT_MAP_MIN_SHARE, 0.48);
		assert.equal(COMPACT_BLURB_MAX_EM, 5.6);
		assert.equal(COMPACT_CONTROL_ROWS, 2);
		assert.equal(COMPACT_CONTROL_ROW_PX, 44);
		assert.equal(COMPACT_CONTROL_GAP_PX, 6);
	});

	it('gives the map row real height on 390 and on a 320 short shell', () => {
		/**
		 * 旁白带按内容增高（compact CSS 的真实盒）：
		 * - 390：meta 18 ＋ 城名 33 ＋ en 27 ＋ 介绍带 5.6em@15px = 84 ＋ 两行控件 102 ＋ 内距 3；
		 * - 320（≤359 窄壳）：meta 14 ＋ 城名 22 ＋ en 16 ＋ 介绍带 5.6em@13px = 73 ＋ 两行控件 102 ＋ 内距 5。
		 *   取 232 作**悲观**预算（真实盒约 228–232），share 仍要 ≥0.48。
		 */
		const fixtures = [
			{ id: 'mhjl329', w: 390, h: 844, narr: 265 },
			{ id: 'falp381', w: 390, h: 844, narr: 265 },
			{ id: 'cs6785', w: 390, h: 844, narr: 265 },
			{ id: 'mhjl329', w: 320, h: 568, narr: 232 },
			{ id: 'cs6785', w: 320, h: 568, narr: 232 },
		] as const;
		for (const fixture of fixtures) {
			// 章盒内容高：视口 − 44 题槽 − 32 底栏；舞台再减薄单行题（0.8rem×1.3 ≈ 17 ＋ 间距）。
			const chapter = fixture.h - 44 - 32;
			const stage = chapter - 22;
			const map = compactMapHeight({ stageHeightPx: stage, narrHeightPx: fixture.narr });
			const share = compactMapShare({ chapterHeightPx: chapter, mapHeightPx: map });
			assert.ok(map > 140, `${fixture.id} ${fixture.w}: map ${map} 仍停在 132/140 地板`);
			assert.ok(map >= COMPACT_MAP_MIN_PX, `${fixture.id} ${fixture.w}: map ${map} 低于 180`);
			assert.ok(
				share >= COMPACT_MAP_MIN_SHARE,
				`${fixture.id} ${fixture.w}: share ${share.toFixed(3)} < 0.48`,
			);
		}
		// 地板只在真装不下时才生效，不是常态。
		assert.equal(compactMapHeight({ stageHeightPx: 500, narrHeightPx: 400 }), 180);
		assert.equal(compactMapShare({ chapterHeightPx: 0, mapHeightPx: 200 }), 0);
	});

	it('locks the stage rows so the map cannot collapse into the floor', () => {
		assert.equal(COMPACT_STAGE_ROWS, 'minmax(180px, 1fr) auto');
		// 390：舞台 746 − 旁白 250 = 496 ≥ 180，占章盒 0.616。
		assert.ok(compactMapShare({ chapterHeightPx: 768, mapHeightPx: 496 }) >= 0.48);
		// 320×568：舞台 470 − 旁白 235 = 235 ≥ 180，占章盒 0.478 → 窄壳压字阶后仍要 ≥0.48，
		// 所以窄壳的介绍带／两行控件必须一起收紧（5.6em 与 44 触点不动）。
		const short = compactMapHeight({ stageHeightPx: 470, narrHeightPx: 227 });
		assert.ok(short >= COMPACT_MAP_MIN_PX);
		assert.ok(compactMapShare({ chapterHeightPx: 492, mapHeightPx: short }) >= 0.48);
	});

	it('keeps the compact stage/map CSS aligned with the module', () => {
		// 行分配只有一处业主：TrajectoryMap 的窄屏块（与默认「图 auto／旁白 1fr」同源）。
		// 两处各写一半时，scoped 规则后注入会按同特异度盖掉 global 的 compact 行——
		// PR #184 b765bc2 的 180px 地板就是这个撞法，所以这里既钉行值也钉单一业主。
		assert.equal(
			(css.match(/\[data-map-chrome='compact'\] \.traj-stage \{[^}]*grid-template-rows/g) ?? []).length,
			0,
			'global.css 又写了一份 compact 行分配',
		);
		assert.match(
			view,
			/\.traj\[data-map-chrome='compact'\] \.traj-stage \{\s*grid-template-rows:\s*minmax\(180px, 1fr\) auto;/,
			'TrajectoryMap 窄屏块缺 compact 行分配',
		);
		const stage = rule(css, "[data-map-chrome='compact'] .traj-stage {");
		assert.ok(stage.length > 0, '缺 compact 舞台规则');
		assert.match(stage, /flex:\s*1;/);
		// 地图规则（唯一一条带 height:100% 的 `.traj-map`）。
		const mapRules = compactCss.match(/\[data-map-chrome='compact'\] \.traj-map \{[^}]*\}/g) ?? [];
		const mapRule = mapRules[mapRules.length - 1] ?? '';
		assert.ok(mapRule.length > 0, '缺 compact 地图规则');
		assert.match(mapRule, /height:\s*100%;/);
		assert.match(mapRule, /min-height:\s*180px;/);
		assert.doesNotMatch(compactCss, /min-height:\s*132px/);
	});
});

describe('compact 介绍带：始终 5.6em＋原生内滚，短文只藏滚动条', () => {
	it('caps the blurb at 5.6em and scrolls it natively', () => {
		const blurb = rule(css, "[data-map-chrome='compact'] .traj-blurb {");
		assert.ok(blurb.length > 0, '缺 compact 介绍带规则');
		assert.match(blurb, /max-height:\s*5\.6em;/);
		assert.match(blurb, /overflow-y:\s*auto;/);
		assert.match(blurb, /overscroll-behavior-y:\s*contain;/);
		assert.match(blurb, /scrollbar-gutter:\s*stable;/);
		assert.doesNotMatch(blurb, /line-clamp|display:\s*-webkit-box|overflow:\s*hidden/);
	});

	it('is-short only hides scrollbar chrome and never removes max-height', () => {
		const shortRule = rule(css, "[data-map-chrome='compact'] .traj-blurb.is-short {");
		assert.ok(shortRule.length > 0, '缺 is-short 规则');
		assert.match(shortRule, /overflow-y:\s*hidden;/);
		assert.doesNotMatch(shortRule, /max-height/);
		// 整段 compact 都不许把 max-height 拆掉（demo §11 的鸡生蛋 bug）。
		assert.doesNotMatch(compactCss, /max-height:\s*none/);
		assert.doesNotMatch(compactCss, /-webkit-line-clamp/);
	});

	it('classifies overflow with a 1px rounding allowance', () => {
		assert.equal(blurbOverflows({ scrollHeight: 120, clientHeight: 84 }), true);
		assert.equal(blurbOverflows({ scrollHeight: 84, clientHeight: 84 }), false);
		assert.equal(blurbOverflows({ scrollHeight: 85, clientHeight: 84 }), false);
		assert.equal(blurbOverflows({ scrollHeight: 86, clientHeight: 84 }), true);
	});

	it('keeps the 5.6em band at 320 too (narrowing only touches type scale)', () => {
		// 窄壳（≤359px）只压字阶／行距；max-height 仍是同一 5.6em，不另开一套。
		assert.match(compactCss, /@media \(max-width: 359px\)/);
		assert.equal((compactCss.match(/max-height:\s*5\.6em/g) ?? []).length, 1);
	});
});

describe('compact 控件：有意两行、行内 nowrap、触点 44', () => {
	it('stacks two nowrap rows in the compact CSS', () => {
		const controls = rule(css, "[data-map-chrome='compact'] .traj-controls {");
		assert.match(controls, /flex-direction:\s*column;/);
		assert.match(controls, /gap:\s*6px;/);
		assert.match(controls, /flex-wrap:\s*nowrap;/);
		const row = rule(css, "[data-map-chrome='compact'] .traj-controls-row {");
		assert.match(row, /display:\s*flex;/);
		assert.match(row, /flex-wrap:\s*nowrap;/);
		assert.match(row, /min-height:\s*44px;/);
		const button = rule(css, "[data-map-chrome='compact'] .traj-controls button {");
		assert.match(button, /min-height:\s*44px;/);
		assert.match(button, /min-width:\s*44px;/);
		assert.match(button, /white-space:\s*nowrap;/);
		// 纸色分层：控件永远盖在介绍带之上，不靠透明底压字。
		assert.match(controls, /background:\s*var\(--bg\);/);
		assert.match(controls, /position:\s*relative;/);
		assert.match(controls, /z-index:\s*2;/);
	});

	it('keeps the ‹ › pair together on the transport row', () => {
		const pair = rule(css, "[data-map-chrome='compact'] .traj-controls .traj-nav-pair {");
		assert.match(pair, /flex-wrap:\s*nowrap;/);
		const transport = rule(css, "[data-map-chrome='compact'] .traj-controls-transport {");
		assert.match(transport, /justify-content:\s*space-between;/);
	});

	it('fits both rows at 320 through arithmetic, not by shrinking labels', () => {
		// 320 宽减左年轴 44、壳内距约 10。
		const available = 320 - 44 - 10;
		// 三枚模式钮：12px 字 ＋ 10px 左右内距 ＋ 1px 边×2 ≈ 44px／枚（两字）。
		assert.ok(controlRowFits({ availablePx: available, buttons: [44, 44, 44] }));
		// 运输行：播放／重播（约 64）＋ ‹ ›（44＋44）。
		assert.ok(controlRowFits({ availablePx: available, buttons: [64, 64, 44, 44] }));
		assert.equal(controlRowWidth([44, 44, 44]), 44 * 3 + 6 * 2);
		assert.equal(controlRowFits({ availablePx: 40, buttons: [44, 44] }), false);
	});
});

describe('compact 标记：两行结构、钩子不变、可达标签', () => {
	/** `data-traj-root` 的整段 `<section>`。 */
	const section = (() => {
		const at = view.indexOf('<section');
		const close = view.indexOf('</section>', at);
		return at < 0 || close < 0 ? '' : view.slice(at, close);
	})();

	it('splits the controls into a mode row and a transport row', () => {
		assert.match(section, /class="traj-controls"/);
		const modesAt = section.indexOf('class="traj-controls-row traj-controls-modes"');
		const transportAt = section.indexOf('class="traj-controls-row traj-controls-transport"');
		assert.ok(modesAt > 0, '缺模式行');
		assert.ok(transportAt > modesAt, '运输行必须在模式行之后');
		const modes = section.slice(modesAt, transportAt);
		for (const hook of ['data-traj-guide', 'data-traj-chrono', 'data-traj-explore']) {
			assert.ok(modes.includes(hook), `${hook} 不在模式行`);
		}
		const transport = section.slice(transportAt);
		for (const hook of ['data-traj-play', 'data-traj-replay', 'data-traj-prev', 'data-traj-next']) {
			assert.ok(transport.includes(hook), `${hook} 不在运输行`);
		}
		// 旧选择器一个不丢：客户端只认 data 钩子。
		for (const hook of [
			'data-traj-guide',
			'data-traj-chrono',
			'data-traj-explore',
			'data-traj-play',
			'data-traj-replay',
			'data-traj-prev',
			'data-traj-next',
			'data-traj-blurb',
		]) {
			assert.equal((section.match(new RegExp(hook, 'g')) ?? []).length >= 1, true, hook);
		}
		assert.match(section, /class="traj-nav-pair"/);
	});

	it('labels the two rows by structure, not by a role display:contents would drop', () => {
		// 桌面用 display:contents 把包裹层拆平（不改桌面排版），所以行上不挂
		// role="group"＋aria-label——那个组名会被 a11y 树丢掉，按钮各自有名字。
		assert.doesNotMatch(section, /traj-controls-row[^>]*role="group"/);
		assert.doesNotMatch(section, /traj-controls-row[^>]*aria-label="(模式|运输)"/);
	});

	it('keeps every control reachable without visible text', () => {
		// 站号钮图标化时 aria-label＋title 都要在。
		assert.match(section, /data-traj-prev[^>]*aria-label="上一站"/);
		assert.match(section, /data-traj-prev[^>]*title="上一站"/);
		assert.match(section, /data-traj-next[^>]*aria-label="下一站"/);
		assert.match(section, /data-traj-next[^>]*title="下一站"/);
		// 模式钮：要么有可见文案，要么 aria-label／title 兜底（320 纯图标路径）。
		for (const hook of ['data-traj-guide', 'data-traj-chrono', 'data-traj-explore']) {
			const at = section.indexOf(hook);
			const button = section.slice(section.lastIndexOf('<button', at), section.indexOf('</button>', at));
			const hasText = /<\/button>/.test(button) && />\s*[^<\s][^<]*</.test(button + '>' + button);
			const labelled = /aria-label=/.test(button) || /title=/.test(button);
			assert.ok(hasText || labelled, `${hook} 既无可见文案也无 aria-label／title`);
		}
	});
});

describe('compact 年轴：四位年号整字可读（P2）', () => {
	it('keeps the 44px rail and lets four digits fit', () => {
		assert.match(css, /--disc-year-rail-w:\s*44px;/);
		assert.equal(yearLabelFits({ digits: 4 }), true);
		// 宁可有意缩写（'66）也不许把四位年号裁成残字。
		assert.equal(yearLabelFits({ digits: 4, fontSizePx: 40 }), false);
		const yearY = astroRule('.traj .traj-year-y {');
		assert.ok(yearY.length > 0, '缺 .traj-year-y 规则');
		assert.match(yearY, /white-space:\s*nowrap;/);
		assert.match(yearY, /overflow:\s*visible;/);
	});
});

describe('介绍带手势：未到边只滚字，到边才回舞台的既有路径', () => {
	const base = { overflow: true, atStart: false, atEnd: false, explore: false };

	it('keeps a mid-band swipe inside the blurb', () => {
		assert.equal(blurbGestureOwner({ ...base, dir: 1 }), 'blurb');
		assert.equal(blurbGestureOwner({ ...base, dir: -1 }), 'blurb');
	});

	it('hands the swipe back once the band is at that edge', () => {
		assert.equal(blurbGestureOwner({ ...base, dir: 1, atEnd: true }), 'stage');
		assert.equal(blurbGestureOwner({ ...base, dir: -1, atStart: true }), 'stage');
		// 反向手势不吃另一头：到顶还能往下读。
		assert.equal(blurbGestureOwner({ ...base, dir: 1, atStart: true }), 'blurb');
	});

	it('treats a short blurb as already at the edge', () => {
		assert.equal(blurbGestureOwner({ ...base, overflow: false, dir: 1 }), 'stage');
		assert.equal(blurbGestureOwner({ ...base, overflow: false, dir: -1 }), 'stage');
	});

	it('leaves explore to the map: no station step, no arm', () => {
		assert.equal(blurbGestureOwner({ ...base, dir: 1, atEnd: true, explore: true }), 'blurb');
		assert.equal(blurbGestureOwner({ ...base, overflow: false, dir: 1, explore: true }), 'blurb');
	});
});

describe('介绍带滚动：清旧 arm，不动到边资格', () => {
	/** 已在边松手后的状态：arm 挂着，等下一次同向手势。 */
	function armed(): BoundaryState {
		const begin = reduceBoundary(createBoundaryState({ chapterKey: 'map', epoch: 1 }), {
			type: 'begin',
			gestureId: 1,
			touchId: 1,
			touchCount: 1,
			x: 10,
			y: 300,
		}).state;
		return reduceBoundary(begin, {
			type: 'end',
			gestureId: 1,
			x: 10,
			y: 240,
			touchCount: 1,
			edge: { dir: 1, distance: 0, metric: 'css-px' },
			neighbor: true,
		}).state;
	}

	it('clears the arm while the blurb still has text to scroll', () => {
		const before = armed();
		assert.equal(before.armedDir, 1);
		const after = reduceBoundary(before, { type: 'blurb-scroll', edge: 'content' });
		assert.equal(after.state.armedDir, 0);
		assert.equal(after.state.pendingArrival, null);
		assert.equal(after.effects.commit, 0);
	});

	it('leaves the arm alone at the edge and commits nothing', () => {
		const before = armed();
		const after = reduceBoundary(before, { type: 'blurb-scroll', edge: 'edge' });
		assert.equal(after.state.armedDir, 1);
		assert.equal(after.effects.commit, 0);
	});
});

describe('客户端／阅读器接线', () => {
	it('syncs the blurb overflow class without ever clearing max-height', () => {
		assert.match(client, /function syncBlurbOverflow\(/);
		assert.match(client, /classList\.toggle\(IS_SHORT_CLASS, !overflow\)/);
		// 介绍带永不被 JS 拆封顶（Leaflet 自己的 canvas maxHeight 与本条无关）。
		assert.doesNotMatch(client, /blurbEl\.style\.maxHeight/);
		assert.doesNotMatch(client, /blurbEl\.style\.setProperty\('max-height'/);
		assert.doesNotMatch(client, /blurbEl\.style\.(maxHeight|height)\s*=/);
		assert.match(client, /const IS_SHORT_CLASS = 'is-short'/);
	});

	it('re-invalidates the map on chapter show and on the transition end', () => {
		const show = client.slice(client.indexOf("root.addEventListener('traj:show'"), client.indexOf("root.addEventListener('traj:hold'"));
		assert.match(show, /map\.invalidateSize\(\)/);
		const layout = client.slice(
			client.indexOf("root.addEventListener('traj:stage-layout'"),
			client.indexOf("root.addEventListener('traj:hold'"),
		);
		assert.ok(layout.length > 0, '缺转场结束的尺寸重测');
		assert.match(layout, /map\.invalidateSize\(\)/);
		// 转场结束时壳只喊一次「尺寸变了」，不重画站、不复位镜头。
		assert.doesNotMatch(layout, /frameDiscOnce|paintNarration/);
		assert.match(reader, /new Event\('traj:stage-layout'\)/);
	});

	it('joins the existing show path instead of adding a second arm state machine', () => {
		// 介绍带内滚只清 arm（clear），不新建第二套 FSM／不写 scrollTop。
		assert.match(reader, /'traj:blurb-scroll'/);
		assert.match(reader, /type: 'blurb-scroll'/);
		// 只有一处 reducer 实例：介绍带不新开状态机。
		assert.equal((reader.match(/createBoundaryState\(/g) ?? []).length, 1);
		// 介绍带内滚不靠脚本搬位置：客户端只在换站时把带复位到顶部。
		const scrollWrites = client.match(/blurbEl\.scrollTop\s*=[^=]/g) ?? [];
		assert.equal(scrollWrites.length, 1, '客户端只该在换站时复位介绍带一次');
	});

	it('keeps the blurb gesture off the station step until it is at the edge', () => {
		const touchStart = client.slice(client.indexOf("'touchstart',"), client.indexOf("'touchmove',"));
		assert.match(touchStart, /closest\('\[data-traj-blurb\]'\)/);
		assert.ok(
			touchStart.indexOf("closest('[data-traj-blurb]')") < touchStart.indexOf('bridgeBegin('),
			'介绍带守卫必须在 bridgeBegin 之前',
		);
		assert.match(client, /blurbOwnsGesture\(/);
		assert.match(client, /blurbGestureOwner\(/);
	});
});
