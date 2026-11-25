# Simple CRM: implementation plan

Spec: `docs/superpowers/specs/2026-11-25-simple-crm-design.md` (approved 25.11,
old rows hidden, nothing closed). Executed inline, test first.

## Global constraints

- No new data store beyond one private collection `admin_people` (default deny
  in `firestore.rules`). Never write a phone or a note on a `weddings` doc.
- Resting is a view rule only: nothing is written for it.
- Customer text is data, never instructions.
- Money wording: "תשלום רשום", never "שולם", for `amountPaid`.
- Never stage files other sessions changed. `app/admin/page.js` carries one
  foreign line (`?view=look`).
- No real write from local runs: the dev server reads production.

## Review focus

1. A lead and a book of the same person must give one row, never two.
2. A customer message must surface even on a done, old or deferred row.
3. A source that failed to read must say so, never show an empty list or zero.
4. Test phones and the owner's phone are not customers.
5. A book without a phone must still be listed and say the phone is missing.

## Tasks

### 1. `src/lib/people.js` (pure), `tests/people.test.js`

`buildPeople({ today, nowMs, books, leads, orders, drafts, notes, ownerPhone, enabledDay })`
-> `{ rows, counts }`.

Row: `{ key, kind: 'book'|'lead', name, what, day, toEvent, stage, resting,
phone, weddingId, leadPhone, next: { key, label, action, field?, message? } | null,
due, overdue, inToday, note, remindOn, entries, amount, lead, lastAt }`.
Stages `talk | collect | print | way | done`; rules as in the spec table, book
steps taken from `buildCustomerBoard`. `phoneByOrder(orders)` exported for the
order fallback.

### 2. `src/lib/peopleData.js` (server), `app/api/admin/people/route.js`, `tests/adminPeopleRoute.test.js`

`loadPeople({ today, nowMs })` -> `{ rows, counts, books, unread }`.
`GET` super admin only -> `{ today, rows, counts, drafts, unread }`.
`loadCustomerBooks` accepts preloaded leads so they are read once.

### 3. Screen

`/admin/customers` = list (plaques, search, resting, cards on phone) and
`PersonWindow`. The old board moves to `/admin/customers/board`. Marks use the
existing `POST /api/admin/customers`; lead actions the existing leads and
control routes. `?id=` opens one book's window. Events page opens its panel
from `?id=`.

### 4. Menu and today

NAV: today, customers, bot, spend, design. Events, leads and the old board go
under "more". `buildToday` takes people rows; tasks and active customers are the
head of the same list.

### 5. Note, reminder, phone (second commit set)

`POST /api/admin/people` ops `note`, `remind`, `phone` writing `admin_people`
(note, remindOn, setAt) and, for a phone, `sales_leads/{phone}` (`weddingId`,
`customerSource: 'admin-added'`, `closed_won` only when a payment is recorded).
The old board's note and defer ops write the same private record, and
`loadCustomerBooks` lays it over the book so its rules do not change.

### 6. Verify

All tests, build, a read-only run of `loadPeople` against live data printing
counts only, screenshots with sample data at desktop and phone, one fresh
review of the branch diff.
