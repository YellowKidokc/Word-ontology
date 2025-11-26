/**
 * Master Dashboard Generator
 * 
 * Generates clean, tabular markdown files showing all annotations across the vault.
 * One file per annotation type (axioms, claims, evidence, equations, etc.)
 * Plus a master index linking to all type-specific dashboards.
 * 
 * This is the "master spreadsheet" that aggregates everything in a no-nonsense format.
 */

import { Vault, TFile, Notice } from 'obsidian';
import { DatabaseService } from './database';
import { DatabaseClassification } from './types';

/**
 * Configuration for where master dashboard files get created
 */
export interface DashboardConfig {
    outputFolder: string; // Where to create dashboard files (e.g., "master-truth" or "data-analytics")
    includeLineNumbers: boolean; // Whether to show line numbers in tables
    sortBy: 'file' | 'line' | 'created' | 'type'; // How to sort entries
}

export const DEFAULT_DASHBOARD_CONFIG: DashboardConfig = {
    outputFolder: 'master-truth',
    includeLineNumbers: true,
    sortBy: 'file'
};

/**
 * Represents a row in the master spreadsheet
 */
interface DashboardRow {
    text: string;
    file: string;
    line?: number;
    createdBy: string;
    createdAt: string;
    confidence: number;
    notes?: string;
    type: string;
}

/**
 * Generate all master dashboard files for the vault
 */
export async function generateMasterDashboards(
    vault: Vault,
    db: DatabaseService,
    config: DashboardConfig = DEFAULT_DASHBOARD_CONFIG
): Promise<void> {
    try {
        new Notice('Generating master dashboards...');

        // Query all classifications from database
        const allClassifications = await db.getAllClassifications();

        if (allClassifications.length === 0) {
            new Notice('No classifications found to generate dashboards');
            return;
        }

        // Group classifications by type
        const byType = groupClassificationsByType(allClassifications);

        // Ensure output folder exists
        await ensureFolderExists(vault, config.outputFolder);

        // Generate a dashboard file for each type
        const typeFiles: string[] = [];
        for (const [typeName, classifications] of Object.entries(byType)) {
            const filename = await generateTypeDashboard(
                vault,
                typeName,
                classifications,
                config
            );
            typeFiles.push(filename);
        }

        // Generate master index file linking to all type dashboards
        await generateMasterIndex(vault, byType, typeFiles, config);

        new Notice(`✓ Generated ${typeFiles.length} dashboard files in ${config.outputFolder}/`);
    } catch (error) {
        console.error('Failed to generate master dashboards:', error);
        new Notice('Failed to generate dashboards. Check console for details.');
    }
}

/**
 * Group classifications by their type
 */
function groupClassificationsByType(
    classifications: DatabaseClassification[]
): Record<string, DatabaseClassification[]> {
    const grouped: Record<string, DatabaseClassification[]> = {};

    for (const classification of classifications) {
        const type = classification.type;
        if (!grouped[type]) {
            grouped[type] = [];
        }
        grouped[type].push(classification);
    }

    return grouped;
}

/**
 * Generate a dashboard file for a specific annotation type
 */
async function generateTypeDashboard(
    vault: Vault,
    typeName: string,
    classifications: DatabaseClassification[],
    config: DashboardConfig
): Promise<string> {
    // Convert classifications to dashboard rows
    const rows = classifications.map(c => classificationToDashboardRow(c));

    // Sort rows based on config
    sortDashboardRows(rows, config.sortBy);

    // Generate markdown table
    const markdown = generateMarkdownTable(typeName, rows, config);

    // Write to file
    const filename = `${sanitizeFilename(typeName)}.md`;
    const filepath = `${config.outputFolder}/${filename}`;
    
    await writeOrUpdateFile(vault, filepath, markdown);

    return filename;
}

/**
 * Convert a database classification to a dashboard row
 */
function classificationToDashboardRow(classification: DatabaseClassification): DashboardRow {
    return {
        text: classification.content,
        file: classification.source_file,
        line: undefined, // Line numbers would need to be calculated from semantic blocks
        createdBy: classification.tagged_by || 'unknown',
        createdAt: classification.tagged_at || '',
        confidence: classification.confidence || 1.0,
        notes: classification.notes,
        type: classification.type
    };
}

/**
 * Sort dashboard rows based on specified criteria
 */
function sortDashboardRows(rows: DashboardRow[], sortBy: DashboardConfig['sortBy']): void {
    switch (sortBy) {
        case 'file':
            rows.sort((a, b) => a.file.localeCompare(b.file));
            break;
        case 'line':
            rows.sort((a, b) => (a.line || 0) - (b.line || 0));
            break;
        case 'created':
            rows.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
            break;
        case 'type':
            rows.sort((a, b) => a.type.localeCompare(b.type));
            break;
    }
}

