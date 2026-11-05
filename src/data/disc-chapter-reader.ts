/**
 * 窄屏章节壳 v3 的客户端：底栏点选跳章、竖滑滚章内文章、到文头／文末直接跟翻邻章。
 *
 * 只在 `max-width: 47.99rem` 的阅读态里活着（由页面的 settled 条开关），
 * 桌面路径一根手指都不碰。地图章的手势全部留给 traj：这里一个 delta 都不拦。
 *
 * 正文三章都不是拍切：唱片（章内竖滑 runway）、述语（长文）、资料（字段列表）
 * 都是章内自由长滚。唱片章不用捏合／双击整层放大，也不自动播：竖滑**连续**驱动
 * 「整幅 upright → 对齐 crop 的裁剪窗 → plate → settled 框选肘线」，可反刮；
 * 多面靠继续下滑过 joint（屏上无圆点／pager）。
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
import {
	type CoverPaint,
	coverCropGeometry,
	coverPassPaint,
	coverPlace,
	coverRunwayHeightPx,
	coverRunwayProgress,
} from './disc-cover-crop.ts';
import {
	type BandLayout,
	type BandNotePlacement,
	bandLayoutFor,
	bandLeaderPoints,
	bandNoteGapPx,
	bandNoteWidthPx,
	bandReservePx,
	bandStackReservePx,
	bandStackWidthPx,
	bandStubSeat,
	bandStubUser,
	placeBandNotes,
} from './settled-band-notes.ts';

/**
 * 注文真高：优先 `getBoundingClientRect().height`（含变换后实际占位，子元素折行也算），
 * 回退 `offsetHeight`。旧实现按两档魔法估高，行数一变就估错，字压图／字压字。
 */
function noteHeightPx(li: HTMLElement | undefined): number {
	if (!li) return 0;
	const rect = li.getBoundingClientRect();
	if (rect.height > 0.5) return rect.height;
	return li.offsetHeight;
}

/** 两个注文框是否互相压边（留 0.5px 容差，像素取整不误判）。 */
function rectsOverlap(a: DOMRect, b: DOMRect): boolean {
	const pad = 0.5;
	return (
		a.left < b.right - pad &&
		a.right > b.left + pad &&
		a.top < b.bottom - pad &&
		a.bottom > b.top + pad
	);
}

/**
 * 落完 DOM 后实测兜底：这条注文是否与其它上屏注文相交。
 * 布局算出来的高可能比实际折行矮（字体回退／CJK 断行），所以算完还要量一遍。
 */
