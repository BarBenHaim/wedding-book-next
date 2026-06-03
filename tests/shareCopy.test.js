import { describe, it, expect } from 'vitest'
import { buildShareCopy } from '../src/lib/shareCopy.js'

// The OG title is what WhatsApp shows in its link-preview card — when
// it's generic ("ספר הברכות" alone) the link looks like junk. These
// tests pin the personalization rules so a future refactor can't
// silently regress the title back to the generic fallback.
//
// Notable: the `ownerName` fallback was added because many production
// weddings (older orders) never had brideName/groomName populated but
// always carry ownerName from /api/createWedding.

describe('buildShareCopy — title personalization', () => {
    it('uses bride + groom joined with "ו" when both are set', () => {
        const { title } = buildShareCopy({
            eventType: 'wedding',
            brideName: 'שירה',
            groomName: 'נועם',
        })
        expect(title).toBe('ספר הברכות של שירה ונועם')
    })

    it('uses just one name when only one of bride/groom is set', () => {
        const { title } = buildShareCopy({
            eventType: 'wedding',
            groomName: 'נועם',
        })
        expect(title).toBe('ספר הברכות של נועם')
    })

    it('falls back to ownerName when bride/groom are missing', () => {
        // The production gap this change closes.
        const { title } = buildShareCopy({
            eventType: 'wedding',
            ownerName: 'נועם',
        })
        expect(title).toBe('ספר הברכות של נועם')
    })

    it('prefers brideNameHe / groomNameHe over the Latin fields', () => {
        const { title } = buildShareCopy({
            eventType: 'wedding',
            brideName: 'Shira',
            brideNameHe: 'שירה',
            groomName: 'Noam',
            groomNameHe: 'נועם',
        })
        expect(title).toBe('ספר הברכות של שירה ונועם')
    })

    it('uses celebrantName for non-wedding events', () => {
        const { title } = buildShareCopy({
            eventType: 'birthday',
            celebrantName: 'תקווה',
        })
        expect(title).toBe('ספר הברכות ליום ההולדת של תקווה')
    })

    it('falls back to ownerName for non-wedding events too', () => {
        const { title } = buildShareCopy({
            eventType: 'bar_mitzvah',
            ownerName: 'גל',
        })
        expect(title).toBe('ספר הברכות לבר המצווה של גל')
    })

    it('returns a generic-but-not-broken title when no name fields are set', () => {
        const { title } = buildShareCopy({ eventType: 'wedding' })
        // Trailing " של" should be stripped; result must not contain
        // the legacy "הדיגיטלי" copy that the user explicitly asked
        // to be removed.
        expect(title).toBe('ספר הברכות')
        expect(title).not.toMatch(/דיגיטלי/)
    })

    it('returns a generic title for an empty data object too', () => {
        const { title } = buildShareCopy({})
        expect(title).toBe('ספר הברכות')
        expect(title).not.toMatch(/דיגיטלי/)
    })
})

describe('buildShareCopy — description follows the same rules', () => {
    it('addresses the couple by name when present', () => {
        const { description } = buildShareCopy({
            eventType: 'wedding',
            brideName: 'שירה',
            groomName: 'נועם',
        })
        expect(description).toMatch(/את שירה ונועם/)
        expect(description).toMatch(/מהחתונה/)
    })

    it('uses ownerName in the description too', () => {
        const { description } = buildShareCopy({
            eventType: 'wedding',
            ownerName: 'נועם',
        })
        expect(description).toMatch(/את נועם/)
    })

    it('falls back to a generic but warm description when no names', () => {
        const { description } = buildShareCopy({ eventType: 'wedding' })
        expect(description).toMatch(/כתבו ברכה/)
        expect(description).not.toMatch(/את/) // "ברכו את" pattern shouldn't appear
    })
})
