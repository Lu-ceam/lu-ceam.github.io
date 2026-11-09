/**
 * 全馆共享年轴＋unknown：Astro／客户端两端的接线闸门（Lane C 余项 C4／C5）。
 *
 * 这里只钉**源码接线**：域注入、读者时钟、chrono 遇未知转导览、进度归零、焦点键。
 * 真实像素与真机由 CDP 运行时闸门与 GUI 复核给，不由本文件给。
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const here = dirname(fileURLToPath(import.meta.url));
const map = readFileSync(join(here, '../components/TrajectoryMap.astro'), 'utf8');
const client = readFileSync(join(here, '../components/trajectory-map-client.ts'), 'utf8');

describe('C4：全馆域由 SSR 算出并注入，权威仍是数据', () => {
	it('builds one domain from every disc station and injects it on the root', () => {
		assert.ok(map.includes('catalogDomain('), 'Astro 没有从全馆算域');
		assert.ok(map.includes('museumDomainStations('), '域仍只吃传入的 discs，碟页会缩成单碟尺');
		assert.match(map, /records\.flatMap/, '没有从馆藏 records 收集全馆站');
		assert.match(map, /data-traj-domain=\{/, '没有把域注进 DOM');
		// 域挂在根节点，客户端只在根节点读它——不散落在每个子元素上。
		const root = map.slice(map.indexOf('data-traj-root'), map.indexOf('data-traj-root') + 600);
		assert.match(root, /data-traj-domain=/, 'data-traj-domain 不在根节点');
	});

	it('reads Y0 from the data, never a hand-written constant', () => {
		assert.ok(!/y0:\s*1685/.test(map), 'Y0 被写成常数');
		assert.ok(!/1685/.test(map), 'Astro 里出现写死的 1685');
	});
});

describe('C5：客户端只吃 union，未知不进比例轴与游线', () => {
	it('recomputes 现在 from the reader clock instead of the build clock', () => {
		assert.match(client, /new Date\(\)\.getFullYear\(\)/, '客户端没有用读者时钟重算「现在」');
		assert.ok(client.includes('catalogDomain('), '客户端没有重算全馆域');
		assert.ok(client.includes('resolveCatalogDomain('), '单碟 payload 会盖掉注入的全馆 Y0');
		assert.match(client, /timeStatus === 'unknown' \? 'guide' : 'explore'/, '未知深链仍落到探索');
		assert.match(client, /function writeStationHash/, '选站没有写 hash');
	});

	it('leaving chrono for an unknown station stops playback and hands over to guide', () => {
		const at = client.indexOf('async function focusPlace(');
		assert.ok(at > 0, '找不到 focusPlace');
		const block = client.slice(at, at + 2400);
		assert.match(block, /timeStatus === 'unknown'/, 'chrono 选未知站没有分支');
		assert.match(block, /viewMode = 'guide'/, '未知站没有转回导览');
		assert.match(block, /playToken \+= 1/, '未知站没有停播');
		// 停播必须发生在转模式之前：先顶掉 runChrono 的 token，再改模式。
		assert.ok(
			block.indexOf('playToken += 1') < block.indexOf("viewMode = 'guide'"),
			'停播没有先于转导览（游线会把这个站顶回去）',
		);
	});

	it('never advances the bead through an unknown station', () => {
		const at = client.indexOf('function syncRailBead');
		assert.ok(at > 0);
		const block = client.slice(at, at + 700);
		assert.match(block, /=== undefined/, 'bead 没有对 unknown 的 undefined 位置兜底');
		assert.match(block, /railStartX\(/, '缺少「未知站进度归零」的显式出口');
	});

	it('re-render keeps keyboard focus on the same target key', () => {
		assert.match(client, /function restoreAxisFocus/, '重渲染没有恢复焦点');
		assert.match(client, /function captureAxisFocus/, '重渲染没有记录焦点键');
		assert.match(client, /dataset\.axisKey/, '触点没有稳定的焦点键');
	});
});
