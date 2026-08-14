# Task 5 report — truthful WhatsApp delivery acknowledgements

Status: implemented and locally verified on `revenue-chat-closer` from base `196a5ec7d6520613022cd06ac2f40f0919b958d8`.

## Binding decisions

- R2 is authoritative: `accepted` means provider evidence exists and creates a 30-minute pending window. It never increments `followUpCount`, writes `lastFollowUpAt`, moves `followUpAt`, or uses the word delivered.
- The first verified `delivered` or `read` callback advances the logical follow-up attempt. A later `read`, repeated `delivered`/`read`, or another transport result for the same logical attempt cannot advance it again.
- `failed` is terminal for that outbound ID, clears only the pending state owned by that outbound, stores one allowlisted code, and leaves the lead due. An expired pending window is converted to explicit stale-warning metadata before a retry.
- R3 is authoritative: outside the service window the customer transport is only `wt_followup`; the cron owner digest is only `wt_daily_digest`. Missing/unapproved/rejected template paths fail without free-form fallback.
- Direct Graph acceptance requires `messages[0].id`. Provider bodies are not parsed on rejection and never reach an exception or log. The request deadline is 12 seconds, below both route budgets.
- A delivery event document is metadata-only. The pending follow-up text stays in the existing lead CRM document until verified delivery, when it is appended to `turns`; it is removed on failure. Stable outbound document IDs contain a SHA-256 fragment rather than the lead phone.
- Task 6 Make wiring was deliberately not changed. Make remains a transport: Task 5 returns requested outbound/template metadata and exposes the authenticated acknowledgement endpoint for Task 6 to call.

## Acceptance map

| Acceptance item | Named evidence |
|---|---|
| Validation, identifier limits, allowed channels/statuses/error codes, provider evidence | `delivery event validation > accepts provider acceptance only with stable provider evidence`; `rejects accepted, delivered, and read events without a provider message ID`; `requires an allowlisted stable error code for failures`; `rejects unknown channels, statuses, invalid dates, and oversized identifiers` in `tests/salesDelivery.test.js` |
| Accepted is pending for 30 minutes and never advances | `delivery state transitions > turns provider acceptance into a 30-minute pending state without advancing`; `transactional follow-up delivery truth > accepted creates pending for 30 minutes but does not increment or move the cadence` |
| Pending suppresses retry, timeout becomes due/warning | `provider-pending suppression > suppresses a second follow-up only during the 30-minute accepted window`; `an expired pending attempt becomes a stored warning and a retry failure remains due` |
| Delivered/read exactly-once advancement | `delivery state transitions > advances once on delivered and never again on read or replay`; `delivered then read and replayed read advance the logical attempt once total` |
| Failed stays due and stores only stable code | `clears pending on failure, leaves the follow-up due, and makes failure terminal`; `failed clears pending, stores only a normalized code, and leaves the lead due` |
| Duplicate/replay/out-of-order/regression/provider/channel mismatch | `rejects provider/channel mismatches and out-of-order or regressive callbacks`; `rejects a provider ID mismatch transactionally without mutating either document`; `a late read for an older attempt cannot clear or hide a newer pending attempt` |
| Stable part IDs contain no phone | `stable outbound IDs > distinguishes parts and never embeds the raw lead identifier`; `uses free-form text inside an open service window and gives media its own phone-free outbound ID` |
| Authenticated acknowledgement route and explicit no-op | All five tests under `delivery acknowledgement route` in `tests/salesDeliveryRoute.test.js` (401, 400, 202/no-op, 409 mismatch, privacy-safe 503) |
| Direct Graph evidence, timeout, rejection privacy, missing evidence | All four tests under `direct WhatsApp Graph evidence` in `tests/salesWhatsApp.test.js` |
| `wt_followup`, no outside-window free-form/media fallback | `approved WhatsApp templates > sends wt_followup with one body parameter`; `truthful follow-up transport > uses only wt_followup outside the service window and records provider acceptance as pending` |
| Separate text/media results do not corrupt primary truth | `keeps primary acceptance pending when a separate image part fails` |
| Make requested-only handoff and dry-run truth | `prepares Make outbound metadata but waits for Make acknowledgement before marking pending`; `dry-run composes without creating delivery state or sending any transport` |
| `wt_daily_digest` success is accepted, never delivered | `scheduled owner digest delivery > uses only wt_daily_digest and reports provider acceptance, never delivery` |
| Missing owner/template/provider digest failure remains inspectable | `keeps the digest inspectable and stores digest_failed when the owner phone is missing`; `normalizes template rejection without exposing provider body or claiming delivery`; `owner digest health metadata > stores only normalized digest delivery metadata` |
| Owner `דוח` remains free-form on demand | Existing `the on-demand command > recognises דוח with no phone number` in `tests/salesDigest.test.js`; the reply command path was unchanged |
| No unapproved owner alert fallback | `keeps an owner handoff alert inspectable without a free-form cron send` |
| No call/dial action | No call/dial/task interface was added; new transports are WhatsApp text/image/template only. The changed-file scan contains no call-action implementation. |

