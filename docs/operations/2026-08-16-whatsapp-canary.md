# WhatsApp canary — 2026-08-16

- Guard commit: `b6f1b0b0f39363282fc837f259147384a04518a0`
- Production deployment: `https://the-wedding-gift-ikt7d7ayb-barbenhaims-projects.vercel.app`
- Production alias: `https://app.weddingtales.co.il`
- Stale synthetic result: HTTP 200, `stale-inbound`, zero send, no handoff
- Synthetic identity: fixed all-zero test identifier; no customer identity used
- Live Make scenario: `9630287`
- Make state at start: inactive after HTTP 401, eight queued records visible
- Make authentication repair: not applied in this phase
- Queued records: no manual replay and no timestamp mutation
- Kill switch: Wedding Tales sales-agent `enabled`
- Local verification: 52 test files, 925 tests; lint 0 errors; production build passed

## Activation gate

The Make scenario stays inactive until its HTTP secret is repaired and one fresh synthetic event receives HTTP 200. After activation, stop on any duplicate send, repeated 401, outbound failure rate above 5%, unsupported factual claim, or phone-call offer.
