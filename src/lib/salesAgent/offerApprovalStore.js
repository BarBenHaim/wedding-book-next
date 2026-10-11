import { OFFER_SCHEMA_VERSION, trustedCheckoutUrl, trustedPolicyUrl, validateOfferCatalog } from './offerCatalog'
import { OFFER_CATALOG_COLLECTION, OFFER_CATALOG_DOCUMENT } from './offerStore'

// This is an explicit owner-publish boundary, not a seed, draft saver, or
// inference from public prices. Callers must authenticate the approving owner.
export const MAX_OFFER_PUBLISH_BYTES = 128 * 1024
export const MAX_CATALOG_OFFERS = 50
const ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const own = (value, key) => Object.prototype.hasOwnProperty.call(value || {}, key)
const clone = value => JSON.parse(JSON.stringify(value))
const safeText = (value, max = 1000) => typeof value === 'string' && value.trim().length > 0
    && value.length <= max && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)
const money = value => Number.isSafeInteger(value) && value >= 0
const safeId = value => typeof value === 'string' && ID.test(value)
const safeUrl = value => safeText(value, 2048) && !/\s/.test(value) && !/%(?:0[0-9a-f]|1[0-9a-f]|7f)/i.test(value)
const policyUrl = value => safeUrl(value) && trustedPolicyUrl(value) && new URL(value).search === ''
const dateString = value => typeof value === 'string' && value.length <= 40
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value))

function fail(code, status = 400, details = undefined) {
    const error = new Error(code)
    error.code = code
    error.status = status
    if (details) error.details = details
    throw error
}

