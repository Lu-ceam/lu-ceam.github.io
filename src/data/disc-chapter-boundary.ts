/**
 * 手机章节的边界状态机：停住—松手—再滑。
 *
 * 纯函数：不碰 DOM、不读时钟、不写 `scrollTop`。原生滚动、地图站步、
 * 过渡绘制都由 adapter 负责；这里只管「这一次手势有没有跨章资格」：
 *
 * - 第一次到边（本次 touch 内或松手后的惯性到边）只停住，松手才 arm；
 * - 新的一次单指 touchstart 才冻结 `startedArmed`，同一次 touch 里看到边再改主意不算；
 * - 净同向投影 ≥48px 且真松手才提交一次；
 * - 两条独立的撤销条件（指针从 peak 回摆 >2px、实际离边 >2px）任一成立就**永久**撤销本 gesture；
 * - arm 与「章＋epoch＋方向」绑定，绝不带进邻章。
 */

import type { ChapterKey } from './disc-chapters.ts';

/** 进入边界：第一次到边只认 ≤1px（入口 epsilon）。 */
export const ENTER_EDGE_PX = 1;
/** 已 arm／confirming 时保留到实际离边 ≤2px；>2px 才撤。 */
export const EDGE_HOLD_PX = 2;
export const CONFIRM_NET_PX = 48;
export const AXIS_SLOP_PX = 6;
export const AXIS_RATIO = 1.25;
export const RETREAT_HOLD_PX = 2;

export type BoundaryDir = 1 | -1;
/** 边界距离的判定口径：正文按 CSS px 留 2px 迟滞，地图站号整站比较、不套像素容差。 */
export type EdgeMetric = 'css-px' | 'station';
export type EdgeProbe = { dir: BoundaryDir; distance: number; metric: EdgeMetric };

/** 已 arm／confirming 的保留口径：实际离边 ≤2px（地图站号整站比较）。 */
export function withinEdge(probe: EdgeProbe | null | undefined): boolean {
	if (!probe) return false;
	if (!Number.isFinite(probe.distance)) return false;
	return probe.metric === 'station' ? probe.distance <= 0 : probe.distance <= EDGE_HOLD_PX;
}

/**
 * 进入边界的口径：第一次到边只认 ≤1px。离边 1.5px 不是「已经在端点」，
 * 不能据此把一次向外结束当成到边。已 arm 之后才用 `withinEdge` 的 2px 保留。
 */
export function enterEdge(probe: EdgeProbe | null | undefined): boolean {
	if (!probe) return false;
	if (!Number.isFinite(probe.distance)) return false;
	return probe.metric === 'station' ? probe.distance <= 0 : probe.distance <= ENTER_EDGE_PX;
}

/**
 * 章内滚动的实际边界距离：先把 `scrollTop` clamp 到 `[0,max]`
 * （Safari 回弹时 `scrollTop` 会越界，不能当成「离边 -12px」）；
 * 再看离 `dir` 那一头的距离。底端＝`max-scrollTop`，顶端＝`scrollTop`。
 */
export function scrollEdgeDistance(input: {
	scrollTop: number;
	scrollHeight: number;
	clientHeight: number;
	dir: BoundaryDir;
}): number {
	const max = Math.max(0, input.scrollHeight - input.clientHeight);
	const top = Math.min(Math.max(input.scrollTop, 0), max);
	const distance = input.dir > 0 ? max - top : top;
	return Number.isFinite(distance) ? distance : Number.POSITIVE_INFINITY;
}

export function scrollEdgeProbe(input: {
	scrollTop: number;
	scrollHeight: number;
	clientHeight: number;
	dir: BoundaryDir;
}): EdgeProbe {
	return { dir: input.dir, distance: scrollEdgeDistance(input), metric: 'css-px' };
}

/** 地图站号：0 = 还在端站（没有下一站），1 = 还能再换一站。整站比较。 */
export function stationEdgeProbe(input: { dir: BoundaryDir; canStep: boolean }): EdgeProbe {
	return { dir: input.dir, distance: input.canStep ? 1 : 0, metric: 'station' };
}

export type BoundaryAxis = 'pending' | 'vertical' | 'other';

