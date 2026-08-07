import { describe, it, expect } from 'vitest'
import { JOURNEY, VALUE_TIPS, journeyFor, journeyBlock, LANGUAGE_RULES, TERMS } from '@/lib/salesAgent/journey'
import { buildSystemPrompt } from '@/lib/salesAgent/prompt'
import { STAGES } from '@/lib/salesAgent/catalog'
import { isTestPhone } from '@/lib/salesAgent/leadsCore'

// The journey file is the thing to edit when a conversation goes badly,
// so what it must guarantee is coverage and focus: a brief for every
// stage the agent can be in, and only ONE of them in the prompt at a
// time. An agent handed nine sets of instructions averages them.

describe('journey coverage', () => {
    it('has a brief for every stage the agent can emit', () => {
        for (const s of STAGES) {
            if (s === 'handoff') continue // a human owns it; no brief needed
            expect(JOURNEY[s], `no journey brief for stage "${s}"`).toBeTruthy()
        }
    })

    it('gives every stage a goal and both lists', () => {
        for (const [stage, j] of Object.entries(JOURNEY)) {
            expect(j.title, stage).toBeTruthy()
            expect(j.goal, stage).toBeTruthy()
            expect(j.do.length, stage).toBeGreaterThan(0)
            expect(j.avoid.length, stage).toBeGreaterThan(0)
        }
    })

    it('falls back to the opening brief for an unknown stage', () => {
        expect(journeyFor('nonsense')).toBe(JOURNEY.new)
        expect(journeyFor(undefined)).toBe(JOURNEY.new)
    })
})

describe('journey in the prompt', () => {
    it('injects the brief for the stage the lead is actually in', () => {
        const p = buildSystemPrompt({ stage: 'ready_to_pay' }, '2026-08-07')
        expect(p).toContain('מוכן לשלם')
        expect(p).toContain('קישור התשלום המדויק')
    })

    it('injects only one stage, never the whole playbook', () => {
        // The failure this guards against is an agent that reads the
        // closing brief while the customer has not said hello yet.
        const p = buildSystemPrompt({ stage: 'new' }, '2026-08-07')
        expect(p).toContain(JOURNEY.new.goal)
        expect(p).not.toContain(JOURNEY.ready_to_pay.goal)
        expect(p).not.toContain(JOURNEY.objection.goal)
    })

    it('defaults to the opening brief when the lead has no stage', () => {
        expect(buildSystemPrompt({}, '2026-08-07')).toContain(JOURNEY.new.goal)
    })

    it('tells a paid customer it is no longer selling', () => {
        const p = buildSystemPrompt({ stage: 'closed_won' }, '2026-08-07')
        expect(p).toContain('אתה כבר לא מוכר')
    })
})

describe('things worth giving away', () => {
    it('offers concrete tips, each with a moment to use it', () => {
        expect(VALUE_TIPS.length).toBeGreaterThanOrEqual(4)
        for (const t of VALUE_TIPS) {
            expect(t.id).toBeTruthy()
            expect(t.when, t.id).toBeTruthy()
            expect(t.text.length, t.id).toBeGreaterThan(30)
        }
    })

    it('states no invented statistics', () => {
        // The agent's core rule is that it never invents facts. A tip
        // claiming "doubles your blessings" would break it in the one
        // place nobody would think to check.
        for (const t of VALUE_TIPS) {
            expect(t.text, t.id).not.toMatch(/\d+\s*%|פי \d|מכפיל|כפול/)
        }
    })

    it('puts the tips in the prompt', () => {
        const p = buildSystemPrompt({ stage: 'offer_sent' }, '2026-08-07')
        expect(p).toContain(VALUE_TIPS[0].text)
    })
})

describe('language quality', () => {
    it('pins the spelling of our own terms', () => {
        expect(TERMS.length).toBeGreaterThan(3)
        expect(LANGUAGE_RULES).toContain('Wedding Tales')
        expect(LANGUAGE_RULES).toContain('בר מצווה')
    })

    it('gives the model an escape hatch instead of a guess', () => {
        // The realistic way to avoid a misspelling is to not use the word.
        expect(LANGUAGE_RULES).toContain('תנסח מחדש')
    })

    it('reaches every conversation, not just the first', () => {
        for (const stage of ['new', 'objection', 'closed_won']) {
            expect(buildSystemPrompt({ stage }, '2026-08-07')).toContain('עברית נקייה')
        }
    })
})

describe('test-lead pattern', () => {
    it('matches the synthetic numbers and nothing else', () => {
        for (const p of ['972500000901', '972500000942', '972500000910']) {
            expect(isTestPhone(p), p).toBe(true)
        }
    })

    it('never matches a real Israeli mobile', () => {
        // This pattern gates a bulk delete with no undo. If it can match
        // a customer, it deletes a customer.
        for (const p of ['972526618184', '972501234567', '0526618184', '972544445555', '972500000000']) {
            expect(isTestPhone(p), p).toBe(false)
        }
    })

    it('is safe on junk input', () => {
        expect(isTestPhone('')).toBe(false)
        expect(isTestPhone(null)).toBe(false)
        expect(isTestPhone('not-a-phone')).toBe(false)
    })
})
