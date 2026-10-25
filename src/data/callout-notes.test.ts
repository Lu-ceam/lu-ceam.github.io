import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { noteIndexPrefix } from './callout-notes.ts';

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
