# Catalog data validator

Read-only catalog and delivery audit for the record collection. It answers four questions per disc —
how many photos, is there a 述语 (narrative), how many map stations, which catalog fields are present /
unknown / missing — and one delivery question: does what exists in the source actually reach the
production build?

It never writes into the content tree, never builds, never exports, and never touches the network.

**Delivery status (2026-11-09): manual only.** The tool is run by hand from a workstation (see
"Manual execution" below). No automatic CI job exists for it in this tree: the separate non-required
workflow that was drafted for it has been removed and its rollout is deferred to a later, explicitly
authorized change. Nothing about the validator's behaviour or exit contract changed with that removal;
only who invokes it did.

```bash
# source-only strict audit
node --experimental-strip-types scripts/catalog-data-validator.ts audit

# controlled build + receipt, then compare that exact output against the source
node --experimental-strip-types scripts/catalog-data-validator-build.mjs --dist dist --receipt <receipt.json>
node --experimental-strip-types scripts/catalog-data-validator.ts audit --dist dist --receipt <receipt.json>

node --experimental-strip-types scripts/catalog-data-validator.ts ratchet --baseline <approved.json>
node --experimental-strip-types scripts/catalog-data-validator.ts --help
```

`scripts/catalog-data-validator-build.mjs` is **not** part of the validator: it is the only place that runs
the existing `npm run build`, and it writes a receipt that binds the output to the input fingerprint. The
validator itself still never builds.

## Exit contract (PRD §12)

| result | `audit` | `ratchet` |
| --- | ---: | ---: |
| requested layers complete, no error | 0 | 0 |
| new / unapproved error (incl. `pending-contract`) | 1 | 1 |
| only approved, unexpired, exact-hash old errors | **1** | 0 |
| new/worse error, hash change, expired exception, invalid or overbroad baseline | 1 | 1 |
| unusable baseline file (unreadable / missing) | 2 | 2 |
| argument error, crash, report unwritable, full set unconfirmable, requested layer blocked | 2 | 2 |

Priority 2 > 1 > 0. A written report does **not** mean exit 0. Warnings and optional historical
fact-checking (`notChecked`) never change the code by themselves. A precise **accepted gap** (an approved
missing photo role or field) stays listed as an error but does not gate; the conclusion then reads
`accepted-gap-issues`, never `pass`.

`audit` always returns 1 when approved baseline errors exist, so a green CI job can never hide
migration debt.

## Layers

- `source` (always requested): index/directory identity, schema, photo decode, story chapters, map
  stations and guide order, catalog fields, expected manifest.
- `build` (only with `--dist`): compare an **explicit successful** build output with the same source
  expectation. No `--dist` ⇒ the layer is `not-requested`, not "passed". A missing dist, a missing/unreadable
  receipt, a failed/foreign receipt, or a changed input/output fingerprint is an input problem (2), not a
  content-missing conclusion. The validator never builds.
- `live` (not implemented in this shipment): always `not-requested`; no request is made. Adding it is a
  separate, explicitly authorized change with its own exit contract (0 complete and no difference,
  1 confirmed delivery difference, 2 unverified/network).

## What is really checked

- **Inventory** — both export roots (`records/`, `records-legacy/`) are read as raw indexes *and*
  directories before parsing. Duplicate index ids, cross-root duplicates, index-without-directory,
  directory-without-index and `record.json` id mismatches are errors; a conflicted row stays in the
  report as `blocked` and is never silently resolved by a `Map`. The union is dynamic: no 26/22 constant.
  A legacy directory with no index means the full set is unknown (exit 2). The index `sha256` is
  recomputed with the existing `scripts/record-sha.mjs` algorithm and reported (mismatch = warning, since
  the production loader does not verify it today); it is never claimed as verified by the loader.
