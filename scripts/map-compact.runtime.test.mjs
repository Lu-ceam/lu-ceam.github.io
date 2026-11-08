/**
 * 手机地图章 compact chrome：**真实构建**的几何与手势闸门（headless chromium + CDP）。
 *
 * 为什么要有这一层：PR #184 第一版把「舞台吃满」写成源码 regex ＋ 算术，结果是
 * `TrajectoryMap.astro` 的 scoped 窄屏规则（同特异度、后注入）把 global.css 的
 * compact 行盖回 `auto minmax(0,1fr)`，实测 390 的地图仍是 180px 地板、章盒占 24%。
 * 只有量的到的 bbox 能挡住这类回归，所以这里对 `dist` 起静态服务、真的开一次
 * 地图章，量 map／chapter／narr／controls，并驱动真实触摸。
 *
 * 前提：先 `npm run build`（dist 缺失时本文件 skip，并在输出里说清原因）。
 * 不驱动桌面／GUI；chromium 取自 `CHROME_PATH` 或本机 playwright 缓存。
 */
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, describe, it } from 'node:test';
import { DEFAULT_CHROME_CANDIDATES, findChrome, launchBrowser, startStaticServer } from './lib/cdp-browser.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const dist = join(here, '..', 'dist');
const hasDist = existsSync(join(dist, 'records', 'mhjl329', 'index.html'));
const hasChrome = DEFAULT_CHROME_CANDIDATES.some((path) => path && existsSync(path));

/**
 * 页面内探针（`Page.addScriptToEvaluateOnNewDocument`，先于任何模块）：
 * 给 Leaflet 的 `invalidateSize` 加计数与尺寸快照，并记录壳与地图之间的桥事件。
 * 只在测试进程里存在，不进生产。
 */
const PROBE = `(() => {
	window.__probe = { invalidates: [], events: [], gestures: [], settled: [] };
	let leaflet = null;
	Object.defineProperty(window, 'L', {
		configurable: true,
		get() { return leaflet; },
		set(value) {
			leaflet = value;
			const proto = value && value.Map && value.Map.prototype;
			const original = proto && proto.invalidateSize;
			if (!original || original.__probeWrapped) return;
			proto.invalidateSize = function (...args) {
				let size = null;
				try { const s = this.getSize(); size = { x: s.x, y: s.y }; } catch {}
				window.__probe.invalidates.push({ t: Math.round(performance.now()), size });
				return original.apply(this, args);
			};
			proto.invalidateSize.__probeWrapped = true;
		},
	});
	const wire = () => {
		const root = document.querySelector('[data-traj-root]');
		if (!root || root.__probed) return;
		root.__probed = true;
		for (const name of ['traj:show', 'traj:stage-layout', 'traj:pause', 'traj:hold']) {
			root.addEventListener(name, () => {
				const shell = document.querySelector('.disc-chapters');
				window.__probe.events.push({
					kind: name,
					t: Math.round(performance.now()),
					chapter: shell ? shell.dataset.chapterCurrent : null,
					edge: shell ? shell.dataset.chapterEdge ?? null : null,
				});
			});
		}
		root.addEventListener('traj:gesture', (event) => {
			window.__probe.gestures.push({
				phase: event.detail.phase,
				gid: event.detail.gestureId,
				station: event.detail.station,
			});
		});
		root.addEventListener('traj:station-settled', (event) => {
			window.__probe.settled.push({ gid: event.detail.gestureId, dir: event.detail.dir });
		});
	};
	document.addEventListener('DOMContentLoaded', wire);
	new MutationObserver(wire).observe(document.documentElement, { childList: true, subtree: true });
})();`;

