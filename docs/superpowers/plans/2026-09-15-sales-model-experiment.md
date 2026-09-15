# Sales Model Experiment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a privacy-safe offline benchmark and sticky 80/20 live model experiment that attributes real WhatsApp delivery, progression, verified purchases, revenue, reliability, and cost to Gemini/Anthropic/OpenAI, then exposes the result and the two-sales-per-day target in BusinessOS.

**Architecture:** Wedding Tales owns experiment policy, immutable per-lead assignment, provider execution, delivery/payment truth, analytics, and owner notifications. BusinessOS is a revision-safe control and reporting client; it never writes cohort outcomes directly. The existing static opening experiment stays fixed, and model enrollment begins only when a conversation first reaches the AI sales path.

**Tech Stack:** Next.js 14 App Router, JavaScript (Wedding Tales), TypeScript/React (BusinessOS), Firebase Admin/Firestore, Vitest, WhatsApp Graph API, Vercel.

**Spec:** `docs/superpowers/specs/2026-09-15-sales-model-experiment-design.md`

## Global Constraints

- Primary business metric is verified payments per eligible assigned lead; the operational target is two verified purchases per Israel day.
- Opening route B, current offer facts, media, and prices remain fixed during the model test.
- No phone calls, invented prices/discounts, blind bulk sends, queue deletion, or WhatsApp policy bypass.
- Offline benchmark input must be redacted before provider calls and must never send customer messages.
- Every live lead has one immutable assignment per experiment revision; fallbacks are marked and excluded from efficacy.
- Provider failures and half-open probes are isolated and fenced by provider/model.
- No API, log, fixture, benchmark record, or owner update may expose a phone, transcript, token, provider body, or queue identifier.
- Owner WhatsApp updates are template-compliant, capped at one routine digest per Israel day, plus material failures/recoveries, arm pauses, and winner events.
- All production changes use RED–GREEN TDD and preserve the existing exactly-once delivery semantics.

---

### Task 1: Pure model-experiment policy

**Files:**
- Create: `src/lib/salesAgent/modelExperiment.js`
- Create: `tests/salesModelExperiment.test.js`

**Interfaces:**
- Consumes: registered provider/model rows from `src/lib/salesAgent/settings.js`.
- Produces: `normalizeModelExperiment(input, registry)`, `assignModelArm(experiment, leadId)`, `modelArmKey(assignment)`, `summarizeModelExperiment(leads, options)`, `evaluateModelGuardrail(row)`, and `recommendModelAllocation(summary)`.

- [ ] **Step 1: Write failing normalization and assignment tests**

```js
import { describe, expect, it } from 'vitest'
import { assignModelArm, normalizeModelExperiment } from '@/lib/salesAgent/modelExperiment'

const registry = [
  { id: 'gemini-3.6-flash', provider: 'gemini' },
  { id: 'claude-sonnet-4-5', provider: 'anthropic' },
]
const experiment = {
  id: 'model-2026-09', revision: 1, enabled: true,
  targetVerifiedSalesPerDay: 2, minimumDeliveredPerArm: 30, minimumDays: 7,
  championArmId: 'gemini',
  arms: [
    { id: 'gemini', provider: 'gemini', model: 'gemini-3.6-flash', weight: 80, enabled: true, revision: 1 },
    { id: 'claude', provider: 'anthropic', model: 'claude-sonnet-4-5', weight: 20, enabled: true, revision: 1 },
  ],
}

describe('sales model experiment', () => {
  it('normalizes one exact 80/20 active allocation from registered models', () => {
    expect(normalizeModelExperiment(experiment, registry).arms.map(a => a.weight)).toEqual([80, 20])
  })

  it('keeps every lead sticky and distributes a large opaque cohort near its configured weight', () => {
    const first = assignModelArm(experiment, 'opaque-lead-42')
    expect(assignModelArm(experiment, 'opaque-lead-42')).toEqual(first)
    const counts = { gemini: 0, claude: 0 }
    for (let i = 0; i < 1000; i += 1) counts[assignModelArm(experiment, `opaque-${i}`).armId] += 1
    expect(counts.gemini).toBeGreaterThanOrEqual(760)
    expect(counts.gemini).toBeLessThanOrEqual(840)
    expect(counts.claude).toBe(1000 - counts.gemini)
  })
})
```

- [ ] **Step 2: Run the focused test and confirm RED**

Run: `npm test -- --run tests/salesModelExperiment.test.js`  
Expected: FAIL because `modelExperiment.js` does not exist.

