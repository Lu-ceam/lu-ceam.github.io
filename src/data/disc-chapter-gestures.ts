/**
 * 手机章节手势的**生产 adapter**：阅读器与地图客户端都只通过这里的函数接事件，
 * 于是「壳的竖滑／键盘」和「地图的站桥」各有唯一入口，可以直接被 node:test 驱动。
 *
 * 这一层只做「事件 → 边界状态机事件」的翻译与身份管理：DOM 类型最小化，
 * 不写 `scrollTop`、不读时钟、不 new 计时器。几何、Touch／KeyboardEvent、
 * 异步站落稳都由调用方给；测试里这些是显式合成（synthetic），不是浏览器证据。
 */

import {
	type BoundaryDir,
	type BoundaryEffects,
	type BoundaryEvent,
	type BoundaryGesture,
	type EdgeProbe,
	stationEdgeProbe,
	type TrapGestureDetail,
	type TrapSettledDetail,
} from './disc-chapter-boundary.ts';

/** `TouchList` 的最小结构：真 `TouchList` 与数组都满足。 */
export type TouchListLike = { readonly length: number; readonly [index: number]: TouchPoint | undefined };
export type TouchPoint = { identifier: number; clientX: number; clientY: number };
export type TouchEventLike = {
	target?: unknown;
	touches: TouchListLike;
	changedTouches: TouchListLike;
	cancelable?: boolean;
};

/**
 * 手势优先级（PRD §5.1）：控件、可编辑字段、链接、summary、站表自己的滚动、
 * 文本选择一律优先。壳和地图都不抢这些操作。
 */
export const INTERACTIVE_SELECTOR = [
	'a[href]',
	'button',
	'input',
	'textarea',
	'select',
	'label',
	'summary',
	'option',
	'[contenteditable]',
	'[contenteditable=""]',
	'[contenteditable="true"]',
	'[role="button"]',
	'[role="textbox"]',
	'.traj-stops',
	'.traj-stops-fold',
	'.traj-controls',
	'.disc-props-links',
].join(', ');

/** 没有发生边界事件时返回的空效果：调用方照读 `.prevent`，不必分两种返回形状。 */
const NO_EFFECTS: BoundaryEffects = { commit: 0, arm: 0, armChanged: false, prevent: false };

type Closest = { closest(selector: string): unknown };

function closestOf(target: unknown): Closest | null {
	if (!target || typeof (target as Closest).closest !== 'function') return null;
	return target as Closest;
}

export function ownsInteractiveGesture(target: unknown): boolean {
	const node = closestOf(target);
	if (!node) return false;
	return node.closest(INTERACTIVE_SELECTOR) !== null;
}

/** 可编辑字段里的方向键归字段自己：不拦、不 arm、不 preventDefault。 */
export function ownsEditableKeys(target: unknown): boolean {
	const node = closestOf(target);
	if (!node) return false;
	if ((target as { isContentEditable?: boolean }).isContentEditable === true) return true;
	return node.closest('input, textarea, select, [contenteditable], [role="textbox"]') !== null;
}

/** 舞台上正有一段被选中的文字：竖滑是选区的，不是章切的。 */
export function hasLiveSelection(): boolean {
	const doc = (globalThis as { document?: { getSelection?: () => { isCollapsed?: boolean } | null } })
		.document;
	const selection = doc?.getSelection?.();
	return selection != null && selection.isCollapsed === false;
}

const dirOfKey = (key: string): 0 | BoundaryDir =>
	key === 'ArrowDown' || key === 'PageDown' ? 1 : key === 'ArrowUp' || key === 'PageUp' ? -1 : 0;

function touchIn(list: TouchListLike, identifier: number): TouchPoint | null {
	for (let index = 0; index < list.length; index += 1) {
		const touch = list[index];
		if (touch && touch.identifier === identifier) return touch;
	}
	return null;
}

