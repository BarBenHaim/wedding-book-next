# BusinessOS Sales Manager Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a mobile-first BusinessOS control room that shows the chat-closing queue, verified funnel leakage, package economics, integration health, and guarded campaign decisions from real payments.

**Architecture:** BusinessOS reads mirrored WhatsApp lead state plus append-only funnel/payment events and derives queue priority and analytics in pure modules. PostgreSQL stores only operational metadata, verified costs, and health; server-rendered pages load aggregates, while authenticated action routes send narrowly scoped chat controls back to Wedding Tales and record every result.

**Tech Stack:** Next.js 14 App Router, TypeScript 5.6, React 18, PostgreSQL/Supabase, Drizzle ORM, Vitest 2, Testing Library, existing BusinessOS auth and Meta action services.

**Spec:** `C:/Users/DELL/OneDrive/Desktop/wedding-book-next/wedding-book/docs/superpowers/specs/2026-08-14-revenue-sales-engine-design.md`

## Global Constraints

- This plan is executed in `C:/Users/DELL/AppData/Local/BusinessOS-worktrees/finance-control-center-clean` unless that branch has already been integrated; inspect current repository state before editing.
- The sales manager is chat-only: no call buttons, call tasks, call campaigns, or suggested phone conversations.
- BusinessOS stores funnel metadata and short operational reasons, not full WhatsApp transcripts in analytics tables.
- A raw phone number is available only on the operational lead view; analytics use normalized identity/hash.
- Paid revenue comes only from verified `payment_verified`/paid Woo orders.
- Pending checkout is a funnel stage, never revenue.
- Contribution margin is `null` when any required package cost component is unverified.
- Campaign scaling requires at least 3 attributed paid purchases, attribution coverage above 70%, positive contribution margin, and no payment/integration health fault.
- A budget change is at most 15% and remains explicitly approved and audited.
- Marketing recommendations must explain evidence and never present Meta-reported purchase value as verified business revenue.
- All actions are authenticated, idempotent, and logged with actor, time, request, and result.
- UI direction is RTL, works at 360px width, and keeps primary actions at least 44px high.
- No new paid dependency is introduced.

---

## File Structure

**Create in BusinessOS**

- `src/lib/sales-manager/queue.ts` — pure priority, SLA, and reason derivation.
- `src/lib/sales-manager/unit-economics.ts` — pure revenue/cost/contribution calculations.
- `src/lib/sales-manager/health.ts` — pure dependency health aggregation.
- `src/lib/sales-manager/reader.ts` — Drizzle queries and control-room view model.
- `src/lib/sales-manager/action-handler.ts` — authenticated, idempotent chat-control workflow.
- `src/lib/sales-manager/wedding-tales-client.ts` — signed narrow control client.
- `src/app/(protected)/sales-manager/page.tsx` — server page.
- `src/app/api/sales-manager/actions/route.ts` — action endpoint.
- `src/components/sales-manager/sales-manager-workbench.tsx` — responsive control-room UI.
- `tests/unit/sales-manager-queue.test.ts`, `tests/unit/unit-economics.test.ts`, `tests/unit/integration-health.test.ts` — pure rules.
- `tests/integration/sales-manager-action-route.test.ts` — auth/idempotency.
- `tests/components/sales-manager-workbench.test.tsx` — UX states and mobile semantics.

**Modify in BusinessOS**

- `src/db/schema.ts` — closing fields, package cost settings, and integration health.
- `src/scripts/apply-whatsapp-leads-schema.ts` — additive lead columns.
- `src/scripts/apply-marketing-schema.ts` — cost and health tables.
- `src/lib/whatsapp-leads/lead-transform.ts` — mirror the new Firestore closing fields.
- `src/lib/whatsapp-leads/lead-reader.ts` — expose operational closing metadata.
- `src/lib/bi/marketing-funnel.ts` — verified-payment funnel and strict recommendation rules.
- `src/lib/bi/analytics-reader.ts` — provide verified attribution and health inputs.
- `src/lib/marketing/action-service.ts` — enforce contribution/coverage/health guardrails.
- `src/components/layout/app-shell.tsx` — add `מנהל מכירות` navigation.
- `src/app/globals.css` — scoped sales-manager responsive styles.
- existing analytics/action tests — tighten scale rules.