/** 章盒、舞台、地图、旁白、控件的实测盒子（viewport 坐标，取整到 0.1px）。 */
const MEASURE = `(() => {
	const box = (selector) => {
		const el = document.querySelector(selector);
		if (!el) return null;
		const rect = el.getBoundingClientRect();
		return {
			x: +rect.x.toFixed(1), y: +rect.y.toFixed(1),
			w: +rect.width.toFixed(1), h: +rect.height.toFixed(1),
			top: +rect.top.toFixed(1), bottom: +rect.bottom.toFixed(1),
		};
	};
	const traj = document.querySelector('[data-traj-root]');
	const chapter = traj.closest('[data-chapter]');
	const chapterRect = chapter.getBoundingClientRect();
	const stage = traj.querySelector('.traj-stage');
	const controls = traj.querySelector('.traj-controls');
	return {
		viewport: { w: innerWidth, h: innerHeight },
		compact: traj.dataset.mapChrome === 'compact',
		chapter: { h: +chapterRect.height.toFixed(1), bottom: +chapterRect.bottom.toFixed(1) },
		map: box('.traj-map'),
		stage: box('.traj-stage'),
		narr: box('.traj-narr'),
		controls: box('.traj-controls'),
		stageRows: getComputedStyle(stage).gridTemplateRows,
		controlsBelowChapter: +(controls.getBoundingClientRect().bottom - chapterRect.bottom).toFixed(1),
		gapBelowControls: +(chapterRect.bottom - controls.getBoundingClientRect().bottom).toFixed(1),
	};
})()`;

// 没有构建产物或没有 headless 浏览器时整块跳过：本仓的 `node --test` 要能在
// 任何机器上跑绿，几何闸门只在有能力量它的地方生效（跳过原因在末尾说明）。
const describeRuntime = hasDist && hasChrome ? describe : describe.skip;

