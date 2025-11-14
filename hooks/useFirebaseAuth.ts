'use client'

import { useEffect, useState } from 'react'
import type { User } from 'firebase/auth'
import { onAuthStateChanged } from 'firebase/auth'

import { auth } from '@/lib/firebase/client'

export function useFirebaseAuth() {
  const [user, setUser] = useState<User | null>(null)
  const [initializing, setInitializing] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(
      auth,
      (firebaseUser) => {
        setUser(firebaseUser)
        setInitializing(false)
      },
      (err) => {
        console.error('Auth listener error', err)
        setError('Authentication error')
        setInitializing(false)
      },
    )

    return () => unsubscribe()
  }, [])

  return { user, initializing, error }
}
