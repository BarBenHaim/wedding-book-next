# WhatsApp Chat Closer and Payment Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn qualified WhatsApp interest into a systematic, chat-only path from question to one recommended package, one tracked checkout link, objection-specific follow-up, and verified payment.

**Architecture:** Pure sales decisions classify the customer's current blocker and select exactly one `nextBestAction`; the model writes natural Hebrew inside those deterministic boundaries. Wedding Tales owns lead state and opaque checkout redirects, WooCommerce owns payment truth, and BusinessOS receives append-only metadata best-effort without blocking a customer reply.

**Tech Stack:** Next.js 15 route handlers, JavaScript, Firebase Admin/Firestore, WooCommerce webhooks, Vitest 2, BusinessOS HTTPS event API.

**Spec:** `docs/superpowers/specs/2026-08-14-revenue-sales-engine-design.md`

## Global Constraints

- Every sale is closed asynchronously inside WhatsApp.
- The bot never suggests a phone call, schedules a call, or creates a dialing task.
- Answer the customer's direct question before collecting more information.
- Collect event type, event date, and celebrant name progressively; never send a questionnaire.
- Select one `nextBestAction` per turn and one recommended package per offer.
- Send one payment link and do not repeat it unless the customer requests it or reports a checkout problem.
- Prices and checkout URLs come only from `src/lib/salesAgent/catalog.js`.
- Pending/draft WooCommerce orders are funnel events, never revenue.
- Only `processing` and `completed` orders produce `payment_verified` and `closed_won`.
- Missing package cost means contribution margin is unknown, not zero and not profit.
- BusinessOS event delivery is best-effort and cannot delay or fail a WhatsApp response.
- Do not put phone numbers, names, or emails in redirect URLs, logs, event IDs, or test fixtures.
- Before code changes, read `AGENTS.md` and relevant recent commits; use the repository temporary-index commit procedure.

---

## File Structure

**Create in Wedding Tales**

- `src/lib/salesAgent/closing.js` — pure objection taxonomy, package recommendation, and next-action rules.
- `src/lib/salesAgent/paymentLinks.js` — opaque token parsing and safe package redirect resolution.
- `src/lib/salesAgent/orderAttribution.js` — pure Woo line-item/package extraction and paid-status rules.
- `src/lib/salesAgent/businessOsEvents.js` — non-blocking signed event client.
- `src/app/go/pay/[token]/route.js` — tracked redirect to the catalog checkout URL.
- `tests/salesClosing.test.js` — chat-closer decisions and no-call contract.
- `tests/salesPaymentLinks.test.js` — redirect token and package safety.
- `tests/salesOrderAttribution.test.js` — Woo status, package, amount, and idempotency inputs.
- `tests/salesBusinessOsEvents.test.js` — sanitized event payload and timeout behavior.

**Modify in Wedding Tales**

- `src/lib/salesAgent/catalog.js` — expose package lookup without duplicating values.
- `src/lib/salesAgent/agent.js` — require structured `objectionCode`, `recommendedPackageId`, and `nextBestAction`.
- `src/lib/salesAgent/prompt.js` — inject chat-closing protocol and suppress retired call instructions.
- `src/lib/salesAgent/journey.js` — stage-specific closing goals and one-step CTAs.
- `src/lib/salesAgent/selling.js` — no-call guard and objection playbooks.
- `src/lib/salesAgent/leads.js` — persist closing fields, tracked link state, and idempotent payment closure.
- `src/app/api/sales-agent/reply/route.js` — apply deterministic guards and emit funnel events.
- `src/app/api/createWedding/route.js` — record checkout/paid state and close the matching lead.
- `tests/salesAgent.test.js`, `tests/salesJourney.test.js`, `tests/salesSelling.test.js` — structured output and prompt contracts.

**Modify in BusinessOS in the matching task**

- `src/lib/automations/conversation-event-handler.ts` — accept the complete sales event vocabulary and payment metadata.
- `src/lib/automations/conversation-event-store.ts` — idempotently persist the new fields.
- `src/lib/marketing/conversation-attribution.ts` — include order and amount in checksums/storage.
- `tests/integration/conversation-events-route.test.ts`, `tests/unit/conversation-attribution.test.ts` — contract coverage.

