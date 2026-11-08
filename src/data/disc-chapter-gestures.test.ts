/**
 * 生产 event adapter 的回归：这里驱动的不是手写替身，而是
 * `disc-chapter-gestures.ts` 里**阅读器 / 地图真正注册的那几个 adapter**。
 * 几何、TouchEvent、异步站落稳都是显式合成（synthetic），不是浏览器证据。
 */
import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import {
	createBoundaryState,
	type BoundaryState,
	type EdgeProbe,
	mapGestureEvents,
	mapSettledEvent,
	reduceBoundary,
	type TrapSettledDetail,
} from './disc-chapter-boundary.ts';
import {
	createChapterKeyAdapter,
	createChapterTouchAdapter,
	createStationBridge,
	createStationTargetRelay,
	isStationTarget,
	ownsEditableKeys,
	ownsInteractiveGesture,
	stationTargetIndex,
	type StationTarget,
	type TouchEventLike,
	type TouchPoint,
} from './disc-chapter-gestures.ts';

const PLAIN = { closest: () => null };

function touch(identifier: number, clientX: number, clientY: number): TouchPoint {
	return { identifier, clientX, clientY };
}

function touchEvent(
	target: unknown,
	touches: TouchPoint[],
	changed: TouchPoint[],
): TouchEventLike {
	return { target, touches, changedTouches: changed, cancelable: true };
}

type ShellLog = {
	boundary: BoundaryState;
	commits: number[];
	prevents: number;
};

/** 壳章的长滚 adapter：边界距离由测试控制，其余全是生产函数。 */
function shellHarness(options?: { distance?: () => number; edgeDir?: 1 | -1 }) {
	const edgeDir = options?.edgeDir ?? 1;
	const distance = options?.distance ?? (() => 0);
	const log: ShellLog = { boundary: createBoundaryState({ chapterKey: 'story' }), commits: [], prevents: 0 };
	const adapter = createChapterTouchAdapter({
		owns: () => true,
		probe: (dir): EdgeProbe => ({ dir, distance: distance(), metric: 'css-px' }),
		neighbor: () => true,
		gesture: () => log.boundary.gesture,
		apply: (event) => {
			const result = reduceBoundary(log.boundary, event);
			log.boundary = result.state;
			if (result.effects.commit !== 0) log.commits.push(result.effects.commit);
			if (result.effects.prevent) log.prevents += 1;
			return result.effects;
		},
	});
	return { adapter, log, edgeDir };
}

/** 一次完整的「到边—松手」停在边界。 */
function arriveAtEdge(harness: ReturnType<typeof shellHarness>): void {
	const { adapter } = harness;
	adapter.start(touchEvent(PLAIN, [touch(1, 10, 400)], [touch(1, 10, 400)]));
	adapter.move(touchEvent(PLAIN, [touch(1, 10, 320)], []));
	adapter.end(touchEvent(PLAIN, [], [touch(1, 10, 320)]));
}

describe('壳章 touch adapter：控件／选择优先，原生滚动不被劫持', () => {
	it('lets links, buttons, fields, summary and editable nodes own the gesture', () => {
		for (const selector of ['a', 'button', 'input', 'textarea', 'summary', '[contenteditable]']) {
			const target = { closest: (query: string) => (query.includes(selector) ? {} : null) };
			assert.equal(ownsInteractiveGesture(target), true, selector);
		}
		assert.equal(ownsInteractiveGesture(PLAIN), false);
		assert.equal(ownsInteractiveGesture(null), false);
		assert.equal(ownsEditableKeys({ closest: () => null, isContentEditable: true }), true);
	});

	it('never starts a boundary gesture on a control, so it cannot preventDefault or cross', () => {
		const harness = shellHarness();
		const link = { closest: (query: string) => (query.includes('a[href]') ? {} : null) };
		harness.adapter.start(touchEvent(link, [touch(1, 10, 400)], [touch(1, 10, 400)]));
		harness.adapter.move(touchEvent(link, [touch(1, 10, 180)], []));
		assert.equal(harness.adapter.end(touchEvent(link, [], [touch(1, 10, 180)])).prevent, false);
		assert.deepEqual(harness.log.commits, []);
		assert.equal(harness.log.prevents, 0);
		assert.equal(harness.log.boundary.gesture, null);
	});

	it('keeps native scrolling in the middle of a chapter and only constrains the outward edge', () => {
		const mid = shellHarness({ distance: () => 240 });
		mid.adapter.start(touchEvent(PLAIN, [touch(1, 10, 400)], [touch(1, 10, 400)]));
		assert.equal(mid.adapter.move(touchEvent(PLAIN, [touch(1, 10, 320)], [])).prevent, false);
		mid.adapter.end(touchEvent(PLAIN, [], [touch(1, 10, 320)]));
		assert.deepEqual(mid.log.commits, []);

		const atEdge = shellHarness();
		atEdge.adapter.start(touchEvent(PLAIN, [touch(1, 10, 400)], [touch(1, 10, 400)]));
		assert.equal(atEdge.adapter.move(touchEvent(PLAIN, [touch(1, 10, 320)], [])).prevent, true);
	});

	it('voids the gesture when the primary touch is lost instead of following another finger', () => {
		const harness = shellHarness();
		arriveAtEdge(harness);
		assert.equal(harness.log.boundary.armedDir, 1);
		harness.adapter.start(touchEvent(PLAIN, [touch(7, 10, 300)], [touch(7, 10, 300)]));
		harness.adapter.move(touchEvent(PLAIN, [touch(7, 10, 240)], []));
		// 主指 7 丢了，只剩陌生 9：不能当成主指继续确认。
		harness.adapter.move(touchEvent(PLAIN, [touch(9, 10, 180)], []));
		harness.adapter.end(touchEvent(PLAIN, [], [touch(9, 10, 180)]));
		assert.deepEqual(harness.log.commits, []);
		assert.equal(harness.log.boundary.armedDir, 0);
	});

	it('voids multi-touch and never restarts on the leftover finger', () => {
		const harness = shellHarness();
		arriveAtEdge(harness);
		harness.adapter.start(touchEvent(PLAIN, [touch(1, 10, 300)], [touch(1, 10, 300)]));
		harness.adapter.move(touchEvent(PLAIN, [touch(1, 10, 250)], []));
		harness.adapter.start(touchEvent(PLAIN, [touch(1, 10, 250), touch(2, 40, 250)], [touch(2, 40, 250)]));
		assert.equal(harness.log.boundary.blocked, true);
		assert.equal(harness.log.boundary.armedDir, 0);
		harness.adapter.end(touchEvent(PLAIN, [touch(2, 40, 250)], [touch(1, 10, 250)]));
		harness.adapter.move(touchEvent(PLAIN, [touch(2, 40, 120)], []));
		harness.adapter.end(touchEvent(PLAIN, [], [touch(2, 40, 120)]));
		assert.deepEqual(harness.log.commits, []);
		assert.equal(harness.log.boundary.gesture, null);
	});

	it('never hijacks a live text selection', () => {
		const harness = shellHarness();
		const globals = globalThis as { document?: unknown };
		globals.document = { getSelection: () => ({ isCollapsed: false }) };
		try {
			harness.adapter.start(touchEvent(PLAIN, [touch(1, 10, 400)], [touch(1, 10, 400)]));
			harness.adapter.move(touchEvent(PLAIN, [touch(1, 10, 320)], []));
			harness.adapter.end(touchEvent(PLAIN, [], [touch(1, 10, 320)]));
			assert.deepEqual(harness.log.commits, []);
			assert.equal(harness.log.boundary.gesture, null);
		} finally {
			delete globals.document;
		}
	});

	it('commits once for a released two-phase gesture and honours cancellation', () => {
		const harness = shellHarness();
		arriveAtEdge(harness);
		assert.deepEqual(harness.log.commits, []);
		assert.equal(harness.log.boundary.armedDir, 1);
		harness.adapter.start(touchEvent(PLAIN, [touch(2, 10, 300)], [touch(2, 10, 300)]));
		harness.adapter.move(touchEvent(PLAIN, [touch(2, 10, 250)], []));
		harness.adapter.end(touchEvent(PLAIN, [], [touch(2, 10, 250)]));
		assert.deepEqual(harness.log.commits, [1]);

		const cancelled = shellHarness();
		arriveAtEdge(cancelled);
		cancelled.adapter.start(touchEvent(PLAIN, [touch(3, 10, 300)], [touch(3, 10, 300)]));
		cancelled.adapter.move(touchEvent(PLAIN, [touch(3, 10, 240)], []));
		cancelled.adapter.cancel();
		assert.deepEqual(cancelled.log.commits, []);
		assert.equal(cancelled.log.boundary.armedDir, 0);
		assert.equal(cancelled.log.boundary.gesture, null);
	});
});

