import { create } from 'zustand';
import type { EventGraphicsPost, EventGraphicImage } from '../types';
import {
  saveEventGraphics,
  getEventGraphicsByCampaign,
  deleteEventGraphics,
  updateEventGraphicsImages,
  generateId,
  type StoredEventGraphics,
} from '../lib/database';

interface EventGraphicsState {
  eventPosts: EventGraphicsPost[];
  isLoading: boolean;
  isGenerating: boolean;
  generationProgress: { current: number; total: number };
  error: string | null;

  // Actions
  loadEventPosts: (campaignId: string) => Promise<void>;
  addEventPost: (campaignId: string, postText: string, eventContext: string) => Promise<EventGraphicsPost>;
  removeEventPost: (id: string) => Promise<void>;
  setImages: (id: string, images: EventGraphicImage[]) => Promise<void>;
  setGenerating: (generating: boolean) => void;
  setGenerationProgress: (current: number, total: number) => void;
  setError: (error: string | null) => void;
}

export const useEventGraphicsStore = create<EventGraphicsState>((set) => ({
  eventPosts: [],
  isLoading: false,
  isGenerating: false,
  generationProgress: { current: 0, total: 0 },
  error: null,

  loadEventPosts: async (campaignId: string) => {
    set({ isLoading: true, error: null });
    try {
      const stored = await getEventGraphicsByCampaign(campaignId);
      const eventPosts: EventGraphicsPost[] = stored.map((s) => ({
        id: s.id,
        campaignId: s.campaignId,
        postText: s.postText,
        eventContext: s.eventContext,
        images: s.images,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
      }));
      set({ eventPosts, isLoading: false });
    } catch (err) {
      console.error('Failed to load event posts:', err);
      set({ error: 'Failed to load event posts', isLoading: false });
    }
  },

  addEventPost: async (campaignId: string, postText: string, eventContext: string) => {
    const id = generateId();
    const now = new Date();

    const eventPost: EventGraphicsPost = {
      id,
      campaignId,
      postText,
      eventContext,
      images: [],
      createdAt: now,
      updatedAt: now,
    };

    const stored: StoredEventGraphics = {
      id,
      campaignId,
      postText,
      eventContext,
      images: [],
      createdAt: now,
      updatedAt: now,
    };

    await saveEventGraphics(stored);

    set((state) => ({
      eventPosts: [...state.eventPosts, eventPost],
    }));

    return eventPost;
  },

  removeEventPost: async (id: string) => {
    await deleteEventGraphics(id);
    set((state) => ({
      eventPosts: state.eventPosts.filter((p) => p.id !== id),
    }));
  },

  setImages: async (id: string, images: EventGraphicImage[]) => {
    await updateEventGraphicsImages(id, images);
    set((state) => ({
      eventPosts: state.eventPosts.map((p) =>
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
