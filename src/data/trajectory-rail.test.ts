import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
	RAIL_MIN_PX_PER_YEAR,
	RAIL_MIN_SPAN_YEARS,
	railLayout,
} from './trajectory-rail.ts';

const FALP = [1770, 1822, 1876, 1886, 1951, 1956];
const EXTREME = [1700, 1721, 1750, 1960, 1962, 1963, 1965, 1967, 1970, 1975, 1980];
const SHORT = [1974, 1974, 1974, 1975];

function near(actual: number, expected: number, tol = 2): void {
	assert.ok(
		Math.abs(actual - expected) <= tol,
		`${actual} is not within ${tol} of ${expected}`,
	);
}

function nearList(actual: readonly number[], expected: readonly number[], tol = 2): void {
	assert.equal(actual.length, expected.length);
	actual.forEach((value, index) => near(value, expected[index]!, tol));
}

describe('railLayout', () => {
	it('places falp381 on a 343px phone without scrolling', () => {
		const layout = railLayout(FALP, {
			width: 343,
			gap: 32,
			pad: 16,
			kMin: RAIL_MIN_PX_PER_YEAR,
			minSpan: RAIL_MIN_SPAN_YEARS,
		});
		nearList(layout.xs, [16, 91, 169, 201, 295, 327]);
		near(layout.k, 1.44, 0.02);
		assert.equal(layout.scroll, false);
		assert.equal(layout.width, 343);
		assert.deepEqual(layout.order, [0, 1, 2, 3, 4, 5]);
		// 1876→1886 and 1951→1956 sit on the 32px minimum gap.
		near(layout.xs[3]! - layout.xs[2]!, 32, 0.01);
		near(layout.xs[5]! - layout.xs[4]!, 32, 0.01);
		// 1770→1822 and 1886→1951 stay visibly longer than a decade.
		assert.ok(layout.xs[1]! - layout.xs[0]! > 70);
		assert.ok(layout.xs[4]! - layout.xs[3]! > 90);
		const labels = layout.ticks.filter((tick) => tick.label).map((tick) => tick.label);
		assert.deepEqual(labels, ['1800', '1900']);
		assert.equal(layout.ticks.some((tick) => tick.year === 1810), false);
		assert.equal(layout.ticks.some((tick) => tick.year === 1775), true);
		const century = layout.ticks.find((tick) => tick.year === 1800);
		assert.ok(century);
		assert.ok(century.x > layout.xs[0]! && century.x < layout.xs[1]!);
	});

	it('places falp381 on a 760px column with decade ticks', () => {
		const layout = railLayout(FALP, {
			width: 760,
			gap: 40,
			pad: 24,
			kMin: RAIL_MIN_PX_PER_YEAR,
			minSpan: RAIL_MIN_SPAN_YEARS,
		});
		nearList(layout.xs, [24, 216, 416, 456, 696, 736]);
		near(layout.k, 3.7, 0.02);
		assert.equal(layout.scroll, false);
		assert.equal(layout.width, 760);
		near(layout.xs[3]! - layout.xs[2]!, 40, 0.01);
		near(layout.xs[5]! - layout.xs[4]!, 40, 0.01);
		assert.equal(layout.ticks.some((tick) => tick.year === 1810 && !tick.label), true);
		const labels = layout.ticks.filter((tick) => tick.label).map((tick) => tick.label);
		assert.deepEqual(labels, ['1800', '1900']);
	});

	it('scrolls an 11-station 1700–1980 axis at kMin on a phone', () => {
		const layout = railLayout(EXTREME, {
			width: 343,
			gap: 32,
			pad: 16,
			kMin: RAIL_MIN_PX_PER_YEAR,
			minSpan: RAIL_MIN_SPAN_YEARS,
		});
		assert.equal(layout.k, RAIL_MIN_PX_PER_YEAR);
		assert.equal(layout.scroll, true);
		assert.equal(layout.xs.length, 11);
		near(layout.width, 488, 0.01);
		nearList(layout.xs, [16, 48, 80, 248, 280, 312, 344, 376, 408, 440, 472], 0.01);
		const labeled = layout.ticks.filter((tick) => tick.label);
		assert.deepEqual(
			labeled.map((tick) => tick.year),
			[1700, 1800, 1900],
		);
		const century = layout.ticks.find((tick) => tick.year === 1800);
		near(century?.x ?? -1, 120, 0.01);
		assert.equal(layout.ticks.some((tick) => tick.year % 50 !== 0), false);
	});

	it('centers p1357e and writes 1974 once', () => {
		const layout = railLayout(SHORT, {
			width: 343,
			gap: 32,
			pad: 16,
			kMin: RAIL_MIN_PX_PER_YEAR,
			minSpan: RAIL_MIN_SPAN_YEARS,
		});
		assert.equal(layout.scroll, false);
		assert.equal(layout.width, 343);
		nearList(layout.xs, [123.5, 155.5, 187.5, 219.5], 0.01);
		near((layout.xs[0]! + layout.xs[3]!) / 2, 343 / 2, 0.01);
		assert.equal(layout.ticks.length, 0);
		const shown = layout.order.filter((index, position, order) => {
			const prev = order[position - 1];
			return prev === undefined || SHORT[prev] !== SHORT[index];
		});
		assert.deepEqual(
			shown.map((index) => SHORT[index]),
			[1974, 1975],
		);
		assert.equal(shown.filter((index) => SHORT[index] === 1974).length, 1);
	});

	it('keeps same-year places in input order when the years arrive unsorted', () => {
		const years = [1975, 1974, 1974];
		const layout = railLayout(years, {
			width: 343,
			gap: 32,
			pad: 16,
			kMin: RAIL_MIN_PX_PER_YEAR,
			minSpan: RAIL_MIN_SPAN_YEARS,
		});
		assert.deepEqual(layout.order, [1, 2, 0]);
		assert.ok(layout.xs[1]! < layout.xs[2]!);
		assert.ok(layout.xs[2]! < layout.xs[0]!);
		const shown = layout.order.filter((index, position, order) => {
			const prev = order[position - 1];
			return prev === undefined || years[prev] !== years[index];
		});
		assert.deepEqual(shown, [1, 0]);
	});
});
