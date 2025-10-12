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
        const buffer = Buffer.from(await req.arrayBuffer()) // 🟢 זה הפתרון המדויק
        const rawBody = buffer.toString('utf8')
        const signature = req.headers.get('x-wc-webhook-signature')
        const secret = process.env.WC_WEBHOOK_SECRET

        console.log('🧪 Signature header present?:', !!signature, '| body length:', rawBody.length)

        // בדיקה ראשונית (בדיקת חיבור)
        if (!signature || rawBody.length < 50) {
            console.log('⚠️ WooCommerce ping or missing signature → returning 200 OK')
            return new Response('OK', { status: 200 })
        }

        if (!secret) {
            console.error('❌ Missing WC_WEBHOOK_SECRET')
            return NextResponse.json({ error: 'Missing secret' }, { status: 500 })
        }

        // 🟣 יצירת החתימה בדיוק כמו WooCommerce
        const generatedSignature = crypto
            .createHmac('sha256', secret)
            .update(buffer) // לא .update(rawBody)!
            .digest('base64')

        if (signature !== generatedSignature) {
            console.warn('⚠️ Invalid signature.')
            console.log('Expected:', generatedSignature)
            console.log('Got:', signature)
            return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
        }

        console.log('✅ Valid signature, processing order...')

        // כעת אפשר לפרסר
        const body = JSON.parse(rawBody)
        const { billing, id } = body || {}
        const email = billing?.email
        const name = `${billing?.first_name || ''} ${billing?.last_name || ''}`.trim()
        if (!email || !id) return NextResponse.json({ error: 'Missing email or order id' }, { status: 400 })

        const password = Math.random().toString(36).slice(-8)
        const weddingId = `wed_${id}`

        await db.collection('weddings').doc(weddingId).set({
            weddingId,
            user: { name, email, password },
            createdAt: new Date().toISOString(),
            status: 'active',
        })

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

        console.log('✅ Email sent to:', email, 'for weddingId:', weddingId)
        return NextResponse.json({ success: true, email, weddingId })
    } catch (err) {
        console.error('❌ Error (createWedding):', err)
        return NextResponse.json({ error: 'Internal error' }, { status: 500 })
    }
}
