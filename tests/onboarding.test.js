import { describe, it, expect } from 'vitest'
import {
    validateNewEvent,
    buildWeddingDoc,
    eventDisplayTitle,
    cleanName,
    PUBLIC_EVENT_TYPES,
    MAX_FREE_EVENTS,
} from '../src/lib/onboarding'

describe('cleanName', () => {
    it('trims, collapses whitespace, strips control chars, caps length', () => {
        expect(cleanName('  דור   ושקד  ')).toBe('דור ושקד')
        expect(cleanName('a' + String.fromCharCode(0) + 'b' + String.fromCharCode(31) + 'c')).toBe('abc')
        expect(cleanName('x'.repeat(80))).toHaveLength(40)
        expect(cleanName(null)).toBe('')
        expect(cleanName(123)).toBe('')
    })

    it('keeps hyphens and Hebrew intact', () => {
        expect(cleanName('בת-אל')).toBe('בת-אל')
    })
})

describe('validateNewEvent', () => {
    it('wedding requires both names', () => {
        const r = validateNewEvent({ eventType: 'wedding', brideName: 'שקד', groomName: '' })
        expect(r.ok).toBe(false)
        expect(r.errors.groomName).toBeTruthy()
        expect(r.errors.brideName).toBeUndefined()
    })

    it('valid wedding normalizes and defaults theme to gold', () => {
        const r = validateNewEvent({ eventType: 'wedding', brideName: ' שקד ', groomName: 'דור' })
        expect(r.ok).toBe(true)
        expect(r.value).toMatchObject({ eventType: 'wedding', brideName: 'שקד', groomName: 'דור', themeColor: 'gold' })
    })

    it('celebrant events require celebrantName; bar mitzvah defaults blue', () => {
        expect(validateNewEvent({ eventType: 'bar_mitzvah' }).ok).toBe(false)
        const r = validateNewEvent({ eventType: 'bar_mitzvah', celebrantName: 'נועם' })
        expect(r.ok).toBe(true)
        expect(r.value.themeColor).toBe('blue')
    })

    it('birthday: age optional but validated when present', () => {
        expect(validateNewEvent({ eventType: 'birthday', celebrantName: 'ג׳רי' }).ok).toBe(true)
        expect(validateNewEvent({ eventType: 'birthday', celebrantName: 'ג׳רי', age: 90 }).value.age).toBe(90)
        expect(validateNewEvent({ eventType: 'birthday', celebrantName: 'ג׳רי', age: 0 }).ok).toBe(false)
        expect(validateNewEvent({ eventType: 'birthday', celebrantName: 'ג׳רי', age: 'abc' }).ok).toBe(false)
    })

    it('rejects unknown/admin-only event types', () => {
        expect(validateNewEvent({ eventType: 'poker', celebrantName: 'x' }).ok).toBe(false)
        expect(validateNewEvent({ eventType: 'hack' }).ok).toBe(false)
        expect(validateNewEvent(null).ok).toBe(false)
    })

    it('date is optional; malformed or absurd dates rejected', () => {
        const base = { eventType: 'wedding', brideName: 'א', groomName: 'ב' }
        expect(validateNewEvent(base).ok).toBe(true)
        expect(validateNewEvent({ ...base, weddingDate: '2026-08-14' }).value.weddingDate).toBe('2026-08-14')
        expect(validateNewEvent({ ...base, weddingDate: '14/08/2026' }).ok).toBe(false)
        expect(validateNewEvent({ ...base, weddingDate: '1901-01-01' }).ok).toBe(false)
    })

    it('theme color respected when valid, defaulted when not', () => {
        const base = { eventType: 'wedding', brideName: 'א', groomName: 'ב' }
        expect(validateNewEvent({ ...base, themeColor: 'pink' }).value.themeColor).toBe('pink')
        expect(validateNewEvent({ ...base, themeColor: 'neon' }).value.themeColor).toBe('gold')
    })
})

describe('buildWeddingDoc', () => {
    it('shapes a wedding doc with owner + plan fields, no stray undefineds', () => {
        const { value } = validateNewEvent({ eventType: 'wedding', brideName: 'שקד', groomName: 'דור', weddingDate: '2026-08-14' })
        const doc = buildWeddingDoc(value, { uid: 'u1', email: 'a@b.c', name: 'דור לוי' })
        expect(doc).toMatchObject({
            ownerId: 'u1', ownerEmail: 'a@b.c', ownerName: 'דור לוי',
            createdVia: 'self_serve', plan: 'free', locale: 'he',
            eventType: 'wedding', brideName: 'שקד', groomName: 'דור', weddingDate: '2026-08-14',
        })
        expect(Object.values(doc).some(v => v === undefined)).toBe(false)
        expect(doc.celebrantName).toBeUndefined()
    })

    it('celebrant doc omits couple fields, includes age only when set', () => {
        const { value } = validateNewEvent({ eventType: 'birthday', celebrantName: 'ג׳רי', age: 90 })
        const doc = buildWeddingDoc(value, { uid: 'u2' })
        expect(doc.celebrantName).toBe('ג׳רי')
        expect(doc.age).toBe(90)
        expect(doc.brideName).toBeUndefined()
        const noAge = buildWeddingDoc(validateNewEvent({ eventType: 'bar_mitzvah', celebrantName: 'נועם' }).value, {})
        expect('age' in noAge).toBe(false)
    })
})

describe('eventDisplayTitle', () => {
    it('joins couple names, falls back gracefully', () => {
        expect(eventDisplayTitle({ eventType: 'wedding', brideName: 'שקד', groomName: 'דור' })).toBe('שקד & דור')
        expect(eventDisplayTitle({ eventType: 'bar_mitzvah', celebrantName: 'נועם' })).toBe('נועם')
        expect(eventDisplayTitle(null)).toBe('הספר שלכם')
    })
})

describe('constants', () => {
    it('public types are the four mainstream ones; cap is small', () => {
        expect(PUBLIC_EVENT_TYPES).toEqual(['wedding', 'bar_mitzvah', 'bat_mitzvah', 'birthday'])
        expect(MAX_FREE_EVENTS).toBeGreaterThanOrEqual(1)
        expect(MAX_FREE_EVENTS).toBeLessThanOrEqual(10)
    })
})
