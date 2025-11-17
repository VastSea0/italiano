"use client";
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useVocabularyResources } from '@/hooks/useVocabularyResources'
import { db } from '@/lib/firebase/client'
import { collection, doc, onSnapshot, orderBy, query, serverTimestamp, setDoc } from 'firebase/firestore'
import { findWordInVocabulary, slugify } from '@/lib/vocabulary'
import type { StorySentence, VocabularyData, VerbEntry, WordEntry, WordMatch } from '@/lib/vocabulary'

export default function WritingAtelierPage() {
  // Core data
  const { vocabulary, stories, loading, error, reload } = useVocabularyResources()

  // UI state
  const [selectedActivity, setSelectedActivity] = useState<'diario'|'traduzione'|'dialogo'>('diario')
  const [userText, setUserText] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [isPoolOpen, setIsPoolOpen] = useState(true)
  const [selectedRightTab, setSelectedRightTab] = useState<'pool'|'story'|'unknown'|'results'>('pool')
  const [storyIndex, setStoryIndex] = useState(0)
  const [showHints, setShowHints] = useState(false)

  const textareaRef = useRef<HTMLTextAreaElement | null>(null)

  // Suggestions and selection
  const [suggestions, setSuggestions] = useState<Array<{ label: string; type: 'verb'|'word'; item: VerbEntry | WordEntry }>>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(-1)

  // Additional state: hovered/pool & queue
  const [hoveredWord, setHoveredWord] = useState<string | null>(null)
  const [hoveredInfo, setHoveredInfo] = useState<WordMatch | null>(null)
  const [selectedPoolEntry, setSelectedPoolEntry] = useState<{ type: 'verb'|'word'; item: VerbEntry | WordEntry } | null>(null)
  const [translationQueue, setTranslationQueue] = useState<Record<string, { id: string; word: string }>>({})
  const [flaggingWordId, setFlaggingWordId] = useState<string | null>(null)
  const [flagMessage, setFlagMessage] = useState<string | null>(null)

  const activities = [
    { key: 'diario', label: 'Günlük Yazısı (Diario)' },
    { key: 'traduzione', label: 'Çeviri (Traduzione)' },
    { key: 'dialogo', label: 'Diyalog (Dialogo)' },
  ]

  // Derived data: flatten vocabulary -> simple array of words
  const allWords = useMemo(() => {
    if (!vocabulary) return [] as string[]
    const list: string[] = []
    Object.keys(vocabulary).forEach((k) => {
      const items = (vocabulary as any)[k]
      if (!Array.isArray(items)) return
      items.forEach((i: any) => { if (i.italian) list.push(i.italian); if (i.infinitive) list.push(i.infinitive) })
    })
    return Array.from(new Set(list)).sort()
  }, [vocabulary])

  // Flattened entries for autocomplete
  const flattenedEntries = useMemo(() => {
    if (!vocabulary) return [] as Array<{ key: string; type: 'verb'|'word'; item: any; variants: string[] }>
    const out: Array<{ key: string; type: 'verb'|'word'; item: any; variants: string[] }> = []
    ;(vocabulary.verbs ?? []).forEach((v) => out.push({ key: v.infinitive, type: 'verb', item: v, variants: [v.infinitive, ...(v.present ?? []), ...(v.past ?? []), ...(v.presentContinuous ?? [])].map(x => (x||'').toLowerCase()) }))
    const other = ['commonNouns','adjectives','adverbs','prepositions','timeExpressions','pronouns','conjunctions'] as (keyof VocabularyData)[]
    other.forEach(k => { ((vocabulary as any)[k] ?? []).forEach((w: any) => out.push({ key: w.italian, type: 'word', item: w, variants: [w.italian, ...(w.forms ?? []), ...(w.plural ? [w.plural] : [])].map((v: any) => (v||'').toLowerCase()) })) })
    return out
  }, [vocabulary])

  // Activity content – small helper to present suggestions per mode
  const activityContent = useMemo(() => {
    if (selectedActivity === 'diario') return { scenario: 'Bugün neler hissettin? Kısa bir günlük yaz.', vocabulary: (vocabulary?.commonNouns ?? []).slice(0,8).map((w:any)=>w.italian) }
    if (selectedActivity === 'traduzione') {
      const s = stories?.[storyIndex]
      return { sourceText: s?.story_data?.[0]?.sentence_text ?? 'Çevrilecek metin bulunamadı.', vocabulary: (vocabulary?.verbs ?? []).slice(0,8).map((w:any)=>w.infinitive) }
    }
    if (selectedActivity === 'dialogo') return { scenario: 'Kısa bir diyalog yaz. İki kişinin konuşması olsun.', vocabulary: (vocabulary?.adjectives ?? []).slice(0,8).map((w:any)=>w.italian) }
    return { scenario: '', vocabulary: [] }
  }, [selectedActivity, vocabulary, stories, storyIndex])

  const activeStory = stories?.[storyIndex] ?? null

  // Suggestions: when typing
  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value
    setUserText(value)
    const last = value.split(/\s+/).pop()?.toLowerCase() ?? ''
    if (last.length === 0) { setShowSuggestions(false); setSuggestions([]); return }
    const matches = flattenedEntries.filter(en => en.variants.some(v => v.includes(last))).slice(0, 12).map(en => ({label: en.key, type: en.type, item: en.item}))
    setSuggestions(matches)
    setShowSuggestions(matches.length > 0)
    setSelectedSuggestionIndex(-1)
  }

  const insertWordAtCursor = (w: string) => {
    if (!textareaRef.current) { setUserText(prev => prev + w + ' '); return }
    const t = textareaRef.current
    const s = t.selectionStart, e = t.selectionEnd
    const nv = t.value.substring(0,s) + w + ' ' + t.value.substring(e)
    setUserText(nv)
    requestAnimationFrame(() => { t.focus(); t.setSelectionRange(s + w.length + 1, s + w.length + 1) })
  }

  const handleSuggestionClick = (entry: { label: string; type: 'verb'|'word'; item: VerbEntry | WordEntry }) => {
    const parts = userText.split(/\s+/)
    parts[parts.length - 1] = entry.label
    setUserText(parts.join(' ') + ' ')
    setShowSuggestions(false)
    textareaRef.current?.focus()
    setSelectedPoolEntry({ type: entry.type, item: entry.item })
  }

  // translationQueue subscription
  useEffect(() => {
    const q = query(collection(db, 'translationQueue'), orderBy('createdAt', 'desc'))
    const unsub = onSnapshot(q, (snapshot) => {
      const map: Record<string, { id: string; word: string }> = {}
      snapshot.forEach((d) => { const data = d.data() as any; map[d.id] = { id: d.id, word: data.word ?? d.id } })
      setTranslationQueue(map)
    })
    return () => unsub()
  }, [])

  const translationQueueSet = useMemo(() => new Set(Object.keys(translationQueue)), [translationQueue])

  // search pool
  const filteredWordPool = useMemo(() => {
    if (!searchTerm) return allWords
    return allWords.filter(w => w.toLowerCase().includes(searchTerm.toLowerCase()))
  }, [allWords, searchTerm])

  // flag translation (to Firestore)
  const handleFlagTranslation = async (word: { surface: string; normalized: string; sentenceText: string; sentenceId: number }) => {
    if (!word) return
    const slug = slugify(word.normalized || word.surface)
    if (!slug) return
    setFlaggingWordId(slug)
    setFlagMessage(null)
    try {
      await setDoc(doc(collection(db,'translationQueue'), slug), {
        word: word.normalized,
        surface: word.surface,
        context: word.sentenceText,
        sentenceId: word.sentenceId,
        storyId: activeStory?.story_id ?? null,
        storyTitle: activeStory?.story_title ?? null,
        status: 'pending',
        createdAt: serverTimestamp(),
      }, { merge: true })
      setFlagMessage('Kelime kuyruğa alındı.')
    } catch (err) { console.error(err); setFlagMessage('Kuyruğa eklenemedi. Lütfen tekrar deneyin.') } finally { setFlaggingWordId(null) }
  }

  // helpers
  function findEntryBySurface(surface: string) {
    if (!vocabulary) return null
    const v = (vocabulary.verbs ?? []).find((vb) => vb.infinitive === surface)
    if (v) return { type: 'verb' as const, item: v }
    const other: (keyof VocabularyData)[] = ['commonNouns','adjectives','adverbs','prepositions','timeExpressions','pronouns','conjunctions']
    for (const k of other) {
      const items = (vocabulary as any)[k] as WordEntry[]
      if (!Array.isArray(items)) continue
      const found = items.find(w => w.italian === surface || (w.plural && w.plural === surface) || (w.forms ?? []).includes(surface))
      if (found) return { type: 'word' as const, item: found }
    }
    return null
  }

  // story-related helpers
  function collectStoryUnknownWords(storyData: StorySentence[], voc: VocabularyData) {
    const map = new Map<string, { normalized: string; surface: string; count: number; sentenceText: string; sentenceId: number }>()
    storyData.forEach((s) => {
      const tokens = s.sentence_text.split(/\s+/)
      tokens.forEach((tok) => {
        const t = tok.replace(/[.,!?;:()]/g, '').toLowerCase().trim()
        if (!t) return
        const match = findWordInVocabulary(t, voc)
        if (!match) {
          const existing = map.get(t)
          if (existing) existing.count++
          else map.set(t, { normalized: t, surface: tok, count: 1, sentenceText: s.sentence_text, sentenceId: s.sentence_id })
        }
      })
    })
    return Array.from(map.values()).sort((a,b)=>b.count-a.count)
  }

  function renderSentence(sentence: StorySentence, showHints: boolean, onSelect: (w: { surface: string; normalized: string; sentenceText: string; sentenceId: number }) => void, voc: VocabularyData) {
    const tokens = sentence.sentence_text.split(/(\s+|[.,!?;:])/)
    return tokens.map((token, idx) => {
      const trimmed = token.trim()
      const isWord = !!trimmed && !/^[.,!?;:\s]+$/.test(token)
      if (!isWord) return token
      const normalized = trimmed.toLowerCase()
      const match = findWordInVocabulary(normalized, voc)
      const cls = match ? 'text-white' : 'text-amber-300 underline'
      return (
        <button key={idx} onClick={() => onSelect({ surface: trimmed, normalized, sentenceText: sentence.sentence_text, sentenceId: sentence.sentence_id })} className={cls}>
          {token}
        </button>
      )
    })
  }

  // UI – simplified single-viewport, right panel with tabs
  return (
    <main className="mx-auto max-w-7xl px-4 py-6 lg:py-12 flex flex-col h-screen overflow-hidden">
      <section className="mb-6">
        <h1 className="text-3xl font-semibold">Yazma Atölyesi</h1>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 flex-1 h-full">
        <div className="lg:col-span-8 flex flex-col h-full">
          <div className="rounded-xl p-4 border bg-white/5 flex-1 flex flex-col">
            <div className="flex justify-between items-center mb-2">
              <div className="flex gap-2 items-center">
                {activities.map(a => (
                  <button key={a.key} onClick={() => setSelectedActivity(a.key as any)} className={`px-3 py-1 rounded ${selectedActivity === a.key ? 'bg-blue-600 text-white' : 'bg-white/10 text-white'}`}>{a.label}</button>
                ))}
              </div>
              <div className="flex gap-2">
                <button onClick={() => setUserText('')} className="px-3 py-1 rounded border bg-white/5">Temizle</button>
                <button onClick={() => navigator.clipboard?.writeText(userText)} className="px-3 py-1 rounded border bg-white/5">Kopyala</button>
                <button onClick={() => reload()} className="px-3 py-1 rounded border bg-white/5">🔄 Yenile</button>
              </div>
            </div>

            <textarea ref={textareaRef} value={userText} onChange={handleTextChange} placeholder={selectedActivity === 'diario' ? activityContent.scenario : (selectedActivity === 'traduzione' ? activityContent.sourceText : 'Bir sahne düşün...' )} className="flex-1 w-full p-3 rounded border bg-transparent text-white" />

            {showSuggestions && suggestions.length > 0 && (
              <div className="mt-2 rounded border bg-white/3 p-2 max-h-48 overflow-auto">
                {suggestions.map((s, idx) => (
                  <div key={s.label} className={`py-1 px-2 ${idx === selectedSuggestionIndex ? 'bg-white/10' : ''}`}>
                    <button onClick={() => handleSuggestionClick(s)} className="text-white">{s.label}</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <aside className="lg:col-span-4 flex flex-col gap-4 h-full">
          <div className="rounded-xl p-4 border bg-white/5">
            <div className="flex justify-between">
              <div>
                <h3 className="text-lg font-semibold">Pool / Story</h3>
                <div className="text-sm text-white/60">Kelime havuzu ve hikaye</div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setIsPoolOpen(v => !v)} className="px-3 py-1 rounded border bg-white/5">{isPoolOpen ? 'Hide' : 'Show'}</button>
                <button onClick={() => setSelectedRightTab('story')} className="px-3 py-1 rounded border bg-white/5">Story</button>
              </div>
            </div>
          </div>

          {selectedRightTab === 'pool' && isPoolOpen && (
            <div className="rounded-xl p-4 border bg-white/5 flex flex-col gap-3 flex-1 overflow-auto">
              <input className="px-3 py-2 rounded border bg-transparent" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="Kelime ara..." />
              <div className="grid grid-cols-2 gap-2">
                {filteredWordPool.slice(0, 60).map((w) => (
                  <button key={w} onClick={() => { setSelectedPoolEntry(findEntryBySurface(w)); }} onDoubleClick={() => insertWordAtCursor(w)} onMouseEnter={() => { setHoveredWord(w); setHoveredInfo(findWordInVocabulary(w.toLowerCase(), vocabulary)) }} onMouseLeave={() => { setHoveredWord(null); setHoveredInfo(null) }} className="px-2 py-1 rounded border bg-white/10">{w}</button>
                ))}
              </div>

              {selectedPoolEntry && (
                <div className="mt-2 p-2 rounded border bg-white/6">
                  {selectedPoolEntry.type === 'verb' ? (
                    <div>
                      <div className="font-semibold">{(selectedPoolEntry.item as VerbEntry).infinitive}</div>
                      <div className="text-sm text-white/60">{(selectedPoolEntry.item as VerbEntry).english}</div>
                      {(selectedPoolEntry.item as VerbEntry).present && <div className="text-sm mt-2">Present: {(selectedPoolEntry.item as VerbEntry).present?.join(', ')}</div>}
                    </div>
                  ) : (
                    <div>
                      <div className="font-semibold">{(selectedPoolEntry.item as WordEntry).italian}</div>
                      <div className="text-sm text-white/60">{(selectedPoolEntry.item as WordEntry).english}</div>
                    </div>
                  )}
                  <div className="mt-2 flex gap-2">
                    <button onClick={() => insertWordAtCursor((selectedPoolEntry.type === 'verb' ? (selectedPoolEntry.item as VerbEntry).infinitive : (selectedPoolEntry.item as WordEntry).italian))} className="px-3 py-1 rounded border bg-white/5">Ekle</button>
                    <button onClick={() => setSelectedPoolEntry(null)} className="px-3 py-1 rounded border bg-white/5">Kapat</button>
                  </div>
                </div>
              )}
            </div>
          )}

          {selectedRightTab === 'story' && (
            <div className="rounded-xl p-4 border bg-white/5 flex flex-col gap-3 overflow-auto">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm">{activeStory?.story_title ?? 'Hikaye'}</div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setStoryIndex(Math.max(0, storyIndex - 1))} className="px-2 py-1 rounded border bg-white/5">←</button>
                  <button onClick={() => setStoryIndex(Math.min((stories?.length ?? 1) - 1, storyIndex + 1))} className="px-2 py-1 rounded border bg-white/5">→</button>
                </div>
              </div>
              <div className="space-y-2">
                {(activeStory?.story_data ?? []).map((s) => (
                  <p key={s.sentence_id} className="text-white/90">{renderSentence(s, showHints, (w) => handleFlagTranslation(w), vocabulary)}</p>
                ))}
              </div>
            </div>
          )}

          {selectedRightTab === 'unknown' && activeStory && (
            <div className="rounded-xl p-4 border bg-white/5 overflow-auto">
              <div className="text-sm mb-2">Bilinmeyen Kelimeler</div>
              {collectStoryUnknownWords(activeStory.story_data ?? [], vocabulary).slice(0, 50).map(w => (
                <div key={`${w.normalized}-${w.sentenceId}`} className="mb-2 p-2 rounded border bg-white/6 flex justify-between items-center">
                  <div>
                    <div className="font-semibold">{w.surface}</div>
                    <div className="text-xs text-white/60">{w.sentenceText}</div>
                  </div>
                  <div className="flex gap-2">
                    <button disabled={translationQueueSet.has(slugify(w.normalized))} onClick={() => handleFlagTranslation(w)} className="px-3 py-1 rounded border bg-amber-300/20">Kuyruğa ekle</button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {selectedRightTab === 'results' && (
            <div className="rounded-xl p-4 border bg-white/5 overflow-auto">
              <div className="text-sm mb-2">Vocabulary Snapshot</div>
              {Object.keys(vocabulary ?? {}).map(k => (
                <div key={k} className="mb-2">
                  <div className="font-semibold text-white">{k}</div>
                  <div className="text-sm grid grid-cols-2 gap-2 mt-1">
                    {((vocabulary as any)[k] ?? []).slice(0, 8).map((it: any) => (
                      <button key={it.italian ?? it.infinitive} onClick={() => insertWordAtCursor(it.italian ?? it.infinitive)} className="px-2 py-1 rounded border bg-white/10">{it.italian ?? it.infinitive}</button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </aside>
      </div>
    </main>
  )
}
