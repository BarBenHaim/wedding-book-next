import { initializeApp, cert, getApps, getApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { getAuth } from 'firebase-admin/auth'
import { getStorage } from 'firebase-admin/storage'

const app =
    getApps().length === 0
        ? initializeApp({
              credential: cert({
                  projectId: process.env.FIREBASE_PROJECT_ID,
                  clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
                  privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
              }),
              storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
          })
        : getApp()

console.log('PRIVATE_KEY starts with:', process.env.FIREBASE_PRIVATE_KEY.slice(0, 30))

export const db = getFirestore(app)
export const auth = getAuth(app)
export const storage = getStorage(app)
