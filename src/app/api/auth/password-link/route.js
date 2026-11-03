// /api/auth/password-link — email a "choose your password" link.
//
//   POST { email } → { ok: true }   (always the same answer)
//
// Public on purpose: it is the "I have no password / forgot it" button on
// /login. It never reveals whether an address is registered, sends at
// most one email per address per minute, and the link only lets the
// owner of that inbox set a password. See src/lib/passwordLink.js.

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import { createHash } from 'crypto'
import { NextResponse } from 'next/server'
import nodemailer from 'nodemailer'
import { adminAuth, adminDb } from '@/lib/firebaseAdmin'
import { normalizeOwnerEmail } from '@/lib/ownerTransfer'
import { oobCodeFromLink, setPasswordUrl, setPasswordEmail, inCooldown } from '@/lib/passwordLink'

const OK = () => NextResponse.json({ ok: true })

function originOf(req) {
    return process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') || new URL(req.url).origin
}

// The address itself never becomes a document id (closed collection
// anyway — firestore.rules' catch-all denies clients).
const keyFor = email => createHash('sha256').update(email).digest('hex').slice(0, 40)

export async function POST(req) {
    try {
        const body = await req.json().catch(() => ({}))
        const email = normalizeOwnerEmail(body?.email)
        if (!email) return NextResponse.json({ ok: false, error: 'כתובת המייל לא תקינה' }, { status: 400 })

        const throttleRef = adminDb.collection('auth_link_requests').doc(keyFor(email))
        const prev = await throttleRef.get()
        if (inCooldown(prev.exists ? prev.data()?.lastAtMs : null, Date.now())) return OK()
        await throttleRef.set({ lastAtMs: Date.now() })

        try {
            await adminAuth.getUserByEmail(email)
        } catch (err) {
            if (err?.code === 'auth/user-not-found') return OK()
            throw err
        }

        const code = oobCodeFromLink(await adminAuth.generatePasswordResetLink(email))
        if (!code) throw new Error('no oobCode in reset link')
        const { subject, html } = setPasswordEmail({ email, url: setPasswordUrl(originOf(req), code) })

        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: { user: process.env.MAIL_USER, pass: process.env.MAIL_PASS },
        })
        await transporter.sendMail({ from: `"Wedding Tales" <${process.env.MAIL_USER}>`, to: email, subject, html })
        return OK()
    } catch (err) {
        console.error('[password-link] failed:', err?.message || err)
        return NextResponse.json({ ok: false, error: 'לא הצלחנו לשלוח עכשיו. נסו שוב עוד רגע.' }, { status: 500 })
    }
}
