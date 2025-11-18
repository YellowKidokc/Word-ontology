# Epistemic Tagger - Syntax Quick Reference

## Basic Marker Syntax

```markdown
:::SHORTCODE content :::
```

After first save, the plugin adds a UUID:

```markdown
:::SHORTCODE<uuid> content :::
```

---

## Default Shortcodes

### Epistemic Types

| Shortcode | Type | Usage Example |
|-----------|------|---------------|
| `H` | Hypothesis | `:::H Time is emergent from decoherence :::` |
| `E` | Evidence | `:::E CMB data shows 2.7K background radiation :::` |
| `T` | Theory | `:::T String theory requires 11 dimensions :::` |
| `D` | Definition | `:::D Entropy = measure of disorder in a system :::` |
| `C` | Claim | `:::C The universe is 13.8 billion years old :::` |
| `O` | Observation | `:::O Galaxy rotation curves deviate from predictions :::` |
| `A` | Axiom | `:::A The speed of light is constant in all frames :::` |

### Sister School Lexicon

| Shortcode | Type | Usage Example |
|-----------|------|---------------|
| `LW` | Legacy Word | `:::LW Wave Function :::` |
| `SW` | Sister Word | `:::SW Void Oscillation :::` |
| `DP` | Drift Percentage | Used with `LW → SW` syntax (see below) |

### External References

| Shortcode | Type | Usage Example |
|-----------|------|---------------|
| `XT` | External Theory | `:::XT Bohm's Implicate Order (#42) :::` |

---

## Special Syntax Patterns

### Sister School Translation

Link a legacy term to your new nomenclature with drift percentage:

```markdown
:::LW Wave Function -> SW Void Oscillation (DP:90%) :::
```

**Result:** Creates entries in both `atomic_nodes` and `sister_lexicon` tables.

### With UUID (after save)

The plugin automatically rewrites markers after first save:

```markdown
:::H<a1b2c3d4-e5f6-7890-...> Time is emergent :::
```

**Don't manually add UUIDs** - the plugin handles this automatically.

---

## Query Commands

Ask the database questions using natural language:

```markdown
{{QUERY: Show contradictions to the above claim}}

{{QUERY: Find similar theories}}

{{QUERY: List all Sister School translations for "quantum entanglement"}}
```

The plugin will inject results as Obsidian callouts below the query.

---

## Customizing Shortcodes

You can define **ANY shortcode** in the plugin settings:

### Example Custom Shortcodes

```markdown
Settings → Epistemic Tagger → Shortcode Definitions

Shortcode: "Q"
Type: "Question"
Description: "Open research question"

Shortcode: "REF"
Type: "Reference"
Description: "Citation or source"

Shortcode: "TODO"
Type: "Research_Todo"
Description: "Follow-up research needed"
```

Then use them in your notes:

```markdown
:::Q Does dark energy violate energy conservation? :::

:::REF Einstein, A. (1915). General Relativity :::

:::TODO Investigate holographic principle implications :::
```

---

## Multi-Shortcode Example (Real Workflow)

```markdown
# My Research Note

I'm investigating whether consciousness plays a role in quantum collapse.

:::H Consciousness is required for wave function collapse :::

This is supported by several observations:

:::E Von Neumann's "cut" requires an observer :::
:::E Double-slit experiment results change with observation :::

However, there are contradictions from mainstream physics:

{{QUERY: Show contradictions to the hypothesis above}}

I also want to translate some legacy terms:

:::LW Observer Effect -> SW Awareness Binding (DP:75%) :::
:::LW Measurement Problem -> SW Collapse Paradox (DP:85%) :::

Related theories from my registry:

:::XT Wheeler's Participatory Universe (#12) supports this view :::
:::XT Copenhagen Interpretation (#03) requires classical observers :::
```

---

## Best Practices

### 1. **Be Specific**
❌ `:::C This is important :::`
✅ `:::C Quantum entanglement violates Bell inequalities :::`

### 2. **Use Consistent Shortcodes**
Pick your shortcodes and stick with them. The system learns from your patterns.

### 3. **Let the Plugin Handle UUIDs**
❌ Don't manually edit `<uuid>` values
✅ Let the plugin inject and manage UUIDs automatically

### 4. **Leverage Queries**
Instead of manually searching, use `{{QUERY}}` commands to let the database find connections.

### 5. **Build Your Lexicon Gradually**
Start with 10-20 key Sister School terms, then expand as you write.

---

## Regex Patterns (For Developers)

If you're building custom integrations:

### Basic Marker
```regex
:::(SHORTCODE)(?:<([^>]+)>)?\s+(.*?)\s*:::
```

### Query Command
```regex
\{\{QUERY:\s*([^}]+)\}\}
```

### Lexicon Entry
```regex
:::LW\s+(.+?)\s*->\s*SW\s+(.+?)(?:\s*\(DP:(\d+)%?\))?\s*:::
```

---

## Troubleshooting

**Q: My marker isn't being detected**
A: Check that you have spaces around the content: `:::H content :::` not `:::Hcontent:::`

**Q: UUID isn't being injected**
A: Ensure the plugin is enabled and the database connection is working (Settings → Test Connection)

**Q: Shortcode not recognized**
A: Define it in Settings → Shortcode Definitions

**Q: Query not returning results**
A: Make sure you've created semantic edges (relationships) between nodes, or use similarity search with embeddings

---

## Example Note Template

Copy this to get started:

```markdown
---
tags: epistemic-research
created: {{date}}
---

# {{title}}

## Core Hypothesis

:::H Your main hypothesis here :::

## Supporting Evidence

:::E Evidence point 1 :::
:::E Evidence point 2 :::
:::E Evidence point 3 :::

## Related Theories

:::XT Theory name (#number) description :::

## Sister School Translations

:::LW Legacy term -> SW New term (DP:percentage%) :::

## Questions

{{QUERY: Show contradictions to the hypothesis above}}

{{QUERY: Find similar theories from the 70 theory registry}}

## Notes

(Your regular notes here)
```

---

**For complete architecture and developer documentation, see `ARCHITECTURE.md`**
