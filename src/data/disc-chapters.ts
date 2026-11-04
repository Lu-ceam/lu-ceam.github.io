/**
 * 窄屏碟页章节 v3：四格 —— 唱片｜述语｜地图｜资料。
 *
 * 唱片 `cover-scroll`：题铭＋封面缩放一体，`## 唱片` 的物述直接接在缩放区下方连续长滚；
 * 述语 `scroll`：碟的公开长文一篇长滚（`## 来龙去脉`／`## 资料` 的叙事段按文序并进来）；
 * 资料 `list`：著录字段（dl）一页滚完，不从 Markdown 编；
 * 地图 `map`：站点归 traj。
 *
 * 正文三章都不是拍切：没有 beat 轨、没有「1／n」拍计数，竖滑就是滚文章，
 * 只有文头／文末才跟翻邻章。空章不进底栏，绝不用假文案占位。
 */

export const CHAPTER_KEYS = ['record', 'story', 'map', 'notes'] as const;
export type ChapterKey = (typeof CHAPTER_KEYS)[number];
export type TextChapterKey = Exclude<ChapterKey, 'map'>;

export const CHAPTER_LABELS: Record<ChapterKey, string> = {
	record: '唱片',
	story: '述语',
	map: '地图',
	notes: '资料',
};

/** 章标题：精确匹配，不猜近义词。`## 资料` 的叙事段落并进述语，不再单独立章。 */
const CHAPTER_ALIASES: Record<string, TextChapterKey> = {
	唱片: 'record',
	本盘: 'record',
	物述: 'record',
	述语: 'story',
	来龙去脉: 'story',
	始末: 'story',
	故事: 'story',
	资料: 'story',
	附录: 'story',
	著录: 'story',
};

/**
 * 章的阅读形态：`cover-scroll` 封面＋长滚，`scroll` 长滚，
 * `list` 结构化字段列表，`map` 交 traj。没有拍切。
 */
export type ChapterMode = 'cover-scroll' | 'scroll' | 'list' | 'map';

/** 正文块：`###` 小题（可空）＋段落。连续排，不切拍。 */
export type DiscChapterSection = { title: string; paragraphs: string[] };

/** 著录字段：`dt` 与 `dd`，与页面已有 `<dl class="props">` 同一套。 */
export type DiscChapterField = { term: string; value: string };

export type DiscChapter = {
	key: ChapterKey;
	label: string;
	mode: ChapterMode;
	sections: DiscChapterSection[];
	/** 只有资料章有字段。 */
	fields: DiscChapterField[];
};

/** 章 → 阅读形态。 */
export function chapterMode(key: ChapterKey): ChapterMode {
	switch (key) {
		case 'record':
			return 'cover-scroll';
		case 'story':
			return 'scroll';
		case 'notes':
			return 'list';
		case 'map':
			return 'map';
	}
}

