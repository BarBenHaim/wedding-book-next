import { describe, expect, it } from 'vitest'
import { DEMO } from '@/lib/salesAgent/catalog'
import { decideSalesTurn } from '@/lib/salesAgent/decisionPolicy'
import { buildOpeningPlan } from '@/lib/salesAgent/openingPlan'

const library = {
    cover_personalised: { kind: 'image', url: 'https://media.test/cover.jpg', caption: 'כריכה' },
    book_open_spread: { kind: 'image', url: 'https://media.test/spread.jpg', caption: 'עמודים' },
    upload_screen: { kind: 'image', url: 'https://media.test/upload.jpg', caption: 'מסך העלאה' },
    flip_video: { kind: 'video', url: 'https://media.test/flip.mp4', caption: 'וידאו' },
}

const planFor = ({ lead = { isNew: true }, text = 'אפשר פרטים?', sequence = [], stats = {} } = {}) => buildOpeningPlan({
    lead,
    decision: decideSalesTurn({ lead, incomingText: text }),
    settings: { openingMediaSequence: sequence },
    library,
    stats,
    eventId: 'event-safe-1',
})

describe('proof-first opening plan', () => {
    it('composes two approved images and the live demo before one combined qualification question', () => {
        const result = planFor({ sequence: ['cover_personalised', 'book_open_spread'] })

        expect(result.eligible).toBe(true)
        expect(result.qualificationTarget).toBe('eventTypeAndDate')
        expect(result.mediaParts.map(part => part.key)).toEqual(['cover_personalised', 'book_open_spread'])
        expect(result.mediaParts.map(part => part.order)).toEqual([2, 3])
        expect(result.closingText).toContain(DEMO.writeBlessing)
        expect(result.closingText).toContain('לאיזה אירוע ומתי')
        expect(result.closingText.match(/\?/g)).toHaveLength(1)
        expect(JSON.stringify(result)).not.toMatch(/phone|customerText|972\d{6}/i)
    })

    it('uses safe catalog defaults when no opening sequence was configured', () => {
        expect(planFor().mediaParts.map(part => part.key)).toEqual(['cover_personalised', 'book_open_spread'])
    })

    it('keeps configured order below 30 delivered exposures and prefers proven performance at 30', () => {
        const sequence = ['cover_personalised', 'book_open_spread']
        expect(planFor({ sequence, stats: {
            cover_personalised: { delivered: 29, replied: 1, won: 0 },
            book_open_spread: { delivered: 29, replied: 25, won: 0 },
        } }).mediaParts.map(part => part.key)).toEqual(sequence)

        expect(planFor({ sequence, stats: {
            cover_personalised: { delivered: 30, replied: 2, won: 0 },
            book_open_spread: { delivered: 30, replied: 20, won: 1 },
        } }).mediaParts.map(part => part.key)).toEqual(['book_open_spread', 'cover_personalised'])
    })

    it('asks only for the fact that is still missing and asks nothing when both are known', () => {
        expect(planFor({ lead: { isNew: true, eventType: 'bar_mitzvah' } }).closingText).toMatch(/מתי האירוע\?$/)
        expect(planFor({ lead: { isNew: true, eventDate: '2026-11-05' } }).closingText).toMatch(/לאיזה אירוע זה\?$/)

        const known = planFor({ lead: { isNew: true, eventType: 'bar_mitzvah', eventDate: '2026-11-05' } })
        expect(known.qualificationTarget).toBeNull()
        expect(known.closingText).toContain(DEMO.writeBlessing)
        expect(known.closingText).not.toContain('?')
    })

    it('excludes video, missing and previously sent assets and caps the opening at two images', () => {
        const result = planFor({
            lead: { isNew: true, imagesSent: ['cover_personalised'] },
            sequence: ['cover_personalised', 'flip_video', 'missing', 'upload_screen', 'book_open_spread'],
        })
        expect(result.mediaParts.map(part => part.key)).toEqual(['upload_screen', 'book_open_spread'])
    })

    it('uses stable unique phone-free part IDs', () => {
        const first = planFor()
        const second = planFor()
        expect(first.mediaParts.map(part => part.partId)).toEqual(second.mediaParts.map(part => part.partId))
        expect(new Set(first.mediaParts.map(part => part.partId)).size).toBe(2)
        for (const part of first.mediaParts) expect(part.partId).toMatch(/^[a-f0-9]{32}$/)
    })

    it.each([
        ['existing lead', { isNew: false }],
        ['new CRM row with prior WhatsApp history', { isNew: true, hasPriorConversation: true }],
        ['active handoff', { isNew: true, stage: 'handoff', human: true }],
        ['verified customer', { isNew: true, stage: 'closed_won', paymentVerified: true }],
        ['cleanly lost lead', { isNew: true, stage: 'closed_lost' }],
    ])('does not create an opening bundle for an %s', (_name, lead) => {
        const result = planFor({ lead })
        expect(result).toEqual({ eligible: false, qualificationTarget: null, closingText: '', mediaParts: [] })
    })
})
