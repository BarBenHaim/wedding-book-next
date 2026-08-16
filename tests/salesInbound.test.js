import { describe, it, expect } from 'vitest'
import { parseInboundBody, MAX_BODY_CHARS } from '@/lib/salesAgent/inbound'

// The bug this file exists for: on 8 August a two-line message arrived,
// the literal newline broke the JSON body Make had hand-assembled, this
// endpoint returned 400, and a woman asking the price got silence. Every
// case below is a shape a real person can type into WhatsApp.

const good = {
    phone: '972544924495',
    text: 'שלום',
    profileName: 'נועה',
    source: 'whatsapp',
    from: '972544924495',
    to: '972500000000',
    businessPhone: '972500000000',
    field: 'messages',
}

// Exactly the template Make sends, with values interpolated unescaped.
const asMakeSendsIt = v => `{"phone":"${v.phone}","text":"${v.text}","profileName":"${v.profileName}","source":"${v.source}","from":"${v.from}","to":"${v.to}","businessPhone":"${v.businessPhone}","field":"${v.field}"}`

describe('valid JSON', () => {
    it('parses valid JSON without marking it repaired', () => {
        const r = parseInboundBody(JSON.stringify(good))
        expect(r.repaired).toBe(false)
        expect(r.body).toMatchObject(good)
        expect(r.body).toMatchObject({ messageType: 'text', referral: null })
    })

    it('keeps escaped newlines that arrived correctly escaped', () => {
        const r = parseInboundBody(JSON.stringify({ ...good, text: 'שורה\nשנייה' }))
        expect(r.repaired).toBe(false)
        expect(r.body.text).toBe('שורה\nשנייה')
    })

    it('keeps a complete WhatsApp referral and media identity', () => {
        const raw = JSON.stringify({
            eventId: 'wamid.abc', phone: 'test-phone-token', text: '', profileName: 'נועה',
            messageType: 'image', mediaId: '9988', occurredAt: '2026-08-14T09:00:00.000Z',
            conversationId: 'conv-1',
            referral: { sourceUrl: 'https://fb.me/ad', sourceId: '238', campaignId: '120', adsetId: '121', adId: '122' },
        })
        expect(parseInboundBody(raw).body).toMatchObject({
            eventId: 'wamid.abc', messageType: 'image', mediaId: '9988',
            referral: { campaignId: '120', adId: '122' },
        })
    })

    it('normalizes flat referral fields and unknown media types safely', () => {
        const raw = JSON.stringify({
            eventId: 'wamid.unknown', phone: 'test-phone-token', text: '',
            messageType: 'sticker', campaignId: '120', adId: '122', sourceUrl: 'https://fb.me/ad',
        })
        expect(parseInboundBody(raw).body).toMatchObject({
            messageType: 'document',
            referral: { campaignId: '120', adId: '122', sourceUrl: 'https://fb.me/ad' },
        })
    })

    it('treats non-empty text without media as text when Make reports a conflicting type', () => {
        const raw = JSON.stringify({
            eventId: 'wamid.conflicting-type', phone: 'test-phone-token',
            text: 'שלום! אפשר לקבל מידע נוסף על זה?', messageType: 'document', mediaId: '',
        })

        expect(parseInboundBody(raw).body).toMatchObject({
            text: 'שלום! אפשר לקבל מידע נוסף על זה?',
            messageType: 'text',
            mediaId: '',
        })
    })

    it('keeps a real media event as media when it also carries a caption', () => {
        const raw = JSON.stringify({
            eventId: 'wamid.real-document', phone: 'test-phone-token',
            text: 'הקובץ שביקשתם', messageType: 'document', mediaId: 'media-token',
        })

        expect(parseInboundBody(raw).body).toMatchObject({
            text: 'הקובץ שביקשתם',
            messageType: 'document',
            mediaId: 'media-token',
        })
    })
})

describe('the message that broke it', () => {
    // 27.8, newline, "how much does it cost".
    const text = '27.8\nכמה זה עולה'

    it('is rejected by JSON.parse', () => {
        expect(() => JSON.parse(asMakeSendsIt({ ...good, text }))).toThrow()
    })

    it('is recovered whole, newline included', () => {
        const r = parseInboundBody(asMakeSendsIt({ ...good, text }))
        expect(r.repaired).toBe(true)
        expect(r.body.text).toBe(text)
    })

    it('recovers every other field alongside it', () => {
        const r = parseInboundBody(asMakeSendsIt({ ...good, text }))
        expect(r.body).toMatchObject({ ...good, text, messageType: 'text' })
    })

    it('repairs Make raw JSON with the expanded ordered keys', () => {
        const raw = '{"eventId":"wamid.1","phone":"9725","text":"שורה 1\nשורה 2","profileName":"בר","messageType":"text","mediaId":"","occurredAt":"2026-08-14T09:00:00Z","conversationId":"c1"}'
        expect(parseInboundBody(raw).body).toMatchObject({ eventId: 'wamid.1', text: 'שורה 1\nשורה 2', messageType: 'text' })
    })
})

