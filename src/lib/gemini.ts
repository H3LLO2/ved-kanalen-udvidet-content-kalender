import { GoogleGenerativeAI, GenerativeModel, GenerateContentResult } from '@google/generative-ai';

// Token usage tracking
export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface TokenUsageByAgent {
  eye: TokenUsage;
  brain: TokenUsage;
  voice: TokenUsage;
  designer: TokenUsage;
  total: TokenUsage;
}

// Global token tracker
let tokenUsage: TokenUsageByAgent = {
  eye: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
  brain: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
  voice: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
  designer: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
  total: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
};

export function getTokenUsage(): TokenUsageByAgent {
  return { ...tokenUsage };
}

export function resetTokenUsage(): void {
  tokenUsage = {
    eye: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    brain: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    voice: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    designer: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    total: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
  };
}

export function trackTokens(
  agent: 'eye' | 'brain' | 'voice' | 'designer',
  result: GenerateContentResult
): void {
  const usageMetadata = result.response.usageMetadata;
  if (usageMetadata) {
    const prompt = usageMetadata.promptTokenCount || 0;
    const completion = usageMetadata.candidatesTokenCount || 0;
    const total = prompt + completion;

    tokenUsage[agent].promptTokens += prompt;
    tokenUsage[agent].completionTokens += completion;
    tokenUsage[agent].totalTokens += total;

    tokenUsage.total.promptTokens += prompt;
    tokenUsage.total.completionTokens += completion;
    tokenUsage.total.totalTokens += total;

    console.log(`[${agent}] Tokens: +${total} (prompt: ${prompt}, completion: ${completion})`);
  }
}

// Initialize Gemini client
const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
if (!apiKey) {
  console.error('VITE_GEMINI_API_KEY is not set');
}

const genAI = new GoogleGenerativeAI(apiKey || '');

// Model instances
// Flash for fast, cheap operations (vision analysis)
export function getFlashModel(): GenerativeModel {
  return genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
}

// Pro for high-quality reasoning and writing
export function getProModel(): GenerativeModel {
  return genAI.getGenerativeModel({ model: 'gemini-2.5-pro' });
}

// Image generation model
export function getImageModel(): GenerativeModel {
  return genAI.getGenerativeModel({ model: 'gemini-3-pro-image-preview' });
}

// Robust JSON extraction from AI response
export function extractJson<T>(text: string): T {
  // Try direct parse first
  try {
    return JSON.parse(text);
  } catch {
    // Continue to extraction methods
  }

  // Remove markdown code blocks
  let cleaned = text;

  // Handle ```json ... ``` blocks
  const jsonBlockMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonBlockMatch && jsonBlockMatch[1]) {
    cleaned = jsonBlockMatch[1].trim();
    try {
      return JSON.parse(cleaned);
    } catch {
      // Continue
    }
  }

  // Find JSON object/array in the text
  const jsonObjectMatch = cleaned.match(/\{[\s\S]*\}/);
  if (jsonObjectMatch) {
    try {
      return JSON.parse(jsonObjectMatch[0]);
    } catch {
      // Continue
    }
  }

  const jsonArrayMatch = cleaned.match(/\[[\s\S]*\]/);
  if (jsonArrayMatch) {
    try {
      return JSON.parse(jsonArrayMatch[0]);
    } catch {
      // Continue
    }
  }

  throw new Error(`Failed to extract JSON from response: ${text.substring(0, 200)}...`);
}

// Rate limiting helper
export async function withRateLimit<T>(
  fn: () => Promise<T>,
  retries = 3,
  baseDelay = 1000
): Promise<T> {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      return await fn();
    } catch (error: unknown) {
      const isRateLimit =
        error instanceof Error &&
        (error.message.includes('429') || error.message.includes('RESOURCE_EXHAUSTED'));

      if (isRateLimit && attempt < retries - 1) {
        const delay = baseDelay * Math.pow(2, attempt);
        console.log(`Rate limited, retrying in ${delay}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      } else {
        throw error;
      }
    }
  }
  throw new Error('Max retries exceeded');
}