- [ ] **Step 3: Implement validation and deterministic bucket allocation**

```js
import crypto from 'crypto'

export function assignModelArm(experiment, leadId) {
  const enabled = experiment.arms.filter(arm => arm.enabled && arm.weight > 0)
  const bucket = Number.parseInt(crypto.createHash('sha256')
    .update(`${experiment.id}:${experiment.revision}:${leadId}`).digest('hex').slice(0, 8), 16) % 100
  let cursor = 0
  for (const arm of enabled) {
    cursor += arm.weight
    if (bucket < cursor) return {
      experimentId: experiment.id, experimentRevision: experiment.revision,
      armId: arm.id, armRevision: arm.revision, provider: arm.provider, model: arm.model,
    }
  }
  throw new Error('MODEL_EXPERIMENT_NO_ARM')
}
```

`normalizeModelExperiment` must reject unknown models, provider/model mismatch, duplicate arm IDs, more than three arms, enabled weights not totaling 100, non-positive evidence thresholds, and malformed IDs. `summarizeModelExperiment` must count each lead once and use only `paymentVerified === true` for paid/revenue. `recommendModelAllocation` returns `insufficient_evidence`, `keep`, or `promote` and requires both configured sample/day thresholds.

- [ ] **Step 4: Add and pass guardrail/verdict/privacy tests**

Cover fallback exclusion, delivered/read truth, verified revenue, seven-day boundary, 29/30 delivered boundary, provider error threshold, and returned summaries containing no source lead IDs or text. Run the focused test until all cases pass.

- [ ] **Step 5: Commit Task 1**

```bash
git add src/lib/salesAgent/modelExperiment.js tests/salesModelExperiment.test.js
git commit -m "feat(sales): define model revenue experiment policy"
```

---

### Task 2: Revision-safe settings and arm lineage

**Files:**
- Modify: `src/lib/salesAgent/settings.js`
- Modify: `src/lib/salesAgent/settingsStore.js`
- Modify: `src/app/api/sales-agent/settings/route.js`
- Modify: `tests/salesSettings.test.js`
- Modify: `tests/salesSettingsFirestore.test.js`
- Modify: `tests/salesSettingsRoute.test.js`

**Interfaces:**
- Consumes: `normalizeModelExperiment` from Task 1 and `MODEL_REGISTRY`.
- Produces: `settings.modelExperiment`, server-owned `modelArmLineages`, and revision-conflict-safe publication through existing GET/PUT settings API.

- [ ] **Step 1: Write failing schema tests**

```js
it('accepts the approved Gemini 80 / Claude 20 model experiment', () => {
  const value = normalizeSalesSettings({ ...DEFAULT_SALES_SETTINGS, revision: 4, modelExperiment })
  expect(value.modelExperiment.arms.map(row => [row.id, row.weight])).toEqual([
    ['gemini', 80], ['claude', 20],
  ])
})

it('does not reuse an arm lineage after remove and re-add with another model', async () => {
  const removed = await saveSalesSettings({ revision: 4, modelExperiment: oneArm })
  const restored = await saveSalesSettings({ revision: removed.revision, modelExperiment: changedTwoArms })
  expect(restored.modelExperiment.arms.find(row => row.id === 'claude').revision).toBe(2)
})
```

- [ ] **Step 2: Run settings tests and confirm RED**

Run: `npm test -- --run tests/salesSettings.test.js tests/salesSettingsFirestore.test.js tests/salesSettingsRoute.test.js`  
Expected: FAIL because model-experiment settings are absent and arm revisions are not server-owned.

- [ ] **Step 3: Add defaults, normalization, lineage, and credential gates**

Add an inactive default experiment to `DEFAULT_SALES_SETTINGS`. In `saveSalesSettings`, compare the customer-facing signature `{provider, model}` for each arm, carry the maximum historical lineage, and increment only when that signature changes or an ID is re-added. Ignore client-supplied arm revisions. Activation requires the corresponding environment key (`GEMINI_API_KEY`, `ANTHROPIC_API_KEY`, or `OPENAI_API_KEY`).

- [ ] **Step 4: Pass API privacy and conflict tests**

Assert stale revision returns 409, missing credential returns `MODEL_ARM_CREDENTIAL_MISSING`, API response contains the public experiment but not credential presence details, and legacy settings without a model experiment resolve safely.

- [ ] **Step 5: Commit Task 2**

