# Free "ברכו את" samples for leads, drawn with Codex on Lord's PC (2026-11-25)

Status: approach chosen by Lord 25.11; this design waits for his approval.

## Intent

The bot sometimes invites a lead to send a photo of their son or daughter; they
get a free sample of the sign. Lord wants it **native**: Claude and Codex working
together as in a session on his computer, not image calls from the app.

## Approaches

1. App draws in the cloud through the image API: works around the clock, paid per
   picture. **Rejected by Lord.**
2. **Chosen:** a Claude session on his PC draws with the Codex CLI (his ChatGPT
   plan). Only works while the PC is on and the Claude app is open.
3. A cloud Claude routine running Codex: not verified, and would put his ChatGPT
   sign-in on a remote machine.

## Flow

The app collects and sends; the PC only draws.

1. **Offer** (app). Fixed text, appended by code, never model-written, once per
   lead, only when the lead's **own words** say bar or bat mitzvah (the stored
   `eventType` is not reliable: the test lead was recorded as bar mitzvah
   without saying so):
   > רוצים לראות איך שלט "ברכו את" ייראה עם הילד שלכם? שלחו תמונה ואת השם,
   > ונכין דוגמה, ללא עלות. התמונה תשמש רק לדוגמה, תעובד בשירות עיצוב חיצוני
   > ותימחק אחרי 30 יום.
2. **Photo** (app). A photo from an invited lead gets its own branch: stored
   privately, a fixed acknowledgement with **no promised time**, a queue record
   in `sales_opening_approvals` (`pending_generation`). It does not pause the bot
   the way other attachments do. Photos from anyone else behave as today.
3. **Draw** (PC). `scripts/designs.mjs` lists pending requests, downloads the
   photo outside the repo (which sits under OneDrive), runs Codex with
   `buildLookPrompt` (`sign1`) and its two style references, the name passed as
   data; adds a demo QR and "דוגמה להמחשה" in the empty half; checks the faces
   and the Hebrew; uploads; marks `ready`; deletes the local photo. **It never
   sends to a lead.**
4. **Approve** (Lord). `/admin/customers` shows the sample with approve / reject.
   Approve sends from the app through the existing `sendApprovedOpeningDesign`.
   Outside the 24 h window it cannot be sent free-form: the board says so and he
   sends it by hand.
5. **Clean up.** Photo and sample deleted after 30 days.

## Running it

Step 2 of delivery is manual ("יש דוגמאות?" in a session). Only after Lord's
explicit yes: a scheduled task every 30 minutes, 09:00-21:00, self-contained
prompt. It runs unattended with write access to production data, uses
subscription usage, and only while the app is open.

## Not included

Customers' own designs; automatic sending; any change to prices or offers. Lead
replies stay on the API (they must be immediate).

## Also in the same delivery

`claude-sonnet-4-5` is listed as retiring on 30.11.2026 and is still the default
in `salesAgent/agent.js` and `settings.js`: move those defaults.

## Proof (25.11)

With the demo event's drawn boy portrait: Codex drew `sign1` in 59 seconds,
Hebrew correct; QR added and read back. The headline ends a little below the
middle. Files: `C:\Users\DELL\dev\claude-design\lead-sign-proof\`. Not yet
proven: a real parent photo, and the whole flow.
