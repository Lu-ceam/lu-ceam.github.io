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

function repinBlock(): string {
	const start = astro.indexOf('const repinSettledPin = (): void => {');
	assert.ok(start > 0, 'repinSettledPin is gone');
	return astro.slice(start, astro.indexOf('// Re-entrant pin'));
}

function sourceNumber(name: string): number {
	const found = new RegExp(`${name} = (\\d+)`).exec(astro);
	assert.ok(found, `${name} is gone`);
	return Number(found[1]);
}

const SETTLED_PIN_SLACK_PX_SRC = sourceNumber('SETTLED_PIN_SLACK_PX');
const SETTLED_PIN_GUARD_MS_SRC = sourceNumber('SETTLED_PIN_GUARD_MS');

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
		// Nothing may run before the reentrant guard hands over to the cancel.
		assert.ok(enter.indexOf("if (page.dataset.phase === 'reading') {") < clear);
	});

	it('re-pins the column once the scroll comes to rest', () => {
		const enter = enterBlock();
		assert.match(enter, /armSettledPin\(\);/);
		assert.match(enter, /requestAnimationFrame\(\(\) => requestAnimationFrame\(repinSettledPin\)\)/);
		assert.match(astro, /addEventListener\('scrollend', repinSettledPin/);
		assert.match(astro, /repinSettledPin\(\);/);
		assert.match(astro, /window\.scrollTo\(\{ top: settledTopPx, behavior: 'auto' \}\);/g);
	});

	it('pins against a small slack, never a whole screen of drift', () => {
		const repin = repinBlock();
		// The old bound (`settledTopPx + window.innerHeight`) let the entire body scroll away
		// under a bar that stayed "settled": a 2 × wheel 4000 left the traj map on the first screen.
		assert.doesNotMatch(astro, /settledTopPx \+ window\.innerHeight/);
		assert.match(repin, /window\.scrollY <= settledTopPx \+ SETTLED_PIN_SLACK_PX/);
		assert.ok(
			SETTLED_PIN_SLACK_PX_SRC > 0 && SETTLED_PIN_SLACK_PX_SRC <= 48,
			`slack ${SETTLED_PIN_SLACK_PX_SRC}px must stay tight (<= 48px)`,
		);
		// The guard itself is still bounded, so the reader gets the scroll back.
		assert.match(repin, /if \(now > repinGuardUntil\) return;/);
	});

	it('renews the guard while the burst keeps overshooting', () => {
		const repin = repinBlock();
		// Every scroll / scrollend that is still past the slack re-pins and extends the window.
		assert.match(repin, /repinGuardUntil = Math\.min\(repinGuardCeiling, now \+ SETTLED_PIN_GUARD_MS\)/);
		assert.ok(
			SETTLED_PIN_GUARD_MS_SRC >= 2000 && SETTLED_PIN_GUARD_MS_SRC <= 3000,
			`guard window ${SETTLED_PIN_GUARD_MS_SRC}ms must be 2-3s`,
		);
		// A finger on the glass is the reader: an explicit gesture ends the guard at once.
		assert.match(repin, /if \(pointerDown\) \{/);
		assert.match(repin, /repinGuardUntil = 0;/);
		// Per-pin arming sets both the window and the ceiling, and the ceiling caps renewal.
		const arm = astro.slice(astro.indexOf('const armSettledPin = '), astro.indexOf('const repinSettledPin = '));
		assert.match(arm, /repinGuardCeiling = now \+ SETTLED_PIN_GUARD_MAX_MS/);
		assert.match(arm, /repinGuardUntil = now \+ SETTLED_PIN_GUARD_MS/);
	});

	it('re-enters the pin instead of returning while already reading', () => {
		const enter = enterBlock();
		// No bare return on `reading`: the reentrant path would drop the re-pin entirely.
		assert.doesNotMatch(enter, /if \(page\.dataset\.phase === 'reading'\) return;/);
		const guard = enter.indexOf("if (page.dataset.phase === 'reading') {");
		const call = enter.indexOf('ensureSettledPin();');
		const clear = enter.indexOf('window.clearTimeout(idleTimer)');
		assert.ok(guard > 0 && call > guard && clear > call);
		const ensure = astro.slice(astro.indexOf('const ensureSettledPin = '), astro.indexOf('// Column one of the bar'));
		assert.match(ensure, /window\.clearTimeout\(idleTimer\)/);
		assert.match(ensure, /settling = false/);
		assert.match(ensure, /settledTopPx = runway\.getBoundingClientRect\(\)\.top \+ window\.scrollY/);
		assert.match(ensure, /window\.scrollTo\(\{ top: settledTopPx, behavior: 'auto' \}\)/);
		// Renewed, but bounded by the ceiling the pin set: re-entry may not fight the reader.
		assert.match(ensure, /repinGuardUntil = Math\.min\(repinGuardCeiling, now \+ SETTLED_PIN_GUARD_MS\)/);
		assert.match(ensure, /if \(now > repinGuardCeiling\) return;/);
		assert.doesNotMatch(ensure, /armSettledPin\(\)/);
		assert.match(ensure, /requestAnimationFrame\(\(\) => requestAnimationFrame\(repinSettledPin\)\)/);
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