```bash
git add src/lib/salesAgent/settings.js src/lib/salesAgent/settingsStore.js src/app/api/sales-agent/settings/route.js tests/salesSettings.test.js tests/salesSettingsFirestore.test.js tests/salesSettingsRoute.test.js
git commit -m "feat(sales): publish versioned model experiments"
```

---

### Task 3: Sticky Firestore enrollment and provider/model circuit isolation

**Files:**
- Modify: `src/lib/salesAgent/leads.js`
- Modify: `src/lib/salesAgent/circuitBreaker.js`
- Modify: `tests/salesCircuitBreaker.test.js`
- Modify: `tests/salesCircuitFirestore.test.js`
- Create: `tests/salesModelEnrollmentFirestore.test.js`

**Interfaces:**
- Consumes: `assignModelArm(experiment, leadId)`.
- Produces: `resolveOrEnrollModelAssignment({ leadId, experiment, claimToken, generation, deadlineAtMs })` and provider/model-scoped breaker functions that accept `{ provider, model }`.

- [ ] **Step 1: Write failing enrollment transaction tests**

```js
it('creates one assignment and returns it unchanged to concurrent claimants', async () => {
  const [a, b] = await Promise.all([
    resolveOrEnrollModelAssignment(input), resolveOrEnrollModelAssignment(input),
  ])
  expect(a.assignment).toEqual(b.assignment)
  expect(store.get('sales_leads/opaque-lead').modelAssignment.armId).toBe(a.assignment.armId)
})

it('rejects a stale claim without writing an assignment', async () => {
  expect((await resolveOrEnrollModelAssignment({ ...input, claimToken: 'stale' })).action).toBe('stale')
  expect(store.get('sales_leads/opaque-lead')).not.toHaveProperty('modelAssignment')
})
```

- [ ] **Step 2: Run enrollment tests and confirm RED**

Run: `npm test -- --run tests/salesModelEnrollmentFirestore.test.js tests/salesCircuitBreaker.test.js tests/salesCircuitFirestore.test.js`  
Expected: FAIL because enrollment and keyed circuit seams are absent.

- [ ] **Step 3: Implement transactional sticky enrollment**

Inside the existing inbound claim transaction, read the lead; return its matching experiment/revision assignment, or compute and persist one. Store only experiment/arm/provider/model/revisions and server timestamp. Refuse a stale claim/generation/deadline and never store a phone or transcript in an experiment-specific collection.

- [ ] **Step 4: Key and fence breaker state by provider/model**

Use a stable SHA-256 key of `provider:model` for Firestore breaker documents. Keep probe ID, lease, deadline, late-success no-op, and late-failure no-op behavior unchanged. Add a test where three Gemini failures open only Gemini while Claude remains closed.

- [ ] **Step 5: Run focused and carryover reliability tests**

Run: `npm test -- --run tests/salesModelEnrollmentFirestore.test.js tests/salesCircuitBreaker.test.js tests/salesCircuitFirestore.test.js tests/salesReplyRoute.test.js`  
Expected: PASS with existing duplicate, timeout, fallback, and atomic-completion cases unchanged.

- [ ] **Step 6: Commit Task 3**

```bash
git add src/lib/salesAgent/leads.js src/lib/salesAgent/circuitBreaker.js tests/salesModelEnrollmentFirestore.test.js tests/salesCircuitBreaker.test.js tests/salesCircuitFirestore.test.js
git commit -m "feat(sales): assign models once per lead"
```

---

### Task 4: Runtime attribution, delivery truth, and verified purchases

**Files:**
- Modify: `src/app/api/sales-agent/reply/route.js`
- Modify: `src/lib/salesAgent/leads.js`
- Create: `src/lib/salesAgent/modelExperimentAnalytics.js`
- Modify: `src/lib/salesAgent/weddingSalesReconciliation.js`
- Modify: `tests/salesReplyRoute.test.js`
- Modify: `tests/salesDeliveryFirestore.test.js`
- Modify: `tests/salesPaymentFirestore.test.js`
- Create: `tests/salesModelExperimentAnalytics.test.js`

**Interfaces:**
- Consumes: sticky assignment and keyed circuit from Task 3.
- Produces: immutable model cohort fields on the lead/exchange, `summarizeLiveModelExperiment(leads, options)`, and purchase attribution that relies only on existing verified payment matching.

- [ ] **Step 1: Write failing route attribution tests**