## TDD evidence

Initial required RED:

```text
npx vitest run tests/salesDelivery.test.js
exit 1 — 1 failed suite, 0 tests collected
Error: Failed to load url ../src/lib/salesAgent/delivery ... Does the file exist?
```

Additional RED checkpoints, each before its production behavior:

```text
tests/salesDeliveryFirestore.test.js — exit 1, 5/5 failed: prepareFollowUpDelivery is not a function
tests/salesDeliveryRoute.test.js — exit 1, 5/5 failed: delivery/route module missing
tests/salesWhatsApp.test.js — exit 1, 7/7 failed: raw response returned, missing evidence accepted, raw errors, template function missing
tests/salesFollowupsRoute.test.js — exit 1, 5 failed: no template/prepare/ack behavior
tests/salesFollowupPolicy.test.js — exit 1, 2 failed: pendingFollowUpStatus is not a function
tests/salesDigestRoute.test.js — exit 1, 4/4 failed: no cron template delivery truth
tests/salesDeliveryFirestore.test.js — exit 1, digest metadata test: recordDigestOutcome is not a function
tests/salesFollowupsRoute.test.js — exit 1, 2 failed: outside-window media exposed and image failure regressed primary
tests/salesDeliveryFirestore.test.js — exit 1: late read overwrote newer pending status
tests/salesDelivery.test.js — exit 1: unsafe slash-bearing outbound ID accepted
tests/salesDelivery.test.js — exit 1: same event ID reused for a different status
tests/salesFollowupsRoute.test.js — exit 1: cron sent an unapproved free-form owner alert
tests/salesDeliveryFirestore.test.js — exit 1: delivery event stored message text
tests/salesDeliveryFirestore.test.js — exit 1: expired pending state did not become explicit warning metadata
```

GREEN checkpoints were run after each implementation. The final focused command and output were:

```text
npx vitest run tests/salesDelivery.test.js tests/salesDeliveryFirestore.test.js tests/salesDeliveryRoute.test.js tests/salesWhatsApp.test.js tests/salesFollowupsRoute.test.js tests/salesFollowupPolicy.test.js tests/salesSweep.test.js tests/salesDigest.test.js tests/salesDigestRoute.test.js
Test Files  9 passed (9)
Tests       115 passed (115)
exit 0
```

## Regression and repository verification

