import { describe, it, expect } from 'vitest'
import { ownerWeddingView } from '@/lib/server/ownerViews'

describe('the owner view of an event', () => {
    const doc = {
        customTitle: 'נועם',
        eventType: 'bar_mitzvah',
        paymentStage: 'deposit',
        balanceDue: 800,
        digitalTokens: ['tok', 'other'],
        // none of these may reach the browser
        ownerEmail: 'a@b.co',
        customerPhone: '050',
        orderTotal: 990,
    }

    it('carries what the portal needs to show the balance step and the event look', () => {
        const v = ownerWeddingView(doc)
        expect(v.paymentStage).toBe('deposit')
        expect(v.balanceDue).toBe(800)
        expect(v.eventType).toBe('bar_mitzvah')
    })

    it('still leaves private order fields out', () => {
        const v = ownerWeddingView(doc)
        expect(v).not.toHaveProperty('ownerEmail')
        expect(v).not.toHaveProperty('customerPhone')
        expect(v).not.toHaveProperty('orderTotal')
        expect(v.digitalTokens).toEqual(['tok'])
    })
})
