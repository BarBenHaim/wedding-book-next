export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const fetchCache = 'force-no-store'
export const preferredRegion = 'iad1'

import { NextResponse } from 'next/server'
import nodemailer from 'nodemailer'
import crypto from 'crypto'
import { adminDb as db } from '@/lib/firebaseAdmin'

export async function POST(req) {
    try {
        // קבלת הגוף כמו שהוא
        const buffer = Buffer.from(await req.arrayBuffer())
        const rawBody = buffer.toString('utf8')

        const signature = req.headers.get('x-wc-webhook-signature')
        const secret = process.env.WC_WEBHOOK_SECRET

        if (!signature || rawBody.length < 50) {
            console.log('⚠️ WooCommerce ping or missing signature → returning 200 OK')
            return new Response('OK', { status: 200 })
        }

        const generatedSignature = crypto.createHmac('sha256', secret).update(buffer).digest('base64')
        if (signature !== generatedSignature) {
            console.warn('⚠️ Invalid signature.')
            console.log('Expected:', generatedSignature)
            console.log('Got:', signature)
            return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
        }

        console.log('✅ Signature verified successfully.')

        // פירוק גוף הבקשה
        const body = JSON.parse(rawBody)
        const { billing, id } = body || {}
        const email = billing?.email
        const name = `${billing?.first_name || ''} ${billing?.last_name || ''}`.trim()

        if (!email || !id) {
            return NextResponse.json({ error: 'Missing email or order id' }, { status: 400 })
        }

        const password = Math.random().toString(36).slice(-8)
        const weddingId = `wed_${id}`

        // ✅ מבנה זהה כמו בהרשמה (ownerEmail + createdAt + entries)
        await db.collection('weddings').doc(weddingId).set({
            ownerEmail: email,
            createdAt: new Date(),
        })

        console.log('💾 Wedding document created →', weddingId)

        // יצירת משתמש משנה (מידע נוסף אם תרצה לשמור)
        await db.collection('weddings').doc(weddingId).collection('meta').doc('user').set({
            name,
            email,
            password,
            createdAt: new Date(),
        })

        console.log('💾 Meta user info saved →', weddingId)

        // שליחת מייל
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: { user: process.env.MAIL_USER, pass: process.env.MAIL_PASS },
        })

        await transporter.sendMail({
            from: `"Wedding Tales" <${process.env.MAIL_USER}>`,
            to: email,
            subject: 'החתונה שלך מוכנה 🎉',
            html: `
                <p>היי ${name},</p>
                <p>תודה על ההזמנה! החתונה שלך נוצרה בהצלחה.</p>
                <p><b>שם משתמש:</b> ${email}<br>
                <b>סיסמה:</b> ${password}<br>
                <b>מזהה החתונה:</b> ${weddingId}</p>
                <p><a href="https://the-wedding-gift.vercel.app/login">להתחברות למערכת</a></p>
            `,
        })

        console.log('📧 Email sent successfully to:', email)

        return NextResponse.json({ success: true, email, weddingId })
    } catch (err) {
        console.error('❌ Fatal error in createWedding:', err)
        return NextResponse.json({ error: 'Internal error' }, { status: 500 })
    }
}