---

### Task 1: Persist Closing Metadata, Costs, and Health

**Files:**
- Modify: `src/db/schema.ts`
- Modify: `src/scripts/apply-whatsapp-leads-schema.ts`
- Modify: `src/scripts/apply-marketing-schema.ts`
- Modify: `src/lib/whatsapp-leads/lead-transform.ts`
- Test: `tests/unit/whatsapp-lead-transform.test.ts`
- Test: `tests/unit/marketing-schema.test.ts`
- Test: `tests/integration/finance-schema.test.ts`

**Interfaces:**
- Consumes: mirrored Wedding Tales closing fields and sanitized runtime heartbeats.
- Produces: lead columns `variant`, `objectionCode`, `recommendedPackageId`, `nextBestAction`, `paymentLinkSentAt`, `paymentLinkClickedAt`, `checkoutStartedAt`, `humanSince`, `orderExternalKey`; tables `package_cost_settings` and `integration_health`.

- [ ] **Step 1: Add failing schema contract tests**

```ts
import { getTableColumns, getTableName } from 'drizzle-orm';
import { integrationHealth, packageCostSettings, whatsappLeads } from '@/db/schema';

it('declares the chat-closing fields and economic sources', () => {
  expect(Object.keys(getTableColumns(whatsappLeads))).toEqual(expect.arrayContaining([
    'nextBestAction', 'paymentLinkSentAt', 'paymentLinkClickedAt', 'checkoutStartedAt',
  ]));
  expect(getTableName(packageCostSettings)).toBe('package_cost_settings');
  expect(getTableName(integrationHealth)).toBe('integration_health');
});
```

Add a lead-transform assertion:

```ts
expect(normalizeWhatsAppLead({ phone: '972500000001',
  stage: 'ready_to_pay', nextBestAction: 'resolve_checkout_blocker',
  objectionCode: 'checkout_problem', recommendedPackageId: 'printed',
  paymentLinkSentAt: { seconds: 1_723_632_000 },
})).toMatchObject({
  nextBestAction: 'resolve_checkout_blocker', objectionCode: 'checkout_problem',
  recommendedPackageId: 'printed', paymentLinkSentAt: new Date(1_723_632_000_000),
});
```

- [ ] **Step 2: Run focused tests to verify missing fields**

Run: `npm test -- tests/unit/whatsapp-lead-transform.test.ts tests/unit/marketing-schema.test.ts tests/integration/finance-schema.test.ts`

Expected: FAIL on absent fields/tables.

- [ ] **Step 3: Add Drizzle schema fields**

Extend `whatsappLeads` with nullable columns using the exact names above. Define:

```ts
export const packageCostSettings = businessOsSchema.table('package_cost_settings', {
  id: uuid('id').primaryKey().defaultRandom(),
  packageId: varchar('package_id', { length: 80 }).notNull(),
  printCostAgorot: integer('print_cost_agorot'),
  shippingCostAgorot: integer('shipping_cost_agorot'),
  paymentFeeAgorot: integer('payment_fee_agorot'),
  variableLaborCostAgorot: integer('variable_labor_cost_agorot'),
  verifiedAt: timestamp('verified_at', { withTimezone: true }),
  sourceNote: text('source_note').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, table => ({ packageUnique: uniqueIndex('package_cost_settings_package_unique').on(table.packageId) }));

export const integrationHealth = businessOsSchema.table('integration_health', {
  system: varchar('system', { length: 48 }).primaryKey(),
  status: varchar('status', { length: 16 }).notNull(),
  lastSuccessAt: timestamp('last_success_at', { withTimezone: true }),
  lastFailureAt: timestamp('last_failure_at', { withTimezone: true }),
  errorCode: varchar('error_code', { length: 80 }),
  safeDetails: jsonb('safe_details').notNull().default({}),
  observedAt: timestamp('observed_at', { withTimezone: true }).notNull(),
});
```

