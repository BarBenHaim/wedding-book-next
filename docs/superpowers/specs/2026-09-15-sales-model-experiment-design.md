# Sales Model Experiment and Revenue Control — Design

**Date:** 2026-09-15  
**Status:** Approved in chat for design; pending written-spec review  
**Business objective:** move toward at least two verified Wedding Tales book purchases per Israel day, without phone calls, spam, invented offers, or unsafe WhatsApp delivery.

## 1. Outcome and operating principle

The system must optimize for verified purchases and verified revenue, not for message volume or attractive model prose. At roughly ten new WhatsApp conversations per day, two purchases per day implies an ambitious 20% lead-to-paid conversion target. The product will display this as a target and measure the rolling result honestly; it will not represent the target as a guarantee.

Changing providers globally by day would confound model quality with lead quality, weekday, campaign mix, and opening variant. Instead, the system will first run a private offline evaluation on redacted historical conversation states and then run a sticky 80/20 champion–challenger experiment on live, eligible AI turns.

The deterministic opening experiment remains separate. During the live model experiment, opening copy, media, prices, catalog facts, and follow-up policy remain fixed so a measured difference can reasonably be attributed to the model.

## 2. Scope

### In scope

- Evaluate the configured Gemini, Anthropic, and OpenAI sales models on the same redacted historical cases without sending customer messages.
- Select the two strongest candidates for a live 80/20 experiment.
- Assign each eligible lead deterministically and keep that lead on the same model for the experiment revision.
- Attribute delivery, reply, meaningful progression, checkout intent, verified payment, verified revenue, provider failures, latency, and model cost to the assigned arm.
- Display the experiment, revenue target, guardrails, and verdict in BusinessOS.
- Pause an unsafe/unavailable arm and route future eligible leads to the healthy arm without rewriting historical attribution.
- Send the owner privacy-safe operational updates through WhatsApp when Meta permits the approved template path.

### Out of scope

- Training or fine-tuning a foundation model.
- Allowing a model to invent prices, discounts, product facts, urgency, or availability.
- Changing campaign targeting, opening creative, price, and model simultaneously.
- Calling leads, bulk-resurrecting old conversations, or bypassing WhatsApp’s 24-hour/template rules.
- Claiming that two sales per day is guaranteed.

## 3. Experiment stages

### Stage A — redacted historical benchmark

Build a stratified set of historical states across new inquiry, product question, price objection, event detail, checkout intent, stalled lead, and handoff. The initial configured candidates are Gemini 3.6 Flash, Claude Sonnet 4.5, and GPT-4.1 mini; Claude Haiku remains a reliability fallback rather than an efficacy arm. Each case contains only the minimum recent context required to answer. Names, phone numbers, email addresses, order IDs, external URLs, and other direct identifiers are removed before any provider call.

Every candidate receives the same system policy, catalog, media metadata, and case. No output is sent to WhatsApp. Raw candidate text is held only in memory for scoring and is not written to analytics. Persist only a random case identifier, provider/model identifiers, timing/cost, fixed safety results, action classification, and aggregate rubric scores.

Scoring combines deterministic checks and outcome-aware checks:

- valid structured output and successful completion;
- catalog/price accuracy and no unsupported promise;
- no phone-call offer and no policy breach;
- one clear next action appropriate to the customer intent;
- correct escalation when facts are missing;
- concise, natural Hebrew and no repetitive/spam pattern;
- alignment with the next useful transition observed in successful historical cases;
- latency, error rate, and cost.

The benchmark recommends two candidates. It cannot declare a revenue winner because it did not interact with live customers.

### Stage B — live champion–challenger

The benchmark winner starts at 80%; the runner-up starts at 20%. Assignment is a deterministic hash of experiment ID, revision, and normalized lead ID. The assignment is persisted before the first eligible provider call and is immutable for that lead/revision.

The static opening journey is not a model sample. Enrollment begins on the first inbound turn that reaches the AI sales path. Retries, duplicate webhooks, JSON repair calls, and provider fallbacks do not create a new assignment or sample.

If the assigned provider is unavailable, the existing safe fallback may answer, but that exchange is marked as fallback-contaminated and excluded from efficacy comparison. Delivery and safety statistics still include it.

### Stage C — decision and allocation

No arm is promoted solely because of a short-term reply-rate lead. A normal winner decision requires at least 30 delivered primary-model exchanges per arm, at least seven Israel days of exposure, no safety guardrail breach, and a material improvement in verified purchase rate or verified revenue per eligible lead. Until those conditions are met, the UI says “insufficient evidence.”

The system may immediately pause an arm for operational safety, but it may not automatically publish new text, prices, discounts, media, or campaign changes. After a model winner is selected, offer and creative experiments run as separate revisions.

## 4. Runtime architecture

### Wedding Tales

Add a model-experiment policy module with pure functions for validation, revisioning, sticky allocation, eligibility, guardrails, and verdicts. Extend sales settings with one active experiment snapshot:

```text
id, revision, enabled, targetVerifiedSalesPerDay,
championArmId,
arms[{ id, provider, model, weight, enabled }],
minimumDeliveredPerArm, minimumDays
```

Only models in the server registry are accepted, and an arm cannot be activated unless its server-side credential exists. Deleted/re-added arm IDs receive a new lineage revision so historical cohorts are never pooled into a changed model.

Before the provider call, the reply route resolves or creates the lead’s assignment inside the existing claim/fencing boundary. Successful completion persists the assignment snapshot, actual provider/model, whether fallback occurred, latency bucket, and cost reference with the exchange. No customer text is copied into the experiment ledger.

