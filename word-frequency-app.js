// Word Frequency Analyzer Web Application
let vocabularyData = {};
let frequencyAnalysisResults = null;

// Italian articles and prepositions for frequency analysis
const ARTICLES = ['il', 'lo', 'la', 'i', 'gli', 'le', "l'", 'un', 'uno', 'una', "un'"];
const ARTICULATED_PREPS = ['del', 'dello', 'della', 'dei', 'degli', 'delle', 
                            'al', 'allo', 'alla', 'ai', 'agli', 'alle',
                            'dal', 'dallo', 'dalla', 'dai', 'dagli', 'dalle',
                            'nel', 'nello', 'nella', 'nei', 'negli', 'nelle',
                            'sul', 'sullo', 'sulla', 'sui', 'sugli', 'sulle'];

// Load vocabulary data on page load
async function loadVocabulary() {
    try {
        const response = await fetch('words.json');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        
        // Safely assign vocabulary data with defaults
        vocabularyData = {
            verbs: Array.isArray(data.mostCommonItalianVerbsA1) ? data.mostCommonItalianVerbsA1 : [],
            conjunctions: Array.isArray(data.conjunctions) ? data.conjunctions : [],
            adjectives: Array.isArray(data.adjectives) ? data.adjectives : [],
            adverbs: Array.isArray(data.adverbs) ? data.adverbs : [],
            prepositions: Array.isArray(data.prepositions) ? data.prepositions : [],
            timeExpressions: Array.isArray(data.timeExpressions) ? data.timeExpressions : [],
            pronouns: Array.isArray(data.pronouns) ? data.pronouns : [],
            commonNouns: Array.isArray(data.commonNouns) ? data.commonNouns : []
        };
        
        console.log('✓ Vocabulary loaded successfully!');
        console.log(`  - Verbs: ${vocabularyData.verbs.length}`);
        console.log(`  - Nouns: ${vocabularyData.commonNouns.length}`);
        console.log(`  - Adjectives: ${vocabularyData.adjectives.length}`);
        console.log(`  - Total: ${Object.values(vocabularyData).reduce((sum, arr) => sum + arr.length, 0)} words`);
    } catch (error) {
        console.error('Error loading vocabulary:', error);
        alert('Error loading vocabulary data. Make sure words.json is available.');
        
        // Initialize with empty arrays to prevent errors
        vocabularyData = {
            verbs: [],
            conjunctions: [],
            adjectives: [],
            adverbs: [],
            prepositions: [],
            timeExpressions: [],
            pronouns: [],
            commonNouns: []
        };
    }
}

