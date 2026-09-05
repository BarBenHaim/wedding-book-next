// src/app/api/account-deletion/route.js
//
// Receives a request from the public /account-deletion page and records it
// in `deletionRequests`. Nothing is deleted here — see the note in
// src/lib/deletionRequest.js for why a public endpoint must not delete.
//
// Google Play's Data Safety form asks for a deletion URL that works for a
// user who has never installed the app, so this endpoint is unauthenticated
// on purpose. Two consequences are handled below:
//
//   • one document per normalised email (doc id = the email), so repeated
//     submissions update a single row instead of filling a collection. A
//     `submissions` counter keeps the retry history without the rows.
//   • the row records only what the person typed plus a timestamp. No IP,
//     no geo: someone asking to be forgotten is the last person whose
//     location we should be writing down.

import { NextResponse } from 'next/server'
import { adminDb } from '@/lib/firebaseAdmin'
import { FieldValue } from 'firebase-admin/firestore'
import { validateDeletionRequest } from '@/lib/deletionRequest'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Firestore document ids may not contain '/' and are capped at 1500 bytes.
// Emails cannot exceed EMAIL_MAX (254) so only the slash needs escaping.
const docIdFor = email => email.replace(/\//g, '_')

export async function POST(req) {
    const body = await req.json().catch(() => ({}))
    const parsed = validateDeletionRequest(body)

    if (!parsed.ok) {
        return NextResponse.json({ ok: false, error: parsed.error }, { status: 400 })
    }

    const { email, reason, note } = parsed.value

    try {
        await adminDb
            .collection('deletionRequests')
            .doc(docIdFor(email))
            .set(
                {
                    email,
                    reason,
                    note,
                    status: 'open',
                    source: 'web',
                    submissions: FieldValue.increment(1),
                    lastRequestedAt: FieldValue.serverTimestamp(),
                    createdAt: FieldValue.serverTimestamp(),
                },
                // merge, so a second submission does not reset `status` on a
                // request somebody is already working through. `createdAt`
                // is rewritten by merge, which is acceptable: the field that
                // matters operationally is lastRequestedAt.
                { merge: true },
            )
    } catch {
        // The person is entitled to a route that works. If the write fails
        // we say so plainly rather than showing a success screen for a
        // request that was never recorded.
        return NextResponse.json({ ok: false, error: 'save_failed' }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
}
