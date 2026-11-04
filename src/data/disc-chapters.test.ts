import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
	CHAPTER_KEYS,
	CHAPTER_LABELS,
	buildDiscChapters,
	chapterKeyForTitle,
	chapterMode,
	clampCoverPan,
	COVER_TAP_SCALE,
	coverSideLabel,
	coverSides,
	discNotesFields,
	mapSteppingStations,
	needsCoverSides,
	parseStorySections,
	RECORD_MARK_GAP,
	recordChapterIsMarksOnly,
	recordChapterRendersProse,
	seatRecordMarks,
	scrollFollowThrough,
	shellOwnsVertical,
	stepChapter,
	verticalOwner,
	yearRailOffset,
	yearRailPins,
	type DiscChapter,
} from './disc-chapters.ts';
import { records } from './records.ts';

const chaptered = `## 唱片

法版由 Pathé-Marconi 压制，两张装在五线谱与贝多芬肖像盒中。

内圈刻着 2XRA 开头的母带号。

## 来龙去脉

1951 年 7 月 29 日，拜罗伊特节日剧院战后重新开幕。

母带封存四年，直到 1955 年末才以密纹问世。

## 资料

封套把录音日期写作「1951 年 8 月」，与实际的 7 月 29 日略有出入。`;

const notesFixture = discNotesFields(
	{
		artist: 'Wilhelm Furtwängler',
		composer: 'Ludwig van Beethoven',
		work: 'Symphony No. 9',
		label: 'La Voix de Son Maître',
		catalogNumber: 'FALP 381/382',
		recording: 'Bayreuth 1951',
		condition: 'VG+',
		eq: 'RIAA',
		status: '在架',
		matrix: '2XRA 123',
		pressing: 'Pathé-Marconi',
		year: 1956,
	},
	{ showMatrix: true, showPressing: true },
);

const chapteredChapters = buildDiscChapters({
	story: chaptered,
	hasMap: true,
	notesFields: notesFixture,
});

describe('四格章表 v3', () => {
	it('reads `##` chapter titles, exact or alias, into the four-slot keys', () => {
		assert.equal(chapterKeyForTitle('唱片'), 'record');
		assert.equal(chapterKeyForTitle(' 本盘 '), 'record');
		assert.equal(chapterKeyForTitle('述语'), 'story');
		assert.equal(chapterKeyForTitle('来龙去脉'), 'story');
		assert.equal(chapterKeyForTitle('始末'), 'story');
		assert.equal(chapterKeyForTitle('资料'), 'story');
		assert.equal(chapterKeyForTitle('附录'), 'story');
		assert.equal(chapterKeyForTitle('唱片说明'), null);
	});

	it('labels the story rail 述语, never 来龙去脉', () => {
		assert.equal(CHAPTER_LABELS.story, '述语');
		assert.deepEqual(
			CHAPTER_KEYS.map((key) => CHAPTER_LABELS[key]),
			['唱片', '述语', '地图', '资料'],
		);
		assert.ok(!Object.values(CHAPTER_LABELS).includes('来龙去脉'));
	});

	it('assigns cover-scroll / scroll / map / list modes', () => {
		assert.equal(chapterMode('record'), 'cover-scroll');
		assert.equal(chapterMode('story'), 'scroll');
		assert.equal(chapterMode('map'), 'map');
		assert.equal(chapterMode('notes'), 'list');
		assert.deepEqual(
			chapteredChapters.map((chapter) => chapter.mode),
			['cover-scroll', 'scroll', 'map', 'list'],
		);
	});

	it('merges 来龙去脉 + 资料 narrative into one 述语 scroll chapter', () => {
		assert.deepEqual(
			chapteredChapters.map((chapter) => chapter.key),
			['record', 'story', 'map', 'notes'],
		);
		assert.deepEqual(
			chapteredChapters.map((chapter) => chapter.label),
			['唱片', '述语', '地图', '资料'],
		);
		const story = chapteredChapters.find((chapter) => chapter.key === 'story');
		assert.ok(story);
		assert.equal(story.mode, 'scroll');
		const text = story.sections.flatMap((section) => section.paragraphs).join('\n');
		assert.match(text, /拜罗伊特/);
		assert.match(text, /1951 年 8 月/);
		assert.equal(story.fields.length, 0);
		// no beat track / 1／n counter surface
		assert.ok(!('beats' in story));
		assert.ok(!JSON.stringify(chapteredChapters).includes('1／n'));
	});

	it('puts 资料 on structured fields, not Markdown beats', () => {
		const notes = chapteredChapters.find((chapter) => chapter.key === 'notes');
		assert.ok(notes);
		assert.equal(notes.mode, 'list');
		assert.deepEqual(notes.sections, []);
		assert.ok(notes.fields.length >= 8);
		assert.ok(notes.fields.some((field) => field.term === '艺人'));
		assert.ok(notes.fields.some((field) => field.term === '目录号'));
		assert.deepEqual(notes.fields, notesFixture);
	});

	it('drops empty chapters instead of filling them with placeholder copy', () => {
		const chapters = buildDiscChapters({
			story: '只有一段，没有章标题。',
			hasMap: false,
		});
		assert.deepEqual(
			chapters.map((chapter) => chapter.key),
			['record'],
		);
		assert.equal(chapters[0]?.mode, 'cover-scroll');
		assert.ok((chapters[0]?.sections.length ?? 0) > 0);
		assert.ok(!JSON.stringify(chapters).toLowerCase().includes('lorem'));
	});

	it('puts layout remainder text into 唱片 only when the story has no chapter', () => {
		const withChapters = buildDiscChapters({
			story: chaptered,
			hasMap: false,
			notesFields: notesFixture,
			extraRecordParagraphs: ['版面余文。'],
		});
		assert.ok(!JSON.stringify(withChapters.find((c) => c.key === 'record')).includes('版面余文'));
		const bare = buildDiscChapters({
			story: '一段余文。',
			hasMap: false,
			extraRecordParagraphs: ['版面余文。'],
		});
		assert.ok(JSON.stringify(bare).includes('版面余文'));
	});

	it('keeps `<!-- beat -->` and `###` as section boundaries, not a beat track', () => {
		const sections = parseStorySections(`## 唱片

### 盒

五线谱盒。

<!-- beat -->

### 刻片

内圈 2XRA。`);
		assert.equal(sections.length, 1);
		assert.deepEqual(
			sections[0]?.blocks.map((block) => block.title),
			['盒', '刻片'],
		);
		assert.deepEqual(sections[0]?.blocks[0]?.paragraphs, ['五线谱盒。']);
	});
});

