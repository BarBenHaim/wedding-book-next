import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ verifyIdToken: vi.fn(), isSuperAdmin: vi.fn(), db: { collection: vi.fn(), runTransaction: vi.fn() } }))
vi.mock('@/lib/firebaseAdmin', () => ({ adminAuth: { verifyIdToken: mocks.verifyIdToken }, adminDb: mocks.db }))
vi.mock('@/lib/superAdmin', () => ({ isSuperAdmin: mocks.isSuperAdmin }))

import { GET, POST } from '@/app/api/sales-agent/offers/route'
import { MAX_CATALOG_OFFERS, MAX_OFFER_PUBLISH_BYTES, publishOfferCatalog } from '@/lib/salesAgent/offerApprovalStore'
import { readActiveOfferCatalog } from '@/lib/salesAgent/offerStore'

const NOW = Date.parse('2026-10-05T12:00:00Z')
const CURRENT = 'sales_offer_catalog/current'
const policy = () => ({ version: 'synthetic-policy-v1', summary: 'Synthetic terms only', url: 'https://weddingtales.co.il/synthetic-policy' })
function offer(overrides = {}) {
    return {
        schemaVersion: 1, offerId: 'synthetic-printed', version: 'synthetic-offer-v1', productId: 'printed', name: 'Synthetic printed offer',
        validFrom: '2026-10-01T00:00:00Z', validUntil: '2026-11-01T00:00:00Z',
        price: { currency: 'ILS', totalMinor: 12345, subtotalMinor: 12000, tax: { amountMinor: 200, summary: 'Synthetic tax' }, shipping: { amountMinor: 145, summary: 'Synthetic shipping', destinationCountry: 'IL' }, additionalCharges: [] },
        scope: { includes: ['Synthetic inclusion'], excludes: ['Synthetic exclusion'], bookType: 'Synthetic type', copies: 1, dimensions: 'Synthetic dimensions', pageLimit: null, blessingLimit: null, photoLimit: null, accessPeriod: 'Synthetic access' },
        process: { design: 'Synthetic design', editing: 'Synthetic editing', approval: 'Synthetic approval', humanAssistance: 'Synthetic assistance' },
        timing: { production: 'Synthetic production', delivery: 'Synthetic delivery', startsFrom: 'Synthetic trigger' },
        policies: { service: policy(), dateChange: policy(), cancellation: policy(), refunds: policy() },
        checkoutUrl: 'https://weddingtales.co.il/checkout/?add-to-cart=6271', upgradeOfferId: null, additionalCopyOfferId: null,
        ...overrides,
    }
}
const catalog = (overrides = {}) => ({ schemaVersion: 1, catalogId: 'synthetic-catalog', version: 'synthetic-v1', offers: [offer()], ...overrides })
const publish = (overrides = {}) => ({ action: 'publish', expectedVersion: null, evidenceRef: 'synthetic-owner-approval-reference', catalog: catalog(), ...overrides })
const request = (method = 'GET', body, headers = {}) => new Request('https://app.example.test/api/sales-agent/offers', {
    method, headers: { authorization: 'Bearer synthetic-id-token', 'content-type': 'application/json', ...headers },
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
})
let records, commits, read, serial
const copy = value => structuredClone(value)
function mockDatabase() {
    records = new Map(); commits = []; serial = Promise.resolve()
    read = vi.fn(async ref => ({ exists: records.has(ref.path), data: () => copy(records.get(ref.path)) }))
    const refFor = path => ({ path, get() { return read(this) }, collection: name => ({ doc: id => refFor(`${path}/${name}/${id}`) }) })
    mocks.db.collection.mockImplementation(name => ({ doc: id => refFor(`${name}/${id}`) }))
    // Serialise transactions like successful Firestore compare-and-swap retries.
    // Writes are staged so a failed transaction never partially changes history.
    mocks.db.runTransaction.mockImplementation(callback => {
        const run = serial.then(async () => {
            const pending = []
            const result = await callback({
                get: read,
                create: (ref, value) => { if (records.has(ref.path)) throw new Error('immutable_history'); pending.push(['create', ref.path, copy(value)]) },
                set: (ref, value) => pending.push(['set', ref.path, copy(value)]),
            })
            for (const [, path, value] of pending) records.set(path, value)
            commits.push(pending)
            return result
        })
        serial = run.catch(() => {})
        return run
    })
}

