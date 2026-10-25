import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import { cropWindow, fillCropPaint } from './detail-display.ts';
import { mhjl329FillCrop } from './fill-crop-fade-fixtures.ts';

const here = dirname(fileURLToPath(import.meta.url));

describe('fill-crop fade contract', () => {
	it('exports the window and paint names and the fixture fields', () => {
		assert.equal(typeof cropWindow, 'function');
		assert.equal(typeof fillCropPaint, 'function');
		assert.equal(mhjl329FillCrop.id, 'mhjl329');
		assert.equal(mhjl329FillCrop.desk.width, 801);
		assert.equal(mhjl329FillCrop.desk.height, 900);
		assert.equal(mhjl329FillCrop.phone.width, 354);
		assert.equal(mhjl329FillCrop.phone.height, 489.5);
		assert.equal(mhjl329FillCrop.local.hold, 0.08);
		assert.equal(mhjl329FillCrop.local.zoomMid, 0.24);
		assert.equal(mhjl329FillCrop.local.wash, 0.46);
		assert.equal(mhjl329FillCrop.local.plateEnd, 0.52);
		assert.equal(mhjl329FillCrop.tolerancePx, 0.01);
		assert.equal(mhjl329FillCrop.settledTolerancePx, 0.1);
		assert.equal(mhjl329FillCrop.label.windows.t0.cropT, 0);
		assert.equal(mhjl329FillCrop.label.windows.t1.cropT, 1);
		assert.equal(mhjl329FillCrop.cover.windows.t05.cropT, 0.5);
		assert.equal(typeof mhjl329FillCrop.label.crop.x, 'number');
		assert.equal(typeof mhjl329FillCrop.label.crop.y, 'number');
		assert.equal(typeof mhjl329FillCrop.label.crop.w, 'number');
		assert.equal(typeof mhjl329FillCrop.label.crop.h, 'number');
		assert.equal(typeof mhjl329FillCrop.label.natural.width, 'number');
		assert.equal(typeof mhjl329FillCrop.label.plate.height, 'number');
		assert.equal(typeof mhjl329FillCrop.label.windows.t0.left, 'number');
		assert.equal(typeof mhjl329FillCrop.label.windows.t0.top, 'number');
		assert.equal(typeof mhjl329FillCrop.label.windows.t0.width, 'number');
		assert.equal(typeof mhjl329FillCrop.label.windows.t0.height, 'number');
		assert.equal(typeof mhjl329FillCrop.label.windows.t0.centerX, 'number');
		assert.equal(typeof mhjl329FillCrop.label.windows.t0.centerY, 'number');
		assert.equal(typeof mhjl329FillCrop.cover.windows.t0.left, 'number');
		assert.equal(typeof mhjl329FillCrop.cover.fixedCenter.left, 'number');
		assert.equal(typeof mhjl329FillCrop.cover.s.width, 'number');
		assert.equal(typeof mhjl329FillCrop.phoneCover.t0.left, 'number');
		assert.equal(typeof mhjl329FillCrop.phoneCover.s.top, 'number');
		assert.equal(typeof mhjl329FillCrop.paneCenterDesk.x, 'number');
		assert.equal(typeof mhjl329FillCrop.paneCenterPhone.y, 'number');
	});

	it('freezes the hooks, the hide, and the single size container', () => {
		const display = readFileSync(join(here, 'detail-display.ts'), 'utf8');
		const css = readFileSync(join(here, '../styles/global.css'), 'utf8');
		const astro = readFileSync(join(here, '../pages/records/[id].astro'), 'utf8');
		const template = astro.slice(0, astro.indexOf('<script>'));
		const split = template.slice(template.indexOf('class="split-stage"'), template.indexOf('class="split-read"'));
		const legacy = template.slice(template.indexOf('class="record-split"'), template.indexOf('class="split-stage"'));
		assert.match(display, /export type FillCropPaint = \{/);
		assert.match(display, /export function cropWindow/);
		assert.match(display, /export function fillCropPaint/);
		assert.match(split, /class="upright-outer"/);
		assert.match(split, /data-fill-crop="outer"/);
		assert.match(split, /class="crop-window"/);
		assert.match(split, /data-fill-crop="window"/);
		assert.ok(split.indexOf('data-fill-crop="outer"') < split.indexOf('data-fill-crop="window"'));
		assert.ok(split.indexOf('data-fill-crop="window"') < split.indexOf('class="detail-stage"'));
		assert.equal(legacy.includes('data-fill-crop'), false);
		assert.match(legacy, /class="upright-clip"/);
		assert.match(
			css,
			/\.record-page--split \.split-frame > \.upright-outer,\s*\.record-page--split \.split-frame > \.crop-window \{\s*position:\s*absolute;\s*pointer-events:\s*none;\s*opacity:\s*0;\s*visibility:\s*hidden;\s*\}/,
		);
		assert.match(css, /\.record-page--split \{\s*--imagery-h: 58svh;\s*\}/);
		assert.match(css, /\.record-page--split \.split-frame\s*\{[^}]*container-type:\s*size/s);
		assert.equal(css.match(/container-type:\s*size/g)?.length, 1);
		assert.equal(css.includes('--fill-crop'), false);
		assert.match(css, /\.record-page--split \.split-imagery \{[^}]*background:\s*var\(--bg\);/s);
	});
});
