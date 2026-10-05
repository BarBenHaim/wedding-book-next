# Payment-to-book boundary (local implementation, not deployed)

## Contract

Woo's setup connectivity ping is a narrow exception: the exact unsigned form body `webhook_id=<positive integer>` receives HTTP 200 with no database, Auth, analytics or mail side effects. A customized single-field JSON ping is accepted only after valid HMAC. Extra fields cannot enter this acknowledgment path. This matches [Woo's documented activation ping](https://developer.woocommerce.com/docs/best-practices/urls-and-routing/webhooks/) and the official [`WC_Webhook::deliver_ping` implementation](https://github.com/woocommerce/woocommerce/blob/trunk/plugins/woocommerce/includes/class-wc-webhook.php), which sends that form body and requires exactly 200.

- `POST /api/createWedding` authenticates the exact, bounded request bytes with WooCommerce HMAC-SHA256 and constant-time digest comparison. No request text, `paymentVerified` field, lead stage, or prepared URL authorizes activation.
- With `SALES_CONVERSATIONAL_POLICY_ENABLED=true`, automatic activation requires signed provider source, `processing`/`completed`, a valid paid date, transaction reference, non-offline payment method, positive bounded amount, ILS, and exactly one mapped product (`6258` or `6271`), quantity one, no unknown variation, and a positive line total covered by the order total. Woo's actual charge is payment evidence, not approval of a new price/offer.
- Missing/unknown payment or fulfillment metadata produces a durable `order_fulfillment_reviews/{orderId}` pending record and a review-required response. It does not fabricate fulfillment or announce a human transfer. Multiple books, identity changes, or a removed ready book also require review.
- Flag-off retains the existing signed `processing`/`completed` paid checkout behavior; signature, ownership, lease, fencing and outbox fixes are unconditional.
- `GET /api/sales-agent/order-status?orderId=...` requires a Firebase Bearer ID token, checked for revocation. Only the exact owner UID with consistent private order and book mapping is accepted; query/body identity, an email/phone assertion, and `closed_won` are insufficient. Responses have `private, no-store`.
- The status response contains only order ID, verified/unverified payment, ready/preparing/unavailable book status, and two separate links when ready: authenticated `/wedding/{id}/admin` and public guest contribution `/wedding/{id}/photo`. It never contains personal contact fields, guest content, account setup links, or digital/arrange capabilities.

## Idempotency and partial failures

`ordersLocks/{orderId}` now stores a transactional two-minute lease, increasing fence, immutable payment identity fingerprint, verified Firebase owner UID, and stable book ID. A failed/expired lease can recover; old workers cannot commit. Book creation and a single pending confirmation outbox row commit together. Books are create-only, so retry cannot rotate a viewer token or overwrite owner edits.

Both commit and confirmation claim read the current signed payment snapshot transactionally. Provider modification timestamps reject older events where available. A refund is terminal for automatic fulfillment even without provider revision metadata. It requires service review to reopen, rather than accepting an old paid replay.

An existing legacy book is adopted only if Firebase's billing-email-to-UID mapping matches its owner; an owner-editable book document cannot establish identity. Existing legacy confirmations have unknown delivery status and are not resent. Missing books after a recorded ready state are not automatically recreated.

`order_confirmation_outbox/{orderId}` is private under default-deny Firestore rules. `pending` can retry preparation. `dispatching` is claimed transactionally once; accepted SMTP becomes `accepted`, and ambiguous errors become `uncertain`. SMTP does **not** provide exactly-once delivery or an idempotency API. `dispatching`, `uncertain`, and `legacy_unknown` must be reconciled by an operator; automatic replay cannot resend them. A deterministic Message-ID assists reconciliation but is not a delivery guarantee. Configuration or setup-link preparation failure leaves the row pending without sending.

Confirmation is only prepared after the book exists, uses neutral event wording, and separates owner and guest links. An account setup/reset link from Firebase is sent privately to the billing email rather than storing/emailing a generated password. The link itself does not change the password. No mail, Auth operation, payment/cart mutation, or live Firestore write was executed during implementation; all route verification uses synthetic mocks.

## Existing blockers outside this change

- A separate access-boundary compatibility review is required before release; production status is unverified. The new endpoint's owner checks do not establish the security of other application routes or repair the broader privacy boundary.
- Self-serve onboarding currently creates `plan: 'free'` without a link to an approved commercial offer, and seeds a welcome blessing. Its commercial behavior is unchanged. That seeded blessing is not evidence of a first real guest blessing or a purchase.
- Before enabling strict mode, validate the live Woo gateway's transaction/date/line metadata against the contract, approve additional-product or offline-payment mappings if wanted, and define service handling for pending review/outbox rows. No provider or production setting has been changed here.

## Synthetic acceptance coverage

`tests/salesOrderFulfillmentRoute.test.js` invokes the real payment/status route handlers with serialized transactional database, Firebase Auth, and SMTP mocks. It covers malformed/oversized/forged webhooks, fake paid claims, strict metadata failures, legacy flag-off compatibility, concurrent/sequential duplicates, legacy ownership adoption, Auth create races, failed/recovered leases and book commits, stale fence rejection, no email before a book exists, ambiguous SMTP no-resend, configuration/preparation retry, refund races, stale provider events, revoked tokens, foreign-owner denial, minimal output and capability/guest-content exclusion. Existing `salesPaymentRoute` and `salesPaymentFirestore` tests also remain passing.

## Response compatibility

Repository search found no application caller parsing `/api/createWedding` response JSON; the known integration is the Woo delivery endpoint. Existing successful creation still returns `success` and `weddingId`, and duplicate/non-paid outcomes retain `skipped`/`reason`. `bookReady`, `confirmation`, and review/preparing state are explicit additional fields; the old response's billing email is omitted. Busy/review responses use 202 (successful receipt, not completed fulfillment); setup uses exactly 200. External Make/custom-plugin consumers were not inspected or changed and should be checked before activation if any are configured.
