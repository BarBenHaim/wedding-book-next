// The customer board of the super admin: where everyone stands, and the few
// things Lord can record from it. Rules: lib/customerBoard.js.

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const fetchCache = 'force-no-store'
export const maxDuration = 60

import { NextResponse } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { adminAuth, adminDb } from '@/lib/firebaseAdmin'
import { isSuperAdmin } from '@/lib/superAdmin'
import { israelDate } from '@/lib/lifecycle'
import { buildCustomerBoard, BOARD_GROUPS } from '@/lib/customerBoard'
import { FOLLOWUPS, renderFollowup } from '@/lib/customerFollowups'
import { FOLLOWUPS_COLLECTION, closeOpenRequests, loadCustomerBooks, readFollowupSettings, writeFollowupSettings } from '@/lib/customerData'
import { sendTestFollowup } from '@/lib/customerFollowupsRunner'
import { checkClaude, readClaudeHealth } from '@/lib/salesAgent/claudeHealth'
import { decideSample, listSamples, readDesignSettings, writeDesignSettings } from '@/lib/salesAgent/designSamples'

const MILESTONES = new Set(['printOrderedAt', 'shippedAt', 'deliveredAt', 'closedAt', 'triagedAt'])
const KEYS = new Set(FOLLOWUPS.map(item => item.key))
const DAY_MS = 86_400_000
const addDays = (iso, days) => new Date(Date.parse(`${iso}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10)

async function superAdmin(req) {
    const header = req.headers.get('authorization') || ''
    if (!header.startsWith('Bearer ')) return null
    try {
        const decoded = await adminAuth.verifyIdToken(header.slice(7))
        return isSuperAdmin(decoded.email) ? decoded : null
    } catch {
        return null
    }
}

const forbidden = () => NextResponse.json({ error: 'Forbidden' }, { status: 403 })
const bad = () => NextResponse.json({ error: 'Bad request' }, { status: 400 })
// Refusals of a sample decision that the screen explains in words.
const SAMPLE_REFUSALS = new Set(['SAMPLE_NOT_FOUND', 'SAMPLE_NOT_READY', 'WINDOW_CLOSED', 'LEAD_CLOSED', 'SEND_FAILED', 'INVALID_DECISION'])

// The sign samples of leads. A failure here must not hide the customers.
async function sampleBoard() {
    const settings = await readDesignSettings()
    try {
        return { enabled: settings.enabled, items: await listSamples() }
    } catch (error) {
        console.error('[admin/customers] samples not read:', error?.code || 'UNKNOWN')
        return { enabled: settings.enabled, items: null }
    }
}

export async function GET(req) {
    if (!await superAdmin(req)) return forbidden()
    try {
        const today = israelDate(Date.now())
        const [list, settings, claude, samples] = await Promise.all([loadCustomerBooks(), readFollowupSettings(), readClaudeHealth(), sampleBoard()])
        const board = buildCustomerBoard(list, today, settings.enabled ? settings.enabledDay : null)
        const week = addDays(today, 7)
        const sends = board.rows
            .flatMap(row => row.group === 'done' || row.group === 'triage' ? []
                : row.scheduled.filter(item => item.day <= week).map(item => ({ ...item, id: row.id, title: row.title })))
            .sort((a, b) => a.day.localeCompare(b.day))
        // The words of a message Lord is asked to send himself.
        const books = new Map(list.map(({ w }) => [w.id, w]))
        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://app.weddingtales.co.il'
        const rows = board.rows.map(row => row.next.message && !row.auto
            ? { ...row, text: renderFollowup(row.next.message, books.get(row.id), baseUrl) }
            : row)
        return NextResponse.json({ today, settings, claude, samples, groups: BOARD_GROUPS, counts: board.counts, rows, sends })
    } catch (error) {
        console.error('[admin/customers] read failed:', error?.message || error)
        return NextResponse.json({ error: 'Internal error' }, { status: 500 })
    }
}

// What one request writes on a book, or null when the request is not valid.
function bookPatch(body, today) {
    const now = FieldValue.serverTimestamp()
    if (body.op === 'triage') {
        return {
            delivered: { deliveredAt: now },
            in_print: { printOrderedAt: now },
            handle: { triagedAt: now },
            closed: { closedAt: now, closedReason: 'other' },
        }[body.result] || null
    }
    if (body.op === 'mark') {
        if (!MILESTONES.has(body.field)) return null
        if (body.on === true) return { [body.field]: now }
        return {
            [body.field]: FieldValue.delete(),
            ...(body.field === 'closedAt' ? { closedReason: FieldValue.delete() } : {}),
        }
    }
    if (body.op === 'defer') {
        const days = Number(body.days)
        if (!Number.isInteger(days) || days < 0 || days > 90) return null
        return { boardDeferUntil: days ? addDays(today, days) : FieldValue.delete() }
    }
    if (body.op === 'note') {
        return { boardNote: String(body.text || '').trim().slice(0, 500) || FieldValue.delete() }
    }
    if (body.op === 'mute') return { lifecycleOff: body.on === true }
    if (body.op === 'sentByHand') return KEYS.has(body.key) ? { lifecycleSent: { [body.key]: Date.now() } } : null
    return null
}

export async function POST(req) {
    const admin = await superAdmin(req)
    if (!admin) return forbidden()
    const body = await req.json().catch(() => ({}))
    const today = israelDate(Date.now())

    try {
        if (body.op === 'settings') {
            const settings = await writeFollowupSettings({ enabled: body.enabled === true, today, by: admin.email })
            return NextResponse.json({ ok: true, settings })
        }
        if (body.op === 'test') {
            // Only ever to Lord's own phone, whatever the request says.
            try {
                await sendTestFollowup({ key: String(body.key || ''), phone: process.env.SALES_AGENT_OWNER_PHONE })
                return NextResponse.json({ ok: true })
            } catch (error) {
                return NextResponse.json({
                    error: error?.errorCode || error?.code || 'PROVIDER_FAILED',
                    ...(error?.providerCode ? { providerCode: error.providerCode } : {}),
                }, { status: 502 })
            }
        }

        // One small call to Claude. It messages nobody.
        if (body.op === 'claudeCheck') {
            return NextResponse.json({ ok: true, check: await checkClaude() })
        }
        if (body.op === 'sampleSwitch') {
            const saved = await writeDesignSettings({ enabled: body.enabled === true, by: admin.email })
            return NextResponse.json({ ok: true, enabled: saved.enabled })
        }
        // Lord's approval of one sample: this is what sends it.
        if (body.op === 'sample') {
            const sample = String(body.id || '')
            if (!sample || sample.includes('/')) return bad()
            try {
                const result = await decideSample(sample, String(body.decision || ''))
                return NextResponse.json({ ok: true, status: result.status })
            } catch (error) {
                if (SAMPLE_REFUSALS.has(error?.code)) return NextResponse.json({ error: error.code }, { status: 409 })
                throw error
            }
        }

        const id = String(body.weddingId || '')
        if (!id || id.includes('/')) return bad()

        if (body.op === 'handled') {
            return NextResponse.json({ ok: true, closed: await closeOpenRequests(id) })
        }

        const patch = bookPatch(body, today)
        if (!patch) return bad()
        const ref = adminDb.collection('weddings').doc(id)
        if (!(await ref.get()).exists) return NextResponse.json({ error: 'Not found' }, { status: 404 })
        await ref.set({ ...patch, updatedAt: FieldValue.serverTimestamp() }, { merge: true })
        if (body.op === 'sentByHand') {
            await adminDb.collection(FOLLOWUPS_COLLECTION).doc(`${id}_${body.key}`).set({
                weddingId: id, key: body.key, status: 'manual', outboundId: null, errorCode: null,
                at: FieldValue.serverTimestamp(),
            })
        }
        return NextResponse.json({ ok: true })
    } catch (error) {
        console.error('[admin/customers] write failed:', error?.message || error)
        return NextResponse.json({ error: 'Internal error' }, { status: 500 })
    }
}
