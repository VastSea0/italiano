import { KEY_TO_CATEGORY_NAME, slugify, type VocabularyData, type VocabularyDataKey, type VerbEntry, type WordEntry } from '@/lib/vocabulary'

export type Flashcard = {
  slug: string
  prompt: string
  answer: string
  categoryKey: VocabularyDataKey
  categoryLabel: string
  extra?: string | null
  examples?: string[]
}

export type FlashcardProgress = {
  slug: string
  interval: number
  repetition: number
  easeFactor: number
  dueDate: string
  lastReviewedAt?: string
  lapses?: number
  streak?: number
}

export type Sm2Computation = {
  interval: number
  repetition: number
  easeFactor: number
  dueDate: Date
  status: 'learning' | 'review'
  quality: number
}

export const DEFAULT_EASE_FACTOR = 2.5
const MIN_EASE_FACTOR = 1.3

export function buildFlashcardDeck(vocabulary: VocabularyData): Flashcard[] {
  const deck: Flashcard[] = []

  vocabulary.verbs.forEach((verb) => {
    const slug = slugify(verb.infinitive)
    if (!slug) return
    deck.push({
      slug,
      prompt: verb.infinitive,
      answer: verb.english ?? '',
      categoryKey: 'verbs',
      categoryLabel: KEY_TO_CATEGORY_NAME.verbs,
      extra: formatVerbHint(verb),
      examples: normalizeExamples(verb.examples),
    })
  })

  const otherKeys: Exclude<VocabularyDataKey, 'verbs'>[] = [
    'commonNouns',
    'adjectives',
    'adverbs',
    'pronouns',
    'prepositions',
    'conjunctions',
    'timeExpressions',
  ]

  otherKeys.forEach((key) => {
    const entries = vocabulary[key] as WordEntry[]
    entries.forEach((entry) => {
      const slug = slugify(entry.italian)
      if (!slug) return
      deck.push({
        slug,
        prompt: entry.italian,
        answer: entry.english ?? '',
        categoryKey: key,
        categoryLabel: KEY_TO_CATEGORY_NAME[key],
        extra: entry.plural || entry.gender || entry.type || null,
        examples: normalizeExamples(entry.examples),
      })
    })
  })

  return deck
}

export function selectNextCard(
  deck: Flashcard[],
  progressMap: Record<string, FlashcardProgress>,
  now: Date = new Date(),
): Flashcard | null {
  if (deck.length === 0) {
    return null
  }

  const dueCards = deck
    .filter((card) => isCardDue(progressMap[card.slug], now))
    .sort((a, b) => getDueTime(progressMap[a.slug]) - getDueTime(progressMap[b.slug]))

  if (dueCards.length > 0) {
    return dueCards[0]
  }

  const unseen = deck.filter((card) => !progressMap[card.slug])
  if (unseen.length > 0) {
    return unseen[0]
  }

  const scheduled = deck
    .filter((card) => progressMap[card.slug]?.dueDate)
    .sort((a, b) => getDueTime(progressMap[a.slug]) - getDueTime(progressMap[b.slug]))

  return scheduled[0] ?? null
}

export function computeSm2(progress: FlashcardProgress | undefined, quality: number, now: Date = new Date()): Sm2Computation {
  const safeQuality = clampQuality(quality)
  let easeFactor = progress?.easeFactor ?? DEFAULT_EASE_FACTOR
  let repetition = progress?.repetition ?? 0
  let interval = progress?.interval ?? 0

  if (safeQuality < 3) {
    repetition = 0
    interval = 0
  } else {
    if (repetition === 0) {
      interval = 1
    } else if (repetition === 1) {
      interval = 6
    } else {
      interval = Math.round(interval * easeFactor)
    }
    repetition += 1
    easeFactor = easeFactor + (0.1 - (5 - safeQuality) * (0.08 + (5 - safeQuality) * 0.02))
    easeFactor = Math.max(easeFactor, MIN_EASE_FACTOR)
  }

  const dueDate = addDays(now, interval)
  const status: 'learning' | 'review' = repetition <= 1 || safeQuality < 3 ? 'learning' : 'review'

  return {
    interval,
    repetition,
    easeFactor,
    dueDate,
    status,
    quality: safeQuality,
  }
}

export function previewIntervals(progress: FlashcardProgress | undefined, qualities: number[] = [1, 3, 4, 5]) {
  const now = new Date()
  return qualities.map((quality) => {
    const result = computeSm2(progress, quality, now)
    return {
      quality,
      interval: result.interval,
      dueDate: result.dueDate,
      status: result.status,
    }
  })
}

export function upsertProgress(slug: string, progress: FlashcardProgress | undefined, result: Sm2Computation): FlashcardProgress {
  return {
    slug,
    interval: result.interval,
    repetition: result.repetition,
    easeFactor: Number(result.easeFactor.toFixed(2)),
    dueDate: result.dueDate.toISOString(),
    lastReviewedAt: new Date().toISOString(),
    lapses: result.quality < 3 ? (progress?.lapses ?? 0) + 1 : progress?.lapses ?? 0,
    streak: result.quality >= 3 ? (progress?.streak ?? 0) + 1 : 0,
  }
}

function formatVerbHint(verb: VerbEntry): string | null {
  if (verb.present && verb.present.length > 0) {
    return verb.present.slice(0, 3).join(', ')
  }
  if (verb.past && verb.past.length > 0) {
    return verb.past[0]
  }
  return null
}

function isCardDue(progress: FlashcardProgress | undefined, now: Date) {
  if (!progress?.dueDate) return false
  return new Date(progress.dueDate).getTime() <= now.getTime()
}

function getDueTime(progress: FlashcardProgress | undefined) {
  if (!progress?.dueDate) return Number.POSITIVE_INFINITY
  return new Date(progress.dueDate).getTime()
}

function addDays(date: Date, days: number): Date {
  const copy = new Date(date)
  copy.setDate(copy.getDate() + days)
  return copy
}

function clampQuality(quality: number) {
  if (Number.isNaN(quality)) return 0
  return Math.min(Math.max(Math.round(quality), 0), 5)
}

function normalizeExamples(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string')
  }
  if (typeof value === 'string' && value.trim()) {
    return [value]
  }
  return []
}
