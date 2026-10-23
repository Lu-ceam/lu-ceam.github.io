# Records list → detail page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep `/records/` as a catalog list; each row navigates to `/records/<id>/` where plates + wall-text 记述 live in a split (desktop) object layout.

**Architecture:** Add `src/pages/records/[id].astro` with `getStaticPaths` from existing `records`. Convert list rows from `<details>` expand panels into linked rows that preserve filter `data-*` attributes. Move entry chrome (hero, details grid, props, story, folds) onto the detail page; style with new CSS for split layout and stronger 记述 tokens. No `records.json` schema changes.

**Tech Stack:** Astro 7, TypeScript, existing `src/data/records.ts`, `src/styles/global.css`, GitHub Pages static build (`npm run build`).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-10-24-records-detail-page-design.md` (approved).
- Navigate-only list (no in-row expand). URL `/records/<id>/` using `record.id`.
- Detail skeleton B: desktop left sticky plates / right scroll text (tombstone → 记述 → 著录 → folds); mobile stacks.
- 记述: 1.18rem / line-height 1.85 / max-width ~34em / full `--text`; omit 「记述」 heading.
- Same CJK sans; warm paper + wine tokens; no serif island, thin rules, drop caps, eyebrows, paper shadow cards.
- Preserve contracts: `data-*` filters, `badgeClass`, `showMatrix` / `showPressing`, image path rules, no prices; public 纹尾／内圈刻字.
- Content: do not rewrite `story` prose (唱片管理员 owns it).
- Verify with `npm run check` and `npm run build` before claiming done.

## File map

| File | Role |
|---|---|
| `src/pages/records/[id].astro` | **Create** — detail page (object + wall text) |
| `src/pages/records.astro` | **Modify** — list rows become links; remove expand entry + hash-open; update no-JS hint |
| `src/styles/global.css` | **Modify** — list row-as-link styles; detail split layout; `.record-story` tokens; retire list `.entry`/`.story` dependence or scope to detail |
| `docs/superpowers/specs/2026-10-24-records-detail-page-design.md` | Already added (PR #8) — do not rewrite unless conflict |

Optional extract (only if `[id].astro` would duplicate too much markup): `src/components/RecordProps.astro` — YAGNI first; inline once, extract only if both pages need the same dl.

---

### Task 1: Detail page route + tombstone shell

**Files:**
- Create: `src/pages/records/[id].astro`
- Test: `npm run check` / `npm run build`

**Interfaces:**
- Consumes: `records`, `paragraphs`, `heroAlt`, `badgeClass`, `showMatrix`, `showPressing` from `../data/records` (adjust relative path: from `src/pages/records/[id].astro` use `../../data/records`)
- Produces: static routes `/records/<id>/` for every `record.id`

- [ ] **Step 1: Create the detail page with getStaticPaths and shell**

```astro
---
import Base from '../../layouts/Base.astro';
import {
	badgeClass,
	heroAlt,
	paragraphs,
	records,
	showMatrix,
	showPressing,
	type VinylRecord,
} from '../../data/records';

export function getStaticPaths() {
	return records.map((record) => ({
		params: { id: record.id },
		props: { record },
	}));
}

const { record } = Astro.props as { record: VinylRecord };
const title = `${record.work} · ${record.catalogNumber}`;
---

<Base title={title} description={record.photo} wide>
	<article class="record-page" data-record-id={record.id}>
		<p class="record-back">
			<a href="/records/">← 目录</a>
		</p>
		<div class="record-split">
			<div class="record-object">
				{/* Task 2 fills plates */}
			</div>
			<div class="record-text">
				<header class="record-tombstone">
					<h1>{record.work}</h1>
					<p class="record-tombstone-meta">
						<span>{record.artist}</span>
						<span aria-hidden="true"> · </span>
						<span>{record.label}</span>
						<span aria-hidden="true"> · </span>
						<span>{record.catalogNumber}</span>
						<span aria-hidden="true"> · </span>
						<span>{record.year ?? record.decade}</span>
						<span class={badgeClass(record.status)}>{record.status}</span>
					</p>
				</header>
				{/* Task 3: story + props + folds */}
			</div>
		</div>
	</article>