```text
npx vitest run tests/salesInboundEvents.test.js tests/salesInbound.test.js tests/salesExperiments.test.js tests/salesAgent.test.js tests/salesReplyRoute.test.js tests/salesCircuitBreaker.test.js tests/salesCircuitFirestore.test.js tests/salesConversation.test.js tests/salesAttribution.test.js tests/salesMediaGuard.test.js tests/salesMediaLibrary.test.js tests/salesSelling.test.js tests/salesLeadsView.test.js
Test Files  13 passed (13)
Tests       357 passed (357)
exit 0

npm test
Test Files  42 passed (42)
Tests       797 passed (797)
exit 0

npx eslint <15 changed JS files>
exit 0, no diagnostics

git diff --check
exit 0; only the repository's configured LF-to-CRLF working-copy notices were printed
```

## Files

Created:

- `src/lib/salesAgent/delivery.js`
- `src/app/api/sales-agent/delivery/route.js`
- `tests/salesDelivery.test.js`
- `tests/salesDeliveryFirestore.test.js`
- `tests/salesDeliveryRoute.test.js`
- `tests/salesWhatsApp.test.js`
- `tests/salesDigestRoute.test.js`
- this report

Modified:

- `src/lib/salesAgent/leads.js`
- `src/lib/salesAgent/whatsapp.js`
- `src/lib/salesAgent/followupPolicy.js`
- `src/app/api/sales-agent/followups/route.js`
- `src/app/api/sales-agent/digest/route.js`
- `tests/salesFollowupPolicy.test.js`
- `tests/salesFollowupsRoute.test.js`

## Privacy and security

- The delivery endpoint rejects a missing/wrong `x-sales-agent-secret` before state access.
- Input identifiers are capped at 500 characters; Firestore outbound document IDs reject `/`.
- Error output is a small allowlist. Graph response bodies, request payloads, tokens, recipient identifiers, transcript text, and caught exception messages are not logged or returned.
- Delivery/runtime documents contain operational metadata only. Follow-up text remains in the existing restricted lead CRM document and moves into its transcript only after verified delivery.
- Tests use synthetic, non-dialable sentinels; no live phone, token, provider payload, or secret is present.

## External concerns / deferred work

- Meta must approve/configure `wt_followup` and `wt_daily_digest`; rejection remains visible and has no free-form fallback.
- Task 6 still must patch Make scenario `9630287` to post accepted/delivered/read/failed callbacks and map the returned template/outbound-part metadata. This task intentionally did not mutate Make.
- A direct Graph send is truthfully only `accepted` until the existing WhatsApp status-webhook transport posts `delivered` or `read`; without that Task 6 wiring, the 30-minute pending state expires and becomes due/stale rather than silently advancing.

## Fix round 1/5 — review findings

Status: implemented and verified after review of commit `97ed8d8c23cbfe1a3b98c9342e990c824a49b56f`.

### Corrected state-machine decisions

- The first verified success is either `delivered` or `read`, directly from `requested` or after `accepted`. It transactionally binds the first provider message ID and advances the logical follow-up exactly once. `delivered -> read` updates status without advancing again; `read -> delivered` is a claimed stale no-op. Identical callback replays are global no-ops.
- Before direct Graph transport, an advancing follow-up owns a two-minute `requested` lease on the lead. The lease is explicitly not acceptance or delivery and does not move cadence. It prevents an immediate duplicate send after Graph evidence if acceptance persistence is temporarily unavailable; expiry becomes `stale-requested` warning metadata and permits repair/retry.
- Once Graph returns `messages[0].id`, transport truth is immutable: later acknowledgement or operational-health persistence failures return `accepted: true` with degradation flags. They never synthesize a provider failure or clear the requested claim. The response includes a privacy-safe callback event and authenticated repair endpoint.
- Delivery event IDs use a separate `sales_delivery_event_ids/{sha256(eventId)}` ledger claimed in the same Firestore transaction as the delivery transition. Its canonical SHA-256 fingerprint covers outbound ID, channel, status, provider message ID, and normalized error code, but not callback timestamp. An identical global replay is a no-op; any changed identity is `EVENT_ID_CONFLICT`. A transaction rollback leaves neither transition nor claim. Valid stale callbacks are claimed as no-ops; rejected regressions are not claimed.
- A scheduled digest atomically creates its deterministic `requested` attempt before Graph. Existing requested/in-progress-equivalent, accepted, delivered, read, or failed attempts never send again. Authenticated `?attempt=N` is the explicit intentional-retry seam and creates a distinct outbound ID. Graph acceptance and digest-health metadata are persisted independently.

