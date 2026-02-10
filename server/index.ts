/**
 * Ved Kanalen AI Backend Server
 * 
 * Routes AI tasks to either Claude Code (text/vision) or Gemini (image generation)
 */

import express from 'express';
import cors from 'cors';
import sharp from 'sharp';
import heicConvert from 'heic-convert';
import { runClaude, saveImageToTemp, cleanupTempImage, type ClaudeResponse } from './claude-runner.js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import metaApiRouter from './meta-api.js';

const app = express();
const PORT = process.env.PORT || 3002;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' })); // Large limit for base64 images

// HEIC to JPEG conversion endpoint (server-side using heic-convert)
app.post('/api/convert-heic', express.raw({ type: '*/*', limit: '50mb' }), async (req, res) => {
  try {
    const inputBuffer = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body);
    console.log(`[HEIC] Converting ${inputBuffer.length} bytes...`);

    const outputBuffer = await heicConvert({
      buffer: new Uint8Array(inputBuffer),
      format: 'JPEG',
      quality: 0.92,
    });

    console.log(`[HEIC] Converted to ${outputBuffer.length} bytes JPEG`);
    res.set('Content-Type', 'image/jpeg');
    res.send(Buffer.from(outputBuffer));
  } catch (error) {
    console.error('HEIC conversion error:', error);
    res.status(500).json({ error: `Conversion failed: ${String(error)}` });
  }
});

// ============================================================================
// IMAGE DUPLICATE DETECTION via dHash (perceptual hashing)
// ============================================================================

/**
 * Compute dHash (difference hash) for an image buffer.
 * Resize to 9x8 grayscale, compare adjacent horizontal pixels → 64-bit hash.
 */
async function computeDHash(buffer: Buffer): Promise<bigint> {
  const { data } = await sharp(buffer)
    .greyscale()
    .resize(9, 8, { fit: 'fill' })
    .raw()
    .toBuffer({ resolveWithObject: true });

  let hash = 0n;
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const left = data[y * 9 + x]!;
      const right = data[y * 9 + x + 1]!;
      if (left > right) {
        hash |= 1n << BigInt(y * 8 + x);
      }
    }
  }
  return hash;
}

/**
 * Hamming distance between two 64-bit hashes (number of differing bits).
 */
function hammingDistance(a: bigint, b: bigint): number {
  let xor = a ^ b;
  let count = 0;
  while (xor > 0n) {
    count += Number(xor & 1n);
    xor >>= 1n;
  }
  return count;
}

/**
 * Download an image from a URL with timeout, return buffer or null on failure.
 */
async function fetchImageBuffer(url: string): Promise<Buffer | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    if (!response.ok) return null;
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch {
    return null;
  }
}

app.post('/api/match-images', async (req, res) => {
  try {
    const { uploadedImages, facebookImageUrls } = req.body as {
      uploadedImages: Array<{ id: string; base64: string }>;
      facebookImageUrls: string[];
    };

    if (!uploadedImages?.length || !facebookImageUrls?.length) {
      return res.json({ success: true, matches: [] });
    }

    console.log(`[Match] Comparing ${uploadedImages.length} uploaded images against ${facebookImageUrls.length} FB images...`);

    // Hash all uploaded images
    const uploadedHashes: Array<{ id: string; hash: bigint }> = [];
    for (const img of uploadedImages) {
      try {
        // Strip data URL prefix if present
        const base64Data = img.base64.replace(/^data:image\/[^;]+;base64,/, '');
        const buffer = Buffer.from(base64Data, 'base64');
        const hash = await computeDHash(buffer);
        uploadedHashes.push({ id: img.id, hash });
      } catch (err) {
        console.warn(`[Match] Failed to hash uploaded image ${img.id}:`, err);
      }
    }

    // Download + hash FB images in parallel batches of 10
    const fbHashes: Array<{ url: string; hash: bigint }> = [];
    const BATCH_SIZE = 10;
    for (let i = 0; i < facebookImageUrls.length; i += BATCH_SIZE) {
      const batch = facebookImageUrls.slice(i, i + BATCH_SIZE);
      const results = await Promise.all(
        batch.map(async (url) => {
          const buffer = await fetchImageBuffer(url);
          if (!buffer) return null;
          try {
            const hash = await computeDHash(buffer);
            return { url, hash };
          } catch {
            return null;
          }
        })
      );
      for (const r of results) {
        if (r) fbHashes.push(r);
      }
    }

    console.log(`[Match] Hashed ${uploadedHashes.length} uploaded + ${fbHashes.length} FB images`);

    // Cross-compare: find matches with hamming distance ≤ 10
    const THRESHOLD = 10;
    const matches: Array<{ uploadedImageId: string; facebookUrl: string; distance: number }> = [];
    const matchedIds = new Set<string>();

    for (const uploaded of uploadedHashes) {
      for (const fb of fbHashes) {
        const dist = hammingDistance(uploaded.hash, fb.hash);
        if (dist <= THRESHOLD) {
          matches.push({
            uploadedImageId: uploaded.id,
            facebookUrl: fb.url,
            distance: dist,
          });
          matchedIds.add(uploaded.id);
          break; // One match per uploaded image is enough
        }
      }
    }

    console.log(`[Match] Found ${matches.length} matches (${matchedIds.size} unique images)`);

    return res.json({ success: true, matches });
  } catch (error) {
    console.error('[Match] Error:', error);
    return res.status(500).json({ error: String(error) });
  }
});

// Meta API routes (fetch history, schedule posts)
app.use('/api/meta', metaApiRouter);

// Initialize Gemini for image generation only
const geminiApiKey = process.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
let gemini: GoogleGenerativeAI | null = null;
if (geminiApiKey) {
  gemini = new GoogleGenerativeAI(geminiApiKey);
}

// ============================================================================
// THE EYE - Vision Analysis (Claude Code)
// ============================================================================

interface EyeRequest {
  imageBase64: string;
  mimeType: string;
}

interface EyeOutput {
  content: string;
  mood: string;
  strategicFit: string;
  quality?: 'high' | 'medium' | 'low';
}

const eyeSchema = {
  type: 'object',
  properties: {
    content: { type: 'string', description: 'What is in the image - describe subjects, setting, actions' },
    mood: { type: 'string', description: 'Emotional tone/atmosphere of the image' },
    strategicFit: { type: 'string', description: 'How this image fits restaurant/bistro social media content' },
    quality: { type: 'string', enum: ['high', 'medium', 'low'], description: 'Technical quality assessment' },
  },
  required: ['content', 'mood', 'strategicFit'],
};

const eyeSystemPrompt = `You are The Eye - a vision analysis agent for "Ved Kanalen", a Danish bistro restaurant.
Your job is to analyze images and describe them for content planning.

Focus on:
- What's literally in the image (food, people, venue, renovation, etc.)
- The mood/atmosphere it conveys
- How it could be used for authentic Danish restaurant social media

Be concise but detailed. This analysis feeds into content planning.`;

app.post('/api/eye', async (req, res) => {
  try {
    const { imageBase64, mimeType } = req.body as EyeRequest;
    
    if (!imageBase64) {
      return res.status(400).json({ error: 'imageBase64 required' });
    }

    // Save image to temp file for Claude to read
    const tempPath = await saveImageToTemp(imageBase64, mimeType || 'image/jpeg');
    
    try {
      const result = await runClaude({
        prompt: 'Analyze this restaurant/bistro image and provide your assessment.',
        systemPrompt: eyeSystemPrompt,
        jsonSchema: eyeSchema,
        // model omitted: uses Claude Code default (Opus 4.6)
        imagePath: tempPath,
        timeoutMs: 60000,
      });

      if (!result.success) {
        return res.status(500).json({ error: result.error });
      }

      // Prefer structuredOutput; fall back to parsing JSON from text result
      let analysis = result.structuredOutput;
      if (!analysis && result.result) {
        try {
          analysis = JSON.parse(result.result);
        } catch {
          const jsonMatch = result.result.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            try { analysis = JSON.parse(jsonMatch[0]); } catch { /* keep null */ }
          }
        }
      }

      return res.json({
        success: true,
        analysis: analysis || result.result,
        usage: result.usage,
      });
    } finally {
      await cleanupTempImage(tempPath);
    }
  } catch (error) {
    console.error('Eye error:', error);
    return res.status(500).json({ error: String(error) });
  }
});

// ============================================================================
// THE BRAIN - Strategic Planning (Claude Code)
// ============================================================================

