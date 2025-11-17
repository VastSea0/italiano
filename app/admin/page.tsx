'use client'

import { useEffect, useMemo, useState } from 'react'
import type { ChangeEvent } from 'react'
import Link from 'next/link'
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
} from 'firebase/firestore'
import { signInWithPopup, signOut } from 'firebase/auth'
import type { User } from 'firebase/auth'

import { useFirebaseAuth } from '@/hooks/useFirebaseAuth'
import { auth, db, googleProvider } from '@/lib/firebase/client'
import {
  KEY_TO_CATEGORY_NAME,
  VOCABULARY_DATA_OPTIONS,
  createEmptyVocabulary,
  normalizeVocabularyData,
  slugify,
  type VocabularyData,
  type VocabularyDataKey,
  type VerbEntry,
  type WordEntry,
  type VocabularyPayload,
} from '@/lib/vocabulary'

const ADMIN_EMAILS = (process.env.NEXT_PUBLIC_ADMIN_EMAILS || '')
  .split(',')
  .map((email) => email.trim().toLowerCase())
  .filter(Boolean)

const wordsCollectionRef = collection(db, 'words')
const translationQueueCollectionRef = collection(db, 'translationQueue')

type WordRecord = {
  id: string
  slug: string
  categoryKey: VocabularyDataKey
  payload: VerbEntry | WordEntry
  updatedAt?: Date
  updatedBy?: string
}

type HistoryAction = 'create' | 'update' | 'delete' | 'restore' | 'import'

type GenericEntry = Record<string, unknown>

type WordHistoryEntry = {
  id: string
  slug: string
  action: HistoryAction
  actor?: string | null
  payload?: VerbEntry | WordEntry | null
  categoryKey?: VocabularyDataKey
  timestamp?: Date
  message?: string | null
  restoredFromId?: string | null
}

type TranslationStatus = 'pending' | 'resolved'

type TranslationTask = {
  id: string
  slug: string
  word: string
  displayWord: string
  context?: string | null
  storyTitle?: string | null
  sentenceId?: number | null
  status: TranslationStatus
  createdAt?: Date
  resolvedAt?: Date
  resolvedBy?: string | null
}

type TranslationTaskDoc = {
  word?: string
  surface?: string
  context?: string
  storyTitle?: string
  sentenceId?: number
  status?: TranslationStatus
  createdAt?: Timestamp
  resolvedAt?: Timestamp
  resolvedBy?: string
}

type EditorMode = 'create' | 'edit'

