# WhatsApp Opening Revenue Journey Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every eligible new WhatsApp lead receive a direct answer, two proven book images, the live blessing-upload demo, one missing-fact qualification question, and a measured path toward verified payment.

**Architecture:** Wedding Tales remains the deterministic sales brain. A pure opening-plan module composes an ordered, idempotent delivery contract; the existing model only writes the direct-answer copy. Make sends the ordered parts and reports delivery, while existing verified-payment and media-attribution paths provide learning without self-editing prompts.

**Tech Stack:** Next.js 14 route handlers, JavaScript, Vitest, Firebase Admin/Firestore transactions, WhatsApp Business Cloud through Make, Vercel.

**Spec:** `docs/superpowers/specs/2026-08-19-opening-proof-qualification-design.md`

## Global Constraints

- No phone-call offer or call task may be generated.
- A direct customer question, especially price, is answered before media or qualification.
- The opening bundle is new-lead-only and contains at most two approved images plus the exact catalog demo URL.
- Known `eventType` and `eventDate` are never asked again.
- Every outbound part has a phone-free stable identifier and duplicate webhooks send zero additional parts.
- Only acknowledged delivery earns delivery credit; only a verified payment earns a win.
- Existing user changes in `.gitignore`, `src/app/admin/page.js`, `src/app/api/admin/weddings/route.js`, and `src/app/landing/LandingClient.jsx` are preserved untouched.

---

### Task 1: Pure opening and qualification plan

**Files:**
- Create: `src/lib/salesAgent/openingPlan.js`
- Create: `tests/salesOpeningPlan.test.js`
- Modify: `src/lib/salesAgent/decisionPolicy.js`
- Modify: `tests/salesDecisionPolicy.test.js`

**Interfaces:**
- Consumes: `scoreMedia(stat)` from `mediaLibrary.js`, `DEMO.writeBlessing` from `catalog.js`, durable lead facts, current sales settings and approved media library.
- Produces: `buildOpeningPlan({ lead, decision, settings, library, stats, eventId })` returning `{ eligible, qualificationTarget, closingText, mediaParts }`.
- Produces: `decideSalesTurn(...)` fields `openingBundleRequired: boolean` and `qualificationTarget: 'eventTypeAndDate' | 'eventType' | 'eventDate' | null`.

- [ ] **Step 1: Write failing pure-policy tests**

```js
it('requires proof then missing event facts for an eligible new lead', () => {
  expect(decideSalesTurn({ lead: { isNew: true }, incomingText: 'אפשר פרטים?' })).toMatchObject({
    openingBundleRequired: true,
    qualificationTarget: 'eventTypeAndDate',
  })
})

it('answers price first and composes two images before demo qualification', () => {
  const plan = buildOpeningPlan({
    lead: { isNew: true },
    decision: decideSalesTurn({ lead: { isNew: true }, incomingText: 'כמה עולה?' }),
    settings: { openingMediaSequence: ['cover_personalised', 'book_open_spread'] },
    library,
    stats: {},
    eventId: 'event-safe-1',
  })
  expect(plan.mediaParts.map(part => part.key)).toEqual(['cover_personalised', 'book_open_spread'])
  expect(plan.closingText).toContain(DEMO.writeBlessing)
  expect(plan.closingText).toContain('לאיזה אירוע ומתי')
  expect(JSON.stringify(plan)).not.toMatch(/phone|972|customerText/)
})
```

- [ ] **Step 2: Run RED**

Run: `npx vitest run tests/salesOpeningPlan.test.js tests/salesDecisionPolicy.test.js`

Expected: FAIL because `openingPlan.js` and the new decision fields do not exist.

- [ ] **Step 3: Implement the minimal pure module**

```js
export const DEFAULT_OPENING_MEDIA = ['cover_personalised', 'book_open_spread']
export const OPENING_MIN_SAMPLE = 30

export function qualificationTarget(lead = {}) {
  if (!lead.eventType && !lead.eventDate) return 'eventTypeAndDate'
  if (!lead.eventType) return 'eventType'
  if (!lead.eventDate) return 'eventDate'
  return null
}

export function buildOpeningPlan({ lead = {}, decision = {}, settings = {}, library = {}, stats = {}, eventId = '' }) {
  if (lead.isNew !== true || decision.openingBundleRequired !== true) {
    return { eligible: false, qualificationTarget: null, closingText: '', mediaParts: [] }
  }
  // Prefer the configured order. Use score only after 30 sends, and fill
  // empty slots from the two catalog defaults. Filter missing/non-image/
  // already-seen keys, cap at two, and hash eventId+index+key for partId.
  // closingText contains the fixed demo URL and exactly one question for
  // the missing fact target; when no fact is missing it contains no question.
}
```

- [ ] **Step 4: Add edge-case tests and make GREEN**

