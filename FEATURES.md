# Word Ontology Plugin - New Features

## Overview
This Obsidian plugin now includes powerful customization features for managing classifications, AI-powered document processing, and flexible metadata storage.

## Key Features

### 1. Custom Profiles
Create your own classification profiles with custom categories tailored to your specific needs.

**How to use:**
1. Go to Settings → Epistemic Tagger → Custom Profiles
2. Click "Create Profile"
3. Fill in:
   - **Profile Name**: Internal identifier (lowercase, no spaces)
   - **Display Name**: Human-readable name
   - **Description**: What this profile is for
4. Add custom categories (after creation, you can edit the profile to add categories)

**Example Use Cases:**
- Academic research profiles with domain-specific categories
- Project management profiles (tasks, risks, decisions)
- Content creation profiles (headlines, quotes, action items)

### 2. Custom AI Prompts
Define custom prompts for AI-powered document processing.

**How to use:**
1. Go to Settings → Epistemic Tagger → Custom AI Prompts
2. Click "Create Prompt"
3. Configure:
   - **Name**: Descriptive name for the prompt
   - **Description**: What it does
   - **Prompt**: The instruction for Claude (document content is appended automatically)
   - **Auto-Classify Results** (optional): Automatically tag the AI response with a category

**Example Prompts:**
- "Summarize this document in 3 key points"
- "Extract all action items and deadlines"
- "Identify potential risks or concerns in this text"
- "Generate a list of questions this document raises"

**Access via Right-Click Menu:**
- Right-click in any document
- Select "Process Document With..." → Choose your custom prompt
- Results appear in console and can be auto-classified

### 3. Document-Level AI Processing

**Auto-Classify Entire Document:**
- Right-click anywhere in a document
- Select "Auto-Classify Document (AI)"
- Claude analyzes the entire document and automatically identifies and classifies key sections
- All classifications are saved to the database

This is perfect for:
- Processing research papers
- Analyzing meeting notes
- Categorizing long-form content

### 4. Invisible Metadata Mode
Store classifications in the database without showing any visual indicators in the editor.

**How to enable:**
1. Go to Settings → Epistemic Tagger → Advanced Options
2. Toggle "Enable Invisible Metadata"

**When to use:**
- You want to track classifications without cluttering your notes
- Building training datasets without visual distractions
- Collecting metadata for analysis without affecting readability

**Note:** Classifications are still stored in the database and can be:
- Exported to CSV
- Queried programmatically
- Viewed via the "View All Classifications in Note" command

### 5. Enhanced Right-Click Menu

The context menu now offers:

**For Selected Text:**
- Classify Selection As... (manual classification)
- Suggest Classification (AI) (AI suggests category)

**For Entire Document:**
- Auto-Classify Document (AI) (analyze and classify key sections)
- Process Document With... (use custom prompts)

### 6. Profile Management
Switch between built-in and custom profiles easily:

**Built-in Profiles:**
- Personal Research (axiom, canonical, evidence, coherence, reference)
- YouTube Content (key points, evidence, stories, CTAs)
- AI Training Data (ground truth, ambiguous, contradictory, high confidence)

**Custom Profiles:**
- Create unlimited custom profiles
- Each profile can have its own categories
- Switch profiles via command palette or settings

## Settings Organization

### Database Configuration
- PostgreSQL connection
- Test connection
- Initialize schema

### Bundle Profile
- Select active profile (built-in or custom)
- View current profile categories

### Custom Profiles
- Create/edit/delete custom profiles
- Manage categories per profile

### Visual Options
- Show/hide highlights
- Show/hide icons
- Adjust highlight opacity

### User Configuration
- Set username for tagging

### AI Assistant
- Configure Anthropic API key
- Required for AI features

### Custom AI Prompts
- Create/edit/delete custom prompts
- Define auto-classification targets

### Advanced Options
- Enable invisible metadata mode

## Workflow Examples

### Example 1: Research Paper Analysis
1. Create custom prompt: "Identify the main hypothesis, methodology, and key findings"
2. Open a research paper in Obsidian
3. Right-click → "Process Document With..." → Select your prompt
4. Claude analyzes the paper and outputs structured results
5. Optionally auto-classify results to "research_findings" category

### Example 2: Meeting Notes Processing
1. Create custom profile: "Meeting Notes" with categories: action_item, decision, question, risk
2. Take meeting notes in Obsidian
3. Right-click → "Auto-Classify Document (AI)"
4. Claude automatically identifies and tags action items, decisions, etc.
5. Export to CSV for project management tracking

### Example 3: Content Creation
1. Use "YouTube Content" profile
2. Draft video script
3. Manually classify key points, evidence, stories, CTAs
4. Enable invisible metadata to keep script clean
5. Export classifications to guide video editing

## Technical Details

### Data Storage
- All classifications stored in PostgreSQL database
- Includes: content, type, file path, offsets, confidence, timestamp
- Supports multiple profiles per database

### AI Integration
- Uses Anthropic Claude API (claude-sonnet-4-20250514)
- Respects your API key (stored securely in settings)
- Configurable prompts and confidence levels

### Invisible Metadata
- Classifications tracked in database only
- No visual indicators in editor (no highlights, no icons)
- Full functionality for export and analysis
- Toggle on/off without losing data

## Tips & Best Practices

1. **Start with built-in profiles** to understand the system before creating custom ones
2. **Test custom prompts** on small documents first
3. **Use invisible metadata** when sharing notes with others who don't use the plugin
4. **Export regularly** to CSV for backup and analysis
5. **Combine manual and AI classification** for best results
6. **Create domain-specific profiles** for different projects or research areas

## Troubleshooting

**AI features not working?**
- Check that Anthropic API key is configured in settings
- Verify API key is valid and has credits
- Check browser console for error messages

**Classifications not appearing?**
- Check if "Invisible Metadata" is enabled
- Verify "Show Highlights" or "Show Icons" is enabled
- Ensure correct profile is active

**Custom prompts not showing in menu?**
- Verify at least one custom prompt is created
- Check that Anthropic API key is configured

## Future Enhancements

Potential additions:
- Category editor UI for custom profiles
- Batch processing multiple documents
- Classification templates
- Advanced filtering and search
- Integration with other AI models
- Collaborative classification workflows
