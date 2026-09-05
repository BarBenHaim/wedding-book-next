import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

// A guard for a bug that is invisible from either side on its own.
//
// /api/admin/weddings PATCH accepted designVariant and guestDesign and
// wrote them correctly. Its GET returned neither. Nothing errored: the
// editors read `undefined`, fell back to their empty defaults, and
// showed "no design selected" for events that had one — and then wrote
// that emptiness back over the real value.
//
// A field the client writes but can never read back is the shape of
// that bug, so this asserts the round trip exists in the source.

const root = path.resolve(__dirname, '..')
const route = fs.readFileSync(path.join(root, 'src/app/api/admin/weddings/route.js'), 'utf8')
    .replace(/\r\n/g, '\n')

// The object literal the GET handler returns, from `return {` up to the
// closing of that block.
const returned = (() => {
    const i = route.indexOf('return {\n                    id: doc.id,')
    expect(i, 'the GET return shape moved — re-check this guard').toBeGreaterThan(-1)
    return route.slice(i, route.indexOf('\n            })', i))
})()

// Keys the admin table and the guest-design editor read off a row. Each
// must survive the round trip, or the screen silently edits a default.
const MUST_ROUND_TRIP = ['designVariant', 'guestDesign', 'eventType', 'themeColor', 'blessingMaxChars', 'productionStatus']

describe('admin weddings GET returns what the editors write', () => {
    for (const key of MUST_ROUND_TRIP) {
        it(`returns ${key}`, () => {
            expect(returned).toMatch(new RegExp(`\\b${key}:`))
        })
    }

    it('every key it returns is also writable, or deliberately read-only', () => {
        // Not every returned field is editable (counts, ids, timestamps).
        // This only checks the direction that bit us: a key the PATCH
        // whitelist accepts and the GET drops.
        const allowed = route.slice(route.indexOf('const ALLOWED = ['), route.indexOf('const clean = {}'))
        const writable = [...allowed.matchAll(/'([a-zA-Z]+)'/g)].map(m => m[1])
        // `key,` matches a shorthand property (weddingDate, amountPaid,
        // currency are computed above and spread in by name).
        // bookDesign is the one deliberate omission: it is the heavy
        // object, and the list carries the derived `hasDesign` instead.
        const dropped = writable.filter(
            k => !new RegExp(`\\b${k}\\s*[,:]`).test(returned) && !['bookDesign'].includes(k),
        )
        expect(dropped, `writable but never returned: ${dropped.join(', ')}`).toEqual([])
    })
})
