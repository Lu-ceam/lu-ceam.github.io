# Imagery scroll-scrub Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace autoplay `runTimeline` on reveal detail figures with sequential sticky fullscreen scroll-scrub (upright → crop → plate → boxes), then show 记述 / 著录 below.

**Architecture:** When a record has at least one `detailMode === 'reveal'` detail, rebuild the detail page as 题铭 → one sticky runway per reveal detail → existing story column content. Each runway is ~2.5–3× viewport tall with a `position: sticky; height: 100vh` stage. Scroll position inside the runway maps to `p ∈ [0,1]`; apply crop/crossfade/box opacity from `p`. Soft-snap toward keyframes `{0, 0.55, 0.75, 1}` on scroll idle. Legacy / plate-callout-only records keep today’s split layout. No scroll libraries.

**Tech Stack:** Astro static pages, vanilla TypeScript in the page `<script>`, CSS sticky + custom properties, existing `detail-display.ts` helpers and Web Animations only where needed for soft-snap ease (or CSS `scroll-behavior` + JS lerp — prefer JS lerp on idle).

**Spec:** [`docs/superpowers/specs/2026-10-24-records-imagery-scroll-scrub-design.md`](../specs/2026-10-24-records-imagery-scroll-scrub-design.md)  
**Prior reveal:** [`docs/superpowers/plans/2026-10-24-records-imagery-reveal-manual.md`](2026-10-24-records-imagery-reveal-manual.md) (assets / marks unchanged)

## Global Constraints

- No GSAP / Lenis / ScrollTrigger or other scroll libraries.
- Do not change YAML / `export_site_marks.py`, `records.json` schema, list pages, tombstone, loupe, or leader-note editorial align.
- Do not rewrite 记述 copy.
- Keyframes fixed: crop ends ~0.55, boxes fully on ~0.75, hold to 1.0.
- Runway height: `clamp(250vh, 2.75 * 100vh, 300vh)` (≈2.5–3 screens); tune only if acceptance fails.
- `prefers-reduced-motion: reduce` / `data-motion !== 'ok'`: no tall runways; settled plate + boxes; story below.
- Soft-snap only on scroll idle / pointer up — never fight an active wheel gesture.
- Remove autoplay `runTimeline` and IntersectionObserver autoplay path for reveal figures that use scrub chapters.
- MHJL 329 (`/records/mhjl329/`) is the primary acceptance target (label + cover/腰封 reveal if both present).

## File map

| Path | Responsibility |
|------|----------------|
| `src/pages/records/[id].astro` | Branch layout: scrub page vs legacy split; chapter markup; replace script autoplay with scrub |
| `src/styles/global.css` | `.reveal-runway`, `.reveal-stage`, fullscreen sticky, reduced-motion overrides |
| `src/data/detail-display.ts` | Optional pure helpers: `scrubProgress`, `nearestKeyframe`, `applyScrubVisual` geometry — keep page script thin if extracted |
| `docs/superpowers/plans/2026-10-24-records-imagery-scroll-scrub.md` | This plan |

Do **not** touch `src/pages/records.astro`, `records.ts` schema, or `public/records/**` assets in this plan.

---

### Task 1: Detect scrub records + restructure markup

**Files:**
- Modify: `src/pages/records/[id].astro`
- Modify: `src/styles/global.css` (minimal structural hooks only; polish in Task 2)

**Interfaces:**
- Consumes: `detailMode(detail)` from `detail-display.ts`; existing `VinylRecord`
- Produces: `const hasRevealChapters = record.details.some((d) => detailMode(d) === 'reveal')`; when true, page uses scrub layout classes on `<article>`

- [ ] **Step 1: Add layout branch flag after props**

In `[id].astro` frontmatter after `const when = ...`:

```ts
const revealDetails = record.details.filter((d) => detailMode(d) === 'reveal');
const hasRevealChapters = revealDetails.length > 0;
const nonRevealDetails = record.details.filter((d) => detailMode(d) !== 'reveal');
```

