# Conversation Decision Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace prompt-only sales behavior with a deterministic next-action contract that produces concise WhatsApp replies and prevents the failures found in historical conversations.

**Architecture:** A new pure decision module classifies intent and selects one next action from known lead state. The language model still writes natural Hebrew, but a post-model guard enforces message, question, repetition, payment-link, terminal, and handoff rules before persistence and delivery.

**Tech Stack:** JavaScript, Next.js App Router, existing salesAgent modules, Vitest, Anthropic/OpenAI provider abstraction.

**Spec:** `docs/superpowers/specs/2026-08-16-conversation-learned-sales-bot-design.md`

## Global Constraints

- WhatsApp chat only: no phone calls, call offers, callbacks, or dialing tasks.
- One customer-facing message per turn, no more than 180 characters and one question mark.
- Answer a direct price/demo/process question before asking for information.
- Never ask for event type, event date, celebrant, package, or customer name when the lead already contains it.
- Never resend a payment link unless the inbound message explicitly requests the link again.
- Existing customer, active human handoff, and terminal loss do not enter the model sales path.
- All fixture identities are synthetic and non-dialable.
- Preserve the user modification in `src/app/landing/LandingClient.jsx`.

---

### Task 1: Pure intent and next-best-action policy

**Files:**
- Create: `src/lib/salesAgent/decisionPolicy.js`
- Create: `tests/salesDecisionPolicy.test.js`

**Interfaces:**
- Consumes: `{ lead, incomingText, isExistingCustomer }`.
- Produces: `detectSalesIntent(text)` and `decideSalesTurn(input)` returning `{ conversationKind, intent, nextBestAction, maxMessages: 1, maxChars: 180, maxQuestions: 1, knownFacts, forbiddenRepeats }`.

- [ ] **Step 1: Write the failing decision table**

```js
import { describe, expect, it } from 'vitest'
import { decideSalesTurn } from '@/lib/salesAgent/decisionPolicy'

describe('decideSalesTurn', () => {
  it.each([
    ['price', 'כמה זה עולה?', {}, 'answer'],
    ['demo', 'אפשר לראות דוגמה?', {}, 'show_proof'],
    ['positive_signal', 'וואו זה נראה אש', { eventType: 'bar_mitzvah' }, 'recommend_package'],
    ['payment_intent', 'אני רוצה להזמין את המודפס', {}, 'send_payment_link'],
    ['payment_intent', 'לא הצלחתי להשלים', { paymentLinkSentAt: 1 }, 'diagnose_checkout'],
    ['negative_exit', 'החלטנו לוותר תודה', {}, 'close_lost'],
  ])('%s chooses %s', (intent, incomingText, lead, nextBestAction) => {
    expect(decideSalesTurn({ incomingText, lead })).toMatchObject({ intent, nextBestAction })
  })

  it('does not ask for known event facts again', () => {
    const decision = decideSalesTurn({ incomingText: 'אפשר עוד פרטים?', lead: { eventType: 'bar_mitzvah', eventDate: '2026-11-05' } })
    expect(decision.knownFacts).toEqual(expect.arrayContaining(['eventType', 'eventDate']))
    expect(decision.forbiddenRepeats).toEqual(expect.arrayContaining(['eventType', 'eventDate']))
  })
})
```

- [ ] **Step 2: Run RED**

Run: `npx vitest run tests/salesDecisionPolicy.test.js`

Expected: FAIL because `decisionPolicy.js` does not exist.

- [ ] **Step 3: Implement the minimal decision module**

Use ordered recognition so payment intent beats generic price and a negative exit beats handoff language:

```js
export const TURN_LIMITS = Object.freeze({ maxMessages: 1, maxChars: 180, maxQuestions: 1 })

export function detectSalesIntent(text = '') {
  const value = String(text).trim().toLowerCase()
  if (/ויתר|לא רלוונט|לא מעוניינ|החלטנו שלא/.test(value)) return 'negative_exit'
  if (/לא הצלח|בעיה.*תשלום|תקלה.*תשלום/.test(value)) return 'payment_intent'
  if (/רוצה להזמין|איך משלמ|קישור.*תשלום|אקח את/.test(value)) return 'payment_intent'
  if (/מחיר|כמה.*עולה|עלות|חבילות/.test(value)) return 'price'
  if (/דוגמ|תמונה|סרטון|לראות/.test(value)) return 'demo'
  if (/וואו|מדהים|אהבתי|נראה.*אש|מושלם/.test(value)) return 'positive_signal'
  if (/יקר|להתייעץ|לחשוב|רחוק/.test(value)) return 'objection'
  return 'general'
}
```

`decideSalesTurn` must set `diagnose_checkout` when a payment link was already sent, `close_lost` on a clean exit, `show_proof` on a demo request, and `answer` on a direct price question. Known lead fields populate `knownFacts` and `forbiddenRepeats`.

