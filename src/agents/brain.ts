import { getProModel, extractJson, withRateLimit, trackTokens } from '../lib/gemini';
import { buildManifest, getPhaseStrategy, type EstablishmentSegment } from '../lib/brandContext';
import { getMenuContext } from '../lib/menu';
import { getPostingTimeGuidance } from '../lib/calendar';
import type { EyeOutput, BrainOutput, Phase, DayPlan } from '../types';

// Brain prompt template - uses manifest and strategy from brand context
function buildBrainPrompt(
  analyses: EyeOutput[],
  phase: Phase,
  targetDays: number,
  segment?: EstablishmentSegment,
  history: string = ''
): string {
  const manifest = buildManifest();
  const strategy = getPhaseStrategy(phase, segment);
  const postingTimes = getPostingTimeGuidance();

  // Include menu context for post-opening phases
  const includeMenu = phase === 'LAUNCH' || phase === 'ESTABLISHMENT';
  const menuSection = includeMenu
    ? `

MENU KNOWLEDGE (use this to inform content seeds for food-related images):
${getMenuContext()}

IMPORTANT: You know the menu, but don't just list dishes. Use this knowledge to create authentic, specific content seeds. For example:
- If you see a braised meat dish: reference the "Braiseret kalveskank" or "Boeuf Bourguignon"
- If you see fish: reference "Smørbagt torsk" or "Fish & chips" or "Fiskefrikadeller"
- If you see lunch prep: reference the frokost classics
- NEVER include prices in seeds. NEVER make it feel like an ad.
`
    : '';

  return `CONTEXT:
You are the "Brain" of a social media orchestrator for "Ved Kanalen" (formerly Restaurant Ene).

MANIFEST:
${manifest}

STRATEGY FOR THIS PHASE:
${strategy}
${menuSection}

${postingTimes}

HISTORY (Last 60 days):
${history || 'No previous posts.'}

VISUAL ASSETS AVAILABLE (The "Eye" has analyzed these):
${JSON.stringify(analyses, null, 2)}

==============================================================================
TASK: Create EXACTLY ${targetDays} days of content from ${analyses.length} images.
==============================================================================

CRITICAL: IMAGE SIMILARITY DETECTION
Before planning, analyze the images for DUPLICATES and NEAR-DUPLICATES:

1. IDENTICAL/NEAR-IDENTICAL IMAGES (same scene, same angle, minor differences):
   - These look STUPID if posted on different days
   - MUST be grouped together in ONE post, OR pick the BEST one and SKIP the rest
   - Examples: multiple shots of same dish, same wall being painted from same angle

2. SIMILAR THEME IMAGES (same subject, different angles/moments):
   - CAN be grouped for carousel posts (2-3 images)
   - OR spread out if they tell different stories
   - Examples: different angles of renovation, different dishes

3. TRULY UNIQUE IMAGES:
   - Each can be its own post
   - Don't group just to group - solo images are often stronger

CAROUSEL STRATEGY (CRITICAL - USE MULTIPLE IMAGES!):
Instagram/Facebook carousel posts get 3x more engagement than single images.
PRIORITIZE grouping 2-3 images per post when they relate to each other.

GROUPING RULES:
- PREFER 2-3 images per post (carousel) over single images
- Group images that show: same activity, same day, same theme, before/after, process
- If images are nearly identical: PICK THE BEST ONE, skip duplicates
- Solo images only when the image is truly standalone or exceptional
- Maximum 3 images per post
- NEVER post similar-looking images on consecutive days

TARGET: EXACTLY ${targetDays} DAYS OF CONTENT
- You have ${analyses.length} images
- You need EXACTLY ${targetDays} posts - no more, no less
- With ${analyses.length} images for ${targetDays} days, aim for ~${Math.ceil(analyses.length / targetDays)} images per post average
- Group related images into carousels to use all images within ${targetDays} days
- Only request graphics if you genuinely need them for variety (countdown, milestones)

GRAPHIC GENERATION (USE STRATEGICALLY):
Request graphics to:
- Fill gaps when images run out
- Mark milestones (opening day, week anniversaries)
- Create variety when images are too similar
- Visualize concepts that photos can't capture

Graphics should:
- Be in DANISH
- Have professional, Canva-like aesthetic
- ADD value, not just decorate

POSTING TIME RULES:
- Use the research-based times above
- VARY the times - don't post at the same time every day
- Match time to content: food photos at meal times, behind-scenes in morning
- Weekend posts: 10:00, 12:30, 16:00, or 19:30
- Weekday posts: 07:30, 09:00, 12:00, 15:00, 19:00, or 21:00

HOOK & CTA STRATEGY (CRITICAL FOR 90-DAY VARIATION):
For each day, assign a hook type and CTA type. NEVER use the same combination two days in a row.

HOOK TYPES (rotate evenly):
- EMOTIONAL: Minder, dufte, følelser
- CONTROVERSIAL: Skarp holdning til mad/vin
- HUMOROUS: Selvironi, kaos
- INFORMATIVE: Nørdet viden
- DIRECT: Ingen indpakning, bare fakta

CTA TYPES (based on phase):
- NONE: Bare punktum (most common pre-opening)
- HIDDEN: Nævn muligheden i bisætning
- SOFT: "Kig forbi..." (after opening)
- VALUE: Giv opskrift/tip
- SELL: Direkte booking (RARE, only post-launch)

PRE-OPENING (Phase 1-2): Mostly NONE or HIDDEN CTAs
POST-OPENING (Phase 3-4): Mix of SOFT, VALUE, occasional SELL

OUTPUT JSON ONLY:
{
  "thoughts": "Your analysis of the images, duplicates found, grouping strategy, and how you'll reach ${targetDays} days...",
  "duplicatesFound": ["Brief note on any near-identical images you're handling"],
  "plan": [
    {
      "day": 1,
      "imageIds": ["id1"],
      "seed": "Specific content premise...",
      "reasoning": "Why this image, why this day...",
      "time": "07:30",
      "hookType": "EMOTIONAL",
      "ctaType": "NONE"
    },
    {
      "day": 2,
      "imageIds": ["id2", "id3"],
      "seed": "Before/after transformation...",
      "reasoning": "These are sequence shots of the same wall...",
      "time": "12:00",
      "hookType": "DIRECT",
      "ctaType": "HIDDEN"
    },
    {
      "day": 3,
      "imageIds": [],
      "seed": "Countdown to opening...",
      "reasoning": "Need variety, requesting graphic...",
      "time": "19:00",
      "hookType": "INFORMATIVE",
      "ctaType": "NONE",
      "graphic": {
        "shouldGenerate": true,
        "concept": "Countdown graphic - X days until opening",
        "headline": "Om 5 dage...",
        "subtext": "",
        "style": "minimalist, warm tones, anticipation",
        "reasoning": "Creates variety between photo posts"
      }
    }
  ]
}

CRITICAL REMINDERS:
- EXACTLY ${targetDays} days in the plan
- NO similar images on consecutive days
- VARY posting times
- Detect and handle duplicates intelligently`;
}

