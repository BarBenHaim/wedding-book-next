import { describe, it, expect } from 'vitest'
import {
    lookNames, eventLabel,
    coverBefore, coverPickUpdate, coverUndoUpdate, pickWouldReplaceChoice, COVER_KEYS, isArtLook, ART_LOOK,
} from '@/lib/ownerLook'
import { coverIsUndressed } from '@/lib/defaultCovers'

describe('names and labels', () => {
    it('joins a couple, keeps one name, and reads twins', () => {
        expect(lookNames({ eventType: 'wedding', brideNameHe: 'דנה', groomNameHe: 'יובל' })).toBe('דנה ויובל')
        expect(lookNames({ eventType: 'wedding', brideName: 'דנה' })).toBe('דנה')
        expect(lookNames({ eventType: 'bar_mitzvah', celebrantNameHe: 'גל' })).toBe('גל')
        expect(lookNames({ eventType: 'twins_bar_mitzvah', celebrantName: 'דניאל', celebrantName2: 'נועם' })).toBe('דניאל ונועם')
        expect(lookNames({ eventType: 'birthday', customTitle: 'סבתא תקווה' })).toBe('סבתא תקווה')
    })

    it('has no name for an event without one, and never throws', () => {
        expect(lookNames({})).toBe('')
        expect(lookNames(null)).toBe('')
        expect(lookNames({ celebrantName: '   ' })).toBe('')
    })

    it('labels every event type we have, and nothing for an unknown one', () => {
        for (const t of ['wedding', 'bar_mitzvah', 'twins_bar_mitzvah', 'bat_mitzvah', 'birthday', 'poker', 'travel']) expect(eventLabel(t), t).not.toBe('')
        expect(eventLabel('brit')).toBe('')
        expect(eventLabel(undefined)).toBe('')
    })
})

describe('picking a cover and undoing it', () => {
    const before = coverBefore({ coverTexture: '/textures/tex1.png', coverTitle: 'ספר' })

    it('remembers every field the pick touches, absent ones as null', () => {
        expect(Object.keys(before).sort()).toEqual([...COVER_KEYS].sort())
        expect(before.coverTexture).toBe('/textures/tex1.png')
        expect(before.coverImage).toBeNull()
        expect(coverBefore(undefined).coverImage).toBeNull()
    })

    it('writes only cover fields, by dotted path, with a plain background and the picture filling the cover', () => {
        const { set } = coverPickUpdate({ url: 'https://x/y.jpg', optionId: 'frame', before, now: new Date('2026-11-23T10:00:00Z') })
        for (const k of Object.keys(set)) expect(k.startsWith('coverDesign.'), k).toBe(true)
        expect(set['coverDesign.coverImage']).toBe('https://x/y.jpg')
        expect(set['coverDesign.coverTexture']).toBe('none')
        expect(set['coverDesign.coverImageScale']).toBe(125)
        expect(set['coverDesign.coverTitle']).toBe('')
        expect(set['coverDesign.coverAuto']).toEqual({ optionId: 'frame', at: '2026-11-23T10:00:00.000Z', from: 'photo' })
    })

    it('undo restores what was there and removes what was not', () => {
        const { set, remove } = coverUndoUpdate(before)
        expect(set['coverDesign.coverTexture']).toBe('/textures/tex1.png')
        expect(set['coverDesign.coverTitle']).toBe('ספר')
        expect(remove).toContain('coverDesign.coverImage')
        expect(remove).toContain('coverDesign.coverAuto')
        expect(coverUndoUpdate(null).remove.length).toBe(COVER_KEYS.length)
    })

    it('asks before replacing a cover somebody chose, not an empty one and not one of ours', () => {
        expect(pickWouldReplaceChoice({}, coverIsUndressed)).toBe(false)
        expect(pickWouldReplaceChoice({ coverImage: 'https://x/own.png' }, coverIsUndressed)).toBe(true)
        expect(pickWouldReplaceChoice({ coverTexture: 'none' }, coverIsUndressed)).toBe(true)
        expect(pickWouldReplaceChoice({ coverImage: 'https://x/auto.jpg', coverAuto: { optionId: 'full' } }, coverIsUndressed)).toBe(false)
    })
})

describe('sign look', () => {
    it('knows the art look and nothing else', () => {
        expect(isArtLook(ART_LOOK)).toBe(true)
        for (const v of ['light', 'night', 'gold', 'photo:arch', undefined, null]) expect(isArtLook(v), String(v)).toBe(false)
    })
})
