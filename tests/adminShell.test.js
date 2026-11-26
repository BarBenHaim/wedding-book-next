import { describe, expect, it } from 'vitest'
import { existsSync, readdirSync } from 'node:fs'
import { NAV, activeNav, adminShell, tabsFor } from '@/lib/adminShell'
import nextConfig from '../next.config.mjs'

describe('which admin screens get the menu', () => {
    it('gives the work screens the full menu and the admin font', () => {
        for (const path of ['/admin', '/admin/customers', '/admin/customers/board', '/admin/sales-leads', '/admin/']) {
            expect(adminShell(path)).toEqual({ rail: 'full', serif: true, themed: true })
        }
    })

    it('narrows the menu for the design editors and leaves their look alone', () => {
        for (const path of ['/admin/studio', '/admin/guest-design']) {
            expect(adminShell(path)).toEqual({ rail: 'slim', serif: false, themed: false })
        }
    })

    it('frames the other tools without changing the font their previews inherit', () => {
        for (const path of ['/admin/emails', '/admin/qrcodes']) {
            expect(adminShell(path)).toEqual({ rail: 'full', serif: false, themed: true })
        }
    })

    it('adds nothing around the print outputs or outside the admin', () => {
        for (const path of [
            '/admin/wedding/abc123/cover-print', '/admin/wedding/abc123/picabook-export/',
            '/', '/login', '/wedding/abc/admin', '/administrator', undefined, null,
        ]) expect(adminShell(path)).toBe(null)
    })

    it('reaches every admin screen from the menu or from the tabs inside it', () => {
        const root = new URL('../src/app/admin/', import.meta.url)
        const folders = readdirSync(root, { withFileTypes: true })
            .filter(entry => entry.isDirectory() && existsSync(new URL(`${entry.name}/page.js`, root)))
            .map(entry => `/admin/${entry.name}`)
        const linked = NAV.flatMap(item => [item.href, ...(item.tabs || []).map(tab => tab.href)]).filter(Boolean)
        expect(linked).toEqual(expect.arrayContaining(['/admin', '/admin/customers/board', ...folders]))
    })
})

describe('the menu', () => {
    it('has four places and the two windows', () => {
        expect(NAV.map(item => item.href || item.open)).toEqual(['/admin/customers', '/admin', '/admin/sales-leads', '/admin/studio', 'bot', 'spend'])
    })

    it('lights the place a screen belongs to', () => {
        expect(activeNav('/admin/customers/')).toBe('/admin/customers')
        expect(activeNav('/admin')).toBe('/admin')
        expect(activeNav('/admin/qrcodes')).toBe('/admin')
        for (const path of ['/admin/sales-leads', '/admin/customers/board', '/admin/emails']) expect(activeNav(path), path).toBe('/admin/sales-leads')
        for (const path of ['/admin/studio', '/admin/guest-design']) expect(activeNav(path), path).toBe('/admin/studio')
        expect(activeNav('/admin/nothing-here')).toBe(null)
    })

    it('offers the neighbouring screens of a place as tabs', () => {
        expect(tabsFor('/admin/emails').map(tab => tab.href)).toEqual(['/admin/sales-leads', '/admin/customers/board', '/admin/emails'])
        expect(tabsFor('/admin').map(tab => tab.href)).toEqual(['/admin', '/admin/qrcodes'])
        expect(tabsFor('/admin/guest-design/').map(tab => tab.href)).toEqual(['/admin/studio', '/admin/guest-design'])
    })

    it('draws no tabs where a place is a single screen, or around a print output', () => {
        for (const path of ['/admin/customers', '/admin/wedding/abc/cover-print', '/login', undefined]) expect(tabsFor(path), String(path)).toEqual([])
    })

    it('sends the old "today" address to the home screen, so saved links keep working', async () => {
        const redirects = await nextConfig.redirects()
        expect(redirects).toContainEqual({ source: '/admin/today', destination: '/admin/customers', permanent: false })
    })
})
