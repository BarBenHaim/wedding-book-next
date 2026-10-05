import { describe, it, expect, vi } from 'vitest'
import { PACKAGES } from '@/lib/salesAgent/catalog'
import { validateOffer, validateOfferCatalog, getActiveOffer, createOfferSnapshot, compareOfferSnapshots, trustedCheckoutUrl, formatOfferQuote, OBSERVED_BASE_PRICES } from '@/lib/salesAgent/offerCatalog'
import { readActiveOfferCatalog } from '@/lib/salesAgent/offerStore'
import { prepareCheckout } from '@/lib/salesAgent/checkoutContract'
import { buildSystemPrompt, buildFollowUpPrompt } from '@/lib/salesAgent/prompt'

const NOW = Date.parse('2026-10-05T12:00:00Z')
const approval = extra => ({ status: 'approved', approvedBy: 'synthetic-approver', evidenceRef: 'test-fixture-only', approvedAt: '2026-10-04T12:00:00Z', ...extra })
const policy = () => ({ version: 'test-policy-v1', summary: 'Synthetic policy summary', url: 'https://weddingtales.co.il/test-policy' })
function offer(overrides = {}) {
    return {
        schemaVersion: 1, offerId: 'synthetic-printed', version: 'test-v1', productId: 'printed', name: 'חבילה מודפסת לבדיקה',
        approval: approval({ offerVersion: 'test-v1' }), validFrom: '2026-10-01T00:00:00Z', validUntil: '2026-11-01T00:00:00Z',
        price: { currency: 'ILS', totalMinor: 99000, subtotalMinor: 99000, tax: { amountMinor: 0, summary: 'Synthetic tax summary' }, shipping: { amountMinor: 0, summary: 'Synthetic shipping summary', destinationCountry: 'IL' }, additionalCharges: [] },
        scope: { includes: ['Synthetic included item'], excludes: ['Synthetic excluded item'], bookType: 'printed', copies: 1, dimensions: '21x21 cm', pageLimit: 'Synthetic limit', blessingLimit: null, photoLimit: null, accessPeriod: 'Synthetic access period' },
        process: { design: 'Synthetic design', editing: 'Synthetic editing', approval: 'Synthetic approval', humanAssistance: 'Synthetic support' },
        timing: { production: 'Synthetic production', delivery: 'Synthetic delivery', startsFrom: 'Synthetic trigger' },
        policies: { service: policy(), dateChange: policy(), cancellation: policy(), refunds: policy() },
        checkoutUrl: 'https://weddingtales.co.il/checkout/?add-to-cart=6271', upgradeOfferId: null, additionalCopyOfferId: null,
        ...overrides,
    }
}
const catalog = (offers = [offer()]) => ({ schemaVersion: 1, catalogId: 'synthetic-catalog', version: 'test-v1', approval: approval({ catalogVersion: 'test-v1' }), offers })
const quote = o => ({ verified: true, checkoutId: 'synthetic-checkout', verificationRef: 'synthetic-checkout-source', verifiedAt: '2026-10-05T12:00:00Z', url: o.checkoutUrl, offerId: o.offerId, offerVersion: o.version, productId: o.productId, currency: o.price.currency, totalMinor: o.price.totalMinor, taxMinor: o.price.tax.amountMinor, shippingMinor: o.price.shipping.amountMinor })
const validate = o => validateOffer(o, { nowMs: NOW })

