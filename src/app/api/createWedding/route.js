export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const fetchCache = 'force-no-store'
export const preferredRegion = 'iad1'

import { eventDisplayTitle } from '@/lib/onboarding'
import { orderEventDetails, balanceTarget } from '@/lib/orderEventDetails'
import { eventSignUrl } from '@/lib/eventLinks'
import { renderWelcomeEmail } from '@/lib/welcomeEmail'
import { enterSecret, signEnterToken, enterUrl } from '@/lib/enterLink'
import { NextResponse } from 'next/server'
import nodemailer from 'nodemailer'
import crypto from 'crypto'
import { adminDb as db, adminAuth } from '@/lib/firebaseAdmin'
import { FieldValue } from 'firebase-admin/firestore'
import { generateSlug } from '@/lib/generateSlug'
import { isVerifiedWooOrder, recordVerifiedSalesOutcome } from '@/lib/salesAgent/paymentTruth'

export async function POST(req) {
    try {
        // --- 1. קריאת גוף ובדיקת חתימה (אבטחה) ---
        const buffer = Buffer.from(await req.arrayBuffer())
        const rawBody = buffer.toString('utf8')
        const signature = req.headers.get('x-wc-webhook-signature')
        const secret = process.env.WC_WEBHOOK_SECRET

        if (!signature || rawBody.length < 50) return new Response('OK', { status: 200 })
        if (!secret) return NextResponse.json({ error: 'Missing secret' }, { status: 500 })

        const generatedSignature = crypto.createHmac('sha256', secret).update(buffer).digest('base64')
        if (signature !== generatedSignature) return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })

        // --- 2. פירוק נתוני ההזמנה ---
        const body = JSON.parse(rawBody)
        const { billing, id, status } = body || {}

        const orderId = id ? String(id) : null

        if (!orderId) {
            console.error('❌ Invalid orderId:', orderId)
            return NextResponse.json({ error: 'Invalid order id' }, { status: 400 })
        }

        const email = billing?.email?.trim()
        const name = `${billing?.first_name || ''} ${billing?.last_name || ''}`.trim()

        if (!email) return NextResponse.json({ error: 'Missing email' }, { status: 400 })

        // --- 3. שמירת נתונים גולמיים (לצורכי גיבוי ודיבוג) ---
        await db.collection('ordersRaw').doc(orderId).set({
            body,
            receivedAt: FieldValue.serverTimestamp(),
        })

        // --- 4. בדיקת סטטוס תשלום ---
        if (!isVerifiedWooOrder(body)) {
            console.log(`⏭️ Skipping order ${orderId} due to status: ${status}`)
            return NextResponse.json({ skipped: true, reason: 'wrong_status' })
        }

        // Payment truth is recorded before the wedding idempotency exits.
        // If CRM persistence failed on the first webhook, a replay gets a
        // real chance to repair it even though the wedding already exists.
        try {
            const { closeLeadOnPurchase } = await import('@/lib/salesAgent/leads')
            await recordVerifiedSalesOutcome(body, closeLeadOnPurchase)
        } catch {
            console.warn('[createWedding] verified sales outcome write failed')
        }

        // --- 4b. A balance order: the rest of a deposit for an event that exists ---
        // It marks that event paid and tells the owner of the business the book
        // can go to print. It never opens a second event. If the event is not
        // found the order falls through and is handled like any other.
        const balanceFor = balanceTarget(body)
        if (balanceFor) {
            const ref = db.collection('weddings').doc(balanceFor)
            const snap = await ref.get()
            if (snap.exists) {
                const already = snap.data()?.balanceOrderId === orderId
                if (!already) {
                    await ref.set(
                        {
                            paymentStage: 'paid',
                            balanceDue: 0,
                            balanceOrderId: orderId,
                            balanceAmount: body?.total ?? null,
                            balancePaidAt: FieldValue.serverTimestamp(),
                        },
                        { merge: true },
                    )
                    try {
                        const w = snap.data() || {}
                        const who = [w.celebrantName, w.brideName, w.groomName].filter(Boolean).join(' / ') || balanceFor
                        const t = nodemailer.createTransport({ service: 'gmail', auth: { user: process.env.MAIL_USER, pass: process.env.MAIL_PASS } })
                        await t.sendMail({
                            from: `"Wedding Tales" <${process.env.MAIL_USER}>`,
                            to: process.env.MAIL_USER,
                            subject: `יתרה שולמה, הספר מוכן להדפסה: ${who}`,
                            text: `היתרה על האירוע ${balanceFor} (${who}) שולמה בהזמנה ${orderId}, סכום ${body?.total ?? ''}.\nכתובת המשלוח נמצאת בהזמנה ב-WooCommerce.\nניהול: https://app.weddingtales.co.il/admin`,
                        })
                    } catch {
                        console.warn('[createWedding] balance notice e-mail failed')
                    }
                }
                console.log(`💳 Balance order ${orderId} → event ${balanceFor} marked paid`)
                return NextResponse.json({ ok: true, balanceFor, already })
            }
            console.warn(`[createWedding] balance order ${orderId} names an unknown event`)
        }

        // --- 5. מניעת כפילויות (Idempotency) ---
        // וידוא שההזמנה לא קיימת כבר במערכת האלבומים
        const existing = await db.collection('weddings').where('orderId', '==', orderId).limit(1).get()
        if (!existing.empty) {
            console.log(`⛔ Wedding for order ${orderId} already exists`)
            return NextResponse.json({ skipped: true, reason: 'already_created' })
        }

        // נעילת התהליך כדי למנוע ריצות מקבילות מאותה בקשת Webhook
        const lockRef = db.collection('ordersLocks').doc(orderId)
        const lockSnap = await lockRef.get()

        if (lockSnap.exists) {
            console.log(`🔒 Lock exists for order ${orderId}, skipping duplicate`)
            return NextResponse.json({ skipped: true, reason: 'locked' })
        }

        await lockRef.set({
            createdAt: FieldValue.serverTimestamp(),
        })

        // --- 6. ניהול משתמשים (Auth) - התיקון החשוב ---
        let userRecord
        let password = null
        let isNewUser = false

        try {
            // ניסיון לאתר לקוח קיים (למשל, לקוח שקונה אלבום שני)
            userRecord = await adminAuth.getUserByEmail(email)
            console.log('👤 User already exists →', userRecord.uid)
        } catch {
            // יצירת לקוח חדש רק אם לא קיים
            password = Math.random().toString(36).slice(-10)
            userRecord = await adminAuth.createUser({
                email,
                password,
                displayName: name || undefined,
            })
            isNewUser = true
            console.log('👤 Created new user →', userRecord.uid)
        }

        // --- 7. יצירת מסמך החתונה החדש ---
        // אנחנו משתמשים ב-orderId בתור ה-weddingId כדי שלקוח יוכל שיהיו לו כמה חתונות במקביל
        const weddingId = orderId

        // יצירת slug קצר וייחודי לקישור יפה
        let slug = generateSlug()
        // וידוא שה-slug לא קיים כבר
        const slugCheck = await db.collection('weddings').where('slug', '==', slug).limit(1).get()
        if (!slugCheck.empty) slug = generateSlug() // retry once — collision is extremely rare

        // טוקן לצפייה ללא-התחברות בספר הדיגיטלי (זהה למנגנון של
        // /api/digital-edition/grant) — מאפשר לזוג לפתוח את הספר ולבחור
        // עיצוב מבלי להזדהות, ולשתף את הקישור עם בני הזוג.
        const viewerToken = crypto.randomUUID()

        const details = orderEventDetails(body)

        await db.collection('weddings').doc(weddingId).set(
            {
                // Provenance, written at the door. Before this a paid
                // order was identifiable only by the ABSENCE of
                // createdVia, which stops being true the moment any
                // other path forgets to set it.
                createdVia: 'order',
                ownerId: userRecord.uid, // הקישור החשוב ללקוח במערכת
                ownerEmail: email,
                ownerName: name || null,
                ownerPhone: (billing?.phone || '').trim(),
                amountPaid: body?.total ?? null,
                currency: body?.currency ?? null,
                createdAt: FieldValue.serverTimestamp(),
                orderId,
                slug,
                digitalTokens: FieldValue.arrayUnion(viewerToken),
                digitalTokensIssuedAt: FieldValue.arrayUnion({
                    token: viewerToken,
                    issuedAt: new Date().toISOString(),
                    issuedBy: 'createWedding',
                }),
                ...details.fields,
            },
            { merge: true },
        )

        console.log('💾 Wedding created →', weddingId)

        // קישורים למייל — כניסה למערכת (עם פרטי גישה) + צפייה ללא-התחברות.
        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://app.weddingtales.co.il'
        // One tap from the e-mail into the book: a signed link that signs the owner
        // in (src/lib/enterLink.js, /enter). Without a signing secret it falls back
        // to the plain login page, where the password below still works.
        const enterToken = signEnterToken(userRecord.uid, { secret: enterSecret() })
        const loginUrl = enterToken ? enterUrl(baseUrl, enterToken) : `${baseUrl}/login`
        const viewerUrl = `${baseUrl}/wedding/${weddingId}/book/${viewerToken}`

        // --- 8. שליחת מייל ללקוח ---
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: { user: process.env.MAIL_USER, pass: process.env.MAIL_PASS },
        })

        // The first e-mail is built in lib/welcomeEmail.js (pure, tested): one big
        // action (send the guest link), then three short cards under it.
        const guestUrl = `${baseUrl}/w/${slug}`
        // The event sign from the personal area: names, date and the book's QR,
        // A4, three colours. It replaced a generic QR sheet that carried no names.
        const posterUrl = eventSignUrl(baseUrl, weddingId)
        const bookTitle = details.value ? eventDisplayTitle(details.value) : ''
        const shareText = `${bookTitle ? `ספר הברכות של ${bookTitle}` : 'ספר הברכות שלנו'}: נשמח שתכתבו ברכה ותוסיפו תמונה, לוקח שתי דקות מהטלפון 💛\n${guestUrl}`
        const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(shareText)}`

        const mail = renderWelcomeEmail({
            baseUrl,
            name,
            email,
            password,
            isNewUser,
            bookTitle,
            guestUrl,
            whatsappUrl,
            posterUrl,
            loginUrl,
            viewerUrl,
            deposit: details.deposit,
        })

        await transporter.sendMail({
            from: `"Wedding Tales" <${process.env.MAIL_USER}>`,
            to: email,
            subject: mail.subject,
            html: mail.html,
            text: mail.text,
        })

        console.log('📧 Email sent successfully to:', email)

        return NextResponse.json({ success: true, weddingId, email })
    } catch (err) {
        console.error('❌ Fatal error in createWedding:', err)
        return NextResponse.json({ error: 'Internal error' }, { status: 500 })
    }
}
