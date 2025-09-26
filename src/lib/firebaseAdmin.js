import { initializeApp, cert, getApps } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'

const app =
    getApps().length === 0
        ? initializeApp({
              credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)),
          })
        : getApps()[0]

export const adminAuth = getAuth(app)
export const adminDb = getFirestore(app)
