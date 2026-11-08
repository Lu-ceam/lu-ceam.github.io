# Mobile chapter presence and boundary
> Worker: executing-plans, systematic-debugging, test-driven-development, verification-before-completion. Single serial owner. This ticket explicitly requests plan+implementation in one isolated branch; do not merge a docs PR or main.

**Goal:** restore existing mobile prose and require release then a new outward gesture to cross chapters.
**Architecture:** pure boundary reducer plus native-scroll adapter and map-owned settled bridge; one resolved mobile chapter table.
**Tech Stack:** TypeScript, Astro, node:test, Leaflet.
**Branch:** mobile-chapter-presence-and-boundary from origin/main 39202914095b2e46a41f2bcb549af688106101d8.

## Five questions
- Known problem: 25 unsectioned stories disappear in marks-only record; one gesture currently crosses chapter; map endpoints lack released handoff.
- Benefit now: existing prose visible and intentional chapter navigation without breaking native long scroll.
- Cost/non-goals: reader/map lifecycle changes; no content/schema, desktop, 44px title slot, crop/marks/multiface geometry changes.
- Worth it: yes, concrete existing reading regressions and accepted scoped PRD.
- Simpler option: no content rewrite or timer lock; small pure state machine plus explicit map bridge is the smallest reliable approach.

## Global Constraints
Authoritative spec: /home/box/web-layout/prd-mobile-chapter-presence-and-boundary.md FULL TEXT, especially §11. All requirements apply. 26 record/notes, story 1→26, map22; FALP explicit distribution unchanged. Native long scroll; no per-move scrollTop, blanket vertical preventDefault, station timer substitute or cloned map root. No browser automation via Shell/Playwright/CDP. No cloud agent, Mac, peer messages, deployment or merge. Demo PASS is not production/browser/real-device PASS.

## Scope and scheduling
One session owns src/data/disc-chapters.ts, src/pages/records/[id].astro, src/data/disc-chapter-reader.ts, src/components/trajectory-map-client.ts, mobile-only src/styles/global.css, existing disc-chapters tests and necessary same-directory dedicated state module/tests. This plan is the documentation exception. Do not modify other paths without decision. Reader/map/page overlap makes lanes non-independent: serial only, no second writer. If proposing parallel work, run scope-check first with exact disjoint paths.

## Task 0 — Freeze contract surfaces before behavior
- [ ] Read PRD entire text, demo/qa/QA.md and review source-review.md; inspect current owner lifecycle and baseline tests.
- [ ] Expand this task with exact exported signatures before implementing consumers. Freeze input types for chapter key/epoch, gestureId, primaryTouchId, owner, start boundary, net projection/peak/retreat/revoked, native scroll distance, cancel/multitouch and transition identity.
- [ ] Pure reducer contract: input events begin/move/end/scroll/cancel/epoch/transition-complete; outputs arm/clear/commit at most once. No DOM/time/scroll writes in reducer.
- [ ] Map message contract: chapterEpoch + gestureId + direction + station identity; boundary-ready only after real flight AND narration settled AND originating gesture end. Reject stale chapter/gesture messages; start during unsettled never gains startedArmed later. Map alone owns station gesture entry. Validated hash target notification must activate map after shell mount before station positioning.
- [ ] Freeze exact DOM hooks and owners in this plan: reader owns mobile pane state/transition; trajectory owns validated station target and endpoint readiness. Reuse current measured shell; no new size owner or geometry vars. CSS boundary/transition hooks mobile scope only, no map internal transform overwrite.
- [ ] Freeze fixture types and names for text/map/multiface, unknown and mixed H2, null/empty/links-only; contract tests first, observe failure, stubs/hooks, pass, own commit.

## Task 0 — Frozen contract surfaces (expanded here before consumers)

