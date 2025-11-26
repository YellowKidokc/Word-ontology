import {
    Plugin,
    Notice,
    Menu,
    Editor,
    MarkdownView,
    MarkdownFileInfo,
    TFile,
    EditorPosition
} from 'obsidian';

import { PluginSettings, DEFAULT_SETTINGS, DatabaseClassification, CustomPrompt } from './types';
import { EpistemicTaggerSettingTab } from './settings';
import { DatabaseService } from './database';
import { BUNDLE_PROFILES, getActiveProfile, getAllProfiles } from './profiles';
import { classifyWithAI, createClassification, validateClassification } from './classification';
import { EpistemicDecorationPlugin } from './ui/decorations';
import { processDocumentWithAI, processAndClassifyDocument } from './document-processor';
import { EditorView } from '@codemirror/view';
import {
    readSemanticBlockFromFile,
    writeSemanticBlockToFile,
    classificationToAnnotation,
    upsertAnnotation,
    getLineNumbers
} from './semantic-block';
import { generateMasterDashboards, DEFAULT_DASHBOARD_CONFIG } from './master-dashboard';

export default class EpistemicTaggerPlugin extends Plugin {
    settings: PluginSettings;
    db: DatabaseService;
    private decorationPlugin: EpistemicDecorationPlugin;
    private classificationsCache: Map<string, DatabaseClassification[]> = new Map();

    async onload() {
        console.log('Loading Epistemic Tagger plugin');

        await this.loadSettings();

        // Initialize database connection
        this.db = new DatabaseService(this.settings.postgresUrl);

        // Add settings tab
        this.addSettingTab(new EpistemicTaggerSettingTab(this.app, this));

        // Register context menu handler
        this.registerEvent(
            this.app.workspace.on('editor-menu', (menu, editor, view) => {
                this.handleEditorMenu(menu, editor, view);
            })
        );

        // Register commands
        this.registerCommands();

        // Initialize decoration plugin
        this.decorationPlugin = new EpistemicDecorationPlugin(this);
        this.registerEditorExtension(this.decorationPlugin.extension);

        // Load classifications for active file
        this.registerEvent(
            this.app.workspace.on('active-leaf-change', async () => {
                await this.refreshCurrentFileDecorations();
            })
        );

        // Initial load
        this.app.workspace.onLayoutReady(async () => {
            await this.refreshCurrentFileDecorations();
        });
    }

    async onunload() {
        console.log('Unloading Epistemic Tagger plugin');
        await this.db.close();
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }

    reconnectDatabase() {
        this.db.updateConnection(this.settings.postgresUrl);
        new Notice('Database connection updated');
    }

    async switchProfile(profileName: string) {
        this.settings.activeProfile = profileName;
        await this.saveSettings();
        await this.refreshCurrentFileDecorations();
    }

    private handleEditorMenu(menu: Menu, editor: Editor, view: MarkdownView | MarkdownFileInfo) {
        const selection = editor.getSelection();
        const activeProfile = getActiveProfile(this.settings.activeProfile, this.settings.customProfiles);

        // Selection-based actions
        if (selection && selection.trim() !== '') {
            menu.addItem((item) => {
                item
                    .setTitle('Classify Selection As...')
                    .setIcon('tag')
                    .setSection('epistemic');

                item.onClick(() => {
                    this.showClassificationMenu(editor, view, selection);
                });
            });

            // Add AI suggestion option if API key is configured
            if (this.settings.anthropicApiKey) {
                menu.addItem((item) => {
                    item
                        .setTitle('Suggest Classification (AI)')
                        .setIcon('sparkles')
                        .setSection('epistemic');

                    item.onClick(async () => {
                        await this.suggestClassificationWithAI(editor, view, selection);
                    });
                });
            }
        }

        // Document-level actions (always available)
        if (this.settings.anthropicApiKey) {
            // Auto-classify entire document
            menu.addItem((item) => {
                item
                    .setTitle('Auto-Classify Document (AI)')
                    .setIcon('wand')
                    .setSection('epistemic');

                item.onClick(async () => {
                    await this.autoClassifyDocument(editor, view);
                });
            });

            // Custom prompts submenu
            if (this.settings.customPrompts && this.settings.customPrompts.length > 0) {
                menu.addItem((item) => {
                    item
                        .setTitle('Process Document With...')
                        .setIcon('brain')
                        .setSection('epistemic');

                    item.onClick(() => {
                        this.showCustomPromptsMenu(editor, view);
                    });
                });
            }
        }
    }

