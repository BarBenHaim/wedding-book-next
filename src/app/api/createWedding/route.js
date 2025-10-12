import { NextResponse } from 'next/server'
import nodemailer from 'nodemailer'
import { db } from '@/lib/firebaseAdmin'
import { doc, setDoc } from 'firebase/firestore'
import crypto from 'crypto'

console.log('MAIL_USER:', process.env.MAIL_USER)
console.log('MAIL_PASS:', process.env.MAIL_PASS ? '✅ Loaded' : '❌ Missing')

export async function POST(req) {
    try {
        // ✅ אימות החתימה של WooCommerce
        const signature = req.headers.get('x-wc-webhook-signature')
        const rawBody = await req.text()

        const secret = process.env.WC_WEBHOOK_SECRET
        const generatedSignature = crypto.createHmac('sha256', secret).update(rawBody).digest('base64')

        if (signature !== generatedSignature) {
            return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
        }

        // עכשיו נמשיך כרגיל
        const body = JSON.parse(rawBody)
        const { billing, id } = body

        const email = billing?.email
        const name = `${billing?.first_name || ''} ${billing?.last_name || ''}`.trim()

        if (!email) {
            return NextResponse.json({ error: 'Missing email' }, { status: 400 })
        }

        const password = Math.random().toString(36).slice(-8)
        const weddingId = `wed_${id}`

        await setDoc(doc(db, 'weddings', weddingId), {
            weddingId,
            user: { name, email, password },
            createdAt: new Date().toISOString(),
            status: 'active',
        })

        if (!process.env.MAIL_USER || !process.env.MAIL_PASS) {
            console.error('❌ Missing MAIL_USER or MAIL_PASS environment variables')
        }

        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: process.env.MAIL_USER,
                pass: process.env.MAIL_PASS,
            },
        })

        const mailOptions = {
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
        }

        await transporter.sendMail(mailOptions)

        return NextResponse.json({ success: true, email, weddingId })
    } catch (err) {
        console.error('❌ Error:', err)
        return NextResponse.json({ error: err.message }, { status: 500 })
    }
}
