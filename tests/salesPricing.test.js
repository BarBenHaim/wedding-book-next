import { describe, it, expect } from 'vitest'
import {
    PRICES, ratesFor, costOfClaudeUsage, costOfTextUsage, costOfImageUsage, formatUsd, unitEconomics,
} from '@/lib/salesAgent/pricing'

// A cost display is trusted more than it is checked, which makes a wrong
// one worse than none. The cases here are the ways it could quietly be
// wrong: a cached prompt billed at full rate, an unknown model reading
// as free, a real cost rounding to $0.00 on screen.

describe('rates', () => {
    it('knows the model the bot actually runs on', () => {
        expect(ratesFor('claude-haiku-4-5')).toBeTruthy()
    })

    it('returns null for a model it has never heard of', () => {
        // The point is that this is distinguishable from "costs nothing".
        expect(ratesFor('claude-something-new')).toBeNull()
        expect(ratesFor('')).toBeNull()
        expect(ratesFor(undefined)).toBeNull()
    })

    it('prices output above input for every model', () => {
        for (const [id, r] of Object.entries(PRICES)) {
            expect(r.output, id).toBeGreaterThan(r.input)
        }
    })

    it('prices a cache read far below fresh input', () => {
        const h = PRICES['claude-haiku-4-5']
        expect(h.cacheRead).toBeLessThan(h.input / 2)
    })
})

describe('costOfClaudeUsage', () => {
    it('bills input and output at their own rates', () => {
        // 1M in at $1 + 1M out at $5.
        const r = costOfClaudeUsage({ input_tokens: 1_000_000, output_tokens: 1_000_000 }, 'claude-haiku-4-5')
        expect(r.usd).toBeCloseTo(6, 10)
        expect(r.known).toBe(true)
    })

    it('prices a realistic single reply', () => {
        // ~2k in, ~300 out: the shape of one WhatsApp exchange.
        const r = costOfClaudeUsage({ input_tokens: 2000, output_tokens: 300 }, 'claude-haiku-4-5')
        expect(r.usd).toBeCloseTo(0.002 + 0.0015, 10)
    })

    it('adds cache reads and writes rather than folding them into input', () => {
        // Anthropic's input_tokens already excludes cached tokens, so
        // these are additional. Treating them as a subset would undercount.
        const r = costOfClaudeUsage(
            {
                input_tokens: 1_000_000,
                output_tokens: 0,
                cache_creation_input_tokens: 1_000_000,
                cache_read_input_tokens: 1_000_000,
            },
            'claude-haiku-4-5',
        )
        expect(r.usd).toBeCloseTo(1 + 1.25 + 0.1, 10)
    })

    it('reports an unknown model as unknown, not as free', () => {
        const r = costOfClaudeUsage({ input_tokens: 5_000_000 }, 'claude-nope')
        expect(r.known).toBe(false)
    })

    it('survives a missing or partial usage block', () => {
        expect(costOfClaudeUsage(null, 'claude-haiku-4-5').usd).toBe(0)
        expect(costOfClaudeUsage({}, 'claude-haiku-4-5').usd).toBe(0)
        expect(costOfClaudeUsage({ output_tokens: 100 }, 'claude-haiku-4-5').usd).toBeGreaterThan(0)
    })
})

describe('costOfTextUsage', () => {
    it('prices an OpenAI fallback response using normalized text usage', () => {
        expect(costOfTextUsage({
            input_tokens: 1_000_000,
            output_tokens: 1_000_000,
            cache_read_input_tokens: 1_000_000,
        }, 'gpt-4.1-mini')).toEqual({ usd: 2.1, known: true })
    })
})

describe('costOfImageUsage', () => {
    it('bills text input and image input at their different rates', () => {
        const r = costOfImageUsage(
            {
                input_tokens: 2_000_000,
                input_tokens_details: { text_tokens: 1_000_000, image_tokens: 1_000_000 },
                output_tokens: 1_000_000,
            },
            'gpt-image-2',
        )
        expect(r.usd).toBeCloseTo(5 + 8 + 30, 10)
    })

    it('bills the whole input at the image rate when the split is missing', () => {
        // Guessing high on our own cost is the safe direction.
        const r = costOfImageUsage({ input_tokens: 1_000_000, output_tokens: 0 }, 'gpt-image-2')
        expect(r.usd).toBeCloseTo(8, 10)
    })

    it('makes the mini model cheaper than the full one for identical usage', () => {
        const usage = { input_tokens: 1_000_000, output_tokens: 1_000_000 }
        const full = costOfImageUsage(usage, 'gpt-image-2').usd
        const mini = costOfImageUsage(usage, 'gpt-image-1-mini').usd
        expect(mini).toBeLessThan(full)
    })
})

describe('formatUsd', () => {
    it('does not round a real cost down to nothing', () => {
        // One reply costs a fraction of a cent. Two decimals would show
        // $0.00 and the whole panel would look broken.
        expect(formatUsd(0.0035)).toBe('$0.0035')
        expect(formatUsd(0.0035)).not.toBe('$0.00')
    })

    it('uses cents once the number is worth reading in cents', () => {
        expect(formatUsd(12.3456)).toBe('$12.35')
        expect(formatUsd(0.4321)).toBe('$0.432')
    })

    it('shows an exact zero plainly', () => {
        expect(formatUsd(0)).toBe('$0')
        expect(formatUsd(null)).toBe('$0')
        expect(formatUsd(undefined)).toBe('$0')
    })
})

describe('unitEconomics', () => {
    it('divides spend across leads and wins', () => {
        const u = unitEconomics({ usd: 10, leads: 50, won: 2 })
        expect(u.perLead).toBeCloseTo(0.2, 10)
        expect(u.perWon).toBeCloseTo(5, 10)
    })

    it('returns null rather than infinity before the first lead', () => {
        // A brand new install divides by zero on both counts.
        const u = unitEconomics({ usd: 3, leads: 0, won: 0 })
        expect(u.perLead).toBeNull()
        expect(u.perWon).toBeNull()
    })

    it('gives a cost per lead even with no sale yet', () => {
        const u = unitEconomics({ usd: 3, leads: 12, won: 0 })
        expect(u.perLead).toBeCloseTo(0.25, 10)
        expect(u.perWon).toBeNull()
    })
})
