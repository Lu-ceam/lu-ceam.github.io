# Plan authoring

> **For agentic workers:** Read this before writing a file in `docs/superpowers/plans/`. Use it with `superpowers:writing-plans`. Dated plans follow this sequencing. They do not restate it.

Dated implementation plans live in `docs/superpowers/plans/YYYY-MM-DD-<feature-name>.md`. Specs live in `docs/superpowers/specs/`.

The plan PR is docs only. Cut the implementation branch from `main` after the plan is on `main`. Leave the docs branch untouched by implementation.

## Why this order

`superpowers:subagent-driven-development` reviews one task before the next task starts. Keep that gate on a lock that later work must obey, and inside a single lane. Between slices that only share a frozen contract, the same gate makes each sibling wait on the previous review. Feat PRs that numbered independent work as Task 1, Task 2, Task 3 — #43 in particular — stalled that way.

Lock the stage and the horizontal interfaces first. Then implement the lanes together.

## Sequence

1. **Task 0 — Contract surfaces.** Land it on the shared base before any lane starts.
2. **Parallel lanes.** Independent slices, each cut from that same Task 0 commit. Separate agents may take separate lanes. A sibling lane's review does not gate another lane.
3. **Serial track.** Aesthetic locks and user locks, one owner, in spec order.
4. **One integration checkpoint.** After the lanes and the serial track have landed, one live-verify.

## Task 0 — Contract surfaces

Task 0 is the first implementation task. It publishes the seams later work compiles and tests against. It is its own commit on the shared base. Every lane branch is cut from that commit.

Task 0 contains only the four surfaces below. Behavior, pixel treatment, motion, and copy belong to a lane or to the serial track.

### Exported types and function signatures

Declare every type and function a later task imports. Include parameter names, parameter types, and the return type. Sibling lanes share these names.

Bodies are stubs that typecheck. Return the zero value of the return type, or throw `Error` with the message `Not implemented: <export name>`. The Task 0 test imports each name and asserts that the module exports it. The test does not assert a computed result.

Write the signatures in the plan as one fenced block. Repeat that block in each consumer task's **Interfaces** section. A task implementer sees their own task; the signature block is how they learn the names.

Shape, with the feature's real names in the opened plan:

```ts
export type StageBox = { left: number; top: number; width: number; height: number };

export function stageBox(pane: StageBox): StageBox {
  throw new Error("Not implemented: stageBox");
}
```

### DOM and data hooks

Name the selectors, the elements, and the `data-*` attributes that scripts and tests read. State which file writes the hook and which file reads it. Task 0 adds the hook as an attachment point in the markup or the script. Layout, listeners, and copy come later.

```html
<div class="stage" data-stage-id={record.id}></div>
```

### CSS variables and size-container ownership

Name each custom property, the element that writes it, and the element that reads it.

Name the size container in the same task: the selector whose content box is the measured stage, the `container-type` when layout uses container query units, and the custom properties that publish that box. One measured box has one owner. A lane reads the variable. It uses that container. It does not declare a second container for the same box, and it does not rename the property.

Set an initial value in Task 0 when another file must read that value before script runs. Color, type size, easing, and column ratio are visual decisions. Leave them to the serial track. The spec's locked numbers still appear in **Global Constraints**.

```css
.stage {
  container-type: size;
  --stage-w: 100cqi;
}
```

In that shape, `.stage` owns the measured box and `--stage-w`. A lane that needs the width reads `var(--stage-w)`.

### Test fixture shapes

Export the fixture types and the named fixtures later tests import. Include every field the spec names on that object: record id, pane size, natural size, crop, and the other fields the spec lists. The fixture is data. The Task 0 test checks that the object has those fields and those types. Expected pixels, formula results, and source-read assertions of behavior belong to the lane that implements the formula.

```ts
export type StageFixture = {
  id: string;
  pane: StageBox;
  natural: { width: number; height: number };
};
```

Task 0 also exports `primaryStage` of that type. Assign it from the spec's primary row and copy every number from that row. The Task 0 test asserts the field types and that `primaryStage.id` is the spec's id. The lane that owns `stageBox` asserts the geometry.

### Task 0 steps

List create, modify, and test paths the way any other task does. Steps stay the writing-plans cycle: write the failing contract test, run it and see it fail, add the stubs, hooks, variables, size container, and fixture objects, run the contract test and see it pass, commit.

The commit message names the contract, for example `feat: publish <feature> contract surfaces`.

### Changing the contract

A lane that needs a new export, hook, variable, size container, or fixture field stops. Amend Task 0 on the shared base. Rebase every open lane onto that new commit. Keep the original export name. Add the new field beside it.

## Parallel lanes

A lane is one independently testable slice:

- It consumes Task 0 and **Global Constraints**.
- Its write set is disjoint from every sibling lane. The plan lists every path. An open-ended remainder of a file is not a write set.
- Its tests pass on a tree that contains Task 0 and does not contain a sibling lane.

Two slices that edit the same file are one lane, or Task 0 splits that file so each lane owns a path. A merge conflict at integration means the write sets were not lanes.

There is no serial re-review between sibling lanes.

Do not number independent lanes as Task 1, Task 2, Task 3. The subagent-driven loop treats a single integer sequence as an order, and that order is what serialized #43. Number inside the lane: A1, A2, then B1, B2.

Head each lane like this:

### Lane A — [slice name]

