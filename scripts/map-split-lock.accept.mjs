#!/usr/bin/env node
/**
 * 手机地图章分界锁验收（Playwright，对着本地 preview）。
 *
 * 同一宽度、竖屏下，分界 y 相对入章时 Δ≤1px：点击换站、飞行中、触摸换站、
 * 探索、滚介绍窗、只改视口高（±56／±80／±144，先缩后放、先放后缩）。
 * 底栏整段留在视觉视口里。改宽或横竖屏可以重算，之后再次稳定。
 *
 *   npm run build && npm run preview
 *   npm run accept:map-split
 *
 * BASE_URL  默认 http://127.0.0.1:4321
 * CHROME_PATH  默认 /usr/bin/google-chrome，其次 /opt/google/chrome/chrome
 * DISCS  默认 d37779,cs6785,ms6338（乌得勒支、长站文、另一张有图碟）
 *
 *  stdout 是一份 JSON：每步 split y、Δ、底栏，以及 PASS／FAIL。退出码 0／1。
 */
import { access } from 'node:fs/promises';
import { chromium } from 'playwright-core';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:4321';
const DISCS = (process.env.DISCS || 'd37779,cs6785,ms6338')
	.split(',')
	.map((s) => s.trim())
	.filter(Boolean);
const VIEWS = [
	{ width: 320, height: 568 },
	{ width: 390, height: 844 },
	{ width: 430, height: 932 },
];
const HEIGHT_DELTAS = [56, 80, 144];
const CHROME_CANDIDATES = [
	process.env.CHROME_PATH,
	'/usr/bin/google-chrome',
	'/opt/google/chrome/chrome',
];

const MEASURE = `(() => {
	const num = (v) => +Number(v).toFixed(2);
	const rectOf = (el) => {
		if (!el) return null;
		const r = el.getBoundingClientRect();
		return { x: num(r.x), y: num(r.y), w: num(r.width), h: num(r.height), bottom: num(r.bottom) };
	};
	const traj = document.querySelector('[data-traj-root]');
	const chapter = traj?.closest('[data-chapter]') || null;
	const wrap = traj?.querySelector('.traj-map-wrap') || null;
	const map = traj?.querySelector('.traj-map') || null;
	const narr = traj?.querySelector('.traj-narr') || null;
	const rail = document.querySelector('.disc-chapter-rail');
	const blurb = traj?.querySelector('[data-traj-blurb]') || null;
	const bearing = traj?.querySelector('[data-traj-bearing]') || null;
	const dock = traj?.querySelector('.traj-controls') || null;
	const cr = chapter?.getBoundingClientRect();
	const mr = map?.getBoundingClientRect();
	const wr = wrap?.getBoundingClientRect();
	const vv = window.visualViewport;
	return {
		splitY: wr ? num(wr.bottom) : null,
		mapH: mr ? num(mr.height) : null,
		narrH: narr ? num(narr.getBoundingClientRect().height) : null,
		share: mr && cr && cr.height ? +(mr.height / cr.height).toFixed(4) : null,
		idx: traj?.querySelector('[data-traj-idx]')?.textContent?.trim() ?? null,
		city: traj?.querySelector('[data-traj-city]')?.textContent?.trim() ?? null,
		view: traj?.dataset.trajView ?? null,
		locked: traj?.hasAttribute('data-split-lock') ?? false,
		lockPx: traj ? getComputedStyle(traj).getPropertyValue('--disc-map-row-lock').trim() : '',
		docked: Boolean(dock?.hasAttribute('data-traj-dock')),
		dockInMap: Boolean(dock && wrap && wrap.contains(dock)),
		railCount: document.querySelectorAll('.disc-chapter-rail [data-chapter-goto]').length,
		bearing: bearing && !bearing.hidden ? (bearing.textContent || '').replace(/\\s+/g, ' ').trim() : '',
		blurbScrollable: blurb ? blurb.scrollHeight > blurb.clientHeight + 1 : false,
		chapter: chapter?.dataset.chapterKind || document.querySelector('[data-disc-chapters]')?.dataset.chapterCurrent || null,
		rail: rectOf(rail),
		viewport: { w: window.innerWidth, h: window.innerHeight },
		vv: vv ? { h: num(vv.height), offsetTop: num(vv.offsetTop), bottom: num(vv.offsetTop + vv.height) } : null,
	};
})()`;

