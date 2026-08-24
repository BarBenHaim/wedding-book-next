# BusinessOS Make and Typed WhatsApp Variable Control Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the owner manage shared text/image/video/audio variables, publish immutable A/B/C WhatsApp openings, and safely start or stop the three approved Make scenarios entirely from BusinessOS.

**Architecture:** Wedding Tales owns typed variables, storage, immutable publication snapshots, runtime resolution, and delivery truth. BusinessOS owns authenticated editing, direct-to-storage upload orchestration, preview, Make state/queue controls, audit, and reporting. Make remains a stopped-while-changing transport that routes ordered text/image/video/audio parts and reports provider/delivery evidence.

**Tech Stack:** Wedding Tales Next.js 15/React 18/JavaScript/Firebase Admin/Firestore/Cloud Storage/Vitest; BusinessOS Next.js 14/React 18/TypeScript/Drizzle/Postgres/Testing Library/Vitest; Make API v2; WhatsApp Cloud API.

**Spec:** `docs/superpowers/specs/2026-08-24-businessos-make-variable-control-design.md`

## Global Constraints

- Make controls are restricted to scenario IDs `9630287`, `9282383`, and `9370425`.
- Draft edits and uploads never send messages and never modify a published snapshot.
- Publishing does not start Make; starting is a separate authenticated owner action.
- Existing leads remain pinned to their original experiment and variable-version snapshot.
- No free-form AI conversation and no phone-call behavior is introduced.
- Only delivered/read callbacks create exposure, progress, or media outcome credit.
- Images are JPEG/PNG up to 5 MB; videos are WhatsApp-compatible up to 16 MB; audio is AAC/MP4 audio/MPEG/AMR/Opus OGG up to 16 MB.
- Tests never contact production Make, Meta, Firebase, Vercel, or a customer.
- Every production behavior starts with a failing test and follows RED-GREEN-REFACTOR.
- Use isolated worktrees for both repositories at execution time and preserve unrelated user changes.

---

### Task 1: Pure typed-variable and template contract in Wedding Tales

**Files:**
- Create: `wedding-book/src/lib/salesAgent/salesVariables.js`
- Create: `wedding-book/tests/salesVariables.test.js`
- Modify: `wedding-book/src/lib/salesAgent/openingExperiment.js`
- Modify: `wedding-book/tests/salesOpeningExperiment.test.js`

**Interfaces:**
- Produces `VARIABLE_KINDS`, `SYSTEM_VARIABLE_KEYS`, `normalizeVariableKey(value)`, `normalizeSalesVariable(input)`, `normalizeSalesVariableVersion(input)`, `renderSalesTemplate(template, context)`, and `bindOpeningVariables(experiment, variables)`.
- `bindOpeningVariables` returns an immutable normalized experiment whose variable-backed blocks contain `{ variableKey, variableVersionId }` and whose legacy literal/media blocks remain executable.

- [ ] **Step 1: Write failing pure tests**

Name the breaks: accepting an unknown token, changing a published variable kind, resolving a missing required field, binding a draft-less variable, and mutating a prior snapshot. Add literal expectations such as:

```js
it('renders only allowlisted proven system fields', () => {
    expect(renderSalesTemplate(
        'היי {{first_name}}, האירוע הוא {{event_type}} בתאריך {{event_date}}',
        { first_name: 'נועה', event_type: 'בר מצווה', event_date: '2026-12-03' },
    )).toBe('היי נועה, האירוע הוא בר מצווה בתאריך 2026-12-03')
    expect(() => renderSalesTemplate('שלום {{phone}}', { phone: 'test-phone-123' }))
        .toThrow('UNKNOWN_SYSTEM_VARIABLE')
})

it('binds one shared media variable to an immutable published version', () => {
    const result = bindOpeningVariables(experimentWith('demo_video'), {
        demo_video: { key: 'demo_video', kind: 'video', publishedVersion: { id: 'v3', status: 'published' } },
    })
    expect(result.variants[0].blocks[0]).toEqual({
        id: 'a-video', type: 'media', variableKey: 'demo_video', variableVersionId: 'v3',
    })
})
```

