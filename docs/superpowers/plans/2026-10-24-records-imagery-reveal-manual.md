# Records imagery reveal and manual 题铭 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Detail figures on `/records/<id>/` can play a display-case crop from a real upright into a clean plate, then show manual 题铭 — and with empty marks or no upright they stay on today's figure.

**Architecture:** `records.json` is the public projection. This repo does not contain `export_site_marks.py`; that script lives in the vinyl-pressing-catalog skill toolchain and may land mhjl329 upright, plate, and marks later. The site ships three modes from the same markup: Reveal (clean plate + upright + transform + at least one mark + a real crop), Plate callouts (marks, no playable crop), and Legacy (`marks: []`, existing WebP, no overlay). Pure rules live in `src/data/detail-display.ts` so the page and the client script share them. `records.ts` only validates. Playback never reads `angleDeg` and never deskews.

**Tech Stack:** Astro 7, Zod 4 (`src/data/records.ts`), plain CSS in `src/styles/global.css`, a bundled page `<script>` (no new dependencies). Node 22 for `node:test`.

## Global Constraints

- Follow `docs/superpowers/specs/2026-10-24-records-imagery-reveal-manual-design.md` (locked, including the librarian's YAML corrections). Do not reintroduce anything in that spec's Rejected list.
- `export_site_marks.py` is not an Astro module and is not added in this PR. Do not commit skill YAML, raw scans, or `*.marked.webp`.
- Do not invent `upright`, `transform`, or mark geometry. Do not upscale a plate into a fake upright. mhjl329 assets may arrive from the librarian separately.
- `marks: []` is Legacy: image, caption, full `text`, no overlay. Do not draw runtime marks on the yellow LPBR 6083 bakes from `daf560b`.
- `upright` and `transform` are both present or both absent. `transform.cropSpace` is the string `upright`. `angleDeg` is a finite JSON number. Playback ignores it.
- Public stroke is `var(--accent)` (`#7c2d22` light, `#f2c9a6` dark). `#FFD400` is not a public color.
- `badge` (`tl` / `tr`) is not the leader direction. `side` is `auto` | `left` | `right`.
- Do not assume every plate is 400px wide. Current plates stay 380–480 wide.
- Do not change story copy, captions, alts, `detailsNote` strings, list covers, the hero, the tombstone, 记述, 著录, or the folds. Do not edit `src/pages/records.astro`.
- The callout circle's class must not be `badge` (that class is the status pill).
- `1rem` = `18px` on this site. Viewport checks use a `16px` initial font.
- `npm run check` and `npm run build` must pass.

## File map

| File | Responsibility |
|---|---|
| `src/data/detail-display.ts` | Mode, text consumption, badge center, side, stack, leader endpoints. No Node imports |
| `src/data/detail-display.test.ts` | `node:test` for those rules |
| `src/data/records.ts` | Schema (`image` → `plate`), refinements, raster asserts, search text |
| `src/data/records.json` | 17 details: `part`, `plate`, `marks: []`, same `caption` / `alt` / `text`. No upright |
| `src/layouts/Base.astro` | `data-motion` in the existing head script |
| `src/pages/records/[id].astro` | Figure markup and the reveal script |
| `src/styles/global.css` | One-column detail grid, plate stage, 题铭 |
| `README.md` | Sample `details[]` object matches spec section 3 |

---

### Task 1: Display rules

**Files:**
- Create: `src/data/detail-display.ts`
- Create: `src/data/detail-display.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `roundHalfAwayFromZero(value: number): number`
  - `expectedPlateHeight(exportWidth: number, crop: { w: number; h: number }): number`
  - `plateHeightMatches(plateHeight: number, exportWidth: number, crop: { w: number; h: number }): boolean`
  - `cropIsProperSubRectangle(crop: Crop, upright: { width: number; height: number }): boolean`
  - `detailMode(detail: DetailLike): 'reveal' | 'callout' | 'legacy'`
  - `notesAligned(detail: { marks: readonly { note?: string }[] }): boolean`
  - `stripCircledIndex(line: string): string`
  - `visibleDetailLines(detail: DetailLike): string[]`
  - `visibleDetailText(detail: DetailLike): string`
  - `showsCircledLine(text: string): boolean`
  - `showDetailsNote(record: { details: readonly DetailLike[] }): boolean`
  - `showMarkLabel(mark: { label?: string; note?: string }): boolean`
  - `paintSide(side: Side): 'left' | 'right'`
  - `resolvedSide(mark: { side: Side; x: number; w: number }, plateWidth: number): 'left' | 'right'`
  - `badgeCenter(mark: { x: number; y: number; w: number; h: number; badge: 'tl' | 'tr' }, plateWidth: number): { cx: number; cy: number; r: number; fontSize: number }`
  - `stackTops(items: readonly StackItem[], plateHeightPx: number, plateCssHeight: number, gapPx: number): number[]`
  - `leaderEndpoints(args: LeaderArgs): { x1: number; y1: number; x2: number; y2: number }`

- [ ] **Step 1: Write the failing test**

Create `src/data/detail-display.test.ts`:

```ts
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
	badgeCenter,
	cropIsProperSubRectangle,
	detailMode,
	expectedPlateHeight,
	leaderEndpoints,
	notesAligned,
	paintSide,
	plateHeightMatches,
	resolvedSide,
	roundHalfAwayFromZero,
	showDetailsNote,
	showMarkLabel,
	stackTops,
	stripCircledIndex,
	visibleDetailText,
} from './detail-display.ts';

const upright = { width: 1000, height: 800 };

describe('rounding and plate height', () => {
	it('rounds halves away from zero', () => {
		assert.equal(roundHalfAwayFromZero(1.5), 2);
		assert.equal(roundHalfAwayFromZero(-1.5), -2);
		assert.equal(roundHalfAwayFromZero(2.2), 2);
	});

	it('expects plate height from exportWidth * crop.h / crop.w', () => {
		assert.equal(expectedPlateHeight(400, { w: 1000, h: 500 }), 200);
		assert.equal(plateHeightMatches(200, 400, { w: 1000, h: 500 }), true);
		assert.equal(plateHeightMatches(201, 400, { w: 2, h: 1 }), true);
		assert.equal(plateHeightMatches(203, 400, { w: 2, h: 1 }), false);
	});
});

describe('detail mode', () => {
	const crop = { x: 40, y: 20, w: 500, h: 400 };
	const marks = [{ side: 'auto' as const, x: 0, y: 0, w: 10, h: 10 }];

	it('is legacy when marks are empty, even with an upright', () => {
		assert.equal(
			detailMode({ marks: [], text: '① a', upright, transform: { crop } }),
			'legacy',
		);
	});

	it('is callout when marks exist and upright is omitted', () => {
		assert.equal(detailMode({ marks, text: '① a' }), 'callout');
	});

	it('is reveal only for a proper sub-rectangle', () => {
		assert.equal(
			detailMode({ marks, text: '① a', upright, transform: { crop } }),
			'reveal',
		);
		assert.equal(cropIsProperSubRectangle({ x: 0, y: 0, w: 1000, h: 800 }, upright), false);
		assert.equal(
			detailMode({
				marks,
				text: '① a',
				upright,
				transform: { crop: { x: 0, y: 0, w: 1000, h: 800 } },
			}),
			'callout',
		);
		assert.equal(cropIsProperSubRectangle({ x: 2, y: 0, w: 1000, h: 800 }, upright), true);
		assert.equal(cropIsProperSubRectangle({ x: 0, y: 0, w: 998, h: 800 }, upright), true);
	});
});

