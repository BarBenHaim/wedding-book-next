# Sales Agent Reliability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every WhatsApp inbound event finish exactly once with a delivered reply or a recorded human handoff, while keeping follow-ups, media, experiments, and provider failures truthful.

**Architecture:** Wedding Tales remains the only sales brain and Firestore owns idempotency and runtime state; Make remains a transport adapter that receives a decision, sends it, and acknowledges the result. Pure decision code is isolated from Firebase so Vitest can verify duplicate events, media handling, delivery transitions, experiment assignment, and the Anthropic circuit breaker deterministically.

**Tech Stack:** Next.js 15 route handlers, JavaScript, Firebase Admin/Firestore transactions, WhatsApp Cloud Graph API, Make scenario `9630287`, Vitest 2.

**Spec:** `docs/superpowers/specs/2026-08-14-revenue-sales-engine-design.md`

## Global Constraints

- Make is a dumb pipe; do not duplicate prompt, stage, price, follow-up, or handoff logic in Make.
- `catalog.js` remains the only source for prices, links, and factual media descriptions.
- A valid inbound must produce a reply or a recorded handoff within 30 seconds.
- Never mark an outbound message sent before WhatsApp/Make confirms success.
- Duplicated webhook event IDs must not call Anthropic or send WhatsApp twice.
- New leads use only `question_first`, `price_upfront`, and `demo_first`; historical variants remain reportable.
- Keep the 30-lead minimum per experiment arm.
- Follow-ups stay on the 1/3/7-day ladder, Israel quiet hours, no Shabbat, and a maximum of three attempts.
- Outside WhatsApp's 24-hour service window, send only the approved `wt_followup` template.
- BusinessOS receives funnel metadata, never full conversation transcripts.
- All human takeover remains in the existing WhatsApp thread; no phone calls or dialing tasks are introduced.
- Do not expose tokens, secrets, phone numbers, or raw webhook bodies in logs or fixtures.
- Before code changes, read `AGENTS.md` and the relevant recent commits; use the repository's temporary-index commit procedure, never a plain `git commit`.

---

## File Structure

**Create in Wedding Tales**

- `src/lib/salesAgent/inboundEventsCore.js` — pure state transitions for inbound event claims and cached outcomes.
- `src/lib/salesAgent/circuitBreaker.js` — pure three-strike/open/half-open decision logic.
- `src/lib/salesAgent/delivery.js` — pure outbound delivery-state validation and transition rules.
- `src/app/api/sales-agent/delivery/route.js` — authenticated Make delivery acknowledgement endpoint.
- `tests/salesInboundEvents.test.js` — idempotency state-machine tests.
- `tests/salesCircuitBreaker.test.js` — provider failure and recovery tests.
- `tests/salesDelivery.test.js` — delivery acknowledgement tests.

**Modify in Wedding Tales**

- `src/lib/salesAgent/inbound.js` — accept the full text/media/referral event contract.
- `src/lib/salesAgent/leads.js` — Firestore transactions for claims, results, delivery, runtime health, and follow-up outcomes.
- `src/lib/salesAgent/experiments.js` — separate active assignment arms from historical reporting arms.
- `src/lib/salesAgent/whatsapp.js` — return provider message IDs and explicit delivery errors.
- `src/app/api/sales-agent/reply/route.js` — claim before model work, media handoff, circuit breaker, and cached duplicate result.
- `src/app/api/sales-agent/followups/route.js` — mark sent only after channel success; support `wt_followup` template.
- `src/app/api/sales-agent/leads/route.js` — expose sanitized runtime-health counters.
- `tests/salesInbound.test.js`, `tests/salesExperiments.test.js`, `tests/salesFollowupPolicy.test.js` — integration contracts.

**Modify outside the repo after deployment**

- Make scenario `9630287` — map `eventId`, media type/ID, referral fields, add video send branch, and call delivery acknowledgement after each send.

---

### Task 1: Idempotent Inbound Event Claims

**Files:**
- Create: `src/lib/salesAgent/inboundEventsCore.js`
- Modify: `src/lib/salesAgent/leads.js`
- Test: `tests/salesInboundEvents.test.js`