```js
it('calls only the assigned provider/model and persists actual execution truth', async () => {
  mocks.resolveOrEnrollModelAssignment.mockResolvedValue({ action: 'assigned', assignment: claudeAssignment })
  await POST(inboundRequest())
  expect(mocks.callClaude).toHaveBeenCalledWith(expect.objectContaining({
    provider: 'anthropic', model: 'claude-sonnet-4-5',
  }))
  expect(mocks.completeSuccessfulExchange).toHaveBeenCalledWith(expect.objectContaining({
    modelAssignment: claudeAssignment,
    modelExecution: expect.objectContaining({ provider: 'anthropic', fallback: false }),
  }))
})
```

Add tests proving deterministic opening turns call zero models, duplicate webhooks call zero models, fallback marks contamination, and repair calls do not create a second sample.

- [ ] **Step 2: Run route tests and confirm RED**

Run: `npm test -- --run tests/salesReplyRoute.test.js tests/salesModelExperimentAnalytics.test.js`  
Expected: FAIL because the route still reads one global provider/model and analytics do not exist.

- [ ] **Step 3: Select the sticky arm at the last safe pre-provider boundary**

After all opening/no-reply/media gates and inside the existing claimed inbound lifetime, resolve assignment and use its provider/model. Preserve route deadline, breaker lease, JSON repair, fallback, and atomic completion. Persist `modelPrimaryAttempted`, `modelFallbackUsed`, normalized failure code, latency bucket, and spend reference without provider response text.

- [ ] **Step 4: Attribute delivery and purchase truth**

On delivered/read callbacks, update the same lead/cohort counters exactly once. In `closeLeadOnPurchase`, retain the stored immutable assignment and stamp `modelPaymentAttributedAt` only when `paymentVerified` is written for the first time. Never infer a model from the currently active settings.

- [ ] **Step 5: Implement honest live summary**

Return arm rows containing assigned, primaryAttempted, delivered, replied24h, progressed, readyToPay, verifiedPaid, verifiedRevenue, providerFailures, fallbacks, costUsd, revenuePerEligibleLead, costPerVerifiedPurchase, latency buckets, exposure days, and sample sufficiency. Exclude fallbacks from efficacy numerators/denominators but include them in reliability rows.

- [ ] **Step 6: Pass focused reliability/payment tests and commit**

Run: `npm test -- --run tests/salesReplyRoute.test.js tests/salesDeliveryFirestore.test.js tests/salesPaymentFirestore.test.js tests/salesModelExperimentAnalytics.test.js`  
Then commit:

```bash
git add src/app/api/sales-agent/reply/route.js src/lib/salesAgent/leads.js src/lib/salesAgent/modelExperimentAnalytics.js src/lib/salesAgent/weddingSalesReconciliation.js tests/salesReplyRoute.test.js tests/salesDeliveryFirestore.test.js tests/salesPaymentFirestore.test.js tests/salesModelExperimentAnalytics.test.js
git commit -m "feat(sales): attribute model turns to verified revenue"
```

---

### Task 5: Redacted offline benchmark

**Files:**
- Create: `src/lib/salesAgent/modelBenchmark.js`
- Create: `src/app/api/sales-agent/model-benchmark/route.js`
- Create: `tests/salesModelBenchmark.test.js`
- Create: `tests/salesModelBenchmarkRoute.test.js`

**Interfaces:**
- Consumes: `callClaude`, model registry, existing prompt/catalog policy, and historical lead reader.
- Produces: `redactBenchmarkCase(input)`, `scoreBenchmarkCandidate(input)`, `runModelBenchmark(input, deps)`, and an authenticated POST route with dry, bounded execution.

- [ ] **Step 1: Write failing redaction/no-send tests**

```js
it('removes direct identifiers before every provider call and stores no raw text', async () => {
  const callModel = vi.fn(async () => ({ text: validCandidate }))
  const saveScore = vi.fn()
  await runModelBenchmark({ cases: [privateCase], candidates }, { callModel, saveScore })
  expect(JSON.stringify(callModel.mock.calls)).not.toMatch(/052|@|order-private|https?:\/\//)
  expect(JSON.stringify(saveScore.mock.calls)).not.toContain(privateCase.incomingText)
})

it('never calls a WhatsApp transport', async () => {
  await runModelBenchmark(input, { callModel, saveScore, sendWhatsApp: forbiddenSend })
  expect(forbiddenSend).not.toHaveBeenCalled()
})
```

- [ ] **Step 2: Run benchmark tests and confirm RED**

Run: `npm test -- --run tests/salesModelBenchmark.test.js tests/salesModelBenchmarkRoute.test.js`  
Expected: FAIL because benchmark modules do not exist.

- [ ] **Step 3: Implement bounded stratification, redaction, and scoring**