describe('notes and text', () => {
	it('strips one circled index and the spaces after it', () => {
		assert.equal(stripCircledIndex('① GREAT TRACKS 标'), 'GREAT TRACKS 标');
		assert.equal(stripCircledIndex('① ② leftover'), '② leftover');
		assert.equal(stripCircledIndex('内圈刻字（转录）：第 2 面'), '内圈刻字（转录）：第 2 面');
	});

	it('keeps the full text until every mark has a note', () => {
		const detail = {
			text: '① GREAT TRACKS 标\n② MHJL 329',
			marks: [{ side: 'auto' as const, x: 1, y: 1, w: 2, h: 2 }],
		};
		assert.equal(notesAligned(detail), false);
		assert.equal(visibleDetailText(detail), detail.text);
	});

	it('hides circled lines whose body equals a note and keeps transcriptions', () => {
		const detail = {
			text: '① GREAT TRACKS 标\n② MHJL 329\n内圈刻字（转录）：第 1 面 ARL 1854-1A',
			marks: [
				{ side: 'auto' as const, x: 1, y: 1, w: 2, h: 2, note: 'GREAT TRACKS 标' },
				{ side: 'right' as const, x: 1, y: 1, w: 2, h: 2, note: 'MHJL 329' },
			],
		};
		assert.equal(notesAligned(detail), true);
		assert.equal(visibleDetailText(detail), '内圈刻字（转录）：第 1 面 ARL 1854-1A');
		assert.equal(showDetailsNote({ details: [detail] }), false);
	});

	it('keeps detailsNote while any circled line is still visible', () => {
		const open = { text: '① still here', marks: [{ side: 'auto' as const, x: 0, y: 0, w: 1, h: 1 }] };
		const plain = { text: 'one unnumbered sentence', marks: [] as const };
		assert.equal(showDetailsNote({ details: [plain, open] }), true);
	});

	it('shows a label only when it is not the note and not a prefix of the note', () => {
		assert.equal(showMarkLabel({ label: '标', note: 'GREAT TRACKS 标' }), true);
		assert.equal(showMarkLabel({ label: 'GREAT', note: 'GREAT TRACKS 标' }), false);
		assert.equal(showMarkLabel({ label: '目录号', note: '目录号' }), false);
		assert.equal(showMarkLabel({ label: '目录号' }), false);
	});
});

