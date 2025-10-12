const fs = require('fs');
const path = require('path');

class ItalianVerbAnalyzer {
    constructor(jsonFilePath) {
        this.verbs = this.loadVerbs(jsonFilePath);
    }

    loadVerbs(filePath) {
        try {
            const data = fs.readFileSync(filePath, 'utf8');
            const parsed = JSON.parse(data);
            return parsed.mostCommonItalianVerbsA1 || [];
        } catch (error) {
            console.error('Error loading verbs file:', error.message);
            return [];
        }
    }

    // Count total words across all conjugations
    getTotalWordCount() {
        let total = 0;
        this.verbs.forEach(verb => {
            // Count infinitive
            total += 1;
            // Count present tense conjugations
            total += verb.present ? verb.present.length : 0;
            // Count past tense conjugations
            total += verb.past ? verb.past.length : 0;
            // Count present continuous conjugations
            total += verb.presentContinuous ? verb.presentContinuous.length : 0;
        });
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

    // Filter verbs by various criteria
    filterVerbs(options = {}) {
        let filtered = [...this.verbs];

        // Filter by English translation (contains)
        if (options.englishContains) {
            const search = options.englishContains.toLowerCase();
            filtered = filtered.filter(verb => 
                verb.english.toLowerCase().includes(search)
            );
        }

        // Filter by infinitive (contains)
        if (options.infinitiveContains) {
            const search = options.infinitiveContains.toLowerCase();
            filtered = filtered.filter(verb => 
                verb.infinitive.toLowerCase().includes(search)
            );
        }

        // Filter by auxiliary verb (ESSERE verbs)
        if (options.auxiliary === 'essere') {
            filtered = filtered.filter(verb => 
                verb.infinitive.includes('(ESSERE)')
            );
        } else if (options.auxiliary === 'avere') {
            filtered = filtered.filter(verb => 
                !verb.infinitive.includes('(ESSERE)')
            );
        }

        // Filter by verb ending
        if (options.ending) {
            filtered = filtered.filter(verb => {
                const infinitive = verb.infinitive.replace(' (ESSERE)', '');
                return infinitive.endsWith(options.ending);
            });
        }

        return filtered;
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
        console.log('\n=== ITALIAN VERBS ANALYZER ===\n');
        
        console.log(`Total number of verbs: ${this.verbs.length}`);
        console.log(`Total word forms: ${this.getTotalWordCount()}\n`);

        const counts = this.getWordCountByConjugation();
        console.log('Word count by conjugation:');
        console.log(`  Infinitives: ${counts.infinitive}`);
        console.log(`  Present tense: ${counts.present}`);
        console.log(`  Past tense: ${counts.past}`);
        console.log(`  Present continuous: ${counts.presentContinuous}\n`);

        // Show verb endings distribution
        const endings = {};
        this.verbs.forEach(verb => {
            const infinitive = verb.infinitive.replace(' (ESSERE)', '');
            const ending = infinitive.slice(-3);
            endings[ending] = (endings[ending] || 0) + 1;
        });

        console.log('Verb endings distribution:');
        Object.entries(endings)
            .sort(([,a], [,b]) => b - a)
            .forEach(([ending, count]) => {
                console.log(`  -${ending}: ${count} verbs`);
            });

        // Show auxiliary verb distribution
        const essereVerbs = this.verbs.filter(v => v.infinitive.includes('(ESSERE)')).length;
        const avereVerbs = this.verbs.length - essereVerbs;
        console.log(`\nAuxiliary verb distribution:`);
        console.log(`  ESSERE: ${essereVerbs} verbs`);
        console.log(`  AVERE: ${avereVerbs} verbs\n`);
    }

    // Interactive filtering menu
    runInteractiveSession() {
        const readline = require('readline');
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });

        console.log('\n=== INTERACTIVE FILTER MODE ===');
        console.log('Available filters:');
        console.log('1. Filter by English translation');
        console.log('2. Filter by Italian infinitive');
        console.log('3. Filter by auxiliary verb (essere/avere)');
        console.log('4. Filter by verb ending (-are, -ere, -ire)');
        console.log('5. Show all verbs');
        console.log('6. Exit');

        const askQuestion = () => {
            rl.question('\nChoose an option (1-6): ', (answer) => {
                switch(answer) {
                    case '1':
                        rl.question('Enter English word to search for: ', (search) => {
                            const filtered = this.filterVerbs({ englishContains: search });
                            this.displayFilteredResults(filtered, `English contains "${search}"`);
                            askQuestion();
                        });
                        break;
                    case '2':
                        rl.question('Enter Italian word to search for: ', (search) => {
                            const filtered = this.filterVerbs({ infinitiveContains: search });
                            this.displayFilteredResults(filtered, `Italian contains "${search}"`);
                            askQuestion();
                        });
                        break;
                    case '3':
                        rl.question('Enter auxiliary verb (essere/avere): ', (aux) => {
                            const filtered = this.filterVerbs({ auxiliary: aux.toLowerCase() });
                            this.displayFilteredResults(filtered, `Uses auxiliary "${aux}"`);
                            askQuestion();
                        });
                        break;
                    case '4':
                        rl.question('Enter verb ending (-are, -ere, -ire): ', (ending) => {
                            const filtered = this.filterVerbs({ ending: ending });
                            this.displayFilteredResults(filtered, `Ends with "${ending}"`);
                            askQuestion();
                        });
                        break;
                    case '5':
                        this.displayFilteredResults(this.verbs, 'All verbs');
                        askQuestion();
                        break;
                    case '6':
                        console.log('Goodbye!');
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

    displayFilteredResults(verbs, filterDescription) {
        console.log(`\n--- Results for: ${filterDescription} ---`);
        console.log(`Found ${verbs.length} verbs:\n`);

        verbs.forEach((verb, index) => {
            console.log(`${index + 1}. ${verb.infinitive} - ${verb.english}`);
            console.log(`   Present: ${verb.present.join(', ')}`);
            if (verb.past) {
                console.log(`   Past: ${verb.past.join(', ')}`);
            }
            console.log('');
        });
    }
}

// Main execution
function main() {
    const verbFile = path.join(__dirname, 'words.json');
    const analyzer = new ItalianVerbAnalyzer(verbFile);

    // Check if file was loaded successfully
    if (analyzer.verbs.length === 0) {
        console.error('No verbs loaded. Please check the words.json file.');
        return;
    }

    // Show summary
    analyzer.displaySummary();

    // Check if running interactively
    if (process.argv.includes('--interactive') || process.argv.includes('-i')) {
        analyzer.runInteractiveSession();
    } else {
        console.log('Run with --interactive or -i flag for interactive filtering mode.');
        console.log('Example: node verb-analyzer.js --interactive');
    }
}

// Run if this is the main module
if (require.main === module) {
    main();
}

module.exports = ItalianVerbAnalyzer;
