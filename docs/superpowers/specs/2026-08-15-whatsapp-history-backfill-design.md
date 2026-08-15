# WhatsApp History Backfill Design

## Objective

Build a safe, repeatable historical-ingestion path that turns the business's past WhatsApp Business conversations into structured CRM lead rows. The result must extend the existing `sales_leads` table beyond the events captured since the live Make scenario was connected, without sending messages, overwriting better live data, or inventing facts.

The customer-facing outcome is one table containing every recoverable historical lead with the fields needed to understand the sales journey: identity, event details, lead status, outcome, loss reason, last contact, acquisition source, and payment match.

## Platform Boundaries

WhatsApp Cloud API does not expose an unrestricted endpoint for downloading all prior chats. A number onboarded through WhatsApp Business App Coexistence can request a one-time history synchronization for up to 180 days, subject to Meta eligibility, the business having enabled history sharing, and the synchronization window still being open. The result arrives asynchronously as `history` webhook chunks.

The current Make `whatsapp-business-cloud:watchEvents2` trigger exposes standard message fields but does not expose a typed `history[].threads[]` payload in its module interface. The existing live conversation flow therefore remains unchanged until a separate history receiver is ready.

Conversation history older than Meta's available range can only be recovered from user-provided WhatsApp chat exports. The system will accept standard `.txt` chat exports and WhatsApp export `.zip` files containing a chat text file. Encrypted device or Google Drive backups are out of scope because the application cannot safely or officially decrypt them.

## Architecture

The feature has four isolated units:

1. **History intake** validates and stages either Meta Coexistence history chunks or uploaded WhatsApp export files.
2. **Conversation normalization** turns source-specific messages into one internal, chronological conversation format and removes duplicates by stable message fingerprint.
3. **Lead extraction and merge** derives structured CRM fields from evidence, records confidence and evidence timestamps, and merges them into `sales_leads` without weakening live or payment-confirmed truth.
4. **Import visibility** shows progress, source, failures, and the resulting historical rows in the existing BusinessOS/CRM experience.

The pipeline is asynchronous. Intake returns quickly, creates an import job, and processing is resumable. Replaying the same Meta chunk or export file produces no duplicate leads, turns, or jobs.

## Data Sources and Priority

Truth is merged in this order, from strongest to weakest:

1. Paid order or payment-provider evidence.
2. Existing live CRM fields written by the sales agent or an authenticated owner edit.
3. Explicit statements found in historical messages.
4. AI classification derived from the historical conversation.
5. Unknown.

Meta ad referral identifiers and CTWA metadata are retained when present. Historical conversations without referral data are not assigned to a campaign by inference. Payment matching uses normalized phone identity and existing order/customer joins; ambiguous matches remain unmatched.

## Canonical Conversation Model

Each normalized message contains only:

- `source`: `meta_history` or `whatsapp_export`
- `sourceMessageId`: original Meta message ID when available
- `fingerprint`: SHA-256 of normalized source, conversation identity, timestamp, direction, type, and text digest
- `conversationKey`: private normalized phone key when available, otherwise an import-scoped anonymous key
- `direction`: `inbound`, `outbound`, or `unknown`
- `occurredAt`: ISO timestamp or `null`
- `type`: `text`, `image`, `audio`, `video`, `document`, `system`, or `unknown`
- `text`: bounded message text used during extraction
- `deliveryStatus`: allowlisted Meta history status or `null`

Imported media binaries are not retained. Captions and type markers may be used as evidence. Raw provider errors and access credentials are never stored.

## Structured Lead Model

Historical extraction produces the following fields:

- `phone`, when available
- `name`
- `lastName`
- `profileName`
- `eventType`
- `eventDate`
- `celebrantName`
- `stage`
- `historicalOutcome`: `paid`, `ready_to_pay`, `qualified`, `engaged`, `unresponsive`, `not_relevant`, `lost`, or `unknown`
- `lossReason`
- `lastContactAt`
- `firstContactAt`
- `source`
- `campaignId`, `adsetId`, `adId`, and `ctwaClid` when explicitly present
- `paymentMatched`
- `paymentReference`
- `historyImportedAt`
- `historySource`
- `historyConfidence`: `explicit`, `derived`, or `unknown`
- `historySummary`: a short factual sales summary

Days until the event is computed at read time from `eventDate`; it is not stored as stale data.

The extractor must return `unknown` or `null` when evidence is missing. It may classify intent and outcome but may not invent names, dates, event types, reasons, payments, or campaign attribution.

## Merge Rules

An imported conversation joins an existing lead by normalized phone. If no phone is available, it remains an anonymous historical row until a deterministic identity is later supplied.

Imported data may fill an empty field but does not overwrite:

- `closed_won` or payment-confirmed state
- an owner-edited field
- a newer live CRM value
- a more explicit historical value with higher confidence

Conversation timestamps update `firstContactAt` and `lastContactAt` by minimum and maximum respectively. Imported turns are stored separately from the live agent's bounded prompt turns, so a large history cannot inflate model prompts or disrupt the current WhatsApp bot.

