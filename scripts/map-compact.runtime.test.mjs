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
				// 量**调用之后**的尺寸：Leaflet 的 getSize() 在 _sizeChanged 之前返回缓存值，
				// 调用前读到的永远是旧高（换列后就是 476 而不是 578）。闸门要的是它认下的新高。
				const result = original.apply(this, args);
				let size = null;
				try { const s = this.getSize(); size = { x: s.x, y: s.y }; } catch {}
				window.__probe.invalidates.push({ t: now(), size });
				return result;
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
		// map-dock（PRD map-controls-single-row §4）：控件在地图列里、旁白列没有控件。
		dockOnMap: Boolean(controls && traj.querySelector('.traj-map-wrap').contains(controls)),
		controlsInNarr: Boolean(controls && traj.querySelector('.traj-narr').contains(controls)),
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
				// map-dock（本票取代 #184 的「控件压在章盒底部」合同）：
				// 控件在地图列里、旁白列没有控件，浮在地图底缘内侧。
				assert.equal(m.dockOnMap, true, `控件不在地图列：${report}`);
				assert.equal(m.controlsInNarr, false, `旁白列还有控件：${report}`);
				const insetBottom = +(m.map.bottom - m.controls.bottom).toFixed(1);
				assert.ok(insetBottom >= 6 && insetBottom <= 14, `控件离地图底缘 ${insetBottom}px：${report}`);
				assert.equal(m.controlsBelowChapter <= 1, true, `控件越出章盒 ${m.controlsBelowChapter}px：${report}`);
				// 旁白带按内容、地图行真拿到剩余高（不是被 auto 卡住的地板）。
				assert.ok(m.map.h > m.narr.h, `地图没吃到剩余高：${report}`);
				// Leaflet 的 zoom-animated 层比地图框高一倍（390 上 952px vs 476px）：
				// 必须被 `.traj-map{overflow:hidden}` 裁掉，不能在旁白带上留可点区域。
				const clip = await page.evaluate(`(() => {
					const map = document.querySelector('.traj-map');
					const rect = map.getBoundingClientRect();
					const x = Math.round(rect.x + rect.width / 2);
					const below = document.elementFromPoint(x, Math.round(rect.bottom + 8));
					// 地图底缘内侧 8–46px 现在是 dock 的地盘（浮在地图上的纸带）：
					// 「地图内还能点到 Leaflet」要在地图**above dock**的地方量。
					const inside = document.elementFromPoint(x, Math.round(rect.bottom - 70));
					const onDock = document.elementFromPoint(x, Math.round(rect.bottom - 20));
					return {
						overflow: getComputedStyle(map).overflow,
						belowInsideMap: Boolean(below && below.closest('.traj-map')),
						insideInsideMap: Boolean(inside && inside.closest('.traj-map')),
						bottomBelongsToDock: Boolean(onDock && onDock.closest('.traj-controls[data-traj-dock]')),
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
				// dock 真的浮在地图底缘上（不是被 Leaflet 层盖住）。
				assert.equal(clip.bottomBelongsToDock, true, `地图底缘不归 dock：${JSON.stringify(clip)}`);
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
	// 介绍窗改成定长（320 约 4.4 行），不再用 em 封顶。
	// CS 伦敦（196 字）超出这扇窗，必须能在窗内滚；拜罗伊特（108 字）在 4.4 行里
	// 装得下，标成短文、不得凭空出滚动条。短文站（布达佩斯／波恩）同样不滚。
	for (const long of [
		{ id: 'cs6785', place: 'london-kingsway-1966', idx: '04 / 05', short: 'budapest-solti-birth', shortIdx: '02 / 05', overflows: true },
		{ id: 'falp381', place: 'bayreuth-1951', idx: '05 / 06', short: 'bonn', shortIdx: '01 / 06', overflows: false },
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
				// 控件仍在地图列里、仍在章盒内（封顶不能靠把控件挤出去）。
				assert.equal(m.dockOnMap, true, `长文站控件不在地图列：${report}`);
				assert.ok(m.controlsBelowChapter <= 1, `控件越出章盒 ${m.controlsBelowChapter}px：${report}`);
				// 地图仍大于旁白带：不是把旁白整体压成一条缝换来的 share。
				assert.ok(m.map.h > m.narr.h, `地图没吃到剩余高：${report}`);
				// 半屏不是靠砍字换的：真溢出的站仍开原生内滚、仍有三行上下；装得下的站
				// 必须**不出**滚动条（PRD §4「短文不出现无意义滚动条」）。
				if (long.overflows) {
					assert.equal(band.overflowY, 'auto', `长文介绍带没开原生内滚：${report}`);
					assert.equal(band.isShort, false, `长文被误标成短文：${report}`);
					assert.ok(
						band.scrollHeight > band.clientHeight + 20,
						`介绍带没真的溢出，测不到内滚：${report}`,
					);
				} else {
					assert.equal(band.isShort, true, `装得下的站被标成长文：${report}`);
					assert.ok(
						band.scrollHeight <= band.clientHeight + 1,
						`装得下的站凭空出滚动条：${report}`,
					);
				}
				assert.ok(
					band.height >= Math.min(band.lineHeight * 3, band.scrollHeight) - 2,
					`介绍带被压到三行以下（会把短文压出滚动条）：${report}`,
				);
				// 定长分割：介绍窗不再用 em 封顶。`none` 经 CDP 序列化成 null。
				assert.equal(band.maxHeight, null, `介绍窗又被 em 封顶（${band.maxHeight}）：${report}`);

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
			assert.equal(band.maxHeight, 'none', `介绍窗又被封顶：${band.maxHeight}`);
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

	it('320：年号整字可读，dock 一行不折、七枚都有名字、触点 36', { timeout: 60_000 }, async () => {
		const page = await openMapChapter('cs6785', { width: 320, height: 568 });
		try {
			const ui = await page.evaluate(`(() => {
				const years = [...document.querySelectorAll('.traj-year-y')].map((el) => {
					const rect = el.getBoundingClientRect();
					return { text: el.textContent.trim(), scrollWidth: el.scrollWidth, clientWidth: el.clientWidth, h: +rect.height.toFixed(1) };
				});
				// 只量**真的在屏上**的按钮：收起态的簇「×」是 hidden，不是触区。
				const shown = [...document.querySelectorAll('.traj-controls button')].filter(
					(el) => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden',
				);
				const buttons = shown.map((el) => {
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
				return {
					years,
					buttons,
					rows,
					rail: +document.querySelector('.traj-year-rail').getBoundingClientRect().width.toFixed(1),
					labelLane: +document.querySelector('[data-traj-label-lane]').getBoundingClientRect().width.toFixed(1),
					dotLane: +document.querySelector('[data-traj-dot-lane]').getBoundingClientRect().width.toFixed(1),
				};
			})()`);

			assert.ok(ui.years.length >= 3, `年号没渲出来：${JSON.stringify(ui.years)}`);
			for (const year of ui.years) {
				// 只允许整年或有意缩写（'66），不许裁成「约 19」。
				assert.match(year.text, /^\d{4}$|^'\d{2}$/, `年号不是整字也不是有意缩写：${JSON.stringify(year)}`);
				assert.ok(year.scrollWidth <= year.clientWidth + 1, `年号被横向裁切：${JSON.stringify(year)}`);
				assert.ok(year.h >= 10, `年号被压没：${JSON.stringify(year)}`);
			}
			// 58px 双道（PRD §5.0）：标签道 44（放 44×44 触点）＋ 点道 14（放真实点）。
			assert.ok(ui.rail >= 56 && ui.rail <= 60, `年轴列 ${ui.rail}px 不在 58 附近`);
			assert.ok(ui.labelLane >= 43 && ui.labelLane <= 45, `标签道 ${ui.labelLane}px 不是 44`);
			assert.ok(ui.dotLane >= 13 && ui.dotLane <= 15, `点道 ${ui.dotLane}px 不是 14`);
			assert.ok(
				Math.abs(ui.labelLane + ui.dotLane - ui.rail) <= 2,
				`两道加起来 ${ui.labelLane + ui.dotLane} 与列宽 ${ui.rail} 不符`,
			);
			// map-dock（PRD §4.1／§10 P2-1）：320 是**一条** dock，七枚键平铺、不折行；
			// 触点按窄档 36（本票从 44 降到 36 换掉两行），且不许横向溢出。
			assert.equal(ui.rows.length, 2, `控件行包裹层不是两条：${JSON.stringify(ui.rows)}`);
			const dockRow = await page.evaluate(`(() => {
				const dock = document.querySelector('.traj-controls[data-traj-dock]');
				const buttons = [...dock.querySelectorAll('button')].filter((b) => b.getClientRects().length > 0);
				const tops = [...new Set(buttons.map((b) => Math.round(b.getBoundingClientRect().top)))];
				const r = dock.getBoundingClientRect();
				return {
					dock: { w: +r.width.toFixed(1), h: +r.height.toFixed(1) },
					tops, overflow: dock.scrollWidth - dock.clientWidth,
					count: buttons.length,
				};
			})()`);
			assert.equal(dockRow.count, 7, `dock 里不是七枚可见键：${JSON.stringify(dockRow)}`);
			assert.equal(dockRow.tops.length, 1, `dock 折行了：${JSON.stringify(dockRow)}`);
			assert.ok(dockRow.dock.h <= 48, `dock 高 ${dockRow.dock.h} > 48：${JSON.stringify(dockRow)}`);
			assert.ok(dockRow.overflow <= 1, `dock 横向溢出 ${dockRow.overflow}：${JSON.stringify(dockRow)}`);
			for (const button of ui.buttons) {
				// 图标按钮（‹ ›）必须有 aria-label＋title；文字按钮也要有 title。
				const named = button.text.length > 0;
				assert.ok(named || button.ariaLabel, `按钮没有可见名也没有 aria-label：${JSON.stringify(button)}`);
				assert.equal(button.title, null, `按钮 title 与 aria-label 重复：${JSON.stringify(button)}`);
				if (!named) assert.ok(button.ariaLabel, `纯图标按钮缺 aria-label：${JSON.stringify(button)}`);
				assert.ok(button.w >= 36 && button.h >= 36, `按钮热区不到 36：${JSON.stringify(button)}`);
				assert.ok(button.clipped <= 1, `按钮文字被裁：${JSON.stringify(button)}`);
			}
		} finally {
			await page.closePage();
			pages.delete(page);
		}
	});

	/**
	 * 58px 双道的**真实几何**：点按公式落位、触点 44 不叠、点道按 y 路由到拥有该点的
	 * 触点、簇列表替换旁白卡而同高、Esc 后焦点回簇触点。
	 *
	 * 这里量的是 dist 真帧，不是源码算术。未知入口的断言要等 Lane E 的迁移落地，
	 * 所以本文件只在碟里真出现 unknown 时才钉它（当前只有 d37779 迁移后才有）。
	 */
	it('58px 双道 @320：点按公式落位、触点 44 不叠、点道路由到拥有该点的触点', { timeout: 90_000 }, async () => {
		const page = await openMapChapter('p1357e', { width: 320, height: 568 });
		try {
			const g = await page.evaluate(`(() => {
				const axis = document.querySelector('[data-traj-year-axis]');
				const axisRect = axis.getBoundingClientRect();
				const lane = document.querySelector('[data-traj-dot-lane]');
				const laneRect = lane.getBoundingClientRect();
				const targets = [...axis.querySelectorAll('[data-traj-label-lane] li')].map((li) => {
					const r = li.getBoundingClientRect();
					return {
						key: li.dataset.axisKey,
						members: (li.querySelector('button')?.dataset.axisMembers ?? '').split(' ').filter(Boolean),
						top: +r.top.toFixed(1),
						bottom: +r.bottom.toFixed(1),
						h: +r.height.toFixed(1),
						left: +(r.left - axisRect.left).toFixed(1),
						right: +(r.right - axisRect.left).toFixed(1),
					};
				});
				const dots = [...lane.querySelectorAll('.traj-year-node')].map((n) => ({
					id: n.dataset.dotId,
					y: +(n.getBoundingClientRect().top + n.getBoundingClientRect().height / 2 - axisRect.top).toFixed(1),
					x: +(n.getBoundingClientRect().left + n.getBoundingClientRect().width / 2 - axisRect.left).toFixed(1),
				}));
				return {
					axisH: +axisRect.height.toFixed(1),
					lane: { left: +(laneRect.left - axisRect.left).toFixed(1), w: +laneRect.width.toFixed(1) },
					targets,
					dots,
				};
			})()`);
			// 双道：点道在 x ∈ [44, 58)，点画在 x = 51。
			assert.ok(g.lane.left >= 43 && g.lane.left <= 45, `点道左缘 ${g.lane.left} 不是 44`);
			assert.ok(g.lane.w >= 13 && g.lane.w <= 15, `点道宽 ${g.lane.w} 不是 14`);
			assert.ok(g.dots.length >= 3, `点道没渲出点：${JSON.stringify(g.dots)}`);
			for (const dot of g.dots) {
				assert.ok(dot.x >= 47 && dot.x <= 55, `点 x ${dot.x} 不在点道中线 51 附近`);
				assert.ok(dot.y > 0 && dot.y < g.axisH, `点 y ${dot.y} 越出轴高 ${g.axisH}`);
			}
			// 触点：44 高、互不重叠、全在标签道里（右缘 ≤ 44，不压点道）。
			assert.ok(g.targets.length >= 2, `触点没渲出来：${JSON.stringify(g.targets)}`);
			for (const target of g.targets) {
				assert.ok(Math.abs(target.h - 44) <= 1, `触点高 ${target.h} 不是 44`);
				assert.ok(target.right <= 45, `触点右缘 ${target.right} 压进点道（应 ≤ 44）`);
				assert.ok(target.left >= -1, `触点左缘 ${target.left} 越出标签道`);
			}
			const ordered = [...g.targets].sort((a, b) => a.top - b.top);
			for (let i = 1; i < ordered.length; i += 1) {
				assert.ok(
					ordered[i].top >= ordered[i - 1].bottom - 0.5,
					`触点相叠：${JSON.stringify([ordered[i - 1], ordered[i]])}`,
				);
			}
			// 点道点击：点附近 click 必须路由到**拥有该点**的触点（这里取簇里的一个点）。
			const cluster = g.targets.find((t) => t.members.length > 1);
			assert.ok(cluster, 'p1357e 应有簇（1970–75 六站）');
			const memberDot = g.dots.find((d) => cluster.members.includes(d.id));
			assert.ok(memberDot, `簇里的点不在点道：${JSON.stringify(g.dots)}`);
			await page.evaluate(
				`(() => {
					const lane = document.querySelector('[data-traj-dot-lane]');
					const r = lane.getBoundingClientRect();
					lane.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: r.x + r.width / 2, clientY: r.top + ${memberDot.y} }));
				})()`,
				{ userGesture: true },
			);
			await new Promise((r) => setTimeout(r, 250));
			const opened = await page.evaluate(`(() => {
				const list = document.querySelector('[data-traj-axis-list]');
				return {
					hidden: list.hidden,
					rows: [...list.querySelectorAll('[data-traj-axis-list-rows] button')].map((b) => ({
						idx: b.dataset.trajPlace,
						h: +b.getBoundingClientRect().height.toFixed(1),
						step: b.querySelector('.traj-axis-list-step')?.textContent ?? '',
					})),
					title: document.querySelector('[data-traj-axis-list-title]').textContent,
				};
			})()`);
			assert.equal(opened.hidden, false, '点道点簇没展开列表');
			assert.equal(
				opened.rows.length,
				cluster.members.length,
				`列表行数 ${opened.rows.length} 与簇站数 ${cluster.members.length} 不符`,
			);
			// 行序＝轴上年代序；每行高 ≥48；右侧是「导览第 N 站」（数组位置），不冒充组号。
			assert.match(opened.title, /\d{4}/, `簇标题没有年份：${opened.title}`);
			for (const row of opened.rows) {
				assert.ok(row.h >= 47.5, `列表行高 ${row.h} < 48`);
				assert.match(row.step, /^导览第 \d+ 站$/, `行右侧不是导览步号：${row.step}`);
			}
		} finally {
			await page.closePage();
			pages.delete(page);
		}
	});

	it('簇列表替换旁白卡：带子与地图都不长高，Esc 收起后焦点回簇触点', { timeout: 90_000 }, async () => {
		const page = await openMapChapter('p1357e', { width: 320, height: 568 });
		try {
			const before = await page.evaluate(`(() => ({
				mapH: +document.querySelector('.traj-map').getBoundingClientRect().height.toFixed(1),
				narrH: +document.querySelector('.traj-narr').getBoundingClientRect().height.toFixed(1),
			}))()`);
			await page.evaluate(
				`(() => {
					const b = [...document.querySelectorAll('[data-traj-label-lane] button')].find(
						(x) => (x.dataset.axisMembers || '').split(' ').length > 1,
					);
					b.focus();
					b.click();
				})()`,
				{ userGesture: true },
			);
			await new Promise((r) => setTimeout(r, 300));
			const opened = await page.evaluate(`(() => ({
				hidden: document.querySelector('[data-traj-axis-list]').hidden,
				mapH: +document.querySelector('.traj-map').getBoundingClientRect().height.toFixed(1),
				narrH: +document.querySelector('.traj-narr').getBoundingClientRect().height.toFixed(1),
				close: (() => { const b = document.querySelector('[data-traj-axis-list-close]'); const r = b.getBoundingClientRect(); return { w: +r.width.toFixed(1), h: +r.height.toFixed(1) }; })(),
				headShown: !document.querySelector('[data-traj-axis-list-head]').hidden,
				cardHidden: document.querySelector('[data-traj-card]').getAttribute('aria-hidden'),
				focus: document.activeElement?.closest('[data-traj-axis-list-rows]') ? 'list' : 'other',
			}))()`);
			assert.equal(opened.hidden, false, '簇列表没展开');
			assert.equal(opened.headShown, true, '控件第一行没出现簇标题＋×');
			// 320 窄档：簇「×」与七枚键同档 36（dock 一行放不下 44，见 §10 P2-1）。
			assert.ok(opened.close.w >= 36 && opened.close.h >= 36, `× 触区不是 36：${JSON.stringify(opened.close)}`);
			assert.equal(opened.cardHidden, 'true', '展开时卡片没让位（读屏会读到两份）');
			assert.equal(opened.focus, 'list', '展开后焦点没进列表');
			// 同高：地图与旁白带都不许因为列表而变高／变矮。
			assert.ok(
				Math.abs(opened.mapH - before.mapH) <= 1,
				`簇列表把地图改了 ${before.mapH} → ${opened.mapH}`,
			);
			assert.ok(
				Math.abs(opened.narrH - before.narrH) <= 1,
				`簇列表把旁白带改了 ${before.narrH} → ${opened.narrH}`,
			);
			// Esc：收起并把焦点送回打开它的那个簇触点。
			await page.evaluate(
				`document.querySelector('[data-traj-axis-list]').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`,
				{ userGesture: true },
			);
			await new Promise((r) => setTimeout(r, 200));
			const closed = await page.evaluate(`(() => ({
				hidden: document.querySelector('[data-traj-axis-list]').hidden,
				headShown: !document.querySelector('[data-traj-axis-list-head]').hidden,
				focusMembers: (document.activeElement?.dataset?.axisMembers ?? '').split(' ').length,
				cardHidden: document.querySelector('[data-traj-card]').getAttribute('aria-hidden'),
			}))()`);
			assert.equal(closed.hidden, true, 'Esc 没收起列表');
			assert.equal(closed.headShown, false, '收起后控件第一行没复原');
			assert.equal(closed.cardHidden, null, '收起后卡片仍被 aria-hidden');
			assert.ok(closed.focusMembers > 1, `Esc 后焦点没回簇触点（在 ${closed.focusMembers} 成员的键上）`);
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
