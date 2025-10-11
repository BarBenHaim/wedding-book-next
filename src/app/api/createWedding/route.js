import { NextResponse } from 'next/server'
import { adminDb, adminAuth } from '@/lib/firebaseAdmin'
import nodemailer from 'nodemailer'

export async function POST(req) {
    try {
        const body = await req.json()

        // מידע שמגיע מווקומרס
        const { id, billing } = body
        const email = billing?.email
        const name = `${billing?.first_name || ''} ${billing?.last_name || ''}`.trim()

        if (!email) {
            return NextResponse.json({ error: 'Missing email' }, { status: 400 })
        }

        // 1️⃣ צור wedding חדש
        const weddingRef = await adminDb.collection('weddings').add({
            name,
            email,
            createdAt: new Date(),
            orderId: id,
        })
        const weddingId = weddingRef.id

        // 2️⃣ צור משתמש חדש במערכת
        const password = Math.random().toString(36).slice(-8)
        const userRecord = await adminAuth.createUser({
            email,
            password,
            displayName: name,
        })

        // 3️⃣ שלח מייל עם פרטי הגישה
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
                <p>החתונה שלך נוצרה בהצלחה!</p>
                <p>התחבר/י כאן: <a href="https://the-wedding-gift.vercel.app/login">כניסה לחשבון</a></p>
                <p><b>שם משתמש:</b> ${email}<br>
                <b>סיסמה:</b> ${password}</p>
                <p>מזהה החתונה שלך: ${weddingId}</p>
            `,
        }

        await transporter.sendMail(mailOptions)

        return NextResponse.json({ success: true, weddingId })
    } catch (err) {
        console.error(err)
        return NextResponse.json({ error: 'Internal error', details: err.message }, { status: 500 })
    }
}
