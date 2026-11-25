import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/firebaseAdmin', () => ({ adminDb: null, adminAuth: null, adminStorage: null }))

import { checkClaude, claudeAlert, claudeFailureOf, noteClaudeOutcome, readClaudeHealth, recordClaudeFailure } from '@/lib/salesAgent/claudeHealth'

const NOW = Date.parse('2026-12-09T10:00:00Z')
const HOUR = 3_600_000

function fakeDb(initial = null) {
    const store = { data: initial, paths: [] }
    const ref = {
        get: async () => ({ exists: store.data != null, data: () => store.data }),
        set: async patch => { store.data = { ...store.data, ...patch } },
    }
    return {
        store,
        collection: name => ({ doc: id => { store.paths.push(`${name}/${id}`); return ref } }),
        runTransaction: async work => work({ get: target => target.get(), set: (target, patch) => target.set(patch) }),
    }
}

const providerError = extra => Object.assign(new Error('anthropic provider_error'), {
    provider: 'anthropic', errorCode: 'provider_error', providerStarted: true, ...extra,
})

beforeEach(() => { process.env.ANTHROPIC_API_KEY = 'anthropic-secret-sentinel' })
afterEach(() => {
    delete process.env.ANTHROPIC_API_KEY
    vi.restoreAllMocks()
})

describe('what counts as a Claude failure', () => {
    it('counts an answer another provider had to cover', () => {
        expect(claudeFailureOf({ provider: 'openai', fallbackFrom: 'anthropic', fallbackError: 'low_credit', fallbackStatus: 400 }))
            .toEqual({ errorCode: 'low_credit', status: 400 })
    })

    it('counts a Claude call that failed with nobody to cover it', () => {
        expect(claudeFailureOf(providerError({ errorCode: 'timeout' }))).toEqual({ errorCode: 'timeout', status: null })
    })

    it('counts a failed fallback as the Claude failure that led to it', () => {
        const error = Object.assign(new Error('openai timeout'), {
            provider: 'openai', errorCode: 'timeout', providerStarted: true, fallbackFrom: 'anthropic', fallbackError: 'rate_limit', fallbackStatus: 429,
        })

        expect(claudeFailureOf(error)).toEqual({ errorCode: 'rate_limit', status: 429 })
    })

    it.each([
        ['a normal answer', { provider: 'anthropic', text: 'ok' }],
        ['an OpenAI failure of its own', providerError({ provider: 'openai' })],
        ['a call that never left', providerError({ providerStarted: false })],
        ['nothing', undefined],
    ])('does not count %s', (_, outcome) => {
        expect(claudeFailureOf(outcome)).toBeNull()
    })
})

describe('the record', () => {
    it('counts failures and starts over after a quiet day or a success', async () => {
        const db = fakeDb()

        await recordClaudeFailure({ errorCode: 'low_credit', status: 400 }, { db, nowMs: NOW })
        await recordClaudeFailure({ errorCode: 'low_credit', status: 400 }, { db, nowMs: NOW + HOUR })

        expect(db.store.paths[0]).toBe('sales_runtime/claude_health')
        expect(db.store.data).toMatchObject({ failures: 2, failuresSince: NOW, lastFailureAt: NOW + HOUR, lastErrorCode: 'low_credit', lastStatus: 400 })

        await recordClaudeFailure({ errorCode: 'timeout', status: null }, { db, nowMs: NOW + 30 * HOUR })
        expect(db.store.data).toMatchObject({ failures: 1, failuresSince: NOW + 30 * HOUR })

        db.store.data.lastOkAt = NOW + 31 * HOUR
        await recordClaudeFailure({ errorCode: 'timeout', status: null }, { db, nowMs: NOW + 32 * HOUR })
        expect(db.store.data).toMatchObject({ failures: 1, failuresSince: NOW + 32 * HOUR })
    })

    it('never breaks the caller when the record cannot be written', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
        const db = { collection: () => { throw new Error('database-sentinel') } }

        expect(() => noteClaudeOutcome(providerError(), { db, nowMs: NOW })).not.toThrow()
        await vi.waitFor(() => expect(warn).toHaveBeenCalled())
        expect(JSON.stringify(warn.mock.calls)).not.toContain('database-sentinel')
    })

    it('writes nothing for a healthy answer', async () => {
        const db = fakeDb()

        noteClaudeOutcome({ provider: 'anthropic', text: 'ok' }, { db, nowMs: NOW })
        await Promise.resolve()

        expect(db.store.paths).toEqual([])
    })
})

