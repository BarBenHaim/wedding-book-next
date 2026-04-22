// src/lib/offlineQueue.js
//
// Tiny IndexedDB-backed queue for guest blessings that couldn't be uploaded
// right away (usually because the venue has bad reception).
//
// Why IndexedDB and not localStorage:
//   - We need to store the compressed image Blob. localStorage only holds
//     strings, so we'd need to base64-encode (1.33× size bloat) and every
//     read/write hits the main thread synchronously. IDB stores Blobs
//     natively and is async.
//   - Survives tab close, survives reboot. Exactly what we need for the
//     "guest hit send and walked away" scenario.
//
// Schema (v1):
//   DB: 'wedding-tales-queue'
//   Store: 'entries' keyed by `id` (UUID v4 string)
//   Indexes: 'weddingId', 'status'
//
// Record shape:
//   {
//     id: string (UUID)          — also the Firestore doc id, for idempotency
//     weddingId: string
//     name: string
//     text: string
//     image: Blob | null         — already compressed by imageCompress
//     createdAt: number (ms)
//     attempts: number
//     lastError: string | null
//     status: 'pending' | 'uploading' | 'done' | 'failed'
//   }

const DB_NAME = 'wedding-tales-queue'
const DB_VERSION = 1
const STORE = 'entries'

let _dbPromise = null

function openDB() {
    if (typeof indexedDB === 'undefined') {
        return Promise.reject(new Error('IndexedDB unavailable'))
    }
    if (_dbPromise) return _dbPromise
    _dbPromise = new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION)
        req.onupgradeneeded = () => {
            const db = req.result
            if (!db.objectStoreNames.contains(STORE)) {
                const store = db.createObjectStore(STORE, { keyPath: 'id' })
                store.createIndex('weddingId', 'weddingId', { unique: false })
                store.createIndex('status', 'status', { unique: false })
            }
        }
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
    })
    return _dbPromise
}

function txStore(mode) {
    return openDB().then(db => {
        const tx = db.transaction(STORE, mode)
        return { store: tx.objectStore(STORE), tx }
    })
}

function txDone(tx) {
    return new Promise((resolve, reject) => {
        tx.oncomplete = () => resolve()
        tx.onabort = () => reject(tx.error)
        tx.onerror = () => reject(tx.error)
    })
}

function reqPromise(req) {
    return new Promise((resolve, reject) => {
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
    })
}

// ─── Public API ──────────────────────────────────────────────────────────────

export function genId() {
    // crypto.randomUUID is widely available on modern browsers/PWAs.
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
    // Fallback: timestamp + random (not a real UUID but unique enough).
    return `e${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

/** Adds a new entry to the queue. `id` is optional; generated if omitted. */
export async function enqueue({ id, weddingId, name, text, image }) {
    const record = {
        id: id || genId(),
        weddingId,
        name: name || '',
        text: text || '',
        image: image || null,
        createdAt: Date.now(),
        attempts: 0,
        lastError: null,
        status: 'pending',
    }
    const { store, tx } = await txStore('readwrite')
    store.put(record)
    await txDone(tx)
    return record
}

/** Retrieves a single entry by id. */
export async function getEntry(id) {
    const { store } = await txStore('readonly')
    return reqPromise(store.get(id))
}

/** Lists all entries, optionally filtered by weddingId. */
export async function listEntries(weddingId) {
    const { store } = await txStore('readonly')
    if (weddingId) {
        const idx = store.index('weddingId')
        return reqPromise(idx.getAll(weddingId))
    }
    return reqPromise(store.getAll())
}

/** Lists only pending/failed entries (things that still need to go out). */
export async function listUnsent(weddingId) {
    const all = await listEntries(weddingId)
    return all.filter(e => e.status !== 'done')
}

/** Patches an entry. Silently no-ops if the record is gone. */
export async function updateEntry(id, patch) {
    const { store, tx } = await txStore('readwrite')
    const existing = await reqPromise(store.get(id))
    if (!existing) {
        await txDone(tx)
        return null
    }
    const next = { ...existing, ...patch }
    store.put(next)
    await txDone(tx)
    return next
}

/** Removes an entry entirely. */
export async function removeEntry(id) {
    const { store, tx } = await txStore('readwrite')
    store.delete(id)
    await txDone(tx)
}

/** Count pending entries for a wedding (handy for UI badges). */
export async function countUnsent(weddingId) {
    const items = await listUnsent(weddingId)
    return items.length
}
