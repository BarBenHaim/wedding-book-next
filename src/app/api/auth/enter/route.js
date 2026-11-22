// /api/auth/enter — trade a signed enter link for a Firebase custom token.
//
//   POST { t } → { ok: true, customToken }  |  { ok: false, error }
//
// The page /enter calls it with the token from the e-mail link, then signs
// in with the custom token. The token is only checked here (signature and
// expiry, src/lib/enterLink.js); the account has to still exist.

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { adminAuth } from '@/lib/firebaseAdmin'
import { enterSecret, verifyEnterToken } from '@/lib/enterLink'

export async function POST(req) {
    try {
        const body = await req.json().catch(() => ({}))
        const checked = verifyEnterToken(body?.t, { secret: enterSecret() })
        if (!checked.ok) {
            const expired = checked.reason === 'expired'
            return NextResponse.json(
                { ok: false, expired, error: expired ? 'הקישור פג תוקף' : 'הקישור לא תקין' },
                { status: 400 },
            )
        }
        try {
            await adminAuth.getUser(checked.uid)
        } catch (err) {
            if (err?.code === 'auth/user-not-found') {
                return NextResponse.json({ ok: false, error: 'החשבון לא נמצא' }, { status: 404 })
            }
            throw err
        }
        const customToken = await adminAuth.createCustomToken(checked.uid)
        return NextResponse.json({ ok: true, customToken })
    } catch (err) {
        console.error('[auth/enter] failed:', err?.message || err)
        return NextResponse.json({ ok: false, error: 'לא הצלחנו להכניס אתכם. נסו שוב.' }, { status: 500 })
    }
}