type KeyLog = { boundary: BoundaryState; commits: number[]; actions: number };

function keyHarness(options?: { own?: () => boolean; scroll?: () => boolean; distance?: () => number }) {
	const log: KeyLog = { boundary: createBoundaryState({ chapterKey: 'story' }), commits: [], actions: 0 };
	const adapter = createChapterKeyAdapter({
		owns: options?.own ?? (() => true),
		scrollByKey: options?.scroll ?? (() => false),
		probe: (dir) => ({ dir, distance: options?.distance?.() ?? 0, metric: 'css-px' }),
		neighbor: () => true,
		apply: (event) => {
			if (event.type === 'key') log.actions += 1;
			const result = reduceBoundary(log.boundary, event);
			log.boundary = result.state;
			if (result.effects.commit !== 0) log.commits.push(result.effects.commit);
			return result.effects;
		},
	});
	return { adapter, log };
}

type KeyLike = {
	key: string;
	repeat?: boolean;
	metaKey?: boolean;
	ctrlKey?: boolean;
	altKey?: boolean;
	shiftKey?: boolean;
	target?: unknown;
};

const key = (value: string, extra?: Partial<KeyLike>): KeyLike => ({ key: value, target: PLAIN, ...extra });

describe('壳章键盘 adapter：keydown→keyup 才是一次有释放的按压', () => {
	it('arms on the first release and crosses only on the next released press', () => {
		const { adapter, log } = keyHarness();
		// 按下本身不是一次有释放的动作：既不 arm，也不提交。
		assert.equal(adapter.down(key('ArrowDown')), true);
		assert.equal(log.actions, 0);
		assert.equal(log.boundary.armedDir, 0);
		adapter.up(key('ArrowDown'));
		assert.equal(log.actions, 1);
		assert.equal(log.boundary.armedDir, 1);
		assert.deepEqual(log.commits, []);
		adapter.down(key('ArrowDown'));
		adapter.up(key('ArrowDown'));
		assert.deepEqual(log.commits, [1]);
	});

	it('never commits on a second keydown before its own keyup', () => {
		const { adapter, log } = keyHarness();
		adapter.down(key('ArrowDown'));
		adapter.up(key('ArrowDown'));
		assert.equal(log.boundary.armedDir, 1);
		// 第二次按下：还没有对应的 keyup，绝不能提交。
		adapter.down(key('ArrowDown'));
		assert.deepEqual(log.commits, [], '第二次 keydown 不得自己提交');
		assert.equal(log.actions, 1);
		adapter.up(key('ArrowDown'));
		assert.deepEqual(log.commits, [1], '只有配对的 keyup 才提交');
	});

	it('never treats a second key pressed while another is held as a release', () => {
		const { adapter, log } = keyHarness();
		adapter.down(key('ArrowDown'));
		// PageDown 与 ArrowDown 混按：这次按下不是新手势。
		adapter.down(key('PageDown'));
		adapter.up(key('PageDown'));
		assert.equal(log.actions, 0);
		adapter.up(key('ArrowDown'));
		// 混按过的那一按不构成有释放的动作：完全松开后要重新按。
		assert.equal(log.actions, 0);
		assert.deepEqual(log.commits, []);
		adapter.down(key('PageDown'));
		adapter.up(key('PageDown'));
		assert.equal(log.actions, 1);
		assert.equal(log.boundary.armedDir, 1);
		adapter.down(key('PageDown'));
		adapter.up(key('PageDown'));
		assert.deepEqual(log.commits, [1]);
	});

	it('ignores auto-repeat without inventing a release', () => {
		const { adapter, log } = keyHarness();
		adapter.down(key('ArrowDown'));
		adapter.down(key('ArrowDown', { repeat: true }));
		adapter.down(key('ArrowDown', { repeat: true }));
		assert.equal(log.actions, 0);
		assert.deepEqual(log.commits, []);
		adapter.up(key('ArrowDown'));
		// 一次物理按压 = 一次动作（arm），repeat 不额外累计。
		assert.equal(log.actions, 1);
		assert.equal(log.boundary.armedDir, 1);
		assert.deepEqual(log.commits, []);
	});

	it('does not let a held key survive a resize or blur reset', () => {
		const { adapter, log } = keyHarness();
		adapter.down(key('ArrowDown'));
		assert.deepEqual(adapter.held(), ['ArrowDown']);
		// 视口／可见性变化：键位身份与边界 arm 一起作废（生产里同时发 epoch）。
		adapter.reset();
		assert.deepEqual(adapter.held(), []);
		// 失焦时丢掉的那次按压，其迟到 keyup 不能再变成一次动作（keyloss）。
		adapter.up(key('ArrowDown'));
		assert.equal(log.actions, 0);
		log.boundary = reduceBoundary(log.boundary, { type: 'epoch', chapterKey: 'story' }).state;
		adapter.down(key('ArrowDown'));
		adapter.up(key('ArrowDown'));
		assert.equal(log.actions, 1);
		assert.deepEqual(log.commits, []);
		assert.equal(log.boundary.armedDir, 1);
	});

	it('leaves editable fields, Home/End, modifiers and the map chapter alone', () => {
		const editable = keyHarness();
		const field = { closest: (query: string) => (query.includes('input') ? {} : null) };
		assert.equal(editable.adapter.down(key('ArrowDown', { target: field })), false);
		assert.equal(editable.log.actions, 0);

		const home = keyHarness();
		assert.equal(home.adapter.down(key('Home')), false);
		assert.equal(home.adapter.down(key('End')), false);
		assert.equal(home.log.actions, 0);

		const meta = keyHarness();
		assert.equal(meta.adapter.down(key('ArrowDown', { metaKey: true })), false);
		assert.equal(meta.log.actions, 0);

		const map = keyHarness({ own: () => false });
		assert.equal(map.adapter.down(key('ArrowDown')), false);
		assert.equal(map.log.actions, 0);
	});

	it('drops the release when the chapter or the focus changed during the press', () => {
		let own = true;
		const log: KeyLog = { boundary: createBoundaryState({ chapterKey: 'story' }), commits: [], actions: 0 };
		const adapter = createChapterKeyAdapter({
			owns: () => own,
			scrollByKey: () => false,
			probe: (dir) => ({ dir, distance: 0, metric: 'css-px' }),
			neighbor: () => true,
			apply: (event) => {
				if (event.type === 'key') log.actions += 1;
				const result = reduceBoundary(log.boundary, event);
				log.boundary = result.state;
				if (result.effects.commit !== 0) log.commits.push(result.effects.commit);
				return result.effects;
			},
		});
		adapter.down(key('ArrowDown'));
		own = false; // 按压途中进了地图章／离开窄屏壳
		adapter.up(key('ArrowDown'));
		assert.equal(log.actions, 0);
		assert.equal(log.boundary.armedDir, 0);

		own = true;
		adapter.down(key('ArrowDown'));
		const field = { closest: (query: string) => (query.includes('input') ? {} : null) };
		adapter.up(key('ArrowDown', { target: field }));
		assert.equal(log.actions, 0, '焦点进了可编辑字段后松手不算章切动作');
	});

	it('scrolls the chapter and stays unarmed before the edge', () => {
		const scrolled = keyHarness({ scroll: () => true, distance: () => 240 });
		assert.equal(scrolled.adapter.down(key('ArrowDown')), true);
		assert.equal(scrolled.log.actions, 0);
		assert.equal(scrolled.log.boundary.armedDir, 0);
		scrolled.adapter.up(key('ArrowDown'));
		assert.equal(scrolled.log.actions, 0, '滚文章的那一按松手也不是边界动作');
		assert.deepEqual(scrolled.log.commits, []);
	});

	it('does not treat a 1.5px near-edge first press as already at the endpoint', () => {
		const near = keyHarness({ distance: () => 1.5 });
		near.adapter.down(key('ArrowDown'));
		near.adapter.up(key('ArrowDown'));
		near.adapter.down(key('ArrowDown'));
		near.adapter.up(key('ArrowDown'));
		assert.equal(near.log.boundary.armedDir, 0);
		assert.deepEqual(near.log.commits, []);
	});
});

