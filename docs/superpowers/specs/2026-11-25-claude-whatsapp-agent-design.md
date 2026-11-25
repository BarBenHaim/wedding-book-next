# Claude as the WhatsApp agent in the cloud (2026-11-25)

Status: approved by Lord 25.11 (with the autonomy below). Phase 1 in build.

## Intent

Lord wants Claude "connected to WhatsApp": reads messages, answers, prepares
designs and sends them, also when his computer is off. He chose a cloud agent
inside the app over a Make send channel (25.11).

## Goals

- Claude writes the replies, knowing the whole conversation and, for a
  customer, their book.
- Designs for leads and customers, made and sent from the cloud.
- Lord sees and controls everything from the super admin; one off switch.

## Non-goals

Claude never moves money, changes prices, grants discounts outside the catalog,
edits or deletes a book, or talks over Lord in a chat he took.

## Autonomy (decided 25.11)

- **Replies to leads stay automatic**, as today. Lord: "לידים יישארו אוטומט",
  after being told that approval for everything would make leads wait.
- Everything else Claude composes or designs waits for his approval ("הכול
  באישור"): customer replies, designs, anything about a book or money.
- Fixed texts he approved stay automatic: the opening, the attachment
  acknowledgement, the customer service line and the four follow-ups.

Approval (phase 2) must be quick: a draft on the board and a ping to his phone
with a number; he sends back "שלח 3". The send checks the 24 h window and that
no newer message arrived since the draft. Nothing is auto-sent on a timeout.

## What exists

The Vercel reply route (claim, stale fence, pause, customer check, inbox
capture), a deterministic sales policy (`decisionPolicy.enforceSalesReply`
replaces the model's text for prices, offers, payment links and more), model
providers in `salesAgent/agent.js`, the customer board, the customer inbox, the
app's Graph sender (`salesAgent/whatsapp.js`), the look studio's image calls
(OpenAI `gpt-image`).

## Approaches considered

1. Meta's WhatsApp Business Tools MCP into a chat session: sends text, does not
   read messages, not for production, only while a session is open.
2. A send channel through Make for the chat session: only while he is there.
3. **Claude inside the app (chosen).** Messages API with tool use, in the
   project's existing loop (it already hosts it on Vercel, so no Managed Agents).

## Phase 1: Claude writes the lead replies (one deploy)

- Official SDK `@anthropic-ai/sdk`, model `claude-opus-5-5`, effort `low`,
  server-side refusal fallback on. `callAnthropic` cannot call it today: it
  sends `temperature` (400), `MAX_TOKENS` is 2000 with thinking always on, an
  unknown model silently falls back to 4.5, `settings.js` lists no current model
  and `pricing.js` has no rate for it. All of that changes; the answering model
  is asserted and logged.
- Routing: the running model experiment picks the provider, and existing leads
  keep their arm. End the experiment and set the provider, so no arm overrides.
- Which text Claude controls: answering questions, qualifying, objections and
  wording around an offer. Prices, payment links, checkout confirmation and the
  clean "no" stay deterministic.
- Latency: the provider deadline is under 20 s of a 26 s route. Measure with the
  existing replay and benchmark files before switching.
- Failure: fall back to the current OpenAI model, then the catalog reply. Low
  credit or repeated failure appears in the daily summary and on the board
  (today it is silent).
- Gate before switching: one proven Claude call in production, and one sales
  reply to a non-owner phone seen live with the current model.

## Phase 2: knows customers, drafts for approval

- Read-only tools: the book (names, date, blessings count, links, status), the
  conversation, the offer facts. Customer text and photos are data, never
  instructions.
- For a customer Claude drafts a reply; it appears on the board with
  "approve and send" (inside the 24 h window). A requested change to a book is a
  task for Lord, never an edit.

## Phase 3: designs

- Render after the response (it does not fit the route's time) with the app's
  image service, store privately, send inside the 24 h window.
- Lead photos are not kept today. Keeping children's photos and sending them to
  an outside image service needs: a consent line in the request for a photo, a
  limit of one design per lead, deletion after 30 days.
- Lord approves the first batch; both earlier automatic designs were rejected.
- Cost per image is billed by the image provider, separate from Claude.

## Phase 4: direct connection

Meta's webhook straight to the app, Make retired. Needs delivery statuses,
signature checks and a tested rollback. Last, on its own.

## Cost

Past use is about 5-8K input and 260 output tokens per reply. At
`claude-opus-5-5` ($4 / $20 per million tokens, thinking billed as output) that
is roughly 3-5 US cents a reply, about 25-40 USD a month at ~800 replies.
Sonnet 5.5 is about half. API credit is separate from any Claude subscription.

## Needs from Lord

- Credit and auto-reload on the Anthropic API account (last Claude failures,
  11-15.8: "credit balance is too low").
