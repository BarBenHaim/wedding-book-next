'use client'

// src/lib/afterSignIn.js
//
// What happens once Firebase says "signed in" — shared by every way in
// (email + password, Google, a freshly chosen password on /set-password):
//
//   1. hand the ID token to /api/login so the server-side `session`
//      cookie exists;
//   2. stamp or clear the 7-day "remember me" expiry;
//   3. the super-admin goes to /admin, whether or not he owns an event;
//   4. everybody else: find the person's events by ownerId and say where
//      to go:
//        one event   → its portal
//        several     → /my (the events hub)
//        none        → a legacy doc keyed by uid, if there is one;
//                      otherwise { path: null } — the caller explains
//                      and signs out, instead of the old behaviour of
//                      landing on the portal of an event that does not
//                      exist.

import { getIdToken, signOut } from 'firebase/auth'
import { collection, query, where, getDocs, limit, doc, getDoc } from 'firebase/firestore'
import { auth, db } from './firebaseClient'
import { setExpiryWeek, clearExpiry } from './sessionExpiry'
import { superAdminHomeFor } from './superAdmin'

export async function afterSignIn(user, { rememberMe = true } = {}) {
    const token = await getIdToken(user, true)
    await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
    })
    if (rememberMe) setExpiryWeek()
    else clearExpiry()

    // The super-admin runs the system and usually owns no event. Without
    // this he hit the "no book for this email" branch below and was signed
    // straight out again — it looked as if his account did not exist.
    const adminHome = superAdminHomeFor(user.email)
    if (adminHome) return { path: adminHome }

    const snap = await getDocs(query(collection(db, 'weddings'), where('ownerId', '==', user.uid), limit(2)))
    if (snap.size > 1) return { path: '/my' }
    let weddingId = snap.empty ? null : snap.docs[0].id
    if (!weddingId) {
        // Very old accounts: the wedding doc id IS the uid.
        const legacy = await getDoc(doc(db, 'weddings', user.uid)).catch(() => null)
        if (legacy?.exists()) weddingId = user.uid
    }
    if (!weddingId) return { path: null, email: user.email || '' }
    try {
        localStorage.setItem('weddingId', weddingId)
    } catch { /* private mode */ }
    return { path: `/wedding/${weddingId}/portal` }
}

/** Sign out quietly — used when an account turned out to own no event. */
export async function signOutQuietly() {
    try {
        await signOut(auth)
        await fetch('/api/logout', { method: 'POST' }).catch(() => {})
    } catch { /* nothing to undo */ }
}
