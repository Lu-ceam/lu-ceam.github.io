import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { noteIndexPrefix, splitCalloutMode } from './callout-notes.ts';

describe('note index prefix', () => {
	it('uses the circled numeral for 1 through 20 and parentheses after that', () => {
		assert.equal(noteIndexPrefix(1), '①');
		assert.equal(noteIndexPrefix(6), '⑥');
		assert.equal(noteIndexPrefix(20), '⑳');
		assert.equal(noteIndexPrefix(21), '(21)');
		assert.equal(
			'①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳',
			Array.from({ length: 20 }, (_, index) => noteIndexPrefix(index + 1)).join(''),
		);
	});
});

describe('split callout mode', () => {
	it('returns margin only when every narrow note is side', () => {
		const rem = 18;
		assert.equal(
			splitCalloutMode({
				narrow: false,
				stripPx: 49.56,
				rem,
				placements: [{ kind: 'letterbox' }],
			}),
			null,
		);
		assert.equal(
			splitCalloutMode({ narrow: true, stripPx: 49.56, rem, placements: [] }),
			null,
		);
		assert.equal(
			splitCalloutMode({
				narrow: true,
				stripPx: 49.56,
				rem,
				placements: [{ kind: 'side' }, { kind: 'side' }],
			}),
			'margin',
		);
		assert.equal(
			splitCalloutMode({
				narrow: true,
				stripPx: 49.56,
				rem,
				placements: [{ kind: 'letterbox' }],
			}),
			'margin-first',
		);
		assert.equal(
			splitCalloutMode({
				narrow: true,
				stripPx: 0,
				rem,
				placements: [{ kind: 'overflow' }],
			}),
			'margin-first',
		);
		assert.equal(
			splitCalloutMode({
				narrow: true,
				stripPx: 6.5 * rem,
				rem,
				placements: [{ kind: 'side' }, { kind: 'scrim' }],
			}),
			'margin-first',
		);
		assert.equal(
			splitCalloutMode({
				narrow: true,
				stripPx: 0,
				rem,
				placements: [{ kind: 'letterbox' }],
			}),
			splitCalloutMode({
				narrow: true,
				stripPx: 999,
				rem,
				placements: [{ kind: 'letterbox' }],
			}),
		);
	});
});
