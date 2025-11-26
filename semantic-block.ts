/**
 * Semantic Block Utilities
 * 
 * Handles reading, writing, and managing semantic blocks in markdown files.
 * Semantic blocks are embedded at the end of markdown files using Obsidian's
 * comment syntax (%%semantic...%%) to store structured annotations.
 * 
 * This makes all classifications portable - they live both in PostgreSQL for
 * fast querying AND in the markdown file itself for self-contained portability.
 */

import { TFile, Vault } from 'obsidian';
import { DatabaseClassification } from './types';
import { v4 as uuidv4 } from 'uuid';

/**
 * The semantic block structure that gets embedded in markdown files.
 * This matches the specification from the documentation.
 */
export interface SemanticBlock {
    version: string;
    uuid: string; // Note UUID (format: "note-{uuid}")
    created: string; // ISO 8601 timestamp
    modified: string; // ISO 8601 timestamp
    annotations: SemanticAnnotation[];
    relationships: SemanticRelationship[];
    metadata: SemanticMetadata;
}

/**
 * An annotation represents a classified piece of text.
 * This is the portable version of DatabaseClassification.
 */
export interface SemanticAnnotation {
    uuid: string; // Annotation UUID (format: "ann-{uuid}")
    kind: string; // Type of annotation (axiom, claim, evidence, etc.)
    text: string; // The actual text content that was annotated
    start: number; // Character offset where annotation begins
    end: number; // Character offset where annotation ends
    lineStart: number; // Line number where annotation begins (1-indexed)
    lineEnd: number; // Line number where annotation ends (1-indexed)
    created: string; // ISO 8601 timestamp
    modified: string; // ISO 8601 timestamp
    createdBy: string; // Who created this (username or "ai")
    confidence: number; // 0.0 to 1.0
    theory?: string; // Optional theory assignment
    tags: string[]; // Array of tags
    properties: Record<string, any>; // Kind-specific additional data
}

/**
 * A relationship connects two annotations with a typed edge.
 * Not currently used but included for future expansion.
 */
export interface SemanticRelationship {
    uuid: string;
    type: string; // supports, contradicts, implies, etc.
    source: string; // Source annotation UUID
    target: string; // Target annotation UUID
    confidence: number;
    created: string;
    createdBy: string;
    bidirectional: boolean;
    properties: Record<string, any>;
}

/**
 * Note-level metadata for tracking and organization.
 */
export interface SemanticMetadata {
    title: string;
    theories: string[];
    domain?: string;
    status?: string; // draft, in-progress, review, complete, archived
    lastAiReview?: string;
    lastAiModel?: string;
    coherenceContribution?: number;
    flags: string[];
    customFields: Record<string, any>;
}

/**
 * Regular expressions for finding semantic blocks in markdown.
 */
const SEMANTIC_BLOCK_START = /^%%semantic\s*$/m;
const SEMANTIC_BLOCK_END = /^%%\s*$/m;

/**
 * Extract the semantic block from a markdown file if it exists.
 * Returns null if no semantic block is found.
 */
export function extractSemanticBlock(content: string): SemanticBlock | null {
    // Find the start marker
    const startMatch = content.match(SEMANTIC_BLOCK_START);
    if (!startMatch) {
        return null;
    }

    const startIndex = startMatch.index! + startMatch[0].length;
    
    // Find the end marker after the start
    const remainingContent = content.substring(startIndex);
    const endMatch = remainingContent.match(SEMANTIC_BLOCK_END);
    if (!endMatch) {
        console.warn('Semantic block start found but no end marker');
        return null;
    }

    // Extract the JSON between markers
    const jsonContent = remainingContent.substring(0, endMatch.index).trim();
    
    try {
        const block = JSON.parse(jsonContent) as SemanticBlock;
        return block;
    } catch (error) {
        console.error('Failed to parse semantic block JSON:', error);
        return null;
    }
}

/**
 * Remove any existing semantic block from markdown content.
 * This is used when we want to replace it with an updated version.
 */
