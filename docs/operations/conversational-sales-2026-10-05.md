# Conversational sales specification: implementation and release gates

Date: 2026-10-05
Specification: **Wedding Tales — אפיון בוט מכירות שיחתי**, dated 2026-10-05
Status: **Local draft implementation. Not a production activation or a declaration that the complete sales system is ready.**

This document maps the whole specification, including all 20 acceptance cases, to the current implementation. It separates a pure helper, an actual application route, local synthetic test evidence, and dependencies that remain unavailable or unapproved. It contains no live customer transcripts or approval records.

## Final local verification

- Whole repository: `./node_modules/.bin/vitest run` passed **116 suites / 2,310 tests** on the final code
- Independent integrated review found and verified fixes for first-contact ownership lookup, scoped checkout confirmation and superseded STOP/human requests; no remaining must-fix in the reviewed boundaries. Updated review suites: 303 tests passed
- TypeScript: `tsc --noEmit --incremental false` passed
- Changed-file ESLint: **0 errors / 8 warnings** (anonymous default exports); whitespace validation passed
- Production compilation: `next build --experimental-build-mode compile` passed; full generation, live model/provider canary, deployment and production activation were not performed
- All acceptance execution used synthetic fixtures and mocked external effects. A separate read-only public Woo product check observed printed product 6271 at 990 ILS; this proves neither approved terms nor a destination-specific checkout total. Digital product retrieval timed out
- The final regression set covers provider-time service windows, stale/missing-time STOP suppression without reopening that window, per-part final-send validation, explicit human release, and strict-cohort rollback without legacy sales/follow-up fallback

## Scope and evidence vocabulary

- **Helper implemented:** server-side logic or schema exists. This does not establish a working provider integration
- **Route integrated:** an application route calls the helper. Provider, database, authentication, and transport dependencies may still be mocked in local tests
- **Locally tested:** the named synthetic test exists; the verification ledger below identifies which runs were actually observed. A test name alone is not a pass claim
- **Business/provider blocked:** real approved inputs, a provider adapter, permissions, or operational decisions are still needed
- **Code-default disabled:** the new conversation policy requires an explicit environment flag. No live setting, deployment, migration, message, purchase, or account change was performed by this implementation task. Production configuration and status are unverified
- **Partial:** some required behavior exists, but the whole stated user journey has not been established

The specification's observed prices, 690 ILS digital and 990 ILS printed, are observations, not an approved production catalog. Synthetic fixtures with those amounts are not authorization to sell or a source for shipping, tax, limits, refunds, upgrades, or free offers.

### Important rollout distinction

`SALES_CONVERSATIONAL_POLICY_ENABLED=true` selects the new deterministic conversation boundary. It does **not** gate every change in this draft. Durable human-service tasks, fulfillment leases/outbox, authenticated order-status access, and related persistence guards are also integrated into existing routes. The stricter WooCommerce payment checks follow the conversation flag, but the fulfillment refactor itself is not inert with that flag absent. Review and test those compatibility changes separately before deploying any part of this draft.

The new strict reply path currently uses server-owned interpretation and copy. The stricter model prompt is implemented and tested, but strict replies deliberately bypass model generation. Do not describe a tested prompt as a deployed model-driven conversation.

## 1. Requirement-by-requirement coverage

Paths in this document are repository-relative. All sales-library references are under `src/lib/salesAgent/`; all sales API references are under `src/app/api/sales-agent/` unless a full path is shown.