export default function AdminDashboard() {
  const { user, initializing, error: authError } = useFirebaseAuth()
  const [words, setWords] = useState<WordRecord[]>([])
  const [loadingWords, setLoadingWords] = useState(false)
  const [wordsError, setWordsError] = useState<string | null>(null)
  const [selectedWord, setSelectedWord] = useState<WordRecord | null>(null)
  const [editorMode, setEditorMode] = useState<EditorMode>('create')
  const [formCategory, setFormCategory] = useState<VocabularyDataKey>('verbs')
  const [formJson, setFormJson] = useState('')
  const [formSlug, setFormSlug] = useState('')
  const [structuredEntry, setStructuredEntry] = useState<VerbEntry | WordEntry | GenericEntry | null>(null)
  const [jsonError, setJsonError] = useState<string | null>(null)
  const [saveStatus, setSaveStatus] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<VocabularyDataKey | 'all'>('all')
  const [seedInProgress, setSeedInProgress] = useState(false)
  const [historyEntries, setHistoryEntries] = useState<WordHistoryEntry[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyError, setHistoryError] = useState<string | null>(null)
  const [restoringVersionId, setRestoringVersionId] = useState<string | null>(null)
  const [translationTasks, setTranslationTasks] = useState<TranslationTask[]>([])
  const [translationLoading, setTranslationLoading] = useState(false)
  const [translationError, setTranslationError] = useState<string | null>(null)
  const [resolvingTaskId, setResolvingTaskId] = useState<string | null>(null)
  const [translationPage, setTranslationPage] = useState(1)
  const translationPageSize = 10
  const [translationSearchTerm, setTranslationSearchTerm] = useState('')
  const pendingTranslationTasks = useMemo(
    () => translationTasks.filter((task) => task.status !== 'resolved'),
    [translationTasks],
  )
  const totalTranslationPages = useMemo(() => {
    const pending = translationTasks.filter((task) => task.status !== 'resolved')
    return Math.ceil(pending.length / translationPageSize)
  }, [translationTasks, translationPageSize])
  const filteredTranslationTasks = useMemo(() => {
    const term = translationSearchTerm.trim().toLowerCase()
    return pendingTranslationTasks.filter((task) => {
      if (!term) return true
      const haystack = [task.displayWord, task.slug, task.storyTitle, task.context].join(' ').toLowerCase()
      return haystack.includes(term)
    })
  }, [pendingTranslationTasks, translationSearchTerm])
  const paginatedTranslationTasks = useMemo(() => {
    return filteredTranslationTasks.slice(
      (translationPage - 1) * translationPageSize,
      translationPage * translationPageSize,
    )
  }, [filteredTranslationTasks, translationPage, translationPageSize])
  const totalFilteredTranslationPages = useMemo(() => {
    return Math.ceil(filteredTranslationTasks.length / translationPageSize)
  }, [filteredTranslationTasks, translationPageSize])
  const [wordsPage, setWordsPage] = useState(1)
  const wordsPageSize = 20
  const [totalWordsPages, setTotalWordsPages] = useState(1)
  const [paginatedWords, setPaginatedWords] = useState<WordRecord[]>([])
  const syncStructuredEntry = (entry: GenericEntry | null) => {
    setStructuredEntry(entry)
    if (entry) {
      setFormJson(JSON.stringify(entry, null, 2))
    } else {
      setFormJson('')
    }
    setJsonError(null)
  }

  const handleJsonChange = (value: string) => {
    setFormJson(value)
    if (!value.trim()) {
      setStructuredEntry(null)
      setJsonError(null)
      return
    }
    try {
      const parsed = JSON.parse(value)
      if (typeof parsed !== 'object' || parsed === null) {
        setJsonError('JSON bir nesne olmalı')
        return
      }
      setStructuredEntry(parsed as GenericEntry)
      setJsonError(null)
    } catch (err) {
      setJsonError('JSON parse edilemedi')
    }
  }

  const handleStructuredFieldChange = (fieldKey: string, rawValue: string, fieldType: StructuredFieldType) => {
    setStructuredEntry((prev) => {
      const base: GenericEntry = { ...(prev ?? createDefaultEntry(formCategory)) }
      if (fieldType === 'array') {
        const arrayValue = rawValue
          .split(/\r?\n|,/)
          .map((item) => item.trim())
          .filter(Boolean)
        base[fieldKey] = arrayValue
      } else {
        base[fieldKey] = rawValue
      }
      setFormJson(JSON.stringify(base, null, 2))
      setJsonError(null)
      return base
    })
  }

  const handleCategorySelect = (nextCategory: VocabularyDataKey) => {
    setFormCategory(nextCategory)
    setStructuredEntry((prev) => {
      if (prev) return prev
      const next = createDefaultEntry(nextCategory)
      setFormJson(JSON.stringify(next, null, 2))
      setJsonError(null)
      return next
    })
  }

  const isAuthorized = useMemo(() => {
    if (!user) return false
    if (ADMIN_EMAILS.length === 0) return true
    return ADMIN_EMAILS.includes((user.email || '').toLowerCase())
  }, [user])
  const recentResolvedTasks = useMemo(
    () => translationTasks.filter((task) => task.status === 'resolved').slice(0, 3),
    [translationTasks],
  )

  useEffect(() => {
    if (!user || !isAuthorized) {
      setWords([])
      return
    }
    setLoadingWords(true)
    const q = query(wordsCollectionRef, orderBy('slug'))
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const docs: WordRecord[] = snapshot.docs.reduce<WordRecord[]>((acc, docSnap) => {
          const data = docSnap.data() as FirestoreWordDoc
          const payload = data.payload as VerbEntry | WordEntry | undefined
          if (!payload) {
            return acc
          }
          acc.push({
            id: docSnap.id,
            slug: data.slug ?? docSnap.id,
            categoryKey: (data.categoryKey as VocabularyDataKey) ?? 'commonNouns',
            payload,
            updatedAt: data.updatedAt ? data.updatedAt.toDate() : undefined,
            updatedBy: data.updatedBy,
          })
          return acc
        }, [])
        setWords(docs)
        setLoadingWords(false)
        setWordsError(null)
      },
      (err) => {
        console.error('Failed to subscribe to words collection', err)
        setWordsError('Firestore aboneliği kurulamadı. Konsolu kontrol edin.')
        setLoadingWords(false)
      },
    )
    return () => unsubscribe()
  }, [user, isAuthorized])

  useEffect(() => {
    setTranslationLoading(true)
    const queueQuery = query(translationQueueCollectionRef, orderBy('createdAt', 'desc'))
    const unsubscribe = onSnapshot(
      queueQuery,
      (snapshot) => {
        const docs: TranslationTask[] = snapshot.docs.map((docSnap) => {
          const data = docSnap.data() as TranslationTaskDoc
          return {
            id: docSnap.id,
            slug: docSnap.id,
            word: data.word ?? docSnap.id,
            displayWord: data.surface ?? data.word ?? docSnap.id,
            context: data.context ?? null,
            storyTitle: data.storyTitle ?? null,
            sentenceId: data.sentenceId ?? null,
            status: data.status ?? 'pending',
            createdAt: data.createdAt ? data.createdAt.toDate() : undefined,
            resolvedAt: data.resolvedAt ? data.resolvedAt.toDate() : undefined,
            resolvedBy: data.resolvedBy ?? null,
          }
        })
        setTranslationTasks(docs)
        setTranslationLoading(false)
        setTranslationError(null)
      },
      (err) => {
        console.error('Failed to subscribe to translation queue', err)
        setTranslationError('Çeviri kuyruğu yüklenemedi')
        setTranslationLoading(false)
      },
    )

    return () => unsubscribe()
  }, [])

  useEffect(() => {
    if (!selectedWord) {
      setHistoryEntries([])
      setHistoryLoading(false)
      setHistoryError(null)
      return
    }

    setHistoryLoading(true)
    const historyRef = collection(doc(wordsCollectionRef, selectedWord.slug), 'history')
    const historyQuery = query(historyRef, orderBy('timestamp', 'desc'), limit(25))

    const unsubscribe = onSnapshot(
      historyQuery,
      (snapshot) => {
        const entries: WordHistoryEntry[] = snapshot.docs.map((docSnap) => {
          const data = docSnap.data() as FirestoreHistoryDoc
          return {
            id: docSnap.id,
            slug: selectedWord.slug,
            action: (data.action as HistoryAction) ?? 'update',
            actor: data.actor ?? null,
            payload: data.payload ?? null,
            categoryKey: (data.categoryKey as VocabularyDataKey) ?? undefined,
            timestamp: data.timestamp ? data.timestamp.toDate() : undefined,
            message: data.message ?? null,
            restoredFromId: data.restoredFromId ?? null,
          }
        })
        setHistoryEntries(entries)
        setHistoryLoading(false)
        setHistoryError(null)
      },
      (err) => {
        console.error('History subscription failed', err)
        setHistoryError('Geçmiş verisi alınamadı')
        setHistoryLoading(false)
      },
    )

    return () => unsubscribe()
  }, [selectedWord])

  const filteredWords = useMemo(() => {
    const term = searchTerm.trim().toLowerCase()
    return words.filter((record) => {
      if (categoryFilter !== 'all' && record.categoryKey !== categoryFilter) {
        return false
      }
      if (!term) return true
      const haystack = [record.slug, record.updatedBy, JSON.stringify(record.payload)].join(' ').toLowerCase()
      return haystack.includes(term)
    })
  }, [words, searchTerm, categoryFilter])

  useEffect(() => {
    const startIndex = (wordsPage - 1) * wordsPageSize
    const endIndex = startIndex + wordsPageSize
    setPaginatedWords(filteredWords.slice(startIndex, endIndex))
    setTotalWordsPages(Math.ceil(filteredWords.length / wordsPageSize))
  }, [filteredWords, wordsPage, wordsPageSize])

  const dataset: VocabularyData = useMemo(() => {
    const empty = createEmptyVocabulary()
    words.forEach((record) => {
      ;(empty[record.categoryKey] as (VerbEntry | WordEntry)[]).push(record.payload)
    })
    return empty
  }, [words])

  const wordsJsonPayload: VocabularyPayload = useMemo(
    () => ({
      mostCommonItalianVerbsA1: dataset.verbs,
      conjunctions: dataset.conjunctions,
      adjectives: dataset.adjectives,
      adverbs: dataset.adverbs,
      prepositions: dataset.prepositions,
      timeExpressions: dataset.timeExpressions,
      pronouns: dataset.pronouns,
      commonNouns: dataset.commonNouns,
    }),
    [dataset],
  )

  const wordsJsonString = useMemo(() => JSON.stringify(wordsJsonPayload, null, 2), [wordsJsonPayload])

  const handleSignIn = async () => {
    try {
      await signInWithPopup(auth, googleProvider)
    } catch (err) {
      console.error('Google auth error', err)
    }
  }

  const handleSignOut = async () => {
    try {
      await signOut(auth)
      resetEditor()
    } catch (err) {
      console.error('Sign out error', err)
    }
  }

  const resetEditor = () => {
    setEditorMode('create')
    setSelectedWord(null)
    setFormCategory('verbs')
    const emptyEntry = createDefaultEntry('verbs')
    syncStructuredEntry(emptyEntry)
    setFormSlug('')
    setSaveStatus(null)
  }

  const handleSelectWord = (record: WordRecord) => {
    setSelectedWord(record)
    setEditorMode('edit')
    setFormCategory(record.categoryKey)
    setFormSlug(record.slug)
    syncStructuredEntry(record.payload)
    setSaveStatus(null)
    setHistoryError(null)
  }

  const handleNewWord = () => {
    resetEditor()
  }

  const handleTranslate = async () => {
    setSaving(true)
    setSaveStatus(null)
    try {
      const word = formSlug || (structuredEntry?.italian as string) || (structuredEntry?.infinitive as string) || ''
      if (!word) {
        setSaveStatus('Kelime belirtin')
        return
      }
      const response = await fetch('/api/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ word }),
      })
      if (!response.ok) {
        throw new Error('Çeviri başarısız')
      }
      const data = await response.json()
      if (data.text) {
        syncStructuredEntry({ english: data.text })
        setSaveStatus('Çeviri uygulandı (text)')
      } else {
        // Set category if provided by AI
        if (data.category && VOCABULARY_DATA_OPTIONS.some(opt => opt.key === data.category)) {
          setFormCategory(data.category)
        }
        // Set slug to the word if not already set
        if (!formSlug.trim()) {
          setFormSlug(word)
        }
        syncStructuredEntry(data)
        setSaveStatus('Çeviri uygulandı')
      }
    } catch (err: unknown) {
      console.error('Translation failed', err)
      setSaveStatus(err instanceof Error ? err.message : 'Çeviri hatası')
    } finally {
      setSaving(false)
    }
  }

  const handleAdoptTranslationTask = (task: TranslationTask) => {
    const alreadyExists = isWordAlreadyInConjugations(task.word, words)
    if (alreadyExists) {
      const proceed = confirm(`"${task.displayWord}" kelimesi zaten mevcut bir kelimenin çekimi olarak görünüyor. Yine de düzenlemek istiyor musunuz?`)
      if (!proceed) return
    }
    const inferredCategory = inferCategoryFromWord(task.word)
    setEditorMode('create')
    setSelectedWord(null)
    setFormCategory(inferredCategory)
    syncStructuredEntry(buildEntryFromTask(task, inferredCategory))
    setFormSlug(task.word)
    setSaveStatus(`"${task.displayWord}" için yeni kayıt oluşturun.`)
  }

  function isWordAlreadyInConjugations(word: string, words: WordRecord[]): boolean {
    for (const record of words) {
      if (record.categoryKey === 'verbs') {
        const payload = record.payload as VerbEntry
        if (payload.present?.includes(word) || payload.past?.includes(word) || payload.presentContinuous?.includes(word)) {
          return true
        }
      }
    }
    return false
  }

  const handleResolveTranslationTask = async (taskId: string) => {
    setResolvingTaskId(taskId)
    try {
      await deleteDoc(doc(translationQueueCollectionRef, taskId))
    } catch (err) {
      console.error('Failed to resolve translation task', err)
    } finally {
      setResolvingTaskId(null)
    }
  }

  const handleSaveWord = async () => {
    if (!user) return
    setSaving(true)
    setSaveStatus(null)
    try {
      if (jsonError) {
        throw new Error('JSON geçersiz. Lütfen hatayı düzeltin.')
      }
      const parsed = structuredEntry ?? (formJson ? JSON.parse(formJson) : createDefaultEntry(formCategory))
      const derivedSlug = formSlug.trim() || deriveSlug(parsed)
      if (!derivedSlug) {
        throw new Error('Slug / temel anahtar belirlenemedi. Lütfen "Slug" alanını doldurun.')
      }

      const actorId = user.email || user.uid
      const existingRecord = words.find((record) => record.slug === derivedSlug)
      const historyAction: HistoryAction = existingRecord ? 'update' : 'create'

      await persistWordWithHistory({
        slug: derivedSlug,
        categoryKey: formCategory,
        payload: parsed,
        actor: actorId,
        action: historyAction,
        message: historyAction === 'create' ? 'Manuel oluşturma' : 'Manuel güncelleme',
      })
      await resolveTranslationTaskBySlug(derivedSlug, actorId)

      setSaveStatus(historyAction === 'create' ? '✅ Kelime oluşturuldu' : '✅ Kelime güncellendi')
      setFormSlug(derivedSlug)
    } catch (err: unknown) {
      console.error('Failed to save word', err)
      setSaveStatus(err instanceof Error ? err.message : 'Bilinmeyen bir hata oluştu')
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteWord = async () => {
    if (!selectedWord) return
    if (!confirm(`"${selectedWord.slug}" kaydını silmek istediğinize emin misiniz?`)) {
      return
    }
    try {
      if (user) {
        await logHistoryEntry({
          slug: selectedWord.slug,
          actor: user.email || user.uid,
          action: 'delete',
          payload: selectedWord.payload,
          categoryKey: selectedWord.categoryKey,
          message: 'Kayıt silindi',
        })
      }
      await deleteDoc(doc(wordsCollectionRef, selectedWord.slug))
      resetEditor()
      setSaveStatus('🗑️ Kayıt silindi')
    } catch (err) {
      console.error('Delete failed', err)
      setSaveStatus('Silme işlemi başarısız oldu')
    }
  }

  const handleDownloadJson = () => {
    downloadTextFile(wordsJsonString, `words-${new Date().toISOString().slice(0, 10)}.json`)
  }

  const handleSeedFromLocal = async () => {
    if (!user) return
    if (!confirm('Mevcut words.json dosyasını Firestore veritabanına aktarmak istediğinizden emin misiniz? Bu işlem mevcut kayıtları güncelleyebilir.')) {
      return
    }
    setSeedInProgress(true)
    try {
      const response = await fetch('/words.json')
      if (!response.ok) {
        throw new Error('words.json dosyası yüklenemedi')
      }
      const payload = (await response.json()) as VocabularyPayload
      const normalized = normalizeVocabularyData(payload)
      const operations: Promise<void>[] = []
      let importedCount = 0
      const actorId = user.email || user.uid

      ;(Object.keys(normalized) as VocabularyDataKey[]).forEach((key) => {
        normalized[key].forEach((entry) => {
          const slug = deriveSlug(entry)
          if (!slug) return
          importedCount += 1
          operations.push(
            persistWordWithHistory({
              slug,
              categoryKey: key,
              payload: entry,
              actor: actorId,
              action: 'import',
              message: 'words.json içe aktarımı',
            }),
          )
        })
      })

      await Promise.all(operations)
      setSaveStatus(`📥 ${importedCount} kayıt words.json'dan senkronize edildi`)
    } catch (err) {
      console.error('Seed failed', err)
      setSaveStatus(err instanceof Error ? err.message : 'İçe aktarma başarısız oldu')
    } finally {
      setSeedInProgress(false)
    }
  }

  const handleRestoreVersion = async (entry: WordHistoryEntry) => {
    if (!user || !entry.payload) return
    if (!confirm('Bu versiyona dönmek istediğinizden emin misiniz?')) return

    setRestoringVersionId(entry.id)
    try {
      await persistWordWithHistory({
        slug: entry.slug,
        categoryKey: entry.categoryKey || formCategory,
        payload: entry.payload,
        actor: user.email || user.uid,
        action: 'restore',
        message: `Versiyon ${entry.id} geri yüklendi`,
        restoredFromId: entry.id,
      })
      setSaveStatus('⏪ Versiyon geri yüklendi')
    } catch (err) {
      console.error('Restore failed', err)
      setSaveStatus('Versiyon geri yükleme başarısız oldu')
    } finally {
      setRestoringVersionId(null)
    }
  }

  if (initializing) {
    return <LoadingState message="Kimlik doğrulama başlatılıyor..." />
  }

  if (authError) {
    return <ErrorState message={authError} onRetry={handleSignIn} />
  }

  if (!user) {
    return <SignInHero onSignIn={handleSignIn} />
  }

  if (!isAuthorized) {
    return <UnauthorizedState user={user} onSignOut={handleSignOut} />
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Vocabulary Control Center</h1>
            <p className="text-sm text-gray-600 mt-1">
              {words.length} kayıt izleniyor · Son güncelleme{' '}
              {words[0]?.updatedAt ? formatDate(words[0].updatedAt) : 'bilinmiyor'}
            </p>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-sm text-gray-600">
              <div>{user.email}</div>
              <div className="text-xs">UID: {user.uid}</div>
            </div>
            <button
              className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200"
              onClick={handleSignOut}
            >
              Çıkış yap
            </button>
          </div>
        </div>
        <div className="max-w-7xl mx-auto mt-4 grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Toplam Kayıt" value={words.length} />
          <StatCard label="Verbs" value={dataset.verbs.length} />
          <StatCard label="Nouns" value={dataset.commonNouns.length} />
          <StatCard label="Pronouns" value={dataset.pronouns.length} />
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-8">
            <section className="bg-white rounded-lg border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-xl font-semibold text-gray-900">🚨 Öncelikli Kelimeler</h2>
                  <p className="text-sm text-gray-600">Story bölümünden gelen ve henüz sözlükte olmayan kelimeler.</p>
                </div>
                <div className="flex gap-2">
                  <span className="px-3 py-1 bg-amber-100 text-amber-800 rounded-full text-sm">
                    Bekleyen: {filteredTranslationTasks.length}
                  </span>
                  <span className="px-3 py-1 bg-gray-100 text-gray-600 rounded-full text-sm">
                    Tamamlanan: {translationTasks.length - pendingTranslationTasks.length}
                  </span>
                </div>
              </div>

              <div className="space-y-4">
                {translationLoading && <p className="text-sm text-gray-600">Kuyruk yükleniyor…</p>}
                {translationError && <p className="text-sm text-red-600">{translationError}</p>}
                {!translationLoading && !translationError && filteredTranslationTasks.length === 0 && pendingTranslationTasks.length > 0 && (
                  <p className="text-sm text-gray-600">Arama kriterlerine uyan bekleyen çeviri isteği yok.</p>
                )}
                {!translationLoading && !translationError && pendingTranslationTasks.length > 0 && (
                  <>
                    <div className="mb-4">
                      <input
                        type="text"
                        className="w-full px-4 py-2 border border-gray-300 rounded-md text-gray-900"
                        placeholder="Kuyrukta kelime, slug veya hikaye ara..."
                        value={translationSearchTerm}
                        onChange={(event) => setTranslationSearchTerm(event.target.value)}
                      />
                    </div>
                    <div className="border border-gray-200 rounded-lg overflow-hidden">
                      <table className="w-full text-left text-sm">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-4 py-3 text-gray-700">Kelime</th>
                            <th className="px-4 py-3 text-gray-700">Slug</th>
                            <th className="px-4 py-3 text-gray-700">Hikaye</th>
                            <th className="px-4 py-3 text-gray-700">İşlemler</th>
                          </tr>
                        </thead>
                        <tbody>
                          {paginatedTranslationTasks.map((task) => (
                            <tr key={task.id} className="border-t border-gray-100">
                              <td className="px-4 py-3 font-semibold text-gray-900">{task.displayWord}</td>
                              <td className="px-4 py-3 text-gray-600">{task.slug}</td>
                              <td className="px-4 py-3 text-gray-600">{task.storyTitle || '—'}</td>
                              <td className="px-4 py-3">
                                <div className="flex gap-2">
                                  <button
                                    type="button"
                                    onClick={() => handleAdoptTranslationTask(task)}
                                    className="px-3 py-1 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-xs"
                                  >
                                    Formda aç
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleResolveTranslationTask(task.slug)}
                                    disabled={resolvingTaskId === task.slug}
                                    className="px-3 py-1 bg-gray-600 text-white rounded-md hover:bg-gray-700 disabled:opacity-50 text-xs"
                                  >
                                    {resolvingTaskId === task.slug ? 'Kapanıyor…' : 'Tamamlandı'}
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </div>

              {totalFilteredTranslationPages > 1 && (
                <div className="mt-6 flex justify-center gap-2">
                  <button onClick={() => setTranslationPage(Math.max(1, translationPage - 1))} disabled={translationPage === 1} className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 disabled:opacity-50">Önceki</button>
                  <span className="px-4 py-2 text-gray-700">{translationPage} / {totalFilteredTranslationPages}</span>
                  <button onClick={() => setTranslationPage(Math.min(totalFilteredTranslationPages, translationPage + 1))} disabled={translationPage === totalFilteredTranslationPages} className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 disabled:opacity-50">Sonraki</button>
                </div>
              )}

              {recentResolvedTasks.length > 0 && (
                <div className="mt-6 border-t border-gray-200 pt-4">
                  <p className="text-sm text-gray-700">Son tamamlananlar:</p>
                  <ul className="mt-2 space-y-1">
                    {recentResolvedTasks.map((task) => (
                      <li key={`resolved-${task.id}`} className="text-sm text-gray-600">{task.displayWord}</li>
                    ))}
                  </ul>
                </div>
              )}
            </section>

            <section className="bg-white rounded-lg border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-xl font-semibold text-gray-900">Kelime Kayıtları</h2>
                  <p className="text-sm text-gray-600">Firestore içeriğini canlı olarak izleyin</p>
                </div>
                <div className="flex gap-2">
                  <button
                    className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
                    onClick={handleNewWord}
                  >
                    + Yeni kayıt
                  </button>
                  <button
                    className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
                    onClick={handleSeedFromLocal}
                    disabled={seedInProgress || saving}
                  >
                    {seedInProgress ? 'İçe aktarılıyor...' : 'words.json içe aktar'}
                  </button>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-4 mb-4">
                <input
                  type="text"
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-md text-gray-900"
                  placeholder="Kelime veya slug ara..."
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                />
                <select
                  className="px-4 py-2 border border-gray-300 rounded-md text-gray-900"
                  value={categoryFilter}
                  onChange={(event) => setCategoryFilter(event.target.value as VocabularyDataKey | 'all')}
                >
                  <option value="all">Tüm kategoriler</option>
                  {VOCABULARY_DATA_OPTIONS.map((option) => (
                    <option key={option.key} value={option.key}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <table className="w-full text-left text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-gray-700">Slug</th>
                      <th className="px-4 py-3 text-gray-700">Kategori</th>
                      <th className="px-4 py-3 text-gray-700">Son Güncelleme</th>
                      <th className="px-4 py-3 text-gray-700">Güncelleyen</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loadingWords && (
                      <tr>
                        <td colSpan={4} className="px-4 py-6 text-center text-gray-600">
                          Firestore verisi yükleniyor...
                        </td>
                      </tr>
                    )}

                    {!loadingWords && filteredWords.length === 0 && (
                      <tr>
                        <td colSpan={4} className="px-4 py-6 text-center text-gray-600">
                          Kayıt bulunamadı.
                        </td>
                      </tr>
                    )}

                    {paginatedWords.map((record) => (
                      <tr
                        key={record.slug}
                        className="border-t border-gray-100 hover:bg-gray-50 cursor-pointer"
                        onClick={() => handleSelectWord(record)}
                      >
                        <td className="px-4 py-3 font-semibold text-gray-900">{record.slug}</td>
                        <td className="px-4 py-3 text-gray-700">{KEY_TO_CATEGORY_NAME[record.categoryKey]}</td>
                        <td className="px-4 py-3 text-gray-600">{record.updatedAt ? formatDate(record.updatedAt) : '—'}</td>
                        <td className="px-4 py-3 text-gray-600">{record.updatedBy || '---'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {totalWordsPages > 1 && (
                <div className="mt-6 flex justify-center gap-2">
                  <button onClick={() => setWordsPage(Math.max(1, wordsPage - 1))} disabled={wordsPage === 1} className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 disabled:opacity-50">Önceki</button>
                  <span className="px-4 py-2 text-gray-700">{wordsPage} / {totalWordsPages}</span>
                  <button onClick={() => setWordsPage(Math.min(totalWordsPages, wordsPage + 1))} disabled={wordsPage === totalWordsPages} className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 disabled:opacity-50">Sonraki</button>
                </div>
              )}

              {wordsError && <p className="mt-4 text-sm text-red-600">{wordsError}</p>}
            </section>
          </div>

          <div className="space-y-8">
            <section className="bg-white rounded-lg border border-gray-200 p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">
                {editorMode === 'create' ? 'Yeni Kelime' : `Düzenle: ${selectedWord?.slug || ''}`}
              </h2>
              <p className="text-sm text-gray-600 mb-4">words.json şemasına birebir uyan JSON verisi kullanın.</p>

              <form className="space-y-4" onSubmit={(event) => event.preventDefault()}>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Slug (zorunlu)</label>
                  <input
                    type="text"
                    className="w-full px-4 py-2 border border-gray-300 rounded-md text-gray-900"
                    placeholder="örn. essere"
                    value={formSlug}
                    onChange={(event) => setFormSlug(event.target.value)}
                  />
                  <p className="mt-1 text-xs text-gray-500">Boş bırakırsanız infinitive/italian alanından otomatik üretilir.</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Kategori</label>
                  <select
                    className="w-full px-4 py-2 border border-gray-300 rounded-md text-gray-900"
                    value={formCategory}
                    onChange={(event) => handleCategorySelect(event.target.value as VocabularyDataKey)}
                  >
                    {VOCABULARY_DATA_OPTIONS.map((option) => (
                      <option key={option.key} value={option.key}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>

                <StructuredForm
                  category={formCategory}
                  entry={structuredEntry}
                  onChange={handleStructuredFieldChange}
                  onReset={() => syncStructuredEntry(createDefaultEntry(formCategory))}
                  onTranslate={handleTranslate}
                />

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">JSON İçeriği</label>
                  <textarea
                    className="w-full px-4 py-2 border border-gray-300 rounded-md font-mono text-sm text-gray-900"
                    rows={10}
                    placeholder={`{\n  "infinitive": "essere",\n  "english": "to be"\n}`}
                    value={formJson}
                    onChange={(event) => handleJsonChange(event.target.value)}
                  />
                  {jsonError && <p className="mt-2 text-xs text-red-600">{jsonError}</p>}
                  {!jsonError && (
                    <p className="mt-2 text-xs text-gray-500">Form alanlarını kullanarak yaptığınız değişiklikler otomatik olarak JSON'a işlenir.</p>
                  )}
                </div>

                {saveStatus && <p className="text-sm text-gray-700">{saveStatus}</p>}

                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={handleSaveWord}
                    disabled={saving}
                    className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
                  >
                    {saving ? 'Kaydediliyor…' : 'Kaydet'}
                  </button>
                  <button
                    type="button"
                    onClick={resetEditor}
                    className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200"
                  >
                    Temizle
                  </button>
                  {editorMode === 'edit' && (
                    <button
                      type="button"
                      onClick={handleDeleteWord}
                      className="flex-1 px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
                    >
                      Sil
                    </button>
                  )}
                </div>
              </form>
            </section>

            <section className="bg-white rounded-lg border border-gray-200 p-6">
              <h3 className="text-xl font-semibold text-gray-900 mb-4">words.json Snapshot</h3>
              <p className="text-sm text-gray-600 mb-4">Tek tuşla indirip dışa aktarabilirsiniz.</p>
              <div className="flex gap-3 mb-4">
                <button
                  className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
                  onClick={handleDownloadJson}
                >
                  📦 JSON indir
                </button>
                <Link
                  href="/"
                  className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200"
                >
                  🎯 Ana siteyi aç
                </Link>
              </div>
              <pre className="border border-gray-200 rounded-lg p-4 text-sm text-gray-800 overflow-auto max-h-64">{wordsJsonString}</pre>
            </section>

            <section className="bg-white rounded-lg border border-gray-200 p-6">
              <h3 className="text-xl font-semibold text-gray-900 mb-4">📜 Değişiklik Geçmişi</h3>
              {!selectedWord && (
                <p className="text-sm text-gray-600">Geçmişi incelemek için tablodan bir kelime seçin.</p>
              )}

              {selectedWord && (
                <>
                  <p className="text-sm text-gray-600 mb-4">
                    {selectedWord.slug} için son {historyEntries.length} değişiklik · kategori {KEY_TO_CATEGORY_NAME[selectedWord.categoryKey]}
                  </p>

                  {historyLoading && <p className="text-sm text-gray-600">Geçmiş yükleniyor…</p>}
                  {historyError && <p className="text-sm text-red-600">{historyError}</p>}
                  {!historyLoading && !historyError && historyEntries.length === 0 && (
                    <p className="text-sm text-gray-600">Henüz geçmiş kaydı bulunmuyor.</p>
                  )}

                  <ul className="space-y-4">
                    {historyEntries.map((entry) => (
                      <li key={entry.id} className="border border-gray-200 rounded-lg p-4">
                        <div className="flex items-center justify-between mb-2">
                          <div>
                            <p className="text-sm font-semibold text-gray-900">
                              {HISTORY_LABELS[entry.action]}{' '}
                              <span className="text-sm font-normal text-gray-600">· {entry.actor || 'Bilinmiyor'}</span>
                            </p>
                            <p className="text-xs text-gray-500">
                              {entry.timestamp ? formatDate(entry.timestamp) : 'Bekleniyor'}
                            </p>
                          </div>
                          <div className="flex gap-2">
                            {entry.restoredFromId && (
                              <span className="px-2 py-1 bg-gray-100 text-gray-600 rounded text-xs">
                                ← {entry.restoredFromId}
                              </span>
                            )}
                            <button
                              className="px-3 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700 disabled:opacity-50"
                              disabled={!entry.payload || restoringVersionId === entry.id}
                              onClick={() => handleRestoreVersion(entry)}
                            >
                              {restoringVersionId === entry.id ? 'Yükleniyor...' : 'Versiyona dön'}
                            </button>
                          </div>
                        </div>
                        {entry.message && <p className="text-sm text-gray-700 mb-2">{entry.message}</p>}
                        {entry.payload && (
                          <pre className="border border-gray-200 rounded p-3 text-xs text-gray-800 overflow-auto max-h-32">{JSON.stringify(entry.payload, null, 2)}</pre>
                        )}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </section>
          </div>
        </div>
      </main>
    </div>
  )
}

type FirestoreWordDoc = {
  slug?: string
  categoryKey?: string
  payload?: VerbEntry | WordEntry
  updatedAt?: { toDate: () => Date }
  updatedBy?: string
}

type FirestoreHistoryDoc = {
  slug?: string
  action?: HistoryAction
  actor?: string
  payload?: VerbEntry | WordEntry | null
  categoryKey?: string
  timestamp?: Timestamp
  message?: string | null
  restoredFromId?: string | null
}

type LogHistoryParams = {
  slug: string
  actor: string
  action: HistoryAction
  payload?: VerbEntry | WordEntry | null
  categoryKey?: VocabularyDataKey
  message?: string | null
  restoredFromId?: string | null
}

type PersistWordParams = {
  slug: string
  payload: VerbEntry | WordEntry
  categoryKey: VocabularyDataKey
  actor: string
  action: HistoryAction
  message?: string | null
  restoredFromId?: string | null
}

function deriveSlug(payload: Record<string, unknown>): string {
  const primary = typeof payload.infinitive === 'string' ? payload.infinitive : payload.italian
  if (!primary || typeof primary !== 'string') {
    return ''
  }
  // Return the word as-is, normalized to lowercase
  return primary.toLowerCase().trim()
}

async function persistWordWithHistory({
  slug,
  payload,
  categoryKey,
  actor,
  action,
  message,
  restoredFromId,
}: PersistWordParams) {
  await setDoc(
    doc(wordsCollectionRef, slug),
    {
      slug,
      categoryKey,
      payload,
      updatedAt: serverTimestamp(),
      updatedBy: actor,
    },
    { merge: true },
  )

  await logHistoryEntry({
    slug,
    actor,
    action,
    payload,
    categoryKey,
    message,
    restoredFromId,
  })
}

async function logHistoryEntry({ slug, actor, action, payload, categoryKey, message, restoredFromId }: LogHistoryParams) {
  const historyRef = collection(doc(wordsCollectionRef, slug), 'history')
  await addDoc(historyRef, {
    slug,
    actor,
    action,
    payload: payload ?? null,
    categoryKey: categoryKey ?? null,
    message: message ?? null,
    restoredFromId: restoredFromId ?? null,
    timestamp: serverTimestamp(),
  })
}

async function resolveTranslationTaskBySlug(slug: string, actor: string) {
  if (!slug) return
  try {
    await deleteDoc(doc(translationQueueCollectionRef, slug))
  } catch (err) {
    console.error('Failed to auto-resolve translation task', err)
  }
}

function inferCategoryFromWord(word: string): VocabularyDataKey {
  const normalized = word.toLowerCase()
  if (normalized.endsWith('are') || normalized.endsWith('ere') || normalized.endsWith('ire')) {
    return 'verbs'
  }
  return 'commonNouns'
}

function buildEntryFromTask(task: TranslationTask, category: VocabularyDataKey): GenericEntry {
  if (category === 'verbs') {
    return {
      infinitive: task.displayWord || task.word,
      english: '',
      present: [],
      past: [],
      presentContinuous: [],
      usage: task.context ?? task.storyTitle ?? '',
      examples: task.context ? [task.context] : [],
    }
  }
  return {
    italian: task.displayWord || task.word,
    english: '',
    forms: [],
    gender: '',
    plural: '',
    type: '',
    usage: task.context ?? task.storyTitle ?? '',
    examples: task.context ? [task.context] : [],
  }
}

function downloadTextFile(content: string, filename: string) {
  const blob = new Blob([content], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat('tr-TR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

function LoadingState({ message }: { message: string }) {
  return (
    <div className="flex h-screen flex-col items-center justify-center gap-4 bg-gray-50 text-gray-900">
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-gray-300 border-t-blue-600" />
      <p>{message}</p>
    </div>
  )
}

function SignInHero({ onSignIn }: { onSignIn: () => void }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-gray-50 px-4 text-center text-gray-900">
      <p className="text-sm font-medium text-gray-600">Admin Access</p>
      <h1 className="text-4xl font-semibold">Google hesabınızla giriş yapın</h1>
      <p className="max-w-xl text-gray-700">
        Kelime veri kümesini güncellemek için yalnızca yetkili Google hesapları erişebilir. Giriş yaptıktan sonra Firestore ile senkron çalışan
        yönetim paneline yönlendirileceksiniz.
      </p>
      <button
        onClick={onSignIn}
        className="rounded-lg bg-blue-600 px-6 py-3 text-sm font-semibold text-white shadow-lg hover:bg-blue-700"
      >
        🔐 Google ile giriş yap
      </button>
    </main>
  )
}

function UnauthorizedState({ user, onSignOut }: { user: User; onSignOut: () => void }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-gray-50 px-4 text-center text-gray-900">
      <h1 className="text-3xl font-semibold">Erişim izni yok</h1>
      <p className="max-w-lg text-gray-700">
        {user.email} hesabı admin listesinde yer almıyor. Lütfen proje sahibinden erişim izni isteyin veya farklı bir hesapla giriş yapın.
      </p>
      <button
        onClick={onSignOut}
        className="rounded-lg border border-gray-300 bg-white px-6 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
      >
        Hesaptan çık
      </button>
    </main>
  )
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-gray-50 px-4 text-center text-gray-900">
      <h1 className="text-3xl font-semibold">Bir hata oluştu</h1>
      <p className="text-gray-700">{message}</p>
      <button
        onClick={onRetry}
        className="rounded-lg border border-gray-300 bg-white px-6 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
      >
        Tekrar dene
      </button>
    </main>
  )
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <div className="text-3xl font-semibold text-gray-900">{value}</div>
      <p className="text-xs uppercase tracking-[0.4em] text-gray-500">{label}</p>
    </div>
  )
}

const HISTORY_LABELS: Record<HistoryAction, string> = {
  create: 'Oluşturuldu',
  update: 'Güncellendi',
  delete: 'Silindi',
  restore: 'Versiyona dönüldü',
  import: 'İçe aktarıldı',
}

type StructuredFieldType = 'text' | 'textarea' | 'array'

type StructuredField = {
  key: string
  label: string
  type: StructuredFieldType
  placeholder?: string
  helperText?: string
  only?: 'verb' | 'word'
}

const STRUCTURED_FIELDS: StructuredField[] = [
  { key: 'infinitive', label: 'Infinitive', type: 'text', placeholder: 'essere', only: 'verb' },
  { key: 'italian', label: 'İtalyanca', type: 'text', placeholder: 'casa', only: 'word' },
  { key: 'english', label: 'İngilizce', type: 'text', placeholder: 'house' },
  {
    key: 'present',
    label: 'Şimdiki zaman (satır satır)',
    type: 'array',
    helperText: 'Her satıra bir çekim yazın',
    only: 'verb',
  },
  {
    key: 'past',
    label: 'Geçmiş zaman (satır satır)',
    type: 'array',
    helperText: 'Her satıra bir birleşik çekim yazın',
    only: 'verb',
  },
  {
    key: 'presentContinuous',
    label: 'Devamlı zaman (satır satır)',
    type: 'array',
    helperText: 'Her satıra bir yapı yazın',
    only: 'verb',
  },
  {
    key: 'forms',
    label: 'Alternatif formlar',
    type: 'array',
    helperText: 'Satır başı veya virgül ile ayırabilirsiniz',
    only: 'word',
  },
  { key: 'gender', label: 'Cins (örn. m/f)', type: 'text', only: 'word' },
  { key: 'plural', label: 'Çoğul', type: 'text', only: 'word' },
  { key: 'type', label: 'Tür', type: 'text', only: 'word' },
  { key: 'usage', label: 'Kullanım / Not', type: 'textarea' },
  {
    key: 'examples',
    label: 'Örnek cümleler',
    type: 'array',
    helperText: 'Her satıra bir örnek yazın',
  },
]

type StructuredFormProps = {
  category: VocabularyDataKey
  entry: GenericEntry | null
  onChange: (key: string, value: string, type: StructuredFieldType) => void
  onReset: () => void
  onTranslate?: () => void
}

function StructuredForm({ category, entry, onChange, onReset, onTranslate }: StructuredFormProps) {
  const isVerb = category === 'verbs'
  const visibleFields = STRUCTURED_FIELDS.filter((field) => {
    if (!field.only) return true
    if (field.only === 'verb') return isVerb
    if (field.only === 'word') return !isVerb
    return true
  })

  return (
    <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-gray-700">Basit Form</label>
        <div className="flex gap-2">
          {onTranslate && (
            <button
              type="button"
              onClick={onTranslate}
              className="text-sm text-gray-600 hover:text-gray-900"
              title="Yapay zeka ile çevir"
            >
              ✨
            </button>
          )}
          <button
            type="button"
            onClick={onReset}
            className="text-sm text-gray-600 hover:text-gray-900"
          >
            Alanları sıfırla
          </button>
        </div>
      </div>
      <div className="mt-3 grid gap-3">
        {visibleFields.map((field) => {
          const value = getFieldDisplayValue(entry, field.key, field.type)

          return (
            <div key={field.key}>
              <p className="text-sm font-medium text-gray-700">{field.label}</p>
              {field.type === 'text' ? (
                <input
                  key={field.key}
                  value={value}
                  placeholder={field.placeholder}
                  onChange={(event: ChangeEvent<HTMLInputElement>) =>
                    onChange(field.key, event.target.value, field.type)
                  }
                  type="text"
                  className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900"
                />
              ) : (
                <textarea
                  key={field.key}
                  value={value}
                  placeholder={field.placeholder}
                  onChange={(event: ChangeEvent<HTMLTextAreaElement>) =>
                    onChange(field.key, event.target.value, field.type)
                  }
                  className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900"
                  rows={field.type === 'array' ? 3 : 4}
                />
              )}
              {field.helperText && <p className="mt-1 text-xs text-gray-500">{field.helperText}</p>}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function getFieldDisplayValue(entry: GenericEntry | null, key: string, type: StructuredFieldType): string {
  if (!entry || entry[key] === undefined || entry[key] === null) {
    return ''
  }
  const raw = entry[key]
  if (type === 'array') {
    if (Array.isArray(raw)) {
      return raw.join('\n')
    }
    if (typeof raw === 'string') {
      return raw
    }
    return ''
  }
  if (typeof raw === 'string') {
    return raw
  }
  return Array.isArray(raw) ? raw.join(', ') : ''
}

function createDefaultEntry(categoryKey: VocabularyDataKey): GenericEntry {
  if (categoryKey === 'verbs') {
    return {
      infinitive: '',
      english: '',
      present: [],
      past: [],
      presentContinuous: [],
      examples: [],
    }
  }
  return {
    italian: '',
    english: '',
    forms: [],
    gender: '',
    plural: '',
    type: '',
    usage: '',
    examples: [],
  }
}
