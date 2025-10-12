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
        // 🧩 קבלת הגוף כמו שהוא, בלי JSON.parse או עיבוד מוקדם
        const buffer = Buffer.from(await req.arrayBuffer())
        const rawBody = buffer.toString('utf8')

        const signature = req.headers.get('x-wc-webhook-signature')
        const secret = process.env.WC_WEBHOOK_SECRET

        console.log('🧪 Signature header present?:', !!signature, '| Body length:', rawBody.length)
        console.log('🧪 First 150 chars of rawBody:', JSON.stringify(rawBody.slice(0, 150)))

        if (!signature || rawBody.length < 50) {
            console.log('⚠️ WooCommerce ping or missing signature → returning 200 OK')
            return new Response('OK', { status: 200 })
        }

        if (!secret) {
            console.error('❌ Missing WC_WEBHOOK_SECRET')
            return NextResponse.json({ error: 'Missing secret' }, { status: 500 })
        }

        // 🟣 חישוב החתימה בשתי דרכים לבדיקה
        const sigBuffer = crypto.createHmac('sha256', secret).update(buffer).digest('base64')
        const sigBody = crypto.createHmac('sha256', secret).update(rawBody).digest('base64')
        const sigTrim = crypto.createHmac('sha256', secret).update(rawBody.trimEnd()).digest('base64')

        console.log('🔍 Signatures check:')
        console.log('- Using buffer :', sigBuffer)
        console.log('- Using rawBody :', sigBody)
        console.log('- Using trimEnd :', sigTrim)
        console.log('- WooCommerce sent:', signature)

        // בדיקה אם אחת מהן תואמת
        const valid = signature === sigBuffer || signature === sigBody || signature === sigTrim

        if (!valid) {
            console.warn('⚠️ Invalid signature detected.')
            console.log('🧩 Possible causes:')
            console.log('1️⃣ Encoding/extra newline difference')
            console.log('2️⃣ Wrong WC_WEBHOOK_SECRET')
            console.log('3️⃣ Middleware altered body')
            return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
        }

        console.log('✅ Signature verified successfully.')

        // עכשיו נפרסר את ה־JSON
        let body
        try {
            body = JSON.parse(rawBody)
        } catch (err) {
            console.error('❌ Failed to parse JSON:', err)
            return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
        }

        const { billing, id } = body || {}
        const email = billing?.email
        const name = `${billing?.first_name || ''} ${billing?.last_name || ''}`.trim()

        if (!email || !id) {
            console.warn('⚠️ Missing email or order id in body')
            return NextResponse.json({ error: 'Missing email or order id' }, { status: 400 })
        }

        const password = Math.random().toString(36).slice(-8)
        const weddingId = `wed_${id}`

        await db.collection('weddings').doc(weddingId).set({
            weddingId,
            user: { name, email, password },
            createdAt: new Date().toISOString(),
            status: 'active',
        })

        console.log('💾 Wedding created in Firestore →', weddingId)

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
