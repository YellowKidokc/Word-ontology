# Epistemic Truth Engine - Complete Architecture

## Overview

This document provides the **complete blueprint** for building a bidirectional Obsidian ↔ PostgreSQL system that functions as a "Truth Engine" for epistemic knowledge management.

### Core Concept

Instead of GUI-based highlighting, this system uses **marker-based syntax** embedded directly in Markdown files. These markers are parsed, synced to PostgreSQL with UUID tracking, and can be queried using natural language commands that inject results back into your notes.

---

## 1. The Syntax (The Interface)

### Simplified Shortcode Format

All epistemic annotations use **configurable shortcodes** for speed and simplicity:

```markdown
:::SHORTCODE content :::
```

### Default Shortcode Mappings

These shortcodes are **user-configurable** in plugin settings:

| Shortcode | Type | Description |
|-----------|------|-------------|
| `H` | Hypothesis | Testable hypothesis |
| `E` | Evidence | Supporting evidence/data |
| `T` | Theory | Theoretical framework |
| `D` | Definition | Concept definition |
| `C` | Claim | Factual claim |
| `O` | Observation | Empirical observation |
| `A` | Axiom | Foundational assumption |
| `LW` | Legacy_Word | Legacy terminology |
| `SW` | Sister_Word | Sister School term |
| `DP` | Drift_Percentage | Semantic drift % |
| `XT` | External_Theory | Reference to 1 of 70 theories |

**You can define ANY shortcode you want** in the plugin settings. The system is completely flexible.

### Examples (Before Save)

```markdown
:::H Time is emergent from quantum decoherence :::

:::E CMB data shows unexpected patterns at large scales :::

:::C The universe is expanding :::

:::LW Wave Function -> SW Void Oscillation (DP:90%) :::

:::XT Bohm's Implicate Order (#42) shows similar collapse mechanism :::
```

### After First Save (UUID Injection)

After the plugin saves the node to PostgreSQL, it **rewrites the marker** with the UUID in angle brackets:

```markdown
:::H<550e8400-e29b-41d4-a716-446655440000> Time is emergent from quantum decoherence :::
```

**Why UUID injection?** The UUID creates a **permanent link** between your Markdown file and the database record. When you edit the text, the system updates the existing node instead of creating duplicates.

### Special Syntax: Sister School Lexicon

For word translation entries, use this pattern:

```markdown
:::LW legacy term -> SW sister term (DP:percentage%) :::
```

**Example:**
```markdown
:::LW Wave Function -> SW Void Oscillation (DP:90%) :::
```

This automatically creates entries in both `atomic_nodes` AND `sister_lexicon` tables.

---

## 2. Database Schema (The Relational Graph)

### Table A: `atomic_nodes` (The "Things")

Stores every marked snippet with vector embeddings for semantic search.

```sql
CREATE TABLE epistemic.atomic_nodes (
    uuid UUID PRIMARY KEY,
    content_text TEXT NOT NULL,
    node_type TEXT NOT NULL, -- 'Hypothesis', 'Evidence', 'Claim', etc.
    source_file TEXT NOT NULL,

    -- Position tracking
    char_offset_start INT,
    char_offset_end INT,

    -- Vector embedding (1536-dim for OpenAI ada-002)
    embedding_vector vector(1536),

    -- Metadata
    attributes JSONB DEFAULT '{}',
    uses_sister_nomenclature BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    version INT DEFAULT 1
);
```

**Key Fields:**
- `embedding_vector`: Enables semantic similarity search across 70 theories
- `attributes`: Stores custom key-value pairs from marker syntax
- `version`: Tracks how many times the content has been refined

### Table B: `semantic_edges` (The "Logic")

Maps **relationships** between nodes (the graph structure).

