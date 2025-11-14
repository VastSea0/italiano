'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

export default function Home() {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)

    const existingScript = document.getElementById('verb-analyzer-script')
    if (existingScript) {
      ;(window as any).loadVocabulary?.()
      return
    }

    const script = document.createElement('script')
    script.id = 'verb-analyzer-script'
    script.src = '/verb-analyzer-client.js'
    script.async = true
    script.onload = () => {
      console.log('Verb analyzer script loaded')
      ;(window as any).loadVocabulary?.()
    }
    document.body.appendChild(script)

    return () => {
      // Keep script mounted to avoid double initialization
    }
  }, [])

  if (!mounted) {
    return <div className="loading">Loading resources…</div>
  }

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
              onClick={() => (window as any).loadVocabulary?.()}
            >
              🔄 Refresh Data
            </button>
          </div>
          <div id="statsGrid" className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {/* Stats injected by script */}
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
              onClick={() => (window as any).openExportModal?.()}
            >
              📥 Export Vocabulary
            </button>
            <button
              className="inline-flex flex-1 items-center justify-center rounded-2xl border border-white/30 bg-white/5 px-4 py-3 text-sm font-semibold text-white/80"
              onClick={() => (window as any).generateCustomPDF?.()}
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
        <div className="story-container" id="storyContainer">
          <div className="story-selector">
            <div className="flex-1">
              <label className="text-xs font-semibold uppercase tracking-[0.3em] text-white/60" htmlFor="storySelect">
                Choose a story
              </label>
              <select id="storySelect" onChange={() => (window as any).changeStory?.()}>
                {/* Story options populated by script */}
              </select>
            </div>
            <div className="story-navigation">
              <button className="nav-btn" onClick={() => (window as any).previousStory?.()} id="prevBtn">
                ← Previous
              </button>
              <button className="nav-btn" onClick={() => (window as any).nextStory?.()} id="nextBtn">
                Next →
              </button>
            </div>
          </div>
          <div className="story-controls">
            <div className="story-info">
              <span id="storyLevel">Level: A1</span>
              <span className="mx-2 text-white/40">•</span>
              <span id="storyProgress">0/0 sentences</span>
            </div>
            <button className="story-toggle" onClick={() => (window as any).toggleStoryMode?.()} id="storyToggle">
              Show Hints
            </button>
          </div>
          <div className="story-title" id="storyTitle">Loading story...</div>
          <div id="storyContent" className="space-y-2">
            {/* Story text injected */}
          </div>
        </div>
      </section>

      <section className="category-filter">
        <div className="flex flex-col gap-2">
          <h3 className="text-2xl font-semibold text-white">🎯 Browse by Category</h3>
          <p className="text-sm text-white/70">Focus on the word families you need the most.</p>
        </div>
        <div className="filter-buttons" id="categoryButtons">
          <button className="filter-btn active" onClick={() => (window as any).showCategory?.('all')} data-category="all">
            All Vocabulary
          </button>
          <button className="filter-btn" onClick={() => (window as any).showCategory?.('verbs')} data-category="verbs">
            🔸 Verbs
          </button>
          <button className="filter-btn" onClick={() => (window as any).showCategory?.('nouns')} data-category="nouns">
            📦 Nouns
          </button>
          <button className="filter-btn" onClick={() => (window as any).showCategory?.('adjectives')} data-category="adjectives">
            🎨 Adjectives
          </button>
          <button className="filter-btn" onClick={() => (window as any).showCategory?.('adverbs')} data-category="adverbs">
            ⚡ Adverbs
          </button>
          <button className="filter-btn" onClick={() => (window as any).showCategory?.('pronouns')} data-category="pronouns">
            👤 Pronouns
          </button>
          <button className="filter-btn" onClick={() => (window as any).showCategory?.('prepositions')} data-category="prepositions">
            🔗 Prepositions
          </button>
          <button className="filter-btn" onClick={() => (window as any).showCategory?.('conjunctions')} data-category="conjunctions">
            🌉 Conjunctions
          </button>
          <button className="filter-btn" onClick={() => (window as any).showCategory?.('time')} data-category="time">
            ⏰ Time
          </button>
        </div>
      </section>

      <section className="filters">
        <div className="flex flex-col gap-2">
          <h3 className="text-2xl font-semibold text-white">🔍 Search Vocabulary</h3>
          <p className="text-sm text-white/70">Combine English and Italian filters for laser-focused drilling.</p>
        </div>
        <div className="filter-group">
          <input type="text" id="englishFilter" placeholder="Search English translation…" />
          <input type="text" id="italianFilter" placeholder="Search Italian word…" />
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            className="inline-flex flex-1 items-center justify-center rounded-2xl bg-brand-500 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-brand-900/40"
            onClick={() => (window as any).applyFilters?.()}
          >
            Apply Filters
          </button>
          <button
            className="inline-flex flex-1 items-center justify-center rounded-2xl border border-white/20 bg-white/5 px-4 py-3 text-sm font-semibold text-white/80"
            onClick={() => (window as any).clearFilters?.()}
          >
            Reset
          </button>
        </div>
      </section>

      <section className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-2xl backdrop-blur">
        <div className="flex items-center justify-between">
          <h3 className="text-2xl font-semibold text-white">📚 Vocabulary Results</h3>
          <p className="text-sm text-white/60">Live data rendered below</p>
        </div>
        <div id="results" className="mt-4">
          <div id="vocabularyContent" className="grid gap-4">
            {/* Vocabulary cards injected by script */}
          </div>
        </div>
      </section>

      <div id="exportModal" className="modal">
        <div className="modal-content">
          <div className="modal-header">
            <h2 className="text-xl font-semibold text-white">🎯 Customize PDF Export</h2>
            <span className="close" onClick={() => (window as any).closeExportModal?.()}>&times;</span>
          </div>

          <div className="option-group">
            <label htmlFor="wordGroupSelect">📚 Word Group</label>
            <select id="wordGroupSelect">
              <option value="all">All Categories</option>
              <option value="verbs">🔸 Verbs</option>
              <option value="nouns">📦 Nouns</option>
              <option value="adjectives">🎨 Adjectives</option>
              <option value="adverbs">⚡ Adverbs</option>
              <option value="pronouns">👤 Pronouns</option>
              <option value="prepositions">🔗 Prepositions</option>
              <option value="conjunctions">🌉 Conjunctions</option>
              <option value="time">⏰ Time Expressions</option>
            </select>
          </div>

          <div className="option-group" id="conjugationGroup" style={{ display: 'none' }}>
            <label htmlFor="conjugationSelect">🔄 Tense/Conjugation</label>
            <select id="conjugationSelect">
              <option value="all">All Tenses</option>
              <option value="infinitive">Infinitive Only</option>
              <option value="present">Present Tense</option>
              <option value="past">Past Tense</option>
              <option value="presentContinuous">Present Continuous</option>
            </select>
          </div>

          <div className="option-group">
            <label>📋 Template Style</label>
            <div className="template-preview">
              <div className="template-option selected" data-template="flashcard">
                <div className="template-icon">🃏</div>
                <div>Flashcard</div>
              </div>
              <div className="template-option" data-template="table">
                <div className="template-icon">📊</div>
                <div>Table</div>
              </div>
              <div className="template-option" data-template="list">
                <div className="template-icon">📝</div>
                <div>List View</div>
              </div>
            </div>
          </div>

          <div className="option-group" id="gridConfigGroup">
            <label>🧱 Flashcard Grid</label>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="text-xs uppercase tracking-[0.3em] text-white/50" htmlFor="columnsSelect">
                  Columns
                </label>
                <select id="columnsSelect">
                  <option value="2">2</option>
                  <option value="3">3</option>
                  <option value="4">4</option>
                </select>
              </div>
              <div>
                <label className="text-xs uppercase tracking-[0.3em] text-white/50" htmlFor="rowsSelect">
                  Rows
                </label>
                <select id="rowsSelect">
                  <option value="2">2</option>
                  <option value="3">3</option>
                  <option value="4">4</option>
                </select>
              </div>
            </div>
            <div id="gridPreview" className="mt-2 text-sm text-slate-300">
              📄 Preview: 4 flashcards per page (2×2 grid)
            </div>
          </div>

          <div className="modal-actions">
            <button className="modal-btn secondary" onClick={() => (window as any).closeExportModal?.()}>
              Cancel
            </button>
            <button className="modal-btn primary" onClick={() => (window as any).generateCustomPDF?.()}>
              Generate PDF
            </button>
          </div>
        </div>
      </div>
    </main>
  )
}
