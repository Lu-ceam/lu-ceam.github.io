# Disc record chapter marks-only Implementation Plan

> **For agentic workers:** Use `executing-plans` / `subagent-driven-development`. Cut lanes only from the Task 0 commit. Same path → one writer.

**Goal:** Narrow disc: drop independent pre-disc fullscreen runway as the entry path; record chapter becomes large cover + mark elbow callouts (same reveal grammar), replacing `## 唱片` prose / description blocks. Open PR from baseline `59245b7`. Desktop ≥48rem zero regression. Coding lead squash after layout PASS + CI green.

**Handoff:** `/home/box/web-layout/handoff-records-disc-record-marks-only.md`  
**Acceptance:** `/home/box/web-layout/acceptance-disc-mobile-shell.md` (shell gates still apply) + handoff §D.

**Architecture:** Task 0 freezes hooks + “record chapter shows no prose” contract. Then preferably one write lane (astro + reader + chapters + CSS share `[id].astro`). Ideal split below only if scopes stay disjoint after Task 0; otherwise serial on this branch.

**Tech Stack:** Astro, vanilla TS reader, CSS, `node:test`.

**Checked against:** `origin/main` / baseline `59245b7` (#163).

## Contracts (Task 0)

### Behavior flags / helpers (`src/data/disc-chapters.ts`)

```ts
/** Narrow chapter shell: record pane is cover+marks, not markdown body. */
export function recordChapterIsMarksOnly(): boolean {
  return true;
}

/**
 * Whether the record chapter should render `sections` prose under the cover.
 * Marks-only → always false (even if buildDiscChapters still parses `## 唱片`).
 */
export function recordChapterRendersProse(_chapter?: { sections?: readonly unknown[] }): boolean {
  return false;
}
```

Keep existing `coverSides` / `COVER_PART_LABELS` / `wireCoverZoom` hooks from #163. Do **not** rename marks / export fields.

Optional soft (not required in Task 0): `buildDiscChapters` may leave `## 唱片` blocks in `record.sections` for data fidelity but UI must not paint them; or route them into `story` — prefer **hide in UI** this ticket (writing merge = soft / scout).

### DOM hooks

| Hook | Writer | Reader / gate |
|------|--------|----------------|
| `[data-disc-chapters]` shell | `[id].astro` | reader; narrow entry |
| `[data-chapter-kind=record]` + `[data-chapter-record-cover]` | `[id].astro` | `wireCoverZoom` |
| `[data-cover-side]` / `[data-cover-face]` / `[data-cover-frame]` / `[data-cover-img]` | record chapter only | #163 gate unchanged |
| Mark overlays inside record cover (same classes / structure as reveal: elbow / box + `mark.note`) | `[id].astro` record pane | visual + tests: present when marks exist |
| `data-chapter-prose` **absent** on record pane | `[id].astro` | assert no record prose article body |
| Narrow skip runway: `.camera-runway` not the entry path when chapters shell is used (hidden / zero-height / not first paint) | `[id].astro` + CSS `@media (max-width: 640px)` under chapter mode | handoff §A |

### CSS ownership

- Lane / serial: `@media (max-width: 640px)` rules that collapse or skip `.camera-runway` when `.disc-chapters` active; record chapter cover fills stage; no new thick caption card under cover.
- Do not change desktop (≥48rem) runway / split-stage behavior.

### Test fixtures

- Unit: `recordChapterRendersProse()` false; record chapter DOM fixture / source assert: no `## 唱片` sections rendered under `[data-chapter-kind=record]`.
- Source / DOM: `[data-cover-side]` count outside record chapter = 0.
- Source: narrow path does not require camera-runway as first interactive surface when `data-disc-chapters` present (assert CSS or markup gate).

## Lanes (from Task 0)

| Lane | files_in_scope | Does |
|------|----------------|------|
| skip-runway | `src/styles/global.css` (narrow runway skip only), `src/pages/records/[id].astro` **only** runway / chapters visibility attributes, `src/data/disc-chapter-reader.ts` if entry chapter select needed, related source tests | A: narrow entry → record chapter; no independent pre-disc path |
| marks-ui | `src/data/disc-chapters.ts`, `src/data/disc-chapters.test.ts`, `src/pages/records/[id].astro` record-pane markup (cover+marks, strip prose), `src/styles/global.css` **only** `.disc-record-*` / marks-in-chapter, `src/data/*marks*` / detail helpers if needed | B+C: cover+elbow marks; no prose |

**Scope rule:** `[id].astro` is shared. If both lanes need it, **collapse to one serial writer** on `disc-record-marks-only` after Task 0 (do not dual-write). Prefer serial this ticket unless Task 0 splits attributes so lanes touch disjoint regions.

## Global Constraints

- Desktop ≥48rem zero regression.
- No marks/export field renames; no fake marks.
- No markdown long-form / bullet list under cover as a substitute for elbows.
- No thick capsule description cards.
- 述语／地图／资料 unchanged; shell #163 gates stay green.
- Worker opens PR; does **not** merge. Coding lead squash after layout PASS + CI.

## Acceptance / Report

1. Handoff §D + acceptance §A.5 (`[data-cover-side]` only in record).
2. `npm test -- src/data/disc-chapters` (+ any new source tests) green; `npm run check` if feasible.
3. PR URL + head sha; plan file committed.
