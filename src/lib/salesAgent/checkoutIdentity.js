import crypto from 'node:crypto'

export function checkoutQuoteId({ leadId, offerId, offerVersion, eventId }) {
    if (![leadId, offerId, offerVersion, eventId].every(v => typeof v === 'string' && v.length > 0 && v.length < 500)) return null
    return crypto.createHash('sha256').update(JSON.stringify([leadId, offerId, offerVersion, eventId])).digest('hex')
}
