// src/lib/imgProxy.js
//
// Our own image resizer — the rules, without the I/O (the route is
// src/app/api/img/route.js).
//
// Why we have one: the portal and the mobile app ask for small versions
// of guest photos through /_next/image, so a 4MB upload arrives as a
// ~30KB thumbnail. On this Vercel project that address answers 404 (see
// AGENTS.md, 11.11.2026), so every one of those pictures was broken.
// /api/img does the same job with sharp, and next.config.mjs points
// /_next/image at it, so the installed mobile app works again without an
// update.
//
// The request looks exactly like Next's:  ?url=<source>&w=<width>&q=<quality>

// Where a source may live. Same list as `images.remotePatterns` in
// next.config.mjs: the uploads (Firebase Storage) and our own domain
// (static files, and /api/book-photo proxy URLs).
export const ALLOWED_HOSTS = ['firebasestorage.googleapis.com', 'app.weddingtales.co.il']

// Widths we produce. A request is rounded UP to the next one, so the CDN
// keeps a handful of versions per picture instead of one per pixel.
export const WIDTHS = [64, 96, 128, 256, 384, 640, 750, 828, 1080, 1200, 1920]

export const DEFAULT_QUALITY = 72
export const MIN_QUALITY = 40
export const MAX_QUALITY = 90
export const MAX_SOURCE_BYTES = 25 * 1024 * 1024

export function snapWidth(w) {
    const n = Math.floor(Number(w))
    if (!Number.isFinite(n) || n <= 0) return null
    return WIDTHS.find(s => s >= n) ?? WIDTHS[WIDTHS.length - 1]
}

export function clampQuality(q) {
    const n = Math.floor(Number(q))
    if (!Number.isFinite(n) || n <= 0) return DEFAULT_QUALITY
    return Math.min(MAX_QUALITY, Math.max(MIN_QUALITY, n))
}

/**
 * Read ?url&w&q. `siteOrigin` is our own origin, used for relative sources
 * ("/logo-wt.png") and to recognise absolute links to ourselves.
 *
 * → { ok: true, src, width, quality, ownApi }   `src` is absolute https
 * → { ok: false, error }
 */
export function parseImgRequest(params, siteOrigin) {
    const get = k => (typeof params?.get === 'function' ? params.get(k) : params?.[k])
    const raw = String(get('url') ?? '').trim()
    if (!raw) return { ok: false, error: '"url" parameter is required' }
    if (raw.length > 3000) return { ok: false, error: '"url" parameter is too long' }

    const width = snapWidth(get('w'))
    if (!width) return { ok: false, error: '"w" parameter (width) is required' }

    let site
    try {
        site = new URL(siteOrigin)
    } catch {
        return { ok: false, error: 'bad site origin' }
    }

    let src
    try {
        // "//evil.com/x" is a link to another site, not a path on ours.
        if (raw.startsWith('/') && !raw.startsWith('//') && !raw.includes('\\')) src = new URL(raw, site)
        else src = new URL(raw)
    } catch {
        return { ok: false, error: '"url" parameter is not a valid address' }
    }

    const own = src.host === site.host
    if (!own) {
        if (src.protocol !== 'https:') return { ok: false, error: '"url" parameter must be https' }
        if (src.port || src.username || src.password) return { ok: false, error: '"url" parameter is not allowed' }
        if (!ALLOWED_HOSTS.includes(src.hostname)) return { ok: false, error: '"url" parameter is not allowed' }
    }

    // Never resize our own output: /api/img?url=/api/img?url=… would loop.
    const mine = own || src.hostname === 'app.weddingtales.co.il'
    if (mine && /^\/(api\/img|_next\/image)(\/|$)/.test(src.pathname)) return { ok: false, error: '"url" parameter is not allowed' }

    return {
        ok: true,
        src: src.toString(),
        width,
        quality: clampQuality(get('q')),
        // A source behind one of our own API routes (the token-gated
        // /api/book-photo): private to whoever holds the link.
        ownApi: mine && src.pathname.startsWith('/api/'),
    }
}

/** How long the result may be kept. */
export function cacheControlFor({ ownApi }) {
    // Token-gated photo: the browser may keep it, a shared cache may not.
    if (ownApi) return 'private, max-age=3600'
    // An upload keeps its address for life (a replaced photo gets a new
    // file name), so an hour in the browser and a day on the CDN is safe.
    return 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800'
}

/** webp when the caller understands it, otherwise what suits the picture. */
export function outputFormat(acceptHeader, hasAlpha) {
    if (/image\/webp/i.test(String(acceptHeader || ''))) return 'webp'
    return hasAlpha ? 'png' : 'jpeg'
}

/**
 * The address of a small version of `url`, served from OUR domain.
 *
 * Two reasons to show a guest photo this way instead of straight from
 * Firebase Storage: a 64px thumbnail does not need the 1MB original, and
 * some networks (office and campus web filters) block Google's storage
 * host outright — the page loads, the pictures do not. Our own domain is
 * the one address a visitor can certainly reach, since the page came
 * from it.
 *
 * Anything we cannot resize (data:, blob:, a relative path, another
 * host) comes back unchanged.
 */
export function thumbUrl(url, w = 640, q = DEFAULT_QUALITY) {
    if (typeof url !== 'string' || !/^https:\/\//i.test(url)) return url || null
    let host
    try {
        host = new URL(url).hostname
    } catch {
        return url
    }
    if (!ALLOWED_HOSTS.includes(host)) return url
    return `/api/img?url=${encodeURIComponent(url)}&w=${snapWidth(w) || 640}&q=${clampQuality(q)}`
}

/**
 * onError for an <img src={thumbUrl(original)} data-original={original}>:
 * if the small version fails, show the original once, so a problem in
 * the resizer never leaves an empty frame.
 */
export function fallBackToOriginal(event) {
    const img = event?.currentTarget
    const original = img?.dataset?.original
    if (!img || !original || img.dataset.fellBack) return
    img.dataset.fellBack = '1'
    img.src = original
}
