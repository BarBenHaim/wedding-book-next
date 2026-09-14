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

export async function sendInboundSequenceDirect({ phone, parts, dependencies = productionDependencies }) {
    const ordered = Array.isArray(parts) ? [...parts].sort((left, right) => Number(left.order || 0) - Number(right.order || 0)) : []
    let acceptedParts = 0
    let persistenceDegraded = false
    for (const part of ordered) {
        try {
            let evidence
            if (part.kind === 'text') evidence = await dependencies.sendText(phone, part.text)
            else if (part.kind === 'image') evidence = await dependencies.sendImage(phone, part.url, part.caption || '')
            else if (part.kind === 'video') evidence = await dependencies.sendVideo(phone, part.url, part.caption || '')
            else if (part.kind === 'audio') evidence = await dependencies.sendAudio(phone, part.url, part.voiceNote === true)
            else throw Object.assign(new Error('unsupported inbound delivery part'), { errorCode: 'PROVIDER_FAILED' })
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
            return {
                status: acceptedParts > 0 ? 'partial' : 'failed',
                acceptedParts,
                totalParts: ordered.length,
                persistenceDegraded,
                errorCode,
            }
        }
    }
    return { status: 'accepted', acceptedParts, totalParts: ordered.length, persistenceDegraded }
}

export default { sendInboundSequenceDirect }
