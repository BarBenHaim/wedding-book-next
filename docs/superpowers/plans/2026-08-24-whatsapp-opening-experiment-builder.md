# WhatsApp Opening Experiment Builder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a deterministic, owner-editable A/B/C WhatsApp opening experiment with sticky assignment, delivery-truth metrics, approvals, and an authenticated lead table.

**Architecture:** Wedding Tales owns validation, revisions, runtime state, delivery truth, fixed-template generation, approvals, and experiment aggregation. BusinessOS owns the responsive block editor, previews, controls, approvals, and reporting; it calls authenticated Wedding Tales APIs. Make remains transport only and stays inactive while the code is built and tested.

**Tech Stack:** Next.js 15/React 18/JavaScript, Firebase Admin/Firestore/Storage, Vitest, sharp; Next.js 14/React/TypeScript, Drizzle/Postgres, Testing Library, Lucide, CSS.

**Spec:** `docs/superpowers/specs/2026-08-24-whatsapp-opening-experiment-builder-design.md`

## Global Constraints

- No phone calls and no free-form AI conversation.
- Existing conversations are never auto-enrolled.
- Draft save is inert; global and variant switches fail closed.
- Sticky assignment and pinned published revisions are immutable per lead.
- Only delivered/read callbacks create exposures or progress.
- A generated child design is never sent before authenticated owner approval.
- Make scenario `9630287` is not activated by this plan.
- Every production behavior starts with a failing test.

---

### Task 1: Pure experiment contract and deterministic runner

**Files:**
- Create: `wedding-book/src/lib/salesAgent/openingExperiment.js`
- Create: `wedding-book/tests/salesOpeningExperiment.test.js`
- Modify: `wedding-book/src/lib/salesAgent/settings.js`
- Modify: `wedding-book/tests/salesSettings.test.js`

**Interfaces:**
- Produces `DEFAULT_OPENING_EXPERIMENT`, `normalizeOpeningExperiment(input, { registeredMedia })`, `assignOpeningVariant({ leadKey, experiment })`, `runOpeningFlow({ flow, cursor, inbound, library, eventId })`, and `classifyOpeningLead(lead, nowMs)`.
- `runOpeningFlow` returns `{ action, cursor, parts, captures, approvalRequest, completed }` with stable SHA-256 part IDs and never invokes a provider.

- [ ] **Step 1: Write failing pure contract tests**

Cover the exact A/B/C defaults; 20-block bound; registered media; valid photo-generation-approval ordering; positive enabled weights; sticky deterministic assignment; new-lead initial run; event/date capture; image wait; duplicate part IDs; and conservative relevance classification.

- [ ] **Step 2: Run RED**

Run: `npx vitest run tests/salesOpeningExperiment.test.js tests/salesSettings.test.js`

Expected: failure because the new module and experiment settings do not exist.

- [ ] **Step 3: Implement the minimal pure module and settings normalization**

Use an allowlisted discriminated block shape:

```js
{ id, type: 'text', text }
{ id, type: 'media', mediaKey }
{ id, type: 'ask_event', text }
{ id, type: 'ask_photo', text }
{ id, type: 'generate_design', templateId: 'bar-mitzvah-v1' }
{ id, type: 'wait_owner_approval' }
{ id, type: 'send_approved_design' }
{ id, type: 'stop' }
```

Return cloned normalized objects; never mutate stored settings or input flows.

- [ ] **Step 4: Run GREEN and the sales settings regression group**

Run: `npx vitest run tests/salesOpeningExperiment.test.js tests/salesSettings.test.js tests/salesSettingsFirestore.test.js tests/salesOpeningOnly.test.js`

- [ ] **Step 5: Commit Task 1**

Commit message: `feat(sales): define deterministic opening experiments`

### Task 2: Versioned settings and authenticated experiment APIs

