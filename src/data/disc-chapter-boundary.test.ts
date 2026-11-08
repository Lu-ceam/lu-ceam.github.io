import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
	AXIS_SLOP_PX,
	CONFIRM_NET_PX,
	createBoundaryState,
	EDGE_HOLD_PX,
	type BoundaryEffects,
	type BoundaryEvent,
	type BoundaryResult,
	type BoundaryState,
	type EdgeProbe,
	reduceBoundary,
	RETREAT_HOLD_PX,
	scrollEdgeDistance,
	scrollEdgeProbe,
	stationEdgeProbe,
	withinEdge,
	mapGestureEvents,
	mapSettledEvent,
	type TrapGestureDetail,
} from './disc-chapter-boundary.ts';

const BOTTOM: EdgeProbe = { dir: 1, distance: 0, metric: 'css-px' };
const TOP: EdgeProbe = { dir: -1, distance: 0, metric: 'css-px' };

function apply(state: BoundaryState, event: BoundaryEvent): BoundaryResult {
	return reduceBoundary(state, event);
}

function run(state: BoundaryState, events: BoundaryEvent[]): { state: BoundaryState; commits: number[]; effects: BoundaryEffects } {
	let current = state;
	const commits: number[] = [];
	let last: BoundaryEffects = { commit: 0, arm: state.armedDir, armChanged: false, prevent: false };
	for (const event of events) {
		const result = apply(current, event);
		current = result.state;
		if (result.effects.commit !== 0) commits.push(result.effects.commit);
		last = result.effects;
	}
	return { state: current, commits, effects: last };
}

/** 第一次到边那一下：begin → move 60（朝外）→ end，只停住并 arm。 */
function armedAt(edge: EdgeProbe): BoundaryState {
	const out = edge.dir;
	const from = 300;
	const to = from - 60 * out;
	const { state } = run(createBoundaryState({ chapterKey: 'story' }), [
		{ type: 'begin', gestureId: 1, touchId: 11, touchCount: 1, x: 0, y: from },
		{ type: 'move', gestureId: 1, x: 0, y: to, touchCount: 1, edge },
		{ type: 'end', gestureId: 1, x: 0, y: to, touchCount: 1, edge, neighbor: true },
	]);
	return state;
}

const armedAtBottom = (edge: EdgeProbe = BOTTOM): BoundaryState => armedAt(edge);

/** 已 arm 之后的一次新手势：给定 y 序列（从上到下的落点），返回 end 之后的提交。 */
function confirming(
	state: BoundaryState,
	ys: number[],
	edge: EdgeProbe = BOTTOM,
	options?: { neighbor?: boolean; scroll?: EdgeProbe[] },
): { state: BoundaryState; commits: number[]; effects: BoundaryEffects } {
	const start = ys[0] ?? 300;
	const events: BoundaryEvent[] = [
		{ type: 'begin', gestureId: 2, touchId: 12, touchCount: 1, x: 0, y: start },
	];
	for (let index = 1; index < ys.length; index += 1) {
		events.push({ type: 'move', gestureId: 2, x: 0, y: ys[index]!, touchCount: 1, edge });
	}
	for (const probe of options?.scroll ?? []) {
		events.push({ type: 'scroll', edge: probe, touching: true });
	}
	// end 落在最后一个落点（最后一个落点就是松手的位置）。
	events.push({
		type: 'end',
		gestureId: 2,
		x: 0,
		y: ys[ys.length - 1] ?? start,
		touchCount: 1,
		edge,
		neighbor: options?.neighbor ?? true,
	});
	return run(state, events);
}

