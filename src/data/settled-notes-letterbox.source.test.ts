import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const reader = readFileSync(join(here, './disc-chapter-reader.ts'), 'utf8');
const css = readFileSync(join(here, '../styles/global.css'), 'utf8');
const astro = readFileSync(join(here, '../pages/records/[id].astro'), 'utf8');
const band = readFileSync(join(here, './settled-band-notes.ts'), 'utf8');
const template = astro.slice(0, astro.indexOf('<script>'));
const coverBlock = template.slice(
	template.indexOf("chapter.mode === 'cover-scroll'"),
	template.indexOf("chapter.mode === 'scroll' &&"),
);

describe('settled 注文 letterbox 源闸', () => {
	it('wires settled-band-notes into the chapter reader with bandReserve', () => {
		assert.match(reader, /from '\.\/settled-band-notes\.ts'/);
		assert.match(reader, /bandReservePx\(/);
		assert.match(reader, /placeBandNotes\(/);
		assert.match(reader, /bandLeaderPoints\(/);
		assert.match(reader, /bandReservePx:\s*reserve/);
		assert.match(band, /LETTERBOX_BAND_RESERVE_REM/);
		assert.match(band, /NOTE_CAP_REM/);
	});

	it('keeps .disc-record-marks off the plate 46% cover-card path', () => {
		const marksCss = css.slice(css.indexOf('.disc-record-marks {'));
		const rule = marksCss.slice(0, marksCss.indexOf('.disc-record-mark-index'));
		assert.doesNotMatch(rule, /max-width:\s*46%/);
		assert.match(rule, /data-band='placed'/);
		assert.match(css, /containing block 是 cover-frame/);
	});

	it('hosts .disc-record-marks on the cover-frame, not inside the plate', () => {
		const plateAt = coverBlock.indexOf('class="disc-record-plate"');
		const marksAt = coverBlock.indexOf('class="disc-record-marks"');
		assert.ok(plateAt >= 0 && marksAt > plateAt);
		const between = coverBlock.slice(plateAt, marksAt);
		// plate closes before marks open
		assert.match(between, /<\/div>/);
		assert.match(coverBlock, /data-seat-center=\{seat\.center\}/);
		assert.match(coverBlock, /data-mark-x=\{mark\.x\}/);
		// notes are looked up on the face, not only under plate
		assert.match(reader, /el\.querySelector<HTMLElement>\('\.disc-record-marks'\)/);
		assert.doesNotMatch(
			reader,
			/plate\?\.querySelector<HTMLElement>\('\.disc-record-marks'\)/,
		);
	});

	it('does not regress #173 overlay lift or #172 scrub hooks', () => {
		assert.match(reader, /\[\s*face\.overlay,\s*paint\.calloutOpacity/);
		assert.match(reader, /coverRunwayProgress\(/);
		assert.equal(reader.includes('coverCropProgress'), false);
		assert.equal(reader.includes('recordPlayback'), false);
	});
});

describe('settled 注文 stack 源闸', () => {
	it('routes narrow bands through bandLayoutFor and marks data-band=stack', () => {
		assert.match(reader, /bandLayoutFor\(/);
		assert.match(reader, /bandStackReservePx\(/);
		assert.match(reader, /bandStackWidthPx\(/);
		assert.match(reader, /bandReservePxY:/);
		assert.match(reader, /notes\.dataset\.band = layout === 'stack' \? 'stack' : 'placed'/);
		assert.match(reader, /li\.dataset\.side = place\.side/);
	});

	it('keeps latin words whole: no break-all, keep-all normal wrap', () => {
		const marksCss = css.slice(css.indexOf('.disc-record-marks {'));
		const rule = marksCss.slice(0, marksCss.indexOf('.disc-record-mark-index'));
		assert.equal(/word-break:\s*break-all/.test(css), false, '禁 break-all：那会一字一折');
		assert.match(rule, /overflow-wrap:\s*normal/);
		assert.match(rule, /data-band='stack'/);
	});
});