| Spec requirement | Helper and actual route integration | Local evidence / present limit |
| --- | --- | --- |
| **§1 Strategy: answer first, skip unnecessary steps, optimize purchases** | `conversationRuntime.js:buildConversationalTurn` uses `decisionPolicy.js` and selects answers without running the legacy opening script. `reply/route.js` calls it in strict mode. `salesEvidence.js` counts verified orders separately from prepared checkout | Reply-boundary tests cover immediate price, explicit purchase, service, stop, and handoff. Verified revenue is a measurement input, not a conversion promise. Full business outcome is unverified |
| **§2 Approved catalog, current prices and terms** | `offerCatalog.js` validates a complete versioned catalog and offers; `offerStore.js:readActiveOfferCatalog` re-reads `sales_offer_catalog/current` for strict reply. `offerApprovalStore.js` and authenticated `offers/route.js` supply explicit owner publication, not inferred approval. Missing/invalid catalogs fail closed instead of using `catalog.js` | `salesApprovedOfferContract.test.js`, “accepts only a complete explicitly approved offer”; “does not fall back to historical prices when missing, invalid or unavailable.” `salesOfferApprovalRoute.test.js`, “stamps owner identity/time/version and atomically creates immutable history plus current.” Real approved catalog is not seeded |
| **§2 Total, currency, tax, destination shipping and additions** | Integer minor-unit total must equal subtotal + tax + shipping + named additional charges; ILS and approved product URL are validated. Destination-specific offers have contextual validation | Same test file, “requires complete integer monetary breakdown and approved currency”; “checks destination and campaign and never silently switches an offer.” Actual destination/checkout calculation provider remains required |
| **§2 Contents, type, dimensions, copies and limits** | Schema requires inclusions/exclusions, book type, copies, dimensions and explicit page/blessing/photo/access-period values or explicit not-applicable `null` | Complete-offer tests reject omitted facts. A `null` must represent a business-approved absence of a limit/applicability, not an unknown value disguised as approval |
| **§2 Independent upgrade and extra-copy offers** | `upgradeOfferId` and `additionalCopyOfferId` must be explicitly present; no subtraction of base prices creates a price | Base offer schema only. Real upgrade/additional-copy commercial offers, provider product mappings and checkout support remain blocked; a reference field is not a working upgrade sale |
| **§2 Design, editing, approval, human help, production and shipping start point** | Required `process`, `timing` and policy records are retained in snapshots and human summaries | Schema and snapshot tests. Real wording and fulfillment timing must be approved; urgent delivery cannot be inferred from ordinary timings |
| **§2 Service, date change, cancellation and refunds** | Versioned summary + business-origin URL required for each policy; offer changes require a new customer decision | `salesApprovedOfferContract.test.js`, “rejects policy links off the trusted business origins”; “ignores capture timestamps and object key order but detects changed terms.” Approved policy content remains a business gate |
| **§2 Coupons, eligibility and expiry** | Coupon approval, eligibility text and expiry required; `getActiveOffer` additionally requires a server-verified entitlement | “requires a separately verified coupon entitlement.” No entitlement adapter or new coupon is activated |
| **§2 No invented scarcity, discounts, promises or obsolete add-ons** | Strict runtime bypasses legacy model/script price and promotional fallbacks; approved data is the commercial source | Strict prompt, offer tests and strict follow-up tests. Human escalation is the safe result for unsupported products/terms; unsupported commercial facts must not be added as copy |
| **§2 Free-promise mismatch** | Source attribution is stored separately from authority. A free claim requires a single approved campaign match with explicit free scope/limitations/paid scope/start and terms links; otherwise `OFFER_MISMATCH` and a durable task | Strict reply scenario “does not invent facts or execute actions for ראיתי בחינם”; free-offer schema rejection. Actual free offer and campaign identity remain unapproved |
| **§3 Identity and ordinary tone** | `AUTOMATION_DISCLOSURE` is included once and persisted. Strict copy/prompt identifies an automated assistant, does not impersonate Bar, and avoids legacy forced sales introductions | Reply test “answers price directly from approved offers, discloses automation, and disables legacy model/script sends.” Default short answers may expand when a full approved quote is necessary |
| **§3 No inferred gender/family role; memorial sensitivity** | Strict prompt rules prohibit inference and celebrations for memorial context; deterministic memorial reply uses sensitive wording | “memorial response has neither congratulations nor festive emoji.” Asset captions and approved catalog wording still need editorial review; schema approval alone does not establish tone |
| **§4 Priority: stop, service/human, existing customer, purchase, question, continuation** | `buildConversationalTurn` handles stop and human/service before sales. Reply route lets stop pass an existing human pause. Customer lookup detects support routing but does not grant access to a book | Strict reply and handoff tests. Identification by conversation/phone is not ownership authentication; owner data is returned only by the separate authenticated order-status boundary |
| **§4 Corrections and contextual “yes”** | Event correction updates the existing exchange; `lastQuestion`, package choice and offer-change confirmation are persisted. Demo affirmative remains a demo action; bare affirmative never creates reminder consent | Reply tests “an event correction keeps the existing conversation and updates the event”; “yes after a demo question means demo, never checkout or reminder consent.” Broader free-form dialog is bounded; uncertain meaning must be clarified |
| **§5 Minimum information** | Explicit event type, a narrowly supplied celebrant name, and exact/approximate timing are retained. Buying requires only a missing package choice, not a new event questionnaire. No photo/address/date requirement is introduced before quoting | Reply test “preserves supplied event/month and asks only the missing package when buying”; `salesConversationContract.test.js`, “captures a supplied event, name and approximate month without demanding date or photo.” Checkout-specific required-field handling depends on the real provider; never manufacture an event date |
| **§6.1 General opening** | Strict first turn discloses automation and asks for event type only if missing; legacy fixed opening media bundles are bypassed | Real reply-boundary price/opening tests. New campaign-derived event inference and interactive WhatsApp buttons are not established by these tests |
| **§6.2 Price first** | Approved offer totals and short scope are formatted directly; a specific package request can select only that package. No checkout URL appears merely because an approved offer exists | Offer quote and reply price tests. Without approved catalog, honest review replaces a price claim; this is a safe blocked outcome, not an available live quote |
| **§6.3 Appropriate example** | `pickApprovedDemo` chooses at most one relevant unseen approved asset; `mergeMedia(..., {strict:true})` removes unapproved library entries before reply | `salesApprovedMediaContract.test.js`, “does not replace bat mitzvah examples with bar mitzvah media”; “chooses at most one event-relevant unseen approved asset, including a video.” Real examples/rights are pending |
| **§6.4 Recommendation and offer** | Server-owned choice, snapshot and quote paths preserve the chosen package; unknown package asks a narrow choice instead of assuming printed | Explicit printed-checkout reply test. Full recommendation language must be based on a stated need; the base deterministic path is not evidence of a personalized diagnosis |
| **§6.5 Explain process when needed** | Approved `process` fields supply the process answer. Strict prompt prohibits automatic import of private chats/galleries and unsupported full-service claims | Offer/prompt tests. Business must approve participant upload, browser participation, collection period, editing responsibilities and print approval wording |
| **§6.6 Checkout** | `checkoutContract.js:prepareCheckout` validates a recent exact provider quote and snapshots. `checkoutQuoteStore.js:readVerifiedCheckout` reads an event/lead/offer-bound row in `sales_checkout_quotes`; strict reply calls it | `salesCheckoutQuoteStore.test.js`, “returns only the independently verified, lead/event/offer-bound quote” and “never substitutes the static URL when no provider quote exists,” plus quote comparison and printed checkout route tests. This is a **read-only verified-quote integration boundary**, not a provider `create_checkout` adapter. No real quote writer/provider has been configured |
| **§6.6 Changed offer** | Every material snapshot difference triggers `reconfirm_required`; a later contextual affirmative must accept the current snapshot before a link may return | “requires explicit acceptance of a changed offer before the link can return”; reply “waits for renewed decision after an offer change.” Provider must still prove its final amount and conditions |
| **§6.7 Verified payment and real book** | `paymentTruth.js`, `wooWebhook.js`, `orderFulfillment.js` and `src/app/api/createWedding/route.js` verify signed input, distinguish payment from book readiness, use a fenced creation lease and a confirmation outbox | `salesOrderFulfillmentRoute.test.js` checks real handler signature rejection, duplication, interruption recovery and separate access links with synthetic dependencies. Real webhook payload compatibility, ownership/access compatibility and delivery remain activation prerequisites |
| **§6.7 Owner and guest access** | `orderStatus.js:getOrderStatus` verifies ID-token owner → order → actual book → signed payment evidence. `order-status/route.js` is private/no-store. Owner-management and guest-upload links remain separate | `salesOrderFulfillmentRoute.test.js`, “requires owner UID and order/book match; email/phone/query identity is insufficient” and “withholds ready URLs if trusted current payment is missing or refunded.” WhatsApp “I paid” routes to service rather than granting authenticated owner links. No automatic send to customer contacts is implemented |
| **§6.7 Share-ready copy / successful first use** | Confirmation email can provide the real guest link after ready book state. Book status distinguishes preparing from ready | Personalized ready-to-forward share copy and successful first-real-guest blessing workflow are not established end to end. No guessed activation success or blessing content enters sales analytics |
| **§7 Objection handling** | Strict server runtime now handles participation, workload, photographer-album, price and partner/defer concerns, and reads approved access/delivery policies; detailed subcase coverage is below | `salesConversationContract.test.js` checks participation reassurance, assistance scope, approved digital alternative, access period and generic delivery terms. Untested wording/flows still need review; a handoff is not proof of a complete objection-specific answer |
| **§8 Approved free journey** | Approved campaign free scope can produce self-start wording and `FREE_ACTIVATION`; unknown offer becomes a mismatch task. No book is created merely because the lead mentions “free” | Business blocked: exact free scope/limits/paid transition, valid start/terms flow and authorization. Provider blocked: authorized free-book creation, minimal status, first-real-blessing event and approved optional upgrade. No fabricated events or automatic upgrade |
| **§9 Consent-aware reminders** | `followupEvidence.js`, strict `followupPolicy.js`, `followupStrategy.js`, `leads.js` and `followups/route.js` implement explicit evidence, exact due instant, approved hours, max one/two scope, generation fencing and final pre-send checks | Pure, transactional and route test groups cover the guards. Separate activation flag, current activation timestamp, approved hours/delays and template approval are still required; no old backlog enrollment |
| **§9 Stop and re-evaluate** | New inbound invalidates old schedules. Payment, service, human takeover, opt-out and mismatched offers suppress reminders. Permission is consumed at durable dispatch claim to prevent ambiguous retries from exceeding it | “invalidates schedule after a new inbound or revision, including same-millisecond inbound”; “claims one permitted reminder atomically and permits only its current owned final dispatch.” Unknown/failed delivery does not automatically restore permission |
| **§9 WhatsApp window, templates and local time** | Window derives only from the validated provider customer-message occurrence time, not server receipt/completion; outside 24 hours requires matching approved MARKETING template and consent. `Asia/Jerusalem` IANA time and minute-level hours are used | `transportPolicy.js:decideStrictInboundTime` and CRM timestamp fencing add missing/future/delayed/out-of-order handling; the final run must include these later changes. Strict follow-up route and policy tests cover window/template checks. User-specific exact appointment still cannot bypass approved hours/platform policy. No claim that a template approval itself is consent |
| **§10 Durable human handoff** | `humanHandoff.js` + transactional CRM writes create a minimal task and pause the lead; `handoffs/route.js` supports authenticated request/acknowledge/resolve/release. Only explicit release resumes eligibility | Durable handoff + authenticated API tests. Time elapsed and “resolved” do not release takeover. Operator staffing, queue consumption, notifications, actual response time and approved fallback channel need operational verification |
| **§10 Honest task failure** | Success wording is not dispatched unless the task transaction completes. A failed task write may separately commit a truthful service-pending failure response under the same inbound claim; only then can it send the support-site fallback | `salesReplyRoute.test.js`, “sends an honest handoff failure only after a separate current response commits.” If all durable writes are unavailable, the route remains a non-sendable 503; an ambiguously committed original suppresses a duplicate rather than guessing |
| **§11 Business actions vs conversation** | Deterministic contracts own commercial, consent, payment, access and delivery decisions. A bounded server patch cannot assert payment/ownership/book truth | Helpers exist and strict reply/CRM integration is real. See the action-by-action table below; the complete external provider set is not implemented |
| **§11 States and minimal lead fields** | `salesContract.js` enumerates the specified states and sanitizes contract state. CRM retains revision, last question, event/timing precision, source, offers, checkout, consent, schedules and suppression alongside existing fields | State enumerations do not prove every transition exists. PAID/book readiness come from payment/status boundaries; full free onboarding is blocked. No guest blessing collection is copied into the analytical ledger |
| **§11 Reliability and privacy** | Per-conversation revision/fencing, canonical inbound identity, transactional claims, approval-only media, verified payment and action-success ordering are used; bounded media retry only after explicit provider rejection | Handoff, inbound and media tests. Final pre-dispatch reads reduce stale sends but cannot cancel a provider request already accepted/in flight. Broader access-boundary compatibility review is required; production status is unverified |
| **§12 Media inventory** | Public sales-demo/WhatsApp scope, rights and consent evidence, exact asset version/URL, event types and expiry are validated. One appropriate asset is chosen | Media contract tests. Actual wedding, bar mitzvah, bat mitzvah and additional-event spread/video + cover inventory is not supplied or approved. Optional testimony/TV rights and context remain unapproved |
| **§13 Measurement and experiment** | `salesEvidence.js` writes prepared transport events and signed order evidence. `cohorts/route.js` returns authenticated aggregate source/route cohorts with maturity windows, verified buyers, refunds and conditional cost metrics | `salesEvidence.test.js`, “counts unique contacts and verified orders once; checkout is not payment” and “uses equal maturation windows and excludes late purchases from comparison.” Aggregate API is integrated; dedicated API-handler coverage is not established here. Missing clicks, media opens, blocks, first real blessing and human-resolution quality are explicitly unavailable. No invented views/payments |
| **§13 Economics** | Full acquisition cost is nullable without verified ad/bot/message costs; contribution is nullable without product/shipping/processing/refund evidence. Cohorts must fully mature before costs apply; truncation returns no rates | Real attributable cost ingestion/reconciliation remains blocked. A calculated metric from synthetic rows is not an observed business result |
| **§13 Two-opening experiment** | Existing opening/model experiment infrastructure is available; strict reply bypasses the legacy scripted opening | The specific approved price-first vs demo-first experiment, unchanged offer/copy, assignment/exposure contract, rollout and power/maturation review are **not activated or established by this draft**. Do not interpret model assignments as this experiment |
| **§14 Acceptance cases** | All 20 cases are itemized below | Local assertions are not live completion, and grouped tests are not 20 end-to-end production executions |
| **§15 Model instruction baseline** | `prompt.js:buildStrictSystemPrompt`, strict journey and worked examples express automation identity, direct answers, approved facts, no private disclosure and no success before evidence | “contains automatic identity and sensitive memorial rules without legacy commercial claims”; “uses only validated runtime offers and never a stale offer or historical demo.” Strict route uses deterministic generation, so these are prompt contracts rather than proof of a model deployment |
| **§16 Unresolved launch decisions** | Missing data fails closed rather than being filled from examples or historical copy | Full business/provider/operations gate list follows. Code cannot approve these decisions for the business |

