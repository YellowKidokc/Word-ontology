import { Pool, PoolClient } from 'pg';
import { Notice } from 'obsidian';
import { MarkerNode } from './marker-parser';

/**
 * Enhanced Database Service with graph relationships and vector search
 */

export interface AtomicNode {
    uuid: string;
    content_text: string;
    node_type: string;
    source_file: string;
    source_vault?: string;
    line_start?: number;
    line_end?: number;
    char_offset_start?: number;
    char_offset_end?: number;
    embedding_vector?: number[];
    attributes: Record<string, any>;
    uses_sister_nomenclature: boolean;
    created_at: Date;
    updated_at: Date;
    version: number;
}

export interface SemanticEdge {
    id: string;
    source_node_id: string;
    target_node_id: string;
    relation_type: RelationType;
    weight: number;
    is_bidirectional: boolean;
    created_by: string;
    notes?: string;
}

export type RelationType =
    | 'SUPPORTS'
    | 'REFUTES'
    | 'CONTRADICTS'
    | 'IS_SPECIAL_CASE_OF'
    | 'TRANSLATES_TO'
    | 'EQUIVALENT_TO'
    | 'DEPENDS_ON'
    | 'IMPLIES'
    | 'SIMILAR_TO'
    | 'DERIVED_FROM'
    | 'EXEMPLIFIES';

export interface SisterLexiconEntry {
    id: string;
    legacy_word: string;
    sister_word: string;
    drift_percentage: number;
    definition_uuid?: string;
    context?: string;
    usage_notes?: string;
}

export interface TheoryEntry {
    id: string;
    theory_name: string;
    theory_number: number;
    author?: string;
    year?: number;
    summary?: string;
    source_file?: string;
    sister_school_congruency?: number;
}

export interface SimilarityResult {
    uuid: string;
    content_text: string;
    node_type: string;
    similarity: number;
}

export class DatabaseServiceEnhanced {
    private pool: Pool | null = null;
    private sisterLexicon: Map<string, SisterLexiconEntry> = new Map();

    constructor(connectionString: string) {
        this.updateConnection(connectionString);
    }

    updateConnection(connectionString: string) {
        if (this.pool) {
            this.pool.end();
        }

        this.pool = new Pool({
            connectionString,
            ssl: false,
            max: 10,
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 5000,
        });

        this.pool.on('error', (err) => {
            console.error('Database pool error:', err);
            new Notice('Database connection error');
        });
    }

    async testConnection(): Promise<boolean> {
        if (!this.pool) return false;

        try {
            const client = await this.pool.connect();
            await client.query('SELECT NOW()');
            client.release();
            return true;
        } catch (error) {
            console.error('Connection test failed:', error);
            return false;
        }
    }

    /**
     * Initialize enhanced schema from SQL file
     */
    async initializeEnhancedSchema(): Promise<void> {
        if (!this.pool) throw new Error('Database pool not initialized');

        // Note: In production, you'd load schema-enhanced.sql
        // For now, we'll assume it's already been run manually
        console.log('Enhanced schema should be initialized manually using schema-enhanced.sql');
        new Notice('Run schema-enhanced.sql on your PostgreSQL database');
    }

    /**
     * CRUD Operations for Atomic Nodes
     */

    async insertNode(marker: MarkerNode, filePath: string, embedding?: number[]): Promise<string> {
        if (!this.pool) throw new Error('Database pool not initialized');

        const client = await this.pool.connect();
        try {
            // Check if node with this UUID already exists (update case)
            if (marker.uuid) {
                const existing = await this.getNodeByUUID(marker.uuid);
                if (existing) {
                    return await this.updateNode(marker.uuid, marker, embedding);
                }
            }

            // Insert new node
            const result = await client.query(`
                INSERT INTO epistemic.atomic_nodes
                (content_text, node_type, source_file, attributes, embedding_vector,
                 uses_sister_nomenclature, char_offset_start, char_offset_end)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                RETURNING uuid
            `, [
                marker.content,
                marker.type,
                filePath,
                JSON.stringify(marker.attributes),
                embedding ? `[${embedding.join(',')}]` : null,
                false, // Will be updated after sister term check
                marker.startOffset,
                marker.endOffset
            ]);

            const uuid = result.rows[0].uuid;

            // Check for sister terms
            await this.checkAndMarkSisterTerms(uuid, marker.content);

            return uuid;
        } catch (error) {
            console.error('Failed to insert node:', error);
            throw error;
        } finally {
            client.release();
        }
    }

