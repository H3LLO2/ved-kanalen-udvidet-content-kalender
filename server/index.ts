/**
 * Ved Kanalen AI Backend Server
 * 
 * Routes AI tasks to either Claude Code (text/vision) or Gemini (image generation)
 */

import express from 'express';
import cors from 'cors';
import { runClaude, saveImageToTemp, cleanupTempImage, type ClaudeResponse } from './claude-runner.js';
import { GoogleGenerativeAI } from '@google/generative-ai';

const app = express();
const PORT = process.env.PORT || 3002;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' })); // Large limit for base64 images

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
        model: 'sonnet',
        imagePath: tempPath,
        timeoutMs: 60000,
      });

      if (!result.success) {
        return res.status(500).json({ error: result.error });
      }

      return res.json({
        success: true,
        analysis: result.structuredOutput || result.result,
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
  brandContext?: {
    manifest: string;
    strategy: string;
    menuContext: string | null;
    postingTimes: string;
  };
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
        },
        required: ['day', 'imageIds', 'seed', 'time'],
      },
    },
  },
  required: ['thoughts', 'plan'],
};

const brainSystemPrompt = `You are The Brain - a strategic content planner for "Ved Kanalen", a Danish bistro.

Your job is to create a content calendar that:
1. Uses ALL provided images (no image left unused)
2. Groups related images intelligently (1-3 per post)
3. Creates a narrative arc across the posting period
4. Assigns optimal posting times (07:00-19:00)
5. Varies hook types and CTA types
6. Never repeats the same premise

The brand is: Down-to-earth, authentic, "klubhus" (clubhouse) vibe. No marketing bullshit.

Previous phases:
- TRANSITION_TEASE: Restaurant closed, renovation, "something new coming"
- GETTING_READY: Final prep, menu testing
- LAUNCH: Grand opening
- ESTABLISHMENT: Daily operations, regular content`;

app.post('/api/brain', async (req, res) => {
  try {
    const { imageAnalyses, phase, targetDays, previousHistory, brandContext } = req.body as BrainRequest;
    
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

    const prompt = `${contextSection}

Create a ${targetDays}-day content plan for phase "${phase}".

Available images (${imageAnalyses.length} total):
${imageAnalyses.map((a) => `- ID: ${a.id}\n  Content: ${a.content}\n  Mood: ${a.mood}\n  Strategic Fit: ${a.strategicFit}`).join('\n\n')}

${previousHistory ? `Previous posts context:\n${previousHistory}` : ''}

CRITICAL REQUIREMENTS:
1. Use ALL ${imageAnalyses.length} images across ${targetDays} days
2. Group related/similar images (1-3 per post) - carousels get more engagement
3. Create varied, engaging content seeds - NEVER repeat premises
4. Spread posting times throughout the day (07:00-21:00)
5. Vary hook types: EMOTIONAL, CONTROVERSIAL, HUMOROUS, INFORMATIVE, DIRECT
6. Vary CTA types based on phase: NONE, HIDDEN, SOFT, VALUE, SELL
7. Detect and handle duplicate/similar images intelligently
8. Request graphics only when genuinely needed for variety

Return EXACTLY ${targetDays} days of content.`;

    const result = await runClaude({
      prompt,
      systemPrompt: brainSystemPrompt,
      jsonSchema: brainSchema,
      model: 'sonnet',
      timeoutMs: 180000, // 3 minutes for complex planning
    });

    if (!result.success) {
      return res.status(500).json({ error: result.error });
    }

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
  phase: string;
  hookType?: string;
  ctaType?: string;
  dayNumber?: number;
}

const voiceSystemPrompt = `Du er The Voice - ghostwriter for "Ved Kanalen" (tidligere Restaurant Ene), en dansk bistro i Kanalbyen, Fredericia.

KRITISKE REGLER:

1. FORBUDTE ORD (ALDRIG BRUG):
   - "Lækker/Lækre" (MEST FORBUDT!)
   - "Gastronomisk rejse", "Forkælelse", "Eksklusiv"
   - "Mundvandsdrivende", "Udsøgt", "Magisk", "Fantastisk", "Perfekt"

2. BRUG NATURLIGT:
   - Danske fyldord: "sgu", "jo", "lige", "egentlig", "altså"
   - Simple beskrivelser: "godt", "sprødt", "mørt", "ærligt"

3. FORMAT:
   - 100% PLAIN TEXT - ingen markdown, ingen **fed**, ingen ## overskrifter
   - 0-4 emojis, naturligt placeret
   - Masser af whitespace mellem afsnit
   - 5-15 sætninger
   - INGEN hilsner som "Hej Facebook"

4. TONE:
   - Jordnær, venlig, ærlig
   - Som en ven der fortæller om sin restaurant
   - Ingen marketing-bullshit

Kernesætning: "Vi lover ikke at være alt for alle. Men vi lover at være et sted."`;

app.post('/api/voice', async (req, res) => {
  try {
    const { seed, imageContext, previousPost, phase, hookType, ctaType, dayNumber } = req.body as VoiceRequest;
    
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

    const prompt = `Skriv et Facebook/Instagram opslag på dansk for Dag ${dayNumber || '?'}.

SEED (ide): ${seed}

BILLEDE-KONTEKST: ${imageContext}

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

Skriv opslaget nu:`;

    const result = await runClaude({
      prompt,
      systemPrompt: voiceSystemPrompt,
      model: 'sonnet',
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