- [ ] **Step 4: Add idempotent SQL migrations**

Use `alter table ... add column if not exists` for the lead fields and `create table if not exists` plus unique indexes for the new tables. Never drop or rewrite existing rows. Run both scripts against the configured database only after tests pass.

- [ ] **Step 5: Whitelist and mirror new lead fields**

Convert Firestore timestamp shapes through the existing safe date helper. Limit codes to 80 characters and IDs to 128. Do not mirror tracked token values or raw referral payloads.

- [ ] **Step 6: Run schema tests and typecheck via build**

Run: `npm test -- tests/unit/whatsapp-lead-transform.test.ts tests/unit/marketing-schema.test.ts tests/integration/finance-schema.test.ts`

Run: `npm run build`

Expected: PASS; migrations are additive and build exits 0.

- [ ] **Step 7: Commit the task**

Commit after checking BusinessOS repository instructions.

Commit message: `feat(sales-manager): store closing state and verified costs`

---

### Task 2: Pure Chat Queue and SLA Rules

**Files:**
- Create: `src/lib/sales-manager/queue.ts`
- Create: `tests/unit/sales-manager-queue.test.ts`
- Modify: `src/lib/whatsapp-leads/lead-reader.ts`

**Interfaces:**
- Consumes: `SalesLeadQueueInput` with stage, next action, last timestamps, event date, handoff state, and payment states.
- Produces: `deriveQueueItem(lead, now)` returning priority `critical | high | normal | low`, bucket, due timestamp, age minutes, reason, and chat URL; `sortClosingQueue(items)`.

- [ ] **Step 1: Write failing queue tests**

```ts
import { describe, expect, it } from 'vitest';
import { deriveQueueItem, sortClosingQueue } from '@/lib/sales-manager/queue';

const now = new Date('2026-08-14T12:00:00.000Z');

it('puts requested human chat first without producing a call action', () => {
  const item = deriveQueueItem({ externalKey: '972500000001', stage: 'handoff', human: true, humanSince: new Date('2026-08-14T11:00:00Z') }, now);
  expect(item).toMatchObject({ priority: 'critical', bucket: 'human_chat', reason: 'ממתין לתשובה אנושית בצ׳אט' });
  expect(item.chatUrl).toBe('https://wa.me/972500000001');
  expect(JSON.stringify(item)).not.toMatch(/call|חיוג/);
});

it('prioritizes an unconverted checkout over a silent demo', () => {
  const checkout = deriveQueueItem({ externalKey: '972500000002', stage: 'ready_to_pay', paymentLinkSentAt: new Date('2026-08-13T10:00:00Z') }, now);
  const demo = deriveQueueItem({ externalKey: '972500000003', stage: 'demo_sent', lastInboundAt: new Date('2026-08-12T10:00:00Z') }, now);
  expect(sortClosingQueue([demo, checkout])[0].bucket).toBe('checkout_blocked');
});
```

- [ ] **Step 2: Run the test and verify missing module**

Run: `npm test -- tests/unit/sales-manager-queue.test.ts`

Expected: FAIL with unresolved `sales-manager/queue`.

- [ ] **Step 3: Implement exact queue buckets**

Use buckets in this order:

1. `human_chat` — `human=true` or stage `handoff`; due immediately, critical after 15 minutes.
2. `checkout_blocked` — link clicked/checkout started and no payment; high after 2 hours.
3. `payment_link_idle` — link sent but not clicked; high after 24 hours.
4. `objection_open` — stage `objection`; normal, due by existing `followUpAt`.
5. `demo_silent` — stage `demo_sent` with no later inbound; normal after 24 hours.
6. `event_near` — event within 14 days and lead still open; high.
7. `followup_due` — `followUpAt <= today`; normal.

Closed leads never enter the queue. `chatUrl` is the only direct contact action.

- [ ] **Step 4: Extend reader types and selection**