describeRuntime('地图章 compact chrome：真实 dist 的几何（headless chromium）', () => {
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

	/** 打开唱片页 → 点底栏「地图」→ 等 compact 落地并落两帧。 */
	async function openMapChapter(id, viewport) {
		const page = await browser.openPage(viewport);
		pages.add(page);
		await page.call('Page.addScriptToEvaluateOnNewDocument', { source: PROBE });
		await page.goto(`${server.origin}/records/${id}/`);
		await page.waitFor('document.querySelector("[data-traj-root]")');
		await page.waitFor('document.querySelector(\'[data-chapter-goto="2"]\')');
		await page.evaluate('document.querySelector(\'[data-chapter-goto="2"]\').click()', { userGesture: true });
		await page.waitFor('document.querySelector("[data-traj-root]").dataset.mapChrome === "compact"');
		// 两帧：`traj:show` 的 rAF 与 Leaflet 的第一次 invalidateSize 都落定。
		await page.evaluate('new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))', {
			awaitPromise: true,
		});
		await new Promise((r) => setTimeout(r, 250));
		return page;
	}

	async function measure(page) {
		return page.evaluate(MEASURE);
	}

	for (const fixture of [
		{ id: 'mhjl329', w: 390, h: 844 },
		{ id: 'cs6785', w: 390, h: 844 },
		{ id: 'mhjl329', w: 320, h: 568 },
		{ id: 'cs6785', w: 320, h: 568 },
		{ id: 'falp381', w: 320, h: 568 },
	]) {
		it(`${fixture.id} @${fixture.w}：地图 ≥48% 章盒、>180px，控件不越界、下面不空`, { timeout: 60_000 }, async () => {
			const page = await openMapChapter(fixture.id, { width: fixture.w, height: fixture.h });
			try {
				const m = await measure(page);
				const share = m.map.h / m.chapter.h;
				const report = JSON.stringify({ fixture, ...m, share: +share.toFixed(3) });
				assert.ok(m.compact, `compact chrome 没挂上：${report}`);
				// PRD §6.1：地图 >140 且 ≥48%；本票地板抬到 180，「明显大于地板」。
				assert.ok(m.map.h > 180, `地图仍在地板：${report}`);
				assert.ok(m.map.h >= 200, `地图只比 180 高一丁点：${report}`);
				assert.ok(share >= 0.48, `地图章盒占比 ${share.toFixed(3)} < 0.48：${report}`);
				// 控件整块在章盒内，且章盒底部没有大片空奶油（PR #184 实测 250px 空洞）。
				assert.ok(m.controlsBelowChapter <= 1, `控件越出章盒 ${m.controlsBelowChapter}px：${report}`);
				assert.ok(m.gapBelowControls <= 2, `控件下方空 ${m.gapBelowControls}px：${report}`);
				// 旁白带按内容、地图行真拿到剩余高（不是被 auto 卡住的地板）。
				assert.ok(m.map.h > m.narr.h, `地图没吃到剩余高：${report}`);
				// Leaflet 的 zoom-animated 层比地图框高一倍（390 上 952px vs 476px）：
				// 必须被 `.traj-map{overflow:hidden}` 裁掉，不能在旁白带上留可点区域。
				const clip = await page.evaluate(`(() => {
					const map = document.querySelector('.traj-map');
					const rect = map.getBoundingClientRect();
					const x = Math.round(rect.x + rect.width / 2);
					const below = document.elementFromPoint(x, Math.round(rect.bottom + 8));
					const inside = document.elementFromPoint(x, Math.round(rect.bottom - 8));
					return {
						overflow: getComputedStyle(map).overflow,
						belowInsideMap: Boolean(below && below.closest('.traj-map')),
						insideInsideMap: Boolean(inside && inside.closest('.traj-map')),
						zoomedH: +((map.querySelector('.leaflet-zoom-animated')?.getBoundingClientRect().height) ?? 0).toFixed(1),
					};
				})()`);
				assert.equal(clip.overflow, 'hidden', `地图框没裁：${JSON.stringify(clip)}`);
				assert.equal(
					clip.belowInsideMap,
					false,
					`地图下方仍能点到 Leaflet 层（扩高没被裁）：${JSON.stringify(clip)}`,
				);
				assert.equal(clip.insideInsideMap, true, `地图内点不到 Leaflet 层：${JSON.stringify(clip)}`);
				const rows = m.stageRows.split(/\s+/).map((v) => Number.parseFloat(v));
				assert.ok(
					Math.abs(rows[0] - m.map.h) <= 4,
					`舞台首行 ${m.stageRows} 与地图 ${m.map.h}px 不符（行分配被别的规则盖了）：${report}`,
				);
			} finally {
				await page.closePage();
				pages.delete(page);
			}
		});
	}

	it('CS 伦敦站的站简介在带内原生滚到末尾，不靠述语章', { timeout: 60_000 }, async () => {
		const page = await openMapChapter('cs6785', { width: 390, height: 844 });
		try {
			await page.evaluate(
				'document.querySelector(\'.traj-stops [data-traj-place="london-kingsway-1966"]\').click()',
				{ userGesture: true },
			);
			await page.waitFor('document.querySelector("[data-traj-city]").textContent === "伦敦"', { timeout: 8000 });
			const band = await page.evaluate(`(() => {
				const blurb = document.querySelector('[data-traj-blurb]');
				const style = getComputedStyle(blurb);
				return {
					overflowY: style.overflowY,
					maxHeight: style.maxHeight,
					scrollHeight: blurb.scrollHeight,
					clientHeight: blurb.clientHeight,
					scrollTop: blurb.scrollTop,
					isShort: blurb.classList.contains('is-short'),
					text: blurb.textContent.slice(0, 12),
				};
			})()`);
			assert.equal(band.overflowY, 'auto', '介绍带没开原生内滚');
			// 5.6em @15px = 84px：封顶在 CSS，不在 JS。
			assert.ok(Math.abs(Number.parseFloat(band.maxHeight) - 84) <= 1, `介绍带封顶 ${band.maxHeight}`);
			assert.ok(band.scrollHeight > band.clientHeight + 20, '伦敦站长文没溢出，测不到内滚');
			assert.equal(band.isShort, false, '长文被误标成 is-short');

			// 原生滚到底（不写 scrollTop 以外的任何东西）。
			await page.evaluate(`(() => { const b = document.querySelector('[data-traj-blurb]'); b.scrollTop = b.scrollHeight; })()`);
			await new Promise((r) => setTimeout(r, 200));
			const atEnd = await page.evaluate(`(() => { const b = document.querySelector('[data-traj-blurb]');
				return { top: Math.round(b.scrollTop), max: Math.round(b.scrollHeight - b.clientHeight) }; })()`);
			assert.equal(atEnd.top, atEnd.max, '介绍带滚不到末尾');
			// 证据图落在系统临时目录（仓里不留二进制）。
			await page
				.screenshot(join(tmpdir(), 'map-compact-london-390.png'))
				.catch(() => {});
		} finally {
			await page.closePage();
			pages.delete(page);
		}
	});

	it('末站介绍带到边：同一手势只停／arm、不双提交；松手后再滑才切章', { timeout: 90_000 }, async () => {
		const page = await openMapChapter('cs6785', { width: 390, height: 844 });
		try {
			await page.evaluate(
				'document.querySelector(\'.traj-stops [data-traj-place="england-press-cs6785"]\').click()',
				{ userGesture: true },
			);
			await page.waitFor('document.querySelector("[data-traj-idx]").textContent.startsWith("05 / 05")', {
				timeout: 8000,
			});
			await new Promise((r) => setTimeout(r, 600));

			const box = await page.evaluate(`(() => {
				const b = document.querySelector('[data-traj-blurb]').getBoundingClientRect();
				return { x: b.x + b.width / 2, y: b.y + b.height / 2, h: b.height };
			})()`);
			assert.ok(box.h > 40, `介绍带太矮，测不到手势：${box.h}`);

			const state = () =>
				page.evaluate(`(() => {
					const b = document.querySelector('[data-traj-blurb]');
					const shell = document.querySelector('.disc-chapters');
					return {
						top: Math.round(b.scrollTop),
						max: Math.round(b.scrollHeight - b.clientHeight),
						chapter: shell.dataset.chapterCurrent,
						edge: shell.dataset.chapterEdge ?? null,
						idx: document.querySelector('[data-traj-idx]').textContent,
					};
				})()`);

			// 先滚到末尾（这一段字仍然归介绍带）。
			await page.evaluate(`(() => { const b = document.querySelector('[data-traj-blurb]'); b.scrollTop = b.scrollHeight; })()`);
			await new Promise((r) => setTimeout(r, 200));
			const before = await state();
			assert.equal(before.top, before.max, '介绍带没在末尾');

			const swipeUp = async () => {
				await page.swipe({ x: box.x, from: box.y + 35, to: box.y - 35, steps: 8, frameMs: 20 });
				await new Promise((r) => setTimeout(r, 700));
			};

			// ① 已在边的一次：只 arm，不换站、不切章。
			await swipeUp();
			const armed = await state();
			assert.equal(armed.chapter, before.chapter, `同一次手势里就切章了：${JSON.stringify(armed)}`);
			assert.equal(armed.idx, before.idx, `同一次手势里就换站了：${JSON.stringify(armed)}`);
			assert.equal(armed.edge, 'bottom', `到边没 arm（#183 共用 arm 没接上）：${JSON.stringify(armed)}`);

			// ② 松手后再来的同向手势：走既有 arm → 下一章。
			await swipeUp();
			const after = await state();
			assert.equal(after.chapter, '3', `释放后再滑没切章（arm 没复用）：${JSON.stringify(after)}`);
			// 一次手势最多一次提交：后续再滑不动（已在资料章）。
			await swipeUp();
			const again = await state();
			assert.equal(again.chapter, '3', `一滑多提交：${JSON.stringify(again)}`);

			// 桥的消息：带内滚的 gid 不能以 station=true 结束（不双提交）。
			const gestures = await page.evaluate('window.__probe.gestures');
			const stationEnds = gestures.filter((g) => g.phase === 'end' && g.station);
			assert.equal(stationEnds.length, 0, `带内滚却报了站动作：${JSON.stringify(gestures)}`);
		} finally {
			await page.closePage();
			pages.delete(page);
		}
	});

	it('章显示与转场结束各真调一次 invalidateSize（尺寸是章内最终高度）', { timeout: 90_000 }, async () => {
		const page = await browser.openPage({ width: 390, height: 844 });
		pages.add(page);
		try {
			await page.call('Page.addScriptToEvaluateOnNewDocument', { source: PROBE });
			await page.goto(`${server.origin}/records/mhjl329/`);
			await page.waitFor('document.querySelector("[data-traj-root]")');
			await page.waitFor('document.querySelector(\'[data-chapter-goto="2"]\')');
			await new Promise((r) => setTimeout(r, 400));

			// ① 走底栏点选（goTo → handoffMap → traj:show）。
			await page.evaluate('document.querySelector(\'[data-chapter-goto="2"]\').click()', { userGesture: true });
			await page.waitFor('document.querySelector("[data-traj-root]").dataset.mapChrome === "compact"');
			await new Promise((r) => setTimeout(r, 900));
			const m = await measure(page);
			const probe = await page.evaluate('window.__probe');
			const showEvents = probe.events.filter((e) => e.kind === 'traj:show');
			assert.equal(showEvents.length, 1, `traj:show 次数不对：${JSON.stringify(probe.events)}`);
			const afterShow = probe.invalidates.filter((call) => call.t >= showEvents[0].t - 2);
			assert.ok(afterShow.length >= 1, '章显示后没调 invalidateSize');
			const sized = afterShow.find(
				(call) => call.size && Math.abs(call.size.y - m.map.h) <= 4 && Math.abs(call.size.x - m.map.w) <= 4,
			);
			assert.ok(
				sized,
				`invalidates 里没有章内最终尺寸 ${JSON.stringify(m.map)}：${JSON.stringify(probe.invalidates)}`,
			);
			assert.ok(sized.size.y > 180, `invalidates 拿到的还是旧高度：${JSON.stringify(sized)}`);

			// ② 述语章 → 竖滑切进地图章（commitChapter 的 200ms 过渡 end）。
			await page.evaluate('document.querySelector(\'[data-chapter-goto="1"]\').click()', { userGesture: true });
			await new Promise((r) => setTimeout(r, 600));
			await page.evaluate(`(() => {
				const pane = [...document.querySelectorAll('[data-chapter-scroll]')].find((el) => el.offsetParent !== null);
				if (pane) pane.scrollTop = pane.scrollHeight;
			})()`);
			await new Promise((r) => setTimeout(r, 250));
			const swipeUp = async () => {
				await page.swipe({ x: 195, from: 600, to: 400, steps: 8, frameMs: 20 });
				await new Promise((r) => setTimeout(r, 700));
			};
			await swipeUp();
			await swipeUp();
			await new Promise((r) => setTimeout(r, 800));
			const m2 = await measure(page);
			assert.equal(m2.compact, true, '竖滑没切进地图章');
			const probe2 = await page.evaluate('window.__probe');
			const layout = probe2.events.filter((e) => e.kind === 'traj:stage-layout');
			assert.ok(layout.length >= 1, `转场结束没发 traj:stage-layout：${JSON.stringify(probe2.events)}`);
			const last = layout[layout.length - 1];
			const afterLayout = probe2.invalidates.filter(
				(call) => call.t >= last.t - 2 && call.size && Math.abs(call.size.y - m2.map.h) <= 4,
			);
			assert.ok(
				afterLayout.length >= 1,
				`转场 end 之后没有按最终尺寸重测：${JSON.stringify(probe2.invalidates)} events=${JSON.stringify(probe2.events)}`,
			);
			// 时序：stage-layout 一定落在这一次章显示之后。
			const show2 = probe2.events.filter((e) => e.kind === 'traj:show');
			assert.ok(last.t >= show2[show2.length - 1].t, `stage-layout 早于章显示：${JSON.stringify(probe2.events)}`);
		} finally {
			await page.closePage();
			pages.delete(page);
		}
	});

	it('320：年号整字可读，控件按钮有名字与 44 触点，两行不折', { timeout: 60_000 }, async () => {
		const page = await openMapChapter('cs6785', { width: 320, height: 568 });
		try {
			const ui = await page.evaluate(`(() => {
				const years = [...document.querySelectorAll('.traj-year-y')].map((el) => {
					const rect = el.getBoundingClientRect();
					return { text: el.textContent.trim(), scrollWidth: el.scrollWidth, clientWidth: el.clientWidth, h: +rect.height.toFixed(1) };
				});
				const buttons = [...document.querySelectorAll('.traj-controls button')].map((el) => {
					const rect = el.getBoundingClientRect();
					return {
						text: el.textContent.trim(),
						ariaLabel: el.getAttribute('aria-label'),
						title: el.getAttribute('title'),
						w: +rect.width.toFixed(1),
						h: +rect.height.toFixed(1),
						clipped: el.scrollWidth - el.clientWidth,
					};
				});
				const rows = [...document.querySelectorAll('.traj-controls-row')].map((row) => {
					const rect = row.getBoundingClientRect();
					return { top: +rect.top.toFixed(1), h: +rect.height.toFixed(1), overflow: row.scrollWidth - row.clientWidth };
				});
				return { years, buttons, rows, rail: +document.querySelector('.traj-year-rail').getBoundingClientRect().width.toFixed(1) };
			})()`);

			assert.ok(ui.years.length >= 3, `年号没渲出来：${JSON.stringify(ui.years)}`);
			for (const year of ui.years) {
				// 只允许整年或有意缩写（'66），不许裁成「约 19」。
				assert.match(year.text, /^\d{4}$|^'\d{2}$/, `年号不是整字也不是有意缩写：${JSON.stringify(year)}`);
				assert.ok(year.scrollWidth <= year.clientWidth + 1, `年号被横向裁切：${JSON.stringify(year)}`);
				assert.ok(year.h >= 10, `年号被压没：${JSON.stringify(year)}`);
			}
			assert.ok(ui.rail >= 40 && ui.rail <= 48, `年轴宽 ${ui.rail}px 不在 44 附近`);
			assert.equal(ui.rows.length, 2, `控件不是两行：${JSON.stringify(ui.rows)}`);
			for (const row of ui.rows) {
				assert.ok(row.overflow <= 1, `控件行横向溢出：${JSON.stringify(row)}`);
				assert.ok(row.h >= 44, `控件行不到 44 触点：${JSON.stringify(row)}`);
			}
			for (const button of ui.buttons) {
				// 图标按钮（‹ ›）必须有 aria-label＋title；文字按钮也要有 title。
				const named = button.text.length > 0;
				assert.ok(named || button.ariaLabel, `按钮没有可见名也没有 aria-label：${JSON.stringify(button)}`);
				assert.ok(button.title, `按钮没有 title：${JSON.stringify(button)}`);
				if (!named) assert.ok(button.ariaLabel, `纯图标按钮缺 aria-label：${JSON.stringify(button)}`);
				assert.ok(button.w >= 44 && button.h >= 44, `按钮热区不到 44：${JSON.stringify(button)}`);
				assert.ok(button.clipped <= 1, `按钮文字被裁：${JSON.stringify(button)}`);
			}
		} finally {
			await page.closePage();
			pages.delete(page);
		}
	});

	it('1280 桌面不回归：章节壳不挂，地图仍是高版式，控件仍是一行', { timeout: 60_000 }, async () => {
		const page = await browser.openPage({ width: 1280, height: 900, mobile: false });
		pages.add(page);
		try {
			await page.goto(`${server.origin}/records/mhjl329/`);
			await page.waitFor('document.querySelector("[data-traj-root]")');
			await new Promise((r) => setTimeout(r, 600));
			const m = await page.evaluate(`(() => {
				const traj = document.querySelector('[data-traj-root]');
				const mapEl = traj.querySelector('.traj-map');
				const shell = document.querySelector('.disc-chapters');
				const buttons = [...traj.querySelectorAll('.traj-controls button')].map((b) => +b.getBoundingClientRect().top.toFixed(1));
				const yearRail = traj.querySelector('.traj-year-rail');
				return {
					shellDisplay: getComputedStyle(shell).display,
					chrome: traj.dataset.mapChrome ?? null,
					mapH: +mapEl.getBoundingClientRect().height.toFixed(1),
					mapW: +mapEl.getBoundingClientRect().width.toFixed(1),
					controlTops: [...new Set(buttons)],
					yearRailWidth: +yearRail.getBoundingClientRect().width.toFixed(1),
					docOverflowX: document.documentElement.scrollWidth - innerWidth,
				};
			})()`);
			assert.equal(m.shellDisplay, 'none', '桌面不该挂窄屏章节壳');
			assert.equal(m.chrome, null, '桌面不该带 compact chrome');
			assert.ok(m.mapH >= 540 && m.mapH <= 580, `桌面地图高度回归：${m.mapH}`);
			assert.ok(m.mapW > 600, `桌面地图宽度回归：${m.mapW}`);
			assert.ok(m.controlTops.length <= 2, `桌面控件被拆成多行：${JSON.stringify(m.controlTops)}`);
			assert.equal(m.yearRailWidth, 0, `桌面出现了窄屏年轴：${m.yearRailWidth}px`);
			assert.ok(m.docOverflowX <= 1, `桌面横向溢出 ${m.docOverflowX}px`);
		} finally {
			await page.closePage();
			pages.delete(page);
		}
	});
});

describe('运行环境（无 dist 时说明原因）', () => {
	it('dist 与 headless chromium 可用性', async () => {
		if (!hasDist) {
			console.warn('[map-compact] 跳过 runtime 几何测试：dist 缺失，先 `npm run build`。');
		}
		const chrome = await findChrome();
		if (!chrome) {
			console.warn('[map-compact] 跳过 runtime 几何测试：找不到 headless chromium，设 CHROME_PATH。');
		}
		// 这里不断言，避免在没有浏览器的机器上把整仓测试拖红；几何断言在上面的 describe 里。
		assert.ok(hasDist === existsSync(join(dist, 'records', 'mhjl329', 'index.html')));
		assert.equal(hasChrome, Boolean(chrome));
	});
});
