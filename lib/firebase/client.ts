import { initializeApp, getApps, getApp } from 'firebase/app'
import { getAuth, GoogleAuthProvider } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'
import { getAnalytics, isSupported as isAnalyticsSupported } from 'firebase/analytics'

import { firebaseClientConfig } from './config'

const app = !getApps().length ? initializeApp(firebaseClientConfig) : getApp()

const auth = getAuth(app)
const db = getFirestore(app)
const googleProvider = new GoogleAuthProvider()

type AnalyticsInstance = ReturnType<typeof getAnalytics> | null
let analyticsPromise: Promise<AnalyticsInstance> | null = null

export async function getAnalyticsInstance(): Promise<AnalyticsInstance> {
  if (typeof window === 'undefined') {
    return null
  }

  if (!analyticsPromise) {
    analyticsPromise = (async () => {
      const supported = await isAnalyticsSupported()
      return supported ? getAnalytics(app) : null
    })()
  }

  return analyticsPromise
}

export { app, auth, db, googleProvider }