**Interfaces:**
- Consumes: Firestore transaction methods and a stable Meta `eventId`.
- Produces: `inboundEventRef(eventId)`, `claimInboundEvent({ eventId, phone, occurredAt })`, `completeInboundEvent({ eventId, outcome })`, and pure `decideInboundClaim(snapshot, nowMs)` returning `{ action: 'process' | 'cached' | 'busy', outcome?: object }`.

- [ ] **Step 1: Write the failing pure state-machine tests**

```js
import { describe, expect, it } from 'vitest'
import { decideInboundClaim } from '../src/lib/salesAgent/inboundEventsCore'

describe('decideInboundClaim', () => {
  it('processes a new event', () => {
    expect(decideInboundClaim(null, 1_000)).toEqual({ action: 'process' })
  })

  it('returns the stored outcome for a completed duplicate', () => {
    const outcome = { ok: true, sendText: 'שלום', handoff: false }
    expect(decideInboundClaim({ status: 'completed', outcome }, 2_000))
      .toEqual({ action: 'cached', outcome })
  })

  it('does not process an in-flight duplicate before the 30 second lease expires', () => {
    expect(decideInboundClaim({ status: 'processing', leaseUntilMs: 31_000 }, 2_000))
      .toEqual({ action: 'busy' })
  })

  it('reclaims an abandoned processing event after the lease', () => {
    expect(decideInboundClaim({ status: 'processing', leaseUntilMs: 1_000 }, 2_000))
      .toEqual({ action: 'process' })
  })
})
```

- [ ] **Step 2: Run the focused test and verify the missing module failure**

Run: `npx vitest run tests/salesInboundEvents.test.js`

Expected: FAIL with `Failed to resolve import ../src/lib/salesAgent/inboundEventsCore`.

- [ ] **Step 3: Implement the pure claim decision**

```js
export const INBOUND_LEASE_MS = 30_000

export function decideInboundClaim(snapshot, nowMs = Date.now()) {
  if (!snapshot) return { action: 'process' }
  if (snapshot.status === 'completed' && snapshot.outcome) {
    return { action: 'cached', outcome: snapshot.outcome }
  }
  if (snapshot.status === 'processing' && Number(snapshot.leaseUntilMs) > nowMs) {
    return { action: 'busy' }
  }
  return { action: 'process' }
}
```

- [ ] **Step 4: Add Firestore claim/complete transactions**

Use collection `sales_inbound_events`. Store `eventId`, `phoneHash` (SHA-256; never raw phone), `status`, `leaseUntilMs`, `attempts`, `createdAt`, `updatedAt`, and a sanitized `outcome` containing only `sendText`, media URLs/captions, `handoff`, `stage`, `followUpAt`, and `notifyOwner`.

```js
export async function claimInboundEvent({ eventId, phone, occurredAt }) {
  const ref = inboundEventRef(eventId)
  return db.runTransaction(async tx => {
    const snap = await tx.get(ref)
    const stored = snap.exists ? snap.data() : null
    const decision = decideInboundClaim(stored, Date.now())
    if (decision.action !== 'process') return decision
    tx.set(ref, {
      eventId,
      phoneHash: crypto.createHash('sha256').update(String(phone)).digest('hex'),
      occurredAt: occurredAt || new Date().toISOString(),
      status: 'processing',
      leaseUntilMs: Date.now() + INBOUND_LEASE_MS,
      attempts: FieldValue.increment(1),
      createdAt: stored?.createdAt || FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true })
    return { action: 'process' }
  })
}
```

`completeInboundEvent` must reject outcomes where both `sendText` is empty and `handoff !== true`.

- [ ] **Step 5: Run the test and the existing sales suite**

Run: `npx vitest run tests/salesInboundEvents.test.js tests/salesInbound.test.js tests/salesAgent.test.js`

Expected: PASS with no Firebase network access from the pure test.

- [ ] **Step 6: Commit the task**

Stage `src/lib/salesAgent/inboundEventsCore.js`, `src/lib/salesAgent/leads.js`, and `tests/salesInboundEvents.test.js` using a temporary `GIT_INDEX_FILE`; create the commit with `git commit-tree`, then update `.git/refs/heads/main` through `apply_patch`.

