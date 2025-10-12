import { initializeApp, cert, getApps, getApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { getAuth } from 'firebase-admin/auth'
import { getStorage } from 'firebase-admin/storage'

function normalizePrivateKey(raw) {
    if (!raw) return undefined
    if (raw.includes('\\n')) return raw.replace(/\\n/g, '\n')
    return raw
}

const app =
    getApps().length === 0
        ? initializeApp({
              credential: cert({
                  projectId: process.env.FIREBASE_PROJECT_ID,
                  clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
                  privateKey: normalizePrivateKey(process.env.FIREBASE_PRIVATE_KEY),
              }),
              storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
          })
        : getApp()

console.log('🔐 Firebase credentials loaded:', {
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    hasPrivateKey: !!process.env.FIREBASE_PRIVATE_KEY,
    keySnippet: process.env.FIREBASE_PRIVATE_KEY?.slice(0, 40),
})

// שמירה על שמות ברורים
export const adminDb = getFirestore(app)
export const adminAuth = getAuth(app)
export const adminStorage = getStorage(app)

// תאימות לקוד ישן (כדי שלא תצטרך לשנות בכל מקום)
export const db = adminDb
export const auth = adminAuth
export const storage = adminStorage
