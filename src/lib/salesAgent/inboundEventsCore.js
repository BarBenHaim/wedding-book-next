export const INBOUND_LEASE_MS = 30_000

const cachedText = value => value == null ? null : String(value)
const redactPhoneNumber = text => text
    .replace(/(?:\+?972|0)(?:[\s()\-]*\d){8,}/g, '[redacted]')
    .replace(/(טלפון:\s*)[^\n]+/g, '$1[redacted]')

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
        // A duplicate of an intentional no-send event must preserve that
        // silence without inventing a human takeover.
        noReply: outcome.noReply === true,
        skipped: cachedText(outcome.skipped),
        stage: cachedText(outcome.stage),
        followUpAt: cachedText(outcome.followUpAt),
        notifyOwner: cachedText(outcome.notifyOwner) ? redactPhoneNumber(cachedText(outcome.notifyOwner)) : null,
    }
}

export function assertCompletableInboundOutcome(outcome = {}) {
    if (!String(outcome.sendText || '').trim() && outcome.handoff !== true && outcome.noReply !== true) {
        throw new Error('inbound outcome needs sendText, handoff, or noReply')
    }
}

export function assertInboundClaimToken(claimToken) {
    if (!String(claimToken || '').trim()) throw new Error('inbound completion needs claimToken')
    return String(claimToken)
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

// Kept pure so competing workers can be tested without Firebase. The
// token is generated at the Firestore boundary and never derived from a
// phone number or the event id.
export function startInboundClaim(snapshot, nowMs, claimToken) {
    const decision = decideInboundClaim(snapshot, nowMs)
    if (decision.action !== 'process') return decision
    return {
        action: 'process',
        claimToken: assertInboundClaimToken(claimToken),
        claimGeneration: Number(snapshot?.claimGeneration || 0) + 1,
    }
}

export function decideInboundCompletion(snapshot, claimToken, nowMs = Date.now()) {
    if (snapshot?.status === 'completed' && snapshot.outcome) {
        return { action: 'cached', outcome: snapshot.outcome }
    }
    if (snapshot?.status !== 'processing' || Number(snapshot.leaseUntilMs) <= nowMs) {
        return { action: 'stale' }
    }
    if (!claimToken || snapshot.claimToken !== claimToken) return { action: 'busy' }
    return { action: 'complete' }
}