describe('falp381 四格', () => {
	it('builds 唱片｜述语｜地图｜资料 with scrollable story and list notes', () => {
		const record = records.find((item) => item.id === 'falp381');
		assert.ok(record, 'falp381 fixture missing');
		const fields = discNotesFields(record, { showMatrix: true, showPressing: true });
		const chapters = buildDiscChapters({
			story: record.story,
			hasMap: Boolean(record.trajectory),
			notesFields: fields,
		});
		assert.deepEqual(
			chapters.map((chapter) => chapter.label),
			['唱片', '述语', '地图', '资料'],
		);
		assert.deepEqual(
			chapters.map((chapter) => chapter.mode),
			['cover-scroll', 'scroll', 'map', 'list'],
		);
		const story = chapters.find((chapter) => chapter.key === 'story')!;
		const storyText = story.sections.flatMap((section) => section.paragraphs).join('\n');
		assert.match(storyText, /富特万格勒/);
		assert.match(storyText, /火炬图案/);
		assert.ok(storyText.length > 200);
		const notes = chapters.find((chapter) => chapter.key === 'notes')!;
		assert.ok(notes.fields.some((field) => field.term === '厂牌'));
		assert.ok(notes.fields.every((field) => field.value.trim() !== ''));
		assert.ok(!JSON.stringify(chapters).includes('1／n'));
		assert.ok(!chapters.some((chapter) => 'beats' in chapter));
	});
});

describe('章级跟翻与长滚边界', () => {
	const chapters: DiscChapter[] = [
		{
			key: 'record',
			label: '唱片',
			mode: 'cover-scroll',
			sections: [{ title: '', paragraphs: ['物述'] }],
			fields: [],
		},
		{
			key: 'story',
			label: '述语',
			mode: 'scroll',
			sections: [{ title: '', paragraphs: ['长文'] }],
			fields: [],
		},
		{ key: 'map', label: '地图', mode: 'map', sections: [], fields: [] },
		{
			key: 'notes',
			label: '资料',
			mode: 'list',
			sections: [],
			fields: [{ term: '艺人', value: 'X' }],
		},
	];

	it('steps one chapter at a time and refuses map gesture ownership', () => {
		assert.deepEqual(stepChapter({ chapters, index: 0, dir: 1 }), {
			index: 1,
			moved: true,
			kind: 'chapter',
		});
		assert.deepEqual(stepChapter({ chapters, index: 1, dir: 1 }), {
			index: 2,
			moved: true,
			kind: 'chapter',
		});
		assert.deepEqual(stepChapter({ chapters, index: 2, dir: 1 }), {
			index: 2,
			moved: false,
			kind: 'map',
		});
		assert.deepEqual(stepChapter({ chapters, index: 0, dir: -1 }), {
			index: 0,
			moved: false,
			kind: 'edge',
		});
	});

	it('only follows through at the scroll edges', () => {
		assert.equal(scrollFollowThrough({ atTop: false, atBottom: false, dir: 1 }), false);
		assert.equal(scrollFollowThrough({ atTop: false, atBottom: true, dir: 1 }), true);
		assert.equal(scrollFollowThrough({ atTop: true, atBottom: false, dir: -1 }), true);
		assert.equal(scrollFollowThrough({ atTop: false, atBottom: false, dir: -1 }), false);
	});
});

