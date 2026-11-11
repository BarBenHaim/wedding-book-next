'use client'

// src/lib/storageReach.js
//
// "Can this browser reach Google's storage host?"
//
// Guest photos, covers and uploaded backgrounds live on
// firebasestorage.googleapis.com. Some networks do not let a browser talk
// to that host — office and campus web filters, antivirus that inspects
// HTTPS — and the symptom is a book that loads with every picture
// missing and `net::ERR_CERT_AUTHORITY_INVALID` in the console (Lord's
// own computer, 11.11.2026; his phone on another network was fine).
//
// The page itself came from our domain, so our domain is the one address
// such a browser can certainly reach. When — and only when — a picture
// fails straight from storage but loads through /api/img, every book
// page and cover on screen asks for its pictures through /api/img
// instead. The answer is shared by the whole page: the two templates
// every surface renders through (BookPageTemplate, BookCoverTemplate)
// read it, so the viewer, the digital book, the design galleries and the
// exports are all covered from one place.
//
// Every picture is checked, not just the first one. On Lord's computer
// the cover (a PNG) loaded straight from storage while every guest photo
// (JPEG) did not — a single "is storage reachable?" probe that happened
// to pick the cover would have said yes and left the photos missing.
//
// Everybody else keeps loading the originals exactly as before: the
// print exports rasterise what is on screen, and they should get the
// untouched files whenever the browser can fetch them.

import { useEffect, useMemo, useSyncExternalStore } from 'react'
import { thumbUrl } from './imgProxy'

export const STORAGE_PREFIX = 'https://firebasestorage.googleapis.com/'
// Sizes for a book page shown through our domain: wide enough for the
// 21cm printed page, gentle compression.
export const BOOK_WIDTH = 1920
export const BOOK_QUALITY = 88

const CACHE_KEY = 'wt_storage_blocked'

export function isStorageUrl(value) {
    // An address, not a sentence that happens to begin with one.
    return typeof value === 'string' && value.startsWith(STORAGE_PREFIX) && !/\s/.test(value)
}

/**
 * A copy of `value` in which every Firebase Storage address — at any
 * depth of a plain object or array — points at our own domain instead.
 * Returns `value` itself when `on` is false or when it holds no such
 * address, so memoised consumers do not re-render for nothing.
 *
 * RENDER ONLY. Never save the result: the addresses in it are ours, not
 * the files' own.
 */
export function viaOurDomain(value, on = true, { width = BOOK_WIDTH, quality = BOOK_QUALITY } = {}) {
    if (!on) return value
    const walk = v => {
        if (isStorageUrl(v)) return thumbUrl(v, width, quality)
        if (Array.isArray(v)) {
            let changed = false
            const out = v.map(item => {
                const next = walk(item)
                if (next !== item) changed = true
                return next
            })
            return changed ? out : v
        }
        if (v && typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype) {
            let changed = false
            const out = {}
            for (const key of Object.keys(v)) {
                const next = walk(v[key])
                if (next !== v[key]) changed = true
                out[key] = next
            }
            return changed ? out : v
        }
        return v
    }
    return walk(value)
}

/** The first Firebase Storage address found in the arguments, or null. */
export function firstStorageUrl(...values) {
    const seen = new Set()
    const find = v => {
        if (isStorageUrl(v)) return v
        if (!v || typeof v !== 'object' || seen.has(v)) return null
        seen.add(v)
        for (const item of Array.isArray(v) ? v : Object.values(v)) {
            const hit = find(item)
            if (hit) return hit
        }
        return null
    }
    for (const v of values) {
        const hit = find(v)
        if (hit) return hit
    }
    return null
}

/** Every distinct Firebase Storage address found in the arguments. */
export function allStorageUrls(...values) {
    const out = new Set()
    const seen = new Set()
    const walk = v => {
        if (isStorageUrl(v)) return void out.add(v)
        if (!v || typeof v !== 'object' || seen.has(v)) return
        seen.add(v)
        for (const item of Array.isArray(v) ? v : Object.values(v)) walk(item)
    }
    values.forEach(walk)
    return [...out]
}

function loads(src) {
    return new Promise(resolve => {
        const img = new window.Image()
        img.onload = () => resolve(img.naturalWidth > 0)
        img.onerror = () => resolve(false)
        img.src = src
    })
}

/**
 * What the two probes mean.
 *   straight from storage loads            → reachable (false)
 *   storage fails, our domain loads it     → blocked   (true)
 *   both fail                              → that file is the problem,
 *                                            not the network (false)
 */
export function verdict({ direct, viaUs }) {
    return direct === false && viaUs === true
}

// ── One answer per page load, shared by every component ─────────────
let blocked = false
const listeners = new Set()
const checked = new Set()

function subscribe(notify) {
    listeners.add(notify)
    return () => listeners.delete(notify)
}

function setBlocked() {
    if (blocked) return
    blocked = true
    try {
        window.sessionStorage.setItem(CACHE_KEY, '1')
    } catch { /* private mode */ }
    listeners.forEach(notify => notify())
}

/** The current answer, for code that is not a component (uploads). */
export function isStorageBlocked() {
    if (blocked) return true
    try {
        return typeof window !== 'undefined' && window.sessionStorage.getItem(CACHE_KEY) === '1'
    } catch {
        return false
    }
}

/**
 * Check one picture, once: does it load straight from storage, and if
 * not, does it load through us? Costs nothing extra when it loads — the
 * browser is fetching that very address for the page anyway.
 */
export function checkStorageUrl(url) {
    if (typeof window === 'undefined' || blocked || !isStorageUrl(url) || checked.has(url)) return
    checked.add(url)
    try {
        if (window.sessionStorage.getItem(CACHE_KEY) === '1') return setBlocked()
    } catch { /* private mode */ }
    ;(async () => {
        const direct = await loads(url)
        if (direct || blocked) return
        const viaUs = await loads(thumbUrl(url, 64))
        if (verdict({ direct, viaUs })) setBlocked()
    })()
}

/**
 * True once any picture on the page failed straight from storage but
 * loaded through us. Pass whatever the component is about to render
 * (entry, style…): every storage address in it gets checked.
 */
export function useStorageBlocked(...sources) {
    const isBlocked = useSyncExternalStore(
        subscribe,
        () => blocked,
        () => false
    )
    useEffect(() => {
        if (!blocked) allStorageUrls(...sources).forEach(checkStorageUrl)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, sources)
    return isBlocked
}

/** `viaOurDomain(value, blocked)`, stable between renders. */
export function useViaOurDomain(value, isBlocked) {
    return useMemo(() => viaOurDomain(value, isBlocked), [value, isBlocked])
}
