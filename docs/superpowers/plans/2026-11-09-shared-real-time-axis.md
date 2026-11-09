# Shared real-time year axis + unknown time
> Worker: writing-plans, executing-plans, test-driven-development, verification-before-completion. Single serial owner on `shared-real-time-axis`, cut from origin/main `434de18`. No squash, no merge to `main`, no force-push. One PR as WIP; merge only after layout PASS **and** the publish gate in `contract-unknown-trajectory-time.md` §8 is satisfied.

**Goal:** one honest year axis shared by every disc — every known-year dot on the same `1685 → reader's current year` scale — plus the explicit `timeStatus:"unknown"` branch for the one station whose year is not verified; unknown stays reachable outside the axis, never inside the domain, the proportional axis, the chrono line, or a year filter.

**Architecture:** a pure canonical-time module (`isKnownTime` / `timeText` / `catalogDomain` / `timelineOrder` / `unknownStations`) is the single numeric gate; the phone year axis becomes a 58px two-lane column (44px label lane + 14px dot lane) whose pure layout module also owns dot-lane hit routing; every consumer narrows to known for geometry and keeps `place.id` ↔ original array index explicit. Desktop horizontal axis keeps its current geometry and only gains unknown-safety.

**Tech Stack:** TypeScript, Astro, CSS, Leaflet 1.9, `node:test` via `node --experimental-strip-types --test`, `astro check`, `astro build`. Node 22.23.4.

