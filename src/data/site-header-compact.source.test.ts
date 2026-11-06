import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const header = readFileSync(join(here, '../components/Header.astro'), 'utf8');
const css = readFileSync(join(here, '../styles/global.css'), 'utf8');

const LABELS = ['首页', '文章', '标签', '唱片', '搜索', '关于'];

/** `<nav …>` 到配对 `</nav>` 的整段。 */
function navMarkup(source: string): string {
	const open = source.indexOf('<nav');
	const close = source.indexOf('</nav>', open);
	return open < 0 || close < 0 ? '' : source.slice(open, close);
}

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

/** 窄屏 running head 块：`@media (max-width: 47.99rem)` 里 `.header-inner` 那条。 */
function narrowCss(source: string): string {
	const at = source.indexOf('@media (max-width: 47.99rem) {\n\t.header-inner {');
	return at < 0 ? '' : block(source, at);
}

/** 一条声明体：选择器串开始到第一个 `}`。 */
function rule(source: string, selector: string): string {
	const at = source.indexOf(selector);
	if (at < 0) return '';
	const open = source.indexOf('{', at);
	const close = source.indexOf('}', open);
	return open < 0 || close < 0 ? '' : source.slice(open + 1, close);
}

describe('顶栏窄屏 running head：DOM 契约', () => {
	it('配色移出 nav，nav 包进 .nav-scroll（配色不随横滑滚走）', () => {
		const nav = navMarkup(header);
		assert.ok(nav.length > 0, '找不 <nav>');
		assert.doesNotMatch(nav, /theme-toggle/, '配色按钮仍在 nav 内');
		assert.equal(header.includes('id="theme-toggle"'), true, '#theme-toggle id 必须保留');

		const scrollAt = header.indexOf('class="nav-scroll"');
		const navAt = header.indexOf('<nav');
		const buttonAt = header.indexOf('id="theme-toggle"');
		assert.ok(scrollAt > 0, '缺 .nav-scroll 包裹层');
		assert.ok(scrollAt < navAt, '.nav-scroll 必须包住 nav');
		assert.ok(buttonAt > header.indexOf('</nav>'), '配色按钮必须是 header-inner 末子');
		// 淡边是同层装饰，不进 nav（否则会被一起滚走）。
		assert.match(header, /nav-fade nav-fade--start/);
		assert.match(header, /nav-fade nav-fade--end/);
	});

	it('6 链标签不变，无汉堡／抽屉／notes 入口', () => {
		const nav = navMarkup(header);
		// 标签在 frontmatter 的 links 里，nav 只渲 link.label——两处合起来验。
		const linksBlock = header.slice(header.indexOf('const links = ['), header.indexOf('];', header.indexOf('const links = [')));
		const rendered = linksBlock.match(/label:\s*'([^']+)'/g)?.map((m) => m.replace(/label:\s*'/, '').replace(/'$/, ''));
		assert.deepEqual(rendered, LABELS);
		assert.match(nav, /\{link\.label\}/);
		assert.match(header, /href: '\/records\/'/);
		assert.match(nav, /aria-label="站点"/);
		assert.match(nav, /inSection\(link\.href\)/);
		assert.doesNotMatch(header, /notes\//, '不得新增 /notes/ 入口');
		assert.doesNotMatch(
			header,
			/汉堡|抽屉|drawer|hamburger|menu-toggle|data-menu|aria-expanded/i,
			'禁汉堡／抽屉',
		);
	});

	it('淡边脚本只在 nav 上挂 passive scroll，不碰主题', () => {
		assert.match(header, /is:inline/);
		assert.match(header, /data-fade-start/);
		assert.match(header, /data-fade-end/);
		assert.match(header, /\{\s*passive:\s*true\s*\}/);
		assert.doesNotMatch(header, /data-theme|localStorage/, '主题仍在 Base.astro');
	});
});

describe('顶栏窄屏 running head：CSS 契约', () => {
	it('窄屏 nowrap＋横滑＋padding-block:2px，真渲染 44≤H≤52', () => {
		const narrow = narrowCss(css);
		assert.ok(narrow.length > 0, '缺窄屏 .header-inner 块');

		const inner = rule(narrow, '.header-inner {');
		assert.match(inner, /flex-wrap:\s*nowrap/);
		assert.match(inner, /padding-block:\s*2px/, '窄屏 padding-block 必须收到 2px');
		assert.match(inner, /min-height:\s*44px/);

		const nav = rule(narrow, '.nav-scroll .nav {');
		assert.match(nav, /flex-wrap:\s*nowrap/);
		assert.match(nav, /overflow-x:\s*auto/);
		assert.match(nav, /margin-left:\s*0/);

		assert.match(rule(narrow, '.nav-scroll {'), /flex:\s*1 1 auto/);
		assert.match(rule(narrow, '.nav-scroll {'), /min-width:\s*0/);
	});

	it('热区 ≥44：链／配色／牌名，配色钉右不随横滑', () => {
		const narrow = narrowCss(css);
		const shared = rule(headerCss(css), '.nav a,\n.theme-toggle {');
		assert.match(shared, /min-height:\s*44px/);
		assert.match(rule(narrow, '.theme-toggle {'), /flex:\s*0 0 auto/);
		assert.match(rule(narrow, '.brand a {'), /min-height:\s*44px/);
		assert.match(rule(narrow, '.nav a {'), /white-space:\s*nowrap/);
	});

	it('断点只用既有 48rem：无 640／641 媒体查询', () => {
		const head = headerCss(css);
		const media = head.match(/@media[^{]+/g) ?? [];
		assert.ok(media.length > 0, '顶栏区应有窄屏媒体查询');
		for (const m of media) {
			assert.doesNotMatch(m, /\b6[34]\d(?:\.\d+)?px/, `另造断点：${m.trim()}`);
			assert.match(m, /47\.99rem|48rem|prefers-reduced-motion|prefers-color-scheme/);
		}
		assert.doesNotMatch(head, /\b6[34]\d(?:\.\d+)?px/);
		// 桌面仍是一行，不强制横滑：.nav 的 overflow-x 只在窄屏块里。
		assert.doesNotMatch(rule(head, '\n.nav {'), /overflow-x/);
		assert.match(rule(head, '\n.nav {'), /margin-left:\s*auto/);
	});

	it('不碰碟页壳：#177／#178 的 --disc-* 与 crop 规则不动', () => {
		const head = headerCss(css);
		assert.doesNotMatch(head, /--disc-/);
		assert.doesNotMatch(head, /\.split-|\.record-|detail-display/);
		// 碟页壳自己的 44px 契约仍在（本票只读断言，不改它）。
		assert.match(css, /--disc-settled-h:\s*44px/);
	});

	it('reduced-motion：淡边无过渡，横滑仍可用', () => {
		const head = headerCss(css);
		const at = head.indexOf('@media (prefers-reduced-motion: reduce)');
		assert.ok(at > 0, '缺 reduced-motion 块');
		assert.match(rule(block(head, at), '.nav-fade {'), /transition:\s*none/);
	});
});
