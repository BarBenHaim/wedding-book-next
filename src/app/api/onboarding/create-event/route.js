export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// POST /api/onboarding/create-event — self-serve event creation from
// the /start wizard. The WooCommerce webhook (/api/createWedding) stays
// the paid path; THIS is the free path: a signed-in user creates their
// own event, capped at MAX_FREE_EVENTS per account.
//
// Auth: Firebase ID token in Authorization: Bearer <token>. Firestore
// rules block anonymous client writes to /weddings — all writes happen
// here with the Admin SDK after verifying the token.
//
// Body: { eventType, brideName?, groomName?, celebrantName?, age?,
//         weddingDate?, themeColor?, ownerName?, design? }
//   - design: optional resolved style object the client computed from a
//     studio preset (same trust model as /api/digital-edition/set-design:
//     the client owns the preset registry + next/font classNames, the
//     server does auth + a sanity cap).

import { NextResponse } from 'next/server'
import crypto from 'crypto'
import nodemailer from 'nodemailer'
import { adminDb as db, adminAuth } from '@/lib/firebaseAdmin'
import { FieldValue } from 'firebase-admin/firestore'
import { generateSlug } from '@/lib/generateSlug'
import { isSuperAdmin } from '@/lib/superAdmin'
import { validateNewEvent, buildWeddingDoc, eventDisplayTitle, FREE_EVENT_LIMIT, MAX_EVENTS_PER_USER, isFreePlan } from '@/lib/onboarding'

const MAX_DESIGN_BYTES = 8000

function isPlainObject(v) {
    return v != null && typeof v === 'object' && !Array.isArray(v)
}

