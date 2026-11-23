import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import {
    QUICK_KINDS, QUICK_TEMPLATES, quickTemplate, isQuickKind, greetingHi, blessingsLine, noteLine, escapeHtml, suggestedKind,
} from '../src/lib/customerMessages'

describe('the pieces of a message', () => {
    it('greets by first name, or plainly when there is none', () => {
        expect(greetingHi('דנה כהן')).toBe('היי דנה,')
        expect(greetingHi('  יובל ')).toBe('היי יובל,')
        expect(greetingHi('')).toBe('היי,')
        expect(greetingHi(undefined)).toBe('היי,')
    })

    it('says how many blessings are in the book, and nothing when there are none', () => {
        expect(blessingsLine(24)).toBe('בספר יש 24 ברכות.')
        expect(blessingsLine(1)).toBe('בספר יש ברכה אחת.')
        expect(blessingsLine('7')).toBe('בספר יש 7 ברכות.')
        expect(blessingsLine(0)).toBe('')
        expect(blessingsLine(undefined)).toBe('')
        expect(blessingsLine(-3)).toBe('')
        expect(blessingsLine('abc')).toBe('')
    })

    it('puts Bar\'s note in as plain text, escaped, followed by a blank line', () => {
        expect(noteLine('מספר מעקב 123')).toBe('מספר מעקב 123\n\n')
        expect(noteLine('  ')).toBe('')
        expect(noteLine(undefined)).toBe('')
        expect(noteLine('<b>x</b> & "y"')).toBe('&lt;b&gt;x&lt;/b&gt; &amp; &quot;y&quot;\n\n')
        expect(noteLine('א'.repeat(2000)).length).toBeLessThanOrEqual(602)
        expect(escapeHtml(null)).toBe('')
    })
})

describe('the three messages', () => {
    it('are shipped, arrived and details, each with a label, a subject and a body', () => {
        expect(QUICK_KINDS).toEqual(['shipped', 'arrived', 'details'])
        for (const k of QUICK_KINDS) {
            const t = QUICK_TEMPLATES[k]
            expect(t.label.length).toBeGreaterThan(2)
            expect(t.subject.length).toBeGreaterThan(5)
            expect(t.body).toContain('{{hi}}')
            expect(t.body).toContain('{{coupleName}}')
        }
    })

    it('only ever uses variables the e-mail engine fills in', () => {
        const engine = fs.readFileSync(path.join(__dirname, '../src/lib/emailEngine.js'), 'utf8')
        for (const k of QUICK_KINDS) {
            const t = QUICK_TEMPLATES[k]
            const vars = [...(t.subject + t.body).matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map(m => m[1])
            expect(vars.length).toBeGreaterThan(0)
            for (const v of vars) expect(engine, `${k}: {{${v}}}`).toMatch(new RegExp('\\b' + v + '[:,]'))
        }
    })

    it('the details message carries everything the customer needs: view, manage, share, how it works, the count', () => {
        const b = QUICK_TEMPLATES.details.body
        expect(b).toContain('{{viewButton}}')
        expect(b).toContain('{{portalButton}}')
        expect(b).toContain('{{guestLink}}')
        expect(b).toContain('{{blessingsLine}}')
        expect(b).toContain('{{noteLine}}')
        expect(b).toContain('שום דבר לא מודפס לפני האישור')
        expect(b).toContain('22×22')
    })

    it('the shipped and arrived messages show the blessing count and take a note', () => {
        for (const k of ['shipped', 'arrived']) {
            expect(QUICK_TEMPLATES[k].body).toContain('{{blessingsLine}}')
            expect(QUICK_TEMPLATES[k].body).toContain('{{noteLine}}')
        }
    })

    it('invent nothing about a courier, a date or a refund', () => {
        for (const k of QUICK_KINDS) {
            const all = QUICK_TEMPLATES[k].subject + QUICK_TEMPLATES[k].body
            expect(all).not.toMatch(/דואר ישראל|שליח|DHL|UPS|החזר|21×21|21x21/)
        }
    })

    it('take no body from the outside: an unknown kind has no template', () => {
        expect(quickTemplate('shipped')).toBe(QUICK_TEMPLATES.shipped)
        expect(quickTemplate('custom')).toBeNull()
        expect(quickTemplate(undefined)).toBeNull()
        expect(isQuickKind('arrived')).toBe(true)
        expect(isQuickKind('__proto__')).toBe(false)
    })

    it('offers the next message for the stage', () => {
        expect(suggestedKind('in_print')).toBe('shipped')
        expect(suggestedKind('shipped')).toBe('arrived')
        expect(suggestedKind('collecting')).toBe('details')
        expect(suggestedKind('delivered')).toBe('details')
    })
})
