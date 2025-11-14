'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

export default function FrequencyAnalyzer() {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    
    // Check if script is already loaded
    if (document.getElementById('word-frequency-script')) {
      // Script already loaded, just re-initialize
      if ((window as any).loadVocabulary) {
        (window as any).loadVocabulary()
      }
      return
    }
    
    // Load the script only once
    const script = document.createElement('script')
    script.id = 'word-frequency-script'
    script.src = '/word-frequency-app.js'
    script.async = true
    script.onload = () => {
      // Script loaded successfully
      console.log('Word frequency script loaded')
    }
    document.body.appendChild(script)

    return () => {
      // Don't remove script on unmount to prevent redeclaration
      // Just clean up if needed
    }
  }, [])

  if (!mounted) {
    return <div className="loading">Loading resources…</div>
  }

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
            onClick={() => (window as any).loadSampleText?.()}
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
            />
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => (window as any).analyzeFrequency?.()}
              className="inline-flex flex-1 items-center justify-center rounded-2xl bg-brand-500 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-brand-900/40"
            >
              🔍 Analyze Frequency
            </button>
            <button
              onClick={() => (window as any).exportFrequencyResults?.()}
              className="inline-flex flex-1 items-center justify-center rounded-2xl border border-white/20 bg-white/5 px-4 py-3 text-sm font-semibold text-white/80"
            >
              📥 Export Results (TXT)
            </button>
            <button
              onClick={() => (window as any).exportFrequencyJSON?.()}
              className="inline-flex flex-1 items-center justify-center rounded-2xl border border-white/20 bg-white/5 px-4 py-3 text-sm font-semibold text-white/80"
            >
              📥 Export JSON
            </button>
            <button
              onClick={() => (window as any).clearFrequencyAnalysis?.()}
              className="inline-flex flex-1 items-center justify-center rounded-2xl border border-white/20 bg-white/5 px-4 py-3 text-sm font-semibold text-white/80"
            >
              🗑️ Clear
            </button>
          </div>

          <div className="flex flex-wrap gap-4">
            <label className="inline-flex flex-1 items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-white/80">
              <input
                type="checkbox"
                id="highlightKnownWords"
                onChange={() => (window as any).updateFrequencyDisplay?.()}
                className="h-4 w-4 rounded border-white/30 bg-transparent"
              />
              <span>✓ Highlight Known Words</span>
            </label>
            <label className="inline-flex flex-1 items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-white/80">
              <input
                type="checkbox"
                id="showOnlyUnknown"
                onChange={() => (window as any).updateFrequencyDisplay?.()}
                className="h-4 w-4 rounded border-white/30 bg-transparent"
              />
              <span>🎯 Show Only Unknown</span>
            </label>
          </div>
        </div>
      </section>

      <section id="frequencyResults" style={{ display: 'none' }} className="mt-10 space-y-6">
        <div className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-2xl backdrop-blur">
          <div className="flex flex-col gap-2">
            <h3 className="text-2xl font-semibold text-white">📈 Statistics</h3>
            <p className="text-sm text-white/70">Coverage, uniqueness, and known-vs-unknown distribution.</p>
          </div>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3" id="frequencyStats">
            {/* Stats populated by script */}
          </div>
        </div>

        <div className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-2xl backdrop-blur">
          <div className="flex flex-col gap-2">
            <h3 className="text-2xl font-semibold text-white">📊 Word Frequency Table</h3>
            <p className="text-sm text-white/70">
              Words sorted by frequency. Known words are highlighted automatically.
            </p>
          </div>
          <div className="table-container mt-6">
            <table id="frequencyTable">
              <thead>
                <tr>
                  <th className="text-center" style={{ width: '60px' }}>Rank</th>
                  <th style={{ width: '250px' }}>Word</th>
                  <th className="text-center" style={{ width: '80px' }}>Count</th>
                  <th className="text-center" style={{ width: '120px' }}>Status</th>
                  <th>Translation</th>
                  <th style={{ width: '100px' }}>Type</th>
                </tr>
              </thead>
              <tbody id="frequencyTableBody">
                {/* Table rows populated by script */}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-2xl backdrop-blur">
          <div className="flex flex-col gap-2">
            <h3 className="text-2xl font-semibold text-white">📚 Words to Learn</h3>
            <p className="text-sm text-white/70">Target these unknown words first to maximize comprehension.</p>
          </div>
          <div
            id="unknownWordsList"
            className="mt-4 flex flex-wrap gap-3 rounded-3xl border border-dashed border-white/10 bg-white/0 p-4"
          >
            {/* Unknown words pills injected by script */}
          </div>
        </div>
      </section>
    </main>
  )
}
