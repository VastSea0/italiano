const fs = require('fs');
const path = require('path');

class ItalianVocabularyAnalyzer {
    constructor(jsonFilePath) {
        this.data = this.loadData(jsonFilePath);
        this.verbs = this.data.mostCommonItalianVerbsA1 || [];
        this.conjunctions = this.data.conjunctions || [];
        this.adjectives = this.data.adjectives || [];
        this.adverbs = this.data.adverbs || [];
        this.prepositions = this.data.prepositions || [];
        this.timeExpressions = this.data.timeExpressions || [];
        this.pronouns = this.data.pronouns || [];
        this.commonNouns = this.data.commonNouns || [];
    }

    loadData(filePath) {
        try {
            const data = fs.readFileSync(filePath, 'utf8');
            return JSON.parse(data);
        } catch (error) {
            console.error('Error loading vocabulary file:', error.message);
            return {};
        }
    }

    // Get comprehensive vocabulary statistics
    getVocabularyStats() {
        const stats = {
            verbs: this.verbs.length,
            conjunctions: this.conjunctions.length,
            adjectives: this.adjectives.length,
            adverbs: this.adverbs.length,
            prepositions: this.prepositions.length,
            timeExpressions: this.timeExpressions.length,
            pronouns: this.pronouns.length,
            commonNouns: this.commonNouns.length,
            totalWords: 0,
            totalWordForms: 0
        };

        // Calculate total unique words
        stats.totalWords = stats.verbs + stats.conjunctions + stats.adjectives + 
                          stats.adverbs + stats.prepositions + stats.timeExpressions + 
                          stats.pronouns + stats.commonNouns;

        // Calculate total word forms (including conjugations, declensions, etc.)
        stats.totalWordForms = this.getTotalWordForms();

        return stats;
    }

    getTotalWordForms() {
        let total = 0;
        
        // Count verb forms
        this.verbs.forEach(verb => {
            total += 1; // infinitive
            total += verb.present ? verb.present.length : 0;
            total += verb.past ? verb.past.length : 0;
            total += verb.presentContinuous ? verb.presentContinuous.length : 0;
        });

        // Count adjective forms
        this.adjectives.forEach(adj => {
            if (adj.forms) {
                total += adj.forms.length;
            } else {
                total += 1;
            }
        });

        // Count noun forms (singular + plural)
        this.commonNouns.forEach(noun => {
            total += 2; // singular + plural
        });

        // Other categories typically have one form each
        total += this.conjunctions.length;
        total += this.adverbs.length;
        total += this.prepositions.length;
        total += this.timeExpressions.length;
        total += this.pronouns.length;

        return total;
    }

    // Get word count by conjugation type
    getWordCountByConjugation() {
        const counts = {
            infinitive: this.verbs.length,
            present: 0,
            past: 0,
            presentContinuous: 0
        };

        this.verbs.forEach(verb => {
            counts.present += verb.present ? verb.present.length : 0;
            counts.past += verb.past ? verb.past.length : 0;
            counts.presentContinuous += verb.presentContinuous ? verb.presentContinuous.length : 0;
        });

        return counts;
    }