    async updateNode(uuid: string, marker: MarkerNode, embedding?: number[]): Promise<string> {
        if (!this.pool) throw new Error('Database pool not initialized');

        try {
            await this.pool.query(`
                UPDATE epistemic.atomic_nodes
                SET content_text = $1,
                    node_type = $2,
                    attributes = $3,
                    embedding_vector = $4,
                    char_offset_start = $5,
                    char_offset_end = $6
                WHERE uuid = $7
            `, [
                marker.content,
                marker.type,
                JSON.stringify(marker.attributes),
                embedding ? `[${embedding.join(',')}]` : null,
                marker.startOffset,
                marker.endOffset,
                uuid
            ]);

            // Re-check sister terms
            await this.checkAndMarkSisterTerms(uuid, marker.content);

            return uuid;
        } catch (error) {
            console.error('Failed to update node:', error);
            throw error;
        }
    }

    async getNodeByUUID(uuid: string): Promise<AtomicNode | null> {
        if (!this.pool) throw new Error('Database pool not initialized');

        try {
            const result = await this.pool.query(`
                SELECT * FROM epistemic.atomic_nodes WHERE uuid = $1
            `, [uuid]);

            if (result.rows.length === 0) return null;

            return this.parseNodeRow(result.rows[0]);
        } catch (error) {
            console.error('Failed to get node:', error);
            return null;
        }
    }

    async getNodesForFile(filePath: string): Promise<AtomicNode[]> {
        if (!this.pool) throw new Error('Database pool not initialized');

        try {
            const result = await this.pool.query(`
                SELECT * FROM epistemic.atomic_nodes
                WHERE source_file = $1
                ORDER BY char_offset_start
            `, [filePath]);

            return result.rows.map(row => this.parseNodeRow(row));
        } catch (error) {
            console.error('Failed to get nodes for file:', error);
            return [];
        }
    }

    /**
     * Semantic Edge Operations
     */

    async createEdge(
        sourceUUID: string,
        targetUUID: string,
        relationType: RelationType,
        weight: number = 1.0,
        notes?: string
    ): Promise<string> {
        if (!this.pool) throw new Error('Database pool not initialized');

        try {
            const result = await this.pool.query(`
                INSERT INTO epistemic.semantic_edges
                (source_node_id, target_node_id, relation_type, weight, notes)
                VALUES ($1, $2, $3, $4, $5)
                RETURNING id
            `, [sourceUUID, targetUUID, relationType, weight, notes || null]);

            return result.rows[0].id;
        } catch (error) {
            console.error('Failed to create edge:', error);
            throw error;
        }
    }

    async getEdgesForNode(uuid: string, direction: 'outgoing' | 'incoming' | 'both' = 'both'): Promise<SemanticEdge[]> {
        if (!this.pool) throw new Error('Database pool not initialized');

        let query = 'SELECT * FROM epistemic.semantic_edges WHERE ';

        if (direction === 'outgoing') {
            query += 'source_node_id = $1';
        } else if (direction === 'incoming') {
            query += 'target_node_id = $1';
        } else {
            query += '(source_node_id = $1 OR target_node_id = $1)';
        }

        try {
            const result = await this.pool.query(query, [uuid]);
            return result.rows;
        } catch (error) {
            console.error('Failed to get edges:', error);
            return [];
        }
    }

    /**
     * Sister Lexicon Operations
     */

    async loadSisterLexicon(): Promise<void> {
        if (!this.pool) throw new Error('Database pool not initialized');

        try {
            const result = await this.pool.query(`
                SELECT * FROM epistemic.sister_lexicon
            `);

            this.sisterLexicon.clear();
            for (const row of result.rows) {
                this.sisterLexicon.set(row.sister_word.toLowerCase(), row);
            }

            console.log(`Loaded ${this.sisterLexicon.size} sister lexicon entries`);
        } catch (error) {
            console.error('Failed to load sister lexicon:', error);
        }
    }

    getSisterLexicon(): Map<string, SisterLexiconEntry> {
        return this.sisterLexicon;
    }

