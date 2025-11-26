import { App, PluginSettingTab, Setting, Notice, Modal, TextComponent, TextAreaComponent } from 'obsidian';
import EpistemicTaggerPlugin from './main';
import { BUNDLE_PROFILES, getAllProfiles } from './profiles';
import { BundleProfile, EpistemicType, CustomPrompt } from './types';

/**
 * Settings tab for Epistemic Tagger plugin
 */
export class EpistemicTaggerSettingTab extends PluginSettingTab {
    plugin: EpistemicTaggerPlugin;

    constructor(app: App, plugin: EpistemicTaggerPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        // Header
        containerEl.createEl('h2', { text: 'Epistemic Tagger Settings' });

        // Database Configuration Section
        containerEl.createEl('h3', { text: 'Database Configuration' });

        // PostgreSQL Connection String
        new Setting(containerEl)
            .setName('PostgreSQL Connection URL')
            .setDesc('Connection string for PostgreSQL database (e.g., postgresql://user:password@host:port/database)')
            .addText(text => text
                .setPlaceholder('postgresql://postgres:password@192.168.1.215:5432/kj')
                .setValue(this.plugin.settings.postgresUrl)
                .onChange(async (value) => {
                    this.plugin.settings.postgresUrl = value;
                    await this.plugin.saveSettings();
                    // Reconnect to database with new URL
                    this.plugin.reconnectDatabase();
                })
            );

        // Test Connection Button
        new Setting(containerEl)
            .setName('Test Database Connection')
            .setDesc('Verify that the database connection is working')
            .addButton(button => button
                .setButtonText('Test Connection')
                .onClick(async () => {
                    button.setDisabled(true);
                    button.setButtonText('Testing...');

                    try {
                        const isConnected = await this.plugin.db.testConnection();
                        if (isConnected) {
                            new Notice('✓ Database connection successful!');
                            button.setButtonText('Connected ✓');
                        } else {
                            new Notice('✗ Database connection failed. Check console for details.');
                            button.setButtonText('Failed ✗');
                        }
                    } catch (error) {
                        new Notice('✗ Database connection error: ' + error.message);
                        button.setButtonText('Error ✗');
                    }

                    setTimeout(() => {
                        button.setDisabled(false);
                        button.setButtonText('Test Connection');
                    }, 3000);
                })
            );

        // Initialize Schema Button
        new Setting(containerEl)
            .setName('Initialize Database Schema')
            .setDesc('Create tables and seed initial data (safe to run multiple times)')
            .addButton(button => button
                .setButtonText('Initialize Schema')
                .onClick(async () => {
                    button.setDisabled(true);
                    button.setButtonText('Initializing...');

                    try {
                        await this.plugin.db.initializeSchema();
                        await this.plugin.db.seedTypes();
                        new Notice('✓ Database schema initialized successfully!');
                        button.setButtonText('Initialized ✓');
                    } catch (error) {
                        new Notice('✗ Schema initialization failed: ' + error.message);
                        button.setButtonText('Failed ✗');
                        console.error('Schema initialization error:', error);
                    }

                    setTimeout(() => {
                        button.setDisabled(false);
                        button.setButtonText('Initialize Schema');
                    }, 3000);
                })
            );

        // Profile Configuration Section
        containerEl.createEl('h3', { text: 'Bundle Profile' });

        // Active Profile
        new Setting(containerEl)
            .setName('Active Profile')
            .setDesc('Select which bundle profile to use for classifications')
            .addDropdown(dropdown => {
                const allProfiles = getAllProfiles(this.plugin.settings.customProfiles);
                allProfiles.forEach(profile => {
                    const isCustom = this.plugin.settings.customProfiles.some(p => p.name === profile.name);
                    dropdown.addOption(profile.name, `${profile.displayName}${isCustom ? ' (Custom)' : ''}`);
                });
                dropdown
                    .setValue(this.plugin.settings.activeProfile)
                    .onChange(async (value) => {
                        this.plugin.settings.activeProfile = value;
                        await this.plugin.saveSettings();
                        await this.plugin.switchProfile(value);
                        const profile = allProfiles.find(p => p.name === value);
                        new Notice(`Switched to ${profile?.displayName} profile`);
                    });
            });

        // Display current profile info
        const allProfiles = getAllProfiles(this.plugin.settings.customProfiles);
        const activeProfile = allProfiles.find(p => p.name === this.plugin.settings.activeProfile);
        if (activeProfile) {
            const profileInfoEl = containerEl.createDiv('epistemic-profile-info');
            profileInfoEl.createEl('p', {
                text: `${activeProfile.displayName}: ${activeProfile.description}`,
                cls: 'setting-item-description'
            });

            const categoriesEl = profileInfoEl.createEl('ul');
            activeProfile.categories.forEach(cat => {
                const li = categoriesEl.createEl('li');
                li.innerHTML = `<span style="color: ${cat.color}">${cat.icon} ${cat.displayName}</span> - ${cat.description}`;
            });
        }

        // Custom Profiles Management
        containerEl.createEl('h3', { text: 'Custom Profiles' });
        
        new Setting(containerEl)
            .setName('Create Custom Profile')
            .setDesc('Create your own classification profile with custom categories')
            .addButton(button => button
                .setButtonText('Create Profile')
                .onClick(() => {
                    new CustomProfileModal(this.app, this.plugin, null, () => this.display()).open();
                })
            );

        // List existing custom profiles
        if (this.plugin.settings.customProfiles.length > 0) {
            this.plugin.settings.customProfiles.forEach((profile, index) => {
                new Setting(containerEl)
                    .setName(profile.displayName)
                    .setDesc(profile.description)
                    .addButton(button => button
                        .setButtonText('Edit')
                        .onClick(() => {
                            new CustomProfileModal(this.app, this.plugin, profile, () => this.display()).open();
                        })
                    )
                    .addButton(button => button
                        .setButtonText('Delete')
                        .setWarning()
                        .onClick(async () => {
                            this.plugin.settings.customProfiles.splice(index, 1);
                            await this.plugin.saveSettings();
                            new Notice(`Deleted profile: ${profile.displayName}`);
                            this.display();
                        })
                    );
            });
        }

        // Visual Options Section
        containerEl.createEl('h3', { text: 'Visual Options' });

        // Show Highlights
        new Setting(containerEl)
            .setName('Show Highlights')
            .setDesc('Display colored highlights for classified text')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.showHighlights)
                .onChange(async (value) => {
                    this.plugin.settings.showHighlights = value;
                    await this.plugin.saveSettings();
                    this.plugin.refreshDecorations();
                })
            );

        // Show Icons
        new Setting(containerEl)
            .setName('Show Icons')
            .setDesc('Display superscript icons next to classified text')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.showIcons)
                .onChange(async (value) => {
                    this.plugin.settings.showIcons = value;
                    await this.plugin.saveSettings();
                    this.plugin.refreshDecorations();
                })
            );

        // Highlight Opacity
        new Setting(containerEl)
            .setName('Highlight Opacity')
            .setDesc('Transparency level for highlights (0.0 - 1.0)')
            .addSlider(slider => slider
                .setLimits(0, 1, 0.05)
                .setValue(this.plugin.settings.highlightOpacity)
                .setDynamicTooltip()
                .onChange(async (value) => {
                    this.plugin.settings.highlightOpacity = value;
                    await this.plugin.saveSettings();
                    this.plugin.refreshDecorations();
                })
            );

        // User Configuration Section
        containerEl.createEl('h3', { text: 'User Configuration' });

        // Username
        new Setting(containerEl)
            .setName('Username')
            .setDesc('Your username for tagging (used in tagged_by field)')
            .addText(text => text
                .setPlaceholder('user')
                .setValue(this.plugin.settings.username)
                .onChange(async (value) => {
                    this.plugin.settings.username = value;
                    await this.plugin.saveSettings();
                })
            );

        // AI Configuration Section
        containerEl.createEl('h3', { text: 'AI Assistant (Optional)' });

        // Anthropic API Key
        new Setting(containerEl)
            .setName('Anthropic API Key')
            .setDesc('API key for AI-assisted classification (optional)')
            .addText(text => {
                text
                    .setPlaceholder('sk-ant-...')
                    .setValue(this.plugin.settings.anthropicApiKey || '')
                    .onChange(async (value) => {
                        this.plugin.settings.anthropicApiKey = value;
                        await this.plugin.saveSettings();
                    });
                text.inputEl.type = 'password';
            });

        // Custom Prompts Section
        containerEl.createEl('h3', { text: 'Custom AI Prompts' });
        
        new Setting(containerEl)
            .setName('Create Custom Prompt')
            .setDesc('Create custom AI prompts for document processing')
            .addButton(button => button
                .setButtonText('Create Prompt')
                .onClick(() => {
                    new CustomPromptModal(this.app, this.plugin, null, () => this.display()).open();
                })
            );

        // List existing custom prompts
        if (this.plugin.settings.customPrompts.length > 0) {
            this.plugin.settings.customPrompts.forEach((prompt, index) => {
                new Setting(containerEl)
                    .setName(prompt.name)
                    .setDesc(prompt.description)
                    .addButton(button => button
                        .setButtonText('Edit')
                        .onClick(() => {
                            new CustomPromptModal(this.app, this.plugin, prompt, () => this.display()).open();
                        })
                    )
                    .addButton(button => button
                        .setButtonText('Delete')
                        .setWarning()
                        .onClick(async () => {
                            this.plugin.settings.customPrompts.splice(index, 1);
                            await this.plugin.saveSettings();
                            new Notice(`Deleted prompt: ${prompt.name}`);
                            this.display();
                        })
                    );
            });
        }

        // Invisible Metadata Option
        containerEl.createEl('h3', { text: 'Advanced Options' });
        
        new Setting(containerEl)
            .setName('Enable Invisible Metadata')
            .setDesc('Store classifications invisibly (database only, no visual indicators in editor)')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.enableInvisibleMetadata)
                .onChange(async (value) => {
                    this.plugin.settings.enableInvisibleMetadata = value;
                    await this.plugin.saveSettings();
                    this.plugin.refreshDecorations();
                    new Notice(`Invisible metadata ${value ? 'enabled' : 'disabled'}`);
                })
            );
    }
}

