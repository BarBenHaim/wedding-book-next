import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { planFollowUp, readFollowUpOffer } from '@/lib/salesAgent/followupStrategy'

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

    it('asks one question instead of re-proving to someone who already saw the demo or prices', () => {
        for (const stage of ['demo_sent', 'offer_sent']) {
            const plan = planFollowUp({ stage }, { attempt: 1, isFinal: false, customerName: 'דנה' })
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
        const objectionHelp = planFollowUp({ stage: 'objection' }, {
            attempt: 2,
            customerName: 'נועה',
        })
        expect(objectionHelp.templateName).toBe(checkoutHelp.templateName)
        expect(objectionHelp.templateText).toBe(checkoutHelp.templateText)
        expect(objectionHelp.templateParameters).toEqual([objectionHelp.templateText])
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
})
