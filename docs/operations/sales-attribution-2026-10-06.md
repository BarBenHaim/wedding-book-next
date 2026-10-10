# Ad source → lead → verified purchase

Date: 2026-10-06. Draft PR #4; strict conversation capture and the real checkout provider remain disabled/unconfigured for live use. This is a tested application integration, not a production connection or an ad launch.

## What is connected in the application

| Stage | Actual route/storage integration | Evidence boundary |
| --- | --- | --- |
| WhatsApp referral | Authenticated `reply` parsing passes referral metadata into the `claimInboundEvent` transaction | `SALES_REFERRAL_TRANSPORT_VERSION=structured-v1` must attest verified structured serialization. Default/unverified transport and repaired JSON produce unknown source. Make authentication is not a Meta signature |
| Durable lead | The first observed touch and latest newer explicit referral are stored before reply generation, including paused/human-owned conversations | First observation may be unknown. Ordinary later messages, retries and stale events cannot rewrite it. No historical lead backfill |
| Checkout | `readVerifiedCheckout` supports a server-injected v2 provider and requires a matching protected order binding before exposing a URL | Default provider is absent. No request field can inject a provider or enable issuance. Static add-to-cart quotes cannot pass the strict route reader |
| Order binding | Independently verified reserved Woo order/session, exact product/quantity/economics/terms hash and expiry atomically create a quote plus immutable `sales_order_attribution_bindings` record | First/latest source snapshots are frozen at checkout. Phone, chat text, arbitrary order metadata and query parameters are not binding authority |
| Payment | The real signed `/api/createWedding` route explicitly grants trusted-source context to strict paid-evidence validation | Signature alone or order status alone is insufficient. Legacy fulfillment compatibility does not weaken analytical paid verification |
| Stop paid-lead reminders | A validated binding locates the originating lead by its server-stored contact hash and stops pending sales, including an in-flight stale reply | A different billing phone does not transfer owner identity, book ID or owner-access authority to the originating lead |
| Report | Authenticated `/api/sales-agent/cohorts` adds purchase attribution by first/latest source and binding/source confidence | Strong order binding, phone association, unlinked and pending are separate. Reports contain no contact/click/event/order identifiers, checkout keys or customer content |
| Order audit and recovery | Superadmin `GET /api/sales-agent/order-evidence/reconcile?orderId=...` shows a bounded single-order attribution audit. `POST` with action `reconcile` reuses only a matching previously signed `ordersRaw` snapshot | Recovery records evidence and can retry bound-lead reminder suppression for a paid snapshot. It cannot create a book/checkout, send messages or report conversions to Meta |

The existing signed payment → book authorization and human takeover logic remain in the same application. Tests exercise the real reply, CRM, quote reader, signed Woo payment/refund and report handlers using a synthetic transactional database and mocked external Auth, SMTP, WhatsApp and provider operations.

## Source meaning and Make pass-through

