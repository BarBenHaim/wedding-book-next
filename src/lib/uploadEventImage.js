'use client'

// src/lib/uploadEventImage.js
//
// Upload a picture into an event's folder and get its address back.
//
// First choice is what the screens always did: straight from the browser
// to Firebase Storage. But a browser that cannot reach that host never
// gets an error from the SDK — it retries quietly for ten minutes, and
// the person sees a spinner and nothing else (Lord, 11.11.2026: "I press
// replace photo, it loads for a long time and nothing happens"). So the
// direct upload is watched: if it fails, or makes no progress for a few
// seconds, it is cancelled and the same file goes through our own
// domain (api/upload/event-image) instead. When we already know storage
// is out of reach (lib/storageReach.js), we do not wait at all.

import { ref as storageRef, uploadBytesResumable, getDownloadURL } from 'firebase/storage'
import { getIdToken } from 'firebase/auth'
import imageCompression from 'browser-image-compression'
import { storage, auth } from './firebaseClient'
import { isStorageBlocked } from './storageReach'
import { MAX_SERVER_UPLOAD_BYTES, eventImagePath } from './eventImageRules'

// No byte moved for this long → the direct road is not working.
export const STALL_MS = 12000

// Once one upload had to go through us, the rest of this page load does
// too — no reason to make the person wait out the stall every time.
let uploadsThroughUs = false

function direct(path, blob, contentType) {
    return new Promise((resolve, reject) => {
        const task = uploadBytesResumable(storageRef(storage, path), blob, { contentType })
        let moved = -1
        let timer = null
        const arm = () => {
            clearTimeout(timer)
            timer = setTimeout(() => {
                task.cancel()
                reject(Object.assign(new Error('storage-stalled'), { code: 'storage-stalled' }))
            }, STALL_MS)
        }
        arm()
        task.on(
            'state_changed',
            snap => {
                if (snap.bytesTransferred > moved) {
                    moved = snap.bytesTransferred
                    arm()
                }
            },
            err => {
                clearTimeout(timer)
                reject(err)
            },
            async () => {
                clearTimeout(timer)
                try {
                    resolve(await getDownloadURL(task.snapshot.ref))
                } catch (err) {
                    reject(err)
                }
            },
        )
    })
}

async function throughOurDomain({ weddingId, filename, blob, contentType }) {
    let body = blob
    if (body.size > MAX_SERVER_UPLOAD_BYTES) {
        body = await imageCompression(body, { maxSizeMB: 3.5, maxWidthOrHeight: 3000, useWebWorker: true })
        if (body.size > MAX_SERVER_UPLOAD_BYTES) throw new Error('too-large')
    }
    const user = auth.currentUser
    if (!user) throw new Error('not-signed-in')
    const form = new FormData()
    form.append('weddingId', weddingId)
    form.append('filename', filename)
    form.append('file', new File([body], filename, { type: body.type || contentType }))
    const res = await fetch('/api/upload/event-image', {
        method: 'POST',
        headers: { Authorization: `Bearer ${await getIdToken(user)}` },
        body: form,
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok || !data?.url) throw new Error(data?.error || `upload-failed-${res.status}`)
    return data.url
}

/**
 * @param {string} weddingId
 * @param {string} filename     a NEW name inside the event's folder, e.g. `photo-1700000000000.jpg`
 * @param {Blob}   blob
 * @param {string} [contentType]
 * @returns {Promise<string>}   the picture's address
 */
export async function uploadEventImage({ weddingId, filename, blob, contentType }) {
    const type = contentType || blob.type || 'image/jpeg'
    const path = eventImagePath(weddingId, filename)
    if (!path) throw new Error('bad-upload-target')

    if (!uploadsThroughUs && !isStorageBlocked()) {
        try {
            return await direct(path, blob, type)
        } catch (err) {
            // A refusal by the rules is an answer, not a network problem.
            if (err?.code === 'storage/unauthorized') throw err
            console.warn('[uploadEventImage] direct upload did not go through, using our own domain:', err?.code || err?.message)
            uploadsThroughUs = true
        }
    }
    return throughOurDomain({ weddingId, filename, blob, contentType: type })
}
