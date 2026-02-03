import { create } from 'zustand';
import type { FlexibleGraphicsPost, FlexibleGraphicImage, FlexibleContentType } from '../types';
import {
  saveFlexibleGraphics,
  getFlexibleGraphicsByCampaign,
  deleteFlexibleGraphics,
  updateFlexibleGraphicsImages,
  generateId,
  type StoredFlexibleGraphics,
} from '../lib/database';

interface FlexibleGraphicsState {
  flexiblePosts: FlexibleGraphicsPost[];
  isLoading: boolean;
  isGenerating: boolean;
  generationProgress: { current: number; total: number };
  error: string | null;

  // Actions
  loadFlexiblePosts: (campaignId: string) => Promise<void>;
  addFlexiblePost: (campaignId: string, inputText: string, detectedType: FlexibleContentType) => Promise<FlexibleGraphicsPost>;
  removeFlexiblePost: (id: string) => Promise<void>;
  setImages: (id: string, images: FlexibleGraphicImage[]) => Promise<void>;
  setGenerating: (generating: boolean) => void;
  setGenerationProgress: (current: number, total: number) => void;
  setError: (error: string | null) => void;
}

export const useFlexibleGraphicsStore = create<FlexibleGraphicsState>((set) => ({
  flexiblePosts: [],
  isLoading: false,
  isGenerating: false,
  generationProgress: { current: 0, total: 0 },
  error: null,

  loadFlexiblePosts: async (campaignId: string) => {
    set({ isLoading: true, error: null });
    try {
      const stored = await getFlexibleGraphicsByCampaign(campaignId);
      const flexiblePosts: FlexibleGraphicsPost[] = stored.map((s) => ({
        id: s.id,
        campaignId: s.campaignId,
        inputText: s.inputText,
        detectedType: s.detectedType,
        images: s.images,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
      }));
      set({ flexiblePosts, isLoading: false });
    } catch (err) {
      console.error('Failed to load flexible posts:', err);
      set({ error: 'Failed to load flexible posts', isLoading: false });
    }
  },

  addFlexiblePost: async (campaignId: string, inputText: string, detectedType: FlexibleContentType) => {
    const id = generateId();
    const now = new Date();

    const flexiblePost: FlexibleGraphicsPost = {
      id,
      campaignId,
      inputText,
      detectedType,
      images: [],
      createdAt: now,
      updatedAt: now,
    };

    const stored: StoredFlexibleGraphics = {
      id,
      campaignId,
      inputText,
      detectedType,
      images: [],
      createdAt: now,
      updatedAt: now,
    };

    await saveFlexibleGraphics(stored);

    set((state) => ({
      flexiblePosts: [...state.flexiblePosts, flexiblePost],
    }));

    return flexiblePost;
  },

  removeFlexiblePost: async (id: string) => {
    await deleteFlexibleGraphics(id);
    set((state) => ({
      flexiblePosts: state.flexiblePosts.filter((p) => p.id !== id),
    }));
  },

  setImages: async (id: string, images: FlexibleGraphicImage[]) => {
    await updateFlexibleGraphicsImages(id, images);
    set((state) => ({
      flexiblePosts: state.flexiblePosts.map((p) =>
        p.id === id ? { ...p, images, updatedAt: new Date() } : p
      ),
    }));
  },

  setGenerating: (generating: boolean) => {
    set({ isGenerating: generating });
  },

  setGenerationProgress: (current: number, total: number) => {
    set({ generationProgress: { current, total } });
  },

  setError: (error: string | null) => {
    set({ error });
  },
}));