### Acceptance mapping

| Review acceptance item | Named test evidence |
|---|---|
| Requested/accepted to first delivered or read; one advancement; late/replayed ordering | `delivery state transitions > allows delivered or read to be the first verified success and advances once`; `transactional follow-up delivery truth > requested/accepted to first verified delivered/read binds provider identity and advances exactly once`; `delivered then read and replayed read advance the logical attempt once total` |
| Requested lease before transport; active suppression; expired warning; acceptance clears lease | `provider-pending suppression > suppresses duplicate transport while a requested lease is active and expires it cleanly`; `records requested metadata without claiming the follow-up was accepted or delivered`; `suppresses another advancing follow-up during the requested lease and permits repair after expiry`; `does not send again when a prior requested lease owns the lead` |
| Graph accepted, acknowledgement persistence fails truthfully | `truthful follow-up transport > preserves provider acceptance when acknowledgement persistence fails and does not record failed`; `scheduled owner digest delivery > preserves Graph acceptance when delivery acknowledgement persistence fails` |
| Digest health failure cannot rewrite accepted delivery | `scheduled owner digest delivery > keeps accepted delivery truth when digest health persistence fails` |
| Global identical replay after newer event | `global delivery event replay ledger > returns an explicit no-op for an identical old event after newer status events` |
| Event ID conflict across status/outbound/channel/provider identity | `global delivery event replay ledger > rejects the same event ID reused for another status, outbound, channel, or provider identity` |
| Atomic rollback and concurrent global claim | `does not retain a replay claim when the delivery transaction rolls back`; `allows one winner when the same event ID is claimed concurrently for different outbounds` |
| Digest preclaim, terminal replay suppression, distinct retry | `owner digest health metadata > claims a deterministic digest attempt before transport and never reuses a terminal attempt`; `allows one transactional winner for concurrent digest preclaims`; `scheduled owner digest delivery > preclaims before Graph and short-circuits requested, accepted, or failed replay attempts`; `supports a deliberate distinct retry attempt ID` |
| Concurrent cron delivery sends Graph once | `scheduled owner digest delivery > sends Graph once when concurrent cron requests race for the same attempt` |

### Strict TDD evidence

First-success transition RED, before implementation:

```text
npx vitest run tests/salesDelivery.test.js
Test Files  1 failed (1)
Tests       5 failed | 10 passed (15)
exit 1
```

Global ledger RED, before implementation:

```text
npx vitest run tests/salesDeliveryFirestore.test.js
Test Files  1 failed (1)
Tests       4 failed | 12 passed (16)
failures: old identical callback was a regression; reused IDs were not globally conflicting; rollback/retry wrote no ledger; concurrent conflicting claims both won
exit 1
```

Requested-lease, persistence-boundary, and digest-preclaim RED, before implementation:

```text
npx vitest run tests/salesFollowupPolicy.test.js tests/salesDeliveryFirestore.test.js tests/salesFollowupsRoute.test.js tests/salesDigestRoute.test.js
Test Files  4 failed (4)
Tests       11 failed | 58 passed (69)
exit 1
```

Focused GREEN after implementation:

```text
npx vitest run tests/salesDelivery.test.js tests/salesDeliveryFirestore.test.js tests/salesDeliveryRoute.test.js tests/salesWhatsApp.test.js tests/salesFollowupPolicy.test.js tests/salesFollowupsRoute.test.js tests/salesDigest.test.js tests/salesDigestRoute.test.js
Test Files  8 passed (8)
Tests       117 passed (117)
exit 0
```

