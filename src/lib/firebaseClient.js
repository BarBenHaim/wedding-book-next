// src/lib/firebaseClient.js
import { initializeApp, getApps, getApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'
import { getStorage } from 'firebase/storage'

let firebaseApp = null
let auth = null
let db = null
let storage = null

// נוודא שהקוד ירוץ רק בדפדפן או בזמן runtime אמיתי
if (typeof window !== 'undefined') {
    const firebaseConfig = {
        apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
        authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
        projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
        storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
        messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
        appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
    }

    firebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig)
    auth = getAuth(firebaseApp)
    db = getFirestore(firebaseApp)
    storage = getStorage(firebaseApp)
}

export { firebaseApp as app, auth, db, storage }
