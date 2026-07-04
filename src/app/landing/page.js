// /landing — server shell. Fetches the demo wedding's LIVE design
// (Dor & Shaked) with the Admin SDK and hands it to the client page,
// so the interactive demo + guest-form replica render with the exact
// preset currently assigned in the system. ISR keeps it fresh: a
// studio change shows up here within 5 minutes without a deploy.
//
// The Admin SDK bypasses Firestore rules and runs only on the server —
// the client receives a sanitized, plain-JSON subset of the doc (the
// design + copy fields the demo needs, nothing else).

import LandingClient from './LandingClient'
import { adminDb } from '@/lib/firebaseAdmin'

export const revalidate = 300 // seconds — refresh the live design every 5 min

// The wedding whose LIVE design drives the interactive demo — Dor &
// Shaked (the wedding chapter on the page).
const DEMO_WEDDING_ID = 'rOPkVWbwurT4UjKCR5hg'

// Only the fields the demo consumes, JSON-sanitized. Deliberately NO
// timestamps (not serializable as props) and no owner/contact fields.
const KEEP_FIELDS = [
    'eventType', 'designVariant', 'guestDesign',
    'bookDesign', 'coverDesign',
    'brideName', 'brideNameHe', 'groomName', 'groomNameHe',
    'celebrantName', 'celebrantNameHe', 'customTitle',
    'customNameLabel', 'customNamePlaceholder',
    'customBlessingLabel', 'customBlessingPlaceholder',
    'blessingMaxChars', 'locale',
]

async function fetchLiveWedding() {
    try {
        const snap = await adminDb.collection('weddings').doc(DEMO_WEDDING_ID).get()
        if (!snap.exists) return null
        const data = snap.data() || {}
        const out = {}
        for (const k of KEEP_FIELDS) {
            if (data[k] !== undefined) out[k] = data[k]
        }
        // JSON round-trip guarantees a plain serializable object (drops
        // any stray Firestore types nested inside the design maps).
        return JSON.parse(JSON.stringify(out))
    } catch (err) {
        console.warn('[landing] live design fetch failed:', err?.message || err)
        return null
    }
}

export default async function LandingPage() {
    const liveWedding = await fetchLiveWedding()
    return <LandingClient liveWedding={liveWedding} />
}
