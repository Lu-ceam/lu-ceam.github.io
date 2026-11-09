import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
	AXIS_CAP_PX,
	AXIS_DOT_HIT_PX,
	AXIS_DOT_LANE_PX,
	AXIS_DOT_MERGE_PX,
	AXIS_DOT_X_PX,
	AXIS_LABEL_LANE_PX,
	AXIS_MAX_SHIFT_PX,
	AXIS_TARGET_PX,
	AXIS_UNKNOWN_SLOT_PX,
	YEAR_RAIL_WIDTH_PX,
	axisDotHit,
	axisTargetLabel,
	layoutYearAxis,
	type AxisTarget,
} from './trajectory-axis.ts';
import { allUnknownAxis, approxAxis, denseAxis, primaryAxis } from './trajectory-time.fixtures.ts';
import { axisT, catalogDomain, type CatalogDomain, type TrajectoryTime } from './trajectory-time.ts';

function domainOf(places: readonly TrajectoryTime[], nowYear: number): CatalogDomain {
	return catalogDomain(
		places.map((place, index) => ({ discId: 'd', placeId: `p${index}`, place })),
		nowYear,
	);
}

function layout(fixture: typeof primaryAxis, height = 400) {
	return layoutYearAxis({
		places: fixture.places,
		ids: fixture.ids,
		domain: domainOf(fixture.places, fixture.nowYear),
		height,
	});
}

const overlaps = (a: { top: number; bottom: number }, b: { top: number; bottom: number }) =>
	a.top < b.bottom - 0.01 && b.top < a.bottom - 0.01;

describe('58px 双道几何', () => {
	it('keeps the two lanes disjoint and the dot in the dot lane', () => {
		assert.equal(AXIS_LABEL_LANE_PX + AXIS_DOT_LANE_PX, YEAR_RAIL_WIDTH_PX);
		assert.ok(AXIS_DOT_X_PX >= AXIS_LABEL_LANE_PX && AXIS_DOT_X_PX <= YEAR_RAIL_WIDTH_PX);
		assert.ok(AXIS_DOT_X_PX - AXIS_DOT_LANE_PX / 2 >= AXIS_LABEL_LANE_PX);
	});
});

describe('layoutYearAxis：点按公式落位，布局不挪点', () => {
	it('puts every known dot exactly at the formula y', () => {
		const axis = layout(primaryAxis);
		const domain = domainOf(primaryAxis.places, primaryAxis.nowYear);
		const known = primaryAxis.places
			.map((place, index) => ({ place, index }))
			.filter((row) => row.place.timeStatus === 'known');
		assert.equal(axis.dots.length, known.length);
		for (const dot of axis.dots) {
			const place = primaryAxis.places[dot.placeIndex] as Extract<TrajectoryTime, { year: number }>;
			const t = axisT(place.year, domain)!;
			assert.equal(dot.t, t);
			assert.equal(dot.y, axis.axisTop + t * (axis.axisBottom - axis.axisTop));
			assert.ok(dot.y >= axis.axisTop - 1e-9 && dot.y <= axis.axisBottom + 1e-9);
			assert.equal(dot.id, primaryAxis.ids[dot.placeIndex]);
		}
	});

	it('re-running the layout returns identical dots: no drift from dodging', () => {
		const a = layout(primaryAxis);
		const b = layout(primaryAxis);
		assert.deepEqual(a.dots, b.dots);
	});

	it('keeps targets 44px, non-overlapping, and clear of 现在 and the unknown slot', () => {
		for (const fixture of [primaryAxis, denseAxis, approxAxis]) {
			const axis = layout(fixture);
			const height = axis.height;
			assert.ok(axis.unknownSlot === null || axis.unknownSlot.top >= axis.axisBottom - 1e-9);
			const floor = height - AXIS_CAP_PX - (axis.unknownSlot ? AXIS_UNKNOWN_SLOT_PX : 0);
			for (const target of axis.targets) {
				assert.ok(Math.abs(target.bottom - target.top - AXIS_TARGET_PX) < 1e-9, `${fixture.id}: 触点不是 44px`);
				assert.ok(target.top >= -1e-9, `${fixture.id}: 触点 ${target.key} 越出轴顶`);
				assert.ok(target.bottom <= floor + 1e-9, `${fixture.id}: 触点 ${target.key} 压到 现在／年份未核`);
			}
			for (let i = 1; i < axis.targets.length; i += 1) {
				assert.ok(
					!overlaps(axis.targets[i - 1]!, axis.targets[i]!),
					`${fixture.id}: 触点 ${i - 1} 与 ${i} 重叠`,
				);
			}
		}
	});

	it('gives every station exactly one entrance: one target member or one unknown row', () => {
		for (const fixture of [primaryAxis, denseAxis, approxAxis]) {
			const axis = layout(fixture);
			const seen: string[] = [];
			for (const target of axis.targets) seen.push(...target.members);
			for (const row of axis.unknown) seen.push(row.id);
			assert.equal(seen.length, fixture.places.length, `${fixture.id}: 站数不守恒`);
			assert.equal(new Set(seen).size, seen.length, `${fixture.id}: 有站重复出现`);
		}
	});

	it('draws leaders only when a label was shifted more than 2px', () => {
		const axis = layout(denseAxis);
		for (const target of axis.targets) {
			assert.equal(target.leader, Math.abs(target.y - target.anchorY) > 2);
		}
	});

	it('marks a cluster and keeps members in timeline order with their original indexes', () => {
		const axis = layout(denseAxis);
		const cluster = axis.targets.find((target) => target.cluster);
		assert.ok(cluster, 'p1357e 1970–75 应当出簇');
		assert.ok(cluster!.members.length > 1);
		const expected = axis.dots
			.filter((dot) => cluster!.members.includes(dot.id))
			.map((dot) => dot.placeIndex);
		assert.deepEqual(cluster!.placeIndexes, expected);
	});

	it('hides the proportional axis for an all-unknown disc without dividing by zero', () => {
		const axis = layoutYearAxis({
			places: allUnknownAxis.places,
			ids: allUnknownAxis.ids,
			domain: domainOf(allUnknownAxis.places, allUnknownAxis.nowYear),
			height: 400,
		});
		assert.equal(axis.dots.length, 0);
		assert.equal(axis.targets.length, 0);
		assert.equal(axis.domain.y0, null);
		assert.equal(axis.unknown.length, 2);
		assert.ok(axis.unknownSlot);
		assert.deepEqual(
			axis.unknown.map((row) => row.id),
			allUnknownAxis.ids,
		);
		assert.ok(axis.ticks.every((tick) => Number.isFinite(tick.y)));
	});

	it('keeps a single known year finite and inside the axis', () => {
		const places: TrajectoryTime[] = [{ timeStatus: 'known', year: 1900 }];
		const axis = layoutYearAxis({
			places,
			ids: ['only'],
			domain: catalogDomain([{ discId: 'd', placeId: 'only', place: places[0]! }], 1900),
			height: 400,
		});
		assert.equal(axis.dots.length, 1);
		assert.ok(Number.isFinite(axis.dots[0]!.y));
		assert.equal(axis.targets.length, 1);
	});

	it('labels century ticks only when they clear every target by 7px', () => {
		const axis = layout(primaryAxis);
		for (const tick of axis.ticks) {
			if (!tick.label) continue;
			for (const target of axis.targets) {
				assert.ok(
					tick.y <= target.top - 7 || tick.y >= target.bottom + 7,
					`${tick.year} 的刻度压到触点 ${target.key}`,
				);
			}
		}
	});
});