describe('边界距离口径', () => {
	it('clamps scrollTop before measuring, then measures the distance to each end', () => {
		// 内容比框长：底端距离=max-scrollTop，顶端距离=scrollTop。
		assert.equal(scrollEdgeDistance({ scrollTop: 500, scrollHeight: 900, clientHeight: 400, dir: 1 }), 0);
		assert.equal(scrollEdgeDistance({ scrollTop: 497, scrollHeight: 900, clientHeight: 400, dir: 1 }), 3);
		assert.equal(scrollEdgeDistance({ scrollTop: 3, scrollHeight: 900, clientHeight: 400, dir: -1 }), 3);
		// 内容比框短：只有 0。
		assert.equal(scrollEdgeDistance({ scrollTop: 40, scrollHeight: 200, clientHeight: 400, dir: 1 }), 0);
		assert.equal(scrollEdgeDistance({ scrollTop: 40, scrollHeight: 200, clientHeight: 400, dir: -1 }), 0);
		// iOS 回弹越界：先 clamp，不产生负距离。
		assert.equal(scrollEdgeDistance({ scrollTop: 540, scrollHeight: 900, clientHeight: 400, dir: 1 }), 0);
		assert.equal(scrollEdgeDistance({ scrollTop: -30, scrollHeight: 900, clientHeight: 400, dir: -1 }), 0);
	});

	it('holds a CSS-px edge within 2px and a station edge only at the end station', () => {
		assert.equal(EDGE_HOLD_PX, 2);
		assert.equal(withinEdge({ dir: 1, distance: 2, metric: 'css-px' }), true);
		assert.equal(withinEdge({ dir: 1, distance: 2.5, metric: 'css-px' }), false);
		assert.equal(withinEdge(scrollEdgeProbe({ scrollTop: 497, scrollHeight: 900, clientHeight: 400, dir: 1 })), false);
		// 地图站号整站比较：没有像素容差。
		assert.equal(withinEdge(stationEdgeProbe({ dir: 1, canStep: false })), true);
		assert.equal(withinEdge(stationEdgeProbe({ dir: 1, canStep: true })), false);
	});
});

describe('停住—松手—再滑', () => {
	it('never commits inside the first arriving gesture, only arms on release', () => {
		const first = run(createBoundaryState({ chapterKey: 'story' }), [
			{ type: 'begin', gestureId: 1, touchId: 11, touchCount: 1, x: 0, y: 300 },
			{ type: 'move', gestureId: 1, x: 0, y: 250, touchCount: 1, edge: BOTTOM },
			{ type: 'move', gestureId: 1, x: 0, y: 180, touchCount: 1, edge: BOTTOM },
		]);
		assert.deepEqual(first.commits, []);
		assert.equal(first.state.armedDir, 0);
		// 边沿朝外：这一相位允许约束 overscroll。
		assert.equal(first.effects.prevent, true);
		const ended = apply(first.state, {
			type: 'end',
			gestureId: 1,
			x: 0,
			y: 180,
			touchCount: 1,
			edge: BOTTOM,
			neighbor: true,
		});
		assert.deepEqual(ended.effects.commit, 0);
		assert.equal(ended.effects.arm, 1);
		assert.equal(ended.effects.armChanged, true);
	});

	it('commits exactly once when the next new gesture passes 48px and releases', () => {
		const armed = armedAtBottom();
		assert.equal(armed.armedDir, 1);
		// 48px 的落点仍然不切（未松手）。
		const moved = apply(armed, { type: 'begin', gestureId: 2, touchId: 12, touchCount: 1, x: 0, y: 300 });
		assert.equal(moved.state.gesture?.startedArmed, true);
		assert.equal(moved.state.gesture?.confirmDir, 1);
		const at48 = apply(moved.state, { type: 'move', gestureId: 2, x: 0, y: 260, touchCount: 1, edge: BOTTOM });
		assert.deepEqual(at48.effects.commit, 0);
		assert.equal(at48.state.armedDir, 1);
		const ended = apply(at48.state, {
			type: 'end',
			gestureId: 2,
			x: 0,
			y: 252,
			touchCount: 1,
			edge: BOTTOM,
			neighbor: true,
		});
		assert.equal(ended.effects.commit, 1);
		assert.equal(ended.state.armedDir, 0);
		assert.equal(ended.state.busy, true);
		// 过渡结束：不继承 arm、不补切。
		const done = apply(ended.state, { type: 'transition-complete' });
		assert.equal(done.state.busy, false);
		assert.equal(done.state.armedDir, 0);
		assert.deepEqual(done.effects.commit, 0);
	});

	it('arms from a same-gesture arrival at the edge, never from the mount', () => {
		const { state } = run(createBoundaryState({ chapterKey: 'story' }), [
			{ type: 'begin', gestureId: 1, touchId: 3, touchCount: 1, x: 0, y: 700 },
			{ type: 'move', gestureId: 1, x: 0, y: 620, touchCount: 1, edge: null },
		]);
		// 章中间：不 arm，也没资格。
		assert.equal(state.armedDir, 0);
		const arrived = apply(state, { type: 'move', gestureId: 1, x: 0, y: 480, touchCount: 1, edge: BOTTOM });
		const ended = apply(arrived.state, {
			type: 'end',
			gestureId: 1,
			x: 0,
			y: 480,
			touchCount: 1,
			edge: BOTTOM,
			neighbor: true,
		});
		assert.deepEqual(ended.effects.commit, 0);
		assert.equal(ended.effects.arm, 1);
	});

	it('lets inertia only arm: the flick that reaches the edge after release never steps', () => {
		const nearing = run(createBoundaryState({ chapterKey: 'story' }), [
			{ type: 'begin', gestureId: 1, touchId: 4, touchCount: 1, x: 0, y: 600 },
			{ type: 'move', gestureId: 1, x: 0, y: 540, touchCount: 1, edge: { dir: 1, distance: 40, metric: 'css-px' } },
			{
				type: 'end',
				gestureId: 1,
				x: 0,
				y: 540,
				touchCount: 1,
				edge: { dir: 1, distance: 40, metric: 'css-px' },
				neighbor: true,
			},
		]);
		assert.deepEqual(nearing.commits, []);
		assert.equal(nearing.state.armedDir, 0);
		assert.deepEqual(nearing.state.pendingArrival, { dir: 1, gestureId: 1 });
		// 惯性尾巴（没有手指）滚到边：只 arm。
		const settled = apply(nearing.state, { type: 'scroll', edge: BOTTOM, touching: false });
		assert.deepEqual(settled.effects.commit, 0);
		assert.equal(settled.state.armedDir, 1);
		assert.equal(settled.state.pendingArrival, null);
	});

	it('drops the pending inertia arm when a finger lands before it settles', () => {
		const nearing = run(createBoundaryState({ chapterKey: 'story' }), [
			{ type: 'begin', gestureId: 1, touchId: 4, touchCount: 1, x: 0, y: 600 },
			{
				type: 'end',
				gestureId: 1,
				x: 0,
				y: 540,
				touchCount: 1,
				edge: { dir: 1, distance: 40, metric: 'css-px' },
				neighbor: true,
			},
		]);
		assert.deepEqual(nearing.state.pendingArrival, { dir: 1, gestureId: 1 });
		const touched = apply(nearing.state, {
			type: 'begin',
			gestureId: 2,
			touchId: 5,
			touchCount: 1,
			x: 0,
			y: 500,
		});
		assert.equal(touched.state.pendingArrival, null);
		assert.equal(touched.state.gesture?.startedArmed, false);
		// 旧到边事件不能给它 arm 资格。
		const late = apply(touched.state, { type: 'scroll', edge: BOTTOM, touching: true });
		assert.equal(late.state.armedDir, 0);
		assert.equal(late.state.gesture?.startedArmed, false);
	});
});