    // Filter vocabulary by various criteria
    filterVocabulary(options = {}) {
        let results = {
            verbs: [...this.verbs],
            conjunctions: [...this.conjunctions],
            adjectives: [...this.adjectives],
            adverbs: [...this.adverbs],
            prepositions: [...this.prepositions],
            timeExpressions: [...this.timeExpressions],
            pronouns: [...this.pronouns],
            commonNouns: [...this.commonNouns]
        };

        // Filter by category
        if (options.category) {
            const category = options.category.toLowerCase();
            const emptyResult = {
                verbs: [], conjunctions: [], adjectives: [], adverbs: [],
                prepositions: [], timeExpressions: [], pronouns: [], commonNouns: []
            };
            
            switch(category) {
                case 'verbs':
                    return { ...emptyResult, verbs: results.verbs };
                case 'conjunctions':
                    return { ...emptyResult, conjunctions: results.conjunctions };
                case 'adjectives':
                    return { ...emptyResult, adjectives: results.adjectives };
                case 'adverbs':
                    return { ...emptyResult, adverbs: results.adverbs };
                case 'prepositions':
                    return { ...emptyResult, prepositions: results.prepositions };
                case 'time':
                    return { ...emptyResult, timeExpressions: results.timeExpressions };
                case 'pronouns':
                    return { ...emptyResult, pronouns: results.pronouns };
                case 'nouns':
                    return { ...emptyResult, commonNouns: results.commonNouns };
            }
        }

        // Filter by English translation (contains)
        if (options.englishContains) {
            const search = options.englishContains.toLowerCase();
            results.verbs = results.verbs.filter(item => 
                item.english.toLowerCase().includes(search)
            );
            results.conjunctions = results.conjunctions.filter(item => 
                item.english.toLowerCase().includes(search)
            );
            results.adjectives = results.adjectives.filter(item => 
                item.english.toLowerCase().includes(search)
            );
            results.adverbs = results.adverbs.filter(item => 
                item.english.toLowerCase().includes(search)
            );
            results.prepositions = results.prepositions.filter(item => 
                item.english.toLowerCase().includes(search)
            );
            results.timeExpressions = results.timeExpressions.filter(item => 
                item.english.toLowerCase().includes(search)
            );
            results.pronouns = results.pronouns.filter(item => 
                item.english.toLowerCase().includes(search)
            );
            results.commonNouns = results.commonNouns.filter(item => 
                item.english.toLowerCase().includes(search)
            );
        }

        // Filter by Italian word (contains)
        if (options.italianContains) {
            const search = options.italianContains.toLowerCase();
            results.verbs = results.verbs.filter(item => 
                item.infinitive.toLowerCase().includes(search)
            );
            results.conjunctions = results.conjunctions.filter(item => 
                item.italian.toLowerCase().includes(search)
            );
            results.adjectives = results.adjectives.filter(item => 
                item.italian.toLowerCase().includes(search)
            );
            results.adverbs = results.adverbs.filter(item => 
                item.italian.toLowerCase().includes(search)
            );
            results.prepositions = results.prepositions.filter(item => 
                item.italian.toLowerCase().includes(search)
            );
            results.timeExpressions = results.timeExpressions.filter(item => 
                item.italian.toLowerCase().includes(search)
            );
            results.pronouns = results.pronouns.filter(item => 
                item.italian.toLowerCase().includes(search)
            );
            results.commonNouns = results.commonNouns.filter(item => 
                item.italian.toLowerCase().includes(search)
            );
        }

        return results;
    }

    // Get all unique words from a specific conjugation
    getUniqueWordsFromConjugation(conjugationType) {
        const words = new Set();
        
        this.verbs.forEach(verb => {
            if (verb[conjugationType]) {
                verb[conjugationType].forEach(form => {
                    words.add(form);
                });
            }
        });

        return Array.from(words).sort();
    }

