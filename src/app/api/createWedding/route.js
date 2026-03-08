export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const fetchCache = 'force-no-store'
export const preferredRegion = 'iad1'

import { NextResponse } from 'next/server'
import nodemailer from 'nodemailer'
import crypto from 'crypto'
import { adminDb as db, adminAuth } from '@/lib/firebaseAdmin'
import { FieldValue } from 'firebase-admin/firestore'

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

        await db.collection('weddings').doc(weddingId).set(
            {
                ownerId: userRecord.uid, // הקישור החשוב ללקוח במערכת
                ownerEmail: email,
                createdAt: FieldValue.serverTimestamp(),
                orderId,
            },
            { merge: true },
        )

        console.log('💾 Wedding created →', weddingId)

        // --- 8. שליחת מייל ללקוח ---
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: { user: process.env.MAIL_USER, pass: process.env.MAIL_PASS },
        })

        // התאמת התוכן בהתאם לסוג הלקוח (חדש / חוזר)
        const html = `
        <div style="font-family:Heebo,sans-serif;direction:rtl;text-align:right;padding:20px">
          <h2>מזל טוב ${name || ''}!</h2>
          <p>החתונה שלך נוצרה בהצלחה ב-Wedding Tales 🎊</p>

          <h3>פרטי הגישה שלך:</h3>
          <ul>
            <li><b>אימייל:</b> ${email}</li>
            ${
                isNewUser
                    ? `<li><b>סיסמה:</b> ${password}</li>`
                    : `<li><b>סיסמה:</b> השתמש בסיסמה הקיימת שלך (במידה ושכחת, תוכל לאפס אותה בעמוד ההתחברות)</li>`
            }
          </ul>

          <p>להתחברות למערכת: 
            <a href="https://app.weddingtales.co.il/login">לחצו כאן</a>
          </p>

          <hr style="margin:25px 0;border:none;border-top:1px solid #eee"/>
          <p style="margin-top:25px;">באהבה,<br>צוות Wedding Tales 💜</p>
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