- [ ] **Step 2: Run RED**

Run: `npx vitest run tests/salesVariables.test.js tests/salesOpeningExperiment.test.js`

Expected: failure because `salesVariables.js` and typed variable bindings do not exist.

- [ ] **Step 3: Implement the minimal pure contract**

Use these exact public constants and shapes:

```js
export const VARIABLE_KINDS = Object.freeze(['text', 'image', 'video', 'audio'])
export const SYSTEM_VARIABLE_KEYS = Object.freeze([
    'first_name', 'event_type', 'event_date', 'child_name', 'days_to_event', 'payment_link',
])

// Text version
{ id, kind: 'text', value, status: 'draft' | 'published', createdAtMs }

// Media version
{
  id, kind: 'image' | 'video' | 'audio', objectPath, contentType, bytes,
  checksum, caption, when, voiceNote, status: 'draft' | 'published', createdAtMs,
}
```

`renderSalesTemplate` must reject unknown tokens, replace proven values, and throw `REQUIRED_SYSTEM_VARIABLE_MISSING` when a referenced value is null/empty. `normalizeOpeningExperiment` must accept legacy `{ text }`/`{ mediaKey }` and new `{ variableKey }` forms but reject a block that supplies both.

- [ ] **Step 4: Run GREEN and mutation-check boundaries**

Run: `npx vitest run tests/salesVariables.test.js tests/salesOpeningExperiment.test.js tests/salesSettings.test.js`

Mentally mutate the kind check, token allowlist, and version binding; at least one test must fail for each mutation.

- [ ] **Step 5: Commit Task 1**

Commit message: `feat(sales): define typed opening variables`

---

### Task 2: Versioned variable persistence and direct upload sessions

**Files:**
- Create: `wedding-book/src/lib/salesAgent/salesVariableStore.js`
- Create: `wedding-book/src/lib/salesAgent/salesVariableHandlers.js`
- Create: `wedding-book/src/app/api/sales-agent/variables/route.js`
- Create: `wedding-book/src/app/api/sales-agent/variables/upload/route.js`
- Create: `wedding-book/tests/salesVariableStore.test.js`
- Create: `wedding-book/tests/salesVariableRoutes.test.js`
- Create: `wedding-book/tests/salesVariableUpload.test.js`
- Modify: `wedding-book/storage.rules`

**Interfaces:**
- Firestore: `sales_variables/{key}` and `sales_variables/{key}/versions/{versionId}`.
- Upload session: `sales_variable_uploads/{uploadId}` with `{ variableKey, kind, objectPath, contentType, bytes, checksum, expiresAt, consumedAt }`.
- `POST /api/sales-agent/variables/upload` supports exact actions `prepare` and `finalize`; `GET/POST /api/sales-agent/variables` reads and mutates safe metadata only.

- [ ] **Step 1: Write failing store tests**

Use the existing transactional Firestore fake pattern from `tests/salesSettingsFirestore.test.js`. Cover draft creation, replacement producing a new version, immutable published versions, archive preserving referenced versions, stale expected draft version, and transaction rollback.

```js
it('replacing a published audio variable creates a draft without changing published truth', async () => {
    store.seedVariable('voice_intro', { kind: 'audio', publishedVersionId: 'v1', draftVersionId: 'v1' })
    await saveVariableDraft({ key: 'voice_intro', kind: 'audio', expectedDraftVersionId: 'v1', version: audioV2 })
    expect(store.variable('voice_intro')).toMatchObject({ publishedVersionId: 'v1', draftVersionId: 'v2' })
    expect(store.version('voice_intro', 'v1')).toMatchObject({ status: 'published' })
})
```

- [ ] **Step 2: Run store RED, then implement and run GREEN**

Run RED: `npx vitest run tests/salesVariableStore.test.js`

Implement `listSalesVariables`, `readSalesVariableVersions`, `saveVariableDraft`, `archiveSalesVariable`, `createUploadSession`, and `finalizeUploadSession`. Use Firestore transactions for version-pointer writes and server timestamps for audit fields.

Run GREEN: `npx vitest run tests/salesVariableStore.test.js`

