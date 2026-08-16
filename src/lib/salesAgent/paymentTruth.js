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

export default { isVerifiedWooOrder, isVerifiedPayment }
