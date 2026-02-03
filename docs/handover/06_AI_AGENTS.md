# AI Agents Specification

This system operates as a **multi-agent pipeline** where each agent has a specific role.

---

## Agent 1: The Eye (Vision Analysis)

**Model:** `gemini-3-flash-preview` (fast, supports images)

**Purpose:** Analyze each uploaded image to extract content, mood, and strategic fit.

**Input:**
- Image (base64 or URL)
- Image ID for tracking

**Output:**
```json
{
  "id": "abc123",
  "content": "Two people painting a wall white. Paint cans visible. Casual work clothes.",
  "mood": "Industrious, authentic, behind-the-scenes",
  "strategicFit": "Physical Transformation - renovation progress shot"
}
```

**Prompt Strategy:**
- Keep it focused: just describe what you see
- Categorize mood from a predefined set
- Link to brand strategy pillars (Physical Shift, Food Lab, Team, Ambiance)

---

## Agent 2: The Brain (Strategic Planner)

**Model:** `gemini-3-pro-preview` (smart, reasoning)

**Purpose:** Create a content calendar by grouping images and planning narrative arc.

**Input:**
- All image analyses
- Brand manifest
- Current strategy/phase
- Previous post history (for continuity)
- Total number of images

**Output:**
```json
{
  "thoughts": "Internal reasoning about the narrative arc...",
  "plan": [
    {
      "day": 1,
      "imageIds": ["img1"],
      "seed": "Content premise for the copywriter",
      "reasoning": "Why this image on day 1",
      "time": "08:30",
      "graphic": null
    },
    {
      "day": 2,
      "imageIds": ["img2", "img3"],
      "seed": "Before/after transformation story",
      "reasoning": "These show the same wall before and after painting",
      "time": "12:00",
      "graphic": {
        "shouldGenerate": true,
        "concept": "Timeline showing renovation progress",
        "headline": "Fra lukket til åbent",
        "subtext": "14 dages transformation",
        "style": "minimalist, warm tones",
        "reasoning": "Adds visual reinforcement of the journey"
      }
    }
  ]
}
```

**Key Responsibilities:**
1. **Use ALL images** - nothing left unused
2. **Group intelligently** - sequences, before/after, related moments (1-3 per post)
3. **Determine day count** dynamically based on groupings
4. **Assign optimal times** - between 07:00-19:00
5. **Create narrative arc** - build tension and release over time
6. **Never repeat premises** - each post must be unique
7. **Optionally request graphics** - only when they add value

---

## Agent 3: The Voice (Copywriter)

**Model:** `gemini-3-pro-preview`

**Purpose:** Write authentic Danish captions using the brand's voice.

**Input:**
- Content seed (from The Brain)
- Image description (from The Eye)
- Previous post context (for continuity)
- Full system prompt with voice guidelines

**Output:**
Plain text caption ready for Facebook/Instagram.

**Critical Voice Rules (enforced in prompt):**
- All content in **Danish**
- Authentic, no marketing buzzwords
- Use Danish filler words naturally: "sgu", "jo", "lige"
- Plain text only - no markdown, no bold, no headers
- 5-15 sentences
- 0-4 emojis placed naturally
- Vary hooks, lengths, and CTAs
- Never use forbidden words (lækker, gastronomisk rejse, etc.)

**Context Awareness:**
- Must receive summary of previous N posts
- Must vary from what came before
- Must respect current phase (build-up vs. opening vs. daily)

---

## Agent 4: The Designer (Graphic Generator)

**Model:** `gemini-3-pro-image-preview` (Nano Banana Pro)

**Purpose:** Generate professional infographics/graphics to accompany posts.

**Input:**
```json
{
  "concept": "What the graphic should communicate",
  "headline": "Danish headline text (optional)",
  "subtext": "Danish supporting text (optional)",
  "style": "Design style descriptor",
  "brandColors": "Color palette to use"
}
```

**Output:**
- Generated image (base64 or stored URL)
- Resolution: 1K default (can go to 2K/4K)
- Aspect ratio: 1:1 for Instagram feed

**Critical Requirements:**
- Must look like human-made Canva/Figma template
- NO photorealistic AI imagery
- NO weird AI artifacts
- Sharp, legible typography
- Clean geometric/minimalist elements
- Danish text spelled correctly

**When to generate:**
- The Brain decides if a post needs a graphic
- Not every post - only when it genuinely adds value
- Examples: timelines, announcements, quote cards, infographics

---

## Pipeline Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                         USER UPLOADS IMAGES                         │
└─────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│  AGENT 1: THE EYE                                                   │
│  • Analyze each image (parallel with rate limiting)                 │
│  • Output: ImageAnalysis[] with content, mood, strategicFit         │
└─────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│  AGENT 2: THE BRAIN                                                 │
│  • Receive all analyses + brand context + history                   │
│  • Output: DayPlan[] with image groupings, seeds, times, graphics   │
└─────────────────────────────────────────────────────────────────────┘
                                   │
                    ┌──────────────┴──────────────┐
                    │                             │
                    ▼                             ▼
┌──────────────────────────────┐  ┌──────────────────────────────────┐
│  AGENT 4: THE DESIGNER       │  │  For posts that need graphics    │
│  • Generate requested images │  │  (runs in parallel with writing) │
└──────────────────────────────┘  └──────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│  AGENT 3: THE VOICE (SEQUENTIAL - one post at a time)              │
│  • For each day in plan:                                            │
│    - Receive seed + image context + previous post                   │
│    - Write caption in brand voice                                   │
│    - Store caption + update history for next iteration              │
└─────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│  OUTPUT: Complete calendar with images + captions + optional graphics│
└─────────────────────────────────────────────────────────────────────┘
```

---

## Error Handling Per Agent

| Agent | Failure Mode | Recovery |
|-------|--------------|----------|
| Eye | Can't analyze image | Skip image with warning, use placeholder analysis |
| Brain | Invalid JSON | Retry with stricter prompt, fallback to simple 1:1 mapping |
| Voice | Empty caption | Retry once, then use placeholder for manual edit |
| Designer | Generation fails | Continue without graphic, log for manual creation |

---

## Rate Limiting

- **Eye:** Can run 3-5 parallel (adjust based on API limits)
- **Brain:** Single call (large context, runs once)
- **Voice:** Sequential (needs previous post context)
- **Designer:** Can run 2-3 parallel (image gen is slow)

Add exponential backoff on 429 errors (rate limited).
