import { NextResponse } from 'next/server'
import { db } from '@/lib/firebaseAdmin' // זה הקובץ שבו אתה מגדיר את Firebase Admin
import { collection, doc, setDoc } from 'firebase/firestore'
import { v4 as uuidv4 } from 'uuid'
import nodemailer from 'nodemailer'

export async function POST(req) {
    try {
        const body = await req.json()
        const { order_id, email, name } = body

        // צור מזהה חתונה ייחודי
        const weddingId = uuidv4()

        // שמירה במסד הנתונים שלך (Firestore)
        await setDoc(doc(db, 'weddings', weddingId), {
            weddingId,
            email,
            name,
            order_id,
            createdAt: new Date().toISOString(),
            entries: [], // אפשר לשים מקום לברכות/תמונות עתידיות
        })

        // שליחת מייל ללקוח עם פרטי גישה
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: process.env.MAIL_USER,
                pass: process.env.MAIL_PASS,
            },
        })

        await transporter.sendMail({
            from: `"Wedding Tales" <${process.env.MAIL_USER}>`,
            to: email,
            subject: 'ברוכים הבאים ל-Wedding Tales 💜',
            html: `
        <p>היי ${name},</p>
        <p>איזה כיף שהצטרפתם ל-Wedding Tales!</p>
        <p>הנה הלינק האישי שלכם:</p>
        <a href="https://weddingtales.com/wedding/${weddingId}/upload">
          כניסה לפלטפורמה שלכם
        </a>
        <br><br>
        <p>אנחנו מאחלים לכם חוויה קסומה וזיכרונות מרגשים 💍</p>
      `,
        })

        return NextResponse.json({ success: true, weddingId })
    } catch (error) {
        console.error('❌ Error creating wedding:', error)
        return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }
}
