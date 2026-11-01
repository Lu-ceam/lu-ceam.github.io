import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
	DISC_SETTLED_H_PX,
	SETTLED_COLLAPSE_T,
	THUMB_HEIGHT_PX,
	settledBarHeightPx,
	settledBarOn,
} from './split-stage.ts';

const here = dirname(fileURLToPath(import.meta.url));
const astro = readFileSync(join(here, '../pages/records/[id].astro'), 'utf8');
const css = readFileSync(join(here, '../styles/global.css'), 'utf8');
const template = astro.slice(0, astro.indexOf('<script>'));

/** The narrow block that owns the settled bar. */
function narrowReadingCss(): string {
	const start = css.indexOf(".record-page--split[data-phase='reading'] .camera-runway");
	assert.ok(start > 0, 'the settled bar is not wired in global.css');
	return css.slice(start, css.indexOf('@media (max-width: 47.99rem) {\n\t.record-page--split .split-frame[data-callouts'));
}

describe('settled bar threshold', () => {
	it('snaps the bar in whole once the thumb has finished shrinking', () => {
		assert.equal(settledBarOn(0, 0), false);
		assert.equal(settledBarOn(0.4, 0.4), false);
		assert.equal(settledBarOn(SETTLED_COLLAPSE_T - 1e-6, 0), false);
		assert.equal(settledBarOn(SETTLED_COLLAPSE_T, 0), true);
		assert.equal(settledBarOn(1, 1), true);
		assert.equal(settledBarOn(0, SETTLED_COLLAPSE_T), true);
		// Never a chip drifting over half a screen: the switch is a threshold, not a lerp.
		assert.ok(SETTLED_COLLAPSE_T > 0.5 && SETTLED_COLLAPSE_T < 1);
	});

	it('keeps the bar at least one token row tall and grows for a wrapped title', () => {
		assert.equal(DISC_SETTLED_H_PX, 88);
		assert.ok(DISC_SETTLED_H_PX >= THUMB_HEIGHT_PX);
		assert.equal(settledBarHeightPx(0), DISC_SETTLED_H_PX);
		assert.equal(settledBarHeightPx(Number.NaN), DISC_SETTLED_H_PX);
		assert.equal(settledBarHeightPx(31.2), DISC_SETTLED_H_PX);
		assert.equal(settledBarHeightPx(102.5), 103);
	});
});