    private async showClassificationMenu(editor: Editor, view: MarkdownView | MarkdownFileInfo, selection: string) {
        const activeProfile = getActiveProfile(this.settings.activeProfile, this.settings.customProfiles);
        const menu = new Menu();

        menu.setNoIcon();

        activeProfile.categories.forEach((category) => {
            menu.addItem((item) => {
                item.setTitle(`${category.icon} ${category.displayName}`);
                item.onClick(async () => {
                    await this.classifySelection(editor, view, selection, category.name);
                });
            });
        });

        menu.showAtMouseEvent(window.event as MouseEvent);
    }

    private async classifySelection(
        editor: Editor,
        view: MarkdownView | MarkdownFileInfo,
        selectedText: string,
        typeName: string
    ) {
        try {
            const file = view.file;
            if (!file) {
                new Notice('No active file');
                return;
            }

            // Get selection offsets
            const from = editor.getCursor('from');
            const to = editor.getCursor('to');
            const fullText = editor.getValue();
            const startOffset = this.getOffsetFromPosition(fullText, from);
            const endOffset = this.getOffsetFromPosition(fullText, to);

            // Create classification
            const classification = createClassification(
                selectedText,
                typeName,
                this.settings.activeProfile,
                file.path,
                startOffset,
                endOffset,
                this.settings.username,
                1.0
            );

            // Validate
            if (!validateClassification(classification)) {
                return;
            }

            // Save to database
            const id = await this.db.saveClassification(classification);
            classification.id = id;

            // DUAL STORAGE: Also write to semantic block in the file
            try {
                // Read the current semantic block (or create new one if doesn't exist)
                const semanticBlock = await readSemanticBlockFromFile(this.app.vault, file);
                
                // Convert the classification to an annotation with line numbers
                const annotation = classificationToAnnotation(classification, fullText);
                
                // Add or update the annotation in the semantic block
                upsertAnnotation(semanticBlock, annotation);
                
                // Write the updated semantic block back to the file
                await writeSemanticBlockToFile(this.app.vault, file, semanticBlock);
            } catch (blockError) {
                console.error('Failed to write semantic block:', blockError);
                // Don't fail the whole operation if semantic block write fails
                // The classification is still in PostgreSQL
            }

            new Notice(`✓ Classified as ${typeName}`);

            // Refresh decorations
            await this.refreshCurrentFileDecorations();
        } catch (error) {
            console.error('Classification failed:', error);
            new Notice('Failed to save classification. Check console for details.');
        }
    }

    private async suggestClassificationWithAI(
        editor: Editor,
        view: MarkdownView | MarkdownFileInfo,
        selection: string
    ) {
        const activeProfile = getActiveProfile(this.settings.activeProfile, this.settings.customProfiles);

        new Notice('Asking AI for suggestion...');

        const suggestedType = await classifyWithAI(
            selection,
            activeProfile,
            this.settings.anthropicApiKey || ''
        );

        if (!suggestedType) {
            return;
        }

        const category = activeProfile.categories.find(c => c.name === suggestedType);
        if (!category) {
            new Notice('AI suggested invalid category');
            return;
        }

        // Show confirmation menu
        const menu = new Menu();
        menu.setNoIcon();

        menu.addItem((item) => {
            item.setTitle(`Accept AI suggestion: ${category.icon} ${category.displayName}`);
            item.onClick(async () => {
                await this.classifySelection(editor, view, selection, suggestedType);
            });
        });

        menu.addItem((item) => {
            item.setTitle('Choose different type...');
            item.onClick(() => {
                this.showClassificationMenu(editor, view, selection);
            });
        });

        menu.showAtMouseEvent(window.event as MouseEvent);
    }

