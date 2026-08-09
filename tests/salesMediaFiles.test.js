import { describe, it, expect } from 'vitest'
import { existsSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { MEDIA } from '@/lib/salesAgent/catalog'
import { LIMITS } from '@/lib/salesAgent/mediaLibrary'

// Every built-in asset is a URL into public/. Nothing else in the stack
// ever checks that the file behind it exists: the model picks a key, the
// route hands the URL to Make, and WhatsApp is the first thing to look.
// A rename or a missed commit shows up as a message that arrives with no
// picture, to a customer, silently — which is exactly the failure that
// already happened once with the .webp spreads on the social plan.
const PUBLIC = join(process.cwd(), 'public')
const pathOf = url => join(PUBLIC, new URL(url).pathname)

describe('the built-in media actually exists', () => {
    for (const [key, m] of Object.entries(MEDIA)) {
        it(`${key} points at a real file`, () => {
            expect(existsSync(pathOf(m.url)), m.url).toBe(true)
        })
    }

    it('serves everything from our own origin', () => {
        // A URL anywhere else is our brand on somebody else's uptime.
        for (const [key, m] of Object.entries(MEDIA)) {
            expect(new URL(m.url).hostname, key).toBe('app.weddingtales.co.il')
        }
    })

    it('keeps every file under what WhatsApp will send', () => {
        for (const [key, m] of Object.entries(MEDIA)) {
            expect(statSync(pathOf(m.url)).size, key).toBeLessThan(LIMITS.image.maxBytes)
        }
    })
})

describe('every asset says when to use it', () => {
    it('has a caption and a trigger on all of them', () => {
        // `when` is the only field the model reads as an instruction. An
        // empty one is an asset that never gets sent, or gets sent to
        // the wrong person — the same failure the upload form refuses.
        for (const [key, m] of Object.entries(MEDIA)) {
            expect(m.when?.length, `${key} when`).toBeGreaterThan(10)
            expect(m.caption?.length, `${key} caption`).toBeGreaterThan(5)
        }
    })

    it('carries the three that answer the hesitations people actually voice', () => {
        for (const key of ['upload_screen', 'cover_personalised', 'book_open_spread']) {
            expect(MEDIA[key], key).toBeTruthy()
        }
    })

    it('lists those three first, because order is weight', () => {
        expect(Object.keys(MEDIA).slice(0, 3))
            .toEqual(['upload_screen', 'cover_personalised', 'book_open_spread'])
    })
})
