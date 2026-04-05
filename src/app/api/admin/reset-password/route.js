export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { adminAuth } from '@/lib/firebaseAdmin'
import nodemailer from 'nodemailer'

const SUPER_ADMIN_EMAIL = 'barbenbh@gmail.com'

export async function POST(req) {
    // Auth check
    const authHeader = req.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    try {
        const decoded = await adminAuth.verifyIdToken(authHeader.split('Bearer ')[1])
        if (decoded.email !== SUPER_ADMIN_EMAIL) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        }
    } catch {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    try {
        const { email } = await req.json()
        if (!email) return NextResponse.json({ error: 'Missing email' }, { status: 400 })

        // Generate new random password
        const newPassword = Math.random().toString(36).slice(-10) + Math.random().toString(36).slice(-2)

        // Get user by email and update password
        const userRecord = await adminAuth.getUserByEmail(email)
        await adminAuth.updateUser(userRecord.uid, { password: newPassword })

        // Send email with new password
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: { user: process.env.MAIL_USER, pass: process.env.MAIL_PASS },
        })

        await transporter.sendMail({
            from: `"Wedding Tales" <${process.env.MAIL_USER}>`,
            to: email,
            subject: 'הסיסמה שלך עודכנה - Wedding Tales',
            html: `
            <div style="font-family:Heebo,sans-serif;direction:rtl;text-align:right;padding:20px">
                <h2>הסיסמה שלך אופסה</h2>
                <p>הסיסמה החדשה שלך:</p>
                <div style="background:#f5f5f5;padding:15px;border-radius:10px;font-size:18px;font-weight:bold;letter-spacing:1px;direction:ltr;text-align:center">
                    ${newPassword}
                </div>
                <p style="margin-top:15px">
                    <a href="https://app.weddingtales.co.il/login" style="color:#AA8840;font-weight:bold">לחצו כאן להתחברות</a>
                </p>
                <hr style="margin:25px 0;border:none;border-top:1px solid #eee"/>
                <p style="color:#999;font-size:12px">באהבה, צוות Wedding Tales</p>
            </div>
            `,
        })

        console.log(`🔑 Password reset for ${email} by super admin`)
        return NextResponse.json({ success: true })
    } catch (err) {
        console.error('[admin/reset-password] Error:', err)
        const msg = err.code === 'auth/user-not-found' ? 'User not found' : 'Failed to reset password'
        return NextResponse.json({ error: msg }, { status: 500 })
    }
}
