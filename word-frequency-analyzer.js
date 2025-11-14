const fs = require('fs');
const path = require('path');

/**
 * Analyzes word frequency in Italian text files
 * Usage: node word-frequency-analyzer.js <input-file> [output-file] [--json]
 */

// Italian articles that should be combined with following nouns
const ARTICLES = ['il', 'lo', 'la', 'i', 'gli', 'le', "l'", 'un', 'uno', 'una', "un'"];
// Prepositions that combine with articles
const ARTICULATED_PREPS = ['del', 'dello', 'della', 'dei', 'degli', 'delle', 
                            'al', 'allo', 'alla', 'ai', 'agli', 'alle',
                            'dal', 'dallo', 'dalla', 'dai', 'dagli', 'dalle',
                            'nel', 'nello', 'nella', 'nei', 'negli', 'nelle',
                            'sul', 'sullo', 'sulla', 'sui', 'sugli', 'sulle'];

function analyzeWordFrequency(inputFilePath, outputFilePath, jsonFormat = false) {
    // Read the input file
    const text = fs.readFileSync(inputFilePath, 'utf-8');
    
    // Tokenize: split by whitespace and punctuation, preserve apostrophes
    const rawWords = text
        .toLowerCase()
        .replace(/[.,;:!?()[\]{}""«»—–]/g, ' ') // Remove punctuation except apostrophes and hyphens
        .replace(/\s+/g, ' ')
        .trim()
        .split(' ')
        .filter(word => word.length > 0)
        .filter(word => !/^\d+$/.test(word)); // Remove pure numbers
    
    // Combine articles with following nouns
    const words = [];
    for (let i = 0; i < rawWords.length; i++) {
        const currentWord = rawWords[i];
        const nextWord = rawWords[i + 1];
        
        // If current word is an article and there's a next word
        if (ARTICLES.includes(currentWord) && nextWord) {
            // Check if next word is also an article or preposition (then keep separate)
            if (!ARTICLES.includes(nextWord) && !ARTICULATED_PREPS.includes(nextWord)) {
                // Combine article with noun
                words.push(`${currentWord} ${nextWord}`);
                i++; // Skip next word since we combined it
                continue;
            }
        }
        
        // Keep articulated prepositions combined with following noun
        if (ARTICULATED_PREPS.includes(currentWord) && nextWord) {
            if (!ARTICLES.includes(nextWord) && !ARTICULATED_PREPS.includes(nextWord)) {
                words.push(`${currentWord} ${nextWord}`);
                i++;
                continue;
            }
        }
        
        // Otherwise add word as is
        words.push(currentWord);
    }
    
    // Count word frequencies
    const wordCount = {};
    words.forEach(word => {
        wordCount[word] = (wordCount[word] || 0) + 1;
    });
    
    // Sort by frequency (descending)
    const sortedWords = Object.entries(wordCount)
        .sort((a, b) => b[1] - a[1]);
    
    if (jsonFormat) {
        // Export as JSON
        const jsonData = {
            totalWords: words.length,
            uniqueWords: sortedWords.length,
            inputFile: path.basename(inputFilePath),
            analyzedAt: new Date().toISOString(),
            words: sortedWords.map(([word, count], index) => ({
                rank: index + 1,
                word: word,
                frequency: count
            }))
        };
        
        fs.writeFileSync(outputFilePath, JSON.stringify(jsonData, null, 2), 'utf-8');
        
        console.log(`\n✓ Analiz tamamlandı (JSON formatı)!`);
        console.log(`✓ Toplam kelime: ${words.length}`);
        console.log(`✓ Benzersiz kelime: ${sortedWords.length}`);
        console.log(`✓ JSON dosyası yazıldı: ${outputFilePath}\n`);
    } else {
        // Prepare output text
        let output = `Toplam kelime sayısı: ${words.length}\n`;
        output += `Benzersiz kelime sayısı: ${sortedWords.length}\n`;
        output += `\n${'='.repeat(50)}\n\n`;
        output += `SIRA | KELİME | TEKRAR SAYISI\n`;
        output += `${'-'.repeat(50)}\n`;
        
        sortedWords.forEach(([word, count], index) => {
            output += `${(index + 1).toString().padStart(4)} | ${word.padEnd(30)} | ${count}\n`;
        });
        
        // Write to output file
        fs.writeFileSync(outputFilePath, output, 'utf-8');
        
        // Also print summary to console
        console.log(`\n✓ Analiz tamamlandı!`);
        console.log(`✓ Toplam kelime: ${words.length}`);
        console.log(`✓ Benzersiz kelime: ${sortedWords.length}`);
        console.log(`✓ Sonuçlar yazıldı: ${outputFilePath}\n`);
    }
    
    console.log(`İlk 20 en çok geçen kelime:`);
    sortedWords.slice(0, 20).forEach(([word, count], index) => {
        console.log(`  ${index + 1}. ${word} (${count} kez)`);
    });
}

// Command line interface
if (require.main === module) {
    const args = process.argv.slice(2);
    
    if (args.length < 1) {
        console.log('Kullanım: node word-frequency-analyzer.js <input-file> [output-file] [--json]');
        console.log('Örnek: node word-frequency-analyzer.js input.txt output.txt');
        console.log('Örnek (JSON): node word-frequency-analyzer.js input.txt output.json --json');
        process.exit(1);
    }
    
    const inputFile = args[0];
    const jsonFlag = args.includes('--json');
    
    let outputFile;
    if (args[1] && args[1] !== '--json') {
        outputFile = args[1];
    } else {
        outputFile = jsonFlag ? 'word-frequency-results.json' : 'word-frequency-results.txt';
    }
    
    if (!fs.existsSync(inputFile)) {
        console.error(`Hata: Dosya bulunamadı: ${inputFile}`);
        process.exit(1);
    }
    
    analyzeWordFrequency(inputFile, outputFile, jsonFlag);
}

module.exports = { analyzeWordFrequency };
