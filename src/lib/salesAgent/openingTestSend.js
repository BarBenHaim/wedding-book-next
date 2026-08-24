import { resolveOpeningSnapshotParts } from './openingRuntime'
import {
    sendWhatsAppAudio,
    sendWhatsAppImage,
    sendWhatsAppText,
    sendWhatsAppVideo,
} from './whatsapp'

const VARIANT_IDS = new Set(['A', 'B', 'C'])

function testError(code) {
    const error = new Error('opening test send unavailable')
    error.code = code
    return error
}

function normalizeRecipient(value) {
    let digits = String(value || '').replace(/\D/g, '')
    if (digits.startsWith('0')) digits = `972${digits.slice(1)}`
    if (!/^9725\d{8}$/.test(digits)) throw testError('TEST_RECIPIENT_NOT_CONFIGURED')
    return digits
}

function maskedRecipient(recipient) {
    return `•••${recipient.slice(-4)}`
}

const productionDependencies = {
    resolveParts: resolveOpeningSnapshotParts,
    sendText: sendWhatsAppText,
    sendImage: sendWhatsAppImage,
    sendVideo: sendWhatsAppVideo,
    sendAudio: sendWhatsAppAudio,
}

export async function sendOpeningVariantTest({
    variantId,
    recipient,
    experiment,
    variableVersions = {},
    legacyLibrary = {},
    leadContext = {},
    signDownload = null,
    dependencies = productionDependencies,
} = {}) {
    const normalizedRecipient = normalizeRecipient(recipient)
    const id = String(variantId || '')
    if (!VARIANT_IDS.has(id)) throw testError('TEST_VARIANT_NOT_FOUND')
    const selected = Array.isArray(experiment?.variants)
        ? experiment.variants.find(variant => variant?.id === id)
        : null
    if (!selected || !Array.isArray(selected.blocks) || !Number.isInteger(selected.revision)) {
        throw testError('TEST_VARIANT_NOT_FOUND')
    }
    const flow = {
        id: selected.id,
        label: String(selected.label || ''),
        revision: selected.revision,
        blocks: selected.blocks.map(block => ({ ...block })),
    }
    const resolved = await dependencies.resolveParts({
        flow,
        state: { cursor: 0, waitingFor: null },
        inbound: null,
        variableVersions,
        legacyLibrary,
        leadContext,
        signDownload,
        eventId: `owner-mobile-test-${id}-${selected.revision}-${Date.now()}`,
    })
    const parts = Array.isArray(resolved?.parts) ? resolved.parts : []
    if (!parts.length) throw testError('TEST_VARIANT_EMPTY')

    let sentParts = 0
    try {
        for (const part of parts) {
            if (part.kind === 'text') await dependencies.sendText(normalizedRecipient, part.text)
            else if (part.kind === 'image') await dependencies.sendImage(normalizedRecipient, part.url, part.caption || '')
            else if (part.kind === 'video') await dependencies.sendVideo(normalizedRecipient, part.url, part.caption || '')
            else if (part.kind === 'audio') await dependencies.sendAudio(normalizedRecipient, part.url, part.voiceNote === true)
            else throw testError('TEST_PART_UNSUPPORTED')
            sentParts += 1
        }
    } catch {
        return {
            ok: false,
            error: sentParts > 0 ? 'TEST_SEND_PARTIAL' : 'TEST_SEND_FAILED',
            variantId: id,
            sentParts,
            totalParts: parts.length,
            recipientMasked: maskedRecipient(normalizedRecipient),
        }
    }
    return {
        ok: true,
        variantId: id,
        variantRevision: selected.revision,
        sentParts,
        recipientMasked: maskedRecipient(normalizedRecipient),
    }
}

const openingTestSend = { sendOpeningVariantTest }

export default openingTestSend
