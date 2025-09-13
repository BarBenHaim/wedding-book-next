import { initializeApp } from 'firebase/app'
import { getStorage } from 'firebase/storage'
import { getDatabase } from 'firebase/database'

const firebaseConfig = {
    apiKey: process.env.NEXT_PUBLIC_API_KEY || 'demo-api-key',
    authDomain: process.env.NEXT_PUBLIC_AUTH_DOMAIN || 'demo-project.firebaseapp.com',
    projectId: process.env.NEXT_PUBLIC_PROJECT_ID || 'demo-project',
    storageBucket: process.env.NEXT_PUBLIC_STORAGE_BUCKET || 'demo-project.appspot.com',
    messagingSenderId: process.env.NEXT_PUBLIC_MESSAGING_SENDER_ID || '123456789',
    appId: process.env.NEXT_PUBLIC_APP_ID || '1:123456789:web:abcdef',
    databaseURL: process.env.NEXT_PUBLIC_DATABASE_URL || 'https://demo-project-default-rtdb.firebaseio.com/',
}

// Only initialize Firebase if we have real config values
let app, storage, db

if (process.env.NEXT_PUBLIC_API_KEY && process.env.NEXT_PUBLIC_API_KEY !== 'your_api_key_here') {
    try {
        app = initializeApp(firebaseConfig)
        storage = getStorage(app)
        db = getDatabase(app)
    } catch (error) {
        console.warn('Firebase initialization failed:', error)
        // Create mock objects for development
        storage = null
        db = null
    }
} else {
    console.warn('Firebase not configured. Please set up your environment variables.')
    storage = null
    db = null
}

export { storage, db }
