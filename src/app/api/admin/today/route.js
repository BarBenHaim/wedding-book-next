// The data of the super admin's "today" screen. Read only: actions go through
// /api/admin/customers. Rules: lib/adminToday.js.

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const fetchCache = 'force-no-store'
export const maxDuration = 60

import { NextResponse } from 'next/server'
import { adminAuth, adminDb } from '@/lib/firebaseAdmin'
import { isSuperAdmin } from '@/lib/superAdmin'
import { israelDate } from '@/lib/lifecycle'
import { readFollowupSettings } from '@/lib/customerData'
import { loadPeople } from '@/lib/peopleData'
import { buildToday } from '@/lib/adminToday'
import { readAgentSettings } from '@/lib/salesAgent/customerAgent'
import { readDesignSettings } from '@/lib/salesAgent/designSamples'
import { readClaudeHealth } from '@/lib/salesAgent/claudeHealth'
import { readSalesSettings } from '@/lib/salesAgent/settingsStore'
import { listMedia } from '@/lib/salesAgent/leads'
import { MEDIA } from '@/lib/salesAgent/catalog'
import { mergeMedia } from '@/lib/salesAgent/mediaLibrary'
import { MODEL_REGISTRY } from '@/lib/salesAgent/settings'

async function superAdmin(req) {
    const header = req.headers.get('authorization') || ''
    if (!header.startsWith('Bearer ')) return false
    try {
        return isSuperAdmin((await adminAuth.verifyIdToken(header.slice(7))).email)
    } catch {
        return false
    }
}

// One unreadable part must not blank the screen; null means "not read".
async function part(name, read) {
    try {
        return await read()
    } catch (error) {
        console.error(`[admin/today] ${name} not read:`, error?.code || 'UNKNOWN')
        return null
    }
}

// null means the switch was not read, which is not the same as off.
const onOff = settings => (settings ? settings.enabled === true : null)

async function monthUsage(today) {
    const days = Array.from({ length: Number(today.slice(8, 10)) }, (_, i) => `${today.slice(0, 8)}${String(i + 1).padStart(2, '0')}`)
    const snaps = await adminDb.getAll(...days.map(day => adminDb.collection('sales_usage').doc(day)))
    return snaps.flatMap((snap, i) => (snap.exists ? [{ ...snap.data(), date: days[i] }] : []))
}

async function botState() {
    const library = mergeMedia(MEDIA, await listMedia())
    const settings = await readSalesSettings({ registeredMediaKeys: Object.keys(library) })
    const experiment = settings.modelExperiment?.enabled === true
    return {
        enabled: settings.enabled !== false,
        mode: settings.mode,
        model: settings.model,
        modelLabel: experiment ? 'לפי ניסוי מודלים' : MODEL_REGISTRY.find(row => row.id === settings.model)?.label || settings.model,
    }
}

export async function GET(req) {
    if (!await superAdmin(req)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    const today = israelDate(Date.now())

    const [people, claude, bot, usageDays, followups, requests, sampleSwitch] = await Promise.all([
        // The same list the customers screen shows, with its requests and samples.
        part('customers', () => loadPeople({ today })),
        part('claude', () => readClaudeHealth()),
        part('bot', botState),
        part('spend', () => monthUsage(today)),
        part('followups', () => readFollowupSettings()),
        part('requests switch', () => readAgentSettings()),
        part('samples switch', () => readDesignSettings()),
    ])

    const drafts = people ? people.drafts : null
    const samples = people ? people.samples : null
    return NextResponse.json({
        ...buildToday({
            today, people, drafts, samples, claude, usageDays, bot,
            // Only the on/off of each, never the test phone lists.
            switches: { requests: onOff(requests), samples: onOff(sampleSwitch), followups: onOff(followups) },
        }),
        // The person window shows the request or the sample of that person.
        drafts, samples,
    })
}