Commit message: `feat(sales): make inbound events idempotent`

---

### Task 2: Full Text, Media, and Referral Input Contract

**Files:**
- Modify: `src/lib/salesAgent/inbound.js`
- Modify: `src/app/api/sales-agent/reply/route.js`
- Modify: `tests/salesInbound.test.js`

**Interfaces:**
- Consumes: raw Make body and Task 1's `claimInboundEvent`/`completeInboundEvent`.
- Produces: normalized `{ eventId, phone, text, profileName, messageType, mediaId, occurredAt, conversationId, referral }`; non-text media produces a documented human handoff without calling Anthropic.

- [ ] **Step 1: Add failing parsing and media tests**

```js
it('keeps a complete WhatsApp referral and media identity', () => {
  const raw = JSON.stringify({
    eventId: 'wamid.abc', phone: '972501234567', text: '', profileName: 'נועה',
    messageType: 'image', mediaId: '9988', occurredAt: '2026-08-14T09:00:00.000Z',
    conversationId: 'conv-1',
    referral: { sourceUrl: 'https://fb.me/ad', sourceId: '238', campaignId: '120', adsetId: '121', adId: '122' },
  })
  expect(parseInboundBody(raw).body).toMatchObject({
    eventId: 'wamid.abc', messageType: 'image', mediaId: '9988',
    referral: { campaignId: '120', adId: '122' },
  })
})

it('repairs Make raw JSON with the expanded ordered keys', () => {
  const raw = '{"eventId":"wamid.1","phone":"9725","text":"שורה 1\nשורה 2","profileName":"בר","messageType":"text","mediaId":"","occurredAt":"2026-08-14T09:00:00Z","conversationId":"c1"}'
  expect(parseInboundBody(raw).body).toMatchObject({ eventId: 'wamid.1', text: 'שורה 1\nשורה 2', messageType: 'text' })
})
```

- [ ] **Step 2: Run the focused test to show the old key contract fails**

Run: `npx vitest run tests/salesInbound.test.js`

Expected: FAIL because `BODY_KEYS` does not include the new scalar fields.

- [ ] **Step 3: Expand and normalize the input contract**

Set the ordered repair keys to:

```js
export const BODY_KEYS = [
  'eventId', 'phone', 'text', 'profileName', 'source', 'from', 'to',
  'businessPhone', 'field', 'messageType', 'mediaId', 'occurredAt',
  'conversationId', 'campaignId', 'campaignName', 'adsetId', 'adId',
  'adName', 'ctwaClid', 'sourceUrl', 'headline',
]
```

After parsing, construct `referral` from the flat fallback fields only when no valid nested referral object exists. Accept only `text`, `image`, `video`, `audio`, and `document`; unknown types become `document` for safe handoff.

- [ ] **Step 4: Gate duplicates and media before the model call**

At the start of `POST`, require a non-empty `eventId`; call `claimInboundEvent`. Return cached completed outcomes with HTTP 200, and return `{ ok: true, duplicate: true, processing: true }` with HTTP 202 for an in-flight duplicate.

For `messageType !== 'text'`, complete the event with this outcome and do not call `runAgent`:

```js
const outcome = {
  ok: true,
  send: [],
  sendText: '',
  hasImage: false,
  hasVideo: false,
  stage: 'handoff',
  handoff: true,
  handoffReason: messageType === 'image'
    ? 'הלקוח שלח תמונה — נדרשת בדיקה אנושית והכנת דוגמה אם הוצעה'
    : `הלקוח שלח ${messageType} — נדרשת בדיקה אנושית`,
  notifyOwner: ownerPing(phone, reason, { name: profileName }),
}
```

- [ ] **Step 5: Run focused and regression tests**

Run: `npx vitest run tests/salesInbound.test.js tests/salesAgent.test.js tests/salesConversation.test.js`

Expected: PASS; media inputs contain a handoff and never a fabricated media interpretation.

- [ ] **Step 6: Commit the task**

Use the repository temp-index/`commit-tree` procedure.

Commit message: `feat(sales): accept media and referral events`

---

