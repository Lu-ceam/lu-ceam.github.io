/**
 * 隔离的 headless 浏览器（Chrome DevTools Protocol），只给本仓的 runtime 测试用。
 *
 * 为什么不用 playwright／puppeteer：站仓依赖里没有它们，也不该为一个测试加依赖。
 * Node 22 自带 `WebSocket` 与 `fetch`，够连 CDP；chromium 由环境变量或本机缓存提供。
 *
 * 硬规矩（父代理 2026-11-08 事故后）：**每个 await 都有超时**，关浏览器在 `finally`，
 * 不接管道、不等交互。挂起必须变成一次带错误的失败，不是静默占着 CPU。
 */
import { spawn } from 'node:child_process';
import { access, mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join, normalize } from 'node:path';

const CALL_TIMEOUT_MS = 20_000;

export const DEFAULT_CHROME_CANDIDATES = [
	process.env.CHROME_PATH,
	'/home/box/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome',
	'/home/box/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell',
	'/usr/bin/google-chrome',
	'/opt/ungoogled-chromium/chrome',
];

export async function withTimeout(promise, ms, label) {
	let timer;
	return Promise.race([
		promise,
		new Promise((_, reject) => {
			timer = setTimeout(() => reject(new Error(`timeout ${ms}ms: ${label}`)), ms);
		}),
	]).finally(() => clearTimeout(timer));
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function findChrome() {
	for (const candidate of DEFAULT_CHROME_CANDIDATES) {
		if (!candidate) continue;
		try {
			await access(candidate);
			return candidate;
		} catch {
			/* 下一个候选 */
		}
	}
	return null;
}

const MIME = {
	'.html': 'text/html; charset=utf-8',
	'.css': 'text/css; charset=utf-8',
	'.js': 'text/javascript; charset=utf-8',
	'.mjs': 'text/javascript; charset=utf-8',
	'.json': 'application/json; charset=utf-8',
	'.svg': 'image/svg+xml',
	'.png': 'image/png',
	'.jpg': 'image/jpeg',
	'.webp': 'image/webp',
	'.woff2': 'font/woff2',
	'.xml': 'application/xml; charset=utf-8',
	'.txt': 'text/plain; charset=utf-8',
};

/** dist 的静态服务（目录 → index.html，未知路径 → 404.html 的 404）。 */
export async function startStaticServer(root) {
	const server = createServer(async (req, res) => {
		try {
			const url = new URL(req.url ?? '/', 'http://127.0.0.1');
			let path = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '');
			if (path.endsWith('/')) path += 'index.html';
			let file = join(root, path);
			let body;
			try {
				body = await readFile(file);
			} catch {
				if (!extname(file)) {
					file = join(root, path, 'index.html');
					body = await readFile(file).catch(() => null);
				}
				if (!body) {
					res.writeHead(404, { 'content-type': 'text/html; charset=utf-8' });
					res.end('<p>404</p>');
					return;
				}
			}
			res.writeHead(200, {
				'content-type': MIME[extname(file)] ?? 'application/octet-stream',
				'cache-control': 'no-store',
			});
			res.end(body);
		} catch (error) {
			res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
			res.end(String(error));
		}
	});
	await new Promise((resolve, reject) => {
		server.once('error', reject);
		server.listen(0, '127.0.0.1', resolve);
	});
	const { port } = server.address();
	return {
		origin: `http://127.0.0.1:${port}`,
		close: () => new Promise((resolve) => server.close(() => resolve())),
	};
}

