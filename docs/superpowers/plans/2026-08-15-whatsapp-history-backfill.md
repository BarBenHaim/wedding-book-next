# WhatsApp History Backfill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Import every recoverable historical WhatsApp Business conversation into the existing BusinessOS lead table, extract factual sales fields, deduplicate it against live CRM data, and expose truthful import progress without sending customer messages.

**Architecture:** BusinessOS owns historical intake, durable import jobs, normalized historical messages, lead merging, payment matching, and the UI. Wedding Tales exposes a private extraction-only AI endpoint that reuses its Anthropic→OpenAI failover but has no WhatsApp-send capability. Meta Coexistence history and user-supplied WhatsApp exports enter the same canonical normalization pipeline; existing Firestore synchronization remains the stronger live source.

**Tech Stack:** Next.js 14/15 route handlers, TypeScript/JavaScript, Vitest, Drizzle/PostgreSQL, Firebase Admin, Web Crypto/Node crypto, Meta Graph API v25.0, existing Anthropic/OpenAI provider boundary.

**Spec:** `docs/superpowers/specs/2026-08-15-whatsapp-history-backfill-design.md`

## Global Constraints

- Importing history must send zero WhatsApp messages and make zero Meta Ads mutations.
- Missing facts must remain `null` or `unknown`; neither deterministic code nor AI may invent business data.
- Existing paid, owner-edited, or newer live CRM truth wins over imported history.
- Meta history may cover at most 180 days and is requested only after the receiver passes a synthetic production smoke test.
- Imported files are limited to one `.txt` or `.zip`, 12 MiB compressed, 40 MiB uncompressed, and 25,000 messages per job.
- Raw message/provider data must not appear in logs, analytics events, error responses, or marketing attribution streams.
- All fixtures use non-dialable identities such as `test-history-contact`, never realistic phone numbers.
- BusinessOS worktree: `C:/Users/DELL/AppData/Local/BusinessOS-worktrees/finance-control-center-clean`.
- Wedding Tales worktree: `C:/Users/DELL/OneDrive/Desktop/wedding-book-next/wedding-book/.worktrees/revenue-chat-closer`.

---

### Task 1: Canonical History Parsing and Fingerprints

**Files:**
- Create: `BusinessOS/src/lib/whatsapp-history/types.ts`
- Create: `BusinessOS/src/lib/whatsapp-history/fingerprint.ts`
- Create: `BusinessOS/src/lib/whatsapp-history/export-parser.ts`
- Create: `BusinessOS/src/lib/whatsapp-history/meta-parser.ts`
- Test: `BusinessOS/tests/unit/whatsapp-history-fingerprint.test.ts`
- Test: `BusinessOS/tests/unit/whatsapp-export-parser.test.ts`
- Test: `BusinessOS/tests/unit/whatsapp-meta-history.test.ts`

**Interfaces:**
- Produces `CanonicalHistoryMessage`, `ParsedHistoryConversation`, `parseWhatsAppExport(text)`, `parseMetaHistoryPayload(value)`, and `historyMessageFingerprint(message)`.
- Consumed by Tasks 2, 4, and 5.

- [ ] **Step 1: Write failing canonical fingerprint tests**

```ts
it('creates the same fingerprint for a replay and a different one for changed evidence', () => {
  const message = fixture({ source: 'meta_history', conversationKey: 'test-history-contact', sourceMessageId: 'wamid.fixture' });
  expect(historyMessageFingerprint(message)).toBe(historyMessageFingerprint({ ...message }));
  expect(historyMessageFingerprint({ ...message, text: 'different' })).not.toBe(historyMessageFingerprint(message));
});
```

- [ ] **Step 2: Run the fingerprint RED test**

Run: `npm test -- --run tests/unit/whatsapp-history-fingerprint.test.ts`

Expected: FAIL because `@/lib/whatsapp-history/fingerprint` does not exist.

- [ ] **Step 3: Implement canonical types and SHA-256 fingerprinting**

```ts
export type CanonicalHistoryMessage = {
  source: 'meta_history' | 'whatsapp_export';
  sourceMessageId: string | null;
  fingerprint: string;
  conversationKey: string;
  direction: 'inbound' | 'outbound' | 'unknown';
  occurredAt: Date | null;
  type: 'text' | 'image' | 'audio' | 'video' | 'document' | 'system' | 'unknown';
  text: string;
  deliveryStatus: 'sent' | 'delivered' | 'read' | 'failed' | null;
};
```

