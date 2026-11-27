import { describe, expect, it } from 'vitest'
import { hallFor } from '@/lib/hallRoutes'

describe('which screens wear the house design', () => {
    it('dresses the owner and public screens that have no look of their own', () => {
        for (const path of [
            '/set-password', '/terms', '/privacy', '/account-deletion',
            '/wedding/abc/admin', '/wedding/abc/portal/classic/', '/wedding/abc/stats/tok',
            '/manage/tok', '/arrange/tok',
        ]) expect(hallFor(path), path).toEqual({ header: true, page: true, band: true })
    })

    it('dresses a screen with its own frame without adding the sky band', () => {
        // /my draws its own top bar, the photos page is a full-screen viewer
        for (const path of ['/my', '/manage/tok/photos']) {
            expect(hallFor(path), path).toEqual({ header: true, page: true, band: false })
        }
    })

    it('gives only the top bar to screens that draw themselves', () => {
        for (const path of ['/wedding/abc/viewer', '/wedding/abc/portal']) {
            expect(hallFor(path), path).toEqual({ header: true, page: false, band: false })
        }
    })

    it('never touches a guest screen, whose look the owner chose', () => {
        for (const path of [
            '/wedding/abc', '/wedding/abc/photo', '/wedding/abc/thanks', '/wedding/abc/edit/e1',
            '/wedding/abc/gallery', '/wedding/abc/book/tok', '/w/slug', '/g/slug', '/b/tok',
        ]) expect(hallFor(path), path).toBe(null)
    })

    it('leaves the admin, the print files and unknown addresses alone', () => {
        for (const path of ['/admin', '/admin/studio', '/admin/wedding/abc/cover-print', '/start', '/app', '/login', '/termsandmore', '', undefined, null]) {
            expect(hallFor(path), String(path)).toBe(null)
        }
    })
})
