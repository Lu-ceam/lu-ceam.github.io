/**
 * 碟页地图章 P2 收口（簇标签／unknown timeNote／探索退出芯片／320 dock／固定分割）。
 *
 * 这里钉的是源码与纯函数口径，对应 PRD PASS 里能在没有真机的情况下核对的部分。
 * 真触摸／真滚轮的三条（短文扫即换站且页不动、长文滚到底不换站、松手后再扫才换站）
 * 仍要布局 QA 用真输入复验；本文件只钉生产把它们接在现有导览锁和到边二次确认上。
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import { DOCK_CHIP_BORDER_TEXT_MIX, DOCK_INSET_X_NARROW_PX, DOCK_RADIUS_NARROW_PX } from './map-dock.ts';
import { COMPACT_NARR_H_NARROW, COMPACT_STAGE_ROWS, blurbOverflows } from './map-compact-chrome.ts';
import { axisClusterAriaLabel, formatAxisSub } from './trajectory-axis.ts';

const here = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(join(here, '../styles/global.css'), 'utf8');
const view = readFileSync(join(here, '../components/TrajectoryMap.astro'), 'utf8');
const client = readFileSync(join(here, '../components/trajectory-map-client.ts'), 'utf8');

const compactStart = css.indexOf(".disc-chapter-map .traj[data-map-chrome='compact'] > .traj-title {");
const narrowEnd = css.indexOf('@media (min-width: 48rem) {\n\t.disc-chapters', compactStart);
const compactCss = css.slice(compactStart, narrowEnd > 0 ? narrowEnd : undefined);

function lin(channel: number): number {
	const c = channel / 255;
	return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function contrast(a: readonly [number, number, number], b: readonly [number, number, number]): number {
	const lum = (rgb: readonly [number, number, number]) => 0.2126 * lin(rgb[0]) + 0.7152 * lin(rgb[1]) + 0.0722 * lin(rgb[2]);
	const hi = Math.max(lum(a), lum(b));
	const lo = Math.min(lum(a), lum(b));
	return (hi + 0.05) / (lo + 0.05);
}

function mix(weight: number, ink: readonly [number, number, number], paper: readonly [number, number, number]): [number, number, number] {
	return [
		Math.round(ink[0] * weight + paper[0] * (1 - weight)),
		Math.round(ink[1] * weight + paper[1] * (1 - weight)),
		Math.round(ink[2] * weight + paper[2] * (1 - weight)),
	];
}

describe('P2 簇标签：「1981 · 2站」，读屏不粘字', () => {
	it('puts a visually hidden separator between the year and the station count', () => {
		assert.match(view, /<span class="traj-year-y">\{label\.main\}<\/span>/);
		assert.match(view, /<span class="vh"> · <\/span>/);
		assert.match(view, /formatAxisSub\(label\.sub\)/);
		assert.match(view, /axisClusterAriaLabel\(target, yearsById, citiesById\)/);
		assert.match(view, /\.traj \.vh \{[^}]*clip:\s*rect\(0,\s*0,\s*0,\s*0\)/);
		assert.match(view, /\.traj \.traj-year-sub \{[^}]*margin-top:\s*2px;/);
		assert.match(view, /\.traj \.traj-year-sub \{[^}]*color:\s*var\(--traj-minor/);
		assert.match(client, /separator\.textContent = ' · ';/);
		assert.equal(formatAxisSub('2站'), '2站');
		assert.equal(formatAxisSub('100站'), '99+站');
	});

	it('builds the accessible name the screen reader actually speaks', () => {
		const name = axisClusterAriaLabel(
			{ members: ['ny', 'nl'], firstYear: 1981, lastYear: 1982 },
			new Map([
				['ny', 1981],
				['nl', 1982],
			]),
			new Map([
				['ny', '纽约'],
				['nl', '荷兰'],
			]),
		);
		assert.equal(name, '1981–1982 年，2 站：纽约、荷兰。展开站表');
		assert.match(name, /2 站/);
		assert.doesNotMatch(name, /19812站/);
	});
});

describe('P2 unknown timeNote：英文城名下，读屏听得到', () => {
	it('renders the note only for unknown stations, between the English name and the blurb', () => {
		const card = view.slice(view.indexOf('{first.city}'), view.indexOf('data-traj-bearing'));
		assert.match(card, /data-traj-time-note/);
		assert.match(card, /class="vh">时间说明：<\/span>/);
		assert.ok(card.indexOf('data-traj-time-note') < card.indexOf('data-traj-blurb'));
		assert.match(card, /class="ring" aria-hidden="true"/);
		assert.match(view, /aria-describedby=\{firstTimeNote \? `tn-\$\{first\.id\}` : undefined\}/);
		assert.match(view, /first\.timeStatus === 'unknown' && first\.timeNote/);
		assert.match(view, /\.traj-time-note \{[^}]*font-size:\s*12px;/);
		assert.match(view, /\.traj-time-note \{[^}]*color:\s*var\(--traj-minor/);
		assert.match(view, /\.traj-time-note \.ring \{[^}]*border:\s*1\.2px dashed var\(--traj-accent\)/);
		assert.doesNotMatch(view, /\.traj-time-note \{[^}]*font-style:\s*italic/);
		assert.doesNotMatch(view, /\.traj-time-note \{[^}]*background:/);
		assert.match(client, /function syncTimeNote\(/);
		assert.match(client, /data-traj-time-note/);
		assert.match(client, /aria-describedby/);
		assert.match(client, /hidden\.textContent = '时间说明：';/);
	});
});

describe('P2 探索退出芯片与 320 dock', () => {
	it('keeps the exit key as 探索× and does not fade the dock', () => {
		assert.match(view, /aria-label=\{mode === 'overview' \? '退出探索，回到导播' : '探索'\}/);
		assert.match(view, /<span class="traj-controls-label">探索<\/span>/);
		assert.match(view, /<span class="x" aria-hidden="true">×<\/span>/);
		assert.doesNotMatch(view, />回到导播</);
		assert.match(client, /退出探索，回到导播/);
		assert.match(client, /exploreLabel\.textContent = '探索'/);
		assert.match(client, /mark\.textContent = '×'/);
		assert.match(client, /removeAttribute\('title'\)/);
		assert.doesNotMatch(client, /\.title\s*=/);
		assert.doesNotMatch(compactCss, /opacity:\s*0\.72/);
		assert.match(compactCss, /\[data-traj-view='explore'\][\s\S]*button:not\(\[data-traj-explore\]\) \{[^}]*color:\s*var\(--traj-minor/);
		assert.match(compactCss, /button\[data-traj-explore\]::after \{[^}]*color-mix\(in srgb, var\(--line\) 35%, var\(--traj-accent/);
		assert.match(compactCss, /button\[aria-pressed='true'\]::after \{[^}]*opacity:\s*1;/);
		assert.doesNotMatch(compactCss, /button\[aria-pressed='true'\] \{[^}]*background:\s*var\(--text\)/);
		assert.doesNotMatch(compactCss, /backdrop-filter/);
	});

	it('gives the neutral chip border at least 3:1 on the paper chip', () => {
		assert.equal(DOCK_CHIP_BORDER_TEXT_MIX, 0.45);
		const text = [33, 30, 26] as const;
		const line = [221, 212, 198] as const;
		const bg = [243, 240, 232] as const;
		const border = mix(DOCK_CHIP_BORDER_TEXT_MIX, text, line);
		const ratio = contrast(border, bg);
		assert.ok(ratio >= 3, `中性边对比 ${ratio.toFixed(2)} < 3`);
		// 收妥态把 --bg 收成 #f5f1e8，芯片和 dock 同纸，边必须仍 ≥3:1。
		const reading = contrast(border, [245, 241, 232]);
		assert.ok(reading >= 3, `收妥纸上的中性边对比 ${reading.toFixed(2)} < 3`);
		// 旧 15% 混色不够 3:1，这条用来卡住回退。
		assert.ok(contrast(mix(0.15, text, line), bg) < 3);
		assert.match(css, /--dock-chip-border:\s*color-mix\(in srgb, var\(--text\) 45%, var\(--line\)\)/);
		assert.match(compactCss, /box-shadow:\s*var\(--dock-chip-shadow\)/);
		assert.match(css, /--dock-chip-shadow:\s*0 1px 4px color-mix\(in srgb, var\(--text\) 8%, transparent\)/);
	});

	it('makes the 320 dock a 14px capsule with seven 36px keys and a 36×44 exit hit area', () => {
		assert.equal(DOCK_RADIUS_NARROW_PX, 14);
		assert.equal(DOCK_INSET_X_NARROW_PX, 3);
		const narrow = compactCss.slice(compactCss.indexOf('@media (max-width: 359px)'));
		assert.match(narrow, /--dock-inset-x:\s*3px;/);
		assert.match(narrow, /--dock-inset-y:\s*8px;/);
		assert.match(narrow, /--dock-touch:\s*36px;/);
		assert.match(narrow, /border-radius:\s*14px;/);
		assert.match(narrow, /overflow:\s*visible;/);
		assert.match(narrow, /width:\s*36px;/);
		assert.match(narrow, /height:\s*36px;/);
		assert.match(narrow, /letter-spacing:\s*0;/);
		assert.doesNotMatch(narrow, /letter-spacing:\s*-0\.02em/);
		assert.doesNotMatch(narrow, /border-radius:\s*0 0 6px 6px/);
		assert.match(narrow, /button\[data-traj-explore\]::before \{[^}]*top:\s*-4px;[^}]*bottom:\s*-4px;/);
		// 390 仍是胶囊，不把 14px 写进基础档。
		const dock = compactCss.slice(compactCss.indexOf('[data-traj-dock] {'), compactCss.indexOf('@media (min-width: 360px)'));
		assert.match(dock, /border-radius:\s*999px;/);
	});
});

describe('P2 固定分割与介绍窗手势', () => {
	it('pins the narr row and refuses a content-sized track', () => {
		assert.equal(COMPACT_STAGE_ROWS, 'minmax(180px, 1fr) min(var(--traj-narr-h), 46%)');
		assert.equal(COMPACT_NARR_H_NARROW, 'calc(54px + 4.4 * 1.65 * 13px)');
		assert.match(view, /grid-template-rows:\s*minmax\(180px, 1fr\) min\(var\(--traj-narr-h\), 46%\)/);
		assert.match(view, /--traj-narr-h:\s*calc\(54px \+ 4\.4 \* 1\.65 \* 13px\)/);
		// 390×844：舞台 728.2、上沿 64.61，201.2px 把地图锁在 525、分界 589.6。
		assert.match(view, /--traj-narr-h:\s*201\.2px/);
		assert.doesNotMatch(view, /fit-content\(/);
		assert.doesNotMatch(view, /data-map-chrome='compact'\] \.traj-stage \{[^}]*\bauto\b/);
		assert.match(compactCss, /scrollbar-gutter:\s*auto;/);
		assert.doesNotMatch(compactCss, /scrollbar-gutter:\s*stable/);
		assert.doesNotMatch(compactCss, /-webkit-line-clamp|line-clamp/);
		assert.match(compactCss, /mask-image:\s*linear-gradient\(to bottom, #000 0, #000 calc\(100% - 0\.5lh\), transparent 100%\)/);
	});

	it('adds is-scrollable only past the 1px rounding allowance', () => {
		assert.equal(blurbOverflows({ scrollHeight: 85, clientHeight: 84 }), false);
		assert.equal(blurbOverflows({ scrollHeight: 86, clientHeight: 84 }), true);
		assert.match(client, /classList\.toggle\(IS_SCROLLABLE_CLASS, overflow\)/);
		assert.match(client, /blurbEl\.tabIndex = 0/);
		assert.match(client, /站介绍，可滚动/);
		assert.match(client, /blurbEl\.removeAttribute\('tabindex'\)/);
		assert.match(compactCss, /\.traj-blurb\.is-scrollable \{[^}]*touch-action:\s*pan-y;/);
		assert.match(compactCss, /\.traj-blurb \{[^}]*touch-action:\s*none;/);
	});

	it('swallows the gesture that reaches the blurb edge and steps on the next one', () => {
		assert.match(client, /let wheelBlurbConsumed = false;/);
		assert.match(client, /wheelBlurbConsumed = true;/);
		assert.match(client, /if \(wheelBlurbConsumed\) \{[^}]*preventDefault\(\)/);
		// 触摸仍走既有「带内滚过就撤桥、松手后下一次才换站」，不另起一套状态机。
		assert.match(client, /const scrolledBand = blurbConsumed \|\| blurbMovedInGesture;/);
		assert.match(client, /if \(scrolledBand\) \{[^}]*bridgeCancel\(\)/);
		assert.match(client, /function syncBlurbFade\(/);
	});
});