- [ ] **Step 3: Write failing upload/route tests**

Cover authentication before reads, 64 KiB JSON bound, key/kind/MIME/size allowlists, one-hour signed PUT expiry, generated path confinement under `sales-variable-media/`, required `x-goog-meta-sha256`, missing object, metadata mismatch, expired/replayed upload, fixed safe errors, and absence of credentials/provider payloads.

```js
expect(prepare.body).toEqual({
    ok: true,
    uploadId: 'upload-safe-1',
    method: 'PUT',
    uploadUrl: 'https://storage.googleapis.test/signed-upload',
    headers: { 'content-type': 'audio/ogg', 'x-goog-meta-sha256': 'a'.repeat(64) },
    expiresAt: 1_777_000_000_000,
})
```

- [ ] **Step 4: Implement pure handlers and thin routes**

The route authenticates with the existing shared secret or super-admin identity, then delegates to dependency-injected handlers. `prepare` calls `bucket.file(objectPath).getSignedUrl({ action: 'write', expires, contentType, extensionHeaders })`; `finalize` reads object metadata and never trusts client-provided final URL.

Use these fixed size limits:

```js
const LIMITS = Object.freeze({ image: 5 * 1024 * 1024, video: 16 * 1024 * 1024, audio: 16 * 1024 * 1024 })
```

- [ ] **Step 5: Run focused GREEN and rules regression**

Run: `npx vitest run tests/salesVariableStore.test.js tests/salesVariableRoutes.test.js tests/salesVariableUpload.test.js tests/salesMediaLibrary.test.js`

Verify `storage.rules` permits only the signed/server-owned `sales-variable-media/` flow and does not broaden public customer uploads.

- [ ] **Step 6: Commit Task 2**

Commit message: `feat(sales): version opening assets safely`

---

### Task 3: Atomic publication snapshots and runtime resolution

**Files:**
- Modify: `wedding-book/src/lib/salesAgent/settingsStore.js`
- Modify: `wedding-book/src/lib/salesAgent/settings.js`
- Modify: `wedding-book/src/lib/salesAgent/openingExperiment.js`
- Modify: `wedding-book/src/app/api/sales-agent/experiment/route.js`
- Modify: `wedding-book/src/app/api/sales-agent/reply/route.js`
- Modify: `wedding-book/src/lib/salesAgent/inboundEventsCore.js`
- Modify: `wedding-book/src/lib/salesAgent/leads.js`
- Modify: `wedding-book/tests/salesSettingsFirestore.test.js`
- Modify: `wedding-book/tests/salesOpeningExperimentRoute.test.js`
- Create: `wedding-book/tests/salesOpeningVariablesRuntime.test.js`
- Modify: `wedding-book/tests/salesReplyRoute.test.js`
- Modify: `wedding-book/tests/salesInboundEvents.test.js`

**Interfaces:**
- `publishSalesSettingsSnapshot(input, { updatedBy })` atomically binds draft variable versions, preserves history, marks the bound versions published, and increments settings revision.
- `resolveOpeningSnapshotParts({ flow, state, inbound, variableVersions, leadContext, eventId, signDownload })` returns ordered text/image/video/audio parts with `{ variableKey, variableVersionId, voiceNote }`.

- [ ] **Step 1: Write failing publication transaction tests**

Cover stale settings revision, stale expected variable draft version, missing/archived variable, incompatible block kind, no partial variable publication, exact prior-history snapshot, restore with available versions, and restore refusal when a bound version is absent.

```js
await expect(publishSalesSettingsSnapshot({
    revision: 7,
    expectedVariableDrafts: { voice_intro: 'v2' },
    openingExperiment: experimentWith('voice_intro'),
}, { updatedBy: 'owner@example.test' })).resolves.toMatchObject({
    revision: 8,
    openingExperiment: { variants: [{ blocks: [{ variableKey: 'voice_intro', variableVersionId: 'v2' }] }] },
})
```

- [ ] **Step 2: Run publication RED and implement minimal atomic binding**

Run RED: `npx vitest run tests/salesSettingsFirestore.test.js tests/salesOpeningExperimentRoute.test.js`

