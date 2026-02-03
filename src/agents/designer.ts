import { getImageModel, withRateLimit, trackTokens } from '../lib/gemini';
import type { DesignerInput, GraphicRequest } from '../types';

// Brand colors for Ved Kanalen - warm, earthy, Scandinavian
const BRAND_COLORS = {
  darkGreen: '#2D3B2D',    // Primary - forest green
  warmBrown: '#8B7355',    // Secondary - warm wood
  cream: '#F5F0EB',        // Background - warm white
  terracotta: '#D4A574',   // Accent - earthy orange
  charcoal: '#1A1A1A',     // Text - almost black
};

// Graphic types that work well for AI generation
export type GraphicType =
  | 'countdown'      // "5 dage endnu" style
  | 'quote'          // Inspirational text
  | 'announcement'   // Simple announcement
  | 'milestone'      // "100 dage" celebration
  | 'mood'           // Abstract texture/pattern
  | 'minimal';       // Ultra-simple typography

interface DesignerResult {
  success: boolean;
  imageBlob?: Blob;
  description?: string;
  error?: string;
}

// Build a prompt that avoids AI-looking outputs
function buildGraphicPrompt(input: DesignerInput): string {
  const colorPalette = `${BRAND_COLORS.cream} (warm cream background), ${BRAND_COLORS.darkGreen} (forest green), ${BRAND_COLORS.warmBrown} (warm brown), ${BRAND_COLORS.terracotta} (terracotta accent)`;

  // Determine graphic type from style/concept
  const isCountdown = input.concept.toLowerCase().includes('countdown') || input.concept.toLowerCase().includes('dage');
  const isQuote = input.concept.toLowerCase().includes('quote') || input.concept.toLowerCase().includes('citat');
  const isMilestone = input.concept.toLowerCase().includes('milestone') || input.concept.toLowerCase().includes('åbning');

  let styleGuidance = '';

  if (isCountdown) {
    styleGuidance = `
DESIGN TYPE: Countdown/Number Graphic
- Feature a LARGE, BOLD number as the focal point
- Use a modern sans-serif typeface (like Helvetica, Futura, or DIN)
- Number should take up 60-70% of the canvas
- Minimal supporting text below
- Background: solid color or very subtle texture
- Reference style: Swiss/International Typographic Style`;
  } else if (isQuote) {
    styleGuidance = `
DESIGN TYPE: Quote Card
- Center the text with generous whitespace
- Use elegant serif or clean sans-serif typography
- Quote marks should be decorative but subtle
- Background: solid cream or very subtle paper texture
- Reference style: Kinfolk magazine, Cereal magazine aesthetics`;
  } else if (isMilestone) {
    styleGuidance = `
DESIGN TYPE: Milestone/Announcement
- Bold, celebratory typography
- Can use geometric shapes as accents (circles, lines)
- Keep it minimal - one main message
- Background: solid or two-tone color block
- Reference style: Modern event posters, museum announcements`;
  } else {
    styleGuidance = `
DESIGN TYPE: Abstract/Mood Graphic
- Focus on color, shape, and texture
- Use geometric forms: circles, rectangles, organic curves
- Inspired by Scandinavian design: functional, warm, minimal
- Can include subtle textures: paper grain, fabric, concrete
- Reference style: Nordic design studios, Copenhagen aesthetics`;
  }

  const textContent = input.headline
    ? `
TEXT TO INCLUDE (Danish - spell correctly):
${input.headline ? `Main text: "${input.headline}"` : ''}
${input.subtext ? `Supporting text: "${input.subtext}"` : ''}`
    : '\nNO TEXT - pure abstract/geometric design';

  return `Create a social media graphic for a Danish bistro called "Ved Kanalen".

===== CRITICAL: WHAT THIS IS NOT =====
- NOT a photograph
- NOT photorealistic food imagery
- NOT AI-generated looking
- NOT generic stock design
- NOT showing any specific location or building
- NOT showing people or faces
- NO complex scenes or illustrations

===== WHAT THIS IS =====
A TYPOGRAPHY-FOCUSED or ABSTRACT graphic that looks like it was made by a professional graphic designer in Figma or Adobe InDesign.
${styleGuidance}

===== COLOR PALETTE (use these exact tones) =====
${colorPalette}

===== CONCEPT =====
${input.concept}
${textContent}

===== TECHNICAL SPECS =====
- Aspect ratio: 1:1 square (1080x1080 pixels feel)
- Style: ${input.style || 'Scandinavian minimal'}
- High contrast, sharp edges
- If using text: typography must be PERFECTLY crisp and legible

===== QUALITY CHECK =====
Before generating, ensure:
1. A human designer would be proud of this
2. It does NOT look AI-generated
3. Typography (if any) is flawless
4. Colors are from the specified palette
5. Design is simple, not busy

Generate the graphic now.`;
}

