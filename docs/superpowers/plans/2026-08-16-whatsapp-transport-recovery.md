# WhatsApp Transport Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore the live Make-to-Wedding-Tales WhatsApp path without replying to stale queued events or producing duplicate sends.

**Architecture:** Add a pure inbound-age policy in Wedding Tales and enforce it immediately after the durable event claim, before reading lead state or calling a model. Deploy that guard first, then repair the live Make HTTP secret, validate one synthetic event, and activate the scenario with an existing kill switch.

**Tech Stack:** Next.js App Router, JavaScript, Vitest, Firestore event claims, Make scenario 9630287, Vercel.

**Spec:** `docs/superpowers/specs/2026-08-16-conversation-learned-sales-bot-design.md`

## Global Constraints

- Never print, commit, log, or copy the value of `SALES_AGENT_SECRET` into a tracked file.
- Events older than 15 minutes complete without a customer send or provider call.
- Duplicate and busy claims retain their current zero-send behavior.
- No queued customer event is manually replayed as a fresh event.
- Phone numbers and message text never appear in test fixtures, logs, or reports.
- The existing user modification in `src/app/landing/LandingClient.jsx` is out of scope and must remain untouched.

---

### Task 1: Pure stale-inbound policy

**Files:**
- Create: `src/lib/salesAgent/transportPolicy.js`
- Create: `tests/salesTransportPolicy.test.js`

**Interfaces:**
- Consumes: provider `occurredAt` values as ISO strings, Unix seconds, or Unix milliseconds.
- Produces: `decideInboundAge({ occurredAt, nowMs, maxAgeMs }): { action: 'process' | 'skip-stale', ageMs: number | null }` and `MAX_LIVE_INBOUND_AGE_MS`.

- [ ] **Step 1: Write the failing policy tests**

```js
import { describe, expect, it } from 'vitest'
import { decideInboundAge, MAX_LIVE_INBOUND_AGE_MS } from '@/lib/salesAgent/transportPolicy'

describe('decideInboundAge', () => {
  const nowMs = Date.parse('2026-08-16T12:00:00.000Z')

  it('processes a current event', () => {
    expect(decideInboundAge({ occurredAt: '2026-08-16T11:59:00.000Z', nowMs })).toMatchObject({ action: 'process' })
  })

  it('skips an event older than fifteen minutes', () => {
    expect(decideInboundAge({ occurredAt: '2026-08-16T11:44:59.999Z', nowMs })).toMatchObject({
      action: 'skip-stale', ageMs: MAX_LIVE_INBOUND_AGE_MS + 1,
    })
  })

  it.each([null, '', 'invalid'])('processes missing or invalid provider time %j safely', occurredAt => {
    expect(decideInboundAge({ occurredAt, nowMs })).toEqual({ action: 'process', ageMs: null })
  })
})
```

- [ ] **Step 2: Run the new test and verify RED**

Run: `npx vitest run tests/salesTransportPolicy.test.js`

Expected: FAIL because `@/lib/salesAgent/transportPolicy` does not exist.

- [ ] **Step 3: Implement the minimal pure policy**

```js
export const MAX_LIVE_INBOUND_AGE_MS = 15 * 60 * 1000

function parseOccurredAt(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value < 10_000_000_000 ? value * 1000 : value
  const parsed = typeof value === 'string' && value.trim() ? Date.parse(value) : NaN
  return Number.isFinite(parsed) ? parsed : null
}

export function decideInboundAge({ occurredAt, nowMs = Date.now(), maxAgeMs = MAX_LIVE_INBOUND_AGE_MS } = {}) {
  const occurredAtMs = parseOccurredAt(occurredAt)
  if (occurredAtMs == null) return { action: 'process', ageMs: null }
  const ageMs = Math.max(0, nowMs - occurredAtMs)
  return { action: ageMs > maxAgeMs ? 'skip-stale' : 'process', ageMs }
}
```

- [ ] **Step 4: Run GREEN**

Run: `npx vitest run tests/salesTransportPolicy.test.js`

Expected: PASS.

- [ ] **Step 5: Commit the pure policy**

```bash
git add src/lib/salesAgent/transportPolicy.js tests/salesTransportPolicy.test.js
git commit -m "feat(sales): reject stale inbound transport events"
```

### Task 2: Enforce the stale gate in the reply route

**Files:**
- Modify: `src/app/api/sales-agent/reply/route.js`
- Modify: `tests/salesReplyRoute.test.js`

**Interfaces:**
- Consumes: `decideInboundAge` from Task 1 and the existing `complete(...)` event finalizer.
- Produces: a durable no-send outcome with `skipped: 'stale-inbound'` before lead reads, media reads, settings reads, breaker work, or model calls.

- [ ] **Step 1: Add failing route regressions**

Add a test with `occurredAt` sixteen minutes before the fixed clock and assert:

```js
expect(response.status).toBe(200)
expect(await response.json()).toMatchObject({
  ok: true,
  shouldSend: false,
  noReply: true,
  skipped: 'stale-inbound',
})
expect(mocks.getLead).not.toHaveBeenCalled()
expect(mocks.listMedia).not.toHaveBeenCalled()
expect(mocks.acquireProviderCircuit).not.toHaveBeenCalled()
expect(mocks.callClaude).not.toHaveBeenCalled()
```

