export const INBOUND_LEASE_MS = 30_000

const cachedText = value => value == null ? null : String(value)
const redactPhoneNumber = text => text
    .replace(/(?:\+?972|0)(?:[\s()\-]*\d){8,}/g, '[redacted]')
    .replace(/(טלפון:\s*)[^\n]+/g, '$1[redacted]')

const OPENING_PART_ID = /^[a-f0-9]{32}$/i
const OPENING_KINDS = new Set(['text', 'image', 'video', 'audio', 'approved_design'])

function sanitizeOpeningSequenceParts(parts) {
    if (!Array.isArray(parts)) return []
    return parts.slice(0, 20).flatMap(part => {
        const partId = String(part?.partId || '')
        const order = Number(part?.order)
        const kind = String(part?.kind || '')
        if (!OPENING_PART_ID.test(partId) || !Number.isInteger(order) || order < 1 || order > 5 || !OPENING_KINDS.has(kind)) return []
        const mediaKey = typeof part?.mediaKey === 'string' && part.mediaKey.length <= 100
            ? part.mediaKey
            : null
        const variableKey = typeof part?.variableKey === 'string' && /^[a-z][a-z0-9_]{0,79}$/.test(part.variableKey)
            ? part.variableKey
            : null
        const variableVersionId = typeof part?.variableVersionId === 'string'
            && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/.test(part.variableVersionId)
            ? part.variableVersionId
            : null
        return [{
            partId,
            order,
            kind,
            mediaKey,
            demoEvidence: part?.demoEvidence === true,
            ...(variableKey && variableVersionId ? { variableKey, variableVersionId } : {}),
            voiceNote: kind === 'audio' && part?.voiceNote === true,
            ...(typeof part?.blockId === 'string' && part.blockId.length <= 80 ? { blockId: part.blockId } : {}),
        }]
    })
}

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
        openingSequenceParts: sanitizeOpeningSequenceParts(outcome.openingSequenceParts),
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
