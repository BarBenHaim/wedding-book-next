import { describe, expect, it } from 'vitest'
import { planFollowUp, readFollowUpOffer } from '@/lib/salesAgent/followupStrategy'

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
    it('uses proof, the real site and one video preference for the first touch', () => {
        expect(planFollowUp({ stage: 'engaged' }, {
            attempt: 1,
            isFinal: false,
            customerName: 'נועה',
        })).toEqual({
            id: 'proof_site',
            objective: 'להמחיש במהירות איך ספר הברכות נראה ולהוביל לפרטים באתר',
            cta: 'website',
            landingUrl: 'https://weddingtales.co.il',
            mediaPreference: 'video',
            coupon: null,
            templateName: 'wt_followup_site',
            templateParameters: ['נועה'],
            templateText: 'נועה, רציתי לשלוח לך שוב דרך קצרה לראות איך ספר הברכות עובד. הסרטון והפרטים מחכים באתר: https://weddingtales.co.il',
        })
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
            templateName: 'wt_followup_help',
            templateParameters: ['משפחה יקרה'],
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
        expect(secondSite.templateName).toBe(firstSite.templateName)
        expect(secondSite.templateText).toBe(firstSite.templateText)

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
            templateName: 'wt_followup_offer',
            templateParameters: ['דנה', 'BACK48', '10.9.2026'],
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
                templateName: 'wt_followup_close',
                templateParameters: ['טל'],
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
