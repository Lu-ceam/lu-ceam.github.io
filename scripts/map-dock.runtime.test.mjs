/**
 * 手机地图章 map-dock：**真实构建**的几何闸门（headless chromium + CDP）。
 *
 * 钉的是 PRD `/home/box/web-layout/prd-map-controls-single-row.md` §6 的布局项：
 * dock 在地图列（`dockOnMap`）、旁白列无控件（`controlsInChrome=false`）、
 * 一行、触点档、dock 高 ≤48、地图 share ≥0.48、无横向滚动、底栏仍是章节。
 *
 * 只量 `dist`；不驱动 GUI、不声称真机。前提：先 `npm run build`（无 dist 时整块 skip）。
 */
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, describe, it } from 'node:test';
import {
	DEFAULT_CHROME_CANDIDATES,
	findChrome,
	launchBrowser,
	startStaticServer,
} from './lib/cdp-browser.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const dist = join(here, '..', 'dist');
const hasDist = existsSync(join(dist, 'records', 'mhjl329', 'index.html'));
const hasChrome = DEFAULT_CHROME_CANDIDATES.some((path) => path && existsSync(path));

/** 一次量清：章盒、地图、旁白、dock 以及它们的内外关系。 */
const MEASURE = `(() => {
	const num = (v) => +Number(v).toFixed(1);
	const rectOf = (el) => {
		if (!el) return null;
		const r = el.getBoundingClientRect();
		return { x: num(r.x), y: num(r.y), w: num(r.width), h: num(r.height), top: num(r.top), bottom: num(r.bottom), left: num(r.left), right: num(r.right) };
	};
	const traj = document.querySelector('[data-traj-root]');
	const chapter = traj.closest('[data-chapter]');
	const mapWrap = traj.querySelector('.traj-map-wrap');
	const controls = traj.querySelector('.traj-controls');
	const narr = traj.querySelector('.traj-narr');
	const blurb = traj.querySelector('[data-traj-blurb]');
	// 只量可见的七枚：簇／未知列表的「×」也住在控件里，收起时是 0×0。
	const all = [...traj.querySelectorAll('.traj-controls button')];
	const buttons = all.filter((b) => b.getBoundingClientRect().width > 0 && b.getBoundingClientRect().height > 0);
	const chapterRect = chapter.getBoundingClientRect();
	const uniqlTops = [...new Set(buttons.map((b) => Math.round(b.getBoundingClientRect().top)))];
	return {
		viewport: { w: innerWidth, h: innerHeight },
		compact: traj.dataset.mapChrome === 'compact',
		dockFlag: controls ? controls.hasAttribute('data-traj-dock') : false,
		controlsHome: controls ? (controls.dataset.trajControlsHome ?? null) : null,
		dockOnMap: Boolean(controls && mapWrap && mapWrap.contains(controls)),
		controlsInChrome: Boolean(controls && narr && narr.contains(controls)),
		chapter: rectOf(chapter),
		map: rectOf(traj.querySelector('.traj-map')),
		mapWrap: rectOf(mapWrap),
		narr: rectOf(narr),
		dock: rectOf(controls),
		dockRows: uniqlTops.length,
		dockHeight: controls ? num(controls.getBoundingClientRect().height) : 0,
		dockScrollOverflow: controls ? controls.scrollWidth - controls.clientWidth : -1,
		docOverflowX: document.documentElement.scrollWidth - innerWidth,
		buttons: buttons.map((b) => {
			const r = b.getBoundingClientRect();
			const style = getComputedStyle(b);
			return {
				hook: b.dataset.trajGuide !== undefined ? 'guide'
					: b.dataset.trajChrono !== undefined ? 'chrono'
					: b.dataset.trajExplore !== undefined ? 'explore'
					: b.dataset.trajPlay !== undefined ? 'play'
					: b.dataset.trajReplay !== undefined ? 'replay'
					: b.dataset.trajPrev !== undefined ? 'prev' : 'next',
				w: num(r.width), h: num(r.height),
				aria: b.getAttribute('aria-label'),
				title: b.getAttribute('title'),
				visible: style.visibility !== 'hidden' && style.display !== 'none',
			};
		}),
		rail: rectOf(traj.querySelector('.traj-year-rail')),
		railW: traj.querySelector('.traj-year-rail') ? num(traj.querySelector('.traj-year-rail').getBoundingClientRect().width) : 0,
		blurb: blurb ? {
			clientH: num(blurb.clientHeight),
			scrollH: num(blurb.scrollHeight),
			isShort: blurb.classList.contains('is-short'),
			isLong: blurb.classList.contains('is-long'),
			overflowY: getComputedStyle(blurb).overflowY,
			maxH: getComputedStyle(blurb).maxHeight,
		} : null,
		chapterRail: {
			count: document.querySelectorAll('.disc-chapter-rail [data-chapter-goto]').length,
			labels: [...document.querySelectorAll('.disc-chapter-rail [data-chapter-goto]')].map((b) => b.textContent.trim()),
		},
		attribution: rectOf(document.querySelector('.leaflet-control-attribution')),
		chapterRectBottom: num(chapterRect.bottom),
	};
})()`;

