import { NextResponse } from 'next/server'
import nodemailer from 'nodemailer'

export async function POST(req) {
    try {
        const body = await req.json()
        const { billing, id } = body

        const email = billing?.email
        const name = `${billing?.first_name || ''} ${billing?.last_name || ''}`.trim()

        if (!email) {
            return NextResponse.json({ error: 'Missing email' }, { status: 400 })
        }

        // סיסמה רנדומלית
        const password = Math.random().toString(36).slice(-8)
        const weddingId = `wed_${id}`

        // שליחת מייל
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
