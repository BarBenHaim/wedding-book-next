# Smart WhatsApp Follow-Ups Design

## Goal

Turn the existing three-touch follow-up ladder into a context-aware sales mechanism that sends one useful next step, stops safely, and can be measured against verified purchases.

## Non-negotiable boundaries

- Never send after a verified payment, terminal stage, active human handoff, expired event, or three delivered follow-ups.
- Stop the ladder as soon as the customer replies.
- Never invent a coupon, expiry, price, scarcity claim, media asset, or delivery promise.
- A coupon may appear only when a real configured code has an explicit future expiry no more than 48 hours away.
- Outside WhatsApp's 24-hour service window, send only a named approved Meta template. The first site template may carry the one approved product video as its template header; it is never sent as a second free-form message.
- Inside the service window, free-form text and one unsent video may be used.
- One CTA per follow-up. Do not repeat media already acknowledged as delivered.
- Customer text, phone numbers, provider bodies, tokens, and media URLs must not be added to operational logs.

## Sales ladder

1. `proof_site` — first follow-up: give a concrete reason to continue, use the real product video when available, and direct to `https://weddingtales.co.il`.
2. `resolve_blocker` — second follow-up: address the lead's current stage. A payment-ready lead gets a checkout-friction question; an objection lead gets one concise value clarification; a generic engaged lead gets the site and proof, without repeating the video.
3. `qualified_offer` or `graceful_close` — final follow-up: a high-intent lead may receive a real configured 48-hour coupon; every other lead gets a short respectful close with no discount.

`ready_to_pay`, `offer_sent`, `objection`, `commit_later`, and `demo_sent` count as high intent. A configured coupon is not enough by itself; the lead must also be high intent.

## Runtime contract

`planFollowUp(lead, options)` is pure and returns a bounded plan:

```js
{
  id: 'proof_site' | 'resolve_blocker' | 'qualified_offer' | 'graceful_close',
  objective: string,
  cta: 'website' | 'reply' | 'coupon' | 'none',
  landingUrl: 'https://weddingtales.co.il' | null,
  mediaPreference: 'video' | 'none',
  coupon: { code: string, expiresAt: string } | null,
  templateName: 'wt_followup_site' | 'wt_followup_help' | 'wt_followup_offer' | 'wt_followup_close',
  templateParameters: string[],
  templateText: string,
}
```

The planner receives an already validated offer. Environment parsing is isolated in `readFollowUpOffer`, which returns `null` unless `SALES_FOLLOWUP_COUPON_CODE` and `SALES_FOLLOWUP_COUPON_EXPIRES_AT` satisfy the constraints.

The prompt receives the plan as a binding instruction. The model may phrase the message naturally, but it may not choose a different offer, link, media action, or objective.

## Delivery and measurement

Every prepared outbound part stores only bounded strategy metadata: `followUpStrategyId`, `followUpCta`, and `followUpMediaKind`. When the primary part is delivered/read, the lead stores the last strategy and CTA alongside the existing delivery truth. This lets BusinessOS correlate replies and verified WooCommerce purchases without storing message content in analytics fields.

Inside the service window, video uses its own outbound ID and never advances the ladder. Outside the window, the first video is part of the primary `wt_followup_site` template header, so there is still only one cadence owner and no forbidden free-form media send.

## Meta templates

The runtime supports four Hebrew marketing templates with exact parameter counts. `wt_followup_site` has an approved video header plus one body parameter; the other templates have body parameters only. Every route that uses the same template stores the exact same rendered customer copy. Until Meta approves a template, its strategy must fail truthfully with `GRAPH_REJECTED`; it must remain due and must not be counted as delivered.
