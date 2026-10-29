import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import { records as publishedRecords } from './records.ts';
import { LETTERBOX_STUB_PENETRATE, selectSplitLeaders } from './split-leaders.ts';
import {
	badgeCenter,
	cropIsProperSubRectangle,
	detailMode,
	expectedPlateHeight,
	fitPlateToFloor,
	imageryHeightPx,
	laidOutSides,
	leaderEndpoints,
	leaderHitsNote,
	LETTERBOX_BAND_RESERVE_REM,
	LETTERBOX_BREATH_REM,
	MIN_BAND_REM,
	MIN_NOTE_REM,
	NOTE_CAP_REM,
	calloutsActive,
	layerTransform,
	placeNotes,
	placementLeaderRect,
	NARROW_FLOOR_OF_STAGE,
	NARROW_FLOOR_REM,
	NARROW_GAP_REM,
	NARROW_PAIR_MIN_REM,
	NARROW_SLOT_CAP_REM,
	OPEN_INSET,
	PLATE_CAP,
	ZOOM_GAIN,
	openingBox,
	placeExpandedPanel,
	plateBox,
	zoomImageBox,
	cropWindow,
	fillCropPaint,
	attachMarkNotesFromText,
	markIdNumeral,
	notesAligned,
	parseCircledSegments,
	paintSide,
	plateFloorPx,
	plateHeightMatches,
	pairGuttersFit,
	resolvedSide,
	roundHalfAwayFromZero,
	showDetailsNote,
	showMarkLabel,
	singleGutterPx,
	singleGutterSide,
	singlePlatePx,
	stackTops,
	stripCircledIndex,
	visibleDetailText,
	type DetailLike,
	type FrameBox,
	type LeaderArgs,
	type MarkLike,
	type NoteDraft,
	type PxSize,
} from './detail-display.ts';
import { mhjl329FillCrop } from './fill-crop-fade-fixtures.ts';
import { phoneMarginFirst } from './margin-first-fixtures.ts';
import { hugSettledPlate, settledImageryHeight } from './settled-pane.ts';
import { cameraBox, PLATE_END, UPRIGHT_END, ZOOM_END, stageVisual } from './split-stage.ts';

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

	it('is reveal when marks are empty and the crop is a proper sub-rectangle', () => {
		assert.equal(
			detailMode({ marks: [], text: '① a', upright, transform: { crop } }),
			'reveal',
		);
	});

	it('is legacy when marks are empty and there is no upright crop', () => {
		assert.equal(detailMode({ marks: [], text: 'plain' }), 'legacy');
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

	it('publishes every plate on the split stage, including empty marks', () => {
		const bare = publishedRecords.find((record) => record.id === '2901461');
		assert.ok(bare);
		assert.equal(bare.details.length, 1);
		assert.equal(bare.details[0]?.marks.length, 0);
		assert.equal(detailMode(bare.details[0]!), 'reveal');
		for (const record of publishedRecords) {
			assert.ok(record.details.length > 0, record.id);
			for (const detail of record.details) {
				assert.equal(detailMode(detail), 'reveal', `${record.id}/${detail.part}`);
			}
		}
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

describe('attachMarkNotesFromText', () => {
	type NoteMark = {
		id: string;
		side: 'auto' | 'left' | 'right';
		x: number;
		y: number;
		w: number;
		h: number;
		note?: string;
	};

	it('parses one numeral per line and mid-line compounds', () => {
		assert.deepEqual(parseCircledSegments('① GREAT\n② MHJL 329'), [
			{ index: 1, body: 'GREAT' },
			{ index: 2, body: 'MHJL 329' },
		]);
		assert.deepEqual(
			parseCircledSegments('⑥ 封套左上目录号 · ⑦ 封套内文 ML 4001 / NONBREAKABLE VINYLITE'),
			[
				{ index: 6, body: '封套左上目录号' },
				{ index: 7, body: '封套内文 ML 4001 / NONBREAKABLE VINYLITE' },
			],
		);
		assert.deepEqual(parseCircledSegments('内圈刻字（转录）：第 1 面'), []);
	});

	it('reads leading digits from mark ids', () => {
		assert.equal(markIdNumeral('6'), 6);
		assert.equal(markIdNumeral('3a'), 3);
		assert.equal(markIdNumeral('1l'), 1);
		assert.equal(markIdNumeral('a1'), undefined);
	});

	it('fills missing notes from export circled lines so callouts align', () => {
		const text = '① GREAT TRACKS 标\n② MHJL 329';
		const marks: NoteMark[] = attachMarkNotesFromText(
			[
				{ id: '1', side: 'auto' as const, x: 1, y: 1, w: 2, h: 2 },
				{ id: '2', side: 'auto' as const, x: 1, y: 1, w: 2, h: 2 },
			],
			text,
		);
		const detail = { text, marks };
		assert.equal(notesAligned(detail), true);
		assert.equal(marks[0]?.note, 'GREAT TRACKS 标');
		assert.equal(marks[1]?.note, 'MHJL 329');
		assert.equal(visibleDetailText(detail), '');
	});

	it('keeps an explicit layout note over the export line', () => {
		const text = '① from export\n② also export';
		const marks: NoteMark[] = attachMarkNotesFromText(
			[
				{ id: '1', side: 'auto' as const, x: 0, y: 0, w: 1, h: 1, note: 'layout wins' },
				{ id: '2', side: 'auto' as const, x: 0, y: 0, w: 1, h: 1 },
			],
			text,
		);
		assert.equal(marks[0]?.note, 'layout wins');
		assert.equal(marks[1]?.note, 'also export');
	});

	it('pairs by array order when mark and segment counts match (even if ids skip)', () => {
		const text =
			"② WILHELM FURTWÄNGLER 署名 · ③ 封套小字（Grand Prix du Disque 1956 de l'Académie Charles CROS）";
		const marks: NoteMark[] = attachMarkNotesFromText(
			[
				{ id: '1', side: 'auto' as const, x: 0, y: 0, w: 1, h: 1 },
				{ id: '2', side: 'auto' as const, x: 0, y: 0, w: 1, h: 1 },
			],
			text,
		);
		assert.equal(marks[0]?.note, 'WILHELM FURTWÄNGLER 署名');
		assert.equal(marks[1]?.note, "封套小字（Grand Prix du Disque 1956 de l'Académie Charles CROS）");
		assert.equal(notesAligned({ marks }), true);
		assert.equal(visibleDetailText({ text, marks }), '');
	});

	it('maps suffix ids onto circled numerals when counts differ', () => {
		const text =
			'① 外圈 MADE IN CANADA BY QUALITY RECORDS LTD.\n② 目录号 MG-50370(D)-A\n③ MERCURY / OLYMPIAN SERIES + Living Presence\n④ 标签调性 SUITE NO. 2 IN A MINOR';
		const marks: NoteMark[] = attachMarkNotesFromText(
			[
				{ id: '3a', side: 'auto' as const, x: 0, y: 0, w: 1, h: 1 },
				{ id: '3b', side: 'auto' as const, x: 0, y: 0, w: 1, h: 1 },
				{ id: '4', side: 'auto' as const, x: 0, y: 0, w: 1, h: 1 },
				{ id: '2', side: 'auto' as const, x: 0, y: 0, w: 1, h: 1 },
				{ id: '1l', side: 'auto' as const, x: 0, y: 0, w: 1, h: 1 },
				{ id: '1r', side: 'auto' as const, x: 0, y: 0, w: 1, h: 1 },
			],
			text,
		);
		assert.equal(marks[0]?.note, 'MERCURY / OLYMPIAN SERIES + Living Presence');
		assert.equal(marks[1]?.note, 'MERCURY / OLYMPIAN SERIES + Living Presence');
		assert.equal(marks[2]?.note, '标签调性 SUITE NO. 2 IN A MINOR');
		assert.equal(marks[3]?.note, '目录号 MG-50370(D)-A');
		assert.equal(marks[4]?.note, '外圈 MADE IN CANADA BY QUALITY RECORDS LTD.');
		assert.equal(marks[5]?.note, '外圈 MADE IN CANADA BY QUALITY RECORDS LTD.');
		assert.equal(notesAligned({ marks }), true);
	});

	it('hides a compound circled line once every segment is a mark note', () => {
		const text = '⑥ 封套左上目录号 · ⑦ 封套内文 ML 4001';
		const marks: NoteMark[] = attachMarkNotesFromText(
			[
				{ id: '6', side: 'auto' as const, x: 0, y: 0, w: 1, h: 1 },
				{ id: '7', side: 'auto' as const, x: 0, y: 0, w: 1, h: 1 },
			],
			text,
		);
		assert.equal(visibleDetailText({ text, marks }), '');
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
	plate: { width: number; height: number };
	marks: PublishedMark[];
};

function publishedDetails(recordId: string): PublishedDetail[] {
	const records = publishedRecords as unknown as Array<{ id: string; details: PublishedDetail[] }>;
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
	it('does not reintroduce scrubbed layout notes into records-layout.json', () => {
		const layoutPath = join(dirname(fileURLToPath(import.meta.url)), 'records-layout.json');
		const layout = JSON.parse(readFileSync(layoutPath, 'utf8')) as Array<{
			id: string;
			details: Array<{ marks: Array<{ note?: string }> }>;
		}>;
		const entry = layout.find((row) => row.id === 'mhjl329');
		assert.ok(entry);
		for (const detail of entry.details) {
			for (const mark of detail.marks) {
				assert.equal(mark.note, undefined);
			}
		}
		const raw = readFileSync(layoutPath, 'utf8');
		assert.equal(raw.includes('金额不导出'), false);
		assert.equal(raw.includes('OCR miss'), false);
	});

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

	function leaderFixture(noteLeft: number, side: 'left' | 'right' = 'right'): LeaderArgs {
		return {
			mark: { x: 10, y: 20, w: 40, h: 10 },
			side,
			plateRect: { left: 100, top: 50, width: 200, height: 100 },
			plateWidth: 400,
			plateHeight: 200,
			noteRect: { left: noteLeft, right: side === 'left' ? noteLeft : 400, top: 60, height: 20 },
			shortPx: 7,
		};
	}

	it('stops the leader 0.35rem short of the note and stubs 16px on a long gap', () => {
		const right = leaderEndpoints(leaderFixture(340));
		assert.equal(Array.isArray(right), true);
		assert.equal(right.length, 3);
		assert.deepEqual(right[0], { x: 50, y: 25 });
		assert.deepEqual(right[1], { x: 66, y: 25 });
		assert.deepEqual(right[2], { x: 466, y: 40 });
		assert.equal(right[2].x, (340 - 7 - 100) / (200 / 400));
		assert.equal(right[2].y, (70 - 50) / (100 / 200));
	});

	it('uses a 16px stub once the gap reaches 32, and half the gap below that', () => {
		const forty = leaderEndpoints(leaderFixture(152));
		assert.equal(forty.length, 3);
		assert.deepEqual(forty[0], { x: 50, y: 25 });
		assert.deepEqual(forty[1], { x: 66, y: 25 });
		assert.deepEqual(forty[2], { x: 90, y: 40 });

		const at32 = leaderEndpoints(leaderFixture(148));
		assert.deepEqual(at32[1], { x: 66, y: 25 });
		assert.equal(at32[2].x, 82);

		const under32 = leaderEndpoints(leaderFixture(147.5));
		assert.equal(under32.length, 3);
		assert.deepEqual(under32[1], { x: 65.5, y: 25 });
		assert.equal(under32[2].x, 81);

		const at4 = leaderEndpoints(leaderFixture(134));
		assert.equal(at4.length, 3);
		assert.deepEqual(at4[0], { x: 50, y: 25 });
		assert.deepEqual(at4[1], { x: 52, y: 25 });
		assert.deepEqual(at4[2], { x: 54, y: 40 });
	});

	it('drops the corner when the gap is under 4 plate pixels', () => {
		const tight = leaderEndpoints(leaderFixture(133));
		assert.deepEqual(tight, [
			{ x: 50, y: 25 },
			{ x: 52, y: 40 },
		]);
		const flat = leaderEndpoints(leaderFixture(132));
		assert.deepEqual(flat, [
			{ x: 50, y: 25 },
			{ x: 50, y: 40 },
		]);
	});

	it('points the stub toward the note, including a left note and a note that sits back across the box', () => {
		const left = leaderEndpoints({
			...leaderFixture(0, 'left'),
			noteRect: { left: 0, right: 80, top: 60, height: 20 },
		});
		assert.deepEqual(left, [
			{ x: 10, y: 25 },
			{ x: -6, y: 25 },
			{ x: -26, y: 40 },
		]);
		const back = leaderEndpoints(leaderFixture(112));
		assert.deepEqual(back[0], { x: 50, y: 25 });
		assert.deepEqual(back[1], { x: 34, y: 25 });
		assert.deepEqual(back[2], { x: 10, y: 40 });
	});

	it('publishes no points when the measured plate is 0 on either axis', () => {
		const base = leaderFixture(340);
		assert.deepEqual(leaderEndpoints({ ...base, plateWidth: 0 }), []);
		assert.deepEqual(leaderEndpoints({ ...base, plateHeight: 0 }), []);
		assert.deepEqual(
			leaderEndpoints({ ...base, plateRect: { ...base.plateRect, width: 0 } }),
			[],
		);
		assert.deepEqual(
			leaderEndpoints({ ...base, plateRect: { ...base.plateRect, height: 0 } }),
			[],
		);
	});

	it('renders a polyline leader at all three callout sites', () => {
		const astro = readFileSync(
			join(dirname(fileURLToPath(import.meta.url)), '../pages/records/[id].astro'),
			'utf8',
		);
		assert.equal(astro.includes('<line'), false);
		assert.equal((astro.match(/class="mark-leader"/g) ?? []).length, 3);
		assert.match(astro, /function formatLeaderPoints/);
		assert.match(astro, /leader\.removeAttribute\('points'\)/);
		assert.match(astro, /formatLeaderPoints\(points\)/);
	});
});

describe('leader stroke', () => {
	it('locks the visible dash in CSS and draws the scrub on the mask', () => {
		const here = dirname(fileURLToPath(import.meta.url));
		const css = readFileSync(join(here, '../styles/global.css'), 'utf8');
		assert.match(css, /\.mark-leader\s*\{[^}]*fill:\s*none/s);
		assert.match(css, /\.mark-leader\s*\{[^}]*stroke:\s*var\(--accent\)/s);
		assert.match(css, /\.mark-leader\s*\{[^}]*stroke-width:\s*1/s);
		assert.match(css, /\.mark-leader\s*\{[^}]*stroke-dasharray:\s*6 5/s);
		assert.match(css, /\.mark-leader\s*\{[^}]*stroke-linecap:\s*butt/s);
		assert.match(css, /\.mark-leader\s*\{[^}]*stroke-linejoin:\s*miter/s);
		assert.match(css, /\.mark-leader\s*\{[^}]*stroke-miterlimit:\s*2/s);
		assert.match(css, /\.mark-leader-mask\s*\{[^}]*stroke:\s*#fff/s);
		assert.match(css, /\.mark-leader-mask\s*\{[^}]*stroke-width:\s*3/s);
		assert.match(css, /\.mark-leader-mask\s*\{[^}]*stroke-linecap:\s*butt/s);
		assert.doesNotMatch(css, /\.mark-leader-mask\s*\{[^}]*stroke-dasharray/s);
		const forced = css.slice(css.indexOf('@media (forced-colors: active)'), css.indexOf('@media (forced-colors: active)') + 500);
		assert.match(forced, /stroke:\s*CanvasText/);
		assert.equal(forced.includes('mark-leader-mask'), false);

		const astro = readFileSync(join(here, '../pages/records/[id].astro'), 'utf8');
		assert.equal(astro.includes('SVGLineElement'), false);
		assert.equal(astro.includes("setAttribute('stroke-dashoffset', '0')"), false);
		assert.equal((astro.match(/class="mark-leader-mask"/g) ?? []).length, 3);
		assert.equal((astro.match(/standInLeaderPoints\(mark, detail\.plate\.width\)/g) ?? []).length, 6);
		assert.match(astro, /mark-leader-mask'\)\.forEach/);
		assert.doesNotMatch(astro, /mark-leader'\)\.forEach/);
		assert.match(astro, /1 - visual\.leadersOpacity/);
		const showSettled = astro.slice(astro.indexOf('const showSettled'), astro.indexOf('const armFade'));
		assert.match(showSettled, /position\(frame\)/);
	});
});

describe('narrow stage', () => {
	it('locks the floor, the pair test, and the single-gutter widths', () => {
		assert.equal(NARROW_FLOOR_REM, 11);
		assert.equal(NARROW_FLOOR_OF_STAGE, 0.58);
		assert.equal(NARROW_GAP_REM, 0.55);
		assert.equal(NARROW_PAIR_MIN_REM, 7.5);
		assert.equal(NARROW_SLOT_CAP_REM, 9.5);
		const rem = 18;
		assert.equal(plateFloorPx(354, rem), 198);
		assert.equal(plateFloorPx(284, rem), 0.58 * 284);
		const threshold = 11 * rem + 2 * 7.5 * rem + 2 * 0.55 * rem;
		assert.equal(pairGuttersFit(threshold, rem), true);
		assert.equal(pairGuttersFit(threshold - 0.01, rem), false);
		assert.equal(pairGuttersFit(354, rem), false);
		assert.equal(pairGuttersFit(284, rem), false);
		assert.equal(pairGuttersFit(827, rem), true);
		assert.equal(singleGutterSide(5, 1), 'left');
		assert.equal(singleGutterSide(1, 5), 'right');
		assert.equal(singleGutterSide(3, 3), 'right');
		assert.equal(singleGutterSide(0, 0), null);
		const floor = plateFloorPx(354, rem);
		const gap = NARROW_GAP_REM * rem;
		const cap = NARROW_SLOT_CAP_REM * rem;
		assert.equal(singleGutterPx(354, rem), Math.min(cap, 354 - gap - floor));
		assert.equal(singlePlatePx(354, rem), Math.max(floor, 354 - gap - singleGutterPx(354, rem)));
		assert.equal(singlePlatePx(354, rem), 198);
		assert.equal(fitPlateToFloor(320, 198, false), 320);
		assert.equal(fitPlateToFloor(320, 198, true), 198);
		assert.equal(imageryHeightPx(100, 200, 300), null);
		assert.equal(imageryHeightPx(250, 200, 300), 250);
		assert.equal(imageryHeightPx(400, 200, 300), 300);
	});

	it('collapses MHJL 329 to the busier side only when two gutters do not fit', () => {
		function notesFor(part: string): { side: 'auto' | 'left' | 'right'; x: number; w: number }[] {
			const detail = publishedDetails('mhjl329').find((item) => item.part === part);
			assert.ok(detail);
			assert.equal(detail.plate.width, 400);
			return detail.marks.map((mark) => ({ side: mark.side, x: mark.x, w: mark.w }));
		}
		const cover = notesFor('cover');
		const label = notesFor('label');
		const coverResolved = laidOutSides(cover, 400, 354, 18, false);
		assert.equal(coverResolved.gutters, 'resolved');
		assert.equal(coverResolved.sides.filter((side) => side === 'left').length, 5);
		assert.equal(coverResolved.sides.filter((side) => side === 'right').length, 1);
		const labelResolved = laidOutSides(label, 400, 354, 18, false);
		assert.equal(labelResolved.sides.filter((side) => side === 'left').length, 1);
		assert.equal(labelResolved.sides.filter((side) => side === 'right').length, 5);

		const coverPhone = laidOutSides(cover, 400, 354, 18, true);
		assert.equal(coverPhone.gutters, 'single');
		assert.deepEqual(coverPhone.sides, ['left', 'left', 'left', 'left', 'left', 'left']);
		const labelPhone = laidOutSides(label, 400, 354, 18, true);
		assert.equal(labelPhone.gutters, 'single');
		assert.deepEqual(labelPhone.sides, ['right', 'right', 'right', 'right', 'right', 'right']);

		const coverWide = laidOutSides(cover, 400, 827, 18, true);
		assert.equal(coverWide.gutters, 'resolved');
		assert.equal(coverWide.sides.filter((side) => side === 'right').length, 1);

		const tied = laidOutSides(
			[
				{ side: 'left', x: 0, w: 1 },
				{ side: 'right', x: 0, w: 1 },
			],
			400,
			354,
			18,
			true,
		);
		assert.equal(tied.gutters, 'single');
		assert.deepEqual(tied.sides, ['right', 'right']);
		assert.deepEqual(laidOutSides([], 400, 354, 18, true), { sides: [], gutters: 'resolved' });
	});

	it('sizes the narrow imagery band from --imagery-h and leaves the desktop pane at 100svh', () => {
		const here = dirname(fileURLToPath(import.meta.url));
		const css = readFileSync(join(here, '../styles/global.css'), 'utf8');
		assert.match(css, /\.mark-slot \{\s*flex:\s*0 0 9\.5rem/);
		const splitCss = css.slice(css.indexOf('.record-page--split'));
		assert.match(splitCss, /\.record-page--split \{\s*--imagery-h:\s*58svh;[\s\S]*?\}/);
		assert.match(splitCss, /\.split-imagery\s*\{[^}]*height:\s*var\(--imagery-h\)/s);
		assert.doesNotMatch(splitCss, /\.split-imagery\s*\{[^}]*container-type:\s*size/s);
		assert.match(
			splitCss,
			/\.record-page--split \.split-frame\s*\{[^}]*height:\s*var\(--imagery-h\)/s,
		);
		assert.match(
			splitCss,
			/\.record-page--split \.split-frame\s*\{[^}]*container-type:\s*size/s,
		);
		assert.doesNotMatch(splitCss, /\.plate-frame\s*\{[^}]*container-type/s);
		assert.match(splitCss, /\.split-read\s*\{[^}]*top:\s*var\(--imagery-h\)/s);
		assert.match(splitCss, /margin-top:\s*var\(--imagery-h\)/);
		assert.match(splitCss, /height:\s*calc\(100svh - var\(--imagery-h\)\)/);
		assert.match(
			splitCss,
			/\.record-page--split \.split-frame \.detail-stage \{\s*position:\s*relative;\s*width:\s*100%;\s*height:\s*100%;\s*max-height:\s*100%;\s*\}/,
		);
		assert.match(
			splitCss,
			/\.record-page--split \.split-frame \.plate-frame \{[^}]*left:\s*50%;[^}]*top:\s*50%;[^}]*transform:\s*translate\(-50%,\s*-50%\)/s,
		);
		assert.match(
			splitCss,
			/\.record-page--split \.split-frame \.plate \{[^}]*max-width:\s*72cqw;[^}]*max-height:\s*72cqh/s,
		);
		assert.match(splitCss, /\.split-frame \.mark-slot \{\s*display:\s*none;\s*\}/);
		assert.equal(splitCss.includes('flex: 1 1 7.5rem'), false);
		assert.equal(splitCss.includes('min(11rem, 58%)'), false);
		assert.equal(splitCss.includes('object-fit: cover'), false);
		assert.equal(
			splitCss.includes('calc(var(--imagery-h) * var(--plate-w) / var(--plate-h))'),
			false,
		);
		assert.equal(splitCss.includes('calc(100svh * var(--plate-w) / var(--plate-h))'), false);
		const desktopStart = splitCss.indexOf('@media (min-width: 48rem)');
		const after = splitCss.slice(desktopStart + 10);
		const desktopBody = splitCss.slice(desktopStart, desktopStart + 10 + after.indexOf('@media'));
		assert.match(
			desktopBody,
			/grid-template-columns:\s*minmax\(0,\s*1\.618fr\)\s*minmax\(0,\s*1fr\)/,
		);
		assert.match(desktopBody, /column-gap:\s*0/);
		assert.match(desktopBody, /\.split-imagery\s*\{[^}]*height:\s*100svh/s);
		assert.match(desktopBody, /\.split-frame\s*\{[^}]*height:\s*100svh/s);
		assert.match(desktopBody, /\.split-read\s*\{[^}]*height:\s*100svh/s);
		assert.match(desktopBody, /\.split-read\s*\{[^}]*max-width:\s*46ch/s);
		assert.match(desktopBody, /\.split-read\s*\{[^}]*grid-column:\s*2/s);
		assert.doesNotMatch(desktopBody, /var\(--imagery-h\)/);
		const column = Math.min(72 * 18, 1440 - 2 * 18);
		const imagery = (column * 1.618) / (1.618 + 1);
		const reading = column - imagery;
		assert.ok(Math.abs(imagery - 801) <= 1);
		assert.ok(Math.abs(reading - 495) <= 1);
		assert.ok(imagery / reading > 1.6 && imagery / reading < 1.64);
		assert.doesNotMatch(splitCss, /max-height:\s*32rem/);
		assert.doesNotMatch(splitCss, /--imagery-h:\s*42svh/);
		assert.match(splitCss, /max-width:\s*47\.99rem\)[\s\S]*--imagery-h:\s*100svh/);
		assert.match(splitCss, /--collapse-svh:\s*55/);

		const astro = readFileSync(join(here, '../pages/records/[id].astro'), 'utf8');
		assert.match(astro, /placeNotes\(/);
		assert.match(astro, /leaderHitsNote\(/);
		assert.match(astro, /layoutSplit\(/);
		assert.match(astro, /resolvedSide\(/);
		assert.match(astro, /stackTops\(/);
		assert.doesNotMatch(astro, /function stackTops/);
		assert.match(astro, /classList\.contains\('split-frame'\)/);
		assert.match(astro, /classList\.contains\('is-active'\)/);
		assert.match(astro, /settledPlaced/);
		assert.match(astro, /--imagery-h/);
		assert.doesNotMatch(astro, /laidOutSides\(/);
		assert.doesNotMatch(astro, /plateFloorPx\(/);
		assert.doesNotMatch(astro, /singleGutterPx\(/);
		assert.doesNotMatch(astro, /singlePlatePx\(/);
		assert.doesNotMatch(astro, /fitPlateToFloor\(/);
		assert.doesNotMatch(astro, /imageryHeightPx\(/);
		assert.doesNotMatch(astro, /svhCache/);
		assert.doesNotMatch(astro, /measureSvh\(/);
		assert.doesNotMatch(astro, /function noteMaxWidth/);
		assert.match(astro, /is-scrim/);
		assert.match(astro, /data-omit-leader/);
		const readStart = astro.indexOf('class="split-read"');
		const readEnd = astro.indexOf('nonRevealDetails.length', readStart);
		const read = astro.slice(readStart, readEnd);
		assert.ok(readStart >= 0 && readEnd > readStart);
		assert.equal(read.includes('class="mark-list"'), false);
		assert.match(read, /visibleDetailText\(detail\)/);
		assert.match(read, /showDetailsNote\(record\)/);
		assert.match(
			css,
			/\.record-page--split \.mark-list li\.is-scrim \{\s*background:\s*var\(--bg\);\s*padding:\s*0\.35rem 0\.45rem;\s*\}/,
		);
	});

	it('keeps a measured pane when reduced motion collapses the imagery band', () => {
		const here = dirname(fileURLToPath(import.meta.url));
		const css = readFileSync(join(here, '../styles/global.css'), 'utf8');
		const splitCss = css.slice(css.indexOf('.record-page--split'));
		assert.doesNotMatch(splitCss, /\.split-imagery\s*\{[^}]*container-type:\s*size/s);
		assert.match(
			splitCss,
			/\.record-page--split \.split-frame\s*\{[^}]*height:\s*var\(--imagery-h\);[^}]*container-type:\s*size/s,
		);
		const desktopStart = splitCss.indexOf('@media (min-width: 48rem)');
		const after = splitCss.slice(desktopStart + 10);
		const desktopBody = splitCss.slice(desktopStart, desktopStart + 10 + after.indexOf('@media'));
		assert.match(desktopBody, /\.split-frame\s*\{[^}]*height:\s*100svh/s);
		assert.doesNotMatch(desktopBody, /var\(--imagery-h\)/);

		const reduceAttr = splitCss.slice(splitCss.indexOf("html[data-motion='reduce']"));
		const reduceFrame = reduceAttr.match(
			/html\[data-motion='reduce'\] \.record-page--split \.split-frame \{[^}]*\}/s,
		);
		assert.ok(reduceFrame);
		assert.equal(/height:\s*auto/.test(reduceFrame[0]), false);
		assert.match(reduceAttr, /\.split-imagery\s*\{[^}]*height:\s*auto/s);

		const prefer = splitCss.slice(splitCss.indexOf('@media (prefers-reduced-motion: reduce)'));
		const preferFrame = prefer.match(/\.record-page--split \.split-frame \{[^}]*\}/s);
		assert.ok(preferFrame);
		assert.equal(/height:\s*auto/.test(preferFrame[0]), false);
		assert.match(prefer, /\.split-imagery\s*\{[^}]*height:\s*auto/s);
	});
});

describe('plate hold', () => {
	it('eager-loads split plates and lets is-plate beat the unsettled veil', () => {
		const here = dirname(fileURLToPath(import.meta.url));
		const astro = readFileSync(join(here, '../pages/records/[id].astro'), 'utf8');
		const split = astro.slice(
			astro.indexOf('revealDetails.map((detail, index)'),
			astro.indexOf('class="split-read"'),
		);
		assert.equal(split.includes('loading="lazy"'), false);
		assert.equal(split.includes("loading={index === 0 ? 'eager' : 'lazy'}"), false);
		assert.equal((split.match(/loading="eager"/g) ?? []).length, 3);
		assert.equal((split.match(/fetchpriority=\{index === 0 \? 'high' : 'auto'\}/g) ?? []).length, 1);
		assert.ok(astro.includes('loading="lazy"'));
		assert.match(astro, /classList\.toggle\('is-plate', showContent && paint\.plateOpacity === 1\)/);
		assert.equal(astro.includes('visual.uprightOpacity'), false);
		assert.equal(astro.includes('visual.plateOpacity'), false);

		const css = readFileSync(join(here, '../styles/global.css'), 'utf8');
		const splitHold = css.indexOf('.record-page--split .split-frame:not(.is-settled) .plate');
		const plateOn = css.indexOf('.split-frame.is-plate');
		assert.ok(splitHold >= 0 && plateOn > splitHold);
		const reduce = css.indexOf("html[data-motion='reduce']", plateOn);
		const block = css.slice(plateOn, reduce);
		assert.match(block, /img\.plate\s*\{[^}]*opacity:\s*1/s);
		assert.match(block, /\.upright-outer\s*\{[^}]*opacity:\s*0/s);
		assert.match(block, /visibility:\s*hidden/);
		assert.equal(block.includes('.crop-window'), false);
		assert.equal(block.includes('mark-leader'), false);
		assert.equal(block.includes('mark-graphics'), false);
		assert.equal(block.includes('mark-list'), false);
	});
});

describe('contain and plate box', () => {
	const labelNatural: PxSize = { width: 1050, height: 1400 };
	const coverNatural: PxSize = { width: 1400, height: 1400 };
	const labelPlate: PxSize = { width: 400, height: 400 };
	const coverPlate: PxSize = { width: 400, height: 248 };
	const labelCrop = { x: 274, y: 403, w: 514, h: 514 };
	const coverCrop = { x: 219, y: 210, w: 379, h: 235 };
	const desk: PxSize = { width: 801, height: 900 };
	const phone: PxSize = { width: 354, height: 489.5 };

	function near(actual: number, expected: number, tol = 1e-6): void {
		assert.ok(
			Math.abs(actual - expected) <= tol,
			`${actual} not within ${tol} of ${expected}`,
		);
	}

	it('contain-maximizes the upright in the pane', () => {
		assert.equal(OPEN_INSET, 0.72);
		assert.equal(ZOOM_GAIN, 1.25);
		assert.equal(PLATE_CAP, 0.92);

		const label = openingBox(desk, labelNatural);
		assert.equal(label.width, 675);
		near(label.height, 900);
		assert.equal(label.left, 63);
		near(label.top, 0);

		const cover = openingBox(desk, coverNatural);
		assert.equal(cover.width, 801);
		assert.equal(cover.height, 801);
		assert.equal(cover.left, 0);
		assert.equal(cover.top, 49.5);

		const phoneLabel = openingBox(phone, labelNatural);
		assert.equal(phoneLabel.width, 354);
		assert.equal(phoneLabel.height, 472);
		assert.equal(phoneLabel.left, 0);
		assert.equal(phoneLabel.top, 8.75);

		const phoneCover = openingBox(phone, coverNatural);
		near(phoneCover.width, 354);
		near(phoneCover.height, 354);
		near(phoneCover.left, 0);
		near(phoneCover.top, 67.75);

		assert.deepEqual(openingBox({ width: 0, height: 900 }, labelNatural), {
			left: 0,
			top: 0,
			width: 0,
			height: 0,
		});
	});

	it('fits MHJL 329 plates inside 72% of the opening and keeps the zoom gain', () => {
		const labelU = openingBox(desk, labelNatural);
		const labelS = plateBox(desk, labelU, labelPlate, labelNatural, labelCrop);
		assert.equal(labelS.width, 486);
		assert.equal(labelS.height, 486);
		assert.equal(labelS.left, 157.5);
		assert.equal(labelS.top, 207);
		assert.ok(labelS.width < labelU.width);
		assert.ok(labelS.height < labelU.height);
		const labelMag = 486 / 514 / (675 / 1050);
		near(labelMag, 0.72 * (1050 / 514));
		near(labelMag, 1.47, 0.005);

		const coverU = openingBox(desk, coverNatural);
		const coverS = plateBox(desk, coverU, coverPlate, coverNatural, coverCrop);
		const coverFitW = 801 * 0.72;
		const coverFitH = coverFitW * (248 / 400);
		near(coverS.width, coverFitW);
		near(coverS.height, coverFitH);
		assert.equal(Math.round(coverS.width), 577);
		assert.equal(Math.round(coverS.height), 358);
		assert.equal(coverS.left, (801 - coverS.width) / 2);
		assert.equal(coverS.top, (900 - coverS.height) / 2);
		assert.ok(coverS.width < coverU.width && coverS.height < coverU.height);
		const coverS1 = Math.min(coverS.width / 379, coverS.height / 235);
		const coverS0 = coverU.width / 1400;
		assert.ok(coverS1 >= 1.25 * coverS0);
		near(coverS1 / coverS0, 2.66, 0.01);

		const phoneLabelS = plateBox(
			phone,
			openingBox(phone, labelNatural),
			labelPlate,
			labelNatural,
			labelCrop,
		);
		assert.equal(Math.round(phoneLabelS.width), 255);
		assert.equal(Math.round(phoneLabelS.height), 255);
		const phoneCoverS = plateBox(
			phone,
			openingBox(phone, coverNatural),
			coverPlate,
			coverNatural,
			coverCrop,
		);
		assert.equal(Math.round(phoneCoverS.width), 255);
		assert.equal(Math.round(phoneCoverS.height), 158);

		const before = { ...labelS };
		plateBox(desk, labelU, labelPlate, labelNatural, labelCrop);
		assert.deepEqual(labelS, before);
	});

	it('grows a weak zoom up to 1.25 and stops at 92% of the opening', () => {
		const pane: PxSize = { width: 1000, height: 1000 };
		const natural: PxSize = { width: 1000, height: 1000 };
		const plate: PxSize = { width: 400, height: 400 };
		const opening = openingBox(pane, natural);
		const grown = plateBox(pane, opening, plate, natural, { x: 0, y: 0, w: 720, h: 720 });
		assert.equal(grown.width, 900);
		assert.equal(grown.height, 900);
		assert.ok(grown.width < opening.width);
		const capped = plateBox(pane, opening, plate, natural, { x: 0, y: 0, w: 900, h: 900 });
		near(capped.width, 920);
		near(capped.height, 920);
		near(capped.width / 900, 0.92 * (1000 / 900));
		assert.deepEqual(plateBox(pane, opening, { width: 0, height: 400 }, natural, labelCrop), {
			left: 0,
			top: 0,
			width: 0,
			height: 0,
		});
	});

	it('shrinks a narrow crop so each side keeps a letterbox band', () => {
		assert.equal(LETTERBOX_BAND_RESERVE_REM, 3.4);
		const reserve = LETTERBOX_BAND_RESERVE_REM * 18;
		const bare = plateBox(phone, openingBox(phone, labelNatural), labelPlate, labelNatural, labelCrop);
		const reserved = plateBox(
			phone,
			openingBox(phone, labelNatural),
			labelPlate,
			labelNatural,
			labelCrop,
			reserve,
		);
		assert.ok(reserved.width < bare.width);
		assert.ok(reserved.height < bare.height);
		const opening = openingBox(phone, labelNatural);
		assert.ok(reserved.width < opening.width && reserved.height < opening.height);
		const bandY = (phone.height - reserved.height) / 2;
		const bandX = (phone.width - reserved.width) / 2;
		assert.ok(bandY + 1e-6 >= reserve);
		assert.ok(bandX + 1e-6 >= reserve);
		const uprightCrop = 514 * (opening.width / labelNatural.width);
		assert.ok(reserved.width / uprightCrop > 1.2);
	});
});

describe('zoom path', () => {
	const desk = { width: 801, height: 900 };
	const natural = { width: 1050, height: 1400 };
	const crop = { x: 274, y: 403, w: 514, h: 514 };
	const opening = openingBox(desk, natural);
	const plate = plateBox(desk, opening, { width: 400, height: 400 }, natural, crop);

	function near(actual: number, expected: number, tol = 1e-6): void {
		assert.ok(Math.abs(actual - expected) <= tol, `${actual} vs ${expected}`);
	}

	it('starts on U, ends with the crop on S, and scales geometrically', () => {
		const start = zoomImageBox({ opening, plate, natural, crop, cropT: 0 });
		assert.equal(start.left, opening.left);
		assert.equal(start.top, opening.top);
		assert.equal(start.width, opening.width);
		assert.equal(start.height, opening.height);

		const end = zoomImageBox({ opening, plate, natural, crop, cropT: 1 });
		const s1 = Math.min(plate.width / crop.w, plate.height / crop.h);
		near(end.left + crop.x * s1, plate.left);
		near(end.top + crop.y * s1, plate.top);
		near(crop.w * s1, plate.width);
		near(crop.h * s1, plate.height);

		const mid = zoomImageBox({ opening, plate, natural, crop, cropT: 0.5 });
		const s0 = opening.width / natural.width;
		near(mid.width / natural.width, s0 * Math.sqrt(s1 / s0));
		const focusX = crop.x + crop.w / 2;
		const focusY = crop.y + crop.h / 2;
		const cx0 = opening.left + focusX * s0;
		const cy0 = opening.top + focusY * s0;
		const cx1 = plate.left + plate.width / 2;
		const cy1 = plate.top + plate.height / 2;
		near(mid.left + focusX * (mid.width / natural.width), (cx0 + cx1) / 2);
		near(mid.top + focusY * (mid.height / natural.height), (cy0 + cy1) / 2);

		const below = zoomImageBox({ opening, plate, natural, crop, cropT: -1 });
		assert.equal(below.width, opening.width);
		const above = zoomImageBox({ opening, plate, natural, crop, cropT: 2 });
		near(above.width, end.width);
	});

	it('is not one cameraBox view for the whole zoom', () => {
		const end = zoomImageBox({ opening, plate, natural, crop, cropT: 1 });
		const paneEnd = cameraBox(801, 900, 1050, 1400, crop, 1);
		const plateStart = cameraBox(plate.width, plate.height, 1050, 1400, crop, 0);
		assert.ok(Math.abs(end.width - paneEnd.width) > 50);
		assert.ok(Math.abs(opening.width - plateStart.width) > 50);

		const here = dirname(fileURLToPath(import.meta.url));
		const source = readFileSync(join(here, 'split-stage.ts'), 'utf8');
		const body = source.slice(
			source.indexOf('export function cameraBox('),
			source.indexOf('export function stageVisual('),
		);
		assert.match(body, /const s0 = Math\.min\(viewW \/ naturalW, viewH \/ naturalH\);/);
		assert.match(body, /const s1 = Math\.min\(viewW \/ crop\.w, viewH \/ crop\.h\);/);
		assert.match(
			body,
			/const s = s0 === s1 \|\| s0 <= 0 \|\| s1 <= 0 \? s0 : s0 \* \(s1 \/ s0\) \*\* u;/,
		);
		assert.match(body, /const cx = cx0 \+ \(viewW \/ 2 - cx0\) \* u;/);
		assert.match(body, /const cy = cy0 \+ \(viewH \/ 2 - cy0\) \* u;/);
		assert.equal(body.includes('0.72'), false);
		assert.equal(body.includes('1.618'), false);
		assert.equal(body.includes('zoomImageBox'), false);
		assert.equal(source.includes('lerpBox'), false);
	});
});

describe('margin-first notes', () => {
	const rem = 18;
	const labelNatural = { width: 1050, height: 1400 };
	const coverNatural = { width: 1400, height: 1400 };
	const labelPlate = { width: 400, height: 400 };
	const coverPlate = { width: 400, height: 248 };
	const labelCrop = { x: 274, y: 403, w: 514, h: 514 };
	const coverCrop = { x: 219, y: 210, w: 379, h: 235 };
	const desk = { width: 801, height: 900 };
	const phone = { width: 354, height: 489.5 };

	function draft(index: number, side: 'left' | 'right', height = 24): NoteDraft {
		return {
			index,
			side,
			anchor: 200,
			height,
			mark: { x: 10, y: 10, w: 20, h: 20, badge: 'tl' },
		};
	}

	function marked(index: number, side: 'left' | 'right', height: number, anchor: number): NoteDraft {
		return {
			index,
			side,
			anchor,
			height,
			mark: { x: 10, y: 10, w: 20, h: 20, badge: 'tl' },
		};
	}

	it('uses the side strip, then the letterbox, then the scrim', () => {
		assert.equal(MIN_NOTE_REM, 6.5);
		assert.equal(MIN_BAND_REM, 2.6);
		assert.equal(NOTE_CAP_REM, 9.5);

		const deskLabel = plateBox(desk, openingBox(desk, labelNatural), labelPlate, labelNatural, labelCrop);
		const labelNotes = placeNotes({
			pane: desk,
			plate: deskLabel,
			plateSize: labelPlate,
			rem,
			notes: [draft(0, 'left'), draft(1, 'right')],
		});
		assert.deepEqual(
			labelNotes.map((note) => note.kind),
			['side', 'side'],
		);
		assert.ok(labelNotes.every((note) => note.omitLeader === false));
		assert.equal(labelNotes[0].width, (801 - 486) / 2);
		assert.equal(labelNotes[0].left, deskLabel.left - labelNotes[0].width);
		assert.equal(labelNotes[1].left, deskLabel.left + deskLabel.width);
		assert.equal(labelNotes[0].width / rem, 8.75);

		const deskCover = plateBox(desk, openingBox(desk, coverNatural), coverPlate, coverNatural, coverCrop);
		const coverNotes = placeNotes({
			pane: desk,
			plate: deskCover,
			plateSize: coverPlate,
			rem,
			notes: [draft(0, 'left'), draft(1, 'right')],
		});
		assert.deepEqual(
			coverNotes.map((note) => note.kind),
			['letterbox', 'letterbox'],
		);
		assert.equal(coverNotes[0].width, 9.5 * rem);
		assert.equal(coverNotes.every((note) => note.omitLeader === false), true);
		for (const note of coverNotes) {
			const overlaps =
				note.left < deskCover.left + deskCover.width - 1e-6 &&
				note.left + note.width > deskCover.left + 1e-6 &&
				note.top < deskCover.top + deskCover.height - 1e-6 &&
				note.top + note.height > deskCover.top + 1e-6;
			assert.equal(overlaps, false, `synthetic cover note ${note.index} overlaps the plate`);
		}

		const phoneLabel = plateBox(
			phone,
			openingBox(phone, labelNatural),
			labelPlate,
			labelNatural,
			labelCrop,
		);
		const phoneFit = placeNotes({
			pane: phone,
			plate: phoneLabel,
			plateSize: labelPlate,
			rem,
			notes: [draft(0, 'right', 24)],
		});
		assert.equal(phoneFit[0].kind, 'letterbox');
		const phoneSpill = placeNotes({
			pane: phone,
			plate: phoneLabel,
			plateSize: labelPlate,
			rem,
			notes: [draft(0, 'right', 130)],
		});
		assert.equal(phoneSpill[0].kind, 'scrim');
		assert.equal(phoneSpill[0].omitLeader, false);

		const frozen = { ...deskLabel };
		placeNotes({
			pane: desk,
			plate: deskLabel,
			plateSize: labelPlate,
			rem,
			notes: [draft(0, 'left', 4000)],
		});
		assert.deepEqual(deskLabel, frozen);
	});

	it('sends a side-strip overflow to the scrim and keeps a clear scrim off the marks', () => {
		const plate: FrameBox = { left: 200, top: 100, width: 200, height: 100 };
		const pane = { width: 600, height: 300 };
		const stacked = placeNotes({
			pane,
			plate,
			plateSize: { width: 100, height: 100 },
			rem,
			notes: [
				{
					index: 0,
					side: 'right',
					anchor: 40,
					height: 280,
					mark: { x: 0, y: 0, w: 8, h: 8, badge: 'tl' },
				},
				{
					index: 1,
					side: 'right',
					anchor: 40,
					height: 40,
					mark: { x: 80, y: 0, w: 8, h: 8, badge: 'tr' },
				},
			],
		});
		assert.equal(stacked[0].kind, 'side');
		assert.equal(stacked[1].kind, 'scrim');

		const tight: FrameBox = { left: 20, top: 20, width: 160, height: 160 };
		const clear = placeNotes({
			pane: { width: 200, height: 200 },
			plate: tight,
			plateSize: { width: 100, height: 100 },
			rem,
			notes: [
				{
					index: 0,
					side: 'right',
					anchor: 50,
					height: 16,
					mark: { x: 0, y: 0, w: 10, h: 10, badge: 'tl' },
				},
			],
		});
		assert.equal(clear[0].kind, 'scrim');
		assert.equal(clear[0].side, 'right');
		assert.equal(clear[0].omitLeader, false);
		assert.ok(clear[0].top >= tight.top - 1e-6);
		assert.ok(clear[0].top + 16 <= tight.top + tight.height + 1e-6);
		const scale = tight.width / 100;
		const markRight = tight.left + 10 * scale;
		const markBottom = tight.top + 10 * scale;
		assert.ok(clear[0].left >= markRight || clear[0].top >= markBottom);
	});

	it('moves a blocked scrim note onto the side with less box area and omits its leader', () => {
		const plate: FrameBox = { left: 0, top: 0, width: 200, height: 100 };
		const placed = placeNotes({
			pane: { width: 200, height: 100 },
			plate,
			plateSize: { width: 200, height: 100 },
			rem,
			notes: [
				{
					index: 0,
					side: 'right',
					anchor: 50,
					height: 30,
					mark: { x: 100, y: 0, w: 100, h: 100, badge: 'tr' },
				},
			],
		});
		assert.equal(placed[0].kind, 'scrim');
		assert.equal(placed[0].side, 'left');
		assert.equal(placed[0].omitLeader, true);
		assert.ok(placed[0].left >= 0.55 * rem - 1e-6);
	});

	it('finds the clear scrim slot at the bottom of S when the centered top starts above the plate', () => {
		const plate: FrameBox = { left: 20, top: 20, width: 400, height: 200 };
		const pane = { width: 440, height: 240 };
		const height = 40;
		const plateSize = { width: 400, height: 200 };
		const centeredTop = plate.top + 0 * (plate.height / plateSize.height) - height / 2;
		const bottom = plate.top + plate.height - height;
		assert.ok(centeredTop < plate.top);
		assert.ok((pane.width - plate.width) / 2 < MIN_NOTE_REM * rem);
		assert.ok((pane.height - plate.height) / 2 < MIN_BAND_REM * rem);
		const placed = placeNotes({
			pane,
			plate,
			plateSize,
			rem,
			notes: [
				{
					index: 0,
					side: 'right',
					anchor: 0,
					height,
					mark: { x: 200, y: 0, w: 200, h: plateSize.height - height },
				},
			],
		});
		assert.equal(placed[0].kind, 'scrim');
		assert.equal(placed[0].omitLeader, false);
		assert.ok(Math.abs(placed[0].top - bottom) <= 1e-6);
	});

	it('stacks same-side scrim notes that share an anchor', () => {
		const plate: FrameBox = { left: 30, top: 50, width: 360, height: 240 };
		const pane = { width: 400, height: 280 };
		const height = 40;
		assert.ok((pane.width - plate.width) / 2 < MIN_NOTE_REM * rem);
		assert.ok((pane.height - plate.height) / 2 < MIN_BAND_REM * rem);
		const mark = { x: 0, y: 0, w: 10, h: 10, badge: 'tl' as const };
		const placed = placeNotes({
			pane,
			plate,
			plateSize: { width: 360, height: 240 },
			rem,
			notes: [
				{ index: 1, side: 'right', anchor: 120, height, mark },
				{ index: 0, side: 'right', anchor: 120, height, mark },
			],
		});
		assert.equal(placed[0].kind, 'scrim');
		assert.equal(placed[1].kind, 'scrim');
		assert.equal(placed[0].side, 'right');
		assert.equal(placed[1].side, 'right');
		assert.ok(placed[1].top < placed[0].top);
		assert.ok(placed[0].top + 1e-6 >= placed[1].top + height + 0.35 * rem);
		for (const note of placed) {
			assert.ok(note.top >= plate.top - 1e-6);
			assert.ok(note.top + note.height <= plate.top + plate.height + 1e-6);
		}
	});

	it('packs a narrow note against S and overflows what does not fit', () => {
		const fixture = phoneMarginFirst;
		const phone = { width: fixture.pane.width, height: fixture.pane.height };
		const labelNatural = { width: 1050, height: 1400 };
		const coverNatural = { width: 1400, height: 1400 };
		const labelPlateSize = { width: 400, height: 400 };
		const coverPlateSize = { width: 400, height: 248 };
		const labelCrop = { x: 274, y: 403, w: 514, h: 514 };
		const coverCrop = { x: 219, y: 210, w: 379, h: 235 };
		const phoneLabel = plateBox(phone, openingBox(phone, labelNatural), labelPlateSize, labelNatural, labelCrop);
		const phoneCover = plateBox(phone, openingBox(phone, coverNatural), coverPlateSize, coverNatural, coverCrop);
		assert.ok(Math.abs(phoneLabel.width - 255) <= 2);
		assert.ok(Math.abs(phoneLabel.height - 255) <= 2);
		assert.ok(Math.abs(phoneCover.width - 255) <= 2);
		assert.ok(Math.abs(phoneCover.height - 158) <= 2);
		assert.ok((phone.width - phoneLabel.width) / 2 / fixture.rem < MIN_NOTE_REM);

		const fit = placeNotes({
			pane: phone,
			plate: phoneLabel,
			plateSize: labelPlateSize,
			rem: fixture.rem,
			narrow: true,
			notes: [marked(0, 'right', 24, 200)],
		});
		assert.equal(fit[0].kind, 'letterbox');
		assert.equal(fit[0].side, 'right');
		assert.equal(fit[0].omitLeader, false);
		assert.equal(fit[0].width, fixture.letterboxWidth);
		assert.ok(fit[0].top + fit[0].height <= phoneLabel.top + 1e-6 || fit[0].top >= phoneLabel.top + phoneLabel.height - 1e-6);
		assert.ok(fit[0].left >= -1e-6 && fit[0].left + fit[0].width <= phone.width + 1e-6);
		assert.equal(fit.some((note) => note.kind === 'scrim'), false);
		const fitLeader = selectSplitLeaders([
			{
				index: 0,
				kind: 'letterbox',
				mark: { x: 10, y: 10, w: 20, h: 20 },
				side: 'right',
				note: placementLeaderRect(fit[0], phoneLabel, labelPlateSize),
				omitLeader: false,
			},
		]);
		assert.ok(fitLeader[0]?.points && fitLeader[0].points.length >= 2);

		const spill = placeNotes({
			pane: phone,
			plate: phoneLabel,
			plateSize: labelPlateSize,
			rem: fixture.rem,
			narrow: true,
			notes: [marked(0, 'right', 130, 200)],
		});
		assert.equal(spill[0].kind, 'overflow');
		assert.equal(spill[0].omitLeader, true);
		assert.notEqual(spill[0].height, 130);
		const scaleX = phoneLabel.width / labelPlateSize.width;
		const scaleY = phoneLabel.height / labelPlateSize.height;
		assert.ok(Math.abs(spill[0].left - (phoneLabel.left + 10 * scaleX)) <= 1e-6);
		assert.ok(Math.abs(spill[0].top - (phoneLabel.top + 10 * scaleY)) <= 1e-6);
		assert.ok(Math.abs(spill[0].width - 20 * scaleX) <= 1e-6);
		assert.ok(Math.abs(spill[0].height - 20 * scaleY) <= 1e-6);

		const five = placeNotes({
			pane: phone,
			plate: phoneLabel,
			plateSize: labelPlateSize,
			rem: fixture.rem,
			narrow: true,
			notes: [0, 1, 2, 3, 4].map((index) => marked(index, 'right', 40, index)),
		});
		assert.equal(five.some((note) => note.kind === 'scrim'), false);
		assert.ok(five.filter((note) => note.kind === 'letterbox').length >= 4);
		for (const note of five) {
			if (note.kind === 'overflow') assert.equal(note.omitLeader, true);
			else assert.equal(note.omitLeader, false);
		}

		const desk = { width: 801, height: 900 };
		const deskLabel = plateBox(desk, openingBox(desk, labelNatural), labelPlateSize, labelNatural, labelCrop);
		const marginNotes = placeNotes({
			pane: desk,
			plate: deskLabel,
			plateSize: labelPlateSize,
			rem: fixture.rem,
			narrow: true,
			notes: [draft(0, 'left'), draft(1, 'right')],
		});
		assert.deepEqual(
			marginNotes.map((note) => note.kind),
			['side', 'side'],
		);
		const dropped = placeNotes({
			pane: desk,
			plate: deskLabel,
			plateSize: labelPlateSize,
			rem: fixture.rem,
			narrow: true,
			notes: [marked(0, 'left', 4000, 200)],
		});
		assert.notEqual(dropped[0].kind, 'scrim');
		assert.notEqual(dropped[0].kind, 'side');

		const bare = settledImageryHeight({
			paneHeight: phone.height,
			plate: { top: phoneLabel.top, bottom: phoneLabel.top + phoneLabel.height },
			notes: [],
			padPx: fixture.padPx,
		});
		const withLetterbox = settledImageryHeight({
			paneHeight: phone.height,
			plate: { top: phoneLabel.top, bottom: phoneLabel.top + phoneLabel.height },
			notes: [{ top: fit[0].top, bottom: fit[0].top + fit[0].height }],
			padPx: fixture.padPx,
		});
		const coverBare = settledImageryHeight({
			paneHeight: phone.height,
			plate: { top: phoneCover.top, bottom: phoneCover.top + phoneCover.height },
			notes: [],
			padPx: fixture.padPx,
		});
		assert.equal(bare, fixture.contentH.collapsedLabel);
		assert.ok(withLetterbox > bare);
		assert.ok(withLetterbox < fixture.contentH.stylesheetPane);
		assert.ok(bare < fixture.contentH.stylesheetPane);
		assert.ok(Math.abs(coverBare - fixture.contentH.collapsedCover) <= fixture.contentH.tolerancePx);
		assert.equal(fixture.shift.delta, 79.81);
		assert.equal(fixture.shift.plateTop, 37.5);
		assert.equal(fixture.shift.noteTop, 13.5);

		const frozen = { ...phoneLabel };
		placeNotes({
			pane: phone,
			plate: phoneLabel,
			plateSize: labelPlateSize,
			rem: fixture.rem,
			narrow: true,
			notes: [marked(0, 'right', 24, 200)],
		});
		assert.deepEqual(phoneLabel, frozen);
	});

	it('puts an expanded sentence in the leftover letterbox, else one scrim', () => {
		const fixture = phoneMarginFirst;
		const phone = { width: fixture.pane.width, height: fixture.pane.height };
		const labelNatural = { width: 1050, height: 1400 };
		const labelPlateSize = { width: 400, height: 400 };
		const labelCrop = { x: 274, y: 403, w: 514, h: 514 };
		const plate = plateBox(phone, openingBox(phone, labelNatural), labelPlateSize, labelNatural, labelCrop);
		const note = marked(0, 'right', 24, 200);
		const open = placeExpandedPanel({
			pane: phone,
			plate,
			plateSize: labelPlateSize,
			rem: fixture.rem,
			note,
			notes: [note],
			letterboxHeight: 24,
			scrimHeight: 40,
			occupied: [],
		});
		assert.equal(open.kind, 'letterbox');
		assert.equal(open.side, 'right');
		assert.equal(open.omitLeader, false);
		assert.equal(open.left, fixture.height24.left);
		assert.ok(Math.abs(open.top - fixture.height24.top) <= 1e-6);
		assert.equal(open.width, fixture.letterboxWidth);

		const occupiedTop = plate.top - 24;
		const beside = placeExpandedPanel({
			pane: phone,
			plate,
			plateSize: labelPlateSize,
			rem: fixture.rem,
			note,
			notes: [note],
			letterboxHeight: 24,
			scrimHeight: 40,
			occupied: [
				{
					side: 'right',
					left: fixture.height24.left,
					top: occupiedTop,
					width: fixture.letterboxWidth,
					height: 24,
				},
			],
		});
		assert.equal(beside.kind, 'letterbox');
		assert.ok(Math.abs(beside.top - (occupiedTop - fixture.gapPx - 24)) <= 1e-6);
		assert.equal(beside.omitLeader, false);

		const scrim = placeExpandedPanel({
			pane: phone,
			plate,
			plateSize: labelPlateSize,
			rem: fixture.rem,
			note: marked(0, 'right', 130, 200),
			notes: [marked(0, 'right', 130, 200)],
			letterboxHeight: 130,
			scrimHeight: 40,
			occupied: [],
		});
		assert.equal(scrim.kind, 'scrim');
		assert.ok(scrim.width < plate.width / 2);
		assert.ok(scrim.width <= 9.5 * fixture.rem + 1e-6);
		assert.equal(scrim.omitLeader, false);

		const blocked = placeExpandedPanel({
			pane: phone,
			plate,
			plateSize: labelPlateSize,
			rem: fixture.rem,
			note: marked(0, 'right', 130, 200),
			notes: [marked(0, 'right', 130, 200)],
			letterboxHeight: 130,
			scrimHeight: plate.height + 40,
			occupied: [],
		});
		assert.equal(blocked.kind, 'scrim');
		assert.equal(blocked.omitLeader, true);
		assert.ok(blocked.width < plate.width / 2);
	});
});

describe('split pose source', () => {
	it('clips the upright to the pane and zooms toward S', () => {
		const here = dirname(fileURLToPath(import.meta.url));
		const astro = readFileSync(join(here, '../pages/records/[id].astro'), 'utf8');
		const split = astro.slice(astro.indexOf('class="split-stage"'), astro.indexOf('class="split-read"'));
		assert.equal(split.includes('upright-clip'), false);
		assert.equal(split.includes('mark-slot'), false);
		const windowAt = split.indexOf('data-fill-crop="window"');
		const stageAt = split.indexOf('class="detail-stage"');
		const listAt = split.indexOf('class="mark-list"');
		assert.ok(windowAt >= 0 && stageAt > windowAt && listAt > stageAt);
		assert.match(astro, /function layoutSplit\(figure: HTMLElement\)/);
		assert.match(astro, /openingBox\(/);
		assert.match(astro, /plateBox\(/);
		assert.match(astro, /zoomImageBox\(\{[\s\S]*?cropT:\s*visual\.cropT/);
		assert.equal(astro.includes('cameraBox('), false);
		assert.equal(astro.includes("objectFit = 'cover'"), false);
		assert.match(astro, /upright\.style\.objectFit = 'fill'/);
		assert.match(astro, /function ensureSlots\(figure: HTMLElement\): void \{[\s\S]*?split-frame'\)\) return;/);
		const slots = astro.slice(astro.indexOf('function ensureSlots'), astro.indexOf('function clearStageInline'));
		assert.ok(slots.indexOf('split-frame') < slots.indexOf('querySelector'));
		const legacy = astro.slice(astro.indexOf('class="record-split"'), astro.indexOf('class="split-stage"'));
		assert.match(legacy, /mark-slot mark-slot-left/);
		assert.match(legacy, /mark-slot mark-slot-right/);
		assert.match(legacy, /class="upright-clip"/);
		assert.equal(legacy.includes('data-fill-crop'), false);
		const afterRead = astro.slice(astro.indexOf('class="split-read"'));
		assert.match(afterRead, /class="upright-clip"/);
	});
});

describe('leader omission', () => {
	it('drops a centerline that meets the note and keeps one that stops short', () => {
		const note = { left: 40, right: 80, top: 0, bottom: 30 };
		assert.equal(
			leaderHitsNote(
				[
					{ x: 0, y: 10 },
					{ x: 20, y: 10 },
					{ x: 30, y: 15 },
				],
				note,
			),
			false,
		);
		assert.equal(
			leaderHitsNote(
				[
					{ x: 0, y: 10 },
					{ x: 50, y: 10 },
				],
				note,
			),
			true,
		);
		assert.equal(
			leaderHitsNote(
				[
					{ x: 50, y: 10 },
					{ x: 60, y: 10 },
				],
				note,
			),
			true,
		);
		assert.equal(
			leaderHitsNote(
				[
					{ x: 0, y: 10 },
					{ x: 40, y: 10 },
				],
				note,
			),
			true,
		);
		assert.equal(leaderHitsNote([], note), false);
	});
});

describe('mark-box understroke', () => {
	it('keeps a single accent stroke over an opaque paper halo so plate print cannot read as an inner black ring', () => {
		const here = dirname(fileURLToPath(import.meta.url));
		const css = readFileSync(join(here, '../styles/global.css'), 'utf8');
		const astro = readFileSync(join(here, '../pages/records/[id].astro'), 'utf8');
		assert.match(css, /\.mark-box-halo\s*\{[^}]*fill:\s*none/s);
		assert.match(css, /\.mark-box-halo\s*\{[^}]*stroke:\s*var\(--bg\)/s);
		assert.match(css, /\.mark-box\s*\{[^}]*stroke:\s*var\(--accent\)/s);
		assert.match(css, /\.mark-box\s*\{[^}]*shape-rendering:\s*geometricPrecision/s);
		const forced = css.slice(
			css.indexOf('@media (forced-colors: active)'),
			css.indexOf('@media (forced-colors: active)') + 700,
		);
		assert.match(forced, /\.mark-box-halo\s*\{[^}]*stroke:\s*Canvas/s);
		assert.match(forced, /\.mark-box,[\s\S]*stroke:\s*CanvasText/);
		assert.equal((astro.match(/class="mark-box-halo"/g) ?? []).length, 3);
		assert.equal((astro.match(/class="mark-box"/g) ?? []).length, 3);
		// Halo is drawn before the accent rect in every callout template.
		assert.match(
			astro,
			/class="mark-box-halo"[\s\S]{0,400}?class="mark-box"/,
		);
		// Corner badges stay on legacy / letterbox templates.
		assert.match(astro, /class="mark-disc"/);
		assert.match(astro, /class="mark-num"/);
	});
});

describe('split-frame callout chrome', () => {
	it('drops discs on the split frame, prefixes the note, and leaves ml4001 discs in place', () => {
		const here = dirname(fileURLToPath(import.meta.url));
		const astro = readFileSync(join(here, '../pages/records/[id].astro'), 'utf8');
		const css = readFileSync(join(here, '../styles/global.css'), 'utf8');
		const split = astro.slice(astro.indexOf('class="split-stage"'), astro.indexOf('class="split-read"'));
		const legacy = astro.slice(astro.indexOf('class="record-split"'), astro.indexOf('class="split-stage"'));
		assert.equal(split.includes('mark-disc'), false);
		assert.equal(split.includes('mark-num'), false);
		assert.equal(split.includes('badgeCenter'), false);
		assert.match(split, /class="mark-box-halo"/);
		assert.match(split, /class="mark-box"/);
		assert.match(split, /noteIndexPrefix\(markIndex \+ 1\)/);
		assert.match(split, /<p class="mark-note"><span class="mark-index">\{noteIndexPrefix\(markIndex \+ 1\)\}<\/span> \{mark\.note\}<\/p>/);
		assert.match(legacy, /class="mark-disc"/);
		assert.match(legacy, /class="mark-num"/);
		assert.equal(legacy.includes('noteIndexPrefix'), false);
		assert.match(astro, /selectSplitLeaders\(/);
		assert.match(astro, /leaderEndpoints\(/);
		assert.match(astro, /const shortPx = 0\.35 \* remPx\(\)/);
		assert.match(astro, /narrow: isNarrow\(\)/);
		assert.match(astro, /setAttribute\('data-callout', mode\)/);
		assert.match(astro, /splitCalloutMode\(/);
		assert.match(
			css,
			/\.record-page--split \.split-frame \.mark-note \.mark-index\s*\{[^}]*position:\s*static/s,
		);
		const clipped = css.slice(css.indexOf('.mark-index {'), css.indexOf('.mark-label'));
		assert.match(clipped, /width:\s*1px/);
		assert.match(clipped, /clip:\s*rect\(0,\s*0,\s*0,\s*0\)/);
	});
});

describe('mhjl329 phone letterbox leaders', () => {
	function estimate(text: string, column: number): { height: number; glyph: { dx: number; dy: number; width: number; height: number } } {
		const font = 0.78 * 18;
		const line = font * 1.45;
		let row = 0;
		let width = 0;
		let lines = 1;
		for (const ch of text) {
			const code = ch.codePointAt(0) ?? 0;
			const cw = code < 128 ? font * 0.56 : font;
			if (row + cw > column && row > 0) {
				lines += 1;
				width = Math.max(width, row);
				row = cw;
			} else {
				row += cw;
			}
		}
		width = Math.min(column, Math.max(width, row));
		const height = lines * line;
		return { height, glyph: { dx: 0, dy: 0, width, height } };
	}

	function leadersFor(part: 'label' | 'cover') {
		const phone = { width: 354, height: 489.5 };
		const detail = publishedDetails('mhjl329').find((item) => item.part === part);
		assert.ok(detail);
		const natural = part === 'label' ? { width: 1050, height: 1400 } : { width: 1400, height: 1400 };
		const crop =
			part === 'label'
				? { x: 274, y: 403, w: 514, h: 514 }
				: { x: 219, y: 210, w: 379, h: 235 };
		const plateSize = detail.plate;
		const plate = plateBox(
			phone,
			openingBox(phone, natural),
			plateSize,
			natural,
			crop,
			LETTERBOX_BAND_RESERVE_REM * 18,
		);
		const column = Math.min(9.5 * 18, phone.width / 2);
		const numerals = '①②③④⑤⑥';
		const notes = detail.marks.map((mark, index) => {
			const box = estimate(`${numerals[index] ?? ''} ${mark.note ?? ''}`, column);
			return {
				index,
				side: resolvedSide(mark, plateSize.width),
				anchor: mark.y + mark.h / 2,
				height: box.height,
				glyph: box.glyph,
				mark: { x: mark.x, y: mark.y, w: mark.w, h: mark.h },
			};
		});
		const placed = placeNotes({
			pane: phone,
			plate,
			plateSize,
			rem: 18,
			narrow: true,
			notes,
		});
		const rows = selectSplitLeaders(
			notes.map((note) => {
				const place = placed.find((item) => item.index === note.index);
				assert.ok(place);
				return {
					index: note.index,
					kind: place.kind === 'letterbox' ? ('letterbox' as const) : ('side' as const),
					mark: note.mark,
					side: place.side,
					note: place.omitLeader
						? { left: -1e6, right: -1e6 + 1, top: -1e6, bottom: -1e6 + 1 }
						: placementLeaderRect(place, plate, plateSize, note.glyph),
					omitLeader: place.omitLeader,
				};
			}),
		);
		return { placed, rows, plate };
	}

	it('keeps four label leaders and restores the live cover callouts', () => {
		const label = leadersFor('label');
		const labelKept = label.rows.filter((row) => row.points).map((row) => row.index);
		assert.ok(labelKept.length >= 4, `label kept ${labelKept.join(',')}`);
		for (const row of label.rows) {
			if (!row.points) continue;
			const pts: { x: number; y: number }[] = row.points;
			for (let i = 1; i < pts.length; i += 1) {
				const from = pts[i - 1];
				const to = pts[i];
				assert.ok(from && to);
				assert.equal(from.x === to.x || from.y === to.y, true);
			}
			const tip = pts.at(-1);
			const before = pts.at(-2);
			assert.ok(tip && before);
			assert.equal(before.y, tip.y);
			assert.notEqual(before.x, tip.x);
		}
		const cover = leadersFor('cover');
		const coverKept = cover.rows.filter((row) => row.points).map((row) => row.index);
		assert.ok(coverKept.length > 3, `cover kept ${coverKept.join(',')}`);
		for (const index of [1, 2, 3, 4, 5]) {
			assert.ok(coverKept.includes(index), `cover missing ${index} (kept ${coverKept.join(',')})`);
		}
		const breath = LETTERBOX_BREATH_REM * 18;
		for (const index of [3, 4]) {
			const place = cover.placed.find((note) => note.index === index);
			assert.ok(place, `cover note ${index} missing`);
			assert.equal(place.kind, 'letterbox');
			assert.equal(place.omitLeader, false);
			const plateRight = cover.plate.left + cover.plate.width;
			const plateBottom = cover.plate.top + cover.plate.height;
			const overlaps =
				place.left < plateRight - 1e-6 &&
				place.left + place.width > cover.plate.left + 1e-6 &&
				place.top < plateBottom - 1e-6 &&
				place.top + place.height > cover.plate.top + 1e-6;
			assert.equal(overlaps, false, `phone cover note ${index} overlaps the plate`);
			const above = place.top + place.height <= cover.plate.top + 1e-6 ? cover.plate.top - (place.top + place.height) : null;
			const below = place.top >= plateBottom - 1e-6 ? place.top - plateBottom : null;
			const leftOf = place.left + place.width <= cover.plate.left + 1e-6 ? cover.plate.left - (place.left + place.width) : null;
			const rightOf = place.left >= plateRight - 1e-6 ? place.left - plateRight : null;
			const gap = above ?? below ?? leftOf ?? rightOf ?? -1;
			assert.ok(gap + 0.51 >= breath, `phone cover note ${index} gap ${gap} < breath ${breath}`);
		}
		assert.equal(cover.placed.every((note) => note.kind !== 'scrim'), true);
		assert.equal(label.placed.every((note) => note.kind !== 'scrim'), true);
	});
});

describe('mhjl329 phone note ④ after collapse', () => {
	function estimate(text: string, column: number): { height: number; glyph: { dx: number; dy: number; width: number; height: number } } {
		const font = 0.78 * 18;
		const line = font * 1.45;
		let row = 0;
		let width = 0;
		let lines = 1;
		for (const ch of text) {
			const code = ch.codePointAt(0) ?? 0;
			const cw = code < 128 ? font * 0.56 : font;
			if (row + cw > column && row > 0) {
				lines += 1;
				width = Math.max(width, row);
				row = cw;
			} else {
				row += cw;
			}
		}
		width = Math.min(column, Math.max(width, row));
		const height = lines * line;
		return { height, glyph: { dx: 0, dy: 0, width, height } };
	}

	function placePart(part: 'label' | 'cover', pane: PxSize) {
		const detail = publishedDetails('mhjl329').find((item) => item.part === part);
		assert.ok(detail);
		const natural = part === 'label' ? { width: 1050, height: 1400 } : { width: 1400, height: 1400 };
		const crop =
			part === 'label'
				? { x: 274, y: 403, w: 514, h: 514 }
				: { x: 219, y: 210, w: 379, h: 235 };
		const plateSize = detail.plate;
		const plate = plateBox(
			pane,
			openingBox(pane, natural),
			plateSize,
			natural,
			crop,
			LETTERBOX_BAND_RESERVE_REM * 18,
		);
		const column = Math.min(9.5 * 18, pane.width / 2);
		const numerals = '①②③④⑤⑥';
		const notes = detail.marks.map((mark, index) => {
			const box = estimate(`${numerals[index] ?? ''} ${mark.note ?? ''}`, column);
			return {
				index,
				side: resolvedSide(mark, plateSize.width),
				anchor: mark.y + mark.h / 2,
				height: box.height,
				glyph: box.glyph,
				mark: { x: mark.x, y: mark.y, w: mark.w, h: mark.h },
			};
		});
		const placed = placeNotes({
			pane,
			plate,
			plateSize,
			rem: 18,
			narrow: true,
			notes,
		});
		const rows = selectSplitLeaders(
			notes.map((note) => {
				const place = placed.find((item) => item.index === note.index);
				assert.ok(place);
				return {
					index: note.index,
					kind: place.kind === 'letterbox' ? ('letterbox' as const) : ('side' as const),
					mark: note.mark,
					side: place.side,
					note: place.omitLeader
						? { left: -1e6, right: -1e6 + 1, top: -1e6, bottom: -1e6 + 1 }
						: placementLeaderRect(place, plate, plateSize, note.glyph),
					omitLeader: place.omitLeader,
				};
			}),
		);
		return { placed, rows, plate };
	}

	function collapseAndReplace(part: 'label' | 'cover') {
		const tall = { width: 354, height: 700 };
		const first = placePart(part, tall);
		const notes = first.placed
			.filter((place) => place.kind !== 'overflow')
			.map((place) => ({ top: place.top, bottom: place.top + place.height }));
		const hugged = hugSettledPlate({
			paneHeight: tall.height,
			plate: {
				left: first.plate.left,
				top: first.plate.top,
				width: first.plate.width,
				height: first.plate.height,
			},
			notes,
			padPx: 0.75 * 18,
		});
		const second = placePart(part, { width: tall.width, height: hugged.height });
		return { first, second, hugged };
	}

	it('keeps label and cover note index 3 after the pane hugs content', () => {
		for (const part of ['label', 'cover'] as const) {
			const { second } = collapseAndReplace(part);
			const note = second.placed.find((place) => place.index === 3);
			assert.ok(note, `${part} missing note 3`);
			assert.notEqual(note.kind, 'overflow', `${part} note 3 overflowed after hug`);
			assert.equal(note.omitLeader, false, `${part} note 3 omitLeader`);
			const row = second.rows.find((item) => item.index === 3);
			assert.ok(row?.points, `${part} note 3 leader missing (kept ${second.rows.filter((r) => r.points).map((r) => r.index).join(',')})`);
		}
	});

	it('keeps note index 3 on the short phone pane that used to drop it', () => {
		const short = { width: 354, height: 431.148 };
		for (const part of ['label', 'cover'] as const) {
			const result = placePart(part, short);
			const note = result.placed.find((place) => place.index === 3);
			assert.ok(note, `${part} missing note 3`);
			assert.notEqual(note.kind, 'overflow', `${part} note 3 overflowed on short pane`);
			assert.equal(note.omitLeader, false, `${part} note 3 omitLeader on short pane`);
		}
	});
});


describe('falp381 phone insert letterbox', () => {
	function estimate(text: string, column: number): { height: number; glyph: { dx: number; dy: number; width: number; height: number } } {
		const font = 0.78 * 18;
		const line = font * 1.45;
		let row = 0;
		let width = 0;
		let lines = 1;
		for (const ch of text) {
			const code = ch.codePointAt(0) ?? 0;
			const cw = code < 128 ? font * 0.56 : font;
			if (row + cw > column && row > 0) {
				lines += 1;
				width = Math.max(width, row);
				row = cw;
			} else {
				row += cw;
			}
		}
		width = Math.min(column, Math.max(width, row));
		const height = lines * line;
		return { height, glyph: { dx: 0, dy: 0, width, height } };
	}

	function placeInsert(pane: PxSize) {
		const detail = publishedDetails('falp381').find((item) => item.part === 'insert');
		assert.ok(detail);
		const record = (publishedRecords as unknown as Array<{ id: string; details: Array<{ part: string; upright?: { width: number; height: number }; transform?: { crop: { x: number; y: number; w: number; h: number } } }> }>).find(
			(item) => item.id === 'falp381',
		);
		assert.ok(record);
		const source = record.details.find((item) => item.part === 'insert');
		assert.ok(source?.upright && source.transform?.crop);
		const natural = { width: source.upright.width, height: source.upright.height };
		const crop = source.transform.crop;
		const plateSize = detail.plate;
		const plate = plateBox(
			pane,
			openingBox(pane, natural),
			plateSize,
			natural,
			crop,
			LETTERBOX_BAND_RESERVE_REM * 18,
		);
		const column = Math.min(9.5 * 18, pane.width / 2);
		const numerals = '①②③④⑤';
		const notes = detail.marks.map((mark, index) => {
			const box = estimate(`${numerals[index] ?? ''} ${mark.note ?? ''}`, column);
			return {
				index,
				side: resolvedSide(mark, plateSize.width),
				anchor: mark.y + mark.h / 2,
				height: box.height,
				glyph: box.glyph,
				mark: { x: mark.x, y: mark.y, w: mark.w, h: mark.h },
			};
		});
		const placed = placeNotes({
			pane,
			plate,
			plateSize,
			rem: 18,
			narrow: true,
			notes,
		});
		const scaleX = plateSize.width === 0 ? 1 : plate.width / plateSize.width;
		const visibleX = {
			left: (0 - plate.left) / scaleX,
			right: (pane.width - plate.left) / scaleX,
		};
		const leaderInputs = notes.map((note) => {
			const place = placed.find((item) => item.index === note.index);
			assert.ok(place);
			return {
				index: note.index,
				kind: place.kind === 'letterbox' ? ('letterbox' as const) : ('side' as const),
				mark: note.mark,
				side: place.side,
				note: place.omitLeader
					? { left: -1e6, right: -1e6 + 1, top: -1e6, bottom: -1e6 + 1 }
					: placementLeaderRect(place, plate, plateSize, note.glyph),
				omitLeader: place.omitLeader,
			};
		});
		const rows = selectSplitLeaders(leaderInputs, { visibleX });
		return { placed, rows, plate, pane, scaleX, visibleX, leaderInputs };
	}

	it('keeps insert note ④ letterbox on the live phone pane that dropped it', () => {
		const result = placeInsert({ width: 390, height: 431 });
		const note = result.placed.find((place) => place.index === 3);
		assert.ok(note, 'insert missing note 4');
		assert.notEqual(note.kind, 'overflow', 'insert note 4 overflowed on phone pane');
		assert.equal(note.omitLeader, false, 'insert note 4 omitLeader');
	});

	it('draws elbow leaders for insert notes ② and ③ on the live phone pane', () => {
		const result = placeInsert({ width: 390, height: 431 });
		for (const index of [1, 2]) {
			const place = result.placed.find((item) => item.index === index);
			assert.ok(place, `insert missing note ${index + 1}`);
			assert.notEqual(place.kind, 'overflow', `insert note ${index + 1} overflowed`);
			const row = result.rows.find((item) => item.index === index);
			assert.ok(
				row?.points,
				`insert note ${index + 1} leader missing (kept ${result.rows.filter((r) => r.points).map((r) => r.index + 1).join(',')})`,
			);
			const pts = row.points!;
			assert.ok(pts.length >= 2);
			const tip = pts.at(-1)!;
			const before = pts.at(-2)!;
			assert.equal(before.y, tip.y, `insert note ${index + 1} tip must be a horizontal stub into the note`);
			const finalSeg = Math.abs(tip.x - before.x);
			assert.ok(
				finalSeg + 1e-9 >= 12,
				`insert note ${index + 1} terminal stub ${finalSeg} < 12 (live 390 elbows vanished when bisected to ~6)`,
			);
			// Live after #77–#80: tip ended ON the note edge (penetrateCss=0). Phone-scale
			// ~8px stub stopped left of 「②」 / met ③ from below with no ink over glyphs.
			// Encode that failure: tip must sit inside the note rect overlapping glyph ink.
			const noteRect = result.leaderInputs.find((item) => item.index === index)?.note;
			assert.ok(noteRect);
			const segL = Math.min(before.x, tip.x);
			const segR = Math.max(before.x, tip.x);
			const overlap = Math.max(0, Math.min(segR, noteRect.right) - Math.max(segL, noteRect.left));
			const penetrateCss = overlap * result.scaleX;
			assert.ok(
				overlap + 1e-9 >= LETTERBOX_STUB_PENETRATE,
				`insert note ${index + 1} stub overlap ${overlap}uu < ${LETTERBOX_STUB_PENETRATE} (tip ${tip.x} note [${noteRect.left},${noteRect.right}])`,
			);
			assert.ok(
				penetrateCss + 1e-9 >= 4,
				`insert note ${index + 1} live failure: stub must overlap note ink ≥4 CSS px (got ${penetrateCss.toFixed(2)})`,
			);
			assert.ok(
				tip.x > noteRect.left + 1e-6 && tip.x < noteRect.right - 1e-6,
				`insert note ${index + 1} tip must sit inside note ink, not on the edge`,
			);
		}
	});

	it('keeps insert ②③ elbow ink inside the phone pane clipped by split-imagery overflow', () => {
		// Live after #79: unit tests saw full polylines, but parkX sat left of pane (note flush
		// at left=0 → park = note.left - 12). .split-imagery { overflow:hidden } clipped the
		// vertical + stub — ② read as a mark-row dash stopping near x19; ③ as a ~3px tick.
		const pane = { width: 390, height: 431 };
		const result = placeInsert(pane);
		for (const index of [1, 2]) {
			const row = result.rows.find((item) => item.index === index);
			assert.ok(row?.points, `insert note ${index + 1} leader missing`);
			const pts = row.points!;
			let hasVertical = false;
			for (let i = 1; i < pts.length; i += 1) {
				const a = pts[i - 1]!;
				const b = pts[i]!;
				if (Math.abs(a.x - b.x) <= 1e-6 && Math.abs(a.y - b.y) > 4) hasVertical = true;
				const cssX = result.plate.left + a.x * result.scaleX;
				assert.ok(
					cssX >= -0.5 && cssX <= pane.width + 0.5,
					`insert note ${index + 1} point[${i - 1}] cssX ${cssX.toFixed(1)} outside pane 0..${pane.width} (plate x=${a.x.toFixed(1)}; clipped by imagery overflow)`,
				);
			}
			const tip = pts.at(-1)!;
			const tipCss = result.plate.left + tip.x * result.scaleX;
			assert.ok(
				tipCss >= -0.5 && tipCss <= pane.width + 0.5,
				`insert note ${index + 1} tip cssX ${tipCss}`,
			);
			assert.ok(hasVertical, `insert note ${index + 1} needs a visible vertical elbow run`);
			assert.ok(tip.x >= result.visibleX.left - 1e-6 && tip.x <= result.visibleX.right + 1e-6);
		}
	});
});

describe('mhjl329 desktop cover leaders', () => {
	function estimate(text: string, column: number): { height: number; glyph: { dx: number; dy: number; width: number; height: number } } {
		const font = 0.78 * 18;
		const line = font * 1.45;
		let row = 0;
		let width = 0;
		let lines = 1;
		for (const ch of text) {
			const code = ch.codePointAt(0) ?? 0;
			const cw = code < 128 ? font * 0.56 : font;
			if (row + cw > column && row > 0) {
				lines += 1;
				width = Math.max(width, row);
				row = cw;
			} else {
				row += cw;
			}
		}
		width = Math.min(column, Math.max(width, row));
		const height = lines * line;
		return { height, glyph: { dx: 0, dy: 0, width, height } };
	}

	function placedPart(part: 'label' | 'cover') {
		const desk = { width: 801, height: 900 };
		const detail = publishedDetails('mhjl329').find((item) => item.part === part);
		assert.ok(detail);
		const natural = part === 'label' ? { width: 1050, height: 1400 } : { width: 1400, height: 1400 };
		const crop =
			part === 'label'
				? { x: 274, y: 403, w: 514, h: 514 }
				: { x: 219, y: 210, w: 379, h: 235 };
		const plateSize = detail.plate;
		const plate = plateBox(desk, openingBox(desk, natural), plateSize, natural, crop);
		const column = Math.min(9.5 * 18, desk.width / 2);
		const numerals = '①②③④⑤⑥';
		const notes = detail.marks.map((mark, index) => {
			const box = estimate(`${numerals[index] ?? ''} ${mark.note ?? ''}`, column);
			return {
				index,
				side: resolvedSide(mark, plateSize.width),
				anchor: mark.y + mark.h / 2,
				height: box.height,
				glyph: box.glyph,
				mark: { x: mark.x, y: mark.y, w: mark.w, h: mark.h },
			};
		});
		const placed = placeNotes({
			pane: desk,
			plate,
			plateSize,
			rem: 18,
			notes,
		});
		const rows = selectSplitLeaders(
			notes.map((note) => {
				const place = placed.find((item) => item.index === note.index);
				assert.ok(place);
				return {
					index: note.index,
					kind: place.kind === 'letterbox' ? ('letterbox' as const) : ('side' as const),
					mark: note.mark,
					side: place.side,
					note: place.omitLeader
						? { left: -1e6, right: -1e6 + 1, top: -1e6, bottom: -1e6 + 1 }
						: placementLeaderRect(place, plate, plateSize, note.glyph),
					omitLeader: place.omitLeader,
				};
			}),
		);
		return { placed, rows, plate };
	}

	it('draws a leader for every desktop cover note packed against the plate', () => {
		const cover = placedPart('cover');
		assert.equal(cover.placed.every((note) => note.kind === 'letterbox'), true);
		assert.equal(cover.placed.every((note) => note.omitLeader === false), true);
		assert.equal(cover.placed.some((note) => note.kind === 'scrim' || note.kind === 'overflow'), false);
		for (const note of cover.placed) {
			const overlaps =
				note.left < cover.plate.left + cover.plate.width - 1e-6 &&
				note.left + note.width > cover.plate.left + 1e-6 &&
				note.top < cover.plate.top + cover.plate.height - 1e-6 &&
				note.top + note.height > cover.plate.top + 1e-6;
			assert.equal(overlaps, false, `desk cover note ${note.index} overlaps the plate`);
		}
		const kept = cover.rows.filter((row) => row.points).map((row) => row.index);
		assert.deepEqual(kept, [0, 1, 2, 3, 4, 5]);
	});

	it('keeps the desktop label on the side strip', () => {
		const label = placedPart('label');
		assert.equal(label.placed.every((note) => note.kind === 'side'), true);
		assert.equal(label.placed.every((note) => note.omitLeader === false), true);
		assert.equal(label.placed[0]?.width / 18, 8.75);
	});
});

describe('zoom compositor', () => {
	it('maps a sized layer onto the next rect and stays none at identity', () => {
		const base = { left: 10, top: 20, width: 100, height: 40 };
		assert.equal(layerTransform(base, { left: 10, top: 20, width: 100, height: 40 }), 'none');
		assert.equal(layerTransform(base, { left: 10.02, top: 20, width: 100, height: 40 }), 'none');
		assert.equal(layerTransform({ left: 0, top: 0, width: 0, height: 10 }, base), 'none');
		const next = { left: 30, top: 50, width: 250, height: 80 };
		assert.equal(layerTransform(base, next), 'translate(20px, 30px) scale(2.5, 2)');
	});

	it('keeps callouts off the zoom scrub and on once boxes rise', () => {
		const zoomMid = UPRIGHT_END + (ZOOM_END - UPRIGHT_END) / 2;
		assert.equal(calloutsActive(stageVisual(zoomMid, true)), false);
		assert.equal(calloutsActive(stageVisual(ZOOM_END, true)), false);
		assert.equal(calloutsActive(stageVisual(PLATE_END, true)), false);
		assert.equal(calloutsActive(stageVisual(PLATE_END + 0.02, true)), true);
		assert.equal(calloutsActive(stageVisual(1, true)), true);
		assert.equal(calloutsActive(stageVisual(1, false)), true);
	});
});

describe('fill to crop', () => {
	const fix = mhjl329FillCrop;
	const zero = { left: 0, top: 0, width: 0, height: 0 };

	function near(actual: number, expected: number, tol: number = fix.tolerancePx): void {
		assert.ok(Math.abs(actual - expected) <= tol, `${actual} not within ${tol} of ${expected}`);
	}

	function expectWindow(
		actual: { left: number; top: number; width: number; height: number },
		row: { left: number; top: number; width: number; height: number; centerX: number; centerY: number },
		tol = fix.tolerancePx,
	): void {
		near(actual.left, row.left, tol);
		near(actual.top, row.top, tol);
		near(actual.width, row.width, tol);
		near(actual.height, row.height, tol);
		near(actual.left + actual.width / 2, row.centerX, tol);
		near(actual.top + actual.height / 2, row.centerY, tol);
	}

	function windowAt(
		detail: {
			natural: { width: number; height: number };
			plate: { width: number; height: number };
			crop: { x: number; y: number; w: number; h: number };
		},
		pane: { width: number; height: number },
		cropT: number,
	) {
		const opening = openingBox(pane, detail.natural);
		const plate = plateBox(pane, opening, detail.plate, detail.natural, detail.crop);
		const image = zoomImageBox({
			opening,
			plate,
			natural: detail.natural,
			crop: detail.crop,
			cropT,
		});
		return cropWindow({ image, naturalWidth: detail.natural.width, crop: detail.crop });
	}

	it('places the live crop window on the MHJL 329 rows', () => {
		assert.deepEqual(fix.label.windows.t0, {
			cropT: 0,
			left: 239.143,
			top: 259.071,
			width: 330.429,
			height: 330.429,
			centerX: 404.357,
			centerY: 424.286,
		});
		assert.deepEqual(fix.label.windows.t05, {
			cropT: 0.5,
			left: 202.061,
			top: 236.776,
			width: 400.735,
			height: 400.735,
			centerX: 402.429,
			centerY: 437.143,
		});
		assert.deepEqual(fix.label.windows.t1, {
			cropT: 1,
			left: 157.5,
			top: 207,
			width: 486,
			height: 486,
			centerX: 400.5,
			centerY: 450,
		});
		assert.deepEqual(fix.label.s, { left: 157.5, top: 207, width: 486, height: 486 });
		expectWindow(windowAt(fix.label, fix.desk, 0), fix.label.windows.t0);
		expectWindow(windowAt(fix.label, fix.desk, 0.5), fix.label.windows.t05);
		expectWindow(windowAt(fix.label, fix.desk, 1), fix.label.windows.t1);

		assert.deepEqual(fix.cover.windows.t0, {
			cropT: 0,
			left: 125.299,
			top: 169.65,
			width: 216.842,
			height: 134.454,
			centerX: 233.72,
			centerY: 236.877,
		});
		assert.deepEqual(fix.cover.windows.t05, {
			cropT: 0.5,
			left: 140.301,
			top: 233.807,
			width: 353.619,
			height: 219.263,
			centerX: 317.11,
			centerY: 343.438,
		});
		assert.deepEqual(fix.cover.s, { left: 112.14, top: 271.217, width: 576.72, height: 357.566 });
		assert.deepEqual(fix.cover.fixedCenter, {
			left: 292.079,
			top: 382.773,
			width: 216.842,
			height: 134.454,
		});
		const coverStart = windowAt(fix.cover, fix.desk, 0);
		expectWindow(coverStart, fix.cover.windows.t0);
		expectWindow(windowAt(fix.cover, fix.desk, 0.5), fix.cover.windows.t05);
		assert.ok(Math.abs(coverStart.left - fix.cover.fixedCenter.left) > 1);
		const coverEnd = windowAt(fix.cover, fix.desk, 1);
		near(coverEnd.left, fix.cover.s.left, fix.settledTolerancePx);
		near(coverEnd.top, fix.cover.s.top, fix.settledTolerancePx);
		near(coverEnd.width, fix.cover.s.width, fix.settledTolerancePx);
		near(coverEnd.height, fix.cover.s.height, fix.settledTolerancePx);

		assert.deepEqual(fix.phoneCover.t0, {
			cropT: 0,
			left: 55.376,
			top: 120.85,
			width: 95.833,
			height: 59.421,
			centerX: 103.292,
			centerY: 150.561,
		});
		assert.deepEqual(fix.phoneCover.s, { left: 49.56, top: 165.737, width: 254.88, height: 158.026 });
		expectWindow(windowAt(fix.cover, fix.phone, 0), fix.phoneCover.t0);
		const phoneEnd = windowAt(fix.cover, fix.phone, 1);
		near(phoneEnd.left, fix.phoneCover.s.left, fix.settledTolerancePx);
		near(phoneEnd.top, fix.phoneCover.s.top, fix.settledTolerancePx);
		near(phoneEnd.width, fix.phoneCover.s.width, fix.settledTolerancePx);
		near(phoneEnd.height, fix.phoneCover.s.height, fix.settledTolerancePx);

		const direct = cropWindow({
			image: { left: 10, top: 20, width: 100, height: 50 },
			naturalWidth: 200,
			crop: { x: 5, y: 6, w: 20, h: 10 },
		});
		assert.deepEqual(direct, { left: 12.5, top: 23, width: 10, height: 5 });
		assert.deepEqual(
			cropWindow({
				image: { left: 1, top: 2, width: 10, height: 10 },
				naturalWidth: 0,
				crop: { x: 0, y: 0, w: 1, h: 1 },
			}),
			zero,
		);
		assert.deepEqual(
			cropWindow({
				image: { left: 1, top: 2, width: 10, height: 10 },
				naturalWidth: 10,
				crop: { x: 0, y: 0, w: 0, h: 1 },
			}),
			zero,
		);
		assert.deepEqual(
			cropWindow({
				image: { left: 0, top: 0, width: 0, height: 10 },
				naturalWidth: 10,
				crop: { x: 0, y: 0, w: 1, h: 1 },
			}),
			zero,
		);
	});

	it('keeps the window opaque while stageVisual still reports the old wash', () => {
		const wash = stageVisual(fix.local.wash, true);
		assert.equal(wash.cropT, 1);
		assert.equal(wash.uprightOpacity, 0.5);
		assert.equal(wash.plateOpacity, 0.5);
		const washed = fillCropPaint({ cropT: wash.cropT, local: fix.local.wash, plateEnd: PLATE_END });
		assert.equal(washed.outerOpacity, 0);
		assert.equal(washed.windowOpacity, 1);
		assert.equal(washed.plateOpacity, 0);
		assert.notEqual(washed.windowOpacity, wash.uprightOpacity);
		assert.notEqual(washed.outerOpacity, wash.uprightOpacity);

		const mid = stageVisual(fix.local.zoomMid, true);
		// (0.24 - 0.08) / (0.40 - 0.08) is one ulp under 0.5. The outer clears sooner than linear.
		near(mid.cropT, 0.5);
		const zooming = fillCropPaint({ cropT: mid.cropT, local: fix.local.zoomMid, plateEnd: PLATE_END });
		near(zooming.outerOpacity, 0.25);
		assert.equal(zooming.windowOpacity, 1);
		assert.equal(zooming.plateOpacity, 0);

		const hold = fillCropPaint({ cropT: 0, local: fix.local.hold, plateEnd: PLATE_END });
		assert.equal(hold.outerOpacity, 1);
		assert.equal(hold.windowOpacity, 1);
		assert.equal(hold.plateOpacity, 0);

		const cut = fillCropPaint({ cropT: 1, local: PLATE_END, plateEnd: PLATE_END });
		assert.equal(cut.outerOpacity, 0);
		assert.equal(cut.windowOpacity, 1);
		assert.equal(cut.plateOpacity, 1);
		const below = fillCropPaint({ cropT: 1, local: PLATE_END - 0.001, plateEnd: PLATE_END });
		assert.equal(below.plateOpacity, 0);
		const over = fillCropPaint({ cropT: 2, local: 1, plateEnd: PLATE_END });
		assert.equal(over.outerOpacity, 0);
		assert.equal(over.plateOpacity, 1);
		const under = fillCropPaint({ cropT: -1, local: 0, plateEnd: PLATE_END });
		assert.equal(under.outerOpacity, 1);
		assert.equal(under.plateOpacity, 0);
	});

	it('clears the outer faster than a straight ramp, so the washed plate does not linger', () => {
		// The outer is redrawn only outside the opaque window. A straight 1 - cropT keeps a
		// half-faded full-width photograph behind the sharp crop window for most of the zoom,
		// which reads as picture-in-picture. The ramp still ends at paper on both ends.
		let previous = Infinity;
		for (const cropT of [0, 0.05, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 0.95, 1]) {
			const outer = fillCropPaint({ cropT, local: 0, plateEnd: PLATE_END }).outerOpacity;
			assert.ok(outer <= 1 - cropT + 1e-12, `outer ${cropT} is not faster than linear`);
			assert.ok(outer < previous || cropT === 0, `outer ${cropT} does not fall`);
			previous = outer;
		}
		// Halfway through the zoom the washed margin is already under a quarter opaque.
		assert.ok(fillCropPaint({ cropT: 0.5, local: 0.24, plateEnd: PLATE_END }).outerOpacity <= 0.25);
		// And it is gone before the plate span starts, not only at cropT === 1.
		assert.ok(fillCropPaint({ cropT: 0.8, local: 0.34, plateEnd: PLATE_END }).outerOpacity <= 0.05);
	});

	it('leaves zoomImageBox on the geometric pose', () => {
		const here = dirname(fileURLToPath(import.meta.url));
		const source = readFileSync(join(here, 'detail-display.ts'), 'utf8');
		const zoom = source.slice(source.indexOf('export function zoomImageBox'), source.indexOf('export function cropWindow'));
		assert.match(zoom, /const s = s0 === s1 \|\| s0 <= 0 \|\| s1 <= 0 \? s0 : s0 \* \(s1 \/ s0\) \*\* u;/);
		assert.equal(zoom.includes('cropWindow'), false);
		assert.equal(zoom.includes('angleDeg'), false);
		const stage = readFileSync(join(here, 'split-stage.ts'), 'utf8');
		const plateSpan = stage.slice(stage.indexOf('if (u <= PLATE_END)'), stage.indexOf('if (u <= BOXES_END)'));
		assert.match(plateSpan, /uprightOpacity: 1 - t/);
		assert.match(plateSpan, /plateOpacity: t/);
	});

	it('paints the outer and the window without the photo ramp', () => {
		const here = dirname(fileURLToPath(import.meta.url));
		const astro = readFileSync(join(here, '../pages/records/[id].astro'), 'utf8');
		const css = readFileSync(join(here, '../styles/global.css'), 'utf8');
		const apply = astro.slice(astro.indexOf('function applyFrame'), astro.indexOf('function bindSplit'));
		assert.match(apply, /fillCropPaint\(\{[\s\S]*cropT: visual\.cropT[\s\S]*local: p[\s\S]*plateEnd: PLATE_END/);
		assert.match(apply, /cropWindow\(\{/);
		assert.match(apply, /box\.left - windowBox\.left/);
		assert.match(apply, /box\.top - windowBox\.top/);
		assert.match(apply, /windowBox\.width <= 0 \|\| windowBox\.height <= 0/);
		assert.match(apply, /outer\.style\.opacity = String\(paint\.outerOpacity\)/);
		assert.match(apply, /windowEl\.style\.opacity = String\(paint\.windowOpacity\)/);
		assert.match(apply, /plate\.style\.opacity = String\(showContent \? paint\.plateOpacity : 0\)/);
		assert.match(apply, /upright\.style\.opacity = '1'/);
		assert.match(apply, /windowImg\.style\.opacity = '1'/);
		assert.match(apply, /visual\.cropT === 1\) matchPlateFrame\(frame\)/);
		assert.equal(apply.includes('frame.style.opacity'), false);
		assert.equal(apply.includes('visual.uprightOpacity'), false);
		assert.equal(apply.includes('visual.plateOpacity'), false);
		assert.match(apply, /visual\.boxesOpacity/);
		assert.match(apply, /visual\.leadersOpacity/);
		assert.match(apply, /visual\.notesOpacity/);
		assert.match(apply, /zoomImageBox\(\{[\s\S]*cropT: visual\.cropT/);
		assert.match(apply, /upright\.style\.right = 'auto'/);
		assert.match(apply, /upright\.style\.bottom = 'auto'/);
		assert.equal(apply.includes('angleDeg'), false);
		assert.equal(apply.includes('cameraBox('), false);
		assert.equal(apply.includes('rotate'), false);

		const clear = astro.slice(astro.indexOf('const clearScrubStyles'), astro.indexOf('const showSettled'));
		assert.match(clear, /\.upright-outer, \.crop-window, \.upright, \.plate, \.mark-graphics, \.mark-leaders, \.mark-list/);
		assert.match(clear, /node\.style\.visibility = ''/);
		assert.match(clear, /querySelectorAll<HTMLElement>\('\.crop-window'\)/);

		const showSettled = astro.slice(astro.indexOf('const showSettled'), astro.indexOf('const armFade'));
		assert.match(showSettled, /applyFrame\(frame, 1\)/);
		assert.ok(showSettled.indexOf('applyFrame(frame, 1)') < showSettled.indexOf('position(frame)'));
		assert.ok(showSettled.indexOf('position(frame)') < showSettled.indexOf('matchPlateFrame(frame)'));
		assert.equal(showSettled.includes("collapseToContent(frame, 'frame')"), false);
		assert.match(showSettled, /dataset\.phase/);
		assert.match(astro, /applyCollapse\(/);
		assert.equal(astro.includes("collapseToContent(active, 'page')"), false);
		assert.match(astro, /DETAIL_CROSSFADE_MS/);
		assert.match(astro, /1 - visual\.leadersOpacity/);

		assert.match(
			css,
			/\.record-page--split \.split-frame > \.crop-window \{\s*z-index:\s*1;\s*overflow:\s*hidden;\s*overflow:\s*clip;\s*contain:\s*paint;\s*background:\s*transparent;\s*\}/,
		);
		assert.match(css, /\.record-page--split \.split-frame \.detail-stage \{\s*z-index:\s*2;\s*isolation:\s*isolate;\s*overflow:\s*visible;\s*\}/);
		assert.match(css, /\.record-page--split \.split-frame \.mark-list \{\s*z-index:\s*2;\s*\}/);
		assert.match(
			css,
			/html\[data-motion='ok'\] \.record-page--split \.split-frame:not\(\.is-plate\) > \.crop-window,\s*html\[data-motion='ok'\] \.record-page--split \.split-frame:not\(\.is-plate\) > \.upright-outer,\s*html\[data-motion='ok'\] \.record-page--split \.split-frame:not\(\.is-plate\) > \.upright-outer > \.upright \{\s*will-change:\s*transform, opacity;\s*\}/,
		);
		const applyAll = astro.slice(astro.indexOf('const applyAll'), astro.indexOf('const onScroll'));
		assert.ok(applyAll.includes('calloutsActive('));
		assert.ok(applyAll.indexOf('calloutsActive(') < applyAll.indexOf('position(frame)'));
		assert.match(apply, /layerTransform\(/);
		assert.match(apply, /visual\.leadersOpacity > 0/);
		assert.match(
			css,
			/\.record-page--split \.split-frame > \.upright-outer \{\s*inset:\s*0;\s*z-index:\s*1;\s*overflow:\s*visible;\s*background:\s*transparent;\s*\}/,
		);
		assert.doesNotMatch(
			css,
			/html\[data-motion='ok'\] \.record-page--split \.split-frame:not\(\.is-settled\) \.upright-outer \{[^}]*opacity:\s*1/s,
		);
		assert.match(css, /grid-template-columns:\s*minmax\(0,\s*1\.618fr\)\s*minmax\(0,\s*1fr\)/);
		const splitCss = css.slice(css.indexOf('.record-page--split'));
		const desktopStart = splitCss.indexOf('@media (min-width: 48rem)');
		const desktopBody = splitCss.slice(desktopStart, splitCss.indexOf('@media', desktopStart + 10));
		assert.match(desktopBody, /\.split-frame\s*\{[^}]*height:\s*100svh/s);
	});
});
