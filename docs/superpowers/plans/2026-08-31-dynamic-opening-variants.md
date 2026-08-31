# Dynamic Opening Variants Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add safe duplication and deletion of WhatsApp opening journeys while keeping assignment, delivery, history, and experiment analytics truthful.

**Architecture:** Wedding Tales expands the authoritative experiment contract to 1–8 stable variants and owns a persistent revision-lineage map. BusinessOS owns pure local draft operations for clone/delete and renders all variant-dependent controls dynamically. Publication remains the only boundary that changes live assignment.

**Tech Stack:** Next.js, React, TypeScript in BusinessOS; Next.js, JavaScript, Firestore in Wedding Tales; Vitest and Testing Library in both repositories.

**Spec:** `docs/superpowers/specs/2026-08-31-dynamic-opening-variants-design.md`

## Global Constraints

- Published experiments contain 1–8 unique IDs matching `A`, `B`, `C`, or `v_[a-f0-9]{12}`.
- A clone is disabled with weight 0 and receives regenerated block IDs.
- The last draft journey cannot be deleted; deletion does not erase history or enrolled lead snapshots.
- Wedding Tales alone assigns published revisions and maintains at most 512 lineage entries.
- Dynamic IDs are never user-editable and customer/private provider content never enters logs or API errors.
- No Make, Meta, WhatsApp send, or live experiment publish occurs during implementation or rollout.

---

### Task 1: Expand the Wedding Tales experiment contract

**Files:**
- Modify: `src/lib/salesAgent/openingExperiment.js`
- Test: `tests/salesOpeningExperiment.test.js`
- Test: `tests/salesOpeningRuntime.test.js`

**Interfaces:**
- Produces: `isOpeningVariantId(value): boolean`
- Produces: `normalizeOpeningExperiment(input, options)` accepting 1–8 variants
- Consumes: existing `assignOpeningVariant` and opening-flow runtime

- [ ] **Step 1: Write failing contract tests**

Add cases that normalize eight variants using IDs `A`, `B`, `C`, and five `v_` IDs; reject zero, nine, duplicates, malformed IDs, and a disabled/zero-weight-only set. Add deterministic assignment coverage proving a dynamic ID can be selected.

```js
expect(normalizeOpeningExperiment({ ...base, variants: eight }).variants).toHaveLength(8)
expect(() => normalizeOpeningExperiment({ ...base, variants: nine })).toThrow('INVALID_OPENING_VARIANT')
expect(assignOpeningVariant({ leadKey: selectedKey, experiment }).variantId).toBe('v_111111111111')
```

- [ ] **Step 2: Run RED**

Run: `npx vitest run tests/salesOpeningExperiment.test.js tests/salesOpeningRuntime.test.js`

Expected: failures because dynamic IDs and more than three variants are rejected.

- [ ] **Step 3: Implement the minimal contract**

Export one grammar helper and replace the fixed set/count checks:

```js
const DYNAMIC_VARIANT_ID = /^v_[a-f0-9]{12}$/
export const isOpeningVariantId = value => ['A', 'B', 'C'].includes(String(value)) || DYNAMIC_VARIANT_ID.test(String(value))
const MAX_VARIANTS = 8
```

Keep all existing block, weight, terminal, media, and variable validation unchanged.

- [ ] **Step 4: Run GREEN**

Run the same focused command and require every test to pass.

- [ ] **Step 5: Commit**

Commit the production and test files with `feat(sales): allow dynamic opening journeys`.

### Task 2: Preserve authoritative variant revision lineage

**Files:**
- Modify: `src/lib/salesAgent/settingsStore.js`
- Test: `tests/salesSettingsFirestore.test.js`

**Interfaces:**
- Produces: server-owned `openingVariantLineages: Record<string, number>` on active settings
- Produces: revision assignment returning `{ openingExperiment, openingVariantLineages }`
- Consumes: normalized experiments from Task 1

- [ ] **Step 1: Write failing transaction tests**