export type BoundaryGesture = {
	id: number;
	touchId: number;
	startX: number;
	startY: number;
	x: number;
	y: number;
	/** `startY - y`：上推为正（＝往下读）。 */
	net: number;
	/** 新的一次 touchstart 由 arm 冻结的确认方向；0 = 本次没有跨章资格。 */
	confirmDir: 0 | BoundaryDir;
	startedArmed: boolean;
	/** `confirmDir * net`。 */
	projection: number;
	/** 累计 peak 投影（至少 0）。 */
	peak: number;
	axis: BoundaryAxis;
	/** 本次 touch 内到边、朝外的方向；0 = 没到边。 */
	arriving: 0 | BoundaryDir;
	/** 这一 gid 已经被地图站动作消费：绝不发跨章提交。 */
	stationConsumed: boolean;
	/** 已永久撤销本 gesture 的确认资格。 */
	revoked: boolean;
	/** 过渡中／取消后：不 arm、不提交。 */
	dead: boolean;
};

export type BoundaryState = {
	chapterKey: ChapterKey | null;
	epoch: number;
	/** 一次切章的绘制事务在跑：新触摸不排队、不自动补切。 */
	busy: boolean;
	/** 多指／取消之后，全部松手之前不再重启单指。 */
	blocked: boolean;
	armedDir: 0 | BoundaryDir;
	armedEpoch: number;
	lastGestureId: number;
	/** 松手后才到边的惯性：等这一次滚动到边、且无手指时再 arm。 */
	pendingArrival: { dir: BoundaryDir; gestureId: number } | null;
	gesture: BoundaryGesture | null;
};

export function createBoundaryState(input?: {
	chapterKey?: ChapterKey | null;
	epoch?: number;
}): BoundaryState {
	return {
		chapterKey: input?.chapterKey ?? null,
		epoch: input?.epoch ?? 0,
		busy: false,
		blocked: false,
		armedDir: 0,
		armedEpoch: 0,
		lastGestureId: 0,
		pendingArrival: null,
		gesture: null,
	};
}

export type BoundaryBeginEvent = {
	type: 'begin';
	gestureId: number;
	touchId: number;
	touchCount: number;
	x: number;
	y: number;
};
export type BoundaryMoveEvent = {
	type: 'move';
	gestureId: number;
	x: number;
	y: number;
	touchCount: number;
	edge: EdgeProbe | null;
};
export type BoundaryEndEvent = {
	type: 'end';
	gestureId: number;
	x: number;
	y: number;
	touchCount: number;
	edge: EdgeProbe | null;
	/** 该方向是否真有邻章：没有就只 arm 不提交。 */
	neighbor: boolean;
};
export type BoundaryCancelEvent = { type: 'cancel'; gestureId?: number };
export type BoundaryScrollEvent = {
	type: 'scroll';
	edge: EdgeProbe | null;
	/** 手指还在屏上：惯性 arm 只认「无手指」。 */
	touching: boolean;
};
export type BoundaryStationEvent = { type: 'station-consumed'; gestureId: number };
export type BoundaryArmEvent = {
	type: 'arm';
	dir: BoundaryDir;
	/** 地图桥：只有发起它的那一次手势还能是「刚结束的那一次」。 */
	afterGestureId?: number;
	epoch?: number;
};
export type BoundaryKeyEvent = {
	type: 'key';
	dir: BoundaryDir;
	edge: EdgeProbe | null;
	neighbor: boolean;
};
/**
 * 地图章介绍带的内滚：字还没滚完（`'content'`）时清掉旧 arm——一次没换站的手势
 * 不能借后来那串滚动把 arm 留下来；真的到边（`'edge'`）就只是观察，arm 不动。
 */
export type BoundaryBlurbEvent = { type: 'blurb-scroll'; edge: 'content' | 'edge' };
export type BoundaryEpochEvent = { type: 'epoch'; chapterKey?: ChapterKey | null };
export type BoundaryTransitionEvent = { type: 'transition-start' | 'transition-complete' };

export type BoundaryEvent =
	| BoundaryBeginEvent
	| BoundaryMoveEvent
	| BoundaryEndEvent
	| BoundaryCancelEvent
	| BoundaryScrollEvent
	| BoundaryStationEvent
	| BoundaryArmEvent
	| BoundaryKeyEvent
	| BoundaryBlurbEvent
	| BoundaryEpochEvent
	| BoundaryTransitionEvent;

/** 地图桥的消息形状（traj → 壳）：一次手势、站落稳、已验证站目标。 */
export type TrapGestureDetail = {
	phase: 'begin' | 'move' | 'end' | 'cancel';
	gestureId: number;
	touchId: number;
	touchCount: number;
	x: number;
	y: number;
	probe: EdgeProbe | null;
	/** 这一 gid 已经被地图的站动作吃掉：绝不发跨章提交。 */
	station: boolean;
};
export type TrapSettledDetail = { gestureId: number; dir: BoundaryDir; epoch: number };

/**
 * 地图桥消息 → 边界事件。换站与跨章是两件事：被站动作吃掉的 gid 只记
 * `station-consumed`，跨章资格仍只由真实 `stationSettled` 的 arm 给。
 */