- **Per record** — the real strict `parseRecord` + `storyBody`. One bad record never removes the others.
- **Photos** — every `images[]`/`details[]` reference: path normalisation, realpath/symlink containment,
  regular file, non-zero size, magic-byte format match and a **full JPEG/PNG/WebP decode** through `sharp`
  (installed as Astro's optional dependency; the validator never installs anything). Reference counts,
  unique referenced assets, unique byte contents and per-kind counts are separate numbers; the same file
  used by `images[]` and `details[]` is legal and counted once; duplicate same-purpose references are
  errors; byte-identical files under different paths are warnings with evidence; unreferenced files are
  warnings. Missing `cover-front` stays a hard schema error — "legal no map" never means "legal no photo".
  If the decoder is unavailable the decode check is `blocked` (exit 2); existence-only is never a pass.
- **Story** — `sourceBodyPresent` and `storyChapterPresent` are independent. Chapters come from the real
  `parseStorySections` / `buildDiscChapters` (aliases, no-H2 text, `## 资料` narrative → 述语). Whole-value
  placeholder lists are versioned (`placeholder-tokens-v1`); prose containing 待补拍 or 年份未核 is not a
  placeholder. No minimum length quota.
- **Map** — expansion through the real `loadEntityCatalog` / `assertEntityGraph` /
  `assertTrajectoryPointers` / `expandRecordTrajectories`. Absent trajectory is `absent` (legal, no station
  invented). Blocked expansion keeps `expandedStations: null` with a dependency chain instead of a fake 0.
  Guide order compares known anchors only; 约年, ranges, "年后" and mixed precision are `not-checked`, not
  false inversions. A placeholder time label such as `—` with an integer year (d37779/utrecht) is a
  **`pending-contract` error** — not a warning, never auto-waived, never migrated.
- **Fields** — required/optional presence, whitespace-only, whole-value placeholder, type/shape; optional
  keys (`year`, `trajectory`) report `optional-absent`. Important: a field's verification state does not
  inherit the record's `pending`/`verified` status. Without field-level evidence it stays `unknown`;
  `verificationStatus`/`statusLabel` consistency comes from the schema. A policy file may declare a field
  `unverified`/`not-applicable` with reason, approver, date and review date (still not a schema bypass).
- **Build** — `parse5` parses the real page, then the `data-payload` HTML attribute is decoded and
  JSON-parsed (never a regex guess). Checked per record:
  - **route set, both directions** — every `dist/records/*/index.html` is enumerated and diffed against the
    dynamic authoritative id set. Only routes provably not disc pages are ignored, recognized by their real
    `mode:"overview"` payload (never by a name guess). An extra page, or a same-count replacement, is
    `BUILD_ROUTE_EXTRA`.
  - **chapters and nav binding** — the `[data-chapter-kind]` sequence *and* each pane's `aria-label`; each
    `[data-chapter-goto]` must be the index of the pane it claims (`无 label 变化` but `goto=99` or a swapped
    order fails). Story paragraph sequence fingerprint stays whitespace-normalised, order-sensitive; hidden
    templates and Pagefind caches are not counted.
  - **notes** — `dt/dd` against `discNotesFields` with the real `showMatrix` / `showPressing` conditions.
  - **map** — chapter presence, station id/year sequence *and* the real expanded place fields
    (`yearLabel`, `city`, `cityZh`, `role`, `lon`, `lat`, `zoom`, `blurb`, `eventId`, plus any invented key).
    Altered coordinates/captions, a lost `eventId`, or a date label degraded to a bare year fail; the
    d37779/utrecht `—` sentinel must be delivered as-is (it stays a source `pending-contract` error).
  - **images** — the layout-derived display map (hero on the non-reveal path, plate, upright with
    `transform.crop`) is checked against the `<img>` elements the page really renders, including width,
    height and crop geometry. A file existing in `dist` is never delivery; removing `src` or pointing at a
    raster the layout never produced fails. Contract-hidden `runout` stays unrequired.
  - **derived assets** — expected plate/upright paths exist in `dist`.
  - `/records/map/` overview disc set against the dynamic trajectory set.
  - **provenance** — only a verified build receipt counts (see below). A page merely newer than its sources
    is *not* proof; a touched, re-copied or hand-edited old dist fails.

Whole-model fidelity: the layout merge, reveal detection and public hide rules are taken from the
production module itself (`src/data/records.ts`) as an oracle, imported read-only. If that module throws,
every raw row is still reported and the dependent checks are `blocked` (exit 2) — the production module is
not modified and no relaxed copy of it exists.

## Reports

Written to `--out` (default `/workspace/catalog-data-validator-results/<UTC stamp>/`, i.e. outside the
production tree):

- `catalog-report.json` — `reportVersion: 1`; mode, requested/not-requested layers, scope (`full` /
  `selected`), commit + dirty state (`null` when unknown, never guessed clean), fingerprints, summary
  (unknown is never 0), coverage + required-check status, a per-record matrix, and separate
  `findings` / `notChecked` arrays. Every finding carries a stable `key` (`code|recordId|fieldPath`),
  layer, severity, status, exact `fieldPath`, expected/actual, reason, recommendation, evidence and
  baseline id.
- `catalog-report.md` — human summary, per-record matrix, and separate sections for active errors,
  pending-contract, accepted-baseline, accepted gaps, blocked, warnings and not-checked.

Reports contain only public fields, stable ids, counts, fingerprints, paths and trimmed error context.

## Baseline / ratchet

`ratchet` is the only mode that can forgive an existing error, and only an explicit baseline.

Only **legacy-semantics** rules may appear in a baseline —
`TRAJECTORY_GUIDE_ORDER_INVERSION` and `STORY_SOURCE_PLACEHOLDER` (`BASELINE_ELIGIBLE_CODES` in
`report.ts`). Image decode/escape, schema, path/security, dangling entity, source↔build delivery and
inventory/coverage/execution errors are hard gates: an entry naming one is rejected as `overbroad`
(exit 1) and can never match, whatever the hash says.

Dates are strict calendar dates (`YYYY-MM-DD`). A non-calendar date (`2026-02-30`), a garbage value
(`zzzz`), a future `approvedAt`, or `reviewBy` before `approvedAt` makes the baseline unusable (exit 2).
A legitimately expired `reviewBy` stays a staleness failure (exit 1).

```json
{
  "schemaVersion": 1,
  "entries": [
    {
      "code": "TRAJECTORY_GUIDE_ORDER_INVERSION",
      "recordId": "cs6785",
      "fieldPath": "trajectory.places[1].year",
      "valueSha256": "<64 hex of code+recordId+fieldPath+stationId+expected+actual>",
      "reason": "known legacy order issue, awaiting content migration",
      "approvedBy": "<record of approval>",
      "approvedAt": "2026-11-08",
      "reviewBy": "2027-02-08"
    }
  ]
}
```

The value hash binds the exact semantic pair/version: the previous station (`expected.notBefore` /
`previousYear`), the current station id and the actual value all take part, so changing the previous
station while keeping the same current year re-opens the finding. The entry matches only when code,
recordId, fieldPath **and** the value hash are identical and `reviewBy` has not passed. Expired, hash-changed, new or stale entries fail. Wildcards, `ALL` and `valueSha256: "*"`
are rejected as overbroad; an unreadable/missing baseline is exit 2. The validator never writes or updates
a baseline. Accepted gaps are a different approval and never convert automatically.

There is deliberately **no** committed production baseline yet: approving existing errors is a curator
decision. Until then the production audit exits 1 (or 2 when a required check is blocked), which is the
correct, honest result.

## Build provenance (receipt)

`scripts/catalog-data-validator-build.mjs` runs `npm run build` once and writes
`.astro/catalog-build-receipt.json` (override with `--receipt`). The receipt records:

- the build command, exit code and timestamps;
- the commit and dirty state;
- the **input** fingerprint: both indexes, every `record.json`/`story.md`, the entity indexes, the layout,
  the render/model source chain, every `public/records` raster, `package.json`/`package-lock.json`/`.nvmrc`
  and the comparison tool itself;
- the **output** fingerprint: every `/records/<id>/` page and payload hash plus every record asset hash.

`audit --dist … --receipt …` recomputes both and accepts only an exact match for the current commit.
Missing → `BUILD_PROVENANCE_MISSING`, unreadable → `BUILD_PROVENANCE_UNREADABLE`, failed build →
`BUILD_PROVENANCE_FAILED_BUILD`, other commit → `BUILD_PROVENANCE_FOREIGN`, changed input/output →
`BUILD_PROVENANCE_MISMATCH`. All of them block the required `build-provenance` check and exit 2. mtime is
recorded for humans and is never used as proof, so `touch`ing or re-copying an old `dist` cannot pass.
The receipt is not a substitute for a real build: it can only describe a build that actually ran.

## Typed data / unknown time

The current schema has integer `year` only. `null`/unknown is an unsupported shape: the report says
`TRAJECTORY_UNKNOWN_CAPABILITY_UNSUPPORTED` / a schema error and records the semantics separately. The
validator does not relax the schema, does not write `null`, and does not treat `—` as a legal unknown.

## Not checked (and why)

- Historical truth, source authority and version completeness without a machine-readable contract.
  Version role coverage is reported; "complete set" is `not-checked` unless a precise policy declares
  required/accepted-gap per record and role.
- Link reachability/authority (a valid URL is not evidence for a claim).
- Runtime visibility, gestures and map interaction; static HTML cannot prove mobile visibility.
- Live deployment delivery (no live layer in this shipment).

## Manual execution (current delivery)

There is **no** workflow file for this tool in `.github/workflows/`. Running it is a manual, human-driven
step; automatic CI is deferred. The documented sequence is:

```bash
# 0. one-time, in the worktree
npm ci

# 1. controlled build + receipt (the only place a build happens; the validator itself never builds)
node --experimental-strip-types scripts/catalog-data-validator-build.mjs \
  --dist dist --receipt "$OUT/receipt.json"

# 2. audit the source, then the same build output with its receipt
node --experimental-strip-types scripts/catalog-data-validator.ts audit \
  --out "$OUT/source" --source-head "$(git rev-parse HEAD)"
node --experimental-strip-types scripts/catalog-data-validator.ts audit \
  --dist dist --receipt "$OUT/receipt.json" \
  --out "$OUT/build" --source-head "$(git rev-parse HEAD)"

# 3. optional ratchet against an explicitly approved baseline (never auto-generated)
node --experimental-strip-types scripts/catalog-data-validator.ts ratchet \
  --baseline <approved.json> --out "$OUT/ratchet"
```

Keep `$OUT` outside the production tree (for example `/workspace/catalog-data-validator-manual/<stamp>/`),
attach `catalog-report.json`, `catalog-report.md` and the receipt to the hand-off, and report the real exit
codes: `0` pass, `1` data issues, `2` execution/coverage incomplete or unverifiable build provenance. The
two failure classes are distinct on purpose — a content finding is never reported as a tool failure, and a
missing/stale receipt is never reported as a data issue.

Manual execution has no artifact retention, no scheduling and no branch-protection effect; those properties
belong to the deferred CI work, not to this tool. Until that change is authorized, do not add a workflow,
do not re-create one under a different path, and do not present a local run as an automated gate.

## Tests and CI

```bash
node --experimental-strip-types --test scripts/catalog-data-validator.test.ts
```

Tests build isolated temp repositories (own export roots, layout, `public/` rasters, symlinked
`node_modules` for the real schema) and cover: dynamic union, duplicate/cross-root ids, legacy index
missing, index/dir mismatch, empty/H2-only/placeholder/no-H2/alias stories, substring non-placeholders,
missing/corrupt/truncated/escaping/symlinked images, duplicate references, cross-array reuse, byte
duplicates, missing cover-front, per-field states, policy accepted gaps, absent/empty/blocked
trajectories, dangling pointers, real order inversions, fuzzy-time non-inversions, sentinel vs legal 1982,
build route/chapter/nav-binding/paragraph/notes/map-place-field/image-delivery/asset/overview/stale/extra-route
failures, hidden-template false positives, build-receipt provenance (missing/foreign/failed/touched/edited),
the baseline allowlist and strict-date rules, and the full exit matrix (0/1/2, hash change, expiry,
overbroad, report write failure).

**No workflow ships with this tool.** An earlier draft of a separate, non-required
`.github/workflows/catalog-data-validator.yml` job (controlled build+receipt → audit → artifact upload,
real exit code, no `continue-on-error`) was removed in the commit that switched this ticket to manual
delivery; the node CI chain (`ci.yml`) and the deploy workflow were never touched by it. Automatic CI for
the validator is **deferred** to a separate, explicitly authorized change. The removed file is kept
outside the repository for reference only; it is not part of the build, the tests, or any gate, and it must
not be silently re-added or moved to another tracked path.
