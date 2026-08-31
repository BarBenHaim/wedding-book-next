# Dynamic Opening Variants Design

## Goal

Let the owner duplicate and delete WhatsApp opening journeys in BusinessOS while preserving safe publication, deterministic assignment, historical analytics, and already-enrolled conversations.

## Scope

This change extends the existing opening experiment in two applications:

- BusinessOS owns the draft editor and exposes clone/delete controls.
- Wedding Tales validates and publishes the experiment, assigns new leads, executes pinned journeys, sends mobile tests, and reports metrics.

The existing A/B/C journeys remain valid. A published experiment may contain between one and eight journeys. This change does not publish the current 40/40/20 draft and does not send any WhatsApp messages.

## Product behaviour

### Duplicate

Each journey card has a `שכפל מסלול` action. Duplicating creates a local draft journey with:

- the same customer-facing blocks, text, media, and variable bindings;
- regenerated block IDs so delivery idempotency keys cannot collide;
- a new immutable internal ID matching `v_[a-f0-9]{12}`;
- the label `<source label> · עותק`, truncated to 60 characters;
- `enabled: false`, `weight: 0`, and a draft revision value of `1`.

The owner must explicitly enable the clone and choose a weight before it can receive leads. The action is disabled when the draft already has eight journeys.

### Delete

Each journey card has a `מחק מסלול` action. It requires an explicit browser confirmation stating that deletion applies only after publication and historical results remain available. Deletion changes only the local draft. The last remaining journey cannot be deleted.

Publishing a deletion removes that journey only from assignment of new leads. Existing leads continue using the complete `openingFlow` snapshot pinned on their lead record. Historical settings revisions and lead metrics remain intact.

### Dynamic experiment UI

The experiment dashboard, journey editor, mobile-test buttons, lead table, approval cards, headings, and responsive layout render the published/draft journey array rather than assuming A/B/C. User-facing surfaces prefer the journey label; the immutable internal ID is secondary diagnostic information.

Mobile tests operate on the published journey only. Their request accepts one bounded internal ID, and Wedding Tales verifies that the ID exists in the current published experiment before sending to the configured test phone.

## Data contract

An opening variant has:

```text
id: A | B | C | v_[a-f0-9]{12}
label: non-empty text, max 60 characters
enabled: boolean
weight: integer 0..1000; enabled journeys require weight > 0
revision: positive integer assigned authoritatively by Wedding Tales
blocks: 1..20 validated opening blocks, ending in exactly one stop block
```

An experiment contains 1..8 unique variants and at least one enabled variant with positive weight.

BusinessOS generates new random IDs with Web Crypto and never exposes an ID editor. Wedding Tales remains authoritative: it validates the ID grammar, variant uniqueness, limits, block ordering, variables, and media before publication.

## Revision lineage and analytics safety

Wedding Tales stores a server-owned `openingVariantLineages` map alongside active sales settings. The map records the highest published revision for every internal variant ID encountered, including removed variants.

On publish:

- an unchanged current journey keeps its revision;
- a changed current journey increments its revision;
- a never-seen ID starts at revision 1;
- a previously removed ID, if submitted again, receives the next revision after its lineage maximum;
- removed IDs stay in the lineage map.

The map is never accepted from BusinessOS. Restore operations merge with the current lineage and apply the same revision rules, so restoring an old settings snapshot cannot reopen an old analytics cohort. Cohorts remain keyed by `(variantId, variantRevision)`.

The lineage map is bounded to 512 IDs. Publication fails closed with a fixed safe error if a new ID would exceed the bound.

## Assignment and conversation continuity

Weighted assignment continues to hash the lead key and select from all enabled positive-weight journeys. The algorithm is independent of journey count and order except for the explicit order in the published array.

Once assigned, a lead retains `openingVariantId`, `openingVariantRevision`, and the full pinned `openingFlow`. Removing or pausing the published variant cannot rewrite that snapshot. A journey that is still present but disabled remains an emergency stop for its enrolled leads. A journey absent because it was deleted continues only for already-enrolled leads from their pinned snapshot. Deletion does not delete customer or delivery data.

## Error handling and safety

- Clone fails locally if Web Crypto cannot create a unique valid ID after bounded retries.
- The UI prevents cloning above eight journeys and deleting the last journey.
- Publication rejects invalid IDs, duplicates, more than eight journeys, no active weighted journey, invalid variables/media, stale settings revisions, and exhausted lineage capacity.
- All API errors remain fixed allowlisted codes; no customer text, phone number, media URL, token, or provider body is logged or returned.
- Clone/delete never calls Make, Meta, WhatsApp, or the Wedding Tales publish endpoint. Only the existing `פרסם גרסה` action changes live assignment.

## Testing

Wedding Tales tests cover:

- normalization of 1 and 8 dynamic journeys and rejection of 0, 9, duplicate, or malformed IDs;
- deterministic weighted assignment across dynamic IDs;
- authoritative revision behaviour for clone, delete, re-add, restore, stale publication, and lineage capacity;
- published mobile tests for a dynamic ID and rejection of unknown IDs;
- metrics isolation by ID and revision and continuation of pinned deleted journeys.

BusinessOS tests cover:

- deep cloning with new journey/block IDs, copied variable/media bindings, disabled state, and weight 0;
- the eight-journey limit and last-journey deletion guard;
- confirmation and local-draft-only deletion;
- dynamic rendering, mobile-test request, publish payload, lead labels, and accessible controls at mobile widths;
- preservation of an unsaved draft until the owner publishes it.

Both repositories must pass focused tests, their full test suites, changed-file lint, type/build checks used by the project, and `git diff --check` before deployment.

## Rollout

Deploy Wedding Tales first so the backend accepts the expanded contract, then deploy BusinessOS. Verify read-only that the current three published journeys still load unchanged. Do not publish or test-send a customer journey during rollout. The existing 40/40/20 local draft is published only after a separate action-time confirmation from the owner.