/**
 * Modal for creating/editing custom profiles
 */
class CustomProfileModal extends Modal {
    plugin: EpistemicTaggerPlugin;
    profile: BundleProfile | null;
    onSave: () => void;
    
    constructor(app: App, plugin: EpistemicTaggerPlugin, profile: BundleProfile | null, onSave: () => void) {
        super(app);
        this.plugin = plugin;
        this.profile = profile;
        this.onSave = onSave;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();

        contentEl.createEl('h2', { text: this.profile ? 'Edit Profile' : 'Create Profile' });

        const profileData = this.profile || {
            id: '',
            name: '',
            displayName: '',
            description: '',
            categories: []
        };

        // Profile Name
        new Setting(contentEl)
            .setName('Profile Name')
            .setDesc('Internal name (lowercase, no spaces)')
            .addText(text => text
                .setValue(profileData.name)
                .onChange(value => profileData.name = value.toLowerCase().replace(/\s+/g, '_'))
            );

        // Display Name
        new Setting(contentEl)
            .setName('Display Name')
            .setDesc('Human-readable name')
            .addText(text => text
                .setValue(profileData.displayName)
                .onChange(value => profileData.displayName = value)
            );

        // Description
        new Setting(contentEl)
            .setName('Description')
            .setDesc('Brief description of this profile')
            .addTextArea(text => text
                .setValue(profileData.description)
                .onChange(value => profileData.description = value)
            );

        contentEl.createEl('h3', { text: 'Categories' });
        contentEl.createEl('p', { 
            text: 'Add classification categories for this profile. You can add them after creating the profile.',
            cls: 'setting-item-description'
        });

        // Save button
        new Setting(contentEl)
            .addButton(button => button
                .setButtonText('Save')
                .setCta()
                .onClick(async () => {
                    if (!profileData.name || !profileData.displayName) {
                        new Notice('Please fill in all required fields');
                        return;
                    }

                    profileData.id = profileData.name;

                    if (this.profile) {
                        // Edit existing
                        const index = this.plugin.settings.customProfiles.findIndex(p => p.name === this.profile!.name);
                        if (index !== -1) {
                            this.plugin.settings.customProfiles[index] = profileData as BundleProfile;
                        }
                    } else {
                        // Create new
                        this.plugin.settings.customProfiles.push(profileData as BundleProfile);
                    }

                    await this.plugin.saveSettings();
                    new Notice(`Profile ${this.profile ? 'updated' : 'created'}: ${profileData.displayName}`);
                    this.close();
                    this.onSave();
                })
            )
            .addButton(button => button
                .setButtonText('Cancel')
                .onClick(() => this.close())
            );
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}

/**
 * Modal for creating/editing custom prompts
 */
class CustomPromptModal extends Modal {
    plugin: EpistemicTaggerPlugin;
    prompt: CustomPrompt | null;
    onSave: () => void;
    
