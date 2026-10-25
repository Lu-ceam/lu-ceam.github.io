import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import recordsJson from './records.json' with { type: 'json' };
import {
	badgeCenter,
	cropIsProperSubRectangle,
	detailMode,
	expectedPlateHeight,
	fitPlateToFloor,
	imageryHeightPx,
	laidOutSides,
	leaderEndpoints,
	NARROW_FLOOR_OF_STAGE,
	NARROW_FLOOR_REM,
	NARROW_GAP_REM,
	NARROW_PAIR_MIN_REM,
	NARROW_SLOT_CAP_REM,
	OPEN_INSET,
	PLATE_CAP,
	ZOOM_GAIN,
	openingBox,
	plateBox,
	notesAligned,
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
	type PxSize,
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
	plate: { width: number; height: number };
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
		assert.match(css, /\.record-page--split \.split-frame \.plate-frame \{\s*width:\s*100%/);
		assert.match(
			css,
			/@media \(max-width: 47\.99rem\) \{[\s\S]*?\.record-page--split \.split-frame \.mark-slot \{[^}]*flex:\s*1 1 7\.5rem/,
		);
		assert.match(
			css,
			/\.record-page--split \.split-frame \.plate-frame \{[^}]*width:\s*auto;[^}]*min-width:\s*min\(11rem,\s*58%\)/s,
		);
		const splitCss = css.slice(css.indexOf('.record-page--split'));
		assert.match(splitCss, /\.record-page--split \{\s*--imagery-h:\s*58svh;\s*\}/);
		assert.match(splitCss, /\.split-imagery\s*\{[^}]*height:\s*var\(--imagery-h\)/s);
		assert.match(splitCss, /\.split-read\s*\{[^}]*top:\s*var\(--imagery-h\)/s);
		assert.match(splitCss, /margin-top:\s*var\(--imagery-h\)/);
		assert.match(splitCss, /height:\s*calc\(100svh - var\(--imagery-h\)\)/);
		assert.match(
			splitCss,
			/width:\s*min\(100%,\s*calc\(var\(--imagery-h\) \* var\(--plate-w\) \/ var\(--plate-h\)\)\)/,
		);
		const desktopStart = splitCss.indexOf('@media (min-width: 48rem)');
		const after = splitCss.slice(desktopStart + 10);
		const desktopBody = splitCss.slice(desktopStart, desktopStart + 10 + after.indexOf('@media'));
		assert.match(desktopBody, /\.split-imagery\s*\{[^}]*height:\s*100svh/s);
		assert.match(desktopBody, /\.split-read\s*\{[^}]*height:\s*100svh/s);
		assert.match(
			desktopBody,
			/width:\s*min\(100%,\s*calc\(100svh \* var\(--plate-w\) \/ var\(--plate-h\)\)\)/,
		);
		assert.doesNotMatch(desktopBody, /var\(--imagery-h\)/);
		const short = splitCss.slice(
			splitCss.indexOf('@media (max-width: 47.99rem) and (max-height: 32rem)'),
		);
		const shortBody = short.slice(0, short.indexOf('@media', 10));
		assert.match(shortBody, /--imagery-h:\s*42svh/);
		assert.doesNotMatch(shortBody, /height:\s*42svh/);
		assert.doesNotMatch(shortBody, /top:\s*42svh/);

		const astro = readFileSync(join(here, '../pages/records/[id].astro'), 'utf8');
		assert.match(astro, /laidOutSides\(/);
		assert.match(astro, /plateFloorPx\(/);
		assert.match(astro, /singleGutterPx\(/);
		assert.match(astro, /singlePlatePx\(/);
		assert.match(astro, /fitPlateToFloor\(/);
		assert.match(astro, /imageryHeightPx\(/);
		assert.match(astro, /--imagery-h/);
		assert.match(astro, /classList\.contains\('split-frame'\)/);
		assert.match(astro, /classList\.contains\('is-active'\)/);
		assert.match(astro, /stackTops\(/);
		assert.doesNotMatch(astro, /function stackTops/);
		assert.match(
			astro,
			/if \(narrow && document\.documentElement\.dataset\.motion === 'ok' && stage && frame && figure\.classList\.contains\('is-active'\)\)/,
		);
		assert.match(
			astro,
			/inImagery && document\.documentElement\.dataset\.motion !== 'ok'/,
		);
		assert.match(astro, /settledPlaced/);
		assert.match(astro, /svhCache/);
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
		assert.equal((split.match(/loading="eager"/g) ?? []).length, 2);
		assert.equal((split.match(/fetchpriority=\{index === 0 \? 'high' : 'auto'\}/g) ?? []).length, 1);
		assert.ok(astro.includes('loading="lazy"'));
		assert.match(astro, /classList\.toggle\('is-plate', visual\.plateOpacity === 1\)/);
		assert.match(
			astro,
			/clip\.style\.visibility = visual\.uprightOpacity === 0 \? 'hidden' : 'visible'/,
		);

		const css = readFileSync(join(here, '../styles/global.css'), 'utf8');
		const splitHold = css.indexOf(
			".record-page--split .split-frame:not(.is-settled) .plate",
		);
		const plateOn = css.indexOf('.split-frame.is-plate');
		assert.ok(splitHold >= 0 && plateOn > splitHold);
		const reduce = css.indexOf("html[data-motion='reduce']", plateOn);
		const block = css.slice(plateOn, reduce);
		assert.match(block, /img\.plate\s*\{[^}]*opacity:\s*1/s);
		assert.match(block, /\.upright-clip\s*\{[^}]*opacity:\s*0/s);
		assert.match(block, /visibility:\s*hidden/);
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
});
