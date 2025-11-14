import { cert, getApps, initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'

import { firebaseAdminConfig } from './config'

function createAdminApp() {
  if (!firebaseAdminConfig.projectId || !firebaseAdminConfig.clientEmail || !firebaseAdminConfig.privateKey) {
    console.warn('Firebase admin credentials are not fully configured. Admin features will be disabled.')
    return null
  }

  return initializeApp({
    credential: cert({
      projectId: firebaseAdminConfig.projectId,
      clientEmail: firebaseAdminConfig.clientEmail,
      privateKey: firebaseAdminConfig.privateKey,
    }),
  })
}

const adminApp = getApps().length ? getApps()[0] : createAdminApp()

export const adminDb = adminApp ? getFirestore(adminApp) : null
export const adminAuth = adminApp ? getAuth(adminApp) : null