Expose all Task 1 fields, preserve safe reason/note sanitization, and keep the existing operational phone only in this reader. Derive queue items after database loading so pure rules stay testable.

- [ ] **Step 5: Run reader and queue tests**

Run: `npm test -- tests/unit/sales-manager-queue.test.ts tests/integration/whatsapp-conversation-reader.test.ts tests/unit/whatsapp-lead-transform.test.ts`

Expected: PASS and closed-won leads are absent from queue fixtures.

- [ ] **Step 6: Commit the task**

Commit message: `feat(sales-manager): prioritize the WhatsApp closing queue`

---

### Task 3: Verified Funnel and Unit Economics

**Files:**
- Create: `src/lib/sales-manager/unit-economics.ts`
- Create: `tests/unit/unit-economics.test.ts`
- Modify: `src/lib/bi/marketing-funnel.ts`
- Modify: `tests/unit/marketing-funnel.test.ts`

**Interfaces:**
- Consumes: verified payment rows, package revenue, optional verified cost settings, and campaign spend/attribution.
- Produces: `calculateContribution(input)`, `recommendCampaignOutcome(input)`, and funnel stages `leadCreated`, `leadReplied`, `demoSent`, `offerSent`, `readyToPay`, `checkoutStarted`, `paidOrders`; strict recommendations.

- [ ] **Step 1: Write failing economics tests**

```ts
import { expect, it } from 'vitest';
import { calculateContribution } from '@/lib/sales-manager/unit-economics';

it('refuses to invent margin when a cost is missing', () => {
  expect(calculateContribution({ revenueAgorot: 95000, printCostAgorot: 22000, shippingCostAgorot: null, paymentFeeAgorot: 2600, variableLaborCostAgorot: 8000 }))
    .toEqual({ revenueAgorot: 95000, variableCostAgorot: null, contributionAgorot: null, marginRate: null, complete: false });
});

it('calculates verified contribution in agorot', () => {
  expect(calculateContribution({ revenueAgorot: 95000, printCostAgorot: 22000, shippingCostAgorot: 3500, paymentFeeAgorot: 2600, variableLaborCostAgorot: 8000 }))
    .toMatchObject({ variableCostAgorot: 36100, contributionAgorot: 58900, complete: true });
});
```

- [ ] **Step 2: Add a failing strict campaign recommendation test**

```ts
it('does not recommend scale below three attributed payments', () => {
  expect(recommendCampaignOutcome({
    paidOrders: 2, attributionCoverage: 1, contributionAgorot: 200000,
    integrationFault: false, readyToPay: 2,
  })).toBe('collect_data');
});
```

- [ ] **Step 3: Run tests to verify old recommendation behavior fails**

Run: `npm test -- tests/unit/unit-economics.test.ts tests/unit/marketing-funnel.test.ts`

Expected: FAIL because economics module is missing and current funnel scales with a single paid order.

- [ ] **Step 4: Implement contribution calculation**

All amounts are integer agorot. Return incomplete if any cost is `null`, negative, non-integer, or cost setting `verifiedAt` is absent. When complete, `marginRate = contributionAgorot / revenueAgorot`, rounded to four decimals; zero revenue yields `null` rate.

- [ ] **Step 5: Tighten funnel stages and recommendation**

Count stages from append-only events using unique lead identity. Count revenue only from `payment_verified` or existing `isPaidOrder`. Set `scale_candidate` only when:

```ts
paidOrders >= 3 && attributionCoverage > 0.70 &&
contributionAgorot !== null && contributionAgorot > 0 &&
integrationFault === false
```

Export `recommendCampaignOutcome(input: { paidOrders: number; attributionCoverage: number; contributionAgorot: number | null; integrationFault: boolean; readyToPay: number }): MarketingRecommendation` and call it from `buildMarketingFunnel`. Set `sales_follow_up` when `readyToPay > paidOrders`; `stop_loss_review` remains a proposal, never an automatic pause.

- [ ] **Step 6: Run funnel and analytics regression tests**