Hash only normalized source, conversation key, source ID, ISO timestamp, direction, type, and a text digest. Never log the hash input.

- [ ] **Step 4: Run fingerprint GREEN**

Run: `npm test -- --run tests/unit/whatsapp-history-fingerprint.test.ts`

Expected: PASS.

- [ ] **Step 5: Write failing Android/iOS export parser tests**

Fixtures cover:

```text
14/08/2026, 10:15 - Customer: יש לנו בר מצווה בדצמבר
[14.08.2026, 10:16:05] Wedding Tales: בשמחה, מה התאריך?
```

Assertions require chronological messages, bounded text, sender/direction preservation, multiline continuation, system-line handling, and explicit `null` timestamp for malformed dates.

- [ ] **Step 6: Run export parser RED**

Run: `npm test -- --run tests/unit/whatsapp-export-parser.test.ts`

Expected: FAIL because `parseWhatsAppExport` is missing.

- [ ] **Step 7: Implement the deterministic export parser**

Support the two shown date formats, optional seconds, multiline messages, Unicode direction marks, and `Messages and calls are end-to-end encrypted` system lines. Cap individual message text at 4,000 characters and total messages at 25,000. Return fixed warning codes such as `UNRECOGNIZED_LINE`, never raw rejected lines.

- [ ] **Step 8: Write and run Meta history parser RED**

```ts
expect(parseMetaHistoryPayload(metaFixture()).conversations[0]).toMatchObject({
  conversationKey: 'test-history-contact',
  phase: 1,
  chunkOrder: 2,
  progress: 55,
});
```

Run: `npm test -- --run tests/unit/whatsapp-meta-history.test.ts`

Expected: FAIL because the parser is missing.

- [ ] **Step 9: Implement Meta history normalization and GREEN all Task 1 tests**

Allow only phases `0..2`, integer chunk order/progress, supported message types, and allowlisted delivery statuses. History error `2593109` becomes warning code `HISTORY_SHARING_DISABLED`. Ignore provider error text.

Run: `npm test -- --run tests/unit/whatsapp-history-fingerprint.test.ts tests/unit/whatsapp-export-parser.test.ts tests/unit/whatsapp-meta-history.test.ts`

Expected: PASS.

- [ ] **Step 10: Commit Task 1**

```bash
git add src/lib/whatsapp-history tests/unit/whatsapp-history-fingerprint.test.ts tests/unit/whatsapp-export-parser.test.ts tests/unit/whatsapp-meta-history.test.ts
git commit -m "feat(whatsapp): normalize historical conversations"
```

---

### Task 2: Durable Import Jobs, Messages, and Merge Precedence

**Files:**
- Modify: `BusinessOS/src/db/schema.ts`
- Create: `BusinessOS/src/lib/whatsapp-history/history-store.ts`
- Create: `BusinessOS/src/lib/whatsapp-history/history-merge.ts`
- Modify: `BusinessOS/src/scripts/apply-whatsapp-leads-schema.ts`
- Test: `BusinessOS/tests/integration/whatsapp-history-schema.test.ts`
- Test: `BusinessOS/tests/unit/whatsapp-history-merge.test.ts`
- Test: `BusinessOS/tests/integration/whatsapp-history-store.test.ts`

**Interfaces:**
- Produces `stageHistoryImport`, `storeHistoryConversation`, `completeHistoryImport`, `failHistoryImport`, and `mergeHistoricalLead`.
- Consumes Task 1 canonical messages.
- Supplies Tasks 4–7 with durable state and truthful counts.

- [ ] **Step 1: Write schema RED tests**

Assert that `business_os.whatsapp_history_imports` and `business_os.whatsapp_history_evidence` exist with unique `external_key`/`fingerprint`, import state, source, counts, warnings, timestamps, and no provider-body column.

Run: `npm test -- --run tests/integration/whatsapp-history-schema.test.ts`

Expected: FAIL because the tables do not exist.

- [ ] **Step 2: Add Drizzle schema and idempotent SQL creation**

`whatsapp_history_imports` contains:

```ts
id, source, externalKey, status, phase, progress, conversationCount,
messageCount, importedCount, skippedCount, warningCodes, startedAt,
completedAt, createdBy, createdAt, updatedAt
```

`whatsapp_history_evidence` contains:

```ts
id, importId, whatsappLeadId, fingerprint, sourceSystem, sourceMessageId,
direction, messageType, boundedText, occurredAt, deliveryStatus, createdAt
```

Extend `whatsapp_leads` with `historySource`, `historicalOutcome`, `lossReason`, `historyConfidence`, `historySummary`, `historyImportedAt`, `paymentMatched`, and `paymentReference`.

- [ ] **Step 3: Run schema GREEN**

Run: `npm test -- --run tests/integration/whatsapp-history-schema.test.ts`

Expected: PASS.

- [ ] **Step 4: Write precedence RED tests**

Cover imported data filling empty fields while refusing to overwrite:

```ts
expect(mergeHistoricalLead(livePaidLead, historicalLostLead)).toMatchObject({ stage: 'closed_won', paymentMatched: true });
expect(mergeHistoricalLead(ownerEditedLead, historicalLead)).toMatchObject({ eventDate: ownerEditedLead.eventDate });
expect(mergeHistoricalLead(emptyLead, explicitHistoricalLead)).toMatchObject({ eventType: 'bar_mitzvah', historyConfidence: 'explicit' });
```

- [ ] **Step 5: Implement pure merge precedence and GREEN**

Use explicit source ranks: payment `400`, owner/live `300`, explicit history `200`, derived history `100`, unknown `0`. Minimize `firstContactAt`, maximize `lastMessageAt`, and never convert a paid lead to a weaker stage.

Run: `npm test -- --run tests/unit/whatsapp-history-merge.test.ts`

Expected: PASS.

- [ ] **Step 6: Write store RED tests for replay, rollback, and counts**

Use the existing database test pattern to assert identical file/chunk replay is a no-op, a changed digest creates a new job, message fingerprint conflicts fail closed, and a transaction rollback changes no counters.

- [ ] **Step 7: Implement transactional history store and GREEN**

The transaction must lock/read import and lead state before writes, upsert the lead under the existing phone key, insert evidence with `onConflictDoNothing`, and update counters from returned rows rather than requested rows.

Run: `npm test -- --run tests/integration/whatsapp-history-store.test.ts tests/unit/whatsapp-history-merge.test.ts`

Expected: PASS.

- [ ] **Step 8: Commit Task 2**

```bash
git add src/db/schema.ts src/lib/whatsapp-history src/scripts/apply-whatsapp-leads-schema.ts tests/integration/whatsapp-history-schema.test.ts tests/integration/whatsapp-history-store.test.ts tests/unit/whatsapp-history-merge.test.ts
git commit -m "feat(whatsapp): persist historical import truth"
```

---

### Task 3: Private AI Extraction Boundary in Wedding Tales

**Files:**
- Create: `Wedding/src/lib/salesAgent/historyExtraction.js`
- Create: `Wedding/src/app/api/sales-agent/history-extract/route.js`
- Test: `Wedding/tests/salesHistoryExtraction.test.js`
- Test: `Wedding/tests/salesHistoryExtractionRoute.test.js`

**Interfaces:**
- Accepts `{ conversationKey, messages: [{ direction, occurredAt, text }] }` with header `x-history-extract-secret`.
- Returns only `{ eventType, eventDate, celebrantName, stage, historicalOutcome, lossReason, summary, confidence, evidenceAt }`.
- Consumed by BusinessOS Task 4.

- [ ] **Step 1: Write extraction schema RED tests**

Assert deterministic validation, strict allowlists, 25,000-character aggregate prompt cap, no calls/phone directives, and `null` for unsupported fields.

Run: `npx vitest run tests/salesHistoryExtraction.test.js`

Expected: FAIL because the module does not exist.

- [ ] **Step 2: Implement strict parser and extraction prompt**

The prompt says in Hebrew: use only written evidence; never infer missing names/dates/payments/campaigns; classify phone-free WhatsApp selling outcomes; return evidence timestamps for every non-null field. Reuse `callClaude` so Anthropic remains primary and OpenAI remains fallback.

- [ ] **Step 3: Run extraction GREEN**

Run: `npx vitest run tests/salesHistoryExtraction.test.js`

Expected: PASS.

- [ ] **Step 4: Write route RED tests**

Cover 401 missing/incorrect secret, 400 malformed/oversize, 200 valid, 503 dual-provider failure, and privacy assertions that sentinels from transcript/provider bodies never appear in logs or responses.

- [ ] **Step 5: Implement route with no WhatsApp dependencies**

