import { Notice } from 'obsidian';

/**
 * Simplified Marker Parser with Configurable Shortcodes
 * Syntax: :::H content ::: or :::H<uuid> content :::
 *
 * User defines shortcuts in settings:
 * H = Hypothesis
 * E = Evidence
 * T = Theory
 * D = Definition
 * LW = Legacy Word
 * SW = Sister Word
 * DP = Drift Percentage
 * etc.
 */

export interface MarkerNode {
    uuid?: string;
    type: string;
    shortcode: string;  // The original shortcode (e.g., "H", "LW")
    content: string;
    startOffset: number;
    endOffset: number;
    rawMatch: string;
    metadata?: Record<string, any>;  // Optional structured data
}

export interface ShortcodeDefinition {
    shortcode: string;
    type: string;
    description: string;
    category?: 'epistemic' | 'lexicon' | 'relation' | 'meta';
}

/**
 * Default shortcode mappings (user can customize in settings)
 */
export const DEFAULT_SHORTCODES: ShortcodeDefinition[] = [
    // Epistemic Types
    { shortcode: 'H', type: 'Hypothesis', description: 'Testable hypothesis', category: 'epistemic' },
    { shortcode: 'E', type: 'Evidence', description: 'Supporting evidence/data', category: 'epistemic' },
    { shortcode: 'T', type: 'Theory', description: 'Theoretical framework', category: 'epistemic' },
    { shortcode: 'D', type: 'Definition', description: 'Concept definition', category: 'epistemic' },
    { shortcode: 'C', type: 'Claim', description: 'Factual claim', category: 'epistemic' },
    { shortcode: 'O', type: 'Observation', description: 'Empirical observation', category: 'epistemic' },
    { shortcode: 'A', type: 'Axiom', description: 'Foundational assumption', category: 'epistemic' },

    // Sister School Lexicon
    { shortcode: 'LW', type: 'Legacy_Word', description: 'Legacy terminology', category: 'lexicon' },
    { shortcode: 'SW', type: 'Sister_Word', description: 'Sister School term', category: 'lexicon' },
    { shortcode: 'DP', type: 'Drift_Percentage', description: 'Semantic drift %', category: 'lexicon' },

    // External References
    { shortcode: 'XT', type: 'External_Theory', description: 'Reference to external theory (1-70)', category: 'meta' },
    { shortcode: 'SD', type: 'Sister_Definition', description: 'Sister School definition', category: 'epistemic' },
];

/**
 * Create shortcode lookup map
 */
export function createShortcodeMap(definitions: ShortcodeDefinition[]): Map<string, ShortcodeDefinition> {
    const map = new Map<string, ShortcodeDefinition>();
    for (const def of definitions) {
        map.set(def.shortcode, def);
    }
    return map;
}

/**
 * Build regex pattern from shortcode definitions
 * Matches: :::H content ::: or :::H<uuid> content :::
 */
export function createMarkerRegex(shortcodes: ShortcodeDefinition[]): RegExp {
    // Sort by length (descending) to match longer codes first (LW before L)
    const codes = shortcodes
        .map(def => def.shortcode)
        .sort((a, b) => b.length - a.length);

    const pattern = codes.map(code => escapeRegex(code)).join('|');

    // Regex breakdown:
    // ::: - literal start marker
    // (LW|SW|DP|H|E|...) - shortcode capture group
    // (?:<([^>]+)>)? - optional UUID in angle brackets
    // \s+ - whitespace
    // (.*?) - content (non-greedy)
    // \s*::: - literal end marker
    return new RegExp(`:::(${pattern})(?:<([^>]+)>)?\\s+(.*?)\\s*:::`, 'gs');
}

function escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Parse all markers from file content
 */
export function parseMarkers(
    fileContent: string,
    shortcodeMap: Map<string, ShortcodeDefinition>
): MarkerNode[] {
    const nodes: MarkerNode[] = [];
    const regex = createMarkerRegex(Array.from(shortcodeMap.values()));

    let match: RegExpExecArray | null;

    while ((match = regex.exec(fileContent)) !== null) {
        const [fullMatch, shortcode, uuid, content] = match;
        const startOffset = match.index;
        const endOffset = match.index + fullMatch.length;

        const definition = shortcodeMap.get(shortcode);
        if (!definition) {
            console.warn(`Unknown shortcode: ${shortcode}`);
            continue;
        }

        nodes.push({
            uuid: uuid || undefined,
            type: definition.type,
            shortcode,
            content: content.trim(),
            startOffset,
            endOffset,
            rawMatch: fullMatch
        });
    }

    return nodes;
}

/**
 * Create marker string with shortcode
 */
export function createMarker(
    shortcode: string,
    content: string,
    uuid?: string
): string {
    if (uuid) {
        return `:::${shortcode}<${uuid}> ${content} :::`;
    } else {
        return `:::${shortcode} ${content} :::`;
    }
}

/**
 * Inject UUID into existing marker
 */
export function injectUUID(marker: MarkerNode, uuid: string): string {
    return createMarker(marker.shortcode, marker.content, uuid);
}

/**
 * Update file content with UUID-injected markers
 * Returns modified file content
 */