</Base>
```


- [ ] **Step 2: Run check**

Run: `npm run check`  
Expected: no errors for the new page (empty columns ok temporarily).

- [ ] **Step 3: Commit**

```bash
git add src/pages/records/\[id\].astro
git commit -m "feat(records): add /records/[id] detail route shell"
```

---

### Task 2: Plates column (hero + evidence grid)

**Files:**
- Modify: `src/pages/records/[id].astro` — fill `.record-object`
- Modify: `src/styles/global.css` — `.record-split`, `.record-object` sticky

**Interfaces:**
- Consumes: `record.image`, `record.photo`, `record.detailsNote`, `record.details[]`, `heroAlt(record)`
- Produces: left column markup used by Task 4 visual QA

- [ ] **Step 1: Fill left column markup** (reuse current list entry figure patterns)

Inside `.record-object`:

```astro
<figure class="entry-hero">
	<img
		src={record.image.src}
		width={record.image.width}
		height={record.image.height}
		alt={heroAlt(record)}
		decoding="async"
		fetchpriority="high"
	/>
	<figcaption>{record.photo}</figcaption>
</figure>
<p class="meta">{record.detailsNote}</p>
<div class="detail-grid">
	{record.details.map((detail) => (
		<figure>
			<img
				src={detail.image.src}
				width={detail.image.width}
				height={detail.image.height}
				alt={detail.alt}
				decoding="async"
				loading="lazy"
			/>
			<figcaption>{detail.caption}</figcaption>
			<p class="detail-text">{detail.text}</p>
		</figure>
	))}
</div>
```

- [ ] **Step 2: Add split + sticky CSS** in `global.css`

```css
.record-page {
	margin: 0 auto;
}

.record-back {
	margin: 0 0 1rem;
	font-size: 0.92rem;
}

.record-back a {
	color: var(--muted);
	text-decoration: none;
}

.record-back a:hover {
	color: var(--text);
	text-decoration: underline;
	text-underline-offset: 0.22em;
}

.record-split {
	display: grid;
	gap: 1.5rem 2rem;
}

@media (min-width: 48rem) {
	.record-split {
		grid-template-columns: minmax(0, 0.95fr) minmax(0, 1.15fr);
		align-items: start;
	}

	.record-object {
		position: sticky;
		top: 1rem;
	}
}

.record-tombstone h1 {
	margin: 0 0 0.35rem;
	font-size: clamp(1.35rem, 2vw, 1.5rem);
	font-weight: 600;
	line-height: 1.3;
	letter-spacing: -0.02em;
}

.record-tombstone-meta {
	margin: 0 0 1.4rem;
	color: var(--muted);
	font-size: 0.92rem;
	line-height: 1.5;
	display: flex;
	flex-wrap: wrap;
	align-items: baseline;
	gap: 0.25rem 0.15rem;
}

.record-tombstone-meta .badge {
	margin-left: 0.35rem;
}
```

- [ ] **Step 3: Build**

Run: `npm run build`  
Expected: `dist/records/<id>/index.html` exists for each record id (e.g. `falp381`, `d37779`).

- [ ] **Step 4: Commit**

```bash
git add src/pages/records/\[id\].astro src/styles/global.css
git commit -m "feat(records): detail page plates column with sticky split"
```

---

### Task 3: 记述 + 著录 + folds on detail

**Files:**
- Modify: `src/pages/records/[id].astro` — fill `.record-text` after tombstone
- Modify: `src/styles/global.css` — `.record-story` tokens; quiet 著录 under detail

**Interfaces:**
- Consumes: `record.story`, props fields, `record.links`, `record.evidence`, `record.need`, `record.needLead`, `paragraphs`, `showMatrix`, `showPressing`
- Produces: wall-text reading column matching spec tokens

- [ ] **Step 1: Add story, props, folds** (no 「记述」 h3)

```astro
<div class="record-story">
	{paragraphs(record.story).map((paragraph) => (
		<p>{paragraph}</p>
	))}
</div>