// Find word in vocabulary database - returns all possible meanings
function findWordInVocabulary(word) {
    if (!word) return null;
    const cleanWord = word.toLowerCase().trim();
    const allMatches = []; // Tüm eşleşmeleri topla
    
    // Search in verbs
    if (vocabularyData.verbs && Array.isArray(vocabularyData.verbs)) {
        for (let verb of vocabularyData.verbs) {
            if (!verb) continue;
            
            let matchType = null;
            
            // Check infinitive - EXACT match only (tam eşleşme)
            if (verb.infinitive && verb.infinitive.toLowerCase() === cleanWord) {
                matchType = 'infinitive';
            }
            
            // Check present tense - both full form and main verb
            if (!matchType && verb.present && Array.isArray(verb.present)) {
                for (let form of verb.present) {
                    if (!form) continue;
                    const formLower = form.toLowerCase();
                    
                    // Tam eşleşme: "io dico"
                    if (formLower === cleanWord) {
                        matchType = 'present tense';
                        break;
                    }
                    
                    // Fiil kısmını kontrol et: "dico" (son kelime)
                    const words = formLower.split(' ');
                    const mainVerb = words[words.length - 1];
                    if (mainVerb === cleanWord) {
                        matchType = 'present tense';
                        break;
                    }
                }
            }
            
            // Check past tense - only participles, NOT auxiliary verbs
            if (!matchType && verb.past && Array.isArray(verb.past)) {
                for (let form of verb.past) {
                    if (!form) continue;
                    const formLower = form.toLowerCase();
                    
                    // Participle kontrolü: "detto" (son kelime) - SADECE SON KELİME
                    const words = formLower.split(' ');
                    const participle = words[words.length - 1];
                    if (participle === cleanWord && words.length > 1) {
                        // Son kelime ve birden fazla kelime varsa (yani yardımcı fiil + participle)
                        matchType = 'past participle';
                        break;
                    }
                }
            }
            
            // Check present continuous - only gerunds, NOT auxiliary verbs
            if (!matchType && verb.presentContinuous && Array.isArray(verb.presentContinuous)) {
                for (let form of verb.presentContinuous) {
                    if (!form) continue;
                    const formLower = form.toLowerCase();
                    
                    // Gerund kontrolü: "dicendo" (son kelime) - SADECE SON KELİME
                    const words = formLower.split(' ');
                    const gerund = words[words.length - 1];
                    if (gerund === cleanWord && words.length > 1) {
                        // Son kelime ve birden fazla kelime varsa (yani yardımcı fiil + gerund)
                        matchType = 'gerund';
                        break;
                    }
                }
            }
            
            if (matchType) {
                allMatches.push({
                    infinitive: verb.infinitive,
                    english: verb.english || 'N/A',
                    type: 'Verb',
                    matchType: matchType
                });
            }
        }
    }

    // Search in other categories
    const categories = [
        { data: vocabularyData.conjunctions || [], type: 'Conjunction' },
        { data: vocabularyData.adjectives || [], type: 'Adjective' },
        { data: vocabularyData.adverbs || [], type: 'Adverb' },
        { data: vocabularyData.prepositions || [], type: 'Preposition' },
        { data: vocabularyData.timeExpressions || [], type: 'Time Expression' },
        { data: vocabularyData.pronouns || [], type: 'Pronoun' },
        { data: vocabularyData.commonNouns || [], type: 'Noun' }
    ];

    for (let category of categories) {
        if (!Array.isArray(category.data)) continue;
        
        for (let item of category.data) {
            if (!item) continue;
            
            // Check italian word - EXACT match
            if (item.italian && item.italian.toLowerCase() === cleanWord) {
                allMatches.push({
                    word: item.italian,
                    english: item.english || 'N/A',
                    type: category.type,
                    matchType: 'exact'
                });
            }
            
            // Check forms - EXACT match
            if (item.forms && Array.isArray(item.forms)) {
                if (item.forms.some(form => form && form.toLowerCase() === cleanWord)) {
                    allMatches.push({
                        word: item.italian,
                        english: item.english || 'N/A',
                        type: category.type,
                        matchType: 'form'
                    });
                }
            }
        }
    }

    // Eğer hiç eşleşme yoksa null döndür
    if (allMatches.length === 0) {
        return null;
    }
    
    // Duplicate anlamları temizle (aynı infinitive + english + type kombinasyonu)
    const uniqueMatches = [];
    const seen = new Set();
    
    for (let match of allMatches) {
        const key = `${match.infinitive || match.word}|${match.english}|${match.type}`;
        if (!seen.has(key)) {
            seen.add(key);
            uniqueMatches.push(match);
        }
    }
    
    // Eğer birden fazla farklı eşleşme varsa, hepsini birleştir
    if (uniqueMatches.length > 1) {
        const combinedMeanings = uniqueMatches
            .map(m => `${m.english} (${m.type})`)
            .join(' OR ');
            
        return {
            word: cleanWord,
            english: combinedMeanings,
            type: 'Multiple meanings',
            allMatches: uniqueMatches,
            isMultiple: true
        };
    }
    
    // Tek eşleşme varsa direkt döndür
    return uniqueMatches[0];
}