describe('approved commercial contracts', () => {
    it('keeps observed base amounts unchanged but does not promote the historical catalog to approval', () => {
        expect(OBSERVED_BASE_PRICES).toEqual({ digital: 690, printed: 990 })
        expect(PACKAGES.map(p => p.price)).toEqual([690, 990])
        expect(validateOfferCatalog({ offers: PACKAGES }, { nowMs: NOW }).ok).toBe(false)
        expect(createOfferSnapshot(PACKAGES[0], { nowMs: NOW })).toBeNull()
    })
    it('accepts only a complete explicitly approved offer', () => {
        expect(validate(offer())).toEqual({ ok: true, errors: [] })
        for (const field of ['approval', 'validUntil', 'price', 'scope', 'process', 'timing', 'policies', 'checkoutUrl', 'upgradeOfferId', 'additionalCopyOfferId']) {
            const candidate = offer(); delete candidate[field]
            expect(validate(candidate).ok, field).toBe(false)
        }
    })
    it('rejects missing, revoked, future, and mismatched-version approvals', () => {
        for (const a of [null, approval({ revokedAt: '2026-10-05T01:00:00Z' }), approval({ approvedAt: '2026-12-01T01:00:00Z' }), approval({ offerVersion: 'other' })]) expect(validate(offer({ approval: a })).ok).toBe(false)
    })
    it('rejects inactive or malformed validity windows including their end boundary', () => {
        for (const validUntil of ['2026-10-05T12:00:00Z', 'invalid', '2026-09-01T00:00:00Z']) expect(validate(offer({ validUntil })).ok).toBe(false)
        expect(validate(offer({ validFrom: '2026-10-06T00:00:00Z' })).ok).toBe(false)
    })
    it('requires complete integer monetary breakdown and approved currency', () => {
        for (const patch of [{ totalMinor: 990.5 }, { totalMinor: -1 }, { totalMinor: 0 }, { currency: 'JPY' }, { tax: null }, { shipping: null }, { additionalCharges: [{ name: 'Unknown fee' }] }]) {
            expect(validate(offer({ price: { ...offer().price, ...patch } })).ok).toBe(false)
        }
    })
    it('rejects wrong product links, deceptive origins, redirects and credentials', () => {
        const valid = offer().checkoutUrl
        expect(trustedCheckoutUrl(valid, 'printed')).toBe(true)
        for (const url of [valid.replace('6271', '6258'), valid.replace('https:', 'http:'), valid.replace('weddingtales.co.il', 'weddingtales.co.il.evil.test'), valid + '&redirect=https://evil.test', valid + '&add-to-cart=6271', valid + '#fragment', valid.replace('https://', 'https://user:pass@')]) expect(trustedCheckoutUrl(url, 'printed'), url).toBe(false)
    })
    it('rejects policy links off the trusted business origins', () => {
        const o = offer(); o.policies.refunds.url = 'https://example.test/policy'
        expect(validate(o).errors).toContain('policy_refunds')
    })
    it('checks destination and campaign and never silently switches an offer', () => {
        expect(getActiveOffer({ catalog: catalog(), productId: 'printed', customerContext: { country: 'US' }, nowMs: NOW }).reason).toBe('destination_mismatch')
        expect(getActiveOffer({ catalog: catalog(), productId: 'printed', campaignId: 'unknown-ad', nowMs: NOW }).reason).toBe('offer_not_found')
        expect(getActiveOffer({ catalog: catalog([offer(), offer({ offerId: 'another' })]), productId: 'printed', nowMs: NOW }).reason).toBe('ambiguous_offer')
    })
    it('does not allow an approved catalog with an unapproved or duplicate member', () => {
        expect(validateOfferCatalog(catalog([offer(), offer()]), { nowMs: NOW }).ok).toBe(false)
        expect(validateOfferCatalog(catalog([offer({ approval: null })]), { nowMs: NOW }).offers).toEqual([])
    })
    it('requires a separately verified coupon entitlement', () => {
        const c = catalog([offer({ coupon: { code: 'SYNTHETIC', eligibility: 'Synthetic eligibility', expiresAt: '2026-11-01T00:00:00Z', approval: approval() } })])
        expect(getActiveOffer({ catalog: c, productId: 'printed', nowMs: NOW }).reason).toBe('coupon_eligibility_unverified')
        expect(getActiveOffer({ catalog: c, productId: 'printed', nowMs: NOW, customerContext: { approvedCouponCodes: ['SYNTHETIC'] } }).ok).toBe(true)
    })
    it('will not represent an undefined free promise as an approved free product', () => {
        expect(validate(offer({ free: { scope: 'free' } })).errors).toContain('free_scope')
    })
    it('quotes approved totals directly without requiring checkout or exposing a link', () => {
        const result = formatOfferQuote(offer(), { nowMs: NOW })
        expect(result).toContain('990')
        expect(result).toContain('Synthetic tax summary')
        expect(result).toContain('Synthetic shipping summary')
        expect(result).not.toContain('checkout')
        expect(formatOfferQuote(offer({ approval: null }), { nowMs: NOW })).toBeNull()
    })
})

