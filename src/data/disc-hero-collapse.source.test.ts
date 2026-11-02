import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
	DISC_SETTLED_COVER_MIN_PX,
	DISC_SETTLED_H_PX,
	DISC_SETTLED_PAD_Y_PX,
	SETTLED_COLLAPSE_T,
	THUMB_HEIGHT_PX,
	settledBarHeightPx,
	settledBarOn,
	settledCoverBoxPx,
	settledCoverSlotPx,
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
		// The bar pays for its own padding: two lines of meta do not have to touch the border.
		assert.equal(settledBarHeightPx(72, 56, DISC_SETTLED_PAD_Y_PX), 88);
		assert.equal(settledBarHeightPx(80, 56, DISC_SETTLED_PAD_Y_PX), 96);
		// A cover taller than the text column sets the height too.
		assert.equal(settledBarHeightPx(10, 120, DISC_SETTLED_PAD_Y_PX), 136);
	});

	it('contains a wide cover in the bar slot instead of letting it run under the title', () => {
		// 375: slot = clamp(56, 112.5, 112) — the FALP 381 wide plate (aspect ≈ 3.23) goes flat.
		assert.equal(settledCoverSlotPx(375), 112);
		assert.equal(settledCoverSlotPx(320), 96);
		assert.equal(settledCoverSlotPx(240), 72);
		assert.equal(settledCoverSlotPx(120), DISC_SETTLED_COVER_MIN_PX);
		const wide = settledCoverBoxPx(470, 146, 375);
		assert.equal(Math.round(wide.w), 112);
		assert.ok(wide.h < DISC_SETTLED_COVER_MIN_PX);
		// A square plate keeps the 56px thumb box; a portrait one stays narrower still.
		const square = settledCoverBoxPx(300, 300, 375);
		assert.deepEqual(square, { w: 56, h: 56 });
		const portrait = settledCoverBoxPx(300, 400, 375);
		assert.ok(portrait.w < DISC_SETTLED_COVER_MIN_PX);
		assert.equal(Math.round(portrait.h), 56);
	});

	it('keeps the title column right of the cover column on 375 and 320', () => {
		const padX = 0.75 * 16;
		const gap = 0.65 * 16;
		const padY = DISC_SETTLED_PAD_Y_PX;
		const plates = [
			['FALP 381', 470, 146],
			['MAR 572', 300, 300],
		] as const;
		for (const vw of [375, 320]) {
			for (const [label, naturalW, naturalH] of plates) {
				const box = settledCoverBoxPx(naturalW, naturalH, vw);
				const coverRight = padX + Math.round(box.w);
				const textLeft = coverRight + gap;
				// The assertion the live frame would make: no part of the title may sit on the cover.
				assert.ok(textLeft >= coverRight + gap - 1, `${label} @ ${vw}: title over the cover`);
				assert.ok(vw - textLeft - padX >= 120, `${label} @ ${vw}: text column too thin`);
				// Two lines of h1 + two lines of meta still fit under the 88px token.
				assert.ok(settledBarHeightPx(62, box.h, padY) >= DISC_SETTLED_H_PX);
				// The cover is centred in the bar, never hung over the bottom edge.
				const barH = settledBarHeightPx(62, box.h, padY);
				assert.ok(box.h + 2 * padY <= barH);
			}
		}
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
		// Two real columns: the cover slot, then the text column. Nothing is guessed.
		assert.match(block, /\.split-settled-bar \{[^}]*display: grid;/s);
		assert.match(
			block,
			/\.split-settled-bar \{[^}]*grid-template-columns: var\(--disc-settled-cover-w\) minmax\(0, 1fr\);/s,
		);
		assert.match(block, /\.split-settled-bar \{[^}]*column-gap: var\(--disc-settled-gap\);/s);
		assert.match(block, /\.split-settled-bar \{[^}]*align-items: center;/s);
		assert.match(block, /\.split-settled-bar \{[^}]*grid-area: 1 \/ 1;/s);
		assert.match(
			block,
			/\.split-settled-bar \{[^}]*padding: var\(--disc-settled-pad-y\) var\(--disc-settled-pad-x\);/s,
		);
		// The thumb-width guess is gone: it only ever fitted a square 64px cover.
		assert.equal(css.includes('calc(var(--disc-settled-pad-x) + var(--thumb-h)'), false);
		assert.match(block, /\.split-settled-bar::before \{[^}]*width: var\(--disc-settled-cover-w\);/s);
		assert.match(block, /\.split-settled-bar \.record-tombstone \{[^}]*grid-column: 2;/s);
		assert.match(block, /\.split-settled-bar \.record-tombstone \{[^}]*min-width: 0;/s);
		assert.match(block, /\.record-tombstone h1 \{[^}]*-webkit-line-clamp: 2/s);
		// Meta wraps to at most two lines instead of one nowrap line under the cover.
		assert.match(block, /\.record-tombstone-meta \{[^}]*-webkit-line-clamp: 2/s);
		assert.match(block, /\.record-tombstone-meta \{[^}]*overflow: hidden;/s);
		assert.equal(block.includes('white-space: nowrap'), false);
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
		assert.match(place, /const slotW = Math\.round\(settledCoverSlot\(\)\.w\);/);
		assert.match(place, /const boxW = aloneW \+ \(slotW - aloneW\) \* u;/);
		assert.match(place, /plateFrame\.style\.top = `\$\{\(barH - boxH\) \/ 2\}px`/);
		assert.match(place, /matchPlateFrame\(cover\)/);
		const measure = astro.slice(astro.indexOf('const applySettledHeight'), astro.indexOf('const enterSettledReading'));
		// The cover width is written first: it decides the text column the title wraps in.
		assert.ok(measure.indexOf('--disc-settled-cover-w') < measure.indexOf('scrollHeight'));
		assert.match(measure, /settledBarHeightPx\(settledBar\?\.scrollHeight \?\? 0, slot\.h, 0\.5 \* remPx\(\)\)/);
		assert.match(measure, /const syncSettledBar = \(\): number => \{/);
		assert.match(measure, /placeThumbCover\(barH, 1\)/);
		// Bar height and cover box always come from the same number.
		assert.match(astro, /const barH = applySettledHeight\(\);\s*placeThumbCover\(barH, 1\);/);
		assert.match(astro, /syncSettledBar\(\);/);
		assert.match(astro, /barBox\.observe\(settledBar\)/);
		assert.match(astro, /if \(settledSlot\) barBox\.observe\(settledSlot\)/);
	});
});
