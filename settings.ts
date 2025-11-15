import { App, PluginSettingTab, Setting, Notice } from 'obsidian';
import EpistemicTaggerPlugin from './main';
import { BUNDLE_PROFILES } from './profiles';

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
                BUNDLE_PROFILES.forEach(profile => {
                    dropdown.addOption(profile.name, profile.displayName);
                });
                dropdown
                    .setValue(this.plugin.settings.activeProfile)
                    .onChange(async (value) => {
                        this.plugin.settings.activeProfile = value;
                        await this.plugin.saveSettings();
                        await this.plugin.switchProfile(value);
                        new Notice(`Switched to ${BUNDLE_PROFILES.find(p => p.name === value)?.displayName} profile`);
                    });
            });

        // Display current profile info
        const activeProfile = BUNDLE_PROFILES.find(p => p.name === this.plugin.settings.activeProfile);
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
    }
}