/** 起一个隔离的 headless chromium，返回 CDP 句柄。调用方必须在 finally 里 `close()`。 */
export async function launchBrowser({ chromePath } = {}) {
	const executable = chromePath ?? (await findChrome());
	if (!executable) throw new Error('找不到 headless chromium：设 CHROME_PATH 或安装 playwright 缓存');
	const profile = await mkdtemp(join(tmpdir(), 'map-compact-cdp-'));
	const proc = spawn(
		executable,
		[
			'--headless=new',
			'--no-sandbox',
			'--disable-gpu',
			'--disable-dev-shm-usage',
			'--disable-extensions',
			'--disable-background-networking',
			'--no-first-run',
			'--no-default-browser-check',
			'--force-device-scale-factor=1',
			'--remote-allow-origins=*',
			'--remote-debugging-port=0',
			`--user-data-dir=${profile}`,
			'about:blank',
		],
		{ stdio: 'ignore' },
	);
	const exited = new Promise((resolve) => proc.once('exit', resolve));

	const readPort = async () => {
		for (let i = 0; i < 240; i += 1) {
			if (proc.exitCode !== null) throw new Error(`chrome 退出（code ${proc.exitCode}）`);
			try {
				const txt = await readFile(join(profile, 'DevToolsActivePort'), 'utf8');
				const port = Number(txt.split('\n')[0]);
				if (port > 0) return port;
			} catch {
				/* 还没写出来 */
			}
			await sleep(50);
		}
		throw new Error('chrome 没写出 DevToolsActivePort（20s）');
	};

	let ws;
	const close = async () => {
		try {
			ws?.close();
		} catch {
			/* 已关 */
		}
		proc.kill('SIGKILL');
		await withTimeout(exited, 5000, 'chrome exit').catch(() => {});
		await rm(profile, { recursive: true, force: true }).catch(() => {});
	};

	try {
		const port = await withTimeout(readPort(), 25_000, 'chrome devtools port');
		const version = await withTimeout(
			fetch(`http://127.0.0.1:${port}/json/version`).then((r) => r.json()),
			10_000,
			'json/version',
		);
		ws = new WebSocket(version.webSocketDebuggerUrl.replace('ws://localhost', 'ws://127.0.0.1'));
		await withTimeout(
			new Promise((resolve, reject) => {
				ws.onopen = resolve;
				ws.onerror = () => reject(new Error('CDP websocket 连接失败'));
			}),
			10_000,
			'CDP connect',
		);

		let seq = 0;
		const pending = new Map();
		ws.onmessage = (event) => {
			const msg = JSON.parse(event.data);
			const entry = msg.id ? pending.get(msg.id) : null;
			if (!entry) return;
			pending.delete(msg.id);
			if (msg.error) entry.reject(new Error(`${entry.method}: ${msg.error.message}`));
			else entry.resolve(msg.result);
		};

		const call = (method, params = {}, sessionId) =>
			withTimeout(
				new Promise((resolve, reject) => {
					const id = ++seq;
					pending.set(id, { resolve, reject, method });
					ws.send(JSON.stringify({ id, method, params, sessionId }));
				}),
				CALL_TIMEOUT_MS,
				method,
			);

		const browser = { call, close, version: version.product };
		browser.openPage = (options) => openPage(browser, options);
		return browser;
	} catch (error) {
		await close();
		throw error;
	}
}

/** 打开一个 page，带 mobile 视口、触摸与少量便捷方法。 */
async function openPage(browser, { width, height, mobile = true }) {
	const { targetId } = await browser.call('Target.createTarget', { url: 'about:blank' });
	const { sessionId } = await browser.call('Target.attachToTarget', { targetId, flatten: true });
	const s = (method, params) => browser.call(method, params, sessionId);
	await s('Page.enable');
	await s('Runtime.enable');
	await s('Emulation.setDeviceMetricsOverride', {
		width,
		height,
		deviceScaleFactor: 1,
		mobile,
		screenWidth: width,
		screenHeight: height,
	});
	if (mobile) {
		await s('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
	}

	const evaluate = async (expression, { awaitPromise = false, userGesture = false } = {}) => {
		const result = await s('Runtime.evaluate', {
			expression,
			awaitPromise,
			returnByValue: true,
			userGesture,
		});
		if (result.exceptionDetails) {
			throw new Error(`页面内异常：${result.exceptionDetails.exception?.description ?? result.exceptionDetails.text}`);
		}
		return result.result?.value;
	};

	const waitFor = async (expression, { timeout = 8000, interval = 60 } = {}) => {
		const deadline = Date.now() + timeout;
		while (Date.now() < deadline) {
			if (await evaluate(`Boolean(${expression})`)) return true;
			await sleep(interval);
		}
		throw new Error(`等待超时：${expression}`);
	};

	const goto = async (url) => {
		await s('Page.navigate', { url });
		await waitFor('document.readyState === "complete"', { timeout: 20_000 });
	};

	const touch = (type, points) =>
		s('Input.dispatchTouchEvent', {
			type,
			touchPoints: points.map((point, index) => ({
				x: point.x,
				y: point.y,
				id: point.id ?? index + 1,
				radiusX: 6,
				radiusY: 6,
				force: 1,
			})),
		});

	/** 一次单指竖滑：起点 → 终点，steps 帧，末尾松手（不保留惯性）。 */
	const swipe = async ({ x, from, to, steps = 8, frameMs = 24 }) => {
		await touch('touchStart', [{ x, y: from }]);
		for (let i = 1; i <= steps; i += 1) {
			await sleep(frameMs);
			await touch('touchMove', [{ x, y: from + ((to - from) * i) / steps }]);
		}
		await sleep(frameMs);
		await touch('touchEnd', []);
	};

	const screenshot = async (path) => {
		const { data } = await s('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
		const { writeFile } = await import('node:fs/promises');
		await writeFile(path, Buffer.from(data, 'base64'));
	};

	const closePage = async () => {
		await browser.call('Target.closeTarget', { targetId }).catch(() => {});
	};

	return { call: s, evaluate, waitFor, goto, swipe, touch, screenshot, closePage };
}