export async function generateGraphic(input: DesignerInput): Promise<DesignerResult> {
  try {
    const model = getImageModel();
    const prompt = buildGraphicPrompt(input);

    const result = await withRateLimit(async () => {
      return await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          responseModalities: ['IMAGE', 'TEXT'],
        } as never, // Type assertion needed for image generation config
      });
    });

    // Track token usage
    trackTokens('designer', result);

    const response = result.response;

    // Extract image from response
    const parts = response.candidates?.[0]?.content?.parts;
    if (!parts) {
      throw new Error('No response parts received');
    }

    for (const part of parts) {
      if ('inlineData' in part && part.inlineData) {
        const { data, mimeType } = part.inlineData;
        // Convert base64 to blob
        const byteCharacters = atob(data);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: mimeType });

        return {
          success: true,
          imageBlob: blob,
          description: `Generated graphic: ${input.concept}`,
        };
      }
    }

    // If no image was generated, fall back to placeholder
    console.warn('No image in response, creating placeholder');
    return createPlaceholderGraphic(input);
  } catch (error) {
    console.error('Designer failed:', error);

    // Fall back to placeholder on error
    return createPlaceholderGraphic(input);
  }
}

// Create a placeholder canvas graphic when image generation fails
async function createPlaceholderGraphic(input: DesignerInput): Promise<DesignerResult> {
  const canvas = document.createElement('canvas');
  canvas.width = 1080;
  canvas.height = 1080;
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    return { success: false, error: 'Could not create canvas' };
  }

  // Draw placeholder with brand colors
  ctx.fillStyle = '#f5f0eb'; // Warm beige background
  ctx.fillRect(0, 0, 1080, 1080);

  // Draw border
  ctx.strokeStyle = '#8b7355';
  ctx.lineWidth = 20;
  ctx.strokeRect(40, 40, 1000, 1000);

  // Draw text
  ctx.fillStyle = '#2d3b2d';
  ctx.font = 'bold 48px system-ui, sans-serif';
  ctx.textAlign = 'center';

  // Headline
  if (input.headline) {
    ctx.fillText(input.headline.toUpperCase(), 540, 400);
  }

  // Subtext
  if (input.subtext) {
    ctx.font = '32px system-ui, sans-serif';
    ctx.fillText(input.subtext, 540, 500);
  }

  // Concept description
  ctx.font = 'italic 24px system-ui, sans-serif';
  ctx.fillStyle = '#666';
  const words = input.concept.split(' ');
  let line = '';
  let y = 650;
  for (const word of words) {
    const testLine = line + word + ' ';
    if (ctx.measureText(testLine).width > 800) {
      ctx.fillText(line.trim(), 540, y);
      line = word + ' ';
      y += 35;
      if (y > 900) break;
    } else {
      line = testLine;
    }
  }
  if (line && y <= 900) {
    ctx.fillText(line.trim(), 540, y);
  }

  // Footer
  ctx.font = '20px system-ui, sans-serif';
  ctx.fillStyle = '#999';
  ctx.fillText('VED KANALEN', 540, 1000);

  return new Promise((resolve) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve({
            success: true,
            imageBlob: blob,
            description: `Placeholder graphic: ${input.concept}`,
          });
        } else {
          resolve({ success: false, error: 'Failed to create image blob' });
        }
      },
      'image/png',
      1
    );
  });
}

// Create graphic description (for when we just want text description)
export async function createGraphicDescription(request: GraphicRequest): Promise<{
  success: boolean;
  description?: string;
  error?: string;
}> {
  return {
    success: true,
    description: `Graphic concept: ${request.concept}. Style: ${request.style}. ${
      request.headline ? `Headline: ${request.headline}. ` : ''
    }${request.subtext ? `Subtext: ${request.subtext}.` : ''}`,
  };
}

