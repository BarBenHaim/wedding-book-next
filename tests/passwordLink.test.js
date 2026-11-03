import { describe, expect, it } from 'vitest'
import {
    oobCodeFromLink,
    setPasswordUrl,
    passwordProblem,
    inCooldown,
    setPasswordEmail,
    authErrorMessage,
    isUserCancel,
    MIN_PASSWORD_LENGTH,
    LINK_COOLDOWN_MS,
} from '@/lib/passwordLink'
import he from '@/i18n/messages/he.json'
import en from '@/i18n/messages/en.json'
import es from '@/i18n/messages/es.json'
import it_ from '@/i18n/messages/it.json'

describe('choose-your-own-password links', () => {
    it('pulls the code out of a Firebase action link and points it at our page', () => {
        const link = 'https://wt.firebaseapp.com/__/auth/action?mode=resetPassword&oobCode=AbC-123_xyzQWERTY&apiKey=k&lang=en'
        expect(oobCodeFromLink(link)).toBe('AbC-123_xyzQWERTY')
        expect(oobCodeFromLink('https://x.com/?oobCode=<bad>')).toBe(null)
        expect(oobCodeFromLink('not a url')).toBe(null)
        expect(setPasswordUrl('https://app.weddingtales.co.il/', 'AbC-123')).toBe('https://app.weddingtales.co.il/set-password?code=AbC-123')
    })

    it('checks the password the customer picks', () => {
        expect(passwordProblem('12345')).toContain(String(MIN_PASSWORD_LENGTH))
        expect(passwordProblem('123456')).toBe(null)
        expect(passwordProblem('123456', '123457')).toBe('שתי הסיסמאות לא זהות')
        expect(passwordProblem('123456', '123456')).toBe(null)
        expect(passwordProblem('x'.repeat(200))).toBe('הסיסמה ארוכה מדי')
        expect(passwordProblem(undefined)).not.toBe(null)
    })

    it('sends at most one email a minute per address', () => {
        expect(inCooldown(1000, 1000 + LINK_COOLDOWN_MS - 1)).toBe(true)
        expect(inCooldown(1000, 1000 + LINK_COOLDOWN_MS)).toBe(false)
        expect(inCooldown(null, 5)).toBe(false)
    })

    it('writes the email, escaped, with the right intro', () => {
        const asked = setPasswordEmail({ email: 'a@b.co', url: 'https://app/set-password?code=x' })
        expect(asked.html).toContain('ביקשתם')
        expect(asked.html).toContain('https://app/set-password?code=x')
        const ours = setPasswordEmail({ email: 'a@b.co', url: 'u', sentByUs: true })
        expect(ours.html).toContain('שלחנו לכם')
        expect(ours.html).not.toContain('לא ביקשתם')
        expect(setPasswordEmail({ email: '<b>@x.co', url: 'u' }).html).not.toContain('<b>@')
    })

    it('speaks Hebrew for the errors people actually hit, and ignores a closed popup', () => {
        expect(authErrorMessage('auth/invalid-credential')).toContain('בחירת סיסמה')
        expect(authErrorMessage('auth/account-exists-with-different-credential')).toContain('רשום אצלנו עם סיסמה')
        expect(authErrorMessage('auth/operation-not-allowed')).toContain('Google')
        expect(authErrorMessage('something-new')).toBeTruthy()
        expect(isUserCancel('auth/popup-closed-by-user')).toBe(true)
        expect(isUserCancel('auth/invalid-credential')).toBe(false)
    })

    it('has the login and set-password copy in every language', () => {
        for (const m of [he, en, es, it_]) {
            for (const k of ['googleButton', 'or', 'forgotLink', 'resetTitle', 'resetSubmit', 'resetSent', 'backToLogin', 'noEvent']) expect(m.login[k]).toBeTruthy()
            expect(m.login.noEvent).toContain('{email}')
            for (const k of ['title', 'subtitle', 'passwordLabel', 'confirmLabel', 'submit', 'invalid', 'requestNew']) expect(m.setPassword[k]).toBeTruthy()
            expect(m.setPassword.subtitle).toContain('{email}')
        }
    })
})
