const VERIFIED_WOO_STATUSES = new Set(['processing', 'completed'])

export function isVerifiedWooOrder(order) {
    return !!String(order?.id || '').trim()
        && VERIFIED_WOO_STATUSES.has(String(order?.status || '').trim().toLowerCase())
}

export function isVerifiedPayment(lead) {
    return lead?.paymentVerified === true
        && typeof lead?.verifiedOrderId === 'string'
        && lead.verifiedOrderId.trim().length > 0
}

export async function recordVerifiedSalesOutcome(order, closeLead) {
    if (!isVerifiedWooOrder(order) || typeof closeLead !== 'function') return false
    const phone = String(order?.billing?.phone || '').trim()
    if (!phone) return false
    const firstItem = Array.isArray(order?.line_items) ? order.line_items[0] : null
    const packageId = String(firstItem?.sku || firstItem?.product_id || '').trim() || null
    const amount = Number(order?.total)
    const orderId = String(order.id).trim()
    await closeLead({
        phone,
        orderId,
        weddingId: orderId,
        amount: Number.isFinite(amount) ? amount : null,
        packageId,
    })
    return true
}

const paymentTruth = { isVerifiedWooOrder, isVerifiedPayment, recordVerifiedSalesOutcome }
export default paymentTruth