export type ChapterTouchAdapter = {
	/** touchstart：只有壳当前拥有竖滑、且不是控件／选区时才开新 gesture。 */
	start(event: TouchEventLike): void;
	/** touchmove：`effects.prevent` = 这一帧要约束 overscroll（已到边＋朝外）。 */
	move(event: TouchEventLike): BoundaryEffects;
	/** touchend：`effects.prevent` = 这一次松手要约束回弹。 */
	end(event: TouchEventLike): BoundaryEffects;
	cancel(): void;
	/** 丢掉「主指／嫌疑」身份，不动边界（epoch、可见性变化时用）。 */
	reset(): void;
	/** 屏上手指数：惯性到边只认 0。 */
	touching(): number;
};

export function createChapterTouchAdapter(input: {
	/** 竖滑现在归壳（正文三章且非探索）。 */
	owns(): boolean;
	probe(dir: BoundaryDir): EdgeProbe | null;
	neighbor(dir: BoundaryDir): boolean;
	/** 当前 reducer 里的 gesture（取 startY 与 id）。 */
	gesture(): BoundaryGesture | null;
	apply(event: BoundaryEvent): BoundaryEffects;
}): ChapterTouchAdapter {
	let seq = 0;
	let primary: number | null = null;
	let suspect = false;
	let count = 0;

	/** 只有 cancelable 的事件才允许 preventDefault：不可取消时如实返回 prevent=false。 */
	const finish = (event: TouchEventLike, effects: BoundaryEffects): BoundaryEffects =>
		effects.prevent && event.cancelable === false ? NO_EFFECTS : effects;

	return {
		start(event) {
			count = event.touches.length;
			primary = null;
			suspect = false;
			if (!input.owns()) return;
			// 控件／链接／summary／站表／可编辑字段／选中文字：这一手指不是章切的。
			if (ownsInteractiveGesture(event.target) || hasLiveSelection()) {
				suspect = true;
				return;
			}
			const touch = event.touches[0];
			if (!touch) return;
			primary = touch.identifier;
			seq += 1;
			input.apply({
				type: 'begin',
				gestureId: seq,
				touchId: touch.identifier,
				touchCount: event.touches.length,
				x: touch.clientX,
				y: touch.clientY,
			});
		},

		move(event) {
			count = event.touches.length;
			if (suspect || !input.owns()) return NO_EFFECTS;
			const gesture = input.gesture();
			if (!gesture) return NO_EFFECTS;
			const primaryId = primary;
			if (primaryId === null) return NO_EFFECTS;
			const touch = touchIn(event.touches, primaryId);
			if (!touch) {
				// 主指丢了（多指加入后第一根抬起等）：本次作废，不跟着剩余手指走。
				input.apply({ type: 'cancel', gestureId: gesture.id });
				primary = null;
				return NO_EFFECTS;
			}
			const net = gesture.startY - touch.clientY;
			const dir: BoundaryDir = net > 0 ? 1 : net < 0 ? -1 : gesture.confirmDir || 1;
			const effects = input.apply({
				type: 'move',
				gestureId: gesture.id,
				x: touch.clientX,
				y: touch.clientY,
				touchCount: event.touches.length,
				edge: event.touches.length > 1 ? null : input.probe(dir),
			});
			return finish(event, effects);
		},

		end(event) {
			count = event.touches.length;
			if (suspect) {
				suspect = false;
				return NO_EFFECTS;
			}
			const gesture = input.gesture();
			const primaryId = primary;
			primary = null;
			if (!gesture || primaryId === null) return NO_EFFECTS;
			// 只有主指真的抬起来才算这一次的 end；别的手指先抬不算。
			const touch = touchIn(event.changedTouches, primaryId);
			if (!touch) return NO_EFFECTS;
			const net = gesture.startY - touch.clientY;
			const dir: BoundaryDir =
				net > 0 ? 1 : net < 0 ? -1 : gesture.confirmDir || gesture.arriving || 1;
			const effects = input.apply({
				type: 'end',
				gestureId: gesture.id,
				x: touch.clientX,
				y: touch.clientY,
				touchCount: event.touches.length + 1,
				edge: input.probe(dir),
				neighbor: input.neighbor(gesture.confirmDir || dir),
			});
			return finish(event, effects);
		},

		cancel() {
			count = 0;
			primary = null;
			suspect = false;
			input.apply({ type: 'cancel' });
		},

		reset() {
			primary = null;
			suspect = false;
			count = 0;
		},

		touching() {
			return count;
		},
	};
}

