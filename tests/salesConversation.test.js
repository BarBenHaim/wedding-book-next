import { describe, it, expect } from 'vitest'
import { CONVERSATION_CRAFT, readStyle, styleNote } from '@/lib/salesAgent/conversation'

const user = text => ({ role: 'user', text })
const bot = text => ({ role: 'assistant', text })

describe('the craft guide', () => {
    it('names the only metric that matters', () => {
        expect(CONVERSATION_CRAFT).toMatch(/מזמינה תשובה/)
    })

    it('prefers open questions and says why', () => {
        expect(CONVERSATION_CRAFT).toMatch(/שאלה פתוחה/)
        expect(CONVERSATION_CRAFT).toMatch(/שאלה סגורה/)
    })

    it('covers the four moments a sales bot usually fumbles', () => {
        for (const moment of ['כמה עולה?', 'מילה אחת', 'אני אחשוב', 'משהו אישי']) {
            expect(CONVERSATION_CRAFT, moment).toContain(moment)
        }
    })

    it('tells it to answer before asking back', () => {
        // The single most common way an agent reads as evasive.
        expect(CONVERSATION_CRAFT).toMatch(/קודם תענה/)
    })
})

describe('readStyle', () => {
    it('needs more than one message before deciding anything', () => {
        // One message is not a style, and mirroring a greeting produces
        // a bot that says "היי" and nothing else.
        expect(readStyle([user('היי')])).toBeNull()
        expect(readStyle([])).toBeNull()
        expect(readStyle(null)).toBeNull()
    })

    it('ignores what the bot itself wrote', () => {
        const turns = [user('היי'), bot('שלום! נעים מאוד, אני שמח שפנית אלינו היום'), user('כמה')]
        expect(readStyle(turns).length).toBe('short')
    })

    it('reads a short writer as short', () => {
        const s = readStyle([user('כמה עולה'), user('ומה כולל'), user('אוקיי')])
        expect(s.length).toBe('short')
    })

    it('reads a long writer as long', () => {
        const long = 'היי, אנחנו מתחתנים בספטמבר ורצינו משהו שיישאר אחרי האירוע, ראינו את זה אצל חברים ומאוד אהבנו את הרעיון של ספר עם ברכות ותמונות'
        const s = readStyle([user(long), user(long)])
        expect(s.length).toBe('long')
    })

    it('averages rather than following the last message', () => {
        // A short writer having one long moment is still a short writer.
        const s = readStyle([user('כמה'), user('ומתי'), user('אוקיי'), user('תודה'),
            user('אה רגע רציתי לשאול גם אם אפשר להוסיף ברכות אחרי האירוע עצמו כי חלק מהאורחים בטוח ישכחו ביום עצמו')])
        expect(s.length).toBe('short')
    })

    it('notices emoji, and notices their absence', () => {
        expect(readStyle([user('היי 😊'), user('נשמע מעולה')]).usesEmoji).toBe(true)
        expect(readStyle([user('היי'), user('נשמע מעולה')]).usesEmoji).toBe(false)
    })

    it('separates a casual writer from a formal one', () => {
        expect(readStyle([user('היי מה קורה'), user('אחלה')]).register).toBe('casual')
        expect(readStyle([user('שלום רב'), user('אשמח לדעת מה המחיר')]).register).toBe('formal')
        expect(readStyle([user('מה המחיר'), user('ומה כולל')]).register).toBe('neutral')
    })

    it('spots someone who mostly asks rather than tells', () => {
        expect(readStyle([user('כמה עולה?'), user('ומה כולל?'), user('יש הנחה?')]).asksQuestions).toBe(true)
        expect(readStyle([user('מתחתנים בספטמבר'), user('רוצים ספר')]).asksQuestions).toBe(false)
    })
})

describe('styleNote', () => {
    it('says nothing when there is nothing to say', () => {
        // An empty section beats a paragraph of hedged non-instructions.
        expect(styleNote(null)).toBeNull()
    })

    it('tells it to keep up with a short writer', () => {
        const note = styleNote(readStyle([user('כמה'), user('ומתי')]))
        expect(note).toMatch(/קצר/)
    })

    it('forbids emoji when the customer uses none', () => {
        const note = styleNote(readStyle([user('היי'), user('כמה זה עולה')]))
        expect(note).toMatch(/לא משתמש באימוג/)
    })

    it('permits one when the customer uses them', () => {
        const note = styleNote(readStyle([user('היי 🙂'), user('נשמע טוב')]))
        expect(note).toMatch(/אחד מתאים/)
    })

    it('stays quiet about register when the customer is neutral', () => {
        const note = styleNote(readStyle([user('מה המחיר'), user('ומה כולל')]))
        expect(note).not.toMatch(/רשמית/)
        expect(note).not.toMatch(/גובה העיניים/)
    })
})