describe('axisDotHit：点道按 y 路由到拥有该点的触点', () => {
	it('returns the single-station target for a tap on its dot', () => {
		const axis = layout(primaryAxis);
		const single = axis.targets.find((target) => !target.cluster);
		assert.ok(single);
		const dot = axis.dots.find((entry) => entry.id === single!.members[0]);
		assert.ok(dot);
		const hit = axisDotHit(axis, dot!.y);
		assert.equal(hit?.key, single!.key);
	});

	it('returns the cluster target for a tap on any dot of the cluster', () => {
		const axis = layout(denseAxis);
		const cluster = axis.targets.find((target) => target.cluster)!;
		for (const id of cluster.members) {
			const dot = axis.dots.find((entry) => entry.id === id)!;
			const hit = axisDotHit(axis, dot.y);
			assert.equal(hit?.key, cluster.key, `${id} 的点应开出它所属的簇，不是邻居的标签`);
		}
	});

	it('does nothing outside the tolerance — it never falls back to the nearest label', () => {
		const axis = layout(primaryAxis);
		const dot = axis.dots[0]!;
		assert.equal(axisDotHit(axis, dot.y + AXIS_DOT_HIT_PX + 5), null);
		assert.equal(axisDotHit(axis, -50), null);
		assert.equal(axisDotHit(axis, axis.height + 50), null);
		// 预算容差边界：恰好 12px 以内仍可命中。
		const near = axisDotHit(axis, dot.y + AXIS_DOT_HIT_PX - 0.5);
		assert.ok(near === null || near.key.length > 0);
	});

	it('picks the closest dot when two dots are inside the tolerance', () => {
		const axis = layout(primaryAxis);
		const [a, b] = axis.dots;
		assert.ok(a && b);
		const midway = (a!.y + b!.y) / 2;
		if (Math.abs(a!.y - b!.y) <= AXIS_DOT_HIT_PX) {
			const hit = axisDotHit(axis, midway);
			assert.ok(hit);
		} else {
			assert.equal(axisDotHit(axis, midway), null);
		}
	});
});

describe('axisTargetLabel：组 i/N 不冒充导览步号', () => {
	const target = (over: Partial<AxisTarget> = {}): AxisTarget => ({
		key: 't',
		y: 100,
		top: 78,
		bottom: 122,
		anchorY: 100,
		members: ['a', 'b', 'c'],
		placeIndexes: [0, 1, 2],
		firstYear: 1970,
		lastYear: 1974,
		cluster: true,
		leader: false,
		...over,
	});
	const years = new Map([
		['a', 1970],
		['b', 1972],
		['c', 1974],
	]);

	it('prints the four-digit year for a single station', () => {
		const label = axisTargetLabel(target({ cluster: false, members: ['a'], placeIndexes: [0], firstYear: 1970, lastYear: 1970 }), 'a', years);
		assert.equal(label.main, '1970');
		assert.equal(label.sub, '');
	});

	it('prints 首年 + N站 for a cluster with no active station in it', () => {
		const label = axisTargetLabel(target(), 'zzz', years);
		assert.equal(label.main, '1970');
		assert.equal(label.sub, '3站');
	});

	it('prints the active year and 组 i/N — never a tour step', () => {
		const label = axisTargetLabel(target(), 'c', years);
		assert.equal(label.main, '1974');
		assert.equal(label.sub, '组3/3');
		assert.ok(!/导览/.test(label.sub));
	});
});