interface BrainResult {
  success: boolean;
  output?: BrainOutput;
  error?: string;
}

export async function createContentPlan(
  analyses: EyeOutput[],
  phase: Phase,
  targetDays: number,
  segment?: EstablishmentSegment,
  history: string = ''
): Promise<BrainResult> {
  try {
    const model = getProModel();

    // Build the prompt with full brand context and target days
    const prompt = buildBrainPrompt(analyses, phase, targetDays, segment, history);

    const result = await withRateLimit(async () => {
      return await model.generateContent(prompt);
    });

    // Track token usage
    trackTokens('brain', result);

    const response = result.response;
    const text = response.text();

    const parsed = extractJson<{
      thoughts: string;
      plan: DayPlan[];
    }>(text);

    // Log if not all images were used (but don't add extra days)
    const usedIds = new Set(parsed.plan.flatMap((p) => p.imageIds));
    const allIds = new Set(analyses.map((a) => a.id));
    const missingIds = [...allIds].filter((id) => !usedIds.has(id));

    if (missingIds.length > 0) {
      console.warn(`Brain skipped ${missingIds.length} images (likely duplicates or extras)`);
    }

    // Ensure we have exactly the target days - trim if Brain over-planned
    if (parsed.plan.length > targetDays) {
      console.warn(`Brain created ${parsed.plan.length} days, trimming to ${targetDays}`);
      parsed.plan = parsed.plan.slice(0, targetDays);
    }

    return {
      success: true,
      output: {
        thoughts: parsed.thoughts,
        plan: parsed.plan,
      },
    };
  } catch (error) {
    console.error('Brain planning failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// Export plan as JSON file for Claude Code instances
export function exportPlanForClaude(
  analyses: EyeOutput[],
  brainPlan: BrainOutput,
  phase: Phase
): string {
  return JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      phase,
      imageCount: analyses.length,
      analyses,
      plan: brainPlan,
    },
    null,
    2
  );
}
