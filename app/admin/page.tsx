'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore'
import { signInWithPopup, signOut } from 'firebase/auth'
import type { User } from 'firebase/auth'

import { useFirebaseAuth } from '@/hooks/useFirebaseAuth'
import { auth, db, googleProvider } from '@/lib/firebase/client'
import {
  CATEGORY_OPTIONS,
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

type WordRecord = {
  id: string
  slug: string
  categoryKey: VocabularyDataKey
  payload: VerbEntry | WordEntry
  updatedAt?: Date
  updatedBy?: string
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
  const [saveStatus, setSaveStatus] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<VocabularyDataKey | 'all'>('all')
  const [seedInProgress, setSeedInProgress] = useState(false)

  const isAuthorized = useMemo(() => {
    if (!user) return false
    if (ADMIN_EMAILS.length === 0) return true
    return ADMIN_EMAILS.includes((user.email || '').toLowerCase())
  }, [user])

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
        const docs: WordRecord[] = snapshot.docs.map((docSnap) => {
          const data = docSnap.data() as FirestoreWordDoc
          return {
            id: docSnap.id,
            slug: data.slug ?? docSnap.id,
            categoryKey: (data.categoryKey as VocabularyDataKey) ?? 'commonNouns',
            payload: data.payload ?? {},
            updatedAt: data.updatedAt ? data.updatedAt.toDate() : undefined,
            updatedBy: data.updatedBy,
          }
        })
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
    setFormJson('')
    setFormSlug('')
    setSaveStatus(null)
  }

  const handleSelectWord = (record: WordRecord) => {
    setSelectedWord(record)
    setEditorMode('edit')
    setFormCategory(record.categoryKey)
    setFormSlug(record.slug)
    setFormJson(JSON.stringify(record.payload, null, 2))
    setSaveStatus(null)
  }

  const handleNewWord = () => {
    resetEditor()
  }

  const handleSaveWord = async () => {
    if (!user) return
    setSaving(true)
    setSaveStatus(null)
    try {
      const parsed = JSON.parse(formJson || '{}')
      const derivedSlug = formSlug.trim() || deriveSlug(parsed)
      if (!derivedSlug) {
        throw new Error('Slug / temel anahtar belirlenemedi. Lütfen "Slug" alanını doldurun.')
      }

      const docRef = doc(wordsCollectionRef, derivedSlug)
      await setDoc(
        docRef,
        {
          slug: derivedSlug,
          categoryKey: formCategory,
          payload: parsed,
          updatedAt: serverTimestamp(),
          updatedBy: user.email || user.uid,
        },
        { merge: true },
      )
      setSaveStatus('✅ Kelime kaydedildi')
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
      const operations: Promise<unknown>[] = []
      ;(Object.keys(normalized) as VocabularyDataKey[]).forEach((key) => {
        normalized[key].forEach((entry) => {
          const slug = deriveSlug(entry)
          if (!slug) return
          operations.push(
            setDoc(
              doc(wordsCollectionRef, slug),
              {
                slug,
                categoryKey: key,
                payload: entry,
                updatedAt: serverTimestamp(),
                updatedBy: user.email || user.uid,
              },
              { merge: true },
            ),
          )
        })
      })
      await Promise.all(operations)
      setSaveStatus('📥 Local words.json Firestore ile senkronize edildi')
    } catch (err) {
      console.error('Seed failed', err)
      setSaveStatus(err instanceof Error ? err.message : 'İçe aktarma başarısız oldu')
    } finally {
      setSeedInProgress(false)
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
                onChange={(event) => setFormCategory(event.target.value as VocabularyDataKey)}
              >
                {VOCABULARY_DATA_OPTIONS.map((option) => (
                  <option key={option.key} value={option.key}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold uppercase tracking-[0.4em] text-white/50">JSON İçeriği</label>
              <textarea
                className="mt-2 min-h-[260px] w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 font-mono text-sm text-emerald-50"
                placeholder={`{\n  "infinitive": "essere",\n  "english": "to be"\n}`}
                value={formJson}
                onChange={(event) => setFormJson(event.target.value)}
              />
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
          <p className="mt-2 text-sm text-white/70">
            Her kelime için Git benzeri bir geçmiş ağacı burada gösterilecek. Firestore sub-collection mimarisi için backend yapılandırması
            sıradaki adımda tamamlanacak.
          </p>
          <ul className="mt-4 space-y-3 text-sm text-white/60">
            <li>• Her kayıt güncellemesinde otomatik versiyon oluşturma</li>
            <li>• Kullanıcı bazlı imzalama</li>
            <li>• Tek tıkla önceki versiyona dönme</li>
          </ul>
          <p className="mt-4 rounded-2xl border border-amber-300/40 bg-amber-200/10 p-4 text-amber-100">
            Not: Geçmiş sistemi henüz etkin değil. Bir sonraki iterasyonda Firestore `wordHistory` koleksiyonları ve geri alma işlemleri eklenecek.
          </p>
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

function deriveSlug(payload: Record<string, unknown>): string {
  const primary = typeof payload.infinitive === 'string' ? payload.infinitive : payload.italian
  if (!primary || typeof primary !== 'string') {
    return ''
  }
  return slugify(primary)
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