Regression and full-suite GREEN:

```text
npx vitest run tests/salesInboundEvents.test.js tests/salesInbound.test.js tests/salesExperiments.test.js tests/salesAgent.test.js tests/salesReplyRoute.test.js tests/salesCircuitBreaker.test.js tests/salesCircuitFirestore.test.js tests/salesConversation.test.js tests/salesAttribution.test.js tests/salesMediaGuard.test.js tests/salesMediaLibrary.test.js tests/salesSelling.test.js tests/salesLeadsView.test.js
Test Files  13 passed (13)
Tests       357 passed (357)
exit 0

npm test
Test Files  42 passed (42)
Tests       821 passed (821)
exit 0

npx eslint <11 changed JS files>
exit 0, no diagnostics
```

Privacy/security remains unchanged or stronger: replay documents contain hashes and timestamps only; degradation responses contain stable IDs and normalized callback fields but no phone, token, provider body, payload, transcript, or secret. No calls or dial tasks were introduced. Make remains requested-only pending its authenticated callback and Task 6 wiring remains untouched.

## Fix round 2/5 — secondary-part ownership

Status: implemented and verified after review of commit `97bdf78e039a93cfdc78ac25e31671dd3641f76d`.

### Binding decisions

- Every prepared outbound delivery document records `deliveryRole`, `advanceOnDelivery`, and `logicalAttemptId`. Customer text/template is `primary` and may own lead cadence; image/media is `secondary` and cannot. Owner digest is `owner_digest` and cannot affect lead state. Callback-created and legacy records are explicitly normalized on their next valid event as documented in fix round 3.
- Primary and secondary parts from one follow-up share a stable, phone-free logical attempt ID. Existing delivery records remain compatible and are transactionally backfilled from explicit metadata, then legacy `advancesFollowUp`, with safe outbound-ID identity fallback; no bulk Firestore migration is required.
- A non-advancing delivery callback writes only its delivery document and the global hashed event ledger. It never writes the lead document, even when pending/request ownership fields are empty.
- Advancement stores `lastAdvancedDeliveryAttemptId`. A later accepted/failed callback from another primary for that already-advanced logical attempt updates only its own delivery document and ledger. A legitimate `delivered -> read` upgrade can still update the primary lead truth once without changing cadence.
- Image Graph evidence is returned truthfully when acknowledgement persistence fails. `mediaRepair` contains exactly the authenticated delivery endpoint and normalized accepted callback fields needed for later repair; it contains no recipient, provider body, token, secret, or transcript.

### Acceptance mapping

| Review acceptance item | Named test evidence |
|---|---|
| Explicit role, advancement ownership, and shared logical attempt identity | `transactional follow-up delivery truth > records requested metadata without claiming the follow-up was accepted or delivered`; `a secondary image accepted/failed event updates its delivery and replay ledger but leaves the exact primary lead truth unchanged`; `truthful follow-up transport > uses free-form text inside an open service window and gives media its own phone-free outbound ID`; `owner digest health metadata > claims a deterministic digest attempt before transport and never reuses a terminal attempt` |
| Secondary accepted/failed callbacks leave the exact lead unchanged | Both table cases named `a secondary image accepted/failed event updates its delivery and replay ledger but leaves the exact primary lead truth unchanged` compare the complete lead object before and after, while also checking the secondary document transition. |
| Secondary replay/conflict remains globally correct | The same secondary table cases replay the identical event as `EVENT_REPLAY`, then reuse its ID with a changed status and require `EVENT_ID_CONFLICT`, while the complete lead remains unchanged. |
| Older primary advances; newer same-attempt accepted/failed cannot overwrite | Both table cases named `a newer same-attempt primary accepted/failed callback cannot overwrite truth after the older primary advances` compare the complete advanced lead object while verifying the newer delivery document transitions. |
| Repairable accepted image persistence degradation | `truthful follow-up transport > returns a privacy-safe repair event when image acceptance persistence fails without recording failed`; `delivery acknowledgement route > accepts the complete secondary-image repair event for later persistence` |
| Top-level report states first delivered or read advances | Corrected in `Binding decisions` above; this is human-facing evidence rather than executable behavior. State-machine behavior remains covered by the round-1 transition tests. |