describe('手势归属与封面缩放', () => {
	it('keeps the wheel for the chapter shell outside the map chapter', () => {
		assert.equal(shellOwnsVertical('record'), true);
		assert.equal(shellOwnsVertical('story'), true);
		assert.equal(shellOwnsVertical('notes'), true);
		assert.equal(shellOwnsVertical('map'), false);
		assert.equal(verticalOwner({ chapterKey: 'story', mapViewMode: 'guide' }), 'chapters');
		assert.equal(verticalOwner({ chapterKey: 'map', mapViewMode: 'guide' }), 'map');
		assert.equal(verticalOwner({ chapterKey: 'map', mapViewMode: 'explore' }), 'map');
	});

	it('does not step stations while exploring', () => {
		assert.equal(mapSteppingStations('guide'), true);
		assert.equal(mapSteppingStations('chrono'), true);
		assert.equal(mapSteppingStations('explore'), false);
	});

	it('clamps cover pan inside the frame and keeps tap scale', () => {
		assert.equal(COVER_TAP_SCALE, 2);
		assert.deepEqual(clampCoverPan({ scale: 0.5, x: 9, y: 9 }, { width: 200, height: 200 }), {
			scale: 1,
			x: 0,
			y: 0,
		});
		const zoomed = clampCoverPan({ scale: 2, x: 999, y: -999 }, { width: 200, height: 100 });
		assert.equal(zoomed.scale, 2);
		assert.equal(zoomed.x, 100);
		assert.equal(zoomed.y, -50);
	});
});

describe('左纵年轴', () => {
	const places = [
		{ id: 'a', year: 1951 },
		{ id: 'b', year: 1955 },
		{ id: 'c', year: 1955 },
		{ id: 'd', year: 1956 },
	];

	it('spaces pins by real year distance, not by station index', () => {
		const pins = yearRailPins(places);
		assert.equal(pins[0]?.t, 0);
		assert.equal(pins[pins.length - 1]?.t, 1);
		const mid = pins.find((pin) => pin.id === 'b');
		assert.ok(mid);
		assert.ok(Math.abs(mid.t - (1955 - 1951) / (1956 - 1951)) < 1e-9);
	});

	it('sorts by year, keeps same-year order, and labels a year once', () => {
		const pins = yearRailPins(places);
		assert.deepEqual(
			pins.map((pin) => pin.id),
			['a', 'b', 'c', 'd'],
		);
		assert.deepEqual(
			pins.map((pin) => pin.label),
			['1951', '1955', null, '1956'],
		);
		assert.match(yearRailOffset(pins[0]!), /%/);
	});
});