- [ ] **Step 2: Restructure article when `hasRevealChapters`**

When `hasRevealChapters` is true, replace the current `.record-split` body with this order (keep back-link):

1. `<header class="record-tombstone">` (move 题铭 out of the old right column — same markup as today).
2. For each `revealDetails` entry, emit:

```astro
<section
  class="reveal-runway"
  data-part={detail.part}
  data-plate-width={detail.plate.width}
  data-plate-height={detail.plate.height}
  data-notes={notesAligned(detail) ? 'aligned' : 'open'}
  style={`--runway-vh: 2.75;`}
>
  <div class="reveal-stage">
    <!-- reuse plate / upright-clip / overlay SVG / mark list from today’s reveal figure -->
  </div>
  <figcaption class="reveal-caption">{detail.caption}</figcaption>
</section>
```

Reuse the same plate/upright/marks markup currently inside `mode === 'reveal'` figures (copy the working subtree; do not invent new asset fields).

3. Then a `.record-after` block containing: any `nonRevealDetails` (legacy/callout figures in a compact grid if needed), then `.record-story`, `dl.props`, and the three folds — same content as today’s right column minus the tombstone already moved up.

When `hasRevealChapters` is false, keep the existing `.record-split` markup byte-for-byte for Legacy records.

- [ ] **Step 3: Mark article for CSS**

```astro
<article
  class:list={['record-page', hasRevealChapters && 'record-page--scrub']}
  data-record-id={record.id}
>
```

- [ ] **Step 4: Build check**

Run: `npm run check && npm run build`  
Expected: PASS. Visually, scrub records will look broken until Task 2–3; Legacy pages must still match production.

- [ ] **Step 5: Commit**

```bash
git add src/pages/records/[id].astro src/styles/global.css
git commit -m "feat(records): scrub page markup — 题铭, runways, story after"
```

---

### Task 2: Sticky runway CSS

**Files:**
- Modify: `src/styles/global.css`

**Interfaces:**
- Consumes: `.record-page--scrub`, `.reveal-runway`, `.reveal-stage` from Task 1
- Produces: sticky fullscreen stage; reduced-motion collapses runway

- [ ] **Step 1: Add runway / stage rules**

Append (adjust token names only if collisions exist):

```css
.record-page--scrub .reveal-runway {
	position: relative;
	height: calc(var(--runway-vh, 2.75) * 100vh);
	margin: 0;
}

.record-page--scrub .reveal-stage {
	position: sticky;
	top: 0;
	height: 100vh;
	display: grid;
	place-items: center;
	background: var(--bg);
	overflow: hidden;
}

.record-page--scrub .reveal-stage .plate-frame {
	/* fill viewport while preserving plate aspect — contain inside 100vh / 100vw */
	max-width: min(100vw, calc(100vh * (var(--plate-w, 1) / var(--plate-h, 1))));
	max-height: 100vh;
	width: min(100vw, calc(100vh * (attr(data-plate-width number, 1) / attr(data-plate-height number, 1))));
}

/* Prefer setting --plate-w / --plate-h from inline style on stage from Astro width/height attrs */
```

Set on `.reveal-stage` from Astro: `style={`--plate-w: ${detail.plate.width}; --plate-h: ${detail.plate.height};`}`.

Caption: pin lightly under stage or sit at bottom of sticky stage as muted one-liner — keep readable; do not cover the plate center.

- [ ] **Step 2: Reduced motion**

```css
html[data-motion='reduce'] .record-page--scrub .reveal-runway,
@media (prefers-reduced-motion: reduce) {
	.record-page--scrub .reveal-runway {
		height: auto;
	}
	.record-page--scrub .reveal-stage {
		position: relative;
		height: auto;
		min-height: unset;
	}
}
```

Settled visuals (plate opacity 1, upright hidden, mark-graphics opacity 1) must apply without JS tween — mirror today’s `.is-settled` rules onto scrub stages when `data-motion` is reduce.