- [ ] **Step 4: Run GREEN**

Run: `npx vitest run tests/salesDecisionPolicy.test.js`

Expected: PASS.

- [ ] **Step 5: Commit the decision module**

```bash
git add src/lib/salesAgent/decisionPolicy.js tests/salesDecisionPolicy.test.js
git commit -m "feat(sales): choose one deterministic next action"
```

### Task 2: Deterministic reply contract

**Files:**
- Modify: `src/lib/salesAgent/decisionPolicy.js`
- Modify: `tests/salesDecisionPolicy.test.js`
- Modify: `src/lib/salesAgent/prompt.js`
- Modify: `tests/salesAgent.test.js`

**Interfaces:**
- Consumes: parsed model result, `TurnDecision`, incoming text, lead, and catalog package links.
- Produces: `enforceSalesReply({ parsed, decision, lead, incomingText }): parsed` with one concise message and truthful stage/action fields.

- [ ] **Step 1: Add failing contract tests**

Cover all of these exact outcomes:

```js
expect(enforceSalesReply({ parsed: { messages: ['א', 'ב'], stage: 'engaged' }, decision, lead: {} }).messages).toHaveLength(1)
expect(result.messages[0].length).toBeLessThanOrEqual(180)
expect((result.messages[0].match(/\?/g) || [])).toHaveLength(1)
expect(repeatedEventQuestion.messages[0]).not.toMatch(/איזה אירוע|מתי האירוע/)
expect(repeatedPaymentLink.messages[0]).not.toContain(knownCheckoutUrl)
expect(cleanLoss).toMatchObject({ stage: 'closed_lost', handoff: false })
expect(activeHandoff).toMatchObject({ messages: [], noReply: true })
```

Add a prompt assertion that the serialized `TurnDecision` contains the exact `nextBestAction`, known facts, forbidden repeats, and limits. Assert the prompt still excludes every call-offer directive.

- [ ] **Step 2: Run RED**

Run: `npx vitest run tests/salesDecisionPolicy.test.js tests/salesAgent.test.js`

Expected: FAIL on missing `enforceSalesReply` and missing turn-contract prompt block.

- [ ] **Step 3: Implement the guard and prompt block**

The guard must:

```js
const first = String(parsed.messages?.[0] || '').trim()
const oneLine = first.replace(/\s*\n+\s*/g, ' ').slice(0, decision.maxChars).trim()
const oneQuestion = keepFirstQuestionOnly(oneLine)
```

It must replace a model response with deterministic catalog-backed text for `price` when no numeric price exists, remove a repeated checkout URL when `paymentLinkSentAt` exists and the customer did not request the link, force `closed_lost` without handoff on `negative_exit`, and return zero messages for an already-active handoff. Do not truncate a URL; if the first 180 characters would cut a URL, use the deterministic catalog response for that action.

- [ ] **Step 4: Run focused GREEN**

Run: `npx vitest run tests/salesDecisionPolicy.test.js tests/salesAgent.test.js tests/salesSelling.test.js`

Expected: PASS.

- [ ] **Step 5: Commit the reply contract**

```bash
git add src/lib/salesAgent/decisionPolicy.js src/lib/salesAgent/prompt.js tests/salesDecisionPolicy.test.js tests/salesAgent.test.js
git commit -m "feat(sales): enforce concise answer-first replies"
```

### Task 3: Route the decision through the live sales path

**Files:**
- Modify: `src/app/api/sales-agent/reply/route.js`
- Modify: `tests/salesReplyRoute.test.js`

**Interfaces:**
- Consumes: `decideSalesTurn` before `buildSystemPrompt` and `enforceSalesReply` after `parseAgentJson`/existing price and media repairs.
- Produces: persisted exchange and transport payload that both reflect the enforced reply.

- [ ] **Step 1: Add failing route cases**

Add route-level tests for price, known event facts, positive signal, payment link already sent, clean loss, active handoff, and existing customer. Each test must assert provider call count, send count, stage, handoff flag, and persisted exchange. The clean-loss case must assert no owner notification. The existing-customer and active-handoff cases must assert the decision model is not called.

- [ ] **Step 2: Run RED**

Run: `npx vitest run tests/salesReplyRoute.test.js -t "decision contract"`

Expected: FAIL because the route does not yet pass or enforce a `TurnDecision`.

- [ ] **Step 3: Wire the decision once**

```js
const decision = decideSalesTurn({ lead, incomingText: text, isExistingCustomer: false })
const system = buildSystemPrompt({ ...lead, daysSinceLastMessage, variant }, today, {
  media: library,
  performanceNote: perf,
  businessInstructions: settings.businessInstructions,
  activeOpeningIds: settings.activeOpeningIds,
  turnDecision: decision,
})
```