---

### Task 1: Deterministic Chat-Closing Decisions

**Files:**
- Create: `src/lib/salesAgent/closing.js`
- Create: `tests/salesClosing.test.js`
- Modify: `src/lib/salesAgent/catalog.js`

**Interfaces:**
- Consumes: `{ stage, eventType, eventDate, packageInterest, paymentLinkSentAt, objectionCode, customerAskedForHuman }` and the catalog `PACKAGES`.
- Produces: `OBJECTION_CODES`, `NEXT_ACTIONS`, `recommendPackage(lead)`, and `chooseNextBestAction(lead)` returning `{ action, packageId, reason }`.

- [ ] **Step 1: Write failing decision tests**

```js
import { describe, expect, it } from 'vitest'
import { chooseNextBestAction, recommendPackage } from '../src/lib/salesAgent/closing'

describe('chat closer', () => {
  it('asks for missing event type before making an offer', () => {
    expect(chooseNextBestAction({ stage: 'new' })).toEqual({
      action: 'ask_event_type', packageId: null, reason: 'event_type_missing',
    })
  })

  it('shows proof before an offer when no demo or media was sent', () => {
    expect(chooseNextBestAction({ stage: 'engaged', eventType: 'bar_mitzvah', stagesReached: ['engaged'] }))
      .toMatchObject({ action: 'show_proof' })
  })

  it('recommends printed by default when a physical keepsake is wanted', () => {
    expect(recommendPackage({ wantsPrinted: true })).toBe('printed')
  })

  it('does not send the payment link twice', () => {
    expect(chooseNextBestAction({ stage: 'ready_to_pay', packageInterest: 'printed', paymentLinkSentAt: 1 }))
      .toEqual({ action: 'resolve_checkout_blocker', packageId: 'printed', reason: 'link_already_sent' })
  })

  it('hands off in WhatsApp when a person is requested', () => {
    expect(chooseNextBestAction({ customerAskedForHuman: true })).toMatchObject({ action: 'human_chat_handoff' })
  })
})
```

- [ ] **Step 2: Run the test and verify the missing module failure**

Run: `npx vitest run tests/salesClosing.test.js`

Expected: FAIL with missing `closing.js`.

- [ ] **Step 3: Implement the exact decision vocabulary**

```js
export const OBJECTION_CODES = [
  'price', 'consult_someone', 'event_far', 'trust', 'how_it_works',
  'no_smartphones', 'no_urgency', 'checkout_problem', 'unknown',
]

export const NEXT_ACTIONS = [
  'answer_question', 'ask_event_type', 'ask_event_date', 'ask_celebrant_name',
  'show_proof', 'recommend_package', 'ask_binary_choice', 'send_payment_link',
  'resolve_objection', 'resolve_checkout_blocker', 'human_chat_handoff', 'stop',
]

export function recommendPackage(lead = {}) {
  if (['digital', 'printed', 'premium'].includes(lead.packageInterest)) return lead.packageInterest
  if (lead.wantsTwoCopies || lead.wantsPremium) return 'premium'
  if (lead.digitalOnly === true) return 'digital'
  return 'printed'
}
```

`chooseNextBestAction` must order guards as: closed → human request → direct unanswered question → missing event type/date/name → proof → open objection → package recommendation → binary choice → payment link → checkout blocker. It must never return an action outside `NEXT_ACTIONS`.

- [ ] **Step 4: Expose safe catalog lookup**

```js
export function packageById(id) {
  return PACKAGES.find(item => item.id === id) || null
}
```

Do not copy prices or URLs into `closing.js`.

- [ ] **Step 5: Run focused and catalog tests**

Run: `npx vitest run tests/salesClosing.test.js tests/salesAgent.test.js tests/salesPricing.test.js`

Expected: PASS; all recommended package IDs resolve through `packageById`.

- [ ] **Step 6: Commit the task**

Use the repository temp-index/`commit-tree` procedure.

Commit message: `feat(sales): choose one next action per chat turn`

---

### Task 2: Structured Agent Output and No-Call Guard

