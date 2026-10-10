import { DELIVERY_ERROR_CODES } from './delivery'
import { recordDeliveryEvent } from './leads'
import {
    sendWhatsAppAudio,
    sendWhatsAppImage,
    sendWhatsAppText,
    sendWhatsAppVideo,
} from './whatsapp'

const productionDependencies = {
    sendText: sendWhatsAppText,
    sendImage: sendWhatsAppImage,
    sendVideo: sendWhatsAppVideo,
    sendAudio: sendWhatsAppAudio,
    recordDelivery: recordDeliveryEvent,
}

function normalizedErrorCode(error) {
    return DELIVERY_ERROR_CODES.includes(error?.errorCode) ? error.errorCode : 'PROVIDER_FAILED'
}

async function recordAcceptance(dependencies, part, providerMessageId, occurredAt) {
    return dependencies.recordDelivery({
        eventId: `direct-${part.partId}-accepted`,
        outboundId: part.partId,
        channel: 'whatsapp_graph',
        status: 'accepted',
        providerMessageId,
        occurredAt,
    })
}

async function recordFailure(dependencies, part, errorCode, occurredAt) {
    return dependencies.recordDelivery({
        eventId: `direct-${part.partId}-failed-${errorCode}`,
        outboundId: part.partId,
        channel: 'whatsapp_graph',
        status: 'failed',
        errorCode,
        occurredAt,
    })
}

export async function sendInboundSequenceDirect({ phone, parts, dependencies = productionDependencies, validateBeforePart = null, allowMediaRetry = false, onMediaFailure = null }) {
    const ordered = Array.isArray(parts) ? [...parts].sort((left, right) => Number(left.order || 0) - Number(right.order || 0)) : []
    let acceptedParts = 0
    let persistenceDegraded = false
    for (const part of ordered) {
        try {
            if (validateBeforePart) {
                const authorization = await validateBeforePart(part)
                if (authorization?.ok !== true) return {
                    status: 'suppressed', reason: authorization?.reason || 'send_not_authorized',
                    acceptedParts, totalParts: ordered.length, persistenceDegraded,
                }
            }
            const dispatch = () => {
                if (part.kind === 'text') return dependencies.sendText(phone, part.text)
                if (part.kind === 'image') return dependencies.sendImage(phone, part.url, part.caption || '')
                if (part.kind === 'video') return dependencies.sendVideo(phone, part.url, part.caption || '')
                if (part.kind === 'audio') return dependencies.sendAudio(phone, part.url, part.voiceNote === true)
                throw Object.assign(new Error('unsupported inbound delivery part'), { errorCode: 'PROVIDER_FAILED' })
            }
            let evidence
            try { evidence = await dispatch() } catch (error) {
                // Only an explicit provider rejection proves no acceptance.
                // Timeouts, network errors and missing message IDs never retry.
                if (!allowMediaRetry || !['image', 'video'].includes(part.kind)
                    || error.errorCode !== 'GRAPH_REJECTED' || !Number.isInteger(error.providerCode)) throw error
                if (validateBeforePart && (await validateBeforePart(part))?.ok !== true) return {
                    status: 'suppressed', reason: 'conversation-changed', acceptedParts,
                    totalParts: ordered.length, persistenceDegraded,
                }
                evidence = await dispatch()
            }
            acceptedParts += 1
            try {
                await recordAcceptance(dependencies, part, evidence.providerMessageId, new Date().toISOString())
            } catch {
                persistenceDegraded = true
            }
        } catch (error) {
            const errorCode = normalizedErrorCode(error)
            try {
                await recordFailure(dependencies, part, errorCode, new Date().toISOString())
            } catch {
                persistenceDegraded = true
            }
            let fallbackStatus = null
            if (onMediaFailure && ['image', 'video'].includes(part.kind) && !persistenceDegraded) {
                try {
                    const fallback = await onMediaFailure(part)
                    if (fallback?.part) {
                        const result = await sendInboundSequenceDirect({ phone, parts: [fallback.part], dependencies, validateBeforePart })
                        fallbackStatus = result.status
                    }
                } catch { fallbackStatus = 'unavailable' }
            }
            return {
                status: acceptedParts > 0 ? 'partial' : 'failed',
                acceptedParts,
                totalParts: ordered.length,
                persistenceDegraded,
                errorCode,
                ...(fallbackStatus ? { fallbackStatus } : {}),
            }
        }
    }
    return { status: 'accepted', acceptedParts, totalParts: ordered.length, persistenceDegraded }
}

export default { sendInboundSequenceDirect }