**Files:**
- Modify: `wedding-book/src/lib/salesAgent/settingsStore.js`
- Modify: `wedding-book/src/app/api/sales-agent/settings/route.js`
- Create: `wedding-book/src/app/api/sales-agent/experiment/route.js`
- Create: `wedding-book/tests/salesOpeningExperimentRoute.test.js`
- Modify: `wedding-book/tests/salesSettingsFirestore.test.js`
- Modify: `wedding-book/tests/salesSettingsRoute.test.js`

**Interfaces:**
- `saveSalesSettings` accepts `openingExperiment` and preserves the prior active revision in history.
- `GET /api/sales-agent/experiment` returns only sanitized aggregate and lead-row fields.
- `POST /api/sales-agent/experiment` supports authenticated `publish`, `restore`, `approve`, and `reject`; each command has an exact bounded schema.

- [ ] **Step 1: Write failing persistence and route tests**

Prove stale revision conflict, draft-inert behavior, published immutable revision, restore creating a new revision, auth before reads, request-size bounds, fixed safe errors, and no transcript/raw media fields in responses.

- [ ] **Step 2: Run RED**

Run: `npx vitest run tests/salesOpeningExperimentRoute.test.js tests/salesSettingsFirestore.test.js tests/salesSettingsRoute.test.js`

- [ ] **Step 3: Implement minimal Firestore history and route commands**

Use existing shared-secret/super-admin auth. Keep all writes transactional and return only current normalized truth.

- [ ] **Step 4: Run GREEN**

Run the same command and confirm no raw customer text, phone, provider payload, or token appears in snapshots/logs.

- [ ] **Step 5: Commit Task 2**

Commit message: `feat(sales): publish versioned opening journeys`

### Task 3: Runtime progression and delivery-truth milestones

**Files:**
- Modify: `wedding-book/src/app/api/sales-agent/reply/route.js`
- Modify: `wedding-book/src/lib/salesAgent/leads.js`
- Modify: `wedding-book/src/lib/salesAgent/delivery.js`
- Modify: `wedding-book/src/app/api/sales-agent/delivery/route.js`
- Create: `wedding-book/tests/salesOpeningRuntime.test.js`
- Modify: `wedding-book/tests/salesReplyRoute.test.js`
- Modify: `wedding-book/tests/salesDeliveryFirestore.test.js`

**Interfaces:**
- `claimOpeningStep({ phone, eventId, inbound, experiment })` transactionally assigns/pins a variant and returns the next pure runner input.
- `completeOpeningStep({ claimToken, result })` atomically writes cursor, captures, outbound records, and inbound completion.
- Delivery records carry `{ variantId, variantRevision, flowAttemptId, blockId, firstExposure, milestone }` and callbacks update the lead only when the record owns that milestone.

- [ ] **Step 1: Write failing route and Firestore tests**

Cover new lead assignment, existing chat silence, stopped global/variant silence, C event/date then A continuation, A image capture only while waiting, ambiguous qualification review, duplicate inbound zero-send, accepted-not-exposed, delivered exposure once, reply windows, continuation milestones, and payment truth untouched.

- [ ] **Step 2: Run RED**

Run: `npx vitest run tests/salesOpeningRuntime.test.js tests/salesReplyRoute.test.js tests/salesDeliveryFirestore.test.js`

- [ ] **Step 3: Implement the runtime seam before the legacy non-text handoff**

The opening experiment path runs only for a pinned/enrolled opening journey. All other non-text messages preserve current handoff behavior. Persist outbound preparation before returning to Make and reuse the existing delivery ledger.

- [ ] **Step 4: Run GREEN and regression**

Run: `npx vitest run tests/salesOpeningRuntime.test.js tests/salesReplyRoute.test.js tests/salesDelivery.test.js tests/salesDeliveryFirestore.test.js tests/salesPaymentRoute.test.js tests/salesPaymentFirestore.test.js`

- [ ] **Step 5: Commit Task 3**

Commit message: `feat(sales): run pinned WhatsApp opening journeys`

### Task 4: Fixed-template generation and owner approval

