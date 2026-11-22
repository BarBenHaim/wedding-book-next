import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { renderWelcomeEmail } from '@/lib/welcomeEmail'

const base = {
    baseUrl: 'https://app.weddingtales.co.il',
    name: 'דנה',
    email: 'dana@example.com',
    password: 'abc123xyz9',
    isNewUser: true,
    bookTitle: 'יואב',
    guestUrl: 'https://app.weddingtales.co.il/w/abcd',
    whatsappUrl: 'https://wa.me/?text=x',
    posterUrl: 'https://app.weddingtales.co.il/wedding/6301/portal?view=poster',
    loginUrl: 'https://app.weddingtales.co.il/login',
    viewerUrl: 'https://app.weddingtales.co.il/wedding/6301/book/tok',
    deposit: null,
}

describe('welcome e-mail', () => {
    it('names the book in the subject and the headline', () => {
        const m = renderWelcomeEmail(base)
        expect(m.subject).toContain('ספר הברכות של יואב')
        expect(m.html).toContain('ספר הברכות של יואב')
    })

    it('has a plain-text part with the links and the password', () => {
        const m = renderWelcomeEmail(base)
        expect(m.text).toContain(base.guestUrl)
        expect(m.text).toContain(base.posterUrl)
        expect(m.text).toContain('abc123xyz9')
    })

    it('links every action', () => {
        const { html } = renderWelcomeEmail(base)
        for (const u of [base.whatsappUrl, base.guestUrl, base.posterUrl, base.loginUrl, base.viewerUrl]) {
            expect(html).toContain(`href="${u}"`)
        }
    })

    it('shows the password only to a new user', () => {
        const fresh = renderWelcomeEmail(base)
        expect(fresh.html).toContain('abc123xyz9')
        const old = renderWelcomeEmail({ ...base, isNewUser: false, password: null })
        expect(old.html).not.toContain('abc123xyz9')
        expect(old.html).toContain('הסיסמה הקיימת')
        expect(old.text).not.toContain('null')
    })

    it('adds the deposit note only for a deposit order', () => {
        expect(renderWelcomeEmail(base).html).not.toContain('מקדמה')
        const dep = renderWelcomeEmail({ ...base, deposit: { balanceDue: 800 } })
        expect(dep.html).toContain('שילמתם מקדמה')
        expect(dep.html).toContain('800 ₪')
        expect(dep.text).toContain('800 ₪')
    })

    it('falls back when the event has no title and escapes what the buyer typed', () => {
        const plain = renderWelcomeEmail({ ...base, bookTitle: '' })
        expect(plain.subject).toContain('ספר הברכות שלכם')
        const m = renderWelcomeEmail({ ...base, bookTitle: '<b>x</b>', email: 'a<i>@x.com' })
        expect(m.html).not.toContain('<b>x</b>')
        expect(m.html).not.toContain('<i>')
        expect(m.html).toContain('&lt;b&gt;x&lt;/b&gt;')
    })

    it('points its pictures at the public /email folder', () => {
        const { html } = renderWelcomeEmail(base)
        expect(html).toContain('https://app.weddingtales.co.il/email/mail-guest.jpg')
    })
})

describe('createWedding uses the e-mail module', () => {
    const src = readFileSync('src/app/api/createWedding/route.js', 'utf8')
    it('sends the rendered html and the plain-text part', () => {
        expect(src).toContain('renderWelcomeEmail(')
        expect(src).toContain('html: mail.html')
        expect(src).toContain('text: mail.text')
    })
})