beforeEach(() => {
    vi.clearAllMocks(); vi.useFakeTimers(); vi.setSystemTime(NOW); mockDatabase()
    mocks.verifyIdToken.mockResolvedValue({ uid: 'synthetic-owner-uid', email: 'owner@example.test', email_verified: true })
    mocks.isSuperAdmin.mockReturnValue(true)
})
afterEach(() => vi.useRealTimers())

describe('offer catalog approval authentication boundary', () => {
    it.each(['GET', 'POST'])('rejects anonymous/shared-secret-only %s before touching storage', async method => {
        const response = await (method === 'GET' ? GET : POST)(request(method, method === 'POST' ? publish() : undefined, { authorization: '', 'x-wt-secret': 'synthetic-secret' }))
        expect(response.status).toBe(401)
        expect(mocks.verifyIdToken).not.toHaveBeenCalled()
        expect(mocks.db.collection).not.toHaveBeenCalled()
    })
    it.each(['GET', 'POST'])('checks revoked tokens for %s', async method => {
        mocks.verifyIdToken.mockRejectedValue(new Error('private-auth-error'))
        const response = await (method === 'GET' ? GET : POST)(request(method, method === 'POST' ? publish() : undefined))
        expect(response.status).toBe(401)
        expect(mocks.verifyIdToken).toHaveBeenCalledWith('synthetic-id-token', true)
        expect(JSON.stringify(await response.json())).not.toContain('private-auth-error')
        expect(read).not.toHaveBeenCalled()
    })
    it.each([false, undefined, 'true'])('rejects an unverified email (%s)', async email_verified => {
        mocks.verifyIdToken.mockResolvedValue({ uid: 'synthetic-owner-uid', email: 'owner@example.test', email_verified })
        expect((await POST(request('POST', publish()))).status).toBe(403)
        expect(read).not.toHaveBeenCalled()
        expect(mocks.db.runTransaction).not.toHaveBeenCalled()
    })
    it('rejects a verified non-super-admin and missing UID', async () => {
        mocks.isSuperAdmin.mockReturnValue(false)
        expect((await GET(request())).status).toBe(403)
        mocks.verifyIdToken.mockResolvedValue({ email: 'owner@example.test', email_verified: true })
        expect((await POST(request('POST', publish()))).status).toBe(401)
        expect(read).not.toHaveBeenCalled()
    })
    it('rejects oversized bearer tokens before verification', async () => {
        expect((await GET(request('GET', undefined, { authorization: `Bearer ${'x'.repeat(16_385)}` }))).status).toBe(401)
        expect(mocks.verifyIdToken).not.toHaveBeenCalled()
    })
})

