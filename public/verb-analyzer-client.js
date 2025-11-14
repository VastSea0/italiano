        let vocabularyData = {};
        let currentCategory = 'all';
        let storyData = {};
        let currentStoryIndex = 0;
        let showHints = false;
        let frequencyAnalysisResults = null;

        // Italian articles and prepositions for frequency analysis
        const ARTICLES = ['il', 'lo', 'la', 'i', 'gli', 'le', "l'", 'un', 'uno', 'una', "un'"];
        const ARTICULATED_PREPS = ['del', 'dello', 'della', 'dei', 'degli', 'delle', 
                                    'al', 'allo', 'alla', 'ai', 'agli', 'alle',
                                    'dal', 'dallo', 'dalla', 'dai', 'dagli', 'dalle',
                                    'nel', 'nello', 'nella', 'nei', 'negli', 'nelle',
                                    'sul', 'sullo', 'sulla', 'sui', 'sugli', 'sulle'];

        // Load the JSON data
        async function loadVocabulary() {
            try {
                const response = await fetch('words.json');
                const data = await response.json();
                vocabularyData = {
                    verbs: data.mostCommonItalianVerbsA1 || [],
                    conjunctions: data.conjunctions || [],
                    adjectives: data.adjectives || [],
                    adverbs: data.adverbs || [],
                    prepositions: data.prepositions || [],
                    timeExpressions: data.timeExpressions || [],
                    pronouns: data.pronouns || [],
                    commonNouns: data.commonNouns || []
                };
                await loadStory();
                initializeApp();
            } catch (error) {
                console.error('Error loading vocabulary:', error);
                document.getElementById('vocabularyContent').innerHTML = 
                    '<div class="no-results">Error loading vocabulary data. Make sure words.json is in the same directory.</div>';
            }
        }

        // Load the story data
        async function loadStory() {
            try {
                const response = await fetch('story.json');
                const data = await response.json();
                storyData = data.stories || [data]; // Support both single story and multiple stories format
            } catch (error) {
                console.error('Error loading story:', error);
                storyData = [{
                    story_title: "Story not available",
                    story_level: "A1",
                    total_sentences: 0,
                    story_data: []
                }];
            }
        }

        function initializeApp() {
            updateStats();
            showCategory('all');
            setupEventListeners();
            displayStory();
        }

        function updateStats() {
            const stats = calculateStats();
            
            const statsHTML = `
                <div class="stat-card">
                    <div class="stat-number">${stats.totalWords}</div>
                    <div class="stat-label">Total Words</div>
                </div>
                <div class="stat-card">
                    <div class="stat-number">${stats.totalWordForms}</div>
                    <div class="stat-label">Word Forms</div>
                </div>
                <div class="stat-card">
                    <div class="stat-number">${stats.verbs}</div>
                    <div class="stat-label">Verbs</div>
                </div>
                <div class="stat-card">
                    <div class="stat-number">${stats.nouns}</div>
                    <div class="stat-label">Nouns</div>
                </div>
                <div class="stat-card">
                    <div class="stat-number">${stats.adjectives}</div>
                    <div class="stat-label">Adjectives</div>
                </div>
                <div class="stat-card">
                    <div class="stat-number">${((stats.verbs / stats.totalWords) * 100).toFixed(1)}%</div>
                    <div class="stat-label">Verbs Ratio</div>
                </div>
            `;

            document.getElementById('statsGrid').innerHTML = statsHTML;
        }

        function calculateStats() {
            const stats = {
                verbs: vocabularyData.verbs.length,
                nouns: vocabularyData.commonNouns.length,
                adjectives: vocabularyData.adjectives.length,
                adverbs: vocabularyData.adverbs.length,
                pronouns: vocabularyData.pronouns.length,
                prepositions: vocabularyData.prepositions.length,
                conjunctions: vocabularyData.conjunctions.length,
                timeExpressions: vocabularyData.timeExpressions.length,
                totalWords: 0,
                totalWordForms: 0
            };

            stats.totalWords = stats.verbs + stats.nouns + stats.adjectives + stats.adverbs + 
                              stats.pronouns + stats.prepositions + stats.conjunctions + stats.timeExpressions;

            // Calculate word forms
            let forms = 0;
            vocabularyData.verbs.forEach(verb => {
                forms += 1; // infinitive
                forms += verb.present ? verb.present.length : 0;
                forms += verb.past ? verb.past.length : 0;
                forms += verb.presentContinuous ? verb.presentContinuous.length : 0;
            });
            forms += stats.nouns * 2; // singular + plural
            forms += stats.adjectives * 2; // masculine/feminine average
            forms += stats.adverbs + stats.pronouns + stats.prepositions + stats.conjunctions + stats.timeExpressions;
            
            stats.totalWordForms = forms;
            return stats;
        }

        function showCategory(category) {
            currentCategory = category;
            
            // Update active button
            document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
            event?.target?.classList.add('active') || 
                document.querySelector(`[onclick="showCategory('${category}')"]`).classList.add('active');

            const filteredData = filterVocabulary();
            displayVocabulary(filteredData);
        }

        function filterVocabulary() {
            const englishFilter = document.getElementById('englishFilter').value.toLowerCase();
            const italianFilter = document.getElementById('italianFilter').value.toLowerCase();

            let result = {};

            // Apply category filter
            if (currentCategory === 'all') {
                result = { ...vocabularyData };
            } else {
                result = Object.keys(vocabularyData).reduce((acc, key) => {
                    acc[key] = [];
                    return acc;
                }, {});

                switch (currentCategory) {
                    case 'verbs': result.verbs = vocabularyData.verbs; break;
                    case 'nouns': result.commonNouns = vocabularyData.commonNouns; break;
                    case 'adjectives': result.adjectives = vocabularyData.adjectives; break;
                    case 'adverbs': result.adverbs = vocabularyData.adverbs; break;
                    case 'pronouns': result.pronouns = vocabularyData.pronouns; break;
                    case 'prepositions': result.prepositions = vocabularyData.prepositions; break;
                    case 'conjunctions': result.conjunctions = vocabularyData.conjunctions; break;
                    case 'time': result.timeExpressions = vocabularyData.timeExpressions; break;
                }
            }

            // Apply text filters
            if (englishFilter || italianFilter) {
                Object.keys(result).forEach(key => {
                    result[key] = result[key].filter(item => {
                        const englishMatch = !englishFilter || item.english.toLowerCase().includes(englishFilter);
                        const italianText = item.infinitive || item.italian || '';
                        const italianMatch = !italianFilter || italianText.toLowerCase().includes(italianFilter);
                        return englishMatch && italianMatch;
                    });
                });
            }

            return result;
        }

        function displayVocabulary(data) {
            let html = '';

            // Display verbs
            if (data.verbs && data.verbs.length > 0) {
                html += createCategorySection('🔸 Verbs', data.verbs, 'verb');
            }

            // Display other categories
            const categories = [
                { key: 'commonNouns', name: '📦 Common Nouns', type: 'noun' },
                { key: 'adjectives', name: '🎨 Adjectives', type: 'adjective' },
                { key: 'adverbs', name: '⚡ Adverbs', type: 'adverb' },
                { key: 'pronouns', name: '👤 Pronouns', type: 'pronoun' },
                { key: 'prepositions', name: '🔗 Prepositions', type: 'preposition' },
                { key: 'conjunctions', name: '🌉 Conjunctions', type: 'conjunction' },
                { key: 'timeExpressions', name: '⏰ Time Expressions', type: 'time' }
            ];

            categories.forEach(category => {
                if (data[category.key] && data[category.key].length > 0) {
                    html += createCategorySection(category.name, data[category.key], category.type);
                }
            });

            if (!html) {
                html = '<div class="no-results">No vocabulary matches your current filters.</div>';
            }

            document.getElementById('vocabularyContent').innerHTML = html;
        }

        function createCategorySection(title, items, type) {
            let itemsHtml = '';

            items.forEach(item => {
                if (type === 'verb') {
                    itemsHtml += createVerbItem(item);
                } else {
                    itemsHtml += createWordItem(item, type);
                }
            });

            return `
                <div class="category-section">
                    <div class="category-title">${title} (${items.length})</div>
                    <div class="word-grid">
                        ${itemsHtml}
                    </div>
                </div>
            `;
        }

        function createVerbItem(verb) {
            const isEssere = verb.infinitive.includes('(ESSERE)');
            
            return `
                <div class="word-item">
                    <div class="word-main">
                        <span class="word-italian">${verb.infinitive}</span>
                        <span class="word-english">${verb.english}</span>
                    </div>
                    ${verb.present ? `
                        <div class="word-details">
                            <strong>Present:</strong> ${verb.present.slice(0, 3).join(', ')}...
                        </div>
                    ` : ''}
                    ${verb.past ? `
                        <div class="word-details">
                            <strong>Past:</strong> ${verb.past.slice(0, 2).join(', ')}...
                        </div>
                    ` : ''}
                    <div class="word-details">
                        <strong>Auxiliary:</strong> ${isEssere ? 'ESSERE' : 'AVERE'}
                    </div>
                </div>
            `;
        }

        function createWordItem(item, type) {
            let detailsHtml = '';
            
            if (item.forms) {
                detailsHtml += `<div class="word-details"><strong>Forms:</strong> ${item.forms.join(', ')}</div>`;
            }
            if (item.gender && item.plural) {
                detailsHtml += `<div class="word-details"><strong>Gender:</strong> ${item.gender} | <strong>Plural:</strong> ${item.plural}</div>`;
            }
            if (item.type) {
                detailsHtml += `<div class="word-details"><strong>Type:</strong> ${item.type}</div>`;
            }
            if (item.usage) {
                detailsHtml += `<div class="word-details"><strong>Usage:</strong> ${item.usage}</div>`;
            }
            if (item.category) {
                detailsHtml += `<div class="word-details"><strong>Category:</strong> ${item.category}</div>`;
            }

            return `
                <div class="word-item">
                    <div class="word-main">
                        <span class="word-italian">${item.italian}</span>
                        <span class="word-english">${item.english}</span>
                    </div>
                    ${detailsHtml}
                    ${item.examples ? `
                        <div class="word-examples">
                            <strong>Examples:</strong> ${item.examples.slice(0, 2).join(' • ')}
                        </div>
                    ` : ''}
                </div>
            `;
        }

        function applyFilters() {
            const filteredData = filterVocabulary();
            displayVocabulary(filteredData);
        }

        function clearFilters() {
            document.getElementById('englishFilter').value = '';
            document.getElementById('italianFilter').value = '';
            showCategory(currentCategory);
        }

        function setupEventListeners() {
            // Real-time filtering
            document.getElementById('englishFilter').addEventListener('input', applyFilters);
            document.getElementById('italianFilter').addEventListener('input', applyFilters);
        }

        // Story functionality
        function displayStory() {
            if (!storyData || !Array.isArray(storyData) || storyData.length === 0) {
                document.getElementById('storyContent').innerHTML = '<div class="no-results">No stories available</div>';
                return;
            }

            // Populate story selector
            const storySelect = document.getElementById('storySelect');
            storySelect.innerHTML = '';
            storyData.forEach((story, index) => {
                const option = document.createElement('option');
                option.value = index;
                option.textContent = `${index + 1}. ${story.story_title}`;
                if (index === currentStoryIndex) option.selected = true;
                storySelect.appendChild(option);
            });

            // Update navigation buttons
            updateNavigationButtons();

            // Display current story
            displayCurrentStory();
        }

        function displayCurrentStory() {
            const currentStory = storyData[currentStoryIndex];
            if (!currentStory || !currentStory.story_data) {
                document.getElementById('storyContent').innerHTML = '<div class="no-results">Story not available</div>';
                return;
            }

            document.getElementById('storyTitle').textContent = currentStory.story_title;
            document.getElementById('storyLevel').textContent = `Level: ${currentStory.story_level}`;
            document.getElementById('storyProgress').textContent = `${currentStory.story_data.length}/${currentStory.total_sentences} sentences`;

            let storyHTML = '';
            currentStory.story_data.forEach((sentence, index) => {
                const words = sentence.sentence_text.split(/(\s+|[.,!?;:])/);
                let sentenceHTML = '';

                words.forEach(word => {
                    if (word.trim() && !/^[.,!?;:\s]+$/.test(word)) {
                        const cleanWord = word.toLowerCase().replace(/[.,!?;:]/g, '');
                        const wordInfo = findWordInVocabulary(cleanWord);
                        const className = wordInfo ? 'story-word found' : 'story-word not-found';
                        sentenceHTML += `<span class="${className}" data-word="${cleanWord}" onclick="showWordTooltip(event, '${cleanWord}')">${word}</span>`;
                    } else {
                        sentenceHTML += word;
                    }
                });

                storyHTML += `<div class="story-sentence">${sentenceHTML}</div>`;
            });

            document.getElementById('storyContent').innerHTML = storyHTML;
        }

        function changeStory() {
            currentStoryIndex = parseInt(document.getElementById('storySelect').value);
            displayCurrentStory();
            updateNavigationButtons();
        }

        function previousStory() {
            if (currentStoryIndex > 0) {
                currentStoryIndex--;
                document.getElementById('storySelect').value = currentStoryIndex;
                displayCurrentStory();
                updateNavigationButtons();
            }
        }

        function nextStory() {
            if (currentStoryIndex < storyData.length - 1) {
                currentStoryIndex++;
                document.getElementById('storySelect').value = currentStoryIndex;
                displayCurrentStory();
                updateNavigationButtons();
            }
        }

        function updateNavigationButtons() {
            const prevBtn = document.getElementById('prevBtn');
            const nextBtn = document.getElementById('nextBtn');
            
            prevBtn.disabled = currentStoryIndex === 0;
            nextBtn.disabled = currentStoryIndex === storyData.length - 1;
        }

        function findWordInVocabulary(word) {
            // Search in verbs (check infinitive and conjugated forms)
            for (let verb of vocabularyData.verbs) {
                if (verb.infinitive.toLowerCase().includes(word)) return verb;
                if (verb.present && verb.present.some(form => form.toLowerCase().includes(word))) return verb;
                if (verb.past && verb.past.some(form => form.toLowerCase().includes(word))) return verb;
                if (verb.presentContinuous && verb.presentContinuous.some(form => form.toLowerCase().includes(word))) return verb;
            }

            // Search in other categories
            const categories = ['conjunctions', 'adjectives', 'adverbs', 'prepositions', 'timeExpressions', 'pronouns', 'commonNouns'];
            for (let category of categories) {
                for (let item of vocabularyData[category]) {
                    if (item.italian && item.italian.toLowerCase() === word) return item;
                    if (item.forms && item.forms.some(form => form.toLowerCase() === word)) return item;
                }
            }

            return null;
        }

        function showWordTooltip(event, word) {
            // Remove existing tooltips
            document.querySelectorAll('.word-tooltip').forEach(tooltip => tooltip.remove());

            const wordInfo = findWordInVocabulary(word);
            if (!wordInfo) {
                return;
            }

            const tooltip = document.createElement('div');
            tooltip.className = 'word-tooltip';
            tooltip.style.display = 'block';

            let tooltipHTML = `
                <div class="tooltip-word">${wordInfo.infinitive || wordInfo.italian}</div>
                <div class="tooltip-translation">${wordInfo.english}</div>
                <div class="tooltip-details">
            `;

            if (wordInfo.infinitive) { // It's a verb
                tooltipHTML += `<strong>Type:</strong> Verb<br>`;
                if (wordInfo.present) {
                    tooltipHTML += `<div class="tooltip-conjugations">
                        <strong>Present:</strong> ${wordInfo.present.slice(0, 3).join(', ')}...
                    </div>`;
                }
                if (wordInfo.past) {
                    tooltipHTML += `<div class="tooltip-conjugations">
                        <strong>Past:</strong> ${wordInfo.past.slice(0, 2).join(', ')}...
                    </div>`;
                }
            } else {
                if (wordInfo.type) tooltipHTML += `<strong>Type:</strong> ${wordInfo.type}<br>`;
                if (wordInfo.gender) tooltipHTML += `<strong>Gender:</strong> ${wordInfo.gender}<br>`;
                if (wordInfo.plural) tooltipHTML += `<strong>Plural:</strong> ${wordInfo.plural}<br>`;
                if (wordInfo.usage) tooltipHTML += `<strong>Usage:</strong> ${wordInfo.usage}<br>`;
                if (wordInfo.forms) tooltipHTML += `<strong>Forms:</strong> ${wordInfo.forms.join(', ')}<br>`;
            }

            tooltipHTML += `</div>`;
            tooltip.innerHTML = tooltipHTML;

            event.target.appendChild(tooltip);

            // Position tooltip
            const rect = event.target.getBoundingClientRect();
            const tooltipRect = tooltip.getBoundingClientRect();
            
            if (rect.top - tooltipRect.height < 0) {
                tooltip.style.bottom = 'auto';
                tooltip.style.top = '100%';
                tooltip.style.transform = 'translateX(-50%)';
            }

            // Auto-hide tooltip after 5 seconds
            setTimeout(() => {
                if (tooltip.parentNode) {
                    tooltip.remove();
                }
            }, 5000);

            // Hide tooltip when clicking elsewhere
            document.addEventListener('click', function hideTooltip(e) {
                if (!tooltip.contains(e.target) && e.target !== event.target) {
                    tooltip.remove();
                    document.removeEventListener('click', hideTooltip);
                }
            });
        }

        function toggleStoryMode() {
            showHints = !showHints;
            const toggle = document.getElementById('storyToggle');
            const words = document.querySelectorAll('.story-word');

            if (showHints) {
                toggle.textContent = 'Hide Hints';
                words.forEach(word => {
                    word.style.borderBottomStyle = 'solid';
                });
            } else {
                toggle.textContent = 'Show Hints';
                words.forEach(word => {
                    word.style.borderBottomStyle = 'dotted';
                });
            }
        }

        // Load vocabulary when page loads
        loadVocabulary();

        // Modal and Export functionality
        let selectedTemplate = 'flashcard';

        function openExportModal() {
            document.getElementById('exportModal').style.display = 'block';
            // Set current category as default
            document.getElementById('wordGroupSelect').value = currentCategory;
            updateConjugationVisibility();
            updateGridConfigVisibility();
            updateGridPreview();
        }

        function closeExportModal() {
            document.getElementById('exportModal').style.display = 'none';
        }

        function updateConjugationVisibility() {
            const wordGroup = document.getElementById('wordGroupSelect').value;
            const conjugationGroup = document.getElementById('conjugationGroup');
            conjugationGroup.style.display = wordGroup === 'verbs' ? 'block' : 'none';
        }

        // Event listeners for modal
        document.getElementById('wordGroupSelect').addEventListener('change', updateConjugationVisibility);

        // Template selection
        document.querySelectorAll('.template-option').forEach(option => {
            option.addEventListener('click', function() {
                document.querySelectorAll('.template-option').forEach(opt => opt.classList.remove('selected'));
                this.classList.add('selected');
                selectedTemplate = this.dataset.template;
                updateGridConfigVisibility();
            });
        });

        // Grid configuration listeners
        document.getElementById('columnsSelect').addEventListener('change', updateGridPreview);
        document.getElementById('rowsSelect').addEventListener('change', updateGridPreview);

        function updateGridConfigVisibility() {
            const gridConfigGroup = document.getElementById('gridConfigGroup');
            gridConfigGroup.style.display = selectedTemplate === 'flashcard' ? 'block' : 'none';
        }

        function updateGridPreview() {
            const columns = parseInt(document.getElementById('columnsSelect').value);
            const rows = parseInt(document.getElementById('rowsSelect').value);
            const cardsPerPage = columns * rows;
            document.getElementById('gridPreview').textContent = 
                `📄 Preview: ${cardsPerPage} flashcards per page (${columns}×${rows} grid)`;
        }

        // Close modal when clicking outside
        window.addEventListener('click', function(event) {
            const modal = document.getElementById('exportModal');
            if (event.target === modal) {
                closeExportModal();
            }
        });

        function generateCustomPDF() {
            const { jsPDF } = window.jspdf;
            
            const wordGroup = document.getElementById('wordGroupSelect').value;
            const conjugation = document.getElementById('conjugationSelect').value;
            
            // Get filtered data based on selections
            const exportData = getCustomExportData(wordGroup, conjugation);
            
            if (exportData.length === 0) {
                alert('No words match your selection criteria.');
                return;
            }

            try {
                const doc = new jsPDF();
                
                // Generate PDF based on selected template
                switch (selectedTemplate) {
                    case 'flashcard':
                        generateFlashcardPDF(doc, exportData, wordGroup, conjugation);
                        break;
                    case 'table':
                        generateTablePDF(doc, exportData, wordGroup, conjugation);
                        break;
                    case 'list':
                        generateListPDF(doc, exportData, wordGroup, conjugation);
                        break;
                }

                // Generate filename
                const templateName = selectedTemplate;
                const groupName = wordGroup === 'all' ? 'all_vocabulary' : wordGroup;
                const conjugationName = conjugation === 'all' ? '' : `_${conjugation}`;
                const date = new Date().toLocaleDateString().replace(/\//g, '-');
                const filename = `${groupName}${conjugationName}_${templateName}_${date}.pdf`;

                doc.save(filename);
                closeExportModal();
                
            } catch (error) {
                console.error('Error generating PDF:', error);
                alert('Error generating PDF. Please try again.');
            }
        }

        function getCustomExportData(wordGroup, conjugation) {
            let data = [];
            
            // Get base data based on word group
            if (wordGroup === 'all') {
                // Include all categories
                Object.keys(vocabularyData).forEach(key => {
                    if (vocabularyData[key] && vocabularyData[key].length > 0) {
                        data.push(...vocabularyData[key].map(item => ({
                            ...item,
                            category: getCategoryName(key)
                        })));
                    }
                });
            } else {
                // Get specific category
                const dataKey = getDataKey(wordGroup);
                if (vocabularyData[dataKey]) {
                    data = vocabularyData[dataKey].map(item => ({
                        ...item,
                        category: getCategoryName(dataKey)
                    }));
                }
            }

            // Filter by conjugation for verbs
            if (wordGroup === 'verbs' && conjugation !== 'all') {
                data = data.map(verb => {
                    const filteredVerb = { ...verb };
                    switch (conjugation) {
                        case 'infinitive':
                            // Keep only infinitive
                            delete filteredVerb.present;
                            delete filteredVerb.past;
                            delete filteredVerb.presentContinuous;
                            break;
                        case 'present':
                            delete filteredVerb.past;
                            delete filteredVerb.presentContinuous;
                            break;
                        case 'past':
                            delete filteredVerb.present;
                            delete filteredVerb.presentContinuous;
                            break;
                        case 'presentContinuous':
                            delete filteredVerb.present;
                            delete filteredVerb.past;
                            break;
                    }
                    return filteredVerb;
                });
            }

            return data;
        }

        function getDataKey(wordGroup) {
            const mapping = {
                'verbs': 'verbs',
                'nouns': 'commonNouns',
                'adjectives': 'adjectives',
                'adverbs': 'adverbs',
                'pronouns': 'pronouns',
                'prepositions': 'prepositions',
                'conjunctions': 'conjunctions',
                'time': 'timeExpressions'
            };
            return mapping[wordGroup];
        }

        function getCategoryName(key) {
            const mapping = {
                'verbs': 'Verb',
                'commonNouns': 'Noun',
                'adjectives': 'Adjective',
                'adverbs': 'Adverb',
                'pronouns': 'Pronoun',
                'prepositions': 'Preposition',
                'conjunctions': 'Conjunction',
                'timeExpressions': 'Time Expression'
            };
            return mapping[key] || 'Unknown';
        }

        function generateFlashcardPDF(doc, data, wordGroup, conjugation) {
            const pageWidth = doc.internal.pageSize.width;
            const pageHeight = doc.internal.pageSize.height;
            
            // Get grid configuration
            const columns = parseInt(document.getElementById('columnsSelect').value);
            const rows = parseInt(document.getElementById('rowsSelect').value);
            const cardsPerPage = columns * rows;
            
            // Calculate responsive margins and dimensions
            const baseMarginsX = 20;
            const baseMarginsY = 25;
            const densityFactor = Math.max(0.6, 1 - (cardsPerPage - 6) * 0.03); // Scale margins based on density
            
            const marginX = baseMarginsX * densityFactor;
            const marginY = baseMarginsY * densityFactor;
            const titleHeight = 20;
            
            // Calculate card dimensions
            const usableWidth = pageWidth - (marginX * 2);
            const usableHeight = pageHeight - (marginY * 2) - titleHeight;
            const cardSpacingX = Math.max(3, 8 * densityFactor);
            const cardSpacingY = Math.max(3, 10 * densityFactor);
            
            const cardWidth = (usableWidth - (cardSpacingX * (columns - 1))) / columns;
            const cardHeight = (usableHeight - (cardSpacingY * (rows - 1))) / rows;
            
            // Font size scaling based on card size
            const baseFontSize = 14;
            const fontScaleFactor = Math.max(0.6, Math.min(1.2, (cardWidth * cardHeight) / (85 * 60))); // Scale based on card area
            const mainFontSize = Math.max(8, baseFontSize * fontScaleFactor);
            const detailFontSize = Math.max(6, 9 * fontScaleFactor);
            const translationFontSize = Math.max(7, 11 * fontScaleFactor);
            const categoryFontSize = Math.max(5, 8 * fontScaleFactor);
            
            let currentPage = 0;
            let cardCount = 0;
            
            // Helper function to start a new page
            function addNewPage() {
                if (currentPage > 0) {
                    doc.addPage();
                }
                currentPage++;
                
                // Add title
                doc.setFontSize(Math.max(12, 18 * fontScaleFactor));
                doc.setFont('helvetica', 'bold');
                doc.setTextColor(0, 0, 0);
                doc.text('Italian Vocabulary Flashcards', pageWidth / 2, 15, { align: 'center' });
                
                // Add page info
                doc.setFontSize(Math.max(8, 10 * fontScaleFactor));
                doc.setFont('helvetica', 'normal');
                doc.setTextColor(100, 100, 100);
                const gridInfo = `${columns}×${rows} grid - Page ${currentPage}`;
                doc.text(gridInfo, pageWidth / 2, 22, { align: 'center' });
            }
            
            // Helper function to get card position
            function getCardPosition(cardIndex) {
                const row = Math.floor(cardIndex / columns);
                const col = cardIndex % columns;
                
                const x = marginX + col * (cardWidth + cardSpacingX);
                const y = marginY + titleHeight + row * (cardHeight + cardSpacingY);
                
                return { x, y };
            }
            
            // Helper function to wrap text to fit card width
            function wrapText(text, maxWidth, fontSize) {
                doc.setFontSize(fontSize);
                const words = text.split(' ');
                const lines = [];
                let currentLine = '';
                
                for (const word of words) {
                    const testLine = currentLine + (currentLine ? ' ' : '') + word;
                    const testWidth = doc.getTextWidth(testLine);
                    
                    if (testWidth <= maxWidth) {
                        currentLine = testLine;
                    } else {
                        if (currentLine) {
                            lines.push(currentLine);
                            currentLine = word;
                        } else {
                            lines.push(word); // Single word is too long but we still need to show it
                        }
                    }
                }
                
                if (currentLine) {
                    lines.push(currentLine);
                }
                
                return lines;
            }
            
            // Generate flashcards
            data.forEach((item, index) => {
                const pageCardIndex = cardCount % cardsPerPage;
                
                // Start new page if needed
                if (pageCardIndex === 0) {
                    addNewPage();
                }
                
                const position = getCardPosition(pageCardIndex);
                const centerX = position.x + cardWidth / 2;
                const centerY = position.y + cardHeight / 2;
                const contentPadding = Math.max(3, 8 * densityFactor);
                const maxTextWidth = cardWidth - (contentPadding * 2);
                
                // Draw card border
                doc.setDrawColor(200, 200, 200);
                doc.setLineWidth(0.5);
                doc.rect(position.x, position.y, cardWidth, cardHeight);
                
                // Italian word (main) - with text wrapping
                const italianText = item.infinitive || item.italian || '';
                const italianLines = wrapText(italianText, maxTextWidth, mainFontSize);
                
                doc.setFontSize(mainFontSize);
                doc.setFont('helvetica', 'bold');
                doc.setTextColor(0, 0, 0);
                
                const lineHeight = mainFontSize * 0.35;
                const italianStartY = centerY - 15 - ((italianLines.length - 1) * lineHeight / 2);
                
                italianLines.forEach((line, lineIndex) => {
                    doc.text(line, centerX, italianStartY + (lineIndex * lineHeight), { align: 'center' });
                });
                
                // Conjugations or forms (if available)
                doc.setFontSize(detailFontSize);
                doc.setFont('helvetica', 'normal');
                doc.setTextColor(80, 80, 80);
                
                let detailY = centerY - 2;
                const detailLineHeight = detailFontSize * 0.35;
                
                if (item.category === 'Verb') {
                    const conjugations = [];
                    if (item.present) conjugations.push(`Present: ${item.present.slice(0, 2).join(', ')}...`);
                    if (item.past) conjugations.push(`Past: ${item.past.slice(0, 2).join(', ')}...`);
                    
                    conjugations.forEach((conjText, index) => {
                        const conjLines = wrapText(conjText, maxTextWidth, detailFontSize);
                        conjLines.forEach((line, lineIndex) => {
                            doc.text(line, centerX, detailY + ((index * 2 + lineIndex) * detailLineHeight), { align: 'center' });
                        });
                    });
                } else if (item.forms) {
                    const formsText = `Forms: ${item.forms.slice(0, 3).join(', ')}`;
                    const formsLines = wrapText(formsText, maxTextWidth, detailFontSize);
                    formsLines.forEach((line, lineIndex) => {
                        doc.text(line, centerX, detailY + (lineIndex * detailLineHeight), { align: 'center' });
                    });
                }
                
                // English translation
                const englishLines = wrapText(item.english, maxTextWidth, translationFontSize);
                
                doc.setFontSize(translationFontSize);
                doc.setFont('helvetica', 'italic');
                doc.setTextColor(100, 100, 100);
                
                const englishLineHeight = translationFontSize * 0.35;
                const englishStartY = centerY + 10 - ((englishLines.length - 1) * englishLineHeight / 2);
                
                englishLines.forEach((line, lineIndex) => {
                    doc.text(line, centerX, englishStartY + (lineIndex * englishLineHeight), { align: 'center' });
                });
                
                // Category badge
                doc.setFontSize(categoryFontSize);
                doc.setFont('helvetica', 'normal');
                doc.setTextColor(150, 150, 150);
                doc.text(item.category, centerX, position.y + cardHeight - 5, { align: 'center' });
                
                cardCount++;
            });
        }

        function generateTablePDF(doc, data, wordGroup, conjugation) {
            // Add title
            doc.setFontSize(16);
            doc.setFont('helvetica', 'bold');
            doc.text('Italian Vocabulary Table', 20, 20);

            // Add subtitle
            doc.setFontSize(10);
            doc.setFont('helvetica', 'normal');
            const subtitle = `${wordGroup === 'all' ? 'All Categories' : wordGroup} - ${conjugation === 'all' ? 'All Forms' : conjugation}`;
            doc.text(subtitle, 20, 30);

            // Prepare table data
            const tableData = data.map(item => {
                const row = [
                    item.infinitive || item.italian || '',
                    item.english,
                    item.category
                ];

                // Add conjugations or forms
                if (item.category === 'Verb') {
                    let conjugations = '';
                    if (item.present) conjugations += `Present: ${item.present.slice(0, 2).join(', ')}... `;
                    if (item.past) conjugations += `Past: ${item.past.slice(0, 2).join(', ')}...`;
                    row.push(conjugations || 'N/A');
                } else if (item.forms) {
                    row.push(`Forms: ${item.forms.join(', ')}`);
                } else {
                    row.push('N/A');
                }

                return row;
            });

            // Add table
            doc.autoTable({
                head: [['Italian', 'English', 'Type', 'Details']],
                body: tableData,
                startY: 40,
                styles: {
                    fontSize: 9,
                    cellPadding: 4
                },
                headStyles: {
                    fillColor: [52, 152, 219],
                    textColor: [255, 255, 255]
                },
                columnStyles: {
                    0: { cellWidth: 40, fontStyle: 'bold' },
                    1: { cellWidth: 50 },
                    2: { cellWidth: 30 },
                    3: { cellWidth: 60 }
                }
            });
        }

        function generateListPDF(doc, data, wordGroup, conjugation) {
            const pageHeight = doc.internal.pageSize.height;
            let currentY = 30;
            const lineHeight = 8;
            const margin = 20;

            // Add title
            doc.setFontSize(16);
            doc.setFont('helvetica', 'bold');
            doc.text('Italian Vocabulary List', 20, 20);

            data.forEach((item, index) => {
                if (currentY > pageHeight - 30) {
                    doc.addPage();
                    currentY = 30;
                }

                // Item number
                doc.setFontSize(10);
                doc.setFont('helvetica', 'normal');
                doc.setTextColor(150, 150, 150);
                doc.text(`${index + 1}.`, margin, currentY);

                // Italian word
                doc.setFontSize(12);
                doc.setFont('helvetica', 'bold');
                doc.setTextColor(0, 0, 0);
                doc.text(item.infinitive || item.italian || '', margin + 15, currentY);

                // English translation
                doc.setFontSize(11);
                doc.setFont('helvetica', 'italic');
                doc.setTextColor(100, 100, 100);
                doc.text(`- ${item.english}`, margin + 80, currentY);

                // Category
                doc.setFontSize(9);
                doc.setFont('helvetica', 'normal');
                doc.setTextColor(150, 150, 150);
                doc.text(`(${item.category})`, margin + 150, currentY);

                currentY += lineHeight;

                // Add conjugations/forms if available
                if (item.category === 'Verb' && (item.present || item.past)) {
                    doc.setFontSize(9);
                    doc.setFont('helvetica', 'normal');
                    doc.setTextColor(120, 120, 120);
                    
                    if (item.present) {
                        doc.text(`  Present: ${item.present.slice(0, 3).join(', ')}...`, margin + 15, currentY);
                        currentY += lineHeight * 0.8;
                    }
                    if (item.past) {
                        doc.text(`  Past: ${item.past.slice(0, 2).join(', ')}...`, margin + 15, currentY);
                        currentY += lineHeight * 0.8;
                    }
                } else if (item.forms) {
                    doc.setFontSize(9);
                    doc.setFont('helvetica', 'normal');
                    doc.setTextColor(120, 120, 120);
                    doc.text(`  Forms: ${item.forms.join(', ')}`, margin + 15, currentY);
                    currentY += lineHeight * 0.8;
                }

                currentY += lineHeight * 0.5; // Extra spacing between items
            });
        }

        // PDF Export functionality (legacy function - keep for compatibility)
        function exportToPDF() {
            openExportModal();
        }

        function prepareDataForExport(data) {
            const exportData = [];

            // Process verbs
            if (data.verbs && data.verbs.length > 0) {
                data.verbs.forEach(verb => {
                    const isEssere = verb.infinitive.includes('(ESSERE)');
                    const presentForms = verb.present ? verb.present.slice(0, 3).join(', ') + '...' : '';
                    const pastForms = verb.past ? verb.past.slice(0, 2).join(', ') + '...' : '';
                    
                    let details = `Auxiliary: ${isEssere ? 'ESSERE' : 'AVERE'}`;
                    if (presentForms) details += `\nPresent: ${presentForms}`;
                    if (pastForms) details += `\nPast: ${pastForms}`;

                    exportData.push({
                        italian: verb.infinitive,
                        english: verb.english,
                        type: 'Verb',
                        details: details
                    });
                });
            }

            // Process other word types
            const categories = [
                { key: 'commonNouns', type: 'Noun' },
                { key: 'adjectives', type: 'Adjective' },
                { key: 'adverbs', type: 'Adverb' },
                { key: 'pronouns', type: 'Pronoun' },
                { key: 'prepositions', type: 'Preposition' },
                { key: 'conjunctions', type: 'Conjunction' },
                { key: 'timeExpressions', type: 'Time Expression' }
            ];

            categories.forEach(category => {
                if (data[category.key] && data[category.key].length > 0) {
                    data[category.key].forEach(item => {
                        let details = '';
                        
                        if (item.forms) {
                            details += `Forms: ${item.forms.join(', ')}`;
                        }
                        if (item.gender && item.plural) {
                            details += `${details ? '\n' : ''}Gender: ${item.gender} | Plural: ${item.plural}`;
                        }
                        if (item.type) {
                            details += `${details ? '\n' : ''}Type: ${item.type}`;
                        }
                        if (item.usage) {
                            details += `${details ? '\n' : ''}Usage: ${item.usage}`;
                        }
                        if (item.category) {
                            details += `${details ? '\n' : ''}Category: ${item.category}`;
                        }
                        if (item.examples && item.examples.length > 0) {
                            details += `${details ? '\n' : ''}Examples: ${item.examples.slice(0, 2).join(' • ')}`;
                        }

                        exportData.push({
                            italian: item.italian,
                            english: item.english,
                            type: category.type,
                            details: details || 'N/A'
                        });
                    });
                }
            });

            return exportData;
        }
