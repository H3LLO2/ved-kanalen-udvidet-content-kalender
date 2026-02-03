import { create } from 'zustand';
import type { GenerationStage, EyeOutput, BrainOutput, Post } from '../types';
import { getTokenUsage, resetTokenUsage, type TokenUsageByAgent } from '../lib/gemini';
import {
  saveAnalysis,
  saveBrainPlan,
  savePosts,
  getAllAnalysesForCampaign,
  getPostsByRun,
  getRunNumbersForCampaign,
  getNextRunNumber,
  getBrainPlanByCampaign,
  generateId,
  type StoredAnalysis,
  type StoredPost,
  type StoredBrainPlan,
} from '../lib/database';

interface GenerationState {
  stage: GenerationStage;
  currentStep: number;
  totalSteps: number;
  message: string;
  analyses: EyeOutput[];
  brainPlan: BrainOutput | null;
  posts: Post[];
  error: string | null;

  // Run versioning
  availableRuns: number[];      // [3, 2, 1] - newest first
  currentRun: number;           // Currently viewing run
  currentRunId: string | null;  // ID for current generation

  // Token usage
  tokenUsage: TokenUsageByAgent | null;

  // Actions
  setStage: (stage: GenerationStage, message?: string) => void;
  setProgress: (current: number, total: number, message: string) => void;
  setError: (error: string) => void;
  reset: () => void;
  refreshTokenUsage: () => void;

  // Data actions
  addAnalysis: (analysis: EyeOutput) => Promise<void>;
  setBrainPlan: (plan: BrainOutput, campaignId: string) => Promise<void>;
  addPost: (post: Post) => Promise<void>;
  setPosts: (posts: Post[], campaignId: string, runNumber: number, runId: string) => Promise<void>;
  updatePost: (id: string, updates: Partial<Post>) => void;

  // Run management
  setCurrentRun: (runNumber: number) => void;
  startNewRun: (campaignId: string) => Promise<number>;
  loadRunPosts: (campaignId: string, runNumber: number) => Promise<void>;

  // Load existing data
  loadGeneratedContent: (campaignId: string) => Promise<void>;
}

