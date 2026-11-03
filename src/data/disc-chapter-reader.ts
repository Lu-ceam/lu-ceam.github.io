/**
 * 窄屏章节壳 v3 的客户端：底栏点选跳章、竖滑滚章内文章、到文头／文末直接跟翻邻章。
 *
 * 只在 `max-width: 47.99rem` 的阅读态里活着（由页面的 settled 条开关），
 * 桌面路径一根手指都不碰。地图章的手势全部留给 traj：这里一个 delta 都不拦。
 *
 * 正文三章都不是拍切：唱片（题铭＋封面缩放＋物述）、述语（长文）、资料（字段列表）
 * 都是章内自由长滚。唱片章的封面可以捏合／双击放大，放大后单指拖动是平移。
 */

import {
	type ChapterKey,
	type ChapterMode,
	type CoverPan,
	type DiscChapter,
	type MapViewMode,
	COVER_TAP_SCALE,
	clampCoverPan,
	scrollFollowThrough,
	stepChapter,
	verticalOwner,
} from './disc-chapters.ts';

const GESTURE_LOCK_MS = 480;
const LOCK_CLASS = 'disc-chapters-on';
/** 长滚章里方向键一次滚多少：文头／文末之外不换章，只滚文章。 */
const KEY_SCROLL_PX = 120;
/** 触屏竖滑至少这么多像素才算一次跟翻手势。 */
const TOUCH_STEP_PX = 40;
/** 双击判定窗口。 */
const DOUBLE_TAP_MS = 320;

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
	/** 封面捏合／平移正在发生：这一串手势不归章级跟翻。 */
	let coverGesture = false;

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
	}

	function applyStep(next: { index: number; moved: boolean }): void {
		if (!next.moved) return;
		remember(index);
		index = next.index;
		paint();
		const el = pane()?.scroll;
		if (el) el.scrollTop = remembered.get(index) ?? 0;
		if (kind() === 'map') handoffMap();
		else releaseMap();
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
		remember(index);
		index = next;
		paint();
		restore(index);
		document.documentElement.classList.add(LOCK_CLASS);
		if (kind() === 'map') handoffMap();
		else releaseMap();
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
			// 离壳（宽屏化）：先松开地图手势，再把它装回原位置。
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

	/** 唱片章封面：捏合与双击放大，放大后单指拖动就是平移。 */
	function wireCoverZoom(target: Pane): void {
		const frame = target.el.querySelector<HTMLElement>('[data-cover-frame]');
		const img = target.el.querySelector<HTMLElement>('[data-cover-img]');
		if (!frame || !img) return;
		let pan: CoverPan = { scale: 1, x: 0, y: 0 };
		let pinch: { dist: number; scale: number } | null = null;
		let drag: { x: number; y: number } | null = null;
		let lastTap = 0;

		const apply = (next: CoverPan): void => {
			pan = clampCoverPan(next, { width: frame.clientWidth, height: frame.clientHeight });
			img.style.transform =
				pan.scale <= 1
					? ''
					: `translate3d(${pan.x.toFixed(1)}px, ${pan.y.toFixed(1)}px, 0) scale(${pan.scale.toFixed(3)})`;
			frame.classList.toggle('is-zoomed', pan.scale > 1.0001);
		};

		frame.addEventListener(
			'touchstart',
			(event) => {
				coverGesture = false;
				if (event.touches.length === 2) {
					const a = event.touches[0];
					const b = event.touches[1];
					if (!a || !b) return;
					pinch = { dist: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY), scale: pan.scale };
					drag = null;
					return;
				}
				const touch = event.touches[0];
				if (!touch) return;
				drag = { x: touch.clientX - pan.x, y: touch.clientY - pan.y };
			},
			{ passive: true },
		);

		frame.addEventListener(
			'touchmove',
			(event) => {
				if (event.touches.length === 2 && pinch) {
					const a = event.touches[0];
					const b = event.touches[1];
					if (!a || !b) return;
					const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
					event.preventDefault();
					coverGesture = true;
					apply({ ...pan, scale: pinch.scale * (dist / Math.max(1, pinch.dist)) });
					return;
				}
				if (!drag || pan.scale <= 1.0001) return;
				const touch = event.touches[0];
				if (!touch) return;
				event.preventDefault();
				coverGesture = true;
				apply({ scale: pan.scale, x: touch.clientX - drag.x, y: touch.clientY - drag.y });
			},
			{ passive: false },
		);

		frame.addEventListener(
			'touchend',
			(event) => {
				pinch = null;
				drag = null;
				if (event.touches.length > 0) return;
				const now = performance.now();
				const doubleTap = now - lastTap < DOUBLE_TAP_MS;
				lastTap = doubleTap ? 0 : now;
				if (!doubleTap) return;
				apply({ scale: pan.scale > 1.0001 ? 1 : COVER_TAP_SCALE, x: 0, y: 0 });
			},
			{ passive: true },
		);
	}

	for (const target of panes) if (target.kind === 'record') wireCoverZoom(target);

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
			if (!active || !verticalIsShell()) return;
			const touch = event.touches[0];
			touchFrom = touch ? { x: touch.clientX, y: touch.clientY } : null;
		},
		{ passive: true },
	);

	stage.addEventListener(
		'touchend',
		(event) => {
			const from = touchFrom;
			touchFrom = null;
			if (!from || !active || coverGesture) return;
			const touch = event.changedTouches[0];
			if (!touch) return;
			const dy = from.y - touch.clientY;
			const dx = from.x - touch.clientX;
			if (Math.abs(dy) <= Math.abs(dx) || Math.abs(dy) < TOUCH_STEP_PX) return;
			const dir: 1 | -1 = dy > 0 ? 1 : -1;
			if (!verticalIsShell()) return;
			// 长滚章：先看文章滚到边没有，到了才跟翻。
			const edges = scrollEdges();
			if (!edges) return;
			if (!scrollFollowThrough({ atTop: edges.atTop, atBottom: edges.atBottom, dir })) return;
			const now = performance.now();
			if (now < lockUntil) return;
			lockUntil = now + GESTURE_LOCK_MS;
			step(dir);
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
