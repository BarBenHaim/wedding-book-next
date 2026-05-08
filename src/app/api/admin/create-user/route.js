export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import nodemailer from 'nodemailer'
import { adminDb, adminAuth } from '@/lib/firebaseAdmin'
import { FieldValue } from 'firebase-admin/firestore'
import { generateSlug } from '@/lib/generateSlug'
import { isSuperAdmin } from '@/lib/superAdmin'

export async function POST(req) {
    try {
        // --- 1. אימות סופר-אדמין ---
        const authHeader = req.headers.get('authorization')
        if (!authHeader?.startsWith('Bearer ')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }
        const token = authHeader.split('Bearer ')[1]
        const decoded = await adminAuth.verifyIdToken(token)
        if (!isSuperAdmin(decoded.email)) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        }

        // --- 2. קריאת הנתונים ---
        const { email, displayName, brideName, groomName, weddingDate } = await req.json()

        if (!email?.trim()) {
            return NextResponse.json({ error: 'אימייל הוא שדה חובה' }, { status: 400 })
        }

        const cleanEmail = email.trim().toLowerCase()

        // --- 3. יצירה/מציאת משתמש ---
        let userRecord
        let password = null
        let isNewUser = false

        try {
            userRecord = await adminAuth.getUserByEmail(cleanEmail)
        } catch {
            // משתמש לא קיים — ניצור אחד חדש
            password = Math.random().toString(36).slice(-10)
            userRecord = await adminAuth.createUser({
                email: cleanEmail,
                password,
                displayName: displayName || undefined,
            })
            isNewUser = true
        }

        // --- 4. יצירת מזהה חתונה ו-slug ---
        const weddingRef = adminDb.collection('weddings').doc()
        const weddingId = weddingRef.id

        let slug = generateSlug()
        const slugCheck = await adminDb.collection('weddings').where('slug', '==', slug).limit(1).get()
        if (!slugCheck.empty) slug = generateSlug()

        // --- 5. יצירת מסמך חתונה ---
        await weddingRef.set({
            ownerId: userRecord.uid,
            ownerEmail: cleanEmail,
            createdAt: FieldValue.serverTimestamp(),
            slug,
            ...(brideName?.trim() && { brideName: brideName.trim() }),
            ...(groomName?.trim() && { groomName: groomName.trim() }),
            ...(weddingDate && { weddingDate }),
        })

        // --- 6. שליחת מייל ללקוח ---
        try {
            const transporter = nodemailer.createTransport({
                service: 'gmail',
                auth: { user: process.env.MAIL_USER, pass: process.env.MAIL_PASS },
            })

            const name = displayName || [brideName, groomName].filter(Boolean).join(' & ') || ''

            const html = `
            <div style="font-family:Heebo,sans-serif;direction:rtl;text-align:right;padding:20px">
              <h2>מזל טוב ${name}!</h2>
              <p>החתונה שלך נוצרה בהצלחה ב-Wedding Tales</p>

              <h3>פרטי הגישה שלך:</h3>
              <ul>
                <li><b>אימייל:</b> ${cleanEmail}</li>
                ${
                    isNewUser
                        ? `<li><b>סיסמה:</b> ${password}</li>`
                        : `<li><b>סיסמה:</b> השתמש בסיסמה הקיימת שלך</li>`
                }
              </ul>

              <p>להתחברות למערכת:
                <a href="https://app.weddingtales.co.il/login">לחצו כאן</a>
              </p>

              <hr style="margin:25px 0;border:none;border-top:1px solid #eee"/>
              <p style="margin-top:25px;">באהבה,<br>צוות Wedding Tales</p>
            </div>
            `

            await transporter.sendMail({
                from: `"Wedding Tales" <${process.env.MAIL_USER}>`,
                to: cleanEmail,
                subject: 'החתונה שלך מוכנה',
                html,
            })
        } catch (mailErr) {
            console.error('⚠️ Email failed but user created:', mailErr.message)
        }

        return NextResponse.json({
            success: true,
            weddingId,
            slug,
            uid: userRecord.uid,
            email: cleanEmail,
            isNewUser,
            passwordSent: isNewUser,
        })
    } catch (err) {
        console.error('❌ Admin create-user error:', err)
        return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 })
    }
}