    async addSisterTerm(
        legacyWord: string,
        sisterWord: string,
        driftPercentage: number,
        context?: string
    ): Promise<void> {
        if (!this.pool) throw new Error('Database pool not initialized');

        try {
            await this.pool.query(`
                INSERT INTO epistemic.sister_lexicon
                (legacy_word, sister_word, drift_percentage, context)
                VALUES ($1, $2, $3, $4)
                ON CONFLICT (legacy_word, sister_word) DO UPDATE
                SET drift_percentage = $3, context = $4
            `, [legacyWord, sisterWord, driftPercentage, context || null]);

            // Reload lexicon
            await this.loadSisterLexicon();
        } catch (error) {
            console.error('Failed to add sister term:', error);
            throw error;
        }
    }

    /**
     * Check content for sister terms and update node
     */
    private async checkAndMarkSisterTerms(uuid: string, content: string): Promise<void> {
        const words = content.toLowerCase().split(/\s+/);
        let hasSisterTerms = false;

        for (const word of words) {
            const cleaned = word.replace(/[^\w]/g, '');
            if (this.sisterLexicon.has(cleaned)) {
                hasSisterTerms = true;
                break;
            }
        }

        if (hasSisterTerms) {
            await this.pool?.query(`
                UPDATE epistemic.atomic_nodes
                SET uses_sister_nomenclature = TRUE
                WHERE uuid = $1
            `, [uuid]);
        }
    }

    /**
     * Query Operations
     */

    async findContradictions(nodeUUID: string): Promise<AtomicNode[]> {
        if (!this.pool) throw new Error('Database pool not initialized');

        try {
            const result = await this.pool.query(`
                SELECT n.*
                FROM epistemic.atomic_nodes n
                JOIN epistemic.semantic_edges e ON n.uuid = e.target_node_id
                WHERE e.source_node_id = $1
                AND e.relation_type IN ('REFUTES', 'CONTRADICTS')
                ORDER BY e.weight DESC
            `, [nodeUUID]);

            return result.rows.map(row => this.parseNodeRow(row));
        } catch (error) {
            console.error('Failed to find contradictions:', error);
            return [];
        }
    }

    async findSupport(nodeUUID: string): Promise<AtomicNode[]> {
        if (!this.pool) throw new Error('Database pool not initialized');

        try {
            const result = await this.pool.query(`
                SELECT n.*
                FROM epistemic.atomic_nodes n
                JOIN epistemic.semantic_edges e ON n.uuid = e.target_node_id
                WHERE e.source_node_id = $1
                AND e.relation_type = 'SUPPORTS'
                ORDER BY e.weight DESC
            `, [nodeUUID]);

            return result.rows.map(row => this.parseNodeRow(row));
        } catch (error) {
            console.error('Failed to find support:', error);
            return [];
        }
    }

    /**
     * Vector Similarity Search
     * Note: Requires embeddings to be generated (e.g., via OpenAI API)
     */
    async findSimilarNodes(
        queryEmbedding: number[],
        threshold: number = 0.8,
        limit: number = 10
    ): Promise<SimilarityResult[]> {
        if (!this.pool) throw new Error('Database pool not initialized');

        try {
            const result = await this.pool.query(`
                SELECT
                    uuid,
                    content_text,
                    node_type,
                    1 - (embedding_vector <=> $1::vector) AS similarity
                FROM epistemic.atomic_nodes
                WHERE embedding_vector IS NOT NULL
                AND 1 - (embedding_vector <=> $1::vector) >= $2
                ORDER BY embedding_vector <=> $1::vector
                LIMIT $3
            `, [`[${queryEmbedding.join(',')}]`, threshold, limit]);

            return result.rows;
        } catch (error) {
            console.error('Failed to find similar nodes:', error);
            return [];
        }
    }

    /**
     * Helper: Parse database row to AtomicNode
     */
    private parseNodeRow(row: any): AtomicNode {
        return {
            uuid: row.uuid,
            content_text: row.content_text,
            node_type: row.node_type,
            source_file: row.source_file,
            source_vault: row.source_vault,
            line_start: row.line_start,
            line_end: row.line_end,
            char_offset_start: row.char_offset_start,
            char_offset_end: row.char_offset_end,
            embedding_vector: row.embedding_vector,
            attributes: row.attributes || {},
            uses_sister_nomenclature: row.uses_sister_nomenclature,
            created_at: new Date(row.created_at),
            updated_at: new Date(row.updated_at),
            version: row.version
        };
    }

    async close(): Promise<void> {
        if (this.pool) {
            await this.pool.end();
            this.pool = null;
        }
    }
}
