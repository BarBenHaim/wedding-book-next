import { createHash } from 'crypto'

const TERMINAL_STAGES = new Set(['closed_won', 'closed_lost', 'handoff'])

function eligibleLead(lead = {}) {
    return lead.isNew === true
        && lead.hasPriorConversation !== true
        && lead.human !== true
        && lead.paymentVerified !== true
        && !TERMINAL_STAGES.has(lead.stage)
}

function partId(eventId, part) {
    return createHash('sha256')
        .update(`opening-only:${String(eventId)}:${String(part)}`)
        .digest('hex')
        .slice(0, 32)
}

export function buildOpeningOnlyPlan({ lead = {}, settings = {}, library = {}, eventId = '' } = {}) {
    if (!eligibleLead(lead)) {
        return { eligible: false, text: '', mediaParts: [], sequenceParts: [] }
    }

    const text = String(settings.openingText || '').trim()
    const selected = [...new Set(Array.isArray(settings.openingMediaSequence)
        ? settings.openingMediaSequence.map(String)
        : [])]
        .filter(key => ['image', 'video'].includes(library[key]?.kind))
        .slice(0, 3)

    const mediaParts = selected.map((key, index) => ({
        partId: partId(eventId, `${index + 1}:${key}`),
        order: index + 2,
        kind: library[key].kind,
        key,
        mediaKey: key,
        url: library[key].url,
        caption: library[key].caption || '',
        demoEvidence: true,
    }))
    const sequenceParts = [
        {
            partId: partId(eventId, 'text'),
            order: 1,
            kind: 'text',
            text,
            mediaKey: null,
            demoEvidence: false,
        },
        ...mediaParts,
    ]

    return { eligible: true, text, mediaParts, sequenceParts }
}

export default buildOpeningOnlyPlan