export type KeyEventLike = {
	key: string;
	repeat?: boolean;
	metaKey?: boolean;
	ctrlKey?: boolean;
	altKey?: boolean;
	shiftKey?: boolean;
	target?: unknown;
};

export type ChapterKeyAdapter = {
	/** keydown：返回 true 表示调用方应 preventDefault。 */
	down(event: KeyEventLike): boolean;
	/** keyup：这一次物理按压结束，下一次 keydown 才是「有释放的动作」。 */
	up(event: KeyEventLike): void;
	reset(): void;
	/** 当前按住的方向键集合（诊断／测试用）。 */
	held(): readonly string[];
};

/**
 * 键盘：方向／Page 键一次 **keydown→keyup** 才算一次有释放的动作。
 * 忽略 repeat 不等于有释放——按住 ArrowDown 再按 PageDown 时，
 * PageDown 那次 keydown 没有释放，不能当第二次确认。
 */
export function createChapterKeyAdapter(input: {
	owns(): boolean;
	/** true = 这一按真的滚了文章（还没到边）；false = 已经在边，按键交给边界。 */
	scrollByKey(dir: BoundaryDir): boolean;
	probe(dir: BoundaryDir): EdgeProbe | null;
	neighbor(dir: BoundaryDir): boolean;
	apply(event: BoundaryEvent): BoundaryEffects;
}): ChapterKeyAdapter {
	const held = new Set<string>();
	return {
		down(event) {
			if (event.metaKey || event.ctrlKey || event.altKey) return false;
			const dir = dirOfKey(event.key);
			if (dir === 0) return false;
			// 地图章的方向键归 traj：壳连 preventDefault 都不做。
			if (!input.owns()) return false;
			if (ownsEditableKeys(event.target)) return false;
			held.add(event.key);
			// 自动重复不是新手势。
			if (event.repeat) return true;
			// 还有别的键按着：这不是一次新的、有释放的按压。
			if (held.size > 1) return true;
			// 章内还能滚：这一按就是滚文章，不是边界动作。
			if (input.scrollByKey(dir)) return true;
			input.apply({
				type: 'key',
				dir,
				edge: input.probe(dir),
				neighbor: input.neighbor(dir),
			});
			return true;
		},
		up(event) {
			held.delete(event.key);
		},
		reset() {
			held.clear();
		},
		held() {
			return [...held];
		},
	};
}

/** 地图一次站动作的来源身份：gid／主指／方向／**发起时的** epoch。 */
export type StationAction = {
	gestureId: number;
	touchId: number;
	dir: BoundaryDir;
	epoch: number;
};

/** 真实落稳结果：飞行与旁白都要完成，token 还要仍是当前那一次。 */
export type StationSettle = {
	flew: boolean;
	revealed: boolean;
	token: number;
	currentToken: number;
};

export type StationEndResult = {
	gesture: TrapGestureDetail | null;
	settled: TrapSettledDetail | null;
	/** 这一 gid 真的换了站：稍后由真实落稳来 settle。 */
	action: StationAction | null;
};

export type StationBridge = {
	begin(touch: TouchPoint, touchCount: number): TrapGestureDetail | null;
	move(touch: TouchPoint, touchCount: number, dir: 0 | BoundaryDir): TrapGestureDetail | null;
	/** 飞行／旁白完成：只有原 gid、原 epoch、端站、且原手指已松手才 ready。 */
	settle(action: StationAction, outcome: StationSettle): TrapSettledDetail | null;
	/** `station=true` 表示这一 gid 被站动作吃掉；返回它稍后要 settle 的身份。 */
	end(
		touch: TouchPoint,
		touchCount: number,
		dir: 0 | BoundaryDir,
		station: boolean,
	): StationEndResult;
	cancel(): TrapGestureDetail | null;
	/** 这一步的飞行／旁白被后来的 token 取消：把「等落稳」的账销掉，不让它永远挂着。 */
	abandon(): void;
	reset(): void;
	/** 有站动作还没落稳：这段时间里开始的新 gesture 整次不具跨章资格。 */
	settling(): boolean;
};

