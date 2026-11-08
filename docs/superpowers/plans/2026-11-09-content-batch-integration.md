# Content batch integration — controlled serial single-writer plan

> Worker: writing-plans, test-driven-development, systematic-debugging, verification-before-completion.
> Single serial writer on branch `content-batch-integration`. No second writer, no sub-agents that write,
> no push / PR / merge / publish before parent independent acceptance.
> Status: **Task 0 (contract) + Task 1 (A0 only) in this round.** Batches B1…B4b are planned, not applied.

## Goal

Land the reviewed content batches as a reproducible, auditable sequence of *record-granular* CAS
transactions on the real site tree — starting with A0 (trajectory order only, 3 records), and stopping
for parent verification before any further batch, any push, any PR.

## Five questions

- **Known problem.** 25 records have per-batch limited preparation reviews; there is no real
  transaction applier, no lock, no journal, and no full 25-record overlay verification. Prior "apply"
  material (`apply.py`, whole-index snapshots) is explicitly obsolete and unsafe.
- **Benefit now.** A falsifiable checkpoint: one batch, five files, provable base→new transition, with
  real rejection of drift, and a re-runnable no-op on an already-applied tree.
- **Cost / non-goals.** Transaction + rollback injection cost; no UI/validator work, no schema change,
  no marks/layout/date changes, no batch beyond A0, no 25-record all-at-once application.
- **Worth it.** Yes: A0 is a hard prerequisite for B2b and is pure ordering, so it is the cheapest possible
  real transaction to prove the applier contract on before any content-bearing batch.
- **Simpler option chosen.** A0 first on the real tree; every other batch is only planned here and may be
  dry-run on throw-away copies. No re-verification of historical sources in this round.

## Baseline correction (recorded, immutable audit trail)