## Meta Coexistence Intake

The system adds a dedicated raw webhook receiver for three coexistence fields:

- `history`
- `smb_app_state_sync`
- `smb_message_echoes`

The receiver verifies the Meta signature, enforces a request-size limit, accepts only the configured phone-number identity, and persists each history chunk by a deterministic import key containing phase and chunk order. It reports sync progress without exposing message content or phone numbers in logs.

History synchronization is requested only after the receiver is deployed and a dry validation confirms that a synthetic Meta history payload reaches staging. The request is issued once. If Meta reports that history sharing is disabled, the CRM records a safe actionable status and does not repeatedly retry the one-time operation.

The existing Make live-message scenario remains active throughout. No history payload is routed through the sales reply endpoint, so importing history can never cause an automated response.

## WhatsApp Export Intake

BusinessOS adds an authenticated import control accepting one `.txt` or `.zip` at a time. The server enforces bounded compressed and uncompressed sizes, rejects archive traversal and executable content, and parses the common Android and iOS WhatsApp export date/header formats.

The preview step reports only:

- recognized conversation identity
- detected date range
- message count
- whether a phone number was available
- rows that would be created or merged
- validation warnings

The user confirms the preview before persistence. Uploading the same export again is a no-op identified by a content digest.

## AI Extraction

AI processes a bounded, chronological representation of the conversation after deterministic parsing. Long conversations are segmented, summarized, and reduced into a final structured classification. The response must conform to a strict schema; malformed output is retried once and otherwise leaves the job in `needs_review`.

Both Anthropic and OpenAI can be used through the existing resilient provider boundary. The prompt contains a fixed no-invention rule and requests evidence timestamps for every non-null business field. Provider failures never discard staged history, and a job can resume without re-uploading.

## BusinessOS and CRM Experience

The existing leads table gains filters for:

- live versus historical source
- import job
- event type
- historical outcome
- loss reason
- paid/unpaid
- known/unknown event date

Each row shows name, phone, event type, event date, days until event, current stage, historical outcome, loss reason, last contact, source, payment match, and confidence. A compact import panel shows job status, progress, row counts, warnings, and retry actions.

Full imported transcripts are not rendered in the main table. A row may expose a short factual summary and bounded evidence timestamps to make classification reviewable.

## Privacy and Safety

- Importing never sends WhatsApp messages or changes Meta campaign budgets.
- Raw history is server-only and never written to browser logs, application logs, analytics, or marketing attribution streams.
- Phone numbers remain inside the CRM boundary; BusinessOS marketing joins continue to use private phone keys.
- Uploads and staged raw payloads have a retention limit. After successful structured extraction and a repair window, raw text is deleted while normalized fields, fingerprints, and audit metadata remain.
- All endpoints require existing authenticated admin access or a dedicated signature/secret.
- Every failure response uses fixed error codes and excludes provider bodies, message content, credentials, and contact details.

## Failure Handling and Observability

Import jobs have the states `staged`, `processing`, `completed`, `partial`, `needs_review`, and `failed`. Each step records counts and allowlisted error codes. A failed chunk or conversation can be retried independently.

Progress is truthful: a job is `completed` only after every recognized conversation is normalized and merged. Unsupported records are counted and surfaced as warnings rather than silently dropped.

## Testing Strategy

Implementation follows test-driven development and includes:

- Meta signature, phone-identity, size, duplicate-chunk, progress, and history-sharing-disabled tests
- Android and iOS export parsing fixtures using non-dialable test identities
- ZIP traversal, compression-limit, malformed-file, and duplicate-upload tests
- deterministic message fingerprint and chronological merge tests
- extraction schema, no-invention, malformed-model, provider-fallback, and resume tests
- precedence tests proving imported data cannot overwrite paid, owner-edited, or newer live truth
- route tests proving import performs zero WhatsApp sends and zero campaign mutations
- authenticated BusinessOS preview/confirm/status tests
- mobile and RTL table tests for the added columns and filters

## Rollout

1. Deploy intake, staging, normalization, extraction, merge, and import visibility with Meta sync disabled.
2. Validate the pipeline end to end using synthetic history and export fixtures.
3. Deploy production and confirm the receiver is healthy.
4. Request Meta Coexistence history once if the account is eligible and the window remains open.
5. Monitor chunk progress until terminal state, then reconcile lead and payment counts.
6. Use WhatsApp exports for conversations outside Meta's recoverable range.
7. Keep ongoing `smb_message_echoes` and standard live webhooks feeding the same CRM identity without duplicating the existing sales-agent path.

## Acceptance Criteria

- Every Meta history message delivered to the receiver is either imported once or counted with an explicit warning.
- Replaying a chunk or file creates no duplicate messages, leads, or job counts.
- Existing live and paid CRM truth wins over weaker historical extraction.
- Historical rows contain the requested business fields or explicit unknown values.
- Import sends no WhatsApp messages and makes no Meta Ads mutations.
- The CRM shows source, progress, payment match, confidence, and reviewable outcome for every imported conversation.
- Meta history limitations and any unrecoverable period are displayed truthfully.
