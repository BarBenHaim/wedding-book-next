import { afterEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ after: vi.fn() }))
vi.mock('next/server', () => ({ after: mocks.after }))
vi.mock('@/lib/firebaseAdmin', () => ({ adminDb: {}, adminStorage: {} }))
vi.mock('firebase-admin/firestore', () => ({ FieldValue: { serverTimestamp: () => 'now' } }))

import {
    captureCustomerMessage, downloadInboundMedia, scheduleCustomerCapture,
} from '@/lib/salesAgent/customerInbox'

const PHONE = '972501234567'
const textBody = { text: 'אפשר לשנות תאריך?', messageType: 'text', mediaId: '', occurredAt: '2026-11-25T10:00:00.000Z' }
const photoBody = { text: '', messageType: 'image', mediaId: 'media-1', occurredAt: '2026-11-25T10:00:00.000Z' }

function fakes(overrides = {}) {
    return {
        findWeddings: vi.fn().mockResolvedValue([{ weddingId: 'w1', ownerName: 'דנה' }]),
        getLeadStage: vi.fn().mockResolvedValue(null),
        createItem: vi.fn().mockResolvedValue(true),
        updateItem: vi.fn().mockResolvedValue(undefined),
        saveFile: vi.fn().mockResolvedValue(undefined),
        download: vi.fn().mockResolvedValue({ bytes: Buffer.from('picture'), mimeType: 'image/jpeg' }),
        ...overrides,
    }
}

afterEach(() => vi.restoreAllMocks())

describe('captureCustomerMessage', () => {
    it('stores a message from a phone that is on a book', async () => {
        const deps = fakes()

        const result = await captureCustomerMessage({ eventId: 'event-1', phone: PHONE, body: textBody }, deps)

        expect(result).toEqual({ action: 'stored' })
        expect(deps.createItem).toHaveBeenCalledWith('event-1', expect.objectContaining({
            phone: PHONE, weddingId: 'w1', text: textBody.text, status: 'new', fileStatus: 'none',
        }))
        expect(deps.download).not.toHaveBeenCalled()
    })

    it('stores a buyer the bot closed even when no book carries the phone', async () => {
        const deps = fakes({ findWeddings: vi.fn().mockResolvedValue([]), getLeadStage: vi.fn().mockResolvedValue('closed_won') })

        const result = await captureCustomerMessage({ eventId: 'event-1', phone: PHONE, body: textBody }, deps)

        expect(result).toEqual({ action: 'stored' })
    })

    it('keeps nothing from a sales lead', async () => {
        const deps = fakes({ findWeddings: vi.fn().mockResolvedValue([]), getLeadStage: vi.fn().mockResolvedValue('offer_sent') })

        const result = await captureCustomerMessage({ eventId: 'event-1', phone: PHONE, body: photoBody }, deps)

        expect(result).toEqual({ action: 'skipped-unknown' })
        expect(deps.createItem).not.toHaveBeenCalled()
        expect(deps.download).not.toHaveBeenCalled()
    })

    it('ignores an empty message before looking anyone up', async () => {
        const deps = fakes()

        const result = await captureCustomerMessage({ eventId: 'event-1', phone: PHONE, body: { text: '', mediaId: '' } }, deps)

        expect(result).toEqual({ action: 'skipped-empty' })
        expect(deps.findWeddings).not.toHaveBeenCalled()
    })

    it('leaves an item alone when the provider sends the same message again', async () => {
        const deps = fakes({ createItem: vi.fn().mockResolvedValue(false) })

        const result = await captureCustomerMessage({ eventId: 'event-1', phone: PHONE, body: photoBody }, deps)

        expect(result).toEqual({ action: 'duplicate' })
        expect(deps.download).not.toHaveBeenCalled()
        expect(deps.updateItem).not.toHaveBeenCalled()
    })

    it('saves a file privately under a path that does not carry the phone', async () => {
        const deps = fakes()

        await captureCustomerMessage({ eventId: 'event-1', phone: PHONE, body: photoBody }, deps)

        const [path, bytes, mimeType] = deps.saveFile.mock.calls[0]
        expect(path).toMatch(/^customer-inbox\/[a-f0-9]{24}\/event-1\.jpg$/)
        expect(path).not.toContain(PHONE)
        expect(bytes).toEqual(Buffer.from('picture'))
        expect(mimeType).toBe('image/jpeg')
        expect(deps.updateItem).toHaveBeenCalledWith('event-1', { fileStatus: 'saved', storagePath: path, mimeType: 'image/jpeg' })
    })

    it('keeps the message and says the file is missing when the fetch fails', async () => {
        vi.spyOn(console, 'warn').mockImplementation(() => {})
        const deps = fakes({ download: vi.fn().mockRejectedValue(Object.assign(new Error('no'), { code: 'MEDIA_TOO_LARGE' })) })

        const result = await captureCustomerMessage({ eventId: 'event-1', phone: PHONE, body: photoBody }, deps)

        expect(result).toEqual({ action: 'stored', fileError: 'MEDIA_TOO_LARGE' })
        expect(deps.updateItem).toHaveBeenCalledWith('event-1', { fileStatus: 'failed', fileError: 'MEDIA_TOO_LARGE' })
    })
})

