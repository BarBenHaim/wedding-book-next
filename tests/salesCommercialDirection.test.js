import { describe, expect, it } from 'vitest'
import { COMMERCIAL_DIRECTION, requestsOfferOptions, selectOfferPresentation } from '@/lib/salesAgent/commercialDirection'
import { formatOfferQuote, getActiveOffer, validateOfferCatalog } from '@/lib/salesAgent/offerCatalog'
import { FIXTURE_NOW, syntheticCatalog, syntheticOffer } from './fixtures/salesContractFixtures'

const approvedInputs = (catalog = syntheticCatalog().catalog) => Object.fromEntries(
    ['printed', 'digital'].map(productId => [productId, getActiveOffer({ catalog, productId, nowMs: FIXTURE_NOW }).offer]),
)

describe('draft commercial direction stays outside the approved catalog', () => {
    it('records the hero, honest fallback and bounded design process without approving either offer', () => {
        expect(COMMERCIAL_DIRECTION).toMatchObject({
            status: 'draft', heroProductId: 'printed',
            products: {
                printed: { advertisedPrice: { amount: 990, currency: 'ILS' } },
                digital: { advertisedPrice: { amount: 690, currency: 'ILS' } },
            },
            process: { customerApprovalBeforePrint: true, includedConsolidatedRevisionRounds: 1, businessErrorCorrectionsFree: true },
            safeguards: { preserveExistingCustomerTerms: true, inferPurchaseConsent: false, allowDraftPriceFallback: false },
        })
        expect(COMMERCIAL_DIRECTION.products.printed.includes).toEqual(['digital_book', 'personal_design', 'hardcover_21x21_cm', 'one_printed_copy', 'shipping_as_advertised'])
        expect(validateOfferCatalog(COMMERCIAL_DIRECTION, { nowMs: FIXTURE_NOW }).ok).toBe(false)
        for (const product of Object.values(COMMERCIAL_DIRECTION.products)) {
            expect(formatOfferQuote(product, { nowMs: FIXTURE_NOW })).toBeNull()
            expect(product).not.toHaveProperty('approval')
            expect(product).not.toHaveProperty('checkoutUrl')
        }
    })

    it('keeps unresolved facts pending and deeply freezes the entire direction', () => {
        expect(COMMERCIAL_DIRECTION.pendingVerification).toEqual({
            pageLimit: null, additionalCopyPrice: null, productionDuration: null,
            deliveryDuration: null, finalCheckoutTotal: null, tax: null,
            shippingDestination: null, mediaRights: null, accessDuration: null,
            refundPolicy: null, cancellationPolicy: null, humanResponseSla: null,
        })
        const checkFrozen = value => {
            if (!value || typeof value !== 'object') return
            expect(Object.isFrozen(value)).toBe(true)
            Object.values(value).forEach(checkFrozen)
        }
        checkFrozen(COMMERCIAL_DIRECTION)
        expect(() => COMMERCIAL_DIRECTION.products.printed.includes.push('unlimited_printing')).toThrow()
    })

    it('cannot supply missing or unapproved catalog prices for any presentation', () => {
        for (const catalog of [undefined, {}, COMMERCIAL_DIRECTION, syntheticCatalog([syntheticOffer('printed', { approval: null })]).catalog]) {
            const inputs = Object.fromEntries(['printed', 'digital'].map(productId => [productId, getActiveOffer({ catalog, productId, nowMs: FIXTURE_NOW }).offer]))
            for (const text of ['כמה עולה?', 'יש גם דיגיטלי?', 'מה ההבדל בין החבילות?', 'יקר לי']) {
                expect(selectOfferPresentation({ ...inputs, text })).toEqual([])
            }
        }
    })
})

