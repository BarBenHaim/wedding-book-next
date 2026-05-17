// GET /api/admin/qrcodes/png?code=xxx&size=800
//
// Returns a clean PNG of the QR code (no caption, no logo, no
// decoration — exactly what the user asked for). The QR encodes
// `https://<origin>/q/{code}`, which the redirect handler at
// /q/[code]/route.js resolves to the current target.
//
// Why a server endpoint (vs client-side rendering): the user
// wants a one-click download from /admin/qrcodes that produces a
// real PNG file ready to print. Doing this server-side gives us
// a clean Content-Disposition: attachment, the right
// content-type, and exact pixel dimensions — no canvas dance on
// the client.

import { NextResponse } from 'next/server'
import { adminAuth, adminDb } from '@/lib/firebaseAdmin'
import { isSuperAdmin } from '@/lib/superAdmin'
import QRCode from 'qrcode'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function authenticate(req) {
    const authHeader = req.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) return { ok: false, status: 401, error: 'Unauthorized' }
    try {
        const decoded = await adminAuth.verifyIdToken(authHeader.split('Bearer ')[1])
        if (!isSuperAdmin(decoded.email)) return { ok: false, status: 403, error: 'Forbidden' }
        return { ok: true }
    } catch {
        return { ok: false, status: 401, error: 'Invalid token' }
    }
}

export async function GET(req) {
    const auth = await authenticate(req)
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

    const { searchParams } = new URL(req.url)
    const code = (searchParams.get('code') || '').trim()
    const size = Math.min(2000, Math.max(200, parseInt(searchParams.get('size') || '800', 10)))
    if (!code) return NextResponse.json({ error: 'Missing code' }, { status: 400 })

    try {
        // Sanity-check the QR exists (so the admin can't accidentally
        // print a sticker pointing to a non-existent doc).
        const snap = await adminDb.collection('qrcodes').doc(code).get()
        if (!snap.exists) {
            return NextResponse.json({ error: 'Code not found' }, { status: 404 })
        }

        // Build the absolute URL the QR encodes. We prefer
        // NEXT_PUBLIC_SITE_URL (set in .env), then fall back to the
        // request's origin so this works in dev too.
        const origin =
            (process.env.NEXT_PUBLIC_SITE_URL && process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, '')) ||
            new URL(req.url).origin
        const qrTarget = `${origin}/q/${code}`

        // High error correction so the printed QR survives stickers
        // / fingerprints / partial damage at events. ~30% of the
        // code can be lost and the scanner still resolves.
        const png = await QRCode.toBuffer(qrTarget, {
            errorCorrectionLevel: 'H',
            type: 'png',
            width: size,
            margin: 2,
            color: { dark: '#000000', light: '#ffffff' },
        })

        return new NextResponse(png, {
            status: 200,
            headers: {
                'Content-Type': 'image/png',
                'Content-Disposition': `attachment; filename="qr-${code}.png"`,
                'Cache-Control': 'private, max-age=300',
            },
        })
    } catch (err) {
        console.error('[qr png] failed:', err?.message || err)
        return NextResponse.json({ error: 'Generation failed' }, { status: 500 })
    }
}
