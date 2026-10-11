# Commercial direction and checkout integration

Date: 2026-10-06. Review draft for PR #4. Strict conversational mode remains code-default off.

## Approved direction and incomplete facts

The owner approved leading with a single printed package at **990 ILS**: a digital book, personal design, one 21×21 cm hardcover copy and shipping as advertised. **690 ILS digital** remains an available alternative when requested, when a physical copy is unnecessary, or when price is a concern. A generic price answer leads with printed; an explicit comparison shows both, with printed first. The customer still chooses the product before checkout.

The design direction includes approval before printing and one consolidated revision round. Our own errors are corrected without charging. Printing and delivery timing starts after final design approval, but **no number of days has been verified**. The previously discussed 14-business-day target and next-business-day human response were conditional suggestions; neither is an active promise.

`commercialDirection.js` records this direction as immutable draft data. It cannot pass the approved-catalog schema and is never a price fallback. Customer-facing facts continue to come only from a complete, current approved catalog. Existing verified purchasers continue through service handling and retain their original order terms.

| Requirement | Implemented behavior | Remaining gate |
| --- | --- | --- |
| Printed 990 ILS as the main package | Runtime selection leads generic price answers with the approved printed offer | Complete owner-approved catalog; direction alone cannot authorize a quote |
| Digital 690 ILS remains available | Explicit digital, no-print, budget and options questions receive the applicable approved alternative; comparisons disclose both | Complete digital terms and approved catalog |
| Personal design, hardcover 21×21, one copy, shipping | Recorded in the draft direction and exercised with synthetic complete offers | Actual tax and destination breakdown must be verified; advertised shipping inclusion is not a payable-cart total |
| Approval and revisions | Runtime answers approved design/review wording before checkout; one consolidated round and free correction of our errors recorded | Complete approved process wording; preserve prior customer agreements |
| Unknown printed limits | Missing printed page cap, including a null/N/A cap, cannot validate an approved offer | Supplier-confirmed cap, extra-copy price and any extra-page policy |
| Delivery and human response | Unverified timing/policy questions create a durable human handoff; no numeric promise supplied by this direction | Supplier production/transit duration, destination and operational human response capacity |
| Refunds/cancellation | Unknown terms route to human review | Reviewed, versioned policy wording and URLs; no blanket refund or no-refund promise |
| Media and promotions | Existing approved-media and benefit gates remain in force | Proven rights/consent; no free offer, false scarcity, 450+250 discount or unlimited-print entitlement inferred |
| Checkout | Static catalog price is never represented as a verified final checkout total; missing provider quote blocks the link | Same-session final-total provider integration described below |

## Final-total adapter investigation

The initial investigation found signed WooCommerce order webhooks and a quote reader without an issuance writer. The subsequent [source-to-purchase update](sales-attribution-2026-10-06.md) adds a disabled dependency-injected writer, independent verification contract and protected order/session binding. A real Woo network client or deployed reservation/enforcement bridge remains absent. `checkoutQuoteStore.js` requires provider-owned evidence bound to the lead, inbound event, offer version and exact protected order.

Catalog URLs identify `/checkout/?add-to-cart=6258` or `6271`, but the updated strict quote reader rejects those static links as final-total verification. Its v2 provider contract requires an independently verified reserved order-pay URL, immutable binding and payment-time enforcement. An add-to-cart URL alone adds a product to the browser's current cart; existing items or destination changes can change the payable amount. [Woo add-to-cart URL behavior](https://woocommerce.com/document/quick-guide-to-woocommerce-add-to-cart-urls/)