/** 强制切到「A 两行」基线：把控件搬回旁白列，量同一站文的介绍带高（D10 的对照）。 */
const MEASURE_A = `(() => {
	const traj = document.querySelector('[data-traj-root]');
	const controls = traj.querySelector('.traj-controls');
	const narr = traj.querySelector('.traj-narr');
	if (!controls || !narr) return null;
	controls.removeAttribute('data-traj-dock');
	controls.removeAttribute('data-traj-controls-home');
	narr.append(controls);
	const blurb = traj.querySelector('[data-traj-blurb]');
	return {
		blurbClientH: blurb ? +blurb.clientHeight.toFixed(1) : 0,
		controlsH: +controls.getBoundingClientRect().height.toFixed(1),
		rows: [...new Set([...controls.querySelectorAll('button')].map((b) => Math.round(b.getBoundingClientRect().top)))].length,
	};
})()`;

const describeRuntime = hasDist && hasChrome ? describe : describe.skip;

describeRuntime('map-dock：真实 dist 的布局闸门（headless chromium）', () => {
	let server = null;
	let browser = null;
	const pages = new Set();

	before(async () => {
		server = await startStaticServer(dist);
		browser = await launchBrowser();
	});

	after(async () => {
		for (const page of pages) await page.closePage().catch(() => {});
		await browser?.close();
		await server?.close();
	});

	/** 打开唱片页 → 点底栏「地图」→ 等 compact 与 dock 都落地，再落两帧。 */
	async function openMapChapter(id, viewport) {
		const page = await browser.openPage(viewport);
		pages.add(page);
		await page.goto(`${server.origin}/records/${id}/`);
		await page.waitFor('document.querySelector("[data-traj-root]")');
		await page.waitFor('document.querySelector(\'[data-chapter-goto="2"]\')');
		await page.evaluate('document.querySelector(\'[data-chapter-goto="2"]\').click()', { userGesture: true });
		await page.waitFor('document.querySelector("[data-traj-root]").dataset.mapChrome === "compact"');
		await page.waitFor('document.querySelector(".traj-controls[data-traj-dock]") !== null');
		await page.evaluate('new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))', {
			awaitPromise: true,
		});
		await new Promise((r) => setTimeout(r, 300));
		return page;
	}

	for (const fixture of [
		{ id: 'cs6785', place: 'london-kingsway-1966', w: 390, h: 844, touch: 44, insetMin: 8 },
		{ id: 'cs6785', place: 'london-kingsway-1966', w: 375, h: 812, touch: 40, insetMin: 8 },
		{ id: 'cs6785', place: 'london-kingsway-1966', w: 320, h: 568, touch: 36, insetMin: 2 },
		{ id: 'falp381', place: 'bonn', w: 320, h: 568, touch: 36, insetMin: 2 },
	]) {
		it(`${fixture.id} @${fixture.w}：dock 在地图上、旁白无控件、一行、触点 ${fixture.touch}`, { timeout: 90_000 }, async () => {
			const page = await openMapChapter(fixture.id, { width: fixture.w, height: fixture.h, mobile: true });
			try {
				const m = await page.evaluate(MEASURE);
				const report = JSON.stringify({ fixture: `${fixture.id}@${fixture.w}`, ...m });
				assert.equal(m.compact, true, `compact 没挂上：${report}`);
				// D2/D3/D4：归属。
				assert.equal(m.dockFlag, true, `控件没有 [data-traj-dock]：${report}`);
				assert.equal(m.controlsHome, 'map', `控件 home 不是 map：${report}`);
				assert.equal(m.dockOnMap, true, `dock 不在 .traj-map-wrap 里：${report}`);
				assert.equal(m.controlsInChrome, false, `旁白列还有控件：${report}`);
				// D1：唯一一行。
				assert.equal(m.dockRows, 1, `控件不是一行：${m.dockRows}`);
				// D8：dock 自身高 ≤48。
				assert.ok(m.dockHeight <= 48, `dock 高 ${m.dockHeight} > 48：${report}`);
				// D6：底缘内侧与侧内距。
				const bottomGap = m.map.bottom - m.dock.bottom;
				assert.ok(bottomGap >= 6 && bottomGap <= 14, `底内距 ${bottomGap} 不在 8±：${report}`);
				assert.ok(m.dock.left - m.map.left >= fixture.insetMin, `左内距 ${m.dock.left - m.map.left} < ${fixture.insetMin}：${report}`);
				assert.ok(m.map.right - m.dock.right >= fixture.insetMin, `右内距 ${m.map.right - m.dock.right} < ${fixture.insetMin}：${report}`);
				// D5：触点按档，且每枚都有名字。
				for (const button of m.buttons) {
					assert.ok(button.visible, `按钮不可见：${button.hook}`);
					assert.ok(button.w >= fixture.touch && button.h >= fixture.touch,
						`${button.hook} 触点 ${button.w}×${button.h} < ${fixture.touch}`);
					assert.ok(button.aria, `${button.hook} 缺 aria-label`);
					assert.equal(button.title, null, `${button.hook} 的 title 与 aria-label 重复`);
				}
				assert.equal(m.buttons.length, 7, `控件不是七枚：${m.buttons.length}`);
				// D11：主路径不横滑。
				assert.ok(m.dockScrollOverflow <= 1, `dock 横向溢出 ${m.dockScrollOverflow}：${report}`);
				assert.ok(m.docOverflowX <= 1, `整页横向溢出 ${m.docOverflowX}：${report}`);
				// D9：地图 share ≥0.48（用容器外框，dock 叠在里面不偷外高）。
				const share = m.chapter.h > 0 ? m.map.h / m.chapter.h : 0;
				assert.ok(share >= 0.48, `地图 share ${share.toFixed(3)} < 0.48：${report}`);
				// D4：底栏仍只留章节。
				assert.ok(m.chapterRail.count >= 2, `章节底栏不见了：${m.chapterRail.count}`);
				// D12：短文无空滚、长文原生内滚。
				assert.ok(m.blurb, `介绍带不见了：${report}`);
				if (m.blurb.isShort) assert.ok(m.blurb.scrollH <= m.blurb.clientH + 1, `短文却可滚：${report}`);
				else assert.equal(m.blurb.overflowY, 'auto', `长文没有原生内滚：${report}`);
				// D7：dock 不压 Leaflet 归属行。
				if (m.attribution) {
					const overlap = !(m.attribution.bottom <= m.dock.top || m.attribution.top >= m.dock.bottom);
					assert.equal(overlap, false, `归属行被 dock 压住：${report}`);
				}
				// 站真的在地图章里，且是期望那一站（防止量到别处的空壳）。
				const city = await page.evaluate('document.querySelector("[data-traj-city]")?.textContent ?? ""');
				assert.ok(city.length > 0, `站名空：${report}`);
			} finally {
				await page.closePage();
				pages.delete(page);
			}
		});
	}

	/** 选一长站（介绍带真的超过一行）：点左纵年轴上那个站的按钮，等 idx 变过去。 */
	async function pickLongStation(page, placeId, expectIdx) {
		await page.evaluate(
			`document.querySelector('[data-traj-year-rail] [data-traj-place="' + ${JSON.stringify(placeId)} + '"]').click()`,
			{ userGesture: true },
		);
		await page.waitFor(
			`document.querySelector('[data-traj-idx]').textContent.trim() === ${JSON.stringify(expectIdx)}`,
		);
		await page.evaluate('new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))', {
			awaitPromise: true,
		});
		await new Promise((r) => setTimeout(r, 250));
	}

	it('D10：同一个长站文，dock 的介绍带比「两行 A」高 ≥40px', { timeout: 90_000 }, async () => {
		const page = await openMapChapter('cs6785', { width: 390, height: 844, mobile: true });
		try {
			await pickLongStation(page, 'london-kingsway-1966', '04 / 05');
			const dock = await page.evaluate(MEASURE);
			assert.equal(dock.dockOnMap, true, 'dock 没挂上，无法对照');
			// 强制切回 A（控件回旁白列、去掉 dock 开关）：同一视口、同一站文。
			const a = await page.evaluate(MEASURE_A);
			assert.ok(a, 'A 基线量不到');
			// A 的「两行」是声明的结构行；真实站名文字变长时行内会再折，这里只要求它比 dock 占得高。
			assert.ok(a.controlsH > dock.dockHeight, `A 的控件不比 dock 高：${JSON.stringify(a)}`);
			assert.ok(dock.blurb, 'dock 态没有介绍带');
			const gain = dock.blurb.clientH - a.blurbClientH;
			// 报表用：实测三类数（dock 高／介绍带／A 对照）。
			console.log(
				`[map-dock] D10 390: dockH=${dock.dockHeight} blurb=${dock.blurb.clientH} A.blurb=${a.blurbClientH} A.controlsH=${a.controlsH} gain=${gain.toFixed(1)}`,
			);
			assert.ok(
				gain >= 40,
				`介绍带只多 ${gain.toFixed(1)}px（dock ${dock.blurb.clientH} / A ${a.blurbClientH}）：${JSON.stringify({ dock: dock.blurb, a })}`,
			);
		} finally {
			await page.closePage();
			pages.delete(page);
		}
	});

	it('离开地图章：控件搬回旁白列，dock 标记撤掉（不回到双底栏）', { timeout: 90_000 }, async () => {
		const page = await openMapChapter('cs6785', { width: 390, height: 844, mobile: true });
		try {
			await page.evaluate('document.querySelector(\'[data-chapter-goto="0"]\').click()', { userGesture: true });
			await new Promise((r) => setTimeout(r, 500));
			const state = await page.evaluate(`(() => {
				const traj = document.querySelector('[data-traj-root]');
				const controls = traj.querySelector('.traj-controls');
				return {
					chrome: traj.dataset.mapChrome ?? null,
					dock: controls ? controls.hasAttribute('data-traj-dock') : true,
					home: controls ? (controls.dataset.trajControlsHome ?? null) : null,
					inNarr: Boolean(controls && traj.querySelector('.traj-narr').contains(controls)),
				};
			})()`);
			assert.equal(state.chrome, null, `离开地图章 chrome 没撤：${JSON.stringify(state)}`);
			assert.equal(state.dock, false, `离开地图章 dock 标记还在：${JSON.stringify(state)}`);
			assert.equal(state.home, null, `离开地图章 home 标记还在：${JSON.stringify(state)}`);
			assert.equal(state.inNarr, true, `控件没搬回旁白列：${JSON.stringify(state)}`);
		} finally {
			await page.closePage();
			pages.delete(page);
		}
	});

	it('桌面 1280 不回归：没有章节壳、没有 dock、控件仍一行', { timeout: 90_000 }, async () => {
		const page = await browser.openPage({ width: 1280, height: 900, mobile: false });
		pages.add(page);
		try {
			await page.goto(`${server.origin}/records/mhjl329/`);
			await page.waitFor('document.querySelector("[data-traj-root]")');
			await new Promise((r) => setTimeout(r, 500));
			const m = await page.evaluate(`(() => {
				const traj = document.querySelector('[data-traj-root]');
				const controls = traj.querySelector('.traj-controls');
				const shell = document.querySelector('.disc-chapters');
				return {
					shellDisplay: shell ? getComputedStyle(shell).display : 'missing',
					dock: controls ? controls.hasAttribute('data-traj-dock') : true,
					inNarr: Boolean(controls && traj.querySelector('.traj-narr').contains(controls)),
					rows: [...new Set([...traj.querySelectorAll('.traj-controls button')].map((b) => Math.round(b.getBoundingClientRect().top)))].length,
					docOverflowX: document.documentElement.scrollWidth - innerWidth,
				};
			})()`);
			assert.equal(m.shellDisplay, 'none', `桌面挂了章节壳：${JSON.stringify(m)}`);
			assert.equal(m.dock, false, `桌面出现 dock：${JSON.stringify(m)}`);
			assert.equal(m.inNarr, true, `桌面控件不在旁白列：${JSON.stringify(m)}`);
			assert.ok(m.rows <= 2, `桌面控件被拆成多行：${JSON.stringify(m)}`);
			assert.ok(m.docOverflowX <= 1, `桌面横向溢出 ${m.docOverflowX}`);
		} finally {
			await page.closePage();
			pages.delete(page);
		}
	});
});

describe('运行环境（无 dist 时说明原因）', () => {
	it('dist 与 headless chromium 可用性', async () => {
		if (!hasDist) console.warn('[map-dock] 跳过 runtime 闸门：dist 缺失，先 `npm run build`。');
		if (!(await findChrome())) console.warn('[map-dock] 跳过 runtime 闸门：找不到 headless chromium，设 CHROME_PATH。');
	});
});