The provider circuit breaker becomes provider/model scoped. An OpenAI outage must not open the Gemini circuit, and a stale half-open probe must remain fenced as in the current reliability design.

The verified-payment reconciliation path attaches a purchase to the immutable model assignment already stored on the matched lead. Unmatched or ambiguous purchases remain unattributed rather than guessed.

### BusinessOS

Add a “מודלים ומכירות” section to the sales control center showing:

- current champion/challenger and 80/20 allocation;
- eligible, attempted, delivered, replied, progressed, checkout-intent, and verified-paid counts;
- verified revenue, model cost, revenue per eligible lead, and cost per verified purchase;
- provider failure/fallback rate and latency;
- rolling verified sales per Israel day versus the target of two;
- benchmark recommendation, live verdict, sample sufficiency, and any paused-arm reason.

Publishing uses optimistic revision checks and a server-owned model/credential allowlist. The UI may pause/resume an arm or publish an allocation; after the evidence gate, the autonomous controller may publish a recommended allocation through the same audited boundary. Neither path can directly edit historical assignments or revenue.

## 5. Metrics and truth rules

The primary metric is `verified payments / eligible assigned leads`. Verified revenue comes only from the existing reconciled purchase truth. Secondary metrics are:

- delivered primary-model response rate;
- customer reply within 24 hours;
- meaningful progression (event details, requested media, checkout intent, or another policy-defined step);
- ready-to-pay rate;
- handoff and provider-fallback rates;
- median/p95 latency and estimated provider cost.

A lead counts once per experiment revision. Duplicate inbound events, repairs, retries, follow-ups, and delivery callbacks update the same cohort record. Accepted WhatsApp transport is not treated as delivered; delivered/read callbacks retain their current truth semantics.

The two-sales target is calculated from verified purchases using Israel calendar days and shown as daily and rolling-seven-day performance. The dashboard must distinguish “target met” from statistical model evidence.

## 6. Safety and automatic actions

The experiment never weakens the existing immutable sales policy. Every arm is subject to the same deterministic next-action policy, catalog facts, media allowlist, exactly-once inbound handling, delivery acknowledgement, privacy rules, and no-call rule.

An arm is automatically paused for new assignments when a bounded recent window shows a severe operational issue such as repeated provider rejection/timeouts, invalid structured output, or policy-validation failure. Existing conversations either use the healthy fallback with contamination marked or enter the existing truthful human-handoff path. No queued inbound is deleted.

Automatic promotion is deliberately conservative. The system records a recommendation first; after the evidence gate it may publish the recommended allocation without waiting for a human response, but only through the same versioned settings boundary with an audit record and rollback snapshot.

## 7. Owner updates on WhatsApp

The owner phone is supplied only through `SALES_AGENT_OWNER_PHONE`; it is never committed, returned by an API, logged, or shown in test fixtures.

Routine status is capped at one digest per Israel day. Immediate updates are limited to:

- a sustained sales-transport outage and its verified recovery;
- an experiment arm being automatically paused;
- enough evidence for a winner recommendation or a published winner;
- the daily verified-purchase target being reached.

Outside the 24-hour service window, messages use only an approved Meta template. If the template or management permission is unavailable, the system records the update in BusinessOS/Codex and sends nothing; it does not attempt illegal free-form delivery. Customer PII, conversation text, access tokens, provider bodies, and queue IDs are never included.

## 8. Failure behavior

- Missing candidate credential: reject publication or mark the offline candidate unavailable; do not enroll live leads.
- Benchmark provider failure: record a normalized code and continue other candidates.
- Live provider outage: provider/model-scoped circuit, fenced fallback, and contaminated-sample marking.
- Analytics write failure after provider acceptance: preserve provider truth and return a repair marker; never convert accepted delivery into a send failure.
- Ambiguous payment match: leave unattributed and expose the count as a data-quality gap.
- Stale settings write: return conflict and require a fresh read; never overwrite a newer experiment.
- Meta status-template failure: record normalized failure and keep sales delivery independent.

## 9. Testing and rollout

Implementation follows RED–GREEN TDD. Required coverage includes:

- deterministic/sticky allocation and exact 80/20 distribution;
- arm lineage across deletion, re-addition, and model changes;
- no enrollment for deterministic opening-only turns;
- retry/duplicate/fallback attribution;
- provider/model circuit isolation and fencing;
- atomic assignment plus successful exchange persistence;
- delivery truth and verified-payment attribution;
- zero PII in benchmark records, experiment APIs, logs, and owner updates;
- guardrail pause and conservative winner rules;
- BusinessOS revision conflicts and honest insufficient-sample states;
- routine/critical WhatsApp notification rate limits and template-only behavior.

Rollout order:

1. Deploy schema-compatible readers and analytics with the experiment disabled.
2. Run the redacted historical benchmark; no customer messages.
3. Review the automated safety report and select two configured candidates.
4. Publish the 80/20 live experiment while keeping opening route B and all offer inputs fixed.
5. Monitor delivery, safety, revenue truth, and the two-sales-per-day target.
6. Recommend or publish a winner only after the evidence threshold; retain one-click rollback.

## 10. Acceptance criteria

- The same lead never changes assigned arm within an experiment revision.
- No offline evaluation sends a WhatsApp message or stores raw candidate/customer text.
- Live efficacy excludes fallback-contaminated exchanges and unverified payments.
- BusinessOS can explain every numerator, denominator, exclusion, and verdict.
- A provider outage cannot disable another provider’s circuit.
- No new path can call a lead, invent an offer, delete a queue, or bypass WhatsApp policy.
- Owner status messages are privacy-safe, rate-limited, and template-compliant.
- The dashboard reports verified sales/day versus two, without promising the target will be achieved.
