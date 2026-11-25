import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ run: vi.fn(), sendMail: vi.fn(), purge: vi.fn() }))
vi.mock('@/lib/salesAgent/designSamples', () => ({ purgeOldSamples: mocks.purge }))
vi.mock('@/lib/customerFollowupsRunner', () => ({ runCustomerFollowups: mocks.run }))
vi.mock('nodemailer', () => ({ default: { createTransport: () => ({ sendMail: mocks.sendMail }) } }))
vi.mock('@/lib/firebaseAdmin', () => {
    const empty = { docs: [] }
    const query = { get: async () => empty, where: () => query, select: () => query }
    return { adminDb: { collection: () => query } }
})
vi.mock('firebase-admin/firestore', () => ({ Timestamp: { fromMillis: ms => ms } }))

import { GET } from '@/app/api/cron/lifecycle/route'

const call = (query = '') => GET(new Request(`http://localhost/api/cron/lifecycle${query}`, {
    headers: { authorization: 'Bearer cron-test' },
}))

beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-12-09T07:00:00Z'))
    process.env.CRON_SECRET = 'cron-test'
    mocks.run.mockReset().mockResolvedValue({ enabled: true, due: [], sent: 0, failed: 0 })
    mocks.sendMail.mockReset().mockResolvedValue(undefined)
    mocks.purge.mockReset().mockResolvedValue(0)
})
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

describe('the daily run and the WhatsApp follow-ups', () => {
    it('runs them with today in Israel and honours a dry run', async () => {
        const body = await (await call('?dry=1')).json()

        expect(mocks.run).toHaveBeenCalledWith(expect.objectContaining({ today: '2026-12-09', dry: true }))
        expect(body.followups).toMatchObject({ enabled: true, sent: 0 })
    })

    it('finishes the rest of the run when they fail', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {})
        mocks.run.mockRejectedValue(new Error('boom'))

        const response = await call()

        expect(response.status).toBe(200)
        expect((await response.json()).followups).toEqual({ error: true })
    })

    it('tells Lord when sending stopped because the account was refused', async () => {
        mocks.run.mockResolvedValue({ enabled: true, due: [], sent: 0, failed: 0, stopped: 132001 })

        await call()

        expect(mocks.sendMail).toHaveBeenCalledWith(expect.objectContaining({ text: expect.stringContaining('132001') }))
    })

    it('tells Lord in the daily summary when a message was refused', async () => {
        mocks.run.mockResolvedValue({ enabled: true, due: [], sent: 0, failed: 2 })

        await call()

        expect(mocks.sendMail).toHaveBeenCalledWith(expect.objectContaining({ text: expect.stringContaining('2 הודעות וואטסאפ') }))
    })
})

describe('the daily deletion of old sign samples', () => {
    it('runs with the daily job but not on a dry run', async () => {
        mocks.purge.mockResolvedValue(2)

        expect((await (await call('?dry=1')).json()).samplesDeleted).toBeUndefined()
        expect(mocks.purge).not.toHaveBeenCalled()
        expect((await (await call()).json()).samplesDeleted).toBe(2)
    })

    it('says so in the daily summary when it fails, and finishes the run', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {})
        mocks.purge.mockRejectedValue(new Error('storage'))

        const response = await call()

        expect(response.status).toBe(200)
        expect(mocks.sendMail).toHaveBeenCalledWith(expect.objectContaining({ text: expect.stringContaining('מחיקת תמונות') }))
    })
})