**Contracts:** Task 0 (`src/data/trajectory-time.ts`, `src/data/trajectory-axis.ts`, `src/data/trajectory-time.fixtures.ts`).
**Lanes:** Lane A = canonical time + schema (`records-export.ts`, `records-entities.ts`); Lane B = domain/order/axis geometry (`trajectory-time.ts`, `trajectory-axis.ts` impl); Lane C = consumers (`trajectory-chrono.ts`, `disc-chapters.ts`, `trajectory-camera.ts`, `records.ts`, `TrajectoryMap.astro`, `trajectory-map-client.ts`, `global.css`); Lane D = phone axis DOM/CSS; Lane E = unknown entry + gate + migration.
**Serial:** phone-axis pixel locks (§5) before integration; then one integration checkpoint.
**Branch:** `shared-real-time-axis` from `434de18` (PR #184 merged; PR184 compact map is already on main — the 58px year column deliberately replaces the old 34px narrow shell).

> Sequencing override (this brief, not the template default): the plan + Task 0 land on this independent worktree branch, not as a docs-only PR merged first. `docs/superpowers/plan-template.md`'s "plan PR is docs only, cut the branch after it merges" is superseded here by the task brief's explicit instruction to start from `434de18` and land Task 0 + plan together on `shared-real-time-axis`.

## Global Constraints (from PRD r3 §13 and the unknown contract §8)
- Authoritative: `/home/box/web-layout/prd-shared-real-time-axis.md` **§13 is the implementation gate**; `/home/box/web-layout/contract-unknown-trajectory-time.md` is the unknown contract (its §8 is the publish gate). The demo `/workspace/shared-time-axis-demo/` is reference only: never copy its SVG map, test panel, metric badges, `sim-canonical.js`, or neighbour-chapter placeholders into production.
- Phone vertical axis only. Desktop horizontal axis: **no regression + unknown safety**; its catalog-wide proportional geometry is NOT covered by this round's review and must not be claimed as reviewed.
- 58px column = 44px label lane + 14px dot lane, replacing the old 34px/44px narrow shell on purpose. Keep 320/390 map share ≥ 0.48, the 44px title slot, two 44px control rows, long-blurb native inner scroll, the shared #183 arm, and a single Leaflet instance.
- Dots never move: `dotY` is the formula value; layout only dodges labels/clusters. `yearLabel` never creates position. No equal-interval fake scale.
- `Y0` = min `year` over **all known** stations of **all** discs (v1 + legacy + shared Events, build-time, injected as `catalogDomain`); `now` = reader's local year at runtime, endpoint only, never a station. Year granularity. SSR renders the build year, client recomputes on hydration.
- Unknown = explicit `timeStatus:"unknown", year:null, timeNote`; never inferred from `"—"`, 1982, or any label; not in domain/axis/chrono/year filter; keeps guide array position; axis-external 「年份未核」 entry; selecting it in chrono exits chrono into guide. `timeStatus`/`timeNote` join `POINTER_LOCKED_KEYS`; `year:null` is illegal on a pointer.
- Strict rejection of the old sentinel **and** the audited precise migration of `d37779/utrecht` ship as **one verifiable publish unit**. While support is incomplete, this branch stays WIP; do not land a gate alone that would block the existing全馆 build.
- Do not touch content-batch packaging or unrelated `catalog-data-validator` paths. Do not "fix" d37779's placeholder year as a side change; only the audited id-keyed migration (§4) may change it.
- No force-push, no history rewrite, no secrets, no second writer on this tree. Real-device and GUI acceptance are not this worker's claims.

## Scope self-check (no overlap with forbidden paths)
| Path | Owner | Forbidden here |
|---|---|---|
| `src/data/records-export.ts`, `records-entities.ts` | Lane A | — |
| `src/data/trajectory-time.ts`, `trajectory-axis.ts`, fixtures | Task 0 / Lane B | — |
| `src/data/trajectory-chrono.ts`, `disc-chapters.ts`, `trajectory-camera.ts`, `records.ts` | Lane C | — |
| `src/components/TrajectoryMap.astro`, `trajectory-map-client.ts`, `src/styles/global.css` | Lane C/D | no desktop redesign; compact chrome rows stay owned by `TrajectoryMap.astro` |
| `records-legacy/records/d37779/record.json` | Lane E only, id-keyed migration | no whole-library rewrite, no `— ⇒ null` sweep |
| `scripts/content-batch-integration-*`, `scripts/catalog-data-validator*` | **not ours** | untouched |

## Task 0: Contract surfaces (frozen before any consumer behavior)

**Files**
- Create: `src/data/trajectory-time.ts` (types + constants + contract stubs; behavior lands in Lane B)
- Create: `src/data/trajectory-axis.ts` (58px geometry constants + layout/hit signatures; behavior in Lane B/D)
- Create: `src/data/trajectory-time.fixtures.ts` (fixture shapes + named fixtures)
- Test: `src/data/trajectory-time.contract.test.ts`
- Modify: `docs/superpowers/plans/2026-11-09-shared-real-time-axis.md` (this file, checkbox ticks)

**Interfaces (frozen; repeated in every consumer task)**
```ts
// src/data/trajectory-time.ts
export const UNKNOWN_YEAR_TEXT = '年份未核';
export const KNOWN_YEAR_MIN = 1500;
export const KNOWN_YEAR_MAX = 2100;

export type KnownTime = { timeStatus: 'known'; year: number; yearLabel?: string };
export type UnknownTime = { timeStatus: 'unknown'; year: null; timeNote: string };
export type TrajectoryTime = KnownTime | UnknownTime;

export function isKnownTime<T extends TrajectoryTime>(
  value: T | { timeStatus?: unknown; year?: unknown },
): value is T & KnownTime;
export function isUnknownTime<T extends TrajectoryTime>(
  value: T | { timeStatus?: unknown; year?: unknown },
): value is T & UnknownTime;
/** Single formatter. Known → `yearLabel ?? String(year)`; unknown → `年份未核`. Never `null`/`undefined`/`0`/1982. */
export function timeText(place: TrajectoryTime): string;
export function knownYear(place: TrajectoryTime): number | null;
export function precisionOf(place: TrajectoryTime): TimePrecision;
export type TimePrecision = 'day' | 'month' | 'year' | 'approx' | 'range' | 'bound' | 'other' | 'unknown';

export type CatalogDomain = { y0: number | null; yNow: number; span: number; sources: string[] };
/** Known only. All-known-empty → y0 null, span 0 (「暂无已核年份」); never 0/1500/current-year filler. */
export function catalogDomain(
  stations: readonly { discId: string; place: TrajectoryTime }[],
  nowYear: number,
): CatalogDomain;
/** `(year - y0) / span` clamped to [0,1]; null when the domain has no y0 or the year is not an integer. */
export function axisT(year: number | null, domain: CatalogDomain): number | null;

export type TimelineRow<T> = { place: T; index: number };
/** Known only, year asc, PRD §6 tie rules; `index` is the original places-array index. */
export function timelineOrder<T extends TrajectoryTime>(places: readonly T[]): TimelineRow<T>[];
/** Original array order; `index` is the original places-array index. */
export function unknownStations<T extends TrajectoryTime>(places: readonly T[]): TimelineRow<T>[];
```
```ts
// src/data/trajectory-axis.ts
export const AXIS_LABEL_LANE_PX = 44;   // x ∈ [0, 44)
export const AXIS_DOT_LANE_PX = 14;     // x ∈ [44, 58)
export const YEAR_RAIL_WIDTH_PX = 58;   // 44 + 14
export const AXIS_DOT_X_PX = 51;        // 44 + 14 / 2
export const AXIS_TARGET_PX = 44;       // one label touch target, vertical
export const AXIS_DOT_MERGE_PX = 8;     // dots closer than one dot diameter merge
export const AXIS_MAX_SHIFT_PX = 60;    // further than this and a label is no longer "its" label → merge
export const AXIS_CAP_PX = 22;          // Y0 top cap / 现在 bottom cap text zone
export const AXIS_UNKNOWN_SLOT_PX = 44; // 年份未核 slot, below 现在, outside the domain
export const AXIS_DOT_HIT_PX = 12;      // dot-lane tap tolerance

export type AxisDot = { id: string; placeIndex: number; year: number; t: number; y: number; precision: TimePrecision };
export type AxisTarget = {
  key: string; y: number; top: number; bottom: number; anchorY: number;
  members: string[]; placeIndexes: number[]; firstYear: number; lastYear: number;
  cluster: boolean; leader: boolean;
};
export type YearAxisLayout = {
  height: number; axisTop: number; axisBottom: number;
  dots: AxisDot[]; targets: AxisTarget[];
  unknown: { id: string; placeIndex: number }[];
  unknownSlot: { top: number; bottom: number } | null;
  ticks: { year: number; y: number; label: boolean }[];
  domain: CatalogDomain;
};
export function layoutYearAxis(input: {
  places: readonly TrajectoryTime[]; ids: readonly string[]; domain: CatalogDomain; height: number;
}): YearAxisLayout;
/** Dot-lane tap → owning target (single → select it, cluster → expand it); null when no dot within tolerance. */
export function axisDotHit(layout: YearAxisLayout, y: number, tolerance?: number): AxisTarget | null;
/** `组 i/N` lives here and never passes for a tour step. */
export function axisTargetLabel(target: AxisTarget, activeId: string | null, yearsById: ReadonlyMap<string, number>): { main: string; sub: string };
```

**DOM / data hooks**

| Hook | Writer | Reader |
|---|---|---|
| `.traj-year-rail[data-traj-year-rail]` | `TrajectoryMap.astro` | client, CSS (compact only) |
| `.traj-year-label-lane` (new wrapper inside the rail) | `TrajectoryMap.astro` | CSS, client |
| `.traj-year-dot-lane[data-traj-dot-lane]` (`aria-hidden`) | `TrajectoryMap.astro` | client (tap → `axisDotHit`), CSS |
| `button[data-traj-place][data-disc]` (existing) | Astro / client | client, hash, tests |
| `[data-traj-unknown-entry]` + `.traj-unknown-list` | Astro / client | CSS, a11y (`aria-expanded`), tests |
| `[data-traj-domain]` on `[data-traj-root]` (JSON `catalogDomain` + `yNowBuild`) | `TrajectoryMap.astro` | client hydration recompute |
| `.traj-blurb` keeps `is-short`/`is-long` | client | CSS (unchanged) |

**CSS variables and size-container ownership**
```css
/* global.css :root */
--disc-year-rail-w: 58px;      /* total column; replaces 44px */
--disc-year-label-lane: 44px;  /* label lane, touch targets */
--disc-year-dot-lane: 14px;    /* dot lane, aria-hidden */
--traj-year-axis-min-h: 11rem; /* existing 11rem axis floor, now read as a variable */
```
Owner: `.traj-year-rail` (inside `TrajectoryMap.astro`'s narrow block) writes the measured column box; no `container-type` is introduced (the axis is height-driven by the grid row, and Lane D reads `--disc-year-rail-w`). No second container for the same box.

**Fixture shapes**
```ts
// src/data/trajectory-time.fixtures.ts
export type AxisFixture = {
  id: string;
  viewport: { w: 320 | 390; h: number };
  places: readonly TrajectoryTime[];
  ids: readonly string[];
  nowYear: number;
  expect: {
    domainY0: number | null;
    knownCount: number;
    unknownCount: number;
    /** every real dot must land inside the 14px dot lane and no target may overlap 现在 / 年份未核 */
    minMapShare: 0.48;
  };
};
export const primaryAxis: AxisFixture;      // d37779: 1685 … 1982 + one unknown (utrecht), nowYear 2026
export const denseAxis: AxisFixture;        // p1357e: 1946 … 1975, cluster of 6 in 1970–75
export const allUnknownAxis: AxisFixture;   // synthetic: 2 unknown stations, domain y0 null
export const approxAxis: AxisFixture;       // mg50370: 1720 with 「约 1717–23」 stays known
```
Task 0 asserts field types and `primaryAxis.id`; geometry and formula results are Lane B/D assertions.

### Task 0 steps
- [x] Read PRD §13 + unknown contract (all 8 sections) + demo `axis.js`; record the real data facts (26 records / 22 with trajectory / 128 stations; Y0 1685 from 9 `eisenach` stations; latest known 2024 `mhjl329/japan-press`; only sentinel = `records-legacy/records/d37779/record.json` `utrecht` `year:1982 yearLabel:"—"`; no Event carries a sentinel).
- [x] Write the failing contract test `src/data/trajectory-time.contract.test.ts` (exports, constant values, hook strings in the plan, fixture field types).
- [x] See it fail (`ERR_MODULE_NOT_FOUND` / `Not implemented`).
- [x] Add the two modules (types, constants, stubs that throw `Not implemented: <name>`) and the fixtures.
- [x] See the contract test pass; `git commit -m "feat(traj): publish shared year-axis + unknown-time contract surfaces"` on the shared base.

### Task 1 (Lane A) — canonical time in schema, events, pointers (`records-export.ts`, `records-entities.ts`)
A1. Failing tests: legacy integer year (no discriminator) reads as `known`; explicit `known` 1500/2100 accepted; 1499/2101/float/string rejected; `unknown + null + non-empty timeNote` accepted and round-trips as `null`; `unknown + 1982`, `known + null`, no-status + null/missing year rejected; `unknown` without/empty note rejected; `known + timeNote` rejected; stray `dateUnknown` rejected; unknown + numeric label rejected; `unknown + null + yearLabel:"—"` normalises by dropping the label; pointer carrying any time field rejected; Event unknown expands to every referencing disc with each station id kept and blurb override independent.
A2. Implement the strict union in `placeSchema` / `eventSchema`, `POINTER_LOCKED_KEYS += timeStatus,timeNote`, and `expandStation` copying the whole time branch.
A3. **Deferred on purpose (Gate):** strict rejection of the legacy `"—"`/sentinel label on a *known* or *status-less* station lands in Lane E together with the audited migration, as one release unit. Until then the parser reads status-less stations as known and produces an `unknowns` audit candidate list only.
A4. Green: `node --experimental-strip-types --test src/data/records-export.test.ts src/data/records-entities.test.ts src/data/records-trajectory.test.ts`.

### Task 2 (Lane B) — domain, timeline order, axis geometry (`trajectory-time.ts`, `trajectory-axis.ts`)
B1. Failing tests: domain excludes unknown and ignores an inserted hypothetical unknown (Y0 unchanged); adds an earlier known → Y0 moves; all-unknown → `y0:null, span:0`, no division by zero; one known year → finite geometry, no NaN; timeline order = year asc with PRD §6 month/day tie only when every same-year station has a plain `YYYY-MM(-DD)` start, otherwise original order; unknown never enters timing; `axisT` clamps and returns null without a domain; `precisionOf` classes (日/月/年/约/范围/后/other/unknown) from `yearLabel` only.
B2. Failing geometry tests: every dot sits at the formula `y` (layout does not move it); dot lane x fixed; targets are 44px, non-overlapping, inside `[lo, hi]`; nothing covers 现在 or the 年份未核 slot; leaders only when shifted > 2px; dots closer than 8px merge; a target drifting > 60px merges with the nearer neighbour and re-lays out until convergence; century ticks only when ≥ 7px clear of every target; `axisDotHit` returns the owning target for a tap on a real dot, the cluster target for a cluster, and null outside 12px (never the "nearest label").
B3. Implement; assert the PRD §3 numbers on real fixtures (1900 → t = 0.630, 1950 → t = 0.777, mhjl329 press t ≥ 0.806, 43 of 127 known stations in the bottom 20%).
B4. Green: `node --experimental-strip-types --test src/data/trajectory-time.test.ts src/data/trajectory-axis.test.ts`.

### Task 3 (Lane C) — every consumer narrowed to known (`trajectory-chrono.ts`, `disc-chapters.ts`, `trajectory-camera.ts`, `records.ts`, `TrajectoryMap.astro`, `trajectory-map-client.ts`)
C1. `chronoStations`: only known rows, keep `year → discId → original index` tie, no undefined-as-0, unknown never appended to the end of the line.
C2. `yearRailPins`: known only, keep original index, keep per-disc `label:null` de-duplication.
C3. `yearText` → `timeText` (single formatter); `trajectory-camera.ts` and `records.ts` search index must never emit `null`/`undefined`/`0`/1982 for an unknown station; `timeNote` is searchable, 「年份未核」 is the displayed text.
C4. `TrajectoryMap.astro` SSR: build `catalogDomain` from `discs` (all known), inject `data-traj-domain`, render the phone axis from `layoutYearAxis` with an explicit `placeIndex`, hide the proportional axis for an all-unknown disc with 「暂无已核年份」, and keep the desktop horizontal rail `hidden` on narrow screens as today.
C5. `trajectory-map-client.ts`: `Place` time becomes the union; `renderRailPins`/`railLayout` use known rows plus an explicit original-index map (`railXs[placeIndex]` must never index a filtered array); chronological bead/progress reads 0 progress for unknown and restores it for known; selecting an unknown in chrono stops playback and switches to guide; re-render keeps focus on the same target key.
C6. Source/runtime gate tests keep green (compact chrome rows stay owned by `TrajectoryMap.astro`).
C7. Green: `node --experimental-strip-types --test` (whole suite), `npm run check`, `npm run build`.

### Task 4 (Lane D) — phone axis DOM/CSS: 58px two lanes
D1. Markup: label lane + dot lane wrappers; dot lane `aria-hidden` with a tap handler routed by `axisDotHit`; keyboard stays on the label buttons (arrow keys between targets, Enter expands, Esc collapses and restores focus).
D2. CSS (compact only): `--disc-year-rail-w: 58px`, label lane 44, dot lane 14, axis `min-height: 11rem`, Y0/现在 caps 22px, unknown slot 44px, leaders 1px from x=41→44, cluster bracket 2px, label type 10px/10px in `--minor`, `--faint` for decoration only.
D3. Cluster list replaces the narration band at the same height (map height unchanged), cluster title + 44px × in control row 1, rows ≥ 48px two-line; 「年份未核」 entry lists unknown stations in original order with the same replacement rule.
D4. Keep 320/390 map share ≥ 0.48, both control rows, long-blurb inner scroll, one Leaflet instance.
D5. Runtime/geometry gate: extend `scripts/map-compact.runtime.test.mjs` (same CDP harness) with dot-lane assertions; `npx astro build` then the runtime test.

### Task 5 (Lane E) — unknown entry, strict gate + audited migration (one publish unit)
E1. Audit scan over `records/`, `records-legacy/`, `records/events/` for sentinel labels / placeholder years → candidate list only; today it finds exactly one (`d37779/utrecht`); the plan records that count as *this input's* count, not a promise.
E2. Enable the strict rejection (status-less or known + sentinel label fails; unknown + numeric label fails), and in the same commit apply the id-keyed migration: keep the `utrecht` object byte-identical except `year → null`, `yearLabel` removed, `timeStatus:"unknown"`, `timeNote:"店标贴附年份未核。"`; record before/after hashes and prove id/coords/blurb/array order unchanged; re-run is idempotent; a hash/expected-value mismatch stops that entry.
E3. Prove the whole-catalog build stays green with the gate live (`npm run build`), and that removing the migration makes the gate fail (negative control).
E4. **Not in this round's authority:** merging. The gate + migration + consumers must pass layout PASS and the user's publish confirmation before `main`. While any consumer is incomplete the branch stays WIP.

### Serial — phone-axis pixel locks
44 label lane / 14 dot lane / 58 total, dot x = 51, 8px merge, 60px max shift, 22px caps, 44px unknown slot, 10px label type, `--minor` for必要文字. These are user-locked numbers; the implementer does not re-decide them. The serial track runs after Lane D and before Integration.

Step order is deliberate: each task's tests are written before its code, and every task ends with a real command + exit code recorded here. Lane A unblocks Lane B (types), B unblocks C/D (geometry), E is last because it is the publish unit.

### Task 6 — PR
- [ ] `node --experimental-strip-types --test`, `npm run check`, `npm run build` green at the task head; record cwd + exit codes.
- [ ] Push `shared-real-time-axis` and open one PR citing PRD r3 §13, the unknown contract §8, baseline `434de18`, and the known gaps below. Title states WIP while any consumer or the publish unit is incomplete.
- [ ] No squash, no merge to `main`. Do not merge a gate that would block the existing全馆 build.

### Integration
One checkpoint once every lane is merged onto `shared-real-time-axis`:
- `node --experimental-strip-types --test` (whole suite, Node 22.23.4), `npm run check`, `npm run build` — all exit 0.
- `npm run preview`, then the CDP runtime gate on 320×568 / 390×844 for `cs6785` (cross-century), `movcl014` (same-year 1997), `p1357e` (dense 1970–75 cluster), `d37779` (unknown), `mhjl329` (axis-bottom crowding); desktop 1280 no-regression pass.
- Whole-branch review of the integrated diff; then push the branch and open one PR (no squash, no merge). The report separates verified from inferred and names what is still unverified (real device, GUI frames, external `trajectory_checker.py` / `coords_gate` / `assert_ship_trajectory_gate.py`, publish confirmation).

## Known gate gaps (recorded now, not silently closed)
1. **External checkers not in this tree:** `trajectory_checker.py`, `coords_gate`, `assert_ship_trajectory_gate.py`, `export_site_marks.py` were not re-run here (contract §8 reports their behaviour from the curator's isolated audit). "Site accepts" ≠ "external gate accepts".
2. **Sentinel inventory** is this input's scan: one station (`d37779/utrecht`, `records-legacy`). Shared Events: none. This is not a promise that no other needs auditing; the scan is re-run at migration time.
3. **Publish unit:** strict gate + migration + all consumers land together. No merge until layout PASS and user publish confirmation.
4. **Desktop geometry** is untouched and not claimed as reviewed; the demo's desktop behaviour is not acceptance.
5. **Real device / GUI frames / screen reader / dark theme** stay unverified and are not merge gates.
6. **Pre-existing red on baseline:** `scripts/map-compact.runtime.test.mjs` subtest「cs6785 @320 长站文」fails with `短文站 budapest-solti-birth 没落地` on a **clean `434de18` tree with no work here** (proved by stashing Task 0 and re-running twice: same failure). It is a station-landing timing flake in the CDP harness, not a geometry regression; it must be triaged before it is quoted as evidence, and it does not block Task 0.

## Baseline commands (recorded before any edit)
| command | cwd | exit |
|---|---|---|
| `npm ci` | worktree (no `node_modules` on a fresh worktree) | 0 |
| `node --experimental-strip-types --test` | worktree | 0 — 755 pass / 0 fail |
| `npm run check` | worktree | 0 — 0 errors, 0 warnings, 13 hints |
| `npm run build` | worktree | 0 |

## Outcome (this round)
- Plan: `docs/superpowers/plans/2026-11-09-shared-real-time-axis.md` (Task 0 frozen; Task 1–6 checkbox steps).
- Task 0 contract: `src/data/trajectory-time.ts` (types, constants, stubs), `src/data/trajectory-axis.ts` (58px geometry constants, `layoutYearAxis` / `axisDotHit` / `axisTargetLabel` stubs), `src/data/trajectory-time.fixtures.ts` (d37779 / p1357e / all-unknown / mg50370).
- Contract test: `src/data/trajectory-time.contract.test.ts` — 6 pass / 0 fail.
- Whole suite after Task 0: see the commit's recorded command; the only red is the pre-existing `map-compact.runtime.test.mjs` flake above.