Cover unchanged, changed, cloned, deleted, re-added, and restored IDs. Prove a deleted `v_aaaaaaaaaaaa` at revision 3 returns at revision 4, removed lineages survive publication, client-supplied lineage is ignored, and entry 513 fails with `OPENING_VARIANT_LINEAGE_LIMIT`.

```js
expect(published.openingExperiment.variants.find(v => v.id === retiredId).revision).toBe(4)
expect(store.get('sales_agent_settings/active').openingVariantLineages[retiredId]).toBe(4)
```

- [ ] **Step 2: Run RED**

Run: `npx vitest run tests/salesSettingsFirestore.test.js`

Expected: failures from the fixed-set guard and missing lineage persistence.

- [ ] **Step 3: Implement the lineage helper**

Build the trusted current lineage from active settings plus current variant revisions. Assign revisions from journey signatures and update a copied lineage map. Ignore any lineage field in the request. Use the helper in publish and restore; keep the map outside the client-controlled experiment object.

```js
const prior = Math.max(Number(lineages[id]) || 0, Number(current?.revision) || 0)
const revision = current ? (changed ? prior + 1 : prior) : prior + 1
```

Reject a map above 512 keys before transaction writes.

- [ ] **Step 4: Run GREEN**

Run the same focused command and require rollback/no-write assertions to pass.

- [ ] **Step 5: Commit**

Commit with `feat(sales): retain opening journey lineage`.

### Task 3: Make execution and mobile tests dynamic

**Files:**
- Modify: `src/lib/salesAgent/openingRuntime.js`
- Modify: `src/lib/salesAgent/openingTestSend.js`
- Modify: `src/app/api/sales-agent/experiment/test-send/route.js`
- Test: `tests/salesOpeningRuntime.test.js`
- Test: `tests/salesOpeningTestSend.test.js`
- Test: `tests/salesOpeningTestRoute.test.js`

**Interfaces:**
- Consumes: `isOpeningVariantId`
- Produces: test-send for any currently published variant ID
- Produces: pinned flow continuity when its ID is absent, while an explicitly disabled present variant still stops

- [ ] **Step 1: Write failing runtime and route tests**

Add one enrolled deleted-ID lead that continues from its pinned snapshot, one present-disabled lead that returns `variant-stopped`, one successful dynamic mobile test, and malformed/unknown ID cases with zero sends.

- [ ] **Step 2: Run RED**

Run: `npx vitest run tests/salesOpeningRuntime.test.js tests/salesOpeningTestSend.test.js tests/salesOpeningTestRoute.test.js`

Expected: dynamic test ID is rejected and absent pinned flow is stopped.

- [ ] **Step 3: Implement minimal dynamic validation**

Validate grammar at the route boundary, then load published settings and let `sendOpeningVariantTest` require exact membership. In runtime, stop only when a matching published variant exists and is disabled; otherwise execute the stored snapshot.

- [ ] **Step 4: Run GREEN**

Run the same focused command and require all privacy/no-send assertions to pass.

- [ ] **Step 5: Commit**

Commit with `feat(sales): execute dynamic opening journeys`.

### Task 4: Add pure BusinessOS clone/delete draft operations

**Files:**
- Create: `src/lib/sales-agent/opening-variant-draft.ts`
- Modify: `src/lib/sales-agent/experiment-client.ts`
- Test: `tests/unit/opening-variant-draft.test.ts`
- Test: `tests/unit/sales-agent-experiment-client.test.ts`

**Interfaces:**
- Produces: `cloneOpeningVariant(experiment, sourceId, randomHex): OpeningExperiment`
- Produces: `deleteOpeningVariant(experiment, variantId): OpeningExperiment`
- Produces: `OpeningVariant.id: string` and dynamic mobile-test response types

- [ ] **Step 1: Write failing pure tests**

Prove clone copies customer content and bindings, regenerates every block ID, uses `v_<12hex>`, is disabled/zero-weight, respects eight variants, retries ID collisions, and never mutates the source. Prove delete rejects the last variant and an unknown ID.

- [ ] **Step 2: Run RED**

Run: `npx vitest run tests/unit/opening-variant-draft.test.ts tests/unit/sales-agent-experiment-client.test.ts`

