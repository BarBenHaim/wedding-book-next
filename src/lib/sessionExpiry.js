'use client'

// src/lib/sessionExpiry.js
//
// Tiny helper module for the "Remember me — 7 days per device"
// behaviour the login page uses. The key is stored in localStorage
// so it persists across browser restarts (matches the
// browserLocalPersistence Auth state). Per-device by virtue of
// localStorage being device-scoped.
//
// Backwards compatibility: existing logged-in users have NO
// EXPIRY_KEY in their localStorage. isSessionExpired() returns
// false when the key is missing, so those sessions stay valid until
// they sign out manually — same as today. The 7-day clock only
// starts ticking for users who tick the new "Remember me" box on
// their next login.

import { signOut } from 'firebase/auth'
import { auth } from './firebaseClient'

export const EXPIRY_KEY = 'auth_session_expires_at'
export const WEEK_MS = 7 * 24 * 60 * 60 * 1000

// Best-effort wrapper around localStorage so SSR or strict-mode
// browsers (private windows on iOS, some embedded webviews) don't
// throw mid-flow.
function safeStorage() {
    try {
        if (typeof window === 'undefined' || !window.localStorage) return null
        return window.localStorage
    } catch {
        return null
    }
}

export function getExpiry() {
    const ls = safeStorage()
    if (!ls) return null
    const raw = ls.getItem(EXPIRY_KEY)
    if (!raw) return null
    const n = Number(raw)
    return Number.isFinite(n) ? n : null
}

export function setExpiryWeek() {
    const ls = safeStorage()
    if (!ls) return
    ls.setItem(EXPIRY_KEY, String(Date.now() + WEEK_MS))
}

export function clearExpiry() {
    const ls = safeStorage()
    if (!ls) return
    ls.removeItem(EXPIRY_KEY)
}

// Returns true ONLY if the expiry timestamp is set AND now is past
// it. Returns false when the key is missing — that's the back-compat
// guarantee: a user without the key was authenticated under the old
// behaviour and we don't retroactively log them out.
export function isSessionExpired() {
    const expires = getExpiry()
    if (expires == null) return false
    return Date.now() > expires
}

// Auth-state guard. Call from onAuthStateChanged before deciding the
// user is "valid". If the session has expired, signs them out (which
// triggers another auth-state callback with `user === null` so the
// existing redirect-to-login path takes over) and clears the key.
// Returns true if the session was expired and we acted on it.
export async function enforceSessionExpiry(user) {
    if (!user) return false
    if (!isSessionExpired()) return false
    try {
        await signOut(auth)
    } catch (err) {
        console.warn('[sessionExpiry] signOut failed:', err?.message || err)
    }
    clearExpiry()
    return true
}
