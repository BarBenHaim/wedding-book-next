import { TRUSTED_CHECKOUT_PRODUCTS } from './offerCatalog'

const VERIFIED_WOO_STATUSES = new Set(['processing', 'completed'])
const KNOWN_PRODUCTS = new Set(Object.values(TRUSTED_CHECKOUT_PRODUCTS))
export const MAX_WOO_BODY_BYTES = 256 * 1024

export function safeOrderId(value) {
    const id = typeof value === 'number' && Number.isSafeInteger(value) && value > 0
        ? String(value) : typeof value === 'string' ? value.trim() : ''
    return /^[A-Za-z0-9][A-Za-z0-9_-]{0,119}$/.test(id) ? id : null
}

export function moneyMinor(value) {
    const str = typeof value === 'number' && Number.isFinite(value) ? String(value)
        : typeof value === 'string' ? value.trim() : ''
    if (!/^\d{1,9}(?:\.\d{1,2})?$/.test(str)) return null
    const [whole, fraction = ''] = str.split('.')
    const minor = Number(whole) * 100 + Number(fraction.padEnd(2, '0'))
    return Number.isSafeInteger(minor) ? minor : null
}

function paidAtMs(order) {
    // Woo date_paid_gmt is ISO without Z; date_paid is shop-local. Validate
    // either format without pretending a local date is UTC evidence.
    const raw = order?.date_paid_gmt || order?.date_paid
    if (typeof raw !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})?$/.test(raw)) return NaN
    const normalized = /(?:Z|[+-]\d{2}:\d{2})$/.test(raw) ? raw : `${raw}Z`
    const ms = Date.parse(normalized)
    // Date.parse normalizes impossible dates such as February 30.
    if (Number.isFinite(ms) && !/[+-]\d{2}:\d{2}$/.test(raw)
        && new Date(ms).toISOString().slice(0, 19) !== raw.slice(0, 19)) return NaN
    return ms
}

// Strict mode is for the signed Woo webhook boundary, not generic parsed JSON.
// Woo's signed charged total is payment evidence, NOT an approved sales offer.
// We do not infer upgrade/add-on mappings or re-price a completed order here.
export function validateWooPayment(order, { strict = false, trustedSource = false, nowMs = Date.now() } = {}) {
    if (!safeOrderId(order?.id)) return { ok: false, reason: 'invalid_order_id' }
    if (!VERIFIED_WOO_STATUSES.has(String(order?.status || '').trim().toLowerCase())) return { ok: false, reason: 'wrong_status' }
    if (!strict) return { ok: true, reason: null, strict: false }
    if (trustedSource !== true) return { ok: false, reason: 'untrusted_payment_source' }
    const paidAt = paidAtMs(order)
    // The shop-local date can be ahead of UTC, so allow a bounded timezone
    // margin only when the provider omitted date_paid_gmt.
    const margin = order?.date_paid_gmt ? 5 * 60_000 : 14 * 60 * 60_000
    if (!Number.isFinite(paidAt) || paidAt <= 0 || paidAt > nowMs + margin) return { ok: false, reason: 'paid_date_unverified' }
    if (typeof order?.transaction_id !== 'string' || !order.transaction_id.trim() || order.transaction_id.length > 200
        || typeof order?.payment_method !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(order.payment_method)
        || ['bacs', 'cod', 'cheque'].includes(order.payment_method)) return { ok: false, reason: 'payment_reference_unverified' }
    const amountMinor = moneyMinor(order?.total)
    if (amountMinor == null || amountMinor <= 0) return { ok: false, reason: 'paid_amount_unverified' }
    if (order?.currency !== 'ILS') return { ok: false, reason: 'currency_unverified' }
    const items = order?.line_items
    if (!Array.isArray(items) || items.length !== 1 || !KNOWN_PRODUCTS.has(String(items[0]?.product_id))
        || items[0]?.quantity !== 1 || (items[0]?.variation_id != null && items[0].variation_id !== 0)) {
        return { ok: false, reason: 'product_mapping_unverified' }
    }
    // An unknown product/variation is a service review, not another book. The
    // positive paid line must be covered by the actual charged order total.
    const itemMinor = moneyMinor(items[0]?.total)
    if (itemMinor == null || itemMinor <= 0 || itemMinor > amountMinor) return { ok: false, reason: 'line_amount_unverified' }
    return { ok: true, reason: null, strict: true, amountMinor, currency: 'ILS', productId: String(items[0].product_id), paidAtMs: paidAt }
}

export function isVerifiedWooOrder(order, options = {}) {
    return validateWooPayment(order, options).ok
}

export function isVerifiedPayment(lead) {
    return lead?.paymentVerified === true
        && typeof lead?.verifiedOrderId === 'string'
        && lead.verifiedOrderId.trim().length > 0
}

export async function recordVerifiedSalesOutcome(order, closeLead, options = {}) {
    if (!isVerifiedWooOrder(order, options) || typeof closeLead !== 'function') return false
    const phone = String(order?.billing?.phone || '').trim()
    if (!phone) return false
    const firstItem = Array.isArray(order?.line_items) ? order.line_items[0] : null
    const packageId = String(firstItem?.sku || firstItem?.product_id || '').trim() || null
    const amount = Number(order?.total)
    const orderId = safeOrderId(order.id)
    await closeLead({
        phone, orderId, weddingId: options.weddingId === null ? null : options.weddingId || orderId,
        amount: Number.isFinite(amount) ? amount : null, packageId,
    })
    return true
}

const paymentTruth = { isVerifiedWooOrder, isVerifiedPayment, recordVerifiedSalesOutcome, validateWooPayment }
export default paymentTruth
