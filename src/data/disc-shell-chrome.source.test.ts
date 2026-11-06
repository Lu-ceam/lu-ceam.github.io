import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const here = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(join(here, '../styles/global.css'), 'utf8');
const astro = readFileSync(join(here, '../pages/records/[id].astro'), 'utf8');
const map = readFileSync(join(here, '../components/TrajectoryMap.astro'), 'utf8');
const template = astro.slice(0, astro.indexOf('<script>'));

/** 一条规则的声明体：从选择器串开始到第一个 `}`。 */
function rule(source: string, selector: string): string {
	const at = source.indexOf(selector);
	if (at < 0) return '';
	const open = source.indexOf('{', at);
	const close = source.indexOf('}', open);
	if (open < 0 || close < 0) return '';
	return source.slice(open + 1, close);
}

describe('窄屏章节壳 chrome：顶＋底一张纸、顶栏必有碟名', () => {
	it('四章同壳题槽：小图｜h1 单行｜meta 单行，禁地图异体制', () => {
		// 静态题就在 bar 的槽里（脚本把唯一的 tombstone 移进来，退出时放回）。
		assert.match(template, /<div class="split-settled-bar">/);
		const splitRead = template.slice(template.indexOf('<div class="split-read">'));
		assert.equal(splitRead.match(/class="record-tombstone"/g)?.length, 1);
		assert.match(template, /<h1>\{record\.work\}<\/h1>/);
		// meta 仍是演职／厂牌／编号——换章不换头，有内容则可见。
		assert.match(splitRead, /class="record-tombstone-meta"/);
		assert.match(splitRead, /\{record\.artist\}/);

		// 唯一系统：h1／meta 各单行 ellipsis（替换 #176 clamp2）；字阶走同一组 token。
		assert.match(css, /--disc-settled-h:\s*44px/);
		assert.match(css, /--disc-settled-title:\s*14px/);
		assert.match(css, /--disc-settled-meta:\s*12px/);
		assert.match(css, /--disc-settled-cover-w:\s*28px/);

		const title = rule(
			css,
			".record-page--split[data-phase='reading'] .split-settled-bar .record-tombstone h1 {",
		);
		assert.match(title, /font-size:\s*var\(--disc-settled-title\);/);
		assert.match(title, /white-space:\s*nowrap/);
		assert.match(title, /text-overflow:\s*ellipsis/);
		assert.match(title, /overflow:\s*hidden/);
		assert.doesNotMatch(title, /-webkit-line-clamp:\s*2/);
		assert.doesNotMatch(title, /(^|\n)\s*line-clamp:\s*2/);

		const meta = rule(
			css,
			".record-page--split[data-phase='reading'] .split-settled-bar .record-tombstone-meta {",
		);
		assert.match(meta, /font-size:\s*var\(--disc-settled-meta\);/);
		assert.match(meta, /white-space:\s*nowrap/);
		assert.match(meta, /text-overflow:\s*ellipsis/);
		assert.doesNotMatch(meta, /-webkit-line-clamp:\s*2/);
		assert.doesNotMatch(meta, /display:\s*none/);

		// 返回／信息热区／dialog 同壳（四章无特判）。
		assert.match(template, /class="split-settled-back"/);
		assert.match(template, /aria-label="返回唱片目录"/);
		assert.match(template, /class="split-settled-identity"/);
		assert.match(template, /aria-haspopup="dialog"/);
		assert.match(template, /<dialog[^>]*class="record-identity"/);

		// 禁异体制：任何 kind（尤其 map）都不得另立题槽 nowrap／藏 meta 规则。
		assert.doesNotMatch(
			css,
			/\[data-chapter-kind='map'\][^{]*\.record-tombstone h1\s*\{/,
		);
		assert.doesNotMatch(
			css,
			/\[data-chapter-kind='map'\][^{]*\.record-tombstone-meta\s*\{/,
		);
		assert.doesNotMatch(
			css,
			/\[data-chapter-kind='[a-z]+'\][^{]*\.split-settled-bar \.record-tombstone(-meta)?\s*\{/,
		);

		// 地图章不得再把塔碑整块藏掉，也不得塌成单列空槽。
		assert.doesNotMatch(
			css,
			/\[data-chapter-kind='map'\] \.split-settled-bar \.record-tombstone \{\s*display:\s*none/,
		);
		assert.doesNotMatch(
			css,
			/\[data-chapter-kind='map'\] \.split-settled-bar \{\s*grid-template-columns:\s*var\(--disc-settled-cover-w\);/,
		);
		// 四列「返回｜小图｜题｜下展」仍是 settled 条的骨架，四章同一套。
		assert.match(
			css,
			/\.split-settled-bar \{[^}]*grid-template-columns:[^;]*var\(--disc-settled-back-w\)[^;]*var\(--disc-settled-cover-w\)[^;]*minmax\(0, 1fr\)[^;]*var\(--disc-settled-toggle-w\)/s,
		);
	});

	it('顶栏／底栏走纸＋墨，暗色主题下不留近黑 slab 夹奶油', () => {
		// 收妥＝章节壳：一张纸。纸墨沿用站点 token，不另造第三套。
		const paper = rule(css, ".record-page--split[data-phase='reading'] {");
		assert.match(paper, /--bg:\s*#f5f1e8;/);
		assert.match(paper, /--bg-elevated:\s*#f5f1e8;/);
		assert.match(paper, /--text:\s*#211e1a;/);
		assert.match(paper, /--line:\s*#ddd4c6;/);
		assert.match(paper, /--accent:\s*#7c2d22;/);

		// 收妥条与章节壳的字跟着纸走，继承来的浅字不许留在纸上。
		const bar = rule(css, ".record-page--split[data-phase='reading'] .split-imagery {");
		assert.match(bar, /background:\s*var\(--bg\);/);
		assert.match(bar, /color:\s*var\(--text\);/);
		// 分界仍是 1px 墨淡线，但画在栏内，不把 44 抬成 45。
		assert.match(bar, /box-shadow:\s*inset 0 -1px var\(--line\);/);
		const chapters = rule(css, '.disc-chapters:not([hidden]) {');
		assert.match(chapters, /background:\s*var\(--bg\);/);
		assert.match(chapters, /color:\s*var\(--text\);/);

		// 底栏四格同纸：rail 走纸底＋墨线，点仍是墨／砖。
		const rail = rule(css, '.disc-chapter-rail {');
		assert.match(rail, /background:\s*var\(--bg-elevated\);/);
		assert.match(rail, /border-top:\s*1px solid var\(--line\);/);
	});

	it('导览态不挂「站表 · N 站」入口行', () => {
		const hide = rule(css, "[data-map-chrome='compact'][data-traj-view='guide'] .traj-stops-fold {");
		assert.match(hide, /display:\s*none;/);
		// 站表只在游线／探索里露面，导览不给入口行。
		assert.doesNotMatch(css, /\[data-traj-view='explore'\] \.traj-stops-fold \{\s*display:\s*none/);
	});

	it('控件一行优先：探索不掉队孤行，‹ › 成对靠右', () => {
		const modesAt = css.indexOf("[data-map-chrome='compact'] .traj-controls [data-traj-guide]");
		assert.ok(modesAt > 0, '模式三钮同组规则缺');
		const modes = css.slice(modesAt, css.indexOf('}', modesAt));
		assert.match(modes, /\[data-traj-chrono\]/);
		assert.match(modes, /\[data-traj-explore\]/);
		assert.match(modes, /order:\s*1;/);

		const transportAt = css.indexOf("[data-map-chrome='compact'] .traj-controls [data-traj-play]");
		assert.ok(transportAt > 0, '运输钮同组规则缺');
		const transport = css.slice(transportAt, css.indexOf('}', transportAt));
		assert.match(transport, /\[data-traj-replay\]/);
		assert.match(transport, /order:\s*2;/);

		assert.match(
			rule(css, "[data-map-chrome='compact'] .traj-controls .traj-controls-sp {"),
			/display:\s*none;/,
		);
		assert.match(
			rule(css, "[data-map-chrome='compact'] .traj-controls .traj-nav-pair {"),
			/margin-left:\s*auto;/,
		);
	});

	it('收起站表后奶油空交给地图：舞台吃满', () => {
		const stage = rule(css, "[data-map-chrome='compact'] .traj-stage {");
		assert.match(stage, /flex:\s*1;/);
		assert.match(stage, /min-height:\s*var\(--disc-map-stage-min\);/);
	});

	it('桌面 ≥48rem 路径不动：纸墨只在窄屏块里', () => {
		const narrowStart = css.indexOf('@media (max-width: 47.99rem) {\n\t.record-page--split {');
		assert.ok(narrowStart > 0, '窄屏块起点找不到');
		assert.match(css.slice(narrowStart), /--bg:\s*#f5f1e8;/);
		const desktop = css.slice(css.indexOf('@media (min-width: 48rem) {\n\t.disc-chapters'));
		assert.ok(desktop.length > 0);
		assert.doesNotMatch(desktop, /#f5f1e8/);
		// 纸墨变量整体收在窄屏块里，桌面与页身不被改写。
		assert.equal((css.slice(0, narrowStart).match(/--bg:\s*#f5f1e8;/g) ?? []).length, 0);
	});


	it('P2：compact 舞台地板再抬——#170 soft 奶油空有更高下限', () => {
		// 契约：compact 覆盖 --disc-map-stage-min，且高于 P1 的 52vh／380。
		const compactRoot = rule(css, "[data-map-chrome='compact'] {");
		assert.match(compactRoot, /--disc-map-stage-min:\s*min\(/);
		const m = compactRoot.match(/--disc-map-stage-min:\s*min\(([^)]+)\)/);
		assert.ok(m, '缺 min() 舞台地板');
		// 至少一端 ≥54vh 或 ≥400px，避免仍停在 #170 的 52vh／380。
		const args = m[1];
		const vh = args.match(/(\d+(?:\.\d+)?)vh/);
		const px = args.match(/(\d+(?:\.\d+)?)px/);
		const vhN = vh ? Number(vh[1]) : 0;
		const pxN = px ? Number(px[1]) : 0;
		assert.ok(vhN >= 54 || pxN >= 400, `舞台地板过低: ${args}`);
		// 控件区下空白不堆：padding-bottom 薄。
		const controls = rule(css, "[data-map-chrome='compact'] .traj-controls {");
		assert.match(controls, /padding:/);
		assert.doesNotMatch(css, /traj-controls[^}]*padding-bottom:\s*[2-9]rem/);
	});

	it('P1：‹ › 成对——同父 nowrap，禁 › 孤行', () => {
		assert.match(map, /class="traj-nav-pair"/);
		assert.match(map, /traj-nav-pair[\s\S]*?data-traj-prev[\s\S]*?data-traj-next/);
		const pair = rule(css, "[data-map-chrome='compact'] .traj-controls .traj-nav-pair {");
		assert.match(pair, /display:\s*(inline-)?flex;/);
		assert.match(pair, /flex-wrap:\s*nowrap;/);
		assert.match(pair, /margin-left:\s*auto;/);
		// 不再把 margin-left:auto 钉在单独的 prev 上（那会拆对）。
		assert.doesNotMatch(
			css,
			/\[data-map-chrome='compact'\] \.traj-controls \[data-traj-prev\] \{\s*margin-left:\s*auto;/,
		);
	});

	it('不碰 #167 章内 fill→crop 钩', () => {
		assert.match(template, /data-fill-crop="outer"/);
		assert.match(template, /data-fill-crop="window"/);
		assert.match(template, /data-cover-side=/);
		assert.match(map, /站表 · \{disc\.places\.length\} 站/);
	});
	it('瘦条 P2：桌面 .record-object 无裸 100vh；年轨真实 button ≥44', () => {
		assert.match(css, /\.record-object \{[^}]*max-height:\s*calc\(100svh - 2rem\)/s);
		assert.doesNotMatch(css, /\.record-object \{[^}]*max-height:\s*calc\(100vh - 2rem\)/s);
		const yearBtn = rule(map, '.traj .traj-year-pins button {');
		assert.match(yearBtn, /min-width:\s*44px/);
		assert.match(yearBtn, /min-height:\s*44px/);
	});

});
