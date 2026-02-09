import { Notice, Editor, MarkdownView, requestUrl } from 'obsidian';
import { CustomPrompt, BundleProfile } from './types';

/**
 * Process entire document with AI using custom prompts
 */
export async function processDocumentWithAI(
    editor: Editor,
    view: MarkdownView,
    prompt: CustomPrompt,
    apiKey: string,
    activeProfile: BundleProfile
): Promise<string | null> {
    if (!apiKey) {
        new Notice('Anthropic API key not configured. Set it in plugin settings.');
        return null;
    }

    const documentContent = editor.getValue();
    
    if (!documentContent || documentContent.trim() === '') {
        new Notice('Document is empty');
        return null;
    }

    try {
        const fullPrompt = `${prompt.prompt}\n\nDocument to analyze:\n\n${documentContent}`;

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
                max_tokens: 4000,
                messages: [{
                    role: 'user',
                    content: fullPrompt
                }]
            })
        });

        const data = response.json;
        const result = data.content[0].text.trim();

        return result;
    } catch (error) {
        console.error('Document processing failed:', error);
        new Notice('Document processing failed. Check console for details.');
        return null;
    }
}

/**
 * Process document and auto-classify sections
 */
export async function processAndClassifyDocument(
    documentContent: string,
    activeProfile: BundleProfile,
    apiKey: string
): Promise<Array<{ text: string; category: string; startOffset: number; endOffset: number }> | null> {
    if (!apiKey) {
        new Notice('Anthropic API key not configured.');
        return null;
    }

    try {
        const categoriesText = activeProfile.categories
            .map(c => `- ${c.name}: ${c.description}`)
            .join('\n');

        const prompt = `You are analyzing a document and identifying key sections that should be classified.

Available categories for the "${activeProfile.displayName}" framework:
${categoriesText}

Document:
${documentContent}

Analyze this document and identify important sections (phrases, sentences, or paragraphs) that should be classified. For each section, provide:
1. The exact text to classify (must match the document exactly)
2. The category name

Return your response as a JSON array with this format:
[
  {"text": "exact text from document", "category": "category_name"},
  ...
]

Only return the JSON array, no additional explanation.`;

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
                max_tokens: 4000,
                messages: [{
                    role: 'user',
                    content: prompt
                }]
            })
        });

        const data = response.json;
        const resultText = data.content[0].text.trim();
        
        // Extract JSON from response (handle markdown code blocks)
        let jsonText = resultText;
        if (resultText.includes('```json')) {
            jsonText = resultText.split('```json')[1].split('```')[0].trim();
        } else if (resultText.includes('```')) {
            jsonText = resultText.split('```')[1].split('```')[0].trim();
        }

        const classifications = JSON.parse(jsonText);
        
        // Find offsets for each classification
        const result = classifications.map((item: { text: string; category: string }) => {
            const startOffset = documentContent.indexOf(item.text);
            if (startOffset === -1) {
                console.warn(`Could not find text in document: ${item.text.substring(0, 50)}...`);
                return null;
            }
            
            return {
                text: item.text,
                category: item.category,
                startOffset,
                endOffset: startOffset + item.text.length
            };
        }).filter((item: { text: string; category: string; startOffset: number; endOffset: number } | null): item is { text: string; category: string; startOffset: number; endOffset: number } => item !== null);

        return result;
    } catch (error) {
        console.error('Auto-classification failed:', error);
        new Notice('Auto-classification failed. Check console for details.');
        return null;
    }
}
