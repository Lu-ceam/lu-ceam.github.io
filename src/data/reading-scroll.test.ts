import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { DWELL_START, PLATE_END, ZOOM_END, stageVisual } from './split-stage.ts';
import { canLatchReading, readingScrollOnly, runwayParked, runwayProgress } from './reading-scroll.ts';

const here = dirname(fileURLToPath(import.meta.url));

const parkedPhone = {
	narrow: true,
	local: 0.82,
	joint: 0,
	notesOpacity: 1,
	placeKey: '390x844',
	viewportKey: '390x844',
	paneSettled: true,
	frameIndex: 1,
	latchedIndex: 1,
	latchedKey: '390x844',
	hasMetrics: true,
};

describe('parked runway', () => {
	it('parks only in the dwell, and never across a joint', () => {
		assert.equal(runwayParked(0, 0), false);
		assert.equal(runwayParked(ZOOM_END, 0), false);
		assert.equal(runwayParked(PLATE_END, 0), false);
		assert.equal(runwayParked((PLATE_END + DWELL_START) / 2, 0), false);
		assert.equal(runwayParked(DWELL_START - 1e-6, 0), false);
		assert.equal(runwayParked(DWELL_START, 0), true);
		assert.equal(runwayParked(0.82, 0), true);
		assert.equal(runwayParked(1, 0), true);
		assert.equal(runwayParked(1, 0.01), false);
		assert.equal(runwayParked(DWELL_START, 1), false);
		assert.deepEqual(stageVisual(0.82, true), stageVisual(DWELL_START, true));
		assert.deepEqual(stageVisual(1, false), stageVisual(DWELL_START, false));
	});

	it('recovers progress from a cached runway without measuring', () => {
		assert.equal(runwayProgress(80, 80, 1000), 0);
		assert.equal(runwayProgress(580, 80, 1000), 0.5);
		assert.equal(runwayProgress(1080, 80, 1000), 1);
		assert.equal(runwayProgress(0, 80, 1000), 0);
		assert.equal(runwayProgress(4000, 80, 1000), 1);
		assert.equal(runwayProgress(80, 80, 0), 1);
		assert.equal(runwayProgress(80, 80, -10), 1);
	});
});

describe('phone reading scroll', () => {
	it('skips callout work only after this parked phone frame has been painted', () => {
		assert.equal(readingScrollOnly(parkedPhone), true);
		assert.equal(readingScrollOnly({ ...parkedPhone, narrow: false }), false);
		assert.equal(readingScrollOnly({ ...parkedPhone, local: ZOOM_END }), false);
		assert.equal(readingScrollOnly({ ...parkedPhone, local: DWELL_START - 0.01 }), false);
		assert.equal(readingScrollOnly({ ...parkedPhone, joint: 0.4 }), false);
		assert.equal(readingScrollOnly({ ...parkedPhone, latchedIndex: null }), false);
		assert.equal(readingScrollOnly({ ...parkedPhone, latchedIndex: 0 }), false);
		assert.equal(readingScrollOnly({ ...parkedPhone, latchedKey: '390x700' }), false);
		assert.equal(readingScrollOnly({ ...parkedPhone, placeKey: null }), false);
		assert.equal(readingScrollOnly({ ...parkedPhone, placeKey: 'old' }), false);
		assert.equal(readingScrollOnly({ ...parkedPhone, paneSettled: false }), false);
		assert.equal(readingScrollOnly({ ...parkedPhone, hasMetrics: false }), false);
		assert.equal(readingScrollOnly({ ...parkedPhone, notesOpacity: 0, placeKey: null, paneSettled: false }), true);
		assert.equal(canLatchReading({ ...parkedPhone, notesOpacity: 0, placeKey: null, paneSettled: false }), true);
		assert.equal(canLatchReading({ ...parkedPhone, paneSettled: false }), false);
		assert.equal(canLatchReading({ ...parkedPhone, narrow: false }), false);
		assert.equal(canLatchReading({ ...parkedPhone, local: 0.2 }), false);
	});

	it('returns from applyAll before geometry, callouts, and collapse while still pacing the column', () => {
		const astro = readFileSync(join(here, '../pages/records/[id].astro'), 'utf8');
		const pace = astro.slice(astro.indexOf('const paceParkedReading'), astro.indexOf('const applyCollapse'));
		const applyAll = astro.slice(astro.indexOf('const applyAll'), astro.indexOf('const onScroll'));
		assert.match(pace, /isNarrow\(\)/);
		assert.match(pace, /readingScrollOnly\(/);
		assert.match(pace, /readTrackOffset\(/);
		assert.match(pace, /!isNarrow\(\)/);
		assert.match(pace, /runwayProgress\(/);
		assert.equal(pace.includes('getBoundingClientRect'), false);
		assert.equal(pace.includes('offsetHeight'), false);
		assert.equal(pace.includes('position('), false);
		assert.equal(pace.includes('applyFrame('), false);
		assert.equal(pace.includes('collapseToContent'), false);
		assert.match(applyAll, /if \(paceParkedReading\(\)\) return;/);
		const gate = applyAll.indexOf('paceParkedReading()');
		assert.ok(gate >= 0);
		assert.ok(gate < applyAll.indexOf('geometry()'));
		assert.ok(applyAll.indexOf('geometry()') < applyAll.indexOf('position(frame)'));
		assert.ok(applyAll.indexOf('position(frame)') < applyAll.indexOf('applyFrame('));
		assert.match(applyAll, /applyCollapse\(/);
		assert.match(applyAll, /canLatchReading\(/);
		assert.match(astro, /shouldSettleRunway\(/);
		assert.match(astro, /nearestSettlePlace\(/);
		assert.match(astro, /collapseVisual\(/);
		assert.match(astro, /COLLAPSE_SVH/);
		const collapse = astro.slice(astro.indexOf('function collapseToContent'), astro.indexOf('function matchPlateFrame'));
		assert.equal(collapse.includes('readingScrollOnly'), false);
		assert.equal(collapse.includes('paceParkedReading'), false);
	});
});
