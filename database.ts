import { Pool, PoolClient } from 'pg';
import { EpistemicClassification, DatabaseClassification } from './types';
import { Notice } from 'obsidian';

/**
 * Database service for PostgreSQL operations
 */
export class DatabaseService {
    private pool: Pool | null = null;
    private connectionString: string = '';

    constructor(connectionString: string) {
        this.updateConnection(connectionString);
    }

    updateConnection(connectionString: string) {
        if (this.pool) {
            this.pool.end();
        }
        this.connectionString = connectionString;
        this.pool = new Pool({
            connectionString,
            ssl: false,
            max: 10,
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 5000,
        });

        // Handle pool errors
        this.pool.on('error', (err) => {
            console.error('Unexpected database pool error:', err);
            new Notice('Database connection error. Check console for details.');
        });
    }

    async testConnection(): Promise<boolean> {
        if (!this.pool) {
            return false;
        }

        try {
            const client = await this.pool.connect();
            await client.query('SELECT NOW()');
            client.release();
            return true;
        } catch (error) {
            console.error('Database connection test failed:', error);
            return false;
        }
    }

    async initializeSchema(): Promise<void> {
        if (!this.pool) {
            throw new Error('Database pool not initialized');
        }

        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');

            // Create schema
            await client.query('CREATE SCHEMA IF NOT EXISTS epistemic');

            // Create statements table
            await client.query(`
                CREATE TABLE IF NOT EXISTS epistemic.statements (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    content TEXT NOT NULL,
                    source_file TEXT NOT NULL,
                    source_vault TEXT,
                    start_offset INT,
                    end_offset INT,
                    line_start INT,
                    line_end INT,
                    bundle_profile TEXT DEFAULT 'personal',
                    created_at TIMESTAMPTZ DEFAULT NOW(),
                    updated_at TIMESTAMPTZ DEFAULT NOW(),
                    metadata JSONB
                )
            `);

            // Create types table
            await client.query(`
                CREATE TABLE IF NOT EXISTS epistemic.types (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    name TEXT NOT NULL,
                    bundle_profile TEXT NOT NULL,
                    description TEXT,
                    color TEXT,
                    icon TEXT,
                    priority INT,
                    UNIQUE(name, bundle_profile)
                )
            `);

            // Create statement_types table
            await client.query(`
                CREATE TABLE IF NOT EXISTS epistemic.statement_types (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    statement_id UUID REFERENCES epistemic.statements(id) ON DELETE CASCADE,
                    type_id UUID REFERENCES epistemic.types(id),
                    confidence DECIMAL(3,2) DEFAULT 1.00,
                    tagged_by TEXT,
                    tagged_at TIMESTAMPTZ DEFAULT NOW(),
                    notes TEXT
                )
            `);

            // Create indexes
            await client.query(`
                CREATE INDEX IF NOT EXISTS idx_statements_file
                ON epistemic.statements(source_file)
            `);
            await client.query(`
                CREATE INDEX IF NOT EXISTS idx_statements_profile
                ON epistemic.statements(bundle_profile)
            `);
            await client.query(`
                CREATE INDEX IF NOT EXISTS idx_types_profile
                ON epistemic.types(bundle_profile)
            `);

            await client.query('COMMIT');
            console.log('Database schema initialized successfully');
        } catch (error) {
            await client.query('ROLLBACK');
            console.error('Failed to initialize schema:', error);
            throw error;
        } finally {
            client.release();
        }
    }

    async seedTypes(): Promise<void> {
        if (!this.pool) {
            throw new Error('Database pool not initialized');
        }

        const client = await this.pool.connect();
        try {
            // Seed Personal Research types
            await client.query(`
                INSERT INTO epistemic.types (name, bundle_profile, description, color, icon, priority) VALUES
                ('axiom', 'personal', 'Foundational assumption or first principle', '#FF6B6B', '⚛', 1),
                ('canonical', 'personal', 'Established core claim', '#4ECDC4', '◆', 2),
                ('evidence', 'personal', 'Supporting data or observation', '#95E1D3', '●', 3),
                ('coherence', 'personal', 'Derived logical relationship', '#F38181', '⟷', 4),
                ('reference', 'personal', 'External citation or authority', '#AA96DA', '◈', 5)
                ON CONFLICT (name, bundle_profile) DO NOTHING
            `);

            // Seed YouTube types
            await client.query(`
                INSERT INTO epistemic.types (name, bundle_profile, description, color, icon, priority) VALUES
                ('key_point', 'youtube', 'Main takeaway or thesis', '#FF6B6B', '★', 1),
                ('evidence', 'youtube', 'Supporting example or data', '#4ECDC4', '●', 2),
                ('story', 'youtube', 'Narrative or anecdote', '#95E1D3', '◐', 3),
                ('cta', 'youtube', 'Call to action', '#F38181', '▶', 4)
                ON CONFLICT (name, bundle_profile) DO NOTHING
            `);

            // Seed AI Training types
            await client.query(`
                INSERT INTO epistemic.types (name, bundle_profile, description, color, icon, priority) VALUES
                ('ground_truth', 'ai_training', 'Verified factual claim', '#00D9FF', '✓', 1),
                ('ambiguous', 'ai_training', 'Unclear or needs context', '#FFB84D', '?', 2),
                ('contradictory', 'ai_training', 'Conflicts with other claims', '#FF4D4D', '✗', 3),
                ('high_confidence', 'ai_training', 'Strong supporting evidence', '#4DFF88', '◉', 4)
                ON CONFLICT (name, bundle_profile) DO NOTHING
            `);

            console.log('Database types seeded successfully');
        } catch (error) {
            console.error('Failed to seed types:', error);
            throw error;
        } finally {
            client.release();
        }
    }

    async saveClassification(classification: EpistemicClassification): Promise<string> {
        if (!this.pool) {
            throw new Error('Database pool not initialized');
        }

        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');

            // Insert statement
            const stmtResult = await client.query(`
                INSERT INTO epistemic.statements
                (content, source_file, source_vault, start_offset, end_offset,
                 line_start, line_end, bundle_profile, metadata)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                RETURNING id
            `, [
                classification.content,
                classification.sourceFile,
                classification.sourceVault || null,
                classification.startOffset,
                classification.endOffset,
                classification.lineStart || null,
                classification.lineEnd || null,
                classification.profile,
                JSON.stringify({})
            ]);

            const statementId = stmtResult.rows[0].id;

            // Get type ID
            const typeResult = await client.query(`
                SELECT id FROM epistemic.types
                WHERE name = $1 AND bundle_profile = $2
            `, [classification.type, classification.profile]);

            if (typeResult.rows.length === 0) {
                throw new Error(`Type '${classification.type}' not found for profile '${classification.profile}'`);
            }

            const typeId = typeResult.rows[0].id;

            // Link statement to type
            await client.query(`
                INSERT INTO epistemic.statement_types
                (statement_id, type_id, confidence, tagged_by, notes)
                VALUES ($1, $2, $3, $4, $5)
            `, [
                statementId,
                typeId,
                classification.confidence,
                classification.taggedBy,
                classification.notes || null
            ]);

            await client.query('COMMIT');
            return statementId;
        } catch (error) {
            await client.query('ROLLBACK');
            console.error('Failed to save classification:', error);
            throw error;
        } finally {
            client.release();
        }
    }

    async getClassificationsForFile(
        filePath: string,
        profile: string
    ): Promise<DatabaseClassification[]> {
        if (!this.pool) {
            throw new Error('Database pool not initialized');
        }

        try {
            const result = await this.pool.query(`
                SELECT
                    s.id, s.content, s.start_offset, s.end_offset,
                    s.source_file, s.bundle_profile,
                    t.name as type, t.color, t.icon,
                    st.confidence, st.tagged_by, st.tagged_at, st.notes
                FROM epistemic.statements s
                JOIN epistemic.statement_types st ON s.id = st.statement_id
                JOIN epistemic.types t ON st.type_id = t.id
                WHERE s.source_file = $1 AND s.bundle_profile = $2
                ORDER BY s.start_offset
            `, [filePath, profile]);

            return result.rows;
        } catch (error) {
            console.error('Failed to get classifications:', error);
            throw error;
        }
    }

    async getAllClassifications(): Promise<DatabaseClassification[]> {
        if (!this.pool) {
            throw new Error('Database pool not initialized');
        }

        try {
            const result = await this.pool.query(`
                SELECT
                    s.id, s.content, s.start_offset, s.end_offset,
                    s.source_file, s.bundle_profile,
                    t.name as type, t.color, t.icon,
                    st.confidence, st.tagged_by, st.tagged_at, st.notes
                FROM epistemic.statements s
                JOIN epistemic.statement_types st ON s.id = st.statement_id
                JOIN epistemic.types t ON st.type_id = t.id
                ORDER BY s.source_file, s.start_offset
            `);

            return result.rows;
        } catch (error) {
            console.error('Failed to get all classifications:', error);
            throw error;
        }
    }

    async deleteClassification(classificationId: string): Promise<void> {
        if (!this.pool) {
            throw new Error('Database pool not initialized');
        }

        try {
            await this.pool.query(`
                DELETE FROM epistemic.statements
                WHERE id = $1
            `, [classificationId]);
        } catch (error) {
            console.error('Failed to delete classification:', error);
            throw error;
        }
    }

    async getAllClassifications(profile: string): Promise<DatabaseClassification[]> {
        if (!this.pool) {
            throw new Error('Database pool not initialized');
        }

        try {
            const result = await this.pool.query(`
                SELECT
                    s.id, s.content, s.source_file, s.start_offset, s.end_offset,
                    t.name as type, t.color, t.icon,
                    st.confidence, st.tagged_by, st.tagged_at, st.notes
                FROM epistemic.statements s
                JOIN epistemic.statement_types st ON s.id = st.statement_id
                JOIN epistemic.types t ON st.type_id = t.id
                WHERE s.bundle_profile = $1
                ORDER BY s.created_at DESC
            `, [profile]);

            return result.rows;
        } catch (error) {
            console.error('Failed to get all classifications:', error);
            throw error;
        }
    }

    async close(): Promise<void> {
        if (this.pool) {
            await this.pool.end();
            this.pool = null;
        }
    }
}
