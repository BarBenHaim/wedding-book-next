# Smart WhatsApp Follow-Ups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make scheduled WhatsApp follow-ups context-aware, media-capable, coupon-safe, and attributable to delivery and purchase outcomes.

**Architecture:** A pure strategy planner selects the next sales move from lead state and attempt number. The existing follow-up route uses that immutable plan for prompt composition and transport, while the delivery ledger persists only bounded strategy metadata. Meta templates remain the only transport outside the 24-hour service window.

**Tech Stack:** Next.js 15 route handlers, JavaScript, Firebase Admin/Firestore transactions, WhatsApp Graph API, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-08-smart-whatsapp-followups-design.md`

## Global Constraints

- Keep the existing maximum of three delivered follow-ups and the 1/3/7-day cadence.
- Use `https://weddingtales.co.il` as the only website CTA.
- Never send a coupon unless its configured expiry is in the future and no more than 48 hours away.
- Never send free-form content outside the 24-hour WhatsApp service window.
- Never log customer text, phone numbers, provider response bodies, tokens, coupon assignments, or media URLs.
- Preserve delivery idempotency: only the primary delivered/read event advances cadence.

---

### Task 1: Pure sales strategy planner

**Files:**
- Create: `src/lib/salesAgent/followupStrategy.js`
- Create: `tests/salesFollowupStrategy.test.js`

**Interfaces:**
- Produces: `readFollowUpOffer(env, nowMs) -> { code, expiresAt } | null`.
- Produces: `planFollowUp(lead, { attempt, isFinal, offer, customerName }) -> FollowUpPlan` matching the design contract.

- [x] **Step 1: Write failing tests** for first-touch proof/site/video, stage-aware second touch, high-intent final coupon, low-intent final close, invalid/expired/over-48-hour coupons, bounded template parameters, and absence of phone/message/media URL data.
- [x] **Step 2: Run `npx vitest run tests/salesFollowupStrategy.test.js`** and verify failure because the module does not exist.
- [x] **Step 3: Implement the pure planner and offer parser** with fixed IDs, fixed template names, one CTA, allowlisted high-intent stages, and the canonical website URL.
- [x] **Step 4: Run `npx vitest run tests/salesFollowupStrategy.test.js`** and verify all planner tests pass.

### Task 2: Bind the strategy to composition and transport

**Files:**
- Modify: `src/lib/salesAgent/prompt.js`
- Modify: `src/app/api/sales-agent/followups/route.js`
- Modify: `src/lib/salesAgent/whatsapp.js`
- Modify: `tests/salesAgent.test.js`
- Modify: `tests/salesFollowupsRoute.test.js`
- Modify: `tests/salesWhatsApp.test.js`

**Interfaces:**
- Consumes: `planFollowUp` and `readFollowUpOffer` from Task 1.
- Produces: `buildFollowUpPrompt(..., { strategy })` with a binding strategy block.
- Produces: allowlisted template parameter counts for `wt_followup_site`, `wt_followup_help`, `wt_followup_offer`, and `wt_followup_close`.

- [x] **Step 1: Write failing prompt tests** proving the exact objective, CTA, site, coupon gate, and no-discount instruction reach the model.
- [x] **Step 2: Write failing route tests** proving each attempt selects the expected template; in-window first touch sends one available unsent video with a separate non-advancing outbound ID; outside-window work uses the site's approved video header and never sends free-form video; repeated video is suppressed.
- [x] **Step 3: Write failing WhatsApp tests** proving the four exact template parameter counts and rejection of every unknown/mismatched template.
- [x] **Step 4: Run the three focused files** and verify the new assertions fail for missing behavior.
- [x] **Step 5: Implement the minimal prompt, route, video transport, and template allowlist changes.** Reuse `sendWhatsAppVideo` in-window; do not add a second cadence owner.
- [x] **Step 6: Re-run the three focused files** and verify they pass.

### Task 3: Persist attribution without weakening delivery truth

**Files:**
- Modify: `src/lib/salesAgent/leads.js`
- Modify: `tests/salesDeliveryFirestore.test.js`
- Modify: `tests/salesFollowupsRoute.test.js`

**Interfaces:**
- Extends: `prepareFollowUpDelivery` with `followUpStrategyId`, `followUpCta`, and `followUpMediaKind`.
- Produces: lead fields `lastFollowUpStrategyId`, `lastFollowUpCta`, and `lastFollowUpMediaKind` only after primary delivered/read evidence.

- [x] **Step 1: Write failing Firestore tests** proving requested/accepted do not claim strategy success, delivered/read writes the bounded attribution once, secondary video cannot advance or overwrite it, and replay remains a no-op.
- [x] **Step 2: Run `npx vitest run tests/salesDeliveryFirestore.test.js tests/salesFollowupsRoute.test.js`** and verify the attribution assertions fail.
- [x] **Step 3: Implement the minimal delivery-record and lead-patch fields** with strict string allowlists and no raw content.
- [x] **Step 4: Re-run the focused delivery and route tests** and verify they pass.

### Task 4: Production template and release verification

**Files:**
- Modify only if needed after verification: `docs/superpowers/specs/2026-09-08-smart-whatsapp-followups-design.md`

**Interfaces:**
- Uses the existing Meta Business account and Wedding Tales Vercel project.
- Produces four inactive-or-approved Hebrew templates with names and parameter counts matching Task 2.

- [x] **Step 1: Run the focused regression group** covering follow-up policy, prompt, route, WhatsApp transport, delivery, and Firestore transaction tests.
- [x] **Step 2: Run `npm test`, changed-file ESLint, `npm run build`, and `git diff --check`.**
- [ ] **Step 3: Deploy the verified commit to production** and wait for the Vercel deployment and alias to become ready.
- [ ] **Step 4: Create or inspect the four Meta templates** without activating any unapproved content; record each exact approval state.
- [ ] **Step 5: Run an authenticated dry run** and verify strategy selection without writes or sends.
- [ ] **Step 6: If at least the selected template is approved, run one bounded production attempt; otherwise leave the queue due and report the single external blocker truthfully.**