### §7 objection-by-objection detail

| Objection | Safe behavior currently established | Remaining substantive answer requirement |
| --- | --- | --- |
| Too expensive / discount | Approved digital quote can be offered for price concern; no automatic discount. Pure test: “can offer approved digital alternative without automatic discount” | A requested discount/unknown entitlement routes to review. Respect a refusal without another close |
| Guests may not participate | Runtime says participation is not guaranteed and suggests sharing ahead with close people. Pure test: “uses specific participation reassurance without promising guest count” | Ready-to-forward personalized sharing copy and actual participation-event workflow remain separate; no metric is fabricated |
| No time | Runtime quotes approved editing, approval and human-assistance scope. Pure test: “quotes verified assistance scope for workload concern” | Real approved scope must distinguish customer sharing/review from included help; no unsupported “we do everything” |
| Ask partner | Deferral is respected; selected approved package can be summarized. Relative callback stays unresolved and cannot create an early reminder | Unselected package is not invented; exact reminder time and consent remain required. No dedicated partner-dialog replay was observed |
| Advert said free | Verified campaign terms or durable mismatch handoff | Real approved free offer still missing; no “promotion ended” or unauthorized promise to honor it |
| Already has photographer album | Runtime gives approved package inclusions and can select one approved example without disparagement | The actual approved scope/demo must show the personal-words distinction. No dedicated photographer-dialog replay was observed |
| Only after the event | Runtime answers from approved access-period scope; pure test “uses approved access period and distinguishes urgent physical deadline” | No perpetual-storage promise; unclear/unapproved limits remain a service question |
| Event tomorrow | No unverified physical-delivery promise; handoff for operational verification | Real destination, production readiness, carrier deadline and human decision are required; digital availability is not physical delivery |
| Stand / roll-up | No legacy bonus/add-on inserted | Must be an approved current product/file inclusion, or a prior agreement verified in service |
| Not interested / stop | Persist suppression, cancel pending marketing and send only the short acknowledgment | No further sales close; keep suppression through rollback and human resolution |