type BridgeHarness = {
	bridge: ReturnType<typeof createStationBridge>;
	epoch: { value: number };
	canStep: { value: boolean };
	settles: TrapSettledDetail[];
	gestures: string[];
};

function bridgeHarness(options?: { epoch?: number; canStep?: boolean; active?: boolean }) {
	const epoch = { value: options?.epoch ?? 0 };
	const canStep = { value: options?.canStep ?? false };
	const settles: TrapSettledDetail[] = [];
	const gestures: string[] = [];
	const bridge = createStationBridge({
		active: () => options?.active ?? true,
		epoch: () => epoch.value,
		canStep: (dir) => canStep.value,
	});
	return { bridge, epoch, canStep, settles, gestures };
}

const touchA = touch(3, 10, 400);
const touchB = touch(3, 10, 330);

function stationStep(harness: BridgeHarness) {
	const begin = harness.bridge.begin(touch(3, 10, 400), 1);
	if (begin) harness.gestures.push(begin.phase);
	const move = harness.bridge.move(touchB, 1, 1);
	if (move) harness.gestures.push(move.phase);
	const ended = harness.bridge.end(touchB, 1, 1, true);
	if (ended.gesture) harness.gestures.push(ended.gesture.phase);
	if (ended.settled) harness.settles.push(ended.settled);
	assert.ok(ended.action, '站动作在 end 时冻结自己的来源身份');
	return { action: ended.action!, ended };
}