function noteRectClashes(
	li: HTMLElement | undefined,
	live: readonly number[],
	items: readonly HTMLElement[],
	order: readonly number[],
): boolean {
	if (!li) return false;
	const rect = li.getBoundingClientRect();
	if (rect.height <= 0 || rect.width <= 0) return false;
	for (const slot of live) {
		const other = items[order[slot] ?? 0];
		if (!other || other === li) continue;
		if (rectsOverlap(rect, other.getBoundingClientRect())) return true;
	}
	return false;
}

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
	/** 唱片章 runway 的落帧：进章／回章按当前滚动位置落一帧（**不播**）。 */
	let coverSync: ((remeasure?: boolean) => void) | null = null;

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
		// 进唱片章按当前滚动位置落一帧：竖滑到哪就停在哪，不自动播。
		if (kind() === 'record') coverSync?.(true);
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
	 * 唱片章：章内竖滑 runway——一面一段 pass，续滑过 joint 进下一面。
	 *
	 * 滚动位置**连续**驱动 `cropT`：upright → 裁剪窗聚焦 → plate → settled 框选肘线；
	 * 往回收就是反刮（同一个进度函数，没有方向状态、没有锁存）。没有按时间播的一镜：
	 * 进章／换面都不自动播。几何全走 `detail-display`
	 * （`openingBox`／`plateBox`／`zoomImageBox`／`cropWindow`），相位走 `split-stage`
	 * （`placeOnRunway`／`stageVisual`），封在 `disc-cover-crop.ts`。
	 * `prefers-reduced-motion`：每面直接落在 settled，但换面仍靠竖滑（进度照旧），不偷偷自动播。
	 * 屏上没有任何切面控件：`data-cover-side` 只留隐藏状态。
	 */
	function wireCoverRunway(target: Pane): (() => void) | null {
		const root = target.el.querySelector<HTMLElement>('[data-chapter-record-cover]');
		const scrollEl = target.scroll;
		const runway = root?.querySelector<HTMLElement>('[data-cover-runway]');
		const stageEl = root?.querySelector<HTMLElement>('[data-cover-stage]');
		if (!root || !scrollEl || !runway || !stageEl) return null;
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
			// 框与虚线肘的父层：CSS 在 fill→crop 时把它压成 0，得由阅读器抬回来。
			overlay: SVGSVGElement | null;
			notes: HTMLElement | null;
			hasNotes: boolean;
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
				const notes = el.querySelector<HTMLElement>('.disc-record-marks') ?? null;
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
					overlay: el.querySelector<SVGSVGElement>('.disc-record-overlay'),
					notes,
					hasNotes: (notes?.children.length ?? 0) > 0,
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

		const passCount = faces.length;
		let current = -1;
		let runwayHeight = 0;
		/** runway 顶在章内滚动内容里的偏移：只在尺寸变了之后重量。 */
		let runwayTop = 0;
		let measuredStage = -1;

		const motionOk = (): boolean => document.documentElement.dataset.motion !== 'reduce';

		/** 把一帧相位落成样式；几何只有一个来源（`coverCropGeometry`）。 */
		const remPx = (): number => {
			const rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
			return rem > 0 ? rem : 16;
		};

		/**
		 * settled：注文进 pane 纸带，肘线伸出 plate stub；非 settled 只淡出不改几何。
		 *
		 * 侧带够宽（≥`BAND_NOTE_MIN_REM`）就贴左右列；不够就改 plate 上下的 letterbox 横排
		 * （`data-band='stack'`）——窄屏侧带只有 ~3.4rem，拉丁单词会一字一折、两列互压。
		 * 上／下纸边按注文实测高留（`bandStackReservePx`），plate 先缩再摆，字不压图也不压字。
		 */
		const placeCoverBandNotes = (
			face: Face,
			pane: { width: number; height: number },
			plate: { left: number; top: number; width: number; height: number },
			settled: boolean,
			layout: BandLayout = 'side',
		): void => {
			const notes = face.notes;
			if (!notes || !face.hasNotes) return;
			const items = [...notes.querySelectorAll<HTMLElement>(':scope > li')];
			if (items.length === 0) return;
			if (!settled) {
				delete notes.dataset.band;
				return;
			}
			const rem = remPx();
			const width =
				layout === 'stack'
					? bandStackWidthPx({ pane, rem })
					: bandNoteWidthPx({ pane, plate, rem });
			for (const li of items) {
				li.style.width = `${Math.max(0, width)}px`;
				li.style.maxWidth = 'none';
				li.style.transform = 'none';
			}
			void notes.offsetHeight;
			// stack 时注文横排，按阅读顺序（seat 的 y）各归上／下带：阅读器只传 heights，
			// 行序由 `placeBandNotes` 与 `bandStackReservePx` 共用同一份分割决定。
			const order =
				layout === 'stack'
					? items
							.map((li, index) => ({ index, center: Number(li.dataset.seatCenter ?? '0') }))
							.sort((a, b) => a.center - b.center || a.index - b.index)
							.map((entry) => entry.index)
					: items.map((_, index) => index);
			// 真高：量出来的框高（`getBoundingClientRect` 取实际占位，退回 `offsetHeight`）。
			// 旧实现按两档魔法估高，行数一变就估错，字压图／字压字。
			const heights = order.map((index) => noteHeightPx(items[index]));
			const seats = order.map((index) => ({
				side: (items[index]?.dataset.side === 'left' ? 'left' : 'right') as 'left' | 'right',
				center: Number(items[index]?.dataset.seatCenter ?? '0'),
			}));
			// 优先级：DOM 上给了就用（`data-mark-priority`），否则＝阅读序。
			const priorities = order.map((index, slot) => {
				const raw = Number(items[index]?.dataset.markPriority ?? '');
				return Number.isFinite(raw) ? raw : slot;
			});
			const gap = bandNoteGapPx(rem);
			const stubUser = bandStubUser(gap, plate.width, face.plateW);
			// 减载顺序：已卸的排最后（`priorities` 越小越优先保留）。
			const rank = (shed: ReadonlySet<number>): number[] =>
				priorities.map((value, slot) => (shed.has(slot) ? Number.MAX_SAFE_INTEGER : value));
			const layoutNotes = (shed: ReadonlySet<number>): BandNotePlacement[] =>
				placeBandNotes({
					pane,
					plate,
					plateSize: { width: face.plateW, height: face.plateH },
					rem,
					seats,
					heights,
					layout,
					priorities: rank(shed),
				});
			/**
			 * 把一份排位落到 DOM（写 left/top/width、data-side、`data-shed`、肘线），
			 * 回「上屏的槽位」。减载条隐藏且不画肘线。
			 */
			const applyPlacements = (placed: readonly BandNotePlacement[]): number[] => {
				const live: number[] = [];
				for (let slot = 0; slot < order.length; slot += 1) {
					const li = items[order[slot] ?? 0];
					const place = placed[slot];
					if (!li) continue;
					if (!place || place.shed || place.width <= 0) {
						li.dataset.shed = '1';
						li.setAttribute('aria-hidden', 'true');
						li.style.visibility = 'hidden';
						continue;
					}
					delete li.dataset.shed;
					li.removeAttribute('aria-hidden');
					li.style.visibility = '';
					li.dataset.side = place.side;
					Object.assign(li.style, {
						left: `${place.left}px`,
						top: `${place.top}px`,
						width: `${place.width}px`,
						right: 'auto',
						bottom: 'auto',
						transform: 'none',
						maxWidth: 'none',
					} satisfies Partial<CSSStyleDeclaration>);
					live.push(slot);
					const markId = li.dataset.markId;
					const leader = markId && face.leaders
						? face.leaders.querySelector<SVGPolylineElement>(
								`.mark-leader[data-mark-id="${CSS.escape(markId)}"]`,
							)
						: null;
					const mark = {
						x: Number(li.dataset.markX),
						y: Number(li.dataset.markY),
						w: Number(li.dataset.markW),
						h: Number(li.dataset.markH),
					};
					if (!leader || !(mark.w > 0) || !(mark.h > 0)) continue;
					leader.setAttribute(
						'points',
						bandLeaderPoints({
							mark,
							seat: bandStubSeat({
								place,
								plate,
								plateSize: { width: face.plateW, height: face.plateH },
							}),
							plateWidth: face.plateW,
							plateHeight: face.plateH,
							stubUser,
						}),
					);
				}
				notes.dataset.notesShed = String(order.length - live.length);
				return live;
			};

			// 算出来的位装不下（越出 pane／压 plate）就按优先级减载重排；落完 DOM 后再用
			// `getBoundingClientRect` 实测兜底一次，仍相交就再卸一条（字体回退／折行差异兜底）。
			const shed = new Set<number>();
			let live: number[] = [];
			for (let guard = 0; guard <= order.length; guard += 1) {
				const placed = layoutNotes(shed);
				for (let slot = 0; slot < order.length; slot += 1) {
					if (placed[slot]?.shed) shed.add(slot);
				}
				live = applyPlacements(layoutNotes(shed));
				if (!live.some((slot) => noteRectClashes(items[order[slot] ?? 0], live, items, order))) break;
				let drop = -1;
				for (const slot of live) {
					if (drop < 0 || priorities[slot]! > priorities[drop]!) drop = slot;
				}
				if (drop < 0) break;
				shed.add(drop);
			}
			notes.dataset.band = layout === 'stack' ? 'stack' : 'placed';
		};

		/**
		 * 是否改上下 letterbox：按只留侧边的 plate 判（不拿 stack 缩过的 plate 再判，
		 * 否则 plate 一缩侧带变宽，layout 会来回跳）。顺便量出上下纸边要留多高。
		 */
		const bandPlan = (
			face: Face,
			pane: { width: number; height: number },
			rem: number,
			sidePlate: { left: number; top: number; width: number; height: number },
		): { layout: BandLayout; reserveY: number } => {
			const layout = bandLayoutFor({ pane, plate: sidePlate, rem });
			if (layout === 'side' || !face.notes) return { layout, reserveY: 0 };
			const items = [...face.notes.querySelectorAll<HTMLElement>(':scope > li')];
			if (items.length === 0) return { layout: 'side', reserveY: 0 };
			const width = bandStackWidthPx({ pane, rem });
			for (const li of items) {
				li.style.width = `${Math.max(0, width)}px`;
				li.style.maxWidth = 'none';
				li.style.transform = 'none';
			}
			void face.notes.offsetHeight;
			const heights = items.map((li) => li.offsetHeight);
			return { layout, reserveY: bandStackReservePx({ heights, rem }) };
		};

		const paintFace = (face: Face, paint: CoverPaint): void => {
			const pane = { width: face.frame.clientWidth, height: face.frame.clientHeight };
			if (pane.width <= 0 || pane.height <= 0) return;
			const rem = remPx();
			const reserve = face.hasNotes ? bandReservePx(rem) : 0;
			// 先按只留侧边的几何判 layout（再量 stack 纸边高），最后才落真正的几何。
			const probe = coverCropGeometry({
				pane,
				natural: { width: face.uprightW, height: face.uprightH },
				plate: { width: face.plateW, height: face.plateH },
				crop: face.crop,
				cropT: paint.cropT,
				bandReservePx: reserve,
			});
			const plan = face.hasNotes
				? bandPlan(face, pane, rem, probe.plate)
				: { layout: 'side' as BandLayout, reserveY: 0 };
			const geo = coverCropGeometry({
				pane,
				natural: { width: face.uprightW, height: face.uprightH },
				plate: { width: face.plateW, height: face.plateH },
				crop: face.crop,
				cropT: paint.cropT,
				bandReservePx: reserve,
				bandReservePxY: plan.layout === 'stack' ? plan.reserveY : reserve,
			});
			const { image, window: win, plate } = geo;
			if (face.outer) {
				face.outer.style.opacity = String(paint.outerOpacity);
				face.outer.style.visibility = paint.outerOpacity === 0 ? 'hidden' : 'visible';
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
				// plate 接上以后窗与 plate 重合，收掉窗（窗缘不该绕在落定的 plate 外圈）。
				const hideWindow = paint.windowOpacity <= 0;
				Object.assign(face.windowEl.style, {
					left: `${win.left}px`,
					top: `${win.top}px`,
					width: `${win.width}px`,
					height: `${win.height}px`,
					transformOrigin: '0 0',
					transform: geo.windowTransform,
					opacity: hideWindow ? '0' : '1',
					visibility: hideWindow ? 'hidden' : 'visible',
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
					opacity: String(paint.plateOpacity),
				} satisfies Partial<CSSStyleDeclaration>);
			}
			if (face.plateImg) {
				face.plateImg.style.objectFit = 'fill';
				face.plateImg.style.opacity = String(paint.plateOpacity);
			}
			// 框／虚线肘／注文各按自己的相位淡入：反刮会一起退回去。
			const callouts: [HTMLElement | SVGGElement | SVGSVGElement | null, number][] = [
				[face.graphics, paint.boxesOpacity],
				[face.leaders, paint.leadersOpacity],
				[face.notes, paint.notesOpacity],
				// 父层 `overlay` 在 CSS 里被压成 0：不跟着抬到 1，框与虚线肘一辈子不画，
				// 只剩 `.disc-record-marks` 的注文孤悬。
				[face.overlay, paint.calloutOpacity > 0 ? 1 : 0],
			];
			for (const [node, opacity] of callouts) {
				if (!node) continue;
				node.style.opacity = String(opacity);
				node.style.visibility = opacity > 0 ? 'visible' : 'hidden';
			}
			// plate 几何已带 bandReserve 时就摆好：淡入阶段也不走 46% 盖图兜底。
			placeCoverBandNotes(face, pane, plate, paint.cropT >= 1 && face.hasNotes, plan.layout);
			face.el.dataset.cropT = paint.cropT.toFixed(3);
			face.el.dataset.coverState = paint.settled ? 'settled' : paint.cropT >= 1 ? 'plate' : paint.cropT > 0 ? 'crop' : 'upright';
			face.el.classList.toggle('is-settled', paint.settled);
		};

		const showFace = (index: number): void => {
			if (index === current) return;
			current = index;
			faces.forEach((face, position) => {
				const on = position === index;
				face.el.hidden = !on;
				face.el.classList.toggle('is-on', on);
			});
		};

		/**
		 * runway 的总高＝舞台高 ＋ 行程：一面≈`COVER_PASS_SCREENS` 屏，
		 * 相位边界仍由 `split-stage` 的 pass／joint 决定（不在这里另发明）。
		 *
		 * 舞台高取「滚动口高 − 上下内距」，于是滚到底刚好是进度 1（settled 可达）；
		 * 否则章内内距会把最后一段吃成滚不到。
		 */
		let cachedPort = -1;
		const ensureLayout = (): number => {
			const portH = scrollEl.clientHeight;
			// 章还没上屏（hidden）时量不到高：别把 runway 写成 0，等激活后再落。
			if (portH < 8) return Math.max(0, runwayHeight - measuredStage);
			// 滚动时不做无谓的布局读写：只有端高变了／标脏才重量一次。
			if (portH !== cachedPort || measuredStage < 0) {
				cachedPort = portH;
				const styles = getComputedStyle(scrollEl);
				const padTop = parseFloat(styles.paddingTop) || 0;
				const padBottom = parseFloat(styles.paddingBottom) || 0;
				const stagePx = Math.max(80, Math.round(portH - padTop - padBottom));
				if (stagePx !== measuredStage) {
					stageEl.style.height = `${stagePx}px`;
					measuredStage = stagePx;
				}
				const height = coverRunwayHeightPx(stagePx, passCount);
				if (Math.abs(height - runwayHeight) > 0.5) {
					runway.style.height = `${height}px`;
					runwayHeight = height;
				}
				runwayTop =
					runway.getBoundingClientRect().top -
					scrollEl.getBoundingClientRect().top +
					scrollEl.scrollTop;
			}
			return Math.max(0, runwayHeight - measuredStage);
		};

		/**
		 * 一帧：进度 → 面 ＋ 面内相位。joint 的前半段还留在上一面的 settled，
		 * 过半再换到下一面的 upright（与桌面 crossfade 同序；不摆切面控件）。
		 */
		const sync = (remeasure = false): void => {
			if (remeasure) {
				measuredStage = -1;
				cachedPort = -1;
			}
			const travelPx = ensureLayout();
			const place = coverPlace(
				coverRunwayProgress({ scrollTop: scrollEl.scrollTop, runwayTop, travelPx }),
				passCount,
			);
			const holding = place.joint > 0 && place.outgoing >= 0 && place.joint < 0.5;
			const index = holding ? place.outgoing : place.index;
			const local = holding ? 1 : place.local;
			showFace(index);
			const face = faces[index];
			if (!face) return;
			// reduced-motion：这一面直接落在 settled；换面仍由进度决定（不自动播）。
			paintFace(
				face,
				coverPassPaint({ local, hasNotes: face.hasNotes, settle: !motionOk() }),
			);
			root.dataset.coverPass = String(index + 1);
			root.dataset.coverPassCount = String(passCount);
			root.dataset.coverLocal = local.toFixed(3);
		};

		scrollEl.addEventListener('scroll', () => sync(), { passive: true });
		// 转屏／字体回流：重量 runway，再按当前进度落一帧（不重播）。
		window.addEventListener('resize', () => {
			measuredStage = -1;
			sync();
		});
		window.matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', () => sync());

		showFace(0);
		sync(true);
		return sync;
	}

	coverSync = (() => {
		const target = panes.find((pane) => pane.kind === 'record');
		return target ? wireCoverRunway(target) : null;
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
			if (!from || !active) return;
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
			if (!from || !active || stepped) return;
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