```sql
CREATE TABLE epistemic.semantic_edges (
    id UUID PRIMARY KEY,
    source_node_id UUID REFERENCES atomic_nodes(uuid),
    target_node_id UUID REFERENCES atomic_nodes(uuid),

    relation_type TEXT NOT NULL,  -- 'SUPPORTS', 'REFUTES', 'TRANSLATES_TO', etc.
    weight DECIMAL(3,2) DEFAULT 1.00,  -- Congruency score (0.0 to 1.0)

    is_bidirectional BOOLEAN DEFAULT FALSE,
    created_by TEXT DEFAULT 'user',  -- or 'ai' if auto-detected
    notes TEXT
);
```

**Relation Types:**
- `SUPPORTS`: Source provides evidence for target
- `REFUTES`: Source contradicts target
- `CONTRADICTS`: Logical conflict (bidirectional)
- `IS_SPECIAL_CASE_OF`: Source is specific instance of target
- `TRANSLATES_TO`: Legacy term → Sister School term
- `EQUIVALENT_TO`: Same concept, different words
- `DEPENDS_ON`: Source requires target to be true
- `IMPLIES`: Source logically leads to target
- `SIMILAR_TO`: Semantic similarity (from vector search)
- `DERIVED_FROM`: Source calculated/obtained from target
- `EXEMPLIFIES`: Source is concrete example of target

### Table C: `sister_lexicon` (The "Translation Layer")

Handles word drift between legacy scientific terms and Sister School nomenclature.

```sql
CREATE TABLE epistemic.sister_lexicon (
    id UUID PRIMARY KEY,
    legacy_word TEXT NOT NULL,
    sister_word TEXT NOT NULL,
    drift_percentage DECIMAL(5,2),  -- 0-100% how much meaning has drifted

    definition_uuid UUID REFERENCES atomic_nodes(uuid),
    context TEXT,
    usage_notes TEXT,

    sister_embedding vector(1536),

    UNIQUE(legacy_word, sister_word)
);
```

**Example Entries:**
```sql
INSERT INTO sister_lexicon VALUES
('Wave Function', 'Void_Oscillation', 90.0, <def_uuid>, 'QM context'),
('Quantum Entanglement', 'Phase_Coherence_Lock', 85.0, <def_uuid>, 'Non-local correlations'),
('Dark Energy', 'Void_Pressure', 70.0, <def_uuid>, 'Cosmological acceleration');
```

### Table D: `theory_registry` (The 70 Theories)

Central registry of external theories you're comparing against.

```sql
CREATE TABLE epistemic.theory_registry (
    id UUID PRIMARY KEY,
    theory_name TEXT NOT NULL UNIQUE,
    theory_number INT UNIQUE,  -- 1 to 70
    author TEXT,
    year INT,
    summary TEXT,
    source_file TEXT,

    theory_embedding vector(1536),  -- Average embedding of all theory nodes
    sister_school_congruency DECIMAL(5,2)  -- 0-100% match with your hypothesis
);
```

---

## 3. The "Give and Take" Logic (Bidirectional Sync)

### Scenario 1: Ingestion (Obsidian → PostgreSQL)

**Trigger:** User saves a Markdown file containing markers.

**Workflow:**

```typescript
1. Plugin scans file for markers using regex:
   /:::\s*\[([^\]]+)\]\s*\{([^}]*)\}\s+((?:(?!:::).)*)\s*:::/gs

2. For each marker:
   a. Parse type, attributes, and content
   b. Check if UUID exists in attributes

   c. If NO UUID:
      - INSERT INTO atomic_nodes (content_text, node_type, ...)
      - Capture returned UUID
      - Rewrite marker in file with UUID injected
      - Mark file as modified

   d. If UUID EXISTS:
      - UPDATE atomic_nodes SET content_text = ..., version = version + 1
        WHERE uuid = <uuid>
      - No file modification needed

   e. Check content for Sister School terms:
      - Scan words against sister_lexicon table
      - If found, SET uses_sister_nomenclature = TRUE

3. Save modified file back to Obsidian vault
```

**Example:**