describe('地图站桥：真实站落稳 + 原 gid 已结束才 ready', () => {
	it('does not report readiness before flight and narration both finish', () => {
		const harness = bridgeHarness();
		const { action, ended } = stationStep(harness);
		assert.equal(ended.settled, null);
		assert.deepEqual(harness.settles, []);
		// 飞行完成、旁白还没完成。
		assert.equal(
			harness.bridge.settle(action, { flew: true, revealed: false, token: 1, currentToken: 1 }),
			null,
		);
		// 旁白被取消（showNarration false）。
		assert.equal(
			harness.bridge.settle(action, { flew: true, revealed: false, token: 1, currentToken: 1 }),
			null,
		);
		const ready = harness.bridge.settle(action, { flew: true, revealed: true, token: 1, currentToken: 1 });
		assert.ok(ready, 'both settled');
		assert.equal(ready!.gestureId, action.gestureId);
		assert.equal(ready!.epoch, action.epoch);
		assert.equal(ready!.dir, 1);
	});

	it('reports readiness once, after the end of the originating gesture', () => {
		const harness = bridgeHarness();
		const { action } = stationStep(harness);
		const ready = harness.bridge.settle(action, { flew: true, revealed: true, token: 1, currentToken: 1 });
		assert.ok(ready);
		assert.equal(
			harness.bridge.settle(action, { flew: true, revealed: true, token: 1, currentToken: 1 }),
			null,
			'ready is emitted once',
		);
	});

	it('only readies after the original finger is released', () => {
		const harness = bridgeHarness();
		harness.bridge.begin(touch(3, 10, 400), 1);
		harness.bridge.move(touchB, 1, 1);
		// 手指还按着：站已经落稳也没有 ready。
		assert.equal(harness.bridge.settling(), false, '站动作只在 end 时记账');
		const ended = harness.bridge.end(touchB, 1, 1, true);
		assert.ok(ended.action);
		assert.equal(ended.settled, null, '落稳消息不能先于飞行完成');
		const ready = harness.bridge.settle(ended.action!, {
			flew: true,
			revealed: true,
			token: 2,
			currentToken: 2,
		});
		assert.ok(ready, 'release + real settle completes the handoff');
		assert.equal(ready!.gestureId, ended.action!.gestureId);
	});

	it('goes inert when the token moved on, the station is not the endpoint, or the epoch changed', () => {
		const stale = bridgeHarness();
		const first = stationStep(stale).action;
		assert.equal(
			stale.bridge.settle(first, { flew: true, revealed: true, token: 1, currentToken: 2 }),
			null,
		);
		// 之后同 identity 的迟到完成也不能再冒充新手势的 ready。
		assert.equal(
			stale.bridge.settle(first, { flew: true, revealed: true, token: 1, currentToken: 1 }),
			null,
		);

		const mid = bridgeHarness({ canStep: true });
		const midAction = stationStep(mid).action;
		assert.equal(mid.bridge.settle(midAction, { flew: true, revealed: true, token: 1, currentToken: 1 }), null);

		const bumped = bridgeHarness();
		const action = stationStep(bumped).action;
		bumped.epoch.value = 1;
		assert.equal(bumped.bridge.settle(action, { flew: true, revealed: true, token: 1, currentToken: 1 }), null);
	});

	it('never treats a station action as ready when a new finger arrived first', () => {
		const harness = bridgeHarness();
		const { action } = stationStep(harness);
		// 站还没落稳，新手已经按下：旧的 ready 作废，也不排队给新手指。
		harness.bridge.begin(touch(4, 10, 400), 1);
		assert.equal(
			harness.bridge.settle(action, { flew: true, revealed: true, token: 1, currentToken: 1 }),
			null,
		);
		const next = harness.bridge.end(touch(4, 10, 330), 1, 1, false);
		assert.equal(next.gesture?.blocked, true, '新手整次不具跨章资格');
		assert.equal(next.gesture?.station, false, '作废不是换站');
	});

	it('never reports a station step and a blocked gid at the same time', () => {
		const harness = bridgeHarness();
		const { ended } = stationStep(harness);
		// 真站动作：station=true、blocked=false（否则外部无法判「这一手势到底做了什么」）。
		assert.equal(ended.gesture?.station, true);
		assert.equal(ended.gesture?.blocked, false);
	});

	it('reports the gesture phases with the primary touch identity and resets on pause', () => {
		const harness = bridgeHarness();
		const begin = harness.bridge.begin(touch(5, 10, 400), 1);
		assert.equal(begin?.phase, 'begin');
		assert.equal(begin?.touchId, 5);
		const move = harness.bridge.move(touch(5, 10, 330), 1, 1);
		assert.equal(move?.gestureId, begin?.gestureId);
		assert.deepEqual(move?.probe, { dir: 1, distance: 0, metric: 'station' });
		assert.equal(move?.station, false);
		const cancel = harness.bridge.cancel();
		assert.equal(cancel?.phase, 'cancel');
		harness.bridge.begin(touch(6, 10, 400), 1);
		harness.bridge.reset();
		assert.equal(harness.bridge.end(touch(6, 10, 330), 1, 1, false).gesture, null);
	});
});

describe('地图桥：落稳之前开的新手势整次不合格，被顶掉的账要销', () => {
	it('lets a busy map void the whole new gesture without queueing it', () => {
		let busy = true;
		const bridge = createStationBridge({
			active: () => true,
			epoch: () => 0,
			canStep: () => false,
			busy: () => busy,
		});
		const begin = bridge.begin(touch(7, 10, 400), 1);
		assert.ok(begin);
		const move = bridge.move(touch(7, 10, 330), 1, 1);
		assert.equal(move?.probe, null, '飞行／旁白还没落稳：不给站 probe');
		// 落稳窗口里的 gid 只是「作废」，不能被外部读成「这一手势换了站」：
		// 两个字段必须互斥，否则探针会把作废当成双 claim（PR #184 F2）。
		assert.equal(move?.blocked, true, '整次不具跨章资格要自称 blocked');
		assert.equal(move?.station, false, 'blocked 的 gid 不是站动作');
		const ended = bridge.end(touch(7, 10, 300), 1, 1, true);
		assert.equal(ended.action, null, '不合格的 gid 绝不排队 settle');
		assert.equal(ended.settled, null);
		assert.equal(ended.gesture?.blocked, true, 'end 也要自称 blocked');
		assert.equal(ended.gesture?.station, false, 'blocked 的 end 不许报 station');
		// 松手、地图也落稳了：下一次手势才是正常的那一次。
		busy = false;
		const next = bridge.begin(touch(8, 10, 400), 1);
		assert.ok(next);
		const healthy = bridge.move(touch(8, 10, 330), 1, 1);
		assert.equal(healthy?.station, false);
		assert.equal(healthy?.blocked, false, '落稳之后不再 blocked');
	});

	it('drops a pending settle when the step is superseded, then readies only the new one', () => {
		const harness = bridgeHarness();
		const first = stationStep(harness).action;
		// 后来的意图顶掉这一步：销账后，即使原来那次"完成"了也不能 ready。
		harness.bridge.abandon();
		assert.equal(harness.bridge.settling(), false);
		assert.equal(
			harness.bridge.settle(first, { flew: true, revealed: true, token: 1, currentToken: 1 }),
			null,
		);
		// 新手势重新走一遍：落稳＋原手指已松开才 ready，且只发一次。
		const second = stationStep(harness).action;
		const ready = harness.bridge.settle(second, {
			flew: true,
			revealed: true,
			token: 2,
			currentToken: 2,
		});
		assert.ok(ready);
		assert.equal(ready!.gestureId, second.gestureId);
	});

	it('never readiness for a cancelled narration even after the flight landed', () => {
		const harness = bridgeHarness();
		const { action } = stationStep(harness);
		assert.equal(
			harness.bridge.settle(action, { flew: true, revealed: false, token: 3, currentToken: 3 }),
			null,
		);
		assert.equal(harness.bridge.settling(), true, '只飞不说的那一步还在等');
		assert.ok(
			harness.bridge.settle(action, { flew: true, revealed: true, token: 3, currentToken: 3 }),
			'旁白真的上了卡才 ready',
		);
	});
});