```js
it.each([
  [{ isNew: false }, false],
  [{ isNew: true, stage: 'handoff' }, false],
  [{ isNew: true, stage: 'closed_won', paymentVerified: true }, false],
])('blocks an opening bundle outside a new sales lead', (lead, eligible) => {
  expect(buildOpeningPlan({ lead, decision: decideSalesTurn({ lead }), settings, library, stats: {}, eventId: 'e' }).eligible).toBe(eligible)
})

it('asks only for the date when type is known', () => {
  expect(buildOpeningPlan({ lead: { isNew: true, eventType: 'bar_mitzvah' }, decision, settings, library, stats: {}, eventId: 'e' }).closingText)
    .toMatch(/מתי האירוע/)
})

it('keeps configured order below 30 deliveries and uses proven order at 30', () => {
  expect(keysFor({ a: { delivered: 29 }, b: { delivered: 29 } })).toEqual(['a', 'b'])
  expect(keysFor({ a: { delivered: 30, replied: 2 }, b: { delivered: 30, replied: 20 } })).toEqual(['b', 'a'])
})
```

Add the fixture helpers `keysFor`, `settings`, `library` and `decision` inside `tests/salesOpeningPlan.test.js`; they invoke the real exported function and contain no customer identifiers.

Run: `npx vitest run tests/salesOpeningPlan.test.js tests/salesDecisionPolicy.test.js`

Expected: PASS with zero failures.

- [ ] **Step 5: Commit Task 1**

```bash
git add src/lib/salesAgent/openingPlan.js src/lib/salesAgent/decisionPolicy.js tests/salesOpeningPlan.test.js tests/salesDecisionPolicy.test.js
git commit -m "feat(sales): plan the proof-first opening journey"
```

---

### Task 2: Ordered durable response contract

**Files:**
- Modify: `src/app/api/sales-agent/reply/route.js`
- Modify: `src/lib/salesAgent/inboundEventsCore.js`
- Modify: `src/lib/salesAgent/leads.js`
- Modify: `tests/salesReplyRoute.test.js`
- Modify: `tests/salesInboundEvents.test.js`
- Modify: `tests/salesDeliveryFirestore.test.js`

**Interfaces:**
- Consumes: `buildOpeningPlan(...)` from Task 1.
- Produces: response field `openingSequenceParts`, an ordered array of `{ partId, order, kind, url?, text?, caption?, mediaKey?, demoEvidence }`.
- Produces: durable requested-delivery records for every sequence part before the HTTP response is returned.

- [ ] **Step 1: Write failing route-contract tests**

```js
it('returns answer, two images, then demo qualification in exact order', async () => {
  const result = await post(inbound({ text: 'כמה עולה?' }))
  expect(result.body.openingSequenceParts.map(part => part.kind)).toEqual([
    'text', 'image', 'image', 'text',
  ])
  expect(result.body.openingSequenceParts[0].text).toMatch(/690|950|1490/)
  expect(result.body.openingSequenceParts[3].text).toContain('/photo')
  expect(result.body.openingSequenceParts[3].text).toContain('לאיזה אירוע ומתי')
})
```

Also assert that an existing lead, handoff, negative exit, payment intent with a previously sent link, and cached duplicate all return no opening sequence.

- [ ] **Step 2: Run RED**

Run: `npx vitest run tests/salesReplyRoute.test.js tests/salesInboundEvents.test.js tests/salesDeliveryFirestore.test.js`

Expected: FAIL because `openingSequenceParts` and per-part persistence are missing.

- [ ] **Step 3: Wire the opening plan after deterministic reply enforcement**

```js
const openingPlan = buildOpeningPlan({
  lead,
  decision: turnDecision,
  settings,
  library,
  stats,
  eventId,
})

const openingSequenceParts = openingPlan.eligible
  ? [answerPart(parsed.messages.join('\n\n'), eventId), ...openingPlan.mediaParts, closingPart(openingPlan.closingText, eventId)]
  : []

const hashPart = value => createHash('sha256').update(value).digest('hex').slice(0, 32)

function answerPart(text, eventId) {
  return { partId: hashPart(`opening:${eventId}:answer`), order: 1, kind: 'text', text, demoEvidence: false }
}

function closingPart(text, eventId, order = 4) {
  return { partId: hashPart(`opening:${eventId}:demo`), order, kind: 'text', text, demoEvidence: true }
}
```

When eligible, keep legacy `sendText`/`openingMediaParts` fields for compatibility but derive them from `openingSequenceParts`. The customer-facing direct answer remains first. The exact demo-and-question text remains last.

- [ ] **Step 4: Persist every part atomically**

Extend `completeSuccessfulExchange` to derive requested delivery records from `openingSequenceParts`. Each record stores only bounded operational metadata: outbound ID, kind, order, `mediaKey` when relevant, `demoEvidence`, logical attempt ID and delivery role. Do not store the demo URL or customer text in delivery metadata.

Extend `sanitizeInboundOutcome` with a bounded, allowlisted `openingSequenceParts` representation so cached outcomes remain truthful while duplicate claims still send nothing.

Remove the eager `recordMediaSent` call from the successful reply branch. Preparing or persisting a reply is not proof that WhatsApp delivered it.

- [ ] **Step 5: Run GREEN and regressions**

