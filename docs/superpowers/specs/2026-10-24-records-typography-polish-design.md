# Design: 记述 density and narrow-list rhythm

Date: 2026-10-24  
Site: https://lu-ceam.github.io (Astro)  
Status: locked by Rolf 2026-10-24. Replaces the uniform 记述 size, line-height, and paragraph gap in `2026-10-24-records-detail-page-design.md`.

## Problem

Two surfaces, one workstream.

On `/records/<id>/`, 记述 is too open to read straight through. The detail-page spec set one size for every paragraph (**1.18rem**), line-height **1.85**, and about **0.95em** between paragraphs. That column floats. The first sentence has no hierarchy, and half the stories are still one block — `falp381`, `mhjl329`, `ll912` — so on a phone the gap never appears. MHJL 329 is the reference: tombstone, then one unbroken wall.

Density reference, measured on the collection canvas at `https://quiet-zephyr-rvrxsg.pages.grok.bot/` (「黑胶藏品目录」): body prose **16px = that page's 1rem**, weight 400, line-height **24px = 1.5**, letter-spacing **0.1px**, with no large lead jump. Borrow that size and leading only. This catalog's root is `112.5%`, so the tokens below stay in **rem** and track the page; do not hard-code 16px. Do not copy the canvas measure (about 72rem), its `#141414` ink, or a different typeface.

On `/records/` at a narrow width, row text does not share a left edge. Artist, 厂牌, and 年代 step inward, and the decade middot reads as an indent. Catalog sits left and status sits right; with a short number the middle of that row is empty. The work title should stay the strongest line.

## Verdict

**Do not use LaTeX, Typst, or a PDF engine.** Do not set 记述 with MathJax or KaTeX, and do not embed Prince or WeasyPrint output. TeX is built for Latin hyphenation, mathematics, and microtype. Those tools do not set CJK exhibition-wall prose on a static Astro catalog. The fix is CSS on `.record-story`, plus blank lines in `story` so the existing `paragraphs()` helper can emit `<p>` elements.

## Goals

1. 记述 reads at the canvas density: body **1rem / 1.5**, denser and more continuous than 1.18rem / 1.85 / ~0.95em, and denser than an airy gallery caption. Not newspaper-tight.
2. The first paragraph is only a modest step up (**1.0625rem**, weight 500). Same CJK sans. Not a second face, not a drop cap.
3. CJK spacing, punctuation trim, and strict line breaking apply on `.record-story`.
4. `falp381`, `mhjl329`, and `ll912` gain intentional `\n\n` splits so the lead and the gap are visible, especially on mobile.
5. Narrow list rows share one left edge, stack status under the catalog when the row is tight, and keep a quieter rhythm under the title. Navigate-only stays.

## Non-goals

- LaTeX, Typst, MathJax/KaTeX for this prose, Prince, WeasyPrint, or a PDF embed
- Drop caps, a second typeface, serif islands, hairline rails, paper-shadow cards, a 「记述」 label
- Desktop list redesign, card chrome, or an information-architecture change
- Restoring the in-row expand panel
- Rewriting story sentences. Blank lines only.
- Putting the long `pressing` 著录 paragraph on the list row

## Decisions (locked with Rolf)

| Decision | Choice |
|---|---|
| Engine | CSS + `paragraphs()`. No TeX toolchain |
| Body | **1rem** / weight **400** / line-height **1.5** / letter-spacing **0.1px** |
| Measure | **34em** on the desktop split; full column below 48rem |
| Lead (`p:first-child`) | **1.0625rem** / weight **500** / line-height **1.45** |
| Paragraph gap | **`p + p` margin-top: 1em** |
| Language | `lang="zh-Hans"` on `.record-story` |
| CJK microtype | `text-autospace: normal`; `text-spacing-trim: normal`; `line-break: strict`; `text-wrap: pretty` |
| `text-spacing-trim` fallback | `@supports not (text-spacing-trim: normal)` → `font-feature-settings: "halt" 1` |
| List IA | Navigate-only, unchanged |
| Narrow list | One left edge; catalog left / status right until **40rem**, then status stacks under catalog |
| Secondary list line | 厂牌 · 年代, inline middot, no decade indent |
| Aesthetic | Thrill Jockey / Ninja Tune / Erstwhile flat modern; warm paper + wine; one CJK sans |

## What the detail-page spec still owns

Navigate-only `/records/`, URL `/records/<id>/`, skeleton B (desktop sticky plates, mobile stack), reading order tombstone → 记述 → quiet 著录 → collapsed 出处 / 证据 / 待补, no 「记述」 heading, existing tokens for paper and wine, public wording 纹尾 / 内圈刻字, no prices. This document replaces only the 记述 size, line-height, and paragraph gap, then adds the lead, the microtype, the required blank lines, a slightly tighter tombstone-to-记述 spacer on small screens, and the narrow-list rhythm.

## 记述 (`.record-story`)

The page sans stays the one already on `body` (PingFang SC / Noto Sans CJK SC / Source Han Sans SC / …). No new `@font-face`. Color is `var(--text)`.

`<html>` is already `lang="zh-CN"`. The story element sets `lang="zh-Hans"` so the reading column carries an explicit Simplified Chinese tag. Inheriting `zh-CN` would also be Simplified Chinese; the attribute is set so the column does not depend on that.

