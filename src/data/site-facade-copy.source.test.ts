import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const read = (rel: string) => readFileSync(join(here, rel), 'utf8');

const config = read('../config.ts');
const about = read('../pages/about.astro');
const index = read('../pages/index.astro');
const testPost = read('../content/blog/typography-test.md');

/** 契约文案：一字不差，含中文标点。 */
const INTRO = '写一点读过的、听过的；把藏的黑胶整理上架。';
const ABOUT_PARAGRAPHS = [
	'Lu-ceam 是我的个人站：一边写文章，一边把黑胶藏品编目上架。',
	'文章偏读后记与听记；唱片区按压片版本整理封面、物述与轨迹。笔记区还在规划，导航里暂不挂出。',
	'站点保持纸色与砖色，少装饰，方便长期往里添东西。',
];
const OLD_INTRO = '这里会放一段简短的自我介绍。目前先占着位置。';
const OLD_ABOUT = '这一页还是占位';

/** config.ts 里某个字符串键的值（单引号字面量）。 */
function configString(source: string, key: string): string {
	const match = source.match(new RegExp(`\\b${key}:\\s*'([^']*)'`));
	return match ? match[1] : '';
}

/** about.astro 里 `<h1>关于</h1>` 之后的 `<p>…</p>` 全文，按出现顺序。 */
function paragraphsAfterHeading(source: string): string[] {
	const at = source.indexOf('<h1>关于</h1>');
	if (at < 0) return [];
	const rest = source.slice(at);
	return [...rest.matchAll(/<p>([\s\S]*?)<\/p>/g)].map((m) => m[1]);
}

/** frontmatter 的 `draft:` 值。 */
function frontmatterDraft(source: string): string {
	const frontmatter = source.slice(source.indexOf('---') + 3, source.indexOf('---', 3));
	const match = frontmatter.match(/^draft:\s*(\S+)/m);
	return match ? match[1] : '';
}

/** 正文小节标题：文章标题行（frontmatter 的 `title:`）。 */
function frontmatterTitle(source: string): string {
	const frontmatter = source.slice(source.indexOf('---') + 3, source.indexOf('---', 3));
	const match = frontmatter.match(/^title:\s*(.+)$/m);
	return match ? match[1].trim() : '';
}

describe('门面文案：首页 intro 契约', () => {
	it('siteConfig.intro 精确等于拍板句', () => {
		assert.equal(configString(config, 'intro'), INTRO);
	});

	it('无旧占位 intro 残留', () => {
		assert.equal(config.includes(OLD_INTRO), false, 'config.ts 仍含旧占位句');
		assert.equal(config.includes('这里会放一段简短的自我介绍'), false);
	});

	it('元数据四键保持：description／title／lang／url', () => {
		assert.equal(configString(config, 'description'), '个人站点，收录文章与唱片收藏。');
		assert.equal(configString(config, 'title'), 'Lu-ceam');
		assert.equal(configString(config, 'lang'), 'zh-CN');
		assert.equal(configString(config, 'url'), 'https://lu-ceam.github.io');
	});

	it('首页仍渲染 .intro 与既有空态文案', () => {
		assert.match(index, /<p class="intro">\{siteConfig\.intro\}<\/p>/);
		assert.match(index, /posts\.length === 0 \? \(\s*<p>还没有文章。<\/p>\s*\)/, '空态文案被改');
	});
});

describe('门面文案：关于页三段契约', () => {
	it('h1 后恰好三段 <p>，顺序与文字精确', () => {
		assert.deepEqual(paragraphsAfterHeading(about), ABOUT_PARAGRAPHS);
	});

	it('无占位句残留', () => {
		assert.equal(about.includes(OLD_ABOUT), false, 'about.astro 仍含占位句');
	});
});

describe('门面文案：测试帖 draft 契约', () => {
	it('文件仍在，frontmatter draft: true，标题未变', () => {
		assert.equal(frontmatterDraft(testPost), 'true');
		assert.equal(frontmatterTitle(testPost), '排版测试（可删除）');
	});

	it('正文未被改写（仍是测试页而非正式文章）', () => {
		assert.match(testPost, /^> \*\*测试页。\*\*/m);
	});

	it('PROD 过滤仍按 draft !== true 生效', () => {
		const posts = read('../lib/posts.ts');
		assert.match(posts, /import\.meta\.env\.PROD \? data\.draft !== true : true/);
	});
});
