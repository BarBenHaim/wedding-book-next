import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

// i18n parity guard.
//
// The Hebrew locale is the source of truth: every key written there
// MUST exist in en/es/it. Without this guard, a translator (or a busy
// dev — see also: me) can ship a missing key and the page in the
// affected locale renders the raw key string ("photo.pageTitleNew")
// instead of translated text. That bug is invisible until a Spanish-
// speaking user happens to land on the page.
//
// We also flag unused keys (in en/es/it but not in he) — usually a
// rename/typo we should clean up.
//
// Runs in ~5 ms; cheap enough to add to CI.

const localesDir = path.resolve('src/i18n/messages')
const REFERENCE = 'he'
const TARGETS = ['en', 'es', 'it']

function readLocale(name) {
    const raw = fs.readFileSync(path.join(localesDir, `${name}.json`), 'utf8')
    return JSON.parse(raw)
}

function flatten(obj, prefix = '') {
    const out = {}
    for (const [k, v] of Object.entries(obj)) {
        const key = prefix ? `${prefix}.${k}` : k
        if (v && typeof v === 'object' && !Array.isArray(v)) {
            Object.assign(out, flatten(v, key))
        } else {
            out[key] = v
        }
    }
    return out
}

describe('i18n locale parity', () => {
    const reference = flatten(readLocale(REFERENCE))
    const referenceKeys = Object.keys(reference).sort()

    for (const locale of TARGETS) {
        describe(`${locale}.json`, () => {
            const target = flatten(readLocale(locale))
            const targetKeys = Object.keys(target).sort()

            it('contains every key from the reference locale (he)', () => {
                const missing = referenceKeys.filter(k => !(k in target))
                expect(missing, `${locale} is missing these keys:\n${missing.join('\n')}`).toEqual([])
            })

            it('does not have keys missing from the reference locale (he)', () => {
                const extra = targetKeys.filter(k => !(k in reference))
                expect(extra, `${locale} has keys not in he:\n${extra.join('\n')}`).toEqual([])
            })

            it('preserves ICU placeholders {x} per key', () => {
                // Cheap regex: every {placeholder} in he should also be
                // present in the target locale. Catches translator
                // typos like {nmae} or accidental dropping of {name}.
                const placeholderRe = /\{([a-zA-Z0-9_]+)\}/g
                const drift = []
                for (const key of referenceKeys) {
                    if (!(key in target)) continue
                    const refVal = reference[key]
                    const tgtVal = target[key]
                    if (typeof refVal !== 'string' || typeof tgtVal !== 'string') continue
                    const refPlace = (refVal.match(placeholderRe) || []).sort()
                    const tgtPlace = (tgtVal.match(placeholderRe) || []).sort()
                    if (JSON.stringify(refPlace) !== JSON.stringify(tgtPlace)) {
                        drift.push(`  ${key}: he=${JSON.stringify(refPlace)} vs ${locale}=${JSON.stringify(tgtPlace)}`)
                    }
                }
                expect(drift, `placeholder drift in ${locale}:\n${drift.join('\n')}`).toEqual([])
            })
        })
    }
})
