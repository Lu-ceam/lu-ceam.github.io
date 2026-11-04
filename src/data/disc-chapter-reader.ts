/**
 * 窄屏章节壳 v3 的客户端：底栏点选跳章、竖滑滚章内文章、到文头／文末直接跟翻邻章。
 *
 * 只在 `max-width: 47.99rem` 的阅读态里活着（由页面的 settled 条开关），
 * 桌面路径一根手指都不碰。地图章的手势全部留给 traj：这里一个 delta 都不拦。
 *
 * 正文三章都不是拍切：唱片（章内 fill→crop 一镜）、述语（长文）、资料（字段列表）
 * 都是章内自由长滚。唱片章不再用捏合／双击整层放大：进章／切面时自动播一次
 * 博物馆展柜那套「整幅 upright → 对齐 crop 的裁剪窗 → plate＋肘线」。
 */

import {
	type ChapterKey,
	type ChapterMode,
	clampScrollTop,
	type DiscChapter,
	type MapViewMode,
	readVerticalGesture,
	scrollFollowThrough,
	stepChapter,
	verticalOwner,
} from './disc-chapters.ts';
import { coverCropGeometry, coverCropProgress } from './disc-cover-crop.ts';

/** 跟翻后防连翻的短锁：240ms——够挡两下连拖，不再半秒死区。 */
const GESTURE_LOCK_MS = 240;
const LOCK_CLASS = 'disc-chapters-on';
/** 长滚章里方向键一次滚多少：文头／文末之外不换章，只滚文章。 */
const KEY_SCROLL_PX = 120;
/** 触屏竖滑至少这么多像素才算一次跟翻手势。 */
const TOUCH_STEP_PX = 40;
/** 竖滑一过这点位移就算「已在拖竖」：早一步灭橡皮筋，不等满 40px。 */
const TOUCH_SLOP_PX = 6;

export type ChapterReaderOptions = {
	/** `.disc-chapters` */
	shell: HTMLElement;
	/** `article.record-page` */
	page: HTMLElement;
	/** 竖滑与长滚的舞台（不含底栏）。 */
	stage: HTMLElement;
	/** 底栏。 */
	rail: HTMLElement;
	/** 仅在窄屏可用。 */
	isNarrow: () => boolean;
};

export type ChapterReader = {
	setActive(on: boolean): void;
	isActive(): boolean;
	currentChapter(): ChapterKey | null;
	/** 底栏之外的回章口（顶栏小图回唱片）。 */
	goToChapter(key: ChapterKey): void;
};

type Pane = {
	el: HTMLElement;
	kind: ChapterKey;
	mode: ChapterMode;
	scroll: HTMLElement | null;
	mapSlot: HTMLElement | null;
};

function readPanes(shell: HTMLElement): Pane[] {
	return [...shell.querySelectorAll<HTMLElement>('[data-chapter]')].map((el) => ({
		el,
		kind: (el.dataset.chapterKind ?? 'record') as ChapterKey,
		mode: (el.dataset.chapterMode ?? 'scroll') as ChapterMode,
		scroll: el.querySelector<HTMLElement>('[data-chapter-scroll]'),
		mapSlot: el.querySelector<HTMLElement>('[data-chapter-map]'),
	}));
}

