// Human service queue. Admin SDK collection has no client rules grant.
// The webhook shared secret is deliberately insufficient for this admin API.
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const fetchCache = 'force-no-store'

import { NextResponse } from 'next/server'
import { adminAuth } from '@/lib/firebaseAdmin'
import { isSuperAdmin } from '@/lib/superAdmin'
import { normalizePhone } from '@/lib/salesAgent/agent'
import { getHumanHandoff, listHumanHandoffs, requestHumanHandoff, updateHumanHandoff } from '@/lib/salesAgent/leads'

async function adminActor(req) {
    const auth = req.headers.get('authorization') || ''
    if (!auth.startsWith('Bearer ')) return null
    try {
        const decoded = await adminAuth.verifyIdToken(auth.slice(7).trim(), true)
        if (decoded.uid && decoded.email_verified === true && isSuperAdmin(decoded.email)) return `admin:${decoded.uid}`
    } catch { /* invalid/revoked tokens fail closed */ }
    return null
}

const json = (data, status = 200) => NextResponse.json(data, { status, headers: { 'Cache-Control': 'no-store' } })

export async function GET(req) {
    if (!await adminActor(req)) return json({ error: 'Unauthorized' }, 401)
    const url = new URL(req.url)
    try {
        const id = url.searchParams.get('taskId')
        if (id) {
            if (!/^[a-f0-9]{32}$/.test(id)) return json({ error: 'bad-task-id' }, 400)
            const task = await getHumanHandoff(id)
            return task ? json({ ok: true, task }) : json({ error: 'not-found' }, 404)
        }
        return json({ ok: true, tasks: await listHumanHandoffs({ limit: url.searchParams.get('limit') }) })
    } catch {
        return json({ error: 'handoff-store-unavailable' }, 503)
    }
}

export async function POST(req) {
    const actor = await adminActor(req)
    if (!actor) return json({ error: 'Unauthorized' }, 401)
    let body
    try { body = await req.json() } catch { return json({ error: 'bad-json' }, 400) }
    const phone = normalizePhone(body?.phone)
    const action = body?.action
    if (!phone) return json({ error: 'bad-phone' }, 400)
    if (!['request', 'acknowledge', 'resolve', 'release'].includes(action)) return json({ error: 'bad-action' }, 400)
    if (action !== 'request' && !/^[a-f0-9]{32}$/.test(String(body?.taskId || ''))) return json({ error: 'task-id-required' }, 400)
    try {
        const result = action === 'request'
            ? await requestHumanHandoff({ phone, actor, reason: typeof body.reason === 'string' ? body.reason.slice(0, 240) : 'Admin requested human service' })
            : await updateHumanHandoff({ phone, taskId: body.taskId, action, actor })
        return json({ ...result, humanTakeover: result.status !== 'released' })
    } catch (error) {
        const code = error?.code
        const status = code === 'TASK_NOT_FOUND' ? 404 : ['TASK_MISMATCH', 'INVALID_TASK_TRANSITION'].includes(code) ? 409 : 503
        return json({ error: status === 503 ? 'handoff-store-unavailable' : code }, status)
    }
}
