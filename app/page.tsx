'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { collection, doc, onSnapshot, orderBy, query, serverTimestamp, setDoc } from 'firebase/firestore'

import { useVocabularyResources } from '@/hooks/useVocabularyResources'
import {
  CATEGORY_LABELS,
  CATEGORY_OPTIONS,
  buildExportDataset,
  calculateVocabularyStats,
  filterVocabularyByCategory,
  findWordInVocabulary,
  slugify,
  type ConjugationFilter,
  type FilteredVocabulary,
  type Story,
  type StorySentence,
  type VocabularyCategory,
  type VocabularyData,
  type WordEntry,
  type WordMatch,
  type VerbEntry,
} from '@/lib/vocabulary'
import { generateVocabularyPDF, type TemplateVariant } from '@/lib/pdf'
import { db } from '@/lib/firebase/client'

type StoryWordSelection = {
  surface: string
  normalized: string
  sentenceText: string
  sentenceId: number
  info: WordMatch | null
}

type StoryWordTrigger = {
  surface: string
  normalized: string
  sentenceText: string
  sentenceId: number
}

type StoryUnknownWord = {
  normalized: string
  surface: string
  count: number
  sentenceText: string
  sentenceId: number
}

type TranslationQueueEntry = {
  id: string
  word: string
  surface?: string | null
  context?: string | null
  storyTitle?: string | null
  sentenceId?: number | null
  status: 'pending' | 'resolved'
  createdAt?: Date
}

type GridState = {
  columns: number
  rows: number
}

const CONJUGATION_OPTIONS: { value: ConjugationFilter; label: string }[] = [
  { value: 'all', label: 'All Tenses' },
  { value: 'infinitive', label: 'Infinitive Only' },
  { value: 'present', label: 'Present Tense' },
  { value: 'past', label: 'Past Tense' },
  { value: 'presentContinuous', label: 'Present Continuous' },
]

const TEMPLATE_OPTIONS: { value: TemplateVariant; label: string; icon: string }[] = [
  { value: 'flashcard', label: 'Flashcard', icon: '🃏' },
  { value: 'table', label: 'Table', icon: '📊' },
  { value: 'list', label: 'List View', icon: '📝' },
]

