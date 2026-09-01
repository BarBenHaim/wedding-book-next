import { normalizePhone } from './agent'

const MAX_NAME_LENGTH = 160
const MAX_EMAIL_LENGTH = 320

function boundedText(value, maxLength) {
    if (typeof value !== 'string') return null
    const normalized = value.trim()
    return normalized ? normalized.slice(0, maxLength) : null
}

function normalizedEmail(value) {
    const email = boundedText(value, MAX_EMAIL_LENGTH)?.toLowerCase() || null
    return email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null
}

function usableIsraeliPhone(value) {
    const phone = normalizePhone(value)
    return /^972\d{8,9}$/.test(phone) ? phone : null
}

export function classifyWeddingSale(weddingId, wedding = {}) {
    const id = boundedText(String(weddingId || ''), 180)
    const currency = String(wedding.currency || 'ILS').trim().toUpperCase()
    const orderId = boundedText(wedding.orderId, 180)
    const base = {
        weddingId: id,
        currency,
        phone: usableIsraeliPhone(wedding.ownerPhone),
        buyerName: boundedText(wedding.ownerName, MAX_NAME_LENGTH),
        ownerEmail: normalizedEmail(wedding.ownerEmail),
        packageId: boundedText(wedding.packageId || wedding.packageInterest, 80),
    }

    if (orderId) {
        return { ...base, kind: 'linked_woocommerce', reference: orderId, amount: 0 }
    }

    const amount = Number(wedding.amountPaid)
    const reference = `manual-wedding:${id}`
    if (!Number.isFinite(amount) || amount <= 0) {
        return { ...base, kind: 'not_paid', reference, amount: 0 }
    }
    if (currency !== 'ILS') {
        return { ...base, kind: 'unsupported_currency', reference, amount: 0 }
    }
    return { ...base, kind: 'owner_reported_paid', reference, amount }
}

export async function reconcileWeddingSale(weddingId, wedding, { closeLeadOnPurchase }) {
    const sale = classifyWeddingSale(weddingId, wedding)
    if (sale.kind !== 'owner_reported_paid') return { action: sale.kind }
    if (!sale.phone) return { action: 'unmatched_phone' }

    await closeLeadOnPurchase({
        phone: sale.phone,
        orderId: sale.reference,
        weddingId: sale.weddingId,
        amount: sale.amount,
        packageId: sale.packageId,
        buyerName: sale.buyerName,
        paymentSource: 'wedding_app_manual',
    })
    return { action: 'closed' }
}