/** 这一章有没有章内长滚（地图章除外，站点归 traj）。 */
export function scrollsBody(chapter: DiscChapter): boolean {
	return chapter.mode !== 'map';
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

export function hasChapterBody(chapter: DiscChapter): boolean {
	return chapter.sections.length > 0 || chapter.fields.length > 0;
}

/** `##` 切开的一段原文：`###` 是段内小题，段落原样保留。 */
export type ParsedSection = {
	key: TextChapterKey | null;
	title: string;
	blocks: DiscChapterSection[];
};

const SECTION_TITLE = /^##[ \t]+(.+?)\s*$/;
const SUB_TITLE = /^###+[ \t]+(.+?)\s*$/;
const BEAT_MARK = /^<!--\s*beat\s*-->$/i;
const HTML_COMMENT = /^<!--.*-->$/;

/**
 * Markdown → 原文段。只认 `##` 章标题、`###` 段内小题；
 * `<!-- beat -->` 只当作段界（不再生成拍），其他 HTML 注释丢掉。
 */
export function parseStorySections(story: string): ParsedSection[] {
	const chunks: ParsedSection[] = [];
	let chunk: ParsedSection = { key: null, title: '', blocks: [] };
	let block: DiscChapterSection | null = null;
	let para: string[] = [];

	const flushParagraph = (): void => {
		const text = para.join('\n').trim();
		para = [];
		if (text === '') return;
		if (!block) block = { title: '', paragraphs: [] };
		block.paragraphs.push(text);
	};
	const closeBlock = (): void => {
		flushParagraph();
		if (!block) return;
		if (block.title !== '' || block.paragraphs.length > 0) chunk.blocks.push(block);
		block = null;
	};
	const openBlock = (title: string): void => {
		closeBlock();
		block = { title, paragraphs: [] };
	};
	const closeChunk = (): void => {
		closeBlock();
		if (chunk.key !== null || chunk.blocks.length > 0) chunks.push(chunk);
	};

	for (const line of story.replace(/^\uFEFF/, '').split(/\r?\n/)) {
		const trimmed = line.trim();
		const sectionTitle = SECTION_TITLE.exec(trimmed);
		if (sectionTitle) {
			closeChunk();
			const title = (sectionTitle[1] ?? '').trim();
			chunk = { key: chapterKeyForTitle(title), title, blocks: [] };
			continue;
		}
		const subTitle = SUB_TITLE.exec(trimmed);
		if (subTitle) {
			openBlock((subTitle[1] ?? '').trim());
			continue;
		}
		if (BEAT_MARK.test(trimmed)) {
			openBlock('');
			continue;
		}
		if (trimmed === '') {
			flushParagraph();
			continue;
		}
		if (HTML_COMMENT.test(trimmed)) continue;
		para.push(line);
	}
	closeChunk();
	return chunks;
}

export type DiscChaptersInput = {
	story: string;
	/** 这张碟有没有时空轨迹（没有就不出地图章）。 */
	hasMap: boolean;
	/** 著录字段（资料章）：页面已有 `<dl class="props">` 的同一份数据。 */
	notesFields?: readonly DiscChapterField[];
	/** 版面余文：story 里没有分章时先全部落进「唱片」。 */
	extraRecordParagraphs?: readonly string[];
};

/**
 * `story` → 章表。`## 唱片` 归唱片，其余叙事章（`## 来龙去脉`／`## 述语`／`## 资料`）
 * 按文序并进述语一篇。资料章的正文是字段，不是 Markdown。空章直接不出。
 */
export function buildDiscChapters(input: DiscChaptersInput): DiscChapter[] {
	const prose: Record<'record' | 'story', DiscChapterSection[]> = { record: [], story: [] };
	const untitled: DiscChapterSection[] = [];
	let sawChapter = false;
	for (const parsed of parseStorySections(input.story)) {
		if (parsed.key === null) {
			// 还没碰上 `##`：先攒着，最后按有没有分章决定落点。
			untitled.push(...parsed.blocks);
			continue;
		}
		sawChapter = true;
		// 章标题本身不再重复（章名已由底栏说），`###` 小题留着。
		const role: 'record' | 'story' = parsed.key === 'record' ? 'record' : 'story';
		prose[role].push(...parsed.blocks);
	}
	if (!sawChapter) {
		// 没分章：整篇（加版面余文）落进「唱片」。
		prose.record.push(...untitled);
		if (input.extraRecordParagraphs?.length) {
			prose.record.push({ title: '', paragraphs: [...input.extraRecordParagraphs] });
		}
	} else if (untitled.length > 0) {
		// 有分章时，文首无标题余文并进述语，不另立章。
		prose.story.unshift(...untitled);
	}
	const fields = (input.notesFields ?? []).filter((field) => field.value.trim() !== '');
	const chapters: DiscChapter[] = CHAPTER_KEYS.map((key) => ({
		key,
		label: CHAPTER_LABELS[key],
		mode: chapterMode(key),
		sections: key === 'record' || key === 'story' ? prose[key] : [],
		fields: key === 'notes' ? [...fields] : [],
	}));
	return chapters.filter((chapter) => (chapter.key === 'map' ? input.hasMap : hasChapterBody(chapter)));
}

export type NotesFieldSource = {
	artist: string;
	composer: string;
	work: string;
	label: string;
	catalogNumber: string;
	recording: string;
	condition: string;
	eq: string;
	status: string;
	matrix?: string | null;
	pressing?: string | null;
	year?: number | string;
};

/**
 * 资料章的字段表：与页面 `<dl class="props" aria-label="著录">` 同一套顺序与条件，
 * 一处定义、两处渲染（桌面 dl 与窄屏资料章），空值直接不出。
 */
export function discNotesFields(
	source: NotesFieldSource,
	options: { showMatrix: boolean; showPressing: boolean },
): DiscChapterField[] {
	const fields: DiscChapterField[] = [
		{ term: '艺人', value: source.artist },
		{ term: '作曲家', value: source.composer },
		{ term: '作品', value: source.work },
		{ term: '厂牌', value: source.label },
		{ term: '目录号', value: source.catalogNumber },
	];
	if (options.showMatrix && source.matrix) fields.push({ term: '内圈刻字', value: source.matrix });
	if (options.showPressing && source.pressing) fields.push({ term: '压片', value: source.pressing });
	fields.push(
		{ term: '录音', value: source.recording },
		{ term: '品相', value: source.condition },
		{ term: '均衡', value: source.eq },
		{ term: '状态', value: source.status },
	);
	if (source.year !== undefined && source.year !== '') {
		fields.push({ term: '年份', value: String(source.year) });
	}
	return fields
		.map((field) => ({ term: field.term, value: String(field.value ?? '').trim() }))
		.filter((field) => field.value !== '');
}

/** 章级跟翻：正文三章之间一步一章，地图章不吃这个手势。 */
export type ChapterStepKind = 'chapter' | 'edge' | 'map';

export type ChapterStep = {
	index: number;
	moved: boolean;
	kind: ChapterStepKind;
};

export function stepChapter(input: {
	chapters: readonly DiscChapter[];
	index: number;
	dir: 1 | -1;
}): ChapterStep {
	const { chapters, dir } = input;
	if (chapters.length === 0) return { index: 0, moved: false, kind: 'edge' };
	const index = Math.min(Math.max(input.index, 0), chapters.length - 1);
	if (chapters[index]?.key === 'map') return { index, moved: false, kind: 'map' };
	const next = index + dir;
	if (next < 0 || next >= chapters.length) return { index, moved: false, kind: 'edge' };
	return { index: next, moved: true, kind: 'chapter' };
}

export type MapViewMode = 'guide' | 'explore' | 'chrono';

/**
 * 章内竖滑归谁：正文三章归章节壳（长滚），地图章归 traj。
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

/**
 * 唱片章的多面：正背／标签／插页都进章，不再只渲第一面。
 * 面无说明时的通用名；有导出说明就用说明的首段，不造假文案。
 */
export const COVER_PART_LABELS: Readonly<Record<string, string>> = {
	cover: '封面',
	back: '封底',
	label: '标签',
	insert: '插页',
};

export type CoverSideInput = {
	part: string;
	/** 导出说明原文（`封套正面 · ①–⑤`）。 */
	caption?: string;
	/** 已解析的面别（`d1-s2`），没有就是空串。 */
	face?: string;
};

export type CoverSide = CoverSideInput & {
	index: number;
	label: string;
	caption: string;
	face: string;
};

/** 切面按钮文案：说明首段 → part 通用名 → 面别 → `面 N`。 */
export function coverSideLabel(input: CoverSideInput, index = 0): string {
	const head = (input.caption ?? '').split('·')[0]?.trim() ?? '';
	if (head !== '') return head;
	const part = COVER_PART_LABELS[input.part];
	if (part !== undefined) return part;
	if (input.face !== undefined && input.face !== '') return input.face;
	return `面 ${index + 1}`;
}

/** 章内切面的顺序表：与导出／版面里的 details 同序，第一面当默认面。 */
export function coverSides(details: readonly CoverSideInput[]): CoverSide[] {
	return details.map((detail, index) => {
		const face = detail.face ?? '';
		const caption = (detail.caption ?? '').trim();
		return {
			index,
			part: detail.part,
			face,
			caption,
			label: coverSideLabel({ part: detail.part, caption, face }, index),
		};
	});
}

/** 章内有几面：一面不出切面控件（不摆空控件）。 */
export function needsCoverSides(details: readonly unknown[]): boolean {
	return details.length > 1;
}

/**
 * 窄屏唱片章：编辑物证——大图＋框选肘线（`marks`）就是这一章的内容，
 * 不在封面下面再接一段 `## 唱片` 的物述长滚，也不摆说明段。
 * `buildDiscChapters` 仍解析 `## 唱片`（数据保真），只是界面不画。
 */
export function recordChapterIsMarksOnly(): boolean {
	return true;
}

/**
 * 唱片章要不要在封面下面渲 `sections` 物述：marks-only → 永远 false。
 * 将来若改回封面下长文，关掉 `recordChapterIsMarksOnly()` 即可，不必改模板。
 */
export function recordChapterRendersProse(_chapter?: { sections?: readonly unknown[] }): boolean {
	if (recordChapterIsMarksOnly()) return false;
	return (_chapter?.sections?.length ?? 0) > 0;
}

/** 框选肘线注文的最小间隙：占封套高度，同侧两条注文不叠字。 */
export const RECORD_MARK_GAP = 0.1;

export type RecordMarkSeat = {
	/** 注文贴哪一侧：与框的引出方向同侧。 */
	side: 'left' | 'right';
	/** 注文中心在封套坐标系里的 y（肘线终点、百分比落位都由它来）。 */
	center: number;
};

/**
 * 唱片章框选肘线的落位：注文按侧分列、按框的锚点上下排开。
 *
 * 封面按比例缩放，所以这里只在封套坐标系里算（与 SVG `viewBox` 同一套数），
 * 模板再把 `center` 换成百分比贴到图上。返回顺序与 `marks` 一致。
 */
export function seatRecordMarks(
	marks: readonly {
		side: 'auto' | 'left' | 'right';
		x: number;
		y: number;
		w: number;
		h: number;
	}[],
	plateWidth: number,
	plateHeight: number,
): RecordMarkSeat[] {
	const seats = marks.map((mark) => ({
		side: mark.side === 'left' ? ('left' as const) : mark.side === 'right' ? ('right' as const) : autoSide(mark, plateWidth),
		center: mark.y + mark.h / 2,
	}));
	if (plateHeight <= 0) return seats;
	const gap = plateHeight * RECORD_MARK_GAP;
	const floor = gap / 2;
	const ceiling = plateHeight - gap / 2;
	for (const side of ['left', 'right'] as const) {
		const group = seats
			.map((seat, listIndex) => ({ seat, listIndex }))
			.filter((entry) => entry.seat.side === side)
			.sort((a, b) => a.seat.center - b.seat.center || a.listIndex - b.listIndex);
		let previous = Number.NEGATIVE_INFINITY;
		for (const entry of group) {
			let center = Math.min(ceiling, Math.max(floor, entry.seat.center));
			if (center < previous + gap) center = previous + gap;
			entry.seat.center = center;
			previous = center;
		}
		// 挤到框底就整列上提，间隙保持不变。
		const overflow = previous - ceiling;
		if (overflow > 0) {
			for (const entry of group) entry.seat.center -= overflow;
			previous = Number.NEGATIVE_INFINITY;
			for (const entry of group) {
				const center = Math.max(floor, entry.seat.center);
				entry.seat.center = center;
				previous = center;
			}
		}
	}
	return seats;
}

/** `auto` 让给空得多的那半边；一样宽就给右（与 reveal 的 `resolvedSide` 同口径）。 */
function autoSide(mark: { x: number; w: number }, plateWidth: number): 'left' | 'right' {
	const left = mark.x;
	const right = plateWidth - (mark.x + mark.w);
	if (Math.abs(left - right) <= 1) return 'right';
	return left > right ? 'left' : 'right';
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
