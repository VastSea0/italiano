"use client";
import React, { useEffect, useState, useMemo, useRef } from "react";
import { collection, doc, onSnapshot, orderBy, query, serverTimestamp, setDoc } from 'firebase/firestore'
import { useVocabularyResources } from '@/hooks/useVocabularyResources';
import { findWordInVocabulary, slugify, type Story, type StorySentence, type VocabularyData, type WordMatch } from '@/lib/vocabulary'
import { db } from '@/lib/firebase/client'

type StoryUnknownWord = {
  normalized: string
  surface: string
  count: number
  sentenceText: string
  sentenceId: number
}

export default function WritingAtelierPage() {
  // State
  const activities = [
    { key: 'diario', label: 'Günlük Yazısı (Diario)' },
    { key: 'traduzione', label: 'Çeviri (Traduzione)' },
    { key: 'dialogo', label: 'Diyalog (Dialogo)' },
  ]
  const [selectedActivity, setSelectedActivity] = useState('diario')
  const [storyIndex, setStoryIndex] = useState(0)
  const [showHints, setShowHints] = useState(false)
  const [selectedWord, setSelectedWord] = useState<{
    surface: string
    normalized: string
    sentenceText: string
    sentenceId: number
    info: WordMatch | null
  } | null>(null)
  const [translationQueue, setTranslationQueue] = useState<Record<string, { id: string; word: string }>>({})
  const [flaggingWordId, setFlaggingWordId] = useState<string | null>(null)
  const [flagMessage, setFlagMessage] = useState<string | null>(null)
  const [userText, setUserText] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState<number>(-1);
  const [hoveredWord, setHoveredWord] = useState<string | null>(null);
  const [hoveredInfo, setHoveredInfo] = useState<WordMatch | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedSuggestion, setSelectedSuggestion] = useState<string | null>(null);
  // storyIndex state already defined above and used here
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Firestore'dan kelime ve hikaye verilerini çek
  const { vocabulary, stories, loading, error, reload } = useVocabularyResources();

  // Tüm kelime havuzunu tek bir diziye topla
  const allWords = useMemo(() => {
    if (!vocabulary) return [];
    const keys = Object.keys(vocabulary) as Array<keyof typeof vocabulary>;
    const words: string[] = [];
    keys.forEach((key) => {
      if (key === "verbs") {
        words.push(...(vocabulary.verbs?.map((v) => v.infinitive) ?? []));
      } else {
        words.push(...((vocabulary[key] as any[] ?? []).map((w: any) => w.italian)));
      }
    });
    return Array.from(new Set(words)).sort();
  }, [vocabulary]);

  // Aktif hikaye/metin
  const activeStory = stories?.[storyIndex] ?? null;
  const translationSource = activeStory?.story_data?.[0]?.sentence_text ?? "Çevrilecek metin bulunamadı.";

  // Word count helper
  const wordCount = userText.trim().length > 0 ? userText.trim().split(/\s+/).length : 0;

  // activity content & per-activity vocabulary
  const activityContent = useMemo(() => {
    if (selectedActivity === 'diario') {
      return {
        scenario: 'Bugün neler hissettin? Kısa bir günlük yazısı yaz.',
        vocabulary: (vocabulary?.commonNouns ?? []).slice(0, 8).map((w: any) => w.italian),
      }
    }
    if (selectedActivity === 'traduzione') {
      const story = stories?.[storyIndex ?? 0]
      return {
        sourceText: story?.story_data?.[0]?.sentence_text ?? 'Çevrilecek metin bulunamadı.',
        vocabulary: (vocabulary?.verbs ?? []).slice(0, 8).map((w: any) => w.infinitive),
      }
    }
    if (selectedActivity === 'dialogo') {
      return {
        scenario: 'Bir kafede iki arkadaş buluşuyor. Diyalog oluştur.',
        expressions: [
          { category: 'Soru sorma', phrases: ['Come stai?', 'Che cosa vuoi bere?'] },
          { category: 'Kabul etme', phrases: ['Va bene!', 'Certo!'] },
        ],
        vocabulary: (vocabulary?.adjectives ?? []).slice(0, 8).map((w: any) => w.italian),
      }
    }
    return {}
  }, [selectedActivity, vocabulary, stories, storyIndex])

  // Autocomplete: yazarken öneri
  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setUserText(value);
    // Son kelimeyi bul
    const lastWord = value.split(/\s+/).pop()?.toLowerCase() ?? "";
    if (lastWord.length > 1) {
      const filtered = allWords.filter((w) => w.toLowerCase().startsWith(lastWord)).slice(0, 8);
      setSuggestions(filtered);
      setShowSuggestions(filtered.length > 0);
      setSelectedSuggestionIndex(-1);
    } else {
      setShowSuggestions(false);
      setSuggestions([]);
    }
  };

  // Suggestion seçilince
  const handleSuggestionClick = (word: string) => {
    // Son kelimeyi değiştir
    const words = userText.split(/\s+/);
    words[words.length - 1] = word;
    setUserText(words.join(" ") + " ");
    setShowSuggestions(false);
    setSelectedSuggestion(word);
    textareaRef.current?.focus();
    setSelectedSuggestionIndex(-1);
  };

  // Sağdaki kelime havuzunda arama
  const filteredWordPool = useMemo(() => {
    if (!searchTerm) return allWords;
    return allWords.filter((w) => w.toLowerCase().includes(searchTerm.toLowerCase()));
  }, [allWords, searchTerm]);

  // Sync translation queue from Firestore
  useEffect(() => {
    const queueRef = query(collection(db, 'translationQueue'), orderBy('createdAt', 'desc'))
    const unsubscribe = onSnapshot(queueRef, (snapshot) => {
      const map: Record<string, { id: string; word: string }> = {}
      snapshot.forEach((docSnap) => {
        const data = docSnap.data() as any
        map[docSnap.id] = { id: docSnap.id, word: data.word ?? docSnap.id }
      })
      setTranslationQueue(map)
    })
    return () => unsubscribe()
  }, [])

  const translationQueueSet = useMemo(() => new Set(Object.keys(translationQueue)), [translationQueue])

  const handleFlagTranslation = async (selection: { surface: string; normalized: string; sentenceText: string; sentenceId: number }) => {
    if (!selection) return
    const slug = slugify(selection.normalized || selection.surface)
    if (!slug) return
    setFlaggingWordId(slug)
    setFlagMessage(null)
    try {
      await setDoc(doc(collection(db, 'translationQueue'), slug), {
        word: selection.normalized,
        surface: selection.surface,
        context: selection.sentenceText,
        sentenceId: selection.sentenceId,
        storyId: activeStory?.story_id ?? null,
        storyTitle: activeStory?.story_title ?? null,
        status: 'pending',
        createdAt: serverTimestamp(),
      }, { merge: true })
      setFlagMessage('Kelime çeviri kuyruğuna alındı.')
    } catch (err) {
      console.error('Failed to queue translation', err)
      setFlagMessage('Kuyruğa eklenemedi. Lütfen tekrar deneyin.')
    } finally {
      setFlaggingWordId(null)
    }
  }

  const handleTextKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!showSuggestions || suggestions.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedSuggestionIndex((prev) => Math.min(prev + 1, suggestions.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedSuggestionIndex((prev) => Math.max(prev - 1, 0))
    } else if (e.key === 'Enter') {
      if (selectedSuggestionIndex >= 0 && selectedSuggestionIndex < suggestions.length) {
        e.preventDefault()
        handleSuggestionClick(suggestions[selectedSuggestionIndex])
      }
    } else if (e.key === 'Escape') {
      setShowSuggestions(false)
      setSelectedSuggestionIndex(-1)
    }
    // Select with Tab too
    if (e.key === 'Tab' && showSuggestions && suggestions.length > 0) {
      e.preventDefault()
      const idx = selectedSuggestionIndex >= 0 ? selectedSuggestionIndex : 0
      handleSuggestionClick(suggestions[idx])
    }
  }

  const handleQuickFlagWord = (word: StoryUnknownWord) => {
    handleFlagTranslation({ surface: word.surface, normalized: word.normalized, sentenceText: word.sentenceText, sentenceId: word.sentenceId })
  }

  const handleSelectWord = (word: { surface: string; normalized: string; sentenceText: string; sentenceId: number }) => {
    const match = findWordInVocabulary(word.normalized, vocabulary)
    setSelectedWord({ ...word, info: match })
    setFlagMessage(null)
  }

  const insertWordAtCursor = (word: string) => {
    const textarea = textareaRef.current
    if (!textarea) {
      setUserText((prev) => (prev ? prev + ' ' + word + ' ' : word + ' '))
      return
    }
    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const value = textarea.value
    const newValue = value.substring(0, start) + word + ' ' + value.substring(end)
    setUserText(newValue)
    // reposition cursor after the inserted word
    requestAnimationFrame(() => {
      textarea.focus()
      const pos = start + word.length + 1
      textarea.setSelectionRange(pos, pos)
    })
  }

  return (
    <main className="mx-auto max-w-7xl px-4 py-10 lg:py-20 flex flex-col min-h-screen">
      <section className="rounded-3xl border border-white/10 bg-white/5 p-10 text-center shadow-2xl backdrop-blur mb-10">
        <p className="text-xs font-semibold uppercase tracking-[0.5em] text-brand-200">Italiano Studio</p>
        <h1 className="mt-4 text-4xl font-semibold text-white sm:text-5xl">Yazma Atölyesi</h1>
        <p className="mx-auto mt-4 max-w-3xl text-base text-white/70">
          İtalyanca yazma pratiği: solda yazı alanı ve kelime önerileri, sağda kelime havuzu ve çevrilecek metin.
        </p>
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-12 gap-10 flex-1">
          {/* Left column / Mode selector area */}
          <div className="lg:col-span-12 lg:col-start-1">
            <div className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-2xl backdrop-blur mb-6">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.5em] text-brand-200">Mod Seçimi</p>
                  <h3 className="text-lg font-semibold text-white">Aktivite Tipi</h3>
                </div>
                <div className="flex gap-2 items-center">
                  {activities.map((act) => (
                    <button key={act.key} onClick={() => setSelectedActivity(act.key)} className={`filter-btn ${selectedActivity === act.key ? 'active' : ''}`}>
                      {act.label}
                    </button>
                  ))}
                  <button className="inline-flex items-center justify-center rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:border-white/60 hover:bg-white/20 ml-3" onClick={() => reload()}>
                    🔄 Yenile
                  </button>
                </div>
              </div>
            </div>
          </div>
        {/* Sol: Yazma alanı + autocomplete */}
        <div className="rounded-3xl border border-white/10 bg-white/5 p-8 shadow-2xl backdrop-blur relative col-span-12 lg:col-span-8 flex flex-col min-h-[380px]">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-bold text-white">Yazma Alanı</h2>
            <div className="flex items-center gap-3">
              <span className="text-sm text-white/60">{selectedActivity.toUpperCase()}</span>
              <button onClick={() => { setUserText('') }} className="rounded-full border border-white/20 bg-white/5 px-3 py-1 text-sm text-white/80">Temizle</button>
              <button onClick={() => { navigator.clipboard?.writeText(userText) }} className="rounded-full border border-white/20 bg-white/5 px-3 py-1 text-sm text-white/80">Kopyala</button>
              <div className="text-sm text-white/60">{wordCount} kelime</div>
            </div>
          </div>
          <textarea
            ref={textareaRef}
            className="flex-1 resize-none rounded-2xl border border-white/10 bg-slate-950/40 p-5 mb-4 text-white placeholder:text-slate-400 text-lg min-h-[220px]"
            placeholder="İtalyanca metninizi buraya yazın..."
            value={userText}
            onChange={handleTextChange}
            onKeyDown={handleTextKeyDown}
            rows={12}
            autoFocus
          />
          {/* Autocomplete dropdown */}
          {showSuggestions && (
            <ul className="absolute left-0 right-0 top-full z-30 mt-2 bg-slate-900 rounded-2xl shadow-2xl border border-white/10 max-h-64 overflow-auto text-lg">
              {suggestions.map((word) => (
                <li
                  key={word}
                  className={`px-6 py-3 cursor-pointer hover:bg-brand-500/20 text-white transition-all ${selectedSuggestionIndex >= 0 && suggestions[selectedSuggestionIndex] === word ? 'bg-brand-500/40 text-white' : ''}`}
                  onClick={() => handleSuggestionClick(word)}
                >
                  {word}
                </li>
              ))}
            </ul>
          )}
          <div className="text-right text-base text-slate-400 mt-4">Kelime sayısı: {wordCount}</div>
        </div>

        {/* Sağ: Kelime havuzu + çevrilecek metin */}
        <div className="rounded-3xl border border-white/10 bg-white/5 p-8 shadow-2xl backdrop-blur col-span-12 lg:col-span-4 flex flex-col gap-8 min-h-[400px] lg:sticky lg:top-20 lg:h-[calc(100vh-120px)] lg:overflow-auto">
          <div>
            <h2 className="text-2xl font-bold mb-4 text-white">Kelime Havuzu</h2>
            <div className="relative">
            <input
              type="text"
              className="w-full mb-4 rounded-2xl border border-white/10 bg-slate-950/30 p-4 text-white placeholder:text-slate-400 text-lg"
              placeholder="Kelime ara..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
            {searchTerm && (
              <button onClick={() => setSearchTerm('')} className="absolute right-3 top-3 text-sm text-white/60 rounded-md px-2 py-1 hover:bg-white/5">✕</button>
            )}
            </div>
            <div className="max-h-72 overflow-auto border rounded-2xl bg-white/10 p-4">
              {/* Show activity-specific small pool first */}
              {activityContent.vocabulary && activityContent.vocabulary.length > 0 && (
                <div className="mb-4">
                  <div className="text-sm text-white/70 mb-1">Aktivite - Önerilen Kelimeler</div>
                  <div className="flex flex-wrap gap-2 mb-2">
                    {activityContent.vocabulary.map((w: string) => (
                      <button key={w} onClick={() => insertWordAtCursor(w)} className="px-3 py-1 rounded-full bg-white/5 text-white text-sm hover:bg-white/10 transition">{w}</button>
                    ))}
                  </div>
                </div>
              )}
              {loading ? (
                <div className="text-slate-400 text-lg">Yükleniyor...</div>
              ) : error ? (
                <div className="text-red-500 text-lg">{error}</div>
              ) : filteredWordPool.length === 0 ? (
                <div className="text-slate-400 text-lg">Hiç kelime yok.</div>
              ) : (
                <ul className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                  {filteredWordPool.map((word) => (
                    <li key={word} onMouseEnter={() => {
                        setHoveredWord(word)
                        const match = findWordInVocabulary(word.toLowerCase(), vocabulary)
                        setHoveredInfo(match)
                       }} onMouseLeave={() => { setHoveredWord(null); setHoveredInfo(null) }} className="px-4 py-2 rounded-xl bg-white/5 text-white text-lg font-semibold cursor-pointer hover:bg-white/10 transition-all" onClick={() => insertWordAtCursor(word)}>
                      {word}
                    </li>
                  ))}
                </ul>
              )}
              {hoveredInfo && hoveredWord && (
                <div className="word-tooltip text-white hidden lg:block">
                  <div className="text-sm font-semibold">{hoveredWord} {hoveredInfo?.infinitive ? `· ${hoveredInfo.infinitive}` : ''}</div>
                  <div className="text-xs text-white/60">{hoveredInfo.english}</div>
                  <div className="mt-2 text-xs">{hoveredInfo.type} {hoveredInfo.matchType ? `· ${hoveredInfo.matchType}` : ''}</div>
                </div>
              )}
            </div>
          </div>
          <div>
            <h2 className="text-2xl font-bold mb-4 text-white">Çevrilecek Metin</h2>
            <div className="rounded-2xl bg-slate-950/30 p-5 text-white/80 border border-brand-500/20 italic text-lg min-h-[80px]">
              {selectedActivity === 'diario' ? activityContent.scenario : translationSource}
            </div>
            {/* Hikaye seçimi */}
            {stories && stories.length > 1 && (
              <div className="mt-4 flex gap-3 items-center">
                <label htmlFor="storySelect" className="text-base text-white/60">Hikaye seç:</label>
                <select
                      id="storySelect"
                      value={storyIndex}
                      onChange={e => setStoryIndex(Number(e.target.value))}
                  className="rounded-2xl border bg-white/10 text-white px-4 py-2 text-lg"
                >
                  {stories.map((story, idx) => (
                    <option key={story.story_id} value={idx}>{story.story_title}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Story/Reader Section */}
      <section className="mt-8 rounded-3xl border border-white/10 bg-white/5 p-6 shadow-2xl backdrop-blur">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-2xl font-semibold text-white">📖 Interactive Story Reader</h3>
            <p className="text-white/80">Click any word in the story to reveal meanings, conjugations, and usage notes.</p>
          </div>
          <div className="flex items-center gap-3">
            <button className="nav-btn" disabled={storyIndex === 0} onClick={() => setStoryIndex((prev) => Math.max(0, prev - 1))}>← Previous</button>
            <button className="nav-btn" disabled={storyIndex >= (stories?.length ?? 0) - 1} onClick={() => setStoryIndex((prev) => Math.min((stories?.length ?? 1) - 1, prev + 1))}>Next →</button>
            <button onClick={() => setShowHints((prev) => !prev)} className="story-toggle">{showHints ? 'Hide Hints' : 'Show Hints'}</button>
          </div>
        </div>
        <div className="mt-4">
          <div className="story-title text-white font-semibold">{activeStory?.story_title ?? 'Loading story...'}</div>
          <div className="space-y-2 mt-3">
            {(activeStory?.story_data ?? []).map((sentence) => (
              <p key={sentence.sentence_id} className="story-sentence">
                {renderSentence(sentence, showHints, handleSelectWord, vocabulary)}
              </p>
            ))}
          </div>
        </div>
        {selectedWord && (
          <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-4 text-white/90">
            <p className="text-sm uppercase tracking-[0.4em] text-white/50">Selected</p>
            <h4 className="mt-1 text-2xl font-semibold text-white">{selectedWord.surface}</h4>
            {selectedWord.info ? (
              <div className="mt-2 text-sm text-white/80">
                <p><strong>Translation:</strong> {selectedWord.info.english}</p>
                <p><strong>Type:</strong> {selectedWord.info.type}</p>
                {selectedWord.info.matchType && <p><strong>Match:</strong> {selectedWord.info.matchType}</p>}
              </div>
            ) : (
              <div className="mt-2 space-y-3 text-sm text-white/70">
                <p>Bu kelime henüz sözlükte yok.</p>
                <button type="button" onClick={() => handleFlagTranslation(selectedWord)} disabled={translationQueueSet.has(slugify(selectedWord.normalized)) || flaggingWordId === slugify(selectedWord.normalized)} className="w-full rounded-2xl border border-amber-300/40 bg-amber-200/20 px-4 py-2 text-sm font-semibold text-amber-100 disabled:opacity-60">
                  {translationQueueSet.has(slugify(selectedWord.normalized)) ? 'Çeviri kuyruğunda' : flaggingWordId === slugify(selectedWord.normalized) ? 'Gönderiliyor…' : 'Çeviri kuyruğuna ekle'}
                </button>
                {flagMessage && <p className="text-xs text-white/60">{flagMessage}</p>}
              </div>
            )}
          </div>
        )}
      </section>

      {/* Unknown words list */}
      <section className="mt-8 rounded-3xl border border-amber-300/30 bg-amber-200/10 p-6 shadow-2xl backdrop-blur">
        <div className="flex flex-col gap-2">
          <h3 className="text-2xl font-semibold text-white">🚨 Çevrilmesi Gereken Kelimeler</h3>
          <p className="text-sm text-white/80">Hikâyede sözlüğümüzde bulunmayan kelimeler. Bir tıkla admin kuyruğuna gönderip çeviri önceliği oluşturabilirsiniz.</p>
        </div>
        <div className="mt-4 space-y-3">
          {collectStoryUnknownWords(activeStory?.story_data ?? [], vocabulary).slice(0, 15).map((word) => {
            const slug = slugify(word.normalized)
            const alreadyFlagged = translationQueueSet.has(slug)
            const loading = flaggingWordId === slug
            return (
              <div key={`${word.normalized}-${word.sentenceId}`} className="rounded-2xl border border-white/10 bg-slate-950/40 p-4 text-white/80">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-lg font-semibold text-white">{word.surface}</p>
                    <p className="text-xs text-white/50">{word.sentenceText}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-white/20 px-3 py-1 text-xs text-white/70">{word.count}× geçiyor</span>
                    <button type="button" onClick={() => handleQuickFlagWord(word)} disabled={alreadyFlagged || loading} className="rounded-full border border-amber-300/40 bg-amber-200/20 px-4 py-2 text-xs font-semibold text-amber-100 disabled:opacity-60">{alreadyFlagged ? 'Kuyrukta' : loading ? 'Gönderiliyor…' : 'Kuyruğa ekle'}</button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {/* Category filter and vocabulary results */}
      <section className="mt-8">
        <div className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-2xl backdrop-blur">
          <div className="flex items-center justify-between">
            <h3 className="text-2xl font-semibold text-white">📚 Vocabulary Results</h3>
            <p className="text-sm text-white/60">{(vocabulary && Object.keys(vocabulary).length) ?? 0} categories</p>
          </div>
          <div className="mt-4 grid gap-6">
            {/* Basic flattened result list */}
            {Object.keys(vocabulary ?? {}).map((key: string) => (
              <div key={key} className="rounded-md bg-white/5 p-3">
                <div className="font-semibold text-white mb-2">{key}</div>
                <div className="grid grid-cols-3 gap-3">
                    {((vocabulary as any)[key] ?? []).slice(0, 6).map((item: any) => (
                    <div key={item.italian ?? item.infinitive} onClick={() => insertWordAtCursor(item.italian ?? item.infinitive)} className="rounded-md p-2 bg-white/10 text-white cursor-pointer hover:bg-white/20">{item.italian ?? item.infinitive}</div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}

function renderSentence(
  sentence: StorySentence,
  showHints: boolean,
  onSelect: (word: { surface: string; normalized: string; sentenceText: string; sentenceId: number }) => void,
  vocabulary: VocabularyData,
) {
  const tokens = sentence.sentence_text.split(/(\s+|[.,!?;:])/)
  return tokens.map((token, index) => {
    const trimmed = token.trim()
    const isWord = trimmed && !/^[.,!?;:\s]+$/.test(token)
    if (!isWord) return token
    const normalized = trimmed.toLowerCase().replace(/[.,!?;:]/g, '')
    const match = findWordInVocabulary(normalized, vocabulary)
    const statusClass = match ? 'found' : 'not-found'
    return (
      <button
        type="button"
        key={`${normalized}-${sentence.sentence_id}-${index}`}
        className={`story-word ${statusClass}`}
        style={{ borderBottomStyle: showHints ? 'solid' : 'dotted' }}
        onClick={() => onSelect({ surface: token, normalized, sentenceText: sentence.sentence_text, sentenceId: sentence.sentence_id })}
      >
        {token}
      </button>
    )
  })
}

function collectStoryUnknownWords(sentences: StorySentence[] = [], vocabulary: VocabularyData): StoryUnknownWord[] {
  const wordMap = new Map<string, StoryUnknownWord>()
  sentences.forEach((sentence) => {
    const tokens = sentence.sentence_text.split(/(\s+|[.,!?;:])/)    
    tokens.forEach((token) => {
      const trimmed = token.trim()
      const isWord = trimmed && !/^[.,!?;:\s]+$/.test(token)
      if (!isWord) return
      const normalized = trimmed.toLowerCase().replace(/[.,!?;:]/g, '')
      if (!normalized) return
      const match = findWordInVocabulary(normalized, vocabulary)
      if (match) return
      const existing = wordMap.get(normalized)
      if (existing) existing.count += 1
      else wordMap.set(normalized, { normalized, surface: trimmed, count: 1, sentenceText: sentence.sentence_text, sentenceId: sentence.sentence_id })
    })
  })
  return Array.from(wordMap.values()).sort((a, b) => b.count - a.count)
}