- [ ] **Step 3: Ensure Legacy split CSS untouched**

Do not change `.record-split` / `.record-object` sticky column rules except scoping any scrub overrides under `.record-page--scrub`.

- [ ] **Step 4: Commit**

```bash
git add src/styles/global.css src/pages/records/[id].astro
git commit -m "style(records): sticky fullscreen reveal runways"
```

---

### Task 3: Scroll → progress mapping + visual apply

**Files:**
- Modify: `src/pages/records/[id].astro` `<script>`
- Optional Create: `src/data/scrub.ts` if the page script grows unwieldy (preferred if >~200 new lines)

**Interfaces:**
- Consumes: runway DOM; upright `data-crop-*`; plate size
- Produces:

```ts
/** Map chapter scroll into [0,1]. */
export function chapterProgress(runway: HTMLElement): number;

/** Piecewise visual state from p. */
export function scrubVisual(p: number): {
  cropT: number; // 0..1 within crop segment
  plateOpacity: number;
  uprightOpacity: number;
  boxesOpacity: number;
};

export const SCRUB_KEYS = [0, 0.55, 0.75, 1] as const;
```

- [ ] **Step 1: Implement pure helpers (TDD-friendly)**

If the repo has no unit test runner for TS helpers, put helpers in `src/data/scrub.ts` and verify with a tiny node assert script, or document manual checks. Prefer:

```ts
export const SCRUB_KEYS = [0, 0.55, 0.75, 1] as const;

export function chapterProgress(runway: HTMLElement): number {
  const rect = runway.getBoundingClientRect();
  const total = runway.offsetHeight - window.innerHeight;
  if (total <= 0) return 1;
  const scrolled = -rect.top;
  return Math.min(1, Math.max(0, scrolled / total));
}

export function scrubVisual(p: number) {
  if (p <= 0.55) {
    const cropT = p / 0.55;
    return { cropT, plateOpacity: 0, uprightOpacity: 1, boxesOpacity: 0 };
  }
  if (p <= 0.75) {
    const t = (p - 0.55) / 0.2;
    return { cropT: 1, plateOpacity: 1, uprightOpacity: 0, boxesOpacity: t };
  }
  return { cropT: 1, plateOpacity: 1, uprightOpacity: 0, boxesOpacity: 1 };
}

export function nearestKeyframe(p: number, keys: readonly number[] = SCRUB_KEYS): number {
  return keys.reduce((best, k) => (Math.abs(k - p) < Math.abs(best - p) ? k : best));
}
```

Crossfade: when `p` crosses 0.55, set plate opacity 1 and upright 0 immediately (or 0.55–0.58 short blend). Boxes fade 0.55→0.75.

- [ ] **Step 2: Apply crop geometry from `cropT`**

Reuse the contain→cropped math from today’s `runTimeline` (containScale / cropScale / left/top/width/height). Interpolate linearly by `cropT` between contain box and cropped box. Drive via direct `style.left/top/width/height` (and opacities), **not** `Element.animate` timelines.

- [ ] **Step 3: Wire scroll listener**

```ts
function bindScrub(runway: HTMLElement): void {
  const upright = runway.querySelector<HTMLImageElement>('.upright');
  const plate = runway.querySelector<HTMLImageElement>('.plate');
  const graphics = runway.querySelector<SVGGElement>('.mark-graphics');
  if (!upright || !plate) return;

  const apply = () => {
    const p = chapterProgress(runway);
    const v = scrubVisual(p);
    // set upright geometry from v.cropT …
    upright.style.opacity = String(v.uprightOpacity);
    plate.style.opacity = String(v.plateOpacity);
    if (graphics) graphics.style.opacity = String(v.boxesOpacity);
  };

  let ticking = false;
  const onScroll = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      ticking = false;
      apply();
    });
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  apply();
}
```

