import { initializeApp, cert, getApps } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'

const rawKey = process.env.FIREBASE_PRIVATE_KEY || ''
const privateKey = rawKey
    .replace(/\\n/g, '\n') // ממיר \n רגיל
    .replace(/\\\\n/g, '\n') // ממיר \\n כפול
    .replace(/"/g, '') // מסיר מרכאות אם יש
    .trim() // מסיר רווחים

const app =
    getApps().length === 0
        ? initializeApp({
              credential: cert({
                  project_id: process.env.FIREBASE_PROJECT_ID,
                  client_email: process.env.FIREBASE_CLIENT_EMAIL,
                  private_key: privateKey,
              }),
          })
        : getApps()[0]

export const adminAuth = getAuth(app)
export const adminDb = getFirestore(app)