### Task 3: Anthropic Circuit Breaker and Safe Fallback

**Files:**
- Create: `src/lib/salesAgent/circuitBreaker.js`
- Modify: `src/lib/salesAgent/leads.js`
- Modify: `src/app/api/sales-agent/reply/route.js`
- Test: `tests/salesCircuitBreaker.test.js`

**Interfaces:**
- Consumes: success/failure timestamps from the reply route.
- Produces: `breakerDecision(state, nowMs)`, `recordProviderFailure(errorCode)`, and `recordProviderSuccess()` using Firestore document `sales_runtime/anthropic`.

- [ ] **Step 1: Write failing breaker tests**

```js
import { describe, expect, it } from 'vitest'
import { breakerDecision, nextFailureState, successState } from '../src/lib/salesAgent/circuitBreaker'

describe('Anthropic circuit breaker', () => {
  it('opens after three consecutive failures for five minutes', () => {
    const one = nextFailureState({}, 1_000, '429')
    const two = nextFailureState(one, 2_000, '429')
    const three = nextFailureState(two, 3_000, '429')
    expect(three).toMatchObject({ consecutiveFailures: 3, openUntilMs: 303_000 })
    expect(breakerDecision(three, 4_000)).toEqual({ allow: false, mode: 'open' })
  })

  it('allows one half-open probe after cooldown', () => {
    expect(breakerDecision({ consecutiveFailures: 3, openUntilMs: 3_000 }, 3_001))
      .toEqual({ allow: true, mode: 'half-open' })
  })

  it('resets completely on success', () => {
    expect(successState(9_000)).toEqual({ consecutiveFailures: 0, openUntilMs: null, lastSuccessAtMs: 9_000 })
  })
})
```

- [ ] **Step 2: Run the test and verify missing exports**

Run: `npx vitest run tests/salesCircuitBreaker.test.js`

Expected: FAIL with missing `circuitBreaker.js`.

- [ ] **Step 3: Implement deterministic breaker transitions**

```js
export const BREAKER_THRESHOLD = 3
export const BREAKER_COOLDOWN_MS = 5 * 60_000

export function breakerDecision(state = {}, nowMs = Date.now()) {
  if (Number(state.openUntilMs) > nowMs) return { allow: false, mode: 'open' }
  if ((Number(state.consecutiveFailures) || 0) >= BREAKER_THRESHOLD) return { allow: true, mode: 'half-open' }
  return { allow: true, mode: 'closed' }
}

export function nextFailureState(state = {}, nowMs = Date.now(), errorCode = 'provider_error') {
  const consecutiveFailures = (Number(state.consecutiveFailures) || 0) + 1
  return {
    consecutiveFailures,
    openUntilMs: consecutiveFailures >= BREAKER_THRESHOLD ? nowMs + BREAKER_COOLDOWN_MS : null,
    lastFailureAtMs: nowMs,
    lastErrorCode: String(errorCode).slice(0, 80),
  }
}

export const successState = nowMs => ({ consecutiveFailures: 0, openUntilMs: null, lastSuccessAtMs: nowMs })
```

- [ ] **Step 4: Integrate Firestore state and reply fallback**

Before `runAgent`, read the breaker. When open, complete the inbound event with `handoff: true` and the customer text `קיבלתי את ההודעה שלך. מישהו מהצוות יחזור אליך בהקדם.`. On provider timeout, 429, low-credit response, or invalid JSON, atomically increment failure state, return the same safe customer text, and notify the owner with reason `תקלה בשירות ה-AI`. On success, reset state.

Do not store provider response bodies; store only the normalized codes `timeout`, `rate_limit`, `low_credit`, `invalid_json`, or `provider_error`.

- [ ] **Step 5: Run breaker and route regression tests**

Run: `npx vitest run tests/salesCircuitBreaker.test.js tests/salesAgent.test.js tests/salesInboundEvents.test.js`

Expected: PASS; a simulated fourth failure performs zero model calls.

- [ ] **Step 6: Commit the task**

Use the repository temp-index/`commit-tree` procedure.

Commit message: `feat(sales): fail safely when the model is unavailable`

---

### Task 4: Three Active Experiment Arms with Historical Reporting

