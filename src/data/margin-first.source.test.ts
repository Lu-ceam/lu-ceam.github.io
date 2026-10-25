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
});
