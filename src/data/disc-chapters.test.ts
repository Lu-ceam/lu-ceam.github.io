import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
	CHAPTER_KEYS,
	CHAPTER_LABELS,
	buildDiscChapters,
	clampScrollTop,
	chapterKeyForTitle,
	chapterNeighbor,
	chapterMode,
	coverSideLabel,
	coverSides,
	discNotesFields,
	mapSteppingStations,
	needsCoverSides,
	parseStorySections,
	readVerticalGesture,
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
import { detailMode, visibleDetailText } from './detail-display.ts';
import { records } from './records.ts';

const here = dirname(fileURLToPath(import.meta.url));

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
		// 无 H2 的正文归述语；没有图像就没有唱片章，也不留空白章。
		assert.deepEqual(
			chapters.map((chapter) => chapter.key),
			['story'],
		);
		assert.equal(chapters[0]?.mode, 'scroll');
		assert.deepEqual(chapters[0]?.sections, [{ title: '', paragraphs: ['只有一段，没有章标题。'] }]);
		assert.ok(!JSON.stringify(chapters).toLowerCase().includes('lorem'));
	});

	it('keeps layout remainder text as 唱片 image residue and never repeats it in 述语', () => {
		const withChapters = buildDiscChapters({
			story: chaptered,
			hasMap: false,
			notesFields: notesFixture,
			extraRecordParagraphs: ['版面余文。'],
			hasRecordVisuals: true,
		});
		assert.ok(JSON.stringify(withChapters.find((c) => c.key === 'record')).includes('版面余文'));
		assert.ok(!JSON.stringify(withChapters.find((c) => c.key === 'story')).includes('版面余文'));
		const bare = buildDiscChapters({
			story: '一段余文。',
			hasMap: false,
			extraRecordParagraphs: ['版面余文。'],
		});
		assert.ok(JSON.stringify(bare).includes('版面余文'));
		// 余文只出现在唱片章的数据里一次。
		assert.equal(JSON.stringify(bare).split('版面余文').length - 1, 1);
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

	it('reads a touch as vertical only past the slop and past its own dx', () => {
		assert.equal(
			readVerticalGesture({ dx: 40, dy: 4, slop: 6, atTop: true, atBottom: false }).vertical,
			false,
		);
		assert.equal(
			readVerticalGesture({ dx: 0, dy: 3, slop: 6, atTop: true, atBottom: false }).vertical,
			false,
		);
		assert.deepEqual(readVerticalGesture({ dx: 2, dy: 30, slop: 6, atTop: false, atBottom: true }), {
			vertical: true,
			dir: 1,
			follow: true,
		});
		assert.equal(readVerticalGesture({ dx: 2, dy: -30, slop: 6, atTop: true, atBottom: false }).dir, -1);
	});

	it('only calls it a follow-through gesture when the chapter is already at that edge', () => {
		// 章中：竖滑是文章自己的，连橡皮筋都不该被壳预判。
		assert.equal(
			readVerticalGesture({ dx: 0, dy: 30, slop: 6, atTop: false, atBottom: false }).follow,
			false,
		);
		// 方向朝内（文头上推＝往下读、文末下拉＝往上回）：不跟翻，文章自己滚。
		assert.equal(
			readVerticalGesture({ dx: 0, dy: 30, slop: 6, atTop: true, atBottom: false }).follow,
			false,
		);
		assert.equal(
			readVerticalGesture({ dx: 0, dy: -30, slop: 6, atTop: false, atBottom: true }).follow,
			false,
		);
		// 边沿外向：一步一章那一下，先在 move 上灭橡皮筋。
		assert.equal(
			readVerticalGesture({ dx: 0, dy: -30, slop: 6, atTop: true, atBottom: false }).follow,
			true,
		);
		assert.equal(
			readVerticalGesture({ dx: 0, dy: 30, slop: 6, atTop: false, atBottom: true }).follow,
			true,
		);
	});

	it('clamps a chapter scroll into its legal range before the switch', () => {
		assert.equal(clampScrollTop({ scrollTop: -24, scrollHeight: 900, clientHeight: 400 }), 0);
		assert.equal(clampScrollTop({ scrollTop: 620, scrollHeight: 900, clientHeight: 400 }), 500);
		assert.equal(clampScrollTop({ scrollTop: 300, scrollHeight: 900, clientHeight: 400 }), 300);
		// 内容比框短：只有 0。
		assert.equal(clampScrollTop({ scrollTop: 40, scrollHeight: 200, clientHeight: 400 }), 0);
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

	it('leaves the face switch to the chapter, not to a pinch pose', () => {
		// 切面只切「当前面」；整层捏合／双击不再是唱片章的路。
		const source = readFileSync(join(here, './disc-chapters.ts'), 'utf8');
		assert.equal(source.includes('clampCoverPan'), false, 'pinch 缩放 helper 还留着');
		assert.equal(source.includes('COVER_TAP_SCALE'), false, '双击放大系数还留着');
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

	it('pushes crowded pins apart without breaking year order', () => {
		// 1951 与 1956 的真实比例只差 0.1，11rem 轴上两个 11px 年号会贴在一起。
		const crowded = [
			{ id: 'a', year: 1770 },
			{ id: 'b', year: 1822 },
			{ id: 'c', year: 1876 },
			{ id: 'd', year: 1886 },
			{ id: 'e', year: 1951 },
			{ id: 'f', year: 1956 },
		];
		const minGapT = 0.08;
		const pins = yearRailPins(crowded, { minGapT });
		assert.deepEqual(
			pins.map((pin) => pin.id),
			crowded.map((pin) => pin.id),
		);
		for (let index = 1; index < pins.length; index += 1) {
			const prev = pins[index - 1]!;
			const next = pins[index]!;
			assert.ok(next.t - prev.t >= minGapT - 1e-9, `${prev.id}→${next.id} 只差 ${next.t - prev.t}`);
		}
		for (const pin of pins) {
			assert.ok(pin.t >= -1e-9 && pin.t <= 1 + 1e-9, `${pin.id} 的 t=${pin.t} 越界`);
		}
	});

	it('keeps uncrowded pins on their true years and leaves the ends at 0 and 1', () => {
		const pins = yearRailPins(places, { minGapT: 0.02 });
		assert.equal(pins[0]?.t, 0);
		assert.equal(pins[pins.length - 1]?.t, 1);
		const mid = pins.find((pin) => pin.id === 'b');
		assert.ok(mid);
		assert.ok(Math.abs(mid.t - (1955 - 1951) / (1956 - 1951)) < 1e-9);
	});

	it('uses a default gap derived from the 11rem axis and the label line height', () => {
		const stacked = [
			{ id: 'a', year: 1951 },
			{ id: 'b', year: 1952 },
			{ id: 'c', year: 1953 },
			{ id: 'd', year: 1954 },
		];
		const pins = yearRailPins(stacked);
		assert.ok(Number.isFinite(pins[0]?.t));
		for (let index = 1; index < pins.length; index += 1) {
			assert.ok(pins[index]!.t - pins[index - 1]!.t > 0.05, `默认间距太窄：${JSON.stringify(pins)}`);
		}
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

describe('全馆章存在性（真实数据）', () => {
	/** 页面同一套入参：视觉存在＝有 reveal 图，链接存在＝links 非空。 */
	const assemble = (record: (typeof records)[number]) => {
		const fields = discNotesFields(record, { showMatrix: true, showPressing: true });
		const reveal = record.details.filter((detail) => {
			const mode = detailMode(detail);
			return mode === 'reveal';
		});
		return buildDiscChapters({
			story: record.story,
			hasMap: Boolean(record.trajectory),
			notesFields: fields,
			hasRecordVisuals: reveal.length > 0,
			hasNotesLinks: record.links.length > 0,
			extraRecordParagraphs: reveal
				.map((detail) => visibleDetailText(detail))
				.filter((text): text is string => Boolean(text)),
		});
	};

	/** 基线（改动前）的组装：没分章就整篇塞进唱片，story 恒为空。 */
	const baseline = (record: (typeof records)[number]) => {
		const fields = discNotesFields(record, { showMatrix: true, showPressing: true });
		const recordParas: string[] = [];
		const storyParas: string[] = [];
		let sawChapter = false;
		for (const parsed of parseStorySections(record.story)) {
			if (parsed.key === null) {
				recordParas.push(...parsed.blocks.flatMap((block) => block.paragraphs));
				continue;
			}
			sawChapter = true;
			const role = parsed.key === 'record' ? recordParas : storyParas;
			role.push(...parsed.blocks.flatMap((block) => block.paragraphs));
		}
		return {
			record: recordParas,
			story: sawChapter ? storyParas : [],
			notes: fields.length > 0,
			map: Boolean(record.trajectory),
		};
	};

	it('keeps 26 唱片 / 26 资料 / 22 地图 and restores 25 unsectioned 述语 verbatim', () => {
		assert.equal(records.length, 26);
		let notes = 0;
		let recordCount = 0;
		let maps = 0;
		let stories = 0;
		let restored = 0;
		let explicit = 0;
		const restoredIds: string[] = [];
		for (const record of records) {
			const chapters = assemble(record);
			const keys = chapters.map((chapter) => chapter.key);
			const base = baseline(record);
			if (keys.includes('notes')) notes += 1;
			if (keys.includes('record')) recordCount += 1;
			if (keys.includes('map')) maps += 1;
			if (keys.includes('story')) stories += 1;
			const story = chapters.find((chapter) => chapter.key === 'story');
			const parsed = story?.sections.flatMap((section) => section.paragraphs) ?? [];
			if (base.story.length > 0) {
				explicit += 1;
				// 已分章：述语段落序列与基线逐段相等（不重排、不删并）。
				assert.deepEqual(parsed, base.story, `${record.id} 述语段落被改动`);
			} else if (parsed.length > 0) {
				restored += 1;
				restoredIds.push(record.id);
				// 恢复的正是基线塞进唱片的那几段：原文顺序、逐段相等。
				assert.deepEqual(parsed, base.record, `${record.id} 恢复段落与原文不一致`);
			}
			assert.deepEqual(
				chapters.find((chapter) => chapter.key === 'notes')?.fields ?? [],
				base.notes ? discNotesFields(record, { showMatrix: true, showPressing: true }) : [],
			);
			assert.equal(keys.includes('map'), base.map, `${record.id} 地图存在性被改动`);
		}
		assert.equal(recordCount, 26);
		assert.equal(notes, 26);
		assert.equal(maps, 22);
		assert.equal(stories, 26, '述语应 26／26（1 原有 + 25 恢复）');
		assert.equal(explicit, 1);
		assert.equal(restored, 25);
		assert.ok(restoredIds.includes('mhjl329'));
		assert.ok(restoredIds.includes('ml5060'));
		assert.ok(restoredIds.includes('hzel700'));
		assert.ok(restoredIds.includes('d37779'));
	});

	it('never ships an empty pane and keeps the record image chapter without prose', () => {
		for (const record of records) {
			const chapters = assemble(record);
			assert.ok(chapters.length > 0);
			for (const chapter of chapters) {
				if (chapter.key === 'map' || chapter.key === 'record') continue;
				const body =
					chapter.key === 'notes'
						? chapter.fields.length
						: chapter.sections.reduce((sum, section) => sum + section.paragraphs.length, 0);
				assert.ok(body > 0, `${record.id} 的 ${chapter.key} 是空章`);
			}
			// 唱片章只要真有图就在，且不因为「没有正文」被顺手过滤。
			assert.ok(chapters.some((chapter) => chapter.key === 'record'));
		}
	});

	it('keeps hzel700 map-less and falp381 explicit distribution unchanged', () => {
		const hzel = assemble(records.find((record) => record.id === 'hzel700')!);
		assert.deepEqual(
			hzel.map((chapter) => chapter.key),
			['record', 'story', 'notes'],
		);
		const falp = assemble(records.find((record) => record.id === 'falp381')!);
		assert.deepEqual(
			falp.map((chapter) => chapter.key),
			['record', 'story', 'map', 'notes'],
		);
		const story = falp.find((chapter) => chapter.key === 'story')!;
		const text = story.sections.flatMap((section) => section.paragraphs).join('\n');
		assert.match(text, /富特万格勒/);
		assert.match(text, /火炬图案/);
		// `## 唱片` 的物述仍归唱片章数据、不在述语里重画。
		assert.ok(!text.includes('两枚唱片'));
	});
});

describe('正文归属边角（fixture）', () => {
	it('keeps unknown H2 as an in-chapter subtitle in original order, never unshifted', () => {
		const chapters = buildDiscChapters({
			story: `开头无标题段。

## 自定义标题

自定义标题下的段落。

## 述语

述语段。`,
			hasMap: false,
		});
		const story = chapters.find((chapter) => chapter.key === 'story')!;
		assert.deepEqual(
			story.sections.map((section) => [section.title, section.paragraphs]),
			[
				['', ['开头无标题段。']],
				['自定义标题', ['自定义标题下的段落。']],
				['', ['述语段。']],
			],
		);
	});

	it('keeps explicit `## 唱片` physical description out of 述语', () => {
		const chapters = buildDiscChapters({ story: chaptered, hasMap: false, hasRecordVisuals: true });
		const story = chapters.find((chapter) => chapter.key === 'story')!;
		assert.ok(!JSON.stringify(story).includes('Pathé-Marconi'));
		assert.ok(JSON.stringify(chapters.find((chapter) => chapter.key === 'record')).includes('Pathé-Marconi'));
	});

	it('treats blank titles as no prose and honours null / empty optional fields', () => {
		const chapters = buildDiscChapters({
			story: '### 只有小题没有正文\n\n## 述语\n\n正文一段。',
			hasMap: false,
			notesFields: null,
			hasNotesLinks: false,
		});
		assert.deepEqual(
			chapters.map((chapter) => chapter.key),
			['story'],
		);
		assert.deepEqual(chapters[0]?.sections, [{ title: '', paragraphs: ['正文一段。'] }]);
		// 只有注释／空白的正文不出章，也不留空 pane。
		assert.deepEqual(buildDiscChapters({ story: '<!-- beat -->\n\n   \n', hasMap: false }), []);
	});

	it('keeps a notes chapter that only has public links, and drops it when bare', () => {
		const withLinks = buildDiscChapters({
			story: '',
			hasMap: false,
			notesFields: [],
			hasNotesLinks: true,
		});
		assert.deepEqual(
			withLinks.map((chapter) => chapter.key),
			['notes'],
		);
		assert.deepEqual(withLinks[0]?.fields, []);
		const bare = buildDiscChapters({ story: '', hasMap: false, notesFields: [], hasNotesLinks: false });
		assert.deepEqual(bare, []);
	});

	it('keeps an images-only record chapter and no story when nothing is written', () => {
		const chapters = buildDiscChapters({ story: '', hasMap: false, hasRecordVisuals: true });
		assert.deepEqual(
			chapters.map((chapter) => chapter.key),
			['record'],
		);
		assert.deepEqual(chapters[0]?.sections, []);
	});

	it('does not invent a map from a year alone', () => {
		const chapters = buildDiscChapters({ story: '一段。', hasMap: false });
		assert.ok(!chapters.some((chapter) => chapter.key === 'map'));
	});

	it('neighbours come from the same chapter table, one step, no wrap', () => {
		const chapters = buildDiscChapters({ story: '一段。', hasMap: false, hasRecordVisuals: true });
		assert.deepEqual(
			chapters.map((chapter) => chapter.key),
			['record', 'story'],
		);
		assert.deepEqual(chapterNeighbor({ chapters, index: 0, dir: 1 }), {
			index: 1,
			moved: true,
			kind: 'chapter',
		});
		assert.deepEqual(chapterNeighbor({ chapters, index: 1, dir: 1 }), {
			index: 1,
			moved: false,
			kind: 'edge',
		});
		assert.deepEqual(chapterNeighbor({ chapters, index: 0, dir: -1 }), {
			index: 0,
			moved: false,
			kind: 'edge',
		});
		// 地图章认邻居（跨章由壳提交），stepChapter 仍把地图手势留给 traj。
		const withMap = buildDiscChapters({ story: '一段。', hasMap: true, hasRecordVisuals: true });
		assert.deepEqual(
			withMap.map((chapter) => chapter.key),
			['record', 'story', 'map'],
		);
		assert.equal(chapterNeighbor({ chapters: withMap, index: 1, dir: 1 }).moved, true);
		assert.deepEqual(stepChapter({ chapters: withMap, index: 2, dir: 1 }), {
			index: 2,
			moved: false,
			kind: 'map',
		});
	});
});
