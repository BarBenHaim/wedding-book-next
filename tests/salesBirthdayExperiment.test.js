import { describe, expect, it } from 'vitest'
import birthdayExperiment, { BIRTHDAY_VARIABLE_KEYS, normalizeBirthdayExperiment } from '@/lib/salesAgent/birthdayExperiment'

const copy = {
    opening: '\u05d4\u05d9\u05d9\u0020\u{1f60a}\u0020\u05dc\u05de\u05d9\u0020\u05de\u05db\u05d9\u05e0\u05d9\u05dd\u0020\u05d0\u05ea\u0020\u05d4\u05de\u05ea\u05e0\u05d4\u0020\u05d5\u05de\u05ea\u05d9\u0020\u05d9\u05d5\u05dd\u0020\u05d4\u05d4\u05d5\u05dc\u05d3\u05ea\u003f',
    openingWithoutDate: '\u05d4\u05d9\u05d9\u0020\u{1f60a}\u0020\u05dc\u05de\u05d9\u0020\u05de\u05db\u05d9\u05e0\u05d9\u05dd\u0020\u05d0\u05ea\u0020\u05d4\u05de\u05ea\u05e0\u05d4\u003f',
    explainer: '\u05de\u05db\u05d9\u05e0\u05d9\u05dd\u0020\u05de\u05e8\u05d0\u05e9\u0020\u05de\u05ea\u05e0\u05d4\u0020\u05de\u05db\u05dc\u0020\u05d4\u05de\u05e9\u05e4\u05d7\u05d4\u0020\u05d5\u05d4\u05d7\u05d1\u05e8\u05d9\u05dd\u002e',
    prices: '\u0036\u0039\u0030\u0020\u20aa\u0020\u05d3\u05d9\u05d2\u05d9\u05d8\u05dc\u05d9\u002c\u0039\u0039\u0030\u0020\u20aa\u0020\u05de\u05d5\u05d3\u05e4\u05e1\u0020\u05db\u05d5\u05dc\u05dc\u0020\u05d3\u05d9\u05d2\u05d9\u05d8\u05dc\u05d9\u0020\u05d5\u05de\u05e9\u05dc\u05d5\u05d7\u002c\u05db\u05e8\u05d9\u05db\u05d4\u0020\u05e7\u05e9\u05d4\u0032\u0031\u00d7\u0032\u0031\u002e',
    timing: '\u05de\u05ea\u05d9\u0020\u05d4\u05d4\u05e4\u05ea\u05e2\u05d4\u003f\u0020\u05e0\u05d1\u05d3\u05d5\u05e7\u0020\u05d6\u05de\u05df\u0020\u05d4\u05e4\u05e7\u05d4\u0020\u05dc\u05e4\u05e0\u05d9\u0020\u05e9\u05de\u05ea\u05d7\u05d9\u05d9\u05d1\u05d9\u05dd\u0020\u05dc\u05ea\u05d0\u05e8\u05d9\u05da\u002e',
}

const text = {
    general: '\u05d0\u05e9\u05de\u05d7\u0020\u05dc\u05e4\u05e8\u05d8\u05d9\u05dd',
    adult: '\u05d0\u05e0\u05d7\u05e0\u05d5\u0020\u05de\u05db\u05d9\u05e0\u05d9\u05dd\u0020\u05dc\u05d0\u05de\u05d0\u0020\u05de\u05ea\u05e0\u05d4\u0020\u05dc\u05d9\u05d5\u05dd\u0020\u05d4\u05d5\u05dc\u05d3\u05ea\u0020\u0036\u0030',
    ageOnly: '\u05d0\u05e0\u05d7\u05e0\u05d5\u0020\u05de\u05d7\u05e4\u05e9\u05d9\u05dd\u0020\u05de\u05ea\u05e0\u05d4\u0020\u05dc\u05d2\u05d9\u05dc\u0020\u0036\u0030',
    wedding: '\u05d6\u05d4\u0020\u05dc\u05d7\u05ea\u05d5\u05e0\u05d4',
    barMitzvah: '\u05d6\u05d4\u0020\u05dc\u05d1\u05e8\u0020\u05de\u05e6\u05d5\u05d5\u05d4',
    child: '\u05de\u05d7\u05e4\u05e9\u05ea\u0020\u05de\u05ea\u05e0\u05d4\u0020\u05dc\u05d9\u05d5\u05dd\u0020\u05d4\u05d5\u05dc\u05d3\u05ea\u0020\u0037\u0020\u05e9\u05dc\u0020\u05d4\u05d1\u05df\u0020\u05e9\u05dc\u05d9',
    price: '\u05db\u05de\u05d4\u0020\u05e2\u05d5\u05dc\u05d4\u003f',
    duration: '\u05db\u05de\u05d4\u0020\u05d6\u05de\u05df\u0020\u05dc\u05d5\u05e7\u05d7\u003f',
    whenArrives: '\u05de\u05ea\u05d9\u0020\u05de\u05d2\u05d9\u05e2\u003f',
    mixedPriceAndTiming: '\u05db\u05de\u05d4\u0020\u05e2\u05d5\u05dc\u05d4\u0020\u05d5\u05de\u05ea\u05d9\u0020\u05de\u05d2\u05d9\u05e2\u003f',
    explainer: '\u05d0\u05d9\u05da\u0020\u05d6\u05d4\u0020\u05e2\u05d5\u05d1\u05d3\u003f',
    timing: '\u05d6\u05d5\u0020\u05d4\u05e4\u05ea\u05e2\u05d4\u0020\u05dc\u002d\u0032\u0030\u002e\u0031\u0031\u002c\u0020\u05d9\u05e9\u0020\u05d6\u05de\u05df\u003f',
}