describe('the alert', () => {
    const failed = { lastFailureAt: NOW - HOUR, lastErrorCode: 'low_credit', lastStatus: 400, failures: 3, failuresSince: NOW - 5 * HOUR }

    it('says what happened in words Lord can act on', () => {
        const text = claudeAlert(failed, NOW)

        expect(text).toContain('Claude')
        expect(text).toContain('נגמר הקרדיט')
        expect(text).toContain('3 פעמים')
    })

    it.each([
        [{ lastStatus: 401, lastErrorCode: 'provider_error' }, 'המפתח'],
        [{ lastStatus: 404, lastErrorCode: 'provider_error' }, 'המודל'],
        [{ lastStatus: null, lastErrorCode: 'timeout' }, 'בזמן'],
        [{ lastStatus: 429, lastErrorCode: 'rate_limit' }, 'הקצב'],
    ])('names the reason of %j', (extra, words) => {
        expect(claudeAlert({ ...failed, ...extra }, NOW)).toContain(words)
    })

    it.each([
        ['nothing recorded', null],
        ['a failure older than a day', { ...failed, lastFailureAt: NOW - 25 * HOUR }],
        ['a success since', { ...failed, lastOkAt: NOW - HOUR / 2 }],
    ])('stays quiet with %s', (_, state) => {
        expect(claudeAlert(state, NOW)).toBeNull()
    })

    it('is empty, not an error, when the record cannot be read', async () => {
        vi.spyOn(console, 'warn').mockImplementation(() => {})
        const db = { collection: () => { throw new Error('down') } }

        expect(await readClaudeHealth({ db, nowMs: NOW })).toEqual({ alert: null, lastCheckAt: null, lastCheckOk: null })
    })
})

describe('the check button', () => {
    it('asks Claude itself, with no other provider to hide behind, and clears the alert', async () => {
        const db = fakeDb({ lastFailureAt: NOW - HOUR, lastErrorCode: 'low_credit', failures: 2 })
        const ask = vi.fn(async () => ({ text: 'תקין', model: 'claude-opus-5-5', provider: 'anthropic' }))

        const result = await checkClaude({ ask, db, nowMs: NOW })

        expect(ask).toHaveBeenCalledWith(expect.objectContaining({ model: 'claude-opus-5-5' }))
        expect(result).toMatchObject({ ok: true, model: 'claude-opus-5-5' })
        expect(result.message).toContain('claude-opus-5-5')
        expect(db.store.data).toMatchObject({ lastCheckAt: NOW, lastCheckOk: true, lastOkAt: NOW })
        expect((await readClaudeHealth({ db, nowMs: NOW })).alert).toBeNull()
    })

    it('reports why it failed and records it', async () => {
        const db = fakeDb()
        const ask = vi.fn(async () => { throw providerError({ errorCode: 'low_credit', status: 400 }) })

        const result = await checkClaude({ ask, db, nowMs: NOW })

        expect(result).toMatchObject({ ok: false, errorCode: 'low_credit' })
        expect(result.message).toContain('נגמר הקרדיט')
        expect(db.store.data).toMatchObject({ lastCheckAt: NOW, lastCheckOk: false, failures: 1, lastErrorCode: 'low_credit' })
    })

    it('says so when there is no key', async () => {
        delete process.env.ANTHROPIC_API_KEY
        const ask = vi.fn()

        const result = await checkClaude({ ask, db: fakeDb(), nowMs: NOW })

        expect(result).toMatchObject({ ok: false, errorCode: 'no_key' })
        expect(result.message).toContain('מפתח')
        expect(ask).not.toHaveBeenCalled()
    })
})