Run: `npm test -- tests/unit/unit-economics.test.ts tests/unit/marketing-funnel.test.ts tests/unit/marketing-overview.test.ts tests/components/analytics-workbench.test.tsx`

Expected: PASS; Meta purchase value remains visually separate from verified revenue.

- [ ] **Step 7: Commit the task**

Commit message: `feat(sales-manager): base campaign decisions on contribution`

---

### Task 4: Integration Health Model

**Files:**
- Create: `src/lib/sales-manager/health.ts`
- Create: `tests/unit/integration-health.test.ts`
- Modify: `src/lib/automations/automation-reader.ts`
- Modify: `src/lib/marketing/marketing-sync-cron-handler.ts`
- Modify: `src/lib/automations/conversation-event-store.ts`

**Interfaces:**
- Consumes: heartbeats for `make`, `anthropic`, `whatsapp`, `meta`, `woocommerce`, and `cron`.
- Produces: `deriveSystemHealth(rows, now)` and idempotent heartbeat upserts with `green | amber | red | unknown`.

- [ ] **Step 1: Write failing health tests**

```ts
it('marks Make red when it is out of operations even if scenario is active', () => {
  const health = deriveSystemHealth([{ system: 'make', status: 'red', observedAt: new Date('2026-08-14T11:59:00Z'), safeDetails: { creditsRemaining: 0 } }], new Date('2026-08-14T12:00:00Z'));
  expect(health.make).toMatchObject({ status: 'red', reason: 'אין פעולות זמינות ב-Make' });
});

it('marks stale cron amber after 26 hours and red after 48', () => {
  expect(deriveSystemHealth([{ system: 'cron', status: 'green', lastSuccessAt: new Date('2026-08-13T09:00:00Z'), observedAt: new Date('2026-08-13T09:00:00Z') }], new Date('2026-08-14T12:00:00Z')).cron.status).toBe('amber');
});
```

- [ ] **Step 2: Run the test and verify missing model**

Run: `npm test -- tests/unit/integration-health.test.ts`

Expected: FAIL with missing `health.ts`.

- [ ] **Step 3: Implement sanitized health rules**

Make red at zero credits; Anthropic red while breaker open; WhatsApp red at 5 failures in the last 20 attempts; Meta red after failed sync and amber when last success is over 26 hours; WooCommerce amber after 24 hours without webhook only when there were paid orders in the preceding seven-day baseline; cron amber after 26 hours and red after 48. Missing evidence is `unknown`, never green.

- [ ] **Step 4: Upsert heartbeats at existing integration boundaries**

Conversation events update Make/WhatsApp observation metadata; marketing sync updates Meta/cron; payment events update WooCommerce; Wedding Tales health payload updates Anthropic. Store only counts, stable error codes, timestamps, and scenario IDs—no tokens or payload bodies.

- [ ] **Step 5: Run health and automation tests**

Run: `npm test -- tests/unit/integration-health.test.ts tests/unit/conversation-pulse.test.ts tests/integration/marketing-sync-cron.test.ts`

Expected: PASS; a stale/missing source cannot display green.

- [ ] **Step 6: Commit the task**

Commit message: `feat(sales-manager): report truthful integration health`

---

### Task 5: Sales Manager Reader and Mobile UI

**Files:**
- Create: `src/lib/sales-manager/reader.ts`
- Create: `src/app/(protected)/sales-manager/page.tsx`
- Create: `src/components/sales-manager/sales-manager-workbench.tsx`
- Create: `tests/components/sales-manager-workbench.test.tsx`
- Modify: `src/components/layout/app-shell.tsx`
- Modify: `src/app/globals.css`

**Interfaces:**
- Consumes: queue items, 7/30/90-day funnel, package economics, experiment/media rows, and system health.
- Produces: `getSalesManagerWorkbench(period)` and responsive `SalesManagerWorkbench`.

- [ ] **Step 1: Write failing component tests**

