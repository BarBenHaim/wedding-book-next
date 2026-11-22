import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import {
    signEnterToken,
    verifyEnterToken,
    enterUrl,
    enterSecret,
    enterLinkEmail,
    ENTER_TTL_MS,
    LOGIN_LINK_TTL_MS,
} from '@/lib/enterLink'

const secret = 'test-secret-123'
const now = 1_700_000_000_000

describe('enter token', () => {
    it('round-trips an account id', () => {
        const t = signEnterToken('uid-1', { secret, now })
        expect(verifyEnterToken(t, { secret, now: now + 1000 })).toEqual({ ok: true, uid: 'uid-1' })
    })

    it('expires', () => {
        const t = signEnterToken('uid-1', { secret, now, ttlMs: LOGIN_LINK_TTL_MS })
        expect(verifyEnterToken(t, { secret, now: now + LOGIN_LINK_TTL_MS + 1 })).toEqual({ ok: false, reason: 'expired' })
        expect(verifyEnterToken(t, { secret, now: now + LOGIN_LINK_TTL_MS - 1 }).ok).toBe(true)
    })

    it('the first-email link lives a month', () => {
        const t = signEnterToken('uid-1', { secret, now })
        expect(verifyEnterToken(t, { secret, now: now + ENTER_TTL_MS - 1 }).ok).toBe(true)
        expect(verifyEnterToken(t, { secret, now: now + ENTER_TTL_MS + 1 }).reason).toBe('expired')
    })

    it('rejects another secret and a tampered body', () => {
        const t = signEnterToken('uid-1', { secret, now })
        expect(verifyEnterToken(t, { secret: 'other', now }).reason).toBe('bad-signature')
        const [body, sig] = t.split('.')
        const forged = Buffer.from(JSON.stringify({ u: 'uid-2', e: now + 1e9 })).toString('base64url')
        expect(verifyEnterToken(`${forged}.${sig}`, { secret, now }).reason).toBe('bad-signature')
        expect(verifyEnterToken(`${body}.`, { secret, now }).reason).toBe('malformed')
    })

    it('rejects junk', () => {
        for (const bad of ['', 'abc', 'a.b.c', null, undefined, 42, 'x'.repeat(700)]) {
            expect(verifyEnterToken(bad, { secret, now }).ok).toBe(false)
        }
    })

    it('signs nothing without a secret or an account', () => {
        expect(signEnterToken('uid-1', { secret: '' })).toBe('')
        expect(signEnterToken('', { secret })).toBe('')
        expect(verifyEnterToken('a.b', { secret: '' }).reason).toBe('no-secret')
    })

    it('reads the secret from the environment, with a fallback', () => {
        expect(enterSecret({ ENTER_LINK_SECRET: 'a', WC_WEBHOOK_SECRET: 'b' })).toBe('a')
        expect(enterSecret({ WC_WEBHOOK_SECRET: 'b' })).toBe('b')
        expect(enterSecret({})).toBe('')
    })
})

describe('enter url and e-mail', () => {
    it('builds the /enter link without a doubled slash', () => {
        expect(enterUrl('https://app.weddingtales.co.il/', 'a.b')).toBe('https://app.weddingtales.co.il/enter?t=a.b')
    })

    it('the login-page e-mail has one button and a plain-text part', () => {
        const m = enterLinkEmail({ email: 'dana@example.com', url: 'https://x.test/enter?t=1' })
        expect(m.html).toContain('href="https://x.test/enter?t=1"')
        expect(m.text).toContain('https://x.test/enter?t=1')
        expect(m.subject).toContain('Wedding Tales')
    })

    it('escapes the address', () => {
        const m = enterLinkEmail({ email: 'a<i>@x.com', url: 'https://x.test/e' })
        expect(m.html).not.toContain('<i>')
    })
})

describe('wiring', () => {
    it('the first e-mail links the owner in with a signed link', () => {
        const src = readFileSync('src/app/api/createWedding/route.js', 'utf8')
        expect(src).toContain('signEnterToken(userRecord.uid')
        expect(src).toContain('enterUrl(baseUrl, enterToken)')
    })

    it('the login page offers the link by e-mail, and /enter exists', () => {
        expect(readFileSync('src/app/login/page.js', 'utf8')).toContain('/api/auth/enter-link')
        expect(readFileSync('src/app/enter/page.js', 'utf8')).toContain('signInWithCustomToken')
    })
})