export function mapGestureEvents(
	detail: TrapGestureDetail,
	neighbor: (dir: BoundaryDir) => boolean,
): BoundaryEvent[] {
	if (detail.phase === 'begin') {
		return [
			{
				type: 'begin',
				gestureId: detail.gestureId,
				touchId: detail.touchId,
				touchCount: detail.touchCount,
				x: detail.x,
				y: detail.y,
			},
		];
	}
	if (detail.phase === 'cancel') return [{ type: 'cancel', gestureId: detail.gestureId }];
	const events: BoundaryEvent[] = [];
	if (detail.station) events.push({ type: 'station-consumed', gestureId: detail.gestureId });
	if (detail.phase === 'move') {
		events.push({
			type: 'move',
			gestureId: detail.gestureId,
			x: detail.x,
			y: detail.y,
			touchCount: detail.touchCount,
			edge: detail.probe,
		});
		return events;
	}
	// 地图站号是整数比较：probe 只认 traj 报的站端点，壳不自己推方向。
	const dir: BoundaryDir = detail.probe?.dir ?? 1;
	events.push({
		type: 'end',
		gestureId: detail.gestureId,
		x: detail.x,
		y: detail.y,
		touchCount: detail.touchCount,
		edge: detail.probe,
		neighbor: neighbor(dir),
	});
	return events;
}

/** 站真落稳（飞行＋旁白）＋原手势已结束：这才是一条 arm 消息。 */
export function mapSettledEvent(detail: TrapSettledDetail): BoundaryEvent {
	return { type: 'arm', dir: detail.dir, afterGestureId: detail.gestureId, epoch: detail.epoch };
}

export type BoundaryEffects = {
	/** 本次 reduce 提交的切章方向（0 = 不切，一次 reduce 至多一个）。 */
	commit: 0 | BoundaryDir;
	/** reduce 之后的 arm。 */
	arm: 0 | BoundaryDir;
	armChanged: boolean;
	/** 处于「已到边且朝外」的相位：adapter 只在这里约束 overscroll。 */
	prevent: boolean;
};

export type BoundaryResult = { state: BoundaryState; effects: BoundaryEffects };

const sign = (value: number): 0 | BoundaryDir => (value > 0 ? 1 : value < 0 ? -1 : 0);

