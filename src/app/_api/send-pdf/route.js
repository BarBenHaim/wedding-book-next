import nodemailer from 'nodemailer'

export async function POST(req) {
    try {
        const { url } = await req.json()

        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: process.env.MAIL_USER,
                pass: process.env.MAIL_PASS,
            },
        })

        await transporter.sendMail({
            from: process.env.MAIL_USER,
            to: 'barbenbh@gmail.com',
            subject: '📖 Wedding Book PDF',
            html: `
        <p>הספר מוכן! 🎉</p>
        <p>תוכל להוריד אותו בקישור הבא:</p>
        <a href="${url}" target="_blank">${url}</a>
      `,
        })

        return new Response(JSON.stringify({ success: true }), { status: 200 })
    } catch (err) {
        console.error('Email error:', err)
        return new Response(JSON.stringify({ error: 'Failed to send email' }), { status: 500 })
    }
}