### Strict TDD and verification evidence

Focused RED before production changes:

```text
npx vitest run tests/salesDeliveryFirestore.test.js tests/salesFollowupsRoute.test.js tests/salesDeliveryRoute.test.js
Test Files  2 failed | 1 passed (3)
Tests       7 failed | 34 passed (41)
failures: explicit role/logical metadata missing; secondary accepted/failed mutated lead; late same-attempt accepted/failed overwrote delivered truth; media repair payload missing
exit 1
```

Focused GREEN:

```text
npx vitest run tests/salesDelivery.test.js tests/salesDeliveryFirestore.test.js tests/salesDeliveryRoute.test.js tests/salesWhatsApp.test.js tests/salesFollowupPolicy.test.js tests/salesFollowupsRoute.test.js tests/salesDigest.test.js tests/salesDigestRoute.test.js
Test Files  8 passed (8)
Tests       123 passed (123)
exit 0
```

Regression, full, lint, and diff hygiene:

```text
npx vitest run tests/salesInboundEvents.test.js tests/salesInbound.test.js tests/salesExperiments.test.js tests/salesAgent.test.js tests/salesReplyRoute.test.js tests/salesCircuitBreaker.test.js tests/salesCircuitFirestore.test.js tests/salesConversation.test.js tests/salesAttribution.test.js tests/salesMediaGuard.test.js tests/salesMediaLibrary.test.js tests/salesSelling.test.js tests/salesLeadsView.test.js
Test Files  13 passed (13)
Tests       357 passed (357)
exit 0

npm test
Test Files  42 passed (42)
Tests       827 passed (827)
exit 0

npx eslint <5 changed JS files>
exit 0, no diagnostics

git diff --check
exit 0; only configured LF-to-CRLF working-copy notices
```

Privacy/security: secondary repair contains only stable hashed outbound identity, channel, status, provider message ID, timestamp, stable event ID, and the authenticated delivery endpoint. The implementation adds no phone, token, secret, raw provider response, transcript, call, or dial-task surface. Task 6 Make wiring remains unchanged.

## Fix round 3/5 — callback-created and legacy normalization

Status: implemented and verified after review of commit `21ce3a35d1747e39633f5de590c096435a2e9f6d`.

### Normalization contract

- Every valid apply or new-event no-op write from `recordDeliveryEvent` persists `deliveryRole`, `advanceOnDelivery`, and `logicalAttemptId` alongside `outboundId`. A byte-identical global event replay performs no delivery write because its first application already normalized the document.
- A missing document is explicitly `external`, `advanceOnDelivery: false`, and uses `event.outboundId` as its logical attempt. Accepted, delivered, read, and failed callbacks stay non-lead/non-advancing regardless of identifier shape.
- Existing explicit fields win. Otherwise legacy `advancesFollowUp: true` becomes `primary` and remains advancing; legacy `false` becomes `secondary` and non-advancing; an absent flag becomes `external` and non-advancing. Missing logical identity is backfilled from the stored outbound identity, then the callback outbound ID.
- Backfill is part of the same delivery/hashed-ledger transaction. It does not rewrite established status or provider identity beyond the valid requested transition, and mismatch/conflict checks still execute before writes.
- Task 6 external wiring remains deferred, but the authenticated delivery route now has real Firestore integration evidence for a callback-created Make accepted event.

### Acceptance mapping

