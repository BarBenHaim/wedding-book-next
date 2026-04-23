// src/lib/resolveAsset.js
//
// Legacy cover designs stored Next.js-bundled asset URLs like
// "/_next/static/media/tex1.6b805cb7.png" directly in Firestore. Every new
// build rehashes those filenames, so the URL stops resolving and the cover
// renders without its texture. We now store textures under /public/textures/
// with stable filenames, but we still have to migrate older data at render
// time.
//
// resolveTextureUrl maps legacy URLs to the stable /textures/* path based on
// the filename prefix ("tex1", "tex2", "tex3"). Anything we don't recognize
// passes through unchanged — a user-uploaded Firebase Storage URL, a null, or
// any future asset shape.
const LEGACY_TEXTURE_MAP = {
    tex1: '/textures/tex1.png',
    tex2: '/textures/tex2.png',
    tex3: '/textures/tex3.png',
}

export function resolveTextureUrl(url) {
    if (!url || typeof url !== 'string') return url
    // Match "/_next/static/media/tex1.<hash>.png" or similar.
    const match = url.match(/\/_next\/static\/media\/(tex[123])\./)
    if (match && LEGACY_TEXTURE_MAP[match[1]]) {
        return LEGACY_TEXTURE_MAP[match[1]]
    }
    return url
}
