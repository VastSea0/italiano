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
  const totalTranslationPages = useMemo(() => {
    const pending = translationTasks.filter((task) => task.status !== 'resolved')
    return Math.ceil(pending.length / translationPageSize)
  }, [translationTasks, translationPageSize])
  const paginatedTranslationTasks = useMemo(() => {
    const pending = translationTasks.filter((task) => task.status !== 'resolved')
    return pending.slice(
      (translationPage - 1) * translationPageSize,
      translationPage * translationPageSize,
    )
  }, [translationTasks, translationPage, translationPageSize])
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
  const pendingTranslationTasks = useMemo(
    () => translationTasks.filter((task) => task.status !== 'resolved'),
    [translationTasks],
  )
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
    setFormSlug(task.slug)
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
      await setDoc(
        doc(translationQueueCollectionRef, taskId),
        {
          status: 'resolved',
          resolvedAt: serverTimestamp(),
          resolvedBy: user?.email || user?.uid || 'unknown',
        },
        { merge: true },
      )
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
    <main className="mx-auto max-w-6xl px-4 py-10 lg:py-16">
      <header className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-2xl backdrop-blur">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.5em] text-brand-200">Admin Console</p>
            <h1 className="mt-1 text-3xl font-semibold text-white">Vocabulary Control Center</h1>
            <p className="mt-1 text-sm text-white/70">
              {words.length} kayıt izleniyor · Son güncelleme{' '}
              {words[0]?.updatedAt ? formatDate(words[0].updatedAt) : 'bilinmiyor'}
            </p>
          </div>
          <div className="flex flex-col items-start gap-2 rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-white/80 sm:items-end">
            <div>{user.email}</div>
            <div className="text-white/60">UID: {user.uid}</div>
            <button
              className="rounded-full border border-white/20 px-4 py-1 text-xs font-semibold uppercase tracking-[0.3em] text-white/80"
              onClick={handleSignOut}
            >
              Çıkış yap
            </button>
          </div>
        </div>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Toplam Kayıt" value={words.length} accent="from-brand-500/30" />
          <StatCard label="Verbs" value={dataset.verbs.length} accent="from-emerald-500/30" />
          <StatCard label="Nouns" value={dataset.commonNouns.length} accent="from-amber-500/30" />
          <StatCard label="Pronouns" value={dataset.pronouns.length} accent="from-sky-500/30" />
        </div>
      </header>

      <section className="mt-10 rounded-3xl border border-amber-300/30 bg-amber-200/10 p-6 shadow-2xl backdrop-blur">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.5em] text-amber-200">Çeviri Kuyruğu</p>
            <h2 className="text-2xl font-semibold text-white">🚨 Öncelikli Kelimeler</h2>
            <p className="text-sm text-white/70">Story bölümünden gelen ve henüz sözlükte olmayan kelimeler.</p>
          </div>
          <div className="flex gap-2">
            <span className="rounded-full border border-amber-200/50 px-4 py-1 text-xs font-semibold uppercase tracking-[0.3em] text-amber-100">
              Bekleyen: {pendingTranslationTasks.length}
            </span>
            <span className="rounded-full border border-white/10 px-4 py-1 text-xs font-semibold uppercase tracking-[0.3em] text-white/60">
              Tamamlanan: {translationTasks.length - pendingTranslationTasks.length}
            </span>
          </div>
        </div>

        <div className="mt-6 space-y-4">
          {translationLoading && <p className="text-sm text-white/60">Kuyruk yükleniyor…</p>}
          {translationError && <p className="text-sm text-red-300">{translationError}</p>}
          {!translationLoading && !translationError && pendingTranslationTasks.length === 0 && (
            <p className="text-sm text-white/60">Şu anda bekleyen çeviri isteği yok. Harika!</p>
          )}
          {paginatedTranslationTasks.map((task) => (
            <div key={task.id} className="rounded-2xl border border-white/10 bg-slate-950/40 p-4 text-white/80">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-lg font-semibold text-white">{task.displayWord}</p>
                  <p className="text-xs text-white/50">Slug: {task.slug}</p>
                  {task.storyTitle && <p className="text-xs text-white/60">Hikâye: {task.storyTitle}</p>}
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => handleAdoptTranslationTask(task)}
                    className="rounded-full border border-brand-300/40 bg-brand-400/20 px-4 py-2 text-xs font-semibold text-brand-50"
                  >
                    Formda aç
                  </button>
                  <button
                    type="button"
                    onClick={() => handleResolveTranslationTask(task.slug)}
                    disabled={resolvingTaskId === task.slug}
                    className="rounded-full border border-white/20 px-4 py-2 text-xs font-semibold text-white/80 disabled:opacity-60"
                  >
                    {resolvingTaskId === task.slug ? 'Kapanıyor…' : 'Tamamlandı'}
                  </button>
                </div>
              </div>
              {task.context && <p className="mt-3 text-xs text-white/60">{task.context}</p>}
            </div>
          ))}
        </div>

        {totalTranslationPages > 1 && (
          <div className="mt-6 flex justify-center gap-2">
            <button onClick={() => setTranslationPage(Math.max(1, translationPage - 1))} disabled={translationPage === 1} className="rounded-full border border-white/20 px-4 py-2 text-xs font-semibold text-white/80 disabled:opacity-60">Önceki</button>
            <span className="text-sm text-white/60">{translationPage} / {totalTranslationPages}</span>
            <button onClick={() => setTranslationPage(Math.min(totalTranslationPages, translationPage + 1))} disabled={translationPage === totalTranslationPages} className="rounded-full border border-white/20 px-4 py-2 text-xs font-semibold text-white/80 disabled:opacity-60">Sonraki</button>
          </div>
        )}

        {recentResolvedTasks.length > 0 && (
          <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-4 text-xs text-white/60">
            <p className="text-white/80">Son tamamlananlar:</p>
            <ul className="mt-2 space-y-1">
              {recentResolvedTasks.map((task) => (
                <li key={`resolved-${task.id}`}>{task.displayWord}</li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section className="mt-10 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-2xl backdrop-blur">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-2xl font-semibold text-white">Kelime Kayıtları</h2>
              <p className="text-sm text-white/60">Firestore içeriğini canlı olarak izleyin</p>
            </div>
            <div className="flex gap-2">
              <button
                className="rounded-full border border-white/20 bg-white/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-white/80 hover:bg-white/20"
                onClick={handleNewWord}
              >
                + Yeni kayıt
              </button>
              <button
                className="rounded-full border border-brand-300/50 bg-brand-400/20 px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-brand-50 disabled:opacity-50"
                onClick={handleSeedFromLocal}
                disabled={seedInProgress || saving}
              >
                {seedInProgress ? 'İçe aktarılıyor...' : 'words.json içe aktar'}
              </button>
            </div>
          </div>

          <div className="mt-4 flex flex-col gap-3 sm:flex-row">
            <input
              type="text"
              className="w-full rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-2 text-white placeholder:text-white/40"
              placeholder="Kelime veya slug ara..."
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
            />
            <select
              className="rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-2 text-white"
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

          <div className="mt-4 max-h-[520px] overflow-y-auto rounded-2xl border border-white/5 bg-slate-900/40">
            <table className="w-full text-left text-sm text-white/80">
              <thead className="sticky top-0 bg-slate-950/70 text-xs uppercase tracking-[0.3em] text-white/40">
                <tr>
                  <th className="px-4 py-3">Slug</th>
                  <th className="px-4 py-3">Kategori</th>
                  <th className="px-4 py-3">Son Güncelleme</th>
                  <th className="px-4 py-3">Güncelleyen</th>
                </tr>
              </thead>
              <tbody>
                {loadingWords && (
                  <tr>
                    <td colSpan={4} className="px-4 py-6 text-center text-white/60">
                      Firestore verisi yükleniyor...
                    </td>
                  </tr>
                )}

                {!loadingWords && filteredWords.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-6 text-center text-white/60">
                      Kayıt bulunamadı.
                    </td>
                  </tr>
                )}

                {filteredWords.map((record) => (
                  <tr
                    key={record.slug}
                    className={`cursor-pointer border-t border-white/5 transition hover:bg-white/5 ${
                      selectedWord?.slug === record.slug ? 'bg-white/10' : ''
                    }`}
                    onClick={() => handleSelectWord(record)}
                  >
                    <td className="px-4 py-3 font-semibold text-white">{record.slug}</td>
                    <td className="px-4 py-3 text-white/70">{KEY_TO_CATEGORY_NAME[record.categoryKey]}</td>
                    <td className="px-4 py-3 text-white/60">{record.updatedAt ? formatDate(record.updatedAt) : '—'}</td>
                    <td className="px-4 py-3 text-white/60">{record.updatedBy || '---'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {wordsError && <p className="mt-4 text-sm text-red-300">{wordsError}</p>}
        </div>

        <div className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-2xl backdrop-blur">
          <h2 className="text-2xl font-semibold text-white">
            {editorMode === 'create' ? 'Yeni Kelime' : `Düzenle: ${selectedWord?.slug || ''}`}
          </h2>
          <p className="text-sm text-white/70">words.json şemasına birebir uyan JSON verisi kullanın.</p>

          <form className="mt-4 space-y-4" onSubmit={(event) => event.preventDefault()}>
            <div>
              <label className="text-xs font-semibold uppercase tracking-[0.4em] text-white/50">Slug (zorunlu)</label>
              <input
                type="text"
                className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-2 text-white"
                placeholder="örn. essere"
                value={formSlug}
                onChange={(event) => setFormSlug(event.target.value)}
              />
              <p className="mt-1 text-xs text-white/50">Boş bırakırsanız infinitive/italian alanından otomatik üretilir.</p>
            </div>

            <div>
              <label className="text-xs font-semibold uppercase tracking-[0.4em] text-white/50">Kategori</label>
              <select
                className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-2 text-white"
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
              <label className="text-xs font-semibold uppercase tracking-[0.4em] text-white/50">JSON İçeriği</label>
              <textarea
                className="mt-2 min-h-[260px] w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 font-mono text-sm text-emerald-50"
                placeholder={`{\n  "infinitive": "essere",\n  "english": "to be"\n}`}
                value={formJson}
                onChange={(event) => handleJsonChange(event.target.value)}
              />
              {jsonError && <p className="mt-2 text-xs text-red-300">{jsonError}</p>}
              {!jsonError && (
                <p className="mt-2 text-xs text-white/50">Form alanlarını kullanarak yaptığınız değişiklikler otomatik olarak JSON'a işlenir.</p>
              )}
            </div>

            {saveStatus && <p className="text-sm text-white/80">{saveStatus}</p>}

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={handleSaveWord}
                disabled={saving}
                className="inline-flex flex-1 items-center justify-center rounded-2xl bg-brand-500 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-brand-900/40 disabled:opacity-60"
              >
                {saving ? 'Kaydediliyor…' : 'Kaydet'}
              </button>
              <button
                type="button"
                onClick={resetEditor}
                className="inline-flex flex-1 items-center justify-center rounded-2xl border border-white/20 bg-white/5 px-4 py-3 text-sm font-semibold text-white/80"
              >
                Temizle
              </button>
              {editorMode === 'edit' && (
                <button
                  type="button"
                  onClick={handleDeleteWord}
                  className="inline-flex flex-1 items-center justify-center rounded-2xl border border-red-400/50 bg-red-500/10 px-4 py-3 text-sm font-semibold text-red-100"
                >
                  Sil
                </button>
              )}
            </div>
          </form>
        </div>
      </section>

      <section className="mt-10 grid gap-6 lg:grid-cols-2">
        <div className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-2xl backdrop-blur">
          <h3 className="text-2xl font-semibold text-white">words.json Snapshot</h3>
          <p className="text-sm text-white/70">Tek tuşla indirip dışa aktarabilirsiniz.</p>
          <div className="mt-4 flex gap-3">
            <button
              className="rounded-full border border-white/20 bg-white/10 px-5 py-2 text-sm font-semibold text-white hover:bg-white/20"
              onClick={handleDownloadJson}
            >
              📦 JSON indir
            </button>
            <Link
              href="/"
              className="rounded-full border border-white/20 bg-white/5 px-5 py-2 text-sm font-semibold text-white/80 hover:text-white"
            >
              🎯 Ana siteyi aç
            </Link>
          </div>
          <pre className="mt-4 max-h-[360px] overflow-y-auto rounded-2xl border border-white/5 bg-slate-950/60 p-4 text-xs text-emerald-50">
            {wordsJsonString}
          </pre>
        </div>

        <div className="rounded-3xl border border-dashed border-white/20 bg-white/0 p-6">
          <h3 className="text-2xl font-semibold text-white">📜 Değişiklik Geçmişi</h3>
          {!selectedWord && (
            <p className="mt-2 text-sm text-white/70">Geçmişi incelemek için tablodan bir kelime seçin.</p>
          )}

          {selectedWord && (
            <>
              <p className="mt-1 text-sm text-white/60">
                {selectedWord.slug} için son {historyEntries.length} değişiklik · kategori {KEY_TO_CATEGORY_NAME[selectedWord.categoryKey]}
              </p>

              {historyLoading && <p className="mt-4 text-sm text-white/60">Geçmiş yükleniyor…</p>}
              {historyError && <p className="mt-4 text-sm text-red-300">{historyError}</p>}
              {!historyLoading && !historyError && historyEntries.length === 0 && (
                <p className="mt-4 text-sm text-white/60">Henüz geçmiş kaydı bulunmuyor.</p>
              )}

              <ul className="mt-4 space-y-4">
                {historyEntries.map((entry) => (
                  <li key={entry.id} className="rounded-2xl border border-white/10 bg-slate-950/40 p-4 text-white/80">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-sm font-semibold text-white">
                          {HISTORY_LABELS[entry.action]}{' '}
                          <span className="text-xs font-normal text-white/50">· {entry.actor || 'Bilinmiyor'}</span>
                        </p>
                        <p className="text-xs uppercase tracking-[0.3em] text-white/40">
                          {entry.timestamp ? formatDate(entry.timestamp) : 'Bekleniyor'}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        {entry.restoredFromId && (
                          <span className="rounded-full border border-white/10 px-3 py-1 text-xs text-white/70">
                            ← {entry.restoredFromId}
                          </span>
                        )}
                        <button
                          className="rounded-full border border-white/20 px-3 py-1 text-xs font-semibold text-white/80 disabled:opacity-40"
                          disabled={!entry.payload || restoringVersionId === entry.id}
                          onClick={() => handleRestoreVersion(entry)}
                        >
                          {restoringVersionId === entry.id ? 'Yükleniyor...' : 'Versiyona dön'}
                        </button>
                      </div>
                    </div>
                    {entry.message && <p className="mt-2 text-xs text-white/60">{entry.message}</p>}
                    {entry.payload && (
                      <pre className="mt-3 max-h-48 overflow-y-auto rounded-xl border border-white/5 bg-slate-900/60 p-3 text-xs text-emerald-50">
                        {JSON.stringify(entry.payload, null, 2)}
                      </pre>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </section>
    </main>
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
  return slugify(primary)
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
    await setDoc(
      doc(translationQueueCollectionRef, slug),
      {
        status: 'resolved',
        resolvedAt: serverTimestamp(),
        resolvedBy: actor,
      },
      { merge: true },
    )
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
    <div className="flex h-screen flex-col items-center justify-center gap-4 bg-slate-950 text-white/80">
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-white/20 border-t-brand-400" />
      <p>{message}</p>
    </div>
  )
}

function SignInHero({ onSignIn }: { onSignIn: () => void }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 px-4 text-center text-white">
      <p className="text-xs font-semibold uppercase tracking-[0.5em] text-brand-200">Admin Access</p>
      <h1 className="text-4xl font-semibold">Google hesabınızla giriş yapın</h1>
      <p className="max-w-xl text-white/70">
        Kelime veri kümesini güncellemek için yalnızca yetkili Google hesapları erişebilir. Giriş yaptıktan sonra Firestore ile senkron çalışan
        yönetim paneline yönlendirileceksiniz.
      </p>
      <button
        onClick={onSignIn}
        className="rounded-full bg-white/90 px-6 py-3 text-sm font-semibold text-slate-900 shadow-lg shadow-brand-900/30"
      >
        🔐 Google ile giriş yap
      </button>
    </main>
  )
}

function UnauthorizedState({ user, onSignOut }: { user: User; onSignOut: () => void }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-950 px-4 text-center text-white">
      <h1 className="text-3xl font-semibold">Erişim izni yok</h1>
      <p className="max-w-lg text-white/70">
        {user.email} hesabı admin listesinde yer almıyor. Lütfen proje sahibinden erişim izni isteyin veya farklı bir hesapla giriş yapın.
      </p>
      <button
        onClick={onSignOut}
        className="rounded-full border border-white/20 bg-white/5 px-6 py-2 text-sm font-semibold text-white/80"
      >
        Hesaptan çık
      </button>
    </main>
  )
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-950 px-4 text-center text-white">
      <h1 className="text-3xl font-semibold">Bir hata oluştu</h1>
      <p className="text-white/70">{message}</p>
      <button
        onClick={onRetry}
        className="rounded-full border border-white/20 bg-white/5 px-6 py-2 text-sm font-semibold text-white/80"
      >
        Tekrar dene
      </button>
    </main>
  )
}

function StatCard({ label, value, accent }: { label: string; value: number; accent: string }) {
  return (
    <div className={`rounded-2xl border border-white/5 bg-gradient-to-br ${accent} via-white/5 to-transparent p-4 text-white`}>
      <div className="text-3xl font-semibold">{value}</div>
      <p className="text-xs uppercase tracking-[0.4em] text-white/50">{label}</p>
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
    <div className="rounded-2xl border border-white/10 bg-slate-950/30 p-4">
      <div className="flex items-center justify-between">
        <label className="text-xs font-semibold uppercase tracking-[0.4em] text-white/50">Basit Form</label>
        <div className="flex gap-2">
          {onTranslate && (
            <button
              type="button"
              onClick={onTranslate}
              className="text-xs font-semibold text-white/60 hover:text-white"
              title="Yapay zeka ile çevir"
            >
              ✨
            </button>
          )}
          <button
            type="button"
            onClick={onReset}
            className="text-xs font-semibold text-white/60 hover:text-white"
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
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-white/50">{field.label}</p>
              {field.type === 'text' ? (
                <input
                  key={field.key}
                  value={value}
                  placeholder={field.placeholder}
                  onChange={(event: ChangeEvent<HTMLInputElement>) =>
                    onChange(field.key, event.target.value, field.type)
                  }
                  type="text"
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-2 text-white"
                />
              ) : (
                <textarea
                  key={field.key}
                  value={value}
                  placeholder={field.placeholder}
                  onChange={(event: ChangeEvent<HTMLTextAreaElement>) =>
                    onChange(field.key, event.target.value, field.type)
                  }
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-2 text-white"
                  rows={field.type === 'array' ? 3 : 4}
                />
              )}
              {field.helperText && <p className="mt-1 text-xs text-white/40">{field.helperText}</p>}
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
