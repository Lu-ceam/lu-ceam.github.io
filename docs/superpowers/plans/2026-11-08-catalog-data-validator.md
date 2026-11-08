# Catalog data validator — implementation plan

> **For agentic workers:** this plan is executed on branch `catalog-data-validator`, cut from `origin/main`.
> Task 0 freezes the public seams (module signatures, report contract, DOM/payload contracts, fixture shapes).
> Tasks 1–6 are ordered because each consumes the previous task's output. Verification commands are quoted
> verbatim; every step records the real exit code. Do not repair production data, do not change the
> existing build chain.

**Goal:** a read-only catalog validator that inventories the whole authoritative disc set, collects
per-record source findings (schema, photos, story, trajectory, notes fields), compares an explicitly
supplied successful `dist/` against the same source expectation, and writes JSON + Markdown reports with
the `audit` / `ratchet` exit contract from PRD §12.

**Architecture:** new files only under `scripts/catalog-data-validator*`, `docs/catalog-data-validator*`,
`docs/superpowers/plans/2026-11-08-catalog-data-validator.md`, and one new non-required workflow.
Reuse the existing strict exported schemas/parsers (`parseRecord`, `storyBody`, `parseStorySections`,
`buildDiscChapters`, `discNotesFields`, `loadEntityCatalog`, `assertTrajectoryPointers`,
`expandRecordTrajectories`, `dedupedStationCount`, `showMatrix`/`showPressing` via the `records.ts` oracle)
and `scripts/record-sha.mjs` `directorySha256`. No shared-parser refactor; no production schema change;
no content, image, layout, CSS, client, `src/data` or chapter/map edits. The validator never builds, never
exports, never writes into the content tree. Reports go to an output directory outside the production
tree (default `/workspace/catalog-data-validator-results/<timestamp>`; PRD CI uploads an artifact).