// Process all graphic requests from the brain plan
export async function processGraphicRequests(
  requests: Array<{ dayNumber: number; request: GraphicRequest }>,
  onProgress?: (current: number, total: number) => void
): Promise<Map<number, { blob: Blob; description: string }>> {
  const results = new Map<number, { blob: Blob; description: string }>();
  let completed = 0;

  for (const { dayNumber, request } of requests) {
    const result = await generateGraphic({
      concept: request.concept,
      headline: request.headline,
      subtext: request.subtext,
      style: request.style,
    });

    completed++;

    if (result.success && result.imageBlob) {
      results.set(dayNumber, {
        blob: result.imageBlob,
        description: result.description || '',
      });
    }

    onProgress?.(completed, requests.length);

    // Delay between requests to avoid rate limits
    if (completed < requests.length) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }

  return results;
}

// Suggest graphic concepts based on post seed/content
export interface GraphicSuggestion {
  postId: string;
  dayNumber: number;
  concept: string;
  headline?: string;
  subtext?: string;
  style: string;
  type: GraphicType;
}

// Analyze a post seed and suggest an appropriate graphic
export function suggestGraphicForPost(
  postId: string,
  dayNumber: number,
  seed: string,
  caption: string
): GraphicSuggestion {
  const seedLower = seed.toLowerCase();

  // Detect countdown/time-related posts
  if (seedLower.includes('dag') || seedLower.includes('countdown') || seedLower.includes('snart')) {
    return {
      postId,
      dayNumber,
      concept: `Countdown graphic showing anticipation for the opening`,
      headline: `Dag ${dayNumber}`,
      subtext: 'Ombygningen fortsætter',
      style: 'Bold typography, warm colors, minimalist',
      type: 'countdown',
    };
  }

  // Detect milestone posts
  if (seedLower.includes('åbning') || seedLower.includes('milestone') || seedLower.includes('fejr')) {
    return {
      postId,
      dayNumber,
      concept: `Milestone celebration graphic`,
      headline: 'Snart klar',
      subtext: 'Ved Kanalen',
      style: 'Celebratory but understated, Scandinavian',
      type: 'milestone',
    };
  }

  // Detect quote/philosophy posts
  if (seedLower.includes('filosofi') || seedLower.includes('tanker') || seedLower.includes('hvorfor')) {
    // Extract a short phrase from caption if possible
    const shortPhrase = extractShortPhrase(caption);
    return {
      postId,
      dayNumber,
      concept: `Quote card with restaurant philosophy`,
      headline: shortPhrase || 'Ved Kanalen',
      style: 'Elegant typography, cream background, minimal',
      type: 'quote',
    };
  }

  // Default: Abstract mood graphic
  return {
    postId,
    dayNumber,
    concept: `Abstract mood graphic representing transformation and anticipation`,
    style: 'Geometric shapes, warm earth tones, Scandinavian minimal',
    type: 'mood',
  };
}

// Helper to extract a short phrase from caption
function extractShortPhrase(caption: string): string | undefined {
  // Look for short sentences (under 40 chars)
  const sentences = caption.split(/[.!?]/).filter((s) => s.trim().length > 5 && s.trim().length < 40);
  const first = sentences[0];
  if (first) {
    return first.trim();
  }
  return undefined;
}

// Generate graphics for multiple posts
export async function generateGraphicsForPosts(
  suggestions: GraphicSuggestion[],
  onProgress?: (current: number, total: number, postId: string) => void
): Promise<Map<string, { blob: Blob; description: string }>> {
  const results = new Map<string, { blob: Blob; description: string }>();
  let completed = 0;

  for (const suggestion of suggestions) {
    const result = await generateGraphic({
      concept: suggestion.concept,
      headline: suggestion.headline,
      subtext: suggestion.subtext,
      style: suggestion.style,
    });

    completed++;

    if (result.success && result.imageBlob) {
      results.set(suggestion.postId, {
        blob: result.imageBlob,
        description: result.description || suggestion.concept,
      });
    }

    onProgress?.(completed, suggestions.length, suggestion.postId);

    // Delay between requests
    if (completed < suggestions.length) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }

  return results;
}

// Export brand colors for use elsewhere
export { BRAND_COLORS };
