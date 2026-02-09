import { Notice, requestUrl } from 'obsidian';
import { EpistemicClassification, BundleProfile, EpistemicType } from './types';

/**
 * AI-assisted classification using Anthropic Claude API
 */
export async function classifyWithAI(
    text: string,
    profile: BundleProfile,
    apiKey: string
): Promise<string | null> {
    if (!apiKey) {
        new Notice('Anthropic API key not configured. Set it in plugin settings.');
        return null;
    }

    try {
        const categoriesText = profile.categories
            .map((c: EpistemicType) => `- ${c.name}: ${c.description}`)
            .join('\n');

        const prompt = `You are a text classifier. Classify the following text according to the "${profile.displayName}" epistemic framework.

Available categories:
${categoriesText}

Text to classify:
"${text}"

Return ONLY the category name (e.g., "axiom", "key_point", etc.) with no additional explanation.`;

        const response = await requestUrl({
            url: 'https://api.anthropic.com/v1/messages',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
                model: 'claude-sonnet-4-20250514',
                max_tokens: 200,
                messages: [{
                    role: 'user',
                    content: prompt
                }]
            })
        });

        const data = response.json;
        const suggestedType = data.content[0].text.trim().toLowerCase();

        // Validate that the suggested type exists in the profile
        const validType = profile.categories.find((c: EpistemicType) => c.name === suggestedType);
        if (!validType) {
            console.warn(`AI suggested invalid type: ${suggestedType}`);
            return null;
        }

        return suggestedType;
    } catch (error) {
        console.error('AI classification failed:', error);
        new Notice('AI classification failed. Check console for details.');
        return null;
    }
}

/**
 * Create a classification object from editor selection
 */
export function createClassification(
    content: string,
    type: string,
    profile: string,
    sourceFile: string,
    startOffset: number,
    endOffset: number,
    taggedBy: string,
    confidence: number = 1.0,
    notes?: string
): EpistemicClassification {
    return {
        id: '', // Will be set by database
        content,
        type,
        profile,
        sourceFile,
        startOffset,
        endOffset,
        taggedBy,
        taggedAt: new Date(),
        confidence,
        notes
    };
}

/**
 * Validate classification data
 */
export function validateClassification(classification: EpistemicClassification): boolean {
    if (!classification.content || classification.content.trim() === '') {
        new Notice('Cannot classify empty text');
        return false;
    }

    if (!classification.type) {
        new Notice('No classification type specified');
        return false;
    }

    if (classification.startOffset < 0 || classification.endOffset < 0) {
        new Notice('Invalid text offsets');
        return false;
    }

    if (classification.startOffset >= classification.endOffset) {
        new Notice('Invalid text range');
        return false;
    }

    return true;
}