**Tech Stack:** Node 22.23.4 (`node --experimental-strip-types`), TypeScript ESM, `node:test`, `zod`
(already a dependency, used by the reused schemas), `parse5` (installed transitively by `astro`, real HTML
parser), `sharp` (installed as astro's optional dependency; full JPEG/PNG/WebP decode), Astro output
inspection only. No `package.json` / lockfile / dependency change. No network.

**Global Constraints**
- Only these paths are written: `scripts/catalog-data-validator*`, `docs/catalog-data-validator*`,
  `docs/superpowers/plans/2026-11-08-catalog-data-validator.md`,
  `.github/workflows/catalog-data-validator.yml`.
- Never edit `content/`, `public/`, `records/`, `records-legacy/`, `src/data/` (including
  `records-layout.json`), chapter/map/client/year-axis/CSS, `src/pages/**`, `scripts/check-public-records.mjs`,
  `scripts/warn-trajectory-blurbs.mjs`, `.github/workflows/ci.yml`, `package.json`, `package-lock.json`.
- Validator is read-only over content and build output. It never runs a build and never rewrites data.
- Default command is `audit` (full strict). `ratchet` accepts only an explicit, exact, unexpired,
  hash-matching approved baseline. No auto-baseline, no ignore-all, no per-record rule disabling.
- `pending-contract` (d37779/utrecht 1982 sentinel) is a real **error**, never a warning and never waived
  automatically; `null`/unsupported year shape is reported as unsupported + not-checked semantics.
- Exit codes: 0 pass / 1 issues / 2 execution-or-coverage-incomplete; 2 > 1 > 0.
- No live network check in this shipment: `live` is a declared stub that reports `not-requested` and
  never performs a request.
- The new workflow is independent and non-required: it preserves the real exit code, always uploads the
  report artifact (14 days), and does not use `continue-on-error` to mask failures.

## Task 0 — Freeze the approved baseline and the public contracts (current tree, not old line numbers)

Facts re-checked on this tree (`git rev-parse HEAD` = `59f4469…` = `origin/main`, clean tree):

| Contract | Re-checked reality |
|---|---|
| Authoritative set | `records/index.json` 24 + `records-legacy/index.json` 2 = 26 unique ids; both index↔directory sets equal; no duplicate/cross-root id; `records-layout.json` 26 ids, no mismatch. **26/22 are snapshot dates, never constants.** |
| Export schema | `src/data/records-export.ts`: `parseRecord`/`recordSchema` (strict), `storyBody`, `parseIndex`, `indexSchema`, `resolveInside`/`loadSide` are **private**, `loadRecordsExport` fail-fast. `images[]` = `file,kind,caption` + optional photo flags; `details[]` = `file,caption,text`; `links[]` = `title,href,site`; `verificationStatus` = `verified\|partial\|pending`; `trajectory.places[]` = inline place or `{id,eventId,blurb?}` pointer; `year` integer 1500–2100 (no null). |
| Entities | `src/data/records-entities.ts`: `loadEntityCatalog`, `assertEntityGraph`, `assertTrajectoryPointers`, `expandRecordTrajectories`, `resolveRecordsExport` exported. Entity catalog load is fail-fast per kind. |
| Whole model oracle | `src/data/records.ts` has a **top-level** `export const records = sortRecords(mergeRecords(resolveRecordsExport(), parseLayout(layoutJson)))`; importing it can throw. `showMatrix`/`showPressing`/`showPressingDetails`, `discNotesFields` live here / in `disc-chapters.ts`. |
| Chapters | `src/data/disc-chapters.ts`: `CHAPTER_KEYS = ['record','story','map','notes']`, aliases incl. `资料→story`, `parseStorySections`, `buildDiscChapters`, `chapterPresent`, `discNotesFields`. `## 资料` narrative is story in the chapter model. |
| Story/chapter source | `storyBody()` drops one leading H1. `sourceBodyPresent` (body after H1 non-empty) and `storyChapterPresent` (`buildDiscChapters` has a `story` chapter with a real paragraph) are **independent** dimensions. |
| Map payload | `src/components/TrajectoryMap.astro` writes `<section data-traj-root data-payload="{escaped JSON}">` with `{mode,discs}`; embed page passes one disc; `/records/map/` passes `mode:"overview"`. Must decode the HTML attribute, then `JSON.parse`. |
| Chapter DOM | `src/pages/records/[id].astro`: `[data-disc-chapters]` shell (only when reveal details exist), `section[data-chapter][data-chapter-kind][data-chapter-mode]`, story paragraphs `p.disc-chapter-text` inside `[data-chapter-prose]`, notes `dl[data-chapter-list]` `dt`/`dd`, nav `[data-chapter-goto]` with chapter label text. |
| Notes display conditions | `discNotesFields(record, {showMatrix, showPressing})` with `showPressingDetails` = 已核/大体已核 (legacy: only 已核). Source rows with 待复核/待核 must hide 内圈刻字/压片. |
| Photos | `public/records/<id>/*.webp` plates/uprights must match layout JSON sizes; source images live under `records/<root>/records/<id>/images|details`; `runout` is exported but never rendered. |
| Build evidence | `npm ci` (existing lock, no change) → `npm run check` exit 0 → `npm run build` exit 0 on this tree. `dist/records/` has 26 disc pages + `map/index.html`; 22 discs have trajectories. |
| Current data findings | guide order inversions: `cs6785` 1912→1842, `4816856` 1929→1842, `movcl014` 1997-05→1997-03-12. `d37779/utrecht` has `yearLabel:"—"` with year 1982 (pending-contract). `4816856` has unreferenced `details/cover-upright.webp`. 122 image files, 121 unique byte contents, 0 byte-duplicate groups. |

**Contract surfaces frozen by this task (module `scripts/catalog-data-validator/report.ts`, `inventory.ts`, `source.ts`, `build.ts`, `cli.ts`):**

```ts
export type Layer = 'source' | 'build' | 'live';
export type Severity = 'error' | 'warning';
export type FindingStatus = 'active' | 'pending-contract' | 'accepted-baseline' | 'accepted-gap' | 'blocked';

export type Finding = {
  key: string; code: string; severity: Severity; layer: Layer; status: FindingStatus;
  recordId: string | null; fieldPath: string | null; stationId: string | null;
  expected: unknown; actual: unknown; reason: string; recommendation: string;
  evidence: string[]; baselineId: string | null;
};

export type NotChecked = { code: string; layer: Layer; recordId: string | null; fieldPath: string | null; reason: string; dependency?: string };

export type InventoryRow = {
  id: string; root: string; legacy: boolean; indexOrdinal: number | null;
  recordPath: string; storyPath: string; indexSha256: string | null; blockReason: string | null;
};

export type InventoryResult = {
  rows: InventoryRow[]; conflicts: Finding[]; findings: Finding[];
  coverage: { expectedIds: string[]; observedIds: string[]; missingIds: string[]; extraIds: string[]; complete: boolean };
};

export type RecordReport = { id: string; root: string; legacy: boolean; /* ...dimensions below... */ };
export type CatalogReport = {
  reportVersion: 1; generatedAt: string; mode: 'audit' | 'ratchet'; requestedLayers: Layer[];
  notRequestedLayers: Layer[]; sourceHead: string | null; sourceDirty: boolean | null;
  input: { exportRoot: string; legacyRoot: string; layout: string | null; dist: string | null; scope: 'full' | 'selected' };
  fingerprints: Record<string, string | null>;
  summary: { /* record/photo/story/trajectory/field counts; unknown ≠ 0 */ };
  coverage: { complete: boolean; requiredChecks: Array<{ id: string; status: 'pass'|'fail'|'blocked'|'not-run'; reason: string | null }>; expectedIds: string[]; observedIds: string[]; missingIds: string[]; extraIds: string[] };
  records: RecordReport[]; findings: Finding[]; notChecked: NotChecked[];
};
```

Frozen helper signatures (Task 0 stubs throw `Not implemented: <name>` until their task lands; the Task 1
contract test only asserts the module exports them):

```ts
export function inventory(input: { exportRoot: string; legacyRoot: string }): InventoryResult;
export function collectSource(row: InventoryRow, ctx: SourceContext): SourceResult;
export function compareBuild(source: SourceResult[], ctx: BuildContext): BuildResult;
export function renderMarkdown(report: CatalogReport): string;
export function exitCodeFor(report: CatalogReport, mode: 'audit' | 'ratchet', baseline?: BaselineFile): number;
```

Frozen DOM/attribute readers (production markup is **not** edited): `[data-disc-chapters]`,
`[data-chapter-kind]`, `[data-chapter-mode]`, `[data-chapter-goto]`, `[data-chapter-prose]`,
`p.disc-chapter-text`, `dl[data-chapter-list]` `dt`/`dd`, `[data-traj-root]`, `data-payload`.
Frozen payload shape: `{ mode: 'embed'|'overview', discs: [{ id, places: [{ id, year, … }] }] }`.
Frozen report files: `catalog-report.json`, `catalog-report.md` in the `--out` directory.
Frozen fixture shapes live in `scripts/catalog-data-validator.test.ts` (temp dirs only; never `records/`).

**Task 0 steps**
- [ ] Re-check `git status --short`, `git rev-parse HEAD`, `git rev-parse origin/main`; record them here.
- [ ] Re-check exported names with `grep -nE '^export' src/data/records-export.ts src/data/records-entities.ts src/data/records.ts src/data/disc-chapters.ts`; record any drift vs the table above.
- [ ] Re-run `node --version` with the real 22.23.4 executable (`/tmp/node-v22.23.4-linux-x64/bin/node`) and record `npm ci` result without touching the lock (`git diff --stat package-lock.json` empty).
- [ ] Run `npm run check` and `npm run build`; record exit codes and note the successful `dist/` used only as build evidence.
- [ ] Write the contract test `scripts/catalog-data-validator.test.ts` that imports the frozen names and asserts they are exported; see it fail before the modules exist; then add stubs; see it pass.
- [ ] Commit: `feat(catalog-validator): freeze report and API contract surfaces` (staged by explicit path).

## Task 1 — Raw inventory and coverage identity (dynamic, no 26/22 constant)

**Files:** create `scripts/catalog-data-validator/inventory.ts`, `scripts/catalog-data-validator/report.ts`.
**Reads:** nothing from `src/data` beyond the types; index JSON is read raw, then validated by the real
`parseIndex` (`src/data/records-export.ts`) — a thin per-entry collector, never a relaxed copy.

Behavior:
1. Both roots' `index.json` read raw; missing legacy index **while a legacy `records/` directory exists**
   ⇒ `INVENTORY_INDEX_MISSING` error + `coverage.complete=false` (exit 2). Missing v1 index likewise.
2. Per index entry keep `root+id+indexOrdinal+recordPath+indexSha256`; a duplicate id inside one index is a
   conflict (`INVENTORY_INDEX_DUPLICATE_ID`), **never** a Map overwrite; cross-root duplicate is
   `INVENTORY_DUPLICATE_ID_CROSS_ROOT`. Conflicted rows stay in `rows` with `blockReason`.
3. Directory scan of `<root>/records/*`; index-without-directory `INVENTORY_INDEX_NO_DIR`,
   directory-without-index `INVENTORY_DIR_UNINDEXED`; each is an error and makes the identity incomplete.
4. `record.json` `id` vs directory name mismatch is a per-row error (`INVENTORY_ID_MISMATCH`), reported and
   counted, not silently dropped.
5. Sort rows by `(root, indexOrdinal, id)`; expected/observed/missing/extra id lists are complete (no count-only diff).
6. Index `sha256` is **recorded and re-computed** with the existing `directorySha256` (documented coverage:
   the record directory, not shared entities); mismatch is `INDEX_SHA_MISMATCH` (warning in MVP, since the
   loader does not verify it yet) — never claimed as verified.

Tests: dynamic union, adding a 27th record changes summary, duplicate index id, cross-root duplicate,
legacy dir without index ⇒ exit 2 with all other rows preserved, index/dir mismatch.

Verify: `node --experimental-strip-types --test scripts/catalog-data-validator.test.ts`

## Task 2 — Per-record source collector (schema, photos, story, fields)

**Files:** create `scripts/catalog-data-validator/source.ts`, `scripts/catalog-data-validator/images.ts`.
**Reads:** `parseRecord`, `storyBody` (records-export); `parseStorySections`, `buildDiscChapters`,
`discNotesFields`, `chapterKeyForTitle` (disc-chapters); `directorySha256` (scripts/record-sha.mjs).

- Read `record.json` raw first (fingerprint + key presence), then `parseRecord`. Schema failure is one
  finding with the real issue paths; parsing continues for the other records. Keep `schema:'invalid'` and
  do not pretend arrays are empty.
- Photos: for each `images`/`details` reference — path normalization, realpath containment (symlink escape
  → `IMAGE_ESCAPE`), regular non-empty file, magic-byte format match, `sharp.metadata()` + full
  `sharp().raw().toBuffer()` decode, positive dimensions. Missing/invalid decode is an error, never a count
  of 0. `sharp` unavailable ⇒ required decode check `blocked` ⇒ exit 2 (never “exists-only”).
- Duplicate references: within one array by `file`+`kind` (images) / `file` (details);
  cross-array same file is legal and counted once in unique assets; byte-identical different paths is a
  warning with evidence; unreferenced files in `images/`/`details/` is a warning; counts:
  image refs, detail refs, total refs, unique referenced assets, unique byte contents, per-kind refs and
  per-kind unique assets. `cover-front` absence is a hard error and cannot be waived.
- Story: `sourceBodyPresent` (after `storyBody`) and `storyChapterPresent` (real chapter from
  `buildDiscChapters`) as two independent fields; paragraphs, count and sequence SHA-256 fingerprint;
  whole-value placeholder list is versioned (`PLACEHOLDER_TOKENS_V1`) with counter-fixtures
  (“待补拍”/“年份未核” inside a normal sentence is not a placeholder).
- Fields: required key matrix from `recordSchema` (presence/type/value state: valid, whitespace-only,
  whole-value placeholder, missing); `verificationStatus`/`statusLabel` consistency is reported from the
  schema error; a field with no field-level evidence is `verificationState:'unknown'`, never “verified”;
  optional policy (`--policy`) may mark a precise field `unverified`/`not-applicable` with reason,
  approver, date, review date — it never bypasses the schema.
- Version role requirements: with no machine-readable requirement contract the record is
  `versionRequirements:'not-checked'` (reason `no-version-requirement-contract`) and optional missing roles
  are warnings only. A policy file may declare `required`/`accepted-gap`/`not-applicable` per exact
  record + role/face; accepted gaps stay listed.

Tests: empty story / H2 only / placeholder / record-object prose only / short no-H2 body / old alias /
sentence containing 待补拍; missing image / corrupt-but-.jpg / path escape / symlink escape / duplicate
reference / cross-array reuse / byte duplicates / unreferenced file / missing cover-front; whitespace and
placeholder fields; policy accepted-gap.

## Task 3 — Trajectory, entities, ordering and pending-contract

**Files:** create `scripts/catalog-data-validator/entities.ts`; extend `source.ts`.

- Load the entity catalog once from the export root; a catalog failure is `ENTITY_CATALOG_INVALID` with
  the entity path, and every dependent expansion is `blocked` (dependency chain recorded), while photos /
  story / fields continue per record.
- Per record: `assertTrajectoryPointers` + `expandRecordTrajectories` (single-record call) via the real
  functions; dangling pointer / duplicate eventId / ownership error / coordinate range / pointer locked
  key → error with `trajectory.places[i].…` path; other records keep reporting.
- Stats: reference stations, expanded stations (`null` + reason when blocked — never a fake 0), inline
  count, unique eventId count, role distribution; catalog-level overview dedupe with
  `dedupedStationCount`. Absent trajectory ⇒ `absent` (not a defect, no station invented).
- Guide order: known-anchor comparison, `unknown`/placeholder labels never compared as 0/1982; date
  precision whitelist (`YYYY`, `YYYY-MM`, `YYYY-MM-DD`, ranges, `约`, `YYYY 年后`); same-year only when a
  common precision is provable; overlapping ranges/unparseable labels ⇒ `not-checked`, not false
  inversion. Range/label vs `year` conflict is its own `not-checked` finding.
- `d37779/utrecht` `yearLabel:"—"` (integer 1982 placeholder) ⇒ `TRAJECTORY_PENDING_CONTRACT_SENTINEL`
  **error**, status `pending-contract`, evidence with the exact path; no automatic migration, no warning
  downgrade, no blanket acceptance of `—` labels.
- Unsupported unknown shape (`null`/missing year on an inline station) ⇒ schema error plus
  `TRAJECTORY_UNKNOWN_CAPABILITY_UNSUPPORTED` not-checked; never 0 and never a legal unknown.

Tests: legal absent, empty places, dangling pointer, duplicate eventId, out-of-range coordinate, pointer
locked field, 1912→1842 and 1997-04→1997-03-12 inversions, same-month year-vs-date not-checked, overlapping
ranges not-checked, sentinel vs legal 1982, null unsupported, catalog-failure blocked, later records still
reported.

## Task 4 — Report, markdown, exit matrix, baseline/ratchet

**Files:** create `scripts/catalog-data-validator/report.ts` (complete), `scripts/catalog-data-validator/baseline.ts`,
`scripts/catalog-data-validator.ts` (bin).

- JSON report shape as frozen in Task 0; `generatedAt` labelled Asia/Singapore (+08:00) for humans, ISO in
  JSON; `sourceHead`, `sourceDirty` (`null` when unknown — never guessed clean).
- Markdown: summary, per-record matrix, every error/warning/not-checked row linking to the stable JSON
  finding key; separate sections for accepted-baseline, accepted-gap, pending-contract, unverified.
- `audit`: only approved-baseline entries are *displayed* as accepted-baseline but still count as errors ⇒ 1.
- `ratchet`: baseline entry must carry `code, recordId, fieldPath, valueSha256, reason, approvedBy,
  approvedAt, reviewBy`; matched only when code+recordId+fieldPath+value hash are identical and
  `reviewBy >= today`; expired, hash-changed, new, worse, or stale entries ⇒ 1; unreadable/invalid baseline
  shape or wildcard/ignore-all ⇒ 2 (unreadable) / 1 (overbroad); no baseline file ⇒ usage error 2 with
  “run audit”. Baseline is never generated or rewritten.
- Required-check coverage set: inventory identity, entity catalog (when at least one pointer exists),
  per-record schema/story/image decode/fields; build: dist presence + provenance, route set, chapters, nav,
  story paragraph sequence, notes fields, map stations, assets. Blocked required check ⇒ 2; blocked
  optional/historical evidence (e.g. fact verification) ⇒ not an execution failure.
- Report write failure or `--out` uncreatable ⇒ 2 after printing the error.

Tests: exit 0 clean, 1 active error with report written, 2 identity incomplete, 2 report write failure,
ratchet 0 with exact approved baseline while audit 1, expired/hash-changed baseline 1, unreadable baseline
2, overbroad baseline 1, `live` not requested in default report.

## Task 5 — Build layer from an explicit successful dist

**Files:** create `scripts/catalog-data-validator/build.ts`.

- `--dist` is explicit; no dist ⇒ `BUILD_DIST_MISSING` + required check blocked ⇒ 2 (never silently skip).
- HTML through `parse5` (attribute entity decoding), never regex-guessed JSON. One map root per page; the
  same root/container is not counted twice.
- Per record: route exists; chapter kinds sequence + nav count/labels; story paragraph sequence fingerprint
  (normalized whitespace, order-sensitive, duplicates counted once per rendered occurrence); notes `dt/dd`
  against `discNotesFields` with the **real** `showMatrix`/`showPressing`; map payload station id/year
  sequence against expanded source; expected derived assets (plate/upright from the layout merge, minus
  contract-hidden `runout`) exist in `dist`; `data-traj-root` absent when source has no trajectory.
- `/records/map/index.html` overview disc id set equals the expected trajectory id set.
- Provenance: per-record source fingerprint (record.json + story.md + index sha + layout entry) plus dist
  page mtime; any source file newer than the page ⇒ `BUILD_STALE` (build-input-invalid ⇒ 2), never a
  content-missing conclusion. Fingerprints of expected manifest and actual page/payload recorded.
- `records.ts` whole-model oracle imported in isolation; failure keeps every raw row and marks
  build-model/public-condition checks `blocked` (with dependency chain); it is not replaced by a relaxed
  copy and `records.ts` is not modified.

Tests: synthetic dist fixtures for missing route, missing chapter, dropped paragraph, notes field
mismatch/legit hidden matrix, dropped map station, missing asset, stale dist, overview set mismatch,
hidden-template/Pagefind false-positive avoidance, oracle failure keeping all rows.

## Task 6 — Independent non-required workflow and documentation

**Files:** create `.github/workflows/catalog-data-validator.yml`, `docs/catalog-data-validator.md`.

- Trigger: `pull_request` + `workflow_dispatch` (separate from `ci.yml`); `permissions: contents: read`.
- Steps: checkout, setup-node from `.nvmrc`, `npm ci`, `node --experimental-strip-types scripts/catalog-data-validator.ts audit --dist dist --out "$RUNNER_TEMP/catalog-report"` (build step only to obtain the explicit artifact, clearly labelled), then `actions/upload-artifact` with `if: always()` and `retention-days: 14`.
- The job's final step preserves the validator/step exit code (no `continue-on-error`, no `|| true`); the
  report artifact is uploaded even when the audit fails. It is not part of required checks and does not
  touch the existing verify/build chain.
- Docs: commands, exit matrix, `pending-contract` semantics, report fields, baseline approval rules, what
  is deliberately not checked (history/authenticity, version completeness without a contract, live
  delivery), and the transitive `parse5`/`sharp` dependency note (no dependency change permitted).

Verify in this shipment (local, authorized): `node --experimental-strip-types --test
scripts/catalog-data-validator.test.ts`, `npm run check`, `npm run build` (validation only; the validator
itself never builds), then `audit` source-only and `audit --dist dist` with reports written to
`/workspace/catalog-data-validator-results/…`. Production findings (order inversions, sentinel,
unreferenced file) are reported, not fixed; a non-zero production audit is a correct result.

## Deliverable ordering

Task 0 (freeze + contract test) → Task 1 inventory → Task 2 source → Task 3 trajectory → Task 4
report/exit → Task 5 build → Task 6 workflow/docs. Each task ends with its test command, then one
integration pass (`--test`, `npm run check`, `npm run build`, audit source, audit build) and a final
diff-scope review. `live` stays a not-requested stub; `ratchet` is exercised only against fixtures, never
against a self-generated production baseline.

## Execution record (this shipment)

Runtime: `/tmp/node-v22.23.4-linux-x64/bin/node` (`v22.23.4`, npm `10.9.9`) — the handoff's `/tmp/node-v22.23.4`
path was a prefix directory, the executable lives under `-linux-x64/bin`. System node is `v22.21.0`, below the
`engines` floor, so it was not used for `check`/`build`. `node_modules` was absent in this worktree;
`npm ci --no-audit --no-fund` installed the existing lock (exit 0, 434 packages, `git diff package-lock.json`
empty). `ffmpeg` at `/usr/bin/ffmpeg` was inspected but not used: `sharp` 0.35.5 (Astro's optional dependency,
already in the lock) does the full JPEG/PNG/WebP decode, and `parse5` 7.3.0 (Astro transitive) is the HTML parser.
No dependency, lockfile or version change was made.

Commands, cwd = this worktree, real exit codes:
- `node --experimental-strip-types --test scripts/catalog-data-validator.test.ts` → **0** (79 tests, 10 suites, 0 fail)
- `npm run check` → **0** (115 files, 0 errors, 0 warnings, 7 pre-existing hints outside this scope)
- `npm run build` → **0** (build is validation evidence only; the validator itself never builds)
- `node --experimental-strip-types scripts/catalog-data-validator.ts audit --source-head <HEAD>` → **1**
- `... audit --dist dist --out /workspace/catalog-data-validator-results/2026-11-08-prod-audit` → **1**
- `... ratchet --baseline /tmp/probe-baseline.json` (probe only, uncommitted) → **0**,
  `accepted-baseline-issues`, while the same audit returns 1.

Production audit result (26 records: 24 `records/` + 2 `records-legacy/`, all collected, none blocked):
- active errors 3: `TRAJECTORY_GUIDE_ORDER_INVERSION` on `cs6785` (1912→1842), `4816856` (1929→1842),
  `movcl014` (1997-05→1997-03-12).
- pending-contract error 1: `d37779` `trajectory.places[5].yearLabel` is `—` with the provisional 1982.
- warning 1: `4816856/details/cover-upright.webp` is unreferenced.
- not-checked 34: 26 version-role-completeness (no machine contract), 7 same-year order unverified, 1 unparseable
  time label.
- source: 26/26 body present, 26/26 story chapter present; photos 106 images + 54 details = 160 refs, 121 unique
  assets, 121 unique byte contents; trajectories 22 present-valid / 4 absent / 0 blocked, 128 refs = 128 expanded,
  75 overview-deduped stations.
- build (explicit `dist` from the successful build above): 26/26 routes present, provenance `ok`, 0 build findings;
  chapters, nav, story paragraph sequences, `dt/dd` notes with real show conditions, map payload station
  id/year sequences and derived plate/upright assets all match source.

Mutation checks against copies of `dist` in the results directory (not the production tree) reproduced each
build failure as designed: dropped story chapter, dropped paragraph, wrong notes value, dropped map station,
missing derived asset, missing route, and stale page → exit 2. None of these mutated trees was used as evidence
of production health.

No production data was edited to make the audit green. Reports: `/workspace/catalog-data-validator-results/`
(`2026-11-08-prod-audit/`, `2026-11-08-prod-source/`, `2026-11-08-prod-build/`, plus mutation probes).
`.github/workflows/catalog-data-validator.yml` was syntax-checked locally but not executed (no push/PR).
