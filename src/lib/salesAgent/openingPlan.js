import { createHash } from 'crypto'
import { DEMO } from './catalog'

export const DEFAULT_OPENING_MEDIA = Object.freeze(['cover_personalised', 'book_open_spread'])
export const OPENING_MIN_SAMPLE = 30

const TERMINAL_STAGES = new Set(['closed_won', 'closed_lost', 'handoff'])

export function qualificationTarget(lead = {}) {
    if (!lead.eventType && !lead.eventDate) return 'eventTypeAndDate'
    if (!lead.eventType) return 'eventType'
    if (!lead.eventDate) return 'eventDate'
    return null
}

function qualificationQuestion(target) {
    if (target === 'eventTypeAndDate') return 'לאיזה אירוע ומתי הוא מתקיים?'
    if (target === 'eventType') return 'לאיזה אירוע זה?'
    if (target === 'eventDate') return 'מתי האירוע?'
    return ''
}

function openingEligible(lead, decision) {
    return lead?.isNew === true
        && decision?.openingBundleRequired === true
        && lead?.hasPriorConversation !== true
        && lead?.human !== true
        && lead?.paymentVerified !== true
        && !TERMINAL_STAGES.has(lead?.stage)
}

function unique(values) {
    return [...new Set((Array.isArray(values) ? values : []).map(String).filter(Boolean))]
}

function performanceScore(stat = {}) {
    const delivered = Number(stat.delivered) || 0
    if (delivered < OPENING_MIN_SAMPLE) return null
    const replied = Number(stat.replied) || 0
    const won = Number(stat.won) || 0
    return replied / delivered + 3 * (won / delivered)
}

function selectMedia({ lead, settings, library, stats }) {
    const configured = unique(settings?.openingMediaSequence)
    const requested = unique([...configured, ...DEFAULT_OPENING_MEDIA, ...Object.keys(library || {})])
    const seen = new Set([...(lead?.imagesSent || []), ...(lead?.mediaSent || [])].map(String))
    const candidates = requested.filter(key => library?.[key]?.kind === 'image' && !seen.has(key))
    const scored = candidates.map((key, configuredOrder) => ({
        key,
        configuredOrder,
        score: performanceScore(stats?.[key]),
    }))
    const proven = scored.filter(item => item.score !== null)
    if (proven.length >= 2) {
        scored.sort((a, b) => {
            if (a.score === null && b.score === null) return a.configuredOrder - b.configuredOrder
            if (a.score === null) return 1
            if (b.score === null) return -1
            return b.score - a.score || a.configuredOrder - b.configuredOrder
        })
    }
    return scored.slice(0, 2).map(item => item.key)
}

function partId(eventId, index, key) {
    return createHash('sha256').update(`opening:${eventId}:${index}:${key}`).digest('hex').slice(0, 32)
}

export function buildOpeningPlan({ lead = {}, decision = {}, settings = {}, library = {}, stats = {}, eventId = '' } = {}) {
    if (!openingEligible(lead, decision)) {
        return { eligible: false, qualificationTarget: null, closingText: '', mediaParts: [] }
    }

    const target = qualificationTarget(lead)
    const question = qualificationQuestion(target)
    const closingText = [
        `אפשר גם לנסות בעצמך איך אורח מעלה ברכה ותמונה: ${DEMO.writeBlessing}`,
        question,
    ].filter(Boolean).join('\n\n')
    const mediaParts = selectMedia({ lead, settings, library, stats }).map((key, index) => ({
        partId: partId(eventId, index, key),
        order: index + 2,
        key,
        mediaKey: key,
        kind: 'image',
        url: library[key].url,
        caption: library[key].caption || '',
        demoEvidence: true,
    }))

    return { eligible: true, qualificationTarget: target, closingText, mediaParts }
}

export default buildOpeningPlan
