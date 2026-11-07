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
