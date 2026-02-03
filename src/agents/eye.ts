import { getFlashModel, extractJson, withRateLimit, trackTokens } from '../lib/gemini';
import { blobToBase64 } from '../lib/heic';
import type { EyeOutput } from '../types';
import pLimit from 'p-limit';

// Simple, focused prompt that works well
const EYE_PROMPT = `Analyze this image for a social media content orchestrator.
Output ONLY valid JSON.
Structure:
{
  "content": "Detailed visual description...",
  "mood": "The emotional vibe (e.g. Chaotic, Authentic, Premium)...",
  "strategicFit": "How this fits a rebranding strategy (e.g. Physical Transformation, Team, Food Lab)..."
}`;

interface EyeResult {
  success: boolean;
  output?: EyeOutput;
  error?: string;
}

export async function analyzeImage(imageId: string, blob: Blob): Promise<EyeResult> {
  try {
    const model = getFlashModel();
    const base64 = await blobToBase64(blob);

    // Remove the data URL prefix to get raw base64
    const base64Parts = base64.split(',');
    const base64Data = base64Parts[1] || base64Parts[0] || '';
    const mimeType = blob.type || 'image/jpeg';

    const result = await withRateLimit(async () => {
      return await model.generateContent([
        EYE_PROMPT,
        {
          inlineData: {
            data: base64Data,
            mimeType,
          },
        },
      ]);
    });

    // Track token usage
    trackTokens('eye', result);

    const response = result.response;
    const text = response.text();

    const parsed = extractJson<{ content: string; mood: string; strategicFit: string }>(text);

    return {
      success: true,
      output: {
        id: imageId,
        content: parsed.content,
        mood: parsed.mood,
        strategicFit: parsed.strategicFit,
      },
    };
  } catch (error) {
    console.error(`Eye analysis failed for image ${imageId}:`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

interface AnalyzeAllResult {
  analyses: EyeOutput[];
  failed: { id: string; error: string }[];
}

export async function analyzeAllImages(
  images: { id: string; blob: Blob }[],
  onProgress?: (current: number, total: number) => void
): Promise<AnalyzeAllResult> {
  const analyses: EyeOutput[] = [];
  const failed: { id: string; error: string }[] = [];

  // Limit concurrent requests
  const limit = pLimit(3);
  let completed = 0;

  const promises = images.map((img) =>
    limit(async () => {
      const result = await analyzeImage(img.id, img.blob);
      completed++;
      onProgress?.(completed, images.length);

      if (result.success && result.output) {
        analyses.push(result.output);
      } else {
        failed.push({ id: img.id, error: result.error || 'Unknown error' });
        // Create placeholder analysis for failed images
        analyses.push({
          id: img.id,
          content: 'Image analysis failed - requires manual description',
          mood: 'Unknown',
          strategicFit: 'Needs review',
        });
      }
    })
  );

  await Promise.all(promises);

  return { analyses, failed };
}