Call `bindScrub` for each `.reveal-runway` when `data-motion === 'ok'`. Otherwise force settled end state (`p = 1`) once.

- [ ] **Step 4: Delete autoplay path**

Remove `runTimeline`, `playReveal`, and the IntersectionObserver that auto-starts them for scrub pages. Keep `position()` / leader stacking for callout notes when `data-notes === 'aligned'` (still deferred for mhjl329 without notes — keep code path).

- [ ] **Step 5: Manual verify**

Open `/records/mhjl329/` after `npm run build` + preview (or `npm run dev`). Scroll down: upright crops toward plate; boxes fade; scroll up reverses. Legacy record e.g. one without upright still uses split layout.

- [ ] **Step 6: Commit**

```bash
git add src/pages/records/[id].astro src/data/scrub.ts
git commit -m "feat(records): scroll-linked scrub replaces reveal autoplay"
```

---

### Task 4: Soft-snap on idle

**Files:**
- Modify: `src/data/scrub.ts` and/or page script

**Interfaces:**
- Consumes: `nearestKeyframe`, `chapterProgress`
- Produces: idle snap that scrolls the window so chapter `p` lands on nearest keyframe

- [ ] **Step 1: Map keyframe → target scrollY**

```ts
export function scrollYForProgress(runway: HTMLElement, p: number): number {
  const total = runway.offsetHeight - window.innerHeight;
  const top = window.scrollY + runway.getBoundingClientRect().top;
  return top + p * Math.max(0, total);
}
```

- [ ] **Step 2: Idle detection + short ease**

On `scroll` end (150–200ms debounce with no new scroll events), if pointer/touch not down:

```ts
const p = chapterProgress(runway);
const target = nearestKeyframe(p);
if (Math.abs(target - p) < 0.02) return;
const y = scrollYForProgress(runway, target);
window.scrollTo({ top: y, behavior: 'smooth' });
```

Only snap the **active** runway (the one whose rect intersects the viewport sticky band). Do not snap multiple chapters in one idle tick.

- [ ] **Step 3: Verify**

Stop scrolling near crop end — should settle near p≈0.55. Near boxes-on — ≈0.75. Active wheel must not stutter.

- [ ] **Step 4: Commit**

```bash
git add src/data/scrub.ts src/pages/records/[id].astro
git commit -m "feat(records): soft-snap scrub to crop/boxes keyframes"
```

---

### Task 5: Acceptance pass + PR

**Files:** none new; verify only

- [ ] **Step 1: Run checks**

```bash
npm run check && npm run build
```

Expected: PASS.

- [ ] **Step 2: Acceptance checklist (spec)**

1. `/records/mhjl329/` — reversible scrub through label chapter.  
2. Second reveal (腰封/cover) — after first runway, next chapter pins.  
3. Soft-snap near crop-complete and boxes-complete.  
4. `data-motion=reduce` — no tall runway; final plate + boxes; story below.  
5. A Legacy-only record — unchanged split layout; no scrub classes.  
6. Autoplay gone on scrub records.

- [ ] **Step 3: Open PR**

Title: `feat(records): sticky scroll-scrub reveal chapters`  
Body: link the design spec; note autoplay removed; asset protocol unchanged.

---

## Spec coverage self-check

| Spec item | Task |
|-----------|------|
| Sticky fullscreen + sequential chapters | 1–2 |
| Full pipeline progress mapping | 3 |
| Soft-snap | 4 |
| 题铭 → chapters → 记述/著录 | 1 |
| Native sticky, no library | Global + 2–3 |
| reduced-motion | 2 + 3 |
| Legacy unchanged | 1 |
| Remove autoplay | 3 |
| Leaders/notes deferred | 3 (keep hooks, no new note work) |
| Acceptance on mhjl329 | 5 |

## Out of scope (do not implement here)

- `marks.note` / leader editorial align  
- Tombstone / list crop / loupe  
- Changing export pipeline or upright assets  
