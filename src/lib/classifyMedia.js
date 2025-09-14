import { db, storage } from './firebaseClient'
import { collection, addDoc, getDocs, serverTimestamp } from 'firebase/firestore'
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage'

export async function saveEntry(weddingId, entry) {
    try {
        let imageUrl = null

        // אם יש תמונה (dataURL או Blob)
        if (entry.image) {
            const filename = `photo-${Date.now()}.jpg`
            const photoRef = storageRef(storage, `weddings/${weddingId}/${filename}`)

            let blob
            if (typeof entry.image === 'string') {
                // אם זה dataURL
                const response = await fetch(entry.image)
                blob = await response.blob()
            } else {
                // אם זה Blob ישירות
                blob = entry.image
            }

            await uploadBytes(photoRef, blob)
            imageUrl = await getDownloadURL(photoRef)
        }

        await addDoc(collection(db, 'weddings', weddingId, 'entries'), {
            name: entry.name || 'אורח אנונימי',
            text: entry.text || null,
            imageUrl,
            timestamp: serverTimestamp(),
        })
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
