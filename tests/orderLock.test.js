import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { lockDecision, needsWelcomeResume, briefError, LOCK_STALE_MS } from '@/lib/orderLock'

const now = 1_700_000_000_000

describe('lockDecision', () => {
    it('takes a lock that does not exist', () => {
        expect(lockDecision(null, now)).toBe('take')
    })
    it('leaves a finished order alone', () => {
        expect(lockDecision({ status: 'done' }, now)).toBe('done')
    })
    it('does not start a second run while one is working', () => {
        expect(lockDecision({ status: 'processing', startedAtMs: now - 1000 }, now)).toBe('busy')
    })
    it('takes over a run that has gone stale', () => {
        expect(lockDecision({ status: 'processing', startedAtMs: now - LOCK_STALE_MS - 1 }, now)).toBe('take')
        expect(lockDecision({ status: 'processing' }, now)).toBe('take')
    })
    it('takes over a failed run and an old-format lock', () => {
        expect(lockDecision({ status: 'failed' }, now)).toBe('take')
        expect(lockDecision({ createdAt: 'x' }, now)).toBe('take')
    })
})

describe('needsWelcomeResume', () => {
    it('only after a failed run, and only while the e-mail is missing', () => {
        expect(needsWelcomeResume({ status: 'failed' }, {})).toBe(true)
        expect(needsWelcomeResume({ status: 'failed' }, { welcomeEmailSentAt: 1 })).toBe(false)
    })
    it('never for an order that finished, or an old one with no lock state', () => {
        expect(needsWelcomeResume({ status: 'done' }, {})).toBe(false)
        expect(needsWelcomeResume({ createdAt: 'x' }, {})).toBe(false)
        expect(needsWelcomeResume(null, {})).toBe(false)
    })
})

describe('briefError', () => {
    it('keeps one short line', () => {
        expect(briefError(new Error('a\n  b'))).toBe('a b')
        expect(briefError('x'.repeat(500)).length).toBe(240)
        expect(briefError(null)).toBe('unknown')
    })
})

describe('createWedding uses the lock states', () => {
    const src = readFileSync('src/app/api/createWedding/route.js', 'utf8')
    it('takes the lock in a transaction and marks a failure', () => {
        expect(src).toContain('db.runTransaction')
        expect(src).toContain('lockDecision(lock)')
        expect(src).toContain("status: 'failed'")
        expect(src).toContain("status: 'done'")
    })
    it('records the e-mail as sent, so a retry never sends it twice', () => {
        expect(src).toContain('welcomeEmailSentAt')
        expect(src).toContain('needsWelcomeResume(lockBefore')
    })
    it('does not close the sales lead for a balance order', () => {
        const i = src.indexOf('recordVerifiedSalesOutcome(body')
        expect(src.lastIndexOf('if (!balanceFor)', i)).toBeGreaterThan(-1)
    })
})
