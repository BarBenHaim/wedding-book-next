import { describe, expect, it } from 'vitest'
import {
    normalizeOwnerEmail,
    transferProblem,
    isSameOwner,
    previousOwnerRecord,
    eventLabelForEmail,
    transferEmail,
} from '@/lib/ownerTransfer'

describe('moving an event to another email', () => {
    it('cleans and validates the address', () => {
        expect(normalizeOwnerEmail('  Dana.Cohen@Gmail.COM ')).toBe('dana.cohen@gmail.com')
        expect(normalizeOwnerEmail('dana@gmail')).toBe(null)
        expect(normalizeOwnerEmail('not an email')).toBe(null)
        expect(normalizeOwnerEmail('')).toBe(null)
        expect(normalizeOwnerEmail(null)).toBe(null)
    })

    it('refuses a bad event id or email', () => {
        expect(transferProblem({ weddingId: 'w1', email: 'a@b.co' })).toBe(null)
        expect(transferProblem({ weddingId: '', email: 'a@b.co' })).toBe('bad-wedding-id')
        expect(transferProblem({ weddingId: 'a/b', email: 'a@b.co' })).toBe('bad-wedding-id')
        expect(transferProblem({ weddingId: 'w1', email: 'nope' })).toBe('bad-email')
    })

    it('is a no-op only when the same ACCOUNT already owns it', () => {
        const w = { ownerId: 'u1', ownerEmail: 'Dana@x.com' }
        expect(isSameOwner(w, 'u1', 'dana@x.com')).toBe(true)
        // The label was edited by hand to the new address, but the old
        // account still owns it — that must still be movable.
        expect(isSameOwner(w, 'u2', 'dana@x.com')).toBe(false)
        expect(isSameOwner({ ownerEmail: 'dana@x.com' }, 'u1', 'dana@x.com')).toBe(false)
        expect(isSameOwner(w, '', 'dana@x.com')).toBe(false)
    })

    it('remembers who owned it before', () => {
        expect(previousOwnerRecord({ ownerId: 'u1', ownerEmail: 'a@b.co' }, '2026-11-03T10:00:00.000Z', 'admin@x.com')).toEqual({
            ownerId: 'u1',
            ownerEmail: 'a@b.co',
            replacedAt: '2026-11-03T10:00:00.000Z',
            replacedBy: 'admin@x.com',
        })
        expect(previousOwnerRecord({}, 't', null)).toEqual({ ownerId: null, ownerEmail: null, replacedAt: 't', replacedBy: null })
    })

    it('names the event in the email', () => {
        expect(eventLabelForEmail({ brideName: 'נועה', groomName: 'אלון' })).toBe('נועה ואלון')
        expect(eventLabelForEmail({ eventType: 'twins_bar_mitzvah', celebrantName: 'דניאל', celebrantName2: 'נועם' })).toBe('דניאל ונועם')
        expect(eventLabelForEmail({ celebrantName: 'גל' })).toBe('גל')
        expect(eventLabelForEmail({})).toBe('')
    })

    it('sends the password only to a brand-new account, and escapes what it prints', () => {
        const fresh = transferEmail({ email: 'a@b.co', eventLabel: 'גל', password: 'pw123' })
        expect(fresh.html).toContain('pw123')
        expect(fresh.html).toContain('פתחנו לכם חשבון')
        expect(fresh.subject).toContain('גל')
        const existing = transferEmail({ email: 'a@b.co', eventLabel: 'גל' })
        expect(existing.html).not.toContain('pw123')
        expect(existing.html).toContain('נוסף לחשבון')
        expect(transferEmail({ email: 'a@b.co', eventLabel: '<script>' }).html).not.toContain('<script>')
    })
})
