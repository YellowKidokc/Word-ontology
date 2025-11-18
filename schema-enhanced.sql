-- Enhanced Database Schema for Epistemic Truth Engine
-- Supports marker-based syntax, UUID tracking, graph relationships, and vector search

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Enable vector extension for semantic similarity search
CREATE EXTENSION IF NOT EXISTS vector;

CREATE SCHEMA IF NOT EXISTS epistemic;

-- ============================================================================
-- TABLE A: Atomic_Nodes (The "Things")
-- Stores every snippet you highlight with its embeddings
-- ============================================================================
CREATE TABLE IF NOT EXISTS epistemic.atomic_nodes (
    uuid UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    content_text TEXT NOT NULL,
    node_type TEXT NOT NULL, -- 'Hypothesis', 'Evidence', 'Theory', 'Definition', 'Claim', etc.
    source_file TEXT NOT NULL, -- Path to Obsidian file
    source_vault TEXT,
    line_start INT,
    line_end INT,
    char_offset_start INT,
    char_offset_end INT,

    -- Vector embedding for semantic search (1536 dimensions for OpenAI ada-002)
    embedding_vector vector(1536),

    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by TEXT DEFAULT 'user',
    version INT DEFAULT 1, -- Track edits/refinements

    -- Custom attributes from marker syntax
    attributes JSONB DEFAULT '{}', -- Stores {Source: "Hawking", SisterTerm: "Void_Limit", etc.}

    -- Sister School tracking
    uses_sister_nomenclature BOOLEAN DEFAULT FALSE,

    CONSTRAINT valid_node_type CHECK (node_type IN (
        'Hypothesis', 'Evidence', 'Theory', 'Definition', 'Claim',
        'External_Theory', 'Sister_Definition', 'Observation', 'Axiom'
    ))
);

-- ============================================================================
-- TABLE B: Semantic_Edges (The "Logic")
-- Maps relationships between nodes (graph structure)
-- ============================================================================
CREATE TABLE IF NOT EXISTS epistemic.semantic_edges (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    source_node_id UUID NOT NULL REFERENCES epistemic.atomic_nodes(uuid) ON DELETE CASCADE,
    target_node_id UUID NOT NULL REFERENCES epistemic.atomic_nodes(uuid) ON DELETE CASCADE,

    -- Relationship type (the logical connection)
    relation_type TEXT NOT NULL,

    -- Congruency score (0.0 to 1.0)
    weight DECIMAL(3,2) DEFAULT 1.00 CHECK (weight >= 0.0 AND weight <= 1.0),

    -- Bidirectional flag
    is_bidirectional BOOLEAN DEFAULT FALSE,

    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    created_by TEXT DEFAULT 'user', -- or 'ai' if auto-detected
    notes TEXT,

    -- Prevent duplicate edges
    UNIQUE(source_node_id, target_node_id, relation_type),

    CONSTRAINT valid_relation_type CHECK (relation_type IN (
        'SUPPORTS', 'REFUTES', 'CONTRADICTS', 'IS_SPECIAL_CASE_OF',
        'TRANSLATES_TO', 'EQUIVALENT_TO', 'DEPENDS_ON', 'IMPLIES',
        'SIMILAR_TO', 'DERIVED_FROM', 'EXEMPLIFIES'
    ))
);

-- ============================================================================
-- TABLE C: Sister_Lexicon (The "Translation Layer")
-- Handles word drift between legacy terminology and new nomenclature
-- ============================================================================
CREATE TABLE IF NOT EXISTS epistemic.sister_lexicon (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    legacy_word TEXT NOT NULL,
    sister_word TEXT NOT NULL, -- Your new term
    drift_percentage DECIMAL(5,2) CHECK (drift_percentage >= 0 AND drift_percentage <= 100),

    -- Link to definition node
    definition_uuid UUID REFERENCES epistemic.atomic_nodes(uuid),

    -- Context and notes
    context TEXT,
    usage_notes TEXT,

    -- Embedding for the sister word
    sister_embedding vector(1536),

    created_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(legacy_word, sister_word)
);

