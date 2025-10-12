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
        // --- Raw body + חתימה ---
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

        const generatedSignature = crypto.createHmac('sha256', secret).update(buffer).digest('base64')
        if (signature !== generatedSignature) {
            console.warn('⚠️ Invalid signature.')
            console.log('Expected:', generatedSignature)
            console.log('Got     :', signature)
            return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
        }
        console.log('✅ Signature verified successfully.')

        // --- Parse ---
        let body
        try {
            body = JSON.parse(rawBody)
        } catch (err) {
            console.error('❌ Failed to parse JSON:', err)
            return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
        }

        const { billing, id } = body || {}
        const email = billing?.email?.trim()
        const name = `${billing?.first_name || ''} ${billing?.last_name || ''}`.trim()
        if (!email || !id) {
            console.warn('⚠️ Missing email or order id in body')
            return NextResponse.json({ error: 'Missing email or order id' }, { status: 400 })
        }

        // --- WeddingId לפי order ---
        const weddingId = `wed_${id}`

        // --- יצירת משתמש ב-Auth אם לא קיים ---
        let password = Math.random().toString(36).slice(-10)
        try {
            const existing = await adminAuth.getUserByEmail(email)
            console.log('👤 Auth user already exists →', existing.uid)
            // לא משנים סיסמה למשתמש קיים
        } catch (e) {
            // לא קיים → יוצרים
            const newUser = await adminAuth.createUser({
                email,
                password,
                displayName: name || undefined,
            })
            console.log('👤 Created Auth user →', newUser.uid)
        }

        // --- כתיבה למסמך הראשי במבנה זהה להרשמה ---
        await db.collection('weddings').doc(weddingId).set(
            {
                ownerEmail: email,
                createdAt: FieldValue.serverTimestamp(),
            },
            { merge: true }
        )
        console.log('💾 Wedding document created →', weddingId)

        // --- שליחת מייל עם פרטי כניסה ---
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
        <p>תודה על ההזמנה! יצרנו עבורך גישה למערכת והקמנו חתונה חדשה.</p>
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