### Pure reducer — new `src/data/disc-chapter-boundary.ts` (+ `disc-chapter-boundary.test.ts`)
No DOM, no clock, no scroll writes. Constants: `EDGE_HOLD_PX=2`, `CONFIRM_NET_PX=48`, `AXIS_SLOP_PX=6`, `AXIS_RATIO=1.25`, `RETREAT_HOLD_PX=2`.
Probes: `type BoundaryDir = 1|-1`; `type EdgeMetric = 'css-px'|'station'`; `type EdgeProbe = {dir: BoundaryDir; distance: number; metric: EdgeMetric}`; `withinEdge(probe)` (css-px uses `<=2`, station uses `distance===0`); `scrollEdgeDistance({scrollTop,scrollHeight,clientHeight,dir})` clamps to `[0,max]` first; `scrollEdgeProbe(...)`; `stationEdgeProbe({dir,canStep})`.
State: `{chapterKey, epoch, busy, blocked, armedDir: 0|1|-1, armedEpoch, lastGestureId, pendingArrival, gesture}`; gesture `{id,touchId,startX,startY,x,y,net,confirmDir,startedArmed,projection,peak,axis:'pending'|'vertical'|'other',arriving:0|1|-1,stationConsumed,revoked,dead}`.
Events: `begin|move|end|cancel|scroll|station-consumed|arm|key|epoch|transition-start|transition-complete`. Effects: `{commit:0|1|-1, arm:0|1|-1, armChanged:boolean, prevent:boolean}` — `commit` at most once per reduce.
Identity/message contract: every arm is bound to `chapterKey+epoch+dir`; `startedArmed` is frozen at `begin` from `armedDir`; `cancel/multitouch/epoch` clear arm and gesture; `epoch` also clears `busy`; stale `arm`/`station-consumed` messages are rejected by `epoch` and `lastGestureId`.

### Reader DOM hooks (mobile scope only)
`[data-disc-chapters]` (shell, gets `data-chapter-edge='top'|'bottom'`), `[data-chapter]`, `[data-chapters-stage]`, `[data-chapter-scroll]`, `[data-chapter-map]`, `.disc-chapter-rail`, `[data-chapter-goto]`; new `[data-chapter-edge]` rail element inside the shell. Reader publishes to the traj root: `data-chapter-bridge='on'|absent`, `data-chapter-arm='1'|-1|''`, `data-chapter-epoch`. Reader consumes `traj:gesture`, `traj:station-settled`, `traj:station-target` CustomEvents from the traj root and dispatches `traj:query-target`.

### Map owner message contract (trajectory client)
`traj:gesture` detail `{phase:'begin'|'move'|'end'|'cancel', gestureId, touchId, touchCount, x, y, probe: EdgeProbe|null, station: boolean}` — `station:true` marks the gid consumed by a station action. `traj:station-settled` detail `{gestureId, dir, epoch}` fires only after real flight **and** narration settle **and** the originating gesture already ended. `traj:station-target` detail `{discId, placeId, index}` only for a validated on-disc hash target. Map alone owns station stepping; shell alone owns chapter commit.

## Task 1 — Presence assembly (serial)
- [ ] Failing behavioral tests for ordered original paragraphs, unknown H2 placement, explicit record-only, images-only, notes links-only/empty and absent map.
- [ ] Add explicit record visuals/notes links inputs; mobile chapter list drives panes/tabs/adjacency without changing desktop parser result or content.
- [ ] Run full real collection coverage: 26 notes/record/story, 22 maps, 25 restored story paragraph sequences identical; FALP distribution unchanged; legacy public-field rules unchanged.

## Task 2 — Released boundary reducer and native adapter (serial)
- [ ] Behavioral traces: first arriving gesture never commits; end arms; next new same-dir net48+end commits once; inertia only arms.
- [ ] Both directions: +60→58 commits1, +60→53 commits0, +60→53→90 commits0, +60→58→56 commits0, +49→47 commits0. Scroll distance2 retains/3 permanently revokes even back at edge. No additional reverse6 threshold.
- [ ] Cancel/multitouch/primary-loss/blur/hidden/resize/visualViewport/epoch/transition clears; same gid never revives; controls/selection/standalone scroll priority; wheel never mobile cross-chapter, ctrl-wheel free; keyboard down/up release with repeat ignored.
- [ ] Preserve native prose scroll and multiface runway geometry; no step in scroll or touchend fallback of arriving gesture.

