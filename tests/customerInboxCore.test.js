import { describe, expect, it } from 'vitest'
import {
    MAX_MEDIA_BYTES, buildInboxItem, isCapturable, mediaExtension, phoneVariants,
} from '@/lib/salesAgent/customerInboxCore'

describe('phoneVariants', () => {
    it('covers the ways a billing phone is typed on a wedding', () => {
        expect(phoneVariants('972501234567')).toEqual(expect.arrayContaining([
            '972501234567', '+972501234567', '0501234567', '050-1234567', '050-123-4567',
            '050 1234567', '050 123 4567', '+972 50-123-4567',
        ]))
    })

    it('stays within the Firestore "in" limit and has no repeats', () => {
        const variants = phoneVariants('972501234567')
        expect(variants.length).toBeLessThanOrEqual(30)
        expect(new Set(variants).size).toBe(variants.length)
    })

    it('returns nothing for a number too short to be a phone', () => {
        expect(phoneVariants('97250')).toEqual([])
        expect(phoneVariants('')).toEqual([])
    })
})

describe('isCapturable', () => {
    it('keeps text or a file and drops a reaction-like empty message', () => {
        expect(isCapturable({ text: 'שלום' })).toBe(true)
        expect(isCapturable({ text: '', mediaId: '123' })).toBe(true)
        expect(isCapturable({ text: '   ', mediaId: '' })).toBe(false)
        expect(isCapturable({})).toBe(false)
    })
})

describe('buildInboxItem', () => {
    const body = { text: 'אפשר לשנות תאריך?', messageType: 'text', mediaId: '', occurredAt: '2026-11-25T10:00:00.000Z', profileName: 'דנה' }

    it('ties a message to the one book of that phone', () => {
        expect(buildInboxItem({ phone: '972501234567', body, matches: [{ weddingId: 'w1', ownerName: 'דנה כהן' }] })).toEqual({
            phone: '972501234567', weddingIds: ['w1'], weddingId: 'w1', customerName: 'דנה כהן',
            messageType: 'text', text: 'אפשר לשנות תאריך?', mediaId: null,
            occurredAt: '2026-11-25T10:00:00.000Z', status: 'new', fileStatus: 'none',
        })
    })

    it('does not guess between two books of the same phone', () => {
        const item = buildInboxItem({ phone: '972501234567', body, matches: [{ weddingId: 'w1' }, { weddingId: 'w2' }] })
        expect(item).toMatchObject({ weddingIds: ['w1', 'w2'], weddingId: null, customerName: 'דנה' })
    })

    it('marks a file as waiting to be fetched and bounds the text', () => {
        const item = buildInboxItem({
            phone: '972501234567', matches: [],
            body: { ...body, messageType: 'image', mediaId: 'media-1', text: 'א'.repeat(5000), profileName: '' },
        })
        expect(item).toMatchObject({ mediaId: 'media-1', fileStatus: 'pending', weddingIds: [], weddingId: null, customerName: null })
        expect(item.text).toHaveLength(4000)
    })
})

describe('mediaExtension', () => {
    it('names the file by what it is, ignoring codec notes', () => {
        expect(mediaExtension('image/jpeg')).toBe('jpg')
        expect(mediaExtension('audio/ogg; codecs=opus')).toBe('ogg')
        expect(mediaExtension('application/pdf')).toBe('pdf')
        expect(mediaExtension('application/x-unknown')).toBe('bin')
    })

    it('caps a file at 25 MB', () => {
        expect(MAX_MEDIA_BYTES).toBe(25 * 1024 * 1024)
    })
})
