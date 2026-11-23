// POST /api/owner/event-look/render   { weddingId, option, photoUrl }
//
// Draws ONE cover or ONE sign from the owner's photo with the image model, stores it in the event's own folder,
// and answers with its address. One image per call, on purpose (see api/social/preview): a call takes from twenty
// seconds to a minute, so the studio asks once per design, shows each as it arrives, and a failure costs one tile.
//
// Who may call: the owner of the event, or a super admin (authorizeWeddingAccess). The photo must be one the
// owner just uploaded into this event's folder in our own bucket (validPhotoUrl), so this route cannot be made
// to fetch anything else. Each event has a ceiling on how many images it can ask for (LOOK_LIMIT_PER_EVENT),
// counted before the call and given back if the call fails, because every image costs money.
//
// The photo of a customer goes to OpenAI here. The studio asks the owner for an explicit yes before it calls.
// It changes nothing about the event itself: choosing a design is a separate step in the browser.
//
// Failures that are not about who is asking come back as HTTP 200 with ok:false, for the reason given in
// api/social/preview: a gateway can replace a non-2xx body, and the person then sees "HTTP 502" instead of why.

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const fetchCache = 'force-no-store'
export const maxDuration = 120

import { NextResponse } from 'next/server'
import crypto from 'crypto'
import sharp from 'sharp'
import { FieldValue } from 'firebase-admin/firestore'
import { adminDb, adminStorage } from '@/lib/firebaseAdmin'
import { authorizeWeddingAccess } from '@/app/api/guests/_auth'
import { lookNames } from '@/lib/ownerLook'
import { defaultCoverKey } from '@/lib/defaultCovers'
import { downloadUrl } from '@/lib/eventImageRules'
import { lookOption, buildLookPrompt, styleRefs, validPhotoUrl, renderAllowed, API_SIZE, OUTPUT_EDGE } from '@/lib/ownerLookAi'

const IMAGE_MODEL = process.env.OPENAI_IMAGE_MODEL || 'gpt-image-2'
const MAX_PHOTO_BYTES = 12 * 1024 * 1024

const fail = (error, detail) => NextResponse.json({ ok: false, error, ...(detail ? { detail } : {}) })

async function bytesOf(url, signal) {
    const res = await fetch(url, { signal })
    if (!res.ok) throw new Error(`fetch ${res.status}: ${url.split('?')[0]}`)
    const buf = Buffer.from(await res.arrayBuffer())
    if (buf.length > MAX_PHOTO_BYTES) throw new Error('too-large')
    return buf
}

export async function POST(req) {
    let body
    try {
        body = await req.json()
    } catch {
        return NextResponse.json({ ok: false, error: 'bad-json' }, { status: 400 })
    }
    const weddingId = typeof body?.weddingId === 'string' ? body.weddingId : ''
    const auth = await authorizeWeddingAccess(req, weddingId)
    if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status })

    const key = process.env.OPENAI_API_KEY
    if (!key) return NextResponse.json({ ok: false, error: 'missing-openai-key' }, { status: 503 })

    const option = lookOption(body?.option)
    if (!option) return NextResponse.json({ ok: false, error: 'bad-option' }, { status: 400 })

    const bucket = adminStorage.bucket()
    if (!validPhotoUrl(body?.photoUrl, bucket.name, weddingId)) return NextResponse.json({ ok: false, error: 'bad-photo' }, { status: 400 })

    // the ceiling: counted now, given back below if the image does not come out
    const ref = auth.weddingRef
    const allowed = await adminDb.runTransaction(async tx => {
        const snap = await tx.get(ref)
        const used = snap.data()?.lookRenders
        if (!renderAllowed(used)) return false
        tx.update(ref, { lookRenders: FieldValue.increment(1) })
        return true
    })
    if (!allowed) return fail('limit')
    const giveBack = () => ref.update({ lookRenders: FieldValue.increment(-1) }).catch(() => {})

    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 105_000)
    try {
        const wedding = auth.wedding
        const prompt = buildLookPrompt({
            option: option.id,
            eventType: wedding.eventType,
            names: lookNames(wedding),
            people: wedding.eventType === 'wedding' ? 'couple' : 'one',
        })

        // the photo first, rounded to a size the model takes comfortably (this also drops the camera's metadata)
        const photo = await sharp(await bytesOf(body.photoUrl, ctrl.signal))
            .rotate()
            .resize({ width: 1536, height: 1536, fit: 'inside', withoutEnlargement: true })
            .jpeg({ quality: 90 })
            .toBuffer()

        const origin = new URL(req.url).origin
        const refPaths = styleRefs(option.id, wedding.eventType, defaultCoverKey(wedding.eventType))
        const form = new FormData()
        form.append('model', IMAGE_MODEL)
        form.append('prompt', prompt)
        form.append('size', API_SIZE[option.kind])
        form.append('quality', 'medium')
        form.append('n', '1')
        form.append('image[]', new Blob([photo], { type: 'image/jpeg' }), 'person.jpg')
        for (let i = 0; i < refPaths.length; i += 1) {
            const bytes = await bytesOf(`${origin}${refPaths[i]}`, ctrl.signal)
            form.append('image[]', new Blob([bytes], { type: 'image/webp' }), `style-${i + 1}.webp`)
        }

        const res = await fetch('https://api.openai.com/v1/images/edits', {
            method: 'POST',
            headers: { Authorization: `Bearer ${key}` },
            body: form,
            signal: ctrl.signal,
        })
        const out = await res.json().catch(() => ({}))
        if (!res.ok) {
            await giveBack()
            console.error('[owner/event-look] openai failed', out?.error?.message || res.status)
            return fail('openai-failed', out?.error?.message || `HTTP ${res.status}`)
        }
        const b64 = out?.data?.[0]?.b64_json
        if (!b64) {
            await giveBack()
            return fail('no-image')
        }

        // to the size the book needs, as a JPEG
        const edge = OUTPUT_EDGE[option.kind]
        const final = await sharp(Buffer.from(b64, 'base64'))
            .resize({ width: edge, height: option.kind === 'cover' ? edge : Math.round(edge * 1.5), fit: 'cover', kernel: 'lanczos3' })
            .sharpen({ sigma: 0.6 })
            .jpeg({ quality: 90, mozjpeg: true })
            .toBuffer()

        const path = `weddings/${weddingId}/look-${option.id}-${Date.now()}.jpg`
        const token = crypto.randomUUID()
        await bucket.file(path).save(final, {
            resumable: false,
            contentType: 'image/jpeg',
            metadata: { contentType: 'image/jpeg', metadata: { firebaseStorageDownloadTokens: token } },
        })

        return NextResponse.json({ ok: true, option: option.id, kind: option.kind, url: downloadUrl(bucket.name, path, token) })
    } catch (err) {
        await giveBack()
        const reason = err?.name === 'AbortError' ? 'timeout' : String(err?.message || err)
        console.error('[owner/event-look] failed', reason)
        return fail(reason === 'timeout' ? 'timeout' : 'failed', reason === 'timeout' ? undefined : reason)
    } finally {
        clearTimeout(timer)
    }
}