describe('snapshot and checkout consistency', () => {
    it('copies only commercial data and is detached from future mutations', () => {
        const o = offer({ customerPhone: 'synthetic-private-marker' })
        const snapshot = createOfferSnapshot(o, { nowMs: NOW })
        o.scope.includes.push('new')
        expect(snapshot.scope.includes).not.toContain('new')
        expect(JSON.stringify(snapshot)).not.toContain('synthetic-private-marker')
    })
    it('ignores capture timestamps and object key order but detects changed terms', () => {
        const one = createOfferSnapshot(offer(), { nowMs: NOW })
        const two = createOfferSnapshot(offer(), { nowMs: NOW + 1000 })
        expect(compareOfferSnapshots(one, two).changed).toBe(false)
        two.policies.refunds.summary = 'Changed terms'
        expect(compareOfferSnapshots(one, two)).toMatchObject({ priceChanged: false, requiresReconfirmation: true })
    })
    it('does not treat a trusted static checkout link as verification of checkout amount', () => {
        expect(prepareCheckout({ offer: offer(), nowMs: NOW })).toMatchObject({ status: 'blocked', reason: 'checkout_not_verified', checkoutUrl: null })
    })
    it('accepts exact recently verified quote and rejects stale or mismatching quotes', () => {
        const o = offer(), verified = quote(o)
        expect(prepareCheckout({ offer: o, checkoutResult: verified, nowMs: NOW }).status).toBe('ready')
        for (const patch of [{ verified: false }, { verificationRef: null }, { verifiedAt: '2026-10-05T11:54:00Z' }, { totalMinor: 1 }, { shippingMinor: 12 }, { offerVersion: 'other' }, { productId: 'digital' }, { url: 'https://evil.test' }]) expect(prepareCheckout({ offer: o, checkoutResult: { ...verified, ...patch }, nowMs: NOW }).status).toBe('blocked')
    })
    it('requires explicit acceptance of a changed offer before the link can return', () => {
        const previousSnapshot = createOfferSnapshot(offer(), { nowMs: NOW })
        const current = offer({ version: 'test-v2', approval: approval({ offerVersion: 'test-v2' }) })
        current.price.totalMinor = current.price.subtotalMinor = 99500
        const args = { offer: current, previousSnapshot, checkoutResult: quote(current), nowMs: NOW }
        expect(prepareCheckout(args)).toMatchObject({ status: 'reconfirm_required', reason: 'price_changed', checkoutUrl: null })
        expect(prepareCheckout({ ...args, acceptedSnapshot: previousSnapshot }).status).toBe('reconfirm_required')
        expect(prepareCheckout({ ...args, acceptedSnapshot: createOfferSnapshot(current, { nowMs: NOW }) }).status).toBe('ready')
    })
})

describe('read-only runtime store', () => {
    const dbFor = get => ({ collection: vi.fn(() => ({ doc: vi.fn(() => ({ get })) })) })
    it('re-reads on every request and returns immutable validated records', async () => {
        const get = vi.fn().mockResolvedValue({ exists: true, data: () => catalog() }), db = dbFor(get)
        const result = await readActiveOfferCatalog({ db, nowMs: NOW })
        await readActiveOfferCatalog({ db, nowMs: NOW })
        expect(get).toHaveBeenCalledTimes(2)
        expect(result.ok).toBe(true)
        expect(Object.isFrozen(result.catalog.offers[0].price)).toBe(true)
    })
    it('does not fall back to historical prices when missing, invalid or unavailable', async () => {
        for (const get of [vi.fn().mockResolvedValue({ exists: false }), vi.fn().mockResolvedValue({ exists: true, data: () => ({}) }), vi.fn().mockRejectedValue(new Error('private-error'))]) {
            const result = await readActiveOfferCatalog({ db: dbFor(get), nowMs: NOW })
            expect(result.ok).toBe(false)
            expect(result.offers).toEqual([])
            expect(JSON.stringify(result)).not.toContain('private-error')
        }
    })
})

describe('strict prompt', () => {
    it('contains automatic identity and sensitive memorial rules without legacy commercial claims', () => {
        const prompt = buildSystemPrompt({ eventType: 'memorial' }, '2026-10-05', { strictCommercial: true, nowMs: NOW })
        expect(prompt).toContain('העוזרת האוטומטית')
        expect(prompt).toContain('בלי מזל טוב')
        expect(prompt).toContain('אין כרגע הצעה מאושרת')
        for (const legacy of ['690', '990', '300', '290', '48 שעות', '14 ימי עסקים', 'מה שרוב המשפחות', 'שמרתי לכם עותק']) expect(prompt).not.toContain(legacy)
        expect(prompt).not.toContain('add-to-cart')
    })
    it('uses only validated runtime offers and never a stale offer or historical demo', () => {
        const prompt = buildSystemPrompt({}, '2026-10-05', { strictCommercial: true, nowMs: NOW, offerCatalog: { catalog: catalog() } })
        expect(prompt).toContain('990')
        expect(prompt).toContain('test-v1')
        expect(prompt).not.toContain('/wedding/')
        const invalid = buildSystemPrompt({}, '2026-10-05', { strictCommercial: true, nowMs: NOW, offerCatalog: catalog([offer({ approval: null })]) })
        expect(invalid).not.toContain('990')
    })
    it('also excludes legacy claims from strict follow-up generation', () => {
        const prompt = buildFollowUpPrompt({}, '2026-10-05', { strictCommercial: true, nowMs: NOW })
        expect(prompt).toContain('הסכמה')
        expect(prompt).not.toContain('עותק מודפס נוסף במתנה')
        expect(prompt).not.toContain('990')
    })
})
