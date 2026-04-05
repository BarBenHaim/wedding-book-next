import nodemailer from 'nodemailer'

export async function POST(req) {
    try {
        // מקבלים את שני הלינקים וה-ID
        const { weddingId, contentUrl, coversUrl } = await req.json()

        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: process.env.MAIL_USER,
                pass: process.env.MAIL_PASS,
            },
        })

        await transporter.sendMail({
            from: process.env.MAIL_USER,
            to: 'barbenbh@gmail.com', // המייל שלך
            subject: `ספר החתונה מוכן להדפסה!`,
            html: `
        <div style="font-family: Arial, sans-serif; direction: rtl; text-align: right;">
     
            <p><strong>מזהה חתונה:</strong> ${weddingId}</p>
            
            <hr />
            
            <div style="margin: 20px 0;">
                <h3> קבצים להורדה:</h3>
                
                <p>
                    <strong>1. תוכן הספר (Content):</strong><br/>
                    <a href="${contentUrl}" target="_blank" style="color: #6d28d9; font-weight: bold;">לחץ להורדת התוכן</a>
                </p>
                
                <p>
                    <strong>2. כריכות (Covers):</strong><br/>
                    <a href="${coversUrl}" target="_blank" style="color: #db2777; font-weight: bold;">לחץ להורדת הכריכות</a>
                </p>
            </div>

            <hr />
            <p style="font-size: 12px; color: gray;">נשלח אוטומטית ממערכת Wedding Tales</p>
        </div>
      `,
        })

        return new Response(JSON.stringify({ success: true }), { status: 200 })
    } catch (err) {
        console.error('Email error:', err)
        return new Response(JSON.stringify({ error: 'Failed to send email' }), { status: 500 })
    }
}
