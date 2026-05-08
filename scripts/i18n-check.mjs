#!/usr/bin/env node
//
// Quick i18n parity script — run with `npm run i18n:check`.
//
// Same checks as tests/i18n.test.js but as a standalone CLI you can run
// in CI without spinning up vitest. Exits 0 on parity, 1 on drift.

import fs from 'node:fs'
import path from 'node:path'

const localesDir = path.resolve('src/i18n/messages')
const REFERENCE = 'he'
const TARGETS = ['en', 'es', 'it']

function readLocale(name) {
    return JSON.parse(fs.readFileSync(path.join(localesDir, `${name}.json`), 'utf8'))
}
function flatten(obj, prefix = '') {
    const out = {}
    for (const [k, v] of Object.entries(obj)) {
        const key = prefix ? `${prefix}.${k}` : k
        if (v && typeof v === 'object' && !Array.isArray(v)) Object.assign(out, flatten(v, key))
        else out[key] = v
    }
    return out
}

const reference = flatten(readLocale(REFERENCE))
const refKeys = Object.keys(reference).sort()

let problems = 0
for (const locale of TARGETS) {
    const target = flatten(readLocale(locale))
    const tgtKeys = Object.keys(target).sort()

    const missing = refKeys.filter(k => !(k in target))
    const extra = tgtKeys.filter(k => !(k in reference))

    if (missing.length) {
        console.error(`✗ ${locale}: ${missing.length} key(s) missing — first 5:`, missing.slice(0, 5))
        problems++
    }
    if (extra.length) {
        console.error(`✗ ${locale}: ${extra.length} extra key(s) not in he — first 5:`, extra.slice(0, 5))
        problems++
    }

    // ICU placeholder drift
    const placeholderRe = /\{([a-zA-Z0-9_]+)\}/g
    const drift = []
    for (const key of refKeys) {
        if (!(key in target)) continue
        const refVal = reference[key]
        const tgtVal = target[key]
        if (typeof refVal !== 'string' || typeof tgtVal !== 'string') continue
        const refPlace = (refVal.match(placeholderRe) || []).sort()
        const tgtPlace = (tgtVal.match(placeholderRe) || []).sort()
        if (JSON.stringify(refPlace) !== JSON.stringify(tgtPlace)) {
            drift.push({ key, he: refPlace, [locale]: tgtPlace })
        }
    }
    if (drift.length) {
        console.error(`✗ ${locale}: ${drift.length} placeholder drift(s) — first 3:`, drift.slice(0, 3))
        problems++
    }

    if (!missing.length && !extra.length && !drift.length) {
        console.log(`✓ ${locale} — ${tgtKeys.length} keys in parity with he`)
    }
}

process.exit(problems ? 1 : 0)