// Analyze word frequency in the text
function analyzeFrequency() {
    const text = document.getElementById('frequencyInput').value.trim();
    
    if (!text) {
        alert('Please paste some Italian text to analyze!');
        return;
    }

    // Tokenize the text
    const rawWords = text
        .toLowerCase()
        .replace(/[.,;:!?()[\]{}""«»—–]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .split(' ')
        .filter(word => word.length > 0)
        .filter(word => !/^\d+$/.test(word));

    // Combine articles with following nouns
    const words = [];
    for (let i = 0; i < rawWords.length; i++) {
        const currentWord = rawWords[i];
        const nextWord = rawWords[i + 1];
        
        if (ARTICLES.includes(currentWord) && nextWord) {
            if (!ARTICLES.includes(nextWord) && !ARTICULATED_PREPS.includes(nextWord)) {
                words.push(`${currentWord} ${nextWord}`);
                i++;
                continue;
            }
        }
        
        if (ARTICULATED_PREPS.includes(currentWord) && nextWord) {
            if (!ARTICLES.includes(nextWord) && !ARTICULATED_PREPS.includes(nextWord)) {
                words.push(`${currentWord} ${nextWord}`);
                i++;
                continue;
            }
        }
        
        words.push(currentWord);
    }

    // Count word frequencies
    const wordCount = {};
    words.forEach(word => {
        wordCount[word] = (wordCount[word] || 0) + 1;
    });

    // Sort by frequency
    const sortedWords = Object.entries(wordCount)
        .sort((a, b) => b[1] - a[1]);

    // Check which words are in our vocabulary
    const wordsWithStatus = sortedWords.map(([word, count], index) => {
        const cleanWord = word.replace(/^(il|lo|la|i|gli|le|un|uno|una|l')\s+/, '');
        const vocabInfo = findWordInVocabulary(cleanWord);
        return {
            rank: index + 1,
            word: word,
            count: count,
            inVocabulary: !!vocabInfo,
            vocabInfo: vocabInfo
        };
    });

    frequencyAnalysisResults = {
        totalWords: words.length,
        uniqueWords: sortedWords.length,
        words: wordsWithStatus,
        knownWords: wordsWithStatus.filter(w => w.inVocabulary).length,
        unknownWords: wordsWithStatus.filter(w => !w.inVocabulary).length
    };

    displayFrequencyResults();
}

// Display analysis results
function displayFrequencyResults() {
    if (!frequencyAnalysisResults) return;

    const results = frequencyAnalysisResults;
    document.getElementById('frequencyResults').style.display = 'block';

    // Display stats
    const coverage = ((results.knownWords / results.uniqueWords) * 100).toFixed(1);
    const statsHTML = `
        <div class="stat-card" style="background: linear-gradient(135deg, #16a085, #138d75);">
            <div class="stat-number">${results.totalWords}</div>
            <div class="stat-label">Total Words</div>
        </div>
        <div class="stat-card" style="background: linear-gradient(135deg, #2980b9, #3498db);">
            <div class="stat-number">${results.uniqueWords}</div>
            <div class="stat-label">Unique Words</div>
        </div>
        <div class="stat-card" style="background: linear-gradient(135deg, #27ae60, #229954);">
            <div class="stat-number">${results.knownWords}</div>
            <div class="stat-label">Known Words</div>
        </div>
        <div class="stat-card" style="background: linear-gradient(135deg, #e74c3c, #c0392b);">
            <div class="stat-number">${results.unknownWords}</div>
            <div class="stat-label">Unknown Words</div>
        </div>
        <div class="stat-card" style="background: linear-gradient(135deg, #f39c12, #e67e22);">
            <div class="stat-number">${coverage}%</div>
            <div class="stat-label">Vocabulary Coverage</div>
        </div>
    `;
    document.getElementById('frequencyStats').innerHTML = statsHTML;

    // Display table and unknown words
    updateFrequencyDisplay();
    displayUnknownWords();
}

// Update frequency table display
function updateFrequencyDisplay() {
    if (!frequencyAnalysisResults) return;

    const highlightKnown = document.getElementById('highlightKnownWords').checked;
    const showOnlyUnknown = document.getElementById('showOnlyUnknown').checked;
    const tableBody = document.getElementById('frequencyTableBody');

    let displayWords = frequencyAnalysisResults.words;
    if (showOnlyUnknown) {
        displayWords = displayWords.filter(w => !w.inVocabulary);
    }

    let tableHTML = '';
    displayWords.forEach(word => {
        const statusBadge = word.inVocabulary 
            ? '<span class="badge badge-success">✓ Known</span>'
            : '<span class="badge badge-danger">✗ Unknown</span>';

        let translation = 'Not in vocabulary';
        let wordType = '-';
        let extraInfo = '';
        
        if (word.vocabInfo) {
            translation = word.vocabInfo.english || 'N/A';
            wordType = word.vocabInfo.type || '-';
            
            // Eğer birden fazla anlam varsa özel gösterim
            if (word.vocabInfo.isMultiple) {
                wordType = '<span class="badge badge-warning">⚠ Multiple</span>';
                extraInfo = `<div style="font-size: 0.85em; margin-top: 5px; color: #e67e22;">
                    <strong>Possible meanings:</strong><br>
                    ${word.vocabInfo.allMatches.map((m, i) => 
                        `${i + 1}. <strong>${m.infinitive || m.word}</strong>: ${m.english} <em>(${m.type}${m.matchType ? ' - ' + m.matchType : ''})</em>`
                    ).join('<br>')}
                </div>`;
            } else if (word.vocabInfo.matchType) {
                // Tek anlam ama match type var
                extraInfo = `<div style="font-size: 0.75em; color: #7f8c8d; margin-top: 3px;">
                    <em>(${word.vocabInfo.matchType})</em>
                </div>`;
            }
        }

        const rowStyle = highlightKnown && word.inVocabulary 
            ? 'style="background: #d5f4e6;"' 
            : '';

        tableHTML += `
            <tr ${rowStyle}>
                <td style="text-align: center; font-weight: bold; color: #95a5a6;">${word.rank}</td>
                <td style="font-weight: bold; color: #2c3e50;">${word.word}</td>
                <td style="text-align: center; font-weight: bold; color: #3498db; font-size: 1.1em;">${word.count}</td>
                <td style="text-align: center;">${statusBadge}</td>
                <td class="text-muted">${translation}${extraInfo}</td>
                <td style="text-align: center;">${typeof wordType === 'string' && wordType !== '-' && !wordType.includes('badge') ? `<span class="badge badge-info">${wordType}</span>` : wordType}</td>
            </tr>
        `;
    });

    tableBody.innerHTML = tableHTML || '<tr><td colspan="6" class="text-center text-muted">No words to display</td></tr>';
}

// Display unknown words as badges
function displayUnknownWords() {
    if (!frequencyAnalysisResults) return;

    const unknownWords = frequencyAnalysisResults.words
        .filter(w => !w.inVocabulary)
        .sort((a, b) => b.count - a.count)
        .slice(0, 50); // Show top 50 unknown words

    const container = document.getElementById('unknownWordsList');
    
    if (unknownWords.length === 0) {
        container.innerHTML = '<p class="text-muted">🎉 Congratulations! All words in your text are in your vocabulary!</p>';
        return;
    }

    let html = '';
    unknownWords.forEach(word => {
        html += `
            <div style="background: #fff3cd; border: 2px solid #ffc107; padding: 8px 12px; border-radius: 15px; display: inline-flex; align-items: center; gap: 5px;">
                <span style="font-weight: bold; color: #856404;">${word.word}</span>
                <span style="background: #ffc107; color: white; padding: 2px 6px; border-radius: 10px; font-size: 0.8em; font-weight: bold;">${word.count}</span>
            </div>
        `;
    });

    container.innerHTML = html;
}

// Clear analysis
function clearFrequencyAnalysis() {
    document.getElementById('frequencyInput').value = '';
    document.getElementById('frequencyResults').style.display = 'none';
    document.getElementById('highlightKnownWords').checked = false;
    document.getElementById('showOnlyUnknown').checked = false;
    frequencyAnalysisResults = null;
}

// Export results as text
function exportFrequencyResults() {
    if (!frequencyAnalysisResults) {
        alert('Please analyze some text first!');
        return;
    }

    const results = frequencyAnalysisResults;
    const date = new Date().toLocaleDateString().replace(/\//g, '-');
    
    let output = `Italian Word Frequency Analysis\n`;
    output += `Analyzed on: ${new Date().toLocaleString()}\n`;
    output += `${'='.repeat(80)}\n\n`;
    output += `STATISTICS:\n`;
    output += `  Total Words: ${results.totalWords}\n`;
    output += `  Unique Words: ${results.uniqueWords}\n`;
    output += `  Known Words: ${results.knownWords}\n`;
    output += `  Unknown Words: ${results.unknownWords}\n`;
    output += `  Vocabulary Coverage: ${((results.knownWords / results.uniqueWords) * 100).toFixed(1)}%\n\n`;
    output += `${'='.repeat(80)}\n\n`;
    output += `WORD FREQUENCY TABLE:\n`;
    output += `${'='.repeat(80)}\n`;
    output += `Rank | Word                           | Count | Status      | Translation\n`;
    output += `${'-'.repeat(80)}\n`;

    results.words.forEach(word => {
        const status = word.inVocabulary ? 'Known  ' : 'Unknown';
        const translation = word.vocabInfo ? word.vocabInfo.english : 'Not in vocabulary';
        output += `${word.rank.toString().padStart(4)} | ${word.word.padEnd(30)} | ${word.count.toString().padStart(5)} | ${status} | ${translation}\n`;
    });

    downloadFile(output, `word-frequency-analysis-${date}.txt`, 'text/plain');
}

// Export results as JSON
function exportFrequencyJSON() {
    if (!frequencyAnalysisResults) {
        alert('Please analyze some text first!');
        return;
    }

    const date = new Date().toISOString();
    const jsonData = {
        analyzedAt: date,
        statistics: {
            totalWords: frequencyAnalysisResults.totalWords,
            uniqueWords: frequencyAnalysisResults.uniqueWords,
            knownWords: frequencyAnalysisResults.knownWords,
            unknownWords: frequencyAnalysisResults.unknownWords,
            coverage: ((frequencyAnalysisResults.knownWords / frequencyAnalysisResults.uniqueWords) * 100).toFixed(1) + '%'
        },
        words: frequencyAnalysisResults.words.map(w => ({
            rank: w.rank,
            word: w.word,
            frequency: w.count,
            inVocabulary: w.inVocabulary,
            translation: w.vocabInfo ? w.vocabInfo.english : null,
            type: w.vocabInfo ? w.vocabInfo.type : null
        }))
    };

    const dateStr = new Date().toLocaleDateString().replace(/\//g, '-');
    downloadFile(JSON.stringify(jsonData, null, 2), `word-frequency-${dateStr}.json`, 'application/json');
}

// Helper function to download files
function downloadFile(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
    console.log(`✓ File exported: ${filename}`);
}

// Load sample text for testing
function loadSampleText() {
    const sampleText = `Il mio nome è Marco e vivo a Roma con la mia famiglia. Ogni giorno vado al lavoro in autobus. 
Mi piace molto il mio lavoro perché incontro molte persone interessanti. 
La sera torno a casa e ceno con mia moglie e i miei figli. 
Nel weekend ci piace andare al parco o visitare i musei della città. 
Roma è una città bellissima con molta storia e cultura. 
Ci sono molti ristoranti dove si può mangiare cibo tradizionale italiano.`;
    
    document.getElementById('frequencyInput').value = sampleText;
}

// Initialize application
loadVocabulary();
