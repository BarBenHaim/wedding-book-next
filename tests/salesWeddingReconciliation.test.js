import { describe, expect, it, vi } from 'vitest'

import { classifyWeddingSale, reconcileWeddingSale } from '@/lib/salesAgent/weddingSalesReconciliation'

describe('Wedding sales reconciliation', () => {
    it('classifies a paid Wedding without a Woo order as owner reported', () => {
        expect(classifyWeddingSale('wed-test-one', {
            amountPaid: '990',
            currency: 'ILS',
            ownerPhone: '052-661-8184',
            ownerName: ' דנה כהן ',
            ownerEmail: 'DANA@EXAMPLE.COM',
            eventType: 'bar_mitzvah',
        })).toMatchObject({
            kind: 'owner_reported_paid',
            reference: 'manual-wedding:wed-test-one',
            amount: 990,
            currency: 'ILS',
            phone: '972526618184',
            buyerName: 'דנה כהן',
            ownerEmail: 'dana@example.com',
            weddingId: 'wed-test-one',
        })
    })

    it.each([
        [{ amountPaid: null }, 'not_paid'],
        [{ amountPaid: 0 }, 'not_paid'],
        [{ amountPaid: 'not-money' }, 'not_paid'],
        [{ amountPaid: 990, currency: 'USD' }, 'unsupported_currency'],
        [{ amountPaid: 990, currency: 'ILS', orderId: 'woo-test-one' }, 'linked_woocommerce'],
    ])('fails closed for %o', (wedding, kind) => {
        expect(classifyWeddingSale('wed-test-two', wedding).kind).toBe(kind)
    })

    it('closes an exact-phone owner-reported sale without a send dependency', async () => {
        const closeLeadOnPurchase = vi.fn(async () => '972526618184')
        const result = await reconcileWeddingSale('wed-test-three', {
            amountPaid: 990,
            currency: 'ILS',
            ownerPhone: '0526618184',
            ownerName: 'דנה',
        }, { closeLeadOnPurchase })

        expect(result).toEqual({ action: 'closed' })
        expect(closeLeadOnPurchase).toHaveBeenCalledWith({
            phone: '972526618184',
            orderId: 'manual-wedding:wed-test-three',
            weddingId: 'wed-test-three',
            amount: 990,
            packageId: null,
            buyerName: 'דנה',
            paymentSource: 'wedding_app_manual',
        })
    })

    it.each([
        [{ amountPaid: 990, currency: 'ILS', ownerPhone: '' }, 'unmatched_phone'],
        [{ amountPaid: 0, currency: 'ILS', ownerPhone: '0526618184' }, 'not_paid'],
        [{ amountPaid: 990, currency: 'USD', ownerPhone: '0526618184' }, 'unsupported_currency'],
        [{ amountPaid: 990, currency: 'ILS', ownerPhone: '0526618184', orderId: 'woo-test-two' }, 'linked_woocommerce'],
    ])('does not close a lead for %o', async (wedding, action) => {
        const closeLeadOnPurchase = vi.fn()
        await expect(reconcileWeddingSale('wed-test-four', wedding, { closeLeadOnPurchase })).resolves.toEqual({ action })
        expect(closeLeadOnPurchase).not.toHaveBeenCalled()
    })
})