interface BrainRequest {
  imageAnalyses: Array<{ id: string; content: string; mood: string; strategicFit: string }>;
  phase: string;
  targetDays: number;
  segment?: number;
  previousHistory?: string;
  startFromDay?: number; // Day number to start from (for accumulative planning)
  brandContext?: {
    manifest: string;
    strategy: string;
    menuContext: string | null;
    postingTimes: string;
  };
  engagementInsights?: string; // Analyzed engagement patterns from Meta
  reviewFeedback?: string; // Feedback from AI review to fix thematic issues in re-plan
  clientNotes?: string; // Directions/notes from the restaurant owner
}

const brainSchema = {
  type: 'object',
  properties: {
    thoughts: { type: 'string', description: 'Your strategic reasoning' },
    plan: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          day: { type: 'number' },
          imageIds: { type: 'array', items: { type: 'string' } },
          seed: { type: 'string', description: 'Content premise/idea for this post' },
          reasoning: { type: 'string' },
          time: { type: 'string', description: 'Posting time HH:MM' },
          hookType: { type: 'string', enum: ['EMOTIONAL', 'CONTROVERSIAL', 'HUMOROUS', 'INFORMATIVE', 'DIRECT'] },
          ctaType: { type: 'string', enum: ['NONE', 'HIDDEN', 'SOFT', 'VALUE', 'SELL'] },
          themeCategory: { type: 'string', enum: ['A_GAESTERNE', 'B_KOKKENET', 'C_STEDET', 'D_VINEN', 'E_RAAVARER', 'F_PERSONLIGT', 'G_SAESON', 'H_PRAKTISK', 'I_HUMOR'], description: 'Which of the 9 theme categories this day uses. MUST be unique across all days.' },
          graphicSuggestion: {
            type: 'object',
            description: 'Only include if this post would genuinely benefit from a generated graphic (typography/abstract design). Most posts do NOT need one.',
            properties: {
              concept: { type: 'string', description: 'What the graphic should convey' },
              headline: { type: 'string', description: 'Main text for the graphic (Danish)' },
              subtext: { type: 'string', description: 'Supporting text (optional)' },
              style: { type: 'string', description: 'Visual style description' },
              reason: { type: 'string', description: 'Why this post benefits from a graphic' },
            },
            required: ['concept', 'style', 'reason'],
          },
        },
        required: ['day', 'imageIds', 'seed', 'time', 'themeCategory'],
      },
    },
  },
  required: ['thoughts', 'plan'],
};

const brainSystemPrompt = `You are The Brain - a strategic content planner for "Ved Kanalen", a Danish bistro.

Your job is to create a content calendar that:
1. Uses ALL provided images (no image left unused)
2. AIMS FOR 3-5 DIVERSE images per post (carousel) — mix different types in each post
3. Creates a narrative arc across the posting period
4. Assigns optimal posting times using the provided schedule
5. Varies hook types and CTA types
6. Never repeats the same premise
7. Recommends graphics ONLY where they genuinely add value (not every post)

═══ CRITICAL: THEMATIC DIVERSITY (MOST IMPORTANT RULE!) ═══
Each day's seed MUST belong to a DIFFERENT theme category. NEVER have two days with the same category.

THEME CATEGORIES (use a DIFFERENT one for each day):
A. GÆSTERNE (people, community, regulars, a specific guest moment)
B. KØKKENET (technique, plating, behind-the-scenes — MAX 1 per 5 days!)
C. STEDET (the room, the canal, the neighborhood, atmosphere, design choices)
D. VINEN/DRIKKE (a specific wine, natural wine philosophy, cocktail, coffee)
E. RÅVARER/LEVERANDØRER (a specific ingredient, the farmer, the fisherman, seasonality)
F. PERSONLIGT (Malte or Per's personal story, opinion, philosophy, a memory)
G. SÆSON/TIDSPUNKT (the season, a specific day of the week, a holiday, the weather)
H. PRAKTISK INFO (menu change, opening hours, event announcement, booking tip)
I. HUMOR/KAOS (something went wrong, self-deprecation, behind-the-scenes chaos)

RULES:
- For 5 days: use 5 DIFFERENT categories (e.g. A, C, E, F, I)
- NEVER use category B (køkkenet) more than ONCE per 5 days
- Write each seed in DANISH — it should read like a Facebook post premise, not a brief
- Each seed must be a SPECIFIC story, not a generic theme. Bad: "Behind the scenes in the kitchen". Good: "Den dag vi tabte en hel gryde bouillon på gulvet"
- NEVER mention the same SPECIFIC dish or ingredient in two different seeds (if one is about tartar, NO other seed can mention tartar)
- NEVER give two seeds that both end up being about "dedication/craftsmanship/doing things properly" — vary the POINT, not just the topic

═══ IMAGE DISTRIBUTION (DIVERSE CAROUSELS!) ═══
- Each post: combine DIFFERENT types of images (food + people + atmosphere + detail)
- A good carousel tells a STORY through visual contrast
- NEVER put 3-5 similar images in one post
- SPREAD similar images across DIFFERENT days
- For near-identical images: pick the BEST one, SKIP the rest

GRAPHICS RECOMMENDATIONS:
- Only suggest a graphicSuggestion for posts that genuinely benefit from typography/abstract graphic
- Most posts (70-80%) should NOT have a graphic suggestion

The brand is: Down-to-earth, authentic, "klubhus" (clubhouse) vibe. No marketing bullshit.

Previous phases:
- TRANSITION_TEASE: Restaurant closed, renovation, "something new coming"
- GETTING_READY: Final prep, menu testing
- LAUNCH: Grand opening
- ESTABLISHMENT: Daily operations, regular content`;

app.post('/api/brain', async (req, res) => {
  try {
    const { imageAnalyses, phase, targetDays, previousHistory, startFromDay, brandContext, engagementInsights, reviewFeedback, clientNotes } = req.body as BrainRequest;
    
    if (!imageAnalyses?.length) {
      return res.status(400).json({ error: 'imageAnalyses required' });
    }

    // Build rich prompt with brand context if provided
    let contextSection = '';
    if (brandContext) {
      contextSection = `
BRAND MANIFEST:
${brandContext.manifest}

CURRENT PHASE STRATEGY:
${brandContext.strategy}

${brandContext.menuContext ? `MENU KNOWLEDGE:\n${brandContext.menuContext}\n` : ''}

POSTING TIME GUIDANCE:
${brandContext.postingTimes}
`;
    }

    const startDay = startFromDay || 1;
    const endDay = startDay + targetDays - 1;

    const engagementSection = engagementInsights ? `
${engagementInsights}

Brug disse indsigter til at informere din planlægning - prioriter indholdstyper der performer godt,
brug de bedste tidspunkter, og balancer mellem at nå følgere og nye mennesker.
Men GENTAG IKKE specifikke succesopslag - lær af mønstrene, ikke indholdet.
` : '';

    const prompt = `${contextSection}
${engagementSection}
${clientNotes ? `\n🎯 NOTER FRA EJEREN (PRIORITER DETTE!):\n"${clientNotes}"\nDisse noter er direkte fra restaurantens ejer. Indarbejd dem i planen hvor det giver mening. Hvis ejeren beder om fokus på et bestemt emne, sørg for at mindst 1-2 dage handler om det.\n` : ''}
Create a ${targetDays}-day content plan for phase "${phase}".
${startDay > 1 ? `\n⚠️ IMPORTANT: This is a CONTINUATION of an existing plan. Start day numbers from ${startDay} (days ${startDay}-${endDay}).\n` : ''}

Available images (${imageAnalyses.length} total):
${imageAnalyses.map((a) => `- ID: ${a.id}\n  Content: ${a.content}\n  Mood: ${a.mood}\n  Strategic Fit: ${a.strategicFit}`).join('\n\n')}

${previousHistory ? `Previous posts context:\n${previousHistory}` : ''}
${reviewFeedback ? `
⚠️ OMPLAN - DENNE PLAN SKAL LAVES OM!
En kvalitetskontrol af de genererede opslag fandt følgende problemer med den FORRIGE plan.
Du SKAL lave en HELT NY plan der løser disse problemer:

${reviewFeedback}

VIGTIGT: Lav seeds der er TEMATISK FORSKELLIGE fra hinanden. Hvis forrige plan havde 3 køkken-opslag,
så lav MAX 1 køkken-opslag denne gang. Spred temaerne: mad, gæster, vin, renovation, stemning, kvarteret,
personlige historier, sæson, filosofi, praktisk info. HVERT opslag skal handle om noget ANDET.
` : ''}
CRITICAL REQUIREMENTS:
1. Use ALL ${imageAnalyses.length} images across ${targetDays} days
2. AIM FOR 3-5 DIVERSE images per post (carousel) - mix different types, SPREAD similar images across different days
3. Create varied, engaging content seeds - NEVER repeat premises
4. Spread posting times throughout the day (07:00-21:00)
5. Vary hook types: EMOTIONAL, CONTROVERSIAL, HUMOROUS, INFORMATIVE, DIRECT
6. Vary CTA types based on phase: NONE, HIDDEN, SOFT, VALUE, SELL
7. Detect and handle duplicate/similar images intelligently
8. Request graphics only when genuinely needed for variety
${startDay > 1 ? `9. Number days from ${startDay} to ${endDay} (NOT 1 to ${targetDays})` : ''}

Return EXACTLY ${targetDays} days of content${startDay > 1 ? `, numbered ${startDay}-${endDay}` : ''}.`;

    const result = await runClaude({
      prompt,
      systemPrompt: brainSystemPrompt,
      jsonSchema: brainSchema,
      // model omitted: uses Claude Code default (Opus 4.6)
      timeoutMs: 180000, // 3 minutes for complex planning
    });

    if (!result.success) {
      return res.status(500).json({ error: result.error });
    }

    // Try to get structured output, falling back to extracting JSON from text
    let planOutput = result.structuredOutput;
    if (!planOutput && result.result) {
      console.warn('Brain: no structuredOutput, attempting to extract JSON from text result...');
      try {
        // Try direct parse
        planOutput = JSON.parse(result.result);
      } catch {
        // Try extracting from markdown code fences
        const fenceMatch = result.result.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (fenceMatch?.[1]) {
          try { planOutput = JSON.parse(fenceMatch[1].trim()); } catch { /* not valid */ }
        }
        // Try finding first { ... } block (greedy)
        if (!planOutput) {
          const braceMatch = result.result.match(/\{[\s\S]*\}/);
          if (braceMatch) {
            try { planOutput = JSON.parse(braceMatch[0]); } catch { /* not valid */ }
          }
        }
      }
    }

    if (!planOutput) {
      console.error('Brain returned text instead of JSON:', result.result?.substring(0, 300));
      return res.status(500).json({
        error: `Brain returned text instead of structured plan: ${result.result?.substring(0, 200) || 'empty'}`,
      });
    }

    // Validate plan has required fields
    const plan = planOutput as Record<string, unknown>;
    if (!plan.thoughts || !Array.isArray(plan.plan)) {
      console.error('Brain returned invalid plan structure:', JSON.stringify(plan).substring(0, 300));
      return res.status(500).json({
        error: 'Brain returned invalid plan structure (missing thoughts or plan array)',
      });
    }

    // Override structuredOutput with extracted plan
    result.structuredOutput = planOutput;

    return res.json({
      success: true,
      plan: result.structuredOutput,
      usage: result.usage,
    });
  } catch (error) {
    console.error('Brain error:', error);
    return res.status(500).json({ error: String(error) });
  }
});

