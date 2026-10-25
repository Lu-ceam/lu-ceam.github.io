import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import { cropWindow, openingBox, plateBox, zoomImageBox } from './detail-display.ts';
import { phoneMhjl329 } from './callout-polish-fixtures.ts';
import { hugSettledPlate, settledImageryHeight } from './settled-pane.ts';

const here = dirname(fileURLToPath(import.meta.url));

describe('settled imagery height', () => {
	it('adds one pad above and below the plate union and never grows the pane', () => {
		assert.equal(phoneMhjl329.label.settledImageryH, 282);
		assert.equal(phoneMhjl329.cover.settledImageryH, 185);
		assert.equal(phoneMhjl329.padPx, 13.5);
		assert.equal(
			settledImageryHeight({
				paneHeight: 489.5,
				plate: { top: 0, bottom: 255 },
				notes: [],
				padPx: 13.5,
			}),
			282,
		);
		assert.equal(
			settledImageryHeight({
				paneHeight: 489.5,
				plate: { top: 0, bottom: 158 },
				notes: [],
				padPx: 13.5,
			}),
			185,
		);
		assert.equal(
			settledImageryHeight({
				paneHeight: 100,
				plate: { top: 0, bottom: 255 },
				notes: [],
				padPx: 13.5,
			}),
			100,
		);
		assert.equal(
			settledImageryHeight({
				paneHeight: 500,
				plate: { top: 100, bottom: 200 },
				notes: [{ top: 80, bottom: 220 }],
				padPx: 10,
			}),
			160,
		);
		const source = readFileSync(join(here, 'settled-pane.ts'), 'utf8');
		assert.equal(source.includes('plateBox'), false);
		assert.equal(source.includes('cameraBox'), false);
		assert.equal(source.includes('stageVisual'), false);
	});

	it('matches the frozen MHJL plates within 2px and does not refit them', () => {
		const phone = { width: phoneMhjl329.pane.width, height: phoneMhjl329.pane.height };
		const labelNatural = { width: 1050, height: 1400 };
		const coverNatural = { width: 1400, height: 1400 };
		const label = plateBox(
			phone,
			openingBox(phone, labelNatural),
			{ width: 400, height: 400 },
			labelNatural,
			{ x: 274, y: 403, w: 514, h: 514 },
		);
		const cover = plateBox(
			phone,
			openingBox(phone, coverNatural),
			{ width: 400, height: 248 },
			coverNatural,
			{ x: 219, y: 210, w: 379, h: 235 },
		);
		const labelH = settledImageryHeight({
			paneHeight: phone.height,
			plate: { top: label.top, bottom: label.top + label.height },
			notes: [{ top: label.top + 10, bottom: label.top + 30 }],
			padPx: phoneMhjl329.padPx,
		});
		const coverH = settledImageryHeight({
			paneHeight: phone.height,
			plate: { top: cover.top, bottom: cover.top + cover.height },
			notes: [{ top: cover.top + 4, bottom: cover.top + 20 }],
			padPx: phoneMhjl329.padPx,
		});
		assert.equal(labelH, label.height + phoneMhjl329.padPx * 2);
		// cover.top + cover.height does not subtract back to cover.height (one ulp).
		assert.ok(Math.abs(coverH - (cover.height + phoneMhjl329.padPx * 2)) < 1e-9);
		assert.ok(Math.abs(labelH - 282) <= 2);
		assert.ok(Math.abs(coverH - 185) <= 2);
		assert.ok(labelH < phone.height);
		assert.ok(coverH < phone.height);
		assert.ok(Math.abs(label.width - 255) <= 2);
		assert.ok(Math.abs(label.height - 255) <= 2);
		assert.ok(Math.abs(cover.height - 158) <= 2);
		const frozen = { ...label };
		settledImageryHeight({
			paneHeight: phone.height,
			plate: { top: label.top, bottom: label.top + label.height },
			notes: [],
			padPx: phoneMhjl329.padPx,
		});
		assert.deepEqual(label, frozen);
	});
});

describe('crop window at the hugged plate', () => {
	it('lands cropT=1 on the plate after a note above it pulls the plate up', () => {
		const pane = phoneMhjl329.pane;
		const natural = { width: 1050, height: 1400 };
		const crop = { x: 274, y: 403, w: 514, h: 514 };
		const opening = openingBox(pane, natural);
		const centered = plateBox(
			pane,
			opening,
			{ width: 400, height: 400 },
			natural,
			crop,
			phoneMhjl329.padPx,
		);
		const notes = [{ top: centered.top - 48, bottom: centered.top - 8 }];
		const hugged = hugSettledPlate({
			paneHeight: pane.height,
			plate: centered,
			notes,
			padPx: phoneMhjl329.padPx,
		});
		assert.ok(centered.top - hugged.plate.top > 20);
		const zoom = zoomImageBox({
			opening,
			plate: hugged.plate,
			natural,
			crop,
			cropT: 1,
		});
		const win = cropWindow({ image: zoom, naturalWidth: natural.width, crop });
		assert.ok(Math.abs(win.top - hugged.plate.top) <= 0.5);
		assert.ok(Math.abs(win.left - hugged.plate.left) <= 0.5);
		assert.ok(Math.abs(win.width - hugged.plate.width) <= 0.5);
		assert.ok(Math.abs(win.height - hugged.plate.height) <= 0.5);
		const broken = cropWindow({
			image: zoomImageBox({ opening, plate: centered, natural, crop, cropT: 1 }),
			naturalWidth: natural.width,
			crop,
		});
		assert.ok(Math.abs(broken.top - hugged.plate.top) > 20);
		const delta = centered.top - hugged.plate.top;
		const again = hugSettledPlate({
			paneHeight: hugged.height,
			plate: hugged.plate,
			notes: notes.map((note) => ({ top: note.top - delta, bottom: note.bottom - delta })),
			padPx: phoneMhjl329.padPx,
		});
		assert.ok(Math.abs(again.plate.top - hugged.plate.top) <= 0.5);
		assert.ok(Math.abs(again.height - hugged.height) <= 0.5);
		assert.ok(hugged.height < pane.height);
	});
});