Meta documents referral information on inbound messages sent through click-to-WhatsApp entry points; the customer can remove that referral information. Missing metadata is therefore **unknown**, not organic traffic. The provider reference is [Meta's official Messages Object documentation](https://www.postman.com/meta/whatsapp-business-platform/folder/1dtuocp/messages-object); the [current Meta message webhook reference](https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/reference/messages) was rate-limited during this review.

At deployment, pass the exact message ID, provider occurrence timestamp and nested message referral object through Make using safe JSON serialization. Raw interpolation can let customer text create apparently valid JSON fields, so `repaired:false` is insufficient. Enable the separate server-owned `SALES_REFERRAL_TRANSPORT_VERSION=structured-v1` gate only after verifying structured serialization end to end; a request-body flag cannot enable it. The code does not change Make or set this gate.

Supported native fields include `source_type`, `source_id`, `source_url` and `ctwa_clid`. With `source_type: ad`, `source_id` can identify the ad; a post source is not an ad. Campaign/ad-set IDs from existing flattened connector mappings remain explicitly `transport_mapping` evidence. Metadata preserves original types: unsafe numbers/arrays are not coerced into plausible IDs. The code does not invent identifiers from an ad ID, caption, customer text or current campaign configuration.

The first/latest schema marks coverage as `observed_since_tracking_v1`. It does not claim to reconstruct the person's first-ever contact. Native batch payloads require a matching message ID. IDs are bounded without truncation; unsupported/ambiguous values remain unknown. Only allowlisted URL origins enter operational attribution. Headline/body/media fields are omitted. The protected checkout snapshot and reports omit operational message/click IDs and URL origins entirely.

Source confidence and order binding confidence are independent. A checkout can be strongly linked to a lead whose source is unknown, or whose ad source was observed only through authenticated Make. A phone match can associate a purchase with a lead, but cannot establish which ad caused it. The report retains explicit unknown ad IDs even when the broader source category is known.

## Provider contract and exact remaining gap

`checkoutProviderAdapter.js` is a dependency-injected, disabled-by-default writer. A real server provider must implement `createCheckout` and independent `verifyCheckout` readback. Both must refer to the same reserved numeric Woo order and checkout identity, with provider idempotency, current offer/version/terms hash, one known product, integer ILS totals, tax/shipping amounts and enforced expiry. The verifier must attest that product, quantity and payable economics remain fixed until payment or that a changed amount requires a new decision.

The resulting URL is restricted to the business origin and the corresponding Woo order-pay route with its order key. Woo's [payment URL code](https://woocommerce.github.io/code-reference/files/woocommerce-includes-class-wc-order.html) and [checkout endpoint documentation](https://developer.woocommerce.com/docs/best-practices/urls-and-routing/woocommerce-endpoints) establish the URL pattern. They do **not** establish that this installation enforces quote locks. The [Store Checkout API](https://developer.woocommerce.com/docs/apis/store-api/resources-endpoints/checkout) documents expected-total checking; compatibility with this shop and its gateway is still unverified.

No real network provider, WordPress bridge, shop hook or credential was created. Implementing and deploying an authenticated Woo-side reservation/verifier with effective payment-time checks requires separately approved shop access, a scoped owner-managed secret setup, sandbox testing and release review. A simple product-price read or a static cart link cannot satisfy that contract. The approved commercial catalog must also be complete before any quote can issue.

## Payment, retry and reporting semantics

- New purchase truth requires a signed, strictly validated paid provider event. Payment time and economics are distinct from webhook receipt time and source confidence
- The checkout snapshot stays fixed when a later ad referral arrives or a different billing phone pays the order. This establishes the originating checkout lead, not the identity of whoever ultimately paid a forwarded link
- Repeated signed events create one paid ledger entry. Refund amounts/status are monotonic for already verified purchases; delayed paid retries cannot resurrect refunded revenue
- A temporary binding-read failure leaves attribution pending and retains a minimal original paid proof without billing details. Recovery uses the original payment time and economics. A binding created after that payment is never adopted as historical attribution
- A successful lookup with no binding finalizes unlinked/phone association. Later source guesses or new bindings do not backfill it
- Older analytical rows without strict payment-confidence evidence are shown as legacy/unverified and excluded from new verified revenue until an actual newly verified provider event establishes current payment truth. There is no automatic historical migration
- Lead-cohort conversion remains an explicitly labeled contact-association metric. The separate purchase-attribution section shows actual verified payment windows, first/latest source snapshots and binding confidence. Missing cost/refund evidence stays unknown

## Runnable verification and release checklist

```sh
./node_modules/.bin/vitest run tests/salesAttributionJourney.test.js tests/salesReferralEvidence.test.js tests/salesCheckoutProviderAdapter.test.js tests/salesOrderAttribution.test.js tests/salesCheckoutQuoteStore.test.js tests/salesEvidence.test.js tests/salesCohortsRoute.test.js tests/salesOrderEvidenceReconcileRoute.test.js --maxWorkers=1 --minWorkers=1
```

The 20-case synthetic journey covers referral A → B, durable CRM, independently verified checkout, later referral C, signed payment, duplicate/refund handling and authenticated reporting. It also covers differing billing-phone suppression without book ownership transfer, an in-flight reply canceled by that payment, valid-JSON injection with the transport gate unset, and unsafe numeric/array aliases. Other suites cover missing/forged bindings, unknown sources, economics mismatch, authentication, single-order audit privacy and pending recovery. All external network requests are blocked in the journey test.

Before live release: verify Make pass-through, complete the commercial catalog, deploy and verify the protected Woo provider, prove sandbox checkout/payment/refund compatibility, review protected collection access and the separately tracked access-boundary prerequisite, and explicitly approve deployment/activation. No existing leads are replayed. No customer data is transmitted to Meta/CAPI. No campaign is activated by this code.

See the [full specification matrix](conversational-sales-2026-10-05.md) and [commercial direction](commercial-direction-2026-10-06.md) for the other launch gates and final verification results.
