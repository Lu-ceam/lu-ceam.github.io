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

/**
 * 触屏竖滑的手势判读（一次手势，`dy` 上推为正：上推＝往下读＝`dir 1`）。
 *
 * - `vertical`：过了 `slop` 且比横向位移大——只有这时才谈得上「这是竖滑」。
 * - `follow`：已经靠在文头／文末，且方向朝外——这一下该跟翻邻章，
 *   而不是让文章先橡皮筋弹一下。
 */
export function readVerticalGesture(input: {
	dx: number;
	dy: number;
	slop: number;
	atTop: boolean;
	atBottom: boolean;
}): { vertical: boolean; dir: 1 | -1; follow: boolean } {
	const vertical = Math.abs(input.dy) > Math.abs(input.dx) && Math.abs(input.dy) >= input.slop;
	const dir: 1 | -1 = input.dy > 0 ? 1 : -1;
	if (!vertical) return { vertical, dir, follow: false };
	return {
		vertical,
		dir,
		follow: scrollFollowThrough({ atTop: input.atTop, atBottom: input.atBottom, dir }),
	};
}

/**
 * 切章前的 `scrollTop` 收回合法范围：出章时若还卡在 overscroll 残差里，
 * 进章第一帧会跟着闪一下。内容比框短时只有 0。
 */
export function clampScrollTop(input: {
	scrollTop: number;
	scrollHeight: number;
	clientHeight: number;
}): number {
	const max = Math.max(0, input.scrollHeight - input.clientHeight);
	return Math.min(Math.max(input.scrollTop, 0), max);
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
	/** 著录字段（资料章）：页面已有 `<dl class="props">` 的同一份数据；null／空都不伪造「暂无资料」。 */
	notesFields?: readonly DiscChapterField[] | null;
	/** 版面余文：图像 detail 余文，只留在唱片章的数据里，不替代也不重复述语。 */
	extraRecordParagraphs?: readonly string[];
	/**
	 * 唱片章是否存在：由可展示的 reveal 图像内容判（页面传 `hasReveal`），
	 * 不再看正文长度——无标题正文归述语以后，图像章不能被顺手过滤掉。
	 */
	hasRecordVisuals?: boolean;
	/** 资料章是否只剩出处链接（防御性 fixture：本馆现状 26／26 都有字段）。 */
	hasNotesLinks?: boolean;
};

/**
 * `story` → 章表。`## 唱片` 归唱片，其余叙事章（`## 来龙去脉`／`## 述语`／`## 资料`）
 * 按文序并进述语一篇。**没有命中 alias 的正文不丢**：无 H2 的整篇、文首无标题段、
 * 未识别 H2 下的正文都按原序留在述语；作者自己的 `##` 标题落成章内小题（不猜近义词）。
 * 资料章的正文是字段，不是 Markdown。空章直接不出。
 */
export function buildDiscChapters(input: DiscChaptersInput): DiscChapter[] {
	const record: DiscChapterSection[] = [];
	const story: DiscChapterSection[] = [];
	for (const parsed of parseStorySections(input.story)) {
		// 只有空标题（孤零零一行 `###`／`### 小题` 后没有字）不算正文。
		const blocks = parsed.blocks.filter((section) => section.paragraphs.length > 0);
		if (blocks.length === 0) continue;
		if (parsed.key === 'record') record.push(...blocks);
		else if (parsed.key === 'story') story.push(...blocks);
		else {
			// 未识别作者标题：保留成章内小题，挂在它自己那段正文上；
			// 正文按原序跟在它后面（不猜近义词、也不 unshift 到文首）。
			const mapped = blocks.map((section, position) =>
				position === 0 && section.title === '' && parsed.title !== ''
					? { ...section, title: parsed.title }
					: section,
			);
			story.push(...mapped);
		}
	}
	// 图像 detail 余文仍归唱片章的数据（唱片章 marks-only，界面不画），不进述语。
	if (input.extraRecordParagraphs?.length) {
		record.push({ title: '', paragraphs: [...input.extraRecordParagraphs] });
	}
	const fields = (input.notesFields ?? []).filter((field) => field.value.trim() !== '');
	const chapters: DiscChapter[] = CHAPTER_KEYS.map((key) => ({
		key,
		label: CHAPTER_LABELS[key],
		mode: chapterMode(key),
		sections: key === 'record' ? record : key === 'story' ? story : [],
		fields: key === 'notes' ? [...fields] : [],
	}));
	return chapters.filter((chapter) => chapterPresent(chapter, input));
}

