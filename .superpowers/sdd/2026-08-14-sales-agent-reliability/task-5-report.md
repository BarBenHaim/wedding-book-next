# Task 5 report — truthful WhatsApp delivery acknowledgements

Status: implemented and locally verified on `revenue-chat-closer` from base `196a5ec7d6520613022cd06ac2f40f0919b958d8`.

## Binding decisions

- R2 is authoritative: `accepted` means provider evidence exists and creates a 30-minute pending window. It never increments `followUpCount`, writes `lastFollowUpAt`, moves `followUpAt`, or uses the word delivered.
- The first verified `delivered` callback advances the logical follow-up attempt. A later `read`, repeated `delivered`/`read`, or another transport result for the same logical attempt cannot advance it again.
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