The route imports only the extractor/provider boundary and never imports `whatsapp.js`, `sendWhatsApp*`, follow-ups, Meta Ads, or lead-delivery mutation functions. Set `maxDuration = 30` and use the existing bounded provider deadline.

- [ ] **Step 6: Run Task 3 GREEN and regression**

Run: `npx vitest run tests/salesHistoryExtraction.test.js tests/salesHistoryExtractionRoute.test.js tests/salesAgent.test.js tests/salesReplyRoute.test.js`

Expected: PASS.

- [ ] **Step 7: Commit Task 3**

```bash
git add src/lib/salesAgent/historyExtraction.js src/app/api/sales-agent/history-extract/route.js tests/salesHistoryExtraction.test.js tests/salesHistoryExtractionRoute.test.js
git commit -m "feat(sales): extract historical WhatsApp lead facts"
```

---

### Task 4: Authenticated Export Preview and Confirm APIs

**Files:**
- Create: `BusinessOS/src/lib/whatsapp-history/archive.ts`
- Create: `BusinessOS/src/lib/whatsapp-history/extraction-client.ts`
- Create: `BusinessOS/src/lib/whatsapp-history/import-handler.ts`
- Create: `BusinessOS/src/app/api/crm/whatsapp-history/preview/route.ts`
- Create: `BusinessOS/src/app/api/crm/whatsapp-history/confirm/route.ts`
- Create: `BusinessOS/src/app/api/crm/whatsapp-history/[id]/route.ts`
- Test: `BusinessOS/tests/unit/whatsapp-history-archive.test.ts`
- Test: `BusinessOS/tests/integration/whatsapp-history-import-route.test.ts`

**Interfaces:**
- Preview accepts multipart field `file` and returns `{ previewToken, source, dateRange, messageCount, phoneAvailable, rowsToCreate, rowsToMerge, warnings }`.
- Confirm accepts `{ previewToken }` and returns `{ importId, status }`.
- Status returns allowlisted progress/count fields.

- [ ] **Step 1: Write archive safety RED tests**

Cover `.txt`, one-text-file `.zip`, 12 MiB compressed limit, 40 MiB expanded limit, traversal, duplicate entries, executable entries, encrypted archive, and decompression-bomb ratio.

Run: `npm test -- --run tests/unit/whatsapp-history-archive.test.ts`

Expected: FAIL because archive handling is missing.

- [ ] **Step 2: Add the smallest ZIP dependency and implement safe extraction**

Add `fflate` as the only new runtime dependency. Reject archives before extracting unsafe entries. Return only fixed error codes: `FILE_TYPE_UNSUPPORTED`, `FILE_TOO_LARGE`, `ARCHIVE_UNSAFE`, `ARCHIVE_INVALID`.

- [ ] **Step 3: Run archive GREEN**

Run: `npm test -- --run tests/unit/whatsapp-history-archive.test.ts`

Expected: PASS.

- [ ] **Step 4: Write API RED tests**

Cover unauthenticated requests, malformed multipart, truthful preview, preview token tampering, confirm idempotency, extractor degradation to `needs_review`, zero send/mutation capability, and privacy-safe errors.

- [ ] **Step 5: Implement preview tokens and extraction client**

Create an HMAC token using `WHATSAPP_HISTORY_IMPORT_SECRET` over file digest, parser metadata, expiry, and authenticated email. Tokens expire after 30 minutes. Call `https://app.weddingtales.co.il/api/sales-agent/history-extract` with `WEDDING_TALES_HISTORY_EXTRACT_SECRET`, a 25-second timeout, and fixed `HISTORY_EXTRACT_UNAVAILABLE` errors.

- [ ] **Step 6: Implement preview/confirm/status handlers**

Preview parses but writes nothing. Confirm stages the job and processes each conversation in deterministic order. If extraction is unavailable, persist normalized evidence and mark `needs_review`; do not discard the import.

- [ ] **Step 7: Run Task 4 GREEN**

Run: `npm test -- --run tests/unit/whatsapp-history-archive.test.ts tests/integration/whatsapp-history-import-route.test.ts`

Expected: PASS.

- [ ] **Step 8: Commit Task 4**

```bash
git add package.json package-lock.json src/lib/whatsapp-history src/app/api/crm/whatsapp-history tests/unit/whatsapp-history-archive.test.ts tests/integration/whatsapp-history-import-route.test.ts
git commit -m "feat(whatsapp): preview and import chat exports"
```

