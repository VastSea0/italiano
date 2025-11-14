'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  addDoc,
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
} from 'firebase/firestore'
import { signInWithPopup, signOut, type User } from 'firebase/auth'

import { useVocabularyResources } from '@/hooks/useVocabularyResources'
import { useFirebaseAuth } from '@/hooks/useFirebaseAuth'
import { auth, db, googleProvider } from '@/lib/firebase/client'
import {
  buildFlashcardDeck,
  computeSm2,
  previewIntervals,
  selectNextCard,
  upsertProgress,
  type Flashcard,
  type FlashcardProgress,
} from '@/lib/flashcards'

const QUALITY_OPTIONS: { value: number; label: string; description: string; color: string }[] = [
  { value: 1, label: 'Again', description: 'Tekrarla', color: 'border-red-400/40 bg-red-500/10 text-red-100' },
  { value: 3, label: 'Hard', description: 'Zor', color: 'border-amber-400/40 bg-amber-500/10 text-amber-100' },
  { value: 4, label: 'Good', description: 'İyi', color: 'border-emerald-400/40 bg-emerald-500/10 text-emerald-100' },
  { value: 5, label: 'Easy', description: 'Kolay', color: 'border-sky-400/40 bg-sky-500/10 text-sky-100' },
]

const createInitialSession = (): SessionStats => ({
  startedAt: null,
  responses: 0,
  again: 0,
  hard: 0,
  good: 0,
  easy: 0,
  cardIds: [],
})

