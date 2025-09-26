import { getIdToken } from 'firebase/auth'
import { auth } from '@/lib/firebaseClient'

export async function fetchEntries(weddingId) {
    const token = await getIdToken(auth.currentUser)
    const res = await fetch(`/api/entries?weddingId=${weddingId}`, {
        headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) throw new Error('Failed to fetch entries')
    return res.json()
}