| item | value |
|---|---|
| superseded baseline | `15472930cf1ee4bb9f3ba6e09711de620642fede` (PR #178-era local `main`) |
| why superseded | stale relative to real remote `main`; the dispatch freeze captured it as `actualMain`/`targetRoot` |
| freeze file disposition | `/workspace/content-batch-integration-dispatch-freeze.json` sha256 `bbf80f78…aeeac` — **kept as error-baseline audit record only** |
| corrected baseline | `59f446917a9ebb14a180359b929b02fe28193f4a` (PR #183), confirmed by SCM broker `get_branch` and realtime `git ls-remote --heads origin` (exit 0) |
| ancestry | `git merge-base --is-ancestor 15472930 59f44691` → exit 0 |
| branch action | `git merge --ff-only 59f44691…` on `content-batch-integration` only, exit 0, 27 files |
| untouched | `refs/heads/main` still `15472930…`; no reset; no worktree WIP lost (pre-merge evidence saved) |
| pushed | no; remote has no `content-batch-integration` head (`ls-remote --heads` empty, exit 0) |

The freeze JSON stays byte-identical on disk. Its stale `actualMain`/`targetRoot` are *not* the effective
baseline. All *effective* pins in §0.3 are frozen values the applier only **compares against** at run time —
a runtime re-hash is a verification signal and never an approval; nothing trusts the freeze's stale
root/identity, and no file is re-sampled to make a mismatch go away.

## Task 0 — Frozen contract (agreed before any implementation)

### 0.1 Root identity

- Target root: `/home/box/box-coding/worktrees/lu-ceam.github.io/content-batch-integration`
- `lstat` chain `/` → `/home` → `/home/box` → `box-coding` → `worktrees` → `lu-ceam.github.io` → root:
  every ancestor must be a real directory (no symlink), root `st_dev=65040`, `st_ino=1782673`.
- Root dev/ino is compared against the **external binding** generated independently by this session
  (`/workspace/content-batch-integration-results/binding.json`, digest file beside it). Binding fields:
  baseline correction, pins, whitelist, per-leaf dev/ino/size/nlink/symlink/sha256.
- Any root/identity mismatch → **STOP**, no write. The binding of a delivery root, of a source root, or of
  any earlier parent root must not be reused.

### 0.2 Write whitelist

DATA (exactly five paths, nothing else):

```
records/records/cs6785/record.json
records/records/4816856/record.json
records/records/movcl014/record.json
records/index.json
records/changelog.json
```

SUPPORT (separate commit): `scripts/content-batch-integration*` (+ dedicated `*.test.mjs`/fixtures with
the same prefix), `docs/content-batch-integration*`, this plan file.

Forbidden, enforced by test: `src/**`, `public/**`, `records/marks/**`, layout/`records-layout.json`,
`package.json`, `package-lock.json`, `.github/workflows/**`, `scripts/catalog-data-validator*` and its
docs/tests, d37779/unknown-time contract edits, and any other record/story/entity of any other batch.

### 0.3 Pins — split into *executable pins* and *evidence-only pins* (frozen; a runtime re-hash never approves)

**Executable pins** (inputs to the applier; must equal the approved value on every run):

| pin | sha256 | role |
|---|---|---|
| `staging/A0/v2/content-ticket.v2.json` | `98358de79858aad1d1b2f98f8b3dd4ccb3e7b07eb48d91153b33f2300c292715` | executable |
| `staging/A0/v2/index-cas-plan.v2.json` | `39686c33215aa63a3cfcedde448ef0051268c0e5fa35d3f653e3b927629ad8b9` | executable |
| `staging/A0/v2/delivery-manifest.v2.json` | `677350794cf324d1bf65dba592d26285627f55b565b2f5c55284eccbd98cd2bd` | executable |
| `coordination/batch-status.json` | `5c0814d7ebc574a331ea298d03ee3c31d60d9cc6222324b8593494f269eaf8ee` | executable |

**Evidence-only pin** — the A0 review evidence is cited by an *immutable excerpt*, not by a mutable
whole-file hash:

| item | value |
|---|---|
| source file | `/workspace/content-a0-b1a-intake-audit.md` |
| reviewed block | 1-indexed lines 402–453 (the “§402–455” A0 v2 review block, trimmed to its last content line) |
| excerpt | `results/amendments/intake-audit-excerpt-v1.txt`, 9477 bytes |
| excerpt sha256 | `e80bf729367399f7cda5d70574ad6fc506e786c3edf81a69b548a38c36f47b72` |

**Why the split exists.** The whole-file SHA of that audit ledger was `c6ec4961…c58b4` when Task 0 was
written and is now `509b2749…208e2`: the parent *appended* a d37779 personal-preparation block at offset
165936 (3965 bytes, `f2e72e49…26bd`). The first 165936 bytes are byte-identical to the old file (verified),
the appended region contains no A0 ticket/CAS sha, and no A0 executable pin moved. That is a **ledger
append to a non-executable audit file**, which is categorically different from *execution package drift*
— so it is recorded as such and does **not** block or authorize A0.

**Amendment discipline.** A pin value is frozen at approval. A runtime re-hash may only *verify* the
approved value; it may never re-sample the file and adopt the new bytes as approval. Any pin change needs
a new numbered, parent-approved amendment under `results/amendments/`. `binding.json`
(canonical digest `04aa3d53…7b87a04`; raw file SHA `b49f6870…a6076`, a different value because it covers
pretty-printed bytes of the same object) and the dispatch freeze are **never regenerated** to make a
mismatch disappear. See `results/amendments/amendment-v1.json` (canonical digest
`4238fb03e5bb1c479844b18c125980b558208ea6064b74e1797f0065570dbca1`, status
`candidate-pending-parent-approval`, `effective:false`) for the versioned overlay the parent must fix.

Only current-effective versions are usable: A0/B1/B1b/B2a/B2b/B3a/B3c/B4a = v2, B3b/B4b =
`original-current`; B3a `content-base` only through its v2 wrapper. Forbidden: any v1 ticket, the B4a
`intermediate-first-seal`, and the original `apply.py`. d37779 personal-preparation material is
out of scope here and is never imported by A0.

### 0.4 BASE / NEW / partial policy

- **BASE-only batches**: B2a, B3a, B3b, B3c, B4a, B4b (and the A0→B2b→B3c chain once B3c has landed:
  B2b's "all-NEW is idempotent" licence expires after B3c's Event/Work update; old Event must never be
  restored over the newer one).
- **NEW-tolerant (idempotent) batches**: A0 and B2b v2 — but idempotency is a **whole-batch** property,
  never a per-leaf one. A run is a no-op (`already applied`, exit 0) only if **all** of the following hold
  simultaneously: every planned record leaf is NEW; every planned `records/index.json` row is NEW with
  `updatedAt`/`generatedAt`/`schemaVersion`/id order/21 unrelated rows unchanged; **exactly one** matching
  planned log event exists on an otherwise byte-preserved changelog prefix; and every leaf the batch does
  not plan to touch is still at its expected BASE/current sha. Nothing is rewritten in that case.
- **Per-leaf NEW never implies success.** If one record is NEW while another planned leaf is BASE, or the
  index row was updated without the log event, or the log event exists but a record is not NEW, the run is
  **partial → STOP (EXIT_PARTIAL)**. A per-leaf NEW must never be used to “swallow” a half-applied batch.
- **Unrelated changelog appends are always preserved.** The changelog is never normalized, compacted or
  rewritten to a reflected snapshot: the CURRENT array is the base, the planned events are appended at the
  tail, and any unrelated entries appended by another process stay exactly where they are. If an unrelated
  append happens between the lock-free re-read and the locked re-read, the run rebuilds the merge from the
  fresh CURRENT; if it happens after the lock, the pre-write re-lstat/re-hash catches it and STOPs.
- **partial for a fresh run**: a tree state where some leaves are BASE and some are NEW is a STOP and is
  never auto-"completed". Only the *journal owner* may finish a partial state, and only when the journal's
  recorded pre/post hashes prove every file matches the journal (see §0.5).
- Byte-identical reuse of an existing entity is allowed; same-ID-different-bytes is a STOP.

### 0.5 Transaction, journal, rollback, and what is *not* claimed

1. Acquire an exclusive lock file outside the tree (`results/lock/<dev>-<ino>.lock`, `O_EXCL`, pid +
   start time + host). Stale lock with a dead pid is reported, never silently deleted.
2. **Under the lock** re-read every leaf from disk (`lstat` + bytes) and re-derive: index entry canonical
   hashes, record content shas, record directory tree shas, 7 dependency event shas, changelog shape.
   Any drift → STOP with no write.
3. Build all new bytes **in memory** (never a whole-index snapshot from a package; the index is merged from
   CURRENT, only `sha256` of the three named rows changes).
4. Write the journal (`results/journal/<runId>.json`, atomic tmp+rename) with per-leaf pre-sha / post-sha /
   owned identity (dev+ino+`nlink`) / backup path / tmp path and the stage; every journal transition is
   itself flushed before the tree write it describes.
5. Copy pre-images to `results/backup/<runId>/` and re-verify their shas **and** their owned identity before
   any tree write. A backup whose sha does not match the journal's recorded pre-sha aborts the run here.
6. Write each new leaf to `<leaf>.cbi-tmp-<runId>` in the same directory, `fsync` the file, then `rename`
   in the fixed order: 3 × `record.json` → `changelog.json` → `index.json` (index last: it is the
   documented commit marker, `records/README.md` §index.json).
7. Post-verify all five leaves equal the planned NEW sha, then mark the journal `complete`, release lock.

**8. Rollback ownership rule (replaces blind restore).** Every write and every rollback step is
*owned*, not blind:

   - Before writing a leaf: `lstat` it and re-hash its bytes. It must still be the run's recorded pre-image
     (same sha, same dev/ino, `nlink` unchanged, still a regular file). Otherwise → **STOP with no write**.
   - Before rolling a leaf back: `lstat` it again. It must be *this run's own post-write* result (sha equal to
     the journal's post-sha, same dev/ino). If the leaf is neither the run's post-image nor the run's
     pre-image — i.e. some external process touched it — rollback **STOPs for that file**: it does not
     restore the backup, does not mtime-chase, does not “merge”; it records the observed sha, keeps the
     journal and the lock, and exits `EXIT_ROLLBACK_CONFLICT` for human review.
   - A leaf that is already back at its pre-image is treated as already rolled back (idempotent), so a
     crashed rollback can be re-driven without double-writing.
   - **If rollback itself fails** (permission, stale identity, backup sha mismatch): nothing is auto-retried;
     exit `EXIT_ROLLBACK_FAILED`, keep lock and journal, print the manual recovery steps.

**9. Directory fsync and crash recovery.** After each `rename`, the *containing directory* is `fsync`-ed so
that the rename itself is durable, not just the file contents. Crash recovery is journal-driven:

   - journal absent → nothing happened, safe to start over;
   - journal `preparing` → no rename happened; the tmp files are garbage and may be removed;
   - journal `writing`/`written` → the journal, not the tree, is authoritative: every leaf whose CURRENT sha
     equals its recorded pre-sha is not yet written, every leaf whose sha equals its recorded post-sha is
     written; a leaf matching **neither** is an external modification → STOP, do not finish, do not
     overwrite;
   - journal `complete` → a completed run; a re-run takes the whole-batch no-op path (§0.4) or STOPs.
   - Recovery never silently adopts a foreign change: the SHA-and-identity comparison above is the gate.

**10. What is explicitly *not* claimed.**

   - This is **not** a fully atomic multi-file transaction. Every single leaf replacement is atomic
     (same-directory `rename`), and `index.json` is written last as the documented commit marker, but a
     cross-process reader can still observe the intermediate window (3 record files updated, changelog
     updated, index still old). `index`-last and directory `fsync` reduce the window; they do **not** give
     snapshot isolation.
   - The plan therefore does **not** promise that readers never see an intermediate state. A reader needing
     a consistent view must take the integration lock or wait for `index.json` to advance.
   - Crash recovery is *recoverable*, not *invisible*: it is only as good as the journal being flushed
     before the write it describes, which is why step 4 precedes step 6.

11. Re-run behaviour: whole-batch all-NEW → no-op exit 0 (`already applied`); whole-batch all-BASE → normal
    apply; anything mixed → STOP (see §0.4).

### 0.6 Controlled failure injection (must be provable)

`--inject=before-lock | inside-lock-cas-drift | mid-write-after-N | rollback-fail | rollback-conflict |
post-write-verify | external-touch-after-write`
Hidden test-only switch, documented. Each injection asserts the tree is byte-identical to BASE afterwards,
except the two *owned-STOP* cases (`rollback-fail`, `rollback-conflict`) which must leave the journal and
lock in place and must **not** overwrite the externally-changed leaf with a backup.

### 0.7 Global STOP conditions

Wrong root/identity/binding digest · **pin re-sampled instead of compared** · pin drift · any dependency
event drift · related index entry not BASE/NEW · `updatedAt`/`generatedAt`/id order/unrelated entries not
preserved · changelog duplicate or non-prefix-preserving · unrelated changelog append dropped · any file
outside whitelist needed · payload sha ≠ planned NEW · lock held by a live pid · journal from an unfinished
run with an unresolved state · a leaf whose sha/identity is neither this run's pre- nor post-image (external
modification, in write or in rollback) · per-leaf NEW inside a partially applied batch · a batch's BASE-only
precondition not met.

## Task 1 — A0 apply (this round)

Contract facts (frozen in the ticket/CAS plan, re-checked by the applier):

- 3 records, **trajectory order only**; `places` multiset identical, non-trajectory JSON identical.
  - `cs6785`: `petersburg-ruslan-premiere` (1842) before `budapest-solti-birth` (1912).
  - `4816856`: `new-york-phil-founded` (1842) before `london-decca-founded` (1929).
  - `movcl014`: `los-angeles-1997` (1997-03-12) before `boston-1997` (1997-04).
- `records/index.json`: only the three named rows' `sha256`; `updatedAt` (3 rows), `generatedAt`,
  `schemaVersion`, all 21 unrelated rows and the full 24-id order stay byte-identical.
- `records/changelog.json`: exactly one appended event, `eventHash 0574f238…a310`,
  `added=[]`, `changed=[cs6785,4816856,movcl014]`, `removed=[]`. The CURRENT 40-entry array is preserved as a
  byte-prefix; if another process appended an unrelated entry before this run, that entry stays and the
  planned event is appended after it (never replacing/normalising the array).
- No image/story/marks/date/body change: `details/*`, `images/*`, `story.md` byte-identical.

Steps:

0. **Pin gate before anything else**: re-hash the four executable pins and compare to the *approved* values
   in §0.3. A mismatch is a STOP, never a reason to re-hash-and-adopt; the intake-audit evidence pin is
   checked against the immutable excerpt sha, not the whole file.
1. **RED**: write `scripts/content-batch-integration-apply.test.mjs` against the not-yet-existing
   applier; record the failing run (module missing → non-zero).
2. **GREEN**: implement `scripts/content-batch-integration-apply.mjs` until every test passes, including
   the rejection and injection cases.
3. Dry-run on the real tree (`--dry-run`), then the real locked run.
4. Independent post-checks (external scripts under `results/`): five-leaf shas, index preservation
   fingerprint, changelog prefix, directory tree shas, `node --experimental-strip-types --test`,
   `npm run check`, `npm run build`, `git status` whitelist.
5. Two local commits: support (scripts/plan/docs) and then A0 data (only the five DATA paths), each with
   an explicit path list, no `git add .`, no `--no-verify`.
6. **STOP for parent independent acceptance.** No push, no PR, no merge, no publish, no B1.

## Serial order and gates (planned only, not executed this round)

`A0 → B1/v2 → B1b/v2 → B2a/v2 → B2b/v2 → B3a/v2 → B3b → B3c/v2 → B4a/v2 → B4b`

Cross-batch hard edges that must be honoured in the order above:

- `A0` 3 reordered records → `B2b/v2` content BASE.
- `B1/v2 hzel700` 5 Mendelssohn concerto entities (people/works/events) → `B3b` `ml4001`.
- `B1/v2 138848` Richter Person + Birth Event → `B4a/v2` `src4119`.
- `A0 → B2b` Beethoven-5 Work/Event → `B3c/v2` (B3c updates the same Event to
  `c1d8501f…f4a`; after B3c the B2b create-absent/old Event must never be replayed over it).
- `B2a` cello range Event (`evt-bach-cello-suites-koethen`, 1720 → 1717 range anchor) must not be
  re-covered by any old per-record copy.
- `B4a/v2` two shared Events use only the final v2 NEW shas; the original B4a NEW shas are not bases.

Per batch gate (repeat for each of the ten steps):

1. Task-0 style contract update in this file for that batch (BASE/NEW/partial, exact leaf list, exact
   index rows and entity index unions, exact log events).
2. RED: dedicated test case per new behaviour (drift, duplicate, ordering, entity-ID union) fails first.
3. GREEN: applier handles it; batch dry-run on the real tree.
4. Real local apply commit, explicitly staged paths only.
5. Serial overlay check on a throw-away copy (`/workspace/…-overlay-<batch>/`), never in the tree.
6. Parent independent verification of that commit.
7. Only then: push/PR/CI → CI green on the exact PR head → parent merge.
8. After B3c: B2b's all-NEW idempotency licence is revoked in this plan (BASE-only from then on).

Blocked / out of scope: `d37779` (unknown-time contract) stays a whole-record contract blocker; UI and
validator changes; `scripts/catalog-data-validator*` (separate lane, its green is not our gate);
`records-legacy` writes except the B1 lpbr6083 legacy index/log rows in its own step.

## Verification commands (this round)

```bash
PATH=/home/box/.local/node-v22.23.4-linux-x64/bin:$PATH
node -v                                   # v22.23.4
node --experimental-strip-types --test "src/data/**/*.test.ts" "scripts/*.test.mjs"
npm run check
npm run build
node scripts/content-batch-integration-apply.mjs --dry-run --root "$PWD" \
  --results /workspace/content-batch-integration-results \
  --a0 /workspace/vinyl-history-enrichment-2026-11-08/staging/A0/v2
```

Pin/evidence regeneration is *not* part of a verification run; it produces a new numbered amendment that
the parent fixes (see §0.3). Current overlay: `results/amendments/amendment-v1.json`
(canonical digest `4238fb03e5bb1c479844b18c125980b558208ea6064b74e1797f0065570dbca1`,
`effective:false`, awaiting parent approval) plus the immutable excerpt
`results/amendments/intake-audit-excerpt-v1.txt` (sha256 `e80bf729…47b72`).

Results of every run are appended to `/workspace/content-batch-integration-results/ledger.jsonl`.
