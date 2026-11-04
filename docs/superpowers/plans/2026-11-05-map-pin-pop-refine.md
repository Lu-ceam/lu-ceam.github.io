# Plan: map-pin-pop-refine (Task0)

**Goal:** Pin arrive pop — remove wobble + translateY; tip-origin scale 1→1.03→1; `--traj-pin-pop-ms: 180ms`; reduced-motion none. Baseline `5bf04c7`. Open PR; do not merge.

**Contract (locked):**
- No rotate / bounce / elastic / infinite.
- Do not touch flyTo settle / fitLocalNear / chapter shell / client.ts (CSS+test only).

**Files:** `TrajectoryMap.astro`, `trajectory-pins.test.ts`, this plan.

**Tasks:**
0. Commit this plan.
1. Update pins tests for 180ms / scale / no wobble / no translateY / reduced-motion.
2. Replace keyframes in Astro.
3. Run pins test; open PR; report URL+SHA.
