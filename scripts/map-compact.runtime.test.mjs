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
	window.__probe = { invalidates: [], events: [], gestures: [], settled: [], scroll: [], idx: [] };
	const now = () => Math.round(performance.now());
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
				window.__probe.invalidates.push({ t: now(), size });
				return original.apply(this, args);
			};
			proto.invalidateSize.__probeWrapped = true;
		},
	});
	window.__probe.state = () => {
		const blurb = document.querySelector('[data-traj-blurb]');
		const shell = document.querySelector('.disc-chapters');
		return {
			t: now(),
			top: blurb ? Math.round(blurb.scrollTop) : null,
			max: blurb ? Math.round(blurb.scrollHeight - blurb.clientHeight) : null,
			idx: document.querySelector('[data-traj-idx]')?.textContent ?? null,
			city: document.querySelector('[data-traj-city]')?.textContent ?? null,
			edge: shell?.dataset.chapterEdge ?? null,
			chapter: shell?.dataset.chapterCurrent ?? null,
		};
	};
	const wire = () => {
		const root = document.querySelector('[data-traj-root]');
		if (!root || root.__probed) return;
		root.__probed = true;
		for (const name of ['traj:show', 'traj:stage-layout', 'traj:pause', 'traj:hold']) {
			root.addEventListener(name, () => {
				const shell = document.querySelector('.disc-chapters');
				window.__probe.events.push({
					kind: name,
					t: now(),
					chapter: shell ? shell.dataset.chapterCurrent : null,
					edge: shell ? shell.dataset.chapterEdge ?? null : null,
				});
			});
		}
		// 介绍带每次原生滚动：用来判断「这一手势有没有滚字」——不是靠 begin/end 的 top 差。
		const blurb = document.querySelector('[data-traj-blurb]');
		if (blurb && !blurb.__probed) {
			blurb.__probed = true;
			blurb.addEventListener('scroll', () => window.__probe.scroll.push({ t: now(), top: Math.round(blurb.scrollTop) }), { passive: true });
		}
		const idxEl = document.querySelector('[data-traj-idx]');
		if (idxEl && !idxEl.__probed) {
			idxEl.__probed = true;
			new MutationObserver(() => window.__probe.idx.push({ t: now(), idx: idxEl.textContent }))
				.observe(idxEl, { childList: true, characterData: true, subtree: true });
		}
		root.addEventListener('traj:gesture', (event) => {
			const detail = event.detail;
			let current = window.__probe.gestures.find((g) => g.gid === detail.gestureId);
			if (detail.phase === 'begin') {
				current = {
					gid: detail.gestureId,
					t0: now(),
					phases: ['begin'],
					station: false,
					blocked: false,
					probes: [],
					begin: window.__probe.state(),
				};
				window.__probe.gestures.push(current);
				return;
			}
			if (!current) return;
			current.phases.push(detail.phase);
			if (detail.station === true) current.station = true;
			if (detail.blocked === true) current.blocked = true;
			if (detail.probe) current.probes.push(detail.probe.metric + ':' + detail.probe.distance);
			if (detail.phase === 'end' || detail.phase === 'cancel') {
				current.t1 = now();
				current.end = window.__probe.state();
			}
		});
		root.addEventListener('traj:station-settled', (event) => {
			window.__probe.settled.push({ t: now(), gid: event.detail.gestureId, dir: event.detail.dir });
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

	/** 桥／壳／idx／scrollTop 全部静默 rounds×step（默认 700ms），最多 timeout。 */
	async function settle(page, { rounds = 14, step = 50, timeout = 12_000 } = {}) {
		const started = Date.now();
		let last = '';
		let same = 0;
		while (Date.now() - started < timeout) {
			const signature = await page.evaluate(`(() => {
				const blurb = document.querySelector('[data-traj-blurb]');
				const shell = document.querySelector('.disc-chapters');
				return [Math.round(blurb.scrollTop), Math.round(blurb.scrollHeight), Math.round(blurb.clientHeight),
					document.querySelector('[data-traj-idx]').textContent, shell.dataset.chapterCurrent,
					shell.dataset.chapterEdge ?? '', window.__probe.gestures.length, window.__probe.scroll.length,
					window.__probe.settled.length, window.__probe.idx.length].join('|');
			})()`);
			same = signature === last ? same + 1 : 0;
			last = signature;
			if (same >= rounds) return true;
			await new Promise((r) => setTimeout(r, step));
		}
		return false;
	}

	/** 等到 idx 真的变成期望值（站真的落地），而不是 sleep 后猜。 */
	async function waitForIdx(page, expect, timeout = 12_000) {
		const started = Date.now();
		while (Date.now() - started < timeout) {
			const idx = await page.evaluate('document.querySelector("[data-traj-idx]").textContent');
			if (idx === expect) return { ok: true, ms: Date.now() - started };
			await new Promise((r) => setTimeout(r, 50));
		}
		return { ok: false, ms: Date.now() - started };
	}

	/** 站换过之后介绍带的盒子会变（53→84）：每次起手前重新量，别用旧坐标。 */
	async function blurbAim(page) {
		return page.evaluate(`(() => {
			const rect = document.querySelector('[data-traj-blurb]').getBoundingClientRect();
			return { x: Math.round(rect.x + rect.width / 2), y: Math.round(rect.y + 15), top: Math.round(rect.top), h: Math.round(rect.height) };
		})()`);
	}

	/**
	 * 一次真实触摸竖滑，并把它自己那一个 gid 切片返回。
	 *
	 * 关键：等「真落定」再读——站落地实测要 2.6s，固定 sleep 1s 会把「已提交、还在飞」
	 * 读成「没反应」（独立验收 F1 的读法就是这么来的）。
	 */
	async function swipeAndSlice(page, label, { dy = 90 } = {}) {
		const aim = await blurbAim(page);
		const before = await page.evaluate('window.__probe.state()');
		const gidFrom = await page.evaluate('window.__probe.gestures.length');
		const scrollFrom = await page.evaluate('window.__probe.scroll.length');
		await page.swipe({ x: aim.x, from: aim.y + dy / 2, to: aim.y - dy / 2, steps: 8, frameMs: 20 });
		await settle(page);
		const raw = await page.evaluate('window.__probe');
		const gestures = raw.gestures.slice(gidFrom);
		const scroll = raw.scroll.slice(scrollFrom);
		for (const gesture of gestures) {
			const lo = gesture.t0 - 40;
			const hi = (gesture.t1 ?? Number.MAX_SAFE_INTEGER) + 40;
			gesture.scrollEvents = scroll.filter((entry) => entry.t >= lo && entry.t <= hi).length;
			// 「这一手势滚了字」按**净位移**判，不按原始 scroll 事件数：
			// 到边回弹会把 top 抖 1px，事件数会说谎，净位移不会。
			const beginTop = gesture.begin?.top ?? null;
			const endTop = gesture.end?.top ?? null;
			gesture.scrolled = beginTop !== null && endTop !== null && endTop !== beginTop;
		}
		return { label, aim, before, after: await page.evaluate('window.__probe.state()'), gestures };
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

	/**
	 * 长站文 @320：**同一屏**里既要有 ≥0.48 的地图，也要有真能内滚的介绍带。
	 *
	 * 这是 PR #184 独立验收的挡点（当时 CS 伦敦 04/05 与 FALP 拜罗伊特 05/06 都只
	 * 到 0.473）：长文把介绍带撑到 5.6em 满格，旁白行按内容长高，地图被挤回地板。
	 * 修法是把**旁白行**封顶（`fit-content(47%)`）并让长文介绍带在行内缩到三行，
	 * 所以这里的断言必须同时钉住「地图够高」与「字还滚得动」——只钉一个都能作弊。
	 */
	for (const long of [
		{ id: 'cs6785', place: 'london-kingsway-1966', idx: '04 / 05', short: 'budapest-solti-birth', shortIdx: '01 / 05' },
		{ id: 'falp381', place: 'bayreuth-1951', idx: '05 / 06', short: 'bonn', shortIdx: '01 / 06' },
	]) {
		it(`${long.id} @320 长站文：地图仍 ≥48% 章盒，且介绍带真能滚`, { timeout: 120_000 }, async () => {
			const page = await openMapChapter(long.id, { width: 320, height: 568 });
			try {
				await page.waitFor(`document.querySelector('.traj-stops [data-traj-place="${long.place}"]')`, {
					timeout: 15_000,
				});
				await page.evaluate(`document.querySelector('.traj-stops [data-traj-place="${long.place}"]').click()`, {
					userGesture: true,
				});
				const landed = await waitForIdx(page, long.idx);
				assert.ok(landed.ok, `${long.place} 没落地：${JSON.stringify(await page.evaluate('window.__probe.state()'))}`);
				await settle(page);

				const m = await measure(page);
				const band = await page.evaluate(`(() => {
					const blurb = document.querySelector('[data-traj-blurb]');
					const style = getComputedStyle(blurb);
					return {
						overflowY: style.overflowY,
						maxHeight: Number.parseFloat(style.maxHeight),
						height: +blurb.getBoundingClientRect().height.toFixed(1),
						fontSize: Number.parseFloat(style.fontSize),
						lineHeight: Number.parseFloat(style.lineHeight),
						scrollHeight: blurb.scrollHeight,
						clientHeight: blurb.clientHeight,
						isShort: blurb.classList.contains('is-short'),
					};
				})()`);
				const share = m.map.h / m.chapter.h;
				const report = JSON.stringify({ long, ...m, band, share: +share.toFixed(3) });
				// 挡点本体：320 长文站也要 ≥0.48（PRD §6.1），且仍明显高于 180 地板。
				assert.ok(share >= 0.48, `长文站地图占比 ${share.toFixed(3)} < 0.48：${report}`);
				assert.ok(m.map.h >= 200, `长文站地图只比 180 高一丁点：${report}`);
				// 控件仍在章盒内、下面没空洞（封顶不能靠把控件挤出去）。
				assert.ok(m.controlsBelowChapter <= 1, `控件越出章盒 ${m.controlsBelowChapter}px：${report}`);
				assert.ok(m.gapBelowControls <= 2, `控件下方空 ${m.gapBelowControls}px：${report}`);
				// 地图仍大于旁白带：不是把旁白整体压成一条缝换来的 share。
				assert.ok(m.map.h > m.narr.h, `地图没吃到剩余高：${report}`);
				// 半屏不是靠砍字换的：长文仍开原生内滚，且带高仍有三行上下。
				assert.equal(band.overflowY, 'auto', `长文介绍带没开原生内滚：${report}`);
				assert.equal(band.isShort, false, `长文被误标成短文：${report}`);
				assert.ok(
					band.scrollHeight > band.clientHeight + 20,
					`介绍带没真的溢出，测不到内滚：${report}`,
				);
				assert.ok(
					band.height >= band.lineHeight * 3 - 2,
					`介绍带被压到三行以下（会把短文压出滚动条）：${report}`,
				);
				// 5.6em 是相对**字号**（320 上 13px → 72.8px），不是相对行高。
				assert.ok(Math.abs(band.maxHeight - band.fontSize * 5.6) <= 2, `5.6em 封顶没了：${report}`);

				// 短文站同视口仍不出现无意义滚动条（反向回归）。
				// 换站要等真落地（2.6s+）：短文站的 `.is-short` 在落地后才由
				// syncBlurbOverflow 重算，读早了读到的是上一站的长文几何。
				await page.evaluate(`document.querySelector('.traj-stops [data-traj-place="${long.short}"]').click()`, {
					userGesture: true,
				});
				// 跨城飞行实测 3.6s＋旁白落定，满载时给足 20s（不是放宽断言，是等真落地）。
				const shortLanded = await waitForIdx(page, long.shortIdx, 20_000);
				assert.ok(shortLanded.ok, `短文站 ${long.short} 没落地`);
				await settle(page);
				const short = await page.evaluate(`(() => {
					const blurb = document.querySelector('[data-traj-blurb]');
					return {
						isShort: blurb.classList.contains('is-short'),
						scrollHeight: blurb.scrollHeight,
						clientHeight: blurb.clientHeight,
						overflowY: getComputedStyle(blurb).overflowY,
					};
				})()`);
				const shortMeasure = await measure(page);
				const shortShare = shortMeasure.map.h / shortMeasure.chapter.h;
				assert.equal(short.isShort, true, `短文没标 is-short：${JSON.stringify(short)}`);
				assert.ok(
					short.scrollHeight <= short.clientHeight + 1,
					`短文凭空多出滚动条：${JSON.stringify(short)}`,
				);
				assert.ok(
					shortShare >= 0.48,
					`短文站 share ${shortShare.toFixed(3)} 反而掉了：${JSON.stringify(shortMeasure)}`,
				);
			} finally {
				await page.closePage();
				pages.delete(page);
			}
		});
	}

	it('CS 伦敦站站简介在带内原生滚到末尾；到边那次只滚字，下一次同向手势就换站', { timeout: 120_000 }, async () => {
		const page = await openMapChapter('cs6785', { width: 390, height: 844 });
		try {
			await page.evaluate(
				'document.querySelector(\'.traj-stops [data-traj-place="london-kingsway-1966"]\').click()',
				{ userGesture: true },
			);
			// 站要真的落地（实测 2.6s），不能 sleep 后猜。
			const landed = await waitForIdx(page, '04 / 05');
			assert.ok(landed.ok, `伦敦站没落地：${JSON.stringify(await page.evaluate('window.__probe.state()'))}`);
			await settle(page);

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
				};
			})()`);
			assert.equal(band.overflowY, 'auto', '介绍带没开原生内滚');
			// 5.6em @15px = 84px：封顶在 CSS，不在 JS。
			assert.ok(Math.abs(Number.parseFloat(band.maxHeight) - 84) <= 1, `介绍带封顶 ${band.maxHeight}`);
			assert.ok(band.scrollHeight > band.clientHeight + 20, '伦敦站长文没溢出，测不到内滚');
			assert.equal(band.isShort, false, '长文被误标成 is-short');

			// PRD §4.4 的口径：**把字滚到边的那一次**只停；「松手后的下一次同向手势」才换站。
			// 所以先只用真实手指滚，直到某一次滑完 scrollTop 到 max——那一次就是「到边」。
			let edgeStep = null;
			for (let i = 0; i < 5 && !edgeStep; i += 1) {
				const step = await swipeAndSlice(page, `滚字${i + 1}`);
				for (const gesture of step.gestures) {
					assert.equal(
						gesture.station,
						false,
						`还在滚字／刚滚到边就报了站动作（应当只停）：${JSON.stringify(gesture)}`,
					);
					assert.equal(gesture.blocked, false, `滚字不该被判作废：${JSON.stringify(gesture)}`);
				}
				if (step.before.top !== step.before.max && step.after.top === step.after.max) edgeStep = step;
			}
			assert.ok(edgeStep, `真实触摸滚不到介绍带末尾：${JSON.stringify(await page.evaluate('window.__probe.state()'))}`);
			// 到边那一次不 arm、不换站、不切章。
			assert.equal(edgeStep.after.idx, edgeStep.before.idx, `到边那一次就换站了：${JSON.stringify(edgeStep)}`);
			assert.equal(edgeStep.after.edge, null, `到边那一次就 arm 了（arm 属于确认之后）：${JSON.stringify(edgeStep)}`);
			assert.equal(edgeStep.after.chapter, edgeStep.before.chapter, `到边那一次就切章了：${JSON.stringify(edgeStep)}`);

			// 下一次同向手势（真实触摸、松手之后）：正好换一站，不多滑一次。
			const confirm = await swipeAndSlice(page, '确认');
			const claimed = confirm.gestures.filter((gesture) => gesture.station);
			assert.equal(claimed.length, 1, `到边后的下一次同向手势没换站（或多换）：${JSON.stringify(confirm.gestures)}`);
			assert.equal(claimed[0].scrolled, false, `换站那一次还在滚字（双重归属）：${JSON.stringify(claimed[0])}`);
			assert.equal(claimed[0].blocked, false, `换站那一次同时被判作废：${JSON.stringify(claimed[0])}`);
			assert.equal(claimed[0].blocked, false, `换站那一次不该被判作废：${JSON.stringify(claimed[0])}`);
			const swapped = await waitForIdx(page, '05 / 05');
			assert.ok(swapped.ok, `换站没落地：${JSON.stringify(confirm.after)}`);
			// 站换了，介绍带换成新站、重新从头读（要等落地之后再读）。
			await settle(page);
			const afterSwap = await page.evaluate('window.__probe.state()');
			assert.equal(afterSwap.idx, '05 / 05', `换站后 idx 不对：${JSON.stringify(afterSwap)}`);
			assert.equal(afterSwap.top, 0, `换站后介绍带没复位：${JSON.stringify(afterSwap)}`);

			// 证据图落在系统临时目录（仓里不留二进制）。
			await page.screenshot(join(tmpdir(), 'map-compact-london-390.png')).catch(() => {});
		} finally {
			await page.closePage();
			pages.delete(page);
		}
	});

	it('不变量：同一个手势不许既滚介绍带又报 station／blocked', { timeout: 120_000 }, async () => {
		const page = await openMapChapter('cs6785', { width: 390, height: 844 });
		try {
			await page.evaluate(
				'document.querySelector(\'.traj-stops [data-traj-place="london-kingsway-1966"]\').click()',
				{ userGesture: true },
			);
			assert.ok((await waitForIdx(page, '04 / 05')).ok, '伦敦站没落地');
			await settle(page);

			const every = [];
			// 连续 5 次同向滑动：覆盖「带内滚」「到边」「换站」「飞行中提前按下」四种窗口。
			for (let i = 1; i <= 5; i += 1) {
				every.push(await swipeAndSlice(page, `#${i}`));
			}

			const violations = [];
			for (const step of every) {
				for (const gesture of step.gestures) {
					// 真双 claim：这一次既滚了字又拿走了一个站。
					if (gesture.scrolled && gesture.station) {
						violations.push({ kind: 'scroll+station', step: step.label, ...gesture });
					}
					// 作废（blocked）不等于换站（station）：两个字段必须互斥。
					if (gesture.station && gesture.blocked) {
						violations.push({ kind: 'station+blocked', step: step.label, ...gesture });
					}
				}
			}
			assert.deepEqual(violations, [], `同一手势既滚字又 claim：${JSON.stringify(violations)}`);

			// 桥必须真的动过，否则这条不变量是空转。
			const total = every.reduce((sum, step) => sum + step.gestures.length, 0);
			assert.ok(total >= 3, `5 次滑动只进了 ${total} 个 gid，不变量没被真正检验`);
		} finally {
			await page.closePage();
			pages.delete(page);
		}
	});

	it('末站介绍带到边：只 arm 不切章，松手后同向再滑才切邻章', { timeout: 120_000 }, async () => {
		const page = await openMapChapter('cs6785', { width: 390, height: 844 });
		try {
			await page.evaluate(
				'document.querySelector(\'.traj-stops [data-traj-place="england-press-cs6785"]\').click()',
				{ userGesture: true },
			);
			assert.ok((await waitForIdx(page, '05 / 05')).ok, '末站没落地');
			await settle(page);

			// 先程序滚到末尾（去掉「滚字」这个变量），再只用真实手指做边界动作。
			await page.evaluate(`(() => { const b = document.querySelector('[data-traj-blurb]'); b.scrollTop = b.scrollHeight; })()`);
			await new Promise((r) => setTimeout(r, 250));
			await settle(page);
			const start = await page.evaluate('window.__probe.state()');
			assert.equal(start.top, start.max, `介绍带没在末尾：${JSON.stringify(start)}`);

			// ① 到边后的一次：只 arm，不换站、不切章。
			const armed = await swipeAndSlice(page, 'arm', { dy: 70 });
			assert.equal(armed.after.chapter, start.chapter, `同一次手势里就切章了：${JSON.stringify(armed)}`);
			assert.equal(armed.after.idx, start.idx, `同一次手势里就换站了：${JSON.stringify(armed)}`);
			assert.equal(armed.after.edge, 'bottom', `到边没 arm（#183 共用 arm 没接上）：${JSON.stringify(armed)}`);
			for (const gesture of armed.gestures) {
				assert.equal(gesture.station, false, `带内滚却报了站动作：${JSON.stringify(gesture)}`);
			}

			// ② 松手后再来的同向手势：走既有 arm → 下一章。
			const crossed = await swipeAndSlice(page, 'confirm', { dy: 70 });
			assert.equal(crossed.after.chapter, '3', `释放后再滑没切章：${JSON.stringify(crossed)}`);

			// ③ 一次手势最多一次提交：资料章里再滑不动。
			const again = await swipeAndSlice(page, 'after', { dy: 70 });
			assert.equal(again.after.chapter, '3', `一滑多提交：${JSON.stringify(again)}`);
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
			// 「这次点选之后调过 invalidateSize」按**调用序号**切，不按时间戳：客户端先
			// 调 invalidateSize、探针后记 traj:show，同一个同步 tick 里两者的时间戳能差
			// 十几毫秒（中间还有 frameDiscOnce／declutter），按 t 过滤会把它漏掉。
			const invFrom = await page.evaluate('window.__probe.invalidates.length');
			await page.evaluate('document.querySelector(\'[data-chapter-goto="2"]\').click()', { userGesture: true });
			await page.waitFor('document.querySelector("[data-traj-root]").dataset.mapChrome === "compact"');
			await new Promise((r) => setTimeout(r, 900));
			const m = await measure(page);
			const probe = await page.evaluate('window.__probe');
			const showEvents = probe.events.filter((e) => e.kind === 'traj:show');
			assert.equal(showEvents.length, 1, `traj:show 次数不对：${JSON.stringify(probe.events)}`);
			// 合同（disc-chapter-reader.goTo）：点章底栏没有 200ms 过渡，尺寸在 handoff 的
			// rAF 里就定了，所以这一路**不该**有 traj:stage-layout；`traj:show` 的处理里
			// 已经做过 syncBlurbOverflow + invalidateSize。这条闸门留着，但钉的是「没有」。
			assert.equal(
				probe.events.filter((e) => e.kind === 'traj:stage-layout').length,
				0,
				`goTo 路径不该发 traj:stage-layout：${JSON.stringify(probe.events)}`,
			);
			const afterShow = probe.invalidates.slice(invFrom);
			assert.ok(afterShow.length >= 1, `章显示后没调 invalidateSize：${JSON.stringify(probe.events)}|${JSON.stringify(probe.invalidates)}`);
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
			// 合同（disc-chapter-reader.commitChapter）：竖滑／键盘切章走 200ms 过渡，
			// 尺寸到 finish() 才定，所以这一路必须有 traj:stage-layout。
			// 点章底栏走 goTo()，没有过渡、也没有这个事件（下面单独钉）。
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