describe('the other ways a customer breaks JSON', () => {
    const cases = [
        ['a double quote', 'אמרו לי "מחיר טוב"'],
        ['a lone backslash', 'שלח לי C:\\תמונות'],
        ['a tab', 'שלום\tמה נשמע'],
        ['a carriage return and newline', 'שורה\r\nשנייה'],
        ['several newlines', 'היי\n\nרציתי לשאול\n\nכמה עולה'],
        ['a quote at the very end', 'זה מה שכתוב "'],
        ['something that looks like JSON', 'כתוב שם {"price": 950}'],
    ]

    for (const [label, text] of cases) {
        it(`recovers ${label}`, () => {
            const r = parseInboundBody(asMakeSendsIt({ ...good, text }))
            expect(r.repaired).toBe(true)
            expect(r.body.text).toBe(text)
            // The fields after `text` are the ones a bad slice would eat.
            expect(r.body.field).toBe('messages')
            expect(r.body.phone).toBe(good.phone)
        })
    }

    it('recovers a broken profile name too, not just the message', () => {
        // Emoji and quotes in a WhatsApp display name are ordinary.
        const r = parseInboundBody(asMakeSendsIt({ ...good, profileName: 'נועה "נוני" 💍' }))
        expect(r.body.profileName).toBe('נועה "נוני" 💍')
        expect(r.body.source).toBe('whatsapp')
    })
})

describe('escape handling', () => {
    it('turns a real escape sequence into its character', () => {
        const raw = '{"phone":"9725","text":"שורה\\nשנייה","field":"messages"}'
        // This one IS valid JSON, so it goes down the strict path.
        expect(parseInboundBody(raw).body.text).toBe('שורה\nשנייה')
    })

    it('does not touch a backslash in a body Make assembled by hand', () => {
        // Make escapes nothing, so this backslash is one the customer
        // typed. Translating it would edit their words.
        const r = parseInboundBody('{"phone":"9725","text":"50\\% הנחה\n","field":"messages"}')
        expect(r.repaired).toBe(true)
        expect(r.body.text).toBe('50\\% הנחה\n')
    })
})

describe('missing and odd fields', () => {
    it('treats a null profile name as absent rather than the word null', () => {
        const r = parseInboundBody('{"phone":"9725","text":"היי\nעוד שורה","profileName":null,"field":"messages"}')
        expect(r.body.profileName).toBe('')
    })

    it('works when only some fields are present', () => {
        const r = parseInboundBody('{"phone":"972544924495","text":"היי\nמה קורה"}')
        expect(r.body.phone).toBe('972544924495')
        expect(r.body.text).toBe('היי\nמה קורה')
        expect(r.body.profileName).toBe('')
    })

    it('preserves whitespace inside a quoted value', () => {
        const r = parseInboundBody('{"phone":"9725","text":"  היי  \nעוד","field":"messages"}')
        expect(r.body.text).toBe('  היי  \nעוד')
    })
})

describe('what still deserves a 400', () => {
    it('an empty body', () => {
        expect(parseInboundBody('').body).toBeNull()
        expect(parseInboundBody('   ').reason).toBe('empty')
    })

    it('a body with none of our fields in it', () => {
        const r = parseInboundBody('<html>gateway timeout</html>')
        expect(r.body).toBeNull()
        expect(r.reason).toBe('no-fields')
    })

    it('a body far too large to be a message', () => {
        const r = parseInboundBody(`{"text":"${'א'.repeat(MAX_BODY_CHARS)}"}`)
        expect(r.body).toBeNull()
        expect(r.reason).toBe('too-large')
    })

    it('a JSON array rather than an object', () => {
        // Valid JSON, wrong shape — must not be handed on as a body.
        expect(parseInboundBody('[1,2,3]').body).toBeNull()
    })

    it('a non-string input', () => {
        expect(parseInboundBody(null).body).toBeNull()
        expect(parseInboundBody({ text: 'היי' }).body).toBeNull()
    })
})
