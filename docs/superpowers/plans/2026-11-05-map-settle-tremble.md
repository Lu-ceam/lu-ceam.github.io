# Plan: map-settle-tremble (Task0)

**Goal:** Guide arrive zoom no tremble — prefer **A**: cruise ends at final `zoomTo`; remove independent settle zoom loop (settleMs→0). `fitLocalNear` no-op when already within ε. Magnet after stable zoom. Baseline `5bf04c7`. Open PR; do not merge.

**Contract (locked):**
- Do not raise `frameMaxZoom` / settle zoom to hide jitter.
- No explore auto-fly; no spring overshoot.
- Do not touch pin-pop CSS or chapter shell.
- `trajectory-map-client.ts`: only `flyTo` / thaw·settle / `fitLocalNear` — never `popPin` / `is-pin-pop`.

**Files:** `trajectory-camera.ts`(+test), `trajectory-guide.test.ts`, `trajectory-magnet.test.ts`, `trajectory-map-client.ts` (fly/settle/fit only).

**Choice:** A.

**Tasks:**
0. Commit this plan.
1. TDD: assert cruise end zoom = zoomTo; fitLocalNear noop; maxZoom≤frameMaxZoom.
2. Implement A in camera + client timing.
3. Run targeted tests; open PR; report URL+SHA.

## Design (A)

Camera (`trajectory-camera.ts`):

- `cruiseZoom` keeps `legZoom`'s shape (ocean pullback, redraw bands), then over the last
  `CRUISE_SETTLE_START = 0.85` → 1 of the leg eases the remaining `SETTLE_ZOOM_DELTA`
  into `zoomTo`. `t = 1` returns `zoomTo` exactly, land and ocean.
- `SETTLE_ZOOM_DELTA` stays as the cruise's shortfall constant (the frozen sheet frame and
  tests still read it); `legZoom` still stops at `toZoom - SETTLE_ZOOM_DELTA` so the mid-leg
  bitmap shot and the redraw bands do not move.
- `SETTLE_MS = 0`: no separate push-in phase. `settleMs()` stays as the call site's guard.

Client (`trajectory-map-client.ts`, fly/settle/fit only):

- `flyTo`: the cruise lands on the final frame; drop the `arriveZoom` settle `animate` loop
  and the extra `cameraStart`. After the cruise: thaw on the camera-end frame, return.
- One shared `localNearTarget(frame)` = the exact frame `fitBounds` would produce
  (`getBoundsZoom` with the magnet fit pad sum, plus the padded centre shift):
  `localNearCamera` cruises to it, so the landing frame *is* the fit target.
- `fitLocalNear`: if the camera is already on that target (zoom `|Δ| < 0.05`, projected
  centre `< 2px`), return `true` without `fitBounds` — the second landing is the tremble.
- `snapActivePin` stays after `fitLocalNear` in the `finally` (`flying = false` first), pan only.
- `prefers-reduced-motion`: unchanged jump to the final frame.