export function mountChapterReader(options: ChapterReaderOptions): ChapterReader {
	const { shell, page, stage, rail } = options;
	const panes = readPanes(shell);
	const railButtons = [...rail.querySelectorAll<HTMLButtonElement>('[data-chapter-goto]')];
	const chapters: DiscChapter[] = panes.map((pane) => ({
		key: pane.kind,
		label: pane.kind,
		mode: pane.mode,
		sections: [],
		fields: [],
	}));
	const remembered = new Map<number, number>();
	let active = false;
	let index = 0;
	let lockUntil = 0;
	let touchFrom: { x: number; y: number } | null = null;
	/** 这一串手势已经在 touchmove 里翻过章：松手不再翻第二次。 */
	let touchStepped = false;
	/** 唱片章这一镜正在播：这一串手势不归章级跟翻。 */
	let coverPlaying = false;
	/** 唱片章节拍：`paint()` 一进章／切面就播一次。 */
	let recordPlayback: { play(): void } | null = null;

	const trajRoot = (): HTMLElement | null => page.querySelector<HTMLElement>('[data-traj-root]');
	/** 地图原来的位置：离章／宽屏化要还回去，桌面长页路径才一根手指都不碰。 */
	const trajHome = ((): { parent: HTMLElement; next: Element | null } | null => {
		const traj = trajRoot();
		const parent = traj?.parentElement;
		return traj && parent ? { parent, next: traj.nextElementSibling } : null;
	})();
	const mapViewMode = (): MapViewMode =>
		(trajRoot()?.dataset.trajView as MapViewMode | undefined) ?? 'guide';
	const pane = (): Pane | undefined => panes[index];
	const kind = (): ChapterKey => pane()?.kind ?? 'record';
	/** 竖滑这个 delta 归谁：正文三章归壳，地图章归 traj（探索态也不换站）。 */
	const verticalIsShell = (): boolean =>
		verticalOwner({ chapterKey: kind(), mapViewMode: mapViewMode() }) === 'chapters';

	/** 章内长滚的位置：换章再回来还在原处。 */
	function remember(at: number): void {
		if (chapters[at]?.key === 'map') return;
		const el = panes[at]?.scroll;
		if (el) remembered.set(at, el.scrollTop);
	}

	/** 出章前把 scrollTop 收回合法范围：还在 overscroll 残差里就跟背进邻章，会闪一下。 */
	function clampScroll(at: number): void {
		const el = panes[at]?.scroll;
		if (!el) return;
		const top = clampScrollTop({
			scrollTop: el.scrollTop,
			scrollHeight: el.scrollHeight,
			clientHeight: el.clientHeight,
		});
		if (top !== el.scrollTop) el.scrollTop = top;
	}

	function restore(at: number): void {
		const el = panes[at]?.scroll;
		if (!el) return;
		el.scrollTop = remembered.get(at) ?? 0;
	}

	/** 长滚章：文头／文末之外，竖滑是文章自己的。 */
	function scrollEdges(): { atTop: boolean; atBottom: boolean } | null {
		const el = pane()?.scroll;
		if (!el) return null;
		const max = el.scrollHeight - el.clientHeight;
		return {
			atTop: el.scrollTop <= 1,
			atBottom: max <= 1 || el.scrollTop >= max - 1,
		};
	}

	function handoffMap(): void {
		const traj = trajRoot();
		const slot = pane()?.mapSlot;
		if (!traj || !slot) return;
		if (traj.parentElement !== slot) slot.append(traj);
		// 地图章腾空：页顶墓碑让位、大题不再重复、站表默认折叠。
		traj.dataset.mapChrome = 'compact';
		for (const fold of traj.querySelectorAll<HTMLDetailsElement>('details.traj-stops-fold')) {
			fold.open = false;
		}
		requestAnimationFrame(() => traj.dispatchEvent(new Event('traj:show')));
	}

	function releaseMap(): void {
		const traj = trajRoot();
		if (!traj) return;
		delete traj.dataset.mapChrome;
		for (const fold of traj.querySelectorAll<HTMLDetailsElement>('details.traj-stops-fold')) {
			fold.open = true;
		}
		traj.dispatchEvent(new Event('traj:pause'));
	}

	/** 把地图放回它原本在页面里的位置（离章不带走、桌面不回归）。 */
	function parkMap(): void {
		const traj = trajRoot();
		if (!traj || !trajHome) return;
		delete traj.dataset.mapChrome;
		for (const fold of traj.querySelectorAll<HTMLDetailsElement>('details.traj-stops-fold')) {
			fold.open = true;
		}
		if (traj.parentElement !== trajHome.parent) {
			trajHome.parent.insertBefore(traj, trajHome.next);
			requestAnimationFrame(() => traj.dispatchEvent(new Event('traj:show')));
		}
	}

	function paint(): void {
		panes.forEach((current, position) => {
			const on = position === index;
			current.el.hidden = !on;
			current.el.classList.toggle('is-on', on);
		});
		railButtons.forEach((button, position) => {
			button.setAttribute('aria-current', position === index ? 'true' : 'false');
		});
		shell.dataset.chapterCurrent = String(index);
		if (kind() === 'map') page.dataset.chapterKind = 'map';
		else delete page.dataset.chapterKind;
		// 进唱片章就播这一镜（切面另有自己的重播）。
		if (kind() === 'record') recordPlayback?.play();
	}

	/**
	 * 切章那一帧的地图交接：`handoffMap`／`releaseMap` 不跟着 `paint()` 同步改 DOM，
	 * 排到同一个 rAF 里一次做完——先 hidden 再改 details open 不会连着两次 layout。
	 */
	let mapFrame = 0;
	let pendingMap: 'handoff' | 'release' | null = null;
	function batchFrame(next: 'handoff' | 'release'): void {
		pendingMap = next;
		if (mapFrame) return;
		mapFrame = requestAnimationFrame(() => {
			mapFrame = 0;
			const work = pendingMap;
			pendingMap = null;
			if (work === 'handoff') handoffMap();
			else if (work === 'release') releaseMap();
		});
	}

	function applyStep(next: { index: number; moved: boolean }): void {
		if (!next.moved) return;
		clampScroll(index);
		remember(index);
		index = next.index;
		paint();
		const el = pane()?.scroll;
		if (el) el.scrollTop = remembered.get(index) ?? 0;
		if (kind() === 'map') batchFrame('handoff');
		else batchFrame('release');
	}

	function goTo(target: number): void {
		if (panes.length === 0) return;
		const next = Math.min(Math.max(target, 0), panes.length - 1);
		if (next === index) {
			const el = pane()?.scroll;
			if (el) el.scrollTo({ top: 0, behavior: 'auto' });
			remembered.set(index, 0);
			return;
		}
		clampScroll(index);
		remember(index);
		index = next;
		paint();
		restore(index);
		document.documentElement.classList.add(LOCK_CLASS);
		if (kind() === 'map') batchFrame('handoff');
		else batchFrame('release');
	}

	function step(dir: 1 | -1): void {
		if (!active || !verticalIsShell()) return;
		applyStep(stepChapter({ chapters, index, dir }));
	}

	/** 长滚章的方向键：文头／文末之外滚文章，边界才换章。 */
	function scrollByKey(dir: 1 | -1): boolean {
		const edges = scrollEdges();
		const el = pane()?.scroll;
		if (!edges || !el) return false;
		const follow = scrollFollowThrough({ atTop: edges.atTop, atBottom: edges.atBottom, dir });
		if (follow) return true;
		el.scrollBy({ top: dir * KEY_SCROLL_PX, behavior: 'auto' });
		return false;
	}

	function setActive(on: boolean): void {
		if (on && !options.isNarrow()) return;
		const next = on && panes.length > 0;
		if (next === active) return;
		active = next;
		const read = page.querySelector<HTMLElement>('.split-read');
		if (!active) {
			// 离壳（宽屏化）：命里的帧交接先拆掉，再松开地图手势、把它装回原位置。
			if (mapFrame) cancelAnimationFrame(mapFrame);
			mapFrame = 0;
			pendingMap = null;
			releaseMap();
			parkMap();
			delete page.dataset.chapterKind;
		}
		shell.hidden = !active;
		if (active) {
			index = 0;
			paint();
			const el = pane()?.scroll;
			if (el) el.scrollTop = remembered.get(index) ?? 0;
			document.documentElement.classList.add(LOCK_CLASS);
			if (kind() === 'map') handoffMap();
			read?.setAttribute('inert', '');
			return;
		}
		document.documentElement.classList.remove(LOCK_CLASS);
		remembered.clear();
		read?.removeAttribute('inert');
	}

	/**
	 * 唱片章：章内 fill→crop 一镜。
	 *
	 * 每面各有自己的 upright 外层＋裁剪窗＋plate；几何全部走 `detail-display` 的
	 * `openingBox`／`plateBox`／`zoomImageBox`／`cropWindow`／`fillCropPaint`
	 * （封在 `disc-cover-crop.ts` 里）。进章／切面时 `cropT` 0→1 播一次；
	 * `prefers-reduced-motion` 直接落在 settled plate＋肘线。
	 */
	function wireCoverCrop(target: Pane): { play(): void } | null {
		const root = target.el.querySelector<HTMLElement>('[data-chapter-record-cover]');
		if (!root) return null;
		type Face = {
			el: HTMLElement;
			frame: HTMLElement;
			outer: HTMLElement | null;
			windowEl: HTMLElement | null;
			upright: HTMLImageElement | null;
			windowImg: HTMLImageElement | null;
			plate: HTMLElement | null;
			plateImg: HTMLImageElement | null;
			graphics: SVGGElement | null;
			leaders: SVGGElement | null;
			notes: HTMLElement | null;
			uprightW: number;
			uprightH: number;
			plateW: number;
			plateH: number;
			crop: { x: number; y: number; w: number; h: number };
		};
		const num = (value: string | undefined): number => Number(value ?? '0');
		const faces: Face[] = [...root.querySelectorAll<HTMLElement>('[data-cover-face]')]
			.map((el) => {
				const frame = el.querySelector<HTMLElement>('[data-cover-frame]');
				const upright = el.querySelector<HTMLImageElement>('[data-cover-upright]');
				const outer = el.querySelector<HTMLElement>('[data-fill-crop="outer"]');
				const windowEl = el.querySelector<HTMLElement>('[data-fill-crop="window"]');
				const plate = el.querySelector<HTMLElement>('[data-cover-pose]');
				const face: Face = {
					el,
					frame: frame as HTMLElement,
					outer,
					windowEl,
					upright,
					windowImg: windowEl?.querySelector<HTMLImageElement>('.upright') ?? null,
					plate,
					plateImg: el.querySelector<HTMLImageElement>('[data-cover-plate]'),
					graphics: el.querySelector<SVGGElement>('.mark-graphics'),
					leaders: el.querySelector<SVGGElement>('.mark-leaders'),
					notes: plate?.querySelector<HTMLElement>('.disc-record-marks') ?? null,
					uprightW: num(upright?.getAttribute('width') ?? undefined),
					uprightH: num(upright?.getAttribute('height') ?? undefined),
					plateW: num(el.dataset.coverPlateW),
					plateH: num(el.dataset.coverPlateH),
					crop: {
						x: num(upright?.dataset.cropX),
						y: num(upright?.dataset.cropY),
						w: num(upright?.dataset.cropW),
						h: num(upright?.dataset.cropH),
					},
				};
				return face;
			})
			.filter((face) => face.frame !== null && face.upright !== null && face.plate !== null);
		if (faces.length === 0) return null;

		const sideButtons = [...root.querySelectorAll<HTMLButtonElement>('[data-cover-side]')];
		let current = Math.max(
			0,
			faces.findIndex((face) => !face.el.hidden),
		);
		let raf = 0;
		let cropT = 0;

		const motionOk = (): boolean => document.documentElement.dataset.motion !== 'reduce';

		/** 把一帧几何落成样式；`plateOpacity` 之前不画 plate，袖线在 settled 后淡入。 */
		const paintFace = (face: Face, t: number): void => {
			const pane = { width: face.frame.clientWidth, height: face.frame.clientHeight };
			if (pane.width <= 0 || pane.height <= 0) return;
			const geo = coverCropGeometry({
				pane,
				natural: { width: face.uprightW, height: face.uprightH },
				plate: { width: face.plateW, height: face.plateH },
				crop: face.crop,
				cropT: t,
			});
			const { image, window: win, plate } = geo;
			if (face.outer) {
				face.outer.style.opacity = String(geo.outerOpacity);
				face.outer.style.visibility = geo.outerOpacity === 0 ? 'hidden' : 'visible';
			}
			if (face.upright) {
				Object.assign(face.upright.style, {
					left: `${image.left}px`,
					top: `${image.top}px`,
					width: `${image.width}px`,
					height: `${image.height}px`,
					right: 'auto',
					bottom: 'auto',
					transformOrigin: '0 0',
					transform: geo.imageTransform,
					opacity: '1',
				} satisfies Partial<CSSStyleDeclaration>);
			}
			if (face.windowEl) {
				// settled 那一帧窗与 plate 重合，收掉窗（窗缘不该绕在落定的 plate 外圈）。
				const settledNow = geo.cropT >= 1;
				Object.assign(face.windowEl.style, {
					left: `${win.left}px`,
					top: `${win.top}px`,
					width: `${win.width}px`,
					height: `${win.height}px`,
					transformOrigin: '0 0',
					transform: geo.windowTransform,
					opacity: settledNow ? '0' : String(geo.windowOpacity),
					visibility: settledNow ? 'hidden' : 'visible',
				} satisfies Partial<CSSStyleDeclaration>);
			}
			if (face.windowImg) {
				// 窗里的图跟着窗走：基准取 settled 图框相对窗的位置，整窗再用 transform 回放。
				Object.assign(face.windowImg.style, {
					left: `${image.left - win.left}px`,
					top: `${image.top - win.top}px`,
					width: `${image.width}px`,
					height: `${image.height}px`,
					right: 'auto',
					bottom: 'auto',
					transform: 'none',
					transformOrigin: '0 0',
					opacity: '1',
				} satisfies Partial<CSSStyleDeclaration>);
			}
			if (face.plate) {
				Object.assign(face.plate.style, {
					left: `${plate.left}px`,
					top: `${plate.top}px`,
					right: 'auto',
					bottom: 'auto',
					width: `${plate.width}px`,
					height: `${plate.height}px`,
					opacity: String(geo.plateOpacity),
				} satisfies Partial<CSSStyleDeclaration>);
			}
			if (face.plateImg) {
				face.plateImg.style.objectFit = 'fill';
				face.plateImg.style.opacity = String(geo.plateOpacity);
			}
			for (const node of [face.graphics, face.leaders, face.notes]) {
				if (!node) continue;
				node.style.opacity = String(geo.calloutOpacity);
				node.style.visibility = geo.calloutOpacity > 0 ? 'visible' : 'hidden';
			}
			face.el.dataset.cropT = geo.cropT.toFixed(3);
		};

		const stop = (): void => {
			if (raf) cancelAnimationFrame(raf);
			raf = 0;
			coverPlaying = false;
		};

		/** settled：plate＋框选肘线，裁剪窗与 plate 重合后收掉。 */
		const settle = (face: Face): void => {
			cropT = 1;
			paintFace(face, 1);
		};

		const play = (): void => {
			const face = faces[current];
			if (!face) return;
			stop();
			if (!motionOk()) {
				settle(face);
				return;
			}
			cropT = 0;
			paintFace(face, 0);
			coverPlaying = true;
			const started = performance.now();
			const tick = (now: number): void => {
				const t = coverCropProgress(now - started);
				cropT = t;
				paintFace(face, t);
				if (t >= 1) {
					raf = 0;
					coverPlaying = false;
					return;
				}
				raf = requestAnimationFrame(tick);
			};
			raf = requestAnimationFrame(tick);
		};

		const synchronize = (): void => {
			sideButtons.forEach((button) => {
				button.setAttribute(
					'aria-pressed',
					Number(button.dataset.coverSide) === current ? 'true' : 'false',
				);
			});
		};

		const select = (index: number): void => {
			const next = Math.min(Math.max(index, 0), faces.length - 1);
			if (next === current) return;
			stop();
			current = next;
			faces.forEach((face, position) => {
				const on = position === next;
				face.el.hidden = !on;
				face.el.classList.toggle('is-on', on);
			});
			synchronize();
			play();
		};

		root.addEventListener('click', (event) => {
			const node = event.target;
			if (!(node instanceof Element)) return;
			const button = node.closest<HTMLButtonElement>('[data-cover-side]');
			if (!button) return;
			select(Number(button.dataset.coverSide ?? '0'));
		});

		// 转屏／字体回流：按当前进度重落一帧（不重播）。
		const repaint = (): void => {
			const face = faces[current];
			if (face) paintFace(face, cropT);
		};
		window.addEventListener('resize', repaint);

		const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
		reduced.addEventListener('change', () => {
			const face = faces[current];
			if (!face) return;
			if (reduced.matches) {
				stop();
				settle(face);
			} else play();
		});

		synchronize();
		return { play };
	}

	recordPlayback = (() => {
		const panesWithCover = panes.filter((target) => target.kind === 'record');
		const players = panesWithCover
			.map((target) => wireCoverCrop(target))
			.filter((player): player is { play(): void } => player !== null);
		if (players.length === 0) return null;
		return { play: () => players[0]?.play() };
	})();

	rail.addEventListener('click', (event) => {
		if (!active) return;
		const node = event.target;
		if (!(node instanceof Element)) return;
		const button = node.closest<HTMLButtonElement>('[data-chapter-goto]');
		if (!button) return;
		goTo(Number(button.dataset.chapterGoto ?? '0'));
		document.documentElement.classList.add(LOCK_CLASS);
	});

	/**
	 * 探索只锁地图框内：点在框外（旁白、底栏、顶栏）就回导览。
	 * 壳只报「点在哪」，导览状态仍由 traj 自己改。
	 */
	function guideIfOutsideFrame(event: Event): void {
		if (!active || kind() !== 'map') return;
		const traj = trajRoot();
		if (!traj || traj.dataset.trajView !== 'explore') return;
		const node = event.target;
		if (
			node instanceof Element &&
			node.closest(
				'.traj-map, .traj-year-rail, .traj-rail, .traj-controls, .traj-stops, .traj-stops-fold, summary',
			)
		) {
			return;
		}
		traj.dispatchEvent(new Event('traj:guide'));
	}

	// 框外包括旁白、底栏、顶栏（settled 条），所以监听挂在 document 上；框内的
	// 地图／年轴／控件／站表仍算框内，探索不会被自己打断。
	document.addEventListener('pointerdown', guideIfOutsideFrame, true);

	// 竖滑：章内是普通长滚，只有文头／文末跟翻；地图章一个 delta 都不拦。
	stage.addEventListener(
		'wheel',
		(event) => {
			if (!active || event.ctrlKey || event.deltaY === 0) return;
			const node = event.target;
			if (!(node instanceof Element) || !stage.contains(node)) return;
			if (!verticalIsShell()) return;
			const dir: 1 | -1 = event.deltaY > 0 ? 1 : -1;
			const edges = scrollEdges();
			if (!edges) return;
			if (!scrollFollowThrough({ atTop: edges.atTop, atBottom: edges.atBottom, dir })) return;
			event.preventDefault();
			const now = performance.now();
			if (now < lockUntil) return;
			lockUntil = now + GESTURE_LOCK_MS;
			step(dir);
		},
		{ passive: false },
	);

	stage.addEventListener(
		'touchstart',
		(event) => {
			touchFrom = null;
			touchStepped = false;
			if (!active || !verticalIsShell()) return;
			const touch = event.touches[0];
			touchFrom = touch ? { x: touch.clientX, y: touch.clientY } : null;
		},
		{ passive: true },
	);

	/**
	 * 边沿外向的竖滑：在 `touchmove` 上就先灭橡皮筋。
	 *
	 * 贴在文头／文末且方向朝外时，原生 overscroll 会先把文章弹一下，松手才轮到
	 * 跟翻——这就是站长说的「上下抖动」。这一手势已经确定是跟翻，就当场
	 * `preventDefault`（`touch-action: pan-y` 之外我们不靠回弹动画），过了
	 * `TOUCH_STEP_PX` 直接一步切到邻章，不等松手；本手势剩下的位移不再回流。
	 */
	stage.addEventListener(
		'touchmove',
		(event) => {
			// 地图章：壳一个 delta 都不拦，连 preventDefault 都不做。
			if (!verticalIsShell()) return;
			const from = touchFrom;
			if (!from || !active || coverPlaying) return;
			const touch = event.touches[0];
			if (!touch) return;
			const dx = from.x - touch.clientX;
			const dy = from.y - touch.clientY;
			if (touchStepped) {
				// 这一手势已经翻过章：剩下的位移不回流，别再拖出新章的回弹。
				if (Math.abs(dy) > Math.abs(dx)) event.preventDefault();
				return;
			}
			const edges = scrollEdges();
			if (!edges) return;
			const gesture = readVerticalGesture({
				dx,
				dy,
				slop: TOUCH_SLOP_PX,
				atTop: edges.atTop,
				atBottom: edges.atBottom,
			});
			if (!gesture.vertical) return;
			if (!gesture.follow) return;
			event.preventDefault();
			if (Math.abs(dy) < TOUCH_STEP_PX) return;
			const now = performance.now();
			if (now < lockUntil) return;
			lockUntil = now + GESTURE_LOCK_MS;
			touchStepped = true;
			step(gesture.dir);
		},
		{ passive: false },
	);

	// 松手：没在 move 里跟翻过的（短拖、浏览器晚发 move）在这里补一次，仍是一步一章。
	stage.addEventListener(
		'touchend',
		(event) => {
			const from = touchFrom;
			const stepped = touchStepped;
			touchFrom = null;
			touchStepped = false;
			if (!from || !active || coverPlaying || stepped) return;
			const touch = event.changedTouches[0];
			if (!touch) return;
			if (!verticalIsShell()) return;
			// 长滚章：先看文章滚到边没有，到了才跟翻。
			const edges = scrollEdges();
			if (!edges) return;
			const gesture = readVerticalGesture({
				dx: from.x - touch.clientX,
				dy: from.y - touch.clientY,
				slop: TOUCH_STEP_PX,
				atTop: edges.atTop,
				atBottom: edges.atBottom,
			});
			if (!gesture.vertical || !gesture.follow) return;
			const now = performance.now();
			if (now < lockUntil) return;
			lockUntil = now + GESTURE_LOCK_MS;
			step(gesture.dir);
		},
		{ passive: true },
	);

	window.addEventListener('keydown', (event) => {
		if (!active) return;
		if (event.metaKey || event.ctrlKey || event.altKey) return;
		const dir: 1 | -1 | 0 =
			event.key === 'ArrowDown' || event.key === 'PageDown'
				? 1
				: event.key === 'ArrowUp' || event.key === 'PageUp'
					? -1
					: 0;
		if (dir === 0) return;
		// 地图章的方向键归 traj：壳连 preventDefault 都不做。
		if (!verticalIsShell()) return;
		if (!scrollByKey(dir)) {
			event.preventDefault();
			return;
		}
		event.preventDefault();
		step(dir);
	});

	window.matchMedia('(min-width: 48rem)').addEventListener('change', (event) => {
		if (event.matches) setActive(false);
	});

	shell.hidden = true;
	document.documentElement.classList.remove(LOCK_CLASS);

	return {
		setActive,
		isActive: () => active,
		currentChapter: () => (active ? kind() : null),
		goToChapter: (key) => {
			if (!active) return;
			const target = panes.findIndex((current) => current.kind === key);
			if (target < 0) return;
			goTo(target);
			// 回章先回章顶：唱片章的顶上就是题铭＋封面。
			const el = panes[target]?.scroll;
			if (el) el.scrollTo({ top: 0, behavior: 'auto' });
			if (panes[target]?.kind !== 'map') remembered.set(target, 0);
		},
	};
}
