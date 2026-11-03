import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const astro = readFileSync(join(here, '../pages/records/[id].astro'), 'utf8');
const template = astro.slice(0, astro.indexOf('<script>'));
const css = readFileSync(join(here, '../styles/global.css'), 'utf8');
const map = readFileSync(join(here, '../components/TrajectoryMap.astro'), 'utf8');
const client = readFileSync(join(here, '../components/trajectory-map-client.ts'), 'utf8');
const reader = readFileSync(join(here, './disc-chapter-reader.ts'), 'utf8');

describe('碟页章节壳接线 v3', () => {
	it('renders four bar slots and scroll/list/map panes without a beat track', () => {
		assert.ok(template.includes('data-disc-chapters'));
		assert.ok(template.includes('data-chapters-stage'));
		assert.ok(template.includes('data-chapter-kind={chapter.key}'));
		assert.ok(template.includes('data-chapter-mode={chapter.mode}'));
		assert.ok(template.includes('data-chapter-map'));
		assert.ok(template.includes('data-chapter-goto={chapterIndex}'));
		assert.ok(template.includes('data-chapter-scroll'));
		assert.ok(template.includes('data-chapter-record-cover'));
		assert.ok(template.includes('data-chapter-list'));
		assert.ok(!template.includes('data-beat-track'));
		assert.ok(!template.includes('data-beat-scroll'));
		assert.ok(!template.includes('chapter.beats'));
	});

	it('settles into 唱片 cover-scroll without a cover phase or ghost prologue', () => {
		assert.ok(astro.includes('mountChapterReader'));
		assert.ok(astro.includes("page.dataset.phase === 'reading'"));
		assert.ok(astro.includes('reader.setActive(reading)'));
		assert.ok(!astro.includes("setActive(true, 'cover')"));
		assert.ok(!astro.includes("setActive(true, \"cover\")"));
		assert.ok(!astro.includes('onExitPrologue'));
		assert.ok(!reader.includes('beat = 0'));
		assert.ok(!reader.includes('dataset.chapterPhase'));
		assert.ok(!reader.includes("chapterPhase = covered ? 'cover'"));
		assert.ok(reader.includes('function setActive(on: boolean)'));
		assert.ok(template.includes("chapter.mode === 'cover-scroll'"));
	});

	it('labels the rail 述语 and keeps map chrome compact', () => {
		assert.ok(template.includes("CHAPTER_LABELS[chapter.key]"));
		assert.ok(astro.includes("story: '述语'") === false); // labels live in disc-chapters
		const labels = readFileSync(join(here, './disc-chapters.ts'), 'utf8');
		assert.ok(labels.includes("story: '述语'"));
		assert.ok(!labels.includes("story: '来龙去脉'"));
		assert.ok(reader.includes("dataset.mapChrome = 'compact'"));
		assert.ok(css.includes("data-map-chrome='compact'") || css.includes('data-map-chrome="compact"'));
	});

	it('mounts the year rail for the embedded map only', () => {
		assert.ok(map.includes('data-traj-year-rail'));
		assert.ok(map.includes("mode === 'embed' && yearPins.length > 0"));
		assert.ok(map.includes('yearRailOffset(pin)'));
	});

	it('hands the map its own gesture lifecycle and compact chrome', () => {
		assert.ok(client.includes("root.dataset.trajView = viewMode"));
		for (const event of ['traj:show', 'traj:pause', 'traj:guide']) {
			assert.ok(client.includes(`'${event}'`), `${event} 没有接线`);
		}
		assert.ok(client.includes('mapSteppingStations(viewMode)'));
		assert.ok(reader.includes("new Event('traj:show')"));
		assert.ok(reader.includes("new Event('traj:pause')"));
		assert.ok(reader.includes("new Event('traj:guide')"));
		assert.ok(reader.includes('parkMap'));
	});

	it('restores the guide from anywhere outside the map frame, top bar included', () => {
		assert.ok(reader.includes("document.addEventListener('pointerdown', guideIfOutsideFrame, true)"));
		for (const keep of ['.traj-map', '.traj-year-rail', '.traj-controls', '.traj-stops']) {
			assert.ok(reader.includes(keep), `${keep} 不在框内白名单`);
		}
	});

	it('keeps the narrow shell out of the desktop path', () => {
		assert.ok(css.includes('--disc-chapter-rail-h: 32px;'));
		assert.ok(css.includes('--disc-year-rail-w: 44px;'));
		assert.ok(css.includes('--disc-beat-pad-x: 1rem;'));
		assert.ok(css.includes('--disc-map-chrome-gap: 8px;'));
		assert.ok(css.includes('--disc-map-stage-min: 38dvh;'));
		const desktop = css.slice(css.indexOf('@media (min-width: 48rem) {\n\t.disc-chapters'));
		assert.ok(desktop.startsWith('@media (min-width: 48rem) {\n\t.disc-chapters {\n\t\tdisplay: none !important;'));
		const narrow = css.slice(css.indexOf('@media (max-width: 47.99rem) {\n\t/* 收妥后章节壳才出现'));
		assert.ok(narrow.includes('.disc-chapters:not([hidden])'));
		assert.ok(narrow.includes('.disc-chapters-on'));
		assert.ok(map.includes('.traj .traj-rail {\n\t\t\tdisplay: none;'));
	});

	/** CSS 里的一张声明值：规则块内第一个 `prop:` 的值。 */
	function declaration(source: string, selector: string, prop: string): string | null {
		const at = source.indexOf(selector);
		if (at < 0) return null;
		const open = source.indexOf('{', at);
		const close = source.indexOf('}', open);
		if (open < 0 || close < 0) return null;
		const block = source.slice(open + 1, close);
		const match = new RegExp(`(?:^|[;\\s])${prop}\\s*:\\s*([^;]+);`).exec(block);
		return match?.[1]?.trim() ?? null;
	}

	it('keeps the chapter rail a footnote: short token, row dots, one safe-area pad', () => {
		const token = Number(/--disc-chapter-rail-h:\s*([\d.]+)px;/.exec(css)?.[1]);
		assert.ok(Number.isFinite(token) && token > 0, '底栏 token 要读得出来');
		// 不含 safe-area 的底栏本体：≤36px（站长口径）。
		assert.ok(token <= 36, `底栏 token ${token}px 超过 36px`);

		// 点文横排：禁点上字下双行堆高。
		const dot = css.slice(css.indexOf('.disc-chapter-dot {'), css.indexOf('.disc-chapter-dot i {'));
		assert.match(dot, /flex-direction:\s*row;/);
		assert.doesNotMatch(dot, /flex-direction:\s*column;/);
		const fontRem = Number(/font-size:\s*([\d.]+)rem;/.exec(dot)?.[1]);
		assert.ok(fontRem >= 0.6 && fontRem <= 0.7, `点文字号 ${fontRem}rem 不在 .62–.68 附近`);
		const padBlock = Number(/padding-block:\s*([\d.]+)rem;/.exec(dot)?.[1]);
		assert.ok(padBlock >= 0.18 && padBlock <= 0.3, `点内距 ${padBlock}rem 不在 .2–.28 附近`);

		// safe-area 只加一次：底边 max(inset, .2rem)，不再 `.45rem + inset` 双加厚。
		const railPadding = declaration(css, '.disc-chapter-rail {', 'padding') ?? '';
		assert.match(railPadding, /max\(env\(safe-area-inset-bottom,\s*0px\),\s*0\.2rem\)/);
		assert.doesNotMatch(railPadding, /\+/);
		assert.doesNotMatch(css, /0\.45rem\s*\+\s*env\(safe-area-inset-bottom/);
	});

	it('keeps the bar under a tenth of a 390-wide phone viewport with or without a safe area', () => {
		// §A.1 自动闸：token + 内距 + 边线，两种 safe-area 都量一次。
		const token = Number(/--disc-chapter-rail-h:\s*([\d.]+)px;/.exec(css)?.[1]);
		const pxPerRem = 16;
		const railPadding = declaration(css, '.disc-chapter-rail {', 'padding') ?? '';
		const blocks = railPadding.split(/\s+/);
		const padTop = Number.parseFloat(blocks[0] ?? '0') * pxPerRem;
		const padBottomRem = Number(
			/max\(env\(safe-area-inset-bottom,\s*0px\),\s*([\d.]+)rem\)/.exec(blocks[2] ?? '')?.[1] ?? '0',
		);
		const dot = css.slice(css.indexOf('.disc-chapter-dot {'), css.indexOf('.disc-chapter-dot i {'));
		const dotFont = Number(/font-size:\s*([\d.]+)rem;/.exec(dot)?.[1]) * pxPerRem;
		const dotLine = Number(/line-height:\s*([\d.]+);/.exec(dot)?.[1]);
		const dotPad = Number(/padding-block:\s*([\d.]+)rem;/.exec(dot)?.[1]) * pxPerRem;
		const content = dotFont * dotLine + dotPad * 2;
		const border = 1;
		const viewport = 844; // iPhone 390×844 逻辑高
		for (const inset of [0, 34]) {
			const padBottom = Math.max(inset, padBottomRem * pxPerRem);
			const height = Math.max(token, content + padTop + padBottom + border);
			const ratio = height / viewport;
			assert.ok(ratio <= 0.12, `safe-area ${inset}px 时底栏 ${height.toFixed(1)}px = ${ratio.toFixed(3)} vv，超过 0.12`);
		}
	});

	it('keeps a thin single-line map title and the controls inside the chapter box', () => {
		const compactTitle = css.slice(
			css.indexOf("data-map-chrome='compact'] > .traj-title {"),
			css.indexOf("data-map-chrome='compact'] > .traj-note {"),
		);
		// 禁整题藏掉：compact 要有薄单行题。
		assert.ok(compactTitle.length > 0);
		assert.doesNotMatch(compactTitle, /display:\s*none/);
		assert.match(compactTitle, /display:\s*block/);
		assert.match(compactTitle, /white-space:\s*nowrap/);
		assert.match(compactTitle, /text-overflow:\s*ellipsis/);
		assert.match(compactTitle, /overflow:\s*hidden/);

		// 舞台最小 ≤44dvh，地图高跟 flex，不再硬顶 42dvh。
		const stageMin = Number(/--disc-map-stage-min:\s*([\d.]+)dvh;/.exec(css)?.[1]);
		assert.ok(stageMin > 0 && stageMin <= 44, `地图舞台地板 ${stageMin}dvh 超过 44dvh`);
		assert.doesNotMatch(css, /height:\s*min\(42dvh/);
		// 裸 32vh 上手改 svh：章里不再靠 vh 量地图。
		assert.match(css, /height:\s*min\(32svh, 240px\)/);
		assert.doesNotMatch(css, /min\(32vh/);

		// 控件缩 padding／font 且可换行，仍在章内。
		const controls = css.slice(
			css.indexOf("data-map-chrome='compact'] .traj-controls {"),
			css.indexOf("data-map-chrome='compact'] .traj-blurb {"),
		);
		assert.match(controls, /flex-wrap:\s*wrap/);
		assert.match(controls, /min-height:\s*32px/);
		assert.match(controls, /font-size:\s*12px/);
		// 旁白带不回退：compact 仍夹 3 行可见。
		assert.match(css, /-webkit-line-clamp:\s*3;/);
	});

	it('renders every reveal face inside the record chapter with an in-chapter side switch', () => {
		// 唱片章渲全部面，不再只 `revealDetails[0]`。
		assert.ok(template.includes('coverSides.map((side, sideIndex) =>'));
		assert.ok(template.includes('coverDetails[sideIndex]'));
		assert.ok(template.includes('data-cover-face={side.index}'));
		assert.ok(template.includes('data-cover-side={side.index}'));
		assert.ok(template.includes('data-cover-frame'));
		assert.ok(template.includes('data-cover-img'));

		// 切面控件只在唱片章分支里：其它章不出现 `data-cover-side`。
		const coverBlock = template.slice(
			template.indexOf("chapter.mode === 'cover-scroll'"),
			template.indexOf("chapter.mode === 'scroll' &&"),
		);
		assert.ok(coverBlock.includes('data-cover-side={side.index}'));
		const outsideCover = template.replace(coverBlock, '');
		assert.equal(outsideCover.includes('data-cover-side'), false, '切面控件漏出了唱片章');
		assert.equal(outsideCover.includes('data-cover-face'), false, '多面帧漏出了唱片章');
		assert.equal((template.match(/data-cover-side=\{/g) ?? []).length, 1);
	});

	it('follows the current face in the zoom wiring and resets pan on a switch', () => {
		assert.ok(reader.includes('data-cover-face'));
		assert.ok(reader.includes('const faces ='));
		assert.ok(reader.includes('const select = (index: number): void =>'));
		assert.ok(reader.includes('reset();'));
		// 切面重置 pan／zoom：同一处 apply 只作用当前面。
		const zoom = reader.slice(reader.indexOf('function wireCoverZoom'), reader.indexOf("for (const target of panes) if (target.kind === 'record')"));
		assert.match(zoom, /const onCurrent = \(\): boolean => faces\[current\] === face;/);
		assert.match(zoom, /if \(!onCurrent\(\)\) return;/);
		assert.match(zoom, /pan = \{ scale: 1, x: 0, y: 0 \};/);
		assert.match(zoom, /button\.setAttribute\('aria-pressed'/);
	});

	it('never lays out the chapter shell or the map stage on a bare 100vh', () => {
		const narrow = css.slice(css.indexOf('@media (max-width: 47.99rem) {\n\t/* 收妥后章节壳才出现'));
		assert.equal(narrow.includes('100vh'), false, '章节壳／地图台里还有裸 100vh');
		assert.ok(narrow.includes('dvh') || narrow.includes('svh'));
		assert.ok(!/\.disc-chapter[\s\S]{0,80}100vh/.test(narrow));
	});
});