export default function Home() {
  const { vocabulary, stories, loading, error, reload } = useVocabularyResources()
  const [category, setCategory] = useState<VocabularyCategory>('all')
  const [englishFilter, setEnglishFilter] = useState('')
  const [italianFilter, setItalianFilter] = useState('')
  const [storyIndex, setStoryIndex] = useState(0)
  const [showHints, setShowHints] = useState(false)
  const [selectedWord, setSelectedWord] = useState<StoryWordSelection | null>(null)
  const [isExportOpen, setIsExportOpen] = useState(false)
  const [template, setTemplate] = useState<TemplateVariant>('flashcard')
  const [exportGroup, setExportGroup] = useState<VocabularyCategory>('all')
  const [conjugation, setConjugation] = useState<ConjugationFilter>('all')
  const [grid, setGrid] = useState<GridState>({ columns: 2, rows: 2 })
  const [exporting, setExporting] = useState(false)
  const [translationQueue, setTranslationQueue] = useState<Record<string, TranslationQueueEntry>>({})
  const [flaggingWordId, setFlaggingWordId] = useState<string | null>(null)
  const [flagMessage, setFlagMessage] = useState<string | null>(null)

  useEffect(() => {
    if (storyIndex >= stories.length && stories.length > 0) {
      setStoryIndex(0)
    }
    if (stories.length === 0 && storyIndex !== 0) {
      setStoryIndex(0)
    }
  }, [stories, storyIndex])

  useEffect(() => {
    setSelectedWord(null)
  }, [storyIndex])

  const stats = useMemo(() => calculateVocabularyStats(vocabulary), [vocabulary])
  const filtered = useMemo(
    () => filterVocabularyByCategory(vocabulary, category, englishFilter, italianFilter),
    [vocabulary, category, englishFilter, italianFilter],
  )
  const sections = useMemo(() => buildSections(filtered), [filtered])

  const currentStory: Story | undefined = stories[storyIndex]
  const storySentences = currentStory?.story_data ?? []
  const storyUnknownWords = useMemo(() => collectStoryUnknownWords(storySentences, vocabulary), [storySentences, vocabulary])
  const translationQueueSet = useMemo(() => new Set(Object.keys(translationQueue)), [translationQueue])
  const selectedWordSlug = useMemo(() => {
    if (!selectedWord) return null
    return slugify(selectedWord.normalized || selectedWord.surface)
  }, [selectedWord])
  const selectedWordFlagged = selectedWordSlug ? translationQueueSet.has(selectedWordSlug) : false
  const isFlaggingSelectedWord = selectedWordSlug ? flaggingWordId === selectedWordSlug : false

  useEffect(() => {
    const queueRef = query(collection(db, 'translationQueue'), orderBy('createdAt', 'desc'))
    const unsubscribe = onSnapshot(queueRef, (snapshot) => {
      const map: Record<string, TranslationQueueEntry> = {}
      snapshot.forEach((docSnap) => {
        const data = docSnap.data() as TranslationQueueDoc
        map[docSnap.id] = {
          id: docSnap.id,
          word: data.word ?? docSnap.id,
          surface: data.surface ?? null,
          context: data.context ?? null,
          storyTitle: data.storyTitle ?? null,
          sentenceId: data.sentenceId ?? null,
          status: (data.status as TranslationStatus) ?? 'pending',
          createdAt: data.createdAt ? data.createdAt.toDate() : undefined,
        }
      })
      setTranslationQueue(map)
    })
    return () => unsubscribe()
  }, [])

  const isWordFlagged = (normalized: string) => translationQueueSet.has(slugify(normalized))

  const handleFlagTranslation = async (selection: StoryWordSelection) => {
    if (!selection) return
    const slug = slugify(selection.normalized || selection.surface)
    if (!slug) return
    setFlaggingWordId(slug)
    setFlagMessage(null)
    try {
      await setDoc(
        doc(collection(db, 'translationQueue'), slug),
        {
          word: selection.normalized,
          surface: selection.surface,
          context: selection.sentenceText,
          sentenceId: selection.sentenceId,
          storyId: currentStory?.story_id ?? null,
          storyTitle: currentStory?.story_title ?? null,
          status: 'pending',
          createdAt: serverTimestamp(),
        },
        { merge: true },
      )
      setFlagMessage('Kelime çeviri kuyruğuna alındı.')
    } catch (err) {
      console.error('Failed to queue translation', err)
      setFlagMessage('Kuyruğa eklenemedi. Lütfen tekrar deneyin.')
    } finally {
      setFlaggingWordId(null)
    }
  }

  const handleQuickFlagWord = (word: StoryUnknownWord) => {
    handleFlagTranslation({
      surface: word.surface,
      normalized: word.normalized,
      sentenceText: word.sentenceText,
      sentenceId: word.sentenceId,
      info: null,
    })
  }

  const handleSelectWord = (word: StoryWordTrigger) => {
    const match = findWordInVocabulary(word.normalized, vocabulary)
    setSelectedWord({ ...word, info: match })
    setFlagMessage(null)
  }

  const toggleHints = () => setShowHints((prev) => !prev)

  const handleOpenModal = () => {
    setExportGroup(category)
    setIsExportOpen(true)
  }

  const handleGeneratePDF = async () => {
    try {
      setExporting(true)
      const dataset = buildExportDataset(vocabulary, exportGroup, conjugation)
      if (dataset.length === 0) {
        alert('No words match your current export filters.')
        return
      }

      await generateVocabularyPDF({
        template,
        wordGroupLabel: CATEGORY_LABELS[exportGroup],
        conjugationLabel: CONJUGATION_OPTIONS.find((option) => option.value === conjugation)?.label ?? 'All Tenses',
        grid,
        data: dataset,
      })
      setIsExportOpen(false)
    } catch (err) {
      console.error(err)
      alert('Unable to generate PDF. Please try again.')
    } finally {
      setExporting(false)
    }
  }

  const gridPreview = `${grid.columns * grid.rows} flashcards per page (${grid.columns}×${grid.rows})`

  return (
    <main className="mx-auto max-w-6xl px-4 py-10 lg:py-16">
      <section className="rounded-3xl border border-white/10 bg-white/5 p-8 text-center shadow-2xl backdrop-blur">
        <p className="text-xs font-semibold uppercase tracking-[0.5em] text-brand-200">Italiano Studio</p>
        <h1 className="mt-4 text-4xl font-semibold text-white sm:text-5xl">
          Italian Vocabulary Intelligence Hub
        </h1>
        <p className="mx-auto mt-4 max-w-3xl text-base text-white/70">
          Explore 500+ high-frequency Italian words, drill conjugations, and connect everything to real stories.
          Switch between the vocabulary browser and the frequency analyzer with a single click.
        </p>
        <nav className="mt-8 flex flex-wrap justify-center gap-3">
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-full border border-white bg-white px-5 py-2 text-sm font-semibold text-slate-900 shadow-lg shadow-brand-900/30"
          >
            📚 Vocabulary Browser
          </Link>
          <Link
            href="/frequency"
            className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/5 px-5 py-2 text-sm font-semibold text-white/80 transition hover:border-white/50 hover:text-white"
          >
            📊 Frequency Analyzer
          </Link>
        </nav>
      </section>

      <section className="mt-8 grid gap-6 lg:grid-cols-3">
        <div className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-2xl backdrop-blur lg:col-span-2">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.5em] text-brand-200">Live coverage</p>
              <h2 className="text-2xl font-semibold text-white">Vocabulary Intelligence Dashboard</h2>
            </div>
            <button
              className="inline-flex items-center justify-center rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:border-white/60 hover:bg-white/20"
              onClick={() => reload()}
            >
              🔄 Refresh Data
            </button>
          </div>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <StatCard label="Total Words" value={stats.totalWords} accent="from-brand-500/40" />
            <StatCard label="Word Forms" value={stats.totalWordForms} accent="from-sky-500/40" />
            <StatCard label="Verbs" value={stats.verbs} accent="from-emerald-500/40" />
            <StatCard label="Nouns" value={stats.nouns} accent="from-amber-500/40" />
            <StatCard label="Adjectives" value={stats.adjectives} accent="from-purple-500/40" />
            <StatCard label="Adverbs" value={stats.adverbs} accent="from-pink-500/40" />
          </div>
        </div>

        <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-brand-500/30 via-brand-400/20 to-brand-300/20 p-6 shadow-2xl backdrop-blur">
          <h3 className="text-xl font-semibold text-white">Custom PDF Blueprints</h3>
          <p className="mt-2 text-sm text-white/80">
            Export tailored flashcards, tables, or study lists for any subset of the vocabulary bank.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <button
              className="inline-flex flex-1 items-center justify-center rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-slate-900 shadow-lg shadow-brand-900/30"
              onClick={handleOpenModal}
            >
              📥 Export Vocabulary
            </button>
            <button
              className="inline-flex flex-1 items-center justify-center rounded-2xl border border-white/30 bg-white/5 px-4 py-3 text-sm font-semibold text-white/80"
              onClick={handleGeneratePDF}
              disabled={exporting}
            >
              ⚙️ Quick Generate
            </button>
          </div>
        </div>
      </section>

      <section className="story-section">
        <div className="flex flex-col gap-2 text-white">
          <h3 className="text-2xl font-semibold">📖 Interactive Story Reader</h3>
          <p className="text-white/80">Click any word in the story to reveal meanings, conjugations, and usage notes.</p>
        </div>
        <div className="story-container">
          <div className="story-selector">
            <div className="flex-1">
              <label className="text-xs font-semibold uppercase tracking-[0.3em] text-white/60" htmlFor="storySelect">
                Choose a story
              </label>
              <select
                id="storySelect"
                value={storyIndex}
                onChange={(event) => setStoryIndex(Number(event.target.value))}
              >
                {stories.map((story, index) => (
                  <option key={story.story_id} value={index}>
                    {index + 1}. {story.story_title}
                  </option>
                ))}
              </select>
            </div>
            <div className="story-navigation">
              <button className="nav-btn" disabled={storyIndex === 0} onClick={() => setStoryIndex((prev) => Math.max(0, prev - 1))}>
                ← Previous
              </button>
              <button
                className="nav-btn"
                disabled={storyIndex >= stories.length - 1}
                onClick={() => setStoryIndex((prev) => Math.min(Math.max(stories.length - 1, 0), prev + 1))}
              >
                Next →
              </button>
            </div>
          </div>
          <div className="story-controls">
            <div className="story-info">
              <span>Level: {currentStory?.story_level ?? 'A1'}</span>
              <span className="mx-2 text-white/40">•</span>
              <span>
                {storySentences.length}/{currentStory?.total_sentences ?? storySentences.length} sentences
              </span>
            </div>
            <button className="story-toggle" onClick={toggleHints}>
              {showHints ? 'Hide Hints' : 'Show Hints'}
            </button>
          </div>
          <div className="story-title">{currentStory?.story_title ?? 'Loading story...'}</div>
          <div className="space-y-2">
            {storySentences.length === 0 && <div className="no-results">No stories available.</div>}
            {storySentences.map((sentence) => (
              <p key={sentence.sentence_id} className="story-sentence">
                {renderSentence(sentence, showHints, handleSelectWord, vocabulary)}
              </p>
            ))}
          </div>
          {selectedWord && (
            <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-4 text-white/90">
              <p className="text-sm uppercase tracking-[0.4em] text-white/50">Selected</p>
              <h4 className="mt-1 text-2xl font-semibold text-white">{selectedWord.surface}</h4>
              {selectedWord.info ? (
                <div className="mt-2 text-sm text-white/80">
                  <p>
                    <strong>Translation:</strong> {selectedWord.info.english}
                  </p>
                  <p>
                    <strong>Type:</strong> {selectedWord.info.type}
                  </p>
                  {selectedWord.info.matchType && (
                    <p>
                      <strong>Match:</strong> {selectedWord.info.matchType}
                    </p>
                  )}
                  {selectedWord.info.isMultiple && selectedWord.info.allMatches && (
                    <div className="mt-2 space-y-1">
                      {selectedWord.info.allMatches.map((match) => (
                        <p key={`${match.key}-${match.type}`} className="text-xs text-white/70">
                          {match.key}: {match.english} ({match.type})
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="mt-2 space-y-3 text-sm text-white/70">
                  <p>Bu kelime henüz sözlükte yok.</p>
                  <button
                    type="button"
                    onClick={() => handleFlagTranslation(selectedWord)}
                    disabled={selectedWordFlagged || isFlaggingSelectedWord}
                    className="w-full rounded-2xl border border-amber-300/40 bg-amber-200/20 px-4 py-2 text-sm font-semibold text-amber-100 disabled:opacity-60"
                  >
                    {selectedWordFlagged ? 'Çeviri kuyruğunda' : isFlaggingSelectedWord ? 'Gönderiliyor…' : 'Çeviri kuyruğuna ekle'}
                  </button>
                  {flagMessage && <p className="text-xs text-white/60">{flagMessage}</p>}
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      {storyUnknownWords.length > 0 && (
        <section className="mt-8 rounded-3xl border border-amber-300/30 bg-amber-200/10 p-6 shadow-2xl backdrop-blur">
          <div className="flex flex-col gap-2">
            <h3 className="text-2xl font-semibold text-white">🚨 Çevrilmesi Gereken Kelimeler</h3>
            <p className="text-sm text-white/80">
              Hikâyede sözlüğümüzde bulunmayan kelimeler. Bir tıkla admin kuyruğuna gönderip çeviri önceliği oluşturabilirsiniz.
            </p>
          </div>
          <div className="mt-4 space-y-3">
            {storyUnknownWords.slice(0, 15).map((word: StoryUnknownWord) => {
              const slug = slugify(word.normalized)
              const alreadyFlagged = translationQueueSet.has(slug)
              const loading = flaggingWordId === slug
              return (
                <div
                  key={`${word.normalized}-${word.sentenceId}`}
                  className="rounded-2xl border border-white/10 bg-slate-950/40 p-4 text-white/80"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-lg font-semibold text-white">{word.surface}</p>
                      <p className="text-xs text-white/50">{word.sentenceText}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full border border-white/20 px-3 py-1 text-xs text-white/70">{word.count}× geçiyor</span>
                      <button
                        type="button"
                        onClick={() => handleQuickFlagWord(word)}
                        disabled={alreadyFlagged || loading}
                        className="rounded-full border border-amber-300/40 bg-amber-200/20 px-4 py-2 text-xs font-semibold text-amber-100 disabled:opacity-60"
                      >
                        {alreadyFlagged ? 'Kuyrukta' : loading ? 'Gönderiliyor…' : 'Kuyruğa ekle'}
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}

      <section className="category-filter">
        <div className="flex flex-col gap-2">
          <h3 className="text-2xl font-semibold text-white">🎯 Browse by Category</h3>
          <p className="text-sm text-white/70">Focus on the word families you need the most.</p>
        </div>
        <div className="filter-buttons">
          {CATEGORY_OPTIONS.map((option) => (
            <button
              key={option.value}
              className={`filter-btn ${category === option.value ? 'active' : ''}`}
              onClick={() => setCategory(option.value)}
            >
              {option.icon} {option.label}
            </button>
          ))}
        </div>
      </section>

      <section className="filters">
        <div className="flex flex-col gap-2">
          <h3 className="text-2xl font-semibold text-white">🔍 Search Vocabulary</h3>
          <p className="text-sm text-white/70">Combine English and Italian filters for laser-focused drilling.</p>
        </div>
        <div className="filter-group">
          <input
            type="text"
            value={englishFilter}
            onChange={(event) => setEnglishFilter(event.target.value)}
            placeholder="Search English translation…"
          />
          <input
            type="text"
            value={italianFilter}
            onChange={(event) => setItalianFilter(event.target.value)}
            placeholder="Search Italian word…"
          />
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            className="inline-flex flex-1 items-center justify-center rounded-2xl bg-brand-500 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-brand-900/40"
            onClick={() => {
              setEnglishFilter((prev) => prev.trim())
              setItalianFilter((prev) => prev.trim())
            }}
          >
            Apply Filters
          </button>
          <button
            className="inline-flex flex-1 items-center justify-center rounded-2xl border border-white/20 bg-white/5 px-4 py-3 text-sm font-semibold text-white/80"
            onClick={() => {
              setEnglishFilter('')
              setItalianFilter('')
            }}
          >
            Reset
          </button>
        </div>
      </section>

      <section className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-2xl backdrop-blur">
        <div className="flex items-center justify-between">
          <h3 className="text-2xl font-semibold text-white">📚 Vocabulary Results</h3>
          {loading && <p className="text-sm text-white/60">Loading resources…</p>}
          {!loading && error && <p className="text-sm text-red-300">{error}</p>}
        </div>
        <div className="mt-4 grid gap-6">
          {sections.length === 0 && <div className="no-results">No vocabulary matches your current filters.</div>}
          {sections.map((section) => (
            <div key={section.title} className="category-section">
              <div className="category-title">
                {section.title} ({section.items.length})
              </div>
              <div className="word-grid">
                {section.items.map((item) =>
                  section.type === 'verb' ? (
                    <VerbCard key={(item as VerbEntry).infinitive} verb={item as VerbEntry} />
                  ) : (
                    <WordCard key={(item as WordEntry).italian} word={item as WordEntry} />
                  ),
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      {isExportOpen && (
        <div className="modal" role="dialog" aria-modal="true">
          <div className="modal-content">
            <div className="modal-header">
              <h2 className="text-xl font-semibold text-white">🎯 Customize PDF Export</h2>
              <button type="button" className="close" onClick={() => setIsExportOpen(false)}>
                &times;
              </button>
            </div>

            <div className="option-group">
              <label htmlFor="wordGroupSelect">📚 Word Group</label>
              <select
                id="wordGroupSelect"
                value={exportGroup}
                onChange={(event) => setExportGroup(event.target.value as VocabularyCategory)}
              >
                {CATEGORY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.icon} {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="option-group">
              <label htmlFor="conjugationSelect">🔄 Tense/Conjugation</label>
              <select
                id="conjugationSelect"
                value={conjugation}
                onChange={(event) => setConjugation(event.target.value as ConjugationFilter)}
                disabled={exportGroup !== 'verbs' && exportGroup !== 'all'}
              >
                {CONJUGATION_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="option-group">
              <label>📋 Template Style</label>
              <div className="template-preview">
                {TEMPLATE_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    className={`template-option ${template === option.value ? 'selected' : ''}`}
                    onClick={() => setTemplate(option.value)}
                    type="button"
                  >
                    <div className="template-icon">{option.icon}</div>
                    <div>{option.label}</div>
                  </button>
                ))}
              </div>
            </div>

            {template === 'flashcard' && (
              <div className="option-group">
                <label>🧱 Flashcard Grid</label>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="text-xs uppercase tracking-[0.3em] text-white/50" htmlFor="columnsSelect">
                      Columns
                    </label>
                    <select
                      id="columnsSelect"
                      value={grid.columns}
                      onChange={(event) => setGrid((prev) => ({ ...prev, columns: Number(event.target.value) }))}
                    >
                      {[2, 3, 4].map((value) => (
                        <option key={value} value={value}>
                          {value}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs uppercase tracking-[0.3em] text-white/50" htmlFor="rowsSelect">
                      Rows
                    </label>
                    <select
                      id="rowsSelect"
                      value={grid.rows}
                      onChange={(event) => setGrid((prev) => ({ ...prev, rows: Number(event.target.value) }))}
                    >
                      {[2, 3, 4].map((value) => (
                        <option key={value} value={value}>
                          {value}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="mt-2 text-sm text-slate-300">📄 Preview: {gridPreview}</div>
              </div>
            )}

            <div className="modal-actions">
              <button type="button" className="modal-btn secondary" onClick={() => setIsExportOpen(false)}>
                Cancel
              </button>
              <button type="button" className="modal-btn primary" onClick={handleGeneratePDF} disabled={exporting}>
                {exporting ? 'Generating…' : 'Generate PDF'}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}

type Section = {
  title: string
  type: 'verb' | 'generic'
  items: (VerbEntry | WordEntry)[]
}

function buildSections(filtered: FilteredVocabulary): Section[] {
  if (!filtered) {
    return []
  }

  const sections: Section[] = []
  if (filtered.verbs?.length) {
    sections.push({ title: '🔸 Verbs', type: 'verb', items: filtered.verbs })
  }
  const extraCategories: { key: keyof FilteredVocabulary; title: string }[] = [
    { key: 'commonNouns', title: '📦 Common Nouns' },
    { key: 'adjectives', title: '🎨 Adjectives' },
    { key: 'adverbs', title: '⚡ Adverbs' },
    { key: 'pronouns', title: '👤 Pronouns' },
    { key: 'prepositions', title: '🔗 Prepositions' },
    { key: 'conjunctions', title: '🌉 Conjunctions' },
    { key: 'timeExpressions', title: '⏰ Time Expressions' },
  ]

  extraCategories.forEach((category) => {
    const items = filtered[category.key]
    if (items && items.length > 0) {
      sections.push({ title: category.title, type: 'generic', items })
    }
  })

  return sections
}

function StatCard({ label, value, accent }: { label: string; value: number; accent: string }) {
  return (
    <div className={`rounded-2xl border border-white/5 bg-gradient-to-br ${accent} via-white/5 to-white/0 p-4 text-white`}>
      <div className="text-3xl font-semibold">{value.toLocaleString()}</div>
      <p className="text-sm uppercase tracking-[0.3em] text-white/60">{label}</p>
    </div>
  )
}

function VerbCard({ verb }: { verb: VerbEntry }) {
  return (
    <div className="word-item">
      <div className="word-main">
        <span className="word-italian">{verb.infinitive}</span>
        <span className="word-english">{verb.english}</span>
      </div>
      {verb.present && (
        <div className="word-details">
          <strong>Present:</strong> {verb.present.slice(0, 3).join(', ')}
        </div>
      )}
      {verb.past && (
        <div className="word-details">
          <strong>Past:</strong> {verb.past.slice(0, 2).join(', ')}
        </div>
      )}
      {verb.presentContinuous && (
        <div className="word-details">
          <strong>Continuous:</strong> {verb.presentContinuous.slice(0, 2).join(', ')}
        </div>
      )}
    </div>
  )
}

function WordCard({ word }: { word: WordEntry }) {
  return (
    <div className="word-item">
      <div className="word-main">
        <span className="word-italian">{word.italian}</span>
        <span className="word-english">{word.english}</span>
      </div>
      {word.forms && (
        <div className="word-details">
          <strong>Forms:</strong> {word.forms.join(', ')}
        </div>
      )}
      {word.gender && (
        <div className="word-details">
          <strong>Gender:</strong> {word.gender}
          {word.plural ? <span> • <strong>Plural:</strong> {word.plural}</span> : null}
        </div>
      )}
      {word.examples && word.examples.length > 0 && (
        <div className="word-examples">
          <strong>Examples:</strong> {word.examples.slice(0, 2).join(' • ')}
        </div>
      )}
    </div>
  )
}

type SentenceWord = StoryWordTrigger

function renderSentence(
  sentence: StorySentence,
  showHints: boolean,
  onSelect: (word: SentenceWord) => void,
  vocabulary: VocabularyData,
) {
  const tokens = sentence.sentence_text.split(/(\s+|[.,!?;:])/)
  return tokens.map((token, index) => {
    const trimmed = token.trim()
    const isWord = trimmed && !/^[.,!?;:\s]+$/.test(token)
    if (!isWord) {
      return token
    }
    const normalized = trimmed.toLowerCase().replace(/[.,!?;:]/g, '')
    const match = findWordInVocabulary(normalized, vocabulary)
    const statusClass = match ? 'found' : 'not-found'
    return (
      <button
        type="button"
        key={`${normalized}-${sentence.sentence_id}-${index}`}
        className={`story-word ${statusClass}`}
        style={{ borderBottomStyle: showHints ? 'solid' : 'dotted' }}
        onClick={() =>
          onSelect({
            surface: token,
            normalized,
            sentenceText: sentence.sentence_text,
            sentenceId: sentence.sentence_id,
          })
        }
      >
        {token}
      </button>
    )
  })
}

type TranslationStatus = 'pending' | 'resolved'

type TranslationQueueDoc = {
  word?: string
  surface?: string
  context?: string
  storyTitle?: string
  sentenceId?: number
  status?: TranslationStatus
  createdAt?: { toDate: () => Date }
}

function collectStoryUnknownWords(sentences: StorySentence[], vocabulary: VocabularyData): StoryUnknownWord[] {
  const wordMap = new Map<string, StoryUnknownWord>()
  sentences.forEach((sentence) => {
    const tokens = sentence.sentence_text.split(/(\s+|[.,!?;:])/)
    tokens.forEach((token) => {
      const trimmed = token.trim()
      const isWord = trimmed && !/^[.,!?;:\s]+$/.test(token)
      if (!isWord) {
        return
      }
      const normalized = trimmed.toLowerCase().replace(/[.,!?;:]/g, '')
      if (!normalized) {
        return
      }
      const match = findWordInVocabulary(normalized, vocabulary)
      if (match) {
        return
      }
      const existing = wordMap.get(normalized)
      if (existing) {
        existing.count += 1
      } else {
        wordMap.set(normalized, {
          normalized,
          surface: trimmed,
          count: 1,
          sentenceText: sentence.sentence_text,
          sentenceId: sentence.sentence_id,
        })
      }
    })
  })
  return Array.from(wordMap.values()).sort((a, b) => b.count - a.count)
}