**Before save:**
```markdown
::: [Hypothesis] {Confidence:0.9} Time is emergent from quantum decoherence. :::
```

**After save:**
```markdown
::: [Hypothesis] {ID:a1b2c3d4-..., Confidence:0.9} Time is emergent from quantum decoherence. :::
```

### Scenario 2: Query Execution (PostgreSQL → Obsidian)

**Trigger:** User types a query command in their note.

**Syntax:**
```markdown
{{QUERY: Show contradictions to this paragraph}}

{{QUERY: Find similar theories to the above claim}}

{{QUERY: List all Sister School translations for "wave function"}}
```

**Workflow:**

```typescript
1. Plugin detects {{QUERY: ...}} pattern on file save/manual trigger

2. Parse query type (CONTRADICTION, SIMILARITY, TRANSLATION, etc.)

3. Execute database query:
   - For CONTRADICTION: Find nodes with REFUTES/CONTRADICTS edges
   - For SIMILARITY: Use vector search with pgvector
   - For TRANSLATION: Lookup sister_lexicon table

4. Format results as Obsidian callout:
   > [!info] Query Results (CONTRADICTION)
   > **Query:** Show contradictions to this paragraph
   > **Executed:** 2024-11-15 12:34:56
   > **Results:** 3
   >
   > 1. [Claim] "Time is fundamental, not emergent" (Source: Lee Smolin, 2019)
   >    *Congruency: 15%*
   > 2. [Evidence] "CMB data suggests time existed before BB" (Source: Penrose)
   >    *Congruency: 30%*
   > 3. [Theory] "Loop Quantum Gravity requires fundamental time"
   >    *Congruency: 25%*

5. Inject callout BELOW the {{QUERY}} command in the file

6. Optionally replace {{QUERY}} with {{RESULT_CACHED: <timestamp>}}
   to prevent re-execution on every save
```

---

## 4. The Secret Weapon: pgvector (Semantic Search)

### Why Vector Embeddings?

You cannot manually tag every connection between your hypothesis and 70 theories. **Vector embeddings** turn text into numbers, enabling:

- **Automatic similarity detection** between paragraphs across different theories
- **"This sentence in Theory #42 is 98% semantically similar to your claim"**
- **Contradiction detection** based on meaning, not just keywords

### Setup

1. **Enable pgvector extension:**
   ```sql
   CREATE EXTENSION vector;
   ```

2. **Generate embeddings** using OpenAI API or local model:
   ```typescript
   async function generateEmbedding(text: string): Promise<number[]> {
       const response = await fetch('https://api.openai.com/v1/embeddings', {
           method: 'POST',
           headers: {
               'Authorization': `Bearer ${OPENAI_API_KEY}`,
               'Content-Type': 'application/json'
           },
           body: JSON.stringify({
               input: text,
               model: 'text-embedding-ada-002'
           })
       });

       const data = await response.json();
       return data.data[0].embedding; // 1536-dimensional vector
   }
   ```

3. **Store in database:**
   ```sql
   UPDATE atomic_nodes
   SET embedding_vector = '[0.123, -0.456, ...]'::vector
   WHERE uuid = <uuid>;
   ```

4. **Query for similar nodes:**
   ```sql
   SELECT
       uuid,
       content_text,
       node_type,
       1 - (embedding_vector <=> $1::vector) AS similarity
   FROM atomic_nodes
   WHERE embedding_vector IS NOT NULL
   ORDER BY embedding_vector <=> $1::vector
   LIMIT 10;
   ```

### Automatic Congruency Scoring

When you mark a paragraph as `[Hypothesis]`, the system:

1. Generates embedding for the paragraph
2. Finds all nodes from "Theory #1" through "Theory #70"
3. Calculates cosine similarity
4. Creates `SIMILAR_TO` edges with weight = similarity score
5. **You now see which theories align with your hypothesis (mathematically)**

---

## 5. Implementation Checklist

### Phase 1: Core Marker System ✅

