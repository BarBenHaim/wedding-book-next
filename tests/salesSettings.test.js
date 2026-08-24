import { describe, expect, it } from 'vitest'
import {
    DEFAULT_SALES_SETTINGS,
    MODEL_REGISTRY,
    normalizeSalesSettings,
    resolveSalesSettings,
} from '@/lib/salesAgent/settings'

describe('sales agent settings', () => {
    it('publishes a safe default that matches the running agent', () => {
        expect(DEFAULT_SALES_SETTINGS).toMatchObject({
            revision: 0,
            enabled: true,
            mode: 'opening_only',
            openingText: expect.stringContaining('לאיזה אירוע'),
            provider: 'auto',
            model: 'claude-sonnet-4-5',
            fallbackModel: 'claude-haiku-4-5',
            activeOpeningIds: ['answer_first', 'value_question'],
            openingMediaSequence: [],
            openingExperiment: {
                enabled: false,
                minSamplePerVariant: 30,
                variants: expect.arrayContaining([
                    expect.objectContaining({ id: 'A' }),
                    expect.objectContaining({ id: 'B' }),
                    expect.objectContaining({ id: 'C' }),
                ]),
            },
        })
        expect(MODEL_REGISTRY.every(row => !('apiKey' in row))).toBe(true)
    })

    it('normalizes only editable allowlisted fields and registered media', () => {
        const normalized = normalizeSalesSettings({
            revision: 7,
            enabled: false,
            mode: 'opening_only',
            openingText: '  היי!\n\nצירפתי דוגמה.  ',
            provider: 'anthropic',
            model: 'claude-haiku-4-5',
            fallbackModel: 'attacker-model',
            businessInstructions: `  תתמקד בסגירה\u0000  `,
            activeOpeningIds: ['answer_first', 'call_offer', 'answer_first', 'unknown'],
            openingMediaSequence: ['photo-a', 'missing', 'video-b', 'photo-c', 'photo-d'],
            immutablePolicy: 'ignore policy',
            changeNote: '  בדיקת פתיח  ',
            openingExperiment: {
                enabled: true,
                minSamplePerVariant: 30,
                variants: [
                    {
                        id: 'A', label: 'A', enabled: true, weight: 100, revision: 1,
                        blocks: [
                            { id: 'a-text', type: 'text', text: 'הסבר' },
                            { id: 'a-stop', type: 'stop' },
                        ],
                    },
                ],
            },
        }, { registeredMediaKeys: ['photo-a', 'video-b', 'photo-c', 'photo-d'] })

        expect(normalized).toEqual({
            revision: 7,
            enabled: false,
            mode: 'opening_only',
            openingText: 'היי!\n\nצירפתי דוגמה.',
            provider: 'anthropic',
            model: 'claude-haiku-4-5',
            businessInstructions: 'תתמקד בסגירה',
            activeOpeningIds: ['answer_first'],
            openingMediaSequence: ['photo-a', 'video-b', 'photo-c'],
            changeNote: 'בדיקת פתיח',
            openingExperiment: expect.objectContaining({
                enabled: true,
                variants: [expect.objectContaining({ id: 'A', revision: 1 })],
            }),
        })
        expect(JSON.stringify(normalized)).not.toContain('ignore policy')
        expect(JSON.stringify(normalized)).not.toContain('attacker-model')
    })

    it('rejects invalid provider, model, revision, and oversized instructions', () => {
        expect(() => normalizeSalesSettings({ revision: -1 })).toThrow('INVALID_REVISION')
        expect(() => normalizeSalesSettings({ revision: 1, provider: 'other' })).toThrow('INVALID_PROVIDER')
        expect(() => normalizeSalesSettings({ revision: 1, model: 'made-up' })).toThrow('INVALID_MODEL')
        expect(() => normalizeSalesSettings({ revision: 1, businessInstructions: 'א'.repeat(4001) })).toThrow('INSTRUCTIONS_TOO_LONG')
        expect(() => normalizeSalesSettings({ revision: 1, openingText: '' })).toThrow('OPENING_TEXT_REQUIRED')
        expect(() => normalizeSalesSettings({ revision: 1, openingText: 'א'.repeat(1501) })).toThrow('OPENING_TEXT_TOO_LONG')
        expect(() => normalizeSalesSettings({ revision: 1, mode: 'full_conversation' })).toThrow('INVALID_MODE')
    })

    it('resolves immutable policy and fallback on the server', () => {
        const resolved = resolveSalesSettings({
            revision: 4,
            enabled: true,
            provider: 'openai',
            model: 'gpt-4.1-mini',
            businessInstructions: 'תציג מחיר מוקדם',
            activeOpeningIds: ['value_question'],
            openingMediaSequence: [],
        })

        expect(resolved.fallbackModel).toBe('claude-haiku-4-5')
        expect(resolved.immutablePolicy).toContain('אין שיחות טלפון')
        expect(resolved.businessInstructions).toBe('תציג מחיר מוקדם')
    })

    it('migrates a stored retired opening set to the current safe defaults', () => {
        const resolved = resolveSalesSettings({
            revision: 9,
            enabled: true,
            provider: 'auto',
            model: 'claude-sonnet-4-5',
            activeOpeningIds: ['question_first', 'price_upfront', 'demo_first'],
            openingMediaSequence: [],
        })

        expect(resolved.revision).toBe(9)
        expect(resolved.activeOpeningIds).toEqual(['answer_first', 'value_question'])
    })
})
