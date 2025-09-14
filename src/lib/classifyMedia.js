import { db, storage } from './firebaseClient'
import { collection, addDoc, getDocs, serverTimestamp } from 'firebase/firestore'
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage'

export async function saveEntry(weddingId, type, content) {
    try {
        if (type === 'text') {
            await addDoc(collection(db, 'weddings', weddingId, 'entries'), {
                type: 'text',
                content,
                name: extractName(content),
                timestamp: serverTimestamp(),
            })
        } else if (type === 'photo') {
            const filename = `photo-${Date.now()}.jpg`
            const photoRef = storageRef(storage, `weddings/${weddingId}/${filename}`)

            // ממירים את ה־dataURL ל־Blob לפני העלאה
            const response = await fetch(content)
            const blob = await response.blob()

            await uploadBytes(photoRef, blob)
            const downloadURL = await getDownloadURL(photoRef)

            await addDoc(collection(db, 'weddings', weddingId, 'entries'), {
                type: 'photo',
                content: downloadURL,
                name: 'תמונה מהאורח',
                timestamp: serverTimestamp(),
            })
        }
    } catch (err) {
        console.error('Error saving entry:', err)
        throw err
    }
}

export async function getEntries(weddingId) {
    try {
        const snapshot = await getDocs(collection(db, 'weddings', weddingId, 'entries'))
        return snapshot.docs.map(doc => {
            const data = doc.data()
            return {
                id: doc.id,
                ...data,
                timestamp: data.timestamp?.toDate ? data.timestamp.toDate().getTime() : data.timestamp || null,
            }
        })
    } catch (err) {
        console.error('Error getting entries:', err)
        return []
    }
}

function extractName(content) {
    if (!content.includes(':\n')) return ''
    return content.split(':\n')[0].trim()
}
