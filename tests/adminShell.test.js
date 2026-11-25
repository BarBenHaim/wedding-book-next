import { describe, expect, it } from 'vitest'
import { existsSync, readdirSync } from 'node:fs'
import { MORE, NAV, activeNav, adminShell } from '@/lib/adminShell'

describe('which admin screens get the menu', () => {
    it('gives the work screens the full menu and the admin font', () => {
        for (const path of ['/admin', '/admin/today', '/admin/customers', '/admin/customers/board', '/admin/sales-leads', '/admin/']) {
            expect(adminShell(path)).toEqual({ rail: 'full', serif: true, themed: true })
        }
    })

    it('narrows the menu for the design editors and leaves their look alone', () => {
        for (const path of ['/admin/studio', '/admin/album-studio', '/admin/guest-design']) {
            expect(adminShell(path)).toEqual({ rail: 'slim', serif: false, themed: false })
        }
    })

    it('frames the other tools without changing the font their previews inherit', () => {
        for (const path of ['/admin/emails', '/admin/qrcodes', '/admin/social-preview', '/admin/project']) {
            expect(adminShell(path)).toEqual({ rail: 'full', serif: false, themed: true })
        }
    })

    it('adds nothing around the print outputs or outside the admin', () => {
        for (const path of [
            '/admin/wedding/abc123/cover-print', '/admin/wedding/abc123/picabook-export/',
            '/', '/login', '/wedding/abc/admin', '/administrator', undefined, null,
        ]) expect(adminShell(path)).toBe(null)
    })

    it('has a menu entry for every admin screen', () => {
        const root = new URL('../src/app/admin/', import.meta.url)
        const folders = readdirSync(root, { withFileTypes: true })
            .filter(entry => entry.isDirectory() && existsSync(new URL(`${entry.name}/page.js`, root)))
            .map(entry => `/admin/${entry.name}`)
        const linked = [...NAV, ...MORE].map(item => item.href).filter(Boolean)
        expect(linked).toEqual(expect.arrayContaining(['/admin', ...folders]))
    })
})

describe('which menu entry is lit', () => {
    it('lights the screen itself for the entries of the menu', () => {
        expect(activeNav('/admin/today')).toBe('/admin/today')
        expect(activeNav('/admin/customers/')).toBe('/admin/customers')
        expect(activeNav('/admin/studio')).toBe('/admin/studio')
    })

    it('lights the "more" entry for a screen that sits inside it', () => {
        for (const path of ['/admin', '/admin/sales-leads', '/admin/customers/board', '/admin/qrcodes', '/admin/emails']) {
            expect(activeNav(path)).toBe('more')
        }
    })

    it('keeps the daily screens in the menu and the older ones under "more"', () => {
        expect(NAV.map(item => item.href || item.open)).toEqual(['/admin/today', '/admin/customers', 'bot', 'spend', '/admin/studio'])
        expect(MORE.map(item => item.href)).toEqual(expect.arrayContaining(['/admin', '/admin/sales-leads', '/admin/customers/board']))
    })
})