async function findChrome() {
	for (const candidate of CHROME_CANDIDATES) {
		if (!candidate) continue;
		try {
			await access(candidate);
			return candidate;
		} catch {
			/* next */
		}
	}
	return null;
}

function railInside(sample) {
	if (!sample?.rail || !sample.vv) return false;
	const { rail, vv } = sample;
	return rail.y >= vv.offsetTop - 1 && rail.bottom <= vv.bottom + 1 && rail.h >= 24;
}

function step(name, sample, entrySplit, extra = {}) {
	const delta = sample?.splitY == null || entrySplit == null ? null : +(sample.splitY - entrySplit).toFixed(2);
	const splitOk = delta != null && Math.abs(delta) <= 1;
	const railOk = railInside(sample);
	return {
		name,
		splitY: sample?.splitY ?? null,
		delta,
		mapH: sample?.mapH ?? null,
		narrH: sample?.narrH ?? null,
		idx: sample?.idx ?? null,
		city: sample?.city ?? null,
		view: sample?.view ?? null,
		rail: sample?.rail ?? null,
		railOk,
		ok: splitOk && railOk,
		...extra,
	};
}

async function read(page) {
	return page.evaluate(MEASURE);
}

async function openMap(page) {
	await page.goto(`${BASE}/records/${page.__disc}/`, { waitUntil: 'load', timeout: 60_000 });
	await page.evaluate(() => document.fonts?.ready ?? Promise.resolve());
	await page.waitForFunction(
		() => {
			const shell = document.querySelector('[data-disc-chapters]');
			return Boolean(shell && !shell.hidden && shell.querySelector('.disc-chapter-rail'));
		},
		{ timeout: 20_000 },
	);
	await page.locator('.disc-chapter-rail button', { hasText: '地图' }).click();
	await page.waitForFunction(
		() => {
			const root = document.querySelector('[data-traj-root]');
			return (
				root?.dataset.mapChrome === 'compact' &&
				root.hasAttribute('data-split-lock') &&
				root.querySelector('.traj-controls')?.hasAttribute('data-traj-dock')
			);
		},
		{ timeout: 20_000 },
	);
	await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

async function swipeMap(page) {
	const box = await page.evaluate(() => {
		const map = document.querySelector('.traj-map');
		const r = map.getBoundingClientRect();
		return { x: r.x + r.width / 2, y: r.y + Math.min(r.height * 0.62, r.height - 24), h: r.height };
	});
	const dist = Math.min(160, Math.max(90, box.h * 0.42));
	const session = await page.context().newCDPSession(page);
	const points = (y) => [{ x: box.x, y, id: 1, radiusX: 6, radiusY: 6, force: 1 }];
	await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: points(box.y) });
	const steps = 8;
	for (let i = 1; i <= steps; i += 1) {
		await page.waitForTimeout(24);
		await session.send('Input.dispatchTouchEvent', {
			type: 'touchMove',
			touchPoints: points(box.y - (dist * i) / steps),
		});
	}
	await page.waitForTimeout(24);
	await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
	await session.detach();
}

async function untilIdxChanges(page, prev) {
	await page.waitForFunction((before) => document.querySelector('[data-traj-idx]')?.textContent !== before, prev, {
		timeout: 12_000,
	});
	await page.waitForTimeout(80);
}

