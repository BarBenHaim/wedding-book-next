# Wedding Tales — agent handover

Read this before touching anything under `src/lib/salesAgent/` or
`src/lib/social/`. It is the state of a long build, written down so the
next session does not start from zero.

The commit messages in this repo are unusually long on purpose. They
explain *why* a thing is the way it is, including several decisions that
look wrong until you know what broke. `git log --oneline -15` then read
the ones that touch what you are about to change.

---

## The WhatsApp sales agent — shipped and live

A Claude-powered salesperson that answers WhatsApp on the business
number, qualifies, sends the demo and payment links, follows up, and
hands over to Lord when it should not answer.

**Shape.** Make is a dumb pipe; all logic is in this repo.
WhatsApp Cloud (Watch Events) → Make → `POST /api/sales-agent/reply` →
`{ sendText, sendImage, notifyOwner }` → Make sends it back.
Make scenario `9630287` on eu2.make.com, **Active**.

**Files.**
- `catalog.js` — the ONLY facts the agent may state. Prices, links,
  photos. Change a price here and the bot changes.
- `prompt.js` — assembles the system prompt from catalog + journey +
  experiment arm + what the CRM knows about this lead.
- `journey.js` — a written brief per funnel stage. Only the CURRENT
  stage is injected. This is the file to edit when a conversation goes
  badly; it is fixable the same afternoon, unlike the A/B test.
- `experiments.js` — four opening variants, assigned by phone hash.
  Refuses to name a winner until both leading arms clear 30 leads AND
  the gap beats the noise. Do not weaken that.
- `agent.js` — model call, JSON parsing that fails toward handoff, and
  `sanitizeReply()` which strips em dashes, markdown and surplus emoji.
- `leadsCore.js` — the PURE half of the CRM. Anything testable lives
  here, because `leads.js` boots firebase-admin and cannot be imported
  by a test.
- `leads.js` — Firestore `sales_leads/{phone}`.
- `digest.js` — the morning summary.

**Three ways the bot shuts up.** A human replying in the chat (detected
via Meta's echo, told apart from our own sends by comparing text to the
last assistant turn), an existing customer writing in, and the owner
muting it from his phone. All in `reply/route.js`, in that order, before
the model is ever called.

**Admin.** `/admin/sales-leads` — triage strip, transcript, per-lead
actions, the experiment panel, and a button that sweeps the synthetic
`9725000009xx` test leads.

**Owner commands** from Lord's own number (needs `SALES_AGENT_OWNER_PHONE`):
`שקט <phone>`, `בוט <phone>`, `סטטוס <phone>`, `דוח`.

**Make sends broken JSON, and that is handled here.** The HTTP module
builds the body by interpolating values into a raw string, so a newline
or a quote in a customer's message makes it stop being JSON. That cost a
real lead on 8 August: two-line message, 400, no reply, no alert.
`inbound.js` repairs it by finding the known keys and taking the values
between them verbatim. The tidier fix is `toJSON()` in Make, still not
applied because it cannot be verified without a live message and it
fails loudly in the wrong direction. If it is ever applied, `inbound.js`
costs nothing - valid JSON never reaches the repair path.

**Env:** `ANTHROPIC_API_KEY`, `SALES_AGENT_SECRET`, `SALES_AGENT_OWNER_PHONE`,
`CRON_SECRET`. Secrets are Lord's to enter — do not type them into forms.

**Open:** the daily digest push needs a WhatsApp template `wt_daily_digest`
(UTILITY, Hebrew, 4 single-line variables) because free-form business-
initiated messages die outside Meta's 24h window. `דוח` works today
without it. The same window limit applies to the handoff alerts.

---

## Social — in progress, NOT wired to any account

Nothing has ever been published. Instagram is `weddingtales.il`.

- `social/contentPlan.js` — six post angles on a deterministic rotation,
  each paired with a photo of a book we actually printed. **Done, tested.**
- `social/compose.js` — programmatic Hebrew overlay via satori + sharp.
  **Working, but Lord has asked to drop this approach**: he wants the
  image model to produce the picture with the caption baked in.
- `social/imagePrompt.js` — builds the request to gpt-image-1. Refuses
  to ask for a caption it expects to come back broken (too long, mixed
  script, digits, more than one line) and asks for a wordless picture
  instead. **Done, tested.**
- `/admin/social-preview` + `/api/social/preview` — the four test
  renders, one per request because four in a single serverless
  invocation times out and returns nothing at all. **Built, never run**:
  it needs `OPENAI_API_KEY` in Vercel, which is Lord's to add.

**Before deleting compose.js, know what it cost to learn.** Satori does
not implement the Unicode bidi algorithm, so Hebrew rendered fully
reversed until `toVisualOrder()` was added; the Latin wordmark rendered
as empty boxes until a Latin font subset was registered under its own
family name. Multi-line RTL headlines still wrap in the wrong order
(wrap first in logical order, then reorder per line — not done). If the
image model turns out to mangle Hebrew, this file is the fallback and
those three lessons are why it works.

**Next:** open `/admin/social-preview`, press the button, look at the
four pictures. If the Hebrew is clean the caption stays inside the
image; if it breaks, the caption moves under the picture and the images
go out wordless. That one look decides the architecture and nothing
after it should be built before it. Then: caption writing, an approval
queue (he approves before publish — agreed, at least for the first
month), and a Make scenario publishing via Make's own approved IG/FB
connectors, so no Meta App Review is needed.

---

## Working in this repo

`.git/index.lock` gets orphaned because the Cowork bridge cannot delete
files. Any plain `git` command through `device_bash` leaves one behind
and blocks VS Code. Always set `GIT_INDEX_FILE` to a path in `/tmp`, and
write `.git/refs/heads/main` directly instead of `git commit`.

Tests: `npx vitest run tests/`. The sales agent and social suites are
pure by design — keep them that way.
