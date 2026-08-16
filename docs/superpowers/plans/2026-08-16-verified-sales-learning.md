# Verified Sales Learning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make bot experiments learn from verified Wedding Tales payments rather than manually assigned CRM stages.

**Architecture:** The existing paid-order boundary writes explicit immutable payment-verification fields onto the matching lead. Experiment summaries treat only those fields as wins, retain reply and offer metrics as diagnostics, and refuse a winner below the existing 30-lead sample floor.

**Tech Stack:** Firestore Admin SDK, WooCommerce/createWedding ingestion, JavaScript, Vitest, existing BusinessOS event bridge.

**Spec:** `docs/superpowers/specs/2026-08-16-conversation-learned-sales-bot-design.md`

## Global Constraints

- `closed_won` without `paymentVerified: true` is not a verified experiment win.
- Pending, failed, abandoned, or merely started checkout never counts as revenue.
- The same order can verify the same lead only once.
- Payment identifiers and amounts may be stored on the operational lead but never logged with phone or transcript.
- Historical experiment rows remain visible.
- No winner is declared until two active arms each have at least 30 assigned leads and the existing significance rule passes.
- Preserve `src/app/landing/LandingClient.jsx` untouched.

---

### Task 1: Persist an explicit verified-payment fact

**Files:**
- Modify: `src/lib/salesAgent/leads.js`
- Create: `tests/salesPaymentFirestore.test.js`
- Modify: `src/app/api/createWedding/route.js`
- Create: `tests/salesPaymentRoute.test.js`

**Interfaces:**
- Consumes: `closeLeadOnPurchase({ phone, orderId, weddingId, amount, packageId })` from the paid `createWedding` path.
- Produces: lead fields `paymentVerified`, `paymentVerifiedAt`, `verifiedOrderId`, `amount`, and `packageInterest`.

- [ ] **Step 1: Add a failing Firestore contract test**

```js
await closeLeadOnPurchase({
  phone: '000000000000',
  orderId: 'order-test-one',
  weddingId: 'wedding-test-one',
  amount: 950,
  packageId: 'printed',
})

expect(readLead('000000000000')).toMatchObject({
  stage: 'closed_won',
  paymentVerified: true,
  verifiedOrderId: 'order-test-one',
  amount: 950,
  packageInterest: 'printed',
  followUpAt: null,
})
```

Assert `paymentVerifiedAt` is a server timestamp sentinel. Call the function twice with the same order and assert one final verified order identity and no duplicate attribution increment.

- [ ] **Step 2: Run RED**

Run: `npx vitest run tests/salesPaymentFirestore.test.js`

Expected: FAIL because the explicit verification fields are absent.

- [ ] **Step 3: Add verification fields atomically**

Inside `closeLeadOnPurchase`, write:

```js
paymentVerified: true,
paymentVerifiedAt: FieldValue.serverTimestamp(),
verifiedOrderId: String(orderId),
```

Require a non-empty `orderId` for `paymentVerified: true`. If no order ID exists, preserve the current close behavior but set no verification fields. Use a transaction or an order-keyed marker so repeated webhook delivery cannot credit media twice.

- [ ] **Step 4: Add the paid-route regression**

Mock `closeLeadOnPurchase` in `createWedding` tests. A processing/completed paid payload must call it once with the normalized order data. A pending/failed payload must not call it.

- [ ] **Step 5: Run GREEN and commit**

Run: `npx vitest run tests/salesPaymentFirestore.test.js tests/salesPaymentRoute.test.js`

Expected: PASS.

```bash
git add src/lib/salesAgent/leads.js src/app/api/createWedding/route.js tests/salesPaymentFirestore.test.js tests/salesPaymentRoute.test.js
git commit -m "feat(sales): record verified order outcomes"
```

### Task 2: Make experiments count verified sales only

**Files:**
- Modify: `src/lib/salesAgent/experiments.js`
- Modify: `tests/salesExperiments.test.js`

**Interfaces:**
- Consumes: `lead.paymentVerified`, `lead.verifiedOrderId`, `lead.amount`, and existing stage history.
- Produces: experiment rows with `verifiedWins`, `unverifiedClosedWon`, `paymentIntent`, `verifiedRevenue`, and `winRate` based only on verified wins.

- [ ] **Step 1: Add failing truth tests**

```js
const result = summarizeExperiments([
  lead({ phone: 'manual-win', variant: 'answer_first', stage: 'closed_won', amount: 1490 }),
  lead({ phone: 'verified-win', variant: 'answer_first', stage: 'closed_won', paymentVerified: true, verifiedOrderId: 'order-two', amount: 690 }),
])
const row = result.rows.find(item => item.id === 'answer_first')
expect(row.verifiedWins).toBe(1)
expect(row.unverifiedClosedWon).toBe(1)
expect(row.verifiedRevenue).toBe(690)
expect(row.winRate).toBe(0.5)
```

Add a test showing `ready_to_pay` increases `paymentIntent` but not wins. Add a test proving a `paymentVerified: true` row without `verifiedOrderId` is not counted.

- [ ] **Step 2: Run RED**

