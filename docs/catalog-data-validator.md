# Catalog data validator

Read-only catalog and delivery audit for the record collection. It answers four questions per disc —
how many photos, is there a 述语 (narrative), how many map stations, which catalog fields are present /
unknown / missing — and one delivery question: does what exists in the source actually reach the
production build?

It never writes into the content tree, never builds, never exports, and never touches the network.

```bash
node --experimental-strip-types scripts/catalog-data-validator.ts audit
node --experimental-strip-types scripts/catalog-data-validator.ts audit --dist dist
node --experimental-strip-types scripts/catalog-data-validator.ts ratchet --baseline <approved.json>
node --experimental-strip-types scripts/catalog-data-validator.ts --help
```

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
  expectation. No `--dist` ⇒ the layer is `not-requested`, not "passed". A missing/invalid/stale dist is
  an input problem (2), not a content-missing conclusion. The validator never builds.
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
  JSON-parsed (never a regex guess). Checked per record: route, chapter set and order, nav labels,
  story paragraph sequence fingerprint (whitespace-normalised, order-sensitive; hidden templates and
  Pagefind caches are not counted), `dt/dd` against `discNotesFields` with the real `showMatrix` /
  `showPressing` conditions, map chapter presence and station id/year sequence, derived plate/upright
  assets (contract-hidden `runout` is excluded), and the `/records/map/` overview disc set against the
  dynamic trajectory set. Provenance: a page older than any of its source inputs (record.json, story.md,
  index.json, layout) is `BUILD_STALE` ⇒ exit 2.

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

`ratchet` is the only mode that can forgive an existing error, and only an explicit baseline:

```json
{
  "schemaVersion": 1,
  "entries": [
    {
      "code": "TRAJECTORY_GUIDE_ORDER_INVERSION",
      "recordId": "cs6785",
      "fieldPath": "trajectory.places[1].year",
      "valueSha256": "<64 hex of the finding value>",
      "reason": "known legacy order issue, awaiting content migration",
      "approvedBy": "<record of approval>",
      "approvedAt": "2026-11-08",
      "reviewBy": "2027-02-08"
    }
  ]
}
```

The entry matches only when code, recordId, fieldPath **and** the value hash are identical and `reviewBy`
has not passed. Expired, hash-changed, new or stale entries fail. Wildcards, `ALL` and `valueSha256: "*"`
are rejected as overbroad; an unreadable/missing baseline is exit 2. The validator never writes or updates
a baseline. Accepted gaps are a different approval and never convert automatically.

There is deliberately **no** committed production baseline yet: approving existing errors is a curator
decision. Until then the production audit exits 1 (or 2 when a required check is blocked), which is the
correct, honest result.

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
build route/chapter/paragraph/notes/map/asset/overview/stale failures, hidden-template false positives, and
the full exit matrix (0/1/2, baseline hash/expiry/overbroad, report write failure).

`.github/workflows/catalog-data-validator.yml` is a **separate, non-required** job: it preserves the real
exit code, uploads the JSON/Markdown artifact even on failure (14 days), and uses no `continue-on-error`.
It does not change `ci.yml`, the build command, or required checks.
