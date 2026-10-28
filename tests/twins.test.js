import { describe, expect, it } from 'vitest'
import {
    TWINS_EVENT_TYPE,
    isTwinsEvent,
    twinNames,
    hasBothTwinNames,
    normalizeBlessFor,
    joinTwinNames,
    blessForName,
    blessForTag,
    blessForHref,
} from '@/lib/twins'
import { normalizeEventType, fieldsForType, buildTitle, getEventConfig, EVENT_TYPE_ORDER } from '@/lib/eventTypes'
import { buildShareCopy, shareImageFor } from '@/lib/shareCopy'
import { publicManageEntry } from '@/lib/manageLinks'
import { EVENT_TYPE_LABEL, eventTypeOf } from '@/lib/adminEventsView'
import he from '@/i18n/messages/he.json'
import en from '@/i18n/messages/en.json'
import es from '@/i18n/messages/es.json'
import it_ from '@/i18n/messages/it.json'

const doc = { eventType: TWINS_EVENT_TYPE, celebrantName: 'דניאל', celebrantName2: 'נועם' }

describe('the twins event type', () => {
    it('is a real type the admin can pick, with two name fields', () => {
        expect(normalizeEventType(TWINS_EVENT_TYPE)).toBe(TWINS_EVENT_TYPE)
        expect(EVENT_TYPE_ORDER).toContain(TWINS_EVENT_TYPE)
        expect(fieldsForType(TWINS_EVENT_TYPE)).toEqual(['celebrantName', 'celebrantName2', 'weddingDate'])
        expect(getEventConfig(TWINS_EVENT_TYPE).hebrewLabel).toBe('בר מצווה תאומים')
        expect(getEventConfig(TWINS_EVENT_TYPE).defaultTheme).toBe('blue')
    })

    it('titles the landing with both names, or one while the other is missing', () => {
        expect(buildTitle(doc)).toEqual({ kind: 'names', left: 'דניאל', right: 'נועם' })
        expect(buildTitle({ ...doc, celebrantName2: '' })).toEqual({ kind: 'single', text: 'דניאל' })
        expect(buildTitle({ eventType: TWINS_EVENT_TYPE })).toEqual({ kind: 'empty' })
    })

    it('has copy in every language', () => {
        for (const m of [he, en, es, it_]) {
            const c = m.eventTypes[TWINS_EVENT_TYPE]
            for (const k of ['label', 'subtitle', 'description', 'ctaLabel', 'footer']) expect(c[k]).toBeTruthy()
            for (const k of ['twinsChoose', 'twinsBless', 'twinsBoth']) expect(m.guestPage[k]).toBeTruthy()
            expect(m.guestPage.twinsBless).toContain('{name}')
            for (const k of ['twinsPickerLabel', 'twinsBothShort']) expect(m.photo[k]).toBeTruthy()
        }
    })

    it('shows up in the admin table, share copy and preview image', () => {
        expect(eventTypeOf(doc)).toBe(TWINS_EVENT_TYPE)
        expect(EVENT_TYPE_LABEL[TWINS_EVENT_TYPE]).toBe('בר מצווה תאומים')
        expect(buildShareCopy(doc).title).toBe('ספר הברכות לבר המצווה של דניאל ונועם')
        expect(shareImageFor(TWINS_EVENT_TYPE).path).toBe(shareImageFor('bar_mitzvah').path)
    })
})

describe('who the blessing is for', () => {
    it('knows the event and its names, and ignores a stale Hebrew field', () => {
        expect(isTwinsEvent(TWINS_EVENT_TYPE)).toBe(true)
        expect(isTwinsEvent('bar_mitzvah')).toBe(false)
        expect(twinNames({ ...doc, celebrantNameHe: 'אלון' })).toEqual(['דניאל', 'נועם'])
        expect(hasBothTwinNames(doc)).toBe(true)
        expect(hasBothTwinNames({ ...doc, celebrantName2: ' ' })).toBe(false)
        expect(twinNames(null)).toEqual(['', ''])
    })

    it('accepts only a, b or both', () => {
        expect(normalizeBlessFor('a')).toBe('a')
        expect(normalizeBlessFor(' BOTH ')).toBe('both')
        expect(normalizeBlessFor('c')).toBe(null)
        expect(normalizeBlessFor(undefined)).toBe(null)
        expect(normalizeBlessFor(1)).toBe(null)
    })

    it('addresses the form to the chosen twin, both by default', () => {
        expect(blessForName(doc, 'a')).toBe('דניאל')
        expect(blessForName(doc, 'b')).toBe('נועם')
        expect(blessForName(doc, 'both')).toBe('דניאל ונועם')
        expect(blessForName(doc, 'nonsense')).toBe('דניאל ונועם')
        expect(blessForName(doc, 'both', 'en')).toBe('דניאל & נועם')
        expect(joinTwinNames('Daniel', '', 'en')).toBe('Daniel')
    })

    it('tags entries for the lists, and leaves untagged ones alone', () => {
        expect(blessForTag(doc, 'a')).toBe('לדניאל')
        expect(blessForTag(doc, 'b')).toBe('לנועם')
        expect(blessForTag(doc, 'both')).toBe('לשניהם')
        expect(blessForTag(doc, undefined)).toBe(null)
        expect(blessForTag(null, 'a')).toBe('לתאום הראשון')
    })

    it('links each landing button to the form with its choice', () => {
        expect(blessForHref('w1', 'a')).toBe('/wedding/w1/photo?for=a')
        expect(blessForHref('w1', 'zzz')).toBe('/wedding/w1/photo?for=both')
    })

    it('passes the choice through to the manage page', () => {
        expect(publicManageEntry({ id: 'x', blessFor: 'b' }).blessFor).toBe('b')
        expect(publicManageEntry({ id: 'y' }).blessFor).toBe(null)
    })
})
