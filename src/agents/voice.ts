/**
 * The Voice - Danish Copywriting Agent
 * Now uses Claude Code via backend API instead of Gemini
 */

import { BRAND_CONTEXT } from '../lib/brandContext';
import type { Phase, HookType, CTAType } from '../types';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3002';

interface VoiceInput {
  seed: string;
  imageContext: string;
  previousPost?: string;
  phase: Phase;
  hookType?: HookType;
  ctaType?: CTAType;
  dayNumber: number;
}

interface VoiceResult {
  success: boolean;
  caption?: string;
  error?: string;
}

export async function writeCaption(input: VoiceInput): Promise<VoiceResult> {
  try {
    const response = await fetch(`${API_BASE}/api/voice`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        seed: input.seed,
        imageContext: input.imageContext,
        previousPost: input.previousPost,
        phase: input.phase,
        hookType: input.hookType,
        ctaType: input.ctaType,
        dayNumber: input.dayNumber,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `HTTP ${response.status}`);
    }

    const data = await response.json();

    if (!data.success) {
      throw new Error(data.error || 'Caption generation failed');
    }

    let caption = data.caption || '';

    // Clean up any markdown that slipped through
    caption = cleanCaption(caption);

    // Validate forbidden words
    const forbidden = checkForbiddenWords(caption);
    if (forbidden.length > 0) {
      console.warn('Caption contains forbidden words:', forbidden);
      caption = fixForbiddenWords(caption);
    }

    return {
      success: true,
      caption,
    };
  } catch (error) {
    console.error('Voice caption failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

function cleanCaption(text: string): string {
  let cleaned = text
    // Remove any preamble lines like "Here's the caption:" or "Caption:"
    .replace(/^(Here'?s?\s*(the\s*)?(caption|post|text|draft)[:\s]*\n?)/i, '')
    .replace(/^(Caption|Post|Draft|Option\s*\d*)[:\s]*\n?/gim, '')
    // Remove "Alternative:" or "Option 1/2/3:" style prefixes
    .replace(/^(Alternative|Option|Version)\s*\d*[:\s]*/gim, '')
    // Remove wrapping quotes
    .replace(/^["']|["']$/g, '')
    // Remove markdown bold
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    // Remove markdown italic
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    // Remove markdown headers
    .replace(/^#+\s+/gm, '')
    // Remove em-dashes
    .replace(/—/g, ' - ')
    .replace(/–/g, ' - ')
    // Remove any trailing notes like "Note:" or explanations
    .replace(/\n\n(Note|PS|P\.S\.|NB|Bemærk)[:\s].*/gis, '')
    // Clean up extra whitespace but preserve paragraph breaks
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  // If text still starts with a label/prefix after first line, remove first line
  const firstLine = cleaned.split('\n')[0];
  if (firstLine && /^(dag|day|post|caption|option|version)\s*\d*[:\s]/i.test(firstLine)) {
    cleaned = cleaned.substring(firstLine.length).trim();
  }

  return cleaned;
}

function checkForbiddenWords(text: string): string[] {
  const lower = text.toLowerCase();
  return BRAND_CONTEXT.forbiddenWords.filter((word) => lower.includes(word.toLowerCase()));
}

function fixForbiddenWords(text: string): string {
  const replacements: Record<string, string> = {
    lækker: 'god',
    lækre: 'gode',
    lækkert: 'godt',
    fedmefuld: 'fyldig',
    mundvandsdrivende: 'appetitlig',
    udsøgt: 'fin',
    ypperlig: 'god',
    magisk: 'speciel',
    vidunderlig: 'dejlig',
    velsmagende: 'god',
    smagsoplevelse: 'smag',
    verdensklasse: 'rigtig god',
    'gastronomisk rejse': 'madoplevelse',
    forkælelse: 'noget godt',
    'forkæl dig selv': 'gør dig selv en tjeneste',
    eksklusiv: 'særlig',
    eksklusive: 'særlige',
    perfekt: 'rigtig god',
    fantastisk: 'virkelig god',
    unik: 'anderledes',
    unikt: 'anderledes',
    kulinarisk: 'gastronomisk',
  };

  let result = text;
  for (const [forbidden, replacement] of Object.entries(replacements)) {
    const regex = new RegExp(forbidden, 'gi');
    result = result.replace(regex, replacement);
  }
  return result;
}

// Write all captions sequentially
export async function writeAllCaptions(
  plans: Array<{
    dayNumber: number;
    seed: string;
    imageContext: string;
    hookType?: HookType;
    ctaType?: CTAType;
  }>,
  phase: Phase,
  onProgress?: (current: number, total: number, caption: string) => void
): Promise<{ captions: Map<number, string>; errors: Array<{ day: number; error: string }> }> {
  const captions = new Map<number, string>();
  const errors: Array<{ day: number; error: string }> = [];
  let previousPost: string | undefined;
  let completed = 0;

  for (const plan of plans) {
    const result = await writeCaption({
      seed: plan.seed,
      imageContext: plan.imageContext,
      previousPost,
      phase,
      hookType: plan.hookType,
      ctaType: plan.ctaType,
      dayNumber: plan.dayNumber,
    });

    completed++;

    if (result.success && result.caption) {
      captions.set(plan.dayNumber, result.caption);
      previousPost = result.caption;
      onProgress?.(completed, plans.length, result.caption);
    } else {
      errors.push({ day: plan.dayNumber, error: result.error || 'Unknown error' });
      // Use placeholder
      const placeholder = `[Dag ${plan.dayNumber}] Caption generering fejlede. Seed: ${plan.seed}`;
      captions.set(plan.dayNumber, placeholder);
    }

    // Small delay between requests (Claude Code is slower, so less aggressive)
    if (completed < plans.length) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }

  return { captions, errors };
}