**Files:**
- Modify: `src/lib/salesAgent/agent.js`
- Modify: `src/lib/salesAgent/prompt.js`
- Modify: `src/lib/salesAgent/journey.js`
- Modify: `src/lib/salesAgent/selling.js`
- Modify: `src/lib/salesAgent/experiments.js`
- Modify: `tests/salesAgent.test.js`
- Modify: `tests/salesJourney.test.js`
- Modify: `tests/salesSelling.test.js`
- Modify: `tests/salesExperiments.test.js`

**Interfaces:**
- Consumes: Task 1's `chooseNextBestAction` and `packageById`.
- Produces: sanitized reply fields `objectionCode`, `recommendedPackageId`, `nextBestAction`, `paymentLinkRequested`, and `handoff`; `findPromptVariant(id)` returns only an active variant.

- [ ] **Step 1: Add failing structured-output tests**

```js
it('keeps only approved closing fields', () => {
  expect(parseAgentJson(JSON.stringify({
    messages: ['המודפס הכי מתאים למה שתיארת'], stage: 'offer_sent',
    objectionCode: 'price', recommendedPackageId: 'printed',
    nextBestAction: 'resolve_objection', paymentLinkRequested: false,
  }))).toMatchObject({
    objectionCode: 'price', recommendedPackageId: 'printed', nextBestAction: 'resolve_objection',
  })
})

it('removes every phone-call proposal from outgoing text', () => {
  const parsed = sanitizeReply({ messages: ['אפשר לדבר בטלפון? מתי נוח לך שאחייג?'], stage: 'engaged' })
  expect(parsed.messages.join(' ')).not.toMatch(/טלפון|אחייג|שיחה טלפונית/)
  expect(parsed.handoff).toBe(true)
})

it('does not inject the retired call_offer directive', () => {
  expect(findPromptVariant('call_offer')).toBeNull()
})
```

- [ ] **Step 2: Run tests and capture the old-output failures**

Run: `npx vitest run tests/salesAgent.test.js tests/salesExperiments.test.js tests/salesJourney.test.js tests/salesSelling.test.js`

Expected: FAIL because the new fields and `findPromptVariant` do not exist.

- [ ] **Step 3: Add strict enum sanitization**

Normalize invalid objection codes to `unknown`, invalid package IDs to `null`, and invalid next actions to the deterministic value passed by the route. Add a hard guard matching `טלפון|אחייג|נתקשר|שיחה קצרה`; replace the output with `אמשיך לעזור לך כאן בוואטסאפ.` and set `handoff=true` only if the customer explicitly requested a person.

- [ ] **Step 4: Separate historical and prompt variants**

```js
export function findVariant(id) {
  return OPENING_VARIANTS.find(v => v.id === id) || null
}

export function findPromptVariant(id) {
  if (!ACTIVE_VARIANT_IDS.includes(id)) return null
  return findVariant(id)
}
```

Change `prompt.js` to call `findPromptVariant`. Historical `call_offer` data remains in `summarizeExperiments`, but its directive can never reach the model.

- [ ] **Step 5: Encode the closing protocol in prompt and journey**

The prompt must contain the exact priorities: answer first; proof; progressively learn event type/date/name; recommend one package; ask one binary choice; send one checkout link; follow up on the recorded blocker. Remove phrases that suggest calls. Add one stage goal per current stage and include the deterministic `nextBestAction` as a binding instruction, not advice.

- [ ] **Step 6: Run prompt and regression suites**

Run: `npx vitest run tests/salesAgent.test.js tests/salesExperiments.test.js tests/salesJourney.test.js tests/salesSelling.test.js tests/salesConversation.test.js`

Expected: PASS and repository-wide search `rg -n 'מתי נוח.*לדבר|אחייג|שיחה טלפונית' src/lib/salesAgent` returns no executable prompt text.

- [ ] **Step 7: Commit the task**

Use the repository temp-index/`commit-tree` procedure.

Commit message: `feat(sales): close every deal inside WhatsApp`

---

### Task 3: Persist Closing Context and Emit Funnel Events

**Files:**
- Modify: `src/lib/salesAgent/leads.js`
- Modify: `src/app/api/sales-agent/reply/route.js`
- Create: `src/lib/salesAgent/businessOsEvents.js`
- Create: `tests/salesBusinessOsEvents.test.js`
- Modify: `tests/salesAgent.test.js`

