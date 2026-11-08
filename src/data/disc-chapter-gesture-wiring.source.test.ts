/**
 * 生产接线契约：`disc-chapter-gestures.ts` 里的 adapter 必须**真的被**阅读器／地图
 * 注册的事件处理器调用，而不是只存在于测试里。
 *
 * 这一层只钉接线（谁调用谁、顺序、守卫位置）；行为回归在
 * `disc-chapter-gestures.test.ts` 里驱动同一批生产 adapter。
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { stripTypeScriptTypes } from 'node:module';
import {
	createBoundaryState,
	mapGestureEvents,
	mapSettledEvent,
	reduceBoundary,
	type BoundaryEvent,
	type TrapGestureDetail,
	type TrapSettledDetail,
} from './disc-chapter-boundary.ts';
import { createChapterKeyAdapter, createStationBridge } from './disc-chapter-gestures.ts';
import { scrollEdgeProbe } from './disc-chapter-boundary.ts';
import { scrollFollowThrough } from './disc-chapters.ts';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const reader = readFileSync(join(here, './disc-chapter-reader.ts'), 'utf8');
const client = readFileSync(join(here, '../components/trajectory-map-client.ts'), 'utf8');
const gestures = readFileSync(join(here, './disc-chapter-gestures.ts'), 'utf8');
const boundary = readFileSync(join(here, './disc-chapter-boundary.ts'), 'utf8');

/** 从 `needle` 起截一段源码，用来钉同一个处理器里的顺序。 */
function sliceFrom(source: string, needle: string, length = 2400): string {
	const at = source.indexOf(needle);
	assert.ok(at >= 0, `找不到 ${needle}`);
	return source.slice(at, at + length);
}

