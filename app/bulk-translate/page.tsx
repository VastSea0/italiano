'use client'

import { useState } from 'react'
import { collection, query, getDocs, addDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase/client'
import { useFirebaseAuth } from '@/hooks/useFirebaseAuth'

type VocabularyPayload = {
  mostCommonItalianVerbsA1: any[]
  conjunctions: any[]
  adjectives: any[]
  adverbs: any[]
  prepositions: any[]
  timeExpressions: any[]
  pronouns: any[]
  commonNouns: any[]
}

function normalizeWord(word: string): string {
  // Remove leading articles: il, lo, la, l', i, gli, le
  const articles = ['il ', 'lo ', 'la ', "l'", 'i ', 'gli ', 'le ']
  let normalized = word.toLowerCase().trim()
  for (const article of articles) {
    if (normalized.startsWith(article)) {
      normalized = normalized.slice(article.length)
      break
    }
  }
  return normalized
}

function deriveSlug(word: string): string {
  return normalizeWord(word).replace(/[^a-z0-9]/g, '').toLowerCase()
}

function inferCategoryFromWord(word: string): string {
  const normalized = word.toLowerCase()
  if (normalized.endsWith('are') || normalized.endsWith('ere') || normalized.endsWith('ire')) {
    return 'verbs'
  }
  return 'commonNouns'
}

export default function BulkTranslatePage() {
  const { user, initializing } = useFirebaseAuth()
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleBulkAdd = async () => {
    if (!user) return
    setLoading(true)
    setResult(null)
    setError(null)

    try {
      // Fetch output.json
      const response = await fetch('/output.json')
      if (!response.ok) {
        throw new Error('Failed to fetch output.json')
      }
      const payload = await response.json()

      // Get existing words
      const wordsRef = collection(db, 'words')
      const wordsQuery = query(wordsRef)
      const wordsSnapshot = await getDocs(wordsQuery)
      const existingSlugs = new Set<string>()
      wordsSnapshot.forEach((doc) => {
        existingSlugs.add(doc.id)
      })

      // Extract words from payload
      const allWords: { word: string; category: string; original: string }[] = []

      payload.words.forEach((item: any) => {
        if (item.word) {
          allWords.push({
            word: normalizeWord(item.word),
            category: inferCategoryFromWord(item.word),
            original: item.word,
          })
        }
      })

      // Remove duplicates based on normalized word
      const uniqueWords = allWords.filter(
        (item, index, self) => index === self.findIndex((t) => t.word === item.word)
      )

      // Filter out existing words
      const newWords = uniqueWords.filter((item) => !existingSlugs.has(deriveSlug(item.word)))

      // Add to translation queue
      const translationQueueRef = collection(db, 'translationQueue')
      for (const item of newWords) {
        await addDoc(translationQueueRef, {
          word: item.word,
          surface: item.original,
          context: `Category: ${item.category}`,
          status: 'pending',
          createdAt: serverTimestamp(),
        })
      }

      setResult(`${newWords.length} kelime çeviri kuyruğuna eklendi. ${uniqueWords.length - newWords.length} kelime zaten mevcut.`)
    } catch (err) {
      console.error('Bulk add failed', err)
      setError(err instanceof Error ? err.message : 'Bilinmeyen hata')
    } finally {
      setLoading(false)
    }
  }

  if (initializing) {
    return <div>Loading...</div>
  }

  if (!user) {
    return <div>Giriş yapmanız gerekiyor.</div>
  }

  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      <h1 className="text-2xl font-bold mb-6">Bulk Translation Queue Add</h1>
      <p className="mb-4">
        Bu sayfa output.json dosyasındaki kelimeleri çeviri kuyruğuna ekler. Mevcut kelimeler eklenmez.
      </p>
      <button
        onClick={handleBulkAdd}
        disabled={loading}
        className="px-4 py-2 bg-blue-500 text-white rounded disabled:opacity-50"
      >
        {loading ? 'Ekleniyor...' : 'Çeviri Kuyruğuna Ekle'}
      </button>
      {result && <p className="mt-4 text-green-600">{result}</p>}
      {error && <p className="mt-4 text-red-600">{error}</p>}
    </main>
  )
}