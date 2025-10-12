import { initializeApp, cert, getApps, getApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { getAuth } from 'firebase-admin/auth'
import { getStorage } from 'firebase-admin/storage'

function normalizePrivateKey(raw) {
    if (!raw) return undefined
    // אם הגיע עם \n כפול (כמו בקובץ .env מקומי ישן) – המרה לשבירת שורה אמיתית
    if (raw.includes('\\n')) return raw.replace(/\\n/g, '\n')
    // אם הגיע כבר עם \n אחד (כמו שמזינים ב-Vercel) – השאר כמות שהוא
    return raw
}

// --- DEBUG LOGS (בטוחים) ---
const rawKey = process.env.FIREBASE_PRIVATE_KEY
const normalizedKey = normalizePrivateKey(rawKey)
console.log('🧪 FIREBASE key present?:', rawKey ? 'YES' : 'NO')
console.log('🧪 FIREBASE key has "\\n" literals?:', rawKey?.includes('\\n') ? 'YES' : 'NO')
console.log('🧪 FIREBASE normalized length:', normalizedKey?.length ?? 'MISSING')
console.log('🧪 FIREBASE key starts with:', normalizedKey ? normalizedKey.slice(0, 30) : 'MISSING')

let app
try {
    app =
        getApps().length === 0
            ? initializeApp({
                  credential: cert({
                      projectId: process.env.FIREBASE_PROJECT_ID,
                      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
                      privateKey: normalizedKey, // ← שימוש בגרסה המתוקנת
                  }),
                  storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
              })
            : getApp()
} catch (e) {
    console.error('❌ Firebase Admin init failed:', e)
    throw e
}

export const db = getFirestore(app)
export const auth = getAuth(app)
export const storage = getStorage(app)
