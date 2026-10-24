# Design: /records/ list → per-record detail page (wall-text 记述)

Date: 2026-10-24  
Site: https://lu-ceam.github.io (Astro)  
Status: approved in chat (IA + sections 1–3); awaiting user review of this written spec before implementation plan

## Problem

记述 on the catalog expand panel still reads as a form field: same sans, only ~8% larger than body, continuous with 著录. Museum wall-label practice and museum *online* object pages both put interpretive text on a dedicated object surface next to the work—not inside a dense list expand.

## Goals

1. Keep `/records/` as the catalog **list** (progress, filters, row chrome largely unchanged).
2. **Navigate-only:** clicking a row opens a dedicated record page; no in-row `<details>` expand.
3. On the detail page, present 记述 as exhibition **wall text** (展墙说明), with plates sticky beside reading text on desktop.
4. Preserve locked aesthetic: Thrill Jockey / Ninja Tune / Erstwhile flat modern; warm paper + wine tokens; one CJK sans family (no serif island); no thin rules, eyebrows, drop caps, or decorative frames (design-taste-frontend house rules).
5. Content ownership unchanged: 唱片管理员 writes 记述; this work is IA + layout/CSS only. Data model (`records.json` / `records.ts`) stays.

## Non-goals

- Rewriting story prose
- Redesigning list filters/progress beyond making rows links
- Valuation, Discogs sync, or new record fields
- Dark-theme-only treatments; both themes keep existing tokens

## Decisions (locked with Rolf)

| Decision | Choice |
|---|---|
| List behavior | Navigate-only (no peek expand) |
| Detail skeleton | **B · split object page** |
| URL | `/records/<id>/` using existing `record.id` (matches `public/records/<id>/`) |
| Reading order (right column) | Tombstone → **记述** → quiet 著录 → collapsed 出处/证据/待补 |
| 「记述」section label | **Omit** (tombstone is enough navigation) |
| Sticky plates | Yes on desktop |

## Information architecture

### List (`/records/`)

- Remove `<details>` / open entry panel from each row.
- Entire row (or clear primary control) links to `/records/<id>/`.
- Progress, filters, closed-row columns (catalog, status, work, meta) stay.
- Optional: if old `#…` hash deep-links exist, redirect to the matching detail page when cheap; otherwise skip.

### Detail (`/records/[id].astro`)

- Static paths from `records` array (`getStaticPaths`).
- Document title: `{work} · {catalogNumber}`.
- Top: back link to `/records/` (preserve filter query if low-cost).
- Shell: `layout-wide`, existing Base layout / tokens.

## Detail layout (skeleton B)

### Desktop (≥ ~48rem)

Two columns:

**Left — object**

- Primary cover / hero image
- Evidence grid below (`details[]`: label, runout, etc.) with existing caption micro-layout
- Column `position: sticky` (top offset under header) so plates stay while reading

**Right — text** (scroll)

1. **Tombstone:** work title (~1.35–1.5rem / weight 600) + line of artist · label · catalog · decade/year · status badge
2. **记述:** main reading column (tokens below); no 「记述」 heading
3. **著录:** quiet props grid (existing quiet apparatus tone)
4. **Folds:** 出处 / evidence / 待补 — default collapsed; plain-language summaries

### Mobile

Single column: images → tombstone → 记述 → 著录 → folds. No sticky split.

## 记述 typography (detail page)

| Token | Value |
|---|---|
| Font | Inherit page sans (PingFang / Noto Sans CJK SC / …) |
| Size | **1.18rem** |
| Line-height | **1.85** |
| Measure | **~34em** max-width |
| Color | `var(--text)` full ink |
| Paragraph gap | ~0.95em between `p` |
| Forbidden | Drop cap; left hairline; paper shadow card; second typeface |

**Superseded for size and gap.** The uniform **1.18rem**, line-height **1.85**, and **~0.95em** paragraph gap in the table above are replaced by [记述 density and narrow-list rhythm](2026-10-24-records-typography-polish-design.md): body **1rem / 1.5 / letter-spacing 0.1px**, first sentence only at weight **600** (same size), adjacent paragraphs **1em**. That spec also sets the surrounding record type (tombstone, 著录, folds, list rows) so it stays in scale with that column, and it requires blank-line splits in `falp381`, `mhjl329`, `ll912`, and `lpbr6083`. This page still forbids a prose rewrite beyond those splits, and still forbids a second typeface, drop cap, hairline, and a 「记述」 label.

The old “著录 stays ~0.88rem” note is replaced by that spec (**0.82rem** values, quieter than 记述). List page no longer renders `.story`.

## Contracts to preserve

- `data-*` hooks, `badgeClass`, status buckets, `showMatrix` / `showPressing` gates
- Image path rules under `/records/<id>/…webp`
- No price/valuation fields
- Public Chinese: 纹尾 / 内圈刻字 (not 死蜡)

## Acceptance

1. Every record has a working `/records/<id>/` page; list rows navigate there.
2. List has no expand panel; filters/progress still work.
3. Desktop: plates stay visible while scrolling 记述; mobile stacks correctly.
4. 记述 reads as primary text (size/ink/measure); 著录 clearly secondary; folds collapsed by default.
5. `npm run build` passes; visual check on at least one entry with long story (e.g. FALP 381 / 贝九 or a newly rewritten story).
6. Aesthetic still matches flat catalog rulers (no museum-serif costume).

## Out of scope follow-ups

- Prev/next record navigation
- Related pressings
- Sharing / OG images per record (nice later)

## References (research)

- Museum wall labels: NMI Exhibition Guidelines–Labels; Te Papa He Rauemi; British Museum interpretation hierarchy; CMHR text hierarchy
- Online object pages: Met object-page UX (MW19); Cleveland Museum collection object pages (sticky image + scrolling text)
- Site rulers: Thrill Jockey / Ninja Tune / Erstwhile; prior `/workspace/records-story-research/`
