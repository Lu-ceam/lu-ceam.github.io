import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const astro = readFileSync(join(here, '../pages/records/[id].astro'), 'utf8');
const template = astro.slice(0, astro.indexOf('<script>'));
const css = readFileSync(join(here, '../styles/global.css'), 'utf8');
const map = readFileSync(join(here, '../components/TrajectoryMap.astro'), 'utf8');
const client = readFileSync(join(here, '../components/trajectory-map-client.ts'), 'utf8');

describe('碟页章节壳接线', () => {
	it('renders four bar slots and one pane per chapter, map pane empty', () => {
		assert.ok(template.includes('data-disc-chapters'));
		assert.ok(template.includes('data-chapters-stage'));
		assert.ok(template.includes('data-chapter-kind={chapter.key}'));
		assert.ok(template.includes('data-chapter-map'));
		assert.ok(template.includes('data-chapter-goto={chapterIndex}'));
		assert.ok(template.includes('data-beat-track'));
		// 一拍一屏：轨道只做 translateY，不挂 scroll
		assert.ok(!template.includes('data-beat-track-scroll'));
	});

	it('settles straight into 唱片 beat 1 and leaves the thumb for 序幕', () => {
		assert.ok(astro.includes('mountChapterReader'));
		assert.ok(astro.includes("page.dataset.phase === 'reading'"));
		assert.ok(astro.includes(".split-imagery')?.click()"));
		const reader = readFileSync(join(here, './disc-chapter-reader.ts'), 'utf8');
		assert.ok(reader.includes('index = 0;\n\t\t\tbeat = 0;'));
	});

	it('mounts the year rail for the embedded map only', () => {
		assert.ok(map.includes('data-traj-year-rail'));
		assert.ok(map.includes("mode === 'embed' && yearPins.length > 0"));
		assert.ok(map.includes('yearRailOffset(pin)'));
	});

	it('hands the map its own gesture lifecycle', () => {
		assert.ok(client.includes("root.dataset.trajView = viewMode"));
		for (const event of ['traj:show', 'traj:pause', 'traj:guide']) {
			assert.ok(client.includes(`'${event}'`), `${event} 没有接线`);
		}
		assert.ok(client.includes('mapSteppingStations(viewMode)'));
		const reader = readFileSync(join(here, './disc-chapter-reader.ts'), 'utf8');
		assert.ok(reader.includes("new Event('traj:show')"));
		assert.ok(reader.includes("new Event('traj:pause')"));
		assert.ok(reader.includes("new Event('traj:guide')"));
		// 离章／宽屏化：地图必须装回原位置，桌面路径不能被带走
		assert.ok(reader.includes('parkMap'));
	});

	it('restores the guide from anywhere outside the map frame, top bar included', () => {
		const reader = readFileSync(join(here, './disc-chapter-reader.ts'), 'utf8');
		// 顶栏／底栏／旁白都在框外，所以监听在 document 上而不是 stage 上
		assert.ok(reader.includes("document.addEventListener('pointerdown', guideIfOutsideFrame, true)"));
		// 框内（地图、左纵轴、控件、站表）不算框外，探索不会被自己打断
		for (const keep of ['.traj-map', '.traj-year-rail', '.traj-controls', '.traj-stops']) {
			assert.ok(reader.includes(keep), `${keep} 不在框内白名单`);
		}
	});

	it('keeps the narrow shell out of the desktop path', () => {
		assert.ok(css.includes('--disc-chapter-rail-h: 48px;'));
		assert.ok(css.includes('--disc-year-rail-w: 44px;'));
		assert.ok(css.includes('--disc-beat-pad-x: 1rem;'));
		const desktop = css.slice(css.indexOf('@media (min-width: 48rem) {\n\t.disc-chapters'));
		assert.ok(desktop.startsWith('@media (min-width: 48rem) {\n\t.disc-chapters {\n\t\tdisplay: none !important;'));
		const narrow = css.slice(css.indexOf('@media (max-width: 47.99rem) {\n\t/* 收妥后章节壳才出现'));
		assert.ok(narrow.includes('.disc-chapters:not([hidden])'));
		// 窄屏：图下横轴让位给左纵年轴
		assert.ok(narrow.includes('.disc-chapters-on'));
		assert.ok(map.includes('.traj .traj-rail {\n\t\t\tdisplay: none;'));
	});
});
