# Epistemic Tagger - Obsidian Plugin

An Obsidian plugin that allows you to classify selected text with epistemic types (axiom, canonical, evidence, coherence, reference) via right-click menu, store these annotations in PostgreSQL, and support multiple "bundle profiles" for different users/contexts.

## Features

- **Right-Click Classification**: Highlight text and classify it with a single click
- **Multiple Bundle Profiles**: Switch between different classification frameworks:
  - **Personal Research**: Full epistemic categories for knowledge management
  - **YouTube Content**: Simplified categories for video script structure
  - **AI Training Data**: Categories for building training datasets
- **Visual Highlighting**: Color-coded highlights with superscript icons
- **PostgreSQL Storage**: All classifications stored in a robust database
- **AI-Assisted Classification**: Optional Claude AI integration for automatic suggestions
- **Export Functionality**: Export classifications to CSV

## Installation

### Prerequisites

- Obsidian (desktop version)
- PostgreSQL database (tested with PostgreSQL 12+)
- Node.js and npm (for building from source)

### Method 1: Manual Installation (Recommended for Development)

1. Clone or download this repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Build the plugin:
   ```bash
   npm run build
   ```
4. Copy the following files to your vault's plugin folder:
   ```
   .obsidian/plugins/obsidian-epistemic-tagger/
   ├── main.js
   ├── manifest.json
   └── styles.css
   ```
5. Reload Obsidian
6. Enable the plugin in Settings → Community Plugins

### Method 2: From Release

1. Download the latest release from the releases page
2. Extract the files to `.obsidian/plugins/obsidian-epistemic-tagger/`
3. Reload Obsidian
4. Enable the plugin

## Configuration

### Database Setup

1. Open Obsidian Settings → Epistemic Tagger
2. Enter your PostgreSQL connection URL:
   ```
   postgresql://username:password@host:port/database
   ```
3. Click "Test Connection" to verify
4. Click "Initialize Database Schema" to create tables

The plugin will automatically create the necessary schema and seed the initial epistemic types.

### Profile Selection

Choose your active bundle profile from the dropdown:
- **Personal Research**: axiom, canonical, evidence, coherence, reference
- **YouTube Content**: key point, evidence, story/example, call-to-action
- **AI Training Data**: ground truth, ambiguous, contradictory, high confidence

### Visual Settings

- **Show Highlights**: Toggle colored background highlights
- **Show Icons**: Toggle superscript icons
- **Highlight Opacity**: Adjust transparency (0.0 - 1.0)

### AI Integration (Optional)

To enable AI-assisted classification:
1. Obtain an Anthropic API key from https://console.anthropic.com/
2. Enter the key in Settings → Epistemic Tagger → AI Assistant
3. Right-click selected text and choose "Suggest Classification (AI)"

## Usage

### Basic Classification

1. Select text in any note
2. Right-click to open context menu
3. Choose "Classify Selection As..."
4. Select the appropriate category

The text will be highlighted with the category's color and stored in the database.

### AI-Assisted Classification

1. Select text
2. Right-click and choose "Suggest Classification (AI)"
3. Review the AI suggestion
4. Accept or choose a different category

### Command Palette

Access these commands via Ctrl/Cmd + P:
- **Classify Selection**: Quick classification picker
- **Switch Bundle Profile**: Change active profile
- **View All Classifications in Note**: See all classifications
- **Export Classifications to CSV**: Export to CSV file

### Viewing Classifications

- **Highlights**: Classified text appears with colored backgrounds
- **Icons**: Superscript icons indicate the type
- **Tooltips**: Hover over highlights to see details (type, who tagged it, confidence)

## Database Schema

The plugin uses the following PostgreSQL schema:

```sql
-- Statements table
CREATE TABLE epistemic.statements (
    id UUID PRIMARY KEY,
    content TEXT NOT NULL,
    source_file TEXT NOT NULL,
    start_offset INT,
    end_offset INT,
    bundle_profile TEXT,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
);

-- Types table
CREATE TABLE epistemic.types (
    id UUID PRIMARY KEY,
    name TEXT NOT NULL,
    bundle_profile TEXT NOT NULL,
    description TEXT,
    color TEXT,
    icon TEXT,
    priority INT,
    UNIQUE(name, bundle_profile)
);

-- Statement-type relationships
CREATE TABLE epistemic.statement_types (
    id UUID PRIMARY KEY,
    statement_id UUID REFERENCES epistemic.statements(id),
    type_id UUID REFERENCES epistemic.types(id),
    confidence DECIMAL(3,2),
    tagged_by TEXT,
    tagged_at TIMESTAMPTZ,
    notes TEXT
);
```

## Bundle Profiles

### Personal Research
- **Axiom** (⚛): Foundational assumption or first principle
- **Canonical** (◆): Established core claim
- **Evidence** (●): Supporting data or observation
- **Coherence** (⟷): Derived logical relationship
- **Reference** (◈): External citation or authority

### YouTube Content
- **Key Point** (★): Main takeaway or thesis
- **Evidence** (●): Supporting example or data
- **Story/Example** (◐): Narrative or anecdote
- **Call-to-Action** (▶): Call to action

### AI Training Data
- **Ground Truth** (✓): Verified factual claim
- **Ambiguous** (?): Unclear or needs context
- **Contradictory** (✗): Conflicts with other claims
- **High Confidence** (◉): Strong supporting evidence

## Development

### Building from Source

```bash
# Install dependencies
npm install

# Development mode (watch for changes)
npm run dev

# Production build
npm run build
```

### Project Structure

```
obsidian-epistemic-tagger/
├── main.ts                 # Plugin entry point
├── types.ts                # TypeScript interfaces
├── settings.ts             # Settings tab
├── database.ts             # PostgreSQL service
├── classification.ts       # Classification logic
├── profiles.ts             # Bundle profile definitions
├── ui/
│   └── decorations.ts      # Visual highlighting
├── styles.css              # Styling
└── manifest.json           # Plugin metadata
```

## Troubleshooting

### Database Connection Issues

- Verify PostgreSQL is running and accessible
- Check firewall rules allow connection to port 5432
- Ensure credentials are correct
- Test connection using `psql` or another client

### Classifications Not Appearing

- Check that the correct profile is active
- Verify database contains classifications for the current file
- Try refreshing decorations (reload the note)
- Check browser console for errors

### Performance with Large Vaults

- Plugin is optimized for vaults with 15,000+ files
- Classifications are loaded per-file, not all at once
- Database queries use proper indexing

## Contributing

Contributions are welcome! Please:
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## License

MIT License - see LICENSE file for details

## Support

For issues, questions, or feature requests, please open an issue on GitHub.

## Credits

Created for epistemic knowledge management and multi-context tagging workflows.

## Changelog

### Version 1.0.0
- Initial release
- Right-click classification menu
- PostgreSQL integration
- Three bundle profiles (Personal Research, YouTube, AI Training)
- Visual highlighting with icons
- AI-assisted classification
- Export to CSV
- Command palette integration
