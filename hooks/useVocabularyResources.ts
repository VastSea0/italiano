'use client'

import { useCallback, useEffect, useState } from 'react'
import { collection, getDocs, orderBy, query } from 'firebase/firestore'

import { createEmptyVocabulary, extractStories, normalizeVocabularyData, type Story, type VocabularyData, type VocabularyDataKey, type VerbEntry, type WordEntry } from '@/lib/vocabulary'
import { db } from '@/lib/firebase/client'

export type VocabularyHookOptions = {
  includeStories?: boolean
}

export function useVocabularyResources(options: VocabularyHookOptions = {}) {
  const { includeStories = true } = options
  const [vocabulary, setVocabulary] = useState<VocabularyData>(createEmptyVocabulary())
  const [stories, setStories] = useState<Story[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadResources = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const [firestoreVocabulary, storyPayload] = await Promise.all([
        fetchVocabularyFromFirestore(),
        includeStories ? fetchStoriesFromJson() : Promise.resolve(null),
      ])

      setVocabulary(firestoreVocabulary)

      if (includeStories && storyPayload) {
        setStories(extractStories(storyPayload))
      } else {
        setStories([])
      }
    } catch (err) {
      console.error(err)
      setError('Unable to load study resources.')

      // Best-effort fallback to bundled JSON so UI is not empty if Firestore fails.
      try {
        const fallbackResponse = await fetch('/words.json')
        if (fallbackResponse.ok) {
          const wordsJson = await fallbackResponse.json()
          setVocabulary(normalizeVocabularyData(wordsJson))
        }
      } catch (fallbackError) {
        console.error('Fallback vocabulary load failed', fallbackError)
      }
    } finally {
      setLoading(false)
    }
  }, [includeStories])

  useEffect(() => {
    loadResources().catch((err) => console.error(err))
  }, [loadResources])

  return {
    vocabulary,
    stories,
    loading,
    error,
    reload: loadResources,
  }
}

type FirestoreWordDoc = {
  categoryKey?: string
  payload?: VerbEntry | WordEntry
}

async function fetchVocabularyFromFirestore(): Promise<VocabularyData> {
  const wordsQuery = query(collection(db, 'words'), orderBy('slug'))
  const snapshot = await getDocs(wordsQuery)
  const dataset = createEmptyVocabulary()

  snapshot.forEach((docSnap) => {
    const data = docSnap.data() as FirestoreWordDoc
    if (!data.payload || !data.categoryKey) {
      return
    }
    const categoryKey = data.categoryKey as VocabularyDataKey
    if (categoryKey === 'verbs') {
      dataset.verbs.push(data.payload as VerbEntry)
    } else {
      ;(dataset[categoryKey] as WordEntry[]).push(data.payload as WordEntry)
    }
  })

  return dataset
}

async function fetchStoriesFromJson() {
  const response = await fetch('/story.json')
  if (!response.ok) {
    throw new Error('Failed to load story.json')
  }
  return response.json()
}
