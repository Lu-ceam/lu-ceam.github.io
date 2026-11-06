import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const read = (rel: string) => readFileSync(join(here, rel), 'utf8');

const notes = read('../pages/notes.astro');
const header = read('../components/Header.astro');
const about = read('../pages/about.astro');
const config = read('../config.ts');

describe('/notes/ 软着陆契约', () => {
	it('notes.astro 存在且用 Base 三 prop', () => {
		assert.match(notes, /title="笔记"/);
		assert.match(notes, /description="笔记区还在规划。"/);
		assert.match(notes, /robots="noindex"/);
		assert.match(notes, /import Base from '\.\.\/layouts\/Base\.astro'/);
	});

	it('正文锁定句与三链', () => {
		assert.match(notes, /<h1>笔记<\/h1>/);
		assert.match(notes, /笔记区还在规划，导航里暂不挂出。/);
		assert.match(notes, /先看文章与唱片；有笔记后再开放入口。/);
		assert.match(notes, /<a href="\/">返回首页<\/a>/);
		assert.match(notes, /<a href="\/about\/">关于<\/a>/);
		assert.match(notes, /<a href="\/blog\/">文章<\/a>/);
		assert.equal(notes.includes('页面不存在'), false);
		assert.equal(notes.includes('没有找到这个地址'), false);
	});

	it('Header 仍无「笔记」导航项', () => {
		// labels in links array / anchors
		assert.equal(/\b笔记\b/.test(header) && /href:\s*['"]\/notes/.test(header), false);
		assert.equal(/href:\s*['"]\/notes\/?['"]/.test(header), false);
		assert.match(header, /首页/);
		assert.match(header, /关于/);
	});

	it('门面文案文件本票未改（#180 契约仍在）', () => {
		assert.match(config, /写一点读过的、听过的；把藏的黑胶整理上架。/);
		assert.match(about, /笔记区还在规划，导航里暂不挂出。/);
	});
});
