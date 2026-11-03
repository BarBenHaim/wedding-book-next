export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// /api/admin/reset-password — super-admin sends a customer a link to
// CHOOSE their own password (POST { email }).
//
// It used to overwrite the password with a random one and email that.
// Now it emails the same set-password link the login page's "אין לי
// סיסמה" button sends (src/lib/passwordLink.js): the current password
// keeps working until the customer picks a new one, and they end up
// with a password they will remember.

import { NextResponse } from 'next/server'
import nodemailer from 'nodemailer'
import { adminAuth } from '@/lib/firebaseAdmin'
import { isSuperAdmin } from '@/lib/superAdmin'
import { oobCodeFromLink, setPasswordUrl, setPasswordEmail } from '@/lib/passwordLink'

function originOf(req) {
    return process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') || new URL(req.url).origin
}

export async function POST(req) {
    const authHeader = req.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    try {
        const decoded = await adminAuth.verifyIdToken(authHeader.split('Bearer ')[1])
        if (!isSuperAdmin(decoded.email)) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        }
    } catch {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    try {
        const { email } = await req.json()
        if (!email) return NextResponse.json({ error: 'Missing email' }, { status: 400 })
        const clean = String(email).trim().toLowerCase()

        await adminAuth.getUserByEmail(clean) // 'User not found' below if missing
        const code = oobCodeFromLink(await adminAuth.generatePasswordResetLink(clean))
        if (!code) throw new Error('no oobCode in reset link')
        const { subject, html } = setPasswordEmail({ email: clean, url: setPasswordUrl(originOf(req), code), sentByUs: true })

        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: { user: process.env.MAIL_USER, pass: process.env.MAIL_PASS },
        })
        await transporter.sendMail({ from: `"Wedding Tales" <${process.env.MAIL_USER}>`, to: clean, subject, html })

        console.log(`🔑 Set-password link sent to ${clean} by super admin`)
        return NextResponse.json({ success: true })
    } catch (err) {
        console.error('[admin/reset-password] Error:', err)
        const msg = err.code === 'auth/user-not-found' ? 'אין חשבון למייל הזה — העבר אליו את האירוע ב"בעלים של האירוע"' : 'Failed to send link'
        return NextResponse.json({ error: msg }, { status: 500 })
    }
}
