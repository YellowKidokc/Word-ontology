/**
 * Core TypeScript interfaces for Epistemic Tagger plugin
 */

export interface EpistemicClassification {
    id: string;
    content: string;
    type: string;
    profile: string;
    startOffset: number;
    endOffset: number;
    sourceFile: string;
    sourceVault?: string;
    lineStart?: number;
    lineEnd?: number;
    taggedBy: string;
    taggedAt: Date;
    confidence: number;
    notes?: string;
}

export interface EpistemicType {
    id?: string;
    name: string;
    displayName: string;
    description: string;
    color: string;
    icon: string;
    priority: number;
}

export interface BundleProfile {
    id: string;
    name: string;
    displayName: string;
    description: string;
    categories: EpistemicType[];
}

export interface PluginSettings {
    postgresUrl: string;
    activeProfile: string;
    showHighlights: boolean;
    showIcons: boolean;
    highlightOpacity: number;
    anthropicApiKey?: string;
    username: string;
}

export const DEFAULT_SETTINGS: PluginSettings = {
    postgresUrl: 'postgresql://postgres:password@192.168.1.215:5432/kj',
    activeProfile: 'personal',
    showHighlights: true,
    showIcons: true,
    highlightOpacity: 0.3,
    anthropicApiKey: '',
    username: 'user'
};

export interface DatabaseClassification {
    id: string;
    content: string;
    source_file: string;
    start_offset: number;
    end_offset: number;
    type: string;
    color: string;
    icon: string;
    confidence: number;
    tagged_by: string;
    tagged_at: Date;
    notes?: string;
}