After the existing model parse, price repair, and media guard, call `enforceSalesReply`. Use the returned object for `completeSuccessfulExchange`, the response JSON, media selection, stage, follow-up, and owner notification. No pre-guard model text may be persisted or sent.

- [ ] **Step 4: Run route and persistence GREEN**

Run: `npx vitest run tests/salesReplyRoute.test.js tests/salesInboundEvents.test.js tests/salesDeliveryFirestore.test.js`

Expected: PASS.

- [ ] **Step 5: Commit route integration**

```bash
git add src/app/api/sales-agent/reply/route.js tests/salesReplyRoute.test.js
git commit -m "feat(sales): apply decision contract to live replies"
```

### Task 4: Replace active opening arms without rewriting history

**Files:**
- Modify: `src/lib/salesAgent/experiments.js`
- Modify: `src/lib/salesAgent/settings.js`
- Modify: `tests/salesExperiments.test.js`
- Modify: `tests/salesSettings.test.js`

**Interfaces:**
- Consumes: stable `assignVariant(phone, candidateIds)` behavior.
- Produces: active arms `answer_first` and `value_question`; all historical arms remain reportable but non-executable.

- [ ] **Step 1: Write failing arm tests**

```js
expect(ACTIVE_VARIANT_IDS).toEqual(['answer_first', 'value_question'])
expect(findActiveVariant('demo_first')).toBeNull()
expect(findActiveVariant('price_upfront')).toBeNull()
expect(findActiveVariant('question_first')).toBeNull()
expect(findVariant('demo_first')).not.toBeNull()
```

Hash 4,000 synthetic IDs and assert both active arms remain within 30% of the expected 2,000 assignments. Assert the default settings resolve to these two IDs.

- [ ] **Step 2: Run RED**

Run: `npx vitest run tests/salesExperiments.test.js tests/salesSettings.test.js`

Expected: FAIL because the current active set contains three historical arms.

- [ ] **Step 3: Add the two active definitions**

`answer_first` directive: answer the inbound request directly, offer one relevant next step, and ask nothing when the answer already gives a natural choice. `value_question` directive: one value sentence and one easy question only when the inbound request is general. Neither directive may mention a call.

- [ ] **Step 4: Run GREEN**

Run: `npx vitest run tests/salesExperiments.test.js tests/salesSettings.test.js tests/salesSettingsFirestore.test.js`

Expected: PASS.

- [ ] **Step 5: Commit the active experiment**

```bash
git add src/lib/salesAgent/experiments.js src/lib/salesAgent/settings.js tests/salesExperiments.test.js tests/salesSettings.test.js
git commit -m "feat(sales): test two answer-first openings"
```

### Task 5: Historical-pattern replay suite

**Files:**
- Create: `tests/fixtures/salesConversationPatterns.js`
- Create: `tests/salesConversationReplay.test.js`

**Interfaces:**
- Consumes: `decideSalesTurn` and `enforceSalesReply`.
- Produces: a privacy-safe regression suite for the eight observed failure patterns.

- [ ] **Step 1: Create synthetic fixtures**

Each fixture must use IDs such as `test-lead-price`, contain no digit run longer than four, contain no URL other than an explicit `https://example.invalid/checkout` sentinel, and define:

```js
{
  id: 'price-short',
  lead: { eventType: 'bar_mitzvah' },
  incomingText: 'כמה עולה הספר המודפס?',
  parsed: { messages: ['תשובת מודל ארוכה'], stage: 'engaged', handoff: false },
  expected: { intent: 'price', maxMessages: 1, maxQuestions: 1, stage: 'engaged' },
}
```

Create fixtures for price, demo, known facts, positive signal, payment friction, negative exit, existing customer, and active handoff.

- [ ] **Step 2: Write the table-driven test**

For every fixture assert the decision, enforced message count, character limit, question count, no phone-call wording, no repeated known fact, and expected stage/handoff behavior.

- [ ] **Step 3: Run the replay suite**

Run: `npx vitest run tests/salesConversationReplay.test.js`

Expected: PASS. If a fixture fails, change production policy rather than weakening the expected contract.

- [ ] **Step 4: Run the full sales regression group**

Run: `npx vitest run tests/salesAgent.test.js tests/salesConversation.test.js tests/salesJourney.test.js tests/salesSelling.test.js tests/salesDecisionPolicy.test.js tests/salesConversationReplay.test.js tests/salesReplyRoute.test.js tests/salesExperiments.test.js`

Expected: PASS.

- [ ] **Step 5: Commit replay evidence**

```bash
git add tests/fixtures/salesConversationPatterns.js tests/salesConversationReplay.test.js
git commit -m "test(sales): replay observed whatsapp failure patterns"
```
