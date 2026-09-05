import { describe, it, expect } from 'vitest'
import {
    normalizeEmail,
    isEmail,
    cleanNote,
    validateDeletionRequest,
    NOTE_MAX,
    REASONS,
} from '@/lib/deletionRequest'

describe('normalizeEmail', () => {
    it('trims and lowercases so one person is one row', () => {
        expect(normalizeEmail('  Bar@Gmail.COM ')).toBe('bar@gmail.com')
    })
    it('survives non-strings', () => {
        for (const v of [undefined, null, 7, {}, []]) expect(normalizeEmail(v)).toBe('')
    })
})

describe('isEmail', () => {
    it('accepts the shapes real people type', () => {
        for (const e of [
            'a@b.co',
            'bar.ben+play@gmail.com',
            'BAR@WEDDINGTALES.CO.IL',
            "o'brien@example.com",
        ]) {
            expect(isEmail(e), e).toBe(true)
        }
    })
    it('rejects what is not an address at all', () => {
        for (const e of ['', '   ', 'bar', 'bar@', '@gmail.com', 'bar@gmail', 'a b@c.com', 'a@b..c']) {
            expect(isEmail(e), JSON.stringify(e)).toBe(false)
        }
    })
    it('rejects an address longer than the practical maximum', () => {
        expect(isEmail('a'.repeat(250) + '@b.co')).toBe(false)
    })
})

describe('cleanNote', () => {
    it('collapses whitespace before truncating, so newlines cannot eat the budget', () => {
        const note = 'a' + '\n'.repeat(2000) + 'b'
        expect(cleanNote(note)).toBe('a b')
    })
    it('caps length', () => {
        expect(cleanNote('x'.repeat(NOTE_MAX + 500))).toHaveLength(NOTE_MAX)
    })
})

describe('validateDeletionRequest', () => {
    it('needs an email', () => {
        expect(validateDeletionRequest({}).error).toBe('email_required')
        expect(validateDeletionRequest({ email: '   ' }).error).toBe('email_required')
    })
    it('reports a bad email distinctly from a missing one', () => {
        expect(validateDeletionRequest({ email: 'nope' }).error).toBe('email_invalid')
    })
    it('returns exactly the three keys the route writes', () => {
        const r = validateDeletionRequest({ email: 'A@b.co', reason: 'privacy', note: ' hi  there ' })
        expect(r.ok).toBe(true)
        expect(Object.keys(r.value).sort()).toEqual(['email', 'note', 'reason'])
        expect(r.value).toEqual({ email: 'a@b.co', reason: 'privacy', note: 'hi there' })
    })
    it('falls back to "other" rather than trusting a reason off the wire', () => {
        expect(validateDeletionRequest({ email: 'a@b.co', reason: 'status' }).value.reason).toBe('other')
        expect(validateDeletionRequest({ email: 'a@b.co' }).value.reason).toBe('other')
    })
    it('drops injected keys instead of passing them to Firestore', () => {
        const r = validateDeletionRequest({ email: 'a@b.co', status: 'done', submissions: 999 })
        expect(r.value.status).toBeUndefined()
        expect(r.value.submissions).toBeUndefined()
    })
    it('survives a non-object body', () => {
        for (const b of [null, undefined, 'x', 5]) expect(validateDeletionRequest(b).ok).toBe(false)
    })
    it('every REASONS entry round-trips', () => {
        for (const r of REASONS) {
            expect(validateDeletionRequest({ email: 'a@b.co', reason: r }).value.reason).toBe(r)
        }
    })
})