**Files:**
- Create: `wedding-book/src/lib/salesAgent/openingDesign.js`
- Create: `wedding-book/src/lib/salesAgent/openingApprovals.js`
- Create: `wedding-book/tests/salesOpeningDesign.test.js`
- Create: `wedding-book/tests/salesOpeningApprovals.test.js`
- Modify: `wedding-book/src/lib/salesAgent/whatsapp.js`
- Modify: `wedding-book/src/app/api/sales-agent/experiment/route.js`

**Interfaces:**
- `downloadWhatsAppMedia(mediaId, deps)` returns bounded image bytes and a verified MIME type without exposing provider responses.
- `renderOpeningDesign({ image, templateId })` returns a 1080x1350 PNG buffer using sharp.
- `createOpeningApproval`, `decideOpeningApproval`, and `sendApprovedOpeningDesign` use hashed IDs and transactional state.

- [ ] **Step 1: Write failing media, rendering, and approval tests**

Prove timeout/size/MIME rejection, deterministic dimensions, no public raw-photo storage, idempotent generation, approve/reject auth, mismatch refusal, global/variant stop after approval, and no send before approval.

- [ ] **Step 2: Run RED**

Run: `npx vitest run tests/salesOpeningDesign.test.js tests/salesOpeningApprovals.test.js`

- [ ] **Step 3: Implement bounded download, sharp rendering, private Storage upload, and approval state**

Use a 12-second media deadline, a 10MB decoded-image cap, generated object names derived from hashes, and short-lived signed URLs only in authenticated reads.

- [ ] **Step 4: Run GREEN and privacy scan**

Run the focused tests, then `rg -n "WHATSAPP_TOKEN|mediaId|provider payload" src/lib/salesAgent/openingDesign.js src/lib/salesAgent/openingApprovals.js` and confirm no value logging.

- [ ] **Step 5: Commit Task 4**

Commit message: `feat(sales): approve personal opening designs`

### Task 5: Experiment aggregation and sanitized lead table

**Files:**
- Create: `wedding-book/src/lib/salesAgent/openingAnalytics.js`
- Create: `wedding-book/tests/salesOpeningAnalytics.test.js`
- Modify: `wedding-book/src/app/api/sales-agent/experiment/route.js`
- Modify: `wedding-book/src/app/api/sales-agent/leads/route.js`
- Modify: `wedding-book/tests/salesLeadsPageContract.test.js`

**Interfaces:**
- `summarizeOpeningExperiment(leads, { nowMs, minSample })` returns per-variant denominators and 1h/24h/72h reply, continuation, relevance, approval, payment-link, and verified-payment rates.
- `openingLeadRow(lead, nowMs)` returns the exact masked management row without transcript or provider media identity.

- [ ] **Step 1: Write failing metric truth tests**

Test delivered-only exposure, boundary timestamps, unknown relevance denominator, milestone deduplication, verified payment only, 30-per-enabled-variant trend gate, stopped variants, and masked row privacy.

- [ ] **Step 2: Run RED**

Run: `npx vitest run tests/salesOpeningAnalytics.test.js tests/salesLeadsPageContract.test.js`

- [ ] **Step 3: Implement pure aggregation and route response**

All percentages return `{ numerator, denominator, rate }`; zero denominators return `rate: null`.

- [ ] **Step 4: Run GREEN**

Run focused tests plus `npx vitest run tests/salesExperiments.test.js tests/salesLeadsView.test.js tests/salesPaymentFirestore.test.js`.

- [ ] **Step 5: Commit Task 5**

Commit message: `feat(sales): measure opening revenue truth`

### Task 6: BusinessOS client, proxy, block editor, approvals, and reporting

