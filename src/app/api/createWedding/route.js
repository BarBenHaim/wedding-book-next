export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const fetchCache = 'force-no-store'
export const preferredRegion = 'iad1'

import { eventDisplayTitle } from '@/lib/onboarding'
import { orderEventDetails, balanceTarget } from '@/lib/orderEventDetails'
import { eventSignUrl } from '@/lib/eventLinks'
import { renderWelcomeEmail } from '@/lib/welcomeEmail'
import { enterSecret, signEnterToken, enterUrl } from '@/lib/enterLink'
import { lockDecision, needsWelcomeResume, briefError } from '@/lib/orderLock'
import { renderBalancePaidEmail, bookTitleOf } from '@/lib/lifecycle'
import { signatureDesign } from '@/lib/guestSignature'
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

        // A balance order is the rest of a deposit for an event that exists: it must
        // not close the lead a second time or replace the lead's event and amount
        // with the balance order's. Only a first order records the sale.
        const balanceFor = balanceTarget(body)

        // Payment truth is recorded before the wedding idempotency exits.
        // If CRM persistence failed on the first webhook, a replay gets a
        // real chance to repair it even though the wedding already exists.
        if (!balanceFor) {
            try {
                const { closeLeadOnPurchase } = await import('@/lib/salesAgent/leads')
                await recordVerifiedSalesOutcome(body, closeLeadOnPurchase)
            } catch {
                console.warn('[createWedding] verified sales outcome write failed')
            }
        }

        // --- 4b. A balance order: the rest of a deposit for an event that exists ---
        // It marks that event paid and tells the owner of the business the book
        // can go to print. It never opens a second event. If the event is not
        // found the order falls through and is handled like any other.
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
                    // And the customer: paying the balance should answer itself.
                    try {
                        const w = snap.data() || {}
                        if (w.ownerEmail) {
                            const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://app.weddingtales.co.il'
                            const token = signEnterToken(w.ownerId, { secret: enterSecret() })
                            const mail = renderBalancePaidEmail(
                                { title: bookTitleOf(w) },
                                { portal: token ? enterUrl(baseUrl, token) : `${baseUrl}/wedding/${balanceFor}/portal` },
                            )
                            await mailTransport().sendMail({
                                from: `"Wedding Tales" <${process.env.MAIL_USER}>`,
                                to: w.ownerEmail,
                                subject: mail.subject,
                                html: mail.html,
                                text: mail.text,
                            })
                        }
                    } catch {
                        console.warn('[createWedding] balance paid customer e-mail failed')
                    }
                }
                console.log(`💳 Balance order ${orderId} → event ${balanceFor} marked paid`)
                return NextResponse.json({ ok: true, balanceFor, already })
            }
            console.warn(`[createWedding] balance order ${orderId} names an unknown event`)
        }

        // --- 5. Idempotency and the processing lock ---
        const lockRef = db.collection('ordersLocks').doc(orderId)
        const existing = await db.collection('weddings').where('orderId', '==', orderId).limit(1).get()
        const lockBefore = (await lockRef.get()).data() || null
        if (!existing.empty) {
            // The event exists. If the delivery that opened it died before the
            // welcome e-mail went out, send it now; otherwise there is nothing to do.
            const doc0 = existing.docs[0]
            if (needsWelcomeResume(lockBefore, doc0.data())) {
                try {
                    await resumeWelcome({ weddingId: doc0.id, wedding: doc0.data(), body, orderId, lockRef })
                    return NextResponse.json({ success: true, resumed: true, weddingId: doc0.id })
                } catch (err) {
                    await markFailed(lockRef, orderId, err, 'welcome e-mail (resume)')
                    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
                }
            }
            console.log(`⛔ Wedding for order ${orderId} already exists`)
            return NextResponse.json({ skipped: true, reason: 'already_created' })
        }

        // Take the lock in a transaction, so two deliveries cannot both go on.
        const taken = await db.runTransaction(async tx => {
            const snap = await tx.get(lockRef)
            const lock = snap.exists ? snap.data() : null
            const decision = lockDecision(lock)
            if (decision !== 'take') return decision
            tx.set(lockRef, {
                status: 'processing',
                startedAtMs: Date.now(),
                attempts: (Number(lock?.attempts) || 0) + 1,
                createdAt: lock?.createdAt || FieldValue.serverTimestamp(),
            })
            return 'take'
        })
        if (taken !== 'take') {
            console.log(`🔒 Order ${orderId} is ${taken}, skipping duplicate`)
            return NextResponse.json({ skipped: true, reason: taken === 'done' ? 'already_created' : 'locked' })
        }

        try {
            // --- 6. ניהול משתמשים (Auth) - התיקון החשוב ---
            let userRecord

            try {
                // ניסיון לאתר לקוח קיים (למשל, לקוח שקונה אלבום שני)
                userRecord = await adminAuth.getUserByEmail(email)
                console.log('👤 User already exists →', userRecord.uid)
            } catch {
                // A new customer. The password is random, long and never shown or mailed:
                // the e-mail signs them in with a link, and they choose a password themselves
                // if they want one (the phone app does).
                userRecord = await adminAuth.createUser({
                    email,
                    password: crypto.randomBytes(24).toString('base64url'),
                    displayName: name || undefined,
                })
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
                    // The house look of the blessing page for a new event (the owner's own
                    // choice in the design studio replaces it; existing events are untouched).
                    ...(details.fields.eventType ? { guestDesign: signatureDesign(details.fields.eventType) } : {}),
                    ...details.fields,
                },
                { merge: true },
            )

            console.log('💾 Wedding created →', weddingId)

            // --- 8. The welcome e-mail (lib/welcomeEmail.js), then the lock is done ---
            await sendWelcomeMail({
                weddingId,
                wedding: { slug, ownerId: userRecord.uid, viewerToken },
                body,
                email,
                name,
            })
            await db.collection('weddings').doc(weddingId).set({ welcomeEmailSentAt: FieldValue.serverTimestamp() }, { merge: true })
            await lockRef.set({ status: 'done', doneAtMs: Date.now() }, { merge: true })

            console.log('📧 Email sent successfully to:', email)

            return NextResponse.json({ success: true, weddingId, email })
        } catch (stepErr) {
            // A paid order that opens no event is the worst failure this route has.
            // Free the lock for the next delivery and tell the owner of the business.
            await markFailed(lockRef, orderId, stepErr, 'creating the event')
            return NextResponse.json({ error: 'Internal error' }, { status: 500 })
        }
    } catch (err) {
        console.error('❌ Fatal error in createWedding:', err)
        return NextResponse.json({ error: 'Internal error' }, { status: 500 })
    }
}

