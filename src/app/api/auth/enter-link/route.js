// /api/auth/enter-link — e-mail a one-tap "enter my book" link.
//
//   POST { email } → { ok: true }   (always the same answer)
//
// The login page's main button for anyone who has a book and no password in
// mind. Like /api/auth/password-link it never says whether an address is
// registered and sends at most one e-mail per address per minute. The link
// (src/lib/enterLink.js) is good for an hour and opens only that account.

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import { createHash } from 'crypto'
import { NextResponse } from 'next/server'
import nodemailer from 'nodemailer'
import { adminAuth, adminDb } from '@/lib/firebaseAdmin'
import { normalizeOwnerEmail } from '@/lib/ownerTransfer'
import { inCooldown } from '@/lib/passwordLink'
import { isSuperAdmin } from '@/lib/superAdmin'
import { enterSecret, signEnterToken, enterUrl, enterLinkEmail, LOGIN_LINK_TTL_MS } from '@/lib/enterLink'

const OK = () => NextResponse.json({ ok: true })

function originOf(req) {
    return process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') || new URL(req.url).origin
}

const keyFor = email => createHash('sha256').update(`enter:${email}`).digest('hex').slice(0, 40)

export async function POST(req) {
    try {
        const body = await req.json().catch(() => ({}))
        const email = normalizeOwnerEmail(body?.email)
        if (!email) return NextResponse.json({ ok: false, error: 'כתובת המייל לא תקינה' }, { status: 400 })

        const throttleRef = adminDb.collection('auth_link_requests').doc(keyFor(email))
        const prev = await throttleRef.get()
        if (inCooldown(prev.exists ? prev.data()?.lastAtMs : null, Date.now())) return OK()
        await throttleRef.set({ lastAtMs: Date.now() })

        let user
        try {
            user = await adminAuth.getUserByEmail(email)
        } catch (err) {
            if (err?.code === 'auth/user-not-found') return OK()
            throw err
        }

        if (isSuperAdmin(email)) return OK() // same answer, no link: see /api/auth/enter
        const token = signEnterToken(user.uid, { secret: enterSecret(), ttlMs: LOGIN_LINK_TTL_MS })
        if (!token) throw new Error('ENTER_LINK_SECRET is not set')
        const { subject, html, text } = enterLinkEmail({ email, url: enterUrl(originOf(req), token) })

        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: { user: process.env.MAIL_USER, pass: process.env.MAIL_PASS },
        })
        await transporter.sendMail({ from: `"Wedding Tales" <${process.env.MAIL_USER}>`, to: email, subject, html, text })
        return OK()
    } catch (err) {
        console.error('[enter-link] failed:', err?.message || err)
        return NextResponse.json({ ok: false, error: 'לא הצלחנו לשלוח עכשיו. נסו שוב עוד רגע.' }, { status: 500 })
    }
}
