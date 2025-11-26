import { EditorView, Decoration, DecorationSet, ViewPlugin, ViewUpdate, WidgetType } from '@codemirror/view';
import { RangeSetBuilder } from '@codemirror/state';
import { DatabaseClassification } from '../types';
import EpistemicTaggerPlugin from '../main';

/**
 * CodeMirror 6 plugin for displaying epistemic classification highlights
 */
export class EpistemicDecorationPlugin {
    private plugin: EpistemicTaggerPlugin;
    private classifications: DatabaseClassification[] = [];
    public extension: ViewPlugin<any>;

    constructor(plugin: EpistemicTaggerPlugin) {
        this.plugin = plugin;
        this.extension = this.createExtension();
    }

    updateClassifications(classifications: DatabaseClassification[]) {
        this.classifications = classifications;
        // Trigger view update
        this.plugin.app.workspace.iterateAllLeaves((leaf) => {
            const view = (leaf.view as any).editor?.cm as EditorView;
            if (view) {
                view.dispatch({});
            }
        });
    }

    private createExtension() {
        const pluginInstance = this;

        return ViewPlugin.fromClass(
            class {
                decorations: DecorationSet;

                constructor(view: EditorView) {
                    this.decorations = pluginInstance.buildDecorations(view);
                }

                update(update: ViewUpdate) {
                    this.decorations = pluginInstance.buildDecorations(update.view);
                }
            },
            {
                decorations: (v) => v.decorations
            }
        );
    }

    private buildDecorations(view: EditorView): DecorationSet {
        // If invisible metadata is enabled, don't show any decorations
        if (this.plugin.settings.enableInvisibleMetadata) {
            return Decoration.none;
        }

        if (!this.plugin.settings.showHighlights && !this.plugin.settings.showIcons) {
            return Decoration.none;
        }

        const builder = new RangeSetBuilder<Decoration>();
        const text = view.state.doc.toString();

        for (const classification of this.classifications) {
            const { start_offset, end_offset, type, color, icon, tagged_by, confidence } = classification;

            // Validate offsets
            if (start_offset < 0 || end_offset > text.length || start_offset >= end_offset) {
                continue;
            }

            // Create highlight decoration
            if (this.plugin.settings.showHighlights) {
                const opacity = Math.round(this.plugin.settings.highlightOpacity * 255)
                    .toString(16)
                    .padStart(2, '0');
                const backgroundColor = `${color}${opacity}`;

                const highlightDeco = Decoration.mark({
                    class: `epistemic-highlight epistemic-${type}`,
                    attributes: {
                        style: `background-color: ${backgroundColor}; border-bottom: 2px solid ${color};`,
                        title: `${type} (${tagged_by}, confidence: ${confidence})`
                    }
                });

                builder.add(start_offset, end_offset, highlightDeco);
            }

            // Create icon decoration
            if (this.plugin.settings.showIcons) {
                const iconDeco = Decoration.widget({
                    widget: new IconWidget(icon, color, type, tagged_by, confidence),
                    side: 1 // Display after the text
                });

                builder.add(end_offset, end_offset, iconDeco);
            }
        }

        return builder.finish();
    }
}

/**
 * Widget for displaying superscript icons
 */
class IconWidget extends WidgetType {
    private icon: string;
    private color: string;
    private type: string;
    private taggedBy: string;
    private confidence: number;

    constructor(icon: string, color: string, type: string, taggedBy: string, confidence: number) {
        super();
        this.icon = icon;
        this.color = color;
        this.type = type;
        this.taggedBy = taggedBy;
        this.confidence = confidence;
    }

    toDOM(): HTMLElement {
        const span = document.createElement('span');
        span.className = 'epistemic-icon';
        span.textContent = this.icon;
        span.style.color = this.color;
        span.style.fontSize = '0.8em';
        span.style.verticalAlign = 'super';
        span.style.marginLeft = '2px';
        span.style.cursor = 'help';
        span.title = `Type: ${this.type}\nTagged by: ${this.taggedBy}\nConfidence: ${this.confidence}`;

        return span;
    }

    ignoreEvent(): boolean {
        return false;
    }
}