**Files:**
- Modify: `src/lib/salesAgent/experiments.js`
- Modify: `tests/salesExperiments.test.js`

**Interfaces:**
- Consumes: all seven historical `OPENING_VARIANTS` for reporting.
- Produces: `ACTIVE_VARIANT_IDS = ['question_first', 'price_upfront', 'demo_first']`; `assignVariant(phone)` hashes only across active IDs while `summarizeExperiments` continues to return historical rows.

- [ ] **Step 1: Add failing active-arm tests**

```js
it('assigns new leads only to the three approved arms', () => {
  const assigned = new Set(Array.from({ length: 500 }, (_, i) => assignVariant(`97250${i}`)))
  expect([...assigned].sort()).toEqual(['demo_first', 'price_upfront', 'question_first'])
})

it('still reports retired historical arms', () => {
  const result = summarizeExperiments([{ phone: '1', variant: 'photo_sample', userTurns: 2 }])
  expect(result.rows.find(row => row.id === 'photo_sample')).toMatchObject({ leads: 1, replied: 1 })
})
```

- [ ] **Step 2: Run the test to show the seven-arm assignment failure**

Run: `npx vitest run tests/salesExperiments.test.js`

Expected: FAIL because assignment includes retired arms.

- [ ] **Step 3: Separate active assignment IDs**

```js
export const ACTIVE_VARIANT_IDS = ['question_first', 'price_upfront', 'demo_first']
export const VARIANT_IDS = OPENING_VARIANTS.map(v => v.id)

export function assignVariant(phone) {
  const s = String(phone || '')
  if (!s) return ACTIVE_VARIANT_IDS[0]
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619) >>> 0
  }
  return ACTIVE_VARIANT_IDS[h % ACTIVE_VARIANT_IDS.length]
}
```

- [ ] **Step 4: Run the complete experiment suite**

Run: `npx vitest run tests/salesExperiments.test.js tests/salesDigest.test.js`

Expected: PASS; `MIN_SAMPLE` remains exactly `30`.

- [ ] **Step 5: Commit the task**

Use the repository temp-index/`commit-tree` procedure.

Commit message: `feat(sales): focus new leads on three experiments`

---

### Task 5: Delivery Acknowledgements and Truthful Follow-ups

**Files:**
- Create: `src/lib/salesAgent/delivery.js`
- Create: `src/app/api/sales-agent/delivery/route.js`
- Modify: `src/lib/salesAgent/leads.js`
- Modify: `src/lib/salesAgent/whatsapp.js`
- Modify: `src/app/api/sales-agent/followups/route.js`
- Modify: `src/app/api/sales-agent/digest/route.js`
- Test: `tests/salesDelivery.test.js`
- Modify: `tests/salesFollowupPolicy.test.js`
- Modify: `tests/salesDigest.test.js`

**Interfaces:**
- Consumes: `{ eventId, outboundId, channel, status, providerMessageId, errorCode, occurredAt }` signed by `SALES_AGENT_SECRET`.
- Produces: `validateDeliveryEvent(input)` and `recordDeliveryEvent(event)`; delivery states `requested`, `accepted`, `delivered`, `read`, `failed`; follow-up attempts advance on provider `accepted`, while the UI claims delivery only after a status webhook reports `delivered` or `read`.

- [ ] **Step 1: Write failing delivery validation tests**

```js
import { describe, expect, it } from 'vitest'
import { validateDeliveryEvent } from '../src/lib/salesAgent/delivery'

describe('delivery acknowledgement', () => {
  it('accepts a provider success with an ID', () => {
    expect(validateDeliveryEvent({
      eventId: 'wamid.in.1', outboundId: 'wamid.in.1:text', channel: 'make',
      status: 'accepted', providerMessageId: 'wamid.out.1', occurredAt: '2026-08-14T10:00:00Z',
    })).toMatchObject({ ok: true })
  })

  it('rejects accepted without provider evidence', () => {
    expect(validateDeliveryEvent({ eventId: '1', outboundId: '1:text', channel: 'make', status: 'accepted' }))
      .toEqual({ ok: false, error: 'PROVIDER_MESSAGE_ID_REQUIRED' })
  })

  it('requires a stable error code for failure', () => {
    expect(validateDeliveryEvent({ eventId: '1', outboundId: '1:text', channel: 'make', status: 'failed' }))
      .toEqual({ ok: false, error: 'ERROR_CODE_REQUIRED' })
  })
})
```