export default function FlashcardsPage() {
  const { user, initializing, error: authError } = useFirebaseAuth()
  const { vocabulary, loading: vocabLoading, error: vocabularyError, reload } = useVocabularyResources({ includeStories: false })
  const [progressMap, setProgressMap] = useState<Record<string, FlashcardProgress>>({})
  const [progressLoading, setProgressLoading] = useState(false)
  const [sessionStats, setSessionStats] = useState<SessionStats>(createInitialSession())
  const [sessionHistory, setSessionHistory] = useState<FlashcardSession[]>([])
  const [cardSeed, setCardSeed] = useState(0)
  const [showAnswer, setShowAnswer] = useState(false)
  const [grading, setGrading] = useState(false)
  const [sessionMessage, setSessionMessage] = useState<string | null>(null)
  const [savingSession, setSavingSession] = useState(false)

  useEffect(() => {
    if (!user) {
      setProgressMap({})
      setProgressLoading(false)
      setSessionHistory([])
      return
    }

    setProgressLoading(true)
    const progressRef = collection(db, 'users', user.uid, 'flashcards')
    const unsubscribe = onSnapshot(
      progressRef,
      (snapshot) => {
        const next: Record<string, FlashcardProgress> = {}
        snapshot.forEach((docSnap) => {
          const data = docSnap.data() as FirestoreProgressDoc
          next[docSnap.id] = {
            slug: docSnap.id,
            interval: data.interval ?? 0,
            repetition: data.repetition ?? 0,
            easeFactor: data.easeFactor ?? 2.5,
            dueDate: data.dueDate ? data.dueDate.toDate().toISOString() : data.dueDateIso ?? new Date().toISOString(),
            lastReviewedAt: data.lastReviewedAt ? data.lastReviewedAt.toDate().toISOString() : undefined,
            lapses: data.lapses ?? 0,
            streak: data.streak ?? 0,
          }
        })
        setProgressMap(next)
        setProgressLoading(false)
      },
      (err) => {
        console.error('Progress subscription failed', err)
        setProgressLoading(false)
      },
    )

    return () => unsubscribe()
  }, [user])

  useEffect(() => {
    if (!user) {
      setSessionHistory([])
      return
    }
    const sessionsRef = collection(db, 'users', user.uid, 'sessions')
    const sessionsQuery = query(sessionsRef, orderBy('startedAt', 'desc'), limit(12))
    const unsubscribe = onSnapshot(
      sessionsQuery,
      (snapshot) => {
        const logs: FlashcardSession[] = snapshot.docs.map((docSnap) => {
          const data = docSnap.data() as FirestoreSessionDoc
          return {
            id: docSnap.id,
            reviews: data.reviews ?? 0,
            uniqueCards: data.uniqueCards ?? data.reviews ?? 0,
            accuracy: data.accuracy ?? 0,
            streakAfter: data.streakAfter ?? 0,
            again: data.again ?? 0,
            hard: data.hard ?? 0,
            good: data.good ?? 0,
            easy: data.easy ?? 0,
            durationMinutes: data.durationMinutes ?? 0,
            startedAt: data.startedAt ? data.startedAt.toDate() : undefined,
            endedAt: data.endedAt ? data.endedAt.toDate() : undefined,
          }
        })
        setSessionHistory(logs)
      },
      (err) => {
        console.error('Session subscription failed', err)
      },
    )
    return () => unsubscribe()
  }, [user])

  useEffect(() => {
    if (!user) return
    ensureUserDocument(user).catch((err) => console.error('Failed to upsert user profile', err))
  }, [user])

  const deck = useMemo(() => buildFlashcardDeck(vocabulary), [vocabulary])
  const currentCard = useMemo(() => selectNextCard(deck, progressMap), [deck, progressMap, cardSeed])
  const intervalPreview = useMemo(() => {
    if (!currentCard) return {}
    const results = previewIntervals(progressMap[currentCard.slug])
    return results.reduce<Record<number, IntervalPreview>>((acc, result) => {
      acc[result.quality] = { interval: result.interval, status: result.status }
      return acc
    }, {})
  }, [currentCard, progressMap])

  const dueCount = useMemo(() => getDueCount(deck, progressMap), [deck, progressMap])
  const newCount = useMemo(() => deck.filter((card) => !progressMap[card.slug]).length, [deck, progressMap])
  const reviewCount = Math.max(deck.length - newCount, 0)

  const handleReveal = () => {
    setShowAnswer(true)
    setSessionMessage(null)
  }

  const handleGradeCard = async (quality: number) => {
    if (!user || !currentCard || grading) return
    setGrading(true)
    setSessionMessage(null)
    try {
      const existingProgress = progressMap[currentCard.slug]
      const sm2 = computeSm2(existingProgress, quality)
      const nextProgress = upsertProgress(currentCard.slug, existingProgress, sm2)
      setProgressMap((prev) => ({ ...prev, [currentCard.slug]: nextProgress }))
      updateSessionStats(quality, currentCard.slug)
      await persistProgress(user, currentCard.slug, nextProgress)
      setShowAnswer(false)
      setCardSeed((prev) => prev + 1)
    } catch (err) {
      console.error('Failed to record flashcard answer', err)
      setSessionMessage('Cevap kaydedilemedi. Lütfen tekrar deneyin.')
    } finally {
      setGrading(false)
    }
  }

  const handleEndSession = async () => {
    if (!user) return
    if (sessionStats.responses === 0 || savingSession) {
      setSessionMessage('Oturumu kaydetmek için en az bir kart yanıtlayın.')
      return
    }

    setSavingSession(true)
    try {
      const startedAt = sessionStats.startedAt ?? new Date()
      const endedAt = new Date()
      const durationMinutes = Math.max(Math.round((endedAt.getTime() - startedAt.getTime()) / 60000), 1)
      const uniqueCards = new Set(sessionStats.cardIds).size
      const accuracy = (sessionStats.good + sessionStats.easy) / sessionStats.responses
      const streakAfter = computeNextStreak(sessionHistory, endedAt)
      const sessionsRef = collection(db, 'users', user.uid, 'sessions')
      await addDoc(sessionsRef, {
        userId: user.uid,
        reviews: sessionStats.responses,
        uniqueCards,
        again: sessionStats.again,
        hard: sessionStats.hard,
        good: sessionStats.good,
        easy: sessionStats.easy,
        accuracy: Number(accuracy.toFixed(2)),
        durationMinutes,
        startedAt: Timestamp.fromDate(startedAt),
        endedAt: Timestamp.fromDate(endedAt),
        streakAfter,
        createdAt: serverTimestamp(),
      })
      setSessionMessage('Oturum kaydedildi ✅')
      setSessionStats(createInitialSession())
    } catch (err) {
      console.error('Failed to save session', err)
      setSessionMessage('Oturum kaydedilemedi. Lütfen tekrar deneyin.')
    } finally {
      setSavingSession(false)
    }
  }

  const handleSignIn = () => {
    signInWithPopup(auth, googleProvider).catch((err) => console.error('Google sign-in failed', err))
  }

  const handleSignOut = () => {
    signOut(auth).catch((err) => console.error('Sign-out failed', err))
  }

  const updateSessionStats = useCallback((quality: number, slug: string) => {
    setSessionStats((prev) => {
      const base = prev.startedAt ? prev.startedAt : new Date()
      const next: SessionStats = {
        startedAt: prev.startedAt ?? base,
        responses: prev.responses + 1,
        again: prev.again + (quality <= 1 ? 1 : 0),
        hard: prev.hard + (quality === 3 ? 1 : 0),
        good: prev.good + (quality === 4 ? 1 : 0),
        easy: prev.easy + (quality === 5 ? 1 : 0),
        cardIds: [...prev.cardIds, slug],
      }
      return next
    })
  }, [])

  const deckReady = deck.length > 0
  const needsAuth = !initializing && !user

  return (
    <main className="mx-auto max-w-5xl px-4 py-10 lg:py-16">
      <header className="rounded-3xl border border-white/10 bg-gradient-to-br from-brand-500/20 via-slate-900/60 to-slate-950/80 p-8 text-white shadow-2xl backdrop-blur">
        <p className="text-xs font-semibold uppercase tracking-[0.5em] text-brand-200">Spaced Repetition</p>
        <h1 className="mt-3 text-4xl font-semibold">Anki tarzı flashcard stüdyosu</h1>
        <p className="mt-3 max-w-2xl text-sm text-white/80">
          SM-2 algoritmasıyla çalışan bu sayfa, her kelimeyi Anki'deki gibi aralıklı tekrar mantığıyla sıraya koyar. Yanıtladığınız her kart ve
          oturum Firestore'a kaydedilir, böylece serilerinizi ve gelişiminizi takip edebilirsiniz.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/"
            className="rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm font-semibold text-white/80 transition hover:bg-white/20"
          >
            ← Vocabulary Hub
          </Link>
          <Link
            href="/frequency"
            className="rounded-full border border-white/10 bg-white px-4 py-2 text-sm font-semibold text-slate-900 shadow-md"
          >
            📊 Frequency Analyzer
          </Link>
          {user ? (
            <button
              onClick={handleSignOut}
              className="rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm font-semibold text-white/80 transition hover:bg-white/20"
            >
              Çıkış yap ({user.email})
            </button>
          ) : (
            <button
              onClick={handleSignIn}
              className="rounded-full border border-white bg-white px-5 py-2 text-sm font-semibold text-slate-900 shadow-lg shadow-brand-900/30"
            >
              🔐 Google ile giriş yap
            </button>
          )}
        </div>
        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          <StatPill label="Toplam kart" value={deck.length} accent="from-brand-500/30" />
          <StatPill label="Bekleyen" value={dueCount} accent="from-amber-500/30" />
          <StatPill label="Yeni kart" value={newCount} accent="from-emerald-500/30" />
        </div>
      </header>

      {needsAuth && (
        <section className="mt-10 rounded-3xl border border-white/10 bg-white/5 p-6 text-white">
          <p className="text-lg font-semibold">Giriş yapmanız gerekiyor</p>
          <p className="mt-2 text-sm text-white/70">Serilerinizi kaydedebilmek için Google hesabınızla giriş yapın.</p>
          <button
            className="mt-4 inline-flex items-center rounded-full bg-white px-5 py-2 text-sm font-semibold text-slate-900"
            onClick={handleSignIn}
          >
            Google ile giriş yap
          </button>
        </section>
      )}

      {!needsAuth && (
        <section className="mt-10 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-3xl border border-white/10 bg-white/5 p-6 text-white shadow-2xl backdrop-blur">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-2xl font-semibold">🎯 Aktif kart</h2>
                <p className="text-sm text-white/60">Anki SM-2 algoritmasıyla belirlendi.</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowAnswer(false)
                  setCardSeed((prev) => prev + 1)
                  setSessionMessage(null)
                }}
                className="rounded-full border border-white/20 px-4 py-2 text-sm font-semibold text-white/70"
                disabled={!deckReady}
              >
                Başka kart getir
              </button>
            </div>

            <div className="mt-6 min-h-[280px] rounded-3xl border border-white/10 bg-slate-950/40 p-6">
              {!deckReady && (
                <div className="flex h-full items-center justify-center text-sm text-white/60">
                  {vocabLoading ? 'Kelime listesi yükleniyor...' : vocabularyError || 'Gösterilecek kart bulunamadı.'}
                </div>
              )}

              {deckReady && currentCard && (
                <div className="flex h-full flex-col">
                  <p className="text-xs uppercase tracking-[0.3em] text-white/40">{currentCard.categoryLabel}</p>
                  <div className="mt-3 text-4xl font-semibold text-white">{currentCard.prompt}</div>
                  {currentCard.extra && <p className="mt-2 text-sm text-white/60">{currentCard.extra}</p>}

                  {showAnswer ? (
                    <div className="mt-6 flex-1 rounded-2xl border border-emerald-400/30 bg-emerald-500/10 p-4">
                      <p className="text-sm uppercase tracking-[0.3em] text-emerald-200">Cevap</p>
                      <p className="mt-2 text-2xl font-semibold text-white">{currentCard.answer}</p>
                      {currentCard.examples && currentCard.examples.length > 0 && (
                        <ul className="mt-3 space-y-1 text-sm text-white/70">
                          {currentCard.examples.slice(0, 2).map((example) => (
                            <li key={example}>• {example}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ) : (
                    <div className="mt-6 flex flex-1 items-center justify-center rounded-2xl border border-white/10 bg-white/5">
                      <button
                        className="rounded-full bg-white px-6 py-3 text-sm font-semibold text-slate-900 shadow-lg"
                        onClick={handleReveal}
                      >
                        Cevabı göster
                      </button>
                    </div>
                  )}

                  {sessionMessage && <p className="mt-4 text-sm text-amber-200">{sessionMessage}</p>}

                  {showAnswer && (
                    <div className="mt-6 grid gap-3 sm:grid-cols-2">
                      {QUALITY_OPTIONS.map((option) => (
                        <button
                          key={option.value}
                          className={`rounded-2xl border px-4 py-3 text-left text-sm font-semibold transition ${option.color} ${grading ? 'opacity-60' : ''}`}
                          onClick={() => handleGradeCard(option.value)}
                          disabled={grading}
                        >
                          <div className="flex items-center justify-between">
                            <span>
                              {option.label}
                              <span className="ml-2 text-xs font-normal text-white/60">{option.description}</span>
                            </span>
                            <span className="text-xs text-white/60">{formatIntervalPreview(intervalPreview[option.value])}</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="space-y-6">
            <div className="rounded-3xl border border-white/10 bg-white/5 p-6 text-white shadow-2xl">
              <h3 className="text-xl font-semibold">⏱️ Oturum durumu</h3>
              <p className="mt-1 text-sm text-white/70">
                {sessionStats.responses > 0
                  ? `${sessionStats.responses} kart yanıtladınız · doğruluk ${formatPercent((sessionStats.good + sessionStats.easy) / sessionStats.responses)}`
                  : 'Hemen başlayın, verdiğiniz cevaplar burada toplanacak.'}
              </p>
              <dl className="mt-4 grid grid-cols-2 gap-4 text-sm">
                <div>
                  <dt className="text-white/50">Tekrar</dt>
                  <dd className="text-2xl font-semibold text-white">{sessionStats.again}</dd>
                </div>
                <div>
                  <dt className="text-white/50">Zor</dt>
                  <dd className="text-2xl font-semibold text-white">{sessionStats.hard}</dd>
                </div>
                <div>
                  <dt className="text-white/50">İyi</dt>
                  <dd className="text-2xl font-semibold text-white">{sessionStats.good}</dd>
                </div>
                <div>
                  <dt className="text-white/50">Kolay</dt>
                  <dd className="text-2xl font-semibold text-white">{sessionStats.easy}</dd>
                </div>
              </dl>
              <button
                className="mt-5 w-full rounded-2xl bg-brand-500 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-brand-900/40"
                onClick={handleEndSession}
                disabled={savingSession}
              >
                {savingSession ? 'Kaydediliyor…' : 'Oturumu kaydet'}
              </button>
              <button
                className="mt-3 w-full rounded-2xl border border-white/20 px-4 py-2 text-sm font-semibold text-white/80"
                onClick={() => setSessionStats(createInitialSession())}
              >
                İstatistikleri sıfırla
              </button>
            </div>

            <div className="rounded-3xl border border-white/10 bg-white/5 p-6 text-white shadow-2xl">
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-semibold">🧭 Son oturumlar</h3>
                <button
                  className="text-xs font-semibold uppercase tracking-[0.3em] text-white/50"
                  onClick={() => reload()}
                >
                  Yenile
                </button>
              </div>
              {sessionHistory.length === 0 ? (
                <p className="mt-3 text-sm text-white/60">Henüz kaydedilmiş bir oturum yok.</p>
              ) : (
                <ul className="mt-4 space-y-3 text-sm text-white/80">
                  {sessionHistory.map((session) => (
                    <li key={session.id} className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
                      <div className="flex flex-col gap-2">
                        <div className="flex items-center justify-between text-xs uppercase tracking-[0.3em] text-white/40">
                          <span>{formatDate(session.startedAt)}</span>
                          <span>Seri: {session.streakAfter ?? 1}</span>
                        </div>
                        <div className="text-lg font-semibold text-white">
                          {session.reviews} kart · {formatPercent(session.accuracy)} doğruluk
                        </div>
                        <div className="text-xs text-white/60">
                          {session.durationMinutes} dk · {session.uniqueCards} benzersiz kelime
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </section>
      )}
    </main>
  )
}

type SessionStats = {
  startedAt: Date | null
  responses: number
  again: number
  hard: number
  good: number
  easy: number
  cardIds: string[]
}

type FlashcardSession = {
  id: string
  reviews: number
  uniqueCards: number
  accuracy: number
  streakAfter?: number
  again: number
  hard: number
  good: number
  easy: number
  durationMinutes: number
  startedAt?: Date
  endedAt?: Date
}

type FirestoreProgressDoc = {
  interval?: number
  repetition?: number
  easeFactor?: number
  dueDate?: Timestamp
  dueDateIso?: string
  lastReviewedAt?: Timestamp
  lapses?: number
  streak?: number
}

type FirestoreSessionDoc = {
  reviews?: number
  uniqueCards?: number
  accuracy?: number
  streakAfter?: number
  again?: number
  hard?: number
  good?: number
  easy?: number
  durationMinutes?: number
  startedAt?: Timestamp
  endedAt?: Timestamp
}

type IntervalPreview = {
  interval: number
  status: 'learning' | 'review'
}

async function persistProgress(user: User, slug: string, progress: FlashcardProgress) {
  const userDocRef = doc(db, 'users', user.uid)
  await setDoc(
    userDocRef,
    {
      email: user.email ?? null,
      displayName: user.displayName ?? null,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  )

  const progressRef = doc(db, 'users', user.uid, 'flashcards', slug)
  await setDoc(
    progressRef,
    {
      slug,
      interval: progress.interval,
      repetition: progress.repetition,
      easeFactor: progress.easeFactor,
      dueDate: Timestamp.fromDate(new Date(progress.dueDate)),
      dueDateIso: progress.dueDate,
      lastReviewedAt: serverTimestamp(),
      lapses: progress.lapses ?? 0,
      streak: progress.streak ?? 0,
    },
    { merge: true },
  )
}

async function ensureUserDocument(user: User) {
  const userDocRef = doc(db, 'users', user.uid)
  await setDoc(
    userDocRef,
    {
      email: user.email ?? null,
      displayName: user.displayName ?? null,
      photoURL: user.photoURL ?? null,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  )
}

function formatIntervalPreview(preview?: IntervalPreview) {
  if (!preview) return '—'
  return `${preview.status === 'learning' ? '⏱' : '📅'} ${formatInterval(preview.interval)}`
}

function formatInterval(intervalDays: number) {
  if (intervalDays <= 0) return 'şimdi'
  if (intervalDays === 1) return '1 gün'
  if (intervalDays < 7) return `${intervalDays} gün`
  if (intervalDays < 30) return `${Math.round(intervalDays / 7)} hf`
  return `${Math.round(intervalDays / 30)} ay`
}

function formatPercent(value: number) {
  if (!Number.isFinite(value)) return '0%'
  return `${Math.round(value * 100)}%`
}

function getDueCount(deck: Flashcard[], progressMap: Record<string, FlashcardProgress>) {
  const now = Date.now()
  return deck.filter((card) => {
    const progress = progressMap[card.slug]
    if (!progress?.dueDate) return false
    return new Date(progress.dueDate).getTime() <= now
  }).length
}

function formatDate(date?: Date) {
  if (!date) return '—'
  return new Intl.DateTimeFormat('tr-TR', { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

function computeNextStreak(history: FlashcardSession[], endedAt: Date) {
  if (history.length === 0 || !history[0].endedAt) {
    return 1
  }
  const last = history[0]
  const diffDays = calculateDayDiff(endedAt, last.endedAt ?? endedAt)
  if (diffDays === 0) {
    return last.streakAfter ?? 1
  }
  if (diffDays === 1) {
    return (last.streakAfter ?? 1) + 1
  }
  return 1
}

function calculateDayDiff(current: Date, prev: Date) {
  const diffMs = current.getTime() - prev.getTime()
  return Math.floor(diffMs / 86_400_000)
}