## 2. Functional action and provider map (§11)

| Proposed action | Implemented boundary | Actual integration and remaining gap |
| --- | --- | --- |
| `get_active_offer` | `validateOfferCatalog`, `getActiveOffer`, `readActiveOfferCatalog`; explicit publication via `offerApprovalStore` | Strict reply reads an approved catalog on every turn; authenticated offers API can publish a complete versioned owner decision. Real approval records and destination/customer entitlement input are required |
| `get_demo` | `filterApprovedMedia`, `pickApprovedDemo` | Strict reply selects from the filtered catalog. Real licensed/consented media records are required |
| `get_order_status` | `getOrderStatus` | ID-token-authenticated `GET /api/sales-agent/order-status`; phone matching in WhatsApp does not grant this access |
| `create_checkout` | `prepareCheckout`, `checkoutQuoteId`, `readVerifiedCheckout` | Reads a provider-created short-lived quote. **No provider creation/verification writer is supplied**; absence blocks the link |
| `create_book_after_authorization` | Fenced fulfillment claim + create-only commit | Signed WooCommerce purchase path integrated in `/api/createWedding`; no auto free-book creation and no new account/book created from ordinary conversation text |
| `get_book_status` | Owner/order/book/payment cross-check | Owner-authenticated order-status response provides ready/preparing/unavailable and links only when ready; no separate unauthenticated chat access |
| `schedule_followup` | Consent capture, strict schedule and claim guards | Strict reply persists schedule; cron selection, durable claim and final dispatch revalidate. Disabled/unconfigured by default |
| `handoff_to_human` | Stable minimal task + paused lead in one transaction | Actual handoff API and CRM integration. Human acknowledgment/response and operational queue consumption remain distinct outcomes |
| `suppress_marketing` | `marketingSuppressed`, null consent/schedule and pending-delivery cancellation | Stop path remains available during takeover. Delayed/unusable-timestamp opt-outs must use durable suppression without reopening a service window; an acknowledgment remains subject to actual platform eligibility |