---

### Task 5: Meta Coexistence Webhook and One-Time Sync Gate

**Files:**
- Create: `BusinessOS/src/lib/whatsapp-history/meta-signature.ts`
- Create: `BusinessOS/src/lib/whatsapp-history/meta-history-handler.ts`
- Create: `BusinessOS/src/lib/whatsapp-history/meta-history-client.ts`
- Create: `BusinessOS/src/app/api/webhooks/whatsapp/history/route.ts`
- Create: `BusinessOS/src/app/api/crm/whatsapp-history/meta-sync/route.ts`
- Test: `BusinessOS/tests/unit/whatsapp-meta-signature.test.ts`
- Test: `BusinessOS/tests/integration/whatsapp-meta-history-route.test.ts`
- Test: `BusinessOS/tests/unit/whatsapp-meta-history-client.test.ts`

**Interfaces:**
- GET webhook verifies `hub.mode`, `hub.verify_token`, and returns numeric/string challenge.
- POST webhook verifies `x-hub-signature-256`, configured WABA/phone IDs, and stages history chunks.
- Authenticated sync route performs a dry receiver-health gate and then one POST to `/{PHONE_NUMBER_ID}/smb_app_data` with `{ messaging_product: 'whatsapp', sync_type: 'history' }`.

- [ ] **Step 1: Write signature RED tests**

```ts
expect(verifyMetaSignature(rawBody, validSignature, appSecret)).toBe(true);
expect(verifyMetaSignature(rawBody, changedSignature, appSecret)).toBe(false);
```

Include missing secret/signature, malformed hex, and timing-safe comparison tests.

- [ ] **Step 2: Implement signature verification and GREEN**

Run: `npm test -- --run tests/unit/whatsapp-meta-signature.test.ts`

Expected: PASS.

- [ ] **Step 3: Write webhook RED tests**

Cover verification GET, bad signature 401, wrong WABA/phone 409, history chunk 202, replay 202/no-op, contact sync accepted without lead mutation, message echo accepted without bot send, sharing-disabled terminal state, and logs containing no raw identities/content.

- [ ] **Step 4: Implement webhook handler and GREEN**

Use raw `request.text()` with a 2 MiB limit before JSON parse. Route only fields `history`, `smb_app_state_sync`, and `smb_message_echoes`. Never forward these payloads to the live reply endpoint.

- [ ] **Step 5: Write client/sync RED tests**

Cover exact Graph URL/version/body, missing config, timeout, safe non-2xx normalization, prior successful request no-op, and receiver-unhealthy rejection before Graph.

- [ ] **Step 6: Implement one-time sync client and GREEN**

Environment names are exact:

```text
WHATSAPP_HISTORY_APP_SECRET
WHATSAPP_HISTORY_VERIFY_TOKEN
WHATSAPP_HISTORY_ACCESS_TOKEN
WHATSAPP_HISTORY_PHONE_ID
WHATSAPP_HISTORY_WABA_ID
```

Store only returned request ID hash and accepted timestamp. Never return or log the token, Graph response body, WABA ID, phone ID, or raw request ID.

- [ ] **Step 7: Run Task 5 GREEN**

Run: `npm test -- --run tests/unit/whatsapp-meta-signature.test.ts tests/integration/whatsapp-meta-history-route.test.ts tests/unit/whatsapp-meta-history-client.test.ts`

Expected: PASS.

- [ ] **Step 8: Commit Task 5**

```bash
git add src/lib/whatsapp-history src/app/api/webhooks/whatsapp/history src/app/api/crm/whatsapp-history/meta-sync tests/unit/whatsapp-meta-signature.test.ts tests/integration/whatsapp-meta-history-route.test.ts tests/unit/whatsapp-meta-history-client.test.ts
git commit -m "feat(whatsapp): receive coexistence history safely"
```

---

### Task 6: Payment Matching and Existing Live Mirror Precedence

**Files:**
- Modify: `BusinessOS/src/lib/whatsapp-leads/lead-transform.ts`
- Modify: `BusinessOS/src/lib/whatsapp-leads/message-transform.ts`
- Modify: `BusinessOS/src/lib/whatsapp-leads/mirror-store.ts`
- Modify: `BusinessOS/src/lib/whatsapp-leads/firebase-reader.ts`
- Create: `BusinessOS/src/lib/whatsapp-history/payment-match.ts`
- Test: `BusinessOS/tests/unit/whatsapp-lead-transform.test.ts`
- Test: `BusinessOS/tests/unit/whatsapp-history-payment-match.test.ts`
- Test: `BusinessOS/tests/integration/whatsapp-history-live-merge.test.ts`

