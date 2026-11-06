import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
	DISC_SETTLED_BACK_PX,
	DISC_SETTLED_COVER_MIN_PX,
	DISC_SETTLED_H_PX,
	DISC_SETTLED_PAD_Y_PX,
	SETTLED_COLLAPSE_T,
	THUMB_HEIGHT_PX,
	settledBarHeightPx,
	settledBarOn,
	settledCoverBoxPx,
	settledCoverSlotPx,
} from './split-stage.ts';

const here = dirname(fileURLToPath(import.meta.url));
const astro = readFileSync(join(here, '../pages/records/[id].astro'), 'utf8');
const css = readFileSync(join(here, '../styles/global.css'), 'utf8');
const template = astro.slice(0, astro.indexOf('<script>'));

/** The narrow block that owns the settled bar. */
function narrowReadingCss(): string {
	const start = css.indexOf(".record-page--split[data-phase='reading'] .camera-runway");
	assert.ok(start > 0, 'the settled bar is not wired in global.css');
	return css.slice(start, css.indexOf('@media (max-width: 47.99rem) {\n\t.record-page--split .split-frame[data-callouts'));
}

describe('settled bar threshold', () => {
	it('snaps the bar in whole once the thumb has finished shrinking', () => {
		assert.equal(settledBarOn(0, 0), false);
		assert.equal(settledBarOn(0.4, 0.4), false);
		assert.equal(settledBarOn(SETTLED_COLLAPSE_T - 1e-6, 0), false);
		assert.equal(settledBarOn(SETTLED_COLLAPSE_T, 0), true);
		assert.equal(settledBarOn(1, 1), true);
		assert.equal(settledBarOn(0, SETTLED_COLLAPSE_T), true);
		// Never a chip drifting over half a screen: the switch is a threshold, not a lerp.
		assert.ok(SETTLED_COLLAPSE_T > 0.5 && SETTLED_COLLAPSE_T < 1);
	});

	it('keeps the bar at the fixed 44px token and never grows for long content', () => {
		assert.equal(DISC_SETTLED_H_PX, 44);
		assert.equal(DISC_SETTLED_PAD_Y_PX, 3);
		// 普通窄屏壳：入参一律忽略，长题／高封面都不得把它顶回 88/100。
		assert.equal(settledBarHeightPx(0), DISC_SETTLED_H_PX);
		assert.equal(settledBarHeightPx(Number.NaN), DISC_SETTLED_H_PX);
		assert.equal(settledBarHeightPx(38, 28, DISC_SETTLED_PAD_Y_PX), DISC_SETTLED_H_PX);
		assert.equal(settledBarHeightPx(102.5), DISC_SETTLED_H_PX);
		assert.equal(settledBarHeightPx(999, 120, 8), DISC_SETTLED_H_PX);
		// 大字／text-only zoom 是四章共用的唯一例外，不是长题／地图的暗门。
		const large = settledBarHeightPx(78, 28, DISC_SETTLED_PAD_Y_PX, { largeText: true });
		assert.ok(large > DISC_SETTLED_H_PX);
		assert.equal(settledBarHeightPx(78, 28, DISC_SETTLED_PAD_Y_PX, { largeText: true }), large);
	});

	it('contains the plate in the fixed 28px slot instead of a viewport-sized band', () => {
		assert.equal(DISC_SETTLED_COVER_MIN_PX, 28);
		for (const vw of [320, 375, 390, 430, 640]) {
			assert.equal(settledCoverSlotPx(vw), 28);
		}
		// FALP 381 wide plate (aspect ≈ 3.23): full slot width, shorter height.
		const wide = settledCoverBoxPx(470, 146, 375);
		assert.equal(Math.round(wide.w), 28);
		assert.ok(wide.h > 0 && wide.h < 28);
		// Square plate: 28×28 exactly.
		assert.deepEqual(settledCoverBoxPx(300, 300, 375), { w: 28, h: 28 });
		// Portrait plate: full slot height, narrower width.
		const portrait = settledCoverBoxPx(300, 400, 375);
		assert.ok(portrait.w < 28 && portrait.w > 0);
		assert.equal(Math.round(portrait.h), 28);
	});

	it('keeps the title column right of the cover and clear of the 44px back hit', () => {
		const gap = 8;
		const toggle = 44;
		const plates = [
			['FALP 381', 470, 146],
			['MAR 572', 300, 300],
		] as const;
		for (const vw of [375, 320]) {
			for (const [label, naturalW, naturalH] of plates) {
				const box = settledCoverBoxPx(naturalW, naturalH, vw);
				assert.ok(box.w <= DISC_SETTLED_COVER_MIN_PX + 0.01, `${label} @ ${vw}: cover wider than slot`);
				const coverRight = DISC_SETTLED_BACK_PX + (28 - box.w) / 2 + box.w;
				const textLeft = DISC_SETTLED_BACK_PX + 28 + gap;
				// 题槽不得压到小图，也不得挤掉返回／下展。
				assert.ok(textLeft >= coverRight + 0.5, `${label} @ ${vw}: title over the cover`);
				assert.ok(vw - textLeft - toggle >= 120, `${label} @ ${vw}: text column too thin`);
				// 一条 44px 的栏把 38px 两行盒＋上下 3px 装下，封面居中且不顶边。
				const barH = settledBarHeightPx(38, box.h, DISC_SETTLED_PAD_Y_PX);
				assert.equal(barH, DISC_SETTLED_H_PX);
				assert.ok(box.h + 2 * DISC_SETTLED_PAD_Y_PX <= barH);
			}
		}
	});
});