type BridgeOrigin = {
	gestureId: number;
	touchId: number;
	dir: 0 | BoundaryDir;
	/** 发起那一刻的 epoch：迟到的异步完成不能借后来的桥状态复活。 */
	epoch: number;
	ended: boolean;
	/** 站动作还没落稳就按下的手指：整次不合格，也不排队。 */
	blocked: boolean;
};

type BridgePending = {
	action: StationAction;
	/** 真实飞行＋旁白都完成了。 */
	settled: boolean;
	/** 落稳之后要挂到哪一次「已结束的手势」上；null = 还没有手指抬起。 */
	endGid: number | null;
};

export function createStationBridge(input: {
	/** 桥只在窄屏地图章打开。 */
	active(): boolean;
	epoch(): number;
	canStep(dir: BoundaryDir): boolean;
	/** 地图自己还没落稳（飞行／旁白／锁）：此时按下的手指整次不合格。 */
	busy?(): boolean;
}): StationBridge {
	let seq = 0;
	let origin: BridgeOrigin | null = null;
	let pending: BridgePending | null = null;

	const detail = (
		phase: TrapGestureDetail['phase'],
		source: { gestureId: number; touchId: number; dir: 0 | BoundaryDir },
		touchCount: number,
		point: { x: number; y: number },
		probe: EdgeProbe | null,
		station: boolean,
	): TrapGestureDetail => ({
		phase,
		gestureId: source.gestureId,
		touchId: source.touchId,
		touchCount,
		x: point.x,
		y: point.y,
		probe,
		station,
	});

	/** 落稳＋已抬手指才发一条 boundary-ready（一条消息只发一次）。 */
	const report = (): TrapSettledDetail | null => {
		if (!pending || !pending.settled || pending.endGid === null) return null;
		const settled: TrapSettledDetail = {
			gestureId: pending.endGid,
			dir: pending.action.dir,
			epoch: pending.action.epoch,
		};
		pending = null;
		return settled;
	};

	/** 站动作没落稳／本 gid 不合格时，probe 一律为空：壳不能借此 arm。 */
	const probeFor = (dir: 0 | BoundaryDir, blocked: boolean): EdgeProbe | null => {
		if (dir === 0 || blocked) return null;
		return stationEdgeProbe({ dir, canStep: input.canStep(dir) });
	};

	return {
		begin(touch, touchCount) {
			if (!input.active()) return null;
			seq += 1;
			// 站动作还没落稳／地图还在飞，新手就按下：旧的 ready 直接作废、也不排队给新手指。
			const blocked = pending !== null || input.busy?.() === true;
			if (blocked) pending = null;
			origin = {
				gestureId: seq,
				touchId: touch.identifier,
				dir: 0,
				epoch: input.epoch(),
				ended: false,
				blocked,
			};
			return detail('begin', origin, touchCount, { x: touch.clientX, y: touch.clientY }, null, false);
		},

		move(touch, touchCount, dir) {
			if (!input.active() || !origin) return null;
			// 只认这一次 gesture 的主指：剩下的手指不接班。
			if (touch.identifier !== origin.touchId) return null;
			if (dir !== 0) origin.dir = dir;
			const blocked = origin.blocked;
			return detail(
				'move',
				origin,
				touchCount,
				{ x: touch.clientX, y: touch.clientY },
				probeFor(dir, blocked),
				blocked,
			);
		},

		settle(action, outcome) {
			// 桥已经卸下（离章／宽屏化）：迟到的完成不得再报 ready。
			if (!input.active()) {
				pending = null;
				return null;
			}
			if (!pending || pending.action.gestureId !== action.gestureId) return null;
			// 迟到的完成：换了章（epoch）或 token 已经不是当前那次，直接作废。
			if (action.epoch !== input.epoch() || outcome.token !== outcome.currentToken) {
				pending = null;
				return null;
			}
			// 飞行被取消：这不是一次落稳。
			if (!outcome.flew) {
				pending = null;
				return null;
			}
			// 飞行到了、旁白还没落：继续等，既不发 ready 也不解除不合格。
			if (!outcome.revealed) return null;
			// 还没到端站：这一 gid 只换站，不交接。
			if (input.canStep(action.dir)) {
				pending = null;
				return null;
			}
			pending.settled = true;
			return report();
		},

		end(touch, touchCount, dir, station) {
			if (!input.active() || !origin) return { gesture: null, settled: null, action: null };
			// 主指还没抬起：别的手指先抬不算这一次的 end。
			if (touch.identifier !== origin.touchId) return { gesture: null, settled: null, action: null };
			if (dir !== 0) origin.dir = dir;
			// 站还没落稳就按下的手指：这一 gid 标成站动作消费，但不排队、不 settle。
			const blocked = origin.blocked;
			let action: StationAction | null = null;
			if (station && !blocked) {
				action = {
					gestureId: origin.gestureId,
					touchId: origin.touchId,
					dir: (dir || 1) as BoundaryDir,
					epoch: origin.epoch,
				};
				if (!pending) pending = { action, settled: false, endGid: null };
			}
			origin.ended = true;
			// 只有这一步自己的手指结束才算「原 gid 已松手」：后面的手指不能替它落款。
			if (pending?.endGid === null && pending.action.gestureId === origin.gestureId) {
				pending.endGid = origin.gestureId;
			}
			const gesture = detail(
				'end',
				origin,
				touchCount,
				{ x: touch.clientX, y: touch.clientY },
				probeFor(dir, blocked),
				// 不合格的 gid 也标成「没有跳章资格」：壳不会拿它 arm，也不会排队。
				station || blocked,
			);
			return { gesture, settled: report(), action: station ? action : null };
		},

		abandon() {
			pending = null;
		},

		cancel() {
			if (!input.active() || !origin) return null;
			const gesture = detail('cancel', origin, 0, { x: 0, y: 0 }, null, false);
			origin = null;
			// 取消（blur／hidden／touchcancel）＝这一次 gid 彻底作废：不论飞行有没有落稳，
			// 账都销掉，迟到的完成拿同一个 action 也换不回 ready。
			pending = null;
			return gesture;
		},

		reset() {
			origin = null;
			pending = null;
		},

		settling() {
			return pending !== null;
		},
	};
}