**Files:**
- Modify: `BusinessOS/src/lib/sales-agent/control-client.ts`
- Create: `BusinessOS/src/lib/sales-agent/experiment-client.ts`
- Modify: `BusinessOS/src/app/api/sales-agent/settings/route.ts`
- Create: `BusinessOS/src/app/api/sales-agent/experiment/route.ts`
- Rewrite: `BusinessOS/src/components/sales-agent/sales-agent-control-center.tsx`
- Create: `BusinessOS/src/components/sales-agent/opening-flow-editor.tsx`
- Create: `BusinessOS/src/components/sales-agent/opening-experiment-dashboard.tsx`
- Create: `BusinessOS/src/components/sales-agent/opening-approvals.tsx`
- Create: `BusinessOS/src/components/sales-agent/opening-lead-table.tsx`
- Modify: `BusinessOS/src/app/(protected)/sales-agent/page.tsx`
- Modify: `BusinessOS/src/app/globals.css`
- Modify: `BusinessOS/tests/components/sales-agent-control-center.test.tsx`
- Create: `BusinessOS/tests/components/opening-flow-editor.test.tsx`
- Create: `BusinessOS/tests/components/opening-experiment-dashboard.test.tsx`
- Create: `BusinessOS/tests/integration/sales-agent-experiment-route.test.ts`
- Modify: `BusinessOS/tests/unit/sales-agent-control-client.test.ts`

**Interfaces:**
- Client types exactly mirror Wedding Tales normalized contracts.
- The proxy allowlists editable fields/actions and never forwards arbitrary JSON.
- Editor updates local draft only; Publish includes expected revision.

- [ ] **Step 1: Write failing client/proxy/component tests**

Cover A/B/C defaults, add/remove/reorder with keyboard controls, per-variant/global switches, weights, preview, draft dirty state, publish conflict, mobile labels, metric denominators, filters, approval confirmation, safe offline state, and no AI/model controls.

- [ ] **Step 2: Run RED**

Run: `npx vitest run tests/unit/sales-agent-control-client.test.ts tests/integration/sales-agent-settings-route.test.ts tests/integration/sales-agent-experiment-route.test.ts tests/components/sales-agent-control-center.test.tsx tests/components/opening-flow-editor.test.tsx tests/components/opening-experiment-dashboard.test.tsx`

- [ ] **Step 3: Implement the client and authenticated proxies**

Use the existing Wedding Tales secret/bypass handling, 12-second deadlines, fixed safe errors, and explicit request/response validators.

- [ ] **Step 4: Implement the control-room UI**

Build five tabs: Experiment, Journeys, Leads, Approvals, History. Use the existing night/mint palette, a three-lane vertical journey bench as the signature, 44px targets, 320px layout, visible focus, and reduced motion. Do not introduce a generic dashboard theme or a new font dependency.

- [ ] **Step 5: Run GREEN, accessibility assertions, and browser-width tests**

Run the focused command. Confirm all interactive elements have accessible names, tab panels are keyboard reachable, reorder buttons exist independently of drag, and tables collapse to labeled cards under 540px.

- [ ] **Step 6: Commit Task 6**

Commit message: `feat(sales): control opening experiments in BusinessOS`

### Task 7: Full verification and safe handoff

**Files:**
- Modify only files required by failures introduced by Tasks 1-6.

**Interfaces:**
- Both repositories must finish with clean branches and no Make activation.

- [ ] **Step 1: Run Wedding Tales verification**

Run: `npm test -- --run`, `npm run lint`, `npm run build`, and `git diff --check` in the Wedding Tales worktree.

- [ ] **Step 2: Run BusinessOS verification**

Run: `npm test -- --run`, `npm run lint`, `npx tsc --noEmit`, `npm run build`, and `git diff --check` in the BusinessOS worktree.

- [ ] **Step 3: Inspect the UI at 320px, 768px, and desktop**

Use the local BusinessOS page with fixture data. Verify no horizontal overflow, visible focus, readable RTL order, correct WhatsApp preview, and a clear inactive/live state.

- [ ] **Step 4: Confirm operational safety**

Read Make scenario state without changing it. Confirm no test sent customer messages, no environment variable was printed, and activation remains an explicit later operation.

- [ ] **Step 5: Commit verification fixes and record exact evidence**

Commit message if needed: `fix(sales): harden opening experiment release`