Run: `npx vitest run tests/salesExperiments.test.js -t "verified"`

Expected: FAIL because current wins use `stage === 'closed_won'`.

- [ ] **Step 3: Implement verified counters**

```js
const verified = lead.paymentVerified === true && typeof lead.verifiedOrderId === 'string' && lead.verifiedOrderId.length > 0
if (verified) {
  row.verifiedWins++
  row.verifiedRevenue += Number(lead.amount) || 0
}
if (lead.stage === 'closed_won' && !verified) row.unverifiedClosedWon++
if (reached(lead, ['ready_to_pay', 'closed_won'])) row.paymentIntent++
```

Set `won` and `revenue` aliases to verified values only if existing UI consumers require those property names. Document those aliases in a code comment.

- [ ] **Step 4: Run GREEN and the full experiment suite**

Run: `npx vitest run tests/salesExperiments.test.js tests/salesLeadsView.test.js tests/salesSettings.test.js`

Expected: PASS.

- [ ] **Step 5: Commit verified experiment truth**

```bash
git add src/lib/salesAgent/experiments.js tests/salesExperiments.test.js
git commit -m "fix(sales): rank experiments by verified payments"
```

### Task 3: Surface honest learning diagnostics

**Files:**
- Modify: `src/app/api/sales-agent/leads/route.js`
- Modify: `tests/salesLeadsHealthRoute.test.js`
- Modify: `src/app/admin/sales-leads/page.js`
- Create: `tests/salesLeadsPageContract.test.js`

**Interfaces:**
- Consumes: verified experiment summary from Task 2.
- Produces: owner-facing rows that separate second reply, offer reach, payment intent, verified payment, verified revenue, and unverified manual closes.

- [ ] **Step 1: Add a failing API allowlist test**

Assert the authenticated API response exposes only aggregate fields:

```js
expect(body.experiments.rows[0]).toEqual(expect.objectContaining({
  leads: expect.any(Number),
  replied: expect.any(Number),
  reachedOffer: expect.any(Number),
  paymentIntent: expect.any(Number),
  verifiedWins: expect.any(Number),
  unverifiedClosedWon: expect.any(Number),
  verifiedRevenue: expect.any(Number),
}))
expect(JSON.stringify(body.experiments)).not.toMatch(/phone|transcript|messageText/)
```

- [ ] **Step 2: Run RED**

Run: `npx vitest run tests/salesLeadsHealthRoute.test.js`

Expected: FAIL because the new verified counters are not surfaced.

- [ ] **Step 3: Expose and render the verified funnel**

The UI row order is: assigned leads, second replies, offers, payment intent, verified payments, verified revenue. If `unverifiedClosedWon > 0`, show the Hebrew warning `סגירות ידניות שממתינות לאימות תשלום` with the count. Never label unverified closes as revenue.

- [ ] **Step 4: Run API and UI GREEN**

Run: `npx vitest run tests/salesLeadsHealthRoute.test.js tests/salesLeadsPageContract.test.js`

Expected: PASS. The page contract test must assert the six Hebrew metric labels, the unverified-close warning, `flex-wrap` on the experiment metric container, and no `phone`, `transcript`, or `messageText` rendering inside the experiment section.

- [ ] **Step 5: Commit honest diagnostics**

```bash
git add src/app/api/sales-agent/leads/route.js tests/salesLeadsHealthRoute.test.js src/app/admin/sales-leads/page.js tests/salesLeadsPageContract.test.js
git commit -m "feat(sales): show verified experiment outcomes"
```

### Task 4: Final verification and canary release

**Files:**
- Update: `docs/operations/2026-08-16-whatsapp-canary.md`

**Interfaces:**
- Consumes: completed transport, decision-engine, and verified-learning plans.
- Produces: a deployed ten-lead/24-hour canary with a documented pass/fail decision.

- [ ] **Step 1: Run final repository gates**

```bash
npx vitest run tests/
npm run lint
npm run build
git diff --check
git status --short
```

Expected: all tests pass; lint and build exit 0; diff check is clean; status contains only intentionally preserved user work before the feature commits are integrated.

- [ ] **Step 2: Deploy with the sales-agent kill switch off**

Deploy the exact tested commit. Verify the production control endpoint reports the expected model and the two active arms. Do not log the prompt, secret, phone, or transcript.

- [ ] **Step 3: Run synthetic policy checks**

Exercise synthetic price, demo, payment-friction, negative-exit, duplicate, and stale inputs. Assert one-message/180-character/one-question limits, zero call offers, verified stale suppression, and zero duplicate sends.

- [ ] **Step 4: Enable the ten-lead or 24-hour canary**

Enable the bot for fresh leads only. Stop immediately on duplicate send, 401, call offer, unsupported factual claim, or outbound failure rate above 5%.

- [ ] **Step 5: Record and commit the canary decision**

Append counts only: fresh leads, delivery success, second replies, offers, payment intents, verified payments, provider failures, duplicate sends, and stop reason. Do not include identities or message content.

```bash
git add docs/operations/2026-08-16-whatsapp-canary.md
git commit -m "docs(sales): record revenue bot canary"
```
