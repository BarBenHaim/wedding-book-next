# WhatsApp Opening Experiment Builder

Date: 2026-08-24

Status: approved in conversation; the owner explicitly requested immediate autonomous execution.

Repositories:

- Wedding Tales (`wedding-book`) is the runtime and source of truth.
- BusinessOS is the authenticated control plane and reporting surface.
- Make is transport only. It must not contain business rules, assignment logic, or experiment truth.

## Goal

Build an owner-controlled, deterministic WhatsApp opening system that can run editable A/B/C journeys, measure what happens after each opening, and expose a usable lead table. It must help Wedding Tales learn which opening produces relevant conversations and verified sales without reviving the free-form AI bot.

## Non-negotiable boundaries

- No phone-call offers or phone-call actions.
- No free-form AI conversation. Published blocks are the only executable behavior.
- Existing conversations are not injected into a journey automatically.
- Draft saves never send messages.
- The global switch and each variant switch fail closed.
- A lead stays on its originally assigned published revision.
- A delivery failure never counts as exposure or progress.
- A generated child design is never sent before owner approval.
- Runtime stores no customer image bytes in Firestore. It stores provider media identity, a private generated asset reference, and bounded metadata only.
- The current Make scenario remains inactive during development and automated tests.

## Ownership and data flow

BusinessOS edits and previews flows, uploads or selects registered media, publishes immutable revisions, stops variants, reviews generated designs, and reads aggregate results. Wedding Tales validates every document again, assigns a sticky variant, advances the lead state machine, prepares idempotent outbound parts, records delivery callbacks, and computes experiment truth from durable lead and delivery facts. Make receives ordered parts and sends them; it does not select variants or advance the funnel.

## Versioned experiment model

The active settings document contains one experiment with a global `enabled` flag, `minSamplePerVariant: 30`, and three variants. A published variant has `id`, `label`, `enabled`, `weight`, `revision`, and an ordered block list. Publishing validates the complete experiment and writes the replaced document to history before incrementing the settings revision.

Assignment uses a stable SHA-256 bucket derived from normalized lead identity and experiment revision. Only enabled variants with positive weight participate. The assigned `variantId` and `variantRevision` are written once on first contact. Later edits or weight changes affect only newly assigned leads.

## Allowed blocks

Version one deliberately has no arbitrary code, loops, or general branching. It supports these allowlisted blocks:

- `text`: exact owner-authored WhatsApp text.
- `media`: one registered image, video, or audio asset plus an optional caption.
- `ask_event`: exact question that waits for a text reply and captures supported event type and date with deterministic parsing.
- `ask_photo`: exact question that waits for an inbound image.
- `generate_design`: generates a fixed-template preview from the acknowledged inbound photo and creates an approval item.
- `wait_owner_approval`: stops until an authenticated owner decision.
- `send_approved_design`: sends only the exact approved generated asset.
- `stop`: ends the automated journey and leaves the conversation to the owner.

The validator enforces bounded text, registered media keys, at most 20 blocks per variant, exactly one terminal `stop`, no executable block after `stop`, and correct ordering of photo, generation, approval, and approved send.

## Default variants

### A — personal example

1. Explain in a few lines what the printed blessing book is and how guests add blessings and photos.
2. Ask for a photo of the son to prepare a personal example.
3. Wait for an image.
4. Generate the fixed-template example.
5. Wait for owner approval.
6. Send the approved example.
7. Stop.

### B — proof pack

1. Send the owner-configured ordered pack of text, images, video, and audio/voice-note assets.
2. Ask for event type and date.
3. Wait for the answer, capture what can be proven, and stop.

### C — qualify first

1. Ask event type and date.
2. Wait until the reply is captured.
3. Continue through a pinned copy of the currently published A journey.
4. Stop after the approved design has been sent.

## Runtime state machine

An inbound event is claimed with the existing idempotency mechanism before any work. The engine reads the lead assignment and pinned flow revision, then returns one of `send_parts`, `wait`, `approval_pending`, `completed`, or `silent`. It executes consecutive sendable blocks until the next wait boundary, prepares a stable outbound ID per part, and persists the next cursor atomically with the inbound completion. A duplicate event returns the cached outcome and performs no new send or generation work.

