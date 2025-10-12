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

        // --- יצירת מסמך חתונה תואם למבנה שלך ---
        await db.collection('weddings').doc(weddingId).set(
            {
                ownerEmail: email,
                createdAt: FieldValue.serverTimestamp(),
                orderId, // נשמר רק לצורך מעקב
            },
            { merge: true }
        )
        console.log('💾 Wedding created →', weddingId)

        // --- שליחת מייל ---
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: { user: process.env.MAIL_USER, pass: process.env.MAIL_PASS },
        })

        await transporter.sendMail({
            from: `"Wedding Tales" <${process.env.MAIL_USER}>`,
            to: email,
            subject: 'החתונה שלך מוכנה 🎉',
            html: `
        <p>היי ${name || ''},</p>
        <p>החתונה שלך נוצרה בהצלחה! עכשיו יש לך גישה מלאה למערכת.</p>
        <p><b>אימייל:</b> ${email}<br>
        ${password ? `<b>סיסמה ראשונית:</b> ${password}<br>` : ''}
        <b>מזהה חתונה:</b> ${weddingId}</p>
        <p><a href="https://the-wedding-gift.vercel.app/login">להתחברות למערכת</a></p>
        <p style="font-size:12px;color:#666">אם כבר יש לך משתמש, הסיסמה שלך לא שונתה.</p>
      `,
        })
        console.log('📧 Email sent successfully to:', email)

        return NextResponse.json({ success: true, weddingId, email })
    } catch (err) {
        console.error('❌ Fatal error in createWedding:', err)
        return NextResponse.json({ error: 'Internal error' }, { status: 500 })
    }
}
