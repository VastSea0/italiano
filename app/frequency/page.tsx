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
    return <div className="loading">Loading...</div>
  }

  return (
    <div className="container">
      <h1>📊 Italian Word Frequency Analyzer</h1>
      
      <nav className="nav-menu">
        <ul>
          <li><Link href="/">📚 Vocabulary Browser</Link></li>
          <li><Link href="/frequency" className="active">📊 Frequency Analyzer</Link></li>
        </ul>
      </nav>

      <div className="section-header">
        <h2>📝 Analyze Italian Text</h2>
        <p>Paste your Italian text below to analyze word frequency and check your vocabulary coverage</p>
      </div>

      <div className="section">
        <div className="mb-2">
          <label htmlFor="frequencyInput" style={{fontWeight: 'bold', color: '#2c3e50', display: 'block', marginBottom: '10px'}}>
            📝 Paste your Italian text here:
          </label>
          <textarea 
            id="frequencyInput" 
            className="w-100" 
            placeholder="İtalyanca metninizi buraya yapıştırın...&#10;&#10;Example: &#10;Il mio nome è Marco. Vivo a Roma con la mia famiglia. Ogni giorno vado al lavoro in autobus..."
            style={{minHeight: '200px'}}
          />
        </div>

        <div className="flex flex-wrap gap-1 mb-2" style={{alignItems: 'center'}}>
          <button onClick={() => (window as any).analyzeFrequency?.()} className="btn-primary">
            🔍 Analyze Frequency
          </button>
          <button onClick={() => (window as any).exportFrequencyResults?.()} className="btn-secondary">
            📥 Export Results (TXT)
          </button>
          <button onClick={() => (window as any).exportFrequencyJSON?.()} className="btn-secondary">
            📥 Export JSON
          </button>
          <button onClick={() => (window as any).clearFrequencyAnalysis?.()} className="btn-neutral">
            🗑️ Clear
          </button>
          <button onClick={() => (window as any).loadSampleText?.()} className="btn-neutral">
            📄 Load Sample Text
          </button>
        </div>

        <div className="flex" style={{alignItems: 'center', gap: '15px', flexWrap: 'wrap'}}>
          <label style={{display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', background: '#f8f9fa', padding: '8px 15px', borderRadius: '20px', border: '2px solid #ddd'}}>
            <input type="checkbox" id="highlightKnownWords" onChange={() => (window as any).updateFrequencyDisplay?.()} style={{cursor: 'pointer'}} />
            <span style={{color: '#2c3e50', fontWeight: 'bold', fontSize: '0.9em'}}>✓ Highlight Known Words</span>
          </label>
          <label style={{display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', background: '#f8f9fa', padding: '8px 15px', borderRadius: '20px', border: '2px solid #ddd'}}>
            <input type="checkbox" id="showOnlyUnknown" onChange={() => (window as any).updateFrequencyDisplay?.()} style={{cursor: 'pointer'}} />
            <span style={{color: '#2c3e50', fontWeight: 'bold', fontSize: '0.9em'}}>🎯 Show Only Unknown</span>
          </label>
        </div>
      </div>

      <div id="frequencyResults" style={{display: 'none'}}>
        <div className="section">
          <h3>📈 Statistics</h3>
          <div className="stats-grid" id="frequencyStats">
            {/* Stats will be populated by JavaScript */}
          </div>
        </div>

        <div className="section">
          <h3>📊 Word Frequency Table</h3>
          <p className="text-muted mb-2">Words sorted by frequency. Known words are in your vocabulary database.</p>
          <div className="table-container">
            <table id="frequencyTable">
              <thead>
                <tr>
                  <th style={{textAlign: 'center', width: '60px'}}>Rank</th>
                  <th style={{width: '250px'}}>Word</th>
                  <th style={{textAlign: 'center', width: '80px'}}>Count</th>
                  <th style={{textAlign: 'center', width: '120px'}}>Status</th>
                  <th>Translation</th>
                  <th style={{width: '100px'}}>Type</th>
                </tr>
              </thead>
              <tbody id="frequencyTableBody">
                {/* Table rows will be populated by JavaScript */}
              </tbody>
            </table>
          </div>
        </div>

        <div className="section">
          <h3>📚 Words to Learn</h3>
          <p className="text-muted mb-2">These words appear in your text but are not in your current vocabulary.</p>
          <div id="unknownWordsList" className="flex flex-wrap gap-1">
            {/* Unknown words will be populated */}
          </div>
        </div>
      </div>
    </div>
  )
}
