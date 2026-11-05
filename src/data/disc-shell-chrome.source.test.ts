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
	it('地图章顶栏也印碟名：题一行截断，只有 meta 收起', () => {
		// 静态题就在 bar 的槽里（脚本把唯一的 tombstone 移进来，退出时放回）。
		assert.match(template, /<div class="split-settled-bar">/);
		const splitRead = template.slice(template.indexOf('<div class="split-read">'));
		assert.equal(splitRead.match(/class="record-tombstone"/g)?.length, 1);
		assert.match(template, /<h1>\{record\.work\}<\/h1>/);

		const mapTitle = rule(
			css,
			"[data-chapter-kind='map'] .split-settled-bar .record-tombstone h1 {",
		);
		// 「仅图空槽」＝地图章把 tombstone 藏掉；现在只收 meta，题必须留着。
		assert.match(mapTitle, /display:\s*block;/);
		assert.match(mapTitle, /white-space:\s*nowrap;/);
		assert.match(mapTitle, /overflow:\s*hidden;/);
		assert.match(mapTitle, /text-overflow:\s*ellipsis;/);
		assert.doesNotMatch(mapTitle, /display:\s*none/);

		const mapMeta = rule(
			css,
			"[data-chapter-kind='map'] .split-settled-bar .record-tombstone-meta {",
		);
		assert.match(mapMeta, /display:\s*none;/);

		// 地图章不得再把塔碑整块藏掉，也不得塌成单列空槽。
		assert.doesNotMatch(
			css,
			/\[data-chapter-kind='map'\] \.split-settled-bar \.record-tombstone \{\s*display:\s*none/,
		);
		assert.doesNotMatch(
			css,
			/\[data-chapter-kind='map'\] \.split-settled-bar \{\s*grid-template-columns:\s*var\(--disc-settled-cover-w\);/,
		);
		// 两列「小图｜题」仍是 settled 条的骨架。
		assert.match(
			css,
			/\.split-settled-bar \{[^}]*grid-template-columns:\s*var\(--disc-settled-cover-w\) minmax\(0, 1fr\);/s,
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
		assert.match(bar, /border-bottom:\s*1px solid var\(--line\);/);
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
});
