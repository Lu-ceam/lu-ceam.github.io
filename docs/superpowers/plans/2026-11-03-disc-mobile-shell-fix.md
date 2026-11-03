# Disc mobile shell fix Implementation Plan

> **For agentic workers:** Use `executing-plans` / `subagent-driven-development`. Mid-flight note: implementation branch `disc-mobile-shell-fix` already mixed chrome+cover WIP before this plan landed; finish on that branch (serial), do **not** open a second writer on the same paths. Future tickets cut lanes from Task 0 as below.

**Goal:** Narrow disc shell P0: thin chapter rail (≤36px / ≤12% vv, row labels), map compact thin title + unclipped controls, all `revealDetails` sides inside record chapter with zoom following the active face. Open PR from baseline `1db2e83`. Desktop ≥48rem zero regression.

**Handoff:** `/home/box/web-layout/handoff-records-disc-mobile-shell-fix.md`  
**Acceptance:** `/home/box/web-layout/acceptance-disc-mobile-shell.md`

**Architecture:** Task 0 freezes cover-side helpers, DOM hooks, and chrome CSS tokens. Then two write-set lanes from that commit: **Lane chrome** (rail + map compact CSS + source asserts) and **Lane cover** (astro multi-face markup, reader zoom/side switch, helper unit tests). Integration = full `npm test` disc-chapters + `npm run check` + PR.

**Tech Stack:** Astro, vanilla TS reader, CSS custom properties, `node:test`.

**Checked against:** `main` / baseline `1db2e83` (#162).

## Contracts (Task 0)

Exports (`src/data/disc-chapters.ts`):

```ts
export const COVER_PART_LABELS: Readonly<Record<string, string>>;
export type CoverSideInput = { part: string; caption?: string; face?: string };
export type CoverSide = CoverSideInput & { index: number; label: string; caption: string; face: string };
export function coverSideLabel(input: CoverSideInput, index?: number): string;
export function coverSides(details: readonly CoverSideInput[]): CoverSide[];
export function needsCoverSides(details: readonly unknown[]): boolean;
```

DOM hooks (writer → reader):

| Hook | Writer | Reader |
|------|--------|--------|
| `[data-cover-side]` on side buttons / face roots | `[id].astro` record chapter only | `disc-chapter-reader.ts` switch + assert other chapters count=0 |
| `[data-cover-face]` face panel | `[id].astro` | reader shows one `.is-on`, resets zoom |
| `[data-cover-frame]` / `[data-cover-img]` | per face | `wireCoverZoom` on **active** face only |

CSS tokens (Task 0 sets initials; Lane chrome owns final chrome values):

- `--disc-chapter-rail-h` ≤ `36px` (no safe-area)
- `--disc-map-stage-min` ≤ `44dvh` (floor, not map ceiling)
- Forbidden: compact `.traj-title { display: none }`; rail `padding` as `.45rem + env(safe-area-inset-bottom)` stacked

## Lanes (from Task 0; sibling reviews do not gate)

| Lane | files_in_scope | Does |
|------|----------------|------|
| chrome | `src/styles/global.css` (rail + `.disc-chapter-map` compact only), `src/data/disc-chapters.source.test.ts` | A+B: row rail, safe-area, thin title, control fit, svh/dvh |
| cover | `src/data/disc-chapters.ts`, `src/data/disc-chapters.test.ts`, `src/pages/records/[id].astro`, `src/data/disc-chapter-reader.ts`, `src/styles/global.css` **only** `.disc-record-sides` / `.disc-record-side*` / `.disc-record-face*` | C: all sides, switch, zoom follows face |

**Scope rule:** `global.css` is shared → chrome owns map/rail sections; cover owns only `.disc-record-*` side/face blocks. Do not both edit the same rule set. If a ticket cannot keep those sections disjoint, collapse to one lane.

**Serial:** none beyond Task 0 → lanes → one integration PR.

## Global Constraints

- Desktop ≥48rem unchanged.
- No marks/export field renames; no fake copy.
- No thick stacked Tab / big capsule rail.
- Map `.traj-blurb` stays visible (v2 P0).
- PASS gates from acceptance §A (rail/vv, no bare `100vh` shell, controls in chapter box, `[data-cover-side]` only in record chapter).
- Do not merge; coding lead squash only after layout PASS + CI green (站长改规 2026-11-03).

## Mid-flight on `disc-mobile-shell-fix`

Already dirty before plan: helpers + chrome CSS + astro multi-face markup; reader still needs active-side zoom. **Finish remaining on this branch (one writer).** Do not `zs-wt ensure` a second cover lane against the same dirty paths. After PR, next shell tickets start with Task 0 commit then true parallel worktrees.

## Acceptance / Report

1. Tests for coverSides / rail token / compact title not `display:none` / cover-side only in record chapter.
2. `npm test -- src/data/disc-chapters` (+ related) green; `npm run check` if feasible.
3. PR URL + head sha; no merge by worker.
