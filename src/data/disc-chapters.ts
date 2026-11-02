/**
 * 窄屏碟页章节：把 `story` 切成 章 → 拍，并把竖滑／跟翻／年轴比例算成纯函数。
 *
 * 章：唱片 → 来龙去脉 → 资料 →（地图）。章标题按 `## 唱片`（精确匹配或 alias）。
 * 拍：`<!-- beat -->` 或 `###` 优先；无标记时按自然段回退，长段按句号软折。
 * 一章没有内容就是空章：不进底栏，也不吃手势，绝不用假文案占位。
 *
 * `mode` 是章的阅读形态：`beats` 一拍一屏（唱片／资料），`scroll` 章内普通长滚
 * （来龙去脉：连续文章，不生成 beat 轨、不跟拍步进）。
 */

export const CHAPTER_KEYS = ['record', 'story', 'notes', 'map'] as const;
export type ChapterKey = (typeof CHAPTER_KEYS)[number];
export type TextChapterKey = Exclude<ChapterKey, 'map'>;

export const CHAPTER_LABELS: Record<ChapterKey, string> = {
	record: '唱片',
	story: '来龙去脉',
	notes: '资料',
	map: '地图',
};

/** 章标题：精确匹配，不猜近义词。 */
const CHAPTER_ALIASES: Record<string, TextChapterKey> = {
	唱片: 'record',
	本盘: 'record',
	物述: 'record',
	来龙去脉: 'story',
	始末: 'story',
	故事: 'story',
	资料: 'notes',
	附录: 'notes',
	著录: 'notes',
};

/** 一拍的目标字数：一屏可读，略超也行。 */
export const BEAT_TARGET_CHARS = 120;
/** 单段超过这个长度就按句号软折，不再整段塞进一拍。 */
export const BEAT_MAX_CHARS = 220;

const SENTENCE_STOPS = '。！？；!?;';

export type DiscBeat = {
	/** `###` 或 `##` 给的小题；段落回退出来的拍没有题。 */
	title: string;
	paragraphs: string[];
};

/** 章的阅读形态：拍切，或章内普通长滚。 */
export type ChapterMode = 'beats' | 'scroll';

export type DiscChapter = {
	key: ChapterKey;
	label: string;
	/** 地图章没有拍：站点由 traj 自己走。 */
	beats: DiscBeat[];
	/** `scroll` 的章不生成 beat 轨，竖滑就是章内长滚。 */
	mode: ChapterMode;
};

/** 一章按拍步进吗：长滚章与地图章都不走 `stepBeat` 的章内分支。 */
export function stepsByBeat(chapter: DiscChapter): boolean {
	return chapter.mode === 'beats' && chapter.key !== 'map';
}

/** 长滚章在文头／文末之外，竖滑留给文章自己。 */
export function scrollFollowThrough(input: {
	atTop: boolean;
	atBottom: boolean;
	dir: 1 | -1;
}): boolean {
	return input.dir > 0 ? input.atBottom : input.atTop;
}

export function chapterKeyForTitle(title: string): TextChapterKey | null {
	return CHAPTER_ALIASES[title.trim()] ?? null;
}

export function isTextChapter(chapter: DiscChapter): boolean {
	return chapter.key !== 'map';
}

/** 长段软折：优先在句号／问号／叹号处断，找不到就硬切。 */
export function softSplitSentence(text: string, limit: number = BEAT_TARGET_CHARS): string[] {
	const out: string[] = [];
	let rest = text.trim();
	while (rest.length > limit) {
		let cut = -1;
		for (let i = limit; i > Math.floor(limit / 3); i--) {
			const ch = rest[i - 1];
			if (ch !== undefined && SENTENCE_STOPS.includes(ch)) {
				cut = i;
				break;
			}
		}
		if (cut <= 0) cut = limit;
		out.push(rest.slice(0, cut).trim());
		rest = rest.slice(cut).trim();
	}
	if (rest) out.push(rest);
	return out;
}

/** 段落 → 拍：凑到一拍的目标字数就断，单段过长先软折。 */
function groupParagraphs(paragraphs: readonly string[]): string[][] {
	const groups: string[][] = [];
	let current: string[] = [];
	let size = 0;
	const flush = (): void => {
		if (current.length === 0) return;
		groups.push(current);
		current = [];
		size = 0;
	};
	for (const raw of paragraphs) {
		const text = raw.trim();
		if (!text) continue;
		if (text.length > BEAT_MAX_CHARS) {
			flush();
			for (const piece of softSplitSentence(text)) groups.push([piece]);
			continue;
		}
		if (current.length > 0 && size + text.length > BEAT_TARGET_CHARS) flush();
		current.push(text);
		size += text.length;
	}
	flush();
	return groups;
}

type RawBeat = { title: string; paragraphs: string[] };
type RawSection = { key: TextChapterKey | null; title: string; beats: RawBeat[] };