async function runDisc(browser, disc, view) {
	const context = await browser.newContext({
		viewport: { width: view.width, height: view.height },
		isMobile: true,
		hasTouch: true,
		deviceScaleFactor: 1,
		locale: 'zh-CN',
		reducedMotion: 'no-preference',
	});
	const page = await context.newPage();
	page.__disc = disc;
	const errors = [];
	page.on('pageerror', (error) => errors.push(String(error)));
	const steps = [];
	const fail = (name, detail) => {
		steps.push({ name, ok: false, ...detail });
	};
	try {
		await openMap(page);
		const entry = await read(page);
		const entrySplit = entry.splitY;
		const expectedNarr = view.width <= 389 ? 148.38 : 201.19;
		const narrOk = entry.narrH != null && Math.abs(entry.narrH - expectedNarr) <= 1;
		const shareFloor = view.width === 320 && view.height === 568 ? 0.6397 : view.width === 390 && view.height === 844 ? 0.7021 : null;
		const shareOk = shareFloor == null || (entry.share != null && entry.share >= shareFloor);
		const entryStep = step('entry', entry, entrySplit, {
			narrOk,
			shareOk,
			dockOk: entry.docked && entry.dockInMap,
			railCountOk: entry.railCount === 4,
			locked: entry.locked,
			share: entry.share,
			expectedNarr,
			shareFloor,
		});
		entryStep.ok = entryStep.ok && narrOk && shareOk && entry.docked && entry.dockInMap && entry.railCount === 4 && entry.locked;
		steps.push(entryStep);

		const beforeClick = entry.idx;
		await page.evaluate(() => {
			window.__fly = [];
			window.__flyStop = false;
			const loop = () => {
				if (window.__flyStop) return;
				const traj = document.querySelector('[data-traj-root]');
				const wrap = traj?.querySelector('.traj-map-wrap');
				const bearing = traj?.querySelector('[data-traj-bearing]');
				const rail = document.querySelector('.disc-chapter-rail');
				const vv = window.visualViewport;
				window.__fly.push({
					splitY: wrap ? +wrap.getBoundingClientRect().bottom.toFixed(2) : null,
					bearing: bearing && !bearing.hidden ? (bearing.textContent || '').replace(/\s+/g, ' ').trim() : '',
					railBottom: rail ? +rail.getBoundingClientRect().bottom.toFixed(2) : null,
					railTop: rail ? +rail.getBoundingClientRect().top.toFixed(2) : null,
					railH: rail ? +rail.getBoundingClientRect().height.toFixed(2) : null,
					vvBottom: vv ? +(vv.offsetTop + vv.height).toFixed(2) : null,
					vvTop: vv ? +vv.offsetTop.toFixed(2) : null,
				});
				requestAnimationFrame(loop);
			};
			loop();
		});
		await page.locator('[data-traj-next]').click();
		await untilIdxChanges(page, beforeClick);
		const flight = await page.evaluate(() => {
			window.__flyStop = true;
			return window.__fly;
		});
		const flightSplits = flight.map((frame) => frame.splitY).filter((y) => y != null);
		const flightDelta = flightSplits.length ? Math.max(...flightSplits.map((y) => Math.abs(y - entrySplit))) : null;
		const bearingSeen = flight.some((frame) => frame.bearing.includes('航向 →'));
		const flightRailOk = flight.every(
			(frame) =>
				frame.railH >= 24 &&
				frame.railTop >= frame.vvTop - 1 &&
				frame.railBottom <= frame.vvBottom + 1,
		);
		const settledClick = await read(page);
		const clickStep = step('click-next', settledClick, entrySplit, {
			flightSamples: flight.length,
			flightMaxAbsDelta: flightDelta == null ? null : +flightDelta.toFixed(2),
			bearingSeen,
			flightRailOk,
		});
		clickStep.ok = clickStep.ok && flightDelta != null && flightDelta <= 1 && bearingSeen && flightRailOk;
		steps.push(clickStep);

		const beforeSwipe = settledClick.idx;
		await swipeMap(page);
		await untilIdxChanges(page, beforeSwipe);
		steps.push(step('touch-swipe', await read(page), entrySplit));

		await page.locator('[data-traj-explore]').click();
		await page.waitForFunction(() => document.querySelector('[data-traj-root]')?.dataset.trajView === 'explore');
		steps.push(step('explore', await read(page), entrySplit));
		await page.locator('[data-traj-guide]').click();
		await page.waitForFunction(() => document.querySelector('[data-traj-root]')?.dataset.trajView === 'guide');
		steps.push(step('guide', await read(page), entrySplit));

		const scrolled = await page.evaluate(() => {
			const blurb = document.querySelector('[data-traj-blurb]');
			if (!blurb) return { scrolled: false };
			const can = blurb.scrollHeight > blurb.clientHeight + 1;
			blurb.scrollTop = blurb.scrollHeight;
			return { scrolled: true, can, top: blurb.scrollTop };
		});
		steps.push(step('blurb-scroll', await read(page), entrySplit, scrolled));
		await page.evaluate(() => {
			const blurb = document.querySelector('[data-traj-blurb]');
			if (blurb) blurb.scrollTop = 0;
		});
		steps.push(step('blurb-scroll-top', await read(page), entrySplit));

		for (const delta of HEIGHT_DELTAS) {
			await page.setViewportSize({ width: view.width, height: view.height - delta });
			await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
			steps.push(step(`h-${delta}`, await read(page), entrySplit));
			await page.setViewportSize({ width: view.width, height: view.height });
			await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
			steps.push(step(`h-${delta}-back`, await read(page), entrySplit));
			await page.setViewportSize({ width: view.width, height: view.height + delta });
			await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
			steps.push(step(`h+${delta}`, await read(page), entrySplit));
			await page.setViewportSize({ width: view.width, height: view.height });
			await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
			steps.push(step(`h+${delta}-back`, await read(page), entrySplit));
		}

		await page.locator('.disc-chapter-rail button', { hasText: '述语' }).click();
		await page.waitForFunction(() => document.querySelector('[data-traj-root]')?.dataset.mapChrome !== 'compact');
		await page.waitForTimeout(250);
		await page.locator('.disc-chapter-rail button', { hasText: '地图' }).click();
		await page.waitForFunction(
			() => document.querySelector('[data-traj-root]')?.dataset.mapChrome === 'compact',
			{ timeout: 10_000 },
		);
		await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
		steps.push(step('return-chapter', await read(page), entrySplit));

		if (disc === 'd37779' && view.width === 390 && view.height === 844) {
			await page.setViewportSize({ width: 360, height: 844 });
			await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
			const widened = await read(page);
			const widthStep = step('width-360', widened, entrySplit);
			widthStep.recomputed = widthStep.delta != null && Math.abs(widthStep.delta) > 1;
			widthStep.ok = Boolean(widthStep.railOk && widthStep.recomputed && widened.locked);
			steps.push(widthStep);
			const widthSplit = widened.splitY;
			await page.setViewportSize({ width: 360, height: 764 });
			await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
			steps.push(step('width-360-h-80', await read(page), widthSplit));
			await page.setViewportSize({ width: 700, height: 420 });
			await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
			const landed = await read(page);
			const landStep = step('orient-landscape', landed, entrySplit);
			landStep.recomputed = landStep.delta != null && Math.abs(landStep.delta) > 1;
			landStep.ok = Boolean(landStep.railOk && landStep.recomputed && landed.locked);
			steps.push(landStep);
			const landSplit = landed.splitY;
			await page.setViewportSize({ width: 700, height: 476 });
			await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
			steps.push(step('orient-landscape-h+56', await read(page), landSplit));
			await page.setViewportSize({ width: 390, height: 844 });
			await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
			steps.push(step('restored-390x844', await read(page), entrySplit));
		}

		return {
			disc,
			viewport: `${view.width}x${view.height}`,
			entrySplitY: entrySplit,
			pass: steps.every((item) => item.ok) && errors.length === 0,
			errors,
			steps,
		};
	} catch (error) {
		fail('threw', { error: String(error) });
		return {
			disc,
			viewport: `${view.width}x${view.height}`,
			entrySplitY: null,
			pass: false,
			errors,
			steps,
		};
	} finally {
		await context.close();
	}
}

const chrome = await findChrome();
if (!chrome) {
	console.error('找不到 Chrome。设置 CHROME_PATH。');
	process.exit(2);
}
try {
	const probe = await fetch(BASE, { method: 'GET' });
	if (!probe.ok && probe.status !== 404) throw new Error(`status ${probe.status}`);
} catch (error) {
	console.error(`preview 没起来（${BASE}）：${error}. 先 npm run build && npm run preview`);
	process.exit(2);
}

const browser = await chromium.launch({
	executablePath: chrome,
	headless: true,
	args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const runs = [];
try {
	for (const view of VIEWS) {
		for (const disc of DISCS) {
			runs.push(await runDisc(browser, disc, view));
		}
	}
} finally {
	await browser.close();
}

const report = {
	pass: runs.every((run) => run.pass),
	base: BASE,
	runs,
};
console.log(JSON.stringify(report, null, 2));
process.exit(report.pass ? 0 : 1);
