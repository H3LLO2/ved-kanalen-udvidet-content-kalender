/**
 * The Eye - Vision Analysis Agent
 * Now uses Claude Code via backend API instead of Gemini
 */

import { blobToBase64 } from '../lib/heic';
import type { EyeOutput } from '../types';
import pLimit from 'p-limit';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3002';

interface EyeResult {
  success: boolean;
  output?: EyeOutput;
  error?: string;
}

export async function analyzeImage(imageId: string, blob: Blob): Promise<EyeResult> {
  try {
    const base64 = await blobToBase64(blob);
    
    // Remove the data URL prefix to get raw base64
    const base64Parts = base64.split(',');
    const base64Data = base64Parts[1] || base64Parts[0] || '';
    const mimeType = blob.type || 'image/jpeg';

    const response = await fetch(`${API_BASE}/api/eye`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        imageBase64: base64Data,
        mimeType,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `HTTP ${response.status}`);
    }

    const data = await response.json();

    if (!data.success) {
      throw new Error(data.error || 'Analysis failed');
    }

    const analysis = data.analysis;

    return {
      success: true,
      output: {
        id: imageId,
        content: analysis.content || 'No content description',
        mood: analysis.mood || 'Unknown',
        strategicFit: analysis.strategicFit || 'Needs review',
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

  // Limit concurrent requests (Claude Code is slower, use lower concurrency)
  const limit = pLimit(2);
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