const BEAT_MARK = /^<!--\s*beat\s*-->$/i;
const SECTION_TITLE = /^##[ \t]+(.+?)\s*$/;
const BEAT_TITLE = /^###+[ \t]+(.+?)\s*$/;
const HTML_COMMENT = /^<!--.*-->$/;

/**
 * Markdown → 章 → 原始拍。只认 `##` 章标题、`###` 拍小题与 `<!-- beat -->` 标记；
 * 其他 HTML 注释丢掉，标题行不留进正文。
 */
export function parseStorySections(story: string): RawSection[] {
	const sections: RawSection[] = [];
	let section: RawSection = { key: null, title: '', beats: [{ title: '', paragraphs: [] }] };
	const push = (): void => {
		const beats = section.beats.filter(
			(beat) => beat.title !== '' || beat.paragraphs.length > 0,
		);
		if (section.key !== null || beats.length > 0) sections.push({ ...section, beats });
	};
	let buffer: string[] = [];
	const closeBeat = (): void => {
		const paragraphs = buffer.map((line) => line.trim()).join('\n').trim();
		buffer = [];
		const beat = section.beats[section.beats.length - 1];
		if (!beat) return;
		if (paragraphs !== '') beat.paragraphs.push(paragraphs);
	};
	const openBeat = (title = ''): void => {
		closeBeat();
		section.beats.push({ title, paragraphs: [] });
	};
	for (const line of story.replace(/^\uFEFF/, '').split(/\r?\n/)) {
		const trimmed = line.trim();
		const sectionTitle = SECTION_TITLE.exec(trimmed);
		if (sectionTitle) {
			closeBeat();
			push();
			section = {
				key: chapterKeyForTitle(sectionTitle[1] ?? ''),
				title: (sectionTitle[1] ?? '').trim(),
				beats: [{ title: '', paragraphs: [] }],
			};
			continue;
		}
		const beatTitle = BEAT_TITLE.exec(trimmed);
		if (beatTitle) {
			openBeat((beatTitle[1] ?? '').trim());
			continue;
		}
		if (BEAT_MARK.test(trimmed)) {
			openBeat();
			continue;
		}
		if (trimmed === '') {
			closeBeat();
			continue;
		}
		if (HTML_COMMENT.test(trimmed)) continue;
		buffer.push(line);
	}
	closeBeat();
	push();
	return sections;
}

function toBeats(chunks: readonly RawBeat[]): DiscBeat[] {
	const beats: DiscBeat[] = [];
	for (const chunk of chunks) {
		if (chunk.title !== '') {
			beats.push({ title: chunk.title, paragraphs: [...chunk.paragraphs] });
			continue;
		}
		for (const group of groupParagraphs(chunk.paragraphs)) beats.push({ title: '', paragraphs: group });
	}
	return beats.filter((beat) => beat.title !== '' || beat.paragraphs.length > 0);
}

export type DiscChaptersInput = {
	story: string;
	/** 这张碟有没有时空轨迹（没有就不出地图章）。 */
	hasMap: boolean;
	/** 版面余文：story 里没有分章时先全部落进「唱片」。 */
	extraRecordParagraphs?: readonly string[];
};

/**
 * `story` → 章表。有 `##` 章标题就按标题分派（未认出的标题内容并入「唱片」）；
 * 一个章标题都没有时，整段先落进「唱片」。空章直接不出。
 */
export function buildDiscChapters(input: DiscChaptersInput): DiscChapter[] {
	const buckets: Record<TextChapterKey, RawBeat[]> = { record: [], story: [], notes: [] };
	let sawChapter = false;
	for (const section of parseStorySections(input.story)) {
		if (section.key !== null) sawChapter = true;
		const key: TextChapterKey = section.key ?? 'record';
		const beats = [...section.beats];
		// 没有 `###` 小题的未认章标题，退化成一拍的小题，别丢信息也别乱猜章。
		if (section.key === null && section.title !== '') {
			if (beats.length === 0) beats.push({ title: section.title, paragraphs: [] });
			else if (beats[0] && beats[0].title === '') beats[0] = { ...beats[0], title: section.title };
		}
		buckets[key].push(...beats);
	}
	// 全篇没有章标题时，版面余文也属「物本身」，一起落进唱片；已有分章就不再塞。
	if (!sawChapter && input.extraRecordParagraphs?.length) {
		buckets.record.push({ title: '', paragraphs: [...input.extraRecordParagraphs] });
	}
	const chapters: DiscChapter[] = CHAPTER_KEYS.map((key) => ({
		key,
		label: CHAPTER_LABELS[key],
		mode: chapterMode(key),
		beats: key === 'map' ? [] : toBeats(buckets[key]),
	}));
	return chapters.filter((chapter) =>
		chapter.key === 'map' ? input.hasMap : chapter.beats.length > 0,
	);
}

/** 章 → 阅读形态：只有来龙去脉是连续长滚，其余仍是拍切。 */
export function chapterMode(key: ChapterKey): ChapterMode {
	return key === 'story' ? 'scroll' : 'beats';
}

