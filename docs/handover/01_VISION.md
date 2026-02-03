# Ved Kanalen Social Media Orchestrator - Complete Rebuild

## The Vision

You are building an **autonomous AI-powered social media team** for a Danish restaurant called "Ved Kanalen" (formerly Restaurant Ene). The owner provides photos - the system does everything else: analyzes them, creates a strategic content calendar, writes authentic Danish captions, and optionally generates supporting graphics.

**The end goal:** Upload 20 photos → Get 10-15 ready-to-post Instagram/Facebook posts with strategic timing, narrative arc, and authentic Danish voice.

---

## Core Problem Being Solved

The restaurant owner (Malte/Per) takes photos of their restaurant - food being prepared, renovation progress, team moments, the waterfront view. They don't have time to:
- Decide which photos work best together
- Write engaging captions that sound authentic (not like marketing)
- Plan a coherent narrative across multiple posts
- Think about optimal posting times
- Create supporting infographics when needed

**This app is their entire SoMe team in one tool.**

---

## The Brand Context

### Ved Kanalen Identity
- Previously "Restaurant Ene" (fine dining)
- Now rebranding to casual bistro/"Klubhus" concept
- Located in Kanalbyen, Fredericia, Denmark
- All content is in **Danish**
- Tone: Jordnær (down-to-earth), authentic, no marketing bullshit
- Owners: Malte and Per

### Current Phase: "Transformationen" (January 2026)
- Restaurant is closed for renovation
- Sharing the transformation journey on social media
- Building anticipation before grand opening Jan 28

### Critical Voice Rules
- Never use: "lækker", "gastronomisk rejse", "forkælelse", "eksklusiv"
- Use naturally: "sgu", "jo", "lige", "egentlig" (Danish filler words)
- No AI-sounding text - must feel like human wrote it on their phone
- Plain text only, no markdown in output
- 0-4 emojis per post, placed naturally

---

## Feature Requirements

### 1. Image Upload & Processing
- Accept HEIC, JPEG, PNG, WebP (iPhone users use HEIC)
- Auto-convert HEIC to JPEG on upload
- Support 20+ images at once
- Show thumbnails with selection toggles

### 2. AI Vision Analysis ("The Eye")
- Analyze each image for: content, mood, strategic fit
- Use multimodal AI (Gemini with vision)
- Detect: food shots, renovation progress, team moments, ambiance

### 3. Strategic Planning ("The Brain")
- Create content calendar using ALL uploaded images
- Group 1-3 related photos per post (sequences, before/after, related moments)
- Determine optimal number of days based on content
- Assign strategic posting times (07:00-19:00)
- Ensure narrative arc across posts
- Never repeat a premise
- Optionally request graphic generation for specific posts

### 4. Caption Writing ("The Voice")
- Write authentic Danish captions
- Follow extensive voice guidelines (see brand documents)
- Maintain context between posts (build narrative)
- Vary length, hooks, and CTA types
- 5-15 sentences per post

### 5. Graphic Generation ("The Designer") - Optional
- Generate infographics/graphics to accompany photos
- Must look Canva-made, not AI-generated
- Danish text support
- Clean, professional graphic design
- Only when it adds value (not every post)

### 6. Output
- Ready-to-copy Facebook/Instagram posts
- Caption + images grouped together
- Posting time recommendation
- Ability to regenerate individual posts
- Edit captions inline

---

## What the Previous Implementation Got Wrong

### Technical Mistakes to Avoid

1. **LocalStorage Quota Exceeded**
   - Stored base64 images in localStorage (5MB limit)
   - Fix: Never store image data in localStorage, only metadata/captions

2. **HEIC Files Not Displaying**
   - Browsers can't display HEIC natively
   - Fix: Convert HEIC to JPEG on upload using heic2any

3. **No Error Boundaries**
   - React crashed to black screen on errors
   - Fix: Add proper error boundaries and try-catch everywhere

4. **Fragile JSON Parsing**
   - AI sometimes returns malformed JSON
   - Fix: Robust JSON extraction with fallbacks

5. **Hardcoded Defaults Overwritten**
   - Brand context was initialized with truncated text
   - Fix: Load full content from files or database, not hardcoded strings

### Architecture Issues

1. **All in Frontend**
   - API keys exposed in browser
   - No rate limiting or caching
   - Fix: Consider backend/Edge Functions for AI calls

2. **No Real Persistence**
   - Strategy state lost on refresh
   - Fix: Use database (Supabase) for strategy persistence

3. **Monolithic AI Service**
   - Single file with all AI logic
   - Fix: Separate agents into their own modules

---

## Recommended Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        FRONTEND                             │
│  React + TypeScript + Vite                                  │
│  - Image upload/preview (with HEIC conversion)              │
│  - Interactive calendar view                                │
│  - Caption editing                                          │
│  - Settings/context configuration                           │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    SUPABASE BACKEND                         │
│  - Edge Functions for AI calls (keeps API keys secure)      │
│  - PostgreSQL for strategy/post persistence                 │
│  - Storage for processed images                             │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                     AI AGENTS                               │
│                                                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │   The Eye   │  │  The Brain  │  │  The Voice  │         │
│  │   (Vision)  │→ │  (Planner)  │→ │   (Writer)  │         │
│  └─────────────┘  └─────────────┘  └─────────────┘         │
│                          │                                  │
│                          ▼                                  │
│                   ┌─────────────┐                          │
│                   │ The Designer│                          │
│                   │  (Graphics) │                          │
│                   └─────────────┘                          │
│                                                             │
│  Models: Gemini 3 Flash (vision), Gemini 3 Pro (planning), │
│          Gemini 3 Pro Image Preview (graphic generation)   │
└─────────────────────────────────────────────────────────────┘
```

---

## Files to Read

The `.rebuild/` folder contains:
- `01_VISION.md` - This file (the big picture)
- `02_BRAND_CONTEXT.md` - Full brand manifest and voice guidelines
- `03_STRATEGY_PHASE1.md` - Current strategic phase details
- `04_SYSTEM_PROMPT.md` - The master ghostwriter prompt
- `05_TECHNICAL_SPEC.md` - Detailed technical requirements
- `06_LESSONS_LEARNED.md` - What went wrong and how to avoid it

---

## Success Criteria

The rebuild is successful when:

1. ✅ User can upload 20+ HEIC/JPEG images without errors
2. ✅ All images display correctly (no black boxes)
3. ✅ AI groups related images intelligently (1-3 per post)
4. ✅ Generated captions sound authentically Danish (pass manual review)
5. ✅ Posts maintain narrative continuity
6. ✅ Graphics generate cleanly when requested (Canva-quality)
7. ✅ User can edit captions inline and regenerate individual posts
8. ✅ Strategy/progress persists across sessions (database, not localStorage)
9. ✅ No crashes or black screens on errors
10. ✅ Works reliably with 50+ images
