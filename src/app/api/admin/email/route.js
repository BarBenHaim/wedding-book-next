export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

import { NextResponse } from 'next/server'
import { adminAuth, adminDb } from '@/lib/firebaseAdmin'
import { FieldValue } from 'firebase-admin/firestore'
import { isSuperAdmin } from '@/lib/superAdmin'
import { COL, resolveWeddings, renderForWedding, sendCampaign, DEFAULT_TEMPLATES } from '@/lib/emailEngine'

// Consolidated super-admin endpoint for the email system. Mirrors the
// /api/studio op-based pattern. Auth: Firebase ID token that resolves to
// a super-admin email.

function newId(prefix) {
    return prefix + '_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4)
}

async function authSuper(req) {
    const h = req.headers.get('authorization')
    if (!h?.startsWith('Bearer ')) return { ok: false, status: 401, error: 'Unauthorized' }
    try {
        const decoded = await adminAuth.verifyIdToken(h.split('Bearer ')[1])
        if (!isSuperAdmin(decoded.email)) return { ok: false, status: 403, error: 'Forbidden' }
        return { ok: true, email: decoded.email }
    } catch {
        return { ok: false, status: 401, error: 'Invalid token' }
    }
}

function sortByTimeDesc(items, field) {
    return items.sort((a, b) => {
        const av = a[field]?.toMillis ? a[field].toMillis() : 0
        const bv = b[field]?.toMillis ? b[field].toMillis() : 0
        return bv - av
    })
}

// Synthetic wedding for previews — has a token already so no DB write.
function sampleWedding() {
    const d = new Date()
    d.setUTCDate(d.getUTCDate() + 14)
    return {
        id: 'sample',
        brideName: 'יעל',
        groomName: 'יואב',
        celebrantName: '',
        weddingDate: d.toISOString().slice(0, 10),
        slug: 'sample',
        ownerEmail: 'demo@weddingtales.co.il',
        eventType: 'wedding',
        digitalTokens: ['preview-token'],
    }
}

export async function POST(req) {
    const auth = await authSuper(req)
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

    let body
    try {
        body = await req.json()
    } catch {
        return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    }
    const { op } = body || {}

    try {
        switch (op) {
            case 'listTemplates': {
                const snap = await adminDb.collection(COL.templates).get()
                const items = sortByTimeDesc(snap.docs.map(d => ({ id: d.id, ...d.data() })), 'updatedAt')
                return NextResponse.json({ items })
            }
            case 'saveTemplate': {
                const t = body.template || {}
                const id = t.id || newId('tmpl')
                await adminDb.collection(COL.templates).doc(id).set(
                    {
                        name: t.name || 'ללא שם',
                        subject: t.subject || '',
                        body: t.body || '',
                        updatedAt: FieldValue.serverTimestamp(),
                        createdAt: t.createdAt || FieldValue.serverTimestamp(),
                    },
                    { merge: true },
                )
                return NextResponse.json({ ok: true, id })
            }
            case 'deleteTemplate': {
                if (!body.id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })
                await adminDb.collection(COL.templates).doc(body.id).delete()
                return NextResponse.json({ ok: true })
            }
            case 'seedDefaults': {
                const existing = await adminDb.collection(COL.templates).limit(1).get()
                if (!existing.empty) return NextResponse.json({ ok: true, skipped: 'not-empty' })
                let created = 0
                for (const t of DEFAULT_TEMPLATES) {
                    await adminDb.collection(COL.templates).doc(newId('tmpl')).set({
                        ...t,
                        createdAt: FieldValue.serverTimestamp(),
                        updatedAt: FieldValue.serverTimestamp(),
                    })
                    created++
                }
                return NextResponse.json({ ok: true, created })
            }
            case 'listAutomations': {
                const snap = await adminDb.collection(COL.automations).get()
                return NextResponse.json({ items: snap.docs.map(d => ({ id: d.id, ...d.data() })) })
            }
            case 'saveAutomation': {
                const a = body.automation || {}
                const id = a.id || newId('auto')
                await adminDb.collection(COL.automations).doc(id).set(
                    {
                        name: a.name || 'ללא שם',
                        templateId: a.templateId || '',
                        trigger: a.trigger || { type: 'beforeWedding', offsetDays: 14 },
                        active: a.active !== false,
                        updatedAt: FieldValue.serverTimestamp(),
                        createdAt: a.createdAt || FieldValue.serverTimestamp(),
                    },
                    { merge: true },
                )
                return NextResponse.json({ ok: true, id })
            }
            case 'deleteAutomation': {
                if (!body.id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })
                await adminDb.collection(COL.automations).doc(body.id).delete()
                return NextResponse.json({ ok: true })
            }
            case 'listCampaigns': {
                const snap = await adminDb.collection(COL.campaigns).get()
                const items = sortByTimeDesc(snap.docs.map(d => ({ id: d.id, ...d.data() })), 'createdAt').slice(0, 80)
                return NextResponse.json({ items })
            }
            case 'deleteCampaign': {
                if (!body.id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })
                await adminDb.collection(COL.campaigns).doc(body.id).delete()
                return NextResponse.json({ ok: true })
            }
            case 'preview': {
                const segment = body.segment || { type: 'all' }
                const weddings = await resolveWeddings(segment)
                const sample = weddings.slice(0, 8).map(w => ({
                    id: w.id,
                    name:
                        w.brideName && w.groomName
                            ? `${w.brideName} ו${w.groomName}`
                            : w.celebrantName || w.brideName || w.groomName || '—',
                    email: w.ownerEmail || w.email || '',
                    weddingDate: w.weddingDate || '',
                }))
                const rendered = await renderForWedding(
                    { subject: body.subject || '', body: body.body || '' },
                    sampleWedding(),
                )
                return NextResponse.json({ count: weddings.length, sample, preview: rendered })
            }
            case 'send': {
                const segment = body.segment || { type: 'all' }
                let template
                if (body.templateId) {
                    const t = await adminDb.collection(COL.templates).doc(body.templateId).get()
                    if (!t.exists) return NextResponse.json({ error: 'Template not found' }, { status: 404 })
                    template = t.data()
                } else {
                    template = { subject: body.subject || '', body: body.body || '' }
                }
                const scheduleFor = body.scheduleFor ? new Date(body.scheduleFor) : null
                const id = newId('camp')
                if (scheduleFor && scheduleFor.getTime() > Date.now()) {
                    await adminDb.collection(COL.campaigns).doc(id).set({
                        templateId: body.templateId || null,
                        subject: template.subject,
                        body: template.body,
                        segment,
                        status: 'scheduled',
                        scheduledFor: scheduleFor,
                        createdAt: FieldValue.serverTimestamp(),
                        createdBy: auth.email,
                    })
                    return NextResponse.json({ ok: true, scheduled: true, id, when: scheduleFor.toISOString() })
                }
                const result = await sendCampaign({ template, segment, source: { kind: 'campaign', id } })
                await adminDb.collection(COL.campaigns).doc(id).set({
                    templateId: body.templateId || null,
                    subject: template.subject,
                    body: template.body,
                    segment,
                    status: 'sent',
                    sentAt: FieldValue.serverTimestamp(),
                    createdAt: FieldValue.serverTimestamp(),
                    createdBy: auth.email,
                    result,
                })
                return NextResponse.json({ ok: true, sent: true, id, result })
            }
            default:
                return NextResponse.json({ error: `Unknown op: ${op}` }, { status: 400 })
        }
    } catch (err) {
        console.error(`[admin/email] op=${op} failed:`, err)
        return NextResponse.json({ error: err?.message || 'Internal error' }, { status: 500 })
    }
}
