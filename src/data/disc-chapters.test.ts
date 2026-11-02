import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
	BEAT_MAX_CHARS,
	BEAT_TARGET_CHARS,
	buildDiscChapters,
	chapterKeyForTitle,
	chapterMode,
	mapSteppingStations,
	parseStorySections,
	scrollFollowThrough,
	shellOwnsVertical,
	softSplitSentence,
	stepBeat,
	stepsByBeat,
	verticalOwner,
	yearRailOffset,
	yearRailPins,
	type DiscChapter,
} from './disc-chapters.ts';

const chaptered = `## 唱片

法版由 Pathé-Marconi 压制，两张装在五线谱与贝多芬肖像盒中。

内圈刻着 2XRA 开头的母带号。

## 来龙去脉

1951 年 7 月 29 日，拜罗伊特节日剧院战后重新开幕。

母带封存四年，直到 1955 年末才以密纹问世。

## 资料

封套把录音日期写作「1951 年 8 月」，与实际的 7 月 29 日略有出入。`;

const chapteredChapters = buildDiscChapters({ story: chaptered, hasMap: true });

describe('detail → 章 → 拍', () => {
	it('reads `##` chapter titles, exact or alias', () => {
		assert.equal(chapterKeyForTitle('唱片'), 'record');
		assert.equal(chapterKeyForTitle(' 本盘 '), 'record');
		assert.equal(chapterKeyForTitle('来龙去脉'), 'story');
		assert.equal(chapterKeyForTitle('始末'), 'story');
		assert.equal(chapterKeyForTitle('资料'), 'notes');
		assert.equal(chapterKeyForTitle('附录'), 'notes');
		assert.equal(chapterKeyForTitle('唱片说明'), null);
	});

	it('splits three chapters and keeps the map last', () => {
		assert.deepEqual(
			chapteredChapters.map((chapter) => chapter.key),
			['record', 'story', 'notes', 'map'],
		);
		assert.deepEqual(
			chapteredChapters.map((chapter) => chapter.label),
			['唱片', '来龙去脉', '资料', '地图'],
		);
		assert.equal(chapteredChapters[0]?.beats.length, 1);
		// 两段短句并进一拍：一拍一屏，不按段号硬切
		assert.equal(chapteredChapters[1]?.beats.length, 1);
		assert.equal(chapteredChapters[2]?.beats.length, 1);
		assert.deepEqual(chapteredChapters[3]?.beats, []);
	});

	it('assigns chapter reading modes: story scrolls, others beat', () => {
		assert.equal(chapterMode('record'), 'beats');
		assert.equal(chapterMode('story'), 'scroll');
		assert.equal(chapterMode('notes'), 'beats');
		assert.equal(chapterMode('map'), 'beats');
		assert.deepEqual(
			chapteredChapters.map((chapter) => chapter.mode),
			['beats', 'scroll', 'beats', 'beats'],
		);
		assert.equal(stepsByBeat(chapteredChapters[0]!), true);
		assert.equal(stepsByBeat(chapteredChapters[1]!), false);
		assert.equal(stepsByBeat(chapteredChapters[2]!), true);
		assert.equal(stepsByBeat(chapteredChapters[3]!), false);
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
		assert.equal(chapters[0]?.beats.length, 1);
		for (const chapter of chapters) {
			for (const beat of chapter.beats) {
				for (const paragraph of beat.paragraphs) {
					assert.ok(!/lorem/i.test(paragraph));
					assert.ok(paragraph.length > 0);
				}
			}
		}
	});

	it('falls back to whole-story 唱片 when there is no chapter division', () => {
		const chapters = buildDiscChapters({ story: chaptered.split('## 唱片')[0] + '一段余文。', hasMap: true });
		assert.equal(chapters[0]?.key, 'record');
		assert.ok((chapters[0]?.beats.length ?? 0) > 0);
	});

	it('takes `<!-- beat -->` and `###` before paragraph fallback', () => {
		const sections = parseStorySections(`## 唱片

### 盒

五线谱盒。

<!-- beat -->

### 刻片

内圈 2XRA。`);
		assert.equal(sections.length, 1);
		assert.deepEqual(
			sections[0]?.beats.map((beat) => beat.title),
			['盒', '刻片'],
		);
		assert.deepEqual(sections[0]?.beats[0]?.paragraphs, ['五线谱盒。']);
	});

	it('soft-folds a long paragraph at a sentence stop', () => {
		const long = `${'甲'.repeat(BEAT_TARGET_CHARS)}。${'乙'.repeat(BEAT_MAX_CHARS)}`;
		const pieces = softSplitSentence(long.split('。')[0] + '。' + '乙'.repeat(BEAT_MAX_CHARS));
		assert.ok(pieces.length > 1);
		for (const piece of pieces) assert.ok(piece.length <= BEAT_TARGET_CHARS);
		assert.ok(pieces.every((piece) => piece.length > 0));
		const chapters = buildDiscChapters({ story: long, hasMap: false });
		assert.ok((chapters[0]?.beats.length ?? 0) > 1);
	});

	it('puts the layout remainder text into 唱片 only when the story has no chapter', () => {
		const withChapters = buildDiscChapters({
			story: chaptered,
			hasMap: false,
			extraRecordParagraphs: ['版面余文。'],
		});
		assert.equal(withChapters[0]?.beats.length, 1);
		const bare = buildDiscChapters({
			story: '一段余文。',
			hasMap: false,
			extraRecordParagraphs: ['版面余文。'],
		});
		assert.ok(JSON.stringify(bare).includes('版面余文'));
	});
});

