/**
 * The Brain - Strategic Planning Agent
 * Now uses Claude Code via backend API instead of Gemini
 */

import { buildManifest, getPhaseStrategy, type EstablishmentSegment } from '../lib/brandContext';
import { getMenuContext } from '../lib/menu';
import { getPostingTimeGuidance } from '../lib/calendar';
import type { EyeOutput, BrainOutput, Phase, DayPlan } from '../types';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3002';

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
    const response = await fetch(`${API_BASE}/api/brain`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        imageAnalyses: analyses.map(a => ({
          id: a.id,
          content: a.content,
          mood: a.mood,
          strategicFit: a.strategicFit,
        })),
        phase,
        targetDays,
        segment,
        previousHistory: history,
        // Include brand context for better planning
        brandContext: {
          manifest: buildManifest(),
          strategy: getPhaseStrategy(phase, segment),
          menuContext: (phase === 'LAUNCH' || phase === 'ESTABLISHMENT') ? getMenuContext() : null,
          postingTimes: getPostingTimeGuidance(),
        },
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `HTTP ${response.status}`);
    }

    const data = await response.json();

    if (!data.success) {
      throw new Error(data.error || 'Planning failed');
    }

    const plan = data.plan;

    // Validate plan structure
    if (!plan.thoughts || !Array.isArray(plan.plan)) {
      throw new Error('Invalid plan structure returned');
    }

    // Log if not all images were used
    const usedIds = new Set(plan.plan.flatMap((p: DayPlan) => p.imageIds || []));
    const allIds = new Set(analyses.map((a) => a.id));
    const missingIds = [...allIds].filter((id) => !usedIds.has(id));

    if (missingIds.length > 0) {
      console.warn(`Brain skipped ${missingIds.length} images (likely duplicates or extras)`);
    }

    // Ensure we have exactly the target days - trim if Brain over-planned
    if (plan.plan.length > targetDays) {
      console.warn(`Brain created ${plan.plan.length} days, trimming to ${targetDays}`);
      plan.plan = plan.plan.slice(0, targetDays);
    }

    return {
      success: true,
      output: {
        thoughts: plan.thoughts,
        plan: plan.plan,
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
