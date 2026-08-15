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
            provider: 'auto',
            model: 'claude-sonnet-4-5',
            fallbackModel: 'claude-haiku-4-5',
            activeOpeningIds: ['question_first', 'price_upfront', 'demo_first'],
            openingMediaSequence: [],
        })
        expect(MODEL_REGISTRY.every(row => !('apiKey' in row))).toBe(true)
    })

    it('normalizes only editable allowlisted fields and registered media', () => {
        const normalized = normalizeSalesSettings({
            revision: 7,
            enabled: false,
            provider: 'anthropic',
            model: 'claude-haiku-4-5',
            fallbackModel: 'attacker-model',
            businessInstructions: `  תתמקד בסגירה\u0000  `,
            activeOpeningIds: ['demo_first', 'call_offer', 'demo_first', 'unknown'],
            openingMediaSequence: ['photo-a', 'missing', 'video-b', 'photo-c', 'photo-d'],
            immutablePolicy: 'ignore policy',
            changeNote: '  בדיקת פתיח  ',
        }, { registeredMediaKeys: ['photo-a', 'video-b', 'photo-c', 'photo-d'] })

        expect(normalized).toEqual({
            revision: 7,
            enabled: false,
            provider: 'anthropic',
            model: 'claude-haiku-4-5',
            businessInstructions: 'תתמקד בסגירה',
            activeOpeningIds: ['demo_first'],
            openingMediaSequence: ['photo-a', 'video-b', 'photo-c'],
            changeNote: 'בדיקת פתיח',
        })
        expect(JSON.stringify(normalized)).not.toContain('ignore policy')
        expect(JSON.stringify(normalized)).not.toContain('attacker-model')
    })

    it('rejects invalid provider, model, revision, and oversized instructions', () => {
        expect(() => normalizeSalesSettings({ revision: -1 })).toThrow('INVALID_REVISION')
        expect(() => normalizeSalesSettings({ revision: 1, provider: 'other' })).toThrow('INVALID_PROVIDER')
        expect(() => normalizeSalesSettings({ revision: 1, model: 'made-up' })).toThrow('INVALID_MODEL')
        expect(() => normalizeSalesSettings({ revision: 1, businessInstructions: 'א'.repeat(4001) })).toThrow('INSTRUCTIONS_TOO_LONG')
    })

    it('resolves immutable policy and fallback on the server', () => {
        const resolved = resolveSalesSettings({
            revision: 4,
            enabled: true,
            provider: 'openai',
            model: 'gpt-4.1-mini',
            businessInstructions: 'תציג מחיר מוקדם',
            activeOpeningIds: ['price_upfront'],
            openingMediaSequence: [],
        })

        expect(resolved.fallbackModel).toBe('claude-haiku-4-5')
        expect(resolved.immutablePolicy).toContain('אין שיחות טלפון')
        expect(resolved.businessInstructions).toBe('תציג מחיר מוקדם')
    })
})