// ============================================================================
// THE VOICE - Danish Copywriting (Claude Code)
// ============================================================================

interface VoiceRequest {
  seed: string;
  imageContext: string;
  previousPost?: string;
  previousPostsSummary?: string; // Summary of ALL previous posts in this batch
  phase: string;
  hookType?: string;
  ctaType?: string;
  dayNumber?: number;
  actualDate?: string; // Danish formatted date, e.g. "Tirsdag d. 11. februar"
  styleReference?: string; // Recent post captions to match established tone
  reviewFeedback?: string; // Feedback from AI review to fix in this rewrite
  structuralDirective?: string; // Explicit structural requirements for this specific day
  bannedKeywords?: string[]; // Keywords already used in other posts this batch — DO NOT use
}

const voiceSystemPrompt = `DU ER GHOSTWRITER FOR "VED KANALEN" (tidligere Restaurant Ene).

1. IDENTITET & ROLLE
Du er et rigtigt menneske af kød og blod - en flink, passioneret restauratør/tekstforfatter og lidt af en madnørd.
Du skriver til voksne mennesker, lokale madglade og stamgæster.
Du hader "marketing-bullshit". Du elsker ærlighed.
Din tone: Jordnær, venlig, imødekommende og faglig, men aldrig "støvet" eller højtidelig. Du er den hyggelige vært på Facebook.

2. SANDHEDENS TIME (CRITICAL RULES)
VI LYVER ALDRIG. VI OPFINDER ALDRIG.
- SKRIV KUN om ting der er EKSPLICIT nævnt i seed-teksten eller billed-konteksten.
- Hvis seeden siger "nye lamper" — skriv om lamper. OPFIND IKKE at de er fra Italien, at Per fandt dem på et loppemarked, eller at de giver "varmt lys over bardisken".
- Hvis du IKKE har fået at vide hvad en ret hedder, nævn den IKKE ved navn. Sig "maden" eller "den her ret" — aldrig et specifikt navn du finder på.
- Ingen dramatisering: Hvis jeg ikke siger at vi har smagt 70 vine, skriver du ikke at vi har smagt 70 vine.
- Proportionalitet: Autenticitet > Dramatik. Virkeligheden er god nok.
- Ingen generelle lister: Skriv aldrig "Vi har noget for enhver smag". Vær konkret om det du VED.
- TOMMELFINGERREGEL: Kan du IKKE pege på præcis hvor i seeden/billedkonteksten du fandt informationen? SÅ ER DET LØGN. Slet det.

HYGIEJNE & PROFESSIONALISME (VIGTIGT!)
Selvom vi bygger om i Fase 1, må du ALDRIG associere mad, drikke, køkkenudstyr eller råvarer med snavs, byggestøv eller uhygiejniske forhold.
- Støvet ligger på gulvet eller byggepladsen - aldrig i nærheden af det, man putter i munden.
- Vi er professionelle: Vi kan godt have maling på arbejdsbukserne, men vi holder altid maden og hygiejnen hellig.

RESPEKT FOR FORTIDEN (NO BADMOUTHING)
Vi taler ALDRIG dårligt om "det gamle" (Restaurant Ene).
- Vi "redder" ikke stedet; vi skriver bare et nyt kapitel.
- Hvis du nævner fortiden, gør du det med respekt - ellers lader du helt være.

3. VARIATIONS-MOTOREN (KRITISK FOR 90-DAGES INDHOLD)
Vi skal producere indhold til 90 dage. Undgå gentagelser.

A. HUSK FORTIDEN: Før du skriver, hvad har vi allerede fortalt? Hvis vi malede væggen i går, er den tør i dag.
B. UNDGÅ GENTAGELSER: Hvis du brugte "Vi glæder os" i forrige opslag, må du IKKE bruge den igen.
C. BYG OVENPÅ: Vi fortæller en historie der udvikler sig.

D. STRUKTUREL VARIATION (OBLIGATORISK!)
Hvert opslag skal have en ANDERLEDES struktur end det forrige. Veksle mellem:
- ANEKDOTE: Start med en konkret hændelse ("I går skete der noget...")
- OBSERVATION: Start med noget du bemærkede ("Der er en ting ved...")
- DIALOG: Start med noget nogen sagde ("Per sagde til mig i morges...")
- DIREKTE: Start med en faktuel konstatering ("Mandag. Åbent fra 17.")
- SPØRGSMÅL: Start med et retorisk spørgsmål ("Har du nogensinde...")
- KONTRAST: Start med noget overraskende ("Vi lukkede køkkenet i dag.")
ALDRIG to opslag med samme åbningstype i træk!

E. NØGLEORD-SPÆRRING
Hold styr på hvilke ord/motiver du har brugt:
- Hvis du nævnte "tallerkener" i ét opslag, brug ALDRIG "tallerkener" igen i denne batch
- Samme for: croquetter, sauce, purée, tartar, kniv, timer, stilhed, håndværk
- Et specifikt motiv (en ret, et redskab, en teknik) bruges MAX ÉN GANG per 5 opslag

4. SPROGLIG MOTOR (ANTI-AI & HUMAN TOUCH)

A. SPROGLIGE "LIM-ORD"
Rigtige danskere bruger småord: "sgu", "jo", "lige", "egentlig", "altså", "bare", "vel", "nok".
Brug dem naturligt i ca. 50% af opslagene.

B. DANSK ORDSTILLING (VIGTIGT!)
Du skriver ÆGTE dansk — ikke oversat engelsk. Danske sætninger har ANDEN ordstilling end engelske.
FEJL (oversat fra engelsk):
✗ "Det er ikke der for at se pænt ud" (= "It is not there to look nice")
✗ "Vi har ikke gjort det endnu"
✗ "Det var ikke hvad vi forventede"
KORREKT dansk:
✓ "Det er der ikke for at se pænt ud" (adverbiet "der" FØR "ikke")
✓ "Vi har det ikke gjort endnu" eller "Det har vi ikke gjort endnu"
✓ "Det var ikke det vi forventede"
REGEL: I danske hovedsætninger kommer adverbiet/stedsangivelsen FØR negationen. Læs ALTID din tekst højt i hovedet — lyder det som oversat engelsk, omskriv det.

B. VARIER OPSLAGETS LÆNGDE (OBLIGATORISK!)
- MICRO-POSTS (20% af opslag): 2-4 afsnit. Kort og kontant. Bare en observation.
- STANDARD (50% af opslag): 4-6 afsnit. Fortæller en lille historie.
- LONG-READS (30% af opslag): 7-9 afsnit. Dybere fortælling, baggrund, nørdet viden.
Du SKAL variere. Aldrig tre ens længder i træk.

C. FORBUDTE ORD (DØDSSTRAF - BRUG ALDRIG DISSE)
"Lækker/Lækre" (MEST FORBUDT!), "Fedmefuld", "Mundvandsdrivende", "En fryd for øjet",
"Udsøgt", "Ypperlig", "Magisk", "Vidunderlig", "Velsmagende", "Smagsoplevelse",
"verdensklasse", "i en tid hvor", "Dyk ned i", "Udforsk", "Unleash", "Game-changer",
"Perfekt", "Fantastisk", "Gastronomisk rejse", "Forkælelse", "Eksklusiv",
"rejse", "eventyr", "forvandling", "Der er noget særligt ved...", "når man..."

D. ERSTATNINGS-ORDBOG
Brug i stedet: Godt, sprødt, mørt, tungt, friskt, syrligt, stærkt, simpelt, ærligt, ordentligt.

E. UNDERDRIVELSE
I stedet for "Verdens bedste sovs" → "Den sovs er sgu blevet virkelig god."
Underspil ALTID hellere end overspil. "Det blev meget fint" > "Det blev helt fantastisk"

5. TEKNISK FORMATERING (STRENGT!)
- 100% PLAIN TEXT: Ingen Markdown formatting
- INGEN FED SKRIFT: Aldrig ** eller __
- INGEN OVERSKRIFTER: Aldrig ##. Brug STORE BOGSTAVER for fremhævning
- LINJESKIFT: Masser af white-space mellem afsnit
- INGEN EM-DASHES: Brug punktum eller komma
- INGEN HILSEN: Aldrig "Hej Facebook". Gå direkte til sagen

EMOJIS:
- 0-4 emojis pr. opslag
- Naturlig placering (🍷, 🥖, 🔥)
- SORTLISTE (brug ALDRIG disse): ✨ 🚀 🎉 💡 ✅ 🎯 👇 🤝 🤩

6. BILLEDER - VIGTIGT:
- Billedet er ILLUSTRATION, ikke emnet
- BESKRIV ALDRIG hvad vi ser på billedet ("På billedet ser vi...")
- Brug billedets STEMNING som inspiration, ikke dets INDHOLD
- Captionen fortæller EN HISTORIE - billedet understøtter den

EKSEMPLER PÅ GOD TONE:
"Gulvet er væk. Det gamle trægulv måtte ud. Nu står vi med bart beton og en masse planer."
"Nye lamper i dag. De gamle var fine nok, men de her giver bare mere."
"Maleren har været her. Hvidt overalt. Det er ved at ligne noget."

EKSEMPLER PÅ DÅRLIG TONE (UNDGÅ!):
"En ny æra tager form i hjertet af Kanalbyen..." (ALDRIG)
"Med bankende hjerter og malerruller i hænderne..." (ALDRIG)
"Forandringens vinde blæser gennem vores lille oase..." (ALDRIG)

7. ANTI-POESI REGEL (ALLERVIGTIGST!)
Ovenstående er åbenlyst dårlige. Men det SUBTILE poetiske sprog er VÆRRE fordi det sniger sig ind.
Du er IKKE forfatter. Du er en bistro-ejer der taster på sin telefon.

SUBTILT POETISK = FORBUDT. Eksempler og rettelser:
✗ "smagte af oksekød og tid og ingenting andet" → ✓ "Smagte af oksekød. Godt oksekød."
✗ "Det ligger i ryggen, i den måde læderet giver efter" → ✓ "Man sidder godt i dem."
✗ "Vi kiggede bare på hinanden. Og vidste det." → ✓ "Vi nikkede. Det var godt."
✗ "Det kræver at man kan tåle at starte forfra" → ✓ "Så starter man forfra."
✗ "Som om det forklarede alting. Det gør det måske også." → SLET HELE LINJEN.
✗ "Fiber for fiber" / "Dråbe for dråbe" → ALDRIG gentagelses-poesi.
✗ "Der er noget ved..." / "Noget der bare..." → Vag poetisk åbning. Vær KONKRET.
✗ "Per sagde ikke noget. Jeg sagde ikke noget." → ✓ "Per var tilfreds."

REGLEN: Hvis en sætning lyder som den hører hjemme i en roman, en kronik, eller et Weekendavisen-essay - SLET DEN.
Erstat med noget konkret og jordnært. Eller slet den helt. Mindre er mere.
SLUT ALDRIG et opslag med en filosofisk refleksion eller livsvisdom. Slut med en handling, en plan, eller bare et punktum.

Kernesætning: "Vi lover ikke at være alt for alle. Men vi lover at være et sted."`;