Text qualification is deliberately conservative. Known event labels and unambiguous Israeli-style dates are captured. Ambiguous text is preserved as a bounded qualification note and marked `needsReview`; it is never invented into structured truth. An inbound image satisfies `ask_photo` only when that exact pinned flow is waiting for a photo.

## Fixed-template design and approval

Wedding Tales downloads the inbound image through the WhatsApp Cloud media endpoint with a bounded timeout, renders a deterministic branded PNG with `sharp`, uploads it under a non-public generated-sales prefix, and creates one approval row keyed by lead hash and flow attempt. Generation is idempotent. BusinessOS receives a short-lived signed preview URL, never a token or raw provider payload.

The owner can approve, reject, or request replacement. Approval records actor and timestamp. Approval does not silently bypass the global or variant kill switch. `send_approved_design` may run only for an approved row whose lead, variant, revision, and attempt match. A successful provider acceptance becomes pending; exposure/progress changes only on delivered/read callback.

## Measurement contract

An exposure exists only after a delivered/read callback for the first outbound part of the assigned variant. The dashboard reports reply within one hour, 24 hours, and 72 hours; 24 hours is the headline response rate.

Continuation means the lead achieved at least one post-response milestone: event detail captured, child photo received, design approved, payment link sent, or verified payment. Relevance has three states:

- `relevant`: supported future event, or clear purchase intent such as photo submission, price/payment request, or payment-link request.
- `not_relevant`: spam, wrong number, unsupported/past/cancelled event, or explicit refusal.
- `unknown`: insufficient evidence. Unknown is never counted as not relevant.

Verified payment is the primary business outcome. WooCommerce checkout starts and Morning deal documents do not count. A variant is labelled `trend` until every compared enabled variant has at least 30 delivered exposures. Only then may BusinessOS display `leader`; it still shows raw denominators and does not claim statistical certainty.

## Lead table

The authenticated table shows: masked phone, name, source/campaign, assigned variant and revision, event type/date and days remaining, relevance and reason, journey cursor, last outbound delivery, first reply time, continuation milestones, design approval state, payment-link state, verified payment, and next required action. It supports text search and filters for variant, relevance, stage, approval, and payment. Transcript content is not returned by the experiment endpoint.

## BusinessOS experience

The page uses the existing dark Revenue Control Room language rather than a new visual theme. Its memorable element is a three-lane journey bench: A, B, and C are displayed as vertical WhatsApp timelines made of draggable cards, with the selected lane rendered inside the existing phone preview. The surrounding UI stays restrained.

Tokens stay aligned with the product: Night `#0a0f16`, Raised `#101924`, Moon `#f5f8fb`, Fog `#a8b6c7`, Mint `#6ee7ba`, Amber `#f8c35c`, Violet `#a79bff`. Existing Arial/Noto Sans Hebrew remains the body face; `ui-monospace` is used only for revision, variant, and metric labels. The interface has five views: Experiment, Journeys, Leads, Approvals, and History. It supports 320px width, 44px targets, visible focus, keyboard reordering controls alongside drag, and reduced motion.

## Failure behavior

Invalid settings return fixed safe errors and leave the prior revision active. Missing lead state, missing pinned revision, invalid cursor, generation failure, or unavailable approval state sends nothing and raises an owner-visible action. Network/provider bodies are never returned or logged. The dashboard distinguishes accepted, delivered, read, failed, and unknown rather than collapsing them into “sent”.

## Acceptance criteria

- A/B/C are present as editable defaults and can be enabled/stopped independently.
- Saving a draft does not publish; publishing is revisioned and restorable.
- Assignment is sticky and uses only enabled positive-weight variants.
- Initial and continued steps use no language model.
- Existing/prior conversations remain silent unless manually enrolled.
- A received photo creates one generated approval item and cannot be sent before approval.
- Exposure, response, continuation, relevance, and verified payment metrics follow the definitions above.
- The lead table exposes the full experiment state without transcripts or raw media identities.
- The page is usable at 320px and by keyboard.
- Existing sales-agent, delivery, payment, and BusinessOS suites remain green.