/** 章是否存在：只看真实内容／显式入参，绝不用空章占位。 */
export function chapterPresent(chapter: DiscChapter, input?: Pick<DiscChaptersInput, 'hasMap' | 'hasRecordVisuals' | 'hasNotesLinks'>): boolean {
	switch (chapter.key) {
		case 'map':
			return Boolean(input?.hasMap);
		case 'notes':
			return chapter.fields.length > 0 || Boolean(input?.hasNotesLinks);
		case 'record':
			return input?.hasRecordVisuals ?? chapter.sections.length > 0;
		case 'story':
			// 空标题不算正文：至少要有一段真的字。
			return chapter.sections.some((section) => section.paragraphs.length > 0);
	}
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

/**
 * 跨章交接用的邻章关系：与底栏／面板同一份章表，一步一章、不循环、不越界。
 * 与 `stepChapter` 的区别只有一条——地图章也认这个邻居（跨章交接由壳提交，
 * 不是让地图自己猜方向）。
 */
export function chapterNeighbor(input: {
	chapters: readonly DiscChapter[];
	index: number;
	dir: 1 | -1;
}): ChapterStep {
	const { chapters, dir } = input;
	if (chapters.length === 0) return { index: 0, moved: false, kind: 'edge' };
	const index = Math.min(Math.max(input.index, 0), chapters.length - 1);
	const next = index + dir;
	if (next < 0 || next >= chapters.length) return { index, moved: false, kind: 'edge' };
	return { index: next, moved: true, kind: 'chapter' };
}

/** 该方向是否真有邻章（没有就不 arm 提示、也不提交）。 */
export function hasChapterNeighbor(input: {
	chapters: readonly DiscChapter[];
	index: number;
	dir: 1 | -1;
}): boolean {
	return chapterNeighbor(input).moved;
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

/**
 * 窄屏左纵年轴的最小高（`TrajectoryMap` 里 `.traj-year-axis` 的 `min-height: 11rem`）。
 * 轴高只有这么多，年份一密两串年号就贴在一起（1951 与 1956 只差 0.027 的 t）。
 */
export const YEAR_RAIL_AXIS_MIN_REM = 11;
/** 一个年号占的竖高：圆点 7px ＋ 行间 0.1rem ＋ 11px 字 × 1.1 ＋ 上下 padding 0.1rem×2。 */
const YEAR_RAIL_LABEL_PX = 7 + 0.1 * 16 + 11 * 1.1 + 0.1 * 16 * 2;
/** 两个年号之间至少再留这么多呼吸，免得上一个的字压到下一个的圆点。 */
const YEAR_RAIL_BREATH_PX = 2;
/** `yearRailOffset` 上下各留 6% 内距，可用高只有 88%。 */
const YEAR_RAIL_INNER_RATIO = 0.88;
/** 默认最小间距（0→1 比例）：11rem 轴、16px 根字下算出 ≈ 0.17。 */
export const YEAR_RAIL_MIN_GAP_T =
	(YEAR_RAIL_LABEL_PX + YEAR_RAIL_BREATH_PX) /
	(YEAR_RAIL_INNER_RATIO * YEAR_RAIL_AXIS_MIN_REM * 16);

/**
 * 左纵年轴：年距按真实年份比例，同年保持原序。
 *
 * 密年避让只作用于**打年号的站**：先按真实比例摆，再前推（`t[i] ≥ t[i-1] + minGapT`），
 * 尾部越出 1 就回压，最后再前推一次——与 `railLayout` 的 min-gap 同一套语义：
 * 顺序不变、首尾仍落 [0,1]。同年的第二站不打年号（`label: null`），就留在原比例上，
 * 不参与推拉（否则一根 11rem 轴上的同年对会把整串年号往下顶）。
 * 挤不下的极端情形（年号多到 `(n-1)·minGapT > 1`）就把间距压到刚好能排下。
 */
export function yearRailPins(
	places: readonly { id: string; year: number | null }[],
	opts?: { minGapT?: number },
): YearRailPin[] {
	const known = places.filter((place): place is { id: string; year: number } =>
		typeof place.year === 'number' && Number.isInteger(place.year),
	);
	if (known.length === 0) return [];
	const sorted = known.map((place, index) => ({ place, index }));
	sorted.sort((a, b) => a.place.year - b.place.year || a.index - b.index);
	const min = sorted[0]?.place.year ?? 0;
	const max = sorted[sorted.length - 1]?.place.year ?? min;
	const span = max - min;
	const rows = sorted.map((row, position) => {
		const previous = sorted[position - 1];
		const sameYear = previous !== undefined && previous.place.year === row.place.year;
		return {
			id: row.place.id,
			year: row.place.year,
			t: span <= 0 ? 0.5 : (row.place.year - min) / span,
			label: sameYear ? null : String(row.place.year),
		};
	});

	const requested = opts?.minGapT ?? YEAR_RAIL_MIN_GAP_T;
	const gap = Math.max(0, Math.min(1, Number.isFinite(requested) ? requested : 0));
	const labeled = rows.filter((row) => row.label !== null);
	const room = labeled.length > 1 ? 1 / (labeled.length - 1) : 1;
	const step = Math.min(gap, room);
	if (step > 0 && labeled.length > 1) {
		for (let i = 1; i < labeled.length; i += 1) {
			labeled[i]!.t = Math.max(labeled[i]!.t, labeled[i - 1]!.t + step);
		}
		const last = labeled[labeled.length - 1]!;
		if (last.t > 1) {
			last.t = 1;
			for (let i = labeled.length - 2; i >= 0; i -= 1) {
				labeled[i]!.t = Math.min(labeled[i]!.t, labeled[i + 1]!.t - step);
			}
			labeled[0]!.t = Math.max(0, labeled[0]!.t);
			for (let i = 1; i < labeled.length; i += 1) {
				labeled[i]!.t = Math.max(labeled[i]!.t, labeled[i - 1]!.t + step);
			}
		}
	}

	return rows.map((row) => ({ ...row, t: Math.max(0, Math.min(1, row.t)) }));
}

/** 纵轴钉的百分比位置：`top` 与 `bottom` 各留一点内距，年距仍是线性的。 */
export function yearRailOffset(pin: YearRailPin, padRatio = 0.06): string {
	const t = Math.min(1, Math.max(0, pin.t));
	const ratio = padRatio + (1 - 2 * padRatio) * t;
	return `${(ratio * 100).toFixed(3)}%`;
}
