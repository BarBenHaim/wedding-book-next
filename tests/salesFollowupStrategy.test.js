import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { planFollowUp, readFollowUpOffer, FOLLOWUP_STRATEGY_IDS, FOLLOWUP_CTAS } from '@/lib/salesAgent/followupStrategy'

// The plans below were written for the universal template (`wt_followup`,
// {{1}} = the whole message). Production defaults to the template Meta
// actually approved (`wt_followup_he`, {{1}} = the customer's name) - see
// the last describe - so these pin the universal name explicitly.
beforeEach(() => { process.env.SALES_FOLLOWUP_TEMPLATE_NAME = 'wt_followup' })
afterEach(() => { delete process.env.SALES_FOLLOWUP_TEMPLATE_NAME })

describe('the approved name-only template (production default)', () => {
    it('sends the customer name as the only parameter and records the body Meta will render', () => {
        delete process.env.SALES_FOLLOWUP_TEMPLATE_NAME
        const first = planFollowUp({ stage: 'engaged' }, { attempt: 1, customerName: 'דנה כהן' })
        expect(first.templateName).toBe('wt_followup_he')
        expect(first.templateParameters).toEqual(['דנה כהן'])
        expect(first.templateText).toBe('היי דנה כהן, רק מוודא שלא פספסתי אותך לגבי ספר הברכות. אשמח לענות על כל שאלה 🙏')
        // The plan itself (objective, cta, landing) is unchanged - only the transport text.
        expect(first.cta).toBeTruthy()
    })

    it('never sends an empty name parameter', () => {
        delete process.env.SALES_FOLLOWUP_TEMPLATE_NAME
        const plan = planFollowUp({ stage: 'new' }, { attempt: 2, customerName: '' })
        expect(plan.templateParameters).toEqual(['משפחה יקרה'])
        expect(plan.templateText).toMatch(/^היי משפחה יקרה, /)
    })

    it('falls back to the approved template for an unknown name', () => {
        process.env.SALES_FOLLOWUP_TEMPLATE_NAME = 'wt_something_else'
        expect(planFollowUp({ stage: 'new' }, { attempt: 1, customerName: 'רון' }).templateName).toBe('wt_followup_he')
    })
})

const NOW = Date.parse('2026-09-08T12:00:00.000Z')

describe('follow-up offer boundary', () => {
    it('accepts only a real-looking code with an expiry inside the next 48 hours', () => {
        expect(readFollowUpOffer({
            SALES_FOLLOWUP_COUPON_CODE: 'BACK48',
            SALES_FOLLOWUP_COUPON_EXPIRES_AT: '2026-09-10T11:59:59.000Z',
        }, NOW)).toEqual({ code: 'BACK48', expiresAt: '2026-09-10T11:59:59.000Z' })

        const invalid = [
            { SALES_FOLLOWUP_COUPON_CODE: '', SALES_FOLLOWUP_COUPON_EXPIRES_AT: '2026-09-09T12:00:00.000Z' },
            { SALES_FOLLOWUP_COUPON_CODE: 'not a code!', SALES_FOLLOWUP_COUPON_EXPIRES_AT: '2026-09-09T12:00:00.000Z' },
            { SALES_FOLLOWUP_COUPON_CODE: 'BACK48', SALES_FOLLOWUP_COUPON_EXPIRES_AT: '2026-09-08T11:59:59.000Z' },
            { SALES_FOLLOWUP_COUPON_CODE: 'BACK48', SALES_FOLLOWUP_COUPON_EXPIRES_AT: '2026-09-10T12:00:01.000Z' },
            { SALES_FOLLOWUP_COUPON_CODE: 'BACK48', SALES_FOLLOWUP_COUPON_EXPIRES_AT: 'not-a-date' },
        ]
        for (const env of invalid) expect(readFollowUpOffer(env, NOW)).toBeNull()
    })
})

