import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const here = dirname(fileURLToPath(import.meta.url));

describe('settled pane wiring', () => {
	it('measures S in the tall pane and collapses without a second plateBox', () => {
		const astro = readFileSync(join(here, '../pages/records/[id].astro'), 'utf8');
		const css = readFileSync(join(here, '../styles/global.css'), 'utf8');
		const positionSplit = astro.slice(
			astro.indexOf('function positionSplit'),
			astro.indexOf('function settle'),
		);
		assert.ok(positionSplit.indexOf("removeProperty('--imagery-h')") >= 0);
		assert.ok(
			positionSplit.indexOf("removeProperty('--imagery-h')") <
				positionSplit.indexOf('layoutSplit(figure)'),
		);
		assert.match(positionSplit, /delete figure\.dataset\.paneSettle/);
		assert.equal(positionSplit.includes('plateBox('), false);
		assert.equal(positionSplit.includes('settledImageryHeight'), false);
		assert.match(positionSplit, /narrow: isNarrow\(\)/);
		assert.match(astro, /selectSplitLeaders\(/);
		assert.match(astro, /const shortPx = 0\.35 \* remPx\(\)/);

		const layout = astro.slice(
			astro.indexOf('function layoutSplit'),
			astro.indexOf('function collapseToContent'),
		);
		assert.ok(layout.indexOf('paneSettle') < layout.indexOf('plateBox('));
		assert.match(layout, /tallPose\.set\(figure/);

		const collapse = astro.slice(
			astro.indexOf('function collapseToContent'),
			astro.indexOf('function applyFrame'),
		);
		assert.equal(collapse.includes('plateBox'), false);
		assert.equal(collapse.includes('openingBox'), false);
		assert.equal(collapse.includes('cameraBox'), false);
		assert.match(collapse, /settledImageryHeight\(/);
		assert.match(collapse, /0\.75 \* remPx\(\)/);

		assert.match(
			astro,
			/stageVisual\(activeLocal, active\.dataset\.notes === 'aligned'\)\.notesOpacity > 0/,
		);
		assert.match(astro, /collapseToContent\(active, 'page'\)/);
		assert.match(astro, /collapseToContent\(frame, 'frame'\)/);
		const showSettled = astro.slice(astro.indexOf('const showSettled'), astro.indexOf('const armFade'));
		assert.match(showSettled, /position\(frame\)/);
		assert.ok(showSettled.indexOf('position(frame)') < showSettled.indexOf("collapseToContent(frame, 'frame')"));

		const splitCss = css.slice(css.indexOf('.record-page--split'));
		const desktopStart = splitCss.indexOf('@media (min-width: 48rem)');
		const after = splitCss.slice(desktopStart + 10);
		const desktopBody = splitCss.slice(desktopStart, desktopStart + 10 + after.indexOf('@media'));
		assert.match(desktopBody, /\.split-frame\s*\{[^}]*height:\s*100svh/s);
		assert.doesNotMatch(desktopBody, /var\(--imagery-h\)/);
		assert.match(css, /grid-template-columns:\s*minmax\(0,\s*1\.618fr\)\s*minmax\(0,\s*1fr\)/);
	});
});