    private async autoClassifyDocument(editor: Editor, view: MarkdownView | MarkdownFileInfo) {
        const file = view.file;
        if (!file) {
            new Notice('No active file');
            return;
        }

        const activeProfile = getActiveProfile(this.settings.activeProfile, this.settings.customProfiles);
        const documentContent = editor.getValue();

        new Notice('Analyzing document with AI...');

        const classifications = await processAndClassifyDocument(
            documentContent,
            activeProfile,
            this.settings.anthropicApiKey || ''
        );

        if (!classifications || classifications.length === 0) {
            new Notice('No classifications found');
            return;
        }

        // Save all classifications
        let savedCount = 0;
        for (const item of classifications) {
            try {
                const classification = createClassification(
                    item.text,
                    item.category,
                    this.settings.activeProfile,
                    file.path,
                    item.startOffset,
                    item.endOffset,
                    this.settings.username,
                    0.8 // AI confidence
                );

                if (validateClassification(classification)) {
                    const id = await this.db.saveClassification(classification);
                    classification.id = id;
                    savedCount++;
                }
            } catch (error) {
                console.error('Failed to save classification:', error);
            }
        }

        new Notice(`✓ Auto-classified ${savedCount} sections`);
        await this.refreshCurrentFileDecorations();
    }

    private showCustomPromptsMenu(editor: Editor, view: MarkdownView | MarkdownFileInfo) {
        const menu = new Menu();
        menu.setNoIcon();

        this.settings.customPrompts.forEach((prompt) => {
            menu.addItem((item) => {
                item.setTitle(prompt.name);
                item.onClick(async () => {
                    await this.processWithCustomPrompt(editor, view, prompt);
                });
            });
        });

        menu.showAtMouseEvent(window.event as MouseEvent);
    }

    private async processWithCustomPrompt(
        editor: Editor,
        view: MarkdownView | MarkdownFileInfo,
        prompt: CustomPrompt
    ) {
        const activeProfile = getActiveProfile(this.settings.activeProfile, this.settings.customProfiles);
        
        new Notice(`Processing with: ${prompt.name}...`);

        const markdownView = view instanceof MarkdownView ? view : null;
        if (!markdownView) {
            new Notice('This action requires a markdown view');
            return;
        }

        const result = await processDocumentWithAI(
            editor,
            markdownView,
            prompt,
            this.settings.anthropicApiKey || '',
            activeProfile
        );

        if (!result) {
            return;
        }

        // Show result in a notice or modal
        new Notice(`✓ Processing complete. Check console for full output.`, 5000);
        console.log(`Custom Prompt Result (${prompt.name}):\n`, result);

        // If prompt has a target category, optionally auto-classify
        if (prompt.targetCategory && view.file) {
            const fullText = editor.getValue();
            const classification = createClassification(
                result.substring(0, 500), // Store summary
                prompt.targetCategory,
                this.settings.activeProfile,
                view.file.path,
                0,
                result.length,
                this.settings.username,
                0.7
            );

            try {
                const id = await this.db.saveClassification(classification);
                new Notice(`✓ Result classified as ${prompt.targetCategory}`);
                await this.refreshCurrentFileDecorations();
            } catch (error) {
                console.error('Failed to save prompt result:', error);
            }
        }
    }

    private getOffsetFromPosition(text: string, pos: EditorPosition): number {
        const lines = text.split('\n');
        let offset = 0;

        for (let i = 0; i < pos.line; i++) {
            offset += lines[i].length + 1; // +1 for newline
        }

        offset += pos.ch;
        return offset;
    }

    async refreshCurrentFileDecorations() {
        const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!activeView || !activeView.file) {
            return;
        }

