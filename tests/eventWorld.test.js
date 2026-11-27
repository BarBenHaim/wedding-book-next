import { describe, expect, it } from 'vitest'
import { WORLDS, worldFor, worldOfEvent } from '@/lib/eventWorld'

describe('which design world an event belongs to', () => {
    it('gives each kind of celebration its own world', () => {
        expect(worldFor('wedding')).toBe('wedding')
        expect(worldFor('bat_mitzvah')).toBe('batmitzvah')
        expect(worldFor('birthday')).toBe('birthday')
        expect(worldFor('poker')).toBe('birthday')
        expect(worldFor('bar_mitzvah')).toBe('jerusalem')
        expect(worldFor('twins_bar_mitzvah')).toBe('jerusalem')
    })

    it('falls back to the house world when the kind is unknown', () => {
        for (const type of ['', 'something', undefined, null]) expect(worldFor(type)).toBe('jerusalem')
    })

    it('reads an old event with no kind but a couple on it as a wedding', () => {
        expect(worldOfEvent({ brideName: 'שקד' })).toBe('wedding')
        expect(worldOfEvent({ groomNameHe: 'דור' })).toBe('wedding')
        expect(worldOfEvent({ celebrantName: 'אריאל' })).toBe('jerusalem')
        expect(worldOfEvent({ eventType: 'birthday', brideName: 'x' })).toBe('birthday')
    })

    it('says nothing before the event is read, so no world flashes by', () => {
        expect(worldOfEvent(null)).toBe(null)
        expect(worldOfEvent(undefined)).toBe(null)
    })

    it('names every world it can answer with', () => {
        expect(WORLDS).toEqual(['jerusalem', 'wedding', 'batmitzvah', 'birthday'])
    })
})
