'use client'

import { getIdToken } from 'firebase/auth'
import { auth } from '@/lib/firebaseClient'

// An admin request with the signed-in user's token. A body makes it a POST
// unless another method is given.
export async function adminApi(url, body, method) {
    const token = await getIdToken(auth.currentUser)
    const res = await fetch(url, {
        method: method || (body ? 'POST' : 'GET'),
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        ...(body ? { body: JSON.stringify(body) } : {}),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
    return data
}
