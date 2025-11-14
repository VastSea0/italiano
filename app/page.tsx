'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

export default function Home() {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    
    // Check if script is already loaded
    if (document.getElementById('verb-analyzer-script')) {
      // Script already loaded, just re-initialize
      if ((window as any).loadVocabulary) {
        (window as any).loadVocabulary()
      }
      return
    }
    
    // Load the script only once
    const script = document.createElement('script')
    script.id = 'verb-analyzer-script'
    script.src = '/verb-analyzer-client.js'
    script.async = true
    script.onload = () => {
      // Script loaded successfully
      console.log('Verb analyzer script loaded')
    }
    document.body.appendChild(script)

    return () => {
      // Don't remove script on unmount to prevent redeclaration
      // Just clean up if needed
    }
  }, [])

  if (!mounted) {
    return <div className="loading">Loading...</div>
  }

  return (
    <div className="container">
      <h1>🇮🇹 Italian Vocabulary Analyzer</h1>
      
      <nav className="nav-menu">
        <ul>
          <li><Link href="/" className="active">📚 Vocabulary Browser</Link></li>
          <li><Link href="/frequency">📊 Frequency Analyzer</Link></li>
        </ul>
      </nav>

      <div className="stats-summary">
        <h3>📊 Vocabulary Coverage for A2-B1 Italian</h3>
        <div className="stats-grid" id="statsGrid">
          {/* Stats will be populated by JavaScript */}
        </div>
      </div>

      <div className="export-section">
        <h3>📄 Export Vocabulary</h3>
        <p>Export the currently displayed vocabulary as a PDF document</p>
        <button className="export-btn" onClick={() => (window as any).openExportModal?.()} id="exportBtn">
          📥 Export as PDF
        </button>
      </div>

      <div className="story-section">
        <h3>📖 Interactive Story Reader</h3>
        <p>Click on any word in the story to see its vocabulary information</p>
        <div className="story-container" id="storyContainer">
          <div className="story-selector">
            <label htmlFor="storySelect">Choose a story:</label>
            <select id="storySelect" onChange={() => (window as any).changeStory?.()}>
              {/* Story options will be populated by JavaScript */}
            </select>
            <div className="story-navigation">
              <button className="nav-btn" onClick={() => (window as any).previousStory?.()} id="prevBtn">← Previous</button>
              <button className="nav-btn" onClick={() => (window as any).nextStory?.()} id="nextBtn">Next →</button>
            </div>
          </div>
          <div className="story-controls">
            <div className="story-info">
              <span id="storyLevel">Level: A1</span> | 
              <span id="storyProgress">0/0 sentences</span>
            </div>
            <button className="story-toggle" onClick={() => (window as any).toggleStoryMode?.()} id="storyToggle">
              Show Hints
            </button>
          </div>
          <div className="story-title" id="storyTitle">Loading story...</div>
          <div id="storyContent">
            {/* Story content will be populated by JavaScript */}
          </div>
        </div>
      </div>

      <div className="category-filter">
        <h3>🎯 Browse by Category</h3>
        <div className="filter-buttons" id="categoryButtons">
          <button className="filter-btn active" onClick={() => (window as any).showCategory?.('all')}>All Vocabulary</button>
          <button className="filter-btn" onClick={() => (window as any).showCategory?.('verbs')}>🔸 Verbs</button>
          <button className="filter-btn" onClick={() => (window as any).showCategory?.('nouns')}>📦 Nouns</button>
          <button className="filter-btn" onClick={() => (window as any).showCategory?.('adjectives')}>🎨 Adjectives</button>
          <button className="filter-btn" onClick={() => (window as any).showCategory?.('adverbs')}>⚡ Adverbs</button>
          <button className="filter-btn" onClick={() => (window as any).showCategory?.('pronouns')}>👤 Pronouns</button>
          <button className="filter-btn" onClick={() => (window as any).showCategory?.('prepositions')}>🔗 Prepositions</button>
          <button className="filter-btn" onClick={() => (window as any).showCategory?.('conjunctions')}>🌉 Conjunctions</button>
          <button className="filter-btn" onClick={() => (window as any).showCategory?.('time')}>⏰ Time</button>
        </div>
      </div>

      <div className="filters">
        <h3>🔍 Search Vocabulary</h3>
        <div className="filter-group">
          <input type="text" id="englishFilter" placeholder="Search English translation..." />
          <input type="text" id="italianFilter" placeholder="Search Italian word..." />
        </div>
        <button onClick={() => (window as any).applyFilters?.()}>Search</button>
        <button onClick={() => (window as any).clearFilters?.()}>Clear Search</button>
      </div>

      <div id="results">
        <div id="vocabularyContent">
          {/* Vocabulary content will be populated by JavaScript */}
        </div>
      </div>

      {/* Export Modal */}
      <div id="exportModal" className="modal">
        <div className="modal-content">
          <div className="modal-header">
            <span className="close" onClick={() => (window as any).closeExportModal?.()}>&times;</span>
            <h2>🎯 Customize PDF Export</h2>
          </div>

          <div className="option-group">
            <label htmlFor="wordGroupSelect">📚 Word Group:</label>
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

          <div className="option-group" id="conjugationGroup" style={{display: 'none'}}>
            <label htmlFor="conjugationSelect">🔄 Tense/Conjugation:</label>
            <select id="conjugationSelect">
              <option value="all">All Tenses</option>
              <option value="infinitive">Infinitive Only</option>
              <option value="present">Present Tense</option>
              <option value="past">Past Tense</option>
              <option value="presentContinuous">Present Continuous</option>
            </select>
          </div>

          <div className="option-group">
            <label>📋 Template Style:</label>
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

          <div className="modal-actions">
            <button className="modal-btn secondary" onClick={() => (window as any).closeExportModal?.()}>Cancel</button>
            <button className="modal-btn primary" onClick={() => (window as any).generateCustomPDF?.()}>Generate PDF</button>
          </div>
        </div>
      </div>
    </div>
  )
}