describe('唱片章多面', () => {
	it('keeps every reveal face, in export order, with the first as default', () => {
		const sides = coverSides([
			{ part: 'cover', caption: '封套正面 · ①–⑤', face: '' },
			{ part: 'back', caption: '封底 · ①–⑤', face: '' },
			{ part: 'label', caption: '标签 Side B · ①–⑥', face: 'd1-s2' },
		]);
		assert.equal(sides.length, 3);
		assert.deepEqual(
			sides.map((side) => side.part),
			['cover', 'back', 'label'],
		);
		assert.deepEqual(
			sides.map((side) => side.index),
			[0, 1, 2],
		);
		assert.deepEqual(
			sides.map((side) => side.label),
			['封套正面', '封底', '标签 Side B'],
		);
		assert.equal(sides[2]?.face, 'd1-s2');
	});

	it('labels a face from the export caption, the part name, or the face', () => {
		assert.equal(coverSideLabel({ part: 'cover', caption: '封套正面 · ①–⑤' }), '封套正面');
		assert.equal(coverSideLabel({ part: 'back', caption: '' }), '封底');
		assert.equal(coverSideLabel({ part: 'label', caption: '   ' }), '标签');
		assert.equal(coverSideLabel({ part: 'odd', caption: '', face: 'd2-s1' }), 'd2-s1');
		assert.equal(coverSideLabel({ part: 'odd', caption: '' }, 2), '面 3');
		assert.equal(coverSideLabel({ part: 'insert' }), '插页');
	});

	it('only offers a side switch when there is more than one face', () => {
		assert.equal(needsCoverSides([]), false);
		assert.equal(needsCoverSides(['cover']), false);
		assert.equal(needsCoverSides(['cover', 'back']), true);
	});

	it('reports one side for a single-face record', () => {
		const sides = coverSides([{ part: 'cover', caption: '封套正面 · ①–③' }]);
		assert.equal(needsCoverSides(sides), false);
		assert.equal(sides[0]?.label, '封套正面');
	});
});

describe('唱片章 marks-only 契约', () => {
	it('declares the record chapter marks-only', () => {
		assert.equal(recordChapterIsMarksOnly(), true);
	});

	it('never paints record prose under the cover, even when sections were parsed', () => {
		assert.equal(recordChapterRendersProse(), false);
		assert.equal(recordChapterRendersProse({ sections: [] }), false);
		assert.equal(
			recordChapterRendersProse({ sections: [{ title: '', paragraphs: ['物述'] }] }),
			false,
		);
		const record = records.find((item) => item.id === 'falp381');
		assert.ok(record, 'falp381 fixture missing');
		const chapters = buildDiscChapters({
			story: record.story,
			hasMap: Boolean(record.trajectory),
		});
		const recordChapter = chapters.find((chapter) => chapter.key === 'record');
		assert.ok(recordChapter);
		// 数据保真：`## 唱片` 仍在数据里，只是界面不画。
		assert.equal(recordChapterRendersProse(recordChapter), false);
	});
});

describe('唱片章框选肘线落位', () => {
	const plate = { width: 400, height: 400 };
	const gap = 400 * RECORD_MARK_GAP;

	it('resolves an auto side to the half with more air', () => {
		const seats = seatRecordMarks(
			[
				{ side: 'auto', x: 8, y: 40, w: 40, h: 20 },
				{ side: 'auto', x: 352, y: 200, w: 40, h: 20 },
				{ side: 'left', x: 300, y: 300, w: 40, h: 20 },
			],
			plate.width,
			plate.height,
		);
		assert.deepEqual(
			seats.map((seat) => seat.side),
			['right', 'left', 'left'],
		);
	});

	it('centers a lone note on its mark, in plate coordinates', () => {
		const seats = seatRecordMarks(
			[{ side: 'right', x: 300, y: 100, w: 40, h: 30 }],
			plate.width,
			plate.height,
		);
		assert.deepEqual(seats, [{ side: 'right', center: 115 }]);
	});

	it('stacks same-side notes by a gap instead of letting them collide', () => {
		const seats = seatRecordMarks(
			[
				{ side: 'right', x: 300, y: 100, w: 40, h: 30 },
				{ side: 'right', x: 300, y: 110, w: 40, h: 30 },
			],
			plate.width,
			plate.height,
		);
		assert.equal(seats[0]?.center, 115);
		assert.equal(seats[1]?.center, 115 + gap);
	});

	it('keeps the stack inside the plate even when marks crowd the foot', () => {
		const seats = seatRecordMarks(
			[
				{ side: 'right', x: 300, y: 360, w: 40, h: 30 },
				{ side: 'right', x: 300, y: 380, w: 40, h: 20 },
			],
			plate.width,
			plate.height,
		);
		for (const seat of seats) {
			assert.ok(
				seat.center >= gap / 2 && seat.center <= plate.height - gap / 2,
				`落点 ${seat.center} 出框`,
			);
		}
		assert.ok((seats[1]?.center ?? 0) - (seats[0]?.center ?? 0) >= gap - 1e-6);
	});

	it('leaves the input order alone', () => {
		const seats = seatRecordMarks(
			[
				{ side: 'left', x: 10, y: 300, w: 40, h: 20 },
				{ side: 'left', x: 10, y: 10, w: 40, h: 20 },
			],
			plate.width,
			plate.height,
		);
		assert.equal(seats[0]?.center, 310);
		assert.equal(seats[1]?.center, gap / 2);
	});
});
