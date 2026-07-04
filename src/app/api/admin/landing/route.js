export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const fetchCache = 'force-no-store'

// POST /api/admin/landing — super-admin management of the marketing
// landing page (/landing).
//
// Ops:
//   { op: 'get' }        → { config }   — the saved landing config (or null)
//   { op: 'save', config } → validates + writes `site_config/landing`,
//                            then revalidates /landing so the change is
//                            live IMMEDIATELY (no 5-minute ISR wait).
//   { op: 'revalidate' } → just revalidates /landing — the "refresh"
//                            button after changing presets/designs on
//                            the showcased projects.
//
// Config shape (all optional — the landing falls back to its built-in
// defaults for anything missing):
//   {
//     demoWeddingId: string,   // wedding that drives the live demo
//     chapters: [{             // the showcased projects, in order
//       weddingId, token,      // live-book embed (token from /api/digital-edition/grant)
//       slug,                  // built-in image set ('wedding'|'bar-mitzvah'|'birthday') — fallback for images
//       chapter, n, badge, title, date, story, quote, quoteBy,
//       stats: string[],       // up to 4 short facts
//       spreads: number,       // how many spread-N.webp images the slug set has
//       theme,                 // 'ivory' | 'ink' | 'blush' — section art direction
//       coverUrl,              // optional explicit cover image (overrides slug set)
//       spreadUrls: string[],  // optional explicit spread images (override slug set)
//     }]
//   }

import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { adminDb, adminAuth } from '@/lib/firebaseAdmin'
import { isSuperAdmin } from '@/lib/superAdmin'

const DOC_PATH = ['site_config', 'landing']
const THEMES = new Set(['ivory', 'ink', 'blush'])

async function verifySuperAdmin(req) {
    const authHeader = req.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) return null
    try {
        const decoded = await adminAuth.verifyIdToken(authHeader.split('Bearer ')[1])
        if (!isSuperAdmin(decoded.email)) return null
        return decoded
    } catch {
        return null
    }
}

const str = (v, max = 400) => (typeof v === 'string' ? v.slice(0, max) : '')
const strArr = (v, maxItems, maxLen = 500) =>
    Array.isArray(v) ? v.filter(x => typeof x === 'string' && x.trim()).slice(0, maxItems).map(x => x.slice(0, maxLen)) : []

function sanitizeChapter(raw) {
    if (!raw || typeof raw !== 'object') return null
    const c = {
        weddingId: str(raw.weddingId, 80).trim(),
        token: str(raw.token, 80).trim(),
        slug: str(raw.slug, 40).trim() || 'wedding',
        chapter: str(raw.chapter, 40),
        n: str(raw.n, 4),
        badge: str(raw.badge, 60),
        title: str(raw.title, 80),
        date: str(raw.date, 60),
        story: str(raw.story, 600),
        quote: str(raw.quote, 300),
        quoteBy: str(raw.quoteBy, 120),
        stats: strArr(raw.stats, 4, 80),
        spreads: Math.max(0, Math.min(12, Number(raw.spreads) || 0)),
        theme: THEMES.has(raw.theme) ? raw.theme : 'ivory',
        coverUrl: str(raw.coverUrl, 1000).trim(),
        spreadUrls: strArr(raw.spreadUrls, 12, 1000),
    }
    // A chapter must at least have a title to render meaningfully.
    if (!c.title) return null
    return c
}

export async function POST(req) {
    const admin = await verifySuperAdmin(req)
    if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    let body
    try {
        body = await req.json()
    } catch {
        return NextResponse.json({ error: 'Bad JSON' }, { status: 400 })
    }
    const op = body?.op

    try {
        if (op === 'get') {
            const snap = await adminDb.collection(DOC_PATH[0]).doc(DOC_PATH[1]).get()
            return NextResponse.json({ config: snap.exists ? snap.data() : null })
        }

        if (op === 'save') {
            const raw = body.config || {}
            const chapters = (Array.isArray(raw.chapters) ? raw.chapters : [])
                .map(sanitizeChapter)
                .filter(Boolean)
                .slice(0, 6)
            const config = {
                demoWeddingId: str(raw.demoWeddingId, 80).trim() || null,
                chapters,
                updatedAt: new Date().toISOString(),
                updatedBy: admin.email || admin.uid,
            }
            await adminDb.collection(DOC_PATH[0]).doc(DOC_PATH[1]).set(config, { merge: false })
            // Make it live now — same as the standalone refresh button.
            revalidatePath('/landing')
            return NextResponse.json({ ok: true, config })
        }

        if (op === 'revalidate') {
            revalidatePath('/landing')
            return NextResponse.json({ ok: true, revalidatedAt: new Date().toISOString() })
        }

        return NextResponse.json({ error: `Unknown op: ${op}` }, { status: 400 })
    } catch (err) {
        console.error('[admin/landing] error:', err)
        return NextResponse.json({ error: err?.message || 'Internal error' }, { status: 500 })
    }
}