Move publish-only variable binding into the same Firestore transaction as settings history. Keep `saveSalesSettings` compatibility for unrelated legacy settings callers, but make the experiment route use `publishSalesSettingsSnapshot`.

Run GREEN with the same command.

- [ ] **Step 3: Write failing runtime and cache tests**

Prove exact token rendering, required-field fail-closed behavior, a 15-minute signed media URL created only during a claimed send, audio `voiceNote`, stable part IDs without phones/content, duplicate inbound returning cached parts with no second signing call, and delivery records retaining variable/version identity.

```js
expect(result.parts).toEqual([
    { partId: 'safe-text-id', blockId: 'a-text', order: 1, kind: 'text', text: 'היי נועה', variableKey: 'opening_text', variableVersionId: 'v4' },
    { partId: 'safe-audio-id', blockId: 'a-audio', order: 2, kind: 'audio', url: 'https://storage.test/signed', caption: '', voiceNote: true, variableKey: 'voice_intro', variableVersionId: 'v2' },
])
```

- [ ] **Step 4: Implement runtime resolution and durable attribution**

Extend `runOpeningFlow` media output and reply serialization to carry audio. Extend cached inbound outcomes and delivery preparation with `variableKey`, `variableVersionId`, and `voiceNote`; do not add raw URLs or message text to logs. Existing accepted/delivered/read semantics remain unchanged.

- [ ] **Step 5: Run GREEN and delivery regressions**

Run: `npx vitest run tests/salesOpeningVariablesRuntime.test.js tests/salesReplyRoute.test.js tests/salesInboundEvents.test.js tests/salesDelivery.test.js tests/salesDeliveryFirestore.test.js tests/salesOpeningAnalytics.test.js`

- [ ] **Step 6: Commit Task 3**

Commit message: `feat(sales): publish immutable variable journeys`

---

### Task 4: BusinessOS variable clients, proxies, and upload orchestration

**Files:**
- Create: `BusinessOS/src/lib/sales-agent/variable-client.ts`
- Create: `BusinessOS/src/app/api/sales-agent/variables/route.ts`
- Create: `BusinessOS/src/app/api/sales-agent/variables/upload/route.ts`
- Modify: `BusinessOS/src/lib/sales-agent/experiment-client.ts`
- Modify: `BusinessOS/src/app/api/sales-agent/experiment/route.ts`
- Create: `BusinessOS/tests/unit/sales-agent-variable-client.test.ts`
- Create: `BusinessOS/tests/integration/sales-agent-variables-route.test.ts`
- Create: `BusinessOS/tests/integration/sales-agent-variable-upload-route.test.ts`
- Modify: `BusinessOS/tests/unit/sales-agent-experiment-client.test.ts`

**Interfaces:**
- `readSalesVariables`, `mutateSalesVariable`, `prepareVariableUpload`, and `finalizeVariableUpload` call Wedding Tales with a 12-second deadline and fixed safe errors.
- BusinessOS upload proxy accepts JSON only. The browser sends bytes directly to the signed Wedding Tales storage URL returned by `prepare`.

- [ ] **Step 1: Write failing client/proxy tests**

Cover missing server secret, upstream timeout, malformed response, token/URL validation, unauthenticated access, exact request allowlists, 64 KiB bounds, and no secret forwarding to the browser.

```ts
expect(fetcher).toHaveBeenCalledWith(
  'https://wedding.test/api/sales-agent/variables/upload',
  expect.objectContaining({
    method: 'POST',
    headers: expect.objectContaining({ 'x-wt-secret': 'server-only-secret' }),
    body: JSON.stringify({ action: 'prepare', variableKey: 'voice_intro', kind: 'audio', contentType: 'audio/ogg', bytes: 1200, checksum: 'a'.repeat(64) }),
  }),
);
```

- [ ] **Step 2: Run RED**

Run: `npm test -- --run tests/unit/sales-agent-variable-client.test.ts tests/integration/sales-agent-variables-route.test.ts tests/integration/sales-agent-variable-upload-route.test.ts`

- [ ] **Step 3: Implement typed validators and authenticated routes**

