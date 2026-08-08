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

// Default demo wedding (Mai & Maor) — used when no landing config
// doc exists yet. The super-admin can point the demo at any wedding
// The choice lives in `site_config/landing`. The admin screen that
// wrote it was removed; the doc is still read, so the page keeps
// rendering whatever was saved last, and changing it now means code.
const DEFAULT_DEMO_WEDDING_ID = '9bGnCaCuJvPwRg7CqaAJlGepQxx1'

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

// Landing config in `site_config/landing` — demo wedding override +
// custom chapters. Null-safe: missing doc → built-in defaults.
async function fetchLandingConfig() {
    try {
        const snap = await adminDb.collection('site_config').doc('landing').get()
        if (!snap.exists) return null
        return JSON.parse(JSON.stringify(snap.data() || {}))
    } catch (err) {
        console.warn('[landing] config fetch failed:', err?.message || err)
        return null
    }
}

async function fetchLiveWedding(weddingId) {
    try {
        const snap = await adminDb.collection('weddings').doc(weddingId).get()
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
    const config = await fetchLandingConfig()
    const demoId = config?.demoWeddingId || DEFAULT_DEMO_WEDDING_ID
    const liveWedding = await fetchLiveWedding(demoId)
    const chapters = Array.isArray(config?.chapters) && config.chapters.length > 0 ? config.chapters : null
    return <LandingClient liveWedding={liveWedding} chapters={chapters} />
}
