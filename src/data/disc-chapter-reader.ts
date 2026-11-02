/**
 * 窄屏章节壳的客户端：底栏点选翻章、竖滑换拍、到头直接跟翻。
 *
 * 只在 `max-width: 47.99rem` 的阅读态里活着（由页面的 settled 条开关），
 * 桌面路径一根手指都不碰。地图章的手势全部留给 traj：这里一个 delta 都不拦。
 *
 * v2 的两处形态：
 * - 唱片章有个「封面相」位（拍轨之前）：看盘缩放仍属于唱片章，底栏半隐但
 *   「唱片」active，点顶栏小图回到这一相，不再落到无栏的幽灵序幕。
 * - 来龙去脉是 `mode: 'scroll'`：竖滑是章内普通长滚，只有文头／文末才跟翻。
 */

import {
	type ChapterKey,
	type ChapterMode,
	type ChapterStep,
	type DiscChapter,
	type MapViewMode,
	scrollFollowThrough,
	stepBeat,
	verticalOwner,
} from './disc-chapters.ts';

/** 一次手势只走一拍：滚轮攒够一拍的像素才动。 */
const WHEEL_STEP_PX = 80;
const TOUCH_STEP_PX = 40;
const GESTURE_LOCK_MS = 480;
const LOCK_CLASS = 'disc-chapters-on';
/** 长滚章里方向键一次滚多少：文头／文末之外不换章，只滚文章。 */
const KEY_SCROLL_PX = 120;

export type ChapterPhase = 'beats' | 'cover';

export type ChapterReaderOptions = {
	/** `.disc-chapters` */
	shell: HTMLElement;
	/** `article.record-page` */
	page: HTMLElement;
	/** 竖滑与拍的舞台（不含底栏）。 */
	stage: HTMLElement;
	/** 底栏。 */
	rail: HTMLElement;
	/** 唱片章封面相：可选同步外层（仍在本章内，底栏不消失）。 */
	onCover: () => void;
	/** 仅在窄屏可用。 */
	isNarrow: () => boolean;
};

export type ChapterReader = {
	setActive(on: boolean, phase?: ChapterPhase): void;
	isActive(): boolean;
	currentChapter(): ChapterKey | null;
};

type Pane = {
	el: HTMLElement;
	kind: ChapterKey;
	mode: ChapterMode;
	beats: number;
	track: HTMLElement | null;
	pos: HTMLElement | null;
	scroll: HTMLElement | null;
	mapSlot: HTMLElement | null;
};

function readPanes(shell: HTMLElement): Pane[] {
	return [...shell.querySelectorAll<HTMLElement>('[data-chapter]')].map((el) => ({
		el,
		kind: (el.dataset.chapterKind ?? 'record') as ChapterKey,
		mode: (el.dataset.chapterMode ?? 'beats') as ChapterMode,
		beats: Number(el.dataset.beatCount ?? '0'),
		track: el.querySelector<HTMLElement>('[data-beat-track]'),
		pos: el.querySelector<HTMLElement>('[data-beat-pos]'),
		scroll: el.querySelector<HTMLElement>('[data-beat-scroll]'),
		mapSlot: el.querySelector<HTMLElement>('[data-chapter-map]'),
	}));
}

