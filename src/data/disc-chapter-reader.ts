/**
 * 窄屏章节壳的客户端：底栏点选翻章、竖滑换拍、到头直接跟翻。
 *
 * 只在 `max-width: 47.99rem` 的阅读态里活着（由页面的 settled 条开关），
 * 桌面路径一根手指都不碰。地图章的手势全部留给 traj：这里一个 delta 都不拦。
 */

import {
	type ChapterKey,
	type ChapterStep,
	type DiscChapter,
	type MapViewMode,
	stepBeat,
	verticalOwner,
} from './disc-chapters.ts';

/** 一次手势只走一拍：滚轮攒够一拍的像素才动。 */
const WHEEL_STEP_PX = 80;
const TOUCH_STEP_PX = 40;
const GESTURE_LOCK_MS = 480;
const LOCK_CLASS = 'disc-chapters-on';

export type ChapterReaderOptions = {
	/** `.disc-chapters` */
	shell: HTMLElement;
	/** `article.record-page` */
	page: HTMLElement;
	/** 竖滑与拍的舞台（不含底栏）。 */
	stage: HTMLElement;
	/** 底栏。 */
	rail: HTMLElement;
	/** 首章首拍再往上：回序幕看盘（与点小图同路径）。 */
	onExitPrologue: () => void;
	/** 仅在窄屏可用。 */
	isNarrow: () => boolean;
};

export type ChapterReader = {
	setActive(on: boolean): void;
	isActive(): boolean;
	currentChapter(): ChapterKey | null;
};

type Pane = {
	el: HTMLElement;
	kind: ChapterKey;
	beats: number;
	track: HTMLElement | null;
	pos: HTMLElement | null;
	mapSlot: HTMLElement | null;
};