/**
 * Generate a markdown table from dashboard rows
 */
function generateMarkdownTable(
    typeName: string,
    rows: DashboardRow[],
    config: DashboardConfig
): string {
    const lines: string[] = [];

    // Header
    lines.push(`# ${capitalize(typeName)} Dashboard`);
    lines.push('');
    lines.push(`*Generated: ${new Date().toLocaleString()}*`);
    lines.push(`*Total: ${rows.length} items*`);
    lines.push('');

    // Table header
    const headers = ['Text', 'File'];
    if (config.includeLineNumbers) {
        headers.push('Line');
    }
    headers.push('Created By', 'Confidence', 'Notes');

    lines.push(`| ${headers.join(' | ')} |`);
    lines.push(`| ${headers.map(() => '---').join(' | ')} |`);

    // Table rows
    for (const row of rows) {
        const cells: string[] = [];
        
        // Text (truncate if too long)
        cells.push(truncateText(row.text, 80));
        
        // File (make it a link)
        const fileLink = `[[${row.file}]]`;
        cells.push(fileLink);
        
        // Line number (if enabled)
        if (config.includeLineNumbers) {
            cells.push(row.line ? row.line.toString() : '-');
        }
        
        // Created by
        cells.push(row.createdBy);
        
        // Confidence (as percentage)
        cells.push(`${Math.round(row.confidence * 100)}%`);
        
        // Notes (truncate if present)
        cells.push(row.notes ? truncateText(row.notes, 40) : '-');

        lines.push(`| ${cells.join(' | ')} |`);
    }

    return lines.join('\n');
}

/**
 * Generate the master index file that links to all type dashboards
 */
async function generateMasterIndex(
    vault: Vault,
    byType: Record<string, DatabaseClassification[]>,
    typeFiles: string[],
    config: DashboardConfig
): Promise<void> {
    const lines: string[] = [];

    lines.push('# Master Truth Dashboard');
    lines.push('');
    lines.push(`*Generated: ${new Date().toLocaleString()}*`);
    lines.push('');
    lines.push('## Overview');
    lines.push('');

    // Summary statistics
    const totalClassifications = Object.values(byType).reduce((sum, arr) => sum + arr.length, 0);
    lines.push(`**Total Annotations:** ${totalClassifications}`);
    lines.push(`**Annotation Types:** ${Object.keys(byType).length}`);
    lines.push('');

    // Statistics by type
    lines.push('## By Type');
    lines.push('');
    lines.push('| Type | Count | Dashboard |');
    lines.push('| --- | --- | --- |');

    const sortedTypes = Object.keys(byType).sort();
    for (const type of sortedTypes) {
        const count = byType[type].length;
        const filename = `${sanitizeFilename(type)}.md`;
        const link = `[[${config.outputFolder}/${filename}\\|View]]`;
        lines.push(`| ${capitalize(type)} | ${count} | ${link} |`);
    }

    lines.push('');
    lines.push('---');
    lines.push('');
    lines.push('*This dashboard is automatically generated from your vault annotations.*');

    const filepath = `${config.outputFolder}/00-master-index.md`;
    await writeOrUpdateFile(vault, filepath, lines.join('\n'));
}

/**
 * Ensure a folder exists in the vault, creating it if necessary
 */
async function ensureFolderExists(vault: Vault, folderPath: string): Promise<void> {
    const folder = vault.getAbstractFileByPath(folderPath);
    if (!folder) {
        await vault.createFolder(folderPath);
    }
}

/**
 * Write content to a file, creating it if it doesn't exist or updating if it does
 */
async function writeOrUpdateFile(vault: Vault, filepath: string, content: string): Promise<void> {
    const file = vault.getAbstractFileByPath(filepath);
    
    if (file instanceof TFile) {
        // File exists, update it
        await vault.modify(file, content);
    } else {
        // File doesn't exist, create it
        await vault.create(filepath, content);
    }
}

/**
 * Sanitize a filename by removing or replacing invalid characters
 */
function sanitizeFilename(name: string): string {
    return name
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
}

/**
 * Capitalize the first letter of a string
 */
function capitalize(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Truncate text to a maximum length, adding ellipsis if truncated
 */
function truncateText(text: string, maxLength: number): string {
    if (text.length <= maxLength) {
        return text;
    }
    return text.substring(0, maxLength - 3) + '...';
}