        const filePath = activeView.file.path;
        await this.loadClassificationsForFile(filePath);
    }

    async loadClassificationsForFile(filePath: string) {
        try {
            const classifications = await this.db.getClassificationsForFile(
                filePath,
                this.settings.activeProfile
            );

            this.classificationsCache.set(filePath, classifications);
            this.decorationPlugin.updateClassifications(classifications);
        } catch (error) {
            console.error('Failed to load classifications:', error);
        }
    }

    getClassificationsForFile(filePath: string): DatabaseClassification[] {
        return this.classificationsCache.get(filePath) || [];
    }

    refreshDecorations() {
        // Force refresh of all decorations
        this.app.workspace.iterateAllLeaves((leaf) => {
            if (leaf.view instanceof MarkdownView) {
                const view = leaf.view;
                if (view.file) {
                    this.loadClassificationsForFile(view.file.path);
                }
            }
        });
    }

    private registerCommands() {
        // Classify Selection
        this.addCommand({
            id: 'classify-selection',
            name: 'Classify Selection',
            editorCallback: (editor: Editor, view: MarkdownView) => {
                const selection = editor.getSelection();
                if (!selection) {
                    new Notice('No text selected');
                    return;
                }
                this.showClassificationMenu(editor, view, selection);
            }
        });

        // Switch Profile
        this.addCommand({
            id: 'switch-profile',
            name: 'Switch Bundle Profile',
            callback: () => {
                const menu = new Menu();
                menu.setNoIcon();

                const allProfiles = getAllProfiles(this.settings.customProfiles);
                
                allProfiles.forEach((profile) => {
                    menu.addItem((item) => {
                        const isActive = profile.name === this.settings.activeProfile;
                        const isCustom = this.settings.customProfiles.some(p => p.name === profile.name);
                        item.setTitle(`${isActive ? '✓ ' : ''}${profile.displayName}${isCustom ? ' (Custom)' : ''}`);
                        item.onClick(async () => {
                            await this.switchProfile(profile.name);
                            new Notice(`Switched to ${profile.displayName} profile`);
                        });
                    });
                });

                menu.showAtMouseEvent(window.event as MouseEvent);
            }
        });

        // View All Classifications
        this.addCommand({
            id: 'view-all-classifications',
            name: 'View All Classifications in Note',
            editorCallback: async (editor: Editor, view: MarkdownView) => {
                if (!view.file) {
                    new Notice('No active file');
                    return;
                }

                const classifications = this.getClassificationsForFile(view.file.path);
                if (classifications.length === 0) {
                    new Notice('No classifications in this note');
                    return;
                }

                let message = `Found ${classifications.length} classification(s):\n\n`;
                classifications.forEach((c, i) => {
                    message += `${i + 1}. ${c.icon} ${c.type}: "${c.content.substring(0, 50)}${c.content.length > 50 ? '...' : ''}"\n`;
                });

                new Notice(message, 10000);
            }
        });

        // Export Classifications
        this.addCommand({
            id: 'export-classifications',
            name: 'Export Classifications to CSV',
            callback: async () => {
                try {
                    const allClassifications = await this.db.getAllClassifications(
                        this.settings.activeProfile
                    );

                    if (allClassifications.length === 0) {
                        new Notice('No classifications to export');
                        return;
                    }

                    // Create CSV content
                    const headers = 'Type,Content,File,Tagged By,Tagged At,Confidence,Notes\n';
                    const rows = allClassifications.map(c => {
                        const content = c.content.replace(/"/g, '""'); // Escape quotes
                        return `"${c.type}","${content}","${c.source_file}","${c.tagged_by}","${c.tagged_at}","${c.confidence}","${c.notes || ''}"`;
                    }).join('\n');

                    const csv = headers + rows;

                    // Save to vault
                    const fileName = `epistemic-export-${Date.now()}.csv`;
                    await this.app.vault.create(fileName, csv);

                    new Notice(`Exported ${allClassifications.length} classifications to ${fileName}`);
                } catch (error) {
                    console.error('Export failed:', error);
                    new Notice('Export failed. Check console for details.');
                }
            }
        });

        // Generate Master Dashboards
        this.addCommand({
            id: 'generate-master-dashboards',
            name: 'Generate Master Dashboards',
            callback: async () => {
                try {
                    await generateMasterDashboards(
                        this.app.vault,
                        this.db,
                        DEFAULT_DASHBOARD_CONFIG
                    );
                } catch (error) {
                    console.error('Dashboard generation failed:', error);
                    new Notice('Dashboard generation failed. Check console for details.');
                }
            }
        });
    }
}
