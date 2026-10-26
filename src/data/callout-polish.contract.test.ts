import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import { CALLOUT_ATTR, IMAGERY_VAR, SIZE_CONTAINER_SELECTOR } from './callout-notes.ts';
import { noteIndexPrefix, splitCalloutMode } from './callout-notes.ts';
import {
	leaderEntersNoteInterior,
	polylinesProperlyCross,
	selectSplitLeaders,
	splitLeaderPath,
} from './split-leaders.ts';
import { settledImageryHeight } from './settled-pane.ts';
import {
	deskMhjl329,
	legacyRecordId,
	phoneMhjl329,
	workedLeader,
} from './callout-polish-fixtures.ts';

const here = dirname(fileURLToPath(import.meta.url));

describe('callout polish contract', () => {
	it('exports the stub names and the fixture field types', () => {
		assert.equal(typeof noteIndexPrefix, 'function');
		assert.equal(typeof splitCalloutMode, 'function');
		assert.equal(typeof leaderEntersNoteInterior, 'function');
		assert.equal(typeof polylinesProperlyCross, 'function');
		assert.equal(typeof splitLeaderPath, 'function');
		assert.equal(typeof selectSplitLeaders, 'function');
		assert.equal(typeof settledImageryHeight, 'function');
		assert.equal(CALLOUT_ATTR, 'data-callout');
		assert.equal(IMAGERY_VAR, '--imagery-h');
		assert.equal(SIZE_CONTAINER_SELECTOR, '.record-page--split .split-frame');

		assert.equal(phoneMhjl329.id, 'mhjl329');
		assert.equal(deskMhjl329.id, 'mhjl329');
		assert.equal(legacyRecordId, 'ml4001');
		assert.equal(typeof phoneMhjl329.viewport.width, 'number');
		assert.equal(typeof phoneMhjl329.viewport.height, 'number');
		assert.equal(typeof phoneMhjl329.pane.width, 'number');
		assert.equal(typeof phoneMhjl329.pane.height, 'number');
		assert.equal(typeof phoneMhjl329.rem, 'number');
		assert.equal(typeof phoneMhjl329.padPx, 'number');
		assert.equal(typeof phoneMhjl329.label.plate.width, 'number');
		assert.equal(typeof phoneMhjl329.label.plate.height, 'number');
		assert.equal(typeof phoneMhjl329.label.settledImageryH, 'number');
		assert.equal(typeof phoneMhjl329.cover.plate.width, 'number');
		assert.equal(typeof phoneMhjl329.cover.plate.height, 'number');
		assert.equal(typeof phoneMhjl329.cover.settledImageryH, 'number');
		assert.equal(typeof deskMhjl329.phi.min, 'number');
		assert.equal(typeof deskMhjl329.phi.max, 'number');
		assert.equal(deskMhjl329.imageryHeight, '100svh');
		assert.equal(workedLeader.points.length, 4);
		assert.equal(typeof workedLeader.points[0].x, 'number');
		assert.equal(typeof workedLeader.points[0].y, 'number');
		assert.equal(typeof workedLeader.gap, 'number');
		assert.equal(workedLeader.dash, '6 5');
	});

	it('keeps the size container and the imagery variable where they already live', () => {
		const css = readFileSync(join(here, '../styles/global.css'), 'utf8');
		const astro = readFileSync(join(here, '../pages/records/[id].astro'), 'utf8');
		const source = readFileSync(join(here, 'detail-display.ts'), 'utf8');
		assert.match(css, /\.record-page--split \{\s*--imagery-h: 58svh;[\s\S]*?\}/);
		assert.match(
			css,
			/\.record-page--split \.split-frame\s*\{[^}]*container-type:\s*size/s,
		);
		const imageryAt = css.indexOf('.record-page--split .split-imagery {');
		assert.ok(imageryAt >= 0);
		const imageryBody = css.slice(imageryAt, css.indexOf('}', imageryAt));
		assert.equal(imageryBody.includes('container-type'), false);
		assert.match(astro, /class:list=\{\['split-frame'/);
		assert.match(source, /narrow\?: boolean/);
		assert.doesNotMatch(astro, /data-callout=/);
	});
});
