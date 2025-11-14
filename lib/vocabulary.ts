export type VerbEntry = {
  infinitive: string
  english: string
  present?: string[]
  past?: string[]
  presentContinuous?: string[]
  [key: string]: unknown
}

export type WordEntry = {
  italian: string
  english: string
  forms?: string[]
  gender?: string
  plural?: string
  type?: string
  usage?: string
  category?: string
  examples?: string[]
  [key: string]: unknown
}

export type VocabularyData = {
  verbs: VerbEntry[]
  conjunctions: WordEntry[]
  adjectives: WordEntry[]
  adverbs: WordEntry[]
  prepositions: WordEntry[]
  timeExpressions: WordEntry[]
  pronouns: WordEntry[]
  commonNouns: WordEntry[]
}

export type VocabularyPayload = {
  mostCommonItalianVerbsA1?: VerbEntry[]
  conjunctions?: WordEntry[]
  adjectives?: WordEntry[]
  adverbs?: WordEntry[]
  prepositions?: WordEntry[]
  timeExpressions?: WordEntry[]
  pronouns?: WordEntry[]
  commonNouns?: WordEntry[]
}

export type StorySentence = {
  sentence_id: number
  sentence_text: string
}

export type Story = {
  story_id: number
  story_title: string
  story_level: string
  total_sentences: number
  story_data: StorySentence[]
}

export type RawStoryPayload = {
  stories?: Story[]
} | Story | undefined

export type VocabularyCategory =
  | 'all'
  | 'verbs'
  | 'nouns'
  | 'adjectives'
  | 'adverbs'
  | 'pronouns'
  | 'prepositions'
  | 'conjunctions'
  | 'time'

export type ConjugationFilter = 'all' | 'infinitive' | 'present' | 'past' | 'presentContinuous'

export const CATEGORY_LABELS: Record<VocabularyCategory, string> = {
  all: 'All Vocabulary',
  verbs: 'Verbs',
  nouns: 'Nouns',
  adjectives: 'Adjectives',
  adverbs: 'Adverbs',
  pronouns: 'Pronouns',
  prepositions: 'Prepositions',
  conjunctions: 'Conjunctions',
  time: 'Time Expressions',
}

const CATEGORY_TO_KEY: Record<Exclude<VocabularyCategory, 'all'>, keyof VocabularyData> = {
  verbs: 'verbs',
  nouns: 'commonNouns',
  adjectives: 'adjectives',
  adverbs: 'adverbs',
  pronouns: 'pronouns',
  prepositions: 'prepositions',
  conjunctions: 'conjunctions',
  time: 'timeExpressions',
}

const KEY_TO_CATEGORY_NAME: Record<keyof VocabularyData, string> = {
  verbs: 'Verb',
  conjunctions: 'Conjunction',
  adjectives: 'Adjective',
  adverbs: 'Adverb',
  prepositions: 'Preposition',
  timeExpressions: 'Time Expression',
  pronouns: 'Pronoun',
  commonNouns: 'Noun',
}

export const CATEGORY_OPTIONS: { value: VocabularyCategory; label: string; icon: string }[] = [
  { value: 'all', label: 'All Vocabulary', icon: '✨' },
  { value: 'verbs', label: 'Verbs', icon: '🔸' },
  { value: 'nouns', label: 'Nouns', icon: '📦' },
  { value: 'adjectives', label: 'Adjectives', icon: '🎨' },
  { value: 'adverbs', label: 'Adverbs', icon: '⚡' },
  { value: 'pronouns', label: 'Pronouns', icon: '👤' },
  { value: 'prepositions', label: 'Prepositions', icon: '🔗' },
  { value: 'conjunctions', label: 'Conjunctions', icon: '🌉' },
  { value: 'time', label: 'Time', icon: '⏰' },
]

export const DEFAULT_STORY: Story = {
  story_id: 0,
  story_title: 'Story not available',
  story_level: 'A1',
  total_sentences: 0,
  story_data: [],
}

export function createEmptyVocabulary(): VocabularyData {
  return {
    verbs: [],
    conjunctions: [],
    adjectives: [],
    adverbs: [],
    prepositions: [],
    timeExpressions: [],
    pronouns: [],
    commonNouns: [],
  }
}

