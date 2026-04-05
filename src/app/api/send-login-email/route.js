import { NextResponse } from 'next/server'
import nodemailer from 'nodemailer'

export async function POST(req) {
    const { email, weddingId } = await req.json()

    const portalUrl = `${process.env.NEXT_PUBLIC_BASE_URL}/wedding/${weddingId}/portal`

    const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: process.env.MAIL_USER,
            pass: process.env.MAIL_PASS,
        },
    })

    const html = `
    <div style="font-family:Heebo,sans-serif;direction:rtl;text-align:right;padding:20px">
      <h2>מזל טוב וברוכים הבאים ל-Wedding Tales</h2>
      <p>החתונה שלכם נוצרה בהצלחה! הנה כל מה שאתם צריכים:</p>
      <ul>
        <li><b>קישור לעמוד האישי שלכם:</b> <a href="${portalUrl}">${portalUrl}</a></li>
      </ul>
      <hr style="margin:20px 0;border:none;border-top:1px solid #eee" />
      <h3>בעמוד תמצאו:</h3>
      <ul>
        <li>ברקוד דיגיטלי להקרנה באירוע</li>
        <li>כפתור שיתוף מיידי בוואטסאפ</li>
        <li>PDF מוכן להדפסה עם QR</li>
      </ul>
      <p style="margin-top:30px">באהבה,<br>צוות Wedding Tales</p>
    </div>
  `

    await transporter.sendMail({
        from: `"Wedding Tales" <${process.env.MAIL_USER}>`,
        to: email,
        subject: 'ברוכים הבאים ל-Wedding Tales 💍',
        html,
    })

    return NextResponse.json({ success: true })
}