Run: `npx vitest run tests/salesOpeningPlan.test.js tests/salesDecisionPolicy.test.js tests/salesReplyRoute.test.js tests/salesInboundEvents.test.js tests/salesDeliveryFirestore.test.js tests/salesDeliveryRoute.test.js`

Expected: PASS with zero failures.

- [ ] **Step 6: Commit Task 2**

```bash
git add src/app/api/sales-agent/reply/route.js src/lib/salesAgent/inboundEventsCore.js src/lib/salesAgent/leads.js tests/salesReplyRoute.test.js tests/salesInboundEvents.test.js tests/salesDeliveryFirestore.test.js
git commit -m "feat(sales): persist the ordered opening bundle"
```

---

### Task 3: Delivery-truth learning

**Files:**
- Modify: `src/lib/salesAgent/leads.js`
- Modify: `src/lib/salesAgent/mediaLibrary.js`
- Modify: `tests/salesDeliveryFirestore.test.js`
- Modify: `tests/salesMediaLibrary.test.js`

**Interfaces:**
- Consumes: requested records with `mediaKey` and `demoEvidence` from Task 2.
- Produces: delivery callback updates that credit a media send exactly once on first `delivered`/`read`, never on `requested`, `accepted` or `failed`.
- Produces: `rankOpeningMedia(stats)` which refuses performance reordering below 30 delivered exposures.

- [ ] **Step 1: Write failing delivery-truth tests**

```js
it('credits opening media once only after delivered', async () => {
  await recordDeliveryEvent(accepted)
  expect(mediaStatsWrites()).toHaveLength(0)
  await recordDeliveryEvent(delivered)
  await recordDeliveryEvent(read)
  expect(mediaStatsWrites()).toEqual([{ key: 'cover_personalised', delivered: 1 }])
})
```

Add tests for failed, replayed delivered, secondary image after primary text, and verified purchase credit remaining idempotent.

- [ ] **Step 2: Run RED**

Run: `npx vitest run tests/salesDeliveryFirestore.test.js tests/salesMediaLibrary.test.js`

Expected: FAIL because current send analytics are prepared-response based.

- [ ] **Step 3: Implement transactional first-delivery credit**

Use the existing delivery ledger transaction. Set a `deliveryCreditedAt` marker on the outbound record and increment only when the transition first reaches `delivered` or `read`. Keep payment win credit on the verified WooCommerce boundary.

- [ ] **Step 4: Run GREEN**

Run: `npx vitest run tests/salesDeliveryFirestore.test.js tests/salesMediaLibrary.test.js tests/salesPaymentFirestore.test.js`

Expected: PASS with zero failures.

- [ ] **Step 5: Commit Task 3**

```bash
git add src/lib/salesAgent/leads.js src/lib/salesAgent/mediaLibrary.js tests/salesDeliveryFirestore.test.js tests/salesMediaLibrary.test.js
git commit -m "fix(sales): learn only from acknowledged proof"
```

---

### Task 4: Make ordered transport and production rollout

**Files:**
- Modify: live Make scenario `9630287` through the authenticated Make API.
- Verify: `src/app/api/sales-agent/reply/route.js` production deployment.
- Verify: BusinessOS `/automations` and `/sales-agent` control screens.

**Interfaces:**
- Consumes: `openingSequenceParts` from Task 2.
- Produces: sequential WhatsApp sends and delivery callbacks using each exact `partId`.

- [ ] **Step 1: Capture and validate the current live blueprint**

Read the live blueprint, verify scenario ID/name, record a canonical hash without printing secrets, and refuse to patch on unexpected topology drift.

- [ ] **Step 2: Patch the transport sequence while inactive**

Stop scenario `9630287`. Add one iterator over `openingSequenceParts`, route `text`, `image`, and `video` to the approved WhatsApp modules, map `partId` into the delivery correlation callback, and preserve the existing legacy branches for non-opening replies. Do not activate any other WhatsApp scenario.

- [ ] **Step 3: Validate the blueprint before saving**

Verify unique module IDs, no dangling references, no embedded secret values, exact Wedding Tales endpoint, exact status callback endpoint, sequential order, and a false branch for an empty sequence.

- [ ] **Step 4: Deploy Wedding Tales and run a synthetic canary**

Deploy the committed Wedding Tales code to the existing Vercel production project. Send one synthetic new-lead payload using a non-customer test identifier. Verify the reply contract contains answer → two images → demo/qualification, then verify duplicate replay performs zero sends.

- [ ] **Step 5: Activate and verify production health**

Start only scenario `9630287`. Verify Make returns `isActive: true`, the queue is zero, BusinessOS lists the scenario as active, and the Wedding Tales authenticated endpoint accepts the current Make secret. Keep the existing kill switch available.

- [ ] **Step 6: Final verification**

Run: `npx vitest run tests/`

Run: `npm run lint`

Run: `npm run build`

Expected: all tests pass, lint has zero errors, build exits 0, and `git diff --check` is clean. Report any pre-existing unrelated warnings separately rather than hiding them.
