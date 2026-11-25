import { afterEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ after: vi.fn() }))
vi.mock('next/server', () => ({ after: mocks.after }))
vi.mock('@/lib/firebaseAdmin', () => ({ adminDb: null, adminStorage: null }))
vi.mock('firebase-admin/firestore', () => ({ FieldValue: { serverTimestamp: () => 'server-time' } }))

import {
    decideSample, listSamples, markSampleOffered, purgeOldSamples, readDesignSettings, receiveSamplePhoto,
    sampleAlerts, sampleId, storeSamplePhoto, writeDesignSettings,
} from '@/lib/salesAgent/designSamples'
import { isOwnMediaEcho } from '@/lib/salesAgent/leadsCore'

const PHONE = '972500000001'
const ID = sampleId(PHONE)
const NOW = Date.parse('2026-12-01T10:00:00Z')
const HOUR = 3_600_000
const DAY = 24 * HOUR

const plain = value => value && typeof value === 'object' && !Array.isArray(value) && !Buffer.isBuffer(value)
const merge = (into, patch) => {
    const out = { ...into }
    for (const [key, value] of Object.entries(patch)) out[key] = plain(value) && plain(out[key]) ? merge(out[key], value) : value
    return out
}

function fakeDb(seed = {}) {
    const rows = new Map(Object.entries(seed))
    const snap = (path, id) => ({ id, exists: rows.has(path), data: () => rows.get(path) })
    const doc = (name, id) => {
        const path = `${name}/${id}`
        return {
            path,
            get: async () => snap(path, id),
            set: async (data, options) => { rows.set(path, options?.merge ? merge(rows.get(path) || {}, data) : data) },
        }
    }
    return {
        rows,
        collection: name => ({
            doc: id => doc(name, id),
            get: async () => ({ docs: [...rows.keys()].filter(path => path.startsWith(`${name}/`)).map(path => snap(path, path.slice(name.length + 1))) }),
        }),
        runTransaction: async work => work({ get: ref => ref.get(), set: (ref, data, options) => ref.set(data, options) }),
    }
}

const leadRow = (extra = {}) => ({
    stage: 'engaged', lastInboundAt: NOW - HOUR, turns: [{ role: 'assistant', text: 'שלום', at: NOW - HOUR }],
    designSample: { status: 'offered', kind: 'bar', offeredAt: NOW - HOUR }, ...extra,
})
const sampleRow = (extra = {}) => ({
    leadId: PHONE, status: 'ready', kind: 'bar', createdAt: NOW - HOUR,
    photos: [{ path: `design-samples/${ID}/photo-1.jpg`, mediaId: 'm1' }], samplePath: `design-samples/${ID}/sample.jpg`, ...extra,
})

afterEach(() => vi.restoreAllMocks())

describe('the switch', () => {
    it('is off until someone turns it on, and keeps the test phones', async () => {
        const db = fakeDb({ 'admin_settings/designSamples': { testPhones: [PHONE] } })

        expect(await readDesignSettings({ db })).toEqual({ enabled: false, testPhones: [PHONE] })
        await writeDesignSettings({ enabled: true, by: 'owner' }, { db, nowMs: NOW })
        expect(await readDesignSettings({ db })).toEqual({ enabled: true, testPhones: [PHONE] })
    })

    it('reads as off when the database fails', async () => {
        vi.spyOn(console, 'warn').mockImplementation(() => {})

        expect(await readDesignSettings({ db: { collection: () => { throw new Error('down') } } })).toEqual({ enabled: false, testPhones: [] })
    })
})

