# WhatsApp sales canary — 2026-08-16

- Production code commit: `d5d6ec2a`
- Production deployment: `dpl_HeXNdKPtv3zyYj1fLaWZx7H9cHTd`
- Production URL: `https://the-wedding-gift-970dk42iz-barbenhaims-projects.vercel.app`
- Production alias: `https://app.weddingtales.co.il`
- Live Make scenario: `9630287`, active
- Make verification: recent successful instant executions; no execution running during inspection
- Make authentication: repaired and aligned with the Wedding Tales sales-agent secret
- Kill switch: Wedding Tales sales agent enabled

## Production policy smoke

The smoke used isolated non-dialable test identities only. It did not contact a
real customer, and every exact synthetic lead was deleted after the run.

- Price: HTTP 200, one concise reply, verified catalog price present
- Demo request: HTTP 200, one reply, at most one question
- Broken checkout: HTTP 200, one diagnostic question, no repeated payment URL
- Positive signal: HTTP 200, one next-step reply
- Negative exit: HTTP 200, lead moved to `closed_lost`, no handoff loop
- Duplicate event: HTTP 200, zero sends
- Stale event: HTTP 200, zero sends
- Every reply: no phone-call offer and no automatic human handoff

## Revenue truth

- A WooCommerce form start or pending checkout is not counted as revenue.
- Only WooCommerce `processing` or `completed` orders can verify a win.
- Verified order IDs are idempotent; manual `closed_won` values stay unverified.
- Experiment winners and revenue KPIs use verified payments only.
- The current catalog prices used by deterministic replies are 690 / 950 / 1490 ILS.

## Degraded provider behavior

The external phrasing provider is currently unavailable. The deterministic,
catalog-grounded sales engine remains live: it answers common price, process,
proof, objection, buying-intent, checkout-friction, and negative-exit turns.
The dashboard reports this as an amber catalog fallback, not a false total
outage. Connect a valid AI provider key to improve phrasing; sales replies do
not stop in the meantime.

## Verification

- Test suite: 57 files, 985 tests passed
- ESLint: 0 errors (66 pre-existing warnings)
- Production build: passed, including all 29 static pages
- Production policy smoke: passed after final deployment

## Operating guardrails

Keep the canary limited to fresh leads while verified-payment data accumulates.
Stop the bot on any duplicate send, unsupported factual claim, phone-call
offer, repeated checkout link after a failure report, or material delivery
failure. Do not rank an opening as a winner before 30 assigned leads.