## Task 3 — Map bridge and short transition (serial)
- [ ] Internal 56px station gesture consumed once; actual station settled+end arms, next48px gesture goes directly actual neighbor. Direct endpoint/hash/playback first needs outward+end before confirming.
- [ ] Explore pan/pinch and station-list scroll stay map-owned; bridge only active narrow map chapter; desktop/independent map unchanged. Legal hash activation, invalid hash no-op.
- [ ] 200ms directional pane transition, 2px rail, reduced-motion immediate; one real Leaflet root; incoming/outgoing focus/inert/hidden cleanup, no queued gestures; preserve positions and existing traj:show measurement.

## Integration and handoff
- [ ] Run node --experimental-strip-types --test, npm run check, npm run build; record exact commands/exits and focused real implementation tests (not just source regex).
- [ ] Whole diff review for forbidden scope, original content and desktop invariance. Keep coverage/event traces with evidence type labeled, report paths without adding off-scope production files.
- [ ] Serve preview on a free port and report URL/PID. Browser verification remains pending for parent: PRD §9 viewport/theme/reduced-motion matrix; MHJL329, ML5060, HZEL700, FALP381, D37779, native events and real Leaflet. iPhone Safari and Android Chrome explicitly NOT VERIFIED until real devices tested.
- [ ] Prepare PR title/body and exact diff/head for parent; do not create an externally visible PR absent explicit user approval, do not merge/deploy/message peers. CI/layout/browser gates remain pending.
- [ ] Report <=800 words with head, paths, commands/exits, coverage, preview and unverified risks. Parent independently samples tests/diff before claiming completion.


## Review-fix continuation — 2026-11-07 23:23 Asia/Singapore

**Base:** local e276d66; same branch/worktree/session, one serial writer. **State:** HOLD; this appendix authorizes no launch/release. Infrastructure acceptance is owned separately. Detailed continuation brief: `/home/box/box-coding/briefs/mobile-chapter-presence-and-boundary-review-fix.md`.

**Immutable checkpoint1:** actual production/module+SSG26 record/notes/story,22map;25 original paragraph sequences equal;FALP explicit distribution and desktop parsing/render unchanged; actual legacy public-field gates. Do not redo restored prose.

