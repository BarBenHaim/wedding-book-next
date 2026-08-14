import { describe, it, expect } from 'vitest'
import {
    OPENING_VARIANTS, VARIANT_IDS, ACTIVE_VARIANT_IDS, assignVariant, findVariant, shouldApplyOpening,
    summarizeExperiments, summarizeGaps, MIN_SAMPLE,
} from '@/lib/salesAgent/experiments'
import { buildSystemPrompt } from '@/lib/salesAgent/prompt'

// The whole value of this module is that it refuses to lie about small
// numbers. At five leads a day, two identical openers will show a
// twenty-point gap for weeks; a screen that calls that a winner costs
// its owner a good opener. These tests exist to keep it honest.

const lead = over => ({ phone: 'test-lead-default', variant: 'question_first', ...over })
const approvedVariantIds = ['question_first', 'price_upfront', 'demo_first']

describe('variants', () => {
    it('defines genuinely different openings, each with a stated hypothesis', () => {
        // Count-agnostic on purpose: the arms grew from four to seven on
        // Lord's feedback, and the invariant worth testing is that each
        // arm is a real, distinct approach — not how many there are.
        expect(OPENING_VARIANTS.length).toBeGreaterThanOrEqual(4)
        for (const v of OPENING_VARIANTS) {
            expect(v.id).toBeTruthy()
            expect(v.label).toBeTruthy()
            expect(v.hypothesis, `${v.id} has no hypothesis`).toBeTruthy()
            expect(v.directive.length).toBeGreaterThan(20)
        }
        // No duplicate ids — a dup would silently merge two arms' stats.
        expect(new Set(VARIANT_IDS).size).toBe(VARIANT_IDS.length)
    })

    it('resolves a known id and refuses an unknown one', () => {
        expect(findVariant('demo_first').label).toBe('דמו מיד')
        expect(findVariant('nope')).toBeNull()
        expect(findVariant(undefined)).toBeNull()
    })
})

describe('assignment', () => {
    it('is stable for the same phone', () => {
        // A retried webhook must never move a lead to another arm — that
        // silently biases the comparison toward whichever arm retries.
        const a = assignVariant('test-lead-stable')
        for (let i = 0; i < 20; i++) expect(assignVariant('test-lead-stable')).toBe(a)
    })

    it('assigns new leads only to the three approved arms', () => {
        expect(ACTIVE_VARIANT_IDS).toEqual(approvedVariantIds)
        const assigned = new Set(Array.from({ length: 500 }, (_, i) => assignVariant(`test-lead-${i}`)))
        expect([...assigned].sort()).toEqual([...approvedVariantIds].sort())
    })

    it('only ever returns a real variant id', () => {
        for (let i = 0; i < 200; i++) {
            expect(VARIANT_IDS).toContain(assignVariant(`test-lead-${i}`))
        }
    })

    it('spreads reasonably evenly across arms', () => {
        const counts = {}
        for (let i = 0; i < 4000; i++) {
            const v = assignVariant(`test-spread-${i}`)
            counts[v] = (counts[v] || 0) + 1
        }
        // Expected N/arms per arm; ±30% is a generous band that still
        // catches a broken hash, at any arm count.
        const expected = 4000 / approvedVariantIds.length
        for (const id of approvedVariantIds) {
            expect(counts[id], `${id} got ${counts[id]}`).toBeGreaterThan(expected * 0.7)
            expect(counts[id]).toBeLessThan(expected * 1.3)
        }
    })

    it('survives an empty phone instead of throwing', () => {
        expect(VARIANT_IDS).toContain(assignVariant(''))
        expect(VARIANT_IDS).toContain(assignVariant(null))
    })
})