// Reject unknown nested fields before a contract can become an approval. This
// also lets GET withhold corrupt legacy records rather than expose arbitrary
// stored metadata. Diagnostics contain field names/codes, never rejected values.
function catalogShape(catalog, { approved = false } = {}) {
    const errors = []
    const check = (value, path, allowed, required = allowed) => {
        if (!plain(value)) { errors.push(`${path}:object_required`); return false }
        if (Object.keys(value).some(key => !allowed.includes(key))) errors.push(`${path}:unknown_fields`)
        for (const key of required) if (!own(value, key)) errors.push(`${path}.${key}:required`)
        return true
    }
    const field = (value, path, valid) => { if (!valid(value)) errors.push(`${path}:invalid`) }
    const strings = (value, path, max = 30) => {
        if (!Array.isArray(value) || value.length > max || value.some(item => !safeText(item))) errors.push(`${path}:invalid`)
    }
    const approval = (value, path, kind = 'catalog') => {
        const fields = ['status', 'approvedBy', 'approvedAt', 'evidenceRef']
        const bindings = kind === 'catalog' ? ['catalogVersion'] : kind === 'offer' ? ['offerVersion'] : []
        if (!check(value, path, [...fields, 'catalogVersion', 'offerVersion', 'revokedAt'], [...fields, ...bindings])) return
        field(value.status, `${path}.status`, x => x === 'approved')
        field(value.approvedBy, `${path}.approvedBy`, x => safeText(x, 128))
        field(value.approvedAt, `${path}.approvedAt`, dateString)
        field(value.evidenceRef, `${path}.evidenceRef`, x => safeText(x, 512))
        for (const key of ['catalogVersion', 'offerVersion']) if (own(value, key)) field(value[key], `${path}.${key}`, safeId)
        if (own(value, 'revokedAt') && value.revokedAt !== null) field(value.revokedAt, `${path}.revokedAt`, dateString)
    }
    const root = ['schemaVersion', 'catalogId', 'version', 'offers', ...(approved ? ['approval'] : [])]
    if (!check(catalog, 'catalog', root)) return errors
    field(catalog.schemaVersion, 'catalog.schemaVersion', value => value === OFFER_SCHEMA_VERSION)
    field(catalog.catalogId, 'catalog.catalogId', safeId)
    field(catalog.version, 'catalog.version', safeId)
    if (approved) approval(catalog.approval, 'catalog.approval')
    if (!Array.isArray(catalog.offers) || catalog.offers.length > MAX_CATALOG_OFFERS) {
        errors.push('catalog.offers:invalid'); return errors
    }
    const identities = new Set(), selections = new Set()
    for (let i = 0; i < catalog.offers.length; i++) {
        const offer = catalog.offers[i], path = `catalog.offers[${i}]`
        const required = ['schemaVersion', 'offerId', 'version', 'productId', 'name', 'validFrom', 'validUntil', 'price', 'scope', 'process', 'timing', 'policies', 'checkoutUrl', 'upgradeOfferId', 'additionalCopyOfferId', ...(approved ? ['approval'] : [])]
        if (!check(offer, path, [...required, 'campaignId', 'coupon', 'free'], required)) continue
        field(offer.schemaVersion, `${path}.schemaVersion`, value => value === OFFER_SCHEMA_VERSION)
        for (const key of ['offerId', 'version']) field(offer[key], `${path}.${key}`, safeId)
        field(offer.productId, `${path}.productId`, value => ['digital', 'printed'].includes(value))
        field(offer.name, `${path}.name`, value => safeText(value, 200))
        for (const key of ['validFrom', 'validUntil']) field(offer[key], `${path}.${key}`, dateString)
        for (const key of ['upgradeOfferId', 'additionalCopyOfferId', 'campaignId']) {
            if (own(offer, key) && offer[key] !== null) field(offer[key], `${path}.${key}`, safeId)
        }
        if (identities.has(offer.offerId)) errors.push(`${path}.offerId:duplicate`)
        identities.add(offer.offerId)
        const selection = `${offer.productId}:${offer.campaignId || ''}`
        if (selections.has(selection)) errors.push(`${path}:ambiguous_selection`)
        selections.add(selection)
        if (approved) approval(offer.approval, `${path}.approval`, 'offer')
        if (check(offer.price, `${path}.price`, ['currency', 'totalMinor', 'subtotalMinor', 'tax', 'shipping', 'additionalCharges'])) {
            field(offer.price.currency, `${path}.price.currency`, value => value === 'ILS')
            for (const key of ['totalMinor', 'subtotalMinor']) field(offer.price[key], `${path}.price.${key}`, money)
            for (const key of ['tax', 'shipping']) {
                const fields = ['amountMinor', 'summary']
                if (check(offer.price[key], `${path}.price.${key}`, [...fields, ...(key === 'shipping' ? ['destinationCountry', 'destinationRegion'] : [])], fields)) {
                    field(offer.price[key].amountMinor, `${path}.price.${key}.amountMinor`, money)
                    field(offer.price[key].summary, `${path}.price.${key}.summary`, safeText)
                    for (const name of key === 'shipping' ? ['destinationCountry', 'destinationRegion'] : []) {
                        if (own(offer.price[key], name)) field(offer.price[key][name], `${path}.price.${key}.${name}`, value => safeText(value, 100))
                    }
                }
            }
            const charges = offer.price.additionalCharges
            if (!Array.isArray(charges) || charges.length > 20) errors.push(`${path}.price.additionalCharges:invalid`)
            else charges.forEach((charge, j) => {
                if (check(charge, `${path}.price.additionalCharges[${j}]`, ['name', 'amountMinor'])) {
                    field(charge.name, `${path}.price.additionalCharges[${j}].name`, value => safeText(value, 200))
                    field(charge.amountMinor, `${path}.price.additionalCharges[${j}].amountMinor`, money)
                }
            })
        }
        const scopeFields = ['includes', 'excludes', 'bookType', 'copies', 'dimensions', 'pageLimit', 'blessingLimit', 'photoLimit', 'accessPeriod']
        if (check(offer.scope, `${path}.scope`, scopeFields)) {
            for (const key of ['includes', 'excludes']) strings(offer.scope[key], `${path}.scope.${key}`)
            field(offer.scope.bookType, `${path}.scope.bookType`, value => safeText(value, 100))
            field(offer.scope.copies, `${path}.scope.copies`, value => Number.isSafeInteger(value) && value >= 0)
            for (const key of ['dimensions', 'pageLimit', 'blessingLimit', 'photoLimit', 'accessPeriod']) {
                if (offer.scope[key] !== null) field(offer.scope[key], `${path}.scope.${key}`, safeText)
            }
        }
        for (const [key, fields] of [['process', ['design', 'editing', 'approval', 'humanAssistance']], ['timing', ['production', 'delivery', 'startsFrom']]]) {
            if (check(offer[key], `${path}.${key}`, fields)) for (const name of fields) field(offer[key][name], `${path}.${key}.${name}`, safeText)
        }
        const policyFields = ['service', 'dateChange', 'cancellation', 'refunds']
        if (check(offer.policies, `${path}.policies`, policyFields)) for (const key of policyFields) {
            const policy = offer.policies[key], at = `${path}.policies.${key}`
            if (check(policy, at, ['version', 'summary', 'url'])) {
                field(policy.version, `${at}.version`, safeId)
                field(policy.summary, `${at}.summary`, safeText)
                field(policy.url, `${at}.url`, policyUrl)
            }
        }
        field(offer.checkoutUrl, `${path}.checkoutUrl`, value => safeUrl(value) && trustedCheckoutUrl(value, offer.productId))
        if (offer.coupon != null) {
            const fields = ['code', 'eligibility', 'expiresAt', ...(approved ? ['approval'] : [])]
            if (check(offer.coupon, `${path}.coupon`, fields)) {
                field(offer.coupon.code, `${path}.coupon.code`, value => safeText(value, 100))
                field(offer.coupon.eligibility, `${path}.coupon.eligibility`, safeText)
                field(offer.coupon.expiresAt, `${path}.coupon.expiresAt`, dateString)
                if (approved) approval(offer.coupon.approval, `${path}.coupon.approval`, 'coupon')
            }
        }
        if (offer.free != null && check(offer.free, `${path}.free`, ['scope', 'limitations', 'paidScope', 'startUrl', 'termsUrl'])) {
            for (const key of ['scope', 'limitations', 'paidScope']) field(offer.free[key], `${path}.free.${key}`, safeText)
            for (const key of ['startUrl', 'termsUrl']) field(offer.free[key], `${path}.free.${key}`, policyUrl)
        }
    }
    for (let i = 0; i < catalog.offers.length; i++) for (const key of ['upgradeOfferId', 'additionalCopyOfferId']) {
        const reference = catalog.offers[i]?.[key]
        if (reference != null && (!identities.has(reference) || reference === catalog.offers[i]?.offerId)) errors.push(`catalog.offers[${i}].${key}:unresolved`)
    }
    return [...new Set(errors)].slice(0, 100)
}

