# Customer board + automatic follow-up: implementation plan

**Spec:** `docs/superpowers/specs/2026-11-25-customer-board-and-followups-design.md` (approved by Lord 25.11, texts included).

**Goal:** one live table where every customer has a next step, and four fixed WhatsApp messages sent automatically behind a switch that starts off.

**Architecture:** pure rules in `src/lib`, one new admin API, one new admin page `/admin/customers`; existing admin files get a single link. The daily lifecycle cron runs the sender.

**Execution:** inline, test first. Commit and deploy only with Lord's approval.

## Global constraints

- Nothing is sent while the switch is off (default). Template texts exactly as in the spec.
- `lifecycleSent` keys `share_14`, `eve`, `post_1`, `post_3` are shared with the paused e-mails; claimed before sending; a failure is not retried.
- Never put the signed owner sign-in link in a message.
- No phone numbers or message text in logs.
- `src/app/admin/page.js` carries an unrelated uncommitted line: stage by hunk.

## Review focus

- A second cron run, or two at once, sends nothing twice.
- Turning the switch on never messages past events.
- Saturday and holidays move a message, they do not lose it or send it after the event.
- Upcoming events opened before 22.11 are in the normal flow, not in triage.
- A reply "הסר" stops that customer's messages even while the bot is paused for them.

## Tasks

- [ ] 1. `lib/customerFollowups.js` (pure): `isNoSendDay(isoDay)`, `dueFollowup({ w, facts, today, enabledDay })`, `followupBlock(w, facts)`, `templateFor(key, w, baseUrl)`. Test `tests/customerFollowups.test.js`.
- [ ] 2. `lib/customerBoard.js` (pure): `boardRow({ w, facts, today })`, `buildCustomerBoard(list, today)`. Test `tests/customerBoard.test.js`.
- [ ] 3. Server: `lib/customerFollowupsRunner.js` (`runCustomerFollowups`, `sendTestFollowup`, `optOutCustomer`) with injected dependencies; template allowlist in `salesAgent/whatsapp.js`. Test `tests/customerFollowupsRunner.test.js`.
- [ ] 4. Wire the cron (isolated from the e-mail part) and the "הסר" reply. Tests in the route test files.
- [ ] 5. API `api/admin/customers` (GET board, POST triage/defer/note/mute/settings/test). Test `tests/adminCustomersRoute.test.js`.
- [ ] 6. UI `admin/customers/{page,CustomerBoardView}.jsx`, link from `admin/page.js`. Verify with a temporary preview page and screenshots, then delete it.
- [ ] 7. Full tests, lint, build; `AGENTS.md`; ask to deploy.
