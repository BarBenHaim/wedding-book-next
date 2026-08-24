# BusinessOS Make and Typed WhatsApp Variable Control

Date: 2026-08-24

Status: approved in conversation by the business owner.

Repositories:

- Wedding Tales (`wedding-book`) remains the runtime, media store, experiment source of truth, and delivery ledger.
- BusinessOS is the authenticated owner control plane.
- Make scenario `9630287` is the WhatsApp transport. Scenarios `9282383` and `9370425` remain visible as infrastructure controls. No other Make scenario may be controlled by this feature.

## Goal

Let the owner operate the WhatsApp opening system without entering Make: view and verify scenario state, start or stop an allowlisted scenario, manage a shared typed variable library, compose A/B/C opening journeys from text and media variables, publish immutable revisions, and measure results against the exact content that was delivered.

## Product boundary

This work extends the existing deterministic opening experiment. It does not restore a free-form AI conversation and it does not add telephone-call behavior. Make remains a transport adapter and never selects content, resolves variables, assigns variants, advances a lead, or decides what to send.

Draft editing is inert. Uploading or replacing an asset does not alter a live journey. Only an explicit publish creates a new executable revision. Existing enrolled conversations remain pinned to their prior published snapshot; only newly enrolled leads use the new revision.

## Owner experience

The existing BusinessOS sales-agent screen gains one coherent control room with these areas:

1. **Live transport** — three allowlisted Make scenario rows show role, current state, last verified time, and a start/stop action. Scenario `9630287` is labelled as the primary sales transport; `9282383` and `9370425` are labelled as infrastructure. Unknown scenarios are never returned or mutated.
2. **Variable library** — shared variables are created once and can be referenced from any A/B/C journey. The owner can search, preview, replace, archive, and inspect the published version of each variable.
3. **Journeys** — the existing three-lane A/B/C editor supports typed variable blocks, exact ordering, keyboard reordering, and a phone-like preview of the resolved draft.
4. **Publish review** — a preflight shows the exact ordered parts that a new lead would receive, missing or incompatible variables, the next revision, and which variants are enabled. Publish is disabled until every error is resolved.
5. **Results** — delivery, reply, continuation, relevance, payment, and revenue remain attributed to the pinned variant revision. Media results are also grouped by immutable asset-version identity, not by the mutable variable name.

The visual language stays aligned with the current BusinessOS Revenue Control Room. The signature remains the three parallel A/B/C WhatsApp timelines; the new variable library behaves like a disciplined asset tray rather than a generic file manager. The screen remains RTL-first, usable at 320px, keyboard operable, 44px minimum targets, visibly focused, and reduced-motion safe.

## Typed variable model

There are two namespaces.

### System lead fields

Read-only tokens are resolved at execution from proven lead data:

- `{{first_name}}`
- `{{event_type}}`
- `{{event_date}}`
- `{{child_name}}`
- `{{days_to_event}}`
- `{{payment_link}}`

An unresolved optional field becomes an empty bounded value only where the template explicitly supplies fallback copy. A required unresolved field fails the block closed and creates an owner-visible action; it is never guessed.

### Owner variables

An owner variable has:

```text
id, key, label, kind, draftVersion, publishedVersion, archived, createdAt, updatedAt
```

`kind` is exactly one of `text`, `image`, `video`, or `audio`. Keys are stable, unique slugs used by journey blocks, for example `opening_explanation`, `cover_example`, `demo_video`, and `voice_intro`. A variable kind cannot be changed after first publication; the owner creates a replacement variable instead.

Text versions contain bounded owner-authored text and may reference only allowlisted system lead fields. Media versions contain a private storage object identity plus verified MIME type, size, checksum, optional caption, usage instruction, and `voiceNote` for audio. API responses expose a short-lived preview URL, never storage credentials or provider tokens.

The same variable registry is available to all A/B/C variants. There is no per-variant copy or override. A journey chooses where and how often to reference a shared variable.

## Journey blocks and publication snapshots

The existing block contract remains. `text` blocks may hold literal text or a reference to a text variable. `media` blocks reference exactly one image, video, or audio variable. Media kind is derived from the published variable version and cannot be overridden by the block.

Publishing performs one server-side transaction:

1. Normalize the complete experiment and reject stale settings revision.
2. Validate every variable reference, system token, block order, enabled weight, and terminal stop.
3. Require a published-ready draft version for each referenced owner variable.
4. Copy the resolved variable-version IDs into the new immutable experiment snapshot.
5. Preserve the previous settings and variable bindings in revision history.
6. Increment the settings revision and expose the new snapshot to new lead assignments.

Replacing a variable file creates a new draft version. It does not rewrite any prior snapshot. Restoring a historical experiment creates a new revision bound to the historical variable versions when those versions are still available; otherwise restore fails with a fixed missing-asset error and changes nothing.

## Media upload and validation

Large files never travel through a BusinessOS or Vercel application-body proxy. BusinessOS requests an authenticated, short-lived upload session from Wedding Tales. The browser uploads directly to the Wedding Tales storage destination, then calls finalize with the opaque upload ID. Finalize verifies path ownership, object existence, size, MIME type, checksum, and expiration before a draft asset version can be selected.

The server allowlist follows the official WhatsApp Cloud media contract:

- Images: JPEG or PNG, at most 5 MB.
- Video: supported WhatsApp video formats, at most 16 MB; incompatible codec is rejected during preflight rather than discovered by a customer.
- Audio: AAC, MP4 audio, MPEG, AMR, or Opus-in-OGG, at most 16 MB.

Audio has an explicit `voiceNote` toggle. When enabled, transport uses the WhatsApp Cloud audio payload with `voice: true`; otherwise it is sent as a regular audio attachment. The official Meta WhatsApp Cloud API Postman collection documents audio-by-ID or audio-by-URL and the `voice` field.