describe('offer and photo', () => {
    it('marks the lead as offered once', async () => {
        const db = fakeDb({ [`sales_leads/${PHONE}`]: { stage: 'engaged' } })

        await markSampleOffered(PHONE, 'bat', { db, nowMs: NOW })

        expect(db.rows.get(`sales_leads/${PHONE}`).designSample).toEqual({ status: 'offered', kind: 'bat', offeredAt: NOW })
    })

    it('opens one request for the lead and keeps the chat and its window', async () => {
        const db = fakeDb({ [`sales_leads/${PHONE}`]: leadRow() })

        const result = await receiveSamplePhoto({ phone: PHONE, mediaId: 'm1', profileName: 'דנה', ack: 'קיבלתי' }, { db, nowMs: NOW })

        expect(result).toEqual({ id: ID, repeat: false })
        expect(db.rows.get(`sales_design_samples/${ID}`)).toMatchObject({ leadId: PHONE, status: 'receiving', kind: 'bar', profileName: 'דנה', createdAt: NOW })
        const lead = db.rows.get(`sales_leads/${PHONE}`)
        expect(lead).toMatchObject({ designSample: { status: 'received' }, lastInboundAt: 'server-time' })
        expect(lead.human).toBeUndefined()
        expect(lead.turns.slice(-2)).toEqual([
            { role: 'user', text: '[תמונה לדוגמת שלט]', at: NOW }, { role: 'assistant', text: 'קיבלתי', at: NOW },
        ])
    })

    it('adds a second picture to the same request', async () => {
        const db = fakeDb({ [`sales_leads/${PHONE}`]: leadRow({ designSample: { status: 'received', kind: 'bar', offeredAt: NOW } }), [`sales_design_samples/${ID}`]: sampleRow({ status: 'pending', samplePath: null }) })

        const result = await receiveSamplePhoto({ phone: PHONE, mediaId: 'm2', ack: 'קיבלתי' }, { db, nowMs: NOW })

        expect(result).toEqual({ id: ID, repeat: true })
        expect(db.rows.get(`sales_design_samples/${ID}`)).toMatchObject({ status: 'pending', createdAt: NOW - HOUR })
        expect(db.rows.get(`sales_leads/${PHONE}`).turns.at(-1).role).toBe('assistant')
    })

    it('saves the picture privately and marks it ready to draw', async () => {
        const db = fakeDb({ [`sales_design_samples/${ID}`]: sampleRow({ status: 'receiving', photos: [], samplePath: null }) })
        const save = vi.fn(async () => {})
        const download = vi.fn(async () => ({ bytes: Buffer.from('picture'), mimeType: 'image/jpeg' }))

        await storeSamplePhoto(ID, 'm1', { db, save, download, nowMs: NOW })

        expect(save).toHaveBeenCalledWith(`design-samples/${ID}/photo-1.jpg`, Buffer.from('picture'), 'image/jpeg')
        expect(db.rows.get(`sales_design_samples/${ID}`)).toMatchObject({ status: 'pending', photos: [{ path: `design-samples/${ID}/photo-1.jpg`, mediaId: 'm1' }] })
    })

    it.each([
        ['the download fails', async () => { throw Object.assign(new Error('x'), { code: 'MEDIA_DOWNLOAD_FAILED' }) }, 'MEDIA_DOWNLOAD_FAILED'],
        ['the file is not a picture', async () => ({ bytes: Buffer.from('x'), mimeType: 'application/pdf' }), 'UNSUPPORTED_MEDIA_TYPE'],
    ])('says so when %s', async (_, download, code) => {
        vi.spyOn(console, 'warn').mockImplementation(() => {})
        const db = fakeDb({ [`sales_design_samples/${ID}`]: sampleRow({ status: 'receiving', photos: [], samplePath: null }) })
        const save = vi.fn()

        await storeSamplePhoto(ID, 'm1', { db, save, download, nowMs: NOW })

        expect(save).not.toHaveBeenCalled()
        expect(db.rows.get(`sales_design_samples/${ID}`)).toMatchObject({ status: 'failed', errorCode: code })
    })
})