describe('拍步进与跟翻', () => {
	const chapters: DiscChapter[] = [
		{
			key: 'record',
			label: '唱片',
			mode: 'beats',
			beats: [
				{ title: '', paragraphs: ['1'] },
				{ title: '', paragraphs: ['2'] },
			],
		},
		{ key: 'story', label: '来龙去脉', mode: 'scroll', beats: [{ title: '', paragraphs: ['3'] }] },
		{ key: 'map', label: '地图', mode: 'beats', beats: [] },
	];

	it('steps inside a chapter', () => {
		assert.deepEqual(stepBeat({ chapters, index: 0, beat: 0, dir: 1 }), {
			index: 0,
			beat: 1,
			moved: true,
			exited: false,
			kind: 'beat',
		});
		assert.equal(stepBeat({ chapters, index: 0, beat: 1, dir: -1 }).beat, 0);
	});

	it('follows through at the last beat without a second confirmation', () => {
		const next = stepBeat({ chapters, index: 0, beat: 1, dir: 1 });
		assert.deepEqual(next, { index: 1, beat: 0, moved: true, exited: false, kind: 'chapter' });
		const intoMap = stepBeat({ chapters, index: 1, beat: 0, dir: 1 });
		assert.deepEqual(intoMap, { index: 2, beat: 0, moved: true, exited: false, kind: 'chapter' });
	});

	it('treats scroll chapters as a single stepBeat slot (no intra-chapter beats)', () => {
		const story = chapters[1]!;
		assert.equal(stepsByBeat(story), false);
		const still = stepBeat({ chapters, index: 1, beat: 0, dir: 1 });
		assert.equal(still.index, 2);
		assert.equal(still.kind, 'chapter');
	});

	it('follows back to the previous chapter last beat, and out to cover from the first beat', () => {
		const back = stepBeat({ chapters, index: 1, beat: 0, dir: -1 });
		assert.deepEqual(back, { index: 0, beat: 1, moved: true, exited: false, kind: 'chapter' });
		const cover = stepBeat({ chapters, index: 0, beat: 0, dir: -1 });
		assert.equal(cover.exited, true);
		assert.equal(cover.moved, false);
		assert.equal(cover.kind, 'cover');
	});

	it('leaves station stepping and the document end alone', () => {
		const inMap = stepBeat({ chapters, index: 2, beat: 0, dir: 1 });
		assert.equal(inMap.kind, 'map');
		assert.equal(inMap.moved, false);
		assert.equal(stepBeat({ chapters, index: 2, beat: 0, dir: -1 }).kind, 'map');
		const atEnd = stepBeat({
			chapters: chapters.filter((chapter) => chapter.key !== 'map'),
			index: 1,
			beat: 0,
			dir: 1,
		});
		assert.equal(atEnd.kind, 'edge');
		assert.equal(atEnd.moved, false);
	});
});

