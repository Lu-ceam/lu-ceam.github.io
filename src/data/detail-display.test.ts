import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import recordsJson from './records.json' with { type: 'json' };
import {
	badgeCenter,
	cropIsProperSubRectangle,
	detailMode,
	expectedPlateHeight,
	leaderEndpoints,
	notesAligned,
	paintSide,
	plateHeightMatches,
	resolvedSide,
	roundHalfAwayFromZero,
	showDetailsNote,
	showMarkLabel,
	stackTops,
	stripCircledIndex,
	visibleDetailText,
	type DetailLike,
	type MarkLike,
} from './detail-display.ts';

const upright = { width: 1000, height: 800 };

describe('rounding and plate height', () => {
	it('rounds halves away from zero', () => {
		assert.equal(roundHalfAwayFromZero(1.5), 2);
		assert.equal(roundHalfAwayFromZero(-1.5), -2);
		assert.equal(roundHalfAwayFromZero(2.2), 2);
	});

	it('expects plate height from exportWidth * crop.h / crop.w', () => {
		assert.equal(expectedPlateHeight(400, { w: 1000, h: 500 }), 200);
		assert.equal(plateHeightMatches(200, 400, { w: 1000, h: 500 }), true);
		assert.equal(plateHeightMatches(201, 400, { w: 2, h: 1 }), true);
		assert.equal(plateHeightMatches(203, 400, { w: 2, h: 1 }), false);
	});
});

describe('detail mode', () => {
	const crop = { x: 40, y: 20, w: 500, h: 400 };
	const marks = [{ side: 'auto' as const, x: 0, y: 0, w: 10, h: 10 }];

	it('is legacy when marks are empty, even with an upright', () => {
		assert.equal(
			detailMode({ marks: [], text: '① a', upright, transform: { crop } }),
			'legacy',
		);
	});

	it('is callout when marks exist and upright is omitted', () => {
		assert.equal(detailMode({ marks, text: '① a' }), 'callout');
	});

	it('is reveal only for a proper sub-rectangle', () => {
		assert.equal(
			detailMode({ marks, text: '① a', upright, transform: { crop } }),
			'reveal',
		);
		assert.equal(cropIsProperSubRectangle({ x: 0, y: 0, w: 1000, h: 800 }, upright), false);
		assert.equal(
			detailMode({
				marks,
				text: '① a',
				upright,
				transform: { crop: { x: 0, y: 0, w: 1000, h: 800 } },
			}),
			'callout',
		);
		assert.equal(cropIsProperSubRectangle({ x: 2, y: 0, w: 1000, h: 800 }, upright), true);
		assert.equal(cropIsProperSubRectangle({ x: 0, y: 0, w: 998, h: 800 }, upright), true);
	});
});

describe('notes and text', () => {
	it('strips one circled index and the spaces after it', () => {
		assert.equal(stripCircledIndex('① GREAT TRACKS 标'), 'GREAT TRACKS 标');
		assert.equal(stripCircledIndex('① ② leftover'), '② leftover');
		assert.equal(stripCircledIndex('内圈刻字（转录）：第 2 面'), '内圈刻字（转录）：第 2 面');
	});

	it('keeps the full text until every mark has a note', () => {
		const detail = {
			text: '① GREAT TRACKS 标\n② MHJL 329',
			marks: [{ side: 'auto' as const, x: 1, y: 1, w: 2, h: 2 }],
		};
		assert.equal(notesAligned(detail), false);
		assert.equal(visibleDetailText(detail), detail.text);
	});

	it('hides circled lines whose body equals a note and keeps transcriptions', () => {
		const detail = {
			text: '① GREAT TRACKS 标\n② MHJL 329\n内圈刻字（转录）：第 1 面 ARL 1854-1A',
			marks: [
				{ side: 'auto' as const, x: 1, y: 1, w: 2, h: 2, note: 'GREAT TRACKS 标' },
				{ side: 'right' as const, x: 1, y: 1, w: 2, h: 2, note: 'MHJL 329' },
			],
		};
		assert.equal(notesAligned(detail), true);
		assert.equal(visibleDetailText(detail), '内圈刻字（转录）：第 1 面 ARL 1854-1A');
		assert.equal(showDetailsNote({ details: [detail] }), false);
	});

	it('keeps detailsNote while any circled line is still visible', () => {
		const open = { text: '① still here', marks: [{ side: 'auto' as const, x: 0, y: 0, w: 1, h: 1 }] };
		const plain = { text: 'one unnumbered sentence', marks: [] as const };
		assert.equal(showDetailsNote({ details: [plain, open] }), true);
	});

	it('shows a label only when it is not the note and not a prefix of the note', () => {
		assert.equal(showMarkLabel({ label: '标', note: 'GREAT TRACKS 标' }), true);
		assert.equal(showMarkLabel({ label: 'GREAT', note: 'GREAT TRACKS 标' }), false);
		assert.equal(showMarkLabel({ label: '目录号', note: '目录号' }), false);
		assert.equal(showMarkLabel({ label: '目录号' }), false);
	});

	it('drops the circled list entirely when every line body is a mark note', () => {
		const detail = {
			text: '① GREAT TRACKS 标\n② MHJL 329',
			marks: [
				{ side: 'auto' as const, x: 1, y: 1, w: 2, h: 2, note: 'GREAT TRACKS 标' },
				{ side: 'auto' as const, x: 1, y: 1, w: 2, h: 2, note: 'MHJL 329' },
			],
		};
		assert.equal(notesAligned(detail), true);
		assert.equal(visibleDetailText(detail), '');
		assert.equal(showDetailsNote({ details: [detail] }), false);
	});
});

