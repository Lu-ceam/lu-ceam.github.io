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
		// 地图端收到同一条消息：清 pending 身份与 origin，之后不再 settle。
		const cancelListener = sliceFrom(client, "'traj:cancel'", 260);
		assert.match(cancelListener, /bridgeCancel\(\);/);
		assert.match(cancelListener, /bridge\.reset\(\);/);
		assert.match(cancelListener, /stationAction = null;/);
		// 桥自己的 cancel 一定销掉待落稳的账（不论飞行是否已完成）。
		assert.match(gestures, /pending = null;\s*return gesture;/);
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
		assert.equal(client.includes('stationSettledAt'), false, '还在用锁时间冒充落稳');
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