<h2 class="record-props-label">著录</h2>
<dl class="props">
	<dt>艺人</dt>
	<dd>{record.artist}</dd>
	<dt>作曲家</dt>
	<dd>{record.composer}</dd>
	<dt>作品</dt>
	<dd>{record.work}</dd>
	<dt>厂牌</dt>
	<dd>{record.label}</dd>
	<dt>目录号</dt>
	<dd>{record.catalogNumber}</dd>
	{showMatrix(record) && record.matrix && (
		<>
			<dt>内圈刻字</dt>
			<dd>{record.matrix}</dd>
		</>
	)}
	{showPressing(record) && record.pressing && (
		<>
			<dt>压片</dt>
			<dd>{record.pressing}</dd>
		</>
	)}
	<dt>录音</dt>
	<dd>{record.recording}</dd>
	<dt>品相</dt>
	<dd>{record.condition}</dd>
	<dt>均衡</dt>
	<dd>{record.eq}</dd>
	<dt>状态</dt>
	<dd>{record.status}</dd>
	{record.year !== undefined && (
		<>
			<dt>年份</dt>
			<dd>{record.year}</dd>
		</>
	)}
</dl>

<details class="fold">
	<summary>出处</summary>
	<ul class="link-cards">
		{record.links.map((link) => (
			<li>
				<a href={link.href} target="_blank" rel="noopener noreferrer">
					<span class="link-title">{link.title}</span>
					<span class="link-site">{link.site}</span>
				</a>
			</li>
		))}
	</ul>
</details>
<details class="fold">
	<summary>证据核对</summary>
	<div class="fold-body">{record.evidence}</div>
</details>
<details class="fold">
	<summary>
		待补拍<span class="fold-lead"> · {record.needLead}</span>
	</summary>
	<div class="fold-body">{record.need}</div>
</details>
```

- [ ] **Step 2: Story + props-label CSS**

```css
.record-story {
	max-width: 34em;
	margin: 0 0 1.6rem;
	color: var(--text);
	font-size: 1.18rem;
	font-weight: 400;
	line-height: 1.85;
}

.record-story p {
	margin: 0.95em 0;
}

.record-story p:first-child {
	margin-top: 0;
}

.record-story p:last-child {
	margin-bottom: 0;
}

.record-props-label {
	margin: 0.4rem 0 0.22rem;
	color: var(--muted);
	font-size: 0.78rem;
	font-weight: 500;
	line-height: 1.35;
}

.record-text .fold {
	margin-top: 0.35rem;
	border: 0;
	border-top: 1px solid var(--line);
	background: transparent;
}

.record-text .fold:last-child {
	border-bottom: 1px solid var(--line);
}
```

Note: folds already use `border-top` in list CSS via `.entry .fold`; scoping under `.record-text` is fine. Do **not** add decorative left hairlines on `.record-story`.

- [ ] **Step 3: Build + spot-check HTML**

Run: `npm run build`  
Then: `rg -n "record-story|记述" dist/records/falp381/index.html`  
Expected: `record-story` present; no bare 「记述」 heading in the text column (著录 heading ok).

- [ ] **Step 4: Commit**

```bash
git add src/pages/records/\[id\].astro src/styles/global.css
git commit -m "feat(records): wall-text 记述 and quiet 著录 on detail page"
```

---

### Task 4: List navigate-only (remove expand)

**Files:**
- Modify: `src/pages/records.astro` — replace `<details class="catalog-item">` with linked row; update hint + script
- Modify: `src/styles/global.css` — row link styles; remove or leave unused `.entry`/list `.story` rules (safe to keep unused for now, or delete dead list-entry rules in same commit if grep-clean)

**Interfaces:**
- Consumes: same `data-*` attributes for filter script
- Produces: each row is an `<a class="catalog-item">` (or article+link) to `/records/${record.id}/`

- [ ] **Step 1: Replace details/summary with anchor row**

For each record, use a single link styled as the grid row (preserve columns):

```astro
<a
	class="catalog-item"
	id={record.id}
	href={`/records/${record.id}/`}
	data-record
	data-status={statusBucket(record.status)}
	data-composer={record.composer}
	data-artist={record.artist}
	data-label={record.label}
	data-decade={record.decade}
	data-search={recordSearchText(record)}