    constructor(app: App, plugin: EpistemicTaggerPlugin, prompt: CustomPrompt | null, onSave: () => void) {
        super(app);
        this.plugin = plugin;
        this.prompt = prompt;
        this.onSave = onSave;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();

        contentEl.createEl('h2', { text: this.prompt ? 'Edit Prompt' : 'Create Prompt' });

        const promptData = this.prompt || {
            id: '',
            name: '',
            description: '',
            prompt: '',
            targetCategory: undefined
        };

        // Prompt Name
        new Setting(contentEl)
            .setName('Prompt Name')
            .setDesc('Name for this custom prompt')
            .addText(text => text
                .setValue(promptData.name)
                .onChange(value => promptData.name = value)
            );

        // Description
        new Setting(contentEl)
            .setName('Description')
            .setDesc('What does this prompt do?')
            .addText(text => text
                .setValue(promptData.description)
                .onChange(value => promptData.description = value)
            );

        // Prompt Text
        new Setting(contentEl)
            .setName('Prompt')
            .setDesc('The AI prompt to use (document content will be appended automatically)')
            .addTextArea(text => {
                text
                    .setValue(promptData.prompt)
                    .onChange(value => promptData.prompt = value);
                text.inputEl.rows = 10;
                text.inputEl.style.width = '100%';
            });

        // Target Category (optional)
        const allProfiles = getAllProfiles(this.plugin.settings.customProfiles);
        const activeProfile = allProfiles.find(p => p.name === this.plugin.settings.activeProfile);
        
        if (activeProfile) {
            new Setting(contentEl)
                .setName('Auto-Classify Results (Optional)')
                .setDesc('Automatically classify the AI response to this category')
                .addDropdown(dropdown => {
                    dropdown.addOption('', 'None');
                    activeProfile.categories.forEach(cat => {
                        dropdown.addOption(cat.name, cat.displayName);
                    });
                    dropdown
                        .setValue(promptData.targetCategory || '')
                        .onChange(value => promptData.targetCategory = value || undefined);
                });
        }

        // Save button
        new Setting(contentEl)
            .addButton(button => button
                .setButtonText('Save')
                .setCta()
                .onClick(async () => {
                    if (!promptData.name || !promptData.prompt) {
                        new Notice('Please fill in name and prompt');
                        return;
                    }

                    promptData.id = Date.now().toString();

                    if (this.prompt) {
                        // Edit existing
                        const index = this.plugin.settings.customPrompts.findIndex(p => p.id === this.prompt!.id);
                        if (index !== -1) {
                            this.plugin.settings.customPrompts[index] = promptData as CustomPrompt;
                        }
                    } else {
                        // Create new
                        this.plugin.settings.customPrompts.push(promptData as CustomPrompt);
                    }

                    await this.plugin.saveSettings();
                    new Notice(`Prompt ${this.prompt ? 'updated' : 'created'}: ${promptData.name}`);
                    this.close();
                    this.onSave();
                })
            )
            .addButton(button => button
                .setButtonText('Cancel')
                .onClick(() => this.close())
            );
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}