describe('长滚跟翻边界', () => {
	it('only follows through at the scroll edges', () => {
		assert.equal(scrollFollowThrough({ atTop: false, atBottom: false, dir: 1 }), false);
		assert.equal(scrollFollowThrough({ atTop: false, atBottom: true, dir: 1 }), true);
		assert.equal(scrollFollowThrough({ atTop: true, atBottom: false, dir: -1 }), true);
		assert.equal(scrollFollowThrough({ atTop: true, atBottom: false, dir: 1 }), false);
		assert.equal(scrollFollowThrough({ atTop: false, atBottom: true, dir: -1 }), false);
	});
});

describe('手势归属', () => {
	it('keeps the wheel for the chapter shell outside the map chapter', () => {
		assert.equal(shellOwnsVertical('record'), true);
		assert.equal(shellOwnsVertical('story'), true);
		assert.equal(shellOwnsVertical('notes'), true);
		// 离章不吞轮：地图章的 delta 一个都不拦，全交给 traj
		assert.equal(shellOwnsVertical('map'), false);
		assert.equal(verticalOwner({ chapterKey: 'map', mapViewMode: 'guide' }), 'map');
		assert.equal(verticalOwner({ chapterKey: 'record', mapViewMode: null }), 'chapters');
	});

	it('does not step stations while exploring', () => {
		assert.equal(mapSteppingStations('explore'), false);
		assert.equal(mapSteppingStations('guide'), true);
		assert.equal(mapSteppingStations('chrono'), true);
		// 探索里竖滑既不换站，也不翻章
		assert.equal(verticalOwner({ chapterKey: 'map', mapViewMode: 'explore' }), 'map');
	});
});

describe('左纵年轴', () => {
	const stops = [
		{ id: 'berlin-birth', year: 1885 },
		{ id: 'berlin-post', year: 1922 },
		{ id: 'bayreuth', year: 1951 },
		{ id: 'london', year: 1955 },
		{ id: 'paris', year: 1956 },
	];

	it('spaces pins by real year distance, not by station index', () => {
		const pins = yearRailPins(stops);
		assert.deepEqual(
			pins.map((pin) => pin.id),
			stops.map((stop) => stop.id),
		);
		assert.deepEqual(
			pins.map((pin) => pin.year),
			[1885, 1922, 1951, 1955, 1956],
		);
		assert.equal(pins[0]?.t, 0);
		assert.equal(pins[4]?.t, 1);
		assert.ok(Math.abs((pins[1]?.t ?? 0) - 37 / 71) < 1e-9);
		assert.ok(Math.abs((pins[2]?.t ?? 0) - 66 / 71) < 1e-9);
		// 37 年的空档远宽于 1 年的空档
		assert.ok((pins[1]?.t ?? 0) - (pins[0]?.t ?? 0) > 10 * ((pins[4]?.t ?? 0) - (pins[3]?.t ?? 0)));
	});

	it('sorts by year, keeps same-year order, and labels a year once', () => {
		const pins = yearRailPins([
			{ id: 'late', year: 1956 },
			{ id: 'first', year: 1951 },
			{ id: 'second', year: 1951 },
		]);
		assert.deepEqual(
			pins.map((pin) => pin.id),
			['first', 'second', 'late'],
		);
		assert.deepEqual(
			pins.map((pin) => pin.label),
			['1951', null, '1956'],
		);
		assert.equal(yearRailOffset({ id: 'a', year: 0, t: 0, label: null }), '6.000%');
		assert.equal(yearRailOffset({ id: 'a', year: 0, t: 1, label: null }), '94.000%');
		assert.equal(yearRailPins([]).length, 0);
	});
});