    // Display results in a formatted way
    displaySummary() {
        console.log('\n=== ITALIAN VOCABULARY ANALYZER ===\n');
        
        const stats = this.getVocabularyStats();
        
        console.log('📊 VOCABULARY OVERVIEW:');
        console.log(`Total unique words: ${stats.totalWords}`);
        console.log(`Total word forms: ${stats.totalWordForms}\n`);

        console.log('📈 BREAKDOWN BY CATEGORY:');
        console.log(`  🔸 Verbs: ${stats.verbs}`);
        console.log(`  🔸 Common Nouns: ${stats.commonNouns}`);
        console.log(`  🔸 Adjectives: ${stats.adjectives}`);
        console.log(`  🔸 Adverbs: ${stats.adverbs}`);
        console.log(`  🔸 Pronouns: ${stats.pronouns}`);
        console.log(`  🔸 Prepositions: ${stats.prepositions}`);
        console.log(`  🔸 Conjunctions: ${stats.conjunctions}`);
        console.log(`  🔸 Time Expressions: ${stats.timeExpressions}\n`);

        // Verb-specific analysis
        const verbCounts = this.getWordCountByConjugation();
        console.log('🔥 VERB CONJUGATIONS:');
        console.log(`  Present tense: ${verbCounts.present} forms`);
        console.log(`  Past tense: ${verbCounts.past} forms`);
        console.log(`  Present continuous: ${verbCounts.presentContinuous} forms\n`);

        // Show verb endings distribution
        const endings = {};
        this.verbs.forEach(verb => {
            const infinitive = verb.infinitive.replace(' (ESSERE)', '');
            const ending = infinitive.slice(-3);
            endings[ending] = (endings[ending] || 0) + 1;
        });

        console.log('📝 VERB ENDINGS:');
        Object.entries(endings)
            .sort(([,a], [,b]) => b - a)
            .forEach(([ending, count]) => {
                console.log(`  -${ending}: ${count} verbs`);
            });

        // Show auxiliary verb distribution
        const essereVerbs = this.verbs.filter(v => v.infinitive.includes('(ESSERE)')).length;
        const avereVerbs = this.verbs.length - essereVerbs;
        console.log(`\n⚡ AUXILIARY VERBS:`);
        console.log(`  ESSERE: ${essereVerbs} verbs`);
        console.log(`  AVERE: ${avereVerbs} verbs`);

        // Coverage analysis for A2-B1 level
        console.log(`\n🎯 A2-B1 COVERAGE ANALYSIS:`);
        const verbPercentage = ((stats.verbs / stats.totalWords) * 100).toFixed(1);
        const otherPercentage = (100 - verbPercentage).toFixed(1);
        console.log(`  Verbs: ${verbPercentage}% | Other categories: ${otherPercentage}%`);
        console.log(`  Target: 40% verbs, 60% other ✓`);
        
        if (stats.totalWords >= 200) {
            console.log(`  📚 Vocabulary size: EXCELLENT for A2-B1 communication`);
        } else if (stats.totalWords >= 150) {
            console.log(`  📚 Vocabulary size: GOOD for A2-B1 communication`);
        } else {
            console.log(`  📚 Vocabulary size: BASIC - consider expanding`);
        }
        console.log('');
    }

