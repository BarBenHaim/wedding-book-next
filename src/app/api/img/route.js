// GET /api/img?url=<source>&w=<width>&q=<quality>
//
// Small versions of guest photos, for the portal and the mobile app.
// The same request shape as Next's /_next/image, which next.config.mjs
// rewrites to here. The rules (which sources, which widths, how long to
// cache) are in src/lib/imgProxy.js.
//
// If anything goes wrong on the way — the source is slow, too big, in a
// format sharp cannot read — the caller is sent to the original picture
// instead of getting a broken image.

import { NextResponse } from 'next/server'
import sharp from 'sharp'
import { parseImgRequest, cacheControlFor, outputFormat, MAX_SOURCE_BYTES } from '@/lib/imgProxy'

export const runtime = 'nodejs'
export const maxDuration = 30

function siteOrigin(req) {
    return process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') || new URL(req.url).origin
}

const MIME = { webp: 'image/webp', jpeg: 'image/jpeg', png: 'image/png' }

export async function GET(req) {
    const parsed = parseImgRequest(new URL(req.url).searchParams, siteOrigin(req))
    if (!parsed.ok) {
        return new NextResponse(parsed.error, { status: 400, headers: { 'Cache-Control': 'no-store' } })
    }
    const { src, width, quality } = parsed
    const original = () => NextResponse.redirect(src, { status: 302, headers: { 'Cache-Control': 'no-store' } })

    try {
        const upstream = await fetch(src, {
            redirect: 'manual',
            cache: 'no-store',
            signal: AbortSignal.timeout(15000),
            headers: { Accept: 'image/*' },
        })
        if (upstream.status === 404) {
            return new NextResponse('The requested image was not found', { status: 404, headers: { 'Cache-Control': 'no-store' } })
        }
        if (!upstream.ok) return original()

        const type = (upstream.headers.get('content-type') || '').split(';')[0].trim().toLowerCase()
        if (!type.startsWith('image/')) {
            return new NextResponse('The requested resource is not an image', { status: 400, headers: { 'Cache-Control': 'no-store' } })
        }
        if (Number(upstream.headers.get('content-length') || 0) > MAX_SOURCE_BYTES) return original()

        const input = Buffer.from(await upstream.arrayBuffer())
        if (input.length > MAX_SOURCE_BYTES) return original()

        // .rotate() with no angle applies the camera's EXIF orientation —
        // without it phone photos come out sideways once the tag is dropped.
        // Vector artwork (studio backgrounds) is DRAWN here and sent as a
        // picture — we never re-serve SVG markup from our own domain. It
        // has no pixel size of its own, so it is rendered sharp enough for
        // the width asked and may grow to it.
        const isSvg = type === 'image/svg+xml'
        const read = isSvg ? { failOn: 'none', density: 192 } : { failOn: 'none' }
        const image = sharp(input, read).rotate().resize({ width, withoutEnlargement: !isSvg })
        const { hasAlpha } = await sharp(input, read).metadata()
        const format = outputFormat(req.headers.get('accept'), hasAlpha)
        const output =
            format === 'webp'
                ? await image.webp({ quality }).toBuffer()
                : format === 'png'
                  ? await image.png({ compressionLevel: 9 }).toBuffer()
                  : await image.flatten({ background: '#ffffff' }).jpeg({ quality, mozjpeg: true }).toBuffer()

        return new NextResponse(output, {
            status: 200,
            headers: {
                'Content-Type': MIME[format],
                'Content-Length': String(output.length),
                'Cache-Control': cacheControlFor(parsed),
                Vary: 'Accept',
                'X-Content-Type-Options': 'nosniff',
                'Content-Disposition': 'inline',
            },
        })
    } catch (err) {
        console.warn('[img] could not resize, sending the original:', err?.message || err)
        return original()
    }
}