describe('read-only catalog approval status', () => {
    it('returns missing status without seeding facts or an approval', async () => {
        const response = await GET(request())
        expect(response.status).toBe(200)
        expect(await response.json()).toEqual({ ok: true, currentVersion: null, catalog: null, validation: { ok: false, reason: 'catalog_missing' } })
        expect(response.headers.get('cache-control')).toBe('private, no-store')
        expect(response.headers.get('vary')).toBe('Authorization')
        expect(mocks.db.runTransaction).not.toHaveBeenCalled()
        expect(records.size).toBe(0)
    })
    it('returns the published catalog and time-sensitive validation status without refreshing approval', async () => {
        await POST(request('POST', publish()))
        const stored = copy(records.get(CURRENT))
        expect(await (await GET(request())).json()).toMatchObject({ currentVersion: 'synthetic-v1', catalog: stored, validation: { ok: true } })
        vi.setSystemTime(Date.parse('2026-11-02T00:00:00Z'))
        expect(await (await GET(request())).json()).toMatchObject({ catalog: stored, validation: { ok: false, reason: 'catalog_invalid' } })
        expect(records.get(CURRENT)).toEqual(stored)
        expect(commits).toHaveLength(1)
    })
    it.each([
        row => { row.privateToken = 'synthetic-private-secret' },
        row => { row.offers[0].price.totalMinor = { token: 'synthetic-private-secret' } },
        row => { row.offers[0].policies.refunds.privateToken = 'synthetic-private-secret' },
    ])('withholds structurally unsafe stored documents and never leaks arbitrary metadata', async corrupt => {
        await POST(request('POST', publish()))
        corrupt(records.get(CURRENT))
        const body = await (await GET(request())).json()
        expect(body).toMatchObject({ currentVersion: 'synthetic-v1', catalog: null, validation: { ok: false, reason: 'catalog_shape_invalid' } })
        expect(JSON.stringify(body)).not.toContain('synthetic-private-secret')
        expect(commits).toHaveLength(1)
    })
    it('returns a fixed error on storage failure without exposing internal errors', async () => {
        read.mockRejectedValue(new Error('synthetic-private-database-detail'))
        const response = await GET(request())
        expect(response.status).toBe(503)
        expect(await response.json()).toEqual({ error: 'OFFERS_UNAVAILABLE' })
    })
})

describe('explicit catalog publishing', () => {
    it('stamps owner identity/time/version and atomically creates immutable history plus current', async () => {
        const input = publish()
        const response = await POST(request('POST', input)), body = await response.json()
        expect(response.status).toBe(201)
        expect(body.validation).toEqual({ ok: true, reason: null })
        const approval = { status: 'approved', approvedBy: 'synthetic-owner-uid', approvedAt: '2026-10-05T12:00:00.000Z', evidenceRef: input.evidenceRef, catalogVersion: 'synthetic-v1' }
        expect(body.catalog.approval).toEqual(approval)
        expect(body.catalog.offers[0].approval).toEqual({ ...approval, offerVersion: 'synthetic-offer-v1' })
        expect(body.catalog.offers[0].price).toEqual(input.catalog.offers[0].price)
        expect(body.catalog.offers[0].free).toBeUndefined()
        expect(body.catalog.offers[0].coupon).toBeUndefined()
        expect(input.catalog.approval).toBeUndefined()
        expect(commits[0].map(([method, path]) => [method, path])).toEqual([['create', `${CURRENT}/versions/synthetic-v1`], ['set', CURRENT]])
        expect(records.get(`${CURRENT}/versions/synthetic-v1`)).toEqual(records.get(CURRENT))
        expect(await readActiveOfferCatalog({ db: mocks.db, nowMs: NOW })).toMatchObject({ ok: true, catalog: body.catalog })
    })
    it('approves complete explicitly supplied coupon/free terms without fabricating other facts', async () => {
        const candidate = offer({ coupon: { code: 'SYNTHETIC', eligibility: 'Synthetic entitlement', expiresAt: '2026-10-20T00:00:00Z' }, free: { scope: 'Synthetic free scope', limitations: 'Synthetic limits', paidScope: 'Synthetic paid scope', startUrl: 'https://app.weddingtales.co.il/synthetic-start', termsUrl: 'https://weddingtales.co.il/synthetic-terms' } })
        const response = await POST(request('POST', publish({ catalog: catalog({ offers: [candidate] }) })))
        expect(response.status).toBe(201)
        const stored = (await response.json()).catalog.offers[0]
        expect(stored.coupon.approval).toMatchObject({ approvedBy: 'synthetic-owner-uid', catalogVersion: 'synthetic-v1', offerVersion: 'synthetic-offer-v1' })
        expect(stored.free).toEqual(candidate.free)
    })
    it('allows an explicitly published empty catalog without creating commercial facts', async () => {
        const response = await POST(request('POST', publish({ catalog: catalog({ offers: [] }) })))
        expect(response.status).toBe(201)
        expect(await response.json()).toMatchObject({ validation: { ok: true, reason: 'no_active_offers' }, catalog: { offers: [] } })
    })
    it.each([undefined, 'save', 'draft', 'approve', 'rollback'])('rejects action %s without mutation', async action => {
        const response = await POST(request('POST', publish({ action })))
        expect(response.status).toBe(400)
        expect(await response.json()).toEqual({ error: 'EXPLICIT_PUBLISH_REQUIRED' })
        expect(mocks.db.runTransaction).not.toHaveBeenCalled()
    })
    it.each([undefined, '', ' ', 'x'.repeat(513)])('requires bounded explicit evidence', async evidenceRef => {
        expect((await POST(request('POST', publish({ evidenceRef })))).status).toBe(400)
        expect(mocks.db.runTransaction).not.toHaveBeenCalled()
    })
    it.each([undefined, '', 1, '../invalid'])('requires an explicit null or safe expected version', async expectedVersion => {
        expect((await POST(request('POST', publish({ expectedVersion })))).status).toBe(400)
        expect(mocks.db.runTransaction).not.toHaveBeenCalled()
    })
    it.each([
        input => { input.approvedBy = 'forged' },
        input => { input.catalog.approval = { status: 'approved', approvedBy: 'forged' } },
        input => { input.catalog.offers[0].approval = { approvedAt: '2000-01-01T00:00:00Z' } },
        input => { input.catalog.offers[0].coupon = { code: 'X', eligibility: 'X', expiresAt: '2026-11-01T00:00:00Z', approval: { approvedBy: 'forged' } } },
    ])('rejects client-written approval metadata instead of trusting or silently replacing it', async mutate => {
        const input = publish(); mutate(input)
        expect((await POST(request('POST', input))).status).toBe(400)
        expect(mocks.db.runTransaction).not.toHaveBeenCalled()
    })
})

