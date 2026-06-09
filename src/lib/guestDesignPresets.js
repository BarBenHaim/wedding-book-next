'use client'

// Client helpers for the saved guest-page design presets. All ops go
// through /api/admin/guest-presets (Admin SDK, super-admin gated) so no
// Firestore-rules changes are needed. Mirrors the book's studioPresets
// pattern, but the guest design is a flat object so there's no font/
// frame registry to resolve.
import { auth } from '@/lib/firebaseClient'

async function call(op, payload = {}) {
    const user = auth.currentUser
    if (!user) throw new Error('יש להתחבר')
    const token = await user.getIdToken(false)
    const res = await fetch('/api/admin/guest-presets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ op, ...payload }),
    })
    if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || `guest-presets ${op} failed (${res.status})`)
    }
    return res.json()
}

export async function listGuestPresets() {
    try {
        const { presets } = await call('list')
        return Array.isArray(presets) ? presets : []
    } catch (err) {
        console.warn('[guestDesignPresets] list failed:', err?.message || err)
        return []
    }
}

export async function saveGuestPreset(preset) {
    const { preset: saved } = await call('save', { preset })
    return saved
}

export async function deleteGuestPreset(id) {
    await call('delete', { id })
    return true
}