| Official Woo capability | What it can establish | What it cannot establish by itself |
| --- | --- | --- |
| Store `GET /products/{id}` or REST `GET /products/{id}` | Product price, currency, precision and product attributes | Buyer-specific shipping, fees, tax and final payable total |
| Store `GET /cart` | Current cart items, totals, taxes, shipping status and rates | A correct isolated cart, completed destination selection, or matching hosted browser session |
| Store cart mutation endpoints | Add the chosen product, set minimal destination, select a rate with a nonce or Cart-Token | Authorization to perform these operations during this task, or a locked total |
| Cart-Token | Identifies a Store API cart through request headers | Automatic transfer of that cart into a plain hosted checkout link |
| Native `/checkout-link/?products=6271:1` | Documented shareable session-bearing checkout link | Installed-site support, correspondence with the calculated Store API cart or fixed price |
| Checkout API | Documented total recalculation and `expected_total` rejection at payment | Inert inspection: even `GET /checkout` creates a draft order |

Sources: [Products API](https://developer.woocommerce.com/docs/apis/store-api/resources-endpoints/products/), [REST reference](https://woocommerce.github.io/woocommerce-rest-api-docs/), [Cart API](https://developer.woocommerce.com/docs/apis/store-api/resources-endpoints/cart/), [Cart Tokens](https://developer.woocommerce.com/docs/apis/store-api/cart-tokens/), [Shareable checkout URLs](https://developer.woocommerce.com/docs/best-practices/urls-and-routing/checkout-urls/), [Checkout API](https://developer.woocommerce.com/docs/apis/store-api/resources-endpoints/checkout/). These are platform capabilities, not verified facts about this installation.

### Proposed integration sequence

1. In an authorized sandbox, verify installed Woo version, Store API support, shipping/tax/gateway rules and a native same-session checkout handoff. Avoid broad admin credentials unless a proven requirement emerges.
2. Connect a real provider to the implemented dependency-injected seam. It must accept only an approved offer/version, current lead/event, one mapped product and the minimum verified destination/rate context. Reserve an isolated order/session idempotently. Reject extra items, unexpected coupons/fees, unselected shipping and incomplete destination calculation.
3. Normalize Woo integer minor units and the complete composition, including discounts and named fees. Compare with the approved offer; advertised 990 ILS does not imply zero tax.
4. Store a short-lived provider record with quote/reference IDs, timestamps, product/quantity, destination/rate and checkout-session bindings. Keep cart credentials private. Extend the exact URL contract only after proving the allowed hosted URL opens this same context.
5. Require recalculation and renewed consent for changed totals or terms. Use supported expected-total enforcement at payment, or a verified equivalent; quote freshness alone does not lock a checkout.
6. Connect issuance to the existing reply checkout seam, then run sandbox contract, concurrency, changed-cart/destination and payment tests. Only then consider a separately approved activation.

No live products, customer carts, draft orders, payments or credentials were accessed for this investigation. No WordPress changes were made. If native session handoff proves sufficient, a custom WordPress bridge may be unnecessary. Otherwise, that bridge requires a separately scoped design and approval.

## Acceptance checks

The new and updated tests exercise the pure direction contract, real deterministic conversation runtime, approved catalog validation and the real reply handler with mocked external effects. They cover printed-first prices, honest digital availability, explicit comparison, questions before checkout, design approval/corrections, unknown policy handoff, existing-customer service and no unverified final-total guarantee.

Independent review also verified printing-only/unsupported-product handoff, direct printed-price questions containing a budget, negative/no-print price questions, mixed free-book/design claims, and a scoped format refusal with a separate opt-out. Review validation: 5 suites / 419 tests plus 17 independent runtime checks passed. Final full repository: 117 suites / 2,450 tests passed; TypeScript, changed-file ESLint and production compile mode passed. Full generation and live provider verification were not performed.

Runnable command:

```sh
./node_modules/.bin/vitest run tests/salesCommercialDirection.test.js tests/salesConversationContract.test.js tests/salesApprovedOfferContract.test.js tests/salesReplyRoute.test.js tests/salesOfferApprovalRoute.test.js --maxWorkers=1 --minWorkers=1
```

See the [full specification matrix](conversational-sales-2026-10-05.md) for the full-suite verification result and unchanged live integration/release gates.