```tsx
it('renders the closing queue and only a WhatsApp contact action', () => {
  render(<SalesManagerWorkbench {...fixture} />);
  expect(screen.getByRole('heading', { name: 'מה סוגרים עכשיו' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'פתחו ב‑WhatsApp' })).toHaveAttribute('href', 'https://wa.me/972500000001');
  expect(screen.queryByText(/חיוג|התקשר/)).not.toBeInTheDocument();
});

it('labels missing costs as unknown rather than profit', () => {
  render(<SalesManagerWorkbench {...fixtureWithMissingCost} />);
  expect(screen.getByText('רווח תרומה: חסרים נתוני עלות')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the test and verify missing component**

Run: `npm test -- tests/components/sales-manager-workbench.test.tsx`

Expected: FAIL with missing component.

- [ ] **Step 3: Build the reader view model**

Load data concurrently. Return:

```ts
type SalesManagerView = {
  period: { days: 7 | 30 | 90; from: string; through: string };
  headline: { openLeads: number; needChatNow: number; verifiedPayments: number; verifiedRevenueAgorot: number; contributionAgorot: number | null };
  queue: ClosingQueueItem[];
  funnel: Array<{ key: string; label: string; count: number; conversionFromPrior: number | null }>;
  packages: Array<{ packageId: string; paidOrders: number; revenueAgorot: number; contributionAgorot: number | null }>;
  experiments: Array<{ variant: string; leads: number; secondReplyRate: number | null; verifiedWinRate: number | null; enough: boolean }>;
  media: Array<{ key: string; sends: number; replies: number; wins: number; rateVisible: boolean }>;
  health: Record<string, SystemHealth>;
  campaigns: MarketingFunnelRow[];
};
```

- [ ] **Step 4: Build the responsive UI**

Desktop order: headline strip → closing queue → funnel and health side-by-side → packages → campaigns → experiments/media. Mobile order: `צריך אותי עכשיו` queue first, then headline, funnel, health, packages, campaigns. Use semantic tables on desktop and card rows below 720px; filters stay sticky; no horizontal page scroll; every amount clearly labels verified revenue versus Meta-reported value.

- [ ] **Step 5: Add navigation and empty/error states**

Add `{ href: '/sales-manager', label: 'מנהל מכירות' }` immediately after WhatsApp leads. Empty queue copy: `אין כרגע שיחות שדורשות טיפול ידני.` Unknown health copy names the missing source and never says connected.

- [ ] **Step 6: Run component and page verification**

Run: `npm test -- tests/components/sales-manager-workbench.test.tsx tests/components/analytics-workbench.test.tsx`

Run: `npm run build`

Expected: PASS; server page is protected by the existing layout/auth boundary.

- [ ] **Step 7: Commit the task**

Commit message: `feat(sales-manager): add the mobile revenue control room`

---

### Task 6: Audited Chat Actions

**Files:**
- Create: `src/lib/sales-manager/wedding-tales-client.ts`
- Create: `src/lib/sales-manager/action-handler.ts`
- Create: `src/app/api/sales-manager/actions/route.ts`
- Create: `tests/integration/sales-manager-action-route.test.ts`
- Modify: `src/components/sales-manager/sales-manager-workbench.tsx`

**Interfaces:**
- Consumes: authenticated request `{ idempotencyKey, leadId, action, followUpAt?, reason? }`; actions `take_over_chat`, `resume_bot`, `snooze`, `mark_lost`; feature flag `SALES_MANAGER_ACTIONS_ENABLED`.
- Produces: signed request to Wedding Tales control endpoint, one `customerEvents` audit row, and an idempotent HTTP response.

- [ ] **Step 1: Write failing auth/idempotency tests**

```ts
it('requires an authenticated owner and executes one chat action once', async () => {
  const execute = vi.fn().mockResolvedValue({ ok: true });
  const record = vi.fn().mockResolvedValue(undefined);
  const handler = createSalesManagerActionHandler({ requireUser: async () => ({ email: 'owner@example.com' }), execute, record });
  const request = new Request('https://test/actions', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ idempotencyKey: 'lead-1:take:1', leadId: 'lead-1', action: 'take_over_chat' }) });
  expect((await handler(request)).status).toBe(200);
  expect(execute).toHaveBeenCalledTimes(1);
  expect(record).toHaveBeenCalledWith(expect.objectContaining({ actor: 'owner@example.com', action: 'take_over_chat' }));
});
```

- [ ] **Step 2: Run test and verify missing handler**

Run: `npm test -- tests/integration/sales-manager-action-route.test.ts`

Expected: FAIL with missing handler.

- [ ] **Step 3: Implement strict action validation**

`take_over_chat` sets human handoff; `resume_bot` clears it; `snooze` requires an ISO date within 30 days; `mark_lost` requires a reason from `price`, `timing`, `not_fit`, `no_response`, `chose_other`, or `other`. Reject unknown fields and cap identifiers/reasons. No action sends a message automatically.

When `SALES_MANAGER_ACTIONS_ENABLED !== 'true'`, return HTTP 409 `{ error: 'SHADOW_MODE' }` before creating an audit or calling Wedding Tales. The WhatsApp deep link remains usable during shadow mode.

- [ ] **Step 4: Implement the signed client and idempotent audit**

POST to `${WEDDING_TALES_URL}/api/sales-agent/control` with `x-sales-agent-secret`. Use an 8-second timeout. Insert an audit `customerEvents` row with external key `sales-action:${idempotencyKey}` before execution; on conflict return the recorded result. Update the row outcome with a second append-only result event rather than mutating evidence.

- [ ] **Step 5: Add UI controls**

Queue rows expose `קח את השיחה`, `החזר לבוט`, `דחה פולו־אפ`, `סמן שלא נסגר`, and `פתחו ב‑WhatsApp`. Destructive `mark_lost` requires an inline reason and confirmation; no phone/call button exists.

- [ ] **Step 6: Run action and component tests**

Run: `npm test -- tests/integration/sales-manager-action-route.test.ts tests/components/sales-manager-workbench.test.tsx`

Expected: PASS; double submission executes one Wedding Tales request.

- [ ] **Step 7: Commit the task**

Commit message: `feat(sales-manager): control chat handoffs with an audit trail`

---

### Task 7: Harden Campaign Guardrails with Verified Outcomes

**Files:**
- Modify: `src/lib/marketing/action-service.ts`
- Modify: `src/lib/marketing/action-handler.ts`
- Modify: `tests/unit/marketing-action.test.ts`
- Modify: `tests/integration/marketing-action-route.test.ts`

**Interfaces:**
- Consumes: verified paid count, attribution coverage, contribution, integration health, current/proposed budget.
- Produces: explicit guardrail result `{ allowed, reasons, maxBudgetAgorot }`; proposed changes remain approval-gated.

- [ ] **Step 1: Add failing guardrail tests**

```ts
it('blocks scale when any revenue-quality gate is missing', () => {
  expect(evaluateScaleGuardrails({ paidOrders: 3, attributionCoverage: 0.70, contributionAgorot: 100000, integrationFault: false, currentBudgetAgorot: 10000, proposedBudgetAgorot: 11000 }))
    .toMatchObject({ allowed: false, reasons: ['ATTRIBUTION_COVERAGE_TOO_LOW'] });
});

