import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const here = dirname(fileURLToPath(import.meta.url));

describe('margin-first page wiring', () => {
	it('measures once and hides a collapsed overflow sentence', () => {
		const astro = readFileSync(join(here, '../pages/records/[id].astro'), 'utf8');
		const css = readFileSync(join(here, '../styles/global.css'), 'utf8');
		const template = astro.slice(0, astro.indexOf('<script>'));
		const positionSplit = astro.slice(astro.indexOf('function positionSplit'), astro.indexOf('function settle'));
		assert.equal(template.includes('mark-hit'), false);
		assert.equal(template.includes('data-callouts'), false);
		assert.equal(positionSplit.includes('for (let pass = 0; pass < 2'), false);
		assert.match(positionSplit, /data-kind/);
		assert.match(positionSplit, /data-callouts', 'placed'/);
		assert.match(positionSplit, /narrow: isNarrow\(\)/);
		assert.equal(positionSplit.includes('plateBox('), false);
		assert.equal(positionSplit.includes('settledImageryHeight'), false);
		assert.match(
			css,
			/\.record-page--split \.split-frame\[data-callouts='placed'\] \.mark-list li\[data-kind='overflow'\]:not\(\[data-expanded='true'\]\) \.mark-note/,
		);
		assert.match(css, /max-width: 47\.99rem/);
		assert.match(css, /split-frame:not\(\[data-callouts='placed'\]\) \.mark-list li/);
		assert.equal(css.match(/container-type:\s*size/g)?.length, 1);
		const splitCss = css.slice(css.indexOf('.record-page--split'));
		const desktopStart = splitCss.indexOf('@media (min-width: 48rem)');
		const desktopBody = splitCss.slice(desktopStart, splitCss.indexOf('@media', desktopStart + 10));
		assert.match(desktopBody, /height:\s*100svh/);
		assert.doesNotMatch(desktopBody, /data-kind/);
		assert.doesNotMatch(desktopBody, /mark-hit/);
	});

	it('toggles one overflow sentence and skips a collapsed box in contentH', () => {
		const astro = readFileSync(join(here, '../pages/records/[id].astro'), 'utf8');
		const css = readFileSync(join(here, '../styles/global.css'), 'utf8');
		const template = astro.slice(0, astro.indexOf('<script>'));
		assert.equal(template.includes('mark-hit'), false);
		assert.match(astro, /placeExpandedPanel/);
		assert.match(astro, /className = 'mark-hit'/);
		assert.match(astro, /aria-expanded/);
		assert.match(astro, /aria-controls/);
		assert.match(astro, /aria-label/);
		assert.match(astro, /openOverflowId/);
		assert.match(astro, /event\.key !== 'Escape'/);
		assert.match(astro, /data-expanded', 'true'/);
		const collapse = astro.slice(astro.indexOf('function collapseToContent'), astro.indexOf('function applyFrame'));
		assert.match(collapse, /data-kind === 'overflow'/);
		assert.match(collapse, /data-expanded/);
		assert.equal(collapse.includes('plateBox'), false);
		assert.match(css, /\.mark-hit/);
		assert.match(css, /li\[data-kind='overflow'\]\.is-scrim \.mark-note/);
		assert.match(css, /background:\s*var\(--bg\)/);
		const resize = astro.slice(astro.indexOf("addEventListener('resize'"), astro.indexOf('document.fonts'));
		assert.match(resize, /openOverflowId = null/);
	});

	it('keeps letterbox elbow stubs visible above note paper (no full-column bg over leaders)', () => {
		// Live mhjl329 @390: leaders already end on sentenceBounds (ink), but
		// li[data-kind=letterbox] { background: var(--bg) } paints the full
		// note column ABOVE the SVG (.plate-overlay then ol.mark-list). Page
		// paper is the same --bg, so the covered stub reads as a hollow gap
		// before the glyphs. #70 dash/stub length cannot fix that.
		const astro = readFileSync(join(here, '../pages/records/[id].astro'), 'utf8');
		const css = readFileSync(join(here, '../styles/global.css'), 'utf8');
		const splitTemplate = astro.slice(
			astro.indexOf('class:list={[\'split-frame\''),
			astro.indexOf('class="split-read"'),
		);
		const overlayAt = splitTemplate.indexOf('class="plate-overlay"');
		const listAt = splitTemplate.indexOf('class="mark-list"');
		assert.ok(overlayAt >= 0 && listAt > overlayAt, 'SVG leaders must precede mark-list in DOM');
		assert.doesNotMatch(
			css,
			/\.record-page--split \.split-frame \.mark-list li\[data-kind='letterbox'\] \{[^}]*background:\s*var\(--bg\)/s,
			'full-column letterbox paper sits above leaders and hides the stub',
		);
		// Paper may hug the glyphs so callouts stay readable without covering the approach.
		assert.match(
			css,
			/\.record-page--split \.split-frame \.mark-list li\[data-kind='letterbox'\] \.mark-note \{[^}]*background:\s*var\(--bg\);/s,
		);
		assert.match(
			css,
			/\.record-page--split \.split-frame \.mark-list li\[data-kind='letterbox'\] \.mark-note \{[^}]*width:\s*fit-content;/s,
		);
		const leaders = astro.slice(
			astro.indexOf('function writeSplitLeaders'),
			astro.indexOf('function writeLeaders'),
		);
		assert.match(leaders, /selectNodeContents/);
	});

	it('aims a split leader at the sentence glyphs, not the letterbox column', () => {
		const astro = readFileSync(join(here, '../pages/records/[id].astro'), 'utf8');
		const css = readFileSync(join(here, '../styles/global.css'), 'utf8');
		const leaders = astro.slice(
			astro.indexOf('function writeSplitLeaders'),
			astro.indexOf('function writeLeaders'),
		);
		assert.match(leaders, /selectNodeContents/);
		assert.match(leaders, /\.mark-note/);
		assert.match(leaders, /dataset\.kind === 'letterbox'/);
		assert.doesNotMatch(leaders, /\(sentence \?\? li\)\.getBoundingClientRect\(\)/);
		const narrow = css.slice(css.lastIndexOf('@media (max-width: 47.99rem)'));
		assert.doesNotMatch(narrow, /data-kind='letterbox'\]\[data-side='right'\].*text-align:\s*right/);
	});

	it('flushes wrapped letterbox ink toward the leader edge so stubs meet glyphs', () => {
		// Live mhjl329 label ④: terminus sat on the note box (max line width) while a
		// shorter wrap line left ~35px of same --bg paper before the ink. Aligning
		// glyphs to the side the stub meets closes that hollow gap without moving paper.
		const astro = readFileSync(join(here, '../pages/records/[id].astro'), 'utf8');
		const css = readFileSync(join(here, '../styles/global.css'), 'utf8');
		const leaders = astro.slice(
			astro.indexOf('function writeSplitLeaders'),
			astro.indexOf('function writeLeaders'),
		);
		assert.match(leaders, /data-leader-edge|leaderEdge|dataset\.leaderEdge/);
		assert.match(
			css,
			/li\[data-kind='letterbox'\]\[data-leader-edge='right'\][^}]*text-align:\s*right/s,
		);
	});

	it('stacks split plate-overlay above mark-list so elbow tips meet ink', () => {
		// Live mhjl329 cover ④: stub geometry met the note edge but note --bg (z above
		// the SVG) ate the last ~4–6px and read as a cream gap before 「盤」.
		const css = readFileSync(join(here, '../styles/global.css'), 'utf8');
		const split = css.slice(css.indexOf(".record-page--split .split-frame .plate-overlay"));
		assert.match(split, /z-index:\s*3/);
		const listRule = css.slice(css.indexOf(".record-page--split .split-frame .mark-list {"));
		assert.match(listRule, /z-index:\s*2/);
	});

});