Select at most 100 cases, balanced across intent/stage/outcome. Keep at most the last four short turns after redacting phone/email/URL/order/name patterns. Score schema validity, fixed policy/catalog facts, no-call compliance, next-action fit, brevity, error, latency, and cost. Store only random case ID, arm identity, fixed numeric/boolean scores, normalized code, and timestamps.

- [ ] **Step 4: Add authorization, idempotency, and budget limits**

The POST route accepts a server secret or super-admin token, requires an explicit benchmark revision, claims one run transactionally, caps cases/candidates/calls, and returns aggregate rows only. Replays return the stored aggregate without calling providers again.

- [ ] **Step 5: Pass benchmark tests and commit**

```bash
git add src/lib/salesAgent/modelBenchmark.js src/app/api/sales-agent/model-benchmark/route.js tests/salesModelBenchmark.test.js tests/salesModelBenchmarkRoute.test.js
git commit -m "feat(sales): benchmark sales models without sending"
```

---

### Task 6: Wedding Tales experiment API and BusinessOS scorecard/control

**Files (Wedding Tales):**
- Create: `src/app/api/sales-agent/model-experiment/route.js`
- Create: `tests/salesModelExperimentRoute.test.js`

**Files (BusinessOS):**
- Create: `src/lib/sales-agent/model-experiment-client.ts`
- Create: `src/components/sales-agent/model-experiment-panel.tsx`
- Modify: `src/components/sales-agent/sales-agent-control-center.tsx`
- Modify: `src/app/globals.css`
- Create: `tests/unit/sales-agent-model-experiment-client.test.ts`
- Create: `tests/components/model-experiment-panel.test.tsx`

**Interfaces:**
- Wedding GET returns only aggregate benchmark/live rows, target status, sample sufficiency, recommendation, and arm configuration. Wedding POST accepts revision-safe pause/resume/allocation actions.
- BusinessOS client exposes `readModelExperiment()` and `publishModelExperiment(input)`; panel renders no raw lead rows.

- [ ] **Step 1: Write failing Wedding API tests**

Assert 401 unauthenticated, aggregate allowlist on GET, 409 stale revision, missing credential rejection, exact pause action, and no phones/transcripts/provider bodies in JSON.

- [ ] **Step 2: Run Wedding route tests and confirm RED**

Run: `npm test -- --run tests/salesModelExperimentRoute.test.js`  
Expected: FAIL because the route does not exist.

- [ ] **Step 3: Implement Wedding GET/POST and pass route tests**

Use the same identity boundary as sales settings. Read live analytics and stored benchmark aggregates. Publish through Task 2’s settings transaction. Return fixed public fields only.

- [ ] **Step 4: Write failing BusinessOS client/component tests**

```tsx
it('shows verified revenue truth, target progress, allocation, and insufficient evidence', () => {
  render(<ModelExperimentPanel snapshot={snapshot} />)
  expect(screen.getByText('2 מכירות מאומתות ביום')).toBeInTheDocument()
  expect(screen.getByText('80%')).toBeInTheDocument()
  expect(screen.getByText('אין עדיין מספיק ראיות')).toBeInTheDocument()
})
```

Assert pause/publish request bodies contain only revision/action/arm/weight fields and component never renders raw IDs or messages.

- [ ] **Step 5: Implement BusinessOS client and responsive panel**

Use RTL cards with a two-arm comparison, verified-paid/revenue as the strongest visual hierarchy, secondary funnel/reliability rows, a two-sales/day rail, and accessible 44px controls. At 320px, stack all arm cards and actions with no horizontal overflow. Respect reduced motion.

- [ ] **Step 6: Run both repositories’ focused tests and commit separately**

Wedding Tales:

```bash
git add src/app/api/sales-agent/model-experiment/route.js tests/salesModelExperimentRoute.test.js
git commit -m "feat(sales): expose private model experiment truth"
```

BusinessOS:

```bash
git add src/lib/sales-agent/model-experiment-client.ts src/components/sales-agent/model-experiment-panel.tsx src/components/sales-agent/sales-agent-control-center.tsx src/app/globals.css tests/unit/sales-agent-model-experiment-client.test.ts tests/components/model-experiment-panel.test.tsx
git commit -m "feat(sales): control model revenue experiments"
```

---

### Task 7: Privacy-safe owner status notifications

**Files:**
- Create: `src/lib/salesAgent/ownerStatus.js`
- Create: `src/app/api/cron/sales-model-status/route.js`
- Modify: `vercel.json`
- Create: `tests/salesOwnerStatus.test.js`
- Create: `tests/salesOwnerStatusRoute.test.js`