Mirror the exact safe Wedding response types. Accept upload URLs only from `https://storage.googleapis.com/` or `https://firebasestorage.googleapis.com/`, require HTTPS, and return `VARIABLES_UNAVAILABLE` for all untrusted upstream failures.

- [ ] **Step 4: Extend publish client with expected variable drafts**

Change the publish action to:

```ts
type PublishOpeningAction = {
  action: 'publish';
  revision: number;
  experiment: OpeningExperiment;
  expectedVariableDrafts: Record<string, string>;
  changeNote?: string;
};
```

Reject a response that contains an unmasked phone, raw storage object path, provider media ID, Make token, or non-HTTPS preview URL.

- [ ] **Step 5: Run GREEN**

Run the RED command plus `npm test -- --run tests/unit/sales-agent-experiment-client.test.ts tests/integration/sales-agent-experiment-route.test.ts`.

- [ ] **Step 6: Commit Task 4**

Commit message: `feat(sales): proxy typed variables to BusinessOS`

---

### Task 5: Safe Make allowlist, queue controls, and audit

**Files:**
- Modify: `BusinessOS/src/lib/automations/make-client.ts`
- Rewrite: `BusinessOS/src/lib/automations/make-control-handler.ts`
- Modify: `BusinessOS/src/app/api/automations/make/route.ts`
- Modify: `BusinessOS/src/db/schema.ts`
- Create: `BusinessOS/src/lib/automations/make-audit-store.ts`
- Create: `BusinessOS/src/scripts/apply-make-control-schema.ts`
- Modify: `BusinessOS/tests/unit/make-client.test.ts`
- Modify: `BusinessOS/tests/integration/make-control-route.test.ts`
- Create: `BusinessOS/tests/unit/make-audit-store.test.ts`

**Interfaces:**
- `APPROVED_SCENARIOS` maps the three exact IDs to stable Hebrew roles.
- `readMakeControlState()` returns verified allowlisted scenario state plus hook queue summary.
- `changeMakeScenarioState({ scenarioId, action, expectedActive, actor })` compares, preflights, mutates, verifies, and audits.
- `discardMakeQueue({ scenarioId, expectedIds, actor })` deletes only the immediately-read queue IDs and never starts the scenario.

- [ ] **Step 1: Write failing Make client tests**

Cover allowlist filtering, scenario/hook association, queue stats, bounded incoming ID/timestamp parsing without payload content, start/stop response validation, post-action re-read, and queue deletion using exact IDs with `confirmed=true`.

```ts
expect(await listControlledScenarios()).toEqual([
  { id: '9630287', name: 'WT — סוכן מכירות AI · שיחה', role: 'sales_transport', isActive: false, queueCount: 0, oldestQueuedAt: null, newestQueuedAt: null },
]);
```

- [ ] **Step 2: Run client RED, implement, and run client GREEN**

Run RED: `npm test -- --run tests/unit/make-client.test.ts`

Implement `listMakeHooks`, `listMakeIncomingSummaries`, `deleteMakeIncomingIds`, and strict state parsers. Require `scenarios:read/write` and `hooks:read/write`; never log Make response bodies.

Run GREEN with the same command.

- [ ] **Step 3: Write failing handler and audit tests**

Cover auth-before-read, unknown scenario rejection, stale expected state 409, queue-blocked start, experiment/transport preflight-blocked start, stop allowed under degraded health, verified success only, verification failure, audit on success/failure, and two-step queue-discard confirmation.

The audit table is exact:

```ts
export const makeScenarioAudit = businessOsSchema.table('make_scenario_audit', {
  id: uuid('id').primaryKey().defaultRandom(),
  scenarioId: varchar('scenario_id', { length: 32 }).notNull(),
  action: varchar('action', { length: 32 }).notNull(),
  actorEmail: varchar('actor_email', { length: 320 }).notNull(),
  priorActive: boolean('prior_active'),
  verifiedActive: boolean('verified_active'),
  itemCount: integer('item_count'),
  resultCode: varchar('result_code', { length: 80 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
```

- [ ] **Step 4: Implement compare-and-verify handler and schema installer**

