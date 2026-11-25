# WhatsApp customer inbox: implementation plan

**Spec:** `docs/superpowers/specs/2026-11-25-whatsapp-customer-inbox-design.md` (approved 25.11).

**Goal:** stop selling to existing customers, keep what identified customers send, and let Claude read it here.

**Architecture:** the reply route schedules one capture right after the event claim; the capture runs after the response (`after()`), so it cannot slow or change a reply. A local script reads the collection.

**Execution:** inline, test first. Commit and deploy only with Lord's approval.

## Global constraints

- Node 20.15, package is CommonJS: scripts are `.mjs` and cannot import `src/**/*.js`.
- Collection `customer_inbox/{eventId}` (server only, default deny). Storage path `customer-inbox/…`.
- No phone numbers or message text in logs.
- No automatic action on a book and nothing sent to a customer.

## Review focus

- A capture failure or slow Meta download must leave the HTTP reply identical.
- A retried provider message must not reset an item already marked handled.
- A customer inside the 48h pause, or a stale message, is still captured.
- Leads, the owner and echoes are never stored.
- A purge or forget must never delete another customer's items.

## Tasks

- [ ] **1. Recognise the customer on every message.** `reply/route.js`: drop the `lead.isNew` condition. Test: returning lead (not new, no stage) with a matching wedding gets the customer branch, not the model. `leads.js` `findCustomerByPhone` uses `phoneVariants`.
      Deviation from the spec: no `customerWeddingId` is stored; checking every message makes it redundant.
- [ ] **2. Pure rules** `lib/salesAgent/customerInboxCore.js`: `phoneVariants(raw)`, `isCapturable(body)`, `buildInboxItem({ phone, body, matches })`, `mediaExtension(mime)`, `MAX_MEDIA_BYTES = 25 MB`. Test `tests/customerInboxCore.test.js`.
- [ ] **3. Capture** `lib/salesAgent/customerInbox.js`: `downloadInboundMedia(mediaId, deps)`, `captureCustomerMessage({ eventId, phone, body }, deps)`, `scheduleCustomerCapture(args)` (never throws). Test `tests/customerInbox.test.js`.
- [ ] **4. Hook** the route after the claim, skipping owner and echoes. Tests in `salesReplyRoute.test.js`.
- [ ] **5. Reader** `scripts/inbox.mjs` (`list`, `get`, `done`, `purge`, `forget`) with pure logic in `scripts/lib/inbox-view.mjs`, test `tests/inboxView.test.js`. Run `list` against the real database.
- [ ] **6. Verify** full suite, lint on changed files, production build; update `AGENTS.md`.