Add a boundary test at exactly fifteen minutes that asserts one normal provider call. Add a replay test asserting the completed stale event returns the existing duplicate no-send response and still makes zero provider calls.

- [ ] **Step 2: Run the focused route test and verify RED**

Run: `npx vitest run tests/salesReplyRoute.test.js -t "stale inbound"`

Expected: FAIL because the route continues into lead/model work.

- [ ] **Step 3: Add the route gate after `complete` is defined**

```js
import { decideInboundAge } from '@/lib/salesAgent/transportPolicy'

const inboundAge = decideInboundAge({ occurredAt: body.occurredAt })
if (inboundAge.action === 'skip-stale') {
  return complete({
    ok: true,
    shouldSend: false,
    send: [],
    sendText: '',
    handoff: false,
    noReply: true,
    skipped: 'stale-inbound',
  })
}
```

Do not log `occurredAt`, `eventId`, `phone`, or message text.

- [ ] **Step 4: Run focused GREEN and regression suites**

Run: `npx vitest run tests/salesTransportPolicy.test.js tests/salesReplyRoute.test.js tests/salesInboundEvents.test.js tests/salesInbound.test.js`

Expected: PASS.

- [ ] **Step 5: Commit route enforcement**

```bash
git add src/app/api/sales-agent/reply/route.js tests/salesReplyRoute.test.js
git commit -m "fix(sales): silence stale queued conversations"
```

### Task 3: Verify and deploy the guard

**Files:**
- Create: `docs/operations/2026-08-16-whatsapp-canary.md`

**Interfaces:**
- Consumes: production deployment of Tasks 1-2.
- Produces: a timestamped, secret-free operational record with deployment URL, test event classification, Make HTTP status, queue disposition, and kill-switch state.

- [ ] **Step 1: Run all local product gates**

Run:

```bash
npx vitest run tests/
npm run lint
npm run build
git diff --check
```

Expected: all tests pass, lint has no errors, build exits 0, and `git diff --check` exits 0.

- [ ] **Step 2: Deploy the committed guard to Vercel**

Run: `npx vercel --prod --yes`

Expected: a production deployment URL for the tested commit. Record only the public deployment URL and `git rev-parse HEAD` output in the operation note. Do not record environment values.

- [ ] **Step 3: Prove the production stale gate before Make activation**

Send one authenticated synthetic request using the dedicated private test recipient already configured for Wedding Tales; never print or record that recipient. Set `occurredAt` to sixteen minutes before the request. Assert the JSON response contains `skipped: 'stale-inbound'`, and confirm no provider usage delta and no outbound delivery event.

- [ ] **Step 4: Write the operation note**

```md
# WhatsApp canary — 2026-08-16

- Guard commit: write the exact output of `git rev-parse HEAD`
- Production URL: `https://app.weddingtales.co.il`
- Stale synthetic result: `stale-inbound`, zero send, zero provider call
- Live Make scenario: `9630287`
- Make authentication: verified without exposing value
- Queued events: allowed through stale gate; no manual replay
- Kill switch: Wedding Tales sales-agent `enabled`
```

The operation note must contain the real SHA returned by `git rev-parse HEAD` before commit.

- [ ] **Step 5: Commit the verified operation note**

```bash
git add docs/operations/2026-08-16-whatsapp-canary.md
git commit -m "docs(sales): record whatsapp stale-event canary"
```

### Task 4: Repair Make authentication and activate canary

**Files:**
- Modify externally: Make scenario `9630287`, HTTP request module only.
- Verify externally: Vercel environment for Wedding Tales.
- Update: `docs/operations/2026-08-16-whatsapp-canary.md`

**Interfaces:**
- Consumes: deployed stale gate and the existing Vercel `SALES_AGENT_SECRET`.
- Produces: an active Make scenario that receives 200 from `/api/sales-agent/reply` and never stores a literal secret placeholder.

- [ ] **Step 1: Compare secret presence without revealing values**

Confirm Vercel has a non-empty `SALES_AGENT_SECRET`. In Make, replace the literal `{{SALES_AGENT_SECRET}}` header value with a secure Make variable or the matching secret. Never paste it into chat, terminal output, a screenshot, or a tracked file.

- [ ] **Step 2: Run one synthetic fresh event while the scenario is inactive**

Use Make's single-run mode with a reserved test event. Expected HTTP result: 200, exactly one reply-route completion, and no 401.

- [ ] **Step 3: Activate scenario 9630287**

Activate only after the fresh synthetic request is 200 and the stale gate is deployed. Keep the eight old records in their provider queue; do not edit their timestamps and do not replay them manually.

- [ ] **Step 4: Observe the canary window**

For the first ten new leads or 24 hours, whichever comes first, stop the scenario if any condition occurs: duplicate send, another 401, outbound failure rate over 5%, or a phone-call offer.

- [ ] **Step 5: Record final transport state**

Update the operation note with activation timestamp, fresh events processed, stale events suppressed, duplicate sends, 401 count, and whether the scenario remains active. Commit the note with:

```bash
git add docs/operations/2026-08-16-whatsapp-canary.md
git commit -m "docs(sales): close whatsapp transport canary"
```
