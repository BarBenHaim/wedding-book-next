import { describe, expect, it } from 'vitest'
import { normalizeSalesSettings, DEFAULT_SALES_SETTINGS } from '@/lib/salesAgent/settings'
import { costOfTextUsage } from '@/lib/salesAgent/pricing'

const MILLION = 1_000_000

describe.each([
    ['claude-opus-5-5', 4 + 20 + 5 + 0.2],
    ['claude-sonnet-5-5', 2 + 10 + 2.5 + 0.1],
])('%s', (model, perMillionOfEach) => {
    it('can be chosen in the sales settings', () => {
        const saved = normalizeSalesSettings({ ...DEFAULT_SALES_SETTINGS, provider: 'anthropic', model })

        expect(saved).toMatchObject({ provider: 'anthropic', model })
    })

    it('has a known price, so its replies are counted', () => {
        const cost = costOfTextUsage({
            input_tokens: MILLION, output_tokens: MILLION,
            cache_creation_input_tokens: MILLION, cache_read_input_tokens: MILLION,
        }, model)

        expect(cost.known).toBe(true)
        expect(cost.usd).toBeCloseTo(perMillionOfEach, 6)
    })
})