it('caps an otherwise valid increase at fifteen percent', () => {
  expect(evaluateScaleGuardrails({ paidOrders: 4, attributionCoverage: 0.8, contributionAgorot: 100000, integrationFault: false, currentBudgetAgorot: 10000, proposedBudgetAgorot: 13000 }))
    .toMatchObject({ allowed: false, maxBudgetAgorot: 11500, reasons: ['CHANGE_EXCEEDS_15_PERCENT'] });
});
```

- [ ] **Step 2: Run tests to show current weak guardrails**

Run: `npm test -- tests/unit/marketing-action.test.ts tests/integration/marketing-action-route.test.ts`

Expected: FAIL because current action service lacks the full outcome gates.

- [ ] **Step 3: Implement guardrails and evidence snapshot**

Use strict `> 0.70` coverage and `>= 3` payments. Any red health for Meta, WooCommerce, WhatsApp, or attribution ingestion blocks scale. Store the exact evidence values and reason codes in `marketingActions.guardrailResult` before approval. A stop-loss remains `proposed`; execution still requires authenticated approval.

- [ ] **Step 4: Run marketing regression tests**

Run: `npm test -- tests/unit/marketing-action.test.ts tests/integration/marketing-action-route.test.ts tests/unit/marketing-funnel.test.ts`

Expected: PASS and no existing pause action executes without approval.

- [ ] **Step 5: Commit the task**

Commit message: `fix(marketing): require verified profit before scaling`

---

### Task 8: Production Migration, Responsive QA, and Smoke Test

**Files:**
- Modify only when verification identifies a concrete defect in Tasks 1–7.

**Interfaces:**
- Consumes: deployed Wedding Tales events, BusinessOS database, Meta snapshots, and synthetic WhatsApp/Woo events.
- Produces: a verified 7/30/90-day sales manager and action audit.

- [ ] **Step 1: Run the entire BusinessOS test suite**

Run: `npm test`

Expected: all tests PASS.

- [ ] **Step 2: Run production-quality build**

Run: `npm run build`

Expected: exit 0 with no type or route errors.

- [ ] **Step 3: Apply additive schemas**

Run: `npm run db:push:whatsapp-leads`

Run: `npm run db:push:marketing`

Expected: both scripts print successful completion; rerunning them makes no changes and produces no error.

- [ ] **Step 4: Deploy and inspect mobile layouts**

Open `/sales-manager` at 360×800, 390×844, 768×1024, and desktop 1440×900. Verify queue first on mobile, readable RTL order, 44px actions, no horizontal page scroll, no clipped currency, visible focus, and no call controls.

- [ ] **Step 5: Send synthetic funnel events**

Send one lead through created → replied → demo → offer → ready-to-pay → payment-link-clicked → checkout-started. Verify funnel counts once, queue bucket `checkout_blocked`, and revenue zero. Send `payment_verified`; verify queue removal, paid count one, verified revenue, and contribution still `null` until costs are verified.

- [ ] **Step 6: Run a 24-hour shadow period**

Deploy with `SALES_MANAGER_ACTIONS_ENABLED=false`. During 24 hours, compare queue entries with the actual WhatsApp inbox, verify no lead is duplicated or missing, confirm all button submissions return `SHADOW_MODE`, and make no campaign budget changes. Resolve data-contract defects before enabling actions.

- [ ] **Step 7: Verify health and campaign safety**

Set a synthetic Make heartbeat with zero credits and verify red. Attempt a scale proposal with two purchases and verify blocked. Attempt with three purchases, 71% attribution, positive verified contribution, green health, and a 16% increase; verify blocked at 15%.

- [ ] **Step 8: Enable chat actions and record final deployment evidence**

After the shadow comparison passes, set `SALES_MANAGER_ACTIONS_ENABLED=true`, redeploy, execute one synthetic `snooze`, and verify its audit trail. Capture deployment URL, commit SHA, migration output, test summary, and synthetic event IDs in the release handoff; do not include secrets, raw phones, or message text.

---

## Plan Acceptance Checklist

- [ ] `/sales-manager` is useful at 360px and has no dialing UI.
- [ ] The queue explains why each chat needs attention and what the next action is.
- [ ] Funnel stages use unique leads and verified payments.
- [ ] Pending checkout never appears as income.
- [ ] Missing costs display `חסרים נתוני עלות`, not profit.
- [ ] Make/Anthropic/WhatsApp/Meta/Woo/cron cannot show green without evidence.
- [ ] Chat controls are authenticated, idempotent, and audited.
- [ ] Scaling is blocked below 3 attributed payments, at or below 70% coverage, with unknown/non-positive contribution, on health failure, or above 15% change.
- [ ] Full tests, build, migrations, mobile QA, and synthetic smoke tests pass before handoff.