**Interfaces:**
- Consumes: the structured reply from Task 2 and environment variables `BUSINESSOS_URL`, `BUSINESSOS_EVENTS_SECRET`.
- Produces: lead fields `objectionCode`, `recommendedPackageId`, `nextBestAction`, `paymentLinkSentAt`, `paymentLinkTokenId`; `emitBusinessOsEvent(event, { fetchImpl, timeoutMs })` returning `{ delivered, status }` without throwing.

- [ ] **Step 1: Write failing best-effort event-client tests**

```js
import { describe, expect, it, vi } from 'vitest'
import { emitBusinessOsEvent } from '../src/lib/salesAgent/businessOsEvents'

it('sends metadata without transcript text', async () => {
  const fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 202 })
  const result = await emitBusinessOsEvent({
    eventId: 'evt-1', kind: 'offer_sent', occurredAt: '2026-08-14T10:00:00Z',
    leadId: 'lead-hash', stage: 'offer_sent', packageId: 'printed', amountAgorot: 95000,
  }, { fetchImpl, baseUrl: 'https://businessos.test', secret: 'secret', timeoutMs: 50 })
  expect(result).toEqual({ delivered: true, status: 202 })
  expect(fetchImpl.mock.calls[0][1].body).not.toContain('message')
})

it('does not throw when BusinessOS is down', async () => {
  const result = await emitBusinessOsEvent({ eventId: 'evt-2', kind: 'lead_created', occurredAt: new Date().toISOString(), leadId: 'hash' }, {
    fetchImpl: () => Promise.reject(new Error('down')), baseUrl: 'https://businessos.test', secret: 'secret', timeoutMs: 10,
  })
  expect(result).toEqual({ delivered: false, status: null })
})
```

- [ ] **Step 2: Run the focused test to verify the module is missing**

Run: `npx vitest run tests/salesBusinessOsEvents.test.js`

Expected: FAIL with missing `businessOsEvents.js`.

- [ ] **Step 3: Implement the timeout-safe client**

Use `AbortSignal.timeout(timeoutMs)` and `x-businessos-events-secret`. Whitelist only `eventId`, `kind`, `occurredAt`, `leadId`, `stage`, `campaignId`, `campaignName`, `adsetId`, `adId`, `adName`, `referral`, `packageId`, `amountAgorot`, `currency`, `orderId`, and `reasonCode`. Never pass `text`, `turns`, names, email, or raw phone.

- [ ] **Step 4: Persist closing state**

Extend `saveExchange` to write a whitelisted `objectionCode`, `recommendedPackageId`, and `nextBestAction`. When the response actually contains the tracked link, set `paymentLinkSentAt`, `paymentLinkTokenId`, and stage `ready_to_pay`. Add event emission after Firestore persistence with deterministic IDs `${inboundEventId}:${kind}`; call it through `Promise.allSettled` so the customer response is not blocked.

- [ ] **Step 5: Run focused and route tests**

Run: `npx vitest run tests/salesBusinessOsEvents.test.js tests/salesAgent.test.js tests/salesClosing.test.js`

Expected: PASS; a failed BusinessOS fetch still returns the WhatsApp reply.

- [ ] **Step 6: Commit the task**

Use the repository temp-index/`commit-tree` procedure.

Commit message: `feat(sales): record the reason and next closing action`

---

### Task 4: Opaque Tracked Payment Redirect

**Files:**
- Create: `src/lib/salesAgent/paymentLinks.js`
- Create: `src/app/go/pay/[token]/route.js`
- Create: `tests/salesPaymentLinks.test.js`
- Modify: `src/lib/salesAgent/leads.js`
- Modify: `src/app/api/sales-agent/reply/route.js`

**Interfaces:**
- Consumes: package ID and an opaque random token stored in `sales_payment_tokens/{tokenHash}`.
- Produces: `createPaymentToken({ leadId, packageId, expiresAtMs })`, `resolvePaymentToken(token)`, HTTP 307 redirect, and idempotent `payment_link_clicked`.

- [ ] **Step 1: Write failing token safety tests**

