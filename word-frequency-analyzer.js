const fs = require('fs');
const path = require('path');

/**
 * Analyzes word frequency in Italian text files
 * Usage: node word-frequency-analyzer.js <input-file> [output-file]
 */

function analyzeWordFrequency(inputFilePath, outputFilePath) {
    // Read the input file
    const text = fs.readFileSync(inputFilePath, 'utf-8');
    
    // Tokenize: split by whitespace and punctuation, but keep words with apostrophes
    const words = text
        .toLowerCase()
        .replace(/[.,;:!?()[\]{}""«»—–\-]/g, ' ') // Remove punctuation except apostrophes
        .split(/\s+/)
        .filter(word => word.length > 0);
    
    // Count word frequencies
    const wordCount = {};
    words.forEach(word => {
        wordCount[word] = (wordCount[word] || 0) + 1;
    });
    
    // Sort by frequency (descending)
    const sortedWords = Object.entries(wordCount)
        .sort((a, b) => b[1] - a[1]);
    
    // Prepare output text
    let output = `Toplam kelime sayısı: ${words.length}\n`;
    output += `Benzersiz kelime sayısı: ${sortedWords.length}\n`;
    output += `\n${'='.repeat(50)}\n\n`;
    output += `SIRA | KELİME | TEKRAR SAYISI\n`;
    output += `${'-'.repeat(50)}\n`;
    
    sortedWords.forEach(([word, count], index) => {
        output += `${(index + 1).toString().padStart(4)} | ${word.padEnd(25)} | ${count}\n`;
    });
    
    // Write to output file
    fs.writeFileSync(outputFilePath, output, 'utf-8');
    
    // Also print summary to console
    console.log(`\n✓ Analiz tamamlandı!`);
    console.log(`✓ Toplam kelime: ${words.length}`);
    console.log(`✓ Benzersiz kelime: ${sortedWords.length}`);
    console.log(`✓ Sonuçlar yazıldı: ${outputFilePath}\n`);
    console.log(`İlk 10 en çok geçen kelime:`);
    sortedWords.slice(0, 10).forEach(([word, count], index) => {
        console.log(`  ${index + 1}. ${word} (${count} kez)`);
    });
}

// Command line interface
if (require.main === module) {
    const args = process.argv.slice(2);
    
    if (args.length < 1) {
        console.log('Kullanım: node word-frequency-analyzer.js <input-file> [output-file]');
        console.log('Örnek: node word-frequency-analyzer.js input.txt output.txt');
        process.exit(1);
    }
    
    const inputFile = args[0];
    const outputFile = args[1] || 'word-frequency-results.txt';
    
    if (!fs.existsSync(inputFile)) {
        console.error(`Hata: Dosya bulunamadı: ${inputFile}`);
        process.exit(1);
    }
    
    analyzeWordFrequency(inputFile, outputFile);
}

module.exports = { analyzeWordFrequency };