## 3. All 20 acceptance cases (§14)

“Route” below means the real handler is exercised with synthetic dependencies, not a live WhatsApp/WooCommerce call. Exact test titles are included for reproducibility.

| # | Scenario and required outcome | Implementation / named evidence | Status and boundary |
| --- | --- | --- | --- |
| 1 | “כמה עולה?” → direct price, no questionnaire prerequisite | `salesReplyRoute.test.js`: “answers price directly from approved offers, discloses automation, and disables legacy model/script sends” | Route tested. Requires a real approved catalog; absent approval returns review, never guessed price |
| 2 | Wedding in December, wants to buy → retain facts, offer/checkout | Same file: “preserves supplied event/month and asks only the missing package when buying” | Route tested. Package choice may be the only missing necessary question; real checkout provider remains blocked |
| 3 | Wants printed after package explanation → do not choose digital | Same file: “sends only independently verified checkout for an explicit printed choice”; `decisionPolicy.js:confirmedPackageId` | Route tested for explicit printed purchase. The exact “after package explanation” multi-turn wording deserves replay coverage in addition to the selection helper |
| 4 | “Yes” after demo offer → demo, not order or marketing consent | Same file: “yes after a demo question means demo, never checkout or reminder consent” | Route tested with stored question and approved synthetic media |
| 5 | “Actually bat mitzvah” → update, no reset | Same file: “an event correction keeps the existing conversation and updates the event” | Route tested; existing event/automation history is retained |
| 6 | Saw free → verified scope or stop mismatch | Same file parameterized title: “does not invent facts or execute actions for ראיתי בחינם”; `salesApprovedOfferContract.test.js`: “will not represent an undefined free promise as an approved free product” | Route negative branch + helper tested. Real free benefit and activation path remain business/provider blocked |
| 7 | Arrives tomorrow? → no unverified delivery promise | Same route parameterized test for “זה יגיע מחר?” | Route safety branch tested. Fulfillment availability is not inferred; real urgent-order review is required |
| 8 | “I paid” without payment event → verify, do not charge or activate | Same route parameterized test for “שילמתי”; “existing verified owner gets service and no second checkout” | Route safety/service path tested. WhatsApp claim is not payment evidence or ownership authentication |
| 9 | Duplicate payment event → one activation/confirmation | `orderFulfillment.js` fenced lease/create-only commit; confirmation outbox only claims `pending` once | Actual `/api/createWedding` route tested in `salesOrderFulfillmentRoute.test.js`, “handles sequential and simultaneous duplicate webhooks with one book and one confirmation.” SMTP offers no exactly-once delivery guarantee; uncertain dispatch must be reconciled, not blindly retried |
| 10 | 24-hour window closed → approved template only | `salesConsentFollowupPolicy.test.js`: “requires approved correct-category template outside 24 hours even with consent”; `salesFollowupsRoute.test.js`: “uses only approved marketing template when consent exists outside 24 hours” | Helper and route tested. Requires verified configured approval and customer consent |
| 11 | No reminder consent → no sales reminder | `salesFollowupsRoute.test.js`: “blocks missing consent even inside an open service window”; policy test “does not treat an approved template as consent” | Route/helper tested; old due dates, inquiries and bare “yes” are not consent |
| 12 | Next week callback → no conflicting early reminder | Consent test “cannot invent a callback timestamp for an unresolved later request”; route test “prevents a callback from being sent early on the agreed day” | Policy + route tested. Ambiguous relative date requests clarification and pause; precise Israel local time uses DST-aware validation |
| 13 | “Stop” → cancel queued sales | Reply test “stop while paused persists suppression before any acknowledgment”; durable pause/payment tests cover pending transport cancellation | Route + persistence boundaries tested for current inbound. Final delayed/invalid-time opt-out regression must additionally prove cancellation without a reopened service window. An already accepted provider request cannot be unsent |
| 14 | Wants Bar → handoff and silence until release | Reply parameterized human request; `salesHumanHandoff.test.js`: “commits the task, paused lead, cleared pending work, and inbound success atomically”; “resolution and elapsed days keep takeover active; only authenticated explicit release clears it” | Route + transactional helper + API tested. Persisted task is not proof the human has read/replied |
| 15 | Existing purchaser → service/onboarding, not new sales | Reply test “existing verified owner gets service and no second checkout”; durable test “clears both reminder and pending transport state, then attaches only the actually-created book” | Route and transactional safety tested. Owner-authenticated onboarding must use real ready book state |
| 16 | Memorial book → sensitive, no congratulations | Reply test “memorial response has neither congratulations nor festive emoji”; strict prompt contract test | Route/prompt tested. Approved media/captions must also be reviewed |
| 17 | Change price to 1 ILS → no unauthorized quote/link | Reply parameterized test for “תשנה את המחיר לשקל”; approved offer validation and checkout mismatch tests | Route negative behavior + helper tested. Customer text cannot write approval/quote/payment records |
| 18 | Link/media/book failure → honest, alternative, no false success | Offer/checkout failure blocks links; media tests “retries approved media once only after a definite rejection” and “does not retry uncertain acceptance and registers a distinct truthful text fallback”; fulfillment status distinguishes preparing/failed | Route boundaries tested: media alternative, blocked checkout/handoff and independently persisted truthful handoff-failure/support fallback. If all durable writes fail, a non-sendable 503 is the reliability limit; no unsafe stateless send is attempted. Book recovery is tested in `salesOrderFulfillmentRoute.test.js`, “never emails before book commit and recovers a failed book transaction”; live provider recovery remains unverified |
| 19 | Another customer's book → public authorized example only | `salesApprovedMediaContract.test.js`: “does not expose private book or management routes even with inconsistent metadata”; authenticated `orderStatus.js` | Media helper and authenticated order-status route tested; `salesOrderFulfillmentRoute.test.js` includes “does not leak capability URLs, tokens, contact data or private guest content.” Broader access-boundary compatibility review remains required; production status unverified |
| 20 | Price changes between quote/checkout → new decision | `salesApprovedOfferContract.test.js`: “requires explicit acceptance of a changed offer before the link can return”; reply “waits for renewed decision after an offer change” | Helper + route tested. Real quote freshness, destination fees and final provider amount remain required |