**Base:** the Task 0 commit. Every sibling lane uses that same commit.
**Writes:** exact paths.
**Reads:** the Task 0 names this lane calls.
**Done when:** this lane's tests pass against Task 0 alone.

Tasks inside one lane stay ordered when each task consumes the previous task's behavior. `superpowers:subagent-driven-development` still applies inside the lane: implement, review that lane's task, then the next task in that lane. That review ends at the lane boundary. Lane B starts from Task 0 without waiting for Lane A's reviewer. Merging Lane B does not send Lane A back through review.

Separate agents may implement lanes at the same time. Each agent gets its own branch, cut from the Task 0 commit. Agents do not share a branch while both are writing. A lane does not rebase onto a sibling in order to start.

## Serial track

Aesthetic locks and user locks are one ordered list with one owner. They are not lanes, and they are not split across agents.

An aesthetic lock decides how the shared surface looks or moves: type size, color, weight, column ratio, motion timing, easing, copy. A user lock is a decision the user already made: a spec marked locked, a rejected alternative, a named URL behavior. Apply those locks in the order the spec states them. Use the spec's numbers. The implementer leaves the decision as written.

Review between serial tasks stays. The next lock starts after the current lock's review.

A lane may apply a number that **Global Constraints** already states, inside files that lane alone writes. The lane leaves every other surface alone. A lock whose paths overlap a lane is ordered in the plan: either the lock lands before that lane branches, or the lane lands and the lock follows. Say which. The overlapping pair does not run side by side.

When the spec has no aesthetic or user lock beyond **Global Constraints**, the serial track is empty. The integration checkpoint still runs once.

## Integration checkpoint

One checkpoint, after every lane and the serial track have merged onto the integration branch.

- Run the plan's tests. Records work that uses `node:test` runs `node --experimental-strip-types --test`, then `npm run check`, then `npm run build`.
- Live-verify the primary URL and any legacy URL named in **Global Constraints**, on `npm run preview` or the deployed page. Exercise the motion and the locked layout the spec names. One pass.
- One whole-branch review of the integrated diff.

Lane branches merge at this checkpoint. They do not gate each other earlier. A failed checkpoint gets a fix and one re-check of that same checkpoint. A green checkpoint ends the plan.

## After the plan merges

`spec-ok-merge-plan-ship` grants three things at once: the spec is accepted, the plan PR may merge to `main`, and implementation starts as soon as that plan is on `main`. An equivalent grant is any user instruction that names those three. Accepting the spec alone leaves the plan and the implementation unapproved.

When the grant is already in hand, merge the docs plan PR, then start work from the merge commit. As soon as the plan is on `main`, cut the implementation branch and start Task 0. When Task 0 is on that base, start every lane in the same turn. Skip the execution-mode question. Skip a second brainstorming pass. Skip a second approval of the same spec and the same plan.

A plan that merged without the ship grant stays on `main` until the user grants it.

## What the dated plan contains

Keep the writing-plans header: agent blockquote, **Goal**, **Architecture**, **Tech Stack**, **Global Constraints** copied verbatim from the spec, file map, checkbox steps, exact paths, and the full code for every code step.

Under **Tech Stack**, add:

**Contracts:** Task 0, on one screen. Export names, DOM hooks, CSS variables, the size-container selector, fixture names.

**Lanes:** one line per lane. Name, write paths, base is the Task 0 commit.

**Serial:** the aesthetic and user locks in order, then the single integration checkpoint and the URLs it opens.

**Branch:** cut from `main` after this plan is on `main`.

"See Task 0" does not replace a signature. Repeat the consumed signature in the task's **Interfaces** block.

## Skeleton

The headings below are the required shape. Replace each bracketed slot with the feature's real name, path, and signature before opening the plan. A bracket that is still in the opened plan means the plan is unfinished.

One slice is one lane heading. Lane A and Lane B are both shown so the shared base and the disjoint write sets are visible. A plan with a single slice keeps Task 0, that one lane, the serial track (empty when the spec has no further lock), and Integration.

### Task 0: Contract surfaces

**Files:**
- Create or modify: `[module that exports the signatures]`
- Modify: `[page or stylesheet that owns the hooks and the size container]`
- Test: `[contract test]`

**Interfaces:**
- Consumes: names already on `main`, with their current signatures
- Produces: the four surfaces — signatures, DOM and data hooks, CSS variables plus the size container, fixture shapes

- [ ] Failing contract test for exports, hooks, variables, size-container selector, and fixture field types
- [ ] See that test fail
- [ ] Stubs, hooks, variables, size container, fixture objects
- [ ] See the contract test pass
- [ ] Commit onto the shared base

### Lane A — [slice name]

**Base:** the Task 0 commit.
**Writes:** `[exact paths]`
**Reads:** `[Task 0 names]`
**Done when:** Lane A tests pass on Task 0 alone.

Ordered tasks A1, A2, … follow, each with files, interfaces, checkbox steps, and full code.

### Lane B — [slice name]

**Base:** the same Task 0 commit.
**Writes:** `[exact paths, disjoint from Lane A]`
**Reads:** `[Task 0 names]`
**Done when:** Lane B tests pass on Task 0 alone.

### Serial — [lock name]

One task per lock, spec order, one owner. Each task lists its paths and states whether any lane must precede it.

### Integration

One task. The test commands, the primary URL, the legacy URL, and the whole-branch review. The plan ends on this task.
