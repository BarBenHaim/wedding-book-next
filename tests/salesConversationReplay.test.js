import { describe, expect, it } from 'vitest'
import { decideSalesTurn, enforceSalesReply } from '@/lib/salesAgent/decisionPolicy'
import { SALES_CONVERSATION_PATTERNS } from './fixtures/salesConversationPatterns'

const PHONE_CALL_LANGUAGE = /(שיחת\s+טלפון|בטלפון|אתקשר|להתקשר|אחזור\s+אליך)/

describe('privacy-safe replay of observed WhatsApp failure patterns', () => {
    it.each(SALES_CONVERSATION_PATTERNS)('$id follows the learned sales contract', fixture => {
        const decision = decideSalesTurn({
            lead: fixture.lead,
            incomingText: fixture.incomingText,
            isExistingCustomer: fixture.isExistingCustomer === true,
        })
        const enforced = enforceSalesReply({
            parsed: fixture.parsed,
            decision,
            lead: fixture.lead,
            incomingText: fixture.incomingText,
        })

        expect(decision).toMatchObject({
            intent: fixture.expected.intent,
            nextBestAction: fixture.expected.nextBestAction,
            maxMessages: 1,
            maxChars: 180,
            maxQuestions: 1,
        })
        expect(enforced).toMatchObject({
            stage: fixture.expected.stage,
            handoff: fixture.expected.handoff,
            ...(fixture.expected.noReply === true ? { noReply: true } : {}),
        })
        expect(enforced.messages.length).toBeLessThanOrEqual(1)
        for (const message of enforced.messages) {
            expect(message.length).toBeLessThanOrEqual(180)
            expect((message.match(/\?/g) || []).length).toBeLessThanOrEqual(1)
            expect(message).not.toMatch(PHONE_CALL_LANGUAGE)
        }

        if (fixture.lead.eventType) expect(enforced.messages.join(' ')).not.toMatch(/איזה אירוע|לאיזה אירוע/)
        if (fixture.lead.eventDate) expect(enforced.messages.join(' ')).not.toMatch(/מתי האירוע|תאריך האירוע/)
        if (fixture.expected.noReply) expect(enforced.messages).toEqual([])
    })

    it('keeps the replay corpus synthetic and non-dialable', () => {
        const serialized = JSON.stringify(SALES_CONVERSATION_PATTERNS)
        expect(serialized).not.toMatch(/\d{5,}/)
        const urls = serialized.match(/https?:\\?\/\\?\/[^"\s]+/g) || []
        expect(urls.every(url => url.includes('example.invalid'))).toBe(true)
    })
})