- [ ] **Step 2: Run the test and verify the module is missing**

Run: `npx vitest run tests/salesDelivery.test.js`

Expected: FAIL with missing `delivery.js`.

- [ ] **Step 3: Implement validation and the authenticated route**

`validateDeliveryEvent` permits channels `make` and `whatsapp_graph`; statuses `accepted`, `delivered`, `read`, and `failed`; caps every identifier at 500 characters; and parses `occurredAt`. The route uses `x-sales-agent-secret`, returns 401 for an invalid secret, 400 for invalid input, and 202 after an idempotent state update to `sales_delivery_events/{outboundId}`. Status may only progress `accepted → delivered → read`; `failed` is terminal and duplicate status webhooks are no-ops.

```js
export async function POST(req) {
  if (req.headers.get('x-sales-agent-secret') !== process.env.SALES_AGENT_SECRET) {
    return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })
  }
  const parsed = validateDeliveryEvent(await req.json().catch(() => null))
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })
  await recordDeliveryEvent(parsed.event)
  return NextResponse.json({ accepted: true }, { status: 202 })
}
```

- [ ] **Step 4: Make direct Graph sends return evidence**

`whatsapp.js` must return `{ accepted: true, providerMessageId }` only when the Graph response contains `messages[0].id`; otherwise throw an error with normalized `errorCode`. Rename the lead write to `markFollowUpAccepted` and call it only after that return value; store `lastDeliveryStatus: 'accepted'` and never label it delivered. For a Graph failure store `lastDeliveryError`, keep `followUpAt` due, and emit `followup_failed` best-effort. When Make receives WhatsApp status webhooks, it posts `delivered`, `read`, or `failed` to the delivery route using the provider message ID.

For outside-window messages call the approved template shape:

```js
{
  messaging_product: 'whatsapp',
  to: phone,
  type: 'template',
  template: { name: 'wt_followup', language: { code: 'he' }, components },
}
```

- [ ] **Step 5: Deliver the owner digest through its approved template**

Keep the current `/api/sales-agent/digest` JSON contract. When cron owns delivery and `hasNews=true`, send `wt_daily_digest` to `SALES_AGENT_OWNER_PHONE` with the four existing single-line `lines` values. Inside an open service window, the owner's `דוח` command may still return free-form text. A missing/rejected template stores `digest_failed`, returns the digest payload for inspection, and never reports it delivered.

- [ ] **Step 6: Run focused, follow-up, and digest suites**

Run: `npx vitest run tests/salesDelivery.test.js tests/salesFollowupPolicy.test.js tests/salesSweep.test.js tests/salesDigest.test.js`

Expected: PASS; rejected and timed-out sends remain due and do not increment `followUpCount`.

- [ ] **Step 7: Commit the task**

Use the repository temp-index/`commit-tree` procedure.

Commit message: `feat(sales): acknowledge every WhatsApp delivery`

---

### Task 6: Make Transport Patch and Health Surface

**Files:**
- Modify: `src/lib/salesAgent/leadsCore.js`
- Modify: `src/app/api/sales-agent/leads/route.js`
- Modify: `src/app/admin/sales-leads/page.js`
- Create: `tests/salesHealth.test.js`
- Modify externally: Make scenario `9630287`.

**Interfaces:**
- Consumes: sanitized Firestore runtime state, delivery events, and Make blueprint.
- Produces: `{ inbound, anthropic, whatsapp, followups }` health JSON; admin cards; Make branches for text, image, video, owner notification, BusinessOS metadata, and delivery acknowledgement.

- [ ] **Step 1: Write the failing health aggregation test**

