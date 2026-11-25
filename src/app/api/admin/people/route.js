// The list of people of the super admin. Read only: marks and approvals go
// through /api/admin/customers, lead actions through /api/sales-agent.
// Rules: lib/people.js.

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const fetchCache = 'force-no-store'
export const maxDuration = 60

import { NextResponse } from 'next/server'
import { adminAuth } from '@/lib/firebaseAdmin'
import { isSuperAdmin } from '@/lib/superAdmin'
import { israelDate } from '@/lib/lifecycle'
import { loadPeople } from '@/lib/peopleData'

async function superAdmin(req) {
    const header = req.headers.get('authorization') || ''
    if (!header.startsWith('Bearer ')) return false
    try {
        return isSuperAdmin((await adminAuth.verifyIdToken(header.slice(7))).email)
    } catch {
        return false
    }
}

export async function GET(req) {
    if (!await superAdmin(req)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    const today = israelDate(Date.now())
    try {
        return NextResponse.json({ today, ...await loadPeople({ today }) })
    } catch (error) {
        console.error('[admin/people] failed:', error?.message || error)
        return NextResponse.json({ error: 'Internal error' }, { status: 500 })
    }
}