export function updateFileWithUUIDs(
    fileContent: string,
    updates: Map<number, { node: MarkerNode; uuid: string }>
): string {
    let updatedContent = fileContent;

    // Sort by start offset (descending) to avoid offset issues
    const sortedUpdates = Array.from(updates.entries()).sort(([a], [b]) => b - a);

    for (const [startOffset, { node, uuid }] of sortedUpdates) {
        const newMarker = injectUUID(node, uuid);

        // Replace old marker with new one
        updatedContent =
            updatedContent.substring(0, node.startOffset) +
            newMarker +
            updatedContent.substring(node.endOffset);
    }

    return updatedContent;
}

/**
 * Validate marker
 */
export function validateMarker(
    marker: MarkerNode,
    shortcodeMap: Map<string, ShortcodeDefinition>
): boolean {
    if (!shortcodeMap.has(marker.shortcode)) {
        new Notice(`Unknown shortcode: ${marker.shortcode}`);
        return false;
    }

    if (!marker.content || marker.content.trim() === '') {
        new Notice('Marker has empty content');
        return false;
    }

    return true;
}

/**
 * Special parser for Sister School lexicon entries
 * Syntax: :::LW Wave Function -> SW Void Oscillation (DP:90%) :::
 */
export function parseLexiconMarker(content: string): {
    legacyWord?: string;
    sisterWord?: string;
    driftPercentage?: number;
} | null {
    // Pattern: "legacy term -> sister term (DP:90%)"
    const match = content.match(/(.+?)\s*->\s*(.+?)(?:\s*\(DP:(\d+)%?\))?$/);

    if (!match) {
        return null;
    }

    const [, legacyWord, sisterWord, driftStr] = match;

    return {
        legacyWord: legacyWord.trim(),
        sisterWord: sisterWord.trim(),
        driftPercentage: driftStr ? parseFloat(driftStr) : undefined
    };
}

/**
 * Examples of valid marker syntax:
 *
 * Basic hypothesis:
 * :::H Time is emergent from quantum decoherence :::
 *
 * With UUID (after first save):
 * :::H<a1b2c3d4-...> Time is emergent from quantum decoherence :::
 *
 * Evidence:
 * :::E CMB data shows unexpected patterns at large scales :::
 *
 * Sister School translation:
 * :::LW Wave Function -> SW Void Oscillation (DP:90%) :::
 *
 * External theory reference:
 * :::XT Bohm's Implicate Order (#42) shows similar collapse mechanism :::
 *
 * Definition:
 * :::D Void Oscillation = Quantum field fluctuation in absence of particles :::
 */

/**
 * Query command parser (unchanged)
 * Matches: {{QUERY: Show contradictions}}
 */
export interface QueryCommand {
    queryType: string;
    queryText: string;
    offset: number;
    fullMatch: string;
}

const QUERY_REGEX = /\{\{QUERY:\s*([^}]+)\}\}/g;

export function parseQueryCommands(fileContent: string): QueryCommand[] {
    const commands: QueryCommand[] = [];
    let match: RegExpExecArray | null;

    QUERY_REGEX.lastIndex = 0;

    while ((match = QUERY_REGEX.exec(fileContent)) !== null) {
        const [fullMatch, queryText] = match;
        const offset = match.index;

        const queryType = inferQueryType(queryText);

        commands.push({
            queryType,
            queryText: queryText.trim(),
            offset,
            fullMatch
        });
    }

    return commands;
}

function inferQueryType(queryText: string): string {
    const lower = queryText.toLowerCase();

    if (lower.includes('contradiction') || lower.includes('refute')) {
        return 'CONTRADICTION';
    }
    if (lower.includes('support') || lower.includes('evidence')) {
        return 'SUPPORT';
    }
    if (lower.includes('similar') || lower.includes('related')) {
        return 'SIMILARITY';
    }
    if (lower.includes('sister') || lower.includes('translation')) {
        return 'TRANSLATION';
    }
    if (lower.includes('theory') || lower.includes('70')) {
        return 'THEORY_MATCH';
    }

    return 'GENERAL';
}

/**
 * Create query result callout
 */
export function createQueryResultCallout(
    queryText: string,
    results: any[],
    queryType: string
): string {
    const timestamp = new Date().toISOString();
    let callout = `\n> [!info] Query Results (${queryType})\n`;
    callout += `> **Query:** ${queryText}\n`;
    callout += `> **Executed:** ${timestamp}\n`;
    callout += `> **Results:** ${results.length}\n>\n`;

    if (results.length === 0) {
        callout += `> No results found.\n`;
    } else {
        results.slice(0, 5).forEach((result, i) => {
            callout += `> ${i + 1}. ${result.content?.substring(0, 100)}...\n`;
            if (result.similarity) {
                callout += `>    *Similarity: ${(result.similarity * 100).toFixed(1)}%*\n`;
            }
        });

        if (results.length > 5) {
            callout += `> ... and ${results.length - 5} more results\n`;
        }
    }

    callout += `\n`;
    return callout;
}

/**
 * Inject query results into file
 */
export function injectQueryResults(
    fileContent: string,
    queryOffset: number,
    queryMatch: string,
    resultCallout: string
): string {
    const insertPosition = queryOffset + queryMatch.length;

    return (
        fileContent.substring(0, insertPosition) +
        resultCallout +
        fileContent.substring(insertPosition)
    );
}
