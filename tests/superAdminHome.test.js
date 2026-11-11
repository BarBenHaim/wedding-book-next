import { describe, expect, it } from 'vitest'
import { isSuperAdmin, superAdminHomeFor, SUPER_ADMIN_HOME, SUPER_ADMIN_EMAILS } from '@/lib/superAdmin'

describe('where the super-admin lands after signing in', () => {
    it('sends every super-admin to /admin', () => {
        expect(SUPER_ADMIN_HOME).toBe('/admin')
        expect(SUPER_ADMIN_EMAILS.length).toBeGreaterThan(0)
        for (const email of SUPER_ADMIN_EMAILS) {
            expect(superAdminHomeFor(email)).toBe('/admin')
            expect(superAdminHomeFor(email.toUpperCase())).toBe('/admin')
        }
    })

    it('says nothing for a customer, so the usual event lookup decides', () => {
        expect(isSuperAdmin('customer@example.com')).toBe(false)
        expect(superAdminHomeFor('customer@example.com')).toBe(null)
        expect(superAdminHomeFor('')).toBe(null)
        expect(superAdminHomeFor(null)).toBe(null)
        expect(superAdminHomeFor(undefined)).toBe(null)
    })
})
