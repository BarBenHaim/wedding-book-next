// Reads what the list of people is built from. Server only. A part that cannot
// be read is named in `unread`, so the screen never passes a partial list off as
// the whole one.

import { adminDb } from '@/lib/firebaseAdmin'
import { loadCustomerBooks, readFollowupSettings } from '@/lib/customerData'
import { listDrafts } from '@/lib/salesAgent/customerAgent'
import { listSamples } from '@/lib/salesAgent/designSamples'
import { buildPeople } from '@/lib/people'

// Every lead, with no limit: a cut-off read would split people from their books.
const LEAD_FIELDS = [
    'stage', 'human', 'humanSince', 'turns', 'weddingId', 'callbackPromised', 'followUpAt', 'lastInboundAt', 'lastMessageAt',
    'createdAt', 'updatedAt', 'eventDate', 'eventType', 'name', 'profileName', 'celebrantName', 'handoffReason',
    'packageInterest', 'closedAt', 'paymentVerifiedAt', 'amount',
]

export async function loadPeople({ today, nowMs = Date.now() }) {
    const unread = []
    const part = async (name, read) => {
        try {
            return await read()
        } catch (error) {
            console.error(`[people] ${name} not read:`, error?.code || 'UNKNOWN')
            unread.push(name)
            return null
        }
    }

    const leads = await part('לידים', async () => (await adminDb.collection('sales_leads').select(...LEAD_FIELDS).get())
        .docs.map(doc => ({ ...doc.data(), phone: doc.id })))
    const [books, settings, drafts, samples] = await Promise.all([
        part('ספרים', () => loadCustomerBooks(leads ? { leads } : {})),
        part('הגדרות הודעות', () => readFollowupSettings()),
        part('בקשות לקוחות', () => listDrafts()),
        part('דוגמאות שלט', () => listSamples()),
    ])

    const { rows, counts } = buildPeople({
        today, nowMs, books: books || [], leads: leads || [], drafts: drafts || [], samples: samples || [],
        ownerPhone: process.env.SALES_AGENT_OWNER_PHONE || '',
        enabledDay: settings?.enabled ? settings.enabledDay : null,
        baseUrl: process.env.NEXT_PUBLIC_BASE_URL || 'https://app.weddingtales.co.il',
    })
    return { rows, counts, drafts, samples, unread }
}
