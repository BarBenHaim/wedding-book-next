import { describe, it, expect } from 'vitest'
import { decideSalesTurn, enforceSalesReply } from '@/lib/salesAgent/decisionPolicy'
import { buildSystemPrompt } from '@/lib/salesAgent/prompt'
const lead = { isNew: false, stage: 'engaged', eventType: 'birthday', turns: [] }
const stale = { messages: ['לא ניתן לקבל דפים לפני אישור כל העיצוב.'], stage: 'ready_to_pay', packageInterest: 'printed', image: 'book_open_spread', handoff: false }
function reply(text, previous, parsed = stale) {
    const context = { ...lead, turns: previous ? [{ role: 'assistant', text: previous }] : [] }
    const decision = decideSalesTurn({ lead: context, incomingText: text, todayISO: '2026-10-04' })
    return { decision, result: enforceSalesReply({ lead: context, incomingText: text, decision, parsed }) }
}
function expectClarification({ decision, result }) {
    expect(decision.nextBestAction).toBe('clarify_translation_target')
    expect(result.messages).toEqual(['לאיזה טקסט התכוונתם, למשל ההוראות לאורחים או תוכן הספר?'])
    expect(result.stage).toBe('engaged')
    expect(result.packageInterest).toBeNull()
    expect(result.image).toBeNull()
    expect(result.messages.join(' ')).not.toMatch(/checkout|אישור|נעצב|נתרגם/)
}
describe('support and translation context without invented capability', () => {
    it.each(['באנגלית', 'אני רוצה באנגלית', 'התכוונתי לרוסית', 'התכוונתי לגרסה באנגלית'])('clarifies a language-only correction: %s', text => expectClarification(reply(text)))
    it.each(['איזה קטע מיועד לתרגום?', 'האם יש טקסט מסוים שדורש תרגום?', 'מה אתם רוצים לתרגם?'])('a yes still lacks a target after %s', previous => expectClarification(reply('כן', previous)))
    it('a second yes does not fabricate a target or repeat an unrelated refusal', () => expectClarification(reply('כן', 'לאיזה טקסט התכוונתם, למשל ההוראות לאורחים או תוכן הספר?')))
    it('the supplied target remains unresolved until a person verifies the service', () => {
        const { result } = reply('את כל הברכות שכבר נכתבו', 'לאיזה טקסט התכוונתם, למשל ההוראות לאורחים או תוכן הספר?')
        expect(result.handoff).toBe(true)
        expect(result.stage).toBe('handoff')
        expect(result.messages.join(' ')).toContain('בדיקה של הצוות')
    })
    it.each(['אתם יכולים לתרגם את הברכות?', 'אתם מתרגמים את הברכות לאנגלית?', 'אני רוצה לתרגם את הספר לאנגלית'])('does not assume a translation service exists: %s', text => {
        const { result } = reply(text)
        expect(result.handoff).toBe(true)
        expect(result.messages.join(' ')).not.toMatch(/נתרגם|נעצב/)
    })
    it.each(['את הברכות', 'את הברכות.', 'כן, את הברכות', 'את כל הברכות'])('recognizes a real target with natural punctuation: %s', text => {
        expect(reply(text, 'איזה קטע מיועד לתרגום?').result.handoff).toBe(true)
    })
    it('respects a new deferral rather than interpreting it as a translation target', () => {
        const { decision, result } = reply('נתקדם בהמשך', 'לאיזה טקסט התכוונתם, למשל ההוראות לאורחים או תוכן הספר?')
        expect(decision.nextBestAction).toBe('respect_timing')
        expect(result.customerDeferred).toBe(true)
        expect(result.handoff).toBe(false)
    })
    it('does not swallow a new price question as a translation target', () => {
        expect(reply('כמה עולה ספר דיגיטלי?', 'איזה קטע מיועד לתרגום?').decision.intent).toBe('price')
    })
    it('does not confuse the word example with a missing-target question', () => {
        expect(reply('כן', 'רוצים לראות דוגמה לתרגום?').decision.nextBestAction).toBe('show_proof')
    })
    it('does not hijack a yes to an offered example', () => {
        expect(reply('כן', 'רוצים לראות דוגמה?').decision.nextBestAction).toBe('show_proof')
    })
    it('does not turn an English input-capability question into a language correction', () => {
        expect(reply('האורחים יכולים לכתוב ברכה באנגלית?').decision.intent).toBe('general')
    })
    it('an already supplied translation target does not trigger the missing-target question', () => {
        expect(reply('כן', 'רוצה שאבדוק עם הצוות אם אפשר לתרגם את הכותרת?').decision.nextBestAction).not.toBe('clarify_translation_target')
    })
    it('marks saved summaries as unverified context, including old promises', () => {
        const prompt = buildSystemPrompt({ ...lead, notes: 'הובטחה עזרה בתרגום הספר.' }, '2026-10-04')
        expect(prompt).toContain('סיכום היסטורי לעזר בלבד')
        expect(prompt).toContain('בקשת הלקוח האחרונה גוברת עליו')
        expect(prompt).not.toContain('מה שכבר למדנו עליו:')
    })
})