| Review acceptance item | Named test evidence |
|---|---|
| Missing-doc accepted creates explicit external metadata and ledger; delivered/read never advances or writes a lead | `callback-created and legacy delivery normalization > creates explicit external metadata and never writes a lead across accepted, delivered, and read` |
| Missing-doc failed is explicit and non-advancing | `creates explicit non-advancing metadata for a callback-created failure` |
| Legacy primary preserves stored lead/attempt ownership, backfills, and advances once | `backfills a legacy primary and preserves its stored advancing ownership exactly once` |
| Legacy false and absent flags are secondary/external and never mutate their referenced lead | Both table cases named `backfills legacy secondary/external metadata without ever mutating its referenced lead` |
| Replay/conflict and provider identity survive backfill | The legacy secondary/external table cases require identical `EVENT_REPLAY`, changed-fingerprint `EVENT_ID_CONFLICT`, and new-event `PROVIDER_MESSAGE_ID_MISMATCH`, with the complete lead unchanged. |
| Task6-like authenticated Make callback-created path | `persists a Task6-like Make callback-created outbound through the authenticated route` invokes the real route and Firestore transaction, then verifies explicit external metadata and zero lead writes. |

### Strict TDD and verification evidence

RED before production changes:

```text
npx vitest run tests/salesDeliveryFirestore.test.js
Test Files  1 failed (1)
Tests       6 failed | 23 passed (29)
failures: callback-created accepted/failed, legacy primary, legacy false/absent, and authenticated Make path all lacked explicit normalized metadata
exit 1
```

Focused GREEN:

```text
npx vitest run tests/salesDelivery.test.js tests/salesDeliveryFirestore.test.js tests/salesDeliveryRoute.test.js tests/salesWhatsApp.test.js tests/salesFollowupPolicy.test.js tests/salesFollowupsRoute.test.js tests/salesDigest.test.js tests/salesDigestRoute.test.js
Test Files  8 passed (8)
Tests       129 passed (129)
exit 0
```

Regression and full-suite GREEN:

```text
npx vitest run tests/salesInboundEvents.test.js tests/salesInbound.test.js tests/salesExperiments.test.js tests/salesAgent.test.js tests/salesReplyRoute.test.js tests/salesCircuitBreaker.test.js tests/salesCircuitFirestore.test.js tests/salesConversation.test.js tests/salesAttribution.test.js tests/salesMediaGuard.test.js tests/salesMediaLibrary.test.js tests/salesSelling.test.js tests/salesLeadsView.test.js
Test Files  13 passed (13)
Tests       357 passed (357)
exit 0

npm test
Test Files  42 passed (42)
Tests       833 passed (833)
exit 0

npx eslint src/lib/salesAgent/leads.js tests/salesDeliveryFirestore.test.js
exit 0, no diagnostics

git diff --check
exit 0; only configured LF-to-CRLF working-copy notices
```

Privacy/security remains unchanged: normalized documents and ledger claims contain stable metadata only. Callback-created identifiers do not trigger lead lookup or mutation without stored lead ownership, and no phone, secret, token, provider body, payload, transcript, call, or dial task is introduced.

## Fix round 4/5 — authoritative explicit ownership precedence

Status: implemented and verified after review of commit `056344238c287387c156b1dd4ee5aad4537ab70e`.

### Normalization decision

- `recordDeliveryEvent` now uses the normalized authoritative `advanceOnDelivery` value when an `accepted` callback claims the R2 30-minute pending window. It no longer rechecks legacy `advancesFollowUp` after normalization.
- Explicit ownership metadata is resolved before legacy metadata. Explicit `advanceOnDelivery: true` with no role derives `primary`; explicit `false` with no role derives `secondary`. A genuinely missing delivery document remains the safe `external`/`false` default.
- Only the coherent normalized pair `deliveryRole: 'primary'` plus `advanceOnDelivery: true` can touch lead ownership. Conflicting explicit pairs deterministically fail closed: `primary`/`false` becomes `secondary`/`false`, while a non-primary role paired with `true` retains its declared audit role but is forced to `false`. An explicit role without an advance flag derives ownership only when that role is `primary`; all other explicit roles remain non-advancing. Legacy `advancesFollowUp` is consulted only when both explicit fields are absent.
- This ruling keeps malformed/conflicting records observable without allowing them to create pending ownership, clear another attempt, or advance cadence. Callback-created external records, secondary media, owner digest, global event-ledger behavior, and logical-attempt exactly-once fencing are unchanged.

