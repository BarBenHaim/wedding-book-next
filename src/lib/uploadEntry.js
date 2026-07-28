// src/lib/uploadEntry.js
//
// Takes a queued entry record (see offlineQueue.js) and actually ships it
// to Firebase — Storage first (if there's an image), then an idempotent
// Firestore write keyed by the entry's UUID.
//
// Resilience features baked in:
//   1. Resumable uploads (uploadBytesResumable) — if the socket dies mid-
//      upload, Firebase will resume from the last chunk instead of starting
//      from zero. Huge win on flaky cellular.
//   2. Retry with exponential backoff — transient errors (net::ERR_*,
//      HTTP 5xx, timeouts) auto-retry 3 times before surfacing.
//   3. Idempotency — we use setDoc(doc(..., entry.id)), so a retry after
//      a successful Firestore write is a no-op instead of a duplicate.
//   4. Skip-rewrite — if imageUrl is already persisted on the queue record,
//      we don't re-upload the image. That way a retry after Storage-OK /
//      Firestore-fail only redoes the Firestore write.

import { db, storage } from './firebaseClient'
import { doc, setDoc, serverTimestamp, getDoc } from 'firebase/firestore'
import { ref as storageRef, uploadBytesResumable, getDownloadURL } from 'firebase/storage'
import { updateEntry } from './offlineQueue'

const MAX_ATTEMPTS = 4
const BASE_BACKOFF_MS = 1500 // 1.5s → 3s → 6s → 12s

/**
 * Ships a single queued entry to Firebase. Returns `true` on success.
 * Throws only if it's clearly not coming back (e.g. permission error).
 * Transient failures bubble as thrown Errors so the caller can decide to
 * try again later.
 */
export async function uploadQueuedEntry(entry) {
    if (!entry || entry.status === 'done') return true

    await updateEntry(entry.id, { status: 'uploading', attempts: (entry.attempts || 0) + 1 })

    try {
        // ─── 1. Image upload (if needed) ─────────────────────────────────
        let imageUrl = entry.imageUrl || null
        if (entry.image && !imageUrl) {
            imageUrl = await uploadImageWithRetry(entry.weddingId, entry.id, entry.image)
            // Persist the URL immediately so subsequent retries skip re-upload.
            await updateEntry(entry.id, { imageUrl })
        }

        // ─── 2. Firestore write (idempotent) ─────────────────────────────
        const docRef = doc(db, 'weddings', entry.weddingId, 'entries', entry.id)
        // If the doc already exists (previous attempt wrote it but we never
        // got confirmation back), leave it. Otherwise create it.
        const existing = await getDoc(docRef).catch(() => null)
        if (!existing || !existing.exists()) {
            await setDoc(docRef, {
                name: entry.name || '', // no anonymous fallback — empty stays empty
                text: entry.text || null,
                imageUrl: imageUrl || null,
                timestamp: serverTimestamp(),
                orderIndex: null,
            })
        }

        await updateEntry(entry.id, { status: 'done', lastError: null })

        // Owner push notification — fire-and-forget; a failure here must
        // never affect the guest's upload.
        try {
            fetch('/api/notify-blessing', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ weddingId: entry.weddingId, name: entry.name || '' }),
            }).catch(() => {})
        } catch { /* noop */ }

        return true
    } catch (err) {
        const msg = err?.message || String(err)
        await updateEntry(entry.id, { status: 'pending', lastError: msg })
        throw err
    }
}

async function uploadImageWithRetry(weddingId, entryId, blob) {
    let attempt = 0
    let lastErr = null
    while (attempt < MAX_ATTEMPTS) {
        try {
            return await uploadImageOnce(weddingId, entryId, blob)
        } catch (err) {
            lastErr = err
            attempt++
            if (attempt >= MAX_ATTEMPTS) break
            // Exponential backoff, capped.
            const delay = Math.min(BASE_BACKOFF_MS * Math.pow(2, attempt - 1), 20000)
            await sleep(delay)
        }
    }
    throw lastErr || new Error('upload failed')
}

function uploadImageOnce(weddingId, entryId, blob) {
    const filename = `${entryId}.jpg`
    const ref = storageRef(storage, `weddings/${weddingId}/${filename}`)
    const task = uploadBytesResumable(ref, blob, {
        contentType: blob.type || 'image/jpeg',
    })
    return new Promise((resolve, reject) => {
        task.on(
            'state_changed',
            null,
            err => reject(err),
            async () => {
                try {
                    const url = await getDownloadURL(task.snapshot.ref)
                    resolve(url)
                } catch (err) {
                    reject(err)
                }
            }
        )
    })
}

function sleep(ms) {
    return new Promise(r => setTimeout(r, ms))
}

// ─── Queue flusher ───────────────────────────────────────────────────────────
//
// Tries to send every pending entry for a given wedding. Resolves with
// a summary ({sent, stillPending, failed}). Does NOT throw on individual
// failures — surfacing the aggregate state is the caller's job.
//
// There's a tiny in-flight guard so accidental double-calls (e.g. multiple
// listeners firing online/pageshow back-to-back) don't step on each other.

let _flushInFlight = null

export async function flushQueue(weddingId, { onProgress } = {}) {
    if (_flushInFlight) return _flushInFlight
    _flushInFlight = (async () => {
        const { listUnsent } = await import('./offlineQueue')
        const pending = await listUnsent(weddingId)
        let sent = 0
        let failed = 0
        for (const entry of pending) {
            try {
                await uploadQueuedEntry(entry)
                sent++
                onProgress?.({ sent, total: pending.length })
            } catch {
                failed++
            }
        }
        return {
            total: pending.length,
            sent,
            stillPending: pending.length - sent,
            failed,
        }
    })()
    try {
        return await _flushInFlight
    } finally {
        _flushInFlight = null
    }
}