describe('指针回摆迟滞（peak 投影）', () => {
	it('commits after a 2px retreat, drops it after 7px', () => {
		const armed = armedAtBottom();
		// +60 → 58：累计回摆 2 ≤ 2，保留 arm，净 58 ≥ 48 → 切 1。
		assert.deepEqual(confirming(armed, [300, 240, 242]).commits, [1]);
		// +60 → 53：回摆 7 > 2，永久撤 arm → 切 0。
		const seven = confirming(armed, [300, 240, 247]);
		assert.deepEqual(seven.commits, []);
		assert.equal(seven.state.armedDir, 0);
	});

	it('never revives a revoked gesture even after it turns back outward', () => {
		assert.deepEqual(confirming(armedAtBottom(), [300, 240, 247, 210]).commits, []);
	});

	it('counts cumulative retreat instead of forgiving each small frame', () => {
		// +60 → +58 → +56：逐帧只回摆 2、2，累计 4 → 撤。
		assert.deepEqual(confirming(armedAtBottom(), [300, 240, 242, 244]).commits, []);
	});

	it('keeps the arm when only the net displacement falls short', () => {
		const short = confirming(armedAtBottom(), [300, 251, 253]);
		assert.deepEqual(short.commits, []);
		assert.equal(CONFIRM_NET_PX, 48);
		assert.equal(RETREAT_HOLD_PX, 2);
		// 净 47 < 48：停在边界可重试。
		assert.equal(short.state.armedDir, 1);
	});

	it('treats the upward confirmation symmetrically', () => {
		const armedTop = armedAtBottom(TOP);
		assert.equal(armedTop.armedDir, -1);
		// 下拉 60：y 变大；net = startY - y 为负，投影 -net。
		assert.deepEqual(confirming(armedTop, [100, 160, 158], TOP).commits, [-1]);
		// 反向回摆 7：y 往回收，投影从 peak 掉 7 > 2 → 撤。
		assert.deepEqual(confirming(armedTop, [100, 160, 153], TOP).commits, []);
	});

	it('applies the retreat test before the 6px axis slop', () => {
		const armed = armedAtBottom();
		// 只走 3px 反方向（还没到 slop，更没到 48）：回摆 3 > 2 立刻撤销。
		const small = confirming(armed, [300, 303]);
		assert.deepEqual(small.commits, []);
		assert.equal(small.state.armedDir, 0);
		assert.equal(AXIS_SLOP_PX, 6);
	});
});