describe('context-aware follow-up sales plan', () => {
    it('leads with one clear line and one question on the first touch, no link', () => {
        // 22.9: twenty-five "תוכל לראות באתר" follow-ups in one morning, one
        // reply. 24.9: no demo link either - what they get, one question.
        const plan = planFollowUp({ stage: 'engaged' }, {
            attempt: 1,
            isFinal: false,
            customerName: 'נועה',
        })
        expect(plan).toMatchObject({
            id: 'one_line',
            cta: 'reply',
            landingUrl: null,
            mediaPreference: 'video',
            coupon: null,
            templateName: 'wt_followup',
        })
        expect(plan.objective).toContain('בלי קישורים')
        expect(plan.templateText).toContain('נועה')
        expect(plan.templateText).not.toMatch(/https?:/)
        expect(plan.templateParameters).toEqual([plan.templateText])
    })

    // 1.10: the first touch is the only in-window one, so a lead who saw
    // the prices gets the dated concession and the close right there.
    it('leads with the dated concession on the FIRST touch after prices', () => {
        for (const stage of ['offer_sent', 'objection', 'demo_sent']) {
            const plan = planFollowUp({ stage }, { attempt: 1, customerName: 'נועה', todayISO: '2026-10-01' })
            expect(plan.id).toBe('deadline_offer')
            expect(plan.templateText).toContain('4 באוקטובר')
            expect(plan.templateText).toMatch(/רוצה שאפתח לכם את הספר\? שולח קישור\.$/)
        }
        // Already heard it: back to the one question.
        const heard = planFollowUp({ stage: 'offer_sent', turns: [{ role: 'assistant', text: 'עותק מודפס נוסף במתנה עד 4 באוקטובר' }] }, { attempt: 1, customerName: 'נועה' })
        expect(heard.id).toBe('one_question')
        expect(planFollowUp({ stage: 'engaged' }, { attempt: 1, customerName: 'נועה' }).id).toBe('one_line')
    })

    it('asks one question instead of re-proving to someone who already saw the demo or prices', () => {
        const heard = [{ role: 'assistant', text: 'עותק מודפס נוסף במתנה עד 4 באוקטובר' }]
        for (const stage of ['demo_sent', 'offer_sent']) {
            const plan = planFollowUp({ stage, turns: heard }, { attempt: 1, isFinal: false, customerName: 'דנה' })
            expect(plan.id).toBe('one_question')
            expect(plan.landingUrl).toBeNull()
            expect(plan.objective).toContain('בלי קישור')
        }
    })

    it('shows a real page on a later touch for a lead with no objection on record', () => {
        const plan = planFollowUp({ stage: 'engaged' }, { attempt: 2, isFinal: false, customerName: '' })
        expect(plan).toMatchObject({ id: 'real_page', cta: 'reply', mediaPreference: 'image', landingUrl: null })
    })

    it('asks about checkout friction instead of repeating proof for a payment-ready second touch', () => {
        expect(planFollowUp({ stage: 'ready_to_pay' }, {
            attempt: 2,
            isFinal: false,
            customerName: '',
        })).toMatchObject({
            id: 'resolve_blocker',
            objective: 'לברר בעדינות אם עצרה שאלה על החבילה, תקלה בתשלום או תזמון',
            cta: 'reply',
            landingUrl: null,
            mediaPreference: 'none',
            coupon: null,
            templateName: 'wt_followup',
            templateParameters: ['משפחה יקרה, רציתי לבדוק אם עצרה אתכם שאלה על החבילה, תקלה בתשלום או פשוט התזמון. אפשר לענות לי כאן במשפט אחד.'],
            templateText: 'משפחה יקרה, רציתי לבדוק אם עצרה אתכם שאלה על החבילה, תקלה בתשלום או פשוט התזמון. אפשר לענות לי כאן במשפט אחד.',
        })
    })

    it('keeps every route that shares an approved template on the exact same customer copy', () => {
        const firstSite = planFollowUp({ stage: 'engaged' }, {
            attempt: 1,
            customerName: 'נועה',
        })
        const secondSite = planFollowUp({ stage: 'engaged' }, {
            attempt: 2,
            customerName: 'נועה',
        })
        // Same template, and each route's parameter is exactly its own
        // rendered text. The copy itself differs on purpose since 22.9:
        // the first touch leads with the demo, the second with a real page.
        expect(secondSite.templateName).toBe(firstSite.templateName)
        expect(firstSite.templateParameters).toEqual([firstSite.templateText])
        expect(secondSite.templateParameters).toEqual([secondSite.templateText])

        const checkoutHelp = planFollowUp({ stage: 'ready_to_pay' }, {
            attempt: 2,
            customerName: 'נועה',
        })
        // An objection that already heard the concession gets the same
        // help line as a stuck checkout; one that has not gets the offer.
        const objectionHelp = planFollowUp({ stage: 'objection', turns: [{ role: 'assistant', text: 'עותק מודפס נוסף במתנה עד 2 באוקטובר' }] }, {
            attempt: 2,
            customerName: 'נועה',
        })
        expect(objectionHelp.templateName).toBe(checkoutHelp.templateName)
        expect(objectionHelp.templateText).toBe(checkoutHelp.templateText)
        expect(objectionHelp.templateParameters).toEqual([objectionHelp.templateText])
    })

    // 29.9: the second touch for someone who saw the prices is the one
    // concession with its date and the close, written the same way the
    // reply policy writes it. Not "what is stopping you".
    it('sends the dated concession and the close on the second touch after prices', () => {
        for (const stage of ['offer_sent', 'objection', 'demo_sent']) {
            const plan = planFollowUp({ stage }, { attempt: 2, customerName: 'נועה', todayISO: '2026-09-29' })
            expect(plan.id).toBe('deadline_offer')
            expect(plan.templateText).toContain('במתנה')
            expect(plan.templateText).toContain('2 באוקטובר')
            expect(plan.templateText).toMatch(/רוצה שאפתח לכם את הספר\? שולח קישור\.$/)
            expect(plan.objective).toContain('2 באוקטובר')
            expect(FOLLOWUP_STRATEGY_IDS).toContain(plan.id)
        }
        expect(planFollowUp({ stage: 'engaged' }, { attempt: 2, customerName: 'נועה' }).id).toBe('real_page')
    })

    it('gives a verified offer only to a high-intent final touch', () => {
        const offer = { code: 'BACK48', expiresAt: '2026-09-10T11:59:59.000Z' }
        expect(planFollowUp({ stage: 'offer_sent' }, {
            attempt: 3,
            isFinal: true,
            offer,
            customerName: 'דנה',
        })).toEqual({
            id: 'qualified_offer',
            objective: 'לתת לליד שכבר הביע כוונת רכישה סיבה אמיתית להשלים הזמנה עכשיו',
            cta: 'coupon',
            landingUrl: 'https://weddingtales.co.il',
            mediaPreference: 'none',
            coupon: offer,
            templateName: 'wt_followup',
            templateParameters: ['דנה, שמרנו לכם את הקוד BACK48 עד 10.9.2026. אפשר לראות את כל הפרטים ולהשלים הזמנה כאן: https://weddingtales.co.il'],
            templateText: 'דנה, שמרנו לכם את הקוד BACK48 עד 10.9.2026. אפשר לראות את כל הפרטים ולהשלים הזמנה כאן: https://weddingtales.co.il',
        })
    })

    it('closes respectfully without discount when intent or a valid offer is missing', () => {
        for (const [lead, offer] of [
            [{ stage: 'engaged' }, { code: 'BACK48', expiresAt: '2026-09-10T11:59:59.000Z' }],
            [{ stage: 'ready_to_pay' }, null],
        ]) {
            expect(planFollowUp(lead, {
                attempt: 3,
                isFinal: true,
                offer,
                customerName: 'טל',
            })).toEqual({
                id: 'graceful_close',
                objective: 'לסגור מעגל בכבוד ולהשאיר דלת פתוחה בלי לחץ ובלי הנחה',
                cta: 'none',
                landingUrl: null,
                mediaPreference: 'none',
                coupon: null,
                templateName: 'wt_followup',
                templateParameters: ['טל, סוגר כאן את המעקב כדי לא להציף. אם תרצו לחזור לספר הברכות בהמשך, פשוט כתבו לנו כאן.'],
                templateText: 'טל, סוגר כאן את המעקב כדי לא להציף. אם תרצו לחזור לספר הברכות בהמשך, פשוט כתבו לנו כאן.',
            })
        }
    })

    it('does not copy phone, transcript or arbitrary media URLs into strategy metadata', () => {
        const serialized = JSON.stringify(planFollowUp({
            stage: 'engaged',
            phone: 'private-phone-sentinel',
            notes: 'private-transcript-sentinel',
            turns: [{ text: 'private-turn-sentinel' }],
            mediaUrl: 'https://private-media.example/sentinel.mp4',
        }, { attempt: 1, customerName: 'נועה' }))

        expect(serialized).not.toContain('private-phone-sentinel')
        expect(serialized).not.toContain('private-transcript-sentinel')
        expect(serialized).not.toContain('private-turn-sentinel')
        expect(serialized).not.toContain('private-media.example')
    })

    // 22-29.9: three strategies were added to planFollowUp and not to the
    // ledger whitelist in leads.js; every first follow-up threw
    // INVALID_FOLLOWUP_METADATA in a silent catch and one lead a day went
    // out instead of twenty-five. The whitelist is now imported from here,
    // and this test walks every plan the strategy can produce.
    it('every strategy id and cta planFollowUp can produce is on the shared whitelist', () => {
        const stages = ['new', 'opening_completed', 'engaged', 'demo_sent', 'offer_sent', 'objection', 'ready_to_pay', 'commit_later']
        const seen = new Set()
        for (const stage of stages) {
            for (const attempt of [1, 2, 3]) {
                for (const isFinal of [false, true]) {
                    for (const offer of [null, { code: 'WT10', expiresAt: new Date(Date.now() + 3600e3).toISOString() }]) {
                        const heard = attempt === 1 && isFinal === false && offer === null ? [{ role: 'assistant', text: 'במתנה' }] : []
                        const plan = planFollowUp({ stage, turns: heard, notes: attempt === 2 ? 'התלבט על המחיר' : '' }, { attempt, isFinal, offer, customerName: 'נועה' })
                        seen.add(plan.id)
                        expect(FOLLOWUP_STRATEGY_IDS).toContain(plan.id)
                        expect(FOLLOWUP_CTAS).toContain(plan.cta)
                    }
                }
            }
        }
        for (const id of ['one_line', 'one_question', 'real_page', 'graceful_close']) expect([...seen]).toContain(id)
    })

    // 1.10: a far event gets "נדבר לקראת האירוע" on touch 3 and the
    // pre-event message on touch 4; a near or unknown date keeps the goodbye.
    it('says until-event on the third touch and sends the pre-event offer on the fourth when the date is far', () => {
        const far = { stage: 'offer_sent', eventDate: '2026-12-15' }
        const third = planFollowUp(far, { attempt: 3, isFinal: false, customerName: 'נועה', todayISO: '2026-10-01' })
        expect(third.id).toBe('until_event')
        expect(third.templateText).toContain('כחודש לפני האירוע')
        const fourth = planFollowUp(far, { attempt: 4, isFinal: true, customerName: 'נועה', todayISO: '2026-11-15' })
        expect(fourth.id).toBe('pre_event')
        expect(fourth.templateText).toContain('בעוד חודש')
        expect(fourth.templateText).toContain('במתנה')
        expect(fourth.templateText).toContain('«')
        expect(fourth.templateText).toMatch(/רוצה שאפתח לכם את הספר\? שולח קישור\.$/)
        expect(planFollowUp({ stage: 'offer_sent' }, { attempt: 3, isFinal: true, customerName: 'נועה', todayISO: '2026-10-01' }).id).toBe('graceful_close')
        for (const id of ['until_event', 'pre_event']) expect(FOLLOWUP_STRATEGY_IDS).toContain(id)
    })

    it('opens the first silent touch with a customer\'s own words', () => {
        expect(planFollowUp({ stage: 'engaged' }, { attempt: 1, customerName: 'נועה' }).templateText).toContain('«')
    })
})


describe('a chosen later conversation never gets a forced bonus', () => {
    it('keeps the contact contextual on any allowed touch', () => {
        for (const attempt of [1, 2, 3, 4]) {
            const plan = planFollowUp({ stage: 'commit_later', customerDeferred: true }, { attempt })
            expect(plan.id).toBe('one_question')
            expect(plan.templateText).not.toMatch(/במתנה|checkout|שולח קישור/)
        }
    })
})