**Interfaces:**
- Produces `matchHistoricalLeadPayment(phoneKey, orders)` and stronger live mirror updates.
- Consumes public CRM orders and historical lead state.

- [ ] **Step 1: Write live precedence and payment RED tests**

Assert a historical lost row becomes `closed_won` when matched to a paid order, live Firestore fields replace lower-confidence history, imported evidence/messages remain, and ambiguous phone/order matches stay unmatched.

- [ ] **Step 2: Implement payment matching using existing private phone identity**

Normalize raw phone only inside the CRM boundary. Match a unique paid/processing order; set `paymentMatched`, `paymentReference`, amount, and `closed_won`. Multiple candidate customers without deterministic equality return `ambiguous` and write nothing.

- [ ] **Step 3: Extend Firestore reader and mirror precedence**

Read the existing live fields plus historical metadata that Wedding Tales may later write. Update `mirrorWhatsAppLeads` to apply live rank `300` while preserving imported evidence rows and explicit payment rank `400`.

- [ ] **Step 4: Run Task 6 GREEN**

Run: `npm test -- --run tests/unit/whatsapp-lead-transform.test.ts tests/unit/whatsapp-history-payment-match.test.ts tests/integration/whatsapp-history-live-merge.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit Task 6**

```bash
git add src/lib/whatsapp-leads src/lib/whatsapp-history/payment-match.ts tests/unit/whatsapp-lead-transform.test.ts tests/unit/whatsapp-history-payment-match.test.ts tests/integration/whatsapp-history-live-merge.test.ts
git commit -m "feat(whatsapp): reconcile historical leads with live sales"
```

---

### Task 7: BusinessOS Import Controls and Historical Lead BI

**Files:**
- Modify: `BusinessOS/src/lib/whatsapp-leads/lead-reader.ts`
- Modify: `BusinessOS/src/components/whatsapp-leads/whatsapp-lead-workbench.tsx`
- Modify: `BusinessOS/src/components/whatsapp-leads/whatsapp-conversation-profile.tsx`
- Create: `BusinessOS/src/components/whatsapp-leads/history-import-panel.tsx`
- Modify: `BusinessOS/src/app/(protected)/whatsapp-leads/page.tsx`
- Modify: `BusinessOS/src/app/globals.css`
- Test: `BusinessOS/tests/components/whatsapp-history-import-panel.test.tsx`
- Modify: `BusinessOS/tests/components/whatsapp-lead-workbench.test.tsx`
- Modify: `BusinessOS/tests/components/whatsapp-conversation-profile.test.tsx`

**Interfaces:**
- Reads import summaries and enriched lead fields from Tasks 2–6.
- Calls preview, confirm, status, and Meta sync routes.

- [ ] **Step 1: Write UI RED tests**

Cover file selection, preview facts/warnings, explicit confirm, progress states, safe failures, source/outcome/loss/payment/date filters, `unknown` labels, payment badge, and no raw transcript in the table.

Run: `npm test -- --run tests/components/whatsapp-history-import-panel.test.tsx tests/components/whatsapp-lead-workbench.test.tsx tests/components/whatsapp-conversation-profile.test.tsx`

Expected: FAIL because controls/fields are missing.

- [ ] **Step 2: Implement the import panel**

Use the existing RTL visual language. The primary actions are `בדיקת קובץ`, `אישור ייבוא`, and `סנכרון Meta עד 180 יום`. Provide 44 px touch targets, visible focus, reduced motion, mobile stacking at 320 px, and no phone-call action.

- [ ] **Step 3: Extend the table and dossier**

Add filters `live/history`, event type, historical outcome, loss reason, paid/unpaid, and known/unknown event date. Add row fields source, confidence, payment match, loss reason, and last contact. Keep phone and message content out of summary analytics cards.

- [ ] **Step 4: Run UI GREEN**

Run: `npm test -- --run tests/components/whatsapp-history-import-panel.test.tsx tests/components/whatsapp-lead-workbench.test.tsx tests/components/whatsapp-conversation-profile.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit Task 7**

