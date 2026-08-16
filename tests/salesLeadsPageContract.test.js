import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../src/app/admin/sales-leads/page.js', import.meta.url), 'utf8')
const experimentSection = source.slice(source.indexOf('function Experiments'), source.indexOf('function Stat'))

describe('verified experiment owner UI contract', () => {
    it('shows the full payment-truth funnel in Hebrew', () => {
        for (const label of [
            'לידים ששויכו', 'תגובה שנייה', 'הגיעו להצעה', 'כוונת תשלום',
            'תשלומים מאומתים', 'הכנסה מאומתת',
        ]) expect(experimentSection).toContain(label)
        expect(experimentSection).toContain('סגירות ידניות שממתינות לאימות תשלום')
    })

    it('wraps on mobile and never renders customer-level experiment evidence', () => {
        expect(experimentSection).toMatch(/flex-wrap|grid-cols-2/)
        expect(experimentSection).not.toMatch(/transcript|messageText|r\.phone/)
    })
})