describe('阅读器接线：触摸／键盘／站目标都只经生产 adapter', () => {
	it('registers the four touch handlers through the one adapter', () => {
		assert.match(reader, /const touch = createChapterTouchAdapter\(\{/);
		assert.match(reader, /stage\.addEventListener\('touchstart', \(event\) => touch\.start\(event\), \{ passive: true \}\)/);
		for (const handler of ['touch.move(event)', 'touch.end(event)', 'touch.cancel()']) {
			assert.ok(reader.includes(handler), `触摸处理器没走 adapter：${handler}`);
		}
		// 一丝不挂的「自己算 net / 自己发 move」都算绕过 adapter。
		const touchBlock = sliceFrom(reader, "'touchmove'", 900);
		assert.equal(touchBlock.includes('type: \'move\''), false, '处理器里又手写 move 事件');
		assert.equal(touchBlock.includes('gesture.startY'), false, '处理器里又手算 net');
	});

	it('guards controls, selection and editable fields before anything is taken', () => {
		// 壳的 wheel：控件／选区优先，再谈边界。
		const wheel = sliceFrom(reader, "'wheel',", 900);
		assert.match(wheel, /ownsInteractiveGesture\(node\) \|\| hasLiveSelection\(\)/);
		assert.ok(
			wheel.indexOf('ownsInteractiveGesture(node)') < wheel.indexOf('preventDefault()'),
			'控件守卫必须在 preventDefault 之前',
		);
		// adapter 自己也要挡（键盘字段／触摸控件）。
		assert.match(reader, /const keyboard = createChapterKeyAdapter\(\{/);
		assert.match(reader, /owns: \(\) => active && verticalIsShell\(\)/);
	});

	it('has a real keyup release path and resets it on viewport/visibility churn', () => {
		assert.match(reader, /window\.addEventListener\('keyup', \(event\) => keyboard\.up\(event\)\)/);
		assert.match(reader, /window\.addEventListener\('keydown', \(event\) => \{\s*if \(!keyboard\.down\(event\)\) return;\s*event\.preventDefault\(\);/);
		// 视口／可见性变化：键位与主指一起清，旧 arm 不升格。
		const bump = sliceFrom(reader, 'const bumpEpoch', 700);
		assert.match(bump, /touch\.reset\(\)/);
		assert.match(bump, /keyboard\.reset\(\)/);
		assert.match(bump, /type: 'epoch'/);
		// 纯偏移（地址栏／键盘收起）也要重测，而不是只认 resize。
		assert.match(reader, /window\.visualViewport\?\.addEventListener\('(?:resize|scroll)', bumpEpoch\)/);
		assert.match(reader, /window\.visualViewport\?\.addEventListener\('scroll', bumpEpoch\)/);
	});

	it('routes a verified station target through the relay before focusing it', () => {
		assert.match(reader, /const relay = createStationTargetRelay\(\{/);
		assert.match(reader, /relay\.offer\(\(raw as CustomEvent<StationTarget>\)\.detail\)/);
		// seek（切到地图章）必须早于 dispatch（traj:station-focus）。
		const relay = sliceFrom(reader, 'const relay = createStationTargetRelay', 900);
		assert.ok(relay.indexOf('seek:') < relay.indexOf('dispatch:'), '切章要在定位之前');
		assert.match(relay, /trajRoot\(\)\?\.dispatchEvent\(new CustomEvent\('traj:station-focus'/);
	});

	it('cancels the map-side station account on blur/hidden, not only the shell reducer', () => {
		// 壳失焦：reducer cancel + 通知地图销账（否则迟到的真实落稳会复活 arm）。
		const abandon = sliceFrom(reader, 'const abandon = (): void => {', 620);
		assert.match(abandon, /applyBoundary\(\{ type: 'cancel' \}\)/);
		assert.match(abandon, /if \(kind\(\) === 'map'\) trajRoot\(\)\?\.dispatchEvent\(new Event\('traj:cancel'\)\)/);
		// 地图端收到同一条消息：撤销 ready 资格，但**不**假装飞行／旁白已经结束。
		const cancelListener = sliceFrom(client, "'traj:cancel'", 200);
		assert.match(cancelListener, /bridgeCancel\(\);/);
		assert.match(cancelListener, /bridge\.reset\(\);/);
		assert.equal(/stationAction = null;/.test(cancelListener), false, '取消不该扔掉仍在跑的异步身份');
		// 真正停掉自动播才销账（那时飞行／旁白确实被顶掉）。
		const pauseListener = sliceFrom(client, "'traj:pause'", 320);
		assert.match(pauseListener, /bridge\.abandon\(\);/);
		assert.match(pauseListener, /stationAction = null;/);
		// 取消只撤销 ready 资格：飞行／旁白还在跑时不许伪造「已落稳」。
		assert.match(gestures, /const revokeStep = \(\): void => \{\s*if \(!step\) return;\s*if \(step\.settled\) step = null;\s*else step\.revoked = true;/);
		assert.match(gestures, /cancel\(\) \{[\s\S]{0,220}?revokeStep\(\);/);
		assert.match(gestures, /reset\(\) \{[\s\S]{0,220}?revokeStep\(\);/);
		// 已撤销的候选永不补发 ready。
		assert.match(gestures, /if \(!step \|\| step\.revoked \|\| !step\.settled \|\| step\.endGid === null\) return null;/);
		// 显式换站／前后站／无碟：先把还在等落稳的账交给地图自己销（否则忙态永久挂住）。
		for (const next of [
			'seekChronoPlace(discId, index);',
			'void focusPlace(selectedDiscId, Math.max(0, currentIndex - 1));',
			'void focusPlace(selectedDiscId, Math.min(activePlaces().length - 1, currentIndex + 1));',
		]) {
			const at = client.indexOf(next);
			assert.ok(at > 0, `找不到 ${next}`);
			const before = client.slice(Math.max(0, at - 260), at);
			assert.match(before, /bridge\.abandon\(\);\s*stationAction = null;/, `换站前没销账：${next}`);
		}
		// 提前结束的手指不得抹掉仍在跑的异步身份（否则忙态永久挂住）。
		const endBody = sliceFrom(client, 'function bridgeEnd', 420);
		assert.equal(/else if \(result\.gesture\) stationAction = null;/.test(endBody), false);
		// 异步所有权与「已落稳候选」分开：提前按下只作废候选，不宣布旁白已完成。
		assert.match(gestures, /if \(step\?\.settled\) step = null;/);
		assert.match(gestures, /const busy = step !== null \|\| input\.busy\?\.\(\) === true;/);
		// reducer：取消／多指之后，blocked 期间迟到的 arm 一律不收。
		const armCase = boundary.slice(boundary.indexOf("case 'arm':"));
		assert.ok(
			armCase.indexOf('if (next.blocked) break;') > -1 &&
				armCase.indexOf('if (next.blocked) break;') < armCase.indexOf('setArm(event.dir)'),
			'blocked 期间不得接受迟到 arm',
		);
	});

	it('clears the arm when the map hands ownership to explore and back', () => {
		// 地图在 viewMode 真的变了时发 traj:view；壳把它当 epoch（arm 一格都不带）。
		assert.match(client, /root\.dispatchEvent\(new CustomEvent\('traj:view'/);
		const view = sliceFrom(client, 'const viewChanged', 420);
		assert.match(view, /if \(viewChanged\)/);
		const listener = sliceFrom(reader, "traj.addEventListener('traj:view'", 320);
		assert.match(listener, /applyBoundary\(\{ type: 'epoch', chapterKey: kind\(\) \}\)/);
	});

	it('runs the same short transaction for a map pane without moving the map root', () => {
		// 地图 pane 也走 200ms／100ms 那一套类与 shift，只是 CSS 用淡入淡出（不位移）。
		assert.equal(reader.includes("from.kind === 'map' || to.kind === 'map'"), false, '地图章被排除了反馈');
		assert.match(reader, /if \(enteringMap\) \{\s*handoffMap\(move\.index\);/);
		const css = readFileSync(join(here, '../styles/global.css'), 'utf8');
		assert.match(css, /\.disc-chapter\[data-chapter-kind='map'\]\.is-out\[data-chapter-shift\] \{\s*animation: disc-chapter-out-map 100ms/);
		assert.match(css, /\.disc-chapter\[data-chapter-kind='map'\]\.is-in\[data-chapter-shift\] \{\s*animation: disc-chapter-in-map 200ms/);
		// 地图专用关键帧只有 opacity：不改 Leaflet 内部 transform，也不做 clone。
		const mapFrames = css.slice(
			css.indexOf('@keyframes disc-chapter-out-map'),
			css.indexOf('@keyframes disc-chapter-out-back'),
		);
		assert.ok(mapFrames.length > 0);
		assert.equal(mapFrames.includes('translateY'), false, '地图过渡写了位移');
		assert.equal(reader.includes('cloneNode'), false);
	});

	it('commits keyboard actions on keyup, never on keydown', () => {
		// 生产 adapter 的动作点在 up()：down() 只登记这次物理按压。
		const downAt = gestures.indexOf('\t\tdown(event) {');
		const upAt = gestures.indexOf('\t\tup(event) {');
		assert.ok(downAt > 0 && upAt > downAt);
		const downBody = gestures.slice(downAt, upAt);
		assert.equal(downBody.includes("type: 'key'"), false, 'keydown 里还在发边界 key 事件');
		const upBody = gestures.slice(upAt);
		assert.match(upBody, /input\.apply\(\{\s*type: 'key'/);
		// 生产处理器：keydown 只做 preventDefault，keyup 才把释放交给 adapter。
		assert.match(reader, /window\.addEventListener\('keyup', \(event\) => keyboard\.up\(event\)\)/);
	});

	it('keeps two-phase arm semantics and the 200ms transaction', () => {
		assert.match(reader, /const CHAPTER_TRANSITION_MS = 200;/);
		assert.match(reader, /if \(!from \|\| !to \|\| reduceMotion\(\)\)/);
		// 苹果手指数由 adapter 报，处理器不再自己维护一遍。
		assert.equal(reader.includes('let touching = 0'), false, '又并存一份手指数');
	});
});

describe('地图接线：站点落稳身份由桥冻结，站目标走已验证通道', () => {
	it('constructs the bridge and emits its phases', () => {
		assert.match(client, /const bridge = createStationBridge\(\{/);
		for (const call of ['bridge.begin(', 'bridge.move(', 'bridge.end(', 'bridge.cancel()']) {
			assert.ok(client.includes(call), `站桥没接：${call}`);
		}
		assert.match(client, /if \(detail\) emitBridge\(detail\)/);
	});

	it('settles only from real flight + narration with the frozen origin identity', () => {
		const settle = sliceFrom(client, 'function settleStation', 520);
		assert.match(settle, /const settled = bridge\.settle\(action, outcome\);/);
		assert.match(settle, /if \(settled\) emitStationSettled\(settled\);/);
		// 只有一条 ready 出口。
		assert.equal((client.match(/'traj:station-settled'/g) ?? []).length, 1);
		// 换站起飞前把身份取走，之后不再读可变状态。
		assert.match(client, /const action = takeStationAction\(\);/);
		assert.match(client, /settleStation\(action, \{ flew, revealed, token, currentToken: playToken \}\)/);
		// 飞行没落／token 已被顶掉：连 settle 都不发（桥内部还有一层同名校验）。
		assert.match(client, /if \(!flew \|\| token !== playToken\) return;/);
		// 桌面／独立地图保留基线的 420ms 落稳锁（本票不得改那条路径）。
		assert.match(client, /const STATION_FLIGHT_LOCK_MS = 420;/);
		assert.match(client, /let stationSettledAt = 0;/);
		assert.equal((client.match(/stationSettledAt = performance\.now\(\) \+ STATION_FLIGHT_LOCK_MS;/g) ?? []).length, 2);
		// 手机章节壳（bridgeOn）才用真实桥；其余路径原样不动。
		const inFlight = sliceFrom(client, 'function stationInFlight', 320);
		assert.match(inFlight, /if \(bridgeOn\(\)\) return flying \|\| bridge\.settling\(\);/);
		assert.match(inFlight, /return flying \|\| performance\.now\(\) < stationSettledAt;/);
	});

	it('never takes a gesture from a control, the stop list or a selection', () => {
		const owns = sliceFrom(client, 'function listOwnsGesture', 260);
		assert.match(owns, /ownsInteractiveGesture\(target\) \|\| hasLiveSelection\(\)/);
		const touchStart = sliceFrom(client, "'touchstart',", 800);
		assert.match(touchStart, /listOwnsGesture\(event\.target\)/);
		assert.ok(
			touchStart.indexOf('listOwnsGesture(event.target)') < touchStart.indexOf('bridgeBegin('),
			'控件／站表守卫必须在 bridgeBegin 之前',
		);
	});

	it('validates the hash target against the real disc before answering', () => {
		const from = sliceFrom(client, 'function placeFromHash', 900);
		assert.match(from, /stationTargetIndex\(discs, discId, placeId\)/);
		assert.match(from, /if \(index < 0\) return null;/);
		// 壳交回目标后，地图自己再验一次形状与索引，才真的换站。
		const focus = sliceFrom(client, "'traj:station-focus'", 420);
		assert.match(focus, /isStationTarget\(target\)/);
		assert.match(focus, /stationTargetIndex\(discs, target\.discId, target\.placeId\) !== target\.index/);
	});

	it('pauses back to a clean bridge state instead of keeping a stale gesture', () => {
		const pause = sliceFrom(client, "'traj:pause'", 260);
		assert.match(pause, /bridgeCancel\(\);/);
		assert.match(pause, /bridge\.reset\(\);/);
		assert.match(pause, /stationAction = null;/);
	});
});

/**
 * F1 装配回归：**真实自定义事件回环**。
 *
 * 这里不直接调 `mapSettledEvent`：`applyBoundary` 是从阅读器源码原样提取的生产函数，
 * `traj:pause`／`traj:gesture`／`traj:station-settled` 走真实 `EventTarget`，
 * 地图端用同一份源码里的 pause 监听器。审计就是这么复现的（arm 被自己的 pause 撤掉）。
 */
function productionArmLoop() {
	const root = new EventTarget();
	let commits = 0;
	let canStep = true;
	let flying = false;
	const cancels: string[] = [];
	const start = reader.indexOf('function applyBoundary(');
	const end = reader.indexOf('\n\t/**', start);
	assert.ok(start > 0 && end > start, '找不到生产 applyBoundary');
	const applySource = stripTypeScriptTypes(reader.slice(start, end));
	const shell = new Function(
		'reduceBoundary',
		'initial',
		'syncShellHints',
		'kind',
		'trajRoot',
		'commitChapter',
		`let boundary=initial;${applySource};return {applyBoundary,getState:()=>boundary};`,
	)(
		reduceBoundary,
		createBoundaryState({ chapterKey: 'map', epoch: 1 }),
		() => {},
		() => 'map',
		() => root,
		() => {
			commits += 1;
		},
	);
	const apply = (event: Parameters<typeof reduceBoundary>[1]) => {
		const effects = shell.applyBoundary(event);
		return effects;
	};
	const bridge: ReturnType<typeof createStationBridge> = createStationBridge({
		active: () => true,
		epoch: () => 1,
		canStep: () => canStep,
		busy: () => flying || bridge.settling(),
	});
	const emitBridge = (detail: TrapGestureDetail) => {
		root.dispatchEvent(new CustomEvent('traj:gesture', { detail }));
	};
	function bridgeCancel(): void {
		const detail = bridge.cancel();
		if (detail) emitBridge(detail);
	}
	root.addEventListener('traj:gesture', (raw) => {
		const detail = (raw as CustomEvent<TrapGestureDetail>).detail;
		if (detail.phase === 'cancel') cancels.push(`gid${detail.gestureId}`);
		for (const event of mapGestureEvents(detail, () => true)) apply(event);
	});
	root.addEventListener('traj:station-settled', (raw) => {
		apply(mapSettledEvent((raw as CustomEvent<TrapSettledDetail>).detail));
	});
	// 地图端 `traj:pause` 监听器：源码原样提取，不是替身。
	const pauseStart = client.indexOf("root.addEventListener('traj:pause',");
	const pauseEnd = client.indexOf('\n\t// 合法本站点 hash', pauseStart);
	assert.ok(pauseStart > 0 && pauseEnd > pauseStart, '找不到生产 traj:pause 监听器');
	const pauseSource = stripTypeScriptTypes(client.slice(pauseStart, pauseEnd));
	const pauseEnv = new Function(
		'root',
		'bridgeCancel',
		'bridge',
		'hold',
		`let stationAction=null;let mode='paused';${pauseSource};
		return {setMode:(m)=>{mode=m;},stationAction:()=>stationAction};`,
	)(root, bridgeCancel, bridge, () => {});
	function run(id: number, station: boolean) {
		const touch = { identifier: id, clientX: 10, clientY: 400 };
		const begin = bridge.begin(touch, 1);
		if (begin) emitBridge(begin);
		const moved = { ...touch, clientY: 340 };
		const move = bridge.move(moved, 1, 1);
		if (move) emitBridge(move);
		if (station) canStep = false;
		const result = bridge.end(moved, 1, 1, station);
		if (result.gesture) emitBridge(result.gesture);
		if (result.settled) {
			root.dispatchEvent(new CustomEvent('traj:station-settled', { detail: result.settled }));
		}
		return result.action;
	}
	return {
		root,
		bridge,
		run,
		cancels,
		commits: () => commits,
		arm: () => shell.getState().armedDir,
		pauseEnv,
		setFlying: (on: boolean) => {
			flying = on;
		},
		cancelShell: () => {
			apply({ type: 'cancel' } as BoundaryEvent);
		},
	};
}

describe('地图章 arm 与 traj:pause 的真实事件回环（F1）', () => {
	it('keeps the arm that a normal station settle just established', () => {
		const loop = productionArmLoop();
		const action = loop.run(1, true);
		assert.ok(action, '末站手势必须冻结出一个站动作');
		// 真实飞行＋旁白完成：桥发 ready，壳 arm。
		const settled = loop.bridge.settle(action!, {
			flew: true,
			revealed: true,
			token: 1,
			currentToken: 1,
		});
		assert.ok(settled, '真实落稳必须发一条 ready');
		loop.root.dispatchEvent(new CustomEvent('traj:station-settled', { detail: settled }));
		assert.equal(loop.arm(), 1, 'arm 不能被自己的 traj:pause 回环撤掉');
		assert.deepEqual(loop.cancels, [], '停播不是取消手势');
		// 下一条 48px＋松手：直接换到真实邻章。
		loop.run(2, false);
		assert.equal(loop.commits(), 1, 'settled 后的下一滑必须切资料');
	});

	it('still revokes the candidate and the arm on a real cancel', () => {
		const loop = productionArmLoop();
		const action = loop.run(1, true);
		loop.root.dispatchEvent(
			new CustomEvent('traj:station-settled', {
				detail: loop.bridge.settle(action!, {
					flew: true,
					revealed: true,
					token: 1,
					currentToken: 1,
				}),
			}),
		);
		assert.equal(loop.arm(), 1);
		// blur／hidden／离章：壳先 cancel 自己，取消再经 traj:cancel 交给地图。
		loop.cancelShell();
		loop.root.dispatchEvent(new Event('traj:cancel'));
		assert.equal(loop.arm(), 0, '真实取消必须撤掉刚建立的 arm');
		// 取消之后：迟到的落稳不得复活 arm，新的一滑也不切。
		const late = loop.bridge.settle(action!, {
			flew: true,
			revealed: true,
			token: 1,
			currentToken: 1,
		});
		assert.equal(late, null, '被取消的 ready 永不补发');
		loop.run(2, false);
		assert.equal(loop.commits(), 0, '取消后不得凭旧 arm 切章');
	});
});

/**
 * F2 装配回归：**真实 reader scrollByKey callback**。
 *
 * `scrollByKey` 从阅读器源码原样提取（不是 `() => false` 替身），
 * 和真实的 key adapter、边界 reducer 组合；只有滚动容器与边界量法是合成的。
 */
describe('正文键盘：真实 scrollByKey 语义与边界 arm（F2）', () => {
	function realKeyboardLoop(start: { scrollTop: number; scrollHeight: number; clientHeight: number }) {
		const source = reader.slice(reader.indexOf('function scrollByKey('), reader.indexOf('function setActive('));
		assert.ok(source.length > 0, '找不到生产 scrollByKey');
		const el = {
			scrollTop: start.scrollTop,
			scrollHeight: start.scrollHeight,
			clientHeight: start.clientHeight,
			scrollBy({ top }: { top: number }) {
				const max = Math.max(0, this.scrollHeight - this.clientHeight);
				this.scrollTop = Math.min(max, Math.max(0, this.scrollTop + top));
			},
		};
		const edges = () => ({
			atTop: el.scrollTop <= 1,
			atBottom: el.scrollTop >= Math.max(0, el.scrollHeight - el.clientHeight) - 1,
		});
		const scrollByKey = new Function(
			'scrollEdges',
			'pane',
			'scrollFollowThrough',
			'KEY_SCROLL_PX',
			`${stripTypeScriptTypes(source)};return scrollByKey;`,
		)(edges, () => ({ scroll: el }), scrollFollowThrough, 120) as (dir: 1 | -1) => boolean;
		let state = createBoundaryState({ chapterKey: 'story', epoch: 1 });
		const commits: number[] = [];
		const applied: string[] = [];
		const adapter = createChapterKeyAdapter({
			owns: () => true,
			scrollByKey,
			probe: (dir) =>
				scrollEdgeProbe({
					scrollTop: el.scrollTop,
					scrollHeight: el.scrollHeight,
					clientHeight: el.clientHeight,
					dir,
				}),
			neighbor: () => true,
			apply: (event) => {
				applied.push(event.type);
				const result = reduceBoundary(state, event);
				state = result.state;
				if (result.effects.commit !== 0) commits.push(result.effects.commit);
				return result.effects;
			},
		});
		return {
			adapter,
			el,
			commits,
			applied,
			arm: () => state.armedDir,
			key: (value: string) => ({ key: value, target: { closest: () => null } }),
		};
	}

	it('scrolls the prose inside the chapter and never arms on that press', () => {
		const loop = realKeyboardLoop({ scrollTop: 0, scrollHeight: 1000, clientHeight: 300 });
		loop.adapter.down(loop.key('ArrowDown'));
		loop.adapter.up(loop.key('ArrowDown'));
		assert.ok(loop.el.scrollTop > 0, '正文内部的一按必须真的滚');
		assert.equal(loop.arm(), 0, '章内滚动不 arm');
		assert.deepEqual(loop.commits, []);
		assert.equal(loop.applied.includes('key'), false, '章内滚动这一按不交给边界');
	});

	it('works the same at the top edge in the reverse direction', () => {
		const loop = realKeyboardLoop({ scrollTop: 0, scrollHeight: 1000, clientHeight: 300 });
		loop.adapter.down(loop.key('ArrowUp'));
		assert.deepEqual(loop.commits, [], '反向首次 keydown 不切');
		loop.adapter.up(loop.key('ArrowUp'));
		assert.equal(loop.arm(), -1, '反向首 keyup 才 arm');
		assert.deepEqual(loop.commits, []);
		loop.adapter.down(loop.key('ArrowUp'));
		assert.deepEqual(loop.commits, [], '反向第二 keydown 按住不切');
		loop.adapter.up(loop.key('ArrowUp'));
		assert.deepEqual(loop.commits, [-1], '反向第二 keyup 单切一次');
	});

	it('never crosses on mixed keys, repeats, or a keyup delivered after blur', () => {
		const mixed = realKeyboardLoop({ scrollTop: 700, scrollHeight: 1000, clientHeight: 300 });
		mixed.adapter.down(mixed.key('ArrowDown'));
		mixed.adapter.up(mixed.key('ArrowDown'));
		assert.equal(mixed.arm(), 1);
		// 混按：这一按整体作废，绝不提交。
		mixed.adapter.down(mixed.key('ArrowDown'));
		mixed.adapter.down(mixed.key('PageDown'));
		mixed.adapter.up(mixed.key('PageDown'));
		mixed.adapter.up(mixed.key('ArrowDown'));
		assert.deepEqual(mixed.commits, [], '混按不得提交');
		assert.equal(mixed.arm(), 1, '混按不改 arm');
		// repeat 不是新手势：一次物理按压只 arm 一次，松手不额外提交。
		const repeat = realKeyboardLoop({ scrollTop: 700, scrollHeight: 1000, clientHeight: 300 });
		repeat.adapter.down(repeat.key('ArrowDown'));
		repeat.adapter.down({ ...repeat.key('ArrowDown'), repeat: true });
		repeat.adapter.up(repeat.key('ArrowDown'));
		assert.equal(repeat.arm(), 1);
		assert.deepEqual(repeat.commits, []);
		// blur：reset 之后迟到的 keyup 不得补切。
		const blur = realKeyboardLoop({ scrollTop: 700, scrollHeight: 1000, clientHeight: 300 });
		blur.adapter.down(blur.key('ArrowDown'));
		blur.adapter.up(blur.key('ArrowDown'));
		assert.equal(blur.arm(), 1);
		blur.adapter.down(blur.key('ArrowDown'));
		blur.adapter.reset();
		blur.adapter.up(blur.key('ArrowDown'));
		assert.deepEqual(blur.commits, [], 'blur 后迟到 keyup 不补切');
	});

	it('arms on the first release at the end and crosses on the second one', () => {
		const loop = realKeyboardLoop({ scrollTop: 700, scrollHeight: 1000, clientHeight: 300 });
		// 首按：已经在真实底部，不再滚动，交给边界 —— 但首 keydown 不切。
		loop.adapter.down(loop.key('ArrowDown'));
		assert.deepEqual(loop.commits, [], '首次 keydown 不切');
		assert.equal(loop.arm(), 0, 'keydown 本身不 arm');
		// 首 keyup：arm，仍不切。
		loop.adapter.up(loop.key('ArrowDown'));
		assert.equal(loop.arm(), 1, '首 keyup 才 arm');
		assert.deepEqual(loop.commits, [], '首 keyup 不切');
		// 第二 down 按住：不切。
		loop.adapter.down(loop.key('ArrowDown'));
		assert.deepEqual(loop.commits, [], '第二 keydown 按住不切');
		// 第二 up：单次切。
		loop.adapter.up(loop.key('ArrowDown'));
		assert.deepEqual(loop.commits, [1], '第二 keyup 单切一次');
	});
});

/**
 * F3 装配回归：桌面／独立地图的站落稳锁不得被手机桥策略替换。
 *
 * `stationInFlight` 从地图源码原样提取，用两条分支的真实环境（bridgeOn 开／关）驱动；
 * 时间轴是合成的（`performance.now` 注入），但判定函数是生产那份。
 */
describe('桌面／独立地图保留 420ms 站落稳锁（F3）', () => {
	function inFlight(bridgeOn: boolean, state: { flying: boolean; settled: boolean; now: number; settledAt: number }) {
		const source = client.slice(client.indexOf('function stationInFlight'), client.indexOf('\n\t/** Read-only'));
		assert.ok(source.length > 0, '找不到生产 stationInFlight');
		const fn = new Function(
			'bridgeOn',
			'flying',
			'bridge',
			'performance',
			'stationSettledAt',
			`${stripTypeScriptTypes(source)};return stationInFlight;`,
		)(
			() => bridgeOn,
			state.flying,
			{ settling: () => state.settled },
			{ now: () => state.now },
			state.settledAt,
		) as () => boolean;
		return fn();
	}

	it('swallows the wheel for the baseline window after a landing, outside the bridge', () => {
		// 桌面：飞行中 → 锁；飞行落地后 420ms 内 → 仍锁（基线行为）。
		assert.equal(inFlight(false, { flying: true, settled: false, now: 1000, settledAt: 0 }), true);
		assert.equal(inFlight(false, { flying: false, settled: false, now: 1000, settledAt: 1420 }), true);
		assert.equal(inFlight(false, { flying: false, settled: false, now: 1500, settledAt: 1420 }), false);
		// 桥没有 step 也绝不能解除桌面这段窗口。
		assert.equal(inFlight(false, { flying: false, settled: false, now: 1400, settledAt: 1420 }), true);
	});

	it('uses only the real bridge inside the phone chapter', () => {
		assert.equal(inFlight(true, { flying: false, settled: true, now: 1000, settledAt: 0 }), true);
		assert.equal(inFlight(true, { flying: false, settled: false, now: 1000, settledAt: 1420 }), false);
	});
});