export function normalizeVocabularyData(payload: VocabularyPayload | undefined): VocabularyData {
  const safePayload = payload ?? {}
  return {
    verbs: Array.isArray(safePayload.mostCommonItalianVerbsA1) ? safePayload.mostCommonItalianVerbsA1 : [],
    conjunctions: Array.isArray(safePayload.conjunctions) ? safePayload.conjunctions : [],
    adjectives: Array.isArray(safePayload.adjectives) ? safePayload.adjectives : [],
    adverbs: Array.isArray(safePayload.adverbs) ? safePayload.adverbs : [],
    prepositions: Array.isArray(safePayload.prepositions) ? safePayload.prepositions : [],
    timeExpressions: Array.isArray(safePayload.timeExpressions) ? safePayload.timeExpressions : [],
    pronouns: Array.isArray(safePayload.pronouns) ? safePayload.pronouns : [],
    commonNouns: Array.isArray(safePayload.commonNouns) ? safePayload.commonNouns : [],
  }
}

export function extractStories(payload: RawStoryPayload): Story[] {
  if (!payload) {
    return [DEFAULT_STORY]
  }

  if (Array.isArray((payload as { stories?: Story[] }).stories)) {
    const stories = (payload as { stories?: Story[] }).stories
    return stories && stories.length > 0 ? stories : [DEFAULT_STORY]
  }

  const singleStory = payload as Story
  if (singleStory && singleStory.story_data) {
    return [singleStory]
  }

  return [DEFAULT_STORY]
}

export type VocabularyStats = {
  totalWords: number
  totalWordForms: number
  verbs: number
  nouns: number
  adjectives: number
  adverbs: number
  pronouns: number
  prepositions: number
  conjunctions: number
  timeExpressions: number
}

export function calculateVocabularyStats(data: VocabularyData): VocabularyStats {
  const stats: VocabularyStats = {
    verbs: data.verbs.length,
    nouns: data.commonNouns.length,
    adjectives: data.adjectives.length,
    adverbs: data.adverbs.length,
    pronouns: data.pronouns.length,
    prepositions: data.prepositions.length,
    conjunctions: data.conjunctions.length,
    timeExpressions: data.timeExpressions.length,
    totalWords: 0,
    totalWordForms: 0,
  }

  stats.totalWords =
    stats.verbs +
    stats.nouns +
    stats.adjectives +
    stats.adverbs +
    stats.pronouns +
    stats.prepositions +
    stats.conjunctions +
    stats.timeExpressions

  let forms = 0
  data.verbs.forEach((verb) => {
    forms += 1
    forms += Array.isArray(verb.present) ? verb.present.length : 0
    forms += Array.isArray(verb.past) ? verb.past.length : 0
    forms += Array.isArray(verb.presentContinuous) ? verb.presentContinuous.length : 0
  })
  forms += stats.nouns * 2
  forms += stats.adjectives * 2
  forms += stats.adverbs + stats.pronouns + stats.prepositions + stats.conjunctions + stats.timeExpressions

  stats.totalWordForms = forms
  return stats
}

export type FilteredVocabulary = Partial<VocabularyData>

export function filterVocabularyByCategory(
  data: VocabularyData,
  category: VocabularyCategory,
  englishFilter: string,
  italianFilter: string,
): FilteredVocabulary {
  const englishValue = englishFilter.trim().toLowerCase()
  const italianValue = italianFilter.trim().toLowerCase()

  const keys: (keyof VocabularyData)[] =
    category === 'all' ? (Object.keys(data) as (keyof VocabularyData)[]) : [CATEGORY_TO_KEY[category]]

  const filteredEntries: FilteredVocabulary = {}

  keys.forEach((key) => {
    const items = (data[key] ?? []) as (VerbEntry[] | WordEntry[])
    filteredEntries[key] = items.filter((item) => {
      const englishText = (item as WordEntry).english ?? ''
      const italianText = (item as VerbEntry).infinitive ?? (item as WordEntry).italian ?? ''
      const matchesEnglish = !englishValue || englishText.toLowerCase().includes(englishValue)
      const matchesItalian = !italianValue || italianText.toLowerCase().includes(italianValue)
      return matchesEnglish && matchesItalian
    }) as never
  })

  return filteredEntries
}

export type WordMatch = {
  key: string
  english: string
  type: string
  matchType?: string
  infinitive?: string
  isMultiple?: boolean
  allMatches?: WordMatch[]
}