/** 已验证的站目标：只认本站碟真实存在的 place。 */
export type StationTarget = { discId: string; placeId: string; index: number };

export function stationTargetIndex(
	discs: ReadonlyMap<string, { places: readonly { id: string }[] }>,
	discId: unknown,
	placeId: unknown,
): number {
	if (typeof discId !== 'string' || typeof placeId !== 'string') return -1;
	const disc = discs.get(discId);
	if (!disc) return -1;
	return disc.places.findIndex((place) => place.id === placeId);
}

/** 站目标是否形状完整（壳不猜 hash、不猜索引）。 */
export function isStationTarget(value: unknown): value is StationTarget {
	if (!value || typeof value !== 'object') return false;
	const target = value as Partial<StationTarget>;
	return (
		typeof target.discId === 'string' &&
		target.discId.length > 0 &&
		typeof target.placeId === 'string' &&
		target.placeId.length > 0 &&
		typeof target.index === 'number' &&
		Number.isInteger(target.index) &&
		target.index >= 0
	);
}

/**
 * 壳端站目标中继：先把地图章切上去（可见、尺寸量过），再把目标交回地图定位。
 * 非法／畸形／别的碟的目标一律 no-op（地图端已经验证过，壳只再验形状）。
 */
export function createStationTargetRelay(input: {
	active(): boolean;
	/** 切到地图章（必要时 handoff 一次）。 */
	seek(target: StationTarget): void;
	/** 地图可见之后把目标交回 traj。 */
	dispatch(target: StationTarget): void;
	schedule(work: () => void): void;
}): { offer(value: unknown): boolean } {
	return {
		offer(value) {
			if (!input.active() || !isStationTarget(value)) return false;
			input.seek(value);
			input.schedule(() => input.dispatch(value));
			return true;
		},
	};
}
