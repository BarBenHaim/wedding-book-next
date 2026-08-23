import { describe, expect, it } from 'vitest'
import { buildOpeningOnlyPlan } from '@/lib/salesAgent/openingOnly'

const library = {
    cover: { kind: 'image', url: 'https://media.test/cover.jpg', caption: 'כריכה אמיתית' },
    spread: { kind: 'image', url: 'https://media.test/spread.jpg', caption: 'עמודים מבפנים' },
    demo: { kind: 'video', url: 'https://media.test/demo.mp4', caption: 'הדגמת העלאת ברכה' },
    extra: { kind: 'image', url: 'https://media.test/extra.jpg', caption: 'תמונה רביעית' },
}

const settings = {
    mode: 'opening_only',
    openingText: 'היי, כיף שכתבת 😊\nצירפתי דוגמאות. לאיזה אירוע ומתי הוא מתקיים?',
    openingMediaSequence: ['cover', 'demo', 'spread', 'extra'],
}

describe('opening-only sales plan', () => {
    it('builds the exact configured text and at most three ordered media parts without model-authored copy', () => {
        const result = buildOpeningOnlyPlan({
            lead: { isNew: true, stage: 'new' },
            settings,
            library,
            eventId: 'safe-event-id',
        })

        expect(result.eligible).toBe(true)
        expect(result.text).toBe(settings.openingText)
        expect(result.mediaParts.map(part => [part.kind, part.mediaKey, part.order])).toEqual([
            ['image', 'cover', 2],
            ['video', 'demo', 3],
            ['image', 'spread', 4],
        ])
        expect(result.sequenceParts.map(part => part.kind)).toEqual(['text', 'image', 'video', 'image'])
        expect(result.sequenceParts[0]).toMatchObject({ order: 1, text: settings.openingText, mediaKey: null })
        expect(new Set(result.sequenceParts.map(part => part.partId)).size).toBe(4)
        expect(JSON.stringify(result)).not.toMatch(/phone|972\d{6}/i)
    })

    it('uses only explicitly configured registered media and sends text alone when none is configured', () => {
        const result = buildOpeningOnlyPlan({
            lead: { isNew: true, stage: 'new' },
            settings: { ...settings, openingMediaSequence: ['missing'] },
            library,
            eventId: 'safe-event-id',
        })

        expect(result.mediaParts).toEqual([])
        expect(result.sequenceParts).toHaveLength(1)
        expect(result.sequenceParts[0].text).toBe(settings.openingText)
    })

    it.each([
        ['existing lead', { isNew: false, stage: 'engaged' }],
        ['prior conversation', { isNew: true, hasPriorConversation: true, stage: 'new' }],
        ['human takeover', { isNew: true, human: true, stage: 'new' }],
        ['verified payment', { isNew: true, paymentVerified: true, stage: 'closed_won' }],
        ['closed lead', { isNew: true, stage: 'closed_lost' }],
    ])('stays silent for an %s', (_name, lead) => {
        expect(buildOpeningOnlyPlan({ lead, settings, library, eventId: 'safe-event-id' })).toEqual({
            eligible: false,
            text: '',
            mediaParts: [],
            sequenceParts: [],
        })
    })
})