describe('实际离边（scroll）是独立条件', () => {
	it('keeps the arm at 2px, revokes permanently at 3px, and never revives at the edge', () => {
		const armed = armedAtBottom();
		const began = apply(armed, { type: 'begin', gestureId: 2, touchId: 12, touchCount: 1, x: 0, y: 300 });
		const moved = apply(began.state, { type: 'move', gestureId: 2, x: 0, y: 240, touchCount: 1, edge: BOTTOM });
		const two = apply(moved.state, {
			type: 'scroll',
			edge: { dir: 1, distance: 2, metric: 'css-px' },
			touching: true,
		});
		assert.equal(two.state.gesture?.revoked, false);
		assert.equal(two.state.armedDir, 1);
		const three = apply(two.state, {
			type: 'scroll',
			edge: { dir: 1, distance: 3, metric: 'css-px' },
			touching: true,
		});
		assert.equal(three.state.gesture?.revoked, true);
		assert.equal(three.state.armedDir, 0);
		// 内容回到边、手指也转回正向：本 gid 不复活，end 不再 arm。
		const back = apply(three.state, { type: 'move', gestureId: 2, x: 0, y: 200, touchCount: 1, edge: BOTTOM });
		const ended = apply(back.state, {
			type: 'end',
			gestureId: 2,
			x: 0,
			y: 200,
			touchCount: 1,
			edge: BOTTOM,
			neighbor: true,
		});
		assert.deepEqual(ended.effects.commit, 0);
		assert.equal(ended.state.armedDir, 0);
	});

	it('clears a bare arm when the content scrolls away from the edge', () => {
		const armed = armedAtBottom();
		const away = apply(armed, { type: 'scroll', edge: { dir: 1, distance: 30, metric: 'css-px' }, touching: false });
		assert.equal(away.state.armedDir, 0);
	});

	it('does not arm or commit a horizontal gesture', () => {
		const { state, commits } = run(armedAtBottom(), [
			{ type: 'begin', gestureId: 2, touchId: 12, touchCount: 1, x: 0, y: 300 },
			{ type: 'move', gestureId: 2, x: 80, y: 296, touchCount: 1, edge: BOTTOM },
			{ type: 'move', gestureId: 2, x: 160, y: 240, touchCount: 1, edge: BOTTOM },
			{ type: 'end', gestureId: 2, x: 160, y: 240, touchCount: 1, edge: BOTTOM, neighbor: true },
		]);
		assert.deepEqual(commits, []);
		// 横向不改成章切，但 arm 仍是上一次到边留下来的（撤销只认两条 2px 条件）。
		assert.equal(state.armedDir, 1);
	});
});