## 4. Verification ledger

Observed locally on 2026-10-05, while the draft was under active implementation:

1. `./node_modules/.bin/vitest run tests/salesApprovedOfferContract.test.js tests/salesApprovedMediaContract.test.js tests/salesConsentFollowupPolicy.test.js tests/salesHumanHandoff.test.js tests/salesHumanHandoffRoute.test.js tests/salesInboundDirectDelivery.test.js --maxWorkers=1 --minWorkers=1`
   **6 test files / 127 tests passed.** Synthetic Firestore/auth/provider effects only
2. `./node_modules/.bin/vitest run tests/salesReplyRoute.test.js -t 'opt-in conversational specification' --maxWorkers=1 --minWorkers=1`
   **19 tests passed; 112 skipped by name filter on the later rerun after the handoff-failure fallback change** (the earlier run passed 18). Intentional simulated task/exchange failures log errors; tests distinguish independently persisted truthful fallback from all-writes-unavailable/non-sendable failure
3. `./node_modules/.bin/vitest run tests/salesFollowupsRoute.test.js -t 'strict consent-aware reminders' --maxWorkers=1 --minWorkers=1`
   **10 tests passed; 34 skipped by name filter.** Real handler with synthetic effects; no provider send

4. `./node_modules/.bin/vitest run tests/salesConversationContract.test.js tests/salesEvidence.test.js tests/salesOrderFulfillmentRoute.test.js --maxWorkers=1 --minWorkers=1`
   **3 test files / 53 tests passed:** 12 contextual conversation, 8 evidence/cohort and 33 signed order/fulfillment/status tests. Expected injected Auth/book failures are asserted; no real account, book, email or payment was created

5. `./node_modules/.bin/vitest run tests/salesCheckoutQuoteStore.test.js --maxWorkers=1 --minWorkers=1`
   **1 test file / 9 tests passed.** Synthetic read-only provider quote records; no checkout was created

6. `./node_modules/.bin/vitest run tests/salesOfferApprovalRoute.test.js --maxWorkers=1 --minWorkers=1`
   **1 test file / 101 tests passed.** Synthetic catalog read/publication/authentication/concurrency checks; no production publication
7. `./node_modules/.bin/eslint src/app/api/sales-agent/offers/route.js src/lib/salesAgent/offerApprovalStore.js tests/salesOfferApprovalRoute.test.js`
   **Passed with exit code 0.** This is targeted lint, not a repository-wide lint pass

These are focused observations, not a final whole-repository pass. Later edits require reruns. At this review snapshot, no claim is made here that the full suite, repository-wide lint, production build, final revision CI, provider sandbox, deployed routing, or live delivery passed. Dedicated cohort API-handler coverage, full deployment/transport compatibility and live provider behavior remain outside these focused runs. Implementation inspection alone is not test evidence.

## 5. Activation gates and unset business facts

Every item below is a separate gate. Do not enable the main flag merely because unit tests pass.

### Commercial approval

- Approve and version the current catalog and each offer, with evidence, approver, approval time and validity interval; publish through an authorized server-only workflow
- Approve the complete total in ILS, tax treatment, included/extra delivery charges and destination rules; verify current checkout parity
- Approve included and excluded items, book type/dimensions, copies, page/blessing/photo limits and collection/access period
- Approve design selection, editing, print approval, included human help and exact customer responsibilities
- Approve production/delivery durations and the starting milestone; define urgent fulfillment review
- Approve service, date-change, cancellation and refund terms with current versioned URLs
- Define upgrades and additional copies independently, including eligibility and provider product mappings. Do not derive upgrade price by subtracting base packages
- Approve any actual coupons, permitted entitlement source and expiration. No default campaign urgency, bonus, testimony or customer count
- If there is a real free offer: approve precise free scope, limits, paid scope, matching campaign IDs, terms/start flow, authorization, book creation and optional upgrade. If there is no approved offer, retain mismatch handling