const publishedVersions = {
    opening: 'opening-v1',
    explainer: 'explainer-v1',
    prices: 'prices-v1',
    timing: 'timing-v1',
}

const activeExperiment = {
    enabled: true,
    weight: 100,
    sourceAllowlist: ['meta-source-123'],
    variables: BIRTHDAY_VARIABLE_KEYS,
    variableVersions: publishedVersions,
}

const verifiedProvider = {
    providerChannel: 'meta_whatsapp',
    providerAccountId: 'business-account-1',
    providerMessageId: 'provider-message-1',
}

const eligible = input => birthdayExperiment.resolveEligibility?.({
    experiment: activeExperiment,
    lead: { isNew: true, hasPriorConversation: false },
    provider: verifiedProvider,
    ...input,
})

const variables = {
    'birthday_gift_opening_v1:opening-v1': { id: 'opening-v1', kind: 'text', status: 'published', value: copy.opening },
    'birthday_gift_explainer_v1:explainer-v1': { id: 'explainer-v1', kind: 'text', status: 'published', value: copy.explainer },
    'birthday_gift_prices_v1:prices-v1': { id: 'prices-v1', kind: 'text', status: 'published', value: copy.prices },
    'birthday_gift_timing_v1:timing-v1': { id: 'timing-v1', kind: 'text', status: 'published', value: copy.timing },
}

const runtime = input => birthdayExperiment.prepareRuntime?.({
    experiment: activeExperiment,
    provider: verifiedProvider,
    variableVersions: variables,
    ...input,
})