Upload sessions expire, are single-purpose, and are restricted to a generated object path. Cancelled and unfinalized uploads never appear in the variable picker. Archive removes a variable from new drafts but never deletes an asset version referenced by published history or a lead.

## Make control contract

BusinessOS already owns the Make token server-side. The control API is narrowed to the exact allowlist:

| Scenario | Role |
| --- | --- |
| `9630287` | Primary WhatsApp sales transport |
| `9282383` | WhatsApp Cloud infrastructure |
| `9370425` | Inbound infrastructure |

GET reads current Make truth and returns only allowlisted scenario ID, display name, role, `isActive`, queue-health summary, and `verifiedAt`. POST accepts an exact `{ scenarioId, action, expectedActive }` where action is `start` or `stop`. Authentication runs before parsing or contacting Make.

State mutation is compare-and-verify:

1. Read current state and reject a stale UI expectation with conflict.
2. Before every start, require a healthy published experiment, no missing assets, valid transport mapping for every referenced media kind, and a safe queue state.
3. Call Make's official `/scenarios/{scenarioId}/start` or `/stop` endpoint.
4. Read state again and report success only when the returned truth matches the request.
5. Write a sanitized audit record containing actor, scenario ID, action, prior/verified state, and timestamps. Tokens, customer data, and provider bodies are never logged.

Publishing does not automatically start Make. Starting transport remains a separate explicit owner action. The control room may show the newly published revision as ready, but it cannot silently activate a scenario.

For webhook-triggered scenarios, a safe queue means zero pending items. BusinessOS reads the assigned hook and queue statistics before start. A non-empty queue blocks activation and shows only the count and oldest/newest arrival time, never payload content. To preserve the goal of never entering Make, the owner may explicitly discard the displayed stale queue from BusinessOS. That destructive action requires a separate confirmation naming the scenario and item count, deletes only the IDs shown by the immediately preceding read, re-reads the queue, and still does not start the scenario automatically.

## Transport parts and delivery truth

Wedding Tales resolves a pinned snapshot into ordered parts with stable, phone-free IDs. Each part is one of text, image, video, or audio and carries only the minimum Make selectors needed to send it. Audio includes a server-derived `voiceNote` boolean. Make routes by part kind, sends in order, and posts accepted/failed plus later delivered/read status using the existing delivery callback contract.

Provider acceptance is not delivery. A journey advances and experiment exposure is credited only by the existing delivered/read ledger. A failed part remains visible as a repairable owner action and cannot be silently counted as sent. Variable and asset-version IDs are stored on the outbound delivery record so results remain truthful after a draft variable is replaced.

## Error handling and privacy

- Every mutation is authenticated and request-size bounded.
- Unknown scenario IDs, variable kinds, tokens, MIME types, storage origins, and block references fail closed with fixed safe codes.
- Provider response bodies, access tokens, raw phone numbers, message text, media URLs, and customer image identities are not logged by new code.
- A partial upload, failed finalize, stale publish, failed Make action, failed verification, or missing callback leaves the previous published version and scenario truth unchanged.
- UI errors explain the corrective action without exposing infrastructure details.
- Emergency stop is always available for an active allowlisted scenario even if experiment or media health is degraded.

## Testing and release

All production behavior follows RED-GREEN-REFACTOR.

Wedding Tales tests cover variable normalization, token resolution, immutable snapshots, stale publication, upload-session authorization and bounds, finalization, voice-note payloads, ordered parts, asset-version attribution, restore, and failure privacy. BusinessOS tests cover authenticated Make control, allowlisting, stale-state conflicts, post-action verification, preflight gating, variable CRUD, upload flow, preview, typed block compatibility, publish review, keyboard/mobile behavior, and safe offline states.

No automated test contacts Make, Meta, Firebase production, or a customer. Full suites, lint, typecheck, production builds, diff checks, and 320/768/desktop browser review must pass in both repositories. The live release sequence is deploy Wedding Tales, deploy BusinessOS, verify read-only state, upload one non-customer test asset, publish a test-safe draft, validate the transport blueprint, inspect queue health, then explicitly start only the owner-selected scenario. A live smoke uses an owner-controlled test recipient and requires delivery callback truth before customer traffic is allowed.

## Acceptance criteria

- The owner can view, start, and stop each of the three allowlisted Make scenarios from BusinessOS and cannot mutate any other scenario.
- UI state is shown as active only after a post-action Make verification.
- Start is blocked by stale expectation, unsafe queue, invalid transport mapping, missing published experiment, or missing asset; stop is never blocked by those health gates.
- One shared variable library supports text, image, video, and audio/voice-note assets.
- A variable can be referenced from any A/B/C journey without creating a per-variant copy.
- Uploading or replacing content changes only a draft; an explicit publish creates the executable immutable snapshot.
- Prior lead assignments and historical metrics remain bound to the original variable and asset versions.
- Text templates resolve only the six allowlisted system lead fields and never invent absent values.
- The publish preflight shows the exact ordered resolved parts and rejects missing or incompatible variables.
- Make sends audio as regular audio or a voice note according to the published owner setting.
- Delivery and revenue reporting attributes outcomes to pinned experiment and asset versions using acknowledged delivery truth.
- The complete experience works in RTL at 320px, by keyboard, with visible focus and reduced motion.
- Both repositories pass focused and full verification without sending any live WhatsApp message during tests.

## Authoritative external contracts

- Make Scenario API: https://developers.make.com/api-documentation/api-reference/scenarios
- Meta WhatsApp Cloud API collection: https://www.postman.com/meta/whatsapp-business-platform/documentation/wlk6lh4/whatsapp-cloud-api
