// GET    /api/sales-agent/media  → the library, ranked by what works
// POST   /api/sales-agent/media  → register an upload
// DELETE /api/sales-agent/media?key=…  → remove one
//
// The library the bot sends from. Six images ship in catalog.js and are
// read-only; everything here is what Lord added afterwards from the
// leads screen, which is the whole point — an asset he has to ask me to
// add is an asset he will not bother trying, and finding out what works
// means trying more than you believe in.
//
// ── Why the file itself never comes through this route ──────────────
//
// The browser uploads straight to Firebase Storage and posts only the
// resulting URL here. That is not a shortcut, it is the only thing that
// works: a 16MB video through a Vercel serverless function hits the 4.5MB
// request body limit, and the failure arrives as an opaque 413 after the
// user has waited for the whole upload. Storage takes it directly, with
// progress, and this route stores one short document.
//
// So the checks here are the ones that survive not seeing the bytes:
// the key is well formed, the URL is ours, the size and type were
// already validated client-side against the same shared module.

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const fetchCache = 'force-no-store'
export const maxDuration = 30

import { NextResponse } from 'next/server'
import { adminAuth } from '@/lib/firebaseAdmin'
import { isSuperAdmin } from '@/lib/superAdmin'
import { listMedia, saveMedia, deleteMedia } from '@/lib/salesAgent/leads'
import { MEDIA } from '@/lib/salesAgent/catalog'
import { mergeMedia, rankMedia, validateUpload, keyFrom, MIN_SENDS_FOR_RATE } from '@/lib/salesAgent/mediaLibrary'

async function authorized(req) {
    const shared = process.env.SALES_AGENT_SECRET
    if (shared && (req.headers.get('x-wt-secret') || '') === shared) return true
    const header = req.headers.get('authorization') || ''
    if (header.startsWith('Bearer ')) {
        try {
            const decoded = await adminAuth.verifyIdToken(header.slice(7).trim())
            if (isSuperAdmin(decoded.email)) return true
        } catch {
            /* fall through to 401 */
        }
    }
    return false
}

const toMs = v => {
    if (!v) return null
    if (typeof v === 'number') return v
    if (typeof v?.toMillis === 'function') return v.toMillis()
    if (typeof v?.seconds === 'number') return v.seconds * 1000
    return null
}

export async function GET(req) {
    if (!(await authorized(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const custom = await listMedia({ fresh: true })
    const library = mergeMedia(MEDIA, custom)
    const byKey = Object.fromEntries(custom.map(m => [m.key, m]))
    const ranked = Object.fromEntries(rankMedia(byKey).map(r => [r.key, r]))

    // Built-ins are listed too, and deliberately without stats. They
    // predate the counters, so showing them at 0 sends would read as
    // "these never work" rather than "these were never measured", and
    // that is the kind of wrong number somebody acts on.
    const items = Object.entries(library).map(([key, m]) => ({
        key,
        kind: m.kind,
        url: m.url,
        caption: m.caption,
        when: m.when,
        source: m.source,
        label: byKey[key]?.label || null,
        bytes: byKey[key]?.bytes || null,
        createdAt: toMs(byKey[key]?.createdAt),
        stats: m.source === 'upload' ? (ranked[key] || null) : null,
    }))

    // Uploads first: they are the ones he can act on. Then by score.
    items.sort((a, b) => {
        if (a.source !== b.source) return a.source === 'upload' ? -1 : 1
        return (b.stats?.score ?? -2) - (a.stats?.score ?? -2)
    })

    return NextResponse.json({ ok: true, items, minSendsForRate: MIN_SENDS_FOR_RATE })
}

export async function POST(req) {
    if (!(await authorized(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    let body
    try {
        body = await req.json()
    } catch {
        return NextResponse.json({ error: 'bad-json' }, { status: 400 })
    }

    const kind = body?.kind === 'video' ? 'video' : 'image'
    const url = String(body?.url || '').trim()

    // Only our own storage. Without this the field is a way to make the
    // business number send an arbitrary URL to a customer, which is a
    // worse hole than it first looks: it is our brand on the message.
    if (!/^https:\/\/(firebasestorage\.googleapis\.com|storage\.googleapis\.com|app\.weddingtales\.co\.il)\//.test(url)) {
        return NextResponse.json({ ok: false, error: 'קישור לא מוכר — העלה דרך המסך' }, { status: 400 })
    }

    // Re-run the same validation the browser ran. Not distrust of the UI
    // so much as the fact that the UI is one caller of this route and
    // the size limit is a WhatsApp limit, not a form limit.
    const size = Number(body?.bytes) || 0
    if (size) {
        const check = validateUpload({ kind, type: body?.type, size })
        if (!check.ok) return NextResponse.json({ ok: false, error: check.reason }, { status: 400 })
    }

    // `when` is the only field the model treats as an instruction, so an
    // empty one means an asset that either never gets sent or gets sent
    // to the wrong person. Better to refuse than to store a dud.
    const when = String(body?.when || '').trim()
    if (when.length < 5) {
        return NextResponse.json({ ok: false, error: 'צריך להסביר מתי לשלוח את זה' }, { status: 400 })
    }

    const existing = (await listMedia({ fresh: true })).map(m => m.key)
    const key = String(body?.key || '').trim() || keyFrom(body?.label, [...existing, ...Object.keys(MEDIA)])

    await saveMedia({
        key,
        kind,
        url,
        when,
        label: body?.label,
        caption: String(body?.caption || '').trim() || String(body?.label || '').trim(),
        bytes: size,
        disabled: !!body?.disabled,
    })

    return NextResponse.json({ ok: true, key })
}

export async function DELETE(req) {
    if (!(await authorized(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const key = new URL(req.url).searchParams.get('key')
    if (!key) return NextResponse.json({ error: 'missing key' }, { status: 400 })
    // Built-ins live in code and cannot be removed from here. Saying so
    // beats a silent no-op that leaves the row on screen.
    if (Object.prototype.hasOwnProperty.call(MEDIA, key)) {
        return NextResponse.json({ ok: false, error: 'תמונה מובנית, לא נמחקת מכאן' }, { status: 400 })
    }
    await deleteMedia(key)
    return NextResponse.json({ ok: true })
}
