import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
	COLLAPSE_SVH,
	JOINT_SVH,
	PASS_SVH,
	SETTLED_COLLAPSE_T,
	collapseVisual,
	nearestSettlePlace,
	placeOnRunway,
	settledBarOn,
} from './split-stage.ts';

const here = dirname(fileURLToPath(import.meta.url));
const astro = readFileSync(join(here, '../pages/records/[id].astro'), 'utf8');

function enterBlock(): string {
	const start = astro.indexOf('const enterSettledReading = (): void => {');
	assert.ok(start > 0, 'enterSettledReading is gone');
	return astro.slice(start, astro.indexOf('const exitSettledReading'));
}

function settleBlock(): string {
	const start = astro.indexOf('const settleToKeypoint = () => {');
	assert.ok(start > 0, 'settleToKeypoint is gone');
	return astro.slice(start, astro.indexOf('// Integer scroll can round the same boundary'));
}

describe('settled scroll pin', () => {
	it('cancels the in-flight smooth before the runway flow height falls', () => {
		const enter = enterBlock();
		const clear = enter.indexOf('window.clearTimeout(idleTimer)');
		const unlock = enter.indexOf('settling = false');
		const cancel = enter.indexOf("window.scrollTo({ top: window.scrollY, behavior: 'auto' })");
		const phase = enter.indexOf("page.dataset.phase = 'reading'");
		const pin = enter.indexOf("window.scrollTo({ top: settledTopPx, behavior: 'auto' })");
		assert.ok(clear > 0 && unlock > 0 && cancel > 0 && phase > 0 && pin > 0);
		// Order is the fix: kill the timer, drop the settle lock, abort in place, then collapse.
		assert.ok(clear < unlock && unlock < cancel && cancel < phase);
		assert.ok(phase < pin);
		// Nothing may run before the cancel.
		assert.ok(enter.indexOf('if (page.dataset.phase === \'reading\') return;') < clear);
	});

	it('re-pins the column once the scroll comes to rest', () => {
		const enter = enterBlock();
		assert.match(enter, /repinGuardUntil = performance\.now\(\) \+ SETTLE_LOCK_MS/);
		assert.match(enter, /requestAnimationFrame\(\(\) => requestAnimationFrame\(repinSettledPin\)\)/);
		assert.match(astro, /addEventListener\('scrollend', repinSettledPin/);
		assert.match(astro, /repinSettledPin\(\);/);
		assert.match(astro, /window\.scrollY <= settledTopPx \+ window\.innerHeight/);
		// A bounded guard, so the reader owns the scroll again once the bar has settled.
		assert.match(astro, /if \(performance\.now\(\) > repinGuardUntil\) return;/);
		assert.match(astro, /window\.scrollTo\(\{ top: settledTopPx, behavior: 'auto' \}\);/g);
	});

	it('never smooth-scrolls the tall runway once the bar owns the scroll', () => {
		const settle = settleBlock();
		const reading = settle.indexOf("if (page.dataset.phase === 'reading') return;");
		const snap = settle.indexOf('enterSettledReading();');
		const smooth = settle.indexOf("behavior: 'smooth'");
		assert.ok(reading > 0 && snap > 0 && smooth > 0);
		assert.ok(reading < smooth);
		assert.ok(snap < smooth);
		// The collapse travel height (55svh) is not a progress: asking the bar about it says "on"
		// at every keypoint. Only the place the reader is actually at may open the bar.
		assert.match(settle, /settledBarOn\(collapseVisual\(placeNow\.collapse\)\.thumbT, placeNow\.collapse\)/);
		assert.doesNotMatch(settle, /settledBarOn\(collapseVisual\(collapse\)\.thumbT, collapse\)/);
		assert.match(settle, /settledBarOn\(collapseVisual\(target\.collapse\)\.thumbT, target\.collapse\)/);
		assert.match(settle, /placeNow\.collapse >= SETTLED_COLLAPSE_T/);
	});

	it('keeps the bar shut when an idle settle lands before the collapse segment', () => {
		const detailCount = 2;
		const notes = [true, true];
		const total = detailCount * PASS_SVH + (detailCount - 1) * JOINT_SVH + COLLAPSE_SVH;
		// Any keypoint of any pass (and of the joint between them) on a narrow screen.
		const rests = [0, 0.2, 0.5, 0.9, 1];
		for (const [index, local] of [
			[0, 0],
			[0, 0.5],
			[1, 0],
			[1, 1],
		] as const) {
			const above = index * (PASS_SVH + JOINT_SVH) + local * PASS_SVH;
			const p = above / total;
			const place = placeOnRunway(p, detailCount, COLLAPSE_SVH);
			assert.equal(place.collapse, 0);
			// The bug: collapseVisual(COLLAPSE_SVH) clamps to 1, so the bar looked on everywhere.
			assert.equal(settledBarOn(collapseVisual(COLLAPSE_SVH).thumbT, COLLAPSE_SVH), true);
			// The fix: the bar is off at the collapse the reader is really at, and so is the target.
			assert.equal(settledBarOn(collapseVisual(place.collapse).thumbT, place.collapse), false);
			assert.ok(place.collapse < SETTLED_COLLAPSE_T);
			const target = nearestSettlePlace(p, detailCount, notes, COLLAPSE_SVH);
			assert.equal(target.collapse, 0);
			assert.equal(settledBarOn(collapseVisual(target.collapse).thumbT, target.collapse), false);
		}
		// Same window, sampled through the rests array so every pass local is covered.
		for (const local of rests) {
			const p = local * (PASS_SVH / total);
			const place = placeOnRunway(p, detailCount, COLLAPSE_SVH);
			assert.equal(settledBarOn(collapseVisual(place.collapse).thumbT, place.collapse), false);
		}
	});

	it('turns the idle collapse keypoint into the bar, not a tall-runway Y', () => {
		const detailCount = 2;
		const notes = [true, true];
		const total = detailCount * PASS_SVH + (detailCount - 1) * JOINT_SVH + COLLAPSE_SVH;
		const abovePasses = detailCount * PASS_SVH + (detailCount - 1) * JOINT_SVH;
		// The bar itself snaps in a touch earlier than SETTLED_COLLAPSE_T: once thumbT hits it.
		for (const rest of [0.725, 0.75, 0.8, 0.85]) {
			const p = (abovePasses + rest * COLLAPSE_SVH) / total;
			const place = placeOnRunway(p, detailCount, COLLAPSE_SVH);
			// The bar is not up yet at these positions: that is the window the bug lived in.
			assert.equal(settledBarOn(collapseVisual(rest).thumbT, place.collapse), false);
			const target = nearestSettlePlace(p, detailCount, notes, COLLAPSE_SVH);
			assert.equal(target.collapse, 1);
			assert.equal(settledBarOn(collapseVisual(target.collapse).thumbT, target.collapse), true);
		}
		assert.equal(SETTLED_COLLAPSE_T, 0.9);
	});
});
