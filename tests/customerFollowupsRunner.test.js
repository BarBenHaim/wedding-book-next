import { afterEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ sendWhatsAppTemplate: vi.fn() }))
vi.mock('@/lib/firebaseAdmin', () => ({ adminDb: {}, adminStorage: {} }))
vi.mock('firebase-admin/firestore', () => ({ FieldValue: { serverTimestamp: () => 'now' } }))
vi.mock('@/lib/salesAgent/leads', () => ({ recordDeliveryEvent: vi.fn() }))
vi.mock('@/lib/salesAgent/whatsapp', () => ({ sendWhatsAppTemplate: mocks.sendWhatsAppTemplate }))

import { runCustomerFollowups, sendTestFollowup } from '@/lib/customerFollowupsRunner'

const TODAY = '2026-12-31' // Thursday, the day after the event below
const book = (id, extra = {}) => ({
    w: {
        id, amountPaid: 990, weddingDate: '2026-12-30', slug: 's', ownerName: 'דנה', eventType: 'bar_mitzvah',
        celebrantName: 'איתמר', ownerPhone: '0501234567', digitalTokens: ['t'], ...extra,
    },
    facts: { openRequests: 0, paused: false },
})
const ON = { enabled: true, enabledDay: '2026-12-01' }

function fakes(overrides = {}) {
    return {
        readSettings: vi.fn().mockResolvedValue(ON),
        listBooks: vi.fn().mockResolvedValue([book('a')]),
        claim: vi.fn().mockResolvedValue(true),
        send: vi.fn().mockResolvedValue({ providerMessageId: 'wamid.1' }),
        record: vi.fn().mockResolvedValue(undefined),
        ...overrides,
    }
}
const run = (deps, extra = {}) => runCustomerFollowups({ today: TODAY, baseUrl: 'https://app.example', deps, ...extra })

afterEach(() => vi.restoreAllMocks())