Expected: missing module plus fixed A/B/C validation failures.

- [ ] **Step 3: Implement pure helpers and client contract**

Use an injected `randomHex()` for deterministic tests and Web Crypto only at the UI call site. Deep-copy blocks explicitly and create IDs with the new variant ID, index, type, and a random suffix. Expand response validation to 1–8 variants and the shared ID grammar.

- [ ] **Step 4: Run GREEN**

Run the same focused command.

- [ ] **Step 5: Commit**

Commit with `feat(sales): model dynamic opening drafts`.

### Task 5: Add accessible clone/delete controls and dynamic surfaces

**Files:**
- Modify: `src/components/sales-agent/sales-agent-control-center.tsx`
- Modify: `src/components/sales-agent/opening-flow-editor.tsx`
- Modify: `src/components/sales-agent/opening-experiment-dashboard.tsx`
- Modify: `src/components/sales-agent/opening-lead-table.tsx`
- Modify: `src/components/sales-agent/opening-approvals.tsx`
- Modify: `src/app/globals.css`
- Modify: `src/app/api/sales-agent/experiment/test-send/route.ts`
- Test: `tests/components/sales-agent-control-center.test.tsx`
- Test: `tests/components/opening-flow-editor.test.tsx`
- Test: `tests/integration/sales-agent-test-send-route.test.ts`

**Interfaces:**
- Consumes: pure helpers from Task 4
- Produces: `onClone(variantId)` and `onDelete(variantId)` journey-card actions
- Produces: dynamic mobile-test buttons and label-aware lead/approval rows

- [ ] **Step 1: Write failing component and route tests**

Test the Hebrew accessible names `שכפל מסלול <label>` and `מחק מסלול <label>`, confirmation copy, disabled max/last states, local draft preservation, no fetch before publish, dynamic test requests, and rendering four or eight journeys without fixed A/B/C copy.

- [ ] **Step 2: Run RED**

Run: `npx vitest run tests/components/sales-agent-control-center.test.tsx tests/components/opening-flow-editor.test.tsx tests/integration/sales-agent-test-send-route.test.ts`

Expected: controls are absent and the route rejects dynamic IDs.

- [ ] **Step 3: Implement the UI**

Generate random hex with `crypto.getRandomValues`, call the pure helpers, confirm deletion with `window.confirm`, and keep all actions in React draft state. Map mobile tests from published variants. Replace “three journeys” copy with count-neutral Hebrew and add wrapping 44px controls for 320px layouts.

- [ ] **Step 4: Run GREEN and component regression**

Run the focused command, then `npx vitest run tests/components tests/unit/sales-agent-experiment-client.test.ts`.

- [ ] **Step 5: Commit**

Commit with `feat(sales): duplicate and delete opening journeys`.

### Task 6: Cross-repository verification and production rollout

**Files:**
- No new product files unless verification exposes a regression, in which case add a failing test before any fix.

**Interfaces:**
- Consumes: Tasks 1–5
- Produces: deployed compatible backend then frontend

- [ ] **Step 1: Run Wedding Tales verification**

Run focused opening/settings suites, full `npx vitest run tests/`, changed-file ESLint, production build with existing safe environment procedure, and `git diff --check`.

- [ ] **Step 2: Run BusinessOS verification**

Run focused suites, full `npm test -- --run`, `npm run lint`, `npx tsc --noEmit`, production build with the existing safe environment procedure, and `git diff --check`.

- [ ] **Step 3: Review the final diff**

Confirm clone/delete make no network call, server lineage is authoritative, no fixed A/B/C runtime assumptions remain, and no secret/customer content appears in new logs or fixtures.

- [ ] **Step 4: Deploy in compatibility order**

Deploy Wedding Tales first and BusinessOS second. Read the BusinessOS sales-agent page and verify the current three published journeys load unchanged. Do not press publish and do not send a mobile test.

- [ ] **Step 5: Record final commits and clean status**

Require both linked worktrees to have empty working-tree and index diffs after commits. Preserve the unpublished 40/40/20 browser draft for the owner’s later live confirmation.