/** 唱片章的封面相在拍轨之前：`stepBeat` 走到首拍再往上就是它。 */
export type ChapterStepKind = 'beat' | 'chapter' | 'edge' | 'cover' | 'map';

export type ChapterStep = {
	index: number;
	beat: number;
	/** 位置真的变了没有。 */
	moved: boolean;
	/** 首章首拍再往上：回唱片章的封面相（同章内，不是无栏幽灵序幕）。 */
	exited: boolean;
	kind: ChapterStepKind;
};

export type ChapterStepInput = {
	chapters: readonly DiscChapter[];
	index: number;
	beat: number;
	/** +1 = 下一（指上／轮下），-1 = 上一。 */
	dir: 1 | -1;
};

/**
 * 拍步进：本章内换拍；末拍再下一 → 下一章拍 1；首拍再上一 → 上一章末拍。
 * 首章首拍再往上回唱片封面相；末章（地图）不吃这个手势（站点归 traj）。
 * 长滚章没有章内拍位：它只有「文首／文末」，所以这里的 `count` 恒为 1。
 */
export function stepBeat(input: ChapterStepInput): ChapterStep {
	const { chapters, dir } = input;
	if (chapters.length === 0) {
		return { index: 0, beat: 0, moved: false, exited: true, kind: 'cover' };
	}
	const index = Math.min(Math.max(input.index, 0), chapters.length - 1);
	const chapter = chapters[index];
	if (!chapter) return { index, beat: 0, moved: false, exited: true, kind: 'cover' };
	if (chapter.key === 'map') return { index, beat: 0, moved: false, exited: false, kind: 'map' };
	const count = stepsByBeat(chapter) ? chapter.beats.length : 1;
	const beat = Math.min(Math.max(input.beat, 0), Math.max(0, count - 1));
	const next = beat + dir;
	if (next >= 0 && next < count) {
		return { index, beat: next, moved: true, exited: false, kind: 'beat' };
	}
	if (dir > 0) {
		if (index + 1 >= chapters.length) {
			return { index, beat, moved: false, exited: false, kind: 'edge' };
		}
		return { index: index + 1, beat: 0, moved: true, exited: false, kind: 'chapter' };
	}
	if (index === 0) return { index, beat, moved: false, exited: true, kind: 'cover' };
	const previous = chapters[index - 1];
	if (!previous || !isTextChapter(previous)) {
		return { index: index - 1, beat: 0, moved: true, exited: false, kind: 'chapter' };
	}
	return {
		index: index - 1,
		beat: stepsByBeat(previous) ? Math.max(0, previous.beats.length - 1) : 0,
		moved: true,
		exited: false,
		kind: 'chapter',
	};
}

export type MapViewMode = 'guide' | 'explore' | 'chrono';

/**
 * 章内竖滑归谁：正文三章归章节壳（一拍一屏），地图章归 traj。
 * 「离章不吞轮」：出了地图章，壳重新接管；进了地图章，壳一个 delta 都不吃。
 */
export function shellOwnsVertical(chapterKey: ChapterKey): boolean {
	return chapterKey !== 'map';
}

/** 地图章的竖滑换不换站：探索态只拖捏，不换站也不翻章。 */
export function mapSteppingStations(viewMode: MapViewMode): boolean {
	return viewMode !== 'explore';
}

/** 地图章里，竖滑到底该由谁处理。 */
export type VerticalOwner = 'chapters' | 'map';

export function verticalOwner(input: {
	chapterKey: ChapterKey;
	mapViewMode: MapViewMode | null;
}): VerticalOwner {
	if (shellOwnsVertical(input.chapterKey)) return 'chapters';
	return 'map';
}

export type YearRailPin = {
	id: string;
	year: number;
	/** 0 → 1，按真实年份比例，不按站号均分。 */
	t: number;
	/** 同一年的第二站不再重复打年号。 */
	label: string | null;
};

/** 左纵年轴：年距按真实年份比例，同年保持原序。 */
export function yearRailPins(places: readonly { id: string; year: number }[]): YearRailPin[] {
	if (places.length === 0) return [];
	const sorted = places.map((place, index) => ({ place, index }));
	sorted.sort((a, b) => a.place.year - b.place.year || a.index - b.index);
	const min = sorted[0]?.place.year ?? 0;
	const max = sorted[sorted.length - 1]?.place.year ?? min;
	const span = max - min;
	return sorted.map((row, position) => {
		const previous = sorted[position - 1];
		const sameYear = previous !== undefined && previous.place.year === row.place.year;
		return {
			id: row.place.id,
			year: row.place.year,
			t: span <= 0 ? 0.5 : (row.place.year - min) / span,
			label: sameYear ? null : String(row.place.year),
		};
	});
}

/** 纵轴钉的百分比位置：`top` 与 `bottom` 各留一点内距，年距仍是线性的。 */
export function yearRailOffset(pin: YearRailPin, padRatio = 0.06): string {
	const t = Math.min(1, Math.max(0, pin.t));
	const ratio = padRatio + (1 - 2 * padRatio) * t;
	return `${(ratio * 100).toFixed(3)}%`;
}
