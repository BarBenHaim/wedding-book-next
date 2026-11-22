// /api/cron/lifecycle — the daily job that moves a customer from "paid" to "printed".
//
//   GET (Vercel cron, Authorization: Bearer CRON_SECRET)
//   GET ?dry=1   → what would be sent, nothing sent, nothing marked
//
// For every event opened by a paid order since the engine started, it asks
// src/lib/lifecycle.js what is due today (a nudge to send the link, the sign before
// the event, the review after it, the balance reminders), sends that one e-mail and
// marks it on the event (`lifecycleSent`) so it never goes twice. A short line to the
// owner of the business goes out for the exceptions only (a quiet event that is days
// away, a balance long overdue), once each.

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 120

import { NextResponse } from 'next/server'
import nodemailer from 'nodemailer'
import { adminDb as db } from '@/lib/firebaseAdmin'
import { Timestamp } from 'firebase-admin/firestore'
import { nextMessage, renderLifecycleEmail, bookTitleOf, digestLines, israelDate, daysBetween, LIFECYCLE_START_MS } from '@/lib/lifecycle'
import { enterSecret, signEnterToken, enterUrl } from '@/lib/enterLink'
import { eventSignUrl } from '@/lib/eventLinks'

const MAX_SENDS_PER_RUN = 40
const BALANCE_CHECKOUT = id => `https://weddingtales.co.il/checkout/?add-to-cart=6271&wt_bal=${encodeURIComponent(id)}`

// Fail closed: with no CRON_SECRET nothing runs.
function authorized(req) {
    const secret = process.env.CRON_SECRET
    if (!secret) return false
    return (req.headers.get('authorization') || '') === `Bearer ${secret}`
}

function linksFor(id, w, baseUrl) {
    const guest = `${baseUrl}/w/${w.slug || ''}`
    const title = bookTitleOf(w)
    const text = `${title ? `ספר הברכות של ${title}` : 'ספר הברכות שלנו'}: נשמח שתכתבו ברכה ותוסיפו תמונה, לוקח שתי דקות מהטלפון 💛\n${guest}`
    const token = signEnterToken(w.ownerId, { secret: enterSecret() })
    return {
        share: `https://wa.me/?text=${encodeURIComponent(text)}`,
        sign: eventSignUrl(baseUrl, id),
        portal: token ? enterUrl(baseUrl, token) : `${baseUrl}/wedding/${id}/portal`,
        balance: BALANCE_CHECKOUT(id),
    }
}

export async function GET(req) {
    if (!authorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const dry = new URL(req.url).searchParams.get('dry') === '1'
    const now = Date.now()
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://app.weddingtales.co.il'
    const out = { ok: true, dry, checked: 0, due: [], sent: 0, failed: 0, digest: 0 }

    try {
        const snap = await db.collection('weddings').where('createdAt', '>=', Timestamp.fromMillis(LIFECYCLE_START_MS)).get()
        const transporter = dry ? null : nodemailer.createTransport({ service: 'gmail', auth: { user: process.env.MAIL_USER, pass: process.env.MAIL_PASS } })
        const quiet = []
        const overdue = []
        const today = israelDate(now)

        for (const doc of snap.docs) {
            const w = doc.data()
            if (w.createdVia !== 'order') continue
            out.checked++
            const entries = (await doc.ref.collection('entries').count().get()).data().count
            const sent = w.lifecycleSent || {}

            // Exceptions for the owner of the business (each once per event).
            if (/^\d{4}-\d{2}-\d{2}$/.test(String(w.weddingDate || ''))) {
                const toEvent = daysBetween(today, w.weddingDate)
                if (toEvent >= 0 && toEvent <= 7 && entries === 0 && !sent.digest_quiet) quiet.push({ id: doc.id, title: bookTitleOf(w), days: toEvent, email: w.ownerEmail, ref: doc.ref })
                if (w.paymentStage === 'deposit' && -toEvent > 30 && !sent.digest_balance) overdue.push({ id: doc.id, title: bookTitleOf(w), days: -toEvent, balanceDue: w.balanceDue, email: w.ownerEmail, ref: doc.ref })
            }

            const due = nextMessage({ w, entries, now, sent })
            if (!due) continue
            out.due.push({ id: doc.id, key: due.key, kind: due.kind })
            if (dry || out.sent >= MAX_SENDS_PER_RUN) continue

            try {
                const mail = renderLifecycleEmail(
                    due.kind,
                    { title: bookTitleOf(w), entries, balanceDue: Number(w.balanceDue) || null },
                    linksFor(doc.id, w, baseUrl),
                )
                await transporter.sendMail({
                    from: `"Wedding Tales" <${process.env.MAIL_USER}>`,
                    to: w.ownerEmail,
                    subject: mail.subject,
                    html: mail.html,
                    text: mail.text,
                })
                await doc.ref.set({ lifecycleSent: { [due.key]: now } }, { merge: true })
                out.sent++
            } catch (err) {
                out.failed++
                console.error(`[cron/lifecycle] ${doc.id} ${due.key} failed:`, err?.message || err)
            }
        }

        const lines = digestLines({ quietEvents: quiet, overdueBalances: overdue })
        if (lines.length) {
            out.digest = lines.length
            if (!dry) {
                await transporter.sendMail({
                    from: `"Wedding Tales" <${process.env.MAIL_USER}>`,
                    to: process.env.MAIL_USER,
                    subject: `מה דורש תשומת לב היום (${lines.length})`,
                    text: lines.join('\n') + '\n\nניהול: https://app.weddingtales.co.il/admin',
                })
                for (const q of quiet) await q.ref.set({ lifecycleSent: { digest_quiet: now } }, { merge: true })
                for (const o of overdue) await o.ref.set({ lifecycleSent: { digest_balance: now } }, { merge: true })
            }
        }
        return NextResponse.json(out)
    } catch (err) {
        console.error('[cron/lifecycle] failed:', err)
        return NextResponse.json({ ok: false, error: err?.message || 'Internal error' }, { status: 500 })
    }
}

export async function POST(req) {
    return GET(req)
}
