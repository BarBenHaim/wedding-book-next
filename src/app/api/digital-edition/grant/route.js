// POST /api/digital-edition/grant
//
// Generates a digital-edition access token for a wedding and (optionally)
// emails the link to the owner. Super-admin only.
//
// Body:
//   { weddingId: string, sendEmail?: boolean }
//
// Response:
//   { token: string, link: string }
//
// The token is a UUID v4 appended to `weddings/{id}.digitalTokens` —
// an array of tokens. The /wedding/[id]/book/[token] page checks the
// URL token against this array. To revoke, remove the token from the
// array (a "revoke" endpoint can come later; for now do it from the
// Firestore console or admin SDK).

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { adminDb, adminAuth } from '@/lib/firebaseAdmin'
import { FieldValue } from 'firebase-admin/firestore'
import nodemailer from 'nodemailer'
import { isSuperAdmin } from '@/lib/superAdmin'
import { randomUUID } from 'node:crypto'

export async function POST(req) {
    // ─── Auth: super-admin only ────────────────────────────────────
    const authHeader = req.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    let decoded
    try {
        decoded = await adminAuth.verifyIdToken(authHeader.split('Bearer ')[1])
    } catch {
        return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
    }
    if (!isSuperAdmin(decoded.email)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // ─── Parse body ────────────────────────────────────────────────
    const body = await req.json().catch(() => ({}))
    const { weddingId, sendEmail = false } = body || {}
    if (!weddingId || typeof weddingId !== 'string') {
        return NextResponse.json({ error: 'Missing weddingId' }, { status: 400 })
    }

    // ─── Verify wedding exists, fetch owner email for the email body ─
    const wedRef = adminDb.collection('weddings').doc(weddingId)
    const wedSnap = await wedRef.get()
    if (!wedSnap.exists) {
        return NextResponse.json({ error: 'Wedding not found' }, { status: 404 })
    }
    const wed = wedSnap.data() || {}
    const ownerEmail = (wed.ownerEmail || wed.email || '').trim()

    // ─── Generate + persist the token ───────────────────────────────
    const token = randomUUID()
    await wedRef.update({
        digitalTokens: FieldValue.arrayUnion(token),
        digitalTokensIssuedAt: FieldValue.arrayUnion({
            token,
            issuedAt: new Date().toISOString(),
            issuedBy: decoded.email || 'admin',
        }),
    })

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://weddingtales.co.il'
    const link = `${baseUrl}/wedding/${weddingId}/book/${token}`

    // ─── Optional email ─────────────────────────────────────────────
    let emailSent = false
    let emailError = null
    if (sendEmail && ownerEmail) {
        try {
            const transporter = nodemailer.createTransport({
                service: 'gmail',
                auth: {
                    user: process.env.MAIL_USER,
                    pass: process.env.MAIL_PASS,
                },
            })
            const bride = (wed.brideNameHe || wed.brideName || '').trim()
            const groom = (wed.groomNameHe || wed.groomName || '').trim()
            const headlineNames =
                bride && groom ? `${bride} ו${groom}` : bride || groom || ''
            await transporter.sendMail({
                from: process.env.MAIL_USER,
                to: ownerEmail,
                subject: `הספר הדיגיטלי שלכם מוכן ✨${headlineNames ? ` — ${headlineNames}` : ''}`,
                html: `
<div style="font-family:Arial,sans-serif;direction:rtl;text-align:right;max-width:600px;margin:0 auto;background:#fdf9ef;padding:0;border-radius:16px;overflow:hidden;">
  <div style="background:linear-gradient(135deg,#aa8840,#c9a44e);padding:28px 24px;color:#fff;">
    <h1 style="margin:0;font-size:22px;">הספר הדיגיטלי שלכם מוכן! 💌</h1>
    <p style="margin:8px 0 0;opacity:.85;font-size:14px;">${headlineNames ? `${headlineNames} — ` : ''}Wedding Tales</p>
  </div>
  <div style="padding:24px;">
    <p style="font-size:15px;line-height:1.7;color:#3d2e1a;margin:0 0 16px;">
      שמחים לבשר — המהדורה הדיגיטלית של ספר הברכות שלכם זמינה לצפייה בכל מכשיר, בכל זמן, ללא הגבלה.
    </p>
    <p style="font-size:14px;line-height:1.7;color:#7a6a52;margin:0 0 24px;">
      הקישור אישי לכם בלבד — אפשר לשתף אותו עם משפחה וחברים. פתחו במחשב או בטלפון.
    </p>
    <div style="text-align:center;margin:24px 0;">
      <a href="${link}" style="background:linear-gradient(180deg,#d3b46a,#b8893d);color:#fff;text-decoration:none;padding:14px 28px;border-radius:14px;font-weight:700;font-size:15px;display:inline-block;">
        פתחו את הספר →
      </a>
    </div>
    <p style="font-size:12px;color:#9a8665;margin:24px 0 0;line-height:1.6;text-align:center;">
      או העתיקו את הקישור הבא:<br/>
      <span style="color:#aa8840;word-break:break-all;">${link}</span>
    </p>
  </div>
  <div style="background:#fdf9ef;padding:16px 24px;border-top:1px solid rgba(170,136,64,0.2);text-align:center;color:#9a8665;font-size:11px;">
    Wedding Tales — Your moments, forever
  </div>
</div>`,
            })
            emailSent = true
        } catch (err) {
            console.error('[digital-edition/grant] email failed', err)
            emailError = err?.message || 'email-failed'
        }
    }

    return NextResponse.json({
        token,
        link,
        emailSent,
        emailError,
    })
}