describe('runCustomerFollowups', () => {
    it('reads and sends nothing while the switch is off', async () => {
        const deps = fakes({ readSettings: vi.fn().mockResolvedValue({ enabled: false }) })

        expect(await run(deps)).toMatchObject({ enabled: false, sent: 0, due: [] })
        expect(deps.listBooks).not.toHaveBeenCalled()
        expect(deps.send).not.toHaveBeenCalled()
    })

    it('claims the moment before sending, then records what Meta accepted', async () => {
        const order = []
        const deps = fakes({
            claim: vi.fn(async () => { order.push('claim'); return true }),
            send: vi.fn(async () => { order.push('send'); return { providerMessageId: 'wamid.1' } }),
        })

        const result = await run(deps)

        expect(order).toEqual(['claim', 'send'])
        expect(deps.claim).toHaveBeenCalledWith('a', 'post_1')
        expect(deps.send).toHaveBeenCalledWith('972501234567', 'wt_after', [
            'דנה', 'איתמר', 'https://app.example/wedding/a/book/t', 'https://app.example/w/s',
        ])
        expect(deps.record).toHaveBeenCalledWith(expect.objectContaining({ weddingId: 'a', key: 'post_1', status: 'accepted', providerMessageId: 'wamid.1' }))
        expect(result).toMatchObject({ enabled: true, sent: 1, failed: 0 })
    })

    it('sends nothing when somebody else already claimed the moment', async () => {
        const deps = fakes({ claim: vi.fn().mockResolvedValue(false) })

        expect(await run(deps)).toMatchObject({ sent: 0 })
        expect(deps.send).not.toHaveBeenCalled()
    })

    it('records a refusal, keeps the claim and carries on with the next customer', async () => {
        vi.spyOn(console, 'warn').mockImplementation(() => {})
        const send = vi.fn()
            .mockRejectedValueOnce(Object.assign(new Error('x'), { errorCode: 'GRAPH_REJECTED', providerCode: 131026 }))
            .mockResolvedValueOnce({ providerMessageId: 'wamid.2' })
        const deps = fakes({ send, listBooks: vi.fn().mockResolvedValue([book('a'), book('b', { ownerPhone: '0527654321' })]) })

        const result = await run(deps)

        expect(result).toMatchObject({ sent: 1, failed: 1 })
        expect(deps.record).toHaveBeenCalledWith(expect.objectContaining({ weddingId: 'a', status: 'failed', errorCode: 131026 }))
        expect(deps.claim).toHaveBeenCalledTimes(2)
    })

    it.each([132001, 131042, 190, 'TEMPLATE_NOT_CONFIGURED', 'WHATSAPP_NOT_CONFIGURED'])(
        'gives the moment back and stops when the whole account is refused (%s)', async code => {
            vi.spyOn(console, 'warn').mockImplementation(() => {})
            const refusal = typeof code === 'number'
                ? { errorCode: 'GRAPH_REJECTED', providerCode: code }
                : { errorCode: code }
            const deps = fakes({
                send: vi.fn().mockRejectedValue(Object.assign(new Error('x'), refusal)),
                release: vi.fn().mockResolvedValue(undefined),
                listBooks: vi.fn().mockResolvedValue([book('a'), book('b', { ownerPhone: '0527654321' })]),
            })

            const result = await run(deps)

            expect(result).toMatchObject({ sent: 0, failed: 0, stopped: code })
            expect(deps.release).toHaveBeenCalledWith('a', 'post_1')
            expect(deps.send).toHaveBeenCalledTimes(1)
            expect(deps.record).not.toHaveBeenCalled()
        })

    it('keeps the moment used after a timeout, since the message may have left', async () => {
        vi.spyOn(console, 'warn').mockImplementation(() => {})
        const deps = fakes({
            send: vi.fn().mockRejectedValue(Object.assign(new Error('x'), { errorCode: 'GRAPH_TIMEOUT' })),
            release: vi.fn(),
        })

        expect(await run(deps)).toMatchObject({ failed: 1 })
        expect(deps.release).not.toHaveBeenCalled()
    })

    it('only lists what would go on a dry run', async () => {
        const deps = fakes()

        const result = await run(deps, { dry: true })

        expect(result.due).toEqual([{ id: 'a', key: 'post_1' }])
        expect(deps.claim).not.toHaveBeenCalled()
        expect(deps.send).not.toHaveBeenCalled()
    })

    it('stops at the cap so one run can never flood', async () => {
        const many = Array.from({ length: 30 }, (_, i) => book(`b${i}`, { ownerPhone: `05012345${String(i).padStart(2, '0')}` }))
        const deps = fakes({ listBooks: vi.fn().mockResolvedValue(many) })

        expect(await run(deps)).toMatchObject({ sent: 20 })
    })

    it('does not message one phone twice in a run', async () => {
        const deps = fakes({ listBooks: vi.fn().mockResolvedValue([book('a'), book('b')]) })

        expect(await run(deps)).toMatchObject({ sent: 1 })
    })
})

describe('sendTestFollowup', () => {
    it('sends the sample of one template to the given phone only', async () => {
        const deps = { send: vi.fn().mockResolvedValue({ providerMessageId: 'wamid.t' }) }

        await sendTestFollowup({ key: 'eve', phone: '972500000001', baseUrl: 'https://app.example', deps })

        expect(deps.send).toHaveBeenCalledWith('972500000001', 'wt_eve', [expect.any(String), expect.any(String), expect.stringContaining('https://app.example/')])
    })

    it('refuses an unknown message and a missing phone', async () => {
        const deps = { send: vi.fn() }

        await expect(sendTestFollowup({ key: 'nope', phone: '972500000001', deps })).rejects.toMatchObject({ code: 'UNKNOWN_FOLLOWUP' })
        await expect(sendTestFollowup({ key: 'eve', phone: '', deps })).rejects.toMatchObject({ code: 'PHONE_MISSING' })
        expect(deps.send).not.toHaveBeenCalled()
    })
})