describe('complete owner-authored catalog validation', () => {
    it.each(['schemaVersion', 'offerId', 'version', 'productId', 'name', 'validFrom', 'validUntil', 'price', 'scope', 'process', 'timing', 'policies', 'checkoutUrl', 'upgradeOfferId', 'additionalCopyOfferId'])('rejects a missing required offer field: %s', async key => {
        const input = publish(); delete input.catalog.offers[0][key]
        expect((await POST(request('POST', input))).status).toBe(400)
        expect(mocks.db.runTransaction).not.toHaveBeenCalled()
    })
    it.each([
        ['unknown catalog field', input => { input.catalog.discount = 1 }],
        ['unknown product', input => { input.catalog.offers[0].productId = 'unapproved-premium' }],
        ['unknown offer field', input => { input.catalog.offers[0].inventory = 1 }],
        ['unknown nested price field', input => { input.catalog.offers[0].price.discount = 1 }],
        ['unknown nested tax field', input => { input.catalog.offers[0].price.tax.rate = 17 }],
        ['unknown nested shipping field', input => { input.catalog.offers[0].price.shipping.express = true }],
        ['unknown policy field', input => { input.catalog.offers[0].policies.refunds.unconditional = true }],
        ['wrong amount sum', input => { input.catalog.offers[0].price.totalMinor = 12346 }],
        ['non-integer amount', input => { input.catalog.offers[0].price.totalMinor = 1.5 }],
        ['unsafe integer amount', input => { input.catalog.offers[0].price.totalMinor = Number.MAX_SAFE_INTEGER + 1 }],
        ['wrong currency', input => { input.catalog.offers[0].price.currency = 'USD' }],
        ['negative amount', input => { input.catalog.offers[0].price.tax.amountMinor = -1 }],
        ['missing shipping country', input => { delete input.catalog.offers[0].price.shipping.destinationCountry }],
        ['missing inclusion', input => { input.catalog.offers[0].scope.includes = [] }],
        ['not yet active', input => { input.catalog.offers[0].validFrom = '2026-10-06T00:00:00Z' }],
        ['expired offer', input => { input.catalog.offers[0].validUntil = '2026-10-05T12:00:00Z' }],
        ['unapproved free scope', input => { input.catalog.offers[0].free = { scope: 'free' } }],
        ['expired coupon', input => { input.catalog.offers[0].coupon = { code: 'X', eligibility: 'X', expiresAt: '2026-10-01T00:00:00Z' } }],
        ['duplicate ID', input => { input.catalog.offers.push(offer()) }],
        ['ambiguous selection', input => { input.catalog.offers.push(offer({ offerId: 'second-synthetic' })) }],
        ['unresolved upgrade', input => { input.catalog.offers[0].upgradeOfferId = 'unknown-offer' }],
        ['self additional copy', input => { input.catalog.offers[0].additionalCopyOfferId = 'synthetic-printed' }],
        ['too many offers', input => { input.catalog.offers = Array.from({ length: MAX_CATALOG_OFFERS + 1 }, () => offer()) }],
        ['oversize name', input => { input.catalog.offers[0].name = 'x'.repeat(201) }],
        ['oversize prose', input => { input.catalog.offers[0].process.design = 'x'.repeat(1001) }],
        ['control characters', input => { input.catalog.offers[0].name = 'unsafe\u0000value' }],
        ['oversize single offer', input => { for (const key of ['design', 'editing', 'approval', 'humanAssistance']) input.catalog.offers[0].process[key] = 'x'.repeat(1000); input.catalog.offers[0].scope.includes = ['x'.repeat(1000), 'x'.repeat(1000)] }],
    ])('rejects %s before any transaction', async (_name, mutate) => {
        const input = publish(); mutate(input)
        const response = await POST(request('POST', input))
        expect([400, 413]).toContain(response.status)
        expect(mocks.db.runTransaction).not.toHaveBeenCalled()
        expect(records.size).toBe(0)
    })
    it.each([
        'https://attacker.example.test/policy',
        'http://weddingtales.co.il/policy',
        'https://user:pass@weddingtales.co.il/policy',
        'https://weddingtales.co.il/policy#fragment',
        'https://weddingtales.co.il/redirect?url=https://attacker.example.test',
        'https://weddingtales.co.il/policy%0aunsafe',
        'https://weddingtales.co.il/po\nlicy',
    ])('rejects unsafe policy/free URLs: %s', async url => {
        const input = publish(); input.catalog.offers[0].policies.refunds.url = url
        expect((await POST(request('POST', input))).status).toBe(400)
        expect(mocks.db.runTransaction).not.toHaveBeenCalled()
    })
    it.each(['https://weddingtales.co.il/checkout/?add-to-cart=6258', 'https://attacker.example.test/checkout/?add-to-cart=6271', 'https://weddingtales.co.il/checkout/?add-to-cart=6271&coupon=FORGED'])('rejects unsafe or mismatched checkout links: %s', async url => {
        const input = publish(); input.catalog.offers[0].checkoutUrl = url
        expect((await POST(request('POST', input))).status).toBe(400)
        expect(mocks.db.runTransaction).not.toHaveBeenCalled()
    })
    it('rejects unknown JSON prototype fields without echoing their values', async () => {
        const input = publish(); input.catalog = JSON.parse(JSON.stringify(input.catalog).replace('"schemaVersion":1', '"schemaVersion":1,"__proto__":{"secret":"synthetic-private-marker"}'))
        const body = await (await POST(request('POST', input))).json()
        expect(body.error).toBe('INVALID_OFFER_CATALOG')
        expect(JSON.stringify(body)).not.toContain('synthetic-private-marker')
        expect(mocks.db.runTransaction).not.toHaveBeenCalled()
    })
})