```js
import { describe, expect, it } from 'vitest'
import { paymentRedirectDecision } from '../src/lib/salesAgent/paymentLinks'

it('redirects a valid unused token to the catalog package', () => {
  expect(paymentRedirectDecision({ packageId: 'printed', expiresAtMs: 2_000 }, 1_000))
    .toMatchObject({ ok: true, packageId: 'printed', checkout: 'https://weddingtales.co.il/checkout/?add-to-cart=6271' })
})

it('rejects expired and unknown packages', () => {
  expect(paymentRedirectDecision({ packageId: 'printed', expiresAtMs: 999 }, 1_000)).toEqual({ ok: false, reason: 'expired' })
  expect(paymentRedirectDecision({ packageId: 'forged', expiresAtMs: 2_000 }, 1_000)).toEqual({ ok: false, reason: 'unknown_package' })
})
```

- [ ] **Step 2: Run the test and verify the missing module failure**

Run: `npx vitest run tests/salesPaymentLinks.test.js`

Expected: FAIL with missing `paymentLinks.js`.

- [ ] **Step 3: Implement token generation and redirect decisions**

Generate 32 random bytes, return only base64url token, and store only SHA-256 token hash plus hashed lead ID, package ID, 30-day expiry, created/clicked timestamps, and campaign/referral metadata. `paymentRedirectDecision` resolves checkout exclusively through `packageById`.

- [ ] **Step 4: Implement the route**

For invalid/expired tokens redirect to `https://weddingtales.co.il/` with HTTP 307 and log only reason code. For valid tokens transactionally set `firstClickedAt` once, increment `clickCount`, emit `payment_link_clicked` with ID `${tokenHash}:first_click`, and redirect to the catalog checkout URL. Repeated clicks redirect normally but do not create duplicate first-click events.

- [ ] **Step 5: Integrate one link into the reply**

When `nextBestAction === 'send_payment_link'`, create or reuse the lead's unexpired token for the recommended package and give the model the tracked URL `${NEXT_PUBLIC_BASE_URL}/go/pay/${token}`. Refuse to include a raw catalog checkout URL in agent output.

- [ ] **Step 6: Run payment-link and sales suites**

Run: `npx vitest run tests/salesPaymentLinks.test.js tests/salesClosing.test.js tests/salesAgent.test.js`

Expected: PASS; test output and generated URL contain no phone or name.

- [ ] **Step 7: Commit the task**

Use the repository temp-index/`commit-tree` procedure.

Commit message: `feat(sales): track checkout intent without exposing leads`

---

### Task 5: WooCommerce Package Attribution and Paid Truth

**Files:**
- Create: `src/lib/salesAgent/orderAttribution.js`
- Create: `tests/salesOrderAttribution.test.js`
- Modify: `src/lib/salesAgent/leads.js`
- Modify: `src/app/api/createWedding/route.js`

**Interfaces:**
- Consumes: Woo order `{ id, status, total, currency, billing, line_items }`.
- Produces: `classifyWooOrder(order)` returning `{ state: 'ignore' | 'checkout' | 'paid', orderId, packageId, amountAgorot, currency, phone, email }`; idempotent `closeLeadOnPurchase` result `{ matched, duplicate, leadId }`.

- [ ] **Step 1: Write failing order classification tests**

```js
import { describe, expect, it } from 'vitest'
import { classifyWooOrder } from '../src/lib/salesAgent/orderAttribution'

const order = status => ({
  id: 42, status, total: '950.00', currency: 'ILS', billing: { phone: '050-123-4567', email: 'A@B.CO.IL' },
  line_items: [{ product_id: 6271, name: 'ספר מודפס', quantity: 1 }],
})

it('treats pending as checkout and not revenue', () => {
  expect(classifyWooOrder(order('pending'))).toMatchObject({ state: 'checkout', amountAgorot: 95000, packageId: 'printed' })
})

it('treats processing as verified payment', () => {
  expect(classifyWooOrder(order('processing'))).toMatchObject({ state: 'paid', packageId: 'printed', currency: 'ILS' })
})

it('ignores failed and cancelled orders', () => {
  expect(classifyWooOrder(order('failed')).state).toBe('ignore')
  expect(classifyWooOrder(order('cancelled')).state).toBe('ignore')
})
```

- [ ] **Step 2: Run the test and verify missing order classifier**

