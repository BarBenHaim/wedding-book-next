export const INBOUND_LEASE_MS = 30_000

const cachedText = value => value == null ? null : String(value)
const redactPhoneNumber = text => text.replace(/(?:\+?972|0)(?:[\s()\-]*\d){8,}/g, '[redacted]')

// Completed-event records must be safe to return inside the duplicate
// wrapper. They describe the original result but never include `ok`, a
// `send` array, delivery gates, phone numbers, or anything else that could
// look like permission to send again.
export function sanitizeInboundOutcome(outcome = {}) {
    return {
        sendText: cachedText(outcome.sendText) || '',
        sendImage: cachedText(outcome.sendImage),
        sendImageCaption: cachedText(outcome.sendImageCaption),
        sendVideo: cachedText(outcome.sendVideo),
        sendVideoCaption: cachedText(outcome.sendVideoCaption),
        handoff: outcome.handoff === true,
        stage: cachedText(outcome.stage),
        followUpAt: cachedText(outcome.followUpAt),
        notifyOwner: cachedText(outcome.notifyOwner) ? redactPhoneNumber(cachedText(outcome.notifyOwner)) : null,
    }
}

export function assertCompletableInboundOutcome(outcome = {}) {
    if (!String(outcome.sendText || '').trim() && outcome.handoff !== true) {
        throw new Error('inbound outcome needs sendText or handoff')
    }
}

export function decideInboundClaim(snapshot, nowMs = Date.now()) {
    if (!snapshot) return { action: 'process' }
    if (snapshot.status === 'completed' && snapshot.outcome) {
        return { action: 'cached', outcome: snapshot.outcome }
    }
    if (snapshot.status === 'processing' && Number(snapshot.leaseUntilMs) > nowMs) {
        return { action: 'busy' }
    }
    return { action: 'process' }
}