export function removeSemanticBlock(content: string): string {
    const startMatch = content.match(SEMANTIC_BLOCK_START);
    if (!startMatch) {
        return content;
    }

    const startIndex = startMatch.index!;
    const remainingContent = content.substring(startIndex);
    const endMatch = remainingContent.match(SEMANTIC_BLOCK_END);
    
    if (!endMatch) {
        // If there's a start but no end, just remove from start to end of file
        return content.substring(0, startIndex).trimEnd();
    }

    // Remove everything from start marker to end marker (inclusive)
    const endIndex = startIndex + endMatch.index! + endMatch[0].length;
    return content.substring(0, startIndex).trimEnd();
}

/**
 * Embed a semantic block at the end of markdown content.
 * This preserves the existing content and adds/updates the semantic block.
 */
export function embedSemanticBlock(content: string, block: SemanticBlock): string {
    // First remove any existing semantic block
    const cleanContent = removeSemanticBlock(content);
    
    // Format the JSON with nice indentation
    const jsonContent = JSON.stringify(block, null, 2);
    
    // Add the semantic block at the end with proper spacing
    const blockText = `\n\n%%semantic\n${jsonContent}\n%%`;
    
    return cleanContent + blockText;
}

/**
 * Calculate the line number for a given character offset in a string.
 * Lines are 1-indexed (first line is line 1).
 * 
 * @param content The full text content
 * @param offset The character position to find the line number for
 * @returns The line number (1-indexed)
 */
export function getLineNumberFromOffset(content: string, offset: number): number {
    // Count newline characters before this offset
    let lineNumber = 1;
    for (let i = 0; i < offset && i < content.length; i++) {
        if (content[i] === '\n') {
            lineNumber++;
        }
    }
    return lineNumber;
}

/**
 * Calculate both start and end line numbers for a text span.
 * 
 * @param content The full text content
 * @param startOffset Character offset where span begins
 * @param endOffset Character offset where span ends
 * @returns Object with lineStart and lineEnd (both 1-indexed)
 */
export function getLineNumbers(
    content: string, 
    startOffset: number, 
    endOffset: number
): { lineStart: number; lineEnd: number } {
    return {
        lineStart: getLineNumberFromOffset(content, startOffset),
        lineEnd: getLineNumberFromOffset(content, endOffset)
    };
}

/**
 * Convert a DatabaseClassification to a SemanticAnnotation.
 * This is the bridge between the PostgreSQL format and the portable format.
 * 
 * @param classification The database classification to convert
 * @param fileContent Optional file content for calculating line numbers
 */
export function classificationToAnnotation(
    classification: DatabaseClassification,
    fileContent?: string
): SemanticAnnotation {
    // Calculate line numbers if file content is provided
    let lineStart = 0;
    let lineEnd = 0;
    
    if (fileContent) {
        const lines = getLineNumbers(
            fileContent, 
            classification.start_offset, 
            classification.end_offset
        );
        lineStart = lines.lineStart;
        lineEnd = lines.lineEnd;
    }
    
    return {
        uuid: classification.id.startsWith('ann-') ? classification.id : `ann-${classification.id}`,
        kind: classification.type,
        text: classification.content,
        start: classification.start_offset,
        end: classification.end_offset,
        lineStart: lineStart,
        lineEnd: lineEnd,
        created: classification.tagged_at || new Date().toISOString(),
        modified: classification.tagged_at || new Date().toISOString(),
        createdBy: classification.tagged_by || 'user',
        confidence: classification.confidence || 1.0,
        theory: undefined, // Not currently tracked in database
        tags: [], // Not currently tracked in database
        properties: {
            profile: classification.bundle_profile,
            notes: classification.notes
        }
    };
}

/**
 * Convert a SemanticAnnotation back to a DatabaseClassification.
 * This is used when loading semantic blocks to sync to PostgreSQL.
 */
export function annotationToClassification(
    annotation: SemanticAnnotation,
    sourceFile: string,
    profile: string
): DatabaseClassification {
    // Strip the "ann-" prefix if present
    const id = annotation.uuid.startsWith('ann-') 
        ? annotation.uuid.substring(4) 
        : annotation.uuid;

    return {
        id: id,
        content: annotation.text,
        source_file: sourceFile,
        start_offset: annotation.start,
        end_offset: annotation.end,
        type: annotation.kind,
        bundle_profile: annotation.properties?.profile || profile,
        tagged_by: annotation.createdBy,
        tagged_at: annotation.created,
        confidence: annotation.confidence,
        notes: annotation.properties?.notes
    };
}