export function mountChapterReader(options: ChapterReaderOptions): ChapterReader {
	const { shell, page, stage, rail } = options;
	const panes = readPanes(shell);
	const railButtons = [...rail.querySelectorAll<HTMLButtonElement>('[data-chapter-goto]')];
	const coverFace = shell.querySelector<HTMLElement>('[data-chapter-cover]');
	const coverImg = shell.querySelector<HTMLImageElement>('[data-chapter-cover-img]');
	const chapters: DiscChapter[] = panes.map((pane) => ({
		key: pane.kind,
		label: pane.kind,
		mode: pane.mode,
		beats: Array.from({ length: pane.beats }, () => ({ title: '', paragraphs: [] })),
	}));
	const remembered = new Map<number, number>();
	let active = false;
	/** 唱片章的封面相：章内最前一相，底栏还在，舞台上是封面大图。 */
	let covered = false;
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
	/** 这一章是不是自由长滚（来龙去脉）：长滚章没有章内拍位。 */
	const isScrollPane = (): boolean => {
		const current = pane();
		return current !== undefined && current.mode === 'scroll' && current.kind !== 'map';
	};
	const scrollEl = (): HTMLElement | null => pane()?.scroll ?? null;
	/** 竖滑这个 delta 归谁：正文三章归壳，地图章归 traj（探索态也不换站）。 */
	const verticalIsShell = (): boolean =>
		verticalOwner({ chapterKey: kind(), mapViewMode: mapViewMode() }) === 'chapters';

	function remember(position: number, at: number): void {
		if (chapters[position]?.key === 'map') return;
		remembered.set(position, at);
	}

	/** 长滚章：文头／文末之外，竖滑是文章自己的。 */
	function scrollEdges(): { atTop: boolean; atBottom: boolean } | null {
		const el = scrollEl();
		if (!el) return null;
		const max = el.scrollHeight - el.clientHeight;
		return {
			atTop: el.scrollTop <= 1,
			atBottom: max <= 1 || el.scrollTop >= max - 1,
		};
	}

	function syncCoverFace(): void {
		if (!coverFace) return;
		coverFace.hidden = !covered;
		if (!covered || !coverImg) return;
		const plate =
			page.querySelector<HTMLImageElement>('.split-frame.is-thumb img.plate') ??
			page.querySelector<HTMLImageElement>('.split-frame img.plate') ??
			page.querySelector<HTMLImageElement>('img.plate');
		const src = plate?.currentSrc || plate?.src || '';
		if (src && coverImg.getAttribute('src') !== src) coverImg.src = src;
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
			const on = !covered && position === index;
			current.el.hidden = !on;
			current.el.classList.toggle('is-on', on);
			if (!on || current.kind === 'map') return;
			if (current.mode === 'scroll') return;
			const at = Math.min(Math.max(beat, 0), Math.max(0, current.beats - 1));
			if (current.track) current.track.style.transform = `translateY(${-at * 100}%)`;
			if (current.pos) current.pos.textContent = `${at + 1}／${Math.max(1, current.beats)}`;
		});
		// 封面相仍挂在唱片章名下：底栏要显示，「唱片」仍 active。
		const railIndex = covered ? 0 : index;
		railButtons.forEach((button, position) => {
			button.setAttribute('aria-current', position === railIndex ? 'true' : 'false');
		});
		shell.dataset.chapterCurrent = String(railIndex);
		shell.dataset.beatCurrent = String(covered ? -1 : beat);
		shell.dataset.chapterPhase = covered ? 'cover' : 'beats';
		page.dataset.chapterPhase = covered ? 'cover' : 'beats';
		const currentKind = covered ? 'record' : kind();
		if (currentKind === 'map') page.dataset.chapterKind = 'map';
		else delete page.dataset.chapterKind;
		syncCoverFace();
	}

	function leaveCover(): void {
		if (!covered) return;
		covered = false;
		index = 0;
		beat = 0;
		paint();
		document.documentElement.classList.add(LOCK_CLASS);
		releaseMap();
	}

	function enterCover(): void {
		covered = true;
		index = 0;
		beat = 0;
		paint();
		// 封面相仍锁页：舞台内是封面大图，勿让文档滚出 reading。
		document.documentElement.classList.add(LOCK_CLASS);
		options.onCover();
	}

	function applyStep(next: ChapterStep): void {
		if (next.exited) {
			// 唱片首拍再往上：进本章封面相，不落到无栏序幕。
			enterCover();
			return;
		}
		if (!next.moved) return;
		remember(index, beat);
		index = next.index;
		beat = next.beat;
		paint();
		const el = scrollEl();
		if (el) el.scrollTo({ top: 0, behavior: 'auto' });
		if (kind() === 'map') handoffMap();
		else releaseMap();
	}

	function goTo(target: number, at?: number): void {
		if (panes.length === 0) return;
		const next = Math.min(Math.max(target, 0), panes.length - 1);
		const stayed = next === index && !covered;
		if (stayed && at === undefined) {
			// 底栏点自己：长滚章滚回章顶，拍切章回到记忆拍位。
			const el = scrollEl();
			if (el) el.scrollTo({ top: 0, behavior: 'auto' });
			return;
		}
		remember(index, beat);
		covered = false;
		index = next;
		beat = at ?? remembered.get(next) ?? 0;
		paint();
		document.documentElement.classList.add(LOCK_CLASS);
		const el = scrollEl();
		if (el) el.scrollTo({ top: 0, behavior: 'auto' });
		if (kind() === 'map') handoffMap();
		else releaseMap();
	}

	function step(dir: 1 | -1): void {
		if (!active || covered || !verticalIsShell()) return;
		applyStep(stepBeat({ chapters, index, beat, dir }));
	}

	/** 长滚章的方向键：文头／文末之外滚文章，边界才换章。 */
	function scrollByKey(dir: 1 | -1): boolean {
		const edges = scrollEdges();
		const el = scrollEl();
		if (!edges || !el) return false;
		const follow = scrollFollowThrough({ atTop: edges.atTop, atBottom: edges.atBottom, dir });
		if (follow) return true;
		el.scrollBy({ top: dir * KEY_SCROLL_PX, behavior: 'auto' });
		return false;
	}

	function setActive(on: boolean, phase?: ChapterPhase): void {
		if (on && !options.isNarrow()) return;
		const next = on && panes.length > 0;
		if (next === active) {
			if (!active) return;
			// phase 未传：保持当前相，避免 sync 把封面相冲掉。
			if (phase === undefined) return;
			if (phase === 'cover' && !covered) {
				enterCover();
				return;
			}
			if (phase === 'beats' && covered) leaveCover();
			return;
		}
		active = next;
		if (!active) {
			// 离壳（宽屏化）：先松开地图手势，再把它装回原位置。
			covered = false;
			releaseMap();
			parkMap();
			delete page.dataset.chapterKind;
			delete page.dataset.chapterPhase;
			if (coverFace) coverFace.hidden = true;
		}
		shell.hidden = !active;
		const read = page.querySelector<HTMLElement>('.split-read');
		if (active) {
			// 收妥后可落「唱片」封面相（章内第一相），其后一拍一屏。
			covered = phase === 'cover';
			index = 0;
			beat = 0;
			paint();
			document.documentElement.classList.add(LOCK_CLASS);
			if (kind() === 'map') handoffMap();
			read?.setAttribute('inert', '');
			return;
		}
		document.documentElement.classList.remove(LOCK_CLASS);
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

	// 竖滑：封面相往下进拍轨；拍切章换拍；长滚章只有文头／文末跟翻；地图章一个 delta 都不拦。
	stage.addEventListener(
		'wheel',
		(event) => {
			if (!active || event.ctrlKey || event.deltaY === 0) return;
			const target = event.target;
			if (!(target instanceof Element) || !stage.contains(target)) return;
			const dir: 1 | -1 = event.deltaY > 0 ? 1 : -1;
			if (covered) {
				if (dir < 0) return;
				event.preventDefault();
				const now = performance.now();
				if (now < lockUntil) return;
				lockUntil = now + GESTURE_LOCK_MS;
				leaveCover();
				return;
			}
			if (!verticalIsShell()) return;
			if (isScrollPane()) {
				const edges = scrollEdges();
				if (!edges) return;
				if (!scrollFollowThrough({ atTop: edges.atTop, atBottom: edges.atBottom, dir })) return;
				event.preventDefault();
				const now = performance.now();
				if (now < lockUntil) return;
				lockUntil = now + GESTURE_LOCK_MS;
				step(dir);
				return;
			}
			event.preventDefault();
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
			if (!active) return;
			if (!covered && !verticalIsShell()) return;
			const touch = event.touches[0];
			touchFrom = touch ? { x: touch.clientX, y: touch.clientY } : null;
		},
		{ passive: true },
	);

	stage.addEventListener(
		'touchmove',
		(event) => {
			const from = touchFrom;
			if (!from || !active) return;
			if (covered) {
				const touch = event.touches[0];
				if (!touch) return;
				const dy = from.y - touch.clientY;
				const dx = from.x - touch.clientX;
				if (Math.abs(dy) <= Math.abs(dx) || Math.abs(dy) < TOUCH_STEP_PX) return;
				if (dy > 0) event.preventDefault();
				return;
			}
			if (!verticalIsShell()) return;
			if (isScrollPane()) return; // 长滚章：竖滑就是滚文章，浏览器自己走。
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
			if (!from || !active) return;
			const touch = event.changedTouches[0];
			if (!touch) return;
			const dy = from.y - touch.clientY;
			const dx = from.x - touch.clientX;
			if (Math.abs(dy) <= Math.abs(dx) || Math.abs(dy) < TOUCH_STEP_PX) return;
			const dir: 1 | -1 = dy > 0 ? 1 : -1;
			if (covered) {
				if (dir < 0) return;
				const now = performance.now();
				if (now < lockUntil) return;
				lockUntil = now + GESTURE_LOCK_MS;
				leaveCover();
				return;
			}
			if (!verticalIsShell()) return;
			if (isScrollPane()) {
				// 长滚章：先看文章滚到边没有，到了才跟翻。
				const edges = scrollEdges();
				if (!edges) return;
				if (!scrollFollowThrough({ atTop: edges.atTop, atBottom: edges.atBottom, dir })) return;
			}
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
		if (covered) {
			if (dir < 0) return;
			event.preventDefault();
			leaveCover();
			return;
		}
		// 地图章的方向键归 traj：壳连 preventDefault 都不做。
		if (!verticalIsShell()) return;
		if (isScrollPane() && !scrollByKey(dir)) {
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
	if (coverFace) coverFace.hidden = true;

	return {
		setActive,
		isActive: () => active,
		currentChapter: () => (active ? (covered ? 'record' : kind()) : null),
	};
}
