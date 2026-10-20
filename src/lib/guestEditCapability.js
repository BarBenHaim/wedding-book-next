// The raw capability stays on the submitting device. Only its SHA-256
// commitment is stored in the publicly readable entry. Bind it to both IDs
// so copying an entry (including its hash) does not copy edit permission.
export function createGuestEditToken() {
    const bytes = new Uint8Array(32)
    globalThis.crypto.getRandomValues(bytes)
    return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
}

export function guestEditMessage(weddingId, entryId, token) {
    return JSON.stringify(['guest-entry-edit-v1', weddingId, entryId, token])
}

export function isGuestEditToken(token) {
    return typeof token === 'string' && /^[a-f0-9]{64}$/.test(token)
}

export async function hashGuestEditToken(weddingId, entryId, token) {
    if (!isGuestEditToken(token)) throw new Error('Invalid guest edit token')
    const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(guestEditMessage(weddingId, entryId, token)))
    return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('')
}