describe('birthday gift experiment configuration', () => {
    it('requires a published version for every copy slot before the birthday experiment can be enabled', () => {
        expect(() => normalizeBirthdayExperiment({
            enabled: true,
            weight: 100,
            sourceAllowlist: ['meta-source-123'],
            variables: BIRTHDAY_VARIABLE_KEYS,
        })).toThrow('BIRTHDAY_VARIABLE_VERSION_REQUIRED')
    })

    it('pins each published birthday copy slot independently', () => {
        expect(normalizeBirthdayExperiment({
            enabled: true,
            weight: 100,
            sourceAllowlist: ['meta-source-123'],
            variables: BIRTHDAY_VARIABLE_KEYS,
            variableVersions: publishedVersions,
        })).toMatchObject({ variableVersions: publishedVersions })
    })

    it('does not route an arbitrary inbound referral source id before a provenance boundary exists', () => {
        expect(eligible({ inbound: { text: text.general, referral: { source_id: 'meta-source-123' } } }))
            .toEqual({ eligible: false, reason: 'unverified-referral-disabled' })
        expect(eligible({ inbound: { text: text.general, referral: { source_id: 'lookalike-source' } } }))
            .toEqual({ eligible: false, reason: 'unverified-referral-disabled' })
    })

    it('routes explicit adult birthday wording but not an age alone', () => {
        expect(eligible({ inbound: { text: text.adult } }))
            .toEqual({ eligible: true, reason: 'explicit-adult-birthday' })
        expect(eligible({ inbound: { text: text.ageOnly } }))
            .toEqual({ eligible: false, reason: 'birthday-not-explicit' })
    })

    it('keeps explicit weddings and bar mitzvahs out of the birthday route even with an allowlisted referral', () => {
        expect(eligible({ inbound: { text: text.wedding, referral: { source_id: 'meta-source-123' } } }))
            .toEqual({ eligible: false, reason: 'event-override' })
        expect(eligible({ inbound: { text: text.barMitzvah, referral: { source_id: 'meta-source-123' } } }))
            .toEqual({ eligible: false, reason: 'event-override' })
    })

    it.each([
        ['opted-out lead', { optedOut: true }],
        ['human-owned lead', { human: true }],
        ['paid lead', { paymentVerified: true }],
        ['callback lead', { callbackPromised: '2026-10-20' }],
    ])('never starts the birthday opening for a %s', (_label, lead) => {
        expect(eligible({
            lead: { isNew: true, hasPriorConversation: false, ...lead },
            inbound: { text: text.adult },
        })).toEqual({ eligible: false, reason: 'birthday-safety-guard' })
    })

    it('keeps a child birthday out of the adult birthday route', () => {
        expect(eligible({ inbound: { text: text.child, referral: { source_id: 'meta-source-123' } } }))
            .toEqual({ eligible: false, reason: 'birthday-minor' })
    })

    it('keeps the current path when the birthday experiment is disabled or weight-zero', () => {
        expect(eligible({
            experiment: { ...activeExperiment, enabled: false, weight: 0 },
            inbound: { text: text.adult },
        })).toEqual({ eligible: false, reason: 'birthday-experiment-stopped' })
    })

    it('sends the birthday opening once and pins the four published copy versions before waiting', () => {
        const prepared = runtime({
            lead: { isNew: true, hasPriorConversation: false },
            inbound: { text: text.adult },
        })

        expect(prepared).toMatchObject({
            eligible: true,
            enrollment: { flow: { id: 'birthday_gift', revision: 1, variableVersions: publishedVersions } },
            state: { opened: true },
            result: {
                action: 'wait',
                responseSlot: 'opening',
                parts: [expect.objectContaining({ kind: 'text', text: copy.opening })],
            },
        })
    })

    it('uses the known-date opening template even if the editable opening copy changes', () => {
        const prepared = runtime({
            lead: { isNew: true, hasPriorConversation: false, eventDate: '2027-06-15' },
            inbound: { text: text.adult },
            variableVersions: {
                ...variables,
                'birthday_gift_opening_v1:opening-v1': {
                    ...variables['birthday_gift_opening_v1:opening-v1'],
                    value: 'changed copy that still asks for a date',
                },
            },
        })

        expect(prepared.result.parts).toEqual([
            expect.objectContaining({ kind: 'text', text: copy.openingWithoutDate }),
        ])
    })

    it.each([
        [text.duration, 'timing', copy.timing],
        [text.price, 'prices', copy.prices],
        [text.whenArrives, 'timing', copy.timing],
        [text.mixedPriceAndTiming, 'prices', copy.prices],
    ])('answers a first eligible birthday inquiry about %s with the relevant safe copy', (inboundText, responseSlot, expectedText) => {
        const prepared = runtime({
            lead: { isNew: true, hasPriorConversation: false },
            inbound: { text: text.adult + ' ' + inboundText },
        })

        expect(prepared.result.parts).toEqual([
            expect.objectContaining({ kind: 'text', text: expectedText }),
        ])
        expect(prepared.result.responseSlot).toBe(responseSlot)
    })

    it.each([
        [text.price, 'prices', copy.prices],
        [text.explainer, 'explainer', copy.explainer],
        [text.timing, 'timing', copy.timing],
    ])('uses the pinned reply slot without sending the opening again', (inboundText, responseSlot, expectedText) => {
        const prepared = runtime({
            lead: {
                isNew: false,
                birthdayGiftFlow: { id: 'birthday_gift', revision: 1, variables: BIRTHDAY_VARIABLE_KEYS, variableVersions: publishedVersions },
                birthdayGiftState: { opened: true },
            },
            inbound: { text: inboundText },
        })

        expect(prepared).toMatchObject({
            eligible: true,
            enrollment: null,
            result: { action: 'wait', responseSlot, parts: [expect.objectContaining({ text: expectedText })] },
        })
        expect(prepared.result.parts.map(part => part.text)).not.toContain(copy.opening)
    })
})
