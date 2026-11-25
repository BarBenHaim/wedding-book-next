import { describe, expect, it } from 'vitest'
import { BOT_MODELS, settingsChange, changeWarning } from '@/lib/botSettings'
import { MODEL_REGISTRY, normalizeSalesSettings, resolveSalesSettings, DEFAULT_SALES_SETTINGS } from '@/lib/salesAgent/settings'

const live = (extra = {}) => ({
    ...resolveSalesSettings({
        ...DEFAULT_SALES_SETTINGS, revision: 34, mode: 'full_sales', provider: 'anthropic', model: 'claude-opus-5-5',
        businessInstructions: 'להיות קצר',
    }),
    ...extra,
})

describe('what a change from the bot window sends', () => {
    it('sends the revision, only what changed and a note, never the whole settings', () => {
        const body = settingsChange(live(), { enabled: false, mode: 'full_sales' })

        expect(body).toEqual({ revision: 34, enabled: false, changeNote: expect.any(String) })
    })

    it('sends the provider together with the model', () => {
        const body = settingsChange(live(), { model: 'claude-sonnet-5-5' })

        expect(body).toMatchObject({ revision: 34, model: 'claude-sonnet-5-5', provider: 'anthropic' })
    })

    it('is nothing when nothing differs, spacing included', () => {
        expect(settingsChange(live(), { model: 'claude-opus-5-5', businessInstructions: '  להיות   קצר ' })).toBeNull()
    })

    it('refuses fields this window does not own', () => {
        expect(() => settingsChange(live(), { openingExperiment: {} })).toThrow('UNKNOWN_FIELD')
        expect(() => settingsChange(live(), { model: 'gpt-4.1-mini' })).toThrow('INVALID_MODEL')
    })

    it('offers only registered models', () => {
        for (const model of BOT_MODELS) {
            expect(MODEL_REGISTRY.find(row => row.id === model.id)).toMatchObject({ provider: model.provider, label: model.label })
        }
    })

    it('produces a body the server accepts on top of the current settings', () => {
        const current = live()
        const body = settingsChange(current, { model: 'claude-sonnet-5-5', mode: 'opening_only', businessInstructions: 'חדש' })

        expect(normalizeSalesSettings({ ...current, ...body })).toMatchObject({ model: 'claude-sonnet-5-5', mode: 'opening_only', businessInstructions: 'חדש' })
    })
})

describe('what Lord is asked before it is saved', () => {
    it('says that leads get no answer when the bot is turned off', () => {
        expect(changeWarning(live(), { enabled: false })).toContain('לא יקבלו תשובה')
    })

    it('says that the conversation stops after the opening', () => {
        expect(changeWarning(live(), { mode: 'opening_only' })).toContain('לא ימשיך')
    })

    it('names both models', () => {
        const words = changeWarning(live(), { model: 'claude-sonnet-5-5' })

        expect(words).toContain('Claude Sonnet 5.5')
        expect(words).toContain('Claude Opus 5.5')
    })

    it('says that new instructions affect the next answers', () => {
        expect(changeWarning(live(), { businessInstructions: 'חדש' })).toContain('התשובות הבאות')
    })
})
