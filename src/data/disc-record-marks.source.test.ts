import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const astro = readFileSync(join(here, '../pages/records/[id].astro'), 'utf8');
const template = astro.slice(0, astro.indexOf('<script>'));
const css = readFileSync(join(here, '../styles/global.css'), 'utf8');

/** 唱片章那一支（封面＋切面），到述语章的 kicker 为止。 */
const coverBlock = template.slice(
	template.indexOf("chapter.mode === 'cover-scroll'"),
	template.indexOf("chapter.mode === 'scroll' &&"),
);
/** 章节壳那一块（四个 pane 到顶栏之前的底栏）。 */
const shellBlock = template.slice(
	template.indexOf('data-disc-chapters'),
	template.indexOf('data-chapter-goto={chapterIndex}'),
);

describe('唱片章＝大图＋框选肘线（marks-only）', () => {
	it('renders the record pane as cover + elbow callouts, not as text blocks', () => {
		assert.ok(coverBlock.length > 0, '唱片章分支没找到');
		// 大图：沿用壳修的多面／缩放钩子。
		assert.ok(coverBlock.includes('data-cover-frame'));
		assert.ok(coverBlock.includes('data-cover-img'));
		assert.ok(coverBlock.includes('data-cover-side={side.index}'));
		// 框选肘线：与先盘 reveal 同一套语法（框＋编号＋肘线），不是 Markdown 长文。
		assert.ok(coverBlock.includes('plate-overlay'));
		assert.ok(coverBlock.includes('mark-box'));
		assert.ok(coverBlock.includes('mark-num'));
		assert.ok(coverBlock.includes('mark-leader'));
		assert.ok(coverBlock.includes('seatRecordMarks('));
		assert.ok(coverBlock.includes('recordElbowPoints('));
		assert.ok(coverBlock.includes('disc-record-marks'));
		// 注文落位写成百分比，跟着封面一起缩放（不换成封面下方长列表）。
		assert.match(coverBlock, /--mark-top:/);
		assert.ok(astro.includes('function recordElbowPoints('));
	});

	it('never paints `## 唱片` prose or a description block under the cover', () => {
		// 闸门：marks-only 时唱片章的 `sections` 一段都不画。
		const gate = "const paintsProse = chapter.mode !== 'cover-scroll' || recordChapterRendersProse(chapter);";
		assert.ok(template.includes(gate), '唱片章没有走 recordChapterRendersProse 闸门');
		assert.ok(shellBlock.includes('{paintsProse && ('));
		assert.ok(shellBlock.includes('data-chapter-prose'));
		const gateAt = template.indexOf(gate);
		const sectionsAt = template.indexOf('chapter.sections.map(');
		assert.ok(gateAt >= 0 && gateAt < sectionsAt, '物述段在闸门之外');
		// 唱片章分支里不再有物述段落或描述块。
		assert.equal(coverBlock.includes('disc-chapter-text'), false, '唱片章还在画物述段');
		assert.equal(coverBlock.includes('data-chapter-prose'), false, '唱片章还在画描述块');
		assert.equal(coverBlock.includes('chapter.sections'), false, '唱片章还在画 `## 唱片`');
	});

	it('keeps the chapter marks overlay and its notes off every other chapter', () => {
		const withoutCover = template.replace(coverBlock, '');
		assert.equal(withoutCover.includes('disc-record-marks'), false, '注文层漏出了唱片章');
		assert.equal(withoutCover.includes('disc-record-overlay'), false, '框选层漏出了唱片章');

	});
});

describe('窄屏进页直达唱片章', () => {
	it('lets the chapter shell own the narrow entry, not the runway', () => {
		assert.ok(
			astro.includes('function chapterShellOwnsEntry(page: HTMLElement): boolean'),
			'窄屏进页没有「章节壳接手」判定',
		);
		assert.ok(astro.includes('if (chapterShellOwnsEntry(page)) enterSettledReading();'));
		assert.ok(astro.includes("page.querySelector('[data-disc-chapters]')"));
		assert.ok(astro.includes("page.dataset.phase === 'reading'"));
	});

	it('collapses the independent runway on narrow as soon as the shell exists', () => {
		const narrow = css.slice(css.indexOf('@media (max-width: 47.99rem) {\n\t.record-page--split {'));
		assert.match(
			narrow,
			/\.record-page--split:has\(\[data-disc-chapters\]\) \.camera-runway \{\s*height: 0;/,
			'窄屏还在给独立先盘留流内高度',
		);
	});
});

describe('顶栏去切面字（fill→crop 版）', () => {
	it('paints no cover title and no side chrome at all in the record chapter', () => {
		assert.equal(template.includes('disc-record-cover-title'), false, '作品题条还挂着');
		assert.equal(coverBlock.includes('disc-record-cover-title'), false, '作品题条还挂着');
		assert.equal(template.includes('disc-record-side-face'), false, '切面说明字还印着');
		// 竖滑换面：屏上不留任何切面控件（圆点／三点／字 tab 都作废）。
		assert.equal(template.includes('disc-record-side-dots'), false, '圆点 pager 还在');
		assert.equal(template.includes('disc-record-side-dot'), false, '圆点 pager 还在');
		assert.equal(coverBlock.includes('<button'), false, '唱片章里还有切面按钮');
		assert.equal(/disc-record-side\b[^>]*>\s*\{side\.label\}/.test(coverBlock), false, '切面还在印可见文案');
		// 隐藏状态仍留：`data-cover-side` 只当读数，不上屏。
		assert.ok(coverBlock.includes('data-cover-side={side.index}'));
	});

	it('carries the in-chapter upright-outer → crop-window → plate hooks', () => {
		for (const hook of [
			'data-fill-crop="outer"',
			'data-fill-crop="window"',
			'upright-outer',
			'crop-window',
			'data-cover-upright',
			'data-cover-plate',
			'plate-overlay',
		]) {
			assert.ok(coverBlock.includes(hook), `唱片章缺 ${hook}`);
		}
		// 章内裁剪不靠 `.disc-record-plate` 的整层 scale 冒充。
		assert.equal(/disc-record-plate[^>]*transform:\s*scale/.test(css), false, '还在用 pose scale');
	});
});
