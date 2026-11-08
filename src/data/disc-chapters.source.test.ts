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
		// 手机地图桥：手势、站落稳、已验证站目标三个消息，两端都要接线。
		for (const event of [
			'traj:gesture',
			'traj:station-settled',
			'traj:station-target',
			'traj:query-target',
			// 取消生命周期与探索换归属：两端都必须接线。
			'traj:cancel',
			'traj:view',
		]) {
			assert.ok(client.includes(`'${event}'`), `${event} 地图端没有接线`);
			assert.ok(reader.includes(`'${event}'`), `${event} 壳端没有接线`);
		}
		// 桥只在窄屏地图章开；桌面／独立地图原样不动。
		assert.ok(reader.includes("traj.dataset.chapterBridge = 'on'"));
		assert.ok(client.includes("root.dataset.chapterBridge === 'on'"));
		// 站没落稳不发消息：真实飞行＋旁白之后才 settle，而且只经桥的身份校验发。
		assert.match(
			client,
			/await showNarration\(place, index, token\);\s*\/\/[\s\S]{0,160}?settleStation\(action, \{ flew, revealed, token, currentToken: playToken \}\);/,
		);
		// ready 只有一条出口：桥的 settle 返回才发 traj:station-settled。
		assert.equal((client.match(/new CustomEvent\('traj:station-settled'/g) ?? []).length, 1);
		assert.match(
			client,
			/const settled = bridge\.settle\(action, outcome\);\s*if \(settled\) emitStationSettled\(settled\);/,
		);
		// 手势身份（gid／主指／epoch）由桥冻结，不再用可变的 bridgeGesture 猜。
		assert.equal(client.includes('bridgeGesture'), false, '又用可变 bridgeGesture 当身份');
		assert.match(client, /busy: \(\) => flying \|\| bridge\.settling\(\)/);
		// 不许 ghost：过渡不做 innerHTML 复制，不做 cloneNode。
		assert.equal(reader.includes('cloneNode'), false);
		assert.equal(client.includes('cloneNode'), false);
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

	it('renders every reveal face inside the record chapter with no on-screen side chrome', () => {
		// 唱片章渲全部面，不再只 `revealDetails[0]`。
		assert.ok(template.includes('coverSides.map((side, sideIndex) =>'));
		assert.ok(template.includes('coverDetails[sideIndex]'));
		assert.ok(template.includes('data-cover-face={side.index}'));
		assert.ok(template.includes('data-cover-side={side.index}'));
		assert.ok(template.includes('data-cover-frame'));
		assert.ok(template.includes('data-cover-img'));

		// 切面状态只留在隐藏的 `data-cover-side` 上：屏上不摆圆点／三点／字 tab。
		const coverBlock = template.slice(
			template.indexOf("chapter.mode === 'cover-scroll'"),
			template.indexOf("chapter.mode === 'scroll' &&"),
		);
		assert.ok(coverBlock.includes('data-cover-side={side.index}'));
		const outsideCover = template.replace(coverBlock, '');
		assert.equal(outsideCover.includes('data-cover-side'), false, '切面状态漏出了唱片章');
		assert.equal(outsideCover.includes('data-cover-face'), false, '多面帧漏出了唱片章');
		assert.equal((template.match(/data-cover-side=\{/g) ?? []).length, 1);
		// 禁可见切面控件：无圆点、无按钮、无面名字。
		assert.equal(template.includes('disc-record-side-dots'), false, '圆点 pager 还在');
		assert.equal(template.includes('disc-record-side-dot'), false, '圆点 pager 还在');
		assert.equal(coverBlock.includes('disc-record-side-face'), false, '切面还印着面名字');
		assert.equal(coverBlock.includes('<button'), false, '唱片章里还有切面按钮');
		assert.equal(css.includes('.disc-record-side-dot'), false, '圆点样式还留着');
		assert.doesNotMatch(coverBlock, />\s*\{side\.label\}/, '切面还印着可见文案');
	});

	it('scrubs fill→crop on vertical scroll per face, not a pose pinch and not an autoplay', () => {
		const coverBlock = template.slice(
			template.indexOf("chapter.mode === 'cover-scroll'"),
			template.indexOf("chapter.mode === 'scroll' &&"),
		);
		// 章内 DOM：runway＋sticky 舞台＋upright 外层＋裁剪窗＋plate，与先盘 reveal 同一套语法。
		assert.ok(coverBlock.includes('data-cover-runway'));
		assert.ok(coverBlock.includes('data-cover-stage'));
		assert.ok(coverBlock.includes('upright-outer'));
		assert.ok(coverBlock.includes('crop-window'));
		assert.ok(coverBlock.includes('data-fill-crop="outer"'));
		assert.ok(coverBlock.includes('data-fill-crop="window"'));
		assert.ok(coverBlock.includes('data-cover-upright'));
		assert.ok(coverBlock.includes('data-cover-plate'));

		// 几何走 detail-display 的同一套 helper：不是整层 `transform: scale()`。
		const crop = readFileSync(join(here, './disc-cover-crop.ts'), 'utf8');
		for (const helper of ['openingBox', 'plateBox', 'zoomImageBox', 'cropWindow', 'coverCropGeometry']) {
			assert.ok(crop.includes(helper), `章内 fill→crop 没接 ${helper}`);
		}
		assert.ok(reader.includes("from './disc-cover-crop.ts'"));
		assert.ok(reader.includes('coverCropGeometry('));
		assert.ok(reader.includes('coverRunwayProgress('));
		assert.ok(reader.includes('coverPlace('));
		// 竖滑＝进度：scroll 事件驱动，不按时间播。
		assert.match(reader, /addEventListener\(\s*'scroll',[\s\S]{0,40}?sync\(\)/);
		assert.equal(reader.includes('coverCropProgress'), false, '还在按时间播揭示');
		assert.equal(reader.includes('requestAnimationFrame'), true, '地图交接仍用 rAF');
		assert.equal(/"'\)\)\s*;?\s*raf = requestAnimationFrame/.test(reader), false);
		assert.equal(reader.includes('wireCoverZoom'), false, 'pinch 缩放接线还留着');
		assert.equal(crop.includes('translate3d('), false, '章内用 pose scale 冒充裁剪');
	});

	it('walks pass after pass on scroll with no pager and no autoplay', () => {
		assert.ok(reader.includes('coverPassPaint('));
		assert.ok(reader.includes('coverRunwayHeightPx('));
		// 进度→面：续滑过 joint 进下一面（桌面 split-stage 的 placeOnRunway）。
		const crop = readFileSync(join(here, './disc-cover-crop.ts'), 'utf8');
		assert.ok(crop.includes("from './split-stage.ts'"));
		assert.ok(crop.includes('placeOnRunway('));
		assert.ok(crop.includes('stageVisual('));
		// 没有按时间的一镜：旧的 autoplay 常量与播放循环全下掉。
		assert.equal(crop.includes('COVER_CROP_MS'), false, 'autoplay 时长常量还在');
		assert.equal(crop.includes('coverCropProgress'), false, 'autoplay 进度函数还在');
		assert.equal(crop.includes('easeInOutCubic'), false, 'autoplay 缓动还在');
		assert.equal(reader.includes('recordPlayback'), false, '进章自动播还在');
		assert.equal(reader.includes('coverPlaying'), false, '自动播状态还在');
	});

	it('lifts the marks overlay with the callouts so settled boxes and dashed elbows paint', () => {
		// 闸门：JS 之前 `overlay` 在 CSS 里压成 0（不许先露框）。
		assert.match(
			css,
			/\.disc-record-cover-frame:has\(> \.crop-window\) \.disc-record-overlay,\s*\.disc-record-cover-frame:has\(> \.crop-window\) \.disc-record-marks \{\s*opacity: 0;/,
		);
		// 抬层：settled 的框与虚线肘是 `overlay` 的子层，父层不抬就只剩注文孤悬。
		assert.match(reader, /overlay: [\s\S]{0,80}?\.disc-record-overlay/);
		assert.match(reader, /\[\s*face\.overlay,\s*paint\.calloutOpacity/);
	});

	it('jumps to the settled plate when motion is reduced, still changing faces by scroll', () => {
		assert.match(reader, /dataset\.motion (?:===|!==) '(?:ok|reduce)'/);
		assert.ok(reader.includes('prefers-reduced-motion'));
		// reduced-motion 只把「这一面」落成 settled；面别仍由进度决定。
		assert.match(reader, /settle: !motionOk\(\)/);
		assert.ok(reader.includes('coverPlace('));
	});

	it('crosses only on a released second gesture, never on a timer lock', () => {
		// 释放门闩：读的是边界状态机，不是 240ms 锁或 touchend 补翻。
		assert.ok(reader.includes('reduceBoundary'));
		assert.ok(reader.includes('createBoundaryState'));
		assert.equal(reader.includes('GESTURE_LOCK_MS'), false, '又用计时锁当松手门闩');
		assert.equal(reader.includes('touchStepped'), false, '同一次手势里还在 move 里直接翻章');
		assert.equal(reader.includes('readVerticalGesture'), false, '旧「到边＋累计 dy」判读还在');
		// 触摸走生产 adapter：start／move／end／cancel 都只经它，不在处理器里重写判读。
		assert.match(reader, /const touch = createChapterTouchAdapter\(\{/);
		assert.match(reader, /stage\.addEventListener\('touchstart', \(event\) => touch\.start\(event\)/);
		assert.match(reader, /const effects = touch\.move\(event\);/);
		assert.match(reader, /const effects = touch\.end\(event\);/);
		assert.match(reader, /touch\.cancel\(\);/);
		assert.match(reader, /type: 'scroll'/);
		assert.match(reader, /'touchcancel'/);
	});

	it('constrains overscroll only in the outward edge phase, never blanket', () => {
		// 只有「已到边且朝外」这一相位才 preventDefault；正文长滚一根手指都不拦。
		assert.ok(reader.includes("'touchmove'"));
		assert.match(reader, /if \(effects\.prevent && event\.cancelable\) event\.preventDefault\(\);/);
		// 地图章不归壳：owns() 先读归属，adapter 才可能开新手势。
		assert.match(reader, /owns: \(\) => active && verticalIsShell\(\)/);
		// 原生竖滚能力保留（不把 touch-action 全关）。
		assert.match(css, /\.disc-chapter-scroll \{\s*touch-action: pan-y;/);
	});

	it('clamps the outgoing scroll before commit / goTo and batches the map handoff in one rAF', () => {
		assert.match(reader, /function clampScroll\(/);
		assert.match(reader, /clampScrollTop\(/);
		// commitChapter（跨章交接）与 goTo（点选）都先稳住几何。
		assert.match(reader, /function commitChapter[\s\S]{0,600}?clampScroll\(index\)/);
		assert.match(reader, /function goTo[\s\S]{0,800}?clampScroll\(index\)/);
		// 短方向过渡落在 pane 层，不写死 translateY 常量也不做整屏飞行。
		assert.equal(reader.includes('translateY'), false, '过渡位移写进了 JS');
		assert.match(css, /@keyframes disc-chapter-out-read/);
		assert.match(css, /@keyframes disc-chapter-in-read/);
		// handoffMap／releaseMap 同帧批完：DOM 改动排在同一个 rAF 里。
		assert.match(reader, /requestAnimationFrame\(\(\) => \{\s*handoffMap\(\)|batchFrame\(/);
	});

	it('never lays out the chapter shell or the map stage on a bare 100vh', () => {
		const narrow = css.slice(css.indexOf('@media (max-width: 47.99rem) {\n\t/* 收妥后章节壳才出现'));
		assert.equal(narrow.includes('100vh'), false, '章节壳／地图台里还有裸 100vh');
		assert.ok(narrow.includes('dvh') || narrow.includes('svh'));
		assert.ok(!/\.disc-chapter[\s\S]{0,80}100vh/.test(narrow));
	});
});