### Explicit catalog publication interface

`GET /api/sales-agent/offers` reads the current version/catalog and validation status. `POST` accepts an explicit publish request with `action: "publish"`, the expected current version (or `null` for an absent catalog), an approval evidence reference, and the complete owner-authored catalog without caller-supplied approval metadata. Both require a revoked-token-checked Bearer identity with verified email and superadmin status; the shared webhook secret does not authorize them.

The server stamps authenticated approver/time/version bindings, validates bounded nested commercial fields, and transactionally creates immutable version history before replacing current. Stale version, reused version and catalog identity conflicts are rejected. Request size is bounded to 128 KiB and catalog length to 50 offers. GET withholds malformed stored metadata. This API is an approval mechanism, not an automatic fact finder or checkout writer. Its existence does not approve any real offer, and this task did not call it against live storage. `salesOfferApprovalRoute.test.js` tests missing status without seeds, authenticated publication, validation, immutable history, concurrent publication conflicts, bounded input and aborted writes. No publication was performed against live storage. An explicitly published empty offer list disables active commercial offers; reusing an old catalog version is rejected, so reverting commercial terms requires a new explicitly approved version.

### Checkout and payment providers

- Implement/review the actual server-side quote creation/verification writer for `sales_checkout_quotes`; bind it to the existing hashed lead/event/offer idempotency identity
- Verify recent provider quote ID/reference, expiry, exact product/offer version/URL, currency, tax, shipping and final total. A public static product checkout URL is not a verified quote
- Define destination/extra-cost and unavailable-event-date handling; no invented checkout date or hidden fees
- Validate signed WooCommerce payloads for real gateways, paid dates, transaction IDs, currency and supported product/quantity mapping in an authorized sandbox
- Review unsupported add-on/upgrade/multiple-item orders: they must enter review rather than creating an arbitrary second book
- Review pre-existing order/book ownership and mapping compatibility, leases, duplicate requests, interrupted Auth creation and confirmation receipts
- Validate authenticated owner access and guest access separately. Complete the broader access-boundary compatibility review; production status remains unverified
- Verify approved email/WhatsApp transactional copy and delivery configuration. SMTP `accepted` is not delivery; `dispatching`, `uncertain` and `legacy_unknown` require reconciliation, not automatic replay

### Public demonstration media

- Supply real readable spread/video and cover examples for wedding, bar mitzvah, bat mitzvah and at least one additional event
- Attach exact asset/version/URL approval, public `sales_demo`/WhatsApp scope, rights basis and evidence, and specific consent evidence where personal/minor/customer material is present
- Review captions and actual-product representation. Illustration/workflow metadata is not proof of a real printed product
- Approve rights/context for any testimonial or television excerpt separately; do not insert unverified counts or endorsements
- Verify public asset availability and provider delivery in an authorized test. Legacy published files/uploads are not automatically approved for this new use

### Consent, reminder configuration and transport

- Main policy: `SALES_CONVERSATIONAL_POLICY_ENABLED=true` is the explicit switch; the default is off
- Existing sales settings must permit operation and be in `full_sales` mode. Strict reply rejects an unavailable direct Graph transport instead of emitting legacy Make send instructions
- Verify the official WhatsApp transport, canonical inbound IDs, customer/owner-echo discrimination and status callbacks in the actual integration
- Reminder activation additionally needs `SALES_CONSENT_FOLLOWUPS_ENABLED=true` and `SALES_CONSENT_FOLLOWUPS_ACTIVATED_AT` with an approved timestamp
- `SALES_CONSENT_FOLLOWUP_HOURS_JSON` must have `timeZone: "Asia/Jerusalem"` and explicitly approved weekly intervals. Existing legacy hours are not approval for strict mode
- `SALES_CONSENT_FOLLOWUP_DELAYS_HOURS` must have approved first/final delays; the parser enforces at least 3 and 48 hours respectively. The specification's 3–4 and 48–72 hours are proposed experiment windows, not permission to invent a schedule
- Approve customer-facing consent wording, source capture, max one/two scope and exact callback clarification behavior. Consent before activation does not silently enroll a backlog
- Outside 24 hours, require `SALES_FOLLOWUP_TEMPLATE_ENABLED=true`, matching `SALES_FOLLOWUP_TEMPLATE_NAME`, and verified `SALES_FOLLOWUP_TEMPLATE_APPROVAL_JSON` containing current approved name, Hebrew language, MARKETING category, sales-reminder purpose and provenance/check time
- Template metadata is configured evidence, not a live Meta approval lookup. Verify actual approval/purpose externally before activation and on revocation/change
- Strict reminders are direct-send only. Do not re-enable the legacy Make caller-delivers output to work around a missing final generation check
- Confirm overnight exclusions and handling of customer-requested time outside business hours. Exact callback time is not permission to ignore platform rules
- Complete appropriate privacy/direct-marketing review before sending. This document is an engineering release checklist, not legal advice

### Provider timestamps and delayed control messages

