import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const header = readFileSync(join(here, '../components/Header.astro'), 'utf8');
const css = readFileSync(join(here, '../styles/global.css'), 'utf8');

/** 顶栏规则区：`.site-header {` 到 `main {`，碟页壳不在这一段。 */
function headerCss(source: string): string {
	const start = source.indexOf('.site-header {');
	const end = source.indexOf('\nmain {', start);
	return start < 0 || end < 0 ? '' : source.slice(start, end);
}

/** 从 `at` 处规则／媒体查询的 `{` 起，按花括号配平取整块。 */
function block(source: string, at: number): string {
	const open = source.indexOf('{', at);
	if (open < 0) return '';
	let depth = 0;
	for (let i = open; i < source.length; i += 1) {
		const ch = source[i];
		if (ch === '{') depth += 1;
		else if (ch === '}') {
			depth -= 1;
			if (depth === 0) return source.slice(at, i + 1);
		}
	}
	return '';
}

/** 一条声明体：选择器串开始到第一个 `}`。 */
function rule(source: string, selector: string): string {
	const at = source.indexOf(selector);
	if (at < 0) return '';
	const open = source.indexOf('{', at);
	const close = source.indexOf('}', open);
	return open < 0 || close < 0 ? '' : source.slice(open + 1, close);
}

/** 桌面 ≥48rem 专块：`@media (min-width: 48rem)` 的整块。 */
function desktopCss(source: string): string {
	const at = source.indexOf('@media (min-width: 48rem)');
	return at < 0 ? '' : block(source, at);
}

/** 窄屏 #179 块：`@media (max-width: 47.99rem)` 里 `.header-inner` 那条。 */
function narrowCss(source: string): string {
	const at = source.indexOf('@media (max-width: 47.99rem) {\n\t.header-inner {');
	return at < 0 ? '' : block(source, at);
}

describe('桌面顶栏 ≥48rem nowrap 契约：CSS', () => {
	it('顶栏区内有 @media (min-width: 48rem) 专块', () => {
		const head = headerCss(css);
		assert.ok(head.length > 0, '找不到顶栏规则区');
		assert.ok(head.includes('@media (min-width: 48rem)'), '顶栏区缺 ≥48rem 专块');
		assert.ok(desktopCss(head).length > 0, '取不到 ≥48rem 块');
	});

	it('.header-inner 与 .nav 在 ≥48rem 计算契约是 nowrap', () => {
		const desktop = desktopCss(headerCss(css));
		assert.match(rule(desktop, '.header-inner {'), /flex-wrap:\s*nowrap/, '.header-inner 未 nowrap');
		assert.match(rule(desktop, '\t.nav {'), /flex-wrap:\s*nowrap/, '桌面 .nav 未 nowrap');
		// 中槽推动容器仍是那个可压缩的一层，别在不该动的地方加宽度。
		assert.doesNotMatch(rule(desktop, '.nav-scroll {'), /overflow-x/, '桌面默认不得开横滑');
	});

	it('牌／配色 shrink-0，配色仍在 nav 外', () => {
		const desktop = desktopCss(headerCss(css));
		assert.match(rule(desktop, '.brand {'), /flex:\s*0\s+0\s+auto|flex-shrink:\s*0/, '.brand 未 shrink-0');
		assert.match(
			rule(desktop, '.theme-toggle {'),
			/flex:\s*0\s+0\s+auto|flex-shrink:\s*0/,
			'.theme-toggle 未 shrink-0',
		);
		const nav = header.slice(header.indexOf('<nav'), header.indexOf('</nav>'));
		assert.doesNotMatch(nav, /theme-toggle/, '配色不得塞回 nav');
	});

	it('桌面默认不启横滑／淡边（无溢出证据前）', () => {
		const desktop = desktopCss(headerCss(css));
		assert.doesNotMatch(desktop, /overflow-x/, '桌面块默认不得出现 overflow-x');
		assert.doesNotMatch(desktop, /\.nav-fade\s*\{/, '桌面块默认不得打开淡边');
		assert.doesNotMatch(desktop, /display:\s*(?:block|inline)/, '桌面块不应改淡边可见性');
	});

	it('窄屏 #179 块一字不改：仍 nowrap＋横滑', () => {
		const narrow = narrowCss(css);
		assert.ok(narrow.length > 0, '缺窄屏 #179 块');
		assert.match(rule(narrow, '.header-inner {'), /flex-wrap:\s*nowrap/);
		assert.match(rule(narrow, '.header-inner {'), /padding-block:\s*2px/);
		assert.match(rule(narrow, '.header-inner {'), /min-height:\s*44px/);
		assert.match(rule(narrow, '.nav-scroll .nav {'), /flex-wrap:\s*nowrap/);
		assert.match(rule(narrow, '.nav-scroll .nav {'), /overflow-x:\s*auto/);
		assert.match(rule(narrow, '.theme-toggle {'), /flex:\s*0 0 auto/);
		// ≥48rem 块必须排在窄屏块之外，不许并进去把它搅乱。
		const head = headerCss(css);
		assert.ok(head.indexOf('@media (min-width: 48rem)') > head.indexOf('@media (max-width: 47.99rem)'));
	});

	it('断点只用既有 48rem：不另造 640／641', () => {
		const head = headerCss(css);
		const media = head.match(/@media[^{]+/g) ?? [];
		assert.ok(media.length > 0);
		for (const m of media) {
			assert.doesNotMatch(m, /\b6[34]\d(?:\.\d+)?px/, `另造断点：${m.trim()}`);
			assert.match(m, /47\.99rem|48rem|prefers-reduced-motion|prefers-color-scheme/);
		}
		assert.doesNotMatch(head, /\b6[34]\d(?:\.\d+)?px/);
	});

	it('不碰碟页／notes：顶栏区无 --disc-* 与碟页选择器', () => {
		const head = headerCss(css);
		assert.doesNotMatch(head, /--disc-/);
		assert.doesNotMatch(head, /\.split-|\.record-|detail-display|settled-/);
		assert.match(css, /--disc-settled-h:\s*44px/, '碟页壳 44px 契约不得被动到');
	});
});
