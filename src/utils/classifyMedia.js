import { db, storage } from '../lib/firebaseConfig'
import { ref as dbRef, push, set } from 'firebase/database'
import { ref as storageRef, uploadString, getDownloadURL } from 'firebase/storage'
import { ref, get } from 'firebase/database'

const weddingId = 'w123' // בהמשך תעשה את זה דינמי

export async function saveEntry(type, content) {
    // If Firebase is not available, save to localStorage as fallback
    if (!db || !storage) {
        console.warn('Firebase not available, saving to localStorage')
        const entry = {
            type,
            content,
            name: type === 'text' ? extractName(content) : 'תמונה מהאורח',
            timestamp: Date.now(),
            id: `local_${Date.now()}`,
        }

        const existingEntries = JSON.parse(localStorage.getItem('weddingEntries') || '[]')
        existingEntries.push(entry)
        localStorage.setItem('weddingEntries', JSON.stringify(existingEntries))
        return
    }

    if (type === 'text') {
        const entryRef = push(dbRef(db, `entries/${weddingId}`))
        await set(entryRef, {
            type: 'text',
            content,
            name: extractName(content),
            timestamp: Date.now(),
        })
    } else if (type === 'photo') {
        const filename = `photo-${Date.now()}.jpg`
        const photoRef = storageRef(storage, `weddings/${weddingId}/${filename}`)

        // התוכן מגיע מ־DataURL
        await uploadString(photoRef, content, 'data_url')
        const downloadURL = await getDownloadURL(photoRef)

        const entryRef = push(dbRef(db, `entries/${weddingId}`))
        await set(entryRef, {
            type: 'photo',
            content: downloadURL,
            name: 'תמונה מהאורח',
            timestamp: Date.now(),
        })
    }
}

function extractName(content) {
    if (!content.includes(':\n')) return ''
    return content.split(':\n')[0].trim()
}

export async function getEntries() {
    // If Firebase is not available, get from localStorage
    if (!db) {
        console.warn('Firebase not available, getting from localStorage')
        const localEntries = JSON.parse(localStorage.getItem('weddingEntries') || '[]')
        return localEntries
    }

    try {
        const snapshot = await get(ref(db, `entries/${weddingId}`))
        const data = snapshot.val()
        if (!data) return []

        return Object.entries(data).map(([id, entry]) => ({ id, ...entry }))
    } catch (error) {
        console.warn('Failed to get entries from Firebase, falling back to localStorage:', error)
        const localEntries = JSON.parse(localStorage.getItem('weddingEntries') || '[]')
        return localEntries
    }
}
