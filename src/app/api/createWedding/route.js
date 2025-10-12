export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const fetchCache = 'force-no-store'
export const preferredRegion = 'iad1' // לא חובה, רק כדי לוודא ריצה על Node

import { NextResponse } from 'next/server'
import nodemailer from 'nodemailer'
import crypto from 'crypto'
import { adminDb as db } from '@/lib/firebaseAdmin'

export async function GET() {
    return new Response('✅ /api/createWedding is up. Use POST with WooCommerce.', { status: 200 })
}

export async function POST(req) {
    try {
        // --- DEBUG: הצגת כל ה-Headers שמגיעים ---
        const headersEntries = Array.from(req.headers.entries())
        const headersObj = Object.fromEntries(headersEntries)
        console.log('🧪 Incoming headers:', headersObj)
        console.log('🧪 Content-Type:', req.headers.get('content-type'))

        // --- בדיקות ENV ---
        console.log('🧪 MAIL_USER present?:', !!process.env.MAIL_USER)
        console.log('🧪 MAIL_PASS present?:', !!process.env.MAIL_PASS)
        console.log('🧪 WC_WEBHOOK_SECRET present?:', !!process.env.WC_WEBHOOK_SECRET)

        // --- חתימה של WooCommerce ---
        const signature = req.headers.get('x-wc-webhook-signature')
        const secret = process.env.WC_WEBHOOK_SECRET
        const rawBody = await req.text()
        console.log('🧪 Signature header present?:', !!signature, '| body length:', rawBody.length)

        // 🟡 אם זו קריאת בדיקה או שאין חתימה → רק נחזיר OK כדי שווקומרס יאשר את ה־Webhook
        if (!signature || rawBody.length < 50) {
            console.log('⚠️ WooCommerce test or missing signature → returning 200 OK')
            return new Response('OK', { status: 200 })
        }

        if (!secret) {
            console.error('❌ Missing WC_WEBHOOK_SECRET')
            return NextResponse.json({ error: 'Server misconfig (secret missing)' }, { status: 500 })
        }

        const generatedSignature = crypto.createHmac('sha256', secret).update(rawBody).digest('base64')
        if (signature !== generatedSignature) {
            console.warn('⚠️ Invalid signature.')
            return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
        }

        // --- ניתוח גוף ההודעה ---
        let body
        try {
            body = JSON.parse(rawBody)
        } catch {
            return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
        }

        const { billing, id } = body || {}
        const email = billing?.email
        const name = `${billing?.first_name || ''} ${billing?.last_name || ''}`.trim()

        if (!email || !id) {
            return NextResponse.json({ error: 'Missing email or order id' }, { status: 400 })
        }

        // --- יצירת מזהה וסיסמה ---
        const password = Math.random().toString(36).slice(-8)
        const weddingId = `wed_${id}`

        // --- כתיבה ל־Firestore ---
        await db.collection('weddings').doc(weddingId).set({
            weddingId,
            user: { name, email, password },
            createdAt: new Date().toISOString(),
            status: 'active',
        })

        // --- שליחת מייל ---
        if (!process.env.MAIL_USER || !process.env.MAIL_PASS) {
            console.error('❌ Missing mail creds:', {
                MAIL_USER: !!process.env.MAIL_USER,
                MAIL_PASS: !!process.env.MAIL_PASS,
            })
            return NextResponse.json({ error: 'Mail credentials missing' }, { status: 500 })
        }

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
                <p>הנה הפרטים שלך:</p>
                <p><b>שם משתמש:</b> ${email}<br>
                <b>סיסמה:</b> ${password}<br>
                <b>מזהה החתונה:</b> ${weddingId}</p>
                <p><a href="https://the-wedding-gift.vercel.app/login">להתחברות למערכת</a></p>
            `,
        })

        console.log('✅ Email sent to:', email, 'for weddingId:', weddingId)
        return NextResponse.json({ success: true, email, weddingId })
    } catch (err) {
        console.error('❌ Error (createWedding):', err)
        return NextResponse.json({ error: 'Internal error' }, { status: 500 })
    }
}