describe('壳端站目标中继：先切地图章，再交回已验证目标', () => {
	const target: StationTarget = { discId: 'd1', placeId: 'p3', index: 2 };

	function relayHarness(options?: { active?: boolean }) {
		const log: { seeks: StationTarget[]; dispatched: StationTarget[]; scheduled: number } = {
			seeks: [],
			dispatched: [],
			scheduled: 0,
		};
		const relay = createStationTargetRelay({
			active: () => options?.active ?? true,
			seek: (value) => log.seeks.push(value),
			dispatch: (value) => log.dispatched.push(value),
			schedule: (work) => {
				log.scheduled += 1;
				work();
			},
		});
		return { relay, log };
	}

	it('seeks the map chapter first and only then hands the target back', () => {
		const { relay, log } = relayHarness();
		const order: string[] = [];
		const ordered = createStationTargetRelay({
			active: () => true,
			seek: () => order.push('seek'),
			dispatch: () => order.push('dispatch'),
			schedule: (work) => work(),
		});
		assert.equal(ordered.offer(target), true);
		assert.deepEqual(order, ['seek', 'dispatch'], '切章在前、定位在后');
		assert.equal(relay.offer(target), true);
		assert.deepEqual(log.seeks, [target]);
		assert.deepEqual(log.dispatched, [target]);
	});

	it('ignores malformed, foreign and inactive targets instead of switching chapters', () => {
		const { relay, log } = relayHarness();
		for (const bad of [
			null,
			undefined,
			{},
			{ discId: 'd1', placeId: 'p3' },
			{ discId: '', placeId: 'p3', index: 0 },
			{ discId: 'd1', placeId: 'p3', index: -1 },
			{ discId: 'd1', placeId: 'p3', index: 1.5 },
		]) {
			assert.equal(relay.offer(bad), false);
		}
		assert.deepEqual(log.seeks, []);
		const inactive = relayHarness({ active: false });
		assert.equal(inactive.relay.offer(target), false);
		assert.deepEqual(inactive.log.seeks, []);
	});

	it('validates a hash target against the real disc places, not the hash text', () => {
		const discs = new Map([
			['d1', { places: [{ id: 'p1' }, { id: 'p2' }] }],
			['d2', { places: [{ id: 'p9' }] }],
		]);
		assert.equal(stationTargetIndex(discs, 'd1', 'p2'), 1);
		assert.equal(stationTargetIndex(discs, 'd1', 'p9'), -1, '别的碟的站不是本站目标');
		assert.equal(stationTargetIndex(discs, 'zz', 'p1'), -1);
		assert.equal(stationTargetIndex(discs, 'd1', 3), -1);
		assert.equal(isStationTarget({ discId: 'd1', placeId: 'p1', index: 0 }), true);
		assert.equal(isStationTarget({ discId: 'd1', placeId: 'p1', index: '0' }), false);
	});
});

/**
 * 两端一起跑：地图端用**生产** `createStationBridge` 产出 `traj:gesture` /
 * `traj:station-settled` 的形状，壳端用**生产** `mapGestureEvents` /
 * `mapSettledEvent` 喂同一个 reducer——就是生产代码里两端各自的那几个调用。
 * 合成的是几何与异步完成顺序（标注 synthetic），不是浏览器证据。
 */
function bridgeToShell(options?: { canStep?: boolean }) {
	const shell = createBoundaryState({ chapterKey: 'map' });
	const log = { boundary: shell, commits: [] as number[], settles: [] as TrapSettledDetail[] };
	const canStep = { value: options?.canStep ?? false };
	const bridge = createStationBridge({
		active: () => true,
		epoch: () => log.boundary.epoch,
		canStep: () => canStep.value,
		busy: () => false,
	});
	const dispatch = (
		detail: Parameters<typeof mapGestureEvents>[0],
	): void => {
		for (const event of mapGestureEvents(detail, () => true)) {
			const result = reduceBoundary(log.boundary, event);
			log.boundary = result.state;
			if (result.effects.commit !== 0) log.commits.push(result.effects.commit);
		}
	};
	return {
		log,
		canStep,
		begin(t: TouchPoint) {
			const detail = bridge.begin(t, 1);
			if (detail) dispatch(detail);
		},
		move(t: TouchPoint, dir: 0 | 1 | -1) {
			const detail = bridge.move(t, 1, dir);
			if (detail) dispatch(detail);
		},
		end(t: TouchPoint, dir: 0 | 1 | -1, station: boolean) {
			const result = bridge.end(t, 1, dir, station);
			if (result.gesture) dispatch(result.gesture);
			if (result.settled) {
				log.settles.push(result.settled);
				const event = mapSettledEvent(result.settled);
				const reduced = reduceBoundary(log.boundary, event);
				log.boundary = reduced.state;
				if (reduced.effects.commit !== 0) log.commits.push(reduced.effects.commit);
			}
			return result;
		},
		settle(action: NonNullable<ReturnType<typeof bridge.end>['action']>, outcome: Parameters<typeof bridge.settle>[1]) {
			const settled = bridge.settle(action, outcome);
			if (!settled) return null;
			log.settles.push(settled);
			const reduced = reduceBoundary(log.boundary, mapSettledEvent(settled));
			log.boundary = reduced.state;
			if (reduced.effects.commit !== 0) log.commits.push(reduced.effects.commit);
			return settled;
		},
		/** 生产里 touchcancel 走的路：地图端作废本次 gid，并把 cancel 报给壳。 */
		cancelGesture() {
			const detail = bridge.cancel();
			if (detail) dispatch(detail);
			return detail;
		},
		/** 生产里 blur／hidden 走的路：壳先 reducer cancel，再让地图销账（traj:cancel）。 */
		cancelLifecycle() {
			const reduced = reduceBoundary(log.boundary, { type: 'cancel' });
			log.boundary = reduced.state;
			bridge.cancel();
			bridge.reset();
		},
		/** 迟到的真实飞行＋旁白完成：仍然拿原来的 action 去 settle。 */
		lateSettle(action: NonNullable<ReturnType<typeof bridge.end>['action']>) {
			return this.settle(action, { flew: true, revealed: true, token: 1, currentToken: 1 });
		},
		/** 只有壳一侧取消（审计复现的旧接线：地图端还没销账）。 */
		cancelShellOnly() {
			const reduced = reduceBoundary(log.boundary, { type: 'cancel' });
			log.boundary = reduced.state;
		},
	};
}