describe('approved offer presentation', () => {
    it.each(['', 'כמה עולה?', 'מה המחיר?', 'ספר לבר מצווה', 'How much does it cost?'])(
        'leads with one printed hero for %s', text => {
            const inputs = approvedInputs()
            expect(selectOfferPresentation({ ...inputs, text })).toEqual([inputs.printed])
        },
    )

    it.each(['יש גם דיגיטלי?', 'כמה עולה הדיגיטלי?', 'אפשר בלי הדפסה?', 'לא צריך ספר מודפס', 'יקר לי', 'המודפס יקר לי', 'יש משהו זול יותר?', 'My budget is limited', 'I only want digital', 'אני רוצה דיגיטלי במקום מודפס', 'I want digital instead of printed'])(
        'keeps the digital alternative available for %s', text => {
            const inputs = approvedInputs()
            expect(selectOfferPresentation({ ...inputs, text })).toEqual([inputs.digital])
        },
    )

    it.each(['איזה אפשרויות יש?', 'מה ההבדל בין החבילות?', 'מודפס או דיגיטלי?', 'כמה עולה דיגיטלי וכמה עולה מודפס?', 'כמה עולה מודפס וכמה עולה דיגיטלי?', 'אפשר לראות מודפס ודיגיטלי?', 'Compare the packages', 'What are your options?'])(
        'shows both approved offers in hero order for %s', text => {
            const inputs = approvedInputs()
            expect(selectOfferPresentation({ ...inputs, text })).toEqual([inputs.printed, inputs.digital])
        },
    )

    it('uses remembered digital interest only until the current turn requests printed or a comparison', () => {
        const inputs = { ...approvedInputs(), preferredProductId: 'digital' }
        expect(selectOfferPresentation({ ...inputs, text: 'כמה עולה?' })).toEqual([inputs.digital])
        expect(selectOfferPresentation({ ...inputs, text: 'בעצם אני רוצה את המודפס' })).toEqual([inputs.printed])
        expect(selectOfferPresentation({ ...inputs, text: 'מה המחיר של המודפס?' })).toEqual([inputs.printed])
        expect(selectOfferPresentation({ ...inputs, text: 'מה ההבדל בין החבילות?' })).toEqual([inputs.printed, inputs.digital])
    })

    it.each(['כמה עולה המודפס? התקציב שלי הוא אלף שקל', 'מה המחיר של המודפס? יש משהו זול יותר?', 'How much is the printed book? My budget is limited'])(
        'answers the specifically requested printed price before a budget fallback for %s', text => {
            const inputs = { ...approvedInputs(), preferredProductId: 'digital' }
            expect(selectOfferPresentation({ ...inputs, text })).toEqual([inputs.printed])
            expect(selectOfferPresentation({ digital: inputs.digital, text })).toEqual([])
        },
    )

    it('answers a direct digital price question despite a later printed reference', () => {
        const inputs = approvedInputs()
        expect(selectOfferPresentation({ ...inputs, text: 'כמה עולה הדיגיטלי? המודפס יקר לי' })).toEqual([inputs.digital])
    })

    it.each([
        'אני לא מעוניין בספר המודפס, יש דיגיטלי?',
        'אני לא מעוניינת בספר המודפס, יש דיגיטלי?',
        'אני לא מעוניין בספר מודפס, יש דיגיטלי?',
        'אני לא מעוניינת בספר מודפס, יש דיגיטלי?',
        'אני לא רוצה את הספר המודפס, יש דיגיטלי?',
        'אני לא צריכה ספר מודפס, יש דיגיטלי?',
    ])('respects printed rejection when the customer asks for digital: %s', text => {
        const inputs = { ...approvedInputs(), preferredProductId: 'printed' }
        expect(selectOfferPresentation({ ...inputs, text })).toEqual([inputs.digital])
        expect(selectOfferPresentation({ printed: inputs.printed, text })).toEqual([])
    })

    it.each([
        'אני לא מעוניין בספר הדיגיטלי, יש מודפס?',
        'אני לא מעוניינת בספר הדיגיטלי, יש מודפס?',
        'אני לא מעוניין בספר דיגיטלי, יש מודפס?',
        'אני לא מעוניינת בספר דיגיטלי, יש מודפס?',
        'אני לא רוצה את הספר הדיגיטלי, יש מודפס?',
        'אני לא צריכה ספר דיגיטלי, יש מודפס?',
    ])('respects digital rejection when the customer asks for printed: %s', text => {
        const inputs = { ...approvedInputs(), preferredProductId: 'digital' }
        expect(selectOfferPresentation({ ...inputs, text })).toEqual([inputs.printed])
        expect(selectOfferPresentation({ digital: inputs.digital, text })).toEqual([])
    })

    it('does not offer either product when both were rejected', () => {
        expect(selectOfferPresentation({ ...approvedInputs(), text: 'אני לא רוצה מודפס ולא דיגיטלי' })).toEqual([])
    })

    it.each(['כמה עולה בלי הדפסה?', 'מה המחיר ללא ספר מודפס?', 'אני לא צריך מודפס, כמה עולה?', 'אני לא צריכה את הספר המודפס, כמה עולה?'])(
        'prices the no-print alternative without quoting the rejected printed product for %s', text => {
            const inputs = { ...approvedInputs(), preferredProductId: 'printed' }
            expect(selectOfferPresentation({ ...inputs, text })).toEqual([inputs.digital])
            expect(selectOfferPresentation({ printed: inputs.printed, text })).toEqual([])
        },
    )

    it('preserves actual approved commercial data and object identity instead of copying draft prices', () => {
        const catalog = syntheticCatalog().catalog
        for (const offer of catalog.offers) offer.price.totalMinor = offer.price.subtotalMinor = offer.productId === 'printed' ? 109900 : 74900
        const inputs = approvedInputs(catalog)
        const before = JSON.stringify(inputs)
        const selected = selectOfferPresentation({ ...inputs, text: 'מה ההבדל בין החבילות?' })
        expect(selected[0]).toBe(inputs.printed)
        expect(selected[1]).toBe(inputs.digital)
        expect(selected.map(offer => offer.price.totalMinor)).toEqual([109900, 74900])
        expect(JSON.stringify(inputs)).toBe(before)
        expect(selected).not.toHaveProperty('purchaseConsent')
    })

    it('never substitutes a different product when the requested one is missing', () => {
        const { printed, digital } = approvedInputs()
        expect(selectOfferPresentation({ digital, text: 'כמה עולה?' })).toEqual([])
        expect(selectOfferPresentation({ printed, text: 'יש גם דיגיטלי?' })).toEqual([])
        expect(selectOfferPresentation({ printed, text: 'יקר לי' })).toEqual([])
        expect(selectOfferPresentation({ printed, text: 'איזה אפשרויות יש?' })).toEqual([printed])
        expect(selectOfferPresentation()).toEqual([])
    })
})

