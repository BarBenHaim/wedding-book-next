// Per-device record of the blessings THIS phone submitted.
//
// Why: a guest who re-scans the QR / re-opens the page should be able to edit
// the blessing + photo they already sent — WITHOUT that replacing their ability
// to add MORE blessings from the same phone. There's no guest auth, so we
// remember "what this device sent" in localStorage, keyed per wedding.
//
// Best-effort by design: private mode, cleared storage, or a different phone
// simply means the edit shortcuts don't appear (adding new always works). We
// never block submission on this. We store only a tiny preview (id + name +
// short text snippet + timestamp) — never the photo blob.

const KEY = 'wt_my_submissions_v1'
const SNIPPET_MAX = 280

function readAll() {
    if (typeof window === 'undefined') return {}
    try {
        const raw = window.localStorage.getItem(KEY)
        const parsed = raw ? JSON.parse(raw) : {}
        return parsed && typeof parsed === 'object' ? parsed : {}
    } catch {
        return {}
    }
}

function writeAll(obj) {
    if (typeof window === 'undefined') return
    try {
        window.localStorage.setItem(KEY, JSON.stringify(obj))
    } catch {
        // Quota / private mode — ignore. Editing shortcuts just won't persist.
    }
}

/** Newest-first list of this device's submissions for a wedding. */
export function getSubmissions(weddingId) {
    if (!weddingId) return []
    const all = readAll()
    const list = Array.isArray(all[weddingId]) ? all[weddingId] : []
    return [...list].filter(e => e && e.id).sort((a, b) => (b.ts || 0) - (a.ts || 0))
}

/** Record (or refresh) a submission this device just sent. */
export function recordSubmission(weddingId, { id, name, text } = {}) {
    if (typeof window === 'undefined' || !weddingId || !id) return
    const all = readAll()
    const list = Array.isArray(all[weddingId]) ? all[weddingId] : []
    const rec = {
        id,
        name: name || '',
        text: (text || '').slice(0, SNIPPET_MAX),
        ts: Date.now(),
    }
    const i = list.findIndex(e => e && e.id === id)
    if (i >= 0) list[i] = { ...list[i], ...rec }
    else list.push(rec)
    all[weddingId] = list
    writeAll(all)
}

/** Keep the cached preview in sync after an edit (no refetch needed). */
export function updateSubmissionMeta(weddingId, id, { name, text } = {}) {
    if (typeof window === 'undefined' || !weddingId || !id) return
    const all = readAll()
    const list = Array.isArray(all[weddingId]) ? all[weddingId] : []
    const i = list.findIndex(e => e && e.id === id)
    if (i < 0) return
    list[i] = {
        ...list[i],
        name: name ?? list[i].name,
        text: (text ?? list[i].text ?? '').slice(0, SNIPPET_MAX),
        ts: Date.now(),
    }
    all[weddingId] = list
    writeAll(all)
}

/** Did THIS device submit this entry? (Used to soft-gate the edit screen.) */
export function ownsSubmission(weddingId, id) {
    return getSubmissions(weddingId).some(e => e.id === id)
}

/** Forget a submission on this device (e.g. the entry was deleted/moderated). */
export function removeSubmission(weddingId, id) {
    if (typeof window === 'undefined' || !weddingId || !id) return
    const all = readAll()
    const list = Array.isArray(all[weddingId]) ? all[weddingId] : []
    const next = list.filter(e => e && e.id !== id)
    if (next.length === list.length) return
    all[weddingId] = next
    writeAll(all)
}