describe('publish concurrency and immutable history', () => {
    it('requires the exact current version and preserves earlier history unchanged', async () => {
        await POST(request('POST', publish()))
        const initial = copy(records.get(`${CURRENT}/versions/synthetic-v1`))
        const stale = await POST(request('POST', publish({ catalog: catalog({ version: 'synthetic-v2' }) })))
        expect(stale.status).toBe(409)
        expect(await stale.json()).toEqual({ error: 'STALE_CATALOG_VERSION' })
        const next = await POST(request('POST', publish({ expectedVersion: 'synthetic-v1', catalog: catalog({ version: 'synthetic-v2' }) })))
        expect(next.status).toBe(201)
        expect(records.get(CURRENT).version).toBe('synthetic-v2')
        expect(records.get(`${CURRENT}/versions/synthetic-v1`)).toEqual(initial)
        expect(records.get(`${CURRENT}/versions/synthetic-v2`)).toEqual(records.get(CURRENT))
        expect(commits).toHaveLength(2)
    })
    it('rejects reused/current versions and rollback to an earlier published version', async () => {
        await POST(request('POST', publish()))
        const same = await POST(request('POST', publish({ expectedVersion: 'synthetic-v1' })))
        expect(same.status).toBe(409)
        expect(await same.json()).toEqual({ error: 'CATALOG_VERSION_EXISTS' })
        await POST(request('POST', publish({ expectedVersion: 'synthetic-v1', catalog: catalog({ version: 'synthetic-v2' }) })))
        const rollback = await POST(request('POST', publish({ expectedVersion: 'synthetic-v2' })))
        expect(rollback.status).toBe(409)
        expect(await rollback.json()).toEqual({ error: 'CATALOG_VERSION_EXISTS' })
        expect(records.get(CURRENT).version).toBe('synthetic-v2')
        expect(commits).toHaveLength(2)
    })
    it('allows only one of two concurrent publishes with the same expected version', async () => {
        const responses = await Promise.all(['synthetic-v1', 'synthetic-v2'].map(version => POST(request('POST', publish({ catalog: catalog({ version }) })))))
        expect(responses.map(response => response.status).sort()).toEqual([201, 409])
        expect(commits).toHaveLength(1)
        expect(records.size).toBe(2)
    })
    it('rejects catalog identity changes and a corrupt missing current version', async () => {
        await POST(request('POST', publish()))
        const changed = await POST(request('POST', publish({ expectedVersion: 'synthetic-v1', catalog: catalog({ catalogId: 'different-catalog', version: 'synthetic-v2' }) })))
        expect(changed.status).toBe(409)
        expect(await changed.json()).toEqual({ error: 'CATALOG_IDENTITY_MISMATCH' })
        records.set(CURRENT, { catalogId: 'synthetic-catalog' })
        const corrupt = await POST(request('POST', publish()))
        expect(corrupt.status).toBe(409)
        expect(await corrupt.json()).toEqual({ error: 'CURRENT_CATALOG_INVALID' })
        expect(commits).toHaveLength(1)
    })
    it('does not claim success or leak details on an aborted transaction', async () => {
        mocks.db.runTransaction.mockRejectedValue(new Error('synthetic-private-storage-detail'))
        const response = await POST(request('POST', publish()))
        expect(response.status).toBe(503)
        expect(await response.json()).toEqual({ error: 'OFFERS_UNAVAILABLE' })
        expect(records.size).toBe(0)
    })
    it('does not permit the store boundary to invent an approving identity', async () => {
        await expect(publishOfferCatalog(publish(), { db: mocks.db, nowMs: NOW })).rejects.toMatchObject({ code: 'APPROVAL_IDENTITY_REQUIRED', status: 403 })
        expect(mocks.db.runTransaction).not.toHaveBeenCalled()
    })
})

describe('bounded request parsing', () => {
    it.each(['{invalid', '', 'null', '[]', '"text"'])('rejects malformed/nonobject JSON: %s', async body => {
        expect((await POST(request('POST', body))).status).toBe(400)
        expect(mocks.db.runTransaction).not.toHaveBeenCalled()
    })
    it('rejects payloads over the UTF-8 byte limit even if their character count is smaller', async () => {
        const response = await POST(request('POST', JSON.stringify({ padding: 'א'.repeat(MAX_OFFER_PUBLISH_BYTES / 2) })))
        expect(response.status).toBe(413)
        expect(await response.json()).toEqual({ error: 'REQUEST_TOO_LARGE' })
        expect(mocks.db.runTransaction).not.toHaveBeenCalled()
    })
    it('rejects an oversized declared length without reading the request body', async () => {
        const response = await POST(request('POST', publish(), { 'content-length': String(MAX_OFFER_PUBLISH_BYTES + 1) }))
        expect(response.status).toBe(413)
        expect(mocks.db.runTransaction).not.toHaveBeenCalled()
    })
})