-- ============================================================================
-- TABLE D: Theory_Registry (The 70 Theories)
-- Central registry of the 70 external theories you're comparing against
-- ============================================================================
CREATE TABLE IF NOT EXISTS epistemic.theory_registry (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    theory_name TEXT NOT NULL UNIQUE,
    theory_number INT UNIQUE, -- 1 to 70
    author TEXT,
    year INT,
    summary TEXT,
    source_file TEXT, -- Where you keep notes on this theory in Obsidian

    -- Central embedding for the entire theory
    theory_embedding vector(1536),

    -- Congruency with Sister School
    sister_school_congruency DECIMAL(5,2), -- 0-100%

    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- TABLE E: Query_History (Track {{QUERY}} executions)
-- Stores queries you've run for reproducibility
-- ============================================================================
CREATE TABLE IF NOT EXISTS epistemic.query_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    query_text TEXT NOT NULL,
    query_type TEXT, -- 'CONTRADICTION', 'SUPPORT', 'SIMILARITY', etc.
    executed_at TIMESTAMPTZ DEFAULT NOW(),
    executed_in_file TEXT,
    result_count INT,
    results JSONB -- Store the actual results
);

-- ============================================================================
-- INDEXES for Performance
-- ============================================================================

-- Atomic Nodes indexes
CREATE INDEX IF NOT EXISTS idx_atomic_nodes_type ON epistemic.atomic_nodes(node_type);
CREATE INDEX IF NOT EXISTS idx_atomic_nodes_file ON epistemic.atomic_nodes(source_file);
CREATE INDEX IF NOT EXISTS idx_atomic_nodes_created ON epistemic.atomic_nodes(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_atomic_nodes_sister ON epistemic.atomic_nodes(uses_sister_nomenclature) WHERE uses_sister_nomenclature = TRUE;

-- Vector similarity search index (using HNSW algorithm)
CREATE INDEX IF NOT EXISTS idx_atomic_nodes_embedding ON epistemic.atomic_nodes
USING hnsw (embedding_vector vector_cosine_ops);

CREATE INDEX IF NOT EXISTS idx_sister_lexicon_embedding ON epistemic.sister_lexicon
USING hnsw (sister_embedding vector_cosine_ops);

CREATE INDEX IF NOT EXISTS idx_theory_registry_embedding ON epistemic.theory_registry
USING hnsw (theory_embedding vector_cosine_ops);

-- Semantic Edges indexes
CREATE INDEX IF NOT EXISTS idx_semantic_edges_source ON epistemic.semantic_edges(source_node_id);
CREATE INDEX IF NOT EXISTS idx_semantic_edges_target ON epistemic.semantic_edges(target_node_id);
CREATE INDEX IF NOT EXISTS idx_semantic_edges_type ON epistemic.semantic_edges(relation_type);
CREATE INDEX IF NOT EXISTS idx_semantic_edges_weight ON epistemic.semantic_edges(weight DESC);

-- Sister Lexicon indexes
CREATE INDEX IF NOT EXISTS idx_sister_lexicon_legacy ON epistemic.sister_lexicon(legacy_word);
CREATE INDEX IF NOT EXISTS idx_sister_lexicon_sister ON epistemic.sister_lexicon(sister_word);

-- Theory Registry indexes
CREATE INDEX IF NOT EXISTS idx_theory_registry_number ON epistemic.theory_registry(theory_number);

-- ============================================================================
-- VIEWS for Common Queries
-- ============================================================================

-- View: All relationships for a node
CREATE OR REPLACE VIEW epistemic.node_relationships AS
SELECT
    n1.uuid AS source_uuid,
    n1.content_text AS source_content,
    n1.node_type AS source_type,
    e.relation_type,
    e.weight,
    n2.uuid AS target_uuid,
    n2.content_text AS target_content,
    n2.node_type AS target_type
FROM epistemic.semantic_edges e
JOIN epistemic.atomic_nodes n1 ON e.source_node_id = n1.uuid
JOIN epistemic.atomic_nodes n2 ON e.target_node_id = n2.uuid;

-- View: Sister School translations in use
CREATE OR REPLACE VIEW epistemic.active_translations AS
SELECT
    n.uuid,
    n.content_text,
    n.source_file,
    sl.legacy_word,
    sl.sister_word,
    sl.drift_percentage
FROM epistemic.atomic_nodes n
JOIN epistemic.sister_lexicon sl ON n.attributes ? sl.sister_word
WHERE n.uses_sister_nomenclature = TRUE;

-- ============================================================================
-- FUNCTIONS for Common Operations
-- ============================================================================

-- Function: Find similar nodes using vector search
CREATE OR REPLACE FUNCTION epistemic.find_similar_nodes(
    query_embedding vector(1536),
    similarity_threshold DECIMAL DEFAULT 0.8,
    max_results INT DEFAULT 10
)
RETURNS TABLE (
    uuid UUID,
    content_text TEXT,
    node_type TEXT,
    similarity DECIMAL
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        n.uuid,
        n.content_text,
        n.node_type,
        (1 - (n.embedding_vector <=> query_embedding))::DECIMAL(5,4) AS similarity
    FROM epistemic.atomic_nodes n
    WHERE n.embedding_vector IS NOT NULL
        AND (1 - (n.embedding_vector <=> query_embedding)) >= similarity_threshold
    ORDER BY n.embedding_vector <=> query_embedding
    LIMIT max_results;
END;
$$ LANGUAGE plpgsql;

-- Function: Find contradictions to a node
CREATE OR REPLACE FUNCTION epistemic.find_contradictions(node_uuid UUID)
RETURNS TABLE (
    contradicting_uuid UUID,
    content TEXT,
    relation_weight DECIMAL
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        n.uuid,
        n.content_text,
        e.weight
    FROM epistemic.semantic_edges e
    JOIN epistemic.atomic_nodes n ON e.target_node_id = n.uuid
    WHERE e.source_node_id = node_uuid
        AND e.relation_type IN ('REFUTES', 'CONTRADICTS')
    ORDER BY e.weight DESC;
END;
$$ LANGUAGE plpgsql;

-- Function: Update timestamp on node modification
CREATE OR REPLACE FUNCTION epistemic.update_modified_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    NEW.version = OLD.version + 1;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger: Auto-update timestamps
CREATE TRIGGER update_atomic_nodes_timestamp
    BEFORE UPDATE ON epistemic.atomic_nodes
    FOR EACH ROW
    EXECUTE FUNCTION epistemic.update_modified_timestamp();

-- ============================================================================
-- SEED DATA: Relation Types Documentation
-- ============================================================================

-- Create a documentation table for relation types
CREATE TABLE IF NOT EXISTS epistemic.relation_type_docs (
    relation_type TEXT PRIMARY KEY,
    description TEXT,
    example TEXT,
    is_symmetric BOOLEAN DEFAULT FALSE
);

INSERT INTO epistemic.relation_type_docs VALUES
('SUPPORTS', 'Source provides evidence/justification for target', 'Observation SUPPORTS Hypothesis', FALSE),
('REFUTES', 'Source contradicts or disproves target', 'Experiment REFUTES Theory', FALSE),
('CONTRADICTS', 'Source logically conflicts with target', 'Claim A CONTRADICTS Claim B', TRUE),
('IS_SPECIAL_CASE_OF', 'Source is a specific instance of target', 'Newtonian Mechanics IS_SPECIAL_CASE_OF Relativity', FALSE),
('TRANSLATES_TO', 'Source in legacy terminology equals target in sister terminology', '"Wave Function" TRANSLATES_TO "Void_Oscillation"', FALSE),
('EQUIVALENT_TO', 'Source and target express the same concept', 'Definition A EQUIVALENT_TO Definition B', TRUE),
('DEPENDS_ON', 'Source requires target to be true/valid', 'Theorem DEPENDS_ON Axiom', FALSE),
('IMPLIES', 'Source logically leads to target', 'Premise IMPLIES Conclusion', FALSE),
('SIMILAR_TO', 'Source shares semantic similarity with target', 'Concept A SIMILAR_TO Concept B', TRUE),
('DERIVED_FROM', 'Source was obtained/calculated from target', 'Result DERIVED_FROM Equation', FALSE),
('EXEMPLIFIES', 'Source provides concrete example of target', 'Case Study EXEMPLIFIES Theory', FALSE)
ON CONFLICT (relation_type) DO NOTHING;

-- ============================================================================
-- Comments for Documentation
-- ============================================================================

COMMENT ON TABLE epistemic.atomic_nodes IS 'Core storage for all marked snippets from Obsidian. Each node represents a discrete piece of knowledge with vector embeddings for semantic search.';
COMMENT ON TABLE epistemic.semantic_edges IS 'Graph edges connecting nodes with typed relationships. Enables tracking logical dependencies, contradictions, and congruencies.';
COMMENT ON TABLE epistemic.sister_lexicon IS 'Translation layer between legacy scientific terminology and Sister School nomenclature. Tracks word drift percentages.';
COMMENT ON TABLE epistemic.theory_registry IS 'Central registry of the 70 external theories being compared against the Sister School hypothesis.';

COMMENT ON COLUMN epistemic.atomic_nodes.embedding_vector IS 'Vector embedding (1536-dim) for semantic similarity search. Generated by OpenAI ada-002 or similar.';
COMMENT ON COLUMN epistemic.semantic_edges.weight IS 'Congruency score from 0.0 to 1.0. Represents strength of the relationship.';
COMMENT ON COLUMN epistemic.sister_lexicon.drift_percentage IS 'How much the meaning has drifted from legacy term (0-100%). 90% = mostly same, 10% = very different.';
