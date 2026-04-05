// src/lib/firebaseAdmin.js
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

// הסרנו את התאימות הישנה!
// מעכשיו קוראים לזה adminDb, adminAuth כדי למנוע יבוא בטעות לצד הלקוח.
export const adminDb = getFirestore(app)
export const adminAuth = getAuth(app)
export const adminStorage = getStorage(app)
