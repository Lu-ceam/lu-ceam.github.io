# Design: multi-disc face fields on the layout layer

Date: 2026-10-27  
Site: https://lu-ceam.github.io (Astro)  
Status: Locked by Rolf via 唱片管理员 («挺好的，试试吧»). Schema / zod / UI this PR. Curator export shape and caption migration wait for a follow-up after merge.

## Direction

Layout `details[]` may name a physical face with optional positive integers `disc` and `side`, aligned with the curator export filename convention already in use (`label-d1-s2`, `runout-d…`). No A/B letter fields. `marks[].side` stays the leader direction (`auto` / `left` / `right`).

## Locked contract

| Item | Value |
|---|---|
| Fields | `details[].disc?: number`, `details[].side?: number` — positive ints, optional |
| Letters | Forbidden. Do not add `face: 'A' \| 'B'` or similar |
| Uniqueness | `(part, disc ?? 0, side ?? 0)` — same `part` may repeat with different disc/side |
| Assets (explicit both) | `/records/<id>/{part}-d{disc}-s{side}.webp` and `-upright.webp` |
| Assets (else) | Legacy `/records/<id>/{part}.webp` (+ `-upright.webp`) |
| Resolve | Explicit disc+side win; else parse `-dN-sM` from `source` basename |
| Lone explicit | If only one of disc/side is set, do not merge with the parsed face |
| Chrome short | `formatDetailFace` → `d1-s2` |
| Chrome long | `formatDetailFaceLong` → `Disc 1 · side 2` (optional; documented) |
| UI | Show the short face label in detail chrome only when a complete face resolves; single-slot pages stay unchanged |
| `marks[].side` | Unchanged leader L/R/auto |
| Export / captions | Out of scope this PR — curator follows after merge |

## Path vs display

Asset paths are driven by **explicit** layout `disc`+`side` only. Parsing a face from `source` feeds the chrome label (and `resolveDetailFace`) but does **not** rename `plate.src` / `upright.src`. Existing `records-layout.json` rows and `public/records/<id>/{part}.webp` assets stay valid without rewrite; curator migration of assets and captions is a later PR.

## Helpers (`src/data/records.ts`)

- `parseFaceFromSource(source)`
- `resolveDetailFace(detail)`
- `formatDetailFace(face)` / `formatDetailFaceLong(face)`
- `detailPlatePath` / `detailUprightPath` / `detailDomKey`
- `layoutDetailFaceKey` — uniqueness from explicit fields
- `layoutFileSchema` — exported for unit tests of the refine

## UI wire

`src/pages/records/[id].astro` resolves the face per detail. When `formatDetailFace` is non-empty, a muted `.detail-face` sits in the figcaption chrome ahead of the caption. `data-disc` / `data-side` are set when the explicit fields are present. SVG / mark ids use `detailDomKey` so two `label` faces will not collide once explicit fields land.

## Out of scope

- Rewriting current layout entries to add `disc` / `side`
- Renaming public WebP assets to the d/s stem
- Curator export schema, caption migration, or import script changes
- Mobile runway Approach A (separate track)

## Verification

- `node --experimental-strip-types --test src/data/records-disc-side.test.ts`
- Existing `records-layout.json` still passes `layoutFileSchema`
- `npm run check` (and CI build on the PR)