describe('地图桥 × 壳 reducer（审计 F1 的原始复现）', () => {
	it('never lets an unsettled station step arm, and never crosses on the same gid', () => {
		const wire = bridgeToShell();
		// 审计复现：gid1 换到末站、end；此处**没有**任何 station-settled（飞行/旁白未完成）。
		wire.begin(touch(1, 10, 300));
		wire.move(touch(1, 10, 240), 1);
		const first = wire.end(touch(1, 10, 240), 1, true);
		assert.ok(first.action);
		assert.deepEqual(wire.log.settles, [], '没落稳就没有 ready');
		assert.equal(wire.log.boundary.armedDir, 0, '未落稳绝不会自己 arm');

		// 原来审计里 gid2 朝外再 end 就 arm 了——现在落稳前的新手指整次不合格。
		wire.begin(touch(2, 10, 300));
		wire.move(touch(2, 10, 240), 1);
		const early = wire.end(touch(2, 10, 240), 1, false);
		assert.equal(early.gesture?.blocked, true, '落稳前的新手势整次不带跨章资格');
		assert.equal(early.gesture?.station, false, '不作废成「换了站」');
		assert.equal(early.gesture?.probe, null, '也不给站 probe');
		assert.deepEqual(wire.log.commits, []);
		assert.equal(wire.log.boundary.armedDir, 0);
	});

	it('readies once after real settle + original release, then the next 48px crosses adjacent', () => {
		const wire = bridgeToShell();
		wire.begin(touch(1, 10, 300));
		wire.move(touch(1, 10, 240), 1);
		const step = wire.end(touch(1, 10, 240), 1, true);
		wire.canStep.value = false;
		// 飞行完成、旁白还没结束：等。
		assert.equal(
			wire.settle(step.action!, { flew: true, revealed: false, token: 1, currentToken: 1 }),
			null,
		);
		assert.equal(wire.log.boundary.armedDir, 0);
		// 旁白真的上了卡、token 未变：ready 一次，壳侧 arm 到端站方向。
		const ready = wire.settle(step.action!, {
			flew: true,
			revealed: true,
			token: 1,
			currentToken: 1,
		});
		assert.ok(ready);
		assert.equal(wire.log.settles.length, 1);
		assert.equal(wire.log.boundary.armedDir, 1);
		// 落稳后下一次 48px＋松手直接切邻章，不需要再「到边—松手」一次。
		wire.begin(touch(3, 10, 300));
		wire.move(touch(3, 10, 240), 1);
		wire.end(touch(3, 10, 240), 1, false);
		assert.deepEqual(wire.log.commits, [1]);
	});

	it('stays inert for a step that ended after the map already moved on', () => {
		const wire = bridgeToShell();
		wire.begin(touch(1, 10, 300));
		wire.move(touch(1, 10, 240), 1);
		const step = wire.end(touch(1, 10, 240), 1, true);
		wire.log.boundary = reduceBoundary(wire.log.boundary, { type: 'epoch', chapterKey: 'map' }).state;
		assert.equal(
			wire.settle(step.action!, { flew: true, revealed: true, token: 1, currentToken: 1 }),
			null,
			'换了 epoch 的迟到完成不得 arm',
		);
		assert.equal(wire.log.boundary.armedDir, 0);
	});
});

describe('取消生命周期：blur／hidden／touchcancel 之后，迟到的真实落稳不得复活 arm', () => {
	it('keeps a cancelled gid cold when the real settle arrives late', () => {
		const wire = bridgeToShell();
		wire.begin(touch(1, 10, 300));
		wire.move(touch(1, 10, 240), 1);
		const step = wire.end(touch(1, 10, 240), 1, true);
		assert.ok(step.action);
		// 飞行／旁白还在途中，页面失焦：壳清 arm，地图销掉这一步的账。
		wire.cancelLifecycle();
		assert.equal(wire.log.boundary.armedDir, 0);
		assert.equal(wire.log.boundary.blocked, true);
		// 迟到的真实完成：不能再把 arm 从 0 恢复到 1。
		assert.equal(wire.lateSettle(step.action!), null, '取消后的迟到落稳不得发 ready');
		assert.equal(wire.log.boundary.armedDir, 0, 'reducer 也不得在 blocked 期间接受 arm');
		assert.equal(wire.log.boundary.blocked, true);
		assert.deepEqual(wire.log.commits, []);
		// 恢复后必须先有新的一次真实手势（begin 才会解除 blocked）。
		wire.begin(touch(2, 10, 300));
		assert.equal(wire.log.boundary.blocked, false);
		wire.move(touch(2, 10, 260), 1);
		wire.end(touch(2, 10, 260), 1, false);
		assert.deepEqual(wire.log.commits, [], '新手势仍要重新到边');
	});

	it('voids the gesture on touchcancel and never arms from its late completion', () => {
		const wire = bridgeToShell();
		wire.begin(touch(1, 10, 300));
		wire.move(touch(1, 10, 240), 1);
		wire.cancelGesture();
		assert.equal(wire.log.boundary.armedDir, 0);
		assert.equal(wire.log.boundary.blocked, true);
		// 同一 gid 的 end 迟到（浏览器先给了 cancel）：不再算一次站动作。
		const late = wire.end(touch(1, 10, 240), 1, true);
		assert.equal(late.gesture, null);
		assert.equal(wire.log.boundary.armedDir, 0);
	});

	it('revokes readiness on cancel but keeps true async ownership until the work really ends', () => {
		const bridge = createStationBridge({
			active: () => true,
			epoch: () => 0,
			canStep: () => false,
			busy: () => false,
		});
		bridge.begin(touch(3, 10, 400), 1);
		bridge.move(touch(3, 10, 340), 1, 1);
		const ended = bridge.end(touch(3, 10, 340), 1, 1, true);
		assert.ok(ended.action);
		bridge.cancel();
		// 取消只撤销 ready 资格：飞行／旁白还在跑，不能对外宣布「已落稳」。
		assert.equal(bridge.settling(), true, '异步没收尾前 settling() 必须仍为真');
		assert.equal(
			bridge.settle(ended.action!, { flew: true, revealed: true, token: 1, currentToken: 1 }),
			null,
			'被撤销的 ready 永不补发',
		);
		// 真实完成之后才解除忙态（之后的新手势才可能正常）。
		assert.equal(bridge.settling(), false, '异步真的结束才解除');
	});

	it('hard reset also keeps ownership while the underlying work is still running', () => {
		const bridge = createStationBridge({
			active: () => true,
			epoch: () => 0,
			canStep: () => false,
			busy: () => false,
		});
		bridge.begin(touch(4, 10, 400), 1);
		bridge.move(touch(4, 10, 340), 1, 1);
		const ended = bridge.end(touch(4, 10, 340), 1, 1, true);
		assert.ok(ended.action);
		bridge.reset();
		assert.equal(bridge.settling(), true, 'reset 不伪造旁白已完成');
		assert.equal(
			bridge.settle(ended.action!, { flew: true, revealed: true, token: 1, currentToken: 1 }),
			null,
		);
		assert.equal(bridge.settling(), false);
	});
});