type PublishedMark = {
	id: string;
	side: MarkLike['side'];
	x: number;
	y: number;
	w: number;
	h: number;
	note?: string;
};

type PublishedDetail = {
	part: string;
	text: string;
	marks: PublishedMark[];
};

function publishedDetails(recordId: string): PublishedDetail[] {
	const records = recordsJson as Array<{ id: string; details: PublishedDetail[] }>;
	const record = records.find((item) => item.id === recordId);
	assert.ok(record);
	return record.details;
}

function toDetailLike(detail: PublishedDetail): DetailLike {
	return {
		text: detail.text,
		marks: detail.marks.map((mark) => ({
			side: mark.side,
			x: mark.x,
			y: mark.y,
			w: mark.w,
			h: mark.h,
			...(mark.note ? { note: mark.note } : {}),
		})),
	};
}

describe('mhjl329 published callouts', () => {
	it('publishes each circled line as the matching mark note and hides the duplicate list', () => {
		const details = publishedDetails('mhjl329').filter(
			(detail) => detail.part === 'label' || detail.part === 'cover',
		);
		assert.equal(details.length, 2);
		for (const source of details) {
			const detail = toDetailLike(source);
			assert.equal(notesAligned(detail), true, `${source.part} notes`);
			const lines = source.text.split('\n');
			for (const mark of source.marks) {
				const line = lines[Number(mark.id) - 1];
				assert.equal(typeof line, 'string', `${source.part} line ${mark.id}`);
				assert.equal(mark.note, stripCircledIndex(line ?? ''), `${source.part} mark ${mark.id}`);
			}
			assert.equal(visibleDetailText(detail), '', `${source.part} reading column`);
		}
		assert.equal(showDetailsNote({ details: details.map(toDetailLike) }), false);
	});
});

describe('geometry', () => {
	it('paints auto on the right and resolves a tie to the right', () => {
		assert.equal(paintSide('auto'), 'right');
		assert.equal(paintSide('left'), 'left');
		assert.equal(resolvedSide({ side: 'auto', x: 300, w: 50 }, 400), 'left');
		assert.equal(resolvedSide({ side: 'auto', x: 100, w: 50 }, 400), 'right');
		assert.equal(resolvedSide({ side: 'auto', x: 175, w: 50 }, 400), 'right');
		assert.equal(resolvedSide({ side: 'left', x: 10, w: 10 }, 400), 'left');
	});

	it('places the disc on the requested corner, or centers it when it does not fit', () => {
		const wide = badgeCenter({ x: 10, y: 20, w: 200, h: 80, badge: 'tl' }, 400);
		assert.equal(wide.r, 11);
		assert.equal(wide.fontSize, 11);
		assert.equal(wide.cx, 10 + 3 + 11);
		assert.equal(wide.cy, 20 + 3 + 11);
		const tr = badgeCenter({ x: 10, y: 20, w: 200, h: 80, badge: 'tr' }, 400);
		assert.equal(tr.cx, 10 + 200 - 3 - 11);
		const tight = badgeCenter({ x: 0, y: 0, w: 10, h: 10, badge: 'tl' }, 400);
		assert.equal(tight.cx, 5);
		assert.equal(tight.cy, 5);
	});

	it('stacks notes down from the anchor and refuses to sit above the plate', () => {
		const tops = stackTops(
			[
				{ index: 1, anchor: 10, height: 40 },
				{ index: 0, anchor: 30, height: 40 },
			],
			100,
			100,
			8,
		);
		assert.equal(tops[0], 0);
		assert.equal(tops[1], 48);
		const tied = stackTops(
			[
				{ index: 1, anchor: 50, height: 20 },
				{ index: 0, anchor: 50, height: 20 },
			],
			100,
			100,
			8,
		);
		assert.equal(tied[1], 40);
		assert.equal(tied[0], 68);
	});

	it('stops the leader 0.35rem short of the note inner edge', () => {
		const right = leaderEndpoints({
			mark: { x: 10, y: 20, w: 40, h: 10 },
			side: 'right',
			plateRect: { left: 100, top: 50, width: 200, height: 100 },
			plateWidth: 400,
			plateHeight: 200,
			noteRect: { left: 340, right: 400, top: 60, height: 20 },
			shortPx: 7,
		});
		assert.equal(right.x1, 50);
		assert.equal(right.y1, 25);
		assert.equal(right.x2, (340 - 7 - 100) / (200 / 400));
		assert.equal(right.y2, (70 - 50) / (100 / 200));
	});
});