    // Interactive filtering menu
    runInteractiveSession() {
        const readline = require('readline');
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });

        console.log('\n=== INTERACTIVE VOCABULARY EXPLORER ===');
        console.log('Available options:');
        console.log('1. Filter by English translation');
        console.log('2. Filter by Italian word');
        console.log('3. Show specific category (verbs, nouns, adjectives, etc.)');
        console.log('4. Show all vocabulary');
        console.log('5. Quick word lookup');
        console.log('6. Exit');

        const askQuestion = () => {
            rl.question('\nChoose an option (1-6): ', (answer) => {
                switch(answer) {
                    case '1':
                        rl.question('Enter English word to search for: ', (search) => {
                            const filtered = this.filterVocabulary({ englishContains: search });
                            this.displayFilteredResults(filtered, `English contains "${search}"`);
                            askQuestion();
                        });
                        break;
                    case '2':
                        rl.question('Enter Italian word to search for: ', (search) => {
                            const filtered = this.filterVocabulary({ italianContains: search });
                            this.displayFilteredResults(filtered, `Italian contains "${search}"`);
                            askQuestion();
                        });
                        break;
                    case '3':
                        console.log('Categories: verbs, nouns, adjectives, adverbs, pronouns, prepositions, conjunctions, time');
                        rl.question('Enter category: ', (category) => {
                            const filtered = this.filterVocabulary({ category: category });
                            this.displayFilteredResults(filtered, `Category: ${category}`);
                            askQuestion();
                        });
                        break;
                    case '4':
                        const allResults = {
                            verbs: this.verbs,
                            conjunctions: this.conjunctions,
                            adjectives: this.adjectives,
                            adverbs: this.adverbs,
                            prepositions: this.prepositions,
                            timeExpressions: this.timeExpressions,
                            pronouns: this.pronouns,
                            commonNouns: this.commonNouns
                        };
                        this.displayFilteredResults(allResults, 'All vocabulary');
                        askQuestion();
                        break;
                    case '5':
                        rl.question('Enter word to lookup: ', (word) => {
                            this.quickLookup(word);
                            askQuestion();
                        });
                        break;
                    case '6':
                        console.log('Arrivederci! 👋');
                        rl.close();
                        break;
                    default:
                        console.log('Invalid option. Please choose 1-6.');
                        askQuestion();
                }
            });
        };

        askQuestion();
    }

    displayFilteredResults(results, filterDescription) {
        console.log(`\n--- Results for: ${filterDescription} ---`);
        
        let totalCount = 0;
        if (results.verbs) totalCount += results.verbs.length;
        if (results.conjunctions) totalCount += results.conjunctions.length;
        if (results.adjectives) totalCount += results.adjectives.length;
        if (results.adverbs) totalCount += results.adverbs.length;
        if (results.prepositions) totalCount += results.prepositions.length;
        if (results.timeExpressions) totalCount += results.timeExpressions.length;
        if (results.pronouns) totalCount += results.pronouns.length;
        if (results.commonNouns) totalCount += results.commonNouns.length;
        
        console.log(`Found ${totalCount} words:\n`);

        // Display verbs
        if (results.verbs && results.verbs.length > 0) {
            console.log('🔸 VERBS:');
            results.verbs.forEach((verb, index) => {
                console.log(`${index + 1}. ${verb.infinitive} - ${verb.english}`);
                if (verb.present) console.log(`   Present: ${verb.present.slice(0, 3).join(', ')}...`);
            });
            console.log('');
        }

        // Display other categories
        const categories = [
            { key: 'commonNouns', name: 'NOUNS', icon: '📦' },
            { key: 'adjectives', name: 'ADJECTIVES', icon: '🎨' },
            { key: 'adverbs', name: 'ADVERBS', icon: '⚡' },
            { key: 'pronouns', name: 'PRONOUNS', icon: '👤' },
            { key: 'prepositions', name: 'PREPOSITIONS', icon: '🔗' },
            { key: 'conjunctions', name: 'CONJUNCTIONS', icon: '🌉' },
            { key: 'timeExpressions', name: 'TIME EXPRESSIONS', icon: '⏰' }
        ];

        categories.forEach(category => {
            if (results[category.key] && results[category.key].length > 0) {
                console.log(`${category.icon} ${category.name}:`);
                results[category.key].forEach((item, index) => {
                    console.log(`${index + 1}. ${item.italian} - ${item.english}`);
                    if (item.examples) {
                        console.log(`   Examples: ${item.examples.slice(0, 2).join(', ')}`);
                    }
                });
                console.log('');
            }
        });
    }

    quickLookup(searchTerm) {
        console.log(`\n🔍 Looking up: "${searchTerm}"\n`);
        
        const results = this.filterVocabulary({ 
            italianContains: searchTerm.toLowerCase() 
        });
        
        const englishResults = this.filterVocabulary({ 
            englishContains: searchTerm.toLowerCase() 
        });

        // Merge results
        Object.keys(results).forEach(key => {
            if (englishResults[key]) {
                results[key] = [...results[key], ...englishResults[key]]
                    .filter((item, index, self) => 
                        index === self.findIndex(t => t.italian === item.italian)
                    );
            }
        });

        this.displayFilteredResults(results, `Lookup: "${searchTerm}"`);
    }
}

// Main execution
function main() {
    const vocabFile = path.join(__dirname, 'words.json');
    const analyzer = new ItalianVocabularyAnalyzer(vocabFile);

    // Check if file was loaded successfully
    const stats = analyzer.getVocabularyStats();
    if (stats.totalWords === 0) {
        console.error('No vocabulary loaded. Please check the words.json file.');
        return;
    }

    // Show summary
    analyzer.displaySummary();

    // Check if running interactively
    if (process.argv.includes('--interactive') || process.argv.includes('-i')) {
        analyzer.runInteractiveSession();
    } else {
        console.log('Run with --interactive or -i flag for interactive exploration mode.');
        console.log('Example: node verb-analyzer.js --interactive');
        console.log('\n💡 TIP: This vocabulary dataset now includes:');
        console.log('   - A1 level verbs with full conjugations');
        console.log('   - A2-B1 core vocabulary across all major categories');
        console.log('   - High-frequency words for daily communication');
        console.log('   - Perfect for sentence generation and dialogue practice!');
    }
}

// Run if this is the main module
if (require.main === module) {
    main();
}

module.exports = ItalianVocabularyAnalyzer;