describe('when the opening directive applies', () => {
    it('applies to a brand new lead', () => {
        expect(shouldApplyOpening({ isNew: true })).toBe(true)
        expect(shouldApplyOpening(null)).toBe(true)
    })

    it('stops applying once the conversation is under way', () => {
        // Injecting "lead with a question" into message nine would make
        // the agent restart the conversation, and the arm would then be
        // measuring something it never actually did.
        expect(shouldApplyOpening({ isNew: false, userTurns: 1 })).toBe(true)
        expect(shouldApplyOpening({ isNew: false, userTurns: 2 })).toBe(false)
        expect(shouldApplyOpening({ isNew: false, userTurns: 9 })).toBe(false)
    })

    it('puts the directive in the prompt only at the opening', () => {
        const first = buildSystemPrompt({ isNew: true, variant: 'price_upfront' }, '2026-08-07')
        expect(first).toContain('איך לפתוח את השיחה הזאת')
        expect(first).toContain('690')

        const later = buildSystemPrompt({ isNew: false, userTurns: 5, variant: 'price_upfront' }, '2026-08-07')
        expect(later).not.toContain('איך לפתוח את השיחה הזאת')
    })

    it('leaves the prompt untouched when no variant is assigned', () => {
        expect(buildSystemPrompt({ isNew: true }, '2026-08-07')).not.toContain('איך לפתוח את השיחה הזאת')
    })
})

describe('summary — counting', () => {
    it('counts a reply only when the customer wrote a SECOND time', () => {
        // A lead exists because someone messaged us; one inbound turn is
        // the message that created it, not proof the opener worked.
        const rows = summarizeExperiments([
            lead({ phone: '1', userTurns: 1 }),
            lead({ phone: '2', userTurns: 2 }),
            lead({ phone: '3', userTurns: 7 }),
        ]).rows
        const r = rows.find(x => x.id === 'question_first')
        expect(r.leads).toBe(3)
        expect(r.replied).toBe(2)
    })

    it('credits an arm for a rung the lead has since fallen off', () => {
        // stage moves backwards to 'objection'; stagesReached remembers
        // that this opener did get them to an offer.
        const rows = summarizeExperiments([
            lead({ stage: 'objection', stagesReached: ['engaged', 'offer_sent', 'objection'] }),
        ]).rows
        expect(rows.find(x => x.id === 'question_first').reachedOffer).toBe(1)
    })

    it('counts the current stage even with no stagesReached history', () => {
        // Leads created before stagesReached existed must still count.
        const rows = summarizeExperiments([lead({ stage: 'ready_to_pay' })]).rows
        expect(rows.find(x => x.id === 'question_first').reachedOffer).toBe(1)
    })

    it('sums revenue and wins', () => {
        const rows = summarizeExperiments([
            lead({ phone: '1', stage: 'closed_won', amount: 950 }),
            lead({ phone: '2', stage: 'closed_won', amount: 690 }),
        ]).rows
        const r = rows.find(x => x.id === 'question_first')
        expect(r.won).toBe(2)
        expect(r.revenue).toBe(1640)
    })

    it('ignores leads with no variant or a retired one', () => {
        const s = summarizeExperiments([
            lead({ phone: '1', variant: undefined }),
            lead({ phone: '2', variant: 'an_old_test' }),
            lead({ phone: '3' }),
        ])
        expect(s.totalAssigned).toBe(1)
    })

    it('reports every arm even when it has no leads', () => {
        const s = summarizeExperiments([])
        expect(s.rows).toHaveLength(OPENING_VARIANTS.length)
        for (const r of s.rows) {
            expect(r.leads).toBe(0)
            expect(r.replyRate).toBeNull()
            expect(r.enough).toBe(false)
        }
    })

    it('still reports every retired historical arm', () => {
        const historicalIds = [
            'question_first', 'demo_first', 'photo_sample', 'call_offer',
            'assistant_intro', 'pics_first', 'price_upfront',
        ]
        const result = summarizeExperiments(historicalIds.map((variant, i) => ({
            phone: `historical-lead-${i}`, variant, userTurns: 2,
        })))

        expect(result.rows.map(row => row.id).sort()).toEqual([...historicalIds].sort())
        for (const id of historicalIds) {
            expect(result.rows.find(row => row.id === id)).toMatchObject({ leads: 1, replied: 1 })
        }
    })
})