>
	<span class="c-cat">{record.catalogNumber}</span>
	<span class="c-status">
		<span class={badgeClass(record.status)}>{record.status}</span>
	</span>
	<span class="c-work">{record.work}</span>
	<span class="c-meta">
		<span class="c-artist">{record.artist}</span>
		<span class="c-label">{record.label}</span>
		<span class="c-decade">{record.decade}</span>
	</span>
</a>
```

Remove the entire `.entry` block from the list.

- [ ] **Step 2: Update CSS so `.catalog-item` works as a grid link**

Adapt existing `.catalog-item > summary` grid rules to `.catalog-item` itself:

- `display: grid` with the same columns as before
- `text-decoration: none; color: inherit`
- `min-height: 44px; padding: …`
- hover background `var(--bg-elevated)`
- Remove `::before` chevron (no expand)
- Update mobile `@media (max-width: 64rem)` selectors from `.catalog-item > summary …` to `.catalog-item …`
- Delete rules that only applied to `[open] > .entry` if unused

- [ ] **Step 3: Update inline script**

- Keep `apply()` filter logic (`[data-record]` + `hidden`).
- Replace `openHash()`: if `location.hash` matches an id, `location.replace('/records/' + id + '/')` (or assign `href`).
- Remove `toggle` listeners that wrote `#id` into history.
- Remove `hashchange` open-details behavior (redirect once on load is enough).

- [ ] **Step 4: Update no-JS hint copy**

Change the hint under the catalog to something like:  
`不启用 JavaScript 时会显示全部藏品。点一行打开该压片的单独页面。`

- [ ] **Step 5: Build + grep**

Run: `npm run build`  
Run: `rg -n "<details" dist/records/index.html`  
Expected: no catalog-item details (folds only exist on detail pages, not list).  
Run: `rg -n 'href="/records/' dist/records/index.html | head`  
Expected: links to each id.

- [ ] **Step 6: Commit**

```bash
git add src/pages/records.astro src/styles/global.css
git commit -m "feat(records): list rows navigate to detail pages"
```

---

### Task 5: Visual QA + acceptance gate

**Files:**
- None required (screenshots optional under `/workspace` or PR artifacts)

- [ ] **Step 1: Preview or open built pages**

Run: `npm run preview` (or open `dist/`)  
Check at desktop (~1280) and narrow (~390):

1. `/records/` — rows link; filters still hide/show; no expand panel
2. `/records/falp381/` (or 贝九) — sticky plates + 记述 readable; 著录 quieter; folds collapsed
3. One rewritten story entry (e.g. `d37779` / `ml4001`) — prose renders with paragraph breaks
4. Dark theme toggle still coherent

- [ ] **Step 2: Spec checklist**

Confirm against design spec acceptance:

- [ ] Every record has `/records/<id>/`
- [ ] List navigate-only
- [ ] Desktop sticky split; mobile stack
- [ ] 记述 1.18rem / 1.85 / ~34em; no 「记述」 label
- [ ] `npm run check` + `npm run build` pass
- [ ] No museum-serif / hairline / drop-cap costume

- [ ] **Step 3: Open PR** (cloud agent) with summary + before/after notes; do not claim merge until human or standing auth.

```bash
# After push, open PR titled e.g.
# feat(records): list → per-record detail pages with wall-text 记述
```

---

## Spec coverage (self-review)

| Spec requirement | Task |
|---|---|
| List stays; navigate-only | Task 4 |
| `/records/<id>/` | Task 1 |
| Split B sticky plates | Task 2 |
| Tombstone → 记述 → 著录 → folds | Task 3 |
| 记述 tokens; omit 记述 heading | Task 3 |
| Preserve data contracts / badges / matrix gates | Tasks 2–3 (reuse helpers) |
| Hash deep-link → detail | Task 4 script |
| Build + visual acceptance | Task 5 |

No placeholders left. Types: `VinylRecord`, `getStaticPaths` props `{ record }`.
