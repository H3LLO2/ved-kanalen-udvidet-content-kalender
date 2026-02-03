# AI Agents Specification

## Overview

This system uses a multi-agent pipeline where each agent has a specific role. Agents are implemented as separate modules in `src/agents/` and called via Supabase Edge Functions.

## Agent 1: The Eye (Vision Analysis)

**File:** `src/agents/eye.ts`
**Model:** `gemini-3-flash-preview`
**Purpose:** Analyze uploaded images for content, mood, and strategic fit

### Input
```typescript
interface EyeInput {
  imageId: string;
  imageData: string; // base64 or URL
}
```

### Output
```typescript
interface EyeOutput {
  id: string;
  content: string;      // What's in the image
  mood: string;         // Emotional tone
  strategicFit: string; // How it fits brand strategy
}
```

### Execution
- Runs in parallel with rate limiting (3-5 concurrent)
- Fast model, cheap per call
- Failure recovery: Skip with warning, use placeholder analysis

---

## Agent 2: The Brain (Strategic Planner)

**File:** `src/agents/brain.ts`
**Model:** `gemini-3-pro-preview`
**Purpose:** Create content calendar with image groupings and narrative arc

### Input
```typescript
interface BrainInput {
  imageAnalyses: EyeOutput[];
  brandManifest: string;
  currentPhase: string;
  previousPosts: PostSummary[];
  imageCount: number;
}
```

### Output
```typescript
interface BrainOutput {
  thoughts: string;  // Internal reasoning
  plan: DayPlan[];
}

interface DayPlan {
  day: number;
  imageIds: string[];
  seed: string;       // Content premise for copywriter
  reasoning: string;  // Why this grouping
  time: string;       // "HH:MM" format
  graphic?: GraphicRequest | null;
}

interface GraphicRequest {
  shouldGenerate: boolean;
  concept: string;
  headline?: string;
  subtext?: string;
  style: string;
  reasoning: string;
}
```

### Key Rules
1. Use ALL images - nothing left unused
2. Group intelligently (1-3 images per post)
3. Determine day count dynamically
4. Assign optimal times (07:00-19:00)
5. Create narrative arc
6. Never repeat premises
7. Request graphics only when they add value

### Execution
- Single call with large context
- Failure recovery: Retry with stricter prompt, fallback to 1:1 mapping

---

## Agent 3: The Voice (Copywriter)

**File:** `src/agents/voice.ts`
**Model:** `gemini-3-pro-preview`
**Purpose:** Write authentic Danish captions

### Input
```typescript
interface VoiceInput {
  seed: string;
  imageContext: string;
  previousPost?: string;
  phase: string;
  hookType?: HookType;
  ctaType?: CTAType;
}

type HookType = 'EMOTIONAL' | 'CONTROVERSIAL' | 'HUMOROUS' | 'INFORMATIVE' | 'DIRECT';
type CTAType = 'NONE' | 'HIDDEN' | 'SOFT' | 'VALUE' | 'SELL';
```

### Output
Plain text Danish caption ready for Facebook/Instagram.

### Critical Rules
- All content in Danish
- Use filler words naturally: "sgu", "jo", "lige"
- Plain text only (no markdown)
- 5-15 sentences
- 0-4 emojis placed naturally
- Never use forbidden words
- Vary hooks, lengths, and CTAs

### Execution
- Sequential (needs previous post context)
- Failure recovery: Retry once, then placeholder for manual edit

---

## Agent 4: The Designer (Graphic Generator)

**File:** `src/agents/designer.ts`
**Model:** `gemini-3-pro-image-preview`
**Purpose:** Generate professional infographics

### Input
```typescript
interface DesignerInput {
  concept: string;
  headline?: string;
  subtext?: string;
  style: string;
  brandColors?: string[];
}
```

### Output
```typescript
interface DesignerOutput {
  imageUrl: string;  // Stored in Supabase Storage
  resolution: string;
}
```

### Requirements
- Must look like Canva/Figma template
- NO photorealistic AI imagery
- Sharp, legible typography
- Danish text spelled correctly
- 1:1 aspect ratio for Instagram

### Execution
- Runs in parallel (2-3 concurrent, slow)
- Failure recovery: Continue without graphic, log for manual creation

---

## Pipeline Flow

```
User uploads images
        │
        ▼
  ┌─────────────┐
  │   THE EYE   │  ← Parallel (3-5 concurrent)
  │   (Vision)  │
  └─────────────┘
        │
        ▼
  ┌─────────────┐
  │  THE BRAIN  │  ← Single call
  │  (Planner)  │
  └─────────────┘
        │
        ├──────────────────┐
        ▼                  ▼
  ┌─────────────┐    ┌─────────────┐
  │ THE DESIGNER│    │ (Graphics   │
  │  (Graphics) │    │  parallel)  │
  └─────────────┘    └─────────────┘
        │
        ▼
  ┌─────────────┐
  │  THE VOICE  │  ← Sequential (needs context)
  │   (Writer)  │
  └─────────────┘
        │
        ▼
  Complete calendar output
```

---

## Error Handling

| Agent | Failure Mode | Recovery Strategy |
|-------|--------------|-------------------|
| Eye | Can't analyze image | Skip with warning, placeholder analysis |
| Brain | Invalid JSON | Retry with stricter prompt, fallback to 1:1 |
| Voice | Empty caption | Retry once, then placeholder for manual edit |
| Designer | Generation fails | Continue without graphic, log for manual |

---

## Rate Limiting

Implement exponential backoff on 429 errors:

```typescript
async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  baseDelay = 1000
): Promise<T> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (error.status === 429 && i < maxRetries - 1) {
        await sleep(baseDelay * Math.pow(2, i));
        continue;
      }
      throw error;
    }
  }
  throw new Error('Max retries exceeded');
}
```

---

## JSON Extraction

Always use robust extraction for AI responses:

```typescript
function extractJSON<T>(text: string): T {
  // Direct parse
  try { return JSON.parse(text); } catch {}

  // From code blocks
  const blockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (blockMatch) {
    try { return JSON.parse(blockMatch[1].trim()); } catch {}
  }

  // Find JSON object
  const objectMatch = text.match(/\{[\s\S]*\}/);
  if (objectMatch) {
    try { return JSON.parse(objectMatch[0]); } catch {}
  }

  throw new Error('Could not extract valid JSON');
}
```