describe('geometry', () => {
	it('paints auto on the right and resolves a tie to the right', () => {
		assert.equal(paintSide('auto'), 'right');
		assert.equal(paintSide('left'), 'left');
		assert.equal(resolvedSide({ side: 'auto', x: 300, w: 50 }, 400), 'left');
		assert.equal(resolvedSide({ side: 'auto', x: 100, w: 50 }, 400), 'right');
		assert.equal(resolvedSide({ side: 'auto', x: 175, w: 50 }, 400), 'right');
		assert.equal(resolvedSide({ side: 'left', x: 10, w: 10 }, 400), 'left');
	});

	it('places the disc on the requested corner, or centers it when it does not fit', () => {
		const wide = badgeCenter({ x: 10, y: 20, w: 200, h: 80, badge: 'tl' }, 400);
		assert.equal(wide.r, 11);
		assert.equal(wide.fontSize, 11);
		assert.equal(wide.cx, 10 + 3 + 11);
		assert.equal(wide.cy, 20 + 3 + 11);
		const tr = badgeCenter({ x: 10, y: 20, w: 200, h: 80, badge: 'tr' }, 400);
		assert.equal(tr.cx, 10 + 200 - 3 - 11);
		const tight = badgeCenter({ x: 0, y: 0, w: 10, h: 10, badge: 'tl' }, 400);
		assert.equal(tight.cx, 5);
		assert.equal(tight.cy, 5);
	});

	it('stacks notes down from the anchor and refuses to sit above the plate', () => {
		const tops = stackTops(
			[
				{ index: 1, anchor: 10, height: 40 },
				{ index: 0, anchor: 30, height: 40 },
			],
			100,
			100,
			8,
		);
		assert.equal(tops[0], 0);
		assert.equal(tops[1], 48);
		const tied = stackTops(
			[
				{ index: 1, anchor: 50, height: 20 },
				{ index: 0, anchor: 50, height: 20 },
			],
			100,
			100,
			8,
		);
		assert.equal(tied[1], 40);
		assert.equal(tied[0], 68);
	});

	it('stops the leader 0.35rem short of the note inner edge', () => {
		const right = leaderEndpoints({
			mark: { x: 10, y: 20, w: 40, h: 10 },
			side: 'right',
			plateRect: { left: 100, top: 50, width: 200, height: 100 },
			plateWidth: 400,
			plateHeight: 200,
			noteRect: { left: 340, right: 400, top: 60, height: 20 },
			shortPx: 7,
		});
		assert.equal(right.x1, 50);
		assert.equal(right.y1, 25);
		assert.equal(right.x2, (340 - 7 - 100) / (200 / 400));
		assert.equal(right.y2, (70 - 50) / (100 / 200));
	});
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --experimental-strip-types --test src/data/detail-display.test.ts`

Expected: FAIL. Node cannot find `./detail-display.ts`.

- [ ] **Step 3: Write the module**

Create `src/data/detail-display.ts`:

```ts
export type Crop = { x: number; y: number; w: number; h: number };

export type Side = 'auto' | 'left' | 'right';

export type MarkLike = {
	side: Side;
	x: number;
	y: number;
	w: number;
	h: number;
	badge?: 'tl' | 'tr';
	label?: string;
	note?: string;
};

export type DetailLike = {
	marks: readonly MarkLike[];
	text: string;
	upright?: { width: number; height: number };
	transform?: { crop: Crop };
};

export type StackItem = {
	index: number;
	anchor: number;
	height: number;
};

export type LeaderArgs = {
	mark: { x: number; y: number; w: number; h: number };
	side: 'left' | 'right';
	plateRect: { left: number; top: number; width: number; height: number };
	plateWidth: number;
	plateHeight: number;
	noteRect: { left: number; right: number; top: number; height: number };
	shortPx: number;
};

const CIRCLED_PREFIX = /^[①-⑳]\s*/u;
const CIRCLED_LINE = /^[①-⑳]/u;

export function roundHalfAwayFromZero(value: number): number {
	if (value >= 0) return Math.round(value);
	return -Math.round(-value);
}

export function expectedPlateHeight(exportWidth: number, crop: { w: number; h: number }): number {
	return roundHalfAwayFromZero((exportWidth * crop.h) / crop.w);
}

export function plateHeightMatches(
	plateHeight: number,
	exportWidth: number,
	crop: { w: number; h: number },
): boolean {
	return Math.abs(plateHeight - expectedPlateHeight(exportWidth, crop)) <= 1;
}

/** At least a 2px inset on one edge. A full-frame upright is not a crop. */
export function cropIsProperSubRectangle(
	crop: Crop,
	upright: { width: number; height: number },
): boolean {
	return (
		crop.x >= 2 ||
		crop.y >= 2 ||
		crop.w <= upright.width - 2 ||
		crop.h <= upright.height - 2
	);
}

export function detailMode(detail: DetailLike): 'reveal' | 'callout' | 'legacy' {
	if (detail.marks.length === 0) return 'legacy';
	if (
		detail.upright &&
		detail.transform &&
		cropIsProperSubRectangle(detail.transform.crop, detail.upright)
	) {
		return 'reveal';
	}
	return 'callout';
}

export function notesAligned(detail: { marks: readonly MarkLike[] }): boolean {
	return detail.marks.length >= 1 && detail.marks.every((mark) => Boolean(mark.note));
}

export function stripCircledIndex(line: string): string {
	return line.replace(CIRCLED_PREFIX, '');
}

export function visibleDetailLines(detail: DetailLike): string[] {
	const lines = detail.text.split('\n');
	if (!notesAligned(detail)) return lines;
	const notes = new Set(
		detail.marks.map((mark) => mark.note).filter((note): note is string => Boolean(note)),
	);
	return lines.filter((line) => !notes.has(stripCircledIndex(line)));
}

export function visibleDetailText(detail: DetailLike): string {
	return visibleDetailLines(detail).join('\n');
}

export function showsCircledLine(text: string): boolean {
	return text.split('\n').some((line) => CIRCLED_LINE.test(line));
}

export function showDetailsNote(record: { details: readonly DetailLike[] }): boolean {
	return record.details.some((detail) => showsCircledLine(visibleDetailText(detail)));
}

export function showMarkLabel(mark: { label?: string; note?: string }): boolean {
	if (!mark.label || !mark.note) return false;
	if (mark.label === mark.note) return false;
	if (mark.note.startsWith(mark.label)) return false;
	return true;
}

/** First paint and no-JS. `auto` stays on the right until the script measures. */
export function paintSide(side: Side): 'left' | 'right' {
	return side === 'left' ? 'left' : 'right';
}

/** Tie within 1px goes right. An explicit side is never flipped. */
export function resolvedSide(
	mark: { side: Side; x: number; w: number },
	plateWidth: number,
): 'left' | 'right' {
	if (mark.side === 'left' || mark.side === 'right') return mark.side;
	const leftSpace = mark.x;
	const rightSpace = plateWidth - (mark.x + mark.w);
	if (Math.abs(leftSpace - rightSpace) <= 1) return 'right';
	return leftSpace > rightSpace ? 'left' : 'right';
}

export function badgeCenter(
	mark: { x: number; y: number; w: number; h: number; badge: 'tl' | 'tr' },
	plateWidth: number,
): { cx: number; cy: number; r: number; fontSize: number } {
	const diameter = (22 * plateWidth) / 400;
	const r = diameter / 2;
	const pad = 3;
	const fontSize = (11 * plateWidth) / 400;
	if (mark.w < diameter + pad || mark.h < diameter + pad) {
		return { cx: mark.x + mark.w / 2, cy: mark.y + mark.h / 2, r, fontSize };
	}
	const cy = mark.y + pad + r;
	const cx = mark.badge === 'tl' ? mark.x + pad + r : mark.x + mark.w - pad - r;
	return { cx, cy, r, fontSize };
}

/**
 * Ideal top centers the note on the anchor. Overlap pushes down until the gap
 * is `gapPx`. Nothing is placed above the plate top. Notes may hang below.
 * Returned tops follow the input order.
 */
export function stackTops(
	items: readonly StackItem[],
	plateHeightPx: number,
	plateCssHeight: number,
	gapPx: number,
): number[] {
	const scale = plateHeightPx === 0 ? 0 : plateCssHeight / plateHeightPx;
	const order = items
		.map((item, listIndex) => ({ item, listIndex }))
		.sort((a, b) => {
			if (a.item.anchor !== b.item.anchor) return a.item.anchor - b.item.anchor;
			return a.item.index - b.item.index;
		});
	const tops = new Array<number>(items.length);
	let prevBottom = Number.NEGATIVE_INFINITY;
	for (const entry of order) {
		const anchorCss = entry.item.anchor * scale;
		let top = anchorCss - entry.item.height / 2;
		if (top < 0) top = 0;
		if (top < prevBottom + gapPx) top = prevBottom + gapPx;
		tops[entry.listIndex] = top;
		prevBottom = top + entry.item.height;
	}
	return tops;
}

export function leaderEndpoints(args: LeaderArgs): { x1: number; y1: number; x2: number; y2: number } {
	const scaleX = args.plateRect.width / args.plateWidth;
	const scaleY = args.plateRect.height / args.plateHeight;
	const y1 = args.mark.y + args.mark.h / 2;
	const x1 = args.side === 'left' ? args.mark.x : args.mark.x + args.mark.w;
	const noteCenterCss = args.noteRect.top + args.noteRect.height / 2;
	const y2 = (noteCenterCss - args.plateRect.top) / scaleY;
	const innerCss = args.side === 'right' ? args.noteRect.left : args.noteRect.right;
	const endCss = args.side === 'right' ? innerCss - args.shortPx : innerCss + args.shortPx;
	const x2 = (endCss - args.plateRect.left) / scaleX;
	return { x1, y1, x2, y2 };
}
```

If `npm run check` later rejects the `.ts` import suffix in the test, add only `src/data/detail-display.test.ts` to the `exclude` array in `tsconfig.json`. Leave the test import as `./detail-display.ts` so Node can run it.

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --experimental-strip-types --test src/data/detail-display.test.ts`

Expected: PASS, all tests.

- [ ] **Step 5: Commit**

```bash
git add src/data/detail-display.ts src/data/detail-display.test.ts
git commit -m "feat(records): display rules for plate 题铭"
```

---

### Task 2: Schema, asserts, search text, and JSON migration

**Files:**
- Modify: `src/data/records.ts`
- Modify: `src/data/records.json`

**Interfaces:**
- Consumes: `expectedPlateHeight` from `src/data/detail-display.ts`
- Produces: `VinylRecord['details'][number]` with `part`, `plate`, optional `upright` + `transform`, `marks`, `caption`, `alt`, `text`. The key `image` on a detail fails the build. Hero `record.image` is unchanged.

- [ ] **Step 1: Replace the image schemas**

In `src/data/records.ts`, change the filesystem import to `import { existsSync, readFileSync } from 'node:fs';` and add:

```ts
import { expectedPlateHeight } from './detail-display';
```

Hero `record.image` keeps its field name. Replace `imageSchema` and `detailSchema` with:

```ts
const plateSrc = /^\/records\/[a-z0-9]+\/[a-z0-9]+\.webp$/;
const uprightSrc = /^\/records\/[a-z0-9]+\/[a-z0-9]+-upright\.webp$/;

const plateImageSchema = z.strictObject({
	src: z.string().regex(plateSrc),
	width: z.number().int().positive(),
	height: z.number().int().positive(),
});

const uprightImageSchema = z.strictObject({
	src: z.string().regex(uprightSrc),
	width: z.number().int().positive(),
	height: z.number().int().positive(),
});

const cropSchema = z.strictObject({
	x: z.number().int().nonnegative(),
	y: z.number().int().nonnegative(),
	w: z.number().int().positive(),
	h: z.number().int().positive(),
});

const transformSchema = z.strictObject({
	cropSpace: z.literal('upright'),
	/** Degrees already baked into `upright`. Finite number. Never the string "auto". Playback ignores it. Zod 4 `z.number()` already rejects Infinity. */
	angleDeg: z.number(),
	crop: cropSchema,
	exportWidth: z.number().int().positive(),
});

const markSchema = z.strictObject({
	id: z.string().regex(/^[a-z0-9-]+$/),
	/** Corner of the box the number sits on. Not the leader direction. */
	badge: z.enum(['tl', 'tr']),
	/** Leader direction. Independent of `badge`. */
	side: z.enum(['auto', 'left', 'right']),
	x: z.number().int().nonnegative(),
	y: z.number().int().nonnegative(),
	w: z.number().int().positive(),
	h: z.number().int().positive(),
	/** Short public heading. Omitted until an editor sets it. */
	label: z.string().min(1).optional(),
	/** Public sentence. Omitted until the editorial align. Never filled from YAML `note`. */
	note: z.string().min(1).optional(),
});

const detailSchema = z.strictObject({
	part: z.string().regex(/^[a-z0-9]+$/),
	plate: plateImageSchema,
	upright: uprightImageSchema.optional(),
	transform: transformSchema.optional(),
	marks: z.array(markSchema),
	caption: z.string().min(1),
	alt: z.string().min(1),
	text: z.string().min(1),
});
```

`recordSchema.image` becomes `plateImageSchema` (hero stays on `plateSrc`; a `-upright` name fails the regex). `details` stays `z.array(detailSchema).min(1)`.

- [ ] **Step 2: Replace the image loop inside `recordsFileSchema`'s superRefine**

Delete the `images` / `images.forEach` block. After the price check, insert:

```ts
		const heroPrefix = `/records/${record.id}/`;
		if (!record.image.src.startsWith(heroPrefix)) {
			ctx.addIssue({
				code: 'custom',
				message: `图片必须放在 ${heroPrefix}`,
				path: [index, 'image', 'src'],
			});
		}

		record.details.forEach((detail, detailIndex) => {
			const base = [index, 'details', detailIndex];
			const platePath = `/records/${record.id}/${detail.part}.webp`;
			if (detail.plate.src !== platePath) {
				ctx.addIssue({
					code: 'custom',
					message: `plate.src 必须是 ${platePath}`,
					path: [...base, 'plate', 'src'],
				});
			}

			const hasUpright = detail.upright !== undefined;
			const hasTransform = detail.transform !== undefined;
			if (hasUpright !== hasTransform) {
				ctx.addIssue({
					code: 'custom',
					message: 'upright 与 transform 必须同时存在或同时省略',
					path: [...base, hasUpright ? 'upright' : 'transform'],
				});
			}

			if (detail.upright) {
				const uprightPath = `/records/${record.id}/${detail.part}-upright.webp`;
				if (detail.upright.src !== uprightPath) {
					ctx.addIssue({
						code: 'custom',
						message: `upright.src 必须是 ${uprightPath}`,
						path: [...base, 'upright', 'src'],
					});
				}
			}

			if (detail.transform && detail.upright) {
				if (detail.transform.exportWidth !== detail.plate.width) {
					ctx.addIssue({
						code: 'custom',
						message: 'transform.exportWidth 必须等于 plate.width',
						path: [...base, 'transform', 'exportWidth'],
					});
				}
				const { crop } = detail.transform;
				if (crop.x + crop.w > detail.upright.width || crop.y + crop.h > detail.upright.height) {
					ctx.addIssue({
						code: 'custom',
						message: 'crop 必须落在 upright 像素内',
						path: [...base, 'transform', 'crop'],
					});
				}
				const expected = expectedPlateHeight(detail.transform.exportWidth, crop);
				if (Math.abs(detail.plate.height - expected) > 1) {
					ctx.addIssue({
						code: 'custom',
						message: `plate.height 与 crop 比例不符（期望约 ${expected}）`,
						path: [...base, 'plate', 'height'],
					});
				}
			}

			const seenMarks = new Set<string>();
			detail.marks.forEach((mark, markIndex) => {
				if (seenMarks.has(mark.id)) {
					ctx.addIssue({
						code: 'custom',
						message: `重复的 mark id：${mark.id}`,
						path: [...base, 'marks', markIndex, 'id'],
					});
				}
				seenMarks.add(mark.id);
				if (mark.x + mark.w > detail.plate.width || mark.y + mark.h > detail.plate.height) {
					ctx.addIssue({
						code: 'custom',
						message: 'mark 必须落在 plate 像素内',
						path: [...base, 'marks', markIndex],
					});
				}
			});
		});
```

`strictObject` already rejects `source`, `match`, `fit`, `ocr`, `rectifyH`, and `image` on a detail. The price walk already visits `label` and `note`; do not special-case them.

- [ ] **Step 3: Assert rasters, including pixel size**

Replace `assertPublicFile`'s call sites. Keep `assertPublicFile`. Add:

```ts
function readWebpSize(file: string): { width: number; height: number } {
	const buf = readFileSync(file);
	if (buf.length < 30 || buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WEBP') {
		throw new Error(`不是 WebP：${file}`);
	}
	const tag = buf.toString('ascii', 12, 16);
	if (tag === 'VP8 ') {
		return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
	}
	if (tag === 'VP8L') {
		const bits = buf.readUInt32LE(21);
		return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
	}
	if (tag === 'VP8X') {
		return {
			width: 1 + (buf[24]! | (buf[25]! << 8) | (buf[26]! << 16)),
			height: 1 + (buf[27]! | (buf[28]! << 8) | (buf[29]! << 16)),
		};
	}
	throw new Error(`无法读取 WebP 尺寸：${file}`);
}

function assertRaster(src: string, width: number, height: number): void {
	assertPublicFile(src);
	const relative = src.replace(/^\//, '');
	const file = join(process.cwd(), 'public', relative);
	const size = readWebpSize(file);
	if (size.width !== width || size.height !== height) {
		throw new Error(
			`图片尺寸与文件不符 ${src}：JSON ${width}×${height}，文件 ${size.width}×${size.height}`,
		);
	}
}
```

`parseRecords` becomes:

```ts
	for (const record of parsed.data) {
		assertPublicFile(record.image.src);
		for (const detail of record.details) {
			assertRaster(detail.plate.src, detail.plate.width, detail.plate.height);
			if (detail.upright) {
				assertRaster(detail.upright.src, detail.upright.width, detail.upright.height);
			}
		}
	}
```

Hero existence stays `assertPublicFile` only. Plate and upright must match the file's pixels. Do not resample anything.

- [ ] **Step 4: Index mark copy in search**

Replace the details `flatMap` inside `recordSearchText`:

```ts
		...record.details.flatMap((detail) => [
			detail.caption,
			detail.text,
			detail.alt,
			...detail.marks.flatMap((mark) => [mark.label, mark.note].filter((value): value is string => Boolean(value))),
		]),
```

- [ ] **Step 5: Migrate the 17 details**

Run this once from the repo root. It renames `image` → `plate`, sets `part` from the filename stem, sets `marks` to `[]`, and copies `caption`, `alt`, and `text` unchanged. It does not add `upright` or `transform`.

```bash
node --input-type=module -e '
import { readFileSync, writeFileSync } from "node:fs";
const file = "src/data/records.json";
const records = JSON.parse(readFileSync(file, "utf8"));
let count = 0;
for (const record of records) {
  record.details = record.details.map((detail) => {
    const stem = detail.image.src.split("/").pop().replace(/\.webp$/, "");
    count += 1;
    return {
      part: stem,
      plate: detail.image,
      marks: [],
      caption: detail.caption,
      alt: detail.alt,
      text: detail.text,
    };
  });
}
if (count !== 17) throw new Error("expected 17 details, got " + count);
writeFileSync(file, JSON.stringify(records, null, 2) + "\n");
'
```

Expected: exit 0. `rg '"image"' src/data/records.json` still matches hero `image` keys only. `rg '"part"' src/data/records.json` shows 17 parts (`label`, `cover`, `insert`, `back`). No `upright`, no `transform`, every `marks` array is `[]`.

- [ ] **Step 6: Verify the catalog still loads**

Run: `node --experimental-strip-types --input-type=module -e 'import { records } from "./src/data/records.ts"; const details = records.flatMap((r) => r.details); if (details.length !== 17) throw new Error(String(details.length)); if (details.some((d) => d.marks.length !== 0 || d.upright || d.transform)) throw new Error("geometry invented"); console.log(details.map((d) => d.part).join(","));'`

Expected: exit 0 and a line of 17 stems. If Node cannot import the extensionless `./detail-display` from `records.ts`, that is an app-resolver concern: `npm run check` is the gate for `records.ts`. This command is only a sanity check. If it fails on extension resolution, skip it and rely on Step 7.

- [ ] **Step 7: Commit**

```bash
git add src/data/records.ts src/data/records.json
git commit -m "feat(records): plate schema and legacy detail migration"
```

---

### Task 3: README sample

**Files:**
- Modify: `README.md` (the `details` array inside the 唱片 sample)

**Interfaces:**
- Consumes: the section 3 object shape
- Produces: a sample that includes `part`, `plate`, optional `upright` + `transform`, and `marks`

- [ ] **Step 1: Replace the sample detail**

Replace the `details` array in the README sample with:

```json
  "details": [
    {
      "part": "label",
      "plate": { "src": "/records/example1/label.webp", "width": 400, "height": 400 },
      "upright": { "src": "/records/example1/label-upright.webp", "width": 1200, "height": 1200 },
      "transform": {
        "cropSpace": "upright",
        "angleDeg": 0,
        "crop": { "x": 100, "y": 80, "w": 1000, "h": 1000 },
        "exportWidth": 400
      },
      "marks": [
        {
          "id": "catalog",
          "badge": "tl",
          "side": "auto",
          "x": 40,
          "y": 36,
          "w": 120,
          "h": 48,
          "note": "目录号"
        }
      ],
      "caption": "标签",
      "alt": "标签细节",
      "text": "① 目录号"
    }
  ],
```

Under the sample, add this paragraph (the sample is documentation; `example1` is not a real record and is not added to `records.json`):

```markdown
细节图用 `plate`，不用 `image`。`upright` 和 `transform` 要么一起写，要么一起省。没有真实的矫正前图时不要放大 plate 冒充 upright，并且 `marks` 用空数组：页面就还是现在的图、说明和全文，不叠题铭。公开笔画用站点的 `--accent`，不要写 `#FFD400`。`export_site_marks.py` 在黑胶目录的 skill 工具链里，不在这个网站仓库。
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: sample the plate detail schema"
```

---

### Task 4: `data-motion` before first paint

**Files:**
- Modify: `src/layouts/Base.astro` (the `is:inline` script in `<head>`)

**Interfaces:**
- Consumes: nothing
- Produces: `document.documentElement.dataset.motion` is `reduce` or `ok` before first paint. If `matchMedia` throws, the attribute stays unset. Theme handling is unchanged.

- [ ] **Step 1: Extend the head script**

Replace the head script body so the theme `try` stays, and motion has its own `try`:

```html
		<script is:inline>
			(function () {
				try {
					var theme = localStorage.getItem('theme');
					if (theme === 'light' || theme === 'dark') {
						document.documentElement.setAttribute('data-theme', theme);
					}
				} catch (error) {
					/* keep the system preference */
				}
				try {
					document.documentElement.dataset.motion = window.matchMedia(
						'(prefers-reduced-motion: reduce)',
					).matches
						? 'reduce'
						: 'ok';
				} catch (error) {
					/* leave data-motion unset; the page then shows the settled plate */
				}
			})();
		</script>
```

- [ ] **Step 2: Commit**

```bash
git add src/layouts/Base.astro
git commit -m "feat(records): set data-motion before first paint"
```

---

### Task 5: Plate stage CSS and one-column grid

**Files:**
- Modify: `src/styles/global.css` (the `.record-object > .meta` through `.detail-text` block, about lines 892–968)

**Interfaces:**
- Consumes: markup classes from Task 6 (`detail-figure`, `has-stage`, `is-reveal`, `is-settled`, `detail-stage`, `mark-slot`, `mark-slot-left`, `mark-slot-right`, `plate-frame`, `plate`, `upright-clip`, `upright`, `plate-overlay`, `mark-graphics`, `mark-leaders`, `mark-box`, `mark-disc`, `mark-num`, `mark-leader`, `mark-list`, `mark-index`, `mark-label`, `mark-note`)
- Produces: the settled and running visual states. Hero rules stay on `.entry-hero`.

- [ ] **Step 1: Retarget the detail rules and add the stage**

Keep `.record-object > .meta` as it is.

Replace the shared `.entry-hero, .detail-grid figure` rules through `.detail-text` with the following. Do not change `.entry-hero` sizes, the hero border, or `.detail-text` typography (`0.78rem`, muted, `pre-line`).

```css
.entry-hero,
.detail-figure {
	display: flex;
	flex-direction: column;
	align-items: flex-start;
	width: fit-content;
	max-width: 100%;
	min-width: 0;
	margin: 0.65rem 0 0;
}

.detail-figure {
	margin: 0;
}

.detail-figure.has-stage {
	width: 100%;
}

.entry-hero img,
.detail-figure > img {
	display: block;
	width: auto;
	max-width: 100%;
	height: auto;
	background: transparent;
	border: 1px solid var(--line);
	border-radius: 0;
}

.entry-hero figcaption,
.detail-figure figcaption,
.detail-figure .detail-text {
	width: 0;
	min-width: 100%;
	max-width: 100%;
}

.entry-hero figcaption,
.detail-figure figcaption {
	margin: 0.28rem 0 0;
	padding: 0;
	color: var(--muted);
	font-size: 0.75rem;
	font-weight: 400;
	line-height: 1.4;
	text-wrap: pretty;
}

.detail-figure figcaption {
	font-weight: 500;
	line-height: 1.4;
}

.detail-grid {
	display: grid;
	grid-template-columns: minmax(0, 1fr);
	gap: 1.2rem 1.15rem;
	align-items: start;
	justify-items: start;
	margin-top: 0.7rem;
}

.detail-text,
.fold-body {
	white-space: pre-line;
}

.detail-text {
	margin: 0.16rem 0 0;
	color: var(--muted);
	font-size: 0.78rem;
	font-weight: 400;
	line-height: 1.45;
}

.detail-stage {
	display: flex;
	align-items: flex-start;
	gap: 0.55rem;
	width: 100%;
	max-width: 100%;
}

.mark-slot {
	flex: 0 0 9.5rem;
	width: 9.5rem;
	max-width: 9.5rem;
}

.plate-frame {
	position: relative;
	flex: 0 1 auto;
	min-width: 0;
	max-width: 100%;
	border: 1px solid var(--line);
	background: var(--bg);
	line-height: 0;
}

.plate-frame .plate {
	display: block;
	width: auto;
	max-width: 100%;
	height: auto;
	border: 0;
	background: transparent;
}

.upright-clip {
	position: absolute;
	inset: 0;
	overflow: hidden;
	background: var(--bg);
	pointer-events: none;
	opacity: 0;
	visibility: hidden;
}

html[data-motion='ok'] .detail-figure.is-reveal:not(.is-settled) .upright-clip {
	opacity: 1;
	visibility: visible;
}

.upright {
	position: absolute;
	inset: 0;
	width: 100%;
	height: 100%;
	object-fit: contain;
	object-position: center;
	border: 0;
}

html[data-motion='ok'] .detail-figure.is-reveal:not(.is-settled) .plate {
	opacity: 0;
}

.plate-overlay {
	position: absolute;
	inset: 0;
	width: 100%;
	height: 100%;
	overflow: visible;
	pointer-events: none;
}

.mark-box {
	fill: none;
	stroke: var(--accent);
}

.mark-disc {
	fill: var(--bg);
	stroke: var(--accent);
}

.mark-num {
	fill: var(--accent);
	font-family: inherit;
	font-weight: 600;
	text-anchor: middle;
	dominant-baseline: central;
}

.mark-leader {
	fill: none;
	stroke: var(--accent);
}

html[data-motion='ok'] .detail-figure.is-reveal:not(.is-settled) .mark-graphics,
html[data-motion='ok'] .detail-figure.is-reveal:not(.is-settled) .mark-leaders,
html[data-motion='ok'] .detail-figure.is-reveal:not(.is-settled) .mark-list {
	opacity: 0;
}

.mark-list {
	position: absolute;
	inset: 0;
	margin: 0;
	padding: 0;
	list-style: none;
	pointer-events: none;
}

.mark-list li {
	position: absolute;
	width: max-content;
	max-width: 9.5rem;
	pointer-events: auto;
}

.mark-list li[data-side='right'] {
	left: calc(100% + 0.55rem);
}

.mark-list li[data-side='left'] {
	right: calc(100% + 0.55rem);
}

.mark-index {
	position: absolute;
	width: 1px;
	height: 1px;
	padding: 0;
	margin: -1px;
	overflow: hidden;
	clip: rect(0, 0, 0, 0);
	white-space: nowrap;
	border: 0;
}

.mark-label {
	margin: 0;
	color: var(--muted);
	font-size: 0.75rem;
	font-weight: 500;
	line-height: 1.35;
}

.mark-note {
	margin: 0;
	color: var(--text);
	font-size: 0.78rem;
	font-weight: 400;
	line-height: 1.45;
}

@media (forced-colors: active) {
	.mark-box,
	.mark-disc,
	.mark-leader {
		stroke: CanvasText;
	}

	.mark-num {
		fill: CanvasText;
	}

	.mark-disc {
		fill: Canvas;
	}
}
```

Leave `.fold-body { white-space: pre-line; }` covered by the combined rule above (do not drop it). Leave the `@media (min-width: 48rem) .record-object` sticky rule unchanged.

There is no CSS transition on these opacities. The script tweens. Reduced motion and no-JS never match `data-motion='ok'`, so they paint the settled plate.

Box, disc, and leader stroke widths are SVG attributes (`2`, `2`, and `1`), not CSS lengths. A stylesheet length is emitted as CSS pixels and would not stay in plate pixels when the plate scales. Color stays in CSS so `--accent` and `forced-colors` still apply.

- [ ] **Step 2: Commit**

```bash
git add src/styles/global.css
git commit -m "feat(records): plate stage and one-column detail grid"
```

---

### Task 6: Detail markup and reveal script

**Files:**
- Modify: `src/pages/records/[id].astro`

**Interfaces:**
- Consumes: `badgeCenter`, `detailMode`, `notesAligned`, `paintSide`, `showDetailsNote`, `showMarkLabel`, `visibleDetailText`, `leaderEndpoints`, `resolvedSide`, `stackTops`
- Produces: a figure per detail. Legacy has no stage. Reveal adds `is-reveal` and the upright image. The script adds `is-settled` and `data-settled="1"`.

Timing, from the spec, for a reveal whose notes are aligned:

| Beat | Start | Duration |
|---|---|---|
| Hold | 0 | 160ms |
| Crop | 160ms | 760ms, easing `cubic-bezier(0.22, 1, 0.36, 1)` |
| Crossfade | 840ms | 80ms linear, overlapping the end of the crop |
| Boxes | 920ms | 160ms linear |
| Leaders | 1080ms | 220ms linear, stroke draws |
| Notes | 1300ms | 180ms linear |

Total 1480ms. If notes are not aligned, stop after the boxes at 1080ms. Plate callouts, Legacy, a crop that is not a proper sub-rectangle, `data-motion` other than `ok`: no tween.

- [ ] **Step 1: Markup**

Add these imports beside the existing ones in `src/pages/records/[id].astro`:

```ts
import {
	badgeCenter,
	detailMode,
	notesAligned,
	paintSide,
	showDetailsNote,
	showMarkLabel,
	visibleDetailText,
} from '../../data/detail-display';
```

Do not import `detail-display` from a client path that also pulls `records.ts`.

Replace `<p class="meta">{record.detailsNote}</p>` and the whole `.detail-grid` with:

```astro
				{
					showDetailsNote(record) && <p class="meta">{record.detailsNote}</p>
				}
				<div class="detail-grid">
					{
						record.details.map((detail) => {
							const mode = detailMode(detail);
							const aligned = notesAligned(detail);
							const remainder = visibleDetailText(detail);
							const sides = new Set(detail.marks.map((mark) => paintSide(mark.side)));
							return (
								<figure
									class:list={[
										'detail-figure',
										mode === 'reveal' && 'is-reveal',
										mode !== 'legacy' && 'has-stage',
									]}
									data-part={detail.part}
									data-mode={mode}
									data-plate-width={detail.plate.width}
									data-plate-height={detail.plate.height}
									data-notes={aligned ? 'aligned' : 'open'}
								>
									{mode === 'legacy' ? (
										<img
											src={detail.plate.src}
											width={detail.plate.width}
											height={detail.plate.height}
											alt={detail.alt}
											decoding="async"
											loading="lazy"
										/>
									) : (
										<div class="detail-stage">
											{aligned && sides.has('left') && <div class="mark-slot mark-slot-left" />}
											<div class="plate-frame">
												<img
													class="plate"
													src={detail.plate.src}
													width={detail.plate.width}
													height={detail.plate.height}
													alt={detail.alt}
													decoding="async"
													loading="lazy"
												/>
												{mode === 'reveal' && detail.upright && detail.transform && (
													<div class="upright-clip">
														<img
															class="upright"
															src={detail.upright.src}
															width={detail.upright.width}
															height={detail.upright.height}
															alt=""
															aria-hidden="true"
															decoding="async"
															loading="lazy"
															data-crop-x={detail.transform.crop.x}
															data-crop-y={detail.transform.crop.y}
															data-crop-w={detail.transform.crop.w}
															data-crop-h={detail.transform.crop.h}
														/>
													</div>
												)}
												{detail.marks.length > 0 && (
													<svg
														class="plate-overlay"
														viewBox={`0 0 ${detail.plate.width} ${detail.plate.height}`}
														overflow="visible"
														aria-hidden="true"
													>
														<g class="mark-graphics">
															{detail.marks.map((mark, index) => {
																const badge = badgeCenter(
																	{ ...mark, badge: mark.badge },
																	detail.plate.width,
																);
																return (
																	<g class="mark-callout" data-mark-id={mark.id}>
																		<rect
																			class="mark-box"
																			x={mark.x}
																			y={mark.y}
																			width={mark.w}
																			height={mark.h}
																			stroke-width="2"
																		/>
																		<circle
																			class="mark-disc"
																			cx={badge.cx}
																			cy={badge.cy}
																			r={badge.r}
																			stroke-width="2"
																		/>
																		<text
																			class="mark-num"
																			x={badge.cx}
																			y={badge.cy}
																			font-size={badge.fontSize}
																		>
																			{index + 1}
																		</text>
																	</g>
																);
															})}
														</g>
														{aligned && (
															<g class="mark-leaders">
																{detail.marks.map((mark) => {
																	const side = paintSide(mark.side);
																	const x1 = side === 'left' ? mark.x : mark.x + mark.w;
																	const y1 = mark.y + mark.h / 2;
																	const x2 = side === 'left' ? 0 : detail.plate.width;
																	return (
																		<line
																			class="mark-leader"
																			data-mark-id={mark.id}
																			x1={x1}
																			y1={y1}
																			x2={x2}
																			y2={y1}
																			stroke-width="1"
																		/>
																	);
																})}
															</g>
														)}
													</svg>
												)}
												{aligned && (
													<ol class="mark-list" aria-label="题铭">
														{detail.marks.map((mark, index) => (
															<li
																id={`${record.id}-${detail.part}-mark-${mark.id}`}
																data-mark-id={mark.id}
																data-index={index}
																data-side={paintSide(mark.side)}
																data-side-pref={mark.side}
																data-x={mark.x}
																data-y={mark.y}
																data-w={mark.w}
																data-h={mark.h}
															>
																<span class="mark-index">{index + 1}</span>
																{showMarkLabel(mark) && <p class="mark-label">{mark.label}</p>}
																<p class="mark-note">{mark.note}</p>
															</li>
														))}
													</ol>
												)}
											</div>
											{aligned && sides.has('right') && <div class="mark-slot mark-slot-right" />}
										</div>
									)}
									<figcaption>{detail.caption}</figcaption>
									{remainder && <p class="detail-text">{remainder}</p>}
								</figure>
							);
						})
					}
				</div>
```

Leave the hero figure, the tombstone, 记述, `dl.props`, and the three `<details class="fold">` blocks untouched.

With the migrated JSON every detail is Legacy, so the rendered page is still image + caption + full text, and `detailsNote` still shows wherever a circled line remains (all seven pages). Reveal markup is what the same template emits once upright, transform, and marks exist.

- [ ] **Step 2: Reveal script**

Inside `<Base>`, after `</article>`, add this processed script (not `is:inline`, so `astro check` typechecks it). It must not import `src/data/records.ts`.

```astro
	<script>
		import { leaderEndpoints, resolvedSide, stackTops } from '../../data/detail-display';

		type Play = {
			anims: Animation[];
			timer: number | null;
			leadersCancelled: boolean;
			observer: IntersectionObserver | null;
		};

		const plays = new WeakMap<HTMLElement, Play>();

		function playOf(figure: HTMLElement): Play {
			let play = plays.get(figure);
			if (!play) {
				play = { anims: [], timer: null, leadersCancelled: false, observer: null };
				plays.set(figure, play);
			}
			return play;
		}

		function remPx(): number {
			return Number.parseFloat(getComputedStyle(document.documentElement).fontSize);
		}

		function ensureSlots(figure: HTMLElement): void {
			const stage = figure.querySelector<HTMLElement>('.detail-stage');
			const frame = figure.querySelector<HTMLElement>('.plate-frame');
			if (!stage || !frame) return;
			const sides = new Set(
				[...figure.querySelectorAll<HTMLLIElement>('.mark-list li')].map((li) => li.dataset.side),
			);
			for (const side of ['left', 'right'] as const) {
				const slot = stage.querySelector<HTMLElement>(`.mark-slot-${side}`);
				if (sides.has(side)) {
					if (!slot) {
						const created = document.createElement('div');
						created.className = `mark-slot mark-slot-${side}`;
						if (side === 'left') stage.insertBefore(created, frame);
						else stage.appendChild(created);
					}
				} else if (slot) {
					slot.remove();
				}
			}
		}

		function position(figure: HTMLElement): void {
			const plate = figure.querySelector<HTMLImageElement>('.plate');
			const list = figure.querySelector<HTMLOListElement>('.mark-list');
			if (!plate || !list) return;
			const plateWidth = Number(figure.dataset.plateWidth);
			const plateHeight = Number(figure.dataset.plateHeight);
			const items = [...list.querySelectorAll<HTMLLIElement>('li')];
			for (const li of items) {
				const pref = li.dataset.sidePref;
				const side = pref === 'left' || pref === 'right' || pref === 'auto' ? pref : 'auto';
				li.dataset.side = resolvedSide(
					{ side, x: Number(li.dataset.x), w: Number(li.dataset.w) },
					plateWidth,
				);
			}
			ensureSlots(figure);
			const gap = 0.35 * remPx();
			for (const side of ['left', 'right'] as const) {
				const group = items.filter((li) => li.dataset.side === side);
				const tops = stackTops(
					group.map((li) => ({
						index: Number(li.dataset.index),
						anchor: Number(li.dataset.y) + Number(li.dataset.h) / 2,
						height: li.offsetHeight,
					})),
					plateHeight,
					plate.clientHeight,
					gap,
				);
				group.forEach((li, index) => {
					li.style.top = `${tops[index]}px`;
				});
			}
			const plateRect = plate.getBoundingClientRect();
			const shortPx = 0.35 * remPx();
			for (const li of items) {
				const id = li.dataset.markId ?? '';
				const line = figure.querySelector<SVGLineElement>(
					`.mark-leader[data-mark-id="${CSS.escape(id)}"]`,
				);
				if (!line) continue;
				const side = li.dataset.side === 'left' ? 'left' : 'right';
				const points = leaderEndpoints({
					mark: {
						x: Number(li.dataset.x),
						y: Number(li.dataset.y),
						w: Number(li.dataset.w),
						h: Number(li.dataset.h),
					},
					side,
					plateRect: {
						left: plateRect.left,
						top: plateRect.top,
						width: plateRect.width,
						height: plateRect.height,
					},
					plateWidth,
					plateHeight,
					noteRect: li.getBoundingClientRect(),
					shortPx,
				});
				line.setAttribute('x1', String(points.x1));
				line.setAttribute('y1', String(points.y1));
				line.setAttribute('x2', String(points.x2));
				line.setAttribute('y2', String(points.y2));
			}
			const stage = figure.querySelector<HTMLElement>('.detail-stage');
			if (!stage) return;
			let overflow = 0;
			for (const li of items) {
				const bottom = li.offsetTop + li.offsetHeight;
				if (bottom > plate.clientHeight) overflow = Math.max(overflow, bottom - plate.clientHeight);
			}
			stage.style.paddingBottom = overflow > 0 ? `${overflow}px` : '';
		}

		function settle(figure: HTMLElement): void {
			if (figure.dataset.settled === '1') return;
			figure.dataset.settled = '1';
			figure.classList.add('is-settled');
			figure.removeAttribute('tabindex');
			const play = plays.get(figure);
			if (play) {
				play.leadersCancelled = true;
				play.observer?.disconnect();
				if (play.timer !== null) window.clearTimeout(play.timer);
				for (const anim of play.anims) anim.cancel();
			}
			const upright = figure.querySelector<HTMLImageElement>('.upright');
			if (upright) upright.style.opacity = '';
			const plate = figure.querySelector<HTMLImageElement>('.plate');
			if (plate) plate.style.opacity = '';
			const leaders = figure.querySelector<SVGGElement>('.mark-leaders');
			if (leaders) leaders.style.opacity = '';
			figure.querySelectorAll<SVGLineElement>('.mark-leader').forEach((line) => {
				line.setAttribute('stroke-dashoffset', '0');
			});
			try {
				position(figure);
			} catch {
				/* the settled plate is already on screen */
			}
		}

		function drawLeaders(figure: HTMLElement, startAt: number, duration: number): void {
			const play = playOf(figure);
			const lines = [...figure.querySelectorAll<SVGLineElement>('.mark-leader')];
			const leaders = figure.querySelector<SVGGElement>('.mark-leaders');
			for (const line of lines) {
				line.setAttribute('pathLength', '1');
				line.setAttribute('stroke-dasharray', '1');
				line.setAttribute('stroke-dashoffset', '1');
			}
			const frame = (now: number) => {
				if (play.leadersCancelled) return;
				const elapsed = now - startAt;
				if (elapsed < 0) {
					requestAnimationFrame(frame);
					return;
				}
				const t = Math.min(1, elapsed / duration);
				for (const line of lines) line.setAttribute('stroke-dashoffset', String(1 - t));
				if (leaders) leaders.style.opacity = '1';
				if (t < 1) requestAnimationFrame(frame);
			};
			requestAnimationFrame(frame);
		}

		function runTimeline(figure: HTMLElement, upright: HTMLImageElement): void {
			const plate = figure.querySelector<HTMLImageElement>('.plate');
			if (!plate) {
				settle(figure);
				return;
			}
			const crop = {
				x: Number(upright.dataset.cropX),
				y: Number(upright.dataset.cropY),
				w: Number(upright.dataset.cropW),
				h: Number(upright.dataset.cropH),
			};
			const viewW = plate.clientWidth;
			const viewH = plate.clientHeight;
			const naturalW = upright.naturalWidth;
			const naturalH = upright.naturalHeight;
			const containScale = Math.min(viewW / naturalW, viewH / naturalH);
			const contain = {
				left: (viewW - naturalW * containScale) / 2,
				top: (viewH - naturalH * containScale) / 2,
				width: naturalW * containScale,
				height: naturalH * containScale,
			};
			const cropScale = viewW / crop.w;
			const cropped = {
				left: -crop.x * cropScale,
				top: -crop.y * cropScale,
				width: naturalW * cropScale,
				height: naturalH * cropScale,
			};
			const px = (value: number) => `${value}px`;
			upright.style.objectFit = 'fill';
			upright.style.right = 'auto';
			upright.style.bottom = 'auto';
			upright.style.left = px(contain.left);
			upright.style.top = px(contain.top);
			upright.style.width = px(contain.width);
			upright.style.height = px(contain.height);

			const play = playOf(figure);
			const cropEase = 'cubic-bezier(0.22, 1, 0.36, 1)';
			play.anims.push(
				upright.animate(
					[
						{
							left: px(contain.left),
							top: px(contain.top),
							width: px(contain.width),
							height: px(contain.height),
						},
						{
							left: px(cropped.left),
							top: px(cropped.top),
							width: px(cropped.width),
							height: px(cropped.height),
						},
					],
					{ duration: 760, delay: 160, easing: cropEase, fill: 'forwards' },
				),
			);
			play.anims.push(
				upright.animate([{ opacity: 1 }, { opacity: 0 }], {
					duration: 80,
					delay: 840,
					easing: 'linear',
					fill: 'forwards',
				}),
			);
			play.anims.push(
				plate.animate([{ opacity: 0 }, { opacity: 1 }], {
					duration: 80,
					delay: 840,
					easing: 'linear',
					fill: 'forwards',
				}),
			);
			const graphics = figure.querySelector<SVGGElement>('.mark-graphics');
			if (graphics) {
				play.anims.push(
					graphics.animate([{ opacity: 0 }, { opacity: 1 }], {
						duration: 160,
						delay: 920,
						easing: 'linear',
						fill: 'forwards',
					}),
				);
			}
			const aligned = figure.dataset.notes === 'aligned';
			const started = performance.now();
			if (aligned) drawLeaders(figure, started + 1080, 220);
			const notes = figure.querySelector<HTMLOListElement>('.mark-list');
			if (aligned && notes) {
				play.anims.push(
					notes.animate([{ opacity: 0 }, { opacity: 1 }], {
						duration: 180,
						delay: 1300,
						easing: 'linear',
						fill: 'forwards',
					}),
				);
			}
			const total = aligned ? 1480 : 1080;
			play.timer = window.setTimeout(() => settle(figure), total);
		}

		function playReveal(figure: HTMLElement, upright: HTMLImageElement): void {
			if (figure.dataset.settled === '1') return;
			const run = () => {
				if (figure.dataset.settled === '1') return;
				if (upright.naturalWidth === 0) {
					settle(figure);
					return;
				}
				try {
					figure.tabIndex = 0;
					position(figure);
					runTimeline(figure, upright);
				} catch {
					settle(figure);
				}
			};
			if (upright.complete && upright.naturalWidth > 0) run();
			else upright.addEventListener('load', run, { once: true });
		}

		function bind(figure: HTMLElement): void {
			position(figure);
			if (figure.dataset.mode !== 'reveal') return;
			const play = playOf(figure);
			const skip = () => {
				if (figure.dataset.settled === '1') return;
				settle(figure);
			};
			figure.addEventListener('click', skip);
			figure.addEventListener('keydown', (event) => {
				if (event.key !== 'Enter' && event.key !== ' ') return;
				if (figure.dataset.settled === '1') return;
				event.preventDefault();
				skip();
			});
			if (document.documentElement.dataset.motion !== 'ok') {
				settle(figure);
				return;
			}
			const upright = figure.querySelector<HTMLImageElement>('.upright');
			if (!upright || typeof IntersectionObserver !== 'function') {
				settle(figure);
				return;
			}
			if (upright.complete && upright.naturalWidth === 0) {
				settle(figure);
				return;
			}
			upright.addEventListener('error', () => settle(figure));
			play.observer = new IntersectionObserver(
				(entries) => {
					if (!entries.some((entry) => entry.isIntersecting)) return;
					play.observer?.disconnect();
					playReveal(figure, upright);
				},
				{ threshold: 0 },
			);
			play.observer.observe(figure);
		}

		function init(): void {
			const figures = [...document.querySelectorAll<HTMLElement>('.detail-figure')];
			for (const figure of figures) {
				try {
					bind(figure);
				} catch {
					settle(figure);
				}
			}
			const reposition = () => {
				for (const figure of figures) {
					try {
						position(figure);
					} catch {
						/* keep the last placement */
					}
				}
			};
			window.addEventListener('resize', reposition);
			document.fonts?.ready.then(reposition).catch(() => {
				/* fonts.ready rejected; the first placement stands */
			});
			try {
				const media = window.matchMedia('(prefers-reduced-motion: reduce)');
				media.addEventListener('change', () => {
					document.documentElement.dataset.motion = media.matches ? 'reduce' : 'ok';
					if (media.matches) {
						for (const figure of figures) {
							if (figure.dataset.mode === 'reveal') settle(figure);
						}
					}
				});
			} catch {
				/* head script already set data-motion, or left it unset */
			}
		}

		init();
	</script>
```

The script never reads `angleDeg`, `auto` as a deskew token, `fit`, `match`, or OCR. Resize and `document.fonts.ready` call `position` only. They do not call `runTimeline` again.

`angleDeg` is not copied onto a data attribute.

- [ ] **Step 3: Commit**

```bash
git add src/pages/records/[id].astro
git commit -m "feat(records): detail figures and reveal timeline"
```

---

### Task 7: Acceptance from spec §12

**Files:**
- No new source unless a check fails. Fix the failing task's file, do not widen the change.

**Interfaces:**
- Consumes: the migrated catalog and the page template
- Produces: `npm run check` and `npm run build` passing, and the §12 checks below

- [ ] **Step 1: Unit rules**

Run: `node --experimental-strip-types --test src/data/detail-display.test.ts`

Expected: PASS.

- [ ] **Step 2: Static gates**

Run: `npm run check`

Expected: exit 0.

Run: `npm run build`

Expected: exit 0. The build parses `records.json`, so a bad schema, a missing plate, or a plate size that does not match the WebP fails here.

- [ ] **Step 3: Data checks (acceptance 2, 3, 4, 6)**

```bash
node --input-type=module -e '
import { readFileSync } from "node:fs";
const records = JSON.parse(readFileSync("src/data/records.json", "utf8"));
const details = records.flatMap((r) => r.details.map((d) => ({ id: r.id, ...d })));
if (details.length !== 17) throw new Error("count");
for (const detail of details) {
  if (!detail.part || !detail.plate || !detail.text || !detail.caption || !detail.alt) throw new Error("shape " + detail.id);
  if (detail.image) throw new Error("image key");
  if (detail.upright || detail.transform) throw new Error("invented upright " + detail.id);
  if (!Array.isArray(detail.marks) || detail.marks.length !== 0) throw new Error("marks " + detail.id);
  if (detail.plate.width < 380 || detail.plate.width > 480) throw new Error("width " + detail.plate.src);
  if (!detail.plate.src.endsWith("/" + detail.part + ".webp")) throw new Error("part " + detail.plate.src);
}
console.log("17 legacy details");
'
```

Expected: `17 legacy details`.

Search the page, CSS, and script for rejected behavior:

```bash
rg -n "angleDeg|FFD400|#ffd400|object-fit:\\s*contain|deskew" src/pages/records/[id].astro src/styles/global.css src/scripts src/data/detail-display.ts
```

Expected: no `angleDeg` in the page or CSS (it remains a schema field in `records.ts` only). No `#FFD400`. `object-fit: contain` appears once, on `.upright`, which is the hold frame — not a rotation.

`rg -n "records.astro" ` should show no diff in `src/pages/records.astro` (`git diff origin/main -- src/pages/records.astro` is empty).

- [ ] **Step 4: Page checks (acceptance 1, 5, 7, 8, 9)**

There is no upright in the repo, so no figure is Reveal yet. Confirm Legacy:

- Build output for `/records/mhjl329/` contains `标签细节`, caption `A 面标签 · ①–⑥`, the six `text` lines, and `腰封细节`. It does not contain `plate-overlay`, `is-reveal`, or `-upright.webp`.
- The same for `/records/lpbr6083/`: the three existing webps, no `plate-overlay`.
- `detailsNote` is still rendered on mhjl329 (circled lines are visible because marks are empty).
- Hero `entry-hero` markup is unchanged. List page `src/pages/records.astro` is unchanged.
- `.detail-grid` in CSS is `minmax(0, 1fr)`.
- A reveal that later gains notes uses the durations in Task 6 (160 / 760 / 80 / 160 / 220 / 180). Click, tap, Enter, and Space call `settle`. `data-motion` other than `ok` never starts `runTimeline`.

Acceptance 8 (22px disc, 2px stroke, `#7c2d22`) is encoded in `badgeCenter` and `.mark-box` / `.mark-disc`. It becomes visible when a 400px plate has marks. Do not invent that plate to force the screenshot.

- [ ] **Step 5: Commit any acceptance fixes**

If nothing failed, do not make an empty commit. If something failed, fix it and commit:

```bash
git add -u
git commit -m "fix(records): satisfy imagery reveal acceptance"
```
