/**
 * 航向行契约（PRD `/home/box/web-layout/prd-bearing-heading.md` §4）。
 *
 * 只钉文案与时机口径；真机飞行抓帧由布局验收做。
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import {
	type FlightBearingPhase,
	bearingHeading,
	shouldHoldCardOutDuringFlight,
	shouldShowFlightBearing,
} from './map-bearing.ts';

const here = dirname(fileURLToPath(import.meta.url));
const view = readFileSync(join(here, '../components/TrajectoryMap.astro'), 'utf8');
const css = readFileSync(join(here, '../styles/global.css'), 'utf8');
const client = readFileSync(join(here, '../components/trajectory-map-client.ts'), 'utf8');

/** 取一条规则（选择器串开始到第一个 `}`）。 */
function rule(source: string, selector: string): string {
	const at = source.indexOf(selector);
	if (at < 0) return '';
	const open = source.indexOf('{', at);
	const close = source.indexOf('}', open);
	if (open < 0 || close < 0) return '';
	return source.slice(open + 1, close);
}

describe('航向行文案：航向 → {目的站中文名}', () => {
	it('writes the signed-off sentence with a real arrow', () => {
		assert.equal(bearingHeading('多伦多'), '航向 → 多伦多');
		assert.equal(bearingHeading('莱比锡'), '航向 → 莱比锡');
		assert.equal(bearingHeading('  爱森纳赫 '), '航向 → 爱森纳赫');
	});

	it('never emits an ASCII arrow', () => {
		for (const city of ['多伦多', '莱比锡', '旧金山']) {
			const text = bearingHeading(city);
			assert.doesNotMatch(text, /->/);
			assert.match(text, /→/);
			assert.ok(text.startsWith('航向 → '));
		}
	});

	it('never substitutes an ocean name for the destination', () => {
		// 海域名是地图／诗意层；航向行只写目的地。
		assert.doesNotMatch(bearingHeading('多伦多'), /大西洋|太平洋|印度洋|北冰洋/);
		assert.doesNotMatch(bearingHeading('旧金山'), /大西洋|太平洋|印度洋|北冰洋/);
	});
});

describe('航向行时机：整段飞行都显示，飞行中不加 is-out', () => {
	it('shows the bearing for the whole flight only', () => {
		assert.equal(shouldShowFlightBearing('in-flight'), true);
		assert.equal(shouldShowFlightBearing('idle'), false);
		assert.equal(shouldShowFlightBearing('settled'), false);
	});

	it('never fades the card out while still flying', () => {
		assert.equal(shouldHoldCardOutDuringFlight('in-flight'), false);
		assert.equal(shouldHoldCardOutDuringFlight('idle'), false);
		// 落稳换站卡淡入是既有行为，允许。
		assert.equal(shouldHoldCardOutDuringFlight('settled'), true);
	});

	it('covers every phase of the union', () => {
		const phases: FlightBearingPhase[] = ['idle', 'in-flight', 'settled'];
		for (const phase of phases) {
			assert.equal(typeof shouldShowFlightBearing(phase), 'boolean');
			assert.equal(typeof shouldHoldCardOutDuringFlight(phase), 'boolean');
		}
	});
});

