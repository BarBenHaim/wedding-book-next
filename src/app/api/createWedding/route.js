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
        // --- קריאת גוף ובדיקת חתימה ---
        const buffer = Buffer.from(await req.arrayBuffer())
        const rawBody = buffer.toString('utf8')
        const signature = req.headers.get('x-wc-webhook-signature')
        const secret = process.env.WC_WEBHOOK_SECRET

        if (!signature || rawBody.length < 50) return new Response('OK', { status: 200 })
        if (!secret) return NextResponse.json({ error: 'Missing secret' }, { status: 500 })

        const generatedSignature = crypto.createHmac('sha256', secret).update(buffer).digest('base64')
        if (signature !== generatedSignature) return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })

        // --- פירוק גוף ---
        const body = JSON.parse(rawBody)
        const { billing, id: orderId } = body || {}
        const email = billing?.email?.trim()
        const name = `${billing?.first_name || ''} ${billing?.last_name || ''}`.trim()
        if (!email || !orderId) return NextResponse.json({ error: 'Missing email or order id' }, { status: 400 })

        // --- יצירת משתמש ב-Firebase Auth ---
        let userRecord
        let password = Math.random().toString(36).slice(-10)

        try {
            userRecord = await adminAuth.getUserByEmail(email)
            console.log('👤 User already exists →', userRecord.uid)
        } catch {
            userRecord = await adminAuth.createUser({
                email,
                password,
                displayName: name || undefined,
            })
            console.log('👤 Created new user →', userRecord.uid)
        }

        const weddingId = userRecord.uid

        // --- יצירת מסמך חתונה ---
        await db.collection('weddings').doc(weddingId).set(
            {
                ownerEmail: email,
                createdAt: FieldValue.serverTimestamp(),
                orderId,
            },
            { merge: true }
        )
        console.log('💾 Wedding created →', weddingId)

        // --- הכנת קישור לעמוד האישי ---
        const portalUrl = `https://the-wedding-gift.vercel.app/wedding/${weddingId}/portal`

        // --- שליחת מייל ---
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: { user: process.env.MAIL_USER, pass: process.env.MAIL_PASS },
        })

        const html = `
        <div style="font-family:Heebo,sans-serif;direction:rtl;text-align:right;padding:20px">
          <h2>🎉 מזל טוב ${name || ''}!</h2>
          <p>החתונה שלך נוצרה בהצלחה ב-Wedding Tales 🎊</p>

          <h3>פרטי גישה:</h3>
          <ul>
            <li><b>אימייל:</b> ${email}</li>
            ${password ? `<li><b>סיסמה ראשונית:</b> ${password}</li>` : ''}
            <li><b>מזהה חתונה:</b> ${weddingId}</li>
          </ul>

          <p>להתחברות למערכת: <a href="https://the-wedding-gift.vercel.app/login">לחצו כאן</a></p>

          <hr style="margin:25px 0;border:none;border-top:1px solid #eee"/>

          <h3>📱 עמוד החתונה שלכם</h3>
          <p>בעמוד האישי שלכם תוכלו:</p>
          <ul>
            <li>להציג ברקוד ענק לסריקה באירוע</li>
            <li>לשתף את הקישור בוואטסאפ לכל האורחים</li>
            <li>להוריד קובץ PDF מוכן להדפסה עם ה-QR</li>
          </ul>
          <p>לכניסה לעמוד האישי שלכם לחצו כאן:  
            <a href="${portalUrl}" style="color:#8B5CF6;">${portalUrl}</a>
          </p>

          <p style="margin-top:25px;">באהבה,<br>צוות Wedding Tales 💜</p>
        </div>
        `

        await transporter.sendMail({
            from: `"Wedding Tales" <${process.env.MAIL_USER}>`,
            to: email,
            subject: 'החתונה שלך מוכנה 🎉',
            html,
        })

        console.log('📧 Email sent successfully to:', email)
        return NextResponse.json({ success: true, weddingId, email })
    } catch (err) {
        console.error('❌ Fatal error in createWedding:', err)
        return NextResponse.json({ error: 'Internal error' }, { status: 500 })
    }
}