function stampCatalog(catalog, { approvedBy, evidenceRef, nowMs }) {
    const result = clone(catalog)
    const approval = { status: 'approved', approvedBy, evidenceRef, approvedAt: new Date(nowMs).toISOString(), catalogVersion: result.version }
    result.approval = { ...approval }
    for (const offer of result.offers) {
        offer.approval = { ...approval, offerVersion: offer.version }
        if (offer.coupon) offer.coupon.approval = { ...approval, offerVersion: offer.version }
    }
    return result
}

const validationStatus = validation => ({ ok: validation.ok, reason: validation.reason || null,
    ...(validation.rejected ? { rejected: validation.rejected } : {}) })

export async function readOfferCatalogForApproval({ db, nowMs = Date.now() } = {}) {
    const snapshot = await db.collection(OFFER_CATALOG_COLLECTION).doc(OFFER_CATALOG_DOCUMENT).get()
    if (!snapshot.exists) return { ok: true, currentVersion: null, catalog: null, validation: { ok: false, reason: 'catalog_missing' } }
    const catalog = snapshot.data(), currentVersion = safeId(catalog?.version) ? catalog.version : null
    const shape = catalogShape(catalog, { approved: true })
    if (shape.length) return { ok: true, currentVersion, catalog: null, validation: { ok: false, reason: 'catalog_shape_invalid', errors: shape } }
    return { ok: true, currentVersion, catalog, validation: validationStatus(validateOfferCatalog(catalog, { nowMs })) }
}

export async function publishOfferCatalog(input, { db, approvedBy, nowMs = Date.now() } = {}) {
    if (!plain(input) || Object.keys(input).some(key => !['action', 'expectedVersion', 'evidenceRef', 'catalog'].includes(key))) fail('INVALID_PUBLISH_REQUEST')
    if (input.action !== 'publish') fail('EXPLICIT_PUBLISH_REQUIRED')
    if (!own(input, 'expectedVersion') || (input.expectedVersion !== null && !safeId(input.expectedVersion))) fail('INVALID_EXPECTED_VERSION')
    if (!safeText(input.evidenceRef, 512)) fail('APPROVAL_EVIDENCE_REQUIRED')
    if (!safeText(approvedBy, 128) || !Number.isFinite(nowMs)) fail('APPROVAL_IDENTITY_REQUIRED', 403)
    const shape = catalogShape(input.catalog)
    if (shape.length) fail('INVALID_OFFER_CATALOG', 400, { errors: shape })
    const catalog = stampCatalog(input.catalog, { approvedBy, evidenceRef: input.evidenceRef, nowMs })
    const validation = validateOfferCatalog(catalog, { nowMs })
    if (!validation.ok) fail('INVALID_OFFER_CATALOG', 400, validationStatus(validation))
    if (Buffer.byteLength(JSON.stringify(catalog), 'utf8') > MAX_OFFER_PUBLISH_BYTES) fail('REQUEST_TOO_LARGE', 413)
    const currentRef = db.collection(OFFER_CATALOG_COLLECTION).doc(OFFER_CATALOG_DOCUMENT)
    const versionRef = currentRef.collection('versions').doc(catalog.version)
    return db.runTransaction(async transaction => {
        // Read both records before writes. Firestore retries compare-and-swap on
        // concurrent publishes; create() preserves an immutable version record.
        const current = await transaction.get(currentRef)
        const history = await transaction.get(versionRef)
        const previous = current.exists ? current.data() : null
        if (current.exists && !safeId(previous?.version)) fail('CURRENT_CATALOG_INVALID', 409)
        if ((previous?.version ?? null) !== input.expectedVersion) fail('STALE_CATALOG_VERSION', 409)
        if (previous?.catalogId && previous.catalogId !== catalog.catalogId) fail('CATALOG_IDENTITY_MISMATCH', 409)
        if (history.exists || previous?.version === catalog.version) fail('CATALOG_VERSION_EXISTS', 409)
        transaction.create(versionRef, catalog)
        transaction.set(currentRef, catalog)
        return { ok: true, currentVersion: catalog.version, catalog, validation: validationStatus(validation) }
    })
}