export function reduceBoundary(state: BoundaryState, event: BoundaryEvent): BoundaryResult {
	let next = state;
	const effects: BoundaryEffects = { commit: 0, arm: state.armedDir, armChanged: false, prevent: false };

	const setArm = (dir: 0 | BoundaryDir): void => {
		if (next.armedDir === dir) return;
		effects.armChanged = true;
		next = { ...next, armedDir: dir, armedEpoch: dir === 0 ? 0 : next.epoch };
	};
	const setGesture = (gesture: BoundaryGesture | null): void => {
		next = { ...next, gesture };
	};

	switch (event.type) {
		case 'begin': {
			if (event.touchCount > 1) {
				// 多指加入／多指开始：本次作废、清 arm，全部松手前不重启单指。
				setArm(0);
				setGesture(null);
				next = { ...next, blocked: true, busy: next.busy, pendingArrival: null, lastGestureId: event.gestureId };
				break;
			}
			const dead = next.busy;
			const startedArmed = !dead && next.armedDir !== 0 && next.armedEpoch === next.epoch;
			const gesture: BoundaryGesture = {
				id: event.gestureId,
				touchId: event.touchId,
				startX: event.x,
				startY: event.y,
				x: event.x,
				y: event.y,
				net: 0,
				confirmDir: startedArmed ? next.armedDir : 0,
				startedArmed,
				projection: 0,
				peak: 0,
				axis: 'pending',
				arriving: 0,
				stationConsumed: false,
				revoked: dead,
				dead,
			};
			setGesture(gesture);
			// 新手指打断尚未稳定的旧动量：旧到边事件不能再送 arm。
			next = { ...next, blocked: false, pendingArrival: null };
			break;
		}
		case 'move': {
			const gesture = next.gesture;
			if (!gesture || gesture.id !== event.gestureId) break;
			if (event.touchCount > 1) {
				setArm(0);
				setGesture(null);
				next = { ...next, blocked: true, pendingArrival: null, lastGestureId: gesture.id };
				break;
			}
			if (gesture.dead) break;
			const updated = advanceGesture(gesture, event.x, event.y);
			let revoked = updated.revoked;
			if (!revoked && edgeLeaves(updated, event.edge)) {
				// 实际内容离原边 >2px：立即实质反向，本 gid 永久撤销。
				revoked = true;
			}
			const nextGesture: BoundaryGesture = {
				...updated,
				revoked,
				arriving: revoked ? 0 : updated.arriving || arrivingFor(updated, event.edge),
			};
			setGesture(nextGesture);
			if (revoked) setArm(0);
			effects.prevent =
				!revoked &&
				nextGesture.axis === 'vertical' &&
				withinEdge(event.edge) &&
				sign(nextGesture.net) === event.edge?.dir;
			break;
		}
		case 'end': {
			const gesture = next.gesture;
			if (!gesture || gesture.id !== event.gestureId) break;
			if (event.touchCount > 1) {
				setArm(0);
				setGesture(null);
				next = { ...next, blocked: true, pendingArrival: null, lastGestureId: gesture.id };
				break;
			}
			const advanced = advanceGesture(gesture, event.x, event.y);
			const revoked = advanced.revoked || edgeLeaves(advanced, event.edge);
			const updated: BoundaryGesture = {
				...advanced,
				revoked,
				arriving: revoked ? 0 : advanced.arriving || arrivingFor(advanced, event.edge),
			};
			// 已确认资格的手势按保留口径（≤2px）收；第一次到边按入口口径（≤1px）收。
			const holds = updated.startedArmed
				? withinEdge(event.edge) && event.edge?.dir === updated.confirmDir
				: enterEdge(event.edge) && event.edge?.dir === updated.arriving;
			next = { ...next, lastGestureId: gesture.id };
			if (!updated.dead && !revoked && updated.startedArmed) {
				if (
					updated.confirmDir !== 0 &&
					updated.axis === 'vertical' &&
					updated.projection >= CONFIRM_NET_PX &&
					holds &&
					event.neighbor &&
					!updated.stationConsumed
				) {
					effects.commit = updated.confirmDir;
					effects.prevent = true;
					setArm(0);
					setGesture(null);
					next = { ...next, busy: true, pendingArrival: null };
					break;
				}
				// 门槛不到／还在同一章：保持在边界可重试。
				setGesture(null);
				if (!revoked) setArm(updated.confirmDir);
				else setArm(0);
				next = { ...next, pendingArrival: null };
				break;
			}
			setGesture(null);
			if (updated.dead || revoked) {
				setArm(0);
				next = { ...next, pendingArrival: null };
				break;
			}
			if (updated.stationConsumed) {
				// 这一 gid 已经换过站：到站资格只由真实 stationSettled 的 boundary-ready 给。
				next = { ...next, pendingArrival: null };
				break;
			}
			// 朝外读：本次 touch 内已经到边（`arriving`），或者松手时还在往边去的路上。
			const outward =
				updated.arriving !== 0
					? updated.arriving
					: updated.axis === 'vertical'
						? sign(updated.net)
						: 0;
			if (outward !== 0 && holds) {
				// 松开时还在边界：这一次只 arm，不切。
				setArm(outward);
				next = { ...next, pendingArrival: null };
				break;
			}
			if (outward !== 0) {
				// 松手时惯性还没到边：等这一次滚动真到边且无手指后再 arm。
				next = { ...next, pendingArrival: { dir: outward, gestureId: updated.id } };
				break;
			}
			next = { ...next, pendingArrival: null };
			break;
		}
		case 'cancel': {
			if (event.gestureId !== undefined && next.gesture && next.gesture.id !== event.gestureId) break;
			const id = next.gesture?.id ?? next.lastGestureId;
			setGesture(null);
			setArm(0);
			next = { ...next, blocked: true, pendingArrival: null, lastGestureId: id };
			break;
		}
		case 'scroll': {
			if (next.busy) break;
			const gesture = next.gesture;
			if (gesture) {
				if (gesture.dead) break;
				if (edgeLeaves(gesture, event.edge)) {
					if (!gesture.revoked) setGesture({ ...gesture, revoked: true, arriving: 0 });
					setArm(0);
					break;
				}
				const arriving = arrivingFor(gesture, event.edge);
				if (arriving !== gesture.arriving) setGesture({ ...gesture, arriving });
				break;
			}
			const pending = next.pendingArrival;
			if (pending) {
				const holds = enterEdge(event.edge) && event.edge?.dir === pending.dir;
				if (holds && !event.touching) {
					setArm(pending.dir);
					next = { ...next, pendingArrival: null };
					break;
				}
				if (event.edge && event.edge.dir === pending.dir && !withinEdge(event.edge)) break;
				if (!event.touching) next = { ...next, pendingArrival: null };
				break;
			}
			// 没有手指也没有待到的惯性：内容真的离开了边界就撤 arm。
			if (next.armedDir !== 0 && !withinEdge(event.edge) && !event.touching) setArm(0);
			break;
		}
		case 'station-consumed': {
			if (next.gesture && next.gesture.id === event.gestureId) {
				setGesture({ ...next.gesture, stationConsumed: true });
			}
			break;
		}
		case 'arm': {
			if (next.busy) break;
			// 取消／多指之后的 gid 已作废：全部松手并重新开一次有效手势之前，
			// 迟到的落稳消息不能再把 arm 从 0 拉回 1。
			if (next.blocked) break;
			if (event.epoch !== undefined && event.epoch !== next.epoch) break;
			// 手指还在屏上（站没落稳就开新手势）：整次不具 startedArmed，也不排队。
			if (next.gesture) break;
			if (event.afterGestureId !== undefined && event.afterGestureId !== next.lastGestureId) break;
			setArm(event.dir);
			next = { ...next, pendingArrival: null };
			break;
		}
		case 'key': {
			if (next.busy) break;
			// 又一次同向按键：保留口径（≤2px）；第一次按键要真的到边（≤1px）。
			const armed = next.armedDir === event.dir && next.armedEpoch === next.epoch;
			if (!(armed ? withinEdge(event.edge) : enterEdge(event.edge)) || event.edge?.dir !== event.dir) break;
			if (!event.neighbor) {
				setArm(event.dir);
				break;
			}
			if (next.armedDir === event.dir && next.armedEpoch === next.epoch) {
				effects.commit = event.dir;
				effects.prevent = true;
				setArm(0);
				setGesture(null);
				next = { ...next, busy: true, pendingArrival: null };
				break;
			}
			setArm(event.dir);
			break;
		}
		case 'blurb-scroll': {
			if (next.busy) break;
			// 还在滚字：本次到边的惯性不能替手指 arm，旧 arm 也不留。
			if (event.edge === 'content') {
				next = { ...next, pendingArrival: null };
				setArm(0);
			}
			break;
		}
		case 'epoch': {
			next = {
				...createBoundaryState({
					chapterKey: event.chapterKey === undefined ? next.chapterKey : event.chapterKey,
					epoch: next.epoch + 1,
				}),
			};
			effects.armChanged = state.armedDir !== 0;
			break;
		}
		case 'transition-start': {
			next = { ...next, busy: true };
			break;
		}
		case 'transition-complete': {
			// 过渡结束不补切、不继承 arm：进目标章 READING。
			next = { ...next, busy: false, gesture: null, pendingArrival: null };
			break;
		}
	}

	effects.arm = next.armedDir;
	return { state: next, effects };
}

