import { findWordInVocabulary, type WordMatch, type VocabularyData } from './vocabulary'

export const ARTICLES = ['il', 'lo', 'la', 'i', 'gli', 'le', "l'", 'un', 'uno', 'una', "un'"] as const
export const ARTICULATED_PREPOSITIONS = [
  'del',
  'dello',
  'della',
  'dei',
  'degli',
  'delle',
  'al',
  'allo',
  'alla',
  'ai',
  'agli',
  'alle',
  'dal',
  'dallo',
  'dalla',
  'dai',
  'dagli',
  'dalle',
  'nel',
  'nello',
  'nella',
  'nei',
  'negli',
  'nelle',
  'sul',
  'sullo',
  'sulla',
  'sui',
  'sugli',
  'sulle',
] as const

export type FrequencyWord = {
  rank: number
  word: string
  count: number
  inVocabulary: boolean
  vocabInfo?: WordMatch | null
}

export type FrequencyResults = {
  totalWords: number
  uniqueWords: number
  words: FrequencyWord[]
  knownWords: number
  unknownWords: number
}

export const SAMPLE_FREQUENCY_TEXT = `Il mio nome è Marco e vivo a Roma con la mia famiglia. Ogni giorno vado al lavoro in autobus.
Mi piace molto il mio lavoro perché incontro molte persone interessanti.
La sera torno a casa e ceno con mia moglie e i miei figli.
Nel weekend ci piace andare al parco o visitare i musei della città.
Roma è una città bellissima con molta storia e cultura.
Ci sono molti ristoranti dove si può mangiare cibo tradizionale italiano.`

export function analyzeFrequencyText(text: string, vocabulary: VocabularyData): FrequencyResults {
  const words = combineArticles(tokenizeText(text))
  const wordCount: Record<string, number> = {}

  words.forEach((word) => {
    wordCount[word] = (wordCount[word] ?? 0) + 1
  })

  const sortedEntries = Object.entries(wordCount).sort((a, b) => b[1] - a[1])

  const wordsWithStatus: FrequencyWord[] = sortedEntries.map(([word, count], index) => {
    const normalized = removeLeadingArticle(word)
    const vocabInfo = findWordInVocabulary(normalized, vocabulary)
    return {
      rank: index + 1,
      word,
      count,
      inVocabulary: Boolean(vocabInfo),
      vocabInfo,
    }
  })

  const knownWords = wordsWithStatus.filter((entry) => entry.inVocabulary).length
  const unknownWords = wordsWithStatus.length - knownWords

  return {
    totalWords: words.length,
    uniqueWords: sortedEntries.length,
    words: wordsWithStatus,
    knownWords,
    unknownWords,
  }
}

function tokenizeText(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[.,;:!?()[\]{}""«»—–]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter((word) => word.length > 0)
    .filter((word) => !/^\d+$/.test(word))
}

function combineArticles(rawWords: string[]): string[] {
  const combined: string[] = []

  for (let i = 0; i < rawWords.length; i += 1) {
    const current = rawWords[i]
    const next = rawWords[i + 1]

    if (current && next && ARTICLES.includes(current as (typeof ARTICLES)[number])) {
      if (!ARTICLES.includes(next as (typeof ARTICLES)[number]) && !ARTICULATED_PREPOSITIONS.includes(next as (typeof ARTICULATED_PREPOSITIONS)[number])) {
        combined.push(`${current} ${next}`)
        i += 1
        continue
      }
    }

    if (current && next && ARTICULATED_PREPOSITIONS.includes(current as (typeof ARTICULATED_PREPOSITIONS)[number])) {
      if (!ARTICLES.includes(next as (typeof ARTICLES)[number]) && !ARTICULATED_PREPOSITIONS.includes(next as (typeof ARTICULATED_PREPOSITIONS)[number])) {
        combined.push(`${current} ${next}`)
        i += 1
        continue
      }
    }

    combined.push(current)
  }

  return combined
}

function removeLeadingArticle(word: string): string {
  const articlePattern = /^(il|lo|la|i|gli|le|un|uno|una|l')\s+/
  return word.replace(articlePattern, '').trim()
}