describe('取消、多指、epoch 与过渡', () => {
	it('drops a cancelled gesture without arming from changedTouches', () => {
		const armed = armedAtBottom();
		const { state, commits } = run(armed, [
			{ type: 'begin', gestureId: 2, touchId: 12, touchCount: 1, x: 0, y: 300 },
			{ type: 'move', gestureId: 2, x: 0, y: 240, touchCount: 1, edge: BOTTOM },
			{ type: 'cancel', gestureId: 2 },
		]);
		assert.deepEqual(commits, []);
		assert.equal(state.armedDir, 0);
		assert.equal(state.gesture, null);
		assert.equal(state.blocked, true);
	});

	it('voids the gesture when a second finger lands, and does not restart on the leftover finger', () => {
		const { state } = run(armedAtBottom(), [
			{ type: 'begin', gestureId: 2, touchId: 12, touchCount: 1, x: 0, y: 300 },
			{ type: 'move', gestureId: 2, x: 0, y: 240, touchCount: 2, edge: BOTTOM },
		]);
		assert.equal(state.blocked, true);
		assert.equal(state.armedDir, 0);
		assert.equal(state.gesture, null);
	});

	it('clears arm, gesture and busy on epoch, and rejects stale map messages', () => {
		const armed = armedAtBottom();
		const bumped = apply(armed, { type: 'epoch', chapterKey: 'notes' });
		assert.equal(bumped.state.armedDir, 0);
		assert.equal(bumped.state.epoch, armed.epoch + 1);
		assert.equal(bumped.state.chapterKey, 'notes');
		// 旧 epoch 的 boundary-ready 不认。
		const stale = apply(bumped.state, { type: 'arm', dir: 1, afterGestureId: 1, epoch: armed.epoch });
		assert.equal(stale.state.armedDir, 0);
		const fresh = apply(bumped.state, {
			type: 'arm',
			dir: 1,
			afterGestureId: bumped.state.lastGestureId,
			epoch: bumped.state.epoch,
		});
		assert.equal(fresh.state.armedDir, 1);
	});

	it('does not queue a gesture started inside the transition', () => {
		const armed = armedAtBottom();
		const cut = confirming(armed, [300, 240]);
		assert.deepEqual(cut.commits, [1]);
		const during = apply(cut.state, { type: 'begin', gestureId: 3, touchId: 13, touchCount: 1, x: 0, y: 300 });
		assert.equal(during.state.gesture?.startedArmed, false);
		assert.equal(during.state.gesture?.dead, true);
		const done = apply(during.state, { type: 'transition-complete' });
		assert.deepEqual(done.effects.commit, 0);
		assert.equal(done.state.armedDir, 0);
	});
});

describe('地图端点与键盘', () => {
	it('never arms while the disc still has a station to step to', () => {
		const probe = stationEdgeProbe({ dir: 1, canStep: true });
		const { state, commits } = run(createBoundaryState({ chapterKey: 'map' }), [
			{ type: 'begin', gestureId: 1, touchId: 21, touchCount: 1, x: 0, y: 400 },
			{ type: 'move', gestureId: 1, x: 0, y: 320, touchCount: 1, edge: probe },
			{ type: 'end', gestureId: 1, x: 0, y: 320, touchCount: 1, edge: probe, neighbor: true },
		]);
		assert.deepEqual(commits, []);
		assert.equal(state.armedDir, 0);
	});

	it('consumes the station gesture and arms only after the real settle plus release', () => {
		const atEnd = stationEdgeProbe({ dir: 1, canStep: false });
		const stepped = run(createBoundaryState({ chapterKey: 'map' }), [
			{ type: 'begin', gestureId: 7, touchId: 22, touchCount: 1, x: 0, y: 400 },
			{ type: 'move', gestureId: 7, x: 0, y: 330, touchCount: 1, edge: stationEdgeProbe({ dir: 1, canStep: true }) },
			{ type: 'station-consumed', gestureId: 7 },
			// 站落稳之前又滑：同一个 gid 不得切章。
			{ type: 'move', gestureId: 7, x: 0, y: 300, touchCount: 1, edge: atEnd },
			{ type: 'end', gestureId: 7, x: 0, y: 300, touchCount: 1, edge: atEnd, neighbor: true },
		]);
		assert.deepEqual(stepped.commits, []);
		assert.equal(stepped.state.armedDir, 0);
		// 真实 stationSettled（飞行＋旁白）之后才 boundary-ready。
		const ready = apply(stepped.state, {
			type: 'arm',
			dir: 1,
			afterGestureId: 7,
			epoch: stepped.state.epoch,
		});
		assert.equal(ready.effects.arm, 1);
		const cut = confirming(ready.state, [300, 252], atEnd);
		assert.deepEqual(cut.commits, [1]);
	});

	it('ignores boundary-ready while a new finger is already down', () => {
		const atEnd = stationEdgeProbe({ dir: 1, canStep: false });
		const stepped = run(createBoundaryState({ chapterKey: 'map' }), [
			{ type: 'begin', gestureId: 7, touchId: 22, touchCount: 1, x: 0, y: 400 },
			{ type: 'station-consumed', gestureId: 7 },
			{ type: 'end', gestureId: 7, x: 0, y: 300, touchCount: 1, edge: atEnd, neighbor: true },
		]);
		const early = apply(stepped.state, { type: 'begin', gestureId: 8, touchId: 23, touchCount: 1, x: 0, y: 300 });
		assert.equal(early.state.gesture?.startedArmed, false);
		const late = apply(early.state, { type: 'arm', dir: 1, afterGestureId: 7, epoch: stepped.state.epoch });
		assert.equal(late.state.armedDir, 0);
		assert.equal(late.state.gesture?.startedArmed, false);
	});

	it('treats each keydown as a full press: first arms, second crosses', () => {
		let state = createBoundaryState({ chapterKey: 'story' });
		const first = apply(state, { type: 'key', dir: 1, edge: BOTTOM, neighbor: true });
		assert.deepEqual(first.effects.commit, 0);
		assert.equal(first.state.armedDir, 1);
		const second = apply(first.state, { type: 'key', dir: 1, edge: BOTTOM, neighbor: true });
		assert.equal(second.effects.commit, 1);
		assert.equal(second.state.armedDir, 0);
	});

	it('never crosses at a boundary with no neighbouring chapter', () => {
		const state = armedAtBottom();
		const cut = confirming(state, [300, 240], BOTTOM, { neighbor: false });
		assert.deepEqual(cut.commits, []);
		const key = apply(state, { type: 'key', dir: 1, edge: BOTTOM, neighbor: false });
		assert.deepEqual(key.effects.commit, 0);
	});
});