- [x] Regex parser for `::: [Type] {Attr} content :::`
- [x] UUID injection back to Markdown files
- [x] Insert/Update logic (CRUD for atomic_nodes)
- [x] Attribute parsing and JSONB storage

### Phase 2: Graph Relationships

- [ ] Create `semantic_edges` on explicit user commands
- [ ] Auto-detect relationships using NLP/AI
- [ ] Visualize graph (optional: use Obsidian Graph View plugin)

### Phase 3: Sister School Integration ✅

- [x] `sister_lexicon` table and CRUD operations
- [x] Automatic word drift detection during ingestion
- [ ] Translation suggestions in UI
- [ ] Bulk term replacement tool

### Phase 4: Vector Search 🔄

- [ ] OpenAI API integration for embeddings
- [ ] Batch embedding generation for existing nodes
- [ ] Similarity threshold tuning (0.8 = good default)
- [ ] Automatic `SIMILAR_TO` edge creation

### Phase 5: Query System

- [ ] `{{QUERY: ...}}` regex detection
- [ ] Query type inference (CONTRADICTION, SUPPORT, SIMILARITY, etc.)
- [ ] Result formatting as Obsidian callouts
- [ ] Result injection back to file
- [ ] Query history tracking

### Phase 6: Theory Registry

- [ ] Populate `theory_registry` with 70 theories
- [ ] Generate theory_embedding for each
- [ ] Calculate sister_school_congruency scores
- [ ] Dashboard view of congruency rankings

---

## 6. File Interaction Patterns

### Pattern A: New Annotation

**User Action:**
```markdown
I'm writing a note about quantum mechanics...

:::C Nobody understands quantum mechanics :::
```

**Plugin Action:**
1. Detects new marker with shortcode `C` (no UUID)
2. Looks up `C` → `Claim` in shortcode settings
3. Inserts to DB → gets UUID `abc-123`
4. Rewrites file:
   ```markdown
   :::C<abc-123> Nobody understands quantum mechanics :::
   ```

### Pattern B: Edit Existing Annotation

**User Action:**
```markdown
:::C<abc-123> Nobody *fully* understands quantum mechanics :::
```

**Plugin Action:**
1. Detects UUID `abc-123`
2. UPDATEs existing row in DB
3. Increments version number
4. No file modification needed

### Pattern C: Query for Contradictions

**User Action:**
```markdown
:::H<xyz-789> Consciousness collapses the wave function :::

{{QUERY: Show contradictions to the above hypothesis}}
```

**Plugin Action:**
1. Finds nearest marker above query
2. Gets UUID `xyz-789`
3. Queries DB for edges:
   ```sql
   SELECT target_node
   FROM semantic_edges
   WHERE source_node_id = 'xyz-789'
   AND relation_type IN ('REFUTES', 'CONTRADICTS')
   ```
4. Formats results
5. Injects callout below `{{QUERY}}`

---

## 7. Advanced Features

### A. AI-Powered Relationship Detection

When you create a new `[Claim]`, the system can:

1. Generate embedding
2. Find top 10 most similar nodes
3. Send pairs to Claude API:
   ```
   "Does Claim A support, refute, or have no relation to Claim B?"
   ```
4. Auto-create edges based on AI response
5. User reviews and approves/rejects

### B. Sister School Drift Analysis

The system can analyze:

- Which legacy terms you use most frequently
- Suggested Sister School replacements
- Drift percentage trends over time
- Consistency score across your notes

### C. Theory Congruency Dashboard

A generated note showing:

```markdown
# Sister School vs 70 Theories - Congruency Report

## Top Matches
1. **Bohm's Implicate Order** (92% congruency)
   - 47 SIMILAR_TO edges
   - 3 EQUIVALENT_TO concepts

2. **Wheeler's Participatory Universe** (88% congruency)
   - 39 SIMILAR_TO edges
   - Strong overlap in observer-dependent collapse

## Top Contradictions
1. **Many-Worlds Interpretation** (23% congruency)
   - 12 REFUTES edges
   - Fundamental disagreement on wave function collapse

...
```