describe('壳单侧取消（审计原始复现）：reducer 自己必须挡住迟到的 arm', () => {
	it('never re-arms from a late genuine settle after the shell already cancelled', () => {
		const wire = bridgeToShell();
		wire.begin(touch(1, 10, 300));
		wire.move(touch(1, 10, 240), 1);
		const step = wire.end(touch(1, 10, 240), 1, true);
		assert.ok(step.action);
		// 旧接线只有壳 cancel；地图端的账还挂着。
		wire.cancelShellOnly();
		assert.equal(wire.log.boundary.armedDir, 0);
		assert.equal(wire.log.boundary.blocked, true);
		// 迟到的真实飞行＋旁白完成换回一条 boundary-ready：reducer 不得接受。
		const late = wire.lateSettle(step.action!);
		assert.ok(late, '桥层仍会报一次（它不知道壳已取消）');
		assert.equal(wire.log.boundary.armedDir, 0, 'blocked 期间迟到 arm 必须被 reducer 丢掉');
		assert.deepEqual(wire.log.commits, []);
		// 重新开一次有效手势后 blocked 才解除，且要重新到边。
		wire.begin(touch(2, 10, 300));
		wire.move(touch(2, 10, 240), 1);
		wire.end(touch(2, 10, 240), 1, false);
		assert.deepEqual(wire.log.commits, []);
	});
});

describe('地图桥：旁白未落稳时反复提前按下，绝不让端点重新可 arm（审计 F1 复现）', () => {
	it('keeps async ownership across repeated early fingers until real narration settles', () => {
		// 生产表达式：busy = flying || bridge.settling()（地图 busy 谓词）。
		let flying = false;
		let canStepValue = true;
		const bridge: ReturnType<typeof createStationBridge> = createStationBridge({
			active: () => true,
			epoch: () => 0,
			canStep: () => canStepValue,
			busy: () => flying || bridge.settling(),
		});
		let state = createBoundaryState({ chapterKey: 'map' });
		const commits: number[] = [];
		const settles: TrapSettledDetail[] = [];
		const dispatch = (detail: Parameters<typeof mapGestureEvents>[0]): void => {
			for (const event of mapGestureEvents(detail, () => true)) {
				const result = reduceBoundary(state, event);
				state = result.state;
				if (result.effects.commit !== 0) commits.push(result.effects.commit);
			}
		};
		const sweep = (id: number, station: boolean) => {
			const start = { identifier: id, clientX: 0, clientY: 300 };
			const at = { identifier: id, clientX: 0, clientY: 240 };
			const begin = bridge.begin(start, 1);
			if (begin) dispatch(begin);
			const move = bridge.move(at, 1, 1);
			if (move) dispatch(move);
			const ended = bridge.end(at, 1, 1, station);
			if (ended.gesture) dispatch(ended.gesture);
			return ended;
		};
		const ready = (action: NonNullable<ReturnType<typeof bridge.end>['action']>, outcome: {
			flew: boolean;
			revealed: boolean;
			token: number;
			currentToken: number;
		}) => {
			const settled = bridge.settle(action, outcome);
			if (!settled) return null;
			settles.push(settled);
			const result = reduceBoundary(state, mapSettledEvent(settled));
			state = result.state;
			if (result.effects.commit !== 0) commits.push(result.effects.commit);
			return settled;
		};

		// gid1：有效站动作换到端站，end 后记账；飞行已完成，旁白仍未完成。
		const first = sweep(1, true);
		assert.ok(first.action);
		canStepValue = false;
		flying = false;
		assert.equal(ready(first.action!, { flew: true, revealed: false, token: 1, currentToken: 1 }), null);
		assert.equal(bridge.settling(), true, '旁白没完成：异步所有权还在');
		assert.equal(state.armedDir, 0);

		// gid2／gid3／gid4：同一段旁白未完成期间反复提前按下并松手。
		for (const id of [2, 3, 4]) {
			const early = sweep(id, false);
			assert.equal(early.gesture?.blocked, true, `gid${id} 整次不具跨章资格`);
			assert.equal(early.gesture?.station, false, `gid${id} 不是站动作`);
			assert.equal(early.gesture?.probe, null, `gid${id} 不拿站 probe`);
			assert.equal(bridge.settling(), true, '提前手指不得抹掉旁白未完成这件事');
		}
		assert.equal(state.armedDir, 0, '没有真实落稳就绝不 arm');
		assert.deepEqual(commits, [], '没有真实落稳就绝不提交');
		assert.deepEqual(settles, []);

		// 旁白真的完成：才 ready 一次，且挂到最近一次已结束的手势（壳 arm 只认 lastGestureId）。
		const done = ready(first.action!, { flew: true, revealed: true, token: 1, currentToken: 1 });
		assert.ok(done, '真实落稳必须发 ready');
		assert.equal(done!.gestureId, state.lastGestureId);
		assert.equal(done!.dir, 1);
		assert.equal(settles.length, 1);
		assert.equal(state.armedDir, 1);
		assert.equal(bridge.settling(), false);

		// 落稳之后的正常手势：48px＋松手直接去相邻章，不需要再来一次「到边—松手」。
		const next = sweep(5, false);
		assert.equal(next.gesture?.station, false);
		assert.deepEqual(commits, [1]);
	});

	it('does not ready while the origin finger is still down, then readies on its end', () => {
		const bridge = createStationBridge({
			active: () => true,
			epoch: () => 0,
			canStep: () => false,
			busy: () => false,
		});
		const down = { identifier: 9, clientX: 0, clientY: 400 };
		const up = { identifier: 9, clientX: 0, clientY: 340 };
		bridge.begin(down, 1);
		bridge.move(up, 1, 1);
		const ended = bridge.end(up, 1, 1, true);
		assert.ok(ended.action);
		// 同一 gid 再按下（手指未抬起语义的另一半）：落稳到了也不报——等它结束。
		bridge.begin(down, 1);
		assert.equal(
			bridge.settle(ended.action!, { flew: true, revealed: true, token: 2, currentToken: 2 }),
			null,
			'手指还按着不得 ready',
		);
		assert.equal(bridge.settling(), true, '也不销账');
	});
});

/**
 * 生产者 busy 回调（`flying || bridge.settling()`）下，所有「撤销 ready 资格」的
 * 分支都不得把仍在跑的飞行／旁白说成已完成；只有真实完成或真的取消才解除忙态。
 */
