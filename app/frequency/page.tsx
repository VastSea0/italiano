'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'

import { useVocabularyResources } from '@/hooks/useVocabularyResources'
import { analyzeFrequencyText, SAMPLE_FREQUENCY_TEXT, type FrequencyResults } from '@/lib/frequency'

export default function FrequencyAnalyzer() {
  const { vocabulary, loading, error, reload } = useVocabularyResources({ includeStories: false })
  const [text, setText] = useState('')
  const [results, setResults] = useState<FrequencyResults | null>(null)
  const [highlightKnown, setHighlightKnown] = useState(false)
  const [showOnlyUnknown, setShowOnlyUnknown] = useState(false)

  const filteredWords = useMemo(() => {
    if (!results) {
      return []
    }
    return showOnlyUnknown ? results.words.filter((word) => !word.inVocabulary) : results.words
  }, [results, showOnlyUnknown])

  const coverage = useMemo(() => {
    if (!results || results.uniqueWords === 0) {
      return '0.0'
    }
    return ((results.knownWords / results.uniqueWords) * 100).toFixed(1)
  }, [results])

  const handleAnalyze = () => {
    if (!text.trim()) {
      alert('Please paste some Italian text to analyze!')
      return
    }
    const analysis = analyzeFrequencyText(text, vocabulary)
    setResults(analysis)
  }

  const handleExportText = () => {
    if (!results) {
      alert('Please analyze some text first!')
      return
    }
    const lines: string[] = []
    lines.push('Italian Word Frequency Analysis')
    lines.push(`Analyzed on: ${new Date().toLocaleString()}`)
    lines.push(''.padEnd(60, '='))
    lines.push(`Total Words: ${results.totalWords}`)
    lines.push(`Unique Words: ${results.uniqueWords}`)
    lines.push(`Known Words: ${results.knownWords}`)
    lines.push(`Unknown Words: ${results.unknownWords}`)
    lines.push(`Vocabulary Coverage: ${coverage}%`)
    lines.push('')
    lines.push('Rank | Word | Count | Status | Translation')
    results.words.forEach((word) => {
      const status = word.inVocabulary ? 'Known' : 'Unknown'
      const translation = word.vocabInfo?.english ?? 'Not in vocabulary'
      lines.push(`${word.rank.toString().padStart(3)} | ${word.word.padEnd(30)} | ${word.count.toString().padStart(4)} | ${status.padEnd(7)} | ${translation}`)
    })
    download(lines.join('\n'), `word-frequency-${Date.now()}.txt`, 'text/plain')
  }

  const handleExportJSON = () => {
    if (!results) {
      alert('Please analyze some text first!')
      return
    }
    const payload = {
      analyzedAt: new Date().toISOString(),
      statistics: {
        totalWords: results.totalWords,
        uniqueWords: results.uniqueWords,
        knownWords: results.knownWords,
        unknownWords: results.unknownWords,
        coverage: `${coverage}%`,
      },
      words: results.words.map((word) => ({
        rank: word.rank,
        word: word.word,
        frequency: word.count,
        inVocabulary: word.inVocabulary,
        translation: word.vocabInfo?.english ?? null,
        type: word.vocabInfo?.type ?? null,
      })),
    }
    download(JSON.stringify(payload, null, 2), `word-frequency-${Date.now()}.json`, 'application/json')
  }

  const handleClear = () => {
    setText('')
    setResults(null)
    setHighlightKnown(false)
    setShowOnlyUnknown(false)
  }

  const unknownWords = useMemo(() => {
    if (!results) return []
    return results.words.filter((word) => !word.inVocabulary).sort((a, b) => b.count - a.count).slice(0, 50)
  }, [results])

  return (
    <main className="mx-auto max-w-5xl px-4 py-10 lg:py-16">
      <section className="rounded-3xl border border-white/10 bg-white/5 p-8 text-center shadow-2xl backdrop-blur">
        <p className="text-xs font-semibold uppercase tracking-[0.5em] text-brand-200">Italiano Studio</p>
        <h1 className="mt-4 text-4xl font-semibold text-white sm:text-5xl">Word Frequency Intelligence</h1>
        <p className="mx-auto mt-4 max-w-3xl text-base text-white/70">
          Paste any Italian passage and instantly see coverage, unknown vocabulary, and smart export options.
        </p>
        <nav className="mt-8 flex flex-wrap justify-center gap-3">
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/5 px-5 py-2 text-sm font-semibold text-white/80 transition hover:border-white/50 hover:text-white"
          >
            📚 Vocabulary Browser
          </Link>
          <Link
            href="/frequency"
            className="inline-flex items-center gap-2 rounded-full border border-white bg-white px-5 py-2 text-sm font-semibold text-slate-900 shadow-lg shadow-brand-900/30"
          >
            📊 Frequency Analyzer
          </Link>
        </nav>
      </section>

      <section className="mt-10 rounded-3xl border border-white/10 bg-white/5 p-6 shadow-2xl backdrop-blur">
        <header className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.5em] text-brand-200">Data Input</p>
            <h2 className="text-2xl font-semibold text-white">📝 Analyze Italian Text</h2>
            <p className="text-sm text-white/70">Paste or type your passage. We handle punctuation, contractions, and known vocabulary.</p>
          </div>
          <button
            className="rounded-full border border-white/20 bg-white/10 px-5 py-2 text-sm font-semibold text-white transition hover:border-white/60 hover:bg-white/20"
            onClick={() => {
              setText(SAMPLE_FREQUENCY_TEXT)
              setResults(null)
            }}
          >
            📄 Load Sample Text
          </button>
        </header>

        <div className="mt-6 space-y-4">
          <div>
            <label className="text-sm font-semibold uppercase tracking-[0.4em] text-white/60" htmlFor="frequencyInput">
              Input Text
            </label>
            <textarea
              id="frequencyInput"
              className="mt-2 h-56 w-full resize-y rounded-3xl border border-white/10 bg-slate-950/40 p-5 text-base text-white placeholder:text-white/30"
              placeholder={
                'İtalyanca metninizi buraya yapıştırın...\n\nExample:\nIl mio nome è Marco. Vivo a Roma con la mia famiglia. Ogni giorno vado al lavoro in autobus...'
              }
              value={text}
              onChange={(event) => setText(event.target.value)}
            />
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              onClick={handleAnalyze}
              className="inline-flex flex-1 items-center justify-center rounded-2xl bg-brand-500 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-brand-900/40"
            >
              🔍 Analyze Frequency
            </button>
            <button
              onClick={handleExportText}
              className="inline-flex flex-1 items-center justify-center rounded-2xl border border-white/20 bg-white/5 px-4 py-3 text-sm font-semibold text-white/80"
            >
              📥 Export Results (TXT)
            </button>
            <button
              onClick={handleExportJSON}
              className="inline-flex flex-1 items-center justify-center rounded-2xl border border-white/20 bg-white/5 px-4 py-3 text-sm font-semibold text-white/80"
            >
              📥 Export JSON
            </button>
            <button
              onClick={handleClear}
              className="inline-flex flex-1 items-center justify-center rounded-2xl border border-white/20 bg-white/5 px-4 py-3 text-sm font-semibold text-white/80"
            >
              🗑️ Clear
            </button>
          </div>

          <div className="flex flex-wrap gap-4">
            <label className="inline-flex flex-1 items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-white/80">
              <input
                type="checkbox"
                checked={highlightKnown}
                onChange={(event) => setHighlightKnown(event.target.checked)}
                className="h-4 w-4 rounded border-white/30 bg-transparent"
              />
              <span>✓ Highlight Known Words</span>
            </label>
            <label className="inline-flex flex-1 items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-white/80">
              <input
                type="checkbox"
                checked={showOnlyUnknown}
                onChange={(event) => setShowOnlyUnknown(event.target.checked)}
                className="h-4 w-4 rounded border-white/30 bg-transparent"
              />
              <span>🎯 Show Only Unknown</span>
            </label>
          </div>
        </div>
      </section>

      {results && (
        <section className="mt-10 space-y-6">
          <div className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-2xl backdrop-blur">
            <div className="flex flex-col gap-2">
              <h3 className="text-2xl font-semibold text-white">📈 Statistics</h3>
              <p className="text-sm text-white/70">Coverage, uniqueness, and known-vs-unknown distribution.</p>
            </div>
            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <StatCard label="Total Words" value={results.totalWords} color="from-emerald-500/40" />
              <StatCard label="Unique Words" value={results.uniqueWords} color="from-sky-500/40" />
              <StatCard label="Known Words" value={results.knownWords} color="from-indigo-500/40" />
              <StatCard label="Unknown Words" value={results.unknownWords} color="from-rose-500/40" />
              <StatCard label="Coverage" value={`${coverage}%`} color="from-amber-500/40" />
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-2xl backdrop-blur">
            <div className="flex flex-col gap-2">
              <h3 className="text-2xl font-semibold text-white">📊 Word Frequency Table</h3>
              <p className="text-sm text-white/70">Words sorted by frequency. Known words are highlighted automatically.</p>
            </div>
            <div className="table-container mt-6">
              <table>
                <thead>
                  <tr>
                    <th className="text-center" style={{ width: '60px' }}>
                      Rank
                    </th>
                    <th style={{ width: '250px' }}>Word</th>
                    <th className="text-center" style={{ width: '80px' }}>
                      Count
                    </th>
                    <th className="text-center" style={{ width: '120px' }}>
                      Status
                    </th>
                    <th>Translation</th>
                    <th style={{ width: '100px' }}>Type</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredWords.length === 0 && (
                    <tr>
                      <td colSpan={6} className="text-center text-sm text-white/60">
                        No words to display.
                      </td>
                    </tr>
                  )}
                  {filteredWords.map((word) => (
                    <tr
                      key={word.rank}
                      className={highlightKnown && word.inVocabulary ? 'bg-emerald-500/10' : ''}
                    >
                      <td className="text-center font-semibold text-white/70">{word.rank}</td>
                      <td className="font-semibold text-white">{word.word}</td>
                      <td className="text-center text-brand-200">{word.count}</td>
                      <td className="text-center">
                        <span className={`badge ${word.inVocabulary ? 'badge-success' : 'badge-danger'}`}>
                          {word.inVocabulary ? '✓ Known' : '✗ Unknown'}
                        </span>
                      </td>
                      <td className="text-sm text-white/80">
                        {word.vocabInfo?.english ?? 'Not in vocabulary'}
                        {word.vocabInfo?.matchType && (
                          <span className="block text-xs text-white/50">({word.vocabInfo.matchType})</span>
                        )}
                        {word.vocabInfo?.isMultiple && word.vocabInfo.allMatches && (
                          <div className="mt-2 space-y-1 text-xs text-amber-200">
                            {word.vocabInfo.allMatches.map((match) => (
                              <p key={`${match.key}-${match.type}`}>
                                {match.key}: {match.english} ({match.type})
                              </p>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="text-center">
                        {word.vocabInfo?.type ? (
                          <span className="badge badge-info">{word.vocabInfo.type}</span>
                        ) : (
                          '-'
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-2xl backdrop-blur">
            <div className="flex flex-col gap-2">
              <h3 className="text-2xl font-semibold text-white">📚 Words to Learn</h3>
              <p className="text-sm text-white/70">Target these unknown words first to maximize comprehension.</p>
            </div>
            <div className="mt-4 flex flex-wrap gap-3 rounded-3xl border border-dashed border-white/10 bg-white/0 p-4">
              {unknownWords.length === 0 && <p className="text-sm text-white/60">🎉 All words are in your vocabulary!</p>}
              {unknownWords.map((word) => (
                <div
                  key={word.word}
                  className="inline-flex items-center gap-2 rounded-full border border-amber-300/40 bg-amber-200/20 px-4 py-2 text-sm font-semibold text-amber-200"
                >
                  <span>{word.word}</span>
                  <span className="rounded-full bg-amber-300/60 px-2 py-0.5 text-xs text-amber-900">{word.count}</span>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      <div className="mt-6 text-center text-sm text-white/60">
        {loading ? 'Loading vocabulary...' : error ? error : 'Vocabulary ready.'}
        <button className="ml-3 text-brand-200" onClick={() => reload()}>
          Refresh
        </button>
      </div>
    </main>
  )
}

function StatCard({ label, value, color }: { label: string; value: number | string; color: string }) {
  return (
    <div className={`rounded-2xl border border-white/5 bg-gradient-to-br ${color} via-white/5 to-white/0 p-4 text-white`}>
      <div className="text-3xl font-semibold">{value}</div>
      <p className="text-sm uppercase tracking-[0.3em] text-white/60">{label}</p>
    </div>
  )
}

function download(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  URL.revokeObjectURL(url)
}