POST actions are exact unions:

```ts
{ action: 'start' | 'stop', scenarioId, expectedActive }
{ action: 'discard_queue', scenarioId, expectedIncomingIds, confirmation: `DELETE ${scenarioId} ${expectedIncomingIds.length}` }
```

Return fixed safe errors: `SCENARIO_NOT_ALLOWED`, `SCENARIO_STATE_STALE`, `SCENARIO_QUEUE_NOT_EMPTY`, `TRANSPORT_NOT_READY`, `MAKE_ACTION_FAILED`, and `MAKE_VERIFY_FAILED`.

`apply-make-control-schema.ts` follows the existing transactional schema-script pattern and executes only these idempotent statements:

```sql
create schema if not exists business_os;
create table if not exists business_os.make_scenario_audit (
  id uuid primary key default gen_random_uuid(), scenario_id varchar(32) not null,
  action varchar(32) not null, actor_email varchar(320) not null,
  prior_active boolean, verified_active boolean, item_count integer,
  result_code varchar(80) not null, created_at timestamptz not null default now()
);
create index if not exists make_scenario_audit_scenario_created_index
  on business_os.make_scenario_audit (scenario_id, created_at);
```

- [ ] **Step 5: Run GREEN and schema verification**

Run: `npm test -- --run tests/unit/make-client.test.ts tests/integration/make-control-route.test.ts tests/unit/make-audit-store.test.ts`

Run: `npx tsc --noEmit` to type-check the schema installer. Apply it only during the deployment task with the configured production `DATABASE_URL`; tests must not contact Postgres.

- [ ] **Step 6: Commit Task 5**

Commit message: `feat(make): control verified scenarios from BusinessOS`

---

### Task 6: Route ordered audio and voice notes through Make

**Files:**
- Modify: `BusinessOS/src/lib/automations/make-blueprint-patcher.ts`
- Modify: `BusinessOS/src/lib/automations/make-opening-only-deploy.ts`
- Modify: `BusinessOS/tests/unit/make-blueprint-patcher.test.ts`
- Modify: `BusinessOS/tests/integration/make-opening-only-deploy-route.test.ts`
- Modify: `wedding-book/src/app/api/sales-agent/reply/route.js`
- Modify: `wedding-book/tests/salesReplyRoute.test.js`

**Interfaces:**
- Wedding reply exposes `openingMedia{1..3}Kind`, `Id`, `Url`, `Caption`, and `VoiceNote` for every media slot.
- Make blueprint routes each slot independently to image, video, or audio and includes `audio.voice` only for audio.

- [ ] **Step 1: Write failing Wedding serialization test**

```js
expect(result.body).toMatchObject({
    openingMedia1Kind: 'audio',
    openingMedia1Url: 'https://storage.test/voice.ogg',
    openingMedia1VoiceNote: true,
})
```

Run RED: `npx vitest run tests/salesReplyRoute.test.js`

- [ ] **Step 2: Implement the minimal Wedding selector and run GREEN**

Add `VoiceNote` beside the existing media slot fields and cache it in the durable outcome. Run the same test plus `tests/salesInboundEvents.test.js`.

- [ ] **Step 3: Write failing Make blueprint tests**

Require three branches per slot with canonical filters and exact audio mapper:

```ts
expect(audioSend.mapper).toMatchObject({
  type: 'audio',
  audio: { link: '{{3.data.openingMedia1Url}}', voice: '{{3.data.openingMedia1VoiceNote}}' },
});
expect(JSON.stringify(audioRoute)).toContain('openingMedia1Id');
```

Also prove idempotent re-patching, no dangling module IDs, exact callback IDs, failure callbacks, and preservation of opaque Make connection references.

- [ ] **Step 4: Run RED, implement audio blueprint branches, and run GREEN**

Run: `npm test -- --run tests/unit/make-blueprint-patcher.test.ts tests/integration/make-opening-only-deploy-route.test.ts`

`patchOpeningOnlyMediaBlueprint` must recognize an already-patched audio graph and remain idempotent. Deployment keeps the scenario stopped and verifies the patched live blueprint hash before returning success.