---

## 8. Performance Considerations

### For Large Vaults (15,000+ files)

- **Lazy loading**: Only parse files on open/save, not entire vault
- **Incremental sync**: Track last modified timestamps
- **Batch operations**: Insert/update nodes in transactions
- **Index optimization**: HNSW indexes for vector search are crucial
- **Connection pooling**: Reuse PostgreSQL connections (max 10)

### For 70 Theories

- **Pre-compute embeddings**: Don't regenerate on every query
- **Cache results**: Store query results in `query_history` table
- **Materialized views**: For frequently accessed congruency scores

---

## 9. Developer Quick Start

### Prerequisites

- PostgreSQL 14+ with `pgvector` extension
- Node.js 18+
- Obsidian desktop
- OpenAI API key (for embeddings)

### Setup

```bash
# 1. Initialize database
psql -U postgres -d kj -f schema-enhanced.sql

# 2. Install plugin dependencies
cd /path/to/vault/.obsidian/plugins/epistemic-tagger
npm install

# 3. Build
npm run build

# 4. Configure
# Open Obsidian → Settings → Epistemic Tagger
# - Enter PostgreSQL connection string
# - Enter OpenAI API key
# - Click "Initialize Enhanced Schema"
# - Click "Test Connection"

# 5. Start using markers!
```

### Key Files

- `marker-parser.ts`: Regex parsing and UUID injection
- `database-enhanced.ts`: PostgreSQL operations with pgvector
- `schema-enhanced.sql`: Complete database schema
- `main-enhanced.ts`: Plugin integration (TODO: create this)

---

## 10. Summary: The Truth Engine Flow

```
┌─────────────────┐
│  Obsidian File  │
│                 │
│ ::: [Claim]     │
│ {Source: ...}   │
│ Content :::     │
└────────┬────────┘
         │ On Save
         ▼
┌─────────────────┐      ┌──────────────────┐
│  Marker Parser  │─────▶│   PostgreSQL     │
│                 │      │                  │
│ • Extract type  │      │ ┌──────────────┐ │
│ • Parse attrs   │      │ │atomic_nodes  │ │
│ • Check UUID    │      │ │semantic_edges│ │
│ • Generate      │      │ │sister_lexicon│ │
│   embedding     │      │ └──────────────┘ │
└────────┬────────┘      └──────────────────┘
         │ UUID returned
         ▼
┌─────────────────┐
│  File Rewriter  │
│                 │
│ Inject UUID     │
│ back to marker  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Updated File   │
│                 │
│ ::: [Claim]     │
│ {ID: abc-123,   │
│  Source: ...}   │
│ Content :::     │
└─────────────────┘
```

**Query Flow:**

```
{{QUERY: Show contradictions}}
         │
         ▼
┌─────────────────┐
│  Query Parser   │
│                 │
│ • Detect type   │
│ • Find context  │
│   node UUID     │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  DB Query       │
│                 │
│ SELECT FROM     │
│ semantic_edges  │
│ WHERE ...       │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Result Format  │
│                 │
│ Generate        │
│ Obsidian        │
│ callout         │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  File Inject    │
│                 │
│ Insert callout  │
│ below {{QUERY}} │
└─────────────────┘
```

---

## 11. Next Steps

1. **Review this architecture** with your team/AI developer
2. **Run `schema-enhanced.sql`** on your PostgreSQL database
3. **Implement main-enhanced.ts** to integrate marker-parser and database-enhanced
4. **Test with a single note** containing 5-10 markers
5. **Add OpenAI embedding integration** for vector search
6. **Populate `sister_lexicon` table** with your initial term mappings
7. **Create first query command** to validate bidirectional sync

---

**This is your blueprint for the Truth Engine. Copy this entire document to your AI developer or use it as the specification for implementation.**