export const useGenerationStore = create<GenerationState>((set, get) => ({
  stage: 'idle',
  currentStep: 0,
  totalSteps: 0,
  message: '',
  analyses: [],
  brainPlan: null,
  posts: [],
  error: null,

  // Run versioning
  availableRuns: [],
  currentRun: 1,
  currentRunId: null,

  // Token usage
  tokenUsage: null,

  refreshTokenUsage: () => {
    set({ tokenUsage: getTokenUsage() });
  },

  setStage: (stage, message = '') => {
    set({ stage, message, error: null });
  },

  setProgress: (current, total, message) => {
    set({ currentStep: current, totalSteps: total, message });
  },

  setError: (error) => {
    set({ stage: 'error', error });
  },

  reset: () => {
    resetTokenUsage();
    set({
      stage: 'idle',
      currentStep: 0,
      totalSteps: 0,
      message: '',
      analyses: [],
      brainPlan: null,
      posts: [],
      error: null,
      tokenUsage: null,
    });
  },

  addAnalysis: async (analysis: EyeOutput) => {
    const stored: StoredAnalysis = {
      id: analysis.id,
      imageId: analysis.id, // EyeOutput id is the image id
      content: analysis.content,
      mood: analysis.mood,
      strategicFit: analysis.strategicFit,
      createdAt: new Date(),
    };
    await saveAnalysis(stored);

    set((state) => ({
      analyses: [...state.analyses, analysis],
    }));
  },

  setBrainPlan: async (plan: BrainOutput, campaignId: string) => {
    const stored: StoredBrainPlan = {
      id: generateId(),
      campaignId,
      thoughts: plan.thoughts,
      plan: plan.plan,
      createdAt: new Date(),
    };
    await saveBrainPlan(stored);
    set({ brainPlan: plan });
  },

  addPost: async (post: Post) => {
    const state = get();
    const stored: StoredPost = {
      id: post.id,
      campaignId: post.campaignId,
      runId: state.currentRunId || generateId(),
      runNumber: state.currentRun,
      dayNumber: post.dayNumber,
      caption: post.caption,
      postingTime: post.postingTime,
      seed: post.seed,
      reasoning: post.reasoning,
      status: post.status,
      imageIds: post.imageIds,
      createdAt: post.createdAt,
      updatedAt: post.updatedAt,
    };
    await savePosts([stored]);

    set((state) => ({
      posts: [...state.posts, post],
    }));
  },

  setPosts: async (posts: Post[], campaignId: string, runNumber: number, runId: string) => {
    const storedPosts: StoredPost[] = posts.map((post) => ({
      id: post.id,
      campaignId,
      runId,
      runNumber,
      dayNumber: post.dayNumber,
      caption: post.caption,
      hashtags: post.hashtags,
      postingTime: post.postingTime,
      seed: post.seed,
      reasoning: post.reasoning,
      status: post.status,
      imageIds: post.imageIds,
      createdAt: post.createdAt,
      updatedAt: post.updatedAt,
    }));

    await savePosts(storedPosts);

    // Update available runs
    const state = get();
    const newAvailableRuns = state.availableRuns.includes(runNumber)
      ? state.availableRuns
      : [runNumber, ...state.availableRuns].sort((a, b) => b - a);

    set({
      posts,
      currentRun: runNumber,
      availableRuns: newAvailableRuns,
    });
  },

  updatePost: (id: string, updates: Partial<Post>) => {
    set((state) => ({
      posts: state.posts.map((p) =>
        p.id === id ? { ...p, ...updates, updatedAt: new Date() } : p
      ),
    }));
  },

  // Run management
  setCurrentRun: (runNumber: number) => {
    set({ currentRun: runNumber });
  },

  startNewRun: async (campaignId: string) => {
    const nextRun = await getNextRunNumber(campaignId);
    const runId = generateId();
    set({
      currentRun: nextRun,
      currentRunId: runId,
      posts: [],
    });
    return nextRun;
  },

  loadRunPosts: async (campaignId: string, runNumber: number) => {
    const storedPosts = await getPostsByRun(campaignId, runNumber);
    const posts: Post[] = storedPosts.map((p) => ({
      id: p.id,
      campaignId: p.campaignId,
      dayNumber: p.dayNumber,
      caption: p.caption,
      hashtags: p.hashtags,
      postingTime: p.postingTime,
      seed: p.seed,
      reasoning: p.reasoning,
      status: p.status,
      imageIds: p.imageIds,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    }));
    set({ posts, currentRun: runNumber });
  },

  loadGeneratedContent: async (campaignId: string) => {
    try {
      // Load analyses
      const storedAnalyses = await getAllAnalysesForCampaign(campaignId);
      const analyses: EyeOutput[] = storedAnalyses.map((a) => ({
        id: a.imageId,
        content: a.content,
        mood: a.mood,
        strategicFit: a.strategicFit,
      }));

      // Load brain plan
      const storedPlan = await getBrainPlanByCampaign(campaignId);
      const brainPlan: BrainOutput | null = storedPlan
        ? { thoughts: storedPlan.thoughts, plan: storedPlan.plan }
        : null;

      // Load available runs
      const availableRuns = await getRunNumbersForCampaign(campaignId);
      const latestRun = availableRuns[0];
      const currentRun: number = latestRun !== undefined ? latestRun : 1;

      // Load posts for the latest run
      const storedPosts = latestRun !== undefined
        ? await getPostsByRun(campaignId, currentRun)
        : [];

      const posts: Post[] = storedPosts.map((p) => ({
        id: p.id,
        campaignId: p.campaignId,
        dayNumber: p.dayNumber,
        caption: p.caption,
        hashtags: p.hashtags,
        postingTime: p.postingTime,
        seed: p.seed,
        reasoning: p.reasoning,
        status: p.status,
        imageIds: p.imageIds,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
      }));

      set({ analyses, brainPlan, posts, availableRuns, currentRun });
    } catch (err) {
      console.error('Failed to load generated content:', err);
    }
  },
}));