export async function POST(req) {
    try {
        // ── 1. Who is asking? ────────────────────────────────────────
        const authz = req.headers.get('authorization') || ''
        const idToken = authz.startsWith('Bearer ') ? authz.slice(7).trim() : ''
        if (!idToken) {
            return NextResponse.json({ error: 'auth', message: 'נדרשת התחברות' }, { status: 401 })
        }
        let decoded
        try {
            decoded = await adminAuth.verifyIdToken(idToken)
        } catch {
            return NextResponse.json({ error: 'auth', message: 'ההתחברות פגה — נסו שוב' }, { status: 401 })
        }
        const uid = decoded.uid
        const email = (decoded.email || '').toLowerCase()

        // ── 2. Validate payload ──────────────────────────────────────
        const body = await req.json().catch(() => ({}))
        const check = validateNewEvent(body)
        if (!check.ok) {
            return NextResponse.json({ error: 'validation', errors: check.errors }, { status: 400 })
        }

        let design = null
        if (body.design !== undefined && body.design !== null) {
            if (!isPlainObject(body.design)) {
                return NextResponse.json({ error: 'validation', message: 'עיצוב לא תקין' }, { status: 400 })
            }
            if (JSON.stringify(body.design).length > MAX_DESIGN_BYTES) {
                return NextResponse.json({ error: 'validation', message: 'עיצוב גדול מדי' }, { status: 413 })
            }
            design = body.design
        }

        // ── 3. Event cap (super admins exempt): a FREE account (every
        //       owned event is plan:'free') opens one event; any paid
        //       package on the account unlocks up to MAX_EVENTS_PER_USER.
        const mine = await db.collection('weddings').where('ownerId', '==', uid).get()
        if (!isSuperAdmin(email)) {
            const freeAccount = mine.docs.every(d => isFreePlan(d.data()))
            const limit = freeAccount ? FREE_EVENT_LIMIT : MAX_EVENTS_PER_USER
            if (mine.size >= limit) {
                const message = freeAccount
                    ? 'בחשבון החינמי פותחים ספר אחד 🙂 חבילת הבסיס פותחת עד 3 אירועים — דברו איתנו בוואטסאפ'
                    : `אפשר עד ${MAX_EVENTS_PER_USER} אירועים בחשבון — דברו איתנו ונשמח להרחיב 💛`
                return NextResponse.json({ error: 'limit', message }, { status: 403 })
            }
        }

        // ── 4. Slug + no-login viewer token (same mechanism as the
        //        Woo path, so every downstream page just works) ───────
        let slug = generateSlug()
        const clash = await db.collection('weddings').where('slug', '==', slug).limit(1).get()
        if (!clash.empty) slug = generateSlug() // collision is astronomically rare; one retry is plenty

        const viewerToken = crypto.randomUUID()

        const ref = db.collection('weddings').doc()
        const doc = {
            ...buildWeddingDoc(check.value, { uid, email, name: body.ownerName }),
            createdAt: FieldValue.serverTimestamp(),
            slug,
            digitalTokens: [viewerToken],
            digitalTokensIssuedAt: [
                { token: viewerToken, issuedAt: new Date().toISOString(), issuedBy: 'onboarding' },
            ],
        }
        if (design) {
            doc.bookDesign = design
            doc.coverDesign = design // new event — no owner cover to preserve yet
            doc.bookDesignSource = 'onboarding'
            doc.bookDesignUpdatedAt = FieldValue.serverTimestamp()
        }
        await ref.set(doc)

        const base = (process.env.NEXT_PUBLIC_BASE_URL || 'https://app.weddingtales.co.il').replace(/\/$/, '')
        const links = {
            guest: `${base}/w/${slug}?go=photo`,
            book: `${base}/b/${viewerToken}`,
            portal: `${base}/wedding/${ref.id}/portal`,
        }

        // ── 5. Welcome email — best-effort, never blocks creation ────
        try {
            if (process.env.MAIL_USER && process.env.MAIL_PASS && email) {
                const title = eventDisplayTitle(check.value)
                const transporter = nodemailer.createTransport({
                    service: 'gmail',
                    auth: { user: process.env.MAIL_USER, pass: process.env.MAIL_PASS },
                })
                await transporter.sendMail({
                    from: `"Wedding Tales" <${process.env.MAIL_USER}>`,
                    to: email,
                    subject: `ספר הברכות של ${title} מוכן 🎉`,
                    html: `
<div style="font-family:Arial,'Heebo',sans-serif;direction:rtl;text-align:right;max-width:600px;margin:0 auto;background:#fdf9ef;border-radius:16px;overflow:hidden;">
  <div style="background:linear-gradient(135deg,#aa8840,#c9a44e);padding:26px 24px;color:#fff;">
    <h1 style="margin:0;font-size:21px;">מזל טוב! 🎉</h1>
    <p style="margin:8px 0 0;opacity:.92;font-size:14px;">ספר הברכות של ${title} נפתח ב-Wedding Tales</p>
  </div>
  <div style="padding:24px;">
    <p style="font-size:14px;line-height:1.8;color:#3d2e1a;margin:0 0 16px;">
      שמרו את המייל הזה — אלה הקישורים החשובים שלכם:
    </p>
    <div style="background:#fff;border:1px solid rgba(170,136,64,0.2);border-radius:12px;padding:16px;margin-bottom:10px;">
      <p style="margin:2px 0;font-size:13px;color:#3d2e1a;"><b>🔗 קישור לאורחים (לשיתוף):</b><br/><a href="${links.guest}" style="color:#aa8840;word-break:break-all;">${links.guest}</a></p>
    </div>
    <div style="background:#fff;border:1px solid rgba(170,136,64,0.2);border-radius:12px;padding:16px;margin-bottom:10px;">
      <p style="margin:2px 0;font-size:13px;color:#3d2e1a;"><b>📖 הספר הדיגיטלי:</b><br/><a href="${links.book}" style="color:#aa8840;word-break:break-all;">${links.book}</a></p>
    </div>
    <div style="text-align:center;margin:18px 0 4px;">
      <a href="${links.portal}" style="background:linear-gradient(180deg,#d3b46a,#b8893d);color:#fff;text-decoration:none;padding:13px 26px;border-radius:14px;font-weight:700;font-size:15px;display:inline-block;">
        לניהול האירוע →
      </a>
    </div>
  </div>
  <div style="background:#fdf9ef;padding:14px 24px;border-top:1px solid rgba(170,136,64,0.2);text-align:center;color:#9a8665;font-size:11px;">
    באהבה, צוות Wedding Tales — Your moments, forever
  </div>
</div>`,
                })
            }
        } catch (mailErr) {
            console.warn('[onboarding] welcome email failed (non-fatal):', mailErr?.message || mailErr)
        }

        console.log('🎉 Self-serve event created →', ref.id, 'by', email || uid)
        return NextResponse.json({ weddingId: ref.id, slug, viewerToken, links })
    } catch (err) {
        console.error('❌ onboarding/create-event failed:', err)
        return NextResponse.json({ error: 'internal', message: 'משהו השתבש — נסו שוב עוד רגע' }, { status: 500 })
    }
}