- [ ] **Step 5: Commit Task 6 in both repositories**

Wedding commit: `feat(sales): expose ordered voice-note parts`

BusinessOS commit: `feat(make): route opening audio safely`

---

### Task 7: BusinessOS variable library and unified sales control room

**Files:**
- Create: `BusinessOS/src/components/sales-agent/variable-library.tsx`
- Create: `BusinessOS/src/components/sales-agent/variable-editor.tsx`
- Create: `BusinessOS/src/components/sales-agent/variable-upload.tsx`
- Create: `BusinessOS/src/components/sales-agent/make-transport-panel.tsx`
- Modify: `BusinessOS/src/components/sales-agent/opening-flow-editor.tsx`
- Modify: `BusinessOS/src/components/sales-agent/sales-agent-control-center.tsx`
- Modify: `BusinessOS/src/app/(protected)/sales-agent/page.tsx`
- Modify: `BusinessOS/src/app/globals.css`
- Create: `BusinessOS/tests/components/variable-library.test.tsx`
- Create: `BusinessOS/tests/components/variable-upload.test.tsx`
- Create: `BusinessOS/tests/components/make-transport-panel.test.tsx`
- Modify: `BusinessOS/tests/components/sales-agent-control-center.test.tsx`

**Interfaces:**
- `SalesAgentControlCenter` receives initial experiment, variables, and Make control state.
- Upload component performs `prepare → direct PUT → finalize`, reports progress, and never stores signed URLs in React state after finalize.
- Flow editor chooses from the one shared registry and filters variables by block-compatible kind.

- [ ] **Step 1: Write failing component tests**

Cover text/image/video/audio rows, voice-note toggle, replace-as-draft, progress/error/retry, shared selection from A and B without duplication, incompatible-kind filtering, resolved preview, missing-variable publish block, dirty state, and 44px accessible controls.

```tsx
fireEvent.click(screen.getByRole('button', { name: 'הוסף הודעה קולית' }));
fireEvent.change(screen.getByLabelText('משתנה לבלוק A 2'), { target: { value: 'voice_intro' } });
expect(screen.getByText('טיוטה — תיכנס רק לאחר פרסום')).toBeInTheDocument();
expect(screen.getByRole('button', { name: 'פרסם גרסה' })).toBeEnabled();
```

- [ ] **Step 2: Run component RED**

Run: `npm test -- --run tests/components/variable-library.test.tsx tests/components/variable-upload.test.tsx tests/components/make-transport-panel.test.tsx tests/components/sales-agent-control-center.test.tsx`

- [ ] **Step 3: Implement the visual system before wiring mutations**

Use the approved control-room tokens already present in `globals.css`: Night `#0a0f16`, Raised `#101924`, Moon `#f5f8fb`, Fog `#a8b6c7`, Mint `#6ee7ba`, Amber `#f8c35c`, Violet `#a79bff`. Keep the three A/B/C lanes as the signature. Add a quiet shared asset tray and a compact verified transport rail; do not introduce a new font or generic card dashboard.

The 320px structure is:

```text
[Transport status + emergency stop]
[Tabs scroll: Experiment | Journeys | Variables | Leads | Approvals | History]
[Selected panel]
[Sticky draft/publish bar]
```

- [ ] **Step 4: Wire upload, variable editing, publish preflight, and Make controls**

The direct upload sequence is:

```ts
const prepared = await prepareVariableUpload(meta);
await fetch(prepared.uploadUrl, { method: 'PUT', headers: prepared.headers, body: file });
await finalizeVariableUpload({ uploadId: prepared.uploadId });
```

Show scenario start only after a fresh state read. Require the user-facing queue confirmation for destructive discard. Stop remains one click plus an immediate confirmation dialog and is never hidden by health failures.

- [ ] **Step 5: Run GREEN and accessibility checks**

Run the component RED command. Then run:

`npm test -- --run tests/components/opening-flow-editor.test.tsx tests/components/opening-experiment-dashboard.test.tsx tests/integration/sales-agent-experiment-route.test.ts tests/integration/make-control-route.test.ts`

