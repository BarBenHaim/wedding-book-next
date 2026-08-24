import { describe, expect, it } from 'vitest'
import { ADDONS, PACKAGES, buildCheckoutHref } from '@/app/bar-mitzvah/BarMitzvahPricingClient'

describe('bar mitzvah offer page', () => {
    it('shows one truthful 990-shekel printed and digital offer', () => {
        expect(PACKAGES).toHaveLength(1)
        expect(PACKAGES[0]).toMatchObject({ id: 'printed', price: 990, recommended: true })
        expect(PACKAGES[0].includes).toEqual(expect.arrayContaining([
            'ספר דיגיטלי מעוצב לשיתוף ולהורדה',
            'ספר מודפס בכריכה קשה עד הבית',
        ]))
        expect(ADDONS).toEqual([])
    })

    it('uses the verified WooCommerce checkout instead of a WhatsApp fallback', () => {
        const result = buildCheckoutHref({
            pkg: PACKAGES[0],
            addonIds: [],
            checkoutBase: 'https://weddingtales.co.il/checkout/?add-to-cart=6271',
            whatsappUrl: 'https://wa.link/test',
        })

        expect(result.isWhatsApp).toBe(false)
        expect(result.href).toContain('add-to-cart=6271')
        expect(result.href).toContain('amount=990')
    })
})