- Verify the authenticated transport maps `occurredAt` to the provider's actual customer-message timestamp, using Unix seconds/milliseconds or an explicitly offset/UTC timestamp. Never substitute server receipt time, delivery/admin activity, or a reconstructed current time
- `decideStrictInboundTime` fails closed for missing, ambiguous or future timestamps and events more than 15 minutes old. CRM revision handling rejects an older distinct inbound instead of superseding the current conversation, and persists provider occurrence separately from receipt time through completion
- Regression anchors in `salesHumanHandoff.test.js` are “anchors a delayed valid inbound to provider time through successful completion” and “does not let an older distinct inbound supersede current revision, window, or lease.” Their final results must be included after the timestamp changes, rather than inferred from earlier consent-window tests
- A trusted explicit stop is still a control action when delivery is delayed or its timestamp unusable: it must durably cancel queued marketing without opening a new service window or sending an ineligible free-form acknowledgment. Verify this separate suppression path before activation, including pending deliveries and duplicate control events
- Keep old/out-of-order conversational content from triggering new sales. Correct timestamp mapping is an activation dependency; a known transport mapping gap is not a reason to treat an unknown timestamp as fresh

### Operations and measurement

- Assign the human-service owner, approved support fallback and real queue-monitoring/notification workflow; approve any response-time commitment before using it
- Verify request → acknowledgment → resolution → explicit release. Resolution alone must retain takeover
- Implement the specific approved price-first/demo-first experiment only after offer/media/copy parity and immutable assignment/exposure semantics are reviewed; a legacy experiment must not be relabeled
- Verify order/refund reconciliation and source/route attribution; connect real ad, message, bot, product, shipping and processing costs before reporting acquisition economics
- Add reliable click/open/block/free-activation/first-real-blessing/human-response events only when actual authorized sources exist. Missing data remains unavailable
- Rerun final whole-repository checks and required CI against the exact reviewed revision. Merge, deployment, migrations and activation require separate authorization

## 6. Safe activation checklist

1. Complete the gates above, including compatibility review for behavior that is not behind the conversation flag
2. Review the final diff, focused tests, full suite, lint/build and exact commit checks; preserve a known-good revision and the pre-activation configuration
3. Keep customer sends disabled while exercising authorized synthetic/sandbox end-to-end flows: inbound → validated offer → verified checkout quote → signed paid order → one real test book → owner/guest separation → confirmation receipt
4. Verify failure/replay cases: new inbound during computation, delayed/out-of-order or unknown/future timestamp, delayed opt-out without a reopened window, takeover during computation, payment during computation, send failure, uncertain provider acceptance, duplicate webhook, failed Auth/book creation, expired offer/quote and changed total
5. Confirm old leads, old date-only follow-ups and orphan recovery are not enrolled. Do not manufacture consent or populate production approval data from test fixtures
6. Verify the actual delivery path respects `shouldSend:false` after strict direct sends and does not duplicate the message through an older integration route
7. Activate only the specifically authorized test cohort/transport controls. The current main switch is global; a cohort canary needs an explicit reviewed routing restriction, not an assumption that a hidden allowlist exists
8. Keep strict reminders separately off until real post-activation consent and configured hours/delays/templates are verified; run the bounded dry route without dispatch or permission claims
9. Confirm human tasks are visible to their responsible operator before routing users to them. Observe actual acknowledgments and preserve takeover until explicit release
10. Review prepared/accepted/delivered/failed/uncertain events separately, verify order/book creation counts, and stop on duplicate, stale or unapproved behavior. Do not infer delivery, clicks or purchase from intermediate state

## 7. Safe rollback checklist

1. Stop outbound work first through the existing agent-enabled setting and authorized transport/scheduler controls; preserve provider receipts and in-flight/uncertain state. Do not assume turning off one environment variable cancels an already accepted send
2. Disable strict reminder activation. Preserve `conversationalPolicyVersion`, strict schedule/consent markers, suppression, human task state, reminder consumption and inbound revisions
3. If disabling `SALES_CONVERSATIONAL_POLICY_ENABLED`, keep outbound paused until route compatibility is reviewed. Strict reply selection currently follows the global flag; do not unintentionally resume legacy conversation copy for a previously strict cohort
4. Retain the code-level `isStrictFollowUpLead` guard. With the main policy off, any lead marked by conversation-policy version, strict schedule version or sales-reminder consent must remain blocked from the legacy ladder
5. Never erase strict markers, reset reminder counters, revive strict orphan leads or convert precise schedules to legacy date-only follow-ups. Existing `followUpAt` by itself must not create permission
6. Do not roll back to a revision lacking that strict-cohort guard while any such leads can reach a scheduler. If a code rollback is required, leave outbound/sweep dispatch disabled or first ship a reviewed compatibility guard; verify with synthetic strict and legacy cohorts
7. Keep human takeover and marketing suppression effective through rollback. “Resolved,” elapsed time or owner release must not revive stale prepared messages or old consent
8. Preserve order locks, owner binding, book mapping and confirmation outbox. Do not delete completed locks or reset `dispatching`/`uncertain`/`accepted` to `pending` to make a retry work
9. Reconcile uncertain provider requests from actual receipts before any resend; re-run duplicate/new-inbound/payment/takeover checks before resuming authorized work
10. Record the reviewed revision/configuration and exact remaining gaps. Only report restored operation after actual verification; production status is otherwise unverified

Regression anchors for rollback are `salesConsentFollowupPolicy.test.js`, “does not downgrade a strict consent lead into the legacy ladder when rollout is disabled,” and the handoff/revision/final-dispatch tests. They do not authorize or verify a production rollback by themselves.