Confirm every input/control has an accessible name, tab panels are focusable, keyboard reorder remains available, progress is announced with `role="status"`, errors use `role="alert"`, and reduced motion disables spinners/transitions.

- [ ] **Step 6: Commit Task 7**

Commit message: `feat(sales): operate WhatsApp transport and variables`

---

### Task 8: Full verification, deployment, and controlled activation

**Files:**
- Modify only files required by failures introduced by Tasks 1–7.
- Record release evidence in `wedding-book/.superpowers/sdd/2026-08-24-businessos-make-variable-control-release.md`.

**Interfaces:**
- Both repositories finish with committed work, synchronized indexes, and no unrelated diff.
- Live activation is performed only after deployed read-only state, blueprint, experiment, asset, and queue checks pass.

- [ ] **Step 1: Run Wedding Tales focused and full verification**

Run:

```powershell
npx vitest run tests/salesVariables.test.js tests/salesVariableStore.test.js tests/salesVariableRoutes.test.js tests/salesVariableUpload.test.js tests/salesOpeningVariablesRuntime.test.js tests/salesOpeningExperimentRoute.test.js tests/salesReplyRoute.test.js tests/salesDeliveryFirestore.test.js
npm test -- --run
npm run lint
npm run build
git diff --check
```

- [ ] **Step 2: Run BusinessOS focused and full verification**

Run:

```powershell
npm test -- --run tests/unit/sales-agent-variable-client.test.ts tests/integration/sales-agent-variables-route.test.ts tests/integration/sales-agent-variable-upload-route.test.ts tests/unit/make-client.test.ts tests/integration/make-control-route.test.ts tests/components/variable-library.test.tsx tests/components/variable-upload.test.tsx tests/components/make-transport-panel.test.tsx tests/components/sales-agent-control-center.test.tsx
npm test -- --run
npm run lint
npx tsc --noEmit
npm run build
git diff --check
```

- [ ] **Step 3: Review the UI at 320px, 768px, and desktop**

Use the in-app browser against local BusinessOS fixture data. Verify RTL order, no horizontal overflow, media previews, upload progress, variable selection, exact resolved publish preview, focus visibility, reduced motion, and the emergency stop.

- [ ] **Step 4: Deploy Wedding Tales, then BusinessOS**

Deploy only verified commits to their existing Vercel projects. Confirm `/api/sales-agent/variables`, `/api/sales-agent/experiment`, and `/api/automations/make` return authenticated safe shapes. Never print environment values.

- [ ] **Step 5: Patch and verify Make while stopped**

Read scenario `9630287` state, require inactive, deploy the audio-capable blueprint through the authenticated BusinessOS endpoint, re-read the live blueprint, and prove the expected text/image/video/audio selectors and callbacks are present. Leave it inactive if verification is not exact.

- [ ] **Step 6: Exercise the release preflight with a non-customer asset**

Upload one owner-controlled test audio file, finalize it, preview it, bind it in a disabled test variant, publish, and verify the prior revision remains restorable. Do not enroll a historical lead.

- [ ] **Step 7: Inspect and resolve webhook queue truth**

Read the queue count and timestamp range from BusinessOS. If it is non-zero, do not activate. Present the exact count for the already-designed explicit discard confirmation; delete only the confirmed IDs, verify zero, and leave activation as the next distinct action.

- [ ] **Step 8: Activate only the primary sales scenario and verify**

Start `9630287` from BusinessOS with `expectedActive: false`, then re-read Make and require `isActive: true`. Do not automatically start `9282383` or `9370425`; expose their controls for the owner and start them only if the verified transport topology proves they are independently required.

- [ ] **Step 9: Run one owner-recipient delivery smoke**

Use only the configured owner-controlled test recipient. Require provider acceptance and then delivered/read callback identity before marking the smoke successful. On any failure, stop `9630287`, preserve the published revision and audit, and report the fixed safe code.

- [ ] **Step 10: Record evidence and commit release fixes**

Record exact test counts, build results, deployed commit IDs, scenario states, queue count, blueprint verification, and delivery outcome without customer content or tokens.

Commit message if fixes were required: `fix(sales): harden typed variable release`