```js
import { describe, expect, it } from 'vitest'
import { summarizeSalesHealth } from '../src/lib/salesAgent/leadsCore'

it('marks stale or failing dependencies red without exposing secrets', () => {
  const result = summarizeSalesHealth({
    nowMs: 1_000_000,
    lastInboundAtMs: 100,
    breaker: { consecutiveFailures: 3, openUntilMs: 2_000_000 },
    delivery: { accepted: 4, failed: 2 },
    dueFollowUps: 40,
  })
  expect(result.anthropic.status).toBe('red')
  expect(result.whatsapp.status).toBe('amber')
  expect(JSON.stringify(result)).not.toContain('token')
})
```

- [ ] **Step 2: Run the test and verify the missing export**

Run: `npx vitest run tests/salesHealth.test.js`

Expected: FAIL with `summarizeSalesHealth is not a function`.

- [ ] **Step 3: Implement the pure health summary and sanitized API response**

Status rules:

- `anthropic = red` while circuit open, `amber` after one or two consecutive failures, otherwise `green`.
- `whatsapp = red` when the last 20 delivery attempts contain at least 5 failures, `amber` when any failed, otherwise `green`.
- `inbound = red` when Make reports active but no inbound heartbeat for 24 hours, `amber` after 6 hours, otherwise `green`; display `unknown` before the first heartbeat.
- `followups = red` when more than 25 are due, `amber` when 1–25 are due, otherwise `green`.

Return counts and timestamps only; no raw phone, message, secret, or payload.

- [ ] **Step 4: Patch Make scenario `9630287` in one controlled edit**

Export the current blueprint first. Patch its existing HTTP request body to send the Task 2 contract. Route the Wedding Tales result as follows:

- `sendText !== ''` → WhatsApp text module;
- `hasImage === true` → existing image module;
- `hasVideo === true` → new WhatsApp video module using `sendVideo` and `sendVideoCaption`;
- `handoff === true` → owner notification path;
- every successful outbound module → `POST /api/sales-agent/delivery` with `status=accepted` and returned WhatsApp message ID;
- every WhatsApp status webhook → the same endpoint with `delivered`, `read`, or `failed` and the provider message ID;
- every caught send error → the same endpoint with `status=failed` and normalized error code;
- every inbound decision → BusinessOS event endpoint without message text.

Do not activate a second inbound scenario. Save the patched blueprint, verify module references, then turn scenario `9630287` on only if Make has available operations.

- [ ] **Step 5: Run local verification**

Run: `npx vitest run tests/salesHealth.test.js tests/salesInboundEvents.test.js tests/salesDelivery.test.js tests/salesInbound.test.js tests/salesExperiments.test.js tests/salesFollowupPolicy.test.js`

Run: `npm run lint`

Run: `npm run build`

Expected: all tests PASS; lint and Next build exit 0.

- [ ] **Step 6: Run production smoke checks with a synthetic number**

Send one synthetic text event twice with the same `eventId`. Verify exactly one Anthropic usage increment, one outbound WhatsApp message ID, one completed inbound event, and the same cached outcome on the duplicate. Send one synthetic image event and verify no model call plus one handoff. Run `/api/sales-agent/followups?dry=1` and verify no Firestore send counters change.

- [ ] **Step 7: Commit and record the Make blueprint version**

Use the repository temp-index/`commit-tree` procedure for code and tests. Save the exported blueprint under the existing ignored operational backup location, not source control, because it can contain connection metadata.

Commit message: `feat(sales): expose live delivery health`

---

## Plan Acceptance Checklist

- [ ] Duplicate inbound event IDs return the stored outcome and cause zero duplicate model calls or sends.
- [ ] Text, image, video, audio, and document inputs have deterministic outcomes.
- [ ] Three consecutive Anthropic failures open the breaker and notify the owner.
- [ ] Only three arms receive new leads; all historical arms remain visible.
- [ ] Follow-up counters advance only after WhatsApp returns a message ID.
- [ ] Make sends video and acknowledges every outbound result.
- [ ] Provider acceptance and actual delivery/read status are shown separately.
- [ ] The scheduled owner digest uses `wt_daily_digest` and never claims delivery after a template failure.
- [ ] Admin health never claims green when Make lacks credits or the provider is failing.
- [ ] Every human takeover remains in WhatsApp and no call action is created.
- [ ] The full test, lint, and build suite passes before deployment.
