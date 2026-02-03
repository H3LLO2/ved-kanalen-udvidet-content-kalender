import { create } from 'zustand';
import type { MenuExempt, MenuExemptImage } from '../types';
import {
  saveMenuExempt,
  getMenuExemptsByCampaign,
  deleteMenuExempt,
  updateMenuExemptImages,
  generateId,
  type StoredMenuExempt,
} from '../lib/database';

interface MenuExemptState {
  menuExempts: MenuExempt[];
  isLoading: boolean;
  isGenerating: boolean;
  generationProgress: { current: number; total: number };
  error: string | null;

  // Actions
  loadMenuExempts: (campaignId: string) => Promise<void>;
  addMenuExempt: (campaignId: string, description: string) => Promise<MenuExempt>;
  removeMenuExempt: (id: string) => Promise<void>;
  setImages: (id: string, images: MenuExemptImage[]) => Promise<void>;
  setGenerating: (generating: boolean) => void;
  setGenerationProgress: (current: number, total: number) => void;
  setError: (error: string | null) => void;
}

export const useMenuExemptStore = create<MenuExemptState>((set) => ({
  menuExempts: [],
  isLoading: false,
  isGenerating: false,
  generationProgress: { current: 0, total: 0 },
  error: null,

  loadMenuExempts: async (campaignId: string) => {
    set({ isLoading: true, error: null });
    try {
      const stored = await getMenuExemptsByCampaign(campaignId);
      const menuExempts: MenuExempt[] = stored.map((s) => ({
        id: s.id,
        campaignId: s.campaignId,
        description: s.description,
        images: s.images,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
      }));
      set({ menuExempts, isLoading: false });
    } catch (err) {
      console.error('Failed to load menu exempts:', err);
      set({ error: 'Failed to load menu exempts', isLoading: false });
    }
  },

  addMenuExempt: async (campaignId: string, description: string) => {
    const id = generateId();
    const now = new Date();

    const menuExempt: MenuExempt = {
      id,
      campaignId,
      description,
      images: [],
      createdAt: now,
      updatedAt: now,
    };

    const stored: StoredMenuExempt = {
      id,
      campaignId,
      description,
      images: [],
      createdAt: now,
      updatedAt: now,
    };

    await saveMenuExempt(stored);

    set((state) => ({
      menuExempts: [...state.menuExempts, menuExempt],
    }));

    return menuExempt;
  },

  removeMenuExempt: async (id: string) => {
    await deleteMenuExempt(id);
    set((state) => ({
      menuExempts: state.menuExempts.filter((m) => m.id !== id),
    }));
  },

  setImages: async (id: string, images: MenuExemptImage[]) => {
    await updateMenuExemptImages(id, images);
    set((state) => ({
      menuExempts: state.menuExempts.map((m) =>
        m.id === id ? { ...m, images, updatedAt: new Date() } : m
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