describe('settled bar css', () => {
	it('collapses the runway flow height and hangs the column right under the 44px bar', () => {
		const block = narrowReadingCss();
		// The fixed bar is out of flow: the column pays for it with an equal padding-top (+ safe top).
		assert.match(block, /\[data-phase='reading'\] \.camera-runway \{\s*height: 0;/);
		assert.match(
			block,
			/\[data-phase='reading'\] \.split-read \{\s*margin-top: 0;\s*padding-top: calc\(var\(--disc-settled-h\) \+ env\(safe-area-inset-top, 0px\)\);/,
		);
		assert.match(
			block,
			/\[data-phase='reading'\] \.split-imagery \{[^}]*height: calc\(var\(--disc-settled-h\)/s,
		);
		// token 与 JS 常量同值：44px 真几何，四章一套。
		assert.match(css, /--disc-settled-h: 44px/);
		assert.match(css, /--disc-settled-title: 14px/);
		assert.match(css, /--disc-settled-meta: 12px/);
		assert.match(css, /--disc-settled-cover-w: 28px/);
		assert.match(css, /--disc-settled-pad-y: 3px/);
		assert.match(css, /--disc-settled-gap: 0\.5rem/);
		// The old thumb-sized pad left the runways gap in place.
		assert.equal(css.includes('padding-top: var(--thumb-h)'), false);
	});

	it('draws one single-line title stack inside the bar with real 44px hits', () => {
		const block = narrowReadingCss();
		// Four fixed columns: back hit, mini cover, title stack, chevron slot.
		assert.match(block, /\.split-settled-bar \{[^}]*display: grid;/s);
		assert.match(
			block,
			/\.split-settled-bar \{[^}]*grid-template-columns:\s*\n?\s*var\(--disc-settled-back-w\) var\(--disc-settled-cover-w\)/s,
		);
		assert.match(block, /\.split-settled-bar \{[^}]*minmax\(0, 1fr\)/s);
		assert.match(block, /\.split-settled-bar \{[^}]*align-items: center;/s);
		assert.match(block, /\.split-settled-bar \{[^}]*grid-area: 1 \/ 1;/s);
		// 返回：真实 44×44 盒。
		const back = block.slice(block.indexOf('.split-settled-back {'), block.indexOf('.split-settled-toggle {'));
		assert.match(back, /width: var\(--disc-settled-back-w\);/);
		assert.match(back, /height: var\(--disc-settled-h\);/);
		// 信息热区＝题槽＋下展：一个 button、44 高、覆盖到右缘。
		const identity = block.slice(
			block.indexOf('.split-settled-identity {'),
			block.indexOf('.split-settled-bar .record-tombstone {'),
		);
		assert.match(identity, /height: var\(--disc-settled-h\);/);
		assert.match(identity, /right: 0;/);
		assert.match(identity, /left: calc\(/);
		// 单行 ellipsis，无 clamp2、无纵向裁切。
		const title = block.slice(
			block.indexOf('.split-settled-bar .record-tombstone h1 {'),
			block.indexOf('.split-settled-bar .record-tombstone-meta {'),
		);
		assert.match(title, /white-space: nowrap;/);
		assert.match(title, /text-overflow: ellipsis;/);
		assert.match(title, /overflow: hidden;/);
		assert.match(title, /line-height: 20px;/);
		assert.doesNotMatch(title, /line-clamp/);
		const meta = block.slice(
			block.indexOf('.split-settled-bar .record-tombstone-meta {'),
			block.indexOf(".split-frame:not([data-part='cover'])"),
		);
		assert.match(meta, /white-space: nowrap;/);
		assert.match(meta, /text-overflow: ellipsis;/);
		assert.match(meta, /line-height: 18px;/);
		assert.match(meta, /color: var\(--muted\);/);
		assert.doesNotMatch(meta, /line-clamp/);
		assert.doesNotMatch(meta, /display: none/);
		// No negative-margin hang and no sticky escape out of the images' stacking.
		assert.equal(css.includes('calc(-1 * var(--disc-settled-h))'), false);
		assert.equal(block.includes('position: sticky'), false);
		assert.equal(block.includes('.split-read .record-tombstone'), false);
		// 完整信息层：同一张纸，无圆角／无投影卡片感，关闭 44×44。
		const dialog = css.slice(css.indexOf('.record-identity {'), css.indexOf('.record-identity::backdrop'));
		assert.match(dialog, /border-radius: 0;/);
		assert.match(dialog, /box-shadow: none;/);
		assert.match(dialog, /max-height: calc\(100svh - 32px\);/);
		const close = css.slice(css.indexOf('.record-identity-close {'), css.indexOf('.record-identity-body {'));
		assert.match(close, /width: 44px;/);
		assert.match(close, /height: 44px;/);
	});

	it('keeps exactly one heading and moves it into the bar slot', () => {
		// One visible title in the split stage — no clone, no aria-hidden copy, no second header.
		const splitStage = template.slice(template.indexOf('<div class="split-stage">'));
		assert.equal(splitStage.match(/<h1>/g)?.length, 1);
		assert.equal(splitStage.match(/class="record-tombstone"/g)?.length, 1);
		// The slot lives inside the fixed imagery, so the title paints on the bar itself.
		const imagery = splitStage.slice(splitStage.indexOf('<div class="split-imagery">'));
		const slot = imagery.indexOf('<div class="split-settled-bar">');
		assert.ok(slot > 0, 'the bar slot is missing from .split-imagery');
		assert.ok(slot < imagery.indexOf('<div class="split-read">'));
		// Script: the tombstone moves in on settle and comes back to the track on exit.
		assert.match(astro, /settledSlot\.append\(settledBar\)/);
		assert.match(astro, /settledHome\.prepend\(settledBar\)/);
		assert.match(astro, /const settledHome = settledBar\?\.parentElement \?\? null;/);
	});

	it('leaves the desktop two-column stage alone', () => {
		const desktop = css.slice(css.indexOf('@media (min-width: 48rem) {\n\t.record-page--split .split-stage'));
		const body = desktop.slice(0, desktop.indexOf('@media', 10));
		assert.doesNotMatch(body, /disc-settled/);
		assert.match(body, /\.split-imagery \{\s*height: 100svh;/);
		// P2-A：桌面唱片柱不再用裸 100vh。
		assert.match(css, /\.record-object \{[^}]*max-height: calc\(100svh - 2rem\);/s);
		assert.doesNotMatch(css, /\.record-object \{[^}]*max-height: calc\(100vh - 2rem\);/s);
	});
});

describe('settled bar wiring', () => {
	it('enters and leaves the bar from the collapse threshold and the mini cover', () => {
		assert.match(astro, /settledBarOn\(cv\.thumbT, place\.collapse\)/);
		assert.match(astro, /const enterSettledReading = \(\): void => \{/);
		assert.match(astro, /const exitSettledReading = \(\): void => \{/);
		assert.match(astro, /window\.scrollY < settledTopPx - SETTLED_EXIT_PX/);
		const click = astro.slice(astro.indexOf("page.querySelector('.split-imagery')?.addEventListener('click'"));
		assert.ok(click.indexOf('exitSettledReading()') < click.indexOf('runwayScrollY('));
		// 点返回／完整信息不是「点小图」，不得顺带退出壳。
		assert.match(click, /split-settled-back, \.split-settled-identity/);
		// Re-scanning the disc must not reuse a pose measured inside the settled bar.
		const exit = astro.slice(astro.indexOf('const exitSettledReading'), astro.indexOf('const resyncSettledBar'));
		assert.match(exit, /poseKey\.delete\(frame\)/);
		assert.match(exit, /removeProperty\('--disc-settled-h'\)/);
	});

	it('centers the cover in the bar while reading instead of re-placing it with the shrink height', () => {
		const collapse = astro.slice(astro.indexOf('const applyCollapse'), astro.indexOf('const applyAll'));
		// Placing with `h` (the shrink height) would pin the cover to the top of the bar.
		assert.match(
			collapse,
			/if \(page\.dataset\.phase === 'reading'\) syncSettledBar\(\);\s*else if \(cv\.thumbT > 0\) placeThumbCover\(h, cv\.thumbT\);/,
		);
	});

	it('reads the bar height from the fixed token only, never from the tombstone height', () => {
		const place = astro.slice(astro.indexOf('const placeThumbCover'), astro.indexOf('const applySettledHeight'));
		assert.match(place, /const thumbH = Math\.max\(8, THUMB_HEIGHT_PX - 8\)/);
		assert.match(place, /const slotLeft = DISC_SETTLED_BACK_PX \+/);
		assert.match(place, /const boxW = aloneW \+ \(slot\.w - aloneW\) \* u;/);
		assert.match(place, /plateFrame\.style\.top = `\$\{\(barH - boxH\) \/ 2\}px`/);
		assert.match(place, /matchPlateFrame\(cover\)/);
		const measure = astro.slice(astro.indexOf('const applySettledHeight'), astro.indexOf('const enterSettledReading'));
		// 高度契约不再读 scrollHeight：长内容不得把壳顶回 88/100。
		assert.doesNotMatch(measure, /scrollHeight/);
		assert.match(measure, /settledBarHeightPx\(0, 0, 0\)/);
		assert.match(measure, /const syncSettledBar = \(\): number => \{/);
		assert.match(measure, /placeThumbCover\(barH, 1\)/);
		// Bar height and cover box always come from the same number.
		assert.match(astro, /const barH = applySettledHeight\(\);\s*placeThumbCover\(barH, 1\);/);
		assert.match(astro, /syncSettledBar\(\);/);
		assert.match(astro, /barBox\.observe\(settledBar\)/);
		assert.match(astro, /if \(settledSlot\) barBox\.observe\(settledSlot\)/);
	});

	it('keeps the bar height contract free of chapter-kind branches', () => {
		const stage = readFileSync(join(here, 'split-stage.ts'), 'utf8');
		const fn = stage.slice(stage.indexOf('export function settledBarHeightPx'));
		assert.doesNotMatch(fn, /chapter/i);
		// 同一函数、同一默认路径：四章没有任何入参能让普通壳长高。
		assert.doesNotMatch(astro, /chapter[\w]*\.*(kind|key)[^\n]*settledBarHeightPx/);
	});

	it('opens the identity dialog with focus in, trapped, and restored on close', () => {
		assert.match(astro, /identityDialog\.showModal\(\)/);
		assert.match(astro, /identityButton\.setAttribute\('aria-expanded'/);
		assert.match(astro, /identityButton\.focus\(\)/);
		assert.match(astro, /identityClose\.focus\(\)/);
		// SSR 兜底：无 JS 也能读完整信息。
		assert.match(astro, /<noscript>/);
	});
});