Run: `npx vitest run tests/salesOrderAttribution.test.js`

Expected: FAIL with missing `orderAttribution.js`.

- [ ] **Step 3: Implement product mapping and paid-state rules**

Use this explicit map, derived from the current catalog checkout product IDs:

```js
export const PRODUCT_PACKAGE = new Map([
  [6258, 'digital'],
  [6271, 'printed'],
  [5480, 'premium'],
])

export const PAID_STATUSES = new Set(['processing', 'completed'])
export const CHECKOUT_STATUSES = new Set(['pending', 'on-hold'])
```

Reject non-ILS currency from amount reporting with `amountAgorot: null` but still store the original currency. Multiple recognized package products produce `packageId: null` and a manual-review reason `multiple_packages`.

- [ ] **Step 4: Make payment closure transactional and idempotent**

Use `sales_payment_events/{orderId}` as the idempotency record. Match normalized phone first; use exact normalized email only when the lead has a stored email; do not infer by time, name, or campaign. If no unique match exists, store `status: unmatched` and emit `payment_unmatched`; do not attach the payment to a campaign.

On a unique paid match write `stage=closed_won`, `closedAt`, `orderId`, `amount`, `currency`, `packageInterest`, `followUpAt=null`, `nextBestAction=stop`, and append `closed_won` to `stagesReached` in the same transaction.

- [ ] **Step 5: Integrate `createWedding` without breaking fulfillment**

Keep signature verification and wedding creation behavior. For `checkout`, record and emit `checkout_started` then return the existing skipped response. For `paid`, close the lead and emit `payment_verified` after the wedding record is created. Wrap BusinessOS delivery in best-effort handling; do not swallow Firestore matching failures from the payment event record.

- [ ] **Step 6: Run payment and existing app tests**

Run: `npx vitest run tests/salesOrderAttribution.test.js tests/salesAttribution.test.js tests/salesAgent.test.js`

Run: `npm run build`

Expected: PASS; pending orders never increase closed-won count or revenue.

- [ ] **Step 7: Commit the task**

Use the repository temp-index/`commit-tree` procedure.

Commit message: `feat(sales): close leads only on verified Woo payments`

---

### Task 6: BusinessOS Sales Event Contract

**Files:**
- Modify in BusinessOS: `src/lib/automations/conversation-event-handler.ts`
- Modify in BusinessOS: `src/lib/automations/conversation-event-store.ts`
- Modify in BusinessOS: `src/lib/marketing/conversation-attribution.ts`
- Modify in BusinessOS: `src/db/schema.ts`
- Modify in BusinessOS: `src/scripts/apply-marketing-schema.ts`
- Modify in BusinessOS: `tests/integration/conversation-events-route.test.ts`
- Modify in BusinessOS: `tests/unit/conversation-attribution.test.ts`

**Interfaces:**
- Consumes: signed Wedding Tales event with `leadId` instead of raw phone when operational phone is unnecessary.
- Produces: accepted kinds `lead_created`, `lead_replied`, `demo_sent`, `offer_sent`, `ready_to_pay`, `handoff_requested`, `handoff_resolved`, `payment_link_sent`, `payment_link_clicked`, `checkout_started`, `payment_verified`, `payment_unmatched`, `followup_sent`, `followup_failed`, and `delivery_failed`; attribution column `lead_external_key` stores the opaque lead hash.

- [ ] **Step 1: Add failing route contract tests**

```ts
it('accepts verified payment metadata exactly once', async () => {
  const record = vi.fn().mockResolvedValue(undefined);
  const handler = createConversationEventHandler({ secret: () => 's', record });
  const body = {
    eventId: 'woo:42:paid', kind: 'payment_verified', occurredAt: '2026-08-14T10:00:00Z',
    leadId: 'hash-1', stage: 'closed_won', packageId: 'printed', amountAgorot: 95000,
    currency: 'ILS', orderId: '42', campaignId: '120', adId: '122',
  };
  const response = await handler(new Request('https://test/events', {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-businessos-events-secret': 's' }, body: JSON.stringify(body),
  }));
  expect(response.status).toBe(202);
  expect(record).toHaveBeenCalledWith(body);
});
```

- [ ] **Step 2: Run the BusinessOS focused tests**