| Token | Value |
|---|---|
| Box | `.record-story` |
| Body size | `1rem` |
| Body weight | `400` |
| Body line-height | `1.5` |
| Tracking | `letter-spacing: 0.1px` on `.record-story` (the lead inherits it) |
| Measure | `max-width: 34em` from 48rem up; `max-width: none` below 48rem |
| Lead | `p:first-child` — `1.0625rem` / `500` / `1.45` |
| Gap | `p + p { margin-top: 1em }` |
| Autospace | `text-autospace: normal` |
| Punctuation trim | `text-spacing-trim: normal` |
| Trim fallback | `font-feature-settings: "halt" 1` only inside `@supports not (text-spacing-trim: normal)` |
| Line break | `line-break: strict` |
| Wrap | `text-wrap: pretty` |

`1em` is the following paragraph's em (body is `1rem`). Use margin on `p + p` only, so the gap is exactly 1em and not two stacked margins. The first paragraph has no extra margin above it. `0.1px` is the measured canvas tracking; do not rewrite it as `0.00625em`, which would grow with this site's 112.5% root.

`text-wrap`, `text-autospace`, and `text-spacing-trim` may be ignored where a browser does not implement them. That is not a failure. The `halt` fallback runs only when `text-spacing-trim: normal` is unsupported. `line-break: strict` is already on `html`; repeat it on `.record-story`.

### Tombstone → 记述

Desktop keeps the tombstone meta bottom margin at **1.4rem**. Below 48rem, that margin is **0.7rem**, so the jump into the denser 1.5 column is not a second airy band. The order of the page does not change, and no heading appears between them.

### Content contract

`paragraphs()` in `src/data/records.ts` stays as it is: split on `\n\n+`, trim, drop empties.

These three `story` strings are one paragraph today. Each becomes 2–4 paragraphs by inserting `\n\n` at the breaths below. Joined back with the blank lines removed, the prose is the same string as before.

| id | Paragraphs | Breaks (prose unchanged) |
|---|---|---|
| `falp381` | 4 | 1951 opening and Furtwängler; EMI recording through the 1956 booklet and Grand Prix; matrix, printed date, rehearsal vs concert; later French issues and this copy |
| `mhjl329` | 3 | the 1988 album through the session credit; the jazz years through the 40th-anniversary idea; the MHJL 329 object in hand |
| `ll912` | 4 | the 1953 Concertgebouw session; Kleiber's path back to Decca; London LL 912 and ffrr; sleeve dating, the last year, and the pencil / tape on this copy |

`ml4001`, `mg50370`, and `d37779` already contain blank lines. Leave them.

## Narrow list (`/records/`)

Each row is a link to `/records/<id>/`. Filters, progress, and `data-*` hooks stay. There is no `<details>` expand and no chevron.

Desktop (wider than 64rem) keeps the four text columns: 目录号, 状态, 作品, 演奏者 · 厂牌 · 年代. Dropping the disclosure marker and its 1.25rem track is the navigate-only change. Do not retune desktop type, add cards, or restyle the filter block.

From `max-width: 64rem` down (the column head is already hidden):

1. **One left edge.** Catalog, title, artist, and the secondary block start on the same inline start. No chevron gutter, and no padding that steps artist, 厂牌, or 年代 inward.
2. **Catalog and status.** Above **40rem**, one row: catalog at the start, status at the end. At `max-width: 40rem`, status moves to the next line, still at the start edge, so a short number (MHJL 329, LL 912, ML 4001) does not leave an empty middle.
3. **Rhythm.** Work title is the strongest line (~1.02rem, weight 600). Artist is one quiet muted line of its own. Under it, 厂牌 · 年代 is a tighter secondary block (~0.8rem, line-height ~1.35).
4. **Decade middot.** The dot is an inline separator after 厂牌, not a `::before` bullet on `.c-decade`. A wrapped decade starts on the same left edge as the artist line.

The list secondary block is 厂牌 and 年代, the short fields already on the row. The long `pressing` sentence stays on the detail page under 著录. Review notes that say "label · pressing · decade" name this tighter cluster; they do not add a third list field.

## Acceptance

1. `/records/mhjl329/`, `/records/falp381/`, and `/records/ll912/` each render more than one `<p>` inside `.record-story`. The first paragraph is a modest step up, not a display line. The gap reads as a segment and stays dense.
2. Computed style on `.record-story`: `font-size` 1rem, `font-weight` 400, `line-height` 1.5, `letter-spacing` 0.1px, `color` the computed `--text` (not the canvas `#141414`). First `p`: 1.0625rem, 500, 1.45, same 0.1px tracking. Each following `p` has `margin-top` of 1em and the first has no extra top margin. `lang` is `zh-Hans`. Declared `text-autospace`, `text-spacing-trim`, `line-break`, and `text-wrap` match the table. Where `text-spacing-trim: normal` is unsupported, computed `font-feature-settings` includes `"halt" 1`.
3. The column is denser and more continuous than 1.18rem / 1.85 / 0.95em. It keeps the page CJK sans. It does not use the canvas width.
4. Below 48rem, `.record-story` is the full text column, and the tombstone-to-story gap is 0.7rem rather than 1.4rem.
5. At about 390px, list rows share one left edge; status sits under the catalog; the title is strongest; the artist is one line; 厂牌 · 年代 is one tighter block and the decade is not indented. Wider than 64rem, the list is still a column row, not cards.
6. No 「记述」 heading in the text column, no drop cap, no second face, no hairline or shadow on `.record-story`, no TeX toolchain.
7. Removing the inserted `\n\n` from `falp381`, `mhjl329`, and `ll912` restores the previous prose.
8. `npm run check` and `npm run build` pass.

## Out of scope follow-ups

- Previous / next record, related pressings, per-record OG images (still listed on the detail-page spec)
- A short 压片 epithet on the list row, if a later pass wants 厂牌 · 压片地 · 年代 as three short tokens
