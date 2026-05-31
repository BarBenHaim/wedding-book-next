export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const fetchCache = 'force-no-store'
export const preferredRegion = 'iad1'

import { NextResponse } from 'next/server'
import nodemailer from 'nodemailer'
import crypto from 'crypto'
import { adminDb as db, adminAuth } from '@/lib/firebaseAdmin'
import { FieldValue } from 'firebase-admin/firestore'
import { generateSlug } from '@/lib/generateSlug'

export async function POST(req) {
    try {
        // --- 1. קריאת גוף ובדיקת חתימה (אבטחה) ---
        const buffer = Buffer.from(await req.arrayBuffer())
        const rawBody = buffer.toString('utf8')
        const signature = req.headers.get('x-wc-webhook-signature')
        const secret = process.env.WC_WEBHOOK_SECRET

        if (!signature || rawBody.length < 50) return new Response('OK', { status: 200 })
        if (!secret) return NextResponse.json({ error: 'Missing secret' }, { status: 500 })

        const generatedSignature = crypto.createHmac('sha256', secret).update(buffer).digest('base64')
        if (signature !== generatedSignature) return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })

        // --- 2. פירוק נתוני ההזמנה ---
        const body = JSON.parse(rawBody)
        const { billing, id, status } = body || {}

        const orderId = id ? String(id) : null

        if (!orderId) {
            console.error('❌ Invalid orderId:', orderId)
            return NextResponse.json({ error: 'Invalid order id' }, { status: 400 })
        }

        const email = billing?.email?.trim()
        const name = `${billing?.first_name || ''} ${billing?.last_name || ''}`.trim()

        if (!email) return NextResponse.json({ error: 'Missing email' }, { status: 400 })

        // --- 3. שמירת נתונים גולמיים (לצורכי גיבוי ודיבוג) ---
        await db.collection('ordersRaw').doc(orderId).set({
            body,
            receivedAt: FieldValue.serverTimestamp(),
        })

        // --- 4. בדיקת סטטוס תשלום ---
        if (!['processing', 'completed'].includes(status)) {
            console.log(`⏭️ Skipping order ${orderId} due to status: ${status}`)
            return NextResponse.json({ skipped: true, reason: 'wrong_status' })
        }

        // --- 5. מניעת כפילויות (Idempotency) ---
        // וידוא שההזמנה לא קיימת כבר במערכת האלבומים
        const existing = await db.collection('weddings').where('orderId', '==', orderId).limit(1).get()
        if (!existing.empty) {
            console.log(`⛔ Wedding for order ${orderId} already exists`)
            return NextResponse.json({ skipped: true, reason: 'already_created' })
        }

        // נעילת התהליך כדי למנוע ריצות מקבילות מאותה בקשת Webhook
        const lockRef = db.collection('ordersLocks').doc(orderId)
        const lockSnap = await lockRef.get()

        if (lockSnap.exists) {
            console.log(`🔒 Lock exists for order ${orderId}, skipping duplicate`)
            return NextResponse.json({ skipped: true, reason: 'locked' })
        }

        await lockRef.set({
            createdAt: FieldValue.serverTimestamp(),
        })

        // --- 6. ניהול משתמשים (Auth) - התיקון החשוב ---
        let userRecord
        let password = null
        let isNewUser = false

        try {
            // ניסיון לאתר לקוח קיים (למשל, לקוח שקונה אלבום שני)
            userRecord = await adminAuth.getUserByEmail(email)
            console.log('👤 User already exists →', userRecord.uid)
        } catch {
            // יצירת לקוח חדש רק אם לא קיים
            password = Math.random().toString(36).slice(-10)
            userRecord = await adminAuth.createUser({
                email,
                password,
                displayName: name || undefined,
            })
            isNewUser = true
            console.log('👤 Created new user →', userRecord.uid)
        }

        // --- 7. יצירת מסמך החתונה החדש ---
        // אנחנו משתמשים ב-orderId בתור ה-weddingId כדי שלקוח יוכל שיהיו לו כמה חתונות במקביל
        const weddingId = orderId

        // יצירת slug קצר וייחודי לקישור יפה
        let slug = generateSlug()
        // וידוא שה-slug לא קיים כבר
        const slugCheck = await db.collection('weddings').where('slug', '==', slug).limit(1).get()
        if (!slugCheck.empty) slug = generateSlug() // retry once — collision is extremely rare

        // טוקן לצפייה ללא-התחברות בספר הדיגיטלי (זהה למנגנון של
        // /api/digital-edition/grant) — מאפשר לזוג לפתוח את הספר ולבחור
        // עיצוב מבלי להזדהות, ולשתף את הקישור עם בני הזוג.
        const viewerToken = crypto.randomUUID()

        await db.collection('weddings').doc(weddingId).set(
            {
                ownerId: userRecord.uid, // הקישור החשוב ללקוח במערכת
                ownerEmail: email,
                ownerPhone: (billing?.phone || '').trim(),
                amountPaid: body?.total ?? null,
                currency: body?.currency ?? null,
                createdAt: FieldValue.serverTimestamp(),
                orderId,
                slug,
                digitalTokens: FieldValue.arrayUnion(viewerToken),
                digitalTokensIssuedAt: FieldValue.arrayUnion({
                    token: viewerToken,
                    issuedAt: new Date().toISOString(),
                    issuedBy: 'createWedding',
                }),
            },
            { merge: true },
        )

        console.log('💾 Wedding created →', weddingId)

        // קישורים למייל — כניסה למערכת (עם פרטי גישה) + צפייה ללא-התחברות.
        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://app.weddingtales.co.il'
        const loginUrl = `${baseUrl}/login`
        const viewerUrl = `${baseUrl}/wedding/${weddingId}/book/${viewerToken}`

        // --- 8. שליחת מייל ללקוח ---
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: { user: process.env.MAIL_USER, pass: process.env.MAIL_PASS },
        })

        // מייל מותג עם שני מסלולים: (1) כניסה למערכת עם פרטי גישה
        // (לעריכה וניהול), (2) קישור ללא-התחברות לצפייה בספר ולבחירת עיצוב.
        const passwordRow = isNewUser
            ? `<p style="margin:4px 0;font-size:14px;color:#3d2e1a;"><b>סיסמה:</b> ${password}</p>`
            : `<p style="margin:4px 0;font-size:14px;color:#7a6a52;">השתמשו בסיסמה הקיימת שלכם (שכחתם? אפשר לאפס בעמוד ההתחברות).</p>`

        const html = `
<div style="font-family:Arial,'Heebo',sans-serif;direction:rtl;text-align:right;max-width:600px;margin:0 auto;background:#fdf9ef;border-radius:16px;overflow:hidden;">
  <div style="background:linear-gradient(135deg,#aa8840,#c9a44e);padding:28px 24px;color:#fff;">
    <h1 style="margin:0;font-size:22px;">מזל טוב${name ? ` ${name}` : ''}! 💍</h1>
    <p style="margin:8px 0 0;opacity:.9;font-size:14px;">החתונה שלכם נוצרה בהצלחה ב-Wedding Tales</p>
  </div>

  <div style="padding:24px;">
    <h2 style="font-size:16px;color:#3d2e1a;margin:0 0 12px;">הכניסה האישית שלכם לניהול</h2>
    <div style="background:#fff;border:1px solid rgba(170,136,64,0.2);border-radius:12px;padding:16px;margin-bottom:12px;">
      <p style="margin:4px 0;font-size:14px;color:#3d2e1a;"><b>אימייל:</b> ${email}</p>
      ${passwordRow}
    </div>
    <div style="text-align:center;margin:8px 0 4px;">
      <a href="${loginUrl}" style="background:linear-gradient(180deg,#d3b46a,#b8893d);color:#fff;text-decoration:none;padding:13px 26px;border-radius:14px;font-weight:700;font-size:15px;display:inline-block;">
        כניסה למערכת →
      </a>
    </div>
    <p style="font-size:12px;color:#9a8665;text-align:center;margin:10px 0 0;">בעמוד הניהול תוכלו לערוך פרטים, לצפות בברכות ולשתף את הקישור לאורחים.</p>

    <div style="height:1px;background:rgba(170,136,64,0.2);margin:24px 0;"></div>

    <h2 style="font-size:16px;color:#3d2e1a;margin:0 0 8px;">הספר שלכם — לצפייה ובחירת עיצוב ✨</h2>
    <p style="font-size:14px;line-height:1.7;color:#7a6a52;margin:0 0 16px;">
      קישור אישי לצפייה בספר ולבחירת העיצוב שאתם הכי אוהבים — בלי צורך בהתחברות. אפשר לפתוח בכל מכשיר ולשתף עם בן/בת הזוג.
    </p>
    <div style="text-align:center;margin:8px 0;">
      <a href="${viewerUrl}" style="background:#fff;border:2px solid #aa8840;color:#aa8840;text-decoration:none;padding:12px 24px;border-radius:14px;font-weight:700;font-size:15px;display:inline-block;">
        צפו בספר ובחרו עיצוב →
      </a>
    </div>
    <p style="font-size:11px;color:#9a8665;text-align:center;margin:12px 0 0;word-break:break-all;">${viewerUrl}</p>
  </div>

  <div style="background:#fdf9ef;padding:16px 24px;border-top:1px solid rgba(170,136,64,0.2);text-align:center;color:#9a8665;font-size:11px;">
    באהבה, צוות Wedding Tales — Your moments, forever
  </div>
</div>
`

        await transporter.sendMail({
            from: `"Wedding Tales" <${process.env.MAIL_USER}>`,
            to: email,
            subject: 'החתונה שלך מוכנה',
            html,
        })

        console.log('📧 Email sent successfully to:', email)

        return NextResponse.json({ success: true, weddingId, email })
    } catch (err) {
        console.error('❌ Fatal error in createWedding:', err)
        return NextResponse.json({ error: 'Internal error' }, { status: 500 })
    }
}
