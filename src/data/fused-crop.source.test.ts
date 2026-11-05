/**
 * fused crop 的源测：窄屏唱片章「同图融合裁窗」不能再被做成白垫贴纸。
 *
 * #175 FAIL 的三条视觉证据（`/workspace/runway-175-rerun/`）：
 * - 02-mid-scrub：mid 外层被洗成空纸（旧 `(1-t)²` 到 0.5 只剩 0.25）；
 * - 03-settled-edge / edge-settled-bot：窗缘一圈 0.45rem `--bg` 奶油 halo ＋ 大 drop，
 *   外层 settled 归零 → plate 像贴在奶油纸上的贴纸，不是同一张图。
 *
 * 所以这里锁 CSS 归属与阅读器取证方式，避免回归。
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const here = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(join(here, '../styles/global.css'), 'utf8');
const reader = readFileSync(join(here, './disc-chapter-reader.ts'), 'utf8');
const astro = readFileSync(join(here, '../pages/records/[id].astro'), 'utf8');

/**
 * 取某条规则的规则体：选择器可以出现在分组里，所以取**含 `must` 的那条**
 * （同名的空壳初态规则在前，真装饰在后）。
 */
function ruleBody(source: string, selector: string, must: RegExp): string {
	let at = source.indexOf(selector);
	while (at >= 0) {
		const open = source.indexOf('{', at);
		const close = source.indexOf('}', open);
		if (open < 0 || close <= open) break;
		const body = source.slice(open + 1, close);
		if (must.test(body)) return body;
		at = source.indexOf(selector, close);
	}
	assert.fail(`找不到含 ${must} 的规则 ${selector}`);
}

/** 所有 box-shadow 值里的 blur（第三个长度）；只给两段＝spread。 */
function shadowBlurs(value: string): number[] {
	const blurs: number[] = [];
	for (const layer of value.split(/,(?![^(]*\))/)) {
		const lengths = layer.match(/-?\d*\.?\d+(?:px|rem)/g) ?? [];
		const px = lengths.map((len) =>
			len.endsWith('rem') ? parseFloat(len) * 16 : parseFloat(len),
		);
		// 0 0 0 1.5px → 三段偏移+spread，无 blur；0 10px 28px → 第三段是 blur。
		if (px.length >= 3) blurs.push(Math.abs(px[2] ?? 0));
		else blurs.push(0);
	}
	return blurs;
}

describe('窄屏唱片章裁窗（源测）', () => {
	it('defines the narrow-screen crop window in global.css only, without halo or drop', () => {
		const body = ruleBody(css, '.disc-record-cover-frame > .crop-window {', /box-shadow/);
		assert.match(body, /background:\s*transparent/, '窗底必须透明，否则读成白垫');
		assert.doesNotMatch(body, /0\.45rem/, '不许再留 0.45rem 奶油 halo');
		assert.doesNotMatch(body, /var\(--bg\)/, '窗缘不许混 --bg（那就是 halo）');
		const shadows = /box-shadow:\s*([^;]+);/.exec(body)?.[1] ?? '';
		assert.ok(shadows.length > 0, '窗缘仍要有砖描边');
		const blurs = shadowBlurs(shadows);
		assert.ok(
			blurs.every((blur) => blur <= 2),
			`窗缘不许带 drop（blur ${blurs.join('/')} > 2px）`,
		);
		// 描边 ≤ 2px：只看 0 0 0 Xpx 那层。
		const stroke = /0\s+0\s+0\s+(\d*\.?\d+)px/.exec(shadows);
		assert.ok(stroke, '窗缘应有 0 0 0 <px> 硬描边');
		assert.ok(parseFloat(stroke[1] ?? '0') <= 2, `描边 ${stroke[1]}px > 2px`);
	});

	it('drops the card shadow from the settled cover image', () => {
		const body = ruleBody(css, '.disc-record-cover-img {', /object-fit/);
		assert.doesNotMatch(body, /0\s+10px\s+30px/, 'settled plate 不许留 0 10px 30px 卡影');
		assert.match(body, /box-shadow:\s*none/, '卡影整个去掉，别只手调数值');
	});

	it('never hides the settled outer upright (淡衬要透出来)', () => {
		// 阅读器只按 opacity 写，并且不许在 settled 写 visibility:hidden。
		assert.match(reader, /face\.outer\.style\.opacity\s*=/);
		assert.doesNotMatch(
			reader,
			/outer\.style\.visibility\s*=\s*['"]hidden['"]/,
			'外层 upright 不许被 visibility:hidden 关掉',
		);
		// CSS 里唯一的 opacity:0/visibility:hidden 只能是「JS 还没落第一帧」的初态；
		// 只要不给 settled（is-plate／[data-settled]）写隐藏就行。
		// 只看窄屏唱片章（`.disc-record-cover-frame`）：桌面 split 的 .is-plate 不动。
		for (const match of css.matchAll(/([^{}]*\.upright-outer[^{}]*)\{([^}]*)\}/g)) {
			const [, selector = '', body = ''] = match;
			if (!selector.includes('.disc-record-cover-frame')) continue;
			if (!/visibility:\s*hidden/.test(body)) continue;
			assert.doesNotMatch(
				selector,
				/is-plate|settled|data-motion='ok'/,
				`settled 外层不许 visibility:hidden：${selector.trim()}`,
			);
		}
	});

	it('measures note heights instead of guessing 48/56', () => {
		assert.match(reader, /getBoundingClientRect\(\)/, '真高必须实测');
		assert.doesNotMatch(reader, /\[\s*48\s*,\s*56\s*\]/, '禁魔法估高 [48, 56]');
	});

	it('writes the shed hooks so reduced notes are off-screen and announced', () => {
		assert.match(reader, /dataset\.shed\s*=\s*'1'/);
		// 减载条不画肘线：纸上不许留指不到字的折线。
		assert.match(css, /\.mark-leader\[data-shed='1'\]/);
		assert.match(reader, /dataset\.notesShed\s*=/);
		assert.match(reader, /aria-hidden/);
	});

	it('passes every mark box and plate height into badgeCenter so the badge can dodge', () => {
		const calls = astro.match(/badgeCenter\([^)]*\)/g) ?? [];
		assert.ok(calls.length >= 3, `badgeCenter 调用应有三处，实得 ${calls.length}`);
		for (const call of calls) {
			assert.match(call, /,\s*[\w.]+\s*,\s*[\w.]+\)$/, `调用缺 marks／plateHeight：${call}`);
		}
	});
});