/**
 * Create a new semantic block for a file that doesn't have one yet.
 * Initializes with empty annotations and basic metadata.
 */
export function createNewSemanticBlock(
    fileTitle: string,
    existingAnnotations: SemanticAnnotation[] = []
): SemanticBlock {
    const now = new Date().toISOString();
    
    return {
        version: '1.0',
        uuid: `note-${uuidv4()}`,
        created: now,
        modified: now,
        annotations: existingAnnotations,
        relationships: [],
        metadata: {
            title: fileTitle,
            theories: [],
            flags: [],
            customFields: {}
        }
    };
}

/**
 * Read a semantic block from a file in the vault.
 * Returns the block if found, or creates a new one if the file has no block.
 */
export async function readSemanticBlockFromFile(
    vault: Vault,
    file: TFile
): Promise<SemanticBlock> {
    const content = await vault.read(file);
    const existingBlock = extractSemanticBlock(content);
    
    if (existingBlock) {
        return existingBlock;
    }
    
    // No semantic block exists - create a new one
    return createNewSemanticBlock(file.basename);
}

/**
 * Write a semantic block back to a file in the vault.
 * This updates the file with the new semantic block embedded at the end.
 */
export async function writeSemanticBlockToFile(
    vault: Vault,
    file: TFile,
    block: SemanticBlock
): Promise<void> {
    // Update the modified timestamp
    block.modified = new Date().toISOString();
    
    // Read current content
    const content = await vault.read(file);
    
    // Embed the semantic block
    const newContent = embedSemanticBlock(content, block);
    
    // Write back to file
    await vault.modify(file, newContent);
}

/**
 * Add or update an annotation in a semantic block.
 * If an annotation with the same UUID exists, it's updated. Otherwise, it's added.
 */
export function upsertAnnotation(
    block: SemanticBlock,
    annotation: SemanticAnnotation
): SemanticBlock {
    const existingIndex = block.annotations.findIndex(a => a.uuid === annotation.uuid);
    
    if (existingIndex >= 0) {
        // Update existing annotation
        block.annotations[existingIndex] = {
            ...annotation,
            modified: new Date().toISOString()
        };
    } else {
        // Add new annotation
        block.annotations.push(annotation);
    }
    
    block.modified = new Date().toISOString();
    return block;
}

/**
 * Remove an annotation from a semantic block by UUID.
 */
export function removeAnnotation(
    block: SemanticBlock,
    annotationUuid: string
): SemanticBlock {
    block.annotations = block.annotations.filter(a => a.uuid !== annotationUuid);
    block.modified = new Date().toISOString();
    return block;
}

/**
 * Sync classifications from PostgreSQL to a semantic block.
 * This converts all database classifications to annotations and updates the block.
 * 
 * @param block The semantic block to update
 * @param classifications The database classifications to sync
 * @param fileContent The file content for calculating line numbers
 */
export function syncClassificationsToBlock(
    block: SemanticBlock,
    classifications: DatabaseClassification[],
    fileContent: string
): SemanticBlock {
    // Convert all classifications to annotations with line numbers
    const annotations = classifications.map(c => 
        classificationToAnnotation(c, fileContent)
    );
    
    // Replace the annotations array (PostgreSQL is source of truth)
    block.annotations = annotations;
    block.modified = new Date().toISOString();
    
    return block;
}

/**
 * Get annotations from a semantic block that aren't in the database.
 * This is used to find annotations that exist in the file but haven't been synced to PostgreSQL yet.
 */
export function findUnsyncedAnnotations(
    block: SemanticBlock,
    dbClassifications: DatabaseClassification[]
): SemanticAnnotation[] {
    const dbIds = new Set(dbClassifications.map(c => 
        c.id.startsWith('ann-') ? c.id : `ann-${c.id}`
    ));
    
    return block.annotations.filter(annotation => 
        !dbIds.has(annotation.uuid)
    );
}