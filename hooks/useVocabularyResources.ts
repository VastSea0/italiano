'use client'

import { useCallback, useEffect, useState } from 'react'
import { createEmptyVocabulary, extractStories, normalizeVocabularyData, type Story, type VocabularyData } from '@/lib/vocabulary'

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
      const [wordsResponse, storyResponse] = await Promise.all([
        fetch('/words.json'),
        includeStories ? fetch('/story.json') : Promise.resolve(null),
      ])

      if (!wordsResponse.ok) {
        throw new Error('Failed to load words.json')
      }

      const wordsJson = await wordsResponse.json()
      setVocabulary(normalizeVocabularyData(wordsJson))

      if (includeStories && storyResponse) {
        if (!storyResponse.ok) {
          throw new Error('Failed to load story.json')
        }
        const storyJson = await storyResponse.json()
        setStories(extractStories(storyJson))
      } else if (!includeStories) {
        setStories([])
      }
    } catch (err) {
      console.error(err)
      setError('Unable to load study resources.')
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
