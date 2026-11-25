import { describe, expect, it } from 'vitest'
import { acceptsSamplePhoto, mitzvahKind, offerText, samplePhotoAck, shouldOfferSample } from '@/lib/salesAgent/designSamplesCore'

const DAY = 86_400_000
const NOW = Date.parse('2026-12-01T10:00:00Z')

describe('what the lead themselves wrote', () => {
    it.each([
        'בר מצווה', 'יש לנו בר-מצוה בפברואר', 'לבר מצווה של הבן שלי', 'הברמצווה בקרוב', 'ובר מצווה', 'bar mitzvah',
    ])('reads a bar mitzvah in "%s"', text => {
        expect(mitzvahKind([text])).toBe('bar')
    })

    it.each(['בת מצווה', 'לבת מצוה של הבת', 'bat mitzva'])('reads a bat mitzvah in "%s"', text => {
        expect(mitzvahKind([text])).toBe('bat')
    })

    it('knows when both were named', () => {
        expect(mitzvahKind(['בר מצווה', 'וגם בת מצווה'])).toBe('both')
    })

    it.each(['חתונה בקיץ', 'בשבת מצווה לבוא', 'הבר פתוח', 'מצווה גדולה', ''])('reads nothing in "%s"', text => {
        expect(mitzvahKind([text])).toBeNull()
    })
})

describe('the fixed offer', () => {
    it.each([['bar', 'הבן שלכם', 'בשבילו'], ['bat', 'הבת שלכם', 'בשבילה'], ['both', 'הילד שלכם', 'במיוחד']])('speaks of the right child (%s)', (kind, child, tail) => {
        const text = offerText(kind)

        expect(text).toContain(child)
        expect(text).toContain(tail)
        expect(text).toContain('ללא עלות')
        expect(text).toContain('תעובד בשירות עיצוב חיצוני')
        expect(text).toContain('30 יום')
        expect(text).not.toContain('?')
    })

    it('acknowledges a photo without promising a time', () => {
        expect(samplePhotoAck('bar')).toContain('קיבלתי את התמונה')
        expect(samplePhotoAck('bat')).toContain('שלה')
        expect(`${samplePhotoAck('bar')} ${samplePhotoAck('bat')}`).not.toMatch(/היום|מחר|דקות|שעות|בקרוב/)
    })
})

describe('when to offer', () => {
    const base = () => ({
        settings: { enabled: true, testPhones: [] },
        phone: '972500000001',
        mode: 'full_sales',
        lead: { isNew: false, stage: 'engaged', turns: [{ role: 'user', text: 'זה לבר מצווה' }, { role: 'assistant', text: 'מעולה' }] },
        incomingText: 'איך זה עובד',
        reply: { messages: ['ככה זה עובד.'], handoff: false, noReply: false, stage: 'engaged' },
        decision: { intent: 'general', nextBestAction: 'answer_then_qualify' },
    })
    const offered = change => {
        const input = base()
        change(input)
        return shouldOfferSample(input)
    }

    it('offers to an engaged lead who spoke of a bar mitzvah', () => {
        expect(shouldOfferSample(base())).toBe('bar')
    })

    it('hears it in the message that just arrived too', () => {
        expect(offered(i => { i.lead.turns[0].text = 'שלום'; i.incomingText = 'זה לבת מצווה' })).toBe('bat')
    })

    it('stays off unless switched on, except for a test phone', () => {
        expect(offered(i => { i.settings.enabled = false })).toBeNull()
        expect(offered(i => { i.settings = { enabled: false, testPhones: ['972500000001'] } })).toBe('bar')
    })

    it.each([
        ['the bot is not in full sales', i => { i.mode = 'opening_only' }],
        ['it was offered once already', i => { i.lead.designSample = { status: 'offered' } }],
        ['this is the first message', i => { i.lead = { isNew: true, stage: 'new', turns: [] } ; i.incomingText = 'בר מצווה' }],
        ['we have not answered yet', i => { i.lead.turns = [{ role: 'user', text: 'בר מצווה' }] }],
        ['only our own words named it', i => { i.lead.turns = [{ role: 'user', text: 'שלום' }, { role: 'assistant', text: 'בר מצווה?' }] }],
        ['the reply hands over', i => { i.reply.handoff = true }],
        ['nothing is being sent', i => { i.reply.noReply = true }],
        ['the reply is empty', i => { i.reply.messages = [] }],
        ['the lead asked to wait', i => { i.reply.customerDeferred = true }],
        ['the lead is about to pay', i => { i.reply.stage = 'ready_to_pay' }],
        ['the chat is closed', i => { i.lead.stage = 'closed_lost' }],
        ['they asked the price', i => { i.decision = { intent: 'price', nextBestAction: 'quote_price' } }],
        ['it is an objection', i => { i.decision = { intent: 'objection', nextBestAction: 'handle_objection' } }],
        ['a payment link goes out', i => { i.decision = { intent: 'general', nextBestAction: 'send_payment_link' } }],
    ])('does not offer when %s', (_, change) => {
        expect(offered(change)).toBeNull()
    })
})

describe('which photo is an invited one', () => {
    const lead = (status, offeredAt = NOW - DAY) => ({ designSample: { status, offeredAt } })

    it.each(['offered', 'received'])('takes a picture while the offer is %s', status => {
        expect(acceptsSamplePhoto({ lead: lead(status), messageType: 'image', nowMs: NOW })).toBe(true)
    })

    it.each([
        ['no offer', {}, 'image'],
        ['a document', lead('offered'), 'document'],
        ['an offer two weeks old', lead('offered', NOW - 15 * DAY), 'image'],
        ['a sample already sent', lead('sent'), 'image'],
    ])('leaves %s to the usual handling', (_, who, messageType) => {
        expect(acceptsSamplePhoto({ lead: who, messageType, nowMs: NOW })).toBe(false)
    })
})