describe('取消/重置/换代：撤销 ready 但不伪造异步完成（审计 cancel-then-early 复现）', () => {
	function productionWire() {
		let flying = false;
		let canStepValue = true;
		let epoch = 1;
		const bridge: ReturnType<typeof createStationBridge> = createStationBridge({
			active: () => true,
			epoch: () => epoch,
			canStep: () => canStepValue,
			busy: () => flying || bridge.settling(),
		});
		let state = createBoundaryState({ chapterKey: 'map', epoch: 1 });
		const commits: number[] = [];
		const settles: TrapSettledDetail[] = [];
		const dispatch = (detail: Parameters<typeof mapGestureEvents>[0]): void => {
			for (const event of mapGestureEvents(detail, () => true)) {
				const result = reduceBoundary(state, event);
				state = result.state;
				if (result.effects.commit !== 0) commits.push(result.effects.commit);
			}
		};
		const sweep = (id: number, station: boolean) => {
			const t = { identifier: id, clientX: 0, clientY: 300 };
			const begin = bridge.begin(t, 1);
			if (begin) dispatch(begin);
			const move = bridge.move({ ...t, clientY: 240 }, 1, 1);
			if (move) dispatch(move);
			const ended = bridge.end({ ...t, clientY: 240 }, 1, 1, station);
			if (ended.gesture) dispatch(ended.gesture);
			return ended;
		};
		return {
			bridge,
			commits,
			settles,
			sweep,
			state: () => state,
			set: (next: { flying?: boolean; canStep?: boolean; epoch?: number }) => {
				if (next.flying !== undefined) flying = next.flying;
				if (next.canStep !== undefined) canStepValue = next.canStep;
				if (next.epoch !== undefined) epoch = next.epoch;
			},
			settle: (action: NonNullable<ReturnType<typeof bridge.end>['action']>, outcome: {
				flew: boolean;
				revealed: boolean;
				token: number;
				currentToken: number;
			}) => {
				const settled = bridge.settle(action, outcome);
				if (!settled) return null;
				settles.push(settled);
				const result = reduceBoundary(state, mapSettledEvent(settled));
				state = result.state;
				if (result.effects.commit !== 0) commits.push(result.effects.commit);
				return settled;
			},
			/** 壳 blur：reducer cancel；地图 traj:cancel → bridge.cancel() + bridge.reset()。 */
			blur: () => {
				const reduced = reduceBoundary(state, { type: 'cancel' });
				state = reduced.state;
				const detail = bridge.cancel();
				if (detail) dispatch(detail);
				bridge.reset();
			},
		};
	}

	it('never commits after cancel → new gestures, while narration is still unsettled', () => {
		const wire = productionWire();
		// gid1 有效站动作到端站并松手；飞行已结束，旁白仍未完成。
		const first = wire.sweep(1, true);
		assert.ok(first.action);
		wire.set({ canStep: false, flying: false });
		assert.equal(
			wire.settle(first.action!, { flew: true, revealed: false, token: 1, currentToken: 1 }),
			null,
		);
		assert.equal(wire.bridge.settling(), true);
		// blur：撤销 ready 资格，但旁白还在跑。
		wire.blur();
		assert.equal(wire.state().armedDir, 0);
		assert.equal(wire.bridge.settling(), true, '取消不得把未完成的旁白说成已完成');
		// 新手势（仍在旁白未落稳期间）：整次不合格、不 arm、不提交。
		const second = wire.sweep(2, false);
		assert.equal(second.gesture?.blocked, true);
		assert.equal(second.gesture?.station, false);
		assert.equal(second.gesture?.probe, null);
		assert.equal(wire.sweep(3, false).gesture?.probe, null);
		assert.equal(wire.state().armedDir, 0);
		assert.deepEqual(wire.commits, []);
		// 旁白真的落地：被撤销的候选永不补发 arm，但忙态解除。
		assert.equal(wire.settle(first.action!, { flew: true, revealed: true, token: 1, currentToken: 1 }), null);
		assert.equal(wire.bridge.settling(), false);
		assert.equal(wire.state().armedDir, 0);
		// 之后重新「到边—松手」才 arm，再下一次 48px+end 才提交。
		wire.sweep(4, false);
		assert.equal(wire.state().armedDir, 1);
		wire.sweep(5, false);
		assert.deepEqual(wire.commits, [1]);
	});

	it('keeps ownership across cancel when the bridge is re-entered (map chapter re-entry)', () => {
		const wire = productionWire();
		const first = wire.sweep(1, true);
		wire.set({ canStep: false, flying: false });
		assert.equal(wire.settle(first.action!, { flew: true, revealed: false, token: 1, currentToken: 1 }), null);
		// 离章（traj:pause 未在播放）→ cancel+reset；回章仍是同一段未完成旁白。
		wire.blur();
		wire.set({ epoch: 2 });
		wire.bridge.begin({ identifier: 9, clientX: 0, clientY: 300 }, 1);
		assert.equal(wire.bridge.settling(), true, '回章仍要等真实旁白');
		// 真实完成：只销账，不补发 ready（也绝不因为 epoch 变了而卡死）。
		assert.equal(wire.settle(first.action!, { flew: true, revealed: true, token: 1, currentToken: 1 }), null);
		assert.equal(wire.bridge.settling(), false);
	});

	it('clears ownership when the narration is genuinely superseded (token moved on)', () => {
		const wire = productionWire();
		const first = wire.sweep(1, true);
		wire.set({ canStep: false, flying: false });
		assert.equal(wire.settle(first.action!, { flew: true, revealed: false, token: 1, currentToken: 1 }), null);
		assert.equal(wire.bridge.settling(), true);
		// 旁白被后来的播放／换站顶掉：这次落稳不会再来。
		assert.equal(wire.settle(first.action!, { flew: true, revealed: false, token: 1, currentToken: 2 }), null);
		assert.equal(wire.bridge.settling(), false, '顶掉的异步工作不得让忙态永久挂着');
		wire.sweep(2, false);
		assert.equal(wire.state().armedDir, 1);
	});

	it('clears ownership when the map really gives the step up (abandon)', () => {
		const bridge = createStationBridge({
			active: () => true,
			epoch: () => 0,
			canStep: () => false,
			busy: () => false,
		});
		bridge.begin(touch(1, 10, 400), 1);
		bridge.move(touch(1, 10, 340), 1, 1);
		const ended = bridge.end(touch(1, 10, 340), 1, 1, true);
		assert.ok(ended.action);
		assert.equal(bridge.settling(), true);
		bridge.abandon();
		assert.equal(bridge.settling(), false, '地图确实放弃这一步时才销账');
	});
});
