import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import * as time from './trajectory-time.ts';
import * as axis from './trajectory-axis.ts';
import { allUnknownAxis, approxAxis, denseAxis, primaryAxis } from './trajectory-time.fixtures.ts';

const here = dirname(fileURLToPath(import.meta.url));

/**
 * Task 0 contract test: it asserts that the surfaces later lanes compile and test
 * against exist with the agreed names and constant values. It does not assert a
 * computed layout — geometry belongs to the lane that implements the formula.
 */

const TIME_EXPORTS = [
	'UNKNOWN_YEAR_TEXT',
	'KNOWN_YEAR_MIN',
	'KNOWN_YEAR_MAX',
	'isKnownTime',
	'isUnknownTime',
	'timeText',
	'knownYear',
	'precisionOf',
	'catalogDomain',
	'axisT',
	'timelineOrder',
	'unknownStations',
] as const;

const AXIS_EXPORTS = [
	'AXIS_LABEL_LANE_PX',
	'AXIS_DOT_LANE_PX',
	'YEAR_RAIL_WIDTH_PX',
	'AXIS_DOT_X_PX',
	'AXIS_TARGET_PX',
	'AXIS_DOT_MERGE_PX',
	'AXIS_MAX_SHIFT_PX',
	'AXIS_CAP_PX',
	'AXIS_UNKNOWN_SLOT_PX',
	'AXIS_DOT_HIT_PX',
	'layoutYearAxis',
	'axisDotHit',
	'axisTargetLabel',
] as const;

describe('共享真实年轴 + unknown：Task 0 契约面', () => {
	it('exports every time-contract name later lanes import', () => {
		for (const name of TIME_EXPORTS) {
			assert.ok(name in time, `trajectory-time.ts 缺导出 ${name}`);
		}
	});

	it('exports every 58px axis name later lanes import', () => {
		for (const name of AXIS_EXPORTS) {
			assert.ok(name in axis, `trajectory-axis.ts 缺导出 ${name}`);
		}
	});

	it('pins the lock numbers: 44 label lane + 14 dot lane = 58, dot at 51', () => {
		assert.equal(time.UNKNOWN_YEAR_TEXT, '年份未核');
		assert.equal(time.KNOWN_YEAR_MIN, 1500);
		assert.equal(time.KNOWN_YEAR_MAX, 2100);

		assert.equal(axis.AXIS_LABEL_LANE_PX, 44);
		assert.equal(axis.AXIS_DOT_LANE_PX, 14);
		assert.equal(axis.YEAR_RAIL_WIDTH_PX, 58);
		assert.equal(axis.AXIS_LABEL_LANE_PX + axis.AXIS_DOT_LANE_PX, axis.YEAR_RAIL_WIDTH_PX);
		assert.equal(axis.AXIS_DOT_X_PX, axis.AXIS_LABEL_LANE_PX + axis.AXIS_DOT_LANE_PX / 2);
		assert.ok(axis.AXIS_DOT_X_PX > axis.AXIS_LABEL_LANE_PX, '点必须落在点道里，不在标签道里');
		assert.equal(axis.AXIS_TARGET_PX, 44);
		assert.equal(axis.AXIS_DOT_MERGE_PX, 8);
		assert.equal(axis.AXIS_MAX_SHIFT_PX, 60);
		assert.equal(axis.AXIS_CAP_PX, 22);
		assert.equal(axis.AXIS_UNKNOWN_SLOT_PX, 44);
		assert.equal(axis.AXIS_DOT_HIT_PX, 12);
		// 点道容差必须小于点道宽度，且标签道不参与命中——否则底下的标签按钮会被穿透误选。
		assert.ok(axis.AXIS_DOT_HIT_PX * 2 > axis.AXIS_DOT_LANE_PX);
	});

	it('ships fixture shapes with the fields the lanes read', () => {
		const fixtures = [primaryAxis, denseAxis, allUnknownAxis, approxAxis];
		for (const fixture of fixtures) {
			assert.equal(typeof fixture.id, 'string');
			assert.equal(typeof fixture.viewport.w, 'number');
			assert.equal(typeof fixture.viewport.h, 'number');
			assert.ok(Array.isArray(fixture.places));
			assert.equal(fixture.places.length, fixture.ids.length, `${fixture.id} 的 ids 与 places 必须等长`);
			assert.equal(typeof fixture.nowYear, 'number');
			assert.equal(typeof fixture.expect.minMapShare, 'number');
			assert.ok(fixture.expect.knownCount + fixture.expect.unknownCount === fixture.places.length);
		}
		assert.equal(primaryAxis.id, 'd37779');
		assert.equal(primaryAxis.expect.domainY0, 1685);
		assert.equal(primaryAxis.expect.unknownCount, 1);
		assert.equal(denseAxis.id, 'p1357e');
		assert.equal(allUnknownAxis.expect.domainY0, null);
		assert.equal(approxAxis.id, 'mg50370');
		assert.equal(approxAxis.expect.unknownCount, 0, '约年/范围仍是 known，不得算 unknown');
	});

	it('publishes the DOM hooks the consumers read', () => {
		const plan = readFileSync(
			join(here, '../../docs/superpowers/plans/2026-11-09-shared-real-time-axis.md'),
			'utf8',
		);
		for (const hook of [
			'data-traj-year-rail',
			'traj-year-label-lane',
			'traj-year-dot-lane',
			'data-traj-dot-lane',
			'data-traj-unknown-entry',
			'traj-unknown-list',
			'data-traj-domain',
			'--disc-year-rail-w',
			'--disc-year-label-lane',
			'--disc-year-dot-lane',
		]) {
			assert.ok(plan.includes(hook), `计划缺 hook ${hook}`);
		}
	});

	it('keeps the unknown contract shape explicit and the old sentinel out', () => {
		const source = readFileSync(join(here, 'trajectory-time.ts'), 'utf8');
		assert.ok(source.includes("timeStatus: 'known'"));
		assert.ok(source.includes("timeStatus: 'unknown'"));
		assert.ok(source.includes('year: null'));
		assert.ok(source.includes('timeNote: string'));
		// 不靠横线/label 推断，也不另立第二套 flag。
		assert.ok(!source.includes('dateUnknown'));
	});
});
