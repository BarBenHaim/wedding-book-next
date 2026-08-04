'use client'

// Resolve a photo's aspect ratio (width / height) for no-crop ("album")
// rendering.
//
// New uploads carry a measured `imgAspect` (written at upload time by
// src/lib/uploadEntry.js and the /api/guest/update-entry sharp path), so
// the stored value is used as-is and nothing here runs. LEGACY entries —
// the ones already sitting in existing blessing books, which is exactly
// the case the no-crop toggle exists for — have no stored aspect, so we
// measure the bitmap client-side and let the slot resize once it lands.
//
// Correctness does NOT depend on this hook. With `contain`, the photo is
// never cropped whether or not we know the aspect; knowing it only lets
// the SLOT hug the photo so there are no empty bars around it. If the
// measurement never resolves (offline, CORS, broken URL) the page still
// renders the whole photo, just centred in the default slot.
//
// The cache is module-level and keyed by URL, so:
//   • the same photo measured once stays resolved across re-renders,
//     page flips, and the export DOM that html2canvas captures;
//   • a cached aspect is returned SYNCHRONOUSLY on first render, which
//     is what keeps the print/PDF capture faithful — the exporters
//     re-render the same photos that the on-screen book already
//     measured, so the captured slot matches what the user saw.

import { useEffect, useState } from 'react'

// url -> number (resolved aspect). Never holds failures, so a transient
// error can be retried by a later mount.
const aspectCache = new Map()
// url -> Promise, so N pages showing the same photo share one decode.
const pending = new Map()

export function measureAspect(src) {
    if (aspectCache.has(src)) return Promise.resolve(aspectCache.get(src))
    if (pending.has(src)) return pending.get(src)
    const p = new Promise(resolve => {
        if (typeof window === 'undefined') return resolve(null)
        const img = new window.Image()
        // The book already loads these photos for display; anonymous CORS
        // matches how html2canvas fetches them, so this reuses the same
        // cache entry instead of forcing a second network request.
        img.crossOrigin = 'anonymous'
        img.onload = () => {
            const a = img.naturalWidth > 0 && img.naturalHeight > 0 ? img.naturalWidth / img.naturalHeight : null
            if (a) aspectCache.set(src, a)
            resolve(a)
        }
        img.onerror = () => resolve(null)
        img.src = src
    }).finally(() => pending.delete(src))
    pending.set(src, p)
    return p
}

/**
 * @param {string|null} src        photo URL
 * @param {number|null} storedAspect  entry.imgAspect when present
 * @param {boolean} enabled        only measure when no-crop is actually on
 * @returns {number|null} aspect (w/h), or null while unknown
 */
export default function useImageAspect(src, storedAspect, enabled = true) {
    const stored = Number(storedAspect) > 0 ? Number(storedAspect) : null
    // Seed from the cache so a photo measured earlier (or on a previous
    // page flip) sizes correctly on the very first render — no flash of
    // the wrong slot, and no dependence on an effect having run.
    const [measured, setMeasured] = useState(() => (stored || !src || !enabled ? null : aspectCache.get(src) ?? null))

    useEffect(() => {
        if (stored || !src || !enabled) return
        const cached = aspectCache.get(src)
        if (cached) {
            setMeasured(cached)
            return
        }
        let cancelled = false
        measureAspect(src).then(a => {
            if (!cancelled && a) setMeasured(a)
        })
        return () => {
            cancelled = true
        }
    }, [src, stored, enabled])

    return stored || measured
}

export { aspectCache }