describe('downloadInboundMedia', () => {
    const response = ({ json, bytes, ok = true }) => ({
        ok, json: async () => json, arrayBuffer: async () => bytes, headers: { get: () => null },
    })

    it('reads the address from Meta, then the bytes, with the token on both', async () => {
        const fetchFn = vi.fn()
            .mockResolvedValueOnce(response({ json: { url: 'https://lookaside.example/file', mime_type: 'audio/ogg; codecs=opus', file_size: 5 } }))
            .mockResolvedValueOnce(response({ bytes: new TextEncoder().encode('voice').buffer }))

        const file = await downloadInboundMedia('media 1', { fetchFn, token: 'test-token', graphBase: 'https://graph.example' })

        expect(file.mimeType).toBe('audio/ogg; codecs=opus')
        expect(file.bytes.toString()).toBe('voice')
        expect(fetchFn.mock.calls[0][0]).toBe('https://graph.example/media%201')
        expect(fetchFn.mock.calls[1][0]).toBe('https://lookaside.example/file')
        for (const call of fetchFn.mock.calls) expect(call[1].headers.Authorization).toBe('Bearer test-token')
    })

    it('refuses a file over the limit without fetching it', async () => {
        const fetchFn = vi.fn().mockResolvedValue(response({ json: { url: 'https://lookaside.example/file', mime_type: 'video/mp4', file_size: 26 * 1024 * 1024 } }))

        await expect(downloadInboundMedia('m', { fetchFn, token: 't' })).rejects.toMatchObject({ code: 'MEDIA_TOO_LARGE' })
        expect(fetchFn).toHaveBeenCalledTimes(1)
    })

    it('never sends the token to an address that is not https', async () => {
        const fetchFn = vi.fn().mockResolvedValue(response({ json: { url: 'http://lookaside.example/file', mime_type: 'image/png', file_size: 5 } }))

        await expect(downloadInboundMedia('m', { fetchFn, token: 't' })).rejects.toMatchObject({ code: 'MEDIA_PROVIDER_INVALID' })
        expect(fetchFn).toHaveBeenCalledTimes(1)
    })

    it('says so when no token is configured', async () => {
        await expect(downloadInboundMedia('m', { fetchFn: vi.fn(), token: '' })).rejects.toMatchObject({ code: 'MEDIA_NOT_CONFIGURED' })
    })
})

describe('scheduleCustomerCapture', () => {
    it('hands the work to run after the response', async () => {
        mocks.after.mockReset()
        const capture = vi.fn().mockResolvedValue({ action: 'stored' })

        scheduleCustomerCapture({ eventId: 'event-1', phone: PHONE, body: textBody }, { capture })

        expect(capture).not.toHaveBeenCalled()
        await mocks.after.mock.calls[0][0]()
        expect(capture).toHaveBeenCalledWith({ eventId: 'event-1', phone: PHONE, body: textBody })
    })

    it('never throws into the reply, and never logs the phone', async () => {
        mocks.after.mockReset()
        mocks.after.mockImplementation(() => { throw new Error('outside a request') })
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
        const capture = vi.fn().mockRejectedValue(new Error(`write failed for ${PHONE}`))

        expect(() => scheduleCustomerCapture({ eventId: 'event-1', phone: PHONE, body: textBody }, { capture })).not.toThrow()
        await new Promise(resolve => setTimeout(resolve, 0))

        expect(capture).toHaveBeenCalled()
        expect(JSON.stringify(warn.mock.calls)).not.toContain(PHONE)
    })
})
