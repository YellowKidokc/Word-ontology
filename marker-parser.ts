import { Notice } from 'obsidian';

/**
 * Marker Parser for bidirectional sync between Obsidian and PostgreSQL
 * Handles syntax: ::: [Type] {Attributes} content :::
 */

export interface MarkerNode {
    uuid?: string;
    type: string;
    attributes: Record<string, string>;
    content: string;
    startOffset: number;
    endOffset: number;
    rawMatch: string;
}

export interface ParsedMarker {
    nodes: MarkerNode[];
    fileContent: string;
}

/**
 * Regular expression for parsing marker syntax
 * Matches: ::: [Type] {Attr1:Val1, Attr2:Val2} content :::
 */
const MARKER_REGEX = /:::\s*\[([^\]]+)\]\s*\{([^}]*)\}\s+((?:(?!:::).)*)\s*:::/gs;

/**
 * Alternative regex for markers with UUID already embedded
 * Matches: ::: [Type] {ID:uuid, Attr:Val} content :::
 */
const MARKER_WITH_UUID_REGEX = /:::\s*\[([^\]]+)\]\s*\{([^}]*)\}\s+((?:(?!:::).)*)\s*:::/gs;

/**
 * Parse all markers from file content
 */
export function parseMarkers(fileContent: string): MarkerNode[] {
    const nodes: MarkerNode[] = [];
    let match: RegExpExecArray | null;

    // Reset regex state
    MARKER_REGEX.lastIndex = 0;

    while ((match = MARKER_REGEX.exec(fileContent)) !== null) {
        const [fullMatch, type, attributesStr, content] = match;
        const startOffset = match.index;
        const endOffset = match.index + fullMatch.length;

        // Parse attributes
        const attributes = parseAttributes(attributesStr);

        // Extract UUID if present
        const uuid = attributes['ID'] || attributes['UUID'] || attributes['id'] || attributes['uuid'];
        if (uuid) {
            delete attributes['ID'];
            delete attributes['UUID'];
            delete attributes['id'];
            delete attributes['uuid'];
        }

        nodes.push({
            uuid,
            type: type.trim(),
            attributes,
            content: content.trim(),
            startOffset,
            endOffset,
            rawMatch: fullMatch
        });
    }

    return nodes;
}

/**
 * Parse attribute string into key-value object
 * Input: "Source:Hawking, SisterTerm:Void_Limit, Confidence:0.95"
 * Output: {Source: "Hawking", SisterTerm: "Void_Limit", Confidence: "0.95"}
 */
export function parseAttributes(attrStr: string): Record<string, string> {
    const attributes: Record<string, string> = {};

    if (!attrStr || attrStr.trim() === '') {
        return attributes;
    }

    // Split by comma, then by colon
    const pairs = attrStr.split(',').map(s => s.trim());

    for (const pair of pairs) {
        const colonIndex = pair.indexOf(':');
        if (colonIndex === -1) continue;

        const key = pair.substring(0, colonIndex).trim();
        const value = pair.substring(colonIndex + 1).trim();

        if (key && value) {
            attributes[key] = value;
        }
    }

    return attributes;
}

/**
 * Serialize attributes back to string format
 */
export function serializeAttributes(attributes: Record<string, string>, uuid?: string): string {
    const attrs = { ...attributes };

    // Always put UUID first if present
    if (uuid) {
        attrs['ID'] = uuid;
    }

    const pairs = Object.entries(attrs)
        .sort(([key1], [key2]) => {
            // ID always first
            if (key1 === 'ID') return -1;
            if (key2 === 'ID') return 1;
            return key1.localeCompare(key2);
        })
        .map(([key, value]) => `${key}:${value}`);

    return pairs.join(', ');
}

/**
 * Create marker string from components
 */
export function createMarker(
    type: string,
    content: string,
    attributes: Record<string, string> = {},
    uuid?: string
): string {
    const attrStr = serializeAttributes(attributes, uuid);
    return `::: [${type}] {${attrStr}} ${content} :::`;
}

/**
 * Inject UUID into existing marker
 * This rewrites the marker in-place with the UUID added
 */
export function injectUUID(marker: MarkerNode, uuid: string): string {
    return createMarker(marker.type, marker.content, marker.attributes, uuid);
}

/**
 * Update file content with new markers (UUID injection)
 * Returns modified file content
 */
export function updateFileWithUUIDs(
    fileContent: string,
    updates: Map<number, { node: MarkerNode; uuid: string }>
): string {
    let updatedContent = fileContent;
    let offset = 0;

    // Sort by start offset (descending) to avoid offset issues when replacing
    const sortedUpdates = Array.from(updates.entries()).sort(([a], [b]) => b - a);

    for (const [startOffset, { node, uuid }] of sortedUpdates) {
        const newMarker = injectUUID(node, uuid);
        const adjustedStart = startOffset + offset;
        const adjustedEnd = adjustedStart + node.rawMatch.length;

        // Replace old marker with new one
        updatedContent =
            updatedContent.substring(0, adjustedStart) +
            newMarker +
            updatedContent.substring(adjustedEnd);

        // Update offset for next replacements
        offset += newMarker.length - node.rawMatch.length;
    }

    return updatedContent;
}

/**
 * Validate marker syntax
 */
export function validateMarker(marker: MarkerNode): boolean {
    if (!marker.type || marker.type.trim() === '') {
        new Notice('Invalid marker: missing type');
        return false;
    }

    if (!marker.content || marker.content.trim() === '') {
        new Notice('Invalid marker: missing content');
        return false;
    }

    // Validate type is one of the allowed types
    const validTypes = [
        'Hypothesis', 'Evidence', 'Theory', 'Definition', 'Claim',
        'External_Theory', 'Sister_Definition', 'Observation', 'Axiom'
    ];

    if (!validTypes.includes(marker.type)) {
        console.warn(`Non-standard marker type: ${marker.type}`);
        // Don't reject, just warn
    }

    return true;
}

/**
 * Extract Sister School terms from content
 * Scans for words that match the Sister Lexicon
 */
export function extractSisterTerms(
    content: string,
    lexicon: Map<string, string>
): string[] {
    const found: string[] = [];
    const words = content.split(/\s+/);

    for (const word of words) {
        const cleaned = word.replace(/[^\w]/g, '').toLowerCase();
        if (lexicon.has(cleaned)) {
            found.push(cleaned);
        }
    }

    return found;
}

/**
 * Parse query commands from file
 * Matches: {{QUERY: Show contradictions to this paragraph}}
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

        // Parse query type from text
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

/**
 * Infer query type from natural language
 */
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
 * Create query result callout for injection into markdown
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
 * Inject query results back into file after the query command
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