```bash
git add src/lib/whatsapp-leads/lead-reader.ts src/components/whatsapp-leads src/app/'(protected)'/whatsapp-leads/page.tsx src/app/globals.css tests/components/whatsapp-history-import-panel.test.tsx tests/components/whatsapp-lead-workbench.test.tsx tests/components/whatsapp-conversation-profile.test.tsx
git commit -m "feat(whatsapp): operate historical lead imports"
```

---

### Task 8: Full Verification, Deployment, and One-Time Meta Operation

**Files:**
- Modify if required by verified production selectors only: `Wedding/.superpowers/sdd/2026-08-14-sales-agent-reliability/task-6-make-contract.md`
- No production source changes unless a failing verification produces a new TDD cycle.

**Interfaces:**
- Uses all prior tasks.
- Produces deployed BusinessOS/Wedding endpoints and a truthful Meta sync state.

- [ ] **Step 1: Verify both isolated worktrees are clean except planned commits**

Run in each worktree:

```bash
git status --short
git diff --check
```

Expected: empty status and clean diff after all task commits.

- [ ] **Step 2: Run complete Wedding Tales verification**

```bash
npx vitest run tests/
npx eslint src/lib/salesAgent/historyExtraction.js src/app/api/sales-agent/history-extract/route.js tests/salesHistoryExtraction.test.js tests/salesHistoryExtractionRoute.test.js
npm run build
```

Expected: all tests, lint, and build pass.

- [ ] **Step 3: Run complete BusinessOS verification**

```bash
npm test
npm run lint
npx tsc --noEmit
npm run build
```

Expected: all tests, lint, typecheck, and build pass.

- [ ] **Step 4: Deploy Wedding Tales production first**

Run: `npx vercel --prod --yes` from the Wedding worktree.

Verify deployment state `READY` and alias `https://app.weddingtales.co.il`.

- [ ] **Step 5: Configure the shared extraction secret**

Generate one 32-byte random base64url secret without printing it. Add the same value as:

- Wedding production/preview: `HISTORY_EXTRACT_SECRET`
- BusinessOS production/preview: `WEDDING_TALES_HISTORY_EXTRACT_SECRET`

Generate a second independent 32-byte base64url secret for BusinessOS production/preview as `WHATSAPP_HISTORY_IMPORT_SECRET`. Redeploy both projects after configuration.

- [ ] **Step 6: Deploy BusinessOS and apply schema**

Run schema creation against the production `DATABASE_URL` using `npm run db:push:whatsapp-leads`, then `npx vercel --prod --yes`. Verify `https://businessos-control.vercel.app/whatsapp-leads` loads authenticated and the import panel is visible.

- [ ] **Step 7: Configure Meta webhook credentials without exposing them**

In the business-owned Meta app, set callback URL:

```text
https://businessos-control.vercel.app/api/webhooks/whatsapp/history
```

Add the five exact BusinessOS production/preview environment variables from Task 5. Subscribe only `history`, `smb_app_state_sync`, and `smb_message_echoes`. Keep the existing Make `messages` scenario active.

- [ ] **Step 8: Run synthetic production history smoke**

Send a signed, non-dialable synthetic history fixture through an authenticated diagnostic path. Verify one staged/completed test import, zero WhatsApp sends, zero Meta Ads mutations, no PII in logs, and idempotent replay.

- [ ] **Step 9: Request the one-time Meta history sync**

From authenticated BusinessOS, invoke `POST /api/crm/whatsapp-history/meta-sync`. A 202 accepted response records the safe request hash. If the response is `HISTORY_WINDOW_CLOSED`, `HISTORY_SHARING_DISABLED`, or `HISTORY_ACCOUNT_INELIGIBLE`, stop retrying and surface that exact safe state in the UI.

- [ ] **Step 10: Monitor until terminal and reconcile**

Poll the import job state, not raw Make executions. Confirm phase/chunk progress, imported/skipped/warning counts, lead count growth, and payment matches. Record the earliest/latest imported dates and the unrecoverable period, if any.

- [ ] **Step 11: Final production smoke**

Verify:

- Make scenario `9630287` remains Active.
- A new live inbound message still follows the existing bot path exactly once.
- A historical import causes no reply or owner notification.
- BusinessOS mobile table shows the imported source/outcome/payment fields.
- Re-importing the same file/chunk is a no-op.

- [ ] **Step 12: Commit operational evidence if tracked and report**

Do not commit secrets, exports, raw conversations, or production payloads. Commit only sanitized test/contract evidence when it belongs in the repository.