function readPanes(shell: HTMLElement): Pane[] {
	return [...shell.querySelectorAll<HTMLElement>('[data-chapter]')].map((el) => ({
		el,
		kind: (el.dataset.chapterKind ?? 'record') as ChapterKey,
		beats: Number(el.dataset.beatCount ?? '0'),
		track: el.querySelector<HTMLElement>('[data-beat-track]'),
		pos: el.querySelector<HTMLElement>('[data-beat-pos]'),
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
		beats: Array.from({ length: pane.beats }, () => ({ title: '', paragraphs: [] })),
	}));
	const remembered = new Map<number, number>();
	let active = false;
	let index = 0;
	let beat = 0;
	let wheelAcc = 0;
	let lockUntil = 0;
	let touchFrom: { x: number; y: number } | null = null;

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

	function remember(position: number, at: number): void {
		if (chapters[position]?.key === 'map') return;
		remembered.set(position, at);
	}

	function handoffMap(): void {
		const traj = trajRoot();
		const slot = pane()?.mapSlot;
		if (!traj || !slot) return;
		if (traj.parentElement !== slot) slot.append(traj);
		requestAnimationFrame(() => traj.dispatchEvent(new Event('traj:show')));
	}

	function releaseMap(): void {
		trajRoot()?.dispatchEvent(new Event('traj:pause'));
	}

	/** 把地图放回它原本在页面里的位置（离章不带走、桌面不回归）。 */
	function parkMap(): void {
		const traj = trajRoot();
		if (!traj || !trajHome) return;
		if (traj.parentElement === trajHome.parent) return;
		trajHome.parent.insertBefore(traj, trajHome.next);
		requestAnimationFrame(() => traj.dispatchEvent(new Event('traj:show')));
	}

	function paint(): void {
		panes.forEach((current, position) => {
			const on = position === index;
			current.el.hidden = !on;
			current.el.classList.toggle('is-on', on);
			if (!on || current.kind === 'map') return;
			const at = Math.min(Math.max(beat, 0), Math.max(0, current.beats - 1));
			if (current.track) current.track.style.transform = `translateY(${-at * 100}%)`;
			if (current.pos) current.pos.textContent = `${at + 1}／${Math.max(1, current.beats)}`;
		});
		railButtons.forEach((button, position) => {
			button.setAttribute('aria-current', position === index ? 'true' : 'false');
		});
		shell.dataset.chapterCurrent = String(index);
		shell.dataset.beatCurrent = String(beat);
	}

	function applyStep(next: ChapterStep): void {
		if (next.exited) {
			// 回序幕：先松滚锁，页面那条既有回卷路径才滑得动。
			document.documentElement.classList.remove(LOCK_CLASS);
			options.onExitPrologue();
			return;
		}
		if (!next.moved) return;
		remember(index, beat);
		index = next.index;
		beat = next.beat;
		paint();
		if (kind() === 'map') handoffMap();
		else releaseMap();
	}

	function goTo(target: number, at?: number): void {
		if (panes.length === 0) return;
		const next = Math.min(Math.max(target, 0), panes.length - 1);
		if (next === index && at === undefined) return;
		remember(index, beat);
		index = next;
		beat = at ?? remembered.get(next) ?? 0;
		paint();
		if (kind() === 'map') handoffMap();
		else releaseMap();
	}

	function step(dir: 1 | -1): void {
		if (!active || !verticalIsShell()) return;
		applyStep(stepBeat({ chapters, index, beat, dir }));
	}

	function setActive(on: boolean): void {
		if (on && !options.isNarrow()) return;
		const next = on && panes.length > 0;
		if (next === active) return;
		active = next;
		if (!active) {
			// 离壳（回序幕／宽屏化）：先松开地图手势，再把它装回原位置。
			releaseMap();
			parkMap();
		}
		shell.hidden = !active;
		document.documentElement.classList.toggle(LOCK_CLASS, active);
		const read = page.querySelector<HTMLElement>('.split-read');
		if (active) {
			// 收妥后直接落「唱片」拍 1：封面不成章，小图留着回序幕。
			index = 0;
			beat = 0;
			paint();
			if (kind() === 'map') handoffMap();
			read?.setAttribute('inert', '');
			return;
		}
		remembered.clear();
		releaseMap();
		read?.removeAttribute('inert');
	}

	rail.addEventListener('click', (event) => {
		if (!active) return;
		const target = event.target;
		if (!(target instanceof Element)) return;
		const button = target.closest<HTMLButtonElement>('[data-chapter-goto]');
		if (!button) return;
		const next = Number(button.dataset.chapterGoto ?? '0');
		goTo(next, remembered.get(next));
	});

	/**
	 * 探索只锁地图框内：点在框外（旁白、底栏、顶栏）就回导览。
	 * 壳只报「点在哪」，导览状态仍由 traj 自己改。
	 */
	function guideIfOutsideFrame(event: Event): void {
		if (!active || kind() !== 'map') return;
		const traj = trajRoot();
		if (!traj || traj.dataset.trajView !== 'explore') return;
		const target = event.target;
		if (
			target instanceof Element &&
			target.closest(
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

	// 竖滑：正文三章换拍（一拍一屏）；地图章一个 delta 都不拦，全给 traj。
	stage.addEventListener(
		'wheel',
		(event) => {
			if (!active || event.ctrlKey || event.deltaY === 0) return;
			if (!verticalIsShell()) return;
			const target = event.target;
			if (!(target instanceof Element) || !stage.contains(target)) return;
			event.preventDefault();
			const dir: 1 | -1 = event.deltaY > 0 ? 1 : -1;
			const now = performance.now();
			if (now < lockUntil) return;
			if (wheelAcc !== 0 && Math.sign(wheelAcc) !== dir) wheelAcc = 0;
			wheelAcc += event.deltaY;
			if (Math.abs(wheelAcc) < WHEEL_STEP_PX) return;
			wheelAcc = 0;
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
		'touchmove',
		(event) => {
			const from = touchFrom;
			if (!from || !active || !verticalIsShell()) return;
			const touch = event.touches[0];
			if (!touch) return;
			const dy = from.y - touch.clientY;
			const dx = from.x - touch.clientX;
			if (Math.abs(dy) <= Math.abs(dx) || Math.abs(dy) < TOUCH_STEP_PX) return;
			// 一屏一拍：整段竖滑都留在壳里，页面不动。
			event.preventDefault();
		},
		{ passive: false },
	);

	stage.addEventListener(
		'touchend',
		(event) => {
			const from = touchFrom;
			touchFrom = null;
			if (!from || !active || !verticalIsShell()) return;
			const touch = event.changedTouches[0];
			if (!touch) return;
			const dy = from.y - touch.clientY;
			const dx = from.x - touch.clientX;
			if (Math.abs(dy) <= Math.abs(dx) || Math.abs(dy) < TOUCH_STEP_PX) return;
			const now = performance.now();
			if (now < lockUntil) return;
			lockUntil = now + GESTURE_LOCK_MS;
			step(dy > 0 ? 1 : -1);
		},
		{ passive: true },
	);

	window.addEventListener('keydown', (event) => {
		// 地图章的方向键归 traj：壳连 preventDefault 都不做。
		if (!active || !verticalIsShell() || event.metaKey || event.ctrlKey || event.altKey) return;
		const dir: 1 | -1 | 0 =
			event.key === 'ArrowDown' || event.key === 'PageDown'
				? 1
				: event.key === 'ArrowUp' || event.key === 'PageUp'
					? -1
					: 0;
		if (dir === 0) return;
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
	};
}
