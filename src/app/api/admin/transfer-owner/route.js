// /api/admin/transfer-owner — move an event to another email (super-admin).
//
//   POST { weddingId, email, notify? = true }
//     → { ok, ownerId, ownerEmail, isNewUser, emailSent, previousEmail }
//
// Moves ownerId (what /login, /my and firestore.rules actually check)
// together with ownerEmail. See src/lib/ownerTransfer.js for the why.

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import { randomBytes } from 'crypto'
import { NextResponse } from 'next/server'
import nodemailer from 'nodemailer'
import { FieldValue } from 'firebase-admin/firestore'
import { adminDb, adminAuth } from '@/lib/firebaseAdmin'
import { isSuperAdmin } from '@/lib/superAdmin'
import {
    normalizeOwnerEmail,
    transferProblem,
    isSameOwner,
    TRANSFER_ERRORS,
    previousOwnerRecord,
    eventLabelForEmail,
    transferEmail,
} from '@/lib/ownerTransfer'

const fail = (status, code) => NextResponse.json({ ok: false, error: TRANSFER_ERRORS[code] || code, code }, { status })

export async function POST(req) {
    const authHeader = req.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    let admin
    try {
        admin = await adminAuth.verifyIdToken(authHeader.split('Bearer ')[1])
    } catch {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (!isSuperAdmin(admin.email)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    try {
        const body = await req.json().catch(() => ({}))
        const weddingId = typeof body.weddingId === 'string' ? body.weddingId.trim() : ''
        const notify = body.notify !== false

        // Validate before touching Firestore: a '/' in the id would
        // otherwise address a different document path.
        const problem = transferProblem({ weddingId, email: body.email })
        if (problem) return fail(400, problem)
        const email = normalizeOwnerEmail(body.email)

        const ref = adminDb.collection('weddings').doc(weddingId)
        const snap = await ref.get()
        if (!snap.exists) return fail(404, 'not-found')
        const w = snap.data() || {}

        // ── 1. The account for the new email ─────────────────────────
        let user = null
        try {
            user = await adminAuth.getUserByEmail(email)
        } catch (err) {
            if (err?.code !== 'auth/user-not-found') throw err
        }
        if (user && isSameOwner(w, user.uid, email)) return fail(400, 'same-owner')
        let password = null
        if (!user) {
            password = randomBytes(9).toString('base64url')
            user = await adminAuth.createUser({ email, password })
        }

        // ── 2. Move the event, keep where it came from ───────────────
        await ref.set(
            {
                ownerId: user.uid,
                ownerEmail: email,
                ownerChangedAt: FieldValue.serverTimestamp(),
                previousOwners: FieldValue.arrayUnion(
                    previousOwnerRecord({ ownerId: w.ownerId, ownerEmail: w.ownerEmail || w.email }, new Date().toISOString(), admin.email),
                ),
            },
            { merge: true },
        )

        // ── 3. Tell the new owner (optional, best-effort) ────────────
        let emailSent = false
        if (notify) {
            try {
                const { subject, html } = transferEmail({ email, eventLabel: eventLabelForEmail(w), password })
                const transporter = nodemailer.createTransport({
                    service: 'gmail',
                    auth: { user: process.env.MAIL_USER, pass: process.env.MAIL_PASS },
                })
                await transporter.sendMail({ from: `"Wedding Tales" <${process.env.MAIL_USER}>`, to: email, subject, html })
                emailSent = true
            } catch (mailErr) {
                console.error('[transfer-owner] email failed, transfer kept:', mailErr?.message || mailErr)
            }
        }

        return NextResponse.json({
            ok: true,
            ownerId: user.uid,
            ownerEmail: email,
            isNewUser: Boolean(password),
            emailSent,
            previousEmail: w.ownerEmail || w.email || null,
        })
    } catch (err) {
        console.error('[transfer-owner] failed:', err?.message || err)
        return NextResponse.json({ ok: false, error: 'ההעברה נכשלה — נסה שוב' }, { status: 500 })
    }
}