describe('地图桥消息（站动作 / 站落稳 / 消息身份）', () => {
	const hasNeighbor = () => true;
	const atEnd = stationEdgeProbe({ dir: 1, canStep: false });
	const canStep = stationEdgeProbe({ dir: 1, canStep: true });

	const gesture = (detail: Partial<TrapGestureDetail> & Pick<TrapGestureDetail, 'phase'>): TrapGestureDetail => ({
		gestureId: 7,
		touchId: 21,
		touchCount: 1,
		x: 0,
		y: 400,
		probe: null,
		station: false,
		blocked: false,
		...detail,
	});

	function push(state: BoundaryState, events: BoundaryEvent[]): { state: BoundaryState; commits: number[] } {
		let current = state;
		const commits: number[] = [];
		for (const event of events) {
			const result = reduceBoundary(current, event);
			current = result.state;
			if (result.effects.commit !== 0) commits.push(result.effects.commit);
		}
		return { state: current, commits };
	}

	it('turns a station step into a consumed gid, never a chapter commit', () => {
		const stepped = push(createBoundaryState({ chapterKey: 'map' }), [
			...mapGestureEvents(gesture({ phase: 'begin' }), hasNeighbor),
			...mapGestureEvents(gesture({ phase: 'move', probe: canStep }), hasNeighbor),
			// 到末站：bare end 即使落在端点，也只因被站动作吃掉而不 arm。
			...mapGestureEvents(
				gesture({ phase: 'end', probe: atEnd, station: true }),
				hasNeighbor,
			),
		]);
		assert.deepEqual(stepped.commits, []);
		assert.equal(stepped.state.armedDir, 0);
		assert.equal(stepped.state.gesture, null);
	});

	it('arms only on the real settled message after that gesture ended', () => {
		let state = push(createBoundaryState({ chapterKey: 'map' }), [
			...mapGestureEvents(gesture({ phase: 'begin' }), hasNeighbor),
			...mapGestureEvents(gesture({ phase: 'end', probe: atEnd, station: true }), hasNeighbor),
		]).state;
		// 站未落稳就先来 arm（飞行／旁白没完）：这是一条不该出现的消息 → 仍会 arm；
		// 因此这里改为先验证「落稳消息带的是原 gid + 当前 epoch」才被接受。
		const settledEpoch = state.epoch;
		state = reduceBoundary(
			state,
			mapSettledEvent({ gestureId: 7, dir: 1, epoch: settledEpoch }),
		).state;
		assert.equal(state.armedDir, 1);
		// 下一次新手指 48px + end：只切一章。
		const cut = push(state, [
			...mapGestureEvents(gesture({ phase: 'begin', gestureId: 8, y: 300 }), hasNeighbor),
			...mapGestureEvents(
				gesture({ phase: 'move', gestureId: 8, y: 250, probe: atEnd }),
				hasNeighbor,
			),
			...mapGestureEvents(
				gesture({ phase: 'end', gestureId: 8, y: 250, probe: atEnd }),
				hasNeighbor,
			),
		]);
		assert.deepEqual(cut.commits, [1]);
	});

	it('rejects a settled message from another gesture or an older epoch', () => {
		const stepped = push(createBoundaryState({ chapterKey: 'map' }), [
			...mapGestureEvents(gesture({ phase: 'begin' }), hasNeighbor),
			...mapGestureEvents(gesture({ phase: 'end', probe: atEnd }), hasNeighbor),
		]).state;
		const otherGid = reduceBoundary(stepped, mapSettledEvent({ gestureId: 6, dir: 1, epoch: stepped.epoch })).state;
		assert.equal(otherGid.armedDir, 0);
		const staleEpoch = reduceBoundary(
			stepped,
			mapSettledEvent({ gestureId: 7, dir: 1, epoch: stepped.epoch - 1 }),
		).state;
		assert.equal(staleEpoch.armedDir, 0);
	});

	it('never grants startedArmed when a finger lands before the station settles', () => {
		const stepped = push(createBoundaryState({ chapterKey: 'map' }), [
			...mapGestureEvents(gesture({ phase: 'begin' }), hasNeighbor),
			...mapGestureEvents(gesture({ phase: 'end', probe: atEnd, station: true }), hasNeighbor),
		]).state;
		const early = push(stepped, [
			...mapGestureEvents(gesture({ phase: 'begin', gestureId: 9, y: 300 }), hasNeighbor),
		]).state;
		assert.equal(early.gesture?.startedArmed, false);
		// 落稳消息来得比手指还晚：不排队、不加资格。
		const late = reduceBoundary(early, mapSettledEvent({ gestureId: 7, dir: 1, epoch: early.epoch })).state;
		assert.equal(late.armedDir, 0);
		assert.equal(late.gesture?.startedArmed, false);
	});

	it('needs an outward stop plus release before a direct end-station pick can cross', () => {
		// 直接点末站／hash 末站／自动播到末站：没有到边手势，所以第一次只 arm。
		const first = push(createBoundaryState({ chapterKey: 'map' }), [
			...mapGestureEvents(gesture({ phase: 'begin', gestureId: 3, y: 400 }), hasNeighbor),
			...mapGestureEvents(gesture({ phase: 'move', gestureId: 3, y: 330, probe: atEnd }), hasNeighbor),
			...mapGestureEvents(gesture({ phase: 'end', gestureId: 3, y: 330, probe: atEnd }), hasNeighbor),
		]);
		assert.deepEqual(first.commits, []);
		assert.equal(first.state.armedDir, 1);
		const second = push(first.state, [
			...mapGestureEvents(gesture({ phase: 'begin', gestureId: 4, y: 400 }), hasNeighbor),
			...mapGestureEvents(gesture({ phase: 'move', gestureId: 4, y: 340, probe: atEnd }), hasNeighbor),
			...mapGestureEvents(gesture({ phase: 'end', gestureId: 4, y: 340, probe: atEnd }), hasNeighbor),
		]);
		assert.deepEqual(second.commits, [1]);
	});

	it('keeps explore free: no endpoint probe, so no arm and no cross', () => {
		const explore = push(createBoundaryState({ chapterKey: 'map' }), [
			...mapGestureEvents(gesture({ phase: 'begin' }), hasNeighbor),
			...mapGestureEvents(gesture({ phase: 'move', probe: null }), hasNeighbor),
			...mapGestureEvents(gesture({ phase: 'end', probe: null }), hasNeighbor),
		]);
		assert.deepEqual(explore.commits, []);
		assert.equal(explore.state.armedDir, 0);
	});

	it('treats a cancelled map gesture as void, never arming from it', () => {
		const cancelled = push(createBoundaryState({ chapterKey: 'map' }), [
			...mapGestureEvents(gesture({ phase: 'begin' }), hasNeighbor),
			...mapGestureEvents(gesture({ phase: 'move', probe: atEnd }), hasNeighbor),
			...mapGestureEvents(gesture({ phase: 'cancel' }), hasNeighbor),
		]);
		assert.deepEqual(cancelled.commits, []);
		assert.equal(cancelled.state.armedDir, 0);
		assert.equal(cancelled.state.gesture, null);
	});
});