// ── helpers ─────────────────────────────────────────────────────────

function mailTransport() {
    return nodemailer.createTransport({
        service: 'gmail',
        auth: { user: process.env.MAIL_USER, pass: process.env.MAIL_PASS },
    })
}

// The first e-mail (lib/welcomeEmail.js, pure and tested): one big action (send the
// guest link), then three short cards under it. `wedding` carries what the e-mail
// needs from the event: slug, ownerId, viewerToken.
async function sendWelcomeMail({ weddingId, wedding, body, email, name }) {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://app.weddingtales.co.il'
    const details = orderEventDetails(body)
    // One tap from the e-mail into the book: a signed link that signs the owner
    // in (src/lib/enterLink.js, /enter). Without a signing secret it falls back
    // to the plain login page.
    const enterToken = signEnterToken(wedding.ownerId, { secret: enterSecret() })
    const loginUrl = enterToken ? enterUrl(baseUrl, enterToken) : `${baseUrl}/login`
    const viewerUrl = `${baseUrl}/wedding/${weddingId}/book/${wedding.viewerToken}`
    const guestUrl = `${baseUrl}/w/${wedding.slug}`
    // The event sign from the personal area: names, date and the book's QR, A4.
    const posterUrl = eventSignUrl(baseUrl, weddingId)
    const bookTitle = details.value ? eventDisplayTitle(details.value) : ''
    const shareText = `${bookTitle ? `ספר הברכות של ${bookTitle}` : 'ספר הברכות שלנו'}: נשמח שתכתבו ברכה ותוסיפו תמונה, לוקח שתי דקות מהטלפון 💛
${guestUrl}`
    const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(shareText)}`

    const mail = renderWelcomeEmail({
        baseUrl,
        name,
        email,
        setPasswordUrl: `${baseUrl}/login?mode=reset&email=${encodeURIComponent(email)}`,
        bookTitle,
        guestUrl,
        whatsappUrl,
        posterUrl,
        loginUrl,
        viewerUrl,
        deposit: details.deposit,
    })
    await mailTransport().sendMail({
        from: `"Wedding Tales" <${process.env.MAIL_USER}>`,
        to: email,
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
    })
}

// The event exists but its welcome e-mail never went out (the delivery that opened
// it failed afterwards). The e-mail goes out as it would have: the enter link signs
// the owner in.
async function resumeWelcome({ weddingId, wedding, body, orderId, lockRef }) {
    const billing = body?.billing || {}
    const email = String(wedding.ownerEmail || billing.email || '').trim()
    if (!email) throw new Error('no e-mail on the event')
    await sendWelcomeMail({
        weddingId,
        wedding: { slug: wedding.slug, ownerId: wedding.ownerId, viewerToken: wedding.digitalTokens?.[0] },
        body,
        email,
        name: wedding.ownerName || `${billing.first_name || ''} ${billing.last_name || ''}`.trim(),
    })
    await db.collection('weddings').doc(weddingId).set({ welcomeEmailSentAt: FieldValue.serverTimestamp() }, { merge: true })
    await lockRef.set({ status: 'done', doneAtMs: Date.now() }, { merge: true })
    console.log(`📧 Welcome e-mail sent late for order ${orderId}`)
}

// Free the lock for the next WooCommerce delivery and tell the business owner,
// once per failure. Never throws: this runs inside a catch.
async function markFailed(lockRef, orderId, err, where) {
    console.error(`❌ Order ${orderId} failed while ${where}:`, err)
    try {
        await lockRef.set({ status: 'failed', failedAtMs: Date.now(), error: briefError(err) }, { merge: true })
    } catch {
        console.warn('[createWedding] could not mark the lock failed')
    }
    try {
        await mailTransport().sendMail({
            from: `"Wedding Tales" <${process.env.MAIL_USER}>`,
            to: process.env.MAIL_USER,
            subject: `הזמנה ${orderId} שולמה, אבל האירוע לא נפתח`,
            text: `ההזמנה ${orderId} שולמה, ותהליך פתיחת האירוע נכשל בשלב: ${where}.
שגיאה: ${briefError(err)}
WooCommerce ינסה שוב לבד, והמערכת תשלים את מה שחסר. אם זה לא קורה תוך שעה, אפשר לשלוח את ההזמנה שוב מ-WooCommerce.
ניהול: https://app.weddingtales.co.il/admin`,
        })
    } catch {
        console.warn('[createWedding] failure alert e-mail failed')
    }
}