describe('settled bar css', () => {
	it('collapses the runway flow height and hangs the column right under the bar', () => {
		const block = narrowReadingCss();
		// The fixed bar is out of flow: the column pays for it with an equal padding-top.
		assert.match(block, /\[data-phase='reading'\] \.camera-runway \{\s*height: 0;/);
		assert.match(
			block,
			/\[data-phase='reading'\] \.split-read \{\s*margin-top: 0;\s*padding-top: var\(--disc-settled-h\);/,
		);
		assert.match(block, /\[data-phase='reading'\] \.split-imagery \{[^}]*height: var\(--disc-settled-h\)/s);
		assert.match(css, /--disc-settled-h: 88px/);
		assert.match(css, /--disc-settled-gap: 0\.65rem/);
		assert.match(css, /--disc-settled-pad-x: 0\.75rem/);
		// The old thumb-sized pad left the runways gap in place.
		assert.equal(css.includes('padding-top: var(--thumb-h)'), false);
	});

	it('draws the one h1 inside the bar instead of hanging it over the images', () => {
		const block = narrowReadingCss();
		assert.match(block, /\.split-settled-bar \{[^}]*display: flex;/s);
		assert.match(block, /\.split-settled-bar \{[^}]*grid-area: 1 \/ 1;/s);
		assert.match(
			block,
			/padding: 0 var\(--disc-settled-pad-x\) 0\s*\n?\s*calc\(var\(--disc-settled-pad-x\) \+ var\(--thumb-h\) \+ var\(--disc-settled-gap\)\)/,
		);
		assert.match(block, /\.split-settled-bar \.record-tombstone \{[^}]*flex: 1 1 auto;/s);
		assert.match(block, /\.record-tombstone h1 \{[^}]*-webkit-line-clamp: 2/s);
		assert.match(block, /\.record-tombstone-meta \{[^}]*text-overflow: ellipsis/s);
		// No negative-margin hang and no sticky escape out of the images' stacking.
		assert.equal(css.includes('calc(-1 * var(--disc-settled-h))'), false);
		assert.equal(block.includes('position: sticky'), false);
		assert.equal(block.includes('.split-read .record-tombstone'), false);
	});

	it('keeps exactly one heading and moves it into the bar slot', () => {
		// One visible title in the split stage — no clone, no aria-hidden copy, no second header.
		const splitStage = template.slice(template.indexOf('<div class="split-stage">'));
		assert.equal(splitStage.match(/<h1>/g)?.length, 1);
		assert.equal(splitStage.match(/class="record-tombstone"/g)?.length, 1);
		// The slot lives inside the fixed imagery, so the title paints on the bar itself.
		const imagery = splitStage.slice(splitStage.indexOf('<div class="split-imagery">'));
		const slot = imagery.indexOf('<div class="split-settled-bar">');
		assert.ok(slot > 0, 'the bar slot is missing from .split-imagery');
		assert.ok(slot < imagery.indexOf('<div class="split-read">'));
		// Script: the tombstone moves in on settle and comes back to the track on exit.
		assert.match(astro, /settledSlot\.append\(settledBar\)/);
		assert.match(astro, /settledHome\.prepend\(settledBar\)/);
		assert.match(astro, /const settledHome = settledBar\?\.parentElement \?\? null;/);
	});

	it('leaves the desktop two-column stage alone', () => {
		const desktop = css.slice(css.indexOf('@media (min-width: 48rem) {\n\t.record-page--split .split-stage'));
		const body = desktop.slice(0, desktop.indexOf('@media', 10));
		assert.doesNotMatch(body, /disc-settled/);
		assert.match(body, /\.split-imagery \{\s*height: 100svh;/);
	});
});

describe('settled bar wiring', () => {
	it('enters and leaves the bar from the collapse threshold and the mini cover', () => {
		assert.match(astro, /settledBarOn\(cv\.thumbT, place\.collapse\)/);
		assert.match(astro, /const enterSettledReading = \(\): void => \{/);
		assert.match(astro, /const exitSettledReading = \(\): void => \{/);
		assert.match(astro, /window\.scrollY < settledTopPx - SETTLED_EXIT_PX/);
		const click = astro.slice(astro.indexOf("page.querySelector('.split-imagery')?.addEventListener('click'"));
		assert.ok(click.indexOf('exitSettledReading()') < click.indexOf('runwayScrollY('));
		// Re-scanning the disc must not reuse a pose measured inside an 88px bar.
		const exit = astro.slice(astro.indexOf('const exitSettledReading'), astro.indexOf('const resyncSettledBar'));
		assert.match(exit, /poseKey\.delete\(frame\)/);
		assert.match(exit, /removeProperty\('--disc-settled-h'\)/);
	});

	it('keeps the mini cover and the bar height in one place', () => {
		const place = astro.slice(astro.indexOf('const placeThumbCover'), astro.indexOf('const applySettledHeight'));
		assert.match(place, /const thumbH = Math\.max\(8, THUMB_HEIGHT_PX - 8\)/);
		assert.match(place, /plateFrame\.style\.top = `\$\{\(barH - boxH\) \/ 2\}px`/);
		assert.match(place, /matchPlateFrame\(cover\)/);
		const measure = astro.slice(astro.indexOf('const applySettledHeight'), astro.indexOf('const enterSettledReading'));
		assert.match(measure, /settledBarHeightPx\(settledBar\?\.scrollHeight \?\? 0\)/);
		assert.match(astro, /barBox\.observe\(settledBar\)/);
	});
});