/** 累计投影、peak、回摆迟滞与轴向判定；回摆判断在轴向 slop **之前**。 */
function advanceGesture(gesture: BoundaryGesture, x: number, y: number): BoundaryGesture {
	const net = gesture.startY - y;
	let projection = gesture.projection;
	let peak = gesture.peak;
	let revoked = gesture.revoked;
	if (gesture.confirmDir !== 0) {
		projection = gesture.confirmDir * net;
		peak = Math.max(0, gesture.peak, projection);
		if (peak - projection > RETREAT_HOLD_PX) revoked = true;
	}
	let axis = gesture.axis;
	if (axis === 'pending') {
		const dx = gesture.startX - x;
		const dy = net;
		if (Math.abs(dy) >= AXIS_RATIO * Math.abs(dx) && Math.abs(dy) >= AXIS_SLOP_PX) axis = 'vertical';
		else if (Math.abs(dx) >= AXIS_SLOP_PX) axis = 'other';
	}
	return { ...gesture, x, y, net, projection, peak, axis, revoked };
}

/**
 * 本次 touch 是否已经在边界朝外：只有「还没 arm 的手势」才靠它 arm。
 * 横向已判定（`other`）的手势不改造成章切。
 */
function arrivingFor(gesture: BoundaryGesture, edge: EdgeProbe | null): 0 | BoundaryDir {
	if (gesture.confirmDir !== 0 || gesture.revoked || gesture.axis === 'other') return 0;
	if (!enterEdge(edge) || !edge) return 0;
	return sign(gesture.net) === edge.dir ? edge.dir : 0;
}

/** 实际内容是否已经离开原边 >2px（与指针回摆是两条独立的条件）。 */
function edgeLeaves(gesture: BoundaryGesture, edge: EdgeProbe | null): boolean {
	const dir = gesture.confirmDir || gesture.arriving;
	if (dir === 0) return false;
	if (!edge) return false;
	if (edge.dir !== dir) return true;
	return !withinEdge(edge);
}
