// POST /api/upload/event-image   (multipart: weddingId, filename, file)
//
// Puts a picture into an event's folder in Storage on the browser's
// behalf, and answers with its address.
//
// Why it exists: the management screens upload straight from the browser
// to Firebase Storage. On a computer that cannot talk to that host (see
// lib/storageReach.js) the upload never finishes — the SDK retries for
// ten minutes and the spinner just turns. The page itself came from our
// domain, so our domain can carry the file instead.
//
// It grants nothing storage.rules does not already grant, and less: the
// rules let anyone create an image under weddings/{id}/; this route also
// wants a signed-in user, a real decodable image, and an event that
// exists. Like the rules, it never writes over an existing file.

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const fetchCache = 'force-no-store'
export const maxDuration = 60

import { NextResponse } from 'next/server'
import crypto from 'crypto'
import sharp from 'sharp'
import { adminDb, adminAuth, adminStorage } from '@/lib/firebaseAdmin'
import { uploadProblem, eventImagePath, downloadUrl } from '@/lib/eventImageRules'

const bad = (status, error) => NextResponse.json({ ok: false, error }, { status })

async function signedIn(req) {
    const header = req.headers.get('authorization') || ''
    if (!header.startsWith('Bearer ')) return false
    try {
        await adminAuth.verifyIdToken(header.slice(7).trim())
        return true
    } catch {
        return false
    }
}

export async function POST(req) {
    if (!(await signedIn(req))) return bad(401, 'unauthorized')

    let form
    try {
        form = await req.formData()
    } catch {
        return bad(400, 'bad-form')
    }
    const weddingId = String(form.get('weddingId') || '').trim()
    const filename = String(form.get('filename') || '').trim()
    const file = form.get('file')
    if (!file || typeof file.arrayBuffer !== 'function') return bad(400, 'no-file')

    const problem = uploadProblem({ weddingId, filename, size: file.size, type: file.type })
    if (problem) return bad(problem === 'too-large' ? 413 : 400, problem)

    try {
        const buffer = Buffer.from(await file.arrayBuffer())

        // The declared type is the sender's word; make sure it really is a
        // picture before it goes into somebody's book.
        let meta
        try {
            meta = await sharp(buffer).metadata()
        } catch {
            return bad(400, 'not-an-image')
        }
        if (!(meta?.width > 0 && meta?.height > 0)) return bad(400, 'not-an-image')

        const wedding = await adminDb.collection('weddings').doc(weddingId).get()
        if (!wedding.exists) return bad(404, 'no-such-event')

        const path = eventImagePath(weddingId, filename)
        const bucket = adminStorage.bucket()
        const object = bucket.file(path)
        const [exists] = await object.exists()
        if (exists) return bad(409, 'exists')

        const token = crypto.randomUUID()
        const contentType = file.type
        await object.save(buffer, {
            resumable: false,
            contentType,
            metadata: { contentType, metadata: { firebaseStorageDownloadTokens: token } },
        })

        return NextResponse.json({
            ok: true,
            url: downloadUrl(bucket.name, path, token),
            imgAspect: Math.round((meta.width / meta.height) * 1000) / 1000,
        })
    } catch (err) {
        console.error('[upload/event-image] failed', err)
        return bad(502, 'upload-failed')
    }
}
