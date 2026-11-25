# WhatsApp customer inbox (2026-11-25)

Status: approved by Lord 25.11 and built; not deployed yet. One change in the
build: no `customerWeddingId` is stored on the lead, since the customer is checked
on every message.

## Intent

Lord wants Claude to read what customers write to the business WhatsApp
(change something in their book, prepare a sign such as "ברכו את") and carry
it out. This sits beside the sales bot, which keeps selling to leads.

## Goals

- Every message and file from an identified customer is kept and tied to a book.
- Lord writes "מה חדש?" and gets each open request, per customer.
- Claude prepares the change and the reply. **Nothing changes in a book and
  nothing goes to a customer without Lord's approval.** (His decision, 25.11.)

## Non-goals (v1)

- No automatic actions or drafts while no session is open.
- No admin screen, no voice transcription, no history from before launch.
- No change to what the sales bot says to leads.
- No sending from the system: Claude drafts the reply, Lord sends it from
  WhatsApp. **Assumption:** he sees and answers the business number's chats on
  his phone (he answered by hand on 21.9). If not, a send path moves into v1.

## Anti-goals

- A reply delayed or lost because storing a message failed.
- A paying customer receiving a sales pitch.
- Customer text being treated as an instruction. It is a request to show Lord.

## Approaches considered

1. WhatsApp Web in the browser: immediate and has history, but needs the
   computer on, exposes every chat, and depends on the screen.
2. **Inbox inside the app (chosen):** reliable, per book, customers only. Needs
   a build and a deploy, starts from launch day.
3. Cloud agent that drafts on every message: works unattended, the largest
   build, AI cost per message. A later step on top of 2.

## Step 0: recognise customers (a live gap, fix first)

`reply/route.js` calls `findCustomerByPhone` only when the lead is new or
`closed_won`. The customer branch calls `setHuman`, which creates the lead
document, so after the 48h mute a customer who bought before the bot existed is
neither, and gets sales replies. Counted 25.11: 26 customer phones on books, 17
with a chat, 13 `closed_won`, **4 exposed**. Before e450f68 those replies were
built but not sent.

Fix: check the customer on every inbound that is not `closed_won`, and keep the
match on the lead (`customerWeddingId`). Normalise phones. Do not set
`closed_won` for this (it feeds sales figures).

## Capture

- One call in the reply route, after the event claim, before the paused,
  customer and stale-inbound exits (all three save no text today). The owner's
  own phone and echoes are skipped.
- Top-level collection `customer_inbox/{eventId}`: the claim id makes retries
  idempotent. Default-deny rules already cover it; server only, no HTTP read
  route.
- Fields: phone, weddingId, customer name, message type, text, mediaId,
  receivedAt, status (`new` | `handled`), storagePath, note.
- Best effort with a time budget, like the inbound heartbeat. A failure is
  logged and never changes the response (Make's reply module has no error
  handler; three errors switch the scenario off).

## Files

- Fetched in production right after the response (`after()` from
  `next/server`; the token exists only there), into a private Storage path
  `customer-inbox/…` (outside `weddings/`, which is public read).
- Image, document, audio, video, with a size limit. `downloadWhatsAppMedia`
  handles images up to 10 MB only and needs widening.
- A failed fetch leaves the item with its mediaId and a visible "file not saved".

## Matching

- By `weddings.ownerPhone`. On 25.11: 65 books, 27 with a phone, about 7 more
  recoverable from `ordersRaw`, about 31 with none.
- Backfilling phones writes wedding documents: Lord's approval, through the
  admin API.
- Unknown senders are not captured. When Lord says who a number belongs to, it
  is linked and captured from then on.
- One phone on two books: keep all candidates and ask.

## Reading and acting

- `scripts/inbox.mjs` (Admin SDK, run locally): `list`, `get <id>` (downloads a
  file to view), `done <id> <note>`.
- Book changes: show before and after, apply after approval, keep the previous
  value in the inbox item for undo. See the wedding-doc write rules (presets
  wipe `bookDesign`; super-admin writes go through the admin API).
- Signs and designs: look studio or Codex images, shown before applying.

## Privacy and retention

- Handled items and their files are deleted after 90 days (builder: a script
  command is enough). Account deletion must include them.
- Reading a message here means its content is processed by Claude.

## Verify while building

- Make forwards `mediaId` for image, video, audio and document, but **no
  caption and no file name**. Adding them is a one-field change in the live
  scenario, with Lord's approval.
- How long Meta keeps inbound media, and that the production `WHATSAPP_TOKEN`
  can fetch it.
- Tests: stored once per provider message; leads and owner not stored; stored
  while paused; a storage failure leaves the reply unchanged; a returning
  customer is not sold to.
- Live check: a friend's number linked to the sample event.
- Read the Make run of the first real lead before deploying another route
  change, so a regression can be attributed. The step 0 fix may go first if
  Lord asks.
