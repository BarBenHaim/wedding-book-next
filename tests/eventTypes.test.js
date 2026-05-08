import { describe, it, expect } from 'vitest'
import { normalizeEventType, fieldsForType } from '../src/lib/eventTypes.js'

// eventTypes.js is the source of truth for which fields the admin UI
// exposes per event type. These tests freeze the contract so a future
// rename / new event type can't accidentally break the admin form
// without someone noticing.

describe('normalizeEventType', () => {
    it('returns the type unchanged when it is one of the known values', () => {
        for (const t of ['wedding', 'birthday', 'bar_mitzvah', 'bat_mitzvah', 'poker', 'travel']) {
            expect(normalizeEventType(t)).toBe(t)
        }
    })

    it('falls back to wedding for unknown / missing values', () => {
        expect(normalizeEventType(undefined)).toBe('wedding')
        expect(normalizeEventType(null)).toBe('wedding')
        expect(normalizeEventType('')).toBe('wedding')
        expect(normalizeEventType('Wedding')).toBe('wedding') // case-sensitive — old docs lowercased
        expect(normalizeEventType('hot-air-balloon')).toBe('wedding')
    })
})

describe('fieldsForType', () => {
    it('exposes bride/groom/date fields for wedding', () => {
        expect(fieldsForType('wedding')).toEqual(['brideName', 'groomName', 'weddingDate'])
    })

    it('exposes celebrant + age for birthday', () => {
        expect(fieldsForType('birthday')).toEqual(['celebrantName', 'age', 'weddingDate'])
    })

    it('uses celebrantName slot for poker (venue) and travel (traveller)', () => {
        // Poker and travel deliberately share the celebrantName field
        // to avoid proliferating Firestore columns; the admin UI
        // re-labels the field per event type.
        expect(fieldsForType('poker')).toEqual(['celebrantName', 'weddingDate'])
        expect(fieldsForType('travel')).toEqual(['celebrantName', 'weddingDate'])
    })

    it('does not crash on unknown types — falls back to celebrantName + date', () => {
        expect(fieldsForType('unknown_type')).toEqual(['celebrantName', 'weddingDate'])
        expect(fieldsForType(undefined)).toEqual(['brideName', 'groomName', 'weddingDate'])
    })

    it('does not include the deprecated "age" field for non-birthday types', () => {
        // Old doc may have age set on a wedding/poker entry — we don't
        // want the admin form to render an age input for those.
        for (const t of ['wedding', 'bar_mitzvah', 'bat_mitzvah', 'poker', 'travel']) {
            expect(fieldsForType(t)).not.toContain('age')
        }
    })
})
