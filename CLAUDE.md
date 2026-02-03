# Ved Kanalen Content Calendar

## Project Overview

Autonomous AI-powered social media content orchestrator for "Ved Kanalen", a Danish restaurant in Kanalbyen, Fredericia. The system processes uploaded photos and generates ready-to-post Instagram/Facebook content with strategic timing and authentic Danish voice.

**Core workflow:** Upload 20+ photos → AI analyzes, groups, and plans → Generate authentic Danish captions → Output ready-to-copy posts

## Tech Stack

- **Frontend:** React 18+ with TypeScript, Vite, Tailwind CSS
- **Backend:** Local only (no Supabase)
- **Persistence:** IndexedDB or local file storage (TBD)
- **AI Provider:** Google Gemini API
  - `gemini-3-flash-preview` - Vision analysis (The Eye)
  - `gemini-3-pro-preview` - Planning and writing (The Brain, The Voice)
  - `gemini-3-pro-image-preview` - Graphic generation (The Designer)
- **State:** React hooks + Context (or Zustand if complex)
- **Icons:** Lucide React

## Project Structure

```
ved-kanalen-content-calendar/
├── src/
│   ├── agents/           # AI agent implementations
│   │   ├── eye.ts        # Vision analysis agent
│   │   ├── brain.ts      # Strategic planner agent
│   │   ├── voice.ts      # Copywriting agent
│   │   └── designer.ts   # Graphic generation agent
│   ├── components/       # React components
│   ├── lib/              # Utilities and helpers
│   ├── types/            # TypeScript type definitions
│   └── hooks/            # Custom React hooks
├── supabase/
│   └── functions/        # Edge Functions for AI calls
├── docs/
│   └── handover/         # Original knowledge documents
└── public/
```

## Critical Rules

### Never Do
- Store base64 images in localStorage (5MB limit crashes)
- Display HEIC files without converting to JPEG first
- Parse AI JSON responses without robust extraction
- Expose API keys in frontend code
- Let React crash to blank screen (always use Error Boundaries)

### Always Do
- Convert HEIC to JPEG on upload using `heic2any`
- Use Supabase Edge Functions for all AI calls
- Implement robust JSON extraction (handle markdown wrapping)
- Use database for persistence (not localStorage)
- Show clear progress indicators during generation
- Handle port conflicts gracefully: If the default port is occupied, automatically try the next available port. Vite handles this automatically, but any test scripts or tools should accept port as a parameter or detect it dynamically.

## AI Agents Architecture

Four agents work in sequence:

1. **The Eye (Vision)** - Analyzes each image for content, mood, strategic fit
2. **The Brain (Planner)** - Creates content calendar, groups images, plans narrative arc
3. **The Voice (Writer)** - Writes authentic Danish captions following strict voice rules
4. **The Designer (Graphics)** - Generates Canva-style infographics when needed

See `docs/handover/06_AI_AGENTS.md` for detailed specifications.

## Danish Voice Rules (Critical)

All content is in **Danish** with these rules:

**Forbidden words (never use):**
- "Lækker/Lækre" (MOST FORBIDDEN)
- "Gastronomisk rejse", "Forkælelse", "Eksklusiv"
- "Mundvandsdrivende", "Udsøgt", "Magisk"

**Use naturally:**
- Danish filler words: "sgu", "jo", "lige", "egentlig", "altså"
- Plain descriptors: "godt", "sprødt", "mørt", "ærligt"

**Formatting:**
- Plain text only (no markdown in output)
- 0-4 emojis per post, placed naturally
- No greetings ("Hej Facebook")
- Lots of whitespace between paragraphs

See `docs/handover/07_SYSTEM_PROMPT.md` for the full ghostwriter prompt.

## Brand Context: Ved Kanalen

- **Previously:** Restaurant Ene (fine dining)
- **Now:** Casual bistro/"Klubhus" (neighborhood clubhouse)
- **Location:** Kanalbyen, Fredericia, Denmark
- **Owners:** Malte and Per
- **Tone:** Down-to-earth, authentic, no marketing bullshit

**Core sentence:** "Vi lover ikke at være alt for alle. Men vi lover at være et sted."

## Current Phase

**Phase 1: TRANSFORMATIONEN** (January 2026)
- Restaurant closed for renovation
- Sharing transformation journey on social media
- Building anticipation for grand opening Jan 28

## Commands

```bash
# Development
npm run dev          # Start Vite dev server
npm run build        # Build for production
npm run lint         # Run ESLint
```

## Environment Variables

Required in `.env.local`:
```
VITE_GEMINI_API_KEY=your-gemini-api-key
```

**Note:** Since this runs locally, the API key is in the frontend. For production deployment, consider a proxy server.

## Testing

- Use small test dataset (5-10 images) for iteration
- Mock AI responses for UI testing
- Full dataset only for integration tests

## Key Files

- `docs/handover/01_VISION.md` - Project overview and goals
- `docs/handover/04_TECHNICAL_SPEC.md` - Detailed technical requirements
- `docs/handover/05_LESSONS_LEARNED.md` - What went wrong in previous build
- `docs/handover/06_AI_AGENTS.md` - AI agent specifications
- `docs/handover/07_SYSTEM_PROMPT.md` - The Voice system prompt