/** sRGB ★ WCAG 相对亮度。 */
function lin(channel: number): number {
	const c = channel / 255;
	return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function contrast(a: readonly [number, number, number], b: readonly [number, number, number]): number {
	const lum = ([r, g, bl]: readonly [number, number, number]) =>
		0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(bl);
	const hi = Math.max(lum(a), lum(b));
	const lo = Math.min(lum(a), lum(b));
	return (hi + 0.05) / (lo + 0.05);
}

describe('航向行 typography 源码闸', () => {
	it('clears 4.5:1 on the production paper with station ink', () => {
		// 生产纸 #f5f1e8，站文墨 #3a352e：PRD 记 10.78:1。
		const ratio = contrast([0x3a, 0x35, 0x2e], [0xf5, 0xf1, 0xe8]);
		assert.ok(ratio >= 4.5, `对比 ${ratio.toFixed(2)} < 4.5`);
		assert.ok(ratio >= 10.5, `对比 ${ratio.toFixed(2)} 低于 PRD 签定口径`);
	});

	it('uses station ink and zero tracking instead of the muted annotation look', () => {
		const bearing = rule(view, '.traj-bearing {\n');
		assert.notEqual(bearing, '');
		assert.match(bearing, /color:\s*#3a352e/);
		assert.match(bearing, /letter-spacing:\s*0;/);
		assert.doesNotMatch(bearing, /letter-spacing:\s*0\.12em/);
		assert.doesNotMatch(bearing, /--traj-muted/);
		// 默认字阶（含 390 compact）：与介绍窗同级 15px／1.75。
		assert.match(bearing, /font-size:\s*15px/);
		assert.match(bearing, /line-height:\s*1\.75/);
	});

	it('never hides the bearing line with paper ink, opacity or visibility', () => {
		// 飞行未结束时不得把航向行藏成空槽：航向行自己不写 hidden／透明／纸色规则。
		for (const block of view.match(/\.traj-bearing[^{]*\{[^}]*\}/g) ?? []) {
			assert.doesNotMatch(block, /opacity:\s*0/, block);
			assert.doesNotMatch(block, /visibility:\s*hidden/, block);
			assert.doesNotMatch(block, /color:\s*(var\(--bg|#f5f1e8)/, block);
		}
		assert.doesNotMatch(view, /\.traj-card\.is-out \.traj-bearing/);
		// is-out 只是落稳换卡的既有淡出，不是给航向行用的藏法。
		const outRule = rule(view, '.traj-card.is-out {');
		assert.match(outRule, /opacity:\s*0/);
		assert.doesNotMatch(outRule, /traj-bearing/);
	});

	it('leaves the split, the stage rows and the share arithmetic untouched', () => {
		// 航向行只是旁白卡里的一行：不新增分割／share 变量，不改 grid 行分配。
		assert.doesNotMatch(css, /--traj-bearing/);
		assert.doesNotMatch(view, /--traj-bearing/);
		assert.match(
			view,
			/\.traj\[data-map-chrome='compact'\] \.traj-stage \{\s*grid-template-rows: minmax\(180px, 1fr\) min\(var\(--traj-narr-h\), 46%\);/,
		);
		// 飞行中旁白带里只剩航向行：题头／站文／en／timeNote／介绍窗都藏起。
		const inFlight = rule(view, '.traj-card.is-bearing .traj-meta,');
		assert.match(view, /\.traj-card\.is-bearing \.traj-time-note,/);
		assert.match(view, /\.traj-card\.is-bearing \.traj-blurb \{\s*display: none;/);
		assert.notEqual(inFlight, '');
	});

	it('drops to 13px／1.65 on the 320 narrow shell, in the same block as the blurb', () => {
		const narrowAt = css.indexOf("@media (max-width: 359px)", css.indexOf("data-map-chrome='compact'"));
		assert.ok(narrowAt > 0);
		const narrow = css.slice(narrowAt, css.indexOf('@media', narrowAt + 10));
		const bearing = rule(narrow, ".traj[data-map-chrome='compact'] .traj-bearing {");
		assert.notEqual(bearing, '', '窄壳块里没有航向行字阶');
		assert.match(bearing, /font-size:\s*13px/);
		assert.match(bearing, /line-height:\s*1\.65/);
		assert.match(bearing, /letter-spacing:\s*0;/);
		assert.match(rule(narrow, ".traj[data-map-chrome='compact'] .traj-blurb {"), /font-size:\s*13px/);
	});
});

/** 一个顶层函数的体（到下一个同行缩进的 `function ` 为止）。 */
function fnBody(source: string, header: string): string {
	const at = source.indexOf(header);
	if (at < 0) return '';
	const next = source.indexOf('\n\tfunction ', at + header.length - 'function '.length);
	return source.slice(at, next > at ? next : undefined);
}

/** `await animate(...)` 的回调体：从箭头函数开括号到同一缩进的 `});`。 */
function cruiseCallback(fly: string): string {
	const at = fly.indexOf('await animate');
	if (at < 0) return '';
	const open = fly.indexOf('{', at);
	const close = fly.indexOf('\n\t\t\t});', open);
	if (open < 0 || close < 0) return '';
	return fly.slice(open, close);
}

describe('航向行接线源码闸', () => {
	const fly = client.slice(
		client.indexOf('async function flyTo'),
		client.indexOf('async function playFrom'),
	);

	it('writes the destination city, never an ocean phrase', () => {
		assert.match(fly, /showBearing\(bearingHeading\(place\.cityZh\)\)/);
		assert.doesNotMatch(fly, /showBearing\(oceanLegPhrase/);
		assert.doesNotMatch(fly, /oceanPhraseVisible/);
	});

	it('shows the bearing before the cruise starts and keeps it through the whole flight', () => {
		const showAt = fly.indexOf('showBearing(bearingHeading(place.cityZh))');
		const cruiseAt = fly.indexOf('await animate');
		assert.ok(showAt > 0 && cruiseAt > showAt, '航向行要在 test animate 起飞前就显示');
		// 飞行动画回调里不得中途清航向、不得给卡片加 is-out。
		const cruise = cruiseCallback(fly);
		assert.notEqual(cruise, '');
		assert.doesNotMatch(cruise, /clearBearing/);
		assert.doesNotMatch(cruise, /is-out/);
		assert.doesNotMatch(fly, /classList\.add\('is-out'\)/);
	});

	it('keeps the line until the flight ends, then clears it and fades the next card in', () => {
		const cruiseAt = fly.indexOf('await animate');
		const cruise = fly.slice(cruiseAt, fly.indexOf('});', cruiseAt));
		// 巡航段本身不许清航向、不许加 is-out。
		assert.doesNotMatch(cruise, /clearBearing|is-out/);
		// 收尾（finally）才清航向：取消／abort／异常同样走这里，不留脏状态。
		const tail = fly.slice(fly.indexOf('} finally {'));
		assert.ok(tail.indexOf('clearBearing()') >= 0, '落稳／取消后没清航向行');
		// is-out 只在落稳（settled）放行：飞行中永远到不了这一支。
		assert.match(tail, /phase = landed \? 'settled' : 'idle'/);
		assert.match(
			tail,
			/if \(landed && token === playToken && shouldHoldCardOutDuringFlight\(phase\)\) \{\s*fadeOut\(\);\s*clearBearing\(\);/,
		);
		// 落稳的 paintNarration 一进来就清航向并恢复题头／站文。
		assert.match(fnBody(client, 'function paintNarration('), /clearBearing\(\)/);
		assert.match(fnBody(client, 'function hold(): void'), /clearBearing\(\)/);
	});
});