export function findWordInVocabulary(word: string, vocabulary: VocabularyData): WordMatch | null {
  if (!word) {
    return null
  }

  const cleanWord = word.toLowerCase().trim()
  const matches: WordMatch[] = []

  vocabulary.verbs.forEach((verb) => {
    let matchType: string | null = null

    if (verb.infinitive && verb.infinitive.toLowerCase() === cleanWord) {
      matchType = 'infinitive'
    }

    if (!matchType && Array.isArray(verb.present)) {
      for (const form of verb.present) {
        if (!form) continue
        const formLower = form.toLowerCase()
        if (formLower === cleanWord) {
          matchType = 'present tense'
          break
        }
        const words = formLower.split(' ')
        const mainVerb = words[words.length - 1]
        if (mainVerb === cleanWord) {
          matchType = 'present tense'
          break
        }
      }
    }

    if (!matchType && Array.isArray(verb.past)) {
      for (const form of verb.past) {
        if (!form) continue
        const formLower = form.toLowerCase()
        const words = formLower.split(' ')
        const participle = words[words.length - 1]
        if (participle === cleanWord && words.length > 1) {
          matchType = 'past participle'
          break
        }
      }
    }

    if (!matchType && Array.isArray(verb.presentContinuous)) {
      for (const form of verb.presentContinuous) {
        if (!form) continue
        const formLower = form.toLowerCase()
        const words = formLower.split(' ')
        const gerund = words[words.length - 1]
        if (gerund === cleanWord && words.length > 1) {
          matchType = 'gerund'
          break
        }
      }
    }

    if (matchType) {
      matches.push({
        key: verb.infinitive,
        english: verb.english ?? 'N/A',
        type: 'Verb',
        matchType,
        infinitive: verb.infinitive,
      })
    }
  })

  const otherCategories: { key: keyof VocabularyData; type: string }[] = [
    { key: 'conjunctions', type: 'Conjunction' },
    { key: 'adjectives', type: 'Adjective' },
    { key: 'adverbs', type: 'Adverb' },
    { key: 'prepositions', type: 'Preposition' },
    { key: 'timeExpressions', type: 'Time Expression' },
    { key: 'pronouns', type: 'Pronoun' },
    { key: 'commonNouns', type: 'Noun' },
  ]

  otherCategories.forEach((category) => {
    const items = (vocabulary[category.key] ?? []) as WordEntry[]
    items.forEach((item) => {
      if (item.italian && item.italian.toLowerCase() === cleanWord) {
        matches.push({
          key: item.italian,
          english: item.english ?? 'N/A',
          type: category.type,
          matchType: 'exact',
        })
      }

      if (Array.isArray(item.forms)) {
        const hasForm = item.forms.some((form) => form && form.toLowerCase() === cleanWord)
        if (hasForm) {
          matches.push({
            key: item.italian,
            english: item.english ?? 'N/A',
            type: category.type,
            matchType: 'form',
          })
        }
      }
    })
  })

  if (matches.length === 0) {
    return null
  }

  const unique: WordMatch[] = []
  const seen = new Set<string>()
  matches.forEach((match) => {
    const key = `${match.key}|${match.english}|${match.type}`
    if (!seen.has(key)) {
      seen.add(key)
      unique.push(match)
    }
  })

  if (unique.length === 1) {
    return unique[0]
  }

  return {
    key: cleanWord,
    english: unique.map((item) => `${item.english} (${item.type})`).join(' OR '),
    type: 'Multiple meanings',
    matchType: 'multiple',
    isMultiple: true,
    allMatches: unique,
  }
}

export type ExportWord = (VerbEntry | WordEntry) & { category: string }

export function buildExportDataset(
  vocabulary: VocabularyData,
  group: VocabularyCategory,
  conjugation: ConjugationFilter,
): ExportWord[] {
  const includeAll = group === 'all'
  const keys: (keyof VocabularyData)[] = includeAll
    ? (Object.keys(vocabulary) as (keyof VocabularyData)[])
    : [CATEGORY_TO_KEY[group]]

  const dataset: ExportWord[] = []

  keys.forEach((key) => {
    const items = vocabulary[key] ?? []
    items.forEach((item) => {
      if (key === 'verbs') {
        const verb = item as VerbEntry
        const filteredVerb = filterVerbByConjugation(verb, conjugation)
        dataset.push({ ...filteredVerb, category: KEY_TO_CATEGORY_NAME[key] })
      } else {
        dataset.push({ ...(item as WordEntry), category: KEY_TO_CATEGORY_NAME[key] })
      }
    })
  })

  return dataset
}

function filterVerbByConjugation(verb: VerbEntry, conjugation: ConjugationFilter): VerbEntry {
  if (conjugation === 'all') {
    return { ...verb }
  }

  const filtered: VerbEntry = { ...verb }
  if (conjugation !== 'present') {
    delete filtered.present
  }
  if (conjugation !== 'past') {
    delete filtered.past
  }
  if (conjugation !== 'presentContinuous') {
    delete filtered.presentContinuous
  }
  return filtered
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '') || 'export'
}