- [x] Read full PRD and audit; reproduced F1–F4 on e276d66 in an isolated worktree (`review-fix/fail-before.log`, 11 failing production-adapter/接线 tests) before fixing.
- [x] F1: `createStationBridge` freezes gid/primary/epoch at `end`; readiness only from `flew && revealed && token===playToken` then `bridge.settle`; early-start gid blocked whole; stale token/epoch and superseded steps (`abandon`) inert; 420ms `STATION_FLIGHT_LOCK_MS` removed.
- [x] F2: reader touch/wheel/keyboard go through `createChapterTouchAdapter`/`createChapterKeyAdapter`; `INTERACTIVE_SELECTOR` + `hasLiveSelection` priority; primary-loss/multitouch/cancel invalidate; map `listOwnsGesture` widened to the same selector; `traj:view` epoch clears arm across guide↔explore.
- [x] F3: real `keyup` listener wired; held-key set, repeat, mixed Arrow/Page keys, modifiers, editable targets and Home/End covered by adapter tests; no keydown-only commit.
- [x] F4: `createStationTargetRelay` seeks the map pane, waits two frames (handoff rAF + `traj:show`), then `traj:station-focus`; map re-validates via `stationTargetIndex`; invalid/foreign hashes no-op; ids and desktop map untouched.
- [x] Enter epsilon1/retain2 split, cumulative peak + 2px retreat, actual-distance >2px revocation stand. Map panes now run the same 100/200ms transaction with opacity-only keyframes (no transform on Leaflet root, no clone); visualViewport `scroll` (offset-only) and visibility/blur clean the transaction, hidden/inert released.
- [x] Added `disc-chapter-gestures.test.ts` (production adapters + bridge×shell reducer traces) and `disc-chapter-gesture-wiring.source.test.ts` (adapter actually registered by reader/map). Failing-before: 11/39 on e276d66; passing-after: 554/554. Old 513 unchanged and green.
- [x] `node --experimental-strip-types --test` → exit 0, 554 tests / 554 pass (log in review-fix/tests.log).
- [x] `node --experimental-strip-types /workspace/mobile-chapter-implementation-audit/coverage.mjs` → exit 0: 26 record/notes/story, 22 map, 25 restored unsectioned; original paragraph sequences, FALP sections and desktop parse all equal.
- [x] `npm run check` exit 0 (0 errors/0 warnings/7 hints); `npm run build` exit 0; built panes 26 record/26 story/26 notes/22 map.
- [x] Evidence under `/workspace/mobile-chapter-implementation-audit/review-fix/` (tests/coverage/check/build logs+exits, built-chapters.json, fail-before/fail-after, audit-repro.log). Local commit only; no push/PR/merge. preview4419 preserved (old e276d66 build, port 4419).
- [ ] Parent-only real browser PRD§9 matrix remains PENDING (unchanged by this pass): native scroll/selection/flight/pinch/history/keyboard/a11y/safe area and real iPhone Safari/Android Chrome. Static/synthetic results are not browser PASS.

### Narrow follow-up — 迟到落稳 vs 取消生命周期 (checkpoint2 finding)

**Finding (parent, independent):** after blur cancels a map chapter mid-flight, a late genuine flight+narration completion still re-armed `armedDir` 0→1 while `blocked` stayed true. Reproduced here on the 10:30 WIP snapshot with the production `createStationBridge` + `reduceBoundary` seam (not a timer, not a mock reducer).

- [x] Kept all prior F1–F4 fixes; no prose／FALP／desktop changes (`git diff e276d66 -- src/content src/pages src/data/disc-chapters.ts` empty).
- [x] Root cause 1 (shell-only path): `reduceBoundary` `arm` case accepted a late `boundary-ready` while `blocked` was true. Fixed: `blocked` now rejects `arm` until a fresh valid gesture (`begin`) clears it.
- [x] Root cause 2 (bridge path): `StationBridge.cancel()` only dropped a *settled* pending, leaving an in-flight step settleable with its frozen action. Fixed: cancel drops the account unconditionally; `reset()` clears origin + pending.
- [x] Wired the production lifecycle: reader `abandon()` (blur/hidden) dispatches `traj:cancel` for the map chapter; map listener does `bridgeCancel()` + `bridge.reset()` + `stationAction = null`. `touchcancel` still goes through `bridge.cancel()`.
- [x] Failing-before／passing-after (isolated worktree at e276d66 + new tests): `fail-before-late-settle-cancel.log` — 2 fails (bridge cancel + reducer late arm); `fail-before-late-settle.log` — 14 fails incl. wiring contract; after: 559/559 pass.
- [x] Traces: `review-fix/late-cancel-before-shell-only.json` (arm 1, late ready) vs `late-cancel-after-shell-only.json` (arm 0) and `late-cancel-after-production.json` (arm 0, lateSettled null).
- [x] Re-ran `node --experimental-strip-types --test` (559 pass), coverage (26/26/22, 25 restored, FALP+desktop equal), `npm run check` 0, `npm run build` 0, built panes 26/26/26/22.
- [ ] Parent-only real browser PRD§9 matrix still PENDING (blur→visibility→late Leaflet flight on real Safari/Chrome not observable this worker).