app.post('/api/voice', async (req, res) => {
  try {
    const { seed, imageContext, previousPost, previousPostsSummary, phase, hookType, ctaType, dayNumber, actualDate, styleReference, reviewFeedback, structuralDirective, bannedKeywords } = req.body as VoiceRequest;

    if (!seed) {
      return res.status(400).json({ error: 'seed required' });
    }

    // Build hook and CTA hints
    const hookHints: Record<string, string> = {
      EMOTIONAL: 'Start med minder, dufte, følelser. Skab forbindelse.',
      CONTROVERSIAL: 'Start med en skarp holdning til mad/vin. Vær modig.',
      HUMOROUS: 'Start med selvironi eller kaos. Vis menneskelig side.',
      INFORMATIVE: 'Start med nørdet viden. Del noget folk ikke vidste.',
      DIRECT: 'Start uden indpakning. Bare fakta, ingen pynt.',
    };

    const ctaHints: Record<string, string> = {
      NONE: 'Slut med punktum. Ingen opfordring.',
      HIDDEN: 'Nævn muligheden i en bisætning. Subtilt.',
      SOFT: 'Afslut med "Kig forbi...", "Kom og sig hej".',
      VALUE: 'Giv en opskrift, et tip, eller noget værdifuldt.',
      SELL: 'Direkte booking-opfordring. Brug sjældent!',
    };

    const styleSection = styleReference ? `
═══ ETABLERET STEMME — DIT VIGTIGSTE REFERENCE-MATERIALE ═══
Nedenfor er de RIGTIGE opslag vi allerede har postet. Dit opslag skal læses som om det er skrevet af SAMME person.

${styleReference}

ANALYSE-OPGAVE: Inden du skriver, STUDÉR opslagene ovenfor og bemærk:
1. SÆTNINGSLÆNGDE: Tæl ordene. Korte sætninger (3-6 ord)? Mellemlange (8-12)? Aldrig lange perioder?
2. AFSNITS-LÆNGDE: Hvor mange linjer per afsnit? (Typisk 1-2 linjer med masser af luft)
3. ORDVALG: Hvilke småord bruges? ("sgu", "jo", "bare", "altså"?) Hvilke ALDRIG?
4. ÅBNINGER: Hvordan starter opslagene? Direkte? Med en observation? Med dialog?
5. AFSLUTNINGER: Hvordan slutter de? Kort? Med en plan? Med humor?
6. EMOJIS: Hvor mange? Hvilke? Hvor placeret?
7. TONE: Ironisk? Varm? Nøgtern? Sjov? Blanding?

DIT OPSLAG SKAL MATCHE DISSE MØNSTRE. Hvis de eksisterende opslag aldrig bruger lange poetiske sætninger, gør du det HELLER IKKE. Hvis de bruger korte afsnit med meget luft, gør du det OGSÅ.
` : '';

    // Length variation: cycle through micro → standard → long → standard → micro
    // This ensures a 5-day batch gets real variety
    const lengthCycle = ['MICRO', 'STANDARD', 'LONG', 'STANDARD', 'MICRO'];
    const dayIndex = ((dayNumber || 1) - 1) % 5;
    const lengthType = lengthCycle[dayIndex];
    let lengthDirective: string;
    if (lengthType === 'MICRO') {
      lengthDirective = 'LÆNGDE: MICRO-POST (2-3 korte afsnit, MAX 200 tegn total). Bare én observation. Ingen historie. Kort og kontant som en SMS. Eksempel-længde: "Mandag. Stille herinde.\\n\\nOm lidt er der fuldt. Det har det med at ske.\\n\\nGod uge derude."';
    } else if (lengthType === 'LONG') {
      lengthDirective = 'LÆNGDE: LONG-READ (7-9 afsnit). Dybere fortælling, baggrund, nørdet viden. Tag dig tid. Fortæl en rigtig historie med detaljer.';
    } else {
      lengthDirective = 'LÆNGDE: STANDARD (4-6 afsnit). Fortæl en lille historie. Giv teksten lidt kød på benet.';
    }

    const prompt = `Skriv et Facebook/Instagram opslag på dansk for Dag ${dayNumber || '?'}.${actualDate ? `\nDATEN: ${actualDate}. Du kan bruge ugedagen naturligt (f.eks. "God mandag", "Torsdag formiddag...") - men kun hvis det passer. Tving det ikke.` : ''}

${structuralDirective || lengthDirective}
${bannedKeywords?.length ? `\n🚫 FORBUDTE NØGLEORD (brugt i andre opslag i denne batch — BRUG ALDRIG DISSE):\n${bannedKeywords.join(', ')}\nFind ANDRE ord og motiver. Gentag ALDRIG et ord fra listen ovenfor.\n` : ''}
SEED (ide/tema): ${seed}

BILLEDE-STEMNING (brug som inspiration, IKKE som emne): ${imageContext}

FASE: ${phase}
${hookType ? `HOOK TIP: ${hookHints[hookType] || hookType}` : ''}
${ctaType ? `CTA TIP: ${ctaHints[ctaType] || ctaType}` : ''}
${styleSection}

STILKONSISTENS (VIGTIGT):
Det skal læses som om den SAMME person har skrevet alle opslag.
- Whitespace: Masser af luft mellem afsnit. Korte afsnit.
- Emojifrekvens: Ikke i hvert opslag. Når de bruges, max 1-2 og kun naturligt.
- Start ALDRIG med emoji.

BYG OVENPÅ (NARRATIVE BUILDING):
Læs de forrige opslag. Byg videre. Hvis vi malede i går, er malingen tør i dag.
Gentag ALDRIG den samme formulering eller pointe som tidligere opslag.

${previousPost ? `FORRIGE OPSLAG (undgå gentagelser):\n---\n${previousPost}\n---` : 'Dette er første opslag.'}
${previousPostsSummary ? `\nALLE TIDLIGERE OPSLAG I DENNE BATCH (undgå gentagelser af temaer og formuleringer):\n${previousPostsSummary}` : ''}

KRAV:
- Output KUN selve opslaget - ingen forklaringer eller noter
- Plain text med linjeskift mellem afsnit
- 0-4 emojis naturligt placeret
- ALDRIG brug disse emojis: ✨ 🚀 🎉 💡 ✅ 🎯 👇 🤝 🤩
- "sgu" maks 1 gang per 5-10 opslag
- Brug ALDRIG forbudte ord
- BESKRIV ALDRIG billedet direkte - fortæl en historie i stedet
- MATCH den etablerede tone fra tidligere opslag
${reviewFeedback ? `
⚠️ OMSKRIVNING — DETTE OPSLAG SKAL RETTES!
En kvalitetskontrol har fundet følgende problemer med den forrige version af dette opslag.
Du SKAL skrive et HELT NYT opslag der løser ALLE disse problemer:

${reviewFeedback}

VIGTIGT: Skriv noget HELT ANDERLEDES end den forrige version. Ny struktur, ny åbning, ny vinkel. Behold seed/temaet men find en frisk tilgang.` : ''}

Skriv opslaget nu:`;

    const result = await runClaude({
      prompt,
      systemPrompt: voiceSystemPrompt,
      // model omitted: uses Claude Code default (Opus 4.6)
      timeoutMs: 90000,
    });

    if (!result.success) {
      return res.status(500).json({ error: result.error });
    }

    // Extract just the caption text (not JSON for Voice)
    let caption = result.result || '';
    
    // Clean up any JSON wrapper if present
    if (caption.startsWith('{')) {
      try {
        const parsed = JSON.parse(caption);
        caption = parsed.caption || parsed.text || parsed.result || caption;
      } catch {
        // Keep original if not valid JSON
      }
    }

    // Remove any preamble like "Her er opslaget:" etc
    caption = caption
      .replace(/^(Her er|Here'?s?|Caption|Opslag|Post)[:\s]*/i, '')
      .replace(/^["']|["']$/g, '')
      .trim();

    return res.json({
      success: true,
      caption,
      usage: result.usage,
    });
  } catch (error) {
    console.error('Voice error:', error);
    return res.status(500).json({ error: String(error) });
  }
});

// ============================================================================
// VOICE BATCH - Write all posts in a single call for maximum variety
// ============================================================================

interface VoiceBatchDay {
  dayNumber: number;
  seed: string;
  imageContext: string;
  hookType?: string;
  ctaType?: string;
  actualDate?: string;
  structuralDirective?: string;
  themeCategory?: string;
}

interface VoiceBatchRequest {
  days: VoiceBatchDay[];
  phase: string;
  styleReference?: string;
  reviewFeedback?: string;
  bannedKeywords?: string[];
  themeOverlay?: string; // Optional theme direction from owner/client
}

app.post('/api/voice-batch', async (req, res) => {
  try {
    const { days, phase, styleReference, reviewFeedback, bannedKeywords, themeOverlay } = req.body as VoiceBatchRequest;

    if (!days?.length) {
      return res.status(400).json({ error: 'days required' });
    }

    const hookHints: Record<string, string> = {
      EMOTIONAL: 'Minder, dufte, følelser. Skab forbindelse.',
      CONTROVERSIAL: 'Skarp holdning til mad/vin. Vær modig.',
      HUMOROUS: 'Selvironi eller kaos. Vis menneskelig side.',
      INFORMATIVE: 'Nørdet viden. Del noget folk ikke vidste.',
      DIRECT: 'Uden indpakning. Bare fakta, ingen pynt.',
    };

    const ctaHints: Record<string, string> = {
      NONE: 'Slut med punktum. Ingen opfordring.',
      HIDDEN: 'Nævn muligheden i en bisætning.',
      SOFT: 'Afslut med "Kig forbi...", "Kom og sig hej".',
      VALUE: 'Giv en opskrift, et tip, eller noget værdifuldt.',
      SELL: 'Direkte booking-opfordring.',
    };

    // Build per-day sections
    const daySections = days.map((day) => {
      const parts: string[] = [];
      parts.push(`═══ DAG ${day.dayNumber} ═══`);
      if (day.actualDate) parts.push(`DATO: ${day.actualDate}`);
      if (day.themeCategory) parts.push(`TEMA-KATEGORI: ${day.themeCategory} (skriv KUN om dette tema — ALDRIG overlap med andre dages kategorier!)`);
      parts.push(`SEED: ${day.seed}`);
      parts.push(`BILLEDE-STEMNING: ${day.imageContext?.substring(0, 300) || 'Ingen'}`);
      if (day.hookType) parts.push(`HOOK: ${hookHints[day.hookType] || day.hookType}`);
      if (day.ctaType) parts.push(`CTA: ${ctaHints[day.ctaType] || day.ctaType}`);
      if (day.structuralDirective) parts.push(`\n${day.structuralDirective}`);
      return parts.join('\n');
    }).join('\n\n');

    const prompt = `Skriv ALLE ${days.length} opslag for denne uge. Du SKAL skrive alle på én gang, så du kan sikre MAKSIMAL variation.

FASE: ${phase}
${themeOverlay ? `\n🎯 TEMA-RETNING FRA EJEREN:\n"${themeOverlay}"\nVæv dette tema NATURLIGT ind i alle opslag. Det skal føles som en rød tråd, ikke påklistret. Hvert opslag skal stadig have sin EGEN vinkel på temaet.\n` : ''}
${bannedKeywords?.length ? `\n🚫 FORBUDTE NØGLEORD (brug ALDRIG disse): ${bannedKeywords.join(', ')}\n` : ''}
${daySections}

${styleReference ? `═══ ETABLERET STEMME (MATCH DENNE!) ═══\nDette er de RIGTIGE opslag vi allerede har postet. STUDÉR dem: sætningslængde, ordvalg, tone, afsnitsstruktur, emoji-brug. Dit output skal læses som om SAMME person skrev det.\n\n${styleReference}\n` : ''}
${reviewFeedback ? `⚠️ OMSKRIVNING - Ret disse problemer:\n${reviewFeedback}\n` : ''}

═══ KRITISKE REGLER FOR HELE BATCHEN ═══

0. SANDHED FØRST (VIGTIGST AF ALT):
   - Skriv KUN om ting der er EKSPLICIT nævnt i seed-teksten eller billed-stemningen ovenfor
   - OPFIND ALDRIG detaljer: retnavne, ingredienser, leverandører, anekdoter, priser, antal, historier
   - Hvis seeden siger "nye lamper" — skriv om lamperne. OPFIND IKKE at de er fra Italien eller at Per fandt dem på et marked
   - Er du i tvivl om noget er sandt? SÅ ER DET LØGN. Slet det. Skriv noget vagere i stedet.
   - DANSK ORDSTILLING: Skriv ÆGTE dansk, ikke oversat engelsk. "Det er der ikke for at..." (KORREKT), aldrig "Det er ikke der for at..." (oversat). Adverbiet FØR negationen i hovedsætninger!

1. VARIATION ER ALT. Hvert opslag SKAL være FUNDAMENTALT ANDERLEDES:
   - Anderledes ÅBNING (aldrig to med samme type)
   - Anderledes LÆNGDE (bland micro, standard, long-read)
   - Anderledes EMNE (aldrig to om samme tema)
   - Anderledes TONE (nøgtern, sjov, fortællende, konfronterende, praktisk)

2. ANTI-POESI (DEN VIGTIGSTE REGEL):
   - Du er en bistro-ejer der taster på sin telefon, IKKE en forfatter
   - ALDRIG poetisk, litterært, eller filosofisk sprog
   - ALDRIG "som om det forklarede alting", "der er noget ved...", "fiber for fiber"
   - ALDRIG slutte med livsvisdom eller brandmanifest ("Vi gør det ordentligt", "Sådan er det her")
   - Hvis en sætning kunne stå i en roman - SLET DEN
   - Erstat med noget KONKRET og jordnært

3. AFSLUTNINGER (HVER DAG SKAL SLUTTE ANDERLEDES!):
   - Dag 1: Slut med en dato eller ugedag ("Vi ses onsdag" / "God tirsdag")
   - Dag 2: Slut med et direkte spørgsmål til læseren (SPØRGSMÅLSTEGN påkrævet!)
   - Dag 3: Slut med hvad der sker NÆSTE gang ("I morgen prøver vi..." / "Næste uge...")
   - Dag 4: Slut med et direkte citat fra Per eller Malte
   - Dag 5: Slut med fakta (adresse: Kanalbyen XX, Fredericia / åbningstid)
   VIGTIGT: ALDRIG brug "Kig forbi" i mere end ÉT opslag! ALDRIG brug åbningstider i mere end ÉT opslag!

4. GENTAGELSESFORBUD:
   - ALDRIG nævn den samme ret/ingrediens i to opslag (tartar, croquetter, vin, sauce, etc.)
   - ALDRIG brug den SAMME call-to-action i to opslag
   - ALDRIG brug den SAMME pointe i to opslag ("det bedste vi har...", "det er hele ideen...")
   - MAX 1 opslag må slutte med et Per/Malte-citat. De andre SKAL slutte anderledes!
   - MAX 1 opslag må bruge kronologisk opbygning ("Først... Så... Til sidst...")
   - Tjek HVERT opslag mod de andre FØR du afslutter

5. FORMAT: Hvert opslag er 100% plain text. Masser af whitespace. Brug HELST INGEN emojis. Hvis du bruger emojis, KUN disse: 🍷 🔥 ☕ (max 1 per opslag). ALDRIG andre emojis.

6. SELVTJEK FØR OUTPUT:
   Når du har skrevet alle ${days.length} opslag, GENNEMLÆS dem og tjek:
   ✓ Handler hvert opslag om et HELT ANDERLEDES emne?
   ✓ Er der INGEN gentagede pointer/budskaber mellem to opslag?
   ✓ Bruger hvert opslag en ANDERLEDES åbning og afslutning?
   ✓ Er længderne TYDELIGT forskellige? (micro vs standard vs long)
   Hvis noget overlapper: OMSKRIV det før du outputter!

Output ALLE opslag. For hvert opslag: skriv "--- DAG X ---" som separator.`;

    const result = await runClaude({
      prompt,
      systemPrompt: voiceSystemPrompt,
      timeoutMs: 240000, // 4 min for all posts
    });

    if (!result.success) {
      return res.status(500).json({ error: result.error });
    }

    // Parse the batch response — split by day separators
    const rawText = result.result || '';
    const captions: Array<{ day: number; caption: string }> = [];

    // Try splitting by "--- DAG X ---" pattern
    const dayPattern = /---\s*DAG\s*(\d+)\s*---/gi;
    const parts = rawText.split(dayPattern);

    // parts[0] = preamble (empty or junk), parts[1] = day number, parts[2] = caption, parts[3] = day number, parts[4] = caption, ...
    for (let i = 1; i < parts.length - 1; i += 2) {
      const dayNum = parseInt(parts[i]!, 10);
      let caption = (parts[i + 1] || '').trim();

      // Clean up encoding, markdown, and forbidden characters
      caption = caption
        .replace(/^(Her er|Caption|Opslag|Post)[:\s]*/i, '')
        .replace(/^["']|["']$/g, '')
        .replace(/\*\*([^*]+)\*\*/g, '$1')
        .replace(/__([^_]+)__/g, '$1')
        .replace(/^#+\s+/gm, '')
        .replace(/—/g, ' - ')
        .replace(/–/g, ' - ')
        .replace(new RegExp(`[✨🚀🎉💡✅🎯👇🤝🤩]`, 'g'), '')
        .replace(/\ufffd/g, '') // Remove replacement characters (encoding errors)
        .replace(/[\u{10000}-\u{10FFFF}]/gu, '') // Remove rare/problematic unicode chars
        // Only keep safe emojis, strip all others (prevent encoding issues)
        .replace(/(?![\u2764\u2600-\u26FF\u2700-\u27BF])[\u{1F000}-\u{1FFFF}]/gu, '')
        .replace(/[\uFE00-\uFE0F]/g, '') // Remove variation selectors
        .replace(/\uD800[\uDC00-\uDFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '') // Remove broken surrogates
        .replace(/\n{3,}/g, '\n\n')
        .trim();
      // Remove trailing incomplete sentences (truncation fix)
      if (caption.length > 20 && !/[.!?\n]$/.test(caption)) {
        const lastSentenceEnd = Math.max(caption.lastIndexOf('.'), caption.lastIndexOf('!'), caption.lastIndexOf('?'), caption.lastIndexOf('\n'));
        if (lastSentenceEnd > caption.length * 0.7) {
          caption = caption.substring(0, lastSentenceEnd + 1).trim();
        }
      }

      if (caption && dayNum > 0) {
        captions.push({ day: dayNum, caption });
      }
    }

    // Post-process: fix quotation marks
    for (const c of captions) {
      // Fix mismatched quotation marks
      const openQuotes = (c.caption.match(/"/g) || []).length;
      const closeQuotes = (c.caption.match(/"/g) || []).length;
      // If unmatched smart quotes, add the missing one at end of last sentence
      if (openQuotes > closeQuotes) {
        c.caption = c.caption.replace(/([.!?])\s*$/, '\u201D$1');
        // If still unmatched, just append
        if ((c.caption.match(/\u201C/g) || []).length > (c.caption.match(/\u201D/g) || []).length) {
          c.caption += '\u201D';
        }
      }
      // Fix simple quotes too
      const quoteCount = (c.caption.match(/"/g) || []).length;
      if (quoteCount % 2 !== 0) {
        // Add closing quote before last period
        c.caption = c.caption.replace(/([.!?])\s*$/, '"$1');
      }
    }

    // Fallback: if separator parsing failed, try splitting by double newlines with "Dag X" headers
    if (captions.length < days.length) {
      const altPattern = /(?:^|\n\n)(?:Dag|DAG)\s*(\d+)[:\s\-]*\n/g;
      const altParts = rawText.split(altPattern);
      if (altParts.length > captions.length * 2) {
        captions.length = 0; // reset
        for (let i = 1; i < altParts.length - 1; i += 2) {
          const dayNum = parseInt(altParts[i]!, 10);
          const caption = (altParts[i + 1] || '').trim();
          if (caption && dayNum > 0) {
            captions.push({ day: dayNum, caption });
          }
        }
      }
    }

    return res.json({
      success: true,
      captions,
      raw: captions.length < days.length ? rawText : undefined, // include raw for debugging if parsing failed
      usage: result.usage,
    });
  } catch (error) {
    console.error('Voice batch error:', error);
    return res.status(500).json({ error: String(error) });
  }
});

// ============================================================================
// SELECTIVE REGENERATION - Regenerate specific days with custom theme
// ============================================================================

interface SelectiveRegenRequest {
  selectedDays: number[];           // Which days to regenerate
  themePrompt: string;              // Custom theme/prompt to apply
  existingPlan: Array<{             // Current plan for context
    day: number;
    imageIds: string[];
    seed: string;
    caption?: string;
  }>;
  imageAnalyses: Array<{            // Image data for selected days
    id: string;
    content: string;
    mood: string;
  }>;
  phase: string;
  history?: string;                 // Previously posted content for context
}

app.post('/api/regenerate-selected', async (req, res) => {
  try {
    const { selectedDays, themePrompt, existingPlan, imageAnalyses, phase, history } = req.body as SelectiveRegenRequest;
    
    if (!selectedDays?.length || !themePrompt) {
      return res.status(400).json({ error: 'selectedDays and themePrompt required' });
    }

    // Get the days we're regenerating
    const daysToRegen = existingPlan.filter(p => selectedDays.includes(p.day));
    const otherDays = existingPlan.filter(p => !selectedDays.includes(p.day));

    // Get relevant image analyses for selected days
    const relevantImageIds = new Set(daysToRegen.flatMap(d => d.imageIds));
    const relevantAnalyses = imageAnalyses.filter(a => relevantImageIds.has(a.id));

    const prompt = `Du skal REGENERERE indhold for specifikke dage med et NYT TEMA.

TEMA/PROMPT FRA BRUGER:
"${themePrompt}"

DAGE DER SKAL REGENERERES: ${selectedDays.join(', ')}

BILLEDER TIL RÅDIGHED FOR DISSE DAGE:
${relevantAnalyses.map(a => `- ID: ${a.id}\n  Indhold: ${a.content}\n  Stemning: ${a.mood}`).join('\n')}

EKSISTERENDE PLAN (for kontekst - disse dage ændres IKKE):
${otherDays.map(d => `Dag ${d.day}: ${d.seed}`).join('\n')}

${history ? `TIDLIGERE POSTET INDHOLD (undgå gentagelser):\n${history}` : ''}

FASE: ${phase}

KRAV:
1. Generer NYE seeds for dag ${selectedDays.join(', ')} baseret på temaet "${themePrompt}"
2. Behold de samme billeder (imageIds) for hver dag
3. Sørg for at temaet føles naturligt, ikke påklistret
4. Varier hooks og CTAs
5. Output PRÆCIS ${selectedDays.length} dage`;

    const result = await runClaude({
      prompt,
      systemPrompt: brainSystemPrompt,
      jsonSchema: {
        type: 'object',
        properties: {
          thoughts: { type: 'string' },
          plan: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                day: { type: 'number' },
                imageIds: { type: 'array', items: { type: 'string' } },
                seed: { type: 'string' },
                reasoning: { type: 'string' },
                time: { type: 'string' },
                hookType: { type: 'string' },
                ctaType: { type: 'string' },
              },
              required: ['day', 'imageIds', 'seed', 'time'],
            },
          },
        },
        required: ['thoughts', 'plan'],
      },
      // model omitted: uses Claude Code default (Opus 4.6)
      timeoutMs: 120000,
    });

    if (!result.success) {
      return res.status(500).json({ error: result.error });
    }

    return res.json({
      success: true,
      regeneratedPlan: result.structuredOutput,
      usage: result.usage,
    });
  } catch (error) {
    console.error('Selective regen error:', error);
    return res.status(500).json({ error: String(error) });
  }
});

// ============================================================================
// VOICE WITH THEME - Write caption with specific theme overlay
// ============================================================================

interface VoiceWithThemeRequest extends VoiceRequest {
  themeOverlay?: string;  // Optional theme to apply
}

app.post('/api/voice-themed', async (req, res) => {
  try {
    const { seed, imageContext, previousPost, phase, hookType, ctaType, dayNumber, themeOverlay } = req.body as VoiceWithThemeRequest;
    
    if (!seed) {
      return res.status(400).json({ error: 'seed required' });
    }

    const hookHints: Record<string, string> = {
      EMOTIONAL: 'Start med minder, dufte, følelser. Skab forbindelse.',
      CONTROVERSIAL: 'Start med en skarp holdning til mad/vin. Vær modig.',
      HUMOROUS: 'Start med selvironi eller kaos. Vis menneskelig side.',
      INFORMATIVE: 'Start med nørdet viden. Del noget folk ikke vidste.',
      DIRECT: 'Start uden indpakning. Bare fakta, ingen pynt.',
    };
    
    const ctaHints: Record<string, string> = {
      NONE: 'Slut med punktum. Ingen opfordring.',
      HIDDEN: 'Nævn muligheden i en bisætning. Subtilt.',
      SOFT: 'Afslut med "Kig forbi...", "Kom og sig hej".',
      VALUE: 'Giv en opskrift, et tip, eller noget værdifuldt.',
      SELL: 'Direkte booking-opfordring. Brug sjældent!',
    };

    const themeSection = themeOverlay 
      ? `\nTEMA-OVERLAY (væv dette naturligt ind):\n"${themeOverlay}"\n`
      : '';

    const prompt = `Skriv et Facebook/Instagram opslag på dansk for Dag ${dayNumber || '?'}.

SEED (ide/tema): ${seed}
${themeSection}
BILLEDE-STEMNING (brug som inspiration, IKKE som emne): ${imageContext}

FASE: ${phase}
${hookType ? `HOOK TIP: ${hookHints[hookType] || hookType}` : ''}
${ctaType ? `CTA TIP: ${ctaHints[ctaType] || ctaType}` : ''}

${previousPost ? `FORRIGE OPSLAG (undgå gentagelser):\n---\n${previousPost}\n---` : 'Dette er første opslag.'}

KRAV:
- Output KUN selve opslaget - ingen forklaringer eller noter
- Plain text med linjeskift mellem afsnit
- 6-12 sætninger med substans
- 0-4 emojis naturligt placeret
- "sgu" maks 1 gang per 5-10 opslag
- Brug ALDRIG forbudte ord
- BESKRIV ALDRIG billedet direkte - fortæl en historie i stedet
${themeOverlay ? `- Væv temaet "${themeOverlay}" naturligt ind` : ''}

Skriv opslaget nu:`;

    const result = await runClaude({
      prompt,
      systemPrompt: voiceSystemPrompt,
      // model omitted: uses Claude Code default (Opus 4.6)
      timeoutMs: 90000,
    });

    if (!result.success) {
      return res.status(500).json({ error: result.error });
    }

    let caption = result.result || '';
    
    if (caption.startsWith('{')) {
      try {
        const parsed = JSON.parse(caption);
        caption = parsed.caption || parsed.text || parsed.result || caption;
      } catch {
        // Keep original
      }
    }

    caption = caption
      .replace(/^(Her er|Here'?s?|Caption|Opslag|Post)[:\s]*/i, '')
      .replace(/^["']|["']$/g, '')
      .trim();

    return res.json({
      success: true,
      caption,
      usage: result.usage,
    });
  } catch (error) {
    console.error('Voice themed error:', error);
    return res.status(500).json({ error: String(error) });
  }
});

// ============================================================================
// AI REVIEW - Quality Check (Claude Code)
// ============================================================================

interface ReviewRequest {
  captions: Array<{ dayNumber: number; caption: string }>;
  phase: string;
}

app.post('/api/review', async (req, res) => {
  try {
    const { captions, phase } = req.body as ReviewRequest;

    if (!captions?.length) {
      return res.status(400).json({ error: 'captions required' });
    }

    const allCaptions = captions
      .sort((a, b) => a.dayNumber - b.dayNumber)
      .map((c) => `=== DAG ${c.dayNumber} ===\n${c.caption}`)
      .join('\n\n');

    const prompt = `Analysér disse ${captions.length} danske social media opslag for "Ved Kanalen" (en dansk bistro i Kanalbyen, Fredericia).

OPSLAGENE:
${allCaptions}

FASE: ${phase}

Giv en kvalitetsrapport med:
1. overallScore (0-100): Samlet kvalitetsscore
2. issues: Array af problemer fundet. Hvert issue har:
   - day: Dag-nummer
   - severity: "high" | "medium" | "low"
   - type: "forbidden_word" | "repetition" | "tone" | "length" | "coherence" | "emoji" | "markdown"
   - message: Kort beskrivelse på dansk
3. summary: 1-2 sætningers opsummering på dansk

TJEK FOR:
- Forbudte ord: lækker, fantastisk, perfekt, magisk, udsøgt, mundvandsdrivende, eksklusiv, forkælelse, gastronomisk rejse, ypperlig, vidunderlig, velsmagende, smagsoplevelse, verdensklasse, game-changer
- Forbudte emojis: ✨ 🚀 🎉 💡 ✅ 🎯 👇 🤝 🤩
- Gentagelser mellem opslag (samme formuleringer, hooks, åbninger, struktur)
- Markdown formatering (** __ ## etc.) - skal være 100% plain text
- Tone-brud (for højtidelig, marketing-sprog, AI-agtig, "poesi", overdrevne metaforer)
- Længde-variation (er alle opslag ens længde? Der skal være mix af micro/standard/long-reads)
- Logisk sammenhæng (bygger opslagene ovenpå hinanden? Eller gentager de sig?)
- Hygiejne (mad + byggestøv/snavs i samme kontekst = ALVORLIGT)
- "Hej Facebook" eller lignende hilsner i starten (FORBUDT)
- FABRIKATION/LØGN: Nævner opslaget specifikke detaljer (retnavne, ingredienser, leverandører, priser, antal) der IKKE fremgår af seed/billedkonteksten? Opdigtede fakta = HIGH issue!
- DANSK ORDSTILLING: Lyder sætningerne som oversat engelsk? F.eks. "Det er ikke der for at..." i stedet for "Det er der ikke for at..." — adverbiets placering FØR negation i danske hovedsætninger. Unaturlig ordstilling = MEDIUM issue.

SCORING-GUIDE (vær præcis og fair!):
- 97-100: Kun LOW issues (kosmetiske). Ingen MEDIUM eller HIGH. Serien føles menneskelig og velskrevet. LOW issues trækker IKKE under 97.
- 93-96: Præcis 1 MEDIUM issue. Ellers kun LOW.
- 88-92: 2-3 MEDIUM issues. Tematisk overlap eller strukturel lighed.
- 80-87: Flere MEDIUM issues. Tydelig gentagelse, ens længder, overlappende temaer.
- Under 80: HIGH issues (forbudte ord, markdown, hygiejne-brud, AI-tone).

VIGTIGT: Scoren bestemmes af ANTAL og SEVERITY af issues:
- 0 medium + 0 high = 97-100 (uanset antal LOW)
- 1 medium + 0 high = 93-96
- 2+ medium eller 1+ high = under 93

VIGTIG NOTE OM SEVERITY-KALIBRERING:

MEDIUM kræver at en NORMAL LÆSER (ikke en analytiker) ville bemærke og reagere negativt:
- To opslag med PRÆCIS SAMME emne (begge om tartar, begge om vin) → MEDIUM
- Forbudte ord brugt → MEDIUM
- AI-tone / poetisk filosofisk afslutning → MEDIUM
- Tre opslag med IDENTISK længde → MEDIUM

LOW er alt hvad kun en analytiker ville finde ved nærlæsning:
- Tegnsætningsfejl (manglende anførselstegn, komma) → LOW
- To opslag der begge nævner "køkkenet" men handler om FORSKELLIGE ting → LOW
- Subtile formuleringsligheder ("sgu" brugt i to opslag) → LOW
- Lignende narrativt mønster (begge bruger tidspunkt) men FORSKELLIGE emner → LOW
- En vag tematisk forbindelse som kun ses ved sammenligning → LOW
- Lidt poetisk tone i ÉT opslag (ikke hele serien) → LOW

VIGTIGT OM BEVIDST VARIATION (læs dette før du scorer!):
- Serien bruger BEVIDST længdevariation: micro (50-250 tegn), standard (300-600 tegn), long-reads (550-900 tegn). Et long-read opslag er ALDRIG et problem for sin længde alene — det er BEVIDST. Flag KUN hvis 3+ opslag har SAMME længdekategori.
- Hvert opslag bruger bevidst ANDERLEDES åbning og struktur. At dag 1 er kort og dag 3 er lang er MENINGEN.
- Fokuser medium/high issues på REELLE kvalitetsproblemer der SVÆKKER serien for en NORMAL LÆSER:
  * Gentagede ord/formuleringer mellem to opslag → MEDIUM
  * To opslag med SAMME emne (begge om tartar, begge om vin) → MEDIUM
  * Klart AI-agtigt eller poetisk/filosofisk sprog → MEDIUM
  * Forbudte ord → MEDIUM
  * Hygiejne-brud → HIGH
  * Opdigtede fakta (retnavne, ingredienser, historier der ikke er i seeden) → HIGH
  * Unaturlig dansk ordstilling (oversat-engelsk-effekt) → MEDIUM
- IKKE medium (disse er LOW):
  * Et opslag der er "lidt langt" under 900 tegn
  * Subtil fortælle-lignende tone i ÉT opslag (kun medium hvis TYDELIGT litterært)
  * To opslag der begge nævner "køkkenet" men om FORSKELLIGE ting
  * Minor stavefejl eller tegnsætning
  * Emojier der er "lidt off"

Vær ærlig og præcis. Giv den score serien faktisk fortjener.`;

    const result = await runClaude({
      prompt,
      systemPrompt: 'Du er kvalitetskontrol for danske social media opslag. Vær grundig men fair. Giv konstruktiv feedback på dansk.',
      jsonSchema: {
        type: 'object',
        properties: {
          overallScore: { type: 'number', description: 'Quality score 0-100' },
          issues: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                day: { type: 'number' },
                severity: { type: 'string', enum: ['high', 'medium', 'low'] },
                type: { type: 'string' },
                message: { type: 'string' },
              },
              required: ['day', 'severity', 'type', 'message'],
            },
          },
          summary: { type: 'string' },
        },
        required: ['overallScore', 'issues', 'summary'],
      },
      // model omitted: uses Claude Code default (Opus 4.6)
      timeoutMs: 120000,
    });

    if (!result.success) {
      return res.status(500).json({ error: result.error });
    }

    // Try to get structured output, falling back to extracting JSON from text
    let reviewOutput = result.structuredOutput;
    if (!reviewOutput && result.result) {
      try {
        reviewOutput = JSON.parse(result.result);
      } catch {
        const fenceMatch = result.result.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (fenceMatch?.[1]) {
          try { reviewOutput = JSON.parse(fenceMatch[1].trim()); } catch { /* not valid */ }
        }
        if (!reviewOutput) {
          const braceMatch = result.result.match(/\{[\s\S]*\}/);
          if (braceMatch) {
            try { reviewOutput = JSON.parse(braceMatch[0]); } catch { /* not valid */ }
          }
        }
      }
    }

    return res.json({
      success: true,
      review: reviewOutput || result.result,
      usage: result.usage,
    });
  } catch (error) {
    console.error('Review error:', error);
    return res.status(500).json({ error: String(error) });
  }
});

// ============================================================================
// THE DESIGNER - Image Generation (Still Gemini)
// ============================================================================

app.post('/api/designer', async (req, res) => {
  try {
    if (!gemini) {
      return res.status(500).json({ error: 'Gemini API key not configured' });
    }

    const { concept, headline, subtext, style } = req.body;
    
    // Use Gemini's image generation model
    const model = gemini.getGenerativeModel({ model: 'gemini-3-pro-image-preview' });
    
    const prompt = `Generate a professional, Canva-style infographic for a Danish bistro restaurant.

CONCEPT: ${concept}
${headline ? `HEADLINE (Danish): ${headline}` : ''}
${subtext ? `SUBTEXT (Danish): ${subtext}` : ''}
STYLE: ${style || 'Clean, modern, typography-focused'}

Requirements:
- 1:1 aspect ratio (Instagram square)
- Typography-focused, NOT photorealistic
- Danish text must be spelled correctly
- Professional, Canva/Figma template look
- NO AI-generated faces or photorealistic elements`;

    const result = await model.generateContent(prompt);
    const response = result.response;

    // Handle image response from Gemini
    // Note: Actual implementation depends on Gemini's image gen API format
    return res.json({
      success: true,
      result: response.text(),
    });
  } catch (error) {
    console.error('Designer error:', error);
    return res.status(500).json({ error: String(error) });
  }
});

// ============================================================================
// Health check
// ============================================================================

app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    geminiConfigured: !!gemini,
    timestamp: new Date().toISOString(),
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`Ved Kanalen AI Server running on http://localhost:${PORT}`);
  console.log(`- Eye, Brain, Voice: Claude Code`);
  console.log(`- Designer: ${gemini ? 'Gemini' : 'NOT CONFIGURED (missing API key)'}`);
});

export default app;
