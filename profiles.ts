import { BundleProfile, EpistemicType } from './types';

/**
 * Predefined bundle profiles for different use cases
 */

// Personal Research Profile - Full epistemic categories
const personalResearchTypes: EpistemicType[] = [
    {
        name: 'axiom',
        displayName: 'Axiom',
        description: 'Foundational assumption or first principle',
        color: '#FF6B6B',
        icon: '⚛',
        priority: 1
    },
    {
        name: 'canonical',
        displayName: 'Canonical',
        description: 'Established core claim',
        color: '#4ECDC4',
        icon: '◆',
        priority: 2
    },
    {
        name: 'evidence',
        displayName: 'Evidence',
        description: 'Supporting data or observation',
        color: '#95E1D3',
        icon: '●',
        priority: 3
    },
    {
        name: 'coherence',
        displayName: 'Coherence',
        description: 'Derived logical relationship',
        color: '#F38181',
        icon: '⟷',
        priority: 4
    },
    {
        name: 'reference',
        displayName: 'Reference',
        description: 'External citation or authority',
        color: '#AA96DA',
        icon: '◈',
        priority: 5
    }
];

// YouTube Content Profile - Optimized for video scripts
const youtubeContentTypes: EpistemicType[] = [
    {
        name: 'key_point',
        displayName: 'Key Point',
        description: 'Main takeaway or thesis',
        color: '#FF6B6B',
        icon: '★',
        priority: 1
    },
    {
        name: 'evidence',
        displayName: 'Evidence',
        description: 'Supporting example or data',
        color: '#4ECDC4',
        icon: '●',
        priority: 2
    },
    {
        name: 'story',
        displayName: 'Story/Example',
        description: 'Narrative or anecdote',
        color: '#95E1D3',
        icon: '◐',
        priority: 3
    },
    {
        name: 'cta',
        displayName: 'Call-to-Action',
        description: 'Call to action',
        color: '#F38181',
        icon: '▶',
        priority: 4
    }
];

// AI Training Data Profile - For building training datasets
const aiTrainingTypes: EpistemicType[] = [
    {
        name: 'ground_truth',
        displayName: 'Ground Truth',
        description: 'Verified factual claim',
        color: '#00D9FF',
        icon: '✓',
        priority: 1
    },
    {
        name: 'ambiguous',
        displayName: 'Ambiguous',
        description: 'Unclear or needs context',
        color: '#FFB84D',
        icon: '?',
        priority: 2
    },
    {
        name: 'contradictory',
        displayName: 'Contradictory',
        description: 'Conflicts with other claims',
        color: '#FF4D4D',
        icon: '✗',
        priority: 3
    },
    {
        name: 'high_confidence',
        displayName: 'High Confidence',
        description: 'Strong supporting evidence',
        color: '#4DFF88',
        icon: '◉',
        priority: 4
    }
];

export const BUNDLE_PROFILES: BundleProfile[] = [
    {
        id: 'personal',
        name: 'personal',
        displayName: 'Personal Research',
        description: 'Full epistemic categories for research and knowledge management',
        categories: personalResearchTypes
    },
    {
        id: 'youtube',
        name: 'youtube',
        displayName: 'YouTube Content',
        description: 'Simplified categories for video script structure',
        categories: youtubeContentTypes
    },
    {
        id: 'ai_training',
        name: 'ai_training',
        displayName: 'AI Training Data',
        description: 'Categories for building training datasets',
        categories: aiTrainingTypes
    }
];

export function getProfileByName(name: string): BundleProfile | undefined {
    return BUNDLE_PROFILES.find(p => p.name === name);
}

export function getActiveProfile(profileName: string): BundleProfile {
    return getProfileByName(profileName) || BUNDLE_PROFILES[0];
}