describe('approval', () => {
    const world = (lead = leadRow({ designSample: { status: 'received', kind: 'bar', offeredAt: NOW - HOUR } }), sample = sampleRow()) =>
        fakeDb({ [`sales_leads/${PHONE}`]: lead, [`sales_design_samples/${ID}`]: sample })
    const sign = vi.fn(async path => `https://signed.example/${path}`)

    it('sends the sample to the phone on the record and remembers it, so its echo is not read as theirs', async () => {
        const db = world()
        const send = vi.fn(async () => ({ providerMessageId: 'wamid.1' }))

        const result = await decideSample(ID, 'send', { db, send, sign, nowMs: NOW })

        expect(send).toHaveBeenCalledWith(PHONE, `https://signed.example/design-samples/${ID}/sample.jpg`, expect.stringContaining('דוגמה'))
        expect(result.status).toBe('sent')
        expect(db.rows.get(`sales_design_samples/${ID}`)).toMatchObject({ status: 'sent', sentAt: NOW })
        const lead = db.rows.get(`sales_leads/${PHONE}`)
        expect(lead.designSample.status).toBe('sent')
        expect(isOwnMediaEcho(lead, 'image', NOW + 5_000)).toBe(true)
    })

    it('never sends twice', async () => {
        const db = world()
        const send = vi.fn(async () => ({}))
        await decideSample(ID, 'send', { db, send, sign, nowMs: NOW })

        await expect(decideSample(ID, 'send', { db, send, sign, nowMs: NOW })).rejects.toMatchObject({ code: 'SAMPLE_NOT_READY' })
        expect(send).toHaveBeenCalledTimes(1)
    })

    it.each([
        ['the 24 hour window closed', leadRow({ lastInboundAt: NOW - 25 * HOUR }), sampleRow(), 'WINDOW_CLOSED'],
        ['the lead is closed', leadRow({ stage: 'closed_lost' }), sampleRow(), 'LEAD_CLOSED'],
        ['nothing was drawn yet', leadRow(), sampleRow({ status: 'pending', samplePath: null }), 'SAMPLE_NOT_READY'],
    ])('refuses when %s', async (_, lead, sample, code) => {
        const send = vi.fn()

        await expect(decideSample(ID, 'send', { db: world(lead, sample), send, sign, nowMs: NOW })).rejects.toMatchObject({ code })
        expect(send).not.toHaveBeenCalled()
    })

    it('keeps the sample ready when the send fails', async () => {
        const db = world()
        const send = vi.fn(async () => { throw new Error('graph') })

        await expect(decideSample(ID, 'send', { db, send, sign, nowMs: NOW })).rejects.toMatchObject({ code: 'SEND_FAILED' })
        expect(db.rows.get(`sales_design_samples/${ID}`)).toMatchObject({ status: 'ready', errorCode: 'SEND_FAILED' })
    })

    it('rejects without sending', async () => {
        const db = world()
        const send = vi.fn()

        expect((await decideSample(ID, 'reject', { db, send, sign, nowMs: NOW })).status).toBe('rejected')
        expect(send).not.toHaveBeenCalled()
    })

    it('refuses an unknown decision or id', async () => {
        await expect(decideSample(ID, 'maybe', { db: world(), nowMs: NOW })).rejects.toMatchObject({ code: 'INVALID_DECISION' })
        await expect(decideSample('nope', 'send', { db: world(), nowMs: NOW })).rejects.toMatchObject({ code: 'SAMPLE_NOT_FOUND' })
    })
})

describe('the board, the report and the cleanup', () => {
    it('lists what is still open, with a preview and whether it can still be sent', async () => {
        const db = fakeDb({
            [`sales_leads/${PHONE}`]: leadRow({ lastInboundAt: NOW - 25 * HOUR }),
            [`sales_design_samples/${ID}`]: sampleRow(),
            'sales_design_samples/old-sent': sampleRow({ status: 'sent' }),
        })

        const items = await listSamples({ db, sign: async path => `signed:${path}`, nowMs: NOW })

        expect(items).toEqual([expect.objectContaining({
            id: ID, status: 'ready', phone: PHONE, previewUrl: `signed:design-samples/${ID}/sample.jpg`, windowOpen: false,
        })])
    })

    it('says how many wait, for the report', async () => {
        const db = fakeDb({ 'sales_design_samples/a': sampleRow({ status: 'pending' }), 'sales_design_samples/b': sampleRow(), 'sales_design_samples/c': sampleRow({ status: 'sent' }) })

        expect(await sampleAlerts({ db })).toEqual(['🎨 דוגמאות שלט: 1 מחכות לציור, 1 מחכות לאישור שלך.'])
        expect(await sampleAlerts({ db: fakeDb() })).toEqual([])
    })

    it('stays quiet when the database fails', async () => {
        vi.spyOn(console, 'warn').mockImplementation(() => {})

        expect(await sampleAlerts({ db: { collection: () => { throw new Error('down') } } })).toEqual([])
    })

    it('deletes the files of a sample older than 30 days and forgets their addresses', async () => {
        const db = fakeDb({
            'sales_design_samples/old': sampleRow({ createdAt: NOW - 31 * DAY }),
            'sales_design_samples/new': sampleRow({ createdAt: NOW - DAY }),
        })
        const remove = vi.fn(async () => {})

        expect(await purgeOldSamples({ db, remove, nowMs: NOW })).toBe(1)
        expect(remove).toHaveBeenCalledWith('design-samples/old/')
        expect(db.rows.get('sales_design_samples/old')).toMatchObject({ status: 'expired', photos: [], samplePath: null })
        expect(db.rows.get('sales_design_samples/new').status).toBe('ready')
    })
})
