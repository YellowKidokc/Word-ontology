# Plugin Update Summary

## What's New

Your Obsidian Word Ontology plugin has been significantly enhanced with the following features:

### ✅ 1. Custom Profile Management
- **Create your own classification profiles** in Settings → Custom Profiles
- Define custom categories with names, icons, colors, and descriptions
- Switch between built-in and custom profiles
- Edit or delete custom profiles anytime

### ✅ 2. Custom AI Prompts
- **Create reusable AI prompts** for document processing
- Access via right-click menu: "Process Document With..."
- Optionally auto-classify AI results to specific categories
- Perfect for: summaries, action item extraction, analysis, etc.

### ✅ 3. Document-Level AI Processing
- **Right-click → "Auto-Classify Document (AI)"**
- Claude analyzes entire document and automatically identifies/classifies key sections
- Saves all classifications to database
- Great for processing papers, meeting notes, long-form content

### ✅ 4. Invisible Metadata Mode
- **Toggle in Settings → Advanced Options**
- Classifications stored in database but NOT shown in editor
- No highlights, no icons - completely invisible to readers
- Perfect for sharing notes or building datasets without visual clutter
- Can still export, query, and analyze all data

### ✅ 5. Enhanced Right-Click Menu
**For selected text:**
- Classify Selection As...
- Suggest Classification (AI)

**For entire document:**
- Auto-Classify Document (AI)
- Process Document With... (custom prompts)

## Files Modified

1. **types.ts** - Added CustomPrompt interface and new settings fields
2. **profiles.ts** - Updated to support custom user profiles
3. **main.ts** - Added document processing, custom prompts menu, auto-classification
4. **settings.ts** - Complete UI overhaul with profile/prompt management modals
5. **ui/decorations.ts** - Added invisible metadata mode support
6. **document-processor.ts** (NEW) - AI document processing functionality

## How to Use

### Create a Custom Profile
1. Settings → Epistemic Tagger → Custom Profiles
2. Click "Create Profile"
3. Fill in name, display name, description
4. Save (you can add categories later by editing)

### Create a Custom Prompt
1. Settings → Epistemic Tagger → Custom AI Prompts
2. Click "Create Prompt"
3. Enter:
   - Name: e.g., "Extract Action Items"
   - Description: What it does
   - Prompt: e.g., "List all action items and deadlines from this document"
   - Optional: Auto-classify results to a category
4. Save

### Process a Document
1. Open any document
2. Right-click anywhere
3. Choose:
   - "Auto-Classify Document (AI)" - Auto-detect and classify sections
   - "Process Document With..." → Select your custom prompt

### Enable Invisible Metadata
1. Settings → Advanced Options
2. Toggle "Enable Invisible Metadata"
3. Classifications still saved to database but not shown in editor

## Example Workflows

### Academic Research
```
1. Create profile: "Research Papers"
   Categories: hypothesis, methodology, findings, limitations
2. Create prompt: "Identify research methodology and key findings"
3. Open paper → Right-click → Process with custom prompt
4. Review and manually classify additional sections
```

### Meeting Notes
```
1. Use built-in profile or create "Meetings" profile
2. Take notes during meeting
3. Right-click → Auto-Classify Document
4. Export to CSV for project tracking
```

### Content Creation (Clean Output)
```
1. Enable Invisible Metadata mode
2. Draft content and classify sections
3. Share document - readers see clean text
4. You retain all classification data for analysis
```

## Installation/Update

To use the updated plugin:

1. **Build the plugin:**
   ```bash
   npm install
   npm run build
   ```

2. **Copy to Obsidian:**
   - Copy `main.js`, `manifest.json`, and `styles.css` to your vault's `.obsidian/plugins/word-ontology/` folder
   - Reload Obsidian or toggle the plugin off/on

3. **Configure:**
   - Open Settings → Epistemic Tagger
   - Set your Anthropic API key (required for AI features)
   - Create custom profiles and prompts as needed

## Database Compatibility

All new features are fully compatible with your existing PostgreSQL database. No schema changes required - the plugin uses the existing classification tables.

## Next Steps

1. **Test the new features** with a sample document
2. **Create your first custom profile** for your specific use case
3. **Experiment with custom prompts** to automate your workflow
4. **Try invisible metadata mode** if you share notes with others

## Support

If you encounter any issues:
- Check the browser console (Ctrl+Shift+I) for error messages
- Verify your Anthropic API key is configured
- Ensure PostgreSQL connection is working
- Review FEATURES.md for detailed documentation

---

**Enjoy your enhanced Word Ontology plugin!** 🎉