Run from the BusinessOS worktree: `npm test -- tests/integration/conversation-events-route.test.ts tests/unit/conversation-attribution.test.ts`

Expected: FAIL because `payment_verified` and payment fields are outside the current type/validator.

- [ ] **Step 3: Expand the strict type and validation**

Add optional `leadId`, `packageId`, `amountAgorot`, `currency`, `orderId`, and `reasonCode`. Require `amountAgorot >= 0`, three uppercase currency letters, and `orderId` for `payment_verified`. Require either `leadId` or `phone`, but never expose phone in analytics when `leadId` exists.

- [ ] **Step 4: Store order and amount in attribution rows**

Add nullable `leadExternalKey: varchar('lead_external_key', { length: 128 })` and an index on `(leadExternalKey, occurredAt)` to `marketingAttributionEvents`, plus matching `add column if not exists` and index statements in `apply-marketing-schema.ts`. Store direct Wedding Tales events with `sourceSystem: 'wedding_tales'`, set `leadExternalKey`, `orderExternalKey`, `amountAgorot`, and include them plus `packageId` in the checksum. Store package/reason in `safeDetails`. Keep `onConflictDoNothing` for customer events and `onConflictDoUpdate` for attribution; repeated `eventId` must not create a second row.

- [ ] **Step 5: Run BusinessOS verification**

Run: `npm test -- tests/integration/conversation-events-route.test.ts tests/unit/conversation-attribution.test.ts`

Run: `npm run build`

Expected: PASS and build exits 0.

- [ ] **Step 6: Commit the BusinessOS task**

Commit in the BusinessOS worktree after checking its own repository instructions.

Commit message: `feat(marketing): accept the complete chat sales funnel`

---

### Task 7: End-to-End Chat Sale Verification

**Files:**
- Modify only if verification exposes a defect in files owned by Tasks 1–6.

**Interfaces:**
- Consumes: deployed Wedding Tales, Woo webhook, BusinessOS event endpoint, and the Make reliability work from the companion plan.
- Produces: a recorded synthetic funnel with no phone call and exactly one verified payment event.

- [ ] **Step 1: Run all Wedding Tales sales tests**

Run: `npx vitest run tests/sales*.test.js`

Expected: all sales tests PASS.

- [ ] **Step 2: Run static verification**

Run: `npm run lint`

Run: `npm run build`

Expected: both exit 0.

- [ ] **Step 3: Run a synthetic non-paid path**

Use a reserved synthetic number and unique event IDs. Send: price question → package choice → payment link. Open the tracked link once and post a signed pending Woo fixture. Verify lead stage remains `ready_to_pay`, BusinessOS has `payment_link_sent`, `payment_link_clicked`, and `checkout_started`, and revenue remains unchanged.

- [ ] **Step 4: Run a synthetic paid path**

Post the same order as `processing` twice with a valid signature. Verify one `sales_payment_events` record, one lead transition to `closed_won`, one `payment_verified` row, one amount of ₪950, and no future follow-up.

- [ ] **Step 5: Verify the no-call acceptance rule**

Search all new responses and prompts for `טלפון`, `אחייג`, `נתקשר`, and `שיחה קצרה`. References in the historical experiment description and tests are allowed; executable prompt/output text is not. Send an explicit request for a person and verify the reply keeps the customer in the same WhatsApp thread.

- [ ] **Step 6: Record the release commit**

Use the repository temp-index/`commit-tree` procedure for any verification fixes.

Commit message: `test(sales): verify a complete chat-only purchase loop`

---

## Plan Acceptance Checklist

- [ ] The bot never proposes a phone call or creates a dialing task.
- [ ] Every reply contains one deterministic `nextBestAction`.
- [ ] A lead sees one package recommendation and one tracked payment link.
- [ ] Follow-up text is selected from the actual blocker/stage.
- [ ] Pending and on-hold orders do not count as income.
- [ ] Processing/completed orders close a matched lead exactly once.
- [ ] Unmatched payments appear as `payment_unmatched` without campaign attribution.
- [ ] BusinessOS failure never blocks a WhatsApp response or Woo fulfillment.
- [ ] The synthetic duplicate paid webhook creates one verified revenue event.