### Acceptance mapping

| Review acceptance item | Named test evidence |
|---|---|
| Explicit `primary`/`true` outranks legacy false or absent, claims accepted pending, and advances exactly once | Both table cases named `lets explicit primary ownership outrank legacy ... through accepted pending and one verified advancement` |
| Role absent plus explicit true derives primary and advances | `derives primary ownership when explicit advanceOnDelivery is true and role is absent` |
| Role absent plus explicit false derives secondary and never writes the lead | `derives secondary non-ownership when explicit advanceOnDelivery is false and role is absent` |
| Conflicting explicit role/advance pairs fail closed and never write the lead | Both table cases named `normalizes conflicting explicit ... ownership to safe non-advancing ... metadata` compare the complete lead and require zero lead writes across accepted, delivered, and read |
| Missing-document external default and legacy fallbacks remain safe | Existing callback-created and legacy normalization tests remain in the same focused Firestore suite |

### Strict TDD evidence

Initial explicit-precedence RED before production changes:

```text
npx vitest run tests/salesDeliveryFirestore.test.js
Test Files  1 failed (1)
Tests       5 failed | 30 passed (35)
failures: explicit primary did not claim accepted pending when legacy was absent/false; absent roles followed legacy instead of explicit advance; secondary/true advanced
exit 1
```

Conflict-coherence RED before the safe role downgrade:

```text
npx vitest run tests/salesDeliveryFirestore.test.js
Test Files  1 failed (1)
Tests       1 failed | 34 passed (35)
failure: explicit primary/false remained labelled primary instead of normalizing to non-advancing secondary
exit 1
```

Targeted GREEN after each minimal production change ended at:

```text
npx vitest run tests/salesDeliveryFirestore.test.js
Test Files  1 passed (1)
Tests       35 passed (35)
exit 0
```

### Final verification

```text
npx vitest run tests/salesDelivery.test.js tests/salesDeliveryFirestore.test.js tests/salesDeliveryRoute.test.js tests/salesWhatsApp.test.js tests/salesFollowupsRoute.test.js tests/salesFollowupPolicy.test.js tests/salesSweep.test.js tests/salesDigest.test.js tests/salesDigestRoute.test.js
Test Files  9 passed (9)
Tests       157 passed (157)
exit 0

npx vitest run tests/salesInboundEvents.test.js tests/salesInbound.test.js tests/salesExperiments.test.js tests/salesAgent.test.js tests/salesReplyRoute.test.js tests/salesCircuitBreaker.test.js tests/salesCircuitFirestore.test.js tests/salesConversation.test.js tests/salesAttribution.test.js tests/salesMediaGuard.test.js tests/salesMediaLibrary.test.js tests/salesSelling.test.js tests/salesLeadsView.test.js
Test Files  13 passed (13)
Tests       357 passed (357)
exit 0

npm test
Test Files  42 passed (42)
Tests       839 passed (839)
exit 0

npx eslint src/lib/salesAgent/leads.js tests/salesDeliveryFirestore.test.js
exit 0, no diagnostics

git diff --check
exit 0; only configured LF-to-CRLF working-copy notices
```

Privacy/security remains unchanged: the normalization reads and writes operational ownership metadata only, uses non-dialable fixtures, and adds no phone, secret, token, provider body, payload, transcript, call, or dial-task surface. Existing external concerns remain Meta template approval and Task 6 callback wiring; this fix adds no new external dependency.