describe('summary — refusing to lie about small numbers', () => {
    const arm = (variant, n, repliedCount) =>
        Array.from({ length: n }, (_, i) => lead({ phone: `${variant}-${i}`, variant, userTurns: i < repliedCount ? 3 : 1 }))

    it('names no winner while the sample is small, however lopsided', () => {
        // 5/5 vs 0/5 is a 100-point gap and means nothing.
        const s = summarizeExperiments([...arm('question_first', 5, 5), ...arm('demo_first', 5, 0)])
        expect(s.winner).toBeNull()
        expect(s.verdict).toBe('collecting')
    })

    it('tells you concretely how many more leads it needs', () => {
        const s = summarizeExperiments([...arm('question_first', 5, 2), ...arm('demo_first', 5, 2)])
        expect(s.needed).toBe(MIN_SAMPLE * 2 - 10)
        expect(s.needed).toBeGreaterThan(0)
    })

    it('still refuses a winner when the sample is big but the gap is noise', () => {
        // 50% vs 46% over 50 each. Real dashboards call this a winner.
        const s = summarizeExperiments([...arm('question_first', 50, 25), ...arm('demo_first', 50, 23)])
        expect(s.verdict).toBe('too-close')
        expect(s.winner).toBeNull()
    })

    it('names a winner once the gap is genuinely bigger than the noise', () => {
        const s = summarizeExperiments([...arm('question_first', 100, 70), ...arm('demo_first', 100, 30)])
        expect(s.verdict).toBe('winner')
        expect(s.winner).toBe('question_first')
    })

    it('never marks a small arm as having enough data', () => {
        expect(MIN_SAMPLE).toBe(30)
        const s = summarizeExperiments(arm('question_first', MIN_SAMPLE - 1, 10))
        expect(s.rows.find(r => r.id === 'question_first').enough).toBe(false)
        const s2 = summarizeExperiments(arm('question_first', MIN_SAMPLE, 10))
        expect(s2.rows.find(r => r.id === 'question_first').enough).toBe(true)
    })

    it('sorts the best reply rate first so the table reads top-down', () => {
        const s = summarizeExperiments([...arm('question_first', 40, 10), ...arm('demo_first', 40, 30)])
        expect(s.rows[0].id).toBe('demo_first')
    })
})

describe('gaps — the fast-feedback half', () => {
    it('groups repeated handoff reasons and counts them', () => {
        const g = summarizeGaps([
            lead({ phone: '1', handoffReason: 'שאל על חשבונית' }),
            lead({ phone: '2', handoffReason: 'שאל על חשבונית' }),
            lead({ phone: '3', handoffReason: 'ביקש לדבר עם בן אדם' }),
        ])
        expect(g[0]).toMatchObject({ reason: 'שאל על חשבונית', count: 2 })
        expect(g[1].count).toBe(1)
    })

    it('keeps a couple of phone numbers so you can go read the chat', () => {
        const g = summarizeGaps([
            lead({ phone: 'test-gap-one', handoffReason: 'שאל על חשבונית' }),
            lead({ phone: 'test-gap-two', handoffReason: 'שאל על חשבונית' }),
        ])
        expect(g[0].phones).toEqual(['test-gap-one', 'test-gap-two'])
    })

    it('ignores leads that never needed a human', () => {
        expect(summarizeGaps([lead({}), lead({ handoffReason: '' })])).toEqual([])
    })

    it('caps the list so one noisy reason cannot flood the panel', () => {
        const many = Array.from({ length: 40 }, (_, i) => lead({ phone: `${i}`, handoffReason: `סיבה ${i}` }))
        expect(summarizeGaps(many).length).toBeLessThanOrEqual(8)
    })
})
