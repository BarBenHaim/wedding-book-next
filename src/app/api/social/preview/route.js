// GET /api/social/preview?i=0
//
// One test render, on demand.
//
// The obvious shape for this route was "generate all four and return
// them". It cannot be. A single gpt-image-1 call takes somewhere between
// twenty seconds and a minute, and a serverless function that tries to
// make four of them in one invocation hits the platform timeout and
// returns nothing — not three images and an error, nothing. So the route
// renders exactly one image per call and the page asks four times. Each
// invocation is comfortably inside the limit, a failure costs one tile
// rather than the whole batch, and the first picture appears while the
// rest are still working.
//
// Failures come back as HTTP 200 with `ok: false`, which looks wrong and
// is deliberate. A non-2xx from a serverless function can be replaced by
// the platform's own gateway page, and when that happened the screen
// showed "HTTP 502" while the real answer - a portfolio photo that did
// not exist - was in a body nobody ever saw. The client already keys off
// `ok`, and an error a human can read beats a correct status code.
//
// What comes back is a data URL rather than a stored file. These are
// throwaway renders whose only job is to answer one question — can this
// model write Hebrew — and writing them to storage would mean a bucket
// full of experiments nobody deletes. Once the answer is yes, the real
// pipeline stores properly.

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const fetchCache = 'force-no-store'
export const maxDuration = 120

import { NextResponse } from 'next/server'
import { adminAuth } from '@/lib/firebaseAdmin'
import { isSuperAdmin } from '@/lib/superAdmin'
import { testBatch } from '@/lib/social/imagePrompt'
import { isoInIsrael } from '@/lib/salesAgent/leadsView'
import { costOfImageUsage, formatUsd } from '@/lib/salesAgent/pricing'
import { recordSpend } from '@/lib/salesAgent/leads'

async function authorized(req) {
    const header = req.headers.get('authorization') || ''
    const shared = process.env.SALES_AGENT_SECRET
    if (shared && (req.headers.get('x-wt-secret') || '') === shared) return true
    if (header.startsWith('Bearer ')) {
        try {
            const decoded = await adminAuth.verifyIdToken(header.slice(7).trim())
            if (isSuperAdmin(decoded.email)) return true
        } catch {
            /* fall through */
        }
    }
    return false
}

// The two OpenAI endpoints differ enough that sharing a code path would
// cost more than it saves: one takes JSON, the other multipart with the
// source photograph attached.
async function generate(spec, key, signal) {
    const res = await fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: spec.model,
            prompt: spec.prompt,
            size: spec.apiSize,
            quality: 'medium',
            n: 1,
        }),
        signal,
    })
    return res
}

async function edit(spec, key, signal) {
    const urls = spec.sourceImages?.length ? spec.sourceImages : [spec.sourceImage].filter(Boolean)
    if (!urls.length) throw new Error('אין תמונת מקור לעריכה')

    const form = new FormData()
    form.append('model', spec.model)
    form.append('prompt', spec.prompt)
    form.append('size', spec.apiSize)
    form.append('quality', 'medium')
    form.append('n', '1')

    // Several sources, not one. A reference brief sends the brand's own
    // posters so the model can see the house style instead of reading a
    // description of it; an ordinary edit sends the single photograph it
    // is working on. The field name is the same either way.
    for (let i = 0; i < urls.length; i++) {
        // The source has to travel as bytes; the API will not fetch a URL.
        const src = await fetch(urls[i], { signal })
        // Names the file. "source-image-404" sends you looking at OpenAI;
        // the URL sends you to the actual missing photo, which is where
        // the bug was the one time this fired.
        if (!src.ok) throw new Error(`התמונה לא נמצאה (${src.status}): ${urls[i]}`)
        const bytes = await src.arrayBuffer()
        form.append('image[]', new Blob([bytes], { type: 'image/jpeg' }), `source-${i + 1}.jpg`)
    }

    return fetch('https://api.openai.com/v1/images/edits', {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}` },
        body: form,
        signal,
    })
}

export async function GET(req) {
    if (!(await authorized(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const key = process.env.OPENAI_API_KEY
    if (!key) {
        // Named explicitly rather than swallowed into a generic 500: this
        // is the one failure whose fix is a person adding an env var, and
        // an unhelpful error here costs an afternoon of debugging.
        return NextResponse.json({ ok: false, error: 'missing-openai-key' }, { status: 503 })
    }

    const url = new URL(req.url)
    const i = Number(url.searchParams.get('i') || 0)
    const batch = testBatch(url.searchParams.get('date') || isoInIsrael())
    const spec = batch[i]
    if (!spec) return NextResponse.json({ ok: false, error: 'bad-index' }, { status: 400 })

    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 110_000)
    try {
        // Both 'edit' and 'reference' post source images; only a bare
        // 'generate' has nothing to send.
        const res = spec.sourceImages?.length || spec.sourceImage
            ? await edit(spec, key, ctrl.signal)
            : await generate(spec, key, ctrl.signal)

        const body = await res.json().catch(() => ({}))
        if (!res.ok) {
            const detail = body?.error?.message || `HTTP ${res.status}`
            console.error('[social/preview] openai failed', detail)
            return NextResponse.json({ ok: false, error: 'openai-failed', detail })
        }
        const b64 = body?.data?.[0]?.b64_json
        if (!b64) return NextResponse.json({ ok: false, error: 'no-image' })

        // Images are the expensive half of this system by an order of
        // magnitude, so the cost is recorded and returned with the
        // picture. Seeing the price beside the render is what stops
        // "generate a few more" from becoming a surprise on the invoice.
        const { usd, known } = costOfImageUsage(body?.usage, spec.model)
        await recordSpend({ provider: 'openai', model: spec.model, usd, usage: body?.usage, images: 1 })

        return NextResponse.json({
            ok: true,
            index: i,
            mode: spec.mode,
            size: spec.size,
            angleId: spec.angleId,
            eventType: spec.eventType,
            text: spec.text,
            textRejected: spec.textRejected,
            sourceImage: spec.sourceImage,
            sourceImages: spec.sourceImages,
            prompt: spec.prompt,
            costUsd: usd,
            costLabel: known ? formatUsd(usd) : null,
            dataUrl: `data:image/png;base64,${b64}`,
        })
    } catch (err) {
        const reason = err?.name === 'AbortError' ? 'timeout' : String(err?.message || err)
        console.error('[social/preview] failed', reason)
        return NextResponse.json({ ok: false, error: reason })
    } finally {
        clearTimeout(timer)
    }
}
