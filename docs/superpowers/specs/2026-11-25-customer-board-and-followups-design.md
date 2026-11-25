# Customer board in the super admin + automatic follow-up (2026-11-25)

Status: approved by Lord 25.11 (design and texts) and built; not deployed. The
switch is off by default.

## Intent

Lord wants a reliable, live, interactive picture of every customer in his super
admin, with nothing left open, and light automatic follow-up so customers feel
accompanied without being nagged. He chose **fully automatic** sending (25.11).

## Decision scope

Automatic sending covers **only the four fixed messages below, with wording he
approves once**. This narrows two earlier decisions and overrides nothing else:
balance reminders stay paused, and anything answering a customer request still
waits for his approval.

## Goals

- One table: each customer has exactly one next step with a due date, or is
  closed. Overdue rows on top.
- Every scheduled message is visible before it goes (cancel / defer), then shows
  sent, delivered, read or failed.
- One global off switch and a per-customer one.

## Non-goals

No marketing to events without a recorded payment, no balance reminders, no
free-text automatic messages, no print-provider integration.

## What exists and is reused

`lib/journeyStage.js` (stage, attention), `app/admin/JourneyUI.jsx`,
`PATCH /api/admin/weddings` (marks), `lib/lifecycle.js` + `/api/cron/lifecycle`
(daily 07:00 UTC, ran 200 on 23-25.11), `lib/customerMessages.js` (hand-sent
messages), `salesAgent/whatsapp.js` `sendWhatsAppTemplate`, delivery records and
Make status callbacks.

## Part A: the board (ships first, sends nothing)

- A view "טיפול בלקוחות" in the super admin, new files; `admin/page.js` gets only
  the wiring (it carries an uncommitted unrelated line: stage by hunk).
- Columns: customer, event date, stage, next step, due, last message and its
  state, actions (done, defer, note, mark printed / shipped / delivered / closed,
  open WhatsApp, open blessings).
- Rules are pure, in `lib/customerBoard.js`, on top of `journeyOf`.
- **One-time triage of old events:** they are `legacy` today and never enter the
  queue. For each: delivered / in print / needs handling / closed. "Needs
  handling" sets `triagedAt`, which brings a paid event into the queue.
- Refreshes on open and every few minutes.

## Part B: automatic follow-up (behind a switch, off by default)

| key | when | says |
|---|---|---|
| `share_14` | 14 to 8 days before | send guests the blessing link |
| `eve` | 2 to 1 days before | print and place the sign |
| `post_1` | 1 to 2 days after | mazal tov, view link, blessing link for who missed it |
| `post_3` | 5 to 6 days after | go over the blessings and approve for print |

- Recipients: `amountPaid > 0`, not demo, not closed, not printed / shipped /
  delivered, a valid mobile, no open inbox item, no running human pause,
  `lifecycleOff` not set. Everyone else appears as a manual row.
- No backlog: only a window that is open on the run day, and only events dated on
  or after the day the switch is turned on (`post_*` for events from that day).
- Once only, and shared with the paused e-mails: the same `lifecycleSent` keys.
  A failed attempt counts as done and is shown for hand follow-up.
- Daytime (the existing 09:00/10:00 Israel run). Not on Shabbat or Jewish
  holidays: the message moves to the next working day, and its window extends.
- Links: guest page and view-only book. **Never the signed owner sign-in link**
  (messages get forwarded). The review and sign links go to the normal sign-in.
- Footer: "להפסקת העדכונים השיבו: הסר". A reply of "הסר" sets `lifecycleOff`.
- Sends go from the business number with the app's token; delivery state comes
  back through Make and `/api/sales-agent/delivery`.

## Message texts (for approval; submitted to Meta as utility templates)

1. `wt_share_14`: היי {{1}}, בעוד כשבועיים האירוע של {{2}} 🎉 זה זמן טוב לשלוח לאורחים את הקישור לכתיבת ברכה: {{3}} צוות Wedding Tales
2. `wt_eve`: היי {{1}}, האירוע של {{2}} כבר ממש קרוב ✨ כדאי להדפיס את השלט ולהציב אותו בכניסה: {{3}} שיהיה אירוע מדהים!
3. `wt_after`: היי {{1}}, מזל טוב! 💛 מקווים שהאירוע של {{2}} היה מרגש. לצפייה בספר: {{3}} ולמי שלא הספיק לכתוב ברכה, זה הקישור: {{4}} אפשר להעביר אותו לאורחים.
4. `wt_review`: היי {{1}}, הברכות לספר של {{2}} מחכות לכם 📖 כשנוח, עברו עליהן ואשרו, ואז נתקדם להדפסה: {{3}} אם משהו לא ברור, פשוט השיבו כאן.

## Rollout

1. Build and deploy part A.
2. Lord checks the payment method in WhatsApp Manager; templates are submitted.
3. Part B runs as a dry run for a few days (the board shows what would go).
4. First real send to Lord's own number. Then he turns the switch on.

## Checked 25.11

- The app token works: Graph answered the daily-digest cron with 132001
  (template does not exist) today and yesterday. That cron fails until
  `wt_daily_digest` exists or the cron is removed.
- Templates on the account: `wt_followup`, `wt_followup_he` only (Make list; no
  approval status shown).
- Direct sends were accepted up to 16.10, with no delivery seen after 4.10 (the
  Make status relay was also off). **Whether a template is delivered today is
  unproven**; the payment method is unconfirmed.
- Meta may class a congratulation as marketing, with delivery limits.

## Cost

Secondary 2026 figures for Israel put a utility template around 0.005 USD and a
marketing one around 0.04 USD per delivered message; confirm on Meta's rate card.