describe('offer requests remain separate from other questions and purchase consent', () => {
    it.each(['כמה זה עולה?', 'כמה?', 'מה המחיר?', 'יש גם דיגיטלי?', 'אפשר בלי הדפסה?', 'איזה אפשרויות יש?', 'מה ההבדל בין החבילות?', 'יש גם מודפס?', 'יקר לי', 'What are your options?', 'Is digital available?', 'How much does it cost?'])(
        'recognizes %s as an offer request', text => expect(requestsOfferOptions(text)).toBe(true),
    )

    it.each(['איך עובד הדיגיטלי?', 'איך האורחים שולחים ברכות?', 'מתי מגיע הספר?', 'כמה עולה המשלוח?', 'מה אפשרויות המשלוח?', 'אפשר לבטל את הדיגיטלי?', 'מה מדיניות הביטול?', 'יש החזר?', 'כמה עמודים כלולים במודפס?', 'מה מגבלת העמודים?', 'אפשר דוגמה של הספר?', 'תשלחי דמו', 'רוצה להזמין מודפס', 'רוצה מודפס', 'אפשר לשלם על דיגיטלי?', 'יקר אבל אני רוצה לקנות מודפס', 'יש לי קובץ מוכן, כמה עולה להדפיס?', 'כמה עולה הדפסה בלבד?', 'יש לי קובץ ורוצה רק להדפיס', 'How much for printing only?', 'I have a PDF, how much to print it?', 'I want to order printed', 'Can I buy digital?', 'כן', 'נשמע מעניין', '', null, 'How does digital work?', 'What is the delivery cost?', 'Can I see a sample?'])(
        'leaves %s to its own question or consent path', text => expect(requestsOfferOptions(text)).toBe(false),
    )
})
