export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const fetchCache = 'force-no-store'
export const preferredRegion = 'iad1'

import { NextResponse } from 'next/server'
import nodemailer from 'nodemailer'
import crypto from 'crypto'
import { adminDb as db, adminAuth } from '@/lib/firebaseAdmin'
import { FieldValue } from 'firebase-admin/firestore'
import { safeOrderId, validateWooPayment, recordVerifiedSalesOutcome } from '@/lib/salesAgent/paymentTruth'
import { isConversationalPolicyEnabled } from '@/lib/salesAgent/salesContract'
import { readWooBody, verifyWooSignature, recordWooWebhookSnapshot, isWooSetupPing } from '@/lib/salesAgent/wooWebhook'
import {
    claimOrderFulfillment, bindOrderOwner, commitOrderBook, failOrderClaim,
    claimOrderConfirmation, finishOrderConfirmation, orderConfirmationMessageId,
} from '@/lib/salesAgent/orderFulfillment'
import { getOrderStatus, orderAccessLinks } from '@/lib/salesAgent/orderStatus'
import { recordVerifiedOrderEvidence } from '@/lib/salesAgent/salesEvidence'

const escapeHtml = value => String(value || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
const validEmail = value => typeof value === 'string' && value.length <= 254 && /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(value)

async function reviewOrder(orderId, reason) {
    await db.collection('order_fulfillment_reviews').doc(orderId).set({ orderId, reason, status: 'pending', updatedAt: FieldValue.serverTimestamp() }, { merge: true })
    return NextResponse.json({ received: true, fulfillment: 'review_required', reason, bookReady: false }, { status: 202 })
}

async function getOrCreateOwner(email, name) {
    try { return await adminAuth.getUserByEmail(email) }
    catch (err) {
        // Network/auth failures are not evidence that the user is absent.
        if (err?.code !== 'auth/user-not-found') throw err
    }
    try {
        return await adminAuth.createUser({ email, password: crypto.randomBytes(24).toString('base64url'), displayName: name || undefined })
    } catch (err) {
        // Different paid orders for the same buyer can legitimately race.
        if (err?.code === 'auth/email-already-exists') return adminAuth.getUserByEmail(email)
        throw err
    }
}

async function sendOrderConfirmation(orderId) {
    if (!process.env.MAIL_USER || !process.env.MAIL_PASS) return 'pending_configuration'
    // Prepare everything which can safely fail before claiming SMTP dispatch.
    // The outbox is private; no credentials/capability URLs are stored in it.
    const snap = await db.collection('order_confirmation_outbox').doc(orderId).get()
    const outbox = snap.exists ? snap.data() : null
    if (outbox?.state !== 'pending') return outbox?.state || 'not_ready'
    const links = orderAccessLinks(outbox.weddingId)
    if (!links || !validEmail(outbox.recipient)) return 'review_required'
    let setupUrl, transporter
    try {
        // Unlike the old emailed random password, this works after an Auth-only
        // partial failure too. A link does not change the customer's password.
        setupUrl = await adminAuth.generatePasswordResetLink(outbox.recipient)
        const parsed = new URL(setupUrl)
        if (parsed.protocol !== 'https:') return 'pending_preparation'
        transporter = nodemailer.createTransport({
            service: 'gmail', auth: { user: process.env.MAIL_USER, pass: process.env.MAIL_PASS },
            connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 20_000,
        })
    } catch { return 'pending_preparation' }
    const claim = await claimOrderConfirmation(db, orderId)
    if (claim.status !== 'claimed') return claim.status
    try {
        const result = await transporter.sendMail({
            from: `"Wedding Tales" <${process.env.MAIL_USER}>`, to: claim.recipient,
            messageId: orderConfirmationMessageId(orderId), subject: 'ספר הברכות שלכם נפתח',
            html: `<div dir="rtl" style="font-family:Arial,sans-serif;max-width:600px;margin:auto;line-height:1.8">
<h1>ספר הברכות שלכם נפתח</h1>
<p>התשלום התקבל והספר נפתח ב-Wedding Tales.</p>
<p><a href="${escapeHtml(links.ownerUrl)}">כניסה לניהול הספר</a> (דורשת התחברות)</p>
<p>נכנסים עם כתובת האימייל של ההזמנה. לכניסה ראשונה או אם צריך סיסמה חדשה: <a href="${escapeHtml(setupUrl)}">הגדרת סיסמה</a>.</p>
<p>זה הקישור לשיתוף עם המשפחה והחברים, להוספת תמונה וברכה:</p>
<p><a href="${escapeHtml(links.guestUrl)}">${escapeHtml(links.guestUrl)}</a></p>
<p>את קישור הגדרת הסיסמה שומרים לשימוש אישי.</p>
</div>`,
        })
        // SMTP acceptance is not delivery. Unknown acceptance never permits an
        // automatic retry, including a crash before this receipt is persisted.
        const accepted = Array.isArray(result?.accepted)
            && result.accepted.some(email => String(email).toLowerCase() === claim.recipient.toLowerCase())
        const state = accepted ? 'accepted' : 'uncertain'
        await finishOrderConfirmation(db, orderId, claim.token, state)
        return state
    } catch {
        try { await finishOrderConfirmation(db, orderId, claim.token, 'uncertain') } catch { /* remains dispatching; do not replay */ }
        return 'uncertain'
    }
}

export async function POST(req) {
    let claim = null
    try {
        const buffer = await readWooBody(req)
        const signature = req.headers.get('x-wc-webhook-signature')
        // Only the provider's exact, inert setup shape can be unsigned.
        // No database/Auth/SMTP/analytics work occurs for this acknowledgment.
        if (!signature && isWooSetupPing(buffer)) return new Response('OK', { status: 200 })
        const secret = process.env.WC_WEBHOOK_SECRET
        if (!secret) return NextResponse.json({ error: 'Missing secret' }, { status: 500 })
        if (!verifyWooSignature(buffer, signature, secret)) {
            return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
        }
        if (isWooSetupPing(buffer, { allowJson: true })) return new Response('OK', { status: 200 })
        let body
        try { body = JSON.parse(buffer.toString('utf8')) }
        catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
        const orderId = safeOrderId(body?.id)
        if (!orderId) return NextResponse.json({ error: 'Invalid order id' }, { status: 400 })
        const verification = { strict: isConversationalPolicyEnabled(), trustedSource: true }
        const payment = validateWooPayment(body, verification)
        const recorded = await recordWooWebhookSnapshot(db, orderId, body, payment, FieldValue.serverTimestamp())
        if (!recorded.accepted) {
            if (recorded.reason === 'refunded_order_requires_review') return reviewOrder(orderId, recorded.reason)
            return NextResponse.json({ skipped: true, reason: recorded.reason, bookReady: false })
        }
        if (payment.ok || body?.status === 'refunded') {
            try { await recordVerifiedOrderEvidence({ order: body, db }) }
            catch { console.warn('[createWedding] payment evidence write failed') }
        }
        if (!payment.ok) {
            if (payment.reason !== 'wrong_status') return reviewOrder(orderId, payment.reason)
            return NextResponse.json({ skipped: true, reason: 'wrong_status', bookReady: false })
        }
        const email = typeof body.billing?.email === 'string' ? body.billing.email.trim().toLowerCase() : ''
        if (!validEmail(email)) return reviewOrder(orderId, 'owner_email_unverified')
        const name = [body.billing?.first_name, body.billing?.last_name].filter(v => typeof v === 'string').join(' ').trim().slice(0, 120)
        // Cancel sales reminders on trusted payment even if Auth or book
        // provisioning later fails. A null weddingId makes no creation claim.
        try {
            const { closeLeadOnPurchase } = await import('@/lib/salesAgent/leads')
            await recordVerifiedSalesOutcome(body, closeLeadOnPurchase, { ...verification, weddingId: null })
        } catch { console.warn('[createWedding] verified sales outcome write failed') }
        // An owner-editable wedding document is not an identity authority.
        // Resolve the signed billing email through Firebase before adoption.
        const owner = await getOrCreateOwner(email, name)
        claim = await claimOrderFulfillment(db, body, payment, { verifiedOwnerId: owner.uid })
        if (claim.status === 'review_required') return reviewOrder(orderId, claim.reason)
        if (claim.status === 'busy') return NextResponse.json({ received: true, fulfillment: 'preparing', bookReady: false }, { status: 202 })
        let bookResult = claim
        if (claim.status === 'claimed') {
            if (!await bindOrderOwner(db, claim, owner.uid)) return NextResponse.json({ received: true, fulfillment: 'preparing', bookReady: false }, { status: 202 })
            const viewerToken = crypto.randomUUID()
            bookResult = await commitOrderBook(db, claim, {
                createdVia: 'order', ownerId: owner.uid, ownerEmail: email, ownerName: name || null,
                ownerPhone: typeof body.billing?.phone === 'string' ? body.billing.phone.trim().slice(0, 80) : '',
                amountPaid: body.total ?? null, currency: body.currency ?? null, createdAt: FieldValue.serverTimestamp(),
                orderId, slug: crypto.randomBytes(12).toString('hex'),
                // Preserve the existing owner book-view feature, minted once.
                // These capabilities never enter sales status/guest responses.
                digitalTokens: [viewerToken], digitalTokensIssuedAt: [{ token: viewerToken, issuedAt: new Date().toISOString(), issuedBy: 'createWedding' }],
            })
        }
        if (bookResult.status === 'review_required') return reviewOrder(orderId, bookResult.reason)
        if (bookResult.status !== 'ready') return NextResponse.json({ received: true, fulfillment: 'preparing', bookReady: false }, { status: 202 })
        // This runs on replay, including legacy books: a failed CRM write can
        // recover, but a preparing book never claims to have been created.
        try {
            const { closeLeadOnPurchase } = await import('@/lib/salesAgent/leads')
            await recordVerifiedSalesOutcome(body, closeLeadOnPurchase, { ...verification, weddingId: bookResult.weddingId })
        } catch { console.warn('[createWedding] verified sales outcome write failed') }
        const reviewRef = db.collection('order_fulfillment_reviews').doc(orderId)
        const review = await reviewRef.get()
        if (review.exists && review.data()?.status === 'pending') await reviewRef.set({ status: 'resolved', resolvedAt: FieldValue.serverTimestamp() }, { merge: true })
        let confirmation = 'pending'
        try { confirmation = await sendOrderConfirmation(orderId) }
        catch { console.warn('[createWedding] confirmation preparation failed') }
        const current = await getOrderStatus({ db, verifiedCustomerId: owner.uid, orderId })
        if (!current.ok || !current.bookReady) return reviewOrder(orderId, 'payment_or_book_state_changed')
        return NextResponse.json({ success: true, weddingId: bookResult.weddingId, bookReady: true, confirmation, ...(bookResult.created ? {} : { skipped: true, reason: 'already_created' }) })
    } catch (err) {
        try { await failOrderClaim(db, claim) } catch { /* a finite lease permits safe recovery */ }
        if (err?.message === 'BODY_TOO_LARGE') return NextResponse.json({ error: 'Body too large' }, { status: 413 })
        // Avoid logging raw payloads, owner details, setup links or secrets.
        console.error('[createWedding] fulfillment failed')
        return NextResponse.json({ error: 'Internal error', bookReady: false }, { status: 500 })
    }
}