**Interfaces:**
- Consumes: model experiment summary, sales health, `sendWhatsAppTemplate`, and `SALES_AGENT_OWNER_PHONE`.
- Produces: `decideOwnerStatus(previous, current, nowMs)` and a cron route that records a notification claim before attempting template delivery.

- [ ] **Step 1: Write failing decision/privacy/rate-limit tests**

```js
it('emits one routine digest per Israel day and immediate material transitions only', () => {
  expect(decideOwnerStatus(previous, healthy, noon).kind).toBe('daily_digest')
  expect(decideOwnerStatus(healthy, healthy, noon + 60_000)).toBeNull()
  expect(decideOwnerStatus(healthy, transportDown, noon + 120_000).kind).toBe('transport_outage')
})

it('never includes owner phone, lead data, transcript, queue id, or provider body', () => {
  expect(JSON.stringify(buildOwnerStatusPayload(privateInput))).not.toMatch(/052|queue-|customer text|token/)
})
```

- [ ] **Step 2: Run owner-status tests and confirm RED**

Run: `npm test -- --run tests/salesOwnerStatus.test.js tests/salesOwnerStatusRoute.test.js`  
Expected: FAIL because owner status modules do not exist.

- [ ] **Step 3: Implement claim-first template-only delivery**

The cron is authorized by `CRON_SECRET`. It evaluates one daily digest plus material state transitions, creates a deterministic event ID, and transactionally claims it before calling WhatsApp. Outside the service window it uses only an allowlisted approved template. Missing/rejected template records `not_sent` with a normalized reason and never falls back to free-form text.

- [ ] **Step 4: Pass replay/failure/privacy tests and commit**

Cover concurrent cron invocations, provider acceptance followed by persistence degradation, template unavailable, critical recovery, target reached, arm paused, and winner recommended. Then commit:

```bash
git add src/lib/salesAgent/ownerStatus.js src/app/api/cron/sales-model-status/route.js vercel.json tests/salesOwnerStatus.test.js tests/salesOwnerStatusRoute.test.js
git commit -m "feat(sales): notify owner on material revenue events"
```

---

### Task 8: End-to-end verification and controlled rollout

**Files:**
- Modify only if evidence requires a tested fix; otherwise no production files.

**Interfaces:**
- Consumes: all prior tasks.
- Produces: deployed, observed, rollback-ready Wedding Tales and BusinessOS releases.

- [ ] **Step 1: Run Wedding Tales verification**

Run:

```bash
npm test -- --run
npm run lint
npm run build
git diff --check
git status --short
```

Expected: all tests/build pass, lint has no new errors, diff check clean, worktree clean.

- [ ] **Step 2: Run BusinessOS verification**

Run the same test/lint/build/diff/status gates in `C:/Users/DELL/OneDrive/Desktop/BusinessOS`.

- [ ] **Step 3: Deploy schema-compatible disabled readers first**

Deploy Wedding Tales to production with the model experiment disabled. Verify existing route B stays weight 100, main Make scenario stays active/queue zero, a dry follow-up reports `whatsappConfigured:true`, and no benchmark route sends WhatsApp.

- [ ] **Step 4: Run the offline benchmark**

Invoke the authenticated benchmark once for the pinned revision. Verify each configured candidate produced only aggregate redacted scores, no send/delivery event was created, and no PII appears in logs or response.

- [ ] **Step 5: Publish the live 80/20 experiment**

Choose the top benchmark candidate as champion and the runner-up as challenger, retain the approved thresholds, publish with the current settings revision, and read back the exact live snapshot. Do not alter opening copy, media, prices, campaign, or lead history.

- [ ] **Step 6: Deploy BusinessOS and perform signed-in UI smoke**

Verify 1440px and 320px layouts, target rail, arm allocation, insufficient-evidence copy, revision conflict behavior, pause control, and no raw customer data.

- [ ] **Step 7: Verify one real inbound without exposing PII**

Observe a new inbound or safe test lead through Make queue acceptance, Wedding reply handling, WhatsApp accepted then delivered/read callback, sticky assignment persistence, and aggregate arm increment. Report only normalized status and aggregate counts.

- [ ] **Step 8: Verify rollback and commit evidence**

Confirm the prior settings revision can be restored and the model experiment can be disabled without changing opening route B. Record deployment IDs and aggregate verification in the existing ignored task report area; do not record secrets or customer identifiers.
